import { interpret, type InterpretResult } from './interpret/interpret';
import type { LlmClient } from './llm/provider';
import { PROTOCOLS } from './protocols/registry';
import { route, type EventState, type RouteResult } from './router';
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
