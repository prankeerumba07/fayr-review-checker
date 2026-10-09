// Links in the new sheet: every kind of review link, the pictures given as
// links, several links in one cell, a link whose words say another link, and
// when two links open the same thing. Made-up ids only.
// Run: node test/links.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewIdFrom, reviewLinkKind, linksIn, linkKey, sameTarget, cellLinks, driveFileId, emailTarget, isWriterOnlyPage, reviewPageUrl, linkLabel } from '../amazon/links.js';

const RID = 'R3TESTREVIEW77';
const OPEN = reviewPageUrl(RID);
const enc = encodeURIComponent;

test('the review id in every form of Amazon review link', () => {
  for (const link of [
    `https://amazon.in/gp/customer-reviews/${RID}?ref=cm_cr_dp_d_rvw_ttl`,
    `https://www.amazon.in/gp/customer-reviews/${RID}?ref_=cm_cr_arp_d_rvw_ttl&language=en_IN`,
    `https://www.amazon.in/review/${RID}/ref=pe_1234_5678`,
    `https://www.amazon.in/review/${RID}/`,
    `https://www.amazon.in/gp/aw/review/B0TESTMAIN/${RID}?ref=x`,
    `https://www.amazon.in/product-reviews/B0TESTMAIN?reviewId=${RID}`,
    `www.amazon.in/gp/customer-reviews/${RID.toLowerCase()}`,
  ]) {
    assert.equal(reviewIdFrom(link), RID, link);
  }
  for (const link of ['https://www.amazon.in/review/review-your-purchases/edit?asin=B0TESTMAIN', 'https://www.amazon.in/review/reviewyourpurchases', 'https://www.amazon.in/dp/B0TESTMAIN', 'https://www.amazon.in/', '']) {
    assert.equal(reviewIdFrom(link), null, link);
  }
});

test('what a Review link cell holds, and what is done with it', () => {
  const kind = (link) => reviewLinkKind(link);
  // Amazon review links: opened at their review page.
  for (const link of [`https://amazon.in/gp/customer-reviews/${RID}?ref=x`, `https://www.amazon.in/review/${RID}/ref=x`, `https://www.amazon.in/review/${RID}/`]) {
    assert.deepEqual(kind(link), { kind: 'review', link: new URL(link).href, reviewId: RID, open: OPEN }, link);
  }
  // Email links: the real address in U, when it is Amazon India.
  const email = (u) => `https://www.amazon.in/gp/f.html?C=1TEST&K=2TEST&M=urn:rtn:msg:000&R=3TEST&T=C&U=${enc(u)}&H=TESTHASH&ref_=pe_000`;
  const viaEmail = kind(email(`https://www.amazon.in/review/${RID}/ref=pe_000`));
  assert.equal(viaEmail.kind, 'review');
  assert.equal(viaEmail.open, OPEN);
  assert.equal(viaEmail.via, 'email');
  assert.equal(emailTarget(email('https://www.amazon.in/review/x')).href, 'https://www.amazon.in/review/x');
  assert.equal(kind(email('/gp/customer-reviews/R3TESTREVIEW77')).open, OPEN, 'a U without a website is on amazon.in');
  const elsewhere = email('https://example.com/landing');
  assert.deepEqual(kind(elsewhere), { kind: 'amazon', link: elsewhere, open: elsewhere, email: true }, 'U is not Amazon India: the email link itself is opened');
  const noU = 'https://www.amazon.in/gp/f.html?C=1&K=2';
  assert.deepEqual(kind(noU), { kind: 'amazon', link: noU, open: noU, email: true });
  assert.equal(kind(email('https://www.amazon.in/review/review-your-purchases/edit?asin=B0TESTMAIN&channel=email')).kind, 'writer-only');
  // Short links: opened, to see where they land.
  for (const link of ['https://amzn.in/d/0TestCode', 'https://amzn.in/TestCode1']) assert.deepEqual(kind(link), { kind: 'amazon', link, open: link, short: true });
  // Pages only the review's writer can see: never opened.
  for (const link of ['https://www.amazon.in/review/review-your-purchases/edit?asin=B0TESTMAIN&channel=YAcc-wr', `https://www.amazon.in/review/${RID}/thankyou?asin=B0TESTMAIN&channel=YAcc-wr`, 'https://www.amazon.in/review/create-review?asin=B0TESTMAIN']) {
    assert.equal(kind(link).kind, 'writer-only', link);
    assert.equal(isWriterOnlyPage(link), true, link);
  }
  // Pictures given as links.
  assert.deepEqual(kind('https://drive.google.com/open?id=1TestReviewPictureFile0'), { kind: 'drive', link: 'https://drive.google.com/open?id=1TestReviewPictureFile0', fileId: '1TestReviewPictureFile0' });
  assert.equal(kind('https://drive.google.com/file/d/1TestReviewPictureFile0/view?usp=drivesdk').fileId, '1TestReviewPictureFile0');
  for (const [link, host] of [
    ['https://storage.googleapis.com/tryboxs-screenshots/test/review-1.png', 'storage.googleapis.com'],
    ['https://tryboxs.in/api/view-screenshot/test-1', 'tryboxs.in'],
    ['https://www.tryboxs.in/api/view-screenshot/test-2', 'www.tryboxs.in'],
  ]) {
    assert.deepEqual(kind(link), { kind: 'web', link, host }, link);
  }
  // Anything else.
  assert.equal(kind(`https://www.amazon.com/gp/customer-reviews/${RID}`).kind, 'other-amazon');
  assert.deepEqual(kind('https://www.amazon.in/dp/B0TESTMAIN'), { kind: 'product', asin: 'B0TESTMAIN', link: 'https://www.amazon.in/dp/B0TESTMAIN' }, "a product's own page is not one review");
  assert.deepEqual(kind('https://www.amazon.in/gp/help/customer/display.html'), { kind: 'amazon', link: 'https://www.amazon.in/gp/help/customer/display.html', open: 'https://www.amazon.in/gp/help/customer/display.html' }, 'another Amazon page is opened to see what it is');
  assert.deepEqual(kind(''), { kind: 'not-a-link', text: '' });
  assert.deepEqual(kind('Not given'), { kind: 'not-a-link', text: 'Not given' });
  assert.equal(kind('javascript:alert(1)').kind, 'not-a-link');
});

test('a cell may hold several links, separated by spaces, commas or new lines; a file name or a word is not a link', () => {
  assert.deepEqual(linksIn('https://drive.google.com/open?id=1TestOrderPicture00A, https://drive.google.com/open?id=1TestOrderPicture00B'), ['https://drive.google.com/open?id=1TestOrderPicture00A', 'https://drive.google.com/open?id=1TestOrderPicture00B']);
  assert.deepEqual(linksIn('https://amzn.in/d/0TestCode\nhttps://amzn.in/d/1TestCode https://amzn.in/d/0TestCode'), ['https://amzn.in/d/0TestCode', 'https://amzn.in/d/1TestCode'], 'each link once');
  assert.deepEqual(linksIn('see (www.amazon.in/review/R3TESTREVIEW77/).'), ['https://www.amazon.in/review/R3TESTREVIEW77/']);
  assert.deepEqual(linksIn('drive.google.com/open?id=1TestOrderPicture00A'), ['https://drive.google.com/open?id=1TestOrderPicture00A']);
  for (const words of ['Cancelled', 'Lost in transit', '0', 'delivery-4.png', 'javascript:alert(1)', 'mailto:someone@example.com', '']) assert.deepEqual(linksIn(words), [], words);
  assert.equal(driveFileId('https://drive.google.com/open?id=1TestOrderPicture00A'), '1TestOrderPicture00A');
});

test('two links open the same thing: the same Drive file, the same review, the same address in an email link', () => {
  assert.equal(sameTarget('https://drive.google.com/open?id=1TestOrderPicture00A', 'https://drive.google.com/file/d/1TestOrderPicture00A/view?usp=sharing'), true);
  assert.equal(sameTarget(`https://amazon.in/gp/customer-reviews/${RID}?ref=a`, `https://www.amazon.in/review/${RID}/ref=b`), true);
  assert.equal(sameTarget(`https://www.amazon.in/gp/f.html?C=1&U=${enc(`https://www.amazon.in/review/${RID}/`)}`, `https://www.amazon.in/gp/customer-reviews/${RID}`), true);
  assert.equal(sameTarget('https://tryboxs.in/api/view-screenshot/test-1', 'https://www.tryboxs.in/api/view-screenshot/test-1/'), true, 'www and a final slash do not matter');
  assert.equal(sameTarget('http://amzn.in/d/0TestCode', 'https://amzn.in/d/0TestCode'), true, 'http or https does not matter');
  assert.equal(sameTarget('https://drive.google.com/open?id=1TestOrderPicture00A', 'https://drive.google.com/open?id=1TestOrderPicture00B'), false);
  assert.equal(sameTarget('https://amzn.in/d/0TestCode', 'https://amzn.in/d/1TestCode'), false);
  assert.equal(sameTarget('', ''), false, 'nothing is never the same as nothing');
  assert.equal(linkKey('https://drive.google.com/open?id=1TestOrderPicture00A'), 'drive:1TestOrderPicture00A');
  assert.equal(linkKey(`https://www.amazon.in/review/${RID}/`), `review:${RID}`);
  assert.equal(linkKey('https://www.amazon.in/review/review-your-purchases/edit?channel=x&asin=B0TESTMAIN'), 'url:amazon.in/review/review-your-purchases/edit?asin=B0TESTMAIN&channel=x');
});

test('the link behind the words is used; words that are another link make a mismatch', () => {
  const a = 'https://drive.google.com/open?id=1TestOrderPicture00A';
  const b = 'https://drive.google.com/open?id=1TestOrderPicture00B';
  assert.deepEqual(cellLinks(a, a), { text: a, link: a, links: [a], mismatch: null });
  assert.deepEqual(cellLinks(a, 'https://drive.google.com/file/d/1TestOrderPicture00A/view'), { text: a, link: 'https://drive.google.com/file/d/1TestOrderPicture00A/view', links: ['https://drive.google.com/file/d/1TestOrderPicture00A/view'], mismatch: null }, 'another form of the same file is no mismatch');
  assert.deepEqual(cellLinks(a, `https://www.amazon.in/review/${RID}/`), { text: a, link: `https://www.amazon.in/review/${RID}/`, links: [`https://www.amazon.in/review/${RID}/`], mismatch: { text: a, link: `https://www.amazon.in/review/${RID}/` } });
  assert.deepEqual(cellLinks('Open the screenshot', a), { text: 'Open the screenshot', link: a, links: [a], mismatch: null }, 'words that are not a link: the link behind them');
  assert.deepEqual(cellLinks(`${a}, ${b}`, a), { text: `${a}, ${b}`, link: a, links: [a, b], mismatch: null });
  assert.deepEqual(cellLinks(`${a}, ${b}`, `${a},%20${b}`), { text: `${a}, ${b}`, link: a, links: [a, b], mismatch: null }, 'Excel puts the whole of two links behind them');
  assert.deepEqual(cellLinks(`${a}, ${b}`, `https://www.amazon.in/review/${RID}/`).mismatch, { text: a, link: `https://www.amazon.in/review/${RID}/` });
  assert.deepEqual(cellLinks(a, 'mailto:someone@example.com'), { text: a, link: a, links: [a], mismatch: null }, 'only a web link behind the words counts');
  assert.deepEqual(cellLinks('Cancelled', null), { text: 'Cancelled', link: '', links: [], mismatch: null });
  assert.deepEqual(cellLinks('', null), { text: '', link: '', links: [], mismatch: null });
});

test('the table names where each link goes, in a few words', () => {
  for (const [link, label] of [
    ['https://drive.google.com/open?id=1TestOrderRow02abcdefgh', 'Google Drive'],
    ['https://drive.google.com/file/d/1TestOrderRow03abcdefgh/view?usp=drivesdk', 'Google Drive'],
    ['https://tryboxs.in/api/view-screenshot/test-delivery-04', 'tryboxs'],
    ['https://www.tryboxs.in/api/view-screenshot/test-delivery-05', 'tryboxs'],
    ['https://storage.googleapis.com/tryboxs-screenshots/test/delivery-row-03.png', 'storage.googleapis.com'],
    [`https://amazon.in/gp/customer-reviews/${RID}?ref=cm_cr_dp_d_rvw_ttl`, 'Amazon review'],
    [`https://www.amazon.in/review/${RID}/ref=pe_1234_5678`, 'Amazon review'],
    [`https://www.amazon.in/gp/f.html?C=1TEST&U=${enc(`https://www.amazon.in/review/${RID}/`)}&H=TEST`, 'Amazon email link'],
    ['https://amzn.in/d/0TestRow07', 'Amazon short link'],
    ['https://amzn.to/3TestLink', 'Amazon short link'],
    ['https://www.amazon.in/review/review-your-purchases/edit?asin=B0TESTFLR1&channel=YAcc-wr', 'Amazon page for the writer only'],
    [`https://www.amazon.in/review/${RID}/thankyou?asin=B0TESTKIT1`, 'Amazon page for the writer only'],
    ['https://www.amazon.in/dp/B0TESTFLR1', 'Amazon product page'],
    ['https://www.amazon.in/portal/customer-reviews/B0TESTPRD1/ref=cm_cr_dp_d_show_all_btm?sortBy=recent', "Amazon product's reviews"],
    ['https://www.amazon.in/review/create-review/error?asin=B0TESTPRD1', 'Amazon error page'],
    ['https://www.amazon.in/portal/customer-reviews/srp/-/R1TESTCODE1/ref=cm_cr_srp_d_rvw_ttl', 'Amazon review'],
    ['https://business.amazon.in/abredir/review/R1TESTCODE2/ref=pe_000', 'Amazon review'],
    ['https://apps.apple.com/in/app/test-shopping/id0000000001', 'App store'],
    ['https://www.amazon.in/gp/help/customer/display.html', 'Amazon page'],
    ['https://www.amazon.com/dp/B0TESTFLR1', 'Amazon outside India'],
    ['https://www.example.com/picture.png', 'example.com'],
  ]) {
    assert.equal(linkLabel(link), label, link);
  }
  assert.equal(linkLabel('not a link at all'), 'Link');
});

test("the newer files' review links: every link to one review finds that review; a product's page or its reviews, an error page and an app store's page are not one review", () => {
  const kind = (link) => reviewLinkKind(link);
  const srp = 'https://www.amazon.in/portal/customer-reviews/srp/-/R1TESTCODE1/ref=cm_cr_srp_d_rvw_ttl';
  assert.equal(reviewIdFrom(srp), 'R1TESTCODE1');
  assert.deepEqual(kind(srp), { kind: 'review', link: srp, reviewId: 'R1TESTCODE1', open: reviewPageUrl('R1TESTCODE1') });
  const business = `https://www.amazon.in/gp/f.html?C=1TEST&K=2TEST&R=3TEST&T=C&U=${enc('https://business.amazon.in/abredir/review/R1TESTCODE2/ref=pe_00000_000000')}&H=TESTHASH`;
  const viaBusiness = kind(business);
  assert.deepEqual([viaBusiness.kind, viaBusiness.reviewId, viaBusiness.open, viaBusiness.via], ['review', 'R1TESTCODE2', reviewPageUrl('R1TESTCODE2'), 'email'], 'an email link holding a review on business.amazon.in');
  assert.equal(kind('https://business.amazon.in/abredir/review/R1TESTCODE2/ref=pe_000').kind, 'review');
  assert.equal(linkKey(business), 'review:R1TESTCODE2', 'the same review as its own link');
  assert.equal(linkKey('https://www.amazon.in/gp/customer-reviews/R1TESTCODE2'), 'review:R1TESTCODE2');
  const list = 'https://www.amazon.in/portal/customer-reviews/B0TESTPRD1/ref=cm_cr_dp_d_show_all_btm?sortBy=recent';
  assert.deepEqual(kind(list), { kind: 'reviews', asin: 'B0TESTPRD1', link: list }, "a product's list of reviews");
  assert.equal(kind('https://www.amazon.in/product-reviews/B0TESTPRD1').kind, 'reviews');
  for (const link of ['https://www.amazon.in/review/create-review/error?asin=B0TESTPRD1', 'https://www.amazon.in/review/review-your-purchases/error?ref=test']) assert.deepEqual(kind(link), { kind: 'error', link }, link);
  assert.deepEqual(kind('https://apps.apple.com/in/app/test-shopping/id0000000001'), { kind: 'app', link: 'https://apps.apple.com/in/app/test-shopping/id0000000001', host: 'apps.apple.com' });
  assert.equal(kind('https://play.google.com/store/apps/details?id=test.shopping').kind, 'app');
  assert.deepEqual(kind('https://lh3.googleusercontent.com/TestPictureRow08'), { kind: 'web', link: 'https://lh3.googleusercontent.com/TestPictureRow08', host: 'lh3.googleusercontent.com' }, 'a picture link');
  assert.equal(kind('https://www.amazon.in/review/create-review?asin=B0TESTMAIN').kind, 'writer-only', 'the page to write a review is still for the writer only');
});
