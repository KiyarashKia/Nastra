import type { Meta, StoryObj } from '@storybook/react-vite';
import { MissionHeader, StationFrame } from '../components/station/MissionHeader';
import { AlertBanner } from '../components/station/Alerts';
import { VitalTile } from '../components/station/HealthData';
import { AIAssessment } from '../components/station/AI';
import { TrendChart } from '../visualization/TrendChart';
import { EVAAlertCue, EVAStatusStrip, EVAVisorSim } from '../components/eva/EVA';
import type { OperatingMode } from '../semantics/model';
import { ALERT_LOG, CAUTION, CREW, FIXTURE_LABEL, HR_BASELINE, HR_NOMINAL, HR_RISING, MISSION_EPOCH, NOW_ISO, SPO2_SERIES, minutesAgo, series, utc } from './fixtures';
import './stories.css';

const meta: Meta = { title: 'Patterns', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const logo = <img src="/assets/brand/Logo_NASTRA.svg" alt="NASTRA logo" />;

function Overview({ mode }: { mode: OperatingMode }) {
  return (
    <StationFrame mode={mode}>
      <MissionHeader
        crewMember={CREW}
        mode={mode}
        logo={logo}
        clocks={[utc(NOW_ISO), { iso: NOW_ISO, system: 'MET', missionEpochIso: MISSION_EPOCH }]}
        link={{ state: 'connected', delayLabel: 'RTT 6 s' }}
        alerts={ALERT_LOG}
        escalation={{ state: 'draft', onEscalate: () => undefined }}
        onOpenAlerts={() => undefined}
      />
      <main className="pat-overview">
        <div className="pat-overview__left">
          <section className="pat-overview__state" aria-label="Current state">
            <h1 className="pat-overview__h1">Current state</h1>
            <p className="pat-overview__summary">1 Caution active · other vitals within your baseline</p>
            <span className="sb-fixture">{FIXTURE_LABEL}</span>
          </section>
          <AlertBanner alert={CAUTION} onAcknowledge={() => undefined} onOpenProtocol={() => undefined} />
          <div className="pat-overview__vitals">
            <VitalTile label="Resting heart rate" unit="bpm" value={79} samples={HR_RISING} baseline={HR_BASELINE} status="caution" trend="Rising 40 min" now={NOW_ISO} />
            <VitalTile label="SpO₂" unit="%" value={97} samples={SPO2_SERIES} baseline={{ low: 95, high: 99, label: 'Baseline' }} trend="Steady" now={NOW_ISO} />
            <VitalTile label="Sleep last night" unit="h" decimals={1} value={5.6} samples={series({ start: 6.4, drift: -0.002, noise: 0.4, every: 60, minutes: 14 * 60, decimals: 1 })} baseline={{ low: 6.2, high: 7.4, reference: 6.8, label: 'Baseline' }} status="advisory" origin="manual-entry" now={NOW_ISO} />
          </div>
          <p className="pat-overview__more">Secondary readouts, history and raw records are one step away (progressive disclosure, A26).</p>
        </div>
        <div className="pat-overview__ai">
          <AIAssessment
            title="Heart rate above personal baseline"
            generatedAt={utc(minutesAgo(2))}
            observations={[
              { text: 'Resting heart rate +15 bpm vs median, for 40 min.', category: 'measured' },
              { text: 'Sleep below baseline 3 nights running.', category: 'measured' },
            ]}
            assessment="Consistent with reduced sleep and today's workload."
            confidence={{ level: 'medium', meaning: 'Skin temperature unreliable for this window.', nextAction: 'Tell NASTRA how you feel.' }}
            evidence={{ signals: [], gaps: ['Skin temperature unreliable'] }}
            onCorrect={() => undefined}
            onDismiss={() => undefined}
          />
        </div>
      </main>
    </StationFrame>
  );
}

export const StationOverview: S = {
  name: 'Station overview (1280 × 800, no scroll)',
  parameters: { viewport: { defaultViewport: 'responsive' } },
  render: () => (
    <div style={{ width: 1280, height: 800, overflow: 'hidden', border: '1px solid #2D3136', margin: -24 }}>
      <Overview mode="live" />
    </div>
  ),
};

export const SimulationMode: S = {
  name: 'Same overview in simulation mode (A9)',
  render: () => (
    <div style={{ width: 1280, height: 800, overflow: 'hidden', margin: -24 }}>
      <Overview mode="simulation" />
    </div>
  ),
};

export const SameEventTwoSurfaces: S = {
  name: 'One event, two surfaces (02 §12)',
  render: () => (
    <div className="sb-page" style={{ maxWidth: 1240 }}>
      <h1 className="sb-h1">Heart-rate deviation: Station explains, EVA abbreviates</h1>
      <p className="sb-lede">Same semantic event and class. Station shows value, baseline, trend, history, AI observation and evidence. EVA shows only what needs attention now.</p>
      <div className="sb-cols" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="sb-stack">
          <p className="sb-label">NASTRA Station</p>
          <AlertBanner alert={CAUTION} onOpenProtocol={() => undefined} />
          <TrendChart title="Resting heart rate" unit="bpm" samples={HR_RISING} now={NOW_ISO} liveFrom={minutesAgo(40)} baseline={HR_BASELINE} fixtureLabel={FIXTURE_LABEL} />
        </div>
        <div className="sb-stack">
          <p className="sb-label">NASTRA EVA (simulation)</p>
          <EVAVisorSim width={600} showGuides={false}>
            <EVAStatusStrip
              items={[
                { id: 'hr', label: 'HR', value: 124, unit: 'bpm', status: 'trending', quality: 'live' },
                { id: 'p', label: 'Suit P', value: 4.3, decimals: 1, unit: 'psi', status: 'in-range', quality: 'live' },
              ]}
              link={{ state: 'connected', dataAgeMs: 2000 }}
            />
            <EVAAlertCue alert={{ ...CAUTION, id: 'eva-same' }} cue="HR trending high" value="124 bpm" />
          </EVAVisorSim>
          <p className="sb-note">"Details" by voice defers depth to Station.</p>
        </div>
      </div>
    </div>
  ),
};

export const DataDegradation: S = {
  name: 'Data degradation across a view',
  render: () => (
    <div className="sb-page">
      <h1 className="sb-h1">Link lost: what changes</h1>
      <p className="sb-lede">Last values stay readable with age; trend tails hatch; AI says it is working from old data; alerts keep evaluating on the suit/vehicle side.</p>
      <div className="sb-cols">
        <VitalTile label="Resting heart rate" unit="bpm" value={71} samples={series({ start: 66, noise: 3, seed: 2, endMinutesAgo: 18 })} baseline={HR_BASELINE} quality="stale" ageMs={18 * 60_000} now={NOW_ISO} />
        <VitalTile label="SpO₂" unit="%" value={undefined} samples={[]} quality="unavailable" now={NOW_ISO} />
      </div>
      <TrendChart title="Resting heart rate" unit="bpm" samples={series({ start: 66, noise: 3, seed: 2, endMinutesAgo: 18 })} now={NOW_ISO} baseline={HR_BASELINE} quality="stale" fixtureLabel={FIXTURE_LABEL} />
    </div>
  ),
};

export const NominalQuiet: S = {
  name: 'Nominal monitoring (quiet)',
  render: () => (
    <div className="sb-page">
      <p className="sb-lede">Nominal: no colour, no motion, no banners. Tiles say "within baseline" in plain text.</p>
      <div className="sb-cols">
        <VitalTile label="Resting heart rate" unit="bpm" value={63} samples={HR_NOMINAL} baseline={HR_BASELINE} trend="Steady" now={NOW_ISO} />
        <VitalTile label="SpO₂" unit="%" value={97} samples={SPO2_SERIES} baseline={{ low: 95, high: 99, label: 'Baseline' }} trend="Steady" now={NOW_ISO} />
      </div>
    </div>
  ),
};
