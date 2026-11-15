/**
 * NASTRA eval: runs every case in eval/cases.json through
 * normalize → safety screen → interpret (model) → route, and scores it.
 *
 *   npm run eval -- --models qwen/qwen3.5-9b,qwen/qwen3.5-35b-a3b
 *   npm run eval:offline          (safety screen only, no model, no network)
 *   npm run eval -- --only S01,F01 --verbose
 *
 * Reads OPENROUTER_API_KEY from .env.local. Writes eval/results/<timestamp>.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env';
import { normalizeInput } from '../src/nastra/normalize';
import { screenText } from '../src/nastra/safety/redflags';
import { understand } from '../src/nastra/understand';
import { DEFAULT_MODEL, createOpenAICompatibleClient, type LlmClient } from '../src/nastra/llm/provider';
import type { EventState } from '../src/nastra/router';

loadEnv();

interface Expect {
  critical?: boolean;
  speech_act?: string | string[];
  domain?: string | string[];
  body_system?: string;
  action: string | string[];
  protocol?: string | string[];
  followup?: Record<string, string>;
  ready_for_guidance?: boolean;
}
interface Case { id: string; text: string; tags?: string[]; state?: EventState; expect: Expect }

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const all: Case[] = JSON.parse(fs.readFileSync(path.join(root, 'eval', 'cases.json'), 'utf8')).cases;
const only = opt('only')?.split(',');
const cases = only ? all.filter((c) => only.includes(c.id)) : all;
const verbose = flag('verbose');

const anyOf = (exp: string | string[] | undefined, got: string | null | undefined) =>
  exp === undefined || (Array.isArray(exp) ? exp.includes(String(got)) : exp === got);

// ── Offline: deterministic safety screen only ────────────────────────────────
if (flag('offline')) {
  let pass = 0;
  for (const c of cases) {
    const s = screenText(normalizeInput({ crewId: 'crew_02', text: c.text }).utterance);
    const ok = c.expect.critical === undefined || s.critical === c.expect.critical;
    pass += ok ? 1 : 0;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(4)} critical=${String(s.critical).padEnd(5)} ${s.hits.map((h) => h.id).join(',')}${s.negated.length ? ` (negated: ${s.negated.map((n) => n.id).join(',')})` : ''}  "${c.text}"`);
  }
  console.log(`\nSafety screen: ${pass}/${cases.length}`);
  process.exit(pass === cases.length ? 0 : 1);
}

// ── Online: full understanding per model ─────────────────────────────────────
const models = (opt('models') ?? process.env.NASTRA_MODEL_INTERPRET ?? DEFAULT_MODEL).split(',').map((m) => m.trim()).filter(Boolean);
if (!models.length) {
  console.error('No model. Use --models a,b or set NASTRA_MODEL_INTERPRET in .env.local');
  process.exit(1);
}
const llm: LlmClient = createOpenAICompatibleClient();

interface Row { id: string; model: string; ok: boolean; checks: Record<string, boolean>; latencyMs: number; attempts: number; got: Record<string, unknown>; errors: string[] }
const rows: Row[] = [];

for (const model of models) {
  console.log(`\n=== ${model} ===`);
  for (const c of cases) {
    const env = normalizeInput({ crewId: 'crew_02', text: c.text });
    let u;
    try {
      u = await understand(env, llm, { model, state: c.state });
    } catch (err) {
      rows.push({ id: c.id, model, ok: false, checks: { run: false }, latencyMs: 0, attempts: 0, got: {}, errors: [(err as Error).message] });
      console.log(`FAIL  ${c.id}  error: ${(err as Error).message.slice(0, 160)}`);
      continue;
    }
    const i = u.interpretation?.interpretation;
    const a = u.route.action;
    const checks: Record<string, boolean> = {
      critical: c.expect.critical === undefined || u.screen.critical === c.expect.critical,
      action: anyOf(c.expect.action, a.kind),
      speech_act: !i || anyOf(c.expect.speech_act, i.speech_act),
      domain: !i || anyOf(c.expect.domain, i.domain),
      body_system: !i || !c.expect.body_system || i.symptoms.some((s) => s.body_system === c.expect.body_system),
      protocol: c.expect.protocol === undefined || anyOf(c.expect.protocol, a.kind === 'protocol' ? a.protocolId : null),
      followup: !c.expect.followup || Object.entries(c.expect.followup).every(([q, ans]) => i?.followup_answers.some((f) => f.question_id === q && f.answer === ans)),
      ready: c.expect.ready_for_guidance === undefined || (a.kind === 'protocol' && a.readyForGuidance === c.expect.ready_for_guidance),
      parsed: !u.interpretation || u.interpretation.ok,
    };
    const ok = Object.values(checks).every(Boolean);
    const got = i
      ? { speech_act: i.speech_act, domain: i.domain, symptoms: i.symptoms.map((s) => `${s.category}/${s.body_system}`), urgency: u.route.urgency, confidence: i.confidence, action: a.kind, protocol: a.kind === 'protocol' ? a.protocolId : undefined, followup: i.followup_answers }
      : { action: a.kind, safety: u.screen.hits.map((h) => h.id) };
    rows.push({ id: c.id, model, ok, checks, latencyMs: u.interpretation?.latencyMs ?? 0, attempts: u.interpretation?.attempts ?? 0, got, errors: u.interpretation?.errors ?? [] });
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(4)} ${String(u.interpretation?.latencyMs ?? 0).padStart(5)}ms  ${a.kind.padEnd(11)} ${failed.length ? 'wrong: ' + failed.join(',') : ''}  "${c.text.slice(0, 60)}"`);
    if (verbose || !ok) console.log('      got:', JSON.stringify(got), u.interpretation?.errors.length ? `errors: ${u.interpretation.errors.join(' | ')}` : '');
  }
}

console.log('\n=== Summary ===');
for (const model of models) {
  const r = rows.filter((x) => x.model === model);
  const pass = r.filter((x) => x.ok).length;
  const safetyCases = r.filter((x) => cases.find((c) => c.id === x.id)?.expect.action === 'escalate');
  const safetyPass = safetyCases.filter((x) => x.ok).length;
  const lat = r.map((x) => x.latencyMs).filter((x) => x > 0).sort((a, b) => a - b);
  const p50 = lat[Math.floor(lat.length / 2)] ?? 0;
  const retries = r.filter((x) => x.attempts > 1).length;
  console.log(`${model.padEnd(36)} ${pass}/${r.length} pass · escalations ${safetyPass}/${safetyCases.length} · median ${p50}ms · retries ${retries}`);
}

const outDir = path.join(root, 'eval', 'results');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(out, JSON.stringify({ models, rows }, null, 2));
console.log(`\nSaved ${path.relative(root, out)}`);
