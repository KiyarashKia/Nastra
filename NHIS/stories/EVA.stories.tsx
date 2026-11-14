import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import {
  BearingIndicator,
  ConsumableReadout,
  EVAAlertCue,
  EVAStatusStrip,
  EVAVisorSim,
  NASTRAResponseCue,
  ProtocolStepCue,
  VoiceCue,
  WristControlSim,
  type EVAStatusItem,
  type EVAVisorSimProps,
} from '../components/eva/EVA';
import { acknowledge } from '../semantics/rules';
import type { DeclutterLevel, OperationalAlert, VoiceState } from '../semantics/model';
import { CAUTION, EMERGENCY, WARNING, minutesAgo, utc } from './fixtures';
import './stories.css';

const meta: Meta<EVAVisorSimProps> = {
  title: 'EVA (simulation)',
  component: EVAVisorSim,
  argTypes: {
    lighting: { control: 'inline-radio', options: ['grazing', 'up-sun', 'shadow'] },
    rendering: { control: 'inline-radio', options: ['color', 'monochrome-green'] },
    declutter: { control: 'inline-radio', options: ['full', 'minimal'] },
    optics: { control: 'inline-radio', options: ['additive', 'opaque-plate'] },
    showGuides: { control: 'boolean' },
  },
  args: { lighting: 'grazing', rendering: 'color', declutter: 'full', optics: 'additive', showGuides: true },
};
export default meta;
type S = StoryObj<EVAVisorSimProps>;

/** Required suit parameters (NASA-STD-3001 §11 via NHIS B3) plus vitals by exception. Simulated values. */
const NOMINAL: EVAStatusItem[] = [
  { id: 'p', label: 'Suit P', value: 4.3, decimals: 1, unit: 'psi', status: 'in-range', quality: 'live', required: true },
  { id: 'o2', label: 'ppO2', value: 4.2, decimals: 1, unit: 'psi', status: 'in-range', quality: 'live', required: true },
  { id: 'co2', label: 'ppCO2', value: 2.1, decimals: 1, unit: 'mmHg', status: 'in-range', quality: 'live', required: true },
  { id: 'met', label: 'Met rate', value: 1180, unit: 'BTU/h', status: 'in-range', quality: 'live', required: true },
  { id: 'hr', label: 'HR', value: 96, unit: 'bpm', status: 'in-range', quality: 'live' },
];

const note = (
  <p className="sb-note" style={{ maxWidth: 960 }}>
    Simulation of a 37° diagonal see-through display centred on the line of sight. With a 10° clear zone, persistent content can only live in the two lateral bands. All values are
    simulated; positions and sizes are NHIS starting values for suited or analog testing, not flight limits.
  </p>
);

export const Nominal: S = {
  name: 'Nominal (quiet)',
  render: (args) => (
    <div className="sb-stack">
      <EVAVisorSim {...args}>
        <EVAStatusStrip items={NOMINAL} link={{ state: 'connected', dataAgeMs: 2000 }} />
        <ConsumableReadout consumable="O2" remainingMin={214} walkBackMin={38} status="in-range" walkBackSource="Nav estimate" />
      </EVAVisorSim>
      {note}
    </div>
  ),
};

export const DeclutterMinimal: S = {
  name: 'Declutter · minimal',
  args: { declutter: 'minimal' },
  render: (args) => (
    <div className="sb-stack">
      <EVAVisorSim {...args}>
        <EVAStatusStrip items={NOMINAL} link={{ state: 'connected', dataAgeMs: 2000 }} />
        <ConsumableReadout consumable="O2" remainingMin={214} walkBackMin={38} status="in-range" walkBackSource="Nav estimate" />
      </EVAVisorSim>
      <p className="sb-note">Minimal hides in-range items; anything out of range, trending or degraded stays. One press or "Show vitals" recalls everything (B13, B14).</p>
    </div>
  ),
};

export const CautionTrending: S = {
  name: 'Caution · trending vital',
  render: (args) => (
    <EVAVisorSim {...args}>
      <EVAStatusStrip items={NOMINAL.map((i) => (i.id === 'hr' ? { ...i, value: 148, status: 'trending' as const } : i))} link={{ state: 'connected', dataAgeMs: 2000 }} />
      <EVAAlertCue alert={{ ...CAUTION, id: 'eva-c', title: 'Heart rate trending high' }} cue="HR trending high" value="148 bpm" />
      <ConsumableReadout consumable="O2" remainingMin={190} walkBackMin={41} status="in-range" walkBackSource="Nav estimate" />
    </EVAVisorSim>
  ),
};

export const Warning: S = {
  render: (args) => {
    const [alert, setAlert] = useState<OperationalAlert>({ ...WARNING, id: 'eva-w', title: 'ppCO2 high', source: 'Suit monitor', origin: { kind: 'suit-system', sourceId: 'SUIT' } });
    return (
      <div className="sb-stack">
        <EVAVisorSim {...args}>
          <EVAStatusStrip items={NOMINAL.map((i) => (i.id === 'co2' ? { ...i, value: 7.6, status: 'out-of-range' as const } : i))} link={{ state: 'connected', dataAgeMs: 2000 }} />
          <EVAAlertCue alert={alert} cue="ppCO2 high" value="7.6 mmHg" />
          <ProtocolStepCue
            title="High CO2 response"
            duration="0:01 elapsed"
            steps={[
              { id: '1', title: 'Stop, hold position', state: 'current' },
              { id: '2', title: 'Increase fan setting', state: 'pending' },
              { id: '3', title: 'Report to IV crew', state: 'pending' },
            ]}
          />
          <ConsumableReadout consumable="O2" remainingMin={176} walkBackMin={44} status="in-range" walkBackSource="Nav estimate" />
        </EVAVisorSim>
        <WristControlSim onA={() => setAlert((a) => acknowledge(a))} onB={() => undefined} onDial={() => undefined} labels={{ a: 'Acknowledge', b: 'Recall', dial: 'Declutter' }} />
        <p className="sb-note">
          Outline ring at the clear-zone edge leaves terrain visible; the label chip sits in the right band within ±15°. Red appears only as a filled shape behind white text. Sound is
          required: see the audio events in Station/Alerts. The alert class is a fixture standing in for the suit's own caution and warning system.
        </p>
      </div>
    );
  },
};

export const Emergency: S = {
  name: 'Emergency (authorized)',
  render: (args) => (
    <EVAVisorSim {...args}>
      <EVAStatusStrip items={NOMINAL.map((i) => (i.id === 'p' ? { ...i, value: 3.1, status: 'out-of-range' as const } : i))} link={{ state: 'connected', dataAgeMs: 2000 }} />
      <EVAAlertCue
        alert={{
          ...EMERGENCY,
          id: 'eva-e',
          title: 'Suit pressure loss',
          source: 'Suit caution and warning',
          origin: { kind: 'suit-system', sourceId: 'SUIT-CW' },
          authorization: { kind: 'suit-system', sourceId: 'SUIT-CW', sourceName: 'Suit C&W', assertedAt: utc(minutesAgo(0)) },
          protocol: { id: 'EMER-SP-1', title: 'Suit pressure loss' },
        }}
        cue="Suit pressure loss"
        value="3.1 psi"
      />
    </EVAVisorSim>
  ),
};

export const Monochrome: S = {
  name: 'Monochrome-green review (B5)',
  args: { rendering: 'monochrome-green' },
  render: (args) => (
    <div className="sb-stack">
      <EVAVisorSim {...args}>
        <EVAStatusStrip items={NOMINAL.map((i) => (i.id === 'co2' ? { ...i, value: 7.6, status: 'out-of-range' as const } : i))} link={{ state: 'degraded', dataAgeMs: 9000 }} />
        <EVAAlertCue alert={{ ...WARNING, id: 'eva-w2', title: 'ppCO2 high' }} cue="ppCO2 high" value="7.6 mmHg" />
        <EVAAlertCue alert={{ ...CAUTION, id: 'eva-c2', title: 'HR trending high' }} cue="HR trending high" />
      </EVAVisorSim>
      <p className="sb-note">Priority with colour removed: shape (octagon vs triangle), outline box, position (near line of sight vs periphery), size and flashing still separate the classes.</p>
    </div>
  ),
};

export const UpSun: S = {
  name: 'Up-sun legibility check (B24)',
  args: { lighting: 'up-sun' },
  render: (args) => (
    <div className="sb-stack">
      <EVAVisorSim {...args}>
        <EVAStatusStrip items={NOMINAL} link={{ state: 'connected', dataAgeMs: 2000 }} recalled />
        <ConsumableReadout consumable="O2" remainingMin={214} walkBackMin={38} status="in-range" walkBackSource="Nav estimate" />
      </EVAVisorSim>
      <p className="sb-note">
        Additive optics against a sunlit surface: overlay contrast collapses, and backing plates cannot darken the scene. This screen is an illustration, not a measurement. Required
        see-through contrast is unresolved (validation/unresolved-decisions.md).
      </p>
    </div>
  ),
};

export const DegradedData: S = {
  name: 'Stale data and lost link (B8, B33)',
  render: (args) => (
    <EVAVisorSim {...args}>
      <EVAStatusStrip
        items={NOMINAL.map((i) => (i.id === 'hr' ? { ...i, quality: 'stale' as const, ageMs: 95_000 } : i.id === 'met' ? { ...i, quality: 'unavailable' as const, value: undefined } : i))}
        link={{ state: 'disconnected', dataAgeMs: 95_000 }}
      />
      <ConsumableReadout consumable="O2" remainingMin={190} walkBackMin={41} status="in-range" walkBackSource="Last nav fix" quality="delayed" />
      <NASTRAResponseCue kind="ai-unavailable" text="" />
    </EVAVisorSim>
  ),
};

export const VoiceStates: S = {
  name: 'Voice grammar and fallback (B30)',
  render: (args) => {
    const states: VoiceState[] = ['listening', 'read-back', 'executed', 'not-understood', 'unavailable'];
    const [i, setI] = useState(1);
    return (
      <div className="sb-stack">
        <EVAVisorSim {...args}>
          <VoiceCue state={states[i]!} heard="Increase fan setting" result="Fan setting increased" />
          <EVAStatusStrip items={NOMINAL} link={{ state: 'connected', dataAgeMs: 2000 }} />
        </EVAVisorSim>
        <div className="sb-row">
          {states.map((s, j) => (
            <button key={s} type="button" className={`nhis-button nhis-button--compact nhis-button--${j === i ? 'primary' : 'secondary'}`} onClick={() => setI(j)}>
              {s}
            </button>
          ))}
        </div>
        <p className="sb-note">State-changing commands are read back and confirmed by voice or button A. Alert acknowledgement is one word or one press, no read-back. Show/hide executes at once.</p>
      </div>
    );
  },
};

export const AIResponse: S = {
  name: 'NASTRA response cue (B16)',
  render: (args) => (
    <EVAVisorSim {...args}>
      <NASTRAResponseCue text="HR elevated with exertion. Suit values in range." visibleForMs={600000} />
      <EVAStatusStrip items={NOMINAL} link={{ state: 'connected', dataAgeMs: 2000 }} />
    </EVAVisorSim>
  ),
};

export const Navigation: S = {
  name: 'Navigation: marker and unregistered fallback (B9–B11)',
  render: (args) => (
    <div className="sb-stack">
      <EVAVisorSim {...args}>
        <BearingIndicator label="Rover" bearingDeg={6} distanceM={420} registered />
      </EVAVisorSim>
      <EVAVisorSim {...args}>
        <BearingIndicator label="Rover" bearingDeg={58} distanceM={1350} registered={false} />
      </EVAVisorSim>
      <p className="sb-note">Top: world-locked marker (needs registration the baseline display may not have). Bottom: edge-anchored fallback with numeric distance, away from corners. No corridor graphics.</p>
    </div>
  ),
};

export const Interactive: S = {
  name: 'Interactive: wrist control + declutter + recall',
  render: (args) => {
    const [declutter, setDeclutter] = useState<DeclutterLevel>('minimal');
    const [recalled, setRecalled] = useState(false);
    const [alert, setAlert] = useState<OperationalAlert>({ ...CAUTION, id: 'eva-ci', title: 'HR trending high' });
    return (
      <div className="sb-stack">
        <EVAVisorSim {...args} declutter={declutter}>
          <EVAStatusStrip items={NOMINAL.map((i) => (i.id === 'hr' ? { ...i, value: 151, status: 'trending' as const } : i))} link={{ state: 'connected', dataAgeMs: 2000 }} recalled={recalled} />
          {alert.acknowledgement === 'unacknowledged' && <EVAAlertCue alert={alert} cue="HR trending high" value="151 bpm" />}
          <ConsumableReadout consumable="O2" remainingMin={188} walkBackMin={42} status="in-range" walkBackSource="Nav estimate" />
        </EVAVisorSim>
        <WristControlSim
          onA={() => setAlert((a) => acknowledge(a))}
          onB={() => setRecalled((r) => !r)}
          onDial={() => setDeclutter((d) => (d === 'full' ? 'minimal' : 'full'))}
          labels={{ a: 'Acknowledge', b: recalled ? 'Hide vitals' : 'Recall vitals', dial: `Declutter: ${declutter}` }}
        />
        <p className="sb-note">Hover a lowlighted row to simulate gaze dwell: a progress line runs for 600 ms and the value is revealed, then hidden on leave. Gaze never commits an action (B31).</p>
      </div>
    );
  },
};
