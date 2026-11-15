-- Flight-surgeon alert outbox.
-- Until now an escalation only *said* "I'm sending this to the flight surgeon".
-- Every escalation now writes one row here; the ground console (npm run surgeon,
-- later the Station UI via Realtime) reads it and acknowledges it.
--
-- Grounding: NASA-STD-3001 Vol 1 / OCHMO Longitudinal Health Surveillance brief —
-- crew health data flows to the medical team on the ground            [indirect]
--
-- No foreign key to health_events on purpose: nastra_reseed truncates events,
-- and alerts are archived first instead (see the updated wrapper below).

create table if not exists public.surgeon_alerts (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  event_id         uuid not null,
  crew_id          text not null,
  urgency          text not null default 'warning'
                     check (urgency in ('nominal','advisory','caution','warning')),
  reasons          text[] not null default '{}',
  utterance        text,
  evidence         jsonb not null default '[]'::jsonb,
  status           text not null default 'pending'
                     check (status in ('pending','acknowledged')),
  acknowledged_at  timestamptz,
  acknowledged_by  text,
  ground_note      text,
  is_simulated     boolean not null default true
);
create index if not exists surgeon_alerts_pending on public.surgeon_alerts (status, created_at);
alter table public.surgeon_alerts enable row level security;

-- Ground console read: newest first. Reads stay named functions, never free SQL.
create or replace function public.surgeon_alert_feed(p_include_acknowledged boolean default false, p_limit int default 20)
returns setof public.surgeon_alerts
language sql stable
set search_path = public
as $$
  select * from public.surgeon_alerts
  where p_include_acknowledged or status = 'pending'
  order by created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

-- Reseed: archive live events AND their alerts, then clear alerts.
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
           'alerts', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.surgeon_alerts a where a.event_id = e.id), '[]'::jsonb))
  from public.health_events e
  where e.origin = 'live';
  get diagnostics archived = row_count;

  -- Supabase rejects DELETE without WHERE on API connections (safeupdate).
  delete from public.surgeon_alerts where true;
  result := public._nastra_reseed_core(p_anchor);
  return result || jsonb_build_object('archived_live_events', archived);
end;
$$;

revoke execute on function public.nastra_reseed(timestamptz) from public;
revoke execute on function public.surgeon_alert_feed(boolean, int) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.surgeon_alerts from anon, authenticated;
    revoke execute on function public.nastra_reseed(timestamptz) from anon, authenticated;
    revoke execute on function public.surgeon_alert_feed(boolean, int) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update on public.surgeon_alerts to service_role;
    grant execute on function public.nastra_reseed(timestamptz) to service_role;
    grant execute on function public.surgeon_alert_feed(boolean, int) to service_role;
  end if;
end $$;
