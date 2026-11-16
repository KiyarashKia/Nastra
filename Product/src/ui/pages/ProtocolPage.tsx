'use client';
import { useRouter } from 'next/navigation';
import { Button, EscalationStatus, ProtocolStepper, Time } from '@nastra/nhis';
import type { getProtocolView } from '@/nastra/station/read';
import { Stamp } from '../Stamp';
import { useApi } from '../useApi';
import { useStation } from '../station-context';

type P = Awaited<ReturnType<typeof getProtocolView>>;

export function ProtocolPage() {
  const router = useRouter();
  const { data, error } = useApi<P>('/api/protocol', 10_000);
  const { escalate, status, refresh, overview } = useStation();
  if (!data) return <p className="st-empty" role="status">{error ? `Protocol unavailable: ${error}` : 'Loading…'}</p>;
  const a = data.active;
  // Shared escalation state: refreshed on time when the simulated receipt is due.
  const esc = overview?.escalation ?? data.escalation;

  return (
    <div className="st-page st-page--fill">
      <h1 className="st-page__title">Protocol <span className="st-card__sub">Protocol engine controls workflow. NASTRA AI assists interpretation and communication.</span></h1>
      {!a ? (
        <section className="st-card st-fill-none">
          <p className="st-text">No protocol is active. If something feels off, tell NASTRA on the Overview and the right protocol starts from your report.</p>
          <Button intent="secondary" onPress={() => router.push('/overview')}>Go to Overview</Button>
        </section>
      ) : (
        <div className="st-protocol st-fill">
          <section aria-labelledby="st-active-protocol">
            <h2 id="st-active-protocol" className="st-sr-only">Active protocol</h2>
            <ProtocolStepper title={a.title} protocolId={a.code} state={a.state === 'completed' ? 'completed' : 'active'}
              steps={a.steps.map((s) => ({ id: s.id, title: s.title, detail: s.detail, state: s.state, actor: s.actor as 'crew' | 'nastra' | 'ground' | 'system' }))} />
            <p className="st-hint">Started <Time value={{ iso: a.startedAt, system: 'UTC' }} seconds={false} /> · {a.done} of {a.steps.length} steps done · protocol {a.code} v{a.version} ({a.status})</p>
            <details className="st-sources"><summary>Why this protocol: sources</summary>
              <ul>{a.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></li>)}</ul>
            </details>
          </section>
          <aside className="st-protocol__side">
            <section className="st-card">
              <h2 className="st-card__title">Crew medical officer</h2>
              <p className="st-hint">Onboard. Notify for hands-on help.</p>
              <Button intent="secondary" onPress={() => void escalate('crew_medical_officer').then(refresh)}>Notify crew medical officer</Button>
            </section>
            <EscalationStatus state={esc.state} package={{ summary: esc.state === 'draft' ? a.utterance || a.title : esc.headline ?? a.title, telemetryWindow: 'Last 30 min vitals vs your baseline; last 3 nights of sleep', evidence: ['Conversation', 'Vitals', 'Sleep', 'Check-in', 'Mission context'] }}
              times={esc.state !== 'draft' ? { sent: { iso: esc.sentAt!, system: 'UTC' as const }, ...(esc.receivedAt ? { received: { iso: esc.receivedAt, system: 'UTC' as const } } : {}) } : undefined}
              link={{ state: 'connected', delayLabel: status?.linkDelayLabel }} reply={esc.state !== 'draft' ? esc.reply ?? undefined : undefined}
              recipient={esc.state !== 'draft' ? esc.target : 'flight_surgeon'}
              onSend={() => void escalate('flight_surgeon').then(refresh)} />
          </aside>
        </div>
      )}
      {data.previous.length > 0 && (
        <section className="st-card">
          <h2 className="st-card__title">Previous protocols</h2>
          <ul className="st-events">
            {data.previous.map((p) => <li key={p.eventId} className="st-hint"><Stamp iso={p.at} /> · {p.code} {p.title} · {p.status.replace('_', ' ')}{p.outcome && p.outcome.replace(/_/g, ' ') !== p.status.replace('_', ' ') ? ` · ${p.outcome.replace(/_/g, ' ')}` : ''}{p.origin !== 'live' ? ' · simulated history' : ''}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
