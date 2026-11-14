# NHIS: NASTRA Human Interface System

NHIS is the design system for NASTRA, the Astronaut Intelligent Health Copilot.

It is a working package: design tokens, an operational semantic model, React components for NASTRA Station, labelled simulations of NASTRA EVA, and a Storybook where every state can be reviewed on its own.

NASTRA is an independent project concept. It is informed by NASA's published human-factors standards, but it is not affiliated with, approved by or endorsed by NASA.

## Where the idea came from

NASTRA started with Maple One, a Canadian team building a product for astronauts during a NASA hackathon. The question was simple: what does a health copilot look like when the person using it may be tired, under time pressure, in a small cabin or inside a pressurised suit?

Most health interfaces are built for a calm user at a desk. Most "space" interfaces are built for a film audience. Neither fits.

So NHIS takes a different starting point. Crew attention is the scarce resource. The system stays quiet while things are nominal, and spends colour, sound, motion and interruption only when they change what the astronaut should do.

## Why it looks the way it does

The interface should feel advanced because it is precise, not because it glows.

- Colour is reserved for meaning. Surfaces, text, actions, selection and focus are all achromatic. Red, yellow and blue appear only as alert semantics, and violet only marks simulation or training. That is how a Caution can be seen across a module without the rest of the screen competing with it.
- One safety language, two surfaces. Station and EVA share the same alert classes, data-quality states and evidence categories. Their presentation is deliberately different: Station explains, EVA abbreviates.
- AI is an actor, not an authority. Every response separates what was measured, what was derived, what was retrieved, what the model thinks and what a protocol allows. Evidence is one step away. Confidence is categorical, never a percentage.
- Emergency belongs to the ship, the suit or a validated protocol. NASTRA can display it, relay it and respond to it. It can never assign it.
- Missing data is not zero. Stale values stay readable and are marked with their age. A frozen chart says it is frozen.
- Typography is chosen for discrimination, not style. Atkinson Hyperlegible Next and Mono were built by the Braille Institute to keep I, l, 1, O and 0 apart.
- The theme is dark only. It is one operational theme with a clear reason, not a light/dark pair because web systems usually have one.

## Sources and references

The authority order comes from the source pack and is applied exactly. Higher sources always win inside their scope.

| Priority | Source | Role in NHIS |
|---|---|---|
| P0 | Explicit project decisions from the product owner | Dark-only theme, Atkinson typefaces, React Aria directly (no Untitled UI layer). Recorded in `governance/decisions.md` |
| P1 | `01_NHIS_OPERATIONAL_UX_STANDARDS.md` | Primary authority. Checklists A1 to A37 (Station) and B1 to B34 (EVA) |
| P2 | NASA primary sources via `References/NASA/NASA_PRIMARY_SOURCES.md` and `NASA_REFERENCE_USAGE_GUIDE.md` | Verification and provenance: NASA-STD-3001 Vol 2 Rev F (Appendix F, Sections 3, 5, 10, 11), Joint AR ConOps Rev A, HIDH, CLDP alerts workshop |
| P3 | `02_NASTRA_INTERFACE_CONTEXT.md` | Where a pattern belongs: Station or EVA |
| P4 | `03_IMPLEMENTATION_CONSTRAINTS.md` | React, TypeScript, React Aria, tokens, CSS custom properties, Storybook, output structure |
| P5 | OpenBridge 6.1 | Anatomy reference only (alert list, instrument readout, trend graph, AR labels) |
| P6 | DesignMD: HealthTech, Inclusive Design, Zero Interface, HUD/FUI | Tone and interaction inspiration only |
| P7 | React Aria Components, Fontsource | Behaviour and font delivery only |

External references the standards rely on are cited where they matter: WCAG 2.2, FAA AC 25.1322-1 and AC 25-11B, IEC 60601-1-8, HIMSS 2009, NISTIR 7804, NN/g, Microsoft and Apple spatial-design guidance, PAIR, and the research named in `01_NHIS_OPERATIONAL_UX_STANDARDS.md`. Every safety-significant decision is traced in `governance/provenance.md`.

What was not available, and what is still unverified, is listed openly in `validation/unresolved-decisions.md`. That list matters as much as the components.

## What is in the package

```text
NHIS/
├── README.md                 this file
├── package.json, tsconfig*.json, vite.config.ts, vitest.config.ts
├── .storybook/               review environment config
├── foundations/              colour, type, space, motion, surfaces, iconography, layout, audio
├── tokens/
│   ├── source/tokens.json    machine-readable source (primitive → semantic → component)
│   ├── css/nhis-tokens.css   generated CSS custom properties
│   └── types/tokens.ts       generated TypeScript values, var() references and token paths
├── semantics/                alert model, data quality, AI, protocol, mode; rules and formatting
├── components/
│   ├── shared/               provider, annunciation hook, glyphs, status tags, measurement
│   ├── station/              React Aria wrappers and operational Station components
│   └── eva/                  EVA simulations (labelled, not flight hardware)
├── visualization/            trend chart, sparkline, bullet graph
├── patterns/                 reusable flows: escalation, evidence, degradation, voice, declutter
├── accessibility/            Station (WCAG 2.2 AA as a floor) and EVA (human factors, not WCAG)
├── governance/               decisions, provenance, sources, brand assets, contribution rules
├── validation/               compliance matrix, contrast report, verification log, unresolved decisions
├── implementation/           architecture, Station vs EVA boundaries, tooling, structure mapping
├── stories/                  Storybook stories and labelled fixtures
├── scripts/                  token build and contrast check
├── tests/                    semantic rule tests
└── assets/brand/             Logo_NASTRA.svg and Logo_NASTRA.png, unchanged
```

The layout follows `03_IMPLEMENTATION_CONSTRAINTS.md` Section 28. The small additions (`scripts/`, `tests/`, `assets/`, config files) are explained in `implementation/structure.md`.

## Setup and review

Requires Node 20 or newer.

```bash
npm install
npm run tokens            # tokens.json → CSS + TypeScript
npm run check:contrast    # fails if any colour pair is below its target
npm run build             # tokens + contrast + library build (dist/)
npm run typecheck         # TypeScript, including stories
npm test                  # semantic rule tests
npm run storybook         # review environment on http://localhost:6006
npm run build-storybook   # static review build in storybook-static/
npm run verify            # all of the above, in order
```

Use it in an app:

```tsx
import '@nastra/nhis/fonts.css';
import '@nastra/nhis/styles.css';
import { NHISProvider, AlertBanner, VitalTile } from '@nastra/nhis';

<NHISProvider onAnnunciation={(event) => audioSystem.handle(event)}>
  <AlertBanner alert={alert} onAcknowledge={ack} onOpenProtocol={openProtocol} />
</NHISProvider>;
```

Pass meaning, not styling. A component takes `priority="caution"` or `quality="stale"` and resolves the colour, glyph, label, sound hook and behaviour itself.

In Storybook, the toolbar has a Review switch. Grayscale review is the NHIS A2 check: every state must still read correctly with colour removed. EVA stories have their own monochrome-green rendering for B5.

## What this package is not

- It is not the NASTRA application. Compositions in `stories/Patterns` exist to test layout and hierarchy.
- It does not contain medical thresholds, alert limits or tones. Those come from approved protocols and systems. Every limit in the stories is a labelled fixture.
- The EVA components are design-system simulations. They are not certified flight hardware, and nothing here has been tested suited.
- Building and passing type checks is not operational validation. See `validation/` for what has and has not been verified.

## Brand

`assets/brand/Logo_NASTRA.svg` is the authoritative logo and `Logo_NASTRA.png` its raster fallback. Both are kept exactly as supplied. The leaf and star are white, so the logo needs a dark ground. Its red stays inside the logo and is never an interface colour. See `governance/brand-assets.md`.
