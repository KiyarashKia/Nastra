# Motion, flashing and audio

## Motion

Nominal UI is still. Motion marks a state change, feedback or a disclosure, nothing else.

- `motion.duration.feedback` 100 ms: press and selection feedback.
- `motion.duration.transition` 200 ms: disclosure and overlays.
- `motion.easing.standard`: cubic-bezier(0.2, 0, 0, 1).
- Reduced motion: both durations become 0.
- Not allowed: scanning, pulsing nominal values, rotating rings, drifting panels, ambient tickers, animated chart entry.

## Flashing (NHIS A27, B28)

- Only unacknowledged Warning and Emergency. Caution and Advisory are steady.
- Glyph only, at 3 Hz with 50% duty (`flash.nontextHigh`, 333 ms), the WCAG 2.3.1 ceiling. Text never flashes.
- All flashing elements share one phase from the wall clock.
- Acknowledge or Suppress stops it. A stop control exists for anything flashing over 5 s (Station) or 10 s (EVA).
- Reduced motion: a steady white ring replaces flashing (open: U-10).

## Audio vocabulary

NHIS defines events, not sounds.

- `audio.annunciation.emergency / warning / caution`: identifiers the host maps to approved tones or speech. Emergency is distinct from Warning. Advisory has no audio.
- `audio.preAlertAttenuationDb` −10: the first sounding is 10 dB below the final level. `AnnunciationEvent.preAlert` marks it.
- `audio.toneRangeHz` 200–4000.
- `NHISProvider onAnnunciation` receives `start` and `stop` events with the reason (acknowledged, silenced, suppressed, inhibited, inactive, silence-all).

Haptic tokens are not defined: no source in the pack establishes a suit haptic channel.
