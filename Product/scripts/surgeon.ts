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

import type { SurgeonBrief } from '../src/nastra/surgeon/brief';

interface AlertRow {
  id: string; created_at: string; crew_id: string; urgency: string; reasons: string[];
  headline: string | null; brief: Partial<SurgeonBrief>;
  utterance: string | null; evidence: { id: string; title: string; detail: string }[];
  status: 'pending' | 'acknowledged'; acknowledged_at: string | null; ground_note: string | null;
}

const seen = new Set<string>();
let known: AlertRow[] = [];

function show(a: AlertRow) {
  const age = Math.round((Date.now() - Date.parse(a.created_at)) / 1000);
  const b = a.brief ?? {};
  const head = a.status === 'pending' ? `${c.red}${c.b}▲ ALERT` : `${c.grn}✓ ACK`;
  console.log(`\n${head}${c.x} ${a.id.slice(0, 8)}  ${c.dim}${age}s ago · ${a.urgency}${c.x}`);
  console.log(`${c.b}${a.headline ?? `${a.crew_id}: ${a.reasons.join('; ')}`}${c.x}`);

  const sec = (t: string) => console.log(`\n  ${c.b}${t}${c.x}`);
  sec('Why NASTRA escalated');
  console.log(`  ${b.trigger ?? a.reasons.join('; ')}`);
  for (const r of b.reported_now ?? []) console.log(`  ${c.red}•${c.x} ${r.sign} — crew: "${r.crew_words}"`);

  if (b.complaint) {
    sec('Complaint');
    console.log(`  First message: "${b.complaint.first_message}"`);
    if (b.complaint.symptoms.length) console.log(`  Symptoms: ${b.complaint.symptoms.join('; ')}`);
    const facts = [b.complaint.onset && `onset ${b.complaint.onset}`, b.complaint.duration && `duration ${b.complaint.duration}`, b.complaint.severity && `severity ${b.complaint.severity}`].filter(Boolean);
    if (facts.length) console.log(`  ${facts.join(' · ')}`);
  }
  if (b.flags?.length) {
    sec('Flagged data  (personal comparisons, not clinical thresholds)');
    for (const f of b.flags) console.log(`  ${c.red}!${c.x} ${f}`);
  }
  if (b.timeline?.length) {
    sec('Conversation');
    for (const t of b.timeline) {
      const when = new Date(t.at).toISOString().slice(11, 19);
      console.log(`  ${c.dim}${when}${c.x} ${t.who === 'crew' ? `${c.b}crew  ${c.x}` : `${c.dim}nastra${c.x}`} ${t.who === 'crew' ? t.text : `${c.dim}${t.text.slice(0, 140)}${t.text.length > 140 ? '…' : ''}${c.x}`}`);
    }
  }
  if (b.model_notes?.length) {
    sec('Model reading  (unverified, not used for the decision)');
    for (const n of b.model_notes) console.log(`  ${c.dim}${n}${c.x}`);
  }
  if (a.ground_note) console.log(`\n  ground note: ${a.ground_note}`);
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
