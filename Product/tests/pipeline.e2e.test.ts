import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import fs from 'node:fs';
import path from 'node:path';
import { createPgliteDb } from '../src/nastra/db/pglite';
import { closeEvent, commitLog, handleMessage } from '../src/nastra/pipeline';
import type { ChatJsonRequest, LlmClient } from '../src/nastra/llm/provider';

const ANCHOR = '2026-11-15T00:30:00.000Z';
let pg: PGlite;

const interp = (over: Record<string, unknown>) => JSON.stringify({
  speech_act: 'report', domain: 'physical_symptom', secondary_domain: null, symptoms: [],
  onset: null, duration: null, severity: null, activity_context: null, log_entries: [],
  request_target: null, followup_answers: [], urgency_hint: 'advisory', confidence: 'high', missing_info: [],
  ...over,
});

/** Fake model: one scripted interpretation per turn; explanations cite E1/E2. */
function fakeLlm(interpretations: string[], explanation?: string): LlmClient & { calls: ChatJsonRequest[] } {
  const calls: ChatJsonRequest[] = [];
  let i = 0;
  return {
    calls,
    async chatJson(req) {
      calls.push(req);
      if (req.schemaName === 'interpretation') return { content: interpretations[i++], latencyMs: 1, usedSchemaMode: 'json_schema' };
      return {
        content: explanation ?? JSON.stringify({
          explanation: 'You said the room feels like it is tilting. Your heart rate is higher than your usual at this point after exercise [E1], and your recent nights were shorter than your average [E2]. The data cannot tell me why this is happening.',
          cited: ['E1', 'E2'],
        }),
        latencyMs: 1, usedSchemaMode: 'json_schema',
      };
    },
  };
}

beforeAll(async () => {
  pg = new PGlite({ extensions: { vector } });
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  await pg.query('select nastra_reseed($1::timestamptz)', [ANCHOR]);
}, 60_000);

describe('pipeline — "I feel the room is tilting" (crew_02)', () => {
  let eventId: string;

  it('turn 1: protocol, immediate step, 3 questions, evidence with the planted story', async () => {
    const db = createPgliteDb(pg);
    const llm = fakeLlm([interp({
      symptoms: [{ said: 'room is tilting', category: 'disorientation', body_system: 'sensorimotor_vestibular' }],
      missing_info: ['onset', 'duration', 'associated_symptoms', 'current_activity'],
    })]);
    const r = await handleMessage({ crewId: 'crew_02', text: 'I feel the room is tilting' }, { db, llm, model: 'fake', asOf: ANCHOR });

    expect(r.action).toBe('protocol');
    expect(r.protocol?.id).toBe('sensorimotor_disorientation');
    expect(r.urgency).toBe('advisory');
    expect(r.immediateStep).toMatch(/hold on to a handrail/);
    expect(r.questions.map((q) => q.id)).toEqual(['q_red_flags', 'q_onset', 'q_task']);
    expect(r.explanationSource).toBe('model');

    const text = r.evidence.map((e) => `${e.title}: ${e.detail}`).join('\n');
    expect(text).toMatch(/30 min after exercise/);
    expect(text).toMatch(/Heart rate \d+(\.\d)? bpm vs your usual [\d.]+ \(higher than usual for you\)/);
    expect(text).toMatch(/4\.9 h, 5\.4 h, 5\.1 h/);
    expect(text).toMatch(/stress 4\/5/);
    expect(text).toMatch(/2 similar episodes before; both came after exercise, after a night well below your usual sleep and on a high-stress morning/);
    expect(text).toMatch(/EVA prep/);
    expect(r.evidence.some((e) => e.source.url?.includes('nasa.gov/reference/risk-of-altered-sensorimotor'))).toBe(true);

    expect(r.eventId).toBeTruthy();
    eventId = r.eventId!;
    const ev = (await pg.query<{ status: string; protocol_id: string; mission_context: string }>('select status, protocol_id, mission_context from health_events where id = $1', [eventId])).rows[0];
    expect(ev).toMatchObject({ status: 'awaiting_followup', protocol_id: 'sensorimotor_disorientation', mission_context: 'post_exercise' });
    const tools = (await pg.query<{ tool: string }>('select tool from tool_calls where event_id = $1', [eventId])).rows.map((x) => x.tool);
    expect(tools).toEqual(expect.arrayContaining(['telemetry.vitals_now', 'health.recent_sleep', 'health.recent_mood', 'mission.current_context', 'health.similar_episodes', 'knowledge.search']));
  });

  it('turn 2: red flags cleared + onset + activity → guidance and a recheck', async () => {
    const db = createPgliteDb(pg);
    const llm = fakeLlm([interp({
      followup_answers: [
        { question_id: 'q_red_flags', answer: 'no', detail: null },
        { question_id: 'q_onset', answer: 'yes', detail: 'about 20 min after workout, comes and goes' },
        { question_id: 'q_task', answer: 'no', detail: 'in the galley' },
      ],
      onset: '20 minutes after workout', activity_context: 'in the galley',
    })]);
    const r = await handleMessage(
      { crewId: 'crew_02', eventId, text: "No, none of those. Started about 20 minutes after my workout, comes and goes. I'm in the galley." },
      { db, llm, model: 'fake', asOf: '2026-11-15T00:32:00.000Z' },
    );
    expect(r.action).toBe('protocol');
    expect(r.eventId).toBe(eventId);
    expect(r.questions).toEqual([]);
    expect(r.immediateStep).toBeUndefined();
    expect(r.steps.join(' ')).toMatch(/avoid quick head movements/);
    expect(r.recheckMinutes).toBe(20);
    // The model only saw the open questions it was allowed to answer.
    expect(String(llm.calls[0].messages.at(-1)?.content)).toContain('q_red_flags');

    const turns = (await pg.query('select count(*)::int n from event_turns where event_id = $1', [eventId])).rows[0] as { n: number };
    expect(turns.n).toBe(4);
  });

  it('closing the event marks it resolved', async () => {
    await closeEvent(createPgliteDb(pg), eventId, 'resolved', 'Felt fine at the 20-min recheck.');
    const ev = (await pg.query<{ status: string }>('select status from health_events where id = $1', [eventId])).rows[0];
    expect(ev.status).toBe('resolved');
  });
});

describe('pipeline — other paths', () => {
  it('red flag: escalates, never calls the model, logs an escalated event', async () => {
    const db = createPgliteDb(pg);
    const llm = fakeLlm([]);
    const r = await handleMessage({ crewId: 'crew_02', text: 'I just blacked out for a second' }, { db, llm, model: 'fake', asOf: ANCHOR });
    expect(r.action).toBe('escalate');
    expect(r.urgency).toBe('warning');
    expect(r.headline).toMatch(/flight surgeon/);
    expect(llm.calls.length).toBe(0);
    const ev = (await pg.query<{ status: string; outcome: string }>('select status, outcome from health_events where id = $1', [r.eventId])).rows[0];
    expect(ev.status).toBe('escalated');
  });

  it('follow-up "yes" to red flags escalates the open event', async () => {
    const db = createPgliteDb(pg);
    const first = await handleMessage({ crewId: 'crew_02', text: 'room feels tilted' }, {
      db, llm: fakeLlm([interp({ symptoms: [{ said: 'room feels tilted', category: 'disorientation', body_system: 'sensorimotor_vestibular' }] })]), model: 'fake', asOf: ANCHOR,
    });
    const r = await handleMessage({ crewId: 'crew_02', eventId: first.eventId!, text: 'yes, some of that' }, {
      db, llm: fakeLlm([interp({ followup_answers: [{ question_id: 'q_red_flags', answer: 'yes', detail: 'felt faint-ish' }] })]), model: 'fake', asOf: ANCHOR,
    });
    expect(r.action).toBe('escalate');
    expect(r.eventId).toBe(first.eventId);
  });

  it('your chat: "heart missing beats" is NOT matched to the past dizziness episodes', async () => {
    const db = createPgliteDb(pg);
    const r = await handleMessage({ crewId: 'crew_02', text: 'I feel my heart is missing some beats' }, {
      db, llm: fakeLlm([interp({ urgency_hint: 'caution', symptoms: [{ said: 'heart missing beats', category: 'palpitations', body_system: 'cardiovascular' }] })]), model: 'fake', asOf: ANCHOR,
    });
    expect(r.protocol?.id).toBe('general_physical');
    expect(r.evidence.some((e) => e.kind === 'pattern')).toBe(false);
  });

  it('your chat: bare "yes" escalates with a fixed reason, never the model\'s guess', async () => {
    const db = createPgliteDb(pg);
    const first = await handleMessage({ crewId: 'crew_02', text: 'heart missing beats' }, {
      db, llm: fakeLlm([interp({ symptoms: [{ said: 'heart missing beats', category: 'palpitations', body_system: 'cardiovascular' }] })]), model: 'fake', asOf: ANCHOR,
    });
    const r = await handleMessage({ crewId: 'crew_02', eventId: first.eventId!, text: 'yes' }, {
      db, llm: fakeLlm([interp({ followup_answers: [{ question_id: 'q_red_flags', answer: 'yes', detail: 'likely fainting based on context' }] })]), model: 'fake', asOf: ANCHOR,
    });
    expect(r.action).toBe('escalate');
    expect(r.explanation).toBe('Reason: You answered yes to the warning-signs check.');
    expect(r.trace.join(' ')).toMatch(/model note \(not shown\): likely fainting/);
  });

  it('model explanation that diagnoses is rejected; fallback is fact-only', async () => {
    const db = createPgliteDb(pg);
    const bad = JSON.stringify({ explanation: 'You have vertigo caused by your workout. Nothing to worry about.', cited: [] });
    const r = await handleMessage({ crewId: 'crew_02', text: 'room tilting' }, {
      db, llm: fakeLlm([interp({ symptoms: [{ said: 'room tilting', category: 'disorientation', body_system: 'sensorimotor_vestibular' }] })], bad), model: 'fake', asOf: ANCHOR,
    });
    expect(r.explanationSource).toBe('fallback');
    expect(r.explanation).not.toMatch(/vertigo|worry/i);
    expect(r.explanation).toMatch(/\[E1\]/);
    expect(r.explanation!.split(/\s+/).length).toBeLessThan(45);
    expect(r.explanationIssues!.join(' ')).toMatch(/diagnosis/);
  });

  it('data question answers from sleep logs and logs a resolved event', async () => {
    const db = createPgliteDb(pg);
    const r = await handleMessage({ crewId: 'crew_02', text: 'How did I sleep this week?' }, {
      db,
      llm: fakeLlm([interp({ speech_act: 'question', domain: 'health_data', request_target: 'sleep_trend', urgency_hint: 'nominal' })],
        JSON.stringify({ explanation: 'Your last three nights were shorter than your 14-day average [E1].', cited: ['E1'] })),
      model: 'fake', asOf: ANCHOR,
    });
    expect(r.action).toBe('answer_data');
    expect(r.evidence[0].title).toMatch(/Sleep, last 7 nights/);
    expect(r.eventStatus).toBe('resolved');
  });

  it('log needs confirmation; commitLog writes only after confirm', async () => {
    const db = createPgliteDb(pg);
    const before = (await pg.query<{ n: number }>("select count(*)::int n from mood_logs where crew_id='crew_02'")).rows[0].n;
    const r = await handleMessage({ crewId: 'crew_02', text: 'stress 4, fatigue 3' }, {
      db, llm: fakeLlm([interp({ speech_act: 'log', domain: 'health_data', log_entries: [{ field: 'stress', value: '4' }, { field: 'fatigue', value: '3' }] })]), model: 'fake', asOf: ANCHOR,
    });
    expect(r.action).toBe('log');
    expect((await pg.query<{ n: number }>("select count(*)::int n from mood_logs where crew_id='crew_02'")).rows[0].n).toBe(before);
    await commitLog(db, 'crew_02', r.confirmLog!);
    expect((await pg.query<{ n: number }>("select count(*)::int n from mood_logs where crew_id='crew_02'")).rows[0].n).toBe(before + 1);
  });
});

// Replays Kiarash's 2026-11-14 chat, where a deteriorating crew member never got escalated.
describe('pipeline — deterioration must reach the flight surgeon', () => {
  const T = (min: number) => new Date(Date.parse(ANCHOR) + min * 60_000).toISOString();

  it('"shortness in breath" escalates on the first message and writes a pending alert', async () => {
    const db = createPgliteDb(pg);
    const llm = fakeLlm([]);
    const r = await handleMessage({ crewId: 'crew_02', text: 'hey i feel shortness in breath and shaking hands' }, { db, llm, model: 'fake', asOf: T(1) });
    expect(r.action).toBe('escalate');
    expect(llm.calls).toHaveLength(0);
    expect(r.alert?.delivered).toBe(true);
    const a = (await pg.query<{ status: string; event_id: string; reasons: string[] }>('select status, event_id, reasons from surgeon_alerts where id = $1', [r.alert!.id])).rows[0];
    expect(a.status).toBe('pending');
    expect(a.event_id).toBe(r.eventId);
    expect(a.reasons.join(' ')).toMatch(/breathing/i);
    const feed = (await pg.query<{ id: string }>('select id from surgeon_alert_feed()')).rows.map((x) => x.id);
    expect(feed).toContain(r.alert!.id);
  });

  it('"im barely standing" and "hel" inside an open event escalate without the model', async () => {
    const db = createPgliteDb(pg);
    const first = await handleMessage({ crewId: 'crew_02', text: 'my hands are shaking' },
      { db, llm: fakeLlm([interp({ symptoms: [{ said: 'hands shaking', category: 'tremor', body_system: 'other' }] })]), model: 'fake', asOf: T(2) });
    expect(first.action).toBe('protocol');
    for (const text of ['im barely standing', 'hel']) {
      const llm = fakeLlm([]);
      const r = await handleMessage({ crewId: 'crew_02', eventId: first.eventId!, text }, { db, llm, model: 'fake', asOf: T(3) });
      expect(r.action, text).toBe('escalate');
      expect(llm.calls, text).toHaveLength(0);
      expect(r.alert?.delivered, text).toBe(true);
      // Escalation closes the event; the second message opens its own.
      if (text === 'im barely standing') expect(r.eventId).toBe(first.eventId);
    }
  });

  it('an unanswered warning-signs check escalates on the third turn, and urgency never drops', async () => {
    const db = createPgliteDb(pg);
    const sym = { symptoms: [{ said: 'tired and weak', category: 'fatigue', body_system: 'other' }] };
    const t1 = await handleMessage({ crewId: 'crew_02', text: 'I feel weak and off' }, { db, llm: fakeLlm([interp(sym)]), model: 'fake', asOf: T(4) });
    const t2 = await handleMessage({ crewId: 'crew_02', eventId: t1.eventId!, text: 'really tired' },
      { db, llm: fakeLlm([interp({ ...sym, urgency_hint: 'caution' })]), model: 'fake', asOf: T(5) });
    expect(t2.action).toBe('protocol');
    expect(t2.urgency).toBe('caution');
    expect(t2.questions.some((q) => q.redFlag)).toBe(true);
    const t3 = await handleMessage({ crewId: 'crew_02', eventId: t1.eventId!, text: 'just tired' },
      { db, llm: fakeLlm([interp({ ...sym, urgency_hint: 'advisory' })]), model: 'fake', asOf: T(6) });
    expect(t3.action).toBe('escalate');
    expect(t3.explanation).toMatch(/unanswered 2 times/);
  });

  it('urgency inside an event does not go back down', async () => {
    const db = createPgliteDb(pg);
    const sym = { symptoms: [{ said: 'achy', category: 'pain', body_system: 'other' }] };
    const t1 = await handleMessage({ crewId: 'crew_02', text: 'I feel achy' }, { db, llm: fakeLlm([interp({ ...sym, urgency_hint: 'caution' })]), model: 'fake', asOf: T(7) });
    const t2 = await handleMessage({ crewId: 'crew_02', eventId: t1.eventId!, text: 'it started an hour ago' },
      { db, llm: fakeLlm([interp({ ...sym, onset: 'an hour ago', urgency_hint: 'advisory' })]), model: 'fake', asOf: T(8) });
    expect(t1.urgency).toBe('caution');
    expect(t2.urgency).toBe('caution');
  });

  it('a low-confidence message while the check is open escalates', async () => {
    const db = createPgliteDb(pg);
    const sym = { symptoms: [{ said: 'dizzy', category: 'disorientation', body_system: 'sensorimotor_vestibular' }] };
    const t1 = await handleMessage({ crewId: 'crew_02', text: 'bit dizzy' }, { db, llm: fakeLlm([interp(sym)]), model: 'fake', asOf: T(9) });
    const t2 = await handleMessage({ crewId: 'crew_02', eventId: t1.eventId!, text: 'wh at ok mm' },
      { db, llm: fakeLlm([interp({ confidence: 'low' })]), model: 'fake', asOf: T(10) });
    expect(t2.action).toBe('escalate');
    expect(t2.explanation).toMatch(/unclear/);
  });

  it('reseed archives alerts with their events and clears the outbox', async () => {
    const r = (await pg.query<{ r: { archived_live_events: number } }>('select nastra_reseed($1::timestamptz) r', [ANCHOR])).rows[0].r;
    expect(r.archived_live_events).toBeGreaterThan(0);
    const left = (await pg.query<{ n: number }>('select count(*)::int n from surgeon_alerts')).rows[0].n;
    expect(left).toBe(0);
    const archivedAlerts = (await pg.query<{ n: number }>("select coalesce(sum(jsonb_array_length(event->'alerts')),0)::int n from session_archive")).rows[0].n;
    expect(archivedAlerts).toBeGreaterThan(0);
  });
});
