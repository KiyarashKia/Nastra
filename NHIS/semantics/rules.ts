/**
 * NHIS semantic rules — deterministic, no generative AI in the path.
 * 03 §19: "Critical alert behavior must not depend on the LLM."
 */
import {
  EMERGENCY_AUTHORITY_KINDS,
  type AnnunciationState,
  type DataQuality,
  type EmergencyAuthorization,
  type EmergencyAuthorityKind,
  type FreshnessPolicy,
  type OperationalAlert,
  type OperationalPriority,
} from './model';

export class NHISSemanticError extends Error {
  constructor(
    message: string,
    readonly rule: string,
  ) {
    super(`[NHIS ${rule}] ${message}`);
    this.name = 'NHISSemanticError';
  }
}

export function isEmergencyAuthorityKind(kind: unknown): kind is EmergencyAuthorityKind {
  return typeof kind === 'string' && (EMERGENCY_AUTHORITY_KINDS as readonly string[]).includes(kind);
}

/**
 * Validates an alert against the NHIS operational alert model.
 * Returns a list of violations; an empty list means the alert may be displayed.
 */
export function validateAlert(alert: OperationalAlert): string[] {
  const problems: string[] = [];

  if (alert.priority === 'emergency') {
    if (alert.origin.kind === 'health-assessment') {
      problems.push(
        'Emergency cannot originate from health-assessment or AI logic (NHIS operational alert model).',
      );
    }
    if (!alert.authorization) {
      problems.push('Emergency requires an authorization from an approved operational source.');
    } else if (!isEmergencyAuthorityKind(alert.authorization.kind)) {
      problems.push(`"${String(alert.authorization.kind)}" is not an approved Emergency authority.`);
    } else if (!alert.authorization.sourceId || !alert.authorization.sourceName) {
      problems.push('Emergency authorization must name its asserting source.');
    }
  } else if (alert.authorization) {
    problems.push('Only Emergency carries an Emergency authorization.');
  }

  if (alert.priority !== 'advisory' && !alert.protocol) {
    problems.push('Emergency, Warning and Caution must link to their protocol (NHIS A6).');
  }
  if (!alert.source) problems.push('Every alert record names its source system (NHIS A6).');
  if (!alert.timestamp?.iso) problems.push('Every alert record has a timestamp (NHIS A6).');
  return problems;
}

/** Throws when an alert violates the model. Components call this before rendering. */
export function assertValidAlert(alert: OperationalAlert): void {
  const problems = validateAlert(alert);
  if (problems.length > 0) throw new NHISSemanticError(problems.join(' '), 'alert-model');
}

/** Acknowledge: stops flashing and repeat annunciation. Never changes class or resolves the condition. */
export function acknowledge(alert: OperationalAlert): OperationalAlert {
  return { ...alert, acknowledgement: 'acknowledged' };
}

/** Annunciation controls keep the class and the record. NHIS A5. */
export function setAnnunciation(alert: OperationalAlert, state: AnnunciationState): OperationalAlert {
  return { ...alert, annunciation: state };
}

export interface ReclassificationAuthority {
  kind: EmergencyAuthorityKind;
  sourceId: string;
  sourceName: string;
}

/**
 * Changes an alert's class. Requires an applicable operational authority;
 * AI confidence, historical similarity or inferred severity are not accepted.
 * NHIS operational alert model: "class changes require the applicable operational authority".
 */
export function reclassify(
  alert: OperationalAlert,
  to: OperationalPriority,
  authority: ReclassificationAuthority,
  authorization?: EmergencyAuthorization,
): OperationalAlert {
  if (!authority || !isEmergencyAuthorityKind(authority.kind)) {
    throw new NHISSemanticError(
      'Alert class can only change through an applicable operational authority.',
      'alert-model',
    );
  }
  const next: OperationalAlert = {
    ...alert,
    priority: to,
    authorization: to === 'emergency' ? authorization : undefined,
    origin: { kind: authority.kind, sourceId: authority.sourceId },
  };
  assertValidAlert(next);
  return next;
}

/* ------------------------------------------------------------------ */
/* Treatment                                                           */
/* ------------------------------------------------------------------ */

export type AlertGlyphName = 'advisory' | 'caution' | 'warning' | 'emergency';

/**
 * How each class interrupts on Station. NHIS A3:
 * Advisory logs, Caution is a persistent in-context banner, Warning is the
 * single interruptive health-assessment tier, Emergency uses the separate
 * critical overlay and is never blocked by the A3 rule.
 */
export type InterruptMode = 'log' | 'banner' | 'modal' | 'critical-overlay';

export interface AlertTreatment {
  label: string;
  /** IEC 60601-1-8 style redundant marker (NHIS A2; mapping is an NHIS design decision). */
  marker: string;
  glyph: AlertGlyphName;
  interrupt: InterruptMode;
  /** Visual + audio required for Emergency, Warning, Caution (NHIS A4, B4). */
  audio: boolean;
  /** Flashing only for events needing immediate attention, until acknowledged (NHIS A27, B28). */
  flash: 'none' | 'nontext-high';
  /** Token prefix the component reads, e.g. `--nhis-color-status-warning-*`. */
  tokenKey: OperationalPriority;
}

export const ALERT_TREATMENT: Readonly<Record<OperationalPriority, AlertTreatment>> = {
  advisory: {
    label: 'Advisory',
    marker: '!',
    glyph: 'advisory',
    interrupt: 'log',
    audio: false,
    flash: 'none',
    tokenKey: 'advisory',
  },
  caution: {
    label: 'Caution',
    marker: '!!',
    glyph: 'caution',
    interrupt: 'banner',
    audio: true,
    flash: 'none',
    tokenKey: 'caution',
  },
  warning: {
    label: 'Warning',
    marker: '!!!',
    glyph: 'warning',
    interrupt: 'modal',
    audio: true,
    flash: 'nontext-high',
    tokenKey: 'warning',
  },
  emergency: {
    label: 'Emergency',
    marker: '!!!',
    glyph: 'emergency',
    interrupt: 'critical-overlay',
    audio: true,
    flash: 'nontext-high',
    tokenKey: 'emergency',
  },
};

export function treatmentFor(priority: OperationalPriority): AlertTreatment {
  return ALERT_TREATMENT[priority];
}

/** Highest-priority active alert, used for "annunciate highest until acknowledged" (NHIS A4). */
export function highestPriority(alerts: readonly OperationalAlert[]): OperationalAlert | undefined {
  const order: Record<OperationalPriority, number> = { advisory: 0, caution: 1, warning: 2, emergency: 3 };
  return [...alerts]
    .filter((a) => a.active)
    .sort((a, b) => order[b.priority] - order[a.priority] || Date.parse(b.timestamp.iso) - Date.parse(a.timestamp.iso))[0];
}

/** Always-visible counts. NHIS A6. */
export function alertCounts(alerts: readonly OperationalAlert[]) {
  const active = alerts.filter((a) => a.active);
  return {
    active: active.length,
    unacknowledged: active.filter((a) => a.acknowledgement === 'unacknowledged').length,
    inhibited: alerts.filter((a) => a.annunciation === 'inhibited').length,
  };
}

/* ------------------------------------------------------------------ */
/* Freshness                                                           */
/* ------------------------------------------------------------------ */

/**
 * Evaluates freshness from a stream-specific policy. Returns `unknown` when
 * the sample time cannot be read: a missing value is never zero or nominal.
 */
export function evaluateFreshness(
  sampleIso: string | undefined,
  nowMs: number,
  policy: FreshnessPolicy,
): { quality: DataQuality; ageMs?: number } {
  if (!sampleIso) return { quality: 'unavailable' };
  const t = Date.parse(sampleIso);
  if (Number.isNaN(t)) return { quality: 'unknown' };
  const ageMs = Math.max(0, nowMs - t);
  if (ageMs >= policy.staleAfterMs) return { quality: 'stale', ageMs };
  if (ageMs >= policy.delayedAfterMs) return { quality: 'delayed', ageMs };
  return { quality: 'live', ageMs };
}
