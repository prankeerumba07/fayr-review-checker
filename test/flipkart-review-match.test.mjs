// Step 7's search for the review on the review screenshot among Flipkart's
// reviews (flipkart/review-match.js): its words and its name must both match,
// only reviews posted from the day counting; one that fits is found, two and
// none is picked; never on the name alone; words under another name, or under
// "Flipkart Customer", are their own results. Made-up reviews only.
// Run: node test/flipkart-review-match.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchReview, shotWords, noNameShown, WORDS_SHARE, RARE_WORDS_NEEDED, RARE_SHARE } from '../flipkart/review-match.js';
import { rareWords } from '../flipkart/text.js';
import { rareWords as amazonRareWords } from '../amazon/text.js';

/** A made-up review as reviews.js keeps it. */
const kept = (id, name, text, { title = 'Nice', stars = 4, date = '2026-10-07', latest = date, said = '5 days ago', page = 1 } = {}) => ({ id, name, stars, title, text, dateSaid: said, date, dateLatest: latest, city: 'Test Town', certified: true, reviewFor: null, page });
const BOTTLE = 'The steel bottle keeps water cold through a long summer afternoon. The lid seals tightly and nothing leaked inside my office backpack.';
const LUNCH = 'Lunch box latches snap shut firmly and the compartments keep chutney separate from rice.';
const DENTED = 'Bottle arrived dented at one corner and scratched, otherwise fine for gym sessions.';
const REVIEWS = [
  kept('FK-1', 'Test Reviewer Asha', BOTTLE, { title: 'Wonderful', stars: 5 }),
  kept('FK-2', 'Test Reviewer Bina', 'Good product', { date: '2026-10-06' }),
  kept('FK-3', 'Flipkart Customer', DENTED, { title: 'Okay', stars: 3, page: 2 }),
  kept('FK-4', 'Test Reviewer Chand', LUNCH, { page: 2 }),
];
const find = (shot, opts = {}) => matchReview({ shot, reviews: REVIEWS, day: '2026-09-01', avoid: ['Test Brand Steel Bottle 1 L'], ...opts });

test('the words searched with: the review screenshot\'s title and words; a text cut short loses its last word, which may be cut; "Flipkart Customer" or no name is no name shown; the distinctive words copied from the Amazon checker, with Flipkart\'s own name a common word', () => {
  assert.equal(shotWords({ title: 'Wonderful', body: 'Keeps water cold all day. The lid se... READ MORE' }), 'Wonderful\nKeeps water cold all day. The lid');
  assert.equal(shotWords({ title: null, body: 'Keeps water cold all day…' }), 'Keeps water cold all');
  assert.equal(shotWords({ title: '', body: '' }), '');
  assert.deepEqual([noNameShown('Flipkart Customer'), noNameShown('  '), noNameShown(null), noNameShown('Test Reviewer Asha')], [true, true, true, false]);
  const text = 'The rack folds flat in seconds and holds a full load of winter clothes. The wheels lock firmly.';
  assert.deepEqual(rareWords(text, ['Test Brand Rack']), amazonRareWords(text, ['Test Brand Rack']));
  assert.deepEqual([rareWords('flipkart delivered quickly', []), amazonRareWords('flipkart delivered quickly', [])], [['quickly', 'delivered'], ['quickly', 'delivered', 'flipkart']]);
  assert.deepEqual([WORDS_SHARE, RARE_WORDS_NEEDED, RARE_SHARE], [0.8, 2, 0.75]);
});

test('found: one review with the screenshot\'s words (small reading mistakes allowed, a text cut by "READ MORE" only as far as it goes) under the name on the screenshot, else the reviewer\'s name in the sheet; a shorter form of the name fits too', () => {
  const shot = { title: 'Wonderful', body: 'The steel botle keeps water cold through a long summer afternoon. The lid seals tightly and nothing le... READ MORE', name: 'Test Reviewer Asha' };
  const m = find(shot);
  assert.deepEqual([m.how, m.review.id, m.review.stars, m.review.page, m.count, m.name, m.counted], ['found', 'FK-1', 5, 1, 1, { name: 'Test Reviewer Asha', from: 'screenshot' }, 4]);
  assert.equal(m.share, 1, 'a word read with a slip still counts, and the word cut short is left out');
  // The review being typed, or My Reviews: no name on it, so the sheet's.
  const typed = find({ title: null, body: BOTTLE, name: null }, { sheetName: 'Test Reviewer Asha' });
  assert.deepEqual([typed.how, typed.review.id, typed.name.from], ['found', 'FK-1', 'sheet']);
  assert.equal(find({ ...shot, name: 'Flipkart Customer' }, { sheetName: 'Test Reviewer Asha' }).name.from, 'sheet', 'Flipkart Customer on the screenshot is no name');
  assert.equal(find({ ...shot, name: 'Asha' }).how, 'found', 'only the first name');
  // A short or common review is found only with the name.
  assert.deepEqual([find({ title: null, body: 'Good product', name: 'Test Reviewer Bina' }).how, find({ title: null, body: 'Good product', name: 'Test Reviewer Dev' }).how], ['found', 'notFound']);
});

test('never two, never on the name alone: two reviews under the name with these words pick none; a review under the name with other words is not found, and said; the words under another name, or under "Flipkart Customer", are their own results, never found, and only when distinctive words point at the review', () => {
  const twice = matchReview({ shot: { title: null, body: BOTTLE, name: 'Test Reviewer Asha' }, reviews: [...REVIEWS, kept('FK-5', 'Test Reviewer Asha', BOTTLE, { page: 3 })], day: null });
  assert.deepEqual([twice.how, twice.count], ['several', 2]);
  const nameOnly = find({ title: null, body: 'Bottle colour faded after washing twice in warm water.', name: 'Test Reviewer Chand' });
  assert.deepEqual([nameOnly.how, nameOnly.review, nameOnly.nameOnly], ['notFound', null, 1]);
  const other = find({ title: null, body: LUNCH, name: 'Test Reviewer Dev' });
  assert.deepEqual([other.how, other.review.id, other.count], ['otherName', 'FK-4', 1]);
  const noName = find({ title: 'Okay', body: DENTED, name: 'Test Reviewer Dev' });
  assert.deepEqual([noName.how, noName.review.id], ['noName', 'FK-3']);
  const nobody = find({ title: null, body: LUNCH, name: null });
  assert.deepEqual([nobody.how, nobody.review.id, nobody.name], ['noNameToCheck', 'FK-4', { name: null, from: null }]);
  assert.equal(find({ title: 'Wonderful', body: '', name: 'Test Reviewer Dev' }).how, 'notFound', 'one common word points at nothing');
  assert.deepEqual(find({ title: '', body: '', name: 'Test Reviewer Asha' }).how, 'noWords');
});

test('only reviews that can be posted on or after the day count: one with these words under the name posted before it does not, and is said; a review whose date was not read counts; with no day, every review counts', () => {
  const shot = { title: null, body: BOTTLE, name: 'Test Reviewer Asha' };
  const early = find(shot, { day: '2026-10-08' });
  assert.deepEqual([early.how, early.before, early.counted], ['notFound', 1, 0]);
  // "1 month ago": the plain reading and the last day it can mean; the last counts.
  const month = [kept('FK-6', 'Test Reviewer Asha', BOTTLE, { date: '2026-09-12', latest: '2026-09-27', said: '1 month ago', page: 9 })];
  assert.equal(matchReview({ shot, reviews: month, day: '2026-09-20' }).how, 'found');
  assert.equal(matchReview({ shot, reviews: [kept('FK-7', 'Test Reviewer Asha', BOTTLE, { date: null, latest: null, said: 'recently' })], day: '2026-10-08' }).how, 'found');
  assert.equal(find(shot, { day: null }).how, 'found');
});
