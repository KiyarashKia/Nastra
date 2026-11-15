import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import fs from 'node:fs';
import path from 'node:path';
import { createPgliteDb } from '../src/nastra/db/pglite';
import { getHistory, getOverview, getProtocolView, getTelemetry } from '../src/nastra/station/read';
import { runMonitor } from '../src/nastra/station/monitor';
import { handleMessage } from '../src/nastra/pipeline';
import type { LlmClient } from '../src/nastra/llm/provider';

const ANCHOR = '2026-11-15T00:30:00.000Z';
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite({ extensions: { vector } });
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  await pg.query('select nastra_reseed($1::timestamptz)', [ANCHOR]);
}, 60_000);

describe('Station read models', () => {
  it('monitor raises Advisories only (personal deviation), never Caution, and is idempotent', async () => {
    const db = createPgliteDb(pg);
    const first = await runMonitor(db, 'crew_02', ANCHOR);
    expect(first.raised).toBeGreaterThan(0);
    const again = await runMonitor(db, 'crew_02', ANCHOR);
    expect(again.raised).toBe(0);
    const rows = (await pg.query<{ priority: string; title: string; detail: string }>("select priority, title, detail from crew_alerts where crew_id = 'crew_02'")).rows;
    expect(rows.every((r) => r.priority === 'advisory')).toBe(true);
    expect(rows.map((r) => r.title)).toContain('Heart rate above your usual after exercise');
    expect(rows.find((r) => r.title.startsWith('Heart rate'))!.detail).toMatch(/not a clinical threshold/);
    expect(rows.map((r) => r.title)).toContain('Sleep below your average 3 nights running');
  });

  it('overview: K. Kia at MET 034, status sentence, tiles with baselines, pattern, context', async () => {
    const o = await getOverview(createPgliteDb(pg), 'crew_02', ANCHOR);
    expect(o.profile).toMatchObject({ name: 'K. Kia', role: 'Flight Engineer', agency: 'CSA', metDay: 34 });
    expect(o.status.level).toBe('advisory');
    expect(o.status.sentence).toMatch(/advisories?\. /i);
    const hr = o.tiles.find((t) => t.key === 'heart_rate_bpm')!;
    expect(hr.status).toBe('advisory');
    expect(hr.baseline!.label).toMatch(/after exercise/);
    expect(hr.quality).toBe('live');
    expect(o.sleep.origin).toBe('estimated');
    expect(o.stress).toMatchObject({ label: 'High', origin: 'self-reported' });
    expect(o.pattern!.pattern).toMatch(/2 similar sensorimotor vestibular reports in the last 21 days, all after exercise, all after sleep below 6 h/);
    expect(o.context!.line).toMatch(/min after exercise/);
    expect(o.context!.habitat).toMatch(/^Habitat · /);
    expect(o.escalation.state).toBe('draft');
  });

  it('telemetry: 7 channels + 5 environment channels with labelled bands', async () => {
    const t = await getTelemetry(createPgliteDb(pg), 'crew_02', ANCHOR);
    expect(t.vitals).toHaveLength(7);
    expect(t.vitals[0].samples.length).toBeGreaterThan(100);
    expect(t.vitals[0].baseline!.label).toMatch(/14-day/);
    expect(t.environment.map((e) => e.key)).toEqual(['co2_mmhg', 'ppo2_kpa', 'pressure_kpa', 'temp_c', 'humidity_pct']);
    expect(t.environment[0].baseline!.label).toMatch(/not a limit/);
    expect(t.sleep.nights.length).toBeGreaterThan(10);
  });

  it('protocol view follows the event; history lists it; pattern groups need 2+', async () => {
    const db = createPgliteDb(pg);
    const llm: LlmClient = { async chatJson() { return { content: JSON.stringify({ speech_act: 'report', domain: 'physical_symptom', secondary_domain: null, symptoms: [{ said: 'room is tilting', category: 'disorientation', body_system: 'sensorimotor_vestibular' }], onset: null, duration: null, severity: null, activity_context: null, log_entries: [], request_target: null, followup_answers: [], urgency_hint: 'advisory', confidence: 'high', missing_info: [] }), latencyMs: 1, usedSchemaMode: 'json_schema' }; } };
    const r = await handleMessage({ crewId: 'crew_02', text: 'I feel the room is tilting' }, { db, llm, model: 'fake', asOf: ANCHOR });
    const pv = await getProtocolView(db, 'crew_02', ANCHOR);
    expect(pv.active).toMatchObject({ code: 'PRT-SM-01', eventId: r.eventId, phase: 'intake' });
    expect(pv.active!.steps.map((s) => `${s.id}:${s.state}`)).toEqual(['safety:current', 'clarify:pending', 'context:pending', 'history:pending', 'action:pending', 'recheck:pending']);
    const h = await getHistory(db, 'crew_02', ANCHOR);
    expect(h.events[0].id).toBe(r.eventId);
    expect(h.patternGroups.some((g) => g.count >= 2)).toBe(true);
    expect(h.checkIns[0].origin).toBe('self-reported');
  });
});
