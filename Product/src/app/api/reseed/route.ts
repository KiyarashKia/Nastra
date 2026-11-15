import { getDeps, now } from '@/server/deps';
import { json, safe } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Demo control: reset simulated data to "now" (live chats are archived first). Off with NASTRA_DEMO_CONTROLS=off. */
export function POST() {
  return safe(async () => {
    if (process.env.NASTRA_DEMO_CONTROLS === 'off') return json({ error: 'demo controls are off' }, 403);
    const { db } = await getDeps();
    return json(await db.rpcScalar('nastra_reseed', { p_anchor: now() }));
  });
}
