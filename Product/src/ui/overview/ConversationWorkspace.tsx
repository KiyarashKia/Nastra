'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileTrigger } from 'react-aria-components';
import {
  AIAssessment, AIDisclosure, Button, CheckIn, ChoiceGroup, Disclosure, EvidenceTag, ExtractionReview, Glyph, PriorityBadge, TextField, Time,
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
      <div className="nhis-conversation__log st-conversation__log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions">
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
      <Composer busy={busy} onStop={stop} onSend={(t) => void send(t)} composer={composer} onImage={(item) => push(item)} />
    </section>
  );
}

function MessageBody({ item }: { item: ChatItem }) {
  const { push, markItem } = useStation();
  switch (item.kind) {
    case 'text':
      return (
        <>
          <p className="st-text">{item.text}</p>
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
    case 'extraction':
      return <ExtractionItem item={item} onDone={(done) => markItem(item.id, { done } as Partial<ChatItem>)} />;
    case 'reply':
      return <ReplyBody item={item} />;
  }
}

/* ── Replies ────────────────────────────────────────────────────────────── */
function ReplyBody({ item }: { item: Extract<ChatItem, { kind: 'reply' }> }) {
  const r = item.reply;
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
        {reply.alert && (reply.alert.delivered ? ' · flight surgeon alert sent' : ' · ALERT NOT DELIVERED — use the voice loop')}
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

function ExtractionItem({ item, onDone }: { item: Extract<ChatItem, { kind: 'extraction' }>; onDone: (d: 'confirmed' | 'discarded') => void }) {
  const { send } = useStation();
  if (item.done === 'discarded') return <p className="st-hint">Discarded. Nothing was saved.</p>;
  if (item.done === 'confirmed') return <p className="st-hint">Confirmed and shared with NASTRA as self-entered readings.</p>;
  if (!item.fields.length) return <p className="st-text">NASTRA could not read any device values in that image. Nothing was saved.</p>;
  return (
    <ExtractionReview
      source={item.source}
      fields={item.fields}
      onDiscard={() => onDone('discarded')}
      onConfirm={(values) => {
        const text = 'Device readings I confirmed: ' + item.fields.map((f) => `${f.label} ${values[f.id] ?? f.value}${f.unit ? ' ' + f.unit : ''}`).join(', ');
        onDone('confirmed');
        void send(text);
      }}
    />
  );
}

/* ── Composer ───────────────────────────────────────────────────────────── */
function Composer({ busy, onStop, onSend, composer, onImage }: {
  busy: boolean;
  onStop: () => void;
  onSend: (t: string) => void;
  composer: ReturnType<typeof useStation>['composer'];
  onImage: (item: ChatItem) => void;
}) {
  const { draft, setDraft, focusToken } = composer;
  const formRef = useRef<HTMLFormElement>(null);
  const [reading, setReading] = useState(false);
  const voice = useVoiceInput((text) => setDraft(draft ? `${draft} ${text}` : text));

  useEffect(() => {
    if (!focusToken) return;
    const ta = formRef.current?.querySelector('textarea');
    ta?.focus();
    ta?.setSelectionRange(ta.value.length, ta.value.length);
  }, [focusToken]);

  const submit = () => {
    const t = draft.trim();
    if (!t || busy) return;
    onSend(t);
    setDraft('');
  };

  const readImage = async (file: File) => {
    setReading(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(file); });
      const r = await fetch('/api/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: dataUrl, name: file.name }) });
      const data = await r.json();
      onImage({ id: `img-${Date.now()}`, at: new Date().toISOString(), role: 'crew', kind: 'text', text: `Attached image: ${file.name}` });
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      onImage({ id: `ex-${Date.now()}`, at: new Date().toISOString(), role: 'nastra', kind: 'extraction', source: data.source, fields: data.fields });
    } catch (e) {
      onImage({ id: `ex-${Date.now()}`, at: new Date().toISOString(), role: 'system', kind: 'text', text: `Image could not be read (${(e as Error).message.slice(0, 100)}). Nothing was saved.` });
    } finally {
      setReading(false);
    }
  };

  const voiceLabel = voice.state === 'listening' ? `Stop recording (${voice.seconds} s)` : voice.state === 'recognizing' ? 'Transcribing…' : 'Speak';
  return (
    <form ref={formRef} className="nhis-conversation__composer st-composer" onSubmit={(e) => { e.preventDefault(); submit(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName === 'TEXTAREA') { e.preventDefault(); submit(); } }}>
      <TextField label="Message NASTRA" value={draft} onChange={setDraft} multiline placeholder="Ask NASTRA about your health, report a symptom, or request your data…" />
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
            <Button iconOnly icon="image" aria-label="Add an image of a device screen or observation" isPending={reading} isDisabled={busy} />
          </FileTrigger>
          {busy ? (
            <Button intent="secondary" icon="close" onPress={onStop}>Stop</Button>
          ) : (
            <Button type="submit" intent="primary" icon="send" isDisabled={!draft.trim()}>Send</Button>
          )}
        </div>
      </div>
    </form>
  );
}
