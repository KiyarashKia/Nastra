# Station and EVA boundaries

Station and EVA share a semantic model. They do not share components.

## Shared (`semantics/`, `components/shared/`)

Alert classes and Emergency authority, acknowledgement and annunciation states, data quality and origin, evidence categories, confidence, protocol states, operating mode, link state, time formatting, glyph shapes, and the annunciation event hook. A Caution is a Caution on both surfaces.

## Station only (`components/station/`, `visualization/`)

Rich inspection: trend charts, evidence panels, conversation, structured intake, check-ins, protocol detail, alert audit, escalation tracking, image input. Built on React Aria. Assumes keyboard, pointer and possibly touch. WCAG 2.2 AA is a supporting floor.

## EVA only (`components/eva/`)

Glance cues placed by visual angle in the lateral periphery. Assumes voice plus a wrist control (two buttons, one dial). No hover, no touch, no fine pointing, no dense charts, no transcripts. Gaze reveals and never commits. Not described as WCAG compliant. Every EVA component is a labelled design-system simulation, not flight hardware.

## Handoff rules

- The operational class of an alert is preserved across Station and EVA, acknowledgement, silence and degraded links. Only an applicable authority changes it (`reclassify`).
- When an EVA question needs depth, EVA defers to Station ("Details" by voice), it does not grow a dashboard.
- If AI is unavailable, suit and vehicle alerts are unaffected: EVA shows "NASTRA AI offline · suit alerts unaffected"; Station shows the same in the conversation.
- If voice fails, the wrist control covers every function (B29). If the link fails, last values stay with their age (B8, B33).
