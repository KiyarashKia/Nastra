/**
 * NASTRA AI patterns for Station. The assistant is an interface actor, not an
 * authority (02 §7). Every response separates MEASURED / DERIVED / RETRIEVED /
 * AI ASSESSMENT / RECOMMENDED ACTION and exposes its evidence in one step.
 * NHIS A11–A17, A32; NASA-STD-3001 V2 10169–10171; App. F F.6.2.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button, ChoiceGroup, Disclosure, TextField } from './controls';
import { Glyph } from '../shared/Glyph';
import { ConfidenceTag, DataQualityTag, EvidenceTag, Time } from '../shared/StatusTags';
import type { AIState, Confidence, DataQuality, EvidenceCategory, ProtocolLink, Timestamp } from '../../semantics/model';
import './ai.css';

const cx = (...c: Array<string | false | undefined | null>) => c.filter(Boolean).join(' ');

/** Persistent AI disclosure (NHIS A16). Wording is a project default; adjust with medical review. */
export const AI_DISCLOSURE = 'NASTRA is an AI decision-support tool. It summarises your data and approved protocols. It does not diagnose.';

export function AIDisclosure({ compact = false }: { compact?: boolean }) {
  return (
    <p className={cx('nhis-ai-disclosure', compact && 'is-compact')}>
      <Glyph name="ai-assessment" size={16} />
      {AI_DISCLOSURE}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */
export interface EvidenceSignal {
  name: string;
  /** e.g. "06:00–14:30 UTC" */
  window: string;
  summary: string;
  quality?: DataQuality;
  category?: Extract<EvidenceCategory, 'measured' | 'derived'>;
}
export interface EvidenceRecord {
  signals: EvidenceSignal[];
  baseline?: string;
  protocol?: ProtocolLink;
  retrieved?: Array<{ title: string; reference: string }>;
  /** Named gaps (A11). Empty array means "no known gaps", not "unchecked". */
  gaps: string[];
}

export function EvidencePanel({ evidence }: { evidence: EvidenceRecord }) {
  return (
    <div className="nhis-evidence">
      <section>
        <h4 className="nhis-evidence__head">Signals used</h4>
        <ul className="nhis-evidence__list">
          {evidence.signals.map((s) => (
            <li key={s.name + s.window}>
              <EvidenceTag category={s.category ?? 'measured'} />
              <span className="nhis-evidence__name">{s.name}</span>
              <span className="nhis-evidence__window nhis-num">{s.window}</span>
              <span className="nhis-evidence__summary">{s.summary}</span>
              {s.quality && s.quality !== 'live' && <DataQualityTag quality={s.quality} />}
            </li>
          ))}
        </ul>
      </section>
      {evidence.baseline && (
        <section>
          <h4 className="nhis-evidence__head">Baseline used</h4>
          <p className="nhis-evidence__text">{evidence.baseline}</p>
        </section>
      )}
      {evidence.protocol && (
        <section>
          <h4 className="nhis-evidence__head">Protocol used</h4>
          <p className="nhis-evidence__text">
            <EvidenceTag category="retrieved" /> {evidence.protocol.title} <span className="nhis-num">({evidence.protocol.id})</span>
          </p>
        </section>
      )}
      {evidence.retrieved && evidence.retrieved.length > 0 && (
        <section>
          <h4 className="nhis-evidence__head">References</h4>
          <ul className="nhis-evidence__refs">
            {evidence.retrieved.map((r) => (
              <li key={r.reference}>
                {r.title} <span className="nhis-num">{r.reference}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h4 className="nhis-evidence__head">Data gaps</h4>
        {evidence.gaps.length ? (
          <ul className="nhis-evidence__gaps">
            {evidence.gaps.map((g) => (
              <li key={g}>
                <Glyph name="unavailable" size={16} />
                {g}
              </li>
            ))}
          </ul>
        ) : (
          <p className="nhis-evidence__text">No known gaps in the signals used.</p>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AIAssessment                                                        */
/* ------------------------------------------------------------------ */
export interface Observation {
  text: string;
  category: Extract<EvidenceCategory, 'measured' | 'derived' | 'retrieved'>;
}

export interface AIAssessmentProps {
  title: string;
  generatedAt: Timestamp;
  /** Observations come first, before any recommendation (A11). */
  observations: Observation[];
  /** Model interpretation. Omitted when out of scope. */
  assessment?: string;
  confidence?: Confidence;
  /** Shown when confidence is low (A12). */
  alternatives?: string[];
  /** Only actions permitted by an approved protocol (02 §7). */
  recommendedAction?: { text: string; protocol: ProtocolLink };
  evidence: EvidenceRecord;
  state?: Extract<AIState, 'idle' | 'uncertain' | 'out-of-scope' | 'missing-evidence' | 'escalated'>;
  /** Out-of-scope wording (A13). */
  scopeNote?: string;
  /**
   * Cognitive forcing for high-consequence assessments (A14): the crew member's
   * own report is collected before the AI assessment is revealed.
   */
  requireSelfReport?: boolean;
  selfReport?: ReactNode;
  onStartSelfReport?: () => void;
  onDismiss?: () => void;
  onCorrect?: () => void;
  onEscalate?: () => void;
  onOpenProtocol?: (p: ProtocolLink) => void;
}

export function AIAssessment({
  title,
  generatedAt,
  observations,
  assessment,
  confidence,
  alternatives,
  recommendedAction,
  evidence,
  state = 'idle',
  scopeNote,
  requireSelfReport,
  selfReport,
  onStartSelfReport,
  onDismiss,
  onCorrect,
  onEscalate,
  onOpenProtocol,
}: AIAssessmentProps) {
  const gated = requireSelfReport && !selfReport;
  const outOfScope = state === 'out-of-scope';
  return (
    <article className={cx('nhis-ai-assessment', outOfScope && 'is-out-of-scope', state === 'uncertain' && 'is-uncertain')} aria-label={title}>
      <header className="nhis-ai-assessment__head">
        <div>
          <h3 className="nhis-ai-assessment__title">{title}</h3>
          <span className="nhis-ai-assessment__meta">
            Generated <Time value={generatedAt} />
          </span>
        </div>
        <div className="nhis-ai-assessment__head-actions">
          {onCorrect && (
            <Button size="compact" intent="quiet" icon="flag" onPress={onCorrect}>
              This is wrong / add context
            </Button>
          )}
          {onDismiss && (
            <Button size="compact" intent="quiet" icon="close" onPress={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      </header>

      <section className="nhis-ai-layer nhis-ai-layer--observation">
        <h4 className="nhis-ai-layer__head">What was observed</h4>
        <ul className="nhis-ai-layer__list">
          {observations.map((o) => (
            <li key={o.text}>
              <EvidenceTag category={o.category} />
              <span>{o.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {gated ? (
        <section className="nhis-ai-layer nhis-ai-layer--gate">
          <h4 className="nhis-ai-layer__head">Your report first</h4>
          <p>Record how you feel before seeing NASTRA's assessment. This keeps your own judgement independent of the AI.</p>
          {onStartSelfReport && (
            <Button intent="primary" icon="chevron-right" onPress={onStartSelfReport}>
              Record your report
            </Button>
          )}
        </section>
      ) : outOfScope ? (
        <section className="nhis-ai-layer nhis-ai-layer--scope" role="status">
          <h4 className="nhis-ai-layer__head">
            <Glyph name="unknown" size={20} /> Outside what NASTRA can assess
          </h4>
          <p>{scopeNote ?? 'This situation is beyond NASTRA\'s capability. Rely on your own judgement and contact the flight surgeon.'}</p>
          {onEscalate && (
            <Button intent="primary" icon="escalate" onPress={onEscalate}>
              Escalate to flight surgeon
            </Button>
          )}
        </section>
      ) : (
        <>
          {selfReport && (
            <section className="nhis-ai-layer nhis-ai-layer--self">
              <h4 className="nhis-ai-layer__head">Your report</h4>
              {selfReport}
            </section>
          )}
          {assessment && (
            <section className="nhis-ai-layer nhis-ai-layer--assessment">
              <h4 className="nhis-ai-layer__head">
                <EvidenceTag category="ai-assessment" />
              </h4>
              <p className="nhis-ai-layer__text">{assessment}</p>
              {confidence && (
                <div className="nhis-ai-confidence">
                  <ConfidenceTag level={confidence.level} />
                  <span className="nhis-ai-confidence__meaning">{confidence.meaning}</span>
                  <span className="nhis-ai-confidence__next">
                    <strong>Next:</strong> {confidence.nextAction}
                  </span>
                </div>
              )}
              {confidence?.level === 'low' && alternatives && alternatives.length > 0 && (
                <div className="nhis-ai-alternatives">
                  <span className="nhis-ai-alternatives__head">Other explanations NASTRA cannot rule out</span>
                  <ul>
                    {alternatives.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
          {recommendedAction && (
            <section className="nhis-ai-layer nhis-ai-layer--action">
              <h4 className="nhis-ai-layer__head">
                <EvidenceTag category="recommended-action" />
              </h4>
              <p className="nhis-ai-layer__text">{recommendedAction.text}</p>
              <Button intent="secondary" icon="list" onPress={() => onOpenProtocol?.(recommendedAction.protocol)}>
                Protocol: {recommendedAction.protocol.title}
              </Button>
            </section>
          )}
        </>
      )}

      <Disclosure title="Inspect evidence">
        <EvidencePanel evidence={evidence} />
      </Disclosure>
      <AIDisclosure compact />
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* PatternCard — repeated association, never causation (02 §8)         */
/* ------------------------------------------------------------------ */
export function PatternCard({
  pattern,
  records,
  interpretation = 'Repeated association detected. Causation not established.',
  window,
}: {
  pattern: string;
  records: string[];
  interpretation?: string;
  window: string;
}) {
  return (
    <article className="nhis-pattern">
      <header className="nhis-pattern__head">
        <EvidenceTag category="derived" />
        <span className="nhis-pattern__window nhis-num">{window}</span>
      </header>
      <h3 className="nhis-pattern__title">Observed pattern</h3>
      <p className="nhis-pattern__text">{pattern}</p>
      <h4 className="nhis-pattern__subhead">Associated records</h4>
      <ul className="nhis-pattern__records">
        {records.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="nhis-pattern__interpretation">
        <strong>Interpretation:</strong> {interpretation}
      </p>
      <p className="nhis-pattern__guard">A past pattern never makes a current alert safe. Current alerts are evaluated independently.</p>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Conversation                                                        */
/* ------------------------------------------------------------------ */
export interface ConversationMessage {
  id: string;
  role: 'crew' | 'nastra' | 'system';
  time: Timestamp;
  /** Plain text, or structured content (e.g. an AIAssessment). */
  content: ReactNode;
}

export interface ConversationProps {
  messages: ConversationMessage[];
  state?: AIState;
  /** Shown during processing; analysis over 10 s must show progress and allow interruption (A29). */
  progress?: { step: number; of: number; label: string };
  suggestedReplies?: string[];
  onSend?: (text: string) => void;
  onCancel?: () => void;
  onSuggestedReply?: (text: string) => void;
  composerAccessory?: ReactNode;
}

const ROLE_LABEL: Record<ConversationMessage['role'], string> = { crew: 'You', nastra: 'NASTRA (AI)', system: 'System' };

export function Conversation({ messages, state = 'idle', progress, suggestedReplies, onSend, onCancel, onSuggestedReply, composerAccessory }: ConversationProps) {
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const lastNastra = [...messages].reverse().find((m) => m.role === 'nastra');
  const seen = useRef<string | undefined>(lastNastra?.id);

  // A32: keep the view at the START of a new response, never auto-scroll to the end.
  useLayoutEffect(() => {
    if (!lastNastra || seen.current === lastNastra.id) return;
    seen.current = lastNastra.id;
    const el = logRef.current?.querySelector<HTMLElement>(`[data-message-id="${lastNastra.id}"]`);
    if (el && logRef.current) logRef.current.scrollTop = el.offsetTop - logRef.current.offsetTop - 8;
  }, [lastNastra]);

  const busy = state === 'processing' || state === 'responding';
  return (
    <section className="nhis-conversation" aria-label="Conversation with NASTRA">
      <div className="nhis-conversation__log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions">
        {messages.map((m) => (
          <div key={m.id} data-message-id={m.id} className={cx('nhis-message', `nhis-message--${m.role}`)}>
            <div className="nhis-message__meta">
              <span className="nhis-message__role">{ROLE_LABEL[m.role]}</span>
              <Time value={m.time} seconds={false} />
            </div>
            <div className="nhis-message__body">{m.content}</div>
          </div>
        ))}
        {busy && (
          <div className="nhis-message nhis-message--status" role="status">
            <span className="nhis-button__spinner" aria-hidden="true" />
            {progress ? (
              <span>
                {progress.label} · step <span className="nhis-num">{progress.step}</span> of <span className="nhis-num">{progress.of}</span>
              </span>
            ) : (
              <span>NASTRA is processing</span>
            )}
            {onCancel && (
              <Button size="compact" intent="quiet" icon="close" onPress={onCancel}>
                Stop
              </Button>
            )}
          </div>
        )}
        {state === 'unavailable' && (
          <div className="nhis-message nhis-message--status" role="status">
            <Glyph name="unavailable" size={20} />
            <span>NASTRA AI is unavailable. Alerts, telemetry and protocols keep working without it.</span>
          </div>
        )}
      </div>
      {suggestedReplies && suggestedReplies.length > 0 && (
        <div className="nhis-conversation__suggestions" role="group" aria-label="Suggested replies">
          {suggestedReplies.map((r) => (
            <Button key={r} size="compact" intent="secondary" onPress={() => onSuggestedReply?.(r)} isDisabled={busy}>
              {r}
            </Button>
          ))}
        </div>
      )}
      <form
        className="nhis-conversation__composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          onSend?.(draft.trim());
          setDraft('');
        }}
      >
        <TextField label="Message NASTRA" value={draft} onChange={setDraft} multiline placeholder="Describe what you notice, or ask about your data" />
        <div className="nhis-conversation__composer-row">
          {composerAccessory}
          <Button type="submit" intent="primary" icon="send" isDisabled={!draft.trim() || busy}>
            Send
          </Button>
        </div>
        <AIDisclosure compact />
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* SymptomIntake — chips + free text + confirmed read-back (A15)       */
/* ------------------------------------------------------------------ */
export interface IntakeQuestion {
  id: string;
  label: string;
  options: Array<{ id: string; label: string }>;
}
export interface SymptomReport {
  description: string;
  answers: Record<string, string>;
}

export function SymptomIntake({
  questions,
  onConfirm,
  onCancel,
}: {
  /** Question set from the approved intake protocol; NHIS supplies none of its own. */
  questions: IntakeQuestion[];
  onConfirm: (report: SymptomReport) => void;
  onCancel?: () => void;
}) {
  const [description, setDescription] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<'entry' | 'read-back' | 'confirmed'>('entry');
  const complete = description.trim().length > 0 && questions.every((q) => answers[q.id]);

  if (stage === 'confirmed') {
    return (
      <section className="nhis-intake nhis-intake--done" role="status">
        <Glyph name="step-completed" size={24} />
        <div>
          <h3 className="nhis-intake__title">Report confirmed</h3>
          <p>Your report is recorded. NASTRA will use exactly what you confirmed.</p>
        </div>
      </section>
    );
  }

  if (stage === 'read-back') {
    return (
      <section className="nhis-intake" aria-label="Confirm your report">
        <h3 className="nhis-intake__title">Is this what you meant?</h3>
        <dl className="nhis-intake__readback">
          <div>
            <dt>In your words</dt>
            <dd>{description}</dd>
          </div>
          {questions.map((q) => (
            <div key={q.id}>
              <dt>{q.label}</dt>
              <dd>{q.options.find((o) => o.id === answers[q.id])?.label}</dd>
            </div>
          ))}
        </dl>
        <div className="nhis-intake__actions">
          <Button intent="secondary" onPress={() => setStage('entry')}>
            Edit
          </Button>
          <Button
            intent="primary"
            icon="check"
            onPress={() => {
              onConfirm({ description, answers });
              setStage('confirmed');
            }}
          >
            Confirm report
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="nhis-intake" aria-label="Report a symptom">
      <h3 className="nhis-intake__title">Report a symptom</h3>
      <TextField label="Describe it in your own words" value={description} onChange={setDescription} multiline />
      {questions.map((q) => (
        <ChoiceGroup
          key={q.id}
          label={q.label}
          presentation="chips"
          options={q.options}
          value={answers[q.id] ?? null}
          onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
        />
      ))}
      <div className="nhis-intake__actions">
        {onCancel && (
          <Button intent="quiet" onPress={onCancel}>
            Cancel
          </Button>
        )}
        <Button intent="primary" icon="chevron-right" isDisabled={!complete} onPress={() => setStage('read-back')}>
          Review report
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CheckIn — psychological / behavioural check-in (02 §6.2)            */
/* Sensitive: no scores, streaks, colours or celebratory feedback.     */
/* ------------------------------------------------------------------ */
export function CheckIn({
  title = 'Check-in',
  questions,
  visibilityNote,
  onSubmit,
}: {
  title?: string;
  questions: IntakeQuestion[];
  /** Who can see this entry, from the project's data policy. */
  visibilityNote: string;
  onSubmit: (answers: Record<string, string>, note: string) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => setSubmitted(false), [questions]);
  if (submitted)
    return (
      <section className="nhis-intake nhis-intake--done" role="status">
        <Glyph name="step-completed" size={24} />
        <div>
          <h3 className="nhis-intake__title">Check-in saved</h3>
          <p>{visibilityNote}</p>
        </div>
      </section>
    );
  return (
    <section className="nhis-intake" aria-label={title}>
      <h3 className="nhis-intake__title">{title}</h3>
      <p className="nhis-intake__note">{visibilityNote}</p>
      {questions.map((q) => (
        <ChoiceGroup
          key={q.id}
          label={q.label}
          presentation="chips"
          options={q.options}
          value={answers[q.id] ?? null}
          onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
        />
      ))}
      <TextField label="Anything else (optional)" value={note} onChange={setNote} multiline />
      <div className="nhis-intake__actions">
        <Button
          intent="primary"
          isDisabled={!questions.every((q) => answers[q.id])}
          onPress={() => {
            onSubmit(answers, note);
            setSubmitted(true);
          }}
        >
          Save check-in
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* ExtractionReview — values read from an image by the model are       */
/* unconfirmed until the crew member checks them. Nothing is saved     */
/* from image extraction alone (project rule; NISTIR 7804 accuracy).   */
/* ------------------------------------------------------------------ */
export interface ExtractedField {
  id: string;
  label: string;
  value: string;
  unit?: string;
  /** Model's own note, e.g. "Digit partly obscured". */
  note?: string;
}

export function ExtractionReview({
  source,
  fields,
  onConfirm,
  onDiscard,
}: {
  /** e.g. "Photo of blood-pressure cuff display, 14:31 UTC". */
  source: string;
  fields: ExtractedField[];
  onConfirm: (values: Record<string, string>) => void;
  onDiscard: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.id, f.value])));
  const [confirmed, setConfirmed] = useState(false);
  if (confirmed)
    return (
      <section className="nhis-intake nhis-intake--done" role="status">
        <Glyph name="step-completed" size={24} />
        <div>
          <h3 className="nhis-intake__title">Values confirmed</h3>
          <p>Saved as manual entry, confirmed by you, with the source image attached.</p>
        </div>
      </section>
    );
  return (
    <section className="nhis-intake nhis-extraction" aria-label="Check values read from image">
      <h3 className="nhis-intake__title">Check what NASTRA read</h3>
      <p className="nhis-intake__note">
        <EvidenceTag category="ai-assessment" /> Read from: {source}. These values are not saved until you confirm them.
      </p>
      {fields.map((f) => (
        <div key={f.id} className="nhis-extraction__row">
          <TextField label={f.unit ? `${f.label} (${f.unit})` : f.label} value={values[f.id] ?? ''} onChange={(v) => setValues((all) => ({ ...all, [f.id]: v }))} description={f.note} />
        </div>
      ))}
      <div className="nhis-intake__actions">
        <Button intent="quiet" onPress={onDiscard}>
          Discard
        </Button>
        <Button
          intent="primary"
          icon="check"
          onPress={() => {
            onConfirm(values);
            setConfirmed(true);
          }}
        >
          Confirm values
        </Button>
      </div>
    </section>
  );
}
