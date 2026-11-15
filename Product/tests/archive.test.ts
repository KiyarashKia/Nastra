import { expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import fs from 'node:fs';
import path from 'node:path';

it('reseed archives live events before wiping them', async () => {
  const pg = new PGlite({ extensions: { vector } });
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  await pg.query('select nastra_reseed()');
  const ev = (await pg.query<{ id: string }>(`insert into health_events (crew_id, status, origin, utterance) values ('crew_02','escalated','live','yes') returning id`)).rows[0];
  await pg.query(`insert into event_turns (event_id, role, content) values ($1,'crew','yes')`, [ev.id]);
  const r = (await pg.query<{ r: Record<string, unknown> }>('select nastra_reseed() as r')).rows[0].r;
  expect(r.archived_live_events).toBe(1);
  const a = (await pg.query<{ n: number; turns: number }>(`select count(*)::int n, max(jsonb_array_length(event->'turns'))::int turns from session_archive`)).rows[0];
  expect(a).toEqual({ n: 1, turns: 1 });
  expect((await pg.query<{ n: number }>(`select count(*)::int n from health_events where origin='live'`)).rows[0].n).toBe(0);
}, 60_000);
