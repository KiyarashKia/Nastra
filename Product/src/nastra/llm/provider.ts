/**
 * One OpenAI-compatible provider. OpenRouter for the demo; switch to a local
 * model (Ollama: http://localhost:11434/v1) by changing NASTRA_LLM_BASE_URL and
 * the model id. Nothing else changes. That is the "onboard" story.
 */
/** Chosen 2026-11-14 after the first eval run (26/28, ~1.1 s median). */
export const DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatJsonRequest {
  model: string;
  messages: ChatMessage[];
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
}

export interface ChatJsonResult {
  content: string;
  latencyMs: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  usedSchemaMode: 'json_schema' | 'json_object';
}

export interface LlmClient {
  chatJson(req: ChatJsonRequest): Promise<ChatJsonResult>;
}

export function createOpenAICompatibleClient(opts?: {
  baseUrl?: string;
  apiKey?: string;
  disableReasoning?: boolean;
}): LlmClient {
  const baseUrl = (opts?.baseUrl ?? process.env.NASTRA_LLM_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const apiKey = opts?.apiKey ?? process.env.OPENROUTER_API_KEY ?? '';
  const isOpenRouter = baseUrl.includes('openrouter.ai');
  const disableReasoning = opts?.disableReasoning ?? process.env.NASTRA_REASONING !== 'on';

  async function call(req: ChatJsonRequest, mode: 'json_schema' | 'json_object'): Promise<ChatJsonResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);
    const started = Date.now();
    try {
      const body: Record<string, unknown> = {
        model: req.model,
        messages: req.messages,
        temperature: req.temperature ?? 0,
        max_tokens: req.maxTokens ?? 800,
        response_format:
          mode === 'json_schema'
            ? { type: 'json_schema', json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema } }
            : { type: 'json_object' },
      };
      if (isOpenRouter) {
        // Only route to providers that honour the response format.
        body.provider = { require_parameters: mode === 'json_schema' };
        if (disableReasoning) body.reasoning = { enabled: false };
      }
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          ...(isOpenRouter ? { 'HTTP-Referer': 'https://github.com/KiyarashKia/Nastra', 'X-Title': 'NASTRA' } : {}),
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) throw new LlmHttpError(res.status, text.slice(0, 500));
      const json = JSON.parse(text);
      const content: string = json?.choices?.[0]?.message?.content ?? '';
      if (!content) throw new Error(`Empty model response: ${text.slice(0, 300)}`);
      return { content, latencyMs: Date.now() - started, usage: json.usage, usedSchemaMode: mode };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async chatJson(req) {
      try {
        return await call(req, 'json_schema');
      } catch (err) {
        // Some providers reject json_schema. Fall back to plain JSON mode;
        // our own zod validation still enforces the shape.
        if (err instanceof LlmHttpError && (err.status === 400 || err.status === 404)) {
          return await call(req, 'json_object');
        }
        throw err;
      }
    },
  };
}

export class LlmHttpError extends Error {
  constructor(public status: number, public body: string) {
    super(`LLM HTTP ${status}: ${body}`);
  }
}

/** Pull the first JSON object out of a reply (handles ```json fences and stray text). */
export function extractJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : content;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}
