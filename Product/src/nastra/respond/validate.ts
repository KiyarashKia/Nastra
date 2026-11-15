/**
 * Output validation for the model's explanation. Deterministic.
 * Anything that fails here is regenerated once, then replaced by a
 * fact-only fallback. Rules come from CLAUDE.md hard safety boundaries:
 * never diagnose, never infer causation, never downgrade a concern.
 */
export interface ValidationResult {
  ok: boolean;
  violations: string[];
  cited: string[];
}

const RULES: { id: string; re: RegExp; why: string }[] = [
  { id: 'diagnosis', re: /\b(diagnos\w*|vertigo|labyrinthitis|bppv|stroke|heart attack|arrhythmia|concussion|syndrome|disorder|disease|infection|hypotension|hypertension|tachycardia|anxiety disorder|depression)\b/i, why: 'names a condition or diagnosis' },
  { id: 'you_have', re: /\byou (have|are having|'re having|are suffering|suffer)\b/i, why: 'tells them what they have' },
  { id: 'causation', re: /\b(caused by|is due to|are due to|because of (your|the)|the cause|results? from|is from your|leads? to)\b/i, why: 'claims a cause' },
  { id: 'false_reassurance', re: /\b(nothing to worry|no need to worry|you('| a)re (fine|okay|ok)|it'?s (just|only|probably nothing)|nothing serious|perfectly normal|don'?t worry)\b/i, why: 'reassures / downplays' },
  { id: 'skip_reporting', re: /\b(no need to (tell|report|contact)|don'?t (tell|report|bother))\b/i, why: 'discourages reporting' },
  { id: 'medication', re: /\b(\d+\s?mg|dose|dosage|medication|ibuprofen|acetaminophen|paracetamol|aspirin|meclizine|promethazine|scopolamine|take (a|an|some) (pill|tablet))\b/i, why: 'gives medication advice' },
  { id: 'question', re: /\?/, why: 'asks a question (code adds questions)' },
];

const MAX_WORDS = 110;

const HISTORY_CLAIM = /\b(happened|occurred|seen|had this) (before|previously)\b|\bpreviously\b|\bsimilar (episode|time|event)s?\b|\b(this|the same|a) pattern\b|\bhas (happened|occurred)\b/i;

export function validateExplanation(
  text: string,
  evidenceIds: string[],
  sourceNames: string[] = [],
  opts: { hasPattern?: boolean } = {},
): ValidationResult {
  const violations: string[] = [];
  // Talking about past episodes is only allowed when code found one and put it in the evidence.
  if (opts.hasPattern === false && HISTORY_CLAIM.test(text)) violations.push('unsupported_history: mentions past episodes, but none were found');
  // Naming a cited NASA source ("Risk of Behavioral Conditions and Psychiatric Disorders") is not a diagnosis.
  let checkable = text;
  for (const n of sourceNames) checkable = checkable.split(n).join(' ');
  checkable = checkable.replace(/HRP\s*[—-]\s*Risk[^.\[]*/gi, ' ');
  for (const r of RULES) if (r.re.test(checkable)) violations.push(`${r.id}: ${r.why}`);

  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) violations.push(`length: ${words} words (max ${MAX_WORDS})`);

  const cited = [...new Set([...text.matchAll(/\[(E\d+)\]/g)].map((m) => m[1]))];
  const unknown = cited.filter((c) => !evidenceIds.includes(c));
  if (unknown.length) violations.push(`unknown citation: ${unknown.join(', ')}`);
  if (evidenceIds.length && cited.length === 0) violations.push('no citations');

  // Any sentence with a number must carry a citation.
  for (const sentence of text.split(/(?<=[.!])\s+/)) {
    if (/\d/.test(sentence.replace(/\[E\d+\]/g, '')) && !/\[E\d+\]/.test(sentence)) {
      violations.push(`uncited number: "${sentence.slice(0, 60)}"`);
      break;
    }
  }
  return { ok: violations.length === 0, violations, cited };
}
