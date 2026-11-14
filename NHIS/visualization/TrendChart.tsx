import { useId, useMemo } from 'react';
import { Disclosure } from '../components/station/controls';
import { DataQualityTag } from '../components/shared/StatusTags';
import { formatNumber, formatTimestamp } from '../semantics/format';
import type { DataQuality, TimeSystem, Timestamp } from '../semantics/model';
import { extent, gaps, inferMaxGapMs, linear, niceTicks, segments, type BaselineBand, type ChartLimit, type Sample } from './scales';
import './viz.css';

export interface TrendChartProps {
  title: string;
  unit: string;
  samples: Sample[];
  /** Time the chart ends at (the present). */
  now: string;
  /** Samples at or after this instant are live; earlier ones are historical (A25). */
  liveFrom?: string;
  baseline?: BaselineBand;
  /** Limits from an approved source only. Never invented by NHIS. */
  limits?: ChartLimit[];
  decimals?: number;
  /** Freshness of the latest sample. */
  quality?: DataQuality;
  /** Breaks the line and hatches regions where samples are further apart than this. Default: 3 × median spacing. */
  maxGapMs?: number;
  /** Frozen presentation (A31). Acquisition continues; the chart says so. */
  pausedAt?: Timestamp;
  timeSystem?: TimeSystem;
  missionEpochIso?: string;
  height?: number;
  /** Fixture label rendered on the chart, e.g. "Simulated fixture". */
  fixtureLabel?: string;
}

const W = 760;
const M = { top: 16, right: 104, bottom: 30, left: 52 };

/**
 * Health trend chart. NHIS A24, A25, A7, A31; 00 §12.
 * Current value + unit, personal-baseline band, limit lines with their source,
 * live vs historical line styles, hatched gaps and stale tail, and an
 * accessible values table. No animation, no radial forms, no decorative colour.
 */
export function TrendChart({
  title,
  unit,
  samples,
  now,
  liveFrom,
  baseline,
  limits = [],
  decimals = 0,
  quality = 'live',
  maxGapMs: maxGapProp,
  pausedAt,
  timeSystem = 'UTC',
  missionEpochIso,
  height = 240,
  fixtureLabel,
}: TrendChartProps) {
  const uid = useId().replace(/:/g, '');
  const maxGapMs = maxGapProp ?? inferMaxGapMs(samples);
  const H = height;
  const t0 = samples.length ? Date.parse(samples[0]!.t) : Date.parse(now) - 3600_000;
  const tNow = Date.parse(now);
  const values = samples.flatMap((s) => (s.v === null ? [] : [s.v]));
  const [lo0, hi0] = extent([...values, ...(baseline ? [baseline.low, baseline.high] : []), ...limits.map((l) => l.value)]);
  const pad = (hi0 - lo0) * 0.12 || 1;
  const yMin = lo0 - pad;
  const yMax = hi0 + pad;
  const x = linear(t0, tNow, M.left, W - M.right);
  const y = linear(yMin, yMax, H - M.bottom, M.top);
  const yTicks = niceTicks(yMin, yMax, 4);
  const xTicks = useMemo(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, i) => t0 + ((tNow - t0) * i) / n);
  }, [t0, tNow]);

  const liveT = liveFrom ? Date.parse(liveFrom) : undefined;
  const runs = segments(samples, maxGapMs);
  const gapRanges = gaps(samples, maxGapMs);
  const last = [...samples].reverse().find((s) => s.v !== null);
  const lastT = last ? Date.parse(last.t) : undefined;
  const staleTail = (quality === 'stale' || quality === 'delayed' || quality === 'unavailable') && lastT !== undefined && lastT < tNow;

  const pathFor = (pts: Array<{ t: number; v: number }>) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');

  const split = (run: Array<{ t: number; v: number }>) => {
    if (liveT === undefined) return { hist: [] as typeof run, live: run };
    const hist = run.filter((p) => p.t < liveT);
    const live = run.filter((p) => p.t >= liveT);
    if (hist.length && live.length) live.unshift(hist[hist.length - 1]!);
    return { hist, live };
  };

  const outside = samples.filter(
    (s) => s.v !== null && limits.some((l) => (l.direction === 'above' ? s.v! > l.value : s.v! < l.value)),
  );
  const ts = (ms: number) =>
    formatTimestamp({ iso: new Date(ms).toISOString(), system: timeSystem, missionEpochIso }, { seconds: false });

  const summary = [
    `${title}.`,
    last ? `Latest ${formatNumber(last.v!, { decimals })} ${unit} at ${ts(Date.parse(last.t))}.` : 'No data.',
    quality !== 'live' ? `Data ${quality}.` : '',
    baseline ? `${baseline.label}: ${formatNumber(baseline.low, { decimals })} to ${formatNumber(baseline.high, { decimals })} ${unit}.` : '',
    limits.length ? `${outside.length} value${outside.length === 1 ? '' : 's'} outside a supplied limit.` : '',
    pausedAt ? `Display paused as of ${formatTimestamp(pausedAt)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <figure className="nhis-trend">
      <figcaption className="nhis-trend__caption">
        <span className="nhis-trend__title">{title}</span>
        <span className="nhis-trend__legend" aria-hidden="true">
          <span className="nhis-trend__key nhis-trend__key--live">Live</span>
          {liveT !== undefined && <span className="nhis-trend__key nhis-trend__key--hist">Historical</span>}
          {baseline && <span className="nhis-trend__key nhis-trend__key--band">{baseline.label}</span>}
        </span>
        <DataQualityTag quality={quality} showLive pausedAt={pausedAt} ageMs={lastT !== undefined ? tNow - lastT : undefined} />
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="nhis-trend__svg" role="img" aria-label={summary} preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id={`hatch-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" className="nhis-trend__hatch-line" />
          </pattern>
        </defs>
        {/* grid + axes */}
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} className="nhis-trend__grid" />
            <text x={M.left - 8} y={y(v)} className="nhis-trend__tick" textAnchor="end" dominantBaseline="middle">
              {formatNumber(v, { decimals: Math.max(0, decimals) })}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={`x${i}`} x={x(t)} y={H - 8} className="nhis-trend__tick" textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>
            {ts(t)}
          </text>
        ))}
        {/* baseline band (A24) */}
        {baseline && (
          <g>
            <rect x={M.left} width={W - M.left - M.right} y={y(baseline.high)} height={Math.max(0, y(baseline.low) - y(baseline.high))} className="nhis-trend__band" />
            <line x1={M.left} x2={W - M.right} y1={y(baseline.high)} y2={y(baseline.high)} className="nhis-trend__band-edge" />
            <line x1={M.left} x2={W - M.right} y1={y(baseline.low)} y2={y(baseline.low)} className="nhis-trend__band-edge" />
          </g>
        )}
        {/* gaps and stale tail: hatched, labelled */}
        {gapRanges.map(([a, b], i) => (
          <g key={`gap${i}`}>
            <rect x={x(a)} width={Math.max(2, x(b) - x(a))} y={M.top} height={H - M.top - M.bottom} fill={`url(#hatch-${uid})`} className="nhis-trend__gap" />
            {x(b) - x(a) > 54 && (
              <text x={(x(a) + x(b)) / 2} y={M.top + 14} textAnchor="middle" className="nhis-trend__annot">
                No data
              </text>
            )}
          </g>
        ))}
        {staleTail && (
          <g>
            <rect x={x(lastT!)} width={Math.max(2, x(tNow) - x(lastT!))} y={M.top} height={H - M.top - M.bottom} fill={`url(#hatch-${uid})`} className="nhis-trend__gap" />
            <text x={(x(lastT!) + x(tNow)) / 2} y={M.top + 14} textAnchor="middle" className="nhis-trend__annot">
              {quality === 'unavailable' ? 'No data' : quality === 'delayed' ? 'Delayed' : 'Stale'}
            </text>
          </g>
        )}
        {/* limits from an approved source (A25) */}
        {limits.map((l, i) => (
          <g key={`lim${i}`}>
            <line x1={M.left} x2={W - M.right} y1={y(l.value)} y2={y(l.value)} className={`nhis-trend__limit nhis-trend__limit--${l.priority}`} />
            <text x={M.left + 6} y={y(l.value) + (l.direction === 'above' ? -6 : 14)} className="nhis-trend__annot">
              {l.priority === 'warning' ? 'Warning' : 'Caution'} limit {formatNumber(l.value, { decimals })} {unit} · {l.source}
            </text>
          </g>
        ))}
        {/* series */}
        {runs.map((run, i) => {
          const { hist, live } = split(run);
          return (
            <g key={`run${i}`}>
              {hist.length > 1 && <path d={pathFor(hist)} className="nhis-trend__line nhis-trend__line--hist" />}
              {live.length > 1 && <path d={pathFor(live)} className="nhis-trend__line nhis-trend__line--live" />}
              {run.length === 1 && <circle cx={x(run[0]!.t)} cy={y(run[0]!.v)} r={2.5} className="nhis-trend__dot" />}
            </g>
          );
        })}
        {/* out-of-limit markers: shape + colour (A2) */}
        {outside.map((s) => {
          const lim = limits.find((l) => (l.direction === 'above' ? s.v! > l.value : s.v! < l.value))!;
          const cx0 = x(Date.parse(s.t));
          const cy0 = y(s.v!);
          return lim.priority === 'warning' ? (
            <polygon
              key={s.t}
              points={[0, 1, 2, 3, 4, 5, 6, 7]
                .map((k) => {
                  const a = Math.PI / 8 + (k * Math.PI) / 4;
                  return `${(cx0 + 6 * Math.cos(a)).toFixed(1)},${(cy0 + 6 * Math.sin(a)).toFixed(1)}`;
                })
                .join(' ')}
              className="nhis-trend__marker nhis-trend__marker--warning"
            />
          ) : (
            <polygon key={s.t} points={`${cx0},${cy0 - 6.5} ${cx0 + 6},${cy0 + 4.5} ${cx0 - 6},${cy0 + 4.5}`} className="nhis-trend__marker nhis-trend__marker--caution" />
          );
        })}
        {/* now marker + current value (OpenBridge trend anatomy, re-derived; P5) */}
        <line x1={x(tNow)} x2={x(tNow)} y1={M.top} y2={H - M.bottom} className="nhis-trend__now" />
        {last && (
          <g>
            <polygon
              points={`${W - M.right + 4},${y(last.v!)} ${W - M.right + 12},${y(last.v!) - 6} ${W - M.right + 12},${y(last.v!) + 6}`}
              className={`nhis-trend__current-mark ${quality !== 'live' ? 'is-degraded' : ''}`}
            />
            <text x={W - M.right + 18} y={y(last.v!)} dominantBaseline="middle" className="nhis-trend__current">
              {formatNumber(last.v!, { decimals })}
            </text>
            <text x={W - M.right + 18} y={y(last.v!) + 18} dominantBaseline="middle" className="nhis-trend__current-unit">
              {unit}
            </text>
          </g>
        )}
        {pausedAt && (
          <text x={W - M.right - 6} y={M.top + 14} textAnchor="end" className="nhis-trend__annot nhis-trend__annot--strong">
            Paused · as of {formatTimestamp(pausedAt, { seconds: false })}
          </text>
        )}
        {fixtureLabel && (
          <text x={M.left + 6} y={H - M.bottom - 8} className="nhis-trend__fixture">
            {fixtureLabel}
          </text>
        )}
      </svg>
      <Disclosure title="Show values">
        <div className="nhis-trend__table-wrap">
          <table className="nhis-trend__table">
            <caption className="nhis-visually-hidden">{title} values</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Value ({unit})</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {[...samples].reverse().map((s) => {
                const t = Date.parse(s.t);
                const lim = s.v === null ? undefined : limits.find((l) => (l.direction === 'above' ? s.v! > l.value : s.v! < l.value));
                return (
                  <tr key={s.t}>
                    <td className="nhis-num">{ts(t)}</td>
                    <td className="nhis-num nhis-trend__num">{s.v === null ? '—' : formatNumber(s.v, { decimals })}</td>
                    <td>
                      {s.v === null
                        ? 'No data'
                        : [
                            liveT !== undefined && t >= liveT ? 'Live' : liveT !== undefined ? 'Historical' : '',
                            lim ? `Beyond ${lim.priority === 'warning' ? 'Warning' : 'Caution'} limit` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </figure>
  );
}
