import type { Db, HealthEventRow } from './db/types';
import type { Embedder } from './knowledge/embed';
import { buildEvidence, type EvidenceItem } from './evidence';
import type { LlmClient } from './llm/provider';
import { normalizeInput, type RawInput } from './normalize';
import { analysePattern } from './patterns';
import { PROTOCOLS, type Protocol, type ToolName } from './protocols/registry';
import { explain, type ExplanationResult, type Stage } from './respond/respond';
import { CLARIFY, DISCLAIMER, ESCALATION, ESCALATION_ALERT_FAILED, GUIDANCE, recheckLine, REDIRECT } from './respond/templates';
import type { EventState, RouteResult } from './router';
import { ToolGateway } from './tools/gateway';
import type { SourceRef, Urgency } from './types';
import { understand, type Understanding } from './understand';

export interface NastraReply {
  eventId: string | null;
  eventStatus: HealthEventRow['status'] | null;
  action: RouteResult['action']['kind'];
  urgency: Urgency;
  protocol: { id: string; title: string; version: string; status: string } | null;
  headline?: string;
  immediateStep?: string;
  explanation?: string;
  explanationSource?: 'model' | 'fallback';
  /** Why the model's explanation was rejected, when it was. Shown in dev tools, logged always. */
  explanationIssues?: string[];
  questions: { id: string; text: string; redFlag: boolean }[];
  steps: string[];
  /** Set on every escalation. delivered=false means the alert could not be written: the crew must use voice. */
  alert?: { id: string | null; delivered: boolean; error?: string };
  recheckMinutes?: number;
  confirmLog?: { field: string; value: string }[];
  evidence: EvidenceItem[];
  sources: SourceRef[];
  disclaimer: string;
  trace: string[];
  timings: { interpretMs: number; explainMs: number; totalMs: number };
}

export interface PipelineDeps {
  db: Db;
  llm: LlmClient;
  model: string;
  respondModel?: string;
  /** Override "now" (tests, demo replays). */
  asOf?: string;
  /** Local embedder for knowledge ranking. Without it, knowledge is tag-filtered only. */
  embed?: Embedder;
}

const ALL_TOOLS: ToolName[] = [
  'telemetry.vitals_now', 'health.recent_sleep', 'health.recent_mood',
  'health.similar_episodes', 'mission.current_context', 'knowledge.search',
];

const DATA_TOOLS: Record<string, ToolName[]> = {
  vitals_now: ['telemetry.vitals_now', 'mission.current_context'],
  heart_rate_trend: ['telemetry.vitals_now', 'mission.current_context'],
  sleep_trend: ['health.recent_sleep'],
  mood_trend: ['health.recent_mood'],
  stress_trend: ['health.recent_mood'],
  schedule: ['mission.current_context'],
  past_events: ['health.similar_episodes'],
  other: ['telemetry.vitals_now', 'health.recent_sleep', 'health.recent_mood', 'mission.current_context'],
};

export async function handleMessage(raw: RawInput, deps: PipelineDeps): Promise<NastraReply> {
  const started = Date.now();
  const asOf = deps.asOf ?? new Date().toISOString();
  const env = normalizeInput({ ...raw, ts: raw.ts ?? asOf });

  // Load the open event, if this message continues one.
  let event: (HealthEventRow & { symptoms?: unknown }) | null = null;
  let state: EventState | undefined;
  if (env.eventId) {
    event = await deps.db.getById<HealthEventRow & { symptoms?: unknown }>('health_events', env.eventId);
    if (event && (event.status === 'open' || event.status === 'awaiting_followup')) {
      const snap = parse(event.context_snapshot);
      state = (snap.protocol_state as EventState) ?? undefined;
    } else {
      event = null;
    }
  }

  const u = await understand(env, deps.llm, { model: deps.model, state });
  const a = u.route.action;
  const interpretMs = u.interpretation?.latencyMs ?? 0;
  const base = {
    urgency: u.route.urgency,
    trace: u.route.trace,
    disclaimer: DISCLAIMER,
    questions: [] as NastraReply['questions'],
    steps: [] as string[],
    evidence: [] as EvidenceItem[],
    sources: [] as SourceRef[],
  };

  // ── Paths with no model-written text and no DB write ───────────────────────
  if (a.kind === 'clarify' || a.kind === 'redirect') {
    return {
      ...base, eventId: event?.id ?? null, eventStatus: event?.status ?? null, action: a.kind, protocol: null,
      explanation: a.kind === 'clarify' ? CLARIFY : REDIRECT, explanationSource: 'fallback',
      timings: { interpretMs, explainMs: 0, totalMs: Date.now() - started },
    };
  }
  if (a.kind === 'log') {
    return {
      ...base, eventId: null, eventStatus: null, action: 'log', protocol: null,
      explanation: 'Here is what I will log. Confirm and I will save it.', explanationSource: 'fallback',
      confirmLog: u.interpretation?.interpretation.log_entries ?? [],
      timings: { interpretMs, explainMs: 0, totalMs: Date.now() - started },
    };
  }

  // ── Escalation: deterministic, the model is not consulted ──────────────────
  if (a.kind === 'escalate') {
    const gw = new ToolGateway(deps.db, { crewId: env.crewId, asOf, allowed: ALL_TOOLS });
    // Best effort: package current data for the flight surgeon. Never blocks the escalation.
    const [vitals, mission] = await Promise.all([gw.vitalsNow().catch(() => undefined), gw.missionContext().catch(() => undefined)]);
    const evidence = buildEvidence({ vitals, mission });
    const eventId = await persist(deps.db, {
      event, env, u, asOf, status: 'escalated', protocol: u.route.protocol, mission,
      outcome: 'escalated_to_flight_surgeon (simulated)', summary: `Escalated: ${a.reasons.join('; ')}`,
      replyText: [ESCALATION.headline, ...ESCALATION.steps].join(' '), toolCalls: gw.calls, state,
    });
    // The promise in ESCALATION.steps ("I'm sending this … to the flight surgeon") must be true.
    let alert: NonNullable<NastraReply['alert']>;
    try {
      const row = await deps.db.insert<{ id: string }>('surgeon_alerts', {
        event_id: eventId, crew_id: env.crewId, urgency: 'warning', reasons: a.reasons,
        utterance: env.utterance, evidence, status: 'pending', created_at: asOf,
      });
      alert = { id: row.id, delivered: true };
    } catch (err) {
      alert = { id: null, delivered: false, error: (err as Error).message };
    }
    const steps = alert.delivered ? ESCALATION.steps : [...ESCALATION.steps.slice(0, 2), ESCALATION_ALERT_FAILED];
    return {
      ...base, eventId, eventStatus: 'escalated', action: 'escalate', urgency: 'warning', protocol: protoInfo(u.route.protocol),
      headline: ESCALATION.headline, steps, alert,
      explanation: `Reason: ${a.reasons.join('; ')}.`, explanationSource: 'fallback', evidence,
      timings: { interpretMs, explainMs: 0, totalMs: Date.now() - started },
    };
  }

  // ── Data questions ─────────────────────────────────────────────────────────
  if (a.kind === 'answer_data') {
    const allowed = DATA_TOOLS[a.target ?? 'other'] ?? DATA_TOOLS.other;
    const gw = new ToolGateway(deps.db, { crewId: env.crewId, asOf, allowed });
    const has = (t: ToolName) => allowed.includes(t);
    const [vitals, sleep, mood, mission] = await Promise.all([
      has('telemetry.vitals_now') ? gw.vitalsNow() : undefined,
      has('health.recent_sleep') ? gw.recentSleep(7) : undefined,
      has('health.recent_mood') ? gw.recentMood(6) : undefined,
      has('mission.current_context') ? gw.missionContext() : undefined,
    ]);
    const evidence = buildEvidence({ vitals, sleep, mood, mission });
    const ex = await explain(deps.llm, { model: deps.respondModel ?? deps.model, utterance: env.utterance, stage: 'data_answer', evidence });
    const eventId = await persist(deps.db, {
      event: null, env, u, asOf, status: 'resolved', protocol: null, mission, outcome: 'answered',
      summary: ex.text, replyText: ex.text, toolCalls: gw.calls, explanation: ex,
    });
    return {
      ...base, eventId, eventStatus: 'resolved', action: 'answer_data', protocol: null,
      explanation: ex.text, explanationSource: ex.source, explanationIssues: ex.violationsSeen, evidence,
      timings: { interpretMs, explainMs: ex.latencyMs, totalMs: Date.now() - started },
    };
  }

  // ── Protocol path ──────────────────────────────────────────────────────────
  const protocol = u.route.protocol!;
  const interp = u.interpretation!.interpretation;
  const gw = new ToolGateway(deps.db, { crewId: env.crewId, asOf, allowed: protocol.allowedTools });
  const [vitals, sleep, mood, mission] = await Promise.all([
    gw.vitalsNow(), gw.recentSleep(3), gw.recentMood(1), gw.missionContext(),
  ]);
  const eventSymptoms = (parse(event?.symptoms) as unknown as { body_system: string }[]) ?? [];
  const bodySystem = interp.symptoms[0]?.body_system ?? (Array.isArray(eventSymptoms) ? eventSymptoms[0]?.body_system : undefined) ?? protocol.appliesTo.bodySystems[0] ?? null;
  const domain = protocol.appliesTo.domains[0];
  const candidates = await gw.similarEpisodes({ bodySystem, domain, missionContext: mission.context });
  // "Similar" means the same body system. Sharing only the context (e.g. "after exercise")
  // with an unrelated complaint is not a pattern, and must not be presented as one.
  const episodes = bodySystem ? candidates.filter((e) => e.matched_on.includes('body_system')) : candidates;
  const pattern = analysePattern({ episodes, mission, sleep, mood });
  const tags = protocol.knowledgeTags.length ? protocol.knowledgeTags : [bodySystem ?? 'other'];
  const queryText = [env.utterance, ...interp.symptoms.map((s) => s.category.replace(/_/g, ' '))].join(' · ');
  const knowledge = await gw.knowledge(tags, 2, { text: queryText, embed: deps.embed }).catch(() => []);
  const evidence = buildEvidence({ vitals, sleep, mood, mission, pattern, knowledge, protocol });

  const action = a; // kind === 'protocol'
  const stage: Stage = !state ? 'first_turn' : action.readyForGuidance ? 'guidance' : 'followup';
  const answersSummary = interp.followup_answers.length
    ? interp.followup_answers.map((f) => `${protocol.mandatoryQuestions.find((q) => q.id === f.question_id)?.text ?? f.question_id} → ${f.answer}${f.detail ? ` (${f.detail})` : ''}`).join(' | ')
    : undefined;
  const ex = await explain(deps.llm, { model: deps.respondModel ?? deps.model, utterance: env.utterance, stage, evidence, answersSummary });

  const steps = action.readyForGuidance
    ? [...(GUIDANCE[protocol.id] ?? []), ...(protocol.recheckMinutes ? [recheckLine(protocol.recheckMinutes)] : [])]
    : [];
  const newState: EventState = {
    protocolId: protocol.id,
    asked: mergeAsked(state?.asked ?? [], action.askNow.map((q) => q.id), interp.followup_answers),
    knownInfo: [...new Set([...(state?.knownInfo ?? []), ...knownFrom(interp, protocol)])],
    turn: (state?.turn ?? 0) + 1,
    urgency: u.route.urgency,
    redFlagPrompts: (state?.redFlagPrompts ?? 0) + (action.askNow.some((q) => q.redFlag) ? 1 : 0),
  };
  const replyText = [action.showImmediateStep ? protocol.immediateStep : null, ex.text, ...action.askNow.map((q) => q.text), ...steps].filter(Boolean).join(' ');
  const eventId = await persist(deps.db, {
    event, env, u, asOf, status: 'awaiting_followup', protocol, mission, sleep, mood,
    outcome: action.readyForGuidance ? 'monitoring' : null, summary: ex.text, replyText,
    toolCalls: gw.calls, state: newState, explanation: ex,
    recheckDueAt: action.readyForGuidance && protocol.recheckMinutes ? new Date(Date.parse(asOf) + protocol.recheckMinutes * 60_000).toISOString() : undefined,
  });

  return {
    ...base, eventId, eventStatus: 'awaiting_followup', action: 'protocol', protocol: protoInfo(protocol),
    immediateStep: action.showImmediateStep ? protocol.immediateStep ?? undefined : undefined,
    explanation: ex.text, explanationSource: ex.source, explanationIssues: ex.violationsSeen,
    questions: action.askNow.map((q) => ({ id: q.id, text: q.text, redFlag: q.redFlag })),
    steps, recheckMinutes: action.readyForGuidance ? protocol.recheckMinutes ?? undefined : undefined,
    evidence, sources: protocol.sources,
    timings: { interpretMs, explainMs: ex.latencyMs, totalMs: Date.now() - started },
  };
}

/** Close an event from the UI ("I'm feeling better" / recheck done). */
export async function closeEvent(db: Db, eventId: string, outcome: string, notes?: string): Promise<void> {
  await db.update('health_events', eventId, { status: 'resolved', closed_at: new Date().toISOString(), outcome, outcome_notes: notes ?? null });
  await db.insert('event_turns', { event_id: eventId, role: 'system', content: `Event closed: ${outcome}${notes ? ` — ${notes}` : ''}` });
}

/** Write a confirmed log. Only called after the crew member confirms. */
export async function commitLog(db: Db, crewId: string, entries: { field: string; value: string }[], at = new Date()): Promise<void> {
  const n = (f: string) => {
    const v = entries.find((e) => e.field === f)?.value;
    const x = v === undefined ? NaN : Number.parseFloat(v);
    return Number.isFinite(x) ? x : null;
  };
  const clamp = (x: number | null) => (x === null ? null : Math.min(5, Math.max(1, Math.round(x))));
  const note = entries.find((e) => e.field === 'note')?.value ?? null;
  if (['mood', 'stress', 'fatigue', 'note'].some((f) => entries.some((e) => e.field === f))) {
    await db.insert('mood_logs', { crew_id: crewId, ts: at.toISOString(), mood: clamp(n('mood')), stress: clamp(n('stress')), fatigue: clamp(n('fatigue')), note, source: 'self-report' });
  }
  const hours = n('sleep_hours');
  if (hours !== null && hours > 0 && hours < 24) {
    await db.insert('sleep_logs', {
      crew_id: crewId, sleep_start: new Date(at.getTime() - hours * 3_600_000).toISOString(), sleep_end: at.toISOString(),
      hours, quality: clamp(n('sleep_quality')), source: 'self-report',
    });
  }
}

// ── internals ────────────────────────────────────────────────────────────────

async function persist(db: Db, p: {
  event: HealthEventRow | null;
  env: ReturnType<typeof normalizeInput>;
  u: Understanding;
  asOf: string;
  status: HealthEventRow['status'];
  protocol: Protocol | null;
  mission?: { context: string; minutes_since_exercise: number | null };
  sleep?: { hours: number }[];
  mood?: { stress: number; fatigue: number }[];
  outcome: string | null;
  summary: string;
  replyText: string;
  toolCalls: ToolGateway['calls'];
  state?: EventState;
  explanation?: ExplanationResult;
  recheckDueAt?: string;
}): Promise<string> {
  const i = p.u.interpretation?.interpretation;
  const redFlagsReported = p.u.screen.hits.map((h) => h.id);
  const snapshot = {
    protocol_state: p.state ?? null,
    minutes_since_exercise: p.mission?.minutes_since_exercise ?? null,
    sleep_hours_prior: p.sleep?.[0]?.hours ?? null,
    morning_stress: p.mood?.[0]?.stress ?? null,
    morning_fatigue: p.mood?.[0]?.fatigue ?? null,
    red_flags_reported: redFlagsReported,
    red_flags_negated: p.u.screen.negated.map((h) => h.id),
    recheck_due_at: p.recheckDueAt ?? null,
  };

  let eventId: string;
  if (p.event) {
    eventId = p.event.id;
    const prev = parse(p.event.context_snapshot);
    await db.update('health_events', eventId, {
      status: p.status,
      urgency: p.u.route.urgency,
      context_snapshot: { ...prev, ...snapshot, sleep_hours_prior: prev.sleep_hours_prior ?? snapshot.sleep_hours_prior, morning_stress: prev.morning_stress ?? snapshot.morning_stress },
      ai_summary: p.summary,
      ...(p.outcome ? { outcome: p.outcome } : {}),
      ...(p.status === 'escalated' ? { closed_at: p.asOf } : {}),
    });
  } else {
    const row = await db.insert<{ id: string }>('health_events', {
      crew_id: p.env.crewId,
      opened_at: p.asOf,
      status: p.status,
      origin: 'live',
      utterance: p.env.utterance,
      speech_act: i?.speech_act ?? 'report',
      domain: i?.domain ?? (p.protocol?.appliesTo.domains[0] ?? 'physical_symptom'),
      symptoms: i?.symptoms ?? [],
      urgency: p.u.route.urgency,
      confidence: i?.confidence ?? 'high',
      mission_context: p.mission?.context ?? null,
      protocol_id: p.protocol?.id ?? null,
      context_snapshot: snapshot,
      ai_summary: p.summary,
      outcome: p.outcome,
      ...(p.status === 'resolved' || p.status === 'escalated' ? { closed_at: p.asOf } : {}),
    });
    eventId = row.id;
  }

  await db.insert('event_turns', {
    event_id: eventId, ts: p.asOf, role: 'crew', content: p.env.utterance,
    payload: { safety: p.u.screen, interpretation: i ?? null, attachments: p.env.attachments.map((x) => ({ id: x.id, kind: x.kind, name: x.name, confirmed: x.confirmed })) },
  });
  await db.insert('event_turns', {
    event_id: eventId, ts: new Date(Date.parse(p.asOf) + 1).toISOString(), role: 'nastra', content: p.replyText,
    payload: { action: p.u.route.action, urgency: p.u.route.urgency, trace: p.u.route.trace, explanation_source: p.explanation?.source ?? 'template', validation: p.explanation?.validation ?? null, violations_seen: p.explanation?.violationsSeen ?? [] },
  });
  for (const c of p.toolCalls) {
    await db.insert('tool_calls', { event_id: eventId, ts: p.asOf, tool: c.tool, args: c.args, result_summary: { ...c.summary, ms: c.ms }, ok: c.ok });
  }
  return eventId;
}

function mergeAsked(prev: EventState['asked'], newlyAsked: string[], answers: { question_id: string; answer: 'yes' | 'no' | 'unclear' }[]): EventState['asked'] {
  const m = new Map(prev.map((a) => [a.id, a.answer] as const));
  for (const a of answers) m.set(a.question_id, a.answer);
  for (const id of newlyAsked) if (!m.has(id) || m.get(id) === 'unclear') m.set(id, null);
  return [...m.entries()].map(([id, answer]) => ({ id, answer }));
}

function knownFrom(i: { onset: string | null; duration: string | null; severity: string | null; activity_context: string | null; followup_answers: { question_id: string; answer: string }[] }, protocol: Protocol): string[] {
  const k: string[] = [];
  if (i.onset) k.push('onset');
  if (i.duration) k.push('duration');
  if (i.severity) k.push('severity');
  if (i.activity_context) k.push('current_activity');
  for (const a of i.followup_answers) {
    if (a.answer === 'unclear') continue;
    k.push(...(protocol.mandatoryQuestions.find((q) => q.id === a.question_id)?.fills ?? []));
  }
  return k;
}

function protoInfo(p: Protocol | null) {
  return p ? { id: p.id, title: p.title, version: p.version, status: p.status } : null;
}

function parse(v: unknown): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
  return v as Record<string, unknown>;
}

export { PROTOCOLS };
