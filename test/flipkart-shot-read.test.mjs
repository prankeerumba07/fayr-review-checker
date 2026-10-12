// Reading a Flipkart purchase screenshot, copied from the Amazon checker and
// changed only for Flipkart's screens: its order IDs (OD and 18 digits), its
// dates, its prices, fees and totals (SuperCoins too), and its product names.
// The pure rules first, then the made-up drawn pictures read by Tesseract on
// this computer, then Flipkart's passing marks in its own settings.
// Run: node test/flipkart-shot-read.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { orderIdsIn, partialOrderId, datesIn, sameDay, amountsIn, matchingAmount, amountMatch, totalRead, priceDetailsShown, totalShown, rupees, productShown, productNames, nameStartShown, nameLineStarting } from '../flipkart/screen-text.js';
import { readOrderShot, SECOND_LOOKS } from '../flipkart/shot-read.js';
import { readLines, LIGHT_LETTERS } from '../flipkart/ocr.js';
import { DEFAULT_MARKS, checkMarks, SettingsError } from '../flipkart/settings.js';
import { createFlipkartStore } from '../flipkart/store.js';
import { checkSettings } from '../amazon/settings.js';
import { orderId } from './fixtures/flipkart/make-flipkart.mjs';
import { BOTTLE, LUNCH_BOX } from './fixtures/flipkart/make-purchase-screenshots.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'flipkart');
const temps = [];
after(() => Promise.all(temps.map((d) => rm(d, { recursive: true, force: true }))));
const ID = orderId(2);

test("order IDs as Flipkart writes them, OD and 18 digits: its O read as a zero, letters read for digits put right, a space read inside; too few digits is none; only part of one is the sheet's when the part is in it", () => {
  assert.deepEqual(orderIdsIn([`Order #${ID}`]), [ID]);
  assert.deepEqual(orderIdsIn(['Order #0D100000000000000002']), [ID], 'its O read as a zero');
  assert.deepEqual(orderIdsIn(['My Orders > OD1000000000000O0O02']), [ID], 'O read for 0');
  assert.deepEqual(orderIdsIn(['Order #OD1000 0000 0000 0000 02 |']), [ID], 'a space read inside');
  assert.deepEqual(orderIdsIn(['Order #ODIOOOOOOOOOOOOOOOO2']), [], 'too few real digits to be sure');
  assert.deepEqual(orderIdsIn(['OD10000000000000000', 'OD1000000000000000002', 'ODISSA ROAD', 'Order can be tracked by 9000000001.']), [], 'one digit too few or too many, a word, or a phone number is not an order ID');
  assert.deepEqual(orderIdsIn([`${ID} and ${orderId(3)}`, `again #${ID}`]), [ID, orderId(3)], 'every one, each once, in order');
  assert.deepEqual(partialOrderId([`Order #OD10000000000000 [cut]`], ID), { digits: 14 }, 'cut off at the edge');
  assert.equal(partialOrderId(['Order can be tracked by 0000000000.'], ID), null, 'a phone number, ten digits, is never part of one');
  assert.equal(partialOrderId(['OD10000000000099999'], ID), null, 'digits that are not in the sheet\'s');
});

test("dates: the day the order was placed, as Flipkart writes it with no year, is the order's; a delivery's day never is", () => {
  const d = datesIn(['Order Confirmed', 'Your Order has been placed, Mon 20th Jul', 'Delivery by Thu 23rd Jul', 'Order Confirmed, Today', 'Order Confirmed', '21 Jul 2026']);
  assert.deepEqual(d.map((x) => [x.text, x.day, x.labelled, x.delivery]), [
    ['20th Jul', null, true, false],
    ['23rd Jul', null, false, true],
    ['21 Jul 2026', '2026-07-21', true, false],
  ], 'the line above labels only a date of its own line\'s, when it has none itself');
  assert.equal(sameDay(d[0], '2026-07-20'), true, 'without its year: the day and the month');
  assert.equal(sameDay(d[0], '2026-07-21'), false);
  assert.deepEqual(datesIn([`Order #${ID}`, 'Listing price ₹999']), []);
});

test("prices: Flipkart's labels with the marks between them and the amount, and the rupee sign read as almost anything after them; fees and money taken off are never the order's amount; the listing price is the price before the discount; SuperCoins after the total", () => {
  const a = amountsIn(['Listing price २999', 'Selling price © %329', 'Special price @ F489', 'Total fees y 30', 'Other discount v -%10', 'Total amount FI270+14', 'Paid $349 by Credit Card', 'Paid By UPI']);
  assert.deepEqual(a.map((x) => [x.value, x.label, x.kind, x.coins ?? null]), [
    [999, 'listing price', null, null],
    [329, 'selling price', null, null],
    [489, 'special price', null, null],
    [30, 'total fees', 'fee', null],
    [10, 'other discount', 'off', null],
    [270, 'total amount', null, 14],
    [14, 'supercoins', 'off', null],
    [349, 'paid', null, null],
  ]);
  assert.deepEqual(amountsIn(['Total amount 2449 + O50']).map((x) => [x.value, x.alts, x.coins ?? null]), [[2449, [449], 50], [50, [], null]], 'a rupee sign read as a digit: the number without it too');
  assert.deepEqual(amountsIn(['Other discount v -2%15']).map((x) => [x.value, x.label, x.kind]), [[15, 'other discount', 'off']], 'the rupee sign read as "2%"');
  assert.deepEqual(amountsIn(['Get 5% off', 'Up to ₹5 Lakh', 'Test Phone at ₹9,999*', 'Get ₹1,000 back', '₹500 off', '12.50 KB/s']).map((x) => [x.value, Boolean(x.lone)]), [[12.5, true]], 'a percentage, an offer and an advert are never amounts; a number with paise and no rupee sign counts only when it is the sheet\'s');
  const withDetails = amountsIn(['₹349', 'Selling price ₹329', 'Total amount ₹349']);
  assert.deepEqual(withDetails.map((x) => [x.value, x.label, Boolean(x.lone)]), [[349, null, true], [329, 'selling price', false], [349, 'total amount', false]], "with Flipkart's price details shown, a price with no label is an advert's or another product's");
  assert.equal(amountsIn(['₹349'])[0].lone ?? false, false, 'with none, a price with a rupee sign counts, as on Amazon');
  assert.deepEqual([priceDetailsShown(withDetails), priceDetailsShown(amountsIn(['₹349'])), totalShown(amountsIn(['Total fees ₹10'])), totalShown(withDetails)], [true, false, false, true], '"Total fees" is never the total');
  assert.equal(rupees(349), '₹349');
  assert.equal(rupees(349.5), '₹349.50');
});

test("the sheet's amount, the way staff read Flipkart's price details: the total itself (first), with the SuperCoins used, or the item's price with the fees (each read as it is or as it may really be) less the money taken off; a total read clearly is what is different", () => {
  const near = (lines, amount, opts = {}) => amountMatch(amountsIn(lines), amount, { tolerance: 1, allowance: 5, ...opts });
  assert.deepEqual(near(['₹349', 'Selling price ₹329', 'Total amount ₹349'], 349), { value: 349, label: 'total amount', how: 'same', parts: [] }, 'the total first');
  assert.deepEqual(near(['Total amount %838+O46'], 884), { value: 838, label: 'total amount', how: 'with supercoins', parts: [{ value: 46, kind: 'coins' }] });
  assert.deepEqual(near(['Total amount %838+O46'], 838).how, 'same', 'or the money paid alone');
  assert.deepEqual(near(['Selling price @ २289', 'Total fees v 210', 'Other discount v -%15', 'Total amount FI704+14'], 270), { value: 289, label: 'selling price', how: 'with fees', parts: [{ value: 10, kind: 'fee' }, { value: 15, kind: 'off' }, { value: 14, kind: 'off' }] }, '"₹10" read as "210", and the SuperCoins taken off');
  assert.deepEqual(near(['Special price ₹289', 'Total fees ₹9'], 298).how, 'with fees');
  assert.deepEqual(near(['Selling price ₹329'], 333).how, 'fees not shown', 'no total shown: a price up to the allowance below');
  assert.equal(near(['Selling price ₹329', 'Total amount ₹349'], 333), null, 'with the total shown, it is the total');
  assert.equal(matchingAmount(amountsIn(['Total fees ₹349']), 349, 1), null, 'a fee is never the amount');
  assert.deepEqual(totalRead(amountsIn(['Total amount ₹349', 'Paid ₹349 by UPI'])), { value: 349, label: 'total amount' });
  assert.equal(totalRead(amountsIn(['Total amount FI704+14', 'Total amount २८०70'])), null, 'two readings of the total that disagree: not clear');
  assert.deepEqual(totalRead(amountsIn(['Special price %489', 'Total fees ₹10', 'Total amount 2449 + O50'])), { value: 449, label: 'total amount' }, 'the reading the price details add up to');
});

test("product names: a name ending with \"- Flipkart\" names the product, not the shop; a name cut short shows its start; the brand written over and over on the product's picture is never another product's name", () => {
  assert.deepEqual(productNames('Hair Removal Cream - Flipkart'), ['Hair Removal Cream']);
  assert.equal(productShown('Test Brand Steel Bottle - Flipkart', [BOTTLE]).share, 1);
  assert.equal(nameStartShown(['Test Brand Steel Bottle 1 L, Bl...'], BOTTLE, { lead: 2 }).full, 6);
  assert.equal(nameLineStarting(['॥ TESTBRAND TESTBRAND| TESTBRAND'], ['TestBrand']), null);
  assert.equal(nameLineStarting(['Testbrand Lunch Box 3 Containers'], ['TestBrand']), 'Testbrand Lunch Box 3 Containers');
});

test('the made-up purchase screenshots, read by Tesseract on this computer: the order ID, the day it was placed, the prices with their labels, the SuperCoins; adverts and offers are never amounts', async () => {
  assert.deepEqual(SECOND_LOOKS, [{ scale: 2 }, { psm: '11' }, { light: true, idsOnly: true }, { light: true, scale: 3, idsOnly: true }], "the Amazon checker's other ways that need no hidden Chrome, then the way for light letters, as the picture is and enlarged, only for order IDs");
  const o = await readOrderShot([join(FIX, 'purchase-steel-bottle.png')], { want: { orderId: ID, amount: 349, tolerance: 1, allowance: 5 } });
  assert.equal(o.ok, true, o.problem);
  assert.ok(o.confidence >= 60 && o.wordCount >= 30, `${o.confidence} ${o.wordCount}`);
  assert.deepEqual(o.orderIds, [ID]);
  assert.deepEqual(o.dates.map((d) => [d.month, d.date, d.labelled, d.delivery]), [[7, 20, true, false], [7, 23, false, true]]);
  assert.deepEqual(o.amounts.filter((a) => a.label).map((a) => [a.value, a.label, a.kind]), [[999, 'listing price', null], [329, 'selling price', null], [30, 'total fees', 'fee'], [10, 'other discount', 'off'], [349, 'total amount', null]]);
  assert.ok(!o.amounts.some((a) => [1000, 9999].includes(a.value)), 'the offer and the advert are not amounts');
  assert.deepEqual(amountMatch(o.amounts, 349, { tolerance: 1, allowance: 5 }), { value: 349, label: 'total amount', how: 'same', parts: [] });
  assert.ok(o.texts.some((t) => t.includes(BOTTLE)), 'the product\'s name');
  const coins = await readOrderShot([join(FIX, 'purchase-lunch-box-coins.png')], {});
  assert.deepEqual([coins.ok, coins.orderIds], [true, [orderId(3)]]);
  assert.ok(coins.texts.some((t) => t.includes(LUNCH_BOX)));
  assert.deepEqual(amountMatch(coins.amounts, 499, { tolerance: 1, allowance: 5 }).how, 'with supercoins', '₹449 and 50 SuperCoins');
  assert.deepEqual(totalRead(coins.amounts), { value: 449, label: 'total amount' });
  const missing = await readOrderShot([join(FIX, 'no-such-picture.png')], {});
  assert.deepEqual([missing.ok, missing.problem], [false, 'it could not be read on this computer'], 'a picture that cannot be read says so, and nothing throws');
});

test("an order ID in small light grey letters under the product's name, with dark adverts below, as Flipkart's app shows it: Tesseract's usual way drops it, and the purchase screenshot is read again with the letters told from the background part by part, which finds it", async () => {
  const file = join(FIX, 'purchase-light-order-id.png');
  assert.deepEqual(orderIdsIn((await readLines(file)).lines), [], 'the usual way misses it, as it did on real screenshots');
  const o = await readOrderShot([file], { want: { orderId: orderId(6) } });
  assert.equal(o.ok, true, o.problem);
  assert.deepEqual(o.orderIds, [orderId(6)]);
  assert.deepEqual([orderIdsIn(o.texts), orderIdsIn(o.idTexts)], [[], [orderId(6)]], 'read the way for light letters, whose words are only looked at for order IDs');
  assert.ok(o.texts.some((t) => t.includes(LUNCH_BOX)), "the product's name");
  const asked = [];
  await readLines(file, {
    light: true,
    tesseract: async (cmd, args) => {
      asked.push(args);
      return '';
    },
  });
  assert.deepEqual(asked[0].slice(-3), ['-c', 'thresholding_method=2', 'tsv'], "Tesseract's own way, part by part (Sauvola)");
  assert.deepEqual(LIGHT_LETTERS, ['-c', 'thresholding_method=2']);
});

test("Flipkart's passing marks are in its own settings, starting with the Amazon checker's values and checked with the same words; they are written there the first time, and a wrong one is said plainly", async () => {
  const amazon = checkSettings({}).passingMarks;
  assert.deepEqual(DEFAULT_MARKS, { productNameShare: amazon.productNameShare, amountDifferenceRupees: amazon.amountDifferenceRupees, feeAllowanceRupees: amazon.feeAllowanceRupees });
  assert.deepEqual(checkMarks({ amountDifferenceRupees: 2 }), { ...DEFAULT_MARKS, amountDifferenceRupees: 2 });
  assert.throws(() => checkMarks({ productNameShare: 2 }), (e) => e instanceof SettingsError && e.message === 'In Flipkart\'s settings file, data/flipkart/settings.json, "passingMarks.productNameShare" must be a share from 0.01 to 1 (0.8 means 80% of the words), without quotes.');
  assert.throws(() => checkMarks({ colour: 1 }), /has a mark this dashboard does not know: "colour"/);
  assert.throws(() => checkMarks('0.8'), /must be a group in curly brackets/);
  const dir = mkdtempSync(join(tmpdir(), 'arc-flipkart-marks-'));
  temps.push(dir);
  const store = createFlipkartStore(dir);
  await store.setColumnChoice({ orderId: 'Order ID' });
  assert.deepEqual(await store.passingMarks(), DEFAULT_MARKS);
  const file = join(dir, 'flipkart', 'settings.json');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { columnChoice: { orderId: 'Order ID' }, passingMarks: DEFAULT_MARKS }, 'written in Flipkart\'s own settings, beside what was there');
  writeFileSync(file, JSON.stringify({ passingMarks: { ...DEFAULT_MARKS, feeAllowanceRupees: 0 } }));
  assert.equal((await store.passingMarks()).feeAllowanceRupees, 0, 'changed there, used as changed');
  writeFileSync(file, JSON.stringify({ passingMarks: { feeAllowanceRupees: 'five' } }));
  await assert.rejects(store.passingMarks(), SettingsError);
});
