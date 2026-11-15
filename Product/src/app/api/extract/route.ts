import { getDeps } from '@/server/deps';
import { json, safe } from '@/server/http';
import { normalizePhotoReading } from '@/nastra/vision/photo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reads one photo the crew attached. The model only reports what is visible:
 *  - device screen → transcribes values (crew confirms or edits each one),
 *  - person (face, skin, eyes, an injury) → neutral visible observations, never a diagnosis,
 *  - anything else → a one-line description.
 * Code then validates: observations that name a condition or a cause are dropped. Nothing is used
 * until the crew member confirms it, and the photo itself is never stored.
 */
const SYSTEM = `You look at ONE photo a crew member attached to a health conversation on a spacecraft. Return JSON only:
{"kind":"device"|"person"|"other","source":string,"fields":[{"label":string,"value":string,"unit":string|null,"note":string|null}],"observations":[{"text":string,"region":string|null,"clarity":"clear"|"unclear"}],"appears_unremarkable":boolean|null,"quality":string|null,"description":string|null}
kind=device: a medical or wellness device screen. Fill "fields" with values that are clearly legible; note "unclear" if cut off. Never infer values.
kind=person: a face, eyes, skin, hand or body part. Fill "observations" with what is VISIBLE, in plain neutral words: colour (pale, flushed, red, bluish, yellowish), swelling, puffiness, redness of the eyes, uneven pupils, drooping on one side, sweating, cuts, bruises, rash. Max 6, each under 15 words, with the region (e.g. "left eye"). If nothing looks out of the ordinary, return no observations and "appears_unremarkable": true.
NEVER name a disease, condition or cause, never say what it "suggests" or "indicates", never guess emotion, identity, age or sex.
kind=other: anything else. "description": under 20 words.
"quality": note if the photo is blurry, dark, partial or too far, else null. "source": short name of what is shown.`;

export function POST(req: Request) {
  return safe(async () => {
    const { image, name } = (await req.json()) as { image?: string; name?: string };
    if (!image?.startsWith('data:image/')) return json({ error: 'image required' }, 400);
    if (image.length > 8_000_000) return json({ error: 'image too large (max about 6 MB)' }, 413);
    const deps = await getDeps();
    if (deps.llmKind === 'stub') return json({ kind: 'other', source: name ?? 'image', fields: [], observations: [], unremarkable: null, quality: null, description: 'Offline stub: images are not read in this mode.', rejected: 0 });
    const base = (process.env.NASTRA_LLM_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}` },
      body: JSON.stringify({
        model: deps.model, temperature: 0, max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: [{ type: 'text', text: 'What does this photo show?' }, { type: 'image_url', image_url: { url: image } }] },
        ],
      }),
    });
    if (!res.ok) return json({ error: `vision model HTTP ${res.status}` }, 502);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let parsed: unknown = {};
    try { parsed = JSON.parse((body.choices?.[0]?.message?.content ?? '{}').replace(/^```(json)?|```$/g, '')); } catch { /* unreadable → empty */ }
    return json(normalizePhotoReading(parsed, name));
  });
}
