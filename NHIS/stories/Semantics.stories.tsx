import type { Meta, StoryObj } from '@storybook/react-vite';
import { ALERT_TREATMENT, validateAlert } from '../semantics/rules';
import { ConfidenceTag, DataQualityTag, EvidenceTag, LinkIndicator, ModeIndicator, PriorityBadge, StatusMark } from '../components/shared/StatusTags';
import { Measurement } from '../components/shared/Measurement';
import { AI_ASSIGNED_EMERGENCY, EMERGENCY } from './fixtures';
import './stories.css';

const meta: Meta = { title: 'Semantics' };
export default meta;
type S = StoryObj;

export const AlertClasses: S = {
  name: 'Alert classes',
  render: () => (
    <div className="sb-page">
      <h1 className="sb-h1">Alert classes</h1>
      <p className="sb-lede">
        Health-assessment logic may assign Advisory, Caution or Warning. Emergency is a separate reserved class that NASTRA displays only when an approved operational source asserts it.
        Acknowledging, silencing or losing data never changes a class.
      </p>
      <table className="sb-table">
        <thead>
          <tr>
            <th>Class</th>
            <th>Who may assign</th>
            <th>Station</th>
            <th>EVA</th>
            <th>Audio</th>
            <th>Flash</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(ALERT_TREATMENT).map(([k, t]) => (
            <tr key={k}>
              <td>
                <PriorityBadge priority={k as keyof typeof ALERT_TREATMENT} />
              </td>
              <td>{k === 'emergency' ? 'Approved mission, vehicle, suit or safety system, or validated protocol' : 'Health assessment (or an operational source)'}</td>
              <td>{{ log: 'Logged, visible in trend view', banner: 'Persistent banner in context', modal: 'Modal; requires an action', 'critical-overlay': 'Critical overlay above all layers' }[t.interrupt]}</td>
              <td>{k === 'advisory' ? 'Periphery, dismissible' : k === 'caution' ? 'Periphery + sound' : 'Outline ring near line of sight + chip + sound'}</td>
              <td>{t.audio ? 'Yes (source-defined)' : 'No'}</td>
              <td>{t.flash === 'none' ? 'No' : 'Glyph, 3 Hz, until acknowledged'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="sb-h2">Emergency authority check</h2>
      <div className="sb-cols">
        <div>
          <p className="sb-label">Asserted by vehicle caution and warning</p>
          <p>{validateAlert(EMERGENCY).length === 0 ? 'Accepted: displayed as Emergency.' : 'Rejected'}</p>
        </div>
        <div>
          <p className="sb-label">Assigned by AI health assessment</p>
          <ul>
            {validateAlert(AI_ASSIGNED_EMERGENCY).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
      <h2 className="sb-h2">Summary marks</h2>
      <div className="sb-row">
        <StatusMark status="nominal" />
        <StatusMark status="advisory" />
        <StatusMark status="caution" />
        <StatusMark status="warning" />
        <StatusMark status="emergency" />
      </div>
    </div>
  ),
};

export const DataQuality: S = {
  name: 'Data quality',
  render: () => (
    <div className="sb-page">
      <h1 className="sb-h1">Data quality</h1>
      <p className="sb-lede">
        A separate dimension from alert priority. Stale values stay fully readable and are marked, never faded or hidden. Missing values print "—", never zero. Every degraded state shows
        its age where one exists (A7, B33).
      </p>
      <table className="sb-table">
        <tbody>
          {(
            [
              ['live', 'measured', undefined],
              ['delayed', 'measured', 45_000],
              ['stale', 'measured', 252_000],
              ['unavailable', 'measured', undefined],
              ['unknown', 'measured', undefined],
              ['live', 'estimated', undefined],
              ['live', 'manual-entry', undefined],
            ] as const
          ).map(([q, o, age]) => (
            <tr key={q + o}>
              <td className="nhis-num">
                {q} / {o}
              </td>
              <td>
                <Measurement value={72} unit="bpm" quality={q} origin={o} size="secondary" />
              </td>
              <td>
                <DataQualityTag quality={q} origin={o} ageMs={age} showLive />
              </td>
            </tr>
          ))}
          <tr>
            <td className="nhis-num">paused presentation</td>
            <td>
              <Measurement value={72} unit="bpm" quality="live" size="secondary" />
            </td>
            <td>
              <DataQualityTag quality="live" pausedAt={{ iso: '2026-11-14T14:30:00Z', system: 'UTC' }} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  ),
};

export const EvidenceAndConfidence: S = {
  name: 'Evidence and confidence',
  render: () => (
    <div className="sb-page">
      <h1 className="sb-h1">Evidence categories and confidence</h1>
      <p className="sb-lede">Five categories that never collapse into one "AI answer" (02 §7). Confidence is categorical, never a percentage, and always comes with a meaning and a next action (A12).</p>
      <div className="sb-row">
        <EvidenceTag category="measured" />
        <EvidenceTag category="derived" />
        <EvidenceTag category="retrieved" />
        <EvidenceTag category="ai-assessment" />
        <EvidenceTag category="recommended-action" />
      </div>
      <div className="sb-row">
        <ConfidenceTag level="high" />
        <ConfidenceTag level="medium" />
        <ConfidenceTag level="low" />
      </div>
      <p className="sb-note">Low confidence is uncertainty, not urgency: it is dashed, not coloured, and never shares a token with Caution (03 §15).</p>
    </div>
  ),
};

export const ModeAndLink: S = {
  name: 'Mode and link',
  render: () => (
    <div className="sb-page">
      <h1 className="sb-h1">Operating mode and link</h1>
      <div className="sb-row">
        <ModeIndicator mode="live" />
        <ModeIndicator mode="simulation" />
        <ModeIndicator mode="training" />
        <ModeIndicator mode="what-if" />
      </div>
      <div className="sb-row">
        <LinkIndicator state="connected" delayLabel="RTT 6 s" />
        <LinkIndicator state="degraded" delayLabel="RTT 14 s" />
        <LinkIndicator state="disconnected" />
        <LinkIndicator state="unknown" />
      </div>
    </div>
  ),
};
