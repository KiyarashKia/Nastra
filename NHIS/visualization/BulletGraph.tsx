import { formatNumber, formatSignedDelta } from '../semantics/format';
import { linear } from './scales';
import './viz.css';

export interface BulletGraphProps {
  label: string;
  value: number | undefined;
  unit: string;
  min: number;
  max: number;
  /** Personal baseline range drawn as the qualitative band. */
  baseline?: { low: number; high: number };
  /** Target supplied by an approved protocol (e.g. a hydration plan). */
  target?: { value: number; label: string };
  decimals?: number;
}

/**
 * Bullet graph for "one value read against a target" (NHIS A24; Few 2007).
 * Linear, labelled, no radial gauge. Prints value, unit and signed difference.
 */
export function BulletGraph({ label, value, unit, min, max, baseline, target, decimals = 0 }: BulletGraphProps) {
  const W = 320;
  const H = 36;
  const x = linear(min, max, 0, W);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const delta = value !== undefined && target ? value - target.value : undefined;
  return (
    <div className="nhis-bullet">
      <div className="nhis-bullet__head">
        <span className="nhis-bullet__label">{label}</span>
        <span className="nhis-bullet__value">
          <span className="nhis-num">{value === undefined ? '—' : formatNumber(value, { decimals })}</span> <span className="nhis-bullet__unit">{unit}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={`${label}: ${value === undefined ? 'no data' : `${formatNumber(value, { decimals })} ${unit}`}${target ? `, target ${formatNumber(target.value, { decimals })} ${unit}` : ''}`}>
        <rect x={0} y={6} width={W} height={24} className="nhis-bullet__track" />
        {baseline && <rect x={x(clamp(baseline.low))} y={6} width={Math.max(1, x(clamp(baseline.high)) - x(clamp(baseline.low)))} height={24} className="nhis-trend__band" />}
        {value !== undefined && <rect x={0} y={13} width={x(clamp(value))} height={10} className="nhis-bullet__bar" />}
        {target && <rect x={x(clamp(target.value)) - 1.5} y={2} width={3} height={32} className="nhis-bullet__target" />}
      </svg>
      <div className="nhis-bullet__foot">
        <span className="nhis-num">{formatNumber(min, { decimals })}</span>
        {target && (
          <span>
            {target.label}: <span className="nhis-num">{formatNumber(target.value, { decimals })}</span> {unit}
            {delta !== undefined && (
              <>
                {' '}
                · <span className="nhis-num">{formatSignedDelta(delta, { decimals })}</span> {unit}
              </>
            )}
          </span>
        )}
        <span className="nhis-num">{formatNumber(max, { decimals })}</span>
      </div>
    </div>
  );
}
