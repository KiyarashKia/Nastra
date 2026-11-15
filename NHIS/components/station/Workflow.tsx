import { escalationStageLabels, type EscalationRecipient } from './MissionHeader';
import { useState } from 'react';
import { DropZone, FileTrigger } from 'react-aria-components';
import { Button } from './controls';
import { Glyph, type GlyphName } from '../shared/Glyph';
import { LinkIndicator, Time } from '../shared/StatusTags';
import type { Actor, EscalationState, LinkState, ProtocolState, ProtocolStepState, Timestamp } from '../../semantics/model';
import './workflow.css';

const cx = (...c: Array<string | false | undefined | null>) => c.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ */
/* ProtocolStepper — NHIS A33 (persistent done state), App. F F.6.3    */
/* (procedure progress), F.6.2 (who performs the task).                */
/* ------------------------------------------------------------------ */
export interface ProtocolStep {
  id: string;
  title: string;
  detail?: string;
  state: ProtocolStepState;
  actor: Actor;
  completedAt?: Timestamp;
  /** Why the step is paused, failed or blocked. */
  note?: string;
}

const STEP_GLYPH: Record<ProtocolStepState, GlyphName> = {
  pending: 'step-pending',
  current: 'step-current',
  completed: 'step-completed',
  paused: 'step-paused',
  failed: 'step-failed',
  blocked: 'step-blocked',
};
const STEP_LABEL: Record<ProtocolStepState, string> = {
  pending: 'Not started',
  current: 'Current step',
  completed: 'Done',
  paused: 'Paused',
  failed: 'Failed',
  blocked: 'Blocked',
};
const PROTOCOL_LABEL: Record<ProtocolState, string> = {
  'not-started': 'Not started',
  active: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Stopped — step failed',
};
const ACTOR_LABEL: Record<Actor, string> = { crew: 'You', nastra: 'NASTRA', ground: 'Ground', system: 'System' };

export interface ProtocolStepperProps {
  title: string;
  protocolId: string;
  state: ProtocolState;
  steps: ProtocolStep[];
  onCompleteStep?: (step: ProtocolStep) => void;
  onPause?: () => void;
  onResume?: () => void;
}

export function ProtocolStepper({ title, protocolId, state, steps, onCompleteStep, onPause, onResume }: ProtocolStepperProps) {
  const done = steps.filter((s) => s.state === 'completed').length;
  return (
    <section className={cx('nhis-protocol', `nhis-protocol--${state}`)} aria-label={`Protocol: ${title}`}>
      <header className="nhis-protocol__head">
        <div>
          <h3 className="nhis-protocol__title">{title}</h3>
          <span className="nhis-protocol__meta">
            <span className="nhis-num">{protocolId}</span> · {PROTOCOL_LABEL[state]} ·{' '}
            <span className="nhis-num">
              {done}/{steps.length}
            </span>{' '}
            steps done
          </span>
        </div>
        <div className="nhis-protocol__head-actions">
          {state === 'active' && onPause && (
            <Button size="compact" intent="secondary" icon="paused" onPress={onPause}>
              Pause
            </Button>
          )}
          {state === 'paused' && onResume && (
            <Button size="compact" intent="primary" onPress={onResume}>
              Resume
            </Button>
          )}
        </div>
      </header>
      {state === 'completed' && (
        <p className="nhis-protocol__closure" role="status">
          <Glyph name="step-completed" size={20} /> Protocol complete. All steps confirmed.
        </p>
      )}
      <ol className="nhis-protocol__steps">
        {steps.map((s, i) => (
          <li key={s.id} className={cx('nhis-step', `nhis-step--${s.state}`)} aria-current={s.state === 'current' ? 'step' : undefined}>
            <span className="nhis-step__glyph">
              <Glyph name={STEP_GLYPH[s.state]} size={24} />
            </span>
            <div className="nhis-step__body">
              <div className="nhis-step__row">
                <span className="nhis-step__index nhis-num">{i + 1}</span>
                <span className="nhis-step__title">{s.title}</span>
                <span className="nhis-step__state">{STEP_LABEL[s.state]}</span>
              </div>
              {s.detail && s.state !== 'pending' && <p className="nhis-step__detail">{s.detail}</p>}
              <div className="nhis-step__meta">
                Performed by {ACTOR_LABEL[s.actor]}
                {s.completedAt && (
                  <>
                    {' '}
                    · <Time value={s.completedAt} seconds={false} />
                  </>
                )}
                {s.note && <> · {s.note}</>}
              </div>
              {s.state === 'current' && s.actor === 'crew' && onCompleteStep && state === 'active' && (
                <Button intent="primary" icon="check" onPress={() => onCompleteStep(s)}>
                  Mark step done
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* EscalationStatus — asynchronous flight-surgeon escalation (A18)     */
/* ------------------------------------------------------------------ */
export interface EscalationStatusProps {
  state: EscalationState;
  /** What is sent: summary, telemetry window, evidence (A18). */
  package: { summary: string; telemetryWindow: string; evidence: string[] };
  times?: Partial<Record<'sent' | 'received' | 'answered', Timestamp>>;
  link: { state: LinkState; delayLabel?: string };
  priority?: 'routine' | 'high';
  reply?: string;
  onSend?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
  /** Who the escalation goes to. Defaults to the flight surgeon (ground). */
  recipient?: EscalationRecipient;
}

export function EscalationStatus({ state, package: pkg, times = {}, link, priority = 'routine', reply, onSend, onRetry, onDismiss, recipient = 'flight_surgeon' }: EscalationStatusProps) {
  const lbl = escalationStageLabels(recipient);
  const stages: Array<['sent' | 'received' | 'answered', string]> = [
    ['sent', 'Sent'],
    ['received', lbl.received],
    ['answered', 'Answered'],
  ];
  const reached = (k: 'sent' | 'received' | 'answered') =>
    ({ draft: 0, sending: 0, failed: 0, sent: 1, received: 2, answered: 3 })[state] >= { sent: 1, received: 2, answered: 3 }[k];
  return (
    <section className={cx('nhis-escalation', priority === 'high' && 'is-high')} aria-label={lbl.title}>
      <header className="nhis-escalation__head">
        <h3 className="nhis-escalation__title">
          <Glyph name="escalate" size={20} /> {lbl.title}
          {priority === 'high' && <span className="nhis-escalation__priority">High priority</span>}
        </h3>
        <LinkIndicator state={link.state} delayLabel={link.delayLabel} />
      </header>
      <dl className="nhis-escalation__package">
        <div>
          <dt>Summary</dt>
          <dd>{pkg.summary}</dd>
        </div>
        <div>
          <dt>Telemetry window</dt>
          <dd className="nhis-num">{pkg.telemetryWindow}</dd>
        </div>
        <div>
          <dt>Evidence attached</dt>
          <dd>{pkg.evidence.join(' · ')}</dd>
        </div>
      </dl>
      <ol className="nhis-escalation__track">
        {stages.map(([k, label]) => (
          <li key={k} className={cx(reached(k) && 'is-reached')}>
            <Glyph name={reached(k) ? 'step-completed' : 'step-pending'} size={20} />
            <span>{label}</span>
            {times[k] && <Time value={times[k]!} seconds={false} />}
          </li>
        ))}
      </ol>
      {state === 'failed' && (
        <p className="nhis-escalation__failed" role="alert">
          <Glyph name="link-disconnected" size={20} /> Not sent. The message is kept and will not be lost.
        </p>
      )}
      {reply && (
        <blockquote className="nhis-escalation__reply">
          <span className="nhis-escalation__reply-label">Flight surgeon</span>
          {reply}
        </blockquote>
      )}
      <div className="nhis-escalation__actions">
        {state === 'draft' && onSend && (
          <Button intent="primary" icon="escalate" onPress={onSend}>
            Send to flight surgeon
          </Button>
        )}
        {state === 'failed' && onRetry && (
          <Button intent="primary" onPress={onRetry}>
            Retry send
          </Button>
        )}
        {state === 'answered' && onDismiss && (
          <Button intent="secondary" onPress={onDismiss}>
            Mark read
          </Button>
        )}
      </div>
      {link.delayLabel && (
        <p className="nhis-escalation__note">Messages are asynchronous. Round-trip delay right now: {link.delayLabel}.</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* ImageInput — DropZone + FileTrigger. Drag always has a button       */
/* alternative (WCAG 2.5.7, NHIS A30).                                 */
/* ------------------------------------------------------------------ */
export interface ImageInputProps {
  label?: string;
  onFiles: (files: File[]) => void;
  isDisabled?: boolean;
}

export function ImageInput({ label = 'Add an image', onFiles, isDisabled }: ImageInputProps) {
  const [names, setNames] = useState<string[]>([]);
  const accept = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    setNames((n) => [...n, ...imgs.map((f) => f.name)]);
    onFiles(imgs);
  };
  return (
    <div className="nhis-image-input">
      <DropZone
        className="nhis-image-input__zone"
        isDisabled={isDisabled}
        getDropOperation={(types) => (types.has('image/png') || types.has('image/jpeg') || types.has('image/webp') ? 'copy' : 'cancel')}
        onDrop={async (e) => {
          const files = await Promise.all(
            e.items.filter((i) => i.kind === 'file').map((i) => (i as { getFile: () => Promise<File> }).getFile()),
          );
          accept(files);
        }}
      >
        <Glyph name="image" size={24} />
        <span>Drop an image here, or</span>
        <FileTrigger acceptedFileTypes={['image/png', 'image/jpeg', 'image/webp']} allowsMultiple onSelect={(list) => list && accept(Array.from(list))}>
          <Button intent="secondary" size="compact" isDisabled={isDisabled}>
            {label}
          </Button>
        </FileTrigger>
      </DropZone>
      {names.length > 0 && (
        <ul className="nhis-image-input__list" aria-label="Attached images">
          {names.map((n, i) => (
            <li key={`${n}-${i}`}>
              <Glyph name="image" size={16} /> {n}
              <Button size="compact" intent="quiet" icon="close" iconOnly aria-label={`Remove ${n}`} onPress={() => setNames((all) => all.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
