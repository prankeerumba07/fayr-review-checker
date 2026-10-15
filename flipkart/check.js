// A Flipkart row's check, in steps a person can watch, the way the Amazon
// checker checks a row (amazon/check.js), copied and changed for Flipkart.
// Its steps are the Amazon check's, in the same order, changed to the Flipkart
// way of checking (FLIPKART-PLAN.md point 8): duplicates first, as on Amazon
// (the same order ID, the same screenshot or review link, or the same picture
// as another row of the file: of the rows that share one, only the first in
// the file's order is checked, and the later ones are Duplicate, a Fail; the
// same picture is the same file, or one that looks the same and reads the
// same, found again once each screenshot is read; and the review found on
// Flipkart that another row's check found too is the same review), then the
// purchase screenshot, the
// delivery screenshot, the review screenshot (the main proof on Flipkart,
// where many rows have no review link), finding the review among Flipkart's
// public reviews, comparing the reviewer's name and the review's words, and
// the Status, Type and Note. The steps that get the screenshots
// (screenshots.js) download each one's pictures, or keep the reason they
// could not be had, said in the Amazon checker's words; step 3 reads the
// purchase screenshot on this computer (shot-read.js) and compares it with
// the sheet, as the Amazon checker's step 3 does: the order ID, the order date
// (only when the file has that column), the amount and the product are each
// the same, different or not shown; step 5 reads the delivery screenshot the
// same way, as the Amazon checker's step 5 does: it must say Delivered, and
// when the two screenshots show different order IDs, it says both
// (FLIPKART-PLAN.md point 6); step 7 reads the review screenshot
// (review-read.js), as the Amazon checker's step 7 reads one: the rating, the
// review's title and words, the reviewer's name and the date, or Flipkart's
// message that the review was not accepted or that only a rating was given;
// of several reviews, only the user's; step 8 finds the review among
// Flipkart's public reviews: the campaign product's own page on Flipkart,
// then "See all reviews", newest first, read once in a checking run and kept
// on this computer for every row (routes.js, reviews.js), back to the
// campaign's start date when it has one, searched for the review screenshot's
// words and name, from the day a review can be the user's (the delivery day,
// else the order day), together with the reviews since the start date kept
// from earlier readings (kept-reviews.js; one of those counts only when
// today's reading does not reach back to its day, and when it does and the
// review is not there, it may have been removed); step 9 compares the review
// found with the review screenshot, as the Amazon checker compares a review
// with its screenshot and with the Reviewer Name column: the name, the words,
// the stars and the day it was posted; and step 10 gives the row its Status
// (Pass, Fail or Needs Manual Staff Checking), its Type and its Note, with
// the Amazon checker's words and rules (final.js): the screenshots' problems
// first, in the Amazon order, then the review's; but the review, or the order
// on its screenshots, before the campaign's start date is Possible misuse,
// for a staff member, unless a problem fails the row (a review screenshot
// that clearly shows a full date before it counts too, when the review is not
// found on Flipkart). It passes only when both
// screenshots match the sheet and the review is live on Flipkart under the
// user's name with the review screenshot's words, posted on or after the
// delivery day, or, as on Amazon, when the review screenshot shows a star
// rating only; a review that is not found, or cannot be told to be the
// user's, is for a staff member, never a Fail. The product is compared by its
// name with the products of the live campaigns the row uses, by their real
// names read from Flipkart, or, with no live campaign, with its product name
// in the sheet. A detail that is not shown, or could not be read, is never
// called different and never passes; but the amount shown on neither
// screenshot is only not compared, and the Note says so. Every step runs,
// even after a problem; then the comparison table puts the sheet and the two
// screenshots side by side. No one logged in to Google, a login using the
// Live Amazon Browser, Google's login page, Flipkart stopping the reading of
// its reviews (a robot check, a refused page, an error page, a page too slow)
// before the review was found, or the Live Flipkart Browser closed, offline
// or led to another website pauses the check, as on Amazon: the row gets no
// result, nothing is got around, and the row can be checked again later, the
// reading going on from where it stopped.

import { randomBytes } from 'node:crypto';
import { downloadable } from './screenshots.js';
import { readOrderShot, readDeliveryShot } from './shot-read.js';
import { NOT_DELIVERED_WORDS, parseDelivery } from './delivery-read.js';
import { readReviewShot, nameFits } from './review-read.js';
import { matchReview, shotWords } from './review-match.js';
import { reachOf, reaches, keptNotRead } from './kept-reviews.js';
import { indiaDay, plainText, dateFromWords } from './review-page.js';
import { linkLabel, isShortLink, reviewPageLink, linkKey, reviewIdFrom } from './links.js';
import { PICTURE_CELLS, before, firstOf, rowName, rowsNamed, samePictures, lookAlikes } from './duplicates.js';
import { hasResult } from './store.js';
import { DEFAULT_MARKS } from './settings.js';
import { shortName } from './campaigns.js';
import { wordsOf, productWords, overlapScore } from './text.js';
import { FINAL_WORDS, TYPE_FINAL, typeWord, finalSentence, lowerFirst, oneDigitOff, dateOneDigitOff, amountOneDigitOff } from './final.js';
import { sameDay, amountMatch, totalRead, totalShown, priceDetailsShown, partialOrderId, rupees, productShown, holdsWord, dayFirst, nameStartShown, enoughOfName, nameLineStarting, brandWordsAtStart, nameCouldBe, datesOnce, nameAsShown, productNames, sameStart } from './screen-text.js';

export const STEP_NAMES = [
  'Duplicates and links in the sheet',
  'Opening the purchase screenshot',
  'Reading the purchase screenshot and comparing it with the sheet',
  'Opening the delivery screenshot',
  'Reading the delivery screenshot and comparing it',
  'Opening the review screenshot',
  "Reading the reviewer's name and the review's words",
  "Finding the review among Flipkart's public reviews",
  "Comparing the reviewer's name and the review's words",
  'Status, Type and Note',
];
/** The steps that open a screenshot, with its cell, and the steps that read one; step 1 is the duplicates', and steps 7 to 10 are the review's and the Status's own. */
const OPENS = { 2: 'order', 4: 'delivery', 6: 'reviewShot' };
const READS = { 3: 'order', 5: 'delivery' };
/** What each step was doing, for "Something went wrong on this computer while …". */
const STEP_DOING = ['looking for duplicates and links in the sheet', 'opening the purchase screenshot', 'reading the purchase screenshot', 'opening the delivery screenshot', 'reading the delivery screenshot', 'opening the review screenshot', 'reading the review screenshot', "finding the review among Flipkart's public reviews", "comparing the reviewer's name and the review's words", 'writing the Status, Type and Note'];
/** The Amazon checker's words for a check paused by a download (amazon/check.js): the screenshots on Google Drive are downloaded through the same Google login. */
export const PAUSE_SAYS = {
  'google-out': 'No one is logged in to Google, so the screenshots on Google Drive cannot be downloaded. Press "Log in to Google" in the top bar and log in there, then press "Carry on checking".',
  'google-signin': 'Google asked to log in, so the screenshots on Google Drive cannot be downloaded. Press "Log in to Google" in the top bar and log in there, then press "Carry on checking".',
  'google-robot': 'Google showed a robot check while a screenshot was being downloaded. This dashboard never answers a robot check. Press "Carry on checking" when you are ready.',
  'google-blocked': 'Google Drive refused to give a screenshot just now. Wait a while, then press "Carry on checking".',
  // While Flipkart's reviews are read in the Live Flipkart Browser (step 8), as the Amazon checker pauses for Amazon's pages.
  'flipkart-captcha': 'Flipkart showed a robot check. This dashboard never answers a robot check. Press "Carry on checking" when you are ready.',
  'flipkart-blocked': 'Flipkart refused a page. Wait a while, then press "Carry on checking".',
  'flipkart-error': 'Flipkart showed an error page. Wait a while, then press "Carry on checking".',
  'flipkart-slow': 'Flipkart is very slow to show its pages just now. Wait a while, then press "Carry on checking".',
  'flipkart-closed': 'The Live Flipkart Browser was closed or could not be opened. Press "Carry on checking" to open it again.',
  'flipkart-network': 'The Live Flipkart Browser could not open a Flipkart page. Check that this computer is online, then press "Carry on checking".',
  'flipkart-elsewhere': 'A Flipkart page tried to go to another website, which this dashboard never opens. Press "Carry on checking" to try again.',
};
/** The pause for each way a reading of Flipkart's reviews can stop part way (reviews.js). */
const READING_PAUSES = { slow: 'flipkart-slow', closed: 'flipkart-closed', network: 'flipkart-network', elsewhere: 'flipkart-elsewhere' };
const WHAT = { order: 'purchase screenshot', delivery: 'delivery screenshot', review: 'review screenshot', reviewShot: 'review screenshot' };
/** Each cell, as a duplicate's Note names the ones missing. */
const CELL_WORDS = { order: 'purchase screenshot', delivery: 'delivery screenshot', review: 'review link', reviewShot: 'review screenshot' };
/** Each cell's column, as the file's columns are named (workbook.js). */
const SHOT_COLUMN = { order: 'orderShot', delivery: 'deliveryShot', review: 'reviewLink', reviewShot: 'reviewShot' };
/** The two screenshots compared with the sheet. */
const SHOTS = ['order', 'delivery'];
/**
 * When the screenshots have several problems, the Type is the first one in
 * this order, as on Amazon: a different order ID, a different product, not
 * delivered, a screenshot that is missing or cannot be opened, a different
 * order date or amount, then a detail that is not shown (that screenshot "not
 * clear").
 */
const RANK = { orderId: 1, product: 2, delivered: 3, open: 4, details: 5, shown: 6 };
/** A sentence of the Note when both screenshots passed but the review did not, in the Amazon checker's words. */
const SHOTS_MATCH = 'The purchase screenshot and the delivery screenshot match the form.';
/** What a link in the review link cell opens when it is not one review, in the Amazon checker's words for the same pages. */
const NOT_A_REVIEW = { 'Flipkart product page': 'a product page on Flipkart', "Flipkart product's reviews": "a product's list of reviews on Flipkart", 'App store': "an app store's page" };

// Copied from the Amazon checker's Notes (amazon/notes.js): words from the sheet are quoted, and never carry a word this dashboard must not show.
const HIDDEN = ['ZmF5cg==', 'cmVmdW5k', 'Y2FzaGJhY2s=', 'cmV3YXJk'].map((b) => Buffer.from(b, 'base64').toString('utf8'));
const HIDDEN_RE = new RegExp(`[\\p{L}\\p{N}]*(?:${HIDDEN.join('|')})[\\p{L}\\p{N}]*`, 'giu');
export const clean = (text) => String(text ?? '').replace(HIDDEN_RE, '…');
function excerpt(text, n = 160) {
  const t = clean(String(text ?? '').replace(/\s+/g, ' ').trim());
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}
const oneSentence = (text) => String(text ?? '').replace(/([.!?])+\s+(?=\S)/g, '; ');
const quoted = (text, n) => `"${oneSentence(excerpt(text, n))}"`;
/** "a", "a and b", "a, b and c". */
function joinAnd(list) {
  const l = list.filter(Boolean);
  if (l.length <= 1) return l[0] ?? '';
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
}
/** A Note from its sentences, in one paragraph, each ending with a full stop, cleaned. */
function noteOf(sentences) {
  return clean(
    sentences
      .filter(Boolean)
      .map((t) => {
        const x = String(t).replace(/\s+/g, ' ').trim();
        return /[.!?]$/.test(x) ? x : `${x}.`;
      })
      .join(' '),
  );
}

// ---- reading the purchase screenshot (copied from amazon/check.js, its step 3, and changed for Flipkart) ----

/** The four details compared on the purchase screenshot, and what a step's line calls them. */
const DETAILS = ['orderId', 'orderDate', 'amount', 'product'];
const NOUN = { orderId: 'order ID', orderDate: 'order date', amount: 'amount', product: 'product' };
const NOT_SHOWN = 'not shown';
/** A detail not compared, because the file has no column for it. */
const SKIP = 'skip';
/** How each state of a detail is said ("shown": the sheet has nothing to compare it with). */
const STATE_SAID = { same: 'the same', different: 'different', [NOT_SHOWN]: 'not shown', shown: 'not compared, because the sheet has none' };
const cap = (t) => String(t ?? '').charAt(0).toUpperCase() + String(t ?? '').slice(1);
/** A date read from a screenshot, day first: 20-07-2026, or 20-07 when it shows no year. */
const dateWords = (d) => (d?.day ? dayFirst(d.day) : d ? `${String(d.date).padStart(2, '0')}-${String(d.month).padStart(2, '0')}, with no year shown` : '');
/** What an amount on a screenshot is, in plain words: "the total amount", "the selling price", "the amount paid". */
const amountLabel = (l) => (!l ? '' : /mrp/i.test(l) ? 'the printed price' : /sub-?total/i.test(l) ? 'the subtotal' : l === 'paid' ? 'the amount paid' : `the ${String(l).toLowerCase()}`);
/** Amounts that can be the order's: never a fee, money taken off, Flipkart's listing price (the price before the discount) or a printed price, nor a number alone on a line (it counts only when it is the sheet's). */
const usableAmounts = (amounts) => (amounts ?? []).filter((a) => !a.skip && !a.lone && a.label !== 'mrp' && a.label !== 'listing price');
/** The amount to name when none is the sheet's: a total first, then a price, then a subtotal. */
function amountToName(list) {
  const rank = (l) => (!l ? 4 : /grand total|order total|total amount|amount paid|you paid/.test(l) ? 0 : /sub/.test(l) ? 3 : /total|paid/.test(l) ? 1 : /price/.test(l) ? 2 : 4);
  return [...list].sort((a, b) => rank(a.label) - rank(b.label))[0];
}
/** The dates on a screenshot that can be the order's: those marked as the order's; on the purchase screenshot, with none marked, any not about the delivery. */
function orderDates(which, dates) {
  const all = dates ?? [];
  const marked = all.filter((d) => d.labelled);
  if (which === 'delivery' || marked.length) return marked;
  return all.filter((d) => !d.delivery);
}
/** A day read from a screenshot as YYYY-MM-DD: its own year, else the most recent such day that is not after today (India's). */
function dayOf(d, today) {
  if (!d) return null;
  if (d.day) return d.day;
  const [y] = today.split('-').map(Number);
  for (let year = y; year >= y - 4; year--) {
    const t = new Date(Date.UTC(year, d.month - 1, d.date));
    const day = t.toISOString().slice(0, 10);
    if (t.getUTCMonth() === d.month - 1 && day <= today) return day;
  }
  return null;
}
/** A date as a check keeps it (dateWords): "17-08-2026", or "17-08, with no year shown". */
function keptDate(w) {
  const m = String(w ?? '').match(/^(\d{2})-(\d{2})(?:-(\d{4}))?/);
  return !m ? null : m[3] ? { day: `${m[3]}-${m[2]}-${m[1]}` } : { month: Number(m[2]), date: Number(m[1]) };
}
/**
 * From which day a review on Flipkart can be the user's, as a row's last
 * check found it: step 8's own day, else the day on the delivery screenshot's
 * Delivered line, else the earliest order day on the purchase screenshot (a
 * day with no year: the most recent such day by the time of the check). For
 * how far back Flipkart's reviews are read (routes.js). -> YYYY-MM-DD, or
 * null when the check found none.
 */
export function keptDay(check, now = new Date()) {
  if (!check) return null;
  if (check.reviewsFrom) return check.reviewsFrom.day ?? null;
  const today = indiaDay(new Date(Date.parse(check.finishedAt ?? '') || now.getTime()));
  const delivered = check.delivery?.deliveredText ? dayOf(parseDelivery([check.delivery.deliveredText]).deliveredOn, today) : null;
  return delivered ?? (check.order?.dates ?? []).map((w) => dayOf(keptDate(w), today)).filter(Boolean).sort()[0] ?? null;
}
/** A product's name cut short on the screen: "Test Brand Steel Bottle 1 L Bla...". */
const cutShort = (t) => /\.\.\.|…/.test(String(t ?? ''));

/** A check's id, as the Amazon checker makes them (amazon/store.js): when it started, and six letters and digits. */
export function newCheckId(date = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const stamp = `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`;
  return `c${stamp}${randomBytes(3).toString('hex')}`;
}

/**
 * A screenshot that could not be had, in the Amazon checker's words (the
 * sentence of pictureProblem in amazon/check.js). `says` follows "but".
 */
function problemLine(which, p) {
  const what = WHAT[which];
  if (p.kind === 'drive' || p.kind === 'busy') return `The ${what} is on Google Drive, but ${p.says}.`;
  if (p.kind === 'allowed') return `The ${what} is on ${p.site}, but ${p.says}.`;
  if (p.kind === 'sheet') return `The ${what} is a picture in the sheet, but ${p.says}.`;
  return `The ${what} is on ${p.site ?? 'a website'}, but ${p.says}.`;
}

/**
 * A cell's picture problem, in the Amazon checker's words and with its Types
 * (amazon/check.js pictureProblem): its Type, the sentence that says what
 * happened, the reason, and what to do next. `says` follows "but".
 */
function pictureProblem(which, p) {
  const what = WHAT[which];
  const notClear = `${which === 'reviewShot' ? 'review' : which}NotClear`;
  if (p.kind === 'drive') {
    // "Need Google Drive Access" only when Google said the logged-in account has no access to the file.
    if (p.noAccess || /no access to|could not find the file|asking for access/.test(p.says)) {
      return { type: 'needDriveAccess', line: `The ${what} is on Google Drive, but ${p.says}.`, because: 'the dashboard can only open a Drive file that the Google account logged in to it can open', then: 'Check that the file is shared with the Google account shown in the top bar, then check this row again.' };
    }
    if (/could not be reached|did not answer|was stopped|not downloaded yet|could not be opened/.test(p.says)) return { type: 'somethingElse', line: `The ${what} is on Google Drive, but ${p.says}.`, because: `the dashboard could not download the ${what} just now`, then: 'Check this row again later.' };
    return { type: notClear, line: `The ${what} is on Google Drive, but ${p.says}.`, because: `the dashboard could not read the ${what}`, then: 'Ask for the screenshot as a picture (PNG or JPG), then check this row again.' };
  }
  if (p.kind === 'file') return { type: notClear, line: `The ${what} is on ${p.site ?? 'a website'}, but ${p.says}.`, because: `the dashboard could not read the ${what}`, then: 'Ask for the screenshot as a picture (PNG or JPG), then check this row again.' };
  if (p.kind === 'allowed') return { type: 'needAccess', line: `The ${what} is on ${p.site}, but ${p.says}.`, because: 'the dashboard only opens pictures from the websites on its list', then: 'The website can be added to that list, then check this row again.' };
  if (p.kind === 'busy') return { type: 'somethingElse', line: `The ${what} is on Google Drive, but ${p.says}.`, because: `the dashboard could not download the ${what} just now`, then: 'Check this row again later.' };
  if (p.kind === 'sheet') return { type: notClear, line: `The ${what} is a picture in the sheet, but ${p.says}.`, because: `the dashboard could not read the ${what}`, then: 'Put a clearer picture in the sheet, then check this row again.' };
  return { type: 'needAccess', line: `The ${what} is on ${p.site ?? 'a website'}, but ${p.says}.`, because: `the dashboard could not open the ${what}`, then: 'Open it by hand, or ask for a working link, then check this row again.' };
}

/** The review screenshot's cell, the main proof on Flipkart; the review link's cell instead when only that one holds a picture. */
function reviewCell(row, had) {
  const shot = row.shots?.reviewShot ?? {};
  if (had.reviewShot && (shot.links?.length || shot.picture)) return 'reviewShot';
  const link = row.shots?.review ?? {};
  if (had.reviewLink && (link.picture || (link.links ?? []).some((l) => downloadable('review', l)))) return 'review';
  return 'reviewShot';
}

class Stopped extends Error {}
class Paused extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

/**
 * Run one row's check.
 *   row — the row as kept (store.js); others — every other row of the file, as kept, each with its last check (check), for the duplicates
 *   has — the columns the file has: { orderDate, amount, product, orderShot, deliveryShot, reviewShot, reviewLink }, each true unless false
 *   screenshots — screenshots.js: forCell(rowId, which, { signal })
 *   marks — Flipkart's passing marks (settings.js): { productNameShare, amountDifferenceRupees, feeAllowanceRupees }
 *   campaigns — the live campaigns the row uses (campaigns.js campaignsFor): { name, brand, startDate (YYYY-MM-DD, or null), products: [{ pid, name, short, variants }] }
 *   readOrder(files, { want }) — what the purchase screenshot says (shot-read.js readOrderShot)
 *   readDelivery(files, { want }) — what the delivery screenshot says (shot-read.js readDeliveryShot)
 *   readReview(files, { reviewer, productIs }) — what the review screenshot says (review-read.js readReviewShot)
 *   reviewer — the reviewer named in the sheet (null when the file has no Reviewer Name column, or the cell is empty), which finds the user's review among several on the review screenshot, and is compared with the name on Flipkart (step 8)
 *   reviews(pid, { rowId, day, start, onPage, signal }) — Flipkart's public reviews of a campaign's product, read once in a checking run and kept on this computer (routes.js, reviews.js readProductReviews); day is the oldest day this row needs; start is the day the product's campaign started (or null): the reviews are read back to it, and the answer carries the reviews since it kept from earlier readings (kept)
 *   emit(event) — started, action, step and done lines for the screen; a step's line carries what was read so far (partial)
 * -> the result: { checkId, rowId, n, name, startedAt, finishedAt, seconds, status, type, typeKey, note, final, finalSays, steps, sheet, order, delivery, review, reviewsFrom, flipkart, found, misuse, compared, shotsHad, comparison, alsoDuplicate, paused, stopped }; alsoDuplicate: the later rows this check found to share its order's screenshot or review, each { id, note, final, finalSays }, to be marked Duplicate (routes.js)
 */
export async function runCheck({ row, others = [], has = null, screenshots, marks = DEFAULT_MARKS, campaigns = [], readOrder = readOrderShot, readDelivery = readDeliveryShot, readReview = readReviewShot, reviewer = null, reviews = null, emit = () => {}, signal = null, checkId = newCheckId(), now = () => new Date() }) {
  const had = { orderDate: true, amount: true, product: true, orderShot: true, deliveryShot: true, reviewShot: true, reviewLink: true, ...Object.fromEntries(Object.entries(has ?? {}).map(([k, v]) => [k, v !== false])) };
  /** A detail with no column in the file is not compared at all. */
  const compared = DETAILS.filter((k) => k === 'orderId' || had[k]);
  const sheetId = row.orderId?.value ?? '';
  const sheetDay = row.orderDate?.value ?? null;
  const sheetAmount = Number.isFinite(row.amount?.value) ? row.amount.value : null;
  const label = row.product?.text ?? '';
  const began = Date.now();
  const result = {
    checkId,
    rowId: row.id,
    row: row.row ?? null,
    n: row.n ?? null,
    name: `Row ${row.n ?? '?'}`,
    startedAt: now().toISOString(),
    finishedAt: null,
    seconds: null,
    // Step 10: the Status (final: 'pass', 'fail' or 'manual'; status: its word), the Type (typeKey, and its words), the Note, and the Status's reason (finalSays, the Note's first sentence). None for a check that paused or was stopped.
    status: null,
    type: null,
    typeKey: null,
    note: null,
    final: null,
    finalSays: null,
    steps: STEP_NAMES.map((name, i) => ({ n: i + 1, name, state: 'waiting', detail: null })),
    // What the sheet says of the details compared, as it is written there, for the comparison table.
    sheet: { orderId: row.orderId?.text ?? '', orderDate: row.orderDate?.text ?? '', amount: row.amount?.text ?? '', product: label },
    // What each screenshot says, as read on this computer, with each detail compared (steps 3 and 5).
    order: null,
    delivery: null,
    // What the review screenshot says, as read on this computer (step 7).
    review: null,
    // From which day a review can be the user's, and Flipkart's reviews as read for this row (step 8).
    reviewsFrom: null,
    flipkart: null,
    found: null,
    // What came before the campaign's start date (step 10, misuseOf): { start, placed, delivered, posted }, or null.
    misuse: null,
    // What was compared, and the screenshots the file has: the comparison shows only those.
    compared,
    shotsHad: SHOTS.filter((w) => had[SHOT_COLUMN[w]]),
    // The sheet and the two screenshots side by side (buildComparison), once the check has finished.
    comparison: [],
    // The later rows found to share this row's screenshot or review once their pictures or reviews were known: Duplicate, each with its own Note.
    alsoDuplicate: [],
    paused: null,
    stopped: false,
  };
  const say = (says) => emit({ event: 'action', says });
  const checkStop = () => {
    if (signal?.aborted) throw new Stopped();
  };
  function start(n, action) {
    checkStop();
    const s = result.steps[n - 1];
    s.state = 'running';
    emit({ event: 'step', step: { ...s } });
    say(action ?? STEP_NAMES[n - 1]);
  }
  function finish(n, state, detail) {
    const s = result.steps[n - 1];
    s.state = state;
    s.detail = detail ? clean(detail) : null;
    // What was read so far for the row's page; what step 8 read and found once it has.
    emit({ event: 'step', step: { ...s }, partial: { order: result.order, delivery: result.delivery, review: result.review, ...(result.flipkart ? { flipkart: result.flipkart } : {}), ...(result.found ? { found: result.found } : {}) } });
  }
  /** A step that cannot run in this check (step 8 with no way to read Flipkart's reviews): it says it comes in a later step. */
  function later(n) {
    checkStop();
    finish(n, 'later', null);
  }
  /** Pauses the check at step n: the row gets no result, and it can be checked again. */
  function pauseAt(n, kind, says, detail) {
    result.paused = { kind, says, step: n };
    finish(n, 'fail', detail);
    throw new Paused(kind);
  }
  /** Something that went wrong on this computer at a step: { n, says, then }, for a staff member. */
  let trouble = null;
  async function step(n, fn) {
    try {
      await fn();
    } catch (err) {
      if (err instanceof Stopped || err instanceof Paused) throw err;
      const says = `Something went wrong on this computer while ${STEP_DOING[n - 1]}.`;
      trouble ??= { n, says, then: 'Check this row again.' };
      finish(n, 'fail', `${says} Check this row again.`);
    }
  }

  /**
   * Each screenshot's cell as its steps left it, as on Amazon: 'no column',
   * 'missing' (with the cell's words), 'words' (a delivery cell saying the
   * order was not delivered), 'unopened' (with its picture problem),
   * 'opened' (with its pictures), then, once read, 'unreadable' or 'read'
   * (with what each detail is, and whether it says Delivered).
   */
  const shot = {};
  /** What each screenshot read, as the reader gave it, for a detail one digit away from the sheet's (a possible reading mistake). */
  const reads = {};
  /** Sentences near the end of the Note that are not a Type: a screenshot of several that could not be opened. */
  const warnings = [];
  /** The days steps 3 and 5 read: { order: the purchase screenshot's dates that can be the order's, delivery: the Delivered line's date }. */
  const daysRead = {};
  /** A cell's pictures, downloading again any that could not be had; a download that cannot be made just now pauses the check here. */
  async function fetchCell(n, which) {
    const g = await screenshots.forCell(row.id, which, { signal });
    checkStop();
    if (g?.pause) {
      const says = g.says ?? PAUSE_SAYS[g.pause] ?? 'The screenshot could not be downloaded just now.';
      pauseAt(n, g.pause, says, `${says.split('. ')[0].replace(/\.$/, '')}. The check paused here, before the ${WHAT[which]} was downloaded; nothing was got around.`);
    }
    // The cell's pictures as they are now, so a picture just downloaded is compared with other rows' too.
    if (Array.isArray(g?.records)) current.pictures[which] = g.records;
    return g;
  }

  // ---- duplicates (copied from the Amazon checker, amazon/check.js, and changed for Flipkart) ----

  /** The duplicate this check found: { line (what this row shares, and which row is the one checked), why (for the step's line), step }; null when none. */
  let duplicate = null;
  /** This row's pictures as they are now: a picture downloaded during the check replaces the one kept before. */
  const current = { ...row, pictures: Object.fromEntries(PICTURE_CELLS.map((w) => [w, [...(row.pictures?.[w] ?? [])]])) };
  /** Sentences that end the Note of the first row: the later rows that share something with it. */
  const afterWhy = new Set();
  const isReview = (which) => which === 'review' || which === 'reviewShot';
  /** True when one of these rows is nearer the top of the file than this one, so this row is the later one: a duplicate. */
  const isLater = (group) => group.some((o) => before(o, row));
  /** A duplicate's first sentence: "This transaction failed because it is a duplicate: …". */
  const duplicateSays = (line) => finalSentence('fail', `it is a duplicate: ${lowerFirst(line)}`);
  /** Another row this check makes Duplicate, with its own Note, which says which row is the one checked. */
  const alsoDuplicate = (o, line) => {
    if (!result.alsoDuplicate.some((d) => d.id === o.id)) result.alsoDuplicate.push({ id: o.id, note: noteOf([duplicateSays(line)]), final: 'fail', finalSays: clean(duplicateSays(line)) });
  };
  /** "which was already checked" (it has a result: its check, or a Status the uploaded file gives it, which "Start checking" passes by), or "and row 2 is the one that will be checked". */
  const firstSaid = (first) => (hasResult(first) ? 'which was already checked' : `and ${rowName(first)} is the one that will be checked`);
  /** The sentences that end the first row's Note: which later rows share it, and that they were not checked. */
  const laterSaid = (what, rows) => afterWhy.add(`The same ${what} is also in ${rowsNamed(rows)}. ${rows.length === 1 ? 'That row is a duplicate and was' : 'Those rows are duplicates and were'} not checked.`);
  /** Stops the check as Duplicate, as on Amazon: the line that says what this row shares and which row is the one checked, and why that makes it a duplicate (the step's line). */
  function dup(n, line, why) {
    duplicate = { line: clean(line), why, step: n };
    finish(n, 'fail', `${cap(why)}.`);
    return true;
  }
  /** What another row's last check read from one of its cells, to tell the same picture from one that only looks the same: { orderIds, text }, and a review's own title and words (body); null when nothing, or no review's own words, was read. */
  function seenOf(o, which) {
    const c = o?.check;
    if (!c) return null;
    if (!isReview(which)) return c[which]?.ok && c[which].text ? { orderIds: c[which].orderIds ?? [], text: c[which].text } : null;
    return c.review?.ok && (c.review.title || c.review.body) && which === reviewCell(o, had) ? { orderIds: [], text: c.review.text ?? '', title: c.review.title ?? '', body: c.review.body ?? '' } : null;
  }
  /** True when a row's review picture showed Flipkart's message that the review was not accepted (what its check read, or the Type it gave). */
  const refusalShown = (o, which) => o?.check?.typeKey === 'cannotAddReviews' || (o?.check?.review?.kind === 'refused' && which === reviewCell(o, had));
  /**
   * Of the rows whose picture is this cell's, those that are not the same
   * thing after all (read: what this cell's picture says), as on Amazon:
   * Flipkart's message that a review was not accepted, sent for two orders of
   * one account, is the same message, not the same review; and a row is never
   * the duplicate of a screenshot that shows its own order and not the other
   * row's: it is that row's screenshot, and the row nearer the top that gave
   * it for another order is told so by its own check (a different order ID).
   */
  function notSame(which, hits, read) {
    if (isReview(which)) {
      if (refusalShown(row, which) || read?.refused) return [];
      return hits.filter((h) => !refusalShown(h.o, h.which));
    }
    if (!sheetId || !read) return hits;
    const ids = read.orderIds ?? [];
    const mine = ids.includes(sheetId);
    return hits.filter((h) => {
      const theirs = ids.includes(h.o.orderId?.value ?? '');
      // A row nearer the top: this row is not its duplicate when the picture shows this row's order and not that row's.
      if (before(h.o, row)) return !(mine && !theirs);
      // A later row: it is not made a duplicate when the picture shows its order and not this row's.
      return !(theirs && !mine);
    });
  }
  /** What a cell's picture says, for comparing it with another row's: its order IDs (none on a review) and all its words; on a review, also the review's own title and words (body), the only ones that count (duplicates.js sameReviewWords). */
  const wordsRead = (which, r) => ({ orderIds: isReview(which) ? [] : r.orderIds ?? [], text: clean(r.text ?? ''), ...(isReview(which) ? { refused: r.kind === 'refused', title: clean(r.title ?? ''), body: clean(r.body ?? '') } : {}) });
  /** This row shares a picture with rows nearer the top, so it is the later one: Duplicate of the first. */
  function samePictureStop(n, which, hits) {
    const first = firstOf(hits.map((x) => x.o).filter((o) => before(o, row)));
    const h = hits.find((x) => x.o === first) ?? hits[0];
    return dup(n, `The ${WHAT[which]} in this row is the same picture as the ${WHAT[h.which]} in ${rowName(h.o)}, ${firstSaid(h.o)}.`, `two different orders cannot share one screenshot, so this row is a duplicate and was not checked${hasResult(h.o) ? ' again' : ''}`);
  }
  /** The later rows that share this row's picture: this row is the first, so they are Duplicate. */
  function markLater(hits, which) {
    for (const h of hits) alsoDuplicate(h.o, `The ${WHAT[h.which]} in this row is the same picture as the ${WHAT[which]} in ${rowName(row)}, which is the one checked.`);
    laterSaid(WHAT[which], hits.map((h) => h.o));
  }
  /** Once a cell's pictures are read: another row's picture that is the same file, or looks the same and reads the same, is the same picture. -> true when this row is the later one (a duplicate). */
  function samePictureAfterReading(n, which, read) {
    const hits = notSame(which, samePictures(current, others, { which, read }, seenOf)[which], read);
    if (!hits.length) return false;
    if (!isLater(hits.map((h) => h.o))) {
      markLater(hits, which);
      return false;
    }
    return samePictureStop(n, which, hits);
  }
  /** Two reviews found on Flipkart with no ID that show the same name, stars, title and start of their words. */
  const sameFound = (a, b) => {
    const norm = (t) => String(t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    return Boolean(norm(a?.text) || norm(a?.title)) && norm(a?.name) === norm(b?.name) && (a?.stars ?? null) === (b?.stars ?? null) && norm(a?.title) === norm(b?.title) && norm(a?.text).slice(0, 200) === norm(b?.text).slice(0, 200);
  };
  /**
   * A review that is also another row's, as on Amazon: the same review on
   * Flipkart that the other row's check found (by its own ID, or, with none,
   * by its name, stars and words), or that the other row's review link opens.
   * This row the later one: Duplicate of the first (true). This row the first:
   * the later rows are Duplicate, and this row's Note says so (false).
   */
  function sameReviewDuplicate(n, r) {
    const id = r?.id ? String(r.id).toLowerCase() : null;
    const same = others.filter((o) => {
      const f = o.check?.found;
      const theirs = f?.how === 'found' || f?.how === 'gone' ? f.review : null;
      if (id && theirs?.id) return String(theirs.id).toLowerCase() === id;
      if (id && (o.shots?.review?.links ?? []).some((l) => linkKey(l) === `review:${id}`)) return true;
      return Boolean(theirs && !id && !theirs.id && sameFound(theirs, r));
    });
    if (!same.length) return false;
    const laterOnes = same.filter((o) => before(row, o));
    if (laterOnes.length < same.length) {
      const first = firstOf(same.filter((o) => before(o, row)));
      return dup(n, `The review in this row is the same review on Flipkart as in ${rowName(first)}, ${firstSaid(first)}.`, 'two different orders cannot share one review, so this row is a duplicate and was not checked further');
    }
    for (const o of laterOnes) alsoDuplicate(o, `The review in this row is the same review on Flipkart as in ${rowName(row)}, which is the one checked.`);
    laterSaid('review', laterOnes);
    return false;
  }
  /** What a cell's picture says, read in step 1 to see whose order it shows or whether it is another row's picture; a screenshot's reading is used again by its own step. */
  const early = {};
  async function readEarly(n, which) {
    const g = await fetchCell(n, which);
    if (!g.files.length) return null;
    let r;
    if (isReview(which)) r = await readReview(g.files, { reviewer: reviewer || null, productIs });
    else {
      const want = { orderId: sheetId || null, amount: sheetAmount, tolerance, allowance, product: which === 'order' && had.product ? productTold : null };
      r = early[which] = await (which === 'order' ? readOrder : readDelivery)(g.files, { want });
    }
    checkStop();
    return r;
  }

  /**
   * Step 1: duplicates and links in the sheet, as on Amazon (amazon/check.js
   * step 1): the same order ID as another row, the same screenshot link or
   * review link (only a picture or one review counts), the same picture file,
   * and a picture that looks like another row's and reads the same (a review
   * screenshot: the review's own title and words). Of the
   * rows that share one, only the first in the file's order is checked; this
   * row the later one, it is Duplicate and nothing more is checked. This row
   * the first, its Note names the later ones.
   */
  async function duplicatesStep(n) {
    start(n, 'Looking for the same order, links and pictures in other rows');
    // The same order ID in another row: only the first of them is checked.
    if (sheetId) {
      const same = others.filter((o) => o.orderId?.value && o.orderId.value === sheetId);
      if (same.length && isLater(same)) {
        const first = firstOf(same.filter((o) => before(o, row)));
        return dup(n, hasResult(first) ? `Order ID ${sheetId} was already checked in ${rowName(first)}.` : `Order ID ${sheetId} is also in ${rowName(first)}, and ${rowName(first)} is the one that will be checked.`, `this row has the same order ID, so it is a duplicate and was not checked${hasResult(first) ? ' again' : ''}`);
      }
      if (same.length) laterSaid('order ID', same);
    }
    // The same screenshot or review link as another row's, by where the link goes. Only a picture or one review counts: never words, a product's
    // page or its reviews, a short link, an app store's page or another Flipkart page.
    const sharable = (which, link) => which !== 'review' || downloadable('review', link) || linkLabel(link) === 'Flipkart review';
    const theirs = new Map();
    for (const o of others) {
      for (const which of PICTURE_CELLS) {
        for (const link of o.shots?.[which]?.links ?? []) {
          const key = sharable(which, link) ? linkKey(link) : null;
          if (!key) continue;
          if (!theirs.has(key)) theirs.set(key, []);
          if (!theirs.get(key).some((x) => x.o === o)) theirs.get(key).push({ o, which });
        }
      }
    }
    for (const which of PICTURE_CELLS) {
      for (const link of row.shots?.[which]?.links ?? []) {
        if (!sharable(which, link)) continue;
        // Flipkart's message that a review was not accepted, given by the same link for two orders of one account, is the same message, not the same review.
        const hits = (theirs.get(linkKey(link)) ?? []).filter((h) => !(isReview(which) && (refusalShown(row, which) || refusalShown(h.o, h.which))));
        if (!hits.length) continue;
        const what = which === 'review' ? 'review link' : WHAT[which];
        const share = which === 'review' ? 'two different orders cannot share one review' : 'two different orders cannot share one screenshot';
        if (!isLater(hits.map((h) => h.o))) {
          laterSaid(what, hits.map((h) => h.o));
          continue;
        }
        const first = firstOf(hits.map((h) => h.o).filter((o) => before(o, row)));
        return dup(n, `This row uses the same ${what} as ${rowName(first)}, ${firstSaid(first)}.`, `${share}, so this row is a duplicate and was not checked${hasResult(first) ? ' again' : ''}`);
      }
    }
    // The review link opens one review that another row's check found on Flipkart.
    const linked = had.reviewLink ? (row.shots?.review?.links ?? []).map(reviewIdFrom).find(Boolean) : null;
    if (linked && sameReviewDuplicate(n, { id: linked })) return;
    // The very same picture file as another row's.
    const sameFile = samePictures(current, others, null, seenOf);
    for (const which of PICTURE_CELLS) {
      let hits = sameFile[which];
      if (!hits.length) continue;
      // A screenshot is read first, to see whose order it shows (notSame).
      if (!isReview(which) && sheetId) {
        const r = await readEarly(n, which);
        hits = notSame(which, hits, r ? { orderIds: r.ok === false ? [] : r.orderIds ?? [], text: r.text ?? '' } : null);
      } else hits = notSame(which, hits, null);
      if (!hits.length) continue;
      if (!isLater(hits.map((h) => h.o))) {
        markLater(hits, which);
        continue;
      }
      return samePictureStop(n, which, hits);
    }
    // A picture that looks like another row's: read now, so the same picture is found before anything else.
    for (const which of PICTURE_CELLS) {
      if (!lookAlikes(current, others, which, seenOf).length) continue;
      say(`Reading the ${WHAT[which]}, which looks like another row's`);
      const r = await readEarly(n, which);
      if (!r || r.ok === false || !r.text) continue;
      if (samePictureAfterReading(n, which, wordsRead(which, r))) return;
    }
    // This row the first: its line names the later rows that share something with it, as its Note does.
    return finish(n, 'pass', afterWhy.size ? [...afterWhy].join(' ') : 'No other row has this order ID, these links or these pictures.');
  }

  /** Steps 2, 4 and 6: a screenshot's cell, and its pictures downloaded (amazon/check.js openShot). */
  async function openShot(n, which) {
    start(n, `Opening the ${WHAT[which]}`);
    if (!had[SHOT_COLUMN[which]]) {
      shot[which] = { state: 'no column' };
      return finish(n, 'fail', `The file has no ${WHAT[which]} column.`);
    }
    const s = row.shots?.[which] ?? {};
    if (!s.links?.length && !s.picture) {
      // A delivery cell that says the order was not delivered ("Cancelled"), as on Amazon.
      if (which === 'delivery' && s.text && holdsWord(s.text, NOT_DELIVERED_WORDS)) {
        shot[which] = { state: 'words', text: s.text };
        return finish(n, 'fail', `The cell says ${quoted(s.text, 60)}, so the order was not delivered.`);
      }
      shot[which] = { state: 'missing', text: s.text ?? '' };
      return finish(n, 'fail', s.text ? `The cell says ${quoted(s.text, 60)} instead of holding a screenshot.` : 'The cell is empty.');
    }
    const g = await fetchCell(n, which);
    if (!g.files.length) {
      const p = g.problems[0] ?? { kind: 'access', site: null, says: 'it could not be opened' };
      shot[which] = { state: 'unopened', picture: pictureProblem(which, p) };
      return finish(n, 'fail', problemLine(which, p));
    }
    if (g.problems.length) warnings.push(`${g.problems.length} of the ${g.problems.length + g.files.length} ${WHAT[which]}s could not be opened.`);
    shot[which] = { state: 'opened', files: g.files };
    return finish(n, 'pass', `Opened ${g.files.length === 1 ? `the ${WHAT[which]}` : `${g.files.length} ${WHAT[which]}s`}.`);
  }

  // ---- steps 3 and 5: each screenshot read, and each detail compared with the sheet (amazon/check.js readShot and detailsOf) ----
  const mark = marks.productNameShare;
  const tolerance = marks.amountDifferenceRupees;
  /** Up to this many rupees of Flipkart's fees may be missing from a screenshot that shows no total. */
  const allowance = marks.feeAllowanceRupees ?? 0;
  /** The products of the live campaigns this row uses, by their real names from Flipkart; none when it uses no campaign. */
  const campaignProducts = campaigns.flatMap((c) => (c.products ?? []).map((p) => ({ ...p, lead: brandWordsAtStart(p.name, c.brand) })));
  const byCampaign = campaignProducts.length > 0;

  /**
   * Which of the campaigns' products a screenshot shows, by its real name from
   * Flipkart or the start of it (a name Flipkart cut short counts when the
   * part shown is the start of its real name): { state: 'same', shown,
   * product }. 'different' when it shows another product's name starting with
   * the brand; 'not shown' otherwise, with part when too little of a name
   * shows to tell.
   */
  function campaignProductOn(texts) {
    let best = null;
    const score = (h) => h.full + (h.cut ? 1 : 0);
    const hits = [];
    for (const c of campaignProducts) {
      const hit = nameStartShown(texts, c.name, { lead: c.lead });
      if (!hit) continue;
      hits.push({ c, hit });
      const enough = enoughOfName(hit, c.lead);
      if (!best || (enough && !best.enough) || (enough === best.enough && score(hit) > score(best.hit))) best = { c, hit, enough };
    }
    // The start shown fits one of the campaign's products alone (its brand and a word or more of its name): that is the product, as staff read it.
    const alone = hits.length === 1 && hits[0].hit.full >= Math.max(1, hits[0].c.lead) + (hits[0].hit.cut ? 0 : 1) && hits[0].hit.full + (hits[0].hit.cut ? 1 : 0) >= Math.max(1, hits[0].c.lead) + 1;
    // Every campaign product the screenshot shows enough of (an order of several products): the delivery screenshot must share one, in a later step.
    const all = alone ? [hits[0].c] : hits.filter((h) => enoughOfName(h.hit, h.c.lead)).map((h) => h.c);
    if (best?.enough || (best && alone)) return { state: 'same', shown: best.hit.shown, product: { name: best.c.name, short: best.c.short, pid: best.c.pid }, all: all.map((c) => c.pid), campaign: true, start: !best.enough };
    // Another product's name: a line that starts with the brand (or with the first word of a product named without it), and could not be one of the campaign's products read with a slip.
    const other = nameLineStarting(texts, [...campaigns.map((c) => c.brand), ...campaignProducts.filter((c) => !c.lead).map((c) => c.name.split(/\s+/)[0])]);
    const couldBeOurs = other && campaignProducts.some((c) => nameCouldBe(other, c.name, c.lead));
    if (best && (!other || best.hit.shown.includes(other) || couldBeOurs)) return { state: NOT_SHOWN, part: best.hit.shown, campaign: true };
    if (other && couldBeOurs) return { state: NOT_SHOWN, part: other, campaign: true };
    // A name with a word of only one of the campaign's products in it may be that product, so it is not called a different one; a staff member looks.
    if (other && ownWordOf(other)) return { state: NOT_SHOWN, part: other, campaign: true };
    if (other) return { state: 'different', shown: other, campaign: true };
    return { state: NOT_SHOWN, campaign: true };
  }
  /** The campaign's product whose own word (one no other of its products has in its name) a name holds, when exactly one is. */
  function ownWordOf(name) {
    const brandish = new Set(campaigns.flatMap((c) => productWords(c.brand)));
    const keyWords = (t) => productWords(t).filter((w) => w.length >= 4 && !brandish.has(w));
    const words = new Set(keyWords(name));
    const mine = campaignProducts.filter((c) => keyWords(c.name).some((w) => words.has(w) && !campaignProducts.some((o) => o !== c && keyWords(o.name).includes(w))));
    return mine.length === 1 ? mine[0] : null;
  }
  /**
   * True when some lines show the product ordered: the campaign's product the purchase screenshot shows (any of the
   * campaign's products when it showed none), or, with no campaign, the product named in the sheet.
   */
  function productIs(texts) {
    if (!byCampaign) return Boolean(label) && (productShown(label, texts)?.share ?? 0) >= mark;
    const hit = campaignProductOn(texts);
    if (hit.state !== 'same') return false;
    const bought = result.order?.details?.product?.state === 'same' ? result.order.details.product.product?.pid : null;
    return !bought || hit.product?.pid === bought || (hit.all ?? []).includes(bought);
  }
  /** True when some lines tell the product: one of the campaign's products or another product's name, or (with no campaign) the product named in the sheet. */
  const productTold = (texts) => (byCampaign ? campaignProductOn(texts).state !== NOT_SHOWN : !label || (productShown(label, texts)?.share ?? 0) >= mark);

  /**
   * What one screenshot shows of each detail, compared with the sheet:
   * { state, shown }. state is 'same', 'different', 'not shown', or 'shown'
   * when the sheet has nothing to compare it with. A product's name cut short
   * on the screen is not shown (part says what is shown).
   */
  function detailsOf(which, r) {
    const ids = r.orderIds ?? [];
    let orderId;
    if (ids.length) orderId = !sheetId ? { state: 'shown', shown: ids[0] } : ids.includes(sheetId) ? { state: 'same', shown: sheetId } : { state: 'different', shown: ids.find((id) => id !== sheetId) };
    else {
      // Only part of the order ID read (cut off at the screenshot's edge, or a digit lost in reading): it is the sheet's when the part read is in it.
      const part = sheetId ? partialOrderId(r.texts ?? [], sheetId) : null;
      orderId = part ? { state: 'same', shown: sheetId, part: part.digits } : { state: NOT_SHOWN };
    }
    const dates = orderDates(which, r.dates);
    const dateHit = sheetDay ? dates.find((d) => sameDay(d, sheetDay)) : null;
    const orderDate = !dates.length ? { state: NOT_SHOWN } : !sheetDay ? { state: 'shown', shown: dateWords(dates[0]) } : dateHit ? { state: 'same', shown: dateWords(dateHit) } : { state: 'different', shown: dateWords(dates[0]) };
    const usable = usableAmounts(r.amounts);
    const hit = sheetAmount === null ? null : amountMatch(r.amounts, sheetAmount, { tolerance, allowance });
    let amount;
    if (!usable.length && !hit) amount = { state: NOT_SHOWN };
    else if (sheetAmount === null) amount = { state: 'shown', shown: rupees(amountToName(usable).value), label: amountLabel(amountToName(usable).label) };
    // On the delivery screenshot, an item's price with no total shown (and no fees shown with it) is not the order's amount: it is not compared.
    else if (hit && which === 'delivery' && !totalShown(r.amounts) && hit.how !== 'with fees') amount = { state: NOT_SHOWN, price: rupees(hit.value) };
    else if (hit) amount = { state: 'same', shown: rupees(hit.value), label: amountLabel(hit.label), how: hit.how, parts: hit.parts };
    else {
      // Flipkart's price details show the order's total ("Total amount", "Paid ₹… by"): only that total, read clearly, is different; an item's
      // price is never the order's amount there, and a total read two ways is not clear, so it is not shown.
      const total = totalRead(r.amounts);
      if (total) amount = { state: 'different', shown: rupees(total.value), label: amountLabel(total.label) };
      else if (priceDetailsShown(r.amounts)) amount = { state: NOT_SHOWN };
      else {
        // The amount named is the one that may be the sheet's read with a slip (one digit away), when there is one; else a total first.
        const named = usable.find((a) => amountOneDigitOff(a.value, sheetAmount)) ?? amountToName(usable);
        // On the delivery screenshot, an item's price with no total shown is not the order's amount: it is not compared.
        amount = which === 'delivery' && !totalShown(r.amounts) ? { state: NOT_SHOWN, price: rupees(named.value) } : { state: 'different', shown: rupees(named.value), label: amountLabel(named.label) };
      }
    }
    const p = label ? productShown(label, r.texts ?? []) : null;
    const share = p?.share ?? 0;
    let product;
    // A detail whose column the file does not have is not compared.
    if (!had.product) product = { state: SKIP };
    else if (byCampaign) {
      // The picture's own reading tells the product; the words of its other readings only help find the product ordered when it does not.
      const own = r.lines?.length ? r.lines.map((l) => l.text) : r.texts ?? [];
      product = campaignProductOn(own);
      if (product.state !== 'same' && (r.texts ?? []).length > own.length) {
        const more = campaignProductOn(r.texts);
        if (more.state === 'same') product = more;
      }
    } else if (!label) product = { state: 'shown', shown: null };
    else if (share >= mark) product = { state: 'same', shown: p.shown, share };
    // Cut short ("…"): only the start of the name is shown, so it is never called different.
    else if (share > 0 && cutShort(p.shown)) product = { state: NOT_SHOWN, part: p.shown, share };
    // A different product only when a name of three words or more shows half of the product's words, or two of them (the brand and one more).
    else if ((share >= 0.5 || Math.round(share * productWords(p.name ?? label).length) >= 2) && wordsOf(p.shown).length >= 3) product = { state: 'different', shown: p.shown, share };
    else product = { state: NOT_SHOWN, share };
    // The name as shown, once compared: without the stray marks read before it and the price read after it (nameAsShown).
    const names = byCampaign ? [...campaigns.map((c) => c.brand), ...campaignProducts.map((c) => c.name)] : productNames(label);
    for (const k of ['shown', 'part']) if (typeof product[k] === 'string') product = { ...product, [k]: nameAsShown(product[k], names) };
    return { orderId, orderDate: had.orderDate ? orderDate : { state: SKIP }, amount: had.amount ? amount : { state: SKIP }, product };
  }
  /** How an amount is the same, when not shown as it is: "with ₹10 of fees", "with ₹50 of SuperCoins", or "with Flipkart's fees not shown". */
  const amountHow = (v) => {
    if (v.how === 'with fees') return ` (${v.shown} with ${rupees(v.parts.filter((p) => p.kind === 'fee').reduce((n, p) => n + p.value, 0))} of fees${v.parts.some((p) => p.kind === 'off') ? ', less the money taken off' : ''})`;
    if (v.how === 'with supercoins') return ` (${v.shown} with ${rupees(v.parts[0]?.value)} of SuperCoins)`;
    return v.how === 'fees not shown' ? ` (${v.shown}, with Flipkart's fees not shown)` : '';
  };
  /** "Order ID: the same. Order date: not shown. …", for the step's line on the row's page. */
  const detailWords = (details) =>
    compared
      .map((k) => {
        const v = details[k];
        if (k === 'product' && v.campaign && v.state !== NOT_SHOWN) return `Product: ${v.state === 'same' ? `one of the campaign's products${v.start ? ', by the start of its name' : ''}` : "not one of the campaign's products"}.`;
        if (k === 'orderId' && v.part) return `Order ID: the same (${v.part} of its ${sheetId.replace(/\D/g, '').length} digits were read).`;
        if (k === 'amount' && v.state === 'same') return `Amount: the same${amountHow(v)}.`;
        if (k === 'amount' && v.price) return `Amount: not shown (${v.price} is an item's price, not the order's total).`;
        return `${cap(NOUN[k])}: ${STATE_SAID[v.state]}.`;
      })
      .join(' ');
  /** A screenshot fails its own step when a detail on it is different, or when the purchase screenshot does not show the order ID or the product; the delivery screenshot need not show them. */
  const shotFails = (which, details) => details.orderId.state === 'different' || (which === 'order' && details.orderId.state !== 'same') || (had.product && (details.product.state === 'different' || (which === 'order' && details.product.state !== 'same'))) || ['orderDate', 'amount'].some((k) => ['different', 'shown'].includes(details[k].state));
  /** The first of Flipkart's not-delivered words ("Cancelled", "Returned", "Shipped"…) a screenshot's lines hold, or null. */
  function notDeliveredWord(r) {
    const lines = (r.texts?.length ? r.texts : String(r.text ?? '').split('\n')).map((l) => String(typeof l === 'string' ? l : l?.text ?? ''));
    return NOT_DELIVERED_WORDS.find((w) => lines.some((l) => holdsWord(l, [w]))) ?? null;
  }
  /** The order IDs the two screenshots show, when each shows one and they are not the same (FLIPKART-PLAN.md point 6): { order, delivery }, or null. */
  function idsNotMatching() {
    const shown = (x) => {
      const v = x?.details?.orderId;
      return v && ['same', 'different', 'shown'].includes(v.state) ? v.shown : null;
    };
    const order = shown(result.order);
    const delivery = shown(result.delivery);
    return order && delivery && order !== delivery ? { order, delivery } : null;
  }

  /** Steps 3 and 5: the screenshot read on this computer, and each detail compared with the sheet. */
  async function readShot(n, which) {
    const was = shot[which]?.state;
    if (was !== 'opened') {
      const why = was === 'no column' ? `The file has no ${WHAT[which]} column, so there is nothing to read.` : was === 'missing' ? `There is no ${WHAT[which]} to read.` : was === 'words' ? 'The cell holds words, not a screenshot, so there is nothing to read.' : `The ${WHAT[which]} could not be opened, so it was not read.`;
      return finish(n, 'not-reached', why);
    }
    start(n, `Reading the ${WHAT[which]}`);
    // A screenshot is read again the other ways when it lacks what the sheet gives: the order ID, the amount, and on the purchase screenshot the product.
    const want = { orderId: sheetId || null, amount: sheetAmount, tolerance, allowance, product: which === 'order' && had.product ? productTold : null };
    // Read already in step 1, when it looked like another row's picture.
    const r = early[which] ?? (await (which === 'order' ? readOrder : readDelivery)(shot[which].files, { want }));
    checkStop();
    // The days read, for step 8: the order's on the purchase screenshot, the delivery's on the delivery screenshot.
    daysRead[which] = which === 'order' ? orderDates('order', r.dates ?? []) : r.deliveredOn ?? null;
    const near = (v) => sheetAmount !== null && Number.isFinite(v) && Math.abs(v - sheetAmount) <= tolerance + 1e-9;
    // A number read with no rupee sign and no label is shown only when it is the sheet's amount, the only time it counts.
    const amounts = (r.amounts ?? [])
      .filter((a) => !a.bare || near(a.value) || (a.alts ?? []).some(near))
      .map((a) => {
        // A number whose rupee sign was read as a digit is shown as the amount it is.
        const alt = (a.alts ?? []).find(near);
        return { text: a.text, value: !near(a.value) && alt !== undefined ? alt : a.value, label: a.label, skip: Boolean(a.skip) };
      });
    const record = {
      ok: Boolean(r.ok),
      problem: r.problem ?? null,
      confidence: r.confidence ?? null,
      wordCount: r.wordCount ?? 0,
      hindi: Boolean(r.hindi),
      orderIds: r.orderIds ?? [],
      // Each date once, though several readings read it.
      dates: datesOnce(orderDates(which, r.dates)).map(dateWords),
      // An amount with no label is not shown again when the same amount is shown with its label.
      amounts: amounts.filter((a) => a.label || !amounts.some((b) => b.label && b.value === a.value)),
      product: null,
      productShare: null,
      text: clean(r.text ?? ''),
      details: null,
    };
    // A delivery screenshot with no "Delivered" may clearly say it was not delivered ("Cancelled", "Returned"…).
    const notWord = which === 'delivery' && !r.delivered ? notDeliveredWord(r) : null;
    // Its date said only when it reads as a real date: "Delivered (its date could not be read)" otherwise.
    const unread = Boolean(r.deliveredDateUnread);
    if (which === 'delivery') Object.assign(record, { delivered: Boolean(r.delivered), deliveredText: r.deliveredText ? `${clean(r.deliveredText)}${unread ? ' (its date could not be read)' : ''}` : null, notDelivered: notWord });
    result[which] = record;
    if (!r.ok) {
      shot[which] = { ...shot[which], state: 'unreadable', problem: r.problem ?? 'its words are not clear enough to read' };
      return finish(n, 'fail', `It could not be read: ${shot[which].problem}.`);
    }
    // Once read: the same picture as another row's, as on Amazon (the same file, or one that looks the same and reads the same).
    if (samePictureAfterReading(n, which, wordsRead(which, r))) return;
    const details = detailsOf(which, r);
    record.details = details;
    reads[which] = r;
    // The purchase screenshot may say Delivered too (it may be the delivered order's page): the judging uses it when the delivery screenshot does not, as on Amazon.
    shot[which] = { ...shot[which], state: 'read', details, delivered: which === 'delivery' ? Boolean(r.delivered) : parseDelivery((r.texts ?? []).map(String)).delivered, notDelivered: notWord };
    record.product = details.product.shown ?? details.product.part ?? null;
    record.productShare = details.product.share ?? null;
    let said = detailWords(details);
    let fails = shotFails(which, details);
    if (which === 'delivery') {
      const deliveredSaid = r.deliveredHow === 'sign' ? `It says ${quoted(r.deliveredText, 40)}, which Flipkart shows only for a delivered order.` : `It says ${quoted(r.deliveredText, 40)}${unread ? ' (its date could not be read)' : ''}.`;
      said = `${r.delivered ? deliveredSaid : notWord ? `It says "${notWord}", not Delivered.` : 'It does not say Delivered.'} ${said}`;
      fails = fails || !r.delivered;
      // The two screenshots show different order IDs: both are said, in FLIPKART-PLAN.md's words.
      const ids = idsNotMatching();
      if (ids) {
        said = `${said} Order ID in the purchase screenshot: ${ids.order}. Order ID in the delivery screenshot: ${ids.delivery}. The order IDs do not match.`;
        fails = true;
      }
    }
    return finish(n, fails ? 'fail' : 'pass', said);
  }

  /**
   * Step 7: the review screenshot read on this computer, as the Amazon
   * checker reads one in its step 7 (amazon/check.js): the rating, the
   * review's title and words, the reviewer's name and the date, or Flipkart's
   * message that the review was not accepted or that only a rating was given.
   * Of several reviews, only the user's is read. A part not read clearly is
   * not shown, never guessed.
   */
  async function readReviewStep(n, which) {
    const was = shot[which]?.state;
    if (was !== 'opened') {
      const why = was === 'no column' ? `The file has no ${WHAT[which]} column, so there is nothing to read.` : was === 'missing' ? `There is no ${WHAT[which]} to read.` : `The ${WHAT[which]} could not be opened, so it was not read.`;
      return finish(n, 'not-reached', why);
    }
    start(n, 'Reading the review screenshot');
    const r = await readReview(shot[which].files, { reviewer: reviewer || null, productIs });
    checkStop();
    const text = (v) => (v ? clean(v) : null);
    result.review = {
      ok: Boolean(r.ok),
      problem: r.problem ?? null,
      confidence: r.confidence ?? null,
      wordCount: r.wordCount ?? 0,
      hindi: Boolean(r.hindi),
      kind: r.kind ?? 'unknown',
      stars: Number.isInteger(r.stars) ? r.stars : null,
      title: text(r.title),
      body: text(r.body),
      name: text(r.name),
      dateText: text(r.dateText),
      message: text(r.message),
      own: Boolean(r.own),
      form: Boolean(r.form),
      pending: Boolean(r.pending),
      tab: r.tab === 'pending' || r.tab === 'published' ? r.tab : null,
      note: text(r.note),
      others: Number.isInteger(r.others) ? r.others : 0,
      why: text(r.why),
      text: clean(r.text ?? ''),
    };
    const v = result.review;
    if (!r.ok) return finish(n, 'fail', `It could not be read: ${r.problem ?? 'its words are not clear enough to read'}.`);
    // Once read: the same picture as another row's, as on Amazon; never Flipkart's message that a review was not accepted, the same for two orders.
    if (r.text && v.kind !== 'refused' && samePictureAfterReading(n, which, wordsRead(which, r))) return;
    if (v.kind === 'refused') return finish(n, 'fail', `It shows a message from Flipkart that the review was not accepted: ${quoted(v.message, 200)}.`);
    // What the screen shows or does not show ("My Reviews": its Published tab, else it lists pending reviews too; the review being written is not posted) ends the line.
    const note = v.note ? ` ${v.note}` : '';
    if (v.kind === 'rating') {
      // A star rating with no words passes as Rating Only, as on Amazon: there are no words to look for on Flipkart.
      ratingOnly = true;
      return finish(n, 'pass', `${v.stars} stars and no written words.${note}`);
    }
    const among = v.others ? `, one of ${v.others + 1} reviews it shows` : '';
    // As the Amazon checker says it: the review's own words, quoted, end its line (then the note, as a sentence of its own).
    const said = quoted(v.body ?? v.title, 100);
    const words = `${said}${note ? `${/[.!?…]["”]$/.test(said) ? '' : '.'}${note}` : ''}`;
    if (v.kind === 'written' && v.form) return finish(n, 'pass', `The review being written: ${words}`);
    if (v.kind === 'written') return finish(n, 'pass', `A written review${v.name && !/flipkart\s+customer/i.test(v.name) ? ` by ${quoted(v.name, 40)}` : ''}${among}: ${words}`);
    return finish(n, 'fail', `It does not clearly show a written review, a star rating only or a message from Flipkart, because ${v.why}.${note}`);
  }

  /** True when the review screenshot shows a star rating with no words (step 7): Rating Only, as on Amazon. */
  let ratingOnly = false;

  // ---- step 8: finding the review among Flipkart's public reviews (FLIPKART-PLAN.md point 4) ----

  /**
   * From which day a review on Flipkart can be the user's: the day the order
   * was delivered, on the delivery screenshot; when it shows none ("Delivered
   * before time"), the day the order was placed, on the purchase screenshot
   * (the one marked as the order's, else the earliest). The file has no order
   * date to use. -> { day, from ('delivery', 'order' or null), said }; day is
   * null when neither shows one: then no date is used for the row.
   */
  function reviewsFrom() {
    const today = indiaDay(now());
    const delivered = dayOf(daysRead.delivery, today);
    if (delivered) return { day: delivered, from: 'delivery', said: `the day the order was delivered (${dayFirst(delivered)}, on the delivery screenshot)` };
    const ordered = orderDay(today);
    if (ordered) return { day: ordered, from: 'order', said: `the day the order was placed (${dayFirst(ordered)}, on the purchase screenshot, as the delivery screenshot shows no delivery day)` };
    return { day: null, from: null, said: 'neither the delivery screenshot nor the purchase screenshot shows a day' };
  }
  /** The day the order was placed, on the purchase screenshot: the date marked as the order's, else the earliest; null when it shows none. */
  function orderDay(today) {
    const dates = daysRead.order ?? [];
    const marked = dates.filter((d) => d.labelled).map((d) => dayOf(d, today)).find(Boolean);
    return marked ?? dates.map((d) => dayOf(d, today)).filter(Boolean).sort()[0] ?? null;
  }
  /**
   * The day the row's campaign started (campaigns.js startDayFrom): of the
   * product bought, when it is known, else of every campaign the row uses;
   * with several, the earliest. Null when a campaign has no start date: then
   * the row is checked as before campaigns had one.
   */
  function startDay(product) {
    const withProducts = campaigns.filter((c) => c.products?.length);
    const has = (c) => (c.products ?? []).some((p) => p.pid === product.pid || (p.variants ?? []).includes(product.pid));
    const mine = product?.pid ? withProducts.filter(has) : [];
    const list = mine.length ? mine : withProducts;
    if (!list.length || list.some((c) => !/^\d{4}-\d{2}-\d{2}$/.test(String(c.startDate ?? '')))) return null;
    return list.map((c) => c.startDate).sort()[0];
  }
  /** The campaign's product the row is for: the one the purchase screenshot shows, else the campaign's only one; null when it cannot be told. */
  function boughtProduct() {
    const shown = result.order?.details?.product?.state === 'same' ? result.order.details.product.product : null;
    if (shown?.pid) return campaignProducts.find((p) => p.pid === shown.pid) ?? shown;
    const all = campaignProducts.filter((p) => p.pid);
    return new Set(all.map((p) => p.pid)).size === 1 ? all[0] : null;
  }
  /** The review link's cell holds a link to one review on Flipkart, or one of Flipkart's short links that may lead to one. */
  const reviewLinked = () => had.reviewLink && (row.shots?.review?.links ?? []).some((l) => linkLabel(l) === 'Flipkart review' || isShortLink(l));
  /** Why the row has nothing to search Flipkart's reviews with, or null: a review screenshot with no review by the user, or none at all, and no link to one review. */
  function nothingToSearch() {
    const v = result.review;
    if (v?.kind === 'written' && (v.body || v.title)) return null;
    if (reviewLinked()) return null;
    if (!v) return 'There is no review screenshot to read and no link to one review';
    if (v.kind === 'rating') return 'The review screenshot shows a star rating only, with no words to search for, and there is no link to one review';
    if (v.kind === 'refused') return "The review screenshot shows Flipkart's message that the review was not accepted, and there is no link to one review";
    return `The review screenshot shows no review by the user (${v.why ?? 'none could be read'}), and there is no link to one review`;
  }

  /**
   * Step 8: finding the review among Flipkart's public reviews, as staff
   * would: the campaign product's own page on Flipkart, then "See all
   * reviews", newest first (reviews.js readProductReviews), read once in a
   * checking run and kept on this computer for every row (routes.js); then
   * the review screenshot's words and name searched for among them
   * (review-match.js), only reviews posted on or after the day the order was
   * delivered (else placed) counting (reviewsFrom). Found, it passes, with
   * the stars Flipkart shows; words under another name, or under "Flipkart
   * Customer", two reviews that fit, or none, it fails, saying which. A row
   * with nothing to search with opens nothing. A robot check, a refused page,
   * an error page (still there when opened once more a minute later) or a
   * page that takes too long pauses the check, as on Amazon, and nothing is
   * got around; but a review found among the pages read before it is found.
   */
  /** What step 8 did, for the Status: why it searched nothing (skip: 'later', 'nothing', 'noCampaign' or 'noProduct'), and what it read (got) and found (m). */
  const seven = { skip: null, got: null, m: null };
  async function findReviewStep(n) {
    if (!reviews) {
      seven.skip = 'later';
      return later(n);
    }
    start(n, "Finding the review among Flipkart's public reviews");
    result.reviewsFrom = reviewsFrom();
    const nothing = nothingToSearch();
    if (nothing) {
      seven.skip = 'nothing';
      return finish(n, 'not-reached', `${nothing}, so there is nothing to search with.`);
    }
    if (!byCampaign) {
      seven.skip = 'noCampaign';
      return finish(n, 'not-reached', "The row uses no live campaign with a product read from Flipkart, so there is no product's page to find the review on.");
    }
    const product = boughtProduct();
    if (!product) {
      seven.skip = 'noProduct';
      return finish(n, 'not-reached', "Which of the campaign's products was bought could not be told from the purchase screenshot, so it is not known whose reviews to search.");
    }
    // The day the product's campaign started: the reviews are read back to it, and the ones since it kept from earlier readings come too (routes.js).
    const begun = startDay(product);
    const got = await reviews(product.pid, {
      rowId: row.id,
      signal,
      day: result.reviewsFrom.day,
      start: begun,
      onPage: (p, read, wait) => say(wait ? `Flipkart showed an error page; opening it once more in ${Math.round(wait / 1000)} seconds` : p === 0 ? "Opening the product's page on Flipkart" : `Reading Flipkart's reviews, newest first${read ? ` (${read} read so far)` : ''}`),
    });
    checkStop();
    const kept = (got.reviews ?? []).length;
    const oldest = (got.reviews ?? []).map((r) => r.date).filter(Boolean).sort()[0] ?? null;
    // The reviews since the start date kept from earlier readings that today's reading does not show (kept-reviews.js): searched too.
    const keptOnly = begun ? keptNotRead(got, got.kept) : [];
    result.flipkart = { pid: product.pid, name: got.product?.name ?? product.name ?? null, readAt: got.readAt ?? null, reused: Boolean(got.reused), pages: got.pages ?? 0, count: kept, total: got.total ?? null, end: got.end ?? null, since: got.since ?? null, oldest, says: got.says ?? null, ...(begun ? { start: begun, kept: keptOnly.length } : {}) };
    const pause = got.end === 'prevented' ? `flipkart-${got.prevented ?? 'blocked'}` : READING_PAUSES[got.end];
    // Searched even when the reading stopped part way: a review found among the pages read is found, and nothing more is needed.
    const day = result.reviewsFrom.day;
    // Each review's words as a person reads them (a copy kept earlier may still hold the page's HTML codes).
    const list = [...(got.reviews ?? []), ...keptOnly].map((r) => ({ ...r, name: r.name ? plainText(r.name) : r.name, title: r.title ? plainText(r.title) : r.title, text: r.text ? plainText(r.text) : r.text }));
    const found = (kept && got.end !== 'none') || keptOnly.length ? matchReview({ shot: result.review, sheetName: reviewer, reviews: list, day, avoid: [product.name ?? '', got.product?.name ?? ''] }) : null;
    // A review kept from an earlier reading counts as found only when today's reading does not reach back to its day; when it does, and the review
    // is not among today's, it may have been removed from Flipkart ('gone').
    const m = found?.how === 'found' && found.review?.kept && reaches(reachOf(got), found.review) ? { ...found, how: 'gone' } : found;
    // The review is kept with its own link as Flipkart's reviews pages sent it, which opens it on Flipkart (none when they sent none, never one made up); never its place in the list, which Flipkart's website does not show.
    result.found = m ? { how: m.how, count: m.count, nameFrom: m.name.from, counted: m.counted, nameOnly: m.nameOnly, before: m.before, share: m.share, rareShare: m.rareShare, review: m.review ? { id: m.review.id ?? null, name: m.review.name ?? null, stars: m.review.stars ?? null, title: m.review.title ?? null, text: m.review.text ?? null, dateSaid: m.review.dateSaid ?? null, date: m.review.date ?? null, dateLatest: m.review.dateLatest ?? null, link: reviewPageLink(m.review.link, m.review.id) } : null, ...(m.review?.kept ? { kept: true, lastSeen: m.review.lastSeen ?? null } : {}) } : null;
    seven.got = got;
    seven.m = m;
    // The same review on Flipkart as another row's: of the two, only the first in the file's order counts; this row the later one, it is Duplicate.
    if ((m?.how === 'found' || m?.how === 'gone') && sameReviewDuplicate(n, m.review)) return;
    // Flipkart stopping the reading (a robot check, a refused page, an error page, a page too slow), or the Live Flipkart Browser closed, offline or
    // led to another website, before the review was found pauses the check, as on Amazon: nothing is got around, and the reading goes on from there later.
    // A review kept from earlier readings and gone from the reviews read today would not be among the older ones still to read.
    if (pause && m?.how !== 'found' && m?.how !== 'gone') pauseAt(n, pause, PAUSE_SAYS[pause], `${got.says} The check paused here; nothing was got around.`);
    if (!m) return finish(n, 'fail', got.says ?? "Flipkart's reviews could not be read.");
    const how = got.reused || (got.wentOn && !got.opened) ? ' They were read earlier and kept on this computer, so Flipkart was not opened again.' : got.wentOn ? ' The reading went on from where it had stopped, keeping the reviews read before.' : '';
    // "1 month ago" is a day only roughly: the oldest review read, about then.
    const rough = (got.reviews ?? []).some((r) => r.date === oldest && r.dateLatest !== r.date);
    const reach = oldest ? `back to ${rough ? 'about ' : ''}${dayFirst(oldest)}` : null;
    // Flipkart may show fewer reviews than it counts: then older ones cannot be read at all.
    const hidden = got.end === 'last page' && Number.isInteger(got.total) && got.total > kept;
    const need = begun && got.since === begun ? `; the campaign started on ${dayFirst(begun)}` : `; the rows need reviews back to ${dayFirst(got.since)}`;
    const back = got.end === 'last page' ? `all the reviews Flipkart shows${hidden ? `, ${kept} of the ${got.total.toLocaleString('en-IN')} it counts` : ''}${reach ? `, ${reach}` : ''}` : reach ? `${reach}${got.end === 'limit' ? ', the most read at one time' : got.end === 'date' && got.since ? need : ''}` : 'their dates could not be read';
    const rule = day ? `Reviews posted on or after ${result.reviewsFrom.said} can be the user's.` : `The date is not used for this row: ${result.reviewsFrom.said}.`;
    const keptSaid = keptOnly.length ? ` ${keptOnly.length === 1 ? '1 more review' : `${keptOnly.length} more reviews`} posted since the campaign started on ${dayFirst(begun)}, kept on this computer from earlier readings, ${keptOnly.length === 1 ? 'was' : 'were'} searched too.` : '';
    const foundBefore = m.how !== 'found' ? '' : m.review?.kept ? ' The review was found among the reviews kept from earlier readings.' : ' The review was found among the reviews read before that.';
    const reading = pause ? `${got.says}${foundBefore}` : kept ? `Read ${kept === 1 ? '1 review' : `${kept} reviews`} of the product from "See all reviews" on Flipkart, newest first (${back}).${how}` : got.says ?? 'No review was read on Flipkart.';
    const [state, said] = foundSaid(m, got, oldest);
    return finish(n, state, `${said} ${reading}${keptSaid} ${rule}`);
  }
  /** Step 8's result, in plain words, never a review's words: [state, sentence]. */
  function foundSaid(m, got, oldest) {
    const v = result.review;
    const r = m.review;
    const many = (k, one, more) => (k === 1 ? one : more);
    const whose = m.name.from === 'screenshot' ? 'the name on the review screenshot' : m.name.from === 'sheet' ? "the reviewer's name in the sheet" : null;
    if (m.how === 'noWords') return ['later', 'The review screenshot shows no words to search for; the review link is opened in a later step.'];
    const exact = r?.date && r.date === r.dateLatest ? ` (${dayFirst(r.date)})` : '';
    if (m.how === 'found') {
      const shown = [Number.isInteger(r.stars) ? `it has ${r.stars} ${many(r.stars, 'star', 'stars')}` : null, r.dateSaid ? `it was posted ${r.dateSaid}${exact}` : null].filter(Boolean).join(', and ');
      // Kept from an earlier reading, and older than today's reading reaches: found, as last seen.
      if (r.kept) return ['pass', `Found the review among the reviews kept on this computer from earlier readings: its words match the review screenshot's, and it is under ${whose}. It was last seen on Flipkart on ${dayFirst(r.lastSeen)}; today's reading does not reach back to the day it was posted.${shown ? ` On Flipkart ${shown}.` : ''}`];
      const live = v?.form || v?.pending || v?.tab ? ' Finding it among Flipkart\'s public reviews shows the review is live.' : '';
      return ['pass', `Found the review among Flipkart's public reviews: its words match the review screenshot's, and it is under ${whose}.${shown ? ` On Flipkart ${shown}.` : ''}${live}`];
    }
    if (m.how === 'gone') return ['fail', `The review screenshot's words match a review under ${whose} that was on Flipkart when it was last seen there, on ${dayFirst(r.lastSeen)}, but it is not among today's reviews, though they reach back to the day it was posted${exact}, so it may have been removed from Flipkart.`];
    if (m.how === 'several') return ['fail', `${m.count} reviews under ${whose} have the review screenshot's words, so which one is the user's could not be told; none is picked.`];
    if (m.how === 'otherName') return ['fail', `The review screenshot's words match ${many(m.count, 'a review', `${m.count} reviews`)} under another name, not under ${whose}, so ${many(m.count, 'it is', 'they are')} not counted as found.`];
    if (m.how === 'noName') return ['fail', `The review screenshot's words match ${many(m.count, 'a review', `${m.count} reviews`)}, but Flipkart shows no name for ${many(m.count, 'it', 'them')} ("Flipkart Customer"), so the name could not be checked; ${many(m.count, 'it is', 'they are')} not counted as found.`];
    if (m.how === 'noNameToCheck') return ['fail', `The review screenshot's words match ${many(m.count, 'a review', `${m.count} reviews`)}, but there is no reviewer's name on the review screenshot or in the sheet to check ${many(m.count, 'it', 'them')} with, so ${many(m.count, 'it is', 'they are')} not counted as found.`];
    const day = result.reviewsFrom.day;
    const which = day ? `that can be posted on or after ${dayFirst(day)}` : 'read';
    const under = whose ? ` under ${whose}` : '';
    const none = m.counted === 0 ? `none of the reviews read can be posted on or after ${dayFirst(day)}` : m.counted === 1 ? `the only review ${which} does not have the review screenshot's words${under}` : `none of the ${m.counted} reviews ${which} has the review screenshot's words${under}`;
    const notes = [];
    if (m.nameOnly) notes.push(`${many(m.nameOnly, 'A review', `${m.nameOnly} reviews`)} under that name ${many(m.nameOnly, 'is', 'are')} there, but ${many(m.nameOnly, 'its', 'their')} words do not match.`);
    if (v?.tab === 'published') notes.push('The review screenshot shows it on the Published tab of My Reviews, yet it is not among the reviews Flipkart shows for the product.');
    if (m.before) notes.push(`${many(m.before, 'A review', `${m.before} reviews`)} with these words under that name ${many(m.before, 'was', 'were')} posted before ${dayFirst(day)}, so ${many(m.before, 'it does', 'they do')} not count.`);
    const hidden = got.end === 'last page' && Number.isInteger(got.total) && got.total > (got.reviews ?? []).length;
    if (oldest && day && day < oldest && (got.end !== 'last page' || hidden)) notes.push(`The order was ${result.reviewsFrom.from === 'delivery' ? 'delivered' : 'placed'} on ${dayFirst(day)}, before the oldest review ${hidden ? 'Flipkart shows, so the review may be among the older ones it does not show' : 'read, so the review may be among older reviews not read yet'}.`);
    const ended = listEndedSaid(got);
    if (ended) notes.push(ended);
    return ['fail', `Not found among Flipkart's reviews: ${none}.${notes.length ? ` ${notes.join(' ')}` : ''}`];
  }
  /**
   * Flipkart's list of the product's reviews ending before the campaign's
   * start date (it shows at most 150 reviews, newest first): a sentence that
   * says so, with both days; null when the list reaches the start date, shows
   * every review Flipkart counts, or the campaign has no start date.
   */
  function listEndedSaid(got) {
    const begun = result.flipkart?.start ?? null;
    const oldest = result.flipkart?.oldest ?? null;
    const list = got?.reviews ?? [];
    if (!begun || !oldest || oldest <= begun || got?.end !== 'last page' || (Number.isInteger(got.total) && got.total <= list.length)) return null;
    const rough = list.some((r) => r.date === oldest && r.dateLatest !== r.date);
    const counted = Number.isInteger(got.total) ? ` of the ${got.total.toLocaleString('en-IN')} reviews it counts` : ' reviews';
    return `Flipkart shows only the newest ${list.length}${counted}, so its list stops at ${rough ? 'about ' : ''}${dayFirst(oldest)} and does not reach back to the campaign's start date, ${dayFirst(begun)}.`;
  }

  // ---- step 9: comparing the reviewer's name and the review's words (amazon/check.js reviewShotCheck and reviewerCheck) ----

  /** Problems step 9 finds that a staff member must look at: { type, says, then }. They never fail the transaction. */
  const flags = [];
  const flag = (type, says, then) => flags.push({ type, says, then });
  /** Step 9's sentences for the Note when what it compared matches. */
  const reviewNotes = [];
  /** Two names written the same, but for small and capital letters, spaces and marks. */
  const sameName = (a, b) => {
    const norm = (t) => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    return Boolean(norm(a)) && norm(a) === norm(b);
  };
  const starsWord = (k) => `${k} ${k === 1 ? 'star' : 'stars'}`;

  /**
   * Step 9: the review found on Flipkart (step 8) against the review
   * screenshot, as the Amazon checker compares a review with the review
   * screenshot and with the Reviewer Name column: the name on the review
   * screenshot (else the reviewer's name in the sheet) against the name on
   * Flipkart (review-read.js nameFits), and the name in the Reviewer Name
   * column too; the screenshot's words against the review's words (the
   * screenshot may show only part of them); the stars, when both show them;
   * and the day it was posted against the day the order was delivered (else
   * placed). Anything that does not match is for a staff member, never a Fail.
   */
  function compareStep(n) {
    checkStop();
    const f = result.found;
    if (ratingOnly) return finish(n, 'not-needed', 'A rating only needs no comparison.');
    if (f?.how !== 'found' || !f.review) return finish(n, 'not-reached', f?.how === 'gone' ? 'The review is not among the reviews Flipkart shows today, so there is nothing to compare.' : 'The review was not found on Flipkart, so there is nothing to compare.');
    start(n, "Comparing the reviewer's name and the review's words");
    const v = result.review ?? {};
    const r = f.review;
    const said = [];
    // The name the review was found under: the one on the review screenshot, else the reviewer's name in the sheet.
    const mine = f.nameFrom === 'screenshot' ? v.name : String(reviewer ?? '').trim();
    const from = f.nameFrom === 'screenshot' ? 'on the review screenshot' : 'in the Reviewer Name column';
    said.push(sameName(mine, r.name) ? `The reviewer's name on Flipkart, ${quoted(r.name, 40)}, is the name ${from}.` : `The reviewer's name on Flipkart, ${quoted(r.name, 40)}, fits the name ${from}, ${quoted(mine, 40)}.`);
    // The Reviewer Name column, when the name came from the review screenshot.
    if (f.nameFrom === 'screenshot' && reviewer !== null && reviewer !== undefined) {
      const column = String(reviewer).replace(/\s+/g, ' ').trim();
      if (!column) said.push('The Reviewer Name cell is empty, so the name on Flipkart was not compared with it.');
      else if (nameFits(column, r.name)) said.push(sameName(column, r.name) ? 'It is the name in the Reviewer Name column too.' : `It fits the name in the Reviewer Name column, ${quoted(column, 40)}, too.`);
      else flag('reviewerNotMatching', `The reviewer's name on Flipkart, ${quoted(r.name, 40)}, is not the name in the Reviewer Name column, ${quoted(column, 40)}.`, 'A staff member must check whose review it is.');
    }
    // The words: the screenshot's are in the review (step 8 found them there); it may show only part of the review's.
    const ofFlipkart = overlapScore(r.text || r.title || '', shotWords(v)) ?? 0;
    said.push(ofFlipkart < 0.85 ? "The review screenshot shows part of the review's words on Flipkart." : 'The review screenshot shows the same words as the review on Flipkart.');
    // The stars, when both show them.
    if (Number.isInteger(v.stars) && Number.isInteger(r.stars)) {
      if (v.stars === r.stars) said.push(`Both show ${starsWord(r.stars)}.`);
      else flag('reviewShotNotMatching', `The review screenshot shows ${starsWord(v.stars)}, but the review on Flipkart has ${starsWord(r.stars)}.`, "A staff member must check which review is the user's.");
    } else said.push(`The stars were not compared, because ${Number.isInteger(v.stars) ? 'Flipkart shows none for the review' : 'the review screenshot shows none that could be read'}.`);
    // The day it was posted: on or after the day the order was delivered (else placed).
    const day = result.reviewsFrom?.day ?? null;
    const what = result.reviewsFrom?.from === 'order' ? 'placed' : 'delivered';
    if (!day) flag('somethingElse', 'Neither the delivery screenshot nor the purchase screenshot shows a day, so whether the review was posted after the order was delivered could not be checked.', 'Check the dates by hand.');
    else if (!r.dateLatest) flag('somethingElse', 'The day the review was posted could not be read on Flipkart, so whether it was posted after the order was delivered could not be checked.', 'Check the dates by hand.');
    else if (r.date && r.date >= day) said.push(`It was posted ${r.date === r.dateLatest ? `on ${dayFirst(r.date)}` : `${r.dateSaid ?? ''} (on ${dayFirst(r.date)} or later)`.trim()}, on or after ${dayFirst(day)}, the day the order was ${what}.`);
    else said.push(`Flipkart says it was posted ${quoted(r.dateSaid ?? '', 30)}, which can be on or after ${dayFirst(day)}, the day the order was ${what}.`);
    reviewNotes.push(...said);
    return finish(n, flags.length ? 'fail' : 'pass', [...said, ...flags.map((x) => x.says)].join(' '));
  }

  // ---- step 10: Status, Type and Note (amazon/check.js, its step 10, with its words and rules) ----

  /** The campaigns named in a sentence: "the campaign "Test Brand Bottles"", or "the campaigns "A" and "B"". */
  const named = campaigns.filter((c) => c.products?.length);
  const theCampaign = `the campaign${named.length > 1 ? 's' : ''} ${joinAnd(named.map((c) => `"${clean(c.name)}"`))}`;
  /** What the sheet gives for each detail, for a detail the form lacks. */
  const formHas = { orderId: Boolean(sheetId), orderDate: Boolean(sheetDay), amount: sheetAmount !== null, product: Boolean(label) };
  /** True when a detail that is different on a screenshot is one digit away from the sheet there: it may be a reading mistake. */
  function oneDigitOn(which, k) {
    const r = reads[which] ?? {};
    if (k === 'orderId') return (r.orderIds ?? []).some((id) => oneDigitOff(id, sheetId));
    if (k === 'orderDate') return orderDates(which, r.dates).some((d) => dateOneDigitOff(d, sheetDay));
    if (k === 'amount') return usableAmounts(r.amounts).some((a) => amountOneDigitOff(a.value, sheetAmount) || (a.alts ?? []).some((x) => amountOneDigitOff(x, sheetAmount)));
    return false;
  }
  /** Sentences the judging adds to the Note: how a screenshot was tied to the order when a detail was read in part. */
  const judgeNotes = [];
  /** The screenshots' problems (judge), once both are read. */
  let problems = [];
  /**
   * Every problem the two screenshots have, in the order that decides the
   * Type (RANK), as the Amazon checker judges them: [{ rank, type, kind,
   * detail, which, final }]. final is 'fail' for a problem that fails the
   * transaction, 'manual' for one a staff member must look at (a detail one
   * digit away from the sheet may only be a reading mistake). Empty when both
   * pass: the order ID and the product shown and the same on both, the order
   * date shown on at least one and the same wherever shown, the amount the
   * same wherever shown (shown on neither, it is not compared), and the
   * delivery screenshot says Delivered.
   */
  function judge() {
    const out = [];
    judgeNotes.length = 0;
    const add = (r, type, p) => out.push({ rank: r, type, at: out.length, final: 'fail', ...p });
    const read = SHOTS.filter((w) => shot[w]?.state === 'read');
    const st = (w, k) => shot[w].details[k].state;
    /** A different order ID, order date or amount that is one digit away from the sheet on every screenshot where it is different. */
    const misread = (k) => read.filter((w) => st(w, k) === 'different').every((w) => oneDigitOn(w, k));
    const different = (k) => ({ kind: 'different', detail: k, misread: misread(k), final: misread(k) ? 'manual' : 'fail' });
    // The order ID read one digit off on one screenshot, and whole and exactly on the other: a reading slip, not a problem.
    const idSlip = read.filter((w) => st(w, 'orderId') === 'different');
    const idExact = read.filter((w) => st(w, 'orderId') === 'same' && !shot[w].details.orderId.part);
    const idFixed = idSlip.length === 1 && idExact.length === 1 && oneDigitOn(idSlip[0], 'orderId');
    if (idFixed) judgeNotes.push(`The order ID on the ${WHAT[idSlip[0]]} was read one digit off, but the ${WHAT[idExact[0]]} shows it exactly, so it was taken as a reading slip.`);
    if (!idFixed && read.some((w) => st(w, 'orderId') === 'different')) add(RANK.orderId, 'orderIdNotMatching', different('orderId'));
    if (read.some((w) => st(w, 'product') === 'different')) add(RANK.product, 'productNotMatching', { kind: 'different', detail: 'product' });
    // Each screenshot shows one of the campaign's products, but not the same one: the delivery screenshot is not this order's product.
    const oProd = shot.order?.state === 'read' ? shot.order.details.product : null;
    const dProd = shot.delivery?.state === 'read' ? shot.delivery.details.product : null;
    const shared = (a, b) => (a.all ?? [a.product?.pid]).some((x) => x && (b.all ?? [b.product?.pid]).includes(x));
    if (byCampaign && oProd?.state === 'same' && dProd?.state === 'same' && oProd.product?.pid && dProd.product?.pid && !shared(oProd, dProd)) add(RANK.product, 'productNotMatching', { kind: 'mismatch', detail: 'product', which: ['delivery'] });
    // A picture in the delivery cell that says neither "Delivered" nor that the order was not delivered, and shows no detail of an order
    // (no order ID, amount or order date: a photo of the product), is not an order page, so it cannot be tied to this order.
    const dDet = shot.delivery?.state === 'read' ? shot.delivery.details : null;
    const noOrderDetail = Boolean(dDet) && !['orderId', 'amount', 'orderDate'].some((k) => ['same', 'different', 'shown'].includes(dDet[k]?.state));
    const notOrderPage = noOrderDetail && !shot.delivery.delivered && !shot.delivery.notDelivered;
    // "Delivered" on the purchase screenshot of this order (the two screenshots given the other way round) is this order delivered.
    const deliveredOnOrder = Boolean(shot.order?.state === 'read' && shot.order.delivered && st('order', 'orderId') === 'same');
    if (shot.delivery?.state === 'words') add(RANK.delivered, 'notDelivered', { kind: 'words' });
    // No "Delivered" fails only when the screenshot clearly says it was not delivered; else it may be a reading mistake.
    else if (shot.delivery?.state === 'read' && !shot.delivery.delivered && !notOrderPage) {
      if (!shot.delivery.notDelivered && deliveredOnOrder) judgeNotes.push('The delivery screenshot does not say Delivered, but the purchase screenshot shows this order delivered.');
      else add(RANK.delivered, 'notDelivered', { kind: 'not delivered', final: shot.delivery.notDelivered ? 'fail' : 'manual' });
    }
    for (const w of SHOTS) {
      if (shot[w]?.state === 'missing') add(RANK.open, w === 'order' ? 'orderShotMissing' : 'deliveryShotMissing', { kind: 'missing', which: [w] });
      else if (shot[w]?.state === 'no column') add(RANK.open, w === 'order' ? 'orderShotMissing' : 'deliveryShotMissing', { kind: 'no column', which: [w], final: 'manual' });
      else if (shot[w]?.state === 'unopened') add(RANK.open, shot[w].picture.type, { kind: 'unopened', which: [w], final: 'manual' });
    }
    // An amount read one digit away from the sheet on one screenshot, while the other screenshot of the same order (both show its order ID)
    // shows the sheet's: the amount is the sheet's, as with an order ID's slip.
    const amountFixed = read.length === 2 && read.every((w) => st(w, 'orderId') === 'same') && read.some((w) => st(w, 'amount') === 'same') && read.some((w) => st(w, 'amount') === 'different' && oneDigitOn(w, 'amount'));
    if (amountFixed) {
      const off = read.find((w) => st(w, 'amount') === 'different');
      const on = read.find((w) => st(w, 'amount') === 'same');
      judgeNotes.push(`The amount on the ${WHAT[off]} was read as ${shot[off].details.amount.shown}, but the ${WHAT[on]} of the same order shows ${shot[on].details.amount.shown}, the amount the user gave.`);
    }
    for (const k of ['orderDate', 'amount']) if (read.some((w) => st(w, k) === 'different') && !(k === 'amount' && amountFixed)) add(RANK.details, 'orderDetailsNotMatching', different(k));
    for (const k of compared) if (!formHas[k]) add(RANK.details, 'orderDetailsNotMatching', { kind: 'form', detail: k, final: 'manual' });
    for (const w of SHOTS) if (shot[w]?.state === 'unreadable') add(RANK.shown, `${w}NotClear`, { kind: 'unreadable', which: [w], final: 'manual' });
    // The order ID: the purchase screenshot must show it; the delivery screenshot need not (its product ties it to the order, below).
    if (compared.includes('orderId') && formHas.orderId) {
      const hidden = read.filter((w) => st(w, 'orderId') === NOT_SHOWN);
      if (hidden.length === 2) add(RANK.shown, 'orderNotClear', { kind: 'not shown', detail: 'orderId', which: hidden, final: 'manual' });
      else if (hidden.includes('order')) add(RANK.shown, 'orderNotClear', { kind: 'not shown', detail: 'orderId', which: ['order'], final: 'manual' });
    }
    // The product, the way staff read it: the purchase screenshot shows the product's name, or the start of it; the delivery screenshot shows the
    // same product, or is this order's by its order ID. A start cut short counts when both screenshots show the same start of the product ordered.
    if (compared.includes('product') && formHas.product) {
      const o = shot.order?.state === 'read' ? shot.order.details : null;
      const d = shot.delivery?.state === 'read' ? shot.delivery.details : null;
      const oP = o?.product;
      const dP = d?.product;
      const idOn = (det) => det?.orderId?.state === 'same';
      const samePart = Boolean(oP?.part && dP?.part && sameStart(oP.part, dP.part));
      // With a campaign, the product's real name from Flipkart (and its brand's words); without one, the product name in the sheet, of which three words or more (or all of a shorter name) must show.
      const leadOf = (name) => campaignProducts.find((c) => c.name === name)?.lead ?? 1;
      const startOf = (part, prod) => {
        if (!part) return false;
        if (prod?.name) return Boolean(nameStartShown([part], prod.name, { lead: leadOf(prod.name) }));
        if (!label) return false;
        const hit = nameStartShown([part], label);
        return Boolean(hit && (hit.whole || hit.full + (hit.cut ? 1 : 0) >= Math.min(productWords(label).length, 3)));
      };
      // Only a product not shown is judged here; a different product is a problem of its own, above.
      const orderOk = !o || oP.state !== NOT_SHOWN || samePart || (dP?.state === 'same' && (startOf(oP.part, dP.product) || (!oP.part && idOn(o) && idOn(d))));
      const deliveryOk = !d || dP.state !== NOT_SHOWN || samePart || (oP?.state === 'same' && startOf(dP.part, oP.product)) || (!dP.part && idOn(d));
      if (o && orderOk && oP.state === NOT_SHOWN) judgeNotes.push(samePart ? `The purchase screenshot shows only the start of the product's name, ${quoted(oP.part, 60)}, and the delivery screenshot shows the same start.` : oP.part ? `The purchase screenshot shows only the start of the product's name, ${quoted(oP.part, 60)}, which the delivery screenshot shows in full.` : "The product's name is not on the purchase screenshot, but the delivery screenshot shows it, with the same order ID.");
      if (d && deliveryOk && dP.state === NOT_SHOWN && !samePart) judgeNotes.push(dP.part ? `The delivery screenshot shows only the start of the product's name, ${quoted(dP.part, 60)}, which the purchase screenshot shows in full.` : "The delivery screenshot does not show the product's name, but it shows this order's ID.");
      // A picture in the delivery cell that is not an order page is a problem of its own (below), whatever product it shows.
      const hidden = [o && !orderOk ? 'order' : null, d && !deliveryOk && !notOrderPage ? 'delivery' : null].filter(Boolean);
      if (hidden.length === 2 && !hidden.some((w) => shot[w].details.product.part)) add(RANK.shown, 'orderNotClear', { kind: 'not shown', detail: 'product', which: hidden, final: 'manual' });
      else for (const w of hidden) add(RANK.shown, `${w}NotClear`, { kind: 'not shown', detail: 'product', which: [w], final: 'manual', noId: w === 'delivery' && !idOn(d) });
    }
    if (notOrderPage) add(RANK.shown, 'deliveryNotClear', { kind: 'no details', which: ['delivery'], final: 'manual' });
    if (read.length === 2 && compared.includes('orderDate') && formHas.orderDate && read.every((w) => st(w, 'orderDate') === NOT_SHOWN)) add(RANK.shown, 'orderNotClear', { kind: 'not shown', detail: 'orderDate', which: read, final: 'manual' });
    // The amount shown on neither screenshot is only not compared: alone, it never sends a row to a staff member (an amount shown and different does).
    if (read.length === 2 && compared.includes('amount') && formHas.amount && read.every((w) => st(w, 'amount') === NOT_SHOWN)) judgeNotes.push('Neither screenshot shows the amount, so it was not compared.');
    // Within a rank, the purchase screenshot's problem comes first.
    const first = (p) => (p.which ? (p.which.includes('order') ? 0 : 1) : 0);
    return out.sort((a, b) => a.rank - b.rank || first(a) - first(b) || a.at - b.at);
  }
  /** Once both screenshots are read: their problems, and each screenshot's step line says what the judging found that it did not, as on Amazon. */
  function judgeShots() {
    problems = judge();
    const neither = problems.filter((p) => p.kind === 'not shown' && p.which.length === 2).map((p) => `Neither screenshot shows ${p.detail === 'orderId' ? 'an order ID' : `the ${NOUN[p.detail]}`}.`);
    const s5 = result.steps[4];
    if (neither.length && s5.state !== 'not-reached') finish(5, 'fail', `${s5.detail ?? ''} ${neither.join(' ')}`.trim());
    for (const p of problems.filter((x) => (x.kind === 'not shown' || x.kind === 'no details' || x.kind === 'mismatch') && x.which.length === 1)) {
      const k = p.which[0] === 'order' ? 3 : 5;
      const s = result.steps[k - 1];
      if (s.state === 'pass') finish(k, 'fail', `${s.detail ?? ''} ${cap(notShownClause(p))}.`.trim());
    }
  }

  // The Note's sentences for the screenshots' problems, in the Amazon checker's words.
  /** What the user gave in the form: "order ID OD…", "the order date 20-07-2026", "the amount ₹349", "the product "…"". */
  const given = { orderId: () => `order ID ${sheetId}`, orderDate: () => `the order date ${dayFirst(sheetDay)}`, amount: () => `the amount ${rupees(sheetAmount)}`, product: () => `the product ${quoted(label, 80)}` };
  /** The same, without what it is: for "the user gave ₹349, but …". */
  const givenValue = { orderId: () => sheetId, orderDate: () => dayFirst(sheetDay), amount: () => rupees(sheetAmount), product: () => quoted(label, 80) };
  /** How a screenshot's value is said: an order ID or a date as it is, an amount with what it is, a product in quotes (a campaign's by the start of its real name). */
  const valueSaid = (k, v) => (k === 'product' ? quoted(v.campaign ? shortName(v.product?.short ?? v.shown) : v.shown, 80) : k === 'amount' && v.label ? `${v.shown} as ${v.label}` : v.shown);
  const readShots = () => SHOTS.filter((w) => shot[w]?.state === 'read');
  const withState = (k, state) => readShots().filter((w) => shot[w].details[k].state === state);
  /** "the delivery screenshot shows ₹399", or both screenshots' values. */
  function shownOn(k, list) {
    const vals = list.map((w) => valueSaid(k, shot[w].details[k]));
    if (list.length === 2 && vals[0] === vals[1]) return `both screenshots show ${k === 'orderId' ? `order ID ${vals[0]}` : vals[0]}`;
    return list.map((w, i) => `the ${WHAT[w]} shows ${k === 'orderId' ? `order ID ${vals[i]}` : vals[i]}`).join(' and ');
  }
  /** "the delivery screenshot", or "both screenshots": where a detail is different. */
  const differentOn = (k) => {
    const diff = withState(k, 'different');
    return diff.length === 2 ? 'both screenshots' : `the ${WHAT[diff[0]]}`;
  };
  function notShownClause(p) {
    if (p.kind === 'no details') return `the ${WHAT[p.which[0]]} does not show any order details to match`;
    if (p.kind === 'mismatch') return `the ${WHAT[p.which[0]]} shows another of the campaign's products, ${quoted(shortName(shot.delivery.details.product.product?.short ?? ''), 60)}, than the purchase screenshot, ${quoted(shortName(shot.order.details.product.product?.short ?? ''), 60)}`;
    const k = p.detail;
    const thing = k === 'orderId' ? 'an order ID' : `the ${NOUN[k]}`;
    if (p.which.length === 2) return `neither screenshot shows ${thing}, so it cannot be matched to this order`;
    const w = p.which[0];
    const part = shot[w].details[k].part;
    if (part && k === 'product') return `the ${WHAT[w]} shows only the start of the product's name, ${quoted(part, 80)}, which could be more than one product, so it cannot be matched to this order`;
    if (p.noId) return `the ${WHAT[w]} shows neither the product's name nor this order's ID, so it cannot be matched to this order`;
    return `the ${WHAT[w]} does not show ${thing}, so it cannot be matched to this order`;
  }
  function formSaid(k) {
    const text = { orderId: row.orderId?.text, orderDate: row.orderDate?.text, amount: row.amount?.text, product: label }[k];
    const isNot = { orderId: 'an order ID', orderDate: 'a date', amount: 'a number' }[k];
    if (text && isNot) return `The ${NOUN[k]} in the form, ${quoted(text, 30)}, is not ${isNot}, so the screenshots cannot be compared with it.`;
    return `The user did not give ${k === 'orderId' ? 'an order ID' : k === 'amount' ? 'an amount' : `a ${NOUN[k]}`} in the form, so the screenshots cannot be compared with it.`;
  }
  /** The problem that gives the Status, as its reason: words that follow "because". */
  function reasonOf(p) {
    const w = p.which?.[0];
    switch (p.kind) {
      case 'different': {
        const k = p.detail;
        if (k === 'product') return byCampaign ? `the product on ${differentOn(k)} is not one of the products of ${theCampaign}` : `the product on ${differentOn(k)} does not match the product the user gave`;
        return p.misread ? `the ${NOUN[k]} on ${differentOn(k)} is one digit away from the ${NOUN[k]} the user gave, which may be a reading mistake` : `the ${NOUN[k]} on ${differentOn(k)} does not match the ${NOUN[k]} the user gave`;
      }
      case 'words':
        return `the user wrote ${quoted(shot.delivery.text, 60)} in the form instead of giving a delivery screenshot, so the order was not delivered`;
      case 'not delivered':
        return shot.delivery.notDelivered ? `the delivery screenshot says "${shot.delivery.notDelivered}", so the order was not delivered` : 'the word "Delivered" could not be found on the delivery screenshot';
      case 'missing':
        return shot[w].text ? `the user wrote ${quoted(shot[w].text, 60)} in the form instead of giving a ${WHAT[w]}` : `the user did not give a ${WHAT[w]}`;
      case 'no column':
        return `the file has no ${WHAT[w]} column, so the ${w === 'order' ? 'purchase' : 'delivery'} cannot be seen`;
      case 'unopened':
        return lowerFirst(shot[w].picture.line);
      case 'form':
        return lowerFirst(formSaid(p.detail));
      case 'unreadable':
        return `the ${WHAT[w]} could not be read: ${shot[w].problem}`;
      default:
        return notShownClause(p);
    }
  }
  /** What the Note says next about the problem that gives the Status: the values, or what to do. */
  function detailOf(p) {
    const k = p.detail;
    if (p.kind === 'different') return k === 'product' && byCampaign ? [`${cap(shownOn(k, withState(k, 'different')))}.`] : [`The user gave ${given[k]()}, and ${shownOn(k, withState(k, 'different'))}.`];
    if (p.kind === 'unopened') return [`${cap(shot[p.which[0]].picture.because)}.`, shot[p.which[0]].picture.then];
    if (p.kind === 'unreadable') return ['Ask for a clearer screenshot, then check this row again.'];
    return [];
  }
  /** Every other problem, in one sentence. */
  function problemSaid(p) {
    const w = p.which?.[0];
    const k = p.detail;
    switch (p.kind) {
      case 'different':
        if (k === 'product' && byCampaign) return `The product is also not one of the products of ${theCampaign}: ${shownOn(k, withState(k, 'different'))}.`;
        return `The ${NOUN[k]} is ${p.misread ? 'one digit away from the form, which may be a reading mistake' : 'also different'}: the user gave ${givenValue[k]()}, but ${shownOn(k, withState(k, 'different'))}.`;
      case 'words':
      case 'not delivered':
      case 'missing':
      case 'no column':
      case 'unreadable':
        return `${cap(reasonOf(p))}.`;
      case 'unopened':
        return shot[w].picture.line;
      case 'form':
        return formSaid(k);
      default:
        return `${cap(notShownClause(p))}.`;
    }
  }

  /** "The user did not give a review screenshot or a review link…", when the row has neither, in the Amazon checker's words. */
  function reviewMissingSaid() {
    const shotCell = row.shots?.reviewShot ?? {};
    const linkCell = row.shots?.review ?? {};
    if (had.reviewShot && shotCell.text) return `The user wrote ${quoted(shotCell.text, 60)} in the form instead of giving a review screenshot.`;
    if (had.reviewLink && linkCell.text) return `The user wrote ${quoted(linkCell.text, 60)} in the form instead of giving a review link.`;
    if (!had.reviewLink) return 'The user did not give a review screenshot in the form.';
    if (!had.reviewShot) return 'The user did not give a review link in the form.';
    return 'The user did not give a review link or a review screenshot in the form.';
  }
  /** "the 150 reviews Flipkart shows for the product": the reviews step 8 read, in a few words. */
  function reviewsReadSaid(got) {
    const k = (got.reviews ?? []).length;
    const reviewsSaid = k === 1 ? 'the 1 review' : `the ${k} reviews`;
    if (got.end === 'last page') return `${reviewsSaid} Flipkart shows for the product`;
    if (got.end === 'date' && got.since) return `${reviewsSaid} read on Flipkart, newest first, back to ${dayFirst(got.since)}`;
    return `${reviewsSaid} read on Flipkart, newest first`;
  }

  /**
   * What stops the review from passing, as the Amazon checker says the same
   * problem: { type, says (sentences; the first is the reason), then }; null
   * when the review passes its steps (found on Flipkart, or a star rating
   * only). After the screenshots' problems, it gives the Status. A review that
   * is not among the reviews Flipkart shows, or that cannot be told to be the
   * user's, is for a staff member, never a Fail.
   */
  function reviewProblem() {
    const rw = reviewCell(row, had);
    const st = shot[rw]?.state;
    const v = result.review;
    const linked = reviewLinked();
    if (!st || st === 'no column' || st === 'missing') {
      // No review screenshot: a link to one review is not opened by the dashboard yet; a link that is not one fails, as on Amazon; none at all fails.
      if (linked) return { type: 'somethingElse', says: ['There is no review screenshot, and the review link, a link to one review on Flipkart, is not opened by the dashboard yet.'], then: 'Open the review link by hand.' };
      // A link to another website is a picture to download (screenshots.js downloadable), so what is left here is one of Flipkart's own pages.
      const links = had.reviewLink ? row.shots?.review?.links ?? [] : [];
      const label = links.length ? linkLabel(links[0]) : null;
      if (NOT_A_REVIEW[label]) return { type: 'wrongReviewLink', says: [`The review link opens ${NOT_A_REVIEW[label]}, not a review.`] };
      if (links.length) return { type: 'somethingElse', says: ['There is no review screenshot, and the review link opens a page on Flipkart that the dashboard does not open yet.'], then: 'Open the review link by hand.' };
      return { type: 'reviewLinkMissing', says: [reviewMissingSaid()] };
    }
    if (st === 'unopened') {
      const p = shot[rw].picture;
      return { type: p.type, says: [p.line, `${cap(p.because)}.`], then: p.then };
    }
    if (!v) return { type: 'somethingElse', says: ['The review screenshot was not read.'], then: 'Check this row again.' };
    if (!v.ok) return { type: 'reviewNotClear', says: [`The review screenshot could not be read: ${v.problem ?? 'its words are not clear enough to read'}.`], then: 'Ask for a clearer screenshot, then check this row again.' };
    if (v.kind === 'refused') return { type: 'cannotAddReviews', says: [`The review screenshot shows a message from Flipkart that the review was not accepted: ${quoted(String(v.message ?? '').replace(/[.!?]+\s*$/, ''), 200)}.`] };
    if (v.kind === 'rating') return null;
    if (v.kind !== 'written' || !(v.body || v.title)) return { type: 'somethingElse', says: [`The review screenshot does not clearly show a written review, a star rating only or a message from Flipkart, because ${v.why ?? 'none could be read'}.`, linked ? 'The review link is not opened by the dashboard yet.' : null].filter(Boolean), then: 'Open it by hand.' };
    // A written review: what step 8 found among Flipkart's reviews.
    const g = seven.got;
    const m = seven.m;
    if (seven.skip === 'noCampaign') return { type: 'reviewLinkNeeded', says: ['The review screenshot shows a written review, but the row uses no live campaign with a product read from Flipkart, so the review could not be looked for on Flipkart.'], then: "Add a campaign for this brand with its products, or ask the user for the review's link, then check this row again." };
    if (seven.skip === 'noProduct') return { type: 'somethingElse', says: ["Which of the campaign's products was bought could not be told from the purchase screenshot, so the review could not be looked for on Flipkart."], then: 'Check the screenshots by hand.' };
    if (seven.skip || !g) return { type: 'somethingElse', says: ['The review was not looked for on Flipkart.'], then: 'Check this row again.' };
    if (!m) return { type: 'reviewNotLive', says: ['The review is not among the reviews Flipkart shows for the product.', g.says], then: 'It may not be public yet.' };
    if (m.how === 'found') return null;
    const many = (k, one, more) => (k === 1 ? one : more);
    const whose = m.name.from === 'screenshot' ? 'the name on the review screenshot' : m.name.from === 'sheet' ? "the reviewer's name in the sheet" : 'the user\'s name';
    const whoseCheck = 'A staff member must check whose review it is.';
    if (m.how === 'several') return { type: 'reviewLinkNeeded', says: [`${m.count} reviews on Flipkart under ${whose} have the review screenshot's words, so which one is the user's could not be told.`], then: "Ask the user for the review's link, or check by hand which review is the user's." };
    if (m.how === 'otherName') return { type: 'reviewerNotMatching', says: [`The review screenshot's words match ${many(m.count, 'a review', `${m.count} reviews`)} on Flipkart under another name, ${quoted(m.review?.name ?? '', 40)}, not under ${whose}, ${quoted(m.name.name ?? '', 40)}.`], then: whoseCheck };
    if (m.how === 'noName') return { type: 'reviewerNotMatching', says: [`The review screenshot's words match ${many(m.count, 'a review', `${m.count} reviews`)} on Flipkart that ${many(m.count, 'shows', 'show')} no name ("Flipkart Customer"), so whose review it is could not be checked.`], then: whoseCheck };
    if (m.how === 'noNameToCheck') return { type: 'reviewerNotMatching', says: [`The review screenshot's words match ${many(m.count, 'a review', `${m.count} reviews`)} on Flipkart, but there is no reviewer's name on the review screenshot or in the sheet to check ${many(m.count, 'it', 'them')} with.`], then: whoseCheck };
    if (m.how === 'noWords') return { type: 'somethingElse', says: ['The review screenshot shows no words to look for on Flipkart.'], then: 'Open it by hand.' };
    const among = reviewsReadSaid(g);
    // Kept from an earlier reading, but not among today's reviews though they reach back to its day: it may have been removed.
    if (m.how === 'gone') {
      const r = m.review;
      const posted = r.date && r.date === r.dateLatest ? ` (${dayFirst(r.date)})` : '';
      return { type: 'reviewNotLive', says: [`The review was on Flipkart when it was last seen there, on ${dayFirst(r.lastSeen)}, but it is not among ${among}, though they reach back to the day it was posted${posted}, so it may have been removed from Flipkart.`], then: 'A staff member must check whether the review is still on Flipkart.' };
    }
    // Not found: the most telling reason first.
    const day = result.reviewsFrom?.day ?? null;
    const what = result.reviewsFrom?.from === 'order' ? 'placed' : 'delivered';
    const hidden = g.end === 'last page' && Number.isInteger(g.total) && g.total > (g.reviews ?? []).length;
    const oldest = result.flipkart?.oldest ?? null;
    // The order is older than the oldest review read: the review may be among older ones, which Flipkart does not show, or which were not read.
    const isOlder = Boolean(oldest && day && day < oldest && (g.end !== 'last page' || hidden));
    const maybe = hidden ? 'the review may be among the older ones Flipkart does not show' : 'the review may be among older reviews not read yet';
    const reasons = [
      m.before ? `${m.before === 1 ? 'The only review' : `The ${m.before} reviews`} on Flipkart with the review screenshot's words under ${whose} ${many(m.before, 'was', 'were')} posted before ${dayFirst(day)}, the day the order was ${what}, so ${many(m.before, 'it does', 'they do')} not count for this order.` : null,
      v.tab === 'published' ? `The review screenshot shows the review on the Published tab of My Reviews, yet it is not among ${among}.` : null,
      v.form ? `The review screenshot shows the review being written, and it is not among ${among}, so it may not have been posted.` : null,
      isOlder ? `The review is not among ${among}, and the order was ${what} on ${dayFirst(day)}, before the oldest of them, so ${maybe}.` : null,
      `The review is not among ${among}.`,
    ].filter(Boolean);
    const first = reasons[0];
    const keptN = result.flipkart?.kept ?? 0;
    const notes = [
      isOlder && !first.includes(maybe) ? `The order was ${what} on ${dayFirst(day)}, before the oldest of ${among}, so ${maybe}.` : null,
      // Flipkart's list ending before the campaign's start date, with both days.
      listEndedSaid(g),
      keptN ? `The ${keptN === 1 ? 'review' : `${keptN} reviews`} posted since ${dayFirst(result.flipkart.start)} that ${keptN === 1 ? 'was' : 'were'} kept on this computer from earlier readings ${keptN === 1 ? 'was' : 'were'} searched too.` : null,
      m.nameOnly ? `${many(m.nameOnly, 'A review', `${m.nameOnly} reviews`)} under ${whose} ${many(m.nameOnly, 'is', 'are')} there, but ${many(m.nameOnly, 'its', 'their')} words do not match.` : null,
    ];
    return { type: 'reviewNotLive', says: [first, ...notes].filter(Boolean), then: m.before ? 'A staff member must check whether that review is for this order.' : 'It may not be public yet.' };
  }

  /** The full day a review screenshot clearly shows, its day, month and year ("12 Sep, 2026"), as YYYY-MM-DD; null for a date with no day or year ("Sep, 2026", "3 days ago"), or a screenshot not read clearly. */
  function shotDay() {
    const v = result.review;
    const t = String(v?.dateText ?? '').replace(/\s+/g, ' ').trim();
    if (!v?.ok || !/^\d{1,2} [a-z]{3,9},? \d{4}$/i.test(t)) return null;
    const d = dateFromWords(t, indiaDay(now()));
    return d?.date && d.date === d.latest ? d.date : null;
  }
  /**
   * What came before the day the row's campaign started (startDay), for
   * Possible misuse: the day the order was placed (on the purchase
   * screenshot), the day it was delivered (on the delivery screenshot), and
   * when the review on the review screenshot was posted on Flipkart (found, or
   * found only before the day the order was delivered), each only when it
   * surely came before that day; and, when the review is not found on
   * Flipkart, the full date the review screenshot clearly shows (shotDay),
   * when it came before that day. -> { start, placed, delivered, posted: {
   * date, dateLatest, dateSaid }, shot, says (the reason: words that follow
   * "because") }, or null when nothing came before it, or the campaign has no
   * start date.
   */
  function misuseOf() {
    const product = boughtProduct();
    const begun = startDay(product ?? {});
    if (!begun) return null;
    const today = indiaDay(now());
    const placed = orderDay(today);
    const delivered = dayOf(daysRead.delivery, today);
    const m = seven.m;
    const r = m?.how === 'found' || m?.how === 'gone' ? m.review : m?.how === 'notFound' ? m.earlier : null;
    const out = { start: begun, placed: placed && placed < begun ? placed : null, delivered: delivered && delivered < begun ? delivered : null, posted: r?.dateLatest && r.dateLatest < begun ? { date: r.date ?? null, dateLatest: r.dateLatest, dateSaid: r.dateSaid ?? null } : null, shot: null };
    // Not found on Flipkart: the day the review screenshot shows, when it is a full date before the start date.
    const shown = !out.posted && m?.how !== 'found' && m?.how !== 'gone' ? shotDay() : null;
    if (shown && shown < begun) out.shot = shown;
    if (!out.placed && !out.delivered && !out.posted && !out.shot) return null;
    const p = out.posted;
    const when = !p ? null : p.date === p.dateLatest ? `on ${dayFirst(p.date)}` : `${p.dateSaid ? quoted(p.dateSaid, 30) : 'on a day not shown'} (by ${dayFirst(p.dateLatest)} at the latest)`;
    const parts = [out.placed ? `the purchase screenshot shows the order was placed on ${dayFirst(out.placed)}` : null, out.delivered ? `the delivery screenshot shows ${out.placed ? 'it' : 'the order'} was delivered on ${dayFirst(out.delivered)}` : null, p ? `the review on Flipkart was posted ${when}` : null, out.shot ? `the review screenshot shows the review was posted on ${dayFirst(out.shot)}` : null].filter(Boolean);
    const campaign = named.length ? theCampaign : 'the campaign';
    return { ...out, says: `${joinAnd(parts)}, ${['', 'before', 'both before', 'all before'][parts.length]} ${campaign} started on ${dayFirst(begun)}` };
  }

  /** What a duplicate's Note says after its reason, as on Amazon: anything else known to be missing (not the cell it shares), then the later rows that share something with it. */
  function duplicateRest() {
    const rw = reviewCell(row, had);
    const subject = { 2: 'order', 3: 'order', 4: 'delivery', 5: 'delivery', 6: rw, 7: rw }[duplicate.step];
    const missing = [];
    for (const which of ['order', 'delivery', rw].filter((w) => had[SHOT_COLUMN[w]])) {
      if (which === subject) continue;
      const c = row.shots?.[which] ?? {};
      if (!c.links?.length && !c.picture) missing.push(`the ${CELL_WORDS[which]} (${c.text ? `the cell says ${quoted(c.text, 30)}` : 'the cell is empty'})`);
      else if ((current.pictures[which] ?? []).length && current.pictures[which].every((p) => p.problem)) missing.push(`the ${WHAT[which]}, which could not be opened`);
    }
    return [missing.length ? `Also missing: ${joinAnd(missing)}.` : null, ...afterWhy];
  }

  /** Writes the row's Status, Type and Note: the Note starts with the Status and its reason, then says the rest once. */
  function writeResult(final, typeKey, reason, rest) {
    result.final = final;
    result.typeKey = typeKey;
    result.type = typeWord(typeKey);
    result.status = FINAL_WORDS[final];
    result.finalSays = clean(finalSentence(final, reason));
    result.note = noteOf([...new Set([result.finalSays, ...rest].filter(Boolean))]);
  }

  /**
   * Step 10: the Status, Type and Note, with the Amazon checker's words and
   * rules: the screenshots' problems first, in the Amazon order (the first
   * that fails the transaction gives the Status, else the first of all), then
   * the review's own failing problem (none given, a wrong link, Flipkart not
   * accepting it), then what the review's steps found for a staff member; one
   * sentence for each other problem. Pass only when nothing stopped it.
   */
  function statusStep(n) {
    start(n, 'Writing the Status, Type and Note');
    // A duplicate, as on Amazon: what it shares and which row is the one checked, then anything else known to be missing.
    if (duplicate) {
      writeResult('fail', 'duplicate', `it is a duplicate: ${lowerFirst(duplicate.line)}`, duplicateRest());
      return finish(n, 'fail', `${result.status}: ${result.type}.`);
    }
    // Something that went wrong on this computer while the duplicates were looked for or the screenshots were read is said first; in a later step, it is the review's problem.
    const trouble1 = trouble && trouble.n <= 5 ? trouble : null;
    const review = trouble && trouble.n > 5 ? { type: 'somethingElse', says: [trouble.says], then: trouble.then } : reviewProblem();
    const failing = problems.find((p) => p.final === 'fail');
    const reviewFails = Boolean(review && TYPE_FINAL[review.type] === 'fail');
    /** The review's problems, one sentence each, said after a screenshot's; not that the product bought could not be told, which only follows from the screenshot's. */
    const reviewSaid = [seven.skip === 'noProduct' ? null : review?.says[0], ...flags.map((f) => f.says)];
    // The review, or the order on its screenshots, before the campaign's start date: Possible misuse, unless a problem fails the row.
    const misuse = misuseOf();
    result.misuse = misuse ? { start: misuse.start, placed: misuse.placed, delivered: misuse.delivered, posted: misuse.posted, shot: misuse.shot } : null;
    const misuseSaid = misuse ? `${cap(misuse.says)}.` : null;
    let final;
    let typeKey;
    let reason;
    let rest;
    // What step 9 found that matches is said only when the Status comes from the review, or for a Pass: after a screenshot's problem, only problems are said.
    let reviewTold = false;
    if (failing) {
      final = 'fail';
      typeKey = failing.type;
      reason = reasonOf(failing);
      rest = [...detailOf(failing), ...problems.filter((p) => p !== failing).map(problemSaid), misuseSaid, trouble1?.says, ...reviewSaid];
    } else if (reviewFails) {
      final = 'fail';
      typeKey = review.type;
      reason = lowerFirst(review.says[0]);
      rest = [...review.says.slice(1), ...problems.map(problemSaid), misuseSaid, trouble1?.says];
    } else if (misuse) {
      final = 'manual';
      typeKey = 'possibleMisuse';
      reason = misuse.says;
      rest = ['A staff member must check whether this order can count for the campaign.', trouble1?.says, ...problems.map(problemSaid), ...reviewSaid];
    } else if (trouble1) {
      final = 'manual';
      typeKey = 'somethingElse';
      reason = lowerFirst(trouble1.says);
      rest = [trouble1.then, ...problems.map(problemSaid), ...reviewSaid];
    } else if (problems.length) {
      const main = problems[0];
      final = 'manual';
      typeKey = main.type;
      reason = reasonOf(main);
      rest = [...detailOf(main), ...problems.slice(1).map(problemSaid), ...reviewSaid];
    } else if (review) {
      final = TYPE_FINAL[review.type] ?? 'manual';
      typeKey = review.type;
      reason = lowerFirst(review.says[0]);
      rest = [...review.says.slice(1), review.then, ...flags.map((f) => f.says), SHOTS_MATCH];
      reviewTold = true;
    } else if (flags.length) {
      final = 'manual';
      typeKey = flags[0].type;
      reason = lowerFirst(flags[0].says);
      rest = [flags[0].then, ...flags.slice(1).map((f) => f.says), SHOTS_MATCH];
      reviewTold = true;
    } else {
      reviewTold = true;
      final = 'pass';
      typeKey = ratingOnly ? 'ratingOnly' : 'verified';
      const what = result.reviewsFrom?.from === 'order' ? 'placed' : 'delivered';
      // A review kept from an earlier reading that today's reading does not reach back to: as it was when last seen.
      const lastSeen = result.found?.kept ? result.found.lastSeen : null;
      reason = ratingOnly ? 'the purchase screenshot and the delivery screenshot match the form, and the review screenshot shows a star rating with no written words' : lastSeen ? `the purchase screenshot and the delivery screenshot match the form, and the review was on Flipkart under the user's name when it was last seen there, on ${dayFirst(lastSeen)}, with the review screenshot's words, posted on or after the day the order was ${what}` : `the purchase screenshot and the delivery screenshot match the form, and the review is live on Flipkart under the user's name, with the review screenshot's words, posted on or after the day the order was ${what}`;
      rest = [];
    }
    // A row with no campaign for its brand was compared with its product name in the sheet, and its Note says so, as on Amazon.
    const bySheetName = had.product && !byCampaign && SHOTS.some((w) => shot[w]?.state === 'read');
    const saidNoCampaign = [reason, ...rest].some((t) => /no (?:live )?campaign/.test(String(t ?? '')));
    const sheetNameSaid = !bySheetName ? null : campaigns.length ? `${cap(joinAnd(campaigns.map((c) => `the campaign "${clean(c.name)}"`)))} ${campaigns.length > 1 ? 'have' : 'has'} no product read from Flipkart, so the product was compared with the product name in the sheet.` : saidNoCampaign ? 'The product was compared with the product name in the sheet.' : "There is no campaign for this product's brand, so the product was compared with the product name in the sheet.";
    const flagged = new Set(flags.map((f) => f.says));
    writeResult(final, typeKey, reason, [...rest, ...judgeNotes, ...(reviewTold ? reviewNotes.filter((t) => !flagged.has(t)) : []), ...warnings, sheetNameSaid, ...afterWhy]);
    return finish(n, final === 'pass' ? 'pass' : 'fail', `${result.status}: ${result.type}.`);
  }

  emit({ event: 'started', checkId, steps: STEP_NAMES, rowId: row.id, row: row.row ?? null, name: result.name });
  try {
    for (let n = 1; n <= STEP_NAMES.length; n++) {
      // A duplicate is not checked further, as on Amazon: the steps after the one that found it are not run, and the last gives its Status.
      if (duplicate && n < STEP_NAMES.length) {
        const s = result.steps[n - 1];
        if (s.state === 'waiting') {
          Object.assign(s, { state: 'not-reached', detail: `Step ${duplicate.step} found that this row is a duplicate, so this step was not run.` });
          emit({ event: 'step', step: { ...s } });
        }
        continue;
      }
      const which = n === 6 ? reviewCell(row, had) : OPENS[n];
      if (n === 1) await step(n, () => duplicatesStep(n));
      else if (which) await step(n, () => openShot(n, which));
      else if (READS[n]) await step(n, () => readShot(n, READS[n]));
      else if (n === 7) await step(n, () => readReviewStep(n, reviewCell(row, had)));
      else if (n === 8) await step(n, () => findReviewStep(n));
      else if (n === 9) await step(n, () => compareStep(n));
      else await step(n, () => statusStep(n));
      // Both screenshots read: their problems are judged at once, as on Amazon, and their steps say what the judging found.
      if (n === 5 && !duplicate) await step(5, () => judgeShots());
    }
  } catch (err) {
    if (err instanceof Stopped) result.stopped = true;
    else if (!(err instanceof Paused)) throw err;
  }
  // A Status even when writing it went wrong on this computer: a staff member looks.
  if (!result.paused && !result.stopped && !result.final) writeResult('manual', 'somethingElse', lowerFirst(trouble?.says ?? `Something went wrong on this computer while ${STEP_DOING[9]}`), [trouble?.then ?? 'Check this row again.']);
  // The sheet and the two screenshots side by side, as the Amazon checker's comparison table shows them.
  result.comparison = buildComparison(result);
  result.finishedAt = now().toISOString();
  result.seconds = Math.max(0, Math.round((Date.now() - began) / 1000));
  if (result.paused) say(`Paused: ${result.paused.says}`);
  else if (!result.stopped) say(`Done: ${result.status} (${result.type})`);
  emit({ event: 'done', result });
  return result;
}

/**
 * The comparison table, as on the Amazon screen (amazon/check.js
 * buildComparison): Field, Sheet, Purchase screenshot, Delivery screenshot,
 * Result. For the details compared, each screenshot shows what it read and
 * whether that is the same as the sheet, different or not shown; then whether
 * the delivery screenshot says Delivered. ok is true, false, or null for "not
 * compared". Only the details the file has a column for are in it
 * (r.compared), and only the screenshots it has (r.shotsHad). The Amazon
 * table's column for what was found on Amazon, and its rows for the review,
 * come with the review's steps.
 */
export function buildComparison(r) {
  const s = r.sheet ?? {};
  const shots = { order: r.order, delivery: r.delivery };
  const had = Array.isArray(r.shotsHad) ? SHOTS.filter((w) => r.shotsHad.includes(w)) : SHOTS;
  const compared = Array.isArray(r.compared) ? r.compared : DETAILS;
  const rows = [];
  const add = (field, sheet, order, delivery, result, ok) => rows.push({ field, sheet: sheet || '', order: order || '', delivery: delivery || '', result, ok });
  const stateOf = (w, k) => (!shots[w] ? 'unread' : shots[w].ok === false ? 'unreadable' : shots[w].details?.[k]?.state ?? 'unread');
  const cell = (w, k) => {
    const state = stateOf(w, k);
    if (state === 'unread') return 'Not read';
    if (state === 'unreadable') return 'Could not be read';
    const v = shots[w].details[k];
    if (state === NOT_SHOWN) return v.part ? `Not shown in full: "${v.part}"` : 'Not shown';
    // A campaign's product is named by the start of its real name.
    if (k === 'product' && v.campaign) return `${state === 'same' ? "One of the campaign's products" : "Not one of the campaign's products"}: "${shortName(v.product?.short ?? v.shown ?? '')}"`;
    const shown = k === 'product' ? `"${v.shown ?? ''}"` : k === 'amount' && v.label ? `${v.shown}, ${v.label}` : v.shown;
    return state === 'same' ? `The same: ${shown}` : state === 'different' ? `Different: ${shown}` : shown;
  };
  const byCampaign = [r.order, r.delivery].some((x) => x?.details?.product?.campaign);
  const verdict = (k) => {
    const all = had.map((w) => ({ w, state: stateOf(w, k) }));
    const named = (list) => (list.length === 2 ? 'both screenshots' : `the ${WHAT[list[0].w]}`);
    const diff = all.filter((x) => x.state === 'different');
    const same = all.filter((x) => x.state === 'same');
    const hidden = all.filter((x) => x.state === NOT_SHOWN || x.state === 'unreadable');
    if (all.some((x) => x.state === 'shown')) return ['The sheet has none to compare with.', false];
    const campaign = k === 'product' && byCampaign;
    if (k === 'orderId' || k === 'product') {
      const sameSaid = campaign ? "One of the campaign's products" : 'The same';
      if (diff.length) return [campaign ? `Not one of the campaign's products on ${named(diff)}.` : `Different on ${named(diff)}.`, false];
      if (same.length === 2) return [campaign ? "One of the campaign's products on both screenshots." : 'The same on both screenshots.', true];
      if (same.length && same.length === all.length) return [`${sameSaid} on ${named(same)}.`, true];
      if (same.length && hidden.length) {
        // The delivery screenshot need not show the order ID; whether a product shown on one screenshot only is enough is judged with the Status, in a later step.
        const judged = k === 'orderId' ? same.some((x) => x.w === 'order') : null;
        return [`${sameSaid} on ${named(same)}; not shown${hidden.some((x) => shots[x.w]?.details?.[k]?.part) ? ' in full' : ''} on ${named(hidden)}.`, judged];
      }
      if (hidden.length) return [`Not shown on ${hidden.length === 2 ? 'either screenshot' : named(hidden)}.`, false];
      return same.length ? [`The same on ${named(same)}, but the other screenshot was not read.`, false] : ['Not compared.', null];
    }
    if (diff.length) return [`Different on ${named(diff)}.`, false];
    if (same.length) return [`The same on ${named(same)}.`, true];
    // The amount shown on neither screenshot is not compared, and is no problem.
    if (hidden.length === 2) return k === 'amount' ? ['Not shown on either screenshot, so not compared.', null] : ['Not shown on either screenshot.', false];
    return hidden.length ? [`Not shown on ${named(hidden)}.`, null] : ['Not compared.', null];
  };
  for (const [k, field, sheet] of [['orderId', 'Order ID', s.orderId], ['orderDate', 'Order date', s.orderDate], ['amount', 'Amount', s.amount], ['product', 'Product', s.product]].filter(([k]) => compared.includes(k))) {
    const [result, ok] = verdict(k);
    // With a campaign, the product name in the sheet is not compared.
    const said = k === 'product' && byCampaign && sheet ? `${sheet} (not compared: the campaign's products are used)` : sheet;
    add(field, said, cell('order', k), cell('delivery', k), result, ok);
  }
  const d = r.delivery;
  if (had.includes('delivery')) add('Delivered', null, null, !d ? 'Not read' : d.ok === false ? 'Could not be read' : d.delivered ? d.deliveredText : 'Not shown', !d || d.ok === false ? 'Not read.' : d.delivered ? 'The delivery screenshot says Delivered.' : 'It does not say Delivered.', !d || d.ok === false ? null : d.delivered);
  return rows;
}
