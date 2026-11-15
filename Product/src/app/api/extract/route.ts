import { getDeps } from '@/server/deps';
import { json, safe } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reads values off a photo of a device screen. The model only transcribes what is
 * visible; the crew member confirms or edits every value before anything is used.
 * Unreadable values are omitted, never guessed.
 */
export function POST(req: Request) {
  return safe(async () => {
    const { image, name } = (await req.json()) as { image?: string; name?: string };
    if (!image?.startsWith('data:image/')) return json({ error: 'image required' }, 400);
    if (image.length > 8_000_000) return json({ error: 'image too large (max about 6 MB)' }, 413);
    const deps = await getDeps();
    if (deps.llmKind === 'stub') return json({ source: name ?? 'image', fields: [] });
    const base = (process.env.NASTRA_LLM_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}` },
      body: JSON.stringify({
        model: deps.model, temperature: 0, max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You transcribe numbers shown on a medical or wellness device screen. Return JSON {"source": string, "fields": [{"label": string, "value": string, "unit": string|null, "note": string|null}]}. "source" names the device if visible, else "device screen". Include only values clearly legible. If a value is cut off or ambiguous, include it with note "unclear". Never infer, estimate or add values. Do not interpret or comment on health.' },
          { role: 'user', content: [{ type: 'text', text: 'Transcribe the readings on this screen.' }, { type: 'image_url', image_url: { url: image } }] },
        ],
      }),
    });
    if (!res.ok) return json({ error: `vision model HTTP ${res.status}` }, 502);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let parsed: { source?: string; fields?: { label?: string; value?: string; unit?: string | null; note?: string | null }[] } = {};
    try { parsed = JSON.parse(body.choices?.[0]?.message?.content ?? '{}'); } catch { /* unreadable → empty */ }
    const fields = (parsed.fields ?? [])
      .filter((f) => f.label && f.value)
      .slice(0, 12)
      .map((f, i) => ({ id: `f${i}`, label: String(f.label), value: String(f.value), unit: f.unit ?? undefined, note: f.note ?? undefined }));
    return json({ source: parsed.source || name || 'device screen', fields });
  });
}
