# Station accessibility

WCAG 2.2 AA is a supporting floor for Station. NASA and NHIS targets are stricter where they apply, and NHIS does not claim certification.

| Area | NHIS | Evidence |
|---|---|---|
| Text contrast | ≥ 6:1 for all text, ≥ 10:1 for primary text and alert labels (exceeds 4.5:1) | `validation/contrast-report.md` |
| Non-text contrast | ≥ 3:1 for control edges, focus, alert strokes, chart lines | Same |
| Colour alone | Never. Label + glyph + marker; grayscale review in Storybook | A2 |
| Focus | Two-tone ring on every interactive element; sticky header uses scroll padding so focus is never hidden | WCAG 2.4.7, 2.4.11 |
| Keyboard | React Aria models for buttons, radios, select, tabs, disclosure, dialogs; dialogs restore focus; Warning cannot be dismissed with Escape by design (A3) | 03 §16 |
| Target size | 44 px default, 32 px compact, 24 px floor | WCAG 2.5.8 |
| Drag | Every drop zone has a button alternative | WCAG 2.5.7 |
| Motion | Reduced motion removes transitions; flashing ≤ 3 Hz and glyph-only | WCAG 2.3.1 |
| Pause | Charts support a paused, as-of presentation; acquisition and alerting continue | WCAG 2.2.2, A31 |
| Status messages | Alerts use `role="alert"` or `status`; conversation log is `aria-live="polite"` | WCAG 4.1.3 (normative text not re-read: 01) |
| Charts | Accessible summary on every chart plus a values table | A20, A25 |
| Text resize | px tokens scale with browser zoom; 200% not yet tested on every composition | U-18 |

Automated check: `@storybook/addon-a11y` (axe) runs in the Storybook UI. Results from this build are in `validation/verification-log.md`. A full screen-reader pass is still open (U-18).
