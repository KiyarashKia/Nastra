import fs from 'node:fs';
import path from 'node:path';

/** Minimal .env.local loader (no dependency). Never prints values. */
export function loadEnv(file = '.env.local'): void {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^['"]|['"]$/g, '');
    if (process.env[m[1]] === undefined && value !== '') process.env[m[1]] = value;
  }
}
