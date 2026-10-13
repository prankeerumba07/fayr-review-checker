// A Flipkart row's check (flipkart/check.js), with a pretend screenshots.js
// and pretend readers: its steps are the Amazon check's, in the same order,
// changed for Flipkart; the steps that get the screenshots run, step 2 reads
// the purchase screenshot and compares it with the sheet, and step 4 reads the
// delivery screenshot and compares it, in the Amazon words; the comparison
// table puts the sheet and both screenshots side by side; every other step
// comes in a later step, and the row gets no Status.
// A screenshot that cannot be had says why in the Amazon words; a pause stops
// the check at its step. Made-up rows and made-up readings only; nothing is
// downloaded and no picture is read.
// Run: node test/flipkart-check.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck, buildComparison, STEP_NAMES, PAUSE_SAYS, newCheckId, keptDay } from '../flipkart/check.js';
import { CHECK_ID } from '../flipkart/store.js';
import { DEFAULT_MARKS } from '../flipkart/settings.js';
import { orderIdsIn, datesIn, amountsIn } from '../flipkart/screen-text.js';
import { parseDelivery } from '../flipkart/delivery-read.js';
import { parseReviewShot } from '../flipkart/review-read.js';
import { STEP_NAMES as SCREEN_STEPS } from '../views/flipkart.js';
import { STEP_NAMES as AMAZON_STEPS, PAUSE_SAYS as AMAZON_PAUSE_SAYS } from '../amazon/check.js';

const drive = (id) => `https://drive.google.com/open?id=${id}`;
const cell = (over = {}) => ({ text: '', link: '', links: [], mismatch: null, picture: null, ...over });
const ID = 'OD100000000000000002';
const ROW = {
  id: 'r00000000000a',
  row: 2,
  n: 1,
  orderId: { text: ID, value: ID },
  orderDate: { text: '20-07-2026', value: '2026-07-20' },
  amount: { text: '349', value: 349 },
  product: { text: 'Test Brand Steel Bottle' },
  shots: { order: cell({ links: [drive('1TestOrder01')] }), delivery: cell({ links: [drive('1TestDelivery01')] }), review: cell({ links: ['https://www.flipkart.com/reviews/TESTPID0000001:1'] }), reviewShot: cell({ links: [drive('1TestReview01')] }) },
};
/** A purchase screenshot as the reader gives it (shot-read.js), made from made-up lines with the real rules. */
const reading = (texts, over = {}) => ({ ok: true, problem: null, confidence: 90, wordCount: 40, hindi: true, lines: texts.map((text) => ({ text })), texts, text: texts.join('\n'), orderIds: orderIdsIn(texts), dates: datesIn(texts), amounts: amountsIn(texts), ...over });
const BOTTLE = 'Test Brand Steel Bottle 1 L, Blue';
/** Row 1's purchase screenshot: its order ID, the day it was placed, the product and the price details. */
const PURCHASE = ['< Order Details Help', BOTTLE, `Order #${ID}`, 'Your Order has been placed, Mon 20th Jul', 'Price details', 'Listing price ₹999', 'Selling price ⓘ ₹329', 'Total fees ⌄ ₹30', 'Other discount ⌄ -₹10', 'Total amount ₹349'];
/** A delivery screenshot as the reader gives it (shot-read.js readDeliveryShot), made from made-up lines with the real rules. */
const deliveryReading = (texts, over = {}) => ({ ...reading(texts), ...parseDelivery(texts), ...over });
/** Row 1's delivery screenshot: the product, its order ID, Delivered with its day, and the delivery details naming a made-up person. */
const DELIVERY = ['< Order Details Help', BOTTLE, `Order #${ID}`, '© Delivered, Thu 23rd Jul ^', 'Return policy ended on Thu 30th Jul', 'Delivery details', 'Delivered to Test Person at Home'];
/** A review screenshot as the reader gives it (review-read.js readReviewShot), made from made-up lines with the real rules. */
const reviewReading = (texts, over = {}, opts = {}) => ({ ...reading(texts), ...parseReviewShot(texts, opts), ...over });
const REVIEWER = 'Test Reviewer One';
/** Row 1's review screenshot: the user's own review on Flipkart's website, with its rating, title, words, name and date. */
const REVIEW = ['My Reviews (1)', BOTTLE, '| 5* Terrific purchase', 'Keeps water cold all day and the grip is good.', `${REVIEWER} @ Certified Buyer 12 Sep, 2026`, 'Edit Delete Share'];
const CAMPAIGN = { name: 'Test Brand Bottles', brand: 'Test Brand', products: [{ pid: 'TESTPID0000001', name: BOTTLE, short: 'Test Brand Steel Bottle 1 L', variants: [] }, { pid: 'TESTPID0000009', name: 'Test Brand Lunch Box 3 Containers, Green', short: 'Test Brand Lunch Box 3 Containers', variants: [] }] };

/** A pretend screenshots.js: what each cell gives (a picture, unless said otherwise), and the cells asked for. */
function pretend(answers) {
  const asked = [];
  return {
    asked,
    async forCell(rowId, which) {
      asked.push(which);
      const a = answers[which] ?? { files: ['/made-up/picture.png'], problems: [] };
      if (a instanceof Error) throw a;
      return { files: [], problems: [], types: [], records: [], ...a };
    },
  };
}

async function run(row, answers, opts = {}) {
  const events = [];
  const screenshots = pretend(answers);
  const read = [];
  const readD = [];
  const readOrder = async (files, o) => (read.push({ files, want: o?.want }), opts.read ?? reading(PURCHASE));
  const readDelivery = async (files, o) => (readD.push({ files, want: o?.want }), opts.delivery ?? deliveryReading(DELIVERY));
  const readR = [];
  const readReview = async (files, o) => (readR.push({ files, reviewer: o?.reviewer, productIs: o?.productIs }), opts.review ?? reviewReading(REVIEW, {}, { reviewer: o?.reviewer, productIs: o?.productIs }));
  const result = await runCheck({ row, screenshots, readOrder, readDelivery, readReview, emit: (e) => events.push(e), ...opts });
  return { result, events, asked: screenshots.asked, read, readD, readR };
}

test("a check's steps are the Amazon check's, in the same order, changed for Flipkart: the screenshot steps and steps 2, 4 and 6 run, each shown as it runs; every other step comes in a later step; the row gets no Status", async () => {
  assert.deepEqual(STEP_NAMES, SCREEN_STEPS, 'the screen names them the same');
  assert.deepEqual([STEP_NAMES[0], STEP_NAMES[1], STEP_NAMES[2], STEP_NAMES[3], STEP_NAMES[8]], [AMAZON_STEPS[1], AMAZON_STEPS[2], AMAZON_STEPS[3], AMAZON_STEPS[4], AMAZON_STEPS[9]], "the screenshots' steps and the last one in the Amazon words");
  const { result, events, asked } = await run(ROW, {});
  assert.deepEqual(asked, ['order', 'delivery', 'reviewShot']);
  assert.deepEqual(result.steps.map((s) => [s.state, s.detail]), [['pass', 'Opened the purchase screenshot.'], ['pass', 'Order ID: the same. Order date: the same. Amount: the same. Product: the same.'], ['pass', 'Opened the delivery screenshot.'], ['pass', 'It says "Delivered, Thu 23rd Jul". Order ID: the same. Order date: not shown. Amount: not shown. Product: the same.'], ['pass', 'Opened the review screenshot.'], ['pass', 'A written review by "Test Reviewer One": "Keeps water cold all day and the grip is good."'], ['later', null], ['later', null], ['later', null]]);
  const said = (e) => (e.event === 'step' ? `step ${e.step.n} ${e.step.state}` : e.event === 'action' ? `action ${e.says}` : e.event);
  assert.deepEqual(events.map(said), ['started', 'step 1 running', 'action Opening the purchase screenshot', 'step 1 pass', 'step 2 running', 'action Reading the purchase screenshot', 'step 2 pass', 'step 3 running', 'action Opening the delivery screenshot', 'step 3 pass', 'step 4 running', 'action Reading the delivery screenshot', 'step 4 pass', 'step 5 running', 'action Opening the review screenshot', 'step 5 pass', 'step 6 running', 'action Reading the review screenshot', 'step 6 pass', 'step 7 later', 'step 8 later', 'step 9 later', 'action Done. The other steps come in a later step, so this row has no Status yet.', 'done']);
  assert.deepEqual([result.paused, result.stopped, 'status' in result, 'type' in result, 'note' in result], [null, false, false, false, false], 'no Status, Type or Note');
  assert.match(result.checkId, CHECK_ID);
  assert.match(newCheckId(new Date('2026-10-12T12:30:00Z')), /^c20261012123000[0-9a-f]{6}$/);
  assert.equal((await run(ROW, { order: { files: ['/made-up/a.png', '/made-up/b.png'], problems: [] } })).result.steps[0].detail, 'Opened 2 purchase screenshots.');
});

test("a screenshot that cannot be had says why, in the Amazon words; an empty cell, words instead of a screenshot and a missing column are said too; the review link's picture is opened when the review screenshot cell has none; a screenshot not opened is not read", async () => {
  const { result, read } = await run(ROW, {
    order: { files: [], problems: [{ link: drive('1TestOrder01'), kind: 'drive', site: 'Google Drive', says: 'the Google account logged in to the dashboard has no access to the file', noAccess: true }] },
    delivery: { files: [], problems: [{ link: 'https://pictures.example.com/x.png', kind: 'allowed', site: 'pictures.example.com', says: "the website is not on the dashboard's list of picture websites" }] },
    reviewShot: { files: [], problems: [{ link: drive('1TestReview01'), kind: 'busy', site: 'Google Drive', says: 'Google Drive did not answer, so it could not be downloaded' }] },
  });
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((i) => [result.steps[i].state, result.steps[i].detail]),
    [
      ['fail', 'The purchase screenshot is on Google Drive, but the Google account logged in to the dashboard has no access to the file.'],
      ['not-reached', 'The purchase screenshot could not be opened, so it was not read.'],
      ['fail', "The delivery screenshot is on pictures.example.com, but the website is not on the dashboard's list of picture websites."],
      ['not-reached', 'The delivery screenshot could not be opened, so it was not read.'],
      ['fail', 'The review screenshot is on Google Drive, but Google Drive did not answer, so it could not be downloaded.'],
    ],
  );
  assert.deepEqual([read, result.order, result.delivery], [[], null, null], 'nothing read');
  const odd = { ...ROW, shots: { order: cell(), delivery: cell({ text: 'Sent on WhatsApp. See chat' }), review: cell({ links: [drive('1TestReviewPicture01')] }), reviewShot: cell() } };
  const said = await run(odd, {});
  assert.deepEqual(said.asked, ['review'], "only a cell with a picture is opened: the review link's, since the review screenshot cell has none");
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => said.result.steps[i].detail), ['The cell is empty.', 'There is no purchase screenshot to read.', 'The cell says "Sent on WhatsApp; See chat" instead of holding a screenshot.', 'There is no delivery screenshot to read.', 'Opened the review screenshot.']);
  const noColumn = await run(ROW, {}, { has: { deliveryShot: false } });
  assert.deepEqual([noColumn.result.steps[2].detail, noColumn.result.steps[3].detail, noColumn.asked], ['The file has no delivery screenshot column.', 'The file has no delivery screenshot column, so there is nothing to read.', ['order', 'reviewShot']]);
  const noPurchase = await run(ROW, {}, { has: { orderShot: false } });
  assert.deepEqual([noPurchase.result.steps[0].detail, noPurchase.result.steps[1].state, noPurchase.result.steps[1].detail], ['The file has no purchase screenshot column.', 'not-reached', 'The file has no purchase screenshot column, so there is nothing to read.']);
  const broke = await run(ROW, { delivery: new Error('made-up') });
  assert.deepEqual([broke.result.steps[2].state, broke.result.steps[2].detail, broke.result.steps[4].state], ['fail', 'Something went wrong on this computer while opening the delivery screenshot. Check this row again.', 'pass'], 'that step says so, and the others still run');
  const readBroke = await run(ROW, {}, { readOrder: async () => { throw new Error('made-up'); } });
  assert.deepEqual([readBroke.result.steps[1].state, readBroke.result.steps[1].detail, readBroke.result.steps[2].state, readBroke.result.steps[3].state], ['fail', 'Something went wrong on this computer while reading the purchase screenshot. Check this row again.', 'pass', 'pass'], 'the delivery screenshot is still read');
});

test("step 2, as the Amazon checker's step 3: the purchase screenshot is read on this computer, and the order ID, the order date (only when the file has that column), the amount and the product are each the same, different or not shown, in the Amazon words; what it says is kept for the row's page", async () => {
  // Everything the same, the product being one of the campaign's, by its real name read from Flipkart.
  const same = await run(ROW, {}, { campaigns: [CAMPAIGN] });
  assert.deepEqual([same.result.steps[1].state, same.result.steps[1].detail], ['pass', "Order ID: the same. Order date: the same. Amount: the same. Product: one of the campaign's products."]);
  assert.deepEqual(same.read.map((r) => [r.files, r.want.orderId, r.want.amount, r.want.tolerance, r.want.allowance, typeof r.want.product]), [[['/made-up/picture.png'], ID, 349, DEFAULT_MARKS.amountDifferenceRupees, DEFAULT_MARKS.feeAllowanceRupees, 'function']], "read with what the sheet gives, so a picture that lacks it is read again the other ways");
  const o = same.result.order;
  assert.deepEqual([o.ok, o.orderIds, o.dates, o.amounts.filter((a) => !a.skip).map((a) => [a.value, a.label]), o.product, o.details.product.product.pid], [true, [ID], ['20-07, with no year shown'], [[999, 'listing price'], [329, 'selling price'], [349, 'total amount']], BOTTLE, 'TESTPID0000001']);
  assert.ok(o.text.includes(`Order #${ID}`) && o.confidence === 90 && o.wordCount === 40 && o.hindi === true, 'everything read from it, and how');
  assert.deepEqual(same.events.find((e) => e.event === 'step' && e.step.n === 2 && e.step.state === 'pass').partial, { order: o, delivery: null, review: null }, 'shown on the row\'s page as soon as it is read');
  // A different order ID, a total read clearly that is different, and another of the brand's products.
  const other = reading([`Order #${'OD100000000000000099'}`, 'Test Brand Lunch Box 3 Containers, Green', 'Selling price ₹449', 'Total amount ₹499']);
  const diff = await run(ROW, {}, { campaigns: [CAMPAIGN], read: other });
  assert.deepEqual([diff.result.steps[1].state, diff.result.steps[1].detail], ['fail', "Order ID: different. Order date: not shown. Amount: different. Product: one of the campaign's products."]);
  assert.deepEqual([diff.result.order.details.orderId.shown, diff.result.order.details.amount.shown, diff.result.order.details.amount.label], ['OD100000000000000099', '₹499', 'the total amount']);
  const brand = await run(ROW, {}, { campaigns: [CAMPAIGN], read: reading([`Order #${ID}`, 'Test Brand Water Jug 2 Litres Glass', 'Total amount ₹349']) });
  assert.equal(brand.result.steps[1].detail, "Order ID: the same. Order date: not shown. Amount: the same. Product: not one of the campaign's products.", "another of the brand's products");
  // With no live campaign, the product is compared with its name in the sheet; a name cut short is never different.
  assert.equal((await run(ROW, {})).result.steps[1].detail, 'Order ID: the same. Order date: the same. Amount: the same. Product: the same.');
  const cut = await run(ROW, {}, { read: reading([`Order #${ID}`, 'Test Brand Steel Bo...', 'Total amount ₹349']) });
  assert.deepEqual([cut.result.steps[1].state, cut.result.order.details.product.state], ['fail', 'not shown']);
  const notOurs = await run(ROW, {}, { read: reading([`Order #${ID}`, 'Test Brand Glass Water Jug', 'Total amount ₹349']) });
  assert.equal(notOurs.result.order.details.product.state, 'different');
  assert.equal((await run(ROW, {}, { marks: { ...DEFAULT_MARKS, productNameShare: 0.5 }, read: reading([`Order #${ID}`, 'Test Brand Glass Bottle', 'Total amount ₹349']) })).result.order.details.product.state, 'same', "Flipkart's own passing mark for a product's name");
  // How an amount is the same when it is not shown as it is; part of an order ID; nothing shown; the price before the discount is never the order's amount.
  const coins = await run({ ...ROW, amount: { text: '499', value: 499 } }, {}, { read: reading([`Order #${ID}`, BOTTLE, 'Special price ₹489', 'Total fees ₹10', 'Total amount ₹449 + O50']) });
  assert.equal(coins.result.steps[1].detail, 'Order ID: the same. Order date: not shown. Amount: the same (₹449 with ₹50 of SuperCoins). Product: the same.');
  const fees = await run({ ...ROW, amount: { text: '307', value: 307 } }, {}, { read: reading([`Order #${ID}`, BOTTLE, 'Selling price @ २329', 'Total fees v 210', 'Other discount v -%20', 'Total amount FI807+12', 'Total amount २३०7']) });
  assert.match(fees.result.steps[1].detail, /Amount: the same \(₹329 with ₹10 of fees, less the money taken off\)\./, 'a total read two ways is not clear, and the price details add up to the sheet\'s amount');
  const part = await run(ROW, {}, { read: reading(['Order #OD10000000000000', BOTTLE, 'Total amount ₹349']) });
  assert.match(part.result.steps[1].detail, /^Order ID: the same \(14 of its 18 digits were read\)\./);
  const hidden = await run(ROW, {}, { read: reading(['< Order Details Help', 'Order Confirmed', 'Track your order']) });
  assert.deepEqual([hidden.result.steps[1].state, hidden.result.steps[1].detail], ['fail', 'Order ID: not shown. Order date: not shown. Amount: not shown. Product: not shown.']);
  const listing = await run(ROW, {}, { read: reading([`Order #${ID}`, BOTTLE, 'Listing price ₹999', 'Selling price ₹329']) });
  assert.deepEqual([listing.result.order.details.amount.state, listing.result.steps[1].state], ['not shown', 'pass'], 'with the price details shown and no total read, the amount is not shown, as an item\'s price is never the order\'s amount there; the purchase screenshot need not show it (as on Amazon)');
  // A file with no order date, amount or product column: those are not compared.
  const fewer = await run(ROW, {}, { has: { orderDate: false, amount: false, product: false } });
  assert.deepEqual([fewer.result.steps[1].state, fewer.result.steps[1].detail], ['pass', 'Order ID: the same.']);
  // A picture whose words are not clear.
  const unclear = await run(ROW, {}, { read: reading([], { ok: false, problem: 'its words are not clear enough to read', confidence: 30, wordCount: 2 }) });
  assert.deepEqual([unclear.result.steps[1].state, unclear.result.steps[1].detail, unclear.result.order.problem], ['fail', 'It could not be read: its words are not clear enough to read.', 'its words are not clear enough to read']);
  assert.deepEqual([unclear.result.steps[2].state, unclear.result.steps.at(-1).state], ['pass', 'later'], 'the check goes on; still no Status');
});

test("step 4, as the Amazon checker's step 5: the delivery screenshot is read on this computer, even when the purchase screenshot has a problem; it must say Delivered, and its order ID, amount and product are each the same, different or not shown, in the Amazon words; a detail it does not show is never different; two different order IDs are both said; then the comparison table puts the sheet and the two screenshots side by side", async () => {
  const same = await run(ROW, {}, { campaigns: [CAMPAIGN] });
  assert.deepEqual([same.result.steps[3].state, same.result.steps[3].detail], ['pass', 'It says "Delivered, Thu 23rd Jul". Order ID: the same. Order date: not shown. Amount: not shown. Product: one of the campaign\'s products.']);
  assert.deepEqual(same.readD.map((r) => [r.files, r.want.orderId, r.want.product]), [[['/made-up/picture.png'], ID, null]], "read with the sheet's order ID, so a picture that lacks it is read again the other ways");
  const d = same.result.delivery;
  assert.deepEqual([d.ok, d.delivered, d.deliveredText, d.notDelivered, d.orderIds, d.product], [true, true, 'Delivered, Thu 23rd Jul', null, [ID], BOTTLE]);
  assert.deepEqual(same.events.find((e) => e.event === 'step' && e.step.n === 4 && e.step.state === 'pass').partial, { order: same.result.order, delivery: d, review: null }, "shown on the row's page as soon as it is read");
  // Not delivered: Flipkart's word for it is said, else that it does not say Delivered; either way the step fails. A sign only a delivered order shows counts.
  const cancelled = await run(ROW, {}, { delivery: deliveryReading(['< Order Details Help', BOTTLE, `Order #${ID}`, 'Order Cancelled', 'Shipped, Jul 21']) });
  assert.deepEqual([cancelled.result.steps[3].state, cancelled.result.steps[3].detail, cancelled.result.delivery.notDelivered], ['fail', 'It says "Cancelled", not Delivered. Order ID: the same. Order date: not shown. Amount: not shown. Product: the same.', 'Cancelled']);
  const quiet = await run(ROW, {}, { delivery: deliveryReading([BOTTLE, `Order #${ID}`]) });
  assert.deepEqual([quiet.result.steps[3].state, quiet.result.steps[3].detail], ['fail', 'It does not say Delivered. Order ID: the same. Order date: not shown. Amount: not shown. Product: the same.']);
  const sign = await run(ROW, {}, { delivery: deliveryReading([`Order #${ID}`, BOTTLE, 'Return policy ended on Thu 30th Jul']) });
  assert.deepEqual([sign.result.steps[3].state, sign.result.steps[3].detail.split('. ')[0]], ['pass', 'It says "Return policy ended", which Flipkart shows only for a delivered order']);
  const to = await run(ROW, {}, { delivery: deliveryReading([`Order #${ID}`, BOTTLE, 'Delivered to Test Person at Home']) });
  assert.deepEqual([to.result.steps[3].detail.split('. ')[0], to.result.delivery.deliveredText], ['It says "Delivered to …"', 'Delivered to …'], 'never the person it was handed to');
  // A detail it does not show is never different, and it need not show the order ID or the product; an item's price with no total is not the order's amount.
  const bare = await run(ROW, {}, { delivery: deliveryReading(['© Delivered, Thu 23rd Jul']) });
  assert.deepEqual([bare.result.steps[3].state, bare.result.steps[3].detail], ['pass', 'It says "Delivered, Thu 23rd Jul". Order ID: not shown. Order date: not shown. Amount: not shown. Product: not shown.']);
  const price = await run(ROW, {}, { delivery: deliveryReading(['Delivered, Thu 23rd Jul', `${BOTTLE} ₹329`]) });
  assert.match(price.result.steps[3].detail, / Amount: not shown \(₹329 is an item's price, not the order's total\)\. /);
  const paid = await run(ROW, {}, { delivery: deliveryReading(['Delivered, Thu 23rd Jul', BOTTLE, 'Paid ₹349 by UPI']) });
  assert.match(paid.result.steps[3].detail, / Amount: the same\. /, 'the amount paid is the total');
  // Different: the step fails; two different order IDs are both said, in FLIPKART-PLAN.md's words.
  const other = 'OD100000000000000099';
  const ids = await run(ROW, {}, { delivery: deliveryReading(['Delivered, Thu 23rd Jul', `Order #${other}`, BOTTLE]) });
  assert.deepEqual([ids.result.steps[3].state, ids.result.steps[3].detail], ['fail', `It says "Delivered, Thu 23rd Jul". Order ID: different. Order date: not shown. Amount: not shown. Product: the same. Order ID in the purchase screenshot: ${ID}. Order ID in the delivery screenshot: ${other}. The order IDs do not match.`]);
  const noSheetId = await run({ ...ROW, orderId: { text: '', value: '' } }, {}, { delivery: deliveryReading(['Delivered, Thu 23rd Jul', `Order #${other}`, BOTTLE]) });
  assert.deepEqual([noSheetId.result.steps[3].state, noSheetId.result.steps[3].detail.split('. ').slice(-3)], ['fail', [`Order ID in the purchase screenshot: ${ID}`, `Order ID in the delivery screenshot: ${other}`, 'The order IDs do not match.']], 'with no order ID in the sheet too');
  const brand = await run(ROW, {}, { campaigns: [CAMPAIGN], delivery: deliveryReading(['Delivered, Thu 23rd Jul', 'Test Brand Water Jug 2 Litres Glass']) });
  assert.deepEqual([brand.result.steps[3].state, brand.result.steps[3].detail.split('. ').at(-1)], ['fail', "Product: not one of the campaign's products."]);
  // Both screenshots are read, even when the first has a problem; a delivery screenshot whose words are not clear says so.
  const first = await run(ROW, {}, { read: reading([], { ok: false, problem: 'its words are not clear enough to read', confidence: 30, wordCount: 2 }) });
  assert.deepEqual([first.result.steps[1].state, first.result.steps[3].state, first.readD.length], ['fail', 'pass', 1]);
  const unclear = await run(ROW, {}, { delivery: deliveryReading([], { ok: false, problem: 'its words are not clear enough to read', confidence: 30, wordCount: 2 }) });
  assert.deepEqual([unclear.result.steps[3].state, unclear.result.steps[3].detail, unclear.result.delivery.problem], ['fail', 'It could not be read: its words are not clear enough to read.', 'its words are not clear enough to read']);
  // The comparison table: the sheet and both screenshots side by side, as on Amazon.
  assert.deepEqual(same.result.comparison, [
    { field: 'Order ID', sheet: ID, order: `The same: ${ID}`, delivery: `The same: ${ID}`, result: 'The same on both screenshots.', ok: true },
    { field: 'Order date', sheet: '20-07-2026', order: 'The same: 20-07, with no year shown', delivery: 'Not shown', result: 'The same on the purchase screenshot.', ok: true },
    { field: 'Amount', sheet: '349', order: 'The same: ₹349, the total amount', delivery: 'Not shown', result: 'The same on the purchase screenshot.', ok: true },
    { field: 'Product', sheet: "Test Brand Steel Bottle (not compared: the campaign's products are used)", order: 'One of the campaign\'s products: "Test Brand Steel Bottle 1 L"', delivery: 'One of the campaign\'s products: "Test Brand Steel Bottle 1 L"', result: "One of the campaign's products on both screenshots.", ok: true },
    { field: 'Delivered', sheet: '', order: '', delivery: 'Delivered, Thu 23rd Jul', result: 'The delivery screenshot says Delivered.', ok: true },
  ]);
  assert.deepEqual([same.result.sheet, same.result.compared, same.result.shotsHad], [{ orderId: ID, orderDate: '20-07-2026', amount: '349', product: 'Test Brand Steel Bottle' }, ['orderId', 'orderDate', 'amount', 'product'], ['order', 'delivery']]);
  assert.deepEqual(ids.result.comparison[0], { field: 'Order ID', sheet: ID, order: `The same: ${ID}`, delivery: `Different: ${other}`, result: 'Different on the delivery screenshot.', ok: false });
  assert.deepEqual([bare.result.comparison[0], bare.result.comparison[3]].map((r) => [r.field, r.delivery, r.result, r.ok]), [['Order ID', 'Not shown', 'The same on the purchase screenshot; not shown on the delivery screenshot.', true], ['Product', 'Not shown', 'The same on the purchase screenshot; not shown on the delivery screenshot.', null]], 'the delivery screenshot need not show the order ID; whether a product shown on one screenshot only is enough is for the Status, in a later step');
  assert.deepEqual(quiet.result.comparison.at(-1), { field: 'Delivered', sheet: '', order: '', delivery: 'Not shown', result: 'It does not say Delivered.', ok: false });
  const fewer = await run(ROW, {}, { has: { orderDate: false, amount: false, product: false, deliveryShot: false } });
  assert.deepEqual(fewer.result.comparison, [{ field: 'Order ID', sheet: ID, order: `The same: ${ID}`, delivery: 'Not read', result: 'The same on the purchase screenshot.', ok: true }], 'only the details and the screenshots the file has columns for');
  assert.deepEqual(buildComparison({}).map((r) => [r.field, r.order, r.delivery, r.result, r.ok]), [['Order ID', 'Not read', 'Not read', 'Not compared.', null], ['Order date', 'Not read', 'Not read', 'Not compared.', null], ['Amount', 'Not read', 'Not read', 'Not compared.', null], ['Product', 'Not read', 'Not read', 'Not compared.', null], ['Delivered', '', 'Not read', 'Not read.', null]]);
});

test("step 6, as the Amazon checker's step 7 reads a review screenshot: the rating, the review's title and words, the reviewer's name and the date, or Flipkart's message; of several reviews, only the reviewer's; a part not read is not shown, never guessed; kept for the row's page", async () => {
  const one = await run(ROW, {}, { reviewer: REVIEWER, campaigns: [CAMPAIGN] });
  assert.deepEqual([one.result.steps[5].state, one.result.steps[5].detail], ['pass', 'A written review by "Test Reviewer One": "Keeps water cold all day and the grip is good."']);
  assert.deepEqual([one.readR.length, one.readR[0].files, one.readR[0].reviewer, typeof one.readR[0].productIs, one.readR[0].productIs([BOTTLE]), one.readR[0].productIs(['Test Brand Lunch Box 3 Containers, Green'])], [1, ['/made-up/picture.png'], REVIEWER, 'function', true, false], "read with the reviewer in the sheet, and what tells the product ordered");
  const r = one.result.review;
  assert.deepEqual([r.ok, r.kind, r.stars, r.title, r.body, r.name, r.dateText, r.own, r.others], [true, 'written', 5, 'Terrific purchase', 'Keeps water cold all day and the grip is good.', REVIEWER, '12 Sep, 2026', true, 0]);
  assert.deepEqual(one.events.find((e) => e.event === 'step' && e.step.n === 6 && e.step.state === 'pass').partial.review, r, "shown on the row's page as soon as it is read");
  // Several reviews: only the reviewer's is read; with none under the reviewer's name, none is.
  const LIST = ['5.0 • Wonderful', 'Keeps water cold all day.', `${REVIEWER}, Test City`, '7 Helpful', 'Verified Purchase · 3 days ago', '4.0 • Nice product', 'The lid is a bit tight.', 'Test Reviewer Two, Test Town', '2 Helpful', 'Verified Purchase · 9 days ago'];
  const two = await run(ROW, {}, { reviewer: 'Test Reviewer Two', review: reviewReading(LIST, {}, { reviewer: 'Test Reviewer Two' }) });
  assert.deepEqual([two.result.steps[5].state, two.result.steps[5].detail, two.result.review.stars, two.result.review.dateText], ['pass', 'A written review by "Test Reviewer Two", one of 2 reviews it shows: "The lid is a bit tight."', 4, '9 days ago']);
  const nobody = await run(ROW, {}, { review: reviewReading(LIST, {}, { reviewer: 'Someone Else' }) });
  assert.deepEqual([nobody.result.steps[5].state, nobody.result.steps[5].detail, nobody.result.review.name, nobody.result.review.body], ['fail', "It does not clearly show a written review, a star rating only or a message from Flipkart, because it shows 2 reviews, and which one is the user's could not be told: none is under the reviewer's name in the sheet.", null, null]);
  // A rating only, the review being written, Flipkart's message, a picture that is not a review, and one that cannot be read.
  const rating = await run(ROW, {}, { review: reviewReading([BOTTLE, '4.0 •', `${REVIEWER} @ Certified Buyer 12 Sep, 2026`]) });
  assert.deepEqual([rating.result.steps[5].state, rating.result.steps[5].detail, rating.result.review.kind], ['pass', '4 stars and no written words.', 'rating']);
  const form = await run(ROW, {}, { review: reviewReading(['Share your experience', BOTTLE, 'Tell us more', '| Keeps water cold all day', 'Home Play Categories Account Cart']) });
  assert.deepEqual([form.result.steps[5].state, form.result.steps[5].detail, form.result.review.form, form.result.review.name, form.result.review.note], ['pass', 'The review being written: "Keeps water cold all day". This shows the words being typed, not that the review was posted.', true, null, 'This shows the words being typed, not that the review was posted.']);
  // "My Reviews" in the app, with its "Pending" and "Published" tabs: it does not show that the review is live.
  const mine = await run(ROW, {}, { review: reviewReading(['< My Reviews', 'Pending Published', 'Product Reviews written by you..', 'Test Brand Steel Bottle...', 'Terrific purchase', 'xx. xx. 49. x 9. 25 Aug 2026', 'Keeps water cold all day.', 'xx Delete © Edit']) });
  assert.deepEqual([mine.result.steps[5].state, mine.result.steps[5].detail, mine.result.review.pending, mine.result.review.dateText], ['pass', 'A written review: "Keeps water cold all day." This is the My Reviews page, which also lists pending reviews, so it does not show that the review is live.', true, '25 Aug 2026']);
  const refused = await run(ROW, {}, { review: reviewReading(['Your review was rejected as it does not meet our guidelines']) });
  assert.deepEqual([refused.result.steps[5].state, refused.result.steps[5].detail], ['fail', 'It shows a message from Flipkart that the review was not accepted: "Your review was rejected as it does not meet our guidelines".']);
  const photo = await run(ROW, {}, { review: reviewReading(['GENTLE ON SKIN', 'MADE FOR MEN']) });
  assert.deepEqual([photo.result.steps[5].state, photo.result.steps[5].detail, photo.result.review.kind], ['fail', 'It does not clearly show a written review, a star rating only or a message from Flipkart, because only words printed on a product in a photo could be read.', 'unknown']);
  const unclear = await run(ROW, {}, { review: { ...reviewReading([]), ok: false, problem: 'its words are not clear enough to read' } });
  assert.deepEqual([unclear.result.steps[5].state, unclear.result.steps[5].detail], ['fail', 'It could not be read: its words are not clear enough to read.']);
  // Not opened: not read.
  const none = await run({ ...ROW, shots: { ...ROW.shots, reviewShot: cell() } }, {});
  assert.deepEqual([none.result.steps[5].state, none.result.steps[5].detail, none.readR.length, none.result.review], ['not-reached', 'There is no review screenshot to read.', 0, null]);
  const lost = await run(ROW, { reviewShot: { files: [], problems: [{ kind: 'busy', site: 'Google Drive', says: 'Google Drive did not answer, so it could not be downloaded' }] } });
  assert.deepEqual([lost.result.steps[5].state, lost.result.steps[5].detail], ['not-reached', 'The review screenshot could not be opened, so it was not read.']);
  const noColumn = await run(ROW, {}, { has: { reviewShot: false, reviewLink: false } });
  assert.deepEqual([noColumn.result.steps[5].state, noColumn.result.steps[5].detail], ['not-reached', 'The file has no review screenshot column, so there is nothing to read.']);
});

test("step 7: Flipkart's reviews of the campaign's product, read once in a checking run (a pretend reading) for every row, searched for the review screenshot's words and name; reviews from the day the order was delivered count, else from the day it was placed, a date with no year being the most recent such day not in the future, and with neither no date is used; a row with nothing to search with reads nothing; a reading stopped by a robot check, a block or a slow page pauses the check, unless the review was found among the pages read", async () => {
  const NOW = () => new Date('2026-10-13T05:00:00.000Z');
  const made = (i, date) => ({ id: `made-up-${i}`, name: `Made-up Reviewer ${i}`, stars: 4, title: 'Nice', text: `Made-up review number ${i}.`, dateSaid: '3 days ago', date, dateLatest: date, city: 'Test Town', certified: true, reviewFor: null, page: 1 });
  const READ = { pid: 'TESTPID0000001', link: 'https://www.flipkart.com/test-brand-steel-bottle/product-reviews/itmtestbottle01?pid=TESTPID0000001&marketplace=FLIPKART', readAt: '2026-10-13T05:00:00.000Z', since: null, pages: 3, total: 40, end: 'limit', stoppedAt: null, says: '3 reviews read from 3 pages, the most read at one time; older reviews were not read.', reviews: [made(1, '2026-10-10'), made(2, '2026-08-01'), made(3, '2026-07-15')], product: { pid: 'TESTPID0000001', name: BOTTLE, rating: 4.2, ratings: 100, reviews: 40 } };
  const asked = [];
  const told = [];
  const source = (answer = READ) => async (pid, o) => {
    asked.push({ pid, rowId: o.rowId, day: o.day });
    o.onPage?.(0);
    o.onPage?.(1);
    return typeof answer === 'function' ? answer() : answer;
  };
  const go = (opts = {}) => run(opts.row ?? ROW, {}, { reviewer: REVIEWER, campaigns: [CAMPAIGN], now: NOW, reviews: source(opts.answer), ...opts });
  const one = await go();
  one.events.filter((e) => e.event === 'action').forEach((e) => told.push(e.says));
  assert.deepEqual([one.result.steps[6].state, one.result.steps[6].detail], ['fail', 'Not found among Flipkart\'s reviews: none of the 2 reviews that can be posted on or after 23-07-2026 has the review screenshot\'s words under the name on the review screenshot. Read 3 reviews of the product from 3 pages of "See all reviews" on Flipkart, newest first (back to 15-07-2026, the most read at one time). Reviews posted on or after the day the order was delivered (23-07-2026, on the delivery screenshot) can be the user\'s.']);
  assert.deepEqual(one.result.found, { how: 'notFound', count: 0, nameFrom: 'screenshot', counted: 2, nameOnly: 0, before: 0, share: one.result.found.share, rareShare: one.result.found.rareShare, review: null });
  assert.deepEqual(asked.at(-1), { pid: 'TESTPID0000001', rowId: ROW.id, day: '2026-07-23' }, "the product the purchase screenshot shows, and the row's day");
  assert.deepEqual(told.filter((t) => /Flipkart/.test(t)), ["Finding the review among Flipkart's public reviews", "Opening the product's page on Flipkart", "Reading page 1 of Flipkart's reviews, newest first"]);
  assert.deepEqual([one.result.reviewsFrom, one.result.flipkart], [{ day: '2026-07-23', from: 'delivery', said: 'the day the order was delivered (23-07-2026, on the delivery screenshot)' }, { pid: 'TESTPID0000001', name: BOTTLE, readAt: '2026-10-13T05:00:00.000Z', reused: false, pages: 3, count: 3, total: 40, end: 'limit', since: null, oldest: '2026-07-15', says: READ.says }]);
  assert.deepEqual([one.result.steps[7].state, one.result.steps[8].state], ['later', 'later']);
  // Read earlier and kept: Flipkart is not opened again.
  const kept = await go({ answer: { ...READ, reused: true } });
  assert.match(kept.result.steps[6].detail, / They were read earlier and kept on this computer, so Flipkart was not opened again\. Reviews posted/);
  // Back to the oldest day the rows need; gone on from where an earlier reading stopped, or not even that when what was kept reaches it.
  const dated = await go({ answer: { ...READ, end: 'date', since: '2026-07-20' } });
  assert.match(dated.result.steps[6].detail, /newest first \(back to 15-07-2026; the rows need reviews back to 20-07-2026\)\. Reviews posted/);
  const wentOn = await go({ answer: { ...READ, end: 'date', since: '2026-07-20', wentOn: 3, opened: 1 } });
  assert.match(wentOn.result.steps[6].detail, /\)\. The reading went on from page 3, where it had stopped, keeping the pages read before\. Reviews posted/);
  const reached = await go({ answer: { ...READ, end: 'date', since: '2026-07-20', wentOn: 4, opened: 0 } });
  assert.match(reached.result.steps[6].detail, /\)\. They were read earlier and kept on this computer, so Flipkart was not opened again\. Reviews posted/);
  // The days: no delivery day ("Delivered before time"), so the order's; a date with no year in the future is last year's; neither.
  const early = await go({ delivery: deliveryReading(['< Order Details Help', BOTTLE, `Order #${ID}`, 'Delivered before time', 'Delivery details']) });
  assert.deepEqual([early.result.reviewsFrom.day, asked.at(-1).day], ['2026-07-20', '2026-07-20']);
  assert.match(early.result.steps[6].detail, /Reviews posted on or after the day the order was placed \(20-07-2026, on the purchase screenshot, as the delivery screenshot shows no delivery day\) can be the user's\./);
  const december = await go({ delivery: deliveryReading(['< Order Details Help', BOTTLE, `Order #${ID}`, '© Delivered, Fri 25th Dec', 'Delivery details']) });
  assert.equal(december.result.reviewsFrom.day, '2025-12-25', 'not a day in the future');
  const noDay = await go({ read: reading(PURCHASE.filter((t) => !/placed/.test(t))), delivery: deliveryReading(['< Order Details Help', BOTTLE, `Order #${ID}`, 'Delivered before time']) });
  assert.deepEqual([noDay.result.reviewsFrom, asked.at(-1).day], [{ day: null, from: null, said: 'neither the delivery screenshot nor the purchase screenshot shows a day' }, null]);
  assert.match(noDay.result.steps[6].detail, /^Not found among Flipkart's reviews: none of the 3 reviews read has .* The date is not used for this row: neither the delivery screenshot nor the purchase screenshot shows a day\.$/);
  // Nothing to search with: no review by the user on the screenshot and no link to one review, a star rating only; then no campaign.
  const noLink = { ...ROW, shots: { ...ROW.shots, review: cell() } };
  const count = asked.length;
  const LIST = ['5.0 • Wonderful', 'Keeps water cold all day.', 'Test Reviewer Two, Test City', '7 Helpful', 'Verified Purchase · 3 days ago', '4.0 • Nice product', 'The lid is a bit tight.', 'Test Reviewer Three, Test Town', '2 Helpful'];
  const others = await go({ row: noLink, review: reviewReading(LIST, {}, { reviewer: REVIEWER }) });
  assert.deepEqual([others.result.steps[6].state, others.result.steps[6].detail], ['not-reached', "The review screenshot shows no review by the user (it shows 2 reviews, and which one is the user's could not be told: none is under the reviewer's name in the sheet), and there is no link to one review, so there is nothing to search with."]);
  const stars = await go({ row: noLink, review: reviewReading([BOTTLE, '4.0 •', `${REVIEWER} @ Certified Buyer 12 Sep, 2026`]) });
  assert.equal(stars.result.steps[6].detail, 'The review screenshot shows a star rating only, with no words to search for, and there is no link to one review, so there is nothing to search with.');
  const noCampaign = await go({ campaigns: [] });
  assert.deepEqual([noCampaign.result.steps[6].state, noCampaign.result.steps[6].detail, asked.length], ['not-reached', "The row uses no live campaign with a product read from Flipkart, so there is no product's page to find the review on.", count], 'Flipkart is not opened for any of these');
  // A reading stopped part way pauses the check at step 7, saying why; nothing is got around.
  const robot = await go({ answer: { ...READ, end: 'prevented', prevented: 'captcha', pages: 1, reviews: [made(1, '2026-10-10')], says: 'Flipkart prevented this check at page 2 of the reviews: it showed a robot check, which this dashboard never answers. The reviews of page 1 were kept.' } });
  assert.deepEqual([robot.result.paused, robot.result.steps[6].state, robot.result.steps[6].detail, robot.result.steps[7].state], [{ kind: 'flipkart-captcha', says: PAUSE_SAYS['flipkart-captcha'], step: 7 }, 'fail', 'Flipkart prevented this check at page 2 of the reviews: it showed a robot check, which this dashboard never answers. The reviews of page 1 were kept. The check paused here; nothing was got around.', 'waiting']);
  const slow = await go({ answer: { ...READ, end: 'slow', pages: 0, reviews: [], says: "Flipkart took too long to show the product's page, so no review was read." } });
  assert.deepEqual([slow.result.paused.kind, slow.result.paused.says], ['flipkart-slow', 'Flipkart is very slow to show its pages just now. Wait a while, then press "Carry on checking".']);
  const none = await go({ answer: { ...READ, end: 'none', pages: 0, reviews: [], says: "The product's page on Flipkart showed no way to see all its reviews, so they could not be read." } });
  assert.deepEqual([none.result.paused, none.result.steps[6].state, none.result.steps[6].detail], [null, 'fail', "The product's page on Flipkart showed no way to see all its reviews, so they could not be read."]);
});

test("step 7's search: found (the words and the name, with Flipkart's stars; for the review being typed or on My Reviews, that it is live), even among the pages read before Flipkart stopped the reading; two that fit, none picked; the words under another name or under \"Flipkart Customer\", never found; not found, saying a review under the name with other words, one posted before the day, or an order older than the oldest review read", async () => {
  const NOW = () => new Date('2026-10-13T05:00:00.000Z');
  const WORDS = { title: 'Terrific purchase', text: 'Keeps water cold all day and the grip is good.' };
  const made = (i, over = {}) => ({ id: `made-up-${i}`, name: `Made-up Reviewer ${i}`, stars: 4, title: 'Nice', text: `Made-up review number ${i}.`, dateSaid: '3 days ago', date: '2026-10-10', dateLatest: '2026-10-10', city: 'Test Town', certified: true, reviewFor: null, page: 1, ...over });
  const READ = { pid: 'TESTPID0000001', link: 'https://www.flipkart.com/test-brand-steel-bottle/product-reviews/itmtestbottle01?pid=TESTPID0000001&marketplace=FLIPKART', readAt: '2026-10-13T05:00:00.000Z', since: '2026-07-23', pages: 2, total: 40, end: 'date', stoppedAt: null, says: 'Made-up.', reviews: [made(1), made(2, { date: '2026-07-01', dateLatest: '2026-07-01', page: 2 })], product: { pid: 'TESTPID0000001', name: BOTTLE, rating: 4.2, ratings: 100, reviews: 40 } };
  const go = (reviews, opts = {}) => run(ROW, {}, { reviewer: REVIEWER, campaigns: [CAMPAIGN], now: NOW, reviews: async () => ({ ...READ, ...opts.answer, reviews }), ...opts });
  const step7 = (x) => [x.result.steps[6].state, x.result.steps[6].detail];
  const READING = 'Read 3 reviews of the product from 2 pages of "See all reviews" on Flipkart, newest first (back to 01-07-2026; the rows need reviews back to 23-07-2026). Reviews posted on or after the day the order was delivered (23-07-2026, on the delivery screenshot) can be the user\'s.';
  const mine = made(3, { name: REVIEWER, stars: 5, ...WORDS, dateSaid: '12 days ago', date: '2026-10-01', dateLatest: '2026-10-01', page: 2 });
  const found = await go([...READ.reviews, mine]);
  assert.deepEqual(step7(found), ['pass', `Found the review among Flipkart's public reviews (page 2 of "See all reviews"): its words match the review screenshot's, and it is under the name on the review screenshot. On Flipkart it has 5 stars, and it was posted 12 days ago (01-10-2026). ${READING}`]);
  assert.deepEqual([found.result.found.how, found.result.found.review, found.result.found.share], ['found', { id: 'made-up-3', name: REVIEWER, stars: 5, ...WORDS, dateSaid: '12 days ago', date: '2026-10-01', dateLatest: '2026-10-01', page: 2, pageLink: `${READ.link}&sortOrder=MOST_RECENT&page=2` }, 1]);
  const live = await go([...READ.reviews, mine], { review: reviewReading(REVIEW, { pending: true }) });
  assert.match(live.result.steps[6].detail, /\(01-10-2026\)\. Finding it among Flipkart's public reviews shows the review is live\. Read 3/);
  // Found before Flipkart stopped the reading: no pause; what Flipkart did is still said.
  const stopped = await go([...READ.reviews, mine], { answer: { end: 'prevented', prevented: 'error', stoppedAt: 3, says: 'Flipkart prevented this check at page 3 of the reviews: it showed an error. The reviews of pages 1 to 2 were kept.' } });
  assert.deepEqual([stopped.result.paused, stopped.result.steps[6].state], [null, 'pass']);
  assert.match(stopped.result.steps[6].detail, /under the name on the review screenshot\. On Flipkart it has 5 stars, and it was posted 12 days ago \(01-10-2026\)\. Flipkart prevented this check at page 3 of the reviews: it showed an error\. The reviews of pages 1 to 2 were kept\. The review was found among the pages read before that\. Reviews posted/);
  const twice = await go([...READ.reviews, mine, { ...mine, id: 'made-up-4', page: 1 }]);
  assert.deepEqual(step7(twice), ['fail', `2 reviews under the name on the review screenshot have the review screenshot's words, so which one is the user's could not be told; none is picked. Read 4 reviews of the product from 2 pages of "See all reviews" on Flipkart, newest first (back to 01-07-2026; the rows need reviews back to 23-07-2026). Reviews posted on or after the day the order was delivered (23-07-2026, on the delivery screenshot) can be the user's.`]);
  const other = await go([...READ.reviews, { ...mine, name: 'Test Reviewer Two' }]);
  assert.deepEqual(step7(other), ['fail', `The review screenshot's words match a review under another name (page 2 of "See all reviews"), not under the name on the review screenshot, so it is not counted as found. ${READING}`]);
  const customer = await go([...READ.reviews, { ...mine, name: 'Flipkart Customer' }]);
  assert.deepEqual(step7(customer), ['fail', `The review screenshot's words match a review (page 2 of "See all reviews"), but Flipkart shows no name for it ("Flipkart Customer"), so the name could not be checked; it is not counted as found. ${READING}`]);
  // Not found: never on the name alone; a review posted before the day does not count.
  const nameOnly = await go([...READ.reviews, { ...mine, title: 'Nice', text: 'Made-up review with other words entirely.' }]);
  assert.deepEqual(step7(nameOnly), ['fail', `Not found among Flipkart's reviews: none of the 2 reviews that can be posted on or after 23-07-2026 has the review screenshot's words under the name on the review screenshot. A review under that name is there, but its words do not match. ${READING}`]);
  const early = await go([...READ.reviews, { ...mine, date: '2026-07-10', dateLatest: '2026-07-10' }]);
  assert.match(step7(early)[1], /^Not found among Flipkart's reviews: the only review that can be posted on or after 23-07-2026 does not have the review screenshot's words under the name on the review screenshot\. A review with these words under that name was posted before 23-07-2026, so it does not count\. Read 3 reviews/);
  const none = await go([made(2, { date: '2026-07-01', dateLatest: '2026-07-01' })], { answer: { end: 'limit', since: null } });
  assert.match(step7(none)[1], /^Not found among Flipkart's reviews: none of the reviews read can be posted on or after 23-07-2026\. Read 1 review/);
  // The order is older than the oldest review read ("1 month ago" only roughly a day): the review may be among older ones.
  const month = { dateSaid: '1 month ago', date: '2026-09-13', dateLatest: '2026-09-28' };
  const older = await go([made(1), made(2, month)], { answer: { end: 'limit', since: null } });
  assert.deepEqual(step7(older), ['fail', 'Not found among Flipkart\'s reviews: none of the 2 reviews that can be posted on or after 23-07-2026 has the review screenshot\'s words under the name on the review screenshot. The order was delivered on 23-07-2026, before the oldest review read, so the review may be among older reviews not read yet. Read 2 reviews of the product from 2 pages of "See all reviews" on Flipkart, newest first (back to about 13-09-2026, the most read at one time). Reviews posted on or after the day the order was delivered (23-07-2026, on the delivery screenshot) can be the user\'s.']);
  // Flipkart shows fewer reviews than it counts: all it shows were read, and older ones cannot be.
  const shown = await go([made(1), made(2, month)], { answer: { end: 'last page', since: null, total: 1519 } });
  assert.equal(step7(shown)[1], 'Not found among Flipkart\'s reviews: none of the 2 reviews that can be posted on or after 23-07-2026 has the review screenshot\'s words under the name on the review screenshot. The order was delivered on 23-07-2026, before the oldest review Flipkart shows, so the review may be among the older ones it does not show. Read 2 reviews of the product from 2 pages of "See all reviews" on Flipkart, newest first (all the reviews Flipkart shows, 2 of the 1,519 it counts, back to about 13-09-2026). Reviews posted on or after the day the order was delivered (23-07-2026, on the delivery screenshot) can be the user\'s.');
  const all = await go([made(1), made(2, month)], { answer: { end: 'last page', since: null, total: 2 } });
  assert.match(step7(all)[1], /under the name on the review screenshot\. Read 2 reviews of the product from 2 pages of "See all reviews" on Flipkart, newest first \(all the reviews Flipkart shows, back to about 13-09-2026\)\. Reviews posted/);
});

test("how far back Flipkart's reviews are read, from what each row's last check kept: step 7's own day, else the day on the Delivered line, else the earliest order day, a day with no year being the most recent such day by the time of the check; none when it found none", () => {
  const at = '2026-10-13T05:00:00.000Z';
  assert.equal(keptDay({ finishedAt: at, reviewsFrom: { day: '2026-07-23', from: 'delivery', said: '…' }, delivery: { deliveredText: 'Delivered, Thu 9th Jul' } }), '2026-07-23');
  assert.equal(keptDay({ finishedAt: at, reviewsFrom: { day: null, from: null, said: '…' } }), null);
  assert.equal(keptDay({ finishedAt: at, delivery: { delivered: true, deliveredText: 'Delivered, Thu 9th Jul' }, order: { dates: ['05-07-2026'] } }), '2026-07-09', 'a check made before step 7: its delivery day');
  assert.equal(keptDay({ finishedAt: at, delivery: { delivered: true, deliveredText: 'Delivered before time' }, order: { dates: ['08-07-2026', '05-07, with no year shown'] } }), '2026-07-05', 'no delivery day: the earliest order day');
  assert.equal(keptDay({ finishedAt: '2026-01-05T05:00:00.000Z', delivery: { delivered: true, deliveredText: 'Delivered, Fri 25th Dec' } }), '2025-12-25', 'not after the day of the check');
  assert.equal(keptDay({ finishedAt: at, delivery: { delivered: true, deliveredText: 'Delivered (its date could not be read)' }, order: { dates: [] } }), null);
  assert.deepEqual([keptDay(null), keptDay(undefined)], [null, null], 'a row not checked yet');
});

test("what the boxes and the comparison show is cleaned, never what is compared: a Delivered line whose date is not a real date says only Delivered; each date once; a number with no rupee sign or label only when it is the sheet's amount, and an amount with no label not again beside its label; the product's name without the marks and the price read around it", async () => {
  const odd = await run(ROW, {}, { campaigns: [CAMPAIGN], delivery: deliveryReading(['© Delivered Fri, 2l5 O', BOTTLE, `Order #${ID}`]) });
  assert.deepEqual([odd.result.steps[3].state, odd.result.steps[3].detail], ['pass', 'It says "Delivered" (its date could not be read). Order ID: the same. Order date: not shown. Amount: not shown. Product: one of the campaign\'s products.']);
  assert.deepEqual([odd.result.delivery.deliveredText, odd.result.comparison.at(-1).delivery], ['Delivered (its date could not be read)', 'Delivered (its date could not be read)']);
  const plain = await run(ROW, {}, { campaigns: [CAMPAIGN] });
  const lines = ['co. | Test Brand Steel Bottle 1 L, Bl... %329', `Order #${ID}`, 'Your Order has been placed, Mon 20th Jul', 'Order placed on Mon 20th Jul', '64', '7.12 5G+', '349', 'Price details', 'Listing price ₹999', 'Selling price ⓘ ₹329', 'Total fees ⌄ ₹30', 'Other discount ⌄ -₹10', 'Total amount ₹349'];
  const messy = await run(ROW, {}, { campaigns: [CAMPAIGN], read: reading(lines) });
  const o = messy.result.order;
  assert.deepEqual([o.dates, o.amounts.map((a) => [a.value, a.label]), o.product], [['20-07, with no year shown'], [[999, 'listing price'], [329, 'selling price'], [30, 'total fees'], [10, 'other discount'], [349, 'total amount']], 'Test Brand Steel Bottle 1 L, Bl...']);
  assert.deepEqual([messy.result.steps[1].state, messy.result.steps[1].detail], [plain.result.steps[1].state, plain.result.steps[1].detail], 'compared as before');
  // With no campaign, the name compared with the sheet's is shown cleaned in the comparison too.
  const named = await run(ROW, {}, { delivery: deliveryReading(['Delivered, Thu 23rd Jul', '= Test Brand Steel Bottle 1 L, Blue ₹329']) });
  assert.deepEqual([named.result.delivery.details.product.state, named.result.delivery.product, named.result.comparison[3].delivery], ['same', 'Test Brand Steel Bottle 1 L, Blue', 'The same: "Test Brand Steel Bottle 1 L, Blue"']);
});

test("no one logged in to Google, a login using the Live Amazon Browser, or Google's login page pauses the check at its step, saying why; nothing more is opened, and the row can be checked again; Stop stops it", async () => {
  assert.deepEqual(Object.fromEntries(Object.entries(PAUSE_SAYS).filter(([k]) => k.startsWith('google-'))), Object.fromEntries(Object.entries(AMAZON_PAUSE_SAYS).filter(([k]) => k.startsWith('google-'))), "the Amazon checker's words");
  // Flipkart's robot check and refused page, in the Amazon checker's words for Amazon's.
  assert.deepEqual([PAUSE_SAYS['flipkart-captcha'], PAUSE_SAYS['flipkart-blocked']], [AMAZON_PAUSE_SAYS.captcha.replace('Amazon', 'Flipkart'), AMAZON_PAUSE_SAYS.blocked.replace('Amazon', 'Flipkart')]);
  const out = await run(ROW, { delivery: { pause: 'google-out' } });
  assert.deepEqual(out.asked, ['order', 'delivery'], 'nothing more is opened');
  assert.deepEqual(out.result.paused, { kind: 'google-out', says: PAUSE_SAYS['google-out'], step: 3 });
  assert.deepEqual([out.result.steps[2].state, out.result.steps[2].detail], ['fail', 'No one is logged in to Google, so the screenshots on Google Drive cannot be downloaded. The check paused here, before the delivery screenshot was downloaded; nothing was got around.']);
  assert.deepEqual(out.result.steps.slice(3).map((s) => s.state), ['waiting', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting']);
  assert.deepEqual(out.events.slice(-2).map((e) => e.says ?? e.event), [`Paused: ${PAUSE_SAYS['google-out']}`, 'done']);
  const waiting = 'The Google login is being checked, so the Google Drive screenshots were not downloaded yet. Wait a moment, then try again.';
  const busy = await run(ROW, { order: { pause: 'login-busy', says: waiting } });
  assert.deepEqual([busy.result.paused.kind, busy.result.paused.says, busy.result.steps[0].detail, busy.read], ['login-busy', waiting, 'The Google login is being checked, so the Google Drive screenshots were not downloaded yet. The check paused here, before the purchase screenshot was downloaded; nothing was got around.', []]);
  const signin = await run(ROW, { reviewShot: { pause: 'google-signin' } });
  assert.deepEqual([signin.result.paused.kind, signin.result.steps[4].detail], ['google-signin', 'Google asked to log in, so the screenshots on Google Drive cannot be downloaded. The check paused here, before the review screenshot was downloaded; nothing was got around.']);
  const stop = new AbortController();
  stop.abort();
  const stopped = await run(ROW, {}, { signal: stop.signal });
  assert.deepEqual([stopped.result.stopped, stopped.asked, stopped.result.steps.filter((s) => s.state !== 'waiting')], [true, [], []]);
});
