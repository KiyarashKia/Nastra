import type { Interpretation } from './interpret/schema';
import type { SafetyScreen } from './safety/redflags';
import { PROTOCOLS, selectProtocol, type FollowUpQuestion, type Protocol } from './protocols/registry';
import { maxUrgency, type Urgency } from './types';

/** What code decided to do. The model only writes the words for it. */
export type Action =
  | { kind: 'escalate'; reasons: string[]; trigger: EscalationTrigger }
  | { kind: 'clarify'; reason: string }
  | {
      kind: 'protocol';
      protocolId: string;
      askNow: FollowUpQuestion[];
      showImmediateStep: boolean;
      readyForGuidance: boolean;
    }
  | { kind: 'answer_data'; target: string | null }
  | { kind: 'log'; needsConfirmation: true }
  | { kind: 'redirect' };

/** Why code escalated, in a form the flight-surgeon brief can explain precisely. */
export type EscalationTrigger =
  | { kind: 'safety_screen'; hits: { id: string; label: string; match: string }[] }
  | { kind: 'red_flag_answer'; questionId: string; questionText: string }
  | { kind: 'unanswered_check'; prompts: number }
  | { kind: 'unclear_message' }
  | { kind: 'model_flag' };

export interface EventState {
  protocolId: string | null;
  /** Questions already asked in this event, with any answers received. */
  asked: { id: string; answer: 'yes' | 'no' | 'unclear' | null }[];
  knownInfo: string[];
  turn: number;
  /** Highest urgency reached in this event. Urgency inside an event never goes down. */
  urgency?: Urgency;
  /** How many times the warning-signs question has been shown without a clear answer. */
  redFlagPrompts?: number;
}

/** The warning-signs question can go unanswered this many times before code escalates. */
export const MAX_UNANSWERED_RED_FLAG_PROMPTS = 2;

export interface RouteResult {
  action: Action;
  urgency: Urgency;
  protocol: Protocol | null;
  /** Human-readable trail for the audit log and the evidence panel. */
  trace: string[];
}

export function route(screen: SafetyScreen, interp: Interpretation, state?: EventState): RouteResult {
  const trace: string[] = [];

  // 1. Deterministic red flags in the text. Nothing overrides this.
  if (screen.critical) {
    trace.push(`safety screen: ${screen.hits.map((h) => h.id).join(', ')}`);
    return { action: { kind: 'escalate', reasons: screen.hits.map((h) => h.label), trigger: { kind: 'safety_screen', hits: screen.hits } }, urgency: 'warning', protocol: null, trace };
  }

  // 2. Inside an open event: a "yes" to any red-flag question escalates.
  const protocolFromState = state?.protocolId ? selectById(state.protocolId) : null;
  if (protocolFromState) {
    const redFlagIds = new Set(protocolFromState.mandatoryQuestions.filter((q) => q.redFlag).map((q) => q.id));
    const yes = interp.followup_answers.filter((a) => redFlagIds.has(a.question_id) && a.answer === 'yes');
    if (yes.length) {
      trace.push(`red-flag follow-up answered yes: ${yes.map((a) => a.question_id).join(', ')}`);
      // Model notes are kept in the audit trail, never shown as the reason.
      for (const a of yes) if (a.detail) trace.push(`model note (not shown): ${a.detail}`);
      return {
        action: {
          kind: 'escalate', reasons: ['You answered yes to the warning-signs check'],
          trigger: { kind: 'red_flag_answer', questionId: yes[0].question_id, questionText: protocolFromState.mandatoryQuestions.find((q) => q.id === yes[0].question_id)?.text ?? yes[0].question_id },
        },
        urgency: 'warning', protocol: protocolFromState, trace,
      };
    }
  }

  // 2b. Warning-signs check still open, and the crew member is not answering it.
  //     A person who is getting worse may stop making sense. Silence or confusion
  //     on a safety question is treated as a reason to escalate, not to ask again.
  if (protocolFromState && state) {
    const rf = protocolFromState.mandatoryQuestions.filter((q) => q.redFlag);
    const answeredNow = new Map(interp.followup_answers.map((a) => [a.question_id, a.answer]));
    const stillOpen = rf.some((q) => {
      const a = answeredNow.get(q.id) ?? state.asked.find((x) => x.id === q.id)?.answer;
      return a !== 'no';
    });
    if (stillOpen && interp.confidence === 'low') {
      trace.push('warning-signs check open + unclear message');
      return {
        action: { kind: 'escalate', reasons: ['No clear answer to the warning-signs check, and your last message was unclear'], trigger: { kind: 'unclear_message' } },
        urgency: 'warning', protocol: protocolFromState, trace,
      };
    }
    if (stillOpen && (state.redFlagPrompts ?? 0) >= MAX_UNANSWERED_RED_FLAG_PROMPTS) {
      trace.push(`warning-signs check unanswered after ${state.redFlagPrompts} prompts`);
      return {
        action: { kind: 'escalate', reasons: [`The warning-signs check went unanswered ${state.redFlagPrompts} times`], trigger: { kind: 'unanswered_check', prompts: state.redFlagPrompts ?? 0 } },
        urgency: 'warning', protocol: protocolFromState, trace,
      };
    }
  }

  // 3. The model may raise urgency to warning; code then escalates.
  if (interp.urgency_hint === 'warning') {
    trace.push('model urgency_hint = warning');
    return { action: { kind: 'escalate', reasons: ['Model flagged the message as a possible emergency'], trigger: { kind: 'model_flag' } }, urgency: 'warning', protocol: null, trace };
  }

  // 4. Continue an open protocol event.
  if (protocolFromState && state) {
    return continueProtocol(protocolFromState, interp, state, trace);
  }

  // 5. Not sure what this is → ask, don't guess.
  if (interp.confidence === 'low') {
    trace.push('low confidence');
    return { action: { kind: 'clarify', reason: 'Message is ambiguous' }, urgency: maxUrgency(interp.urgency_hint), protocol: null, trace };
  }

  // 6. Non-symptom paths.
  if (interp.speech_act === 'log' && interp.log_entries.length > 0) {
    trace.push('speech_act = log → confirm before writing');
    return { action: { kind: 'log', needsConfirmation: true }, urgency: 'nominal', protocol: null, trace };
  }
  if (interp.domain === 'health_data') {
    trace.push(`health_data → ${interp.request_target ?? 'unspecified'}`);
    return { action: { kind: 'answer_data', target: interp.request_target }, urgency: 'nominal', protocol: null, trace };
  }
  if (interp.domain === 'out_of_scope') {
    trace.push('out_of_scope');
    return { action: { kind: 'redirect' }, urgency: 'nominal', protocol: null, trace };
  }

  // 7. Symptom or psychological report → protocol.
  const protocol = selectProtocol(interp.domain, interp.symptoms.map((s) => s.body_system));
  if (!protocol) {
    trace.push('no protocol matched');
    return { action: { kind: 'clarify', reason: 'No matching protocol' }, urgency: maxUrgency(interp.urgency_hint), protocol: null, trace };
  }
  trace.push(`protocol: ${protocol.id} v${protocol.version}`);
  return {
    action: {
      kind: 'protocol',
      protocolId: protocol.id,
      askNow: protocol.mandatoryQuestions,
      showImmediateStep: protocol.immediateStep !== null,
      readyForGuidance: false,
    },
    urgency: maxUrgency(protocol.baseUrgency, interp.urgency_hint),
    protocol,
    trace,
  };
}

function continueProtocol(protocol: Protocol, interp: Interpretation, state: EventState, trace: string[]): RouteResult {
  const answered = new Map(state.asked.map((a) => [a.id, a.answer]));
  for (const a of interp.followup_answers) answered.set(a.question_id, a.answer);

  const known = new Set(state.knownInfo);
  for (const q of protocol.mandatoryQuestions) {
    const ans = answered.get(q.id);
    if (ans && ans !== 'unclear') q.fills?.forEach((f) => known.add(f));
  }
  if (interp.onset) known.add('onset');
  if (interp.duration) known.add('duration');
  if (interp.severity) known.add('severity');
  if (interp.activity_context) known.add('current_activity');

  // Red-flag questions must be answered clearly before anything else.
  const askNow = protocol.mandatoryQuestions.filter((q) => {
    const ans = answered.get(q.id);
    if (q.redFlag) return ans === undefined || ans === null || ans === 'unclear';
    return !(q.fills ?? []).every((f) => known.has(f)) && (ans === undefined || ans === null);
  });
  const missingRequired = protocol.requiredInfo.filter((r) => !known.has(r));
  const redFlagsCleared = protocol.mandatoryQuestions.filter((q) => q.redFlag).every((q) => answered.get(q.id) === 'no');
  const ready = redFlagsCleared && missingRequired.length === 0;

  trace.push(`protocol: ${protocol.id} turn ${state.turn + 1}; red flags cleared: ${redFlagsCleared}; missing: ${missingRequired.join(', ') || 'none'}`);
  return {
    action: { kind: 'protocol', protocolId: protocol.id, askNow, showImmediateStep: false, readyForGuidance: ready },
    urgency: maxUrgency(state.urgency, protocol.baseUrgency, interp.urgency_hint),
    protocol,
    trace,
  };
}

function selectById(id: string): Protocol | null {
  return PROTOCOLS[id] ?? null;
}
