# Verification log

Build verification for NHIS 0.1.0, 2026-11-14. This log records what was checked and how. Passing these checks proves the package builds and behaves as specified; it is not operational validation (00 §17).

## Environment

- Node 22.23.4, npm 10
- React 19.3.1, React Aria Components 1.22.1, TypeScript 6.0.3, Vite 8.3.8, Vitest 5.1.0, Storybook 10.6.7

## Results

| Check | Command | Result |
|---|---|---|
| Token generation | `npm run tokens` | 232 tokens → `tokens/css/nhis-tokens.css`, `tokens/types/tokens.ts` |
| Contrast gate | `npm run check:contrast` | 82 of 82 pairs pass (`validation/contrast-report.md`). One pair failed at 5.99:1 during development (muted text on overlay) and was fixed by raising `text.muted`; ratios are not rounded. |
| Library build | `npm run build:lib` | `dist/nhis.js` 144 kB (33 kB gzip), `dist/nhis.css` 73 kB (11 kB gzip), declarations in `dist/types/`. React, React DOM and React Aria are external. |
| Type check | `npm run typecheck` | 0 errors (components, semantics, visualization, stories) |
| Unit tests | `npm test` | 12 of 12 pass: Emergency authority, protocol link, acknowledgement keeps class, reclassification needs authority, counts, freshness states, number and time formatting |
| Review environment | `npm run build-storybook` | Builds; 54 stories across Foundations, Semantics, Station, Visualization, EVA (simulation), Patterns |
| Automated accessibility | axe-core 4 (WCAG 2.0 A/AA, 2.1 AA, 2.2 AA tags) on every non-EVA story root | 42 stories, 0 violations. EVA stories excluded on purpose: the visor is not web content. |
| Console | Playwright run over key stories | No console errors |
| Grayscale review | Storybook Review → Grayscale | Alert classes, overview and banners remain distinguishable by label, glyph and marker |
| One-screen overview | `Patterns / Station overview` at 1280 × 800 | Header, state, Caution banner, three vitals and the AI assessment fit with no scrolling |
| Brand assets | SHA-256 | `Logo_NASTRA.svg` d3d17e31…2718, `Logo_NASTRA.png` 28e34621…1701, identical to the source pack |

## Not verified here

See `validation/unresolved-decisions.md`. In short: no re-reading of NASA primary sources in this build, no hardware, no suited or analog tests, no representative users, no screen-reader pass, no measurement of physical character size.
