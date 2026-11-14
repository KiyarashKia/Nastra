/**
 * NASTRA EVA — DESIGN-SYSTEM SIMULATION / PROTOTYPE.
 * Not a certified flight-hardware implementation (03 §2.2). These components
 * render visor content on a simulated see-through display so NHIS Checklist B
 * rules can be reviewed. Layout is expressed in visual angle, not CSS breakpoints
 * (03 §12.2). Values are NHIS starting values for suited/analog testing.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Glyph, type GlyphName } from '../shared/Glyph';
import { flashSyncStyle, useAnnunciation } from '../shared/NHISProvider';
import { tokenValues } from '../../tokens/types/tokens';
import { treatmentFor, validateAlert } from '../../semantics/rules';
import { formatAge, formatDurationHm, formatNumber } from '../../semantics/format';
import type {
  CoarseStatus,
  DataQuality,
  DeclutterLevel,
  LinkState,
  OperationalAlert,
  ProtocolStepState,
  VoiceState,
} from '../../semantics/model';
import './eva.css';

const cx = (...c: Array<string | false | undefined | null>) => c.filter(Boolean).join(' ');
const deg = (v: string) => parseFloat(v);
const A = tokenValues.eva.angle;

/**
 * Periphery slots (deg from line of sight, +y up). With a 37° diagonal 16:9
 * display centred on the line of sight, a 10° clear zone leaves only two
 * lateral bands (|x| > 10°). Everything persistent lives there (B1, B25).
 * Slot layout is an NHIS design decision for review, not a hardware layout.
 */
const SLOT = {
  upper: 8.4,
  response: 6,
  steps: 3.4,
  alertChip: 2.6,
  lower: -0.5,
  bearing: -6.6,
} as const;

/* ------------------------------------------------------------------ */
/* Visor geometry context                                              */
/* ------------------------------------------------------------------ */
export type OpticsModel = 'additive' | 'opaque-plate';
export type Rendering = 'color' | 'monochrome-green';
export type SceneLighting = 'grazing' | 'up-sun' | 'shadow';

interface VisorGeometry {
  /** Pixels per degree of visual angle in this simulation. */
  ppd: number;
  widthDeg: number;
  heightDeg: number;
  rendering: Rendering;
  declutter: DeclutterLevel;
  optics: OpticsModel;
}
const VisorContext = createContext<VisorGeometry | null>(null);
export function useVisor() {
  const v = useContext(VisorContext);
  if (!v) throw new Error('EVA components must be rendered inside <EVAVisorSim>.');
  return v;
}
/** Converts a visual angle (deg) to px in the simulation. */
export function useAngle() {
  const { ppd } = useVisor();
  return (d: number) => d * ppd;
}

/** Positions content by visual angle from the line of sight (x right, y up). */
function Anchored({ x, y, align = 'center', valign = 'middle', children, className, style }: {
  x: number;
  y: number;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { ppd, widthDeg, heightDeg } = useVisor();
  const left = (widthDeg / 2 + x) * ppd;
  const top = (heightDeg / 2 - y) * ppd;
  const tx = align === 'left' ? '0' : align === 'right' ? '-100%' : '-50%';
  const ty = valign === 'top' ? '0' : valign === 'bottom' ? '-100%' : '-50%';
  return (
    <div className={cx('nhis-eva-anchor', className)} style={{ left, top, transform: `translate(${tx}, ${ty})`, ...style }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EVAVisorSim                                                         */
/* ------------------------------------------------------------------ */
export interface EVAVisorSimProps {
  children?: ReactNode;
  /** Simulation width in px; height follows a 16:9 display. */
  width?: number;
  lighting?: SceneLighting;
  rendering?: Rendering;
  declutter?: DeclutterLevel;
  /** additive: black is transparent and plates cannot darken the scene (B23 worst case). */
  optics?: OpticsModel;
  /** Review overlay: clear zone, ±15° alert band, horizon, periphery. */
  showGuides?: boolean;
}

export function EVAVisorSim({
  children,
  width = 960,
  lighting = 'grazing',
  rendering = 'color',
  declutter = 'full',
  optics = 'additive',
  showGuides = true,
}: EVAVisorSimProps) {
  const diag = deg(A.displayDiagonalFov);
  const widthDeg = (diag * 16) / Math.hypot(16, 9);
  const heightDeg = (diag * 9) / Math.hypot(16, 9);
  const ppd = width / widthDeg;
  const height = heightDeg * ppd;
  const geo = useMemo<VisorGeometry>(() => ({ ppd, widthDeg, heightDeg, rendering, declutter, optics }), [ppd, widthDeg, heightDeg, rendering, declutter, optics]);
  const clear = deg(A.clearZoneRadius) * ppd;
  const los = deg(A.alertNearLosMax) * ppd;
  return (
    <VisorContext.Provider value={geo}>
      <div className="nhis-eva-sim" style={{ width }}>
        <div className="nhis-eva-sim__label" role="note">
          <Glyph name="simulation" size={16} /> EVA SIMULATION · design-system prototype · not flight hardware · simulated scene and data
        </div>
        <div
          className={cx('nhis-eva-visor', `is-${rendering}`, `is-${optics}`, `is-declutter-${declutter}`)}
          style={{ width, height, ['--eva-ppd' as string]: `${ppd}px`, ['--eva-band' as string]: `${(widthDeg / 2 - deg(A.clearZoneRadius) - 0.9) * ppd}px` }}
          aria-label="Simulated visor view"
        >
          <Scene lighting={lighting} />
          {showGuides && (
            <svg className="nhis-eva-guides" width={width} height={height} aria-hidden="true">
              <line x1={0} x2={width} y1={height / 2} y2={height / 2} className="nhis-eva-guides__horizon" />
              <rect x={width / 2 - los} y={height / 2 - los} width={los * 2} height={los * 2} className="nhis-eva-guides__los" />
              <path
                d={`M ${width / 2 - clear} ${height / 2} A ${clear} ${clear} 0 0 1 ${width / 2 + clear} ${height / 2} L ${width / 2 + clear} ${height} L ${width / 2 - clear} ${height} Z`}
                className="nhis-eva-guides__clear"
              />
            </svg>
          )}
          <div className="nhis-eva-overlay">{children}</div>
        </div>
        {showGuides && (
          <p className="nhis-eva-sim__legend">
            Review guides: <span className="is-clear">clear zone</span> {A.clearZoneRadius.replace('deg', '°')} radius + foot-placement region (B1, starting value) ·{' '}
            <span className="is-los">±{A.alertNearLosMax.replace('deg', '°')} alert band</span> (B6) · <span className="is-horizon">horizon / line of sight</span> · display {A.displayDiagonalFov.replace('deg', '°')} diagonal (simulation assumption)
          </p>
        )}
      </div>
    </VisorContext.Provider>
  );
}

function Scene({ lighting }: { lighting: SceneLighting }) {
  // Simulated lunar scene for legibility review only. Not photographic, not data.
  return (
    <svg className={cx('nhis-eva-scene', `is-${lighting}`)} viewBox="0 0 160 90" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="nhis-ground-grazing" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3a3a" />
          <stop offset="1" stopColor="#141414" />
        </linearGradient>
        <linearGradient id="nhis-ground-upsun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2f2ee" />
          <stop offset="1" stopColor="#9a9a96" />
        </linearGradient>
        <linearGradient id="nhis-ground-shadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#151515" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
        <radialGradient id="nhis-sun" cx="0.62" cy="0.48" r="0.35">
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="160" height="45" fill="#000" />
      <rect
        y="44"
        width="160"
        height="46"
        fill={lighting === 'up-sun' ? 'url(#nhis-ground-upsun)' : lighting === 'shadow' ? 'url(#nhis-ground-shadow)' : 'url(#nhis-ground-grazing)'}
      />
      <path d="M0 45 L18 42 L34 44 L52 40.5 L70 43.5 L96 41 L118 44 L140 42 L160 44 L160 46 L0 46Z" fill={lighting === 'up-sun' ? '#d8d8d4' : '#2b2b2b'} />
      {lighting === 'grazing' &&
        [
          [30, 60, 9, 2.2],
          [110, 70, 14, 3],
          [70, 82, 18, 3.5],
          [140, 56, 6, 1.4],
        ].map(([x, y, rx, ry], i) => (
          <g key={i}>
            <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#0a0a0a" />
            <path d={`M${x! - rx!} ${y} A ${rx} ${ry} 0 0 0 ${x! + rx!} ${y}`} stroke="#bdbdbd" strokeWidth="0.6" fill="none" />
          </g>
        ))}
      {lighting === 'up-sun' && <rect width="160" height="90" fill="url(#nhis-sun)" />}
      <text x="80" y="88" fontSize="2.4" fill="#777" textAnchor="middle">
        Simulated scene · {lighting}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Glance text                                                         */
/* ------------------------------------------------------------------ */
/**
 * Text sized in visual angle (B20): primary 0.7°, everything else at the 0.5°
 * moving minimum. The 0.35° stationary floor is reserved for content read while
 * stopped and is not used by default.
 */
function GlanceText({ children, level = 'primary', className, style }: { children: ReactNode; level?: 'primary' | 'moving' | 'secondary' | 'stationary'; className?: string; style?: CSSProperties }) {
  const toPx = useAngle();
  const size = toPx(deg(level === 'primary' ? A.textPrimary : level === 'stationary' ? A.textStationaryFloor : A.textMovingMin));
  return (
    <span className={cx('nhis-eva-text', `nhis-eva-text--${level}`, className)} style={{ fontSize: size, lineHeight: 1.15, ...style }}>
      {children}
    </span>
  );
}

const COARSE: Record<CoarseStatus, { label: string; glyph: GlyphName | null }> = {
  'in-range': { label: 'In range', glyph: null },
  trending: { label: 'Trending', glyph: 'derived' },
  'out-of-range': { label: 'Out of range', glyph: 'caution' },
};

/* ------------------------------------------------------------------ */
/* EVAStatusStrip — body-locked, lower-lateral periphery (B9, B25).    */
/* Coarse coding; numbers on exception or request (B13, B15).          */
/* ------------------------------------------------------------------ */
export interface EVAStatusItem {
  id: string;
  /** Short label, e.g. "Suit P", "ppO2", "HR". */
  label: string;
  value?: number;
  unit: string;
  decimals?: number;
  status: CoarseStatus;
  quality: DataQuality;
  ageMs?: number;
  /** Suit parameters required by NASA-STD-3001 §11 are always listed (B3). */
  required?: boolean;
}

export interface EVAStatusStripProps {
  items: EVAStatusItem[];
  link: { state: LinkState; dataAgeMs?: number };
  /** One voice command or one press recalls all values (B13). */
  recalled?: boolean;
  side?: 'left' | 'right';
}

export function EVAStatusStrip({ items, link, recalled = false, side = 'left' }: EVAStatusStripProps) {
  const { widthDeg, declutter } = useVisor();
  const x = side === 'left' ? -widthDeg / 2 + 0.6 : widthDeg / 2 - 0.6;
  const visible = items.filter((i) => recalled || declutter === 'full' || i.status !== 'in-range' || i.quality !== 'live');
  return (
    <Anchored x={x} y={SLOT.lower} align={side} valign="top" className="nhis-eva-strip">
      <div className="nhis-eva-plate nhis-eva-strip__list" role="list" aria-label="Suit and health status">
        {visible.map((i) => (
          <StatusRow key={i.id} item={i} recalled={recalled} />
        ))}
        {visible.length === 0 && <GlanceText level="secondary">All nominal</GlanceText>}
        <div className="nhis-eva-strip__link" role="listitem">
          <Glyph name={link.state === 'connected' ? 'link-connected' : link.state === 'degraded' ? 'link-degraded' : 'link-disconnected'} size={18} />
          <GlanceText level="secondary">
            {link.state === 'connected' ? 'Link' : link.state === 'degraded' ? 'Link degraded' : link.state === 'disconnected' ? 'No link' : 'Link ?'}
            {link.dataAgeMs !== undefined && ` · data ${formatAge(link.dataAgeMs)}`}
          </GlanceText>
        </div>
      </div>
    </Anchored>
  );
}

function StatusRow({ item, recalled }: { item: EVAStatusItem; recalled: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const [dwelling, setDwelling] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const degraded = item.quality !== 'live';
  const exception = item.status !== 'in-range' || degraded;
  const showNumber = recalled || revealed || exception;
  const c = COARSE[item.status];
  // Gaze dwell (simulated by pointer hover) may only REVEAL, reversibly (B31).
  const start = () => {
    setDwelling(true);
    timer.current = window.setTimeout(() => setRevealed(true), tokenValues.eva.timing.dwellRevealMs);
  };
  const stop = () => {
    window.clearTimeout(timer.current);
    setDwelling(false);
    setRevealed(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div
      role="listitem"
      className={cx('nhis-eva-row', `is-${item.status}`, degraded && 'is-degraded', !exception && !recalled && 'is-lowlight', revealed && 'is-revealed')}
      onPointerEnter={start}
      onPointerLeave={stop}
    >
      <span className="nhis-eva-row__glyph">{degraded ? <Glyph name={item.quality === 'stale' ? 'stale' : item.quality === 'delayed' ? 'delayed' : item.quality === 'unknown' ? 'unknown' : 'unavailable'} size={18} /> : c.glyph ? <Glyph name={c.glyph} size={18} /> : <span className="nhis-eva-row__dot" />}</span>
      <GlanceText level={exception ? 'moving' : 'secondary'} className="nhis-eva-row__label">
        {item.label}
        {exception && (
          <span className="nhis-eva-row__qual">
            {' · '}
            {degraded
              ? `${item.quality === 'unavailable' ? 'No data' : item.quality[0]!.toUpperCase() + item.quality.slice(1)}${item.ageMs !== undefined && item.quality !== 'unknown' ? ` ${formatAge(item.ageMs)}` : ''}`
              : c.label}
          </span>
        )}
        {!exception && !showNumber && <span className="nhis-eva-row__coarse"> · {c.label}</span>}
      </GlanceText>
      {showNumber && (
        <GlanceText level={exception ? 'primary' : 'moving'} className="nhis-eva-row__value">
          <span className="nhis-eva-num">
            {item.value === undefined || item.quality === 'unavailable' || item.quality === 'unknown' ? '—' : formatNumber(item.value, { decimals: item.decimals ?? 0 })}
          </span>
          <span className="nhis-eva-row__unit"> {item.unit}</span>
        </GlanceText>
      )}
      {dwelling && !revealed && !exception && !recalled && <span className="nhis-eva-row__dwell" aria-hidden="true" />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ConsumableReadout — limiting consumable vs walk-back time (B12)     */
/* ------------------------------------------------------------------ */
export interface ConsumableReadoutProps {
  /** Limiting consumable, e.g. "O2". */
  consumable: string;
  remainingMin: number;
  walkBackMin: number;
  status: CoarseStatus;
  quality?: DataQuality;
  /** Source of the walk-back estimate, e.g. "Nav estimate". */
  walkBackSource: string;
}

export function ConsumableReadout({ consumable, remainingMin, walkBackMin, status, quality = 'live', walkBackSource }: ConsumableReadoutProps) {
  const { widthDeg } = useVisor();
  const degraded = quality !== 'live';
  return (
    <Anchored x={widthDeg / 2 - 0.6} y={SLOT.lower} align="right" valign="top">
      <div className={cx('nhis-eva-plate nhis-eva-consumable', `is-${status}`, degraded && 'is-degraded')}>
        <GlanceText level="secondary">{consumable} remaining</GlanceText>
        <GlanceText level="primary" className="nhis-eva-consumable__value nhis-eva-num">
          {formatDurationHm(remainingMin)}
        </GlanceText>
        <GlanceText level="secondary">
          Walk-back {formatDurationHm(walkBackMin)} · {walkBackSource}
        </GlanceText>
        {status !== 'in-range' && <GlanceText level="moving">{COARSE[status].label}</GlanceText>}
        {degraded && <GlanceText level="moving">{quality === 'unavailable' ? 'No data' : quality[0]!.toUpperCase() + quality.slice(1)}</GlanceText>}
      </div>
    </Anchored>
  );
}

/* ------------------------------------------------------------------ */
/* EVAAlertCue — one shared alert model, EVA presentation (B4–B7, B28) */
/* ------------------------------------------------------------------ */
export interface EVAAlertCueProps {
  alert: OperationalAlert;
  /** Short condition text, e.g. "ppCO2 high". Keep to a glance. */
  cue: string;
  value?: string;
  /** Shown after one-press / one-word acknowledgement (B7, B30). */
  acknowledgedFeedback?: boolean;
}

export function EVAAlertCue({ alert, cue, value, acknowledgedFeedback }: EVAAlertCueProps) {
  useAnnunciation(alert);
  const toPx = useAngle();
  const { widthDeg, rendering } = useVisor();
  const t = treatmentFor(alert.priority);
  const problems = validateAlert(alert);
  const unacked = alert.acknowledgement === 'unacknowledged';
  if (problems.length) {
    return (
      <Anchored x={0} y={deg(A.clearZoneRadius) + 1.5} valign="bottom">
        <div className="nhis-eva-plate nhis-eva-invalid">
          <GlanceText level="moving">Alert rejected: integration error</GlanceText>
        </div>
      </Anchored>
    );
  }
  const high = alert.priority === 'warning' || alert.priority === 'emergency';
  if (high) {
    // Outline ring at the clear-zone edge (leaves terrain visible) + a label chip
    // in the right band inside the ±15° alert band (B6). Acknowledgement prompt
    // and feedback sit with the chip, never inside the clear zone.
    const r = deg(A.clearZoneRadius) + 0.4;
    return (
      <>
        <div
          className={cx('nhis-eva-ring', `is-${alert.priority}`)}
          style={{ width: toPx(r * 2), height: toPx(r * 2), left: `calc(50% - ${toPx(r)}px)`, top: `calc(50% - ${toPx(r)}px)` }}
          aria-hidden="true"
        />
        <Anchored x={deg(A.clearZoneRadius) + 0.5} y={SLOT.alertChip} align="left">
          <div className={cx('nhis-eva-alert', `is-${alert.priority}`)} role="alert" aria-label={`${t.label}: ${cue}`}>
            <span className={cx('nhis-eva-alert__chip', unacked && 'nhis-flash-nontext-high')} style={unacked ? flashSyncStyle() : undefined}>
              <Glyph name={t.glyph} size={toPx(1.1)} />
              <GlanceText level="primary">{t.label}</GlanceText>
            </span>
            <span className="nhis-eva-plate nhis-eva-alert__text">
              <GlanceText level="primary">{cue}</GlanceText>
              {value && (
                <GlanceText level="primary" className="nhis-eva-num">
                  {value}
                </GlanceText>
              )}
              {alert.priority === 'emergency' && alert.authorization && (
                <GlanceText level="secondary" className="nhis-eva-alert__source">
                  {alert.authorization.sourceName}
                </GlanceText>
              )}
              <GlanceText level="secondary" className="nhis-eva-alert__ack">
                {acknowledgedFeedback || !unacked ? 'Acknowledged · still active' : 'Say "Acknowledge" or press A'}
              </GlanceText>
            </span>
          </div>
        </Anchored>
        {rendering === 'monochrome-green' && <span className="nhis-visually-hidden">Monochrome review rendering</span>}
      </>
    );
  }
  // Advisory and Caution: periphery only, upper-lateral, glance-only (B25).
  return (
    <Anchored x={widthDeg / 2 - 0.6} y={SLOT.upper} align="right" valign="top">
      <div className={cx('nhis-eva-plate nhis-eva-periph-alert', `is-${alert.priority}`)} role={alert.priority === 'caution' ? 'alert' : 'status'}>
        <Glyph name={t.glyph} size={toPx(0.9)} />
        <GlanceText level="moving">
          {t.label}: {cue}
          {value && ` ${value}`}
        </GlanceText>
      </div>
    </Anchored>
  );
}

/* ------------------------------------------------------------------ */
/* VoiceCue — listening, read-back, executed, failure, fallback (B30)  */
/* ------------------------------------------------------------------ */
export interface VoiceCueProps {
  state: VoiceState;
  /** What the system heard; shown for read-back. */
  heard?: string;
  /** Result shown after execution, e.g. "Vitals shown". */
  result?: string;
}

export function VoiceCue({ state, heard, result }: VoiceCueProps) {
  const { widthDeg } = useVisor();
  if (state === 'off') return null;
  const text: Record<Exclude<VoiceState, 'off'>, string> = {
    listening: 'Listening',
    recognizing: 'Recognising…',
    'read-back': `Heard "${heard ?? ''}" · say "Confirm" or press A`,
    executed: result ?? 'Done',
    'not-understood': 'Not understood · say again or use wrist control',
    unavailable: 'Voice unavailable · use wrist control',
  };
  return (
    <Anchored x={-widthDeg / 2 + 0.6} y={SLOT.upper} align="left" valign="top">
      <div className={cx('nhis-eva-plate nhis-eva-voice', `is-${state}`)} role="status">
        <Glyph name={state === 'unavailable' ? 'unavailable' : state === 'executed' ? 'check' : 'mic'} size={20} />
        <GlanceText level="moving">{text[state]}</GlanceText>
      </div>
    </Anchored>
  );
}

/* ------------------------------------------------------------------ */
/* NASTRAResponseCue — concise, brief, dismissible (B16)               */
/* ------------------------------------------------------------------ */
export interface NASTRAResponseCueProps {
  /** Short phrase. Long answers are deferred to Station. */
  text: string;
  kind?: 'response' | 'out-of-scope' | 'ai-unavailable';
  /** Auto-hide after ms; the user can also dismiss by voice or button B. */
  visibleForMs?: number;
  onHide?: () => void;
}

export function NASTRAResponseCue({ text, kind = 'response', visibleForMs = 6000, onHide }: NASTRAResponseCueProps) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    setShown(true);
    if (kind === 'ai-unavailable') return;
    const t = window.setTimeout(() => {
      setShown(false);
      onHide?.();
    }, visibleForMs);
    return () => window.clearTimeout(t);
  }, [text, kind, visibleForMs, onHide]);
  const { widthDeg } = useVisor();
  if (!shown) return null;
  return (
    <Anchored x={-widthDeg / 2 + 0.6} y={SLOT.response} align="left" valign="top">
      <div className={cx('nhis-eva-plate nhis-eva-response', `is-${kind}`)} role="status">
        <Glyph name={kind === 'response' ? 'ai-assessment' : 'unknown'} size={20} />
        <GlanceText level="moving">
          {kind === 'ai-unavailable' ? 'NASTRA AI offline · suit alerts unaffected' : kind === 'out-of-scope' ? `Beyond NASTRA · ${text}` : text}
        </GlanceText>
      </div>
    </Anchored>
  );
}

/* ------------------------------------------------------------------ */
/* ProtocolStepCue — ≤ 4 steps, current at full intensity (B17)        */
/* ------------------------------------------------------------------ */
export interface ProtocolStepCueProps {
  title: string;
  steps: Array<{ id: string; title: string; state: ProtocolStepState }>;
  /** Task duration, e.g. "0:12 elapsed". */
  duration?: string;
}

export function ProtocolStepCue({ title, steps, duration }: ProtocolStepCueProps) {
  const { widthDeg } = useVisor();
  const max = tokenValues.eva.content.maxProtocolSteps;
  const ci = Math.max(0, steps.findIndex((s) => s.state === 'current'));
  const start = Math.min(Math.max(0, ci - 1), Math.max(0, steps.length - max));
  const shown = steps.slice(start, start + max);
  return (
    <Anchored x={-widthDeg / 2 + 0.6} y={SLOT.steps} align="left" valign="top">
      <div className="nhis-eva-plate nhis-eva-steps" aria-label={`Procedure: ${title}`}>
        <GlanceText level="secondary">
          {title}
          {duration && ` · ${duration}`}
        </GlanceText>
        <ol>
          {shown.map((s) => (
            <li key={s.id} className={cx('nhis-eva-step', `is-${s.state}`)}>
              <Glyph name={`step-${s.state}` as GlyphName} size={18} />
              <GlanceText level={s.state === 'current' ? 'primary' : 'secondary'}>{s.title}</GlanceText>
            </li>
          ))}
        </ol>
      </div>
    </Anchored>
  );
}

/* ------------------------------------------------------------------ */
/* BearingIndicator — scene-linked marker or edge-anchored fallback    */
/* with numeric distance, kept away from corners (B9–B11).             */
/* ------------------------------------------------------------------ */
export interface BearingIndicatorProps {
  label: string;
  /** Relative bearing in degrees (0 = straight ahead, + = right). */
  bearingDeg: number;
  distanceM: number;
  /** World registration available. Baseline Joint AR display is unregistered. */
  registered: boolean;
}

export function BearingIndicator({ label, bearingDeg, distanceM, registered }: BearingIndicatorProps) {
  const { widthDeg, heightDeg } = useVisor();
  const half = widthDeg / 2;
  const dist = distanceM >= 1000 ? `${formatNumber(distanceM / 1000, { decimals: 1 })} km` : `${formatNumber(distanceM)} m`;
  const inView = Math.abs(bearingDeg) < half - 1;
  if (registered && inView) {
    // World-locked marker on the horizon: small, sparse, no corridor (B10).
    return (
      <Anchored x={bearingDeg} y={0.6} valign="bottom">
        <div className="nhis-eva-marker">
          <GlanceText level="moving">
            {label} · {dist}
          </GlanceText>
          <span className="nhis-eva-marker__stem" />
        </div>
      </Anchored>
    );
  }
  // Edge-anchored fallback: left or right edge, vertically away from corners.
  const right = bearingDeg > 0;
  const yDeg = Math.max(-heightDeg / 2 + 2.5, Math.min(heightDeg / 2 - 2.5, SLOT.bearing));
  return (
    <Anchored x={right ? half - 0.4 : -half + 0.4} y={yDeg} align={right ? 'right' : 'left'}>
      <div className={cx('nhis-eva-plate nhis-eva-bearing', right ? 'is-right' : 'is-left')}>
        <span className="nhis-eva-bearing__arrow" aria-hidden="true" />
        <GlanceText level="moving">
          {label} {formatNumber(Math.abs(bearingDeg))}° {right ? 'R' : 'L'} · {dist}
        </GlanceText>
      </div>
    </Anchored>
  );
}

/* ------------------------------------------------------------------ */
/* WristControlSim — physical fallback: 2 pushbuttons + 1 dial (B29,   */
/* B32). Every function is reachable by voice AND this control.        */
/* ------------------------------------------------------------------ */
export interface WristControlSimProps {
  onA: () => void;
  onB: () => void;
  onDial: (dir: -1 | 1) => void;
  labels: { a: string; b: string; dial: string };
}

export function WristControlSim({ onA, onB, onDial, labels }: WristControlSimProps) {
  return (
    <div className="nhis-wrist" role="group" aria-label="Simulated wrist control (2 buttons, 1 dial)">
      <span className="nhis-wrist__title">Wrist control (simulated)</span>
      <button type="button" className="nhis-wrist__btn nhis-focus-ring" onClick={onA}>
        A <span>{labels.a}</span>
      </button>
      <button type="button" className="nhis-wrist__btn nhis-focus-ring" onClick={onB}>
        B <span>{labels.b}</span>
      </button>
      <span className="nhis-wrist__dial">
        <button type="button" className="nhis-wrist__dial-btn nhis-focus-ring" aria-label={`Dial left: ${labels.dial}`} onClick={() => onDial(-1)}>
          ◀
        </button>
        <span>Dial · {labels.dial}</span>
        <button type="button" className="nhis-wrist__dial-btn nhis-focus-ring" aria-label={`Dial right: ${labels.dial}`} onClick={() => onDial(1)}>
          ▶
        </button>
      </span>
    </div>
  );
}
