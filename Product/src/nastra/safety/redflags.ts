import type { Urgency } from '../types';

/**
 * DEMO RED-FLAG LIST — written by the NASTRA team for the hackathon.
 * It is NOT a validated clinical list and no NASA page provides one.
 * Before any real use it must be reviewed by a flight surgeon.
 *
 * Bias: when in doubt, escalate. A false escalation costs a conversation;
 * a missed one could cost much more.
 */
export interface RedFlagRule {
  id: string;
  label: string;
  patterns: RegExp[];
}

export const RED_FLAGS: RedFlagRule[] = [
  {
    id: 'loss_of_consciousness',
    label: 'Fainting or loss of consciousness',
    patterns: [
      /\b(passed|blacked|blanked|zoned)\s+out\b/i,
      /\b(nearly|almost|about to)\s+(passed|pass|black(ed)?|faint(ed)?)\b/i,
      /\bfaint(ed|ing)?\b/i,
      /\blost consciousness\b/i,
      /\bwoke up on the (floor|ground)\b/i,
    ],
  },
  {
    id: 'near_collapse',
    label: 'Feeling close to collapse or passing out',
    patterns: [
      /\bbarely (stand(ing)?|conscious|awake|hold(ing)? (myself |it )?(up|together)|stay(ing)? up(right)?)\b/i,
      /\b(can'?t|cannot) (stand|stay) (up|upright)\b/i,
      /\b(going to|gonna|about to|might|could|feel like i'?(ll|m going to|m gonna)) (pass out|faint|collapse|black out|go down)\b/i,
      /\bpass(ing)? out\b/i,
      /\bcollaps(e|ed|ing)\b/i,
      /\b(legs|knees) (gave|giving|are giving|give) (out|way)\b/i,
      /\b(vision|everything|it'?s) (is )?(going|went|turning|getting) (black|dark|grey|gray|white)\b/i,
      /\b(fading|slipping) (out|away)\b/i,
    ],
  },
  {
    // Someone who is deteriorating may not finish a word. A bare cry for help is enough.
    id: 'distress_call',
    label: 'Call for help',
    patterns: [
      /^\W*(h+e+l+p*|h+a+l+p+|h+l+p+|s\W?o\W?s|mayday|emergency)\W*$/i,
      /\bhelp\s*(me)?\s*!+/i,
      /\b(i need|need|get me|send|call for) help\b(?!\s+(with|to|understand\w*|read\w*|log\w*|find\w*))/i,
      /\bhelp me\s*(please|now|pls|plz)?\W*$/i,
      /\b(call|get|contact) (the )?(flight )?(surgeon|doctor|medic|ground|houston|someone|somebody)\b/i,
      /\b(this is|it'?s|having|i have) (a |an )?(medical )?emergency\b|\bmedical emergency\b/i,
    ],
  },
  {
    id: 'chest_pain',
    label: 'Chest pain or pressure',
    patterns: [
      /\bchest\s+(pain|pressure|tightness|hurts?|is tight|feels tight)\b/i,
      /\bpain in (my )?chest\b/i,
      /\bcrushing\b.*\bchest\b|\bchest\b.*\bcrushing\b/i,
    ],
  },
  {
    id: 'breathing',
    label: 'Difficulty breathing',
    patterns: [
      /\b(can'?t|cannot|unable to|struggling to|struggle to|hard to|difficult to) (breathe|catch my breath|get (enough )?air)\b/i,
      /\bshort(ness)?\s+(of|in|on)\s+(my\s+)?breath\b/i,
      /\b(trouble|difficulty|problems?|struggling|hard time) breathing\b/i,
      /\bbreathless(ness)?\b/i,
      /\bgasping\b/i,
      /\b(not getting|can'?t get) (enough )?air\b/i,
    ],
  },
  {
    id: 'neuro_deficit',
    label: 'New weakness, numbness, speech or vision loss',
    patterns: [
      /\bslurr(ed|ing)\b/i,
      /\b(can'?t|cannot) (speak|talk|get (my|the) words out)\b/i,
      /\b(can'?t|cannot) (move|feel) (my )?(arm|leg|hand|face|side)\b/i,
      /\bnumb(ness)?\b.*\b(one side|left side|right side|arm|face)\b/i,
      /\b(lost|losing|loss of) (my )?(vision|sight)\b/i,
      /\b(suddenly|sudden) (can'?t|cannot) see\b/i,
      /\bface (is )?droop/i,
      /\bdouble vision\b/i,
    ],
  },
  {
    id: 'thunderclap_headache',
    label: 'Sudden severe headache',
    patterns: [/\bworst headache\b/i, /\b(sudden|thunderclap|explosive) (severe |bad )?headache\b/i],
  },
  {
    id: 'self_harm',
    label: 'Thoughts of self-harm',
    patterns: [
      /\b(kill|hurt|harm) (myself|me)\b/i,
      /\bend (it all|my life|things)\b/i,
      /\bsuicid/i,
      /\b(don'?t|do not) want to (live|be alive|be here anymore|exist)\b/i,
      /\bbetter off (dead|without me)\b/i,
    ],
  },
  { id: 'seizure', label: 'Seizure', patterns: [/\bseizure\b/i, /\bconvuls/i, /\bfit\b.*\bshaking\b/i] },
  {
    id: 'severe_bleeding',
    label: 'Heavy bleeding',
    patterns: [/\b(heavy|heavily|won'?t stop|can'?t stop)\b.*\bbleed/i, /\bbleed\w*\b.*\b(a lot|heavily|won'?t stop)\b/i],
  },
];

// Negation is looked for in a short window BEFORE the match, inside the same clause.
const NEGATION = /\b(no|not|without|never|nor|denies|deny|none of|don'?t have|haven'?t had|didn'?t)\b/i;
const CLAUSE_BREAK = /[.;!?]|\bbut\b|\bthough\b|\balthough\b|\bhowever\b/i;
const NEGATION_WINDOW = 40;

export interface RedFlagHit {
  id: string;
  label: string;
  match: string;
}

export interface SafetyScreen {
  /** true → deterministic emergency action. The model cannot override this. */
  critical: boolean;
  hits: RedFlagHit[];
  /** Mentioned but negated ("no chest pain"). Recorded, not escalated. */
  negated: RedFlagHit[];
  urgencyFloor: Urgency;
}

export function screenText(text: string): SafetyScreen {
  const hits: RedFlagHit[] = [];
  const negated: RedFlagHit[] = [];

  for (const rule of RED_FLAGS) {
    for (const pattern of rule.patterns) {
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      for (const m of text.matchAll(re)) {
        const hit = { id: rule.id, label: rule.label, match: m[0] };
        if (isNegated(text, m.index ?? 0)) negated.push(hit);
        else hits.push(hit);
      }
    }
  }

  const uniq = (xs: RedFlagHit[]) => xs.filter((h, i) => xs.findIndex((x) => x.id === h.id) === i);
  const finalHits = uniq(hits);
  return {
    critical: finalHits.length > 0,
    hits: finalHits,
    negated: uniq(negated).filter((n) => !finalHits.some((h) => h.id === n.id)),
    urgencyFloor: finalHits.length > 0 ? 'warning' : 'nominal',
  };
}

export function isNegated(text: string, index: number): boolean {
  let before = text.slice(Math.max(0, index - NEGATION_WINDOW), index);
  // Only look inside the current clause.
  const parts = before.split(CLAUSE_BREAK);
  before = parts[parts.length - 1] ?? '';
  return NEGATION.test(before);
}
