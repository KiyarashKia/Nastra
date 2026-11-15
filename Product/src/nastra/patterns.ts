import type { EpisodeRow, MissionCtx, MoodRow, SleepRow } from './tools/gateway';

/**
 * Contextual pattern analysis — deterministic, explainable.
 * Compares what is true NOW with what was true in each similar past episode,
 * feature by feature, and reports counts. It never says a pattern caused
 * anything, and history never lowers urgency (NASTRA action flow:
 * "history never overrides safety").
 *
 * Comparisons are relative to the person's OWN data, not clinical cutoffs:
 *   short_sleep  = last night more than 1 h below their own 14-day average
 *   high_stress  = self-rated stress ≥ 4 on the 1–5 self-report scale
 *   post_exercise = mission context rule (exercise ended ≤ 90 min ago)
 */
export interface PatternFeature { id: 'post_exercise' | 'short_sleep' | 'high_stress'; label: string }

export interface PatternResult {
  episodeCount: number;
  episodes: { id: string; date: string; said: string; outcome: string | null; shared: PatternFeature['id'][] }[];
  todayFeatures: PatternFeature[];
  sharedCounts: { feature: PatternFeature; count: number }[];
  statement: string | null;
  caveat: string;
}

const FEATURES: Record<PatternFeature['id'], PatternFeature> = {
  post_exercise: { id: 'post_exercise', label: 'after exercise' },
  short_sleep: { id: 'short_sleep', label: 'after a night well below your usual sleep' },
  high_stress: { id: 'high_stress', label: 'on a high-stress morning' },
};

export function analysePattern(input: {
  episodes: EpisodeRow[];
  mission: MissionCtx;
  sleep: SleepRow[];
  mood: MoodRow[];
}): PatternResult {
  const lastSleep = input.sleep[0];
  const avg = lastSleep?.avg_hours_14d ?? null;
  const morning = input.mood[0] ?? null; // most recent self-report

  const today: PatternFeature[] = [];
  if (input.mission.context === 'post_exercise') today.push(FEATURES.post_exercise);
  if (lastSleep && avg !== null && lastSleep.hours < avg - 1) today.push(FEATURES.short_sleep);
  if (morning && morning.stress >= 4) today.push(FEATURES.high_stress);

  const episodes = input.episodes.map((e) => {
    const snap = e.context_snapshot ?? {};
    const shared: PatternFeature['id'][] = [];
    if (today.some((f) => f.id === 'post_exercise') && e.mission_context === 'post_exercise') shared.push('post_exercise');
    const epSleep = Number(snap.sleep_hours_prior);
    if (today.some((f) => f.id === 'short_sleep') && avg !== null && Number.isFinite(epSleep) && epSleep < avg - 1) shared.push('short_sleep');
    const epStress = Number(snap.morning_stress);
    if (today.some((f) => f.id === 'high_stress') && Number.isFinite(epStress) && epStress >= 4) shared.push('high_stress');
    return { id: e.id, date: e.opened_at, said: e.utterance, outcome: e.outcome_notes, shared };
  });

  const sharedCounts = today.map((f) => ({ feature: f, count: episodes.filter((e) => e.shared.includes(f.id)).length }));
  const n = episodes.length;

  let statement: string | null = null;
  if (n > 0) {
    const all = sharedCounts.filter((s) => s.count === n).map((s) => s.feature.label);
    const some = sharedCounts.filter((s) => s.count > 0 && s.count < n).map((s) => `${s.count} of ${n} ${s.feature.label}`);
    const resolved = episodes.filter((e) => e.outcome).length;
    const parts = [`${n} similar episode${n > 1 ? 's' : ''} before`];
    if (all.length) parts.push(`${n > 1 ? (n === 2 ? 'both' : 'all') : 'it'} came ${joinList(all)}`);
    if (some.length) parts.push(joinList(some));
    if (resolved) parts.push(`${resolved === n ? (n === 2 ? 'both' : n > 1 ? 'all' : 'it') : `${resolved} of ${n}`} resolved (most recent: ${(episodes.find((e) => e.outcome)?.outcome ?? '').replace(/\.\s*$/, '')})`);
    statement = parts.join('; ') + '.';
  }

  return {
    episodeCount: n,
    episodes,
    todayFeatures: today,
    sharedCounts,
    statement,
    caveat: 'This is a pattern in your own history, not a cause, and it does not rule out something new.',
  };
}

function joinList(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
