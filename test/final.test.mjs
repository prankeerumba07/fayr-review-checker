// The Status's rules that need no check to run: one digit away, the first
// sentence of a Note, the words a file's Status column may hold, and the
// Status of a check made before the three Status words were added. Made-up
// values only.
// Run: node test/final.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oneDigitOff, dateOneDigitOff, amountOneDigitOff, finalFromWords, finalOfSaved, finalSentence, lowerFirst, TYPE_FINAL, FINAL_WORDS } from '../amazon/final.js';
import { TYPE_KEYS } from '../amazon/settings.js';
import { assertPlain } from './plain-words.mjs';

test('one digit away: one digit changed, missing or extra; never the same number, and never two digits', () => {
  assert.equal(oneDigitOff('403-1234567-1234567', '403-1234567-1234561'), true);
  assert.equal(oneDigitOff(654, 664), true);
  assert.equal(oneDigitOff(654, 65), true);
  assert.equal(oneDigitOff(654, 6544), true);
  assert.equal(oneDigitOff(654, 654), false);
  assert.equal(oneDigitOff(654, 456), false);
  assert.equal(oneDigitOff('', 1), false);
  assert.equal(dateOneDigitOff({ day: '2026-07-20' }, '2026-07-21'), true);
  assert.equal(dateOneDigitOff({ day: '2026-07-20' }, '2026-07-16'), false);
  assert.equal(dateOneDigitOff({ month: 7, date: 21 }, '2026-07-20'), true, 'a date with no year: its day and month');
  assert.equal(amountOneDigitOff(1199, 1299), true);
  assert.equal(amountOneDigitOff(851, 654), false);
});

test('every Type has a Status, and only Verified and Rating Only pass', () => {
  assert.deepEqual(Object.keys(TYPE_FINAL).sort(), [...TYPE_KEYS].sort());
  assert.deepEqual(Object.entries(TYPE_FINAL).filter(([, f]) => f === 'pass').map(([k]) => k), ['verified', 'ratingOnly']);
  for (const k of ['duplicate', 'orderShotMissing', 'deliveryShotMissing', 'reviewLinkMissing', 'orderIdNotMatching', 'orderDetailsNotMatching', 'notDelivered', 'productNotMatching', 'wrongReviewLink', 'reviewDeleted', 'cannotAddReviews']) assert.equal(TYPE_FINAL[k], 'fail', k);
  for (const k of ['needDriveAccess', 'needAccess', 'orderNotClear', 'deliveryNotClear', 'reviewNotClear', 'reviewNotLive', 'reviewLinkNeeded', 'somethingElse']) assert.equal(TYPE_FINAL[k], 'manual', k);
  assert.deepEqual(FINAL_WORDS, { pass: 'Pass', fail: 'Fail', manual: 'Needs Manual Staff Checking' }, 'the three Status words, never Verified or Unverified');
  assertPlain(assert, Object.values(FINAL_WORDS), 'the Status words');
});

test('the first sentence of a Note, and the Status written in a file', () => {
  assert.equal(finalSentence('fail', lowerFirst('The order ID on the delivery screenshot does not match.')), 'This transaction failed because the order ID on the delivery screenshot does not match.');
  assert.equal(finalSentence('manual', lowerFirst('Amazon no longer shows the review.')), 'A staff member needs to check this transaction because Amazon no longer shows the review.', 'a name keeps its capital');
  assert.equal(finalSentence('pass', 'everything matched'), 'This transaction passed: everything matched.');
  assert.deepEqual(['Pass', ' fail ', 'Needs Manual Staff Checking', 'needs manual staff checking', 'needs manual', 'Verified', 'Unverified', 'Maybe', ''].map(finalFromWords), ['pass', 'fail', 'manual', 'manual', 'manual', null, null, null, null]);
});

test('a check made before the three Status words were added gets its Status from what it kept; a possible reading mistake is never Fail', () => {
  const sheet = { orderId: '403-1234567-1234567', orderDay: '2026-07-20', amountValue: 654 };
  const rec = (details, more = {}) => ({ details, orderIds: [], dates: [], amounts: [], ...more });
  const same = { state: 'same' };
  assert.equal(finalOfSaved({ typeKey: 'verified' }), 'pass');
  assert.equal(finalOfSaved({ typeKey: 'duplicate' }), 'fail');
  assert.equal(finalOfSaved({ typeKey: 'needDriveAccess' }), 'manual');
  assert.equal(finalOfSaved({ typeKey: 'reviewNotLive', final: 'fail' }), 'fail', 'a Status it has is kept');
  assert.equal(finalOfSaved({}), null);
  assert.equal(finalOfSaved({ typeKey: 'orderIdNotMatching', sheet, order: rec({ orderId: { state: 'different' } }, { orderIds: ['403-1234567-1234561'] }) }), 'manual');
  assert.equal(finalOfSaved({ typeKey: 'orderIdNotMatching', sheet, order: rec({ orderId: { state: 'different' } }, { orderIds: ['403-7654321-7654321'] }) }), 'fail');
  assert.equal(finalOfSaved({ typeKey: 'orderDetailsNotMatching', sheet, order: rec({ orderId: same, orderDate: { state: 'different' } }, { dates: ['21-07-2026'] }) }), 'manual');
  assert.equal(finalOfSaved({ typeKey: 'orderDetailsNotMatching', sheet, order: rec({ amount: { state: 'different' } }, { amounts: [{ value: 851 }] }) }), 'fail');
  assert.equal(finalOfSaved({ typeKey: 'notDelivered', sheet, delivery: rec({ orderId: same }, { delivered: false, text: 'Your Orders Delivred 22 July' }) }, ['Cancelled', 'Returned']), 'manual');
  assert.equal(finalOfSaved({ typeKey: 'notDelivered', sheet, delivery: rec({ orderId: same }, { delivered: false, text: 'Your Orders\nCancelled' }) }, ['Cancelled', 'Returned']), 'fail');
  assert.equal(finalOfSaved({ typeKey: 'notDelivered', sheet, steps: [{}, {}, {}, { detail: 'The cell says "Returned", so the order was not delivered.' }] }, ['Returned']), 'fail', 'the cell clearly says so');
});
