/**
 * Load NASA knowledge into Supabase.
 *   npm run ingest -- --dry      print the chunks, touch nothing
 *   npm run ingest               embed locally (gte-small) and upsert into knowledge_snippets
 *
 * Source: knowledge/hrp_snapshot.json (NASA HRP risk pages, dated snapshot).
 * Re-running replaces each page's chunks; it never duplicates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env';
import { chunkSnapshot, toVectorLiteral, type SnapshotPage } from '../src/nastra/knowledge/chunk';
import { EMBED_MODEL, getLocalEmbedder } from '../src/nastra/knowledge/embed';

loadEnv();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snap = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'hrp_snapshot.json'), 'utf8')) as { retrieved_at: string; pages: SnapshotPage[] };
const chunks = chunkSnapshot(snap.pages);

console.log(`${snap.pages.length} pages → ${chunks.length} chunks (snapshot ${snap.retrieved_at})`);
if (process.argv.includes('--dry')) {
  for (const c of chunks) {
    console.log(`\n[${c.tags.join(',')}] ${c.source_name} — ${c.section} (${c.content.split(/\s+/).length} words)\n  ${c.content.slice(0, 160)}…`);
  }
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local');
const sb = createClient(url, key, { auth: { persistSession: false } });

console.log(`Loading embedding model ${EMBED_MODEL} (first run downloads ~30 MB)…`);
const embed = await getLocalEmbedder();

const t0 = Date.now();
const rows = [];
for (const c of chunks) {
  rows.push({
    source_org: c.source_org, source_name: c.source_name, source_url: c.source_url,
    section: c.section, chunk_index: c.chunk_index, tags: c.tags, content: c.content,
    embedding: toVectorLiteral(await embed(c.embedText)), usage: 'direct',
  });
}
console.log(`Embedded ${rows.length} chunks in ${Date.now() - t0} ms`);

for (const pageUrl of new Set(rows.map((r) => r.source_url))) {
  const { error: delErr } = await sb.from('knowledge_snippets').delete().eq('source_url', pageUrl);
  if (delErr) throw new Error(`delete ${pageUrl}: ${delErr.message}`);
  const { error: insErr } = await sb.from('knowledge_snippets').insert(rows.filter((r) => r.source_url === pageUrl));
  if (insErr) throw new Error(`insert ${pageUrl}: ${insErr.message}`);
  console.log(`  ✓ ${pageUrl}`);
}
console.log('Done. Check retrieval with: npm run knowledge:test');
