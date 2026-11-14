import type { ReactNode } from 'react';
import { Button } from './controls';
import { Glyph } from '../shared/Glyph';
import { Measurement } from '../shared/Measurement';
import { DataQualityTag, StatusMark } from '../shared/StatusTags';
import { Sparkline } from '../../visualization/Sparkline';
import type { BaselineBand, Sample } from '../../visualization/scales';
import { formatNumber, formatSignedDelta } from '../../semantics/format';
import type { DataOrigin, DataQuality, StatusLevel } from '../../semantics/model';
import './health.css';

const cx = (...c: Array<string | false | undefined | null>) => c.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ */
/* Baseline difference                                                 */
/* ------------------------------------------------------------------ */
export function baselineDelta(value: number | undefined, baseline: BaselineBand | undefined) {
  if (value === undefined || !baseline) return undefined;
  if (baseline.reference !== undefined) return { delta: value - baseline.reference, against: 'reference' as const };
  if (value > baseline.high) return { delta: value - baseline.high, against: 'band' as const };
  if (value < baseline.low) return { delta: value - baseline.low, against: 'band' as const };
  return { delta: 0, against: 'band' as const };
}

/* ------------------------------------------------------------------ */
/* VitalTile — NHIS A24 (value+unit, sparkline, baseline band, signed  */
/* delta), A7 (quality + age), A2 (status never colour-only).          */
/* ------------------------------------------------------------------ */
export interface VitalTileProps {
  label: string;
  unit: string;
  value: number | undefined;
  decimals?: number;
  samples: Sample[];
  baseline?: BaselineBand;
  /** Supplied by the health-assessment layer. NHIS does not compute status. */
  status?: StatusLevel;
  quality?: DataQuality;
  origin?: DataOrigin;
  ageMs?: number;
  /** Derived trend wording from the analysis layer, e.g. "Rising over 30 min". */
  trend?: string;
  now?: string;
  onInspect?: () => void;
  footer?: ReactNode;
}

export function VitalTile({
  label,
  unit,
  value,
  decimals = 0,
  samples,
  baseline,
  status = 'nominal',
  quality = 'live',
  origin = 'measured',
  ageMs,
  trend,
  now,
  onInspect,
  footer,
}: VitalTileProps) {
  const d = quality === 'unavailable' || quality === 'unknown' ? undefined : baselineDelta(value, baseline);
  return (
    <article className={cx('nhis-vital', `nhis-vital--${status}`, quality !== 'live' && `nhis-vital--${quality}`)} aria-label={label}>
      <header className="nhis-vital__head">
        <h3 className="nhis-vital__label">{label}</h3>
        {status !== 'nominal' && <StatusMark status={status} />}
      </header>
      <div className="nhis-vital__value-row">
        <Measurement value={value} unit={unit} decimals={decimals} quality={quality} origin={origin} />
        {d && (
          <span className="nhis-vital__delta">
            <span className="nhis-num">{formatSignedDelta(d.delta, { decimals })}</span> {unit}
            <span className="nhis-vital__delta-ref">
              {d.against === 'reference'
                ? ` vs baseline ${formatNumber(baseline!.reference!, { decimals })}`
                : d.delta === 0
                  ? ' · within baseline'
                  : ' beyond baseline'}
            </span>
          </span>
        )}
      </div>
      <Sparkline samples={samples} baseline={baseline} degradedTail={quality !== 'live'} now={now} />
      <div className="nhis-vital__foot">
        <span className="nhis-vital__baseline">
          {baseline ? (
            <>
              Baseline <span className="nhis-num">{formatNumber(baseline.low, { decimals })}–{formatNumber(baseline.high, { decimals })}</span> {unit}
            </>
          ) : (
            'No personal baseline yet'
          )}
          {trend && <> · {trend}</>}
        </span>
        <DataQualityTag quality={quality} origin={origin} ageMs={ageMs} />
      </div>
      {footer}
      {onInspect && (
        <Button size="compact" intent="quiet" icon="chevron-right" onPress={onInspect} className="nhis-vital__inspect">
          Inspect {label.toLowerCase()}
        </Button>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* TelemetryReadout — compact label / value / unit row                 */
/* Anatomy re-derived from OpenBridge readouts (P5); NHIS adds glyph + */
/* label for status and a dashed mark for degraded data.               */
/* ------------------------------------------------------------------ */
export interface TelemetryReadoutProps {
  label: string;
  unit: string;
  value: number | undefined;
  decimals?: number;
  status?: StatusLevel;
  quality?: DataQuality;
  origin?: DataOrigin;
  ageMs?: number;
  source?: string;
}

export function TelemetryReadout({ label, unit, value, decimals = 0, status = 'nominal', quality = 'live', origin = 'measured', ageMs, source }: TelemetryReadoutProps) {
  return (
    <div className={cx('nhis-readout', `nhis-readout--${status}`)}>
      <span className="nhis-readout__label">
        {status !== 'nominal' && <StatusMark status={status} label="" />}
        {label}
        {source && <span className="nhis-readout__source">{source}</span>}
      </span>
      <Measurement value={value} unit={unit} decimals={decimals} quality={quality} origin={origin} size="tabular" />
      <DataQualityTag quality={quality} origin={origin} ageMs={ageMs} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DataGapNotice — names what is missing and what that means (A11, A13)*/
/* ------------------------------------------------------------------ */
export function DataGapNotice({ title, missing, consequence }: { title: string; missing: string[]; consequence: string }) {
  return (
    <section className="nhis-data-gap" aria-label={title}>
      <Glyph name="unavailable" size={20} />
      <div>
        <h3 className="nhis-data-gap__title">{title}</h3>
        <ul className="nhis-data-gap__list">
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <p className="nhis-data-gap__consequence">{consequence}</p>
      </div>
    </section>
  );
}
