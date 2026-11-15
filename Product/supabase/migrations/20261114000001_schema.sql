-- NASTRA — schema v0.1
-- All crew data in this database is SIMULATED.
--
-- Source grounding (see docs/NASA_SOURCES.md in the project):
--   vitals            ← CSA Bio-Monitor (Astroskin) channels                     [indirect]
--   sleep/mood/activity ← NASA Spaceflight Standard Measures (actigraphy, sleep
--                       reports, behavioural self-report)                        [indirect]
--   health_events / event_turns / tool_calls
--                     ← NASA-STD-3001 Vol 1, Longitudinal Health Surveillance
--                       technical brief (crew health monitoring over time)      [indirect]
--   knowledge_snippets ← NASA HRP risk pages, NASA-STD-3001, CSA pages          [direct, cited in-app]

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- ── Mission & crew ──────────────────────────────────────────────────────────
create table public.missions (
  id            text primary key,
  name          text not null,
  vehicle       text not null,
  launch_at     timestamptz not null,
  is_simulated  boolean not null default true
);

create table public.crew_members (
  id            text primary key,
  mission_id    text not null references public.missions(id) on delete cascade,
  display_name  text not null,
  role          text not null,
  agency        text not null,
  is_simulated  boolean not null default true
);

-- ── Physiological telemetry (Bio-Monitor-style channels) ────────────────────
create table public.vitals (
  id               bigint generated always as identity primary key,
  crew_id          text not null references public.crew_members(id) on delete cascade,
  ts               timestamptz not null,
  heart_rate_bpm   numeric(5,1),
  hrv_rmssd_ms     numeric(5,1),
  spo2_pct         numeric(4,1),
  resp_rate_bpm    numeric(4,1),
  skin_temp_c      numeric(4,2),
  systolic_mmhg    smallint,
  diastolic_mmhg   smallint,
  activity_level   numeric(3,2) check (activity_level between 0 and 1),
  source           text not null default 'simulated:bio-monitor'
);
create index vitals_crew_ts_idx on public.vitals (crew_id, ts desc);

-- ── Standard-Measures-style self-report & actigraphy ────────────────────────
create table public.sleep_logs (
  id            bigint generated always as identity primary key,
  crew_id       text not null references public.crew_members(id) on delete cascade,
  sleep_start   timestamptz not null,
  sleep_end     timestamptz not null,
  hours         numeric(4,2) not null,
  quality       smallint check (quality between 1 and 5),   -- self-rated
  awakenings    smallint,
  source        text not null default 'simulated:actigraphy+self-report'
);
create index sleep_logs_crew_end_idx on public.sleep_logs (crew_id, sleep_end desc);

create table public.mood_logs (
  id        bigint generated always as identity primary key,
  crew_id   text not null references public.crew_members(id) on delete cascade,
  ts        timestamptz not null,
  mood      smallint check (mood between 1 and 5),      -- 1 low … 5 good
  stress    smallint check (stress between 1 and 5),    -- 1 low … 5 high
  fatigue   smallint check (fatigue between 1 and 5),   -- 1 low … 5 high
  note      text,
  source    text not null default 'simulated:self-report'
);
create index mood_logs_crew_ts_idx on public.mood_logs (crew_id, ts desc);

-- ── Mission timeline ────────────────────────────────────────────────────────
create table public.mission_events (
  id          bigint generated always as identity primary key,
  mission_id  text not null references public.missions(id) on delete cascade,
  crew_id     text references public.crew_members(id) on delete cascade,  -- null = whole crew
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  activity    text not null check (activity in
                ('sleep','exercise','briefing','science','maintenance','meal','personal','eva_prep','eva','post_eva')),
  title       text not null,
  workload    smallint check (workload between 1 and 5),
  status      text not null default 'scheduled' check (status in ('completed','in_progress','scheduled')),
  check (ends_at > starts_at)
);
create index mission_events_crew_start_idx on public.mission_events (crew_id, starts_at);

-- ── Health events: the event log AND the history the pattern matcher reads ──
create table public.health_events (
  id                uuid primary key default gen_random_uuid(),
  crew_id           text not null references public.crew_members(id) on delete cascade,
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz,
  status            text not null default 'open'
                      check (status in ('open','awaiting_followup','resolved','escalated')),
  origin            text not null default 'live' check (origin in ('live','simulated_history')),
  utterance         text,
  speech_act        text check (speech_act in ('report','question','log','request')),
  domain            text check (domain in ('physical_symptom','psychological','health_data','out_of_scope')),
  symptoms          jsonb not null default '[]'::jsonb,
  urgency           text check (urgency in ('nominal','advisory','caution','warning')),
  confidence        text check (confidence in ('high','medium','low')),
  mission_context   text check (mission_context in
                      ('habitat','exercise','post_exercise','pre_eva','eva','post_eva','sleep','other')),
  protocol_id       text,
  context_snapshot  jsonb not null default '{}'::jsonb,
  ai_summary        text,
  outcome           text,
  outcome_notes     text
);
create index health_events_crew_opened_idx on public.health_events (crew_id, opened_at desc);
create index health_events_symptoms_idx on public.health_events using gin (symptoms);

-- Every turn of a health event (crew message, NASTRA reply, system action)
create table public.event_turns (
  id        bigint generated always as identity primary key,
  event_id  uuid not null references public.health_events(id) on delete cascade,
  ts        timestamptz not null default now(),
  role      text not null check (role in ('crew','nastra','system')),
  content   text not null,
  payload   jsonb not null default '{}'::jsonb
);
create index event_turns_event_idx on public.event_turns (event_id, ts);

-- Audit trail of every tool the orchestrator called
create table public.tool_calls (
  id              bigint generated always as identity primary key,
  event_id        uuid references public.health_events(id) on delete cascade,
  ts              timestamptz not null default now(),
  tool            text not null,
  args            jsonb not null default '{}'::jsonb,
  result_summary  jsonb not null default '{}'::jsonb,
  ok              boolean not null default true
);

-- ── Approved knowledge (RAG) ────────────────────────────────────────────────
create table public.knowledge_snippets (
  id           bigint generated always as identity primary key,
  source_org   text not null check (source_org in ('NASA','CSA')),
  source_name  text not null,
  source_url   text not null,
  section      text,
  chunk_index  int not null default 0,
  tags         text[] not null default '{}',
  content      text not null,
  embedding    extensions.vector(384),
  usage        text not null default 'direct' check (usage in ('direct','indirect')),
  created_at   timestamptz not null default now()
);
create index knowledge_snippets_tags_idx on public.knowledge_snippets using gin (tags);

-- ── Access: server only. RLS on, no policies → anon/authenticated see nothing;
--    the Next.js server uses the service role key.
alter table public.missions            enable row level security;
alter table public.crew_members        enable row level security;
alter table public.vitals              enable row level security;
alter table public.sleep_logs          enable row level security;
alter table public.mood_logs           enable row level security;
alter table public.mission_events      enable row level security;
alter table public.health_events       enable row level security;
alter table public.event_turns         enable row level security;
alter table public.tool_calls          enable row level security;
alter table public.knowledge_snippets  enable row level security;
