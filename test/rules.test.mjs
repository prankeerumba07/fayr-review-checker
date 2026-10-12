// The dashboard's own rules, checked on every file: no banned word anywhere
// (file names, code, screen words, tests, fixtures, even inside the .xlsx
// fixture), no redirects in the tests, only the two dependencies, and every
// module passing Node's syntax check.
// Run: node test/rules.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from '../amazon/zip.js';
import { modules } from '../syntax-check.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// The banned words, kept as base64 so this file does not hold them itself.
const BANNED = ['cmVmdW5k', 'Y2FzaGJhY2s=', 'cmV3YXJk'].map((b) => Buffer.from(b, 'base64').toString('utf8'));
const BANNED_RE = new RegExp(BANNED.join('|'), 'i');

function files(dir = ROOT) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'data' || name === '.git') continue;
    const path = join(dir, name);
    out.push(path);
    if (statSync(path).isDirectory()) out.push(...files(path));
  }
  return out;
}

const ALL = files();
const TEXT = ALL.filter((f) => /\.(m?js|json|html|css|md|txt|csv|svg)$/i.test(f) || /\.gitignore$/.test(f));

test('no banned word in any file name', () => {
  assert.equal(BANNED.length, 3);
  for (const f of ALL) assert.doesNotMatch(relative(ROOT, f), BANNED_RE, relative(ROOT, f));
});

test('no banned word in any file: code, screen words, tests, fixtures and the README', () => {
  assert.ok(TEXT.length > 40, `${TEXT.length} files looked at`);
  for (const f of TEXT) assert.doesNotMatch(readFileSync(f, 'utf8'), BANNED_RE, relative(ROOT, f));
});

test('no banned word inside the Excel fixtures, and none in the pictures', () => {
  const sheets = ALL.filter((x) => /\.xlsx$/i.test(x));
  assert.ok(sheets.length >= 1, 'the made-up orders file is looked inside');
  for (const f of sheets) {
    const zip = readZip(readFileSync(f));
    for (const [name, get] of zip) if (/\.(xml|rels)$/.test(name)) assert.doesNotMatch(get().toString('utf8'), BANNED_RE, `${relative(ROOT, f)}: ${name}`);
  }
  for (const f of ALL.filter((x) => /\.(png|jpe?g)$/i.test(x))) assert.doesNotMatch(readFileSync(f).toString('latin1'), BANNED_RE, relative(ROOT, f));
});

test('the tests contain no redirects', () => {
  for (const f of ALL.filter((x) => x.includes(`${join(ROOT, 'test')}`) && /\.m?js$/.test(x))) {
    const src = readFileSync(f, 'utf8');
    if (f.endsWith('rules.test.mjs')) continue;
    assert.doesNotMatch(src, /status:\s*30[1278]\b|['"]location['"]\s*:|\blocation:\s*['"`]|Response\([^)]*\{\s*status:\s*30\d/i, relative(ROOT, f));
  }
});

test('only playwright-core and exceljs; no backend, no database, no .env, no API key', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['exceljs', 'playwright-core']);
  assert.equal(pkg.devDependencies, undefined);
  for (const f of modules().filter((x) => !x.includes(`${join(ROOT, 'test')}`))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from\s+'([^']+)'|import\('([^']+)'\)/g)) {
      const spec = m[1] ?? m[2];
      assert.ok(spec.startsWith('.') || spec.startsWith('node:') || spec === 'playwright-core' || spec === 'exceljs', `${relative(ROOT, f)} imports ${spec}`);
    }
    assert.doesNotMatch(src, /API_KEY|prisma|DATABASE_URL|localhost:3001/i, relative(ROOT, f));
  }
});

test("every module passes Node's syntax check", () => {
  const list = modules();
  assert.ok(list.length > 25, `${list.length} modules`);
  for (const f of list) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${relative(ROOT, f)}: ${r.stderr}`);
  }
});
