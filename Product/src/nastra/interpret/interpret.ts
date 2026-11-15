import type { InputEnvelope } from '../types';
import type { FollowUpQuestion } from '../protocols/registry';
import { extractJson, type ChatMessage, type LlmClient } from '../llm/provider';
import { buildInterpretUserMessage, INTERPRET_EXAMPLES, INTERPRET_SYSTEM_PROMPT } from './prompt';
import {
  fallbackInterpretation, interpretationJsonSchema, InterpretationSchema, type Interpretation,
} from './schema';

export interface InterpretResult {
  interpretation: Interpretation;
  ok: boolean;
  attempts: number;
  latencyMs: number;
  errors: string[];
  raw?: string;
}

/**
 * Model call 1: message → structured meaning.
 * Validated with zod. One retry with the validation error fed back.
 * If both attempts fail → low-confidence fallback (router asks a clarifying question).
 */
export async function interpret(
  env: InputEnvelope,
  llm: LlmClient,
  opts: { model: string; openQuestions?: FollowUpQuestion[] },
): Promise<InterpretResult> {
  const messages: ChatMessage[] = [{ role: 'system', content: INTERPRET_SYSTEM_PROMPT }];
  for (const ex of INTERPRET_EXAMPLES) {
    messages.push({ role: 'user', content: ex.user }, { role: 'assistant', content: ex.assistant });
  }
  messages.push({ role: 'user', content: buildInterpretUserMessage(env, opts.openQuestions) });

  const jsonSchema = interpretationJsonSchema();
  const errors: string[] = [];
  let latencyMs = 0;
  let raw: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await llm.chatJson({ model: opts.model, messages, schemaName: 'interpretation', jsonSchema });
      latencyMs += res.latencyMs;
      raw = res.content;
      const parsed = InterpretationSchema.safeParse(extractJson(res.content));
      if (parsed.success) {
        return { interpretation: sanitize(parsed.data, opts.openQuestions), ok: true, attempts: attempt, latencyMs, errors, raw };
      }
      const msg = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      errors.push(`attempt ${attempt}: schema: ${msg}`);
      messages.push(
        { role: 'assistant', content: res.content },
        { role: 'user', content: `That JSON did not match the schema (${msg}). Return only a corrected JSON object.` },
      );
    } catch (err) {
      errors.push(`attempt ${attempt}: ${(err as Error).message}`);
    }
  }
  return { interpretation: fallbackInterpretation(), ok: false, attempts: 2, latencyMs, errors, raw };
}

/** Code-side cleanup the model can't be trusted with. */
function sanitize(i: Interpretation, openQuestions?: FollowUpQuestion[]): Interpretation {
  const validIds = new Set((openQuestions ?? []).map((q) => q.id));
  const symptoms = i.symptoms.filter((sym) => {
    const cat = (sym.category ?? '').trim().toLowerCase();
    if (!cat || cat === 'null' || cat === 'none' || cat.includes('denial') || cat.startsWith('no_')) return false;
    return !/^(no|not|none|without|never)\b/i.test(sym.said.trim());
  });
  return {
    ...i,
    symptoms,
    // Only accept answers to questions we actually asked.
    followup_answers: i.followup_answers.filter((a) => validIds.has(a.question_id)),
    // Log entries only make sense for logs.
    log_entries: i.speech_act === 'log' ? i.log_entries : [],
    secondary_domain: i.secondary_domain === i.domain ? null : i.secondary_domain,
  };
}
