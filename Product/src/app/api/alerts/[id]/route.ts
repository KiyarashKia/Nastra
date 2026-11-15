import { getDeps, now } from '@/server/deps';
import { json, safe } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Acknowledge stops repeat annunciation; it does not resolve or reclassify (NHIS A5). */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return safe(async () => {
    const { id } = await ctx.params;
    const { action } = (await req.json()) as { action: 'acknowledge' | 'suppress' };
    const { db } = await getDeps();
    if (action === 'acknowledge') await db.update('crew_alerts', id, { acknowledged_at: now() });
    else if (action === 'suppress') await db.update('crew_alerts', id, { annunciation: 'suppressed' });
    else return json({ error: 'unknown action' }, 400);
    return json({ ok: true });
  });
}
