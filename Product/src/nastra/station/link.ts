/**
 * Escalation link model (simulated). Deterministic, no model involved.
 *
 * Receipt: an alert to the flight surgeon crosses the ground link, so its receipt can only be known
 * one round trip after sending (out + ack back = NASTRA_LINK_RTT). The crew medical officer is onboard:
 * no link delay, receipt after a fixed 1 s. A real acknowledgement from the ground console
 * (`npm run surgeon`) always replaces the simulated one. Every simulated receipt is labelled as such.
 */
export type EscalationTarget = 'flight_surgeon' | 'crew_medical_officer';

export const LINK_RTT_MS = Math.round((Number(process.env.NASTRA_LINK_RTT) || 2.6) * 1000);
const ONBOARD_ACK_MS = 1000;

const toMs = (v: unknown) => new Date(v instanceof Date ? v : String(v)).getTime();
const toIso = (ms: number) => new Date(ms).toISOString();

export function receiptDelayMs(target: EscalationTarget): number {
  return target === 'crew_medical_officer' ? ONBOARD_ACK_MS : LINK_RTT_MS;
}

export type EscalationView =
  | { state: 'draft' }
  | {
      state: 'sent' | 'received' | 'answered';
      alertId: string;
      target: EscalationTarget;
      headline: string | null;
      sentAt: string;
      receivedAt: string | null;
      /** When the simulated receipt is due (state 'sent' only), so the client can refresh on time. */
      receiptDueAt: string | null;
      receiptSimulated: boolean;
      reply: string | null;
    };

export function escalationFromAlert(r: Record<string, unknown> | undefined, asOf: string): EscalationView {
  if (!r) return { state: 'draft' };
  const target: EscalationTarget = r.target === 'crew_medical_officer' ? 'crew_medical_officer' : 'flight_surgeon';
  const sentMs = toMs(r.created_at);
  const base = { alertId: String(r.id), target, headline: (r.headline as string) ?? null, sentAt: toIso(sentMs), reply: (r.ground_note as string) ?? null };
  if (r.ground_note) return { ...base, state: 'answered', receivedAt: r.acknowledged_at ? toIso(toMs(r.acknowledged_at)) : null, receiptDueAt: null, receiptSimulated: false };
  if (r.status !== 'pending' || r.acknowledged_at) {
    return { ...base, state: 'received', receivedAt: r.acknowledged_at ? toIso(toMs(r.acknowledged_at)) : null, receiptDueAt: null, receiptSimulated: false };
  }
  const dueMs = sentMs + receiptDelayMs(target);
  if (toMs(asOf) >= dueMs) return { ...base, state: 'received', receivedAt: toIso(dueMs), receiptDueAt: null, receiptSimulated: true };
  return { ...base, state: 'sent', receivedAt: null, receiptDueAt: toIso(dueMs), receiptSimulated: false };
}

const hhmmss = (iso: string) => iso.slice(11, 19);
const WHO: Record<EscalationTarget, string> = { flight_surgeon: 'the flight surgeon', crew_medical_officer: 'the crew medical officer onboard' };

/** One deterministic sentence for the crew about where their alert is. */
export function receiptLine(e: EscalationView): string {
  if (e.state === 'draft') return 'No alert is on record. Call ground on the voice loop now.';
  if (e.state === 'answered') return `${cap(WHO[e.target])} replied: "${e.reply}"`;
  if (e.state === 'received') {
    const where = e.target === 'flight_surgeon' ? 'Ground received' : `${cap(WHO[e.target])} received`;
    return `${where} your alert at ${e.receivedAt ? hhmmss(e.receivedAt) : '—'} UTC${e.receiptSimulated ? ' (simulated receipt)' : ''}. Stay on the voice loop for their reply.`;
  }
  return `Alert sent to ${WHO[e.target]} at ${hhmmss(e.sentAt)} UTC. Waiting for receipt${e.target === 'flight_surgeon' ? ` (link round trip ${(LINK_RTT_MS / 1000).toFixed(1)} s)` : ''}.`;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
