// Reading Amazon's pages, from saved pages only: each fixture is opened in a
// headless Chrome at its Amazon address, but every request is answered here
// or refused, so nothing ever reaches Amazon.
// Run: node test/amazon-pages.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { readAmazonPage, readAccountLine, accountFrom, scrollToReviewsInPage, whatPageIs, findReview, missingParts, textReview, reviewParts, reviewedProduct, brandOf, productOnPage } from '../amazon/page-read.js';
import { parseReviewPageText, normalizeText } from '../amazon/text.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'amazon');
const fixture = (name) => readFileSync(join(FIX, name), 'utf8');

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
const context = await browser.newContext();
let served = null;
const seen = [];
await context.route('**/*', (route) => {
  const req = route.request();
  seen.push(req.url());
  if (req.isNavigationRequest() && served) return route.fulfill({ status: served.status, contentType: 'text/html; charset=utf-8', body: served.body });
  return route.abort();
});
const page = await context.newPage();
after(() => browser.close());

async function factsFor(name, url, status = 200, body = fixture(name)) {
  served = { body, status };
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  served = null;
  return page.evaluate(readAmazonPage);
}

test('the review page: every part of the review, and its product link', async () => {
  const f = await factsFor('review-page.html', 'https://www.amazon.in/gp/customer-reviews/R1TESTREVIEW01');
  assert.deepEqual(whatPageIs(f, 200), { kind: 'page', why: null });
  assert.equal(f.reviews.length, 1);
  const r = findReview(f, 'R1TESTREVIEW01');
  assert.equal(r.name, 'Asha R Verma');
  assert.equal(r.stars, 4);
  assert.equal(r.title, 'Folds flat and holds a lot', 'the title, without the stars it sits beside');
  assert.equal(r.dateText, 'Reviewed in India on 12 August 2026');
  assert.equal(r.body, 'The rack folds flat in seconds and holds a full load of winter clothes.\nThe wheels lock firmly and the zircon grey finish has not chipped after a month of daily use.');
  assert.doesNotMatch(r.body, /Read more/);
  assert.equal(r.verified, true);
  assert.equal(r.variant, 'Colour: Grey');
  assert.equal(r.variantAsin, 'B0TESTVAR1');
  assert.deepEqual(f.reviewProduct, { title: 'Test Brand Folding Garment Rack with Wheels', asin: 'B0TESTVAR1', href: '/Test-Brand-Folding-Garment-Rack/dp/B0TESTVAR1/ref=cm_cr_arp_d_product_top?ie=UTF8' });
  assert.equal(reviewedProduct(f).from, 'product-link');
  assert.deepEqual(missingParts(r), [], 'every part is in the block');
  assert.equal(findReview(f, 'R0NOTTHISONE1'), null, 'found by id, never by name alone');
});

// Shaped like the real review page read on 1 October 2026, with made-up details.
const REAL_SHAPE_URL = 'https://www.amazon.in/gp/customer-reviews/R4TESTREVIEW04';
const BOTTLE = 'Test Brand Insulated Steel Water Bottle, 1 Litre, Black';
const BOTTLE_BODY = 'The bottle keeps water cold for a full day in the car.\nThe lid seals tightly and the matte powder coat has not scratched after two months of daily use.';

test('the review page as it really is: the block has no title or text, so those two come from the page text', async () => {
  const f = await factsFor('review-page-real-shape.html', REAL_SHAPE_URL);
  assert.deepEqual(whatPageIs(f, 200), { kind: 'page', why: null });
  assert.equal(f.reviews.length, 1);
  const block = findReview(f, 'R4TESTREVIEW04');
  assert.equal(block.name, 'Test Reviewer');
  assert.equal(block.stars, 5);
  assert.equal(block.starsText, '5 out of 5 stars');
  assert.equal(block.dateText, 'Reviewed in India on 9 March 2026');
  assert.equal(block.verified, true);
  assert.equal(block.title, null, 'no [data-hook="review-title"], as on the real page');
  assert.equal(block.body, null, 'an empty [data-hook="review-body"], as on the real page');
  assert.deepEqual(missingParts(block), ['title', 'text']);

  const text = parseReviewPageText(f.text);
  const review = reviewParts(block, text);
  assert.deepEqual(review.from, { name: 'block', stars: 'block', title: 'text', date: 'block', text: 'text' });
  assert.equal(review.name, 'Test Reviewer');
  assert.equal(review.stars, 5);
  assert.equal(review.title, 'Keeps water cold all day');
  assert.equal(review.dateText, 'Reviewed in India on 9 March 2026');
  assert.equal(review.day, '2026-03-09');
  assert.equal(review.body, BOTTLE_BODY);
  assert.equal(review.verified, true);
  assert.deepEqual(review.disagree, []);

  const own = reviewParts({ ...block, title: 'The block’s own title' }, text);
  assert.equal(own.title, 'The block’s own title', 'a part the block shows is never replaced by the text');
  assert.equal(own.from.title, 'block');
  const other = reviewParts({ ...block, name: 'Someone Else' }, text);
  assert.deepEqual(other.disagree, ['name'], 'a page text that is another review fills nothing');
  assert.deepEqual(other.from, { name: 'block', stars: 'block', title: null, date: 'block', text: null });
  assert.equal(other.body, null);
  for (const [differs, change] of [['stars', { stars: 4 }], ['date', { dateText: 'Reviewed in India on 10 March 2026' }]]) {
    const r = reviewParts({ ...block, ...change }, text);
    assert.deepEqual(r.disagree, [differs], `another ${differs}: another review`);
    assert.equal(r.title, null);
    assert.equal(r.body, null);
  }
  assert.deepEqual(reviewParts({ ...block, name: 'TEST  reviewer.' }, text).disagree, [], 'names compared ignoring capitals, spaces and punctuation');
  assert.deepEqual(reviewParts(null, text).from, { name: 'text', stars: 'text', title: 'text', date: 'text', text: 'text' }, 'no block: all from the text, as before');
});

test('the page text is kept to 30000 characters; review words it may have cut are not taken from it', async () => {
  const words = 'The bottle keeps water cold through a long drive in the summer heat. '.repeat(450);
  const long = await factsFor('review-page-real-shape.html', REAL_SHAPE_URL, 200, fixture('review-page-real-shape.html').replace('The bottle keeps water cold for a full day in the car.', words));
  assert.equal(long.textCut, true);
  assert.equal(long.text.length, 30000);
  const t = textReview(long);
  assert.equal(t.cut, true);
  assert.equal(t.body, null, 'never part of the words as if they were all');
  assert.equal(t.title, 'Keeps water cold all day', 'the parts before the words are still read');
  assert.equal(reviewedProduct(long).from, 'buying-options', 'Product Details was cut off too');
  const whole = await factsFor('review-page-real-shape.html', REAL_SHAPE_URL);
  assert.equal(whole.textCut, false);
  assert.equal(textReview(whole).body, BOTTLE_BODY);
  assert.equal(textReview(whole).cut, undefined);
  assert.equal(textReview({ text: 'Sign in or create account', textCut: true }), null);
});

test('the reviewed product on the real page: the link with its title under Product Details, never a recommendation', async () => {
  const f = await factsFor('review-page-real-shape.html', REAL_SHAPE_URL);
  assert.equal(f.reviewProduct, null, 'the page has no product link of the review’s own');
  assert.equal(f.productLinks[0].asin, 'B0TESTREC1', 'the first /dp/ link on the page is a recommendation');
  for (const a of ['B0TESTREC1', 'B0TESTREC2', 'B0TESTREC3', 'B0TESTREC4', 'B0TESTREC5']) assert.ok(f.productLinks.some((l) => l.asin === a), `recommendation ${a} is on the page`);
  const words = (asin) => normalizeText(f.productLinks.find((l) => l.asin === asin).text);
  assert.ok(words('B0TESTREC4').includes(normalizeText(BOTTLE)), 'a recommendation whose title holds the product title');
  assert.ok(normalizeText(BOTTLE).includes(words('B0TESTREC5')), 'and one whose cut-short title is part of it: only the same title is the reviewed product');
  assert.ok(f.productLinks.every((l) => /\/dp\//.test(l.href)), '/gp/product/ and /product-reviews/ links are not /dp/ links');
  assert.deepEqual(reviewedProduct(f), { asin: 'B0TESTPROD', title: BOTTLE, href: '/Test-Brand-Insulated-Steel-Water-Bottle/dp/B0TESTPROD/ref=cm_cr_arp_d_product_top?ie=UTF8', from: 'title' });

  const without = (drop) => ({ ...f, productLinks: f.productLinks.filter((l) => !drop(l)) });
  assert.deepEqual(reviewedProduct(without((l) => l.text === BOTTLE)), { asin: 'B0TESTPROD', title: BOTTLE, href: '/dp/B0TESTPROD/ref=cm_cr_arp_d_bdcrb_top?ie=UTF8', from: 'buying-options' }, 'next, the link behind See All Buying Options');
  assert.equal(reviewedProduct(without((l) => l.asin === 'B0TESTPROD')), null, 'neither: no product, and never the first /dp/ link');
  const twice = { ...f, productLinks: [...f.productLinks, { asin: 'B0TESTREC9', href: '/dp/B0TESTREC9', text: BOTTLE, label: null }] };
  assert.equal(reviewedProduct(twice).from, 'buying-options', 'the title on links to two products is not certain');
  const labelled = without((l) => l.text === BOTTLE).productLinks.map((l) => (l.text === 'See All Buying Options' ? { ...l, text: null, label: 'See All Buying Options' } : l));
  assert.equal(reviewedProduct({ ...f, productLinks: labelled }).asin, 'B0TESTPROD', 'the button named by its label');
  assert.equal(reviewedProduct({ ...f, reviewProduct: { title: 'Its own', asin: 'B0TESTOWN1', href: '/dp/B0TESTOWN1' } }).from, 'product-link', 'the review’s own product link comes first');
});

test('the product page: title, ASIN, variants and the "See all reviews" link', async () => {
  const f = await factsFor('product-page.html', 'https://www.amazon.in/dp/B0TESTMAIN');
  assert.equal(whatPageIs(f, 200).kind, 'page');
  assert.equal(f.productTitle, 'Test Brand Folding Garment Rack with Wheels');
  assert.equal(f.pageAsin, 'B0TESTMAIN');
  assert.equal(f.parentAsin, 'B0TESTPRNT');
  for (const a of ['B0TESTMAIN', 'B0TESTVAR1', 'B0TESTVAR2']) assert.ok(f.variantAsins.includes(a), a);
  assert.equal(f.seeAllHref, '/product-reviews/B0TESTMAIN/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews');
  assert.equal(f.reviews.length, 1, 'only the top reviews are on the product page');
});

test('the keyword search: the review is found by its id, with its text', async () => {
  const f = await factsFor('search-page.html', 'https://www.amazon.in/product-reviews/B0TESTMAIN?filterByKeyword=zircon');
  assert.equal(f.reviews.length, 2, 'a list item and the block inside it are one review');
  const r = findReview(f, 'R1TESTREVIEW01');
  assert.ok(r);
  assert.equal(r.stars, 4);
  assert.match(r.body, /zircon grey finish/);
  const miss = await factsFor('search-miss.html', 'https://www.amazon.in/product-reviews/B0TESTMAIN?filterByKeyword=zircon');
  assert.equal(findReview(miss, 'R1TESTREVIEW01'), null);
  assert.equal(miss.reviews.length, 1);
});

test('what stops a step: sign-in, robot check, error and missing pages are named, never got around', async () => {
  const signin = await factsFor('signin-page.html', 'https://www.amazon.in/ap/signin?openid.return_to=https%3A%2F%2Fwww.amazon.in%2Fgp%2Fcustomer-reviews%2FR1TESTREVIEW01');
  assert.deepEqual(whatPageIs(signin, 200), { kind: 'signin', why: 'Amazon asked to log in.' });
  // The same page wherever it is served from.
  const signinHere = await factsFor('signin-page.html', 'https://www.amazon.in/product-reviews/B0TESTMAIN');
  assert.equal(whatPageIs(signinHere, 200).kind, 'signin');
  const captcha = await factsFor('captcha-page.html', 'https://www.amazon.in/errors/validateCaptcha');
  assert.equal(whatPageIs(captcha, 200).kind, 'captcha');
  const error = await factsFor('error-page.html', 'https://www.amazon.in/dp/B0TESTMAIN', 503);
  assert.equal(whatPageIs(error, 503).kind, 'blocked');
  assert.equal(whatPageIs({ url: 'https://www.amazon.in/x', text: '' }, 429).kind, 'blocked');
  const missing = await factsFor('not-found-page.html', 'https://www.amazon.in/gp/customer-reviews/R0GONEREVIEW1', 404);
  assert.equal(whatPageIs(missing, 404).kind, 'not-found');
  assert.equal(whatPageIs(missing, 200).kind, 'not-found', 'by its words too');
  assert.equal(whatPageIs({}, null).kind, 'page');
});

test('who is signed in: the "Hello, ..." line, or a sign-in page; never what anyone types', async () => {
  const f = await factsFor('review-page.html', 'https://www.amazon.in/gp/customer-reviews/R1TESTREVIEW01');
  assert.equal(f.hello, 'Hello, Test Staff');
  assert.deepEqual(accountFrom(f), { signedIn: true, name: 'Test Staff' });
  assert.deepEqual(await page.evaluate(readAccountLine), { url: 'https://www.amazon.in/gp/customer-reviews/R1TESTREVIEW01', hello: 'Hello, Test Staff', signInForm: false });
  const signin = await factsFor('signin-page.html', 'https://www.amazon.in/ap/signin?x=1');
  assert.deepEqual(accountFrom(signin), { signedIn: false });
  assert.deepEqual(accountFrom({ url: 'https://www.amazon.in/', hello: 'Hello, sign in' }), { signedIn: false });
  assert.deepEqual(accountFrom({ url: 'https://www.amazon.in/', hello: 'नमस्ते, Test Staff' }), { signedIn: true, name: 'Test Staff' });
  assert.equal(accountFrom({ url: 'https://www.amazon.in/', hello: null }), null, 'a page with no "Hello" line says nothing');
  assert.equal(accountFrom({ url: 'https://evil.example/', hello: 'Hello, Someone' }), null, 'only amazon.in pages are believed');
  assert.equal(accountFrom({ url: 'not a link' }), null);
});

test("the product page scrolls to its reviews; a page without them says so", async () => {
  await factsFor('product-page.html', 'https://www.amazon.in/dp/B0TESTMAIN');
  assert.equal(await page.evaluate(scrollToReviewsInPage), true);
  await factsFor('signin-page.html', 'https://www.amazon.in/dp/B0TESTMAIN');
  assert.equal(await page.evaluate(scrollToReviewsInPage), false);
});

test('nothing reached the network', () => {
  assert.ok(seen.length > 0);
  for (const url of seen) assert.ok(url.startsWith('https://'), url);
  // Every request went through the route above, which only fulfils from fixtures or refuses.
});

test("a campaign's product page: its real name, its brand and its other colours and sizes, with their names", async () => {
  const f = await factsFor('product-kit.html', 'https://www.amazon.in/dp/B0TESTKIT9');
  assert.equal(f.byline, 'Visit the Test Brand Store');
  assert.equal(f.brandRow, 'Test Brand');
  assert.deepEqual(productOnPage(f), {
    name: 'Test Brand Monthly Home Cleaning Kit | Dishwash Liquid 2L Refill, Floor Cleaner 1L | Plant-Based Formula',
    asin: 'B0TESTKIT9',
    brand: 'Test Brand',
    variants: [{ asin: 'B0TESTKIT8', label: 'Pack of 2' }, { asin: 'B0TESTKIT7', label: 'Refill only' }],
  });
  const floor = await factsFor('product-floor-cleaner.html', 'https://www.amazon.in/dp/B0TESTFLR1');
  assert.equal(brandOf(floor), null, 'a page that shows no brand');
  assert.deepEqual(productOnPage(floor).variants, [{ asin: 'B0TESTFLR2', label: '2 Litre' }], 'never the page itself');
  assert.equal(productOnPage(await factsFor('review-page.html', 'https://www.amazon.in/gp/customer-reviews/R1TESTREVIEW01')).name, null, 'a review page is not a product page');
});
