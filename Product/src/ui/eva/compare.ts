/** Now vs the same hour yesterday, from the hourly telemetry series. Pure, so it is testable. */
export interface TelemetryVital {
  key: string; label: string; unit: string; decimals: number;
  samples: { t: string; v: number | null }[];
  baseline?: { low: number; high: number; reference: number };
}
export interface CompareRow {
  key: string; label: string; unit: string; decimals: number;
  now: number; yday: number | null; delta: number | null;
  band: 'above' | 'below' | 'within' | null; spark: string;
}

const SHORT: Record<string, string> = {
  heart_rate_bpm: 'HR', spo2_pct: 'SPO2', hrv_rmssd_ms: 'HRV', resp_rate_bpm: 'RESP', systolic_mmhg: 'BP SYS', skin_temp_c: 'SKIN T',
};
export const EVA_CHANNELS = Object.keys(SHORT);
const BLOCKS = '▁▂▃▄▅▆▇█';

export function spark(values: number[]): string {
  if (!values.length) return '';
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  return values.map((v) => BLOCKS[Math.min(7, Math.floor(((v - lo) / span) * 8))]).join('');
}

export function compareWithYesterday(vitals: TelemetryVital[]): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const key of EVA_CHANNELS) {
    const v = vitals.find((x) => x.key === key);
    if (!v) continue;
    const pts = v.samples.filter((s): s is { t: string; v: number } => s.v !== null);
    const last = pts.at(-1);
    if (!last) continue;
    const target = Date.parse(last.t) - 86_400_000;
    let best: { t: string; v: number } | null = null;
    for (const p of pts) {
      const d = Math.abs(Date.parse(p.t) - target);
      if (d <= 90 * 60_000 && (!best || d < Math.abs(Date.parse(best.t) - target))) best = p;
    }
    const r = (x: number) => Math.round(x * 10 ** v.decimals) / 10 ** v.decimals;
    const now = r(last.v);
    const yday = best ? r(best.v) : null;
    const b = v.baseline;
    rows.push({
      key, label: SHORT[key], unit: v.unit, decimals: v.decimals, now, yday,
      delta: yday === null ? null : r(now - yday),
      band: !b ? null : now > b.high ? 'above' : now < b.low ? 'below' : 'within',
      spark: spark(pts.slice(-24).map((p) => p.v)),
    });
  }
  return rows;
}
