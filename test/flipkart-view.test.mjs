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
import flipkart, { SHEET_ACCEPT, GOOGLE_WORDS, LOGIN_POLL_MS, STEP_NAMES, MARKS, FINAL_NONE, STOPPED_SAYS } from '../views/flipkart.js';
import amazon, { GOOGLE_WORDS as AMAZON_GOOGLE_WORDS, LOGIN_POLL_MS as AMAZON_LOGIN_POLL_MS, MARKS as AMAZON_MARKS } from '../views/amazon.js';
import { TYPE_WORDS } from '../flipkart/final.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};
const classesOf = (tree) => findAll(tree, () => true).flatMap((n) => String(n.attrs?.class ?? '').split(/\s+/)).filter(Boolean);
/** A choice in the Download menu, beside the main buttons. */
const inMenu = (n) => String(n.attrs?.['data-id'] ?? '').startsWith('download-');

const ORDER_SHOT = 'https://drive.google.com/open?id=1TestFlipkartOrder02abcd';
const DELIVERY_SHOT = 'https://drive.google.com/open?id=1TestFlipkartDelivery02ab';
const REVIEW_SHOT = 'https://drive.google.com/open?id=1TestFlipkartReview03abcd';
const REVIEW_LINK = 'https://www.flipkart.com/reviews/TESTPID0000002:3?reviewId=0a1b2c3d-0000-4000-8000-000000000002';
const NONE = { sheet: null, rows: [] };
/** Every Type, as the server sends them with the rows: the Amazon screen's own, in its order. */
const TYPES = Object.entries(TYPE_WORDS).map(([key, word]) => ({ key, word }));
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

function fakeLocal({ saved = NONE, answer = () => UPLOADED, google = GOOGLE_OUT, press = null, pages = {}, staff = null, emails = {}, file = null } = {}) {
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
      // "Prepare email": the email the server fills in for a row, or its refusal.
      const mail = /^\/local\/flipkart\/rows\/([^/]+)\/email$/.exec(path);
      if (method === 'GET' && mail) {
        if (!emails[mail[1]]) throw new ApiError(400, 'Row 1 has no email: its Type has none, or it is not checked yet.');
        return { email: structuredClone(await emails[mail[1]]) };
      }
      if (method === 'GET' && path === '/local/flipkart/sheet') return structuredClone(saved);
      if (method === 'GET' && path === '/local/flipkart/campaigns') return { campaigns: [], reading: false };
      if (method === 'GET' && path === '/local/flipkart/account') return structuredClone({ google: local.google });
      // The Google login's buttons are the Amazon screen's own routes, which answer with the Amazon screen's whole top bar.
      if (method === 'POST' && path.startsWith('/local/amazon/google/')) {
        if (press) local.google = await press(path);
        return structuredClone({ state: 'in', name: 'Amazon Person', loggedIn: true, google: local.google, hindi: true, english: true, browserOpen: true, running: null });
      }
      // A row's result changed or marked right by a staff member (…/result, …/right): what the test's server answers.
      if (method === 'POST' && staff && /^\/local\/flipkart\/rows\/[^/]+\/(?:result|right)$/.test(path)) return structuredClone(await staff(path, body));
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
    // "The checked Excel file": what the test's server answers.
    blob: async (path) => {
      calls.push({ method: 'GET', path, blob: true });
      if (!file) throw new ApiError(404, 'Not found.');
      return file(path);
    },
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

test('as on Amazon: each link a small label saying where it goes, opening in a new tab; a link that is not a web link opens nothing; a picture in a cell or over it said so; Status, Type and Note empty; a Check button at the end of each row; "Start checking" above the table, beside the Status cards', async () => {
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
  assert.deepEqual(findAll(page, (n) => n.tag === 'button' && /^(Check|Check again)$/.test(textOf(n))).map((n) => n.attrs['data-id']), ['check-r000000000001', 'check-r000000000002', 'check-r000000000003'], 'a Check button for each row');
  assert.deepEqual(findAll(byId(page, 'main-actions'), (n) => n.tag === 'button' && !inMenu(n)).map(textOf), ['Start checking', 'Check every row again'], 'above the table, as on Amazon');
  assert.deepEqual([findAll(byId(page, 'main-actions'), (n) => n.tag === 'details').map((n) => n.attrs['data-id']), textOf(findAll(byId(page, 'download'), (n) => n.tag === 'summary')[0])], [['download'], 'Download'], 'then the Download button, as on Amazon');
  assert.deepEqual(findAll(byId(page, 'counts'), (n) => n.tag === 'button').map(textOf), ['Pass0', 'Fail0', 'Needs Manual Staff Checking0', 'Not checked yet3'], 'beside them, the four Status cards, as on Amazon');
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
/** What a purchase screenshot says, as the server keeps it with the row's last check (step 2). */
const ORDER_READ = {
  ok: true,
  problem: null,
  confidence: 88,
  wordCount: 66,
  hindi: true,
  orderIds: ['OD100000000000000002'],
  dates: ['20-07, with no year shown'],
  amounts: [{ text: '₹999', value: 999, label: 'listing price', skip: false }, { text: '₹329', value: 329, label: 'selling price', skip: false }, { text: '₹30', value: 30, label: 'total fees', skip: true }, { text: '₹349', value: 349, label: 'total amount', skip: false }],
  product: 'Test Brand Steel Bottle 1 L, Blue',
  productShare: 1,
  text: 'Order #OD100000000000000002\nTotal amount ₹349',
  details: { orderId: { state: 'same', shown: 'OD100000000000000002' }, orderDate: { state: 'skip' }, amount: { state: 'same', shown: '₹349', label: 'the total amount', how: 'same', parts: [] }, product: { state: 'same', shown: 'Test Brand Steel Bottle 1 L, Blue', share: 1 } },
};
/** What a delivery screenshot says, as the server keeps it with the row's last check (step 4). */
const DELIVERY_READ = {
  ok: true,
  problem: null,
  confidence: 91,
  wordCount: 40,
  hindi: true,
  orderIds: ['OD100000000000000002'],
  dates: [],
  amounts: [],
  product: 'Test Brand Steel Bottle 1 L, Blue',
  productShare: 1,
  text: 'Delivered, Thu 23rd Jul\nOrder #OD100000000000000002',
  details: { orderId: { state: 'same', shown: 'OD100000000000000002' }, orderDate: { state: 'skip' }, amount: { state: 'not shown' }, product: { state: 'same', shown: 'Test Brand Steel Bottle 1 L, Blue', share: 1 } },
  delivered: true,
  deliveredText: 'Delivered, Thu 23rd Jul',
  notDelivered: null,
};
/** The comparison table, as the server keeps it with the row's last check: the sheet and the two screenshots side by side. */
const COMPARISON = [
  { field: 'Order ID', sheet: 'OD100000000000000002', order: 'The same: OD100000000000000002', delivery: 'The same: OD100000000000000002', result: 'The same on both screenshots.', ok: true },
  { field: 'Amount', sheet: '349', order: 'The same: ₹349, the total amount', delivery: 'Not shown', result: 'The same on the purchase screenshot.', ok: true },
  { field: 'Product', sheet: 'Test Brand Steel Bottle', order: 'The same: "Test Brand Steel Bottle 1 L, Blue"', delivery: 'Not shown', result: 'The same on the purchase screenshot; not shown on the delivery screenshot.', ok: null },
  { field: 'Delivered', sheet: '', order: '', delivery: 'Delivered, Thu 23rd Jul', result: 'The delivery screenshot says Delivered.', ok: true },
];
const LAST_CHECK_READ = { ...LAST_CHECK, order: ORDER_READ, delivery: DELIVERY_READ, shotsHad: ['order', 'delivery'], comparison: COMPARISON };
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

test('a row\'s page shows what the purchase screenshot says, as on Amazon ("Read from the purchase screenshot"): after a reload, and live as soon as it is read; with no purchase screenshot column, no card', async () => {
  const card = (tree) => byId(tree, 'card-order');
  const fields = (tree) => findAll(card(tree), (n) => n.tag === 'div' && n.attrs?.class === 'field-row').map((n) => [textOf(findAll(n, (x) => x.tag === 'dt')[0]), textOf(findAll(n, (x) => x.tag === 'dd')[0])]);
  const s = await rowScreen(fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: LAST_CHECK_READ } } }));
  assert.equal(textOf(findAll(card(s.page()), (n) => n.tag === 'h3')[0]), 'Read from the purchase screenshot');
  assert.deepEqual(fields(s.page()), [
    ['Order IDs', 'OD100000000000000002'],
    ['Dates', '20-07, with no year shown'],
    ['Amounts', '₹999 (listing price), ₹329 (selling price), ₹30 (total fees), ₹349 (total amount)'],
    ['Product', 'Test Brand Steel Bottle 1 L, Blue'],
    ['Read by', 'Read on this computer, in English and Hindi: 66 words, read with 88 percent certainty.'],
  ]);
  const all = findAll(card(s.page()), (n) => n.tag === 'details')[0];
  assert.deepEqual([textOf(findAll(all, (n) => n.tag === 'summary')[0]), textOf(findAll(all, (n) => n.tag === 'pre')[0]), findAll(all, (n) => n.tag === 'pre')[0].attrs.class], ['Everything read from it', ORDER_READ.text, 'fk-ocr-text']);
  // The left side as on Amazon: the Type and Note, the details from the sheet, then what the purchase and delivery screenshots say.
  assert.deepEqual(findAll(byId(s.page(), 'row-page'), (n) => n.attrs?.class === 'fk-left')[0].children.filter(Boolean).map((n) => n.attrs['data-id']), ['card-result', 'row-details', 'card-order', 'card-delivery', 'card-review', 'card-flipkart']);
  // Not read: it says so; a picture whose words are not clear says why.
  const none = await rowScreen(fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: LAST_CHECK } } }));
  assert.equal(textOf(card(none.page())), 'Read from the purchase screenshotNot read yet.');
  const unclear = await rowScreen(fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: { ...LAST_CHECK, order: { ...ORDER_READ, ok: false, problem: 'its words are not clear enough to read', orderIds: [], dates: [], amounts: [], product: null, wordCount: 2, confidence: 31 } } } } }));
  assert.match(textOf(card(unclear.page())), /^Read from the purchase screenshotits words are not clear enough to readOrder IDsNone shownDatesNone shownAmountsNone shownProductNoneRead byRead on this computer, in English and Hindi: 2 words, read with 31 percent certainty\./);
  // Live: as soon as step 2 has read it, while the check goes on.
  let release;
  const gate = new Promise((r) => (release = r));
  const local = fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: null } } });
  local.checking = async (onEvent) => {
    onEvent({ event: 'started', checkId: 'c20261012123000abcdef', steps: STEP_NAMES, rowId: 'r000000000001', row: 2, name: 'Row 1' });
    onEvent({ event: 'step', step: { n: 2, name: STEP_NAMES[1], state: 'pass', detail: 'Order ID: the same.' }, partial: { order: ORDER_READ } });
    await gate;
    onEvent({ event: 'done', result: LAST_CHECK_READ });
    return { ok: true };
  };
  const live = await rowScreen(local);
  assert.equal(textOf(card(live.page())), 'Read from the purchase screenshotNot read yet.');
  byId(live.page(), 'check').attrs.onclick();
  await settle();
  assert.deepEqual(fields(live.page())[0], ['Order IDs', 'OD100000000000000002'], 'shown at once, while the check runs');
  release();
  await settle();
  // A file with no purchase screenshot column has no card, as on Amazon.
  const noColumn = { ...SAVED, sheet: { ...SAVED.sheet, mapping: { ...SAVED.sheet.mapping, orderShot: null } } };
  assert.equal(card((await rowScreen(fakeLocal({ saved: noColumn, pages: { r000000000001: { row: PICTURED, result: LAST_CHECK_READ } } }))).page()), null);
});

test('a row\'s page shows what the delivery screenshot says ("Read from the delivery screenshot") and the comparison table, the sheet and the two screenshots side by side, as on Amazon: after a reload, and live; with no delivery screenshot column, no card for it', async () => {
  const card = (tree) => byId(tree, 'card-delivery');
  const fields = (tree) => findAll(card(tree), (n) => n.tag === 'div' && n.attrs?.class === 'field-row').map((n) => [textOf(findAll(n, (x) => x.tag === 'dt')[0]), textOf(findAll(n, (x) => x.tag === 'dd')[0])]);
  const table = (tree) => byId(tree, 'card-comparison');
  const head = (tree) => findAll(table(tree), (n) => n.tag === 'th' && n.attrs?.scope === 'col').map(textOf);
  const rows = (tree) => findAll(table(tree), (n) => n.tag === 'tr').slice(1);
  const s = await rowScreen(fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: LAST_CHECK_READ } } }));
  assert.equal(textOf(findAll(card(s.page()), (n) => n.tag === 'h3')[0]), 'Read from the delivery screenshot');
  assert.deepEqual(fields(s.page()), [
    ['Delivered', 'Delivered, Thu 23rd Jul'],
    ['Order IDs', 'OD100000000000000002'],
    ['Order dates', 'None shown'],
    ['Amounts', 'None shown'],
    ['Product', 'Test Brand Steel Bottle 1 L, Blue'],
    ['Read by', 'Read on this computer, in English and Hindi: 40 words, read with 91 percent certainty.'],
  ]);
  const all = findAll(card(s.page()), (n) => n.tag === 'details')[0];
  assert.deepEqual([textOf(findAll(all, (n) => n.tag === 'summary')[0]), textOf(findAll(all, (n) => n.tag === 'pre')[0])], ['Everything read from it', DELIVERY_READ.text]);
  // The comparison table, under both sides of the page, as on Amazon: each detail's row, its result marked good, bad or quiet.
  assert.equal(textOf(findAll(table(s.page()), (n) => n.tag === 'h3')[0]), 'Comparison');
  assert.deepEqual(head(s.page()), ['Field', 'Sheet', 'Purchase screenshot', 'Delivery screenshot', 'Result']);
  assert.deepEqual(rows(s.page()).map((tr) => findAll(tr, (n) => n.tag === 'th' || n.tag === 'td').map(textOf)), COMPARISON.map((r) => [r.field, r.sheet, r.order, r.delivery, r.result]));
  assert.deepEqual(rows(s.page()).map((tr) => findAll(tr, (n) => n.tag === 'td').at(-1).attrs.class), ['wrap fk-result-cell tone-good', 'wrap fk-result-cell tone-good', 'wrap fk-result-cell tone-quiet', 'wrap fk-result-cell tone-good']);
  assert.equal(findAll(table(s.page()), (n) => n.tag === 'table')[0].attrs.class, 'fk-comparison-table');
  const parts = byId(s.page(), 'row-page').children.filter(Boolean);
  assert.equal(parts.findIndex((n) => n.attrs?.['data-id'] === 'card-comparison'), parts.findIndex((n) => n.attrs?.class === 'fk-page') + 1, 'right under the two sides');
  // Not read, not delivered, and only the screenshots the file has.
  const none = await rowScreen(fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: LAST_CHECK } } }));
  assert.deepEqual([textOf(card(none.page())), textOf(table(none.page()))], ['Read from the delivery screenshotNot read yet.', 'ComparisonThe comparison appears when a check finishes.']);
  const notDelivered = await rowScreen(fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: { ...LAST_CHECK_READ, delivery: { ...DELIVERY_READ, delivered: false, deliveredText: null, notDelivered: 'Cancelled' } } } } }));
  assert.deepEqual(fields(notDelivered.page())[0], ['Delivered', 'Not shown']);
  const purchaseOnly = await rowScreen(fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: { ...LAST_CHECK_READ, shotsHad: ['order'] } } } }));
  assert.deepEqual(head(purchaseOnly.page()), ['Field', 'Sheet', 'Purchase screenshot', 'Result']);
  // Live: what the delivery screenshot says as soon as step 4 has read it; the table once the check has finished.
  let release;
  const gate = new Promise((r) => (release = r));
  const local = fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: null } } });
  local.checking = async (onEvent) => {
    onEvent({ event: 'started', checkId: 'c20261012123000abcdef', steps: STEP_NAMES, rowId: 'r000000000001', row: 2, name: 'Row 1' });
    onEvent({ event: 'step', step: { n: 4, name: STEP_NAMES[3], state: 'pass', detail: 'It says "Delivered, Thu 23rd Jul".' }, partial: { order: ORDER_READ, delivery: DELIVERY_READ } });
    await gate;
    onEvent({ event: 'done', result: LAST_CHECK_READ });
    return { ok: true };
  };
  const live = await rowScreen(local);
  byId(live.page(), 'check').attrs.onclick();
  await settle();
  assert.deepEqual([fields(live.page())[0], textOf(table(live.page()))], [['Delivered', 'Delivered, Thu 23rd Jul'], 'ComparisonThe comparison appears when a check finishes.'], 'shown at once, while the check runs');
  release();
  await settle();
  // A file with no delivery screenshot column has no card for it, as on Amazon.
  const noColumn = { ...SAVED, sheet: { ...SAVED.sheet, mapping: { ...SAVED.sheet.mapping, deliveryShot: null } } };
  assert.equal(card((await rowScreen(fakeLocal({ saved: noColumn, pages: { r000000000001: { row: PICTURED, result: LAST_CHECK_READ } } }))).page()), null);
});

/** What the review screenshot says, as step 6 keeps it (check.js), made up. */
const REVIEW_READ = {
  ok: true,
  problem: null,
  confidence: 88,
  wordCount: 30,
  hindi: false,
  kind: 'written',
  stars: 5,
  title: 'Terrific purchase',
  body: 'Keeps water cold all day and the grip is good.',
  name: 'Test Reviewer One',
  dateText: '12 Sep, 2026',
  message: null,
  own: false,
  form: false,
  others: 1,
  why: null,
  text: 'Ratings and Reviews\n5.0 • Terrific purchase\nKeeps water cold all day and the grip is good.\nTest Reviewer One, Test City',
};

test('a row\'s page shows what the review screenshot says ("Read from the review screenshot"), as on Amazon: after a reload, and live; a part not read is "Not shown"; with no review screenshot or review link column, no card for it', async () => {
  const card = (tree) => byId(tree, 'card-review');
  const fields = (tree) => findAll(card(tree), (n) => n.tag === 'div' && n.attrs?.class === 'field-row').map((n) => [textOf(findAll(n, (x) => x.tag === 'dt')[0]), textOf(findAll(n, (x) => x.tag === 'dd')[0])]);
  const page = (result, saved = SAVED) => rowScreen(fakeLocal({ saved, pages: { r000000000001: { row: PICTURED, result } } }));
  const s = await page({ ...LAST_CHECK_READ, review: REVIEW_READ });
  assert.equal(textOf(findAll(card(s.page()), (n) => n.tag === 'h3')[0]), 'Read from the review screenshot');
  assert.deepEqual(fields(s.page()), [
    ['What it shows', 'A written review'],
    ['Stars', '5 of 5'],
    ['Title', 'Terrific purchase'],
    ['Written words', 'Keeps water cold all day and the grip is good.'],
    ["Reviewer's name", 'Test Reviewer One'],
    ['Date', '12 Sep, 2026'],
    ['Other reviews on it', '1'],
    ['Read by', 'Read on this computer, in English only: 30 words, read with 88 percent certainty.'],
  ]);
  const all = findAll(card(s.page()), (n) => n.tag === 'details')[0];
  assert.deepEqual([textOf(findAll(all, (n) => n.tag === 'summary')[0]), textOf(findAll(all, (n) => n.tag === 'pre')[0])], ['Everything read from it', REVIEW_READ.text]);
  // Not certain: every part not read is "Not shown", and why is said; Flipkart's words for a review not accepted are shown as they are.
  const unsure = await page({ ...LAST_CHECK_READ, review: { ...REVIEW_READ, kind: 'unknown', stars: null, title: null, body: null, name: null, dateText: null, others: 0, why: 'it shows no review, no rating and no message from Flipkart' } });
  assert.deepEqual(fields(unsure.page()).filter(([k]) => k !== 'Read by'), [['What it shows', 'Not certain'], ['Stars', 'Not shown'], ['Title', 'Not shown'], ['Written words', 'Not shown'], ["Reviewer's name", 'Not shown'], ['Date', 'Not shown'], ['Why not certain', 'it shows no review, no rating and no message from Flipkart']]);
  const refused = await page({ ...LAST_CHECK_READ, review: { ...REVIEW_READ, kind: 'refused', stars: null, title: null, body: null, name: null, dateText: null, others: 0, message: 'Your review was rejected' } });
  assert.deepEqual([fields(refused.page())[0], fields(refused.page()).find(([k]) => k === "Flipkart's words")], [['What it shows', 'Flipkart not accepting the review'], ["Flipkart's words", 'Your review was rejected']]);
  // What the screen does not show: "My Reviews" in the app lists pending reviews too; the review being written is not posted.
  const pending = await page({ ...LAST_CHECK_READ, review: { ...REVIEW_READ, stars: null, name: null, others: 0, own: true, pending: true, note: 'This is the My Reviews page, which also lists pending reviews, so it does not show that the review is live.' } });
  assert.deepEqual(fields(pending.page()).find(([k]) => k === 'Note'), ['Note', 'This is the My Reviews page, which also lists pending reviews, so it does not show that the review is live.']);
  const typing = await page({ ...LAST_CHECK_READ, review: { ...REVIEW_READ, stars: null, title: null, name: null, dateText: null, others: 0, form: true, note: 'This shows the words being typed, not that the review was posted.' } });
  assert.deepEqual(fields(typing.page()).slice(0, 2), [['What it shows', 'A review being written'], ['Stars', 'Not shown']]);
  assert.deepEqual(fields(typing.page()).find(([k]) => k === 'Note'), ['Note', 'This shows the words being typed, not that the review was posted.']);
  // Not read yet, and live as soon as step 6 has read it.
  assert.equal(textOf(card((await page(LAST_CHECK)).page())), 'Read from the review screenshotNot read yet.');
  let release;
  const gate = new Promise((r) => (release = r));
  const local = fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: null } } });
  local.checking = async (onEvent) => {
    onEvent({ event: 'started', checkId: 'c20261012123000abcdef', steps: STEP_NAMES, rowId: 'r000000000001', row: 2, name: 'Row 1' });
    onEvent({ event: 'step', step: { n: 6, name: STEP_NAMES[5], state: 'pass', detail: 'A written review.' }, partial: { order: ORDER_READ, delivery: DELIVERY_READ, review: REVIEW_READ } });
    await gate;
    onEvent({ event: 'done', result: { ...LAST_CHECK_READ, review: REVIEW_READ } });
    return { ok: true };
  };
  const live = await rowScreen(local);
  byId(live.page(), 'check').attrs.onclick();
  await settle();
  assert.deepEqual(fields(live.page())[0], ['What it shows', 'A written review'], 'shown at once, while the check runs');
  release();
  await settle();
  // A file with no review screenshot column and no review link column has no card for it.
  const noColumn = { ...SAVED, sheet: { ...SAVED.sheet, mapping: { ...SAVED.sheet.mapping, reviewShot: null, reviewLink: null } } };
  assert.equal(card((await page({ ...LAST_CHECK_READ, review: REVIEW_READ }, noColumn)).page()), null);
});

test('a row\'s page shows what step 7 found on Flipkart ("Found on Flipkart"), as the Amazon screen\'s "Found on Amazon": the review found, opened on Flipkart in one click by its own link, and never a page\'s number; words under another name or under "Flipkart Customer" shown with why they do not count; not found; nothing read yet; live as soon as step 7 has its answer; with no review screenshot or review link column, no card', async () => {
  const card = (tree) => byId(tree, 'card-flipkart');
  const fields = (tree) => findAll(card(tree), (n) => n.tag === 'div' && n.attrs?.class === 'field-row').map((n) => [textOf(findAll(n, (x) => x.tag === 'dt')[0]), textOf(findAll(n, (x) => x.tag === 'dd')[0])]);
  const warned = (tree) => findAll(card(tree), (n) => String(n.attrs?.class ?? '').includes('notice-warn')).map(textOf);
  const page = (result, saved = SAVED) => rowScreen(fakeLocal({ saved, pages: { r000000000001: { row: PICTURED, result } } }));
  const FLIPKART = { pid: 'TESTPID0000001', name: 'Test Brand Steel Bottle 1 L', readAt: '2026-10-13T13:31:38.587Z', reused: false, pages: 15, count: 150, total: 1519, end: 'last page', since: '2026-08-17', oldest: '2026-09-13', says: null };
  const LINK = 'https://www.flipkart.com/reviews/00000000-0000-4000-8000-000000000009';
  const MINE = { id: '00000000-0000-4000-8000-000000000009', name: 'Test Reviewer One', stars: 5, title: 'Terrific purchase', text: 'Keeps water cold all day and the grip is good.', dateSaid: '1 month ago', date: '2026-09-13', dateLatest: '2026-09-28', link: LINK };
  const FOUND = { how: 'found', count: 1, nameFrom: 'screenshot', counted: 150, nameOnly: 0, before: 0, share: 1, rareShare: 1, review: MINE };
  const READ = ['Read', `150 reviews, newest first, all that Flipkart shows, ${words.ist(FLIPKART.readAt)}`];
  const PRODUCT = [["Product's page", 'Test Brand Steel Bottle 1 L'], ['Reviews Flipkart counts', '1519']];
  const s = await page({ ...LAST_CHECK_READ, review: REVIEW_READ, flipkart: FLIPKART, found: FOUND });
  assert.equal(textOf(findAll(card(s.page()), (n) => n.tag === 'h3')[0]), 'Found on Flipkart');
  assert.equal(textOf(findAll(card(s.page()), (n) => n.tag === 'blockquote')[0]), MINE.text);
  assert.deepEqual(fields(s.page()), [['Reviewer name', 'Test Reviewer One'], ['Stars', '5 of 5'], ['Title', 'Terrific purchase'], ['Date', '1 month ago'], ...PRODUCT, READ, ['Found', 'Yes. Open the review on Flipkart']]);
  assert.doesNotMatch(textOf(card(s.page())), /\bpage \d/i, 'no page\'s number anywhere');
  const open = findAll(card(s.page()), (n) => n.tag === 'a')[0];
  assert.deepEqual([open.attrs.href, open.attrs.target, open.attrs.rel], [LINK, '_blank', 'noopener noreferrer']);
  assert.deepEqual(warned(s.page()), []);
  const exact = await page({ ...LAST_CHECK_READ, flipkart: FLIPKART, found: { ...FOUND, review: { ...MINE, dateSaid: '12 days ago', date: '2026-10-01', dateLatest: '2026-10-01' } } });
  assert.deepEqual(fields(exact.page())[3], ['Date', '12 days ago (01-10-2026)']);
  // The words under another name, or under "Flipkart Customer": the review is shown, with why it is not counted as found.
  const other = await page({ ...LAST_CHECK_READ, flipkart: FLIPKART, found: { ...FOUND, how: 'otherName', review: { ...MINE, name: 'Test Reviewer Two' } } });
  assert.deepEqual([warned(other.page()), fields(other.page())[0], fields(other.page()).at(-1)], [['The words match this review, but it is under another name, so it is not counted as found.'], ['Reviewer name', 'Test Reviewer Two'], ['Found', 'No: the words match a review under another name']]);
  // Its own link too, to see whose it is.
  assert.deepEqual([fields(other.page())[4], findAll(card(other.page()), (n) => n.tag === 'a')[0].attrs.href], [['On Flipkart', 'Open this review on Flipkart'], LINK]);
  const customer = await page({ ...LAST_CHECK_READ, flipkart: FLIPKART, found: { ...FOUND, how: 'noName', review: { ...MINE, name: 'Flipkart Customer' } } });
  assert.deepEqual([warned(customer.page()), fields(customer.page()).at(-1)], [['The words match this review, but Flipkart shows no name for it ("Flipkart Customer"), so the name could not be checked; it is not counted as found.'], ['Found', 'No: the words match a review Flipkart shows as "Flipkart Customer", so the name could not be checked']]);
  // Not found, or two that fit: no review is shown.
  const notFound = await page({ ...LAST_CHECK_READ, flipkart: FLIPKART, found: { ...FOUND, how: 'notFound', count: 0, review: null } });
  assert.deepEqual([textOf(findAll(card(notFound.page()), (n) => n.tag === 'p')[0]), fields(notFound.page())], ['Not found among the reviews read.', [...PRODUCT, READ, ['Found', 'No']]]);
  const twice = await page({ ...LAST_CHECK_READ, flipkart: FLIPKART, found: { ...FOUND, how: 'several', count: 2 } });
  assert.deepEqual([textOf(findAll(card(twice.page()), (n) => n.tag === 'p')[0]), fields(twice.page()).at(-1)], ['Two or more reviews fit, so none is shown.', ['Found', 'No: 2 reviews under the name have these words, so none is picked']]);
  // Nothing read from Flipkart yet; then live, as soon as step 7 has its answer.
  assert.equal(textOf(card((await page(LAST_CHECK)).page())), 'Found on FlipkartNothing read from Flipkart yet. Flipkart is opened only to look for the review shown on the review screenshot.');
  let release;
  const gate = new Promise((r) => (release = r));
  const local = fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: null } } });
  local.checking = async (onEvent) => {
    onEvent({ event: 'started', checkId: 'c20261012123000abcdef', steps: STEP_NAMES, rowId: 'r000000000001', row: 2, name: 'Row 1' });
    onEvent({ event: 'step', step: { n: 7, name: STEP_NAMES[6], state: 'pass', detail: 'Found the review.' }, partial: { order: ORDER_READ, delivery: DELIVERY_READ, review: REVIEW_READ, flipkart: FLIPKART, found: FOUND } });
    await gate;
    onEvent({ event: 'done', result: { ...LAST_CHECK_READ, review: REVIEW_READ, flipkart: FLIPKART, found: FOUND } });
    return { ok: true };
  };
  const live = await rowScreen(local);
  byId(live.page(), 'check').attrs.onclick();
  await settle();
  assert.deepEqual(fields(live.page()).at(-1), ['Found', 'Yes. Open the review on Flipkart'], 'shown at once, while the check runs');
  release();
  await settle();
  // A file with no review screenshot column and no review link column has no card for it.
  const noColumn = { ...SAVED, sheet: { ...SAVED.sheet, mapping: { ...SAVED.sheet.mapping, reviewShot: null, reviewLink: null } } };
  assert.equal(card((await page({ ...LAST_CHECK_READ, flipkart: FLIPKART, found: FOUND }, noColumn)).page()), null);
});

/** What the server says when no one is logged in to Google before a row, for "Start checking". */
const RUN_GOOGLE_OUT = 'No one is logged in to Google, so the screenshots on Google Drive cannot be downloaded. Press "Log in to Google" in the top bar and log in there, then press "Carry on checking".';

test('"Start checking", as on Amazon: the rows checked one by one from the first one not checked yet; the row being checked and its steps shown live beside the table; each row\'s line changes once it is finished; a pause says what to do and where checking carries on; Stop; "Check every row again" asks first; still no Status', async () => {
  const saved = structuredClone(SAVED);
  const local = fakeLocal({ saved, pages: { r000000000001: { row: PICTURED, result: null } } });
  const s = await opened(local);
  const shown = [];
  s.ctx.reveal = (id, block) => shown.push([id, block]);
  const buttons = () => findAll(byId(s.page(), 'main-actions'), (n) => n.tag === 'button' && !inMenu(n)).map((b) => [b.attrs['data-id'], textOf(b), Boolean(b.attrs.disabled)]);
  assert.deepEqual(buttons(), [['start-checking', 'Start checking', false], ['check-every-row', 'Check every row again', false]]);
  assert.equal(byId(s.page(), 'run'), null, 'no checking area before rows are checked');
  let release;
  const gate = new Promise((r) => (release = r));
  local.checking = async (onEvent) => {
    onEvent({ event: 'run-started', again: false, total: 3, done: 0, left: 3 });
    onEvent({ event: 'row', rowId: 'r000000000001', label: 'Row 1', total: 3, done: 0, left: 3 });
    onEvent({ event: 'started', checkId: 'c20261012123000abcdef', steps: STEP_NAMES, rowId: 'r000000000001', row: 2, name: 'Row 1' });
    onEvent({ event: 'step', step: { n: 1, name: STEP_NAMES[0], state: 'running', detail: null } });
    onEvent({ event: 'action', says: 'Opening the purchase screenshot' });
    await gate;
    for (const st of STEPS_DONE) onEvent({ event: 'step', step: st });
    onEvent({ event: 'done', result: LAST_CHECK });
    saved.rows[0].done = true;
    onEvent({ event: 'row-done', rowId: 'r000000000001', label: 'Row 1', seconds: 2, rows: [saved.rows[0]], total: 3, done: 1, left: 2 });
    onEvent({ event: 'row', rowId: 'r000000000002', label: 'Row 2', total: 3, done: 1, left: 2 });
    onEvent({ event: 'paused', kind: 'google-out', says: RUN_GOOGLE_OUT, rowId: 'r000000000002', label: 'Row 2', checked: 1, total: 3, done: 1, left: 2 });
    return { ok: true };
  };
  byId(s.page(), 'start-checking').attrs.onclick();
  await settle();
  assert.deepEqual(local.calls.filter((c) => c.stream), [{ method: 'POST', path: '/local/flipkart/check-all', body: {}, stream: true }]);
  let page = s.page();
  // While the rows are checked: the button says so, Stop is there, every other check waits, and the row being checked stands out.
  assert.deepEqual(buttons(), [['start-checking', 'Checking…', true], ['stop-all', 'Stop', false], ['check-every-row', 'Check every row again', true]]);
  assert.deepEqual([byId(page, 'check-r000000000002').attrs.disabled, byId(page, 'row-1').attrs.class, byId(page, 'row-2').attrs.class], [true, 'clickable fk-current-row', 'clickable']);
  // Beside the table: how far it is, the row being checked, what it is doing now and its steps, live.
  assert.equal(findAll(byId(page, 'rows'), (n) => /\bfk-rows-layout\b/.test(n.attrs?.class ?? ''))[0].attrs.class, 'fk-rows-layout fk-with-live');
  const run = byId(page, 'run');
  assert.equal(textOf(byId(run, 'run-progress')), 'Checking row 1: 0 of 3 rows done, 3 left. Show this row in the table');
  assert.deepEqual(findAll(run, (n) => n.tag === 'progress').map((n) => [n.attrs.max, n.attrs.value]), [['3', '0']]);
  assert.deepEqual([textOf(byId(run, 'current-action')), textOf(stepsOf(run)[0]), stepsOf(run).length], ['Opening the purchase screenshot', '…1. Opening the purchase screenshot running', 9]);
  assert.deepEqual([byId(run, 'live').attrs.class, byId(run, 'activity').attrs.class], ['fk-live fk-live-flat', 'fk-steps fk-steps-flat'], 'inside the checking area, as on Amazon');
  byId(run, 'show-current').attrs.onclick();
  assert.deepEqual(shown, [['row-1', 'center']], 'the table scrolls to the row');
  byId(run, 'open-current').attrs.onclick();
  assert.deepEqual(s.went, ['flipkart/r000000000001']);
  // The row's own page shows the same check, live.
  s.ctx.route = 'r000000000001';
  await flipkart.enter(s.ctx);
  await settle();
  page = s.page();
  assert.deepEqual([textOf(byId(page, 'final-word')), textOf(byId(page, 'current-action')), byId(page, 'check').attrs.disabled], ['Checking…', 'Opening the purchase screenshot', true]);
  s.ctx.route = '';
  await flipkart.enter(s.ctx);
  release();
  await settle();
  page = s.page();
  // Row 1 is finished: its line changed at once, and its button says "Check again"; still no Status.
  assert.deepEqual([textOf(byId(page, 'check-r000000000001')), textOf(byId(page, 'check-r000000000002'))], ['Check again', 'Check']);
  assert.deepEqual(findAll(byId(page, 'rows-table'), (n) => n.attrs?.['data-cell'] === 'status').map(textOf), ['Empty', 'Empty', 'Empty'], 'still no Status');
  // Paused before row 2: what to do, and where checking carries on.
  assert.equal(textOf(byId(page, 'paused')), `Paused at row 2. ${RUN_GOOGLE_OUT} That row is not checked yet, so it is the first one checked next time.`);
  assert.deepEqual(buttons(), [['start-checking', 'Carry on checking', false], ['check-every-row', 'Check every row again', false]]);
  assert.deepEqual(findAll(byId(page, 'run'), (n) => n.tag === 'progress').map((n) => n.attrs.value), ['1']);
  assert.ok(local.calls.filter((c) => c.path === '/local/flipkart/sheet').length >= 2, 'the rows are fetched again once it ends');
  // Stop: at once; the row it was on is not checked.
  local.checking = (onEvent, signal) => new Promise((resolve) => {
    onEvent({ event: 'run-started', again: false, total: 3, done: 1, left: 2 });
    onEvent({ event: 'row', rowId: 'r000000000002', label: 'Row 2', total: 3, done: 1, left: 2 });
    signal.addEventListener('abort', () => resolve({ ok: false, aborted: true }));
  });
  byId(s.page(), 'start-checking').attrs.onclick();
  await settle();
  assert.equal(textOf(byId(s.page(), 'run-progress')), 'Checking row 2: 1 of 3 rows done, 2 left. Show this row in the table');
  byId(s.page(), 'stop-all').attrs.onclick();
  await settle();
  assert.match(textOf(byId(s.page(), 'run')), new RegExp(STOPPED_SAYS.replace(/[.]/g, '\\.')));
  assert.equal(STOPPED_SAYS, 'Stopped. The rows finished before it stay checked. The row it was on was not finished, so it is the first one checked next time.');
  // "Check every row again": asked first; no is no.
  const asked = [];
  s.ctx.confirm = (text) => (asked.push(text), false);
  byId(s.page(), 'check-every-row').attrs.onclick();
  await settle();
  assert.deepEqual([asked, local.calls.filter((c) => c.stream).length], [['This checks all 3 rows again and replaces their results. Go on?'], 2]);
  s.ctx.confirm = () => true;
  let during = null;
  local.checking = async (onEvent) => {
    onEvent({ event: 'run-started', again: true, total: 3, done: 0, left: 3 });
    during = textOf(byId(s.page(), 'check-r000000000001'));
    for (const row of saved.rows) {
      onEvent({ event: 'row', rowId: row.id, label: row.label, total: 3, done: 0, left: 3 });
      row.done = true;
      onEvent({ event: 'row-done', rowId: row.id, label: row.label, seconds: 1, rows: [row], total: 3, done: 1, left: 2 });
    }
    onEvent({ event: 'run-done', checked: 3, total: 3, done: 3, left: 0 });
    return { ok: true };
  };
  byId(s.page(), 'check-every-row').attrs.onclick();
  await settle();
  assert.deepEqual(local.calls.filter((c) => c.stream).at(-1).body, { again: true });
  assert.equal(during, 'Check', "every row's last check went first");
  page = s.page();
  assert.deepEqual(buttons(), [['start-checking', 'All rows are checked', true], ['check-every-row', 'Check every row again', false]]);
  assert.equal(textOf(byId(page, 'run-progress')), 'Finished.');
  byId(page, 'close-run').attrs.onclick();
  assert.equal(byId(s.page(), 'run'), null, 'Close puts the checking area away');
  assert.deepEqual(['pass', 'fail', 'manual', 'none'].map((k) => textOf(byId(s.page(), `count-${k}-num`))), ['0', '0', '0', '3'], 'rows checked with no Status count as not checked yet on the Status cards, as on Amazon');
});

test("a checked row's Status, Type and Note, as on Amazon: in the table (the Status bold in its colour, with when the row was checked and how long it took; the Type a small tag; the Note), large at the top of its page with its reason, and in its Type and Note card; after a reload, and live as soon as its check finishes; \"Checking…\" while it runs; a Status the file already had says so; the Live Flipkart Browser says what it is for", async () => {
  const LAST = { checkId: 'c20261012123000abcdef', final: 'manual', finalSays: 'A staff member needs to check this transaction because the review is not among the 3 reviews Flipkart shows for the product.', status: 'Needs Manual Staff Checking', type: 'Review not live', typeKey: 'reviewNotLive', note: 'A staff member needs to check this transaction because the review is not among the 3 reviews Flipkart shows for the product. It may not be public yet.', at: '2026-10-12T12:30:00.000Z', seconds: 65 };
  const checked = { ...SAVED.rows[0], done: true, final: 'manual', finalSays: LAST.finalSays, last: LAST };
  const fromFile = { ...SAVED.rows[1], prev: { status: 'Pass', type: 'Verified', note: 'Made-up note from the file.' }, prevFinal: 'pass', final: 'pass' };
  const saved = { ...SAVED, rows: [checked, fromFile, SAVED.rows[2]] };
  const s = await opened(fakeLocal({ saved }));
  const cells = (tree, key) => findAll(byId(tree, 'rows-table'), (n) => n.attrs?.['data-cell'] === key);
  assert.deepEqual(cells(s.page(), 'status').map(textOf), [`Needs Manual Staff Checking${words.ist(LAST.at)}took 1 minute 5 seconds`, 'PassFrom the file', 'Empty']);
  assert.deepEqual(cells(s.page(), 'status').map((c) => findAll(c, (n) => /\bfk-final\b/.test(n.attrs?.class ?? '')).map((n) => n.attrs.class)), [['fk-final fk-final-manual'], ['fk-final fk-final-pass'], []], 'in its colour, as on Amazon');
  assert.deepEqual(cells(s.page(), 'type').map(textOf), ['Review not live', 'Verified', 'Empty']);
  assert.deepEqual(cells(s.page(), 'note').map(textOf), [LAST.note, 'Made-up note from the file.', 'Empty']);
  // "Checking…" in the table for the row being checked.
  let release;
  const gate = new Promise((r) => (release = r));
  s.local.checking = async (onEvent) => {
    onEvent({ event: 'started', checkId: LAST.checkId, steps: STEP_NAMES, rowId: 'r000000000001', row: 2, name: 'Row 1' });
    await gate;
    return { ok: true };
  };
  byId(s.page(), 'check-r000000000001').attrs.onclick({ stopPropagation() {} });
  await settle();
  assert.deepEqual([textOf(cells(s.page(), 'status')[0]), textOf(cells(s.page(), 'type')[0]), textOf(cells(s.page(), 'note')[0])], ['Checking…', '', '']);
  release();
  await settle();
  // The row's page after a reload: its Status at the top, large, with its reason, then its Type and Note.
  const KEPT = { ...LAST_CHECK, final: 'manual', status: LAST.status, type: LAST.type, typeKey: LAST.typeKey, note: LAST.note, finalSays: LAST.finalSays };
  const r = await rowScreen(fakeLocal({ saved, pages: { r000000000001: { row: checked, result: KEPT } } }));
  assert.deepEqual([byId(r.page(), 'final-banner').attrs.class, textOf(byId(r.page(), 'final-word')), textOf(byId(r.page(), 'final-says'))], ['fk-final-banner fk-final-banner-manual', 'Needs Manual Staff Checking', LAST.finalSays]);
  assert.deepEqual([textOf(byId(r.page(), 'result-type')), textOf(byId(r.page(), 'result-note'))], ['Review not live', LAST.note]);
  // Checked again on its page: "Checking…", then the new Status at once, before the table is fetched again.
  let done;
  const finish = new Promise((x) => (done = x));
  const NEW = { ...KEPT, final: 'pass', status: 'Pass', type: 'Verified', typeKey: 'verified', finalSays: 'This transaction passed: made-up reason.', note: 'This transaction passed: made-up reason. More made-up words.', finishedAt: '2026-10-13T09:00:00.000Z' };
  r.local.checking = async (onEvent) => {
    onEvent({ event: 'started', checkId: NEW.checkId, steps: STEP_NAMES, rowId: 'r000000000001', row: 2, name: 'Row 1' });
    await finish;
    onEvent({ event: 'done', result: NEW });
    return { ok: true };
  };
  byId(r.page(), 'check').attrs.onclick();
  await settle();
  assert.deepEqual([textOf(byId(r.page(), 'final-word')), textOf(byId(r.page(), 'final-says'))], ['Checking…', 'This row is being checked now.']);
  done();
  await settle();
  assert.deepEqual([byId(r.page(), 'final-banner').attrs.class, textOf(byId(r.page(), 'final-word')), textOf(byId(r.page(), 'final-says')), textOf(byId(r.page(), 'result-type')), textOf(byId(r.page(), 'result-note'))], ['fk-final-banner fk-final-banner-pass', 'Pass', NEW.finalSays, 'Verified', NEW.note]);
  // A Status the file already had; a row checked before Flipkart rows were given a Status.
  const file = await rowScreen(fakeLocal({ saved, pages: { r000000000002: { row: fromFile, result: null } } }), 'r000000000002');
  assert.deepEqual([textOf(byId(file.page(), 'final-word')), textOf(byId(file.page(), 'final-says')), textOf(byId(file.page(), 'card-result'))], ['Pass', 'From the file: the uploaded file already had a Status for this row.', 'Type and NoteVerified From the fileMade-up note from the file.']);
  const older = { ...SAVED.rows[2], done: true };
  const before = await rowScreen(fakeLocal({ saved: { ...SAVED, rows: [SAVED.rows[0], SAVED.rows[1], older] }, pages: { r000000000003: { row: older, result: LAST_CHECK } } }), 'r000000000003');
  assert.deepEqual([textOf(byId(before.page(), 'final-word')), textOf(byId(before.page(), 'final-says'))], [FINAL_NONE, 'This row was checked before Flipkart rows were given a Status. Press "Check again" to give it one.']);
  // The Live Flipkart Browser: what it is for now.
  assert.equal(textOf(byId(r.page(), 'live')), `Live Flipkart BrowserThe Chrome window named "Live Flipkart Browser" shows each Flipkart page as it opens. Step 7 opens it to read the reviews of the campaign's product on Flipkart: the product's page, then "See all reviews", newest first, once in a checking run, kept on this computer for every row. The screenshots are read on this computer, without it.${textOf(byId(r.page(), 'current-action'))}No pictures are taken of it. What it read shows in the "Found on Flipkart" box.`);
  assert.doesNotMatch(textOf(r.page()), /in a later step\.|only open the screenshots/, 'nothing says the steps only open the screenshots');
});

/** Two checked rows (one Needs Manual Staff Checking, one Pass) and one not checked yet, as the server shows them. */
const MANUAL_LAST = { checkId: 'c20261012123000abcdef', final: 'manual', finalSays: 'A staff member needs to check this transaction because made-up reason.', status: 'Needs Manual Staff Checking', type: 'Review not live', typeKey: 'reviewNotLive', note: 'A staff member needs to check this transaction because made-up reason. Made-up words.', at: '2026-10-12T12:30:00.000Z', seconds: 65, staff: null };
const PASS_LAST = { ...MANUAL_LAST, checkId: 'c20261012123100abcdef', final: 'pass', finalSays: 'This transaction passed: made-up reason.', status: 'Pass', type: 'Verified', typeKey: 'verified', note: 'This transaction passed: made-up reason.' };
const checkedRows = () => [{ ...SAVED.rows[0], done: true, final: 'manual', finalSays: MANUAL_LAST.finalSays, last: MANUAL_LAST }, { ...SAVED.rows[1], done: true, final: 'pass', finalSays: PASS_LAST.finalSays, last: PASS_LAST }, structuredClone(SAVED.rows[2])];

test("the four Status cards and the filter, as on Amazon: how many rows are Pass, Fail, Needs Manual Staff Checking and Not checked yet, each in its colour, changing as each row's check finishes while the rows are checked one by one; a card shows only its rows, and pressed again every row; the Status box and the Type box with how many rows each, \"Show every row\", and how many rows are shown", async () => {
  const rows = checkedRows();
  const local = fakeLocal({ saved: { ...SAVED, rows, types: TYPES } });
  const s = await opened(local);
  const KEYS4 = ['pass', 'fail', 'manual', 'none'];
  const nums = () => KEYS4.map((k) => textOf(byId(s.page(), `count-${k}-num`)));
  const pressed = () => KEYS4.map((k) => byId(s.page(), `count-${k}`).attrs['aria-pressed']);
  const shownRows = () => findAll(byId(s.page(), 'rows-table'), (n) => n.tag === 'tr' && n.attrs?.['data-id']).map((n) => n.attrs['data-id']);
  const options = (id) => findAll(byId(s.page(), id), (n) => n.tag === 'option').map(textOf);
  // Between the Campaigns box and the rows, beside "Start checking", as on Amazon.
  const order = (await opened(local)).page().filter(Boolean).map((n) => n.attrs?.['data-id'] ?? n.attrs?.key ?? null);
  assert.ok(order.indexOf('overview') > order.indexOf('campaigns') && order.indexOf('overview') < order.indexOf('rows'), order.join(', '));
  assert.deepEqual([nums(), findAll(byId(s.page(), 'counts'), (n) => /\bfk-final-card-label\b/.test(n.attrs?.class ?? '')).map(textOf)], [['1', '0', '1', '1'], ['Pass', 'Fail', 'Needs Manual Staff Checking', 'Not checked yet']]);
  assert.deepEqual(findAll(byId(s.page(), 'counts'), (n) => n.tag === 'button').map((b) => b.attrs.class), ['fk-final-card fk-final-card-pass', 'fk-final-card fk-final-card-fail', 'fk-final-card fk-final-card-manual', 'fk-final-card fk-final-card-none'], 'each in its colour, as on Amazon');
  assert.equal(textOf(byId(s.page(), 'staff-stats')), 'Staff checked no results yet. On a row\'s page, "The result is right" or "Change the result" counts one.');
  // A card shows only its rows; pressed again, every row.
  byId(s.page(), 'count-pass').attrs.onclick();
  assert.deepEqual([shownRows(), pressed(), textOf(byId(s.page(), 'rows-count')), byId(s.page(), 'filter-final').attrs.value, textOf(byId(s.page(), 'filter-clear'))], [['row-2'], ['true', 'false', 'false', 'false'], '1 of 3 rows shown', 'pass', 'Show every row']);
  byId(s.page(), 'count-pass').attrs.onclick();
  assert.deepEqual([shownRows(), pressed(), textOf(byId(s.page(), 'rows-count')), byId(s.page(), 'filter-clear')], [['row-1', 'row-2', 'row-3'], ['false', 'false', 'false', 'false'], '3 rows', null]);
  byId(s.page(), 'count-none').attrs.onclick();
  assert.deepEqual(shownRows(), ['row-3']);
  byId(s.page(), 'count-fail').attrs.onclick();
  assert.deepEqual([shownRows(), textOf(byId(s.page(), 'no-match'))], [[], 'No row has that Status and Type.']);
  // The Status box: every Status with how many rows, the same choice as the cards.
  assert.deepEqual(options('filter-final'), ['Every Status (3)', 'Pass (1)', 'Fail (0)', 'Needs Manual Staff Checking (1)', 'Not checked yet (1)']);
  byId(s.page(), 'filter-final').attrs.onchange({ target: { value: 'manual' } });
  assert.deepEqual([shownRows(), pressed()], [['row-1'], ['false', 'false', 'true', 'false']]);
  // The Type box: every Type, each with how many rows of the Status chosen have it.
  assert.deepEqual([options('filter-type').length, options('filter-type').filter((t) => !/\(0\)$/.test(t))], [TYPES.length + 1, ['Every Type', 'Review not live (1)']]);
  byId(s.page(), 'filter-final').attrs.onchange({ target: { value: '' } });
  assert.deepEqual(options('filter-type').filter((t) => !/\(0\)$/.test(t)), ['Every Type', 'Verified (1)', 'Review not live (1)']);
  byId(s.page(), 'filter-type').attrs.onchange({ target: { value: 'Verified' } });
  assert.deepEqual([shownRows(), textOf(byId(s.page(), 'rows-count'))], [['row-2'], '1 of 3 rows shown']);
  byId(s.page(), 'filter-clear').attrs.onclick();
  assert.deepEqual([shownRows(), s.state.filter], [['row-1', 'row-2', 'row-3'], { final: '', type: '' }]);
  // "Check every row again": all 3 start as Not checked yet, then the numbers change as each row's check finishes; "Show this row in the table" shows every row first.
  byId(s.page(), 'count-fail').attrs.onclick();
  const seen = [];
  let cleared = null;
  local.checking = async (onEvent) => {
    onEvent({ event: 'run-started', again: true, total: 3, done: 0, left: 3 });
    seen.push(nums());
    for (const [i, row] of rows.entries()) {
      onEvent({ event: 'row', rowId: row.id, label: row.label, total: 3, done: i, left: 3 - i });
      if (i === 0) {
        byId(s.page(), 'show-current').attrs.onclick();
        cleared = { ...s.state.filter };
      }
      onEvent({ event: 'row-done', rowId: row.id, label: row.label, seconds: 1, rows: [{ ...row, done: true, final: 'pass', finalSays: PASS_LAST.finalSays, last: { ...PASS_LAST, at: '2026-10-13T09:00:00.000Z' } }], total: 3, done: i + 1, left: 2 - i });
      seen.push(nums());
    }
    onEvent({ event: 'run-done', checked: 3, total: 3, done: 3, left: 0 });
    return { ok: true };
  };
  byId(s.page(), 'check-every-row').attrs.onclick();
  await settle();
  assert.deepEqual(seen, [['0', '0', '0', '3'], ['1', '0', '0', '2'], ['2', '0', '0', '1'], ['3', '0', '0', '0']]);
  assert.deepEqual(cleared, { final: '', type: '' }, 'the row being checked was hidden by the filter, so every row shows');
});

test('a staff member changing a row\'s result, as on Amazon: on its page, "Change the result" (the Status, the Type and the Note, then Save) and "The result is right"; the table and the page then say "Changed by staff" or "Marked right by staff", with when; the Status cards and the line above the table count them; "Check again" and "Check every row again" ask first, and a row changed by staff keeps its result', async () => {
  const rows = checkedRows();
  const saved = { ...SAVED, rows, types: TYPES };
  const kept = (last) => ({ ...LAST_CHECK, final: last.final, status: last.status, type: last.type, typeKey: last.typeKey, note: last.note, finalSays: last.finalSays });
  const pages = { r000000000001: { row: rows[0], result: kept(MANUAL_LAST) }, r000000000002: { row: rows[1], result: kept(PASS_LAST) } };
  const posted = [];
  let answer = null;
  const local = fakeLocal({ saved, pages, staff: async (path, body) => (posted.push([path, body]), answer(path, body)) });
  const s = await rowScreen(local);
  const actions = () => findAll(byId(s.page(), 'row-page'), (n) => n.tag === 'button' && ['check', 'change-result', 'result-right'].includes(n.attrs?.['data-id'])).map((b) => [b.attrs['data-id'], textOf(b), Boolean(b.attrs.disabled)]);
  const form = () => byId(s.page(), 'edit-result');
  assert.deepEqual(actions(), [['check', 'Check again', false], ['change-result', 'Change the result', false], ['result-right', 'The result is right', false]]);
  // "Change the result": the form, filled with the row's result as it is; Cancel puts it away.
  byId(s.page(), 'change-result').attrs.onclick();
  assert.deepEqual([byId(form(), 'edit-final').attrs.value, byId(form(), 'edit-type').attrs.value, byId(form(), 'edit-note').attrs.value, byId(s.page(), 'change-result').attrs.disabled], ['manual', 'reviewNotLive', MANUAL_LAST.note, true]);
  assert.deepEqual(findAll(byId(form(), 'edit-final'), (n) => n.tag === 'option').map(textOf), ['Pass', 'Fail', 'Needs Manual Staff Checking']);
  assert.deepEqual(findAll(byId(form(), 'edit-type'), (n) => n.tag === 'option').map(textOf), ['Choose a Type', ...TYPES.map((t) => t.word)]);
  assert.match(textOf(form()), /^Change the resultChoose the Status and the Type, write the Note, then press Save\. The row then says "Changed by staff"/);
  byId(form(), 'cancel-result').attrs.onclick();
  assert.equal(form(), null);
  // Filled in and saved; a refusal stays in the form.
  byId(s.page(), 'change-result').attrs.onclick();
  byId(form(), 'edit-final').attrs.onchange({ target: { value: 'pass' } });
  byId(form(), 'edit-type').attrs.onchange({ target: { value: 'verified' } });
  byId(form(), 'edit-note').attrs.oninput({ target: { value: 'Made-up note by staff.' } });
  answer = () => {
    throw new ApiError(409, 'This row is being checked right now. Wait for it to finish, then change its result.');
  };
  byId(form(), 'save-result').attrs.onclick();
  await settle();
  assert.match(textOf(form()), /This row is being checked right now\. Wait for it to finish, then change its result\./);
  const AT = '2026-10-15T06:00:00.000Z';
  const CHANGED = { ...rows[0], final: 'pass', finalSays: null, last: { ...MANUAL_LAST, final: 'pass', status: 'Pass', type: 'Verified', typeKey: 'verified', note: 'Made-up note by staff.', finalSays: null, at: AT, staff: { at: AT, right: false, was: { final: 'manual', typeKey: 'reviewNotLive', type: 'Review not live' } } } };
  answer = () => {
    saved.rows[0] = CHANGED;
    pages.r000000000001 = { row: CHANGED, result: { ...kept(CHANGED.last), staff: CHANGED.last.staff } };
    return { row: CHANGED };
  };
  byId(form(), 'save-result').attrs.onclick();
  await settle();
  assert.deepEqual(posted.map(([path, body]) => [path, body]), [['/local/flipkart/rows/r000000000001/result', { final: 'pass', typeKey: 'verified', note: 'Made-up note by staff.' }], ['/local/flipkart/rows/r000000000001/result', { final: 'pass', typeKey: 'verified', note: 'Made-up note by staff.' }]]);
  let page = s.page();
  assert.deepEqual([form(), byId(page, 'final-banner').attrs.class, textOf(byId(page, 'final-word')), textOf(byId(page, 'final-says')), textOf(byId(page, 'result-type')), textOf(byId(page, 'result-note')), textOf(byId(page, 'result-when'))], [null, 'fk-final-banner fk-final-banner-pass', 'Pass', `Changed by staff on ${words.ist(AT)}. "Check again" replaces it with what the dashboard finds.`, 'Verified', 'Made-up note by staff.', `Changed by staff on ${words.ist(AT)}`]);
  assert.match(textOf(page), /The result was changed\. This row now says "Changed by staff"\./);
  assert.deepEqual(actions(), [['check', 'Check again', false], ['change-result', 'Change the result', false]], '"The result is right" is only for the dashboard\'s own result');
  // "Check again" asks first; no is no.
  const asked = [];
  s.ctx.confirm = (text) => (asked.push(text), false);
  byId(s.page(), 'check').attrs.onclick();
  await settle();
  assert.deepEqual([asked, local.calls.filter((c) => c.stream).length], [['A staff member changed this row\'s result by hand. "Check again" replaces it with what the dashboard finds. Go on?'], 0]);
  // The table: "Changed by staff", with when, and the Status cards and the line above the table count it.
  s.ctx.route = '';
  await flipkart.enter(s.ctx);
  await settle();
  const cells = (key) => findAll(byId(s.page(), 'rows-table'), (n) => n.attrs?.['data-cell'] === key).map(textOf);
  assert.deepEqual([cells('status'), cells('type'), cells('note')[0]], [[`PassChanged by staff on ${words.ist(AT)}`, `Pass${words.ist(PASS_LAST.at)}took 1 minute 5 seconds`, 'Empty'], ['Verified', 'Verified', 'Empty'], 'Made-up note by staff.']);
  assert.deepEqual(['pass', 'fail', 'manual', 'none'].map((k) => textOf(byId(s.page(), `count-${k}-num`))), ['2', '0', '0', '1']);
  assert.equal(textOf(byId(s.page(), 'staff-stats')), 'Staff checked 1 result: 0 right (0%). Needs Manual Staff Checking: 1 checked, 0 right (0%).');
  // "The result is right" on row 2: the dashboard's result stays, marked right by staff, with when.
  s.ctx.route = 'r000000000002';
  await flipkart.enter(s.ctx);
  await settle();
  assert.doesNotMatch(textOf(s.page()), /The result was changed/, "the message belongs to row 1's page");
  const MARK = '2026-10-15T06:05:00.000Z';
  const MARKED = { ...rows[1], last: { ...PASS_LAST, staff: { at: MARK, right: true, was: { final: 'pass', typeKey: 'verified', type: 'Verified' } } } };
  answer = () => {
    saved.rows[1] = MARKED;
    return { row: MARKED };
  };
  byId(s.page(), 'result-right').attrs.onclick();
  await settle();
  assert.deepEqual(posted.at(-1), ['/local/flipkart/rows/r000000000002/right', {}]);
  page = s.page();
  assert.deepEqual([textOf(byId(page, 'final-word')), textOf(byId(page, 'final-says')), textOf(byId(page, 'result-type')), textOf(byId(page, 'result-when'))], ['Pass', `Marked right by staff on ${words.ist(MARK)}. ${PASS_LAST.finalSays}`, 'Verified', `Marked right by staff on ${words.ist(MARK)}`]);
  assert.deepEqual(actions(), [['check', 'Check again', false], ['change-result', 'Change the result', false], ['result-right', 'Marked right by staff', true]]);
  assert.match(textOf(page), /Marked as right\. This row now says "Marked right by staff", and the line above the table counts it\./);
  byId(s.page(), 'check').attrs.onclick();
  assert.equal(asked.at(-1), 'A staff member marked this row\'s result as right. "Check again" checks it afresh and clears that mark. Go on?');
  // Back on the table: both counted; "Check every row again" asks, saying which rows keep their results.
  s.ctx.route = '';
  await flipkart.enter(s.ctx);
  await settle();
  assert.deepEqual(cells('status').slice(0, 2), [`PassChanged by staff on ${words.ist(AT)}`, `PassMarked right by staff on ${words.ist(MARK)}took 1 minute 5 seconds`]);
  assert.equal(textOf(byId(s.page(), 'staff-stats')), 'Staff checked 2 results: 1 right (50%). Pass: 1 checked, 1 right (100%). Needs Manual Staff Checking: 1 checked, 0 right (0%).');
  byId(s.page(), 'check-every-row').attrs.onclick();
  assert.equal(asked.at(-1), 'This checks the 2 rows not changed by staff again and replaces their results. The 1 row changed by staff keeps its result. The 1 row marked right by staff loses its mark. Go on?');
  s.ctx.confirm = () => true;
  let during = null;
  local.checking = async (onEvent) => {
    onEvent({ event: 'run-started', again: true, total: 3, done: 1, left: 2 });
    during = cells('status');
    onEvent({ event: 'run-done', checked: 0, total: 3, done: 1, left: 2 });
    return { ok: true };
  };
  byId(s.page(), 'check-every-row').attrs.onclick();
  await settle();
  assert.deepEqual(during, [`PassChanged by staff on ${words.ist(AT)}`, 'Empty', 'Empty'], 'the row changed by staff keeps its result; the mark goes with the other results');
  // Every row changed by staff: nothing to check again, and it says so.
  const all = await opened(fakeLocal({ saved: { ...SAVED, rows: [CHANGED], types: TYPES } }));
  byId(all.page(), 'check-every-row').attrs.onclick();
  await settle();
  assert.deepEqual([textOf(byId(all.page(), 'rows-notice')), all.local.calls.filter((c) => c.stream).length], ['The 1 row was changed by staff, so it keeps its result and there is nothing to check again.', 0]);
});

/** The email the server fills in for Row 1, as "Prepare email" shows it. Made-up words. */
const EMAIL = { rowId: 'r000000000001', label: 'Row 1', reviewer: 'Test Person Two', reviewerColumn: true, orderId: 'OD100000000000000002', address: 'test.person2@example.test', addressOk: true, addressSays: null, emailColumn: true, key: 'reviewNotLive', name: 'Review not live', subject: 'Your order OD100000000000000002: please send the link to your review', message: 'Hello Test Person Two,\n\nMade-up words of the email.\n\nThank you,\nThe support team' };

/** The clipboard, as the browser has it: what each Copy button copied, or a refusal. */
function clipboard(refuse = false) {
  const copied = [];
  const writeText = async (text) => {
    if (refuse) throw new Error('Made-up refusal.');
    copied.push(text);
  };
  Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText } });
  return copied;
}

test('"Prepare email" on a row\'s page, the Amazon screen\'s email box for the row: who it is to, its subject and its message, filled in for the row, which can be changed; a Copy button beside the email address, the subject and the message copies each one; nothing is ever sent (no Send button, no Test or Real choice), and the box says so', async () => {
  const rows = checkedRows().map((r, i) => ({ ...r, emailKey: i === 0 ? 'reviewNotLive' : null }));
  const saved = { ...SAVED, rows, types: TYPES };
  const pages = { r000000000001: { row: rows[0], result: null }, r000000000002: { row: rows[1], result: null } };
  const local = fakeLocal({ saved, pages, emails: { r000000000001: EMAIL } });
  const copied = clipboard();
  try {
    const s = await rowScreen(local);
    const box = () => byId(s.page(), 'email-panel');
    assert.equal(box(), null, 'no email box until "Prepare email" is pressed');
    const prepare = byId(s.page(), 'prepare-email');
    assert.deepEqual([textOf(prepare), Boolean(prepare.attrs.disabled)], ['Prepare email', false]);
    // In the place of "Email this user" on Amazon: after "The result is right".
    assert.deepEqual(findAll(byId(s.page(), 'row-page'), (n) => n.tag === 'button' && ['check', 'change-result', 'result-right', 'prepare-email'].includes(n.attrs?.['data-id'])).map((b) => b.attrs['data-id']), ['check', 'change-result', 'result-right', 'prepare-email']);
    prepare.attrs.onclick();
    await settle();
    assert.deepEqual(local.calls.filter((c) => c.path.endsWith('/email')).map((c) => `${c.method} ${c.path}`), ['GET /local/flipkart/rows/r000000000001/email']);
    assert.equal(byId(s.page(), 'prepare-email').attrs.disabled, true, 'once open, it is not opened again');
    assert.deepEqual([textOf(findAll(box(), (n) => n.tag === 'h2')[0]), textOf(byId(box(), 'email-not-sent')), textOf(byId(box(), 'email-name')), textOf(byId(box(), 'email-to')), byId(box(), 'email-subject').attrs.value, byId(box(), 'email-message').attrs.value], ['Prepare email', 'Nothing is sent from here. Read the email and change its words if you like, then press Copy beside the email address, the subject and the message, and paste each one into your own email. Under it, the row\'s screenshots, to paste in or attach.', 'Row 1: Review not live', 'Test Person Two, test.person2@example.test', EMAIL.subject, EMAIL.message]);
    // A Copy button beside the address, the subject and the message, then Close: no Send button, no Test or Real choice, no test email address.
    assert.deepEqual(findAll(box(), (n) => n.tag === 'button').map((b) => [b.attrs['data-id'], textOf(b)]), [['copy-address', 'Copy'], ['copy-subject', 'Copy'], ['copy-message', 'Copy'], ['close-email', 'Close']]);
    assert.equal(findAll(box(), (n) => n.tag === 'input' && n.attrs.type !== 'text').length, 0, 'no tick box and no Test or Real choice');
    assert.doesNotMatch(textOf(box()), /\bSend\b|Gmail|Test email address|Real:/);
    // The words can be changed, and each Copy copies them as they are now.
    byId(box(), 'email-subject').attrs.oninput({ target: { value: 'Made-up subject, changed' } });
    byId(box(), 'copy-subject').attrs.onclick();
    await settle();
    byId(box(), 'copy-address').attrs.onclick();
    await settle();
    byId(box(), 'email-message').attrs.oninput({ target: { value: 'Made-up message, changed' } });
    byId(box(), 'copy-message').attrs.onclick();
    await settle();
    assert.deepEqual(copied, ['Made-up subject, changed', 'test.person2@example.test', 'Made-up message, changed']);
    assert.deepEqual(['copy-address', 'copy-subject', 'copy-message'].map((id) => textOf(byId(box(), id))), ['Copy', 'Copy', 'Copied'], 'the last one copied says so');
    // A copy the browser refuses says what to do instead.
    clipboard(true);
    byId(box(), 'copy-subject').attrs.onclick();
    await settle();
    assert.match(textOf(box()), /The subject could not be copied\. Select its words and copy them yourself: Command and C on a Mac, Ctrl and C on Windows\./);
    // Close puts it away; it goes too when another page is opened.
    byId(box(), 'close-email').attrs.onclick();
    assert.equal(box(), null);
    byId(s.page(), 'prepare-email').attrs.onclick();
    await settle();
    assert.ok(box());
    s.ctx.route = '';
    flipkart.enter(s.ctx);
    await settle();
    assert.equal(s.state.email, null, 'the email box belongs to the page it was opened on');
    // A row whose Type has no email (a Pass) has no "Prepare email".
    const pass = await rowScreen(local, 'r000000000002');
    assert.equal(byId(pass.page(), 'prepare-email'), null);
  } finally {
    delete globalThis.navigator.clipboard;
  }
});

test('"Prepare email" shows the row\'s screenshots as small pictures, each with "Copy picture", which copies it to paste into an email in Gmail or Outlook (a JPEG is made a PNG first), and "Save", which saves it as a file to attach; nothing is sent', async () => {
  const jpeg = [{ i: 0, ok: true, type: 'image/jpeg', at: '2026-10-12T12:30:00.000Z', link: DELIVERY_SHOT }];
  const pictured = { ...PICTURED, done: true, final: 'manual', last: MANUAL_LAST, emailKey: 'reviewNotLive', shots: { ...PICTURED.shots, delivery: { ...PICTURED.shots.delivery, pictures: jpeg } } };
  const fetched = [];
  const local = fakeLocal({ saved: { ...SAVED, rows: [pictured, SAVED.rows[1], SAVED.rows[2]], types: TYPES }, pages: { r000000000001: { row: pictured, result: null } }, emails: { r000000000001: EMAIL }, file: (path) => (fetched.push(path), { blob: new Blob(['made-up picture'], { type: path.includes('/delivery/') ? 'image/jpeg' : 'image/png' }), fileName: null }) });
  const written = [];
  const drawn = [];
  let refuse = false;
  const write = async (items) => {
    for (const item of items) for (const [type, picture] of Object.entries(item.items)) written.push([type, (await picture).type]);
    if (refuse) throw new Error('Made-up refusal.');
  };
  Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { write } });
  globalThis.ClipboardItem = class {
    constructor(items) {
      this.items = items;
    }
  };
  globalThis.createImageBitmap = async (blob) => ({ width: 3, height: 2, close() {}, kind: blob.type });
  globalThis.OffscreenCanvas = class {
    getContext() {
      return { drawImage: (bitmap) => drawn.push(bitmap.kind) };
    }
    convertToBlob({ type }) {
      return Promise.resolve(new Blob(['made-up png'], { type }));
    }
  };
  try {
    const s = await rowScreen(local);
    const saves = [];
    s.ctx.download = (name, data) => saves.push([name, data.type]);
    byId(s.page(), 'prepare-email').attrs.onclick();
    await settle();
    const shots = () => byId(byId(s.page(), 'email-panel'), 'email-shots');
    assert.deepEqual(findAll(shots(), (n) => /\bfk-user-shot\b/.test(n.attrs?.class ?? '')).map((n) => textOf(findAll(n, (x) => x.tag === 'p')[0])), ['Order Screenshot', 'Delivery Screenshot', 'Review Screenshot'], "the row's screenshots, named as on its page");
    assert.deepEqual(findAll(shots(), (n) => n.tag === 'img').map((n) => n.attrs.src), ['order', 'delivery', 'reviewShot'].map((w) => `blob:/local/flipkart/rows/r000000000001/small/${w}/0`), 'as small pictures');
    assert.deepEqual(findAll(shots(), (n) => n.tag === 'button' && !/thumb/.test(n.attrs['data-id'])).map((b) => [b.attrs['data-id'], textOf(b)]), ['order', 'delivery', 'reviewShot'].flatMap((w) => [[`copy-picture-${w}-0`, 'Copy picture'], [`save-picture-${w}-0`, 'Save']]));
    // "Copy picture": the picture as a PNG, the kind Gmail and Outlook take when one is pasted in.
    byId(shots(), 'copy-picture-order-0').attrs.onclick();
    await settle();
    byId(shots(), 'copy-picture-delivery-0').attrs.onclick();
    await settle();
    assert.deepEqual([written, drawn], [[['image/png', 'image/png'], ['image/png', 'image/png']], ['image/jpeg']], 'the JPEG was drawn again as a PNG; the PNG was copied as it was');
    assert.deepEqual(['order', 'delivery'].map((w) => textOf(byId(shots(), `copy-picture-${w}-0`))), ['Copy picture', 'Copied']);
    // "Save": the picture as it was kept, as a file to attach.
    byId(shots(), 'save-picture-delivery-0').attrs.onclick();
    await settle();
    byId(shots(), 'save-picture-order-0').attrs.onclick();
    await settle();
    assert.deepEqual(saves, [['Row 1 delivery screenshot.jpg', 'image/jpeg'], ['Row 1 purchase screenshot.png', 'image/png']]);
    assert.deepEqual(fetched, ['order', 'delivery', 'delivery', 'order'].map((w) => `/local/flipkart/rows/r000000000001/picture/${w}/0`), 'each picture fetched from this computer, as it was kept');
    // A copy the browser refuses, or a browser that cannot copy pictures, says what to do instead.
    refuse = true;
    byId(shots(), 'copy-picture-order-0').attrs.onclick();
    await settle();
    assert.match(textOf(byId(s.page(), 'email-panel')), /The purchase screenshot could not be copied\. Press Save beside it, then attach the file to your email\./);
    delete globalThis.ClipboardItem;
    byId(shots(), 'copy-picture-reviewShot-0').attrs.onclick();
    await settle();
    assert.match(textOf(byId(s.page(), 'email-panel')), /This browser cannot copy pictures\. Press Save beside the review screenshot, then attach the file to your email\./);
    assert.deepEqual(local.calls.filter((c) => c.method !== 'GET').map((c) => c.path), [], 'nothing is sent anywhere');
  } finally {
    delete globalThis.navigator.clipboard;
    delete globalThis.ClipboardItem;
    delete globalThis.createImageBitmap;
    delete globalThis.OffscreenCanvas;
  }
});

test('"Prepare email" says when there is no email address to copy (the file has no email address column, or nothing for this row), and why a row has no email', async () => {
  const rows = checkedRows().map((r, i) => ({ ...r, emailKey: i === 0 ? 'reviewNotLive' : null }));
  const saved = { ...SAVED, rows, types: TYPES };
  const pages = { r000000000001: { row: rows[0], result: null } };
  const open = async (email) => {
    const s = await rowScreen(fakeLocal({ saved, pages, emails: email ? { r000000000001: email } : {} }));
    byId(s.page(), 'prepare-email').attrs.onclick();
    await settle();
    return byId(s.page(), 'email-panel');
  };
  const noColumn = await open({ ...EMAIL, address: '', addressOk: false, addressSays: 'This file has no email address column.', emailColumn: false });
  assert.deepEqual([textOf(byId(noColumn, 'email-to')), byId(noColumn, 'copy-address'), textOf(byId(noColumn, 'email-no-address'))], ['Test Person Two', null, 'This file has no email address column. A column named "Email", "Email ID" or "Email Address" in the next file is found by itself.']);
  const empty = await open({ ...EMAIL, address: '', addressOk: false, addressSays: 'There is no email address in the file for this row.' });
  assert.deepEqual([textOf(byId(empty, 'email-to')), textOf(byId(empty, 'email-no-address'))], ['Test Person Two', 'There is no email address in the file for this row.']);
  const nobody = await open({ ...EMAIL, reviewer: '', reviewerColumn: false, address: '', addressOk: false, addressSays: 'This file has no email address column.', emailColumn: false });
  assert.equal(textOf(byId(nobody, 'email-to')), 'No name and no email address in the file');
  const refused = await open(null);
  assert.match(textOf(refused), /Row 1 has no email: its Type has none, or it is not checked yet\./);
  assert.equal(byId(refused, 'email-subject'), null);
});

test('the Download button beside "Check every row again", as on Amazon: "The checked Excel file" (the uploaded file with the results filled in, from the local server) and "The results only" (Row, Order ID, Status, Type and Note, a Status the file already had too); for a CSV file, only "The results only"', async () => {
  const rows = [...checkedRows().slice(0, 2), { ...structuredClone(SAVED.rows[2]), prev: { status: 'Fail', type: 'Not delivered', note: 'Made-up note from the file.' }, prevFinal: 'fail', final: 'fail' }];
  let answer = () => ({ blob: 'made-up bytes', fileName: 'flipkart-orders checked 2026-10-14.xlsx' });
  const local = fakeLocal({ saved: { ...SAVED, rows, types: TYPES }, file: (path) => answer(path) });
  const s = await opened(local);
  const saves = [];
  s.ctx.download = (name, data, type) => saves.push({ name, data, type });
  const menu = () => byId(s.page(), 'download');
  const summary = () => textOf(findAll(menu(), (n) => n.tag === 'summary')[0]);
  const items = () => findAll(menu(), (n) => n.tag === 'button').map((b) => [b.attrs['data-id'], textOf(b), Boolean(b.attrs.disabled)]);
  assert.deepEqual([menu().tag, summary()], ['details', 'Download']);
  assert.deepEqual(items(), [['download-excel', 'The checked Excel fileYour file, with the results filled in', false], ['download-csv', 'The results onlyRow, order ID, Status, Type and Note', false]]);
  // "The results only": made on this page, as on Amazon.
  byId(s.page(), 'download-csv').attrs.onclick({});
  assert.equal(saves.length, 1);
  assert.match(saves[0].name, /^flipkart-review-results-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.equal(saves[0].data, words.csv([['Row', 'Order ID', 'Status', 'Type', 'Note'], [1, 'OD100000000000000002', 'Needs Manual Staff Checking', 'Review not live', MANUAL_LAST.note], [2, 'OD100000000000000003', 'Pass', 'Verified', PASS_LAST.note], [3, '', 'Fail', 'Not delivered', 'Made-up note from the file.']]));
  // "The checked Excel file": from the local server, "Preparing…" while it comes; a refusal is said.
  let release;
  answer = () => new Promise((r) => (release = () => r({ blob: 'made-up bytes', fileName: 'flipkart-orders checked 2026-10-14.xlsx' })));
  byId(s.page(), 'download-excel').attrs.onclick({});
  await settle();
  assert.deepEqual([summary(), items()[0][2]], ['Preparing…', true]);
  release();
  await settle();
  assert.deepEqual(local.calls.filter((c) => c.blob).map((c) => c.path), ['/local/flipkart/sheet/checked.xlsx']);
  assert.deepEqual([summary(), saves[1]], ['Download', { name: 'flipkart-orders checked 2026-10-14.xlsx', data: 'made-up bytes', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]);
  answer = () => {
    throw new ApiError(400, 'The Type cell of Row 2 holds a formula, so a result cannot be written there.');
  };
  byId(s.page(), 'download-excel').attrs.onclick({});
  await settle();
  assert.match(textOf(byId(s.page(), 'main-actions')), /The Type cell of Row 2 holds a formula, so a result cannot be written there\./);
  // A CSV file: no Excel file to fill in.
  const csv = await opened(fakeLocal({ saved: { ...CSV_SAVED, types: TYPES } }));
  const excel = byId(csv.page(), 'download-excel');
  assert.deepEqual([Boolean(excel.attrs.disabled), excel.attrs.title, Boolean(byId(csv.page(), 'download-csv').attrs.disabled)], [true, 'Needs an Excel file uploaded.', false]);
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
  // What the purchase screenshot says, on the row's page.
  add(await rowScreen(fakeLocal({ saved: SAVED, pages: { r000000000001: { row: PICTURED, result: LAST_CHECK_READ } } })));
  // "Start checking": the rows checked one by one, with the checking area beside the table, then paused.
  const runLocal = fakeLocal({ saved: SAVED });
  const running = await opened(runLocal);
  let pause;
  runLocal.checking = (onEvent) => {
    onEvent({ event: 'run-started', again: false, total: 3, done: 0, left: 3 });
    onEvent({ event: 'row', rowId: 'r000000000001', label: 'Row 1', total: 3, done: 0, left: 3 });
    onEvent({ event: 'step', step: { n: 1, name: STEP_NAMES[0], state: 'running', detail: null } });
    return new Promise((resolve) => (pause = () => {
      onEvent({ event: 'paused', kind: 'google-out', says: RUN_GOOGLE_OUT, rowId: 'r000000000001', label: 'Row 1', checked: 0, total: 3, done: 0, left: 3 });
      resolve({ ok: true });
    }));
  };
  byId(running.page(), 'start-checking').attrs.onclick();
  await settle();
  add(running);
  pause();
  await settle();
  add(running);
  // The Status cards with one pressed, a result changed by staff in the table, and "Change the result" open on a row's page.
  const staffRow = { ...SAVED.rows[0], done: true, final: 'pass', last: { checkId: null, final: 'pass', finalSays: null, status: 'Pass', type: 'Verified', typeKey: 'verified', note: 'Made-up.', at: '2026-10-15T06:00:00.000Z', seconds: null, staff: { at: '2026-10-15T06:00:00.000Z', right: false, was: null } } };
  const staffLocal = fakeLocal({ saved: { ...SAVED, rows: [staffRow, SAVED.rows[1], SAVED.rows[2]], types: TYPES }, pages: { r000000000001: { row: staffRow, result: LAST_CHECK } } });
  const staffMain = await opened(staffLocal);
  byId(staffMain.page(), 'count-pass').attrs.onclick();
  add(staffMain);
  const staffPage = await rowScreen(staffLocal);
  byId(staffPage.page(), 'change-result').attrs.onclick();
  add(staffPage);
  // "Prepare email" open on a row's page, and the Download button while the checked Excel file is prepared.
  const mailRow = { ...staffRow, shots: PICTURED.shots, emailKey: 'reviewNotLive' };
  const mailPage = await rowScreen(fakeLocal({ saved: { ...SAVED, rows: [mailRow, SAVED.rows[1], SAVED.rows[2]], types: TYPES }, pages: { r000000000001: { row: mailRow, result: LAST_CHECK } }, emails: { r000000000001: EMAIL } }));
  byId(mailPage.page(), 'prepare-email').attrs.onclick();
  await settle();
  add(mailPage);
  const preparing = await opened(fakeLocal({ saved: SAVED, file: () => new Promise(() => {}) }));
  byId(preparing.page(), 'download-excel').attrs.onclick({});
  await settle();
  add(preparing);
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
  // "Start checking" and the live checking area beside the table look like the Amazon ones too.
  for (const [mine, theirs] of [
    ['.fk-overview', '.overview'], ['.fk-main-actions', '.main-actions'],
    ['.fk-rows-layout.fk-with-live', '.rows-layout.with-live'], ['.fk-rows-main', '.rows-main'], ['.fk-rows-main > .fk-empty-state', '.rows-main > .empty-state'], ['.fk-with-live .fk-rows-wrap', '.with-live .rows-wrap'],
    ['.fk-rows-table tbody tr.fk-current-row > td', '.rows-table tbody tr.current-row > td'], ['.fk-rows-table tbody tr.fk-current-row > td:first-child', '.rows-table tbody tr.current-row > td:first-child'],
    ['.fk-live-panel', '.live-panel'], ['.fk-live-head', '.live-head'], ['.fk-live-head h2', '.live-head h2'], ['.fk-run-progress', '.run-progress'], ['.fk-live-links', '.live-links'], ['.fk-live-flat, .fk-steps-flat', '.live-flat, .steps-flat'],
    // What the purchase and delivery screenshots say, and the comparison table, as on Amazon.
    ['.fk-ocr-text', '.ocr-text'], ['.fk-read details > summary', '.card details:not(.fold):not(.menu) > summary'],
    ['.fk-comparison-table th[scope="row"]', '.comparison-table th[scope="row"]'], ['.fk-cell-text', '.cell-text'], ['.fk-result-cell', '.result-cell'],
  ]) {
    assert.ok(rule(amazonCss, theirs), `${theirs} is an Amazon rule`);
    assert.equal(rule(css, mine), rule(amazonCss, theirs), `${mine} is the same as ${theirs}`);
  }
  // The Status cards, the Status and Type boxes, and a result changed by staff look like the Amazon ones too.
  for (const [mine, theirs] of [
    ['.fk-final-cards', '.final-cards'], ['.fk-final-card', '.final-card'], ['.fk-final-card:hover', '.final-card:hover'], ['.fk-final-card:active', '.final-card:active'],
    ['.fk-final-card-label', '.final-card-label'], ['.fk-final-card-label .icon', '.final-card-label .icon'], ['.fk-final-card-num', '.final-card-num'],
    ...['pass', 'fail', 'manual'].flatMap((k) => [[`.fk-final-card-${k} .fk-final-card-label`, `.final-card-${k} .final-card-label`], [`.fk-final-card-${k} .icon`, `.final-card-${k} .icon`]]),
    ['.fk-final-card-none .fk-final-card-label', '.final-card-none .final-card-label'],
    ...['pass', 'fail', 'manual', 'none'].map((k) => [`.fk-final-card-${k}[aria-pressed="true"]`, `.final-card-${k}[aria-pressed="true"]`]),
    ['.fk-filters', '.filters'], ['.fk-filter', '.filter'], ['.fk-filter-word', '.filter-word'], ['.fk-filter select', '.filter select'], ['.fk-rows-card > div > .notice', '.rows-card > div > .notice'],
    ['.fk-staff-line', '.staff-line'], ['.fk-staff-stats', '.staff-stats'], ['.fk-edit-result textarea, .fk-email-item textarea', '.edit-result textarea, .email-item textarea, .template textarea, .sign-off textarea'],
  ]) {
    assert.ok(rule(amazonCss, theirs), `${theirs} is an Amazon rule`);
    assert.equal(rule(css, mine), rule(amazonCss, theirs), `${mine} is the same as ${theirs}`);
  }
  const small = (src) => src.match(/@media \(max-width: 760px\) \{([^]*?)\n\}/)?.[1] ?? null;
  assert.equal(small(css), small(amazonCss).replaceAll('.final-card', '.fk-final-card').replace('.account, .filters, .slim-actions', '.fk-account, .fk-filters, .fk-slim-actions'), 'in a narrow window, two cards to a line, as on Amazon');
  for (const cls of ['fk-final-cards', 'fk-final-card', 'fk-final-card-pass', 'fk-final-card-fail', 'fk-final-card-manual', 'fk-final-card-none', 'fk-final-card-label', 'fk-final-card-num', 'fk-filters', 'fk-filter', 'fk-filter-word', 'fk-staff-line', 'fk-staff-stats', 'fk-edit-result', 'fk-form-grid', 'fk-form-field', 'fk-wide']) assert.ok(used.has(cls), `${cls} is drawn in one of the states`);
  // The email box ("Prepare email") and the Download button look like the Amazon ones too; the Copy buttons are Flipkart's own.
  for (const [mine, theirs] of [
    ['.fk-email-item textarea', '.email-item textarea'], ['.fk-email-panel .card-head h2', '.email-panel .card-head h2'], ['.fk-email-panel .card-head .icon', '.email-panel .card-head .icon, .templates h3 .icon'],
    ['.fk-email-item', '.email-item'], ['.fk-email-item:first-of-type', '.email-item:first-of-type'], ['.fk-email-head', '.email-head'], ['.fk-email-head h3', '.email-head h3'], ['.fk-email-to', '.email-to'],
    ['.fk-menu', '.menu'], ['.fk-menu > summary', '.menu > summary'], ['.fk-menu > summary::-webkit-details-marker', '.menu > summary::-webkit-details-marker'], ['.fk-menu-chevron', '.menu-chevron'], ['.fk-menu[open] .fk-menu-chevron', '.menu[open] .menu-chevron'],
    ['.fk-menu-item', '.menu-item'], ['.fk-menu-item:hover:not(:disabled)', '.menu-item:hover:not(:disabled)'], ['.fk-menu-item:disabled', '.menu-item:disabled'], ['.fk-menu-item .icon', '.menu-item .icon'], ['.fk-menu-words', '.menu-words'], ['.fk-menu-note', '.menu-note'], ['@keyframes fk-menu-in', '@keyframes menu-in'],
  ]) {
    assert.ok(rule(amazonCss, theirs), `${theirs} is an Amazon rule`);
    assert.equal(rule(css, mine), rule(amazonCss, theirs), `${mine} is the same as ${theirs}`);
  }
  assert.equal(rule(css, '.fk-menu-list'), rule(amazonCss, '.menu-list').replace('menu-in', 'fk-menu-in'), 'the Download menu, opening the same way');
  for (const cls of ['fk-email-panel', 'fk-email-item', 'fk-email-head', 'fk-email-to', 'fk-copy-line', 'fk-copy-head', 'fk-shot-actions', 'fk-menu', 'fk-menu-chevron', 'fk-menu-list', 'fk-menu-item', 'fk-menu-words', 'fk-menu-note']) assert.ok(used.has(cls), `${cls} is drawn in one of the states`);
  const wide = (src) => src.match(/@media \(max-width: 1200px\) \{([^]*?)\n\}/)?.[1] ?? null;
  assert.equal(wide(css), wide(amazonCss).replaceAll('.rows-layout.with-live', '.fk-rows-layout.fk-with-live').replaceAll('.live-panel', '.fk-live-panel'), 'in a narrower window, the checking area goes under the table, as on Amazon');
  for (const cls of ['fk-overview', 'fk-main-actions', 'fk-rows-layout', 'fk-with-live', 'fk-rows-main', 'fk-current-row', 'fk-live-panel', 'fk-live-head', 'fk-run-progress', 'fk-live-links', 'fk-live-flat', 'fk-steps-flat', 'fk-read', 'fk-ocr-text', 'fk-comparison-table', 'fk-cell-text', 'fk-result-cell', 'fields', 'field-row']) assert.ok(used.has(cls), `${cls} is drawn in one of the states`);
  for (const name of ['about-file', 'columns', 'column-grid', 'req', 'opt', 'col-letter', 'row-cell', 'strong-cell', 'product-cell', 'status-cell', 'type-cell', 'note-cell', 'cell-words', 'link-cell', 'other-cell', 'link-label', 'nolink', 'link-warning', 'empty-cell', 'empty-state', 'rows-wrap', 'rows-count']) {
    assert.ok(rule(amazonCss, `.${name}`), `.${name} is an Amazon rule`);
    assert.equal(rule(css, `.fk-${name}`), rule(amazonCss, `.${name}`), `.fk-${name} is the same as .${name}`);
  }
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.deepEqual([...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]), ['styles.css', 'views/amazon.css', 'views/flipkart.css']);
});
