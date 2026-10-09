// The ten steps for one row, through a fake Live Amazon Browser that answers
// with what the saved pages say (read once, in a headless Chrome that reaches
// nothing), pretend picture downloads and pretend picture readers. Both
// screenshots are always checked; the product is compared with the live
// campaigns' products by their real names from Amazon, or, with no campaign,
// with the product name in the sheet. A test for every Type, for each rule
// that decides one, for the short Notes, and one for each pause. Made-up rows
// and made-up products only.
// Run: node test/check.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { readAmazonPage } from '../amazon/page-read.js';
import { runCheck, STEP_NAMES, PAUSE_SAYS } from '../amazon/check.js';
import { FINAL_WORDS } from '../amazon/final.js';
import { checkSettings, TYPE_KEYS } from '../amazon/settings.js';
import { orderIdsIn, datesIn, amountsIn } from '../amazon/screen-text.js';
import { FLOOR, STAIN, KIT, ORDER_ID, OTHER_ORDER_ID, WRITTEN } from './fixtures/amazon/make-order-screenshots.mjs';
import { assertPlain } from './plain-words.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'amazon');
const SETTINGS = checkSettings({});
const BANNED = new RegExp(['ZmF5cg==', 'cmVmdW5k', 'Y2FzaGJhY2s=', 'cmV3YXJk'].map((b) => Buffer.from(b, 'base64').toString('utf8')).join('|'), 'i');

// ---- what each saved page says, read once ----

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
const context = await browser.newContext();
let served = null;
await context.route('**/*', (r) => (r.request().isNavigationRequest() && served ? r.fulfill({ status: 200, contentType: 'text/html', body: served }) : r.abort()));
const page = await context.newPage();
async function factsOf(name, url) {
  served = readFileSync(join(FIX, name), 'utf8');
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  served = null;
  return page.evaluate(readAmazonPage);
}
const REVIEW = (id) => `https://www.amazon.in/gp/customer-reviews/${id}`;
const FACTS = {
  review: await factsOf('review-floor-cleaner.html', REVIEW('R1TESTROW02ABC')),
  starsOnly: await factsOf('review-stars-only.html', REVIEW('R1TESTROW03ABC')),
  gone: await factsOf('review-gone.html', REVIEW('R1TESTROW05ABC')),
  missing: await factsOf('not-found-page.html', REVIEW('R1TESTROW05ABC')),
  landing: await factsOf('short-link-landing.html', `${REVIEW('R1TESTROW07ABC')}?ref=cm_cr_dp_mb_rvw_1`),
  product: await factsOf('product-floor-cleaner.html', 'https://www.amazon.in/dp/B0TESTFLR1'),
  seeAll: await factsOf('see-all-floor-cleaner.html', 'https://www.amazon.in/product-reviews/B0TESTFLR1/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews'),
  search: await factsOf('search-floor-cleaner.html', 'https://www.amazon.in/product-reviews/B0TESTFLR1?filterByKeyword=capful'),
  miss: await factsOf('search-miss.html', 'https://www.amazon.in/product-reviews/B0TESTFLR1?filterByKeyword=vitrified'),
  rackReview: await factsOf('review-page.html', REVIEW('R1TESTREVIEW01')),
  rackProduct: await factsOf('product-page.html', 'https://www.amazon.in/dp/B0TESTMAIN'),
  signin: await factsOf('signin-page.html', 'https://www.amazon.in/ap/signin?openid.return_to=x'),
  captcha: await factsOf('captcha-page.html', 'https://www.amazon.in/errors/validateCaptcha'),
  blocked: await factsOf('error-page.html', REVIEW('R1TESTROW02ABC')),
};
await browser.close();

// ---- a row, its pictures, and what its pictures say ----

const shot = (link) => (link ? { text: link, link, links: [link], mismatch: null, picture: null } : { text: '', link: '', links: [], mismatch: null, picture: null });
const words = (text) => ({ text, link: '', links: [], mismatch: null, picture: null });
const fp = (c) => c.repeat(576);
const pic = (seed, c) => ({ link: `https://drive.google.com/open?id=1Test${seed}abcdefgh`, file: `${seed}.png`, type: 'image/png', sha256: `sha-${seed}`, fingerprint: fp(c) });
const DRIVE_ORDER = 'https://drive.google.com/open?id=1TestOrderRow02abcdefgh';
const DRIVE_DELIVERY = 'https://drive.google.com/open?id=1TestDeliveryRow02abcdef';

function row(over = {}) {
  return {
    id: 'r000000000002',
    source: 'sheet',
    // Row 2 on the dashboard, in row 3 of the file (the heading row is row 1).
    row: 3,
    n: 2,
    hand: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    orderId: { text: ORDER_ID, value: ORDER_ID },
    orderDate: { text: '20-07-2026', value: '2026-07-20' },
    amount: { text: '654', value: 654 },
    product: { text: 'Test Brand Floor Cleaner' },
    cells: { orderId: 'A2', orderDate: 'B2', amount: 'C2', product: 'D2', orderShot: 'E2', deliveryShot: 'F2', reviewLink: 'G2' },
    shots: { order: shot(DRIVE_ORDER), delivery: shot(DRIVE_DELIVERY), review: shot(`${REVIEW('R1TESTROW02ABC')}?ref=cm_cr_dp_d_rvw_ttl`) },
    pictures: { order: [pic('Order02', '1')], delivery: [pic('Delivery02', '2')], review: [] },
    prev: null,
    last: null,
    seenLive: null,
    ...over,
  };
}
// Another row of the sheet: n is its number on the dashboard, which Notes name it by; it is in row n + 1 of the file, under the heading row.
const other = (n, over = {}) =>
  row({
    id: `r0000000000${String(n).padStart(2, '0')}`,
    row: n + 1,
    n,
    orderId: { text: `403-10000${n}-20000${n}`, value: `403-10000${n}-20000${n}` },
    shots: { order: shot(`https://drive.google.com/open?id=1TestOrderRow${n}abcdefgh`), delivery: shot(`https://drive.google.com/open?id=1TestDeliveryRow${n}abcdef`), review: shot(REVIEW(`R1TESTROW${n}ABC`)) },
    pictures: { order: [pic(`Order${n}`, '4')], delivery: [pic(`Delivery${n}`, '8')], review: [] },
    ...over,
  });

const orderRead = (over = {}) => ({
  ok: true,
  problem: null,
  confidence: 90,
  wordCount: 40,
  hindi: true,
  texts: ['Order Details', 'Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Order total %654.00 (1 item)', 'Test Brand Floor Cleaner Liquid, Lavender, 1', 'Litre', 'Grand Total: %654.00'],
  text: 'Order Details',
  orderIds: [ORDER_ID],
  dates: [{ text: '20 July 2026', day: '2026-07-20', year: 2026, month: 7, date: 20, labelled: true }],
  amounts: [{ text: '%654.00', value: 654, label: 'order total' }],
  ...over,
});
const deliveryRead = (over = {}) => ({
  ok: true,
  problem: null,
  confidence: 90,
  wordCount: 30,
  hindi: true,
  texts: ['Your Orders', `Order # ${ORDER_ID}`, 'Delivered 22 July', 'Test Brand Floor Cleaner Liquid,', 'Lavender, 1 Litre'],
  text: 'Your Orders',
  delivered: true,
  deliveredText: 'Delivered 22 July',
  deliveredOn: { day: null, year: null, month: 7, date: 22 },
  orderIds: [ORDER_ID],
  product: FLOOR,
  ...over,
});
/** What a reader makes of some lines, with the order IDs, dates and amounts worked out by the real rules. */
const readOf = (texts, over = {}) => ({ ok: true, problem: null, confidence: 88, wordCount: 60, hindi: true, texts, text: texts.join('\n'), orderIds: orderIdsIn(texts), dates: datesIn(texts), amounts: amountsIn(texts), ...over });
const reviewRead = (over = {}) => ({ ok: true, confidence: 90, text: '', kind: 'unknown', stars: null, starsHow: null, refusal: null, ratingPhrase: null, written: null, productLines: [], productShown: null, why: null, ...over });
const WRITTEN_PICTURE = reviewRead({ kind: 'written', stars: 5, written: { name: WRITTEN.name, title: WRITTEN.title, dateText: WRITTEN.date, body: WRITTEN.body }, text: WRITTEN.body });
const PICTURE_REVIEW = 'https://drive.google.com/open?id=1TestReviewRow11abcdefg';
const NO_ACCESS = 'the Google account logged in to the dashboard has no access to the file';
const PRIVATE = { files: [], problems: [{ link: DRIVE_ORDER, kind: 'drive', site: 'Google Drive', says: NO_ACCESS, noAccess: true }] };
// ---- campaigns: made-up products, as campaignsFor gives them to a check ----
const product = (asin, name, variants = []) => ({ asin, name, short: name.split(/[|,]/)[0].trim(), variants });
const campaign = (name, products) => ({ id: 'k0000000000a1', name, brand: 'Test Brand', products });
const FLOOR_PRODUCT = product('B0TESTFLR1', FLOOR, ['B0TESTFLR2']);
/** The live campaign of the made-up rows' brand: the floor cleaner the pretend pages show. */
const CLEAN = [campaign('Test Clean', [FLOOR_PRODUCT])];
const MONTHLY = 'Test Brand Monthly Home Cleaning Kit | Dishwash Liquid 2L Refill, Floor Cleaner 1L | Plant-Based Formula';
const NO_CAMPAIGN = "There is no campaign for this product's brand, so the product was compared with the product name in the sheet.";
/** The kit the pretend star-rating review page is for. */
const KIT_CAMPAIGN = [campaign('Test Kit', [product('B0TESTKIT1', KIT)])];

/** A browser that answers from the saved pages; answer(url) may change any page. */
function fakeBrowser(answer = () => null) {
  const b = {
    opened: [],
    begun: 0,
    window: false,
    shots: 0,
    async begin() {
      b.begun++;
      b.window = true;
    },
    isOpen: () => b.window,
    async open(url) {
      b.opened.push(url);
      const custom = answer(url);
      if (custom) return custom;
      let facts;
      if (url.includes('/gp/customer-reviews/R1TESTROW02ABC')) facts = FACTS.review;
      else if (url.includes('/gp/customer-reviews/R1TESTROW03ABC')) facts = FACTS.starsOnly;
      else if (url.includes('/gp/customer-reviews/R1TESTREVIEW01')) facts = FACTS.rackReview;
      else if (url.includes('/dp/B0TESTFLR1')) facts = FACTS.product;
      else if (url.includes('/dp/B0TESTMAIN') || url.includes('/dp/B0TESTVAR1')) facts = FACTS.rackProduct;
      else if (url.includes('/product-reviews/B0TESTFLR1') && url.includes('filterByKeyword=')) facts = FACTS.search;
      else if (url.includes('/product-reviews/B0TESTFLR1')) facts = FACTS.seeAll;
      if (!facts) return { ok: false, error: 'network', message: 'The page could not be opened.' };
      return { ok: true, status: 200, url, facts };
    },
    async scrollToReviews() {
      return true;
    },
    async shot() {
      b.shots++;
      return true;
    },
    async savePage() {
      return true;
    },
  };
  return b;
}

const made = [];
async function check({ r = row(), others = [], b = fakeBrowser(), order = orderRead(), delivery = deliveryRead(), review = reviewRead(), pics = {}, campaigns = CLEAN, signal = null, settings = SETTINGS, has = null, reviewer = null } = {}) {
  const events = [];
  const asked = [];
  const result = await runCheck({
    row: r,
    others,
    settings,
    campaigns,
    has,
    reviewer,
    pictures: async (which) => {
      asked.push(which);
      return pics[which] ?? { files: [`/pictures/${which}-0.png`], problems: [] };
    },
    readOrder: async () => (typeof order === 'function' ? order() : order),
    readDelivery: async () => (typeof delivery === 'function' ? delivery() : delivery),
    readReview: async (files, opts) => (asked.push(`review for ${opts?.product}`), typeof review === 'function' ? review() : review),
    browser: b,
    emit: (e) => events.push(e),
    signal,
    checkId: 'c20261005120000abcdef',
    shotsDir: '/nowhere',
    pagesDir: null,
  });
  // Every word a check makes, for the test at the end: its Note, Type, steps, pause and what it says it is doing.
  made.push(result.note, result.type, result.paused?.says, ...result.steps.map((s) => s.detail), ...events.filter((e) => e.event === 'action').map((e) => e.says), ...result.alsoDuplicate.map((d) => d.note));
  for (const c of result.comparison) made.push(c.result, c.sheet, c.order, c.delivery, c.amazon);
  return { result, events, b, asked, states: result.steps.map((s) => s.state), note: result.note };
}
/** The sentences of a Note: it is one paragraph. */
const sentencesOf = (note) => String(note ?? '').split(/(?<=[.!?]"?)\s+(?=[A-Z])/);
/** The first sentence of a Note: the Status and its reason. */
const FAILED = (why) => `This transaction failed because ${why}.`;
const STAFF = (why) => `A staff member needs to check this transaction because ${why}.`;
const DUPLICATE = (line) => FAILED(`it is a duplicate: ${line}`);
const VERIFIED = 'This transaction passed: the purchase screenshot and the delivery screenshot match the form, and the review is live and public on Amazon.';
const MATCH = 'The purchase screenshot and the delivery screenshot match the form.';
const GAVE_ID = `The user gave order ID ${ORDER_ID}`;
/** The second sentence for a different detail: what the user gave, and what a screenshot shows. */
const ID_ON = (where) => FAILED(`the order ID on ${where} does not match the order ID the user gave`);
const REVIEW_NOT_CHECKED = 'A screenshot has a problem, so the review was not checked.';
/** The comparison row for a field. */
const field = (result, name) => result.comparison.find((c) => c.field === name);

// ---- the steps ----

test('the ten steps, in the order asked for', () => {
  assert.deepEqual(STEP_NAMES, [
    'Duplicates and links in the sheet',
    'Opening the purchase screenshot',
    'Reading the purchase screenshot and comparing it with the sheet',
    'Opening the delivery screenshot',
    'Reading the delivery screenshot and comparing it',
    'Opening the review link',
    'Reading the rating and the written words',
    'Opening the product\'s page and "See all reviews"',
    'Searching for the review',
    'Status, Type and Note',
  ]);
});

test('Verified: both screenshots match on every detail, and the review the link opens is live, with no search needed; the Note is one sentence', async () => {
  const { result, states, b, events, asked } = await check();
  assert.equal(result.status, 'Pass');
  assert.equal(result.type, 'Verified');
  assert.equal(result.typeKey, 'verified');
  assert.deepEqual(states, [...Array(7).fill('pass'), 'not-needed', 'not-needed', 'pass'], 'a review the link opens is live: the product page and "See all reviews" are not needed');
  assert.deepEqual(asked, ['order', 'delivery'], 'the pictures, never the Amazon link, are downloaded');
  assert.equal(result.reviewId, 'R1TESTROW02ABC');
  assert.ok(result.liveAt);
  assert.deepEqual(result.publicReview, { searched: [], found: true, id: 'R1TESTROW02ABC', link: 'https://www.amazon.in/gp/customer-reviews/R1TESTROW02ABC' });
  assert.equal(result.steps[8].detail, 'The review link opened the review on Amazon, so it is live and public; no search is needed.');
  assert.equal(result.note, VERIFIED, 'when everything matched, one sentence says so');
  assert.deepEqual([result.final, result.finalSays], ['pass', VERIFIED]);
  assert.equal(result.steps[9].detail, 'Pass: Verified.', 'step 10, "Status, Type and Note": the Status, then the Type');
  assert.equal(result.steps[9].name, 'Status, Type and Note');
  assert.deepEqual(b.opened.map((u) => new URL(u).pathname), ['/gp/customer-reviews/R1TESTROW02ABC'], 'one Amazon page: the review itself');
  assert.equal(events[0].event, 'started');
  assert.equal(events.at(-1).event, 'done');
  assert.deepEqual(result.comparison.map((c) => c.field), ['Order ID', 'Order date', 'Amount', 'Product', 'Delivered', 'Rating', 'Written review', 'Live and public']);
  assert.deepEqual(result.comparison.map((c) => c.ok), [true, true, true, true, true, true, null, true]);
  assert.ok(result.steps.slice(5).every((s) => s.shot), 'a picture of the Live Amazon Browser after each step once it is open');
  assert.equal(result.steps[2].detail, "Order ID: the same. Order date: the same. Amount: the same. Product: one of the campaign's products.");
  assert.equal(result.steps[4].detail, 'It says "Delivered 22 July". Order ID: the same. Order date: not shown. Amount: not shown. Product: one of the campaign\'s products.');
  assert.doesNotMatch(result.steps[6].detail, /name only/, "the reviewed product is one of the campaign's products, by its link");
  assert.deepEqual([field(result, 'Product').order, field(result, 'Product').result], ['One of the campaign\'s products: "Test Brand Floor Cleaner Liquid"', "One of the campaign's products on both screenshots."]);
});

test('Verified from a picture of a written review: found live on Amazon through the Products box', async () => {
  const r = row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } });
  const { result, states, asked } = await check({ r, review: WRITTEN_PICTURE });
  assert.equal(result.type, 'Verified', result.note);
  assert.deepEqual(states, Array(10).fill('pass'));
  assert.deepEqual(asked, ['order', 'delivery', 'review', 'review for Test Brand Floor Cleaner Liquid'], 'the picture is read for the product the screenshots show');
  assert.equal(result.reviewId, 'R1TESTPICREV1');
  assert.equal(result.note, VERIFIED);
  assert.match(result.steps[8].detail, /^Found the review in the product's public reviews by searching for "\w+"\.$/);
});

test('Rating Only from a picture: Verified, and the Note says the rating was seen on the review screenshot', async () => {
  const r = row({ product: { text: 'Test Brand Stain Remover' }, shots: { ...row().shots, review: shot(PICTURE_REVIEW) } });
  const order = orderRead({ texts: ['Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Order total %654.00', `${STAIN}`] });
  const delivery = deliveryRead({ texts: ['Delivered 22 July', `Order # ${ORDER_ID}`, STAIN] });
  const { result, states, b } = await check({ r, order, delivery, campaigns: [campaign('Test Stain', [product('B0TESTSTN1', STAIN)])], review: reviewRead({ kind: 'rating', stars: 4, ratingPhrase: 'Thanks for rating!', productShown: { share: 1, shown: STAIN } }) });
  assert.equal(result.status, 'Pass');
  assert.equal(result.type, 'Rating Only');
  assert.deepEqual(states, ['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'not-needed', 'not-needed', 'pass']);
  assert.equal(result.note, 'This transaction passed: the purchase screenshot and the delivery screenshot match the form, and the review screenshot shows a star rating with no written words.');
  assert.equal(result.final, 'pass');
  assert.equal(b.opened.length, 0, 'Amazon is never opened for a picture of a rating');
});

test('Rating Only from an Amazon review page that shows stars and no written words', async () => {
  const r = row({ product: { text: 'Test Brand Home Cleaning Kit' }, shots: { ...row().shots, review: shot(REVIEW('R1TESTROW03ABC')) } });
  const order = orderRead({ texts: ['Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Order total %654.00', 'Test Brand Home Cleaning Kit, 6 Pieces'] });
  const delivery = deliveryRead({ texts: ['Delivered 22 July', `Order # ${ORDER_ID}`, 'Test Brand Home Cleaning Kit, 6 Pieces'] });
  const { result, states, b } = await check({ r, order, delivery, campaigns: KIT_CAMPAIGN });
  assert.equal(result.type, 'Rating Only', result.note);
  assert.equal(result.status, 'Pass');
  assert.deepEqual(states.slice(6), ['pass', 'not-needed', 'not-needed', 'pass']);
  assert.equal(result.note, 'This transaction passed: the purchase screenshot and the delivery screenshot match the form, and the review on Amazon is a star rating with no written words.');
  assert.equal(b.opened.length, 1);
});

// ---- row 20's case, and the rules for both screenshots ----

test("row 20's case: the purchase screenshot matches, the delivery screenshot is for another order; both are read, the rupee sign read as a 7 is the amount, and the name cut short is the campaign's product", async () => {
  const r = row({ orderDate: { text: '12-07-2026', value: '2026-07-12' }, amount: { text: '754', value: 754 }, product: { text: 'Test Brand Floor & Toilet Cleaner' } });
  // As Tesseract reads a purchase screenshot: "₹" as %, २, 2 or 7, and a product's name cut short by Amazon.
  const order = readOf(['Test Brand Monthly Home Cleani...', '2749.00', 'Track package  Cancel items', 'Order summary', 'Order placed 12 July 2026', `Order number ${ORDER_ID}`, 'Item(s) Subtotal: %749.00', 'Shipping: 240.00', 'Marketplace Fee: २5.00', 'Total: 2794.00', 'Promotion Applied: -%40.00', 'Grand Total: 7754.00']);
  const delivery = deliveryRead({ texts: ['Delivered 15 July', `Order # ${OTHER_ORDER_ID}`, 'Test Brand Monthly Home Cleaning Kit | Dishwash', 'Liquid 2L Refill, Floor Cleaner 1L'], orderIds: [OTHER_ORDER_ID], deliveredText: 'Delivered 15 July', deliveredOn: { day: null, year: null, month: 7, date: 15 } });
  const { result, states, asked, b } = await check({ r, order, delivery, campaigns: [campaign('Test Clean', [product('B0TESTKIT9', MONTHLY)])] });
  assert.equal(result.type, 'Order ID is not matching', result.note);
  assert.equal(result.note, `${ID_ON('the delivery screenshot')} ${GAVE_ID}, and the delivery screenshot shows order ID ${OTHER_ORDER_ID}.`, 'the product is the campaign\'s, though the sheet calls it "Test Brand Floor & Toilet Cleaner"');
  assert.equal(result.final, 'fail');
  assert.deepEqual(asked, ['order', 'delivery'], 'the delivery screenshot is read even though the purchase screenshot has a problem');
  assert.deepEqual(states, ['pass', 'pass', 'pass', 'pass', 'fail', 'not-reached', 'not-reached', 'not-reached', 'not-reached', 'fail']);
  assert.equal(b.opened.length, 0, 'the review is never opened when a screenshot has a problem');
  assert.deepEqual([field(result, 'Amount').order, field(result, 'Amount').result, field(result, 'Amount').ok], ['The same: ₹754, the grand total', 'The same on the purchase screenshot.', true], '"Grand Total: 7754.00" is ₹754 with its rupee sign read as a 7');
  assert.deepEqual([field(result, 'Order date').order, field(result, 'Order ID').delivery, field(result, 'Product').order, field(result, 'Product').sheet], ['The same: 12-07-2026', `Different: ${OTHER_ORDER_ID}`, 'One of the campaign\'s products: "Test Brand Monthly Home Cleaning Kit"', "Test Brand Floor & Toilet Cleaner (not compared: the campaign's products are used)"]);
  assert.doesNotMatch(result.note, /amount/i, 'the amount is not called different');
});

test('both screenshots are checked every time they can be opened, even when the first one already has a problem', async () => {
  const privateAndOther = await check({ pics: { order: PRIVATE }, delivery: deliveryRead({ orderIds: [OTHER_ORDER_ID] }) });
  assert.deepEqual(privateAndOther.asked, ['order', 'delivery']);
  assert.equal(privateAndOther.result.type, 'Order ID is not matching', 'a different order ID comes before a screenshot that cannot be opened');
  assert.equal(privateAndOther.result.note, `${ID_ON('the delivery screenshot')} ${GAVE_ID}, and the delivery screenshot shows order ID ${OTHER_ORDER_ID}. The purchase screenshot is on Google Drive, but ${NO_ACCESS}.`);
  assert.equal(privateAndOther.result.final, 'fail', 'a problem that fails the transaction wins over one a staff member must look at');
  assert.deepEqual(privateAndOther.states.slice(0, 5), ['pass', 'fail', 'not-reached', 'pass', 'fail']);
  assert.equal(privateAndOther.result.steps[2].detail, 'The purchase screenshot could not be opened, so it was not read.');
  const wrongOrder = await check({ order: orderRead({ orderIds: [OTHER_ORDER_ID] }), delivery: deliveryRead({ texts: ['Delivered 22 July', `Order # ${ORDER_ID}`, 'Test Brand Stain Remover Spray, 500 ml'] }) });
  assert.equal(wrongOrder.result.type, 'Order ID is not matching');
  assert.equal(wrongOrder.result.note, `${ID_ON('the purchase screenshot')} ${GAVE_ID}, and the purchase screenshot shows order ID ${OTHER_ORDER_ID}. The product is also not one of the products of the campaign "Test Clean": the delivery screenshot shows "Test Brand Stain Remover Spray".`, 'the delivery screenshot was read too, and its problem named');
});

test('the Type is the first problem that fails the row, in this order: order ID, product, not delivered, missing or not opened, order date or amount, not shown; with none that fails, the first problem', async () => {
  const otherProduct = { texts: ['Delivered 22 July', `Order # ${ORDER_ID}`, 'Test Brand Stain Remover Spray, 500 ml'] };
  const cases = [
    ['a different order ID before everything', { order: orderRead({ orderIds: [OTHER_ORDER_ID], amounts: [] }), delivery: deliveryRead({ ...otherProduct, delivered: false }) }, 'Order ID is not matching'],
    ['a different product before not delivered', { delivery: deliveryRead({ ...otherProduct, delivered: false, deliveredText: null }) }, 'Product is not matching'],
    ['not delivered before a missing screenshot', { r: row({ shots: { ...row().shots, order: shot(null) } }), delivery: deliveryRead({ delivered: false, deliveredText: null, texts: ['Arriving tomorrow', `Order # ${ORDER_ID}`, 'Test Brand Floor Cleaner Liquid,', 'Lavender, 1 Litre'] }) }, 'Not delivered'],
    ['"Delivered" not found (it may be a reading mistake) never names a row that fails for a missing screenshot', { r: row({ shots: { ...row().shots, order: shot(null) } }), delivery: deliveryRead({ delivered: false, deliveredText: null }) }, 'Purchase screenshot missing'],
    ['a missing screenshot before a different amount', { r: row({ shots: { ...row().shots, order: shot(null) } }), delivery: deliveryRead({ amounts: [{ text: '₹999.00', value: 999, label: 'order total' }] }) }, 'Purchase screenshot missing'],
    ['a different date, which fails, before a screenshot that cannot be opened, which needs a staff member', { pics: { delivery: { files: [], problems: [{ kind: 'drive', site: 'Google Drive', says: NO_ACCESS, noAccess: true }] } }, order: orderRead({ dates: [{ text: '18 July 2026', day: '2026-07-18', year: 2026, month: 7, date: 18, labelled: true }] }) }, 'Order details not matching'],
    ['a screenshot that cannot be opened, with nothing that fails', { pics: { delivery: { files: [], problems: [{ kind: 'drive', site: 'Google Drive', says: NO_ACCESS, noAccess: true }] } } }, 'Need Google Drive Access'],
    ['a different amount before a detail not shown', { r: row({ amount: { text: '851', value: 851 } }), delivery: deliveryRead({ orderIds: [] }) }, 'Order details not matching'],
    ['a detail not shown: that screenshot is not clear', { delivery: deliveryRead({ orderIds: [], texts: ['Delivered 22 July', 'Package was handed to resident'] }) }, 'Delivery screenshot not clear'],
    ['the purchase screenshot first when both have a detail not shown', { order: orderRead({ texts: ['Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Order total %654.00'] }), delivery: deliveryRead({ orderIds: [] }) }, 'Purchase screenshot not clear'],
  ];
  for (const [what, opts, type] of cases) {
    const { result, b } = await check(opts);
    assert.equal(result.type, type, `${what}: ${result.note}`);
    assert.equal(result.status, FINAL_WORDS[result.final], `${what}: the Status is Pass, Fail or Needs Manual Staff Checking`);
    assert.notEqual(result.status, 'Unverified');
    assert.equal(b.opened.length, 0, `${what}: the review is not opened`);
  }
});

test('a detail that is not shown, or could not be read, is never called different; the purchase screenshot must show the order ID, the delivery screenshot need not', async () => {
  const noId = await check({ order: orderRead({ orderIds: [] }) });
  assert.equal(noId.result.type, 'Purchase screenshot not clear');
  assert.equal(noId.result.note, STAFF('the purchase screenshot does not show an order ID, so it cannot be matched to this order'));
  assert.equal(noId.result.final, 'manual');
  assert.deepEqual([field(noId.result, 'Order ID').order, field(noId.result, 'Order ID').result, field(noId.result, 'Order ID').ok], ['Not shown', 'The same on the delivery screenshot; not shown on the purchase screenshot.', false]);
  assert.equal(noId.b.opened.length, 0);
  assert.deepEqual(noId.states.slice(5, 9), Array(4).fill('not-reached'));
  assert.ok(noId.result.steps.slice(5, 9).every((s) => s.detail === REVIEW_NOT_CHECKED));
  // The delivery screenshot need not show the order ID: its product ties it to the order.
  const onlyOrder = await check({ delivery: deliveryRead({ orderIds: [] }) });
  assert.equal(onlyOrder.result.type, 'Verified', 'the order ID on the purchase screenshot is enough');
  assert.deepEqual([field(onlyOrder.result, 'Order ID').delivery, field(onlyOrder.result, 'Order ID').result, field(onlyOrder.result, 'Order ID').ok], ['Not shown', 'The same on the purchase screenshot; not shown on the delivery screenshot.', true]);
  const neither = await check({ order: orderRead({ orderIds: [] }), delivery: deliveryRead({ orderIds: [] }) });
  assert.equal(neither.result.note, STAFF('neither screenshot shows an order ID, so it cannot be matched to this order'));
  // A delivery screenshot with this order's ID but no product name is this order's delivery.
  const noProduct = await check({ delivery: deliveryRead({ texts: ['Your Orders', `Order # ${ORDER_ID}`, 'Delivered 22 July', 'Package was handed to resident'] }) });
  assert.equal(noProduct.result.type, 'Verified', "the order ID ties the delivery screenshot to the order");
  assert.equal(noProduct.result.note, `${VERIFIED} The delivery screenshot does not show the product's name, but it shows this order's ID.`);
  assert.deepEqual([field(noProduct.result, 'Product').result, field(noProduct.result, 'Product').ok], ["One of the campaign's products on the purchase screenshot; not shown on the delivery screenshot.", true]);
  // With neither the product nor the order ID, it cannot be matched to the order.
  const nothing = await check({ delivery: deliveryRead({ orderIds: [], texts: ['Your Orders', 'Delivered 22 July', 'Package was handed to resident'] }) });
  assert.equal(nothing.result.type, 'Delivery screenshot not clear');
  assert.equal(nothing.result.note, STAFF("the delivery screenshot shows neither the product's name nor this order's ID, so it cannot be matched to this order"));
  assert.equal(nothing.result.final, 'manual');
  assert.equal(nothing.states[4], 'fail', 'the delivery step shows it');
  assert.equal(nothing.result.steps[4].detail, 'It says "Delivered 22 July". Order ID: not shown. Order date: not shown. Amount: not shown. Product: not shown. The delivery screenshot shows neither the product\'s name nor this order\'s ID, so it cannot be matched to this order.');
  const sheetNoProduct = await check({ campaigns: [], delivery: deliveryRead({ texts: ['Your Orders', `Order # ${ORDER_ID}`, 'Delivered 22 July', 'Package was handed to resident'] }) });
  assert.equal(sheetNoProduct.result.note, `${VERIFIED} The delivery screenshot does not show the product's name, but it shows this order's ID. ${NO_CAMPAIGN}`);
  // A name cut short on the purchase screenshot is the start of the product's name, which the delivery screenshot shows in full.
  const cut = await check({ campaigns: [], order: orderRead({ texts: ['Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Order total %654.00', 'Test Brand Floor Cl...'] }) });
  assert.equal(cut.result.type, 'Verified', 'with no campaign too, a name cut short is the start of the name the delivery screenshot shows');
  assert.equal(cut.result.note, `${VERIFIED} The purchase screenshot shows only the start of the product's name, "Test Brand Floor Cl...", which the delivery screenshot shows in full. ${NO_CAMPAIGN}`);
  const cutAlone = await check({ campaigns: [], order: orderRead({ texts: ['Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Order total %654.00', 'Test Brand Floor Cl...'] }), delivery: deliveryRead({ orderIds: [], texts: ['Delivered 22 July', 'Package was handed to resident'] }) });
  assert.equal(cutAlone.result.type, 'Purchase screenshot not clear', 'a start alone, with no delivery screenshot to show the rest, is not enough');
  assert.equal(cutAlone.result.note, `${STAFF('the purchase screenshot shows only the start of the product\'s name, "Test Brand Floor Cl...", which could be more than one product, so it cannot be matched to this order')} The delivery screenshot shows neither the product's name nor this order's ID, so it cannot be matched to this order. ${NO_CAMPAIGN}`);
  // The product's name missing from the purchase screenshot: the delivery screenshot of the same order shows it.
  const address = await check({ order: orderRead({ texts: ['Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Order total %654.00', '158, 1st floor'] }) });
  assert.equal(address.result.type, 'Verified', 'one word of an address line is not a product, but the delivery screenshot, with the same order ID, shows the product');
  assert.equal(address.result.note, `${VERIFIED} The product's name is not on the purchase screenshot, but the delivery screenshot shows it, with the same order ID.`);
  const addressAlone = await check({ order: orderRead({ texts: ['Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Order total %654.00', '158, 1st floor'] }), delivery: deliveryRead({ orderIds: [] }) });
  assert.equal(addressAlone.result.type, 'Purchase screenshot not clear', 'without the order ID on the delivery screenshot, the product is not tied to this order');
  const unreadable = await check({ delivery: deliveryRead({ ok: false, problem: 'its words are not clear enough to read', delivered: false, orderIds: [] }) });
  assert.equal(unreadable.result.type, 'Delivery screenshot not clear', 'a screenshot that cannot be read is never "not delivered"');
  assert.equal(unreadable.result.note, `${STAFF('the delivery screenshot could not be read: its words are not clear enough to read')} Ask for a clearer screenshot, then check this row again.`);
});

test('the order date and the amount: shown on at least one screenshot, and the same wherever they are shown', async () => {
  const ORDERED_20 = { text: '20 July 2026', day: '2026-07-20', year: 2026, month: 7, date: 20, labelled: true };
  const onDeliveryOnly = await check({ order: orderRead({ dates: [], amounts: [] }), delivery: deliveryRead({ dates: [ORDERED_20], amounts: [{ text: '₹654.00', value: 654, label: 'order total' }] }) });
  assert.equal(onDeliveryOnly.result.type, 'Verified', 'shown on the delivery screenshot only is enough');
  assert.equal(field(onDeliveryOnly.result, 'Order date').result, 'The same on the delivery screenshot.');
  const priceOnly = await check({ order: orderRead({ dates: [], amounts: [] }), delivery: deliveryRead({ dates: [ORDERED_20], amounts: [{ text: '₹654.00', value: 654, label: null }] }) });
  assert.equal(priceOnly.result.type, 'Purchase screenshot not clear', "an item's price alone on the delivery screenshot is not the order's amount");
  const otherDay = await check({ delivery: deliveryRead({ dates: [{ ...ORDERED_20, text: '18 July 2026', day: '2026-07-18', date: 18 }] }) });
  assert.equal(otherDay.result.type, 'Order details not matching', 'the same on one screenshot is not enough when the other shows another date');
  assert.equal(otherDay.result.note, `${FAILED('the order date on the delivery screenshot does not match the order date the user gave')} The user gave the order date 20-07-2026, and the delivery screenshot shows 18-07-2026.`);
  const noDate = await check({ order: orderRead({ dates: [] }) });
  assert.equal(noDate.result.type, 'Purchase screenshot not clear');
  assert.equal(noDate.result.note, STAFF('neither screenshot shows the order date, so it cannot be matched to this order'));
  assert.match(noDate.result.steps[4].detail, /Neither screenshot shows the order date\.$/);
  const noAmount = await check({ order: orderRead({ amounts: [] }) });
  assert.equal(noAmount.result.note, STAFF('neither screenshot shows the amount, so it cannot be matched to this order'));
  const delivered = readOf(['Your Orders', `Order # ${ORDER_ID}`, 'Delivered 22 July 2026', 'Test Brand Floor Cleaner Liquid,', 'Lavender, 1 Litre'], { delivered: true, deliveredText: 'Delivered 22 July 2026' });
  assert.equal((await check({ delivery: delivered })).result.type, 'Verified', 'the day it was delivered is never taken for the order date');
  const arriving = readOf(['Order Details', `Order # ${ORDER_ID}`, 'Arriving 25 July 2026', 'Order total %654.00', 'Test Brand Floor Cleaner Liquid, Lavender, 1 Litre']);
  assert.equal((await check({ order: arriving })).result.type, 'Purchase screenshot not clear', 'nor the day it is arriving: that is not the order date shown');
});

test('Order details not matching: a different order date or amount, with both values', async () => {
  const amount = await check({ r: row({ amount: { text: '851', value: 851 } }) });
  assert.equal(amount.result.type, 'Order details not matching');
  assert.equal(amount.result.note, `${FAILED('the amount on the purchase screenshot does not match the amount the user gave')} The user gave the amount ₹851, and the purchase screenshot shows ₹654 as the order total.`);
  const near = await check({ r: row({ amount: { text: '654.50', value: 654.5 } }) });
  assert.equal(near.result.type, 'Verified', 'within the passing mark for amounts');
  const day = await check({ r: row({ orderDate: { text: '16-07-2026', value: '2026-07-16' } }) });
  assert.equal(day.result.note, `${FAILED('the order date on the purchase screenshot does not match the order date the user gave')} The user gave the order date 16-07-2026, and the purchase screenshot shows 20-07-2026.`, 'dates day first');
  const both = await check({ r: row({ amount: { text: '851', value: 851 }, orderDate: { text: '16-07-2026', value: '2026-07-16' } }) });
  assert.equal(both.result.note, `${FAILED('the order date on the purchase screenshot does not match the order date the user gave')} The user gave the order date 16-07-2026, and the purchase screenshot shows 20-07-2026. The amount is also different: the user gave ₹851, but the purchase screenshot shows ₹654 as the order total.`, 'one more short sentence for the other problem');
});

test('Order ID is not matching: on the purchase screenshot, on the delivery screenshot, or on both; order IDs in full', async () => {
  const onOrder = await check({ order: orderRead({ orderIds: [OTHER_ORDER_ID] }) });
  assert.equal(onOrder.result.type, 'Order ID is not matching');
  assert.equal(onOrder.result.note, `${ID_ON('the purchase screenshot')} ${GAVE_ID}, and the purchase screenshot shows order ID ${OTHER_ORDER_ID}.`);
  const onDelivery = await check({ delivery: deliveryRead({ orderIds: [OTHER_ORDER_ID] }) });
  assert.equal(onDelivery.result.note, `This transaction failed because the order ID on the delivery screenshot does not match the order ID the user gave. ${GAVE_ID}, and the delivery screenshot shows order ID ${OTHER_ORDER_ID}.`, 'the example asked for, word for word');
  const onBoth = await check({ order: orderRead({ orderIds: [OTHER_ORDER_ID] }), delivery: deliveryRead({ orderIds: [OTHER_ORDER_ID] }) });
  assert.equal(onBoth.result.note, `${ID_ON('both screenshots')} ${GAVE_ID}, and both screenshots show order ID ${OTHER_ORDER_ID}.`);
});

test('Product is not matching: on a screenshot, on a picture of a rating, and on Amazon (by its links, or by name)', async () => {
  const onDelivery = await check({ delivery: deliveryRead({ texts: ['Delivered 22 July', `Order # ${ORDER_ID}`, 'Test Brand Stain Remover Spray, 500 ml'] }) });
  assert.equal(onDelivery.result.type, 'Product is not matching');
  assert.equal(onDelivery.result.note, `${FAILED('the product on the delivery screenshot is not one of the products of the campaign "Test Clean"')} The delivery screenshot shows "Test Brand Stain Remover Spray".`);
  const sheetOnDelivery = await check({ campaigns: [], delivery: deliveryRead({ texts: ['Delivered 22 July', `Order # ${ORDER_ID}`, 'Test Brand Stain Remover Spray, 500 ml'] }) });
  assert.equal(sheetOnDelivery.result.note, `${FAILED('the product on the delivery screenshot does not match the product the user gave')} The user gave the product "Test Brand Floor Cleaner", and the delivery screenshot shows "Test Brand Stain Remover Spray, 500 ml". ${NO_CAMPAIGN}`);
  const kit = await check({ campaigns: [], r: row({ product: { text: 'Test Brand Home Cleaning Kit' } }) });
  assert.equal(kit.result.type, 'Product is not matching', 'the brand and one more word make it a name shown, and different');
  assert.equal(kit.result.note, `${FAILED('the product on both screenshots does not match the product the user gave')} The user gave the product "Test Brand Home Cleaning Kit", and the purchase screenshot shows "Test Brand Floor Cleaner Liquid, Lavender, 1" and the delivery screenshot shows "Test Brand Floor Cleaner Liquid,". ${NO_CAMPAIGN}`);
  const picture = await check({ r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: reviewRead({ kind: 'rating', stars: 4, productLines: [STAIN], productShown: { share: 0.5, shown: STAIN } }) });
  assert.equal(picture.result.type, 'Product is not matching');
  assert.equal(picture.result.note, `${FAILED(`the review screenshot shows a star rating for "${STAIN}", which is not one of the products of the campaign "Test Clean"`)} ${MATCH}`);
  const byName = await check({ campaigns: [], r: row({ shots: { ...row().shots, review: shot(REVIEW('R1TESTREVIEW01')) } }) });
  assert.equal(byName.result.type, 'Product is not matching');
  assert.equal(byName.result.note, `${FAILED('the review is for "Test Brand Folding Garment Rack with Wheels", which is a different product from "Test Brand Floor Cleaner"')} ${MATCH} ${NO_CAMPAIGN}`, 'with no campaign, by name');
  const notOfIt = await check({ r: row({ shots: { ...row().shots, review: shot(REVIEW('R1TESTREVIEW01')) } }) });
  assert.equal(notOfIt.result.note, `${FAILED('the review is for "Test Brand Folding Garment Rack with Wheels", which is not the product the screenshots show, "Test Brand Floor Cleaner Liquid", or another colour or size of it')} ${MATCH}`);
  const byLink = await check({ campaigns: [campaign('Test Clean', [product('B0TESTOTHR', FLOOR)])] });
  assert.equal(byLink.result.type, 'Product is not matching');
  assert.equal(byLink.result.note, `${FAILED('the review is for "Test Brand Floor Cleaner Liquid", which is not the product the screenshots show, "Test Brand Floor Cleaner Liquid", or another colour or size of it')} ${MATCH}`, 'named by the start of its real name, never by its ASIN number; told apart by its ASIN');
  const listed = await check({ campaigns: [campaign('Test Clean', [product('B0TESTOTHR', FLOOR, ['B0TESTFLR1'])])] });
  assert.equal(listed.result.type, 'Verified', "a colour or size the campaign's product page listed");
  const size = await check({ campaigns: [campaign('Test Clean', [product('B0TESTFLR2', FLOOR)])] });
  assert.equal(size.result.type, 'Verified', "another size of one of the campaign's products");
  assert.match(size.result.steps[7].detail, /another colour or size of one of the campaign's products/);
});

test('Not delivered: words in the delivery cell, or a screenshot that does not say Delivered; a delivery before the order date is said', async () => {
  const cancelled = await check({ r: row({ shots: { ...row().shots, delivery: words('Cancelled') } }) });
  assert.equal(cancelled.result.type, 'Not delivered');
  assert.equal(cancelled.result.note, FAILED('the user wrote "Cancelled" in the form instead of giving a delivery screenshot, so the order was not delivered'));
  assert.equal(cancelled.result.final, 'fail');
  assert.equal((await check({ r: row({ shots: { ...row().shots, delivery: words('Lost in transit') } }) })).result.type, 'Not delivered');
  const arriving = await check({ delivery: deliveryRead({ delivered: false, deliveredText: null }) });
  assert.equal(arriving.result.type, 'Not delivered');
  assert.equal(arriving.result.note, STAFF('the word "Delivered" could not be found on the delivery screenshot'), 'it may be a reading mistake');
  assert.equal(arriving.result.final, 'manual');
  const early = await check({ delivery: deliveryRead({ deliveredOn: { day: null, year: null, month: 7, date: 18 } }) });
  assert.equal(early.result.type, 'Verified', 'not a fail');
  assert.equal(early.result.note, `${VERIFIED} The delivery date, 18-07-2026, is before the order date, 20-07-2026.`);
});

// ---- campaigns: the product as Amazon names it ----

/** The pretend review page, as a review of the kit instead of the floor cleaner. */
const KIT_REVIEW = fakeBrowser((url) => (url.includes('R1TESTROW02ABC') ? { ok: true, status: 200, url, facts: { ...FACTS.review, reviewProduct: { asin: 'B0TESTKIT9', title: MONTHLY, href: '/dp/B0TESTKIT9' } } } : null));

test("a campaign: the product on both screenshots must be one of its products, by its real name from Amazon; the product name in the sheet is not compared; the review must be of the product bought", async () => {
  const kitAndFloor = [campaign('Test Clean', [product('B0TESTKIT9', MONTHLY), FLOOR_PRODUCT])];
  const r = row({ product: { text: 'Test Brand Floor & Toilet Cleaner' } });
  const order = orderRead({ texts: ['Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Order total %654.00', 'Test Brand Monthly Home Cleani...'] });
  const delivery = deliveryRead({ texts: ['Your Orders', `Order # ${ORDER_ID}`, 'Delivered 22 July', 'Test Brand Monthly Home Cleaning Kit | Dishwash', 'Liquid 2L Refill, Floor Cleaner 1L'] });
  const { result } = await check({ r, order, delivery, campaigns: kitAndFloor, b: KIT_REVIEW });
  assert.equal(result.type, 'Verified', result.note);
  assert.equal(result.note, VERIFIED, 'the kit on the screenshots, and the review for the kit');
  const floorReview = await check({ r, order, delivery, campaigns: kitAndFloor });
  assert.equal(floorReview.result.type, 'Product is not matching', 'the kit bought, and the review for the floor cleaner: another of the campaign\'s products');
  assert.equal(floorReview.result.note, `${FAILED('the review is for "Test Brand Floor Cleaner Liquid", another of the campaign\'s products, not "Test Brand Monthly Home Cleaning Kit", the product the screenshots show')} ${MATCH}`);
  assert.equal(result.steps[2].detail, "Order ID: the same. Order date: the same. Amount: the same. Product: one of the campaign's products.");
  const bySheet = await check({ r, order, delivery, campaigns: [] });
  assert.equal(bySheet.result.type, 'Purchase screenshot not clear', 'with no campaign, the name in the sheet is compared');
  assert.ok(bySheet.result.note.endsWith(NO_CAMPAIGN), bySheet.result.note);
});

test('a name Amazon cut short counts when the part shown is the start of its real name, small reading mistakes allowed; too little of it, or another name, does not', async () => {
  const kitAndFloor = [campaign('Test Clean', [product('B0TESTKIT9', MONTHLY), FLOOR_PRODUCT])];
  const showing = (name) => orderRead({ texts: ['Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Order total %654.00', name] });
  const delivery = deliveryRead({ texts: ['Your Orders', `Order # ${ORDER_ID}`, 'Delivered 22 July', MONTHLY] });
  const cases = [
    ['Test Brand Monthly Home Cleani...', 'Verified'],
    ['Test Brand Monthly Home Cl...', 'Verified'],
    ['Tesl Brand Monthy Home Cleaning Kit', 'Verified'],
    ['Test Brand Monthly Home Cleaning Kit | Dishwash Liquid 2L Refill, Floor 2749.00 Cleaner 1L | Plant-Based Formula | Tough on Grease', 'Verified'],
    ['Test Brand Mon...', 'Verified'],
    ['Test Brand Natural Floor Cle...', 'Product is not matching'],
  ];
  for (const [shown, type] of cases) assert.equal((await check({ order: showing(shown), delivery, campaigns: kitAndFloor, b: KIT_REVIEW })).result.type, type, shown);
  // A short start fits one of the campaign's products alone: that is the product, as staff read it.
  const short = await check({ order: showing('Test Brand Mon...'), delivery: deliveryRead({ texts: ['Your Orders', `Order # ${ORDER_ID}`, 'Delivered 22 July'] }), campaigns: kitAndFloor, b: KIT_REVIEW });
  assert.equal(short.result.type, 'Verified', 'only the kit starts with "Test Brand Mon"');
  assert.equal(short.result.steps[2].detail, "Order ID: the same. Order date: the same. Amount: the same. Product: one of the campaign's products, by the start of its name.");
  // The same short start fitting two products, with no delivery screenshot to tell them apart: a staff member must look.
  const twoKits = [campaign('Test Clean', [product('B0TESTKIT9', MONTHLY), product('B0TESTKIT7', 'Test Brand Monthly Dish Kit | Dishwash Liquid 2L'), FLOOR_PRODUCT])];
  const which = await check({ order: showing('Test Brand Mon...'), delivery: deliveryRead({ texts: ['Your Orders', `Order # ${ORDER_ID}`, 'Delivered 22 July'] }), campaigns: twoKits });
  assert.equal(which.result.type, 'Purchase screenshot not clear');
  assert.equal(which.result.note, `${STAFF('the purchase screenshot shows only the start of the product\'s name, "Test Brand Mon...", which could be more than one product, so it cannot be matched to this order')} The delivery screenshot does not show the product's name, but it shows this order's ID.`);
  // The same start on both screenshots, cut short the same way, is enough.
  const bothCut = await check({ order: showing('2. Test Brand Mon...'), delivery: deliveryRead({ texts: ['Your Orders', `Order # ${ORDER_ID}`, 'Delivered 22 July', 'Test Brand Mon...'] }), campaigns: twoKits, b: KIT_REVIEW });
  assert.equal(bothCut.result.type, 'Verified', 'the part shown is the same on both screenshots and is the start of the product ordered');
  assert.match(bothCut.result.note, /The purchase screenshot shows only the start of the product's name, "2; Test Brand Mon\.\.\.", and the delivery screenshot shows the same start\./);
  // A word read wrongly in the middle of the name is never another product: the line could still be the campaign's product.
  const slip = await check({ order: showing('Test Brand Monthly Home Cleaning Kit | Dishwash Liquid 2L Refi11, Floor Cleaner 1L'), delivery, campaigns: kitAndFloor, b: KIT_REVIEW });
  assert.equal(slip.result.type, 'Verified', slip.result.note);
  const couldBe = await check({ order: showing('Test Brand Monthly Xyz Abc Def'), delivery, campaigns: kitAndFloor, b: KIT_REVIEW });
  assert.notEqual(couldBe.result.type, 'Product is not matching', 'a line that starts like one of the products, read badly, is not shown rather than different');
  const other = await check({ order: showing('Test Brand Natural Floor Cle...'), delivery, campaigns: kitAndFloor });
  assert.equal(other.result.note, `${FAILED('the product on the purchase screenshot is not one of the products of the campaign "Test Clean"')} The purchase screenshot shows "Test Brand Natural Floor Cle...".`);
  assert.equal(field(other.result, 'Product').order, 'Not one of the campaign\'s products: "Test Brand Natural Floor Cle..."');
});

test('a row with no live campaign for its brand is checked by its product name in the sheet, and its Note says so', async () => {
  const none = await check({ campaigns: [] });
  assert.equal(none.result.type, 'Verified');
  assert.equal(none.result.note, `${VERIFIED} ${NO_CAMPAIGN}`);
  assert.match(none.result.steps[6].detail, /compared with the product ordered by its name only, because there is no campaign for its brand\.$/);
  const unread = await check({ campaigns: [campaign('Test Clean', [])] });
  assert.equal(unread.result.note, `${VERIFIED} The campaign "Test Clean" has no product read from Amazon, so the product was compared with the product name in the sheet.`);
  const dup = await check({ campaigns: [], r: other(37, { orderId: { text: ORDER_ID, value: ORDER_ID } }), others: [row()] });
  assert.doesNotMatch(dup.result.note, /live campaign/, 'a duplicate is not checked, so its Note does not say it');
  const missing = await check({ campaigns: [], r: row({ shots: { ...row().shots, order: shot(null), delivery: shot(null) } }) });
  assert.doesNotMatch(missing.result.note, /live campaign/, 'nor a row whose screenshots were not read');
});

test('a written review sent as a picture is looked for under the product the screenshots show', async () => {
  const two = [campaign('Test Clean', [product('B0TESTGLS1', 'Test Brand Glass Cleaner Spray, 500 ml'), FLOOR_PRODUCT])];
  const { result, b } = await check({ r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: WRITTEN_PICTURE, campaigns: two });
  assert.equal(result.type, 'Verified', result.note);
  assert.equal(new URL(b.opened[0]).pathname, '/dp/B0TESTFLR1', 'the floor cleaner the screenshots show, not the first product of the campaign');
});

// ---- duplicates: found first; only the first row is checked ----

test('Duplicate: the same order ID in another row; only the first is checked, and the later rows say which row was', async () => {
  const twin = other(37, { orderId: { text: ORDER_ID, value: ORDER_ID } });
  const third = other(74, { orderId: { text: ORDER_ID, value: ORDER_ID } });
  const first = await check({ others: [twin, third] });
  assert.equal(first.result.type, 'Verified', 'the first row is checked');
  assert.equal(first.result.note, `${VERIFIED} The same order ID is also in rows 37 and 74. Those rows are duplicates and were not checked.`, "the first row's Note ends by naming the later rows, by their numbers on the dashboard (rows 38 and 75 of the file)");
  const later = await check({ r: { ...twin }, others: [row(), third] });
  assert.equal(later.result.type, 'Duplicate');
  assert.equal(later.result.status, 'Fail');
  assert.equal(later.result.n, 37);
  assert.equal(later.result.numbered, true, 'the check says its rows are named by their numbers on the dashboard');
  assert.equal(later.result.final, 'fail');
  assert.equal(later.result.note, DUPLICATE(`order ID ${ORDER_ID} is also in row 2, and row 2 is the one that will be checked`));
  assert.deepEqual(later.states, ['fail', ...Array(8).fill('not-reached'), 'fail']);
  assert.deepEqual(later.asked, [], 'a duplicate is found before any screenshot is opened');
  assert.equal(later.b.opened.length, 0);
  const done = await check({ r: { ...twin }, others: [row({ last: { status: 'Verified', type: 'Verified', typeKey: 'verified' } }), third] });
  assert.equal(done.result.note, DUPLICATE(`order ID ${ORDER_ID} was already checked in row 2`), 'which row was checked');
});

test('Duplicate: the same screenshot or review link as another row, by the link that opens, and the same picture by its fingerprint', async () => {
  const sharing = other(21, { shots: { ...other(21).shots, delivery: shot('https://drive.google.com/file/d/1TestDeliveryRow02abcdef/view?usp=sharing') } });
  const laterLink = await check({ r: { ...sharing }, others: [row()] });
  assert.equal(laterLink.result.type, 'Duplicate');
  assert.equal(laterLink.result.note, DUPLICATE('this row uses the same delivery screenshot as row 2, and row 2 is the one that will be checked'));
  const laterDone = await check({ r: { ...sharing }, others: [row({ last: { status: 'Verified', type: 'Verified', typeKey: 'verified' } })] });
  assert.equal(laterDone.result.note, DUPLICATE('this row uses the same delivery screenshot as row 2, which was already checked'));
  const sameReview = other(22, { shots: { ...other(22).shots, review: shot(`https://www.amazon.in/review/R1TESTROW02ABC/ref=pe_000`) } });
  assert.equal((await check({ r: { ...sameReview }, others: [row()] })).result.note, DUPLICATE('this row uses the same review link as row 2, and row 2 is the one that will be checked'));
  const sameFile = other(29, { pictures: { order: [], delivery: [{ ...pic('Copy', '8'), sha256: 'sha-Order02' }], review: [] } });
  const bytes = await check({ r: { ...sameFile }, others: [row()] });
  assert.equal(bytes.result.type, 'Duplicate', 'the very same picture file, even in another cell');
  assert.equal(bytes.result.note, DUPLICATE('the delivery screenshot in this row is the same picture as the purchase screenshot in row 2, and row 2 is the one that will be checked'));
  assert.deepEqual(bytes.states.slice(0, 2), ['fail', 'not-reached'], 'the same file is known before anything is read');
  // A picture that looks the same (a fingerprint this close) is the same picture only when its words read the same too.
  const checkedFirst = row({ last: { status: 'Verified', type: 'Verified', typeKey: 'verified' }, seen: { order: { orderIds: [ORDER_ID], text: 'Order Details' } } });
  const resaved = other(30, { pictures: { order: [pic('Resaved', '1')], delivery: [], review: [] }, seen: { order: { orderIds: [ORDER_ID], text: 'Order Details' } } });
  const fpDup = await check({ r: { ...resaved, seen: undefined }, others: [checkedFirst] });
  assert.equal(fpDup.result.type, 'Duplicate', fpDup.result.note);
  assert.equal(fpDup.result.note, DUPLICATE('the purchase screenshot in this row is the same picture as the purchase screenshot in row 2, which was already checked'));
  assert.deepEqual(fpDup.states.slice(0, 3), ['fail', 'not-reached', 'not-reached'], 'found in step 1, before anything else: a look-alike picture is read at once');
  const lookAlike = other(31, { pictures: { order: [pic('LookAlike', '1')], delivery: [], review: [] }, seen: { order: { orderIds: ['403-5551234-9876543'], text: 'Order Details' } } });
  assert.equal((await check({ others: [lookAlike] })).result.type, 'Verified', 'another order of the same product looks the same, but its order ID reads differently');
  const notReadYet = other(32, { pictures: { order: [pic('Unread', '1')], delivery: [], review: [] } });
  assert.equal((await check({ others: [notReadYet] })).result.type, 'Verified', 'a look-alike whose words were never read is not called the same picture');
  const earlierCopy = await check({ others: [resaved] });
  assert.equal(earlierCopy.result.type, 'Verified', 'the first row is checked, and only the later ones are Duplicate');
  assert.deepEqual(earlierCopy.result.alsoDuplicate.map((d) => d.id), [resaved.id], 'and the later row is Duplicate');
  assert.equal(earlierCopy.result.alsoDuplicate[0].note, DUPLICATE('the purchase screenshot in this row is the same picture as the purchase screenshot in row 2, which is the one checked'));
  assert.equal(earlierCopy.result.alsoDuplicate[0].final, 'fail');
  assert.equal(earlierCopy.result.note, `${VERIFIED} The same purchase screenshot is also in row 30. That row is a duplicate and was not checked.`);
  assert.ok(earlierCopy.result.seen.order.orderIds.includes(ORDER_ID), 'what was read is kept for later checks');
  const firstOne = await check({ others: [sharing] });
  assert.equal(firstOne.result.type, 'Verified', 'the first row with a shared link is checked when only the later ones are Duplicate');
  assert.equal(firstOne.result.note, `${VERIFIED} The same delivery screenshot is also in row 21. That row is a duplicate and was not checked.`);
});

test('Duplicate: a review found through a short link that is also another row’s review', async () => {
  const r = row({ shots: { ...row().shots, review: shot('https://amzn.in/d/0TestRow07') } });
  const landing = (url) => (url.startsWith('https://amzn.in/') ? { ok: true, status: 200, url: `${REVIEW('R1TESTROW07ABC')}?ref=cm_cr_dp_mb_rvw_1`, facts: FACTS.landing } : null);
  const earlier = other(1, { last: { reviewId: 'R1TESTROW07ABC', type: 'Verified' } });
  const { result } = await check({ r, b: fakeBrowser(landing), others: [earlier] });
  assert.equal(result.type, 'Duplicate', result.note);
  assert.equal(result.note, DUPLICATE('the review in this row is the same review as in row 1, which was already checked'));
  assert.deepEqual(result.alsoDuplicate, [], 'the first row keeps its result');
  const laterOne = other(40, { last: { reviewId: 'R1TESTROW07ABC', type: 'Verified' } });
  const first = await check({ r, b: fakeBrowser(landing), others: [laterOne] });
  assert.equal(first.result.type, 'Verified', first.result.note);
  assert.deepEqual(first.result.alsoDuplicate.map((d) => d.id), [laterOne.id], 'the later row is Duplicate');
  assert.equal(first.result.alsoDuplicate[0].note, DUPLICATE('the review in this row is the same review as in row 2, which is the one checked'));
  const alone = await check({ r, b: fakeBrowser(landing) });
  assert.equal(alone.result.type, 'Verified', 'the page a short link lands on is read like any review page');
  assert.equal(alone.result.reviewId, 'R1TESTROW07ABC');
});

test('a cell whose written link is different from the link it opens: the link that opens is checked, as staff would, and the Note says so', async () => {
  const opens = `${REVIEW('R1TESTROW02ABC')}?ref=cm_cr_dp_d_rvw_ttl`;
  const r = row({ shots: { ...row().shots, review: { text: 'https://drive.google.com/open?id=1TestReviewRow25abcdefg', link: opens, links: [opens], mismatch: { text: 'https://drive.google.com/open?id=1TestReviewRow25abcdefg', link: opens }, picture: null } } });
  const { result, b } = await check({ r });
  assert.equal(result.type, 'Verified', result.note);
  assert.equal(result.note, `${VERIFIED} The link written in the review link cell is different from the link that opens when you click it. The dashboard checked the link that opens when clicked.`);
  assert.equal(new URL(b.opened[0]).pathname, '/gp/customer-reviews/R1TESTROW02ABC', 'the link that opens when the cell is clicked');
  assert.ok(!TYPE_KEYS.includes('linkMismatch'), 'there is no Link mismatch Type any more');
});

// ---- screenshots missing, not opened, not clear ----

test('Purchase screenshot missing, Delivery screenshot missing, Review link or screenshot missing; the other screenshot is still checked', async () => {
  const noOrder = await check({ r: row({ shots: { ...row().shots, order: shot(null) } }) });
  assert.equal(noOrder.result.type, 'Purchase screenshot missing');
  assert.equal(noOrder.result.note, FAILED('the user did not give a purchase screenshot'));
  assert.equal(noOrder.result.final, 'fail');
  assert.deepEqual(noOrder.asked, ['delivery'], 'the delivery screenshot is still opened and read');
  assert.deepEqual(noOrder.states, ['pass', 'fail', 'not-reached', 'pass', 'pass', 'not-reached', 'not-reached', 'not-reached', 'not-reached', 'fail']);
  const both = await check({ r: row({ shots: { order: words('Will send later'), delivery: shot(DRIVE_DELIVERY), review: shot(null) } }) });
  assert.equal(both.result.note, `${FAILED('the user wrote "Will send later" in the form instead of giving a purchase screenshot')} The user did not give a review link or a review screenshot in the form.`);
  const zero = await check({ r: row({ shots: { ...row().shots, delivery: words('0') } }) });
  assert.equal(zero.result.type, 'Delivery screenshot missing');
  assert.equal(zero.result.note, FAILED('the user wrote "0" in the form instead of giving a delivery screenshot'));
  const neither = await check({ r: row({ shots: { ...row().shots, order: shot(null), delivery: shot(null) } }) });
  assert.equal(neither.result.type, 'Purchase screenshot missing');
  assert.equal(neither.result.note, `${FAILED('the user did not give a purchase screenshot')} The user did not give a delivery screenshot.`);
  const noReview = await check({ r: row({ shots: { ...row().shots, review: shot(null) } }) });
  assert.equal(noReview.result.type, 'Review link or screenshot missing');
  assert.equal(noReview.result.note, `${FAILED('the user did not give a review link or a review screenshot in the form')} ${MATCH}`);
  assert.equal(noReview.result.final, 'fail');
  assert.deepEqual(noReview.states.slice(0, 6), ['pass', 'pass', 'pass', 'pass', 'pass', 'fail']);
  const dupWithMissing = await check({ r: other(37, { orderId: { text: ORDER_ID, value: ORDER_ID }, shots: { ...other(37).shots, review: shot(null) } }), others: [row()] });
  assert.equal(dupWithMissing.result.note, `${DUPLICATE(`order ID ${ORDER_ID} is also in row 2, and row 2 is the one that will be checked`)} Also missing: the review link (the cell is empty).`);
});

test('Need Google Drive Access and Need Access: which screenshot, the website and what happened, in plain words', async () => {
  const drive = await check({ pics: { order: PRIVATE } });
  assert.equal(drive.result.type, 'Need Google Drive Access');
  assert.equal(drive.result.note, `${STAFF(`the purchase screenshot is on Google Drive, but ${NO_ACCESS}`)} The dashboard can only open a Drive file that the Google account logged in to it can open. Check that the file is shared with the Google account shown in the top bar, then check this row again.`);
  assert.equal(drive.result.final, 'manual');
  assert.deepEqual(drive.asked, ['order', 'delivery']);
  const gone = await check({ pics: { delivery: { files: [], problems: [{ kind: 'drive', site: 'Google Drive', says: 'Google Drive could not find the file, or the Google account logged in to the dashboard has no access to it', noAccess: true }] } } });
  assert.equal(gone.result.type, 'Need Google Drive Access');
  assert.match(gone.result.note, /^A staff member needs to check this transaction because the delivery screenshot is on Google Drive, but Google Drive could not find the file, or the Google account logged in to the dashboard has no access to it\. .*Check that the file is shared with the Google account shown in the top bar, then check this row again\.$/);
  // "Need Google Drive Access" only when Google said the account has no access: anything else that stops a file being read has its own plain reason.
  const big = await check({ pics: { delivery: { files: [], problems: [{ kind: 'drive', site: 'Google Drive', says: 'the file is larger than 60 megabytes, so it was not downloaded' }] } } });
  assert.equal(big.result.type, 'Delivery screenshot not clear');
  assert.equal(big.result.note, `${STAFF('the delivery screenshot is on Google Drive, but the file is larger than 60 megabytes, so it was not downloaded')} The dashboard could not read the delivery screenshot. Ask for the screenshot as a picture (PNG or JPG), then check this row again.`);
  const pdf = await check({ pics: { order: { files: [], problems: [{ kind: 'file', site: 'Google Drive', says: 'the file is a PDF whose pages could not be turned into a picture on this computer' }] } } });
  assert.equal(pdf.result.type, 'Purchase screenshot not clear');
  assert.equal(pdf.result.note, `${STAFF('the purchase screenshot is on Google Drive, but the file is a PDF whose pages could not be turned into a picture on this computer')} The dashboard could not read the purchase screenshot. Ask for the screenshot as a picture (PNG or JPG), then check this row again.`);
  const page = await check({ pics: { order: { files: [], problems: [{ kind: 'drive', site: 'Google Drive', says: 'the file is a web page instead of a picture' }] } } });
  assert.equal(page.result.type, 'Purchase screenshot not clear');
  const unreachable = await check({ pics: { order: { files: [], problems: [{ kind: 'drive', site: 'Google Drive', says: 'it could not be reached from this computer' }] } } });
  assert.equal(unreachable.result.type, 'Something else');
  assert.match(unreachable.result.note, /could not download the purchase screenshot just now\. Check this row again later\./);
  const old = await check({ pics: { order: { files: [], problems: [{ kind: 'drive', site: 'Google Drive', says: NO_ACCESS }] } } });
  assert.equal(old.result.type, 'Need Google Drive Access', 'a reason saved before this rule, by its words');
  const web = await check({ pics: { delivery: { files: [], problems: [{ kind: 'access', site: 'tryboxs.in', says: 'the website could not find it' }] } } });
  assert.equal(web.result.type, 'Need Access');
  assert.equal(web.result.note, `${STAFF('the delivery screenshot is on tryboxs.in, but the website could not find it')} The dashboard could not open the delivery screenshot. Open it by hand, or ask for a working link, then check this row again.`);
  const notListed = await check({ pics: { order: { files: [], problems: [{ kind: 'allowed', site: 'pictures.example.com', says: "the website is not on the dashboard's list of picture websites" }] } } });
  assert.equal(notListed.result.type, 'Need Access');
  assert.equal(notListed.result.note, `${STAFF("the purchase screenshot is on pictures.example.com, but the website is not on the dashboard's list of picture websites")} The dashboard only opens pictures from the websites on its list. The website can be added to that list, then check this row again.`);
  const writerOnly = await check({ r: row({ shots: { ...row().shots, review: shot('https://www.amazon.in/review/review-your-purchases/edit?asin=B0TESTFLR1&channel=YAcc-wr') } }) });
  assert.equal(writerOnly.result.type, 'Need Access');
  assert.equal(writerOnly.result.note, `${STAFF('the review link is for a page only the person who wrote the review can see, so the dashboard did not look at it')} Ask the user to send the review's public link, then check this row again. ${MATCH}`);
  assert.equal(writerOnly.b.opened.length, 0, 'that page is never opened');
});

test('Purchase screenshot not clear, Delivery screenshot not clear, Review screenshot not clear: which picture could not be read', async () => {
  const { result, asked } = await check({ order: orderRead({ ok: false, problem: 'its words are not clear enough to read' }) });
  assert.equal(result.type, 'Purchase screenshot not clear');
  assert.equal(result.note, `${STAFF('the purchase screenshot could not be read: its words are not clear enough to read')} Ask for a clearer screenshot, then check this row again.`);
  assert.deepEqual(asked, ['order', 'delivery']);
  assert.equal((await check({ delivery: deliveryRead({ ok: false, problem: 'it could not be read on this computer' }) })).result.type, 'Delivery screenshot not clear');
  const review = await check({ r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: reviewRead({ ok: false, kind: 'unknown', problem: 'its words are not clear enough to read', why: 'its words could not be read' }) });
  assert.equal(review.result.type, 'Review screenshot not clear');
  assert.equal(review.result.note, `${STAFF('the review screenshot could not be read: its words are not clear enough to read')} Ask for a clearer screenshot, then check this row again. ${MATCH}`);
  const inSheet = await check({ pics: { delivery: { files: [], problems: [{ kind: 'sheet', site: null, says: 'it is not a picture the dashboard can read' }] } } });
  assert.equal(inSheet.result.type, 'Delivery screenshot not clear', 'a picture in the sheet that cannot be read');
});

// ---- the review: only when both screenshots pass ----

test('Wrong review link: a product page, the home page, Amazon in another country, another website', async () => {
  const product = await check({ r: row({ shots: { ...row().shots, review: shot('https://www.amazon.in/dp/B0TESTFLR1') } }) });
  assert.equal(product.result.type, 'Wrong review link');
  assert.equal(product.result.note, `${FAILED('the review link opens a product page on Amazon, not a review')} ${MATCH}`);
  assert.equal(product.result.final, 'fail');
  const home = await check({ r: row({ shots: { ...row().shots, review: shot('https://amzn.in/d/0TestHome') } }), b: fakeBrowser((url) => (url.includes('amzn.in') ? { ok: true, status: 200, url: 'https://www.amazon.in/', facts: { ...FACTS.rackProduct, productTitle: null, pageAsin: null, reviews: [], url: 'https://www.amazon.in/' } } : null)) });
  assert.equal(home.result.note, `${FAILED("the review link opens Amazon's home page, not a review")} ${MATCH}`);
  const abroad = await check({ r: row({ shots: { ...row().shots, review: shot('https://www.amazon.com/gp/customer-reviews/R1TESTROW02ABC') } }) });
  assert.equal(abroad.result.note, `${FAILED('the review link is on www.amazon.com, not Amazon India')} ${MATCH}`);
  const away = await check({ r: row({ shots: { ...row().shots, review: shot('https://amzn.in/d/0TestAway') } }), b: fakeBrowser((url) => (url.includes('amzn.in') ? { ok: true, status: 200, url: 'https://example.com/offer', facts: {} } : null)) });
  assert.equal(away.result.note, `${FAILED('the review link leads to example.com, not Amazon India')} ${MATCH}`);
});

test('Amazon review is deleted: a real review link Amazon no longer shows; an earlier live check is said, with when', async () => {
  const r = row({ shots: { ...row().shots, review: shot(REVIEW('R1TESTROW05ABC')) } });
  const gone = await check({ r, b: fakeBrowser((url) => (url.includes('R1TESTROW05ABC') ? { ok: true, status: 200, url, facts: FACTS.gone } : null)) });
  assert.equal(gone.result.type, 'Amazon review is deleted');
  assert.equal(gone.result.note, `${FAILED('Amazon no longer shows the review, so it has been deleted')} ${MATCH}`);
  assert.equal(gone.result.final, 'fail');
  const seen = { ...r, seenLive: { at: '2026-09-28T06:00:00.000Z', reviewId: 'R1TESTROW05ABC' } };
  const missing = await check({ r: seen, b: fakeBrowser((url) => (url.includes('R1TESTROW05ABC') ? { ok: true, status: 404, url, facts: FACTS.missing } : null)) });
  assert.equal(missing.result.type, 'Amazon review is deleted');
  assert.equal(missing.result.note, `${FAILED('Amazon no longer shows the review, so it has been deleted')} An earlier check found the review live on 28-09-2026. ${MATCH}`, 'the date, day first');
});

test('Review not live: a review from a picture not found under "See all reviews" after at most two searches; a review the link opens is never searched for', async () => {
  const notThere = fakeBrowser((url) => (url.includes('filterByKeyword=') ? { ok: true, status: 200, url, facts: FACTS.miss } : null));
  const linked = await check({ b: notThere });
  assert.equal(linked.result.type, 'Verified', 'the review the link opens is live: no search');
  assert.equal(linked.b.opened.filter((u) => u.includes('filterByKeyword=')).length, 0);
  const { result, b } = await check({ r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: WRITTEN_PICTURE, b: notThere });
  assert.equal(result.type, 'Review not live');
  assert.match(result.note, /^A staff member needs to check this transaction because the review was not found in the product's public reviews on Amazon, after searching for "\w+" and "\w+"\. It may not be public yet\. The purchase screenshot and the delivery screenshot match the form\.$/);
  assert.equal(result.final, 'manual');
  assert.equal(b.opened.filter((u) => u.includes('filterByKeyword=')).length, 2, 'at most two searches');
  const picture = await check({ r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: WRITTEN_PICTURE, b: fakeBrowser((url) => (url.includes('filterByKeyword=') ? { ok: true, status: 200, url, facts: FACTS.miss } : null)) });
  assert.equal(picture.result.type, 'Review not live');
  const otherName = await check({ r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: reviewRead({ ...WRITTEN_PICTURE, written: { ...WRITTEN_PICTURE.written, name: 'Somebody Else Entirely' } }) });
  assert.equal(otherName.result.type, 'Review not live', 'the same words under another name is not this review');
});

test('Review link needed: a picture of a written review, and no Amazon link for the product in the Products box', async () => {
  const { result, b } = await check({ campaigns: [], r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: WRITTEN_PICTURE });
  assert.equal(result.type, 'Review link needed');
  assert.equal(result.note, `${STAFF("the review screenshot shows a written review, but there is no campaign for this product's brand, so the review could not be looked for on Amazon")} Add a campaign for this brand with its products, or ask the user for the review's link, then check this row again. ${MATCH} The product was compared with the product name in the sheet.`, 'that there is no campaign is said once');
  assert.equal(result.final, 'manual');
  assert.equal(b.opened.length, 0);
});

test('User not being able to add reviews: the Note quotes Amazon’s words', async () => {
  const words = 'We apologize but this account has not met the minimum eligibility requirements to write a review.';
  const { result } = await check({ r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: reviewRead({ kind: 'refused', refusal: words }) });
  assert.equal(result.type, 'User not being able to add reviews');
  assert.equal(result.status, 'Fail');
  assert.equal(result.note, `${FAILED(`the review screenshot shows a message from Amazon that the review could not be added: "${words.replace(/\.$/, '')}"`)} ${MATCH}`);
  assert.equal(result.final, 'fail');
});

test('Something else: never Verified; a mistake on this computer, a picture that cannot be told, Drive busy, no Live Amazon Browser', async () => {
  const crash = await check({ order: () => Promise.reject(new Error('boom')) });
  assert.equal(crash.result.type, 'Something else');
  assert.equal(crash.result.status, 'Needs Manual Staff Checking');
  assert.equal(crash.result.note, `${STAFF('something went wrong on this computer while reading the purchase screenshot')} Check this row again.`);
  assert.equal(crash.result.final, 'manual');
  const unknown = await check({ r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: reviewRead({ kind: 'unknown', why: 'it says "Thanks for rating!", but no orange stars were seen, so the stars could not be seen clearly', text: 'Thanks for rating!' }) });
  assert.equal(unknown.result.type, 'Something else');
  assert.equal(unknown.result.note, `${STAFF('the review screenshot does not clearly show a written review, a star rating only or a message from Amazon, because it says "Thanks for rating!", but no orange stars were seen, so the stars could not be seen clearly')} Open it by hand. ${MATCH}`);
  const busy = await check({ pics: { order: { files: [], problems: [{ kind: 'busy', site: 'Google Drive', says: 'Google Drive is limiting downloads right now' }] } } });
  assert.equal(busy.result.type, 'Something else');
  assert.equal(busy.result.note, `${STAFF('the purchase screenshot is on Google Drive, but Google Drive is limiting downloads right now')} The dashboard could not download the purchase screenshot just now. Check this row again later.`);
  const noWindow = fakeBrowser();
  noWindow.begin = async () => {
    throw new Error('no Chrome');
  };
  const closed = await check({ b: noWindow });
  assert.equal(closed.result.type, 'Something else');
  assert.equal(closed.result.note, `${STAFF('the Live Amazon Browser could not be opened on this computer')} Close any Chrome window called "Live Amazon Browser", then check this row again. ${MATCH}`);
  const cut = await check({ b: fakeBrowser((url) => (url.includes('R1TESTROW02ABC') ? { ok: true, status: 200, url, facts: { ...FACTS.review, reviews: FACTS.review.reviews.map((x) => ({ ...x, body: null, title: null, stars: null })), text: '' } } : null)) });
  assert.equal(cut.result.type, 'Something else', 'a review whose stars and words cannot be read is never a rating only');
  assert.equal(cut.result.note, `${STAFF('the review page did not clearly show the stars and the written words, so the dashboard could not tell whether the review is a star rating only')} Open the review link by hand. ${MATCH}`);
});

test('a sign-in page, a robot check or a block pauses the check: no Type, no Status, nothing got around', async () => {
  for (const [kind, facts] of [['signin', FACTS.signin], ['captcha', FACTS.captcha], ['blocked', FACTS.blocked]]) {
    const at = (url) => (url.includes('/gp/customer-reviews/') ? { ok: true, status: kind === 'blocked' ? 503 : 200, url: kind === 'signin' ? 'https://www.amazon.in/ap/signin?openid.return_to=x' : url, facts } : null);
    const { result, b } = await check({ b: fakeBrowser(at) });
    assert.deepEqual(result.paused, { kind, says: PAUSE_SAYS[kind], step: 6 }, kind);
    assert.equal(result.type, null);
    assert.equal(result.status, null);
    assert.equal(result.note, null);
    assert.equal(b.opened.length, 1, `${kind}: no more Amazon pages after it`);
    assert.deepEqual(result.steps.slice(6, 10).map((s) => s.state), ['not-reached', 'not-reached', 'not-reached', 'not-reached']);
  }
  const later = await check({ r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: WRITTEN_PICTURE, b: fakeBrowser((url) => (url.includes('filterByKeyword=') ? { ok: true, status: 200, url, facts: FACTS.captcha } : null)) });
  assert.equal(later.result.paused.kind, 'captcha', 'a robot check on a search pauses too');
  assert.equal(later.result.paused.step, 9);
});

test('no Google login, or Google’s login page, a robot check or a block while a screenshot is downloaded: the check pauses there, with no Type and nothing saved', async () => {
  for (const [kind, which, step] of [['google-out', 'order', 2], ['google-signin', 'delivery', 4], ['google-robot', 'order', 2], ['google-blocked', 'delivery', 4]]) {
    const { result, asked } = await check({ pics: { [which]: { pause: kind, files: [], problems: [], records: [] } } });
    assert.deepEqual(result.paused, { kind, says: PAUSE_SAYS[kind], step }, kind);
    assert.deepEqual([result.type, result.status, result.note, result.typeKey], [null, null, null, null], `${kind}: no result`);
    assert.equal(result.steps[step - 1].state, 'fail');
    assert.match(result.steps[step - 1].detail, /The check paused here, before the (purchase|delivery) screenshot was downloaded; nothing was got around\.$/);
    assert.ok(result.steps.slice(step).every((s) => s.state === 'not-reached'), `${kind}: nothing after it`);
    assert.ok(!asked.includes('review'), `${kind}: the review link is not opened`);
  }
  assert.match(PAUSE_SAYS['google-out'], /^No one is logged in to Google, so the screenshots on Google Drive cannot be downloaded\. Press "Log in to Google" in the top bar and log in there, then press "Carry on checking"\.$/);
  assert.match(PAUSE_SAYS['google-signin'], /^Google asked to log in, so the screenshots on Google Drive cannot be downloaded\./);
  // A review screenshot or a picture in the review link cell pauses the same way, at step 6.
  const picture = row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } });
  const { result: six } = await check({ r: picture, pics: { review: { pause: 'google-signin', files: [], problems: [], records: [] } } });
  assert.deepEqual(six.paused, { kind: 'google-signin', says: PAUSE_SAYS['google-signin'], step: 6 });
});

test('Stop: what is left is "not reached", and the result says it was stopped', async () => {
  const stop = new AbortController();
  const { result } = await check({ order: () => (stop.abort(), orderRead()), signal: stop.signal });
  assert.equal(result.stopped, true);
  assert.equal(result.type, null);
  assert.ok(result.steps.slice(2).every((s) => s.state === 'not-reached'));
});

// ---- the Notes and the comparison table ----

test('every Note is short and plain: one paragraph, its first sentence the Status and its reason, no list of details and no "Why:" line, never a banned word', async () => {
  const hidden = Buffer.from('cmVmdW5k', 'base64').toString('utf8');
  const { result } = await check({ r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: reviewRead({ kind: 'refused', refusal: `We cannot accept this review. Ask for a ${hidden} instead.` }) });
  assert.doesNotMatch(result.note, BANNED);
  assert.match(result.note, /Ask for a … instead/);
  const cases = [
    await check(),
    await check({ delivery: deliveryRead({ orderIds: [OTHER_ORDER_ID] }) }),
    await check({ r: row({ amount: { text: '851', value: 851 } }) }),
    await check({ delivery: deliveryRead({ orderIds: [] }) }),
    await check({ pics: { order: PRIVATE } }),
  ];
  for (const c of cases) {
    assert.ok(!c.result.note.includes('\n'), `one paragraph: ${c.result.note}`);
    assert.doesNotMatch(c.result.note, /Why:|(?:in the sheet|on the \w+ screenshot): /, 'no list of details and no Why line');
    assert.ok(sentencesOf(c.result.note).length <= 3, `two or three short sentences: ${c.result.note}`);
    assert.equal(sentencesOf(c.result.note)[0], c.result.finalSays, 'the first sentence gives the Final result and its reason');
    assert.match(c.result.finalSays, /^(This transaction passed: |This transaction failed because |A staff member needs to check this transaction because )/);
    assert.doesNotMatch(c.result.note, BANNED);
  }
  const extra = await check({ r: row({ amount: { text: '851', value: 851 }, orderDate: { text: '16-07-2026', value: '2026-07-16' } }), delivery: deliveryRead({ orderIds: [], texts: ['Delivered 22 July', 'Package was handed to resident'] }) });
  assert.equal(sentencesOf(extra.result.note).length, 4, `the reason and its values, then one sentence for each other problem: ${extra.result.note}`);
  const duplicate = await check({ r: other(37, { orderId: { text: ORDER_ID, value: ORDER_ID } }), others: [row()] });
  assert.doesNotMatch(duplicate.result.note, /\n|Why:/, 'a duplicate Note is one paragraph too');
});

test("the row's comparison table: the four details for the sheet, the purchase screenshot and the delivery screenshot, each the same, different or not shown", async () => {
  const { result } = await check({ r: row({ amount: { text: '851', value: 851 } }), delivery: deliveryRead({ orderIds: [OTHER_ORDER_ID] }) });
  const four = result.comparison.slice(0, 4).map((c) => [c.field, c.sheet, c.order, c.delivery, c.result, c.ok]);
  assert.deepEqual(four, [
    ['Order ID', ORDER_ID, `The same: ${ORDER_ID}`, `Different: ${OTHER_ORDER_ID}`, 'Different on the delivery screenshot.', false],
    ['Order date', '20-07-2026', 'The same: 20-07-2026', 'Not shown', 'The same on the purchase screenshot.', true],
    ['Amount', '851', 'Different: ₹654, the order total', 'Not shown', 'Different on the purchase screenshot.', false],
    ['Product', "Test Brand Floor Cleaner (not compared: the campaign's products are used)", 'One of the campaign\'s products: "Test Brand Floor Cleaner Liquid"', 'One of the campaign\'s products: "Test Brand Floor Cleaner Liquid"', "One of the campaign's products on both screenshots.", true],
  ]);
  const bySheet = await check({ campaigns: [] });
  const p = field(bySheet.result, 'Product');
  assert.deepEqual([p.sheet, p.order, p.result], ['Test Brand Floor Cleaner', 'The same: "Test Brand Floor Cleaner Liquid, Lavender, 1"', 'The same on both screenshots.'], 'with no campaign, compared with the product name in the sheet');
  const unopened = await check({ pics: { order: PRIVATE } });
  assert.deepEqual(unopened.result.comparison.slice(0, 4).map((c) => c.order), ['Not read', 'Not read', 'Not read', 'Not read']);
  const unread = await check({ order: orderRead({ ok: false, problem: 'its words are not clear enough to read' }) });
  assert.equal(field(unread.result, 'Order ID').order, 'Could not be read');
});

test('every one of the twenty-one Types comes out of some row, each with its own Status', async () => {
  const review = (link) => row({ shots: { ...row().shots, review: shot(link) } });
  const picture = review(PICTURE_REVIEW);
  const miss = fakeBrowser((url) => (url.includes('filterByKeyword=') ? { ok: true, status: 200, url, facts: FACTS.miss } : null));
  const scenarios = {
    verified: {},
    ratingOnly: { r: picture, review: reviewRead({ kind: 'rating', stars: 4, productShown: { share: 1, shown: FLOOR } }) },
    duplicate: { r: other(37, { orderId: { text: ORDER_ID, value: ORDER_ID } }), others: [row()] },
    orderShotMissing: { r: row({ shots: { ...row().shots, order: shot(null) } }) },
    deliveryShotMissing: { r: row({ shots: { ...row().shots, delivery: words('0') } }) },
    reviewLinkMissing: { r: review(null) },
    needDriveAccess: { pics: { order: PRIVATE } },
    needAccess: { r: review('https://www.amazon.in/review/R1TESTROW10ABC/thankyou?asin=B0TESTKIT1&channel=YAcc-wr') },
    orderNotClear: { order: orderRead({ ok: false, problem: 'its words are not clear enough to read' }) },
    deliveryNotClear: { delivery: deliveryRead({ ok: false, problem: 'its words are not clear enough to read' }) },
    reviewNotClear: { r: picture, review: reviewRead({ ok: false, kind: 'unknown', problem: 'its words are not clear enough to read' }) },
    orderIdNotMatching: { order: orderRead({ orderIds: [OTHER_ORDER_ID] }) },
    orderDetailsNotMatching: { r: row({ amount: { text: '851', value: 851 } }) },
    notDelivered: { r: row({ shots: { ...row().shots, delivery: words('Returned') } }) },
    productNotMatching: { r: review(REVIEW('R1TESTREVIEW01')) },
    wrongReviewLink: { r: review('https://www.amazon.in/dp/B0TESTFLR1') },
    reviewDeleted: { r: review(REVIEW('R1TESTROW05ABC')), b: fakeBrowser((url) => (url.includes('R1TESTROW05ABC') ? { ok: true, status: 200, url, facts: FACTS.gone } : null)) },
    reviewNotLive: { r: picture, review: WRITTEN_PICTURE, b: miss },
    reviewLinkNeeded: { r: picture, review: WRITTEN_PICTURE, campaigns: [] },
    reviewerNotMatching: { reviewer: 'Somebody Else Entirely' },
    reviewShotNotMatching: { r: withShot(shot(`${REVIEW('R1TESTROW02ABC')}?ref=cm_cr_dp_d_rvw_ttl`)), review: reviewRead({ kind: 'written', written: { name: null, body: 'The rack wobbles and the wheels squeak every single time I move it around the room, and one hook came off.' }, text: 'x' }) },
    cannotAddReviews: { r: picture, review: reviewRead({ kind: 'refused', refusal: "Sorry, you can't review this product." }) },
    somethingElse: { r: picture, review: reviewRead({ kind: 'unknown', why: 'it shows no review, no rating and no message from Amazon' }) },
  };
  assert.deepEqual(Object.keys(scenarios).sort(), [...TYPE_KEYS].sort(), 'one row for each Type');
  assert.equal(TYPE_KEYS.length, 23);
  for (const [want, opts] of Object.entries(scenarios)) {
    const { result } = await check(opts);
    assert.equal(result.typeKey, want, `${want}: ${result.note}`);
    assert.equal(result.status, FINAL_WORDS[result.final], `${want}: the Status column holds only Pass, Fail or Needs Manual Staff Checking`);
    assert.equal(result.status === 'Pass', want === 'verified' || want === 'ratingOnly', want);
    assert.ok(result.note, want);
    assert.doesNotMatch(result.note, /\n|Why:/, `${want}: ${result.note}`);
    assert.ok(['pass', 'fail', 'manual'].includes(result.final), want);
    assert.ok(result.note.startsWith(result.finalSays), `${want}: the Note starts with the Status`);
    assert.doesNotMatch(result.note, BANNED);
  }
  assert.equal(SETTINGS.typeWords.orderShotMissing, 'Purchase screenshot missing');
  assert.equal(SETTINGS.typeWords.orderNotClear, 'Purchase screenshot not clear');
  // What differs on the review screenshot is kept with the result, for the email sent to the user about it.
  assert.equal((await check(scenarios.reviewShotNotMatching)).result.reviewShot.problem, 'words');
});

// ---- the Status ----

test('the Status: Pass for Verified and Rating Only, Fail for a problem that fails the transaction, Needs Manual Staff Checking for anything the dashboard cannot decide', async () => {
  const cases = [
    ['Verified', {}, 'pass'],
    ['a duplicate', { r: other(37, { orderId: { text: ORDER_ID, value: ORDER_ID } }), others: [row()] }, 'fail'],
    ['a missing purchase screenshot', { r: row({ shots: { ...row().shots, order: shot(null) } }) }, 'fail'],
    ['a missing review', { r: row({ shots: { ...row().shots, review: shot(null) } }) }, 'fail'],
    ['a different order ID', { delivery: deliveryRead({ orderIds: [OTHER_ORDER_ID] }) }, 'fail'],
    ['a different product', { delivery: deliveryRead({ texts: ['Delivered 22 July', `Order # ${ORDER_ID}`, 'Test Brand Stain Remover Spray, 500 ml'] }) }, 'fail'],
    ['a different amount', { r: row({ amount: { text: '851', value: 851 } }) }, 'fail'],
    ['a wrong review link', { r: row({ shots: { ...row().shots, review: shot('https://www.amazon.in/dp/B0TESTFLR1') } }) }, 'fail'],
    ['a private Drive file', { pics: { order: PRIVATE } }, 'manual'],
    ['a screenshot it cannot read', { order: orderRead({ ok: false, problem: 'its words are not clear enough to read' }) }, 'manual'],
    ['a review not found', { r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: WRITTEN_PICTURE, b: fakeBrowser((url) => (url.includes('filterByKeyword=') ? { ok: true, status: 200, url, facts: FACTS.miss } : null)) }, 'manual'],
    ['a reviewer with another name', { reviewer: 'Somebody Else Entirely' }, 'manual'],
    ['a review it cannot look for', { campaigns: [], r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: WRITTEN_PICTURE }, 'manual'],
  ];
  for (const [what, opts, final] of cases) {
    const { result } = await check(opts);
    assert.equal(result.final, final, `${what}: ${result.note}`);
    assert.equal(result.finalSays, sentencesOf(result.note)[0], `${what}: the Note starts with it`);
  }
});

test('a possible reading mistake needs a staff member and never fails: an order ID, an order date or an amount one digit away from the form', async () => {
  const oneOff = `${ORDER_ID.slice(0, -1)}${ORDER_ID.endsWith('3') ? '4' : '3'}`;
  const id = await check({ order: orderRead({ orderIds: [oneOff] }), delivery: deliveryRead({ orderIds: [] }) });
  assert.equal(id.result.type, 'Order ID is not matching', 'the Type still says what was seen');
  assert.equal(id.result.final, 'manual');
  assert.equal(id.result.note, `${STAFF('the order ID on the purchase screenshot is one digit away from the order ID the user gave, which may be a reading mistake')} ${GAVE_ID}, and the purchase screenshot shows order ID ${oneOff}.`);
  // One digit off on one screenshot, and exact on the other: a reading slip, said in the Note.
  const slip = await check({ delivery: deliveryRead({ orderIds: [oneOff] }) });
  assert.equal(slip.result.type, 'Verified');
  assert.equal(slip.result.note, `${VERIFIED} The order ID on the delivery screenshot was read one digit off, but the purchase screenshot shows it exactly, so it was taken as a reading slip.`);
  assert.deepEqual([field(slip.result, 'Order ID').result, field(slip.result, 'Order ID').ok], ['The same on the purchase screenshot; read one digit off on the delivery screenshot, taken as a reading slip.', true]);
  const amount = await check({ r: row({ amount: { text: '664', value: 664 } }) });
  assert.equal(amount.result.final, 'manual', '₹654 read for ₹664');
  assert.equal(amount.result.note, `${STAFF('the amount on the purchase screenshot is one digit away from the amount the user gave, which may be a reading mistake')} The user gave the amount ₹664, and the purchase screenshot shows ₹654 as the order total.`);
  assert.equal((await check({ r: row({ amount: { text: '65', value: 65 } }) })).result.final, 'manual', 'one digit missing');
  assert.equal((await check({ r: row({ orderDate: { text: '21-07-2026', value: '2026-07-21' } }) })).result.final, 'manual', '20-07-2026 read for 21-07-2026');
  assert.equal((await check({ r: row({ orderDate: { text: '16-07-2026', value: '2026-07-16' } }) })).result.final, 'fail', 'two digits away is a different date');
  const both = await check({ r: row({ amount: { text: '851', value: 851 }, orderDate: { text: '21-07-2026', value: '2026-07-21' } }) });
  assert.equal(both.result.final, 'fail', 'a clearly different amount fails, whatever else');
  assert.equal(both.result.note, `${FAILED('the amount on the purchase screenshot does not match the amount the user gave')} The user gave the amount ₹851, and the purchase screenshot shows ₹654 as the order total. The order date is one digit away from the form, which may be a reading mistake: the user gave 21-07-2026, but the purchase screenshot shows 20-07-2026.`, 'nothing said twice');
  const otherOrder = await check({ order: orderRead({ orderIds: [oneOff] }), delivery: deliveryRead({ orderIds: [OTHER_ORDER_ID] }) });
  assert.equal(otherOrder.result.final, 'fail', 'one digit away on one screenshot, but clearly another order on the other');
});

test('not delivered fails only when the cell or the screenshot clearly says so; no "Delivered" found needs a staff member', async () => {
  const says = async (line) => (await check({ delivery: deliveryRead({ delivered: false, deliveredText: null, texts: ['Your Orders', `Order # ${ORDER_ID}`, line, 'Test Brand Floor Cleaner Liquid,', 'Lavender, 1 Litre'] }) })).result;
  const cancelled = await says('Cancelled');
  assert.deepEqual([cancelled.type, cancelled.final], ['Not delivered', 'fail']);
  assert.equal(cancelled.note, FAILED('the delivery screenshot says "Cancelled", so the order was not delivered'));
  assert.match(cancelled.steps[4].detail, /^It says "Cancelled", not Delivered\./);
  for (const line of ['Returned', 'Lost', 'In transit', 'Not delivered yet']) assert.equal((await says(line)).final, 'fail', line);
  const unclear = await says('Delivred 22 July');
  assert.deepEqual([unclear.type, unclear.final], ['Not delivered', 'manual'], 'a reading mistake in "Delivered"');
  assert.equal((await check({ r: row({ shots: { ...row().shots, delivery: words('Returned') } }) })).result.final, 'fail', 'the cell clearly says so');
});

// ---- the staff's way: amounts with fees, an order ID read in part, delivery signs, the reviewer's name, the review screenshot ----

test('amounts the way staff read an order page: an item price with the fees shown, or a few rupees under the amount when the total is cut off; a total shown must be the amount', async () => {
  const page = (lines) => orderRead({ texts: ['Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Test Brand Floor Cleaner Liquid, Lavender, 1 Litre', ...lines], amounts: amountsIn(lines) });
  const fees = await check({ order: page(['Item(s) Subtotal: ₹609.00', 'Shipping: ₹40.00', 'Marketplace Fee: ₹5.00']) });
  assert.equal(fees.result.type, 'Verified', fees.result.note);
  assert.equal(fees.result.steps[2].detail, 'Order ID: the same. Order date: the same. Amount: the same (₹609 with ₹45 of shipping and fees). Product: one of the campaign\'s products.');
  const cutOff = await check({ order: page(['₹649.00', 'Item(s) Subtotal: ₹649.00', 'Shipping: ₹0.00']) });
  assert.equal(cutOff.result.type, 'Verified', 'the total is cut off: ₹649 with up to ₹5 of fees not shown is ₹654');
  assert.match(cutOff.result.steps[2].detail, /Amount: the same \(₹649, with Amazon's fees not shown\)\./);
  const tooFar = await check({ order: page(['₹640.00', 'Item(s) Subtotal: ₹640.00']) });
  assert.equal(tooFar.result.type, 'Order details not matching', 'more than the allowance under the amount');
  const total = await check({ order: page(['Item(s) Subtotal: ₹649.00', 'Grand Total: ₹649.00']) });
  assert.equal(total.result.type, 'Order details not matching', 'a total shown must be the amount');
  const misread = await check({ order: page(['Grand Total: 7654.00']) });
  assert.equal(misread.result.type, 'Verified', 'the rupee sign read as a 7');
  const lostPoint = await check({ order: page(['Grand Total: 65400']) });
  assert.equal(lostPoint.result.type, 'Verified', 'the decimal point lost');
  // On the delivery screenshot an item's price is not the order's total: it is not compared, and never fails the row.
  const price = await check({ delivery: deliveryRead({ amounts: amountsIn(['₹609.00']), texts: ['Your Orders', `Order # ${ORDER_ID}`, 'Delivered 22 July', 'Test Brand Floor Cleaner Liquid,', '₹609.00'] }) });
  assert.equal(price.result.type, 'Verified', price.result.note);
  assert.match(price.result.steps[4].detail, /Amount: not shown \(₹609 is an item's price, not the order's total\)\./);
  const deliveryTotal = await check({ delivery: deliveryRead({ amounts: amountsIn(['Grand Total: ₹900.00']) }) });
  assert.equal(deliveryTotal.result.type, 'Order details not matching', 'a total on the delivery screenshot must be the amount');
  const none = await check({ order: orderRead({ amounts: [] }), delivery: deliveryRead({ amounts: amountsIn(['₹609.00']) }) });
  assert.equal(none.result.type, 'Purchase screenshot not clear', 'the purchase screenshot must show the amount');
});

test('an order ID read only in part, or wrapped over two lines, is the sheet\'s when the part read is in it', async () => {
  const part = await check({ order: orderRead({ orderIds: [], texts: ['Order date 20 July 2026', `Order number ${ORDER_ID.slice(1, -2)}`, 'Order total %654.00', 'Test Brand Floor Cleaner Liquid, Lavender, 1 Litre'] }) });
  assert.equal(part.result.type, 'Verified', part.result.note);
  assert.equal(part.result.steps[2].detail, "Order ID: the same (14 of its 17 digits were read). Order date: the same. Amount: the same. Product: one of the campaign's products.");
  const otherPart = await check({ order: orderRead({ orderIds: [], texts: ['Order date 20 July 2026', `Order number ${OTHER_ORDER_ID.slice(1, -2)}`, 'Order total %654.00'] }) });
  assert.equal(otherPart.result.type, 'Purchase screenshot not clear', 'a part of another order ID is not shown: never called different');
  const wrapped = await check({ order: readOf(['Order date 20 July 2026', `Order number ${ORDER_ID.slice(0, 4)}`, ORDER_ID.slice(4), 'Order total %654.00', 'Test Brand Floor Cleaner Liquid, Lavender, 1 Litre']) });
  assert.equal(wrapped.result.type, 'Verified', wrapped.result.note);
});

test('"Delivered" from the signs Amazon shows only once an order was delivered, said so; "Arriving" or "Shipped" clearly means not delivered: Fail', async () => {
  const sign = await check({ delivery: deliveryRead({ deliveredText: 'Leave delivery feedback', deliveredHow: 'sign' }) });
  assert.equal(sign.result.type, 'Verified');
  assert.match(sign.result.steps[4].detail, /^It says "Leave delivery feedback", which Amazon shows only for a delivered order\./);
  const says = async (line) => (await check({ delivery: deliveryRead({ delivered: false, deliveredText: null, texts: ['Your Orders', `Order # ${ORDER_ID}`, line, 'Test Brand Floor Cleaner Liquid,', 'Lavender, 1 Litre'] }) })).result;
  for (const line of ['Arriving Thursday', 'Out for delivery', 'Shipped', 'Expected by Monday']) {
    const r = await says(line);
    assert.deepEqual([r.type, r.final], ['Not delivered', 'fail'], line);
  }
  assert.equal((await says('Arriving Thursday')).note, FAILED('the delivery screenshot says "Arriving", so the order was not delivered'));
  const photo = await says('Pack of 2');
  assert.deepEqual([photo.type, photo.final], ['Not delivered', 'manual'], 'a picture that does not say Delivered, and nothing clearly saying it was not: a staff member looks');
});

test("the name on the review must be the name in the Reviewer Name column: capitals, an initial, a missing middle name or one name still count; a different name needs a staff member; a name Amazon hides is not compared", async () => {
  // The pretend review page is by "Test Reviewer One".
  const same = await check({ reviewer: 'test reviewer one' });
  assert.equal(same.result.type, 'Verified');
  assert.equal(same.result.note, `${VERIFIED} The name on the review is the one in the Reviewer Name column, "test reviewer one".`);
  const initial = await check({ reviewer: 'T Reviewer One' });
  assert.equal(initial.result.note, `${VERIFIED} The name on the review, "Test Reviewer One", is the one in the Reviewer Name column, "T Reviewer One" (an initial stands for a word).`);
  assert.equal((await check({ reviewer: 'T. Reviewer One' })).result.type, 'Verified', 'with a dot too');
  assert.match((await check({ reviewer: 'Test One' })).result.note, /\(a name left out\)\.$/);
  assert.match((await check({ reviewer: 'Test' })).result.note, /\(one of its names\)\.$/);
  assert.equal((await check({ reviewer: 'Test Reviewer Kumar One' })).result.type, 'Verified', 'a middle name in the sheet only');
  assert.equal((await check({ reviewer: 'Test R.' })).result.type, 'Verified', 'a name shortened the way Amazon shows it');
  assert.equal((await check({ reviewer: 'One Test' })).result.type, 'Verified', 'in any order');
  const different = await check({ reviewer: 'Somebody Else Entirely' });
  assert.equal(different.result.type, 'Reviewer name is different');
  assert.equal(different.result.final, 'manual');
  assert.equal(different.result.note, `${STAFF('the name on the review, "Test Reviewer One", is not the name in the Reviewer Name column, "Somebody Else Entirely"')} A staff member must check whose review it is. ${MATCH}`);
  assert.equal(different.result.steps[6].state, 'fail');
  assert.match(different.result.steps[6].detail, /is not the name in the Reviewer Name column/);
  assert.deepEqual(different.states.slice(7, 10), ['not-needed', 'not-needed', 'fail'], 'the check goes on; the Status is Needs Manual Staff Checking');
  const empty = await check({ reviewer: '  ' });
  assert.equal(empty.result.note, `${VERIFIED} The Reviewer Name cell is empty, so the name on the review was not compared.`);
  const noColumn = await check({ reviewer: null });
  assert.equal(noColumn.result.note, VERIFIED, 'no Reviewer Name column: nothing said');
  const hiddenName = { ...FACTS.review, reviews: FACTS.review.reviews.map((x) => ({ ...x, name: 'Amazon Customer' })), text: FACTS.review.text.replace(/Test Reviewer One/g, 'Amazon Customer') };
  const hidden = await check({ reviewer: 'Somebody Else Entirely', b: fakeBrowser((url) => (url.includes('R1TESTROW02ABC') ? { ok: true, status: 200, url, facts: hiddenName } : null)) });
  assert.equal(hidden.result.type, 'Verified');
  assert.equal(hidden.result.note, `${VERIFIED} Amazon hides the reviewer's name ("Amazon Customer"), so it was not compared with the Reviewer Name column.`);
  // From a picture, the review found on Amazon is compared the same way.
  const pictureRow = row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } });
  const found = await check({ r: pictureRow, review: WRITTEN_PICTURE, reviewer: 'Somebody Else Entirely' });
  assert.equal(found.result.type, 'Reviewer name is different');
  assert.equal(found.result.steps[8].state, 'fail');
});

test('the review screenshot against the review the link opens: the same review is said so; one that cannot be read does not stop a Pass; another name or other words needs a staff member', async () => {
  const linked = shot(`${REVIEW('R1TESTROW02ABC')}?ref=cm_cr_dp_d_rvw_ttl`);
  // The pretend review page: by "Test Reviewer One", with these words.
  const PAGE_NAME = 'Test Reviewer One';
  const PAGE_BODY = 'One capful cleans the whole kitchen floor and leaves no sticky film on the vitrified tiles. The bottle has lasted a month.';
  const same = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: PAGE_NAME, body: PAGE_BODY }, text: PAGE_BODY }) });
  assert.equal(same.result.type, 'Verified', same.result.note);
  assert.equal(same.result.note, `${VERIFIED} The review screenshot shows the same review, by "Test Reviewer One".`);
  assert.deepEqual(same.asked.filter((a) => a === 'reviewShot'), ['reviewShot'], 'the review screenshot is opened and read');
  const part = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: null, body: PAGE_BODY.split(' ').slice(0, 10).join(' ') }, text: 'x' }) });
  assert.equal(part.result.note, `${VERIFIED} The review screenshot shows part of the same review.`);
  const list = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: PAGE_NAME, body: PAGE_BODY }, text: PAGE_BODY, others: 3 }) });
  assert.equal(list.result.note, `${VERIFIED} The review screenshot shows the same review, by "Test Reviewer One", among 3 other reviews.`);
  const unreadable = await check({ r: withShot(linked), review: reviewRead({ ok: false, kind: 'unknown', problem: 'its words are not clear enough to read', text: '' }) });
  assert.equal(unreadable.result.type, 'Verified', 'a review screenshot that cannot be read does not stop a Pass');
  assert.equal(unreadable.result.note, `${VERIFIED} The review screenshot could not be read, so it was not compared with the review; the review itself was checked on Amazon.`);
  const refused = await check({ r: withShot(linked), review: reviewRead({ kind: 'refused', refusal: "Sorry, you can't review this product.", text: 'x' }) });
  assert.equal(refused.result.note, `${VERIFIED} The review screenshot shows a message from Amazon, not the review, so it was not compared with the review.`);
  const otherName = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: 'Somebody Else Entirely', body: PAGE_BODY }, text: PAGE_BODY }) });
  assert.equal(otherName.result.type, 'Review screenshot not matching');
  assert.equal(otherName.result.final, 'manual');
  assert.equal(otherName.result.note, `${STAFF('the review screenshot shows a review by "Somebody Else Entirely", but the review the link opens is by "Test Reviewer One"')} A staff member must check which review is the user's. ${MATCH}`);
  const otherWords = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: null, body: 'The rack wobbles and the wheels squeak every single time I move it around the room, and one hook came off.' }, text: 'x' }) });
  assert.equal(otherWords.result.type, 'Review screenshot not matching');
  assert.match(otherWords.result.note, /^A staff member needs to check this transaction because the review screenshot's words are different from the review the link opens: it says "The rack wobbles/);
  // The reviewer's name and the review screenshot together: the first problem gives the Type, both are said.
  const both = await check({ r: withShot(linked), reviewer: 'Somebody Else Entirely', review: reviewRead({ kind: 'written', written: { name: 'Somebody Else Entirely', body: PAGE_BODY }, text: PAGE_BODY }) });
  assert.equal(both.result.type, 'Reviewer name is different');
  assert.match(both.result.note, /A staff member must check whose review it is\. The review screenshot shows a review by "Somebody Else Entirely", but the review the link opens is by "Test Reviewer One"\./);
  // A rating only on Amazon: the review screenshot is not compared for words.
  const kitRow = withShot(shot(REVIEW('R1TESTROW03ABC')), { product: { text: 'Test Brand Home Cleaning Kit' } });
  const kitOrder = orderRead({ texts: ['Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Order total %654.00', 'Test Brand Home Cleaning Kit, 6 Pieces'] });
  const kitDelivery = deliveryRead({ texts: ['Delivered 22 July', `Order # ${ORDER_ID}`, 'Test Brand Home Cleaning Kit, 6 Pieces'] });
  const rating = await check({ r: kitRow, order: kitOrder, delivery: kitDelivery, campaigns: KIT_CAMPAIGN, review: reviewRead({ kind: 'written', written: { name: null, body: 'Other words entirely about something else that is long enough to count' }, text: 'x' }) });
  assert.equal(rating.result.type, 'Rating Only', rating.result.note);
});

test("the review screenshot the way staff see it: the user's review found by name, Amazon's email saying the review is live, the review being written, a row of stars read as the name, and a cut-short review among the screen's own words", async () => {
  const linked = shot(`${REVIEW('R1TESTROW02ABC')}?ref=cm_cr_dp_d_rvw_ttl`);
  const PAGE_BODY = 'One capful cleans the whole kitchen floor and leaves no sticky film on the vitrified tiles. The bottle has lasted a month.';
  const email = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: 'Test Reviewer One', title: null, body: PAGE_BODY, email: true, own: true }, text: PAGE_BODY }) });
  assert.equal(email.result.type, 'Verified', email.result.note);
  assert.equal(email.result.note, `${VERIFIED} The review screenshot is Amazon's email saying the review is live, by "Test Reviewer One", with the same words.`);
  const emailCut = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: 'T. Reviewer One', title: null, body: `${PAGE_BODY.split(' ').slice(0, 8).join(' ')}...`, email: true, own: true }, text: 'x' }) });
  assert.equal(emailCut.result.note, `${VERIFIED} The review screenshot is Amazon's email saying the review is live, by "Test Reviewer One", with the first words of the review.`);
  const emailOther = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: 'Somebody Else Entirely', title: null, body: PAGE_BODY, email: true, own: true }, text: PAGE_BODY }) });
  assert.equal(emailOther.result.type, 'Review screenshot not matching');
  assert.match(emailOther.result.note, /because the review screenshot is Amazon's email saying a review by "Somebody Else Entirely" is live, but the review the link opens is by "Test Reviewer One"\./);
  const form = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: null, title: 'Good cleaner', body: PAGE_BODY, form: true }, text: PAGE_BODY }) });
  assert.equal(form.result.note, `${VERIFIED} The review screenshot shows the review being written, with the same words.`);
  const formOther = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: null, title: 'Smells good', body: 'Smells good, easy to use. Holds on for easily three to four hours.', form: true }, text: 'x' }) });
  assert.equal(formOther.result.type, 'Review screenshot not matching');
  assert.equal(formOther.result.final, 'manual');
  assert.match(formOther.result.note, /^A staff member needs to check this transaction because the review screenshot shows the review being written, but its words are different from the review the link opens: it says "Smells good/);
  const stars = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: 'KKKKK Verified Purchase', body: PAGE_BODY }, text: PAGE_BODY }) });
  assert.equal(stars.result.note, `${VERIFIED} The review screenshot shows the same review.`, 'a row of stars read as letters is not a name, and does not stop a Pass');
  const shortened = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: '€ T. Reviewer One', body: PAGE_BODY }, text: PAGE_BODY }) });
  assert.equal(shortened.result.note, `${VERIFIED} The review screenshot shows the same review, by "Test Reviewer One".`);
  const cut = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: null, body: `Edit profile\nAll posts Reviews\n${PAGE_BODY.split(' ').slice(0, 9).join(' ')}\nHome You Wallet Cart` }, text: 'x' }) });
  assert.equal(cut.result.note, `${VERIFIED} The review screenshot shows part of the same review.`, "the screen's own words around a cut-short review do not count");
  const twoWords = await check({ r: withShot(linked), review: reviewRead({ kind: 'written', written: { name: 'Test Reviewer One', body: 'Good product' }, text: 'x' }) });
  assert.equal(twoWords.result.type, 'Review screenshot not matching', 'two words that are not in the review');
  assert.deepEqual(email.asked.filter((a) => a.startsWith('review for')), ['review for Test Brand Floor Cleaner Liquid'], 'read once, for the product the screenshots show');
});

test('a campaign with no product read from Amazon says so in the Note; the routes give the check live campaigns only', async () => {
  const noProducts = await check({ campaigns: [campaign('Test Clean', [])] });
  assert.equal(noProducts.result.note, `${VERIFIED} The campaign "Test Clean" has no product read from Amazon, so the product was compared with the product name in the sheet.`);
});

// ---- what the reviews of this work found, each now tested ----

test('a picture of a review is never matched to someone else’s short review: its words must match both ways, and its name when it shows one', async () => {
  const pictureRow = row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } });
  const short = (url) => (url.includes('/product-reviews/B0TESTFLR1') && !url.includes('filterByKeyword=') ? { ok: true, status: 200, url, facts: { ...FACTS.seeAll, reviews: [{ id: 'R9SOMEONEELSE9', name: 'Somebody Else', stars: 5, body: 'Good product' }] } } : url.includes('filterByKeyword=') ? { ok: true, status: 200, url, facts: FACTS.miss } : null);
  const goodProduct = reviewRead({ kind: 'written', written: { name: null, body: 'Good product, cleans the marble floor well and dries fast' } });
  assert.equal((await check({ r: pictureRow, review: goodProduct, b: fakeBrowser(short) })).result.type, 'Review not live', 'two words of someone else’s review are not this review');
  const noName = reviewRead({ ...WRITTEN_PICTURE, written: { ...WRITTEN_PICTURE.written, name: null } });
  const found = await check({ r: pictureRow, review: noName });
  assert.equal(found.result.type, 'Verified', 'with no name shown, a long enough review that matches both ways is found');
  assert.match(found.result.steps[8].detail, /The review screenshot shows no reviewer's name, so only the words were compared\.$/);
});

test('an Amazon review page is a rating only only when its own words were read whole and show none', async () => {
  const at = (facts) => fakeBrowser((url) => (url.includes('R1TESTROW03ABC') ? { ok: true, status: 200, url, facts } : null));
  const kitRow = row({ product: { text: 'Test Brand Home Cleaning Kit' }, shots: { ...row().shots, review: shot(REVIEW('R1TESTROW03ABC')) } });
  const kitOrder = orderRead({ texts: ['Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Order total %654.00', 'Test Brand Home Cleaning Kit, 6 Pieces'] });
  const kitDelivery = deliveryRead({ texts: ['Delivered 22 July', `Order # ${ORDER_ID}`, 'Test Brand Home Cleaning Kit, 6 Pieces'] });
  const run = (facts) => check({ r: kitRow, order: kitOrder, delivery: kitDelivery, b: at(facts), campaigns: KIT_CAMPAIGN });
  assert.equal((await run(FACTS.starsOnly)).result.type, 'Rating Only');
  const noText = await run({ ...FACTS.starsOnly, text: '' });
  assert.equal(noText.result.type, 'Something else', "the page's words could not be read: never a rating only");
  assert.match(noText.result.note, /could not tell whether the review is a star rating only/);
  const hindi = await run({ ...FACTS.starsOnly, text: 'ग्राहक समीक्षा\nपरीक्षण समीक्षक' });
  assert.equal(hindi.result.type, 'Something else');
  const sizeText = FACTS.starsOnly.text.replace('Verified Purchase', 'Size: perfect fit for my small kitchen and the bottle lasts long\nVerified Purchase');
  assert.equal((await run({ ...FACTS.starsOnly, text: sizeText })).result.type, 'Something else', 'a long "Size: …" line may be the review itself');
});

test('a review reached through a short link is Duplicate as soon as its id is known, even a rating only', async () => {
  const r = row({ product: { text: 'Test Brand Home Cleaning Kit' }, shots: { ...row().shots, review: shot('https://amzn.in/d/0TestStars') } });
  const landing = fakeBrowser((url) => (url.startsWith('https://amzn.in/') ? { ok: true, status: 200, url: `${REVIEW('R1TESTROW03ABC')}?ref=x`, facts: FACTS.starsOnly } : null));
  const kitOrder = orderRead({ texts: ['Order date 20 July 2026', `Order # ${ORDER_ID}`, 'Order total %654.00', 'Test Brand Home Cleaning Kit, 6 Pieces'] });
  const kitDelivery = deliveryRead({ texts: ['Delivered 22 July', `Order # ${ORDER_ID}`, 'Test Brand Home Cleaning Kit, 6 Pieces'] });
  const one = other(1, { shots: { ...other(1).shots, review: shot(REVIEW('R1TESTROW03ABC')) } });
  const { result, states } = await check({ r, b: landing, order: kitOrder, delivery: kitDelivery, others: [one], campaigns: KIT_CAMPAIGN });
  assert.equal(result.type, 'Duplicate', result.note);
  assert.equal(states[5], 'fail', 'found at step 6');
  assert.equal(result.note, DUPLICATE('the review in this row is the same review as in row 1, and row 1 is the one that will be checked'));
});

test('the amount is the order total, the amount paid or the item price, never a delivery charge or money taken off', async () => {
  const summary = orderRead({ amounts: [{ text: '₹999.00', value: 999, label: 'item(s) subtotal', skip: false }, { text: '₹40.00', value: 40, label: null, skip: true }, { text: '-₹385.00', value: 385, label: null, skip: true }, { text: '₹654.00', value: 654, label: 'grand total', skip: false }] });
  const shipping = await check({ r: row({ amount: { text: '40', value: 40 } }), order: summary });
  assert.equal(shipping.result.type, 'Order details not matching');
  assert.equal(shipping.result.note, `${FAILED('the amount on the purchase screenshot does not match the amount the user gave')} The user gave the amount ₹40, and the purchase screenshot shows ₹654 as the grand total.`, 'the total is named, never the delivery charge');
  assert.equal((await check({ order: summary })).result.type, 'Verified');
});

test('a picture downloaded again during the check is the one compared and named; it is no longer called "could not be opened"', async () => {
  const lost = row({ shots: { ...row().shots, review: shot(null) }, pictures: { order: [{ link: DRIVE_ORDER, problem: { kind: 'busy', site: 'Google Drive', says: 'Google Drive is limiting downloads right now' } }], delivery: [pic('Delivery02', '2')], review: [] } });
  const now = { files: ['/pictures/order-0.png'], problems: [], records: [pic('Order02', '1')] };
  const { result } = await check({ r: lost, pics: { order: now } });
  assert.equal(result.type, 'Review link or screenshot missing');
  assert.equal(result.note, `${FAILED('the user did not give a review link or a review screenshot in the form')} ${MATCH}`);
  assert.doesNotMatch(result.note, /could not be opened/, 'the purchase screenshot, downloaded just now, is not called missing');
  const twin = other(1, { pictures: { order: [{ ...pic('Twin', '7'), sha256: 'sha-Fresh' }], delivery: [], review: [] } });
  const fresh = await check({ r: lost, others: [twin], order: orderRead({ orderIds: [] }), pics: { order: { files: ['/pictures/order-0.png'], problems: [], records: [{ ...pic('Order02', '1'), sha256: 'sha-Fresh' }] } } });
  assert.equal(fresh.result.type, 'Duplicate', 'a picture just downloaded is compared with the other rows’ too');
});

test('a review picture that is another row’s is Duplicate before anything else, even when the amount is wrong', async () => {
  const r = row({ amount: { text: '851', value: 851 }, shots: { ...row().shots, review: shot(PICTURE_REVIEW) }, pictures: { ...row().pictures, review: [pic('Review11', 'c')] } });
  const one = other(1, { pictures: { order: [], delivery: [], review: [pic('Review01', 'c')] }, seen: { review: { orderIds: [], text: WRITTEN.body } }, last: { status: 'Verified', type: 'Verified', typeKey: 'verified' } });
  const { result, states } = await check({ r, others: [one], review: WRITTEN_PICTURE });
  assert.equal(result.type, 'Duplicate', result.note);
  assert.equal(states[0], 'fail');
  assert.equal(result.note, DUPLICATE('the review screenshot in this row is the same picture as the review screenshot in row 1, which was already checked'));
});

test('a short link that lands on a page only the writer can see is Need Access, and that page is never read', async () => {
  const b = fakeBrowser((url) => (url.startsWith('https://amzn.in/') ? { ok: true, status: 200, url: 'https://www.amazon.in/review/review-your-purchases/edit?asin=B0TESTFLR1&channel=x', facts: { url: 'https://www.amazon.in/review/review-your-purchases/edit', reviews: [], text: '' } } : null));
  const { result } = await check({ r: row({ shots: { ...row().shots, review: shot('https://amzn.in/d/0TestWriter') } }), b });
  assert.equal(result.type, 'Need Access');
  assert.equal(result.note, `${STAFF('the review link leads to a page only the person who wrote the review can see, so the dashboard did not look at it')} Ask the user to send the review's public link, then check this row again. ${MATCH}`);
});

test('the order ID in the sheet is read from its cell; words that are not one never make two rows Duplicate, and are never called different', async () => {
  const hash = row({ orderId: { text: '#403-1000002-2000002', value: '403-1000002-2000002' } });
  assert.equal((await check({ r: hash })).result.type, 'Verified');
  const na = row({ orderId: { text: 'NA', value: '' } });
  const naToo = other(41, { orderId: { text: 'NA', value: '' } });
  const { result } = await check({ r: na, others: [naToo] });
  assert.equal(result.type, 'Order details not matching', 'not Duplicate, and not a different order ID');
  assert.equal(result.note, STAFF('the order ID in the form, "NA", is not an order ID, so the screenshots cannot be compared with it'), 'the dashboard cannot decide it');
});

test('words quoted in a Note with full stops in them stay one sentence', async () => {
  const { result } = await check({ r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: reviewRead({ kind: 'refused', refusal: 'Sorry! You cannot review this product. Please try again later.' }) });
  assert.equal(result.note, `${FAILED('the review screenshot shows a message from Amazon that the review could not be added: "Sorry; You cannot review this product; Please try again later"')} ${MATCH}`);
});

test('a word this dashboard must not show is never searched for, so it never shows on the screen either', async () => {
  const hidden = Buffer.from('cmVmdW5kZWQ=', 'base64').toString('utf8');
  const words = [];
  const b = fakeBrowser((url) => {
    if (url.includes('filterByKeyword=')) words.push(decodeURIComponent(url.split('filterByKeyword=')[1]));
    return url.includes('filterByKeyword=') ? { ok: true, status: 200, url, facts: FACTS.miss } : null;
  });
  const body = `They ${hidden} everything quickly, and the lavender floor polish smells wonderful afterwards`;
  await check({ r: row({ shots: { ...row().shots, review: shot(PICTURE_REVIEW) } }), review: reviewRead({ kind: 'written', written: { name: 'Test Reviewer Two', body } }), b });
  assert.ok(words.length > 0);
  for (const w of words) assert.doesNotMatch(w, BANNED, w);
});

// ---- a file with fewer or other columns ----

const REVIEW_SHOT = 'https://drive.google.com/open?id=1TestReviewShotRow02abc';
/** A row of a newer file: its review screenshot, and a review link cell that holds this. */
const withShot = (review, over = {}) => row({ shots: { ...row().shots, review, reviewShot: shot(REVIEW_SHOT) }, pictures: { ...row().pictures, reviewShot: [] }, ...over });
const RATING_PICTURE = reviewRead({ kind: 'rating', stars: 4, ratingPhrase: 'Thanks for rating!', productShown: { share: 1, shown: FLOOR } });

test('a file with no order date: the order date is never compared, never a problem, and no Note says it matched', async () => {
  const noDate = row({ orderDate: { text: '', value: null } });
  const { result } = await check({ r: noDate, has: { orderDate: false } });
  assert.deepEqual([result.final, result.type, result.note], ['pass', 'Verified', VERIFIED]);
  assert.deepEqual(result.comparison.map((c) => c.field), ['Order ID', 'Amount', 'Product', 'Delivered', 'Rating', 'Written review', 'Live and public'], 'no order date in the comparison');
  assert.doesNotMatch(result.steps[2].detail, /order date/i, "the step's line does not name it");
  assert.deepEqual(result.compared, ['orderId', 'amount', 'product']);
  const empty = await check({ r: noDate });
  assert.equal(empty.result.final, 'manual', 'with an order date column, an empty cell still needs a staff member');
});

test('a file with no amount or product name: those are left out too, the reviewed product as well', async () => {
  const bare = row({ amount: { text: '', value: null }, product: { text: '' } });
  const { result, note } = await check({ r: bare, has: { amount: false, product: false }, campaigns: [] });
  assert.deepEqual([result.final, result.type], ['pass', 'Verified']);
  assert.equal(note, VERIFIED, 'no Note says the product was compared');
  assert.deepEqual(result.comparison.map((c) => c.field), ['Order ID', 'Order date', 'Delivered', 'Rating', 'Written review', 'Live and public']);
});

test('a file with no delivery screenshot column needs a staff member, since that proof cannot be seen; an empty cell in a column the file has stays Fail', async () => {
  const noDelivery = row({ shots: { ...row().shots, delivery: shot('') }, pictures: { ...row().pictures, delivery: [] } });
  const { result, asked } = await check({ r: noDelivery, has: { deliveryShot: false } });
  assert.deepEqual([result.final, result.type], ['manual', 'Delivery screenshot missing']);
  assert.equal(result.note, STAFF('the file has no delivery screenshot column, so the delivery cannot be seen'));
  assert.equal(result.steps[3].detail, 'The file has no delivery screenshot column.');
  assert.ok(!asked.includes('delivery'), 'nothing is downloaded for it');
  assert.deepEqual(result.shotsHad, ['order']);
  assert.deepEqual(result.comparison.map((c) => c.field), ['Order ID', 'Order date', 'Amount', 'Product', 'Rating', 'Written review', 'Live and public'], 'no Delivered line');
  assert.equal(field(result, 'Order ID').result, 'The same on the purchase screenshot.');
  const noPurchase = await check({ r: row({ shots: { ...row().shots, order: shot('') } }), has: { orderShot: false } });
  assert.equal(noPurchase.result.note, STAFF('the file has no purchase screenshot column, so the purchase cannot be seen'));
  const empty = await check({ r: noDelivery });
  assert.deepEqual([empty.result.final, empty.result.type], ['fail', 'Delivery screenshot missing'], 'the column is there, and the cell is empty');
});

test('a review link that is empty, words, or not a link to one review: the review screenshot is read instead, the way a picture in the review link cell is read', async () => {
  for (const [cell, why] of [
    [words('NA'), 'The review link cell says "NA"'],
    [shot(''), 'The review link cell is empty'],
    [shot('https://www.amazon.in/portal/customer-reviews/B0TESTPRD1/ref=cm_cr_dp_d_show_all_btm?sortBy=recent'), "The review link opens a product's list of reviews on Amazon, not one review"],
    [shot('https://www.amazon.in/dp/B0TESTPRD1'), 'The review link opens a product page on Amazon, not one review'],
    [shot('https://www.amazon.in/review/create-review/error?asin=B0TESTPRD1'), 'The review link opens an Amazon error page, not one review'],
    [shot('https://www.amazon.in/review/review-your-purchases/edit?asin=B0TESTPRD1'), 'The review link opens a page only the person who wrote the review can see, not one review'],
    [shot('https://apps.apple.com/in/app/test-shopping/id0000000001'), "The review link opens an app store's page, not one review"],
    [shot(PICTURE_REVIEW), 'The review link opens a picture on Google Drive, not one review'],
  ]) {
    const { result, asked, b } = await check({ r: withShot(cell), review: RATING_PICTURE });
    assert.deepEqual([result.final, result.type], ['pass', 'Rating Only'], why);
    assert.equal(result.steps[5].detail, `${why}, so the review screenshot was opened instead.`);
    assert.ok(asked.includes('reviewShot') && !asked.includes('review'), 'the review screenshot is downloaded, not the review link');
    assert.equal(b.opened.length, 0, 'no Amazon page is opened for it');
  }
  const noLinkColumn = await check({ r: withShot(shot('')), review: RATING_PICTURE, has: { reviewLink: false } });
  assert.equal(noLinkColumn.result.steps[5].detail, 'The file has no review link column, so the review screenshot was opened instead.');
  // A short link that lands on a product page: its review screenshot, after all.
  const landed = await check({ r: withShot(shot('https://amzn.in/d/0TestCode')), review: RATING_PICTURE, b: fakeBrowser((url) => (url.includes('amzn.in') ? { ok: true, status: 200, url: 'https://www.amazon.in/dp/B0TESTFLR1', facts: FACTS.product } : null)) });
  assert.equal(landed.result.type, 'Rating Only');
  assert.equal(landed.result.steps[5].detail, 'The review link opens a product page on Amazon, not one review, so the review screenshot was opened instead.');
});

test('with no review screenshot, those review links are as before: words are a missing review link, an error page or an app store page is a wrong review link', async () => {
  const na = await check({ r: row({ shots: { ...row().shots, review: words('NA') } }) });
  assert.equal(na.result.type, 'Review link or screenshot missing');
  const error = await check({ r: row({ shots: { ...row().shots, review: shot('https://www.amazon.in/review/create-review/error?asin=B0TESTPRD1') } }) });
  assert.deepEqual([error.result.type, error.result.note], ['Wrong review link', `${FAILED('the review link opens an Amazon error page, not a review')} ${MATCH}`]);
  const app = await check({ r: row({ shots: { ...row().shots, review: shot('https://apps.apple.com/in/app/test-shopping/id0000000001') } }) });
  assert.equal(app.result.note, `${FAILED("the review link opens an app store's page, not a review")} ${MATCH}`);
  assert.equal(app.b.opened.length, 0, 'never opened');
});

test("a link to one review of the newer kinds finds that review: the srp page, and an email link holding a business.amazon.in review", async () => {
  const srp = await check({ r: row({ shots: { ...row().shots, review: shot('https://www.amazon.in/portal/customer-reviews/srp/-/R1TESTROW02ABC/ref=cm_cr_srp_d_rvw_ttl') } }) });
  assert.deepEqual([srp.result.type, srp.b.opened[0]], ['Verified', REVIEW('R1TESTROW02ABC')]);
  const business = `https://www.amazon.in/gp/f.html?C=1TEST&U=${encodeURIComponent('https://business.amazon.in/abredir/review/R1TESTROW02ABC/ref=pe_000')}&H=TEST`;
  const viaEmail = await check({ r: row({ shots: { ...row().shots, review: shot(business) } }) });
  assert.deepEqual([viaEmail.result.type, viaEmail.b.opened[0]], ['Verified', REVIEW('R1TESTROW02ABC')]);
});

test('words such as NA, or the same error page or product page, in two rows never make them the same review; the same review screenshot does', async () => {
  const na = await check({ r: row({ shots: { ...row().shots, review: words('NA') } }), others: [other(1, { shots: { ...other(1).shots, review: words('NA') } })] });
  assert.equal(na.result.type, 'Review link or screenshot missing', 'not Duplicate');
  for (const link of ['https://www.amazon.in/review/create-review/error?asin=B0TESTPRD1', 'https://www.amazon.in/portal/customer-reviews/B0TESTPRD1/ref=x?sortBy=recent', 'https://www.amazon.in/dp/B0TESTPRD1']) {
    const both = await check({ r: row({ shots: { ...row().shots, review: shot(link) } }), others: [other(1, { shots: { ...other(1).shots, review: shot(link) } })] });
    assert.equal(both.result.type, 'Wrong review link', link);
  }
  const shared = 'https://drive.google.com/open?id=1TestSharedReviewShotabc';
  const later = await check({ r: withShot(shot(REVIEW('R1TESTROW02ABC')), { shots: { ...row().shots, reviewShot: shot(shared) } }), others: [other(1, { shots: { ...other(1).shots, reviewShot: shot(shared) } })] });
  assert.equal(later.result.type, 'Duplicate');
  assert.equal(later.result.note, DUPLICATE('this row uses the same review screenshot as row 1, and row 1 is the one that will be checked'));
});

test('a short product name from a newer file, with " - Amazon" and a small spelling slip, matches the long name on the screenshots', async () => {
  const { result } = await check({ r: row({ product: { text: 'Floor Cleanr Liquid Lavender - Amazon' } }), campaigns: [] });
  assert.deepEqual([result.order.details.product.state, result.delivery.details.product.state], ['same', 'same']);
  assert.equal(result.type, 'Verified');
});

test('every Note, Type, step and word the checks above made is plain: no cell name, column letter, code, long dash or double dash', () => {
  const texts = made.filter((t) => typeof t === 'string' && t);
  assert.ok(texts.length > 300, `${texts.length} words looked at`);
  assertPlain(assert, texts, 'words a check made');
  for (const t of Object.values(PAUSE_SAYS)) assertPlain(assert, [t], 'pause messages');
  for (const t of TYPE_KEYS) assertPlain(assert, [SETTINGS.typeWords[t]], 'Types');
});
