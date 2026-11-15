'use client';
import { useRouter } from 'next/navigation';
import { AlertBanner, AlertList, Button, Disclosure, DataGapNotice, PatternCard, StatusMark, Time, VitalTile } from '@nastra/nhis';
import { ConversationWorkspace } from '../overview/ConversationWorkspace';
import { toNhisAlert, useStation } from '../station-context';

export function OverviewPage() {
  const router = useRouter();
  const { overview: o, error, ackAlert, suppressAlert, push } = useStation();
  if (!o) return <p className="st-empty" role="status">{error ? `Could not load health data: ${error}` : 'Loading…'}</p>;

  const active = o.alerts.filter((a) => a.active && a.priority !== 'warning');
  const tiles = [...o.tiles, o.sleep];
  const stale = tiles.filter((t) => t.quality === 'stale' || t.quality === 'unavailable');
  const c = o.context;

  return (
    <div className="st-overview">
      <h1 className="st-status" data-level={o.status.level}>
        {o.status.level !== 'nominal' && <StatusMark status={o.status.level} />}
        <span>{o.status.sentence}</span>
        <span className="st-status__time">Updated <Time value={{ iso: o.status.updatedAt, system: 'UTC' }} seconds={false} /></span>
      </h1>

      <div className="st-overview__conversation"><ConversationWorkspace /></div>

      <div className="st-overview__side">
        {active.slice(0, 1).map((a) => (
          <AlertBanner key={a.id} alert={toNhisAlert(a)}
            onAcknowledge={(x) => void ackAlert(x.id)} onSuppress={(x) => void suppressAlert(x.id)}
            onOpenProtocol={() => router.push('/protocol')}>
          </AlertBanner>
        ))}
        {active.length > 1 && (
          <Disclosure title={`${active.length - 1} more active alert${active.length > 2 ? 's' : ''}`}>
            <AlertList alerts={active.slice(1).map(toNhisAlert)} onAcknowledge={(x) => void ackAlert(x.id)} onSuppress={(x) => void suppressAlert(x.id)} onOpenProtocol={() => router.push('/protocol')} />
          </Disclosure>
        )}

        <section className="st-card" aria-label="Health snapshot">
          <h2 className="st-card__title">Health snapshot <span className="st-card__sub">vs your own baseline</span></h2>
          <div className="st-tiles">
            {tiles.map((t) => (
              <VitalTile key={t.key} label={t.label} unit={t.unit} decimals={t.decimals} value={t.value} samples={t.samples}
                baseline={t.baseline} status={t.status} quality={t.quality} origin={t.origin} ageMs={t.ageMs} trend={t.trend}
                now={o.asOf} />
            ))}
            <article className="st-stress" aria-label="Stress and mood">
              <h3 className="st-stress__label">Stress · mood</h3>
              {o.stress ? (
                <>
                  <p className="st-stress__value">{o.stress.label} <span>stress</span></p>
                  <p className="st-hint">Self-reported <Time value={{ iso: o.stress.at, system: 'UTC' }} seconds={false} />. Not measured.</p>
                </>
              ) : <p className="st-hint">No check-in yet.</p>}
              {!o.checkIn.doneToday && (
                <Button size="compact" intent="secondary" onPress={() => push({ id: `ci-${Date.now()}`, at: new Date().toISOString(), role: 'system', kind: 'checkin' })}>Daily check-in</Button>
              )}
            </article>
          </div>
          {stale.length > 0 && <DataGapNotice title="Some readings are not current" missing={stale.map((s) => s.label)} consequence="NASTRA will say so when it uses them." />}
        </section>

        {o.pattern && (
          <PatternCard pattern={o.pattern.pattern} records={o.pattern.records} window={o.pattern.window}
            interpretation="Association, not causation. Past episodes do not make a current one safe." />
        )}

        {c && (
          <section className="st-card" aria-label="Today and mission context">
            <h2 className="st-card__title">Today <span className="st-card__sub">MET {String(c.metDay).padStart(3, '0')}</span></h2>
            <p className="st-text">{c.line}</p>
            {c.next.length > 0 && (
              <ul className="st-next">{c.next.map((e) => <li key={e.startsAt + e.title}><span className="nhis-num">{e.hoursUntil < 1 ? '<1' : e.hoursUntil.toFixed(1)} h</span> {e.title}</li>)}</ul>
            )}
            <p className="st-hint">{c.habitat} · simulated</p>
          </section>
        )}
      </div>
    </div>
  );
}
