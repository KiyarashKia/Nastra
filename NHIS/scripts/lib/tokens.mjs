// Shared token loader/resolver for build-tokens.mjs and check-contrast.mjs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..');
export const SOURCE = resolve(ROOT, 'tokens/source/tokens.json');

export function loadSource() {
  return JSON.parse(readFileSync(SOURCE, 'utf8'));
}

/** Flattens the DTCG-style tree into { path: { value, type, description, extensions } }. */
export function flatten(tree) {
  const out = new Map();
  const walk = (node, path, inheritedType) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const type = node.$type ?? inheritedType;
    if ('$value' in node) {
      out.set(path.join('.'), {
        path,
        value: node.$value,
        type,
        description: node.$description,
        extensions: node.$extensions,
      });
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith('$')) continue;
      walk(v, [...path, k], type);
    }
  };
  walk(tree, [], undefined);
  return out;
}

const ALIAS = /^\{([^}]+)\}$/;

/** Resolves aliases to final values. Throws on missing or circular references. */
export function resolveAll(flat) {
  const cache = new Map();
  const resolveValue = (value, stack) => {
    if (typeof value === 'string') {
      const m = value.match(ALIAS);
      if (m) return resolvePath(m[1], stack);
      return value;
    }
    if (Array.isArray(value)) return value.map((v) => resolveValue(v, stack));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveValue(v, stack)]));
    }
    return value;
  };
  const resolvePath = (path, stack = []) => {
    if (cache.has(path)) return cache.get(path);
    if (stack.includes(path)) throw new Error(`Circular token alias: ${[...stack, path].join(' → ')}`);
    const token = flat.get(path);
    if (!token) throw new Error(`Unknown token alias {${path}}${stack.length ? ` (from ${stack.at(-1)})` : ''}`);
    const v = resolveValue(token.value, [...stack, path]);
    cache.set(path, v);
    return v;
  };
  const resolved = new Map();
  for (const [path, token] of flat) resolved.set(path, { ...token, resolved: resolvePath(path) });
  return resolved;
}

export const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/\./g, '-').toLowerCase();
export const cssVarName = (path) => `--nhis-${path.split('.').map(kebab).join('-')}`;
export const aliasTarget = (value) => (typeof value === 'string' ? value.match(ALIAS)?.[1] : undefined);

// ---- colour maths (WCAG 2.x relative luminance) --------------------------------
export function parseHex(hex) {
  const h = hex.replace('#', '');
  if (h.length === 3) return [...h].map((c) => parseInt(c + c, 16));
  if (h.length === 6 || h.length === 8) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  throw new Error(`Not a hex colour: ${hex}`);
}
export function hasAlpha(hex) {
  const h = hex.replace('#', '');
  return h.length === 8 && h.slice(6) !== 'FF' && h.slice(6) !== 'ff';
}
export function luminance([r, g, b]) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrast(a, b) {
  const [l1, l2] = [luminance(parseHex(a)), luminance(parseHex(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
