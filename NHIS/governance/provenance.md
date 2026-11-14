# Provenance and traceability

Every safety-significant token, component and pattern links to the rule that justifies it. NHIS rule IDs come from `01_NHIS_OPERATIONAL_UX_STANDARDS.md`; their evidence flags (P, S, D, U) are copied unchanged. NASA source IDs come from `References/NASA/NASA_PRIMARY_SOURCES.md`.

Important: the NASA references below are the ones NHIS cites. This build did not re-open the official NASA pages or the Rev F PDF to re-verify wording (see U-03). The evidence flags therefore describe the source pack's research, not a fresh check.

## Format

```yaml
source:
  type: primary | project-standard | derived | design-decision
  ref: "NHIS A7; NASA-STD-3001 V2 10020"
  url: "https://www.nasa.gov/reference/10-0-crew-interfaces-vol-2/"
  note: "Short reason."
```

## Shared semantics

| Item | Implementation | Source | Type | Flag |
|---|---|---|---|---|
| Advisory / Caution / Warning for health assessment; Emergency reserved | `semantics/model.ts`, `semantics/rules.ts` `validateAlert` | NHIS operational alert model; NHIS A1; NASA App. F F.6.4 (NASA-02) | project-standard | P |
| Emergency only from mission, vehicle, suit, safety system or validated protocol | `EMERGENCY_AUTHORITY_KINDS`, `validateAlert`, `reclassify` | NHIS operational alert model | project-standard | project rule |
| No silent promotion or demotion | `acknowledge`, `setAnnunciation` keep class; `reclassify` requires authority | NHIS operational alert model; 03 §19 | project-standard | project rule |
| Second cue for every colour | `PriorityBadge` label + glyph + marker; `StatusMark`; chart markers | NHIS A2; NASA V2 10045 (NASA-03) | project-standard | P |
| Visual + audio for Emergency, Warning, Caution | `useAnnunciation`, `ALERT_TREATMENT.audio` | NHIS A4, B4; NASA V2 10114 | project-standard | P (Table 10.3-1: U) |
| Pre-alert 10 dB below; tones 200 Hz to 4 kHz | `audio.preAlertAttenuationDb`, `audio.toneRangeHz`; `AnnunciationEvent.preAlert` | NHIS A4; NASA V2 10175, 10176 | project-standard | P (U for table) |
| Acknowledge, suppress, inhibit; one-action silence | `AlertList`, `silenceAll` | NHIS A5; NASA App. F F.6.4-09, -11; V2 10177, 10156 | project-standard | P |
| Alert record fields and protocol link; counts always visible | `AlertMeta`, `AlertCounts`, `validateAlert` | NHIS A6; NASA App. F F.6.4-04, -06, -08 | project-standard | P |
| Stale / missing / unknown + age | `DataQualityTag`, `Measurement`, `evaluateFreshness` | NHIS A7, B33; NASA V2 10020; App. F F.4.3.1(c) | project-standard | P |
| Simulation distinct from live; crew identity fixed | `ModeIndicator`, `StationFrame`, `MissionHeader` | NHIS A9; NASA App. F F.4.1; NISTIR 7804 | project-standard | P; identity D |
| Hazardous commands: confirmation + striping | `HazardousAction`, `color.hazard.*` | NHIS A10; NASA V2 10080; App. F F.4.3.2 | project-standard | P |
| Units, leading zero, minus sign, aligned decimals, labelled 24 h time | `semantics/format.ts`, `.nhis-num` | NHIS A23; NASA App. F F.5.6, F.6.1; V2 10046 | project-standard | P |

## Station

| Item | Implementation | Source | Flag |
|---|---|---|---|
| Only Warning interrupts | `WarningDialog` (modal, not dismissable); `AlertBanner` for Caution; Advisory as log | NHIS A3 | D |
| Observations before recommendation; evidence in one step | `AIAssessment` order; `Disclosure` "Inspect evidence"; `EvidencePanel` | NHIS A11; NASA V2 10170 | P |
| Categorical confidence with meaning and next action | `ConfidenceTag`, `Confidence` type | NHIS A12 | P |
| Out-of-scope statement | `AIAssessment state="out-of-scope"` | NHIS A13; NASA V2 10171 | P |
| Own report before AI assessment | `requireSelfReport` | NHIS A14 | D |
| Read-back before assessment | `SymptomIntake` | NHIS A15 | P |
| Persistent AI disclosure, non-anthropomorphic | `AIDisclosure`; role label "NASTRA (AI)" | NHIS A16; App. F F.6.2-05 | P |
| One-step dismiss and correction | `onDismiss`, `onCorrect` | NHIS A17; V2 10169, 10165 | P |
| Escalation in the same position, sent/received/answered | `MissionHeader` escalation, `EscalationStatus` | NHIS A18 | D |
| Contrast targets | `scripts/check-contrast.mjs`, `validation/contrast-report.md` | NHIS A19, A20; WCAG 1.4.3, 1.4.11; App. F F.5.10 | P |
| Type size, family, case | `type.*` tokens | NHIS A21, A22 | P |
| Vital tile: value, sparkline, baseline band, signed delta | `VitalTile` | NHIS A24 | D |
| Live vs historical; out-of-range colour + limit line | `TrendChart` | NHIS A25; App. F F.5.8 | P |
| Overview on one screen | `stories/Patterns` Station overview at 1280 × 800 | NHIS A26 | P |
| Flashing limits | `flash.*` tokens, `.nhis-flash-*` | NHIS A27; App. F F.5.11; WCAG 2.3.1, 2.2.2 | P |
| ≤ 6 coding colours | 4 used (red, yellow, blue, violet) | NHIS A28; AC 25-11B | P |
| Progress for long analysis, interruptible | `Conversation progress`, Stop | NHIS A29 | P / D |
| Target sizes, drag alternatives | `size.control*`; `ImageInput` button alternative | NHIS A30; WCAG 2.5.7, 2.5.8 | P |
| Focus never hidden; pause updates | `scroll-padding-top`; `pausedAt` | NHIS A31 | P |
| Chat stays at start of new response | `Conversation` scroll logic | NHIS A32 | P |
| Persistent done state per step | `ProtocolStepper` | NHIS A33 | P |

## EVA (simulation)

| Item | Implementation | Source | Flag |
|---|---|---|---|
| Clear forward view | `eva.angle.clearZoneRadius`; band-limited anchors | NHIS B1; NASA V2 11022 (NASA-04) | D; 10° U |
| Suit pressure, ppO2, ppCO2, metabolic rate | `EVAStatusItem.required`; stories | NHIS B3; V2 11035, 11036, 11038 | P (limits U) |
| Sound plus visor | `useAnnunciation` in `EVAAlertCue` | NHIS B4 | P |
| Readable in monochrome | `rendering="monochrome-green"` | NHIS B5 | P |
| Warning outline near line of sight | `EVAAlertCue` ring + chip | NHIS B6 | P / D |
| One-action acknowledgement | `WristControlSim` A, voice "Acknowledge" | NHIS B7, B30 | D |
| Link state and data age | `EVAStatusStrip link` | NHIS B8 | P / D |
| World-locked vs body-locked | `BearingIndicator registered`; strip body-locked | NHIS B9, B10, B11 | P / D |
| Limiting consumable vs walk-back | `ConsumableReadout` | NHIS B12 | D |
| Vitals by exception; declutter levels | `EVAStatusStrip`, `declutter` | NHIS B13, B14 | D / S |
| Coarse status | `CoarseStatus` | NHIS B15 | D |
| Brief, dismissible AI cue | `NASTRAResponseCue` | NHIS B16 | P / D |
| ≤ 4 steps, current at full intensity | `ProtocolStepCue` | NHIS B17 | P |
| Visual-angle text sizes; medium/bold only | `GlanceText`, `eva.angle.text*` | NHIS B20, B21 | P / D |
| White or green text; red only as fill | `eva.css` | NHIS B22 | P |
| Tight backing plates; no darkening assumed | `.nhis-eva-plate`, `optics="additive"` | NHIS B23 | P |
| Gaze reveals, never commits | `StatusRow` dwell | NHIS B31 | D; U |
| Two modalities for every function | `WristControlSim` + `VoiceCue` | NHIS B29, B32 | P |
