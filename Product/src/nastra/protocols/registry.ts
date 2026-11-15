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

/**
 * A quick-reply option. Tapping it answers the question in code, without the model.
 * `answer` is what the router sees; `value` is what fills the missing info
 * (e.g. onset "within the last hour").
 */
export interface AnswerOption {
  id: string;
  label: string;
  answer: 'yes' | 'no' | 'unclear';
  value?: string;
}

export interface FollowUpQuestion {
  id: string;
  text: string;
  /** Short label for chips in the Station UI ("How strong"). */
  short?: string;
  /** A "yes" to a red-flag question escalates immediately, in code. */
  redFlag: boolean;
  /** Which missing info this question fills, if any. */
  fills?: MissingInfo[];
  /** Quick replies. Free text always works too. */
  options?: AnswerOption[];
}

/** A step the protocol engine tracks. The model never adds or removes steps. */
export interface ProtocolStepDef {
  id: 'safety' | 'clarify' | 'confirm' | 'context' | 'history' | 'action' | 'recheck' | 'secure' | 'notify' | 'ground';
  title: string;
  actor: 'crew' | 'nastra' | 'ground' | 'system';
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
  /** Display code, e.g. PRT-SM-01. */
  code: string;
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
  steps: ProtocolStepDef[];
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
  short: 'Any of these now',
  redFlag: true,
  text:
    'Any fainting or feeling like you might pass out, chest pain, trouble breathing, new weakness or numbness, ' +
    'trouble speaking, vision loss, or a sudden severe headache?',
  options: [
    { id: 'none', label: 'None of these', answer: 'no' },
    { id: 'nearly_fainted', label: 'Nearly fainted', answer: 'yes', value: 'nearly fainted' },
    { id: 'chest', label: 'Chest pain', answer: 'yes', value: 'chest pain' },
    { id: 'breathing', label: 'Trouble breathing', answer: 'yes', value: 'trouble breathing' },
    { id: 'weakness', label: 'Weakness or numbness', answer: 'yes', value: 'new weakness or numbness' },
    { id: 'speech_vision', label: 'Speech or vision change', answer: 'yes', value: 'trouble speaking or vision loss' },
    { id: 'headache', label: 'Sudden severe headache', answer: 'yes', value: 'sudden severe headache' },
  ],
};

const ONSET: FollowUpQuestion = {
  id: 'q_onset', short: 'When did it start', redFlag: false, fills: ['onset'],
  text: 'When did it start?',
  options: [
    { id: 'just_now', label: 'Just now', answer: 'yes', value: 'just now' },
    { id: 'last_hour', label: 'Within the last hour', answer: 'yes', value: 'within the last hour' },
    { id: 'earlier_today', label: 'Earlier today', answer: 'yes', value: 'earlier today' },
  ],
};

const SEVERITY: FollowUpQuestion = {
  id: 'q_severity', short: 'How strong', redFlag: false, fills: ['severity'],
  text: 'How strong is it?',
  options: [
    { id: 'mild', label: 'Mild', answer: 'yes', value: 'mild' },
    { id: 'moderate', label: 'Moderate', answer: 'yes', value: 'moderate' },
    { id: 'severe', label: 'Severe', answer: 'yes', value: 'severe' },
  ],
};

const SYMPTOM_STEPS: ProtocolStepDef[] = [
  { id: 'safety', title: 'Safety screen', actor: 'system' },
  { id: 'clarify', title: 'Symptom clarification', actor: 'crew' },
  { id: 'context', title: 'Review physiological and mission context', actor: 'nastra' },
  { id: 'history', title: 'Compare historical events', actor: 'nastra' },
  { id: 'action', title: 'Determine next action', actor: 'system' },
  { id: 'recheck', title: 'Recheck', actor: 'crew' },
];

export const PROTOCOLS: Record<string, Protocol> = {
  sensorimotor_disorientation: {
    id: 'sensorimotor_disorientation',
    code: 'PRT-SM-01',
    version: '0.2.0',
    status: 'demo_draft',
    title: 'Disorientation / balance disturbance',
    appliesTo: { domains: ['physical_symptom'], bodySystems: ['sensorimotor_vestibular'] },
    mandatoryQuestions: [RED_FLAG_PHYSICAL, ONSET, SEVERITY],
    requiredInfo: ['onset', 'severity'],
    immediateStep: 'Pause what you are doing, hold on to a handrail or restraint, and keep your head still for now.',
    recheckMinutes: 20,
    baseUrgency: 'advisory',
    allowedTools: [
      'telemetry.vitals_now', 'health.recent_sleep', 'health.recent_mood',
      'health.similar_episodes', 'mission.current_context', 'knowledge.search',
    ],
    knowledgeTags: ['sensorimotor_vestibular', 'cardiovascular'],
    sources: [HRP_SENSORIMOTOR, HRP_CARDIO, HRP_FITNESS, STD_3001_SURVEILLANCE],
    steps: SYMPTOM_STEPS,
  },

  acute_stress: {
    id: 'acute_stress',
    code: 'PRT-BH-01',
    version: '0.2.0',
    status: 'demo_draft',
    title: 'Acute stress / emotional strain',
    appliesTo: { domains: ['psychological'], bodySystems: ['behavioral_health', 'sleep'] },
    mandatoryQuestions: [
      {
        id: 'q_red_flags_psych',
        short: 'Any of these now',
        redFlag: true,
        text: 'Any chest pain, trouble breathing, feeling faint, or thoughts of harming yourself?',
        options: [
          { id: 'none', label: 'None of these', answer: 'no' },
          { id: 'physical', label: 'Chest, breathing or faint', answer: 'yes', value: 'chest pain, trouble breathing or feeling faint' },
          { id: 'self_harm', label: 'Thoughts of harming myself', answer: 'yes', value: 'thoughts of self-harm' },
        ],
      },
      {
        id: 'q_trigger', short: 'Tied to something', redFlag: false, fills: ['trigger'],
        text: 'Is this tied to something specific right now, like the briefing or the EVA?',
        options: [
          { id: 'briefing_eva', label: 'The briefing or EVA', answer: 'yes', value: 'the upcoming briefing or EVA' },
          { id: 'other', label: 'Something else', answer: 'yes', value: 'something else' },
          { id: 'not_sure', label: 'Not sure', answer: 'yes', value: 'not sure' },
        ],
      },
      {
        id: 'q_task', short: 'Can you pause', redFlag: false, fills: ['current_activity'],
        text: 'Are you in the middle of a task, or can you take a few minutes?',
        options: [
          { id: 'can_pause', label: 'I can take a few minutes', answer: 'no', value: 'can take a few minutes' },
          { id: 'mid_task', label: 'In the middle of a task', answer: 'yes', value: 'in the middle of a task' },
        ],
      },
    ],
    requiredInfo: ['trigger', 'current_activity'],
    immediateStep: 'If you can, take a few minutes somewhere quiet. I can guide you through a slow breathing exercise.',
    recheckMinutes: 10,
    baseUrgency: 'advisory',
    allowedTools: [
      'telemetry.vitals_now', 'health.recent_sleep', 'health.recent_mood',
      'health.similar_episodes', 'mission.current_context', 'knowledge.search',
    ],
    knowledgeTags: ['behavioral_health', 'sleep'],
    sources: [HRP_BEHAVIORAL, HRP_SLEEP, STD_3001_SURVEILLANCE],
    steps: SYMPTOM_STEPS.map((st) => (st.id === 'clarify' ? { ...st, title: 'Check-in questions' } : st)),
  },

  general_physical: {
    id: 'general_physical',
    code: 'PRT-GP-01',
    version: '0.2.0',
    status: 'demo_draft',
    title: 'General symptom check',
    appliesTo: { domains: ['physical_symptom'], bodySystems: [] },
    mandatoryQuestions: [RED_FLAG_PHYSICAL, ONSET, SEVERITY],
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
    steps: SYMPTOM_STEPS,
  },

  /**
   * Deterministic escalation. Entered only by code (safety screen, a yes to a
   * warning-signs question, or an unanswered/unclear safety check). Never by the model.
   */
  red_flag_response: {
    id: 'red_flag_response',
    code: 'PRT-SY-01',
    version: '0.1.0',
    status: 'demo_draft',
    title: 'Red-flag symptom response',
    appliesTo: { domains: ['physical_symptom', 'psychological'], bodySystems: [] },
    mandatoryQuestions: [],
    requiredInfo: [],
    immediateStep: "Stop what you're doing and get to a stable, secured position.",
    recheckMinutes: null,
    baseUrgency: 'warning',
    allowedTools: ['telemetry.vitals_now', 'health.recent_sleep', 'health.recent_mood', 'health.similar_episodes', 'mission.current_context'],
    knowledgeTags: [],
    sources: [STD_3001_SURVEILLANCE],
    steps: [
      { id: 'safety', title: 'Red flag detected by the safety screen', actor: 'system' },
      { id: 'secure', title: 'Stop and get to a stable, secured position', actor: 'crew' },
      { id: 'notify', title: 'Tell a crewmate nearby', actor: 'crew' },
      { id: 'ground', title: 'Flight surgeon alerted with a handover brief', actor: 'system' },
    ],
  },
};

export function protocolByCode(code: string): Protocol | null {
  return Object.values(PROTOCOLS).find((p) => p.code === code) ?? null;
}

/** Deterministic protocol selection from the interpretation. */
export function selectProtocol(domain: Domain, bodySystems: BodySystem[]): Protocol | null {
  if (domain === 'physical_symptom') {
    if (bodySystems.includes('sensorimotor_vestibular')) return PROTOCOLS.sensorimotor_disorientation;
    return PROTOCOLS.general_physical;
  }
  if (domain === 'psychological') return PROTOCOLS.acute_stress;
  return null;
}
