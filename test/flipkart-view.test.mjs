// The Flipkart screen, drawn the way app.js draws it, with a fake ctx and a
// fake client shaped like the local server's answers (a check's lines too).
// No browser, no server and no website. Made-up rows only.
// Run: node test/flipkart-view.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { h, textOf, findAll, byId } from '../lib/vdom.js';
import { ApiError } from '../lib/api.js';
import * as words from '../lib/words.js';
import flipkart, { SHEET_ACCEPT, GOOGLE_WORDS, LOGIN_POLL_MS, STEP_NAMES, MARKS, FINAL_NONE } from '../views/flipkart.js';
import amazon, { GOOGLE_WORDS as AMAZON_GOOGLE_WORDS, LOGIN_POLL_MS as AMAZON_LOGIN_POLL_MS, MARKS as AMAZON_MARKS } from '../views/amazon.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};
const classesOf = (tree) => findAll(tree, () => true).flatMap((n) => String(n.attrs?.class ?? '').split(/\s+/)).filter(Boolean);

const ORDER_SHOT = 'https://drive.google.com/open?id=1TestFlipkartOrder02abcd';
const DELIVERY_SHOT = 'https://drive.google.com/open?id=1TestFlipkartDelivery02ab';
const REVIEW_SHOT = 'https://drive.google.com/open?id=1TestFlipkartReview03abcd';
const REVIEW_LINK = 'https://www.flipkart.com/reviews/TESTPID0000002:3?reviewId=0a1b2c3d-0000-4000-8000-000000000002';
const NONE = { sheet: null, rows: [] };
const HEADERS = ['Reviewer Name', 'Order ID', 'Amount', 'Product Ordered', 'Order Screenshot', 'Delivery Screenshot', 'Review Screenshot', 'Review Link'];
const KEYS = ['reviewer', 'orderId', 'amount', 'product', 'orderShot', 'deliveryShot', 'reviewShot', 'reviewLink'];
const LETTERS = 'ABCDEFGHIJK';
const ABOUT = [
  'Used for checking: Order ID, Amount, Product Ordered, Order Screenshot, Delivery Screenshot, Review Screenshot and Review Link.',
  'Only shown, not used for checking: Reviewer Name.',
  'This file has no order date, so order dates are not compared.',
  'It has no Status, Type or Note column, so the checked Excel file adds them after the last column.',
];
/** A picture or link cell as the server shows it. */
const shot = (over = {}) => ({ text: '', link: '', links: [], labels: [], words: '', mismatch: null, how: null, ...over });
const drive = (link, words = '') => shot({ text: words || link, link, links: [link], labels: [{ link, label: 'Google Drive' }], words });
/** The kept file as the server shows it: its columns as on Amazon, and three rows with links behind words, links alone, pictures in and over cells, no review link, two lines, and a link that is not a web link. */
const SAVED = {
  sheet: {
    fileName: 'flipkart-orders.xlsx',
    kind: 'xlsx',
    tab: 'Flipkart',
    headers: HEADERS.map((text, i) => ({ col: i + 1, text })),
    lastCol: 8,
    mapping: { ...Object.fromEntries(KEYS.map((k, i) => [k, i + 1])), orderDate: null, email: null, status: null, type: null, note: null },
    columns: [...HEADERS.map((name, i) => ({ key: KEYS[i], col: i + 1, letter: LETTERS[i], name, added: false })), ...['Status', 'Type', 'Note'].map((name, i) => ({ key: name.toLowerCase(), col: 9 + i, letter: LETTERS[8 + i], name, added: true }))],
    about: ABOUT,
    rowCount: 3,
    uploadedAt: '2026-10-12T12:00:00.000Z',
  },
  rows: [
    {
      id: 'r000000000001',
      n: 1,
      label: 'Row 1',
      orderId: 'OD100000000000000002',
      orderDate: '',
      amount: '₹349',
      product: 'Test Brand Steel Bottle',
      shots: { order: drive(ORDER_SHOT, 'Screenshot'), delivery: drive(DELIVERY_SHOT), review: shot({ text: REVIEW_LINK, link: REVIEW_LINK, links: [REVIEW_LINK], labels: [{ link: REVIEW_LINK, label: 'Flipkart review' }] }), reviewShot: shot({ how: 'cell' }) },
      values: { 1: { text: 'Test Person Two', labels: [] } },
      prev: null,
    },
    {
      id: 'r000000000002',
      n: 2,
      label: 'Row 2',
      orderId: 'OD100000000000000003',
      orderDate: '',
      amount: '₹499',
      product: 'Test Brand Lunch Box',
      shots: { order: shot({ how: 'cell' }), delivery: shot({ how: 'floating' }), review: shot(), reviewShot: drive(REVIEW_SHOT) },
      values: { 1: { text: 'Test Person Three', labels: [] } },
      prev: null,
    },
    {
      id: 'r000000000003',
      n: 3,
      label: 'Row 3',
      orderId: '',
      orderDate: '',
      amount: '',
      product: '',
      shots: { order: shot({ text: 'javascript:alert(1)', links: ['javascript:alert(1)'], labels: [{ link: 'javascript:alert(1)', label: 'Link' }] }), delivery: shot({ text: 'Delivered\nLeft at the door' }), review: shot({ text: ORDER_SHOT, link: DELIVERY_SHOT, links: [DELIVERY_SHOT], labels: [{ link: DELIVERY_SHOT, label: 'Google Drive' }], mismatch: { text: ORDER_SHOT, link: DELIVERY_SHOT } }), reviewShot: shot() },
      values: {},
      prev: null,
    },
  ],
};
/** What an upload answers: what it made, and the kept file as the server shows it. */
const UPLOADED = { made: 3, tab: 'Flipkart', unplaced: [], ...SAVED };
const CSV_SAVED = {
  sheet: { ...SAVED.sheet, fileName: 'flipkart orders.csv', kind: 'csv', tab: null, rowCount: 1 },
  rows: [SAVED.rows[0]],
};
const CHOOSE = { chooseTab: { tabs: ['Orders', 'Returns'], says: 'This file has no tab named "Flipkart", and it has 2 tabs: "Orders" and "Returns". Choose the tab with the orders.' } };
/** The fields, as the server sends them with the columns it could not find: the same as on Amazon. */
const FIELD_LIST = [
  { key: 'orderId', label: 'Order ID', required: true },
  { key: 'orderDate', label: 'Order date', required: false },
  { key: 'amount', label: 'Amount', required: false },
  { key: 'product', label: 'Product ordered', required: false },
  { key: 'orderShot', label: 'Purchase screenshot', required: false },
  { key: 'deliveryShot', label: 'Delivery screenshot', required: false },
  { key: 'reviewShot', label: 'Review screenshot', required: false, review: true },
  { key: 'reviewLink', label: 'Review link', required: false, review: true },
  { key: 'reviewer', label: 'Reviewer name', required: false },
  { key: 'email', label: 'Email address', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'type', label: 'Type', required: false },
  { key: 'note', label: 'Note', required: false },
];
/** A file whose review column the server could not find. */
const NEED = {
  columns: {
    says: 'No column of this file could be found for the review link or the review screenshot, so choose one of them below (every other column can be left as "Not in this file").',
    kind: 'xlsx',
    tab: 'Flipkart',
    headers: [{ col: 1, text: 'Ref' }, { col: 2, text: 'Evidence' }, { col: 3, text: 'Buyer' }],
    lastCol: 3,
    mapping: { orderId: 1, orderDate: null, amount: null, product: null, orderShot: null, deliveryShot: null, reviewShot: null, reviewLink: null, reviewer: 3, email: null, status: null, type: null, note: null },
    fields: FIELD_LIST,
  },
};
const aFile = (name = 'flipkart-orders.xlsx') => new File([Buffer.from('made-up bytes')], name);

/** A client like lib/api.js: what the server keeps (saved), what an upload answers (answer), and every request made. */
/** The Google login as the server says it, one state at a time. */
const GOOGLE_OUT = { state: 'out', name: null, says: null, chrome: false };

function fakeLocal({ saved = NONE, answer = () => UPLOADED, google = GOOGLE_OUT, press = null, pages = {} } = {}) {
  const calls = [];
  const local = {
    calls,
    google,
    revoked: [],
    // A check's lines, as the server streams them: (onEvent, signal) -> what lib/api.js stream() answers.
    checking: null,
    api: async (method, path, body) => {
      calls.push({ method, path, body });
      const page = /^\/local\/flipkart\/rows\/([^/]+)$/.exec(path);
      if (method === 'GET' && page) {
        if (!pages[page[1]]) throw new ApiError(404, 'No row has that id.');
        return structuredClone(pages[page[1]]);
      }
      if (method === 'GET' && path === '/local/flipkart/sheet') return structuredClone(saved);
      if (method === 'GET' && path === '/local/flipkart/campaigns') return { campaigns: [], reading: false };
      if (method === 'GET' && path === '/local/flipkart/account') return structuredClone({ google: local.google });
      // The Google login's buttons are the Amazon screen's own routes, which answer with the Amazon screen's whole top bar.
      if (method === 'POST' && path.startsWith('/local/amazon/google/')) {
        if (press) local.google = await press(path);
        return structuredClone({ state: 'in', name: 'Amazon Person', loggedIn: true, google: local.google, hindi: true, english: true, browserOpen: true, running: null });
      }
      throw new ApiError(404, 'Not found.');
    },
    form: async (path, fd) => {
      calls.push({ method: 'POST', path, form: fd });
      return structuredClone(await answer(fd, calls.length));
    },
    stream: async (method, path, body, onEvent, signal) => {
      calls.push({ method, path, body, stream: true });
      return local.checking ? local.checking(onEvent, signal) : { ok: true };
    },
    image: async (path) => `blob:${path}`,
    revoke: (url) => local.revoked.push(url),
  };
  return local;
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
/** The table of the kept file, as the screen shows it: the column names with their letters, then each row. */
const TABLE = [
  ['Row', 'A: Reviewer Name', 'B: Order ID', 'C: Amount', 'D: Product Ordered', 'E: Order Screenshot', 'F: Delivery Screenshot', 'G: Review Screenshot', 'H: Review Link', 'I: Status', 'J: Type', 'K: Note', 'Check'],
  ['1', 'Test Person Two', 'OD100000000000000002', '₹349', 'Test Brand Steel Bottle', 'Google DriveScreenshot', 'Google Drive', 'Picture in the cell', 'Flipkart review', 'Empty', 'Empty', 'Empty', 'Check'],
  ['2', 'Test Person Three', 'OD100000000000000003', '₹499', 'Test Brand Lunch Box', 'Picture in the cell', 'Picture over the cell', 'Google Drive', 'Empty', 'Empty', 'Empty', 'Empty', 'Check'],
  ['3', 'Empty', 'Empty', 'Empty', 'Empty', 'Link', 'Delivered\nLeft at the door', 'Empty', 'Google DriveThe written link is different', 'Empty', 'Empty', 'Empty', 'Check'],
];

test('before a file is in: the tabs, and an upload area like the Amazon one for an .xlsx or .csv file; no table and no login lines', async () => {
  const first = screen(flipkart);
  assert.equal(textOf(first.page()), 'Opening the Flipkart rows…', 'before the server answers');
  const s = await opened(fakeLocal());
  const tree = s.draw();
  assert.deepEqual(findAll(byId(tree, 'market'), (n) => n.attrs?.role === 'tab').map(textOf), ['Amazon', 'Flipkart']);
  assert.equal(byId(tree, 'market-flipkart').attrs['aria-selected'], 'true');
  const area = byId(tree, 'drop');
  assert.match(area.attrs.class, /\bfk-drop\b/);
  assert.deepEqual(findAll(area, (n) => n.tag === 'p').map(textOf), ['Upload the Flipkart file: drop it anywhere on this page, or choose it', 'An .xlsx or .csv file, up to 50 megabytes. The tab named "Flipkart" is read, or the file\'s only tab.']);
  const input = byId(tree, 'sheet-file');
  assert.deepEqual([input.tag, input.attrs.type, input.attrs.id], ['input', 'file', 'fk-file']);
  assert.deepEqual(input.attrs.accept.split(',').filter((a) => a.startsWith('.')), ['.xlsx', '.csv'], 'only .xlsx and .csv files are offered');
  assert.equal(input.attrs.accept, SHEET_ACCEPT);
  assert.deepEqual([byId(tree, 'choose-file').tag, byId(tree, 'choose-file').attrs.for, textOf(byId(tree, 'choose-file'))], ['label', 'fk-file', 'Choose file']);
  assert.equal(byId(tree, 'rows'), null, 'no table before a file is in');
  assert.equal(textOf(byId(tree, 'google-line')), 'Not logged in to Google', 'the Google login in the top bar');
  assert.doesNotMatch(textOf(tree), /Amazon login|logged in to Amazon|Log in to Amazon|Flipkart login|logged in to Flipkart|Log in to Flipkart/i, 'no Amazon login and no Flipkart login');
  assert.deepEqual(s.local.calls.map((c) => `${c.method} ${c.path}`), ['GET /local/flipkart/sheet', 'GET /local/flipkart/campaigns', 'GET /local/flipkart/account'], 'it asks only for the kept file, the campaigns and the Google login');
});

test('choosing a file uploads it at once: its name, its tab and how many rows in one slim line, with "Replace file", the lines about its columns, and its rows in a table like the Amazon one, numbered from 1', async () => {
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
  assert.deepEqual(findAll(byId(tree, 'about-file'), (n) => n.tag === 'li').map(textOf), ABOUT, 'the same lines as on Amazon, under the slim line');
  assert.equal(textOf(byId(tree, 'rows-count')), '3 rows');
  assert.deepEqual(rowsOf(tree), TABLE);
  assert.equal(byId(tree, 'unplaced'), null, 'every picture of the file was used');
  // Another file replaces it, through the same file chooser.
  await choose(s, aFile('flipkart orders.csv'));
  assert.equal(s.local.calls.filter((c) => c.method === 'POST').length, 2);
});

test('as on Amazon: each link a small label saying where it goes, opening in a new tab; a link that is not a web link opens nothing; a picture in a cell or over it said so; Status, Type and Note empty; a Check button at the end of each row; no Status cards', async () => {
  const s = await opened(fakeLocal({ saved: SAVED }));
  const table = byId(s.page(), 'rows-table');
  const links = findAll(table, (n) => n.tag === 'a');
  assert.deepEqual(links.map((a) => [textOf(a), a.attrs.href, a.attrs.target, a.attrs.rel, a.attrs.title, a.attrs.class]), [
    ['Google Drive', ORDER_SHOT, '_blank', 'noopener noreferrer', ORDER_SHOT, 'fk-link-label'],
    ['Google Drive', DELIVERY_SHOT, '_blank', 'noopener noreferrer', DELIVERY_SHOT, 'fk-link-label'],
    ['Flipkart review', REVIEW_LINK, '_blank', 'noopener noreferrer', REVIEW_LINK, 'fk-link-label'],
    ['Google Drive', REVIEW_SHOT, '_blank', 'noopener noreferrer', REVIEW_SHOT, 'fk-link-label'],
    ['Google Drive', DELIVERY_SHOT, '_blank', 'noopener noreferrer', DELIVERY_SHOT, 'fk-link-label'],
  ]);
  const icons = (n) => findAll(n, (x) => /\bicon\b/.test(x.attrs?.class ?? '')).map((x) => x.attrs.class);
  assert.deepEqual(links.map((a) => icons(a)[0]), ['icon icon-image', 'icon icon-image', 'icon icon-link', 'icon icon-image', 'icon icon-link'], 'a picture mark for the screenshots, a link mark for the review link');
  const plain = findAll(table, (n) => /\bfk-nolink\b/.test(n.attrs?.class ?? ''));
  assert.deepEqual(plain.map((n) => [n.tag, textOf(n)]), [['span', 'Picture in the cell'], ['span', 'Picture in the cell'], ['span', 'Picture over the cell'], ['span', 'Link']]);
  assert.equal(plain[3].attrs.title, 'javascript:alert(1)', 'the link that is not a web link is only shown, never opened');
  assert.deepEqual(findAll(table, (n) => /\bfk-link-warning\b/.test(n.attrs?.class ?? '')).map(textOf), ['The written link is different']);
  assert.deepEqual(findAll(table, (n) => n.attrs?.['data-cell'] === 'status').map(textOf), ['Empty', 'Empty', 'Empty']);
  assert.equal(findAll(table, (n) => /\bfk-empty-cell\b/.test(n.attrs?.class ?? '')).length, 15, 'each "Empty" in the table above');
  assert.deepEqual(findAll(table, (n) => n.tag === 'th').map((n) => n.attrs['data-col'] ?? null), [null, ...KEYS, 'status', 'type', 'note', null], 'and the Check column, last');
  assert.deepEqual(findAll(table, (n) => /\bfk-col-letter\b/.test(n.attrs?.class ?? '')).map(textOf), [...LETTERS]);
  const page = s.page();
  assert.deepEqual(findAll(page, (n) => n.tag === 'button' && /^(Check|Check again|Start checking)$/.test(textOf(n))).map((n) => n.attrs['data-id']), ['check-r000000000001', 'check-r000000000002', 'check-r000000000003'], 'a Check button for each row, and no "Start checking"');
  assert.doesNotMatch(textOf(page), /Needs Manual|Not checked yet|Start checking/, 'no Status cards');
  assert.equal(findAll(table, (n) => n.tag === 'img').length, 0, 'no picture is shown or fetched in the table');
  assert.deepEqual(s.local.calls.map((c) => `${c.method} ${c.path}`), ['GET /local/flipkart/sheet', 'GET /local/flipkart/campaigns', 'GET /local/flipkart/account'], 'a link is only opened when it is pressed');
});

test('a needed column that cannot be found: the same column chooser as on Amazon; "Use these columns" sends the same file again with the columns chosen, a refusal stays under it, and Cancel lets the file go', async () => {
  let refuse = false;
  const s = await opened(fakeLocal({ saved: SAVED, answer: (fd) => (refuse ? Promise.reject(new ApiError(400, 'One column cannot hold two things: Order ID and Review screenshot.')) : fd.get('mapping') ? UPLOADED : NEED) }));
  await choose(s, aFile('odd names.xlsx'));
  const tree = s.draw();
  const box = byId(tree, 'columns');
  assert.equal(textOf(findAll(box, (n) => n.tag === 'p')[0]), NEED.columns.says);
  assert.deepEqual(findAll(box, (n) => n.tag === 'label').map(textOf), [
    'Order ID (required)', 'Order date (optional)', 'Amount (optional)', 'Product ordered (optional)', 'Purchase screenshot (optional)', 'Delivery screenshot (optional)',
    'Review screenshot (or the review link)', 'Review link (or the review screenshot)', 'Reviewer name (optional)', 'Email address (optional)', 'Status (optional)', 'Type (optional)', 'Note (optional)',
  ]);
  const options = (key) => findAll(byId(tree, `col-${key}`), (n) => n.tag === 'option').map(textOf);
  assert.deepEqual(options('orderId'), ['Choose a column', 'A: Ref', 'B: Evidence', 'C: Buyer']);
  assert.deepEqual([options('reviewShot')[0], options('status')[0]], ['Not in this file', 'A new column after the last one']);
  assert.deepEqual([byId(tree, 'col-orderId').attrs.value, byId(tree, 'col-reviewer').attrs.value, byId(tree, 'col-reviewShot').attrs.value], ['1', '3', ''], 'what the server found, chosen already');
  assert.equal(textOf(byId(tree, 'results-go')), 'In the checked Excel file, the Status goes in a new column headed "Status", the Type goes in a new column headed "Type" and the Note goes in a new column headed "Note". New columns go after the last one.');
  assert.equal(textOf(findAll(byId(tree, 'sheet'), (n) => n.tag === 'p' && /choose the columns/.test(textOf(n)))[0]), 'odd names.xlsx: choose the columns below.');
  assert.equal(textOf(byId(tree, 'rows-waiting')), 'The rows of "odd names.xlsx" show here once its columns are chosen above. Cancel brings back the rows shown before.');
  assert.equal(byId(tree, 'rows-table'), null, "the old file's rows are not shown meanwhile");
  assert.equal(byId(tree, 'about-file'), null);
  byId(tree, 'col-reviewShot').attrs.onchange({ target: { value: '2' } });
  refuse = true;
  byId(s.page(), 'use-columns').attrs.onclick();
  await settle();
  assert.match(textOf(byId(s.page(), 'columns')), /One column cannot hold two things: Order ID and Review screenshot\./, 'said under the chooser, which stays');
  refuse = false;
  byId(s.page(), 'use-columns').attrs.onclick();
  await settle();
  const posts = s.local.calls.filter((c) => c.method === 'POST');
  assert.equal(posts.length, 3);
  assert.equal(posts[2].form.get('file').name, 'odd names.xlsx', 'the same file again');
  assert.deepEqual(JSON.parse(posts[2].form.get('mapping')), { ...NEED.columns.mapping, reviewShot: 2 });
  assert.equal(posts[2].form.get('tab'), null);
  assert.deepEqual([byId(s.page(), 'columns'), textOf(byId(s.page(), 'rows-count'))], [null, '3 rows']);
  // A tab chosen first is sent again with the columns.
  const t = await opened(fakeLocal({ answer: (fd) => (fd.get('mapping') ? UPLOADED : fd.get('tab') ? NEED : CHOOSE) }));
  await choose(t, aFile('two tabs.xlsx'));
  byId(t.page(), 'tab-1').attrs.onclick();
  await settle();
  assert.equal(textOf(findAll(byId(t.page(), 'drop'), (n) => n.tag === 'p')[1]), 'Choose the columns below.');
  byId(t.page(), 'use-columns').attrs.onclick();
  await settle();
  assert.deepEqual(t.local.calls.filter((c) => c.method === 'POST').map((c) => [c.form.get('tab'), c.form.get('mapping') !== null]), [[null, false], ['Returns', false], ['Returns', true]]);
  // Cancel lets the file go, and the rows shown before come back.
  const c = await opened(fakeLocal({ saved: SAVED, answer: () => NEED }));
  await choose(c);
  byId(c.page(), 'cancel-file').attrs.onclick();
  assert.deepEqual([byId(c.page(), 'columns'), c.state.upload.file], [null, null]);
  assert.deepEqual(rowsOf(c.page()), TABLE);
});

test('a picture in the file that was not used is said under the upload line; a file uploaded before its columns could be found is asked for again', async () => {
  const unplaced = 'A picture over the "Reviewer Name" column, in Row 2, is not in the Order Screenshot, Delivery Screenshot, Review Screenshot or Review Link column, so it was not used.';
  const s = await opened(fakeLocal({ answer: () => ({ ...UPLOADED, unplaced: [unplaced] }) }));
  await choose(s);
  assert.deepEqual(findAll(byId(s.page(), 'unplaced'), (n) => n.tag === 'li').map(textOf), [unplaced]);
  const old = await opened(fakeLocal({ saved: { sheet: null, rows: [], uploadAgain: true } }));
  assert.equal(textOf(byId(old.page(), 'upload-again')), 'Upload the Flipkart file again. It was uploaded before the dashboard could find what each column holds, so its rows are not shown.');
  assert.equal(byId(old.page(), 'rows'), null);
  await choose(old);
  assert.equal(byId(old.page(), 'upload-again'), null);
  assert.deepEqual(rowsOf(old.page()), TABLE);
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
  const s = await opened(fakeLocal({ answer: (fd) => (fd.get('tab') ? UPLOADED : CHOOSE) }));
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
  assert.deepEqual(rowsOf(reloaded.page()), TABLE, 'the column names and the 3 rows');
  assert.deepEqual(findAll(byId(reloaded.page(), 'about-file'), (n) => n.tag === 'li').map(textOf), ABOUT);
  assert.equal(byId(reloaded.page(), 'upload-done'), null, 'nothing was uploaded just now');
  const csv = await opened(fakeLocal({ saved: CSV_SAVED }));
  assert.equal(textOf(byId(csv.page(), 'sheet-line')), 'flipkart orders.csv, a CSV file with no tabs: 1 row.');
  const empty = await opened(fakeLocal({ saved: { ...SAVED, sheet: { ...SAVED.sheet, rowCount: 0 }, rows: [] } }));
  assert.equal(textOf(byId(empty.page(), 'no-rows')), 'This tab has column names but no rows under them.');
});

test("the Google login in the top bar is the Amazon screen's own: the same states, words and buttons, and the soft box under the bar; its buttons ask the Amazon screen's own routes, so logging in on either screen counts for both", async () => {
  // Exactly the Amazon screen's words: it is the same login, in the Live Amazon Browser.
  assert.deepEqual(Object.keys(GOOGLE_WORDS), Object.keys(AMAZON_GOOGLE_WORDS));
  for (const [key, words] of Object.entries(AMAZON_GOOGLE_WORDS)) {
    if (typeof words === 'function') for (const name of ['Test Person', null]) assert.equal(GOOGLE_WORDS[key](name), words(name), key);
    else assert.equal(GOOGLE_WORDS[key], words, key);
  }
  assert.match(GOOGLE_WORDS.outHow, /Live Amazon Browser/);
  assert.equal(LOGIN_POLL_MS, AMAZON_LOGIN_POLL_MS, 'the top bar asks every 2 seconds, as on Amazon');
  const bar = (s) => s.ctx && flipkart.bar(s.ctx);
  const line = (s) => textOf(byId(bar(s), 'google-line'));
  const help = (s) => findAll(byId(bar(s), 'google-help'), (n) => n.tag === 'p').map(textOf);
  const buttons = (s) => findAll(byId(bar(s), 'google-account'), (n) => n.tag === 'button').map((b) => [b.attrs['data-id'], textOf(b)]);
  // Checking, before the server has answered.
  const first = screen(flipkart);
  assert.equal(line(first), 'Checking the Google login…');
  assert.deepEqual([buttons(first), byId(bar(first), 'google-help')], [[], null]);
  // Not logged in: "Log in to Google", which says what it does when the mouse rests on it.
  let pressed = [];
  const s = await opened(fakeLocal({ press: async (path) => (pressed.push(path), { state: 'waiting', name: null, says: null, chrome: false }) }));
  assert.deepEqual([line(s), buttons(s)], ['Not logged in to Google', [['google-log-in', 'Log in to Google']]]);
  assert.equal(byId(bar(s), 'google-log-in').attrs.title, "Google's login page opens in the Live Amazon Browser window, for you to log in there by hand. The screenshots on Google Drive are downloaded through that login.");
  assert.deepEqual(findAll(bar(s), (n) => n.attrs?.['data-id'] === 'market').length, 1, 'the marketplace tabs come first');
  byId(bar(s), 'google-log-in').attrs.onclick();
  await settle();
  assert.deepEqual(pressed, ['/local/amazon/google/log-in'], "the Amazon screen's own route, which opens Google's login page in the Live Amazon Browser");
  assert.deepEqual(s.local.calls.at(-1), { method: 'POST', path: '/local/amazon/google/log-in', body: {} });
  assert.deepEqual(s.ctx.state.account.data, { google: { state: 'waiting', name: null, says: null, chrome: false } }, "only the Google login of the Amazon route's answer is kept, never the Amazon login");
  assert.equal(byId(bar(s), 'account-line'), null, 'no Amazon login line');
  // Waiting: what to do, in a soft box under the bar, and the normal Chrome window offered.
  assert.equal(line(s), 'Waiting for you to log in to Google');
  assert.deepEqual(help(s), ['Log in to Google in the Live Amazon Browser window. This tool never types, stores or reads a password; Chrome keeps the login, so it stays after a restart.', 'If Google will not let you log in there, use a normal Chrome window instead: Log in to Google in a normal Chrome window']);
  assert.equal(byId(bar(s), 'google-log-in-in-chrome').attrs.title, "For when Google will not let you log in inside the Live Amazon Browser window: the dashboard closes that window, opens a normal Chrome window with the same saved profile on Google's login page, and you log in there.");
  // The normal Chrome window open: "I have logged in".
  s.local.google = { state: 'waiting', name: null, says: null, chrome: true };
  s.timers?.[0]?.fn?.();
  await flipkart.enter(s.ctx);
  await settle();
  assert.deepEqual([buttons(s), help(s)], [[['google-logged-in', 'I have logged in']], ['Log in to Google in the normal Chrome window that just opened (it uses the same saved profile, so the login is kept), then press "I have logged in".']]);
  // Logged in, with the name Google showed; and a problem, said plainly, with its two buttons.
  s.local.google = { state: 'in', name: 'Test Person', says: null, chrome: false };
  await flipkart.enter(s.ctx);
  await settle();
  assert.deepEqual([line(s), buttons(s), byId(bar(s), 'google-help')], ['Logged in to Google as Test Person', [], null]);
  s.local.google = { state: 'problem', name: null, says: 'Google showed a robot check in the Live Amazon Browser window, so the Google login could not be checked. This dashboard never answers a robot check. Press "Check the Google login again" when you want to try again.', chrome: false };
  await flipkart.enter(s.ctx);
  await settle();
  assert.equal(line(s), 'The Google login could not be checked');
  assert.deepEqual(buttons(s), [['google-check-login', 'Check the Google login again'], ['google-log-in-in-chrome', 'Log in to Google in a normal Chrome window']]);
  assert.deepEqual(help(s), [s.local.google.says]);
  // The server could not be asked: said under the bar, as the Amazon login line says it.
  const lost = await opened({ ...fakeLocal(), api: async () => { throw new ApiError(500, 'Something went wrong on this computer.'); } });
  assert.match(textOf(byId(bar(lost), 'google-help')), /Something went wrong on this computer\./);
});

/** A row's page as the server shows it: the row, with each picture kept or why it could not be had (in the Amazon words). */
const PICTURED = {
  ...SAVED.rows[0],
  shots: {
    order: { ...SAVED.rows[0].shots.order, pictures: [{ i: 0, ok: true, type: 'image/png', at: '2026-10-12T12:30:00.000Z', link: ORDER_SHOT }] },
    delivery: { ...SAVED.rows[0].shots.delivery, pictures: [{ i: 0, ok: false, link: DELIVERY_SHOT, problem: { kind: 'drive', site: 'Google Drive', says: 'the Google account logged in to the dashboard has no access to the file' } }] },
    review: { ...SAVED.rows[0].shots.review, pictures: [] },
    reviewShot: { ...SAVED.rows[0].shots.reviewShot, pictures: [{ i: 0, ok: true, type: 'image/png', at: '2026-10-12T12:00:00.000Z', link: null }] },
  },
};
/** A check's steps as the server keeps them: the screenshots opened (one could not be had), every other step coming in a later step. */
const STEPS_DONE = STEP_NAMES.map((name, i) => ({ n: i + 1, name, state: i === 0 || i === 4 ? 'pass' : i === 2 ? 'fail' : 'later', detail: ['Opened the purchase screenshot.', null, 'The delivery screenshot is on Google Drive, but the Google account logged in to the dashboard has no access to the file.', null, 'Opened the review screenshot.'][i] ?? null }));
const LAST_CHECK = { checkId: 'c20261012123000abcdef', startedAt: '2026-10-12T12:29:58.000Z', finishedAt: '2026-10-12T12:30:00.000Z', seconds: 2, steps: STEPS_DONE };
const stepsOf = (tree) => findAll(byId(tree, 'activity'), (n) => n.tag === 'li');
/** A screen showing one row's page. */
async function rowScreen(local, id = 'r000000000001') {
  const s = screen(flipkart, local);
  s.ctx.route = id;
  await flipkart.enter(s.ctx);
  await settle();
  return s;
}

test('each row has a Check button at its end, as on Amazon: it opens the row\'s page and checks the row; clicking a row opens its page', async () => {
  const s = await opened(fakeLocal({ saved: SAVED }));
  assert.equal(byId(s.page(), 'row-2').attrs.class, 'clickable');
  byId(s.page(), 'row-2').attrs.onclick();
  assert.deepEqual(s.went, ['flipkart/r000000000002'], "a row clicked opens its page: #/flipkart/<the row's id>");
  const button = byId(s.page(), 'check-r000000000001');
  assert.equal(textOf(button), 'Check');
  button.attrs.onclick({ stopPropagation() {} });
  await settle();
  assert.equal(s.went.at(-1), 'flipkart/r000000000001');
  assert.deepEqual(s.local.calls.filter((c) => c.stream), [{ method: 'POST', path: '/local/flipkart/rows/r000000000001/check', body: {}, stream: true }]);
});

test("a row's page, as on Amazon: its details from the sheet, its screenshots as small pictures that open large when clicked, why one could not be had in the Amazon words, and its last check's steps after a reload", async () => {
  const s = await rowScreen(fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: LAST_CHECK } } }));
  const page = s.page();
  assert.equal(textOf(byId(page, 'back')), 'All rows');
  assert.equal(textOf(findAll(page, (n) => n.tag === 'h1')[0]), 'Row 1: order ID OD100000000000000002');
  assert.deepEqual([textOf(byId(page, 'check')), textOf(byId(page, 'final-word')), textOf(byId(page, 'final-says'))], ['Check', FINAL_NONE, 'Not checked yet.'], 'no Status: Not checked yet');
  assert.equal(textOf(byId(page, 'card-result')), 'Type and NoteNot checked yet.');
  const details = byId(page, 'row-details');
  assert.match(textOf(details), /Delivery ScreenshotGoogle Drive\. Not opened, because the Google account logged in to the dashboard has no access to the file\./);
  const thumbs = findAll(details, (n) => n.tag === 'button');
  assert.deepEqual(thumbs.map((b) => b.attrs['data-id']), ['row-thumb-order-r000000000001-0', 'row-thumb-reviewShot-r000000000001-0'], 'the pictures kept; the one that could not be had has none');
  assert.deepEqual(findAll(details, (n) => n.attrs?.class === 'label').map(textOf), ['Order Screenshot', 'Review Screenshot'], "under the file's own column names");
  assert.deepEqual(findAll(details, (n) => n.tag === 'img').map((i) => i.attrs.src), ['blob:/local/flipkart/rows/r000000000001/small/order/0', 'blob:/local/flipkart/rows/r000000000001/small/reviewShot/0']);
  thumbs[0].attrs.onclick({ stopPropagation() {} });
  await settle();
  const big = byId(s.page(), 'big');
  assert.deepEqual([big.attrs['aria-label'], byId(big, 'big-img').attrs.src], ['Purchase screenshot of Row 1', 'blob:/local/flipkart/rows/r000000000001/picture/order/0'], 'opened large');
  byId(big, 'close-big').attrs.onclick();
  assert.deepEqual([byId(s.page(), 'big'), s.local.revoked.includes('blob:/local/flipkart/rows/r000000000001/picture/order/0')], [null, true]);
  assert.deepEqual(stepsOf(s.page()).map(textOf), [
    '✓1. Opening the purchase screenshot passedOpened the purchase screenshot.',
    '–2. Reading the purchase screenshot and comparing it with the sheet comes in a later step',
    '✗3. Opening the delivery screenshot failedThe delivery screenshot is on Google Drive, but the Google account logged in to the dashboard has no access to the file.',
    '–4. Reading the delivery screenshot and comparing it comes in a later step',
    '✓5. Opening the review screenshot passedOpened the review screenshot.',
    "–6. Reading the reviewer's name and the review's words comes in a later step",
    "–7. Finding the review among Flipkart's public reviews comes in a later step",
    "–8. Comparing the reviewer's name and the review's words comes in a later step",
    '–9. Status, Type and Note comes in a later step',
  ]);
  assert.equal(textOf(byId(s.page(), 'current-action')), `Last check finished ${words.ist(LAST_CHECK.finishedAt)}.`);
  // The same marks and words as on Amazon, and one more for a step that comes in a later step.
  for (const [k, m] of Object.entries(AMAZON_MARKS)) assert.deepEqual(MARKS[k], m, k);
  assert.deepEqual(MARKS.later, { mark: '–', label: 'comes in a later step', tone: 'quiet' });
  byId(s.page(), 'back').attrs.onclick();
  assert.deepEqual(s.went, ['flipkart']);
  const gone = await rowScreen(fakeLocal({ saved: SAVED }), 'r000000000009');
  assert.match(textOf(gone.page()), /All rowsNo row has that id\./);
});

test("Check on a row's page: each step shown live as it runs, with the same marks and words as on Amazon; Stop; a pause says what to do; the row stays Not checked yet", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const local = fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: null } } });
  local.checking = async (onEvent) => {
    onEvent({ event: 'started', checkId: 'c20261012123000abcdef', steps: STEP_NAMES, rowId: 'r000000000001', row: 2, name: 'Row 1' });
    onEvent({ event: 'step', step: { n: 1, name: STEP_NAMES[0], state: 'running', detail: null } });
    onEvent({ event: 'action', says: 'Opening the purchase screenshot' });
    await gate;
    for (const st of STEPS_DONE) onEvent({ event: 'step', step: st });
    onEvent({ event: 'done', result: LAST_CHECK });
    return { ok: true };
  };
  const s = await rowScreen(local);
  assert.equal(textOf(stepsOf(s.page())[0]), '·1. Opening the purchase screenshot waiting', 'before any check, every step is waiting');
  byId(s.page(), 'check').attrs.onclick();
  await settle();
  let page = s.page();
  assert.deepEqual([textOf(byId(page, 'check')), byId(page, 'check').attrs.disabled, textOf(byId(page, 'stop'))], ['Checking…', true, 'Stop']);
  assert.deepEqual([textOf(byId(page, 'final-word')), textOf(byId(page, 'final-says')), textOf(byId(page, 'current-action'))], ['Checking…', 'This row is being checked now.', 'Opening the purchase screenshot']);
  assert.equal(textOf(stepsOf(page)[0]), '…1. Opening the purchase screenshot running', 'shown live, as it runs');
  release();
  await settle();
  page = s.page();
  assert.deepEqual(stepsOf(page).map((li) => li.attrs.class), ['fk-step fk-step-good', 'fk-step', 'fk-step fk-step-bad', 'fk-step', 'fk-step fk-step-good', 'fk-step', 'fk-step', 'fk-step', 'fk-step']);
  assert.deepEqual([textOf(byId(page, 'final-word')), byId(page, 'stop'), textOf(byId(page, 'check'))], [FINAL_NONE, null, 'Check'], 'no Status: the row stays Not checked yet');
  assert.ok(local.calls.filter((c) => c.path === '/local/flipkart/rows/r000000000001').length >= 2 && local.calls.filter((c) => c.path === '/local/flipkart/sheet').length >= 2, 'the page and the table are fetched again, to show what was kept');
  local.checking = async (onEvent) => {
    onEvent({ event: 'paused', kind: 'google-out', says: 'No one is logged in to Google, so the screenshots on Google Drive cannot be downloaded. Press "Log in to Google" in the top bar and log in there, then press Check.' });
    return { ok: true };
  };
  byId(s.page(), 'check').attrs.onclick();
  await settle();
  assert.match(textOf(s.page()), /The check paused, and nothing was saved for this row\. No one is logged in to Google, so the screenshots on Google Drive cannot be downloaded\. Press "Log in to Google" in the top bar and log in there, then press Check\./);
  local.checking = (onEvent, signal) => new Promise((resolve) => signal.addEventListener('abort', () => resolve({ ok: false, aborted: true })));
  byId(s.page(), 'check').attrs.onclick();
  await settle();
  byId(s.page(), 'stop').attrs.onclick();
  await settle();
  assert.match(textOf(s.page()), /The check was stopped, and nothing was saved for it\. Press Check to check this row again\./);
  assert.equal(STEP_NAMES.length, 9);
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
  // Only Flipkart's own names; the only at-rules are for narrower windows and Flipkart's own fading in.
  for (const sel of selectors) assert.match(sel, /^(?:\.fk-|@media \(max-width: \d+px\)$|@keyframes fk-)/, `${sel}: only Flipkart's own names`);
  // Every state the screen draws: opening, no file, a file held over the page, uploading, tabs to choose, columns to choose, a file in, a link, a picture, a picture not used, no rows, an error, a file to upload again.
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
  const done = await opened(fakeLocal({ answer: () => ({ ...UPLOADED, unplaced: ['A picture over the "Reviewer Name" column, in Row 2, is not in the Order Screenshot column, so it was not used.'] }) }));
  await choose(done);
  add(done);
  const columns = await opened(fakeLocal({ saved: SAVED, answer: () => NEED }));
  await choose(columns);
  add(columns);
  add(await opened(fakeLocal({ saved: { ...SAVED, rows: [] } })));
  add(await opened(fakeLocal({ saved: { sheet: null, rows: [], uploadAgain: true } })));
  for (const google of [{ state: 'in', name: 'Test Person' }, { state: 'waiting', chrome: false }, { state: 'waiting', chrome: true }, { state: 'problem', says: 'Made-up problem.' }]) add(await opened(fakeLocal({ google })));
  // A row's page: its details with small pictures, one opened large, its last check's steps, and a check running.
  const pageLocal = fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: LAST_CHECK } } });
  const rowPage = await rowScreen(pageLocal);
  add(rowPage);
  byId(rowPage.page(), 'row-thumb-order-r000000000001-0').attrs.onclick({ stopPropagation() {} });
  await settle();
  add(rowPage);
  pageLocal.checking = (onEvent) => {
    onEvent({ event: 'step', step: { n: 1, name: STEP_NAMES[0], state: 'running', detail: null } });
    return new Promise(() => {});
  };
  byId(rowPage.page(), 'check').attrs.onclick();
  await settle();
  add(rowPage);
  for (const cls of used) {
    const from = cls.startsWith('fk-') ? css : shared;
    assert.match(from, new RegExp(`\\.${cls}\\b`), `${cls}: from ${cls.startsWith('fk-') ? 'views/flipkart.css' : 'styles.css'}`);
  }
  for (const cls of ['fk-drop', 'fk-drop-over', 'fk-slim', 'fk-choose-tab', 'fk-columns', 'fk-column-grid', 'fk-req', 'fk-opt', 'fk-about-file', 'fk-missing', 'fk-rows-table', 'fk-col-letter', 'fk-link-label', 'fk-nolink', 'fk-link-warning', 'fk-cell-words', 'fk-empty-cell', 'fk-empty-state', 'fk-status-cell', 'notice-warn', 'notice-error', 'icon-spin']) assert.ok(used.has(cls), `${cls} is drawn in one of the states`);
  // The table and the column chooser look like the Amazon ones: each of their rules is the Amazon rule, under Flipkart's own name.
  const amazonCss = readFileSync(join(ROOT, 'views', 'amazon.css'), 'utf8');
  const rule = (src, sel) => src.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1]?.trim() ?? null;
  for (const [mine, theirs] of [['.fk-account', '.account'], ['.fk-account-line', '.account-line'], ['.fk-account-line .icon', '.account-line .icon'], ['.fk-account-in .fk-account-line', '.account-in .account-line'], ['.fk-account-out .fk-account-line', '.account-out .account-line'], ['.fk-account-waiting .fk-account-line', '.account-waiting .account-line'], ['.fk-account-problem .fk-account-line', '.account-problem .account-line'], ['.fk-bar-help', '.bar-help'], ['.fk-bar-help .notice', '.bar-help .notice'], ['.fk-bar-offer', '.bar-offer']]) {
    assert.ok(rule(amazonCss, theirs), `${theirs} is an Amazon rule`);
    assert.equal(rule(css, mine), rule(amazonCss, theirs), `${mine} is the same as ${theirs}`);
  }
  for (const cls of ['fk-account', 'fk-account-in', 'fk-account-out', 'fk-account-waiting', 'fk-account-problem', 'fk-account-line', 'fk-bar-help', 'fk-bar-offer']) assert.ok(used.has(cls), `${cls} is drawn in one of the states`);
  // A row's page looks like the Amazon one: each of its rules is the Amazon rule, under Flipkart's own names.
  for (const [mine, theirs] of [
    ['.fk-rows-table tbody tr.clickable:hover > td', '.rows-table tbody tr.clickable:hover > td'],
    ['.fk-row-head', '.row-head'], ['.fk-row-title', '.row-title'], ['.fk-row-head .actions', '.row-head .actions'], ['.fk-back', '.back'],
    ['.fk-final-banner', '.final-banner'], ['.fk-final-big', '.final-big'], ['.fk-final-big .icon', '.final-big .icon'], ['.fk-final-banner-none .fk-final-big', '.final-banner-none .final-big'], ['.fk-final-says', '.final-says'],
    ['.fk-page', '.amazon-page'], ['.fk-left, .fk-right', '.amazon-left, .amazon-right'], ['.fk-right', '.amazon-right'], ['.fk-page h3', '.amazon-page h3'],
    ['.fk-result-card .fk-row-status', '.result-card .row-status'], ['.fk-note-text', '.note-text'], ['.fk-user-shots', '.user-shots'], ['.fk-user-shot .label', '.user-shot .label'],
    ['.fk-thumb', '.thumb'], ['.fk-thumb:hover', '.thumb:hover'], ['.fk-thumb img', '.thumb img'], ['.fk-thumb-large', '.thumb-large'], ['.fk-missing-word', '.missing-word'],
    ['.fk-live h3, .fk-steps h3', '.live h3, .steps h3'], ['.fk-action', '.action'], ['.fk-live-empty', '.live-empty'], ['.fk-activity', '.activity'], ['.fk-step', '.step'], ['.fk-step-mark', '.step-mark'],
    ['.fk-step-good .fk-step-mark', '.step-good .step-mark'], ['.fk-step-bad .fk-step-mark', '.step-bad .step-mark'], ['.fk-step-info .fk-step-mark', '.step-info .step-mark'],
    ['.fk-step-body', '.step-body'], ['.fk-step-name', '.step-name'], ['.fk-step-state', '.step-state'], ['.fk-step-detail', '.step-detail'],
    ['.fk-big-inner', '.big-inner'], ['.fk-big-inner figcaption', '.big-inner figcaption'], ['.fk-big-inner img', '.big-inner img'], ['@keyframes fk-fade-in', '@keyframes fade-in'],
  ]) {
    assert.ok(rule(amazonCss, theirs), `${theirs} is an Amazon rule`);
    assert.equal(rule(css, mine), rule(amazonCss, theirs), `${mine} is the same as ${theirs}`);
  }
  assert.equal(rule(css, '.fk-big'), rule(amazonCss, '.big').replace('fade-in', 'fk-fade-in'), 'the enlarged picture, fading in the same way');
  const narrow = (src) => src.match(/@media \(max-width: 1000px\) \{([^]*?)\n\}/)?.[1] ?? null;
  assert.equal(narrow(css), narrow(amazonCss).replaceAll('.amazon-page', '.fk-page').replaceAll('.amazon-right', '.fk-right'), 'in a narrow window, one column, as on Amazon');
  for (const cls of ['clickable', 'linkish', 'fk-row-head', 'fk-row-title', 'fk-back', 'fk-final-banner', 'fk-final-banner-none', 'fk-final-big', 'fk-final-says', 'fk-page', 'fk-left', 'fk-right', 'fk-result-card', 'fk-user-shots', 'fk-user-shot', 'fk-thumb', 'fk-thumb-large', 'fk-missing-word', 'fk-live', 'fk-action', 'fk-live-empty', 'fk-steps', 'fk-activity', 'fk-step', 'fk-step-good', 'fk-step-bad', 'fk-step-info', 'fk-step-mark', 'fk-step-body', 'fk-step-name', 'fk-step-state', 'fk-step-detail', 'fk-big', 'fk-big-inner']) assert.ok(used.has(cls), `${cls} is drawn in one of the states`);
  for (const name of ['about-file', 'columns', 'column-grid', 'req', 'opt', 'col-letter', 'row-cell', 'strong-cell', 'product-cell', 'status-cell', 'type-cell', 'note-cell', 'cell-words', 'link-cell', 'other-cell', 'link-label', 'nolink', 'link-warning', 'empty-cell', 'empty-state', 'rows-wrap', 'rows-count']) {
    assert.ok(rule(amazonCss, `.${name}`), `.${name} is an Amazon rule`);
    assert.equal(rule(css, `.fk-${name}`), rule(amazonCss, `.${name}`), `.fk-${name} is the same as .${name}`);
  }
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.deepEqual([...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]), ['styles.css', 'views/amazon.css', 'views/flipkart.css']);
});
