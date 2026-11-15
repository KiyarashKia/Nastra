// NASTRA shared vocabulary. Keep in sync with the CHECK constraints in
// supabase/migrations/20261114000001_schema.sql.

export const SPEECH_ACTS = ['report', 'question', 'log', 'request'] as const;
export const DOMAINS = ['physical_symptom', 'psychological', 'health_data', 'out_of_scope'] as const;
export const URGENCY = ['nominal', 'advisory', 'caution', 'warning'] as const;
export const CONFIDENCE = ['high', 'medium', 'low'] as const;
export const MISSION_CONTEXTS = [
  'habitat', 'exercise', 'post_exercise', 'pre_eva', 'eva', 'post_eva', 'sleep', 'other',
] as const;

// Body systems follow NASA HRP's risk taxonomy (indirect source:
// https://www.nasa.gov/hrp/risks/). They are categories, never diagnoses.
export const BODY_SYSTEMS = [
  'sensorimotor_vestibular', // Risk of Altered Sensorimotor and Vestibular Function
  'cardiovascular',          // Risk of Cardiovascular Adaptations
  'behavioral_health',       // Risk of Behavioral Changes and Psychiatric Disorders
  'sleep',                   // Risk from Inadequate Sleep and Irregular Schedules
  'musculoskeletal',         // Risk of Reduced Cardiorespiratory and Musculoskeletal Fitness / bone
  'neuro_ocular',            // Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS)
  'respiratory',
  'gastrointestinal',
  'immune',
  'skin',
  'other',
] as const;

export const MISSING_INFO = [
  'onset', 'duration', 'severity', 'associated_symptoms', 'current_activity', 'trigger', 'location',
] as const;

export const LOG_FIELDS = ['sleep_hours', 'sleep_quality', 'mood', 'stress', 'fatigue', 'note'] as const;

export const REQUEST_TARGETS = [
  'vitals_now', 'sleep_trend', 'mood_trend', 'stress_trend', 'heart_rate_trend',
  'past_events', 'schedule', 'other',
] as const;

export type SpeechAct = (typeof SPEECH_ACTS)[number];
export type Domain = (typeof DOMAINS)[number];
export type Urgency = (typeof URGENCY)[number];
export type Confidence = (typeof CONFIDENCE)[number];
export type MissionContext = (typeof MISSION_CONTEXTS)[number];
export type BodySystem = (typeof BODY_SYSTEMS)[number];
export type MissingInfo = (typeof MISSING_INFO)[number];

export const URGENCY_RANK: Record<Urgency, number> = { nominal: 0, advisory: 1, caution: 2, warning: 3 };

/** Highest urgency wins. Used everywhere urgency is combined: it can only go up. */
export function maxUrgency(...levels: (Urgency | null | undefined)[]): Urgency {
  return levels.reduce<Urgency>(
    (acc, u) => (u && URGENCY_RANK[u] > URGENCY_RANK[acc] ? u : acc),
    'nominal',
  );
}

export type AttachmentKind = 'image' | 'pdf' | 'markdown' | 'text';

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  /** Extracted text (md/pdf/text) or, for images, values the vision model read. */
  text?: string;
  /** Values read from an image stay unconfirmed until the crew member confirms them. */
  confirmed: boolean;
}

/** The output of normalization. `utterance` is the ONLY instruction. */
export interface InputEnvelope {
  crewId: string;
  ts: string;
  client: 'station' | 'eva';
  utterance: string;
  attachments: Attachment[];
  /** Present when this message answers follow-ups inside an open health event. */
  eventId?: string;
}

export interface SourceRef {
  org: 'NASA' | 'CSA';
  name: string;
  url: string;
  use: 'direct' | 'indirect';
}
