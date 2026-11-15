import type { Db } from '../db/types';
import { ToolGateway } from '../tools/gateway';

/**
 * Vitals monitor. Deterministic, no model.
 *
 * Raises an ADVISORY when a vital is noticeably different from the crew member's
 * own baseline (|z| ≥ 1.5, the same display cutoff the evidence panel uses), or
 * when sleep has been more than 1 h below their 14-day average for 3 nights.
 * A personal deviation is a statistical observation, not a clinical threshold,
 * so it never raises Caution or Warning on its own (decision 2026-11-15).
 * Clears its own advisory when the value is back within range.
 */
export const MONITOR_Z = 1.5;

const LABEL: Record<string, { name: string; unit: string; above: string; below: string }> = {
  heart_rate_bpm: { name: 'Heart rate', unit: 'bpm', above: 'Heart rate above your usual', below: 'Heart rate below your usual' },
  hrv_rmssd_ms: { name: 'HRV', unit: 'ms', above: 'HRV above your usual', below: 'HRV below your usual' },
  systolic_mmhg: { name: 'Systolic BP', unit: 'mmHg', above: 'Blood pressure above your usual', below: 'Blood pressure below your usual' },
  spo2_pct: { name: 'SpO₂', unit: '%', above: 'SpO₂ above your usual', below: 'SpO₂ below your usual' },
  resp_rate_bpm: { name: 'Breathing rate', unit: '/min', above: 'Breathing rate above your usual', below: 'Breathing rate below your usual' },
};

interface Desired { metric: string; title: string; detail: string }

export async function runMonitor(db: Db, crewId: string, asOf: string): Promise<{ raised: number; cleared: number }> {
  const gw = new ToolGateway(db, { crewId, asOf, allowed: ['telemetry.vitals_now', 'health.recent_sleep'] });
  const desired: Desired[] = [];

  const vitals = await gw.vitalsNow(30).catch(() => undefined);
  if (vitals) {
    const when = vitals.mode === 'post_exercise' ? ` at ${vitals.minutesSinceExercise} min after exercise` : ' at rest';
    for (const m of vitals.metrics) {
      const l = LABEL[m.metric];
      if (!l || m.z === null || Math.abs(m.z) < MONITOR_Z) continue;
      const d = m.recent - m.reference;
      desired.push({
        metric: m.metric,
        title: `${m.z > 0 ? l.above : l.below}${vitals.mode === 'post_exercise' ? ' after exercise' : ''}`,
        detail: `${Math.round(m.recent)} ${l.unit} vs your usual ${Math.round(m.reference)}${when} (${d > 0 ? '+' : '−'}${Math.abs(Math.round(d))}). Personal comparison, not a clinical threshold.`,
      });
    }
  }
  const sleep = await gw.recentSleep(3).catch(() => []);
  if (sleep.length === 3 && sleep.every((s) => s.hours < s.avg_hours_14d - 1)) {
    desired.push({
      metric: 'sleep',
      title: 'Sleep below your average 3 nights running',
      detail: `${sleep.map((s) => `${s.hours.toFixed(1)} h`).join(', ')} vs your 14-day average ${sleep[0].avg_hours_14d.toFixed(1)} h.`,
    });
  }

  const existing = (await db.rpc<{ id: string; metric: string | null; engine: string }>('crew_alert_feed', { p_crew_id: crewId, p_include_inactive: false }))
    .filter((a) => a.engine === 'nastra-monitor');
  let raised = 0;
  let cleared = 0;
  for (const d of desired) {
    if (existing.some((e) => e.metric === d.metric)) continue;
    await db.insert('crew_alerts', {
      crew_id: crewId, created_at: asOf, priority: 'advisory', title: d.title, detail: d.detail,
      source: d.metric === 'sleep' ? 'Sleep logs' : 'Health telemetry', engine: 'nastra-monitor', metric: d.metric,
    });
    raised++;
  }
  for (const e of existing) {
    if (desired.some((d) => d.metric === e.metric)) continue;
    await db.update('crew_alerts', e.id, { active: false, cleared_at: asOf });
    cleared++;
  }
  return { raised, cleared };
}
