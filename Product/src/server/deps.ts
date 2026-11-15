import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../nastra/db/types';
import { createSupabaseDb } from '../nastra/db/supabase';
import { createOpenAICompatibleClient, DEFAULT_MODEL, type LlmClient } from '../nastra/llm/provider';
import type { Embedder } from '../nastra/knowledge/embed';
import { devStubLlm } from './dev-stub';

/**
 * Server-only dependencies for NASTRA Station, created once per server process.
 *
 *   NASTRA_DB=supabase (default) — the real Supabase project, secret key from .env.local
 *   NASTRA_DB=pglite             — in-memory Postgres with the same migrations, reseeded at start.
 *                                  Fully offline; data resets when the server restarts.
 *   NASTRA_LLM=stub              — DEV ONLY keyword stub instead of a model, for UI work without
 *                                  a network. Labelled in the UI. Never use for a demo.
 *   NASTRA_MODE=simulation (default) | live | training — the data is simulated, so the
 *                                  Station frame says so (NHIS A9).
 */
export interface StationDeps {
  db: Db;
  llm: LlmClient;
  model: string;
  respondModel: string;
  embed?: Embedder;
  crewId: string;
  mode: 'live' | 'simulation' | 'training';
  dbKind: 'supabase' | 'pglite';
  llmKind: 'model' | 'stub';
}

const g = globalThis as unknown as { __nastraDeps?: Promise<StationDeps>; __nastraEmbed?: Promise<Embedder | undefined> };

export function getDeps(): Promise<StationDeps> {
  g.__nastraDeps ??= create();
  return g.__nastraDeps;
}

async function create(): Promise<StationDeps> {
  const dbKind = process.env.NASTRA_DB === 'pglite' ? 'pglite' : 'supabase';
  const db = dbKind === 'pglite' ? await createLocalDb() : createSupabaseDb();
  const llmKind = process.env.NASTRA_LLM === 'stub' ? 'stub' : 'model';
  const model = process.env.NASTRA_MODEL_INTERPRET || DEFAULT_MODEL;
  const deps: StationDeps = {
    db,
    llm: llmKind === 'stub' ? devStubLlm() : createOpenAICompatibleClient(),
    model,
    respondModel: process.env.NASTRA_MODEL_RESPOND || model,
    crewId: process.env.NASTRA_CREW || 'crew_02',
    mode: (['live', 'training'].includes(process.env.NASTRA_MODE ?? '') ? process.env.NASTRA_MODE : 'simulation') as StationDeps['mode'],
    dbKind,
    llmKind,
  };
  // Knowledge ranking embedder loads in the background; until then retrieval is tag-filtered.
  g.__nastraEmbed ??= import('../nastra/knowledge/embed').then((m) => m.getLocalEmbedder()).catch(() => undefined);
  g.__nastraEmbed.then((e) => { deps.embed = e; });
  return deps;
}

async function createLocalDb(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite-pgvector');
  const { createPgliteDb } = await import('../nastra/db/pglite');
  const pg = new PGlite({ extensions: { vector } });
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  await pg.query('select nastra_reseed($1::timestamptz)', [new Date().toISOString()]);
  return createPgliteDb(pg);
}

export const now = () => new Date().toISOString();
