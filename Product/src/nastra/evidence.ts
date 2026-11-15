import type { PatternResult } from './patterns';
import type { Protocol } from './protocols/registry';
import type { KnowledgeRow, MissionCtx, MoodRow, SleepRow, VitalsNow } from './tools/gateway';
import type { SourceRef } from './types';

/**
 * Evidence is what the model is allowed to talk about, and exactly what the
 * evidence panel shows. Every item says what kind of claim it is.
 */
export type EvidenceKind = 'observed' | 'context' | 'pattern' | 'knowledge';

export interface EvidenceItem {
  id: string; // E1, E2…
  kind: EvidenceKind;
  title: string;
  detail: string;
  source: { label: string; url?: string; use: 'direct' | 'indirect' | 'simulated_data' };
}

const METRIC_LABEL: Record<string, { name: string; unit: string }> = {
  heart_rate_bpm: { name: 'Heart rate', unit: 'bpm' },
  hrv_rmssd_ms: { name: 'Heart rate variability', unit: 'ms' },
  systolic_mmhg: { name: 'Systolic BP', unit: 'mmHg' },
  diastolic_mmhg: { name: 'Diastolic BP', unit: 'mmHg' },
  spo2_pct: { name: 'SpO2', unit: '%' },
  resp_rate_bpm: { name: 'Breathing rate', unit: '/min' },
  skin_temp_c: { name: 'Skin temperature', unit: '°C' },
};

/** Display cutoff for "noticeably different FOR YOU" (|z| ≥ 1.5). Statistical, not clinical. */
const NOTABLE_Z = 1.5;

export function buildEvidence(input: {
  vitals?: VitalsNow;
  sleep?: SleepRow[];
  mood?: MoodRow[];
  mission?: MissionCtx;
  pattern?: PatternResult;
  knowledge?: KnowledgeRow[];
  protocol?: Protocol | null;
}): EvidenceItem[] {
  const items: Omit<EvidenceItem, 'id'>[] = [];
  const BIO = { label: 'Bio-Monitor-style telemetry (simulated)', use: 'simulated_data' as const };

  if (input.vitals?.metrics.length) {
    const v = input.vitals;
    const lines = v.metrics
      .filter((m) => m.metric === 'heart_rate_bpm' || (m.z !== null && Math.abs(m.z) >= NOTABLE_Z))
      .map((m) => {
        const l = METRIC_LABEL[m.metric] ?? { name: m.metric, unit: '' };
        const dir = m.z === null ? '' : Math.abs(m.z) < NOTABLE_Z ? 'about usual' : m.z > 0 ? 'higher than usual for you' : 'lower than usual for you';
        const whole = ['heart_rate_bpm', 'systolic_mmhg', 'diastolic_mmhg', 'hrv_rmssd_ms'].includes(m.metric);
        const f = (x: number) => (whole ? String(Math.round(x)) : fmt(x));
        return `${l.name} ${f(m.recent)} ${l.unit} vs your usual ${f(m.reference)} (${dir})`;
      });
    items.push({
      kind: 'observed',
      title: v.mode === 'post_exercise'
        ? `Vitals, ${v.minutesSinceExercise} min after exercise, vs your usual at that point`
        : `Vitals, last ${v.windowMinutes} min, vs your resting baseline`,
      detail: lines.join('; ') + '. Personal comparison, not a clinical threshold.',
      source: BIO,
    });
  }

  if (input.sleep?.length) {
    const s = input.sleep;
    items.push({
      kind: 'observed',
      title: `Sleep, last ${s.length} nights`,
      detail: `${s.map((x) => `${fmt(x.hours)} h`).join(', ')} (most recent first). Your 14-day average: ${fmt(s[0].avg_hours_14d)} h.`,
      source: { label: 'Sleep logs: actigraphy + self-report (simulated)', use: 'simulated_data' },
    });
  }

  if (input.mood?.length) {
    const m = input.mood[0];
    items.push({
      kind: 'observed',
      title: 'Latest self check-in',
      detail: `Mood ${m.mood}/5, stress ${m.stress}/5, fatigue ${m.fatigue}/5.${m.note ? ` Note: "${m.note}"` : ''}`,
      source: { label: 'Self-report, NASA Standard Measures style (simulated)', use: 'simulated_data' },
    });
  }

  if (input.mission) {
    const c = input.mission;
    const bits: string[] = [];
    if (c.minutes_since_exercise !== null && c.minutes_since_exercise <= 180) bits.push(`exercise ended ${c.minutes_since_exercise} min ago`);
    if (c.current_activity) bits.push(`current activity: ${c.current_activity.title}`);
    const upcoming = c.next_events.filter((e) => ['briefing', 'eva_prep', 'eva'].includes(e.activity)).slice(0, 3);
    if (upcoming.length) bits.push(`coming up: ${upcoming.map((e) => `${e.title} in ${fmt(e.hours_until)} h`).join(', ')}`);
    items.push({
      kind: 'context',
      title: `Mission context: day ${c.mission_day}, ${c.context.replace('_', '-')}`,
      detail: bits.join('; ') + '.',
      source: { label: 'Mission timeline (simulated)', use: 'simulated_data' },
    });
  }

  if (input.pattern?.statement) {
    items.push({
      kind: 'pattern',
      title: 'Similar episodes in your history',
      detail: `${input.pattern.statement} ${input.pattern.caveat}`,
      source: { label: 'NASTRA event history (structured match)', use: 'simulated_data' },
    });
  }

  for (const k of input.knowledge ?? []) {
    items.push({
      kind: 'knowledge',
      title: `NASA ${k.source_name}${k.section ? ` — ${k.section}` : ''}`.replace(/^NASA (NASA|CSA) /, '$1 '),
      detail: k.content,
      source: { label: `${k.source_org}: ${k.source_name}`, url: k.source_url, use: 'direct' },
    });
  }

  // Until knowledge snippets are loaded: cite the protocol's NASA sources by name only.
  if (!input.knowledge?.length && input.protocol) {
    for (const s of input.protocol.sources.filter((x: SourceRef) => x.use === 'direct').slice(0, 2)) {
      items.push({
        kind: 'knowledge',
        title: s.name,
        detail: `NASA's Human Research Program lists this as a human spaceflight risk it studies.`,
        source: { label: `${s.org}: ${s.name}`, url: s.url, use: 'direct' },
      });
    }
  }

  return items.map((it, i) => ({ id: `E${i + 1}`, ...it }));
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}
