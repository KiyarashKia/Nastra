-- Keep live conversations when the demo data is reset.
-- nastra_reseed() now copies every live event (with its turns and tool calls)
-- into session_archive before wiping, so test chats are never lost and never
-- pollute the next demo's "similar episodes".

create table if not exists public.session_archive (
  id           bigint generated always as identity primary key,
  archived_at  timestamptz not null default now(),
  crew_id      text,
  event        jsonb not null
);
alter table public.session_archive enable row level security;

alter function public.nastra_reseed(timestamptz) rename to _nastra_reseed_core;

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
           'tool_calls', coalesce((select jsonb_agg(to_jsonb(c) order by c.ts) from public.tool_calls c where c.event_id = e.id), '[]'::jsonb))
  from public.health_events e
  where e.origin = 'live';
  get diagnostics archived = row_count;

  result := public._nastra_reseed_core(p_anchor);
  return result || jsonb_build_object('archived_live_events', archived);
end;
$$;

revoke execute on function public._nastra_reseed_core(timestamptz) from public;
revoke execute on function public.nastra_reseed(timestamptz) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public._nastra_reseed_core(timestamptz) from anon, authenticated;
    revoke execute on function public.nastra_reseed(timestamptz) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.nastra_reseed(timestamptz) to service_role;
    grant select on public.session_archive to service_role;
  end if;
end $$;
