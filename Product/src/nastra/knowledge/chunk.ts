/**
 * Turn the NASA snapshot into knowledge chunks. One chunk per page section
 * (NASA's pages are short and already split into "What are the top risks?",
 * "What can be done about it?", "Did you know?"). Long sections are split
 * on sentence boundaries so no chunk passes ~220 words.
 */
export interface SnapshotPage {
  url: string;
  org: 'NASA' | 'CSA';
  title: string;
  formal_risk?: string;
  roadmap_url?: string;
  tags: string[];
  sections: { heading: string; text: string }[];
}

export interface KnowledgeChunk {
  source_org: 'NASA' | 'CSA';
  source_name: string;
  source_url: string;
  section: string;
  chunk_index: number;
  tags: string[];
  content: string;
  /** What gets embedded: title + section + text, so a chunk knows what page it is from. */
  embedText: string;
}

const MAX_WORDS = 220;

export function chunkSnapshot(pages: SnapshotPage[]): KnowledgeChunk[] {
  const out: KnowledgeChunk[] = [];
  for (const page of pages) {
    let idx = 0;
    for (const sec of page.sections) {
      for (const piece of splitBySentences(sec.text.trim(), MAX_WORDS)) {
        out.push({
          source_org: page.org,
          source_name: `HRP — ${page.title}`,
          source_url: page.url,
          section: sec.heading,
          chunk_index: idx++,
          tags: page.tags,
          content: piece,
          embedText: `${page.title}. ${sec.heading} ${piece}`,
        });
      }
    }
  }
  return out;
}

function splitBySentences(text: string, maxWords: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  const chunks: string[] = [];
  let cur: string[] = [];
  let words = 0;
  for (const s of sentences) {
    const w = s.trim().split(/\s+/).length;
    if (words + w > maxWords && cur.length) {
      chunks.push(cur.join(' ').trim());
      cur = [];
      words = 0;
    }
    cur.push(s.trim());
    words += w;
  }
  if (cur.length) chunks.push(cur.join(' ').trim());
  return chunks;
}

/** pgvector literal: '[0.1,0.2,…]' — works through PostgREST and plain SQL. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : '0')).join(',')}]`;
}
