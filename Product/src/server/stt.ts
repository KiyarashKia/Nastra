/**
 * Local speech-to-text. Whisper (tiny, English) runs on the Station server through
 * Transformers.js, the same library as the knowledge embedder. Audio never leaves
 * the machine; that is the onboard story. First use downloads the model (~40 MB)
 * from Hugging Face and caches it.
 *
 * Input: 16 kHz mono Float32 PCM (the browser decodes and resamples before upload).
 */
export const STT_MODEL = process.env.NASTRA_STT_MODEL || 'Xenova/whisper-tiny.en';

type Asr = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;
const g = globalThis as unknown as { __nastraAsr?: Promise<Asr> };

export function loadAsr(): Promise<Asr> {
  g.__nastraAsr ??= (async () => {
    const { pipeline } = await import('@huggingface/transformers');
    return (await pipeline('automatic-speech-recognition', STT_MODEL, { dtype: 'q8' } as never)) as unknown as Asr;
  })();
  g.__nastraAsr.catch(() => { g.__nastraAsr = undefined; });
  return g.__nastraAsr;
}

export async function transcribe(pcm16k: Float32Array): Promise<string> {
  if (pcm16k.length < 1600) return ''; // under 0.1 s
  const asr = await loadAsr();
  const out = await asr(pcm16k, { chunk_length_s: 30 });
  const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
  return text.replace(/\s+/g, ' ').replace(/^\s*\[BLANK_AUDIO\]\s*$/i, '').trim();
}
