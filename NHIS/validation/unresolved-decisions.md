# Unresolved decisions and open evidence

A design system for a safety-critical concept is stronger when uncertainty is explicit. Nothing below is claimed as verified. Unaffected work continued under the pack's reference-availability rules.

| ID | Item | Why it is open | Affected | Needs |
|---|---|---|---|---|
| U-01 | Logo lettering | The pack says the artwork contains "Maple One" lettering. `Logo_NASTRA.svg` and `.png` contain no lettering (three paths: ring, leaf, star). Files kept as supplied. | Brand, header | Product owner: supply the lettered version, or confirm the current files |
| U-02 | OpenBridge component anatomy | The `.fig` canvas was not decoded (00 §4, 03 §27). Inspection limited to thumbnail, embedded images and the Instruments PDF. Figma link not openable here. openbridge.no not consulted. | P5 only; nothing blocked | Optional: export Alerts / Readouts / AR frames as PNG or PDF |
| U-03 | NASA source re-verification | This build did not re-open the NASA Standards record, Rev F PDF or NTRS documents. NHIS evidence flags are preserved as supplied. | All NASA citations in `governance/provenance.md` | Verification pass against the revision-pinned PDF per the usage guide |
| U-04 | NASA colour values | Tables F.5-1 and F.5-2 not read (flag U in NHIS A1). NHIS hex values are design decisions within red/yellow/blue semantics. | `color.status.*` | Read the tables; compare |
| U-05 | See-through contrast | No source states a required contrast for see-through symbology against a lunar scene (B24, U). The EVA up-sun story is an illustration only. | All EVA visuals | Optical test with candidate display, visor stack and lighting cases |
| U-06 | EVA starting values | Clear zone 10° (second-hand), text 0.5° / 0.7°, dwell 600 ms, glance 2 s / 12 s, lowlight 0.55 are not measured for suited, walking users. | `eva.*` tokens | Suited or analog testing; first: B2 unbriefed-hazard trial |
| U-07 | EVA display geometry and registration | Simulation assumes a 37° diagonal 16:9 display centred on the line of sight. Joint AR places its display right of and above the forward view, and the baseline display is unregistered. | EVA layout slots, `BearingIndicator` | Hardware decision; re-run layout for the real field of view |
| U-08 | Physical character height on Station | 16 px meets the 12 pt rule in CSS terms. The angular size (0.25° min / 0.4° preferred at 600 mm) depends on the actual laptop PPI and viewing distance. | `type.*` | Measure on the target crew laptop |
| U-09 | Alert tones and speech | NHIS defines annunciation events and constraints, not sounds. Distinct Emergency vs Warning tones must come from the applicable source. | `audio.*`, `AnnunciationEvent` | Audio system owner |
| U-10 | Reduced motion vs flashing | With reduced motion, NHIS replaces flashing with a steady white ring. Whether an alert may stop flashing for a user preference is a project safety decision. | `.nhis-flash-*` | Project review |
| U-11 | Inhibiting an authorized Emergency | NASA App. F allows inhibit. NHIS hides Inhibit for Emergency in the Station list so NASTRA cannot hide an external assertion. | `AlertList` | Project review |
| U-12 | AI wording | Disclosure text and confidence meanings are placeholders. The effect of disclaimer wording on reliance is unstudied (01 A16). | `AI_DISCLOSURE`, stories | Medical and human-factors review |
| U-13 | Check-in visibility | Who can see psychological check-ins is a data-policy decision. `CheckIn` requires a `visibilityNote` prop and ships no default. | `CheckIn` | Data policy |
| U-14 | Freshness thresholds | No universal stale timeout exists. Each stream needs a `FreshnessPolicy` with owner and rationale. | `evaluateFreshness` | Stream owners |
| U-15 | Alert limits and baselines | NHIS invents none. Fixture limits in stories are labelled. | `TrendChart`, `VitalTile` | Approved protocols |
| U-16 | Monochrome adequacy | Monochrome-green review is simulated in a browser. | EVA | Test on target optics |
| U-17 | Human-in-the-loop checks | A36 (3-second glance test), A37 (NMSUS ≥ 85, Bedford ≤ 3 nominal), B2, B18, B34 not run. | Station overview, EVA | Representative-user evaluation |
| U-18 | Screen-reader and keyboard audit | React Aria provides the mechanics and axe found no violations in the sampled stories (see verification log). A full assistive-technology pass has not been done. | Station components | Manual audit |
| U-19 | Head turn and eye box | Content leaving the eye box when the head turns is why alerts cannot be visual only (01). The simulation does not model head motion. | EVA | Hardware test |
| U-20 | Mars lighting | No Mars surface lighting data in the pack. | EVA | Research |
