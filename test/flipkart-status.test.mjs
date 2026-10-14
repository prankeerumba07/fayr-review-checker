// Steps 8 and 9 of a Flipkart row's check (flipkart/check.js, flipkart/final.js):
// the review found on Flipkart compared with the review screenshot, and the
// row's Status, Type and Note, with the Amazon checker's Statuses, Types,
// words and rules. Pass only when both screenshots match the sheet and the
// review is live on Flipkart under the user's name with the screenshot's
// words, posted on or after the delivery day (or a star rating only, as on
// Amazon); a review not found, or that cannot be told to be the user's, is
// for a staff member, never a Fail. Made-up rows, readings and reviews only:
// nothing is downloaded, no picture is read and no page is opened.
// Run: node test/flipkart-status.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from '../flipkart/check.js';
import { FINAL_WORDS, TYPE_WORDS, TYPE_KEYS, TYPE_FINAL, finalSentence, lowerFirst, finalFromWords, finalOfFile } from '../flipkart/final.js';
import { orderIdsIn, datesIn, amountsIn } from '../flipkart/screen-text.js';
import { parseDelivery } from '../flipkart/delivery-read.js';
import { parseReviewShot } from '../flipkart/review-read.js';
import { DEFAULT_SETTINGS, TYPE_KEYS as AMAZON_TYPE_KEYS } from '../amazon/settings.js';
import { FINAL_WORDS as AMAZON_FINAL_WORDS, TYPE_FINAL as AMAZON_TYPE_FINAL, finalSentence as amazonFinalSentence } from '../amazon/final.js';

const drive = (id) => `https://drive.google.com/open?id=${id}`;
const cell = (over = {}) => ({ text: '', link: '', links: [], mismatch: null, picture: null, ...over });
const ID = 'OD100000000000000002';
const ROW = {
  id: 'r00000000000b',
  row: 2,
  n: 1,
  orderId: { text: ID, value: ID },
  orderDate: { text: '20-07-2026', value: '2026-07-20' },
  amount: { text: '349', value: 349 },
  product: { text: 'Test Brand Steel Bottle' },
  shots: { order: cell({ links: [drive('1TestOrder02')] }), delivery: cell({ links: [drive('1TestDelivery02')] }), review: cell(), reviewShot: cell({ links: [drive('1TestReview02')] }) },
};
const reading = (texts, over = {}) => ({ ok: true, problem: null, confidence: 90, wordCount: 40, hindi: true, lines: texts.map((text) => ({ text })), texts, text: texts.join('\n'), orderIds: orderIdsIn(texts), dates: datesIn(texts), amounts: amountsIn(texts), ...over });
const BOTTLE = 'Test Brand Steel Bottle 1 L, Blue';
const PURCHASE = ['< Order Details Help', BOTTLE, `Order #${ID}`, 'Your Order has been placed, Mon 20th Jul', 'Price details', 'Listing price ₹999', 'Selling price ⓘ ₹329', 'Total fees ⌄ ₹30', 'Other discount ⌄ -₹10', 'Total amount ₹349'];
const deliveryReading = (texts, over = {}) => ({ ...reading(texts), ...parseDelivery(texts), ...over });
const DELIVERY = ['< Order Details Help', BOTTLE, `Order #${ID}`, '© Delivered, Thu 23rd Jul ^', 'Return policy ended on Thu 30th Jul', 'Delivery details', 'Delivered to Test Person at Home'];
const reviewReading = (texts, over = {}, opts = {}) => ({ ...reading(texts), ...parseReviewShot(texts, opts), ...over });
const REVIEWER = 'Test Reviewer One';
const WORDS = { title: 'Terrific purchase', text: 'Keeps water cold all day and the grip is good.' };
const REVIEW = ['My Reviews (1)', BOTTLE, '| 5* Terrific purchase', WORDS.text, `${REVIEWER} @ Certified Buyer 12 Sep, 2026`, 'Edit Delete Share'];
/** The review being typed, which shows no reviewer's name. */
const TYPING = ['Write a Review', 'Rate this product', 'Review this product', 'Description', WORDS.text, 'Title (optional)', 'Terrific purchase', 'SUBMIT'];
const CAMPAIGN = { name: 'Test Brand Bottles', brand: 'Test Brand', products: [{ pid: 'TESTPID0000001', name: BOTTLE, short: 'Test Brand Steel Bottle 1 L', variants: [] }, { pid: 'TESTPID0000009', name: 'Test Brand Lunch Box 3 Containers, Green', short: 'Test Brand Lunch Box 3 Containers', variants: [] }] };
const NOW = () => new Date('2026-10-13T05:00:00.000Z');
const made = (i, over = {}) => ({ id: `00000000-0000-4000-8000-00000000010${i}`, name: `Made-up Reviewer ${i}`, stars: 4, title: 'Nice', text: `Made-up review number ${i}, about something else entirely.`, dateSaid: '3 days ago', date: '2026-10-10', dateLatest: '2026-10-10', city: 'Test Town', certified: true, reviewFor: null, link: null, page: 1, ...over });
const MINE_ID = '00000000-0000-4000-8000-000000000003';
const MINE_LINK = `https://www.flipkart.com/reviews/TESTPID0000001:1725?reviewId=${MINE_ID}`;
const MINE = made(3, { id: MINE_ID, name: REVIEWER, stars: 5, ...WORDS, dateSaid: '12 days ago', date: '2026-10-01', dateLatest: '2026-10-01', link: MINE_LINK });
const READ = { pid: 'TESTPID0000001', link: 'https://www.flipkart.com/test-brand-steel-bottle/product-reviews/itmtestbottle01?pid=TESTPID0000001&marketplace=FLIPKART', readAt: '2026-10-13T05:00:00.000Z', since: null, pages: 1, total: 3, end: 'last page', stoppedAt: null, says: '3 reviews read: all the reviews Flipkart shows.', links: true, reviews: [made(1), made(2), MINE], product: { pid: 'TESTPID0000001', name: BOTTLE, rating: 4.2, ratings: 100, reviews: 3 } };

/** A pretend screenshots.js: what each cell gives (a picture, unless said otherwise). */
const pretend = (answers) => ({
  async forCell(rowId, which) {
    const a = answers[which] ?? { files: ['/made-up/picture.png'], problems: [] };
    return { files: [], problems: [], types: [], records: [], ...a };
  },
});
/** One check with made-up readings and a pretend reading of Flipkart's reviews. */
async function check({ row = ROW, answers = {}, read = reading(PURCHASE), delivery = deliveryReading(DELIVERY), review = null, reviews = READ.reviews, answer = {}, ...opts } = {}) {
  const events = [];
  const result = await runCheck({
    row,
    screenshots: pretend(answers),
    readOrder: async () => read,
    readDelivery: async () => delivery,
    readReview: async (files, o) => review ?? reviewReading(REVIEW, {}, { reviewer: o?.reviewer, productIs: o?.productIs }),
    reviewer: REVIEWER,
    campaigns: [CAMPAIGN],
    reviews: async () => ({ ...READ, ...answer, reviews }),
    now: NOW,
    emit: (e) => events.push(e),
    ...opts,
  });
  return { ...result, events };
}
const steps89 = (r) => [r.steps[7].state, r.steps[7].detail, r.steps[8].state, r.steps[8].detail];
const status = (r) => [r.final, r.status, r.typeKey, r.type];

test("the Statuses, Types and words are the Amazon checker's own", () => {
  assert.deepEqual(FINAL_WORDS, AMAZON_FINAL_WORDS);
  assert.deepEqual(TYPE_KEYS, AMAZON_TYPE_KEYS, 'every Type, in the order the Amazon screen lists them');
  assert.deepEqual({ ...TYPE_WORDS }, { ...DEFAULT_SETTINGS.typeWords });
  assert.deepEqual({ ...TYPE_FINAL }, { ...AMAZON_TYPE_FINAL });
  for (const [k, why] of [['pass', 'all is well'], ['fail', 'the order ID is different.'], ['manual', 'the review was not found']]) assert.equal(finalSentence(k, why), amazonFinalSentence(k, why));
  assert.equal(lowerFirst('The review is not there.'), 'the review is not there');
  assert.deepEqual(['Pass', 'failed', 'Needs Manual Staff Checking', 'Maybe'].map(finalFromWords), ['pass', 'fail', 'manual', null]);
  // A Status the uploaded file already had, as on Amazon: its own, else the one its Type gives, else Pass for "Verified", else a staff member's.
  assert.deepEqual([{ status: 'Fail' }, { status: 'Done', type: 'Order ID is not matching' }, { status: 'Verified' }, { status: 'Done' }, { status: '', type: 'Verified' }, null].map(finalOfFile), ['fail', 'fail', 'pass', 'manual', null, null]);
});

test('step 8 compares the review found with the review screenshot: the name (and the Reviewer Name column), the words, the stars and the day it was posted; all matching, the row passes as Verified, with its own link on Flipkart', async () => {
  const r = await check();
  assert.deepEqual(steps89(r), ['pass', "The reviewer's name on Flipkart, \"Test Reviewer One\", is the name on the review screenshot. It is the name in the Reviewer Name column too. The review screenshot shows the same words as the review on Flipkart. Both show 5 stars. It was posted on 01-10-2026, on or after 23-07-2026, the day the order was delivered.", 'pass', 'Pass: Verified.']);
  assert.deepEqual(status(r), ['pass', 'Pass', 'verified', 'Verified']);
  assert.equal(r.finalSays, "This transaction passed: the purchase screenshot and the delivery screenshot match the form, and the review is live on Flipkart under the user's name, with the review screenshot's words, posted on or after the day the order was delivered.");
  assert.equal(r.note, `${r.finalSays} The reviewer's name on Flipkart, "Test Reviewer One", is the name on the review screenshot. It is the name in the Reviewer Name column too. The review screenshot shows the same words as the review on Flipkart. Both show 5 stars. It was posted on 01-10-2026, on or after 23-07-2026, the day the order was delivered.`);
  assert.equal(r.found.review.link, MINE_LINK, "the review's own link, as Flipkart's reviews pages sent it");
  assert.deepEqual(r.events.filter((e) => e.event === 'action').slice(-2).map((e) => e.says), ['Writing the Status, Type and Note', 'Done: Pass (Verified)']);
  // Only part of the words on the screenshot, a name written another way, a day Flipkart gives only roughly, and stars only one side shows: still a Pass.
  const part = await check({ reviews: [made(1), { ...MINE, name: 'test reviewer one', text: `${WORDS.text} It also fits in the car's cup holder, and the paint has not chipped after a month of daily use.`, stars: null, dateSaid: '1 month ago', date: '2026-07-20', dateLatest: '2026-09-28' }] });
  assert.deepEqual([part.final, part.steps[7].detail], ['pass', "The reviewer's name on Flipkart, \"test reviewer one\", is the name on the review screenshot. It is the name in the Reviewer Name column too. The review screenshot shows part of the review's words on Flipkart. The stars were not compared, because Flipkart shows none for the review. Flipkart says it was posted \"1 month ago\", which can be on or after 23-07-2026, the day the order was delivered."]);
  // No name on the review screenshot (the review being typed): the reviewer's name in the sheet is the name the review is found under, and finding it shows it is live.
  const typed = await check({ review: reviewReading(TYPING) });
  assert.deepEqual([typed.final, typed.steps[7].detail.split('. ').slice(0, 2)], ['pass', ["The reviewer's name on Flipkart, \"Test Reviewer One\", is the name in the Reviewer Name column", 'The review screenshot shows the same words as the review on Flipkart']]);
});

test('step 8 finds what does not match, for a staff member, never a Fail: other stars, a Reviewer Name column with another name, or no day to tell when the review was posted', async () => {
  const stars = await check({ reviews: [{ ...MINE, stars: 2 }] });
  assert.deepEqual([stars.steps[7].state, ...status(stars)], ['fail', 'manual', 'Needs Manual Staff Checking', 'reviewShotNotMatching', 'Review screenshot not matching']);
  assert.match(stars.steps[7].detail, / Both|The review screenshot shows 5 stars, but the review on Flipkart has 2 stars\.$/);
  assert.equal(stars.finalSays, 'A staff member needs to check this transaction because the review screenshot shows 5 stars, but the review on Flipkart has 2 stars.');
  assert.match(stars.note, /^A staff member needs to check this transaction because the review screenshot shows 5 stars, but the review on Flipkart has 2 stars\. A staff member must check which review is the user's\. The purchase screenshot and the delivery screenshot match the form\. The reviewer's name on Flipkart/);
  const column = await check({ reviewer: 'Another Made-up Person' });
  assert.deepEqual(status(column), ['manual', 'Needs Manual Staff Checking', 'reviewerNotMatching', 'Reviewer name is different']);
  assert.equal(column.finalSays, 'A staff member needs to check this transaction because the reviewer\'s name on Flipkart, "Test Reviewer One", is not the name in the Reviewer Name column, "Another Made-up Person".');
  const noDay = await check({ has: { orderDate: false }, read: reading(PURCHASE.filter((t) => !/placed/.test(t))), delivery: deliveryReading(['< Order Details Help', BOTTLE, `Order #${ID}`, 'Delivered before time']) });
  assert.deepEqual([noDay.typeKey, noDay.final], ['somethingElse', 'manual']);
  assert.equal(noDay.finalSays, 'A staff member needs to check this transaction because neither the delivery screenshot nor the purchase screenshot shows a day, so whether the review was posted after the order was delivered could not be checked.');
});

test("Flipkart's own cases are for a staff member, never a Fail, with a Note that says why: not among the reviews Flipkart shows (older than they are, on the Published tab, or being written), words under another name, under \"Flipkart Customer\" or with no name to check, two that fit, one posted before the delivery day, Flipkart stopping the reading, no live campaign", async () => {
  const notThere = await check({ reviews: [made(1), made(2)], answer: { total: 2 } });
  assert.deepEqual([...status(notThere), steps89(notThere)[0]], ['manual', 'Needs Manual Staff Checking', 'reviewNotLive', 'Review not live', 'not-reached']);
  assert.equal(notThere.note, 'A staff member needs to check this transaction because the review is not among the 2 reviews Flipkart shows for the product. It may not be public yet. The purchase screenshot and the delivery screenshot match the form.');
  const older = await check({ reviews: [made(1), made(2, { date: '2026-08-01', dateLatest: '2026-08-01' })], answer: { total: 1519 } });
  assert.equal(older.finalSays, 'A staff member needs to check this transaction because the review is not among the 2 reviews Flipkart shows for the product, and the order was delivered on 23-07-2026, before the oldest of them, so the review may be among the older ones Flipkart does not show.');
  const published = await check({ reviews: [made(1)], answer: { total: 1 }, review: reviewReading(['< My Reviews', 'Pending Published', 'Product Reviews written by you..', BOTTLE, 'Terrific purchase', WORDS.text, 'Delete Edit'], {}, { tab: 'published' }) });
  assert.deepEqual([published.typeKey, published.finalSays], ['reviewNotLive', 'A staff member needs to check this transaction because the review screenshot shows the review on the Published tab of My Reviews, yet it is not among the 1 review Flipkart shows for the product.']);
  const typing = await check({ reviews: [made(1)], answer: { total: 1 }, review: reviewReading(TYPING) });
  assert.deepEqual([typing.typeKey, typing.finalSays], ['reviewNotLive', 'A staff member needs to check this transaction because the review screenshot shows the review being written, and it is not among the 1 review Flipkart shows for the product, so it may not have been posted.']);
  const other = await check({ reviews: [made(1), { ...MINE, name: 'Test Reviewer Two' }] });
  assert.deepEqual([...status(other), other.finalSays], ['manual', 'Needs Manual Staff Checking', 'reviewerNotMatching', 'Reviewer name is different', 'A staff member needs to check this transaction because the review screenshot\'s words match a review on Flipkart under another name, "Test Reviewer Two", not under the name on the review screenshot, "Test Reviewer One".']);
  assert.match(other.note, /\. A staff member must check whose review it is\. The purchase screenshot and the delivery screenshot match the form\.$/);
  const customer = await check({ reviews: [made(1), { ...MINE, name: 'Flipkart Customer' }] });
  assert.deepEqual([customer.typeKey, customer.finalSays], ['reviewerNotMatching', 'A staff member needs to check this transaction because the review screenshot\'s words match a review on Flipkart that shows no name ("Flipkart Customer"), so whose review it is could not be checked.']);
  const noName = await check({ reviewer: null, review: reviewReading(TYPING), reviews: [made(1), { ...MINE, name: 'Test Reviewer Two' }] });
  assert.deepEqual([noName.typeKey, noName.finalSays], ['reviewerNotMatching', "A staff member needs to check this transaction because the review screenshot's words match a review on Flipkart, but there is no reviewer's name on the review screenshot or in the sheet to check it with."]);
  const twice = await check({ reviews: [MINE, { ...MINE, id: '00000000-0000-4000-8000-000000000004', link: null }] });
  assert.deepEqual([...status(twice), twice.finalSays], ['manual', 'Needs Manual Staff Checking', 'reviewLinkNeeded', 'Review link needed', "A staff member needs to check this transaction because 2 reviews on Flipkart under the name on the review screenshot have the review screenshot's words, so which one is the user's could not be told."]);
  const early = await check({ reviews: [made(1), { ...MINE, dateSaid: '4 months ago', date: '2026-06-10', dateLatest: '2026-07-10' }] });
  assert.deepEqual([early.typeKey, early.finalSays], ['reviewNotLive', "A staff member needs to check this transaction because the only review on Flipkart with the review screenshot's words under the name on the review screenshot was posted before 23-07-2026, the day the order was delivered, so it does not count for this order."]);
  assert.match(early.note, / A staff member must check whether that review is for this order\. /);
  const stopped = await check({ reviews: [made(1)], answer: { end: 'prevented', prevented: 'blocked', says: 'Flipkart prevented this check while its reviews were read: it refused the page. The review read before was kept.' } });
  assert.deepEqual([stopped.paused, stopped.typeKey, stopped.finalSays], [null, 'somethingElse', 'A staff member needs to check this transaction because Flipkart stopped the reading of its reviews before the review was found, so whether it is live could not be told.']);
  const noCampaign = await check({ campaigns: [] });
  assert.deepEqual([noCampaign.typeKey, noCampaign.finalSays], ['reviewLinkNeeded', 'A staff member needs to check this transaction because the review screenshot shows a written review, but the row uses no live campaign with a product read from Flipkart, so the review could not be looked for on Flipkart.']);
  assert.ok([notThere, older, published, typing, other, customer, noName, twice, early, stopped, noCampaign].every((r) => r.final === 'manual'), 'never a Fail');
});

test("the screenshots' problems as on Amazon: a different order ID, amount or product, not delivered, a missing screenshot fail; one that cannot be opened or read, a detail neither shows, and a possible reading mistake are for a staff member; they come before the review's, and each other problem is one more sentence", async () => {
  const id = await check({ read: reading(PURCHASE.map((t) => t.replace(ID, 'OD100000000000000777'))) });
  assert.deepEqual(status(id), ['fail', 'Fail', 'orderIdNotMatching', 'Order ID is not matching']);
  assert.equal(id.note, `This transaction failed because the order ID on the purchase screenshot does not match the order ID the user gave. The user gave order ID ${ID}, and the purchase screenshot shows order ID OD100000000000000777.`);
  const slip = await check({ read: reading(PURCHASE.map((t) => t.replace(ID, 'OD100000000000000003'))), delivery: deliveryReading(DELIVERY.map((t) => t.replace(ID, 'OD100000000000000003'))) });
  assert.deepEqual([slip.final, slip.typeKey, slip.finalSays], ['manual', 'orderIdNotMatching', 'A staff member needs to check this transaction because the order ID on both screenshots is one digit away from the order ID the user gave, which may be a reading mistake.']);
  const amount = await check({ read: reading(['< Order Details Help', BOTTLE, `Order #${ID}`, 'Your Order has been placed, Mon 20th Jul', 'Price details', 'Total amount ₹599']) });
  assert.deepEqual([amount.final, amount.typeKey, amount.finalSays], ['fail', 'orderDetailsNotMatching', 'This transaction failed because the amount on the purchase screenshot does not match the amount the user gave.']);
  const product = await check({ read: reading(PURCHASE.map((t) => (t === BOTTLE ? 'Test Brand Water Jug 2 Litres Glass' : t))), delivery: deliveryReading(DELIVERY.map((t) => (t === BOTTLE ? 'Test Brand Water Jug 2 Litres Glass' : t))) });
  assert.deepEqual([product.final, product.typeKey, product.finalSays], ['fail', 'productNotMatching', 'This transaction failed because the product on both screenshots is not one of the products of the campaign "Test Brand Bottles".']);
  const cancelled = await check({ delivery: deliveryReading(['< Order Details Help', BOTTLE, `Order #${ID}`, 'Order Cancelled']) });
  assert.deepEqual([cancelled.final, cancelled.typeKey, cancelled.finalSays], ['fail', 'notDelivered', 'This transaction failed because the delivery screenshot says "Cancelled", so the order was not delivered.']);
  const quiet = await check({ delivery: deliveryReading([BOTTLE, `Order #${ID}`]) });
  assert.deepEqual([quiet.final, quiet.typeKey, quiet.finalSays], ['manual', 'notDelivered', 'A staff member needs to check this transaction because the word "Delivered" could not be found on the delivery screenshot.']);
  const words = await check({ row: { ...ROW, shots: { ...ROW.shots, delivery: cell({ text: 'Cancelled' }) } } });
  assert.deepEqual([words.final, words.typeKey, words.steps[2].detail], ['fail', 'notDelivered', 'The cell says "Cancelled", so the order was not delivered.']);
  const noDelivery = await check({ row: { ...ROW, shots: { ...ROW.shots, delivery: cell() } } });
  assert.deepEqual([noDelivery.final, noDelivery.typeKey, noDelivery.finalSays], ['fail', 'deliveryShotMissing', 'This transaction failed because the user did not give a delivery screenshot.']);
  const drive = await check({ answers: { order: { files: [], problems: [{ kind: 'drive', site: 'Google Drive', says: 'the Google account logged in to the dashboard has no access to it', noAccess: true }] } } });
  assert.deepEqual([drive.final, drive.typeKey, drive.note], ['manual', 'needDriveAccess', 'A staff member needs to check this transaction because the purchase screenshot is on Google Drive, but the Google account logged in to the dashboard has no access to it. The dashboard can only open a Drive file that the Google account logged in to it can open. Check that the file is shared with the Google account shown in the top bar, then check this row again.']);
  const unreadable = await check({ delivery: deliveryReading([], { ok: false, problem: 'its words are not clear enough to read' }) });
  assert.deepEqual([unreadable.final, unreadable.typeKey, unreadable.finalSays], ['manual', 'deliveryNotClear', 'A staff member needs to check this transaction because the delivery screenshot could not be read: its words are not clear enough to read.']);
  // The amount on neither screenshot, as on Amazon: a staff member checks it, even with the review found.
  const noAmount = await check({ read: reading(PURCHASE.slice(0, 4)) });
  assert.deepEqual([noAmount.final, noAmount.typeKey, noAmount.finalSays, noAmount.steps[3].detail.split('. ').at(-1)], ['manual', 'orderNotClear', 'A staff member needs to check this transaction because neither screenshot shows the amount, so it cannot be matched to this order.', 'Neither screenshot shows the amount.']);
  // A failing problem gives the Status before one for a staff member, and before the review's; each other problem is one more sentence.
  const both = await check({ read: reading(PURCHASE.map((t) => t.replace(ID, 'OD100000000000000777'))), delivery: deliveryReading([], { ok: false, problem: 'its words are not clear enough to read' }), reviews: [made(1)], answer: { total: 1 } });
  assert.equal(both.note, `This transaction failed because the order ID on the purchase screenshot does not match the order ID the user gave. The user gave order ID ${ID}, and the purchase screenshot shows order ID OD100000000000000777. The delivery screenshot could not be read: its words are not clear enough to read. The review is not among the 1 review Flipkart shows for the product.`);
});

test("the review's own problems as on Amazon: none given, or a link that is not a review, fails; Flipkart not accepting the review fails; a review screenshot that cannot be read, or shows no review by the user, is for a staff member; a star rating with no words passes as Rating Only", async () => {
  const none = await check({ row: { ...ROW, shots: { ...ROW.shots, reviewShot: cell() } } });
  assert.deepEqual([...status(none), none.finalSays], ['fail', 'Fail', 'reviewLinkMissing', 'Review link or screenshot missing', 'This transaction failed because the user did not give a review link or a review screenshot in the form.']);
  const wrote = await check({ row: { ...ROW, shots: { ...ROW.shots, reviewShot: cell({ text: 'Will send later' }) } } });
  assert.equal(wrote.finalSays, 'This transaction failed because the user wrote "Will send later" in the form instead of giving a review screenshot.');
  const productPage = await check({ row: { ...ROW, shots: { ...ROW.shots, reviewShot: cell(), review: cell({ links: ['https://www.flipkart.com/test-brand-steel-bottle/p/itmtestbottle01?pid=TESTPID0000001'] }) } } });
  assert.deepEqual([productPage.final, productPage.typeKey, productPage.finalSays], ['fail', 'wrongReviewLink', 'This transaction failed because the review link opens a product page on Flipkart, not a review.']);
  const page = await check({ row: { ...ROW, shots: { ...ROW.shots, reviewShot: cell(), review: cell({ links: ['https://www.flipkart.com/account/orders'] }) } } });
  assert.deepEqual([page.final, page.typeKey, page.finalSays], ['manual', 'somethingElse', 'A staff member needs to check this transaction because there is no review screenshot, and the review link opens a page on Flipkart that the dashboard does not open yet.']);
  // A link to one review with no review screenshot: the dashboard does not open review links yet, so a staff member opens it.
  const linkOnly = await check({ row: { ...ROW, shots: { ...ROW.shots, reviewShot: cell(), review: cell({ links: [MINE_LINK] }) } } });
  assert.deepEqual([linkOnly.final, linkOnly.typeKey, linkOnly.steps[6].state], ['manual', 'somethingElse', 'later']);
  const refused = await check({ review: reviewReading(['Your review was rejected as it does not follow our guidelines.']) });
  assert.deepEqual([refused.final, refused.typeKey, refused.type], ['fail', 'cannotAddReviews', 'User not being able to add reviews']);
  assert.match(refused.finalSays, /^This transaction failed because the review screenshot shows a message from Flipkart that the review was not accepted: "/);
  const unclear = await check({ review: reviewReading([], { ok: false, problem: 'its words are not clear enough to read' }) });
  assert.deepEqual([unclear.final, unclear.typeKey, unclear.finalSays], ['manual', 'reviewNotClear', 'A staff member needs to check this transaction because the review screenshot could not be read: its words are not clear enough to read.']);
  const others = await check({ review: reviewReading(['5.0 • Wonderful', 'Keeps water cold all day.', 'Test Reviewer Two, Test City', '7 Helpful', 'Verified Purchase · 3 days ago', '4.0 • Nice product', 'The lid is a bit tight.', 'Test Reviewer Three, Test Town', '2 Helpful'], {}, { reviewer: REVIEWER }) });
  assert.deepEqual([others.final, others.typeKey], ['manual', 'somethingElse']);
  assert.match(others.finalSays, /^A staff member needs to check this transaction because the review screenshot does not clearly show a written review, a star rating only or a message from Flipkart, because it shows 2 reviews/);
  const rating = await check({ review: reviewReading([BOTTLE, '4.0 •', `${REVIEWER} @ Certified Buyer 12 Sep, 2026`]) });
  assert.deepEqual([...status(rating), rating.steps[6].state, rating.steps[7].state, rating.steps[7].detail], ['pass', 'Pass', 'ratingOnly', 'Rating Only', 'not-reached', 'not-needed', 'A rating only needs no comparison.']);
  assert.equal(rating.finalSays, 'This transaction passed: the purchase screenshot and the delivery screenshot match the form, and the review screenshot shows a star rating with no written words.');
});

test('a check that paused or was stopped gets no Status; something that went wrong on this computer is for a staff member', async () => {
  const paused = await check({ answers: { delivery: { pause: 'google-out' } } });
  assert.deepEqual([paused.paused.kind, paused.final, paused.status, paused.note], ['google-out', null, null, null]);
  const stop = new AbortController();
  stop.abort();
  const stopped = await check({ signal: stop.signal });
  assert.deepEqual([stopped.stopped, stopped.final], [true, null]);
  const broken = await check({ readDelivery: async () => { throw new Error('made-up'); } });
  assert.deepEqual([broken.final, broken.typeKey, broken.finalSays], ['manual', 'somethingElse', 'A staff member needs to check this transaction because something went wrong on this computer while reading the delivery screenshot.']);
});
