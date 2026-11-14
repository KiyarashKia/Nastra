import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { tokenValues } from '../../tokens/types/tokens';
import { treatmentFor } from '../../semantics/rules';
import type { OperationalAlert, OperationalPriority } from '../../semantics/model';
import './base.css';
import './shared.css';

/* ------------------------------------------------------------------ */
/* Annunciation (audio hook)                                           */
/* NHIS supplies the event vocabulary, not the sound. The host wires   */
/* `onAnnunciation` to the approved audio system (NHIS A4, B4).        */
/* ------------------------------------------------------------------ */

export interface AnnunciationEvent {
  type: 'start' | 'stop';
  alertId: string;
  priority: OperationalPriority;
  /** Identifier from tokens `audio.annunciation.*`. */
  audioId: string;
  /** First sounding is a pre-alert 10 dB below the final level (NHIS A4). */
  preAlert: boolean;
  reason?: 'acknowledged' | 'silenced' | 'suppressed' | 'inhibited' | 'inactive' | 'silence-all' | 'unmounted';
}

interface AnnunciationContextValue {
  register: (alert: OperationalAlert) => void;
  unregister: (alertId: string, reason: AnnunciationEvent['reason']) => void;
  /** One action silences all audio (NHIS A5). Visual state is retained. */
  silenceAll: () => void;
  silencedAll: boolean;
  active: ReadonlyMap<string, OperationalPriority>;
}

const AnnunciationContext = createContext<AnnunciationContextValue | null>(null);

export function useAnnunciationControls() {
  const ctx = useContext(AnnunciationContext);
  if (!ctx) throw new Error('NHIS components must be rendered inside <NHISProvider>.');
  return ctx;
}

/** Registers an alert's audio while it is active, unacknowledged and annunciating. */
export function useAnnunciation(alert: OperationalAlert) {
  const ctx = useContext(AnnunciationContext);
  const sounding =
    treatmentFor(alert.priority).audio &&
    alert.active &&
    alert.acknowledgement === 'unacknowledged' &&
    alert.annunciation === 'annunciating';
  useEffect(() => {
    if (!ctx) return;
    if (sounding) {
      ctx.register(alert);
      return () => ctx.unregister(alert.id, 'unmounted');
    }
    ctx.unregister(
      alert.id,
      !alert.active
        ? 'inactive'
        : alert.acknowledgement === 'acknowledged'
          ? 'acknowledged'
          : alert.annunciation === 'annunciating'
            ? undefined
            : alert.annunciation,
    );
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sounding, alert.id, alert.priority, alert.active, alert.acknowledgement, alert.annunciation]);
}

/* ------------------------------------------------------------------ */
/* Flash synchronisation                                               */
/* Every flashing element shares one phase: its animation is offset    */
/* by the wall clock, so displays with synced clocks flash together.   */
/* ------------------------------------------------------------------ */
export function flashSyncStyle(kind: 'nontextHigh' | 'textLow' = 'nontextHigh'): CSSProperties {
  const period = tokenValues.flash[kind].periodMs;
  return { ['--nhis-flash-sync' as string]: `-${Date.now() % period}ms` };
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export interface NHISProviderProps {
  children: ReactNode;
  /** Receives annunciation events; wire to the approved audio system. */
  onAnnunciation?: (event: AnnunciationEvent) => void;
  /** Validation tool: renders the subtree in grayscale (NHIS A2). Not a theme. */
  review?: 'none' | 'grayscale';
  className?: string;
  style?: CSSProperties;
}

export function NHISProvider({ children, onAnnunciation, review = 'none', className, style }: NHISProviderProps) {
  const activeRef = useRef(new Map<string, OperationalPriority>());
  const [active, setActive] = useState<ReadonlyMap<string, OperationalPriority>>(() => new Map());
  const [silencedAll, setSilencedAll] = useState(false);
  const sounded = useRef(new Set<string>());
  const cb = useRef(onAnnunciation);
  cb.current = onAnnunciation;
  const publish = () => setActive(new Map(activeRef.current));

  const register = useCallback((alert: OperationalAlert) => {
    if (activeRef.current.get(alert.id) === alert.priority) return;
    activeRef.current.set(alert.id, alert.priority);
    const preAlert = !sounded.current.has(alert.id);
    sounded.current.add(alert.id);
    cb.current?.({
      type: 'start',
      alertId: alert.id,
      priority: alert.priority,
      audioId: tokenValues.audio.annunciation[alert.priority],
      preAlert,
    });
    setSilencedAll(false);
    publish();
  }, []);

  const unregister = useCallback((alertId: string, reason: AnnunciationEvent['reason']) => {
    const priority = activeRef.current.get(alertId);
    if (!priority) return;
    activeRef.current.delete(alertId);
    cb.current?.({
      type: 'stop',
      alertId,
      priority,
      audioId: tokenValues.audio.annunciation[priority],
      preAlert: false,
      reason,
    });
    publish();
  }, []);

  const silenceAll = useCallback(() => {
    activeRef.current.forEach((priority, alertId) =>
      cb.current?.({
        type: 'stop',
        alertId,
        priority,
        audioId: tokenValues.audio.annunciation[priority],
        preAlert: false,
        reason: 'silence-all',
      }),
    );
    activeRef.current.clear();
    setSilencedAll(true);
    publish();
  }, []);

  const value = useMemo(
    () => ({ register, unregister, silenceAll, silencedAll, active }),
    [register, unregister, silenceAll, silencedAll, active],
  );

  return (
    <AnnunciationContext.Provider value={value}>
      <div
        className={['nhis-root', className].filter(Boolean).join(' ')}
        data-nhis-theme="station-dark"
        data-nhis-review={review === 'none' ? undefined : review}
        style={style}
      >
        {children}
      </div>
    </AnnunciationContext.Provider>
  );
}
