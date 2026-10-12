// Flipkart's campaign routes, over HTTP, through serve.mjs, with a pretend
// Live Flipkart Browser that opens no window and no website: adding a
// campaign and its products read one at a time after it is saved (a product
// link, a product ID alone), a robot check, a block or an error stopping the
// reading ("Flipkart prevented this check"), a page that is not a product,
// changing, ending and deleting a campaign, the form's checks, waiting while
// products are read, and the same safety as the other Flipkart routes. Kept
// only in data/flipkart/campaigns.json. Made-up campaigns and products only.
// Run: node test/flipkart-campaign-routes.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler, createSessions, bearerOf } from '../serve.mjs';
import { createFlipkartRoutes } from '../flipkart/routes.js';
import { PREVENTED_SAYS, ADD_LINK_SAYS, CAMPAIGN_KEY } from '../flipkart/campaigns.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AT = '2026-10-12T05:00:00.000Z';

const temps = [];
after(() => Promise.all(temps.map((d) => rm(d, { recursive: true, force: true }))));
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'arc-flipkart-campaigns-'));
  temps.push(d);
  return d;
};

const sessions = createSessions();
const auth = (req) => sessions.verify(bearerOf(req));
const TOKEN = sessions.get().token;

const GLOW = 'https://www.flipkart.com/test-glow-face-mask/p/itmtestglow0001?pid=FCPTESTGLOW00001';
const CLAY_PID = 'FCPTESTCLAY00001';
const CLAY_BY_ID = 'https://www.flipkart.com/product/p/itme?pid=FCPTESTCLAY00001';
const JAR = 'https://www.flipkart.com/test-jar/p/itmtestjar00001?pid=FCPTESTJAR000001';
const SEARCH = 'https://www.flipkart.com/search?q=face%20mask';
const MISSING_PID = 'FCPTESTMISS00001';

/** The made-up products the pretend Flipkart shows, by product ID. */
const MADE_UP = {
  FCPTESTGLOW00001: { name: 'Test Glow Face Mask', brand: 'Test Glow', slug: 'test-glow-face-mask', itemId: 'itmtestglow0001', rating: 4.1, ratings: 120, reviews: 12 },
  FCPTESTCLAY00001: { name: 'Test Clay Face Mask', brand: null, slug: 'test-clay-face-mask', itemId: 'itmtestclay0001', rating: 3.9, ratings: 8, reviews: 0 },
  FCPTESTJAR000001: { name: 'Test Jar', brand: 'Test Home', slug: 'test-jar', itemId: 'itmtestjar00001', rating: null, ratings: null, reviews: null },
};
const page = (url, facts = {}, status = 200) => ({ ok: true, status, url, facts: { url, title: 'Flipkart', text: '', canonical: null, product: null, reviewLinks: [], robotFrame: false, robotForm: false, ...facts } });
/** What the pretend Live Flipkart Browser reads at an address: a made-up product page, Flipkart's "page not found", or a search page. */
function pageOf(url) {
  const u = new URL(url);
  const pid = u.searchParams.get('pid');
  const p = MADE_UP[pid];
  if (u.pathname === '/search') return page(url, { title: 'Face Mask - Buy Products Online at Best Price in India - All Categories | Flipkart.com', text: 'Showing 1 to 2 of 2 results' });
  if (!p) return page(url, { title: 'Flipkart.com', text: 'Unfortunately the page you are looking for has been moved or deleted' }, 404);
  return page(url, {
    title: `${p.name} - Price in India, Buy ${p.name} Online In India | Flipkart.com`,
    canonical: `https://www.flipkart.com/${p.slug}/p/${p.itemId}`,
    product: { name: p.name, brand: p.brand, sku: pid, rating: p.rating, ratings: p.ratings, reviews: p.reviews },
    reviewLinks: p.ratings || p.reviews ? [`https://www.flipkart.com/${p.slug}/product-reviews/${p.itemId}?pid=${pid}&lid&marketplace=FLIPKART`] : [],
  });
}
const allReviews = (pid) => `https://www.flipkart.com/${MADE_UP[pid].slug}/product-reviews/${MADE_UP[pid].itemId}?pid=${pid}&marketplace=FLIPKART`;

/** A pretend Live Flipkart Browser: every address it is asked to open, a page that shows a robot check, a block or an error (stops), and a wait the next page holds for (hold). */
function fakeBrowser() {
  const b = {
    opened: [],
    begun: 0,
    closed: 0,
    stops: new Map(),
    hold: null,
    async begin() {
      b.begun++;
    },
    async open(url) {
      b.opened.push(url);
      if (b.hold) await b.hold;
      const stop = b.stops.get(url);
      if (stop === 'captcha') return page(url, { text: 'Are you a human?\nPlease confirm that you are a human.' });
      if (stop === 'blocked') return page(url, { title: 'Access Denied', text: "Access Denied\nYou don't have permission to access this page on this server." }, 403);
      if (stop === 'error') return page(url, { text: 'Something went wrong!\nPlease try again later.' }, 500);
      if (stop === 'network') return { ok: false, error: 'network', message: 'The page could not be opened.' };
      return pageOf(url);
    },
    async close() {
      b.closed++;
    },
  };
  return b;
}

/** A Flipkart dashboard of its own: a data folder, the routes with a pretend browser, and a server. */
async function fresh(browser = fakeBrowser(), dir = tempDir()) {
  const routes = createFlipkartRoutes({ dataDir: dir, auth, browser, now: () => new Date(AT) });
  const server = createServer(createHandler({ root: ROOT, sessions, flipkart: routes }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  after(() => {
    server.closeAllConnections();
    server.close();
  });
  return { dir, at: server.address().port, browser, routes };
}

function call(at, method, path, { token = TOKEN, site = 'same-origin', json, body = null, type = null } = {}) {
  if (json !== undefined) {
    body = Buffer.from(JSON.stringify(json));
    type = 'application/json';
  }
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
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json: parsed });
      });
    });
    req.on('error', reject);
    req.end(body ?? undefined);
  });
}

const campaigns = (at) => call(at, 'GET', '/local/flipkart/campaigns');
const add = (at, json) => call(at, 'POST', '/local/flipkart/campaigns', { json });
/** The campaigns once their products are no longer being read. */
async function readingDone(at) {
  for (let i = 0; i < 1000; i++) {
    const r = await campaigns(at);
    if (!r.json.reading) return r.json;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The products were still being read.');
}

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

test('adding a campaign: its Campaign ID, name, live or ended and products are kept only in data/flipkart/campaigns.json, and each product is read from its Flipkart page, one at a time', async () => {
  const { dir, at, browser } = await fresh();
  const added = await add(at, { campaignId: 'FK-TEST-1', name: 'Test Glow', live: true, products: `${GLOW}\n${CLAY_PID}` });
  assert.equal(added.status, 201, added.text);
  assert.equal(added.json.reading, true, 'its products are being read');
  assert.deepEqual(added.json.campaign.products.map((p) => [p.given, p.state]), [[GLOW, 'waiting'], [CLAY_PID, 'waiting']]);
  const done = await readingDone(at);
  const [c] = done.campaigns;
  assert.deepEqual({ ...c, key: CAMPAIGN_KEY.test(c.key), updatedAt: typeof c.updatedAt }, {
    key: true,
    campaignId: 'FK-TEST-1',
    name: 'Test Glow',
    live: true,
    updatedAt: 'string',
    products: [
      { given: GLOW, state: 'read', name: 'Test Glow Face Mask', brand: 'Test Glow', pid: 'FCPTESTGLOW00001', itemId: 'itmtestglow0001', rating: 4.1, ratings: 120, reviews: 12, allReviews: allReviews('FCPTESTGLOW00001'), at: AT, says: null, prevented: false },
      { given: CLAY_PID, state: 'read', name: 'Test Clay Face Mask', brand: null, pid: CLAY_PID, itemId: 'itmtestclay0001', rating: 3.9, ratings: 8, reviews: 0, allReviews: allReviews(CLAY_PID), at: AT, says: null, prevented: false },
    ],
  });
  assert.deepEqual(browser.opened, [GLOW, CLAY_BY_ID], "one page for each product; the product ID alone opened as Flipkart's page for it");
  assert.deepEqual(filesIn(dir), ['flipkart/campaigns.json'], 'nothing anywhere else in the data folder');
  assert.equal(statSync(join(dir, 'flipkart')).mode & 0o777, 0o700);
  assert.equal(statSync(join(dir, 'flipkart', 'campaigns.json')).mode & 0o777, 0o600);
  const kept = JSON.parse(readFileSync(join(dir, 'flipkart', 'campaigns.json'), 'utf8')).campaigns[0];
  assert.deepEqual(Object.keys(kept).sort(), ['campaignId', 'createdAt', 'key', 'live', 'name', 'products', 'updatedAt']);
  assert.deepEqual({ ...kept.products[1], read: Object.keys(kept.products[1].read) }, { given: CLAY_PID, url: CLAY_BY_ID, pid: CLAY_PID, itemId: 'itmtestclay0001', byId: true, read: ['at', 'name', 'brand', 'pid', 'itemId', 'rating', 'ratings', 'reviews', 'allReviews'], problem: null });
  // The dashboard started again on the same data folder: the same campaigns, with no page opened.
  const again = await fresh(fakeBrowser(), dir);
  assert.deepEqual((await campaigns(again.at)).json, done);
  assert.deepEqual(again.browser.opened, []);
});

test('a product ID alone that opens no product page: "Add this product\'s link instead"; a page that is not a product is said plainly; the others are still read', async () => {
  const { at, browser } = await fresh();
  assert.equal((await add(at, { campaignId: 'FK-TEST-2', products: `${MISSING_PID}\n${SEARCH}\n${JAR}` })).status, 201);
  const done = await readingDone(at);
  assert.deepEqual(done.campaigns[0].products.map((p) => [p.given, p.state, p.says]), [
    [MISSING_PID, 'not read', ADD_LINK_SAYS],
    [SEARCH, 'not read', 'This link does not open a product page on Flipkart, so this product was not read.'],
    [JAR, 'read', null],
  ]);
  assert.deepEqual(done.campaigns[0].products[2], { given: JAR, state: 'read', name: 'Test Jar', brand: 'Test Home', pid: 'FCPTESTJAR000001', itemId: 'itmtestjar00001', rating: null, ratings: null, reviews: null, allReviews: null, at: AT, says: null, prevented: false }, 'no stars, ratings or reviews yet');
  assert.deepEqual(browser.opened, [`https://www.flipkart.com/product/p/itme?pid=${MISSING_PID}`, SEARCH, JAR]);
  assert.equal(done.campaigns[0].name, '', 'the name may be left out');
});

test('a robot check, a block or an error stops the reading: "Flipkart prevented this check", the product is not read, the ones after it are not read yet, and "Read the products again" reads them; a page that cannot be opened at all stops it too', async () => {
  const SAYS = { ...PREVENTED_SAYS, network: 'The Live Flipkart Browser could not open the page, so this product was not read and the reading stopped. The page could not be opened.' };
  for (const kind of ['captcha', 'blocked', 'error', 'network']) {
    const browser = fakeBrowser();
    browser.stops.set(CLAY_BY_ID, kind);
    const { at } = await fresh(browser);
    assert.equal((await add(at, { campaignId: `FK-STOP-${kind}`, products: [GLOW, CLAY_PID, JAR].join('\n') })).status, 201);
    const done = await readingDone(at);
    const [c] = done.campaigns;
    assert.deepEqual(c.products.map((p) => [p.state, p.says, p.prevented]), [['read', null, false], ['stopped', SAYS[kind], kind !== 'network'], ['waiting', null, false]], kind);
    assert.deepEqual(browser.opened, [GLOW, CLAY_BY_ID], `${kind}: no other page is opened`);
    // Flipkart shows the page again later: "Read the products again" reads only the products not read.
    browser.stops.clear();
    const again = await call(at, 'POST', `/local/flipkart/campaigns/${c.key}/read`, { json: {} });
    assert.deepEqual([again.status, again.json.reading], [200, true], kind);
    assert.deepEqual((await readingDone(at)).campaigns[0].products.map((p) => p.state), ['read', 'read', 'read'], kind);
    assert.deepEqual(browser.opened, [GLOW, CLAY_BY_ID, CLAY_BY_ID, JAR], kind);
  }
});

test('changing a campaign keeps what was read for a product typed before and reads only the new one; ending and deleting it', async () => {
  const { dir, at, browser } = await fresh();
  const added = await add(at, { campaignId: 'FK-TEST-4', name: 'Test Glow', live: true, products: GLOW });
  const key = added.json.campaign.key;
  await readingDone(at);
  const changed = await call(at, 'POST', `/local/flipkart/campaigns/${key}`, { json: { campaignId: 'FK-TEST-4', name: 'Test Glow and Jar', live: true, products: `${GLOW}\n${JAR}` } });
  assert.equal(changed.status, 200, changed.text);
  assert.deepEqual([changed.json.campaign.key, changed.json.campaign.name], [key, 'Test Glow and Jar']);
  assert.deepEqual(changed.json.campaign.products.map((p) => [p.given, p.state]), [[GLOW, 'read'], [JAR, 'waiting']]);
  await readingDone(at);
  assert.deepEqual(browser.opened, [GLOW, JAR], 'only the new product is read');
  const ended = await call(at, 'POST', `/local/flipkart/campaigns/${key}/end`, { json: {} });
  assert.deepEqual([ended.status, ended.json.campaigns[0].live, ended.json.campaigns[0].products.map((p) => p.state)], [200, false, ['read', 'read']]);
  const deleted = await call(at, 'POST', `/local/flipkart/campaigns/${key}/delete`, { json: {} });
  assert.deepEqual([deleted.status, deleted.json], [200, { campaigns: [], reading: false }]);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'flipkart', 'campaigns.json'), 'utf8')), { campaigns: [] });
  for (const path of [`/local/flipkart/campaigns/${key}`, `/local/flipkart/campaigns/${key}/end`]) {
    const gone = await call(at, 'POST', path, { json: { campaignId: 'FK-TEST-4', products: GLOW } });
    assert.deepEqual([gone.status, gone.json.message], [404, 'This campaign is no longer saved. Reload the page.'], path);
  }
});

test("the form is checked in plain words: the Campaign ID is needed and must be the campaign's own, the name is not too long, and the products are Flipkart links or product IDs", async () => {
  const { dir, at } = await fresh();
  const say = async (json) => {
    const r = await add(at, json);
    return [r.status, r.json.message];
  };
  assert.deepEqual(await say({ campaignId: '  ', products: GLOW }), [400, 'Write the Campaign ID.']);
  assert.deepEqual(await say({ campaignId: 'X'.repeat(61), products: GLOW }), [400, 'The Campaign ID is too long: at most 60 letters.']);
  assert.deepEqual(await say({ campaignId: 'FK-TEST-5', name: 'N'.repeat(81), products: GLOW }), [400, "The campaign's name is too long: at most 80 letters."]);
  assert.deepEqual(await say({ campaignId: 'FK-TEST-5', products: '  \n ' }), [400, 'Write at least one product: a Flipkart link or a Flipkart product ID on each line.']);
  assert.deepEqual(await say({ campaignId: 'FK-TEST-5', products: 'Test Glow Face Mask\nhttps://www.amazon.in/dp/B0TESTKIT9' }), [400, 'Line 1 of the products, "Test Glow Face Mask", is not a Flipkart link or a Flipkart product ID. Line 2 of the products is a link to www.amazon.in, not to Flipkart, so it cannot be used.']);
  const notJson = await call(at, 'POST', '/local/flipkart/campaigns', { body: Buffer.from('campaignId=FK-TEST-5'), type: 'text/plain' });
  assert.deepEqual([notJson.status, notJson.json.message], [415, 'The request could not be read. Reload the page, then try again.']);
  const broken = await call(at, 'POST', '/local/flipkart/campaigns', { body: Buffer.from('{'), type: 'application/json' });
  assert.deepEqual([broken.status, broken.json.message], [400, 'The request could not be read. Reload the page, then try again.']);
  const big = await add(at, { campaignId: 'FK-TEST-5', products: 'x'.repeat(70 * 1024) });
  assert.deepEqual([big.status, big.json?.message], [413, 'That is too large to send here.']);
  assert.deepEqual(filesIn(dir), [], 'nothing was kept');
  assert.equal((await add(at, { campaignId: 'FK-TEST-5', products: GLOW })).status, 201);
  await readingDone(at);
  assert.deepEqual(await say({ campaignId: ' fk-test-5 ', products: JAR }), [400, 'A campaign with the Campaign ID "fk-test-5" is already saved. Change that campaign, or write another Campaign ID.'], 'whatever its capitals');
  assert.equal((await campaigns(at)).json.campaigns.length, 1);
});

test('while products are read, Save, End, Delete and "Read the products again" wait, in plain words, and nothing changes', async () => {
  const browser = fakeBrowser();
  let release = null;
  browser.hold = new Promise((resolve) => (release = resolve));
  const { at } = await fresh(browser);
  const added = await add(at, { campaignId: 'FK-TEST-6', products: GLOW });
  const key = added.json.campaign.key;
  const wait = (button) => `The products of a campaign are being read from Flipkart. Wait for it to finish, then press ${button}.`;
  const saved = await add(at, { campaignId: 'FK-TEST-7', products: JAR });
  assert.deepEqual([saved.status, saved.json.message], [409, wait('Save')]);
  for (const [action, button] of [['end', '"End campaign"'], ['delete', 'Delete'], ['read', '"Read the products again"']]) {
    const r = await call(at, 'POST', `/local/flipkart/campaigns/${key}/${action}`, { json: {} });
    assert.deepEqual([r.status, r.json.message], [409, wait(button)], action);
  }
  while (!browser.opened.length) await new Promise((resolve) => setTimeout(resolve, 5));
  const during = (await campaigns(at)).json;
  assert.deepEqual([during.reading, during.campaigns[0].products[0].state], [true, 'reading']);
  release();
  const done = await readingDone(at);
  assert.deepEqual([done.campaigns.length, done.campaigns[0].live, done.campaigns[0].products[0].state], [1, true, 'read']);
});

test('the dashboard stopping while products are read: the Live Flipkart Browser is closed and no other product is read', async () => {
  const browser = fakeBrowser();
  let release = null;
  browser.hold = new Promise((resolve) => (release = resolve));
  const { at, routes } = await fresh(browser);
  assert.equal((await add(at, { campaignId: 'FK-TEST-11', products: [GLOW, JAR].join('\n') })).status, 201);
  while (!browser.opened.length) await new Promise((resolve) => setTimeout(resolve, 5));
  await routes.close();
  assert.equal(browser.closed, 1, 'closed properly');
  release();
  const done = await readingDone(at);
  assert.deepEqual(browser.opened, [GLOW], 'no other page is opened');
  assert.deepEqual(done.campaigns[0].products.map((p) => p.state), ['read', 'waiting'], 'the rest stay not read yet');
});

test('two campaigns saved at the same moment: one is kept and read, the other waits, in plain words', async () => {
  const browser = fakeBrowser();
  let release = null;
  browser.hold = new Promise((resolve) => (release = resolve));
  const { at } = await fresh(browser);
  const both = await Promise.all([add(at, { campaignId: 'FK-TEST-9', products: GLOW }), add(at, { campaignId: 'FK-TEST-10', products: JAR })]);
  assert.deepEqual(both.map((r) => r.status).sort(), [201, 409]);
  assert.equal(both.find((r) => r.status === 409).json.message, 'The products of a campaign are being read from Flipkart. Wait for it to finish, then press Save.');
  release();
  const done = await readingDone(at);
  assert.equal(done.campaigns.length, 1);
  assert.deepEqual(done.campaigns[0].products.map((p) => p.state), ['read'], 'the one kept is read');
});

test('the campaign routes have the same safety: the session token, this page only, only GET, HEAD and POST; a refused request keeps nothing', async () => {
  const { dir, at } = await fresh();
  const KEY = 'f000000000001';
  for (const [method, path, opts] of [['GET', '/local/flipkart/campaigns', {}], ['POST', '/local/flipkart/campaigns', { json: { campaignId: 'FK-TEST-8', products: GLOW } }], ['POST', `/local/flipkart/campaigns/${KEY}/end`, { json: {} }]]) {
    assert.equal((await call(at, method, path, { ...opts, token: null })).status, 401, `${method} ${path} with no token`);
    assert.equal((await call(at, method, path, { ...opts, token: 'not.a.token' })).status, 401, `${method} ${path} with a wrong token`);
    assert.equal((await call(at, method, path, { ...opts, site: 'cross-site' })).status, 403, `${method} ${path} from another website`);
  }
  const put = await call(at, 'PUT', '/local/flipkart/campaigns');
  assert.deepEqual([put.status, put.headers.allow], [405, 'GET, HEAD, POST']);
  const remove = await call(at, 'DELETE', `/local/flipkart/campaigns/${KEY}`);
  assert.deepEqual([remove.status, remove.headers.allow], [405, 'POST']);
  assert.equal((await call(at, 'GET', `/local/flipkart/campaigns/${KEY}`)).status, 404, 'a campaign is never got alone');
  assert.equal((await call(at, 'POST', '/local/flipkart/campaigns/not-a-key', { json: {} })).status, 404);
  assert.equal((await call(at, 'POST', `/local/flipkart/campaigns/${KEY}/start`, { json: {} })).status, 404);
  assert.deepEqual((await call(at, 'POST', `/local/flipkart/campaigns/${KEY}/end`, { json: {} })).json.message, 'This campaign is no longer saved. Reload the page.');
  const head = await call(at, 'HEAD', '/local/flipkart/campaigns');
  assert.deepEqual([head.status, head.text], [200, '']);
  const got = await campaigns(at);
  assert.deepEqual([got.json, got.headers['access-control-allow-origin']], [{ campaigns: [], reading: false }, undefined], 'no CORS header');
  assert.equal(readdirSync(dir).includes('flipkart'), false, 'not even the folder');
});

test('the Live Flipkart Browser opens only when a product is read, never when the routes start or a campaign is looked at, and it is closed when the dashboard stops', async () => {
  const dir = tempDir();
  // The real routes; the window they would make only counts, and refuses.
  let made = 0;
  const routes = createFlipkartRoutes({
    dataDir: dir,
    auth,
    makeBrowser: () => {
      made++;
      throw new Error('No window may open in a test.');
    },
  });
  const server = createServer(createHandler({ root: ROOT, sessions, flipkart: routes }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  after(() => {
    server.closeAllConnections();
    server.close();
  });
  const at = server.address().port;
  assert.deepEqual((await campaigns(at)).json, { campaigns: [], reading: false });
  assert.equal((await add(at, { campaignId: '', products: GLOW })).status, 400);
  assert.equal(readdirSync(dir).includes('flipkart'), false, 'no profile');
  await routes.close();
  assert.equal(made, 0, 'no window was made, not even to close it');
  const browser = fakeBrowser();
  await createFlipkartRoutes({ dataDir: tempDir(), auth, browser }).close();
  assert.equal(browser.closed, 1, 'close() closes the Live Flipkart Browser');
  const src = readFileSync(join(ROOT, 'serve.mjs'), 'utf8');
  assert.match(src, /await Promise\.allSettled\(\[live\.close\(\), images\.close\(\), flipkart\.close\(\)\]\);/, 'serve.mjs closes it when the dashboard stops, with the others');
});
