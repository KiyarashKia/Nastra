import { describe, expect, it } from 'vitest';
import { compareWithYesterday, spark } from '../src/ui/eva/compare';

const H = 3600_000, T0 = Date.parse('2026-11-15T20:00:00Z');
const series = (vals: (number | null)[]) => vals.map((v, i) => ({ t: new Date(T0 - (vals.length - 1 - i) * H).toISOString(), v }));

describe('EVA: now vs the same hour yesterday', () => {
  it('compares the last hourly value with the value 24 h earlier, and flags the personal band', () => {
    const vals = Array.from({ length: 30 }, (_, i) => 70 + i * 0.1);
    vals[vals.length - 1] = 86;                         // now
    vals[vals.length - 25] = 71;                        // same hour yesterday
    const rows = compareWithYesterday([{ key: 'heart_rate_bpm', label: 'Heart rate', unit: 'bpm', decimals: 0, samples: series(vals), baseline: { low: 65, high: 80, reference: 72 } }]);
    expect(rows[0]).toMatchObject({ label: 'HR', now: 86, yday: 71, delta: 15, band: 'above' });
    expect(rows[0].spark).toHaveLength(24);
  });
  it('never invents a value: no reading near t-24h gives "—", missing data is skipped', () => {
    const rows = compareWithYesterday([
      { key: 'spo2_pct', label: 'SpO2', unit: '%', decimals: 0, samples: series([97, 98]) },
      { key: 'hrv_rmssd_ms', label: 'HRV', unit: 'ms', decimals: 0, samples: series([null, null]) },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ yday: null, delta: null, band: null });
  });
  it('spark scales to the window', () => { expect(spark([1, 2, 3])).toBe('▁▅█'); });
});
