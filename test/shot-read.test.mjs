// Reading a row's pictures: order IDs, dates and amounts on an order
// screenshot; "Delivered", order IDs and the product on a delivery
// screenshot; and what a review picture shows (Amazon refusing a review, a
// star rating only, a written review, or something else). The pure rules
// first, then the drawn pictures read by Tesseract on this computer.
// Run: node test/shot-read.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { orderIdsIn, partialOrderId, lastFive, datesIn, sameDay, dayNear, amountsIn, matchingAmount, amountMatch, totalShown, rupees, productShown, productNames, phraseIn, holdsWord, sameStart, nameStartShown, nameCouldBe } from '../amazon/screen-text.js';
import { readOrderShot, readDeliveryShot, readReviewPicture, classifyReviewPicture, ratingStars, isScreenLine, looksLikeTitle, emailReview, formReview, pickReview } from '../amazon/shot-read.js';
import { ImageReader } from '../amazon/browsers.js';
import { checkSettings } from '../amazon/settings.js';
import { FLOOR, ORDER_ID, OTHER_ORDER_ID, WRITTEN } from './fixtures/amazon/make-order-screenshots.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'amazon');
const settings = checkSettings({});
const images = new ImageReader();
after(() => images.close());
const analyse = (f) => images.analyse(f, 'image/png');
const STARS = (count, size = 34) => [{ count, left: 10, top: 10, right: 200, bottom: 44, size }];

test('order IDs: as Amazon writes them, every one, letters read for digits put right; shown by their last 5 digits', () => {
  assert.deepEqual(orderIdsIn(['Order # 403-1000002-2000002']), ['403-1000002-2000002']);
  assert.deepEqual(orderIdsIn(['Order # 4O3-1000002-20O0002']), ['403-1000002-2000002'], 'O read for 0');
  assert.deepEqual(orderIdsIn(['Order # 4O3-1OOOOO2-2OOOOO2']), [], 'too few digits to be sure');
  assert.deepEqual(orderIdsIn(['403 1000002 2000002 and 403-9999999-8888888', 'again 403-1000002-2000002']), ['403-1000002-2000002', '403-9999999-8888888']);
  assert.deepEqual(orderIdsIn(['Order 4071 1234567 1234567', 'SOS-OOOOOOO-BOOOOOO']), [], 'four digits first, or a word, is not an order ID');
  assert.equal(lastFive('403-1000002-2000002'), '00002');
  assert.equal(lastFive('403-9999999-8888888'), '88888');
  assert.equal(lastFive(''), '', 'nothing, never a long dash');
});

test('dates: the order date, labelled, in the ways Amazon writes it; a date without its year', () => {
  const d = datesIn(['Order date 20 July 2026', 'Delivered 22 July', 'Ordered on July 18, 2026', '20/07/2026', 'ORDER PLACED', '19 Jul 2026']);
  assert.deepEqual(d.map((x) => [x.text, x.day, x.labelled]), [
    ['20 July 2026', '2026-07-20', true],
    ['22 July', null, false],
    ['July 18, 2026', '2026-07-18', true],
    ['20/07/2026', '2026-07-20', false],
    ['19 Jul 2026', '2026-07-19', true],
  ]);
  assert.equal(sameDay(d[1], '2026-07-22'), true, 'without its year: the day and the month');
  assert.equal(sameDay(d[0], '2026-07-21'), false);
  assert.equal(dayNear(d[1], '2026-07-20'), '2026-07-22');
  assert.equal(dayNear({ year: null, month: 1, date: 3 }, '2025-12-28'), '2026-01-03', 'the year that puts it nearest');
  assert.deepEqual(datesIn(['403-1000002-2000002', '654.00', 'Pack of 2']), []);
  assert.deepEqual(datesIn(['Order date: 2026-07-20', 'Ordered on 20 July, 2026', 'Order placed 20-Jul-2026']).map((x) => [x.day, x.labelled]), [['2026-07-20', true], ['2026-07-20', true], ['2026-07-20', true]]);
});

test('amounts: the rupee sign as Tesseract reads it, two decimals, or a label; never a date or an order ID', () => {
  const a = amountsIn(['Order total %654.00 (1 item)', 'Shipping: २0.00', 'Grand Total: ₹1,299.50', 'Rs. 499', '20.07.2026', '403-1000002-2000002', 'Item price 851']);
  assert.deepEqual(a.map((x) => [x.value, x.label]), [[654, 'order total'], [1299.5, 'grand total'], [499, null], [851, 'item price']]);
  assert.equal(matchingAmount(a, 654, 1).value, 654);
  assert.equal(matchingAmount(a, 655, 1).value, 654, 'within the passing mark');
  assert.equal(matchingAmount(a, 700, 1), null);
  assert.equal(matchingAmount(a, null, 1), null);
  assert.equal(rupees(654), '₹654');
  assert.equal(rupees(851.95), '₹851.95');
});

test('amounts: a rupee sign read as a digit stuck to the number, or a decimal point lost, is also read as the number it may be, and only then', () => {
  // As Tesseract read a purchase screenshot whose grand total is ₹754: "₹" came out as %, २, 2 or 7.
  const a = amountsIn(['2749.00', 'Item(s) Subtotal: %749.00', 'Shipping: 240.00', 'Marketplace Fee: २5.00', 'Total: 2794.00', 'Promotion Applied: -%40.00', 'Grand Total: 7754.00']);
  assert.deepEqual(a.map((x) => [x.value, x.label, x.skip, x.kind, x.alts]), [
    [2749, null, false, null, [749]],
    [749, 'item(s) subtotal', false, null, []],
    [240, null, true, 'fee', [40]],
    [5, null, true, 'fee', []],
    [2794, 'total', false, null, [794]],
    [40, null, true, 'off', []],
    [7754, 'grand total', false, null, [754]],
  ]);
  assert.deepEqual([matchingAmount(a, 754, 1).value, matchingAmount(a, 754, 1).label], [754, 'grand total'], 'the grand total, read without the 7');
  assert.equal(matchingAmount(a, 7754, 1).value, 7754, 'as it is read, too');
  assert.equal(matchingAmount(a, 40, 1), null, 'a delivery charge is never the amount, however it is read');
  assert.deepEqual(amountsIn(['Grand Total: ₹2654.00'])[0].alts, [], 'a rupee sign read as one is never dropped');
  assert.deepEqual(amountsIn(['Total 2,654.00'])[0].alts, [], '"₹654" read wrongly never has a comma after its first digit');
  assert.deepEqual(amountsIn(['Order total 8654.00'])[0].alts, [654], 'a 2, 3, 7 or 8 may be the rupee sign');
  assert.deepEqual(amountsIn(['Order total 3314.00'])[0].alts, [314]);
  assert.deepEqual(amountsIn(['Order total 1654.00'])[0].alts, [], 'never a 1');
  // The decimal point lost: "₹344.00" read as "34400", or as "34400" with the sign read as a 3.
  assert.deepEqual(amountsIn(['Grand Total: 34400'])[0].alts, [4400, 344, 44]);
  assert.deepEqual(amountsIn(['Grand Total: 30400'])[0].alts, [400, 304, 4]);
  assert.equal(matchingAmount(amountsIn(['Grand Total: 34400']), 344, 1).value, 344);
  assert.equal(matchingAmount(amountsIn(['Grand Total: 34400']), 3440, 1), null, 'never a number it cannot be');
});

test('amounts, the way staff read an order page: the amount itself, an item price with the shipping and fees shown, or an item price a few rupees under the amount when no total is shown', () => {
  const marks = { tolerance: 1, allowance: 5 };
  assert.deepEqual(amountMatch(amountsIn(['Grand Total: ₹349.00']), 350, marks), { value: 349, label: 'grand total', how: 'same', parts: [] }, 'within the tolerance');
  // The item price, the shipping and the fee add up to the amount in the sheet.
  assert.deepEqual(amountMatch(amountsIn(['₹309.00', 'Shipping: ₹40.00']), 349, marks), { value: 309, label: null, how: 'with fees', parts: [{ value: 40, kind: 'fee' }] });
  const page = amountsIn(['Item(s) Subtotal: ₹299.00', 'Shipping: ₹0.00', 'Marketplace Fee: ₹5.00', 'Promotion Applied: -₹20.00']);
  assert.deepEqual(amountMatch(page, 284, marks).parts, [{ value: 5, kind: 'fee' }, { value: 20, kind: 'off' }], 'the fee added and the money taken off');
  assert.equal(amountMatch(page, 304, marks).how, 'with fees');
  // No total on the screenshot: an item price up to the allowance below the amount in the sheet is the amount, with Amazon's fees not shown.
  assert.deepEqual(amountMatch(amountsIn(['₹299.00', 'Item(s) Subtotal: ₹299.00']), 304, marks), { value: 299, label: null, how: 'fees not shown', parts: [] });
  assert.equal(amountMatch(amountsIn(['₹299.00']), 310, marks), null, 'more than the allowance under');
  assert.equal(amountMatch(amountsIn(['₹299.00']), 294, marks), null, 'never above the amount in the sheet');
  assert.equal(amountMatch(amountsIn(['Total: ₹299.00']), 304, marks), null, 'a total shown must be the amount');
  assert.equal(amountMatch(amountsIn(['₹299.00']), 304, { tolerance: 1, allowance: 0 }), null, 'no allowance: the amount as it is');
  assert.equal(amountMatch(amountsIn(['Grand Total: ₹349.00']), 360, marks), null);
  assert.equal(totalShown(amountsIn(['Item(s) Subtotal: ₹299.00'])), false, 'a subtotal is not a total');
  assert.equal(totalShown(amountsIn(['Total: ₹299.00'])), true);
});

test("a product's real name read with a word wrong in the middle (\"100 mi\" for \"100 ml\") is still its start; a line that could be one of the campaign's products is never another product", () => {
  const HAIR = 'Testbrand Intimate/Private Hair Removal Cream for Men (100 ml) | Painless, Faster, Soothing for Unwanted Coarse Pubic Hair';
  assert.equal(nameStartShown(['Testbrand Intimate/Private Hair Removal Cream for Men (100 mi) | Painless, Faster,'], HAIR)?.full, 12, 'the word read wrongly is passed over');
  assert.equal(nameStartShown(['Testbrand Intimate/Private Hair Removal Creem for Men'], HAIR)?.full, 8, 'a small slip in a word');
  assert.equal(nameStartShown(['Testbrand Intimate/Private Hair Removal Xyz Abc Def for Men'], HAIR)?.full, 5, 'three words wrong: the start shown is what was read up to them');
  assert.equal(nameStartShown(['Testbrand Intimate/Private Hair Removal Cream for Men (100 ml) | Painless, Faster, Cancel items'], HAIR)?.full, 12, "a button read onto the end of the name's line does not undo the name");
  assert.equal(nameStartShown(['Testbrand Intimate Wash for Men (150 ml) Relieves Itchiness ( Cancel items )'], 'Testbrand Intimate Wash for Men (150 ml) Relieves Itchiness & Odour')?.full, 9);
  assert.equal(nameStartShown(['Testbrand Natural Floor Cle...'], 'Testbrand Floor Cleaner Liquid'), null, 'another product: the words go another way right after the brand');
  assert.equal(nameStartShown(['Sold by: Testbrand'], HAIR), null);
  assert.equal(nameCouldBe('Testbrand Intimate Wash for Men (150 ml)', HAIR, 1), true, 'the brand and the next word: could be this product');
  assert.equal(nameCouldBe('2. Testbrand Intimate Anti-C...', HAIR, 1), true);
  assert.equal(nameCouldBe('Testbrand Beard Oil 50 ml', HAIR, 1), false, 'another product');
  assert.equal(nameCouldBe('Sold by: Testbrand', HAIR, 1), false);
  assert.equal(sameStart('2. Testbrand Intimate Anti-C...', 'Testbrand Intimate Anti-C...'), true, 'the same start, a stray mark aside');
  assert.equal(sameStart('Testbrand Underarm Roll-On f...', 'Testbrand Underarm Roll-On for Me...'), true, 'one cut shorter than the other');
  assert.equal(sameStart('Testbrand Underarm Roll-On f...', 'Testbrand Intimate Wash for...'), false);
});

test('order IDs wrapped over two lines, with a space read inside, or read only in part', () => {
  assert.deepEqual(orderIdsIn(['Order number 406-', '2468024-1357913', 'Item(s) Subtotal']), ['406-2468024-1357913'], 'wrapped after the first group');
  assert.deepEqual(orderIdsIn(['Order number 406-2468024-', '1357913']), ['406-2468024-1357913'], 'wrapped after the second group');
  assert.deepEqual(orderIdsIn(['403-1234 567-8901234']), ['403-1234567-8901234'], 'a space read inside a group');
  assert.deepEqual(orderIdsIn(['403-1234567-890 1234']), ['403-1234567-8901234']);
  assert.deepEqual(orderIdsIn(['Order 406-', 'Item(s) Subtotal 2468024']), [], 'never joined across unrelated lines');
  assert.deepEqual(partialOrderId(['Order 03-1234567-89012'], '403-1234567-8901234'), { digits: 14 }, 'cut off at both edges');
  assert.deepEqual(partialOrderId(['1234567-8901234'], '403-1234567-8901234'), { digits: 14 });
  assert.equal(partialOrderId(['403-1234567-8901234'], '403-1234567-8901234'), null, 'a whole ID is found by orderIdsIn, not here');
  assert.equal(partialOrderId(['03-1234567-89013'], '403-1234567-8901234'), null, 'a digit different is not the same ID');
  assert.equal(partialOrderId(['123456789'], '403-1234567-8901234'), null, 'fewer than 10 digits is too little');
  assert.equal(partialOrderId(['Order 03-1234567-89012'], 'not an id'), null);
});

test('dates: a date on a line about the delivery is marked, so it is never taken for the order date', () => {
  const d = datesIn(['Order placed 16 July 2026', 'Delivered 22 July 2026', 'Arriving 25 July', 'Return window closed on 30 July 2026', '18 July 2026']);
  assert.deepEqual(d.map((x) => [x.text, x.labelled, x.delivery]), [
    ['16 July 2026', true, false],
    ['22 July 2026', false, true],
    ['25 July', false, true],
    ['30 July 2026', false, true],
    ['18 July 2026', false, false],
  ]);
});

test("a product's name shown on a screenshot: its words in one line or wrapped over two; small reading mistakes allowed", () => {
  assert.deepEqual(productShown('Test Brand Floor Cleaner', ['Delivered 22 July', 'Test Brand Floor Cleaner Liquid,', 'Lavender, 1 Litre']), { share: 1, shown: 'Test Brand Floor Cleaner Liquid,', name: 'Test Brand Floor Cleaner' });
  assert.equal(productShown('Test Brand Floor Cleaner', ['Test Brand Floor', 'Cleaner Liquid']).share, 1, 'wrapped');
  assert.equal(productShown('Test Brand Floor Cleaner', ['Tesl Brand Fl00r Cleaner']).share, 1, 'Tesseract mistakes');
  assert.equal(productShown('Test Brand Home Cleaning Kit', ['Test Brand Floor Cleaner Liquid']).share, 0.4);
  assert.equal(productShown('', ['anything']), null);
});

test('a short product name from the newer files: " - Amazon" names the shop; it is found in the long Amazon name without the brand; a small spelling slip and a cell naming several products are fine', () => {
  const long = ['Delivered 22 July', 'Testbrand Face Wash for Men, 100 ml', 'Testbrand Charcoal Face Scrub, 50 g'];
  assert.deepEqual(productNames('Face Wash For Man - Amazon'), ['Face Wash For Man']);
  assert.equal(productShown('Face Wash For Man - Amazon', long).share, 1, '"Man" and "Men" are one word; the brand is not needed');
  assert.equal(productShown('Charcol Face Scrub - Amazon', long).share, 1, '"Charcol" for "Charcoal"');
  const several = 'Face Wash For Man - Amazon, Beard Oil - Amazon, Hair Wax - Amazon';
  assert.deepEqual(productNames(several), ['Face Wash For Man, Beard Oil, Hair Wax', 'Face Wash For Man', 'Beard Oil', 'Hair Wax']);
  assert.deepEqual(productShown(several, ['Testbrand Beard Oil, 30 ml']), { share: 1, shown: 'Testbrand Beard Oil, 30 ml', name: 'Beard Oil' }, 'any one of them');
  assert.deepEqual(productNames('Test Brand Floor Cleaner Liquid, Lavender, 1 Litre'), ['Test Brand Floor Cleaner Liquid, Lavender, 1 Litre'], 'a long name with a size after a comma stays one name');
  assert.ok(productShown('Face Wash For Man - Amazon', ['Testbrand Hair Wax, 50 g']).share < 0.8, 'another product is not the same');
});

test('phrases from the settings file: across a line break, with any apostrophe, and with a small reading mistake', () => {
  const lines = ['We apologize but this account has not met the minimum eligibility requirements to write a', 'review. If you would like to learn more, please see our guidelines.'];
  assert.equal(phraseIn(lines, 'has not met the minimum eligibility requirements to write a review'), 'We apologize but this account has not met the minimum eligibility requirements to write a review.');
  assert.equal(phraseIn(['Sorry, you can’t review this product'], "can't review this product"), 'Sorry, you can’t review this product');
  assert.equal(phraseIn(['Thanks f0r rating!'], 'thanks for rating'), 'Thanks f0r rating!');
  assert.equal(phraseIn(['Thanks for shopping'], 'thanks for rating'), null);
  assert.equal(holdsWord('Lost in transit', settings.notDeliveredWords), true);
  assert.equal(holdsWord('CANCELLED', settings.notDeliveredWords), true);
  assert.equal(holdsWord('Returned to seller', settings.notDeliveredWords), true);
  assert.equal(holdsWord('0', settings.notDeliveredWords), false);
  assert.equal(holdsWord('Lostinwords', settings.notDeliveredWords), false, 'whole words only');
});

test('a review picture: Amazon refusing, a rating only, a written review — and "not certain" whenever it is not', () => {
  const kind = (lines, groups = [], product = 'Test Brand Stain Remover') => classifyReviewPicture(lines, groups, { settings, product });
  const refused = kind(['Create Review', 'Sorry, we are unable to accept your review of this product']);
  assert.equal(refused.kind, 'refused');
  assert.equal(refused.refusal, 'Sorry, we are unable to accept your review of this product');
  const rating = kind(['Test Brand Stain Remover Spray, 500 ml', 'Thanks for rating!', 'Your rating has been submitted.', 'Write a review', 'Add a photo or video'], STARS(4));
  assert.equal(rating.kind, 'rating');
  assert.equal(rating.stars, 4);
  assert.deepEqual(rating.productLines, [], 'the ordered product is not another product');
  assert.deepEqual(kind(['Test Brand Glass Cleaner Spray, 500 ml', 'Thanks for rating!'], STARS(5)).productLines, ['Test Brand Glass Cleaner Spray, 500 ml'], 'another product is said');
  const typed = kind(['Thanks for rating!', 'Removes coffee marks from my sofa in one go, really happy with it'], STARS(5));
  assert.equal(typed.kind, 'written', 'written words: never a rating only');
  assert.match(typed.written.body, /coffee marks/);
  const noStars = kind(['Thanks for rating!', 'Your rating has been submitted.']);
  assert.equal(noStars.kind, 'unknown');
  assert.equal(noStars.why, 'it says "Thanks for rating!", but no orange stars were seen, so the stars could not be seen clearly');
  assert.equal(kind(['Thanks for rating!'], [...STARS(4), { count: 2, left: 0, top: 80, right: 50, bottom: 110, size: 30 }]).kind, 'unknown', 'two rows of stars: not certain');
  assert.equal(kind(['Review your purchases'], STARS(4)).why, 'it shows stars, but no words saying it is a rating only');
  assert.equal(kind([]).why, 'it shows no review, no rating and no message from Amazon');
  const review = kind([{ text: 'Customer Review' }, { text: 'Test Reviewer Two' }, { text: 'Leaves the floor squeaky clean' }, { text: 'Reviewed in India on 25 July 2026' }, { text: 'The smell is mild and the floor dries quickly.' }], [], 'Test Brand Floor Cleaner');
  assert.equal(review.kind, 'written');
  assert.deepEqual([review.written.name, review.written.dateText, review.written.body], ['Test Reviewer Two', 'Reviewed in India on 25 July 2026', 'The smell is mild and the floor dries quickly.']);
  assert.deepEqual(ratingStars([]), { stars: null, how: 'no orange stars were seen' });
  assert.equal(isScreenLine('Your rating has been submitted.'), true);
  assert.equal(isScreenLine('Removes coffee marks from my sofa'), false);
  assert.equal(looksLikeTitle('Test Brand Stain Remover Spray, 500 ml'), true);
  assert.equal(looksLikeTitle('removes coffee marks from my sofa.'), false);
});

test("a review picture the way staff see it: Amazon's email saying the review is live, the \"Write a review\" form, and a list of reviews read for the user's review by the user's name", () => {
  const kind = (lines, opts = {}) => classifyReviewPicture(lines, [], { settings, product: 'Test Brand Floor Cleaner', ...opts });
  // The email, as in Gmail: the name Amazon thanks, then the review's title and words after "Your review".
  const email = kind(['14:28', 'to me v', 'amazon.in', 'Your review is live', 'Thanks Asha Verma, your latest', 'customer review is live on Amazon. We', 'and millions of shoppers on Amazon', 'appreciate the time you took to share', 'your experience with this item.', 'Your review', 'kkk kk', 'Folds flat', 'The rack folds flat in seconds.', 'Holds a full load.', 'See your full review', 'Keep it up!']);
  assert.equal(email.kind, 'written');
  assert.deepEqual([email.written.name, email.written.title, email.written.body, email.written.email, email.written.own], ['Asha Verma', 'Folds flat', 'The rack folds flat in seconds.\nHolds a full load.', true, true]);
  const wide = emailReview(['Thank you for reviewing Test Brand Folding Garment Ra... on Amazon » Inbox x', 'Amazon Reviews <no-reply@amazon.in> 9:59AM', 'to me', 'Your review is live', 'Thanks Asha Verma, your latest customer review is live on Amazon. We and millions', 'of shoppers on Amazon appreciate the time you took to share your experience with', 'this item.', 'Your review', 'kkk', 'Good rack', 'This has come with good quality, no bad smell']);
  assert.deepEqual([wide.name, wide.title, wide.body], ['Asha Verma', 'Good rack', 'This has come with good quality, no bad smell']);
  assert.equal(emailReview(['Your review is live', 'Thanks Asha Verma, your latest', 'customer review is live on Amazon.']).body, null, 'an email whose words were not read says so');
  assert.equal(emailReview(['Customer Review', 'Asha Verma', 'The rack folds flat.']), null, 'not an email');
  // The form, with the review typed in it: the words under "Write a review", the title under "Title your review"; no name.
  const form = kind(['Q Search or ask a question', 'How was the item?', 'Test Brand Floor Cleaner Liquid, 1 L', 'KKK KK', 'Write a review', 'Cleans the floor well,', 'smells mild', 'Share a video or photo', 'Title your review (required)', 'Good cleaner', '= O <']);
  assert.equal(form.kind, 'written');
  assert.deepEqual([form.written.name, form.written.title, form.written.body, form.written.form], [null, 'Good cleaner', 'Cleans the floor well,\nsmells mild', true]);
  assert.deepEqual(formReview(['How was the item?', 'Write a review', 'Share a video or photo', 'Title your review (required)']), null, 'nothing typed');
  assert.equal(formReview(['Write a review', 'Nice words']), null, 'not the form');
  // A list of reviews in the Amazon app: name, a row of stars with "Verified Purchase", the title (on one line or two), the date, the size, the words, then Amazon's buttons.
  const L = (text, top) => ({ text, left: 40, top, right: 600, bottom: top + 20, conf: 90 });
  const list = [L('Q Searchoraska... Q', 10), L('Deepa Rao', 100), L('KKkKK Verified Purchase', 130), L('Fine', 160), L('Reviewed in India on 20 August 2026', 190), L('Size: 1 L', 210), L('Fine for the price.', 240), L('Helpful Share Report', 270), L('€ Asha Verma', 300), L('Kk kkk Verified Purchase', 330), L('Folds flat and holds', 360), L('a lot', 380), L('Reviewed in India on 12 August 2026', 410), L('Size: 1 L', 430), L('The rack folds flat in seconds.', 460), L('Holds a full load.', 480), L('Thank you for your review.', 510), L('( Edit ) ( Delete )', 540), L('Home You Wallet Cart Menu Rufus', 600)];
  const byName = kind(list, { reviewer: 'Asha Verma' });
  assert.deepEqual([byName.written.name, byName.written.title, byName.written.body, byName.written.own, byName.others], ['Asha Verma', 'Folds flat and holds a lot', 'The rack folds flat in seconds.\nHolds a full load.', true, 1]);
  const byAmazon = kind(list, { name: 'Deepa Rao' });
  assert.deepEqual([byAmazon.written.name, byAmazon.written.title, byAmazon.written.body, byAmazon.written.own], ['Deepa Rao', 'Fine', 'Fine for the price.', false]);
  assert.equal(kind(list).written.name, 'Asha Verma', "with no name to look for, the one Amazon marks as the viewer's own");
  assert.equal(kind(list, { reviewer: 'D. Rao' }).written.name, 'Deepa Rao', 'a shortened name finds the review too');
  assert.equal(kind([L('Asha Verma', 100), L('KKKKK Verified Purchase', 130), L('Good product', 160), L('Reviewed in India on 12 August 2026', 190), L('Good product', 220), L('Thank you for your review.', 250)]).written.body, 'Good product', 'two words under the date line are the review');
  assert.equal(pickReview([{ name: 'Deepa Rao', body: 'a' }, { name: 'Asha Verma', body: 'b', own: true }], { reviewer: 'A. Verma' }).name, 'Asha Verma');
  assert.equal(pickReview([{ name: 'Deepa Rao', body: 'a', own: true }, { name: 'Asha Verma', body: 'b' }], { reviewer: 'Asha Verma' }).name, 'Asha Verma', "the user's name comes before Amazon's mark");
  assert.equal(isScreenLine('Q Searchoraska... [fy Q'), true);
  assert.equal(isScreenLine('Home You Wallet Cart Menu Rufus'), true);
  assert.equal(isScreenLine('Cleans the floor well'), false);
});

test('the drawn order screenshot: its order ID, its order date (labelled), and its amounts', { timeout: 180_000 }, async () => {
  const o = await readOrderShot([join(FIX, 'order-floor-cleaner.png')]);
  assert.equal(o.ok, true, o.problem);
  assert.deepEqual(o.orderIds, [ORDER_ID]);
  assert.ok(o.dates.some((d) => d.labelled && d.day === '2026-07-20'), JSON.stringify(o.dates));
  assert.ok(matchingAmount(o.amounts, 654, 1), JSON.stringify(o.amounts));
  assert.equal(productShown('Test Brand Floor Cleaner', o.texts).share, 1);
});

test('the drawn delivery screenshots: "Delivered", the product, and the order ID — the same one, or a different one', { timeout: 180_000 }, async () => {
  const same = await readDeliveryShot([join(FIX, 'delivery-floor-cleaner.png')]);
  assert.equal(same.ok, true, same.problem);
  assert.equal(same.delivered, true);
  assert.deepEqual(same.orderIds, [ORDER_ID]);
  assert.equal(productShown('Test Brand Floor Cleaner', same.texts).share, 1);
  assert.deepEqual(same.deliveredOn, { day: null, year: null, month: 7, date: 22 });
  assert.ok(same.dates.some((d) => d.delivery && d.month === 7 && d.date === 22), `its dates and amounts are read too, the day it was delivered marked as such: ${JSON.stringify(same.dates)}`);
  assert.ok(Array.isArray(same.amounts));
  const other = await readDeliveryShot([join(FIX, 'delivery-other-order.png')]);
  assert.deepEqual(other.orderIds, [OTHER_ORDER_ID]);
  const both = await readDeliveryShot([join(FIX, 'delivery-floor-cleaner.png'), join(FIX, 'delivery-other-order.png')]);
  assert.deepEqual(both.orderIds, [ORDER_ID, OTHER_ORDER_ID], 'two pictures in one cell are read together');
  assert.match(FLOOR, /Test Brand Floor Cleaner/);
});

test('the drawn review pictures: a rating only, Amazon refusing, a written review, and noise', { timeout: 180_000 }, async () => {
  const read = (file, product) => readReviewPicture([join(FIX, file)], { analyse, settings, product });
  const rating = await read('review-rating-only.png', 'Test Brand Stain Remover');
  assert.equal(rating.kind, 'rating');
  assert.equal(rating.stars, 4, 'four stars, counted by their colour');
  assert.equal(rating.ratingPhrase, 'Thanks for rating!');
  assert.deepEqual(rating.productLines, []);
  assert.equal((await read('review-rating-only.png', 'Test Brand Floor Cleaner')).productLines.length, 1, 'another product than the one ordered is seen');
  const refused = await read('review-refused.png', 'Test Brand Home Cleaning Kit');
  assert.equal(refused.kind, 'refused');
  assert.equal(refused.refusal, 'We apologize but this account has not met the minimum eligibility requirements to write a review.');
  const written = await read('review-written-floor.png', 'Test Brand Floor Cleaner');
  assert.equal(written.kind, 'written');
  assert.equal(written.written.name, WRITTEN.name);
  assert.equal(written.written.body.replace(/\s+/g, ' '), WRITTEN.body);
  const noise = await read('screenshot-noise.png', 'Test Brand Floor Cleaner');
  assert.equal(noise.kind, 'unknown');
  assert.match(noise.why, /^its words could not be read/);
});

test('a rating only is never called when someone wrote anything: a word, a short line, a line in capitals', () => {
  const kind = (lines, product = 'Test Brand Stain Remover') => classifyReviewPicture(lines, STARS(5), { settings, product });
  for (const words of ['Nice product', 'Superb', 'Great product', 'VERY GOOD PRODUCT, WORKS WELL ON MARBLE FLOORS', 'Highly Recommended']) {
    const r = kind(['Test Brand Stain Remover Spray, 500 ml', 'Thanks for rating!', words, 'Write a review']);
    assert.equal(r.kind, 'written', words);
    assert.equal(r.written.body, words);
  }
  assert.equal(kind(['Thanks for rating!', 'KKK', 'Write a review']).kind, 'rating', 'stars read as letters are noise, not words');
  const two = kind(['Test Brand Stain Remover Spray, 500 ml', 'Test Brand Glass Cleaner, 1 Litre', 'Thanks for rating!']);
  assert.equal(two.kind, 'unknown', 'the product ordered and another product: not certain');
  assert.equal(two.why, 'it shows the product ordered and another product too');
});

test('amounts that are never the order’s amount: delivery charges, discounts, offers and money taken off', () => {
  const a = amountsIn(['Item(s) Subtotal: ₹999.00', 'Shipping: ₹40.00', 'Promotion Applied: -₹385.00', 'Grand Total: ₹654.00', 'You saved ₹345.00']);
  assert.deepEqual(a.map((x) => [x.value, x.skip]), [[999, false], [40, true], [385, true], [654, false], [345, true]]);
  assert.equal(matchingAmount(a, 40, 1), null, 'a delivery charge is never the amount');
  assert.equal(matchingAmount(a, 385, 1), null, 'nor money taken off');
  assert.equal(matchingAmount(a, 654, 1).value, 654);
  assert.equal(matchingAmount(a, 999, 1).value, 999, 'the subtotal is the items’ price');
});
