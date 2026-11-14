# Components

Compact reference. Every component takes meaning (priority, quality, state), never colour. Stories show every state listed. Provenance: `governance/provenance.md`.

## Shared

### NHISProvider
Purpose: root wrapper; applies tokens and the theme, collects annunciation events, offers one-action silence. Surfaces: both. Props: `onAnnunciation`, `review` ("grayscale" validation mode). Do: wire `onAnnunciation` to the approved audio system. Do not: render NHIS components outside it.

### PriorityBadge, StatusMark
Purpose: show an alert class with label, glyph and marker. States: advisory, caution, warning, emergency (+ nominal for `StatusMark`), flashing. Rules: A1, A2. Do not: use for anything that is not an alert class.

### DataQualityTag, Measurement
Purpose: print a value with its unit and its freshness and origin. States: live, delayed, stale, unavailable, unknown; measured, estimated, manual entry; paused. Content: fixed decimals per stream; "—" when missing; "≈" when estimated. Rules: A7, A23, B33. Do not: grey out stale values or print zero for missing data.

### EvidenceTag, ConfidenceTag
Purpose: name the evidence category and the categorical confidence. Rules: 02 §7, A12. Do not: show percentages.

### ModeIndicator, LinkIndicator, Time
Purpose: operating mode, link state with delay, and 24-hour time with its time system. Rules: A9, A18, A23, B8.

### Glyph
Purpose: the NHIS glyph set. Rule: glyphs reinforce labels; they never carry safety meaning alone.

## Station (React Aria underneath)

### Button
Variants: primary, secondary, quiet; default (44 px) and compact (32 px); icon-only with `aria-label`. States: hover, pressed, focus-visible, disabled, pending. Do not: colour a button red, yellow or blue.

### HazardousAction
Purpose: critical, hazardous or irreversible commands. Anatomy: striped button → alert dialog with consequence; Cancel focused first. Rule: A10.

### TextField, ChoiceGroup, Checkbox, Select, Tabs, Disclosure, Tooltip, Panel
Standard controls with NHIS styling. Invalid uses a dashed border, icon and text, never alert colour (03 §15). `ChoiceGroup presentation="chips"` is the quick-reply pattern (A15) and the drag-free scale (A30). Tooltips are supplementary only.

### AlertBanner
Purpose: Advisory (logged) and Caution (persistent, non-modal, sound). Anatomy: badge, title, detail, source, time, state, protocol action, acknowledge, suppress. States: unacknowledged, acknowledged, cleared, suppressed. Rejects Warning and Emergency (wrong presentation). Rules: A3, A5, A6.

### WarningDialog
Purpose: the one interruptive health-assessment tier. Anatomy: flashing badge until acknowledged, title, observations, record fields, Acknowledge, Open protocol. Behaviour: not dismissable by Escape or outside click. Rules: A3, A4, A27.

### EmergencyAnnunciator
Purpose: show an Emergency asserted by an approved operational source. Anatomy: critical overlay above every layer, double ring, "Emergency" badge, asserting source and time first, procedure, acknowledge, a note that acknowledging does not clear it. Invalid input is shown as a rejected integration error. Rule: operational alert model.

### AlertList, AlertCounts
Purpose: alert history and management. Views: active, not acknowledged, inhibited (audit), all. Actions: protocol, acknowledge, suppress, inhibit (not for Emergency, U-11), silence all audio. Rules: A5, A6.

### MissionHeader, StationFrame
Purpose: persistent identity, mode, clocks, link, alert counts and the escalation control in a fixed position; violet frame when not live. Rules: A6, A9, A18, A23.

### VitalTile
Purpose: one vital at a glance. Anatomy: label, status mark (by exception), value + unit, signed delta from baseline, sparkline with baseline band, baseline range, trend wording, quality tag, inspect. States: nominal, advisory, caution, warning, stale, unavailable, unknown, estimated, manual entry, no baseline. Rules: A7, A24.

### TelemetryReadout, DataGapNotice
Compact label/value/unit row with status and quality; a notice that names missing data and what it means for the assessment. Rules: A7, A11, A13.

### AIAssessment, EvidencePanel, PatternCard, AIDisclosure
Purpose: inspectable AI. Anatomy: observations first; optional own-report gate; dashed assessment block with confidence, meaning and next action; alternatives when low; protocol-backed action; one-step evidence; persistent disclosure; dismiss and "this is wrong". States: high, medium, low confidence; uncertain; out of scope; gated. `PatternCard` always states that causation is not established and that past patterns never make a current alert safe. Rules: A11 to A17, 02 §8.

### Conversation, SymptomIntake, CheckIn, ExtractionReview
Conversation keeps the start of each new response in view, offers suggested replies, shows progress with Stop, and states when AI is unavailable. SymptomIntake and ExtractionReview require a confirmed read-back before anything is used or saved. CheckIn is for sensitive self-report: no scores, streaks or colour. Rules: A15, A29, A32.

### ProtocolStepper, EscalationStatus, ImageInput
Step states with who performs each step and a persistent done state; asynchronous escalation with sent, received and answered; image input with a button alternative to drag. Rules: A18, A30, A33.

## EVA (design-system simulations, not flight hardware)

### EVAVisorSim
Simulated see-through display in visual-angle units. Options: lighting (grazing, up-sun, shadow), rendering (colour, monochrome green), declutter (full, minimal), optics (additive, opaque plate), review guides. Not a hardware model.

### EVAStatusStrip
Body-locked status in the lower-left band. Coarse states; numbers on exception or recall; lowlighted when nominal; hidden in minimal declutter unless off-nominal; link state and data age; dwell reveals one row. Rules: B3, B8, B13 to B15, B31, B33.

### ConsumableReadout
Limiting consumable time against walk-back time, with the estimate's source. Rule: B12.

### EVAAlertCue
Advisory and Caution in the upper-right band. Warning and Emergency as an outline ring at the clear-zone edge plus a chip within ±15°, red only behind white text, flashing until acknowledged, acknowledgement hint. Emergency shows its asserting source. Rules: B4 to B7, B22, B28.

### VoiceCue, NASTRAResponseCue
Voice grammar: listening, recognizing, read-back, executed, not understood, unavailable (with wrist fallback). AI cue: short, auto-hides, dismissible; out-of-scope and AI-offline states. Rules: B16, B30.

### ProtocolStepCue, BearingIndicator, WristControlSim
At most four steps with only the current at full intensity; world-locked marker when registered, edge indicator with distance when not; two buttons and a dial covering every function. Rules: B9 to B11, B17, B29, B32.
