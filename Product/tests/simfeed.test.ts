import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import fs from 'node:fs';
import path from 'node:path';

const ANCHOR = '2026-11-15T20:00:00.000Z';
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite({ extensions: { vector } });
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  await pg.query('select nastra_reseed($1::timestamptz)', [ANCHOR]);
}, 120_000);

describe('simulated live feed', () => {
  it('extends vitals in 150-second steps up to now, deterministically and labelled', async () => {
    const now = new Date(Date.parse(ANCHOR) + 23 * 60_000).toISOString();
    const n = (await pg.query<{ n: number }>('select public.nastra_sim_tick($1, $2::timestamptz) as n', ['crew_02', now])).rows[0].n;
    expect(n).toBe(9);
    const rows = (await pg.query<{ ts: Date; source: string; heart_rate_bpm: string }>(
      "select ts, source, heart_rate_bpm from public.vitals where crew_id = 'crew_02' and ts > $1 order by ts", [ANCHOR])).rows;
    expect(rows).toHaveLength(9);
    expect(rows.every((r) => r.source === 'simulated:bio-monitor (feed)')).toBe(true);
    expect(new Date(rows[8].ts).toISOString()).toBe('2026-11-15T20:22:30.000Z');
    // Idempotent: a second tick at the same time adds nothing.
    expect((await pg.query<{ n: number }>('select public.nastra_sim_tick($1, $2::timestamptz) as n', ['crew_02', now])).rows[0].n).toBe(0);
  });
});

describe('old data never reads as zero (user run 2026-11-15: "0 bpm, −69 vs baseline")', () => {
  it('with an empty 30-min window, tiles show the last real reading, marked delayed/stale', async () => {
    const { createPgliteDb } = await import('../src/nastra/db/pglite');
    const { getOverview } = await import('../src/nastra/station/read');
    const pg2 = new PGlite({ extensions: { vector } });
    const dir = path.join(__dirname, '..', 'supabase', 'migrations');
    for (const f of fs.readdirSync(dir).sort()) await pg2.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    await pg2.query('select nastra_reseed($1::timestamptz)', [ANCHOR]);
    const later = new Date(Date.parse(ANCHOR) + 2 * 3600_000).toISOString();   // no feed: data is 2 h old
    const o = await getOverview(createPgliteDb(pg2), 'crew_02', later);
    const hr = o.tiles.find((t) => t.key === 'heart_rate_bpm')!;
    expect(hr.value).toBeGreaterThan(30);
    expect(['delayed', 'stale']).toContain(hr.quality);
  }, 120_000);
});
