'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { AlertList, Disclosure, EvidenceTag, Tab, TabList, Tabs, Time } from '@nastra/nhis';
import type { getHistory } from '@/nastra/station/read';
import { useApi } from '../useApi';
import { toNhisAlert } from '../station-context';

type H = Awaited<ReturnType<typeof getHistory>>;
const VIEWS = [['events', 'Events'], ['patterns', 'Patterns'], ['checkins', 'Check-ins'], ['alerts', 'Alerts']] as const;
const FILTERS = [['all', 'All'], ['physical', 'Physical'], ['psychological', 'Psychological'], ['data', 'Data requests']] as const;
const CONTEXT: Record<string, string> = { post_exercise: 'after exercise', post_eva: 'after EVA', pre_eva: 'before EVA', habitat: 'in habitat', exercise: 'during exercise', sleep: 'during sleep', eva: 'during EVA' };

export function HistoryPage() { return <Suspense fallback={null}><Inner /></Suspense>; }

function Inner() {
  const params = useSearchParams();
  const { data, error } = useApi<H>('/api/history');
  const [view, setView] = useState<string>(params.get('view') ?? 'events');
  const [filter, setFilter] = useState<string>('all');
  const [src, setSrc] = useState<'all' | 'live'>('all');
  const events = useMemo(() => (data?.events ?? []).filter((e) => (filter === 'all' || e.category === filter) && (src === 'all' || e.origin === 'live')), [data, filter, src]);
  if (!data) return <p className="st-empty" role="status">{error ? `History unavailable: ${error}` : 'Loading…'}</p>;

  return (
    <div className="st-page">
      <h1 className="st-page__title">History <span className="st-card__sub">your health record as NASTRA holds it</span></h1>
      <Tabs selectedKey={view} onSelectionChange={(k) => setView(String(k))}>
        <TabList aria-label="History view">{VIEWS.map(([id, t]) => <Tab key={id} id={id}>{t}</Tab>)}</TabList>
      </Tabs>

      {view === 'events' && (
        <>
          <div className="st-filters" role="group" aria-label="Filter events">
            {FILTERS.map(([id, t]) => <button key={id} type="button" className={`st-chip nhis-focus-ring${filter === id ? ' is-active' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{t}</button>)}
            <span className="st-filters__sep" />
            <button type="button" className={`st-chip nhis-focus-ring${src === 'live' ? ' is-active' : ''}`} aria-pressed={src === 'live'} onClick={() => setSrc(src === 'live' ? 'all' : 'live')}>Recorded in this session only</button>
          </div>
          {!events.length && <p className="st-empty">No events match.</p>}
          <ul className="st-events">
            {events.map((e) => (
              <li key={e.id} className="st-event-row">
                <div className="st-event-row__head">
                  <Time value={{ iso: e.at, system: 'UTC' }} seconds={false} />
                  <strong>{e.title || 'Untitled event'}</strong>
                  <span className="st-tag">{e.origin === 'live' ? 'Recorded' : 'Simulated history'}</span>
                  {e.protocol && <span className="st-tag">{e.protocol.code}</span>}
                  <span className="st-tag">{e.status.replace('_', ' ')}</span>
                </div>
                <p className="st-hint">
                  {e.missionContext ? `Context: ${CONTEXT[e.missionContext] ?? e.missionContext}` : 'Context not recorded'}
                  {e.bodySystems.length ? ` · ${e.bodySystems.join(', ').replace(/_/g, ' ')}` : ''}
                  {e.outcome ? ` · outcome: ${e.outcome.replace(/_/g, ' ')}` : ''}
                </p>
                {(e.summary || e.notes) && <Disclosure title="Details"><p className="st-text">{e.summary}</p>{e.notes && <p className="st-hint">Notes: {e.notes}</p>}</Disclosure>}
              </li>
            ))}
          </ul>
        </>
      )}

      {view === 'patterns' && (
        <div className="st-stack">
          {!data.patternGroups.length && <p className="st-empty">No repeated pattern in your record yet.</p>}
          {data.patternGroups.map((g) => (
            <section key={g.label} className="st-card">
              <h2 className="st-card__title"><EvidenceTag category="derived" /> {g.label} <span className="st-card__sub">{g.count} events</span></h2>
              <ul className="st-events">
                {data.events.filter((e) => g.eventIds.includes(e.id)).map((e) => <li key={e.id} className="st-hint"><Time value={{ iso: e.at, system: 'UTC' }} seconds={false} /> · {e.title}{e.outcome ? ` · ${e.outcome.replace(/_/g, ' ')}` : ''}</li>)}
              </ul>
              <p className="st-hint">{g.note}</p>
            </section>
          ))}
        </div>
      )}

      {view === 'checkins' && (
        <table className="st-table">
          <caption className="st-hint">Self-reported, 1 (low) to 5 (high). Never inferred from voice or face.</caption>
          <thead><tr><th>Time (UTC)</th><th>Mood</th><th>Stress</th><th>Fatigue</th><th>Note</th></tr></thead>
          <tbody>
            {data.checkIns.map((c) => (
              <tr key={c.at}><td className="nhis-num">{new Date(c.at).toISOString().slice(5, 16).replace('T', ' ')}</td><td className="nhis-num">{c.mood}</td><td className="nhis-num">{c.stress}</td><td className="nhis-num">{c.fatigue}</td><td>{c.note ?? ''}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      {view === 'alerts' && (data.alerts.length ? <AlertList alerts={data.alerts.map(toNhisAlert)} /> : <p className="st-empty">No alerts recorded.</p>)}
    </div>
  );
}
