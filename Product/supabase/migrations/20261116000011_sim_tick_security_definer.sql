-- The simulated feed writes vitals and cabin rows, which are read-only for the app's role
-- (found on the hosted deploy: every call returned 403 and the feed never advanced).
-- Like nastra_reseed, it runs with its owner's rights; only service_role may execute it.
alter function public.nastra_sim_tick(text, timestamptz) security definer;
alter function public.nastra_sim_tick(text, timestamptz) set search_path = public;
revoke all on function public.nastra_sim_tick(text, timestamptz) from public, anon, authenticated;
grant execute on function public.nastra_sim_tick(text, timestamptz) to service_role;
