import type { StationDeps } from './deps';

/**
 * Simulated live feed. In simulation/training mode, extend the simulated Bio-Monitor and cabin channels
 * up to now (DB function nastra_sim_tick, deterministic) before any read, so readings stay current and
 * "delayed"/"stale" styling appears only when data is genuinely late. Never runs in live mode.
 * Throttled to once every 30 s per crew member; failures never block a read.
 */
const lastTick = new Map<string, number>();

export async function simTick(deps: Pick<StationDeps, 'db' | 'mode' | 'crewId'>, asOf: string): Promise<void> {
  if (deps.mode === 'live') return;
  const t = Date.parse(asOf);
  if (t - (lastTick.get(deps.crewId) ?? 0) < 30_000) return; // halved for the demo (was 60 s)
  lastTick.set(deps.crewId, t);
  await deps.db.rpcScalar('nastra_sim_tick', { p_crew_id: deps.crewId, p_now: asOf }).catch(() => undefined);
}
