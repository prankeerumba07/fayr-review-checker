// The Live Flipkart Browser (flipkart/browser.js) reading pretend Flipkart
// pages in a hidden Chrome of the test's own, so nothing reaches Flipkart
// (test/fixtures/flipkart/fake-flipkart.mjs): the saved product page (the one
// real page, with every reviewer's name made up), a product ID alone, a robot
// check, a block, an error, and a page that is not a product. One page at a
// time, at least 3 seconds apart; its own profile, never Amazon's; signed out
// each time it opens.
// Run: node test/flipkart-browser.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlipkartBrowser, createGate, LIVE_BROWSER_NAME, ONLY_FLIPKART_NAMES } from '../flipkart/browser.js';
import { whatPageIs, productOnPage } from '../flipkart/page-read.js';
import { productLines, readProduct, PREVENTED_SAYS, ADD_LINK_SAYS } from '../flipkart/campaigns.js';
import { fakeFlipkart, PRODUCT, URLS } from './fixtures/flipkart/fake-flipkart.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(join(tmpdir(), 'arc-flipkart-live-'));
const site = fakeFlipkart();
const live = new FlipkartBrowser({ dataDir, headless: true, routes: site.handler, gate: createGate() });
after(async () => {
  await live.close();
  await rm(dataDir, { recursive: true, force: true });
});

const AT = '2026-10-12T05:00:00.000Z';
const now = () => new Date(AT);
const product = (line) => ({ ...productLines(line).products[0], read: null, problem: null });
const READ = { at: AT, name: PRODUCT.name, brand: PRODUCT.brand, pid: PRODUCT.pid, itemId: PRODUCT.itemId, rating: PRODUCT.rating, ratings: PRODUCT.ratings, reviews: PRODUCT.reviews, allReviews: PRODUCT.allReviews };

test('the saved product page, read in the Live Flipkart Browser: its name, brand, product ID, item ID, stars, ratings and reviews, and the link to all its reviews', { timeout: 120_000 }, async () => {
  await live.begin();
  const res = await live.open(URLS.product);
  assert.deepEqual([res.ok, res.status, res.url], [true, 200, URLS.product]);
  assert.deepEqual(whatPageIs(res.facts, res.status), { kind: 'page', why: null }, 'a product page, not a robot check, though its reviews say many things');
  assert.deepEqual(productOnPage(res.facts), { name: PRODUCT.name, brand: 'Renee', pid: 'FCPHEW7AM9C7RU24', itemId: 'itm50a9094e8e73a', rating: 4.2, ratings: 1355, reviews: 47, allReviews: PRODUCT.allReviews });
  const link = product(URLS.product);
  assert.deepEqual(await readProduct(live, link, { now }), { product: { ...link, read: READ, problem: null }, stop: null }, 'and as a campaign keeps it');
});

test('a product ID alone: Flipkart\'s page for that ID is read; when no product page opens from it, "Add this product\'s link instead"', { timeout: 120_000 }, async () => {
  const byId = product('FCPHEW7AM9C7RU24');
  assert.equal(byId.url, URLS.byId);
  const read = await readProduct(live, byId, { now });
  assert.deepEqual(read.product.read, READ, 'the item ID comes from the page');
  const missing = product('FCPHTESTMISS0001');
  assert.deepEqual((await readProduct(live, missing, { now })).product.problem, { says: ADD_LINK_SAYS, at: AT, final: true });
});

test('a robot check, a block and an error: "Flipkart prevented this check", and the product is not read', { timeout: 120_000 }, async () => {
  for (const [kind, url] of [['captcha', URLS.robot], ['blocked', URLS.blocked], ['error', URLS.error]]) {
    const out = await readProduct(live, product(url), { now });
    assert.deepEqual([out.stop, out.product.read, out.product.problem], [kind, null, { says: PREVENTED_SAYS[kind], at: AT, retry: true, stop: kind }], kind);
  }
});

test('a page that is not a product is said in plain words; and every page is opened signed out, even after a login made by hand in the window', { timeout: 120_000 }, async () => {
  // A login left in the window by hand (a cookie) is gone before the next page opens.
  await live.context.addCookies([{ name: 'test-login', value: 'made-up', domain: '.flipkart.com', path: '/', expires: Math.floor(Date.now() / 1000) + 3600 }]);
  const out = await readProduct(live, product(URLS.search), { now });
  assert.deepEqual([out.stop, out.product.problem], [null, { says: 'This link does not open a product page on Flipkart, so this product was not read.', at: AT, final: true }]);
  assert.deepEqual(await live.context.cookies('https://www.flipkart.com/'), [], 'signed out');
});

test("one page at a time, at least 3 seconds apart; one window with its own profile in data/flipkart/browser-profile, never Amazon's; signed out each time it opens; only Flipkart's names can be found; nothing reached Flipkart; never opened again once the dashboard stops", { timeout: 120_000 }, async () => {
  const seen = site.visits.map((v) => v.url);
  assert.deepEqual(seen, [URLS.product, URLS.product, URLS.byId, URLS.missingId, URLS.robot, URLS.blocked, URLS.error, URLS.search]);
  for (let i = 1; i < site.visits.length; i++) assert.ok(site.visits[i].at - site.visits[i - 1].at >= 3000, `page ${i + 1} opened ${site.visits[i].at - site.visits[i - 1].at} ms after the one before`);
  assert.ok(site.refused > 0, 'the pictures and page code the pages asked for were refused, not fetched');
  assert.equal(live.launches, 1, 'one window, kept open and used again');
  assert.equal(await live.context.pages()[0].title(), LIVE_BROWSER_NAME, 'its first tab says what the window is');
  assert.equal(live.profileDir, join(dataDir, 'flipkart', 'browser-profile'));
  assert.equal(statSync(live.profileDir).mode & 0o777, 0o700);
  assert.deepEqual([readdirSync(dataDir), readdirSync(join(dataDir, 'flipkart'))], [['flipkart'], ['browser-profile']], "no Amazon profile, and nothing else");
  // Outside the tests, Chrome cannot even find any website's name but Flipkart's (a redirect is never checked page by page).
  assert.equal(ONLY_FLIPKART_NAMES, 'MAP * ~NOTFOUND, EXCLUDE flipkart.com, EXCLUDE *.flipkart.com, EXCLUDE flixcart.com, EXCLUDE *.flixcart.com');
  // A login left in the profile (a cookie) is gone when the window, closed by hand, opens again.
  await live.context.addCookies([{ name: 'test-login', value: 'made-up', domain: '.flipkart.com', path: '/', expires: Math.floor(Date.now() / 1000) + 3600 }]);
  assert.equal((await live.context.cookies('https://www.flipkart.com/')).length, 1);
  await live.context.close();
  assert.equal(live.isOpen(), false);
  await live.begin();
  assert.equal(live.launches, 2, 'a window closed by hand opens again');
  assert.deepEqual(await live.context.cookies('https://www.flipkart.com/'), [], 'signed out again');
  // The dashboard stops: the window closes and never opens again, even when a reading asks.
  await live.close();
  await assert.rejects(live.begin(), /The dashboard is stopping\./);
  assert.equal(live.launches, 2);
});

test("outside the tests the window is visible and named, Chrome finds only Flipkart's names, and only Flipkart's addresses load in it: a page that tries to go to another website is refused and noted, and the check never fails", async () => {
  const b = new FlipkartBrowser({ dataDir });
  assert.deepEqual([b.headless, b.channel, b.routes], [false, 'chrome', null], 'a visible Chrome window, with no test routes');
  const src = readFileSync(join(ROOT, 'flipkart', 'browser.js'), 'utf8');
  assert.match(src, /`--window-name=\$\{LIVE_BROWSER_NAME\}`/);
  assert.match(src, /`--host-resolver-rules=\$\{this\.routes \? 'MAP \* ~NOTFOUND' : ONLY_FLIPKART_NAMES\}`/);
  assert.match(src, /serviceWorkers: 'block'/);
  // The check every request goes through, with pretend requests: no window is opened.
  const mainFrame = {};
  b.page = { mainFrame: () => mainFrame };
  const route = (url, { nav = false, noFrameYet = false } = {}) => {
    const r = {
      did: null,
      request: () => ({
        url: () => url,
        isNavigationRequest: () => nav,
        frame: () => {
          if (noFrameYet) throw new Error('This request has no frame yet.');
          return mainFrame;
        },
      }),
      continue: async () => {
        r.did = 'continue';
      },
      abort: async () => {
        r.did = 'abort';
      },
    };
    return r;
  };
  for (const [url, did] of [
    [URLS.product, 'continue'],
    ['https://rukminim2.flixcart.com/image/test.jpeg', 'continue'],
    ['https://dl.flipkart.com/s/test0001', 'continue'],
    ['https://www.google.com/', 'abort'],
    ['https://js-agent.newrelic.com/test.js', 'abort'],
    ['https://flipkart.com.example.com/', 'abort'],
    ['data:text/html,test', 'abort'],
  ]) {
    const r = route(url);
    await b.onlyFlipkart(r);
    assert.equal(r.did, did, url);
  }
  const away = route('https://www.example.com/', { nav: true });
  await b.onlyFlipkart(away);
  assert.deepEqual([away.did, b.leftSite], ['abort', 'www.example.com'], 'refused, and noted to say where the link leads');
  b.leftSite = null;
  const newTab = route('https://www.myntra.com/', { nav: true, noFrameYet: true });
  await b.onlyFlipkart(newTab);
  assert.deepEqual([newTab.did, b.leftSite], ['abort', null], "a new tab's first request: refused, and the check does not fail");
  const closedTab = { request: () => ({ url: () => URLS.product, isNavigationRequest: () => false }), continue: async () => { throw new Error('Target page, context or browser has been closed'); }, abort: async () => {} };
  await b.onlyFlipkart(closedTab);
});
