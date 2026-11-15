import { z } from 'zod';
import {
  BODY_SYSTEMS, CONFIDENCE, DOMAINS, LOG_FIELDS, MISSING_INFO, REQUEST_TARGETS, SPEECH_ACTS, URGENCY,
} from '../types';

export const SymptomSchema = z.object({
  said: z.string().describe("The crew member's own words for the symptom"),
  category: z.string().describe('Plain-language symptom category, e.g. "disorientation". Never a diagnosis.'),
  body_system: z.enum(BODY_SYSTEMS),
});

export const FollowupAnswerSchema = z.object({
  question_id: z.string(),
  answer: z.enum(['yes', 'no', 'unclear']),
  detail: z.string().nullable(),
});

export const LogEntrySchema = z.object({
  field: z.enum(LOG_FIELDS),
  value: z.string(),
});

/**
 * The structured meaning of ONE crew message. Produced by model call 1.
 * Every field is required (nullable where it may be unknown) so the schema
 * works with strict structured outputs.
 */
export const InterpretationSchema = z.object({
  speech_act: z.enum(SPEECH_ACTS),
  domain: z.enum(DOMAINS),
  secondary_domain: z.enum(DOMAINS).nullable(),
  symptoms: z.array(SymptomSchema),
  onset: z.string().nullable(),
  duration: z.string().nullable(),
  severity: z.string().nullable(),
  activity_context: z.string().nullable(),
  log_entries: z.array(LogEntrySchema),
  request_target: z.enum(REQUEST_TARGETS).nullable(),
  followup_answers: z.array(FollowupAnswerSchema),
  urgency_hint: z.enum(URGENCY),
  confidence: z.enum(CONFIDENCE),
  missing_info: z.array(z.enum(MISSING_INFO)),
});

export type Interpretation = z.infer<typeof InterpretationSchema>;
export type FollowupAnswer = z.infer<typeof FollowupAnswerSchema>;

/** JSON Schema for OpenRouter `response_format: json_schema` (strict). */
export function interpretationJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(InterpretationSchema, { target: 'draft-7' }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/** Used when the model fails twice. Low confidence → the router asks a clarifying question. */
export function fallbackInterpretation(): Interpretation {
  return {
    speech_act: 'report',
    domain: 'out_of_scope',
    secondary_domain: null,
    symptoms: [],
    onset: null,
    duration: null,
    severity: null,
    activity_context: null,
    log_entries: [],
    request_target: null,
    followup_answers: [],
    urgency_hint: 'nominal',
    confidence: 'low',
    missing_info: [],
  };
}
