// Reading a product's public reviews (flipkart/reviews.js and review-page.js)
// in the Live Flipkart Browser, on pretend Flipkart pages in a hidden Chrome
// of the test's own (test/fixtures/flipkart/fake-flipkart.mjs), so nothing
// reaches Flipkart: the saved product's two saved review pages (real pages,
// every reviewer's name made up) and a made-up third, newest first, until the
// given date; "Read more"; a login box covering the page; a product with no
// reviews; and a robot check on page 2. One page at a time, at least 3
// seconds apart.
// Run: node test/flipkart-reviews-browser.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FlipkartBrowser, createGate } from '../flipkart/browser.js';
import { createFlipkartStore } from '../flipkart/store.js';
import { readReviews, readAndKeepReviews } from '../flipkart/reviews.js';
import { reviewsInPageData } from '../flipkart/review-page.js';
import { fakeFlipkart, PRODUCT, URLS, ALL_REVIEWS } from './fixtures/flipkart/fake-flipkart.mjs';

const dataDir = mkdtempSync(join(tmpdir(), 'arc-flipkart-reviews-'));
const site = fakeFlipkart();
const live = new FlipkartBrowser({ dataDir, headless: true, routes: site.handler, gate: createGate() });
const store = createFlipkartStore(dataDir);
after(async () => {
  await live.close();
  await rm(dataDir, { recursive: true, force: true });
});

const AT = '2026-10-12T05:00:00.000Z';
const now = () => new Date(AT);
/** A product of a campaign once read: its product ID and its "All reviews" link. */
const readOne = (pid, allReviews) => ({ given: pid, pid, read: { pid, allReviews } });
const visited = () => site.visits.map((v) => v.url);

test("the saved product's reviews, newest first: its two saved pages, then page 3, whose reviews are all older than the given date, so page 4 is never opened; each review's own ID from the page's own data; kept in data/flipkart/reviews/<product ID>.json with when they were read", { timeout: 120_000 }, async () => {
  // Each page as the Live Flipkart Browser gave it, to compare what it shows with its own data.
  const pages = [];
  const watched = {
    begin: () => live.begin(),
    async open(url, opts) {
      const res = await live.open(url, opts);
      pages.push(res);
      return res;
    },
  };
  const out = await readAndKeepReviews({ browser: watched, store, product: readOne(PRODUCT.pid, PRODUCT.allReviews), since: '2026-04-01', now });
  assert.deepEqual(visited(), [URLS.reviews1, URLS.reviews2, URLS.reviews3]);
  assert.deepEqual([out.pid, out.link, out.readAt, out.since, out.pages, out.total, out.end, out.stoppedAt, out.loginBox], [PRODUCT.pid, PRODUCT.allReviews, AT, '2026-04-01', 3, 47, 'date', null, false]);
  assert.equal(out.says, '24 reviews read from 3 pages, newest first, down to the first page whose reviews are all older than 01-04-2026.');
  assert.deepEqual(out.reviews.map((r) => r.page), [...Array(10).fill(1), ...Array(10).fill(2), 3, 3, 3, 3]);
  assert.deepEqual(out.reviews[0], { id: '2cbab026-f2f5-4d26-b521-d488e7394a9f', name: 'Flipkart Customer', stars: 5, title: 'Terrific', text: 'Works best when used overnight', dateSaid: '14 days ago', date: '2026-09-28', dateLatest: '2026-09-28', city: 'Rewa', certified: true, reviewFor: 'Quantity 50 ml', page: 1 }, 'the newest review of the saved page 1');
  assert.deepEqual(out.reviews.slice(0, 20).map((r) => r.dateSaid), ['14 days ago', '15 days ago', '19 days ago', '21 days ago', '1 month ago', '1 month ago', '1 month ago', '1 month ago', '3 months ago', '3 months ago', '4 months ago', '4 months ago', '4 months ago', '5 months ago', '5 months ago', '5 months ago', '5 months ago', '5 months ago', '5 months ago', '6 months ago']);
  assert.deepEqual([out.reviews[19].date, out.reviews[19].dateLatest], ['2026-04-12', '2026-04-27'], 'the oldest on the saved page 2 may still be in April, so page 3 is read');
  assert.equal(out.reviews.slice(0, 20).filter((r) => r.id && r.certified && r.city && r.reviewFor === 'Quantity 50 ml').length, 20, 'every saved review: its own ID, a certified purchase, its city');
  assert.deepEqual(new Set(out.reviews.slice(0, 20).map((r) => (/^Test Reviewer [A-Z][a-z]+$/.test(r.name) ? 'made up' : r.name))), new Set(['made up', 'Flipkart Customer']), 'no real name');
  assert.deepEqual(out.reviews.slice(20).map((r) => [r.id, r.name, r.stars, r.title, r.text, r.dateSaid, r.date, r.dateLatest, r.city, r.certified, r.reviewFor]), [
    [null, 'Made-up Reviewer A', 4, 'Nice product', 'Made-up review: soft on the skin.', '7 months ago', '2026-03-12', '2026-03-27', 'Test Town', true, 'Quantity 50 ml'],
    [null, 'Made-up Reviewer B', 5, 'Wonderful', 'Made-up review: my skin felt fresh in the morning.', '8 months ago', '2026-02-12', '2026-02-27', 'Test City', true, 'Quantity 50 ml'],
    [null, 'Made-up Reviewer C', 3, 'Good', 'Made-up review: it is fine.', 'Mar, 2026', '2026-03-01', '2026-03-31', 'Test Village', true, 'Quantity 50 ml'],
    [null, 'Made-up Reviewer D', 2, 'Not good', 'Made-up review: too sticky for me.', 'Feb, 2026', '2026-02-01', '2026-02-28', null, false, 'Quantity 50 ml'],
  ], 'page 3 has none of the page\'s own data: read as it shows, with no IDs');
  // What the two saved pages show is what their own data says, only without each review's own ID: a page without its data is read the same way.
  for (const res of pages.slice(0, 2)) assert.deepEqual(res.facts.reviews, reviewsInPageData(res.html).map(({ id, ...rest }) => rest));
  const file = join(dataDir, 'flipkart', 'reviews', `${PRODUCT.pid}.json`);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), out);
  assert.deepEqual(await store.reviews(PRODUCT.pid), out);
  assert.deepEqual([statSync(file).mode & 0o777, statSync(join(dataDir, 'flipkart', 'reviews')).mode & 0o777], [0o600, 0o700]);
});

test('"Read more": pressed where a review\'s text is cut, so its whole text is read; it opens no other page', { timeout: 120_000 }, async () => {
  const before = site.visits.length;
  const out = await readReviews(live, readOne('FCPTESTGLOW00001', ALL_REVIEWS.readMore), { now });
  assert.deepEqual(visited().slice(before), [URLS.readMore], 'one page: the product has 2 reviews, and both are read');
  assert.equal(await live.page.evaluate(() => window.pressed), 1);
  assert.deepEqual(out.reviews.map((r) => [r.name, r.stars, r.title, r.text, r.dateSaid, r.date]), [
    ['Made-up Reviewer E', 5, 'Terrific', 'This made-up mask feels light and cool on the skin, and after a week my skin looked brighter.', 'Today', '2026-10-12'],
    ['Made-up Reviewer F', 4, 'Good', 'Nice.', '2 days ago', '2026-10-10'],
  ]);
  assert.deepEqual([out.pages, out.end, out.says], [1, 'last page', '2 reviews read from 1 page: all the reviews Flipkart shows.']);
});

test("Flipkart's login box covering the page: closed with its close button, nothing typed into it, and the review under it read", { timeout: 120_000 }, async () => {
  const before = site.visits.length;
  const out = await readReviews(live, readOne('FCPTESTCLAY00001', ALL_REVIEWS.loginBox), { now });
  assert.deepEqual(visited().slice(before), [URLS.loginBox]);
  assert.equal(out.loginBox, true);
  assert.deepEqual(await live.page.evaluate(() => [document.querySelector('[data-test="login-box"]'), window.closedWith, window.typed]), [null, 'its close button', 0]);
  assert.deepEqual(out.reviews.map((r) => [r.name, r.stars, r.title, r.text, r.city, r.certified, r.dateSaid]), [['Made-up Reviewer G', 3, 'Fair', 'Made-up review: the clay dries a little fast.', 'Test Village', true, '1 month ago']]);
});

test('a product with no reviews: its first review page shows none, so no other page is opened; a product with no "All reviews" link opens no page', { timeout: 120_000 }, async () => {
  const before = site.visits.length;
  const out = await readAndKeepReviews({ browser: live, store, product: readOne('FCPTESTJAR000001', ALL_REVIEWS.none), now });
  assert.deepEqual(visited().slice(before), [URLS.noReviews]);
  assert.deepEqual([out.pages, out.total, out.end, out.reviews, out.says], [0, 0, 'last page', [], 'Flipkart shows no reviews for this product.']);
  assert.deepEqual(await store.reviews('FCPTESTJAR000001'), out, 'kept too: none, and when that was seen');
  const none = await readReviews(live, readOne('FCPTESTNONE00001', null), { now });
  assert.deepEqual([none.end, none.reviews, site.visits.length], ['none', [], before + 1]);
});

test('a robot check on page 2: "Flipkart prevented this check" at page 2, the reviews of page 1 are kept, and nothing more is opened', { timeout: 120_000 }, async () => {
  const before = site.visits.length;
  const out = await readAndKeepReviews({ browser: live, store, product: readOne('FCPTESTROBO00001', ALL_REVIEWS.robot), now });
  assert.deepEqual(visited().slice(before), [URLS.robotReviews1, URLS.robotReviews2]);
  assert.deepEqual([out.end, out.stoppedAt, out.pages, out.reviews.length, out.says], ['prevented', 2, 1, 4, 'Flipkart prevented this check at page 2 of the reviews: it showed a robot check, which this dashboard never answers. The reviews of page 1 were kept.']);
  assert.deepEqual((await store.reviews('FCPTESTROBO00001')).reviews.map((r) => [r.page, r.name]), [[1, 'Made-up Reviewer A'], [1, 'Made-up Reviewer B'], [1, 'Made-up Reviewer C'], [1, 'Made-up Reviewer D']]);
});

test('one page at a time, at least 3 seconds apart, in one window with its own profile; only the pages asked for were opened, and nothing else reached Flipkart', () => {
  assert.deepEqual(visited(), [URLS.reviews1, URLS.reviews2, URLS.reviews3, URLS.readMore, URLS.loginBox, URLS.noReviews, URLS.robotReviews1, URLS.robotReviews2]);
  for (let i = 1; i < site.visits.length; i++) assert.ok(site.visits[i].at - site.visits[i - 1].at >= 3000, `page ${i + 1} opened ${site.visits[i].at - site.visits[i - 1].at} ms after the one before`);
  assert.equal(live.launches, 1);
  assert.equal(live.profileDir, join(dataDir, 'flipkart', 'browser-profile'));
});
