import { PROTOCOLS } from '../nastra/protocols/registry';
import { buildSurgeonBrief } from '../nastra/surgeon/brief';
import { ToolGateway } from '../nastra/tools/gateway';
import type { StationDeps } from './deps';

/**
 * Crew-requested escalation (the persistent Escalate control, NHIS A18).
 * Same handover brief as an automatic escalation, built in code.
 */
export async function escalateByCrew(deps: StationDeps, asOf: string, target: 'flight_surgeon' | 'crew_medical_officer', note?: string) {
  const { db, crewId } = deps;
  const history = await db.rpc<Record<string, unknown>>('health_history', { p_crew_id: crewId, p_limit: 5 });
  const open = history.find((h) => h.origin === 'live' && h.status === 'awaiting_followup' && Date.parse(String(h.opened_at)) > Date.parse(asOf) - 6 * 3600_000);

  let eventId: string;
  if (open) eventId = String(open.id);
  else {
    const row = await db.insert<{ id: string }>('health_events', {
      crew_id: crewId, opened_at: asOf, status: 'escalated', origin: 'live', utterance: note || 'Escalation requested by crew',
      speech_act: 'request', urgency: 'advisory', confidence: 'high', context_snapshot: {}, ai_summary: 'Crew-requested escalation', outcome: 'escalated_by_crew', closed_at: asOf,
    });
    eventId = row.id;
  }

  const gw = new ToolGateway(db, { crewId, asOf, allowed: PROTOCOLS.red_flag_response.allowedTools });
  const [vitals, mission, sleep, mood] = await Promise.all([
    gw.vitalsNow().catch(() => undefined), gw.missionContext().catch(() => undefined),
    gw.recentSleep(3).catch(() => undefined), gw.recentMood(1).catch(() => undefined),
  ]);
  const transcript = await db.rpc<{ ts: string; role: string; content: string }>('event_transcript', { p_event_id: eventId }).catch(() => []);
  const brief = buildSurgeonBrief({
    crewId, asOf, utterance: note || (open ? String(open.utterance ?? '') : 'Escalation requested by crew'),
    trigger: { kind: 'crew_request', target, note },
    event: open ? { utterance: (open.utterance as string) ?? null, opened_at: String(open.opened_at), symptoms: open.symptoms, protocol_id: (open.protocol_id as string) ?? null } : null,
    interp: null, transcript, vitals, sleep, mood, mission, episodes: [],
    questionText: Object.fromEntries(Object.values(PROTOCOLS).flatMap((p) => p.mandatoryQuestions.map((q) => [q.id, q.text]))),
  });
  const row = await db.insert<{ id: string }>('surgeon_alerts', {
    event_id: eventId, crew_id: crewId, urgency: 'advisory', reasons: ['Crew member requested escalation'], utterance: note ?? null,
    evidence: [], headline: brief.headline, brief, status: 'pending', created_at: asOf, target,
  });
  return { alertId: row.id, eventId, headline: brief.headline };
}
