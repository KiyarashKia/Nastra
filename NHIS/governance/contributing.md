# Contributing to NHIS

## Rules that protect meaning

1. Components take meaning, not styling. Use `priority`, `quality`, `confidence`, `state`. Never add `color`, `glow` or `blink` props to safety-significant components.
2. Red, yellow and blue are reserved for alert semantics. Violet is reserved for simulation. Do not use them for anything else, including charts.
3. Never invent a threshold, limit, tone or medical conclusion. Limits enter a chart with their source. Tones come from the applicable system.
4. Emergency is entered only through `validateAlert` with an approved authorization. Do not add an AI or health-assessment path to it.
5. A missing value prints "—" and a quality tag. It is never zero, never blank, never the last value without a mark.
6. Every new colour pair goes into `scripts/check-contrast.mjs` with its target.
7. Every new safety-significant decision goes into `governance/decisions.md` and `governance/provenance.md`. Label it honestly: NHIS rule, derived, or design decision.
8. Station and EVA share meaning, not components. Do not shrink a Station component for EVA.

## Workflow

1. Change `tokens/source/tokens.json`, never the generated CSS or TS.
2. Run `npm run verify`.
3. Add or update a story for every state you touched, including degraded ones.
4. Check the story in grayscale review.
5. If a rule could not be met, add it to `validation/unresolved-decisions.md` instead of quietly bending it.

## Authority order

P0 product-owner override, P1 NHIS standards, P2 NASA sources via `References/NASA/`, P3 interface context, P4 implementation constraints, P5 OpenBridge, P6 DesignMD, P7 libraries, P8 convention. A lower source fills gaps; it never overrides.
