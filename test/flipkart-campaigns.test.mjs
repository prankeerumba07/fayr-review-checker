// Flipkart campaigns without a browser or a server: the products typed one per
// line (a Flipkart link, or a Flipkart product ID alone), Flipkart's own
// links, what kind of page Flipkart showed, the product a page shows with its
// other colours and sizes, and one product read through a pretend browser:
// read and used only when its brand is the campaign's (the rule and the words
// of the Amazon campaigns), a product ID alone, a robot check, a block, an
// error, a page that is not a product, and a page that could not be opened.
// Made-up products only.
// Run: node test/flipkart-campaigns.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productLines, readProduct, needsReading, usable, brandIn, brandProblem, confirmProducts, clean, PREVENTED_SAYS, ADD_LINK_SAYS, MAX_CAMPAIGN_PRODUCTS, CAMPAIGN_KEY, newCampaignKey } from '../flipkart/campaigns.js';
import { isFlipkart, isFlipkartSite, pidFrom, itemIdFrom, pageForPid, pageForLink } from '../flipkart/links.js';
import { whatPageIs, productOnPage } from '../flipkart/page-read.js';

const GLOW = 'https://www.flipkart.com/test-glow-face-mask/p/itmtestglow0001?pid=FCPTESTGLOW00001';
const GLOW_PID = 'FCPTESTGLOW00001';
const GLOW_REVIEWS = 'https://www.flipkart.com/test-glow-face-mask/product-reviews/itmtestglow0001?pid=FCPTESTGLOW00001&marketplace=FLIPKART';
const CLAY = 'https://www.flipkart.com/test-clay-face-mask/p/itmtestclay0001?pid=FCPTESTCLAY00001';
const AT = '2026-10-12T05:00:00.000Z';
const now = () => new Date(AT);

/** A made-up product page as readFlipkartPage reads it, with its JSON-LD. */
const productPage = (url, product = {}, extra = {}) => ({
  ok: true,
  status: 200,
  url,
  facts: {
    url,
    title: 'Test Glow Face Mask - Price in India, Buy Test Glow Face Mask Online In India | Flipkart.com',
    text: 'Test Glow Face Mask\n4.1\nbased on 120 ratings by Verified Buyers',
    canonical: 'https://www.flipkart.com/test-glow-face-mask/p/itmtestglow0001',
    product: { name: 'Test Glow Face Mask', brand: 'Test Glow', sku: GLOW_PID, rating: 4.1, ratings: 120, reviews: 12, ...product },
    reviewLinks: ['https://www.flipkart.com/test-glow-face-mask/product-reviews/itmtestglow0001?pid=FCPTESTGLOW00001&aid=test-aspect&an=Brightness', 'https://www.flipkart.com/test-glow-face-mask/product-reviews/itmtestglow0001?pid=FCPTESTGLOW00001&lid&marketplace=FLIPKART'],
    // Its size chooser: the other size, and its own.
    variants: [{ pid: 'FCPTESTGLOW00002', label: '100 ml' }, { pid: GLOW_PID, label: '50 ml' }],
    robotFrame: false,
    robotForm: false,
    ...extra,
  },
});
/** Any other made-up page. */
const page = (url, facts = {}, status = 200) => ({ ok: true, status, url, facts: { url, title: 'Flipkart', text: '', canonical: null, product: null, reviewLinks: [], robotFrame: false, robotForm: false, ...facts } });
const READ_GLOW = { at: AT, name: 'Test Glow Face Mask', brand: 'Test Glow', variants: [{ pid: 'FCPTESTGLOW00002', label: '100 ml' }], pid: GLOW_PID, itemId: 'itmtestglow0001', rating: 4.1, ratings: 120, reviews: 12, allReviews: GLOW_REVIEWS };

function fakeBrowser(answer) {
  const b = {
    opened: [],
    begun: 0,
    async begin() {
      b.begun++;
    },
    async open(url) {
      b.opened.push(url);
      return answer(url);
    },
  };
  return b;
}

const product = (line) => ({ ...productLines(line).products[0], read: null, problem: null });

test('the products, one per line: a Flipkart link or a Flipkart product ID alone; anything else is said in plain words; the same product twice counts once; at most 30', () => {
  const { products, problems } = productLines([GLOW, '  fcptestclay00001  ', '', 'https://dl.flipkart.com/s/test0001', GLOW_PID, `${GLOW}&affid=test`, 'www.flipkart.com/test-jar/p/itmtestjar00001?pid=FCPTESTJAR000001'].join('\n'));
  assert.deepEqual(problems, []);
  assert.deepEqual(products, [
    { given: GLOW, url: GLOW, pid: GLOW_PID, itemId: 'itmtestglow0001', byId: false },
    { given: 'FCPTESTCLAY00001', url: 'https://www.flipkart.com/product/p/itme?pid=FCPTESTCLAY00001', pid: 'FCPTESTCLAY00001', itemId: null, byId: true },
    { given: 'https://dl.flipkart.com/s/test0001', url: 'https://dl.flipkart.com/s/test0001', pid: null, itemId: null, byId: false },
    { given: 'www.flipkart.com/test-jar/p/itmtestjar00001?pid=FCPTESTJAR000001', url: 'https://www.flipkart.com/test-jar/p/itmtestjar00001?pid=FCPTESTJAR000001', pid: 'FCPTESTJAR000001', itemId: 'itmtestjar00001', byId: false },
  ], 'a product ID in capitals or not; the same product typed again, or its link with more in it, counts once; a Flipkart link without https:// is a link too');
  const bad = productLines(['Test Glow Face Mask', 'https://www.amazon.in/dp/B0TESTKIT9', 'FCPTESTGLOW0000', 'ABCDEFGHIJKLMNOP', 'https://flipkart.com.example.com/test/p/itmtestglow0001?pid=FCPTESTGLOW00001'].join('\n'));
  assert.deepEqual(bad.problems, [
    'Line 1 of the products, "Test Glow Face Mask", is not a Flipkart link or a Flipkart product ID.',
    'Line 2 of the products is a link to www.amazon.in, not to Flipkart, so it cannot be used.',
    'Line 3 of the products, "FCPTESTGLOW0000", is not a Flipkart link or a Flipkart product ID.',
    'Line 4 of the products, "ABCDEFGHIJKLMNOP", is not a Flipkart link or a Flipkart product ID.',
    'Line 5 of the products is a link to flipkart.com.example.com, not to Flipkart, so it cannot be used.',
  ]);
  assert.deepEqual(bad.products, []);
  const many = Array.from({ length: MAX_CAMPAIGN_PRODUCTS + 1 }, (_, i) => `FCPTESTMANY${String(i).padStart(5, '0')}`).join('\n');
  assert.deepEqual(productLines(many).problems, ['A campaign can have at most 30 products.']);
  assert.equal(productLines(many.split('\n').slice(0, 30).join('\n')).problems.length, 0, '30 is fine');
  assert.match(newCampaignKey(), CAMPAIGN_KEY);
});

test("Flipkart's own links: its websites, the product ID and the item ID in a link, and the page opened for a product", () => {
  assert.deepEqual(['https://www.flipkart.com/', 'https://flipkart.com/x', 'https://dl.flipkart.com/s/test0001', 'https://www.flipkart.com.example.com/', 'https://notflipkart.com/', 'https://rukminim2.flixcart.com/image/test.jpeg'].map(isFlipkart), [true, true, true, false, false, false]);
  assert.equal(isFlipkartSite('https://rukminim2.flixcart.com/image/test.jpeg'), true, "Flipkart's pictures and page code");
  assert.equal(isFlipkartSite('https://www.google.com/'), false);
  assert.deepEqual([pidFrom(GLOW), pidFrom(GLOW.replace(GLOW_PID, GLOW_PID.toLowerCase())), pidFrom('https://www.amazon.in/x?pid=FCPTESTGLOW00001'), pidFrom('https://www.flipkart.com/x?pid=SHORT')], [GLOW_PID, GLOW_PID, null, null]);
  assert.equal(pidFrom('https://www.flipkart.com/test-book/p/itmtestbook0001?pid=9781234567897'), '9781234567897', "a book's product ID is its 13-digit ISBN");
  assert.deepEqual(productLines('9781234567897').problems, ['Line 1 of the products, "9781234567897", is not a Flipkart link or a Flipkart product ID.'], 'typed alone, a product ID is the 16 letters and digits; a book is added by its link');
  assert.deepEqual([itemIdFrom(GLOW), itemIdFrom(GLOW_REVIEWS), itemIdFrom('https://www.flipkart.com/search?q=mask'), itemIdFrom('https://www.flipkart.com/product/p/itme?pid=FCPTESTGLOW00001')], ['itmtestglow0001', 'itmtestglow0001', null, null]);
  assert.equal(pageForPid(GLOW_PID), 'https://www.flipkart.com/product/p/itme?pid=FCPTESTGLOW00001');
  assert.equal(pageForLink(`${GLOW}&affid=test&lid=LSTTEST`), GLOW, 'the product page and its product ID only');
  assert.equal(pageForLink('https://dl.flipkart.com/dl/test-glow-face-mask/p/itmtestglow0001?pid=FCPTESTGLOW00001&cmpid=test'), GLOW);
  assert.equal(pageForLink('https://www.flipkart.com/test-glow-face-mask/product-reviews/itmtestglow0001?pid=FCPTESTGLOW00001'), GLOW, 'a link to the reviews opens the product page');
  assert.equal(pageForLink('https://dl.flipkart.com/s/test0001'), 'https://dl.flipkart.com/s/test0001', 'any other Flipkart link as it is');
  assert.equal(pageForLink('https://www.google.com/'), null);
});

test('what kind of page Flipkart showed: a robot check, a block, an error and a missing page, by their words, address or status; a product page stays one whatever its reviews say', () => {
  const kind = (facts, status = 200) => whatPageIs({ url: 'https://www.flipkart.com/test/p/itmtestglow0001', title: 'Flipkart', text: '', product: null, ...facts }, status).kind;
  assert.deepEqual([kind({ text: 'Are you a human?' }), kind({ robotForm: true }), kind({ robotFrame: true }), kind({ url: 'https://www.flipkart.com/captcha?test=1' })], ['captcha', 'captcha', 'captcha', 'captcha']);
  assert.deepEqual([kind({ title: 'Access Denied', text: "You don't have permission to access this page on this server." }), kind({}, 403), kind({}, 429), kind({}, 410)], ['blocked', 'blocked', 'blocked', 'blocked']);
  assert.deepEqual([kind({ text: 'Something went wrong! Please try again later.' }), kind({}, 500), kind({}, 503)], ['error', 'error', 'error']);
  assert.deepEqual([kind({ text: 'Unfortunately the page you are looking for has been moved or deleted' }), kind({}, 404)], ['not-found', 'not-found']);
  assert.equal(kind({ url: 'https://www.flipkart.com/test-ab-challenge-wheel/p/itmtestwheel001?pid=FCPTESTWHEEL0001', product: { name: 'Test Ab Challenge Wheel' } }), 'page', "a product with 'challenge' in its name is no robot check");
  assert.equal(kind({ text: 'Showing 1 to 2 of 2 results for "face mask"' }), 'page');
  const reviewsSay = { product: { name: 'Test Glow Face Mask' }, text: 'Something went wrong with the lid. Are you a human? Access denied to my skin, too many pimples.' };
  assert.equal(kind(reviewsSay), 'page', "a product page's reviews may say anything");
  assert.equal(kind({ ...reviewsSay, robotForm: true }), 'captcha', 'but a robot check in it is a robot check');
  assert.equal(kind({ ...reviewsSay }, 403), 'blocked', 'and so is a refusal');
  assert.deepEqual(whatPageIs({ title: 'Flipkart', text: 'Are you a human?' }, 200), { kind: 'captcha', why: 'Flipkart showed a robot check.' });
});

test("the product a page shows: the JSON-LD's name, brand, IDs, stars and counts; the counts in its words when the JSON-LD leaves them out; its other colours and sizes; and the link to all its reviews", () => {
  assert.deepEqual(productOnPage(productPage(GLOW).facts), { name: 'Test Glow Face Mask', brand: 'Test Glow', pid: GLOW_PID, itemId: 'itmtestglow0001', variants: [{ pid: 'FCPTESTGLOW00002', label: '100 ml' }], rating: 4.1, ratings: 120, reviews: 12, allReviews: GLOW_REVIEWS }, "the reviews of one thing (Brightness) are not all its reviews");
  const noLd = { url: GLOW, title: 'Test Glow Face Mask - Price in India, Buy Test Glow Face Mask Online In India | Flipkart.com', text: 'Test Glow Face Mask\n4.1\n1,234 Ratings & 56 Reviews', canonical: 'https://www.flipkart.com/test-glow-face-mask/p/itmtestglow0001', product: null, reviewLinks: [] };
  assert.deepEqual(productOnPage(noLd), { name: 'Test Glow Face Mask', brand: null, pid: GLOW_PID, itemId: 'itmtestglow0001', variants: [], rating: null, ratings: 1234, reviews: 56, allReviews: GLOW_REVIEWS }, 'the name from the title, the counts from its words, the link made from its address');
  const chooser = [{ pid: 'FCPTESTGLOW00002', label: '100 ml' }, { pid: GLOW_PID, label: '50 ml' }, { pid: 'fcptestglow00003', label: '  ' }, { pid: 'FCPTESTGLOW00003', label: '200 ml' }, { pid: 'FCPTESTGLOW00002', label: 'Pack of 2' }, { pid: 'SHORT', label: 'Pack of 3' }];
  assert.deepEqual(productOnPage(productPage(GLOW, {}, { variants: chooser }).facts).variants, [{ pid: 'FCPTESTGLOW00002', label: '100 ml' }, { pid: 'FCPTESTGLOW00003', label: '200 ml' }], 'each once, never the product itself, and a name the page gives later is taken');
  assert.equal(productOnPage({ ...noLd, text: 'Test Glow Face Mask\nbased on 1,234 ratings by Verified Buyers' }).ratings, 1234);
  assert.equal(productOnPage({ ...noLd, text: 'Be the first to review this product' }).allReviews, null, 'no ratings and no reviews: no link');
  assert.equal(productOnPage({ ...noLd, url: 'https://www.flipkart.com/search?q=face%20mask', canonical: null }).name, null, 'not a product page: no name');
  assert.equal(productOnPage({ url: 'https://www.flipkart.com/test/p/itmtestglow0001?pid=FCPTESTGLOW00001', title: 'Access Denied', text: '', product: null }).name, null, "a page's heading is never taken for a product's name");
  assert.equal(productOnPage(productPage(GLOW, { rating: 7 }).facts).rating, null, 'stars are 0 to 5');
});

test("one product read through the Live Flipkart Browser: what was read, and when; it is used only when its brand is the campaign's, by the rule and in the words of the Amazon campaigns", async () => {
  const b = fakeBrowser((url) => productPage(url));
  const glow = product(GLOW);
  const out = await readProduct(b, glow, 'Test Glow', { now });
  assert.deepEqual(out, { product: { ...glow, read: READ_GLOW, problem: null }, stop: null });
  assert.deepEqual([b.begun, b.opened], [1, [GLOW]]);
  assert.deepEqual([usable(out.product), needsReading(out.product), needsReading(glow)], [true, false, true]);
  // The brand rule: written together or apart, in any capitals; a brand word of six letters or more may differ by one letter.
  assert.deepEqual([brandIn('Test Glow', 'testglow'), brandIn('Mannlich Face Wash', 'Manlich'), brandIn('Test Glow', 'Test Clay'), brandIn('Test Glow', '')], [true, true, false, false]);
  const other = await readProduct(fakeBrowser((url) => productPage(url)), glow, 'Koparo', { now });
  assert.deepEqual(other.product.problem, { says: 'Flipkart says this product\'s brand is "Test Glow", not "Koparo", so this product is not used.', at: AT });
  assert.deepEqual([other.product.read, usable(other.product), needsReading(other.product)], [READ_GLOW, false, false], 'what was read is kept, and not read again by itself');
  const noBrand = (brand) => readProduct(fakeBrowser((url) => productPage(url, { brand: null })), glow, brand, { now });
  assert.equal((await noBrand('Koparo')).product.problem.says, 'The product\'s page shows no brand, and its name "Test Glow Face Mask" does not include "Koparo", so this product is not used.');
  assert.equal((await noBrand('test glow')).product.problem, null, 'no brand shown: its name has the brand');
  // A changed brand needs no page opened; a campaign with no brand (saved before campaigns had one) checks none.
  assert.equal(confirmProducts({ brand: 'Koparo', products: [out.product] }).products[0].problem.says, other.product.problem.says);
  assert.equal(confirmProducts({ brand: 'Test Glow', products: [other.product] }).products[0].problem, null);
  assert.equal(brandProblem(READ_GLOW, ''), null);
});

test('a product ID alone: read when Flipkart\'s page for it shows that product; "Add this product\'s link instead" when no product page opens, or another product\'s does', async () => {
  const byId = product(GLOW_PID);
  const ok = await readProduct(fakeBrowser((url) => productPage(url)), byId, 'Test Glow', { now });
  assert.deepEqual(ok.product.read, READ_GLOW, 'the item ID comes from the page');
  assert.deepEqual(ok.product.itemId, 'itmtestglow0001');
  const opened = [];
  const notFound = await readProduct(fakeBrowser((url) => (opened.push(url), page(url, { title: 'Flipkart.com', text: 'Unfortunately the page you are looking for has been moved or deleted' }, 404))), byId, 'Test Glow', { now });
  assert.deepEqual(opened, ['https://www.flipkart.com/product/p/itme?pid=FCPTESTGLOW00001']);
  assert.deepEqual(notFound, { product: { ...byId, read: null, problem: { says: ADD_LINK_SAYS, at: AT, final: true } }, stop: null });
  assert.equal(ADD_LINK_SAYS, "No Flipkart product page opened from this product ID. Add this product's link instead.");
  const another = await readProduct(fakeBrowser(() => productPage(CLAY, { name: 'Test Clay Face Mask', sku: 'FCPTESTCLAY00001' }, { canonical: null, reviewLinks: [] })), byId, 'Test Glow', { now });
  assert.equal(another.product.problem.says, ADD_LINK_SAYS, "another product's page");
  const search = await readProduct(fakeBrowser((url) => page(url, { title: 'Face Mask - Buy Products Online at Best Price in India - All Categories | Flipkart.com' })), byId, 'Test Glow', { now });
  assert.equal(search.product.problem.says, ADD_LINK_SAYS, 'a page that is not a product');
  assert.equal(needsReading(search.product), false, 'not tried again by itself');
});

test('a robot check, a block or an error: "Flipkart prevented this check", the product is not read, and the reading stops there', async () => {
  const glow = product(GLOW);
  const pages = {
    captcha: (url) => page(url, { title: 'Flipkart', text: 'Are you a human?\nPlease confirm that you are a human.' }),
    blocked: (url) => page(url, { title: 'Access Denied', text: "Access Denied\nYou don't have permission to access this page on this server." }, 403),
    error: (url) => page(url, { title: 'Flipkart', text: 'Something went wrong!' }, 500),
  };
  for (const [kind, answer] of Object.entries(pages)) {
    const out = await readProduct(fakeBrowser(answer), glow, 'Test Glow', { now });
    assert.deepEqual(out, { product: { ...glow, read: null, problem: { says: PREVENTED_SAYS[kind], at: AT, retry: true, stop: kind } }, stop: kind }, kind);
    assert.match(out.product.problem.says, /^Flipkart prevented this check: /, kind);
    assert.equal(needsReading(out.product), true, `${kind}: read again later`);
  }
  assert.deepEqual(Object.values(PREVENTED_SAYS), [
    'Flipkart prevented this check: it showed a robot check, which this dashboard never answers. This product was not read; press "Read the products again" later.',
    'Flipkart prevented this check: it refused the page. This product was not read; wait a while, then press "Read the products again".',
    'Flipkart prevented this check: it showed an error. This product was not read; press "Read the products again" later.',
  ]);
});

test('a page that is not a product, a missing page, a link that leads away from Flipkart and a page that could not be opened are each said in plain words; a page that cannot be opened at all, or a window that is closed, stops the reading', async () => {
  const glow = product(GLOW);
  const said = async (answer, begin) => {
    const b = fakeBrowser(answer);
    if (begin) b.begin = begin;
    return (await readProduct(b, glow, 'Test Glow', { now })).product.problem;
  };
  assert.deepEqual(await said((url) => page(url, { title: 'Face Mask - Buy Products Online at Best Price in India - All Categories | Flipkart.com' })), { says: 'This link does not open a product page on Flipkart, so this product is not used.', at: AT, final: true });
  assert.deepEqual(await said((url) => page(url, { text: 'Unfortunately the page you are looking for has been moved or deleted' }, 404)), { says: 'Flipkart says this product page does not exist, so this product is not used.', at: AT, final: true });
  assert.deepEqual(await said(() => ({ ok: false, error: 'elsewhere', host: 'www.example.com', message: 'The page went to www.example.com instead of Flipkart.' })), { says: 'The link leads to www.example.com, not to Flipkart, so this product is not used.', at: AT, final: true });
  assert.deepEqual(await said(() => productPage('https://www.example.com/test')), { says: 'The link leads to www.example.com, not to Flipkart, so this product is not used.', at: AT, final: true });
  assert.deepEqual(await said(() => ({ ok: false, error: 'network', message: 'The page could not be opened.' })), { says: 'The Live Flipkart Browser could not open the page, so this product was not read and the reading stopped. The page could not be opened.', at: AT, retry: true });
  assert.deepEqual(await said(() => productPage(GLOW), async () => { throw new Error('no Chrome'); }), { says: 'The Live Flipkart Browser could not be opened on this computer, so this product was not read and the reading stopped.', at: AT, retry: true });
  // Which of these stop the reading: nothing more is opened after them.
  const stopOf = async (answer, begin) => {
    const b = fakeBrowser(answer);
    if (begin) b.begin = begin;
    return (await readProduct(b, glow, 'Test Glow', { now })).stop;
  };
  assert.deepEqual(
    [
      await stopOf(() => ({ ok: false, error: 'network', message: 'The page could not be opened.' })),
      await stopOf(() => ({ ok: false, error: 'timeout', message: 'The page took too long to open.' })),
      await stopOf(() => ({ ok: false, error: 'closed', message: 'The Live Flipkart Browser was closed.' })),
      await stopOf(() => productPage(GLOW), async () => { throw new Error('The dashboard is stopping.'); }),
      await stopOf((url) => page(url, { title: 'Face Mask - Buy Products Online at Best Price in India - All Categories | Flipkart.com' })),
      await stopOf(() => ({ ok: false, error: 'elsewhere', host: 'www.example.com', message: 'The page went to www.example.com instead of Flipkart.' })),
    ],
    ['network', 'network', 'closed', 'closed', null, null],
  );
  // Plain words: no robot-check jargon, no long dashes.
  for (const s of [...Object.values(PREVENTED_SAYS), ADD_LINK_SAYS]) assert.doesNotMatch(s, /captcha|—|--/i, s);
});

test("a word this dashboard never shows is hidden, in a product's name as in anything typed", async () => {
  const hidden = Buffer.from('Y2FzaGJhY2s=', 'base64').toString('utf8');
  assert.equal(clean(`  Test   ${hidden}Glow  Mask `), 'Test … Mask', 'the whole word goes, and spaces are made single');
  const out = await readProduct(fakeBrowser((url) => productPage(url, { name: `Test Glow Mask with ${hidden} offer` })), product(GLOW), 'Test Glow', { now });
  assert.equal(out.product.read.name, 'Test Glow Mask with … offer');
});
