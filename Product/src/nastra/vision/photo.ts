/**
 * Validates what the vision model said about a crew photo. The model only describes; code decides what
 * is allowed through. Observations that name a condition, a cause or an emotion are dropped (and counted),
 * so the crew is never shown a model diagnosis.
 */
export const DIAGNOSTIC = /\b(suggest\w*|indicat\w*|consistent with|diagnos\w*|sign of|symptom of|caused by|due to|likely|probabl\w*|infection|stroke|concussion|allerg\w*|jaundice|an(a)?emi\w*|hypox\w*|cyanos\w*|dehydrat\w*|fever|virus|viral|bacteri\w*|disease|disorder|syndrome|depress\w*|anxious|anxiety|sad|angry|exhausted)\b/i;

export type PhotoReading = {
  kind: 'device' | 'person' | 'other';
  source: string;
  fields: { id: string; label: string; value: string; unit?: string; note?: string }[];
  observations: { id: string; text: string; region: string | null; unclear: boolean }[];
  unremarkable: boolean | null;
  quality: string | null;
  description: string | null;
  rejected: number;
};

type Raw = {
  kind?: unknown; source?: unknown; description?: unknown; quality?: unknown; appears_unremarkable?: unknown;
  fields?: { label?: unknown; value?: unknown; unit?: unknown; note?: unknown }[];
  observations?: { text?: unknown; region?: unknown; clarity?: unknown }[];
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function normalizePhotoReading(input: unknown, name?: string): PhotoReading {
  const p = (input && typeof input === 'object' ? input : {}) as Raw;
  const kind = p.kind === 'device' || p.kind === 'person' ? p.kind : 'other';
  const fields = kind !== 'device' || !Array.isArray(p.fields) ? [] : p.fields
    .filter((f) => str(f?.label) && str(f?.value))
    .slice(0, 12)
    .map((f, i) => ({ id: `f${i}`, label: str(f.label)!, value: str(f.value)!, unit: str(f.unit) ?? undefined, note: str(f.note) ?? undefined }));
  const rawObs = kind !== 'person' || !Array.isArray(p.observations) ? [] : p.observations.filter((o) => str(o?.text));
  const kept = rawObs.filter((o) => !DIAGNOSTIC.test(str(o.text)!) && !DIAGNOSTIC.test(str(o.region) ?? ''));
  const observations = kept.slice(0, 6).map((o, i) => ({ id: `o${i}`, text: str(o.text)!.slice(0, 120), region: str(o.region), unclear: o.clarity === 'unclear' }));
  return {
    kind,
    source: str(p.source) ?? name ?? (kind === 'device' ? 'device screen' : 'photo'),
    fields,
    observations,
    // "Nothing stands out" only when the model said so AND nothing was dropped for wording.
    unremarkable: kind === 'person' ? observations.length === 0 && rawObs.length === 0 && p.appears_unremarkable !== false : null,
    quality: str(p.quality),
    description: kind === 'other' ? str(p.description) : null,
    rejected: rawObs.length - kept.length,
  };
}
