import type { Metadata } from 'next';
import Link from 'next/link';
import '../landing.css';

export const metadata: Metadata = { title: 'NASTRA EVA' };

/** Placeholder route. The EVA HUD experience is defined next. */
export default function EvaPage() {
  return (
    <main className="ld ld--eva">
      <div className="ld__sky" aria-hidden="true" />
      <div className="ld__inner ld__inner--narrow">
        <p className="ld__eyebrow">NASTRA EVA · Helmet HUD</p>
        <h1 className="ld__title ld__title--sm">In development</h1>
        <p className="ld__lede">Voice-first, minimal visuals, critical alerts only. Same safety core as Station.</p>
        <Link href="/" className="ld__back nhis-focus-ring">← Mode select</Link>
      </div>
    </main>
  );
}
