-- NASTRA Station support.
--   1. Demo crew member crew_02 becomes K. Kia (CSA, Flight Engineer); mission shifted to MET 034.
--   2. cabin_environment: simulated habitat atmosphere (CO2, O2, pressure, temperature, humidity).
--        Grounding: NASA HRP Five Hazards — hostile/closed environment              [indirect]
--   3. crew_alerts: operational alerts shown to the crew (NHIS OperationalAlert model).
--        Advisory = personal-baseline deviation from the vitals monitor (not a clinical threshold).
--        Warning  = deterministic escalation (safety screen / red-flag answer).
--   4. surgeon_alerts.target: flight surgeon or crew medical officer.
--   5. Read functions for the Station screens (series, environment, history, profile).
-- All data simulated. No clinical or environmental limits are encoded here.

-- ── 2. Cabin environment ───────────────────────────────────────────────────
create table if not exists public.cabin_environment (
  id            bigint generated always as identity primary key,
  ts            timestamptz not null,
  co2_mmhg      numeric(4,2),
  ppo2_kpa      numeric(4,1),
  pressure_kpa  numeric(5,1),
  temp_c        numeric(4,1),
  humidity_pct  numeric(4,1),
  is_simulated  boolean not null default true
);
create index if not exists cabin_environment_ts on public.cabin_environment (ts);
alter table public.cabin_environment enable row level security;

-- ── 3. Crew alerts ─────────────────────────────────────────────────────────
create table if not exists public.crew_alerts (
  id               uuid primary key default gen_random_uuid(),
  crew_id          text not null,
  created_at       timestamptz not null default now(),
  priority         text not null check (priority in ('advisory','caution','warning')),
  title            text not null,
  detail           text,
  source           text not null,
  engine           text not null default 'nastra-monitor',
  metric           text,
  event_id         uuid,
  protocol_code    text,
  protocol_title   text,
  active           boolean not null default true,
  acknowledged_at  timestamptz,
  annunciation     text not null default 'annunciating'
                     check (annunciation in ('annunciating','silenced','suppressed','inhibited')),
  cleared_at       timestamptz
);
create index if not exists crew_alerts_crew on public.crew_alerts (crew_id, active, created_at desc);
alter table public.crew_alerts enable row level security;

-- ── 4. Escalation target ───────────────────────────────────────────────────
alter table public.surgeon_alerts add column if not exists target text not null default 'flight_surgeon';
do $$ begin
  alter table public.surgeon_alerts add constraint surgeon_alerts_target_chk check (target in ('flight_surgeon','crew_medical_officer'));
exception when duplicate_object then null; end $$;

-- ── 5. Read functions ──────────────────────────────────────────────────────
create or replace function public.crew_profile(p_crew_id text, p_as_of timestamptz default now())
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'crew_id', c.id, 'name', c.display_name, 'role', c.role, 'agency', c.agency, 'simulated', c.is_simulated,
    'mission', m.name, 'vehicle', m.vehicle, 'launch_at', m.launch_at,
    'mission_day', floor(extract(epoch from p_as_of - m.launch_at) / 86400)::int + 1)
  from public.crew_members c join public.missions m on m.id = c.mission_id
  where c.id = p_crew_id;
$$;

create or replace function public.vitals_series(p_crew_id text, p_from timestamptz, p_to timestamptz, p_bucket_minutes int default 60)
returns table (ts timestamptz, heart_rate_bpm numeric, hrv_rmssd_ms numeric, spo2_pct numeric, resp_rate_bpm numeric,
               skin_temp_c numeric, systolic_mmhg numeric, diastolic_mmhg numeric)
language sql stable set search_path = public as $$
  select to_timestamp(floor(extract(epoch from v.ts) / (p_bucket_minutes * 60)) * p_bucket_minutes * 60) as b,
         round(avg(v.heart_rate_bpm), 1), round(avg(v.hrv_rmssd_ms), 1), round(avg(v.spo2_pct), 1),
         round(avg(v.resp_rate_bpm), 1), round(avg(v.skin_temp_c), 2), round(avg(v.systolic_mmhg), 1), round(avg(v.diastolic_mmhg), 1)
  from public.vitals v
  where v.crew_id = p_crew_id and v.ts >= p_from and v.ts <= p_to
  group by 1 order by 1;
$$;

create or replace function public.environment_series(p_from timestamptz, p_to timestamptz, p_bucket_minutes int default 60)
returns table (ts timestamptz, co2_mmhg numeric, ppo2_kpa numeric, pressure_kpa numeric, temp_c numeric, humidity_pct numeric)
language sql stable set search_path = public as $$
  select to_timestamp(floor(extract(epoch from e.ts) / (p_bucket_minutes * 60)) * p_bucket_minutes * 60) as b,
         round(avg(e.co2_mmhg), 2), round(avg(e.ppo2_kpa), 1), round(avg(e.pressure_kpa), 1),
         round(avg(e.temp_c), 1), round(avg(e.humidity_pct), 1)
  from public.cabin_environment e
  where e.ts >= p_from and e.ts <= p_to
  group by 1 order by 1;
$$;

-- Latest reading plus the habitat's own 7-day mean and spread. A personal-style
-- baseline for the cabin, not an environmental limit.
create or replace function public.environment_now(p_as_of timestamptz default now())
returns jsonb language sql stable set search_path = public as $$
  with latest as (
    select * from public.cabin_environment where ts <= p_as_of order by ts desc limit 1
  ), base as (
    select avg(co2_mmhg) co2_m, stddev_samp(co2_mmhg) co2_s, avg(ppo2_kpa) o2_m, stddev_samp(ppo2_kpa) o2_s,
           avg(pressure_kpa) p_m, stddev_samp(pressure_kpa) p_s, avg(temp_c) t_m, stddev_samp(temp_c) t_s,
           avg(humidity_pct) h_m, stddev_samp(humidity_pct) h_s
    from public.cabin_environment where ts > p_as_of - interval '7 days' and ts <= p_as_of
  )
  select jsonb_build_object(
    'ts', l.ts,
    'co2_mmhg',     jsonb_build_object('value', l.co2_mmhg,     'mean', round(b.co2_m, 2), 'sd', round(b.co2_s, 2)),
    'ppo2_kpa',     jsonb_build_object('value', l.ppo2_kpa,     'mean', round(b.o2_m, 2),  'sd', round(b.o2_s, 2)),
    'pressure_kpa', jsonb_build_object('value', l.pressure_kpa, 'mean', round(b.p_m, 2),   'sd', round(b.p_s, 2)),
    'temp_c',       jsonb_build_object('value', l.temp_c,       'mean', round(b.t_m, 2),   'sd', round(b.t_s, 2)),
    'humidity_pct', jsonb_build_object('value', l.humidity_pct, 'mean', round(b.h_m, 2),   'sd', round(b.h_s, 2)))
  from latest l cross join base b;
$$;

create or replace function public.health_history(p_crew_id text, p_limit int default 50)
returns table (id uuid, opened_at timestamptz, closed_at timestamptz, status text, origin text, utterance text,
               speech_act text, domain text, symptoms jsonb, urgency text, mission_context text, protocol_id text,
               outcome text, outcome_notes text, ai_summary text, context_snapshot jsonb)
language sql stable set search_path = public as $$
  select e.id, e.opened_at, e.closed_at, e.status, e.origin, e.utterance, e.speech_act, e.domain, e.symptoms,
         e.urgency, e.mission_context, e.protocol_id, e.outcome, e.outcome_notes, e.ai_summary, e.context_snapshot
  from public.health_events e
  where e.crew_id = p_crew_id
  order by e.opened_at desc
  limit greatest(1, least(p_limit, 200));
$$;

create or replace function public.crew_alert_feed(p_crew_id text, p_include_inactive boolean default false)
returns setof public.crew_alerts language sql stable set search_path = public as $$
  select * from public.crew_alerts
  where crew_id = p_crew_id and (p_include_inactive or active)
  order by created_at desc limit 50;
$$;

-- ── 1. Reseed wrapper: archive, wipe derived tables, reseed, apply Station demo identity, environment ──
create or replace function public.nastra_reseed(p_anchor timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  archived int;
  result jsonb;
begin
  insert into public.session_archive (crew_id, event)
  select e.crew_id,
         jsonb_build_object(
           'event', to_jsonb(e),
           'turns', coalesce((select jsonb_agg(to_jsonb(t) order by t.ts) from public.event_turns t where t.event_id = e.id), '[]'::jsonb),
           'tool_calls', coalesce((select jsonb_agg(to_jsonb(c) order by c.ts) from public.tool_calls c where c.event_id = e.id), '[]'::jsonb),
           'alerts', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.surgeon_alerts a where a.event_id = e.id), '[]'::jsonb),
           'crew_alerts', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.crew_alerts a where a.event_id = e.id), '[]'::jsonb))
  from public.health_events e
  where e.origin = 'live';
  get diagnostics archived = row_count;

  -- Supabase rejects DELETE without WHERE on API connections (safeupdate).
  delete from public.surgeon_alerts where true;
  delete from public.crew_alerts where true;
  delete from public.cabin_environment where true;
  result := public._nastra_reseed_core(p_anchor);

  -- Station demo identity: K. Kia (CSA) at MET 034 (34 elapsed days, the MET convention NHIS uses). Events stay relative to the anchor.
  update public.crew_members set display_name = 'K. Kia', role = 'Flight Engineer', agency = 'CSA' where id = 'crew_02';
  update public.missions set launch_at = launch_at + interval '7 days' where id = 'nx1';

  -- Habitat atmosphere, 15-min samples for 21 days. Smooth daily cycle plus noise; simulated.
  insert into public.cabin_environment (ts, co2_mmhg, ppo2_kpa, pressure_kpa, temp_c, humidity_pct)
  select g.ts,
         round((2.6 + 0.35 * sin(extract(epoch from g.ts) / 86400 * 2 * pi()) + nastra_randn() * 0.12)::numeric, 2),
         round((21.2 + nastra_randn() * 0.15)::numeric, 1),
         round((101.3 + nastra_randn() * 0.15)::numeric, 1),
         round((22.4 + 0.6 * sin(extract(epoch from g.ts) / 86400 * 2 * pi() - 1) + nastra_randn() * 0.15)::numeric, 1),
         round((44 + 2.5 * sin(extract(epoch from g.ts) / 86400 * 2 * pi() + 0.5) + nastra_randn() * 0.8)::numeric, 1)
  from generate_series(p_anchor - interval '21 days', p_anchor, interval '15 minutes') as g(ts);

  return result || jsonb_build_object('archived_live_events', archived);
end;
$$;

-- ── Grants (server only) ───────────────────────────────────────────────────
revoke execute on function public.crew_profile(text, timestamptz) from public;
revoke execute on function public.vitals_series(text, timestamptz, timestamptz, int) from public;
revoke execute on function public.environment_series(timestamptz, timestamptz, int) from public;
revoke execute on function public.environment_now(timestamptz) from public;
revoke execute on function public.health_history(text, int) from public;
revoke execute on function public.crew_alert_feed(text, boolean) from public;
revoke execute on function public.nastra_reseed(timestamptz) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.cabin_environment, public.crew_alerts from anon, authenticated;
    revoke execute on function public.crew_profile(text, timestamptz), public.vitals_series(text, timestamptz, timestamptz, int),
      public.environment_series(timestamptz, timestamptz, int), public.environment_now(timestamptz),
      public.health_history(text, int), public.crew_alert_feed(text, boolean), public.nastra_reseed(timestamptz)
      from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.cabin_environment to service_role;
    grant select, insert, update on public.crew_alerts to service_role;
    grant execute on function public.crew_profile(text, timestamptz), public.vitals_series(text, timestamptz, timestamptz, int),
      public.environment_series(timestamptz, timestamptz, int), public.environment_now(timestamptz),
      public.health_history(text, int), public.crew_alert_feed(text, boolean), public.nastra_reseed(timestamptz)
      to service_role;
  end if;
end $$;
