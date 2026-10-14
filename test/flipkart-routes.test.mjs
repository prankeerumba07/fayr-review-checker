// Flipkart's routes, over HTTP, through serve.mjs: every path under
// /local/flipkart/ goes to flipkart/routes.js (the status, ready: false, and
// the uploaded file's rows), with the page's session token and from this page
// only; every other /local/ path still goes to the Amazon routes. Uploading a
// file finds what its columns hold as on Amazon (or asks for them), and keeps
// it, its rows, the pictures in its cells and the columns chosen only in
// data/flipkart/; they show again after a restart. The top bar's Google login:
// the Amazon screen's own, handed over by serve.mjs, read as it is. A row's
// page and its check, "Start checking" for every row, and the line saying
// which campaign the rows use, with a pretend Google Drive behind that login. Temporary
// data folders and a Live Amazon Browser that is never used: nothing reaches
// Amazon, Flipkart, Google or any other website.
// Run: node test/flipkart-routes.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import net from 'node:net';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { createHandler, createSessions, bearerOf } from '../serve.mjs';
import { createFlipkartRoutes, sheetView } from '../flipkart/routes.js';
import { STEP_NAMES } from '../flipkart/check.js';
import { orderIdsIn, datesIn, amountsIn } from '../flipkart/screen-text.js';
import { parseDelivery } from '../flipkart/delivery-read.js';
import { parseReviewShot } from '../flipkart/review-read.js';
import { DEFAULT_MARKS } from '../flipkart/settings.js';
import { tinyPng } from './fixtures/flipkart/zip-tools.mjs';
import { MAX_SHEET_BYTES, createFlipkartStore, putCampaign } from '../flipkart/store.js';
import { TYPE_WORDS } from '../flipkart/final.js';
import { ONLY_FLIPKART_NAMES } from '../flipkart/browser.js';
import { isFlipkartSite, pageForPid } from '../flipkart/links.js';
import { createStore } from '../amazon/store.js';
import { createAmazonRoutes } from '../amazon/routes.js';
import { FILE, HEADER, orderId, orderShot, deliveryShot, reviewLink, reviewShot, person } from './fixtures/flipkart/make-flipkart.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = readFileSync(FILE);
const TOO_BIG = 'The file is larger than 50 megabytes, so save a smaller copy (only the Flipkart tab, for example), then upload that.';
/** Every Type, as the screen is given them with the rows, for the Type filter and "Change the result": the Amazon screen's own, in its order. */
const TYPES = Object.entries(TYPE_WORDS).map(([key, word]) => ({ key, word }));
/** The made-up picture the pretend Google Drive gives. */
const SHOT_PNG = tinyPng([166, 58, 43]);

const temps = [];
after(() => Promise.all(temps.map((d) => rm(d, { recursive: true, force: true }))));
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'arc-flipkart-'));
  temps.push(d);
  return d;
};

const dataDir = tempDir();
const store = createStore(dataDir);
await store.init();

const sessions = createSessions();
const auth = (req) => sessions.verify(bearerOf(req));
// Every path each set of routes is handed.
const handed = { amazon: [], flipkart: [] };
const watch = (name, routes) => (req, res, url) => (handed[name].push(url.pathname), routes(req, res, url));
const amazonRoutes = createAmazonRoutes({ store, live: { isOpen: () => false }, images: {}, auth });

async function serve(opts) {
  const server = createServer(createHandler({ root: ROOT, sessions, ...opts }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  after(() => {
    server.closeAllConnections();
    server.close();
  });
  return server.address().port;
}
const port = await serve({ local: watch('amazon', amazonRoutes), flipkart: watch('flipkart', createFlipkartRoutes({ dataDir, auth })) });
const TOKEN = sessions.get().token;

function call(method, path, { token = TOKEN, site = 'same-origin', at = port, body = null, type = null } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: 'localhost:8093' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (site) headers['Sec-Fetch-Site'] = site;
    if (type) headers['Content-Type'] = type;
    if (body) headers['Content-Length'] = body.length;
    const req = request({ host: '127.0.0.1', port: at, path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json, data: Buffer.concat(chunks) });
      });
    });
    req.on('error', reject);
    req.end(body ?? undefined);
  });
}

/** A multipart form, as the page sends it: the file, and any other fields (the tab chosen, the columns chosen). */
function form(file, fields = {}) {
  const boundary = 'flipkart-test-form-boundary';
  const parts = Object.entries(fields).map(([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (file) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), file.data, Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${boundary}` };
}

/** A Flipkart dashboard of its own: a fresh data folder and a server. */
async function fresh(dir = tempDir()) {
  return { dir, at: await serve({ flipkart: createFlipkartRoutes({ dataDir: dir, auth }) }) };
}

const upload = (at, name, data, fields) => call('POST', '/local/flipkart/sheet', { at, ...form({ name, data }, fields) });

/** Every file in a folder and the folders under it, by its path inside the folder. */
function filesIn(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

async function workbook(tabs) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(tabs)) {
    const ws = wb.addWorksheet(name);
    for (const r of rows) ws.addRow(r);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('/local/flipkart/status answers ready: false, only with the session token and only to this page', async () => {
  const ok = await call('GET', '/local/flipkart/status');
  assert.equal(ok.status, 200);
  assert.match(ok.headers['content-type'], /^application\/json/);
  assert.deepEqual(ok.json, { ready: false });
  assert.equal(ok.headers['access-control-allow-origin'], undefined, 'no CORS header');
  const head = await call('HEAD', '/local/flipkart/status');
  assert.deepEqual([head.status, head.text], [200, '']);
  assert.equal((await call('GET', '/local/flipkart/status', { token: null })).status, 401, 'no token');
  assert.equal((await call('GET', '/local/flipkart/status', { token: 'not.a.token' })).status, 401, 'a wrong token');
  assert.equal((await call('GET', '/local/flipkart/status', { site: 'cross-site' })).status, 403, 'another website');
  const post = await call('POST', '/local/flipkart/status');
  assert.deepEqual([post.status, post.headers.allow], [405, 'GET, HEAD']);
  assert.deepEqual([(await call('GET', '/local/flipkart/rows')).status, (await call('POST', '/local/flipkart/check')).status], [404, 404], 'nothing else yet');
});

test('the file routes have the same safety: the session token, this page only, and only GET, HEAD and POST', async () => {
  for (const [method, opts] of [['GET', {}], ['POST', form({ name: 'flipkart-orders.xlsx', data: FIXTURE })]]) {
    assert.equal((await call(method, '/local/flipkart/sheet', { ...opts, token: null })).status, 401, `${method} with no token`);
    assert.equal((await call(method, '/local/flipkart/sheet', { ...opts, token: 'not.a.token' })).status, 401, `${method} with a wrong token`);
    assert.equal((await call(method, '/local/flipkart/sheet', { ...opts, site: 'cross-site' })).status, 403, `${method} from another website`);
  }
  const put = await call('PUT', '/local/flipkart/sheet');
  assert.deepEqual([put.status, put.headers.allow], [405, 'GET, HEAD, POST']);
  assert.deepEqual((await call('GET', '/local/flipkart/sheet')).json, { sheet: null, rows: [], types: TYPES }, 'nothing was kept by any of these');
  assert.deepEqual(readdirSync(dataDir).includes('flipkart'), false, 'not even the folder');
});

test('every other /local/ path still goes to the Amazon routes, and no /local/flipkart/ path ever does', async () => {
  handed.amazon.length = 0;
  handed.flipkart.length = 0;
  const campaigns = await call('GET', '/local/amazon/campaigns');
  assert.deepEqual([campaigns.status, campaigns.json], [200, { campaigns: [] }], "the Amazon routes' own answer");
  const refused = await call('GET', '/local/amazon/campaigns', { token: null });
  assert.deepEqual([refused.status, refused.json?.message], [401, 'The session is not valid. Reload the page.']);
  assert.deepEqual([(await call('GET', '/local/amazon/no-such-page')).json, (await call('GET', '/local/flipkart')).text], [{ statusCode: 404, message: 'Not found.' }, 'Not found.']);
  assert.deepEqual(handed.amazon, ['/local/amazon/campaigns', '/local/amazon/campaigns', '/local/amazon/no-such-page', '/local/flipkart'], '"/local/flipkart" without the last slash is not under /local/flipkart/');
  assert.deepEqual(handed.flipkart, []);
  await call('GET', '/local/flipkart/status');
  await call('GET', '/local/flipkart/sheet');
  await call('POST', '/local/flipkart/check');
  assert.deepEqual(handed.flipkart, ['/local/flipkart/status', '/local/flipkart/sheet', '/local/flipkart/check']);
  assert.equal(handed.amazon.length, 4, 'the Amazon routes are handed none of them');
});

test("without Flipkart's routes, /local/flipkart/ paths are not found and the Amazon routes still answer", async () => {
  const at = await serve({ local: amazonRoutes });
  assert.deepEqual([(await call('GET', '/local/flipkart/status', { at })).status, (await call('GET', '/local/amazon/campaigns', { at })).status], [404, 200]);
});

test("npm start plugs Flipkart's routes in beside the Amazon routes, with the same session token, the same data folder and the Amazon screen's Google login: its state and the Live Amazon Browser's own download", () => {
  const src = readFileSync(join(ROOT, 'serve.mjs'), 'utf8');
  assert.match(src, /const \{ createFlipkartRoutes \} = await import\('\.\/flipkart\/routes\.js'\);/);
  assert.match(src, /const local = createAmazonRoutes\(\{[^\n]*auth: \(req\) => sessions\.verify\(bearerOf\(req\)\) \}\);/);
  assert.match(src, /const amazonGoogle = \{ view: \(\) => google\.view\(\), busy: \(\) => google\.busy, amazonLogin: \(\) => \(\{ state: login\.view\(\)\.state, busy: login\.busy \}\), loggedOut: \(\) => google\.loggedOut\(\), begin: \(\) => live\.begin\(\), fetch: \(url, init\) => live\.fetch\(url, init\) \};/);
  assert.match(src, /const flipkart = createFlipkartRoutes\(\{ dataDir, log, google: amazonGoogle, auth: \(req\) => sessions\.verify\(bearerOf\(req\)\) \}\);/);
  assert.match(src, /createServer\(createHandler\(\{ sessions, local, flipkart \}\)\)/);
});

test('uploading the made-up file finds what each column holds and keeps the file, its rows, the pictures in its cells and the columns used only in data/flipkart/, for this user only; they show again after a restart', async () => {
  const { dir, at } = await fresh();
  const up = await upload(at, 'flipkart-orders.xlsx', FIXTURE);
  assert.equal(up.status, 200, up.text);
  const { made, tab, unplaced, sheet, rows } = up.json;
  assert.deepEqual([made, tab, unplaced], [5, 'Flipkart', []]);
  assert.deepEqual([sheet.fileName, sheet.kind, sheet.tab, sheet.rowCount, typeof sheet.uploadedAt], ['flipkart-orders.xlsx', 'xlsx', 'Flipkart', 5, 'string']);
  assert.deepEqual(sheet.headers.map((h) => h.text), HEADER);
  assert.deepEqual(sheet.mapping, { orderId: 1, orderDate: 2, product: 3, amount: 4, reviewer: 5, orderShot: 6, deliveryShot: 7, reviewLink: 8, email: 9, reviewShot: 10, status: null, type: null, note: null });
  // The table's columns, as on Amazon: every column of the file with its letter, then Status, Type and Note after the last one.
  assert.deepEqual(sheet.columns.map((c) => `${c.letter} ${c.name} ${c.key}`), ['A Order ID orderId', 'B Order Date orderDate', 'C Product product', 'D Amount amount', 'E Reviewer Name reviewer', 'F Order Screenshot orderShot', 'G Delivery Screenshot deliveryShot', 'H Review Link reviewLink', 'I Email ID email', 'J Review Screenshot reviewShot', 'K Status status', 'L Type type', 'M Note note']);
  assert.deepEqual(sheet.about, [
    'Used for checking: Order ID, Order Date, Product, Amount, Order Screenshot, Delivery Screenshot, Review Link and Review Screenshot.',
    'Only shown, not used for checking: Reviewer Name and Email ID.',
    'It has no Status, Type or Note column, so the checked Excel file adds them after the last column.',
    "No campaign was found for these rows: no campaign's brand is in their product names, the file's name or the tab's name, so each product is compared with its name in the file.",
  ]);
  assert.deepEqual(rows.map((r) => [r.n, r.label, r.orderId, r.orderDate, r.amount, r.product]), [
    [1, 'Row 1', orderId(2), '20-07-2026', '₹349', 'Test Brand Steel Bottle'],
    [2, 'Row 2', orderId(3), '21-07-2026', '₹499', 'Test Brand Lunch Box'],
    [3, 'Row 3', orderId(4), '22-07-2026', '₹349.50', 'Test Brand Steel Bottle'],
    [4, 'Row 4', orderId(6), '23-07-2026', '₹499', 'Test Brand Lunch Box'],
    [5, 'Row 5', '', '', '', ''],
  ], 'numbered from 1');
  assert.deepEqual(rows[0].shots.order, { text: 'Screenshot', link: orderShot(2), links: [orderShot(2)], labels: [{ link: orderShot(2), label: 'Google Drive' }], words: 'Screenshot', mismatch: null, how: null, pictures: [] });
  assert.deepEqual([rows[0].shots.delivery.labels, rows[0].shots.review.labels], [[{ link: deliveryShot(2), label: 'Google Drive' }], [{ link: reviewLink(2), label: "Flipkart product's reviews" }]]);
  assert.deepEqual(rows[0].values, { 5: { text: person(2), labels: [] }, 9: { text: 'test.person2@example.test', labels: [] } });
  assert.deepEqual([rows[1].shots.order.how, rows[1].shots.delivery.how, rows[1].shots.reviewShot.how, rows[4].shots.order.how], ['cell', 'floating', 'cell', 'floating']);
  assert.deepEqual([rows[3].shots.review.links, rows[3].shots.reviewShot.labels], [[], [{ link: reviewShot(6), label: 'Google Drive' }]], 'a review screenshot and no review link');
  assert.ok(rows.every((r) => /^r[0-9a-f]{12}$/.test(r.id) && r.prev === null));
  assert.doesNotMatch(JSON.stringify(up.json), /"data"|sha256|\.png/, 'no picture, and no picture file, goes to the screen');
  // Kept: the file, its rows, its four pictures and the columns used, and nothing anywhere else in the data folder.
  const files = filesIn(dir);
  assert.deepEqual(files.filter((p) => !p.startsWith('flipkart/pictures/')), ['flipkart/rows.json', 'flipkart/settings.json', 'flipkart/upload.xlsx']);
  const kept = JSON.parse(readFileSync(join(dir, 'flipkart', 'rows.json'), 'utf8')).rows;
  const pictures = kept.flatMap((r) => ['order', 'delivery', 'review', 'reviewShot'].flatMap((w) => r.pictures[w].map((p) => `flipkart/pictures/${p.file}`)));
  assert.equal(pictures.length, 4);
  assert.deepEqual(files.filter((p) => p.startsWith('flipkart/pictures/')), [...pictures].sort());
  assert.deepEqual(pictures.map((p) => p.replace(/^flipkart\/pictures\/r[0-9a-f]{12}-/, '')), ['order-0.png', 'delivery-0.png', 'reviewShot-0.png', 'order-0.png']);
  assert.ok(readFileSync(join(dir, pictures[0])).subarray(1, 4).equals(Buffer.from('PNG')), 'a picture as it is in the file');
  assert.ok(readFileSync(join(dir, 'flipkart', 'upload.xlsx')).equals(FIXTURE), 'the file as it was uploaded');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'flipkart', 'settings.json'), 'utf8')), { columnChoice: Object.fromEntries(Object.entries(sheet.mapping).filter(([, col]) => col).map(([k, col]) => [k, HEADER[col - 1]])) }, 'the columns used, by their names, for the next file');
  for (const d of ['flipkart', 'flipkart/pictures']) assert.equal(statSync(join(dir, d)).mode & 0o777, 0o700, d);
  for (const p of files) assert.equal(statSync(join(dir, p)).mode & 0o777, 0o600, p);
  // The dashboard started again, on the same data folder: the same rows, with nothing uploaded again.
  const again = await fresh(dir);
  const reloaded = await call('GET', '/local/flipkart/sheet', { at: again.at });
  assert.equal(reloaded.status, 200);
  assert.deepEqual(reloaded.json, { sheet, rows, types: TYPES });
  // Another file: its rows replace these, and these rows' pictures go.
  const csv = await upload(at, 'flipkart orders.csv', Buffer.from(`Order ID,Review Screenshot\n${orderId(7)},${reviewShot(7)}\n`));
  assert.equal(csv.status, 200, csv.text);
  assert.deepEqual(filesIn(dir), ['flipkart/rows.json', 'flipkart/settings.json', 'flipkart/upload.csv']);
});

test('a needed column that cannot be found: the columns are asked for and nothing changes; the file sent again with the columns chosen is kept, and those columns are found by themselves next time', async () => {
  const { dir, at } = await fresh();
  const odd = await workbook({ Flipkart: [['Ref', 'Evidence', 'Buyer'], [orderId(2), reviewShot(2), person(2)], [orderId(3), reviewShot(3), person(3)], [orderId(5), reviewShot(5), person(5)]] });
  const asked = await upload(at, 'odd names.xlsx', odd);
  assert.equal(asked.status, 200, asked.text);
  assert.deepEqual(asked.json, {
    columns: {
      says: 'No column of this file could be found for the review link or the review screenshot, so choose one of them below (every other column can be left as "Not in this file").',
      kind: 'xlsx',
      tab: 'Flipkart',
      headers: [{ col: 1, text: 'Ref' }, { col: 2, text: 'Evidence' }, { col: 3, text: 'Buyer' }],
      lastCol: 3,
      mapping: { orderId: 1, orderDate: null, amount: null, product: null, orderShot: null, deliveryShot: null, reviewShot: null, reviewLink: null, reviewer: 3, email: null, status: null, type: null, note: null },
      fields: asked.json.columns.fields,
    },
  }, 'the order ID was found by its cells (Flipkart order IDs), the reviewer by the name "Buyer"');
  assert.deepEqual(asked.json.columns.fields.map((f) => [f.key, f.label, f.required, Boolean(f.review)]).slice(0, 8), [
    ['orderId', 'Order ID', true, false],
    ['orderDate', 'Order date', false, false],
    ['amount', 'Amount', false, false],
    ['product', 'Product ordered', false, false],
    ['orderShot', 'Purchase screenshot', false, false],
    ['deliveryShot', 'Delivery screenshot', false, false],
    ['reviewShot', 'Review screenshot', false, true],
    ['reviewLink', 'Review link', false, true],
  ]);
  assert.deepEqual(filesIn(dir), [], 'nothing kept yet');
  const wrong = await upload(at, 'odd names.xlsx', odd, { mapping: JSON.stringify({ orderId: 1, reviewShot: 1 }) });
  assert.deepEqual([wrong.status, wrong.json.message, wrong.json.problems], [400, 'One column cannot hold two things: Order ID and Review screenshot.', ['One column cannot hold two things: Order ID and Review screenshot.']]);
  const broken = await upload(at, 'odd names.xlsx', odd, { mapping: 'not json' });
  assert.deepEqual([broken.status, broken.json.message], [400, 'The chosen columns could not be read.']);
  assert.deepEqual(filesIn(dir), [], 'still nothing kept');
  const chosen = await upload(at, 'odd names.xlsx', odd, { mapping: JSON.stringify({ orderId: 1, reviewShot: 2, reviewer: 3 }) });
  assert.equal(chosen.status, 200, chosen.text);
  assert.deepEqual([chosen.json.made, chosen.json.rows.map((r) => r.orderId), chosen.json.rows[0].shots.reviewShot.labels[0].label], [3, [orderId(2), orderId(3), orderId(5)], 'Google Drive']);
  assert.deepEqual(chosen.json.sheet.about, [
    'Used for checking: Ref and Evidence.',
    'Only shown, not used for checking: Buyer.',
    'This file has no order date, so order dates are not compared.',
    'This file has no amount, so amounts are not compared.',
    'This file has no product name, so products are not compared.',
    'This file has no purchase screenshot, so every row needs a staff member to check the purchase.',
    'This file has no delivery screenshot, so every row needs a staff member to check the delivery.',
    'This file has no review link, so each review is read from its review screenshot.',
    'It has no Status, Type or Note column, so the checked Excel file adds them after the last column.',
    "No campaign was found for these rows: no campaign's brand is in their product names, the file's name or the tab's name, so each product is compared with its name in the file.",
  ]);
  // The next file with the same column names: found by themselves, from the choice remembered in Flipkart's own settings.
  const next = await upload(at, 'odd names again.xlsx', await workbook({ Flipkart: [['REF', 'evidence', 'Buyer'], [orderId(4), reviewShot(4), person(4)]] }));
  assert.equal(next.status, 200, next.text);
  assert.deepEqual([next.json.sheet.mapping.orderId, next.json.sheet.mapping.reviewShot, next.json.sheet.mapping.reviewer], [1, 2, 3]);
  assert.deepEqual(filesIn(dir), ['flipkart/rows.json', 'flipkart/settings.json', 'flipkart/upload.xlsx'], "never Amazon's settings");
});

test('a file kept before its columns were found shows no rows, and the screen is told to upload it again', async () => {
  const { dir, at } = await fresh();
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(join(dir, 'flipkart'), { recursive: true });
  // rows.json as it was kept before 12-10-2026: the cells of each row, and no columns found.
  writeFileSync(join(dir, 'flipkart', 'rows.json'), JSON.stringify({ sheet: { fileName: 'old.xlsx', kind: 'xlsx', tab: 'Flipkart', headerRow: 1, file: 'upload.xlsx', uploadedAt: '2026-10-09T12:00:00.000Z' }, headers: [{ col: 1, text: 'Order ID' }], rows: [{ row: 2, cells: { 1: { text: orderId(2), behind: '' } } }] }));
  const old = await call('GET', '/local/flipkart/sheet', { at });
  assert.deepEqual([old.status, old.json], [200, { sheet: null, rows: [], types: TYPES, uploadAgain: true }]);
  assert.equal((await upload(at, 'flipkart-orders.xlsx', FIXTURE)).status, 200);
  assert.equal((await call('GET', '/local/flipkart/sheet', { at })).json.rows.length, 5, 'uploaded again: its rows show');
});

test('several tabs and none named "Flipkart": the tabs are named and nothing is kept; the chosen tab is read and kept', async () => {
  const { dir, at } = await fresh();
  const head = ['Order ID', 'Product', 'Review Screenshot'];
  const several = await workbook({ Orders: [head, [orderId(2), 'Test Bottle', reviewShot(2)]], Returns: [head, [orderId(3), 'Test Lid', reviewShot(3)], [orderId(4), 'Test Jar', reviewShot(4)]] });
  const asked = await upload(at, 'two tabs.xlsx', several);
  assert.deepEqual([asked.status, asked.json], [200, { chooseTab: { tabs: ['Orders', 'Returns'], says: 'This file has no tab named "Flipkart", and it has 2 tabs: "Orders" and "Returns". Choose the tab with the orders.' } }]);
  assert.deepEqual(filesIn(dir), [], 'nothing kept yet');
  const chosen = await upload(at, 'two tabs.xlsx', several, { tab: 'Returns' });
  assert.equal(chosen.status, 200, chosen.text);
  assert.deepEqual([chosen.json.sheet.tab, chosen.json.sheet.rowCount, chosen.json.rows.map((r) => r.orderId)], ['Returns', 2, [orderId(3), orderId(4)]]);
  const wrong = await upload(at, 'two tabs.xlsx', several, { tab: 'Nope' });
  assert.deepEqual([wrong.status, wrong.json.message], [400, 'This file has no tab named "Nope". Its tabs are "Orders" and "Returns".']);
  assert.equal((await call('GET', '/local/flipkart/sheet', { at })).json.sheet.tab, 'Returns', 'the rows kept before stay');
});

test('a CSV file is kept in place of the Excel file, with no tab', async () => {
  const { dir, at } = await fresh();
  assert.equal((await upload(at, 'flipkart-orders.xlsx', FIXTURE)).status, 200);
  const csv = await upload(at, 'flipkart orders.csv', Buffer.from(`Order ID,Reviewer Name,Review Link\n${orderId(2)},${person(2)},${reviewLink(2)}\n`));
  assert.equal(csv.status, 200, csv.text);
  assert.deepEqual([csv.json.sheet.fileName, csv.json.sheet.kind, csv.json.sheet.tab, csv.json.sheet.rowCount], ['flipkart orders.csv', 'csv', null, 1]);
  assert.deepEqual(filesIn(dir), ['flipkart/rows.json', 'flipkart/settings.json', 'flipkart/upload.csv'], 'the Excel file before and its pictures are gone');
});

test('a file that is too big is refused in plain words, and the rows kept before stay', async () => {
  const { at } = await fresh();
  assert.equal((await upload(at, 'flipkart-orders.xlsx', FIXTURE)).status, 200);
  const before = await call('GET', '/local/flipkart/sheet', { at });
  const justOver = await upload(at, 'big.csv', Buffer.alloc(MAX_SHEET_BYTES + 1, 0x61));
  assert.deepEqual([justOver.status, justOver.json?.message], [413, TOO_BIG]);
  const farOver = await upload(at, 'bigger.csv', Buffer.alloc(MAX_SHEET_BYTES + 512 * 1024, 0x61));
  assert.deepEqual([farOver.status, farOver.json?.message], [413, TOO_BIG], 'more than the form may hold: refused while it is still being sent');
  assert.deepEqual((await call('GET', '/local/flipkart/sheet', { at })).json, before.json);
});

test('an empty file, a file that is not .xlsx or .csv, no file, and a request that is not a form are refused in plain words, and nothing is kept', async () => {
  const { dir, at } = await fresh();
  const empty = await upload(at, 'flipkart.xlsx', Buffer.alloc(0));
  assert.deepEqual([empty.status, empty.json.message], [400, 'The file is empty.']);
  const blank = await upload(at, 'flipkart.csv', Buffer.from('\n\n'));
  assert.deepEqual([blank.status, blank.json.message], [400, 'The file is empty: no row has at least two filled cells to use as column names.']);
  const pdf = await upload(at, 'flipkart.pdf', FIXTURE);
  assert.deepEqual([pdf.status, pdf.json.message], [400, 'This file is not an Excel file (.xlsx) or a CSV file (.csv), so save the Flipkart orders as one of those, then upload that.']);
  const none = await call('POST', '/local/flipkart/sheet', { at, ...form(null, { tab: 'Flipkart' }) });
  assert.deepEqual([none.status, none.json.message], [400, 'Choose the Flipkart file first.']);
  const json = await call('POST', '/local/flipkart/sheet', { at, body: Buffer.from('{}'), type: 'application/json' });
  assert.deepEqual([json.status, json.json.message], [415, 'The form could not be read. Reload the page, then try again.']);
  assert.deepEqual(filesIn(dir), []);
});

test('nothing is downloaded and no link is opened: the file is read and shown on this computer only', async () => {
  const { at } = await fresh();
  // Every connection this test opens to anywhere but this computer, and every fetch, while a file with links and pictures is uploaded and shown.
  const outside = [];
  const fetched = [];
  let watched = 0;
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    watched++;
    const o = Array.isArray(args[0]) ? args[0][0] : args[0] !== null && typeof args[0] === 'object' ? args[0] : { port: args[0], host: typeof args[1] === 'string' ? args[1] : undefined };
    if (!o?.path && !['127.0.0.1', '::1', 'localhost', undefined].includes(o?.host)) outside.push(`${o.host}:${o.port}`);
    return connect.apply(this, args);
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    throw new Error('Nothing may be fetched here.');
  };
  try {
    const up = await upload(at, 'flipkart-orders.xlsx', FIXTURE);
    assert.equal(up.status, 200, up.text);
    assert.ok(JSON.stringify(up.json).includes(orderShot(2)), 'the links are kept as they are, to be shown');
    assert.equal((await call('GET', '/local/flipkart/sheet', { at })).status, 200);
  } finally {
    net.Socket.prototype.connect = connect;
    globalThis.fetch = realFetch;
  }
  assert.ok(watched >= 1, "the watch saw this test's own connection to this computer");
  assert.deepEqual(outside, [], 'no connection to any website');
  assert.deepEqual(fetched, [], 'nothing fetched');
  // And no Flipkart file has a way to reach a website or start a program, but these, each for its own reason:
  // the Live Flipkart Browser (browser.js), which reads campaigns' products, uses the browser tool; the
  // downloads (pictures.js) use https, through the fetch they are given; getting a row's screenshots
  // (screenshots.js) passes on the Live Amazon Browser's own download, handed over by serve.mjs; making a
  // PDF into a picture (picture-fix.js) uses the Mac's own tools; and reading a picture's words (ocr.js) uses
  // Tesseract and the Mac's own picture tool, on this computer. Every other file has none.
  const TOOLS = {
    'browser.js': ["import { chromium } from 'playwright-core';"],
    'pictures.js': ["from 'node:https'", "from 'node:net'", 'fetch('],
    'screenshots.js': ['fetch('],
    'picture-fix.js': ["from 'node:child_process'"],
    'ocr.js': ["from 'node:child_process'"],
  };
  for (const f of readdirSync(join(ROOT, 'flipkart'))) {
    let src = readFileSync(join(ROOT, 'flipkart', f), 'utf8');
    for (const tool of TOOLS[f] ?? []) {
      assert.ok(src.includes(tool), `${f} uses ${tool}`);
      src = src.split(tool).join('');
    }
    assert.doesNotMatch(src, /from 'node:(?:https?|http2|net|tls|dgram|child_process)'|playwright|\bfetch\(|XMLHttpRequest|WebSocket|request\.fetch/, f);
  }
  // Google never opens in the Live Flipkart Browser: no Google address can even be found by name there.
  assert.doesNotMatch(ONLY_FLIPKART_NAMES, /google/i);
  assert.deepEqual([isFlipkartSite('https://accounts.google.com/'), isFlipkartSite('https://drive.google.com/')], [false, false]);
});

/** A stand-in for the Amazon screen's Google login, as serve.mjs hands it over: its state, and whatever else of it is used. */
function pretendAmazonGoogle(state) {
  const g = {
    now: state,
    used: [],
    view: () => ({ ...g.now }),
    busy: () => false,
    amazonLogin: () => ({ state: 'in', busy: false }),
    loggedOut: () => g.used.push('loggedOut'),
    begin: async () => g.used.push('begin'),
    fetch: async () => (g.used.push('fetch'), new Response('')),
  };
  return g;
}

test("the top bar's Google login is the Amazon screen's own, read as it is, so both screens always show the same login; Flipkart has no Google buttons of its own (they are the Amazon screen's routes), and nothing of that login, its window or data/flipkart/ is changed", async () => {
  const dir = tempDir();
  const google = pretendAmazonGoogle({ state: 'out', name: null, says: null, chrome: false });
  const routes = createFlipkartRoutes({ dataDir: dir, auth, google });
  const at = await serve({ flipkart: routes });
  const account = async () => (await call('GET', '/local/flipkart/account', { at })).json;
  assert.deepEqual(await account(), { google: { state: 'out', name: null, says: null, chrome: false } });
  // A login made on either screen: the Flipkart top bar says so the next time it asks.
  google.now = { state: 'in', name: 'Test Person', says: null, chrome: false };
  assert.deepEqual(await account(), { google: { state: 'in', name: 'Test Person', says: null, chrome: false } });
  google.now = { state: 'waiting', name: null, says: null, chrome: true };
  assert.deepEqual((await account()).google, { state: 'waiting', name: null, says: null, chrome: true });
  assert.equal((await call('GET', '/local/flipkart/account', { at, token: null })).status, 401, 'no token');
  assert.equal((await call('GET', '/local/flipkart/account', { at, site: 'cross-site' })).status, 403, 'another website');
  const post = await call('POST', '/local/flipkart/account', { at });
  assert.deepEqual([post.status, post.headers.allow], [405, 'GET, HEAD']);
  // The buttons are the Amazon screen's own routes: Flipkart has none.
  for (const button of ['log-in', 'check-login', 'log-in-in-chrome', 'logged-in']) {
    assert.equal((await call('POST', `/local/flipkart/google/${button}`, { at, body: Buffer.from('{}'), type: 'application/json' })).status, 404, button);
  }
  await routes.close();
  assert.deepEqual(google.used, [], 'the top bar only reads the login: no window opened, nothing downloaded, nothing changed');
  assert.deepEqual(filesIn(dir), [], 'nothing kept for it in data/flipkart/: no Google login, profile or log of its own');
  // With none handed over, there is no state to show, so the top bar says it is checking.
  const bare = await serve({ flipkart: createFlipkartRoutes({ dataDir: tempDir(), auth }) });
  assert.deepEqual((await call('GET', '/local/flipkart/account', { at: bare })).json, { google: null });
});

/** The Amazon screen's Google login with a pretend Google Drive behind its download: each file answers by its id with a made-up picture, and one is refused (no access). hold: a download waits for it. */
function driveLogin(state = 'in') {
  const g = {
    state,
    fetched: [],
    hold: null,
    view: () => ({ state: g.state, name: g.state === 'in' ? 'Test Person' : null, says: null, chrome: false }),
    busy: () => false,
    amazonLogin: () => ({ state: 'in', busy: false }),
    loggedOut: () => {},
    begin: async () => {},
    async fetch(url) {
      const id = new URL(url).searchParams.get('id');
      g.fetched.push(id);
      if (g.hold) await g.hold;
      return /^1TestFlipkart/.test(id ?? '') && !/Delivery02/.test(id) ? new Response(SHOT_PNG, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }) : new Response('no', { status: 403 });
    },
  };
  return g;
}

/** A purchase screenshot as the reader gives it (shot-read.js), made from made-up lines with the real rules. */
const reading = (texts) => ({ ok: true, problem: null, confidence: 90, wordCount: 30, hindi: true, lines: texts.map((text) => ({ text })), texts, text: texts.join('\n'), orderIds: orderIdsIn(texts), dates: datesIn(texts), amounts: amountsIn(texts) });
/** A pretend reader in place of Tesseract: each row's purchase screenshot says that row's own order ID, order date, product and amount (the made-up file's), and its delivery screenshot that row's order ID and product and Delivered, found by the picture's file name; read and readDelivery: the rows whose pictures were read. */
function pretendReader() {
  const said = {};
  const saidDelivery = {};
  const read = [];
  const readDelivery = [];
  const saidReview = {};
  const readReview = [];
  return {
    read,
    readDelivery,
    readReview,
    set(rows) {
      for (const r of rows) said[r.id] = reading([`Order #${r.orderId}`, r.product, `Order placed on ${r.orderDate}`, `Total amount ${r.amount}`]);
      for (const r of rows) saidDelivery[r.id] = { ...reading([`Order #${r.orderId}`, r.product, 'Delivered, Thu 23rd Jul']), ...parseDelivery([`Order #${r.orderId}`, r.product, 'Delivered, Thu 23rd Jul']) };
      // Its review screenshot: a made-up reviewer's review of that row's product, on Flipkart's website.
      for (const r of rows) {
        const lines = [r.product, '| 5* Wonderful', 'Good product, works well.', 'Test Reviewer @ Certified Buyer 12 Sep, 2026'];
        saidReview[r.id] = { ...reading(lines), ...parseReviewShot(lines) };
      }
    },
    async order(files) {
      const id = basename(files[0] ?? '').slice(0, 13);
      read.push(id);
      return said[id] ?? reading([]);
    },
    async delivery(files) {
      const id = basename(files[0] ?? '').slice(0, 13);
      readDelivery.push(id);
      return saidDelivery[id] ?? { ...reading([]), ...parseDelivery([]) };
    },
    async review(files) {
      const id = basename(files[0] ?? '').slice(0, 13);
      readReview.push(id);
      return saidReview[id] ?? { ...reading([]), ...parseReviewShot([]) };
    },
  };
}
const ALL_SAME = 'Order ID: the same. Order date: the same. Amount: the same. Product: the same.';
/** Step 7 for a row that uses no live campaign: Flipkart is not opened. */
const NO_CAMPAIGN = "The row uses no live campaign with a product read from Flipkart, so there is no product's page to find the review on.";

test("Check over HTTP, as on Amazon: the steps streamed as they run; the screenshots downloaded through the Amazon screen's Google login (a pretend Google Drive) and kept only in data/flipkart/; one that cannot be had says why in the Amazon words; the purchase screenshot read and compared with the sheet, with Flipkart's own passing marks; the row's Status, Type and Note kept with it, on its page and in the table, after a reload too; no Google login pauses first; one check at a time", async () => {
  const dir = tempDir();
  const google = driveLogin();
  const reader = pretendReader();
  const routes = createFlipkartRoutes({ dataDir: dir, auth, google, shotOptions: { gapMs: 0 }, readers: reader });
  const at = await serve({ flipkart: routes });
  assert.equal((await upload(at, 'flipkart-orders.xlsx', FIXTURE)).status, 200);
  const rows = (await call('GET', '/local/flipkart/sheet', { at })).json.rows;
  const [one, two, three] = rows;
  reader.set(rows);
  const before = await call('GET', `/local/flipkart/rows/${one.id}`, { at });
  assert.deepEqual([before.status, before.json.result, before.json.row.label, before.json.row.shots.order.pictures], [200, null, 'Row 1', []], 'not checked yet');
  const check = (row, opts = {}) => call('POST', `/local/flipkart/rows/${row.id}/check`, { at, body: Buffer.from('{}'), type: 'application/json', ...opts });
  const lines = (res) => res.text.trim().split('\n').map((l) => JSON.parse(l));
  const res = await check(one);
  assert.deepEqual([res.status, res.headers['content-type']], [200, 'application/x-ndjson; charset=utf-8']);
  const events = lines(res);
  assert.deepEqual([events[0].event, events[0].steps, events.at(-1).event], ['started', STEP_NAMES, 'done']);
  assert.deepEqual(events.filter((e) => e.event === 'step').map((e) => `${e.step.n} ${e.step.state}`), ['1 running', '1 pass', '2 running', '2 pass', '3 running', '3 fail', '4 not-reached', '5 running', '5 pass', '6 running', '6 pass', '7 running', '7 not-reached', '8 not-reached', '9 running', '9 fail'], 'each step as it runs');
  const result = events.at(-1).result;
  assert.deepEqual(result.steps.map((s) => s.detail), ['Opened the purchase screenshot.', ALL_SAME, 'The delivery screenshot is on Google Drive, but the Google account logged in to the dashboard has no access to the file.', 'The delivery screenshot could not be opened, so it was not read.', 'Opened the review screenshot.', 'A written review by "Test Reviewer": "Good product, works well."', NO_CAMPAIGN, 'The review was not found on Flipkart, so there is nothing to compare.', 'Needs Manual Staff Checking: Need Google Drive Access.'], 'with no live campaign, no product page is opened on Flipkart');
  assert.deepEqual([result.order.orderIds, result.order.details.amount.state, reader.read], [[orderId(2)], 'same', [one.id]], 'its purchase screenshot read on this computer (here by a pretend reader in place of Tesseract), and compared with the sheet');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'flipkart', 'settings.json'), 'utf8')).passingMarks, DEFAULT_MARKS, "Flipkart's own passing marks, written in its own settings, starting with the Amazon checker's values");
  assert.deepEqual([result.paused, result.final, result.status, result.typeKey, result.type], [null, 'manual', 'Needs Manual Staff Checking', 'needDriveAccess', 'Need Google Drive Access'], 'the screenshot that could not be had gives the Status, as on Amazon');
  assert.match(result.note, /^A staff member needs to check this transaction because the delivery screenshot is on Google Drive, but the Google account logged in to the dashboard has no access to the file\. /);
  assert.deepEqual([...new Set(google.fetched)], ['1TestFlipkartOrder02abcd', '1TestFlipkartDelivery02ab', '1TestFlipkartReview02abcd'], "through the Amazon screen's Google login");
  // After a reload: the row's page shows the check's steps, and each picture kept or why it could not be had.
  const page = (await call('GET', `/local/flipkart/rows/${one.id}`, { at })).json;
  assert.deepEqual([page.result.checkId, page.result.steps, page.result.order.orderIds, page.result.order.details.product.state], [result.checkId, result.steps, [orderId(2)], 'same'], 'what the purchase screenshot says is kept with the row');
  assert.deepEqual([page.result.final, page.result.status, page.result.typeKey, page.result.type, page.result.note, page.result.finalSays], [result.final, result.status, result.typeKey, result.type, result.note, result.finalSays], 'the Status, Type and Note too');
  assert.deepEqual(page.row.shots.order.pictures.map((p) => [p.i, p.ok, p.type, p.link]), [[0, true, 'image/png', orderShot(2)]]);
  assert.deepEqual(page.row.shots.delivery.pictures, [{ i: 0, ok: false, link: deliveryShot(2), problem: { kind: 'drive', site: 'Google Drive', says: 'the Google account logged in to the dashboard has no access to the file' } }]);
  const table = (await call('GET', '/local/flipkart/sheet', { at })).json.rows[0];
  assert.deepEqual([table.prev, table.check, table.shots.order.pictures.length], [null, undefined, 1]);
  assert.deepEqual([table.final, table.finalSays, table.last], ['manual', result.finalSays, { checkId: result.checkId, final: 'manual', finalSays: result.finalSays, status: 'Needs Manual Staff Checking', type: 'Need Google Drive Access', typeKey: 'needDriveAccess', note: result.note, at: result.finishedAt, seconds: result.seconds, staff: null }], "the table: the row's Status, Type and Note, as on Amazon, not changed by staff");
  const big = await call('GET', `/local/flipkart/rows/${one.id}/picture/order/0`, { at });
  const small = await call('GET', `/local/flipkart/rows/${one.id}/small/order/0`, { at });
  assert.deepEqual([big.status, big.headers['content-type'], big.data.equals(SHOT_PNG), small.status, small.data.equals(SHOT_PNG)], [200, 'image/png', true, 200, true], 'the picture as it is kept, large and small');
  assert.equal((await call('GET', `/local/flipkart/rows/${one.id}/picture/delivery/0`, { at })).status, 404, 'that one could not be had');
  // A row whose pictures are in its cells needs no download, so it is checked with no Google login too.
  google.state = 'out';
  const second2 = lines(await check(two)).at(-1).result;
  assert.deepEqual([second2.steps.map((s) => s.state), second2.typeKey], [['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'not-reached', 'not-reached', 'fail'], 'reviewLinkNeeded'], 'with no live campaign, the review could not be looked for on Flipkart');
  assert.deepEqual([second2.steps[3].detail, reader.readDelivery], ['It says "Delivered, Thu 23rd Jul". Order ID: the same. Order date: not shown. Amount: not shown. Product: the same.', [two.id]], 'its delivery screenshot read and compared too');
  // After a reload: what the delivery screenshot says, and the comparison table, are kept with the row.
  const page2 = (await call('GET', `/local/flipkart/rows/${two.id}`, { at })).json.result;
  assert.deepEqual([page2.delivery.delivered, page2.delivery.deliveredText, page2.delivery.orderIds, page2.delivery.details.orderId.state, page2.shotsHad], [true, 'Delivered, Thu 23rd Jul', [orderId(3)], 'same', ['order', 'delivery']]);
  assert.deepEqual(page2.comparison.map((r) => [r.field, r.result, r.ok]), [['Order ID', 'The same on both screenshots.', true], ['Order date', 'The same on the purchase screenshot.', true], ['Amount', 'The same on the purchase screenshot.', true], ['Product', 'The same on both screenshots.', true], ['Delivered', 'The delivery screenshot says Delivered.', true]]);
  assert.deepEqual(page2.comparison, second2.comparison);
  // And what the review screenshot says.
  assert.deepEqual([page2.review.kind, page2.review.stars, page2.review.title, page2.review.body, page2.review.name, page2.review.dateText], ['written', 5, 'Wonderful', 'Good product, works well.', 'Test Reviewer', '12 Sep, 2026']);
  assert.deepEqual(page2.review, second2.review);
  // A row whose screenshots are on Google Drive, with no one logged in to Google: the check pauses before it starts, as on Amazon, and nothing is saved.
  assert.deepEqual(lines(await check(three)), [{ event: 'paused', kind: 'google-out', says: 'No one is logged in to Google, so the screenshots on Google Drive cannot be downloaded. Press "Log in to Google" in the top bar and log in there, then press Check.' }]);
  assert.equal((await call('GET', `/local/flipkart/rows/${three.id}`, { at })).json.result, null, 'nothing saved');
  // One check at a time, and no upload while a row is checked.
  google.state = 'in';
  let release;
  google.hold = new Promise((r) => (release = r));
  const running = check(three);
  for (let i = 0; i < 300 && !google.fetched.includes('1TestFlipkartOrder04abcd'); i++) await new Promise((r) => setTimeout(r, 10));
  const second = await check(one);
  assert.deepEqual([second.status, second.json.message], [409, 'A row is being checked. Wait for it to finish, then press "Check again".'], 'row 1 is checked, so its button is "Check again", as on Amazon');
  const blocked = await upload(at, 'flipkart-orders.xlsx', FIXTURE);
  assert.deepEqual([blocked.status, blocked.json.message], [409, 'A row is being checked. Wait for it to finish, then upload the file again.']);
  google.hold = null;
  release();
  const third = lines(await running).at(-1).result;
  assert.deepEqual([third.steps[8].detail, third.finalSays], ['Fail: Delivery screenshot missing.', 'This transaction failed because the user wrote "Delivered Left at the door" in the form instead of giving a delivery screenshot.']);
  assert.deepEqual(third.steps.slice(0, 7).map((s) => [s.state, s.detail]), [['pass', 'Opened 2 purchase screenshots.'], ['pass', ALL_SAME], ['fail', 'The cell says "Delivered Left at the door" instead of holding a screenshot.'], ['not-reached', 'There is no delivery screenshot to read.'], ['pass', 'Opened the review screenshot.'], ['pass', 'A written review by "Test Reviewer": "Good product, works well."'], ['not-reached', NO_CAMPAIGN]]);
  // A passing mark written wrongly in Flipkart's settings: nothing is checked until it is put right, and it is said plainly.
  writeFileSync(join(dir, 'flipkart', 'settings.json'), JSON.stringify({ passingMarks: { ...DEFAULT_MARKS, productNameShare: 2 } }));
  const wrong = 'In Flipkart\'s settings file, data/flipkart/settings.json, "passingMarks.productNameShare" must be a share from 0.01 to 1 (0.8 means 80% of the words), without quotes. Nothing can be checked until it is put right.';
  for (const res of [await check(two), await call('POST', '/local/flipkart/check-all', { at, body: Buffer.from('{}'), type: 'application/json' })]) assert.deepEqual([res.status, res.json?.message], [400, wrong]);
  writeFileSync(join(dir, 'flipkart', 'settings.json'), JSON.stringify({ passingMarks: DEFAULT_MARKS }));
  // What is not a row's route, and the same safety as every route.
  assert.equal((await call('POST', '/local/flipkart/rows/r000000000000/check', { at, body: Buffer.from('{}'), type: 'application/json' })).status, 404);
  const getCheck = await call('GET', `/local/flipkart/rows/${one.id}/check`, { at });
  assert.deepEqual([getCheck.status, getCheck.headers.allow], [405, 'POST']);
  const postPage = await call('POST', `/local/flipkart/rows/${one.id}`, { at });
  assert.deepEqual([postPage.status, postPage.headers.allow], [405, 'GET, HEAD']);
  assert.equal((await call('GET', `/local/flipkart/rows/${one.id}`, { at, token: null })).status, 401);
  assert.equal((await check(one, { site: 'cross-site' })).status, 403);
  assert.ok(filesIn(dir).every((p) => p.startsWith('flipkart/')), 'kept only in data/flipkart/');
  await routes.close();
});

test("the line under the upload line says which campaign the rows use, found the Amazon way and in the Amazon words: a live campaign whose brand is in the row's product name, or else in the file's name or the tab's name; rows with no live campaign are said too", async () => {
  const saved = (products, sheet = {}) => ({
    sheet: { fileName: 'orders.xlsx', kind: 'xlsx', tab: 'Flipkart', headers: [{ col: 1, text: 'Order ID' }, { col: 2, text: 'Product' }], lastCol: 2, mapping: { orderId: 1, product: 2 }, uploadedAt: '2026-10-12T12:00:00.000Z', ...sheet },
    rows: products.map((p, i) => ({ id: `r00000000000${i + 1}`, n: i + 1, row: i + 2, orderId: { text: orderId(i + 2) }, product: { text: p }, shots: {}, pictures: {}, values: {}, prev: null })),
  });
  const campaign = (key, brand, name, live = true) => ({ key, brand, name, live, products: [] });
  const GLOW = campaign('f00000000000a', 'Test Glow', 'Test Glow Clean');
  const CLAY = campaign('f00000000000b', 'Test Clay', 'Test Clay Care');
  const line = (s, campaigns) => sheetView(s, campaigns).sheet.about.at(-1);
  const NONE = "No campaign was found for these rows: no campaign's brand is in their product names, the file's name or the tab's name, so each product is compared with its name in the file.";
  assert.equal(line(saved(['Test Glow Face Wash']), []), NONE, 'no campaign yet');
  assert.equal(line(saved(['Test Glow Face Wash', 'TestGlow Clay Mask']), [GLOW, CLAY]), 'The rows use the live campaign "Test Glow Clean": its brand, Test Glow, is in their product names.');
  assert.equal(line(saved(['Face Wash']), [GLOW]), NONE, "a brand that is nowhere: in no product name, nor in the file's name or the tab's name");
  assert.equal(line(saved(['Face Wash'], { fileName: 'test glow orders.xlsx' }), [GLOW]), 'The rows use the live campaign "Test Glow Clean": its brand, Test Glow, is in the file\'s name.');
  assert.equal(line(saved(['Face Wash'], { tab: 'Test Glow' }), [GLOW]), 'The rows use the live campaign "Test Glow Clean": its brand, Test Glow, is in the tab\'s name.');
  assert.equal(line(saved(['Test Glow Face Wash', 'Face Mask'], { fileName: 'test glow.xlsx' }), [GLOW]), 'The rows use the live campaign "Test Glow Clean": its brand, Test Glow, is in their product names or the file\'s name.');
  assert.equal(line(saved(['Test Glow Face Wash', 'Test Clay Mask', 'Plain Bottle']), [GLOW, CLAY]), 'The rows use the live campaign "Test Glow Clean" (1 row, by their product names) and the live campaign "Test Clay Care" (1 row, by their product names). 1 row uses no campaign, so its product is compared with its name in the file.');
  assert.equal(line(saved(['Test Glow Face Wash', 'Plain Bottle', 'Plain Jar']), [GLOW]), 'The rows use the live campaign "Test Glow Clean" (1 row, by their product names). 2 rows use no campaign, so their products are compared with their names in the file.');
  assert.equal(line(saved(['Test Glow Face Wash']), [{ ...GLOW, live: false, name: 'Old Glow' }]), 'No live campaign was found for these rows, so each product is compared with its name in the file. The campaign "Old Glow" has the brand, but it is marked Ended, so it is not used: mark it Live in the Campaigns box to use it.', 'a campaign marked Ended is never used');
  assert.equal(line(saved(['Test Glow Face Wash']), [{ ...GLOW, brand: '' }]), NONE, 'a campaign with no brand yet is never used');
  // Over HTTP: the line follows the campaigns as they are saved, under the other lines about the file.
  const { dir, at } = await fresh();
  assert.equal((await upload(at, 'flipkart-orders.xlsx', FIXTURE)).status, 200);
  assert.equal((await call('GET', '/local/flipkart/sheet', { at })).json.sheet.about.at(-1), NONE);
  await createFlipkartStore(dir).changeCampaigns((list) => putCampaign(list, campaign('f00000000000c', 'Test Brand', 'Test Brand Bottles')));
  const about = (await call('GET', '/local/flipkart/sheet', { at })).json.sheet.about;
  assert.deepEqual([about.length, about.at(-1)], [4, 'The rows use the live campaign "Test Brand Bottles" (4 rows, by their product names). 1 row uses no campaign, so its product is compared with its name in the file.'], 'row 5 has no product name');
});

test("step 7 over HTTP: the campaign product's reviews on Flipkart read once in a checking run (a pretend reading in place of the Live Flipkart Browser) and kept in data/flipkart/reviews/<product ID>.json for every row; a copy read in the last hour serves the next check; back to the oldest day the rows need, from what each row's last check kept (its delivery day, else its order day); a copy kept before each review's own link was kept is read again, once; a reading Flipkart stopped part way pauses the check of a row whose review is not among the reviews read (one whose review is among them gets its Status), is kept only when it has at least as many reviews as the copy kept before (else only what the refused page showed is added), and the next try in the next day goes on from where it stopped", async () => {
  const dir = tempDir();
  const google = driveLogin();
  const reader = pretendReader();
  let clock = new Date('2026-10-13T05:00:00.000Z');
  const later = (hours) => (clock = new Date(clock.getTime() + hours * 3_600_000));
  const PID = 'TESTPID0000001';
  const LINK = `https://www.flipkart.com/test-brand-steel-bottle/product-reviews/itmtestbottle01?pid=${PID}&marketplace=FLIPKART`;
  const made = (i, date = '2026-10-13') => ({ id: `made-up-${i}`, name: `Made-up Reviewer ${i}`, stars: 4, title: 'Nice', text: `Made-up review number ${i}.`, dateSaid: 'Today', date, dateLatest: date, city: 'Test Town', certified: true, reviewFor: null, page: 1 });
  // The review on every made-up review screenshot (pretendReader), as Flipkart shows it.
  const MINE_ID = '00000000-0000-4000-8000-000000000001';
  const MINE_LINK = `https://www.flipkart.com/reviews/${PID}:7?reviewId=${MINE_ID}`;
  const MINE = { ...made('mine', '2026-10-01'), id: MINE_ID, name: 'Test Reviewer', stars: 5, title: 'Wonderful', text: 'Good product, works well.', dateSaid: '12 days ago', link: MINE_LINK };
  const asked = [];
  let answer = null;
  const reviews = async (browser, pid, opts) => {
    asked.push({ pid, since: opts.since, from: opts.from?.pages ?? null });
    return answer ?? { pid, link: LINK, readAt: clock.toISOString(), since: opts.since, pages: 2, total: 20, end: opts.since ? 'date' : 'limit', stoppedAt: null, says: 'Made-up.', loginBox: false, links: true, reviews: [made(1), MINE, made(2), made(3, '2026-07-01')], product: { pid, name: 'Test Brand Steel Bottle', rating: 4.2, ratings: 100, reviews: 20 } };
  };
  const routes = createFlipkartRoutes({ dataDir: dir, auth, google, shotOptions: { gapMs: 0 }, readers: { ...reader, reviews }, now: () => clock });
  const at = await serve({ flipkart: routes });
  assert.equal((await upload(at, 'flipkart-orders.xlsx', FIXTURE)).status, 200);
  const rows = (await call('GET', '/local/flipkart/sheet', { at })).json.rows;
  reader.set(rows);
  const store = createFlipkartStore(dir);
  const read = { at: '2026-10-12T05:00:00.000Z', name: rows[1].product, brand: 'Test Brand', variants: [], pid: PID, itemId: null, rating: 4.2, ratings: 100, reviews: 20, allReviews: null };
  await store.changeCampaigns((list) => putCampaign(list, { key: 'f00000000000d', brand: 'Test Brand', name: 'Test Brand Bottles', live: true, products: [{ given: PID, url: pageForPid(PID), pid: PID, itemId: null, byId: true, read, problem: null }] }));
  const lines = (res) => res.text.trim().split('\n').map((l) => JSON.parse(l));
  const check = async (row) => lines(await call('POST', `/local/flipkart/rows/${row.id}/check`, { at, body: Buffer.from('{}'), type: 'application/json' }));
  const step7 = (events) => events.at(-1).result?.steps?.[6];
  const keptCount = async () => (await store.reviews(PID))?.reviews?.length ?? 0;
  // A copy read in full just now, but kept before each review's own link was kept (14-10-2026): it is not used, and the reviews are read again.
  await store.saveReviews(PID, { pid: PID, link: LINK, readAt: clock.toISOString(), since: null, pages: 2, total: 4, end: 'last page', stoppedAt: null, says: 'Made-up.', loginBox: false, reviews: [made(1), { ...MINE, link: undefined }], product: { pid: PID, name: 'Test Brand Steel Bottle', rating: 4.2, ratings: 100, reviews: 20 } });
  // Row 2's Check: no other row has been checked yet, so back to the row's own day; kept; the review found in it.
  const firstCheck = await check(rows[1]);
  const first = step7(firstCheck);
  assert.deepEqual([first.state, first.detail], ['pass', 'Found the review among Flipkart\'s public reviews: its words match the review screenshot\'s, and it is under the name on the review screenshot. On Flipkart it has 5 stars, and it was posted 12 days ago (01-10-2026). Read 4 reviews of the product from "See all reviews" on Flipkart, newest first (back to 01-07-2026; the rows need reviews back to 23-07-2026). Reviews posted on or after the day the order was delivered (23-07-2026, on the delivery screenshot) can be the user\'s.']);
  assert.deepEqual([asked, await keptCount(), (await store.reviews(PID)).readAt, (await store.reviews(PID)).links], [[{ pid: PID, since: '2026-07-23', from: null }], 4, '2026-10-13T05:00:00.000Z', true]);
  assert.deepEqual([firstCheck.at(-1).result.final, firstCheck.at(-1).result.typeKey, firstCheck.at(-1).result.steps[7].state], ['manual', 'reviewerNotMatching', 'fail'], "found, but the made-up file's Reviewer Name column names another made-up person, so a staff member checks whose review it is");
  // What was found is kept with the row's check, for its page.
  const keptFound = (await store.sheet()).rows.find((r) => r.id === rows[1].id).check.found;
  assert.deepEqual([keptFound.how, keptFound.review.id, keptFound.review.stars, keptFound.review.link], ['found', MINE_ID, 5, MINE_LINK], "with the review's own link, as Flipkart's reviews pages sent it");
  // A check kept before 14-10-2026 with a link Flipkart's website does not open: its page is given no link.
  const kept1 = (await store.sheet()).rows.find((r) => r.id === rows[1].id).check;
  const oldLink = `https://www.flipkart.com/reviews/${MINE_ID}`;
  const stored = JSON.parse(readFileSync(join(dir, 'flipkart', 'rows.json'), 'utf8'));
  stored.rows.find((r) => r.id === rows[1].id).check.found.review.link = oldLink;
  writeFileSync(join(dir, 'flipkart', 'rows.json'), JSON.stringify(stored));
  const oldPage = (await call('GET', `/local/flipkart/rows/${rows[1].id}`, { at })).json.result;
  assert.deepEqual([oldPage.found.review.link, oldPage.found.review.id, oldPage.final], [null, MINE_ID, kept1.final]);
  // Row 3's Check soon after: its own day is older, so the reading goes on from where the first one stopped.
  await check(rows[2]);
  const day3 = (await store.sheet()).rows.find((r) => r.id === rows[2].id).check.reviewsFrom.day;
  assert.deepEqual([asked.length, asked.at(-1), day3 < '2026-07-23'], [2, { pid: PID, since: day3, from: 2 }, true]);
  // Row 2's Check again soon after: the copy read in the last hour reaches its day; Flipkart is not opened again.
  const second = step7(await check(rows[1]));
  assert.deepEqual([asked.length, / They were read earlier and kept on this computer, so Flipkart was not opened again\. /.test(second.detail)], [2, true]);
  // Two hours later: read again.
  later(2);
  await check(rows[1]);
  assert.equal(asked.length, 3);
  // "Check every row again": read once for the whole run, and every row uses that copy.
  later(2);
  const run = lines(await call('POST', '/local/flipkart/check-all', { at, body: Buffer.from(JSON.stringify({ again: true })), type: 'application/json' }));
  assert.equal(run.at(-1).event, 'run-done');
  assert.deepEqual([asked.length, asked.at(-1).since, run.filter((e) => e.event === 'done').map((e) => e.result.steps[6].state).filter((st) => st === 'pass').length > 1], [4, run.find((e) => e.event === 'done').result.reviewsFrom.day, true], 'one reading for every row of the run, back to the first row\'s day, as the others were cleared');
  // Every row checked this way: the next reading goes back only to the oldest day a row needs.
  later(2);
  await check(rows[1]);
  const oldest = (await store.sheet()).rows.map((r) => r.check?.reviewsFrom?.day).filter(Boolean).sort()[0];
  assert.deepEqual([asked.length, asked.at(-1).since, typeof oldest], [5, oldest, 'string']);
  // A row whose last check came before step 7 counts with what it kept: no delivery day ("Delivered before time"), so its order day.
  const other = (await store.sheet()).rows.find((r) => r.id !== rows[1].id && (r.shots?.reviewShot?.links?.length || r.shots?.reviewShot?.picture));
  await store.saveCheck(other.id, { finishedAt: clock.toISOString(), steps: [], order: { ok: true, dates: ['05-07, with no year shown'] }, delivery: { ok: true, delivered: true, deliveredText: 'Delivered before time' } });
  later(2);
  await check(rows[1]);
  assert.deepEqual([asked.length, asked.at(-1).since], [6, '2026-07-05']);
  // A reading stopped by a robot check: the check pauses, saying what to press; the fuller copy kept before stays, with what the refused page showed.
  later(2);
  const stoppedAt = (pages, kind, n) => ({ pid: PID, link: LINK, readAt: clock.toISOString(), since: '2026-07-05', pages, total: 20, end: 'prevented', prevented: kind, refused: { page: pages + 1, status: 200, title: 'Flipkart', reviews: 0 }, stoppedAt: pages + 1, says: `Made-up: stopped at page ${pages + 1}.`, loginBox: false, links: true, reviews: Array.from({ length: n }, (_, i) => made(10 + i)), product: { pid: PID, name: 'Test Brand Steel Bottle', rating: 4.2, ratings: 100, reviews: 20 } });
  answer = stoppedAt(1, 'captcha', 1);
  const lastCheck = (await store.row(rows[1].id)).check.checkId;
  const paused = await check(rows[1]);
  assert.deepEqual(paused.find((e) => e.event === 'paused'), { event: 'paused', kind: 'flipkart-captcha', says: 'Flipkart showed a robot check. This dashboard never answers a robot check. Press "Check again" when you are ready.' });
  assert.deepEqual([paused.find((e) => e.event === 'done').result.final, (await store.row(rows[1].id)).check.checkId], [null, lastCheck], 'no Status: the row keeps its last check, and nothing is got around');
  assert.deepEqual([await keptCount(), (await store.reviews(PID)).refused], [4, { page: 2, status: 200, title: 'Flipkart', reviews: 0 }], 'not replaced by a reading stopped part way with fewer reviews');
  // Stopped by an error with as many reviews or more: kept; the next try goes on from where it stopped, and never from page 1.
  answer = stoppedAt(4, 'error', 4);
  assert.equal((await check(rows[1])).find((e) => e.event === 'paused').kind, 'flipkart-error');
  assert.deepEqual([await keptCount(), (await store.reviews(PID)).end], [4, 'prevented']);
  answer = null;
  later(3);
  await check(rows[1]);
  assert.deepEqual([asked.length, asked.at(-1).from, (await store.reviews(PID)).end], [9, 4, 'date']);
  // A copy stopped part way more than a day ago: read again from the first page.
  later(2);
  answer = stoppedAt(4, 'error', 4);
  await check(rows[1]);
  answer = null;
  later(25);
  await check(rows[1]);
  assert.deepEqual([asked.length, asked.at(-1).from], [11, null]);
  // A reading stopped part way serves the rest of the run as it is: the rows whose review is in it pass, and Flipkart is not asked again in the run.
  later(2);
  answer = { ...stoppedAt(2, 'error', 2), reviews: [made(20), MINE] };
  const partRun = lines(await call('POST', '/local/flipkart/check-all', { at, body: Buffer.from(JSON.stringify({ again: true })), type: 'application/json' }));
  const passed = partRun.filter((e) => e.event === 'done').filter((e) => e.result.steps[6].state === 'pass');
  assert.deepEqual([asked.length, partRun.at(-1).event, passed.length > 1, passed.every((e) => !e.result.paused && /The review was found among the reviews read before that\./.test(e.result.steps[6].detail))], [12, 'run-done', true, true]);
  // Flipkart refusing the product's page, before any page of reviews: the run pauses at the first row that needs Flipkart's reviews, saying what to
  // press, with Flipkart asked once; "Carry on checking" goes on from that row.
  later(2);
  answer = { ...stoppedAt(0, 'blocked', 0), stoppedAt: 0 };
  const refusedRun = lines(await call('POST', '/local/flipkart/check-all', { at, body: Buffer.from(JSON.stringify({ again: true })), type: 'application/json' }));
  const stop = refusedRun.at(-1);
  assert.deepEqual([asked.length, stop.event, stop.kind, stop.says, refusedRun.filter((e) => e.event === 'done' && e.result.paused).length], [13, 'paused', 'flipkart-blocked', 'Flipkart refused a page. Wait a while, then press "Carry on checking".', 1]);
  answer = null;
  const carryOn = lines(await call('POST', '/local/flipkart/check-all', { at, body: Buffer.from('{}'), type: 'application/json' }));
  assert.deepEqual([asked.length, carryOn.find((e) => e.event === 'row').rowId, carryOn.at(-1).event], [14, stop.rowId, 'run-done']);
});

/** "Start checking" as the page sends it, its lines read as they come; stop() closes it, as Stop does. */
function startRun(at, body = {}) {
  const lines = [];
  let req;
  const done = new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify(body));
    req = request({ host: '127.0.0.1', port: at, path: '/local/flipkart/check-all', method: 'POST', headers: { Host: 'localhost:8093', Authorization: `Bearer ${TOKEN}`, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
      let rest = '';
      res.on('data', (c) => {
        rest += c;
        const parts = rest.split('\n');
        rest = parts.pop();
        for (const l of parts) if (l.trim()) lines.push(JSON.parse(l));
      });
      // Closed by stop(): the read ends there.
      res.on('error', () => resolve(lines));
      res.on('close', () => resolve(lines));
    });
    req.on('error', () => resolve(lines));
    req.end(data);
  });
  return { lines, done, stop: () => req.destroy() };
}

test('"Start checking" over HTTP, as on Amazon: the rows not checked yet, one by one from the first one, each row\'s steps streamed and its new line sent once it is finished; no one logged in to Google, a login using the Live Amazon Browser, or a pause in a row\'s check pauses before or at that row, and checking carries on from it; Stop; "Check every row again"; one check at a time; each row\'s new line carries its Status, Type and Note', async () => {
  const dir = tempDir();
  const google = driveLogin();
  const reader = pretendReader();
  const routes = createFlipkartRoutes({ dataDir: dir, auth, google, shotOptions: { gapMs: 0 }, readers: reader });
  const at = await serve({ flipkart: routes });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const json = (body) => ({ at, body: Buffer.from(JSON.stringify(body)), type: 'application/json' });
  const lines = (res) => res.text.trim().split('\n').map((l) => JSON.parse(l));
  const checkAll = async (body = {}) => {
    const res = await call('POST', '/local/flipkart/check-all', json(body));
    return res.status === 200 ? lines(res) : res;
  };
  const doneNow = async () => (await call('GET', '/local/flipkart/sheet', { at })).json.rows.map((r) => r.done);
  // Only the run's own lines: each row's steps come between them, as on Amazon.
  const runLines = (events) => events.filter((e) => !['started', 'action', 'step', 'done'].includes(e.event)).map((e) => [e.event, e.label ?? null, e.done ?? null]);
  /** Waits until nothing is checked: a campaign can then be saved (a form with no brand is refused for that alone, and nothing is saved). */
  const free = async () => {
    for (let i = 0; i < 300; i++) {
      const r = await call('POST', '/local/flipkart/campaigns', json({}));
      if (r.status !== 409) return r;
      await sleep(10);
    }
    throw new Error('still checking');
  };

  const none = await fresh();
  assert.deepEqual([(await call('POST', '/local/flipkart/check-all', { ...json({}), at: none.at })).json.message], ['There are no rows to check. Upload the file first.']);
  assert.equal((await upload(at, 'flipkart-orders.xlsx', FIXTURE)).status, 200);
  const rows = (await call('GET', '/local/flipkart/sheet', { at })).json.rows;
  const [one, two] = rows;
  reader.set(rows);
  assert.deepEqual(await doneNow(), [false, false, false, false, false], 'no row is checked yet');
  // Row 2 checked by its own button first: it counts as checked once its check finished.
  const single = lines(await call('POST', `/local/flipkart/rows/${two.id}/check`, json({})));
  assert.equal(single.at(-1).event, 'done');
  assert.deepEqual(await doneNow(), [false, true, false, false, false]);

  // No one logged in to Google: checking pauses before the first row not checked yet whose screenshots are on Google Drive, and says what to do.
  google.state = 'out';
  const tally = { total: 5, done: 1, left: 4 };
  assert.deepEqual(await checkAll(), [
    { event: 'run-started', again: false, ...tally },
    { event: 'row', rowId: one.id, label: 'Row 1', ...tally },
    { event: 'paused', kind: 'google-out', says: 'No one is logged in to Google, so the screenshots on Google Drive cannot be downloaded. Press "Log in to Google" in the top bar and log in there, then press "Carry on checking".', rowId: one.id, label: 'Row 1', checked: 0, ...tally },
  ]);
  // A login using the Live Amazon Browser: the same, with its own plain sentence.
  google.state = 'in';
  google.amazonLogin = () => ({ state: 'waiting', busy: false });
  assert.deepEqual((await checkAll()).at(-1), { event: 'paused', kind: 'login-busy', says: 'The Live Amazon Browser is busy with the Amazon login, so the Google Drive screenshots were not downloaded yet. Wait until that is done, then press "Carry on checking".', rowId: one.id, label: 'Row 1', checked: 0, ...tally });
  google.amazonLogin = () => ({ state: 'in', busy: false });
  // A pause in the row's own check (here, the Google login being checked just as its first screenshot is downloaded) pauses checking at that row too.
  let asked = 0;
  google.busy = () => ++asked > 1;
  const mid = await checkAll();
  assert.deepEqual(mid.filter((e) => e.event === 'step').map((e) => `${e.step.n} ${e.step.state}`), ['1 running', '1 fail']);
  assert.deepEqual(mid.at(-1), { event: 'paused', kind: 'login-busy', says: 'The Google login is being checked, so the Google Drive screenshots were not downloaded yet. Wait a moment, then press "Carry on checking".', rowId: one.id, label: 'Row 1', checked: 0, ...tally });
  google.busy = () => false;
  assert.deepEqual(await doneNow(), [false, true, false, false, false], 'a paused row is not checked, so checking carries on from it next time');
  assert.deepEqual([google.fetched, filesIn(dir).filter((p) => p.startsWith('flipkart/pictures/')).length], [[], 4], 'nothing was downloaded yet');

  // Stop: at once; the row it was on is not checked.
  let release;
  google.hold = new Promise((r) => (release = r));
  const stopped = startRun(at);
  for (let i = 0; i < 300 && !(google.fetched.length && stopped.lines.length >= 2); i++) await sleep(10);
  assert.deepEqual(google.fetched, ['1TestFlipkartOrder02abcd'], "row 1's purchase screenshot is being downloaded");
  assert.deepEqual(stopped.lines.slice(0, 2).map((e) => [e.event, e.label ?? null]), [['run-started', null], ['row', 'Row 1']]);
  stopped.stop();
  google.hold = null;
  release();
  assert.deepEqual([(await free()).status, (await stopped.done).some((e) => e.event === 'row-done')], [400, false]);
  assert.deepEqual(await doneNow(), [false, true, false, false, false], 'stopped: row 1 is not checked, so it is the first one checked next time');

  // "Carry on checking": from row 1, passing row 2 (checked), to the last row; each row's new line is sent as soon as it is finished.
  const run = await checkAll();
  assert.deepEqual(runLines(run), [['run-started', null, 1], ['row', 'Row 1', 1], ['row-done', 'Row 1', 2], ['row', 'Row 3', 2], ['row-done', 'Row 3', 3], ['row', 'Row 4', 3], ['row-done', 'Row 4', 4], ['row', 'Row 5', 4], ['row-done', 'Row 5', 5], ['run-done', null, 5]]);
  assert.deepEqual(run.filter((e) => e.event === 'started').map((e) => [e.name, e.steps]), [['Row 1', STEP_NAMES], ['Row 3', STEP_NAMES], ['Row 4', STEP_NAMES], ['Row 5', STEP_NAMES]], "each row's steps, streamed as they run");
  const doneOf = (rowId) => run.find((e) => e.event === 'done' && e.result.rowId === rowId).result;
  assert.deepEqual(run.filter((e) => e.event === 'row-done').map((e) => [e.rows.length, e.rows[0].id === e.rowId, e.rows[0].done, e.rows[0].prev, e.rows[0].final, e.rows[0].last.note]), run.filter((e) => e.event === 'row-done').map((e) => [1, true, true, null, doneOf(e.rowId).final, doneOf(e.rowId).note]), "the row's new line for the table: checked, with its Status, Type and Note at once");
  assert.deepEqual(run.find((e) => e.event === 'done').result.steps.map((s) => s.state), ['pass', 'pass', 'fail', 'not-reached', 'pass', 'pass', 'not-reached', 'not-reached', 'fail'], "row 1's check: the screenshots, its purchase and review screenshots read, and its delivery screenshot not, as it could not be had");
  assert.deepEqual(run.at(-1), { event: 'run-done', checked: 4, total: 5, done: 5, left: 0 });
  assert.deepEqual(await doneNow(), [true, true, true, true, true]);
  const page = (await call('GET', `/local/flipkart/rows/${one.id}`, { at })).json;
  assert.deepEqual([page.row.done, page.result.steps.length, page.result.status, page.row.last.status], [true, 9, 'Needs Manual Staff Checking', 'Needs Manual Staff Checking'], "its page shows its last check's steps and its Status");
  const all = await checkAll();
  assert.deepEqual([all.status, all.json.message], [409, 'All rows are checked. To check them all again, press "Check every row again".']);

  // "Check every row again": every row's last check goes, and every row is checked again from the first one. One check at a time meanwhile.
  google.fetched.length = 0;
  google.hold = new Promise((r) => (release = r));
  const again = startRun(at, { again: true });
  for (let i = 0; i < 300 && !google.fetched.length; i++) await sleep(10);
  assert.deepEqual(google.fetched, ['1TestFlipkartDelivery02ab'], 'only the screenshot that could not be had is downloaded again');
  const busy = [
    await call('POST', `/local/flipkart/rows/${two.id}/check`, json({})),
    await call('POST', '/local/flipkart/check-all', json({})),
    await upload(at, 'flipkart-orders.xlsx', FIXTURE),
    await call('POST', '/local/flipkart/campaigns', json({})),
  ];
  assert.deepEqual(busy.map((r) => [r.status, r.json.message]), [
    [409, 'Rows are being checked. Press Stop, or wait for checking to finish, then press Check.'],
    [409, 'Rows are being checked. Press Stop, or wait for checking to finish, then press "Start checking" again.'],
    [409, 'Rows are being checked. Press Stop, or wait for checking to finish, then upload the file again.'],
    [409, 'Rows are being checked. Press Stop, or wait for checking to finish, then press Save.'],
  ]);
  google.hold = null;
  release();
  const redone = await again.done;
  assert.deepEqual(redone[0], { event: 'run-started', again: true, total: 5, done: 0, left: 5 });
  assert.deepEqual(runLines(redone).filter(([e]) => e === 'row').map(([, label]) => label), ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5']);
  assert.deepEqual(redone.at(-1), { event: 'run-done', checked: 5, total: 5, done: 5, left: 0 });
  const table = (await call('GET', '/local/flipkart/sheet', { at })).json.rows;
  assert.deepEqual(table.map((r) => [r.done, r.prev, ['pass', 'fail', 'manual'].includes(r.final)]), Array.from({ length: 5 }, () => [true, null, true]), 'every row checked, each with its Status');

  // The same safety as every route.
  const get = await call('GET', '/local/flipkart/check-all', { at });
  assert.deepEqual([get.status, get.headers.allow], [405, 'POST']);
  assert.equal((await call('POST', '/local/flipkart/check-all', { ...json({}), token: null })).status, 401);
  assert.equal((await call('POST', '/local/flipkart/check-all', { ...json({}), site: 'cross-site' })).status, 403);
  assert.equal((await call('POST', '/local/flipkart/check-all', { at, body: Buffer.from('{}'), type: 'text/plain' })).status, 415);
  assert.ok(filesIn(dir).every((p) => p.startsWith('flipkart/')), 'kept only in data/flipkart/');
  await routes.close();
});

test('a result a staff member changed or marked right, over HTTP, as on Amazon: "Change the result" takes a Status, a Type from the list and a Note, and the row says "Changed by staff"; "The result is right" is only for the dashboard\'s own result; both kept with when and what the dashboard said, after a restart too; "Check every row again" passes a row changed by staff by, and a mark goes with its check; "Check again" replaces a staff result; neither while the row is being checked', async () => {
  const dir = tempDir();
  const google = driveLogin();
  const reader = pretendReader();
  let clock = new Date('2026-10-15T06:00:00.000Z');
  const make = () => createFlipkartRoutes({ dataDir: dir, auth, google, shotOptions: { gapMs: 0 }, readers: reader, now: () => clock });
  const at = await serve({ flipkart: make() });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const json = (body, where = at) => ({ at: where, body: Buffer.from(JSON.stringify(body)), type: 'application/json' });
  const lines = (res) => res.text.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal((await upload(at, 'flipkart-orders.xlsx', FIXTURE)).status, 200);
  const rows = (await call('GET', '/local/flipkart/sheet', { at })).json.rows;
  const [one, two, three] = rows;
  reader.set(rows);
  const change = (row, body) => call('POST', `/local/flipkart/rows/${row.id}/result`, json(body));
  const right = (row) => call('POST', `/local/flipkart/rows/${row.id}/right`, json({}));
  const listed = async (row, where = at) => (await call('GET', '/local/flipkart/sheet', { at: where })).json.rows.find((r) => r.id === row.id);
  // While row 1 is being checked, its result can be neither changed nor marked right.
  let release;
  google.hold = new Promise((r) => (release = r));
  const busy = call('POST', `/local/flipkart/rows/${one.id}/check`, json({}));
  for (let i = 0; i < 300 && !google.fetched.length; i++) await sleep(10);
  const refused = [await change(one, { final: 'pass', typeKey: 'verified', note: '' }), await right(one)];
  assert.deepEqual(refused.map((r) => [r.status, r.json.message]), [[409, 'This row is being checked right now. Wait for it to finish, then change its result.'], [409, 'This row is being checked right now. Wait for it to finish, then mark its result.']]);
  google.hold = null;
  release();
  assert.equal((await busy).status, 200);
  assert.equal(lines(await call('POST', `/local/flipkart/rows/${two.id}/check`, json({}))).at(-1).event, 'done');
  const dashboard = await listed(one);
  assert.ok(dashboard.last.final && !dashboard.last.staff, "row 1 has the dashboard's own result");
  // "Change the result": a Status, a Type from the list, and a Note of at most 4000 letters.
  const bad = [await change(one, { final: 'maybe', typeKey: 'verified' }), await change(one, { final: 'pass', typeKey: 'not a type' }), await change(one, { final: 'pass', typeKey: 'verified', note: 'x'.repeat(4001) }), await call('POST', '/local/flipkart/rows/r999999999999/result', json({ final: 'pass', typeKey: 'verified' }))];
  assert.deepEqual(bad.map((r) => [r.status, r.json.message]), [[400, 'Choose a Status: Pass, Fail or Needs Manual Staff Checking.'], [400, 'Choose a Type from the list.'], [400, 'The Note is too long: at most 4000 letters.'], [404, 'No row has that id.']]);
  const get = await call('GET', `/local/flipkart/rows/${one.id}/result`, { at });
  assert.deepEqual([get.status, get.headers.allow], [405, 'POST']);
  // A word this dashboard never shows is hidden in the Note too, as on Amazon.
  const hidden = Buffer.from('cmVmdW5k', 'base64').toString('utf8');
  const changed = await change(one, { final: 'pass', typeKey: 'verified', note: `  Made-up note by staff:\r\nthe ${hidden} line is hidden.  ` });
  assert.equal(changed.status, 200);
  const was = { final: dashboard.last.final, typeKey: dashboard.last.typeKey, type: dashboard.last.type };
  const c = changed.json.row;
  assert.deepEqual([c.done, c.final, c.finalSays, c.last.final, c.last.status, c.last.typeKey, c.last.type, c.last.note, c.last.finalSays, c.last.at, c.last.staff], [true, 'pass', null, 'pass', 'Pass', 'verified', 'Verified', 'Made-up note by staff:\nthe … line is hidden.', null, '2026-10-15T06:00:00.000Z', { at: '2026-10-15T06:00:00.000Z', right: false, was }]);
  // Its page: the staff's result, with the check's own steps still there.
  const page = (await call('GET', `/local/flipkart/rows/${one.id}`, { at })).json;
  assert.deepEqual([page.row.last.staff.right, page.result.staff.right, page.result.type, page.result.note, page.result.steps.length], [false, false, 'Verified', 'Made-up note by staff:\nthe … line is hidden.', STEP_NAMES.length]);
  // Changed again: what the dashboard said stays the dashboard's.
  clock = new Date('2026-10-15T06:01:00.000Z');
  assert.deepEqual((await change(one, { final: 'fail', typeKey: 'notDelivered', note: 'Made-up.' })).json.row.last.staff, { at: '2026-10-15T06:01:00.000Z', right: false, was });
  // "The result is right": only for the dashboard's own result, of a row that has one.
  assert.deepEqual([(await right(one)).json.message, (await right(three)).json.message], ['This result was chosen by staff, not by the dashboard, so it cannot be marked as right. Press "Check again" to get the dashboard\'s result first.', 'This row has no result to mark as right. Check it first.']);
  clock = new Date('2026-10-15T06:05:00.000Z');
  const before = await listed(two);
  const marked = (await right(two)).json.row;
  assert.deepEqual([marked.last.final, marked.last.type, marked.last.note, marked.last.at, marked.last.staff], [before.last.final, before.last.type, before.last.note, before.last.at, { at: '2026-10-15T06:05:00.000Z', right: true, was: { final: before.last.final, typeKey: before.last.typeKey, type: before.last.type } }]);
  // A row not checked yet can be given a result too, with nothing the dashboard said; "Start checking" then passes it by.
  const given = (await change(three, { final: 'manual', typeKey: 'somethingElse', note: 'Made-up.' })).json.row;
  assert.deepEqual([given.done, given.final, given.last.staff.was], [true, 'manual', null]);
  // The Type list comes with the rows, in the Amazon screen's order.
  const sheet = (await call('GET', '/local/flipkart/sheet', { at })).json;
  assert.deepEqual([sheet.types.length, sheet.types[0], sheet.types.at(-1)], [23, { key: 'verified', word: 'Verified' }, { key: 'somethingElse', word: 'Something else' }]);
  // After a restart, all of it is still there.
  const at2 = await serve({ flipkart: make() });
  const staffOf = async (row) => (await listed(row, at2)).last?.staff ?? null;
  assert.deepEqual([await staffOf(one), await staffOf(two), await staffOf(three)], [{ at: '2026-10-15T06:01:00.000Z', right: false, was }, marked.last.staff, given.last.staff]);
  // "Check every row again": the rows changed by staff keep their results and are passed by; the row marked right is checked again, and its mark goes.
  const run = lines(await call('POST', '/local/flipkart/check-all', json({ again: true })));
  const checked = run.filter((e) => e.event === 'row').map((e) => e.rowId);
  assert.deepEqual([run.at(-1).event, checked.includes(one.id), checked.includes(three.id), checked.includes(two.id)], ['run-done', false, false, true]);
  assert.deepEqual([(await listed(one)).last.staff?.right, (await listed(three)).last.staff?.right, (await listed(two)).last.staff], [false, false, null]);
  // "Check again" on row 1: the dashboard's result replaces the staff's.
  const again = lines(await call('POST', `/local/flipkart/rows/${one.id}/check`, json({})));
  const now1 = await listed(one);
  assert.deepEqual([again.at(-1).event, now1.last.staff, now1.last.final, now1.last.type], ['done', null, again.at(-1).result.final, again.at(-1).result.type]);
});
