// Flipkart's routes, over HTTP, through serve.mjs: every path under
// /local/flipkart/ goes to flipkart/routes.js, which for now answers only
// /local/flipkart/status (ready: false), with the page's session token and
// from this page only; every other /local/ path still goes to the Amazon
// routes. A temporary data folder and a Live Amazon Browser that is never
// used: nothing reaches Amazon, Flipkart, Google or any other website.
// Run: node test/flipkart-routes.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler, createSessions, bearerOf } from '../serve.mjs';
import { createFlipkartRoutes } from '../flipkart/routes.js';
import { createStore } from '../amazon/store.js';
import { createAmazonRoutes } from '../amazon/routes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(join(tmpdir(), 'arc-flipkart-'));
after(() => rm(dataDir, { recursive: true, force: true }));
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
const port = await serve({ local: watch('amazon', amazonRoutes), flipkart: watch('flipkart', createFlipkartRoutes({ auth })) });
const TOKEN = sessions.get().token;

function call(method, path, { token = TOKEN, site = 'same-origin', at = port } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: 'localhost:8093' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (site) headers['Sec-Fetch-Site'] = site;
    const req = request({ host: '127.0.0.1', port: at, path, method, headers }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
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
    req.end();
  });
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

test("every other /local/ path still goes to the Amazon routes, and no /local/flipkart/ path ever does", async () => {
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
  await call('POST', '/local/flipkart/check');
  assert.deepEqual(handed.flipkart, ['/local/flipkart/status', '/local/flipkart/check']);
  assert.equal(handed.amazon.length, 4, 'the Amazon routes are handed none of them');
});

test("without Flipkart's routes, /local/flipkart/ paths are not found and the Amazon routes still answer", async () => {
  const at = await serve({ local: amazonRoutes });
  assert.deepEqual([(await call('GET', '/local/flipkart/status', { at })).status, (await call('GET', '/local/amazon/campaigns', { at })).status], [404, 200]);
});

test("npm start plugs Flipkart's routes in beside the Amazon routes, with the same session token", () => {
  const src = readFileSync(join(ROOT, 'serve.mjs'), 'utf8');
  assert.match(src, /const \{ createFlipkartRoutes \} = await import\('\.\/flipkart\/routes\.js'\);/);
  assert.match(src, /const local = createAmazonRoutes\(\{[^\n]*auth: \(req\) => sessions\.verify\(bearerOf\(req\)\) \}\);/);
  assert.match(src, /const flipkart = createFlipkartRoutes\(\{ auth: \(req\) => sessions\.verify\(bearerOf\(req\)\) \}\);/);
  assert.match(src, /createServer\(createHandler\(\{ sessions, local, flipkart \}\)\)/);
});
