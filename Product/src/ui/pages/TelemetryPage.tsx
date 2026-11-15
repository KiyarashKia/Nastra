'use client';
import { useState } from 'react';
import { DataGapNotice, DataQualityTag, Tab, TabList, TabPanel, Tabs, TelemetryReadout, TrendChart } from '@nastra/nhis';
import type { getTelemetry } from '@/nastra/station/read';
import { useApi } from '../useApi';
import { useFitHeight } from '../useFitHeight';

type T = Awaited<ReturnType<typeof getTelemetry>>;
const GROUPS = ['Cardiovascular', 'Respiratory', 'Sleep and activity', 'Environment'] as const;

export function TelemetryPage() {
  const { data, error } = useApi<T>('/api/telemetry');
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('Cardiovascular');
  const [metric, setMetric] = useState<string>('heart_rate_bpm');
  const plot = useFitHeight<HTMLDivElement>(280, 160, [metric, group, !!data]);
  if (!data) return <p className="st-empty" role="status">{error ? `Telemetry unavailable: ${error}` : 'Loading…'}</p>;

  type Ch = { key: string; label: string; unit: string; decimals: number; samples: { t: string; v: number | null }[]; baseline?: { low: number; high: number; reference?: number; label: string }; quality: 'live' | 'delayed' | 'stale' | 'unavailable'; ageMs?: number; source: string; value?: number };
  const vitals = data.vitals.map((v) => ({ ...v, value: [...v.samples].reverse().find((s) => s.v !== null)?.v ?? undefined })) as Ch[];
  const channels: Record<(typeof GROUPS)[number], Ch[]> = {
    Cardiovascular: vitals.filter((v) => (data.vitals.find((x) => x.key === v.key) as { group: string }).group === 'Cardiovascular'),
    Respiratory: vitals.filter((v) => (data.vitals.find((x) => x.key === v.key) as { group: string }).group === 'Respiratory'),
    'Sleep and activity': [{
      key: 'sleep', label: 'Sleep duration', unit: 'h', decimals: 1, samples: data.sleep.samples, baseline: data.sleep.baseline,
      quality: data.sleep.samples.length ? 'live' : 'unavailable', source: data.sleep.source, value: data.sleep.samples.at(-1)?.v ?? undefined,
    }],
    Environment: data.environment as Ch[],
  };
  const list = channels[group];
  const cur = list.find((c) => c.key === metric) ?? list[0];

  return (
    <div className="st-page st-page--fill">
      <h1 className="st-page__title">Telemetry <span className="st-card__sub">last {data.days} days · baselines are your own</span></h1>
      <Tabs selectedKey={group} onSelectionChange={(k) => { const g = String(k) as (typeof GROUPS)[number]; setGroup(g); setMetric(channels[g][0].key); }}>
        <TabList aria-label="Telemetry group">{GROUPS.map((g) => <Tab key={g} id={g}>{g}</Tab>)}</TabList>
      <TabPanel id={group}>
      <div className="st-telemetry">
        <nav className="st-metric-list" aria-label="Metrics">
          {list.map((c) => (
            <button key={c.key} type="button" className={`st-metric nhis-focus-ring${c.key === cur.key ? ' is-active' : ''}`} aria-pressed={c.key === cur.key} onClick={() => setMetric(c.key)}>
              <TelemetryReadout label={c.label} unit={c.unit} value={c.value} decimals={c.decimals} quality={c.quality} origin={c.key === 'sleep' ? 'estimated' : 'measured'} ageMs={c.ageMs} />
            </button>
          ))}
        </nav>
        <section className="st-card st-chart" aria-labelledby="st-chart-h">
          <h2 id="st-chart-h" className="nhis-visually-hidden">{cur.label} trend</h2>
          <div className="st-chart__plot" ref={plot.ref}>
            {cur.samples.some((s) => s.v !== null) ? (
              <TrendChart title={cur.label} unit={cur.unit} samples={cur.samples} now={data.asOf} baseline={cur.baseline} decimals={cur.decimals} quality={cur.quality} fixtureLabel="Simulated data" height={plot.height} width={plot.width} />
            ) : (
              <DataGapNotice title={`${cur.label}: no data`} missing={[cur.label]} consequence="NASTRA cannot compare this channel until readings arrive." />
            )}
          </div>
          <p className="st-hint">{cur.source}. Band: {cur.baseline?.label ?? 'no baseline yet'}. Bands are your own variation, not clinical limits.</p>
        </section>
        <section className="st-card st-latest" aria-label="Latest readings">
          <h2 className="st-card__title">Latest readings</h2>
          <div className="st-scroll" role="region" aria-label={`Latest ${cur.label} readings`} tabIndex={0}>
            <table className="st-table st-table--compact">
              <thead><tr><th scope="col">UTC</th><th scope="col" className="is-num">Value</th><th scope="col">Band</th></tr></thead>
              <tbody>
                {[...cur.samples].reverse().filter((s) => s.v !== null).slice(0, 24).map((s) => {
                  const b = cur.baseline;
                  const v = s.v as number;
                  const rel = !b ? 'No baseline' : v > b.high ? 'Above' : v < b.low ? 'Below' : 'Within';
                  return (
                    <tr key={s.t} className={rel === 'Above' || rel === 'Below' ? 'is-out' : undefined}>
                      <td className="nhis-num">{new Date(s.t).toISOString().slice(5, 16).replace('T', ' ')}</td>
                      <td className="nhis-num is-num">{v.toFixed(cur.decimals)} {cur.unit}</td>
                      <td>{rel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="st-latest__quality"><DataQualityTag quality={cur.quality} origin={cur.key === 'sleep' ? 'estimated' : 'measured'} ageMs={cur.ageMs} /></div>
        </section>
      </div>
      </TabPanel>
      </Tabs>
    </div>
  );
}
