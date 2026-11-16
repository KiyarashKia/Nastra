'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { compareWithYesterday, type CompareRow, type TelemetryVital } from './compare';

/*
 * NASTRA EVA — visor scene + HUD.
 * Scene: the approved cinematic visor footage (closed 60 fps loop, baked fisheye), drawn to a canvas with a
 * bounded look-around. HUD: real DOM on a 1918×1080 "glass" plane that shares the footage's transform, is
 * clipped to the visor opening and bent by an SVG displacement map, so it sits on the curved glass.
 * Voice flow is scripted for the demo (one command, controlled timing). The numbers are live API data.
 */

const SRC_W = 1918, SRC_H = 1080;
const COMMAND = 'show my vitals and compare it with yesterday';
type Phase = 'idle' | 'listening' | 'transcribing' | 'processing' | 'result';
const PROCESS_LINES = [
  'voice.parse ............. request · health_data',
  'safety.screen ........... clear',
  'tool telemetry.vitals_series --window 24h ... ok',
  'compare now vs t-24h .... 6 channels',
];

interface Status { profile: { name: string; metDay: number }; mode: string; linkDelayLabel: string }
interface Overview { alerts: { priority: string; active: boolean; title: string; metric: string | null }[] }

export function EvaVisor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const opticRef = useRef<HTMLDivElement>(null);
  const [mapHref, setMapHref] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [full, setFull] = useState(false);

  /* ── Scene: canvas video with seamless two-element loop handoff, bounded look-around ── */
  useEffect(() => {
    const canvas = canvasRef.current!, optic = opticRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const make = () => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('playsinline', '');
      v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
      v.setAttribute('aria-hidden', 'true');
      document.body.append(v);
      return v;
    };
    let motion = make(), standby = make();
    const poster = new Image(); poster.src = '/eva/poster.webp';
    let w = 0, h = 0, x = 0, y = 0, tx = 0, ty = 0, last = 0, raf = 0, touch = false, failed = false;
    const playing = !reduced;

    const resize = () => {
      w = innerWidth; h = innerHeight;
      const d = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    // Smallest screen-filling scale plus a small margin so look-around never shows the frame edge.
    const rect = () => {
      const scale = Math.max(w / SRC_W, h / SRC_H) * 1.025, dw = SRC_W * scale, dh = SRC_H * scale;
      const travelX = Math.max(0, Math.min(w * 0.012, (dw - w) / 2 - 4)), travelY = Math.max(0, Math.min(h * 0.011, (dh - h) / 2 - 4));
      return { scale, dw, dh, left: (w - dw) / 2 + x * travelX, top: (h - dh) / 2 + y * travelY };
    };
    const start = (v: HTMLVideoElement) => { if (playing && !document.hidden) v.play().catch(() => undefined); };
    const handoff = () => {
      if (!playing || document.hidden || standby.readyState < 2) return;
      const prev = motion; motion = standby; standby = prev;
      standby.pause(); standby.currentTime = 0; start(motion);
    };
    for (const v of [motion, standby]) {
      v.addEventListener('error', () => { if (v === motion) failed = true; });
      v.addEventListener('ended', () => { if (v === motion) handoff(); });
      v.src = '/eva/eva-closed-cycle.mp4'; v.load();
    }
    motion.addEventListener('loadeddata', () => { setLoaded(true); start(motion); }, { once: true });
    poster.onload = () => { if (failed) setLoaded(true); };

    const render = (now: number) => {
      const dt = Math.min((now - last) / 1000 || 0, 0.075); last = now;
      const k = 1 - Math.exp(-dt * 4.8); x += (tx - x) * k; y += (ty - y) * k;
      if (playing && Number.isFinite(motion.duration) && motion.currentTime >= motion.duration - 0.004) handoff();
      const r = rect();
      ctx.fillStyle = '#050706'; ctx.fillRect(0, 0, w, h);
      const src = !failed && motion.readyState >= 2 ? motion : poster.complete && poster.naturalWidth ? poster : null;
      if (src) ctx.drawImage(src, r.left, r.top, r.dw, r.dh);
      optic.style.transform = `translate(${r.left}px,${r.top}px) scale(${r.scale})`;
      raf = requestAnimationFrame(render);
    };

    const aim = (e: PointerEvent) => { if (reduced) return; tx = -((e.clientX / w) * 2 - 1); ty = -((e.clientY / h) * 2 - 1); };
    const onMove = (e: PointerEvent) => { if (e.pointerType === 'mouse' || touch) aim(e); };
    const onDown = (e: PointerEvent) => { touch = e.pointerType !== 'mouse'; if (touch) aim(e); };
    const onUp = () => { if (touch) { touch = false; tx = ty = 0; } };
    const onLeave = () => { if (!touch) tx = ty = 0; };
    const onVis = () => { if (document.hidden) motion.pause(); else start(motion); };

    resize();
    addEventListener('resize', resize);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      removeEventListener('pointerup', onUp);
      document.removeEventListener('visibilitychange', onVis);
      for (const v of [motion, standby]) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); }
    };
  }, []);

  // Displacement map as a data URL: feImage is only reliable with inline data.
  useEffect(() => {
    fetch('/eva/optic-displacement.png').then((r) => r.blob()).then((b) => new Promise<string>((res) => {
      const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(b);
    })).then(setMapHref).catch(() => setMapHref(null));
  }, []);

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = useCallback(async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* unsupported */ }
  }, []);

  /* ── Data (live API) ── */
  const [status, setStatus] = useState<Status | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [dataError, setDataError] = useState(false);
  const loadData = useCallback(async () => {
    try {
      const [s, t, o] = await Promise.all(['/api/status', '/api/telemetry', '/api/overview'].map((u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))));
      setStatus(s); setOverview(o); setRows(compareWithYesterday((t as { vitals: TelemetryVital[] }).vitals)); setDataError(false);
    } catch { setDataError(true); }
  }, []);
  useEffect(() => { void loadData(); const id = setInterval(loadData, 30_000); return () => clearInterval(id); }, [loadData]);

  /* ── Voice flow (scripted) ── */
  const [phase, setPhase] = useState<Phase>('idle');
  const [typed, setTyped] = useState('');
  const [logN, setLogN] = useState(0);
  const timers = useRef<number[]>([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };

  const send = useCallback(() => {
    clearTimers(); setPhase('transcribing'); setTyped('');
    const step = 26;
    for (let i = 1; i <= COMMAND.length; i++) after(i * step, () => setTyped(COMMAND.slice(0, i)));
    const t0 = COMMAND.length * step + 300;
    after(t0, () => { setPhase('processing'); setLogN(0); });
    PROCESS_LINES.forEach((_, i) => after(t0 + 260 + i * 300, () => setLogN(i + 1)));
    after(t0 + 260 + PROCESS_LINES.length * 300 + 250, () => {
      void loadData(); setPhase('result');
      if (history.state?.eva !== 'result') history.pushState({ ...history.state, eva: 'result' }, '');
    });
  }, [loadData]);

  const mic = useCallback(() => {
    if (phase === 'listening') { send(); return; }
    if (phase === 'transcribing' || phase === 'processing') return;
    clearTimers(); setPhase('listening');
    after(8400, () => send()); // listening window (doubled after the first live run)
  }, [phase, send]);
  const dismiss = useCallback(() => {
    clearTimers(); setPhase('idle');
    if (history.state?.eva === 'result') history.back();
  }, []);
  // Browser Back from a result returns to the visor, not to the previous page.
  useEffect(() => {
    const on = () => { if (history.state?.eva !== 'result') { clearTimers(); setPhase('idle'); } };
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest('a,button') && (e.key === ' ' || e.key === 'Enter')) return;
      if (e.code === 'Space' || e.key.toLowerCase() === 'm') { e.preventDefault(); mic(); }
      else if (e.key === 'Escape') dismiss();
      else if (e.key.toLowerCase() === 'h') setHidden((v) => !v);
      else if (e.key.toLowerCase() === 'f') void toggleFull();
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [mic, dismiss, toggleFull]);

  const active = (overview?.alerts ?? []).filter((a) => a.active);
  const flagged = rows.filter((r) => r.band === 'above' || r.band === 'below');
  const sim = status?.mode !== 'live';
  const live = phase === 'idle' ? 'Visor ready. Press Space or tap the microphone to give a voice command.'
    : phase === 'listening' ? `Listening. Say: ${COMMAND}.` : phase === 'result' ? 'Showing vitals, now compared with the same hour yesterday.' : 'Processing command.';

  return (
    <main className={`eva${hidden ? ' is-quiet' : ''}${loaded ? ' is-loaded' : ''}`}>
      <canvas ref={canvasRef} className="eva__view" aria-label="View through an astronaut's helmet visor onto the lunar surface" />

      <svg width="1" height="1" className="eva__defs" aria-hidden="true">
        <defs>
          <filter id="eva-optic-warp" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width={SRC_W} height={SRC_H} colorInterpolationFilters="sRGB">
            {mapHref && <feImage href={mapHref} x="0" y="0" width={SRC_W} height={SRC_H} preserveAspectRatio="none" result="map" />}
            <feDisplacementMap in="SourceGraphic" in2="map" scale="105" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* The glass: everything in here is projected onto the visor. Coordinates are footage pixels. */}
      <div ref={opticRef} className="eva__optic">
        <div className="eva__glass" style={{ filter: mapHref ? 'url(#eva-optic-warp)' : 'none' }}>
          <div className="hud" role="region" aria-label="Visor HUD">
            <div className="hud__bar">
              <span className="hud__b">NASTRA//EVA</span>
              <span>CREW {status?.profile.name.toUpperCase() ?? '—'}</span>
              <span>MET {status ? String(status.profile.metDay).padStart(3, '0') : '---'}</span>
              <span>LINK {status?.linkDelayLabel.toUpperCase() ?? '—'}</span>
              {sim && <span className="hud__inv">SIM</span>}
            </div>

            <div className="hud__bio">
              <p className="hud__h">BIO</p>
              {dataError ? <p>TELEMETRY LOST · USE VOICE LOOP</p> : !rows.length ? <p>ACQUIRING…</p> : flagged.length === 0 ? (
                <p>ALL CHANNELS WITHIN YOUR BAND</p>
              ) : (
                flagged.slice(0, 3).map((r) => (
                  <p key={r.key}>{r.label.padEnd(6, ' ')} {fmt(r.now, r.decimals).padStart(5, ' ')} {r.unit.padEnd(4, ' ')} {r.band === 'above' ? '▲' : '▼'} ADV</p>
                ))
              )}
              <p className="hud__dim">ALERTS {active.length} ACTIVE{active.some((a) => a.priority === 'warning') ? ' · WARNING' : ''}</p>
            </div>

            <div className="hud__reticle" aria-hidden="true" />

            {(phase === 'processing' || phase === 'result') && (
              <section className="hud__panel" aria-label="Vitals now versus yesterday">
                {phase === 'processing' ? (
                  <div className="hud__log">
                    {PROCESS_LINES.slice(0, logN).map((l) => <p key={l}>&gt; {l}</p>)}
                    <p className="hud__cursor">&gt; _</p>
                  </div>
                ) : (
                  <>
                    <p className="hud__title">VITALS · NOW vs YESTERDAY, SAME HOUR</p>
                    <table className="hud__table">
                      <thead><tr><th>CH</th><th>NOW</th><th>YDAY</th><th>Δ</th><th>24 H</th><th>BAND</th></tr></thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.key} className={r.band === 'above' || r.band === 'below' ? 'is-flag' : ''}>
                            <td>{r.label}</td>
                            <td>{fmt(r.now, r.decimals)}<span className="hud__u"> {r.unit}</span></td>
                            <td>{r.yday === null ? '—' : fmt(r.yday, r.decimals)}</td>
                            <td>{r.delta === null ? '—' : `${r.delta > 0 ? '+' : ''}${fmt(r.delta, r.decimals)}`}</td>
                            <td className="hud__spark">{r.spark}</td>
                            <td>{r.band === 'above' ? '▲ ABOVE' : r.band === 'below' ? '▼ BELOW' : r.band === 'within' ? 'OK' : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="hud__dim">Hourly means vs your own 14-day band. Personal comparison, not a diagnosis.</p>
                    <p className="hud__dim">BACK OR ESC · SPACE NEW COMMAND</p>
                  </>
                )}
              </section>
            )}

            <div className={`hud__voice is-${phase}`}>
              {phase === 'idle' && (<>
                <p><span className="hud__inv">MIC</span> PRESS SPACE OR TAP · SAY A COMMAND</p>
                <p className="hud__dim">e.g. › {COMMAND}</p>
              </>)}
              {phase === 'listening' && (<>
                <p><span className="hud__rec" aria-hidden="true" /> LISTENING <span className="hud__wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span></p>
                <p>SAY › &ldquo;{COMMAND}&rdquo;</p>
                <p className="hud__dim">TAP AGAIN TO SEND</p>
              </>)}
              {(phase === 'transcribing' || phase === 'processing' || phase === 'result') && (
                <p>&gt; {phase === 'transcribing' ? typed : COMMAND}{phase === 'transcribing' && <span className="hud__caret">▌</span>}</p>
              )}
            </div>

            <div className="hud__scan" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="eva__vignette" aria-hidden="true" />
      {/* Disclosure: always visible, including with UI hidden (H), so recordings carry it too. */}
      <p className="eva__credit">Visor footage: AI-generated (Seedance 2.5). HUD and data: NASTRA prototype.</p>
      <p className="eva__sr" aria-live="polite">{live}</p>

      {/* Device controls: screen space, outside the glass. */}
      <div className="eva__chrome">
        <Link href="/" className="eva__btn eva__exit">← MODES</Link>
        <div className="eva__right">
          <button type="button" className="eva__btn" onClick={() => setHidden((v) => !v)} aria-pressed={hidden}>HIDE UI <kbd>H</kbd></button>
          <button type="button" className="eva__btn" onClick={() => void toggleFull()}>{full ? 'EXIT FULLSCREEN' : 'FULLSCREEN'} <kbd>F</kbd></button>
        </div>
      </div>
      {phase === 'result' && (
        <button type="button" className="eva__btn eva__back" onClick={dismiss}>← BACK <kbd>ESC</kbd></button>
      )}
      <button type="button" className={`eva__mic is-${phase}`} onClick={mic} aria-label={phase === 'listening' ? 'Send voice command' : 'Start voice command'} aria-keyshortcuts="Space">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>

      {!loaded && <div className="eva__loader"><p>NASTRA</p><p className="eva__loader-sub">PREPARING YOUR VISOR</p></div>}
    </main>
  );
}

function fmt(v: number, d: number) { return v.toFixed(d); }
