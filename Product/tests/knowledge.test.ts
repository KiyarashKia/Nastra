import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import fs from 'node:fs';
import path from 'node:path';
import { createPgliteDb } from '../src/nastra/db/pglite';
import { chunkSnapshot, toVectorLiteral } from '../src/nastra/knowledge/chunk';
import { hashingEmbedder } from '../src/nastra/knowledge/embed';
import { ToolGateway } from '../src/nastra/tools/gateway';
import { PROTOCOLS } from '../src/nastra/protocols/registry';
import { handleMessage } from '../src/nastra/pipeline';
import type { LlmClient } from '../src/nastra/llm/provider';

const root = path.join(__dirname, '..');
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'hrp_snapshot.json'), 'utf8'));
const embed = hashingEmbedder();
let pg: PGlite;
const ANCHOR = '2026-11-15T00:30:00.000Z';

beforeAll(async () => {
  pg = new PGlite({ extensions: { vector } });
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  for (const f of fs.readdirSync(path.join(root, 'supabase', 'migrations')).sort()) {
    await pg.exec(fs.readFileSync(path.join(root, 'supabase', 'migrations', f), 'utf8'));
  }
  await pg.query('select nastra_reseed($1::timestamptz)', [ANCHOR]);
  for (const c of chunkSnapshot(snapshot.pages)) {
    await pg.query(
      `insert into knowledge_snippets (source_org, source_name, source_url, section, chunk_index, tags, content, embedding)
       values ($1,$2,$3,$4,$5,$6,$7,$8::extensions.vector)`,
      [c.source_org, c.source_name, c.source_url, c.section, c.chunk_index, c.tags, c.content, toVectorLiteral(await embed(c.embedText))],
    );
  }
}, 60_000);

describe('knowledge', () => {
  it('chunks every snapshot section, none over 220 words, all tagged', () => {
    const chunks = chunkSnapshot(snapshot.pages);
    expect(chunks.length).toBe(18);
    expect(chunks.every((c) => c.tags.length > 0 && c.content.split(/\s+/).length <= 220)).toBe(true);
  });

  it('filter first: a sensorimotor query can never return behavioral-health chunks', async () => {
    const gw = new ToolGateway(createPgliteDb(pg), { crewId: 'crew_02', asOf: ANCHOR, allowed: ['knowledge.search'] });
    const rows = await gw.knowledge(PROTOCOLS.sensorimotor_disorientation.knowledgeTags, 10, { text: 'anxiety isolation confinement', embed });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tags.some((t) => ['sensorimotor_vestibular', 'cardiovascular'].includes(t)))).toBe(true);
  });

  it('then rank: "room tilting · disorientation" puts the sensorimotor page first', async () => {
    const gw = new ToolGateway(createPgliteDb(pg), { crewId: 'crew_02', asOf: ANCHOR, allowed: ['knowledge.search'] });
    const rows = await gw.knowledge(PROTOCOLS.sensorimotor_disorientation.knowledgeTags, 3, { text: 'I feel the room is tilting · disorientation · orient', embed });
    expect(rows[0].source_name).toMatch(/Sensorimotor/);
    expect(rows[0].similarity).toBeGreaterThan(0);
    expect(gw.calls[0].summary.mode).toBe('vector');
  });

  it('no embedder → deterministic tag lookup', async () => {
    const gw = new ToolGateway(createPgliteDb(pg), { crewId: 'crew_02', asOf: ANCHOR, allowed: ['knowledge.search'] });
    const rows = await gw.knowledge(['sleep'], 2);
    expect(rows.every((r) => r.tags.includes('sleep'))).toBe(true);
    expect(gw.calls[0].summary.mode).toBe('tags');
  });

  it('pipeline: NASA wording + URL appear as knowledge evidence for the tilting story', async () => {
    const llm: LlmClient = {
      async chatJson(req) {
        return req.schemaName === 'interpretation'
          ? { content: JSON.stringify({ speech_act: 'report', domain: 'physical_symptom', secondary_domain: null, symptoms: [{ said: 'room is tilting', category: 'disorientation', body_system: 'sensorimotor_vestibular' }], onset: null, duration: null, severity: null, activity_context: null, log_entries: [], request_target: null, followup_answers: [], urgency_hint: 'advisory', confidence: 'high', missing_info: [] }), latencyMs: 1, usedSchemaMode: 'json_schema' }
          : { content: JSON.stringify({ explanation: 'Your heart rate is higher than your usual at this point after exercise [E1].', cited: ['E1'] }), latencyMs: 1, usedSchemaMode: 'json_schema' };
      },
    };
    const db = createPgliteDb(pg);
    const t1 = await handleMessage({ crewId: 'crew_02', text: 'I feel the room is tilting' }, { db, llm, model: 'fake', asOf: ANCHOR, embed });
    const r = await handleMessage({ crewId: 'crew_02', eventId: t1.eventId!, text: 'chips', answers: { q_red_flags: 'none', q_onset: 'just_now' } }, { db, llm, model: 'fake', asOf: ANCHOR, embed });
    const r2 = r.stage === 'assess' ? r : await handleMessage({ crewId: 'crew_02', eventId: t1.eventId!, text: 'Mild', answers: { q_severity: 'mild' } }, { db, llm, model: 'fake', asOf: ANCHOR, embed });
    expect(r2.stage).toBe('assess');
    const k = r2.evidence.filter((e) => e.kind === 'knowledge');
    expect(k.length).toBeGreaterThan(0);
    expect(k[0].title).toMatch(/^NASA HRP — Risk of Altered Sensorimotor and Vestibular Function — /);
    expect(k[0].source.url).toBe('https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/');
    expect(k[0].detail.length).toBeGreaterThan(80); // real NASA text, not a placeholder
  });
});
