/**
 * Fixed texts for paths that bypass the model (NASTRA action flow:
 * critical → deterministic emergency action, AI cannot override).
 * DEMO DRAFT wording — requires flight-surgeon review before real use.
 */
export const ESCALATION = {
  headline: 'This needs the flight surgeon now.',
  steps: [
    "Stop what you're doing and get to a stable, secured position.",
    'Tell a crewmate nearby.',
    "I'm sending this message and your current data to the flight surgeon.",
  ],
};

/** Replaces the "I'm sending this" step when the alert could not be written. Never claim a send that failed. */
export const ESCALATION_ALERT_FAILED =
  "I could not reach the flight surgeon automatically. Call ground on the voice loop now.";

export const CLARIFY =
  "I want to make sure I understand. Is this about how you're feeling physically, how you're feeling emotionally, or a question about your health data?";

export const REDIRECT = "Copy. I'm here for your health and wellbeing — tell me if anything feels off, or ask about your data.";

export const DISCLAIMER = 'Simulated data. NASTRA does not diagnose; the flight surgeon makes medical decisions.';

/** Protocol next steps shown once safety questions are cleared. Verbatim, never model-written. */
export const GUIDANCE: Record<string, string[]> = {
  sensorimotor_disorientation: [
    'Stay seated or restrained and avoid quick head movements.',
    "Have some water if you haven't since your workout.",
  ],
  acute_stress: [
    'Try two minutes of slow breathing: in for 4, out for 6. I can count with you.',
  ],
  general_physical: [
    'Take a break from strenuous tasks for now if you can.',
  ],
};

export function recheckLine(minutes: number): string {
  return `I'll check in again in ${minutes} minutes. If anything gets worse, or you notice any of the warning signs I asked about, tell me right away.`;
}

/** Every non-emergency turn while an escalation is active: stay with it, never start over. */
export const ESCALATION_FOLLOWUP = {
  headline: 'Your escalation is still active.',
  steps: [
    'Stay in a stable, secured position and keep a crewmate with you.',
    'Use the voice loop to talk to ground directly; it is faster than this console.',
    'Tell me right away if breathing gets harder, you feel faint, or you have chest pain. I will alert again.',
  ],
};
