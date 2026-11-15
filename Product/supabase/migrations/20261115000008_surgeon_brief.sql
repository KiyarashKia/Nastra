-- Flight-surgeon handover brief.
-- An alert used to carry only the trigger ("answered yes to the warning-signs
-- check") and the last message. It now carries a structured brief built in code:
-- headline, precise trigger, warning signs in the crew member's own words, the
-- complaint, flagged data with numbers, the full conversation, what is still
-- unknown, and the model's reading labelled unverified.
-- Grounding: NASA-STD-3001 Vol 1 / OCHMO Longitudinal Health Surveillance [indirect]

alter table public.surgeon_alerts add column if not exists headline text;
alter table public.surgeon_alerts add column if not exists brief jsonb not null default '{}'::jsonb;

-- The conversation of one event, oldest first. Read-only, named, server-only.
create or replace function public.event_transcript(p_event_id uuid)
returns table (ts timestamptz, role text, content text)
language sql stable
set search_path = public
as $$
  select t.ts, t.role, t.content from public.event_turns t
  where t.event_id = p_event_id
  order by t.ts, t.id;
$$;

revoke execute on function public.event_transcript(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.event_transcript(uuid) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.event_transcript(uuid) to service_role;
  end if;
end $$;
