/**
 * Try one message by hand:
 *   npm run try -- "I feel the room is tilting"
 *   npm run try -- --model google/gemma-4-26b-a4b-it "Show my sleep this week"
 */
import { loadEnv } from './env';
import { normalizeInput } from '../src/nastra/normalize';
import { understand } from '../src/nastra/understand';
import { DEFAULT_MODEL, createOpenAICompatibleClient } from '../src/nastra/llm/provider';

loadEnv();
const args = process.argv.slice(2);
const mi = args.indexOf('--model');
const model = mi >= 0 ? args.splice(mi, 2)[1] : process.env.NASTRA_MODEL_INTERPRET ?? DEFAULT_MODEL;
const text = args.join(' ');
if (!model || !text) {
  console.error('Usage: npm run try -- [--model <id>] "message"');
  process.exit(1);
}
const u = await understand(normalizeInput({ crewId: 'crew_02', text }), createOpenAICompatibleClient(), { model });
console.log(JSON.stringify({
  safety: u.screen,
  interpretation: u.interpretation?.interpretation,
  attempts: u.interpretation?.attempts,
  latencyMs: u.interpretation?.latencyMs,
  errors: u.interpretation?.errors,
  route: { action: u.route.action, urgency: u.route.urgency, protocol: u.route.protocol?.id, trace: u.route.trace },
}, null, 2));
