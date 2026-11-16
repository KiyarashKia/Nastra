'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Live UTC readout. Renders a placeholder until mounted so server and client markup match. */
export function UtcClock() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setT(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="ld__clock" aria-label="Coordinated Universal Time"><span className="ld__k">UTC</span> <span className="nhis-num">{t ?? '--:--:--'}</span></span>;
}

/** Press 1 or 2 to pick a mode (ignored while typing or with modifier keys). */
export function ModeKeys({ routes }: { routes: string[] }) {
  const router = useRouter();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input,textarea,[contenteditable]')) return;
      const i = Number(e.key) - 1;
      if (routes[i]) router.push(routes[i]);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [router, routes]);
  return null;
}
