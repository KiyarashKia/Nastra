# NASTRA — Product

The working NASTRA prototype. `../NHIS` is the design system; this folder is the product.

**All crew data is simulated.** Crew names and the mission are fictional.

## Status

| Phase | State |
|---|---|
| 1. Data (Supabase schema + simulated mission) | ✅ Live on Supabase project `Nastra` |
| 2a. Brain: understanding (safety → interpret → route) + test set | ✅ Code + 39 unit tests pass. Model comparison: run `npm run eval` |
| 2b. Brain: retrieve → respond → validate → log | ✅ 49 tests incl. end-to-end. Try it live: `npm run chat` |
| 3. Knowledge (NASA HRP pages, cited) | ✅ Snapshot + chunks + local embeddings. Run `npm run ingest`, then `npm run knowledge:test` |
| 4. Station UI | — |

## Layout

```
Product/
  supabase/migrations/   schema, read functions, simulation generator
  src/nastra/            the brain (see docs/BRAIN.md)
  eval/                  test set + results
  tests/                 unit tests (no network)
  scripts/               eval runner, try one message, local DB check
  docs/DATA_MODEL.md     what each table is, which NASA/CSA source shaped it
  .env.example           keys the server will need (server-only)
```

## Reset the demo data

Run in the Supabase SQL editor (or ask Claude to run it) right before a demo:

```sql
select public.nastra_reseed();   -- "now" becomes 16:00 station time, mission day 42
```

It wipes crew data (including live events) and regenerates 21 days. Same anchor → same data.

## Check the SQL locally (no Supabase needed)

```bash
cd Product
npm i -D @electric-sql/pglite @electric-sql/pglite-pgvector
node scripts/test-db-local.mjs     # prints the demo story, ends with PASS/FAIL
```

## Access rules

- RLS is on for every table, with no policies → the browser roles (`anon`, `authenticated`) can read nothing.
- Every NASTRA function has `EXECUTE` revoked from `anon` and `authenticated`.
- Only the Next.js server, using the **secret** key from `.env.local`, touches the database.
- The model never runs SQL. The tool gateway calls the named functions below.
