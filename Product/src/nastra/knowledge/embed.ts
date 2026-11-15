/**
 * Local embeddings — no API, no key. gte-small (384 dims) runs inside Node via
 * Transformers.js. First use downloads the model (~30 MB) from Hugging Face and
 * caches it; after that it works offline. Same model for ingest and for queries.
 */
export type Embedder = (text: string) => Promise<number[]>;

export const EMBED_MODEL = 'Supabase/gte-small';
export const EMBED_DIMS = 384;

let cached: Promise<Embedder> | null = null;

export function getLocalEmbedder(): Promise<Embedder> {
  if (!cached) {
    cached = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      const extractor = await pipeline('feature-extraction', EMBED_MODEL);
      return async (text: string) => {
        const out = await extractor(text, { pooling: 'mean', normalize: true });
        const v = Array.from(out.data as Float32Array);
        if (v.length !== EMBED_DIMS) throw new Error(`embedding has ${v.length} dims, expected ${EMBED_DIMS}`);
        return v;
      };
    })();
    cached.catch(() => { cached = null; });
  }
  return cached;
}

/**
 * Deterministic stand-in for tests and for machines that can't download the
 * model: hashed bag-of-words, normalized. Lexical only — good enough to test
 * the plumbing, not for real retrieval quality.
 */
export function hashingEmbedder(dims = EMBED_DIMS): Embedder {
  return async (text: string) => {
    const v = new Array(dims).fill(0);
    for (const w of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
      const stem = w.replace(/(ing|ed|es|s|ion|ions)$/, '');
      let h = 2166136261;
      for (let i = 0; i < stem.length; i++) h = Math.imul(h ^ stem.charCodeAt(i), 16777619);
      v[Math.abs(h) % dims] += 1;
    }
    const n = Math.hypot(...v) || 1;
    return v.map((x) => x / n);
  };
}
