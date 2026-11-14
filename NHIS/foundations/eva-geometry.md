# EVA geometry

EVA layout is set in visual angle (03 §12.2). These are NHIS starting values for suited or analog testing, not flight limits.

| Token | Value | Source |
|---|---|---|
| `eva.angle.clearZoneRadius` | 10° around the line of sight, extended down over the foot-placement region | B1 (D; figure U) |
| `eva.angle.alertNearLosMax` | ±15° | B6 |
| `eva.angle.masterAlertMin` | 1° | B6 |
| `eva.angle.warningMinAreaSqDeg` | 2 sq° | B6 |
| `eva.angle.peripheryBelowHorizonMax` | 35° | B25 |
| `eva.angle.sustainedReadingAboveHorizonMax` | 10° | B25 |
| `eva.angle.textPrimary` | 0.7° | B20 |
| `eva.angle.textMovingMin` | 0.5° | B20 |
| `eva.angle.textStationaryFloor` | 0.35° | B20 |
| `eva.angle.displayDiagonalFov` | 37° (simulation assumption) | Mitra et al. 2023 via 01 |
| `eva.timing.dwellRevealMs` | 600 ms, never below 320 | B31 |
| `eva.timing.glanceSingleMs` / `glanceCumulativeMs` | 2 s / 12 s | B18 |
| `eva.content.maxProtocolSteps` | 4 | B17 |
| `eva.content.declutterLevels` | 2 | B14 |
| `eva.opacity.lowlight` | 0.55 | Design decision |

## What the geometry means

A 37° diagonal 16:9 display is about 32° wide and 18° tall. A 10° clear zone covers the whole centre. Persistent content can only live in two lateral bands about 6° wide. NHIS treats that as a feature, not a problem: it forces EVA to show less.

Frames of reference: status is body-locked in the periphery; rover and waypoints are world-locked when tracking exists; nothing in the centre follows the head 1:1.
