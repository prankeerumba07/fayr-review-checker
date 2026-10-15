// The same order, screenshot or review used in two rows of a Flipkart file
// (flipkart/check.js step 1, flipkart/duplicates.js, flipkart/fingerprint.js),
// found the way the Amazon checker finds them: the same order ID, the same
// screenshot or review link, the same picture (the same file, or one that
// looks the same and reads the same), and, on Flipkart, the same review found
// on Flipkart. Rows count in the file's order: only the first of the rows that
// share one is checked, the later ones are Duplicate (a Fail), and each Note
// names the other row and what is the same. Made-up rows, pictures and
// reviews only; nothing is downloaded and no page is opened.
// Run: node test/flipkart-duplicates.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
import { runCheck, STEP_NAMES } from '../flipkart/check.js';
import { before, firstOf, rowName, rowsNamed, sameWords } from '../flipkart/duplicates.js';
import { bmpGrey, fingerprintOf, fingerprintDistance, fingerprintFile, SAME_SCREENSHOT, GRID } from '../flipkart/fingerprint.js';
import { orderIdsIn, datesIn, amountsIn } from '../flipkart/screen-text.js';
import { parseDelivery } from '../flipkart/delivery-read.js';
import { parseReviewShot } from '../flipkart/review-read.js';

const drive = (id) => `https://drive.google.com/open?id=${id}`;
const cell = (over = {}) => ({ text: '', link: '', links: [], mismatch: null, picture: null, ...over });
const BOTTLE = 'Test Brand Steel Bottle 1 L, Blue';
const ID = (n) => `OD10000000000000010${n}`;
/** A made-up row of the file: its row there is n + 1, its number on the dashboard n. */
const rowOf = (n, over = {}) => ({
  id: `r00000000d00${n}`,
  row: n + 1,
  n,
  orderId: { text: ID(n), value: ID(n) },
  orderDate: { text: '20-07-2026', value: '2026-07-20' },
  amount: { text: '349', value: 349 },
  product: { text: 'Test Brand Steel Bottle' },
  shots: { order: cell({ links: [drive(`1TestDupOrder${n}`)] }), delivery: cell({ links: [drive(`1TestDupDelivery${n}`)] }), review: cell(), reviewShot: cell({ links: [drive(`1TestDupReview${n}`)] }) },
  pictures: { order: [], delivery: [], review: [], reviewShot: [] },
  ...over,
});
const pic = (sha256, fingerprint = null) => ({ link: null, file: `${sha256}.png`, type: 'image/png', sha256, ...(fingerprint ? { fingerprint } : {}) });
const reading = (texts, over = {}) => ({ ok: true, problem: null, confidence: 90, wordCount: 40, hindi: true, lines: texts.map((text) => ({ text })), texts, text: texts.join('\n'), orderIds: orderIdsIn(texts), dates: datesIn(texts), amounts: amountsIn(texts), ...over });
/** A purchase screenshot and a delivery screenshot of order id. */
const PURCHASE = (id) => reading(['< Order Details Help', BOTTLE, `Order #${id}`, 'Your Order has been placed, Mon 20th Jul', 'Total amount ₹349']);
const DELIVERY = (id) => ({ ...reading(['< Order Details Help', BOTTLE, `Order #${id}`, '© Delivered, Thu 23rd Jul ^']), ...parseDelivery(['< Order Details Help', BOTTLE, `Order #${id}`, '© Delivered, Thu 23rd Jul ^']) });
const REVIEWER = 'Test Reviewer One';
const WORDS = { title: 'Terrific purchase', text: 'Keeps water cold all day and the grip is good.' };
const REVIEW_LINES = ['My Reviews (1)', BOTTLE, '| 5* Terrific purchase', WORDS.text, `${REVIEWER} @ Certified Buyer 12 Sep, 2026`, 'Edit Delete Share'];
const CAMPAIGN = { name: 'Test Brand Bottles', brand: 'Test Brand', products: [{ pid: 'TESTPID0000001', name: BOTTLE, short: 'Test Brand Steel Bottle 1 L', variants: [] }] };
const MINE_ID = '00000000-0000-4000-8000-000000000031';
const MINE = { id: MINE_ID, name: REVIEWER, stars: 5, ...WORDS, dateSaid: '12 days ago', date: '2026-10-01', dateLatest: '2026-10-01', city: 'Test Town', certified: true, reviewFor: null, link: `https://www.flipkart.com/reviews/TESTPID0000001:31?reviewId=${MINE_ID}`, page: 1 };
const READ = { pid: 'TESTPID0000001', link: 'https://www.flipkart.com/test-brand-steel-bottle/product-reviews/itmtestbottle01?pid=TESTPID0000001&marketplace=FLIPKART', readAt: '2026-10-13T05:00:00.000Z', since: null, pages: 1, total: 1, end: 'last page', stoppedAt: null, says: '1 review read: all the reviews Flipkart shows.', links: true, reviews: [MINE], product: { pid: 'TESTPID0000001', name: BOTTLE, rating: 4.2, ratings: 10, reviews: 1 } };

/**
 * One row's check among others, with a pretend screenshots.js (each cell gives
 * one made-up picture, kept as the row's pictures say, or as given) and
 * pretend readers: the purchase and delivery screenshots show the order said
 * (shows: { order, delivery }, else the row's own), the review screenshot the
 * made-up review. -> the result, the cells opened and the events.
 */
async function check(row, others, { shows = {}, records = {}, reviews = READ, campaigns = [CAMPAIGN], ...opts } = {}) {
  const asked = [];
  const events = [];
  const screenshots = {
    async forCell(rowId, which) {
      asked.push(which);
      return { files: [`/made-up/${which}.png`], problems: [], types: ['image/png'], records: records[which] ?? row.pictures?.[which] ?? [] };
    },
  };
  const result = await runCheck({
    row,
    others,
    screenshots,
    readOrder: async () => PURCHASE(shows.order ?? row.orderId.value),
    readDelivery: async () => DELIVERY(shows.delivery ?? row.orderId.value),
    readReview: async (files, o) => ({ ...reading(REVIEW_LINES), ...parseReviewShot(REVIEW_LINES, { reviewer: o?.reviewer, productIs: o?.productIs }) }),
    reviewer: REVIEWER,
    campaigns,
    reviews: async () => reviews,
    now: () => new Date('2026-10-13T05:00:00.000Z'),
    emit: (e) => events.push(e),
    ...opts,
  });
  return { result, asked, events };
}
const NOT_RUN = (n) => ['not-reached', `Step ${n} found that this row is a duplicate, so this step was not run.`];
const stepsOf = (r) => r.steps.map((s) => [s.state, s.detail]);

test('rows in the file\'s order, named by their number on the dashboard; "the first" of some rows is the one nearest the top, whichever was checked first; two readings are the same with the same order IDs, or almost all the same words', () => {
  const [one, two, three] = [rowOf(1), rowOf(2), rowOf(3)];
  assert.deepEqual([before(one, two), before(two, one), before(one, one), firstOf([three, one, two]).id], [true, false, false, one.id]);
  assert.deepEqual([rowName(two), rowsNamed([three]), rowsNamed([three, one]), rowsNamed([three, two, one])], ['row 2', 'row 3', 'rows 1 and 3', 'rows 1, 2 and 3']);
  assert.equal(sameWords({ orderIds: [ID(1)], text: 'a' }, { orderIds: [ID(1)], text: 'b' }), true);
  assert.equal(sameWords({ orderIds: [ID(1)], text: 'a' }, { orderIds: [ID(2)], text: 'a' }), false);
  assert.equal(sameWords({ orderIds: [], text: 'Keeps water cold all day and the grip is good.' }, { orderIds: [], text: 'Keeps water cold all day and the grip is good' }), true);
  assert.equal(sameWords({ orderIds: [], text: 'Keeps water cold all day.' }, { orderIds: [], text: 'The lid is a bit tight but fine.' }), false);
  assert.equal(sameWords({ orderIds: [], text: 'Too short' }, { orderIds: [], text: 'Too short' }), false, 'too few words to tell');
});

test("a screenshot's fingerprint, as the Amazon checker makes it: the same picture saved again, or made smaller, is near; another picture is far; a plain BMP is read whichever way its rows go; the Mac's picture tool makes the copy it is read from, and a file that is not a picture gets none", async () => {
  const W = 120;
  const H = 200;
  const grid = (f) => {
    const grey = new Float64Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grey[y * W + x] = f(x, y);
    return { width: W, height: H, grey };
  };
  const stripes = (x, y) => (((x >> 3) + (y >> 4)) % 3) * 90;
  const a = fingerprintOf(grid(stripes));
  const noisy = fingerprintOf(grid((x, y) => Math.min(255, stripes(x, y) + ((x * 7 + y * 13) % 5))));
  const other = fingerprintOf(grid((x, y) => (((x >> 2) + (y >> 5)) % 2) * 200));
  assert.equal(a.length, (GRID * GRID) / 4);
  assert.ok(fingerprintDistance(a, noisy) <= SAME_SCREENSHOT, 'saved again');
  assert.ok(fingerprintDistance(a, other) > SAME_SCREENSHOT, 'another picture');
  assert.equal(fingerprintOf(grid(() => 255)), '0'.repeat((GRID * GRID) / 4), 'a blank page sets no bit');
  assert.deepEqual([fingerprintDistance(a, a), fingerprintDistance(a, 'ff'), fingerprintDistance(null, a)], [0, null, null]);
  // A BMP's pixels, from the top, whichever way its rows are kept, 24 or 32 bits each.
  const bmp = (bits, topDown) => {
    const size = bits / 8;
    const line = Math.ceil((2 * size) / 4) * 4;
    const buf = Buffer.alloc(54 + line * 2);
    buf.write('BM', 0, 'latin1');
    buf.writeUInt32LE(54, 10);
    buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(2, 18);
    buf.writeInt32LE(topDown ? -2 : 2, 22);
    buf.writeUInt16LE(bits, 28);
    // The top row: black then white; the bottom row: white then black (blue, green, red).
    const rows = [[0, 255], [255, 0]];
    for (let y = 0; y < 2; y++) {
      const at = 54 + (topDown ? y : 1 - y) * line;
      for (let x = 0; x < 2; x++) buf.fill(rows[y][x], at + x * size, at + x * size + 3);
    }
    return buf;
  };
  for (const [bits, topDown] of [[24, true], [24, false], [32, true]]) assert.deepEqual([...bmpGrey(bmp(bits, topDown)).grey].map(Math.round), [0, 255, 255, 0], `${bits} bits, ${topDown ? 'from the top' : 'from the bottom'}`);
  assert.equal(bmpGrey(Buffer.from('not a picture')), null);
  // The Mac's picture tool: a made-up picture and the same picture as a JPEG are the same screenshot.
  const dir = mkdtempSync(join(tmpdir(), 'arc-flipkart-dup-'));
  try {
    const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])) >>> 0);
      return Buffer.concat([len, Buffer.from(type), data, crc]);
    };
    const head = Buffer.alloc(13);
    head.writeUInt32BE(W, 0);
    head.writeUInt32BE(H, 4);
    head[8] = 8;
    head[9] = 0;
    const lines = Array.from({ length: H }, (_, y) => Buffer.from([0, ...Array.from({ length: W }, (_, x) => stripes(x, y))]));
    writeFileSync(join(dir, 'made-up.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(Buffer.concat(lines))), chunk('IEND', Buffer.alloc(0))]));
    writeFileSync(join(dir, 'not-a-picture.png'), 'made-up words, not a picture');
    const print = await fingerprintFile(join(dir, 'made-up.png'));
    assert.ok(fingerprintDistance(print, a) <= SAME_SCREENSHOT, 'the same picture, read through the Mac\'s picture tool');
    assert.deepEqual([await fingerprintFile(join(dir, 'not-a-picture.png')), await fingerprintFile(join(dir, 'made-up.png'), { sips: '/made-up/no-such-tool' })], [null, null]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the same order ID as a row nearer the top: Duplicate, a Fail, and nothing more is checked; the Note names that row and what is the same; the row nearer the top is checked as usual, and its Note names the later row', async () => {
  const one = rowOf(1);
  const two = rowOf(2, { orderId: { text: ID(1), value: ID(1) } });
  const later = await check(two, [one]);
  assert.deepEqual(stepsOf(later.result), [['fail', 'This row has the same order ID, so it is a duplicate and was not checked.'], ...[2, 3, 4, 5, 6, 7, 8, 9].map(() => NOT_RUN(1)), ['fail', 'Fail: Duplicate.']]);
  assert.deepEqual([later.result.final, later.result.status, later.result.typeKey, later.result.type, later.asked], ['fail', 'Fail', 'duplicate', 'Duplicate', []]);
  assert.equal(later.result.note, `This transaction failed because it is a duplicate: order ID ${ID(1)} is also in row 1, and row 1 is the one that will be checked.`);
  assert.equal(STEP_NAMES[0], 'Duplicates and links in the sheet');
  // The row nearer the top was checked already: "was already checked", and this row "was not checked again".
  const checkedFirst = await check(two, [{ ...one, check: { final: 'pass', typeKey: 'verified' } }]);
  assert.deepEqual([checkedFirst.result.steps[0].detail, checkedFirst.result.note], ['This row has the same order ID, so it is a duplicate and was not checked again.', `This transaction failed because it is a duplicate: order ID ${ID(1)} was already checked in row 1.`]);
  // The row nearer the top, checked after the later one: checked as usual, saying which row is its duplicate.
  const first = await check(one, [{ ...two, check: later.result }]);
  assert.deepEqual([first.result.typeKey, first.result.steps[0].state, first.result.steps[0].detail], ['verified', 'pass', 'The same order ID is also in row 2. That row is a duplicate and was not checked.']);
  assert.match(first.result.note, /^This transaction passed: .* The same order ID is also in row 2\. That row is a duplicate and was not checked\.$/);
  // What else is missing is said too.
  const empty = await check(rowOf(2, { orderId: { text: ID(1), value: ID(1) }, shots: { ...two.shots, delivery: cell({ text: 'Will send later' }) } }), [one]);
  assert.match(empty.result.note, /\. Also missing: the delivery screenshot \(the cell says "Will send later"\)\.$/);
});

test('the same screenshot link, or the same link to one review on Flipkart, as a row nearer the top: Duplicate; never a product\'s page, its reviews or a short link, nor Flipkart\'s message that a review was not accepted', async () => {
  const one = rowOf(1);
  const sameShot = await check(rowOf(2, { shots: { ...rowOf(2).shots, delivery: cell({ links: [drive('1TestDupOrder1')] }) } }), [one]);
  assert.deepEqual([sameShot.result.typeKey, sameShot.result.steps[0].detail, sameShot.result.finalSays], ['duplicate', 'Two different orders cannot share one screenshot, so this row is a duplicate and was not checked.', 'This transaction failed because it is a duplicate: this row uses the same delivery screenshot as row 1, and row 1 is the one that will be checked.']);
  const REVIEW_LINK = `https://www.flipkart.com/reviews/TESTPID0000001:31?reviewId=${MINE_ID}`;
  const withLink = (n, link, over = {}) => rowOf(n, { shots: { ...rowOf(n).shots, review: cell({ links: [link] }) }, ...over });
  const sameReview = await check(withLink(2, REVIEW_LINK), [withLink(1, REVIEW_LINK)]);
  assert.deepEqual([sameReview.result.typeKey, sameReview.result.steps[0].detail, sameReview.result.finalSays], ['duplicate', 'Two different orders cannot share one review, so this row is a duplicate and was not checked.', 'This transaction failed because it is a duplicate: this row uses the same review link as row 1, and row 1 is the one that will be checked.']);
  // A product's page, its reviews or a short link is not one review: two rows may give it.
  for (const link of ['https://www.flipkart.com/test-brand-steel-bottle/p/itmtestbottle01?pid=TESTPID0000001', 'https://www.flipkart.com/test-brand-steel-bottle/product-reviews/itmtestbottle01?pid=TESTPID0000001', 'https://fkrt.it/TestDup01']) {
    assert.notEqual((await check(withLink(2, link), [withLink(1, link)])).result.typeKey, 'duplicate', link);
  }
  // A picture of Flipkart's message that a review was not accepted, given by the same link for two orders of one account, is the same message, not the same review.
  const PICTURE = drive('1TestDupRefused');
  const refused = { final: 'fail', typeKey: 'cannotAddReviews', review: { ok: true, kind: 'refused', text: 'made-up' } };
  assert.equal((await check(withLink(2, PICTURE), [withLink(1, PICTURE)])).result.typeKey, 'duplicate', 'the same picture link of a review');
  assert.notEqual((await check(withLink(2, PICTURE), [withLink(1, PICTURE, { check: refused })])).result.typeKey, 'duplicate');
});

test('the same picture as a row nearer the top: the very same file (step 1, read first to see whose order it shows), or one that looks the same and reads the same once read; a screenshot of this row\'s own order, and not of the other row\'s, is not a duplicate', async () => {
  const one = rowOf(1, { pictures: { order: [pic('a1')], delivery: [pic('b1')], review: [], reviewShot: [pic('c1')] }, check: { final: 'pass', order: { ok: true, orderIds: [ID(1)], text: `Order #${ID(1)}` } } });
  // The same file in this row's delivery cell, showing the other row's order: Duplicate at step 1.
  const sameFile = rowOf(2, { pictures: { order: [], delivery: [pic('a1')], review: [], reviewShot: [] } });
  const dup = await check(sameFile, [one], { shows: { delivery: ID(1) } });
  assert.deepEqual([dup.result.typeKey, dup.result.steps[0].detail, dup.result.finalSays, dup.asked], ['duplicate', 'Two different orders cannot share one screenshot, so this row is a duplicate and was not checked again.', 'This transaction failed because it is a duplicate: the delivery screenshot in this row is the same picture as the purchase screenshot in row 1, which was already checked.', ['delivery']]);
  // The same file, but it shows this row's own order and not the other row's: it is this row's screenshot.
  const own = await check(sameFile, [one]);
  assert.notEqual(own.result.typeKey, 'duplicate');
  // The same review screenshot file: Duplicate.
  const review = await check(rowOf(2, { pictures: { order: [], delivery: [], review: [], reviewShot: [pic('c1')] } }), [one]);
  assert.equal(review.result.finalSays, 'This transaction failed because it is a duplicate: the review screenshot in this row is the same picture as the review screenshot in row 1, which was already checked.');
  // Once read: a picture just downloaded that looks the same (its fingerprint this close) and reads the same (the same order ID) as the other row's.
  const print = '0'.repeat(576);
  const near = `1${'0'.repeat(575)}`;
  const looked = { ...one, pictures: { ...one.pictures, order: [pic('a1', print)] } };
  const fresh = rowOf(2);
  const lookAlike = await check(fresh, [looked], { records: { order: [pic('d2', near)] }, shows: { order: ID(1) } });
  assert.deepEqual([lookAlike.result.typeKey, stepsOf(lookAlike.result).slice(0, 4)], ['duplicate', [['pass', 'No other row has this order ID, these links or these pictures.'], ['pass', 'Opened the purchase screenshot.'], ['fail', 'Two different orders cannot share one screenshot, so this row is a duplicate and was not checked again.'], NOT_RUN(3)]]);
  assert.equal(lookAlike.result.finalSays, 'This transaction failed because it is a duplicate: the purchase screenshot in this row is the same picture as the purchase screenshot in row 1, which was already checked.');
  // It looks the same but reads differently (its own order ID): not the same picture.
  assert.notEqual((await check(fresh, [looked], { records: { order: [pic('d2', near)] } })).result.typeKey, 'duplicate');
  // This row nearer the top: it is checked as usual, and the later row that has its picture is marked Duplicate, with its own Note.
  const top = rowOf(1, { pictures: { order: [], delivery: [pic('e1')], review: [], reviewShot: [] } });
  const below = rowOf(3, { pictures: { order: [pic('e1')], delivery: [], review: [], reviewShot: [] }, orderId: { text: '', value: '' } });
  const marked = await check(top, [below]);
  assert.deepEqual([marked.result.typeKey === 'duplicate', marked.result.alsoDuplicate], [false, [{ id: below.id, note: 'This transaction failed because it is a duplicate: the purchase screenshot in this row is the same picture as the delivery screenshot in row 1, which is the one checked.', final: 'fail', finalSays: 'This transaction failed because it is a duplicate: the purchase screenshot in this row is the same picture as the delivery screenshot in row 1, which is the one checked.' }]]);
  assert.match(marked.result.note, / The same delivery screenshot is also in row 3\. That row is a duplicate and was not checked\.$/);
});

test('on Flipkart, two rows whose reviews are found as the same review on Flipkart count as the same review: the later row is Duplicate; this row nearer the top marks the later one; a review link that opens the review another row found is the same review too', async () => {
  const one = rowOf(1);
  const found = (review = MINE) => ({ final: 'pass', typeKey: 'verified', found: { how: 'found', review: { id: review.id, name: review.name, stars: review.stars, title: review.title, text: review.text } } });
  const later = await check(rowOf(2), [{ ...one, check: found() }]);
  assert.deepEqual([later.result.typeKey, later.result.found.how, later.result.steps[7].detail, later.result.steps[8], later.result.finalSays], ['duplicate', 'found', 'Two different orders cannot share one review, so this row is a duplicate and was not checked further.', { n: 9, name: STEP_NAMES[8], state: 'not-reached', detail: 'Step 8 found that this row is a duplicate, so this step was not run.' }, 'This transaction failed because it is a duplicate: the review in this row is the same review on Flipkart as in row 1, which was already checked.']);
  // Found with no ID: the same name, stars, title and words.
  const noId = { ...MINE, id: null, link: null };
  assert.equal((await check(rowOf(2), [{ ...one, check: found(noId) }], { reviews: { ...READ, reviews: [noId] } })).result.typeKey, 'duplicate');
  // Another review found by the other row: not the same.
  assert.notEqual((await check(rowOf(2), [{ ...one, check: found({ ...MINE, id: '00000000-0000-4000-8000-000000000032' }) }])).result.typeKey, 'duplicate');
  // This row nearer the top, checked after the later one: checked as usual, and the later row is marked Duplicate.
  const first = await check(one, [{ ...rowOf(2), check: found() }]);
  assert.deepEqual([first.result.typeKey, first.result.alsoDuplicate.map((d) => [d.id, d.finalSays])], ['verified', [[rowOf(2).id, 'This transaction failed because it is a duplicate: the review in this row is the same review on Flipkart as in row 1, which is the one checked.']]]);
  assert.match(first.result.note, / The same review is also in row 2\. That row is a duplicate and was not checked\.$/);
  // A review link that opens the review row 1's check found: Duplicate at step 1.
  const linked = rowOf(2, { shots: { ...rowOf(2).shots, review: cell({ links: [MINE.link] }) } });
  const byLink = await check(linked, [{ ...one, check: found() }]);
  assert.deepEqual([byLink.result.typeKey, byLink.result.steps[0].state, byLink.result.finalSays], ['duplicate', 'fail', 'This transaction failed because it is a duplicate: the review in this row is the same review on Flipkart as in row 1, which was already checked.']);
});
