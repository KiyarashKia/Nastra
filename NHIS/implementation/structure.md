# Mapping to the canonical output structure

`03_IMPLEMENTATION_CONSTRAINTS.md` §28 defines the canonical tree. NHIS follows it. Additions and their reasons:

| Path | Canonical category | Why it exists |
|---|---|---|
| `index.ts`, `env.d.ts` | Package entry | Single export surface; CSS module typing |
| `tsconfig.build.json`, `vite.config.ts`, `vitest.config.ts`, `.storybook/` | Tool configuration | Conventional locations (§28 allows) |
| `scripts/` | Token build | Generates `tokens/css` and `tokens/types`; contrast gate |
| `tests/` | Validation evidence | Semantic rule tests; results in `validation/verification-log.md` |
| `assets/brand/` | Brand assets | Supplied logo files, unchanged |
| `components/shared/fonts.css` | Foundations (implementation) | Fonts imported separately so apps do not inline them |

No canonical category was renamed. No empty placeholder folders were added.
