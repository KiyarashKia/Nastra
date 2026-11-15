-- NASTRA — simulated live feed (Station phase).
-- The seed ends at the reseed moment, so without a feed every reading turns "delayed" ~10 min later
-- and the UI (correctly) shows degraded-data styling. In SIMULATION mode the read layer calls this
-- to extend the simulated Bio-Monitor and cabin channels in 150-second steps up to now.
-- Deterministic (hash jitter, no random()), labelled as a simulated feed, never touches live data.
-- Values drift slowly toward the crew member's own 14-day mean (recovery), so the seeded scenario
-- (post-exercise HR, short sleep) remains visible for a demo but does not freeze in time.

create or replace function public.nastra_sim_tick(p_crew_id text, p_now timestamptz default now())
returns integer language plpgsql set search_path = public as $$
declare
  r public.vitals%rowtype;
  b record;
  t timestamptz;
  n int := 0;
  k constant numeric := 0.02;           -- 2 % toward own mean per 150 s step (same recovery rate as before)
  j numeric;
begin
  select * into r from public.vitals where crew_id = p_crew_id order by ts desc limit 1;
  if r.id is null or p_now - r.ts < interval '150 seconds' then return 0; end if;
  select avg(heart_rate_bpm) hr, avg(hrv_rmssd_ms) hrv, avg(spo2_pct) spo2, avg(resp_rate_bpm) rr,
         avg(skin_temp_c) st, avg(systolic_mmhg) sys, avg(diastolic_mmhg) dia, avg(activity_level) act
    into b from public.vitals
   where crew_id = p_crew_id and ts between r.ts - interval '14 days' and r.ts - interval '3 hours';
  t := greatest(r.ts, p_now - interval '24 hours');
  loop
    t := t + interval '150 seconds';
    exit when t > p_now;
    j := ((abs(hashtext(p_crew_id || extract(epoch from t)::bigint::text)) % 2001) / 1000.0) - 1;  -- [-1, 1]
    r.heart_rate_bpm := round(coalesce(r.heart_rate_bpm + (b.hr - r.heart_rate_bpm) * k + j * 1.2, b.hr), 1);
    r.hrv_rmssd_ms   := round(coalesce(r.hrv_rmssd_ms + (b.hrv - r.hrv_rmssd_ms) * k - j * 1.0, b.hrv), 1);
    r.spo2_pct       := round(least(100, coalesce(r.spo2_pct + (b.spo2 - r.spo2_pct) * k + j * 0.3, b.spo2)), 1);
    r.resp_rate_bpm  := round(coalesce(r.resp_rate_bpm + (b.rr - r.resp_rate_bpm) * k + j * 0.4, b.rr), 1);
    r.skin_temp_c    := round(coalesce(r.skin_temp_c + (b.st - r.skin_temp_c) * k + j * 0.03, b.st), 2);
    r.systolic_mmhg  := round(coalesce(r.systolic_mmhg + (b.sys - r.systolic_mmhg) * k + j * 1.5, b.sys));
    r.diastolic_mmhg := round(coalesce(r.diastolic_mmhg + (b.dia - r.diastolic_mmhg) * k + j * 1.0, b.dia));
    r.activity_level := least(1, greatest(0, round(coalesce(r.activity_level + (b.act - r.activity_level) * k, b.act), 2)));
    insert into public.vitals (crew_id, ts, heart_rate_bpm, hrv_rmssd_ms, spo2_pct, resp_rate_bpm, skin_temp_c,
                               systolic_mmhg, diastolic_mmhg, activity_level, source)
    values (p_crew_id, t, r.heart_rate_bpm, r.hrv_rmssd_ms, r.spo2_pct, r.resp_rate_bpm, r.skin_temp_c,
            r.systolic_mmhg, r.diastolic_mmhg, r.activity_level, 'simulated:bio-monitor (feed)');
    n := n + 1;
  end loop;

  -- Cabin environment (shared): same rule, hourly cadence as seeded.
  declare e public.cabin_environment%rowtype; eb record; et timestamptz;
  begin
    select * into e from public.cabin_environment order by ts desc limit 1;
    if e.id is not null and p_now - e.ts >= interval '60 minutes' then
      select avg(co2_mmhg) co2, avg(ppo2_kpa) po2, avg(pressure_kpa) p, avg(temp_c) tc, avg(humidity_pct) h
        into eb from public.cabin_environment where ts > e.ts - interval '7 days';
      et := greatest(e.ts, p_now - interval '24 hours');
      loop
        et := et + interval '60 minutes';
        exit when et > p_now;
        j := ((abs(hashtext('cabin' || extract(epoch from et)::bigint::text)) % 2001) / 1000.0) - 1;
        insert into public.cabin_environment (ts, co2_mmhg, ppo2_kpa, pressure_kpa, temp_c, humidity_pct, is_simulated)
        values (et, round(e.co2_mmhg + (eb.co2 - e.co2_mmhg) * 0.2 + j * 0.05, 2), round(e.ppo2_kpa + (eb.po2 - e.ppo2_kpa) * 0.2, 1),
                round(e.pressure_kpa + (eb.p - e.pressure_kpa) * 0.2, 1), round(e.temp_c + (eb.tc - e.temp_c) * 0.2 + j * 0.1, 1),
                round(e.humidity_pct + (eb.h - e.humidity_pct) * 0.2 + j * 0.5, 1), true)
        returning * into e;
      end loop;
    end if;
  end;
  return n;
end $$;

revoke execute on function public.nastra_sim_tick(text, timestamptz) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.nastra_sim_tick(text, timestamptz) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.nastra_sim_tick(text, timestamptz) to service_role;
  end if;
end $$;
