import { describe, expect, it } from 'vitest';
import { acknowledge, alertCounts, evaluateFreshness, highestPriority, reclassify, setAnnunciation, validateAlert } from '../semantics/rules';
import { formatAge, formatNumber, formatSignedDelta, formatTimestamp, MINUS } from '../semantics/format';
import type { OperationalAlert } from '../semantics/model';

const t = { iso: '2026-11-14T14:32:05Z', system: 'UTC' as const };
const caution: OperationalAlert = {
  id: 'c',
  priority: 'caution',
  title: 'HR trend',
  source: 'Health telemetry',
  origin: { kind: 'health-assessment', engine: 'test' },
  timestamp: t,
  active: true,
  acknowledgement: 'unacknowledged',
  annunciation: 'annunciating',
  protocol: { id: 'P', title: 'Protocol' },
};

describe('NHIS operational alert model', () => {
  it('rejects an Emergency assigned by health-assessment / AI logic', () => {
    const bad: OperationalAlert = { ...caution, priority: 'emergency' };
    expect(validateAlert(bad).join(' ')).toMatch(/cannot originate from health-assessment/);
  });

  it('rejects an Emergency without an authorization', () => {
    const bad: OperationalAlert = { ...caution, priority: 'emergency', origin: { kind: 'vehicle-system', sourceId: 'V' } };
    expect(validateAlert(bad).join(' ')).toMatch(/requires an authorization/);
  });

  it('accepts an Emergency asserted by an approved source', () => {
    const ok: OperationalAlert = {
      ...caution,
      priority: 'emergency',
      origin: { kind: 'vehicle-system', sourceId: 'V' },
      authorization: { kind: 'vehicle-system', sourceId: 'V', sourceName: 'Vehicle C&W', assertedAt: t },
    };
    expect(validateAlert(ok)).toEqual([]);
  });

  it('requires a protocol link on Caution, Warning and Emergency (A6)', () => {
    expect(validateAlert({ ...caution, protocol: undefined }).join(' ')).toMatch(/protocol/);
    expect(validateAlert({ ...caution, priority: 'advisory', protocol: undefined })).toEqual([]);
  });

  it('acknowledgement and annunciation controls never change the class', () => {
    const a = setAnnunciation(acknowledge(caution), 'suppressed');
    expect(a.priority).toBe('caution');
    expect(a.active).toBe(true);
    expect(a.acknowledgement).toBe('acknowledged');
  });

  it('reclassification requires an operational authority', () => {
    // @ts-expect-error — no authority supplied
    expect(() => reclassify(caution, 'warning', undefined)).toThrow(/operational authority/);
    const up = reclassify(caution, 'warning', { kind: 'validated-protocol', sourceId: 'PRT', sourceName: 'Protocol' });
    expect(up.priority).toBe('warning');
  });

  it('highest active priority and counts', () => {
    const w = { ...caution, id: 'w', priority: 'warning' as const };
    const cleared = { ...w, id: 'w2', active: false };
    expect(highestPriority([caution, w, cleared])?.id).toBe('w');
    expect(alertCounts([caution, w, cleared])).toEqual({ active: 2, unacknowledged: 2, inhibited: 0 });
  });
});

describe('freshness (A7, B33)', () => {
  const policy = { delayedAfterMs: 10_000, staleAfterMs: 60_000, owner: 'test', rationale: 'test' };
  const now = Date.parse('2026-11-14T14:32:00Z');
  it('live / delayed / stale / unavailable / unknown', () => {
    expect(evaluateFreshness('2026-11-14T14:31:55Z', now, policy).quality).toBe('live');
    expect(evaluateFreshness('2026-11-14T14:31:40Z', now, policy).quality).toBe('delayed');
    expect(evaluateFreshness('2026-11-14T14:30:00Z', now, policy).quality).toBe('stale');
    expect(evaluateFreshness(undefined, now, policy).quality).toBe('unavailable');
    expect(evaluateFreshness('not a date', now, policy).quality).toBe('unknown');
  });
});

describe('number and time presentation (A23)', () => {
  it('keeps the leading zero, uses a true minus sign, fixed decimals', () => {
    expect(formatNumber(0.5, { decimals: 1 })).toBe('0.5');
    expect(formatNumber(-12, { decimals: 1 })).toBe(`${MINUS}12.0`);
    expect(formatNumber(-0.0001, { decimals: 1 })).toBe('0.0');
  });
  it('signs every delta', () => {
    expect(formatSignedDelta(12)).toBe('+12');
    expect(formatSignedDelta(-4)).toBe(`${MINUS}4`);
    expect(formatSignedDelta(0)).toBe('±0');
  });
  it('labels the time system and uses 24 h', () => {
    expect(formatTimestamp(t)).toBe('14:32:05 UTC');
    expect(formatTimestamp({ iso: '2026-11-14T14:32:05Z', system: 'MET', missionEpochIso: '2026-11-02T06:00:00Z' })).toBe('MET 012/08:32:05');
  });
  it('formats data age', () => {
    expect(formatAge(8_000)).toBe('8 s');
    expect(formatAge(252_000)).toBe('4 min 12 s');
  });
});
