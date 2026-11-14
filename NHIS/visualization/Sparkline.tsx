import { extent, inferMaxGapMs, linear, segments, type BaselineBand, type Sample } from './scales';
import './viz.css';

export interface SparklineProps {
  samples: Sample[];
  baseline?: BaselineBand;
  width?: number;
  height?: number;
  maxGapMs?: number;
  /** Marks the tail after the last sample as stale/no-data. */
  degradedTail?: boolean;
  now?: string;
}

/**
 * Sparkline with personal-baseline band. Decorative to assistive tech: it is
 * never the only representation of a value (NHIS A24; Bauer et al. 2010) —
 * the enclosing tile always prints the number, unit and signed delta.
 */
export function Sparkline({ samples, baseline, width = 200, height = 48, maxGapMs, degradedTail, now }: SparklineProps) {
  if (!samples.length) return <svg width={width} height={height} aria-hidden="true" />;
  const t0 = Date.parse(samples[0]!.t);
  const t1 = now ? Date.parse(now) : Date.parse(samples[samples.length - 1]!.t);
  const vals = samples.flatMap((s) => (s.v === null ? [] : [s.v]));
  const [lo, hi] = extent([...vals, ...(baseline ? [baseline.low, baseline.high] : [])]);
  const pad = (hi - lo) * 0.15 || 1;
  const x = linear(t0, t1, 2, width - 6);
  const y = linear(lo - pad, hi + pad, height - 3, 3);
  const runs = segments(samples, maxGapMs ?? inferMaxGapMs(samples));
  const last = [...samples].reverse().find((s) => s.v !== null);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" className="nhis-sparkline" aria-hidden="true">
      {baseline && <rect x={0} width={width} y={y(baseline.high)} height={Math.max(1, y(baseline.low) - y(baseline.high))} className="nhis-trend__band" />}
      {baseline && (
        <>
          <line x1={0} x2={width} y1={y(baseline.high)} y2={y(baseline.high)} className="nhis-trend__band-edge" vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={width} y1={y(baseline.low)} y2={y(baseline.low)} className="nhis-trend__band-edge" vectorEffect="non-scaling-stroke" />
        </>
      )}
      {runs.map((r, i) => (
        <path
          key={i}
          d={r.map((p, j) => `${j ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('')}
          className="nhis-trend__line nhis-trend__line--live"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {degradedTail && last && (
        <line x1={x(Date.parse(last.t))} x2={width - 2} y1={y(last.v!)} y2={y(last.v!)} className="nhis-sparkline__tail" vectorEffect="non-scaling-stroke" />
      )}
      {/* Zero-length round-capped line: stays circular under non-uniform scaling. */}
      {last && (
        <line
          x1={x(Date.parse(last.t))}
          x2={x(Date.parse(last.t))}
          y1={y(last.v!)}
          y2={y(last.v!)}
          className="nhis-sparkline__dot"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
