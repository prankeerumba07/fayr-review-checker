// The Amazon check's pure rules: links, text, names, dates, search words, and
// reading a saved review page's text.
// Run: node test/amazon-text.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewIdFrom, asinFrom, reviewLinkKind, isAmazonIn, seeAllReviewsUrl, reviewSearchUrl, productPageUrl } from '../amazon/links.js';
import { normalizeText, sameText, overlapScore, closeWords, compareNames, nameReadAs, dayFrom, reviewedOn, rareWords, parseReviewPageText, isHiddenName, sameName, starsLine, cleanName } from '../amazon/text.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'amazon');

test('links: review ids and ASINs', () => {
  assert.equal(reviewIdFrom('https://www.amazon.in/gp/customer-reviews/R2H61UAN483HX3'), 'R2H61UAN483HX3');
  assert.equal(reviewIdFrom('https://www.amazon.in/gp/customer-reviews/R2H61UAN483HX3/ref=cm_cr_srp_d_rvw_ttl?ie=UTF8&ASIN=B0BD8VSV22'), 'R2H61UAN483HX3');
  assert.equal(reviewIdFrom('www.amazon.in/gp/customer-reviews/r2h61uan483hx3'), 'R2H61UAN483HX3');
  assert.equal(reviewIdFrom('https://www.amazon.in/dp/B0BD8VSV22'), null);
  assert.equal(asinFrom('https://www.amazon.in/dp/B0BD8VSV22'), 'B0BD8VSV22');
  assert.equal(asinFrom('https://www.amazon.in/Some-Name/dp/B0BD8VSV22/ref=sr_1_1?keywords=x'), 'B0BD8VSV22');
  assert.equal(asinFrom('https://www.amazon.in/gp/product/B0BD8VSV22'), 'B0BD8VSV22');
  assert.equal(asinFrom('https://www.amazon.in/product-reviews/B0BD8VSV22?filterByKeyword=x'), 'B0BD8VSV22');
  assert.equal(asinFrom('B0BD8VSV22'), 'B0BD8VSV22', 'a bare ASIN');
  assert.equal(asinFrom('Bluetooths'), null, 'ten letters is a word, not an ASIN');
  assert.equal(asinFrom(''), null);
  assert.equal(productPageUrl('B0BD8VSV22'), 'https://www.amazon.in/dp/B0BD8VSV22');
  assert.equal(reviewSearchUrl('B0BD8VSV22', 'zircon'), 'https://www.amazon.in/product-reviews/B0BD8VSV22?filterByKeyword=zircon');
  assert.equal(reviewSearchUrl('B0X0000000', 'मज़बूत'), 'https://www.amazon.in/product-reviews/B0X0000000?filterByKeyword=%E0%A4%AE%E0%A4%9C%E0%A4%BC%E0%A4%AC%E0%A5%82%E0%A4%A4');
});

test('links: amazon.in only; short links are followed; anything else is not opened', () => {
  assert.deepEqual(reviewLinkKind('https://www.amazon.in/gp/customer-reviews/R2H61UAN483HX3/ref=x?ie=UTF8'), { kind: 'review', link: 'https://www.amazon.in/gp/customer-reviews/R2H61UAN483HX3/ref=x?ie=UTF8', reviewId: 'R2H61UAN483HX3', open: 'https://www.amazon.in/gp/customer-reviews/R2H61UAN483HX3' });
  assert.equal(reviewLinkKind('https://amzn.in/d/abc123').short, true);
  assert.equal(reviewLinkKind('https://a.co/d/abc').kind, 'amazon');
  assert.equal(reviewLinkKind('https://www.amazon.com/gp/customer-reviews/R2H61UAN483HX3').kind, 'other-amazon');
  assert.equal(reviewLinkKind('https://evil.example/gp/customer-reviews/R2H61UAN483HX3').kind, 'web', 'another website: never opened in the Live Amazon Browser');
  assert.equal(reviewLinkKind('javascript:alert(1)').kind, 'not-a-link');
  assert.equal(isAmazonIn('https://www.amazon.in.evil.example/x'), false);
  assert.equal(seeAllReviewsUrl('/product-reviews/B0TESTMAIN/ref=x?reviewerType=all_reviews', 'B0TESTMAIN'), 'https://www.amazon.in/product-reviews/B0TESTMAIN/ref=x?reviewerType=all_reviews');
  assert.equal(seeAllReviewsUrl('https://evil.example/product-reviews/B0X', 'B0TESTMAIN'), 'https://www.amazon.in/product-reviews/B0TESTMAIN', 'a link off amazon.in is never followed');
});

test('text: the same review ignores capitals, extra spaces and punctuation, nothing else', () => {
  assert.equal(sameText('Great rack!  Folds flat, holds a lot.', 'great rack folds flat holds a lot'), true);
  assert.equal(sameText("It's sturdy", 'Its sturdy'), true);
  assert.equal(sameText('Good,nice', 'good, nice'), true);
  assert.equal(sameText('“Curly” quotes — and dashes', '"curly" quotes - and dashes'), true);
  assert.equal(sameText('बहुत अच्छा रैक है।', 'बहुत अच्छा रैक है'), true, 'Hindi, with the full stop gone');
  assert.equal(sameText('Folds flat', 'Folds flat and holds a lot'), false);
  assert.equal(sameText('very good', 'very goood'), false, 'one letter is a different text');
  assert.equal(sameText('', ''), false, 'nothing is never the same');
  assert.equal(normalizeText('  A​b  C '), 'ab c');
});

test('text: word overlap allows small reading mistakes and says how much was read', () => {
  assert.equal(overlapScore('the wheels lock firmly', 'the wheels lock firmly'), 1);
  assert.equal(overlapScore('the wheels lock firmly', 'tbe whee1s lock firrnly'), 0.75, 'one-letter mistakes in longer words pass; "tbe" (3 letters) does not');
  assert.equal(overlapScore('the wheels lock firmly', 'nothing alike here'), 0);
  assert.equal(overlapScore('', 'x'), null);
  assert.equal(closeWords('chipped', 'chlpped'), true);
  assert.equal(closeWords('lot', 'lit'), false);
});

test('names: every word Amazon shows in the user name; a small display difference passes; unsure goes to staff', () => {
  assert.equal(compareNames('Rama Nagendra Babu Ch', 'Rama Nagendra Babu Ch').result, 'same');
  assert.equal(compareNames('Rama Nagendra Babu Ch', 'rama nagendra babu ch.').result, 'same');
  assert.equal(compareNames('Rama Nagendra Babu Ch', 'R. Nagendra').result, 'small-difference');
  assert.equal(compareNames('Rama Nagendra Babu Ch', 'Rama Nagendra Babu Ch').ok, true);
  const diff = compareNames('Rama Nagendra Babu Ch', 'Suresh Kumar');
  assert.equal(diff.ok, false);
  assert.equal(diff.result, 'different');
  const hidden = compareNames('Asha Verma', 'Amazon Customer');
  assert.equal(hidden.result, 'hidden');
  assert.equal(hidden.ok, false, 'a hidden name is never a pass');
  assert.equal(isHiddenName('Amazon Customer'), true);
  assert.equal(compareNames('Asha Verma', '').ok, false);
  assert.equal(nameReadAs('Asha R Verma', 'Asha R Verma'), true);
  assert.equal(nameReadAs('Asha R Verma', 'Asha Verma'), false, 'a word not read is not the name');
});

test("names the way staff read them: Amazon shortens a name, so an initial, a missing word, one name, any order and one letter apart are the same name; only someone else's name is different; a row of stars is never a name", () => {
  const how = (a, b) => sameName(a, b).how;
  assert.equal(how('Rahul Kumar Sharma', 'Rahul K.'), 'initial');
  assert.equal(how('Rahul Kumar Sharma', 'Rahul Sharma'), 'missing word');
  assert.equal(how('Rahul Kumar Sharma', 'rahul kumar sharma'), 'same');
  assert.equal(how('Meera Nitin Patil', 'Meera N.'), 'initial');
  assert.equal(how('Asha Verma', 'Asha'), 'one name');
  assert.equal(how('Asha', 'Asha Verma'), 'one name');
  assert.equal(how('Verma Asha', 'Asha Verma'), 'same', 'any order');
  assert.equal(how('Asha Verma', 'Asha Varma'), 'spelling');
  assert.equal(how('AshaVerma', 'Asha Verma'), 'joined');
  assert.equal(how('ASHA R VERMA', 'Asha Verma'), 'missing word');
  assert.equal(sameName('Rahul Kumar', 'Rahul Sharma').same, false, 'a word that is not in the other name');
  assert.equal(sameName('Falcon', 'Asha Verma').same, false);
  assert.equal(sameName('Raj', 'Ram').same, false, 'one letter in a three-letter name is another name');
  assert.equal(sameName('', 'Asha').how, 'missing');
  for (const s of ['KKKKK Verified Purchase', 'Kk kkk', 'tototkotok', 'KkKkekKks', 'ह है ह ह है ६ Verified Purchase', 'WI KICOIK Verified Purchase', 'Verified Purchase', '* * *']) assert.equal(starsLine(s), true, s);
  for (const s of ['Good', 'Raj', 'Asha Verma', 'Kiki Rao', 'Kk Rao', 'Nice product']) assert.equal(starsLine(s), false, s);
  assert.equal(cleanName('€ Asha Verma'), 'Asha Verma');
  assert.equal(cleanName('(Re Asha Verma'), 'Asha Verma');
  assert.equal(cleanName('«© ASHA VERMA'), 'ASHA VERMA');
  assert.equal(cleanName('Asha Verma | | by Test Brand'), 'Asha Verma', 'the column beside the review is cut off');
  assert.equal(cleanName('Ss ४) Asha Verma'), 'Ss Asha Verma', 'letters stay');
  assert.equal(cleanName('Meera N.'), 'Meera N.');
  assert.equal(cleanName('€'), '');
});

test('dates: English and Hindi, and anything else is no date', () => {
  assert.deepEqual(reviewedOn('Reviewed in India on 12 August 2026'), { country: 'India', dateText: '12 August 2026' });
  assert.equal(dayFrom('12 August 2026'), '2026-08-12');
  assert.equal(dayFrom('August 12, 2026'), '2026-08-12');
  assert.equal(dayFrom('12 अगस्त 2026'), '2026-08-12');
  assert.equal(dayFrom('31 June 2026'), null);
  assert.equal(dayFrom('yesterday'), null);
  assert.equal(reviewedOn('भारत में 12 अगस्त 2026 को समीक्षा की गई').dateText, '12 अगस्त 2026');
  assert.equal(reviewedOn('Helpful'), null);
});

test('search words: rare, long, not in the product title or the name', () => {
  const words = rareWords('The rack folds flat in seconds and holds a full load of winter clothes. The wheels lock firmly and the zircon grey finish has not chipped after a month of daily use.', ['Test Brand Folding Garment Rack with Wheels', 'Asha R Verma']);
  assert.equal(words[0], 'zircon');
  assert.ok(!words.includes('wheels'), 'a word from the product title is not rare here');
  assert.ok(!words.includes('month') && !words.includes('after'), 'common review words are skipped');
  assert.deepEqual(rareWords('good good good nice', []), []);
});

test('a real saved review page, read as text (names replaced)', () => {
  const rack = parseReviewPageText(readFileSync(join(FIX, 'review-text-garment-rack.txt'), 'utf8'));
  assert.equal(rack.name, 'Test Reviewer');
  assert.equal(rack.stars, 5);
  assert.match(rack.title, /^Sturdy/);
  assert.equal(rack.day, '2026-06-13');
  assert.equal(rack.verified, true);
  assert.match(rack.variant, /^Colour/);
  assert.match(rack.body, /garment rack/i);
  assert.doesNotMatch(rack.body, /found this helpful|^Helpful$/m, 'the buttons under the words are not the words');
  assert.match(rack.productTitle, /Lukzer/);

  const shoes = parseReviewPageText(readFileSync(join(FIX, 'review-text-nike-shoes.txt'), 'utf8'));
  assert.equal(shoes.stars, 5, "the reviewer's star, not the product's 4.2 average");
  assert.equal(shoes.day, '2026-07-20');
  assert.equal(shoes.verified, true);
  assert.match(shoes.productTitle, /Nike/);

  assert.equal(parseReviewPageText('Sign in or create account'), null);
});

test('a review read as text: words that begin like a variant line ("Size is …") are the review, not its variant', () => {
  const page = (first) => ['Customer Review', 'Test Reviewer', '5 out of 5 stars', 'Fits well', 'Reviewed in India on 9 March 2026', 'Size Name: 1 Litre', 'Verified Purchase', first, 'The lid seals tightly.', 'Helpful', 'Report', 'Product Details', 'Test Brand Bottle'].join('\n');
  for (const first of ['Size is perfect for daily office use.', 'Colour is exactly as shown.', 'Material feels thick and the stitching is neat.', 'Style and finish are good.']) {
    const t = parseReviewPageText(page(first));
    assert.equal(t.variant, 'Size Name: 1 Litre');
    assert.equal(t.body, `${first}\nThe lid seals tightly.`, first);
  }
  assert.equal(parseReviewPageText(page('Colour: Black')).variant, 'Colour: Black', 'a "Word:" line after the badge is still the variant');
});
