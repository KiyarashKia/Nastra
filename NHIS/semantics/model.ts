/**
 * NHIS shared semantic model.
 *
 * One vocabulary for NASTRA Station and NASTRA EVA. Presentation differs by
 * surface; meaning does not. Every type here is surface-agnostic.
 *
 * Provenance: NHIS operational alert model; NHIS A1–A7, A9, A11–A13, A33;
 * B7, B13, B15, B30, B33; 02_NASTRA_INTERFACE_CONTEXT.md §5, §7.
 * See semantics/README.md for the rules and governance/provenance.md for sources.
 */

/* ------------------------------------------------------------------ */
/* Alert classes                                                       */
/* ------------------------------------------------------------------ */

/** Tiers NASTRA health-assessment logic may assign. NHIS A1. */
export type HealthAssessmentPriority = 'advisory' | 'caution' | 'warning';

/**
 * Every operational class NHIS can display. `emergency` is a separate,
 * reserved class: it is only entered when an approved operational source
 * asserts or authorizes it. NHIS operational alert model.
 */
export type OperationalPriority = HealthAssessmentPriority | 'emergency';

/** Overall status of a surface, metric or summary. `nominal` is quiet, not green. */
export type StatusLevel = 'nominal' | OperationalPriority;

/** Ordered lowest → highest. Used for sorting only, never for silent promotion. */
export const PRIORITY_ORDER: readonly OperationalPriority[] = [
  'advisory',
  'caution',
  'warning',
  'emergency',
] as const;

/**
 * Sources allowed to assert or authorize Emergency.
 * NHIS operational alert model: mission, vehicle, suit, safety systems,
 * validated protocols, or another explicitly authorized operational source.
 * There is intentionally no AI / model / health-assessment member.
 */
export type EmergencyAuthorityKind =
  | 'mission-system'
  | 'vehicle-system'
  | 'suit-system'
  | 'safety-system'
  | 'validated-protocol'
  | 'authorized-operational-source';

export const EMERGENCY_AUTHORITY_KINDS: readonly EmergencyAuthorityKind[] = [
  'mission-system',
  'vehicle-system',
  'suit-system',
  'safety-system',
  'validated-protocol',
  'authorized-operational-source',
] as const;

export interface EmergencyAuthorization {
  kind: EmergencyAuthorityKind;
  /** Stable identifier of the asserting system or protocol. */
  sourceId: string;
  /** Human-readable name shown with the alert, e.g. "Cabin atmosphere monitor". */
  sourceName: string;
  /** When the source asserted or authorized the Emergency. */
  assertedAt: Timestamp;
  /** Procedure or authorization reference, when the source provides one. */
  reference?: string;
}

/** Where an alert came from. Health assessments can never carry an Emergency. */
export type AlertOrigin =
  | { kind: 'health-assessment'; engine: string }
  | { kind: EmergencyAuthorityKind; sourceId: string };

/** Acknowledgement is not resolution. NHIS A5, B7, B30. */
export type AcknowledgementState = 'unacknowledged' | 'acknowledged';

/**
 * Annunciation control state. NASA App. F F.6.4 / NHIS A5:
 * - silenced: audio off for this alert; visual retained
 * - suppressed: sound and lights off, text retained, event logged
 * - inhibited: alert evaluation inhibited; listed in the audit view
 */
export type AnnunciationState = 'annunciating' | 'silenced' | 'suppressed' | 'inhibited';

export interface ProtocolLink {
  id: string;
  title: string;
}

export interface OperationalAlert {
  id: string;
  priority: OperationalPriority;
  title: string;
  /** Source system shown in the record, e.g. "Health telemetry". NHIS A6. */
  source: string;
  origin: AlertOrigin;
  timestamp: Timestamp;
  /** Condition still present. Independent of acknowledgement. */
  active: boolean;
  acknowledgement: AcknowledgementState;
  annunciation: AnnunciationState;
  /** Required for Emergency, Warning and Caution (NHIS A6). */
  protocol?: ProtocolLink;
  /** Required when priority is `emergency`. */
  authorization?: EmergencyAuthorization;
  /** Optional detail text. Keep the title readable on its own. */
  detail?: string;
}

/* ------------------------------------------------------------------ */
/* Data quality                                                        */
/* ------------------------------------------------------------------ */

/**
 * Freshness / availability. Separate from alert priority (03 §15, §20).
 * NASA-STD-3001 V2 10020; NHIS A7, B33.
 */
export type DataQuality = 'live' | 'delayed' | 'stale' | 'unavailable' | 'unknown';

/** How a value was obtained. Independent of freshness. NISTIR 7804 via NHIS. */
export type DataOrigin = 'measured' | 'estimated' | 'manual-entry';

/** Live presentation, historical review, or a paused (frozen, as-of) view. NHIS A25, A31. */
export type DataPresentation = 'live' | 'historical' | 'paused';

/**
 * Per-stream freshness policy. NASA does not set a universal stale timeout
 * (NASA_REFERENCE_USAGE_GUIDE NASA-03): each stream owner must supply one.
 */
export interface FreshnessPolicy {
  /** ms after the last sample before the value is shown as delayed. */
  delayedAfterMs: number;
  /** ms after the last sample before the value is shown as stale. */
  staleAfterMs: number;
  /** Who owns this policy, e.g. "NASTRA health telemetry team". */
  owner: string;
  rationale: string;
}

/* ------------------------------------------------------------------ */
/* AI and evidence                                                     */
/* ------------------------------------------------------------------ */

/** Must never collapse into one undifferentiated "AI answer". 02 §7. */
export type EvidenceCategory =
  | 'measured'
  | 'derived'
  | 'retrieved'
  | 'ai-assessment'
  | 'recommended-action';

/** Categorical only. No bare percentages. NHIS A12. */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * The generating system defines what each level means and what to do next.
 * NHIS does not invent clinical meaning for confidence (00 §22).
 */
export interface Confidence {
  level: ConfidenceLevel;
  meaning: string;
  nextAction: string;
}

export type AIState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'responding'
  | 'uncertain'
  | 'out-of-scope'
  | 'missing-evidence'
  | 'escalated'
  | 'unavailable';

/* ------------------------------------------------------------------ */
/* Protocols, modes, automation, escalation, link, voice              */
/* ------------------------------------------------------------------ */

export type ProtocolStepState = 'pending' | 'current' | 'completed' | 'paused' | 'failed' | 'blocked';
export type ProtocolState = 'not-started' | 'active' | 'paused' | 'completed' | 'failed';

/** Simulation, training and what-if must never look like live. NHIS A9; NASA App. F F.4.1. */
export type OperatingMode = 'live' | 'simulation' | 'training' | 'what-if';

/** Who is performing a task. NASA App. F F.6.2. */
export type Actor = 'crew' | 'nastra' | 'ground' | 'system';

/** Asynchronous flight-surgeon escalation. NHIS A18. */
export type EscalationState = 'draft' | 'sending' | 'sent' | 'received' | 'answered' | 'failed';

export type LinkState = 'connected' | 'degraded' | 'disconnected' | 'unknown';

/** EVA voice grammar. NHIS B30; 03 §17. */
export type VoiceState =
  | 'off'
  | 'listening'
  | 'recognizing'
  | 'read-back'
  | 'executed'
  | 'not-understood'
  | 'unavailable';

/** EVA coarse status coding. NHIS B15. */
export type CoarseStatus = 'in-range' | 'trending' | 'out-of-range';

/** EVA declutter. At least two levels. NHIS B14. */
export type DeclutterLevel = 'full' | 'minimal';

/* ------------------------------------------------------------------ */
/* Time                                                                */
/* ------------------------------------------------------------------ */

/** 24-hour times always carry their time system. NHIS A23. */
export type TimeSystem = 'UTC' | 'GMT' | 'MET' | 'local';

export interface Timestamp {
  /** ISO 8601 instant. */
  iso: string;
  /** Time system the crew reads it in. */
  system: TimeSystem;
  /** Mission start, required to render MET. ISO 8601. */
  missionEpochIso?: string;
}
