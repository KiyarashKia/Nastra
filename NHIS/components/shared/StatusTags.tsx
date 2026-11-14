import type { ReactNode } from 'react';
import { Glyph, type GlyphName } from './Glyph';
import { flashSyncStyle } from './NHISProvider';
import { treatmentFor } from '../../semantics/rules';
import { formatAge, formatTimestamp } from '../../semantics/format';
import type {
  ConfidenceLevel,
  DataOrigin,
  DataQuality,
  EvidenceCategory,
  LinkState,
  OperatingMode,
  OperationalPriority,
  StatusLevel,
  Timestamp,
} from '../../semantics/model';

const cx = (...c: Array<string | false | undefined | null>) => c.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ */
/* PriorityBadge — colour + label + glyph + marker, never colour alone */
/* NHIS A1, A2; Emergency distinct from Warning by label, glyph, ring. */
/* ------------------------------------------------------------------ */
export interface PriorityBadgeProps {
  priority: OperationalPriority;
  /** Flash the glyph (unacknowledged Warning/Emergency only; NHIS A27). */
  flashing?: boolean;
  size?: 'md' | 'lg';
  className?: string;
}

export function PriorityBadge({ priority, flashing = false, size = 'md', className }: PriorityBadgeProps) {
  const t = treatmentFor(priority);
  const flash = flashing && t.flash !== 'none';
  return (
    <span className={cx('nhis-badge', `nhis-badge--${priority}`, `nhis-badge--${size}`, flash && 'nhis-badge--flashing', className)}>
      <span className={cx('nhis-badge__glyph', flash && 'nhis-flash-nontext-high')} style={flash ? flashSyncStyle() : undefined}>
        <Glyph name={t.glyph} size={size === 'lg' ? 24 : 20} />
      </span>
      <span className="nhis-badge__label">{t.label}</span>
      <span className="nhis-badge__marker" aria-hidden="true">
        {t.marker}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* StatusMark — compact status for summaries. Nominal stays quiet.     */
/* ------------------------------------------------------------------ */
export function StatusMark({ status, label }: { status: StatusLevel; label?: string }) {
  if (status === 'nominal') {
    return <span className="nhis-status-mark nhis-status-mark--nominal">{label ?? 'Nominal'}</span>;
  }
  const t = treatmentFor(status);
  return (
    <span className={cx('nhis-status-mark', `nhis-status-mark--${status}`)}>
      <Glyph name={t.glyph} size={16} />
      <span>{label ?? t.label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* DataQualityTag — NHIS A7, B33. Separate from alert priority.        */
/* ------------------------------------------------------------------ */
const QUALITY: Record<Exclude<DataQuality, 'live'>, { glyph: GlyphName; label: string }> = {
  delayed: { glyph: 'delayed', label: 'Delayed' },
  stale: { glyph: 'stale', label: 'Stale' },
  unavailable: { glyph: 'unavailable', label: 'No data' },
  unknown: { glyph: 'unknown', label: 'Unknown' },
};
const ORIGIN: Record<Exclude<DataOrigin, 'measured'>, { glyph: GlyphName; label: string }> = {
  estimated: { glyph: 'estimated', label: 'Estimated' },
  'manual-entry': { glyph: 'manual', label: 'Manual entry' },
};

export interface DataQualityTagProps {
  quality: DataQuality;
  origin?: DataOrigin;
  /** Age of the last sample in ms. Shown for every non-live state that has one. */
  ageMs?: number;
  /** Paused presentation: frozen values are marked as-of and never look current (A31). */
  pausedAt?: Timestamp;
  /** Show "Live" explicitly (used where live vs historical must be distinguished, A25). */
  showLive?: boolean;
  className?: string;
}

export function DataQualityTag({ quality, origin = 'measured', ageMs, pausedAt, showLive = false, className }: DataQualityTagProps) {
  const parts: ReactNode[] = [];
  if (pausedAt) {
    parts.push(
      <span key="paused" className="nhis-dq nhis-dq--paused">
        <Glyph name="paused" size={16} />
        Paused · as of {formatTimestamp(pausedAt)}
      </span>,
    );
  }
  if (quality === 'live') {
    if (showLive && !pausedAt)
      parts.push(
        <span key="live" className="nhis-dq nhis-dq--live">
          <Glyph name="live" size={16} />
          Live
        </span>,
      );
  } else {
    const q = QUALITY[quality];
    parts.push(
      <span key="q" className={cx('nhis-dq', `nhis-dq--${quality}`)}>
        <Glyph name={q.glyph} size={16} />
        {q.label}
        {ageMs !== undefined && quality !== 'unknown' && <span className="nhis-dq__age nhis-num">{formatAge(ageMs)}</span>}
      </span>,
    );
  }
  if (origin !== 'measured') {
    const o = ORIGIN[origin];
    parts.push(
      <span key="o" className={cx('nhis-dq', `nhis-dq--${origin}`)}>
        <Glyph name={o.glyph} size={16} />
        {o.label}
      </span>,
    );
  }
  if (parts.length === 0) return null;
  return <span className={cx('nhis-dq-group', className)}>{parts}</span>;
}

/* ------------------------------------------------------------------ */
/* EvidenceTag — MEASURED / DERIVED / RETRIEVED / AI ASSESSMENT /      */
/* RECOMMENDED ACTION never collapse into one "AI answer" (02 §7).     */
/* ------------------------------------------------------------------ */
export const EVIDENCE_META: Record<EvidenceCategory, { glyph: GlyphName; label: string }> = {
  measured: { glyph: 'measured', label: 'Measured' },
  derived: { glyph: 'derived', label: 'Derived' },
  retrieved: { glyph: 'retrieved', label: 'Retrieved' },
  'ai-assessment': { glyph: 'ai-assessment', label: 'AI assessment' },
  'recommended-action': { glyph: 'recommended-action', label: 'Recommended action' },
};

export function EvidenceTag({ category, className }: { category: EvidenceCategory; className?: string }) {
  const m = EVIDENCE_META[category];
  return (
    <span className={cx('nhis-evidence-tag', `nhis-evidence-tag--${category}`, className)}>
      <Glyph name={m.glyph} size={16} />
      {m.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* ConfidenceTag — categorical only, never a percentage (NHIS A12).    */
/* ------------------------------------------------------------------ */
const CONF_LABEL: Record<ConfidenceLevel, string> = { high: 'High', medium: 'Medium', low: 'Low' };
export function ConfidenceTag({ level, className }: { level: ConfidenceLevel; className?: string }) {
  return (
    <span className={cx('nhis-confidence', `nhis-confidence--${level}`, className)}>
      <span className="nhis-confidence__label">Confidence</span>
      <span className="nhis-confidence__value">{CONF_LABEL[level]}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* ModeIndicator — simulation/training/what-if vs live (NHIS A9).      */
/* ------------------------------------------------------------------ */
const MODE_LABEL: Record<OperatingMode, string> = {
  live: 'Live',
  simulation: 'Simulation — not live data',
  training: 'Training — not live data',
  'what-if': 'What-if view — not live data',
};
export function ModeIndicator({ mode, className }: { mode: OperatingMode; className?: string }) {
  return (
    <span className={cx('nhis-mode', `nhis-mode--${mode === 'live' ? 'live' : 'simulated'}`, className)} role="status">
      {mode === 'live' ? <Glyph name="live" size={16} /> : <Glyph name="simulation" size={16} />}
      {MODE_LABEL[mode]}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* LinkIndicator — link state + delay (NHIS A18, B8).                  */
/* ------------------------------------------------------------------ */
const LINK: Record<LinkState, { glyph: GlyphName; label: string }> = {
  connected: { glyph: 'link-connected', label: 'Link' },
  degraded: { glyph: 'link-degraded', label: 'Link degraded' },
  disconnected: { glyph: 'link-disconnected', label: 'No link' },
  unknown: { glyph: 'unknown', label: 'Link unknown' },
};
export function LinkIndicator({ state, delayLabel, className }: { state: LinkState; delayLabel?: string; className?: string }) {
  const l = LINK[state];
  return (
    <span className={cx('nhis-link', `nhis-link--${state}`, className)}>
      <Glyph name={l.glyph} size={16} />
      <span>{l.label}</span>
      {delayLabel && <span className="nhis-link__delay nhis-num">{delayLabel}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Time — 24 h with time system (NHIS A23).                            */
/* ------------------------------------------------------------------ */
export function Time({ value, seconds = true, className }: { value: Timestamp; seconds?: boolean; className?: string }) {
  return (
    <time dateTime={value.iso} className={cx('nhis-time nhis-num', className)}>
      {formatTimestamp(value, { seconds })}
    </time>
  );
}
