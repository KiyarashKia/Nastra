-- NASTRA — simulated mission data generator.
--
--   select public.nastra_reseed();            -- anchor = now()
--   select public.nastra_reseed('2026-11-21 21:00Z');
--
-- WIPES all crew data (including live events) and regenerates 21 days of
-- simulated data relative to the anchor. Run it right before a demo so
-- "now" in the story is the real now. Knowledge snippets are not touched.
--
-- Station clock: the anchor is 16:00 station time on mission day 42.
--
-- Planted demo story (crew_02, R. Tanaka):
--   • Two past episodes of disorientation 20–25 min after exercise, both on
--     short-sleep days with high morning stress, both resolved with rest.
--   • Today: 3 short nights in a row (EVA prep schedule), stress 4 this
--     morning, exercise ended at 15:30 → anchor is 30 min post-exercise.
--     Heart rate sits above the personal resting baseline, BP slightly low.
--   • EVA briefing today 17:00, EVA prep tomorrow, EVA in two days.
-- Second story (crew_03, L. Okafor): stress before EVA briefings (days 5, 12).
-- Control (crew_01, A. Moreau): normal pattern.
-- Crew names and the mission are fictional.

create or replace function public.nastra_randn()
returns double precision
language sql volatile
set search_path = public
as $$
  select sqrt(-2 * ln(greatest(random(), 1e-12))) * cos(2 * pi() * random());
$$;

create or replace function public._nastra_add_event(
  p_crew text, p_start timestamptz, p_end timestamptz,
  p_activity text, p_title text, p_workload int, p_anchor timestamptz
) returns void
language sql
set search_path = public
as $$
  insert into public.mission_events (mission_id, crew_id, starts_at, ends_at, activity, title, workload, status)
  values ('nx1', p_crew, p_start, p_end, p_activity, p_title, p_workload,
          case when p_end <= p_anchor then 'completed'
               when p_start > p_anchor then 'scheduled'
               else 'in_progress' end);
$$;

create or replace function public.nastra_reseed(p_anchor timestamptz default now())
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  t0         timestamptz := date_trunc('minute', p_anchor) - interval '16 hours'; -- today 00:00 station
  c          record;
  d          int;
  ds         timestamptz;   -- day start (00:00 station) for day index d (0 = today, 1 = yesterday, -1 = tomorrow)
  sleep_h    numeric;
  s_end      timestamptz;
  ex_h       numeric;
  m_mood     int; m_stress int; m_fatigue int; m_note text;
  e_id       uuid;
begin
  perform setseed(0.4242);

  truncate public.tool_calls, public.event_turns, public.health_events,
           public.vitals, public.sleep_logs, public.mood_logs,
           public.mission_events, public.crew_members, public.missions
           restart identity cascade;

  insert into public.missions (id, name, vehicle, launch_at)
  values ('nx1', 'NX-1 Deep Space Transit (simulated)', 'Transit Habitat (simulated)', t0 - interval '41 days');

  insert into public.crew_members (id, mission_id, display_name, role, agency) values
    ('crew_01', 'nx1', 'A. Moreau', 'Commander',           'CSA'),
    ('crew_02', 'nx1', 'R. Tanaka', 'Flight Engineer',     'NASA'),
    ('crew_03', 'nx1', 'L. Okafor', 'Mission Specialist',  'NASA');

  -- ── Schedule, sleep, mood ────────────────────────────────────────────────
  for c in select * from (values ('crew_01'::text, 9.0::numeric), ('crew_02', 14.0), ('crew_03', 17.0)) v(id, ex_start_h)
  loop
    for d in reverse 20 .. -2 loop
      ds := t0 - make_interval(days => d);

      -- Sleep (night before day d). Planted short nights.
      sleep_h := case
        when c.id = 'crew_02' and d = 0  then 4.9
        when c.id = 'crew_02' and d = 1  then 5.4
        when c.id = 'crew_02' and d = 2  then 5.1
        when c.id = 'crew_02' and d = 7  then 5.0
        when c.id = 'crew_02' and d = 16 then 5.2
        when c.id = 'crew_03' and d in (5, 12) then 6.0
        when d < 0 then 8.0
        else round((7.6 + nastra_randn() * 0.35)::numeric, 2)
      end;
      s_end := ds + interval '6 hours';
      perform _nastra_add_event(c.id, s_end - make_interval(secs => (sleep_h * 3600)::double precision), s_end,
                                'sleep', 'Sleep', 1, p_anchor);
      if s_end <= p_anchor then
        insert into public.sleep_logs (crew_id, sleep_start, sleep_end, hours, quality, awakenings)
        values (c.id, s_end - make_interval(secs => (sleep_h * 3600)::double precision), s_end, sleep_h,
                case when sleep_h < 5.5 then 2 when sleep_h < 6.5 then 3 else 4 end,
                case when sleep_h < 5.5 then 3 when sleep_h < 6.5 then 2 else 1 end);
      end if;

      -- Daily schedule
      perform _nastra_add_event(c.id, ds + interval '7 hours', ds + interval '7 hours 30 minutes',
                                'briefing', 'Daily planning conference', 2, p_anchor);
      if c.id = 'crew_01' then
        perform _nastra_add_event(c.id, ds + interval '10 hours 45 minutes', ds + interval '13 hours',
                                  'science', 'Science operations', 3, p_anchor);
        perform _nastra_add_event(c.id, ds + interval '14 hours', ds + interval '17 hours',
                                  'maintenance', 'Habitat maintenance', 3, p_anchor);
      else
        perform _nastra_add_event(c.id, ds + interval '8 hours', ds + interval '12 hours',
                                  'science', 'Science operations', 3, p_anchor);
      end if;

      ex_h := case when c.id = 'crew_03' and d = 0 then 19.0 else c.ex_start_h end;
      perform _nastra_add_event(c.id, ds + make_interval(secs => (ex_h * 3600)::double precision),
                                ds + make_interval(secs => ((ex_h + 1.5) * 3600)::double precision),
                                'exercise', 'Exercise: treadmill + resistive device', 4, p_anchor);

      -- Planted briefings / EVA timeline
      if c.id = 'crew_03' and d in (5, 12) then
        perform _nastra_add_event(c.id, ds + interval '15 hours', ds + interval '16 hours 30 minutes',
                                  'briefing', 'EVA procedures briefing', 4, p_anchor);
      end if;
      if c.id in ('crew_02', 'crew_03') and d = 0 then
        perform _nastra_add_event(c.id, ds + interval '17 hours', ds + interval '18 hours',
                                  'briefing', 'EVA procedures briefing', 4, p_anchor);
      end if;
      if c.id in ('crew_02', 'crew_03') and d = -1 then
        perform _nastra_add_event(c.id, ds + interval '7 hours 30 minutes', ds + interval '12 hours',
                                  'eva_prep', 'EVA prep: suit checkout and timeline review', 5, p_anchor);
      end if;
      if c.id in ('crew_02', 'crew_03') and d = -2 then
        perform _nastra_add_event(c.id, ds + interval '8 hours', ds + interval '14 hours 30 minutes',
                                  'eva', 'EVA 1', 5, p_anchor);
      end if;

      -- Mood / stress / fatigue self-reports (morning + evening), past only
      if d >= 0 then
        m_mood := 4; m_stress := 2; m_fatigue := 2; m_note := null;
        if c.id = 'crew_02' and d in (0, 1, 2, 7, 16) then
          m_mood := 3; m_fatigue := 4; m_stress := case when d in (0, 7, 16) then 4 else 3 end;
          m_note := case d
            when 0  then 'Short night again. EVA prep is on my mind.'
            when 7  then 'Didn''t sleep well, noisy night.'
            when 16 then 'Tired. Late night finishing the experiment log.'
            else null end;
        elsif c.id = 'crew_03' and d in (5, 12) then
          m_stress := 4; m_mood := 3;
          m_note := 'EVA briefing this afternoon. Running procedures in my head.';
        end if;

        if ds + interval '7 hours 15 minutes' <= p_anchor then
          insert into public.mood_logs (crew_id, ts, mood, stress, fatigue, note) values (
            c.id, ds + interval '7 hours 15 minutes',
            least(5, greatest(1, m_mood    + case when m_note is null then round(nastra_randn() * 0.5)::int else 0 end)),
            least(5, greatest(1, m_stress  + case when m_note is null then round(nastra_randn() * 0.5)::int else 0 end)),
            least(5, greatest(1, m_fatigue + case when m_note is null then round(nastra_randn() * 0.5)::int else 0 end)),
            m_note);
        end if;
        if ds + interval '21 hours' <= p_anchor then
          insert into public.mood_logs (crew_id, ts, mood, stress, fatigue, note) values (
            c.id, ds + interval '21 hours',
            least(5, greatest(1, 4 + round(nastra_randn() * 0.5)::int)),
            least(5, greatest(1, 2 + round(nastra_randn() * 0.5)::int)),
            least(5, greatest(1, case when c.id = 'crew_02' and d in (0,1,2,7,16) then 4 else 3 end
                                 + round(nastra_randn() * 0.5)::int)),
            null);
        end if;
      end if;
    end loop;
  end loop;

  -- ── Vitals (15-min samples; 5-min for the last 3 h) ──────────────────────
  insert into public.vitals (crew_id, ts, heart_rate_bpm, hrv_rmssd_ms, spo2_pct, resp_rate_bpm,
                             skin_temp_c, systolic_mmhg, diastolic_mmhg, activity_level)
  with crew_base(id, hr, hrv, sys, dia) as (
    values ('crew_01', 58, 62, 116, 74), ('crew_02', 62, 55, 112, 72), ('crew_03', 66, 48, 120, 78)
  ),
  grid as (
    select cb.*, g.ts
    from crew_base cb
    cross join lateral (
      select generate_series(t0 - interval '20 days' - interval '2 hours',
                             p_anchor - interval '3 hours', interval '15 minutes') as ts
      union
      select generate_series(p_anchor - interval '3 hours' + interval '5 minutes',
                             p_anchor, interval '5 minutes')
    ) g
  ),
  ctx as (
    select gr.*,
      (select me.activity from public.mission_events me
        where me.crew_id = gr.id and gr.ts >= me.starts_at and gr.ts < me.ends_at
        order by me.workload desc limit 1) as activity,
      (select extract(epoch from gr.ts - max(me.ends_at)) / 60 from public.mission_events me
        where me.crew_id = gr.id and me.activity = 'exercise' and me.ends_at <= gr.ts) as mins_since_ex,
      (select extract(epoch from min(me.starts_at) - gr.ts) / 60 from public.mission_events me
        where me.crew_id = gr.id and me.title = 'EVA procedures briefing' and me.ends_at > gr.ts) as mins_to_briefing,
      (select sl.hours from public.sleep_logs sl
        where sl.crew_id = gr.id and sl.sleep_end <= gr.ts order by sl.sleep_end desc limit 1) as last_sleep_h,
      floor(extract(epoch from (t0 + interval '1 day' - gr.ts)) / 86400)::int as day_idx
    from grid gr
  ),
  f as (
    select ctx.*,
      coalesce(activity, 'rest') = 'sleep'    as is_sleep,
      coalesce(activity, 'rest') = 'exercise' as is_ex,
      (mins_since_ex is not null and mins_since_ex < 60
        and coalesce(activity, 'rest') not in ('exercise', 'sleep')) as is_recovery,
      case when id = 'crew_02' and day_idx in (0, 7, 16)
                and mins_since_ex >= 0 and mins_since_ex < 75
                and coalesce(activity, 'rest') <> 'exercise' then 1 else 0 end as p_post,
      case when id = 'crew_03' and day_idx in (5, 12)
                and mins_to_briefing is not null and mins_to_briefing <= 75 then 1 else 0 end as p_stress,
      case when coalesce(last_sleep_h, 8) < 6 then 1 else 0 end as short_sleep
    from ctx
  )
  select id, ts,
    greatest(40, hr
      + case when is_sleep then -8 when is_ex then 62 else 4 end
      + case when is_recovery then 22 * exp(-mins_since_ex / 18.0) else 0 end
      + p_post * 12 + p_stress * 10 + short_sleep * 3
      + nastra_randn() * case when is_ex then 6 else 2.5 end),
    greatest(8, hrv
      + case when is_sleep then 12 when is_ex then -32 else 0 end
      - short_sleep * 8 - p_stress * 15 - p_post * 8
      + nastra_randn() * 4),
    least(100, 97.8 - case when is_ex then 0.5 else 0 end + nastra_randn() * 0.4),
    14 + case when is_sleep then -2 when is_ex then 14 else 0 end + p_stress * 2 + nastra_randn() * 0.8,
    33.6 + case when is_sleep then 0.3 when is_ex then 0.8 else 0 end + nastra_randn() * 0.15,
    round(sys + case when is_sleep then -8 when is_ex then 28 else 0 end - p_post * 8 + p_stress * 6 + nastra_randn() * 3),
    round(dia + case when is_sleep then -6 when is_ex then 6 else 0 end - p_post * 5 + p_stress * 3 + nastra_randn() * 2),
    least(1, greatest(0,
      case when is_sleep then 0.03 when is_ex then 0.85 when is_recovery then 0.35
           when activity = 'science' then 0.22 else 0.15 end
      + nastra_randn() * 0.02))
  from f;

  -- ── Health event history ─────────────────────────────────────────────────
  insert into public.health_events (crew_id, opened_at, closed_at, status, origin, utterance, speech_act, domain,
    symptoms, urgency, confidence, mission_context, protocol_id, context_snapshot, ai_summary, outcome, outcome_notes)
  values (
    'crew_02', t0 - interval '16 days' + interval '15 hours 55 minutes', t0 - interval '16 days' + interval '16 hours 20 minutes',
    'resolved', 'simulated_history',
    'Feeling a bit off-balance after the treadmill session.', 'report', 'physical_symptom',
    '[{"said":"off-balance","category":"disorientation","body_system":"sensorimotor_vestibular"}]',
    'advisory', 'high', 'post_exercise', 'sensorimotor_disorientation',
    '{"minutes_since_exercise":25,"sleep_hours_prior":5.2,"morning_stress":4,"morning_fatigue":4,"red_flags_reported":[]}',
    'Off-balance sensation 25 min after exercise, after a 5.2 h night. No red flags reported.',
    'resolved', 'Rested seated for 20 min with fluids. Symptom gone at the 20-min recheck.')
  returning id into e_id;
  insert into public.event_turns (event_id, ts, role, content) values
    (e_id, t0 - interval '16 days' + interval '15 hours 55 minutes', 'crew', 'Feeling a bit off-balance after the treadmill session.'),
    (e_id, t0 - interval '16 days' + interval '16 hours 20 minutes', 'system', 'Recheck complete: symptom resolved. Event closed.');

  insert into public.health_events (crew_id, opened_at, closed_at, status, origin, utterance, speech_act, domain,
    symptoms, urgency, confidence, mission_context, protocol_id, context_snapshot, ai_summary, outcome, outcome_notes)
  values (
    'crew_02', t0 - interval '7 days' + interval '15 hours 50 minutes', t0 - interval '7 days' + interval '16 hours 20 minutes',
    'resolved', 'simulated_history',
    'The room spun a little when I turned my head after exercise.', 'report', 'physical_symptom',
    '[{"said":"room spun","category":"disorientation","body_system":"sensorimotor_vestibular"}]',
    'advisory', 'high', 'post_exercise', 'sensorimotor_disorientation',
    '{"minutes_since_exercise":20,"sleep_hours_prior":5.0,"morning_stress":4,"morning_fatigue":4,"red_flags_reported":[]}',
    'Brief spinning sensation with head movement 20 min after exercise, after a 5.0 h night. No red flags reported.',
    'resolved', 'Avoided quick head movements, rested 25 min with fluids. Resolved at recheck.')
  returning id into e_id;
  insert into public.event_turns (event_id, ts, role, content) values
    (e_id, t0 - interval '7 days' + interval '15 hours 50 minutes', 'crew', 'The room spun a little when I turned my head after exercise.'),
    (e_id, t0 - interval '7 days' + interval '16 hours 20 minutes', 'system', 'Recheck complete: symptom resolved. Event closed.');

  insert into public.health_events (crew_id, opened_at, closed_at, status, origin, utterance, speech_act, domain,
    symptoms, urgency, confidence, mission_context, protocol_id, context_snapshot, ai_summary, outcome, outcome_notes)
  values (
    'crew_03', t0 - interval '5 days' + interval '14 hours 20 minutes', t0 - interval '5 days' + interval '14 hours 40 minutes',
    'resolved', 'simulated_history',
    'Can''t switch off before the EVA briefing. My heart is racing.', 'report', 'psychological',
    '[{"said":"can''t switch off","category":"acute_stress","body_system":"behavioral_health"},{"said":"heart is racing","category":"elevated_heart_rate_reported","body_system":"cardiovascular"}]',
    'advisory', 'high', 'pre_eva', 'acute_stress',
    '{"minutes_to_briefing":40,"sleep_hours_prior":6.0,"morning_stress":4,"red_flags_reported":[]}',
    'Pre-briefing stress with reported fast heartbeat, 40 min before an EVA briefing. No red flags reported.',
    'resolved', 'Paced breathing guidance, recheck at 10 min: self-rated stress 4 → 2, heart rate settling toward baseline.')
  returning id into e_id;
  insert into public.event_turns (event_id, ts, role, content) values
    (e_id, t0 - interval '5 days' + interval '14 hours 20 minutes', 'crew', 'Can''t switch off before the EVA briefing. My heart is racing.'),
    (e_id, t0 - interval '5 days' + interval '14 hours 40 minutes', 'system', 'Recheck complete: stress 2/5. Event closed.');

  insert into public.health_events (crew_id, opened_at, closed_at, status, origin, utterance, speech_act, domain,
    symptoms, urgency, confidence, mission_context, protocol_id, context_snapshot, ai_summary, outcome, outcome_notes)
  values (
    'crew_01', t0 - interval '10 days' + interval '21 hours 5 minutes', t0 - interval '10 days' + interval '21 hours 6 minutes',
    'resolved', 'simulated_history',
    'How has my sleep been this week?', 'question', 'health_data',
    '[]', 'nominal', 'high', 'habitat', null, '{}',
    'Sleep summary requested and provided from sleep logs.', 'answered', null)
  returning id into e_id;
  insert into public.event_turns (event_id, ts, role, content) values
    (e_id, t0 - interval '10 days' + interval '21 hours 5 minutes', 'crew', 'How has my sleep been this week?');

  return jsonb_build_object(
    'anchor', p_anchor,
    'station_today_start', t0,
    'crew', (select count(*) from public.crew_members),
    'vitals', (select count(*) from public.vitals),
    'sleep_logs', (select count(*) from public.sleep_logs),
    'mood_logs', (select count(*) from public.mood_logs),
    'mission_events', (select count(*) from public.mission_events),
    'health_events', (select count(*) from public.health_events)
  );
end;
$$;

-- Only the server (service role / postgres) may reseed.
revoke execute on function public.nastra_reseed(timestamptz) from public;
revoke execute on function public._nastra_add_event(text, timestamptz, timestamptz, text, text, int, timestamptz) from public;
revoke execute on function public.nastra_randn() from public;

-- On Supabase, also close every NASTRA function to the browser-facing roles.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.nastra_reseed(timestamptz) from anon, authenticated;
    revoke execute on function public._nastra_add_event(text, timestamptz, timestamptz, text, text, int, timestamptz) from anon, authenticated;
    revoke execute on function public.nastra_randn() from anon, authenticated;
    revoke execute on function public.vitals_baseline(text, timestamptz, int) from anon, authenticated;
    revoke execute on function public.vitals_deviation(text, timestamptz, int, int) from anon, authenticated;
    revoke execute on function public.post_exercise_comparison(text, timestamptz, int, int) from anon, authenticated;
    revoke execute on function public.similar_episodes(text, text, text, text, timestamptz, int) from anon, authenticated;
    revoke execute on function public.match_knowledge(extensions.vector, text[], int) from anon, authenticated;
  end if;
end $$;
