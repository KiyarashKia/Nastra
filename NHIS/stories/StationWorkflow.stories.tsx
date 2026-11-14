import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EscalationStatus, ProtocolStepper, type ProtocolStep } from '../components/station/Workflow';
import type { EscalationState, ProtocolState } from '../semantics/model';
import { minutesAgo, utc } from './fixtures';
import './stories.css';

const meta: Meta = { title: 'Station/Workflow' };
export default meta;
type S = StoryObj;

const STEPS: ProtocolStep[] = [
  { id: 's1', title: 'Re-seat the finger sensor', state: 'completed', actor: 'crew', completedAt: utc(minutesAgo(4)) },
  { id: 's2', title: 'Take a second reading at rest', detail: 'Sit still for 60 s, then read SpO₂.', state: 'current', actor: 'crew' },
  { id: 's3', title: 'Compare with cabin O₂ partial pressure', state: 'pending', actor: 'system' },
  { id: 's4', title: 'Send summary to flight surgeon', state: 'pending', actor: 'nastra' },
];

export const Protocol: S = {
  name: 'Protocol stepper',
  render: () => {
    const [steps, setSteps] = useState(STEPS);
    const [state, setState] = useState<ProtocolState>('active');
    const complete = (s: ProtocolStep) =>
      setSteps((all) => {
        const i = all.findIndex((x) => x.id === s.id);
        const next = all.map((x, j) => (j === i ? { ...x, state: 'completed' as const, completedAt: utc(minutesAgo(0)) } : j === i + 1 ? { ...x, state: 'current' as const } : x));
        if (i === all.length - 1) setState('completed');
        return next;
      });
    return (
      <div className="sb-page" style={{ maxWidth: 760 }}>
        <p className="sb-note">Fixture protocol. Each done state persists with who did it and when (A33). Only the current step is emphasised.</p>
        <ProtocolStepper title="Low oxygen saturation response" protocolId="PRT-RS-01" state={state} steps={steps} onCompleteStep={complete} onPause={() => setState('paused')} onResume={() => setState('active')} />
        <ProtocolStepper
          title="Sensor fit check"
          protocolId="PRT-EQ-03"
          state="failed"
          steps={[
            { id: 'a', title: 'Check strap contact', state: 'completed', actor: 'crew', completedAt: utc(minutesAgo(30)) },
            { id: 'b', title: 'Run sensor self-test', state: 'failed', actor: 'system', note: 'Self-test returned no response' },
            { id: 'c', title: 'Swap to backup sensor', state: 'blocked', actor: 'crew', note: 'Waiting for step 2' },
          ]}
        />
      </div>
    );
  },
};

export const Escalation: S = {
  name: 'Flight surgeon escalation',
  render: () => {
    const pkg = {
      summary: 'Resting heart rate +15 bpm above baseline for 40 min; sleep below baseline 3 nights.',
      telemetryWindow: '13:50–14:30 UTC',
      evidence: ['Heart rate trend', 'Sleep log', 'NASTRA assessment (medium confidence)'],
    };
    const states: EscalationState[] = ['draft', 'sent', 'received', 'answered', 'failed'];
    return (
      <div className="sb-page" style={{ maxWidth: 820 }}>
        <p className="sb-note">Asynchronous by design: the ground loop can take seconds (Moon) to many minutes (Mars). Sent, received and answered are separate states (A18).</p>
        {states.map((s) => (
          <EscalationStatus
            key={s}
            state={s}
            package={pkg}
            priority={s === 'sent' ? 'high' : 'routine'}
            link={{ state: s === 'failed' ? 'disconnected' : 'connected', delayLabel: s === 'failed' ? undefined : 'RTT 6 s' }}
            times={{
              sent: s !== 'draft' && s !== 'failed' ? utc(minutesAgo(9)) : undefined,
              received: s === 'received' || s === 'answered' ? utc(minutesAgo(8)) : undefined,
              answered: s === 'answered' ? utc(minutesAgo(1)) : undefined,
            }}
            reply={s === 'answered' ? 'Thanks. Keep the protocol running and take a second reading in 30 minutes. — Flight surgeon (simulated)' : undefined}
            onSend={() => undefined}
            onRetry={() => undefined}
            onDismiss={() => undefined}
          />
        ))}
      </div>
    );
  },
};
