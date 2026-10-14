// Every review of a campaign's product posted since the campaign's start
// date, kept on this computer (data/flipkart/reviews/<product ID>-kept.json,
// store.js) with the last day it was seen on Flipkart. Flipkart shows only a
// product's newest reviews (150 at most), so a review read once is not lost
// when newer ones push it out of them: each reading (reviews.js) adds the
// reviews it read that can be posted on or after the start date, and gives
// the ones it saw again the day it saw them; step 7 (check.js) searches
// today's reading and these together. A review kept from an earlier reading
// counts only when today's reading does not reach back to its day; when it
// does, and the review is not there, it may have been removed from Flipkart.
// A campaign with no start date keeps none (routes.js). Pure: nothing here
// opens a page or reads a file.

import { indiaDay, plainText } from './review-page.js';

/** The most reviews kept for one product: the newest are kept. */
export const MAX_KEPT_REVIEWS = 3000;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v) => DAY.test(String(v ?? ''));
const norm = (t) => plainText(String(t ?? '')).toLowerCase().replace(/\s+/g, ' ').trim();
/** A review's name, stars, title and words: what tells it from the others when it has no ID. */
const wordsKey = (r) => [norm(r?.name), Number.isInteger(r?.stars) ? r.stars : '', norm(r?.title), norm(r?.text)].join('|');

/** True when two reviews are the same review: the same ID, or, when one has none, the same name, stars, title and words. */
export function sameReview(a, b) {
  if (a?.id && b?.id) return a.id === b.id;
  return wordsKey(a) === wordsKey(b);
}

/** The reviews kept from earlier readings that a reading does not show (sameReview), each marked kept, for step 7 to search with the reading's own. */
export function keptNotRead(reading, kept) {
  const list = Array.isArray(reading?.reviews) ? reading.reviews : [];
  const ids = new Set(list.map((r) => r.id).filter(Boolean));
  const all = new Set(list.map(wordsKey));
  const noId = new Set(list.filter((r) => !r.id).map(wordsKey));
  return (Array.isArray(kept) ? kept : []).filter((k) => (k.id ? !ids.has(k.id) && !noId.has(wordsKey(k)) : !all.has(wordsKey(k)))).map((k) => ({ ...k, kept: true }));
}

/** A review as it is kept: what Flipkart showed, without its place in one reading's list. */
const keptOf = (r) => ({ id: r.id ?? null, name: r.name ?? null, stars: r.stars ?? null, title: r.title ?? null, text: r.text ?? null, dateSaid: r.dateSaid ?? null, date: r.date ?? null, dateLatest: r.dateLatest ?? null, city: r.city ?? null, certified: r.certified ?? null, reviewFor: r.reviewFor ?? null, link: r.link ?? null });

/** The days a review can be posted on, of two readings of it: the narrower ("12 days ago" over "1 month ago"); the newer one's when as narrow. */
function closer(was, now) {
  const width = (r) => (isDay(r.date) && isDay(r.dateLatest) ? Date.parse(r.dateLatest) - Date.parse(r.date) : Infinity);
  const pick = width(was) < width(now) ? was : now;
  return { dateSaid: pick.dateSaid, date: pick.date, dateLatest: pick.dateLatest };
}

/**
 * A reading of a product's reviews (reviews.js readReviews' answer) added to
 * the reviews kept before for the same product: kept — { pid, start,
 * updatedAt, reviews: [{ id, name, stars, title, text, dateSaid, date,
 * dateLatest, city, certified, reviewFor, link, lastSeen }] }, or null. Only
 * reviews that can be posted on or after start (YYYY-MM-DD) are kept; one kept
 * before that cannot (the start date was changed) goes. A review read before
 * gets the reading's day as the last day it was seen, and its words as
 * Flipkart shows them now; but not one the reading only carried over from an
 * earlier reading it went on from, which was not seen again. At most
 * MAX_KEPT_REVIEWS, the newest. -> { kept, changed (false when nothing
 * changed: nothing need be written) }.
 */
export function keepReviews(kept, reading, { start, now = new Date() } = {}) {
  const may = (r) => isDay(r?.dateLatest) && r.dateLatest >= start;
  const before = Array.isArray(kept?.reviews) ? kept.reviews : [];
  const out = before.filter(may).map((r) => ({ ...r }));
  let changed = out.length !== before.length || kept?.start !== start;
  const day = indiaDay(new Date(Date.parse(reading?.readAt ?? '') || now.getTime()));
  const wentOn = Number.isInteger(reading?.wentOn) ? reading.wentOn : null;
  // The reviews kept, found by their ID; one with no ID by its words, which a review with an ID matches only when the kept one has none.
  const byId = new Map();
  const byWords = new Map();
  const noId = new Map();
  const index = (r, i) => {
    const w = wordsKey(r);
    if (r.id) byId.set(r.id, i);
    else noId.set(w, i);
    if (!byWords.has(w)) byWords.set(w, i);
  };
  out.forEach(index);
  const find = (r) => (r.id ? byId.get(r.id) ?? noId.get(wordsKey(r)) : byWords.get(wordsKey(r))) ?? -1;
  for (const r of Array.isArray(reading?.reviews) ? reading.reviews : []) {
    if (!may(r)) continue;
    const fresh = keptOf(r);
    const i = find(r);
    if (i < 0) {
      out.push({ ...fresh, lastSeen: day });
      index(fresh, out.length - 1);
      changed = true;
      continue;
    }
    // Carried over from the reading this one went on from: not seen again today.
    const seen = !wentOn || !(r.page < wentOn);
    if (!seen || String(out[i].lastSeen ?? '') >= day) continue;
    const id = out[i].id ?? fresh.id;
    if (id && !out[i].id) {
      noId.delete(wordsKey(out[i]));
      byId.set(id, i);
    }
    out[i] = { ...fresh, ...closer(out[i], fresh), id, link: fresh.link ?? out[i].link, lastSeen: day };
    changed = true;
  }
  const newest = out.length > MAX_KEPT_REVIEWS ? [...out].sort((a, b) => String(b.dateLatest).localeCompare(String(a.dateLatest))).slice(0, MAX_KEPT_REVIEWS) : out;
  if (newest !== out) changed = true;
  return { kept: { pid: reading?.pid ?? kept?.pid ?? null, start, updatedAt: changed ? now.toISOString() : kept?.updatedAt ?? now.toISOString(), reviews: newest }, changed };
}

/**
 * How far back a reading of a product's reviews shows every review still on
 * Flipkart: Flipkart lists them newest first, so a review posted after the
 * last one read comes before it in the list. -> a day (YYYY-MM-DD): a review
 * that surely came after it would be among the reviews read; '0000-01-01'
 * when the reading shows all of Flipkart's reviews (its last page, and no
 * fewer than Flipkart counts); null when no review with a date was read.
 */
export function reachOf(reading) {
  const list = Array.isArray(reading?.reviews) ? reading.reviews : [];
  if (reading?.end === 'last page' && Number.isInteger(reading.total) && reading.total <= list.length) return '0000-01-01';
  return [...list].reverse().find((r) => isDay(r?.dateLatest))?.dateLatest ?? null;
}

/** True when a reading that reaches back to reach (reachOf) would show this review if it were still on Flipkart: it was surely posted after that day. */
export const reaches = (reach, r) => Boolean(reach && isDay(r?.date) && r.date > reach);
