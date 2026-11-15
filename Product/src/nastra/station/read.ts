import { escalationFromAlert, type EscalationView } from './link';
import type { Db } from '../db/types';
import { PROTOCOLS, type Protocol } from '../protocols/registry';
import type { EventState } from '../router';
import { ToolGateway, type MissionCtx, type VitalsNow } from '../tools/gateway';
import { contextLine } from './assessment';
import { MONITOR_Z, runMonitor } from './monitor';

/**
 * Read models for NASTRA Station screens. Serializable, NHIS-shaped, computed
 * in code. Every comparison is against the crew member's own data and labelled
 * as such. Freshness policy below is a DEMO policy owned by the NASTRA team
 * (NHIS: each stream owner must supply one).
 */
export const FRESHNESS = { delayedAfterMs: 10 * 60_000, staleAfterMs: 30 * 60_000, owner: 'NASTRA team (demo policy)' };

export type Quality = 'live' | 'delayed' | 'stale' | 'unavailable';
export interface Sample { t: string; v: number | null }
export interface Band { low: number; high: number; reference?: number; label: string }

export interface AlertOut {
  id: string;
  priority: 'advisory' | 'caution' | 'warning';
  title: string;
  detail: string | null;
  source: string;
  engine: string;
  metric: string | null;
  createdAt: string;
  active: boolean;
  acknowledged: boolean;
  annunciation: 'annunciating' | 'silenced' | 'suppressed' | 'inhibited';
  protocol: { id: string; title: string } | null;
  eventId: string | null;
}

export interface TileOut {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  value: number | undefined;
  samples: Sample[];
  baseline?: Band;
  status: 'nominal' | 'advisory';
  quality: Quality;
  origin: 'measured' | 'estimated' | 'manual-entry';
  ageMs?: number;
  trend?: string;
}

const qualityFor = (ageMs: number | undefined): Quality =>
  ageMs === undefined ? 'unavailable' : ageMs > FRESHNESS.staleAfterMs ? 'stale' : ageMs > FRESHNESS.delayedAfterMs ? 'delayed' : 'live';

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown) => new Date(String(v)).toISOString();
const parse = (v: unknown): Record<string, unknown> => (typeof v === 'string' ? JSON.parse(v) : (v as Record<string, unknown>) ?? {});

export async function crewProfile(db: Db, crewId: string, asOf: string) {
  const p = parse(await db.rpcScalar('crew_profile', { p_crew_id: crewId, p_as_of: asOf }));
  return {
    crewId, name: String(p.name ?? crewId), role: String(p.role ?? ''), agency: String(p.agency ?? ''),
    mission: String(p.mission ?? ''), metDay: Math.max(0, Number(p.mission_day ?? 1) - 1), launchAt: iso(p.launch_at), simulated: p.simulated !== false,
  };
}

export async function alertsFor(db: Db, crewId: string, includeInactive = false): Promise<AlertOut[]> {
  const rows = await db.rpc<Record<string, unknown>>('crew_alert_feed', { p_crew_id: crewId, p_include_inactive: includeInactive });
  return rows.map((r) => ({
    id: String(r.id), priority: r.priority as AlertOut['priority'], title: String(r.title), detail: (r.detail as string) ?? null,
    source: String(r.source), engine: String(r.engine), metric: (r.metric as string) ?? null, createdAt: iso(r.created_at),
    active: Boolean(r.active), acknowledged: r.acknowledged_at != null, annunciation: r.annunciation as AlertOut['annunciation'],
    protocol: r.protocol_code ? { id: String(r.protocol_code), title: String(r.protocol_title ?? '') } : null,
    eventId: (r.event_id as string) ?? null,
  }));
}

/* ── Overview ───────────────────────────────────────────────────────────── */
export async function getOverview(db: Db, crewId: string, asOf: string) {
  await runMonitor(db, crewId, asOf).catch(() => undefined);
  const gw = new ToolGateway(db, { crewId, asOf, allowed: ['telemetry.vitals_now', 'health.recent_sleep', 'health.recent_mood', 'mission.current_context', 'health.similar_episodes'] });
  const [profile, alerts, vitals, sleep14, moods, mission, series, env] = await Promise.all([
    crewProfile(db, crewId, asOf),
    alertsFor(db, crewId),
    gw.vitalsNow(30).catch(() => undefined),
    gw.recentSleep(14).catch(() => []),
    gw.recentMood(14).catch(() => []),
    gw.missionContext().catch(() => undefined),
    db.rpc<Record<string, unknown>>('vitals_series', { p_crew_id: crewId, p_from: new Date(Date.parse(asOf) - 6 * 3600_000).toISOString(), p_to: asOf, p_bucket_minutes: 15 }),
    db.rpcScalar('environment_now', { p_as_of: asOf }).then(parse).catch(() => ({})),
  ]);

  const lastTs = series.length ? Date.parse(String(series[series.length - 1].ts)) : undefined;
  // Series timestamps are bucket starts (15 min); the newest sample can be up to one bucket later.
  const ageMs = lastTs !== undefined ? Math.max(0, Date.parse(asOf) - lastTs - 15 * 60_000) : undefined;
  const tiles: TileOut[] = [
    vitalTile('heart_rate_bpm', 'Heart rate', 'bpm', 0, vitals, series, alerts, ageMs),
    vitalTile('spo2_pct', 'SpO₂', '%', 0, vitals, series, alerts, ageMs),
    vitalTile('hrv_rmssd_ms', 'HRV (rMSSD)', 'ms', 0, vitals, series, alerts, ageMs),
    vitalTile('systolic_mmhg', 'BP, systolic', 'mmHg', 0, vitals, series, alerts, ageMs),
  ];

  // Sleep: actigraphy + self-report, so the value is an estimate (≈).
  const sleepNow = sleep14[0];
  const nights = [...sleep14].reverse();
  const sleepSd = sd(nights.map((s) => s.hours));
  const sleepTile: TileOut = {
    key: 'sleep', label: 'Sleep, last night', unit: 'h', decimals: 1, value: sleepNow?.hours,
    samples: nights.map((s) => ({ t: iso(s.sleep_end), v: s.hours })),
    baseline: sleepNow ? { low: round1(sleepNow.avg_hours_14d - sleepSd), high: round1(sleepNow.avg_hours_14d + sleepSd), reference: sleepNow.avg_hours_14d, label: 'Your 14-day average ± 1 SD' } : undefined,
    status: alerts.some((a) => a.metric === 'sleep' && a.active) ? 'advisory' : 'nominal',
    quality: sleepNow ? 'live' : 'unavailable', origin: 'estimated',
    ageMs: sleepNow ? Date.parse(asOf) - Date.parse(iso(sleepNow.sleep_end)) : undefined,
  };

  const latestMood = moods[0];
  const level = (x: number) => (x <= 2 ? 'Low' : x === 3 ? 'Moderate' : 'High');
  const stress = latestMood
    ? { label: level(latestMood.stress), mood: latestMood.mood, stress: latestMood.stress, fatigue: latestMood.fatigue, note: latestMood.note, at: iso(latestMood.ts), origin: 'self-reported' as const }
    : null;
  const checkInDoneToday = latestMood ? Date.parse(asOf) - Date.parse(iso(latestMood.ts)) < 12 * 3600_000 : false;

  const pattern = await patternFor(db, gw, crewId, asOf);
  const escalation = await escalationState(db, crewId, asOf);
  const openEvent = await openEventFor(db, crewId, asOf);

  const active = alerts.filter((a) => a.active);
  const top = active.find((a) => a.priority === 'warning') ?? active.find((a) => a.priority === 'caution') ?? active[0];
  const count = (p: string) => active.filter((a) => a.priority === p).length;
  const sentence = !active.length
    ? 'No health concerns requiring attention.'
    : [
        count('warning') && `${count('warning')} warning`,
        count('caution') && `${count('caution')} caution`,
        count('advisory') && `${count('advisory') === 1 ? 'One advisory' : `${count('advisory')} advisories`}`,
      ].filter(Boolean).join(', ') + `. ${top!.title}.`;

  return {
    asOf,
    profile,
    status: { sentence, level: (top?.priority ?? 'nominal') as 'nominal' | AlertOut['priority'], updatedAt: asOf },
    alerts,
    tiles,
    sleep: sleepTile,
    stress,
    checkIn: { doneToday: checkInDoneToday },
    context: missionOut(mission, asOf, env),
    pattern,
    escalation,
    openEvent,
  };
}

function vitalTile(key: string, label: string, unit: string, decimals: number, vitals: VitalsNow | undefined, series: Record<string, unknown>[], alerts: AlertOut[], ageMs?: number): TileOut {
  const m = vitals?.metrics.find((x) => x.metric === key);
  const samples = series.map((r) => ({ t: iso(r.ts), v: n(r[key]) }));
  const ref = m?.reference;
  const spread = m?.sd ?? null;
  const baseline: Band | undefined = ref !== undefined && spread !== null
    ? {
        low: round1(ref - spread), high: round1(ref + spread), reference: round1(ref),
        label: vitals?.mode === 'post_exercise' ? `Your usual at ${vitals.minutesSinceExercise} min after exercise · 14-day mean ± 1 SD` : 'Your resting baseline · 14-day mean ± 1 SD',
      }
    : undefined;
  const recent = samples.filter((s) => s.v !== null).slice(-8).map((s) => s.v as number);
  const trend = recent.length >= 4 && spread
    ? recent[recent.length - 1] - recent[0] > spread * 0.75 ? 'Rising over 2 h' : recent[0] - recent[recent.length - 1] > spread * 0.75 ? 'Falling over 2 h' : 'Steady'
    : undefined;
  // A channel with no personal comparison at this point (e.g. SpO₂ after exercise) still shows its latest reading.
  const latestValue = recent.length ? round1(recent[recent.length - 1]) : undefined;
  const flagged = alerts.some((a) => a.metric === key && a.active) || (m?.z !== null && m?.z !== undefined && Math.abs(m.z) >= MONITOR_Z);
  return {
    key, label, unit, decimals, value: m ? round1(m.recent) : latestValue, samples, baseline,
    status: flagged ? 'advisory' : 'nominal', quality: m || latestValue !== undefined ? qualityFor(ageMs) : 'unavailable', origin: 'measured', ageMs, trend,
  };
}

function missionOut(c: MissionCtx | undefined, asOf: string, env: Record<string, unknown>) {
  if (!c) return null;
  const envNow = env as Record<string, { value: number; mean: number; sd: number } | string>;
  const channels = ['co2_mmhg', 'ppo2_kpa', 'pressure_kpa', 'temp_c', 'humidity_pct'] as const;
  const offRange = channels.filter((k) => {
    const x = envNow[k] as { value: number; mean: number; sd: number } | undefined;
    return x && x.sd > 0 && Math.abs(x.value - x.mean) / x.sd >= MONITOR_Z;
  });
  return {
    metDay: Math.max(0, c.mission_day - 1),
    context: c.context,
    line: contextLine(c),
    currentActivity: c.current_activity?.title ?? null,
    next: c.next_events.slice(0, 4).map((e) => ({ title: e.title, startsAt: iso(e.starts_at), hoursUntil: e.hours_until, activity: e.activity })),
    habitat: offRange.length ? `Habitat · ${offRange.length} reading${offRange.length > 1 ? 's' : ''} outside its 7-day range` : 'Habitat · readings within their 7-day range',
    asOf,
  };
}

async function patternFor(db: Db, gw: ToolGateway, crewId: string, asOf: string) {
  const history = await db.rpc<Record<string, unknown>>('health_history', { p_crew_id: crewId, p_limit: 50 });
  const past = history.filter((h) => h.status === 'resolved' && Date.parse(iso(h.opened_at)) > Date.parse(asOf) - 21 * 86400_000);
  const bySystem = new Map<string, Record<string, unknown>[]>();
  for (const h of past) {
    const sym = (typeof h.symptoms === 'string' ? JSON.parse(h.symptoms) : h.symptoms) as { body_system?: string; category?: string }[];
    const key = sym?.[0]?.body_system;
    if (!key) continue;
    bySystem.set(key, [...(bySystem.get(key) ?? []), h]);
  }
  const best = [...bySystem.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (!best || best[1].length < 2) return null;
  const [system, events] = best;
  const snaps = events.map((e) => parse(e.context_snapshot));
  const postEx = snaps.filter((s) => n(s.minutes_since_exercise) !== null && Number(s.minutes_since_exercise) <= 90).length;
  const shortNights = snaps.map((s) => n(s.sleep_hours_prior)).filter((x): x is number => x !== null && x < 6);
  const what = String(events[0].utterance ?? 'Similar symptoms').replace(/[.!?]+$/, '');
  const parts = [
    `${events.length} similar ${system.replace(/_/g, ' ')} reports in the last 21 days`,
    postEx === events.length ? `all after exercise` : postEx ? `${postEx} after exercise` : null,
    shortNights.length === events.length ? `all after sleep below 6 h (${shortNights.map((h) => `${h.toFixed(1)} h`).join(', ')})` : null,
  ].filter(Boolean);
  void gw;
  return {
    pattern: `${parts.join(', ')}.`,
    records: events.map((e) => `${new Date(iso(e.opened_at)).toISOString().slice(0, 10)} · "${String(e.utterance ?? '').slice(0, 48)}" · ${e.outcome ?? 'no outcome logged'}`),
    window: 'Last 21 days',
    example: what,
  };
}

export async function escalationState(db: Db, crewId: string, asOf: string): Promise<EscalationView> {
  const rows = await db.rpc<Record<string, unknown>>('surgeon_alert_feed', { p_include_acknowledged: true, p_limit: 20 });
  const mine = rows.filter((r) => r.crew_id === crewId && Date.parse(iso(r.created_at)) > Date.parse(asOf) - 24 * 3600_000);
  return escalationFromAlert(mine[0], asOf);
}

async function openEventFor(db: Db, crewId: string, asOf: string) {
  const history = await db.rpc<Record<string, unknown>>('health_history', { p_crew_id: crewId, p_limit: 10 });
  const open = history.find((h) => h.origin === 'live' && h.status === 'awaiting_followup' && Date.parse(iso(h.opened_at)) > Date.parse(asOf) - 6 * 3600_000);
  if (!open) return null;
  const turns = await db.rpc<Record<string, unknown>>('event_transcript', { p_event_id: open.id });
  const st = parse(open.context_snapshot).protocol_state as EventState | undefined;
  const p = open.protocol_id ? PROTOCOLS[String(open.protocol_id)] : undefined;
  return {
    id: String(open.id),
    openedAt: iso(open.opened_at),
    phase: st?.phase ?? 'intake',
    protocol: p ? { code: p.code, title: p.title } : null,
    transcript: turns.map((t) => ({ ts: iso(t.ts), role: String(t.role), content: String(t.content) })),
  };
}

/* ── Telemetry ──────────────────────────────────────────────────────────── */
const CHANNELS = [
  { key: 'heart_rate_bpm', label: 'Heart rate', unit: 'bpm', decimals: 0, group: 'Cardiovascular', source: 'Chest sensor (simulated Bio-Monitor channel)' },
  { key: 'hrv_rmssd_ms', label: 'HRV (rMSSD)', unit: 'ms', decimals: 0, group: 'Cardiovascular', source: 'ECG-derived (simulated Bio-Monitor channel)' },
  { key: 'systolic_mmhg', label: 'BP, systolic', unit: 'mmHg', decimals: 0, group: 'Cardiovascular', source: 'Cuff (simulated)' },
  { key: 'diastolic_mmhg', label: 'BP, diastolic', unit: 'mmHg', decimals: 0, group: 'Cardiovascular', source: 'Cuff (simulated)' },
  { key: 'spo2_pct', label: 'SpO₂', unit: '%', decimals: 0, group: 'Respiratory', source: 'Pulse oximetry (simulated Bio-Monitor channel)' },
  { key: 'resp_rate_bpm', label: 'Breathing rate', unit: '/min', decimals: 0, group: 'Respiratory', source: 'Chest band (simulated Bio-Monitor channel)' },
  { key: 'skin_temp_c', label: 'Skin temperature', unit: '°C', decimals: 1, group: 'Respiratory', source: 'Skin sensor (simulated Bio-Monitor channel)' },
] as const;
const ENV = [
  { key: 'co2_mmhg', label: 'CO₂ partial pressure', unit: 'mmHg', decimals: 1 },
  { key: 'ppo2_kpa', label: 'O₂ partial pressure', unit: 'kPa', decimals: 1 },
  { key: 'pressure_kpa', label: 'Cabin pressure', unit: 'kPa', decimals: 1 },
  { key: 'temp_c', label: 'Cabin temperature', unit: '°C', decimals: 1 },
  { key: 'humidity_pct', label: 'Relative humidity', unit: '%', decimals: 0 },
] as const;

export async function getTelemetry(db: Db, crewId: string, asOf: string, days = 7) {
  const from = new Date(Date.parse(asOf) - days * 86400_000).toISOString();
  const gw = new ToolGateway(db, { crewId, asOf, allowed: ['health.recent_sleep', 'mission.current_context'] });
  const [series, baseRows, envSeries, envNow, sleep, mission] = await Promise.all([
    db.rpc<Record<string, unknown>>('vitals_series', { p_crew_id: crewId, p_from: from, p_to: asOf, p_bucket_minutes: 60 }),
    db.rpc<Record<string, unknown>>('vitals_baseline', { p_crew_id: crewId, p_as_of: asOf, p_days: 14 }),
    db.rpc<Record<string, unknown>>('environment_series', { p_from: from, p_to: asOf, p_bucket_minutes: 60 }),
    db.rpcScalar('environment_now', { p_as_of: asOf }).then(parse).catch(() => ({})),
    gw.recentSleep(14).catch(() => []),
    gw.missionContext().catch(() => undefined),
  ]);
  const b = baseRows[0] ?? {};
  const baseKey: Record<string, string> = { heart_rate_bpm: 'hr', hrv_rmssd_ms: 'hrv', spo2_pct: 'spo2', resp_rate_bpm: 'resp', skin_temp_c: 'temp', systolic_mmhg: 'sys', diastolic_mmhg: 'dia' };
  const lastTs = series.length ? Date.parse(String(series[series.length - 1].ts)) : undefined;
  // Series timestamps are 60-min bucket starts.
  const ageMs = lastTs !== undefined ? Math.max(0, Date.parse(asOf) - lastTs - 60 * 60_000) : undefined;

  const vitals = CHANNELS.map((c) => {
    const mean = n(b[`${baseKey[c.key]}_mean`]);
    const spread = n(b[`${baseKey[c.key]}_sd`]);
    const samples = series.map((r) => ({ t: iso(r.ts), v: n(r[c.key]) }));
    const baseline = mean !== null && spread !== null ? { low: round1(mean - spread), high: round1(mean + spread), reference: round1(mean), label: 'Your 14-day mean ± 1 SD (all activity, excludes last 24 h)' } : undefined;
    const latest = [...samples].reverse().filter((s) => s.v !== null).slice(0, 6).map((s) => ({
      t: s.t, v: s.v as number,
      against: !baseline ? 'No baseline' : (s.v as number) > baseline.high ? 'Above your band' : (s.v as number) < baseline.low ? 'Below your band' : 'Within your band',
    }));
    return { ...c, samples, baseline, latest, quality: qualityFor(ageMs), ageMs };
  });

  const envLast = envSeries.length ? Date.parse(String(envSeries[envSeries.length - 1].ts)) : undefined;
  const envAge = envLast !== undefined ? Math.max(0, Date.parse(asOf) - envLast - 60 * 60_000) : undefined;
  const environment = ENV.map((c) => {
    const now = (envNow as Record<string, { value: number; mean: number; sd: number }>)[c.key];
    return {
      ...c, source: 'Habitat atmosphere monitor (simulated)',
      samples: envSeries.map((r) => ({ t: iso(r.ts), v: n(r[c.key]) })),
      baseline: now ? { low: round1(Number(now.mean) - Number(now.sd)), high: round1(Number(now.mean) + Number(now.sd)), reference: round1(Number(now.mean)), label: 'Habitat 7-day mean ± 1 SD (not a limit)' } : undefined,
      value: now ? Number(now.value) : undefined,
      quality: qualityFor(envAge), ageMs: envAge,
    };
  });

  const nights = [...sleep].reverse();
  return {
    asOf, days, freshness: FRESHNESS,
    vitals,
    sleep: {
      samples: nights.map((s) => ({ t: iso(s.sleep_end), v: s.hours })),
      baseline: sleep[0] ? { low: round1(sleep[0].avg_hours_14d - sd(nights.map((s) => s.hours))), high: round1(sleep[0].avg_hours_14d + sd(nights.map((s) => s.hours))), reference: sleep[0].avg_hours_14d, label: 'Your 14-day average ± 1 SD' } : undefined,
      nights: sleep.map((s) => ({ end: iso(s.sleep_end), hours: s.hours, quality: s.quality })),
      source: 'Actigraphy + self-report (simulated)',
    },
    environment,
    exercise: mission?.minutes_since_exercise ?? null,
  };
}

/* ── History ────────────────────────────────────────────────────────────── */
export async function getHistory(db: Db, crewId: string, asOf: string) {
  const gw = new ToolGateway(db, { crewId, asOf, allowed: ['health.recent_mood'] });
  const [rows, moods, alerts] = await Promise.all([
    db.rpc<Record<string, unknown>>('health_history', { p_crew_id: crewId, p_limit: 100 }),
    gw.recentMood(30).catch(() => []),
    alertsFor(db, crewId, true),
  ]);
  const events = rows.map((r) => {
    const sym = ((typeof r.symptoms === 'string' ? JSON.parse(r.symptoms) : r.symptoms) ?? []) as { said?: string; category?: string; body_system?: string }[];
    const p = r.protocol_id ? PROTOCOLS[String(r.protocol_id)] : undefined;
    const domain = String(r.domain ?? '');
    const category = domain === 'psychological' ? 'psychological' : domain === 'health_data' ? 'data' : 'physical';
    return {
      id: String(r.id), at: iso(r.opened_at), closedAt: r.closed_at ? iso(r.closed_at) : null, status: String(r.status),
      origin: String(r.origin) as 'live' | 'simulated_history', title: String(r.utterance ?? ''), category,
      bodySystems: [...new Set(sym.map((s) => s.body_system).filter(Boolean))] as string[],
      missionContext: (r.mission_context as string) ?? null, urgency: (r.urgency as string) ?? null,
      protocol: p ? { code: p.code, title: p.title } : null,
      outcome: (r.outcome as string) ?? null, notes: (r.outcome_notes as string) ?? null, summary: (r.ai_summary as string) ?? null,
    };
  });
  const groups = new Map<string, typeof events>();
  for (const e of events) {
    if (e.category !== 'physical' && e.category !== 'psychological') continue;
    const key = `${e.bodySystems[0] ?? e.category}${e.missionContext === 'post_exercise' ? ' · post-exercise' : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return {
    asOf,
    events,
    patternGroups: [...groups.entries()].filter(([, v]) => v.length >= 2).map(([k, v]) => ({
      label: k.replace(/_/g, ' '), count: v.length, eventIds: v.map((e) => e.id),
      note: 'Association only. Causation is not established, and past episodes do not make a current one safe.',
    })),
    checkIns: moods.map((m) => ({ at: iso(m.ts), mood: m.mood, stress: m.stress, fatigue: m.fatigue, note: m.note, origin: 'self-reported' as const })),
    alerts,
  };
}

/* ── Protocol ───────────────────────────────────────────────────────────── */
export type StepState = 'pending' | 'current' | 'completed' | 'paused' | 'failed' | 'blocked';

export async function getProtocolView(db: Db, crewId: string, asOf: string) {
  const rows = await db.rpc<Record<string, unknown>>('health_history', { p_crew_id: crewId, p_limit: 30 });
  const live = rows.filter((r) => r.origin === 'live');
  const recent = live.find((r) => Date.parse(iso(r.opened_at)) > Date.parse(asOf) - 6 * 3600_000 && (r.status === 'awaiting_followup' || r.status === 'escalated' || r.status === 'open'));
  const escalation = await escalationState(db, crewId, asOf);
  const active = recent ? protocolSteps(recent, escalation.state) : null;
  const previous = rows
    .filter((r) => r !== recent && r.protocol_id)
    .slice(0, 10)
    .map((r) => {
      const p = PROTOCOLS[String(r.protocol_id)];
      return { eventId: String(r.id), code: p?.code ?? String(r.protocol_id), title: p?.title ?? String(r.protocol_id), at: iso(r.opened_at), status: String(r.status), outcome: (r.outcome as string) ?? null, origin: String(r.origin) };
    });
  return { asOf, active, previous, escalation };
}

function protocolSteps(r: Record<string, unknown>, escalationState: string) {
  const escalated = r.status === 'escalated';
  const p: Protocol | undefined = escalated ? PROTOCOLS.red_flag_response : PROTOCOLS[String(r.protocol_id)];
  if (!p) return null;
  const st = (parse(r.context_snapshot).protocol_state ?? {}) as EventState;
  const phase = st.phase ?? 'intake';
  const opened = iso(r.opened_at);
  const closed = r.closed_at ? iso(r.closed_at) : null;
  const redFlagsCleared = (st.asked ?? []).some((a) => a.id.startsWith('q_red_flags') && a.answer === 'no');

  const stateOf = (id: string): StepState => {
    if (escalated) {
      if (id === 'safety') return 'completed';
      if (id === 'ground') return escalationState === 'draft' ? 'current' : 'completed';
      return 'current';
    }
    const resolved = r.status === 'resolved';
    switch (id) {
      case 'safety': return redFlagsCleared ? 'completed' : 'current';
      case 'clarify': return phase === 'intake' ? (redFlagsCleared ? 'current' : 'pending') : 'completed';
      case 'context': case 'history': case 'action': return phase === 'assessed' ? 'completed' : phase === 'readback' && id === 'context' ? 'pending' : 'pending';
      case 'recheck': return resolved ? 'completed' : phase === 'assessed' ? 'current' : 'pending';
      default: return 'pending';
    }
  };
  const steps = p.steps.map((s) => ({
    id: s.id,
    title: s.id === 'recheck' && p.recheckMinutes ? `Recheck in ${p.recheckMinutes} min` : s.title,
    actor: s.actor,
    state: stateOf(s.id),
    detail: stepDetail(s.id, phase, st),
  }));
  const done = steps.filter((s) => s.state === 'completed').length;
  return {
    eventId: String(r.id), code: p.code, title: p.title, version: p.version, status: p.status,
    startedAt: opened, closedAt: closed,
    state: (escalated ? 'active' : r.status === 'resolved' ? 'completed' : 'active') as 'active' | 'completed',
    phase: escalated ? 'escalated' : phase,
    steps, done,
    sources: p.sources.map((s) => ({ name: s.name, url: s.url })),
    utterance: String(r.utterance ?? ''),
  };
}

function stepDetail(id: string, phase: string, st: EventState): string | undefined {
  const v = st.values ?? {};
  if (id === 'clarify') return [v.onset && `Started ${v.onset}`, v.severity && `${v.severity}`, v.trigger && `tied to ${v.trigger}`].filter(Boolean).join(' · ') || undefined;
  if (id === 'safety' && phase !== 'intake') return 'Warning signs: none reported';
  return undefined;
}

/* ── helpers ────────────────────────────────────────────────────────────── */
function sd(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
const round1 = (x: number) => Math.round(x * 10) / 10;
