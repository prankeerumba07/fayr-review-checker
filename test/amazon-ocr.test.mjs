// Reading a screenshot on this computer: Tesseract (English and Hindi) for
// the words, the pixels for the stars and the fingerprint. No API key.
// Run: node test/amazon-ocr.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTsv, segment, segments, starsBesideTitle, readScreenshot, tesseractLanguages } from '../amazon/ocr.js';
import { ImageReader } from '../amazon/browsers.js';
import { fingerprintDistance, SAME_SCREENSHOT } from '../amazon/image-read.js';
import { overlapScore } from '../amazon/text.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'amazon');
const images = new ImageReader();
after(() => images.close());
const read = (name, hints) => readScreenshot(join(FIX, name), { hints, analyse: (f) => images.analyse(f, name.endsWith('.jpg') ? 'image/jpeg' : 'image/png') });

const BODY = 'The rack folds flat in seconds and holds a full load of winter clothes. The wheels lock firmly and the zircon grey finish has not chipped after a month of daily use.';
const HINTS = { title: 'Folds flat and holds a lot', name: 'Asha R Verma', productTitle: 'Test Brand Folding Garment Rack with Wheels' };

test("Tesseract's TSV as lines", () => {
  const tsv = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '1\t1\t0\t0\t0\t0\t0\t0\t800\t600\t-1\t',
    '5\t1\t1\t1\t1\t1\t10\t20\t50\t12\t96.5\tHello',
    '5\t1\t1\t1\t1\t2\t70\t21\t60\t12\t91\tworld',
    '5\t1\t1\t1\t2\t1\t10\t40\t40\t12\t88\tagain',
  ].join('\n');
  const { words, lines } = parseTsv(tsv);
  assert.equal(words.length, 3);
  assert.deepEqual(lines.map((l) => l.text), ['Hello world', 'again']);
  assert.deepEqual([lines[0].left, lines[0].top, lines[0].right, lines[0].bottom], [10, 20, 130, 33]);
});

test('the parts of a review, found around "Reviewed in … on …"', () => {
  const L = (text, top = 0) => ({ text, left: 100, top, right: 600, bottom: top + 20, conf: 95 });
  const lines = [L('Customer Review'), L('Asha R Verma'), L('xk ** Folds flat and holds a lot'), L('Reviewed in India on 12 August 2026'), L('Colour: Grey | Verified Purchase'), L('The rack folds flat.'), L('The wheels lock.'), L('2 people found this helpful'), L('Helpful | Report')];
  const plain = segment(lines);
  assert.equal(plain.name, 'Asha R Verma');
  assert.equal(plain.title, 'xk ** Folds flat and holds a lot', 'without hints the whole line is kept');
  assert.equal(plain.day, '2026-08-12');
  assert.equal(plain.verified, true);
  assert.equal(plain.body, 'The rack folds flat.\nThe wheels lock.');
  const hinted = segment(lines, HINTS);
  assert.equal(hinted.title, 'Folds flat and holds a lot', 'with the title known, the stars read as letters drop off');
  assert.deepEqual(segment([L('nothing here')]), { name: null, title: null, titleLine: null, dateText: null, day: null, body: null, product: null, verified: false });
});

test('the Amazon app lays a review out as name, a row of stars with "Verified Purchase", the title (on one line or two), the date: the stars are never the name, and Amazon\'s buttons and the next review are never the words', () => {
  const L = (text, top = 0) => ({ text, left: 40, top, right: 600, bottom: top + 20, conf: 90 });
  const app = [L('< Test Brand Folding Garment Rack w...'), L('€ Asha R Verma'), L('KKKKK Verified Purchase'), L('Folds flat and holds'), L('a lot'), L('Reviewed in India on 12 August 2026'), L('Colour: Grey'), L('MADE FOR HOMES'), L('The rack folds flat.'), L('The wheels lock... See more'), L('Thank you for your review.'), L('( Edit ) ( Delete )'), L('Home You Wallet Cart Menu Rufus')];
  const plain = segment(app);
  assert.deepEqual([plain.name, plain.title, plain.body], ['Asha R Verma', 'Folds flat and holds a lot', 'The rack folds flat.\nThe wheels lock'], 'without hints, by their places');
  const hinted = segment(app, HINTS);
  assert.deepEqual([hinted.name, hinted.title], ['Asha R Verma', 'Folds flat and holds a lot'], 'with hints, by their words');
  assert.equal(segment(app, { name: 'Deepa Rao' }).name, 'Asha R Verma', 'a name that is not on the screenshot: still the name shown');
  // A desktop page: the product's name and "by <brand>" from the column beside the review fall between the name and the title.
  const desktop = [L('Customer Review Product Details'), L('(Re Asha R Verma'), L('Test Brand Folding Garment Rack w...'), L('& by Test Brand'), L('xk ** Folds flat and holds a lot'), L('Reviewed in India on 12 August 2026 4.4 out of 5'), L('Colour: Grey | Verified Purchase'), L('The rack folds flat.'), L('Helpful | Report')];
  assert.equal(segment(desktop).name, 'Asha R Verma', 'without hints: over the lines beside the review');
  assert.equal(segment(desktop, HINTS).name, 'Asha R Verma');
  assert.equal(segment(desktop, HINTS).title, 'Folds flat and holds a lot');
  assert.equal(segment(desktop).verified, true);
  // Several reviews: each by its date line; the viewer's own is marked by "Thank you for your review." or Edit and Delete.
  const two = segments([...app.slice(1, 12), L('Deepa Rao'), L('Kk kkk Verified Purchase'), L('Fine'), L('Reviewed in India on 20 August 2026'), L('Fine for the price.'), L('Helpful Share Report')]);
  assert.deepEqual(two.map((s) => [s.name, s.title, s.body, s.own]), [['Asha R Verma', 'Folds flat and holds a lot', 'The rack folds flat.\nThe wheels lock', true], ['Deepa Rao', 'Fine', 'Fine for the price.', false]]);
});

test('stars are read only when one row of orange stars sits level with the title, at its left', () => {
  const title = { left: 300, top: 300, right: 700, bottom: 330 };
  const row = (count, left, top) => ({ count, left, top, right: left + count * 30, bottom: top + 28, size: 28 });
  assert.deepEqual(starsBesideTitle([row(4, 60, 302)], title), { stars: 4, how: 'Counted by colour beside the title.' });
  assert.equal(starsBesideTitle([row(4, 60, 500)], title).stars, null, 'not level with the title');
  assert.equal(starsBesideTitle([row(4, 60, 302), row(3, 120, 300)], title).stars, null, 'two rows: not certain');
  assert.equal(starsBesideTitle([row(7, 60, 302)], title).stars, null, 'more than five is not a rating');
  assert.equal(starsBesideTitle([], title).stars, null);
  assert.match(starsBesideTitle([row(4, 60, 302)], null).how, /^Skipped/);
});

test('a clear desktop screenshot: name, title, date, stars by colour and the full text', async () => {
  const langs = await tesseractLanguages();
  assert.ok(langs.has('eng') && langs.has('hin'), 'English and Hindi are installed');
  const r = await read('screenshot-review.png', HINTS);
  assert.equal(r.ok, true);
  assert.equal(r.problem, null);
  assert.equal(r.lang, 'eng+hin');
  assert.equal(r.name, 'Asha R Verma');
  assert.equal(r.title, 'Folds flat and holds a lot');
  assert.equal(r.day, '2026-08-12');
  assert.equal(r.verified, true);
  assert.equal(r.stars, 4);
  assert.equal(r.starsHow, 'Counted by colour beside the title.');
  assert.ok(overlapScore(BODY, r.body) >= 0.95, `body read: ${overlapScore(BODY, r.body)}`);
  assert.ok(r.confidence >= 80);
  assert.match(r.fingerprint, /^[0-9a-f]{576}$/);
});

test('the stars are counted, not assumed', async () => {
  const r = await read('screenshot-two-stars.png', HINTS);
  assert.equal(r.stars, 2);
});

test('a Hindi review is read in Hindi', async () => {
  const r = await read('screenshot-hindi.png', { name: 'Asha R Verma', title: 'मुड़ जाता है और बहुत जगह है' });
  assert.equal(r.ok, true);
  const hindi = 'यह रैक कुछ ही सेकंड में मुड़ जाता है और सर्दियों के पूरे कपड़े रखता है। पहिये मज़बूती से रुकते हैं और एक महीने बाद भी रंग नहीं उतरा।';
  const score = overlapScore(hindi, r.body);
  assert.ok(score >= 0.85, `Hindi words read: ${score}`);
  assert.equal(r.stars, 4);
});

test('an unreadable image is "Screenshot is not clear", never a guess', async () => {
  const r = await read('screenshot-noise.png', HINTS);
  assert.equal(r.ok, false);
  assert.equal(r.problem, 'Screenshot is not clear.');
  assert.equal(r.stars, null);
  const broken = await readScreenshot(join(FIX, 'screenshot-review.png'), { tesseract: async () => { throw new Error('no tesseract'); }, analyse: async () => null });
  assert.equal(broken.ok, false);
  assert.match(broken.problem, /^Screenshot is not clear/);
});

test('the fingerprint finds the same screenshot saved again, and tells a different review apart', async () => {
  const fp = async (name, type) => (await images.analyse(join(FIX, name), type)).fingerprint;
  const a = await fp('screenshot-review.png', 'image/png');
  const again = await fp('screenshot-review-again.jpg', 'image/jpeg');
  const other = await fp('screenshot-hindi.png', 'image/png');
  assert.ok(fingerprintDistance(a, again) <= SAME_SCREENSHOT, `again: ${fingerprintDistance(a, again)}`);
  assert.ok(fingerprintDistance(a, other) > 1.5 * SAME_SCREENSHOT, `other: ${fingerprintDistance(a, other)}`);
  assert.equal(fingerprintDistance(a, a), 0);
  assert.equal(fingerprintDistance(a, null), null);
});
