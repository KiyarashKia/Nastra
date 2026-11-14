/** Minimal scale helpers (no chart dependency; see implementation/decisions.md NHIS-VIZ-001). */

export interface Sample {
  /** ISO 8601 instant. */
  t: string;
  /** `null` marks a known gap (no data). Never substitute zero. */
  v: number | null;
}

export interface BaselineBand {
  low: number;
  high: number;
  /** Reference value the signed difference is computed against (e.g. the personal median). */
  reference?: number;
  /** How the baseline was derived, e.g. "Personal baseline · 14-day median ± IQR". */
  label: string;
}

/**
 * A limit drawn on a chart. NHIS never invents limits: each must name the
 * approved source that defines it (00 §22; 01 A8).
 */
export interface ChartLimit {
  value: number;
  priority: 'caution' | 'warning';
  direction: 'above' | 'below';
  source: string;
}

export function linear(d0: number, d1: number, r0: number, r1: number) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

/** "Nice" ticks for a numeric domain. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

export function extent(values: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/**
 * Default gap threshold: three times the median sample spacing. A stream that
 * reports hourly is not "broken" between hours; one that reports every 5 s is.
 * Callers can always pass an explicit stream-specific value.
 */
export function inferMaxGapMs(samples: Sample[], fallback = 5 * 60_000): number {
  if (samples.length < 3) return fallback;
  const d: number[] = [];
  for (let i = 1; i < samples.length; i++) d.push(Date.parse(samples[i]!.t) - Date.parse(samples[i - 1]!.t));
  d.sort((a, b) => a - b);
  const median = d[Math.floor(d.length / 2)]!;
  return median > 0 ? median * 3 : fallback;
}

/** Splits samples into continuous runs; a null value or a gap longer than `maxGapMs` breaks the line. */
export function segments(samples: Sample[], maxGapMs: number): Array<Array<{ t: number; v: number }>> {
  const runs: Array<Array<{ t: number; v: number }>> = [];
  let cur: Array<{ t: number; v: number }> = [];
  let prevT: number | undefined;
  for (const s of samples) {
    const t = Date.parse(s.t);
    if (s.v === null || (prevT !== undefined && t - prevT > maxGapMs)) {
      if (cur.length) runs.push(cur);
      cur = [];
    }
    if (s.v !== null) cur.push({ t, v: s.v });
    prevT = t;
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** Gap intervals [start, end] in ms, for hatched "No data" regions. */
export function gaps(samples: Sample[], maxGapMs: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let lastGood: number | undefined;
  let inNull = false;
  let nullStart = 0;
  for (const s of samples) {
    const t = Date.parse(s.t);
    if (s.v === null) {
      if (!inNull) {
        inNull = true;
        nullStart = lastGood ?? t;
      }
      continue;
    }
    if (inNull) {
      out.push([nullStart, t]);
      inNull = false;
    } else if (lastGood !== undefined && t - lastGood > maxGapMs) {
      out.push([lastGood, t]);
    }
    lastGood = t;
  }
  return out;
}
