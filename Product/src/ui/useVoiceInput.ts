'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Push-to-talk speech-to-text. The browser records, then decodes and resamples
 * to 16 kHz mono; the Station server transcribes with local Whisper. Audio never
 * leaves the machine. The transcript goes into the composer for review: nothing
 * is sent until the crew member presses Send (read-back before action, NHIS A15).
 *
 * States follow the NHIS voice grammar: off → listening → recognizing → off,
 * or unavailable (with the reason).
 */
export type VoiceState = 'off' | 'listening' | 'recognizing' | 'unavailable';
const MAX_SECONDS = 60;

export function useVoiceInput(onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('off');
  const [seconds, setSeconds] = useState(0);
  const [reason, setReason] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => cleanup, []);

  const fail = (why: string) => {
    cleanup();
    setReason(why);
    setState('unavailable');
  };

  const transcribe = useCallback(async (blob: Blob) => {
    setState('recognizing');
    try {
      const pcm = await toPcm16k(blob);
      const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: pcm.buffer as ArrayBuffer });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? data.error ?? `HTTP ${r.status}`);
      const text = String(data.text ?? '').trim();
      if (text) onText(text);
      setReason(text ? null : 'No speech detected');
      setState('off');
    } catch (e) {
      fail(`Voice unavailable: ${(e as Error).message}`);
    }
  }, [onText]);

  const start = useCallback(async () => {
    if (state === 'listening' || state === 'recognizing') return;
    setReason(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return fail('This browser cannot record audio');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      return fail('Microphone permission was not granted');
    }
    chunks.current = [];
    const r = new MediaRecorder(stream.current);
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      cleanup();
      void transcribe(new Blob(chunks.current, { type: r.mimeType }));
    };
    rec.current = r;
    r.start();
    setSeconds(0);
    setState('listening');
    const started = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) rec.current?.state === 'recording' && rec.current.stop();
    }, 250);
  }, [state, transcribe]);

  const stop = useCallback(() => {
    if (rec.current?.state === 'recording') rec.current.stop();
  }, []);

  const toggle = useCallback(() => (state === 'listening' ? stop() : void start()), [state, start, stop]);
  return { state, seconds, reason, start, stop, toggle };
}

async function toPcm16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const length = Math.ceil(decoded.duration * 16000);
    const off = new OfflineAudioContext(1, Math.max(1, length), 16000);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    void ctx.close();
  }
}
