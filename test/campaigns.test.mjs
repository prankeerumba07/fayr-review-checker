// Campaigns: the products staff type, the brand check, which campaigns a row
// uses, each product's page read in a pretend Live Amazon Browser (pretend
// pages only: nothing reaches Amazon), and how a screenshot's product name is
// matched to a product's real name, even when Amazon cut it short. Made-up
// products only.
// Run: node test/campaigns.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productLines, shortName, brandIn, sameBrandWord, brandProblem, confirmProducts, needsReading, usable, readProduct, campaignsFor, campaignsFound, READ_PAUSE_SAYS, CAMPAIGN_ID, newCampaignId, MAX_CAMPAIGN_PRODUCTS } from '../amazon/campaigns.js';
import { nameStartShown, enoughOfName, nameLineStarting, brandWordsAtStart } from '../amazon/screen-text.js';
import { brandOf, productOnPage } from '../amazon/page-read.js';
import { assertPlain } from './plain-words.mjs';

const KIT = 'Test Brand Monthly Home Cleaning Kit | Dishwash Liquid 2L Refill, Floor Cleaner 1L | Plant-Based Formula';
const FLOOR = 'Test Brand Floor Cleaner Liquid, Lavender, 1 Litre';
const says = [];

test('the products staff type: an ASIN number as its Amazon India product page, an Amazon link as it is; anything else is said plainly', () => {
  const { products, problems } = productLines('B0TESTKIT9\n  https://www.amazon.in/Test-Brand-Kit/dp/B0TESTKIT8/ref=x \nhttps://amzn.in/d/0TestKit\n\nb0testkit9');
  assert.deepEqual(products, [
    { given: 'B0TESTKIT9', url: 'https://www.amazon.in/dp/B0TESTKIT9', asin: 'B0TESTKIT9' },
    { given: 'https://www.amazon.in/Test-Brand-Kit/dp/B0TESTKIT8/ref=x', url: 'https://www.amazon.in/Test-Brand-Kit/dp/B0TESTKIT8/ref=x', asin: 'B0TESTKIT8' },
    { given: 'https://amzn.in/d/0TestKit', url: 'https://amzn.in/d/0TestKit', asin: null },
  ], 'one per line, the same product once');
  assert.deepEqual(problems, []);
  const bad = productLines('floor cleaner\nhttps://www.flipkart.com/item/1\nB0TEST');
  assert.deepEqual(bad.problems, ['Line 1 of the products, "floor cleaner", is not an Amazon link or an ASIN number.', 'Line 2 of the products is a link to www.flipkart.com, not to Amazon India, so it cannot be used.', 'Line 3 of the products, "B0TEST", is not an Amazon link or an ASIN number.']);
  const many = Array.from({ length: MAX_CAMPAIGN_PRODUCTS + 1 }, (_, i) => `B0TESTM${String(i).padStart(3, '0')}`).join('\n');
  assert.deepEqual(productLines(many).problems, [`A campaign can have at most ${MAX_CAMPAIGN_PRODUCTS} products.`]);
  assert.match(newCampaignId(), CAMPAIGN_ID);
});

test("a product's name in a Note: the start of its real name, up to the first \"|\" or comma; a brand is in a name as whole words", () => {
  assert.equal(shortName(KIT), 'Test Brand Monthly Home Cleaning Kit');
  assert.equal(shortName(FLOOR), 'Test Brand Floor Cleaner Liquid');
  assert.equal(shortName('Test Brand Shampoo'), 'Test Brand Shampoo');
  assert.equal(brandIn('Koparo Floor & Toilet Cleaner', 'Koparo'), true);
  assert.equal(brandIn('KOPARO floor cleaner', 'koparo'), true, 'capitals do not matter');
  assert.equal(brandIn('Kopar Floor Cleaner', 'Koparo'), false, 'whole words only: a brand of fewer than six letters must be whole');
  assert.equal(brandIn('Test Brand Floor Cleaner', 'Test Brand'), true);
  assert.equal(brandIn('Brand Test Floor Cleaner', 'Test Brand'), false, 'its words one after another');
  assert.equal(brandIn('TestBrand Amazon Review Data.xlsx', 'Test Brand'), true, 'written together');
  assert.equal(brandIn('Test brand face wash', 'TESTBRAND'), true, 'or apart');
  assert.equal(brandIn('Tëstbrand Amazon Review Data.xlsx', 'Testbrand'), true, 'accents do not matter');
  // Amazon may spell a brand with one letter more or less: a brand word of six letters or more that differs by one letter is the same brand.
  assert.equal(brandIn('Tesbrand Face Wash', 'Testbrand'), true, 'one letter less');
  assert.equal(brandIn('Testbrandd Amazon Review Data.xlsx', 'Testbrand'), true, 'one letter more');
  assert.equal(brandIn('Testbrand Face Wash', 'Tesbrand'), true, 'either way round');
  assert.equal(brandIn('Testbrnad Face Wash', 'Testbrand'), false, 'two letters swapped is two letters apart');
  assert.equal(brandIn('Nikes Shoes', 'Nike'), false, 'a short brand must be exact');
  assert.equal(sameBrandWord('mannlich', 'manlich'), true);
  assert.equal(sameBrandWord('koparo', 'kopara'), true);
  assert.equal(sameBrandWord('nike', 'niko'), false);
});

test("a product is used only when its brand, or with no brand shown its name, includes the campaign's brand", () => {
  assert.equal(brandProblem({ name: KIT, brand: 'Test Brand' }, 'Test Brand'), null);
  assert.equal(brandProblem({ name: KIT, brand: 'Test Brand India' }, 'test brand'), null);
  assert.equal(brandProblem({ name: KIT, brand: 'Other Maker' }, 'Test Brand'), 'Amazon says this product\'s brand is "Other Maker", not "Test Brand", so this product is not used.');
  assert.equal(brandProblem({ name: KIT, brand: null }, 'Test Brand'), null, 'no brand shown: its name includes it');
  assert.equal(brandProblem({ name: 'Shiny Glass Cleaner, 500 ml', brand: null }, 'Test Brand'), 'The product\'s page shows no brand, and its name "Shiny Glass Cleaner" does not include "Test Brand", so this product is not used.');
  assert.equal(brandProblem({ name: null }, 'Test Brand'), 'This link does not open a product page on Amazon, so this product is not used.');
  // A changed brand is confirmed again from what was read, with no page opened.
  const read = { given: 'B0TESTKIT9', url: 'https://www.amazon.in/dp/B0TESTKIT9', asin: 'B0TESTKIT9', read: { at: '2026-10-06T05:00:00.000Z', name: KIT, brand: 'Test Brand', asin: 'B0TESTKIT9', variants: [] }, problem: null };
  const other = confirmProducts({ brand: 'Other Maker', products: [read] }).products[0];
  assert.equal(usable(other), false);
  assert.equal(other.problem.says, 'Amazon says this product\'s brand is "Test Brand", not "Other Maker", so this product is not used.');
  assert.equal(usable(confirmProducts({ brand: 'Test Brand', products: [other] }).products[0]), true, 'and back again');
  assert.equal(needsReading(read), false);
  assert.equal(needsReading({ given: 'B0TESTX0001', read: null, problem: null }), true, 'never read');
  assert.equal(needsReading({ given: 'B0TESTX0001', read: null, problem: { says: READ_PAUSE_SAYS.signin, retry: true, pause: 'signin' } }), true, 'stopped by a login page');
  assert.equal(needsReading({ given: 'B0TESTX0001', read: null, problem: { says: 'x', final: true } }), false, 'not a product page: read again only when asked');
});

test('a row uses every live campaign whose brand is in its product name, with only the products that are used', () => {
  const used = (asin, name, variants = []) => ({ given: asin, url: `https://www.amazon.in/dp/${asin}`, asin, read: { at: 'x', name, brand: 'Test Brand', asin, variants: variants.map((a) => ({ asin: a, label: null })) }, problem: null });
  const all = [
    { id: 'k0000000000a1', brand: 'Test Brand', name: 'Test Clean', live: true, products: [used('B0TESTKIT9', KIT, ['B0TESTKIT8']), { given: 'B0TESTX0001', read: null, problem: null }, { ...used('B0TESTOTH1', 'Other Maker Glass Cleaner'), problem: { says: 'not used' } }] },
    { id: 'k0000000000a2', brand: 'Test Brand', name: 'Test Summer', live: false, products: [used('B0TESTSUM1', 'Test Brand Sun Shield Spray')] },
    { id: 'k0000000000a3', brand: 'Other Maker', name: 'Other Sale', live: true, products: [used('B0TESTOTH2', 'Other Maker Spray')] },
  ];
  assert.deepEqual(campaignsFor('Test Brand Floor & Toilet Cleaner', all), [{ id: 'k0000000000a1', name: 'Test Clean', brand: 'Test Brand', live: true, products: [{ asin: 'B0TESTKIT9', name: KIT, short: 'Test Brand Monthly Home Cleaning Kit', variants: ['B0TESTKIT8'] }] }], 'the live campaign only, while one is live');
  assert.deepEqual(campaignsFor('Another Brand Soap', all), [], 'no campaign for its brand');
  // A product name without the brand: the brand in the file's name, or the tab's name.
  const kit = campaignsFor('Face Wash For Man - Amazon', all, ['Test Brand Amazon Review Data.xlsx', 'Amazon Orders']);
  assert.deepEqual(kit.map((c) => c.name), ['Test Clean'], "the brand in the file's name");
  assert.deepEqual(campaignsFor('Face Wash For Man - Amazon', all, ['Orders.xlsx', 'Test Brand Amazon']).map((c) => c.name), ['Test Clean'], "or in the tab's name");
  assert.deepEqual(campaignsFound('Other Maker Spray', all, ['Test Brand Amazon Review Data.xlsx']).list.map((c) => c.name), ['Other Sale'], 'the product name comes first');
  assert.equal(campaignsFound('Other Maker Spray', all, []).by, 'product');
  assert.equal(campaignsFound('Face Wash For Man - Amazon', all, ['TESTBRAND amazon review data.xlsx']).by, 'file');
  assert.deepEqual(campaignsFound('Face Wash For Man - Amazon', all, ['Orders.xlsx']), { by: null, list: [] }, 'none found');
  // A campaign marked Ended is never used, even when no live campaign has the brand; it is found only when asked for, so the screen can say the brand has only an ended campaign.
  const endedOnly = all.filter((c) => c.name !== 'Test Clean');
  assert.deepEqual(campaignsFound('Test Brand Floor & Toilet Cleaner', endedOnly), { by: null, list: [] });
  assert.deepEqual(campaignsFor('Face Wash For Man - Amazon', endedOnly, ['Test Brand Amazon Review Data.xlsx']), [], "not by the file's name either");
  assert.deepEqual(campaignsFound('Test Brand Floor & Toilet Cleaner', endedOnly, [], { live: false }).list.map((c) => c.name), ['Test Summer'], 'the ended one, only when asked for');
  assert.equal(campaignsFound('Face Wash For Man - Amazon', endedOnly, ['Test Brand Amazon Review Data.xlsx'], { live: false }).by, 'file');
  // Amazon may spell the brand with one letter more or less.
  assert.deepEqual(campaignsFound('Tesbrand Soap', [{ id: 'k0000000000a4', brand: 'Testbrand', name: 'Test Soap', live: true, products: [] }]).list.map((c) => c.name), ['Test Soap']);
});

// ---- reading a product's page ----

function fakeBrowser(answer) {
  const b = { opened: [], begun: 0, async begin() { b.begun++; }, async open(url) { b.opened.push(url); return answer(url); } };
  return b;
}
const page = (url, facts, status = 200) => ({ ok: true, status, url, facts: { url, title: 'Amazon.in', text: '', reviews: [], ...facts } });
const kitPage = (url, extra = {}) => page(url, { productTitle: KIT, pageAsin: 'B0TESTKIT9', brandRow: 'Test Brand', variantAsins: ['B0TESTKIT9', 'B0TESTKIT8'], variantNames: { B0TESTKIT8: 'Pack of 2' }, ...extra });
const KIT_PRODUCT = { given: 'B0TESTKIT9', url: 'https://www.amazon.in/dp/B0TESTKIT9', asin: 'B0TESTKIT9', read: null, problem: null };
const now = () => new Date('2026-10-06T05:00:00.000Z');

test('reading a product: its real name, its brand and its other colours and sizes, confirmed for the campaign; a page that is not a product, or of another brand, is not used', async () => {
  const read = async (answer, brand = 'Test Brand', product = KIT_PRODUCT) => {
    const b = fakeBrowser(answer);
    const out = await readProduct(b, product, brand, { now });
    if (out.product.problem) says.push(out.product.problem.says);
    return { ...out, b };
  };
  const ok = await read((url) => kitPage(url));
  assert.deepEqual(ok.product.read, { at: '2026-10-06T05:00:00.000Z', name: KIT, brand: 'Test Brand', asin: 'B0TESTKIT9', variants: [{ asin: 'B0TESTKIT8', label: 'Pack of 2' }] });
  assert.equal(ok.product.problem, null);
  assert.equal(ok.pause, null);
  assert.deepEqual([ok.b.begun, ok.b.opened], [1, ['https://www.amazon.in/dp/B0TESTKIT9']], 'the Live Amazon Browser, opened once, one page');
  assert.equal((await read((url) => kitPage(url, { brandRow: null, byline: 'Visit the Test Brand Store' }))).product.read.brand, 'Test Brand', "the brand from the line under the title");
  const otherBrand = await read((url) => kitPage(url, { brandRow: 'Other Maker' }));
  assert.equal(otherBrand.product.problem.says, 'Amazon says this product\'s brand is "Other Maker", not "Test Brand", so this product is not used.');
  assert.equal(otherBrand.product.read.name, KIT, 'what was read is kept, to show');
  const noBrand = await read((url) => kitPage(url, { brandRow: null }));
  assert.equal(usable(noBrand.product), true, 'no brand shown: its name includes the brand');
  const notProduct = await read((url) => page(url, { productTitle: null, pageAsin: null, text: 'Deals of the day' }));
  assert.equal(notProduct.product.problem.says, 'This link does not open a product page on Amazon, so this product is not used.');
  const gone = await read((url) => page(url, { title: 'Page Not Found', text: 'Looking for something? The Web address you entered is not a functioning page on our site.' }, 404));
  assert.equal(gone.product.problem.says, 'Amazon says this product page does not exist, so this product is not used.');
  const away = await read(() => page('https://example.com/offer', { productTitle: 'Something', pageAsin: null }), 'Test Brand', { given: 'https://amzn.in/d/0TestAway', url: 'https://amzn.in/d/0TestAway', asin: null, read: null, problem: null });
  assert.equal(away.product.problem.says, 'The link leads to example.com, not to Amazon India, so this product is not used.');
  const shortLink = await read(() => kitPage('https://www.amazon.in/dp/B0TESTKIT9'), 'Test Brand', { given: 'https://amzn.in/d/0TestKit', url: 'https://amzn.in/d/0TestKit', asin: null, read: null, problem: null });
  assert.equal(shortLink.product.asin, 'B0TESTKIT9', 'a short link gets the ASIN number of the page it lands on');
});

test('a login page, a robot check or a block stops the reading and is never got around; a page that could not be opened is tried again later', async () => {
  const stops = {
    signin: page('https://www.amazon.in/ap/signin?openid.return_to=x', { title: 'Amazon Sign In', signInForm: true }),
    captcha: page('https://www.amazon.in/errors/validateCaptcha', { text: 'Enter the characters you see below', captchaForm: true }),
    blocked: page('https://www.amazon.in/dp/B0TESTKIT9', { title: 'Sorry! Something went wrong!', text: 'Sorry! Something went wrong!' }, 503),
  };
  for (const [kind, answer] of Object.entries(stops)) {
    const out = await readProduct(fakeBrowser(() => answer), KIT_PRODUCT, 'Test Brand', { now });
    assert.equal(out.pause, kind);
    assert.deepEqual(out.product.problem, { says: READ_PAUSE_SAYS[kind], at: '2026-10-06T05:00:00.000Z', retry: true, pause: kind });
    assert.equal(needsReading(out.product), true, 'read again next time');
    says.push(out.product.problem.says);
  }
  const closed = await readProduct(fakeBrowser(() => ({ ok: false, error: 'network', message: 'The page could not be opened.' })), KIT_PRODUCT, 'Test Brand', { now });
  assert.equal(closed.product.problem.says, 'The Live Amazon Browser could not open the page, so this product was not read. The page could not be opened.');
  assert.equal(needsReading(closed.product), true);
  const broken = fakeBrowser(() => kitPage('x'));
  broken.begin = async () => {
    throw new Error('no Chrome');
  };
  const noWindow = await readProduct(broken, KIT_PRODUCT, 'Test Brand', { now });
  assert.equal(noWindow.product.problem.says, 'The Live Amazon Browser could not be opened on this computer, so this product was not read.');
  assert.deepEqual(broken.opened, []);
  says.push(closed.product.problem.says, noWindow.product.problem.says);
});

// ---- a screenshot's product name, matched to a real name ----

test("a screenshot shows a product when, from its first word, the words read are the start of the product's real name", () => {
  // The kit's brand is two words, "Test Brand": a start must show it and a word more.
  const hit = (line) => nameStartShown([line], KIT, { lead: 2 });
  assert.deepEqual(hit('Test Brand Monthly Home Cleani...'), { full: 5, cut: false, whole: false, shown: 'Test Brand Monthly Home Cleani...' }, 'cut short by Amazon, a small reading mistake allowed');
  assert.deepEqual(hit('Test Brand Monthly Home Cl...'), { full: 4, cut: true, whole: false, shown: 'Test Brand Monthly Home Cl...' }, 'the last word only begun');
  assert.equal(hit('Tesl Brand Monthy Home Cleaning Kit').full, 6, 'small reading mistakes');
  assert.equal(hit('Test Brand Monthly Home Cleaning Kit | Dishwash Liquid 2L Refill, Floor 2749.00 Cleaner 1L | Plant-Based Formula').whole, true, 'a price read in the middle is passed over');
  assert.equal(hit('a) or Test Brand Natural Floor Cle...'), null, 'the words go another way');
  assert.equal(hit('Recommended for you based on Test Brand'), null);
  assert.equal(nameStartShown(['Order summary', 'Test Brand Monthly Home', 'Cleaning Kit | Dishwash'], KIT).shown, 'Test Brand Monthly Home Cleaning Kit | Dishwash', 'a name over two lines');
  // Enough to name the product: two words or more after the brand's, the first of them whole.
  const lead = brandWordsAtStart(KIT, 'Test Brand');
  assert.equal(lead, 2);
  assert.equal(enoughOfName(hit('Test Brand Monthly Hom...'), lead), true);
  assert.equal(enoughOfName(hit('Test Brand Mon...'), lead), false, 'too little of it to tell');
  assert.equal(enoughOfName(nameStartShown(['Koparo Monthly Ho...'], 'Koparo Monthly Home Cleaning Kit'), brandWordsAtStart('Koparo Monthly Home Cleaning Kit', 'Koparo')), true);
  assert.equal(enoughOfName(nameStartShown(['Koparo Mon...'], 'Koparo Monthly Home Cleaning Kit'), 1), false);
  assert.equal(brandWordsAtStart('Shiny Glass Cleaner', 'Test Brand'), 0);
  // Another product's name of the brand: a line that starts with it and shows three words or more.
  assert.equal(nameLineStarting(['Visit the Test Brand Store', 'a) or Test Brand Natural Floor Cle...'], ['Test Brand']), 'a) or Test Brand Natural Floor Cle...');
  assert.equal(nameLineStarting(['Recommended for you based on Test Brand', 'Test Brand'], ['Test Brand']), null);
});

test('the brand a product page shows: its "Brand" row, else the line under the title', () => {
  assert.equal(brandOf({ brandRow: 'Test Brand', byline: 'Visit the Other Store' }), 'Test Brand');
  assert.equal(brandOf({ byline: 'Visit the Test Brand Store' }), 'Test Brand');
  assert.equal(brandOf({ byline: 'Brand: Test Brand' }), 'Test Brand');
  assert.equal(brandOf({ byline: '4.1 out of 5 stars' }), null);
  assert.deepEqual(productOnPage({ productTitle: KIT, pageAsin: 'B0TESTKIT9', variantAsins: ['B0TESTKIT9', 'B0TESTKIT8'], variantNames: { B0TESTKIT8: 'Pack of 2' } }), { name: KIT, asin: 'B0TESTKIT9', brand: null, variants: [{ asin: 'B0TESTKIT8', label: 'Pack of 2' }] });
});

test('every sentence about a product read from Amazon is plain', () => {
  assert.ok(says.length >= 8);
  assertPlain(assert, says, 'what the Campaigns box says about a product');
  assertPlain(assert, Object.values(READ_PAUSE_SAYS), 'pauses while reading');
});
