// A Flipkart row's check (flipkart/check.js), with a pretend screenshots.js
// and a pretend reader: its steps are the Amazon check's, in the same order,
// changed for Flipkart; the steps that get the screenshots run, and step 2
// reads the purchase screenshot and compares it with the sheet, in the Amazon
// words; every other step comes in a later step, and the row gets no Status.
// A screenshot that cannot be had says why in the Amazon words; a pause stops
// the check at its step. Made-up rows and made-up readings only; nothing is
// downloaded and no picture is read.
// Run: node test/flipkart-check.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck, STEP_NAMES, PAUSE_SAYS, newCheckId } from '../flipkart/check.js';
import { CHECK_ID } from '../flipkart/store.js';
import { DEFAULT_MARKS } from '../flipkart/settings.js';
import { orderIdsIn, datesIn, amountsIn } from '../flipkart/screen-text.js';
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
  const readOrder = async (files, o) => (read.push({ files, want: o?.want }), opts.read ?? reading(PURCHASE));
  const result = await runCheck({ row, screenshots, readOrder, emit: (e) => events.push(e), ...opts });
  return { result, events, asked: screenshots.asked, read };
}

test("a check's steps are the Amazon check's, in the same order, changed for Flipkart: the screenshot steps and step 2 run, each shown as it runs; every other step comes in a later step; the row gets no Status", async () => {
  assert.deepEqual(STEP_NAMES, SCREEN_STEPS, 'the screen names them the same');
  assert.deepEqual([STEP_NAMES[0], STEP_NAMES[1], STEP_NAMES[2], STEP_NAMES[3], STEP_NAMES[8]], [AMAZON_STEPS[1], AMAZON_STEPS[2], AMAZON_STEPS[3], AMAZON_STEPS[4], AMAZON_STEPS[9]], "the screenshots' steps and the last one in the Amazon words");
  const { result, events, asked } = await run(ROW, {});
  assert.deepEqual(asked, ['order', 'delivery', 'reviewShot']);
  assert.deepEqual(result.steps.map((s) => [s.state, s.detail]), [['pass', 'Opened the purchase screenshot.'], ['pass', 'Order ID: the same. Order date: the same. Amount: the same. Product: the same.'], ['pass', 'Opened the delivery screenshot.'], ['later', null], ['pass', 'Opened the review screenshot.'], ['later', null], ['later', null], ['later', null], ['later', null]]);
  const said = (e) => (e.event === 'step' ? `step ${e.step.n} ${e.step.state}` : e.event === 'action' ? `action ${e.says}` : e.event);
  assert.deepEqual(events.map(said), ['started', 'step 1 running', 'action Opening the purchase screenshot', 'step 1 pass', 'step 2 running', 'action Reading the purchase screenshot', 'step 2 pass', 'step 3 running', 'action Opening the delivery screenshot', 'step 3 pass', 'step 4 later', 'step 5 running', 'action Opening the review screenshot', 'step 5 pass', 'step 6 later', 'step 7 later', 'step 8 later', 'step 9 later', 'action Done. The other steps come in a later step, so this row has no Status yet.', 'done']);
  assert.deepEqual([result.paused, result.stopped, 'status' in result, 'type' in result, 'note' in result], [null, false, false, false, false], 'no Status, Type or Note');
  assert.match(result.checkId, CHECK_ID);
  assert.match(newCheckId(new Date('2026-10-12T12:30:00Z')), /^c20261012123000[0-9a-f]{6}$/);
  assert.equal((await run(ROW, { order: { files: ['/made-up/a.png', '/made-up/b.png'], problems: [] } })).result.steps[0].detail, 'Opened 2 purchase screenshots.');
});

test("a screenshot that cannot be had says why, in the Amazon words; an empty cell, words instead of a screenshot and a missing column are said too; the review link's picture is opened when the review screenshot cell has none; a purchase screenshot not opened is not read", async () => {
  const { result, read } = await run(ROW, {
    order: { files: [], problems: [{ link: drive('1TestOrder01'), kind: 'drive', site: 'Google Drive', says: 'the Google account logged in to the dashboard has no access to the file', noAccess: true }] },
    delivery: { files: [], problems: [{ link: 'https://pictures.example.com/x.png', kind: 'allowed', site: 'pictures.example.com', says: "the website is not on the dashboard's list of picture websites" }] },
    reviewShot: { files: [], problems: [{ link: drive('1TestReview01'), kind: 'busy', site: 'Google Drive', says: 'Google Drive did not answer, so it could not be downloaded' }] },
  });
  assert.deepEqual(
    [0, 1, 2, 4].map((i) => [result.steps[i].state, result.steps[i].detail]),
    [
      ['fail', 'The purchase screenshot is on Google Drive, but the Google account logged in to the dashboard has no access to the file.'],
      ['not-reached', 'The purchase screenshot could not be opened, so it was not read.'],
      ['fail', "The delivery screenshot is on pictures.example.com, but the website is not on the dashboard's list of picture websites."],
      ['fail', 'The review screenshot is on Google Drive, but Google Drive did not answer, so it could not be downloaded.'],
    ],
  );
  assert.deepEqual([read, result.order], [[], null], 'nothing read');
  const odd = { ...ROW, shots: { order: cell(), delivery: cell({ text: 'Sent on WhatsApp. See chat' }), review: cell({ links: [drive('1TestReviewPicture01')] }), reviewShot: cell() } };
  const said = await run(odd, {});
  assert.deepEqual(said.asked, ['review'], "only a cell with a picture is opened: the review link's, since the review screenshot cell has none");
  assert.deepEqual([0, 1, 2, 4].map((i) => said.result.steps[i].detail), ['The cell is empty.', 'There is no purchase screenshot to read.', 'The cell says "Sent on WhatsApp; See chat" instead of holding a screenshot.', 'Opened the review screenshot.']);
  const noColumn = await run(ROW, {}, { has: { deliveryShot: false } });
  assert.deepEqual([noColumn.result.steps[2].detail, noColumn.asked], ['The file has no delivery screenshot column.', ['order', 'reviewShot']]);
  const noPurchase = await run(ROW, {}, { has: { orderShot: false } });
  assert.deepEqual([noPurchase.result.steps[0].detail, noPurchase.result.steps[1].state, noPurchase.result.steps[1].detail], ['The file has no purchase screenshot column.', 'not-reached', 'The file has no purchase screenshot column, so there is nothing to read.']);
  const broke = await run(ROW, { delivery: new Error('made-up') });
  assert.deepEqual([broke.result.steps[2].state, broke.result.steps[2].detail, broke.result.steps[4].state], ['fail', 'Something went wrong on this computer while opening the delivery screenshot. Check this row again.', 'pass'], 'that step says so, and the others still run');
  const readBroke = await run(ROW, {}, { readOrder: async () => { throw new Error('made-up'); } });
  assert.deepEqual([readBroke.result.steps[1].state, readBroke.result.steps[1].detail, readBroke.result.steps[2].state], ['fail', 'Something went wrong on this computer while reading the purchase screenshot. Check this row again.', 'pass']);
});

test("step 2, as the Amazon checker's step 3: the purchase screenshot is read on this computer, and the order ID, the order date (only when the file has that column), the amount and the product are each the same, different or not shown, in the Amazon words; what it says is kept for the row's page", async () => {
  // Everything the same, the product being one of the campaign's, by its real name read from Flipkart.
  const same = await run(ROW, {}, { campaigns: [CAMPAIGN] });
  assert.deepEqual([same.result.steps[1].state, same.result.steps[1].detail], ['pass', "Order ID: the same. Order date: the same. Amount: the same. Product: one of the campaign's products."]);
  assert.deepEqual(same.read.map((r) => [r.files, r.want.orderId, r.want.amount, r.want.tolerance, r.want.allowance, typeof r.want.product]), [[['/made-up/picture.png'], ID, 349, DEFAULT_MARKS.amountDifferenceRupees, DEFAULT_MARKS.feeAllowanceRupees, 'function']], "read with what the sheet gives, so a picture that lacks it is read again the other ways");
  const o = same.result.order;
  assert.deepEqual([o.ok, o.orderIds, o.dates, o.amounts.filter((a) => !a.skip).map((a) => [a.value, a.label]), o.product, o.details.product.product.pid], [true, [ID], ['20-07, with no year shown'], [[999, 'listing price'], [329, 'selling price'], [349, 'total amount']], BOTTLE, 'TESTPID0000001']);
  assert.ok(o.text.includes(`Order #${ID}`) && o.confidence === 90 && o.wordCount === 40 && o.hindi === true, 'everything read from it, and how');
  assert.deepEqual(same.events.find((e) => e.event === 'step' && e.step.n === 2 && e.step.state === 'pass').partial, { order: o }, 'shown on the row\'s page as soon as it is read');
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
  const fees = await run({ ...ROW, amount: { text: '270', value: 270 } }, {}, { read: reading([`Order #${ID}`, BOTTLE, 'Selling price @ २289', 'Total fees v 210', 'Other discount v -%15', 'Total amount FI704+14', 'Total amount २८०70']) });
  assert.match(fees.result.steps[1].detail, /Amount: the same \(₹289 with ₹10 of fees, less the money taken off\)\./, 'a total read two ways is not clear, and the price details add up to the sheet\'s amount');
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

test("no one logged in to Google, a login using the Live Amazon Browser, or Google's login page pauses the check at its step, saying why; nothing more is opened, and the row can be checked again; Stop stops it", async () => {
  assert.deepEqual(PAUSE_SAYS, Object.fromEntries(Object.entries(AMAZON_PAUSE_SAYS).filter(([k]) => k.startsWith('google-'))), "the Amazon checker's words");
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
