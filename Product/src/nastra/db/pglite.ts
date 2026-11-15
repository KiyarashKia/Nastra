import type { PGlite } from '@electric-sql/pglite';
import type { Db, WritableTable } from './types';

const IDENT = /^[a-z_][a-z0-9_]*$/;
const safe = (s: string) => {
  if (!IDENT.test(s)) throw new Error(`unsafe identifier: ${s}`);
  return s;
};

/** Same Db contract on an in-memory Postgres, for offline end-to-end tests. */
export function createPgliteDb(pg: PGlite): Db {
  const call = (fn: string, args: Record<string, unknown>) => {
    const keys = Object.keys(args);
    const named = keys.map((k, i) => `${safe(k)} => $${i + 1}`).join(', ');
    return { sql: `${safe(fn)}(${named})`, params: keys.map((k) => args[k]) };
  };
  return {
    async rpc(fn, args) {
      const { sql, params } = call(fn, args);
      return (await pg.query(`select * from ${sql}`, params)).rows as never;
    },
    async rpcScalar(fn, args) {
      const { sql, params } = call(fn, args);
      return ((await pg.query<{ v: unknown }>(`select ${sql} as v`, params)).rows[0]?.v ?? null) as never;
    },
    async insert(table: WritableTable, row) {
      const keys = Object.keys(row);
      const vals = keys.map((k) => (row[k] !== null && typeof row[k] === 'object' && !Array.isArray(row[k]) ? JSON.stringify(row[k]) : row[k]));
      const sql = `insert into ${safe(table)} (${keys.map(safe).join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning *`;
      return (await pg.query(sql, vals)).rows[0] as never;
    },
    async update(table: WritableTable, id, patch) {
      const keys = Object.keys(patch);
      const vals = keys.map((k) => (patch[k] !== null && typeof patch[k] === 'object' && !Array.isArray(patch[k]) ? JSON.stringify(patch[k]) : patch[k]));
      await pg.query(`update ${safe(table)} set ${keys.map((k, i) => `${safe(k)} = $${i + 1}`).join(', ')} where id = $${keys.length + 1}`, [...vals, id]);
    },
    async getById(table, id) {
      return ((await pg.query(`select * from ${safe(table)} where id = $1`, [id])).rows[0] ?? null) as never;
    },
  };
}
