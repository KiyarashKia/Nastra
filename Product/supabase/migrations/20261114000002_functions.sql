-- NASTRA — read functions used by the tool gateway.
-- These are deterministic. The model never calls SQL; the gateway calls these.

-- Personal resting baseline.
-- "Resting" = awake, low activity (0.08–0.30). Excludes sleep, exercise and the
-- 60-min post-exercise recovery window (activity 0.35 in the simulation).
-- Excludes the last 24 h so a current episode can't shift its own baseline.
create or replace function public.vitals_baseline(
  p_crew_id text,
  p_as_of   timestamptz default now(),
  p_days    int default 14
)
returns table (
  n bigint,
  hr_mean numeric,  hr_sd numeric,
  hrv_mean numeric, hrv_sd numeric,
  spo2_mean numeric, spo2_sd numeric,
  resp_mean numeric, resp_sd numeric,
  temp_mean numeric, temp_sd numeric,
  sys_mean numeric,  sys_sd numeric,
  dia_mean numeric,  dia_sd numeric
)
language sql stable
set search_path = public
as $$
  select
    count(*),
    round(avg(heart_rate_bpm), 1), round(stddev_samp(heart_rate_bpm), 1),
    round(avg(hrv_rmssd_ms), 1),   round(stddev_samp(hrv_rmssd_ms), 1),
    round(avg(spo2_pct), 1),       round(stddev_samp(spo2_pct), 2),
    round(avg(resp_rate_bpm), 1),  round(stddev_samp(resp_rate_bpm), 1),
    round(avg(skin_temp_c), 2),    round(stddev_samp(skin_temp_c), 2),
    round(avg(systolic_mmhg), 1),  round(stddev_samp(systolic_mmhg), 1),
    round(avg(diastolic_mmhg), 1), round(stddev_samp(diastolic_mmhg), 1)
  from public.vitals
  where crew_id = p_crew_id
    and ts >= p_as_of - make_interval(days => p_days)
    and ts <  p_as_of - interval '24 hours'
    and activity_level between 0.08 and 0.30;
$$;

-- Recent window vs personal baseline, per metric.
-- z_score is a STATISTICAL deviation from this person's own baseline,
-- not a clinical threshold. The UI must label it that way.
create or replace function public.vitals_deviation(
  p_crew_id         text,
  p_as_of           timestamptz default now(),
  p_window_minutes  int default 30,
  p_baseline_days   int default 14
)
returns table (
  metric text, recent_mean numeric, baseline_mean numeric, baseline_sd numeric,
  z_score numeric, n_recent bigint, n_baseline bigint
)
language sql stable
set search_path = public
as $$
  with b as (
    select * from public.vitals_baseline(p_crew_id, p_as_of, p_baseline_days)
  ),
  r as (
    select count(*) as n,
           avg(heart_rate_bpm) as hr, avg(hrv_rmssd_ms) as hrv, avg(spo2_pct) as spo2,
           avg(resp_rate_bpm) as resp, avg(skin_temp_c) as temp,
           avg(systolic_mmhg) as sys, avg(diastolic_mmhg) as dia
    from public.vitals
    where crew_id = p_crew_id
      and ts >  p_as_of - make_interval(mins => p_window_minutes)
      and ts <= p_as_of
  )
  select m.metric,
         round(m.recent, 1),
         m.bmean,
         m.bsd,
         case when m.bsd > 0 then round((m.recent - m.bmean) / m.bsd, 2) end,
         r.n,
         b.n
  from b, r,
  lateral (values
    ('heart_rate_bpm',  r.hr::numeric,   b.hr_mean,   b.hr_sd),
    ('hrv_rmssd_ms',    r.hrv::numeric,  b.hrv_mean,  b.hrv_sd),
    ('spo2_pct',        r.spo2::numeric, b.spo2_mean, b.spo2_sd),
    ('resp_rate_bpm',   r.resp::numeric, b.resp_mean, b.resp_sd),
    ('skin_temp_c',     r.temp::numeric, b.temp_mean, b.temp_sd),
    ('systolic_mmhg',   r.sys::numeric,  b.sys_mean,  b.sys_sd),
    ('diastolic_mmhg',  r.dia::numeric,  b.dia_mean,  b.dia_sd)
  ) as m(metric, recent, bmean, bsd);
$$;

-- Context-matched comparison: if the crew member exercised recently, compare
-- the current window with THEIR OWN vitals at the same minutes-after-exercise
-- on previous days. "Your HR 30 min after exercise is usually X; today Y."
-- Returns no rows if the last exercise ended more than 3 h ago.
create or replace function public.post_exercise_comparison(
  p_crew_id         text,
  p_as_of           timestamptz default now(),
  p_window_minutes  int default 30,
  p_days            int default 14
)
returns table (
  minutes_since_exercise numeric, metric text, recent_mean numeric,
  typical_mean numeric, typical_sd numeric, z_score numeric,
  n_recent bigint, n_typical bigint
)
language sql stable
set search_path = public
as $$
  with w as (
    select max(ends_at) as ex_end,
           extract(epoch from p_as_of - max(ends_at)) / 60 as m
    from public.mission_events
    where crew_id = p_crew_id and activity = 'exercise' and ends_at <= p_as_of
  ),
  win as (
    select ex_end, m, greatest(0, m - p_window_minutes) as m_from from w where m <= 180
  ),
  recent as (
    select count(*) as n, avg(heart_rate_bpm) as hr, avg(hrv_rmssd_ms) as hrv,
           avg(systolic_mmhg) as sys, avg(diastolic_mmhg) as dia
    from public.vitals v, win
    where v.crew_id = p_crew_id
      and v.ts >  win.ex_end + win.m_from * interval '1 minute'
      and v.ts <= p_as_of
  ),
  typical as (
    select count(*) as n,
           avg(v.heart_rate_bpm) as hr,  stddev_samp(v.heart_rate_bpm) as hr_sd,
           avg(v.hrv_rmssd_ms)   as hrv, stddev_samp(v.hrv_rmssd_ms)   as hrv_sd,
           avg(v.systolic_mmhg)  as sys, stddev_samp(v.systolic_mmhg)  as sys_sd,
           avg(v.diastolic_mmhg) as dia, stddev_samp(v.diastolic_mmhg) as dia_sd
    from win
    join public.mission_events pe
      on pe.crew_id = p_crew_id and pe.activity = 'exercise'
     and pe.ends_at < win.ex_end - interval '12 hours'
     and pe.ends_at >= p_as_of - make_interval(days => p_days)
    join public.vitals v
      on v.crew_id = p_crew_id
     and v.ts >  pe.ends_at + win.m_from * interval '1 minute'
     and v.ts <= pe.ends_at + win.m * interval '1 minute'
  )
  select round(win.m, 0), x.metric, round(x.recent, 1), round(x.tmean, 1), round(x.tsd, 1),
         case when x.tsd > 0 then round((x.recent - x.tmean) / x.tsd, 2) end,
         recent.n, typical.n
  from win, recent, typical,
  lateral (values
    ('heart_rate_bpm', recent.hr::numeric,  typical.hr::numeric,  typical.hr_sd::numeric),
    ('hrv_rmssd_ms',   recent.hrv::numeric, typical.hrv::numeric, typical.hrv_sd::numeric),
    ('systolic_mmhg',  recent.sys::numeric, typical.sys::numeric, typical.sys_sd::numeric),
    ('diastolic_mmhg', recent.dia::numeric, typical.dia::numeric, typical.dia_sd::numeric)
  ) as x(metric, recent, tmean, tsd);
$$;

-- Structured (explainable) similar-episode search. No vectors here on purpose:
-- every match says WHY it matched.
create or replace function public.similar_episodes(
  p_crew_id          text,
  p_body_system      text default null,
  p_domain           text default null,
  p_mission_context  text default null,
  p_before           timestamptz default now(),
  p_limit            int default 5
)
returns table (
  id uuid, opened_at timestamptz, utterance text, domain text, symptoms jsonb,
  mission_context text, protocol_id text, outcome text, outcome_notes text,
  context_snapshot jsonb, match_score int, matched_on text[]
)
language sql stable
set search_path = public
as $$
  select * from (
    select
      he.id, he.opened_at, he.utterance, he.domain, he.symptoms,
      he.mission_context, he.protocol_id, he.outcome, he.outcome_notes,
      he.context_snapshot,
      ( case when p_body_system is not null
              and he.symptoms @> jsonb_build_array(jsonb_build_object('body_system', p_body_system))
             then 2 else 0 end
      + case when p_domain is not null and he.domain = p_domain then 1 else 0 end
      + case when p_mission_context is not null and he.mission_context = p_mission_context then 1 else 0 end
      )::int as match_score,
      array_remove(array[
        case when p_body_system is not null
              and he.symptoms @> jsonb_build_array(jsonb_build_object('body_system', p_body_system))
             then 'body_system' end,
        case when p_domain is not null and he.domain = p_domain then 'domain' end,
        case when p_mission_context is not null and he.mission_context = p_mission_context then 'mission_context' end
      ], null) as matched_on
    from public.health_events he
    where he.crew_id = p_crew_id
      and he.opened_at < p_before
      and he.status in ('resolved','escalated')
  ) s
  where s.match_score > 0
  order by s.match_score desc, s.opened_at desc
  limit p_limit;
$$;

-- Knowledge retrieval: FILTER by protocol-allowed tags first (deterministic),
-- then RANK by vector similarity inside that set.
create or replace function public.match_knowledge(
  query_embedding  extensions.vector(384),
  allowed_tags     text[],
  match_count      int default 5
)
returns table (
  id bigint, source_org text, source_name text, source_url text, section text,
  content text, tags text[], similarity double precision
)
language sql stable
set search_path = public, extensions
as $$
  select k.id, k.source_org, k.source_name, k.source_url, k.section, k.content, k.tags,
         1 - (k.embedding <=> query_embedding) as similarity
  from public.knowledge_snippets k
  where k.embedding is not null
    and k.tags && allowed_tags
  order by k.embedding <=> query_embedding
  limit match_count;
$$;
