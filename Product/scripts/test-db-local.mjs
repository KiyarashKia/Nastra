// Runs every migration in an in-memory Postgres (PGlite + pgvector), reseeds,
// and prints the demo story checks. No Supabase or network needed.
//
//   cd Product && npm i -D @electric-sql/pglite @electric-sql/pglite-pgvector
//   node scripts/test-db-local.mjs
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const db = new PGlite({ extensions: { vector } });

for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  console.log('applied', f);
}

const anchor = new Date().toISOString();
const show = async (label, sql, params = []) => {
  const r = await db.query(sql, params);
  console.log(`\n## ${label}`);
  console.table(r.rows);
};

const seeded = await db.query('select public.nastra_reseed($1::timestamptz) as r', [anchor]);
console.log(seeded.rows[0].r);

await show('crew_02: now vs usual 30 min after exercise',
  `select metric, recent_mean, typical_mean, z_score from post_exercise_comparison('crew_02', $1, 30)`, [anchor]);
await show('crew_02: similar past episodes',
  `select opened_at, utterance, match_score, matched_on
     from similar_episodes('crew_02', 'sensorimotor_vestibular', 'physical_symptom', 'post_exercise', $1)`, [anchor]);
await show('crew_02: last 3 nights',
  `select sleep_end, hours, quality from sleep_logs where crew_id = 'crew_02' order by sleep_end desc limit 3`);
await show('crew_02: next events',
  `select starts_at, title, status from mission_events
    where crew_id = 'crew_02' and ends_at > $1 order by starts_at limit 4`, [anchor]);

// Assertions for the demo story
const ep = await db.query(
  `select count(*)::int n from similar_episodes('crew_02','sensorimotor_vestibular','physical_symptom','post_exercise',$1)`, [anchor]);
const hr = await db.query(
  `select z_score from post_exercise_comparison('crew_02', $1, 30) where metric = 'heart_rate_bpm'`, [anchor]);
const ok = ep.rows[0].n === 2 && Number(hr.rows[0]?.z_score) > 1.5;
console.log(ok ? '\nPASS: demo story intact' : '\nFAIL: demo story broken');
process.exit(ok ? 0 : 1);
