-- NASTRA — extra read functions for the tool gateway + explicit grants.
-- Every read the server does goes through a named function, so the model's
-- tools are a fixed list and never free SQL.

-- Last N sleeps + the person's own 14-day average (for "shorter than usual").
create or replace function public.recent_sleep(
  p_crew_id text, p_as_of timestamptz default now(), p_n int default 3
)
returns table (sleep_start timestamptz, sleep_end timestamptz, hours numeric, quality smallint, avg_hours_14d numeric)
language sql stable
set search_path = public
as $$
  select s.sleep_start, s.sleep_end, s.hours, s.quality,
         (select round(avg(x.hours), 2) from public.sleep_logs x
           where x.crew_id = p_crew_id and x.sleep_end <= p_as_of
             and x.sleep_end > p_as_of - interval '14 days')
  from public.sleep_logs s
  where s.crew_id = p_crew_id and s.sleep_end <= p_as_of
  order by s.sleep_end desc
  limit p_n;
$$;

create or replace function public.recent_mood(
  p_crew_id text, p_as_of timestamptz default now(), p_n int default 2
)
returns table (ts timestamptz, mood smallint, stress smallint, fatigue smallint, note text)
language sql stable
set search_path = public
as $$
  select m.ts, m.mood, m.stress, m.fatigue, m.note
  from public.mood_logs m
  where m.crew_id = p_crew_id and m.ts <= p_as_of
  order by m.ts desc
  limit p_n;
$$;

-- Where is this crew member in the mission timeline right now?
-- Context is derived by fixed rules (documented inline), not by the model.
create or replace function public.mission_context(
  p_crew_id text, p_as_of timestamptz default now()
)
returns jsonb
language sql stable
set search_path = public
as $$
  with cur as (
    select title, activity, ends_at from public.mission_events
    where crew_id = p_crew_id and starts_at <= p_as_of and ends_at > p_as_of
    order by workload desc limit 1
  ),
  ex as (
    select max(ends_at) as last_end from public.mission_events
    where crew_id = p_crew_id and activity = 'exercise' and ends_at <= p_as_of
  ),
  eva_recent as (
    select max(ends_at) as last_end from public.mission_events
    where crew_id = p_crew_id and activity = 'eva' and ends_at <= p_as_of
  ),
  eva_next as (
    select min(starts_at) as next_start from public.mission_events
    where crew_id = p_crew_id and activity in ('eva', 'eva_prep') and starts_at > p_as_of
  ),
  nxt as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'title', title, 'activity', activity, 'starts_at', starts_at,
             'hours_until', round((extract(epoch from starts_at - p_as_of) / 3600)::numeric, 1))
             order by starts_at), '[]'::jsonb) as items
    from (
      select title, activity, starts_at from public.mission_events
      where crew_id = p_crew_id and starts_at > p_as_of and starts_at <= p_as_of + interval '48 hours'
        and activity not in ('sleep') and title <> 'Daily planning conference'
      order by starts_at limit 6
    ) n
  ),
  m as (
    select mi.name, floor(extract(epoch from p_as_of - mi.launch_at) / 86400)::int + 1 as mission_day
    from public.missions mi join public.crew_members c on c.mission_id = mi.id
    where c.id = p_crew_id
  )
  select jsonb_build_object(
    'mission', (select name from m),
    'mission_day', (select mission_day from m),
    'current_activity', (select to_jsonb(cur) from cur),
    'minutes_since_exercise',
      (select round((extract(epoch from p_as_of - last_end) / 60)::numeric) from ex),
    'hours_to_next_eva',
      (select round((extract(epoch from next_start - p_as_of) / 3600)::numeric, 1) from eva_next),
    'next_events', (select items from nxt),
    -- Rules, in priority order:
    --   in exercise / EVA / sleep now → that
    --   exercise ended ≤ 90 min ago   → post_exercise
    --   EVA ended ≤ 24 h ago          → post_eva
    --   EVA or EVA prep within 48 h   → pre_eva
    --   otherwise                     → habitat
    'context', case
      when (select activity from cur) = 'exercise' then 'exercise'
      when (select activity from cur) = 'eva' then 'eva'
      when (select activity from cur) = 'sleep' then 'sleep'
      when (select last_end from ex) > p_as_of - interval '90 minutes' then 'post_exercise'
      when (select last_end from eva_recent) > p_as_of - interval '24 hours' then 'post_eva'
      when (select next_start from eva_next) <= p_as_of + interval '48 hours' then 'pre_eva'
      else 'habitat'
    end
  );
$$;

-- Tag-filtered knowledge without vectors (used until embeddings are loaded,
-- and as the deterministic fallback afterwards).
create or replace function public.knowledge_by_tags(p_tags text[], p_n int default 3)
returns table (id bigint, source_org text, source_name text, source_url text, section text, content text, tags text[])
language sql stable
set search_path = public
as $$
  select k.id, k.source_org, k.source_name, k.source_url, k.section, k.content, k.tags
  from public.knowledge_snippets k
  where k.tags && p_tags
  order by k.source_name, k.chunk_index
  limit p_n;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Close every NASTRA function to PUBLIC (Postgres grants EXECUTE to PUBLIC by default).
revoke execute on function public.vitals_baseline(text, timestamptz, int) from public;
revoke execute on function public.vitals_deviation(text, timestamptz, int, int) from public;
revoke execute on function public.post_exercise_comparison(text, timestamptz, int, int) from public;
revoke execute on function public.similar_episodes(text, text, text, text, timestamptz, int) from public;
revoke execute on function public.match_knowledge(extensions.vector, text[], int) from public;
revoke execute on function public.recent_sleep(text, timestamptz, int) from public;
revoke execute on function public.recent_mood(text, timestamptz, int) from public;
revoke execute on function public.mission_context(text, timestamptz) from public;
revoke execute on function public.knowledge_by_tags(text[], int) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon, authenticated';
  end if;

  -- The Next.js server (secret key → service_role) gets exactly what it needs.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant select on all tables in schema public to service_role';
    execute 'grant insert, update on public.health_events, public.event_turns, public.tool_calls,
                                     public.mood_logs, public.sleep_logs to service_role';
    execute 'grant insert, update, delete on public.knowledge_snippets to service_role';
    execute 'grant usage on all sequences in schema public to service_role';
    execute 'grant execute on function
      public.vitals_baseline(text, timestamptz, int),
      public.vitals_deviation(text, timestamptz, int, int),
      public.post_exercise_comparison(text, timestamptz, int, int),
      public.similar_episodes(text, text, text, text, timestamptz, int),
      public.match_knowledge(extensions.vector, text[], int),
      public.recent_sleep(text, timestamptz, int),
      public.recent_mood(text, timestamptz, int),
      public.mission_context(text, timestamptz),
      public.knowledge_by_tags(text[], int),
      public.nastra_reseed(timestamptz),
      public._nastra_add_event(text, timestamptz, timestamptz, text, text, int, timestamptz),
      public.nastra_randn()
      to service_role';
  end if;
end $$;

-- Reseed truncates tables. Run it as its owner so the server role doesn't need
-- TRUNCATE on every table. Still closed to PUBLIC / anon / authenticated.
alter function public.nastra_reseed(timestamptz) security definer;
