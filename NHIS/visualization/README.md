# Visualization

Health charts exist for comparison and interpretation. Custom SVG, no chart library (NHIS-VIZ-001).

| Component | Shows | Rules |
|---|---|---|
| `TrendChart` | Value over time; personal-baseline band with dotted edges; limit lines that name their source; triangle (Caution limit) and octagon (Warning limit) markers on out-of-range values; thin grey historical vs heavier white live line; hatched "No data" gaps and stale tail; current value + unit at the right edge; paused "as of" label; accessible summary and a values table | A7, A20, A24, A25, A31 |
| `Sparkline` | Trend inside a tile with the baseline band. Hidden from assistive tech because the tile always prints the number, unit and signed delta | A24 |
| `BulletGraph` | One value against a protocol target and the baseline range, with signed difference | A24 |

Rules:
- Never a radial gauge.
- Never a sparkline alone.
- Never a limit without a source. NHIS supplies no limits; story limits are fixtures.
- Series are separated by line weight, dash and labels, not by hue.
- No chart animation.
- Lines break across gaps longer than three times the median sample spacing unless a stream sets its own value.
