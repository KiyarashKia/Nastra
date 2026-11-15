/**
 * Ground side of an escalation — the flight surgeon's console (simulated).
 *   npm run surgeon
 * Run it in a second terminal next to `npm run chat`. Every escalation in the
 * chat shows up here within ~2 s.
 *
 * Commands:  ack <id-prefix> [note]   acknowledge an alert
 *            all                      show acknowledged alerts too
 *            /quit
 */
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadEnv } from './env';
import { createSupabaseDb } from '../src/nastra/db/supabase';

loadEnv();
const db = createSupabaseDb();
const c = { dim: '\x1b[2m', b: '\x1b[1m', red: '\x1b[31m', grn: '\x1b[32m', x: '\x1b[0m' };

interface AlertRow {
  id: string; created_at: string; crew_id: string; urgency: string; reasons: string[];
  utterance: string | null; evidence: { id: string; title: string; detail: string }[];
  status: 'pending' | 'acknowledged'; acknowledged_at: string | null; ground_note: string | null;
}

const seen = new Set<string>();
let known: AlertRow[] = [];

function show(a: AlertRow) {
  const age = Math.round((Date.now() - Date.parse(a.created_at)) / 1000);
  console.log(`\n${a.status === 'pending' ? `${c.red}${c.b}▲ ALERT` : `${c.grn}✓ ACK`}${c.x} ${a.id.slice(0, 8)}  ${c.b}${a.crew_id}${c.x}  ${c.dim}${age}s ago · ${a.urgency}${c.x}`);
  console.log(`  reason:  ${a.reasons.join('; ')}`);
  if (a.utterance) console.log(`  crew said: "${a.utterance}"`);
  for (const e of a.evidence ?? []) console.log(`  ${c.dim}[${e.id}] ${e.title}: ${e.detail}${c.x}`);
  if (a.ground_note) console.log(`  ground note: ${a.ground_note}`);
}

async function poll(includeAck = false) {
  known = await db.rpc<AlertRow>('surgeon_alert_feed', { p_include_acknowledged: includeAck, p_limit: 20 });
  for (const a of [...known].reverse()) {
    if (includeAck || !seen.has(a.id)) { show(a); seen.add(a.id); if (!includeAck) process.stdout.write('\x07'); }
  }
}

console.log(`${c.b}NASTRA — flight surgeon console (simulated ground)${c.x}  ${c.dim}ack <id> [note] · all · /quit${c.x}`);
await poll().catch((e) => console.error(e.message));
const timer = setInterval(() => poll().catch((e) => console.error(e.message)), 2000);

const rl = readline.createInterface({ input: stdin, output: stdout });
rl.on('SIGINT', () => { clearInterval(timer); rl.close(); process.exit(0); });
for (;;) {
  let line: string;
  try { line = (await rl.question('')).trim(); } catch { break; }
  if (!line) continue;
  if (line === '/quit') break;
  if (line === 'all') { await poll(true); continue; }
  const m = line.match(/^ack\s+(\S+)\s*(.*)$/i);
  if (m) {
    const a = known.find((x) => x.id.startsWith(m[1]));
    if (!a) { console.log('no pending alert with that id'); continue; }
    await db.update('surgeon_alerts', a.id, {
      status: 'acknowledged', acknowledged_at: new Date().toISOString(), acknowledged_by: 'flight_surgeon (simulated)', ground_note: m[2] || null,
    });
    console.log(`${c.grn}acknowledged ${a.id.slice(0, 8)}${c.x}`);
    continue;
  }
  console.log('commands: ack <id> [note] · all · /quit');
}
clearInterval(timer);
rl.close();
process.exit(0);
