// Reading a Flipkart review screenshot on this computer (flipkart/review-read.js), copied from the Amazon checker's
// reading of a review picture and changed only for Flipkart's screens: made-up lines laid out the way each of
// Flipkart's screens shows a review, and two made-up drawn screenshots read by Tesseract. Never a real screenshot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReviewShot, readReviewShot, nameFits, pickReview, isNoise, photoLine, PENDING_NOTE, TYPING_NOTE } from '../flipkart/review-read.js';
import { BOTTLE } from './fixtures/flipkart/make-purchase-screenshots.mjs';
import { REVIEWER, OTHER_REVIEWER, WORDS } from './fixtures/flipkart/make-review-screenshots.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'flipkart');
const parts = (r) => ({ kind: r.kind, stars: r.stars, title: r.title, body: r.body, name: r.name, dateText: r.dateText, own: r.own, form: r.form, others: r.others, message: r.message, note: r.note });
const isBottle = (lines) => lines.some((t) => /Steel Bottle/.test(t));

/** A product's reviews in Flipkart's app, under the phone's top bar: two reviews, each ending "Verified Purchase · … ago". */
const APP_LIST = ['9:41 Vo 4G 71%', '< Ratings and Reviews', 'xx & xx xx 5.0 © Wonderful', 'Review for: Colour Blue', WORDS, `${REVIEWER}, Test City`, '7 Helpful', 'xx) Verified Purchase - 3 days ago', 'xx xx 4.0 > Nice product', 'Review for: Colour Blue', 'The lid is a bit tight.', `${OTHER_REVIEWER}..., Test Town`, '2 Helpful', '@ Verified Purchase - 9 days ago'];
/** The user's own reviews on Flipkart's website: two products, each review ending "Certified Buyer" and "Edit Delete Share". */
const WEB_MINE = ['My Reviews (2)', `${BOTTLE}`, '| 5* Terrific purchase', WORDS, `${REVIEWER} @ Certified Buyer 12 Sep, 2026 0 0`, 'Edit Delete Share', 'Test Brand Lunch Box 3 Containers', '| 3* Fair', 'Small lids.', `${REVIEWER} @ Certified Buyer 02 Aug, 2026 1 0`, 'Edit Delete Share'];

test("Flipkart's review screens, read from their lines: the rating as Flipkart writes it, the title, the words, the reviewer's name and the date; of several reviews only the user's; what \"My Reviews\" and the review being written do not show; nothing guessed", () => {
  // The app's list: the reviewer's review, its rating after the drawn stars, its date; a name Flipkart cut short still fits.
  assert.deepEqual(parts(parseReviewShot(APP_LIST, { reviewer: REVIEWER })), { kind: 'written', stars: 5, title: 'Wonderful', body: WORDS, name: REVIEWER, dateText: '3 days ago', own: false, form: false, others: 1, message: null, note: null });
  assert.deepEqual(parts(parseReviewShot(APP_LIST, { reviewer: OTHER_REVIEWER })), { kind: 'written', stars: 4, title: 'Nice product', body: 'The lid is a bit tight.', name: `${OTHER_REVIEWER}...`, dateText: '9 days ago', own: false, form: false, others: 1, message: null, note: null });
  // None under the reviewer's name (FLIPKART-PLAN.md point 4: never a random review).
  const nobody = parseReviewShot(APP_LIST, { reviewer: 'Someone Else' });
  assert.deepEqual([nobody.kind, nobody.body, nobody.name, nobody.others, nobody.why], ['unknown', null, null, 1, "it shows 2 reviews, and which one is the user's could not be told: none is under the reviewer's name in the sheet"]);
  // The website's own reviews: the one for the product ordered; its rating badge read as "5*", the tick before "Certified Buyer" left out.
  assert.deepEqual(parts(parseReviewShot(WEB_MINE, { reviewer: REVIEWER, productIs: isBottle })), { kind: 'written', stars: 5, title: 'Terrific purchase', body: WORDS, name: REVIEWER, dateText: '12 Sep, 2026', own: true, form: false, others: 1, message: null, note: null });
  assert.equal(parseReviewShot(['| 5% Wonderful', WORDS, `${REVIEWER} V Certified Buyer, Test City 3 months ago`]).dateText, '3 months ago', 'a star read as "%"; the date after the city');
  assert.deepEqual([parseReviewShot(['| 5% Wonderful', WORDS, `${REVIEWER} V Certified Buyer 12 Sep, 2026`]).stars, parseReviewShot(['| 5% Wonderful', WORDS, `${REVIEWER} V Certified Buyer 12 Sep, 2026`]).name], [5, REVIEWER]);
  // The app's own reviews ("My Reviews"): the title, and the date beside the stars, which are drawn and not counted; no name. Its
  // "Pending" and "Published" tabs: it does not show that the review is live (which tab is open is not worked out).
  const appMine = parseReviewShot(['5:25 56+', '< My Reviews', 'Pending Published', 'Product Reviews written by you..', `${BOTTLE.slice(0, 20)}...`, '=) Terrific purchase', 'xx. xx. 49. x 9. 25 Aug 2026', WORDS, 'xxx Delete © Edit'], { productIs: isBottle });
  assert.deepEqual(parts(appMine), { kind: 'written', stars: null, title: 'Terrific purchase', body: WORDS, name: null, dateText: '25 Aug 2026', own: true, form: false, others: 0, message: null, note: PENDING_NOTE });
  assert.equal(appMine.pending, true);
  assert.deepEqual([parseReviewShot(['< My Reviews', 'Pending Published', 'Product Reviews written by you..']).note, parseReviewShot(WEB_MINE, { reviewer: REVIEWER, productIs: isBottle }).note], [PENDING_NOTE, null], "only the app's page with its tabs");
  // A customer's photo opened from a review: the words printed on the product are not the review's; the badge's star read as "%)".
  assert.deepEqual(parts(parseReviewShot(['MADE FOR MEN', 'GENTLE ON SKIN', '5%) Wonderful', WORDS, `${REVIEWER} 2 days ago 1@ 0 0`])), { kind: 'written', stars: 5, title: 'Wonderful', body: WORDS, name: REVIEWER, dateText: '2 days ago', own: false, form: false, others: 0, message: null, note: null });
  // "Helpful" ends a review when the "Verified Purchase" line under it is not read, an icon read between them; a name Flipkart cut
  // short, then the city; a "Certified Buyer" read with a slip; a page's address with "certifiedBuyer=" in it is not a review.
  const helpful = parseReviewShot(['xx xx 4.0 • Good choice', 'Review for: Colour Blue', WORDS, 'Test Revi.... Test City', 'x', '9 Helpful', 'Purchase: Today', 'xx xx 5.0 • Nice', 'Review for: Colour Blue', 'Fine.', 'Someone Else, Test Town', '2 Helpful'], { reviewer: REVIEWER });
  assert.deepEqual([helpful.kind, helpful.title, helpful.body, helpful.name, helpful.dateText, helpful.others], ['written', 'Good choice', WORDS, 'Test Revi....', 'Today', 1]);
  assert.deepEqual([parseReviewShot(['| 5* Wonderful', WORDS, `${REVIEWER} @ Certifed Buyer 12 Sep, 2026`]).name, parseReviewShot(['flipkart.com/test-bottle/product-reviews/itm1?pid=TEST&certifiedBuyer=false', 'xx 4.0 • Good', WORDS, `${REVIEWER}, Test City`, '3 Helpful', 'Verified Purchase · 5 dayz ago']).name], [REVIEWER, REVIEWER]);
  assert.equal(parseReviewShot(['xx 4.0 • Good', WORDS, `${REVIEWER}, Test City`, '3 Helpful', 'Verified Purchase · 5 dayz ago']).dateText, '5 days ago', 'a slip in "days"');
  // Only the review's own column: the account's menu beside "My Reviews" on the website is left out.
  const column = parseReviewShot([{ text: 'My Reviews (1)', left: 390 }, { text: BOTTLE, left: 488 }, { text: 'MY ORDERS', left: 140 }, { text: '| 5* Terrific purchase', left: 483 }, { text: WORDS, left: 488 }, { text: 'Account Settings Profile', left: 142 }, { text: `${REVIEWER} @ Certified Buyer 12 Sep, 2026 0 0`, left: 488 }, { text: 'Edit Delete Share', left: 488 }], { productIs: isBottle });
  assert.deepEqual([column.body, column.name, column.own], [WORDS, REVIEWER, true]);
  // The review being written, in the app and on the website: its words, and the title when typed; no name, no rating counted.
  assert.deepEqual(parts(parseReviewShot(['10:41 53%', 'x Share your experience', BOTTLE, 'Delivered on Aug 21, 2026', 'What did you love about it?', 'Tell us more', `| ${WORDS}`, 'Home Play Categories Account Cart'])), { kind: 'written', stars: null, title: null, body: WORDS, name: null, dateText: null, own: false, form: true, others: 0, message: null, note: TYPING_NOTE });
  assert.deepEqual(parts(parseReviewShot(['Ratings & Reviews', 'Review this product', 'Description', WORDS, 'Title (optional)', 'Wonderful', 'SUBMIT'])), { kind: 'written', stars: null, title: 'Wonderful', body: WORDS, name: null, dateText: null, own: false, form: true, others: 0, message: null, note: TYPING_NOTE });
  // The phone's keyboard under the words being typed is not part of them; the website's page found by its address, its words in their column.
  assert.equal(parseReviewShot(['Share your experience', 'Tell us more', WORDS, '1 2 3 4 5 6 7 8 9 0', 'ABC space return']).body, WORDS);
  const web = parseReviewShot([{ text: 'flipkart.com/test-bottle/write-review/itm1', left: 10 }, { text: 'Description', left: 190 }, { text: WORDS, left: 190 }, { text: 'Why review a product?', left: 0 }, { text: 'Your feedback helps others', left: 0 }]);
  assert.deepEqual([web.kind, web.form, web.body, web.title, web.note], ['written', true, WORDS, null, TYPING_NOTE]);
  assert.equal(parseReviewShot(['Share your experience', BOTTLE, 'Tell us more', 'Home Play Categories Account Cart']).why, "it is Flipkart's page for writing a review, but no words are written in it");
  // A rating only: the rating and no words; Flipkart's words for it are kept, and never taken for the review's words.
  const rating = parseReviewShot([BOTTLE, '| 4* ', 'Thanks for rating', `${REVIEWER} @ Certified Buyer 12 Sep, 2026`]);
  assert.deepEqual([rating.kind, rating.stars, rating.body, rating.message], ['rating', 4, null, 'Thanks for rating']);
  assert.equal(parseReviewShot(['Thanks for rating']).why, 'it says "Thanks for rating", but the rating could not be read');
  // Flipkart not accepting the review; its page once a review is sent; words on a product in a photo; nothing at all.
  assert.deepEqual([parseReviewShot(['Your review was rejected as it does not meet our guidelines']).kind, parseReviewShot(['Sorry, you are not eligible to review this product']).message], ['refused', 'Sorry, you are not eligible to review this product']);
  assert.equal(parseReviewShot(['Thank you for your review!', 'It will be live soon']).why, "it is Flipkart's page saying a review was sent, which does not show the review");
  assert.equal(parseReviewShot(['GENTLE ON SKIN', 'MADE FOR MEN', '100 G']).why, 'only words printed on a product in a photo could be read');
  assert.equal(parseReviewShot(['Some words', 'and some more words here']).why, 'it shows no review, no rating and no message from Flipkart');
  assert.equal(parseReviewShot([]).kind, 'unknown');
});

test('the reviewer named in the sheet fits a name on the screenshot when one is a shorter form of the other, either way (a word left out, cut short or an initial), or read with a slip; never "Flipkart Customer"; of several reviews, the only one that fits, none when two fit, else the user\'s own for the product ordered', () => {
  assert.deepEqual([nameFits(REVIEWER, REVIEWER), nameFits(REVIEWER, 'Test Revi...'), nameFits(REVIEWER, 'Test R'), nameFits(REVIEWER, 'Tesl Reviewer'), nameFits(REVIEWER, 'Flipkart Customer'), nameFits(REVIEWER, 'Other Person'), nameFits(REVIEWER, 'T R'), nameFits('', REVIEWER)], [true, true, true, true, false, false, false, false]);
  // The same initial on both sides fits too, with a whole word the same ("T Reviewer Test…" and "T Reviewer Testname"); initials alone never do.
  assert.deepEqual([nameFits('T Reviewer Test', 'T Reviewer Testname'), nameFits('Reviewer T', 'Reviewer T'), nameFits('T R', 'T R'), nameFits('T Reviewer', 'R Reviewer')], [true, true, false, false]);
  // Either way: the sheet's name shorter (only the first name, a surname cut short, an initial) or the screenshot's.
  assert.deepEqual([nameFits('Test', 'Test Reviewer'), nameFits('Test Rev', 'Test Reviewer'), nameFits('T Reviewer', 'Test Reviewer'), nameFits('Test Reviewer', 'Test'), nameFits('Testrev Reviewer', 'Test Reviewer'), nameFits('Test Reviewer One', 'Test Reviewer Two'), nameFits('Test', 'Other Reviewer'), nameFits('Flipkart Customer', 'Flipkart Customer')], [true, true, true, true, true, false, false, false]);
  const a = { name: REVIEWER, own: false, lines: ['a'] };
  const b = { name: OTHER_REVIEWER, own: false, lines: ['b'] };
  assert.deepEqual([pickReview([a, b], { reviewer: OTHER_REVIEWER }).chosen, pickReview([a]).chosen, pickReview([a, b]).chosen, pickReview([]).chosen], [b, a, null, null]);
  // Two reviews whose names both fit: none.
  assert.deepEqual(pickReview([a, b], { reviewer: 'Test Reviewer' }), { chosen: null, others: 1, fitting: 2 });
  assert.equal(parseReviewShot(APP_LIST, { reviewer: 'Test Reviewer' }).why, "it shows 2 reviews, and which one is the user's could not be told: 2 of them are under names that fit the reviewer's name in the sheet");
  // The user's own reviews ("My Reviews", "Edit" and "Delete" under each), all under the user's name: the one for the product ordered.
  const mine1 = { name: REVIEWER, own: true, lines: [BOTTLE] };
  const mine2 = { name: REVIEWER, own: true, lines: ['Test Brand Lunch Box'] };
  assert.equal(pickReview([mine1, mine2], { reviewer: REVIEWER, productIs: isBottle }).chosen, mine1);
  assert.deepEqual([isNoise('xx x 9. 9 9 9. x'), isNoise(WORDS), photoLine('MADE FOR MEN'), photoLine(WORDS)], [true, false, true, false]);
});

test("the made-up review screenshots, read by Tesseract on this computer: the app's list (the reviewer's review of two) and the website's own reviews", async () => {
  const list = await readReviewShot([join(FIX, 'review-app-list.png')], { reviewer: REVIEWER });
  assert.equal(list.ok, true, list.problem);
  assert.deepEqual(parts(list), { kind: 'written', stars: 5, title: 'Wonderful', body: WORDS, name: REVIEWER, dateText: '3 days ago', own: false, form: false, others: 1, message: null, note: null });
  const other = await readReviewShot([join(FIX, 'review-app-list.png')], { reviewer: OTHER_REVIEWER });
  assert.deepEqual([other.stars, other.title, other.name, other.dateText], [4, 'Nice product', OTHER_REVIEWER, '9 days ago']);
  const mine = await readReviewShot([join(FIX, 'review-web-mine.png')], { reviewer: REVIEWER, productIs: isBottle });
  assert.deepEqual(parts(mine), { kind: 'written', stars: 5, title: 'Terrific purchase', body: WORDS, name: REVIEWER, dateText: '12 Sep, 2026', own: true, form: false, others: 0, message: null, note: null });
  const missing = await readReviewShot([join(FIX, 'no-such-picture.png')]);
  assert.deepEqual([missing.ok, missing.kind, missing.unreadable], [false, 'unknown', true]);
});
