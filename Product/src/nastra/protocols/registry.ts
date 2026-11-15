import type { BodySystem, Domain, MissingInfo, SourceRef, Urgency } from '../types';

/**
 * NASTRA protocols — DEMO DRAFTS.
 * Written by the NASTRA team for the hackathon, grounded in NASA HRP risk pages
 * (cited below). They are not NASA operational procedures and must be reviewed
 * by a flight surgeon before any real use.
 *
 * Protocols live in code, not in the database or the prompt: versioned in git,
 * typed, and impossible for the model to change.
 */

export interface FollowUpQuestion {
  id: string;
  text: string;
  /** A "yes" to a red-flag question escalates immediately, in code. */
  redFlag: boolean;
  /** Which missing info this question fills, if any. */
  fills?: MissingInfo[];
}

export type ToolName =
  | 'telemetry.vitals_now'
  | 'health.recent_sleep'
  | 'health.recent_mood'
  | 'health.similar_episodes'
  | 'mission.current_context'
  | 'knowledge.search';

export interface Protocol {
  id: string;
  version: string;
  status: 'demo_draft';
  title: string;
  appliesTo: { domains: Domain[]; bodySystems: BodySystem[] };
  /** Asked on the first turn, every time. */
  mandatoryQuestions: FollowUpQuestion[];
  /** Info that must be known before NASTRA gives anything beyond the immediate step. */
  requiredInfo: MissingInfo[];
  /** Shown verbatim on the first turn. The model never rewrites it. */
  immediateStep: string | null;
  recheckMinutes: number | null;
  baseUrgency: Urgency;
  allowedTools: ToolName[];
  /** Knowledge retrieval is filtered to these tags before ranking. */
  knowledgeTags: string[];
  sources: SourceRef[];
}

const HRP_SENSORIMOTOR: SourceRef = {
  org: 'NASA', use: 'direct',
  name: 'HRP — Risk of Altered Sensorimotor and Vestibular Function',
  url: 'https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/',
};
const HRP_CARDIO: SourceRef = {
  org: 'NASA', use: 'direct',
  name: 'HRP — Risk of Cardiovascular Adaptations',
  url: 'https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/',
};
const HRP_BEHAVIORAL: SourceRef = {
  org: 'NASA', use: 'direct',
  name: 'HRP — Risk of Behavioral Changes and Psychiatric Disorders',
  url: 'https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/',
};
const HRP_SLEEP: SourceRef = {
  org: 'NASA', use: 'direct',
  name: 'HRP — Risk from Inadequate Sleep and Irregular Schedules',
  url: 'https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/',
};
const HRP_FITNESS: SourceRef = {
  org: 'NASA', use: 'direct',
  name: 'HRP — Risk of Reduced Cardiorespiratory and Musculoskeletal Fitness',
  url: 'https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/',
};
const STD_3001_SURVEILLANCE: SourceRef = {
  org: 'NASA', use: 'indirect',
  name: 'NASA-STD-3001 Technical Brief — Longitudinal Health Surveillance',
  url: 'https://www.nasa.gov/wp-content/uploads/2023/03/longitudinal-health-surveillance-technical-brief-ochmo.pdf',
};

const RED_FLAG_PHYSICAL: FollowUpQuestion = {
  id: 'q_red_flags',
  redFlag: true,
  text:
    'Any fainting or feeling like you might pass out, chest pain, trouble breathing, new weakness or numbness, ' +
    'trouble speaking, vision loss, or a sudden severe headache?',
};

export const PROTOCOLS: Record<string, Protocol> = {
  sensorimotor_disorientation: {
    id: 'sensorimotor_disorientation',
    version: '0.1.0',
    status: 'demo_draft',
    title: 'Disorientation / balance disturbance',
    appliesTo: { domains: ['physical_symptom'], bodySystems: ['sensorimotor_vestibular'] },
    mandatoryQuestions: [
      RED_FLAG_PHYSICAL,
      { id: 'q_onset', redFlag: false, fills: ['onset', 'duration'], text: 'When did it start, and is it constant or does it come and go?' },
      { id: 'q_task', redFlag: false, fills: ['current_activity'], text: 'Are you handling equipment or doing anything safety-critical right now?' },
    ],
    requiredInfo: ['onset', 'current_activity'],
    immediateStep: 'Pause what you are doing, hold on to a handrail or restraint, and keep your head still for now.',
    recheckMinutes: 20,
    baseUrgency: 'advisory',
    allowedTools: [
      'telemetry.vitals_now', 'health.recent_sleep', 'health.recent_mood',
      'health.similar_episodes', 'mission.current_context', 'knowledge.search',
    ],
    knowledgeTags: ['sensorimotor_vestibular', 'cardiovascular'],
    sources: [HRP_SENSORIMOTOR, HRP_CARDIO, HRP_FITNESS, STD_3001_SURVEILLANCE],
  },

  acute_stress: {
    id: 'acute_stress',
    version: '0.1.0',
    status: 'demo_draft',
    title: 'Acute stress / emotional strain',
    appliesTo: { domains: ['psychological'], bodySystems: ['behavioral_health', 'sleep'] },
    mandatoryQuestions: [
      {
        id: 'q_red_flags_psych',
        redFlag: true,
        text: 'Any chest pain, trouble breathing, feeling faint, or thoughts of harming yourself?',
      },
      { id: 'q_trigger', redFlag: false, fills: ['trigger'], text: 'Is this tied to something specific right now, like the briefing or the EVA?' },
      { id: 'q_task', redFlag: false, fills: ['current_activity'], text: 'Are you in the middle of a task, or can you take a few minutes?' },
    ],
    requiredInfo: ['current_activity'],
    immediateStep: 'If you can, take a few minutes somewhere quiet. I can guide you through a slow breathing exercise.',
    recheckMinutes: 10,
    baseUrgency: 'advisory',
    allowedTools: [
      'telemetry.vitals_now', 'health.recent_sleep', 'health.recent_mood',
      'health.similar_episodes', 'mission.current_context', 'knowledge.search',
    ],
    knowledgeTags: ['behavioral_health', 'sleep'],
    sources: [HRP_BEHAVIORAL, HRP_SLEEP, STD_3001_SURVEILLANCE],
  },

  general_physical: {
    id: 'general_physical',
    version: '0.1.0',
    status: 'demo_draft',
    title: 'General symptom check',
    appliesTo: { domains: ['physical_symptom'], bodySystems: [] },
    mandatoryQuestions: [
      RED_FLAG_PHYSICAL,
      { id: 'q_onset', redFlag: false, fills: ['onset', 'duration'], text: 'When did it start, and is it getting better, worse, or staying the same?' },
      { id: 'q_severity', redFlag: false, fills: ['severity'], text: 'On a scale of 1 to 10, how strong is it?' },
    ],
    requiredInfo: ['onset', 'severity'],
    immediateStep: null,
    recheckMinutes: 30,
    baseUrgency: 'advisory',
    allowedTools: [
      'telemetry.vitals_now', 'health.recent_sleep', 'health.recent_mood',
      'health.similar_episodes', 'mission.current_context', 'knowledge.search',
    ],
    knowledgeTags: [], // filled from the symptom's body system at runtime
    sources: [STD_3001_SURVEILLANCE],
  },
};

/** Deterministic protocol selection from the interpretation. */
export function selectProtocol(domain: Domain, bodySystems: BodySystem[]): Protocol | null {
  if (domain === 'physical_symptom') {
    if (bodySystems.includes('sensorimotor_vestibular')) return PROTOCOLS.sensorimotor_disorientation;
    return PROTOCOLS.general_physical;
  }
  if (domain === 'psychological') return PROTOCOLS.acute_stress;
  return null;
}
