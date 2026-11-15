import type { ReactNode } from 'react';
import { Button } from './controls';
import { AlertCounts } from './Alerts';
import { Glyph } from '../shared/Glyph';
import { LinkIndicator, ModeIndicator, Time } from '../shared/StatusTags';
import type { EscalationState, LinkState, OperatingMode, OperationalAlert, Timestamp } from '../../semantics/model';
import './header.css';

const cx = (...c: Array<string | false | undefined | null>) => c.filter(Boolean).join(' ');

export interface MissionHeaderProps {
  /** Crew member whose data is shown. Fixed on shared devices (NHIS A9). */
  crewMember: { name: string; role?: string };
  mode: OperatingMode;
  /** Clocks, each labelled with its time system (A23). */
  clocks: Timestamp[];
  link: { state: LinkState; delayLabel?: string };
  alerts: readonly OperationalAlert[];
  /** Same position on every screen (A18). */
  escalation: {
    state: EscalationState;
    onEscalate: () => void;
    isDisabled?: boolean;
    /** Who the escalation went to. Defaults to the flight surgeon (ground). */
    recipient?: EscalationRecipient;
  };
  onOpenAlerts?: () => void;
  /** Supplied NASTRA logo. Kept as-is; dark ground required. */
  logo?: ReactNode;
}

export type EscalationRecipient = 'flight_surgeon' | 'crew_medical_officer';

const RECIPIENT: Record<EscalationRecipient, { who: string; where: string; replied: string }> = {
  flight_surgeon: { who: 'flight surgeon', where: 'Received by ground', replied: 'Flight surgeon replied' },
  crew_medical_officer: { who: 'crew medical officer', where: 'Received by CMO onboard', replied: 'CMO replied' },
};

export function escalationLabel(state: EscalationState, recipient: EscalationRecipient = 'flight_surgeon'): string {
  const r = RECIPIENT[recipient];
  return {
    draft: 'Escalate to flight surgeon',
    sending: `Sending to ${r.who}`,
    sent: `Sent to ${r.who} · awaiting receipt`,
    received: r.where,
    answered: r.replied,
    failed: 'Not sent · retry',
  }[state];
}

export function escalationStageLabels(recipient: EscalationRecipient = 'flight_surgeon') {
  const r = RECIPIENT[recipient];
  return { title: recipient === 'flight_surgeon' ? 'Flight surgeon escalation' : 'Crew medical officer escalation', received: r.where };
}

/**
 * Persistent Station header: identity, mode, time, link, alert counts and the
 * escalation control. Everything NISTIR 7804 lists as identification, mode and
 * data-availability use errors is answered here (NHIS A6, A9, A18, A23).
 * Simulation/training adds a violet frame around the whole workspace (see StationFrame).
 */
export function MissionHeader({ crewMember, mode, clocks, link, alerts, escalation, onOpenAlerts, logo }: MissionHeaderProps) {
  return (
    <header className={cx('nhis-mission-header', mode !== 'live' && 'is-simulated')}>
      <div className="nhis-mission-header__identity">
        {logo && <span className="nhis-mission-header__logo">{logo}</span>}
        <span className="nhis-mission-header__product">NASTRA</span>
        <span className="nhis-mission-header__divider" aria-hidden="true" />
        <span className="nhis-mission-header__crew" title={crewMember.role ? `${crewMember.name} · ${crewMember.role}` : crewMember.name}>
          <Glyph name="user" size={20} />
          <span>
            <span className="nhis-mission-header__crew-name">{crewMember.name}</span>
            {crewMember.role && <span className="nhis-mission-header__crew-role">{crewMember.role}</span>}
          </span>
        </span>
      </div>
      <div className="nhis-mission-header__status">
        <ModeIndicator mode={mode} />
        {clocks.map((c) => (
          <Time key={c.system} value={c} seconds={false} className="nhis-mission-header__clock" />
        ))}
        <LinkIndicator state={link.state} delayLabel={link.delayLabel} />
        {onOpenAlerts ? (
          <button type="button" className="nhis-mission-header__alerts nhis-focus-ring" onClick={onOpenAlerts}>
            <AlertCounts alerts={alerts} />
          </button>
        ) : (
          <AlertCounts alerts={alerts} />
        )}
        <Button
          intent={escalation.state === 'draft' || escalation.state === 'failed' ? 'secondary' : 'quiet'}
          icon="escalate"
          onPress={escalation.onEscalate}
          isDisabled={escalation.isDisabled}
          isPending={escalation.state === 'sending'}
          className="nhis-mission-header__escalate"
        >
          {escalationLabel(escalation.state, escalation.recipient)}
        </Button>
      </div>
    </header>
  );
}

/** Wraps a Station workspace; adds an unmistakable frame when not live (NHIS A9). */
export function StationFrame({ mode, children }: { mode: OperatingMode; children: ReactNode }) {
  return (
    <div className={cx('nhis-station-frame', mode !== 'live' && 'is-simulated')} data-mode={mode}>
      {children}
    </div>
  );
}
