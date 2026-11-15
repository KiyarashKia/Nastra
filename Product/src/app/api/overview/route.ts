import { getDeps, now } from '@/server/deps';
import { json, safe } from '@/server/http';
import { simTick } from '@/server/feed';
import { getOverview } from '@/nastra/station/read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return safe(async () => {
    const deps = await getDeps();
    await simTick(deps, now());
    return json(await getOverview(deps.db, deps.crewId, now()));
  });
}
