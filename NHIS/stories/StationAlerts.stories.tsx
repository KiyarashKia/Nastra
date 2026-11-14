import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { AlertBanner, AlertCounts, AlertList, EmergencyAnnunciator, WarningDialog } from '../components/station/Alerts';
import { Button } from '../components/station/controls';
import { acknowledge, setAnnunciation } from '../semantics/rules';
import type { OperationalAlert } from '../semantics/model';
import { NHISProvider, type AnnunciationEvent } from '../components/shared/NHISProvider';
import { ADVISORY, AI_ASSIGNED_EMERGENCY, ALERT_LOG, CAUTION, EMERGENCY, WARNING } from './fixtures';
import './stories.css';

const meta: Meta = { title: 'Station/Alerts' };
export default meta;
type S = StoryObj;

function useAlert(initial: OperationalAlert) {
  const [a, setA] = useState(initial);
  return [a, { onAcknowledge: () => setA((x) => acknowledge(x)), onSuppress: () => setA((x) => setAnnunciation(x, 'suppressed')) }, setA] as const;
}

/** Shows the annunciation events NHIS emits. In production these drive the approved audio system. */
function AudioLog({ children }: { children: (log: (e: AnnunciationEvent) => void) => React.ReactNode }) {
  const [events, setEvents] = useState<string[]>([]);
  const log = (e: AnnunciationEvent) =>
    setEvents((all) => [`${e.type.toUpperCase()} ${e.priority} · ${e.audioId}${e.preAlert ? ' · pre-alert −10 dB' : ''}${e.reason ? ` · ${e.reason}` : ''}`, ...all].slice(0, 8));
  return (
    <NHISProvider onAnnunciation={log} style={{ background: 'transparent' }}>
      {children(log)}
      <p className="sb-label" style={{ marginTop: 16 }}>
        Audio channel (simulated event log — no tones are invented by NHIS)
      </p>
      <pre className="sb-log">{events.length ? events.join('\n') : 'No annunciation events.'}</pre>
    </NHISProvider>
  );
}

export const AdvisoryAndCaution: S = {
  name: 'Advisory and Caution',
  render: () => {
    const [adv, advActions] = useAlert(ADVISORY);
    const [cau, cauActions] = useAlert(CAUTION);
    return (
      <AudioLog>
        {() => (
          <div className="sb-page">
            <h1 className="sb-h1">Advisory and Caution</h1>
            <p className="sb-lede">Advisory is logged and visible in context. Caution is a persistent, non-modal banner with sound. Neither interrupts the task (A3).</p>
            <AlertBanner alert={adv} {...advActions} onOpenProtocol={() => undefined} />
            <AlertBanner alert={cau} {...cauActions} onOpenProtocol={() => undefined} />
            <AlertBanner alert={{ ...CAUTION, id: 'cau-cleared', active: false, acknowledgement: 'acknowledged', title: 'Heart rate trend above baseline (cleared)' }} onOpenProtocol={() => undefined} />
          </div>
        )}
      </AudioLog>
    );
  },
};

export const Warning: S = {
  render: () => {
    const [w, wActions] = useAlert(WARNING);
    const [open, setOpen] = useState(true);
    return (
      <AudioLog>
        {() => (
          <div className="sb-page">
            <h1 className="sb-h1">Warning</h1>
            <p className="sb-lede">
              The single interruptive health-assessment tier. Modal, cannot be dismissed by Escape or clicking outside; requires an action. The glyph flashes until acknowledged.
            </p>
            <Button onPress={() => setOpen(true)}>Show Warning dialog</Button>
            <WarningDialog
              alert={w}
              isOpen={open}
              {...wActions}
              onOpenProtocol={() => setOpen(false)}
              observations={
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>SpO₂ 89% for 4 min (finger sensor, live)</li>
                  <li>Heart rate 104 bpm, +40 vs baseline</li>
                </ul>
              }
            />
          </div>
        )}
      </AudioLog>
    );
  },
};

export const Emergency: S = {
  name: 'Emergency (authorized)',
  render: () => {
    const [e, eActions] = useAlert(EMERGENCY);
    return (
      <AudioLog>
        {() => (
          <div className="sb-page" style={{ paddingTop: 260 }}>
            <EmergencyAnnunciator alert={e} {...eActions} onOpenProtocol={() => undefined} />
            <p className="sb-lede">
              Asserted by an approved operational source (simulated). Distinct from Warning by label, filled double-octagon glyph, double ring, top layer, the asserting source shown first, and
              its own audio identifier.
            </p>
          </div>
        )}
      </AudioLog>
    );
  },
};

export const EmergencyRejected: S = {
  name: 'Emergency rejected (AI-assigned)',
  render: () => (
    <div className="sb-page">
      <h1 className="sb-h1">AI cannot assign Emergency</h1>
      <p className="sb-lede">The same component given an Emergency from health-assessment logic refuses to present it, and says why. It is not silently shown as Warning either.</p>
      <EmergencyAnnunciator alert={AI_ASSIGNED_EMERGENCY} />
    </div>
  ),
};

export const AlertManagement: S = {
  name: 'Alert list and audit',
  render: () => {
    const [alerts, setAlerts] = useState<OperationalAlert[]>(ALERT_LOG);
    const update = (id: string, fn: (a: OperationalAlert) => OperationalAlert) => setAlerts((all) => all.map((a) => (a.id === id ? fn(a) : a)));
    return (
      <div className="sb-page">
        <h1 className="sb-h1">Alert list</h1>
        <p className="sb-lede">Acknowledge, suppress (text kept, event logged) and inhibit (listed in the audit view). Counts stay visible. One action silences all audio (A5, A6).</p>
        <AlertCounts alerts={alerts} />
        <AlertList
          alerts={alerts}
          onAcknowledge={(a) => update(a.id, acknowledge)}
          onSuppress={(a) => update(a.id, (x) => setAnnunciation(x, 'suppressed'))}
          onInhibit={(a) => update(a.id, (x) => setAnnunciation(x, 'inhibited'))}
          onOpenProtocol={() => undefined}
        />
      </div>
    );
  },
};

export const LongTextAndCollision: S = {
  name: 'Long text and alert collision',
  render: () => (
    <div className="sb-page">
      <h1 className="sb-h1">Degraded fixtures: long text, simultaneous alerts</h1>
      <AlertBanner
        alert={{
          ...CAUTION,
          id: 'long',
          title: 'Heart rate trend above personal baseline during the sleep period, with intermittent sensor contact on the chest strap',
          detail:
            'Resting heart rate has stayed above your baseline band for 40 minutes. Two short gaps in the chest-strap signal were filled from the wrist sensor; those samples are marked as backup-source in the trend view.',
        }}
        onAcknowledge={() => undefined}
        onOpenProtocol={() => undefined}
      />
      <AlertBanner alert={{ ...ADVISORY, id: 'a2', title: 'Hydration log not entered today' }} onAcknowledge={() => undefined} />
      <AlertBanner alert={{ ...CAUTION, id: 'c2', title: 'Skin temperature above baseline', source: 'Wearable sensor' }} onAcknowledge={() => undefined} onOpenProtocol={() => undefined} />
    </div>
  ),
};
