# Colour

Colour carries meaning, so NHIS spends it carefully.

## Rules

- Surfaces, text, actions, selection and focus are achromatic.
- Red, yellow and blue are alert semantics only (plus black-and-yellow hazard striping).
- Violet is the only non-alert coding colour, for simulation, training and what-if.
- Total coding colours: 4 (limit 6, NHIS A28).
- Safety red is never text. It is a fill behind light text or a stroke (NHIS-COLOR-002).
- Emergency and Warning share red values but are separate tokens. They differ by label, glyph, ring, layer and annunciation.
- Nominal has no colour. There is no green "OK".
- Degraded data has no colour: label, glyph, dashed outline, hatching and age.

## Semantic tokens

| Token | Use |
|---|---|
| `color.surface.canvas / panel / raised / overlay / critical` | Achromatic luminance steps. No blur, no glow. |
| `color.text.primary` | Body, telemetry values, alert text. ≥ 14:1. |
| `color.text.secondary` | Labels, units, supporting text. ≥ 10:1. |
| `color.text.muted` | Tertiary metadata. ≥ 6:1 everywhere. Never telemetry. |
| `color.border.control` | Input and control edges. ≥ 3:1. |
| `color.border.focus` + `focusHalo` | Two-tone focus ring. ≥ 3:1 on every surface. |
| `color.interactive.*` | Achromatic action states. |
| `color.status.{advisory,caution,warning,emergency}.{fill,stroke,tint,onFill}` | Alert semantics. |
| `color.data.*` | Degraded-data outline and hatch. |
| `color.mode.simulation.*` | Simulation and training. |
| `color.hazard.stripe*` | Hazardous command striping. |
| `color.viz.*` | Chart lines, band, grid, limits. |
| `color.eva.*` | Visor simulation: white or green text, red fill only, plate. |

Exact values and every checked pair: `validation/contrast-report.md`.
