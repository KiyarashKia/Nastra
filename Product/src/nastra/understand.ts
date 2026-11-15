import { interpret, type InterpretResult } from './interpret/interpret';
import type { LlmClient } from './llm/provider';
import { PROTOCOLS } from './protocols/registry';
import { route, type EventState, type RouteResult } from './router';
import type { Interpretation } from './interpret/schema';
import { screenText, type SafetyScreen } from './safety/redflags';
import type { InputEnvelope } from './types';

export interface Understanding {
  screen: SafetyScreen;
  interpretation: InterpretResult | null;
  route: RouteResult;
}

/**
 * Normalize → independent safety check → interpret → route.
 * On a critical safety hit the model is never called: the emergency path
 * bypasses AI (see the NASTRA action flow diagram).
 */
export async function understand(
  env: InputEnvelope,
  llm: LlmClient,
  opts: { model: string; state?: EventState },
): Promise<Understanding> {
  const screen = screenText(env.utterance);

  if (screen.critical) {
    const r = route(screen, emptyInterp(), opts.state);
    return { screen, interpretation: null, route: r };
  }

  // Quick replies and read-back confirmation are structured input: resolved in code, no model call.
  const protocol = opts.state?.protocolId ? PROTOCOLS[opts.state.protocolId] : undefined;
  if (protocol && opts.state && (env.answers || env.confirm)) {
    const interp = interpretationFromAnswers(protocol, env.answers ?? {});
    return {
      screen,
      interpretation: { interpretation: interp, ok: true, attempts: 0, latencyMs: 0, errors: [] },
      route: route(screen, interp, opts.state, { confirm: env.confirm }),
    };
  }

  const openQuestions = opts.state?.protocolId
    ? (PROTOCOLS[opts.state.protocolId]?.mandatoryQuestions ?? []).filter((q) =>
        opts.state!.asked.some((a) => a.id === q.id && (a.answer === null || a.answer === 'unclear')),
      )
    : [];

  const interpretation = await interpret(env, llm, { model: opts.model, openQuestions });
  return { screen, interpretation, route: route(screen, interpretation.interpretation, opts.state) };
}

function emptyInterp() {
  return {
    speech_act: 'report' as const, domain: 'physical_symptom' as const, secondary_domain: null,
    symptoms: [], onset: null, duration: null, severity: null, activity_context: null,
    log_entries: [], request_target: null, followup_answers: [],
    urgency_hint: 'warning' as const, confidence: 'high' as const, missing_info: [],
  };
}

/** Chips → interpretation. Unknown question or option ids are ignored, never guessed. */
export function interpretationFromAnswers(protocol: (typeof PROTOCOLS)[string], answers: Record<string, string>): Interpretation {
  const interp: Interpretation = {
    speech_act: 'report', domain: protocol.appliesTo.domains[0], secondary_domain: null,
    symptoms: [], onset: null, duration: null, severity: null, activity_context: null,
    log_entries: [], request_target: null, followup_answers: [],
    urgency_hint: 'nominal', confidence: 'high', missing_info: [],
  };
  for (const [qid, oid] of Object.entries(answers)) {
    const q = protocol.mandatoryQuestions.find((x) => x.id === qid);
    const o = q?.options?.find((x) => x.id === oid);
    if (!q || !o) continue;
    interp.followup_answers.push({ question_id: q.id, answer: o.answer, detail: o.value ?? o.label });
    if (q.fills?.includes('onset')) interp.onset = o.value ?? o.label;
    if (q.fills?.includes('severity')) interp.severity = o.value ?? o.label;
    if (q.fills?.includes('current_activity')) interp.activity_context = o.value ?? o.label;
  }
  return interp;
}
