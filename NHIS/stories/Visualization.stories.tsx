import type { Meta, StoryObj } from '@storybook/react-vite';
import { TrendChart } from '../visualization/TrendChart';
import { BulletGraph } from '../visualization/BulletGraph';
import { EXAMPLE_LIMIT, FIXTURE_LABEL, HR_BASELINE, HR_NOMINAL, HR_RISING, HR_STALE, HR_WITH_GAP, NOW_ISO, minutesAgo, series } from './fixtures';
import './stories.css';

const meta: Meta = { title: 'Visualization' };
export default meta;
type S = StoryObj;

const base = { title: 'Resting heart rate', unit: 'bpm', now: NOW_ISO, baseline: HR_BASELINE, fixtureLabel: FIXTURE_LABEL };

export const LiveAndHistorical: S = {
  name: 'Live vs historical + baseline',
  render: () => (
    <div className="sb-page">
      <p className="sb-lede">Historical is thin and grey; live is heavier and white, labelled "Live". The baseline band is shaded with dotted edges. The current value sits at the right edge with its unit.</p>
      <TrendChart {...base} samples={HR_NOMINAL} liveFrom={minutesAgo(30)} />
    </div>
  ),
};

export const LimitsAndOutOfRange: S = {
  name: 'Limit line and out-of-range values',
  render: () => (
    <div className="sb-page">
      <p className="sb-lede">
        Out-of-range values get a shape (triangle = Caution limit, octagon = Warning limit) as well as colour, plus a labelled limit line naming its source (A25). The limit here is a
        fixture, not a medical threshold.
      </p>
      <TrendChart {...base} samples={series({ start: 66, drift: 0.14, noise: 3, seed: 21 })} liveFrom={minutesAgo(60)} limits={[EXAMPLE_LIMIT]} />
    </div>
  ),
};

export const GapsAndStale: S = {
  name: 'Gaps and stale data',
  render: () => (
    <div className="sb-page">
      <TrendChart {...base} samples={HR_WITH_GAP} liveFrom={minutesAgo(30)} />
      <TrendChart {...base} title="Resting heart rate (link lost)" samples={HR_STALE} quality="stale" />
    </div>
  ),
};

export const Paused: S = {
  name: 'Paused presentation (A31)',
  render: () => (
    <div className="sb-page">
      <p className="sb-lede">Pausing freezes the picture, not acquisition or alerting. The chart says "Paused · as of" so a frozen value never looks current.</p>
      <TrendChart {...base} samples={HR_RISING} liveFrom={minutesAgo(30)} pausedAt={{ iso: minutesAgo(3), system: 'UTC' }} />
    </div>
  ),
};

export const Bullet: S = {
  name: 'Bullet graph',
  render: () => (
    <div className="sb-page" style={{ maxWidth: 480 }}>
      <span className="sb-fixture">{FIXTURE_LABEL}</span>
      <BulletGraph label="Water intake today" unit="L" decimals={1} value={1.6} min={0} max={3.5} baseline={{ low: 2.0, high: 2.8 }} target={{ value: 2.5, label: 'Plan target (fixture)' }} />
      <BulletGraph label="Exercise minutes" unit="min" value={undefined} min={0} max={150} target={{ value: 120, label: 'Plan target (fixture)' }} />
    </div>
  ),
};
