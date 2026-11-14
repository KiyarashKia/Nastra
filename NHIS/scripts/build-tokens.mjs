// Generates tokens/css/nhis-tokens.css and tokens/types/tokens.ts from tokens/source/tokens.json.
// Usage: npm run tokens
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, loadSource, flatten, resolveAll, cssVarName, aliasTarget } from './lib/tokens.mjs';

const source = loadSource();
const flat = flatten(source);
const resolved = resolveAll(flat);

const HEADER = '/* NHIS — NASTRA Human Interface System. GENERATED from tokens/source/tokens.json by scripts/build-tokens.mjs. Do not edit by hand. */';

// ---------- CSS -------------------------------------------------------------
const cssValue = (token) => {
  const target = aliasTarget(token.value);
  if (target && flat.has(target) && typeof resolved.get(target).resolved !== 'object') {
    return `var(${cssVarName(target)})`;
  }
  const v = token.resolved;
  if (token.type === 'cubicBezier' && Array.isArray(v)) return `cubic-bezier(${v.join(', ')})`;
  if (token.type === 'fontWeight') return String(v);
  return String(v);
};

const lines = [];
const typography = [];
for (const [path, token] of resolved) {
  if (token.type === 'string') continue; // identifiers (audio vocabulary) live in TS only
  if (token.type === 'typography') {
    const v = token.resolved;
    const base = cssVarName(path);
    const raw = token.value;
    const sub = (key, cssKey) => {
      const t = aliasTarget(raw[key]);
      return `  ${base}-${cssKey}: ${t && flat.has(t) ? `var(${cssVarName(t)})` : v[key]};`;
    };
    typography.push(
      sub('fontFamily', 'font-family'),
      sub('fontSize', 'font-size'),
      sub('lineHeight', 'line-height'),
      sub('fontWeight', 'font-weight'),
      `  ${base}-letter-spacing: ${v.letterSpacing};`,
      `  ${base}-font: var(${base}-font-weight) var(${base}-font-size)/var(${base}-line-height) var(${base}-font-family);`,
    );
    continue;
  }
  lines.push(`  ${cssVarName(path)}: ${cssValue(token)};`);
}

const css = `${HEADER}
:root,
[data-nhis-theme='station-dark'] {
  color-scheme: dark;
${lines.join('\n')}
${typography.join('\n')}
}

/* Reduced motion: transitions become instant. Alert flashing is replaced by a steady
   high-emphasis treatment inside components (see foundations/motion.md). */
@media (prefers-reduced-motion: reduce) {
  :root,
  [data-nhis-theme='station-dark'] {
    ${cssVarName('motion.duration.feedback')}: 0ms;
    ${cssVarName('motion.duration.transition')}: 0ms;
  }
}
`;

// ---------- TypeScript ------------------------------------------------------
const setDeep = (obj, path, value) => {
  let o = obj;
  path.slice(0, -1).forEach((k) => (o = o[k] ??= {}));
  o[path.at(-1)] = value;
};
const values = {};
const vars = {};
const paths = [];
for (const [path, token] of resolved) {
  paths.push(path);
  setDeep(values, token.path, token.resolved);
  if (token.type !== 'string') setDeep(vars, token.path, `var(${cssVarName(path)})`);
}

const ts = `${HEADER.replace('/*', '/**').replace('*/', ' */')}

/** Resolved token values. Use for non-CSS consumers (canvas, SVG maths, tests). */
export const tokenValues = ${JSON.stringify(values, null, 2)} as const;

/** CSS custom-property references. Prefer these in component styles. */
export const cssVars = ${JSON.stringify(vars, null, 2)} as const;

/** Every token path in tokens.json. */
export type TokenPath =
${paths.map((p) => `  | '${p}'`).join('\n')};

export const tokenPaths: readonly TokenPath[] = ${JSON.stringify(paths)} as const;

/** CSS custom-property name for a token path. */
export function tokenVar(path: TokenPath): string {
  return 'var(--nhis-' + path.split('.').map((s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()).join('-') + ')';
}
`;

mkdirSync(resolve(ROOT, 'tokens/css'), { recursive: true });
mkdirSync(resolve(ROOT, 'tokens/types'), { recursive: true });
writeFileSync(resolve(ROOT, 'tokens/css/nhis-tokens.css'), css);
writeFileSync(resolve(ROOT, 'tokens/types/tokens.ts'), ts);
console.log(`NHIS tokens: ${resolved.size} tokens → tokens/css/nhis-tokens.css, tokens/types/tokens.ts`);
