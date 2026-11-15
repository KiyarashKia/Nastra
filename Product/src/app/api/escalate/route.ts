import { getDeps, now } from '@/server/deps';
import { json, safe } from '@/server/http';
import { escalateByCrew } from '@/server/escalate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(req: Request) {
  return safe(async () => {
    const body = (await req.json().catch(() => ({}))) as { target?: string; note?: string };
    const target = body.target === 'crew_medical_officer' ? 'crew_medical_officer' : 'flight_surgeon';
    return json(await escalateByCrew(await getDeps(), now(), target, body.note?.slice(0, 500)));
  });
}
