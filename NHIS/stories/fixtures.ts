/**
 * SIMULATED FIXTURES — for the NHIS review environment only.
 * Not measured telemetry, not medical thresholds, not mission data.
 * Alert classes and limits below are inputs a real health-assessment layer or
 * approved source would supply; NHIS components only present them.
 */
import type { OperationalAlert, Timestamp } from '../semantics/model';
import type { BaselineBand, ChartLimit, Sample } from '../visualization/scales';

export const FIXTURE_LABEL = 'Simulated fixture — not live data';

export const MISSION_EPOCH = '2026-11-02T06:00:00Z';
export const NOW_ISO = '2026-11-14T14:32:00Z';
export const NOW_MS = Date.parse(NOW_ISO);

export const utc = (iso: string): Timestamp => ({ iso, system: 'UTC' });
export const met = (iso: string): Timestamp => ({ iso, system: 'MET', missionEpochIso: MISSION_EPOCH });
export const minutesAgo = (m: number) => new Date(NOW_MS - m * 60_000).toISOString();

/** Deterministic pseudo-random walk so screenshots are stable. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function series({
  minutes = 240,
  every = 5,
  start = 64,
  drift = 0,
  noise = 2,
  seed = 7,
  gapsAt = [] as Array<[number, number]>,
  endMinutesAgo = 0,
  decimals = 0,
}): Sample[] {
  const r = rng(seed);
  const out: Sample[] = [];
  let v = start;
  for (let m = minutes; m >= endMinutesAgo; m -= every) {
    v += drift * every + (r() - 0.5) * noise;
    const inGap = gapsAt.some(([a, b]) => m <= a && m >= b);
    out.push({ t: minutesAgo(m), v: inGap ? null : Number(v.toFixed(decimals)) });
  }
  return out;
}

export const HR_BASELINE: BaselineBand = { low: 58, high: 70, reference: 64, label: 'Personal baseline · 14-day' };
export const HR_NOMINAL = series({ start: 63, noise: 3, seed: 3 });
export const HR_RISING = series({ start: 62, drift: 0.12, noise: 3, seed: 11 });
export const HR_WITH_GAP = series({ start: 63, noise: 3, seed: 5, gapsAt: [[150, 115]] });
export const HR_STALE = series({ start: 63, noise: 3, seed: 9, endMinutesAgo: 25 });

/** Example limit for demonstrating chart rendering. NOT a medical threshold. */
export const EXAMPLE_LIMIT: ChartLimit = {
  value: 88,
  priority: 'caution',
  direction: 'above',
  source: 'Example limit (fixture) — supplied by approved protocol in production',
};

export const SPO2_SERIES = series({ start: 97, noise: 0.6, seed: 4, decimals: 0 });
export const SLEEP_BASELINE: BaselineBand = { low: 6.2, high: 7.4, reference: 6.8, label: 'Personal baseline · 30-day' };

export const CREW = { name: 'A. Rivera', role: 'Mission specialist (fixture)' };

const base = {
  source: 'Health telemetry',
  origin: { kind: 'health-assessment', engine: 'NASTRA assessment (simulated)' } as const,
  active: true,
  acknowledgement: 'unacknowledged' as const,
  annunciation: 'annunciating' as const,
};

export const ADVISORY: OperationalAlert = {
  ...base,
  id: 'adv-1',
  priority: 'advisory',
  title: 'Sleep duration below personal baseline for 3 nights',
  timestamp: utc(minutesAgo(95)),
  detail: 'Logged for review. No action needed now.',
};

export const CAUTION: OperationalAlert = {
  ...base,
  id: 'cau-1',
  priority: 'caution',
  title: 'Heart rate trend above personal baseline',
  timestamp: utc(minutesAgo(12)),
  protocol: { id: 'PRT-CV-02', title: 'Elevated resting heart rate review' },
  detail: 'Resting heart rate has stayed above your baseline band for 40 minutes.',
};

export const WARNING: OperationalAlert = {
  ...base,
  id: 'war-1',
  priority: 'warning',
  title: 'SpO₂ below the protocol limit',
  timestamp: utc(minutesAgo(1)),
  protocol: { id: 'PRT-RS-01', title: 'Low oxygen saturation response' },
};

export const EMERGENCY: OperationalAlert = {
  id: 'emg-1',
  priority: 'emergency',
  title: 'Rapid depressurisation · Node 3',
  source: 'Vehicle caution and warning',
  origin: { kind: 'vehicle-system', sourceId: 'VEH-CW' },
  timestamp: utc(minutesAgo(0)),
  active: true,
  acknowledgement: 'unacknowledged',
  annunciation: 'annunciating',
  protocol: { id: 'EMER-DP-1', title: 'Rapid depressurisation response' },
  authorization: {
    kind: 'vehicle-system',
    sourceId: 'VEH-CW',
    sourceName: 'Vehicle caution and warning system',
    assertedAt: utc(minutesAgo(0)),
    reference: 'Simulated assertion',
  },
};

/** An Emergency that an AI model tried to assign. NHIS must reject it. */
export const AI_ASSIGNED_EMERGENCY: OperationalAlert = {
  ...base,
  id: 'emg-bad',
  priority: 'emergency',
  title: 'Possible cardiac event (model inference)',
  timestamp: utc(minutesAgo(0)),
  protocol: { id: 'PRT-CV-09', title: 'Chest pain assessment' },
};

export const ALERT_LOG: OperationalAlert[] = [
  CAUTION,
  ADVISORY,
  { ...ADVISORY, id: 'adv-2', title: 'Hydration log not entered today', timestamp: utc(minutesAgo(240)), active: false, acknowledgement: 'acknowledged' },
  {
    ...CAUTION,
    id: 'cau-0',
    title: 'Skin temperature sensor reporting intermittently',
    source: 'Wearable sensor',
    timestamp: utc(minutesAgo(380)),
    annunciation: 'inhibited',
    acknowledgement: 'acknowledged',
    protocol: { id: 'PRT-EQ-03', title: 'Sensor fit check' },
  },
  { ...WARNING, id: 'war-0', title: 'Heart rate above protocol limit during exercise', timestamp: utc(minutesAgo(1440)), active: false, acknowledgement: 'acknowledged' },
];
