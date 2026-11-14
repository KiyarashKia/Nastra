# Space, size, shape and layers

- 4 px grid: `primitive.space.0` to `16`. Semantic: `space.componentCompact` 8, `componentDefault` 12, `panelPadding` 16, `panelPaddingLarge` 24, `stack` 16, `section` 32, `gutter` 16, `pageMargin` 24.
- Controls: 44 px default (touch toward WCAG 2.5.5), 32 px compact (pointer), 24 px absolute floor.
- Radius: control 4, panel 6, tag and alert 2. No pill shapes.
- Borders: hairline 1, control 1, emphasis 2, alert 2, focus 2 + 2 offset.
- Surfaces: canvas → panel → raised → overlay; critical for authorized Emergency. Scrim behind modals keeps the context dimly visible.
- Layers (`z.*`): sticky header 100, popover 300, tooltip 350, modal 400, Warning dialog 500, Emergency 600.
- Station viewport: minimum 1280 × 720. The overview fits one screen with no scrolling (A26). Only procedures and lists scroll vertically. No horizontal scrolling.
- Station grid: 12 columns, 16 px gutter, 24 px page margin, 1600 px content max. Overview: 8 columns state + alerts + vitals, 4 columns AI assessment.
