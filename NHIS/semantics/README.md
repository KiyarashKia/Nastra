# Operational semantics

One model for Station and EVA. Code: `model.ts` (types), `rules.ts` (deterministic rules), `format.ts` (numbers and time).

## States

| State | Meaning | Who sets it |
|---|---|---|
| Nominal | Nothing needs crew attention. Quiet and achromatic. | Assessment layer |
| Advisory | Information for routine awareness. Logged, visible in context. | Health assessment or operational source |
| Caution | Needs attention, not immediate action. Persistent banner, sound. | Health assessment or operational source |
| Warning | Immediate attention under the applicable protocol. The only interruptive health-assessment tier. | Health assessment or operational source |
| Emergency | Reserved operational class. | Only a mission, vehicle, suit or safety system, a validated protocol, or another explicitly authorized operational source |
| Live / delayed / stale / unavailable / unknown | Data freshness and availability. Separate from priority. | Stream policy (`FreshnessPolicy`) |
| Measured / estimated / manual entry | How a value was obtained. | Data source |
| Live / historical / paused | How data is presented. Paused never looks current. | View |
| Evidence categories | Measured, derived, retrieved, AI assessment, recommended action. | AI and analysis layers |
| Confidence | High, medium, low, each with a meaning and a next action defined by the generating system. Never a percentage. | AI layer |
| AI state | idle, listening, processing, responding, uncertain, out-of-scope, missing-evidence, escalated, unavailable. | AI layer |
| Protocol and step state | not-started, active, paused, completed, failed; pending, current, completed, paused, failed, blocked. | Protocol engine |
| Operating mode | live, simulation, training, what-if. | System |
| Actor | crew, nastra, ground, system: who performs a task. | Protocol engine |
| Escalation | draft, sending, sent, received, answered, failed. | Comms |
| Link | connected, degraded, disconnected, unknown. | Comms |
| Acknowledgement | unacknowledged, acknowledged. Not resolution. | Crew |
| Annunciation | annunciating, silenced, suppressed, inhibited. Keeps the class and the record. | Crew |
| Voice (EVA) | off, listening, recognizing, read-back, executed, not-understood, unavailable. | Voice system |
| Coarse status (EVA) | in-range, trending, out-of-range. | Assessment layer |
| Declutter (EVA) | full, minimal. | Crew |

These dimensions never merge: Warning is not invalid, stale is not disabled, low confidence is not Caution.

## Rules

- `validateAlert` rejects: Emergency from health assessment; Emergency without an approved authorization naming its source; an authorization on a non-Emergency; Caution, Warning or Emergency without a protocol link; a record without source or timestamp.
- `acknowledge` and `setAnnunciation` never change the class or the active state.
- `reclassify` requires an applicable operational authority. AI confidence, historical similarity and inferred severity are not accepted.
- `ALERT_TREATMENT` resolves label, IEC-style marker, glyph, interrupt mode, audio and flashing from the class.
- `evaluateFreshness` needs a per-stream policy. It returns `unavailable` when there is no sample and `unknown` when the time cannot be read.

## How an alert moves

1. The health-assessment layer proposes Advisory, Caution or Warning from approved, deterministic logic.
2. An operational source may assert Emergency with an authorization.
3. The crew acknowledges (stops repeat annunciation and flashing), suppresses (sound and lights off, text kept, logged) or inhibits (listed in the audit view).
4. The condition clears only when its source says so. Acknowledgement never clears it.
5. A class changes only through `reclassify` with authority. Nothing promotes or demotes it silently, including Station/EVA handoff or a lost link.

Tests: `tests/semantics.test.ts`.
