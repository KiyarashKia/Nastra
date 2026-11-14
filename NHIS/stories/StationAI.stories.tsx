import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { AIAssessment, CheckIn, Conversation, ExtractionReview, PatternCard, SymptomIntake, type ConversationMessage, type EvidenceRecord } from '../components/station/AI';
import { ImageInput } from '../components/station/Workflow';
import { minutesAgo, utc } from './fixtures';
import './stories.css';

const meta: Meta = { title: 'Station/AI' };
export default meta;
type S = StoryObj;

const EVIDENCE: EvidenceRecord = {
  signals: [
    { name: 'Resting heart rate', window: '13:50–14:30 UTC', summary: '72–81 bpm, above band for 40 min', category: 'measured' },
    { name: 'Sleep duration', window: 'Last 3 nights', summary: '5.4, 5.9, 5.6 h', category: 'measured' },
    { name: 'Workload context', window: 'Today', summary: 'Two EVA prep sessions scheduled', category: 'derived' },
    { name: 'Skin temperature', window: '13:50–14:30 UTC', summary: 'Sensor contact intermittent', category: 'measured', quality: 'stale' },
  ],
  baseline: 'Personal baseline · 14-day median 64 bpm (58–70)',
  protocol: { id: 'PRT-CV-02', title: 'Elevated resting heart rate review' },
  retrieved: [{ title: 'Crew health protocol library (simulated)', reference: 'PRT-CV-02 rev 3' }],
  gaps: ['Skin temperature unreliable for this window', 'No self-reported symptoms yet today'],
};

const common = {
  title: 'Heart rate above personal baseline',
  generatedAt: utc(minutesAgo(2)),
  observations: [
    { text: 'Resting heart rate 79 bpm, +15 above your 14-day median, for 40 minutes.', category: 'measured' as const },
    { text: 'Sleep below your baseline on 3 of the last 3 nights.', category: 'measured' as const },
    { text: 'Similar elevation on 3 of 4 recent high-workload mornings.', category: 'derived' as const },
  ],
  evidence: EVIDENCE,
  onDismiss: () => undefined,
  onCorrect: () => undefined,
  onOpenProtocol: () => undefined,
};

export const AssessmentHighConfidence: S = {
  name: 'Assessment · high confidence',
  render: () => (
    <div className="sb-page" style={{ maxWidth: 860 }}>
      <span className="sb-fixture">Simulated fixture — not live data</span>
      <AIAssessment
        {...common}
        assessment="The elevation is consistent with reduced sleep and today's workload. No other signal in the data points elsewhere."
        confidence={{ level: 'high', meaning: 'All required signals present and consistent with each other.', nextAction: 'Review the protocol when convenient; no immediate action.' }}
        recommendedAction={{ text: 'Follow the elevated resting heart rate review.', protocol: { id: 'PRT-CV-02', title: 'Elevated resting heart rate review' } }}
      />
    </div>
  ),
};

export const AssessmentLowConfidence: S = {
  name: 'Assessment · low confidence',
  render: () => (
    <div className="sb-page" style={{ maxWidth: 860 }}>
      <AIAssessment
        {...common}
        state="uncertain"
        assessment="NASTRA cannot tell which factor explains the elevation."
        confidence={{ level: 'low', meaning: 'Key signals are missing or disagree.', nextAction: 'Add how you feel, or check sensor fit, then ask again.' }}
        alternatives={['Reduced sleep', 'Sensor contact error', 'Early illness', 'Exercise recovery not logged']}
      />
    </div>
  ),
};

export const AssessmentOutOfScope: S = {
  name: 'Assessment · out of scope',
  render: () => (
    <div className="sb-page" style={{ maxWidth: 860 }}>
      <AIAssessment {...common} title="Chest discomfort reported" state="out-of-scope" onEscalate={() => undefined} />
    </div>
  ),
};

export const AssessmentSelfReportFirst: S = {
  name: 'Assessment · your report first (A14)',
  render: () => {
    const [done, setDone] = useState(false);
    return (
      <div className="sb-page" style={{ maxWidth: 860 }}>
        <AIAssessment
          {...common}
          title="SpO₂ below the protocol limit"
          requireSelfReport
          selfReport={done ? <p style={{ margin: 0 }}>Slight headache, started about an hour ago. No shortness of breath.</p> : undefined}
          onStartSelfReport={() => setDone(true)}
          assessment="The reading may reflect poor sensor contact; your report does not mention breathlessness. The protocol still applies until a second reading confirms."
          confidence={{ level: 'medium', meaning: 'One signal is low; corroborating signals are mixed.', nextAction: 'Take a second reading with a re-seated sensor.' }}
          recommendedAction={{ text: 'Run the low oxygen saturation response.', protocol: { id: 'PRT-RS-01', title: 'Low oxygen saturation response' } }}
        />
      </div>
    );
  },
};

export const Pattern: S = {
  name: 'Pattern (association, not causation)',
  render: () => (
    <div className="sb-page" style={{ maxWidth: 720 }}>
      <PatternCard
        window="Last 4 weeks"
        pattern="Heart rate was elevated during 3 of the last 4 high-workload morning briefings."
        records={['Elevated self-reported stress', 'Reduced sleep on 2 occasions', 'No critical alert state recorded']}
      />
    </div>
  ),
};

export const ConversationStates: S = {
  name: 'Conversation',
  render: () => {
    const [state, setState] = useState<'idle' | 'processing' | 'unavailable'>('idle');
    const [msgs, setMsgs] = useState<ConversationMessage[]>([
      { id: 'm1', role: 'crew', time: utc(minutesAgo(6)), content: 'Why is my heart rate up this morning?' },
      {
        id: 'm2',
        role: 'nastra',
        time: utc(minutesAgo(5)),
        content: (
          <AIAssessment
            {...common}
            assessment="The elevation is consistent with reduced sleep and today's workload."
            confidence={{ level: 'medium', meaning: 'Most signals present; skin temperature unreliable.', nextAction: 'Tell NASTRA how you feel to improve this.' }}
          />
        ),
      },
    ]);
    return (
      <div className="sb-page" style={{ maxWidth: 900 }}>
        <div className="sb-row">
          <span className="sb-label">Simulate:</span>
          {(['idle', 'processing', 'unavailable'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setState(s)} className="nhis-button nhis-button--compact nhis-button--secondary">
              {s}
            </button>
          ))}
        </div>
        <Conversation
          messages={msgs}
          state={state}
          progress={state === 'processing' ? { step: 2, of: 4, label: 'Comparing with your 14-day baseline' } : undefined}
          suggestedReplies={['I slept badly', 'I feel fine', 'Show the trend']}
          onSuggestedReply={(r) => setMsgs((m) => [...m, { id: `c${m.length}`, role: 'crew', time: utc(minutesAgo(0)), content: r }])}
          onSend={(t) => setMsgs((m) => [...m, { id: `c${m.length}`, role: 'crew', time: utc(minutesAgo(0)), content: t }])}
          onCancel={() => setState('idle')}
          composerAccessory={<ImageInput onFiles={() => undefined} />}
        />
      </div>
    );
  },
};

export const Intake: S = {
  name: 'Symptom intake with read-back (A15)',
  render: () => (
    <div className="sb-page">
      <p className="sb-note">Question set is a fixture; production questions come from the approved intake protocol.</p>
      <SymptomIntake
        onConfirm={() => undefined}
        questions={[
          { id: 'sev', label: 'How strong is it?', options: [{ id: 'mild', label: 'Mild' }, { id: 'mod', label: 'Moderate' }, { id: 'sev', label: 'Severe' }] },
          { id: 'dur', label: 'How long has it lasted?', options: [{ id: 'lt1', label: 'Under 1 h' }, { id: '1to6', label: '1–6 h' }, { id: 'gt6', label: 'Over 6 h' }] },
          { id: 'before', label: 'Have you had this before in flight?', options: [{ id: 'y', label: 'Yes' }, { id: 'n', label: 'No' }] },
        ]}
      />
    </div>
  ),
};

export const PsychCheckIn: S = {
  name: 'Psychological check-in',
  render: () => (
    <div className="sb-page">
      <p className="sb-note">Sensitive data: no scores, streaks, colours or celebratory feedback. Visibility note comes from the project's data policy.</p>
      <CheckIn
        title="Daily check-in"
        visibilityNote="Visible to you. Shared with the flight surgeon only if you escalate. (Fixture wording — replace with the approved policy.)"
        onSubmit={() => undefined}
        questions={[
          { id: 'mood', label: 'Mood right now', options: [{ id: 'low', label: 'Low' }, { id: 'neutral', label: 'Neutral' }, { id: 'good', label: 'Good' }] },
          { id: 'stress', label: 'Perceived stress', options: [{ id: 'low', label: 'Low' }, { id: 'some', label: 'Some' }, { id: 'high', label: 'High' }] },
          { id: 'fatigue', label: 'Fatigue', options: [{ id: 'none', label: 'None' }, { id: 'some', label: 'Some' }, { id: 'high', label: 'High' }] },
        ]}
      />
    </div>
  ),
};

export const ImageExtraction: S = {
  name: 'Values read from an image (confirm first)',
  render: () => (
    <div className="sb-page">
      <p className="sb-note">The model reads a device display from a photo. Nothing is written to the health record until the crew member checks and confirms each value.</p>
      <ExtractionReview
        source="Photo of blood-pressure cuff display, 14:31 UTC (simulated)"
        fields={[
          { id: 'sys', label: 'Systolic', unit: 'mmHg', value: '118' },
          { id: 'dia', label: 'Diastolic', unit: 'mmHg', value: '76' },
          { id: 'pulse', label: 'Pulse', unit: 'bpm', value: '7?', note: 'Second digit partly obscured. Please check.' },
        ]}
        onConfirm={() => undefined}
        onDiscard={() => undefined}
      />
    </div>
  ),
};
