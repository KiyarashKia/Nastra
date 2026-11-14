# Glyphs

NHIS draws its own glyph set (`components/shared/Glyph.tsx`): one 24 px grid, 2 px round strokes, `currentColor`. Safety-significant glyphs are reviewed as a set.

- Alert classes have four silhouettes: circle (Advisory), triangle (Caution), octagon (Warning), filled octagon inside a second ring (Emergency). Shape alone separates them in grayscale and monochrome.
- Data quality: live, delayed (clock), stale (hourglass), unavailable (slashed circle), unknown (dashed circle with ?), estimated (≈), manual (pencil), paused.
- Evidence: measured (crosshair), derived (trend), retrieved (document), AI assessment (brackets around a point), recommended action (arrow).
- Protocol steps: pending, current, completed, paused, failed, blocked.
- Link: connected, degraded, disconnected.
- Generic actions: chevrons, close, check, send, mic, image, silence, escalate, user, flag, plus, minus, external, list, simulation.

Glyphs reinforce labels. A safety meaning is never carried by a glyph alone.
