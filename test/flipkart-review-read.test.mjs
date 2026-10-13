// Reading a Flipkart review screenshot on this computer (flipkart/review-read.js), copied from the Amazon checker's
// reading of a review picture and changed only for Flipkart's screens: made-up lines laid out the way each of
// Flipkart's screens shows a review, and two made-up drawn screenshots read by Tesseract. Never a real screenshot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReviewShot, readReviewShot, nameFits, pickReview, isNoise, photoLine } from '../flipkart/review-read.js';
import { BOTTLE } from './fixtures/flipkart/make-purchase-screenshots.mjs';
import { REVIEWER, OTHER_REVIEWER, WORDS } from './fixtures/flipkart/make-review-screenshots.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'flipkart');
const parts = (r) => ({ kind: r.kind, stars: r.stars, title: r.title, body: r.body, name: r.name, dateText: r.dateText, own: r.own, form: r.form, others: r.others, message: r.message });
const isBottle = (lines) => lines.some((t) => /Steel Bottle/.test(t));

/** A product's reviews in Flipkart's app, under the phone's top bar: two reviews, each ending "Verified Purchase · … ago". */
const APP_LIST = ['9:41 Vo 4G 71%', '< Ratings and Reviews', 'xx & xx xx 5.0 © Wonderful', 'Review for: Colour Blue', WORDS, `${REVIEWER}, Test City`, '7 Helpful', 'xx) Verified Purchase - 3 days ago', 'xx xx 4.0 > Nice product', 'Review for: Colour Blue', 'The lid is a bit tight.', `${OTHER_REVIEWER}..., Test Town`, '2 Helpful', '@ Verified Purchase - 9 days ago'];
/** The user's own reviews on Flipkart's website: two products, each review ending "Certified Buyer" and "Edit Delete Share". */
const WEB_MINE = ['My Reviews (2)', `${BOTTLE}`, '| 5* Terrific purchase', WORDS, `${REVIEWER} @ Certified Buyer 12 Sep, 2026 0 0`, 'Edit Delete Share', 'Test Brand Lunch Box 3 Containers', '| 3* Fair', 'Small lids.', `${REVIEWER} @ Certified Buyer 02 Aug, 2026 1 0`, 'Edit Delete Share'];

test("Flipkart's review screens, read from their lines: the rating as Flipkart writes it, the title, the words, the reviewer's name and the date; of several reviews only the user's; nothing guessed", () => {
  // The app's list: the reviewer's review, its rating after the drawn stars, its date; a name Flipkart cut short still fits.
  assert.deepEqual(parts(parseReviewShot(APP_LIST, { reviewer: REVIEWER })), { kind: 'written', stars: 5, title: 'Wonderful', body: WORDS, name: REVIEWER, dateText: '3 days ago', own: false, form: false, others: 1, message: null });
  assert.deepEqual(parts(parseReviewShot(APP_LIST, { reviewer: OTHER_REVIEWER })), { kind: 'written', stars: 4, title: 'Nice product', body: 'The lid is a bit tight.', name: `${OTHER_REVIEWER}...`, dateText: '9 days ago', own: false, form: false, others: 1, message: null });
  // None under the reviewer's name (FLIPKART-PLAN.md point 4: never a random review).
  const nobody = parseReviewShot(APP_LIST, { reviewer: 'Someone Else' });
  assert.deepEqual([nobody.kind, nobody.body, nobody.name, nobody.others, nobody.why], ['unknown', null, null, 1, "it shows 2 reviews, and which one is the user's could not be told: none is under the reviewer's name in the sheet"]);
  // The website's own reviews: the one for the product ordered; its rating badge read as "5*", the tick before "Certified Buyer" left out.
  assert.deepEqual(parts(parseReviewShot(WEB_MINE, { reviewer: REVIEWER, productIs: isBottle })), { kind: 'written', stars: 5, title: 'Terrific purchase', body: WORDS, name: REVIEWER, dateText: '12 Sep, 2026', own: true, form: false, others: 1, message: null });
  assert.equal(parseReviewShot(['| 5% Wonderful', WORDS, `${REVIEWER} V Certified Buyer, Test City 3 months ago`]).dateText, '3 months ago', 'a star read as "%"; the date after the city');
  assert.deepEqual([parseReviewShot(['| 5% Wonderful', WORDS, `${REVIEWER} V Certified Buyer 12 Sep, 2026`]).stars, parseReviewShot(['| 5% Wonderful', WORDS, `${REVIEWER} V Certified Buyer 12 Sep, 2026`]).name], [5, REVIEWER]);
  // The app's own reviews: no name, and a rating drawn as stars is not counted.
  const appMine = parseReviewShot(['5:25 56+', '< My Reviews', 'Pending Published', 'Product Reviews written by you..', BOTTLE, 'xx x 9. 9 9 9. x', WORDS, 'Delete © Edit'], { productIs: isBottle });
  assert.deepEqual(parts(appMine), { kind: 'written', stars: null, title: null, body: WORDS, name: null, dateText: null, own: true, form: false, others: 0, message: null });
  // The review being written, in the app and on the website: its words, and the title when typed; no name, no rating counted.
  assert.deepEqual(parts(parseReviewShot(['10:41 53%', 'x Share your experience', BOTTLE, 'Delivered on Aug 21, 2026', 'What did you love about it?', 'Tell us more', `| ${WORDS}`, 'Home Play Categories Account Cart'])), { kind: 'written', stars: null, title: null, body: WORDS, name: null, dateText: null, own: false, form: true, others: 0, message: null });
  assert.deepEqual(parts(parseReviewShot(['Ratings & Reviews', 'Review this product', 'Description', WORDS, 'Title (optional)', 'Wonderful', 'SUBMIT'])), { kind: 'written', stars: null, title: 'Wonderful', body: WORDS, name: null, dateText: null, own: false, form: true, others: 0, message: null });
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

test('the reviewer named in the sheet fits a name on the screenshot the way Flipkart shows it: cut short, by an initial, or read with a slip; never "Flipkart Customer"; of several reviews, the reviewer\'s, else the user\'s own for the product ordered', () => {
  assert.deepEqual([nameFits(REVIEWER, REVIEWER), nameFits(REVIEWER, 'Test Revi...'), nameFits(REVIEWER, 'Test R'), nameFits(REVIEWER, 'Tesl Reviewer'), nameFits(REVIEWER, 'Flipkart Customer'), nameFits(REVIEWER, 'Other Person'), nameFits(REVIEWER, 'T R'), nameFits('', REVIEWER)], [true, true, true, true, false, false, false, false]);
  const a = { name: REVIEWER, own: false, lines: ['a'] };
  const b = { name: OTHER_REVIEWER, own: false, lines: ['b'] };
  assert.deepEqual([pickReview([a, b], { reviewer: OTHER_REVIEWER }).chosen, pickReview([a]).chosen, pickReview([a, b]).chosen, pickReview([]).chosen], [b, a, null, null]);
  const mine1 = { name: REVIEWER, own: true, lines: [BOTTLE] };
  const mine2 = { name: REVIEWER, own: true, lines: ['Test Brand Lunch Box'] };
  assert.equal(pickReview([mine1, mine2], { reviewer: REVIEWER, productIs: isBottle }).chosen, mine1);
  assert.deepEqual([isNoise('xx x 9. 9 9 9. x'), isNoise(WORDS), photoLine('MADE FOR MEN'), photoLine(WORDS)], [true, false, true, false]);
});

test("the made-up review screenshots, read by Tesseract on this computer: the app's list (the reviewer's review of two) and the website's own reviews", async () => {
  const list = await readReviewShot([join(FIX, 'review-app-list.png')], { reviewer: REVIEWER });
  assert.equal(list.ok, true, list.problem);
  assert.deepEqual(parts(list), { kind: 'written', stars: 5, title: 'Wonderful', body: WORDS, name: REVIEWER, dateText: '3 days ago', own: false, form: false, others: 1, message: null });
  const other = await readReviewShot([join(FIX, 'review-app-list.png')], { reviewer: OTHER_REVIEWER });
  assert.deepEqual([other.stars, other.title, other.name, other.dateText], [4, 'Nice product', OTHER_REVIEWER, '9 days ago']);
  const mine = await readReviewShot([join(FIX, 'review-web-mine.png')], { reviewer: REVIEWER, productIs: isBottle });
  assert.deepEqual(parts(mine), { kind: 'written', stars: 5, title: 'Terrific purchase', body: WORDS, name: REVIEWER, dateText: '12 Sep, 2026', own: true, form: false, others: 0, message: null });
  const missing = await readReviewShot([join(FIX, 'no-such-picture.png')]);
  assert.deepEqual([missing.ok, missing.kind, missing.unreadable], [false, 'unknown', true]);
});
