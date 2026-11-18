import type { Attachment, InputEnvelope } from './types';

const MAX_UTTERANCE = 2000;
const MAX_ATTACHMENT_TEXT = 20_000;

export interface RawInput {
  crewId: string;
  client?: 'station' | 'eva';
  /** Exactly what the crew member typed (or what speech-to-text produced). */
  text: string;
  attachments?: Omit<Attachment, 'confirmed'>[] & { confirmed?: boolean }[];
  eventId?: string;
  ts?: string;
  answers?: Record<string, string>;
  confirm?: boolean;
}

/**
 * Step 1 of the flow. No AI.
 * The interface already knows what was typed vs. attached, so the separation
 * happens here in code: typed text = instruction, attachments = evidence.
 * A PDF that says "ignore the protocol" stays evidence.
 */
export function normalizeInput(raw: RawInput): InputEnvelope {
  const utterance = clean(raw.text).slice(0, MAX_UTTERANCE);
  if (!raw.crewId) throw new Error('normalizeInput: crewId is required');

  const attachments: Attachment[] = (raw.attachments ?? []).map((a, i) => ({
    id: a.id ?? `att_${i + 1}`,
    kind: a.kind,
    name: a.name,
    text: a.text ? clean(a.text).slice(0, MAX_ATTACHMENT_TEXT) : undefined,
    // Image-derived values are never trusted until confirmed.
    confirmed: a.kind === 'image' ? Boolean((a as { confirmed?: boolean }).confirmed) : true,
  }));

  return {
    crewId: raw.crewId,
    ts: raw.ts ?? new Date().toISOString(),
    client: raw.client ?? 'station',
    utterance,
    attachments,
    eventId: raw.eventId,
    answers: raw.answers && Object.keys(raw.answers).length ? { ...raw.answers } : undefined,
    confirm: raw.confirm === true ? true : undefined,
  };
}

function clean(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // control chars
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
