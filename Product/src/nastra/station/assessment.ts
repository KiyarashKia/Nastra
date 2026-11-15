import type { EvidenceItem } from '../evidence';
import type { Protocol, FollowUpQuestion } from '../protocols/registry';
import type { ExplanationResult } from '../respond/respond';
import type { KnowledgeRow, MissionCtx, SleepRow, VitalsNow } from '../tools/gateway';

/**
 * Structures the Station UI renders with NHIS components. Built in code from
 * evidence the tools returned; the only model-written field is `assessment`,
 * which has already passed output validation (or is the fact-only fallback).
 */

export interface QuestionOut {
  id: string;
  text: string;
  short: string;
  redFlag: boolean;
  options: { id: string; label: string }[];
}

export function questionOut(q: FollowUpQuestion): QuestionOut {
  return { id: q.id, text: q.text, short: q.short ?? q.text, redFlag: q.redFlag, options: (q.options ?? []).map((o) => ({ id: o.id, label: o.label })) };
}

export interface Readback {
  title: string;
  summary: string;
  items: { label: string; value: string }[];
}

export function buildReadback(values: Record<string, string>, mission?: MissionCtx): Readback {
  const ctx = contextLine(mission);
  const items: Readback['items'] = [{ label: 'In your words', value: values.description }];
  if (values.onset) items.push({ label: 'Started', value: values.onset });
  if (values.severity) items.push({ label: 'Strength', value: values.severity });
  if (values.trigger) items.push({ label: 'Tied to', value: values.trigger });
  if (values.activity) items.push({ label: 'Doing', value: values.activity });
  if (ctx) items.push({ label: 'Context', value: ctx });
  items.push({ label: 'Warning signs', value: 'None reported' });

  const parts = [
    `${cap(values.description.replace(/[.!?]+$/, ''))}${values.onset ? `, started ${values.onset}` : ''}${ctx ? `, ${ctx}` : ''}.`,
    values.severity ? `${cap(values.severity)} intensity.` : null,
    'No warning signs reported.',
  ].filter(Boolean);
  return { title: 'Confirm what NASTRA understood', summary: parts.join(' '), items };
}

export function contextLine(mission?: MissionCtx): string | null {
  if (!mission) return null;
  if (mission.minutes_since_exercise !== null && mission.minutes_since_exercise <= 180) return `${mission.minutes_since_exercise} min after exercise`;
  if (mission.current_activity) return `during ${mission.current_activity.title.toLowerCase()}`;
  return null;
}

/* ── Assessment (NHIS AIAssessment props, serialisable) ─────────────────── */
export type ObservationCategory = 'measured' | 'derived' | 'retrieved';
export interface AssessmentOut {
  title: string;
  generatedAt: string;
  observations: { text: string; category: ObservationCategory; origin: 'measured' | 'self-reported' | 'derived' | 'context' }[];
  pattern: { statement: string; caveat: string } | null;
  assessment: string;
  assessmentSource: 'model' | 'fallback';
  confidence: { level: 'high' | 'medium' | 'low'; meaning: string; nextAction: string };
  recommendedAction: { text: string; protocol: { id: string; title: string } };
  evidence: {
    signals: { name: string; window: string; summary: string; category: 'measured' | 'derived' }[];
    baseline?: string;
    protocol: { id: string; title: string };
    retrieved: { title: string; reference: string }[];
    gaps: string[];
  };
}

export function buildAssessment(p: {
  protocol: Protocol;
  evidence: EvidenceItem[];
  explanation: ExplanationResult;
  vitals: VitalsNow;
  sleep: SleepRow[];
  knowledge: KnowledgeRow[];
  steps: string[];
  clarity: 'clear' | 'unclear';
  asOf: string;
  values: Record<string, string>;
}): AssessmentOut {
  const observations: AssessmentOut['observations'] = [];
  const signals: AssessmentOut['evidence']['signals'] = [];
  let pattern: AssessmentOut['pattern'] = null;
  for (const e of p.evidence) {
    if (e.kind === 'knowledge') continue;
    if (e.kind === 'pattern') {
      const [statement, ...rest] = e.detail.split(/(?<=\.)\s+(?=Association|This is|Causation|Past)/);
      pattern = { statement: statement.trim(), caveat: rest.join(' ').trim() || 'Association only. Causation is not established, and past episodes do not make the current one safe.' };
      observations.push({ text: e.detail, category: 'derived', origin: 'derived' });
      signals.push({ name: e.title, window: '21 days', summary: e.detail, category: 'derived' });
      continue;
    }
    const selfReport = /check-in/i.test(e.title);
    const origin = e.kind === 'context' ? 'context' : selfReport ? 'self-reported' : 'measured';
    observations.push({ text: `${e.title}: ${e.detail}`, category: 'measured', origin });
    signals.push({ name: e.title, window: windowFor(e, p.vitals), summary: e.detail, category: 'measured' });
  }

  const gaps: string[] = [];
  if (!p.vitals.metrics.length) gaps.push('No recent vitals in the comparison window');
  if (!p.sleep.length) gaps.push('No recent sleep records');
  if (!p.knowledge.length) gaps.push('No NASA reference matched this report');
  if (p.explanation.source === 'fallback') gaps.push('Model explanation rejected; facts shown without interpretation');

  const level: AssessmentOut['confidence']['level'] = gaps.length === 0 && p.clarity === 'clear' ? 'high' : gaps.length <= 1 ? 'medium' : 'low';
  const meaning =
    level === 'high' ? 'Every input this protocol uses was available, and your report was clear.'
    : gaps.length ? `Missing: ${gaps[0].charAt(0).toLowerCase()}${gaps[0].slice(1)}.`
    : 'Your report needed a read-back before assessment.';
  const code = { id: p.protocol.code, title: p.protocol.title };

  return {
    title: `${p.protocol.title}${p.values.description ? ` — "${short(p.values.description, 48)}"` : ''}`,
    generatedAt: p.asOf,
    observations,
    pattern,
    assessment: p.explanation.text,
    assessmentSource: p.explanation.source,
    confidence: { level, meaning, nextAction: p.steps[0] ?? 'Follow the protocol steps.' },
    recommendedAction: { text: p.steps.join(' '), protocol: code },
    evidence: {
      signals,
      baseline: p.vitals.mode === 'post_exercise'
        ? `Your own typical values at the same minutes after exercise, from the last 14 days. Statistical comparison, not a clinical threshold.`
        : `Your own resting baseline over the last 14 days (excluding the last 24 h). Statistical comparison, not a clinical threshold.`,
      protocol: code,
      retrieved: p.knowledge.map((k) => ({ title: `${k.source_org} ${k.source_name}${k.section ? ` — ${k.section}` : ''}`.replace(/^(NASA|CSA) (NASA|CSA) /, '$1 '), reference: k.source_url })),
      gaps,
    },
  };
}

function windowFor(e: EvidenceItem, v: VitalsNow): string {
  if (/^Vitals/.test(e.title)) return `last ${v.windowMinutes} min`;
  if (/^Sleep/.test(e.title)) return 'last 3 nights';
  if (/check-in/i.test(e.title)) return 'latest';
  return 'now';
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ── Progress ───────────────────────────────────────────────────────────── */
export interface ProgressEvent { step: number; of: number; label: string; state: 'running' | 'done' | 'failed' }

export function progressReporter(onProgress: ((e: ProgressEvent) => void) | undefined, of: number) {
  let n = 0;
  return async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const step = ++n;
    onProgress?.({ step, of, label, state: 'running' });
    try {
      const r = await fn();
      onProgress?.({ step, of, label, state: 'done' });
      return r;
    } catch (err) {
      onProgress?.({ step, of, label, state: 'failed' });
      throw err;
    }
  };
}
