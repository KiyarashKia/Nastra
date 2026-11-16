'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button, ChoiceGroup, EscalationStatus, MissionHeader, NHISProvider, StationFrame, TextField, WarningDialog } from '@nastra/nhis';
import { StationProvider, toNhisAlert, useStation } from './station-context';
import { NavIcon, type NavKey } from './icons';

const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: 'overview', href: '/station/overview', label: 'Overview' },
  { key: 'telemetry', href: '/station/telemetry', label: 'Telemetry' },
  { key: 'history', href: '/station/history', label: 'History' },
  { key: 'protocol', href: '/station/protocol', label: 'Protocol' },
];

export function StationShell({ children }: { children: ReactNode }) {
  return (
    <NHISProvider>
      <StationProvider>
        <ShellInner>{children}</ShellInner>
      </StationProvider>
    </NHISProvider>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const { status, overview, error, ackAlert, reseed } = useStation();
  const pathname = usePathname();
  const router = useRouter();
  const [now, setNow] = useState<string | null>(null);
  const [escalationOpen, setEscalationOpen] = useState(false);

  useEffect(() => {
    setNow(new Date().toISOString());
    const t = setInterval(() => setNow(new Date().toISOString()), 15_000);
    return () => clearInterval(t);
  }, []);

  const alerts = useMemo(() => (overview?.alerts ?? []).map(toNhisAlert), [overview]);
  const warning = alerts.find((a) => a.priority === 'warning' && a.active && a.acknowledgement === 'unacknowledged');
  const mode = status?.mode ?? 'simulation';
  const esc = overview?.escalation;

  return (
    <StationFrame mode={mode}>
      <div className="st-shell">
        {status && now ? (
          <MissionHeader
            crewMember={{ name: status.profile.name, role: `${status.profile.role} · ${status.profile.agency}` }}
            mode={mode}
            logo={<img src="/nastra-logo.svg" alt="NASTRA" />}
            clocks={[{ iso: now, system: 'UTC' }, { iso: now, system: 'MET', missionEpochIso: status.profile.launchAt }]}
            link={{ state: 'connected', delayLabel: status.linkDelayLabel }}
            alerts={alerts}
            escalation={{ state: esc?.state ?? 'draft', recipient: esc && esc.state !== 'draft' ? esc.target : 'flight_surgeon', onEscalate: () => setEscalationOpen(true) }}
            onOpenAlerts={() => router.push('/station/history?view=alerts')}
          />
        ) : (
          <header className="st-header-placeholder" aria-busy="true">
            <img src="/nastra-logo.svg" alt="NASTRA" height={28} />
            <span>{error ? `Station data unavailable: ${error}` : 'Connecting to NASTRA…'}</span>
          </header>
        )}

        <nav className="st-nav" aria-label="Station sections">
          {NAV.map((n) => {
            const active = pathname?.startsWith(n.href);
            return (
              <Link key={n.key} href={n.href} className={`st-nav__item nhis-focus-ring${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
                <NavIcon name={n.key} />
                <span>{n.label}</span>
              </Link>
            );
          })}
          <Link href="/" className="st-nav__item st-nav__modes nhis-focus-ring" aria-label="Modes: back to mode select">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="3" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/><rect x="11" y="3" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/><rect x="3" y="11" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/><rect x="11" y="11" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/></svg>
            <span>Modes</span>
          </Link>
        </nav>

        <main className="st-main">{children}</main>

        <footer className="st-footer">
          {mode !== 'live' && <span className="st-footer__sim">Simulated data — not live</span>}
          <span title="Knowledge: NASA HRP Risks of Human Spaceflight (6 risk pages) · Data model after NASA Standard Measures and CSA Bio-Monitor channels · Logging after NASA-STD-3001 Vol. 1">
            Knowledge: NASA HRP Risks of Human Spaceflight (6 risk pages) · Data model after NASA Standard Measures and CSA Bio-Monitor channels · Logging after NASA-STD-3001 Vol. 1
          </span>
          {status && (
            <span className="st-footer__tech">
              {status.llmKind === 'stub' ? 'Model: offline stub (dev only)' : `Model: ${status.model}`} · Data: {status.dbKind === 'pglite' ? 'offline in-memory' : 'Supabase'} · Knowledge ranking: {status.knowledgeRanking}
            </span>
          )}
          {status?.demoControls && (
            <button type="button" className="st-footer__demo nhis-focus-ring" onClick={() => { if (confirm('Reset simulated data to now? Live chats are archived first.')) void reseed(); }}>
              Reset demo data
            </button>
          )}
        </footer>
      </div>

      {warning && (
        <WarningDialog
          alert={warning}
          isOpen
          observations={<p className="st-dialog-text">{overview?.escalation.state !== 'draft' ? `Handover sent: ${overview?.escalation.headline ?? 'flight surgeon alerted'}.` : 'Flight surgeon alert pending.'}</p>}
          onAcknowledge={(a) => void ackAlert(a.id)}
          onOpenProtocol={(a) => { void ackAlert(a.id); router.push('/station/protocol'); }}
        />
      )}
      <EscalationPanel isOpen={escalationOpen} onClose={() => setEscalationOpen(false)} />
    </StationFrame>
  );
}

/** Persistent Escalate control (NHIS A18): choose who, preview the package, send. */
function EscalationPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { overview, status, escalate, eventId } = useStation();
  const [target, setTarget] = useState<'flight_surgeon' | 'crew_medical_officer'>('flight_surgeon');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const esc = overview?.escalation;
  const state = sending ? 'sending' : err ? 'failed' : esc && esc.state !== 'draft' ? esc.state : 'draft';
  const flagged = overview?.tiles.filter((t) => t.status !== 'nominal').map((t) => t.label) ?? [];

  const doSend = async () => {
    setSending(true);
    setErr(null);
    try {
      await escalate(target, note.trim() || undefined);
      setNote('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalOverlay className="nhis-modal-overlay" isOpen={isOpen} onOpenChange={(o) => !o && onClose()} isDismissable>
      <Modal className="nhis-modal st-escalation-modal">
        <Dialog className="nhis-dialog">
          <Heading slot="title" className="st-dialog-title">Escalate</Heading>
          <p className="st-dialog-text">NASTRA sends a handover built from your data: what you reported, the readings that stand out, and the conversation so far.</p>
          {state === 'draft' && (
            <>
              <ChoiceGroup
                label="Send to"
                presentation="chips"
                value={target}
                onChange={(v) => setTarget(v as typeof target)}
                options={[{ id: 'flight_surgeon', label: 'Flight surgeon (ground)' }, { id: 'crew_medical_officer', label: 'Crew medical officer (onboard)' }]}
              />
              <TextField label="Add a note (optional)" value={note} onChange={setNote} multiline placeholder="What do you want them to know?" />
            </>
          )}
          <EscalationStatus
            state={state}
            recipient={esc && esc.state !== 'draft' && !sending && !err ? esc.target : target}
            priority={overview?.alerts.some((a) => a.priority === 'warning' && a.active) ? 'high' : 'routine'}
            package={{
              summary: eventId ? 'Open health event with its full conversation' : overview?.status.sentence ?? 'Current health status',
              telemetryWindow: 'Last 30 min vitals vs your baseline; last 3 nights of sleep',
              evidence: ['Vitals', 'Sleep', 'Latest check-in', 'Mission context', ...(flagged.length ? [`Flagged: ${flagged.join(', ')}`] : [])],
            }}
            times={{
              ...(esc?.state !== 'draft' && esc?.sentAt ? { sent: { iso: esc.sentAt, system: 'UTC' as const } } : {}),
              ...(esc?.state !== 'draft' && esc?.receivedAt ? { received: { iso: esc.receivedAt, system: 'UTC' as const } } : {}),
            }}
            link={{ state: 'connected', delayLabel: status?.linkDelayLabel }}
            reply={esc?.state === 'answered' ? esc.reply ?? undefined : undefined}
            onSend={() => void doSend()}
            onRetry={() => void doSend()}
          />
          {esc && esc.state === 'received' && esc.receiptSimulated && <p className="st-hint">Receipt simulated: one link round trip after sending ({status?.linkDelayLabel ?? 'RTT'}). A real acknowledgement from the ground console replaces it.</p>}
          {err && <p className="st-dialog-text" role="alert">Not sent: {err}. Use the voice loop if this is urgent.</p>}
          <div className="nhis-dialog__actions">
            <Button intent="quiet" onPress={onClose}>Close</Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
