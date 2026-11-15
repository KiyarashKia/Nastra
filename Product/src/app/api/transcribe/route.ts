import { json, safe } from '@/server/http';
import { STT_MODEL, transcribe } from '@/server/stt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Body: raw little-endian Float32 PCM, 16 kHz mono (max 60 s). Returns { text }. Runs locally. */
export function POST(req: Request) {
  return safe(async () => {
    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength % 4 !== 0) return json({ error: 'expected Float32 PCM' }, 400);
    if (buf.byteLength > 16000 * 4 * 60) return json({ error: 'recording longer than 60 s' }, 413);
    try {
      const text = await transcribe(new Float32Array(buf));
      return json({ text, model: STT_MODEL });
    } catch (err) {
      return json({ error: 'voice unavailable', detail: (err as Error).message }, 503);
    }
  });
}
