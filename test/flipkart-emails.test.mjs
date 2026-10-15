// The email for a user, ready to copy (flipkart/emails.js): one for every
// Type but Verified and Rating Only (Something else too), short and clear
// after staff tried them on real rows: what we checked, what we found for
// this order, and exactly what the user must send, with numbered steps for
// finding it on Flipkart. Made-up rows and checks only: nothing is read,
// opened or sent.
// Run: node test/flipkart-emails.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_KEYS, EMAILS, emailFor, emailName, emailKeyFor, hasEmail, whatIsWrong, fill, deliveredToName, namesFound } from '../flipkart/emails.js';
import { TYPE_KEYS } from '../flipkart/final.js';
import { EMAIL_KEYS as AMAZON_EMAIL_KEYS, PLACEHOLDERS as AMAZON_PLACEHOLDERS, fill as amazonFill } from '../amazon/emails.js';

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
/** A made-up check, as kept with a row: what each screenshot showed, and the review found on Flipkart. */
const CHECK = {
  order: { ok: true, details: { orderId: { state: 'different', shown: 'OD100000000000000009' }, orderDate: { state: 'same', shown: '20-07-2026' }, amount: { state: 'different', shown: '₹399' }, product: { state: 'different', shown: 'Test Brand Lunch Box' } } },
  delivery: { ok: true, delivered: true, notDelivered: null, details: { product: { state: 'not shown' } }, text: `Order ID ${ID}\nDelivered, Jul 23\nDelivered to Test Person Two at Home` },
  review: { ok: true, kind: 'written', name: 'Other Test Person', stars: 4, tab: null, form: false },
  found: { how: 'otherName', nameFrom: 'screenshot', count: 1, before: 0, review: { name: 'Other Test Person', stars: 5 } },
  reviewsFrom: { day: '2026-07-23', from: 'delivery' },
  flipkart: { oldest: '2026-07-01' },
};
const words = (t) => t.split(/\s+/).filter(Boolean).length;
// Flipkart's app shows My Reviews without the user's name.
const REVIEW_STEPS = '1. Open the Flipkart app and tap Account.\n2. Tap My Reviews (scroll down if needed).\n3. Open the Published tab.\n4. Find your review of this product.\n5. Take a screenshot that shows the product and your review.';

test('every Type but Verified and Rating Only has an email, Something else and Possible misuse too, each short and clear: a short subject, what we checked, what we found, and what to send, with numbered steps for finding it on Flipkart', () => {
  assert.deepEqual(EMAIL_KEYS.filter((k) => k !== 'notDeliveredCancelled'), TYPE_KEYS.filter((k) => k !== 'verified' && k !== 'ratingOnly'), 'in the order the Types are listed');
  assert.deepEqual(EMAIL_KEYS, [...AMAZON_EMAIL_KEYS.filter((k) => k !== 'reviewDeleted'), 'possibleMisuse', 'somethingElse'], "the Amazon screen's, but for its deleted review, and with Possible misuse and Something else");
  assert.equal(EMAIL_KEYS.indexOf('notDeliveredCancelled'), EMAIL_KEYS.indexOf('notDelivered') + 1, 'a second email for Not delivered, as on Amazon');
  assert.deepEqual(Object.keys(EMAILS.templates), EMAIL_KEYS);
  assert.deepEqual([hasEmail('verified'), hasEmail('ratingOnly'), hasEmail('reviewDeleted'), hasEmail('somethingElse'), hasEmail('notDelivered')], [false, false, false, true, true]);
  assert.deepEqual([emailName('notDelivered'), emailName('notDeliveredCancelled'), emailName('somethingElse')], ['Not delivered', 'Not delivered (cancelled or returned)', 'Something else']);
  const known = new Set(AMAZON_PLACEHOLDERS.map((p) => p.word));
  const noSteps = ['duplicate', 'needDriveAccess', 'needAccess', 'possibleMisuse'];
  for (const k of EMAIL_KEYS) {
    const t = EMAILS.templates[k];
    assert.match(t.subject, /^Order \{order ID\}: [a-z][a-zA-Z ]+$/, `${k}: a short, clear subject`);
    assert.ok(t.subject.split(' ').length <= 9, `${k}: ${t.subject}`);
    assert.match(t.message, /^Hello \{name\},\n\nWe (checked|looked for|compared) /, `${k}: what we checked comes first`);
    assert.ok(t.message.endsWith('\n\n{sign-off}'), k);
    for (const m of `${t.subject} ${t.message}`.matchAll(/\{[^{}]*\}/g)) assert.ok(known.has(m[0]), `${k}: ${m[0]} is a word filled in for the row`);
    assert.doesNotMatch(`${t.subject}\n${t.message}`, /Amazon|--|\bTBD\b/, k);
    // Numbered steps for finding what to send on Flipkart, but where there is nothing to find there.
    if (!noSteps.includes(k)) assert.match(t.message, /\n1\. [^\n]*Flipkart (app|website)|\n1\. Go to flipkart\.com/, `${k}: numbered steps`);
  }
  // The proof of a review: a screenshot from My Reviews, on its Published tab, found in the app.
  for (const k of ['reviewLinkMissing', 'reviewNotClear', 'wrongReviewLink', 'reviewNotLive', 'reviewShotNotMatching', 'reviewerNotMatching', 'cannotAddReviews']) {
    assert.match(EMAILS.templates[k].message, /screenshot of (?:your review|the review|it) from (?:the Published tab of My Reviews|your own account)/, k);
    assert.ok(EMAILS.templates[k].message.includes(REVIEW_STEPS), `${k}: the steps to My Reviews, on its Published tab`);
  }
  // A link only where one is truly needed, and only from the Flipkart website.
  const asksLink = EMAIL_KEYS.filter((k) => /send the link|paste it into your reply/.test(EMAILS.templates[k].message));
  assert.deepEqual(asksLink, ['reviewLinkNeeded']);
  assert.match(EMAILS.templates.reviewLinkNeeded.message, /How to get the link, on a computer \(links from the Flipkart app do not open on a computer\):\n1\. Go to flipkart\.com and log in\.\n2\. Open My Reviews in your account\.\n3\. Click Share under your review of this product\.\n4\. Copy the link and paste it into your reply\./);
  assert.match(EMAILS.templates.wrongReviewLink.message, /You do not need to send a link\./);
  assert.match(EMAILS.templates.orderShotMissing.message, /How to find it:\n1\. Open the Flipkart app and tap Account\.\n2\. Tap Orders, then tap this order\.\n3\. Take a screenshot that shows the order ID, the product and the amount\./);
  // Filled in the same way as on Amazon, but a blank product goes with its brackets.
  const values = { name: 'Test Person Two', orderId: ID, product: 'Test Brand Steel Bottle', whatIsWrong: 'Made-up.', signOff: 'Made-up sign-off' };
  for (const k of EMAIL_KEYS) assert.equal(fill(EMAILS.templates[k].message, values, { addSignOff: true }), amazonFill(EMAILS.templates[k].message, values, { addSignOff: true }), k);
  assert.equal(fill('We checked your entry for your Flipkart order {order ID} ({product}). See {product}.', { orderId: ID }), `We checked your entry for your Flipkart order ${ID}. See this product.`);
});

test('each email filled in for a made-up row stays short (about 150 words at most) and says what we found for this order', () => {
  for (const k of EMAIL_KEYS) {
    const typeKey = k === 'notDeliveredCancelled' ? 'notDelivered' : k;
    const result = k === 'notDeliveredCancelled' ? { delivery: { ok: true, delivered: false, notDelivered: 'Cancelled', details: {} } } : CHECK;
    const email = emailFor({ typeKey, row: row({ product: { text: 'Test Brand Steel Bottle 1 Litre Blue' } }), result, reviewer: 'Test Person Two' });
    assert.equal(email.key, k);
    assert.ok(words(email.message) <= 150, `${k}: ${words(email.message)} words`);
    assert.ok(email.message.startsWith('Hello Test Person Two,\n\nWe '), k);
    assert.ok(email.message.endsWith('\n\nThank you,\nThe support team'), k);
    assert.match(email.subject, new RegExp(`^Order ${ID}: `), k);
  }
  const fact = (key, result = CHECK, r = row()) => whatIsWrong(key, { row: r, result, reviewer: 'Test Person Two' });
  assert.equal(fact('orderIdNotMatching'), `In the form you gave order ID ${ID}, but your purchase screenshot shows order ID OD100000000000000009.`);
  assert.equal(fact('orderDetailsNotMatching'), 'In the form you gave the amount ₹349, but your purchase screenshot shows ₹399.');
  assert.equal(fact('orderDetailsNotMatching', { order: { ok: true, details: { orderDate: { state: 'different', shown: '21-07-2026' } } }, delivery: { ok: true, details: { orderDate: { state: 'different', shown: '21-07-2026' } } } }), 'In the form you gave the order date 20-07-2026, but your screenshots show 21-07-2026.');
  assert.equal(fact('productNotMatching'), 'Your purchase screenshot shows "Test Brand Lunch Box", not "Test Brand Steel Bottle".');
  assert.equal(fact('orderNotClear', { order: { ok: true, details: { orderId: { state: 'not shown' }, amount: { state: 'not shown' }, product: { state: 'same' } } } }), 'We could not see the order ID or the amount on it.');
  assert.equal(fact('orderNotClear', { order: { ok: false } }), 'We could not read it.');
  assert.equal(fact('deliveryNotClear', { delivery: { ok: true, delivered: false, details: { product: { state: 'not shown' } } } }), 'It does not show the word "Delivered" or the product.');
  assert.equal(fact('notDelivered', { delivery: { ok: true, delivered: false, notDelivered: 'Shipped', details: {} } }), 'Your delivery screenshot says "Shipped", not "Delivered".');
  const typed = row({ shots: { ...row().shots, delivery: { text: 'Order cancelled', links: [] } } });
  assert.deepEqual([emailKeyFor('notDelivered', { row: typed }), fact('notDeliveredCancelled', null, typed)], ['notDeliveredCancelled', 'In the form you wrote "Order cancelled".']);
  assert.equal(fact('notDelivered', null, row({ shots: { ...row().shots, delivery: { text: 'Not delivered yet', links: [] } } })), 'In the form you wrote "Not delivered yet" instead of sending a delivery screenshot.');
  const unopened = row({ pictures: { order: [{ link: 'https://drive.google.com/open?id=1TestOrder', problem: { kind: 'drive', site: 'Google Drive', says: 'made-up', noAccess: true } }], delivery: [], review: [], reviewShot: [] } });
  assert.equal(fact('needDriveAccess', null, unopened), 'We could not open your purchase screenshot on Google Drive.');
  assert.equal(fact('reviewShotNotMatching'), 'Your review screenshot shows 4 stars, but your review on Flipkart has 5 stars.');
  assert.equal(fact('reviewLinkNeeded', { found: { how: 'several', count: 2 } }), 'We found 2 reviews on Flipkart with the same words, so we cannot tell which one is yours.');
  assert.equal(fact('cannotAddReviews'), 'It shows a message from Flipkart that your review was not accepted.');
  // With nothing known from a check (a result a staff member chose), a sentence that is still true.
  assert.deepEqual(['orderIdNotMatching', 'productNotMatching', 'reviewerNotMatching', 'reviewNotLive'].map((k) => fact(k, null)), [`The order ID on your screenshot is not ${ID}, the one in your form.`, 'Your screenshot shows a different product.', 'We found only one name, so we could not match it:\n- In your form: Test Person Two', 'It is not among the reviews Flipkart shows for this product.']);
  // Pass has no email, and neither has a Type this dashboard does not know.
  assert.deepEqual(['verified', 'ratingOnly', 'reviewDeleted', 'notAType', null].map((typeKey) => emailFor({ typeKey, row: row() })), [null, null, null, null, null]);
  // A word this dashboard never shows is hidden in the email too; no name in the file: "Hello," alone.
  const hidden = Buffer.from('cmVmdW5k', 'base64').toString('utf8');
  const odd = emailFor({ typeKey: 'duplicate', row: row({ product: { text: `Test ${hidden} Bottle` } }), reviewer: null });
  assert.ok(odd.message.startsWith(`Hello,\n\nWe checked your entry for your Flipkart order ${ID} (Test … Bottle). This order, screenshot or review was already sent in another entry, so it cannot count again.`), odd.message);
});

test('"Reviewer name is different": each name we found and where (delivered to, the form, the review on Flipkart, the review screenshot), then that we cannot confirm the review was written from the user\'s own account, a screenshot of it from their own account (My Reviews shows no name), and to tell us if their account uses another name or someone else wrote it', () => {
  const email = emailFor({ typeKey: 'reviewerNotMatching', row: row(), result: CHECK, reviewer: 'Test Person Two' });
  assert.equal(email.subject, `Order ${ID}: names do not match`);
  assert.equal(
    email.message,
    [
      'Hello Test Person Two,',
      `We checked your review of Test Brand Steel Bottle on Flipkart, for your order ${ID}.`,
      'The names we found do not match:\n- Delivered to (on your delivery screenshot): Test Person Two\n- In your form: Test Person Two\n- On the review on Flipkart: Other Test Person\n- On your review screenshot: Other Test Person',
      'We cannot confirm the review was written from your own Flipkart account.',
      `Please send a screenshot of the review from your own account:\n${REVIEW_STEPS}`,
      "If your Flipkart account uses a different name, or the review was written from someone else's account, please tell us.",
      'Thank you,\nThe support team',
    ].join('\n\n'),
  );
  // A name read from a screenshot only when it was read clearly; "Flipkart Customer" is no name.
  assert.deepEqual(namesFound({ result: { ...CHECK, delivery: { ...CHECK.delivery, ok: false }, review: { ...CHECK.review, ok: false } }, reviewer: 'Test Person Two' }), [{ where: 'In your form', name: 'Test Person Two' }, { where: 'On the review on Flipkart', name: 'Other Test Person' }]);
  assert.deepEqual(namesFound({ result: { ...CHECK, review: { ...CHECK.review, name: 'Oth3r T#st' }, found: { how: 'noName', review: { name: 'Flipkart Customer' } } }, reviewer: '' }), [{ where: 'Delivered to (on your delivery screenshot)', name: 'Test Person Two' }, { where: 'On the review on Flipkart', name: 'no name, only "Flipkart Customer"' }]);
  const delivered = (text, ok = true) => deliveredToName({ ok, text });
  assert.deepEqual(
    [delivered('Delivered to Test Person Two at Home'), delivered('Delivered to: TEST PERSON at Front Door'), delivered('Delivered to Test P. Two'), delivered('Delivered to Test Person at'), delivered('Delivered to Customer at Home'), delivered('Delivered to Security guard at Gate'), delivered('Delivered to T3st Pers0n at Home'), delivered('Delivered to Test | Person at Home'), delivered('Your order was delivered to your address'), delivered('Delivered, Jul 23'), delivered('Delivered to Test Person Two at Home', false), deliveredToName(null)],
    ['Test Person Two', 'TEST PERSON', 'Test P. Two', 'Test Person', null, null, null, null, null, null, null, null],
  );
});

test('"Review not live": what we found among the reviews Flipkart shows, then a screenshot of the review from the Published tab of My Reviews, and to wait while it is on the Pending tab', () => {
  const result = { ...CHECK, review: { ok: true, kind: 'written', name: 'Test Person Two', tab: null, form: false }, found: null };
  const email = emailFor({ typeKey: 'reviewNotLive', row: row(), result, reviewer: 'Test Person Two' });
  assert.equal(email.subject, `Order ${ID}: review not found on Flipkart`);
  assert.equal(
    email.message,
    [
      'Hello Test Person Two,',
      `We looked for your review of Test Brand Steel Bottle on Flipkart, for your order ${ID}. It is not among the reviews Flipkart shows for this product, which we checked back to 01-07-2026.`,
      'Please send a screenshot of your review from the Published tab of My Reviews.',
      `How to find it:\n${REVIEW_STEPS}`,
      'If your review is still on the Pending tab, Flipkart has not published it yet. Please wait until it moves to Published, then send the screenshot.',
      'Thank you,\nThe support team',
    ].join('\n\n'),
  );
  const fact = (over) => whatIsWrong('reviewNotLive', { row: row(), result: { ...result, ...over } });
  assert.equal(fact({ review: { ...result.review, tab: 'pending' } }), 'Your review screenshot shows it on the Pending tab of My Reviews, so Flipkart had not published it yet.');
  assert.equal(fact({ review: { ...result.review, tab: 'published' } }), 'Your review screenshot shows it on the Published tab, but it is not among the reviews Flipkart shows for this product, which we checked back to 01-07-2026.');
  assert.equal(fact({ found: { how: 'notFound', before: 1 } }), 'We found a review with the same words, but it was posted before your order was delivered on 23-07-2026, so it does not count for this order.');
  assert.equal(fact({ review: { ...result.review, form: true }, flipkart: null }), 'Your review screenshot shows the review being written, not posted, and it is not among the reviews Flipkart shows for this product.');
  // Seen on Flipkart before, but gone from the reviews it shows now.
  assert.equal(fact({ found: { how: 'gone', kept: true, lastSeen: '2026-08-05', review: { name: 'Test Person Two' } } }), 'We last saw your review on Flipkart on 05-08-2026, but it is no longer among the reviews Flipkart shows for this product.');
});

test('"Possible misuse": in polite words, only what came before the day the offer started, with the dates; and to tell us if a date is wrong', () => {
  const misuse = (m) => ({ ...CHECK, misuse: { start: '2026-08-01', placed: null, delivered: null, posted: null, ...m } });
  const email = emailFor({ typeKey: 'possibleMisuse', row: row(), result: misuse({ placed: '2026-07-20', delivered: '2026-07-23' }), reviewer: 'Test Person Two' });
  assert.deepEqual([email.key, email.name, email.subject], ['possibleMisuse', 'Possible misuse', `Order ${ID}: dates before the offer started`]);
  assert.equal(
    email.message,
    [
      'Hello Test Person Two,',
      `We checked the dates for your Flipkart order ${ID} (Test Brand Steel Bottle). This offer started on 01-08-2026. Your purchase screenshot shows the order was placed on 20-07-2026 and your delivery screenshot shows it was delivered on 23-07-2026, both before that day.`,
      'If you think a date here is wrong, please reply and tell us.',
      'Thank you,\nThe support team',
    ].join('\n\n'),
  );
  assert.doesNotMatch(email.message, /misuse|cheat|fraud|fake|abuse/i, 'only what came before the start date');
  const fact = (m) => whatIsWrong('possibleMisuse', { row: row(), result: m === null ? null : misuse(m) });
  assert.equal(fact({ posted: { date: '2026-07-28', dateLatest: '2026-07-28', dateSaid: '28 Jul, 2026' } }), 'This offer started on 01-08-2026. Your review of this product on Flipkart was posted on 28-07-2026, before that day.');
  assert.equal(fact({ delivered: '2026-07-23', posted: { date: '2026-06-14', dateLatest: '2026-06-29', dateSaid: '1 month ago' } }), 'This offer started on 01-08-2026. Your delivery screenshot shows the order was delivered on 23-07-2026 and your review of this product on Flipkart was posted by 29-06-2026, both before that day.');
  // The full date the review screenshot shows, when the review was not found on Flipkart.
  assert.equal(fact({ shot: '2026-07-10' }), 'This offer started on 01-08-2026. Your review screenshot shows your review was posted on 10-07-2026, before that day.');
  assert.equal(fact({ placed: '2026-07-20', delivered: '2026-07-23', posted: { date: '2026-07-28', dateLatest: '2026-07-28' } }), 'This offer started on 01-08-2026. Your purchase screenshot shows the order was placed on 20-07-2026, your delivery screenshot shows it was delivered on 23-07-2026 and your review of this product on Flipkart was posted on 28-07-2026, all before that day.');
  // A result a staff member chose: a sentence that is still true.
  assert.deepEqual([fact(null), fact({})], ['Some dates for this order are before the day this offer started.', 'Some dates for this order are before the day this offer started.']);
});
