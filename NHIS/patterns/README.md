# Patterns

Each pattern names the components it uses and the rule it protects. Storybook stories show them.

| Pattern | Surface | How | Rules |
|---|---|---|---|
| Nominal monitoring | Both | Achromatic tiles that say "within baseline"; EVA strip lowlighted or hidden | 02 §3.3, B13 |
| Exception-based escalation | Both | Advisory log → Caution banner → Warning dialog; Emergency only from authority | A3, operational alert model |
| AI assessment | Station | `AIAssessment`: observations → own report (if required) → assessment + confidence → protocol-backed action; evidence one step away | A11–A14 |
| Evidence inspection | Station | "Inspect evidence" disclosure → `EvidencePanel` with signals, window, baseline, protocol, references, named gaps | A11 |
| Symptom intake | Station | `SymptomIntake`: own words + chips → read-back → confirm. `ExtractionReview` for values read from images. | A15, NHIS-AI-004 |
| Data-quality degradation | Both | Last value stays readable with age; dashed outline; hatched chart tail; AI says it is working from old data | A7, B8, B33 |
| Asynchronous flight-surgeon escalation | Station | Header button in a fixed position → `EscalationStatus` with sent, received, answered and the current round-trip delay | A18 |
| Protocol execution | Both | `ProtocolStepper` (Station), `ProtocolStepCue` (EVA, ≤ 4 steps); who performs each step | A33, B17 |
| Procedure completion | Station | Persistent "Protocol complete" closure plus a done state on every step | A33 |
| Voice confirmation | EVA | `VoiceCue`: listening → read-back → confirm by voice or button A → executed; acknowledgement is one word without read-back | B30 |
| EVA warning presentation | EVA | Ring at the clear-zone edge + chip in the right band + sound; acknowledge by A or "Acknowledge" | B4–B7 |
| EVA declutter | EVA | Dial switches full/minimal; button B recalls all values; gaze dwell reveals one row, reversibly | B13, B14, B31 |
| Multimodal failure and fallback | Both | Voice unavailable → wrist control; AI unavailable → alerts keep working; link lost → values age visibly | B29, 03 §19 |
| Live vs simulation | Both | Violet label, workspace frame and texture; EVA simulation banner; fixture labels on data | A9 |
| One event, two surfaces | Both | Station explains (chart, history, evidence); EVA abbreviates ("HR trending high 124 bpm") | 02 §12 |
