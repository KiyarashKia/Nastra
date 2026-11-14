# Compliance matrix

How NHIS answers each checklist rule in `01_NHIS_OPERATIONAL_UX_STANDARDS.md`.

Status:
- Implemented: built into tokens or components and visible in Storybook.
- Host: the design system provides the hook or slot; the product must supply data or wiring.
- Needs test: implemented as a starting value; verification needs hardware or representative users.
- Out of DS scope: a product or process requirement, not a design-system one.

Implemented does not mean operationally validated (00 §17).

## Checklist A: Station

| # | Rule (short) | NHIS answer | Status |
|---|---|---|---|
| A1 | A/C/W blue/yellow/red; Emergency separate; red/yellow reserved | `color.status.*`, `validateAlert`, achromatic UI | Implemented |
| A2 | Second cue for every colour; passes grayscale | Label + glyph + marker; Storybook grayscale review | Implemented |
| A3 | Only Warning interrupts; Caution banner; Advisory logged | `WarningDialog`, `AlertBanner`, Advisory log; Emergency separate | Implemented |
| A4 | Visual + audio; highest until acknowledged; pre-alert −10 dB | `useAnnunciation` events with `preAlert`; tones from host | Host |
| A5 | Acknowledge, suppress, inhibit; audit; one-action silence | `AlertList`, `silenceAll` | Implemented |
| A6 | Record fields, protocol link, counts visible | `AlertMeta`, `AlertCounts`, validation requires protocol | Implemented |
| A7 | Stale/missing/unknown + age on every tile | `DataQualityTag`, `Measurement`, `VitalTile` | Implemented |
| A8 | Baseline-relative limits with persistence | Baseline band + signed delta shown; limit logic belongs to the assessment layer | Host |
| A9 | Simulation distinct; identity fixed | `ModeIndicator`, `StationFrame`, `MissionHeader` | Implemented |
| A10 | Hazardous commands: confirm + striping; undo elsewhere | `HazardousAction`; undo is product logic | Implemented / Host |
| A11 | Observations first; evidence in one step; gaps named | `AIAssessment`, `EvidencePanel` | Implemented |
| A12 | Categorical confidence with meaning and action; alternatives when low | `ConfidenceTag`, `alternatives` | Implemented |
| A13 | Says when beyond capability | `state="out-of-scope"`, `DataGapNotice` | Implemented |
| A14 | Own report before AI on Warning tier | `requireSelfReport` | Implemented |
| A15 | Chips + free text + confirmed read-back | `SymptomIntake`, `ExtractionReview` | Implemented |
| A16 | Persistent AI disclosure; no anthropomorphism | `AIDisclosure`, "NASTRA (AI)" | Implemented (wording U-12) |
| A17 | One-step dismiss and correction | `onDismiss`, `onCorrect` | Implemented |
| A18 | Escalation in same position; sent/received/answered | Header button; `EscalationStatus` | Implemented |
| A19 | Text contrast: WCAG floor, NASA 6:1, toward 10:1 | 82/82 pairs pass; text ≥ 6:1, primary ≥ 14:1 | Implemented |
| A20 | 3:1 non-text | Strokes, focus, chart lines, control borders checked | Implemented |
| A21 | 0.25° / 0.4°; 12 pt; 9 pt floor | 16 px labels, 14 px floor | Needs test (U-08) |
| A22 | Sans, mixed case, fixed-width numerics, l/1 O/0 distinct | Atkinson Next + Mono | Implemented |
| A23 | Units, leading zero, minus, aligned decimals, 24 h + time system | `semantics/format.ts` (tested) | Implemented |
| A24 | Tile: value+unit, sparkline, baseline band, signed delta; no radial gauges | `VitalTile`, `BulletGraph` | Implemented |
| A25 | Live vs historical; out of range = colour + limit line | `TrendChart` | Implemented |
| A26 | One-screen overview; no horizontal scroll; ≤ 4 menu levels | Overview composition at 1280 × 800 | Implemented (composition) |
| A27 | Flashing only for immediate attention, stoppable, ≤ 3 Hz | `flash.*`; glyph only; stops on ack | Implemented (U-10) |
| A28 | ≤ 6 coding colours; avoid red on black, yellow on white | 4 colours; red never text | Implemented |
| A29 | Feedback times; > 10 s shows progress and can stop | `feedback` 100 ms; `Conversation progress` + Stop | Implemented / Host |
| A30 | 24 px pointer; 44 px touch; drag alternatives | 44/32 px controls; `ImageInput` button | Implemented |
| A31 | Focus not hidden; pause updates; 200% text | `scroll-padding-top`; `pausedAt`; rem-free px tokens scale with browser zoom | Implemented / Needs test |
| A32 | Chat stays at start of new response | `Conversation` | Implemented |
| A33 | Persistent done state per step | `ProtocolStepper` | Implemented |
| A34 | Medical data protected | Transport and storage | Out of DS scope |
| A35 | Priority readable at 4 m, condition at 1 m | Large badge + glyph; distance test not run | Needs test |
| A36 | 3-second glance test | Overview built for it | Needs test (U-17) |
| A37 | NMSUS, Bedford, expert review | Process | Needs test (U-17) |

## Checklist B: EVA (simulation)

| # | Rule (short) | NHIS answer | Status |
|---|---|---|---|
| B1 | Clear forward view | Clear-zone token; anchors limited to lateral bands | Needs test |
| B2 | Unbriefed-hazard trial | Not run | Needs test |
| B3 | Suit P, ppO2, ppCO2 shown and alerted; metabolic rate | Required items in `EVAStatusStrip`; limits from suit system | Host |
| B4 | Sound + visor for every alert | `useAnnunciation` in `EVAAlertCue` | Host |
| B5 | Readable without colour | Monochrome-green rendering; shape, outline, position | Implemented (U-16) |
| B6 | Warning outline near line of sight; size minimums | Ring + chip within ±15°; chip ≥ 1° and ≥ 2 sq° | Implemented |
| B7 | One-action acknowledge; recall list | Button A / "Acknowledge"; recall list is product logic | Implemented / Host |
| B8 | Suit-generated alarms; link state and data age | Link + age in strip | Implemented / Host |
| B9 | World-locked nav; body-locked status; no head-locked centre | Strip body-locked; marker requires registration | Implemented (U-07) |
| B10 | No corridor graphics | Sparse marker only | Implemented |
| B11 | Edge indicator with distance, away from corners | `BearingIndicator` fallback | Implemented |
| B12 | Limiting consumable vs walk-back | `ConsumableReadout` | Implemented |
| B13 | Vitals by exception; one-action recall | Lowlight / hidden; `recalled` | Implemented |
| B14 | Two declutter levels; lowlight not remove | `full` / `minimal`; lowlight 0.55 | Implemented (U-06) |
| B15 | Coarse status | `in-range` / `trending` / `out-of-range` | Implemented |
| B16 | Short, brief, dismissible AI; capability statement | `NASTRAResponseCue` | Implemented |
| B17 | ≤ 4 steps; current at full intensity | `ProtocolStepCue` | Implemented |
| B18 | 2 s glance; 12 s cumulative | Not measured | Needs test |
| B19 | Map on demand; no video | No persistent map component | Implemented (by omission) |
| B20 | Text in visual angle | 0.7° / 0.5° | Implemented (U-06) |
| B21 | Medium or bold only | 500 / 700 | Implemented |
| B22 | White or green text; red only as fill | `eva.css` | Implemented |
| B23 | Plates in periphery only; no darkening assumed | Additive optics model | Implemented |
| B24 | Auto luminance; lighting tests | Lighting presets for review only | Needs test (U-05) |
| B25 | Persistent status lateral/lower-lateral; glance-only above horizon | Slot layout | Implemented (U-07) |
| B26 | Fixed focal distance | Hardware | Out of DS scope |
| B27 | No 0.2 Hz oscillation; 60 fps | No ambient motion | Implemented |
| B28 | Flashing only for immediate attention; stoppable | Glyph flash until ack | Implemented |
| B29 | Two modalities per function | Voice + `WristControlSim` | Implemented (simulated) |
| B30 | Fixed voice grammar; read-back except acknowledge | `VoiceCue` states | Implemented (simulated) |
| B31 | Gaze reveals, never commits | Dwell reveal on hover | Implemented (simulated) |
| B32 | Few large buttons and one dial | `WristControlSim` | Implemented (simulated) |
| B33 | Stale or missing state on every value | Strip rows, consumable | Implemented |
| B34 | Workload verified suited | Not run | Needs test |
