# Source pack and reference record

## Canonical input tree

All paths are case-sensitive and were found exactly as listed. No file was missing.

```text
DSNASTRA/
├── 00_AGENT_INSTRUCTIONS.md
├── 01_NHIS_OPERATIONAL_UX_STANDARDS.md
├── 02_NASTRA_INTERFACE_CONTEXT.md
├── 03_IMPLEMENTATION_CONSTRAINTS.md
├── Logo_NASTRA.svg
├── Logo_NASTRA.png
└── References/
    ├── NASA/
    │   ├── NASA_PRIMARY_SOURCES.md
    │   └── NASA_REFERENCE_USAGE_GUIDE.md
    └── Design-Language/
        ├── DesignMD/
        │   ├── HEALTHTECH.md
        │   ├── HUD_FUI_REFERENCE_ONLY.md
        │   ├── INCLUSIVE_DESIGN.md
        │   └── ZERO_INTERFACE.md
        └── OpenBridge/
            └── OpenBridge 6.1.fig
```

`References/NASA/` is the only NASA navigation authority. NHIS keeps no second register. No local NASA PDFs were supplied or assumed.

## OpenBridge 6.1 (P5): what was and was not inspected

- `References/Design-Language/OpenBridge/OpenBridge 6.1.fig` is a Figma file container. Its binary canvas (component vectors) was not decoded or reconstructed, as 00 §4 and 03 §27 require. A second export of the same file (`OpenBridge 6.1 (Community).fig`) was supplied by the product owner; it has the same 403 embedded images and an effectively identical canvas.
- Inspected: the container thumbnail, `meta.json`, and the 403 embedded raster images (documentation covers: Alerts, Instruments, AR framework, Small screens, Application patterns).
- Also inspected: a PDF export of the Instruments page (`OpenBridge 6.1 (Community).pdf`, 131 pages) supplied by the product owner. Most pages are maritime instruments (compasses, azimuth, ROT, thrusters) and are not relevant.
- The Figma web link supplied by the product owner could not be opened: the Figma connector is not approved for this kind of session.
- The official site (openbridge.no) was not consulted in this build.

Anatomy taken, each re-derived against NHIS and recorded as a design decision, not a requirement:

| OpenBridge observation | NHIS use | Changed for NHIS |
|---|---|---|
| Readout: label left, right-aligned value, small unit suffix, stacked label/unit variant (PDF p.4) | `TelemetryReadout` | OpenBridge marks alarm readouts with fill colour alone; NHIS adds glyph and label (A2) |
| Trend graph with right-edge "now" marker and current-value bar (PDF p.47) | `TrendChart` live end | Value printed with unit; baseline band and limit source added (A24, A25) |
| Clock with separate zone label (PDF p.49) | `Time` | Confirms A23 time-system labels |
| Alert list: per-row ACK, Unacked/Shelved/All views, ACK all, Silence, active count in top bar (embedded "Alerts" cover) | `AlertList`, `AlertCounts` | Views follow NASA terms (acknowledge, suppress, inhibit + audit); NHIS colours and glyphs |
| AR labels with source tag (CAM/AIS) and numbered linking (embedded "AR framework" cover) | Source naming in EVA alert and evidence components | Central placement rejected (B1, B25) |

Rejected: radial instruments and gauges (NHIS A24; 00 §12), OpenBridge colours, typography, icons and alert semantics (00 §4).

## DesignMD (P6)

| File | Taken | Rejected |
|---|---|---|
| `HEALTHTECH.md` | Calm presentation, progressive disclosure, label above input, no floating labels, no emojis | Its 12 to 36 px radii, green accent, landing-page layouts, shimmer skeletons, entry animations |
| `INCLUSIVE_DESIGN.md` | Non-colour indicators, visible focus, keyboard reachability, reduced motion | Spring physics, hover scale, 7:1 for all text as a blanket rule (NHIS sets its own targets) |
| `ZERO_INTERFACE.md` | Voice-first, progressive disclosure, minimal persistent UI, visible fallback | Treating "zero interface" as no interface; decorative AI predictions |
| `HUD_FUI_REFERENCE_ONLY.md` | Thin technical geometry, sparse markers, mono for telemetry only | Neon glow, scanning, monospace body text, cyan/red palette, decorative markers |

## Other references used

- React Aria Components 1.22.1 (Adobe, Apache-2.0): behaviour only. No Spectrum styling.
- Atkinson Hyperlegible Next and Mono (Braille Institute, SIL OFL 1.1) via Fontsource 5.3.0.
- WCAG 2.2 for Station as a supporting floor.
- NASTRA project docs on claude.ai (`CLAUDE.md`, architecture diagrams): product context only, consistent with the pack.
