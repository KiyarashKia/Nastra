import { getDeps } from '@/server/deps';
import { json, safe } from '@/server/http';
import { crewProfile } from '@/nastra/station/read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Static-ish session info for the shell: who, which mode, which model and data source. */
export function GET() {
  return safe(async () => {
    const d = await getDeps();
    const profile = await crewProfile(d.db, d.crewId, new Date().toISOString());
    return json({
      profile, mode: d.mode, dbKind: d.dbKind, llmKind: d.llmKind, model: d.model,
      knowledgeRanking: d.embed ? 'vector' : 'tags',
      demoControls: process.env.NASTRA_DEMO_CONTROLS !== 'off',
      linkDelayLabel: process.env.NASTRA_LINK_RTT ? `RTT ${process.env.NASTRA_LINK_RTT} s` : 'RTT 2.6 s',
    });
  });
}
