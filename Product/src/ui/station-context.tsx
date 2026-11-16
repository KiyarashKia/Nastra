'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { OperationalAlert } from '@nastra/nhis';
import type { NastraReply } from '@/nastra/pipeline';
import type { ProgressEvent } from '@/nastra/station/assessment';
import type { AlertOut, getOverview } from '@/nastra/station/read';

export type Overview = Awaited<ReturnType<typeof getOverview>>;
export interface StationStatus {
  profile: { crewId: string; name: string; role: string; agency: string; mission: string; metDay: number; launchAt: string; simulated: boolean };
  mode: 'live' | 'simulation' | 'training';
  dbKind: 'supabase' | 'pglite';
  llmKind: 'model' | 'stub';
  model: string;
  knowledgeRanking: 'vector' | 'tags';
  demoControls: boolean;
  linkDelayLabel: string;
}

export type ChatItem =
  | { id: string; at: string; role: 'crew'; kind: 'text'; text: string; image?: { url: string; name: string }; scan?: string }
  | { id: string; at: string; role: 'nastra' | 'system'; kind: 'text'; text: string; action?: { label: string; run: 'checkin' } }
  | { id: string; at: string; role: 'nastra' | 'system'; kind: 'reply'; reply: NastraReply; answered?: Record<string, string>; confirmed?: boolean }
  | { id: string; at: string; role: 'nastra'; kind: 'progress'; steps: ProgressEvent[]; state: 'running' | 'done' | 'stopped' | 'failed' }
  | { id: string; at: string; role: 'system'; kind: 'event'; text: string; tone?: 'safety' }
  | { id: string; at: string; role: 'system'; kind: 'checkin'; done?: boolean };

interface StationApi {
  status: StationStatus | null;
  overview: Overview | null;
  error: string | null;
  refresh: () => Promise<void>;
  chat: ChatItem[];
  busy: boolean;
  eventId?: string;
  send: (text: string, extra?: { answers?: Record<string, string>; confirm?: boolean; display?: string; image?: { url: string; name: string }; scan?: string }) => Promise<void>;
  stop: () => void;
  markItem: (id: string, patch: Partial<ChatItem>) => void;
  push: (item: ChatItem) => void;
  ackAlert: (id: string) => Promise<void>;
  suppressAlert: (id: string) => Promise<void>;
  escalate: (target: 'flight_surgeon' | 'crew_medical_officer', note?: string) => Promise<void>;
  submitCheckIn: (answers: Record<string, string>, note: string) => Promise<void>;
  closeEvent: (eventId: string, notes?: string) => Promise<void>;
  reseed: () => Promise<void>;
  composer: { draft: string; setDraft: (s: string) => void; focusToken: number; focus: () => void };
}

const Ctx = createContext<StationApi | null>(null);
export const useStation = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStation outside StationProvider');
  return v;
};

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const nowIso = () => new Date().toISOString();

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${r.status}`);
  return data as T;
}

export function StationProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StationStatus | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [eventId, setEventId] = useState<string | undefined>();
  const [draft, setDraft] = useState('');
  const [focusToken, setFocusToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const greeted = useRef(false);
  const chatStarted = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/overview', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setOverview(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()).then((s) => (s.error ? setError(s.error) : setStatus(s))).catch((e) => setError(String(e)));
    void refresh();
    const t = setInterval(() => void refresh(), 10_000); // halved for the demo (was 20 s)
    return () => clearInterval(t);
  }, [refresh]);

  // Escalation receipt: refresh the moment the simulated ground/CMO receipt is due, so 'Sent' never sticks.
  const receiptDueAt = overview?.escalation && 'receiptDueAt' in overview.escalation ? overview.escalation.receiptDueAt : null;
  useEffect(() => {
    if (!receiptDueAt) return;
    const t = setTimeout(() => void refresh(), Math.max(0, Date.parse(receiptDueAt) - Date.now()) + 300);
    return () => clearTimeout(t);
  }, [receiptDueAt, refresh]);

  // Opening state of the conversation, written by code from the data (not by the model).
  useEffect(() => {
    if (!overview || greeted.current) return;
    greeted.current = true;
    const items: ChatItem[] = [];
    const s = overview.sleep;
    if (s.value !== undefined && s.baseline?.reference !== undefined) {
      const d = s.value - s.baseline.reference;
      const short = s.samples.slice(-3).filter((x) => x.v !== null && (x.v as number) < (s.baseline!.reference ?? 0) - 1).length;
      items.push({
        id: uid('sys'), at: s.samples.at(-1)?.t ?? nowIso(), role: 'system', kind: 'text',
        text: `Sleep period ended. ≈${s.value.toFixed(1)} h, ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} h vs your 14-day average.${short === 3 ? ' Third short night in a row.' : ''}`,
      });
    }
    // If the crew member already started talking before the first load finished, keep their conversation.
    if (chatStarted.current) {
      setChat((c) => [...items, ...c]);
      return;
    }
    if (overview.openEvent) {
      setEventId(overview.openEvent.id);
      items.push({ id: uid('sys'), at: overview.openEvent.openedAt, role: 'system', kind: 'event', text: `Resumed open event${overview.openEvent.protocol ? ` · ${overview.openEvent.protocol.code}` : ''}` });
      for (const t of overview.openEvent.transcript) {
        items.push({ id: uid('t'), at: t.ts, role: t.role === 'crew' ? 'crew' : 'nastra', kind: 'text', text: t.content } as ChatItem);
      }
    } else if (!overview.checkIn.doneToday) {
      items.push({ id: uid('sys'), at: nowIso(), role: 'system', kind: 'text', text: 'Your daily check-in is open. It takes about a minute.', action: { label: 'Start check-in', run: 'checkin' } });
    } else if (!overview.alerts.some((a) => a.active)) {
      items.push({ id: uid('sys'), at: nowIso(), role: 'system', kind: 'text', text: 'No health concerns requiring attention. Tell NASTRA if anything feels off.' });
    }
    setChat(items);
  }, [overview]);

  const push = useCallback((item: ChatItem) => setChat((c) => [...c, item]), []);
  const markItem = useCallback((id: string, patch: Partial<ChatItem>) => setChat((c) => c.map((i) => (i.id === id ? ({ ...i, ...patch } as ChatItem) : i))), []);

  const send = useCallback<StationApi['send']>(async (text, extra = {}) => {
    if (busy) return;
    chatStarted.current = true;
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    push({ id: uid('crew'), at: nowIso(), role: 'crew', kind: 'text', text: extra.display ?? text, image: extra.image, scan: extra.scan });
    const progressId = uid('prog');
    let progressShown = false;
    try {
      const r = await fetch('/api/message', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({ text, eventId, answers: extra.answers, confirm: extra.confirm }),
      });
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === 'progress') {
            const ev = msg as ProgressEvent & { type: string };
            if (!progressShown) {
              progressShown = true;
              push({ id: progressId, at: nowIso(), role: 'nastra', kind: 'progress', steps: [], state: 'running' });
            }
            setChat((c) => c.map((i) => {
              if (i.id !== progressId || i.kind !== 'progress') return i;
              const steps = i.steps.filter((s) => s.step !== ev.step).concat({ step: ev.step, of: ev.of, label: ev.label, state: ev.state }).sort((a, b) => a.step - b.step);
              return { ...i, steps };
            }));
          } else if (msg.type === 'reply') {
            const reply = msg.reply as NastraReply;
            if (progressShown) markItem(progressId, { state: 'done' } as Partial<ChatItem>);
            const role = reply.action === 'escalate' && !reply.followup ? 'system' : 'nastra';
            push({ id: uid('r'), at: nowIso(), role, kind: 'reply', reply });
            if (reply.action === 'escalate' && !reply.followup) {
              push({ id: uid('ev'), at: nowIso(), role: 'system', kind: 'event', tone: 'safety', text: `Event escalated · ${reply.protocol?.code ?? 'PRT-SY-01'} · ${reply.alert?.delivered ? 'flight surgeon alerted' : 'alert NOT delivered — use the voice loop'}` });
            } else if (reply.stage === 'assess') {
              push({ id: uid('ev'), at: nowIso(), role: 'system', kind: 'event', text: `Assessment logged in history · ${reply.protocol?.code ?? ''} · recheck in ${reply.recheckMinutes ?? '—'} min` });
            } else if (reply.stage === 'intake' && !eventId) {
              push({ id: uid('ev'), at: nowIso(), role: 'system', kind: 'event', text: `New ${reply.protocol?.title.toLowerCase() ?? 'health'} event opened · ${reply.protocol?.code ?? ''}` });
            }
            setEventId(reply.eventStatus === 'awaiting_followup' || reply.eventStatus === 'open' || reply.eventStatus === 'escalated' ? reply.eventId ?? undefined : undefined);
          } else if (msg.type === 'error') {
            throw new Error(msg.message);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        if (progressShown) markItem(progressId, { state: 'stopped' } as Partial<ChatItem>);
        push({ id: uid('sys'), at: nowIso(), role: 'system', kind: 'text', text: 'Stopped. Nothing new was shown. Safety checks and alerts keep running.' });
      } else {
        if (progressShown) markItem(progressId, { state: 'failed' } as Partial<ChatItem>);
        push({ id: uid('sys'), at: nowIso(), role: 'system', kind: 'text', text: `NASTRA AI is unavailable (${(e as Error).message.slice(0, 120)}). Alerts, telemetry and protocols keep working without it. Use Escalate if you need the flight surgeon.` });
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      void refresh();
    }
  }, [busy, eventId, push, markItem, refresh]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const ackAlert = useCallback(async (id: string) => { await post(`/api/alerts/${id}`, { action: 'acknowledge' }); await refresh(); }, [refresh]);
  const suppressAlert = useCallback(async (id: string) => { await post(`/api/alerts/${id}`, { action: 'suppress' }); await refresh(); }, [refresh]);
  const escalate = useCallback(async (target: 'flight_surgeon' | 'crew_medical_officer', note?: string) => {
    await post('/api/escalate', { target, note });
    push({ id: uid('ev'), at: nowIso(), role: 'system', kind: 'event', tone: 'safety', text: `Escalation sent to the ${target === 'crew_medical_officer' ? 'crew medical officer' : 'flight surgeon'} with a handover brief` });
    await refresh();
  }, [push, refresh]);
  const submitCheckIn = useCallback(async (answers: Record<string, string>, note: string) => {
    await post('/api/checkin', { ...answers, note });
    await refresh();
  }, [refresh]);
  const closeEvent = useCallback(async (id: string, notes?: string) => {
    await post('/api/event/close', { eventId: id, outcome: 'resolved', notes });
    if (id === eventId) setEventId(undefined);
    push({ id: uid('ev'), at: nowIso(), role: 'system', kind: 'event', text: 'Event closed and logged in history' });
    await refresh();
  }, [eventId, push, refresh]);
  const reseed = useCallback(async () => {
    await post('/api/reseed', {});
    greeted.current = false;
    chatStarted.current = false;
    setEventId(undefined);
    setChat([]);
    await refresh();
  }, [refresh]);

  const api = useMemo<StationApi>(() => ({
    status, overview, error, refresh, chat, busy, eventId, send, stop, markItem, push,
    ackAlert, suppressAlert, escalate, submitCheckIn, closeEvent, reseed,
    composer: { draft, setDraft, focusToken, focus: () => setFocusToken((n) => n + 1) },
  }), [status, overview, error, refresh, chat, busy, eventId, send, stop, markItem, push, ackAlert, suppressAlert, escalate, submitCheckIn, closeEvent, reseed, draft, focusToken]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** Crew alert → NHIS OperationalAlert. Health-assessment origin; never Emergency. */
export function toNhisAlert(a: AlertOut): OperationalAlert {
  return {
    id: a.id,
    priority: a.priority,
    title: a.title,
    detail: a.detail ?? undefined,
    source: a.source,
    origin: { kind: 'health-assessment', engine: a.engine },
    timestamp: { iso: a.createdAt, system: 'UTC' },
    active: a.active,
    acknowledgement: a.acknowledged ? 'acknowledged' : 'unacknowledged',
    annunciation: a.annunciation,
    protocol: a.protocol ?? undefined,
  };
}
