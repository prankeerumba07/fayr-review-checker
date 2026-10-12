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
import { readReviews, readAndKeepReviews, MAX_REVIEW_PAGES } from '../flipkart/reviews.js';
import { dateFromWords, indiaDay, reviewsPageLink, reviewsInPageData, pageData } from '../flipkart/review-page.js';
import { whatPageIs } from '../flipkart/page-read.js';
import { createFlipkartStore } from '../flipkart/store.js';

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

test("the reviews in a page's own data, as Flipkart sent the page: each one's own ID, name, stars, title, whole text, date words, city, certified purchase or not, and what it is a review for", () => {
  const review = (id, extra) => ({ value: { type: 'ProductReviewValue', id, author: 'Made-up Reviewer 1', rating: 5, title: 'Terrific', text: 'Made-up text, \n on two lines. ', created: '3 days ago', certifiedBuyer: true, location: { city: 'Test Town', state: 'Test State' }, productAttributeList: [{ name: 'Quantity', value: '50 ml' }], ...extra } });
  const state = {
    multiWidgetState: {
      widgetsData: {
        slots: {
          3: { slotData: { widget: { data: { renderableComponents: [review('made-up-review-1')] } } } },
          4: { slotData: { widget: { data: { renderableComponents: [review('made-up-review-2', { author: 'Flipkart Customer', rating: 9, certifiedBuyer: false, reviewPropertyMap: { VERIFIED_PURCHASE: true }, location: null, productAttributeList: [], title: 'Fair {not} "the end"' })] } } } },
          5: { slotData: { widget: { data: { title: 'Similar products', renderableComponents: [{ value: { type: 'ProductSummaryValue', title: 'Not a review' } }] } } } },
        },
      },
    },
  };
  const html = `<html><body><div>Reviews</div><script id="is_script">window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script><script>window.after = {};</script></body></html>`;
  assert.deepEqual(reviewsInPageData(html), [
    { id: 'made-up-review-1', name: 'Made-up Reviewer 1', stars: 5, title: 'Terrific', text: 'Made-up text,\non two lines.', dateSaid: '3 days ago', city: 'Test Town', certified: true, reviewFor: 'Quantity 50 ml' },
    { id: 'made-up-review-2', name: 'Flipkart Customer', stars: null, title: 'Fair {not} "the end"', text: 'Made-up text,\non two lines.', dateSaid: '3 days ago', city: null, certified: true, reviewFor: null },
  ], 'the stars are 1 to 5; braces and quotes inside the words are no end of the data');
  assert.deepEqual(pageData(html), state);
  for (const none of ['<html><body>No data</body></html>', '<script>window.__INITIAL_STATE__ = {"broken": </script>', '', null]) assert.deepEqual(reviewsInPageData(none), [], String(none));
});

test('newest first, page after page: it stops after the first page whose reviews are all older than the given date, at the last page (a page with no reviews, only reviews already read, as many reviews as Flipkart says there are, or a page Flipkart says does not exist), and when there is no reviews page', async () => {
  const dates = { 1: ['Today', '3 days ago'], 2: ['1 month ago', '6 months ago'], 3: ['7 months ago', 'Feb, 2026'], 4: ['Jan, 2026'] };
  const pages = fakeBrowser((n, url) => reviewPage(url, dates[n].map((w, i) => shown(`${n}-${i}`, w))));
  const out = await readReviews(pages, product, { since: '2026-04-01', now });
  assert.deepEqual(pages.opened, [pageUrl(1), pageUrl(2), pageUrl(3)], 'page 3 is all older than 1 April 2026: page 4 is never opened');
  assert.deepEqual([out.pid, out.link, out.since, out.pages, out.end, out.stoppedAt, out.reviews.length], [PID, GLOW, '2026-04-01', 3, 'date', null, 6]);
  assert.equal(out.says, '6 reviews read from 3 pages, newest first, down to the first page whose reviews are all older than 01-04-2026.');
  assert.deepEqual(out.reviews[2], { id: null, name: 'Made-up Reviewer 2-0', stars: 4, title: 'Nice product', text: 'Made-up review number 2-0.', dateSaid: '1 month ago', date: '2026-09-12', dateLatest: '2026-09-27', city: 'Test Town', certified: true, reviewFor: null, page: 2 });
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
  assert.deepEqual([all.since, all.says], [null, '2 reviews read from 1 page: all the reviews Flipkart shows.']);
  const noLink = fakeBrowser(onePage);
  const none = await readReviews(noLink, { read: { pid: PID, allReviews: null } }, { now });
  assert.deepEqual([noLink.opened, none.end, none.says, none.reviews], [[], 'none', 'Flipkart shows no reviews for this product, so no page was opened.', []]);
});

test('at most 50 pages at one time', async () => {
  const b = fakeBrowser((n, url) => reviewPage(url, Array.from({ length: 10 }, (_, i) => shown(`${n}-${i}`, `${n} days ago`))));
  const out = await readReviews(b, product, { since: '2020-01-01', now });
  assert.equal(MAX_REVIEW_PAGES, 50);
  assert.deepEqual([b.opened.length, b.opened.at(-1), out.pages, out.reviews.length, out.end], [50, pageUrl(50), 50, 500, 'limit']);
  assert.equal(out.says, '500 reviews read from 50 pages, the most read at one time; older reviews were not read.');
});

test('a robot check, a block or an error stops the reading where it is: "Flipkart prevented this check", with its page, and the pages before it kept; so do a page that cannot be opened, a closed window and a page that leads away from Flipkart', async () => {
  const kinds = {
    captcha: [(url) => reviewPage(url, [], { text: 'Are you a human? Please confirm that you are a human.' }), 'it showed a robot check, which this dashboard never answers'],
    blocked: [(url) => reviewPage(url, [], { status: 403, text: 'Access Denied' }), 'it refused the page'],
    error: [(url) => reviewPage(url, [], { status: 500, text: 'Something went wrong!' }), 'it showed an error'],
  };
  for (const [kind, [page2, why]] of Object.entries(kinds)) {
    const b = fakeBrowser((n, url) => (n === 1 ? reviewPage(url, [shown(1, 'Today')]) : page2(url)));
    const out = await readReviews(b, product, { now });
    assert.deepEqual([b.opened.length, out.end, out.stoppedAt, out.pages, out.reviews.length, out.says], [2, 'prevented', 2, 1, 1, `Flipkart prevented this check at page 2 of the reviews: ${why}. The reviews of page 1 were kept.`], kind);
  }
  const at = async (stopAt, stopPage) => (await readReviews(fakeBrowser((n, url) => (n < stopAt ? reviewPage(url, [shown(n, 'Today')]) : stopPage(url))), product, { now })).says;
  assert.equal(await at(1, kinds.captcha[0]), 'Flipkart prevented this check at page 1 of the reviews: it showed a robot check, which this dashboard never answers. No review was read; try again later.');
  assert.equal(await at(4, kinds.blocked[0]), 'Flipkart prevented this check at page 4 of the reviews: it refused the page. The reviews of pages 1 to 3 were kept.');
  assert.equal(await at(2, () => ({ ok: false, error: 'network', message: 'The page could not be opened.' })), 'The Live Flipkart Browser could not open page 2 of the reviews, so the reading stopped there. The page could not be opened. The reviews of page 1 were kept.');
  assert.equal(await at(2, () => ({ ok: false, error: 'closed', message: 'The Live Flipkart Browser was closed.' })), 'The Live Flipkart Browser was closed, so the reading stopped at page 2 of the reviews. The reviews of page 1 were kept.');
  assert.equal(await at(2, () => ({ ok: false, error: 'elsewhere', host: 'www.example.com', message: 'The page went to www.example.com instead of Flipkart.' })), 'Page 2 of the reviews led to www.example.com, not to Flipkart, so the reading stopped there. The reviews of page 1 were kept.');
  assert.equal(await at(2, () => reviewPage('https://www.example.com/test', [shown(9, 'Today')])), 'Page 2 of the reviews led to www.example.com, not to Flipkart, so the reading stopped there. The reviews of page 1 were kept.');
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
