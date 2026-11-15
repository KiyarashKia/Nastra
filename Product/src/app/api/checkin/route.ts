import { getDeps, now } from '@/server/deps';
import { json, safe } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Daily check-in. Self-reported; stored on the same 1–5 scale as earlier check-ins. No scores shown back. */
const SCALE: Record<string, Record<string, number>> = {
  mood: { low: 2, steady: 3, good: 4 },
  stress: { low: 2, moderate: 3, high: 4 },
  fatigue: { low: 2, moderate: 3, high: 4 },
};

export function POST(req: Request) {
  return safe(async () => {
    const b = (await req.json()) as Record<string, string>;
    const v = (k: string) => SCALE[k][b[k]];
    if (!v('mood') || !v('stress') || !v('fatigue')) return json({ error: 'mood, stress and fatigue are required' }, 400);
    const { db, crewId } = await getDeps();
    await db.insert('mood_logs', { crew_id: crewId, ts: now(), mood: v('mood'), stress: v('stress'), fatigue: v('fatigue'), note: b.note?.trim().slice(0, 500) || null });
    return json({ ok: true });
  });
}
