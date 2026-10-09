// The Flipkart screen, drawn the way app.js draws it, with a fake ctx and a
// fake client shaped like the local server's answers. No browser, no server
// and no website. Made-up rows only.
// Run: node test/flipkart-view.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { h, textOf, findAll, byId } from '../lib/vdom.js';
import { ApiError } from '../lib/api.js';
import * as words from '../lib/words.js';
import flipkart, { SHEET_ACCEPT } from '../views/flipkart.js';
import amazon from '../views/amazon.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};
const classesOf = (tree) => findAll(tree, () => true).flatMap((n) => String(n.attrs?.class ?? '').split(/\s+/)).filter(Boolean);

const ORDER_SHOT = 'https://drive.google.com/open?id=1TestFlipkartOrder02abcd';
const DELIVERY_SHOT = 'https://drive.google.com/open?id=1TestFlipkartDelivery02ab';
const NONE = { sheet: null, headers: [], rows: [] };
/** The kept file as the server shows it: three rows, a link behind words, a link alone, a picture, two lines, and a link that is not a web link. */
const SAVED = {
  sheet: { fileName: 'flipkart-orders.xlsx', kind: 'xlsx', tab: 'Flipkart', rowCount: 3, uploadedAt: '2026-10-09T12:00:00.000Z' },
  headers: ['Order ID', 'Reviewer Name', 'Order Screenshot', 'Delivery Screenshot'],
  rows: [
    { n: 1, cells: [{ parts: [{ text: 'OD-TEST-000000000002' }] }, { parts: [{ text: 'Test Person Two' }] }, { parts: [{ text: 'Screenshot' }, { text: ' ' }, { link: ORDER_SHOT }] }, { parts: [{ link: DELIVERY_SHOT }] }] },
    { n: 2, cells: [{ parts: [{ text: 'OD-TEST-000000000003' }] }, { parts: [{ text: 'Test Person Three' }] }, { parts: [], picture: true }, { parts: [{ text: 'Delivered\nLeft at the door' }] }] },
    { n: 3, cells: [{ parts: [] }, { parts: [] }, { parts: [{ link: 'javascript:alert(1)' }] }, { parts: [] }] },
  ],
};
const CSV_SAVED = { sheet: { fileName: 'flipkart orders.csv', kind: 'csv', tab: null, rowCount: 1, uploadedAt: '2026-10-09T12:00:00.000Z' }, headers: ['Order ID', 'Product'], rows: [{ n: 1, cells: [{ parts: [{ text: 'OD-TEST-000000000004' }] }, { parts: [{ text: 'Test Jar' }] }] }] };
const CHOOSE = { chooseTab: { tabs: ['Orders', 'Returns'], says: 'This file has no tab named "Flipkart", and it has 2 tabs: "Orders" and "Returns". Choose the tab with the orders.' } };
const aFile = (name = 'flipkart-orders.xlsx') => new File([Buffer.from('made-up bytes')], name);

/** A client like lib/api.js: what the server keeps (saved), what an upload answers (answer), and every request made. */
function fakeLocal({ saved = NONE, answer = () => SAVED } = {}) {
  const calls = [];
  return {
    calls,
    api: async (method, path) => {
      calls.push({ method, path });
      if (method === 'GET' && path === '/local/flipkart/sheet') return structuredClone(saved);
      throw new ApiError(404, 'Not found.');
    },
    form: async (path, fd) => {
      calls.push({ method: 'POST', path, form: fd });
      return structuredClone(await answer(fd, calls.length));
    },
  };
}

/** A screen with a ctx like app.js's, which keeps where it went. */
function screen(view, local = fakeLocal()) {
  const state = view.initial();
  const went = [];
  const ctx = {
    h,
    words,
    state,
    route: '',
    local,
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
  const draw = () => [view.bar(ctx), view.render(ctx)];
  return { ctx, state, went, local, draw, page: () => view.render(ctx) };
}

async function opened(local) {
  const s = screen(flipkart, local);
  flipkart.enter(s.ctx);
  await settle();
  return s;
}

/** Chooses a file in the file chooser, as a person does. */
async function choose(s, file = aFile()) {
  byId(s.page(), 'sheet-file').attrs.onchange({ target: { files: [file] } });
  await settle();
}

const rowsOf = (tree) => findAll(byId(tree, 'rows-table'), (n) => n.tag === 'tr').map((tr) => findAll(tr, (n) => n.tag === 'td' || n.tag === 'th').map(textOf));

test('before a file is in: the tabs, and an upload area like the Amazon one for an .xlsx or .csv file; no table and no login lines', async () => {
  const first = screen(flipkart);
  assert.equal(textOf(first.page()), 'Opening the Flipkart rows…', 'before the server answers');
  const s = await opened(fakeLocal());
  const tree = s.draw();
  assert.deepEqual(findAll(byId(tree, 'market'), (n) => n.attrs?.role === 'tab').map(textOf), ['Amazon', 'Flipkart']);
  assert.equal(byId(tree, 'market-flipkart').attrs['aria-selected'], 'true');
  const area = byId(tree, 'drop');
  assert.match(area.attrs.class, /\bfk-drop\b/);
  assert.deepEqual(findAll(area, (n) => n.tag === 'p').map(textOf), ['Upload the Flipkart file: drop it anywhere on this page, or choose it', 'An .xlsx or .csv file, up to 50 megabytes. The tab named "Flipkart" is read, or the file\'s only tab. Nothing is checked yet.']);
  const input = byId(tree, 'sheet-file');
  assert.deepEqual([input.tag, input.attrs.type, input.attrs.id], ['input', 'file', 'fk-file']);
  assert.deepEqual(input.attrs.accept.split(',').filter((a) => a.startsWith('.')), ['.xlsx', '.csv'], 'only .xlsx and .csv files are offered');
  assert.equal(input.attrs.accept, SHEET_ACCEPT);
  assert.deepEqual([byId(tree, 'choose-file').tag, byId(tree, 'choose-file').attrs.for, textOf(byId(tree, 'choose-file'))], ['label', 'fk-file', 'Choose file']);
  assert.equal(byId(tree, 'rows'), null, 'no table before a file is in');
  assert.doesNotMatch(textOf(tree), /log ?in|Google|account/i, 'no Amazon or Google login lines');
  assert.deepEqual(s.local.calls.map((c) => `${c.method} ${c.path}`), ['GET /local/flipkart/sheet'], 'it asks only for the kept file');
});

test('choosing a file uploads it at once: its name, its tab and how many rows in one slim line, with "Replace file", and every row with every column, numbered from 1', async () => {
  const s = await opened(fakeLocal());
  const file = aFile();
  await choose(s, file);
  const post = s.local.calls.find((c) => c.method === 'POST');
  assert.equal(post.path, '/local/flipkart/sheet');
  assert.equal(post.form.get('file').name, 'flipkart-orders.xlsx');
  assert.equal(post.form.get('tab'), null, 'no tab chosen: the server picks it');
  const tree = s.draw();
  assert.equal(textOf(byId(tree, 'sheet-line')), 'flipkart-orders.xlsx, the Flipkart tab: 3 rows.');
  assert.equal(textOf(byId(tree, 'upload-done')), 'Uploaded');
  assert.deepEqual([byId(tree, 'replace-file').tag, byId(tree, 'replace-file').attrs.for, textOf(byId(tree, 'replace-file'))], ['label', 'fk-file', 'Replace file']);
  assert.equal(textOf(byId(tree, 'rows-count')), '3 rows');
  assert.deepEqual(rowsOf(tree), [
    ['Row', 'Order ID', 'Reviewer Name', 'Order Screenshot', 'Delivery Screenshot'],
    ['1', 'OD-TEST-000000000002', 'Test Person Two', 'Screenshot Link', 'Link'],
    ['2', 'OD-TEST-000000000003', 'Test Person Three', 'Picture in the file', 'Delivered\nLeft at the door'],
    ['3', '', '', 'javascript:alert(1)', ''],
  ]);
  // Another file replaces it, through the same file chooser.
  await choose(s, aFile('flipkart orders.csv'));
  assert.equal(s.local.calls.filter((c) => c.method === 'POST').length, 2);
});

test('a link shows as "Link" and opens in a new tab; a link that is not a web link is only words; a picture in a cell shows as "Picture in the file"', async () => {
  const s = await opened(fakeLocal({ saved: SAVED }));
  const table = byId(s.page(), 'rows-table');
  const links = findAll(table, (n) => n.tag === 'a');
  assert.deepEqual(links.map((a) => [textOf(a), a.attrs.href, a.attrs.target, a.attrs.rel]), [
    ['Link', ORDER_SHOT, '_blank', 'noopener noreferrer'],
    ['Link', DELIVERY_SHOT, '_blank', 'noopener noreferrer'],
  ]);
  const picture = findAll(table, (n) => /\bfk-picture\b/.test(n.attrs?.class ?? ''));
  assert.deepEqual(picture.map(textOf), ['Picture in the file']);
  assert.deepEqual(findAll(picture[0], (n) => /\bicon\b/.test(n.attrs?.class ?? '')).map((n) => n.attrs.class), ['icon icon-image']);
  assert.equal(findAll(table, (n) => n.tag === 'img').length, 0, 'no picture is shown or fetched');
  assert.deepEqual(s.local.calls.map((c) => `${c.method} ${c.path}`), ['GET /local/flipkart/sheet'], 'a link is only opened when it is pressed');
});

test('a file dropped anywhere on the page is uploaded at once; held over the page, the upload area lights up', async () => {
  const s = await opened(fakeLocal());
  flipkart.dragging(s.ctx, true);
  assert.match(byId(s.page(), 'drop').attrs.class, /\bfk-drop-over\b/);
  assert.equal(textOf(byId(s.page(), 'upload-doing')), 'Drop the file anywhere on this page to upload it.');
  flipkart.dragging(s.ctx, false);
  assert.doesNotMatch(byId(s.page(), 'drop').attrs.class, /\bfk-drop-over\b/);
  flipkart.dropFile(s.ctx, aFile('dropped.xlsx'));
  await settle();
  const post = s.local.calls.find((c) => c.method === 'POST');
  assert.equal(post.form.get('file').name, 'dropped.xlsx');
  assert.equal(textOf(byId(s.page(), 'sheet-line')), 'flipkart-orders.xlsx, the Flipkart tab: 3 rows.');
  // With a file in, the slim line lights up too.
  flipkart.dragging(s.ctx, true);
  assert.match(byId(s.page(), 'drop').attrs.class, /\bfk-slim\b.*\bfk-drop-over\b/);
});

test('several tabs and none named "Flipkart": the sentence naming them, a button for each, and the tab pressed is sent with the same file', async () => {
  const s = await opened(fakeLocal({ answer: (fd) => (fd.get('tab') ? SAVED : CHOOSE) }));
  const file = aFile('two tabs.xlsx');
  await choose(s, file);
  const box = byId(s.page(), 'choose-tab');
  assert.equal(textOf(findAll(box, (n) => n.tag === 'p')[0]), CHOOSE.chooseTab.says);
  assert.deepEqual(findAll(box, (n) => n.tag === 'button').map(textOf), ['Orders', 'Returns']);
  assert.equal(byId(s.page(), 'rows'), null, 'nothing kept yet, so no table');
  assert.equal(textOf(byId(s.page(), 'cancel-file')), 'Cancel');
  byId(s.page(), 'tab-1').attrs.onclick();
  await settle();
  const posts = s.local.calls.filter((c) => c.method === 'POST');
  assert.equal(posts.length, 2);
  assert.equal(posts[1].form.get('tab'), 'Returns');
  assert.equal(posts[1].form.get('file').name, 'two tabs.xlsx', 'the same file again');
  assert.equal(byId(s.page(), 'choose-tab'), null);
  assert.equal(textOf(byId(s.page(), 'rows-count')), '3 rows');
  // "Cancel" lets the file go.
  const c = await opened(fakeLocal({ answer: () => CHOOSE }));
  await choose(c);
  byId(c.page(), 'cancel-file').attrs.onclick();
  assert.deepEqual([byId(c.page(), 'choose-tab'), c.state.upload.file], [null, null]);
});

test('what stops an upload is said under the upload area, and the rows kept before stay', async () => {
  const TOO_BIG = 'The file is larger than 50 megabytes, so save a smaller copy (only the Flipkart tab, for example), then upload that.';
  let release;
  const s = await opened(fakeLocal({ saved: SAVED, answer: () => new Promise((_, reject) => (release = () => reject(new ApiError(413, TOO_BIG)))) }));
  await choose(s, aFile('big.xlsx'));
  assert.equal(textOf(byId(s.page(), 'upload-doing')), 'Uploading "big.xlsx"…');
  await choose(s, aFile('second.xlsx'));
  assert.match(textOf(s.page()), /"big\.xlsx" is still being uploaded, so wait for it to finish, then upload "second\.xlsx" again\./);
  release();
  await settle();
  assert.match(textOf(s.page()), new RegExp(TOO_BIG.replace(/[.()]/g, '\\$&')));
  assert.equal(textOf(byId(s.page(), 'sheet-line')), 'flipkart-orders.xlsx, the Flipkart tab: 3 rows.', 'the file kept before');
  assert.equal(textOf(byId(s.page(), 'rows-count')), '3 rows');
});

test('the rows still show after the page is reloaded, and a CSV file says it has no tabs', async () => {
  const reloaded = await opened(fakeLocal({ saved: SAVED }));
  assert.equal(textOf(byId(reloaded.page(), 'sheet-line')), 'flipkart-orders.xlsx, the Flipkart tab: 3 rows.');
  assert.equal(rowsOf(reloaded.page()).length, 4, 'the column names and the 3 rows');
  assert.equal(byId(reloaded.page(), 'upload-done'), null, 'nothing was uploaded just now');
  const csv = await opened(fakeLocal({ saved: CSV_SAVED }));
  assert.equal(textOf(byId(csv.page(), 'sheet-line')), 'flipkart orders.csv, a CSV file with no tabs: 1 row.');
  const empty = await opened(fakeLocal({ saved: { ...SAVED, sheet: { ...SAVED.sheet, rowCount: 0 }, rows: [] } }));
  assert.equal(textOf(byId(empty.page(), 'no-rows')), 'This tab has column names but no rows under them.');
});

test('the tabs go to the right screen: Amazon to #/amazon from the Flipkart screen, Flipkart to #/flipkart from the Amazon screen', () => {
  const s = screen(flipkart);
  byId(s.draw(), 'market-amazon').attrs.onclick({ stopPropagation() {} });
  assert.deepEqual(s.went, ['amazon']);
  assert.equal(byId(s.draw(), 'market-flipkart').attrs.onclick, undefined, 'Flipkart is the screen showing, so pressing it does nothing');
  const a = screen(amazon);
  byId(amazon.bar(a.ctx), 'market-flipkart').attrs.onclick({ stopPropagation() {} });
  assert.deepEqual(a.went, ['flipkart']);
  // app.js: both screens are in the list, Amazon first and the default, and going to a screen opens #/ and its id.
  assert.deepEqual([amazon.id, flipkart.id], ['amazon', 'flipkart']);
  const app = readFileSync(join(ROOT, 'app.js'), 'utf8');
  assert.match(app, /^import flipkart from '\.\/views\/flipkart\.js';$/m);
  assert.match(app, /^const SCREENS = \[amazon, flipkart\];$/m);
  assert.match(app, /^const DEFAULT = 'amazon';$/m);
  assert.match(app, /go: \(id\) => \{\n\s+location\.hash = `#\/\$\{id\}`;/);
});

test("the Flipkart screen's look: the shared one and its own, never the Amazon screen's, and its own can never change the Amazon screen", async () => {
  const css = readFileSync(join(ROOT, 'views', 'flipkart.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const shared = readFileSync(join(ROOT, 'styles.css'), 'utf8');
  const selectors = [...css.matchAll(/([^{}]+)\{[^}]*\}/g)].flatMap((m) => m[1].split(',')).map((x) => x.trim());
  assert.ok(selectors.length >= 20, selectors.join(' | '));
  for (const sel of selectors) assert.match(sel, /^\.fk-/, `${sel}: only Flipkart's own names`);
  // Every state the screen draws: opening, no file, a file held over the page, uploading, tabs to choose, a file in, a link, a picture, no rows, an error.
  const used = new Set(classesOf(screen(flipkart).draw()));
  const add = (s) => classesOf(s.draw()).forEach((c) => used.add(c));
  const none = await opened(fakeLocal());
  add(none);
  flipkart.dragging(none.ctx, true);
  add(none);
  const busy = await opened(fakeLocal({ answer: () => new Promise(() => {}) }));
  await choose(busy);
  add(busy);
  const asking = await opened(fakeLocal({ answer: () => CHOOSE }));
  await choose(asking);
  add(asking);
  const kept = await opened(fakeLocal({ answer: () => { throw new ApiError(400, 'The file is empty.'); } }));
  await choose(kept);
  add(kept);
  const done = await opened(fakeLocal());
  await choose(done);
  add(done);
  add(await opened(fakeLocal({ saved: { ...SAVED, rows: [] } })));
  for (const cls of used) {
    const from = cls.startsWith('fk-') ? css : shared;
    assert.match(from, new RegExp(`\\.${cls}\\b`), `${cls}: from ${cls.startsWith('fk-') ? 'views/flipkart.css' : 'styles.css'}`);
  }
  for (const cls of ['fk-drop', 'fk-drop-over', 'fk-slim', 'fk-choose-tab', 'fk-rows-table', 'fk-picture', 'fk-rows-empty', 'notice-error', 'icon-spin']) assert.ok(used.has(cls), `${cls} is drawn in one of the states`);
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.deepEqual([...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]), ['styles.css', 'views/amazon.css', 'views/flipkart.css']);
});
