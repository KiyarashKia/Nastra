import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataGapNotice, TelemetryReadout, VitalTile } from '../components/station/HealthData';
import { HR_BASELINE, HR_NOMINAL, HR_RISING, HR_STALE, NOW_ISO, SLEEP_BASELINE, series } from './fixtures';
import './stories.css';

const meta: Meta = { title: 'Station/Health data' };
export default meta;
type S = StoryObj;

const tile = { label: 'Resting heart rate', unit: 'bpm', baseline: HR_BASELINE, now: NOW_ISO };

export const VitalTileStates: S = {
  name: 'Vital tile states',
  render: () => (
    <div className="sb-page">
      <h1 className="sb-h1">Vital tile</h1>
      <p className="sb-lede">
        Four elements on every tile (A24): value with unit, sparkline, personal-baseline band, signed difference from baseline. Status is supplied by the assessment layer and shown by
        exception. Data quality is a separate mark.
      </p>
      <span className="sb-fixture">Simulated fixture — not live data</span>
      <div className="sb-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        <VitalTile {...tile} value={63} samples={HR_NOMINAL} trend="Steady" onInspect={() => undefined} />
        <VitalTile {...tile} value={79} samples={HR_RISING} status="caution" trend="Rising over 40 min" />
        <VitalTile {...tile} value={104} samples={HR_RISING} status="warning" trend="Rising" />
        <VitalTile {...tile} value={66} samples={HR_STALE} quality="stale" ageMs={25 * 60_000} />
        <VitalTile {...tile} value={undefined} samples={HR_STALE} quality="unavailable" ageMs={25 * 60_000} />
        <VitalTile {...tile} value={undefined} samples={[]} quality="unknown" />
        <VitalTile label="Sleep duration" unit="h" decimals={1} value={6.9} baseline={SLEEP_BASELINE} samples={series({ start: 6.8, noise: 0.5, every: 60, minutes: 14 * 60, decimals: 1 })} origin="manual-entry" trend="Entered by crew" now={NOW_ISO} />
        <VitalTile {...tile} label="Heart rate (backup sensor)" value={65} samples={HR_NOMINAL} origin="estimated" trend="Wrist sensor, estimated" />
        <VitalTile {...tile} label="Heart rate (no baseline yet)" baseline={undefined} value={67} samples={HR_NOMINAL} />
      </div>
    </div>
  ),
};

export const Readouts: S = {
  render: () => (
    <div className="sb-page" style={{ maxWidth: 520 }}>
      <h1 className="sb-h1">Telemetry readout</h1>
      <span className="sb-fixture">Simulated fixture — not live data</span>
      <TelemetryReadout label="SpO₂" unit="%" value={97} source="Finger sensor" />
      <TelemetryReadout label="Respiration" unit="/min" value={14} />
      <TelemetryReadout label="Skin temperature" unit="°C" value={34.6} decimals={1} status="caution" />
      <TelemetryReadout label="Core temperature" unit="°C" value={37.1} decimals={1} quality="delayed" ageMs={48_000} />
      <TelemetryReadout label="Blood pressure (sys)" unit="mmHg" value={118} origin="manual-entry" />
      <TelemetryReadout label="CO₂ exposure" unit="mmHg" value={undefined} quality="unavailable" />
    </div>
  ),
};

export const DataGap: S = {
  render: () => (
    <div className="sb-page" style={{ maxWidth: 720 }}>
      <DataGapNotice
        title="Sleep assessment is incomplete"
        missing={['No wrist-sensor data 02:10–04:40 UTC (sensor off)', 'No sleep diary entry for last night']}
        consequence="NASTRA has not assessed last night's sleep. Use your own judgement, or add a diary entry to complete it."
      />
    </div>
  ),
};
