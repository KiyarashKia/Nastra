import type { Db, HealthEventRow } from './db/types';
import type { Embedder } from './knowledge/embed';
import { buildEvidence, type EvidenceItem } from './evidence';
import type { LlmClient } from './llm/provider';
import { normalizeInput, type RawInput } from './normalize';
import { analysePattern } from './patterns';
import { PROTOCOLS, type Protocol, type ToolName } from './protocols/registry';
import { explain, type ExplanationResult, type Stage } from './respond/respond';
import { CLARIFY, DISCLAIMER, ESCALATION, ESCALATION_ALERT_FAILED, ESCALATION_FOLLOWUP, GUIDANCE, recheckLine, REDIRECT } from './respond/templates';
import type { EventState, RouteResult } from './router';
import { ToolGateway } from './tools/gateway';
import { escalationState } from './station/read';
import { receiptLine } from './station/link';
import type { SourceRef, Urgency } from './types';
import { understand, type Understanding } from './understand';
import { buildSurgeonBrief } from './surgeon/brief';
import { buildAssessment, buildReadback, progressReporter, questionOut, type AssessmentOut, type ProgressEvent, type QuestionOut, type Readback } from './station/assessment';

export interface NastraReply {
  eventId: string | null;
  eventStatus: HealthEventRow['status'] | null;
  action: RouteResult['action']['kind'];
  urgency: Urgency;
  protocol: { id: string; code: string; title: string; version: string; status: string } | null;
  /** Protocol stage of this turn (symptom/stress reports only). */
  stage?: 'intake' | 'readback' | 'assess';
  readback?: Readback;
  assessment?: AssessmentOut;
  headline?: string;
  immediateStep?: string;
  explanation?: string;
  explanationSource?: 'model' | 'fallback' | 'template';
  /** Why the model's explanation was rejected, when it was. Shown in dev tools, logged always. */
  explanationIssues?: string[];
  questions: QuestionOut[];
  steps: string[];
  /** True when this turn continued an already-active escalation (no new alert was sent). */
  followup?: boolean;
  /** Present while an escalation is active: a small indicator, not a repeated banner. */
  escalation?: { status: string; reason: string };
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
  /** Real progress of the assessment steps, for the UI. */
  onProgress?: (e: ProgressEvent) => void;
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

  // ── Inside an active escalation: stay with it ──────────────────────────────
  // A new emergency still escalates again (the safety screen ran above). Data questions and logs are
  // answered normally. Everything else ("what do I do now", unclear text, new symptoms) is answered
  // in the context of the open escalation instead of starting a new conversation.
  if (a.kind !== 'escalate' && a.kind !== 'answer_data' && a.kind !== 'log') {
    const esc = await activeEscalation(deps.db, asOf, env.eventId).catch(() => null);
    if (esc) {
      const view = await escalationState(deps.db, env.crewId, asOf).catch(() => ({ state: 'draft' as const }));
      const status = receiptLine(view as Parameters<typeof receiptLine>[0]);
      const reason = String(esc.ai_summary ?? '').replace(/^Escalated:\s*/, '') || 'red-flag symptom';
      // Stay conversational: the model answers what they actually said, with the escalation and the
      // recent conversation in context. Status lives in a small indicator, not in every reply.
      const gw = new ToolGateway(deps.db, { crewId: env.crewId, asOf, allowed: ALL_TOOLS });
      const [vitals, mission] = await Promise.all([gw.vitalsNow().catch(() => undefined), gw.missionContext().catch(() => undefined)]);
      const evidence = buildEvidence({ vitals, mission });
      const transcript = await deps.db.rpc<{ ts: string; role: string; content: string }>('event_transcript', { p_event_id: esc.id }).catch(() => []);
      const conversation = transcript.slice(-10).map((t) => `${t.role === 'crew' ? 'Crew' : 'NASTRA'}: ${t.content}`).join('\n');
      const ex = await explain(deps.llm, {
        model: deps.respondModel ?? deps.model, utterance: env.utterance, stage: 'escalated', evidence,
        situation: `Escalated to the flight surgeon because: ${reason}. Alert status: ${status}`, conversation,
      });
      const text = ex.source === 'model' ? ex.text : ESCALATION_FOLLOWUP.fallback;
      // Approved safety steps only when they ask what to do, or the message was unclear.
      const wantsSteps = a.kind === 'clarify' || /\b(what (do|should|can) i|what now|now what|what next|next step|help me|what to do)\b/i.test(env.utterance);
      const steps = wantsSteps ? [...ESCALATION_FOLLOWUP.steps] : [];
      await deps.db.insert('event_turns', {
        event_id: esc.id, ts: asOf, role: 'crew', content: env.utterance,
        payload: { safety: u.screen, interpretation: u.interpretation?.interpretation ?? null, routed_as: a.kind },
      }).catch(() => undefined);
      await deps.db.insert('event_turns', {
        event_id: esc.id, ts: new Date(Date.parse(asOf) + 1).toISOString(), role: 'nastra', content: [text, ...steps].join(' '),
        payload: { action: 'escalation_followup', urgency: 'warning', explanation_source: ex.source },
      }).catch(() => undefined);
      return {
        ...base, urgency: 'warning', eventId: String(esc.id), eventStatus: 'escalated', action: 'escalate', followup: true,
        protocol: protoInfo(PROTOCOLS.red_flag_response), steps, evidence,
        escalation: { status, reason },
        explanation: text, explanationSource: ex.source === 'model' ? 'model' : 'fallback', explanationIssues: ex.violationsSeen,
        timings: { interpretMs, explainMs: ex.latencyMs, totalMs: Date.now() - started },
      };
    }
  }

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
    const [vitals, mission, sleep, mood] = await Promise.all([
      gw.vitalsNow().catch(() => undefined), gw.missionContext().catch(() => undefined),
      gw.recentSleep(3).catch(() => undefined), gw.recentMood(1).catch(() => undefined),
    ]);
    const interpNow = u.interpretation?.interpretation ?? null;
    const evSymptoms = parse(event?.symptoms) as unknown;
    // Past episodes for every body system in this event: the original complaint first, then anything new.
    const systems = [...new Set([
      ...(Array.isArray(evSymptoms) ? (evSymptoms as { body_system?: string }[]).map((x) => x.body_system) : []),
      ...(interpNow?.symptoms ?? []).map((x) => x.body_system),
    ].filter((x): x is string => !!x && x !== 'other'))];
    const episodes = (await Promise.all(systems.map((bs) =>
      gw.similarEpisodes({ bodySystem: bs, domain: null, missionContext: mission?.context ?? null }).catch(() => []),
    ))).flat().filter((e, i, all) => e.matched_on.includes('body_system') && all.findIndex((x) => x.id === e.id) === i);
    const evidence = buildEvidence({ vitals, mission });
    const eventId = await persist(deps.db, {
      event, env, u, asOf, status: 'escalated', protocol: u.route.protocol, mission,
      outcome: 'escalated_to_flight_surgeon (simulated)', summary: `Escalated: ${a.reasons.join('; ')}`,
      replyText: [ESCALATION.headline, ...ESCALATION.steps].join(' '), toolCalls: gw.calls, state,
    });
    // The promise in ESCALATION.steps ("I'm sending this … to the flight surgeon") must be true.
    let alert: NonNullable<NastraReply['alert']>;
    try {
      const transcript = await deps.db.rpc<{ ts: string; role: string; content: string }>('event_transcript', { p_event_id: eventId }).catch(() => []);
      const brief = buildSurgeonBrief({
        crewId: env.crewId, asOf, utterance: env.utterance, trigger: a.trigger,
        event: event ? { utterance: (event as { utterance?: string | null }).utterance ?? null, opened_at: event.opened_at, symptoms: event.symptoms, protocol_id: event.protocol_id, asked: state?.asked } : null,
        interp: interpNow, transcript, vitals, sleep, mood, mission, episodes,
        questionText: Object.fromEntries([...Object.values(PROTOCOLS), ...(u.route.protocol ? [u.route.protocol] : [])].flatMap((p) => p.mandatoryQuestions.map((q) => [q.id, q.text]))),
      });
      const row = await deps.db.insert<{ id: string }>('surgeon_alerts', {
        event_id: eventId, crew_id: env.crewId, urgency: 'warning', reasons: a.reasons,
        utterance: env.utterance, evidence, headline: brief.headline, brief, status: 'pending', created_at: asOf,
      });
      alert = { id: row.id, delivered: true };
    } catch (err) {
      alert = { id: null, delivered: false, error: (err as Error).message };
    }
    // Crew-facing Warning (NHIS WarningDialog). Persistent until acknowledged; linked to PRT-SY-01.
    const sy = PROTOCOLS.red_flag_response;
    await deps.db.insert('crew_alerts', {
      crew_id: env.crewId, created_at: asOf, priority: 'warning', title: 'Red-flag symptom detected',
      detail: `${a.reasons.join('; ')}. ${alert.delivered ? 'Flight surgeon alerted.' : 'Flight surgeon could not be alerted automatically.'}`,
      source: a.trigger.kind === 'model_flag' ? 'NASTRA (model-flagged)' : 'NASTRA safety screen', engine: 'nastra-safety',
      event_id: eventId, protocol_code: sy.code, protocol_title: sy.title,
    }).catch(() => undefined);
    const steps = alert.delivered ? ESCALATION.steps : [...ESCALATION.steps.slice(0, 2), ESCALATION_ALERT_FAILED];
    return {
      ...base, eventId, eventStatus: 'escalated', action: 'escalate', urgency: 'warning', protocol: protoInfo(PROTOCOLS.red_flag_response),
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
  const action = a as Extract<RouteResult['action'], { kind: 'protocol' }>;
  const structured = Boolean(env.answers || env.confirm);

  const values: Record<string, string> = { ...(state?.values ?? {}) };
  if (!values.description) values.description = env.utterance;
  if (interp.onset) values.onset = interp.onset;
  if (interp.severity) values.severity = interp.severity;
  if (interp.activity_context) values.activity = interp.activity_context;
  for (const f of interp.followup_answers) {
    const q = protocol.mandatoryQuestions.find((x) => x.id === f.question_id);
    if (q?.fills?.includes('trigger') && f.answer !== 'unclear') values.trigger = f.detail ?? 'yes';
  }
  const newState: EventState = {
    protocolId: protocol.id,
    asked: mergeAsked(state?.asked ?? [], action.askNow.map((q) => q.id), interp.followup_answers),
    knownInfo: [...new Set([...(state?.knownInfo ?? []), ...knownFrom(interp, protocol)])],
    turn: (state?.turn ?? 0) + 1,
    urgency: u.route.urgency,
    redFlagPrompts: (state?.redFlagPrompts ?? 0) + (action.askNow.some((q) => q.redFlag) ? 1 : 0),
    phase: action.stage === 'assess' ? 'assessed' : action.stage,
    clarity: state?.clarity === 'unclear' || (!structured && interp.confidence !== 'high') ? 'unclear' : 'clear',
    values,
  };
  const protoOut = protoInfo(protocol);

  // Intake: no data pulled, no model-written text. Code asks what the protocol still needs.
  if (action.stage === 'intake') {
    const n = action.askNow.length;
    const said = interp.symptoms.map((x) => x.said).filter(Boolean);
    const intro = !state
      ? `${protocol.appliesTo.domains[0] === 'psychological' ? 'I understand this as a stress or wellbeing report' : 'I understand this as a new symptom report'}${said.length ? `: ${said.join(', ')}` : ''}. ` +
        `${n === 1 ? 'One question' : `${n} questions`} before I look at your data.${values.onset ? ' Onset is noted from your message.' : ''}`
      : `Thanks. ${n === 1 ? 'One more question' : `${n} more questions`}.`;
    const replyText = [action.showImmediateStep ? protocol.immediateStep : null, intro, ...action.askNow.map((q) => q.text)].filter(Boolean).join(' ');
    const eventId = await persist(deps.db, {
      event, env, u, asOf, status: 'awaiting_followup', protocol, outcome: null, summary: intro, replyText, toolCalls: [], state: newState,
    });
    return {
      ...base, eventId, eventStatus: 'awaiting_followup', action: 'protocol', stage: 'intake', protocol: protoOut,
      immediateStep: action.showImmediateStep ? protocol.immediateStep ?? undefined : undefined,
      explanation: intro, explanationSource: 'template',
      questions: action.askNow.map(questionOut),
      timings: { interpretMs, explainMs: 0, totalMs: Date.now() - started },
    };
  }

  // Read-back: something was unclear, so the crew member confirms before NASTRA assesses.
  if (action.stage === 'readback') {
    const gw = new ToolGateway(deps.db, { crewId: env.crewId, asOf, allowed: protocol.allowedTools });
    const mission = await gw.missionContext().catch(() => undefined);
    const readback = buildReadback(values, mission);
    const replyText = `${readback.title}: ${readback.summary}`;
    const eventId = await persist(deps.db, {
      event, env, u, asOf, status: 'awaiting_followup', protocol, mission, outcome: null, summary: readback.summary, replyText, toolCalls: gw.calls, state: newState,
    });
    return {
      ...base, eventId, eventStatus: 'awaiting_followup', action: 'protocol', stage: 'readback', protocol: protoOut,
      explanation: readback.summary, explanationSource: 'template', readback,
      timings: { interpretMs, explainMs: 0, totalMs: Date.now() - started },
    };
  }

  // Assess: pull data with real progress, compare history, retrieve NASA evidence, explain.
  const gw = new ToolGateway(deps.db, { crewId: env.crewId, asOf, allowed: protocol.allowedTools });
  const step = progressReporter(deps.onProgress, 6);
  const vitals = await step('Checking current telemetry', () => gw.vitalsNow());
  const [sleep, mood] = await step('Reviewing sleep and check-ins', () => Promise.all([gw.recentSleep(3), gw.recentMood(1)]));
  const mission = await step('Reading mission context', () => gw.missionContext());
  const eventSymptoms = (parse(event?.symptoms) as unknown as { body_system: string }[]) ?? [];
  const bodySystem = interp.symptoms[0]?.body_system ?? (Array.isArray(eventSymptoms) ? eventSymptoms[0]?.body_system : undefined) ?? protocol.appliesTo.bodySystems[0] ?? null;
  const domain = protocol.appliesTo.domains[0];
  const candidates = await step('Comparing similar events', () => gw.similarEpisodes({ bodySystem, domain, missionContext: mission.context }));
  // "Similar" means the same body system. Sharing only the context (e.g. "after exercise")
  // with an unrelated complaint is not a pattern, and must not be presented as one.
  const episodes = bodySystem ? candidates.filter((e) => e.matched_on.includes('body_system')) : candidates;
  const pattern = analysePattern({ episodes, mission, sleep, mood });
  const tags = protocol.knowledgeTags.length ? protocol.knowledgeTags : [bodySystem ?? 'other'];
  const storedSymptoms = Array.isArray(eventSymptoms) ? (eventSymptoms as { category?: string }[]) : [];
  const categories = [...new Set([...interp.symptoms, ...storedSymptoms].map((x) => (x.category ?? '').replace(/_/g, ' ')).filter(Boolean))];
  const queryText = [values.description, ...categories].join(' · ');
  const knowledge = await step('Finding relevant NASA evidence', () => gw.knowledge(tags, 2, { text: queryText, embed: deps.embed }).catch(() => []));
  const evidence = buildEvidence({ vitals, sleep, mood, mission, pattern, knowledge, protocol });

  const answersSummary = Object.entries(values).filter(([k]) => k !== 'description').map(([k, v]) => `${k}: ${v}`).join(' | ') || undefined;
  const ex = await step('Writing the assessment', () =>
    explain(deps.llm, { model: deps.respondModel ?? deps.model, utterance: values.description, stage: 'guidance', evidence, answersSummary }));

  const steps = [...(GUIDANCE[protocol.id] ?? []), ...(protocol.recheckMinutes ? [recheckLine(protocol.recheckMinutes)] : [])];
  const assessment = buildAssessment({ protocol, evidence, explanation: ex, vitals, sleep, knowledge, steps, clarity: newState.clarity ?? 'clear', asOf, values });
  const replyText = [ex.text, ...steps].join(' ');
  const eventId = await persist(deps.db, {
    event, env, u, asOf, status: 'awaiting_followup', protocol, mission, sleep, mood,
    outcome: 'monitoring', summary: ex.text, replyText, toolCalls: gw.calls, state: newState, explanation: ex,
    recheckDueAt: protocol.recheckMinutes ? new Date(Date.parse(asOf) + protocol.recheckMinutes * 60_000).toISOString() : undefined,
  });

  return {
    ...base, eventId, eventStatus: 'awaiting_followup', action: 'protocol', stage: 'assess', protocol: protoOut,
    explanation: ex.text, explanationSource: ex.source, explanationIssues: ex.violationsSeen,
    steps, recheckMinutes: protocol.recheckMinutes ?? undefined, assessment,
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
  return p ? { id: p.id, code: p.code, title: p.title, version: p.version, status: p.status } : null;
}

function parse(v: unknown): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
  return v as Record<string, unknown>;
}

export { PROTOCOLS };

/** An escalation stays active for this long unless the crew closes the event. */
const ESCALATION_ACTIVE_MS = 2 * 3600_000;

async function activeEscalation(db: PipelineDeps['db'], asOf: string, eventId?: string | null) {
  if (!eventId) return null;
  const r = await db.getById<Record<string, unknown>>('health_events', eventId).catch(() => null);
  const fresh = !!r && r.status === 'escalated' && new Date(String(r.closed_at ?? r.opened_at)).getTime() > Date.parse(asOf) - ESCALATION_ACTIVE_MS;
  return fresh ? r : null;
}
