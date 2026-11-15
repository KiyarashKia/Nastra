/**
 * Retrieval check against the real knowledge base (Supabase + local embeddings).
 *   npm run knowledge:test
 * Each query must return the expected NASA page first, inside the tags its
 * protocol allows. Same filter-then-rank path the pipeline uses.
 */
import { loadEnv } from './env';
import { createSupabaseDb } from '../src/nastra/db/supabase';
import { getLocalEmbedder } from '../src/nastra/knowledge/embed';
import { ToolGateway } from '../src/nastra/tools/gateway';
import { PROTOCOLS } from '../src/nastra/protocols/registry';

loadEnv();
const CASES: { q: string; tags: string[]; expect: string }[] = [
  { q: 'I feel the room is tilting · disorientation', tags: PROTOCOLS.sensorimotor_disorientation.knowledgeTags, expect: 'Sensorimotor' },
  { q: 'everything spins when I turn my head, a bit nauseous · disorientation · nausea', tags: PROTOCOLS.sensorimotor_disorientation.knowledgeTags, expect: 'Sensorimotor' },
  { q: 'I feel faint and my blood pressure feels low', tags: ['cardiovascular', 'sensorimotor_vestibular'], expect: 'Cardiovascular' },
  { q: "can't switch off before the EVA briefing · acute stress", tags: PROTOCOLS.acute_stress.knowledgeTags, expect: 'Behavioral' },
  { q: 'feeling isolated and low, missing home · low mood', tags: PROTOCOLS.acute_stress.knowledgeTags, expect: 'Behavioral' },
  { q: "I can't sleep, my schedule keeps shifting · sleep disruption", tags: PROTOCOLS.acute_stress.knowledgeTags, expect: 'Sleep' },
  { q: 'my vision looks blurry up close · vision change', tags: ['neuro_ocular'], expect: 'Neuro-ocular' },
];

const db = createSupabaseDb();
const embed = await getLocalEmbedder();
let pass = 0;
for (const c of CASES) {
  const gw = new ToolGateway(db, { crewId: 'crew_02', asOf: new Date().toISOString(), allowed: ['knowledge.search'] });
  const rows = await gw.knowledge(c.tags, 3, { text: c.q, embed });
  const top = rows[0];
  const ok = !!top && top.source_name.includes(c.expect);
  pass += ok ? 1 : 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  "${c.q}"`);
  rows.forEach((r, i) => console.log(`   ${i + 1}. ${r.similarity?.toFixed(3) ?? '—'}  ${r.source_name} — ${r.section}`));
}
console.log(`\n${pass}/${CASES.length} queries returned the expected page first`);
process.exit(pass === CASES.length ? 0 : 1);
