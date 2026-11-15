/**
 * Talk to NASTRA in the terminal — real Supabase data, real model.
 *   npm run chat                 (as crew_02, R. Tanaka)
 *   npm run chat -- --crew crew_03
 *
 * Commands:  /reseed  reset demo data to "now"      /new    start a new event
 *            /close   close the open event          /ev     show/hide evidence
 *            /crew X  switch crew member            /quit
 */
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadEnv } from './env';
import { createSupabaseDb } from '../src/nastra/db/supabase';
import { createOpenAICompatibleClient, DEFAULT_MODEL } from '../src/nastra/llm/provider';
import { closeEvent, commitLog, handleMessage, type NastraReply } from '../src/nastra/pipeline';
import { getLocalEmbedder, type Embedder } from '../src/nastra/knowledge/embed';

loadEnv();
const args = process.argv.slice(2);
let crewId = args.includes('--crew') ? args[args.indexOf('--crew') + 1] : 'crew_02';
const model = process.env.NASTRA_MODEL_INTERPRET || DEFAULT_MODEL;
const respondModel = process.env.NASTRA_MODEL_RESPOND || model;
const db = createSupabaseDb();
const llm = createOpenAICompatibleClient();
let embed: Embedder | undefined;
try { embed = await getLocalEmbedder(); } catch (e) { console.log(`(knowledge ranking off: ${(e as Error).message.slice(0, 80)})`); }

const c = { dim: '\x1b[2m', b: '\x1b[1m', red: '\x1b[31m', yel: '\x1b[33m', cyan: '\x1b[36m', grn: '\x1b[32m', x: '\x1b[0m' };
const URG: Record<string, string> = { nominal: c.grn, advisory: c.cyan, caution: c.yel, warning: c.red };

let eventId: string | undefined;
let showEvidence = true;
let pendingLog: NastraReply['confirmLog'] | undefined;

function render(r: NastraReply) {
  const u = URG[r.urgency] ?? '';
  console.log(`\n${u}${c.b}NASTRA · ${r.urgency.toUpperCase()}${c.x}${r.protocol ? ` ${c.dim}· ${r.protocol.title} (${r.protocol.id} v${r.protocol.version}, ${r.protocol.status})${c.x}` : ''}`);
  if (r.headline) console.log(`${c.red}${c.b}${r.headline}${c.x}`);
  if (r.immediateStep) console.log(`${c.b}→ ${r.immediateStep}${c.x}`);
  if (r.explanation) console.log(`\n${r.explanation}${r.explanationSource === 'fallback' && (r.action === 'protocol' || r.action === 'answer_data') ? ` ${c.dim}(fact-only fallback)${c.x}` : ''}`);
  if (r.explanationIssues?.length) console.log(`${c.yel}${c.dim}model text rejected: ${r.explanationIssues.join(' | ')}${c.x}`);
  for (const s of r.steps) console.log(`  • ${s}`);
  if (r.alert) {
    console.log(r.alert.delivered
      ? `\n${c.red}${c.b}▲ Flight surgeon alerted${c.x} ${c.dim}· alert ${r.alert.id?.slice(0, 8)} pending · open \`npm run surgeon\` to see the ground side${c.x}`
      : `\n${c.red}${c.b}▲ ALERT NOT DELIVERED${c.x} ${c.dim}(${r.alert.error?.slice(0, 80)})${c.x}`);
  }
  if (r.questions.length) {
    console.log('');
    for (const q of r.questions) console.log(`  ${q.redFlag ? `${c.red}!${c.x}` : '?'} ${q.text}`);
  }
  if (r.confirmLog?.length) console.log(`  ${r.confirmLog.map((e) => `${e.field}: ${e.value}`).join(' · ')}   ${c.dim}(type "yes" to save)${c.x}`);
  if (showEvidence && r.evidence.length) {
    console.log(`\n${c.dim}Evidence`);
    for (const e of r.evidence) console.log(`  [${e.id}] ${e.kind.padEnd(9)} ${e.title}: ${e.detail}${e.source.url ? `\n             ${e.source.url}` : ''}`);
    console.log(c.x);
  }
  console.log(`${c.dim}${r.disclaimer}  ·  ${r.action} · event ${r.eventId?.slice(0, 8) ?? '—'} ${r.eventStatus ?? ''} · interpret ${r.timings.interpretMs}ms · explain ${r.timings.explainMs}ms · total ${r.timings.totalMs}ms${c.x}`);
}

console.log(`${c.b}NASTRA Station — terminal${c.x}  ${c.dim}crew ${crewId} · model ${model} · /reseed /new /close /ev /crew /quit${c.x}`);
const rl = readline.createInterface({ input: stdin, output: stdout });
rl.on('SIGINT', () => { console.log('\nbye'); rl.close(); process.exit(0); });
for (;;) {
  let line: string;
  try {
    line = (await rl.question(`\n${c.b}${crewId} ›${c.x} `)).trim();
  } catch {
    break; // Ctrl+C / Ctrl+D
  }
  if (!line) continue;
  try {
    if (line === '/quit') break;
    if (line === '/ev') { showEvidence = !showEvidence; console.log(`evidence ${showEvidence ? 'on' : 'off'}`); continue; }
    if (line === '/new') { eventId = undefined; console.log('new event'); continue; }
    if (line.startsWith('/crew')) { crewId = line.split(/\s+/)[1] ?? crewId; eventId = undefined; console.log(`now ${crewId}`); continue; }
    if (line === '/reseed') { console.log(await db.rpcScalar('nastra_reseed', { p_anchor: new Date().toISOString() })); eventId = undefined; continue; }
    if (line === '/close') {
      if (eventId) { await closeEvent(db, eventId, 'resolved', 'Closed from terminal'); console.log('event closed'); eventId = undefined; }
      continue;
    }
    if (pendingLog && /^(y|yes|confirm)\b/i.test(line)) {
      await commitLog(db, crewId, pendingLog); console.log(`${c.grn}saved${c.x}`); pendingLog = undefined; continue;
    }
    pendingLog = undefined;
    const r = await handleMessage({ crewId, text: line, eventId }, { db, llm, model, respondModel, embed });
    render(r);
    if (r.action === 'log') pendingLog = r.confirmLog;
    eventId = r.eventStatus === 'awaiting_followup' || r.eventStatus === 'open' ? r.eventId ?? undefined : undefined;
  } catch (err) {
    console.error(`${c.red}${(err as Error).message}${c.x}`);
  }
}
rl.close();
