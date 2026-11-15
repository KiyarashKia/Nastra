import type { Db } from '../db/types';
import type { ToolName } from '../protocols/registry';
import type { Embedder } from '../knowledge/embed';
import { toVectorLiteral } from '../knowledge/chunk';

/**
 * MCP-style tool gateway. Four namespaces (telemetry · health · mission ·
 * knowledge), one permission check, one audit trail. The protocol decides
 * which tools are allowed; anything else throws.
 */
export class ToolNotAllowedError extends Error {}

export interface ToolCallRecord {
  tool: ToolName;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
  summary: Record<string, unknown>;
}

export interface VitalsNow {
  mode: 'post_exercise' | 'resting_baseline';
  minutesSinceExercise: number | null;
  windowMinutes: number;
  metrics: { metric: string; recent: number; reference: number; sd: number | null; z: number | null }[];
}
export interface SleepRow { sleep_end: string; hours: number; quality: number; avg_hours_14d: number }
export interface MoodRow { ts: string; mood: number; stress: number; fatigue: number; note: string | null }
export interface MissionCtx {
  mission: string;
  mission_day: number;
  context: string;
  minutes_since_exercise: number | null;
  hours_to_next_eva: number | null;
  current_activity: { title: string; activity: string } | null;
  next_events: { title: string; activity: string; starts_at: string; hours_until: number }[];
}
export interface EpisodeRow {
  id: string; opened_at: string; utterance: string; domain: string; mission_context: string;
  protocol_id: string | null; outcome: string | null; outcome_notes: string | null;
  context_snapshot: Record<string, unknown>; match_score: number; matched_on: string[];
}
export interface KnowledgeRow { id: number; source_org: string; source_name: string; source_url: string; section: string | null; content: string; tags: string[]; similarity?: number }

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export class ToolGateway {
  readonly calls: ToolCallRecord[] = [];

  constructor(
    private db: Db,
    private ctx: { crewId: string; asOf: string; allowed: ToolName[] },
  ) {}

  private async run<T>(tool: ToolName, args: Record<string, unknown>, fn: () => Promise<T>, summarize: (r: T) => Record<string, unknown>): Promise<T> {
    if (!this.ctx.allowed.includes(tool)) {
      this.calls.push({ tool, args, ok: false, ms: 0, summary: { error: 'not allowed by protocol' } });
      throw new ToolNotAllowedError(`${tool} is not allowed here`);
    }
    const t = Date.now();
    try {
      const r = await fn();
      this.calls.push({ tool, args, ok: true, ms: Date.now() - t, summary: summarize(r) });
      return r;
    } catch (err) {
      this.calls.push({ tool, args, ok: false, ms: Date.now() - t, summary: { error: (err as Error).message } });
      throw err;
    }
  }

  /** Context-matched comparison: after exercise vs. the person's usual after exercise; otherwise vs. resting baseline. */
  vitalsNow(windowMinutes = 30): Promise<VitalsNow> {
    const { crewId, asOf } = this.ctx;
    return this.run('telemetry.vitals_now', { windowMinutes }, async () => {
      const post = await this.db.rpc<Record<string, unknown>>('post_exercise_comparison', {
        p_crew_id: crewId, p_as_of: asOf, p_window_minutes: windowMinutes,
      });
      if (post.length && Number(post[0].n_typical) > 0) {
        return {
          mode: 'post_exercise' as const,
          minutesSinceExercise: num(post[0].minutes_since_exercise),
          windowMinutes,
          metrics: post.map((r) => ({ metric: String(r.metric), recent: Number(r.recent_mean), reference: Number(r.typical_mean), sd: num(r.typical_sd), z: num(r.z_score) })),
        };
      }
      const dev = await this.db.rpc<Record<string, unknown>>('vitals_deviation', {
        p_crew_id: crewId, p_as_of: asOf, p_window_minutes: windowMinutes,
      });
      return {
        mode: 'resting_baseline' as const,
        minutesSinceExercise: null,
        windowMinutes,
        metrics: dev.map((r) => ({ metric: String(r.metric), recent: Number(r.recent_mean), reference: Number(r.baseline_mean), sd: num(r.baseline_sd), z: num(r.z_score) })),
      };
    }, (r) => ({ mode: r.mode, metrics: r.metrics.length }));
  }

  recentSleep(n = 3): Promise<SleepRow[]> {
    return this.run('health.recent_sleep', { n }, async () =>
      (await this.db.rpc<Record<string, unknown>>('recent_sleep', { p_crew_id: this.ctx.crewId, p_as_of: this.ctx.asOf, p_n: n }))
        .map((r) => ({ sleep_end: String(r.sleep_end), hours: Number(r.hours), quality: Number(r.quality), avg_hours_14d: Number(r.avg_hours_14d) })),
    (r) => ({ rows: r.length }));
  }

  recentMood(n = 2): Promise<MoodRow[]> {
    return this.run('health.recent_mood', { n }, async () =>
      (await this.db.rpc<Record<string, unknown>>('recent_mood', { p_crew_id: this.ctx.crewId, p_as_of: this.ctx.asOf, p_n: n }))
        .map((r) => ({ ts: String(r.ts), mood: Number(r.mood), stress: Number(r.stress), fatigue: Number(r.fatigue), note: (r.note as string) ?? null })),
    (r) => ({ rows: r.length }));
  }

  missionContext(): Promise<MissionCtx> {
    return this.run('mission.current_context', {}, async () => {
      const raw = await this.db.rpcScalar<MissionCtx | string>('mission_context', { p_crew_id: this.ctx.crewId, p_as_of: this.ctx.asOf });
      const c = (typeof raw === 'string' ? JSON.parse(raw) : raw) as MissionCtx;
      return { ...c, minutes_since_exercise: num(c.minutes_since_exercise), hours_to_next_eva: num(c.hours_to_next_eva) };
    }, (r) => ({ context: r.context }));
  }

  similarEpisodes(args: { bodySystem: string | null; domain: string | null; missionContext: string | null }): Promise<EpisodeRow[]> {
    return this.run('health.similar_episodes', args, async () =>
      (await this.db.rpc<Record<string, unknown>>('similar_episodes', {
        p_crew_id: this.ctx.crewId, p_body_system: args.bodySystem, p_domain: args.domain,
        p_mission_context: args.missionContext, p_before: this.ctx.asOf,
      })).map((r) => ({
        ...(r as unknown as EpisodeRow),
        opened_at: String(r.opened_at),
        match_score: Number(r.match_score),
        context_snapshot: (typeof r.context_snapshot === 'string' ? JSON.parse(r.context_snapshot) : r.context_snapshot) as Record<string, unknown>,
      })),
    (r) => ({ rows: r.length, ids: r.map((e) => e.id) }));
  }

  /**
   * Knowledge retrieval: FILTER to the protocol's tags (deterministic), then RANK by
   * vector similarity to the query. Falls back to tag-only order if there is no
   * embedder or no embedded snippets.
   */
  knowledge(tags: string[], n = 3, query?: { text: string; embed?: Embedder }): Promise<(KnowledgeRow & { similarity?: number })[]> {
    return this.run('knowledge.search', { tags, n, query: query?.text ?? null }, async () => {
      if (query?.embed) {
        try {
          const vec = toVectorLiteral(await query.embed(query.text));
          const ranked = await this.db.rpc<KnowledgeRow & { similarity: number }>('match_knowledge', {
            query_embedding: vec, allowed_tags: tags, match_count: n,
          });
          if (ranked.length) return ranked.map((r) => ({ ...r, similarity: Number(r.similarity) }));
        } catch {
          // fall through to the deterministic tag lookup
        }
      }
      return this.db.rpc<KnowledgeRow>('knowledge_by_tags', { p_tags: tags, p_n: n });
    }, (r) => ({ rows: r.length, mode: r.some((x) => x.similarity !== undefined) ? 'vector' : 'tags', top: r.map((x) => `${x.source_name} / ${x.section}${x.similarity !== undefined ? ` (${x.similarity.toFixed(2)})` : ''}`) }));
  }
}
