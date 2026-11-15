import { z } from 'zod';
import { extractJson, type LlmClient } from '../llm/provider';
import type { EvidenceItem } from '../evidence';
import { validateExplanation, type ValidationResult } from './validate';

/**
 * Model call 2. The model writes ONE thing: a short explanation of the
 * evidence. Code adds the immediate step, the questions and the guidance
 * verbatim around it, so mandatory protocol text can never be skipped,
 * rephrased or hallucinated.
 */
export const ExplanationSchema = z.object({
  explanation: z.string(),
  cited: z.array(z.string()),
});

export type Stage = 'first_turn' | 'followup' | 'guidance' | 'data_answer' | 'escalated';

export const RESPOND_SYSTEM_PROMPT = `You are NASTRA, an onboard health assistant for astronauts. You are speaking to a crew member.
Write a short explanation of what the evidence shows. Code will add any safety step, questions and next steps around your text, so do NOT include them.

RULES
- 2 to 4 sentences, at most 90 words. Calm, direct, plain language. Speak to the crew member as "you".
- Use ONLY the evidence items provided. Put the item id in square brackets after each fact, e.g. [E1].
- Describe patterns as associations ("this has happened before after exercise"), never as causes.
- Never diagnose or name a condition. Never say what caused it. Never say "you have…".
- Never reassure that it is fine or nothing to worry about. Never tell them to skip reporting.
- Never give medical instructions, medication or doses. Never ask questions.
- Say once, briefly, what the data cannot tell you.
Return JSON: {"explanation": "...", "cited": ["E1", ...]}`;

const STAGE_HINT: Record<Stage, string> = {
  first_turn: 'This is the first reply to their report. Acknowledge what they said in a few words, then summarise the most relevant evidence.',
  followup: 'They answered some follow-up questions. Briefly reflect what they told you, then any evidence that matters.',
  guidance: 'Safety questions are cleared. Explain what the evidence and their history suggest, as associations, before the next steps.',
  data_answer: 'They asked about their own data. Answer the question directly from the evidence.',
  escalated: 'An escalation is already active for this crew member (see <situation>); help is on the way and code shows its status separately. Reply directly and warmly to what they just said, using <conversation> so you never lose the thread. Do not repeat that an escalation is active or restate the alert status. Do not start a new symptom assessment. If they report something new, acknowledge it in their words and say you have added it to the open event. Evidence is optional here: cite it only when you state a measured fact.',
};

export interface ExplanationResult {
  text: string;
  cited: string[];
  source: 'model' | 'fallback';
  attempts: number;
  latencyMs: number;
  validation: ValidationResult;
  violationsSeen: string[];
}

export async function explain(
  llm: LlmClient,
  opts: { model: string; utterance: string; stage: Stage; evidence: EvidenceItem[]; answersSummary?: string; situation?: string; conversation?: string },
): Promise<ExplanationResult> {
  const ids = opts.evidence.map((e) => e.id);
  const evidenceText = opts.evidence.map((e) => `[${e.id}] (${e.kind}) ${e.title}: ${e.detail}`).join('\n');
  const user = [
    `<crew_message>${opts.utterance.replace(/<\/?[a-z_]+>/gi, '')}</crew_message>`,
    opts.answersSummary ? `<answers>${opts.answersSummary}</answers>` : '',
    opts.situation ? `<situation>${opts.situation}</situation>` : '',
    opts.conversation ? `<conversation>\n${opts.conversation.replace(/<\/?[a-z_]+>/gi, '')}\n</conversation>` : '',
    `<stage>${STAGE_HINT[opts.stage]}</stage>`,
    `<evidence>\n${evidenceText || '(no evidence available)'}\n</evidence>`,
  ].filter(Boolean).join('\n');

  const messages = [
    { role: 'system' as const, content: RESPOND_SYSTEM_PROMPT },
    { role: 'user' as const, content: user },
  ];
  const schema = z.toJSONSchema(ExplanationSchema, { target: 'draft-7' }) as Record<string, unknown>;
  delete schema.$schema;

  const violationsSeen: string[] = [];
  let latencyMs = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await llm.chatJson({ model: opts.model, messages, schemaName: 'explanation', jsonSchema: schema, temperature: 0.2, maxTokens: 400 });
      latencyMs += res.latencyMs;
      const parsed = ExplanationSchema.safeParse(extractJson(res.content));
      if (!parsed.success) {
        violationsSeen.push(`attempt ${attempt}: bad JSON shape`);
        messages.push({ role: 'user', content: 'Return only {"explanation": string, "cited": string[]}.' });
        continue;
      }
      const v = validateExplanation(parsed.data.explanation, ids, opts.evidence.map((e) => e.title), { hasPattern: opts.evidence.some((e) => e.kind === 'pattern') });
      if (v.ok) {
        return { text: parsed.data.explanation.trim(), cited: v.cited, source: 'model', attempts: attempt, latencyMs, validation: v, violationsSeen };
      }
      violationsSeen.push(...v.violations.map((x) => `attempt ${attempt}: ${x}`));
      messages.push(
        { role: 'assistant', content: res.content } as never,
        { role: 'user', content: `Rewrite. Problems: ${v.violations.join('; ')}. Follow every rule.` },
      );
    } catch (err) {
      violationsSeen.push(`attempt ${attempt}: ${(err as Error).message.slice(0, 200)}`);
    }
  }
  const text = fallbackExplanation(opts.evidence);
  return { text, cited: opts.evidence.slice(0, 3).map((e) => e.id), source: 'fallback', attempts: 2, latencyMs, validation: validateExplanation(text, ids, opts.evidence.map((e) => e.title)), violationsSeen };
}

/** Deterministic text when the model fails validation twice: short, cited, details stay in the evidence panel. */
export function fallbackExplanation(evidence: EvidenceItem[]): string {
  const facts = evidence.filter((e) => e.kind === 'observed' || e.kind === 'pattern').slice(0, 3);
  if (!facts.length) return 'I have your message logged. I do not have enough data to say more yet.';
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  return `Here is what I am looking at: ${facts.map((e) => `${lower(e.title)} [${e.id}]`).join('; ')}. The details are in the evidence panel.`;
}
