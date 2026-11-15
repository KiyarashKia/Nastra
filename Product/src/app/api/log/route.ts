import { getDeps, now } from '@/server/deps';
import { json, safe } from '@/server/http';
import { commitLog } from '@/nastra/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Saves self-reported entries the crew member confirmed in the conversation. */
export function POST(req: Request) {
  return safe(async () => {
    const { entries } = (await req.json()) as { entries?: { field: string; value: string }[] };
    if (!Array.isArray(entries) || !entries.length) return json({ error: 'entries required' }, 400);
    const { db, crewId } = await getDeps();
    await commitLog(db, crewId, entries, new Date(now()));
    return json({ ok: true });
  });
}
