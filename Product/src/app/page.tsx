import type { Metadata } from 'next';
import Link from 'next/link';
import { ModeKeys, UtcClock } from './landing-client';
import './landing.css';

export const metadata: Metadata = { title: { absolute: 'NASTRA · Choose a mode' } };

const MODES = [
  {
    href: '/station/overview', key: '1', code: 'STN-01', name: 'NASTRA Station', context: 'Onboard laptop',
    body: 'The full health workspace. Conversation, voice and photo input, trends against your own baseline, protocols and history.',
    cta: 'Enter Station', status: 'ready', statusLabel: 'Ready', glyph: 'station',
  },
  {
    href: '/eva', key: '2', code: 'EVA-02', name: 'NASTRA EVA', context: 'Helmet HUD',
    body: 'Voice-first and glanceable. Essential status and critical alerts when hands and attention are busy.',
    cta: 'Enter EVA', status: 'ready', statusLabel: 'Ready', glyph: 'eva',
  },
] as const;

function Glyph({ kind }: { kind: 'station' | 'eva' }) {
  return kind === 'station' ? (
    <svg className="ld__glyph" viewBox="0 0 96 64" fill="none" aria-hidden="true">
      <rect x="10" y="6" width="76" height="44" stroke="currentColor" strokeWidth="1.25" />
      <path d="M10 16h76M36 16v34M36 33h50" stroke="currentColor" strokeWidth="0.75" opacity="0.55" />
      <path d="M42 44l9-7 7 3 11-10 9 4" stroke="currentColor" strokeWidth="1.25" />
      <path d="M15 22h15M15 27h11M15 32h13" stroke="currentColor" strokeWidth="0.75" opacity="0.55" />
      <path d="M4 58h88" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  ) : (
    <svg className="ld__glyph" viewBox="0 0 96 64" fill="none" aria-hidden="true">
      <path d="M14 48C14 25 29 8 48 8s34 17 34 40" stroke="currentColor" strokeWidth="1.25" />
      <path d="M24 44c0-14 11-25 24-25s24 11 24 25" stroke="currentColor" strokeWidth="0.75" opacity="0.55" />
      <path d="M14 48h68" stroke="currentColor" strokeWidth="1.25" />
      <path d="M40 34h16M48 26v16" stroke="currentColor" strokeWidth="0.75" opacity="0.55" />
      <circle cx="48" cy="34" r="2.5" fill="currentColor" />
      <path d="M34 58h28" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

/** Mode select. Server-rendered; the clock and 1/2 keys are the only client code. */
export default function Landing() {
  return (
    <main className="ld">
      <div className="ld__sky" aria-hidden="true" />
      <ModeKeys routes={MODES.map((m) => m.href)} />

      <header className="ld__bar">
        <span className="ld__credit">By <strong>Maple One</strong> team for NASA Space Apps Hackathon 2026, Kiarash Kia, Upayan Chatterjee</span>
        <span className="ld__readouts">
          <UtcClock />
          <span className="ld__sep" aria-hidden="true" />
          <span className="ld__sim"><span aria-hidden="true" className="ld__sim-dot" />Simulation build — not live data</span>
        </span>
      </header>

      <div className="ld__inner">
        <div className="ld__hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ld__logo" src="/nastra-logo.svg" alt="" width={72} height={72} />
          <div>
            <p className="ld__wordmark">NASTRA</p>
            <p className="ld__eyebrow">Astronaut Intelligent Health Copilot</p>
          </div>
        </div>
        <h1 className="ld__title">Choose a mode</h1>
        <div className="ld__ruler" aria-hidden="true" />

        <nav className="ld__modes" aria-label="NASTRA modes">
          {MODES.map((m) => (
            <Link key={m.href} href={m.href} className={`ld__mode is-${m.status} nhis-focus-ring`} aria-keyshortcuts={m.key}>
              <span className="ld__corners" aria-hidden="true" />
              <span className="ld__scan" aria-hidden="true" />
              <span className="ld__mode-top">
                <span className="ld__code">{m.code}</span>
                <span className={`ld__status is-${m.status}`}><span className="ld__status-dot" aria-hidden="true" />{m.statusLabel}</span>
              </span>
              <Glyph kind={m.glyph} />
              <span className="ld__mode-name">{m.name}</span>
              <span className="ld__mode-context">{m.context}</span>
              <span className="ld__mode-body">{m.body}</span>
              <span className="ld__mode-foot">
                <span className="ld__cta">{m.cta}<span className="ld__arrow" aria-hidden="true">→</span></span>
                <kbd className="ld__key" aria-hidden="true">{m.key}</kbd>
              </span>
            </Link>
          ))}
        </nav>
      </div>

      <footer className="ld__foot">
        <p className="ld__note">
          NASTRA is prototyped in two versions to show how it would work in practice: as software on the crew&rsquo;s onboard
          computer, a full health dashboard, and as a helmet HUD for EVA. Both run on one safety core: code decides, the AI explains.
        </p>
        <p className="ld__disclaimer">
          Concept prototype. Not affiliated with, endorsed, approved or certified by NASA or CSA; no claim of operational readiness.
          All crew data is simulated. Not a medical device: NASTRA does not diagnose or replace a flight surgeon.
        </p>
      </footer>
    </main>
  );
}
