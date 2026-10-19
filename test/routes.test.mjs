// The dashboard's routes, over HTTP: the session token, this page only, POST
// only here; uploading the orders sheet, which makes its rows at once from
// the "Amazon" tab with nothing downloaded; a column that cannot be found;
// a row's pictures downloaded when it is checked; the campaigns, with their
// products read from pretend Amazon pages; the duplicate choice; one check; checking the rows one by one, from the first
// row with no result, with its pauses, Stop and "Check every row again"; the
// checked Excel file; rows added by hand; removing rows. A fake check, a
// fake Live Amazon Browser and pretend downloads: nothing reaches Amazon,
// Google Drive or any other website.
// Run: node test/routes.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { createHandler, createSessions, bearerOf } from '../serve.mjs';
import { createStore, KEPT_PAGES } from '../amazon/store.js';
import { createAmazonRoutes, parseMultipart, rowView, rupees, finalOfRow, resultWords, renumbered, rowNumbers, resultView } from '../amazon/routes.js';
import { FINAL_WORDS, TYPE_FINAL } from '../amazon/final.js';
import { STEP_NAMES, PAUSE_SAYS } from '../amazon/check.js';
import { checkSettings, typeWord, SettingsError, saveEmails } from '../amazon/settings.js';
import { EMAIL_KEYS, DEFAULT_EMAILS } from '../amazon/emails.js';
import { EMAIL_PAUSE_SAYS } from '../amazon/gmail.js';
import { readZip, replaceInZip } from '../amazon/zip.js';
import { createLogin } from '../amazon/login.js';
import { AMAZON_HOME, SIGN_IN_URL } from '../amazon/links.js';
import { tabsOf } from '../amazon/ooxml.js';
import { READ_PAUSE_SAYS } from '../amazon/campaigns.js';
import { FILE, HEADER, PRODUCTS, orderShot, deliveryShot, reviewLink } from './fixtures/sheets/make-orders.mjs';
import { newLayoutBook, NEW_FILE_NAME, NEW_TAB, NEW_HEADER, NEW_ROWS, newOrderId } from './fixtures/sheets/new-layout.mjs';
import { assertPlain } from './plain-words.mjs';
import { pdfToPicture, preparePicture } from '../amazon/picture-fix.js';
import { imageType } from '../amazon/image-type.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = join(ROOT, 'test', 'fixtures');
const PNG = readFileSync(join(FIX, 'amazon', 'order-floor-cleaner.png'));
const DELIVERY_PNG = readFileSync(join(FIX, 'amazon', 'delivery-floor-cleaner.png'));
const ORDERS = readFileSync(FILE);
const SETTINGS = checkSettings({ secondsBetweenDownloads: 0.05 });

const dataDir = mkdtempSync(join(tmpdir(), 'arc-routes-'));
after(() => rm(dataDir, { recursive: true, force: true }));
const store = createStore(dataDir);
await store.init();

// ---- fakes ----

const checks = [];
const aborts = [];
const plan = new Map(); // rowId -> { typeKey, final, finalSays, paused, note, askPictures, reviewId, alsoDuplicate, hold, onStart }
let release = null;
async function fakeCheck({ row, others, settings, pictures, emit, checkId, shotsDir, pagesDir, signal, duplicateRule, campaigns, has, reviewer }) {
  const entry = { rowId: row.id, checkId, pagesDir, duplicateRule, campaigns, has, reviewer, others: others.length };
  checks.push(entry);
  signal?.addEventListener('abort', () => aborts.push(row.id), { once: true });
  emit({ event: 'started', checkId, steps: STEP_NAMES, rowId: row.id });
  let p = plan.get(row.id) ?? {};
  if (p.onStart) await p.onStart();
  if (p.askPictures) entry.pictures = await pictures(p.askPictures);
  // A download that pauses (no Google login, Google's login page, a robot check or a block) pauses the check, as the real check does.
  if (entry.pictures?.pause) p = { ...p, paused: entry.pictures.pause };
  emit({ event: 'step', step: { n: 1, name: STEP_NAMES[0], state: 'pass', detail: 'No duplicates.' } });
  writeFileSync(join(shotsDir, 'step-6.png'), PNG);
  if (pagesDir) writeFileSync(join(pagesDir, 'review.html'), '<!doctype html><title>review</title>');
  if (release) await release;
  if (p.hold) await p.hold;
  const typeKey = p.paused ? null : p.typeKey ?? 'verified';
  const result = {
    checkId,
    rowId: row.id,
    row: row.row,
    n: row.n ?? null,
    numbered: true,
    typeKey,
    type: typeKey ? typeWord(typeKey, settings) : null,
    // The Status: Pass, Fail or Needs Manual Staff Checking, as the real check writes it.
    status: typeKey ? FINAL_WORDS[p.final ?? TYPE_FINAL[typeKey]] : null,
    note: typeKey ? p.note ?? `A test note for ${row.source === 'sheet' ? `row ${row.n}` : 'a row added by hand'}.` : null,
    final: p.final,
    finalSays: p.finalSays ?? null,
    steps: [{ n: 6, name: STEP_NAMES[5], state: 'pass', detail: null, shot: `/local/amazon/checks/${checkId}/steps/6` }],
    paused: p.paused ? { kind: p.paused, says: PAUSE_SAYS[p.paused], step: 6 } : null,
    stopped: Boolean(signal?.aborted),
    finishedAt: new Date().toISOString(),
    reviewId: p.reviewId ?? null,
    alsoDuplicate: p.alsoDuplicate ?? [],
    liveAt: null,
  };
  emit({ event: 'done', result });
  return result;
}
// The Live Amazon Browser: pretend Amazon pages for a campaign's products (pages), and every address it was asked to open.
let pages = null;
const opened = [];
const live = { isOpen: () => false, begin: async () => {}, open: async (url) => (opened.push(url), pages?.(url) ?? { ok: false, message: 'The page could not be opened.' }), close: async () => {}, readAccount: async () => null };
/** A pretend Amazon product page, as the Live Amazon Browser reads it. */
const productPage = (asin, title, { brand = 'Test Brand', byline = null, variants = {} } = {}) => {
  const url = `https://www.amazon.in/dp/${asin}`;
  return { ok: true, status: 200, url, facts: { url, title: `Amazon.in: ${title}`, text: title, productTitle: title, pageAsin: asin, variantAsins: Object.keys(variants), variantNames: variants, byline, brandRow: brand, reviews: [], productLinks: [] } };
};
const KIT_NAME = 'Test Brand Monthly Home Cleaning Kit | Dishwash Liquid 2L Refill, Floor Cleaner 1L | Plant-Based Formula';
const FLOOR_NAME = 'Test Brand Floor Cleaner Liquid, Lavender, 1 Litre';
const campaignNamed = async (name) => (await rowsNow()).campaigns.find((c) => c.name === name);
const readingDone = () => until(async () => (await runningNow()) === null, "the campaign's products are read");
let thumbnailGate = null;
const images = {
  analyse: async (file) => ({ fingerprint: createHash('sha256').update(readFileSync(file)).digest('hex').repeat(9).slice(0, 576), starGroups: [] }),
  thumbnail: async (file) => {
    const data = readFileSync(file);
    if (thumbnailGate) await thumbnailGate;
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), createHash('sha256').update(data).digest()]);
  },
};
const downloads = []; // { link, at }
const privateNow = new Set(['1TestOrderRow05abcdefgh', '1TestOrderRow06abcdefgh']);
/** Pretend answers: a picture for most links; Google Drive refuses two files; tryboxs.in refuses; www.tryboxs.in is too large. */
async function fakeDownload(link, { allowed, fetch }) {
  // viaLogin: the Live Amazon Browser's own download was given, which carries its Google login.
  downloads.push({ link, at: Date.now(), allowed, viaLogin: typeof fetch === 'function' });
  const u = new URL(link);
  if (u.hostname === 'tryboxs.in') return { ok: false, kind: 'access', site: 'tryboxs.in', says: 'the website refused to give it' };
  if (u.hostname === 'www.tryboxs.in') return { ok: false, kind: 'access', site: 'www.tryboxs.in', says: 'the picture is larger than 10 megabytes, so it was not downloaded' };
  if ([...privateNow].some((id) => link.includes(id))) return { ok: false, kind: 'drive', site: 'Google Drive', says: NO_ACCESS, noAccess: true };
  // A file saved as a PDF: downloaded as one, to be turned into a picture on this computer.
  if ([...pdfNow].some((id) => link.includes(id))) return { ok: true, data: PDF, type: 'application/pdf', site: 'Google Drive' };
  // A picture larger than the lab's limit: downloaded as it is, to be made smaller on this computer.
  if ([...bigNow].some((id) => link.includes(id))) return { ok: true, data: bigPicture, type: 'image/png', site: 'Google Drive' };
  if (pauseNext) {
    const pause = pauseNext;
    pauseNext = null;
    return { ok: false, kind: 'drive', site: 'Google Drive', says: 'Google asked to log in', pause };
  }
  return { ok: true, data: Buffer.concat([u.pathname.includes('Delivery') ? DELIVERY_PNG : PNG, Buffer.from(`\n${link}`)]), type: 'image/png', site: u.hostname };
}
const NO_ACCESS = 'the Google account logged in to the dashboard has no access to the file';
const PDF = readFileSync(join(FIX, 'amazon', 'order-two-pages.pdf'));
const pdfNow = new Set(); // Google Drive links that are PDFs
const bigNow = new Set(); // Google Drive links whose picture is larger than the lab's limit
let bigPicture = PNG; // the picture those links give (a test sets a larger one)
let pauseNext = null; // the next Google Drive download answers with Google's login page, a robot check or a block
// A stand-in for the Google login: logged in, so the Google Drive files are downloaded, unless a test says otherwise.
const googleNow = { state: 'in', name: 'Test Google', next: null, checks: [], pressed: [] };
const google = {
  view: () => ({ state: googleNow.state, name: googleNow.state === 'in' ? googleNow.name : null, says: null, chrome: googleNow.state === 'waiting' }),
  busy: false,
  async check(why) {
    googleNow.checks.push(why);
    if (googleNow.next) googleNow.state = googleNow.next;
    googleNow.next = null;
    return google.view();
  },
  async logIn(why) {
    googleNow.pressed.push(['log-in', why]);
    googleNow.state = 'waiting';
    return google.view();
  },
  async logInInChrome(why) {
    googleNow.pressed.push(['chrome', why]);
    return google.view();
  },
  async done(why) {
    googleNow.pressed.push(['done', why]);
    googleNow.state = 'in';
    return google.view();
  },
  loggedOut() {
    googleNow.state = 'out';
  },
  async close() {},
};

const sessions = createSessions();
const routes = createAmazonRoutes({ store, live, images, auth: (req) => sessions.verify(bearerOf(req)), check: fakeCheck, download: fakeDownload, settings: async () => SETTINGS, google });
const server = createServer(createHandler({ root: ROOT, sessions, local: routes }));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
after(() => {
  server.closeAllConnections();
  server.close();
});
const port = server.address().port;
const TOKEN = sessions.get().token;

const said = []; // every message and line the routes gave, for the plain-words test at the end
function call(method, path, { body = null, type = null, token = TOKEN, site = 'same-origin', host = 'localhost:8093', onRequest = null, at = port, limitMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (site) headers['Sec-Fetch-Site'] = site;
    if (type) headers['Content-Type'] = type;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    const req = request({ host: '127.0.0.1', port: at, path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        try {
          json = JSON.parse(buf.toString('utf8'));
        } catch {
          json = null;
        }
        const text = buf.toString('utf8');
        const lines = /ndjson/.test(res.headers['content-type'] ?? '') && text.trim() ? text.trim().split('\n').map((l) => JSON.parse(l)) : [];
        said.push(json?.message, ...lines.map((l) => l.says));
        resolve({ status: res.statusCode, headers: res.headers, buf, json, text, lines });
      });
      res.on('error', () => resolve({ status: res.statusCode, aborted: true }));
    });
    req.on('error', (e) => (e.code === 'ECONNRESET' ? resolve({ status: 0, aborted: true }) : reject(e)));
    req.setTimeout(limitMs, () => req.destroy(Object.assign(new Error(`No answer within ${limitMs / 1000} seconds: ${method} ${path}`), { code: 'NO_ANSWER' })));
    if (body) req.write(body);
    req.end();
    onRequest?.(req);
  });
}
const json = (method, path, value, opts = {}) => call(method, path, { body: JSON.stringify(value ?? {}), type: 'application/json', ...opts });
function multipart(fields, files = []) {
  const boundary = `----arcTest${Math.random().toString(16).slice(2)}`;
  const parts = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const f of files) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), f.data, Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${boundary}` };
}
const rowsNow = async (opts = {}) => (await call('GET', '/local/amazon/rows', opts)).json;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(test, what, ms = 5000) {
  const end = Date.now() + ms;
  while (!(await test())) {
    if (Date.now() > end) throw new Error(`Timed out waiting for: ${what}`);
    await sleep(10);
  }
}
const runningNow = async (opts = {}) => (await call('GET', '/local/amazon/account', opts)).json.running;
const byRow = (rows, n) => rows.find((r) => r.row === n);

// ---- tests ----

test('a form as the browser sends it is read, with many files under one name', async () => {
  const fd = new FormData();
  fd.append('product', 'Test Brand Floor Cleaner — मज़बूत');
  fd.append('files', new Blob([PNG]), 'order-4.png');
  fd.append('files', new Blob([DELIVERY_PNG]), 'delivery-4.png');
  const r = new Response(fd);
  const { fields, files, fileList } = parseMultipart(Buffer.from(await r.arrayBuffer()), r.headers.get('content-type'));
  assert.equal(fields.product, 'Test Brand Floor Cleaner — मज़बूत');
  assert.equal(files.files.filename, 'order-4.png');
  assert.deepEqual(fileList.map((f) => f.filename), ['order-4.png', 'delivery-4.png']);
});

test("every route wants this page's session token, from this page only; POST only on the dashboard's routes", async () => {
  assert.equal((await call('GET', '/local/amazon/rows', { token: null })).status, 401);
  assert.equal((await call('GET', '/local/amazon/rows', { token: 'nope' })).status, 401);
  assert.equal((await call('POST', '/local/amazon/rows', { site: 'cross-site', ...multipart({ orderId: 'x' }) })).status, 403, 'another site cannot post here, token or not');
  assert.equal((await call('GET', '/local/amazon/account', { site: 'same-site' })).status, 403);
  assert.equal((await call('GET', '/local/amazon/rows', { host: 'evil.example:8093' })).status, 421);
  const ok = await call('GET', '/local/amazon/rows');
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.json.rows, ok.json.oldRows, ok.json.sheet, ok.json.settingsProblem], [[], 0, null, null]);
  assert.equal('duplicateRule' in ok.json, false, 'there is no duplicate choice any more');
  assert.equal(ok.json.types.length, 23);
  assert.deepEqual(ok.json.types.slice(0, 3), [{ key: 'verified', word: 'Verified', status: 'Pass' }, { key: 'ratingOnly', word: 'Rating Only', status: 'Pass' }, { key: 'duplicate', word: 'Duplicate', status: 'Fail' }]);
  for (const k of Object.keys(ok.headers)) assert.ok(!k.startsWith('access-control-'), k);
  assert.equal(ok.headers['cache-control'], 'no-store');
  assert.equal((await call('POST', '/index.html')).status, 405, 'files stay GET and HEAD only');
  assert.equal((await call('PUT', '/local/amazon/rows')).status, 405);
  assert.equal((await call('POST', '/local/amazon/nothing-here')).status, 404);
  for (const p of ['/data/rows.json', '/data/settings.json', '/settings.json', '/data/sheet/upload.xlsx']) assert.equal((await call('GET', p)).status, 404, `${p} is never served`);
});

test('uploading the orders sheet makes a row of every order at once, from the "Amazon" tab only: nothing is downloaded and no link is opened', async () => {
  const started = Date.now();
  const up = await call('POST', '/local/amazon/sheet', multipart({}, [{ field: 'file', name: 'July orders.xlsx', data: ORDERS }]));
  assert.equal(up.status, 200, up.text);
  assert.ok(Date.now() - started < 10_000, `answered in ${Date.now() - started} ms`);
  assert.deepEqual([up.json.made, up.json.tab, up.json.unplaced], [30, 'Amazon', []]);
  assert.equal(downloads.length, 0, 'no picture is downloaded when the sheet is uploaded');
  const s = up.json.sheet;
  assert.deepEqual([s.kind, s.fileName, s.tab, s.used], ['xlsx', 'July orders.xlsx', 'Amazon', true]);
  assert.deepEqual(s.mapping, { orderId: 1, orderDate: 2, amount: 3, product: 4, orderShot: 5, deliveryShot: 6, reviewShot: null, reviewLink: 7, reviewer: null, email: null, status: 8, type: 9, note: null }, 'every column found by its name in the heading row');
  assert.deepEqual(s.has, ['orderId', 'orderDate', 'amount', 'product', 'orderShot', 'deliveryShot', 'reviewLink', 'status', 'type'], 'the fields the file has a column for');
  assert.deepEqual(
    s.columns.map((c) => `${c.letter}: ${c.name}${c.added ? ' (new)' : ''}`),
    ['A: Order ID', 'B: Order Date', 'C: Amount', 'D: Product Ordered', 'E: Order Screenshot', 'F: Delivery Screenshot', 'G: Live Review Link', 'H: Status', 'I: Type', 'J: Note (new)'],
    'no Note column: the Notes go in a new column J, headed "Note"; no other column is added',
  );
  const view = await rowsNow();
  assert.doesNotMatch(JSON.stringify([up.json, view]), /Instamart|Flipkart/, 'no other tab is listed or mentioned');

  const { rows } = view;
  assert.deepEqual(rows.map((r) => r.row), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32], "the sheet's own row numbers, in its order");
  const two = byRow(rows, 2);
  assert.deepEqual([two.label, two.n], ['Row 1', 1], 'the first row under the heading row is Row 1 on the dashboard');
  assert.deepEqual(rows.map((r) => r.n), rows.map((_, i) => i + 1), 'numbered from 1 in the sheet\'s order; the empty row 29 is not counted');
  assert.deepEqual([byRow(rows, 30).label, byRow(rows, 30).row], ['Row 28', 30], 'row 30 of the file comes after the empty row 29');
  assert.deepEqual([two.orderId, two.orderDate, two.amount, two.product], ['403-1000002-2000002', '20-07-2026', '₹654', PRODUCTS[0]]);
  assert.deepEqual([byRow(rows, 3).orderDate, byRow(rows, 3).amount], ['14-07-2026', '₹851.95'], 'a date written as words, day first; an amount with paise');
  assert.deepEqual([byRow(rows, 4).amount, byRow(rows, 5).amount, byRow(rows, 5).orderDate], ['₹499', '₹654', '20-07-2026']);
  assert.deepEqual(two.cells, { orderId: 'A2', orderDate: 'B2', amount: 'C2', product: 'D2', orderShot: 'E2', deliveryShot: 'F2', reviewLink: 'G2', status: 'H2', type: 'I2' });
  assert.deepEqual(two.shots.order.pictures, [], 'pictures are opened only when the row is checked');
  assert.deepEqual(two.shots.order.labels, [{ link: orderShot(2), label: 'Google Drive' }]);
  const label = (n, which) => byRow(rows, n).shots[which].labels.map((x) => x.label);
  assert.deepEqual(label(2, 'review'), ['Amazon review']);
  assert.deepEqual([label(3, 'delivery'), label(4, 'delivery'), label(5, 'delivery')], [['storage.googleapis.com'], ['tryboxs'], ['tryboxs']]);
  assert.deepEqual([label(6, 'review'), label(7, 'review'), label(8, 'review'), label(9, 'review'), label(10, 'review')], [['Amazon email link'], ['Amazon short link'], ['Amazon short link'], ['Amazon page for the writer only'], ['Amazon page for the writer only']]);
  assert.deepEqual([label(11, 'review'), label(12, 'review'), label(13, 'review'), label(14, 'review')], [['Google Drive'], ['tryboxs'], ['storage.googleapis.com'], []]);
  assert.deepEqual(label(30, 'order'), ['Google Drive', 'Google Drive'], 'both links of a cell with two');
  assert.deepEqual([byRow(rows, 15).shots.delivery.text, byRow(rows, 17).shots.delivery.text, label(15, 'delivery')], ['Cancelled', '0', []], 'words in a link cell, as they are');
  assert.deepEqual([byRow(rows, 31).shots.order.words, label(31, 'order')], ['Open the screenshot', ['Google Drive']], 'words that are not a link, with the link behind them');
  assert.equal(two.shots.order.words, '', 'words that are the link itself are not said twice');
  const mismatch = byRow(rows, 24).shots.review;
  assert.deepEqual(mismatch.mismatch, { text: 'https://drive.google.com/open?id=1TestReviewRow25abcdefg', link: 'https://www.amazon.in/review/R1TESTROW24ABC/' });
  assert.deepEqual(mismatch.labels, [{ link: 'https://www.amazon.in/review/R1TESTROW24ABC/', label: 'Amazon review' }], 'the label opens the link behind the cell');
  assert.equal(two.reviewKind, 'amazon');
  assert.equal(byRow(rows, 14).reviewKind, 'empty');
  assert.ok(!JSON.stringify(rows).match(/sha256|fingerprint|"file"|r[0-9a-f]{12}-(order|delivery|review)-\d/), 'no file name, hash or fingerprint is ever sent to the page');
  assert.deepEqual(new Set(rows.map((r) => r.product)), new Set(PRODUCTS));
  assert.deepEqual(readdirSync(join(dataDir, 'pictures')).filter((f) => f !== 'small'), [], 'no picture kept yet');
  for (const p of [`/local/amazon/rows/${two.id}/picture/order/0`, `/local/amazon/rows/${two.id}/picture/other/0`, '/local/amazon/rows/r000/small/order/0', '/local/amazon/rows/..%2f..%2frows.json/picture/order/0']) {
    assert.equal((await call('GET', p)).status, 404, p);
  }
  for (const gone of ['/local/amazon/sheet/tab', '/local/amazon/sheet/columns']) assert.equal((await json('POST', gone, {})).status, 404, `${gone} is gone`);
});

test('amounts in rupees, as the table shows them', () => {
  assert.deepEqual([rupees(654), rupees(851.95), rupees(851.9), rupees(1299), rupees(129999.5), rupees(0)], ['₹654', '₹851.95', '₹851.90', '₹1,299', '₹1,29,999.50', '₹0']);
  assert.deepEqual([rupees(null), rupees(undefined), rupees(Number.NaN), rupees(-5)], [null, null, null, null]);
  assert.equal(rowView({ id: 'r000000000001', source: 'sheet', row: 2, amount: { text: 'NA', value: null } }).amount, 'NA', 'words that are not an amount, as they are');
});

test('a needed column that cannot be found (only the order ID, or a review link or review screenshot): nothing changes, one sentence says which, and the file sent again with the columns chosen makes the rows', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Amazon');
  ws.addRow(['Order ID', 'Order Date', 'Rupees', 'Product Ordered', 'Order Screenshot', 'Delivery Screenshot', 'Feedback', 'Status', 'Type']);
  ws.addRow(['403-1000002-2000002', '20-07-2026', 654, PRODUCTS[0], orderShot(2), deliveryShot(2), reviewLink(2)]);
  const file = Buffer.from(await wb.xlsx.writeBuffer());
  const l = await lab();
  try {
    const first = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'x.xlsx', data: file }]) });
    assert.equal(first.status, 200, first.text);
    const c = first.json.columns;
    assert.equal(c.says, 'No column of this file could be found for the review link or the review screenshot, so choose one of them below (every other column can be left as "Not in this file").');
    assert.deepEqual([c.mapping.reviewLink, c.mapping.reviewShot, c.mapping.amount, c.mapping.orderId, c.tab, c.kind], [null, null, 3, 1, 'Amazon', 'xlsx'], '"Rupees" is the amount');
    assert.deepEqual(c.headers.map((x) => x.text).slice(0, 3), ['Order ID', 'Order Date', 'Rupees']);
    const still = await rowsNow(l.opts);
    assert.deepEqual([still.rows, still.sheet], [[], null], 'nothing changed');
    const twice = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({ mapping: JSON.stringify({ ...c.mapping, reviewLink: 7, note: 7 }) }, [{ field: 'file', name: 'x.xlsx', data: file }]) });
    assert.equal(twice.status, 400);
    assert.equal(twice.json.message, 'One column cannot hold two things: Review link and Note.');
    const made = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({ mapping: JSON.stringify({ ...c.mapping, reviewLink: 7 }) }, [{ field: 'file', name: 'x.xlsx', data: file }]) });
    assert.equal(made.status, 200, made.text);
    assert.equal(made.json.made, 1);
    const [row] = (await rowsNow(l.opts)).rows;
    assert.equal(row.amount, '₹654');
    const again = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'x.xlsx', data: file }]) });
    assert.equal(again.json.made, 1, 'the choice is remembered: the same file needs nothing chosen the next time');
    const several = new ExcelJS.Workbook();
    several.addWorksheet('Amazon').addRow(['Reference', 'When', 'Money', 'Product Ordered', 'Order Screenshot', 'Delivery Screenshot', 'Remarks']);
    const two = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'y.xlsx', data: Buffer.from(await several.xlsx.writeBuffer()) }]) });
    assert.equal(two.json.columns.says, 'No column of this file could be found for the order ID, nor for the review link or the review screenshot, so choose them below (every other column can be left as "Not in this file").');
  } finally {
    await l.close();
  }
});

test('a file laid out differently, uploaded over the old one, is read by itself: the table gets every column of the file in its order, then Status, Type and Note; the lines under the upload line say what is used, what is missing and which campaign the rows use', async () => {
  const l = await lab();
  try {
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'orders.xlsx', data: ORDERS }]) });
    await json('POST', '/local/amazon/campaigns', { brand: 'Testbrand', name: 'Testbrand Men', live: true, products: 'B0TESTMEN1' }, l.opts);
    await until(async () => (await runningNow(l.opts)) === null, "the campaign's product was looked at");
    const up = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({ replace: '1' }, [{ field: 'file', name: NEW_FILE_NAME, data: await newLayoutBook() }]) });
    assert.equal(up.status, 200, up.text);
    assert.equal(up.json.columns, undefined, 'no column chooser');
    assert.deepEqual([up.json.made, up.json.tab], [NEW_ROWS.length, NEW_TAB]);
    const view = await rowsNow(l.opts);
    const s = view.sheet;
    assert.deepEqual(s.columns.map((c) => `${c.letter}: ${c.name}${c.added ? ' (new)' : ''}`), ['A: Reviewer Name', 'B: Order ID', 'C: Amount', 'D: Product Ordered', 'E: Order Screenshot', 'F: Delivery Screenshot', 'G: Review Screenshot', 'H: Review Link', 'I: Status (new)', 'J: Type (new)', 'K: Note (new)']);
    assert.deepEqual(s.columns.map((c) => c.key), ['reviewer', 'orderId', 'amount', 'product', 'orderShot', 'deliveryShot', 'reviewShot', 'reviewLink', 'status', 'type', 'note']);
    assert.deepEqual(s.has, ['orderId', 'amount', 'product', 'orderShot', 'deliveryShot', 'reviewShot', 'reviewLink', 'reviewer'], 'no order date');
    assert.deepEqual(s.about, [
      'Used for checking: Order ID, Amount, Product Ordered, Order Screenshot, Delivery Screenshot, Review Screenshot and Review Link.',
      'Only shown, not used for checking: Reviewer Name.',
      'This file has no order date, so order dates are not compared.',
      'It has no Status, Type or Note column, so the checked Excel file adds them after the last column.',
      'The rows use the live campaign "Testbrand Men": its brand, Testbrand, is in the file\'s name.',
    ]);
    const fromFile = view.rows.filter((r) => r.source === 'sheet');
    assert.equal(fromFile.length, NEW_ROWS.length, "the old file's rows are gone");
    assert.deepEqual(fromFile.map((r) => r.n), fromFile.map((_, i) => i + 1), 'numbered from 1');
    assert.deepEqual(fromFile[0].values, { 1: { text: 'Test Reviewer One', labels: [] } }, "the reviewer's name, to be shown");
    assert.deepEqual([fromFile[0].orderId, fromFile[0].amount, fromFile[0].product, fromFile[0].orderDate], [newOrderId(1), '₹349', 'Face Wash For Man - Amazon', '']);
    assert.deepEqual(fromFile[0].shots.reviewShot.labels.map((x) => x.label), ['Google Drive']);
    assert.deepEqual([1, 3, 4, 6].map((i) => fromFile[i].shots.review.labels.map((x) => x.label)), [['Amazon review'], ["Amazon product's reviews"], ['Amazon error page'], ['App store']]);
    assert.ok(fromFile.every((r) => r.last === null), 'nothing checked yet');
    // A check is told which columns the file has, and gets the campaign found by the file's name.
    await call('POST', `/local/amazon/rows/${fromFile[0].id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    const seen = checks.at(-1);
    assert.equal(seen.rowId, fromFile[0].id);
    assert.deepEqual(seen.has, { orderDate: false, amount: true, product: true, orderShot: true, deliveryShot: true, reviewShot: true, reviewLink: true });
    assert.deepEqual(seen.campaigns.map((c) => [c.name, c.live]), [['Testbrand Men', true]]);
    assert.equal(seen.reviewer, 'Test Reviewer One', "the Reviewer Name column's name, for the name on the review");
    // The campaign ended: it is never used, and the line under the upload line says so plainly.
    const id = (await rowsNow(l.opts)).campaigns[0].id;
    await json('POST', `/local/amazon/campaigns/${id}/end`, {}, l.opts);
    assert.equal((await rowsNow(l.opts)).sheet.about.at(-1), 'No live campaign was found for these rows, so each product is compared with its name in the file. The campaign "Testbrand Men" has the brand, but it is marked Ended, so it is not used: mark it Live in the Campaigns box to use it.');
    await call('POST', `/local/amazon/rows/${fromFile[1].id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    assert.deepEqual(checks.at(-1).campaigns, [], 'the ended campaign is not given to the check');
    // The old file, with no Reviewer Name column: nothing to compare the name with.
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({ replace: '1' }, [{ field: 'file', name: 'orders.xlsx', data: ORDERS }]) });
    const old = (await rowsNow(l.opts)).rows[0];
    await call('POST', `/local/amazon/rows/${old.id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    assert.equal(checks.at(-1).reviewer, null);
  } finally {
    plan.clear();
    await l.close();
  }
});

test('a file with no "Amazon" tab is told in one plain sentence, and the rows stay as they were', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Instamart').addRow(HEADER);
  wb.addWorksheet('Flipkart').addRow(HEADER);
  const before = (await rowsNow()).rows.length;
  const r = await call('POST', '/local/amazon/sheet', multipart({}, [{ field: 'file', name: 'other shops.xlsx', data: Buffer.from(await wb.xlsx.writeBuffer()) }]));
  assert.equal(r.status, 400);
  assert.equal(r.json.message, 'This file has no tab named "Amazon", so name the tab with the orders "Amazon" in Excel, save the file, then upload it again.');
  const after = await rowsNow();
  assert.equal(after.rows.length, before);
  assert.equal(after.sheet.fileName, 'July orders.xlsx');
});

test('a campaign: saved, then each of its products read from Amazon in the Live Amazon Browser, one page at a time; kept for next time', async () => {
  assert.deepEqual((await rowsNow()).campaigns, [], 'none to start with');
  pages = (url) => (url.endsWith('/dp/B0TESTKIT9') ? productPage('B0TESTKIT9', KIT_NAME, { variants: { B0TESTKIT9: '1 Litre', B0TESTKIT8: '2 Litre' } }) : url.includes('/dp/B0TESTFLR1') ? productPage('B0TESTFLR1', FLOOR_NAME, { brand: null, byline: 'Visit the Test Brand Store' }) : null);
  opened.length = 0;
  const made = await json('POST', '/local/amazon/campaigns', { brand: 'Test Brand', name: 'Test Clean', live: true, products: 'B0TESTKIT9\nhttps://www.amazon.in/dp/B0TESTFLR1?th=1\n b0testkit9 ' });
  assert.equal(made.status, 201, made.json?.message);
  assert.deepEqual(made.json.campaign.products.map((p) => p.given), ['B0TESTKIT9', 'https://www.amazon.in/dp/B0TESTFLR1?th=1'], 'one per line; the same product typed twice counts once');
  await readingDone();
  assert.deepEqual(opened, ['https://www.amazon.in/dp/B0TESTKIT9', 'https://www.amazon.in/dp/B0TESTFLR1?th=1'], 'an ASIN number as its Amazon India product page, a link as it is, one at a time');
  const c = await campaignNamed('Test Clean');
  assert.deepEqual([c.brand, c.name, c.live], ['Test Brand', 'Test Clean', true]);
  assert.deepEqual(c.products.map((p) => [p.state, p.name, p.brand, p.variants]), [['used', KIT_NAME, 'Test Brand', ['2 Litre']], ['used', FLOOR_NAME, 'Test Brand', []]], 'the real name, the brand and the other colours and sizes');
  assert.ok(c.products.every((p) => /^\d{4}-\d{2}-\d{2}T/.test(p.at)), 'with when they were read');
  assert.ok(existsSync(join(dataDir, 'campaigns.json')), 'kept in the data folder');
  pages = null;
});

test('a product that is not a real product page, or not of the campaign\'s brand, is not used, and the Campaigns box says why; a campaign can be ended and deleted', async () => {
  const gone = { title: 'Page Not Found', text: "Looking for something? We're sorry. The Web address you entered is not a functioning page on our site." };
  pages = (url) =>
    url.includes('B0TESTOTH1') ? productPage('B0TESTOTH1', 'Other Maker Glass Cleaner Spray, 500 ml', { brand: 'Other Maker' })
    : url.includes('B0TESTNOB1') ? productPage('B0TESTNOB1', 'Shiny Glass Cleaner Spray, 500 ml', { brand: null })
    : url.includes('B0TESTNOP1') ? { ok: true, status: 200, url, facts: { url, title: 'Amazon.in', text: 'Deals of the day', productTitle: null, pageAsin: null } }
    : url.includes('B0TESTGON1') ? { ok: true, status: 404, url, facts: { url, ...gone } }
    : null;
  const made = await json('POST', '/local/amazon/campaigns', { brand: 'Test Brand', name: 'Test Shine', live: true, products: 'B0TESTOTH1\nB0TESTNOB1\nB0TESTNOP1\nB0TESTGON1' });
  await readingDone();
  const c = await campaignNamed('Test Shine');
  assert.deepEqual(c.products.map((p) => [p.state, p.says]), [
    ['not used', 'Amazon says this product\'s brand is "Other Maker", not "Test Brand", so this product is not used.'],
    ['not used', 'The product\'s page shows no brand, and its name "Shiny Glass Cleaner Spray" does not include "Test Brand", so this product is not used.'],
    ['not used', 'This link does not open a product page on Amazon, so this product is not used.'],
    ['not used', 'Amazon says this product page does not exist, so this product is not used.'],
  ]);
  assert.equal(c.products[0].name, 'Other Maker Glass Cleaner Spray, 500 ml', 'what was read still shows');
  const ended = await json('POST', `/local/amazon/campaigns/${made.json.campaign.id}/end`, {});
  assert.equal(ended.json.campaigns.find((x) => x.name === 'Test Shine').live, false, 'ended: no longer used');
  const removed = await json('POST', `/local/amazon/campaigns/${made.json.campaign.id}/delete`, {});
  assert.deepEqual(removed.json.campaigns.map((x) => x.name), ['Test Clean']);
  assert.equal((await json('POST', `/local/amazon/campaigns/${made.json.campaign.id}/delete`, {})).json.message, 'No campaign has that id. Reload the page.');
  pages = null;
});

test('a login page, a robot check or a block stops the reading at once and is never got around; "Read the products again" tries again', async () => {
  const stops = {
    signin: { ok: true, status: 200, url: 'https://www.amazon.in/ap/signin?openid.return_to=x', facts: { url: 'https://www.amazon.in/ap/signin?openid.return_to=x', title: 'Amazon Sign In', text: 'Sign in', signInForm: true } },
    captcha: { ok: true, status: 200, url: 'https://www.amazon.in/errors/validateCaptcha', facts: { url: 'https://www.amazon.in/errors/validateCaptcha', title: 'Amazon.in', text: 'Enter the characters you see below', captchaForm: true } },
    blocked: { ok: true, status: 503, url: 'https://www.amazon.in/dp/B0TESTFRS1', facts: { url: 'https://www.amazon.in/dp/B0TESTFRS1', title: 'Sorry! Something went wrong!', text: 'Sorry! Something went wrong!' } },
  };
  for (const [kind, page] of Object.entries(stops)) {
    pages = () => page;
    opened.length = 0;
    const made = await json('POST', '/local/amazon/campaigns', { brand: 'Test Brand', name: `Test Fresh ${kind}`, live: false, products: 'B0TESTFRS1\nB0TESTFRS2' });
    await readingDone();
    assert.equal(opened.length, 1, `${kind}: no more Amazon pages after it`);
    const c = await campaignNamed(`Test Fresh ${kind}`);
    assert.deepEqual(c.products.map((p) => [p.state, p.says]), [['stopped', READ_PAUSE_SAYS[kind]], ['waiting', null]], kind);
    pages = (url) => productPage(url.slice(-10), `Test Brand Fresh Air Spray ${url.slice(-1)}, 250 ml`);
    await json('POST', `/local/amazon/campaigns/${made.json.campaign.id}/read`, {});
    await readingDone();
    assert.deepEqual((await campaignNamed(`Test Fresh ${kind}`)).products.map((p) => p.state), ['used', 'used'], `${kind}: read again`);
    await json('POST', `/local/amazon/campaigns/${made.json.campaign.id}/delete`, {});
  }
  pages = null;
});

test('there is no duplicate choice: only the first row of an order is checked, and a check is given no choice', async () => {
  assert.equal('duplicateRule' in (await rowsNow()), false);
  assert.equal((await json('POST', '/local/amazon/duplicate-rule', { rule: 'all' })).status, 404, 'the route is gone');
});

test('one check streams its steps, is saved with its Status, Type and Note, and only one thing runs at a time', async () => {
  const two = byRow((await rowsNow()).rows, 2);
  let open = () => {};
  let r;
  release = new Promise((res) => (open = res));
  try {
    const first = call('POST', `/local/amazon/rows/${two.id}/check`, { body: '{}', type: 'application/json' });
    await until(async () => (await runningNow())?.kind === 'check', 'the check is running');
    assert.equal((await call('POST', `/local/amazon/rows/${two.id}/check`, { body: '{}', type: 'application/json' })).status, 409);
    assert.equal((await json('POST', '/local/amazon/check-all', {})).status, 409);
    const logIn = await json('POST', '/local/amazon/log-in', {});
    assert.equal(logIn.status, 409);
    assert.equal(logIn.json.message, 'A check, a sheet upload or a removal is running. Wait for it to finish, then press Log in to Amazon.');
    assert.equal((await json('POST', '/local/amazon/check-login', {})).json.message, 'A check, a sheet upload or a removal is running. Wait for it to finish, then press Check the login again.');
    assert.deepEqual((await call('GET', '/local/amazon/account')).json.running, { kind: 'check', rowId: two.id });
    open();
    r = await first;
  } finally {
    open();
    release = null;
  }
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /application\/x-ndjson/);
  assert.deepEqual(r.lines.map((l) => l.event), ['started', 'step', 'done']);
  const c = checks.at(-1);
  assert.equal(c.duplicateRule, undefined, 'no duplicate choice is given');
  assert.deepEqual(c.campaigns.map((x) => [x.name, x.brand, x.products.map((p) => [p.asin, p.short, p.variants])]), [['Test Clean', 'Test Brand', [['B0TESTKIT9', 'Test Brand Monthly Home Cleaning Kit', ['B0TESTKIT8']], ['B0TESTFLR1', 'Test Brand Floor Cleaner Liquid', []]]]], 'the live campaign of its brand, with the products read from Amazon');
  assert.equal(c.others, 29, 'every other row, for duplicates');
  const detail = await call('GET', `/local/amazon/rows/${two.id}`);
  assert.deepEqual([detail.json.row.last.status, detail.json.row.last.type, detail.json.row.last.note], ['Pass', 'Verified', 'A test note for row 1.']);
  assert.equal(detail.json.result.checkId, c.checkId);
  const pic = await call('GET', `/local/amazon/checks/${c.checkId}/steps/6`);
  assert.equal(pic.headers['content-type'], 'image/png');
  for (const p of [`/local/amazon/checks/${c.checkId}/steps/11`, '/local/amazon/checks/..%2f..%2frows.json/steps/1', '/local/amazon/checks/c1/steps/1']) assert.equal((await call('GET', p)).status, 404, p);
});

test('when checking starts, a live campaign\'s products not read yet are read first; each row gets the live campaigns whose brand is in its product name', async () => {
  const two = byRow((await rowsNow()).rows, 2);
  // Kept before their products could be read: one of the row's brand, one of another brand.
  await store.saveCampaign({ id: 'k00000000aaa1', brand: 'Test Brand', name: 'Test Fresh', live: true, products: [{ given: 'B0TESTFRS1', url: 'https://www.amazon.in/dp/B0TESTFRS1', asin: 'B0TESTFRS1', read: null, problem: null }] });
  await store.saveCampaign({ id: 'k00000000aaa2', brand: 'Other Maker', name: 'Other Sale', live: true, products: [] });
  await store.saveCampaign({ id: 'k00000000aaa3', brand: 'Test Brand', name: 'Test Old', live: false, products: [{ given: 'B0TESTOLD1', url: 'https://www.amazon.in/dp/B0TESTOLD1', asin: 'B0TESTOLD1', read: null, problem: null }] });
  pages = (url) => (url.includes('B0TESTFRS1') ? productPage('B0TESTFRS1', 'Test Brand Fresh Air Spray, 250 ml') : null);
  opened.length = 0;
  const r = await json('POST', `/local/amazon/rows/${two.id}/check`, {});
  assert.deepEqual(opened, ['https://www.amazon.in/dp/B0TESTFRS1'], 'read before the row is checked; an ended campaign is not read');
  assert.equal(r.lines[0].says, 'Reading the products of the campaign "Test Fresh" from Amazon: 1 of 1');
  assert.deepEqual(r.lines.slice(1).map((l) => l.event), ['started', 'step', 'done']);
  assert.deepEqual(checks.at(-1).campaigns.map((x) => [x.name, x.products.map((p) => p.short)]), [['Test Clean', ['Test Brand Monthly Home Cleaning Kit', 'Test Brand Floor Cleaner Liquid']], ['Test Fresh', ['Test Brand Fresh Air Spray']]], 'only live campaigns of its brand');
  // A login page while reading pauses: no row is checked.
  await store.saveCampaign({ id: 'k00000000aaa4', brand: 'Test Brand', name: 'Test Later', live: true, products: [{ given: 'B0TESTLAT1', url: 'https://www.amazon.in/dp/B0TESTLAT1', asin: 'B0TESTLAT1', read: null, problem: null }] });
  pages = () => ({ ok: true, status: 200, url: 'https://www.amazon.in/ap/signin?x=1', facts: { url: 'https://www.amazon.in/ap/signin?x=1', title: 'Amazon Sign In', signInForm: true } });
  const before = checks.length;
  const paused = await json('POST', `/local/amazon/rows/${two.id}/check`, {});
  assert.deepEqual(paused.lines.at(-1), { event: 'paused', kind: 'signin', says: PAUSE_SAYS.signin.replace('"Carry on checking"', '"Check again"') });
  assert.equal(checks.length, before, 'no row was checked');
  for (const id of ['k00000000aaa1', 'k00000000aaa2', 'k00000000aaa3', 'k00000000aaa4']) await store.removeCampaign(id);
  pages = null;
});

test('Save is refused while rows are being checked, and so are End and Delete', async () => {
  const two = byRow((await rowsNow()).rows, 2);
  const clean = await campaignNamed('Test Clean');
  let open = () => {};
  plan.set(two.id, { hold: new Promise((r) => (open = r)) });
  const first = json('POST', `/local/amazon/rows/${two.id}/check`, {});
  try {
    await until(async () => (await runningNow())?.kind === 'check', 'the check is running');
    const saved = await json('POST', '/local/amazon/campaigns', { brand: 'Test Brand', name: 'Test Sale', live: true, products: 'B0TESTSAL1' });
    assert.equal(saved.status, 409);
    assert.equal(saved.json.message, 'Rows are being checked. Wait for them to finish, then press Save.');
    assert.equal((await json('POST', `/local/amazon/campaigns/${clean.id}/end`, {})).json.message, 'Rows are being checked. Wait for them to finish, then press "End campaign".');
    assert.equal((await json('POST', `/local/amazon/campaigns/${clean.id}/delete`, {})).json.message, 'Rows are being checked. Wait for them to finish, then press Delete.');
  } finally {
    open();
    await first;
    plan.delete(two.id);
  }
  assert.equal((await campaignNamed('Test Clean')).live, true, 'unchanged');
});

test('a row’s pictures are downloaded when that row is checked; one that could not be had is downloaded again at the next check', async () => {
  const five = byRow((await rowsNow()).rows, 5);
  plan.set(five.id, { askPictures: 'order', typeKey: 'needDriveAccess' });
  const before = downloads.length;
  await json('POST', `/local/amazon/rows/${five.id}/check`, {});
  assert.equal(downloads.length, before + 1, 'downloaded when the row is checked');
  assert.equal(downloads.at(-1).link, orderShot(5));
  assert.deepEqual(downloads.at(-1).allowed, ['storage.googleapis.com', 'tryboxs.in', 'www.tryboxs.in'], "settings.json's allowed websites are used");
  assert.deepEqual(checks.at(-1).pictures.problems, [{ link: orderShot(5), kind: 'drive', site: 'Google Drive', says: NO_ACCESS, noAccess: true }], 'the reason, and that Google said the account has no access');
  assert.deepEqual(byRow((await rowsNow()).rows, 5).shots.order.pictures[0].problem, { kind: 'drive', site: 'Google Drive', says: NO_ACCESS }, 'the screen gets the reason');
  // The owner shares it with the Google account logged in to the dashboard.
  privateNow.delete('1TestOrderRow05abcdefgh');
  plan.set(five.id, { askPictures: 'order', typeKey: 'orderNotClear' });
  await json('POST', `/local/amazon/rows/${five.id}/check`, {});
  plan.delete(five.id);
  assert.equal(downloads.length, before + 2);
  assert.equal(checks.at(-1).pictures.files.length, 1, 'the check got the picture');
  assert.deepEqual(checks.at(-1).pictures.problems, []);
  const again = byRow((await rowsNow()).rows, 5);
  assert.equal(again.shots.order.pictures[0].ok, true);
  assert.deepEqual([again.last.status, again.last.type], ['Needs Manual Staff Checking', 'Purchase screenshot not clear']);
  const pic = await call('GET', `/local/amazon/rows/${five.id}/picture/order/0`);
  assert.equal(pic.headers['content-type'], 'image/png');
  assert.ok(pic.buf.subarray(0, PNG.length).equals(PNG));
  assert.equal((await call('GET', `/local/amazon/rows/${five.id}/small/order/0`)).headers['content-type'], 'image/jpeg', 'a small picture for the row page');
  assert.equal((await call('GET', `/local/amazon/rows/${five.id}/picture/order/0`, { token: null })).status, 401, 'never without the token');
  assert.ok(readdirSync(join(dataDir, 'pictures')).some((f) => f.startsWith(five.id)), 'the downloaded picture stays in the private data folder');
});

test('a screenshot saved as a PDF is turned into a picture on this computer and read; a picture too large to keep is made smaller and read, not refused', { timeout: 180_000 }, async () => {
  // The lab keeps pictures only up to a small size, so a made-up picture counts as too large.
  const LIMIT = 300_000;
  const l = await lab({ prepare: (out) => preparePicture(out, { maxBytes: LIMIT }) });
  try {
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'orders.xlsx', data: ORDERS }]) });
    const rows = (await rowsNow(l.opts)).rows.filter((r) => !r.done && r.shots.order.links.some((x) => x.includes('drive.google.com')));
    const [pdfRow, bigRow] = rows;
    pdfNow.add(pdfRow.shots.order.links[0]);
    bigPicture = (await pdfToPicture(PDF, { width: 3200 })).data;
    assert.ok(bigPicture.length > LIMIT, `the made-up picture, ${bigPicture.length} bytes, is larger than the lab keeps`);
    bigNow.add(bigRow.shots.order.links[0]);
    plan.set(pdfRow.id, { askPictures: 'order', typeKey: 'verified' });
    plan.set(bigRow.id, { askPictures: 'order', typeKey: 'verified' });
    await json('POST', `/local/amazon/rows/${pdfRow.id}/check`, {}, l.opts);
    const pdfCheck = checks.at(-1);
    assert.deepEqual(pdfCheck.pictures.problems, [], 'the PDF is not a problem');
    assert.deepEqual(pdfCheck.pictures.types, ['image/png'], 'its pages became one picture');
    assert.equal(imageType(readFileSync(pdfCheck.pictures.files[0])), 'image/png');
    const pdfSaved = (await rowsNow(l.opts)).rows.find((r) => r.id === pdfRow.id);
    assert.equal(pdfSaved.shots.order.pictures[0].ok, true);
    await json('POST', `/local/amazon/rows/${bigRow.id}/check`, {}, l.opts);
    const bigCheck = checks.at(-1);
    assert.deepEqual(bigCheck.pictures.problems, []);
    assert.deepEqual(bigCheck.pictures.types, ['image/jpeg'], 'made smaller, as a JPEG');
    const small = readFileSync(bigCheck.pictures.files[0]);
    assert.equal(imageType(small), 'image/jpeg');
    assert.ok(small.length <= LIMIT, `${small.length} bytes`);
  } finally {
    pdfNow.clear();
    bigNow.clear();
    bigPicture = PNG;
    await l.close();
  }
});

test('a review found to be another row’s makes that row Duplicate too', async () => {
  const { rows } = await rowsNow();
  const seven = byRow(rows, 7);
  const forty = byRow(rows, 8);
  const note = 'The review in this row is the same review as in row 7, which is the one checked.\nWhy: two different orders cannot share one review, so this row is a duplicate and was not checked. A duplicate row is Unverified.';
  plan.set(seven.id, { typeKey: 'duplicate', reviewId: 'R1TESTROW07ABC', alsoDuplicate: [{ id: forty.id, note }] });
  await json('POST', `/local/amazon/rows/${seven.id}/check`, {});
  plan.delete(seven.id);
  const other = byRow((await rowsNow()).rows, 8);
  assert.deepEqual([other.last.status, other.last.type], ['Fail', 'Duplicate']);
  assert.equal(other.last.note, note, 'the Note the check wrote for that row');
});

/** A made-up orders file with rows 2 to 6; `statuses` gives some rows a Status (and Type) already in the file. */
async function smallOrders(statuses = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Amazon');
  ws.addRow(HEADER);
  for (let n = 2; n <= 6; n++) ws.addRow([`403-300000${n}-400000${n}`, '20-07-2026', 654, PRODUCTS[0], '', '', '', statuses[n] ?? '', statuses[n] ?? '']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
/** A separate data folder with those rows uploaded, and (byHand) one row added by hand after them. */
async function labWithRows({ statuses = {}, byHand = false, over = {} } = {}) {
  const l = await lab(over);
  await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'small.xlsx', data: await smallOrders(statuses) }]) });
  if (byHand) await call('POST', '/local/amazon/rows', { ...l.opts, ...multipart({ orderId: '403-7777777-7777777' }) });
  const rows = (await rowsNow(l.opts)).rows;
  const press = (body = {}, opts = {}) => json('POST', '/local/amazon/check-all', body, { ...l.opts, ...opts });
  return { l, rows, press, n: (row) => rows.find((r) => r.row === row) };
}
const rowEvents = (r) => r.lines.filter((x) => x.event === 'row');
const counts = (e) => [e.total, e.done, e.left];

test('"Start checking": one row at a time, in the sheet’s order with rows added by hand last; each row’s result is saved and sent before the next row starts; rows that already have a result are passed by', async () => {
  const { l, rows, press, n } = await labWithRows({ statuses: { 3: 'Verified' }, byHand: true });
  try {
    const hand = rows.find((r) => r.source === 'manual');
    assert.deepEqual(rows.map((r) => [r.label, r.done]), [['Row 1', false], ['Row 2', true], ['Row 3', false], ['Row 4', false], ['Row 5', false], ['By hand #1', false]], 'a Status already in the file is a result');
    assert.deepEqual([rows[1].final, rows[1].prevFinal, rows[1].last], ['pass', 'pass', null], 'an older file\'s "Verified" is Pass, from the file');
    // Row 4 is checked on its own first; row 2's check finds that row 6 shares its review.
    await call('POST', `/local/amazon/rows/${n(4).id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    plan.set(n(2).id, { typeKey: 'duplicate', alsoDuplicate: [{ id: n(6).id, sentences: ['The review of this row is also the review of row 2, found when that row was checked', 'Each order needs its own review'] }] });
    // When each row's check starts, the row before it already has its result saved.
    const seenAtStart = [];
    plan.set(n(5).id, { onStart: async () => seenAtStart.push(['Row 4', (await rowsNow(l.opts)).rows.find((r) => r.row === 2).last?.type]) });
    const before = checks.length;
    const run = await press();
    plan.clear();
    assert.equal(run.status, 200, run.text);
    assert.deepEqual(checks.slice(before).map((c) => c.rowId), [n(2).id, n(5).id, hand.id], 'rows 3 (Status in the file), 4 (checked) and 6 (made Duplicate by row 2) are passed by');
    assert.deepEqual(seenAtStart, [['Row 4', 'Duplicate']]);
    const order = run.lines.map((x) => `${x.event}${x.label ? ` ${x.label}` : ''}`).filter((x) => /^(run-|row)/.test(x));
    assert.deepEqual(order, ['run-started', 'row Row 1', 'row-done Row 1', 'row Row 4', 'row-done Row 4', 'row By hand #1', 'row-done By hand #1', 'run-done'], "each row's result is sent before the next row starts");
    assert.deepEqual(counts(run.lines[0]), [6, 2, 4], '6 rows, 2 with a result, 4 left');
    assert.deepEqual(rowEvents(run).map(counts), [[6, 2, 4], [6, 4, 2], [6, 5, 1]], 'the counts as each row starts');
    const first = run.lines.find((x) => x.event === 'row-done');
    assert.deepEqual([first.status, first.type, typeof first.seconds], ['Fail', 'Duplicate', 'number']);
    assert.deepEqual(first.rows.map((r) => [r.label, r.last.type, r.last.status, r.done]), [['Row 1', 'Duplicate', 'Fail', true], ['Row 5', 'Duplicate', 'Fail', true]], 'the row, and the row it made Duplicate, as their lines in the table');
    assert.equal(first.rows[0].last.seconds, first.seconds, 'how long it took is kept with the row');
    const end = run.lines.at(-1);
    assert.deepEqual([end.event, end.checked, end.pass, end.fail, end.manual, ...counts(end)], ['run-done', 3, 2, 1, 0, 6, 6, 0]);
    assert.equal('verified' in end || 'unverified' in end, false, 'no Verified or Unverified counts');
    const nothingLeft = await press();
    assert.equal(nothingLeft.status, 409);
    assert.equal(nothingLeft.json.message, 'All rows are checked. To check them all again, press "Check every row again".');
  } finally {
    plan.clear();
    await l.close();
  }
});

test('Stop, or the page closing, stops at once: the rows finished before keep their results, the row it was on gets none, and the button carries on from that row; no finished row is checked twice', async () => {
  const { l, press, n } = await labWithRows();
  let let3go = () => {};
  try {
    plan.set(n(3).id, { hold: new Promise((r) => (let3go = r)) });
    const heard = aborts.length;
    const before = checks.length;
    let req;
    const run = press({}, { onRequest: (x) => (req = x) });
    await until(() => checks.slice(before).some((c) => c.rowId === n(3).id), 'row 3 is being checked');
    req.destroy(); // Stop, a reload or a closed page: the page lets go of its request
    await run;
    await until(() => aborts.length > heard, 'the server heard it');
    assert.ok(aborts.slice(heard).includes(n(3).id));
    // Pressed again at once, while row 3's check is still finishing the step it was on: it waits, then carries on.
    const again = press();
    await sleep(100);
    plan.delete(n(3).id);
    let3go();
    const carried = await again;
    assert.equal(carried.status, 200, carried.text);
    const view = (await rowsNow(l.opts)).rows;
    assert.deepEqual(rowEvents(carried).map((x) => x.label), ['Row 2', 'Row 3', 'Row 4', 'Row 5'], 'from the row it stopped at; Row 1 is not checked again');
    assert.deepEqual(counts(carried.lines[0]), [5, 1, 4]);
    const finished = checks.slice(before).map((c) => c.rowId);
    assert.deepEqual(finished, [n(2).id, n(3).id, n(3).id, n(4).id, n(5).id, n(6).id], 'row 3 was started twice (stopped the first time); every other row once');
    assert.ok(view.every((r) => r.done && r.last.status === 'Pass'));
  } finally {
    let3go();
    plan.clear();
    await l.close();
  }
});

test('a pause on a login page, a robot check or a block names the button; pressing it carries on from the row it paused at', async () => {
  const { l, press, n } = await labWithRows();
  try {
    plan.set(n(4).id, { paused: 'signin' });
    const run = await press();
    const paused = run.lines.at(-1);
    assert.deepEqual([paused.event, paused.kind, paused.rowId, paused.label, ...counts(paused)], ['paused', 'signin', n(4).id, 'Row 3', 5, 2, 3]);
    assert.equal(paused.says, 'Amazon logged you out. Log in again in the Live Amazon Browser, then press "Carry on checking".');
    assert.deepEqual(rowEvents(run).map((x) => x.label), ['Row 1', 'Row 2', 'Row 3'], 'nothing after the pause');
    assert.equal((await rowsNow(l.opts)).rows.find((r) => r.row === 4).last, null, 'the paused row gets no result');
    for (const kind of ['captcha', 'blocked']) {
      plan.set(n(4).id, { paused: kind });
      const again = await press();
      assert.equal(again.lines.at(-1).says, PAUSE_SAYS[kind]);
      assert.match(PAUSE_SAYS[kind], /press "Carry on checking"/i);
      assert.deepEqual(rowEvents(again).map((x) => x.label), ['Row 3'], 'it starts at the paused row');
    }
    plan.clear();
    const goOn = await press();
    assert.deepEqual(rowEvents(goOn).map((x) => x.label), ['Row 3', 'Row 4', 'Row 5']);
    assert.deepEqual([goOn.lines.at(-1).event, goOn.lines.at(-1).checked, ...counts(goOn.lines.at(-1))], ['run-done', 3, 5, 5, 0]);
  } finally {
    plan.clear();
    await l.close();
  }
});

test('"Check" and "Check again" check that row only; "Check every row again" removes every result first, Status in the file too, then checks from the first row', async () => {
  const { l, press, n } = await labWithRows({ statuses: { 3: 'Unverified' } });
  try {
    await press();
    const before = checks.length;
    const one = await call('POST', `/local/amazon/rows/${n(4).id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    assert.deepEqual(one.lines.map((x) => x.event), ['started', 'step', 'done']);
    assert.deepEqual(checks.slice(before).map((c) => c.rowId), [n(4).id], 'that row only');
    plan.set(n(5).id, { paused: 'captcha' });
    const pausedAgain = await call('POST', `/local/amazon/rows/${n(5).id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    assert.equal(pausedAgain.lines.at(-1).says, 'Amazon showed a robot check. This dashboard never answers a robot check. Press "Check again" when you are ready.', 'the button that is there for a row with a result');
    plan.clear();
    const again = await press({ again: true });
    assert.equal(again.status, 200, again.text);
    assert.deepEqual([again.lines[0].event, again.lines[0].again, ...counts(again.lines[0])], ['run-started', true, 5, 0, 5], 'every result has gone, the Status from the file too');
    assert.deepEqual(rowEvents(again).map((x) => x.label), ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5'], 'from the first row');
    const view = (await rowsNow(l.opts)).rows;
    assert.ok(view.every((r) => r.done && r.last.status === 'Pass'));
    assert.deepEqual(view.find((r) => r.row === 3).prev, { status: 'Unverified', type: 'Unverified', note: '' }, "the file's own cells are kept");
    assert.equal(view.find((r) => r.row === 3).prevFinal, 'manual', "the row's page says the file's own Status as one of the three words, never Unverified");
  } finally {
    plan.clear();
    await l.close();
  }
});

test('"Start checking" or "Check", pressed while the top bar says "Not logged in to Amazon", reads the login again first, the way "Log in to Amazon" does; each page it opens is written in the Terminal window', async () => {
  const amazon = { loggedIn: false, opened: [] };
  const window = {
    onAccount: null,
    isOpen: () => true,
    begin: async () => {},
    close: async () => {},
    async open(url) {
      amazon.opened.push(url);
      return { ok: true, status: 200, url, facts: { url, title: 'Amazon.in', hello: amazon.loggedIn ? 'Hello, Test Staff' : 'Hello, sign in' } };
    },
    readAccount: async () => ({ account: amazon.loggedIn ? { signedIn: true, name: 'Test Staff' } : { signedIn: false }, loginPage: false, line: { hello: amazon.loggedIn ? 'Hello, Test Staff' : 'Hello, sign in' } }),
  };
  const terminal = [];
  const login = createLogin({ live: window, watchMs: 20, log: (m) => terminal.push(m) });
  const { l, press, n } = await labWithRows({ over: { live: window, login } });
  try {
    await login.check('when the dashboard started');
    assert.equal(login.view().state, 'out', 'the check at start found no name');
    // The saved login shows now, as it did when "Log in to Amazon" was pressed after the restart.
    amazon.loggedIn = true;
    amazon.opened.length = 0;
    const loginAtStart = [];
    plan.set(n(2).id, { onStart: async () => loginAtStart.push([login.view().state, amazon.opened.length]) });
    const run = await press();
    plan.clear();
    assert.equal(run.status, 200, run.text);
    assert.deepEqual(loginAtStart, [['in', 1]], "Amazon's home page was read once, and the top bar said logged in, before the first row started");
    assert.deepEqual(amazon.opened, [AMAZON_HOME], 'no login page');
    // The same for a row's own "Check".
    amazon.loggedIn = false;
    await login.check('when the dashboard started');
    amazon.loggedIn = true;
    amazon.opened.length = 0;
    await call('POST', `/local/amazon/rows/${n(3).id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    assert.deepEqual(amazon.opened, [AMAZON_HOME]);
    assert.equal(login.view().state, 'in');
    // Logged in already: nothing is read again.
    amazon.opened.length = 0;
    await call('POST', `/local/amazon/rows/${n(4).id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    assert.deepEqual(amazon.opened, []);
    const lines = terminal.join('\n');
    assert.match(lines, /^Amazon login check, when the dashboard started: page 1: opened https:\/\/www\.amazon\.in\/, titled "Amazon\.in", and its account line says "Hello, sign in"\.$/m, "each page's address and the words of its account line");
    assert.match(lines, /^Amazon login check, when the dashboard started: page 2: opened https:\/\/www\.amazon\.in\//m, 'the home page opened once more when the first showed no name');
    assert.match(lines, /^Amazon login check, when the dashboard started: the top bar says not logged in to Amazon\.$/m);
    assert.match(lines, /^Amazon login check, before checking the rows: page 1: opened https:\/\/www\.amazon\.in\/, titled "Amazon\.in", and its account line says "Hello, Test Staff"\.$/m);
    assert.match(lines, /^Amazon login check, before checking the rows: the top bar says logged in to Amazon\.$/m);
  } finally {
    plan.clear();
    await l.close();
  }
});

test('a single check that pauses on a row with no result names its button: Check', async () => {
  const { l, n } = await labWithRows();
  try {
    plan.set(n(2).id, { paused: 'captcha' });
    const r = await call('POST', `/local/amazon/rows/${n(2).id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    assert.equal(r.lines.at(-1).event, 'paused');
    assert.equal(r.lines.at(-1).says, 'Amazon showed a robot check. This dashboard never answers a robot check. Press Check when you are ready.');
  } finally {
    plan.clear();
    await l.close();
  }
});

test('the checked Excel file: named like the uploaded one, and only the Amazon tab’s Status, Type and Note cells differ', async () => {
  const { rows } = await rowsNow();
  const r = await call('GET', '/local/amazon/sheet/checked.xlsx');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match(r.headers['content-disposition'], /^attachment; filename="July orders checked \d{4}-\d{2}-\d{2}\.xlsx"; filename\*=UTF-8''July%20orders%20checked%20\d{4}-\d{2}-\d{2}\.xlsx$/);
  const before = readZip(ORDERS);
  const afterZip = readZip(r.buf);
  const part = tabsOf(before).find((t) => t.name === 'Amazon').part;
  assert.deepEqual([...afterZip.keys()], [...before.keys()]);
  // A Note of several lines adds a look with "wrap text" on, after the file's own looks; nothing else changes.
  for (const name of before.keys()) if (name !== part && name !== 'xl/styles.xml') assert.ok(afterZip.get(name)().equals(before.get(name)()), `${name} is byte for byte the same`);
  const looks = (zip) => [...zip.get('xl/styles.xml')().toString('utf8').match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
  assert.deepEqual(looks(afterZip).slice(0, looks(before).length), looks(before), "the file's own looks stay as they were");
  assert.ok(looks(afterZip).slice(looks(before).length).every((x) => /wrapText="1"/.test(x)));
  const hidden = new RegExp(['ZmF5cg==', 'cmVmdW5k', 'Y2FzaGJhY2s=', 'cmV3YXJk'].map((b) => Buffer.from(b, 'base64').toString('utf8')).join('|'), 'i');
  for (const name of afterZip.keys()) if (/\.(xml|rels)$/.test(name)) assert.doesNotMatch(afterZip.get(name)().toString('utf8'), hidden, `${name} has none of the words this dashboard must not show`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.buf);
  const ws = wb.getWorksheet('Amazon');
  assert.equal(ws.getCell('H1').value, 'Status', 'the Status column keeps its heading');
  assert.equal(ws.getCell('J1').value, 'Note');
  assert.equal(ws.getCell('K1').value, null, 'no column is added for the Status');
  for (const row of rows) {
    const want = row.last ? [FINAL_WORDS[row.final], row.last.type, row.last.note] : [null, null, null];
    assert.deepEqual([ws.getCell(row.row, 8).value, ws.getCell(row.row, 9).value, ws.getCell(row.row, 10).value], want, `row ${row.row} of the file`);
    if (row.last) assert.ok(['Pass', 'Fail', 'Needs Manual Staff Checking'].includes(ws.getCell(row.row, 8).value), 'never Verified or Unverified');
  }
  assert.ok(rows.some((row) => row.last), 'some rows were checked');
  const old = new ExcelJS.Workbook();
  await old.xlsx.load(ORDERS);
  old.getWorksheet('Amazon').eachRow((row, n) =>
    row.eachCell((cell, c) => {
      if (c < 8) assert.deepEqual(ws.getCell(n, c).value, cell.value, `${cell.address} is unchanged`);
    }),
  );
});

test('each row has its Status: its check\'s, the one in the file, or the one its Type in the file gives; a row checked before the three Status words were added gets one from its kept result', async () => {
  const l = await lab();
  try {
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'orders.xlsx', data: ORDERS }]) });
    const rows = (await rowsNow(l.opts)).rows;
    assert.ok(rows.every((r) => r.final === null), 'a row not checked yet has none');
    const two = byRow(rows, 2);
    plan.set(two.id, { typeKey: 'notDelivered', final: 'manual', finalSays: 'A staff member needs to check this transaction because the word "Delivered" could not be found on the delivery screenshot.' });
    await call('POST', `/local/amazon/rows/${two.id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    plan.clear();
    const now = byRow((await rowsNow(l.opts)).rows, 2);
    assert.deepEqual([now.final, now.finalSays, now.last.final], ['manual', 'A staff member needs to check this transaction because the word "Delivered" could not be found on the delivery screenshot.', 'manual']);
    const x = await call('GET', '/local/amazon/sheet/checked.xlsx', l.opts);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.buf);
    assert.equal(wb.getWorksheet('Amazon').getCell('H2').value, 'Needs Manual Staff Checking', 'in the file\'s own Status column');
    assert.equal(wb.getWorksheet('Amazon').getCell('K2').value, null);
  } finally {
    await l.close();
  }
  const words = resultWords(checkSettings({}));
  const file = (prev) => ({ prev, last: null, recheck: false });
  assert.equal(finalOfRow(file({ status: 'Fail', type: 'Need Access', note: '' }), words), 'fail', 'a Status the file already holds as one of the three words');
  assert.equal(finalOfRow(file({ status: 'needs manual staff checking', type: 'Verified', note: '' }), words), 'manual');
  assert.equal(finalOfRow(file({ status: 'Unverified', type: 'Need Access', note: '' }), words), 'manual', 'the one its Type gives');
  assert.equal(finalOfRow(file({ status: 'Verified', type: 'Checked by hand', note: '' }), words), 'pass', 'a Type this dashboard does not know: by its Status');
  assert.equal(finalOfRow({ ...file({ status: 'Verified', type: 'Verified' }), recheck: true }, words), null, 'after "Check every row again"');
  assert.equal(finalOfRow({ last: { typeKey: 'reviewDeleted', final: null } }, words), 'fail');
  // A row checked before the three Status words were added: its kept result gives it one, once.
  const dir = mkdtempSync(join(tmpdir(), 'arc-routes-final-'));
  const old = createStore(dir);
  await old.init();
  const [made] = await old.replaceSheetRows([{ row: 2, orderId: { text: '403-1234567-1234567', value: '403-1234567-1234567' }, orderDate: { text: '20-07-2026', value: '2026-07-20' }, amount: { text: '654', value: 654 }, product: { text: PRODUCTS[0] }, shots: { order: { text: '', link: '', links: [], mismatch: null, picture: null }, delivery: { text: '', link: '', links: [], mismatch: null, picture: null }, review: { text: '', link: '', links: [], mismatch: null, picture: null } } }]);
  await old.saveResult({ checkId: 'c20261005120000abcdef', rowId: made.id, status: 'Unverified', type: 'Order ID is not matching', typeKey: 'orderIdNotMatching', note: 'An older Note.', finishedAt: '2026-10-05T12:00:00.000Z', sheet: { orderId: '403-1234567-1234567' }, order: { details: { orderId: { state: 'different' } }, orderIds: ['403-1234567-1234561'] }, steps: [] });
  const routes = createAmazonRoutes({ store: old, live: { ...live, onAccount: null }, images, auth: () => true, check: fakeCheck, settings: async () => checkSettings({}) });
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.body = text; } };
  await routes({ method: 'GET', url: '/local/amazon/rows', headers: {} }, res, new URL('http://localhost/local/amazon/rows'));
  const seen = JSON.parse(res.body).rows[0];
  assert.deepEqual([seen.final, seen.finalSays, seen.last.note], ['manual', null, 'An older Note.'], 'one digit away: a possible reading mistake, never Fail');
  assert.equal((await old.get(made.id)).last.final, 'manual', 'kept, so it is worked out once');
  await rm(dir, { recursive: true, force: true });
});

test('rows of an older upload get their numbers from 1, once; words a check wrote before name other rows with the numbers the dashboard shows now', async () => {
  const numbers = new Map([[21, 20], [37, 36], [74, 73], [9, 8]]);
  assert.equal(renumbered('Order ID 403-1000002-2000002 was already checked in row 21. The same review is also in rows 37 and 74.', numbers), 'Order ID 403-1000002-2000002 was already checked in row 20. The same review is also in rows 36 and 73.');
  assert.equal(renumbered('It shares a review with row 9 and the row added by hand (#2).', numbers), 'It shares a review with row 8 and the row added by hand (#2).', 'a row added by hand keeps its own name');
  assert.equal(renumbered('Check this row again.', numbers), 'Check this row again.');
  assert.equal(resultView({ numbered: true, note: 'Checked in row 21.' }, numbers).note, 'Checked in row 21.', 'a check made since says the new numbers already');
  const dir = mkdtempSync(join(tmpdir(), 'arc-routes-numbers-'));
  const old = createStore(dir);
  await old.init();
  const blank = { text: '', link: '', links: [], mismatch: null, picture: null };
  const made = await old.replaceSheetRows([2, 3, 5].map((row) => ({ row, orderId: { text: `403-100000${row}-200000${row}`, value: `403-100000${row}-200000${row}` }, orderDate: { text: '20-07-2026', value: '2026-07-20' }, amount: { text: '654', value: 654 }, product: { text: PRODUCTS[0] }, shots: { order: blank, delivery: blank, review: blank } })));
  // An upload from before rows were numbered from 1 kept no numbers.
  const file = join(dir, 'rows.json');
  const kept = JSON.parse(readFileSync(file, 'utf8'));
  for (const r of kept.rows) delete r.n;
  writeFileSync(file, JSON.stringify(kept));
  const said = 'This transaction failed because it is a duplicate: order ID 403-1000003-2000003 was already checked in row 3.';
  await old.saveResult({ checkId: 'c20261005120000abcdef', rowId: made[2].id, final: 'fail', finalSays: said, status: 'Unverified', type: 'Duplicate', typeKey: 'duplicate', note: said, finishedAt: '2026-10-05T12:00:00.000Z', steps: [{ n: 1, name: STEP_NAMES[0], state: 'fail', detail: 'Order ID 403-1000003-2000003 was already checked in row 3.' }] });
  const routes = createAmazonRoutes({ store: old, live: { ...live, onAccount: null }, images, auth: () => true, check: fakeCheck, settings: async () => checkSettings({}) });
  const get = async (path) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.body = text; } };
    await routes({ method: 'GET', url: path, headers: {} }, res, new URL(`http://localhost${path}`));
    return JSON.parse(res.body);
  };
  const { rows } = await get('/local/amazon/rows');
  assert.deepEqual(rows.map((r) => [r.row, r.n, r.label]), [[2, 1, 'Row 1'], [3, 2, 'Row 2'], [5, 3, 'Row 3']], "numbered from 1 in the sheet's order; the file's empty row 4 never counted");
  assert.deepEqual((await old.list()).map((r) => r.n), [1, 2, 3], 'kept, so the numbers never move');
  const now = 'This transaction failed because it is a duplicate: order ID 403-1000003-2000003 was already checked in row 2.';
  assert.deepEqual([rows[2].last.note, rows[2].finalSays, rows[2].last.status], [now, now, 'Fail'], 'the Note names Row 2, never row 3 of the file; the Status is never Unverified');
  const page = await get(`/local/amazon/rows/${made[2].id}`);
  assert.deepEqual([page.result.note, page.result.steps[0].detail, page.result.status], [now, 'Order ID 403-1000003-2000003 was already checked in row 2.', 'Fail'], "the row's page says the same");
  assert.deepEqual(rowNumbers(await old.list()), new Map([[2, 1], [3, 2], [5, 3]]));
  await rm(dir, { recursive: true, force: true });
});

test('the checked Excel file fills only the rows checked so far; the others keep H, I and J as they were', async () => {
  const l = await lab();
  try {
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'orders.xlsx', data: ORDERS }]) });
    const two = byRow((await rowsNow(l.opts)).rows, 2);
    await call('POST', `/local/amazon/rows/${two.id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    const r = await call('GET', '/local/amazon/sheet/checked.xlsx', l.opts);
    assert.equal(r.status, 200, r.text);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.buf);
    const ws = wb.getWorksheet('Amazon');
    assert.deepEqual([ws.getCell('H2').value, ws.getCell('I2').value, ws.getCell('J2').value], ['Pass', 'Verified', 'A test note for row 1.']);
    for (const n of [3, 4, 15, 32]) assert.deepEqual([ws.getCell(n, 8).value, ws.getCell(n, 9).value, ws.getCell(n, 10).value], [null, null, null], `row ${n} was not checked`);
  } finally {
    await l.close();
  }
});

test('a CSV file with the same columns makes rows too; the checked Excel file needs an Excel upload', async () => {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = `${[HEADER, ['403-1000002-2000002', '20-07-2026', '654', PRODUCTS[0], orderShot(2), deliveryShot(2), 'https://amzn.in/d/0TestRow02']].map((x) => x.map(q).join(',')).join('\r\n')}\r\n`;
  const l = await lab();
  try {
    const up = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'orders.csv', data: Buffer.from(csv) }]) });
    assert.equal(up.json.sheet.kind, 'csv');
    assert.equal(up.json.made, 1);
    const x = await call('GET', '/local/amazon/sheet/checked.xlsx', l.opts);
    assert.equal(x.status, 400);
    assert.equal(x.json.message, 'The uploaded sheet is not an Excel file, so there is no Excel file to fill in. Press "Download", then "The results only", instead.');
  } finally {
    await l.close();
  }
});

test('a Status, Type or Note already in the file is shown as the result from before; a remembered choice comes back with the next file', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Orders');
  ws.addRow(['Order No', 'Order Date', 'Amount', 'Product Ordered', 'Order Screenshot', 'Delivery Screenshot', 'Live Review Link', 'Status', 'Type', 'Remarks']);
  ws.addRow(['403-1000002-2000002', '20-07-2026', 654, PRODUCTS[0], '', '', '', 'Unverified', 'Need Access', 'Checked by hand on Monday.']);
  const l = await lab();
  try {
    const up = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'x.xlsx', data: Buffer.from(await wb.xlsx.writeBuffer()) }]) });
    assert.deepEqual([up.json.made, up.json.tab], [1, 'Orders'], 'the only tab');
    assert.equal(up.json.sheet.mapping.note, 10);
    const [row] = (await rowsNow(l.opts)).rows;
    assert.deepEqual(row.prev, { status: 'Unverified', type: 'Need Access', note: 'Checked by hand on Monday.' });
    assert.equal(row.last, null);
    const again = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'orders.xlsx', data: ORDERS }]) });
    assert.equal(again.json.sheet.tab, 'Amazon', 'the next file: its "Amazon" tab');
  } finally {
    await l.close();
  }
});

test('a row added by hand: its words, and each picture as a file or a link; a refused file leaves nothing behind', async () => {
  const l = await lab();
  try {
    const form = multipart({ orderId: '403-7777777-7777777', orderDate: '14/07/2026', amount: '₹499', product: PRODUCTS[2], deliveryLink: 'https://storage.googleapis.com/tryboxs-screenshots/test/by-hand.png', reviewLink: 'https://amzn.in/d/0TestHand1' }, [{ field: 'order', name: 'o.png', data: PNG }]);
    const added = await call('POST', '/local/amazon/rows', { ...l.opts, ...form });
    assert.equal(added.status, 201, added.text);
    const row = added.json.row;
    assert.deepEqual([row.label, row.orderId, row.orderDate, row.amount, row.amountRead, row.source], ['By hand #1', '403-7777777-7777777', '14-07-2026', '₹499', true, 'manual']);
    assert.equal(row.shots.order.how, 'upload');
    assert.equal(row.shots.order.pictures[0].ok, true);
    assert.equal(row.shots.delivery.pictures[0].ok, true, 'a link: downloaded');
    assert.equal(row.reviewKind, 'amazon');
    const folder = join(l.dir, 'pictures');
    const files = readdirSync(folder).sort();
    const bad = await call('POST', '/local/amazon/rows', { ...l.opts, ...multipart({ orderId: 'x' }, [{ field: 'order', name: 'o.png', data: PNG }, { field: 'delivery', name: 'd.txt', data: Buffer.from('not a picture at all, just words') }]) });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.message, 'The delivery screenshot must be a PNG, JPEG or WebP picture.');
    assert.deepEqual(readdirSync(folder).sort(), files, 'no file was written for the refused row');
    const second = await call('POST', '/local/amazon/rows', { ...l.opts, ...multipart({ orderId: '403-8888888-8888888' }) });
    assert.equal(second.json.row.label, 'By hand #2');
  } finally {
    await l.close();
  }
});

test("Delete row and Remove all rows: rows, their pictures, their checks' folders (what was read from the screenshots) and the rows made with the old layout go; the login, choices and uploaded files stay", async () => {
  const l = await lab();
  try {
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'orders.xlsx', data: ORDERS }]) });
    writeFileSync(join(l.dir, 'users.json'), JSON.stringify({ users: [{ id: 'u000000000001', name: 'Old Layout User' }, { id: 'u000000000002', name: 'Another' }] }));
    mkdirSync(join(l.dir, 'screenshots', 'uploaded'), { recursive: true });
    writeFileSync(join(l.dir, 'screenshots', 'u000000000001-delivery.png'), PNG);
    writeFileSync(join(l.dir, 'screenshots', 'uploaded', 'kept.png'), PNG);
    const view = await rowsNow(l.opts);
    assert.equal(view.oldRows, 2, 'rows made with the old layout are counted, not converted');
    const [one, three] = view.rows;
    // Pictures are downloaded when a row is checked.
    for (const r of [one, three]) {
      plan.set(r.id, { askPictures: 'order' });
      await call('POST', `/local/amazon/rows/${r.id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
      plan.delete(r.id);
      assert.ok(readdirSync(join(l.dir, 'pictures')).some((f) => f.startsWith(r.id)), `row ${r.row}, once checked, has its picture`);
    }
    // Each check keeps a folder: what was read from the screenshots, and the pictures of its steps.
    const foldersOf = (r) => checks.filter((c) => c.rowId === r.id).map((c) => join(l.dir, 'checks', c.checkId));
    assert.ok(foldersOf(one).length === 1 && foldersOf(three).length === 1 && [...foldersOf(one), ...foldersOf(three)].every((f) => existsSync(join(f, 'result.json')) && existsSync(join(f, 'step-6.png'))));
    const del = await call('POST', `/local/amazon/rows/${one.id}/remove`, { ...l.opts, body: '{}', type: 'application/json' });
    assert.deepEqual(del.json, { removed: 1, row: { id: one.id, label: 'Row 1' } });
    assert.ok(!readdirSync(join(l.dir, 'pictures')).some((f) => f.startsWith(one.id)), 'its pictures are gone');
    assert.ok(foldersOf(one).every((f) => !existsSync(f)), "its check's folder is gone");
    assert.ok(foldersOf(three).every((f) => existsSync(join(f, 'result.json'))), "another row's check stays");
    assert.equal((await call('POST', `/local/amazon/rows/${one.id}/remove`, { ...l.opts, body: '{}', type: 'application/json' })).status, 404);
    const wrong = await call('POST', '/local/amazon/rows/remove-all', { ...l.opts, body: JSON.stringify({ expected: 5 }), type: 'application/json' });
    assert.equal(wrong.status, 409);
    assert.equal(wrong.json.message, 'The number of rows changed since the screen showed it: there are now 31 rows. Look at the table again, then press Remove all rows.');
    for (const expected of ['3', -1, 2.5, null]) assert.equal((await call('POST', '/local/amazon/rows/remove-all', { ...l.opts, body: JSON.stringify({ expected }), type: 'application/json' })).status, 400, String(expected));
    const all = await call('POST', '/local/amazon/rows/remove-all', { ...l.opts, body: JSON.stringify({ expected: 31 }), type: 'application/json' });
    assert.deepEqual(all.json, { removed: 31 });
    const after = await rowsNow(l.opts);
    assert.deepEqual([after.rows.length, after.oldRows], [0, 0]);
    assert.deepEqual(readdirSync(join(l.dir, 'pictures')).filter((f) => f !== 'small'), []);
    assert.deepEqual(readdirSync(join(l.dir, 'checks')), [], "every check's folder is gone");
    assert.ok(!existsSync(join(l.dir, 'screenshots', 'u000000000001-delivery.png')), "the old layout's screenshots go");
    assert.ok(existsSync(join(l.dir, 'screenshots', 'uploaded', 'kept.png')), 'the screenshots uploaded by file name stay');
    assert.ok(after.sheet, 'the uploaded sheet stays');
    assert.equal(after.sheet.mapping.orderId, 1, 'the remembered columns stay');
  } finally {
    await l.close();
  }
});

test("the store: removing a row removes every check of that row, older ones too, never another row's; a check stopped before it had a result names no row, so it goes only with Remove all rows, which removes every check's folder", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'arc-store-checks-'));
  try {
    const s = createStore(dir);
    await s.init();
    const [a, b] = await s.replaceSheetRows([{ row: 2, orderId: { text: '403-0000001-0000001' } }, { row: 3, orderId: { text: '403-0000002-0000002' } }]);
    // Made-up checks: two of row a (an older one, then its last), one of row b, and one stopped before it had a result.
    const ID = { aOld: 'c20261019100000aaaaa1', aLast: 'c20261019100100aaaaa2', b: 'c20261019100200bbbbb1', stopped: 'c20261019100300ccccc1' };
    const made = (checkId, rowId) => s.saveResult({ checkId, rowId, status: 'Fail', type: 'Not delivered', typeKey: 'notDelivered', final: 'fail', note: 'A made-up note.', finishedAt: '2026-10-19T10:00:00.000Z', steps: [], seen: { delivery: { orderIds: ['403-0000001-0000001'], text: 'Made-up words read from a screenshot' } } });
    await made(ID.aOld, a.id);
    await made(ID.aLast, a.id);
    await made(ID.b, b.id);
    mkdirSync(join(dir, 'checks', ID.stopped));
    for (const id of Object.values(ID)) writeFileSync(join(dir, 'checks', id, 'step-1.png'), PNG);
    assert.equal((await s.get(a.id)).last.checkId, ID.aLast);
    await s.remove(a.id);
    assert.deepEqual(readdirSync(join(dir, 'checks')).sort(), [ID.b, ID.stopped], "both of row a's checks went; row b's and the stopped one stay");
    assert.equal((await s.get(b.id)).last.checkId, ID.b);
    assert.ok(existsSync(join(dir, 'checks', ID.b, 'result.json')));
    assert.equal(await s.removeAll(), 1);
    assert.deepEqual(readdirSync(join(dir, 'checks')), [], "every check's folder is gone");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('neither remove button works while a check, the rows being checked or a sheet upload is running', async () => {
  const { rows } = await rowsNow();
  let open = () => {};
  release = new Promise((r) => (open = r));
  try {
    const started = checks.length;
    const run = json('POST', '/local/amazon/check-all', {});
    await until(() => checks.length > started, 'the rows are being checked');
    const del = await call('POST', `/local/amazon/rows/${rows[0].id}/remove`, { body: '{}', type: 'application/json' });
    assert.equal(del.status, 409);
    assert.equal(del.json.message, 'A check or a sheet upload is running. Wait for it to finish, then delete the row.');
    assert.equal((await json('POST', '/local/amazon/rows/remove-all', { expected: rows.length })).status, 409);
    open();
    await run;
  } finally {
    open();
    release = null;
  }
});

test('a problem in settings.json is said on the screen, and no check starts until it is put right', async () => {
  const l = await lab({ settings: async () => {
    throw new SettingsError('The settings file could not be read: a comma, quote or bracket is missing or extra near line 4. Put it back, save the file, then try again.');
  } });
  try {
    const view = await rowsNow(l.opts);
    assert.equal(view.settingsProblem, 'The settings file could not be read: a comma, quote or bracket is missing or extra near line 4. Put it back, save the file, then try again.');
    const added = await call('POST', '/local/amazon/rows', { ...l.opts, ...multipart({ orderId: '1' }) });
    assert.equal(added.status, 400);
    assert.match(added.json.message, /^The settings file could not be read/);
  } finally {
    await l.close();
  }
});

test('the top bar: "Log in to Amazon" opens Amazon’s home page, and its login page only when no one is logged in; the login is followed until Amazon shows a name', async () => {
  const amazon = { loggedIn: false, opened: [], hold: null };
  // A stand-in for the Live Amazon Browser: Amazon's home page shows the account line; its login page shows a login form.
  const window = {
    onAccount: null,
    isOpen: () => true,
    begin: async () => {},
    close: async () => {},
    async open(url) {
      amazon.opened.push(url);
      if (amazon.hold) await amazon.hold;
      const facts = url.startsWith('https://www.amazon.in/ap/') ? { url, title: 'Amazon Sign In', hello: null, signInForm: true } : { url, title: 'Amazon.in', hello: amazon.loggedIn ? 'Hello, Test Staff' : 'Hello, sign in' };
      return { ok: true, status: 200, url, facts };
    },
    readAccount: async () => (amazon.loggedIn ? { account: { signedIn: true, name: 'Test Staff' }, loginPage: false } : { account: { signedIn: false }, loginPage: true }),
  };
  const l = await lab({ live: window, login: createLogin({ live: window, watchMs: 20 }) });
  const top = async () => (await call('GET', '/local/amazon/account', l.opts)).json;
  const press = (path) => call('POST', path, { ...l.opts, body: '{}', type: 'application/json' });
  // Amazon's pages take a moment to open.
  let open = () => {};
  const slow = () => (amazon.hold = new Promise((r) => (open = r)));
  const ready = () => {
    amazon.hold = null;
    open();
  };
  try {
    assert.equal((await top()).state, 'checking');
    slow();
    const pressed = await press('/local/amazon/log-in');
    assert.equal(pressed.status, 200);
    assert.equal(pressed.json.state, 'checking', 'the top bar says at once that the login is being checked');
    const refused = await press('/local/amazon/check-all');
    assert.equal(refused.status, 409);
    assert.equal(refused.json.message, 'The Amazon login is being checked. Wait a moment, then press "Start checking" again.');
    ready();
    await until(async () => (await top()).state === 'waiting', 'Amazon’s login page shows');
    assert.deepEqual(amazon.opened, [AMAZON_HOME, SIGN_IN_URL], 'the home page first; the login page because no one is logged in');
    amazon.loggedIn = true; // the person logs in by hand
    await until(async () => (await top()).state === 'in', 'the login is noticed');
    const now = await top();
    assert.deepEqual([now.name, now.loggedIn, now.says], ['Test Staff', true, null]);

    amazon.opened.length = 0;
    await press('/local/amazon/log-in');
    await until(async () => (await top()).state === 'in' && amazon.opened.length > 0, 'checked again');
    assert.deepEqual(amazon.opened, [AMAZON_HOME], 'with the login saved, the login page is never shown');

    slow();
    assert.equal((await press('/local/amazon/check-login')).json.state, 'checking');
    ready();
    await until(async () => (await top()).state === 'in', 'the login checked again');

    // Amazon ends the login later: the next page a check opens is its login page.
    window.onAccount({ signedIn: false }, { url: SIGN_IN_URL, signInForm: true });
    assert.deepEqual([(await top()).state, (await top()).name], ['out', null]);
  } finally {
    await l.close();
  }
});

test('checks keep a copy of the Amazon pages they open until one has kept them all; those copies are never served', async () => {
  // A check of this test file's own dashboard (a separate data folder's is gone with it).
  const c = checks.find((x) => x.pagesDir?.startsWith(dataDir));
  assert.ok(c, 'pages are being kept');
  for (const p of KEPT_PAGES) writeFileSync(join(c.pagesDir, `${p}.html`), '<!doctype html>');
  assert.equal(await store.keptPages(), c.checkId);
  const two = byRow((await rowsNow()).rows, 2);
  await json('POST', `/local/amazon/rows/${two.id}/check`, {});
  assert.equal(checks.at(-1).pagesDir, null, 'once one check has kept every page, no more are kept');
  assert.equal((await call('GET', `/local/amazon/checks/${c.checkId}/pages/review.html`)).status, 404);
});

test('the wrong kind of request gets a plain answer and never closes the dashboard; too large is refused', async () => {
  const lost = [];
  const note = (e) => lost.push(e?.message ?? String(e));
  process.on('unhandledRejection', note);
  try {
    for (const path of ['/local/amazon/sheet', '/local/amazon/rows']) {
      const r = await call('POST', path, { body: '{}', type: 'application/json' });
      assert.equal(r.status, 415, path);
      assert.equal(r.json.message, 'The form could not be read. Reload the page, then try again.');
    }
    for (const path of ['/local/amazon/check-all', '/local/amazon/campaigns', '/local/amazon/rows/remove-all']) {
      assert.equal((await call('POST', path, { body: 'x', type: 'text/plain' })).status, 415, path);
    }
    const big = multipart({ orderId: 'x' }, [{ field: 'order', name: 'big.png', data: Buffer.alloc(31 * 1024 * 1024, 1) }]);
    const r = await call('POST', '/local/amazon/rows', big).catch(() => ({ status: 'reset' }));
    assert.ok([413, 0, 'reset'].includes(r.status), String(r.status));
    assert.equal((await call('GET', '/local/amazon/rows')).status, 200, 'the dashboard still answers');
    await sleep(50);
    assert.deepEqual(lost, []);
  } finally {
    process.off('unhandledRejection', note);
  }
});

test('the row view never carries a file name, a hash or a fingerprint', () => {
  const v = rowView({ id: 'r000000000001', source: 'sheet', row: 2, orderId: { text: 'x' }, shots: { order: { links: ['https://drive.google.com/open?id=1Testabcdefghij'], link: 'https://drive.google.com/open?id=1Testabcdefghij', text: '' } }, pictures: { order: [{ link: 'https://drive.google.com/open?id=1Testabcdefghij', file: 'r000000000001-order-0.png', sha256: 'x', fingerprint: 'y', type: 'image/png', at: 'z' }] } });
  assert.deepEqual(v.shots.order.pictures, [{ i: 0, ok: true, type: 'image/png', at: 'z', link: 'https://drive.google.com/open?id=1Testabcdefghij' }]);
  assert.ok(!JSON.stringify(v).includes('sha256') && !JSON.stringify(v).includes('fingerprint') && !JSON.stringify(v).includes('-order-0.png'));
});

test('a campaign needs a brand, a name and its products as Amazon links or ASIN numbers; anything else is said plainly', async () => {
  const save = (body) => json('POST', '/local/amazon/campaigns', { brand: 'Test Brand', name: 'Test Sale', live: true, products: 'B0TESTSAL1', ...body });
  const cases = [
    [{ brand: ' ' }, 'Write the brand, for example Koparo.'],
    [{ name: '' }, "Write the campaign's name, for example Koparo Clean."],
    [{ products: '' }, 'Write at least one product: an Amazon link or an ASIN number on each line.'],
    [{ products: 'B0TESTSAL1\nfloor cleaner' }, 'Line 2 of the products, "floor cleaner", is not an Amazon link or an ASIN number.'],
    [{ products: 'https://www.flipkart.com/item/1' }, 'Line 1 of the products is a link to www.flipkart.com, not to Amazon India, so it cannot be used.'],
  ];
  for (const [body, says] of cases) {
    const r = await save(body);
    assert.equal(r.status, 400, says);
    assert.equal(r.json.message, says);
  }
  assert.equal((await json('POST', '/local/amazon/campaigns/k000000000000', {})).json.message, 'No campaign has that id. Reload the page.');
  assert.deepEqual((await rowsNow()).campaigns.map((c) => c.name), ['Test Clean'], 'nothing was kept');
});

test('a picture in the sheet over 10 MB is that cell’s problem; the other rows still get theirs', async () => {
  const big = Buffer.concat([PNG.subarray(0, 33), Buffer.alloc(11 * 1024 * 1024)]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Amazon');
  ws.addRow(HEADER);
  ws.addRow(['403-1000002-2000002', '20-07-2026', 654, PRODUCTS[0], '', deliveryShot(2), 'https://amzn.in/d/0TestRow02']);
  ws.addRow(['403-1000003-2000003', '20-07-2026', 654, PRODUCTS[0], '', deliveryShot(3), 'https://amzn.in/d/0TestRow03']);
  ws.addImage(wb.addImage({ buffer: big, extension: 'png' }), { tl: { col: 4.1, row: 1.1 }, ext: { width: 80, height: 50 } });
  ws.addImage(wb.addImage({ buffer: PNG, extension: 'png' }), { tl: { col: 4.1, row: 2.1 }, ext: { width: 80, height: 50 } });
  const l = await lab();
  try {
    const before = downloads.length;
    const up = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'big.xlsx', data: Buffer.from(await wb.xlsx.writeBuffer()) }]) });
    assert.equal(up.json.made, 2, up.text);
    assert.equal(downloads.length, before, 'the delivery links are not downloaded when the sheet is uploaded');
    const [two, three] = (await rowsNow(l.opts)).rows;
    assert.equal(two.shots.order.how, 'floating', 'a picture placed over the cell is part of the file, so it is kept at once');
    assert.deepEqual(two.shots.order.pictures[0].problem, { kind: 'sheet', site: null, says: 'it is larger than 10 megabytes' });
    assert.equal(three.shots.order.pictures[0].ok, true);
  } finally {
    await l.close();
  }
});

test('a file name cut in the middle of an emoji, and a file with macros, still download as the right file', async () => {
  const l = await lab();
  try {
    const name = `${'a'.repeat(199)}😀 orders.xlsx`;
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name, data: ORDERS }]) });
    const r = await call('GET', '/local/amazon/sheet/checked.xlsx', l.opts);
    assert.equal(r.status, 200, r.text);
    assert.match(r.headers['content-disposition'], /^attachment; filename="a{199}[^"]* checked \d{4}-\d{2}-\d{2}\.xlsx"/);
    const types = readZip(ORDERS).get('[Content_Types].xml')().toString('utf8').replace('spreadsheetml.sheet.main+xml', 'sheet.macroEnabled.main+xml');
    const xlsm = replaceInZip(ORDERS, new Map([['[Content_Types].xml', Buffer.from(types)]]));
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'July orders.xlsm', data: xlsm }]) });
    const m = await call('GET', '/local/amazon/sheet/checked.xlsx', l.opts);
    assert.equal(m.headers['content-type'], 'application/vnd.ms-excel.sheet.macroEnabled.12');
    assert.match(m.headers['content-disposition'], /filename="July orders checked \d{4}-\d{2}-\d{2}\.xlsm"/, 'a file with macros keeps its own kind');
  } finally {
    await l.close();
  }
});

test('uploading another file replaces the rows; rows with results are replaced only when the screen has asked first', async () => {
  const l = await lab();
  try {
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'orders.xlsx', data: ORDERS }]) });
    const [two] = (await rowsNow(l.opts)).rows;
    await call('POST', `/local/amazon/rows/${two.id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    const added = await call('POST', '/local/amazon/rows', { ...l.opts, ...multipart({ orderId: '403-7777777-7777777' }) });
    const unasked = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'orders.xlsx', data: ORDERS }]) });
    assert.equal(unasked.status, 409);
    assert.equal(unasked.json.message, 'Rows were checked since the screen last showed them, so upload the file again to be asked first whether their results may go.');
    assert.equal(byRow((await rowsNow(l.opts)).rows, 2).last.status, 'Pass', 'nothing changed');
    const asked = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({ replace: '1' }, [{ field: 'file', name: 'orders.xlsx', data: ORDERS }]) });
    assert.equal(asked.status, 200, asked.text);
    const after = await rowsNow(l.opts);
    assert.equal(after.rows.filter((r) => r.source === 'sheet').length, 30);
    assert.equal(byRow(after.rows, 2).last, null, 'the new rows have no results yet');
    assert.notEqual(byRow(after.rows, 2).id, two.id);
    assert.ok(after.rows.some((r) => r.id === added.json.row.id), 'a row added by hand stays');
  } finally {
    await l.close();
  }
});

test('a new file can be uploaded while rows are checked: asked to stop that first (stop=1), the checking stops, then the new rows are in, numbered from 1, with nothing checked; the rows added by hand and the campaigns stay', async () => {
  const { l, press, n } = await labWithRows({ byHand: true });
  let let3go = () => {};
  try {
    await json('POST', '/local/amazon/campaigns', { brand: 'Test Brand', name: 'Test Keep', live: false, products: 'B0TESTKEP1' }, l.opts);
    await until(async () => (await runningNow(l.opts)) === null, "the campaign's product was looked at");
    plan.set(n(3).id, { hold: new Promise((r) => (let3go = r)) });
    const before = checks.length;
    const run = press();
    await until(() => checks.slice(before).some((c) => c.rowId === n(3).id), 'row 3 is being checked');
    const file = [{ field: 'file', name: 'August orders.xlsx', data: ORDERS }];
    const unasked = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({ replace: '1' }, file) });
    assert.equal(unasked.status, 409);
    assert.equal(unasked.json.message, 'Rows are being checked right now, so upload the file again to be asked whether to stop that first.');
    const unreadable = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({ replace: '1', stop: '1' }, [{ field: 'file', name: 'old.xls', data: Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(200)]) }]) });
    assert.equal(unreadable.json.message, 'This is an old Excel file (.xls) that the dashboard cannot read, so open it in Excel, save it as an Excel Workbook (.xlsx), then upload that.');
    assert.equal((await runningNow(l.opts))?.kind, 'run', 'a file that cannot be read stops nothing');
    const heard = aborts.length;
    const up = call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({ replace: '1', stop: '1' }, file) });
    await until(() => aborts.length > heard, 'the checking was told to stop');
    let3go(); // the row it was on finishes the step it is on
    const done = await up;
    assert.equal(done.status, 200, done.text);
    assert.equal((await run).lines.at(-1).event, 'run-stopped', 'the checking stopped first');
    const after = await rowsNow(l.opts);
    const fromFile = after.rows.filter((r) => r.source === 'sheet');
    assert.equal(after.sheet.fileName, 'August orders.xlsx');
    assert.deepEqual(fromFile.map((r) => r.n), Array.from({ length: 30 }, (_, i) => i + 1), 'numbered from 1');
    assert.deepEqual(fromFile.slice(0, 2).map((r) => r.label), ['Row 1', 'Row 2']);
    assert.ok(fromFile.every((r) => r.last === null), 'nothing checked yet');
    assert.deepEqual(after.rows.filter((r) => r.source === 'manual').map((r) => r.label), ['By hand #1'], 'the row added by hand stays');
    assert.deepEqual(after.campaigns.map((c) => c.name), ['Test Keep'], 'the campaigns stay');
    assert.equal(await runningNow(l.opts), null, 'nothing runs afterwards');
  } finally {
    let3go();
    plan.clear();
    await l.close();
  }
});

test("a new file can be uploaded while a campaign's products are read: asked to stop that first (stop=1), the reading stops after the page it is on, then the new rows are in; a product not read yet waits", async () => {
  const l = await lab();
  let gate = () => {};
  const held = new Promise((r) => (gate = r));
  try {
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'small.xlsx', data: await smallOrders() }]) });
    pages = async (url) => (await held, productPage(url.match(/\/dp\/(\w+)/)[1], 'Test Brand Slow Cleaner'));
    const saved = await json('POST', '/local/amazon/campaigns', { brand: 'Test Brand', name: 'Test Slow', live: true, products: 'B0TESTSLO1\nB0TESTSLO2' }, l.opts);
    assert.equal(saved.status, 201, saved.text);
    await until(async () => (await runningNow(l.opts))?.kind === 'campaign', "the campaign's products are being read");
    const file = [{ field: 'file', name: 'August orders.xlsx', data: ORDERS }];
    const unasked = await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({ replace: '1' }, file) });
    assert.equal(unasked.status, 409);
    assert.equal(unasked.json.message, "A campaign's products are being read from Amazon right now, so upload the file again to be asked whether to stop that first.");
    const up = call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({ replace: '1', stop: '1' }, file) });
    await sleep(100);
    gate(); // the page it is on finishes
    const done = await up;
    assert.equal(done.status, 200, done.text);
    const after = await rowsNow(l.opts);
    assert.equal(after.sheet.fileName, 'August orders.xlsx');
    assert.equal(after.rows.filter((r) => r.source === 'sheet').length, 30);
    assert.deepEqual(after.campaigns.find((c) => c.name === 'Test Slow').products.map((p) => p.state), ['used', 'waiting'], 'the page it was on is kept; the next one is read before the next row is checked');
    assert.equal(await runningNow(l.opts), null);
  } finally {
    gate();
    pages = null;
    await l.close();
  }
});

// ---- a separate data folder for a test ----

async function lab(over = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'arc-routes-lab-'));
  const base = createStore(dir);
  await base.init();
  const sess = createSessions();
  // Its own Live Amazon Browser stand-in, so the shared one still tells the first server who is logged in.
  const labLive = { ...live, onAccount: null };
  const labRoutes = createAmazonRoutes({ store: base, live: labLive, images, auth: (req) => sess.verify(bearerOf(req)), check: fakeCheck, download: fakeDownload, settings: async () => checkSettings({ secondsBetweenDownloads: 0 }), google, ...over });
  const srv = createServer(createHandler({ root: ROOT, sessions: sess, local: labRoutes }));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const opts = { at: srv.address().port, token: sess.get().token };
  const close = async () => {
    srv.closeAllConnections();
    srv.close();
    await rm(dir, { recursive: true, force: true });
  };
  return { dir, opts, close };
}

test('the Google login: with none, checking pauses before the first row with a Google Drive screenshot to download, after reading the cookies again; the Drive files are downloaded by the Live Amazon Browser with its login; Google asking to log in while downloading pauses and turns the top bar to "Not logged in to Google"; the buttons', async () => {
  // A Live Amazon Browser stand-in with its own download, as the real one has.
  const window = { ...live, onAccount: null, fetch: async () => new Response(PNG, { status: 200 }) };
  const l = await lab({ live: window });
  const top = async () => (await call('GET', '/local/amazon/account', l.opts)).json;
  const press = (path) => call('POST', path, { ...l.opts, body: '{}', type: 'application/json' });
  const run = () => json('POST', '/local/amazon/check-all', {}, l.opts);
  try {
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: 'orders.xlsx', data: ORDERS }]) });
    const rows = (await rowsNow(l.opts)).rows;
    const [first, second] = rows.filter((r) => !r.done && r.shots.order.links.some((x) => x.includes('drive.google.com')));
    assert.deepEqual((await top()).google, { state: 'in', name: 'Test Google', says: null, chrome: false }, 'the top bar carries the Google login');
    // No Google login: the first row that needs one pauses the run before it starts; the cookies were read again first, no page opened.
    googleNow.state = 'out';
    googleNow.checks.length = 0;
    const before = [checks.length, downloads.length];
    const paused = await run();
    const last = paused.lines.at(-1);
    assert.deepEqual([last.event, last.kind, last.rowId, last.label], ['paused', 'google-out', first.id, first.label]);
    assert.equal(last.says, PAUSE_SAYS['google-out']);
    assert.deepEqual([checks.length, downloads.length], before, 'no row was checked and nothing was downloaded: the pause is before the row');
    assert.deepEqual(googleNow.checks, [`before checking ${first.label.toLowerCase()}`], 'the saved profile\'s cookies were read again first');
    assert.equal((await rowsNow(l.opts)).rows.find((r) => r.id === first.id).last, null, 'the row gets no result, and no "Need Google Drive Access"');
    // The row's own button: the same, naming that button.
    const one = await press(`/local/amazon/rows/${first.id}/check`);
    assert.deepEqual(one.lines.at(-1), { event: 'paused', kind: 'google-out', says: PAUSE_SAYS['google-out'].replace('"Carry on checking"', 'Check') });
    // Logged in by the time "Carry on checking" is pressed (found when the cookies are read again): the row is checked, and its Drive files are downloaded by the window itself, with its login.
    googleNow.next = 'in';
    plan.set(first.id, { askPictures: 'order' });
    plan.set(second.id, { paused: 'signin' }); // Amazon's login page at the second Drive row: the run stops there, so that row is still to be checked
    const goOn = await run();
    plan.clear();
    assert.ok(goOn.lines.some((x) => x.event === 'row-done' && x.rowId === first.id), 'checked');
    const mine = downloads.slice(before[1]);
    const drive = mine.find((d) => d.link === first.shots.order.links[0]);
    assert.equal(drive?.viaLogin, true, 'a Google Drive file: downloaded by the Live Amazon Browser with its Google login, no page opened');
    assert.ok(mine.every((d) => d.viaLogin === d.link.includes('drive.google.com')), 'other websites: never with a login');
    // Google's login page while a screenshot is downloaded: the check pauses at that row, and the top bar says "Not logged in to Google".
    pauseNext = 'google-signin';
    plan.set(second.id, { askPictures: 'order' });
    const again = await run();
    plan.delete(second.id);
    const stop = again.lines.at(-1);
    assert.deepEqual([stop.event, stop.kind, stop.rowId], ['paused', 'google-signin', second.id]);
    assert.equal(stop.says, PAUSE_SAYS['google-signin']);
    assert.equal((await top()).google.state, 'out', 'the saved login has ended');
    assert.equal((await rowsNow(l.opts)).rows.find((r) => r.id === second.id).last, null, 'no result for that row');
    // The buttons: "Log in to Google" starts the login; while a normal Chrome window is open for it, nothing can use the Live Amazon Browser.
    assert.equal((await press('/local/amazon/google/log-in')).json.google.state, 'waiting');
    assert.deepEqual(googleNow.pressed.at(-1), ['log-in', 'when "Log in to Google" was pressed']);
    const refused = await press('/local/amazon/check-all');
    assert.equal(refused.status, 409);
    assert.equal(refused.json.message, 'A normal Chrome window is open for the Google login. Log in to Google there and press "I have logged in", then press "Carry on checking" again.');
    assert.equal((await press('/local/amazon/log-in')).status, 409, 'the Amazon login waits too');
    assert.equal((await press('/local/amazon/google/logged-in')).json.google.state, 'in');
    assert.deepEqual(googleNow.pressed.at(-1), ['done', 'when "I have logged in" was pressed']);
    assert.equal((await press('/local/amazon/google/log-in-in-chrome')).status, 200);
    assert.deepEqual(googleNow.pressed.at(-1), ['chrome', 'when "Log in to Google in a normal Chrome window" was pressed']);
    assert.equal((await press('/local/amazon/google/check-login')).status, 200);
    assert.equal(googleNow.checks.at(-1), 'when "Check the Google login again" was pressed');
    assert.equal((await press('/local/amazon/google/other')).status, 404);
    // A row added by hand with a Google Drive link while no one is logged in: the file is downloaded when the row is checked, and the row says so.
    googleNow.state = 'out';
    const added = await call('POST', '/local/amazon/rows', { ...l.opts, ...multipart({ orderId: '403-8888888-8888888', orderLink: orderShot(9) }) });
    assert.equal(added.status, 201, added.text);
    assert.deepEqual(added.json.row.shots.order.pictures[0].problem, { kind: 'drive', site: 'Google Drive', says: 'no one is logged in to Google, so it was not downloaded yet' });
    assert.ok(!downloads.some((d) => d.link === orderShot(9)), 'not downloaded without the login');
  } finally {
    googleNow.state = 'in';
    googleNow.next = null;
    pauseNext = null;
    plan.clear();
    await l.close();
  }
});

test('"Change the result": the Status, the Type and the Note a staff member chose replace the row\'s result and say "Changed by staff"; "Start checking" and "Check every row again" pass the row by; "Check again" replaces it; the checked Excel file keeps it; another row\'s check never makes it a duplicate', async () => {
  const { l, press, n } = await labWithRows({ statuses: { 3: 'Verified' } });
  try {
    const row = n(2);
    const post = (body, id = row.id) => json('POST', `/local/amazon/rows/${id}/result`, body, l.opts);
    assert.equal((await post({ final: 'maybe', typeKey: 'notDelivered', note: '' })).json.message, 'Choose a Status: Pass, Fail or Needs Manual Staff Checking.');
    assert.equal((await post({ final: 'fail', typeKey: 'nope', note: '' })).json.message, 'Choose a Type from the list.');
    assert.equal((await post({ final: 'fail', typeKey: 'notDelivered', note: 'x'.repeat(4001) })).json.message, 'The Note is too long: at most 4000 letters.');
    assert.equal((await post({ final: 'fail', typeKey: 'notDelivered', note: '' }, 'r000000000000')).status, 404);
    const changed = await post({ final: 'fail', typeKey: 'notDelivered', note: '  The user wrote that the order never came.  ' });
    assert.equal(changed.status, 200, changed.text);
    const v = changed.json.row;
    assert.deepEqual([v.final, v.last.status, v.last.type, v.last.typeKey, v.last.note, v.last.finalSays, v.last.seconds, v.done, v.emailKey], ['fail', 'Fail', 'Not delivered', 'notDelivered', 'The user wrote that the order never came.', null, null, true, 'notDelivered']);
    assert.match(v.last.staff.at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(v.last.at, v.last.staff.at);
    assert.deepEqual([v.last.staff.right, v.last.staff.was], [false, null], 'changed by hand; the dashboard had said nothing yet, so there is nothing to count as wrong');
    assert.ok(byRow((await rowsNow(l.opts)).rows, 2).last.staff, 'the table knows');
    // "Start checking" passes it by, and so does "Check every row again": the staff's result stays.
    const run = await press();
    assert.ok(!rowEvents(run).some((x) => x.rowId === row.id), 'passed by');
    const again = await press({ again: true });
    assert.deepEqual([again.lines[0].event, ...counts(again.lines[0])], ['run-started', 5, 1, 4], 'one row keeps its result');
    assert.deepEqual(rowEvents(again).map((x) => x.label), ['Row 2', 'Row 3', 'Row 4', 'Row 5']);
    const kept = byRow((await rowsNow(l.opts)).rows, 2);
    assert.deepEqual([kept.last.typeKey, Boolean(kept.last.staff), kept.recheck], ['notDelivered', true, false]);
    // The checked Excel file holds what the staff member chose.
    const x = await call('GET', '/local/amazon/sheet/checked.xlsx', l.opts);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.buf);
    assert.deepEqual([wb.getWorksheet('Amazon').getCell('H2').value, wb.getWorksheet('Amazon').getCell('I2').value, wb.getWorksheet('Amazon').getCell('J2').value], ['Fail', 'Not delivered', 'The user wrote that the order never came.']);
    // Another row's check that would make it a duplicate: the staff's result stays.
    plan.set(n(4).id, { alsoDuplicate: [row.id] });
    await call('POST', `/local/amazon/rows/${n(4).id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    plan.clear();
    assert.equal(byRow((await rowsNow(l.opts)).rows, 2).last.typeKey, 'notDelivered', 'never made a duplicate');
    // While the row is being checked, its result cannot be changed.
    let open = () => {};
    release = new Promise((res) => (open = res));
    try {
      const checking = call('POST', `/local/amazon/rows/${row.id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
      await until(async () => (await runningNow(l.opts))?.kind === 'check', 'the check is running');
      assert.equal((await post({ final: 'pass', typeKey: 'verified', note: '' })).json.message, 'This row is being checked right now. Wait for it to finish, then change its result.');
      open();
      await checking;
    } finally {
      open();
      release = null;
    }
    // "Check again" replaced the staff's result with what the dashboard found.
    const after = byRow((await rowsNow(l.opts)).rows, 2);
    assert.deepEqual([after.last.typeKey, after.last.staff, after.final], ['verified', null, 'pass']);
  } finally {
    plan.clear();
    await l.close();
  }
});

test('emails to users: the rows view carries every email and the test address; "Email this user" fills the email in for the row; Send goes through the sender one row at a time, only to the test address, and is recorded on the row; a login page stops the rest; nothing is sent while rows are checked, and no row is checked while emails are sent', async () => {
  const sent = [];
  let answer = () => ({ ok: true, at: '2026-10-08T09:00:00.000Z' });
  let hold = null;
  const sender = {
    async send(email, { say, signal }) {
      say('Pressing Send in Gmail');
      sent.push({ ...email, stopped: Boolean(signal?.aborted) });
      if (hold) await hold;
      return answer(email);
    },
  };
  const file = join(mkdtempSync(join(tmpdir(), 'arc-routes-emails-')), 'settings.json');
  writeFileSync(file, `${JSON.stringify({ secondsBetweenDownloads: 0 })}\n`);
  const l = await lab({ sender, saveEmailSettings: (emails) => saveEmails(emails, file) });
  const post = (path, body) => json('POST', path, body, l.opts);
  try {
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: NEW_FILE_NAME, data: await newLayoutBook() }]) });
    const view = await rowsNow(l.opts);
    assert.deepEqual([view.emails.testEmail, view.emails.signOff, view.emails.templates.map((t) => t.key), view.emails.placeholders.map((p) => p.word)], ['', DEFAULT_EMAILS.signOff, EMAIL_KEYS, ['{name}', '{order ID}', '{product}', '{what is wrong}', '{sign-off}']]);
    assert.deepEqual(view.emails.templates.find((t) => t.key === 'notDeliveredCancelled').name, 'Not delivered (cancelled or returned)');
    const [one, two] = view.rows;
    assert.deepEqual([one.emailKey, one.emails, one.last], [null, [], null], 'a row not checked yet has no email');
    assert.equal((await call('GET', `/local/amazon/rows/${one.id}/email`, l.opts)).json.message, 'Row 1 has no email: its Type has none, or it is not checked yet.');
    plan.set(one.id, { typeKey: 'orderIdNotMatching', final: 'fail' });
    await call('POST', `/local/amazon/rows/${one.id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    await call('POST', `/local/amazon/rows/${two.id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    plan.clear();
    // The email for one row: filled in from the file and the check, to the test address (none yet).
    const preview = await call('GET', `/local/amazon/rows/${one.id}/email`, l.opts);
    assert.equal(preview.status, 200, preview.text);
    const e = preview.json.emails[0];
    assert.deepEqual([preview.json.emails.length, preview.json.skipped, preview.json.testEmail], [1, [], '']);
    assert.deepEqual([e.rowId, e.label, e.key, e.name, e.to, e.emailedBefore], [one.id, 'Row 1', 'orderIdNotMatching', 'Order ID is not matching', '', null]);
    assert.equal(e.subject, `Your order ${newOrderId(1)}: the order ID does not match`);
    assert.ok(e.message.startsWith(`Hello Test Reviewer One,\n\nThis is about your order ${newOrderId(1)} for Face Wash For Man - Amazon.\n\nThe order ID you gave, ${newOrderId(1)}, is not the order ID on your screenshot.`), e.message);
    assert.ok(e.message.endsWith(DEFAULT_EMAILS.signOff));
    assert.equal(byRow((await rowsNow(l.opts)).rows, one.row).emailKey, 'orderIdNotMatching');
    // Many rows: the ones whose Type has no email are said.
    const many = await post('/local/amazon/emails/preview', { rowIds: [one.id, two.id] });
    assert.deepEqual([many.json.emails.map((x) => x.rowId), many.json.skipped], [[one.id], [{ rowId: two.id, label: 'Row 2', says: 'Row 2 has no email: its Type has none, or it is not checked yet.' }]]);
    assert.equal((await post('/local/amazon/emails/preview', { rowIds: [] })).json.message, 'Choose at least one row.');
    // Nothing is sent without a test email address; the address is checked and kept.
    const mine = { rowId: one.id, key: e.key, subject: 'My subject', message: 'My words\nfor the user' };
    assert.equal((await post('/local/amazon/emails/send', { emails: [mine] })).json.message, 'Fill in the Test email address first: every email goes to that address.');
    assert.equal((await post('/local/amazon/email-address', { email: 'not an address' })).json.message, 'Write an email address, such as name@example.com.');
    assert.deepEqual((await post('/local/amazon/email-address', { email: ' test.person@example.test ' })).json, { testEmail: 'test.person@example.test' });
    assert.equal((await rowsNow(l.opts)).emails.testEmail, 'test.person@example.test', 'kept for next time');
    assert.equal((await call('GET', `/local/amazon/rows/${one.id}/email`, l.opts)).json.emails[0].to, 'test.person@example.test');
    for (const bad of [{ emails: [] }, { emails: [{ ...mine, rowId: 'x' }] }, { emails: [{ ...mine, key: 'verified' }] }, { emails: [{ ...mine, subject: ' ' }] }, { emails: [{ ...mine, message: '' }] }]) assert.equal((await post('/local/amazon/emails/send', bad)).status, 400, JSON.stringify(bad));
    // Sent: as the staff member last saw it, only to the test address; recorded on the row.
    const one1 = await post('/local/amazon/emails/send', { emails: [mine] });
    assert.equal(one1.status, 200, one1.text);
    assert.deepEqual(one1.lines.map((x) => x.event), ['emails-started', 'email', 'action', 'email-sent', 'emails-done']);
    assert.deepEqual([one1.lines[0].total, one1.lines[0].to, one1.lines[1].index, one1.lines[1].label, one1.lines[2].says], [1, 'test.person@example.test', 1, 'Row 1', 'Pressing Send in Gmail']);
    assert.deepEqual(sent, [{ to: 'test.person@example.test', subject: 'My subject', message: 'My words\nfor the user', stopped: false }], 'the email as it was on the screen, to the test address only');
    const done = one1.lines.at(-1);
    assert.deepEqual([done.sent, done.failed, done.total], [1, 0, 1]);
    const sentRow = one1.lines[3].rows[0];
    assert.deepEqual(sentRow.emails, [{ at: '2026-10-08T09:00:00.000Z', key: 'orderIdNotMatching', name: 'Order ID is not matching', subject: 'My subject', mode: 'test', maybe: false }]);
    assert.deepEqual(byRow((await rowsNow(l.opts)).rows, one.row).emails, sentRow.emails, 'the table shows when the row was emailed and about what');
    assert.deepEqual((await call('GET', `/local/amazon/rows/${one.id}/email`, l.opts)).json.emails[0].emailedBefore, { at: '2026-10-08T09:00:00.000Z', name: 'Order ID is not matching', maybe: false });
    assert.deepEqual([one1.lines[0].mode, one1.lines[1].to, done.maybe], ['test', 'test.person@example.test', 0]);
    // Send pressed, but Gmail did not say the email was sent: "maybe sent", kept on the row like a sent one, so nobody sends it twice by mistake.
    answer = () => ({ ok: false, maybe: true, says: 'Send was pressed, but Gmail did not say the email was sent, so it may or may not have gone. Look in your Sent emails before sending it again.' });
    const unsure = await post('/local/amazon/emails/send', { emails: [mine] });
    assert.deepEqual(unsure.lines.map((x) => x.event), ['emails-started', 'email', 'action', 'email-maybe', 'emails-done']);
    assert.deepEqual([unsure.lines[3].says, unsure.lines[3].rows[0].emails.at(-1).maybe, unsure.lines.at(-1).sent, unsure.lines.at(-1).maybe, unsure.lines.at(-1).failed], [answer().says, true, 0, 1, 0]);
    const kept = byRow((await rowsNow(l.opts)).rows, one.row).emails;
    assert.deepEqual([kept.length, kept.at(-1).maybe, kept.at(-1).mode], [2, true, 'test']);
    assert.equal((await call('GET', `/local/amazon/rows/${one.id}/email`, l.opts)).json.emails[0].emailedBefore.maybe, true);
    // A login page while sending: the rest is not sent; a failure is said for that row and the rest go on.
    answer = () => ({ ok: false, pause: 'google-signin', says: EMAIL_PAUSE_SAYS['google-signin'] });
    const paused = await post('/local/amazon/emails/send', { emails: [mine, { ...mine, subject: 'Second' }] });
    assert.deepEqual(paused.lines.map((x) => x.event), ['emails-started', 'email', 'action', 'paused']);
    assert.deepEqual([paused.lines.at(-1).kind, paused.lines.at(-1).says, paused.lines.at(-1).rowId, paused.lines.at(-1).sent], ['google-signin', EMAIL_PAUSE_SAYS['google-signin'], one.id, 0]);
    assert.equal(sent.length, 3, 'the second email was not tried');
    answer = () => ({ ok: false, says: 'Gmail did not say the email was sent, so it may not have been sent. Check your Sent emails before sending it again.' });
    const failed = await post('/local/amazon/emails/send', { emails: [mine] });
    assert.deepEqual(failed.lines.map((x) => x.event), ['emails-started', 'email', 'action', 'email-failed', 'emails-done']);
    assert.deepEqual([failed.lines[3].says, failed.lines.at(-1).failed], ['Gmail did not say the email was sent, so it may not have been sent. Check your Sent emails before sending it again.', 1]);
    assert.equal(byRow((await rowsNow(l.opts)).rows, one.row).emails.length, 2, 'not recorded');
    answer = () => ({ ok: true, at: '2026-10-08T09:05:00.000Z' });
    // Every try so far is in the log file: the time, the row, what happened and the reason; never the email's words or address.
    const first = ['Sending 1 email: every one to the test email address.', 'Row 1, Order ID is not matching: sent.', 'Done: 1 sent, 0 maybe sent, 0 not sent, 0 not tried.'];
    const later = [
      'Row 1, Order ID is not matching: maybe sent. Send was pressed, but Gmail did not say the email was sent, so it may or may not have gone. Look in your Sent emails before sending it again.',
      'Done: 0 sent, 1 maybe sent, 0 not sent, 0 not tried.',
      'Row 1, Order ID is not matching: not sent. Gmail did not say the email was sent, so it may not have been sent. Check your Sent emails before sending it again.',
      `Sending stopped at Row 1: ${EMAIL_PAUSE_SAYS['google-signin']} 0 sent, 0 maybe sent, 0 not sent, 2 not tried.`,
      'Sending 2 emails: every one to the test email address.',
    ];
    // The dashboard may answer before the last lines are written in the file, so it is read again until every line checked here is in it, for up to 2 seconds; the checks below then say what is missing.
    const happened = () => readFileSync(join(l.dir, 'email-log.txt'), 'utf8').trim().split('\n').map((x) => x.slice(20));
    await until(() => {
      const now = happened();
      return [...first, ...later].every((x) => now.includes(x));
    }, 'the lines checked in email-log.txt', 2000).catch(() => {});
    const logText = readFileSync(join(l.dir, 'email-log.txt'), 'utf8');
    const logLines = logText.trim().split('\n');
    assert.ok(logLines.every((x) => /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2} /.test(x)), logText);
    const whatHappened = logLines.map((x) => x.slice(20));
    assert.deepEqual(whatHappened.slice(0, 3), first);
    for (const line of later) assert.ok(whatHappened.includes(line), logText);
    assert.doesNotMatch(logText, /My subject|My words|example\.test|@/, "never the email's words or address");
    // No Google login: nothing is sent.
    googleNow.state = 'out';
    assert.equal((await post('/local/amazon/emails/send', { emails: [mine] })).json.message, 'No one is logged in to Google, so no email can be sent. Press "Log in to Google" in the top bar and log in there, then press Send again.');
    googleNow.state = 'in';
    // While rows are checked, nothing is sent; while emails are sent, no row is checked, no file is uploaded and nothing is removed.
    let open = () => {};
    release = new Promise((res) => (open = res));
    try {
      const checking = call('POST', `/local/amazon/rows/${two.id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
      await until(async () => (await runningNow(l.opts))?.kind === 'check', 'the check is running');
      assert.equal((await post('/local/amazon/emails/send', { emails: [mine] })).json.message, 'Rows are being checked. Wait for it to finish, then press Send again.');
      open();
      await checking;
    } finally {
      open();
      release = null;
    }
    let go = () => {};
    hold = new Promise((res) => (go = res));
    try {
      const sending = post('/local/amazon/emails/send', { emails: [mine] });
      await until(async () => (await runningNow(l.opts))?.kind === 'email', 'the emails are being sent');
      assert.deepEqual(await runningNow(l.opts), { kind: 'email', rowId: one.id });
      assert.equal((await call('POST', `/local/amazon/rows/${two.id}/check`, { ...l.opts, body: '{}', type: 'application/json' })).json.message, 'Emails are being sent. Wait for it to finish, then press "Check again".');
      assert.equal((await post('/local/amazon/check-all', {})).json.message, 'Emails are being sent. Wait for it to finish, then press "Carry on checking" again.');
      assert.equal((await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({ replace: '1' }, [{ field: 'file', name: 'orders.xlsx', data: ORDERS }]) })).json.message, 'Emails are being sent right now, so wait for it to finish, then upload the file again.');
      assert.equal((await post(`/local/amazon/rows/${two.id}/remove`, {})).json.message, 'Emails are being sent. Wait for it to finish, then delete the row.');
      assert.equal((await post('/local/amazon/log-in', {})).json.message, 'Emails are being sent. Wait for it to finish, then press Log in to Amazon.');
      go();
      const r = await sending;
      assert.equal(r.lines.at(-1).event, 'emails-done');
    } finally {
      go();
      hold = null;
    }
    // The Email templates box: the sign-off and every email, written into the settings file; anything wrong is a plain sentence.
    const saved = await post('/local/amazon/emails/templates', { signOff: 'Thanks,\nTest Team', templates: { duplicate: { subject: 'Twice: {order ID}', message: 'Hello {name},\n\nSent twice.\n\n{sign-off}' } } });
    assert.equal(saved.status, 200, saved.text);
    assert.deepEqual([saved.json.emails.signOff, saved.json.emails.templates.find((t) => t.key === 'duplicate').subject, saved.json.emails.testEmail], ['Thanks,\nTest Team', 'Twice: {order ID}', 'test.person@example.test']);
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual([raw.secondsBetweenDownloads, raw.emails.signOff, Object.keys(raw.emails.templates)], [0, 'Thanks,\nTest Team', EMAIL_KEYS], 'the other settings stay');
    assert.equal((await post('/local/amazon/emails/templates', { signOff: 'x', templates: { duplicate: { message: 'Hello {user}' } } })).json.message, 'In the settings file, "emails.templates.duplicate.message" uses {user}, which the dashboard does not know. It knows {name}, {order ID}, {product}, {what is wrong} and {sign-off}.');
  } finally {
    googleNow.state = 'in';
    plan.clear();
    release = null;
    await l.close();
    await rm(dirname(file), { recursive: true, force: true });
  }
});

test('"The result is right": the dashboard\'s result stays, marked right by staff with what it said; a result staff chose cannot be marked; a changed result counts as wrong, with what the dashboard had said; "Check again", another row making it a duplicate, and "Check every row again" clear the mark, while a changed result still keeps its row by', async () => {
  const { l, press, n } = await labWithRows();
  const check = (id) => call('POST', `/local/amazon/rows/${id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
  const right = (id) => call('POST', `/local/amazon/rows/${id}/right`, { ...l.opts, body: '{}', type: 'application/json' });
  try {
    const row = n(2);
    assert.equal((await right(row.id)).json.message, 'This row has no result to mark as right. Check it first.');
    assert.equal((await right('r000000000000')).status, 404);
    plan.set(row.id, { typeKey: 'notDelivered', final: 'fail' });
    await check(row.id);
    plan.clear();
    const marked = await right(row.id);
    assert.equal(marked.status, 200, marked.text);
    const v = marked.json.row;
    assert.deepEqual([v.last.staff.right, v.last.staff.was, v.last.typeKey, v.final, v.last.note.length > 0], [true, { final: 'fail', typeKey: 'notDelivered', type: 'Not delivered' }, 'notDelivered', 'fail', true], 'the result stays, with the mark');
    assert.match(v.last.staff.at, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(byRow((await rowsNow(l.opts)).rows, 2).last.staff.right, 'the table knows');
    // A result changed by hand counts as wrong, with what the dashboard had said; it cannot be marked right.
    const three = n(3);
    plan.set(three.id, { typeKey: 'verified' });
    await check(three.id);
    plan.clear();
    const changed = await json('POST', `/local/amazon/rows/${three.id}/result`, { final: 'fail', typeKey: 'notDelivered', note: 'The order never came.' }, l.opts);
    assert.deepEqual([changed.json.row.last.staff.right, changed.json.row.last.staff.was], [false, { final: 'pass', typeKey: 'verified', type: 'Verified' }]);
    assert.equal((await right(three.id)).json.message, 'This result was chosen by staff, not by the dashboard, so it cannot be marked as right. Press "Check again" to get the dashboard\'s result first.');
    const twice = await json('POST', `/local/amazon/rows/${three.id}/result`, { final: 'manual', typeKey: 'needAccess', note: 'Changed again.' }, l.opts);
    assert.deepEqual(twice.json.row.last.staff.was, { final: 'pass', typeKey: 'verified', type: 'Verified' }, 'changed twice: still what the dashboard itself said');
    // "Check again" clears the mark: the result is the dashboard's fresh one.
    await check(row.id);
    const fresh = byRow((await rowsNow(l.opts)).rows, 2);
    assert.deepEqual([fresh.last.staff, fresh.last.typeKey], [null, 'verified']);
    // Another row's check making a marked row a duplicate: the mark goes with the result (a changed result is kept).
    await right(row.id);
    plan.set(n(4).id, { alsoDuplicate: [row.id, three.id] });
    await check(n(4).id);
    plan.clear();
    const dup = byRow((await rowsNow(l.opts)).rows, 2);
    assert.deepEqual([dup.last.typeKey, dup.last.staff], ['duplicate', null]);
    assert.deepEqual([byRow((await rowsNow(l.opts)).rows, 3).last.typeKey, byRow((await rowsNow(l.opts)).rows, 3).last.staff.right], ['needAccess', false], 'the changed result is kept');
    // "Check every row again": a marked row is checked again like any other (its mark goes); a changed row keeps its result.
    plan.set(n(5).id, { typeKey: 'verified' });
    await check(n(5).id);
    plan.clear();
    await right(n(5).id);
    const again = await press({ again: true });
    assert.deepEqual([again.lines[0].event, ...counts(again.lines[0])], ['run-started', 5, 1, 4], 'only the changed row keeps its result');
    assert.deepEqual(rowEvents(again).map((x) => x.label), ['Row 1', 'Row 3', 'Row 4', 'Row 5']);
    const after = (await rowsNow(l.opts)).rows;
    assert.deepEqual([byRow(after, 5).last.staff, byRow(after, 3).last.staff.right, byRow(after, 3).last.typeKey], [null, false, 'needAccess']);
    // While the row is being checked, it cannot be marked.
    let open = () => {};
    release = new Promise((res) => (open = res));
    try {
      const checking = check(row.id);
      await until(async () => (await runningNow(l.opts))?.kind === 'check', 'the check is running');
      assert.equal((await right(row.id)).json.message, 'This row is being checked right now. Wait for it to finish, then mark its result.');
      open();
      await checking;
    } finally {
      open();
      release = null;
    }
  } finally {
    plan.clear();
    release = null;
    await l.close();
  }
});

test("Real mode: the file's email address column is found by its name and shown like any other column; each email then goes to that row's own address, asked for by mode; a row with no address, or with something that is not an address, is not sent and says why; without such a column Real is refused", async () => {
  const sent = [];
  const sender = { async send(email) { sent.push(email.to); return { ok: true, at: '2026-10-08T10:00:00.000Z' }; } };
  const l = await lab({ sender });
  const post = (path, body) => json('POST', path, body, l.opts);
  const check = (id) => call('POST', `/local/amazon/rows/${id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
  try {
    // A file like the newer ones, with an "Email ID" column: the second row's is not an address, the third row's is empty.
    const header = [...NEW_HEADER, 'Email ID'];
    const rows = NEW_ROWS.map((r, i) => [...r, i === 1 ? 'not an address' : i === 2 ? '' : `test.reviewer.${i + 1}@example.test`]);
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: NEW_FILE_NAME, data: await newLayoutBook({ header, rows }) }]) });
    const view = await rowsNow(l.opts);
    assert.deepEqual([view.sheet.mapping.email, view.emails.emailColumn, view.sheet.columns.find((c) => c.key === 'email')?.name], [9, true, 'Email ID'], 'found by its name');
    assert.equal(view.rows[0].values[9].text, 'test.reviewer.1@example.test', "kept with the file's other columns, to be shown");
    assert.ok(view.sheet.about.some((x) => /Only shown, not used for checking: Reviewer Name and Email ID\./.test(x)), view.sheet.about.join('\n'));
    const [one, two, three] = view.rows;
    for (const r of [one, two, three]) {
      plan.set(r.id, { typeKey: 'notDelivered', final: 'fail' });
      await check(r.id);
    }
    plan.clear();
    const preview = await post('/local/amazon/emails/preview', { rowIds: [one.id, two.id, three.id] });
    assert.equal(preview.json.emailColumn, true);
    assert.deepEqual(
      preview.json.emails.map((e) => [e.label, e.reviewer, e.orderId, e.address, e.addressOk, e.addressSays, e.to]),
      [
        ['Row 1', 'Test Reviewer One', newOrderId(1), 'test.reviewer.1@example.test', true, null, ''],
        ['Row 2', 'Test Reviewer Two', newOrderId(2), 'not an address', false, 'What the file has for this row is not an email address: "not an address".', ''],
        ['Row 3', 'Test Reviewer Three', newOrderId(3), '', false, 'There is no email address in the file for this row.', ''],
      ],
      "each row's own address, or why it cannot be emailed; to is the test address (none yet)",
    );
    const mine = preview.json.emails.map((e) => ({ rowId: e.rowId, key: e.key, subject: e.subject, message: e.message }));
    assert.equal((await post('/local/amazon/emails/send', { mode: 'nope', emails: mine })).json.message, 'Choose Test or Real.');
    // Real mode needs no test address; each email goes to its row's own address, and the rows without one say why.
    const real = await post('/local/amazon/emails/send', { mode: 'real', emails: mine });
    assert.equal(real.status, 200, real.text);
    assert.deepEqual(real.lines.map((x) => x.event), ['emails-started', 'email', 'email-sent', 'email-failed', 'email-failed', 'emails-done']);
    assert.deepEqual([real.lines[0].mode, real.lines[0].to, real.lines[1].to], ['real', null, 'test.reviewer.1@example.test']);
    assert.deepEqual(sent, ['test.reviewer.1@example.test'], "only to the user's own address");
    assert.deepEqual(real.lines.slice(3, 5).map((x) => [x.rowId, x.says]), [[two.id, 'What the file has for this row is not an email address: "not an address".'], [three.id, 'There is no email address in the file for this row.']]);
    assert.deepEqual([real.lines.at(-1).sent, real.lines.at(-1).maybe, real.lines.at(-1).failed, real.lines.at(-1).total], [1, 0, 2, 3]);
    const record = byRow((await rowsNow(l.opts)).rows, one.row).emails.at(-1);
    assert.deepEqual([record.mode, record.maybe, record.name], ['real', false, 'Not delivered']);
    const logText = readFileSync(join(l.dir, 'email-log.txt'), 'utf8');
    assert.ok(logText.includes("Sending 3 emails: each one to the user's own email address from the file."), logText);
    assert.ok(logText.includes('Row 2, Not delivered: not sent. What the file has for this row is not an email address.'), logText);
    assert.ok(logText.includes('Done: 1 sent, 0 maybe sent, 2 not sent, 0 not tried.'), logText);
    assert.doesNotMatch(logText, /@/, 'never an address');
    assert.ok(!logText.includes('not an address'), 'never what the file has in the cell');
    // Test mode still goes only to the test address.
    await post('/local/amazon/email-address', { email: 'test.person@example.test' });
    const testMode = await post('/local/amazon/emails/send', { mode: 'test', emails: mine });
    assert.deepEqual(sent.slice(1), ['test.person@example.test', 'test.person@example.test', 'test.person@example.test']);
    assert.equal(testMode.lines.at(-1).sent, 3);
    // A file with no email address column: Real is refused before anything is sent.
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({ replace: '1' }, [{ field: 'file', name: 'orders.xlsx', data: ORDERS }]) });
    assert.equal((await rowsNow(l.opts)).emails.emailColumn, false);
    assert.equal((await post('/local/amazon/emails/send', { mode: 'real', emails: mine })).json.message, 'This file has no email address column, so emails can only go to the test email address. Choose Test.');
    assert.equal(sent.length, 4, 'nothing more was sent');
  } finally {
    plan.clear();
    await l.close();
  }
});

test("Real mode: what the file has in a row's email address cell when it is not an address (a phone number, two addresses) is shown on the screen, but never kept in the email log nor written in the Terminal window", async () => {
  const sent = [];
  const terminal = [];
  const sender = { async send(email) { sent.push(email.to); return { ok: true, at: '2026-10-08T10:00:00.000Z' }; } };
  const l = await lab({ sender, log: (line) => terminal.push(String(line)) });
  const post = (path, body) => json('POST', path, body, l.opts);
  try {
    // Made-up cells: a phone number, and two addresses in one cell.
    const PHONE = '98765 43210';
    const TWO = 'made.up.first@example.test, made.up.second@example.test';
    const header = [...NEW_HEADER, 'Email ID'];
    const rows = NEW_ROWS.map((r, i) => [...r, i === 0 ? PHONE : i === 1 ? TWO : `test.reviewer.${i + 1}@example.test`]);
    await call('POST', '/local/amazon/sheet', { ...l.opts, ...multipart({}, [{ field: 'file', name: NEW_FILE_NAME, data: await newLayoutBook({ header, rows }) }]) });
    const [one, two] = (await rowsNow(l.opts)).rows;
    for (const r of [one, two]) {
      plan.set(r.id, { typeKey: 'notDelivered', final: 'fail' });
      await call('POST', `/local/amazon/rows/${r.id}/check`, { ...l.opts, body: '{}', type: 'application/json' });
    }
    plan.clear();
    const preview = await post('/local/amazon/emails/preview', { rowIds: [one.id, two.id] });
    const screen = [`What the file has for this row is not an email address: "${PHONE}".`, `What the file has for this row is not an email address: "${TWO}".`];
    assert.deepEqual(preview.json.emails.map((e) => e.addressSays), screen, 'the screen says what the cell has, so staff can put it right');
    const mine = preview.json.emails.map((e) => ({ rowId: e.rowId, key: e.key, subject: e.subject, message: e.message }));
    const real = await post('/local/amazon/emails/send', { mode: 'real', emails: mine });
    assert.equal(real.status, 200, real.text);
    assert.deepEqual(real.lines.filter((x) => x.event === 'email-failed').map((x) => x.says), screen);
    assert.deepEqual(sent, [], 'nothing was sent');
    // The log's lines are kept a moment after they are written in the Terminal window: wait for the last one.
    const logFile = join(l.dir, 'email-log.txt');
    await until(() => existsSync(logFile) && readFileSync(logFile, 'utf8').includes('Done: 0 sent'), 'every line kept in email-log.txt');
    const logText = readFileSync(logFile, 'utf8');
    assert.ok(logText.includes('Row 1, Not delivered: not sent. What the file has for this row is not an email address.'), logText);
    assert.ok(logText.includes('Row 2, Not delivered: not sent. What the file has for this row is not an email address.'), logText);
    assert.ok(terminal.some((t) => t.includes('Row 1, Not delivered: not sent.')), 'the Terminal window was given the same lines');
    for (const text of [logText, terminal.join('\n')]) {
      assert.doesNotMatch(text, /98765|43210/, 'never the phone number');
      assert.doesNotMatch(text, /made\.up|@/, 'never an address');
    }
  } finally {
    plan.clear();
    await l.close();
  }
});

test('every message and line the routes gave in these tests is plain: no cell name, column letter, code, long dash or double dash', () => {
  const texts = said.filter((t) => typeof t === 'string' && t);
  assert.ok(texts.length > 40, `${texts.length} messages looked at`);
  // Only the Campaigns box may say "ASIN number": the messages about the products staff type for a campaign.
  const campaignMessage = (t) => /^(Write at least one product|Line \d+ of the products)/.test(t);
  assert.deepEqual(texts.filter((t) => /ASIN/.test(t) && !campaignMessage(t)), [], 'nowhere else');
  assertPlain(assert, texts.map((t) => (campaignMessage(t) ? t.replace(/ASIN numbers?/g, 'product numbers') : t)), 'messages the routes gave');
});
