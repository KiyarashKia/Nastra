/**
 * The only way NASTRA touches data. Reads are named database functions (rpc);
 * writes are inserts/updates on the event-log tables. No free SQL anywhere,
 * and the model never sees this interface.
 */
export interface Db {
  rpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T[]>;
  rpcScalar<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T>;
  insert<T = Record<string, unknown>>(table: WritableTable, row: Record<string, unknown>): Promise<T>;
  update(table: WritableTable, id: string, patch: Record<string, unknown>): Promise<void>;
  getById<T = Record<string, unknown>>(table: 'health_events', id: string): Promise<T | null>;
}

export type WritableTable = 'health_events' | 'event_turns' | 'tool_calls' | 'mood_logs' | 'sleep_logs' | 'surgeon_alerts' | 'crew_alerts';

export interface HealthEventRow {
  id: string;
  crew_id: string;
  opened_at: string;
  status: 'open' | 'awaiting_followup' | 'resolved' | 'escalated';
  protocol_id: string | null;
  context_snapshot: Record<string, unknown>;
}
