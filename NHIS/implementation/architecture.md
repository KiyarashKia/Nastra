# Architecture

```text
tokens/source/tokens.json
        ↓  scripts/build-tokens.mjs
tokens/css/nhis-tokens.css  +  tokens/types/tokens.ts
        ↓
semantics/ (types, deterministic rules, formatting)
        ↓
components/shared   ← provider, annunciation hook, glyphs, status tags, measurement
components/station  ← NHIS wrappers over React Aria Components + operational components
components/eva      ← EVA simulations in visual-angle units
visualization/      ← SVG charts
        ↓
stories/ (Storybook review environment, labelled fixtures)
```

Styling flows one way: semantic tokens → component CSS → React Aria behaviour. No library theme sits underneath (03 §22).

## Dependencies

| Package | Why | Type |
|---|---|---|
| react-aria-components 1.22.1 | Keyboard, focus, semantics, overlays, selection for Station controls | runtime |
| @fontsource/atkinson-hyperlegible-next, -mono 5.3.0 | Self-hosted OFL fonts | runtime (CSS) |
| react, react-dom | Peer (18.3 or 19) | peer |
| vite, @vitejs/plugin-react, typescript 6.0, vitest | Build, types, tests | dev |
| storybook, @storybook/react-vite, addon-docs, addon-a11y | Review environment | dev |

Not used, on purpose: Untitled UI (NHIS-IMPL-001), Carbon Charts (NHIS-VIZ-001), an icon library (NHIS-IMPL-003), OpenBridge code or tokens (00 §4).

## React Aria mapping

| NHIS component | React Aria primitive |
|---|---|
| `Button` | `Button` (pending, pressed, hover, focus-visible states) |
| `HazardousAction` | `DialogTrigger`, `ModalOverlay`, `Modal`, `Dialog role="alertdialog"` |
| `TextField` | `TextField`, `Label`, `Input` / `TextArea`, `Text`, `FieldError` |
| `ChoiceGroup` | `RadioGroup`, `Radio` |
| `Checkbox` | `Checkbox` |
| `Select` | `Select`, `SelectValue`, `Popover`, `ListBox`, `ListBoxItem` |
| `Tabs`, `TabList`, `Tab`, `TabPanel` | Same names |
| `Disclosure` | `Disclosure`, `DisclosurePanel` |
| `Tooltip` | `TooltipTrigger`, `Tooltip` |
| `WarningDialog` | `ModalOverlay` (not dismissable, keyboard dismiss disabled), `Modal`, `Dialog role="alertdialog"` |
| `ImageInput` | `DropZone`, `FileTrigger` |

Behaviour NHIS adds beyond React Aria: Warning cannot be dismissed without an action (A3); hazardous dialogs focus Cancel first (A10); chat scroll keeps the start of a new response in view (A32).

## Package outputs

- `dist/nhis.js` (ESM) and `dist/types/` (declarations)
- `dist/nhis.css` (tokens + component styles)
- `components/shared/fonts.css` exported as `@nastra/nhis/fonts.css` so the app bundler emits real font files
- `tokens/css/nhis-tokens.css` and `tokens/source/tokens.json` exported for non-React consumers
