// Flipkart's routes, over HTTP, through serve.mjs: every path under
// /local/flipkart/ goes to flipkart/routes.js (the status, ready: false, and
// the uploaded file's rows), with the page's session token and from this page
// only; every other /local/ path still goes to the Amazon routes. Uploading a
// file finds what its columns hold as on Amazon (or asks for them), and keeps
// it, its rows, the pictures in its cells and the columns chosen only in
// data/flipkart/; they show again after a restart. Temporary data folders and
// a Live Amazon Browser that is never used: nothing reaches Amazon, Flipkart,
// Google or any other website.
// Run: node test/flipkart-routes.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import net from 'node:net';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { createHandler, createSessions, bearerOf } from '../serve.mjs';
import { createFlipkartRoutes } from '../flipkart/routes.js';
import { MAX_SHEET_BYTES } from '../flipkart/store.js';
import { createStore } from '../amazon/store.js';
import { createAmazonRoutes } from '../amazon/routes.js';
import { FILE, HEADER, orderId, orderShot, deliveryShot, reviewLink, reviewShot, person } from './fixtures/flipkart/make-flipkart.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = readFileSync(FILE);
const TOO_BIG = 'The file is larger than 50 megabytes, so save a smaller copy (only the Flipkart tab, for example), then upload that.';

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
        resolve({ status: res.statusCode, headers: res.headers, text, json });
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
  assert.deepEqual((await call('GET', '/local/flipkart/sheet')).json, { sheet: null, rows: [] }, 'nothing was kept by any of these');
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

test("npm start plugs Flipkart's routes in beside the Amazon routes, with the same session token and the same data folder", () => {
  const src = readFileSync(join(ROOT, 'serve.mjs'), 'utf8');
  assert.match(src, /const \{ createFlipkartRoutes \} = await import\('\.\/flipkart\/routes\.js'\);/);
  assert.match(src, /const local = createAmazonRoutes\(\{[^\n]*auth: \(req\) => sessions\.verify\(bearerOf\(req\)\) \}\);/);
  assert.match(src, /const flipkart = createFlipkartRoutes\(\{ dataDir, log, auth: \(req\) => sessions\.verify\(bearerOf\(req\)\) \}\);/);
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
  ]);
  assert.deepEqual(rows.map((r) => [r.n, r.label, r.orderId, r.orderDate, r.amount, r.product]), [
    [1, 'Row 1', orderId(2), '20-07-2026', '₹349', 'Test Brand Steel Bottle'],
    [2, 'Row 2', orderId(3), '21-07-2026', '₹499', 'Test Brand Lunch Box'],
    [3, 'Row 3', orderId(4), '22-07-2026', '₹349.50', 'Test Brand Steel Bottle'],
    [4, 'Row 4', orderId(6), '23-07-2026', '₹499', 'Test Brand Lunch Box'],
    [5, 'Row 5', '', '', '', ''],
  ], 'numbered from 1');
  assert.deepEqual(rows[0].shots.order, { text: 'Screenshot', link: orderShot(2), links: [orderShot(2)], labels: [{ link: orderShot(2), label: 'Google Drive' }], words: 'Screenshot', mismatch: null, how: null });
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
  assert.deepEqual(reloaded.json, { sheet, rows });
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
  assert.deepEqual([old.status, old.json], [200, { sheet: null, rows: [], uploadAgain: true }]);
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
  // And no Flipkart file has a way to reach a website: no web, browser or program tools, and no fetch. The one
  // exception is the Live Flipkart Browser (flipkart/browser.js), which reads campaigns' products: it alone may
  // use the browser tool, and it has none of the others.
  for (const f of readdirSync(join(ROOT, 'flipkart'))) {
    const src = readFileSync(join(ROOT, 'flipkart', f), 'utf8');
    const browserTool = "import { chromium } from 'playwright-core';";
    if (f === 'browser.js') assert.ok(src.includes(browserTool), 'the Live Flipkart Browser uses the browser tool');
    assert.doesNotMatch(f === 'browser.js' ? src.replace(browserTool, '') : src, /from 'node:(?:https?|http2|net|tls|dgram|child_process)'|playwright|\bfetch\(|XMLHttpRequest|WebSocket|request\.fetch/, f);
  }
});
