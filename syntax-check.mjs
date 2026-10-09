// Checks that every module passes Node's syntax check (node --check).
// Run: node syntax-check.mjs

import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SKIP = new Set(['node_modules', 'data', '.git']);

/** Every .js and .mjs file of the dashboard, outside node_modules and data/. */
export function modules(dir = ROOT) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...modules(path));
    else if (/\.(m?js)$/.test(name)) out.push(path);
  }
  return out.sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let failed = 0;
  const list = modules();
  for (const file of list) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) {
      failed++;
      process.stdout.write(`Syntax problem in ${relative(ROOT, file)}:\n${r.stderr}\n`);
    }
  }
  process.stdout.write(failed ? `${failed} of ${list.length} files have a syntax problem.\n` : `All ${list.length} files pass Node's syntax check.\n`);
  process.exit(failed ? 1 : 0);
}
