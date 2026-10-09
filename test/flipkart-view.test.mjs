// The Flipkart screen, drawn the way app.js draws it, with a fake ctx. No
// browser, no server and no website. The Flipkart checker is being built, so
// the screen is the marketplace tabs and one plain box.
// Run: node test/flipkart-view.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { h, textOf, findAll, byId } from '../lib/vdom.js';
import * as words from '../lib/words.js';
import flipkart from '../views/flipkart.js';
import amazon from '../views/amazon.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const classesOf = (tree) => findAll(tree, () => true).flatMap((n) => String(n.attrs?.class ?? '').split(/\s+/)).filter(Boolean);

/** A screen with a ctx like app.js's, which keeps where it went and every request it made to the server. */
function screen(view) {
  const state = view.initial();
  const went = [];
  const asked = [];
  const ctx = {
    h,
    words,
    state,
    route: '',
    local: new Proxy({}, { get: (_, name) => async (...args) => (asked.push([name, ...args]), null) }),
    go: (id) => went.push(id),
    update(change) {
      if (typeof change === 'function') change(state);
      else if (change && typeof change === 'object') Object.assign(state, change);
    },
    confirm: () => true,
    download: () => {},
    every: () => () => {},
    reveal: () => {},
  };
  return { ctx, went, asked, bar: () => view.bar(ctx), page: () => view.render(ctx) };
}

test('the Flipkart screen draws: the marketplace tabs in the top bar with Flipkart chosen, and one plain box saying nothing can be checked yet', () => {
  const s = screen(flipkart);
  flipkart.enter(s.ctx);
  const bar = s.bar();
  const page = s.page();
  const tabs = byId(bar, 'market');
  assert.deepEqual([tabs.attrs.role, tabs.attrs['aria-label']], ['tablist', 'Marketplace']);
  assert.deepEqual(findAll(tabs, (n) => n.attrs?.role === 'tab').map(textOf), ['Amazon', 'Flipkart']);
  assert.deepEqual(['market-amazon', 'market-flipkart'].map((id) => byId(bar, id).attrs['aria-selected']), ['false', 'true'], 'Flipkart is chosen');
  assert.deepEqual(findAll(tabs, (n) => /\bicon\b/.test(n.attrs?.class ?? '')).map((n) => n.attrs.class), ['icon icon-bag', 'icon icon-bag'], 'the same icon as on the Amazon screen');
  assert.equal(findAll(page, (n) => /\bcard\b/.test(n.attrs?.class ?? '')).length, 1, 'one box');
  assert.equal(textOf(page), 'The Flipkart checker is being built. Nothing can be checked here yet.');
  assert.deepEqual(findAll([bar, page], (n) => ['button', 'a', 'input', 'select', 'textarea', 'form'].includes(n.tag)).map(textOf), ['Amazon', 'Flipkart'], 'nothing to press but the two tabs');
  assert.doesNotMatch(textOf([bar, page]), /log ?in|Google|account/i, 'no Amazon or Google login lines');
  assert.deepEqual([byId(bar, 'account'), byId(bar, 'google-account')], [null, null]);
  flipkart.reset(s.ctx);
  assert.deepEqual(s.asked, [], 'it asks the server for nothing');
});

test('the tabs go to the right screen: Amazon to #/amazon from the Flipkart screen, Flipkart to #/flipkart from the Amazon screen', () => {
  const s = screen(flipkart);
  byId(s.bar(), 'market-amazon').attrs.onclick({ stopPropagation() {} });
  assert.deepEqual(s.went, ['amazon']);
  assert.equal(byId(s.bar(), 'market-flipkart').attrs.onclick, undefined, 'Flipkart is the screen showing, so pressing it does nothing');
  const a = screen(amazon);
  byId(a.bar(), 'market-flipkart').attrs.onclick({ stopPropagation() {} });
  assert.deepEqual(a.went, ['flipkart']);
  assert.deepEqual(a.asked, [], 'drawing the Amazon top bar asks the server for nothing');
  // app.js: both screens are in the list, Amazon first and the default, and going to a screen opens #/ and its id.
  assert.deepEqual([amazon.id, flipkart.id], ['amazon', 'flipkart']);
  const app = readFileSync(join(ROOT, 'app.js'), 'utf8');
  assert.match(app, /^import flipkart from '\.\/views\/flipkart\.js';$/m);
  assert.match(app, /^const SCREENS = \[amazon, flipkart\];$/m);
  assert.match(app, /^const DEFAULT = 'amazon';$/m);
  assert.match(app, /go: \(id\) => \{\n\s+location\.hash = `#\/\$\{id\}`;/);
});

test("the Flipkart screen's look: the shared one and its own, never the Amazon screen's, and its own can never change the Amazon screen", () => {
  const css = readFileSync(join(ROOT, 'views', 'flipkart.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const shared = readFileSync(join(ROOT, 'styles.css'), 'utf8');
  const selectors = [...css.matchAll(/([^{}]+)\{[^}]*\}/g)].flatMap((m) => m[1].split(',')).map((x) => x.trim());
  assert.ok(selectors.length >= 4, selectors.join(' | '));
  for (const sel of selectors) assert.match(sel, /^\.fk-/, `${sel}: only Flipkart's own names`);
  const s = screen(flipkart);
  for (const cls of new Set(classesOf([s.bar(), s.page()]))) {
    const from = cls.startsWith('fk-') ? css : shared;
    assert.match(from, new RegExp(`\\.${cls}\\b`), `${cls}: from ${cls.startsWith('fk-') ? 'views/flipkart.css' : 'styles.css'}`);
  }
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.deepEqual([...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]), ['styles.css', 'views/amazon.css', 'views/flipkart.css']);
});
