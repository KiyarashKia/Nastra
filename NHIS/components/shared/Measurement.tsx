import { formatNumber } from '../../semantics/format';
import type { DataOrigin, DataQuality } from '../../semantics/model';

export interface MeasurementProps {
  /** Last known value. `undefined` renders "—" and is never shown as zero. */
  value: number | undefined;
  unit: string;
  /** Fixed decimals for this stream so values align (A23). */
  decimals?: number;
  quality?: DataQuality;
  origin?: DataOrigin;
  size?: 'primary' | 'secondary' | 'tabular';
  className?: string;
}

/**
 * The formatted number + unit. Shared by every surface that prints a value.
 * - unit always shown (A23, V2 10046)
 * - stale/delayed values stay fully legible but carry a dashed outline (A7)
 * - unavailable/unknown never print a number (a missing value is not zero)
 * - estimated values carry "≈" (NISTIR 7804 data-accuracy)
 */
export function Measurement({
  value,
  unit,
  decimals = 0,
  quality = 'live',
  origin = 'measured',
  size = 'primary',
  className,
}: MeasurementProps) {
  const missing = quality === 'unavailable' || quality === 'unknown' || value === undefined;
  const text = missing ? '—' : formatNumber(value!, { decimals });
  const prefix = !missing && origin === 'estimated' ? '≈' : '';
  return (
    <span
      className={[
        'nhis-measurement',
        `nhis-measurement--${size}`,
        `nhis-measurement--${quality}`,
        missing && 'nhis-measurement--missing',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="nhis-measurement__value nhis-num">
        {prefix}
        {text}
      </span>
      <span className="nhis-measurement__unit">{unit}</span>
    </span>
  );
}
