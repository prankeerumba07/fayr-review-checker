// The rules and readings fixed when every row of a real file was checked by
// hand and compared with the dashboard: each with made-up rows, made-up
// "Test Brand" products and pretend readings or pretend Amazon pages only.
// A delivery screenshot needs a detail of the order (its ID or its total);
// a photo of the product is "not clear", not "not delivered"; the Type is the
// problem that gives the Status; the two screenshots must show one product;
// "Delivered" on the purchase screenshot counts; an amount read wrongly on
// one screenshot is put right by the other; the review must be of the product
// bought; a picture belongs to the order it shows; Amazon's refusal sent twice
// is not a duplicate; a search looks at its next pages; and the ways a
// picture is read again when what is looked for is missing.
// Run: node test/accuracy.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCheck, MAX_SEARCH_PAGES } from '../amazon/check.js';
import { checkSettings } from '../amazon/settings.js';
import { orderIdsIn, datesIn, amountsIn, matchingAmount, amountMatch } from '../amazon/screen-text.js';
import { readOrderShot, readDeliveryShot, readReviewPicture, classifyReviewPicture, isScreenLine, SECOND_LOOKS } from '../amazon/shot-read.js';
import { readLines, segment, photoLine } from '../amazon/ocr.js';
import { reviewSearchUrl } from '../amazon/links.js';
import { ImageReader } from '../amazon/browsers.js';
import { ORDER_ID, OTHER_ORDER_ID } from './fixtures/amazon/make-order-screenshots.mjs';
import { assertPlain } from './plain-words.mjs';

const SETTINGS = checkSettings({});
const images = new ImageReader();
after(() => images.close());

// ---- made-up products, rows and readings ----

const ROLL = 'Test Brand Underarm Roll-On for Men, 50 ml';
const SOAP = 'Test Brand Kojic Soap Bar, 75 g';
const WASH = 'Test Brand Intimate Wash for Men, 150 ml';
const product = (asin, name, variants = []) => ({ asin, name, short: name.split(/[|,]/)[0].trim(), variants });
const CAMPAIGNS = [{ id: 'k0000000000c1', name: 'Test Care', brand: 'Test Brand', products: [product('B0TESTROL1', ROLL), product('B0TESTSOP1', SOAP), product('B0TESTWSH1', WASH)] }];
const HAS = { orderDate: false, amount: true, product: true, orderShot: true, deliveryShot: true, reviewShot: true, reviewLink: true };
const REVIEW = (id) => `https://www.amazon.in/gp/customer-reviews/${id}`;
const shot = (link) => (link ? { text: link, link, links: [link], mismatch: null, picture: null } : { text: '', link: '', links: [], mismatch: null, picture: null });
const words = (text) => ({ text, link: '', links: [], mismatch: null, picture: null });
const pic = (seed, sha = `sha-${seed}`) => ({ link: `https://drive.google.com/open?id=1Test${seed}abcdefgh`, file: `${seed}.png`, type: 'image/png', sha256: sha, fingerprint: null });

/** A row's own links: every row of a sheet has its own. */
const linksOf = (seed, review = `${REVIEW(`R1TESTROLL${seed}`)}?ref=x`) => ({ order: shot(`https://drive.google.com/open?id=1TestOrder${seed}`), delivery: shot(`https://drive.google.com/open?id=1TestDelivery${seed}`), review: shot(review), reviewShot: shot('') });
function row(over = {}) {
  return {
    id: 'r000000000002',
    source: 'sheet',
    row: 3,
    n: 2,
    hand: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    orderId: { text: ORDER_ID, value: ORDER_ID },
    orderDate: { text: '', value: null },
    amount: { text: '314', value: 314 },
    product: { text: 'Roll On For Man - Amazon' },
    shots: linksOf('01'),
    pictures: { order: [pic('OrderA')], delivery: [pic('DeliveryA')], review: [], reviewShot: [] },
    prev: null,
    last: null,
    seenLive: null,
    ...over,
  };
}
/** What a reader makes of some lines, with the order IDs, dates and amounts worked out by the real rules. */
const readOf = (texts, over = {}) => ({ ok: true, problem: null, confidence: 90, wordCount: 40, hindi: false, texts, text: texts.join('\n'), orderIds: orderIdsIn(texts), dates: datesIn(texts), amounts: amountsIn(texts), ...over });
const ORDER_PAGE = [`Order number ${ORDER_ID}`, ROLL, 'Item(s) Subtotal: ₹309.00', 'Marketplace Fee: ₹5.00', 'Grand Total: ₹314.00'];
const orderRead = (texts = ORDER_PAGE, over = {}) => readOf(texts, { delivered: false, ...over });
const deliveryRead = (texts, over = {}) => readOf(texts, { delivered: true, deliveredText: texts.find((t) => /delivered/i.test(t)) ?? null, ...over });
const reviewRead = (over = {}) => ({ ok: true, confidence: 90, text: 'x', kind: 'unknown', stars: null, starsHow: null, refusal: null, ratingPhrase: null, written: null, productLines: [], productShown: null, why: null, ...over });
const reviewPage = (id, asin, title, over = {}) => ({ url: REVIEW(id), title: 'Customer Review', text: '', reviews: [{ id, name: 'Test Buyer', stars: 5, title: 'Works well', body: 'Fresh all day and gentle on the skin, I use it every morning', verified: true, ...over }], reviewProduct: { asin, title } });

/** A pretend Live Amazon Browser: pages(url) gives the facts of each page; nothing is ever opened. */
function fakeBrowser(pages) {
  const b = {
    opened: [],
    begin: async () => {},
    isOpen: () => true,
    shot: async () => false,
    scrollToReviews: async () => true,
    async open(url) {
      b.opened.push(url);
      const facts = pages(url);
      return facts ? { ok: true, status: facts.status ?? 200, url: facts.url ?? url, facts } : { ok: false, message: 'The page could not be opened.' };
    },
  };
  return b;
}
const ROLL_REVIEW = (url) => {
  const id = url.match(/R1TESTROLL\d\d/)?.[0];
  return id ? reviewPage(id, 'B0TESTROL1', ROLL) : null;
};

const made = [];
async function check({ r = row(), others = [], order = orderRead(), delivery = deliveryRead(['Delivered 2 September', `Order number ${ORDER_ID}`, ROLL]), review = reviewRead(), browser = fakeBrowser(ROLL_REVIEW), settings = SETTINGS } = {}) {
  const result = await runCheck({
    row: r,
    others,
    settings,
    campaigns: CAMPAIGNS,
    has: HAS,
    reviewer: null,
    pictures: async (which) => ({ files: (r.pictures?.[which] ?? []).map((p) => `/made-up/${p.file}`), problems: [], records: r.pictures?.[which] ?? [] }),
    readOrder: async () => order,
    readDelivery: async () => delivery,
    readReview: async () => review,
    browser,
    checkId: 'c20261009120000abcdef',
    shotsDir: null,
    pagesDir: null,
  });
  made.push(result.note, result.type, ...result.steps.map((s) => s.detail));
  return result;
}
const STAFF = (why) => `A staff member needs to check this transaction because ${why}.`;
const FAILED = (why) => `This transaction failed because ${why}.`;

// ---- the delivery screenshot: "Delivered" and the same product ----

test('a delivery screenshot that shows Delivered and the product but no order ID and no total matches the order by its product: Verified', async () => {
  const result = await check({ delivery: deliveryRead(['Delivered on 3 September at 8:05 am', 'Test Brand Underarm Roll-On for Men...', 'Ordered on 2 September 2026']) });
  assert.deepEqual([result.final, result.typeKey], ['pass', 'verified'], result.note);
  assert.equal(result.delivery.details.product.state, 'same');
  assert.equal(result.steps[4].state, 'pass', "the delivery screenshot's own step passes");
});

test("an item's price on the delivery screenshot, with no total, is not the order's amount and is not compared; its product ties it to the order", async () => {
  const result = await check({ delivery: deliveryRead(['Delivered 2 September', ROLL, '₹309.00']) });
  assert.equal(result.typeKey, 'verified', result.note);
  assert.equal(result.delivery.details.amount.state, 'not shown');
  const withTotal = await check({ delivery: deliveryRead(['Delivered 2 September', ROLL, 'Item(s) Subtotal: ₹309.00', 'Marketplace Fee: ₹5.00', 'Grand Total: ₹314.00']) });
  assert.equal(withTotal.typeKey, 'verified', withTotal.note);
  assert.equal(withTotal.delivery.details.amount.state, 'same', "the order's total is compared");
});

test('a photo of the product in the delivery cell (no Delivered, no order details, no words saying it was not delivered) is not clear, never "Not delivered"', async () => {
  const result = await check({ delivery: readOf(['MANNLICH', 'MADE FOR MEN', 'PITSTICK'], { delivered: false, deliveredText: null }) });
  assert.deepEqual([result.final, result.typeKey], ['manual', 'deliveryNotClear'], result.note);
  assert.equal(result.note, STAFF('the delivery screenshot does not show any order details to match'));
});

test('"Cancel items" on the delivery screenshot of this order means it was not delivered yet: Fail', async () => {
  assert.ok(SETTINGS.notDeliveredWords.includes('Cancel items'));
  const result = await check({ delivery: readOf([`Order number ${ORDER_ID}`, ROLL, 'Track package', 'Cancel items', 'Grand Total: ₹314.00'], { delivered: false, deliveredText: null }) });
  assert.deepEqual([result.final, result.typeKey], ['fail', 'notDelivered'], result.note);
  assert.equal(result.note, FAILED('the delivery screenshot says "Cancel items", so the order was not delivered'));
});

test('"Delivered" on the purchase screenshot of the same order counts when the two screenshots were given the other way round', async () => {
  const order = orderRead(['Delivered in 45 minutes', `Order ID #${ORDER_ID}`, 'Test Brand Men Pitstick Under Roll-On', '₹314'], { delivered: true });
  const delivery = readOf(['Bill summary', 'You pay ₹314', `Order ID #${ORDER_ID}`, 'Test Brand Men Pitstick Under Roll-On'], { delivered: false, deliveredText: null });
  const result = await check({ order, delivery });
  assert.equal(result.typeKey, 'verified', result.note);
  assert.match(result.note, /The delivery screenshot does not say Delivered, but the purchase screenshot shows this order delivered\./);
});

// ---- the Type, and one product on both screenshots ----

test('the Type is the problem that fails the row: an order ID read one digit off (it may be a reading slip) never names a row that fails for a missing delivery screenshot', async () => {
  const slip = `${ORDER_ID.slice(0, -1)}3`;
  const r = row({ shots: { ...row().shots, delivery: shot('') }, pictures: { ...row().pictures, delivery: [] } });
  const result = await check({ r, order: orderRead([`Order number ${slip}`, ROLL, 'Grand Total: ₹314.00']) });
  assert.deepEqual([result.final, result.typeKey], ['fail', 'deliveryShotMissing'], result.note);
  assert.match(result.note, /^This transaction failed because the user did not give a delivery screenshot\. The order ID is one digit away from the form, which may be a reading mistake/);
});

test('each screenshot showing another of the campaign\'s products is a product not matching; an order of several products only needs one product in common', async () => {
  const other = await check({ delivery: deliveryRead(['Delivered 2 September', `Order number ${ORDER_ID}`, SOAP, 'Grand Total: ₹314.00']) });
  assert.deepEqual([other.final, other.typeKey], ['fail', 'productNotMatching'], other.note);
  assert.match(other.note, /^This transaction failed because the delivery screenshot shows another of the campaign's products, "Test Brand Kojic Soap Bar", than the purchase screenshot, "Test Brand Underarm Roll-On for Men"\./);
  const several = await check({ order: orderRead([`Order number ${ORDER_ID}`, ROLL, SOAP, 'Grand Total: ₹314.00']), delivery: deliveryRead(['Delivered 2 September', `Order number ${ORDER_ID}`, SOAP]) });
  assert.equal(several.typeKey, 'verified', several.note);
});

test("a name Amazon gives the product elsewhere, with a word only one of the campaign's products has, is never called another product", async () => {
  const quick = ['Delivered in 45 minutes', `Order ID #${ORDER_ID}`, 'Test Brand Men Pitstick Under Roll-On', '₹314'];
  const result = await check({ order: orderRead(quick, { delivered: true }), delivery: deliveryRead(quick) });
  assert.notEqual(result.typeKey, 'productNotMatching', result.note);
  assert.equal(result.typeKey, 'verified', 'both screenshots show the same name for it');
  const lipBalm = await check({ order: orderRead([`Order number ${ORDER_ID}`, 'Test Brand Lip Balm Tinted', 'Grand Total: ₹314.00']) });
  assert.equal(lipBalm.typeKey, 'productNotMatching', 'a name with none of their own words is another product');
});

// ---- the amount ----

test('an amount read wrongly on one screenshot is put right by the other screenshot of the same order that shows the amount given', async () => {
  const r = row({ amount: { text: '304.73', value: 304.73 } });
  const order = orderRead([`Order number ${ORDER_ID}`, ROLL, 'Grand Total: 2504.73']);
  const delivery = deliveryRead(['Delivered 25 September', `Order # ${ORDER_ID}`, ROLL, 'Grand Total: ₹304.73']);
  const result = await check({ r, order, delivery });
  assert.equal(result.typeKey, 'verified', result.note);
  assert.match(result.note, /The amount on the purchase screenshot was read as ₹2504\.73, but the delivery screenshot of the same order shows ₹304\.73, the amount the user gave\./);
  const otherOrder = await check({ r, order, delivery: deliveryRead(['Delivered 25 September', ROLL, 'Grand Total: ₹304.73']) });
  assert.equal(otherOrder.typeKey, 'orderDetailsNotMatching', 'only a screenshot that shows the same order ID puts it right');
});

test('amounts: ₹ read as £, a number alone on its line (only when it is the amount given, never a different one), "Subtotal" misread as "Quibtotal" is no total, and a rupee sign read as "२7"', () => {
  const a = amountsIn(['Ordered successfully', '£514', '314', 'Paid from VISA']);
  assert.deepEqual(a.map((x) => [x.value, Boolean(x.lone)]), [[514, false], [314, true]]);
  assert.equal(matchingAmount(a, 314, 1).value, 314, 'the number alone is the amount given');
  assert.equal(amountMatch(amountsIn(['2026']), 2031, { tolerance: 1, allowance: 5 }), null, 'a number alone is never added up with fees or allowed below the amount');
  const sub = amountsIn(['Item(s) Quibtotal: २7289 00']);
  assert.deepEqual([sub[0].value, sub[0].label, sub[0].alts], [7289, null, [289]]);
});

// ---- the review ----

test("a review of another of the campaign's products than the one bought is not this order's review: Product is not matching", async () => {
  const browser = fakeBrowser((url) => (url.includes('R1TESTROLL01') ? reviewPage('R1TESTROLL01', 'B0TESTSOP1', SOAP) : null));
  const result = await check({ browser });
  assert.deepEqual([result.final, result.typeKey], ['fail', 'productNotMatching'], result.note);
  assert.match(result.note, /^This transaction failed because the review is for "Test Brand Kojic Soap Bar", another of the campaign's products, not "Test Brand Underarm Roll-On for Men", the product the screenshots show\./);
});

const PICTURE = 'https://drive.google.com/open?id=1TestReviewPicture';
const pictureRow = (over = {}) => row({ shots: { ...row().shots, review: shot(PICTURE) }, pictures: { ...row().pictures, review: [pic('ReviewA')] }, ...over });
const productPages = (search) => (url) => {
  if (url.includes('/dp/B0TESTROL1')) return { url, title: ROLL, productTitle: ROLL, pageAsin: 'B0TESTROL1', variantAsins: [], seeAllHref: null, text: '' };
  if (url.includes('/product-reviews/') && url.includes('filterByKeyword=')) return { url, title: 'Customer reviews', text: '', reviews: search(new URL(url)) };
  if (url.includes('/product-reviews/')) return { url, title: 'Customer reviews', text: '', reviews: [] };
  return null;
};

test('words too common to search for: the review\'s link is needed (Review link needed), a staff member asks for it', async () => {
  const review = reviewRead({ kind: 'written', written: { name: 'Test Buyer', title: null, body: 'Good product. Nice product. Very good.' } });
  const result = await check({ r: pictureRow(), review, browser: fakeBrowser(productPages(() => [])) });
  assert.deepEqual([result.final, result.typeKey], ['manual', 'reviewLinkNeeded'], result.note);
});

test('a search whose page of results is full goes on to its next pages, one at a time, until the review is found', async () => {
  const body = 'The zircon grey finish has not chipped after a month of daily use';
  const someone = (k) => ({ id: `R1SOMEONE${k}AB`, name: `Another Buyer ${k}`, stars: 4, title: 'Fine', body: `Another person wrote about it on day ${k} with other words entirely`, verified: true });
  const search = (u) => (u.searchParams.get('pageNumber') === '2' ? [{ id: 'R1TESTFOUND2', name: 'Test Buyer', stars: 5, title: 'Sturdy', body, verified: true }] : Array.from({ length: 10 }, (_, k) => someone(k)));
  const browser = fakeBrowser(productPages(search));
  const review = reviewRead({ kind: 'written', stars: 5, written: { name: 'Test Buyer', title: 'Sturdy', body } });
  const result = await check({ r: pictureRow(), review, browser });
  assert.equal(result.typeKey, 'verified', result.note);
  assert.ok(browser.opened.some((u) => /filterByKeyword=\w+&pageNumber=2$/.test(u)), 'the second page of the search was opened');
  assert.equal(result.publicReview.searched[0].pages, 2);
  assert.equal(MAX_SEARCH_PAGES, 5);
  assert.equal(reviewSearchUrl('B0TESTROL1', 'zircon', 3), 'https://www.amazon.in/product-reviews/B0TESTROL1?filterByKeyword=zircon&pageNumber=3');
  assert.equal(reviewSearchUrl('B0TESTROL1', 'zircon'), 'https://www.amazon.in/product-reviews/B0TESTROL1?filterByKeyword=zircon', 'the first page has no page number');
});

test("Amazon's refusal, the very same picture sent for two orders of one account, is the same message, not the same review: User not being able to add reviews, not Duplicate", async () => {
  // The same picture, and in the first two rows the very same link too.
  const refusalShot = shot('https://drive.google.com/open?id=1TestRefusal');
  const first = row({ id: 'r000000000001', n: 1, row: 2, orderId: { text: OTHER_ORDER_ID, value: OTHER_ORDER_ID }, shots: { ...linksOf('11'), review: words('NA'), reviewShot: refusalShot }, pictures: { ...row().pictures, order: [pic('OrderB')], delivery: [pic('DeliveryB')], reviewShot: [pic('Refusal', 'sha-refusal')] }, last: { checkId: 'c1', final: 'fail', typeKey: 'cannotAddReviews' } });
  const later = row({ shots: { ...linksOf('12'), review: words('NA'), reviewShot: refusalShot }, pictures: { ...row().pictures, reviewShot: [pic('Refusal', 'sha-refusal')] } });
  const refused = reviewRead({ kind: 'refused', refusal: 'We apologise but Amazon is not accepting reviews on this item or product from this account.' });
  const result = await check({ r: later, others: [first], review: refused });
  assert.deepEqual([result.final, result.typeKey], ['fail', 'cannotAddReviews'], result.note);
});

// ---- a picture belongs to the order it shows ----

test('a screenshot given in two rows belongs to the order it shows: that row is checked as usual, and the other row fails for its order ID, never the owner made a Duplicate', async () => {
  const shared = pic('SharedDelivery', 'sha-shared');
  const earlier = row({ id: 'r000000000001', n: 1, row: 2, shots: linksOf('21'), pictures: { ...row().pictures, delivery: [shared] } });
  const owner = row({ id: 'r000000000005', n: 5, row: 6, orderId: { text: OTHER_ORDER_ID, value: OTHER_ORDER_ID }, shots: linksOf('25'), pictures: { ...row().pictures, order: [pic('OrderE')], delivery: [shared] } });
  const showsOwner = deliveryRead(['Delivered 21 August', `Order number ${OTHER_ORDER_ID}`, ROLL, 'Grand Total: ₹314.00']);
  const ownerOrder = orderRead([`Order number ${OTHER_ORDER_ID}`, ROLL, 'Grand Total: ₹314.00']);
  const ownerResult = await check({ r: owner, others: [{ ...earlier, last: { checkId: 'c1', final: 'fail', typeKey: 'orderIdNotMatching' } }], order: ownerOrder, delivery: showsOwner });
  assert.equal(ownerResult.typeKey, 'verified', ownerResult.note);
  const earlierResult = await check({ r: earlier, others: [owner], delivery: showsOwner });
  assert.deepEqual([earlierResult.final, earlierResult.typeKey], ['fail', 'orderIdNotMatching'], earlierResult.note);
  assert.deepEqual(earlierResult.alsoDuplicate, [], 'the row whose order the picture shows is not made a duplicate');
});

// ---- reading a picture again, the other ways, when what is looked for is missing ----

/** Tesseract's TSV for some lines, as a pretend Tesseract answers. */
function tsvOf(lines) {
  const head = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
  const rows = [];
  lines.forEach((line, i) => line.split(/\s+/).forEach((w, k) => rows.push(['5', '1', '1', '1', String(i + 1), String(k + 1), String(10 + k * 60), String(20 + i * 30), '50', '20', '95', w].join('\t'))));
  return [head, ...rows].join('\n');
}
/** A pretend Tesseract: lines(file, psm) gives what each reading reads; every call is kept. */
function fakeTesseract(lines) {
  const calls = [];
  const fn = async (bin, args) => {
    const psm = args[args.indexOf('--psm') + 1];
    calls.push({ file: args[0], psm });
    return tsvOf(lines(args[0], psm));
  };
  fn.calls = calls;
  return fn;
}
const fakeSips = async (bin, args) => (args.includes('pixelWidth') ? 'pixelWidth: 100' : '');

test('the other ways of reading a screenshot, in turn: enlarged, as scattered words, a selection made plain, and the top strip (for the order ID only)', () => {
  assert.deepEqual(SECOND_LOOKS, [{ scale: 2 }, { psm: '11' }, { prepare: { plain: true } }, { prepare: { top: true, scale: 3 }, idsOnly: true }]);
});

test("a purchase screenshot whose order ID is not read the first way is read the other ways, and what they read is added to its words", async () => {
  const tesseract = fakeTesseract((file, psm) => (psm === '11' ? [`Order number ${ORDER_ID}`] : ['Order details', ROLL, 'Grand Total: ₹314.00']));
  const out = await readOrderShot(['/made-up/order.png'], { tesseract, sips: fakeSips, want: { orderId: ORDER_ID, amount: 314, tolerance: 1, allowance: 5 } });
  assert.deepEqual(out.orderIds, [ORDER_ID]);
  assert.deepEqual(out.texts, ['Order details', ROLL, 'Grand Total: ₹314.00', `Order number ${ORDER_ID}`], "the picture's own lines first, then what the other ways read");
  assert.deepEqual(tesseract.calls.map((c) => c.psm), ['3', '3', '11'], 'first, enlarged, then as scattered words, where it was found');
});

test("the top strip (a browser's address and its tabs) gives only order IDs, never words taken for a product", async () => {
  const tesseract = fakeTesseract((file) => (file === '/made-up/top.png' ? ['Test Brand Form - Aug x', `amazon.in/progress-tracker/package?orderId=${ORDER_ID}&shipmentId=X`] : ['9:54 am Delivered', 'Out for delivery']));
  const prepare = async (file, how) => (how.top ? { file: '/made-up/top.png', done: async () => {} } : null);
  const out = await readDeliveryShot(['/made-up/delivery.png'], { tesseract, sips: fakeSips, prepare, want: { orderId: ORDER_ID, amount: 314 } });
  assert.deepEqual(out.orderIds, [ORDER_ID]);
  assert.ok(!out.texts.some((t) => /Test Brand Form/.test(t)), 'the tabs are not among its words');
  assert.ok(out.idTexts.some((t) => t.includes(ORDER_ID)));
});

test('a delivery screenshot with no order ID read is read the other ways even when its amount is the one given', async () => {
  const tesseract = fakeTesseract((file, psm) => (psm === '11' ? ['Order number', ORDER_ID.replace(/-/g, '-')] : ['Delivered 21 August', ROLL, 'Grand Total: ₹314.00']));
  const out = await readDeliveryShot(['/made-up/delivery.png'], { tesseract, sips: fakeSips, want: { orderId: ORDER_ID, amount: 314, tolerance: 1, allowance: 5 } });
  assert.deepEqual(out.orderIds, [ORDER_ID]);
  assert.equal(out.delivered, true);
});

test("Amazon's refusal read only in part on a small screenshot: read once more enlarged, for the whole message", async () => {
  const tesseract = fakeTesseract((file) => (/\/arc-picture-/.test(file) ? ['@ We apologise but Amazon is not accepting reviews on this item or product from this account. For'] : ['harshit Edit public name', 'n this item or product from th', 'mmunity guid']));
  const out = await readReviewPicture(['/made-up/refusal.png'], { settings: SETTINGS, tesseract, sips: fakeSips });
  assert.equal(out.kind, 'refused');
  assert.match(out.refusal, /not accepting reviews on this item/i);
});

test('readLines: the way Tesseract finds lines, and a copy made easier to read (none to make: nothing is read)', async () => {
  const tesseract = fakeTesseract(() => ['Hello there friend']);
  const sparse = await readLines('/made-up/a.png', { tesseract, psm: '11' });
  assert.deepEqual(sparse.lines.map((l) => l.text), ['Hello there friend']);
  assert.equal(tesseract.calls[0].psm, '11');
  let done = 0;
  const copy = await readLines('/made-up/a.png', { tesseract, prepare: async () => ({ file: '/made-up/copy.png', done: async () => done++ }) });
  assert.equal(copy.prepared, true);
  assert.equal(tesseract.calls[1].file, '/made-up/copy.png');
  assert.equal(done, 1, 'the copy is removed once read');
  assert.equal(await readLines('/made-up/a.png', { tesseract, prepare: async () => null }), null);
});

test('a copy made plain: a selection\'s blue box with white words becomes black words on white; a picture with no blue is left alone; the top strip is three times as large', async () => {
  const page = await images.ready();
  const draw = (withBox) =>
    page.evaluate((box) => {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 100;
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 400, 100);
      g.font = 'bold 20px sans-serif';
      if (box) {
        g.fillStyle = 'rgb(51,103,209)';
        g.fillRect(100, 30, 220, 32);
        g.fillStyle = '#fff';
        g.fillText('403-1000002', 110, 53);
      }
      g.fillStyle = '#000';
      g.fillText('Order number', 0, 90);
      return c.toDataURL('image/png').split(',')[1];
    }, withBox);
  const dir = await mkdtemp(join(tmpdir(), 'arc-test-'));
  try {
    const boxed = join(dir, 'boxed.png');
    const plainOnly = join(dir, 'plain.png');
    await writeFile(boxed, Buffer.from(await draw(true), 'base64'));
    await writeFile(plainOnly, Buffer.from(await draw(false), 'base64'));
    const copy = await images.forReading(boxed, 'image/png', { plain: true });
    assert.ok(copy, 'a copy is made');
    const seen = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const at = (x, y) => [d[(y * c.width + x) * 4], d[(y * c.width + x) * 4 + 1], d[(y * c.width + x) * 4 + 2]];
      let black = 0;
      let blue = 0;
      for (let y = 30; y < 62; y++) {
        for (let x = 100; x < 320; x++) {
          const [r, gg, bb] = at(x, y);
          if (r < 60 && gg < 60 && bb < 60) black++;
          if (bb - r > 90) blue++;
        }
      }
      return { corner: at(102, 32), black, blue };
    }, (await readFile(copy.file)).toString('base64'));
    await copy.done();
    assert.deepEqual(seen.corner, [255, 255, 255], "the box's blue is now white paper");
    assert.ok(seen.black > 100, 'its white words are now black');
    assert.equal(seen.blue, 0, 'no blue is left in the box');
    assert.equal(await images.forReading(plainOnly, 'image/png', { plain: true }), null, 'nothing to change');
    const top = await images.forReading(boxed, 'image/png', { top: true, scale: 3 });
    const size = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, (await readFile(top.file)).toString('base64'));
    await top.done();
    assert.deepEqual(size, [1200, 180], 'the top strip of a short picture (60 pixels at least), three times as large');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- what a review picture shows ----

test('a review picture: Amazon\'s "Review Submitted" page shows no review; only the packaging\'s words read is "could not be read"; a review\'s age and "Verified Purchase" are not its words', () => {
  const submitted = classifyReviewPicture(['amazon.in/review/create-review/thankyou?asin=B0TESTROL1', 'Test Buyer Edit public name', '@ Review Submitted', 'Awesome! Thank you for helping other shoppers!', 'Review Your Purchases'], [], { settings: SETTINGS });
  assert.equal(submitted.kind, 'unknown');
  assert.match(submitted.why, /review was submitted/);
  const packaging = classifyReviewPicture(['Test Buyer Verified Purchase', '7 days ago', 'TEST BRAND', 'MADE FOR MEN', 'GENTLE ON SKIN'], [], { settings: SETTINGS });
  assert.deepEqual([packaging.kind, packaging.unreadable], ['unknown', true]);
  assert.equal(isScreenLine('Test Buyer Verified Purchase'), true);
  assert.equal(isScreenLine('7 days ago'), true);
  assert.equal(isScreenLine('amazon.in/review/create-review/thankyou'), true);
  assert.equal(photoLine('१ GENTLE ON SENSITIVE SKIN'), true, 'a stray mark read beside the words is not a word');
});

test("a computer's review page: the product's ratings read in between are never the review's words, and the words read just under its buttons are", () => {
  const L = (text, top) => ({ text, left: 30, top, right: 900, bottom: top + 20, conf: 90 });
  const lines = [L('Customer Review Product Details', 10), L('Test Buyer Test Brand Underarm Roll-On', 40), L('Good product', 70), L('Reviewed in India on 10 September 2026 4.1 out of 5', 100), L('Size: 50 ml | Verified Purchase', 130), L('354 global ratings', 150), L('4 star 15%', 170), L('Helpful Report', 190), L('The roll-on lasts the whole day and never stains my shirts at all.', 210)];
  assert.equal(segment(lines).body, 'The roll-on lasts the whole day and never stains my shirts at all.');
  assert.equal(segment([L('Reviewed in India on 1 May 2026', 10), L('Helpful', 30), L('ok', 50)]).body, null, 'only a sentence is taken from under the buttons');
});

test('every word the new checks write is plain', () => {
  assertPlain(assert, made.filter(Boolean), 'words the new checks made');
});
