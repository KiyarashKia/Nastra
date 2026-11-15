import { getDeps } from '@/server/deps';
import { json, safe } from '@/server/http';
import { closeEvent } from '@/nastra/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(req: Request) {
  return safe(async () => {
    const { eventId, outcome, notes } = (await req.json()) as { eventId: string; outcome?: string; notes?: string };
    if (!eventId) return json({ error: 'eventId is required' }, 400);
    await closeEvent((await getDeps()).db, eventId, outcome ?? 'resolved', notes);
    return json({ ok: true });
  });
}
