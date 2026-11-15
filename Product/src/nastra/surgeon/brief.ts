import type { EscalationTrigger } from '../router';
import { isNegated } from '../safety/redflags';
import type { EpisodeRow, MissionCtx, MoodRow, SleepRow, VitalsNow } from '../tools/gateway';

/**
 * Flight-surgeon handover brief, built in code at the moment of escalation.
 *
 * Why code and not the model: the escalation path never waits on an API call,
 * and a handover must not contain a guess. The model's reading of the crew
 * member's words is included, but only in `model_notes`, labelled unverified.
 *
 * Shape follows a clinical handover (situation → background → data → what is
 * still unknown). Grounding: NASA-STD-3001 Vol 1 / OCHMO Longitudinal Health
 * Surveillance — crew data reaches the ground medical team with context. [indirect]
 */
export interface SurgeonBrief {
  headline: string;
  trigger: string;
  /** Warning signs found in the crew member's own words, quoted. */
  reported_now: { sign: string; crew_words: string }[];
  complaint: {
    first_message: string;
    opened_at: string;
    symptoms: string[];
    onset: string | null;
    duration: string | null;
    severity: string | null;
  };
  /** Data that stands out for this person. Personal comparisons, not clinical thresholds. */
  flags: string[];
  timeline: { at: string; who: 'crew' | 'nastra'; text: string }[];
  /** The model's interpretation. Unverified, never used for the decision. */
  model_notes: string[];
}

export interface BriefInput {
  crewId: string;
  asOf: string;
  utterance: string;
  trigger: EscalationTrigger;
  event: { utterance: string | null; opened_at: string; symptoms: unknown; protocol_id: string | null; asked?: { id: string; answer: string | null }[] } | null;
  interp: {
    symptoms: { said: string; category: string; body_system: string }[];
    onset: string | null; duration: string | null; severity: string | null;
    followup_answers: { question_id: string; answer: string; detail: string | null }[];
  } | null;
  transcript: { ts: string; role: string; content: string }[];
  vitals?: VitalsNow;
  sleep?: SleepRow[];
  mood?: MoodRow[];
  mission?: MissionCtx;
  episodes?: EpisodeRow[];
  questionText: Record<string, string>;
}

/** The items of the warning-signs question, matched in the crew member's words. */
const WARNING_SIGNS: { sign: string; re: RegExp }[] = [
  { sign: 'fainting or near-fainting', re: /\b(faint\w*|pass(ed|ing)? out|black(ed)? out|collaps\w*|barely (stand\w*|conscious))\b/i },
  { sign: 'chest pain or pressure', re: /\bchest\b/i },
  { sign: 'trouble breathing', re: /\b(breath\w*|breathing|air|gasp\w*)\b/i },
  { sign: 'new weakness or numbness', re: /\b(numb\w*|weak\w*|tingl\w*|can'?t (move|feel))\b/i },
  { sign: 'trouble speaking', re: /\b(slurr\w*|can'?t (speak|talk)|words? (won'?t|don'?t) come)\b/i },
  { sign: 'vision loss or change', re: /\b(vision|can'?t see|blind|double)\b/i },
  { sign: 'sudden severe headache', re: /\b(worst|sudden|severe|thunderclap)\b.{0,20}\bheadache\b/i },
  { sign: 'thoughts of self-harm', re: /\b(hurt|harm|kill) (myself|me)\b|\bsuicid\w*/i },
];

const METRIC: Record<string, [string, string]> = {
  heart_rate_bpm: ['HR', 'bpm'], hrv_rmssd_ms: ['HRV', 'ms'], systolic_mmhg: ['Systolic BP', 'mmHg'],
  diastolic_mmhg: ['Diastolic BP', 'mmHg'], spo2_pct: ['SpO2', '%'], resp_rate_bpm: ['Breathing rate', '/min'], skin_temp_c: ['Skin temp', '°C'],
};
const NOTABLE_Z = 1.5;

export function findWarningSigns(text: string): { sign: string; crew_words: string }[] {
  const out: { sign: string; crew_words: string }[] = [];
  for (const w of WARNING_SIGNS) {
    const m = w.re.exec(text);
    if (m && !isNegated(text, m.index)) out.push({ sign: w.sign, crew_words: clauseAround(text, m.index) });
  }
  return out;
}

export function buildSurgeonBrief(b: BriefInput): SurgeonBrief {
  const reported = findWarningSigns(b.utterance);
  const symptoms = uniq([
    ...asSymptoms(b.event?.symptoms),
    ...(b.interp?.symptoms ?? []).map((s) => `${s.said} (${s.category.replace(/_/g, ' ')}, ${s.body_system.replace(/_/g, ' ')})`),
  ]);
  const onset = b.interp?.onset ?? null;
  const duration = b.interp?.duration ?? null;
  const severity = b.interp?.severity ?? null;

  // ── Flags: what stands out in the data, with numbers ──
  const flags: string[] = [];
  const v = b.vitals;
  const vitalBits: string[] = [];
  if (v?.metrics.length) {
    const ref = v.mode === 'post_exercise' ? `usual at ${v.minutesSinceExercise} min post-exercise` : 'resting baseline';
    for (const m of v.metrics) {
      if (m.z === null || Math.abs(m.z) < NOTABLE_Z) continue;
      const [name, unit] = METRIC[m.metric] ?? [m.metric, ''];
      const d = m.recent - m.reference;
      const line = `${name} ${r(m.recent)} ${unit} vs ${ref} ${r(m.reference)} (${d > 0 ? '+' : ''}${r(d)}, ${m.z > 0 ? 'higher' : 'lower'} than usual for this crew member)`;
      flags.push(line);
      if (['heart_rate_bpm', 'systolic_mmhg', 'spo2_pct'].includes(m.metric)) vitalBits.push(`${name} ${r(m.recent)} vs usual ${r(m.reference)}`);
    }
  }
  if (b.sleep?.length) {
    const s = b.sleep;
    const short = s.filter((x) => x.hours < x.avg_hours_14d - 1);
    if (short.length) flags.push(`Sleep: ${short.length} of last ${s.length} nights more than 1 h below own 14-day average (${s.map((x) => `${r1(x.hours)} h`).join(', ')}; average ${r1(s[0].avg_hours_14d)} h)`);
  }
  if (b.mood?.length) {
    const m = b.mood[0];
    if (m.stress >= 4 || m.fatigue >= 4 || m.mood <= 2) flags.push(`Self check-in ${ago(m.ts, b.asOf)}: mood ${m.mood}/5, stress ${m.stress}/5, fatigue ${m.fatigue}/5${m.note ? ` — "${m.note}"` : ''}`);
  }
  if (b.episodes?.length) {
    const eps = b.episodes.slice(0, 3).map((e) => `${ago(e.opened_at, b.asOf)} (${e.mission_context.replace(/_/g, '-')}, ${e.outcome ?? 'no outcome logged'})`);
    flags.push(`${b.episodes.length} similar past episode${b.episodes.length > 1 ? 's' : ''} in this body system: ${eps.join('; ')}`);
  }
  const c = b.mission;
  const eva = c?.next_events.find((e) => e.activity === 'eva');
  if (c) {
    if (c.minutes_since_exercise !== null && c.minutes_since_exercise <= 180) flags.push(`Exercise ended ${c.minutes_since_exercise} min ago`);
    if (eva && eva.hours_until <= 72) flags.push(`${eva.title} in ${r1(eva.hours_until)} h — fitness-for-duty decision may be needed`);
  }

  // ── Headline: one line the surgeon can act on ──
  const what = reported.length ? `reports ${reported.map((x) => x.sign).join(' + ')}` : triggerShort(b.trigger);
  const during = b.event?.utterance && b.event.utterance !== b.utterance ? ` during check for "${short(b.event.utterance, 40)}"` : '';
  const headline = [
    `${b.crewId}: ${what}${during}`,
    onset ? `onset ${onset} (crew)` : null,
    c?.minutes_since_exercise !== null && c?.minutes_since_exercise !== undefined && c.minutes_since_exercise <= 180 ? `${c.minutes_since_exercise} min post-exercise` : null,
    vitalBits[0] ?? null,
    eva ? `${eva.title} in ${Math.round(eva.hours_until)} h` : null,
  ].filter(Boolean).join(' · ');

  return {
    headline,
    trigger: triggerLong(b.trigger, b.utterance, reported),
    reported_now: reported,
    complaint: {
      first_message: b.event?.utterance ?? b.utterance,
      opened_at: b.event?.opened_at ?? b.asOf,
      symptoms, onset, duration, severity,
    },
    flags,
    timeline: b.transcript.map((t) => ({ at: t.ts, who: t.role === 'crew' ? 'crew' : 'nastra', text: t.content })),
    model_notes: (b.interp?.followup_answers ?? []).filter((f) => f.detail).map((f) => `${b.questionText[f.question_id] ? short(b.questionText[f.question_id], 50) : f.question_id} → ${f.answer}: ${f.detail}`),
  };
}

function triggerShort(t: EscalationTrigger): string {
  switch (t.kind) {
    case 'safety_screen': return t.hits.map((h) => h.label.toLowerCase()).join(' + ');
    case 'red_flag_answer': return 'answered yes to warning-signs check';
    case 'unanswered_check': return `warning-signs check unanswered ${t.prompts}×`;
    case 'unclear_message': return 'unclear message during open safety check';
    case 'model_flag': return 'possible emergency (model-rated)';
    case 'crew_request': return 'requested a consult';
  }
}

function triggerLong(t: EscalationTrigger, utterance: string, reported: { sign: string }[]): string {
  const signs = reported.length ? ` Warning signs in the crew member's words: ${reported.map((x) => x.sign).join(', ')}.` : '';
  switch (t.kind) {
    case 'safety_screen':
      return `Deterministic safety screen matched: ${t.hits.map((h) => `${h.label} ("${h.match}")`).join('; ')}. Model not consulted.`;
    case 'red_flag_answer':
      return `Crew member answered yes to: "${t.questionText}"${signs}`;
    case 'unanswered_check':
      return `Warning-signs question shown ${t.prompts} times without a clear answer. Latest message: "${short(utterance, 80)}".`;
    case 'unclear_message':
      return `Message could not be understood while the warning-signs question was open: "${short(utterance, 80)}". Possible deterioration.`;
    case 'model_flag':
      return `Model rated the message a possible emergency (unverified). No deterministic red flag matched.${signs}`;
    case 'crew_request':
      return `Crew member pressed Escalate (${t.target === 'crew_medical_officer' ? 'crew medical officer' : 'flight surgeon'}).${t.note ? ` Note: "${t.note}".` : ''}${signs}`;
  }
}

function asSymptoms(v: unknown): string[] {
  const arr = typeof v === 'string' ? safeJson(v) : v;
  if (!Array.isArray(arr)) return [];
  return arr.map((s: { said?: string; category?: string; body_system?: string }) =>
    `${s.said ?? s.category ?? '?'} (${(s.category ?? '').replace(/_/g, ' ')}, ${(s.body_system ?? '').replace(/_/g, ' ')})`);
}

function clauseAround(text: string, i: number): string {
  const start = Math.max(text.lastIndexOf('.', i - 1), text.lastIndexOf(',', i - 1), text.lastIndexOf(';', i - 1)) + 1;
  const ends = ['.', ',', ';'].map((ch) => text.indexOf(ch, i)).filter((x) => x >= 0);
  return text.slice(start, ends.length ? Math.min(...ends) : text.length).trim();
}

function ago(ts: string, asOf: string): string {
  const min = Math.round((Date.parse(asOf) - Date.parse(ts)) / 60000);
  if (min < 90) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}

const r = (x: number) => String(Math.round(x));
const r1 = (x: number) => (Math.round(x * 10) / 10).toString();
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const uniq = (xs: string[]) => [...new Set(xs)];
function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }
