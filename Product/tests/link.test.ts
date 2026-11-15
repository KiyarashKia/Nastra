import { describe, expect, it } from 'vitest';
import { escalationFromAlert, LINK_RTT_MS, receiptLine } from '../src/nastra/station/link';

const sent = '2026-11-15T21:03:00.000Z';
const at = (ms: number) => new Date(Date.parse(sent) + ms).toISOString();
const row = (over: Record<string, unknown> = {}) => ({ id: 'a1', created_at: sent, status: 'pending', target: 'flight_surgeon', headline: 'h', ...over });

describe('escalation receipt (simulated link)', () => {
  it('stays "sent" until one link round trip has passed, then is received by ground', () => {
    const before = escalationFromAlert(row(), at(LINK_RTT_MS - 100));
    expect(before.state).toBe('sent');
    expect(before.state !== 'draft' && before.receiptDueAt).toBe(at(LINK_RTT_MS));
    const after = escalationFromAlert(row(), at(LINK_RTT_MS + 1));
    expect(after.state).toBe('received');
    expect(after.state !== 'draft' && after.receivedAt).toBe(at(LINK_RTT_MS));
    expect(after.state !== 'draft' && after.receiptSimulated).toBe(true);
    expect(receiptLine(after)).toMatch(/Ground received .* \(simulated receipt\)/);
  });
  it('the onboard CMO has no link delay and is named, never "ground"', () => {
    const e = escalationFromAlert(row({ target: 'crew_medical_officer' }), at(1500));
    expect(e.state).toBe('received');
    expect(receiptLine(e)).toMatch(/crew medical officer onboard received/i);
    expect(receiptLine(e)).not.toMatch(/Ground/);
  });
  it('a real acknowledgement and reply from the ground console win over the simulation', () => {
    const ack = escalationFromAlert(row({ status: 'acknowledged', acknowledged_at: at(900) }), at(1000));
    expect(ack.state === 'received' && ack.receiptSimulated).toBe(false);
    const ans = escalationFromAlert(row({ status: 'acknowledged', acknowledged_at: at(900), ground_note: 'Stay put, calling you.' }), at(5000));
    expect(ans.state).toBe('answered');
    expect(receiptLine(ans)).toMatch(/replied: "Stay put/);
  });
});
