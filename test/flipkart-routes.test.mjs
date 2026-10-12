// Flipkart's routes, over HTTP, through serve.mjs: every path under
// /local/flipkart/ goes to flipkart/routes.js (the status, ready: false, and
// the uploaded file's rows), with the page's session token and from this page
// only; every other /local/ path still goes to the Amazon routes. Uploading a
// file keeps it and its rows only in data/flipkart/, and they show again after
// a restart. Temporary data folders and a Live Amazon Browser that is never
// used: nothing reaches Amazon, Flipkart, Google or any other website.
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
import { FILE, HEADER, orderId, orderShot, deliveryShot, person } from './fixtures/flipkart/make-flipkart.mjs';

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

/** A multipart form, as the page sends it: the file, and any other fields (the tab chosen). */
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
  assert.deepEqual((await call('GET', '/local/flipkart/sheet')).json, { sheet: null, headers: [], rows: [] }, 'nothing was kept by any of these');
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

test('uploading the made-up file keeps the file and its rows only in data/flipkart/, for this user only, and they show again after a restart', async () => {
  const { dir, at } = await fresh();
  const up = await upload(at, 'flipkart-orders.xlsx', FIXTURE);
  assert.equal(up.status, 200, up.text);
  assert.deepEqual({ ...up.json.sheet, uploadedAt: typeof up.json.sheet.uploadedAt }, { fileName: 'flipkart-orders.xlsx', kind: 'xlsx', tab: 'Flipkart', rowCount: 5, uploadedAt: 'string' });
  assert.deepEqual(up.json.headers, HEADER);
  assert.deepEqual(up.json.rows.map((r) => r.n), [1, 2, 3, 4, 5], 'numbered from 1');
  assert.ok(up.json.rows.every((r) => r.cells.length === HEADER.length), 'every row has every column');
  const first = up.json.rows[0].cells;
  assert.deepEqual([first[0], first[4], first[5], first[6]], [{ parts: [{ text: orderId(2) }] }, { parts: [{ text: person(2) }] }, { parts: [{ text: 'Screenshot' }, { text: ' ' }, { link: orderShot(2) }] }, { parts: [{ link: deliveryShot(2) }] }]);
  assert.deepEqual(up.json.rows[1].cells[5], { parts: [], picture: true }, 'a picture inside a cell');
  assert.deepEqual(filesIn(dir), ['flipkart/rows.json', 'flipkart/upload.xlsx'], 'nothing anywhere else in the data folder');
  assert.ok(readFileSync(join(dir, 'flipkart', 'upload.xlsx')).equals(FIXTURE), 'the file as it was uploaded');
  assert.equal(statSync(join(dir, 'flipkart')).mode & 0o777, 0o700);
  for (const f of ['rows.json', 'upload.xlsx']) assert.equal(statSync(join(dir, 'flipkart', f)).mode & 0o777, 0o600, f);
  // The dashboard started again, on the same data folder: the same rows, with nothing uploaded again.
  const again = await fresh(dir);
  const reloaded = await call('GET', '/local/flipkart/sheet', { at: again.at });
  assert.equal(reloaded.status, 200);
  assert.deepEqual(reloaded.json, up.json);
});

test('several tabs and none named "Flipkart": the tabs are named and nothing is kept; the chosen tab is read and kept', async () => {
  const { dir, at } = await fresh();
  const head = ['Order ID', 'Product'];
  const several = await workbook({ Orders: [head, [orderId(2), 'Test Bottle']], Returns: [head, [orderId(3), 'Test Lid'], [orderId(4), 'Test Jar']] });
  const asked = await upload(at, 'two tabs.xlsx', several);
  assert.deepEqual([asked.status, asked.json], [200, { chooseTab: { tabs: ['Orders', 'Returns'], says: 'This file has no tab named "Flipkart", and it has 2 tabs: "Orders" and "Returns". Choose the tab with the orders.' } }]);
  assert.deepEqual(filesIn(dir), [], 'nothing kept yet');
  const chosen = await upload(at, 'two tabs.xlsx', several, { tab: 'Returns' });
  assert.equal(chosen.status, 200, chosen.text);
  assert.deepEqual([chosen.json.sheet.tab, chosen.json.sheet.rowCount, chosen.json.rows.map((r) => r.cells[0].parts[0].text)], ['Returns', 2, [orderId(3), orderId(4)]]);
  const wrong = await upload(at, 'two tabs.xlsx', several, { tab: 'Nope' });
  assert.deepEqual([wrong.status, wrong.json.message], [400, 'This file has no tab named "Nope". Its tabs are "Orders" and "Returns".']);
  assert.equal((await call('GET', '/local/flipkart/sheet', { at })).json.sheet.tab, 'Returns', 'the rows kept before stay');
});

test('a CSV file is kept in place of the Excel file, with no tab', async () => {
  const { dir, at } = await fresh();
  assert.equal((await upload(at, 'flipkart-orders.xlsx', FIXTURE)).status, 200);
  const csv = await upload(at, 'flipkart orders.csv', Buffer.from(`Order ID,Reviewer Name\n${orderId(2)},${person(2)}\n`));
  assert.equal(csv.status, 200, csv.text);
  assert.deepEqual([csv.json.sheet.fileName, csv.json.sheet.kind, csv.json.sheet.tab, csv.json.sheet.rowCount], ['flipkart orders.csv', 'csv', null, 1]);
  assert.deepEqual(filesIn(dir), ['flipkart/rows.json', 'flipkart/upload.csv'], 'the Excel file before is gone');
});

test('a file that is too big is refused in plain words, and the rows kept before stay', async () => {
  const { at } = await fresh();
  const before = await upload(at, 'flipkart-orders.xlsx', FIXTURE);
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
