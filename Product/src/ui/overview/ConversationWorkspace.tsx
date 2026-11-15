'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileTrigger } from 'react-aria-components';
import {
  AIAssessment, AIDisclosure, Button, CheckIn, ChoiceGroup, Disclosure, EvidenceTag, Glyph, PriorityBadge, TextField, Time,
} from '@nastra/nhis';
import type { NastraReply } from '@/nastra/pipeline';
import { useStation, type ChatItem } from '../station-context';
import { useVoiceInput } from '../useVoiceInput';

const ROLE: Record<ChatItem['role'], string> = { crew: 'You', nastra: 'NASTRA (AI)', system: 'System' };
const utc = (iso: string) => ({ iso, system: 'UTC' as const });

export function ConversationWorkspace() {
  const { chat, busy, stop, send, composer, push } = useStation();
  const logRef = useRef<HTMLDivElement>(null);
  const lastAnswerId = [...chat].reverse().find((m) => m.role !== 'crew' && m.kind !== 'progress')?.id;
  const seen = useRef<string | undefined>(undefined);

  // NHIS A32: keep the START of a new response in view; never jump to the end of a long answer.
  useLayoutEffect(() => {
    if (!lastAnswerId || seen.current === lastAnswerId || !logRef.current) return;
    seen.current = lastAnswerId;
    const el = logRef.current.querySelector<HTMLElement>(`[data-message-id="${lastAnswerId}"]`);
    if (el) logRef.current.scrollTop = el.offsetTop - logRef.current.offsetTop - 8;
  }, [lastAnswerId]);
  useEffect(() => {
    // New crew message or progress: follow the end.
    const last = chat.at(-1);
    if (last && (last.role === 'crew' || last.kind === 'progress') && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [chat]);

  return (
    <section className="nhis-conversation st-conversation" aria-label="Conversation with NASTRA">
      <div className="nhis-conversation__log st-conversation__log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation log" tabIndex={0}>
        {chat.map((m) => (
          <div key={m.id} data-message-id={m.id} className={`nhis-message nhis-message--${m.role} st-msg st-msg--${m.kind}`}>
            {m.kind !== 'event' && (
              <div className="nhis-message__meta">
                <span className="nhis-message__role">{ROLE[m.role]}</span>
                <Time value={utc(m.at)} seconds={false} />
              </div>
            )}
            <div className="nhis-message__body">
              <MessageBody item={m} />
            </div>
          </div>
        ))}
        {!chat.length && <p className="st-empty">Loading your health context…</p>}
      </div>
      {!busy && chat.length <= 3 && !chat.some((m) => m.role === 'crew') && (
        <div className="st-suggest" role="group" aria-label="Suggested messages">
          {['I want to report a symptom', 'How did I sleep this week?', 'Show my vitals now'].map((t) => (
            <Button key={t} size="compact" intent="secondary" onPress={() => void send(t)}>{t}</Button>
          ))}
        </div>
      )}
      <Composer busy={busy} onStop={stop} onSend={(t, extra) => void send(t, extra)} composer={composer} />
    </section>
  );
}

function MessageBody({ item }: { item: ChatItem }) {
  const { push, markItem } = useStation();
  switch (item.kind) {
    case 'text':
      return (
        <>
          {'image' in item && item.image && (
            <figure className="st-attach">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image.url} alt={`Photo you attached: ${item.image.name}`} />
              {item.scan && <figcaption className="st-attach__scan">{item.scan}</figcaption>}
            </figure>
          )}
          {item.text && <p className="st-text">{item.text}</p>}
          {'action' in item && item.action?.run === 'checkin' && (
            <Button size="compact" intent="secondary" onPress={() => push({ id: `ci-${Date.now()}`, at: new Date().toISOString(), role: 'system', kind: 'checkin' })}>
              {item.action.label}
            </Button>
          )}
        </>
      );
    case 'event':
      return (
        <p className={`st-event${item.tone === 'safety' ? ' is-safety' : ''}`}>
          <Glyph name={item.tone === 'safety' ? 'escalate' : 'step-completed'} size={16} /> {item.text}
        </p>
      );
    case 'progress':
      return <AnalysisProgress item={item} />;
    case 'checkin':
      return <DailyCheckIn item={item} />;
    case 'reply':
      return <ReplyBody item={item} />;
  }
}

/* ── Replies ────────────────────────────────────────────────────────────── */
function ReplyBody({ item }: { item: Extract<ChatItem, { kind: 'reply' }> }) {
  const r = item.reply;
  if (r.action === 'escalate' && r.followup) return <EscalationFollowup reply={r} />;
  if (r.action === 'escalate') return <SafetyEvent reply={r} />;
  if (r.action === 'protocol' && r.stage === 'intake') return <StructuredIntake item={item} />;
  if (r.action === 'protocol' && r.stage === 'readback') return <ReadbackConfirmation item={item} />;
  if (r.action === 'protocol' && r.stage === 'assess' && r.assessment) return <AssessmentBlock reply={r} />;
  if (r.action === 'log') return <LogConfirm reply={r} />;
  return (
    <>
      <p className="st-text">{r.explanation}</p>
      {r.evidence.length > 0 && (
        <Disclosure title={`Evidence (${r.evidence.length})`}>
          <ul className="st-evidence-list">
            {r.evidence.map((e) => (
              <li key={e.id}>
                <EvidenceTag category={e.kind === 'knowledge' ? 'retrieved' : e.kind === 'pattern' ? 'derived' : 'measured'} />
                <span><strong>[{e.id}] {e.title}</strong> {e.detail}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </>
  );
}

/** Progressive questioning with quick replies. Tapped answers are resolved in code, not by the model. */
function StructuredIntake({ item }: { item: Extract<ChatItem, { kind: 'reply' }> }) {
  const { send, busy, markItem } = useStation();
  const r = item.reply;
  const [sel, setSel] = useState<Record<string, string>>(item.answered ?? {});
  const answered = Boolean(item.answered);
  const qs = r.questions.filter((q) => q.options.length);
  const complete = qs.every((q) => sel[q.id]);
  const submit = () => {
    const display = qs.map((q) => q.options.find((o) => o.id === sel[q.id])?.label).filter(Boolean).join(' · ');
    markItem(item.id, { answered: sel } as Partial<ChatItem>);
    void send(display, { answers: sel, display });
  };
  return (
    <div className="st-intake">
      {r.immediateStep && (
        <p className="st-immediate"><Glyph name="chevron-right" size={16} /> <strong>{r.immediateStep}</strong></p>
      )}
      <p className="st-text">{r.explanation}</p>
      {qs.map((q) => (
        <div key={q.id} className={`st-intake__q${q.redFlag ? ' is-safety' : ''}`}>
          <ChoiceGroup label={q.short} description={q.short !== q.text ? q.text : undefined} presentation="chips" options={q.options} value={sel[q.id] ?? null} onChange={(v) => setSel((s) => ({ ...s, [q.id]: v }))} isDisabled={answered || busy} />
        </div>
      ))}
      {!answered && (
        <div className="st-intake__actions">
          <Button intent="primary" icon="chevron-right" isDisabled={!complete || busy} onPress={submit}>Continue</Button>
          <span className="st-hint">Or answer in your own words below.</span>
        </div>
      )}
    </div>
  );
}

function ReadbackConfirmation({ item }: { item: Extract<ChatItem, { kind: 'reply' }> }) {
  const { send, busy, markItem, composer } = useStation();
  const rb = item.reply.readback!;
  return (
    <section className="nhis-intake st-readback" aria-label={rb.title}>
      <h3 className="nhis-intake__title">{rb.title}</h3>
      <p className="st-text">{rb.summary}</p>
      <dl className="nhis-intake__readback">
        {rb.items.map((i) => (
          <div key={i.label}><dt>{i.label}</dt><dd>{i.value}</dd></div>
        ))}
      </dl>
      {!item.confirmed && (
        <div className="nhis-intake__actions">
          <Button intent="secondary" isDisabled={busy} onPress={() => { composer.setDraft('Correction: '); composer.focus(); }}>Edit</Button>
          <Button intent="primary" icon="check" isDisabled={busy} onPress={() => { markItem(item.id, { confirmed: true } as Partial<ChatItem>); void send('Confirm & assess', { confirm: true }); }}>
            Confirm &amp; assess
          </Button>
        </div>
      )}
    </section>
  );
}

function AnalysisProgress({ item }: { item: Extract<ChatItem, { kind: 'progress' }> }) {
  const { stop } = useStation();
  const of = item.steps[0]?.of ?? 6;
  const done = item.steps.filter((s) => s.state === 'done').length;
  const head = item.state === 'running' ? 'Checking your health context' : item.state === 'done' ? 'Checked your health context' : item.state === 'stopped' ? 'Stopped' : 'Could not finish';
  return (
    <div className="st-progress">
      <div className="st-progress__head">
        <strong>{head}</strong>
        <span className="nhis-num">{done} of {of}</span>
        {item.state === 'running' && <Button size="compact" intent="quiet" icon="close" onPress={stop}>Stop</Button>}
      </div>
      <ol className="st-progress__list">
        {item.steps.map((s) => (
          <li key={s.step} className={`is-${s.state}`}>
            <Glyph name={s.state === 'done' ? 'step-completed' : s.state === 'failed' ? 'step-failed' : 'step-current'} size={16} />
            {s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

function AssessmentBlock({ reply }: { reply: NastraReply }) {
  const router = useRouter();
  const { composer, closeEvent, eventId, escalate } = useStation();
  const a = reply.assessment!;
  return (
    <div className="st-assessment">
      <AIAssessment
        title={a.title}
        generatedAt={utc(a.generatedAt)}
        observations={a.observations.map((o) => ({ category: o.category, text: o.origin === 'self-reported' ? `${o.text} (self-reported)` : o.text }))}
        assessment={a.assessment}
        confidence={a.confidence}
        recommendedAction={a.recommendedAction}
        evidence={a.evidence}
        onOpenProtocol={() => router.push('/protocol')}
        onCorrect={() => { composer.setDraft('More context: '); composer.focus(); }}
        onEscalate={() => void escalate('flight_surgeon')}
      />
      {a.pattern && (
        <p className="st-pattern-note">
          <EvidenceTag category="derived" /> {a.pattern.statement} <em>{a.pattern.caveat}</em>
        </p>
      )}
      {reply.explanationIssues?.length ? <p className="st-hint">Model text was rejected and replaced with facts only ({reply.explanationIssues.length} check{reply.explanationIssues.length > 1 ? 's' : ''} failed).</p> : null}
      {eventId === reply.eventId && (
        <div className="st-intake__actions">
          <Button intent="secondary" icon="check" onPress={() => void closeEvent(reply.eventId!, 'Crew reported feeling better')}>I feel better — close event</Button>
          <span className="st-hint">Still the same or worse? Tell NASTRA below.</span>
        </div>
      )}
    </div>
  );
}

/** System safety event: deterministic, visually distinct from AI output. */
/** A turn inside an active escalation: a normal conversational reply, with a small status line. */
function EscalationFollowup({ reply }: { reply: NastraReply }) {
  return (
    <>
      <p className="st-esc-chip" role="note"><PriorityBadge priority="warning" /> <span>{reply.escalation?.status ?? 'Escalation active'}</span></p>
      <p className="st-text">{reply.explanation}</p>
      {reply.steps.length > 0 && <ol className="st-safety__steps">{reply.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
    </>
  );
}

function SafetyEvent({ reply }: { reply: NastraReply }) {
  const router = useRouter();
  return (
    <section className="st-safety" aria-label="System safety event">
      <div className="st-safety__head">
        <PriorityBadge priority="warning" />
        <strong>{reply.headline ?? 'This needs the flight surgeon now.'}</strong>
      </div>
      <p className="st-text">{reply.explanation}</p>
      <ol className="st-safety__steps">{reply.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <p className="st-safety__meta">
        Deterministic safety rule · model not used for this decision · {reply.protocol?.code} {reply.protocol?.title}
        {reply.followup ? ' · same escalated event, no new alert sent' : reply.alert && (reply.alert.delivered ? ' · flight surgeon alert sent' : ' · ALERT NOT DELIVERED — use the voice loop')}
      </p>
      <Button size="compact" intent="secondary" icon="list" onPress={() => router.push('/protocol')}>Open protocol {reply.protocol?.code}</Button>
    </section>
  );
}

function LogConfirm({ reply }: { reply: NastraReply }) {
  const [state, setState] = useState<'pending' | 'saved' | 'discarded'>('pending');
  const save = async () => {
    const r = await fetch('/api/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entries: reply.confirmLog }) });
    setState(r.ok ? 'saved' : 'pending');
  };
  return (
    <div className="st-intake">
      <p className="st-text">{reply.explanation}</p>
      <dl className="nhis-intake__readback">{(reply.confirmLog ?? []).map((e) => <div key={e.field}><dt>{e.field.replace(/_/g, ' ')}</dt><dd>{e.value}</dd></div>)}</dl>
      {state === 'pending' ? (
        <div className="nhis-intake__actions">
          <Button intent="quiet" onPress={() => setState('discarded')}>Discard</Button>
          <Button intent="primary" icon="check" onPress={() => void save()}>Save to my log</Button>
        </div>
      ) : <p className="st-hint">{state === 'saved' ? 'Saved as self-reported.' : 'Not saved.'}</p>}
    </div>
  );
}

function DailyCheckIn({ item }: { item: Extract<ChatItem, { kind: 'checkin' }> }) {
  const { submitCheckIn } = useStation();
  return (
    <CheckIn
      title="Daily check-in"
      visibilityNote="Self-reported. Visible to you, NASTRA and your flight surgeon. NASTRA never infers mood from your voice or face."
      questions={[
        { id: 'mood', label: 'Mood', options: [{ id: 'low', label: 'Low' }, { id: 'steady', label: 'Steady' }, { id: 'good', label: 'Good' }] },
        { id: 'stress', label: 'Stress', options: [{ id: 'low', label: 'Low' }, { id: 'moderate', label: 'Moderate' }, { id: 'high', label: 'High' }] },
        { id: 'fatigue', label: 'Fatigue', options: [{ id: 'low', label: 'Low' }, { id: 'moderate', label: 'Moderate' }, { id: 'high', label: 'High' }] },
      ]}
      onSubmit={(answers, note) => { void submitCheckIn(answers, note); void item; }}
    />
  );
}

/* ── Composer ───────────────────────────────────────────────────────────── */
type Reading = {
  kind: 'device' | 'person' | 'other'; source: string; quality: string | null; description: string | null; unremarkable: boolean | null;
  fields: { id: string; label: string; value: string; unit?: string; note?: string }[];
  observations: { id: string; text: string; region: string | null; unclear: boolean }[];
};
type Attachment = { url: string; name: string; state: 'scanning' | 'ready' | 'failed'; reading?: Reading; keep: Record<string, boolean>; error?: string };

/** What the photo contributes to the message, in words the pipeline reads. Only items the crew kept. */
function scanText(a: Attachment): { line: string; caption: string } {
  const r = a.reading;
  if (!r) return { line: '', caption: 'Visual scan unavailable' };
  if (r.kind === 'person') {
    const kept = r.observations.filter((o) => a.keep[o.id]);
    if (kept.length) return { line: `From my photo (model-read, I checked): ${kept.map((o) => (o.region ? `${o.region}: ${o.text}` : o.text)).join('; ')}.`, caption: `Visual scan · ${kept.length} observation${kept.length > 1 ? 's' : ''} shared` };
    return r.unremarkable ? { line: 'From my photo (model-read, I checked): nothing stands out.', caption: 'Visual scan · no visible anomalies' } : { line: '', caption: 'Visual scan · nothing shared' };
  }
  if (r.kind === 'device') {
    const kept = r.fields.filter((f) => a.keep[f.id]);
    if (kept.length) return { line: `Device readings I confirmed (read from my photo of ${r.source}): ${kept.map((f) => `${f.label} ${f.value}${f.unit ? ' ' + f.unit : ''}`).join(', ')}.`, caption: `Visual scan · ${kept.length} device reading${kept.length > 1 ? 's' : ''} shared` };
    return { line: '', caption: 'Visual scan · no readings shared' };
  }
  return { line: '', caption: 'Visual scan · no device or person in frame' };
}

/** Attached photo inside the composer: a compact visual-scan readout. The crew keeps or drops each item; nothing is used until they send. */
function ScanChip({ a, onToggle, onRemove }: { a: Attachment; onToggle: (id: string) => void; onRemove: () => void }) {
  const r = a.reading;
  const items = r?.kind === 'person' ? r.observations.map((o) => ({ id: o.id, text: o.region ? `${o.region} · ${o.text}` : o.text, unclear: o.unclear }))
    : r?.kind === 'device' ? r.fields.map((f) => ({ id: f.id, text: `${f.label} · ${f.value}${f.unit ? ' ' + f.unit : ''}`, unclear: f.note === 'unclear' })) : [];
  const status = a.state === 'scanning' ? 'Scanning…'
    : a.state === 'failed' ? 'Unavailable'
    : r?.kind === 'person' ? (items.length ? `Subject · ${items.length} visible sign${items.length > 1 ? 's' : ''}` : r.unremarkable ? 'Subject · no visible anomalies' : 'Subject · not readable')
    : r?.kind === 'device' ? (items.length ? `Device · ${items.length} reading${items.length > 1 ? 's' : ''}` : 'Device · no legible readings')
    : 'No device or person in frame';
  return (
    <div className={`st-scan is-${a.state}`} role="group" aria-label={`Attached photo ${a.name}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="st-scan__thumb" src={a.url} alt="" />
      <div className="st-scan__body">
        <p className="st-scan__head"><span className="st-scan__label">Visual scan</span><span className="st-scan__status" role="status">{status}</span></p>
        {items.length > 0 && (
          <ul className="st-scan__list">
            {items.map((i) => (
              <li key={i.id}>
                <label className="st-check">
                  <input type="checkbox" checked={!!a.keep[i.id]} onChange={() => onToggle(i.id)} />
                  <span>{i.text}{i.unclear && <span className="st-scan__meta"> · unclear</span>}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="st-scan__meta">
          {a.state === 'failed' ? (a.error ?? 'Describe what you see in words.')
            : r?.kind === 'other' && r.description ? r.description
            : 'Model-read · unverified · not a diagnosis'}
          {r?.quality ? ` · ${r.quality}` : ''}
        </p>
      </div>
      <Button iconOnly size="compact" intent="quiet" icon="close" aria-label={`Remove photo ${a.name}`} onPress={onRemove} />
    </div>
  );
}

function Composer({ busy, onStop, onSend, composer }: {
  busy: boolean;
  onStop: () => void;
  onSend: (t: string, extra?: { display?: string; image?: { url: string; name: string }; scan?: string }) => void;
  composer: ReturnType<typeof useStation>['composer'];
}) {
  const { draft, setDraft, focusToken } = composer;
  const formRef = useRef<HTMLFormElement>(null);
  const [att, setAtt] = useState<Attachment | null>(null);
  const voice = useVoiceInput((text) => setDraft(draft ? `${draft} ${text}` : text));

  useEffect(() => {
    if (!focusToken) return;
    const ta = formRef.current?.querySelector('textarea');
    ta?.focus();
    ta?.setSelectionRange(ta.value.length, ta.value.length);
  }, [focusToken]);

  const canSend = !busy && att?.state !== 'scanning' && (!!draft.trim() || !!att);
  const submit = () => {
    if (!canSend) return;
    const t = draft.trim();
    if (att) {
      const { line, caption } = scanText(att);
      const text = [t, line].filter(Boolean).join(' ') || `I'm sharing a photo${att.reading?.kind === 'other' && att.reading.description ? ` (${att.reading.description})` : ''}.`;
      onSend(text, { display: t, image: { url: att.url, name: att.name }, scan: caption });
      setAtt(null);
    } else {
      onSend(t);
    }
    setDraft('');
  };

  const readImage = async (file: File) => {
    const url = URL.createObjectURL(file);
    setAtt({ url, name: file.name, state: 'scanning', keep: {} });
    composer.focus();
    try {
      const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(file); });
      const r = await fetch('/api/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: dataUrl, name: file.name }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      const reading = { observations: [], fields: [], ...data } as Reading;
      const keep = Object.fromEntries([...reading.observations.map((o) => [o.id, !o.unclear]), ...reading.fields.map((f) => [f.id, f.note !== 'unclear'])]);
      setAtt((a) => (a && a.url === url ? { ...a, state: 'ready', reading, keep } : a));
    } catch (e) {
      const msg = (e as Error).message;
      const error = /too large/.test(msg) ? 'Too large to scan (max about 6 MB).' : 'Scan service not reachable. Describe what you see in words.';
      setAtt((a) => (a && a.url === url ? { ...a, state: 'failed', error } : a));
    }
  };

  const voiceLabel = voice.state === 'listening' ? `Stop recording (${voice.seconds} s)` : voice.state === 'recognizing' ? 'Transcribing…' : 'Speak';
  return (
    <form ref={formRef} className="nhis-conversation__composer st-composer" onSubmit={(e) => { e.preventDefault(); submit(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName === 'TEXTAREA') { e.preventDefault(); submit(); } }}>
      {att && <ScanChip a={att} onToggle={(id) => setAtt((x) => (x ? { ...x, keep: { ...x.keep, [id]: !x.keep[id] } } : x))} onRemove={() => setAtt(null)} />}
      <TextField label="Message NASTRA" value={draft} onChange={setDraft} multiline placeholder={att ? 'Add how you feel, or press Enter to send the photo…' : 'Ask NASTRA about your health, report a symptom, or request your data…'} />
      <div className="nhis-conversation__composer-row st-composer__row">
        <AIDisclosure compact />
        <div className="st-composer__controls">
          <span className={`st-voice-state${voice.state === 'unavailable' ? ' is-error' : ''}`} role="status">
            {voice.state === 'listening' && <><span className="st-rec-dot" aria-hidden="true" /> Listening · <span className="nhis-num">{voice.seconds}</span> s</>}
            {voice.state === 'recognizing' && 'Transcribing on this computer…'}
            {voice.state === 'unavailable' && voice.reason}
          </span>
          <Button iconOnly icon="mic" aria-label={voiceLabel} aria-pressed={voice.state === 'listening'} intent={voice.state === 'listening' ? 'primary' : 'secondary'}
            isPending={voice.state === 'recognizing'} isDisabled={busy} onPress={voice.toggle} />
          <FileTrigger acceptedFileTypes={['image/png', 'image/jpeg', 'image/webp']} onSelect={(l) => { const f = l?.[0]; if (f) void readImage(f); }}>
            <Button iconOnly icon="image" aria-label="Attach a photo: a device screen, or your face or skin" isPending={att?.state === 'scanning'} isDisabled={busy || !!att} />
          </FileTrigger>
          {busy ? (
            <Button intent="secondary" icon="close" onPress={onStop}>Stop</Button>
          ) : (
            <Button type="submit" intent="primary" icon="send" isDisabled={!canSend}>Send</Button>
          )}
        </div>
      </div>
    </form>
  );
}
