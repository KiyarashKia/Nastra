import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Db, WritableTable } from './types';

/** Server-only. Uses the SECRET key; never import this into browser code. */
export function createSupabaseDb(opts?: { url?: string; secretKey?: string }): Db {
  const url = opts?.url ?? process.env.SUPABASE_URL;
  const key = opts?.secretKey ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set (server only)');
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async rpc(fn, args) {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw new Error(`rpc ${fn}: ${error.message}`);
      return (Array.isArray(data) ? data : data == null ? [] : [data]) as never;
    },
    async rpcScalar(fn, args) {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw new Error(`rpc ${fn}: ${error.message}`);
      return data as never;
    },
    async insert(table: WritableTable, row) {
      const { data, error } = await sb.from(table).insert(row).select().single();
      if (error) throw new Error(`insert ${table}: ${error.message}`);
      return data as never;
    },
    async update(table: WritableTable, id, patch) {
      const { error } = await sb.from(table).update(patch).eq('id', id);
      if (error) throw new Error(`update ${table}: ${error.message}`);
    },
    async getById(table, id) {
      const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(`get ${table}: ${error.message}`);
      return (data ?? null) as never;
    },
  };
}
