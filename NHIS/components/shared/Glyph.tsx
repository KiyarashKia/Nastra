import type { CSSProperties, ReactNode } from 'react';

/**
 * NHIS glyph set. One 24 × 24 grid, 2 px round strokes, currentColor.
 * Safety-significant glyphs (alerts, data quality, protocol, evidence) are drawn
 * here and reviewed as a set rather than taken from an icon library (03 §8).
 * Every alert glyph has a distinct silhouette so priority reads in grayscale and
 * monochrome (NHIS A2, B5): circle · triangle · octagon · filled double octagon.
 * Glyphs reinforce text labels; they never replace them for safety meaning.
 */

const oct = (r: number, c = 12) => {
  const a = r * Math.sin(Math.PI / 8);
  const b = r * Math.cos(Math.PI / 8);
  const p = [
    [c + a, c - b],
    [c + b, c - a],
    [c + b, c + a],
    [c + a, c + b],
    [c - a, c + b],
    [c - b, c + a],
    [c - b, c - a],
    [c - a, c - b],
  ];
  return p.map(([x, y]) => `${x!.toFixed(2)},${y!.toFixed(2)}`).join(' ');
};

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const dot = (cx: number, cy: number, r = 1.25) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
const ring = <circle cx="12" cy="12" r="8" {...S} />;

const GLYPHS = {
  /* --- Alert classes ---------------------------------------------------- */
  advisory: (
    <>
      <circle cx="12" cy="12" r="9" {...S} />
      <path d="M12 11v5.5" {...S} />
      {dot(12, 7.75)}
    </>
  ),
  caution: (
    <>
      <path d="M12 3.5 21.5 20h-19Z" {...S} />
      <path d="M12 9.5V14" {...S} />
      {dot(12, 17)}
    </>
  ),
  warning: (
    <>
      <polygon points={oct(9.6)} {...S} />
      <path d="M12 7.5V13" {...S} />
      {dot(12, 16.5)}
    </>
  ),
  emergency: (
    <>
      <polygon points={oct(11)} {...S} strokeWidth={1.5} />
      <polygon points={oct(8.2)} fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
      <path d="M12 8v4.6" {...S} stroke="var(--nhis-glyph-knockout, #101317)" strokeWidth={2.2} />
      <circle cx="12" cy="15.6" r="1.3" fill="var(--nhis-glyph-knockout, #101317)" />
    </>
  ),
  /* --- Data quality and origin ----------------------------------------- */
  live: <circle cx="12" cy="12" r="4" fill="currentColor" />,
  delayed: (
    <>
      <circle cx="12" cy="12" r="9" {...S} />
      <path d="M12 7v5l3.5 2" {...S} />
    </>
  ),
  stale: (
    <>
      <path d="M7 3h10M7 21h10" {...S} />
      <path d="M8 3v2.5c0 2.2 4 4.4 4 6.5 0-2.1 4-4.3 4-6.5V3M8 21v-2.5c0-2.2 4-4.4 4-6.5 0 2.1 4 4.3 4 6.5V21" {...S} />
    </>
  ),
  unavailable: (
    <>
      <circle cx="12" cy="12" r="9" {...S} />
      <path d="M5.6 18.4 18.4 5.6" {...S} />
    </>
  ),
  unknown: (
    <>
      <circle cx="12" cy="12" r="9" {...S} strokeDasharray="3 2.6" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" {...S} />
      {dot(12, 17)}
    </>
  ),
  estimated: <path d="M5 9.5c2-1.8 4-1.8 7 0s5 1.8 7 0M5 15c2-1.8 4-1.8 7 0s5 1.8 7 0" {...S} />,
  manual: (
    <>
      <path d="m4 20 1-4L15.5 5.5l3 3L8 19Z" {...S} />
      <path d="m13.5 7.5 3 3" {...S} />
    </>
  ),
  paused: <path d="M9 6v12M15 6v12" {...S} />,
  simulation: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1" {...S} strokeDasharray="3 2.5" />
      <path d="M10 9.5v5l4-2.5Z" {...S} />
    </>
  ),
  /* --- Evidence categories (02 §7) ------------------------------------- */
  measured: (
    <>
      <circle cx="12" cy="12" r="6" {...S} />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" {...S} />
      {dot(12, 12, 1.5)}
    </>
  ),
  derived: <path d="M4 4v16h16M7.5 15l3.5-3.5 3 3 5-6" {...S} />,
  retrieved: (
    <>
      <path d="M7 3h7l4 4v14H7Z" {...S} />
      <path d="M14 3v4h4M9.5 12h6M9.5 16h6" {...S} />
    </>
  ),
  'ai-assessment': (
    <>
      <path d="M8 4H5v16h3M16 4h3v16h-3" {...S} />
      {dot(12, 12, 2)}
    </>
  ),
  'recommended-action': <path d="M4 12h14M13 6l6 6-6 6" {...S} />,
  /* --- Protocol steps --------------------------------------------------- */
  'step-pending': ring,
  'step-current': (
    <>
      {ring}
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </>
  ),
  'step-completed': (
    <>
      {ring}
      <path d="m8.2 12.4 2.6 2.6 5-5.4" {...S} />
    </>
  ),
  'step-paused': (
    <>
      {ring}
      <path d="M10 9v6M14 9v6" {...S} />
    </>
  ),
  'step-failed': (
    <>
      {ring}
      <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" {...S} />
    </>
  ),
  'step-blocked': (
    <>
      {ring}
      <path d="M8.5 12h7" {...S} />
    </>
  ),
  /* --- Link -------------------------------------------------------------- */
  'link-connected': (
    <>
      {dot(12, 18, 1.6)}
      <path d="M8.5 14.5a5 5 0 0 1 7 0M5.5 11.3a9.2 9.2 0 0 1 13 0" {...S} />
    </>
  ),
  'link-degraded': (
    <>
      {dot(12, 18, 1.6)}
      <path d="M8.5 14.5a5 5 0 0 1 7 0" {...S} />
      <path d="M5.5 11.3a9.2 9.2 0 0 1 13 0" {...S} strokeDasharray="2 3" />
    </>
  ),
  'link-disconnected': (
    <>
      {dot(12, 18, 1.6)}
      <path d="M8.5 14.5a5 5 0 0 1 7 0M5.5 11.3a9.2 9.2 0 0 1 13 0" {...S} opacity={0.6} />
      <path d="m4 4 16 16" {...S} />
    </>
  ),
  /* --- Generic actions --------------------------------------------------- */
  'chevron-right': <path d="m9 6 6 6-6 6" {...S} />,
  'chevron-down': <path d="m6 9 6 6 6-6" {...S} />,
  close: <path d="M6 6l12 12M18 6 6 18" {...S} />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" {...S} />,
  send: <path d="M12 19V5M6 11l6-6 6 6" {...S} />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" {...S} />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" {...S} />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" {...S} />
      <circle cx="8.5" cy="9.5" r="1.6" {...S} />
      <path d="m21 16-5-5-9 9" {...S} />
    </>
  ),
  silence: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4Z" {...S} />
      <path d="m16.5 9.5 5 5M21.5 9.5l-5 5" {...S} />
    </>
  ),
  escalate: (
    <>
      <path d="M7 17 17 7M9 7h8v8" {...S} />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" {...S} />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" {...S} />
    </>
  ),
  flag: <path d="M5 21V4h11l-2 4 2 4H5" {...S} />,
  plus: <path d="M12 5v14M5 12h14" {...S} />,
  minus: <path d="M5 12h14" {...S} />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" {...S} />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" {...S} />,
} satisfies Record<string, ReactNode>;

export type GlyphName = keyof typeof GLYPHS;
export const GLYPH_NAMES = Object.keys(GLYPHS) as GlyphName[];

export interface GlyphProps {
  name: GlyphName;
  /** px. Defaults to the icon-md token (20 px). */
  size?: number;
  /** Accessible name. Omit when an adjacent text label already carries the meaning. */
  title?: string;
  className?: string;
  style?: CSSProperties;
}

export function Glyph({ name, size = 20, title, className, style }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={['nhis-glyph', className].filter(Boolean).join(' ')}
      style={{ flex: 'none', ...style }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  );
}
