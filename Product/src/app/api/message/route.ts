import { getDeps, now } from '@/server/deps';
import { json } from '@/server/http';
import { handleMessage } from '@/nastra/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One crew message → NDJSON stream:
 *   {"type":"progress", step, of, label, state}   real assessment steps, as they happen
 *   {"type":"reply", reply}                        the NastraReply
 *   {"type":"error", message}
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { text?: string; eventId?: string; answers?: Record<string, string>; confirm?: boolean } | null;
  if (!body || typeof body.text !== 'string' || !body.text.trim()) return json({ error: 'text is required' }, 400);
  const deps = await getDeps();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
      try {
        const reply = await handleMessage(
          { crewId: deps.crewId, text: body.text!, eventId: body.eventId, answers: body.answers, confirm: body.confirm },
          { db: deps.db, llm: deps.llm, model: deps.model, respondModel: deps.respondModel, embed: deps.embed, asOf: now(), onProgress: (p) => send({ type: 'progress', ...p }) },
        );
        send({ type: 'reply', reply });
      } catch (err) {
        console.error('[nastra] message', err);
        send({ type: 'error', message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
