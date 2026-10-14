// Reading a product's public reviews without a browser: Flipkart's date words
// made into dates, the address of each review page, the reviews in a page's
// own data, and the reading rules with a pretend Live Flipkart Browser:
// newest first until the given date, the last page, or 50 pages; a robot
// check, a block or an error stopping it, with the pages before it kept; and
// where the reviews are kept. Made-up reviews only.
// Run: node test/flipkart-reviews.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { readReviews, readAndKeepReviews, readProductReviews, MAX_REVIEW_PAGES, REVIEW_PAGE_GAP_MS, ERROR_WAIT_MS } from '../flipkart/reviews.js';
import { createGate } from '../flipkart/browser.js';
import { dateFromWords, indiaDay, reviewsPageLink, reviewsInPageData, pageData, reviewsLinkInPage, plainText } from '../flipkart/review-page.js';
import { pageForPid, reviewPageLink, linkLabel } from '../flipkart/links.js';
import { whatPageIs } from '../flipkart/page-read.js';
import { createFlipkartStore } from '../flipkart/store.js';
import { keepReviews, reachOf, reaches, keptNotRead, sameReview, MAX_KEPT_REVIEWS } from '../flipkart/kept-reviews.js';

const AT = '2026-10-12T05:00:00.000Z';
const now = () => new Date(AT);
const PID = 'FCPTESTGLOW00001';
const GLOW = `https://www.flipkart.com/test-glow-face-mask/product-reviews/itmtestglow0001?pid=${PID}&marketplace=FLIPKART`;
/** A product of a campaign once read: its product ID and its "All reviews" link. */
const product = { given: PID, pid: PID, read: { pid: PID, allReviews: GLOW } };
const pageUrl = (n) => `${GLOW}&sortOrder=MOST_RECENT&page=${n}`;

const temps = [];
after(() => Promise.all(temps.map((d) => rm(d, { recursive: true, force: true }))));

/** A made-up review as a page shows it. */
const shown = (i, dateSaid, extra = {}) => ({ name: `Made-up Reviewer ${i}`, stars: 4, title: 'Nice product', text: `Made-up review number ${i}.`, dateSaid, city: 'Test Town', certified: true, reviewFor: null, ...extra });
/** A made-up review page as the Live Flipkart Browser reads it. */
const reviewPage = (url, reviews, { total = null, status = 200, html = '', text = '' } = {}) => ({
  ok: true,
  status,
  url,
  facts: { url, title: 'Reviews | Flipkart.com', text, product: null, reviews, total, robotFrame: false, robotForm: false },
  html,
  prepared: { loginBox: false, closed: false, pressed: 0 },
});
/** A pretend Live Flipkart Browser: what it gives for each page number, and every address it opened. */
function fakeBrowser(pageOf) {
  const b = {
    opened: [],
    async begin() {},
    async open(url) {
      b.opened.push(url);
      return pageOf(Number(new URL(url).searchParams.get('page')), url);
    },
  };
  return b;
}
/** Two made-up reviews on page 1, then no more. */
const onePage = (n, url) => reviewPage(url, n === 1 ? [shown(1, 'Today'), shown(2, '3 days ago')] : []);

test("Flipkart's date words made into dates, from India's date on the day the page was read: one day, or the plain reading and the last day the words can mean", () => {
  const d = (w, today = '2026-10-12') => dateFromWords(w, today);
  const day = (x) => ({ date: x, latest: x });
  assert.deepEqual([d('Today'), d('· Today'), d('Yesterday'), d('1 day ago'), d('5 days ago'), d('21 days ago'), d('2 weeks ago')], [day('2026-10-12'), day('2026-10-12'), day('2026-10-11'), day('2026-10-11'), day('2026-10-07'), day('2026-09-21'), day('2026-09-28')]);
  assert.deepEqual([d('1 month ago'), d('a month ago'), d('2 months ago'), d('11 months ago')], [{ date: '2026-09-12', latest: '2026-09-27' }, { date: '2026-09-12', latest: '2026-09-27' }, { date: '2026-08-12', latest: '2026-08-27' }, { date: '2025-11-12', latest: '2025-11-27' }], '"2 months ago" may be a little less than two months ago');
  assert.deepEqual(d('1 month ago', '2026-03-31'), { date: '2026-02-28', latest: '2026-03-15' }, 'there is no 31 February');
  assert.deepEqual(d('1 month ago', '2026-10-05'), { date: '2026-09-05', latest: '2026-09-20' });
  assert.deepEqual(d('2 days ago', '2026-03-01'), day('2026-02-27'));
  assert.deepEqual(d('1 year ago'), { date: '2025-10-12', latest: '2026-04-12' });
  assert.deepEqual([d('Aug, 2026'), d('Feb 2024'), d('September, 2025'), d('12 Aug, 2026')], [{ date: '2026-08-01', latest: '2026-08-31' }, { date: '2024-02-01', latest: '2024-02-29' }, { date: '2025-09-01', latest: '2025-09-30' }, day('2026-08-12')], 'a month and its year: any day of it');
  assert.deepEqual(d('Oct, 2026'), { date: '2026-10-01', latest: '2026-10-12' }, 'never after today');
  for (const w of ['', 'recently', 'Smarch, 2026', '31 Feb, 2026', 'Aug']) assert.equal(d(w), null, `"${w}" is not known`);
  assert.equal(d('Today', 'not a day'), null);
  assert.deepEqual([indiaDay('2026-10-11T19:00:00.000Z'), indiaDay('2026-10-11T18:00:00.000Z')], ['2026-10-12', '2026-10-11'], "India's date: half past midnight on 12 October in India, and 11.30 at night on 11 October");
});

test('the address of each page of reviews, newest first, from the "All reviews" link; anything else is no such link', () => {
  assert.equal(reviewsPageLink(GLOW, 1), pageUrl(1));
  assert.equal(reviewsPageLink(`${GLOW}&sortOrder=MOST_HELPFUL&page=4&aid=test`, 2), pageUrl(2), "Flipkart's other order and page are replaced");
  assert.equal(reviewsPageLink('https://www.flipkart.com/test-glow-face-mask/product-reviews/itmtestglow0001/?pid=FCPTESTGLOW00001', 3), 'https://www.flipkart.com/test-glow-face-mask/product-reviews/itmtestglow0001?pid=FCPTESTGLOW00001&sortOrder=MOST_RECENT&page=3');
  for (const link of ['https://www.flipkart.com/test-glow-face-mask/p/itmtestglow0001?pid=FCPTESTGLOW00001', 'https://www.example.com/test-glow-face-mask/product-reviews/itmtestglow0001', 'not a link', null]) assert.equal(reviewsPageLink(link, 1), null, String(link));
});

test("the reviews in a page's own data, as Flipkart sent the page: each one's own ID, name, stars, title, whole text, date words, city, certified purchase or not, what it is a review for, and its own link", () => {
  const ONE = '0a1b2c3d-0000-4000-8000-000000000001';
  const review = (id, extra) => ({ value: { type: 'ProductReviewValue', id, author: 'Made-up Reviewer 1', rating: 5, title: 'Terrific', text: 'Made-up text, \n on two lines. ', created: '3 days ago', certifiedBuyer: true, location: { city: 'Test Town', state: 'Test State' }, productAttributeList: [{ name: 'Quantity', value: '50 ml' }], url: `/reviews/${PID}:74?reviewId=${id}`, ...extra } });
  const state = {
    multiWidgetState: {
      widgetsData: {
        slots: {
          3: { slotData: { widget: { data: { renderableComponents: [review(ONE)] } } } },
          4: { slotData: { widget: { data: { renderableComponents: [review('made-up-review-2', { author: 'Flipkart Customer', rating: 9, certifiedBuyer: false, reviewPropertyMap: { VERIFIED_PURCHASE: true }, location: null, productAttributeList: [], title: 'Fair {not} "the end"' })] } } } },
          5: { slotData: { widget: { data: { title: 'Similar products', renderableComponents: [{ value: { type: 'ProductSummaryValue', title: 'Not a review' } }] } } } },
        },
      },
    },
  };
  const html = `<html><body><div>Reviews</div><script id="is_script">window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script><script>window.after = {};</script></body></html>`;
  assert.deepEqual(reviewsInPageData(html), [
    { id: ONE, name: 'Made-up Reviewer 1', stars: 5, title: 'Terrific', text: 'Made-up text,\non two lines.', dateSaid: '3 days ago', city: 'Test Town', certified: true, reviewFor: 'Quantity 50 ml', link: `https://www.flipkart.com/reviews/${PID}:74?reviewId=${ONE}` },
    { id: 'made-up-review-2', name: 'Flipkart Customer', stars: null, title: 'Fair {not} "the end"', text: 'Made-up text,\non two lines.', dateSaid: '3 days ago', city: null, certified: true, reviewFor: null, link: null },
  ], 'the stars are 1 to 5; braces and quotes inside the words are no end of the data; a link is kept only in the form that opens the review');
  // The two real pages saved on 12-10-2026: every review comes with its own link, /reviews/<product ID>:<number>?reviewId=<its own ID>.
  for (const name of ['reviews-page-1.html', 'reviews-page-2.html']) {
    const real = reviewsInPageData(readFileSync(new URL(`./fixtures/flipkart/${name}`, import.meta.url), 'utf8'));
    assert.equal(real.length, 10, name);
    assert.ok(real.every((r) => r.link === `https://www.flipkart.com/reviews/FCPHEW7AM9C7RU24:${r.link?.match(/:(\d+)\?/)?.[1]}?reviewId=${r.id}`), `${name}: each review's own link`);
  }
  assert.deepEqual(pageData(html), state);
  for (const none of ['<html><body>No data</body></html>', '<script>window.__INITIAL_STATE__ = {"broken": </script>', '', null]) assert.deepEqual(reviewsInPageData(none), [], String(none));
});

test('newest first, page after page: it stops after the first page whose reviews are all older than the given date, at the last page (a page with no reviews, only reviews already read, as many reviews as Flipkart says there are, or a page Flipkart says does not exist), and when there is no reviews page', async () => {
  const dates = { 1: ['Today', '3 days ago'], 2: ['1 month ago', '6 months ago'], 3: ['7 months ago', 'Feb, 2026'], 4: ['Jan, 2026'] };
  const pages = fakeBrowser((n, url) => reviewPage(url, dates[n].map((w, i) => shown(`${n}-${i}`, w))));
  const out = await readReviews(pages, product, { since: '2026-04-01', now });
  assert.deepEqual(pages.opened, [pageUrl(1), pageUrl(2), pageUrl(3)], 'page 3 is all older than 1 April 2026: page 4 is never opened');
  assert.deepEqual([out.pid, out.link, out.since, out.pages, out.end, out.stoppedAt, out.reviews.length], [PID, GLOW, '2026-04-01', 3, 'date', null, 6]);
  assert.equal(out.says, '6 reviews read, newest first, until they were all older than 01-04-2026.');
  assert.deepEqual(out.reviews[2], { id: null, name: 'Made-up Reviewer 2-0', stars: 4, title: 'Nice product', text: 'Made-up review number 2-0.', dateSaid: '1 month ago', date: '2026-09-12', dateLatest: '2026-09-27', city: 'Test Town', certified: true, reviewFor: null, link: null, page: 2 }, "a review read only from the page's words has no own link");
  assert.equal(out.links, true, "each review's own link was looked for: a copy kept before that has none, and is read again");
  // "6 months ago" may still be in April: page 2 does not stop it. Words not known never count as older.
  const unknown = fakeBrowser((n, url) => reviewPage(url, n === 1 ? [shown(1, 'Feb, 2026'), shown(2, 'recently')] : []));
  assert.deepEqual([(await readReviews(unknown, product, { since: '2026-04-01', now })).end, unknown.opened.length], ['last page', 2]);
  const last = async (pageOf, opts = {}) => {
    const b = fakeBrowser(pageOf);
    const r = await readReviews(b, product, { now, ...opts });
    return [b.opened.length, r.pages, r.reviews.length, r.end];
  };
  assert.deepEqual(await last(onePage), [2, 1, 2, 'last page'], 'a page with no reviews');
  assert.deepEqual(await last((n, url) => reviewPage(url, [shown(Math.min(n, 2), 'Today')])), [3, 2, 2, 'last page'], 'Flipkart shows the last page again');
  assert.deepEqual(await last((n, url) => reviewPage(url, [shown(`${n}a`, 'Today'), shown(`${n}b`, 'Today')], { total: 4 })), [2, 2, 4, 'last page'], 'as many as Flipkart says there are: no page after');
  assert.deepEqual(await last((n, url) => (n === 1 ? reviewPage(url, [shown(1, 'Today')]) : reviewPage(url, [], { status: 404 }))), [2, 1, 1, 'last page'], 'a page Flipkart says does not exist');
  const missing = await readReviews(fakeBrowser((n, url) => reviewPage(url, [], { status: 404 })), product, { now });
  assert.deepEqual([missing.end, missing.says], ['none', 'Flipkart says this product has no reviews page.']);
  const all = await readReviews(fakeBrowser(onePage), product, { now });
  assert.deepEqual([all.since, all.says], [null, '2 reviews read: all the reviews Flipkart shows.']);
  const noLink = fakeBrowser(onePage);
  const none = await readReviews(noLink, { read: { pid: PID, allReviews: null } }, { now });
  assert.deepEqual([noLink.opened, none.end, none.says, none.reviews], [[], 'none', 'Flipkart shows no reviews for this product, so no page was opened.', []]);
});

test('at most 50 pages at one time', async () => {
  const b = fakeBrowser((n, url) => reviewPage(url, Array.from({ length: 10 }, (_, i) => shown(`${n}-${i}`, `${n} days ago`))));
  const out = await readReviews(b, product, { since: '2020-01-01', now });
  assert.equal(MAX_REVIEW_PAGES, 50);
  assert.deepEqual([b.opened.length, b.opened.at(-1), out.pages, out.reviews.length, out.end], [50, pageUrl(50), 50, 500, 'limit']);
  assert.equal(out.says, '500 reviews read, the most read at one time; older reviews were not read.');
});

test('a robot check, a block or an error stops the reading where it is: "Flipkart prevented this check" (never a page\'s number: Flipkart\'s website shows none), what the page showed (its status number, its title and whether it showed any reviews, never a name or a review\'s words), and the pages before it kept; an error page only once it is still there when opened once more 60 seconds later, a robot check or a block at once; so do a page that cannot be opened, a closed window and a page that leads away from Flipkart', async () => {
  const kinds = {
    captcha: [(url) => reviewPage(url, [], { text: 'Are you a human? Please confirm that you are a human.' }), 'it showed a robot check, which this dashboard never answers', 200],
    blocked: [(url) => reviewPage(url, [], { status: 403, text: 'Access Denied' }), 'it refused the page', 403],
    error: [(url) => reviewPage(url, [], { status: 500, text: 'Something went wrong!' }), 'it showed an error, also when the page was opened once more 60 seconds later', 500],
  };
  const waited = [];
  const sleep = async (ms) => waited.push(ms);
  for (const [kind, [page2, why, status]] of Object.entries(kinds)) {
    waited.length = 0;
    const b = fakeBrowser((n, url) => (n === 1 ? reviewPage(url, [shown(1, 'Today')]) : page2(url)));
    const out = await readReviews(b, product, { now, sleep });
    const again = kind === 'error';
    assert.deepEqual([b.opened.length, waited, out.opened, out.end, out.stoppedAt, out.pages, out.reviews.length, out.refused, out.says], [again ? 3 : 2, again ? [60000] : [], again ? 3 : 2, 'prevented', 2, 1, 1, { page: 2, status, title: 'Reviews | Flipkart.com', reviews: 0 }, `Flipkart prevented this check while its reviews were read: ${why}. The page Flipkart sent had status ${status}, the title "Reviews | Flipkart.com" and no reviews on it. The review read before was kept.`], kind);
  }
  const at = async (stopAt, stopPage) => (await readReviews(fakeBrowser((n, url) => (n < stopAt ? reviewPage(url, [shown(n, 'Today')]) : stopPage(url))), product, { now, sleep })).says;
  assert.equal(await at(1, kinds.captcha[0]), 'Flipkart prevented this check while its reviews were read: it showed a robot check, which this dashboard never answers. The page Flipkart sent had status 200, the title "Reviews | Flipkart.com" and no reviews on it. No review was read; try again later.');
  assert.equal(await at(4, kinds.blocked[0]), 'Flipkart prevented this check while its reviews were read: it refused the page. The page Flipkart sent had status 403, the title "Reviews | Flipkart.com" and no reviews on it. The 3 reviews read before were kept.');
  // An error that still showed a review, with no title: said so, and its review is neither kept nor said.
  const odd = await at(2, (url) => {
    const p = reviewPage(url, [shown(7, 'Today')], { status: 503 });
    return { ...p, facts: { ...p.facts, title: '' } };
  });
  assert.equal(odd, 'Flipkart prevented this check while its reviews were read: it showed an error, also when the page was opened once more 60 seconds later. The page Flipkart sent had status 503, no title and 1 review on it. The review read before was kept.');
  assert.equal(await at(2, () => ({ ok: false, error: 'network', message: 'The page could not be opened.' })), 'The Live Flipkart Browser could not open more reviews, so the reading stopped there. The page could not be opened. The review read before was kept.');
  assert.equal(await at(2, () => ({ ok: false, error: 'closed', message: 'The Live Flipkart Browser was closed.' })), 'The Live Flipkart Browser was closed, so the reading of the reviews stopped there. The review read before was kept.');
  assert.equal(await at(2, () => ({ ok: false, error: 'elsewhere', host: 'www.example.com', message: 'The page went to www.example.com instead of Flipkart.' })), 'A page of the reviews led to www.example.com, not to Flipkart, so the reading stopped there. The review read before was kept.');
  assert.equal(await at(2, () => reviewPage('https://www.example.com/test', [shown(9, 'Today')])), 'A page of the reviews led to www.example.com, not to Flipkart, so the reading stopped there. The review read before was kept.');
  const noChrome = fakeBrowser(onePage);
  noChrome.begin = async () => {
    throw new Error('no Chrome');
  };
  const out = await readReviews(noChrome, product, { now });
  assert.deepEqual([noChrome.opened, out.end, out.stoppedAt, out.says], [[], 'closed', 1, 'The Live Flipkart Browser could not be opened on this computer, so no review was read.']);
  // A review page whose reviews say anything is still a review page; a robot check or a refusal in it is not.
  const kind = (reviews, extra = {}, status = 200) => whatPageIs({ url: pageUrl(1), title: 'Flipkart', text: 'Something went wrong with the lid. Are you a human? Access denied to my skin.', product: null, reviews, ...extra }, status).kind;
  assert.deepEqual([kind([shown(1, 'Today')]), kind([]), kind([shown(1, 'Today')], { robotForm: true }), kind([shown(1, 'Today')], {}, 403)], ['page', 'captcha', 'captcha', 'blocked']);
});

test('the reviews are kept only in data/flipkart/reviews/<product ID>.json, with when they were read, in place of the ones read before; a product with no product ID keeps nothing, and no product ID makes a path', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'arc-flipkart-reviews-kept-'));
  temps.push(dataDir);
  const store = createFlipkartStore(dataDir);
  const out = await readAndKeepReviews({ browser: fakeBrowser(onePage), store, product, now });
  const file = join(dataDir, 'flipkart', 'reviews', `${PID}.json`);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), out);
  assert.deepEqual([out.readAt, out.reviews.length], [AT, 2]);
  const files = [];
  const walk = (d) => readdirSync(d).forEach((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : files.push(relative(dataDir, join(d, n)).split('\\').join('/'))));
  walk(dataDir);
  assert.deepEqual(files, [`flipkart/reviews/${PID}.json`], 'nothing anywhere else');
  assert.deepEqual([statSync(file).mode & 0o777, statSync(join(dataDir, 'flipkart', 'reviews')).mode & 0o777], [0o600, 0o700]);
  const later = await readAndKeepReviews({ browser: fakeBrowser((n, url) => reviewPage(url, n === 1 ? [shown(3, 'Today')] : [])), store, product, now: () => new Date('2026-10-13T05:00:00.000Z') });
  assert.deepEqual(await store.reviews(PID), later, 'in place of the ones before');
  assert.equal(later.readAt, '2026-10-13T05:00:00.000Z');
  const untouched = fakeBrowser(onePage);
  await assert.rejects(readAndKeepReviews({ browser: untouched, store, product: { read: { pid: null, allReviews: GLOW } }, now }), /This product has no Flipkart product ID, so its reviews cannot be kept\./);
  assert.deepEqual(untouched.opened, [], 'no page opened for it');
  await assert.rejects(store.saveReviews('../../escape', {}), /Not a Flipkart product ID\./);
  assert.equal(await store.reviews('../rows'), null);
  assert.equal(await store.reviews('FCPTESTNONE00001'), null, 'none read yet');
});

/** A made-up product page as the Live Flipkart Browser reads it: its JSON-LD's name and product ID, and its links to all its reviews. */
const productPage = (url, { pid = PID, links = [], html = '', status = 200, text = '', name = 'Test Glow Face Mask 100 g' } = {}) => ({
  ok: true,
  status,
  url,
  facts: { url, title: name ? `${name} - Price in India` : 'Flipkart', text, canonical: null, product: name ? { name, brand: 'Test Glow', sku: pid, rating: 4.2, ratings: 120, reviews: 30 } : null, reviewLinks: links, variants: [], robotFrame: false, robotForm: false },
  html,
});
/** A pretend Live Flipkart Browser that also has the product's own page (found by its product ID). */
function siteBrowser(productOf, pageOf) {
  const b = {
    opened: [],
    async begin() {},
    async open(url) {
      b.opened.push(url);
      return /\/product\/p\/itme\?/.test(url) ? productOf(url) : pageOf(Number(new URL(url).searchParams.get('page')), url);
    },
  };
  return b;
}

test('the link to all of a product\'s reviews, from its page as Flipkart sent it: the first one for this product that is not about one thing, else one made from its own product page\'s address; none for another product', () => {
  const data = `<script>window.__INITIAL_STATE__ = {"a":"\\/test-glow-face-mask\\/product-reviews\\/itmtestglow0001?pid=${PID}&aid=overall","b":"\\u002Ftest-glow-face-mask\\u002Fproduct-reviews\\u002Fitmtestglow0001?pid=${PID}&amp;lid=LST1"};</script>`;
  assert.deepEqual([reviewsLinkInPage(data, PID), reviewsLinkInPage(`<a href="/test-glow-face-mask/p/itmtestglow0001?pid=${PID}&amp;lid=1">`, PID), reviewsLinkInPage('<a href="/test-clay/p/itmtestclay00001?pid=FCPTESTCLAY00001">', PID), reviewsLinkInPage('', PID)], [GLOW, GLOW, null, null]);
});

test('a campaign product\'s reviews as staff find them: its own page found by its product ID, then its "See all reviews" link (the page\'s own, else the one its own data names), newest first, told before each page; a reading stopped at a date goes on from where it stopped; the product\'s page that cannot be had, is not the product\'s or shows no way to its reviews reads nothing', async () => {
  const told = [];
  const b = siteBrowser((url) => productPage(url, { links: [GLOW] }), onePage);
  const out = await readProductReviews(b, PID, { now, onPage: (n) => told.push(n) });
  assert.deepEqual([b.opened, told, out.link, out.end, out.reviews.length, out.product], [[pageForPid(PID), pageUrl(1), pageUrl(2)], [0, 1, 2], GLOW, 'last page', 2, { pid: PID, name: 'Test Glow Face Mask 100 g', rating: 4.2, ratings: 120, reviews: 30 }]);
  const named = siteBrowser((url) => productPage(url, { html: `<script>window.__INITIAL_STATE__ = {"x":"\\/test-glow-face-mask\\/product-reviews\\/itmtestglow0001?pid=${PID}"};</script>` }), onePage);
  assert.deepEqual([(await readProductReviews(named, PID, { now })).link], [GLOW], "the link its own data names, when the page shows none");
  // Stopped at a day; then read on from its next page, back to an older day, without opening the product's page again.
  const dated = (n, url) => reviewPage(url, [shown(`${n}-1`, `${n * 10} days ago`), shown(`${n}-2`, `${n * 10} days ago`)]);
  const first = await readProductReviews(siteBrowser((url) => productPage(url, { links: [GLOW] }), dated), PID, { now, since: '2026-09-25' });
  assert.deepEqual([first.end, first.pages, first.reviews.length, first.since], ['date', 2, 4, '2026-09-25']);
  const more = siteBrowser(() => assert.fail("the product's page is not opened again"), dated);
  const on = await readProductReviews(more, PID, { now, since: '2026-09-05', from: first });
  assert.deepEqual([more.opened, on.end, on.pages, on.reviews.length, on.reviews.map((r) => r.page), on.product.name], [[pageUrl(3), pageUrl(4)], 'date', 4, 8, [1, 1, 2, 2, 3, 3, 4, 4], 'Test Glow Face Mask 100 g']);
  // The product's page: a robot check, too slow, another product, no way to its reviews; then a review page too slow.
  const product = async (answer) => readProductReviews(siteBrowser(answer, onePage), PID, { now });
  const robot = await product((url) => productPage(url, { text: 'Are you a human? Please confirm that you are a human.', name: null }));
  assert.deepEqual([robot.end, robot.prevented, robot.stoppedAt, robot.reviews, robot.refused, robot.says], ['prevented', 'captcha', 0, [], { page: 0, status: 200, title: 'Flipkart', reviews: null }, "Flipkart prevented this check at the product's page: it showed a robot check, which this dashboard never answers. The page Flipkart sent had status 200 and the title \"Flipkart\". No review was read; try again later."]);
  assert.deepEqual([(await product(() => ({ ok: false, error: 'timeout', message: 'The page took too long to open.' }))).end, (await product((url) => productPage(url, { pid: 'FCPTESTCLAY00001', links: [GLOW] }))).says, (await product((url) => productPage(url))).says], ['slow', "Flipkart's page for the product's ID did not show the product, so its reviews could not be read.", "The product's page on Flipkart showed no way to see all its reviews, so they could not be read."]);
  const slow = await readProductReviews(siteBrowser((url) => productPage(url, { links: [GLOW] }), (n, url) => (n === 1 ? reviewPage(url, [shown(1, 'Today')]) : { ok: false, error: 'timeout', message: 'The page took too long to open.' })), PID, { now });
  assert.deepEqual([slow.end, slow.stoppedAt, slow.reviews.length, slow.says], ['slow', 2, 1, 'Flipkart took too long to show more reviews, so the reading stopped there. The review read before was kept.']);
  assert.deepEqual([(await readProductReviews(siteBrowser(() => assert.fail('nothing is opened'), onePage), 'not a product ID', { now })).end], ['none']);
  // Stop: no page is opened after it.
  const stopped = new AbortController();
  stopped.abort();
  assert.equal((await readProductReviews(siteBrowser(() => assert.fail('nothing is opened'), onePage), PID, { now, signal: stopped.signal })).end, 'stopped');
  const midway = new AbortController();
  const half = await readProductReviews(siteBrowser((url) => productPage(url, { links: [GLOW] }), onePage), PID, { now, signal: midway.signal, onPage: (n) => n === 1 && midway.abort() });
  assert.deepEqual([half.end, half.pages, half.stoppedAt, half.says], ['stopped', 1, 2, 'The check was stopped, so the reading of the reviews stopped there. The 2 reviews read before were kept.']);
});

test("an error page while the reviews are read is opened once more 60 seconds later, said first, and the reading goes on when it shows its reviews; a robot check then stops it, and nothing is opened a third time; Stop while waiting opens nothing more; the product's page is opened once more the same way", async () => {
  assert.equal(ERROR_WAIT_MS, 60000);
  const waited = [];
  const told = [];
  let tries = 0;
  // Page 2 shows an error the first time, its review the second.
  const b = fakeBrowser((n, url) => (n === 2 && tries++ === 0 ? reviewPage(url, [], { status: 500, text: 'Something went wrong!' }) : reviewPage(url, n <= 3 ? [shown(n, 'Today')] : [])));
  const out = await readReviews(b, product, { now, sleep: async (ms) => waited.push(ms), onPage: (n, read, wait) => told.push([n, read, wait ?? null]) });
  assert.deepEqual([b.opened.map((u) => Number(new URL(u).searchParams.get('page'))), waited, told, out.end, out.pages, out.reviews.length, out.opened], [[1, 2, 2, 3, 4], [60000], [[1, 0, null], [2, 1, null], [2, 1, 60000], [3, 2, null], [4, 3, null]], 'last page', 3, 3, 5]);
  // An error, then a robot check when opened once more: stopped there, never opened a third time.
  let second = 0;
  const robot = fakeBrowser((n, url) => (n > 1 ? assert.fail('nothing more is opened') : second++ === 0 ? reviewPage(url, [], { status: 502 }) : reviewPage(url, [], { text: 'Are you a human? Please confirm that you are a human.' })));
  const stopped = await readReviews(robot, product, { now, sleep: async () => {} });
  assert.deepEqual([robot.opened.length, stopped.end, stopped.prevented, stopped.says], [2, 'prevented', 'captcha', 'Flipkart prevented this check while its reviews were read: it showed a robot check, which this dashboard never answers, when the page was opened once more 60 seconds after an error. The page Flipkart sent had status 200, the title "Reviews | Flipkart.com" and no reviews on it. No review was read; try again later.']);
  // Stop while waiting: nothing more is opened. With the real wait, Stop ends it at once.
  const stop = new AbortController();
  const waiting = fakeBrowser((n, url) => (n === 1 ? reviewPage(url, [shown(1, 'Today')]) : reviewPage(url, [], { status: 500 })));
  const began = Date.now();
  const halted = await readReviews(waiting, product, { now, signal: stop.signal, onPage: (n, read, wait) => wait && setTimeout(() => stop.abort(), 20) });
  assert.deepEqual([waiting.opened.length, halted.end, halted.stoppedAt, halted.says, Date.now() - began < 10_000], [2, 'stopped', 2, 'The check was stopped, so the reading of the reviews stopped there. The review read before was kept.', true]);
  // The product's page: an error, then the page itself when opened once more; and an error twice, said so.
  let p = 0;
  const site = siteBrowser((url) => (p++ === 0 ? productPage(url, { status: 500, name: null, text: 'Something went wrong!' }) : productPage(url, { links: [GLOW] })), onePage);
  const seen = [];
  const read = await readProductReviews(site, PID, { now, sleep: async () => {}, onPage: (n, r, wait) => seen.push([n, wait ?? null]) });
  assert.deepEqual([site.opened.filter((u) => /\/product\/p\/itme\?/.test(u)).length, seen.slice(0, 3), read.end, read.reviews.length], [2, [[0, null], [0, 60000], [1, null]], 'last page', 2]);
  const twice = await readProductReviews(siteBrowser((url) => productPage(url, { status: 500, name: null, text: 'Something went wrong!' }), onePage), PID, { now, sleep: async () => {} });
  assert.deepEqual([twice.end, twice.prevented, twice.says], ['prevented', 'error', 'Flipkart prevented this check at the product\'s page: it showed an error, also when the page was opened once more 60 seconds later. The page Flipkart sent had status 500 and the title "Flipkart". No review was read; try again later.']);
});

test('tried again after Flipkart stopped the reading: it goes on from the page where it stopped, the pages read before kept, and opens none when they already reach the date; a page holding only reviews read before (newer reviews moved them down) is not the last page; each page of reviews is opened at least 8 seconds after the page before', async () => {
  const dated = (n, url) => reviewPage(url, [shown(`${n}-1`, `${n * 3} days ago`), shown(`${n}-2`, `${n * 3} days ago`)], { total: 40 });
  // Stopped by an error at page 3 (still there when opened once more), its first two pages kept.
  const first = await readReviews(fakeBrowser((n, url) => (n < 3 ? dated(n, url) : reviewPage(url, [], { status: 500 }))), product, { now, since: '2026-09-22', sleep: async () => {} });
  assert.deepEqual([first.end, first.pages, first.stoppedAt, first.reviews.length, first.refused], ['prevented', 2, 3, 4, { page: 3, status: 500, title: 'Reviews | Flipkart.com', reviews: 0 }]);
  // Tried again: page 3 first, never pages 1 and 2 again; on to the first page all older than the date.
  const asked = [];
  const again = { async begin() {}, async open(url, opts) {
    const n = Number(new URL(url).searchParams.get('page'));
    asked.push([n, opts.gap]);
    return dated(n, url);
  } };
  const on = await readReviews(again, product, { now, since: '2026-09-22', from: first });
  assert.deepEqual([asked, on.end, on.pages, on.wentOn, on.opened, on.reviews.map((r) => r.page)], [[[3, 8000], [4, 8000], [5, 8000], [6, 8000], [7, 8000]], 'date', 7, 3, 5, [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]]);
  assert.equal(REVIEW_PAGE_GAP_MS, 8000);
  // What was kept already reaches the date: no page is opened, and no window either.
  const none = { async begin() { assert.fail('no window is opened'); }, async open() { assert.fail('no page is opened'); } };
  const reached = await readReviews(none, product, { now, since: '2026-09-25', from: on });
  assert.deepEqual([reached.end, reached.opened, reached.pages, reached.reviews.length, reached.says], ['date', 0, 7, 14, '14 reviews read, newest first, until they were all older than 25-09-2026.']);
  // Newer reviews moved the kept ones down: a page of only those is passed, and the reading goes on.
  const moved = await readReviews(fakeBrowser((n, url) => (n === 3 ? dated(2, url) : dated(n, url))), product, { now, since: '2026-09-22', from: first });
  assert.deepEqual([moved.end, moved.pages, moved.reviews.length], ['date', 7, 12]);
  // The gate waits longer for a page that asks for it, never shorter than its own gap.
  let clock = 0;
  const waits = [];
  const gate = createGate({ gapMs: 3000, now: () => clock, sleep: async (ms) => (waits.push(ms), (clock += ms)) });
  for (const gap of [0, 8000, 1000]) await gate.run(async () => {}, () => {}, gap);
  assert.deepEqual(waits, [8000, 3000]);
});

test("a review's own link, as Flipkart's reviews pages send it (/reviews/<product ID>:<number>?reviewId=<review ID>), the only form Flipkart's website opens; a link with only the review's ID, another review's link or anything else makes none. A review's words as a person reads them, without the page's HTML codes", () => {
  const ID = '0a1b2c3d-0000-4000-8000-00000000000e';
  const OWN = `https://www.flipkart.com/reviews/${PID}:1725?reviewId=${ID}`;
  assert.equal(reviewPageLink(`/reviews/${PID}:1725?reviewId=${ID}`, ID), OWN, 'as the page data gives it');
  assert.deepEqual([reviewPageLink(OWN), reviewPageLink(OWN, ID.toUpperCase()), reviewPageLink(`https://flipkart.com/reviews/${PID}:1725/?reviewId=${ID}`)], [OWN, OWN, OWN]);
  assert.equal(linkLabel(OWN), 'Flipkart review');
  const none = [`https://www.flipkart.com/reviews/${ID}`, `https://www.flipkart.com/reviews/${PID}?reviewId=${ID}`, `https://www.flipkart.com/reviews/${PID}:12?reviewId=made-up`, `https://www.example.com/reviews/${PID}:12?reviewId=${ID}`, '', null];
  assert.deepEqual(none.map((l) => reviewPageLink(l)), none.map(() => null));
  assert.equal(reviewPageLink(OWN, '0a1b2c3d-0000-4000-8000-000000000001'), null, "another review's link");
  assert.equal(plainText('It&rsquo;s &amp; &#39;fine&#x27; &ldquo;quite&rdquo; good&hellip; &unknown;'), 'It’s & \'fine\' “quite” good… &unknown;');
  const html = `<script>window.__INITIAL_STATE__ = {"r":{"type":"ProductReviewValue","id":"${ID}","author":"Made-up O&#39;Reviewer","rating":4,"title":"Nice &amp; handy","text":"It&rsquo;s light.","created":"Today"}};</script>`;
  assert.deepEqual(reviewsInPageData(html).map((r) => [r.name, r.title, r.text]), [["Made-up O'Reviewer", 'Nice & handy', 'It’s light.']]);
});

test("every review since a campaign's start date, kept with the last day it was seen on Flipkart: each reading adds the new ones and marks the day it saw the others again (not the ones only carried over from the reading it went on from); ones from before the start date are not kept; how far back a reading shows every review; the kept reviews it does not show, to search too", async () => {
  const made = (i, date, over = {}) => ({ id: `made-up-${i}`, name: `Made-up Reviewer ${i}`, stars: 4, title: 'Nice', text: `Made-up review number ${i}.`, dateSaid: 'Today', date, dateLatest: date, city: 'Test Town', certified: true, reviewFor: null, link: null, page: 1, ...over });
  const START = '2026-10-01';
  // The first reading, on 05-10-2026: the reviews since the start date are kept; the one from before it is not.
  const first = { pid: PID, readAt: '2026-10-05T05:00:00.000Z', end: 'last page', total: 1519, reviews: [made(1, '2026-10-04'), made(2, '2026-10-02'), made(3, '2026-09-28', { page: 2 })] };
  const one = keepReviews(null, first, { start: START, now: new Date('2026-10-05T05:00:00.000Z') });
  assert.equal(one.changed, true);
  assert.deepEqual(one.kept, { pid: PID, start: START, updatedAt: '2026-10-05T05:00:00.000Z', reviews: [1, 2].map((i) => { const { page, ...r } = made(i, i === 1 ? '2026-10-04' : '2026-10-02'); return { ...r, lastSeen: '2026-10-05' }; }) });
  // The same reading again: nothing changes, so nothing need be written.
  assert.equal(keepReviews(one.kept, first, { start: START, now: new Date('2026-10-05T06:00:00.000Z') }).changed, false);
  // Nine days later, newer reviews push review 2 out of the list Flipkart shows: kept still, last seen on 05-10-2026; review 1 is seen again.
  const later = { pid: PID, readAt: '2026-10-14T05:00:00.000Z', end: 'last page', total: 1600, reviews: [made(5, '2026-10-13', { text: 'Made-up review number 5, &amp; more.' }), made(4, '2026-10-10'), made(1, '2026-10-04', { stars: 5 })] };
  const two = keepReviews(one.kept, later, { start: START, now: new Date('2026-10-14T05:00:00.000Z') });
  assert.deepEqual(two.kept.reviews.map((r) => [r.id, r.lastSeen, r.stars]), [['made-up-1', '2026-10-14', 5], ['made-up-2', '2026-10-05', 4], ['made-up-5', '2026-10-14', 4], ['made-up-4', '2026-10-14', 4]], 'its words as Flipkart shows them now');
  // A reading that went on from an earlier one: the reviews it only carried over were not seen again.
  const wentOn = keepReviews(one.kept, { ...later, wentOn: 2, reviews: [made(1, '2026-10-04'), made(6, '2026-10-03', { page: 2 })] }, { start: START, now: new Date('2026-10-14T05:00:00.000Z') });
  assert.deepEqual(wentOn.kept.reviews.map((r) => [r.id, r.lastSeen]), [['made-up-1', '2026-10-05'], ['made-up-2', '2026-10-05'], ['made-up-6', '2026-10-14']]);
  // The start date moved later: what came before it goes. "1 month ago" is kept while its last day can be on or after the start date, and the
  // narrower days of a review read twice are kept ("12 days ago" over "1 month ago").
  const moved = keepReviews(two.kept, { ...later, reviews: [] }, { start: '2026-10-03', now: new Date('2026-10-14T05:00:00.000Z') });
  assert.deepEqual([moved.changed, moved.kept.reviews.map((r) => r.id)], [true, ['made-up-1', 'made-up-5', 'made-up-4']]);
  const month = made(7, '2026-09-14', { dateSaid: '1 month ago', dateLatest: '2026-09-29' });
  const rough = keepReviews(null, { ...later, reviews: [month] }, { start: '2026-09-20' }).kept;
  assert.deepEqual(rough.reviews.map((r) => r.dateSaid), ['1 month ago']);
  const exact = keepReviews(rough, { ...later, readAt: '2026-10-15T05:00:00.000Z', reviews: [{ ...month, dateSaid: '25 days ago', date: '2026-09-20', dateLatest: '2026-09-20' }] }, { start: '2026-09-20' }).kept;
  assert.deepEqual(exact.reviews.map((r) => [r.dateSaid, r.date, r.dateLatest, r.lastSeen]), [['25 days ago', '2026-09-20', '2026-09-20', '2026-10-15']]);
  // The same review with no ID (a page whose data could not be read) is the same review by its name, stars, title and words.
  assert.deepEqual([sameReview(made(1, '2026-10-04'), { ...made(1, '2026-10-04'), id: null, text: 'Made-up  review number 1.' }), sameReview(made(1, '2026-10-04'), made(8, '2026-10-04', { name: 'Made-up Reviewer 1', text: 'Made-up review number 1.' }))], [true, false]);
  assert.deepEqual(keepReviews(one.kept, { ...later, reviews: [{ ...made(2, '2026-10-02'), id: null }] }, { start: START }).kept.reviews.map((r) => [r.id, r.lastSeen]), [['made-up-1', '2026-10-05'], ['made-up-2', '2026-10-14']]);
  // At most MAX_KEPT_REVIEWS, the newest.
  const lots = Array.from({ length: MAX_KEPT_REVIEWS + 2 }, (_, i) => made(`m${i}`, i < 2 ? '2026-10-01' : '2026-10-05'));
  assert.deepEqual([keepReviews(null, { ...later, reviews: lots }, { start: START }).kept.reviews.length, keepReviews(null, { ...later, reviews: lots }, { start: START }).kept.reviews.some((r) => r.date === '2026-10-01')], [MAX_KEPT_REVIEWS, false]);
  // How far back a reading shows every review still on Flipkart: newest first, so after the last one read; all of them when it shows all Flipkart counts.
  assert.deepEqual([reachOf(later), reachOf({ ...later, total: 3 }), reachOf({ ...later, end: 'date' }), reachOf({ ...later, reviews: [made(1, '2026-10-04'), month] }), reachOf({ end: 'none', reviews: [] })], ['2026-10-04', '0000-01-01', '2026-10-04', '2026-09-29', null]);
  assert.deepEqual([reaches('2026-10-04', made(2, '2026-10-05')), reaches('2026-10-04', made(2, '2026-10-04')), reaches('2026-10-04', made(2, '2026-10-02')), reaches(null, made(2, '2026-10-05'))], [true, false, false, false], 'a review posted on the day of the last one read may come after it in the list');
  // The reviews kept that a reading does not show: searched too, each marked kept.
  assert.deepEqual(keptNotRead(later, two.kept.reviews).map((r) => [r.id, r.kept, r.lastSeen]), [['made-up-2', true, '2026-10-05']]);
  // Kept only in data/flipkart/reviews/<product ID>-kept.json; no product ID makes no path.
  const dir = mkdtempSync(join(tmpdir(), 'arc-flipkart-kept-'));
  try {
    const store = createFlipkartStore(dir);
    assert.equal(await store.keptReviews(PID), null);
    await store.saveKeptReviews(PID, two.kept);
    assert.deepEqual([await store.keptReviews(PID), readdirSync(join(dir, 'flipkart', 'reviews')), statSync(join(dir, 'flipkart', 'reviews', `${PID}-kept.json`)).mode & 0o777], [two.kept, [`${PID}-kept.json`], 0o600]);
    await assert.rejects(store.saveKeptReviews('../made-up', two.kept), /Not a Flipkart product ID/);
    assert.equal(await store.keptReviews('../made-up'), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
