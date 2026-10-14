// The email for a user, ready to copy (flipkart/emails.js): the Amazon
// checker's emails (amazon/emails.js) with Flipkart in place of Amazon, one
// for every Type but Verified and Rating Only (Something else too, which
// Amazon has none for), filled in for a row as on Amazon. Made-up rows and
// checks only: nothing is read, opened or sent.
// Run: node test/flipkart-emails.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_KEYS, EMAILS, emailFor, emailName, emailKeyFor, hasEmail, whatIsWrong, fill } from '../flipkart/emails.js';
import { TYPE_KEYS } from '../flipkart/final.js';
import { EMAIL_KEYS as AMAZON_EMAIL_KEYS, DEFAULT_EMAILS as AMAZON_EMAILS, PLACEHOLDERS as AMAZON_PLACEHOLDERS, fill as amazonFill } from '../amazon/emails.js';

const ID = 'OD100000000000000002';
/** A made-up row as the Flipkart store keeps it. */
const row = (over = {}) => ({
  id: 'r00000000000e',
  row: 2,
  n: 1,
  orderId: { text: ID, value: ID },
  orderDate: { text: '20-07-2026', value: '2026-07-20' },
  amount: { text: '349', value: 349 },
  product: { text: 'Test Brand Steel Bottle' },
  shots: { order: { text: '', links: ['https://drive.google.com/open?id=1TestOrder'] }, delivery: { text: '', links: ['https://drive.google.com/open?id=1TestDelivery'] }, review: { text: '', links: [] }, reviewShot: { text: '', links: [] } },
  pictures: { order: [], delivery: [], review: [], reviewShot: [] },
  values: {},
  ...over,
});
const HELLO = `Hello Test Person Two,\n\nThis is about your order ${ID} for Test Brand Steel Bottle.`;
const words = (email) => `${email.subject}\n${email.message}`;

test('every Type but Verified and Rating Only has an email, Something else too: the Amazon checker\'s emails, with Flipkart in place of Amazon', () => {
  assert.deepEqual(EMAIL_KEYS.filter((k) => k !== 'notDeliveredCancelled'), TYPE_KEYS.filter((k) => k !== 'verified' && k !== 'ratingOnly'), 'in the order the Types are listed');
  assert.deepEqual(EMAIL_KEYS, [...AMAZON_EMAIL_KEYS.filter((k) => k !== 'reviewDeleted'), 'somethingElse'], "Amazon's, but for its deleted review, and with Something else");
  assert.equal(EMAIL_KEYS.indexOf('notDeliveredCancelled'), EMAIL_KEYS.indexOf('notDelivered') + 1, 'a second email for Not delivered, as on Amazon');
  assert.deepEqual(Object.keys(EMAILS.templates), EMAIL_KEYS);
  assert.deepEqual([hasEmail('verified'), hasEmail('ratingOnly'), hasEmail('reviewDeleted'), hasEmail('somethingElse'), hasEmail('notDelivered')], [false, false, false, true, true]);
  assert.equal(EMAILS.signOff, AMAZON_EMAILS.signOff);
  const known = new Set(AMAZON_PLACEHOLDERS.map((p) => p.word));
  for (const k of EMAIL_KEYS) {
    const t = EMAILS.templates[k];
    // Amazon's subject, with Flipkart in place of Amazon; Something else's is written the same way.
    if (AMAZON_EMAILS.templates[k]) assert.equal(t.subject, AMAZON_EMAILS.templates[k].subject.replaceAll('Amazon', 'Flipkart'), k);
    else assert.match(t.subject, /^Your order \{order ID\}: /, k);
    assert.ok(t.message.startsWith('Hello {name},\n\nThis is about your order {order ID} for {product}.\n\n') && t.message.endsWith('\n\n{sign-off}'), k);
    // Nothing that fits only Amazon: its name, where its orders are, its email saying a review is live.
    assert.doesNotMatch(words(t), /Amazon|Your Orders|Returns & Orders|review is live|tap Submit/, k);
    for (const m of words(t).matchAll(/\{[^{}]*\}/g)) assert.ok(known.has(m[0]), `${k}: ${m[0]} is a word Amazon's emails fill in too`);
    assert.doesNotMatch(words(t), /--|\bTBD\b/, `${k}: short and simple`);
  }
  // Where a Flipkart user finds an order and a review.
  assert.match(EMAILS.templates.orderShotMissing.message, /In the Flipkart app: tap "Account", then "Orders", then this order\./);
  assert.match(EMAILS.templates.reviewNotLive.message, /open "My Reviews" in your account, click "Share" under your review, and copy the link\./);
  assert.match(EMAILS.templates.reviewNotLive.message, /a review Flipkart has published is on the "Published" tab/);
  assert.match(EMAILS.templates.cannotAddReviews.message, /Flipkart did not accept your review for this product\./);
  assert.deepEqual([emailName('notDelivered'), emailName('notDeliveredCancelled'), emailName('somethingElse')], ['Not delivered', 'Not delivered (cancelled or returned)', 'Something else']);
  // Filled in the same way as on Amazon.
  const values = { name: 'Test Person Two', orderId: ID, product: '', whatIsWrong: '', signOff: 'Made-up sign-off' };
  for (const k of EMAIL_KEYS) assert.equal(fill(EMAILS.templates[k].message, values, { addSignOff: true }), amazonFill(EMAILS.templates[k].message, values, { addSignOff: true }), k);
});

test('the email is filled in for the row, as on Amazon: the name, the order ID, the product, what is wrong from its last check, and the sign-off', () => {
  const r = row();
  const idCheck = { order: { ok: true, details: { orderId: { state: 'different', shown: 'OD100000000000000009' } } }, delivery: null };
  const id = emailFor({ typeKey: 'orderIdNotMatching', row: r, result: idCheck, reviewer: 'Test Person Two' });
  assert.deepEqual([id.key, id.name, id.subject], ['orderIdNotMatching', 'Order ID is not matching', `Your order ${ID}: the order ID does not match`]);
  assert.ok(id.message.startsWith(`${HELLO}\n\nYou gave order ID ${ID}, but your purchase screenshot shows order ID OD100000000000000009.\n\nPlease reply to this email with the screenshot of the right order, or with the right order ID.\n\nHow to take it:\nIn the Flipkart app:`), id.message);
  assert.ok(id.message.endsWith('The screenshot must show the order ID, the amount and the product.\n\nThank you,\nThe support team'), id.message);
  // No name in the file: "Hello," alone; no check to tell from (a result a staff member chose): a sentence that is still true.
  const bare = emailFor({ typeKey: 'orderIdNotMatching', row: r, result: null, reviewer: null });
  assert.ok(bare.message.startsWith(`Hello,\n\nThis is about your order ${ID} for Test Brand Steel Bottle.\n\nThe order ID you gave, ${ID}, is not the order ID on your screenshot.`), bare.message);
  // The order date and the amount, as the sheet has them and as the screenshots show them.
  const details = { orderDate: { state: 'different', shown: '21-07-2026' }, amount: { state: 'different', shown: '₹399' } };
  assert.equal(whatIsWrong('orderDetailsNotMatching', { row: r, result: { order: { ok: true, details }, delivery: { ok: true, details: { orderDate: details.orderDate } } } }), 'The order date is different: you gave 20-07-2026, but your screenshots show 21-07-2026. The amount is different: you gave ₹349, but your purchase screenshot shows ₹399.');
  assert.equal(whatIsWrong('productNotMatching', { row: r, result: { order: { ok: true, details: { product: { state: 'different', shown: 'Test Brand Lunch Box', campaign: true } } } } }), 'Your purchase screenshot shows "Test Brand Lunch Box", but the product should be "Test Brand Steel Bottle".');
  assert.equal(whatIsWrong('orderNotClear', { row: r, result: { order: { ok: true, details: { orderId: { state: 'not shown' }, amount: { state: 'same', shown: '₹349' }, product: { state: 'not shown' } } } } }), 'On the purchase screenshot you sent, we could not see the order ID and the product.');
  assert.equal(whatIsWrong('deliveryNotClear', { row: r, result: { delivery: { ok: true, delivered: true, details: { orderId: { state: 'same', shown: ID }, product: { state: 'not shown' } } } } }), 'The delivery screenshot you sent does not show the product, so it is not enough.');
  // A picture that could not be had.
  const unopened = row({ pictures: { order: [{ link: 'https://drive.google.com/open?id=1TestOrder', problem: { kind: 'drive', site: 'Google Drive', says: 'made-up', noAccess: true } }], delivery: [], review: [], reviewShot: [] } });
  assert.equal(emailFor({ typeKey: 'needDriveAccess', row: unopened, reviewer: 'Test Person Two' }).message, `${HELLO}\n\nWe could not open the purchase screenshot you sent on Google Drive.\n\nPlease reply to this email with the same screenshot again, as a clear picture.\n\nThank you,\nThe support team`);
  // Something else, which Amazon has no email for.
  const other = emailFor({ typeKey: 'somethingElse', row: r, reviewer: 'Test Person Two' });
  assert.deepEqual([other.key, other.name, other.subject], ['somethingElse', 'Something else', `Your order ${ID}: we could not finish checking it`]);
  assert.ok(other.message.startsWith(`${HELLO}\n\nWe could not finish checking your order from what you sent.\n\nPlease reply to this email with a clear screenshot of this order and a screenshot of your review on Flipkart`), other.message);
  // Pass has no email, and neither has a Type this dashboard does not know.
  assert.deepEqual(['verified', 'ratingOnly', 'reviewDeleted', 'notAType', null].map((typeKey) => emailFor({ typeKey, row: r })), [null, null, null, null, null]);
  // A word this dashboard never shows is hidden in the email too, as on Amazon.
  const hidden = Buffer.from('cmVmdW5k', 'base64').toString('utf8');
  assert.ok(emailFor({ typeKey: 'duplicate', row: row({ product: { text: `Test ${hidden} Bottle` } }), reviewer: 'Test Person Two' }).message.includes('for Test … Bottle.'));
});

test("a Flipkart row's own findings in its email: the delivery screenshot's words (cancelled or returned gets Amazon's second email), the name on the review found on Flipkart, and its stars", () => {
  const r = row();
  const said = (word) => ({ delivery: { ok: true, delivered: false, notDelivered: word, details: {} } });
  const cancelled = emailFor({ typeKey: 'notDelivered', row: r, result: said('Cancelled'), reviewer: 'Test Person Two' });
  assert.deepEqual([cancelled.key, cancelled.name, cancelled.subject], ['notDeliveredCancelled', 'Not delivered (cancelled or returned)', `Your order ${ID}: the screenshot says it was cancelled or returned`]);
  assert.ok(cancelled.message.includes('Your delivery screenshot says "Cancelled", so it looks like the order was not delivered.\n\nIf the order was in fact delivered'), cancelled.message);
  const shipped = emailFor({ typeKey: 'notDelivered', row: r, result: said('Shipped'), reviewer: 'Test Person Two' });
  assert.deepEqual([shipped.key, whatIsWrong('notDelivered', { row: r, result: said('Shipped') })], ['notDelivered', 'Your delivery screenshot says "Shipped", not "Delivered".']);
  // Words in the delivery cell, in place of a screenshot.
  const typed = row({ shots: { ...r.shots, delivery: { text: 'Order cancelled', links: [] } } });
  assert.deepEqual([emailKeyFor('notDelivered', { row: typed }), whatIsWrong('notDeliveredCancelled', { row: typed })], ['notDeliveredCancelled', 'You wrote "Order cancelled" in the form, so it looks like the order was not delivered.']);
  assert.equal(whatIsWrong('notDelivered', { row: row({ shots: { ...r.shots, delivery: { text: 'Not delivered yet', links: [] } } }) }), 'You wrote "Not delivered yet" in the form instead of giving a delivery screenshot.');
  // The name on the review found on Flipkart, and the name in the file or on the review screenshot.
  const found = (how, extra = {}) => ({ review: { ok: true, name: 'Test P. Two', stars: 4 }, found: { how, nameFrom: 'screenshot', review: { name: 'Other Test Person', stars: 5 }, ...extra } });
  assert.equal(whatIsWrong('reviewerNotMatching', { row: r, result: found('found'), reviewer: 'Test Person Two' }), 'The name on the review on Flipkart is "Other Test Person", but the name you gave is "Test Person Two".');
  assert.equal(whatIsWrong('reviewerNotMatching', { row: r, result: found('otherName'), reviewer: 'Test Person Two' }), 'The name on the review on Flipkart is "Other Test Person", but the name on your review screenshot is "Test P. Two".');
  assert.equal(whatIsWrong('reviewerNotMatching', { row: r, result: found('found'), reviewer: null }), 'The name on the review on Flipkart is "Other Test Person", but the name on your review screenshot is "Test P. Two".');
  assert.equal(whatIsWrong('reviewerNotMatching', { row: r, result: found('noName'), reviewer: 'Test Person Two' }), 'Your review on Flipkart shows "Flipkart Customer" instead of a name, so we could not see that it is yours.');
  assert.equal(whatIsWrong('reviewerNotMatching', { row: r, result: null, reviewer: 'Test Person Two' }), 'The name on the review is not the name you gave.');
  assert.equal(whatIsWrong('reviewShotNotMatching', { row: r, result: found('found') }), 'Your review screenshot shows 4 stars, but your review on Flipkart has 5 stars.');
  assert.equal(whatIsWrong('reviewShotNotMatching', { row: r, result: null }), 'Your review screenshot does not match your review on Flipkart.');
});
