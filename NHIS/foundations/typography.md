# Typography

Atkinson Hyperlegible Next for interface text. Atkinson Hyperlegible Mono for numbers that are read as data. Both from the Braille Institute, SIL OFL 1.1, delivered by Fontsource. They were chosen because NHIS A22 asks for exactly what they were built for: I, l, 1, O and 0 that cannot be confused.

Fallbacks: `"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif` and `"Cascadia Mono", "SF Mono", Menlo, Consolas, monospace`. Fallbacks do not guarantee the same discrimination.

## Roles (Station)

| Role | Size / line | Weight | Family |
|---|---|---|---|
| `type.display` | 28 / 36 | 600 | Sans |
| `type.heading` | 20 / 28 | 600 | Sans |
| `type.title` | 16 / 24 | 600 | Sans |
| `type.body` | 16 / 24 | 400 | Sans |
| `type.label` | 16 / 24 | 500 | Sans |
| `type.meta` | 14 / 20 | 400 | Sans (tertiary only) |
| `type.action` | 16 / 24 | 600 | Sans |
| `type.telemetryPrimary` | 40 / 44 | 500 | Mono |
| `type.telemetrySecondary` | 24 / 32 | 500 | Mono |
| `type.tabular` | 16 / 24 | 400 | Mono |

Rules: mixed case everywhere; no all-caps labels; 16 px (12 pt) minimum for anything important; 14 px floor; units at label size; `.nhis-num` for fixed-width numbers with slashed zero.

## EVA glance text

Set in visual angle, not px: 0.7° for the glanced primary value, 0.5° for everything else while moving, 0.35° only for content read while stationary. Medium or bold only. See `foundations/eva-geometry.md`.
