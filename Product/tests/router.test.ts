import { describe, expect, it } from 'vitest';
import { route, type EventState } from '../src/nastra/router';
import { screenText } from '../src/nastra/safety/redflags';
import { fallbackInterpretation, type Interpretation } from '../src/nastra/interpret/schema';

const base = (over: Partial<Interpretation>): Interpretation => ({ ...fallbackInterpretation(), confidence: 'high', ...over });

const tilting = base({
  speech_act: 'report', domain: 'physical_symptom',
  symptoms: [{ said: 'room is tilting', category: 'disorientation', body_system: 'sensorimotor_vestibular' }],
  urgency_hint: 'advisory',
});

const openState: EventState = {
  protocolId: 'sensorimotor_disorientation',
  asked: [{ id: 'q_red_flags', answer: null }, { id: 'q_onset', answer: null }, { id: 'q_task', answer: null }],
  knownInfo: [],
  turn: 1,
};

describe('router', () => {
  it('room tilting → sensorimotor protocol, all mandatory questions, immediate step', () => {
    const r = route(screenText('I feel the room is tilting'), tilting);
    expect(r.action.kind).toBe('protocol');
    if (r.action.kind !== 'protocol') return;
    expect(r.action.protocolId).toBe('sensorimotor_disorientation');
    expect(r.action.askNow.map((q) => q.id)).toEqual(['q_red_flags', 'q_onset', 'q_task']);
    expect(r.action.showImmediateStep).toBe(true);
    expect(r.urgency).toBe('advisory');
  });

  it('safety screen beats everything, even a calm interpretation', () => {
    const r = route(screenText('I blacked out for a second'), base({ domain: 'out_of_scope', urgency_hint: 'nominal' }));
    expect(r.action.kind).toBe('escalate');
    expect(r.urgency).toBe('warning');
  });

  it('urgency can only go up: model says nominal, protocol base is advisory', () => {
    const r = route(screenText('room tilting'), { ...tilting, urgency_hint: 'nominal' });
    expect(r.urgency).toBe('advisory');
  });

  it('model warning → escalate', () => {
    expect(route(screenText('something'), { ...tilting, urgency_hint: 'warning' }).action.kind).toBe('escalate');
  });

  it('low confidence → clarify, not guess', () => {
    expect(route(screenText("I think I'm fine?"), base({ confidence: 'low' })).action.kind).toBe('clarify');
  });

  it('log → requires confirmation', () => {
    const r = route(screenText('slept 5h'), base({ speech_act: 'log', domain: 'health_data', log_entries: [{ field: 'sleep_hours', value: '5' }] }));
    expect(r.action).toEqual({ kind: 'log', needsConfirmation: true });
  });

  it('eval O02: "Copy that" labelled log with nothing to log → redirect, never a DB write', () => {
    const r = route(screenText('Copy that, thanks'), base({ speech_act: 'log', domain: 'out_of_scope', log_entries: [] }));
    expect(r.action.kind).toBe('redirect');
  });

  it('health data question → answer_data', () => {
    const r = route(screenText('how did I sleep'), base({ speech_act: 'question', domain: 'health_data', request_target: 'sleep_trend' }));
    expect(r.action).toEqual({ kind: 'answer_data', target: 'sleep_trend' });
  });

  it('stress → acute_stress protocol', () => {
    const r = route(screenText('stressed'), base({
      speech_act: 'report', domain: 'psychological',
      symptoms: [{ said: 'stressed', category: 'acute_stress', body_system: 'behavioral_health' }],
    }));
    expect(r.action.kind === 'protocol' && r.action.protocolId).toBe('acute_stress');
  });

  it('follow-up: yes to red flags → escalate', () => {
    const r = route(screenText('yes a bit'), base({
      speech_act: 'report', domain: 'physical_symptom',
      followup_answers: [{ question_id: 'q_red_flags', answer: 'yes', detail: 'felt faint' }],
    }), openState);
    expect(r.action.kind).toBe('escalate');
  });

  it('follow-up: red flags cleared + onset + activity → ready for guidance', () => {
    const r = route(screenText('no'), base({
      speech_act: 'report', domain: 'physical_symptom',
      followup_answers: [
        { question_id: 'q_red_flags', answer: 'no', detail: null },
        { question_id: 'q_onset', answer: 'yes', detail: '20 min after workout' },
        { question_id: 'q_task', answer: 'no', detail: 'in the galley' },
      ],
      onset: '20 minutes after workout', activity_context: 'in the galley',
    }), openState);
    expect(r.action.kind).toBe('protocol');
    if (r.action.kind !== 'protocol') return;
    expect(r.action.readyForGuidance).toBe(true);
    expect(r.action.askNow).toEqual([]);
    expect(r.action.showImmediateStep).toBe(false);
  });

  it('follow-up: unclear red-flag answer → ask it again, not ready', () => {
    const r = route(screenText('hmm not sure'), base({
      speech_act: 'report', domain: 'physical_symptom',
      followup_answers: [{ question_id: 'q_red_flags', answer: 'unclear', detail: null }],
    }), openState);
    if (r.action.kind !== 'protocol') throw new Error('expected protocol');
    expect(r.action.readyForGuidance).toBe(false);
    expect(r.action.askNow.map((q) => q.id)).toContain('q_red_flags');
  });
});
