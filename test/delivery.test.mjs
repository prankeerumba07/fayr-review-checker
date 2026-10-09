// Reading a delivery screenshot: "Delivered", its date, the order id and the product's name.
// Run: node test/delivery.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDelivery, readDeliveryScreenshot } from '../amazon/delivery-read.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'amazon');
const RACK = 'Test Brand Folding Garment Rack with Wheels';
const BOTTLE = 'Test Brand Insulated Steel Water Bottle, 1 Litre, Black';

test('"Delivered", in English and Hindi, with its date when shown', () => {
  assert.deepEqual(parseDelivery(['Your Orders', 'Delivered 3 March']), { delivered: true, deliveredText: 'Delivered 3 March', deliveredHow: 'word', deliveredDate: '3 March', deliveredDay: null, deliveredOn: { day: null, year: null, month: 3, date: 3 }, orderId: null, orderIds: [], product: null });
  const year = parseDelivery(['Delivered on 3 March 2026']);
  assert.equal(year.deliveredDate, '3 March 2026');
  assert.equal(year.deliveredDay, '2026-03-03', 'a day only when the year is shown');
  assert.equal(parseDelivery(['Delivered today']).deliveredDate, 'today');
  assert.equal(parseDelivery(['Delivered yesterday']).deliveredDate, 'yesterday');
  assert.equal(parseDelivery(['Delivered']).deliveredDate, null);
  assert.equal(parseDelivery(['© Delivered 3 March']).delivered, true, 'a stray mark read before the word');
  assert.equal(parseDelivery(['डिलीवर किया गया']).delivered, true);
  assert.equal(parseDelivery(['3 मार्च को डिलीवर हो गया']).delivered, true);
});

test('never "Delivered" for not delivered, out for delivery, arriving or shipped', () => {
  for (const line of ['Not delivered', 'Undelivered', 'Out for delivery', 'Arriving tomorrow', 'Arriving 5 March', 'Will be delivered by 5 March', 'Delivery by Thursday', 'Shipped', 'Expected delivery 5 March', 'Not Delivered: address not found', "We'll drop the order off at your door.", 'Cancel items']) {
    assert.equal(parseDelivery(['Your Orders', line]).delivered, false, line);
  }
});

test('"Delivered" read with a letter lost or changed, and the signs Amazon shows only once an order was delivered when the word itself is off the screenshot', () => {
  // A letter lost or changed in reading: still the word.
  assert.deepEqual([parseDelivery(['Delivere 20 August']).delivered, parseDelivery(['Delivere 20 August']).deliveredDate, parseDelivery(['Delivere 20 August']).deliveredHow], [true, '20 August', 'word']);
  assert.equal(parseDelivery(['Dellvered on 3 March 2026']).deliveredDay, '2026-03-03');
  for (const line of ['Delivery 3 March', 'Deliver by 3 March', 'Delivering today', 'We were unable to deliver your package']) assert.equal(parseDelivery([line]).delivered, false, line);
  // The word is off the screenshot (scrolled past), but Amazon's order page shows what it shows only once delivered.
  for (const line of ['Leave delivery feedback', 'Return window closed on 15 September 2026', 'Return or replace items', 'Package was handed to resident']) {
    const d = parseDelivery(['Order details', 'Sold by: Test Brand', line, 'Order summary']);
    assert.equal(d.delivered, true, line);
    assert.equal(d.deliveredHow, 'sign', line);
    assert.equal(d.deliveredDate, null, 'no date from a sign');
  }
  assert.deepEqual([parseDelivery(['Delivered to a neighbour']).delivered, parseDelivery(['Delivered to a neighbour']).deliveredHow], [true, 'word'], 'the word itself, wherever it is');
  assert.equal(parseDelivery(['Leave delivery feedback']).deliveredText, 'Leave delivery feedback');
  // Never from a sign when a line says the order is still on its way.
  assert.equal(parseDelivery(['Arriving Thursday', 'Leave delivery feedback']).delivered, false);
  assert.equal(parseDelivery(['Cancel items', 'Return window closed on 15 September']).delivered, false);
  assert.equal(parseDelivery(['Delivered 23 August', 'Leave delivery feedback']).deliveredHow, 'word', 'the word itself comes first');
});

test('the order id, with plain hyphens, even when a hyphen was read as a dash or a space', () => {
  assert.equal(parseDelivery(['Order # 407-1234567-1234567']).orderId, '407-1234567-1234567');
  assert.equal(parseDelivery(['ORDER # 407–1234567–1234567']).orderId, '407-1234567-1234567');
  assert.equal(parseDelivery(['Order 407 1234567 1234567']).orderId, '407-1234567-1234567');
  assert.equal(parseDelivery(['Order 4071 1234567 1234567']).orderId, null, 'four digits first is not an order id');
  assert.equal(parseDelivery(['Delivered 3 March']).orderId, null);
});

test("the product's name: the first title line after Delivered, carried on over its wrapped lines", () => {
  const lines = ['Your Orders', 'ORDER PLACED TOTAL Order # 407-1234567-1234567', '28 February 2026 ₹1,299.00', 'Delivered 3 March', 'Package was handed to resident', 'Test Brand Folding Garment Rack', 'with Wheels', 'Sold by: Test Seller', '₹1,299.00', 'Return window closed on 13 March', 'Track package', 'Write a product review', 'Buy it again'];
  assert.equal(parseDelivery(lines).product, RACK);
  // A button read between the name's lines is skipped.
  assert.equal(parseDelivery(['Delivered 3 March', 'Test Brand Folding Garment Rack', 'Track package', 'with Wheels', 'Sold by: Test Seller']).product, RACK);
  // With positions, only a line right under the first, at the same left, carries it on.
  const at = (text, left, top) => ({ text, left, top, right: left + 300, bottom: top + 20 });
  assert.equal(parseDelivery([at('Delivered 3 March', 20, 100), at('Test Brand Folding Garment Rack', 140, 160), at('Track package', 600, 162), at('with Wheels', 140, 184), at('Sold by: Test Seller', 140, 210)]).product, RACK);
  assert.equal(parseDelivery([at('Delivered 3 March', 20, 100), at('Test Brand Folding Garment Rack', 140, 160), at('Something Far Below', 140, 400)]).product, 'Test Brand Folding Garment Rack', 'a line far below is not part of the name');
  assert.equal(parseDelivery(['Delivered 3 March', 'Test Brand Insulated Steel Water Bottle,', '1 Litre, Black', 'Sold by: Test Seller']).product, BOTTLE);
});

test('labels, prices, addresses and short lines are never the name; no name is null', () => {
  assert.equal(parseDelivery(['Your Orders', 'Delivered 3 March', 'Package was handed to resident', 'Sold by: Test Seller', '₹1,299.00', 'Rs. 1,299', 'Return window closed on 13 March', 'Track package', 'Write a product review', 'Buy it again', 'Test Street, Test City 000000', 'Rack']).product, null);
  assert.equal(parseDelivery(['Test Brand Folding Garment Rack with Wheels', 'Delivered 3 March', 'Buy it again']).product, RACK, 'before Delivered when none comes after');
  assert.equal(parseDelivery([]).product, null);
  assert.equal(parseDelivery(null).delivered, false);
});

test('the drawn screenshots, read by Tesseract on this computer', { timeout: 180_000 }, async () => {
  let fingerprinted = 0;
  const analyse = async () => {
    fingerprinted++;
    return { fingerprint: 'ab'.repeat(288) };
  };
  const clear = await readDeliveryScreenshot(join(FIX, 'delivery-clear.png'), { analyse });
  assert.equal(clear.ok, true, clear.problem);
  assert.equal(clear.delivered, true);
  assert.equal(clear.deliveredDate, '3 March');
  assert.equal(clear.orderId, '407-1234567-1234567');
  assert.equal(clear.product, RACK);
  assert.equal(clear.fingerprint, 'ab'.repeat(288));
  assert.equal(fingerprinted, 1);

  const none = await readDeliveryScreenshot(join(FIX, 'delivery-no-product.png'));
  assert.equal(none.delivered, true);
  assert.equal(none.product, null);
  assert.equal(none.fingerprint, null, 'no fingerprint without a way to make one');

  assert.equal((await readDeliveryScreenshot(join(FIX, 'delivery-other-product.png'))).product, BOTTLE);
  const arriving = await readDeliveryScreenshot(join(FIX, 'delivery-arriving.png'));
  assert.equal(arriving.delivered, false);
  assert.equal(arriving.product, RACK);
});

test('a picture that cannot be read, or reads as nothing, is "not clear" and never throws', async () => {
  const broken = await readDeliveryScreenshot('/nowhere.png', { tesseract: async () => { throw new Error('no'); }, analyse: async () => { throw new Error('no'); } });
  assert.equal(broken.ok, false);
  assert.equal(broken.problem, 'Delivery screenshot is not clear: it could not be read on this computer.');
  assert.equal(broken.fingerprint, null);
  const empty = await readDeliveryScreenshot('/x.png', { tesseract: async () => 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n' });
  assert.equal(empty.ok, false);
  assert.equal(empty.problem, 'Delivery screenshot is not clear.');
});

test('never "Delivered" for a parcel that could not be delivered, is not yet delivered, or had a delivery attempt', () => {
  for (const line of ['Your package could not be delivered', 'Not yet delivered', 'Delivery attempted: no one was home', 'We were unable to deliver your package', 'Yet to be delivered', 'Undeliverable address']) {
    assert.equal(parseDelivery(['Your Orders', line]).delivered, false, line);
  }
  assert.equal(parseDelivery(['Your Orders', 'Delivered 22 July']).delivered, true, 'a plain Delivered line still counts');
});
