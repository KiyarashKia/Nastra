/**
 * Numeric and time presentation rules. NHIS A23; NASA App. F F.5.6, F.6.1; V2 10046.
 * - every number shows its unit
 * - leading zero below 1
 * - explicit minus sign (U+2212), explicit plus on signed deltas
 * - fixed decimals per stream so decimals align
 * - 24-hour clock labelled with its time system
 */
import type { Timestamp } from './model';

export const MINUS = '−';

export interface ValueFormat {
  /** Fixed decimal places for this stream. Keeps decimals aligned in columns. */
  decimals?: number;
}

export function formatNumber(value: number, { decimals = 0 }: ValueFormat = {}): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value).toFixed(decimals); // toFixed keeps the leading zero: 0.5 → "0.5"
  const isZero = Number(abs) === 0;
  return value < 0 && !isZero ? `${MINUS}${abs}` : abs;
}

/** Signed difference, e.g. "+12" / "−4" / "±0". Never hides the sign. */
export function formatSignedDelta(delta: number, { decimals = 0 }: ValueFormat = {}): string {
  if (!Number.isFinite(delta)) return '—';
  const abs = Math.abs(delta).toFixed(decimals);
  if (Number(abs) === 0) return `±${abs}`;
  return delta > 0 ? `+${abs}` : `${MINUS}${abs}`;
}

const pad = (n: number, w = 2) => String(Math.trunc(n)).padStart(w, '0');

/** "14:32:05 UTC" or "MET 012/14:32:05". 24-hour, always labelled. */
export function formatTimestamp(ts: Timestamp, { seconds = true }: { seconds?: boolean } = {}): string {
  const d = new Date(ts.iso);
  if (Number.isNaN(d.getTime())) return 'Time unknown';
  if (ts.system === 'MET') {
    if (!ts.missionEpochIso) return 'MET unknown';
    const ms = d.getTime() - Date.parse(ts.missionEpochIso);
    const sign = ms < 0 ? MINUS : '';
    const total = Math.abs(ms) / 1000;
    const days = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    return `MET ${sign}${pad(days, 3)}/${pad(h)}:${pad(m)}${seconds ? `:${pad(s)}` : ''}`;
  }
  const local = ts.system === 'local';
  const h = local ? d.getHours() : d.getUTCHours();
  const m = local ? d.getMinutes() : d.getUTCMinutes();
  const s = local ? d.getSeconds() : d.getUTCSeconds();
  return `${pad(h)}:${pad(m)}${seconds ? `:${pad(s)}` : ''} ${ts.system === 'local' ? 'Local' : ts.system}`;
}

/** Data age, e.g. "8 s", "4 min 12 s", "2 h 05 min". */
export function formatAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'Age unknown';
  const s = Math.floor(ageMs / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${pad(s % 60)} s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${pad(m % 60)} min`;
  return `${Math.floor(h / 24)} d ${pad(h % 24)} h`;
}

/** Minutes as "h:mm" for EVA consumables and walk-back time. */
export function formatDurationHm(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  const sign = minutes < 0 ? MINUS : '';
  const m = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(m / 60)}:${pad(m % 60)}`;
}
