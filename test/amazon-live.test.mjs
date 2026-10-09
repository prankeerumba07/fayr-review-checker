// The whole check through the real Live Amazon Browser code: Chrome (headless
// here) with its one saved profile, opened once and reused, the real 3-second
// gate, pictures after every step, and the real picture readers on the drawn
// pictures. Every request is answered from the saved pages or refused, never
// with a redirect, and no host name resolves, so nothing reaches Amazon.
// Run: node test/amazon-live.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LiveBrowser, ImageReader, createGate } from '../amazon/browsers.js';
import { runCheck } from '../amazon/check.js';
import { readOrderShot, readDeliveryShot, readReviewPicture } from '../amazon/shot-read.js';
import { checkSettings } from '../amazon/settings.js';
import { ORDER_ID } from './fixtures/amazon/make-order-screenshots.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'amazon');
const dataDir = mkdtempSync(join(tmpdir(), 'arc-live-'));
const html = (name) => readFileSync(join(FIX, name), 'utf8');
const SETTINGS = checkSettings({});

/** Answers for Amazon here: the saved pages, or a refusal. Signed out, every Amazon page is the sign-in page. */
const seen = { navigations: [], refused: 0 };
let signedOut = false;
function handler(route) {
  const req = route.request();
  const url = req.url();
  if (!req.isNavigationRequest() || !url.startsWith('https://www.amazon.in/')) {
    seen.refused++;
    return route.abort();
  }
  seen.navigations.push({ url, at: Date.now() });
  let page;
  if (url.startsWith('https://www.amazon.in/ap/signin') || signedOut) page = 'signin-page.html';
  else if (url.includes('/gp/customer-reviews/R1TESTROW02ABC')) page = 'review-floor-cleaner.html';
  else if (url.includes('/dp/B0TESTFLR1')) page = 'product-floor-cleaner.html';
  else if (url.includes('/product-reviews/B0TESTFLR1') && url.includes('filterByKeyword=')) page = 'search-floor-cleaner.html';
  else if (url.includes('/product-reviews/B0TESTFLR1')) page = 'see-all-floor-cleaner.html';
  if (!page) return route.abort();
  return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html(page) });
}

const accounts = [];
const live = new LiveBrowser({ dataDir, labelUrl: 'data:text/html,<title>Live Amazon Browser</title>', headless: true, routes: handler, gate: createGate(), onAccount: (a) => accounts.push(a) });
const images = new ImageReader();
after(async () => {
  await live.close();
  await images.close();
  await rm(dataDir, { recursive: true, force: true });
});

const shot = (link) => ({ text: link, link, links: [link], mismatch: null, picture: null });
const ROW = {
  id: 'r0000000000aa',
  source: 'sheet',
  row: 2,
  hand: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  orderId: { text: ORDER_ID, value: ORDER_ID },
  orderDate: { text: '20-07-2026', value: '2026-07-20' },
  amount: { text: '654', value: 654 },
  product: { text: 'Test Brand Floor Cleaner' },
  cells: { orderShot: 'E2', deliveryShot: 'F2', reviewLink: 'G2', orderId: 'A2' },
  shots: { order: shot('https://drive.google.com/open?id=1TestOrderRow02abcdefgh'), delivery: shot('https://drive.google.com/open?id=1TestDeliveryRow02abcdef'), review: shot('https://amazon.in/gp/customer-reviews/R1TESTROW02ABC?ref=cm_cr_dp_d_rvw_ttl') },
  pictures: { order: [], delivery: [], review: [] },
  last: null,
  seenLive: null,
};
const FILES = { order: [join(FIX, 'order-floor-cleaner.png')], delivery: [join(FIX, 'delivery-floor-cleaner.png')], review: [join(FIX, 'review-written-floor.png')] };

async function liveCheck(row = ROW, campaigns = []) {
  const shotsDir = mkdtempSync(join(dataDir, 'shots-'));
  const result = await runCheck({
    row,
    others: [],
    settings: SETTINGS,
    campaigns,
    pictures: async (which) => ({ files: FILES[which], problems: [] }),
    readOrder: (files) => readOrderShot(files),
    readDelivery: (files) => readDeliveryShot(files),
    readReview: (files, opts) => readReviewPicture(files, { analyse: (f) => images.analyse(f, 'image/png'), settings: SETTINGS, product: opts?.product ?? row.product.text }),
    browser: live,
    checkId: 'c20261005120000aaaaaa',
    shotsDir,
  });
  return { result, shotsDir };
}

test('the drawn pictures and the saved pages: Verified from the review the link opens, with one Amazon page and no search', { timeout: 180_000 }, async () => {
  const { result, shotsDir } = await liveCheck();
  assert.equal(result.type, 'Verified', result.note);
  assert.equal(result.status, 'Pass', 'the Status is Pass, Fail or Needs Manual Staff Checking; Verified is the Type');
  assert.deepEqual(result.steps.map((s) => s.state), [...Array(7).fill('pass'), 'not-needed', 'not-needed', 'pass'], 'a review the link opens is live: no product page, no search');
  assert.equal(seen.navigations.length, 1, 'the review page only');
  assert.ok(seen.refused > 0, 'pictures and scripts the pages asked for were refused, not fetched');
  assert.ok(readdirSync(shotsDir).filter((f) => f.endsWith('.png')).length >= 4, 'a picture of the window after each step once it is open');
  assert.deepEqual(result.order.orderIds, [ORDER_ID], 'read from the drawn order screenshot by Tesseract');
  assert.equal(result.delivery.delivered, true);
  assert.equal(result.productPage, null, 'the product page was not needed');
  assert.deepEqual(accounts.at(-1), { signedIn: true, name: 'Test Staff' }, 'the "Hello, ..." line says who is signed in');
});

test("a picture of a written review, found live under the campaign's product the drawn screenshots show, by its words and its name; each Amazon page at least 3 seconds after the last", { timeout: 180_000 }, async () => {
  const row = { ...ROW, shots: { ...ROW.shots, review: shot('https://drive.google.com/open?id=1TestReviewRow11abcdefg') } };
  const floor = { asin: 'B0TESTFLR1', name: 'Test Brand Floor Cleaner Liquid, Lavender, 1 Litre', short: 'Test Brand Floor Cleaner Liquid', variants: ['B0TESTFLR2'] };
  const before = seen.navigations.length;
  const { result } = await liveCheck(row, [{ id: 'k0000000000a1', name: 'Test Clean', brand: 'Test Brand', products: [floor] }]);
  assert.equal(result.type, 'Verified', result.note);
  assert.equal(result.reviewId, 'R1TESTPICREV1');
  assert.equal(result.reviewPicture.kind, 'written');
  assert.ok(seen.navigations.length - before >= 3, "the product's page, \"See all reviews\", and a search when needed");
  for (let i = Math.max(1, before); i < seen.navigations.length; i++) {
    const gap = seen.navigations[i].at - seen.navigations[i - 1].at;
    assert.ok(gap >= 3000, `page ${i + 1} came ${gap} ms after the one before`);
  }
  assert.equal(result.productPage.scrolled, true, 'the product page was scrolled to its reviews before its picture');
});

test('one saved profile, one window: opened once and reused; signed out, the check pauses and gets no result', { timeout: 120_000 }, async () => {
  assert.equal(live.launches, 1);
  assert.equal(live.profileDir, join(dataDir, 'amazon-profile'));
  assert.ok(existsSync(live.profileDir));
  signedOut = true;
  const before = seen.navigations.length;
  const { result } = await liveCheck();
  assert.equal(live.launches, 1, 'the same window as the check before');
  assert.equal(result.paused.kind, 'signin');
  assert.equal(result.type, null);
  assert.equal(seen.navigations.length, before + 1, 'one Amazon page, then no more');
  assert.match(await live.page.title(), /Sign In/i, 'the window stays on the sign-in page');
  assert.deepEqual(accounts.at(-1), { signedIn: false });
  assert.ok(live.isOpen(), 'the window is never closed between checks');
});

test('a window closed by hand opens again with the same profile; the account line is read without opening a page', { timeout: 60_000 }, async () => {
  const before = seen.navigations.length;
  const line = await live.readAccount();
  assert.deepEqual([line.account, line.loginPage, line.line.hello], [{ signedIn: false }, true, null], 'the login page the check paused on: only its account line, which it has none of');
  assert.equal(seen.navigations.length, before, 'reading the account line opens no page');
  assert.equal(live.launches, 1);
  await live.context.close();
  assert.equal(live.isOpen(), false);
  assert.equal(await live.readAccount(), null);
  await live.begin();
  assert.equal(live.launches, 2);
  assert.equal(live.profileDir, join(dataDir, 'amazon-profile'), 'the same profile, so the login is kept');
  signedOut = false;
});
