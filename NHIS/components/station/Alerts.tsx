/**
 * NHIS alert family for Station. One semantic input (`OperationalAlert`),
 * presentation resolved from its class (03 §19). Product code never styles alerts.
 *
 *   Advisory  → logged + visible in context (AlertBanner, tone="log")
 *   Caution   → persistent non-modal banner in context (AlertBanner)
 *   Warning   → the single interruptive health-assessment tier (WarningDialog)
 *   Emergency → separate critical overlay, only with an approved authorization
 *               (EmergencyAnnunciator). Never blocked by the A3 rule.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from './controls';
import { Glyph } from '../shared/Glyph';
import { PriorityBadge, Time } from '../shared/StatusTags';
import { useAnnunciation, useAnnunciationControls, flashSyncStyle } from '../shared/NHISProvider';
import { alertCounts, treatmentFor, validateAlert } from '../../semantics/rules';
import type { OperationalAlert, OperationalPriority } from '../../semantics/model';
import './alerts.css';

const cx = (...c: Array<string | false | undefined | null>) => c.filter(Boolean).join(' ');

export interface AlertActions {
  /** Stops flashing and repeat annunciation. Does not resolve or reclassify (NHIS A5, B30). */
  onAcknowledge?: (alert: OperationalAlert) => void;
  /** Sound and lights off, text retained, event logged (NHIS A5). */
  onSuppress?: (alert: OperationalAlert) => void;
  /** Opens the linked protocol (NHIS A6). */
  onOpenProtocol?: (alert: OperationalAlert) => void;
}

function AlertMeta({ alert }: { alert: OperationalAlert }) {
  return (
    <dl className="nhis-alert-meta">
      <div>
        <dt>Source</dt>
        <dd>{alert.source}</dd>
      </div>
      <div>
        <dt>Time</dt>
        <dd>
          <Time value={alert.timestamp} />
        </dd>
      </div>
      <div>
        <dt>State</dt>
        <dd>
          {alert.active ? 'Active' : 'Cleared'} · {alert.acknowledgement === 'acknowledged' ? 'Acknowledged' : 'Not acknowledged'}
          {alert.annunciation !== 'annunciating' && ` · ${alert.annunciation[0]!.toUpperCase()}${alert.annunciation.slice(1)}`}
        </dd>
      </div>
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/* AlertBanner — Advisory (log) and Caution (persistent, non-modal)    */
/* ------------------------------------------------------------------ */
export interface AlertBannerProps extends AlertActions {
  alert: OperationalAlert;
  children?: ReactNode;
}

export function AlertBanner({ alert, children, onAcknowledge, onSuppress, onOpenProtocol }: AlertBannerProps) {
  useAnnunciation(alert);
  const problems = validateAlert(alert);
  if (problems.length) return <InvalidAlertNotice alert={alert} problems={problems} />;
  if (alert.priority === 'warning' || alert.priority === 'emergency') {
    // Warning and Emergency have their own presentations; a banner would under-signal them.
    return <InvalidAlertNotice alert={alert} problems={[`${treatmentFor(alert.priority).label} must use ${alert.priority === 'warning' ? 'WarningDialog' : 'EmergencyAnnunciator'}.`]} />;
  }
  const unacked = alert.acknowledgement === 'unacknowledged';
  return (
    <section
      className={cx('nhis-alert-banner', `nhis-alert-banner--${alert.priority}`, !alert.active && 'is-cleared')}
      role={alert.priority === 'caution' && unacked ? 'alert' : 'status'}
      aria-label={`${treatmentFor(alert.priority).label}: ${alert.title}`}
    >
      <div className="nhis-alert-banner__main">
        <PriorityBadge priority={alert.priority} />
        <div className="nhis-alert-banner__text">
          <h3 className="nhis-alert-banner__title">{alert.title}</h3>
          {alert.detail && <p className="nhis-alert-banner__detail">{alert.detail}</p>}
          {children}
          <AlertMeta alert={alert} />
          <div className="nhis-alert-banner__actions">
        {alert.protocol && (
          <Button intent="secondary" icon="list" onPress={() => onOpenProtocol?.(alert)}>
            Protocol: {alert.protocol.title}
          </Button>
        )}
        {unacked && onAcknowledge && (
          <Button intent="primary" icon="check" onPress={() => onAcknowledge(alert)}>
            Acknowledge
          </Button>
        )}
        {onSuppress && alert.annunciation === 'annunciating' && alert.priority === 'caution' && (
          <Button intent="quiet" icon="silence" onPress={() => onSuppress(alert)}>
            Suppress
          </Button>
        )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* WarningDialog — the one interruptive health-assessment tier (A3)    */
/* ------------------------------------------------------------------ */
export interface WarningDialogProps extends AlertActions {
  alert: OperationalAlert;
  isOpen: boolean;
  /** Observations that led to the Warning. Shown before any recommendation (A11). */
  observations?: ReactNode;
}

export function WarningDialog({ alert, isOpen, observations, onAcknowledge, onOpenProtocol }: WarningDialogProps) {
  useAnnunciation(alert);
  const problems = validateAlert(alert);
  const unacked = alert.acknowledgement === 'unacknowledged';
  return (
    <ModalOverlay className="nhis-modal-overlay nhis-modal-overlay--alert" isOpen={isOpen} isDismissable={false} isKeyboardDismissDisabled>
      <Modal className="nhis-modal">
        <Dialog role="alertdialog" className="nhis-dialog nhis-alert-dialog nhis-alert-dialog--warning">
          {problems.length || alert.priority !== 'warning' ? (
            <InvalidAlertNotice alert={alert} problems={problems.length ? problems : ['WarningDialog only presents Warning-class alerts.']} />
          ) : (
            <>
              <div className="nhis-alert-dialog__head">
                <PriorityBadge priority="warning" size="lg" flashing={unacked} />
                <Heading slot="title" className="nhis-alert-dialog__title">
                  {alert.title}
                </Heading>
              </div>
              {alert.detail && <p className="nhis-alert-dialog__detail">{alert.detail}</p>}
              {observations && (
                <div className="nhis-alert-dialog__observations">
                  <h3 className="nhis-alert-dialog__subhead">Observations</h3>
                  {observations}
                </div>
              )}
              <AlertMeta alert={alert} />
              <div className="nhis-dialog__actions">
                {unacked && (
                  <Button intent="secondary" icon="check" onPress={() => onAcknowledge?.(alert)}>
                    Acknowledge
                  </Button>
                )}
                {alert.protocol && (
                  <Button intent="primary" icon="list" onPress={() => onOpenProtocol?.(alert)} autoFocus>
                    Open protocol: {alert.protocol.title}
                  </Button>
                )}
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/* ------------------------------------------------------------------ */
/* EmergencyAnnunciator — authorized Emergency only                    */
/* ------------------------------------------------------------------ */
export interface EmergencyAnnunciatorProps extends AlertActions {
  alert: OperationalAlert;
}

/**
 * Renders an Emergency asserted by an approved operational source.
 * Distinct from Warning by: "Emergency" label, filled double-octagon glyph,
 * double ring, full-width critical overlay above every other layer, distinct
 * audio identifier, and the asserting source shown first.
 * An Emergency without a valid authorization is rejected visibly — it is never
 * shown as an Emergency and never silently converted to another class.
 */
export function EmergencyAnnunciator({ alert, onAcknowledge, onOpenProtocol }: EmergencyAnnunciatorProps) {
  useAnnunciation(alert);
  const problems = validateAlert(alert);
  if (alert.priority !== 'emergency' || problems.length) {
    return (
      <InvalidAlertNotice
        alert={alert}
        problems={alert.priority !== 'emergency' ? ['EmergencyAnnunciator only presents Emergency-class alerts.'] : problems}
      />
    );
  }
  const auth = alert.authorization!;
  const unacked = alert.acknowledgement === 'unacknowledged';
  return (
    <div className="nhis-emergency" role="alertdialog" aria-modal="false" aria-labelledby={`${alert.id}-title`}>
      <div className="nhis-emergency__frame">
        <div className="nhis-emergency__head">
          <PriorityBadge priority="emergency" size="lg" flashing={unacked} />
          <h2 id={`${alert.id}-title`} className="nhis-emergency__title">
            {alert.title}
          </h2>
        </div>
        <p className="nhis-emergency__authority">
          <strong>Asserted by {auth.sourceName}</strong> · {auth.kind.replace(/-/g, ' ')} · <Time value={auth.assertedAt} />
          {auth.reference && <> · Ref. {auth.reference}</>}
        </p>
        {alert.detail && <p className="nhis-emergency__detail">{alert.detail}</p>}
        <div className="nhis-emergency__actions">
          {alert.protocol && (
            <Button intent="primary" icon="list" onPress={() => onOpenProtocol?.(alert)}>
              Open procedure: {alert.protocol.title}
            </Button>
          )}
          {unacked && (
            <Button intent="secondary" icon="check" onPress={() => onAcknowledge?.(alert)}>
              Acknowledge
            </Button>
          )}
        </div>
        <p className="nhis-emergency__note">
          Acknowledging stops repeat annunciation. It does not clear or change the Emergency. Only the asserting source can.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* InvalidAlertNotice — integration error, shown loudly, never coerced */
/* ------------------------------------------------------------------ */
export function InvalidAlertNotice({ alert, problems }: { alert: OperationalAlert; problems: string[] }) {
  if (typeof console !== 'undefined') console.error('[NHIS] Rejected alert', alert.id, problems);
  return (
    <section className="nhis-invalid-alert" role="alert">
      <Glyph name="unknown" size={20} />
      <div>
        <h3 className="nhis-invalid-alert__title">Alert rejected: "{alert.title}"</h3>
        <p className="nhis-invalid-alert__text">This alert does not meet the NHIS alert model and is not displayed as {treatmentFor(alert.priority).label}.</p>
        <ul>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* AlertCounts — always visible (A6)                                   */
/* ------------------------------------------------------------------ */
export function AlertCounts({ alerts }: { alerts: readonly OperationalAlert[] }) {
  const c = alertCounts(alerts);
  const top = useMemo(() => {
    const order: OperationalPriority[] = ['emergency', 'warning', 'caution', 'advisory'];
    return order.find((p) => alerts.some((a) => a.active && a.priority === p));
  }, [alerts]);
  return (
    <span className={cx('nhis-alert-counts', top && `nhis-alert-counts--${top}`)} aria-label={`${c.active} active alerts, ${c.unacknowledged} not acknowledged`}>
      {top ? <Glyph name={treatmentFor(top).glyph} size={20} /> : <Glyph name="check" size={20} />}
      <span className="nhis-num">{c.active}</span> active
      <span className="nhis-alert-counts__sep" aria-hidden="true">
        ·
      </span>
      <span className="nhis-num">{c.unacknowledged}</span> unacked
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* AlertList — history, acknowledge/suppress/inhibit, audit (A5, A6)  */
/* ------------------------------------------------------------------ */
export interface AlertListProps extends AlertActions {
  alerts: readonly OperationalAlert[];
  onInhibit?: (alert: OperationalAlert) => void;
  /** One action silences all audio (A5). */
  showSilenceAll?: boolean;
}

type ListView = 'active' | 'unacknowledged' | 'inhibited' | 'all';

export function AlertList({ alerts, onAcknowledge, onSuppress, onInhibit, onOpenProtocol, showSilenceAll = true }: AlertListProps) {
  const [view, setView] = useState<ListView>('active');
  const { silenceAll, active: sounding } = useAnnunciationControls();
  const counts = alertCounts(alerts);
  const order: Record<OperationalPriority, number> = { emergency: 3, warning: 2, caution: 1, advisory: 0 };
  const rows = alerts
    .filter((a) =>
      view === 'active'
        ? a.active
        : view === 'unacknowledged'
          ? a.active && a.acknowledgement === 'unacknowledged'
          : view === 'inhibited'
            ? a.annunciation === 'inhibited'
            : true,
    )
    .slice()
    .sort((a, b) => order[b.priority] - order[a.priority] || Date.parse(b.timestamp.iso) - Date.parse(a.timestamp.iso));

  const views: Array<[ListView, string, number]> = [
    ['active', 'Active', counts.active],
    ['unacknowledged', 'Not acknowledged', counts.unacknowledged],
    ['inhibited', 'Inhibited (audit)', counts.inhibited],
    ['all', 'All events', alerts.length],
  ];

  return (
    <section className="nhis-alert-list" aria-label="Alerts">
      <div className="nhis-alert-list__bar">
        <div className="nhis-alert-list__views" role="group" aria-label="Alert view">
          {views.map(([id, label, n]) => (
            <Button key={id} size="compact" intent={view === id ? 'primary' : 'quiet'} onPress={() => setView(id)} aria-pressed={view === id}>
              {label} <span className="nhis-num">({n})</span>
            </Button>
          ))}
        </div>
        {showSilenceAll && (
          <Button size="compact" intent="secondary" icon="silence" onPress={silenceAll} isDisabled={sounding.size === 0}>
            Silence all audio
          </Button>
        )}
      </div>
      <table className="nhis-alert-table">
        <thead>
          <tr>
            <th scope="col">Priority</th>
            <th scope="col">Alert</th>
            <th scope="col">Source</th>
            <th scope="col">Time</th>
            <th scope="col">State</th>
            <th scope="col">
              <span className="nhis-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="nhis-alert-table__empty">
                No alerts in this view.
              </td>
            </tr>
          )}
          {rows.map((a) => {
            const unacked = a.active && a.acknowledgement === 'unacknowledged';
            return (
              <tr key={a.id} className={cx(!a.active && 'is-cleared', unacked && 'is-unacked')}>
                <td>
                  <PriorityBadge priority={a.priority} flashing={false} />
                </td>
                <td>
                  <span className="nhis-alert-table__title">{a.title}</span>
                  {a.priority === 'emergency' && a.authorization && (
                    <span className="nhis-alert-table__auth">Asserted by {a.authorization.sourceName}</span>
                  )}
                </td>
                <td>{a.source}</td>
                <td>
                  <Time value={a.timestamp} />
                </td>
                <td className="nhis-alert-table__state">
                  {a.active ? 'Active' : 'Cleared'}
                  <br />
                  {a.acknowledgement === 'acknowledged' ? 'Acknowledged' : 'Not acknowledged'}
                  {a.annunciation !== 'annunciating' && (
                    <>
                      <br />
                      {a.annunciation[0]!.toUpperCase() + a.annunciation.slice(1)}
                    </>
                  )}
                </td>
                <td className="nhis-alert-table__actions">
                  {a.protocol && (
                    <Button size="compact" intent="quiet" icon="list" onPress={() => onOpenProtocol?.(a)}>
                      Protocol
                    </Button>
                  )}
                  {unacked && onAcknowledge && (
                    <Button size="compact" intent="secondary" onPress={() => onAcknowledge(a)}>
                      Acknowledge
                    </Button>
                  )}
                  {a.annunciation === 'annunciating' && onSuppress && a.priority !== 'advisory' && (
                    <Button size="compact" intent="quiet" onPress={() => onSuppress(a)}>
                      Suppress
                    </Button>
                  )}
                  {a.annunciation !== 'inhibited' && onInhibit && a.priority !== 'emergency' && (
                    <Button size="compact" intent="quiet" onPress={() => onInhibit(a)}>
                      Inhibit
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export { flashSyncStyle };
