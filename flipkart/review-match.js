// Step 7's search (check.js): the review on the review screenshot among
// Flipkart's public reviews of the product, once they are read (reviews.js).
// As the Amazon checker's step 9 compares a review sent as a picture with the
// reviews it finds (amazon/check.js), its words and its name must both match:
// the screenshot's words (its title and words; small reading mistakes allowed,
// and a text cut short with "READ MORE" or "…" counts only as far as it goes)
// must be in the review, and the review must be under the name on the review
// screenshot, else the reviewer's name in the sheet (review-read.js
// nameFits). Only reviews posted on or after a day count (the day the order
// was delivered, else placed). One review that fits is found; two or more,
// and none is picked. A review is never picked on its name alone. Words that
// match a review under another name, or one Flipkart shows as "Flipkart
// Customer", are said as such and never count as found; for that, the words
// alone must point at the review: enough distinctive words (text.js
// rareWords), never a short or common review. Pure: nothing here opens a page
// or reads a file.

import { wordsOf, overlapScore, rareWords } from './text.js';
import { nameFits } from './review-read.js';

/** The share of the screenshot's words that must be in a review: most of them, small reading mistakes allowed. */
export const WORDS_SHARE = 0.8;
/** The distinctive words the screenshot must have for its words alone to point at one review, and the share of them that must be in it. */
export const RARE_WORDS_NEEDED = 2;
export const RARE_SHARE = 0.75;

/** Flipkart's words for a reviewer it shows no name for. */
const NO_NAME = /^\W*flipkart\s+customer\W*$/i;
const CUT = /(?:\.{2,}|…)\s*$/;
const READ_MORE = /\s*\bread\s+more\W*$/i;

/** True when Flipkart shows no name for a review: "Flipkart Customer", or none at all. */
export const noNameShown = (name) => !String(name ?? '').trim() || NO_NAME.test(String(name));

/**
 * The words on a review screenshot to search with: its title and words. A
 * text cut short ("… READ MORE", "...") loses its last word, which may be cut
 * in the middle.
 */
export function shotWords(v) {
  let body = String(v?.body ?? '').replace(READ_MORE, '').trim();
  if (CUT.test(body)) body = body.replace(CUT, '').replace(/\s*\S+$/, '');
  return [v?.title, body].filter((t) => String(t ?? '').trim()).join('\n');
}

/**
 * The review on a review screenshot among Flipkart's reviews. shot — what step
 * 6 read ({ title, body, name }); sheetName — the reviewer named in the sheet;
 * reviews — Flipkart's reviews as read (reviews.js: { id, name, stars, title,
 * text, dateSaid, date, dateLatest, page }); day — YYYY-MM-DD: only reviews
 * that can be posted on or after it count (a review whose date was not read
 * counts); null: every review counts; avoid — words that never count as
 * distinctive (the product's name).
 * -> { how, review, count, name: { name, from ('screenshot', 'sheet' or
 * null) }, counted (how many reviews count by their date), nameOnly (how many
 * of those are under the name with other words), before (how many under the
 * name with these words were posted before the day), share and rareShare (how
 * much of the screenshot's words, and of its distinctive words, the review has),
 * rare (how many distinctive words the screenshot has) }. how: 'found' (one
 * review under the name with these words), 'several' (two or more: none is
 * picked), 'otherName' (the words point at a review under another name),
 * 'noName' (at a review Flipkart shows no name for), 'noNameToCheck' (at a
 * review, but there is no name to check it with), 'notFound', or 'noWords'
 * (the screenshot has no words to search with).
 */
export function matchReview({ shot, sheetName = null, reviews = [], day = null, avoid = [] } = {}) {
  const shown = String(shot?.name ?? '').trim();
  const name = shown && !noNameShown(shown) ? { name: shown, from: 'screenshot' } : String(sheetName ?? '').trim() ? { name: String(sheetName).trim(), from: 'sheet' } : { name: null, from: null };
  const text = shotWords(shot);
  const base = { how: 'noWords', review: null, count: 0, name, counted: 0, nameOnly: 0, before: 0, share: null, rareShare: null, rare: 0 };
  if (!wordsOf(text).length) return base;
  const rare = rareWords(text, [...avoid, name.name ?? '']);
  const all = (Array.isArray(reviews) ? reviews : []).map((r) => {
    const theirs = [r?.title, r?.text].filter(Boolean).join('\n');
    const share = overlapScore(text, theirs) ?? 0;
    const rareShare = rare.length ? overlapScore(rare.join(' '), theirs) ?? 0 : 0;
    const words = share >= WORDS_SHARE;
    return { r, share, rareShare, words, strong: words && rare.length >= RARE_WORDS_NEEDED && rareShare >= RARE_SHARE, fits: Boolean(name.name) && nameFits(name.name, r?.name), counts: !day || !r?.dateLatest || r.dateLatest >= day };
  });
  const counted = all.filter((x) => x.counts);
  const best = (list) => [...list].sort((a, b) => b.share - a.share || b.rareShare - a.rareShare)[0] ?? null;
  const out = (how, list) => {
    const top = best(list);
    return { ...base, how, review: top?.r ?? null, count: list.length, counted: counted.length, share: top?.share ?? null, rareShare: top?.rareShare ?? null, rare: rare.length };
  };
  const found = counted.filter((x) => x.words && x.fits);
  if (found.length === 1) return out('found', found);
  if (found.length > 1) return out('several', found);
  const pointed = counted.filter((x) => x.strong);
  if (pointed.length) {
    if (!name.name) return out('noNameToCheck', pointed);
    const named = pointed.filter((x) => !noNameShown(x.r?.name));
    return out(named.length ? 'otherName' : 'noName', named.length ? named : pointed);
  }
  const top = best(counted);
  return { ...base, how: 'notFound', counted: counted.length, nameOnly: counted.filter((x) => x.fits && !x.words).length, before: all.filter((x) => !x.counts && x.words && x.fits).length, share: top?.share ?? null, rareShare: top?.rareShare ?? null, rare: rare.length };
}
