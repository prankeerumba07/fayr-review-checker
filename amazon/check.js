// The check for one row, in ten steps a person can watch, the way staff check
// a row by hand. Duplicates are found first. Then both screenshots are opened
// and read, every time they can be, even when the first one already has a
// problem: on each, the order ID, the order date, the amount and the product
// are compared with the row in the sheet (what the user gave in the form),
// and each is the same, different or not shown. The product is compared with
// the products of the live campaigns the row uses (their brand is in its
// product name), by their real names read from Amazon; a row with no live
// campaign for its brand is compared with its product name in the sheet. The
// delivery screenshot must also say Delivered. A detail that is not shown, or could not be read, is
// never called different and never passes. Only when both screenshots pass
// is the review link opened in the Live Amazon Browser and the review looked
// for in the product's public reviews; that part stops at its first problem.
// The Type is the first problem in a fixed order (RANK). The Note says it in
// two or three short sentences, with one more for each other problem; the
// full detail is in the comparison table on the row's page. Pictures are
// read on this computer. A login page, a robot check or a block pauses the
// check: the row gets no result, and nothing is got around. Every row checked
// gets one Status (final.js): Pass, Fail or Needs Manual Staff Checking, and
// its Note starts with one sentence giving it and its reason. Of the rows
// that share an order ID, a screenshot or a review, only the first (nearest
// the top) is checked; the later ones are duplicates.
// A file may have fewer columns: an order date, amount or product name it
// does not have is not compared (never a problem, never said to match); no
// purchase or delivery screenshot column needs a staff member, since that
// proof cannot be seen. A review link that is not a link to one review (or
// is empty, or words) has the row's review screenshot read instead, the way
// a picture in the review link cell is read.

import { join } from 'node:path';
import { reviewLinkKind, isAmazonIn, isWriterOnlyPage, reviewIdFrom, asinFrom, productPageUrl, reviewSearchUrl, seeAllReviewsUrl, parseUrl, linkKey, reviewPageUrl } from './links.js';
import { overlapScore, compareNames, nameReadAs, rareWords, wordsOf, productWords, sameName, isHiddenName, starsLine, cleanName } from './text.js';
import { whatPageIs, findReview, textReview, reviewParts, reviewedProduct } from './page-read.js';
import { fingerprintDistance, SAME_SCREENSHOT } from './image-read.js';
import { sameDay, dayNear, amountMatch, totalShown, partialOrderId, rupees, productShown, holdsWord, dayFirst, nameStartShown, enoughOfName, nameLineStarting, brandWordsAtStart, sameStart, nameCouldBe, firstPhrase } from './screen-text.js';
import { typeWord } from './settings.js';
import { shortName } from './campaigns.js';
import { excerpt, quoted, joinAnd, rowName, rowsNamed, noteOf, clean } from './notes.js';
import { FINAL_WORDS, TYPE_FINAL, finalSentence, lowerFirst, oneDigitOff, dateOneDigitOff, amountOneDigitOff } from './final.js';

export const STEP_NAMES = [
  'Duplicates and links in the sheet',
  'Opening the purchase screenshot',
  'Reading the purchase screenshot and comparing it with the sheet',
  'Opening the delivery screenshot',
  'Reading the delivery screenshot and comparing it',
  'Opening the review link',
  'Reading the rating and the written words',
  'Opening the product\'s page and "See all reviews"',
  'Searching for the review',
  'Status, Type and Note',
];
export const MAX_SEARCHES = 2;
/** How many pages of ten reviews a search looks through, while each page is full and the review is not on it. */
export const MAX_SEARCH_PAGES = 5;
/** Reviews on one full page of Amazon's reviews. */
const REVIEWS_PER_PAGE = 10;
export const PAUSE_SAYS = {
  signin: 'Amazon logged you out. Log in again in the Live Amazon Browser, then press "Carry on checking".',
  captcha: 'Amazon showed a robot check. This dashboard never answers a robot check. Press "Carry on checking" when you are ready.',
  blocked: 'Amazon refused a page. Wait a while, then press "Carry on checking".',
  'google-out': 'No one is logged in to Google, so the screenshots on Google Drive cannot be downloaded. Press "Log in to Google" in the top bar and log in there, then press "Carry on checking".',
  'google-signin': 'Google asked to log in, so the screenshots on Google Drive cannot be downloaded. Press "Log in to Google" in the top bar and log in there, then press "Carry on checking".',
  'google-robot': 'Google showed a robot check while a screenshot was being downloaded. This dashboard never answers a robot check. Press "Carry on checking" when you are ready.',
  'google-blocked': 'Google Drive refused to give a screenshot just now. Wait a while, then press "Carry on checking".',
};
/** The pauses an Amazon page can cause; the Google ones come from a download (pictures.js). */
const PAUSES = new Set(['signin', 'captcha', 'blocked']);
const WHAT = { order: 'purchase screenshot', delivery: 'delivery screenshot', review: 'review screenshot', reviewShot: 'review screenshot' };
const CELL_WORDS = { order: 'purchase screenshot', delivery: 'delivery screenshot', review: 'review link', reviewShot: 'review screenshot' };
/** The two screenshots, in the order they are checked and named. */
const SHOTS = ['order', 'delivery'];
/** Every cell that holds pictures or links: the two screenshots, the review link and the review screenshot. */
const PICTURE_CELLS = ['order', 'delivery', 'review', 'reviewShot'];
/** Each screenshot's column, as the file's columns are named. */
const SHOT_COLUMN = { order: 'orderShot', delivery: 'deliveryShot' };
/** The columns a file may not have: every one but the order ID. */
const ALL_COLUMNS = { orderDate: true, amount: true, product: true, orderShot: true, deliveryShot: true, reviewShot: true, reviewLink: true };
/** The four details compared on each screenshot, and what a Note calls them. */
const DETAILS = ['orderId', 'orderDate', 'amount', 'product'];
const NOUN = { orderId: 'order ID', orderDate: 'order date', amount: 'amount', product: 'product' };
const NOT_SHOWN = 'not shown';
/** A detail not compared, because the file has no column for it. */
const SKIP = 'skip';
/** How each state of a detail is said on the row's page ("shown": the sheet has nothing to compare it with). */
const STATE_SAID = { same: 'the same', different: 'different', [NOT_SHOWN]: 'not shown', shown: 'not compared, because the sheet has none' };
/**
 * When there are several problems, the Type is the first one in this order:
 * a different order ID, a different product, not delivered, a screenshot that
 * is missing or cannot be opened, a different order date or amount, then a
 * detail that is not shown (that screenshot "not clear").
 */
const RANK = { orderId: 1, product: 2, delivered: 3, open: 4, details: 5, shown: 6 };
/** The first sentence of a Note when both screenshots passed but the review did not. */
const SHOTS_MATCH = 'The purchase screenshot and the delivery screenshot match the form.';
const NAME_ONLY = 'The reviewed product was compared with the product ordered by its name only, because there is no campaign for its brand.';
/** How a name in the sheet and the name on a review are the same, when not word for word. */
const NAME_HOW = { initial: ' (an initial stands for a word)', 'missing word': ' (a name left out)', 'one name': ' (one of its names)', joined: ' (written as one word)', spelling: ' (one letter apart)' };
/** A review's own words, from Amazon or a screenshot: the "Size: …" line and "Verified Purchase" are not the review. */
const reviewWords = (text) =>
  String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(colour|color|size|style|set name|scent name|pattern|capacity|configuration|material|flavou?r)\s*:/i.test(l) && !/^\W*verified purchase\W*$/i.test(l))
    .join('\n');
const cap = (t) => String(t ?? '').charAt(0).toUpperCase() + String(t ?? '').slice(1);
/** A date read from a screenshot, day first: 20-07-2026, or 20-07 when it shows no year. */
const dateWords = (d) => (d?.day ? dayFirst(d.day) : d ? `${String(d.date).padStart(2, '0')}-${String(d.month).padStart(2, '0')}, with no year shown` : '');
/** What an amount on a screenshot is, in plain words. */
const amountLabel = (l) => (!l ? '' : /mrp/i.test(l) ? 'the printed price' : /sub-?total/i.test(l) ? 'the subtotal' : `the ${String(l).toLowerCase()}`);
/** Amounts that can be the order's: never a delivery charge, money taken off or a printed price, nor a number alone on a line (it counts only when it is the form's). */
const usableAmounts = (amounts) => (amounts ?? []).filter((a) => !a.skip && !a.lone && a.label !== 'mrp');
/** The amount to name when none is the sheet's: a total first, then a price, then a subtotal. */
function amountToName(list) {
  const rank = (l) => (!l ? 4 : /grand total|order total|total amount|amount paid|you paid/.test(l) ? 0 : /sub/.test(l) ? 3 : /total|paid/.test(l) ? 1 : /price/.test(l) ? 2 : 4);
  return [...list].sort((a, b) => rank(a.label) - rank(b.label))[0];
}
/**
 * The dates on a screenshot that can be the order's: on the purchase
 * screenshot, those marked as the order's, else any not about the delivery;
 * on the delivery screenshot, only those marked as the order's (its own date
 * is the delivery's).
 */
function orderDates(which, dates) {
  const all = dates ?? [];
  const marked = all.filter((d) => d.labelled);
  if (which === 'delivery' || marked.length) return marked;
  return all.filter((d) => !d.delivery);
}
/** A product's name cut short on the screen: "Test Brand Monthly Home Cleani...". */
const cutShort = (t) => /\.\.\.|…/.test(String(t ?? ''));

/** A row's place, for sorting rows into "the first one" and "the later ones". */
const rank = (r) => [r.source === 'sheet' ? 0 : 1, r.source === 'sheet' ? r.row ?? 0 : r.hand ?? 0, String(r.createdAt ?? '')];
function before(a, b) {
  const x = rank(a);
  const y = rank(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}

class Stopped extends Error {}
class Paused extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

/**
 * A cell's picture problem: its Type, the sentence that says what happened,
 * the reason, and what to do next. `says` follows "but".
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

/** True when two cells read the same: the same order IDs, or (with none shown) almost all the same words. */
export function sameWords(a, b) {
  if (!a || !b) return false;
  const x = a.orderIds ?? [];
  const y = b.orderIds ?? [];
  if (x.length || y.length) return x.length > 0 && x.length === y.length && x.every((id) => y.includes(id));
  if (wordsOf(a.text).length < 5 || wordsOf(b.text).length < 5) return false;
  const one = overlapScore(a.text, b.text);
  const two = overlapScore(b.text, a.text);
  return one !== null && two !== null && one >= 0.9 && two >= 0.9;
}

/**
 * Other rows' pictures that are this row's: { order: [{ o, which }], delivery: [...], review: [...] }.
 * With `reading` null, only the very same file (the same bytes) counts. With
 * `reading` { which, read } for a cell just read, a picture whose fingerprint
 * is this close counts too, but only when its words, read when its row was
 * checked, are the same: two orders' screenshots of one product look almost
 * the same, and only their words tell them apart.
 */
export function samePictures(row, others, reading) {
  const out = { order: [], delivery: [], review: [], reviewShot: [] };
  const cells = reading ? [reading.which] : PICTURE_CELLS;
  for (const which of cells) {
    for (const pic of row.pictures?.[which] ?? []) {
      if (!pic.file) continue;
      for (const o of others) {
        if (out[which].some((h) => h.o === o)) continue;
        for (const ow of PICTURE_CELLS) {
          const hit = (o.pictures?.[ow] ?? []).some((op) => {
            if (!op.file) return false;
            if (pic.sha256 && op.sha256 === pic.sha256) return true;
            if (!reading) return false;
            const dist = fingerprintDistance(pic.fingerprint, op.fingerprint);
            return dist !== null && dist <= SAME_SCREENSHOT && sameWords(reading.read, o.seen?.[ow]);
          });
          if (hit) {
            out[which].push({ o, which: ow });
            break;
          }
        }
      }
    }
  }
  return out;
}

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url ?? '');
  }
}

/**
 * Other rows' pictures that look like this cell's (a fingerprint this close)
 * and whose words were read when their row was checked: the ones worth reading
 * this cell for, to tell the same picture from one that only looks the same.
 */
export function lookAlikes(row, others, which) {
  const out = [];
  for (const pic of row.pictures?.[which] ?? []) {
    if (!pic.file || !pic.fingerprint) continue;
    for (const o of others) {
      for (const ow of PICTURE_CELLS) {
        if (!o.seen?.[ow]) continue;
        if ((o.pictures?.[ow] ?? []).some((op) => op.file && op.sha256 !== pic.sha256 && (fingerprintDistance(pic.fingerprint, op.fingerprint) ?? 1) <= SAME_SCREENSHOT)) out.push({ o, which: ow });
      }
    }
  }
  return out;
}

/** What each step was doing, for "Something went wrong on this computer while …". */
const STEP_DOING = [
  'looking for duplicates and links in the sheet',
  'opening the purchase screenshot',
  'reading the purchase screenshot',
  'opening the delivery screenshot',
  'reading the delivery screenshot',
  'opening the review link',
  'reading the rating and the written words',
  "opening the product's page",
  'searching for the review',
  'writing the Status, Type and Note',
];

/**
 * Run one row's check.
 *   row — the row as kept (store.js); others — every other row
 *   settings — the settings file
 *   campaigns — the live campaigns the row uses (campaigns.js campaignsFor): { name, brand, products: [{ asin, name, short, variants }] }
 *   has — the columns the file has: { orderDate, amount, product, orderShot, deliveryShot, reviewShot, reviewLink }, each true unless false
 *   pictures(which) — that cell's pictures, downloading again any that could not be had: { files, problems, records }
 *   readOrder(files), readDelivery(files), readReview(files) — what each picture says (shot-read.js)
 *   browser — begin(), open(url, {onWait}), scrollToReviews(), shot(file), isOpen(), savePage(file)
 *   emit(event) — started, action, step and done lines for the screen
 *   pagesDir — where to keep a copy of each Amazon page opened, or null
 */
export async function runCheck({ row, others = [], settings, campaigns = [], has = null, reviewer = null, pictures, readOrder, readDelivery, readReview, browser, emit = () => {}, signal = null, checkId, shotsDir = null, pagesDir = null, now = () => new Date() }) {
  const mark = settings.passingMarks.productNameShare;
  const tolerance = settings.passingMarks.amountDifferenceRupees;
  /** Up to this many rupees of Amazon's fees may be missing from a screenshot that shows no total. */
  const allowance = settings.passingMarks.feeAllowanceRupees ?? 0;
  /** The columns the file has; a detail with no column is not compared at all. */
  const had = { ...ALL_COLUMNS, ...Object.fromEntries(Object.entries(has ?? {}).map(([k, v]) => [k, v !== false])) };
  const compared = DETAILS.filter((k) => k === 'orderId' || had[k]);
  const sheetId = row.orderId?.value ?? '';
  const sheetIdText = row.orderId?.text ?? '';
  const sheetDay = row.orderDate?.value ?? null;
  const sheetAmount = Number.isFinite(row.amount?.value) ? row.amount.value : null;
  const label = row.product?.text ?? '';
  /** The products of the live campaigns this row uses, by their real names from Amazon; none when it uses no campaign. */
  const campaignProducts = campaigns.flatMap((c) => (c.products ?? []).map((p) => ({ ...p, lead: brandWordsAtStart(p.name, c.brand) })));
  const byCampaign = campaignProducts.length > 0;
  const named = campaigns.filter((c) => c.products?.length);
  /** "the campaign "Koparo Clean"", or "the campaigns "A" and "B"". */
  const theCampaign = `the campaign${named.length > 1 ? 's' : ''} ${joinAnd(named.map((c) => `"${clean(c.name)}"`))}`;
  /** Every ASIN of the campaigns' products, and of the other colours and sizes they list. */
  const campaignAsins = new Set(campaignProducts.flatMap((p) => [p.asin, ...(p.variants ?? [])]).filter(Boolean));
  const result = {
    checkId,
    rowId: row.id,
    row: row.row ?? null,
    n: row.n ?? null,
    hand: row.hand ?? null,
    name: rowName(row),
    // Rows are named by their number on the dashboard, from 1 (a check made before said the sheet's row instead).
    numbered: true,
    startedAt: now().toISOString(),
    finishedAt: null,
    status: null,
    type: null,
    typeKey: null,
    note: null,
    final: null,
    finalSays: null,
    steps: STEP_NAMES.map((name, i) => ({ n: i + 1, name, state: 'waiting', detail: null, shot: null })),
    sheet: {
      orderId: sheetIdText,
      orderDate: row.orderDate?.text ?? '',
      orderDay: sheetDay,
      amount: row.amount?.text ?? '',
      amountValue: row.amount?.value ?? null,
      product: label,
      reviewLink: row.shots?.review?.link ?? '',
    },
    order: null,
    delivery: null,
    reviewPicture: null,
    amazon: null,
    productPage: null,
    publicReview: null,
    // What was compared, and the screenshots the file has: the comparison shows only those.
    compared,
    shotsHad: SHOTS.filter((w) => had[SHOT_COLUMN[w]]),
    comparison: [],
    reviewId: null,
    liveAt: null,
    alsoDuplicate: [],
    paused: null,
    stopped: false,
  };
  /** Sentences near the end of the Note that are not a Type: a screenshot of several that could not be opened, a delivery before the order. */
  const warnings = [];
  /** The sentence for a cell whose written link is not the link it opens. */
  const mismatchSaid = [];
  /** Sentences that end the Note: the later rows that share something with this one, the first. */
  const afterWhy = new Set();
  /** What was read from each cell's pictures, kept with the row so later checks can tell the same picture from one that only looks the same. */
  const seen = {};
  /** This row's pictures as they are now: a picture downloaded again during the check replaces the one that could not be had. */
  const current = { ...row, pictures: Object.fromEntries(PICTURE_CELLS.map((w) => [w, [...(row.pictures?.[w] ?? [])]])) };
  const reviewCell = row.shots?.review ?? {};
  const reviewShotCell = row.shots?.reviewShot ?? {};
  /** The row has a review screenshot: read when its review link is not a link to one review. */
  const reviewShotThere = had.reviewShot && Boolean(reviewShotCell.links?.length || reviewShotCell.picture);
  /** Which cell's picture shows the review: the review link cell's, or the review screenshot's. */
  let reviewWhich = 'review';
  const reviewKind = reviewCell.picture ? { kind: 'picture' } : reviewCell.links?.length ? reviewLinkKind(reviewCell.link) : { kind: 'none' };
  const reviewIsPicture = ['picture', 'drive', 'web'].includes(reviewKind.kind);
  const say = (says) => emit({ event: 'action', says });
  const onWait = (ms) => say(`Waiting ${Math.ceil(ms / 1000)} seconds before the next Amazon page`);
  const partial = () => ({ order: result.order, delivery: result.delivery, reviewPicture: result.reviewPicture, amazon: result.amazon, productPage: result.productPage, publicReview: result.publicReview });
  const checkStop = () => {
    if (signal?.aborted) throw new Stopped();
  };
  // { type, says, then, step } for a problem at one step; { type: 'duplicate', line, why, step }; or { type, problems, step: 5 } for the screenshots' problems.
  let outcome = null;
  let browserOpen = false;
  /** True when one of these rows is nearer the top than this one, so this row is the later one: a duplicate. */
  const later = (group) => group.some((o) => before(o, row));
  /** A duplicate's first sentence: "This transaction failed because it is a duplicate: …". */
  const duplicateSays = (line) => finalSentence('fail', `it is a duplicate: ${lowerFirst(line)}`);
  /** Another row this check makes Duplicate, with its own Note, which says which row is the one checked. */
  const alsoDuplicate = (o, line) => {
    if (!result.alsoDuplicate.some((d) => d.id === o.id)) result.alsoDuplicate.push({ id: o.id, note: noteOf([duplicateSays(line)]), final: 'fail', finalSays: duplicateSays(line) });
  };
  /** The row nearest the top of the sheet among some rows. */
  const firstOf = (list) => [...list].sort((a, b) => (before(a, b) ? -1 : 1))[0];
  /** "which was already checked", or "and row 20 is the one that will be checked". */
  const firstSaid = (first) => (first.last ? 'which was already checked' : `and ${rowName(first)} is the one that will be checked`);
  /** The sentences that end the first row's Note: which later rows share it, and that they were not checked. */
  const laterSaid = (what, rows) => afterWhy.add(`The same ${what} is also in ${rowsNamed(rows)}. ${rows.length === 1 ? 'That row is a duplicate and was' : 'Those rows are duplicates and were'} not checked.`);
  /** This row shares a picture with rows nearer the top, so it is the later one: Duplicate of the first. */
  async function samePictureStop(n, which, hits) {
    const first = firstOf(hits.map((x) => x.o).filter((o) => before(o, row)));
    const h = hits.find((x) => x.o === first) ?? hits[0];
    return dup(n, `The ${WHAT[which]} in this row is the same picture as the ${WHAT[h.which]} in ${rowName(h.o)}, ${firstSaid(h.o)}.`, `two different orders cannot share one screenshot, so this row is a duplicate and was not checked${h.o.last ? ' again' : ''}`);
  }
  /** The later rows that share this row's picture: this row is the first, so they are Duplicate. */
  function markLater(hits, which) {
    for (const h of hits) alsoDuplicate(h.o, `The ${WHAT[h.which]} in this row is the same picture as the ${WHAT[which]} in ${rowName(row)}, which is the one checked.`);
    laterSaid(WHAT[which], hits.map((h) => h.o));
  }
  /** True when another row's review picture showed Amazon's message refusing a review (what its check read, or the Type it gave). */
  const refusalShown = (o, which) => o.last?.typeKey === 'cannotAddReviews' || Boolean(firstPhrase(String(o.seen?.[which]?.text ?? '').split('\n'), settings.reviewRefusedPhrases));
  /**
   * Of the rows whose picture is this cell's, those that are not the same thing after all (read: what this cell's picture says):
   * Amazon's message refusing a review, sent for two orders of one account, is the same message, not the same review; and a row is never
   * the duplicate of a screenshot that shows its own order and not the other row's: it is that row's screenshot, and the row nearer the
   * top that gave it for another order is told so by its own check (a different order ID). Otherwise the later row is the duplicate.
   */
  function notSame(which, hits, read) {
    if (isReview(which)) {
      if (refusalShown(row, which) || firstPhrase(String(read?.text ?? '').split('\n'), settings.reviewRefusedPhrases)) return [];
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
  /** Once a cell's pictures are read: another row's picture that is the same file, or looks the same and reads the same, is the same picture. */
  async function samePictureAfterReading(n, which, read) {
    const hits = notSame(which, samePictures(current, others, { which, read })[which], read);
    if (!hits.length) return false;
    if (!later(hits.map((h) => h.o))) {
      markLater(hits, which);
      return false;
    }
    await samePictureStop(n, which, hits);
    return true;
  }
  /** A review that is also another row's, by its link or by what that row's check found: the later rows are Duplicate. */
  async function reviewIdDuplicate(n, id) {
    const same = others.filter((o) => (o.last?.reviewId && o.last.reviewId === id) || linkKey(o.shots?.review?.link) === `review:${id}`);
    if (!same.length) return false;
    const laterOnes = same.filter((o) => before(row, o));
    if (laterOnes.length < same.length) {
      const first = firstOf(same.filter((o) => before(o, row)));
      await dup(n, `The review in this row is the same review as in ${rowName(first)}, ${firstSaid(first)}.`, 'two different orders cannot share one review, so this row is a duplicate and was not checked further');
      return true;
    }
    for (const o of laterOnes) alsoDuplicate(o, `The review in this row is the same review as in ${rowName(row)}, which is the one checked.`);
    laterSaid('review', laterOnes);
    return false;
  }

  // A cell's pictures and what they say, fetched and read once.
  const got = {};
  const reads = {};
  const readers = { order: readOrder, delivery: readDelivery, review: readReview, reviewShot: readReview };
  const isReview = (which) => which === 'review' || which === 'reviewShot';
  async function fetchCell(which) {
    if (!got[which]) {
      const g = await pictures(which);
      checkStop();
      // No Google login, or Google's login page, a robot check or a block while downloading: the check pauses here, and nothing is got around.
      if (g?.pause) pauseAt(stepNow, g.pause, `${PAUSE_SAYS[g.pause].split('. ')[0]}. The check paused here, before the ${WHAT[which]} was downloaded; nothing was got around.`);
      got[which] = g;
      if (Array.isArray(g?.records)) current.pictures[which] = g.records;
    }
    checkStop();
    return got[which];
  }
  /** The product a review picture should show: the campaign's product the screenshots show, else the product name in the sheet. */
  const reviewProduct = () => (byCampaign ? shownProduct()?.short ?? label : label);
  async function readCell(which) {
    // A review picture is read for the product it should show, which is known once the screenshots are read.
    const key = isReview(which) ? `${which}:${reviewProduct()}` : which;
    // A screenshot is read again the other ways when it lacks what the form gives: the order ID, the amount, and on the purchase screenshot the product.
    const want = { orderId: sheetId || null, amount: sheetAmount, tolerance, allowance, product: which === 'order' && had.product ? productTold : null };
    if (!reads[key]) reads[key] = await readers[which]((await fetchCell(which)).files, isReview(which) ? { product: reviewProduct(), reviewer } : { want });
    checkStop();
    return reads[key];
  }
  const wordsRead = (which, r) => ({ orderIds: isReview(which) ? [] : r.orderIds ?? [], text: excerpt(r.text, 1500) });

  /** The step running now, for a pause caused by a download. */
  let stepNow = 1;
  /** Pauses the check at step n: the row gets no result, and "Carry on checking" starts it again. */
  function pauseAt(n, kind, detail) {
    result.paused = { kind, says: PAUSE_SAYS[kind], step: n };
    const s = result.steps[n - 1];
    s.state = 'fail';
    s.detail = clean(detail);
    emit({ event: 'step', step: { ...s }, partial: partial() });
    throw new Paused(kind);
  }
  function start(n, action) {
    checkStop();
    stepNow = n;
    const s = result.steps[n - 1];
    s.state = 'running';
    emit({ event: 'step', step: { ...s } });
    say(action ?? STEP_NAMES[n - 1]);
  }
  async function finish(n, state, detail) {
    const s = result.steps[n - 1];
    s.state = state;
    s.detail = detail ? clean(detail) : null;
    if (shotsDir && browserOpen && browser?.isOpen?.()) {
      if (await browser.shot(join(shotsDir, `step-${n}.png`))) s.shot = `/local/amazon/checks/${checkId}/steps/${n}`;
    }
    emit({ event: 'step', step: { ...s }, partial: partial() });
  }
  const pass = (n, detail) => finish(n, 'pass', detail);
  const notNeeded = (n, detail) => finish(n, 'not-needed', detail);
  /** Stops the check at step n with its Type. says: the sentences that name the problem; then: what to do next. */
  async function stop(n, type, says, then = null) {
    const list = [].concat(says).filter(Boolean);
    outcome = { type, says: list, then, step: n };
    await finish(n, 'fail', list.join(' '));
  }
  /** Stops the check as Duplicate: the line that says what this row shares and which row is the one checked, and why that makes it a duplicate (for the step's line). */
  async function dup(n, line, why) {
    outcome = { type: 'duplicate', line, why, step: n };
    await finish(n, 'fail', `${cap(why)}.`);
  }
  async function step(n, fn) {
    if (outcome) return;
    try {
      await fn();
    } catch (err) {
      if (err instanceof Stopped || err instanceof Paused) throw err;
      await stop(n, 'somethingElse', `Something went wrong on this computer while ${STEP_DOING[n - 1]}.`, 'Check this row again.');
    }
  }
  async function amazonPage(url) {
    checkStop();
    const res = await browser.open(url, { onWait });
    checkStop();
    return res;
  }
  async function keepPage(name, res) {
    if (!pagesDir || !browser.savePage || !browser.isOpen() || whatPageIs(res.facts, res.status).kind !== 'page') return;
    try {
      await browser.savePage(join(pagesDir, `${name}.html`));
    } catch {
      // only a copy for test fixtures; the check goes on without it
    }
  }
  async function openBrowser(n) {
    say('Opening the Live Amazon Browser');
    try {
      await browser.begin();
      browserOpen = true;
      return true;
    } catch {
      await stop(n, 'somethingElse', 'The Live Amazon Browser could not be opened on this computer.', 'Close any Chrome window called "Live Amazon Browser", then check this row again.');
      return false;
    }
  }
  /** A page Amazon gave: pauses on a login page, a robot check or a block. */
  async function amazonAnswer(n, res, name) {
    if (!res.ok) {
      await stop(n, 'somethingElse', `The Live Amazon Browser could not open an Amazon page.${res.message ? ` ${res.message}` : ''}`, 'Check this row again.');
      return null;
    }
    await keepPage(name, res);
    const page = whatPageIs(res.facts, res.status);
    if (PAUSES.has(page.kind)) pauseAt(n, page.kind, page.kind === 'signin' ? 'Amazon asked to log in, so the check paused here.' : `${page.why} The check paused here; nothing was got around.`);
    return page;
  }

  // ---- the two screenshots: what each shows of the four details, and their problems ----
  /** Each screenshot as it is after its two steps: { state: 'missing' | 'words' | 'unopened' | 'opened' | 'unreadable' | 'read', … }. */
  const shot = { order: null, delivery: null };
  const formHas = { orderId: Boolean(sheetId), orderDate: Boolean(sheetDay), amount: sheetAmount !== null, product: Boolean(label) };

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
      // The amount named is the one that may be the form's read with a slip (one digit away), when there is one; else a total first.
      const named = usable.find((a) => amountOneDigitOff(a.value, sheetAmount)) ?? amountToName(usable);
      // On the delivery screenshot, an item's price with no total shown is not the order's amount: it is not compared.
      amount = which === 'delivery' && !totalShown(r.amounts) ? { state: NOT_SHOWN, price: rupees(named.value) } : { state: 'different', shown: rupees(named.value), label: amountLabel(named.label) };
    }
    const p = label ? productShown(label, r.texts ?? []) : null;
    const share = p?.share ?? 0;
    let product;
    // A detail whose column the file does not have is not compared.
    if (!had.product) product = { state: SKIP };
    else if (byCampaign) {
      // The picture's own reading tells the product; the words of its other readings only help find the product ordered when it does not
      // (they may hold other things on the screen, such as a browser's tabs, never taken for another product).
      const own = r.lines?.length ? r.lines.map((l) => l.text) : r.texts ?? [];
      product = campaignProductOn(own);
      if (product.state !== 'same' && (r.texts ?? []).length > own.length) {
        const more = campaignProductOn(r.texts);
        if (more.state === 'same') product = more;
      }
    }
    else if (!label) product = { state: 'shown', shown: null };
    else if (share >= mark) product = { state: 'same', shown: p.shown, share };
    // Cut short ("…"): only the start of the name is shown, so it is never called different.
    else if (share > 0 && cutShort(p.shown)) product = { state: NOT_SHOWN, part: p.shown, share };
    // A different product only when a name of three words or more shows half of the product's words, or two of them (the brand and one more).
    else if ((share >= 0.5 || Math.round(share * productWords(p.name ?? label).length) >= 2) && wordsOf(p.shown).length >= 3) product = { state: 'different', shown: p.shown, share };
    else product = { state: NOT_SHOWN, share };
    return { orderId, orderDate: had.orderDate ? orderDate : { state: SKIP }, amount: had.amount ? amount : { state: SKIP }, product };
  }
  /**
   * Which of the campaigns' products a screenshot shows, by its real name from
   * Amazon or the start of it (a name Amazon cut short counts when the part
   * shown is the start of its real name): { state: 'same', shown, product }.
   * 'different' when it shows another product's name starting with the brand;
   * 'not shown' otherwise, with part when too little of a name shows to tell.
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
    // Every campaign product the screenshot shows enough of (an order of several products, or Amazon's suggestions under it): the two screenshots must share one.
    const all = alone ? [hits[0].c] : hits.filter((h) => enoughOfName(h.hit, h.c.lead)).map((h) => h.c);
    if (best?.enough || (best && alone)) return { state: 'same', shown: best.hit.shown, product: { name: best.c.name, short: best.c.short, asin: best.c.asin }, all: all.map((c) => c.asin), campaign: true, start: !best.enough };
    // Another product's name: a line that starts with the brand (or with the first word of a product named without it), and could not be one of the campaign's products read with a slip.
    const other = nameLineStarting(texts, [...campaigns.map((c) => c.brand), ...campaignProducts.filter((c) => !c.lead).map((c) => c.name.split(/\s+/)[0])]);
    const couldBeOurs = other && campaignProducts.some((c) => nameCouldBe(other, c.name, c.lead));
    if (best && (!other || best.hit.shown.includes(other) || couldBeOurs)) return { state: NOT_SHOWN, part: best.hit.shown, campaign: true };
    if (other && couldBeOurs) return { state: NOT_SHOWN, part: other, campaign: true };
    // A name Amazon gives a campaign's product elsewhere (its quick delivery names the Roll-On "Men Pitstick Under Roll-On"): with a word of
    // only one of the campaign's products in it, it may be that product, so it is not called a different one; a staff member looks.
    if (other && ownWordOf(other)) return { state: NOT_SHOWN, part: other, campaign: true };
    if (other) return { state: 'different', shown: other, campaign: true };
    return { state: NOT_SHOWN, campaign: true };
  }
  /** The campaign's product whose own word (one no other of its products has in its name, like "Roll-On" or "Soap") a name holds, when exactly one is. */
  function ownWordOf(name) {
    const brandish = new Set(campaigns.flatMap((c) => productWords(c.brand)));
    const keyWords = (t) => productWords(t).filter((w) => w.length >= 4 && !brandish.has(w));
    const words = new Set(keyWords(name));
    const mine = campaignProducts.filter((c) => keyWords(c.name).some((w) => words.has(w) && !campaignProducts.some((o) => o !== c && keyWords(o.name).includes(w))));
    return mine.length === 1 ? mine[0] : null;
  }
  /** True when some lines tell the product: one of the campaign's products or another product's name, or (with no campaign) the product named in the sheet. */
  const productTold = (texts) => (byCampaign ? campaignProductOn(texts).state !== NOT_SHOWN : !label || (productShown(label, texts)?.share ?? 0) >= mark);
  /** The ASINs of the products bought, as the screenshots show them (the purchase screenshot's, else the delivery screenshot's, with their other colours and sizes); every campaign product's when neither shows one. */
  function boughtAsins() {
    const on = (w) => (shot[w]?.state === 'read' && shot[w].details.product?.state === 'same' ? shot[w].details.product.all ?? [shot[w].details.product.product?.asin] : []);
    const asins = on('order').length ? on('order') : on('delivery');
    if (!asins.length) return campaignAsins;
    return new Set(campaignProducts.filter((c) => asins.includes(c.asin)).flatMap((c) => [c.asin, ...(c.variants ?? [])]));
  }
  /** The campaign's product the screenshots show: the purchase screenshot's, else the delivery screenshot's. */
  const shownProduct = () => shot.order?.details?.product?.product ?? shot.delivery?.details?.product?.product ?? null;
  /** How an amount is the same, when not shown as it is: "with ₹40 of shipping and fees", or "with Amazon's fees not shown". */
  const amountHow = (v) => (v.how === 'with fees' ? ` (${v.shown} with ${rupees(v.parts.filter((p) => p.kind === 'fee').reduce((n, p) => n + p.value, 0))} of shipping and fees${v.parts.some((p) => p.kind === 'off') ? ', less the money taken off' : ''})` : v.how === 'fees not shown' ? ` (${v.shown}, with Amazon's fees not shown)` : '');
  /** "Order ID: the same. Order date: not shown. …", for the step's line on the row's page. */
  const detailWords = (details) =>
    compared
      .map((k) => {
        const v = details[k];
        if (k === 'product' && v.campaign && v.state !== NOT_SHOWN) return `Product: ${v.state === 'same' ? `one of the campaign's products${v.start ? ', by the start of its name' : ''}` : "not one of the campaign's products"}.`;
        if (k === 'orderId' && v.part) return `Order ID: the same (${v.part} of its 17 digits were read).`;
        if (k === 'amount' && v.state === 'same') return `Amount: the same${amountHow(v)}.`;
        if (k === 'amount' && v.price) return `Amount: not shown (${v.price} is an item's price, not the order's total).`;
        return `${cap(NOUN[k])}: ${STATE_SAID[v.state]}.`;
      })
      .join(' ');
  /** A screenshot fails its own step when a detail on it is different, or when the purchase screenshot does not show the order ID or the product; the delivery screenshot need not show them (judged after both are read). */
  const shotFails = (which, details) => details.orderId.state === 'different' || (which === 'order' && details.orderId.state !== 'same') || (had.product && (details.product.state === 'different' || (which === 'order' && details.product.state !== 'same'))) || ['orderDate', 'amount'].some((k) => ['different', 'shown'].includes(details[k].state));

  /** Step 2 or 4: the screenshot's cell, and its pictures downloaded. */
  async function openShot(n, which) {
    start(n, `Opening the ${WHAT[which]}`);
    // No column for it: that proof cannot be seen, so a staff member must check it.
    if (!had[SHOT_COLUMN[which]]) {
      shot[which] = { state: 'no column' };
      return finish(n, 'fail', `The file has no ${WHAT[which]} column.`);
    }
    const s = row.shots?.[which] ?? {};
    if (!s.links?.length && !s.picture) {
      if (which === 'delivery' && s.text && holdsWord(s.text, settings.notDeliveredWords)) {
        shot[which] = { state: 'words', text: s.text };
        return finish(n, 'fail', `The cell says ${quoted(s.text, 60)}, so the order was not delivered.`);
      }
      shot[which] = { state: 'missing', text: s.text ?? '' };
      return finish(n, 'fail', s.text ? `The cell says ${quoted(s.text, 60)} instead of holding a screenshot.` : 'The cell is empty.');
    }
    const g = await fetchCell(which);
    if (!g.files.length) {
      shot[which] = { state: 'unopened', picture: pictureProblem(which, g.problems[0] ?? { kind: 'access', site: null, says: 'it could not be opened' }) };
      return finish(n, 'fail', shot[which].picture.line);
    }
    if (g.problems.length) warnings.push(`${g.problems.length} of the ${g.problems.length + g.files.length} ${WHAT[which]}s could not be opened.`);
    shot[which] = { state: 'opened' };
    return pass(n, `Opened ${g.files.length === 1 ? `the ${WHAT[which]}` : `${g.files.length} ${WHAT[which]}s`}.`);
  }

  /** The first of the settings' not-delivered words ("Cancelled", "Returned", "Lost"…) a screenshot's lines hold, or null. */
  function notDeliveredWord(r) {
    const lines = (r.texts?.length ? r.texts : String(r.text ?? '').split('\n')).map((l) => String(typeof l === 'string' ? l : l?.text ?? ''));
    return (settings.notDeliveredWords ?? []).find((w) => lines.some((l) => holdsWord(l, [w]))) ?? null;
  }
  /** True when a detail that is different on a screenshot is one digit away from the form there: it may be a reading mistake. */
  function oneDigitOn(which, k) {
    const r = reads[which] ?? {};
    if (k === 'orderId') return (r.orderIds ?? []).some((id) => oneDigitOff(id, sheetId));
    if (k === 'orderDate') return orderDates(which, r.dates).some((d) => dateOneDigitOff(d, sheetDay));
    if (k === 'amount') return usableAmounts(r.amounts).some((a) => amountOneDigitOff(a.value, sheetAmount) || (a.alts ?? []).some((v) => amountOneDigitOff(v, sheetAmount)));
    return false;
  }

  /** Step 3 or 5: the screenshot read on this computer, and each detail compared with the sheet. */
  async function readShot(n, which) {
    const was = shot[which]?.state;
    if (was !== 'opened') {
      const why = was === 'unopened' ? `The ${WHAT[which]} could not be opened, so it was not read.` : was === 'words' ? 'The cell holds words, not a screenshot, so there is nothing to read.' : was === 'no column' ? `The file has no ${WHAT[which]} column, so there is nothing to read.` : `There is no ${WHAT[which]} to read.`;
      return finish(n, 'not-reached', why);
    }
    start(n, `Reading the ${WHAT[which]}`);
    const r = await readCell(which);
    const near = (v) => sheetAmount !== null && Number.isFinite(v) && Math.abs(v - sheetAmount) <= tolerance + 1e-9;
    const record = {
      ok: r.ok,
      problem: r.problem ?? null,
      confidence: r.confidence ?? null,
      wordCount: r.wordCount ?? 0,
      hindi: Boolean(r.hindi),
      orderIds: r.orderIds ?? [],
      dates: orderDates(which, r.dates).map(dateWords),
      // A number whose rupee sign was read as a digit is shown as the amount it is.
      amounts: (r.amounts ?? []).map((a) => ({ text: a.text, value: !near(a.value) && near(a.alt) ? a.alt : a.value, label: a.label, skip: Boolean(a.skip) })),
      product: null,
      productShare: null,
      text: clean(r.text ?? ''),
      details: null,
    };
    // A delivery screenshot with no "Delivered" may clearly say it was not delivered ("Cancelled", "Returned"…).
    const notWord = which === 'delivery' && !r.delivered ? notDeliveredWord(r) : null;
    if (which === 'delivery') Object.assign(record, { delivered: Boolean(r.delivered), deliveredText: r.deliveredText ?? null, notDelivered: notWord });
    result[which] = record;
    if (!r.ok) {
      shot[which] = { state: 'unreadable', problem: r.problem ?? 'its words are not clear enough to read' };
      return finish(n, 'fail', `It could not be read: ${shot[which].problem}.`);
    }
    seen[which] = wordsRead(which, r);
    if (await samePictureAfterReading(n, which, seen[which])) return;
    const details = detailsOf(which, r);
    record.details = details;
    record.product = details.product.shown ?? details.product.part ?? (which === 'delivery' ? r.product ?? null : null);
    record.productShare = details.product.share ?? null;
    // The purchase screenshot may say Delivered too (it may be the delivered order's page): judge() uses it when the delivery screenshot does not.
    shot[which] = { state: 'read', details, delivered: Boolean(r.delivered), notDelivered: notWord };
    let said = detailWords(details);
    let fails = shotFails(which, details);
    if (which === 'delivery') {
      const deliveredSaid = r.deliveredHow === 'sign' ? `It says ${quoted(r.deliveredText, 40)}, which Amazon shows only for a delivered order.` : `It says ${quoted(r.deliveredText, 40)}.`;
      said = `${r.delivered ? deliveredSaid : notWord ? `It says "${notWord}", not Delivered.` : 'It does not say Delivered.'} ${said}`;
      fails = fails || !r.delivered;
      const deliveredDay = r.delivered && r.deliveredOn ? dayNear(r.deliveredOn, sheetDay) : null;
      if (deliveredDay && sheetDay && deliveredDay < sheetDay) warnings.push(`The delivery date, ${dayFirst(deliveredDay)}, is before the order date, ${dayFirst(sheetDay)}.`);
    }
    return finish(n, fails ? 'fail' : 'pass', said);
  }

  /**
   * Every problem the two screenshots have, in the order that decides the
   * Type (RANK): [{ rank, type, kind, detail, which }]. Empty when both pass:
   * the order ID and the product shown and the same on both, the order date
   * and the amount shown on at least one and the same wherever shown, and
   * the delivery screenshot says Delivered.
   */
  /** Sentences the judging adds to the Note: how a screenshot was tied to the order when a detail was read in part. */
  const judgeNotes = [];
  function judge() {
    const out = [];
    judgeNotes.length = 0;
    // final: 'fail' for a problem that fails the transaction, 'manual' for one a staff member must look at.
    const add = (r, type, p) => out.push({ rank: r, type, at: out.length, final: 'fail', ...p });
    const read = SHOTS.filter((w) => shot[w]?.state === 'read');
    const st = (w, k) => shot[w].details[k].state;
    /** A different order ID, order date or amount that is one digit away from the form on every screenshot where it is different. */
    const misread = (k) => read.filter((w) => st(w, k) === 'different').every((w) => oneDigitOn(w, k));
    const different = (k) => ({ kind: 'different', detail: k, misread: misread(k), final: misread(k) ? 'manual' : 'fail' });
    // The order ID read one digit off on one screenshot, and whole and exactly on the other: a reading slip, not a problem.
    const idSlip = read.filter((w) => st(w, 'orderId') === 'different');
    const idExact = read.filter((w) => st(w, 'orderId') === 'same' && !shot[w].details.orderId.part);
    const idFixed = idSlip.length === 1 && idExact.length === 1 && oneDigitOn(idSlip[0], 'orderId');
    if (idFixed) judgeNotes.push(`The order ID on the ${WHAT[idSlip[0]]} was read one digit off, but the ${WHAT[idExact[0]]} shows it exactly, so it was taken as a reading slip.`);
    result.judged = { ...(result.judged ?? {}), orderIdSlip: idFixed };
    if (!idFixed && read.some((w) => st(w, 'orderId') === 'different')) add(RANK.orderId, 'orderIdNotMatching', different('orderId'));
    if (read.some((w) => st(w, 'product') === 'different')) add(RANK.product, 'productNotMatching', { kind: 'different', detail: 'product' });
    // Each screenshot shows one of the campaign's products, but not the same one: the delivery screenshot is not this order's product.
    const oProd = shot.order?.state === 'read' ? shot.order.details.product : null;
    const dProd = shot.delivery?.state === 'read' ? shot.delivery.details.product : null;
    const shared = (a, b) => (a.all ?? [a.product?.asin]).some((x) => x && (b.all ?? [b.product?.asin]).includes(x));
    if (byCampaign && oProd?.state === 'same' && dProd?.state === 'same' && oProd.product?.asin && dProd.product?.asin && !shared(oProd, dProd)) add(RANK.product, 'productNotMatching', { kind: 'mismatch', detail: 'product', which: ['delivery'] });
    // A picture in the delivery cell that says neither "Delivered" nor that the order was not delivered, and shows no detail of an order (no
    // order ID, amount or order date: a photo of the product), is not an order page, so it cannot be tied to this order. A page that says
    // "Delivered" is tied to the order by its product or its order ID (below), with or without its amount or date.
    const dDet = shot.delivery?.state === 'read' ? shot.delivery.details : null;
    const noOrderDetail = Boolean(dDet) && !['orderId', 'amount', 'orderDate'].some((k) => ['same', 'different', 'shown'].includes(dDet[k]?.state));
    const notOrderPage = noOrderDetail && !shot.delivery.delivered && !shot.delivery.notDelivered;
    // "Delivered" on the purchase screenshot of this order (the two screenshots given the other way round) is this order delivered.
    const deliveredOnOrder = Boolean(shot.order?.state === 'read' && shot.order.delivered && st('order', 'orderId') === 'same');
    if (shot.delivery?.state === 'words') add(RANK.delivered, 'notDelivered', { kind: 'words' });
    // No "Delivered" fails only when the screenshot clearly says it was not delivered; else it may be a reading mistake. A picture that is
    // not an order page (a photo of the product) cannot be matched to the order (below).
    else if (shot.delivery?.state === 'read' && !shot.delivery.delivered && !notOrderPage) {
      if (!shot.delivery.notDelivered && deliveredOnOrder) judgeNotes.push('The delivery screenshot does not say Delivered, but the purchase screenshot shows this order delivered.');
      else add(RANK.delivered, 'notDelivered', { kind: 'not delivered', final: shot.delivery.notDelivered ? 'fail' : 'manual' });
    }
    for (const w of SHOTS) {
      if (shot[w]?.state === 'missing') add(RANK.open, w === 'order' ? 'orderShotMissing' : 'deliveryShotMissing', { kind: 'missing', which: [w] });
      else if (shot[w]?.state === 'no column') add(RANK.open, w === 'order' ? 'orderShotMissing' : 'deliveryShotMissing', { kind: 'no column', which: [w], final: 'manual' });
      else if (shot[w]?.state === 'unopened') add(RANK.open, shot[w].picture.type, { kind: 'unopened', which: [w], final: 'manual' });
    }
    // An amount read one digit away from the form on one screenshot (a reading slip, or a total before a promotion cut off), while the other
    // screenshot of the same order (both show its order ID) shows the form's: the amount is the form's, as with an order ID's slip.
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
      // With a campaign, the product's real name from Amazon (and its brand's words); without one, the product name in the sheet, of which three words or more (or all of a shorter name) must show.
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
      result.judged = { ...(result.judged ?? {}), product: { order: orderOk, delivery: deliveryOk } };
      // A picture in the delivery cell that is not an order page is a problem of its own (below), whatever product it shows.
      const hidden = [o && !orderOk ? 'order' : null, d && !deliveryOk && !notOrderPage ? 'delivery' : null].filter(Boolean);
      if (hidden.length === 2 && !hidden.some((w) => shot[w].details.product.part)) add(RANK.shown, 'orderNotClear', { kind: 'not shown', detail: 'product', which: hidden, final: 'manual' });
      else for (const w of hidden) add(RANK.shown, `${w}NotClear`, { kind: 'not shown', detail: 'product', which: [w], final: 'manual', noId: w === 'delivery' && !idOn(d) });
    }
    if (notOrderPage) add(RANK.shown, 'deliveryNotClear', { kind: 'no details', which: ['delivery'], final: 'manual' });
    if (read.length === 2) for (const k of ['orderDate', 'amount']) if (compared.includes(k) && formHas[k] && read.every((w) => st(w, k) === NOT_SHOWN)) add(RANK.shown, 'orderNotClear', { kind: 'not shown', detail: k, which: read, final: 'manual' });
    // Within a rank, the purchase screenshot's problem comes first.
    const first = (p) => (p.which ? (p.which.includes('order') ? 0 : 1) : 0);
    return out.sort((a, b) => a.rank - b.rank || first(a) - first(b) || a.at - b.at);
  }

  // ---- the Note's sentences for the screenshots' problems ----
  /** What the user gave in the form: "order ID 403-…", "the order date 16-07-2026", "the amount ₹654", "the product "…"". */
  const given = { orderId: () => `order ID ${sheetId}`, orderDate: () => `the order date ${dayFirst(sheetDay)}`, amount: () => `the amount ${rupees(sheetAmount)}`, product: () => `the product ${quoted(label, 80)}` };
  /** The same, without what it is: for "the user gave ₹654, but …". */
  const givenValue = { orderId: () => sheetId, orderDate: () => dayFirst(sheetDay), amount: () => rupees(sheetAmount), product: () => quoted(label, 80) };
  /** How a screenshot's value is said: an order ID or a date as it is, an amount with what it is, a product in quotes (a campaign's by the start of its real name). */
  const valueSaid = (k, v) => (k === 'product' ? quoted(v.campaign ? shortName(v.product?.short ?? v.shown) : v.shown, 80) : k === 'amount' && v.label ? `${v.shown} as ${v.label}` : v.shown);
  const readShots = () => SHOTS.filter((w) => shot[w]?.state === 'read');
  const withState = (k, state) => readShots().filter((w) => shot[w].details[k].state === state);
  /** "the delivery screenshot shows ₹694", or both screenshots' values. */
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
    const text = { orderId: sheetIdText, orderDate: row.orderDate?.text, amount: row.amount?.text, product: label }[k];
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
  /** "The user did not give a review link…", when the review cell holds no link and no picture, and there is no review screenshot. */
  const reviewMissingSaid = () => (!had.reviewLink ? 'The user did not give a review screenshot in the form.' : reviewCell.text ? `The user wrote ${quoted(reviewCell.text, 60)} in the form instead of giving a review link.` : 'The user did not give a review link or a review screenshot in the form.');

  emit({ event: 'started', checkId, steps: STEP_NAMES, rowId: row.id, row: row.row ?? null, name: result.name });

  /** Problems found after the screenshots that need a staff member but do not stop the check: { type, says, then }. The first gives the Type when nothing else does. */
  const flags = [];
  const flag = (type, says, then) => flags.push({ type, says, then });
  /** Sentences about the review for the Note: the reviewer's name, and the review screenshot against the review. */
  const reviewNotes = [];
  /**
   * The name on the review against the name in the sheet's Reviewer Name
   * column, the way staff read it (sameName): a sentence for the Note, and
   * ok false when it is a different name. A name Amazon hides, or no name,
   * is not compared, and the Note says so.
   */
  function reviewerCheck(nameOnReview) {
    if (reviewer === null || reviewer === undefined) return { ok: true, says: null };
    const column = String(reviewer).replace(/\s+/g, ' ').trim();
    if (!column) return { ok: true, says: 'The Reviewer Name cell is empty, so the name on the review was not compared.' };
    if (!String(nameOnReview ?? '').trim()) return { ok: true, says: 'The review shows no name, so it was not compared with the Reviewer Name column.' };
    if (isHiddenName(nameOnReview)) return { ok: true, says: `Amazon hides the reviewer's name (${quoted(nameOnReview, 40)}), so it was not compared with the Reviewer Name column.` };
    const s = sameName(column, nameOnReview);
    if (s.same) return { ok: true, says: s.how === 'same' ? `The name on the review is the one in the Reviewer Name column, ${quoted(column, 40)}.` : `The name on the review, ${quoted(nameOnReview, 40)}, is the one in the Reviewer Name column, ${quoted(column, 40)}${NAME_HOW[s.how] ?? ''}.` };
    return { ok: false, says: `The name on the review, ${quoted(nameOnReview, 40)}, is not the name in the Reviewer Name column, ${quoted(column, 40)}.` };
  }
  /**
   * The row's review screenshot against the review the link opened, the way
   * staff look: the user's review is the one under the user's name (in a
   * list of reviews, or on its own, or in Amazon's email saying the review
   * is live), and it matches when its name and its words are found in the
   * review the link opens; the screenshot may show only part of the words.
   * One that cannot be read, or shows no review, is said so and does not stop
   * a Pass; one that clearly shows another name or other words needs a staff
   * member. -> the sentence for the Note (null when there is no review
   * screenshot).
   */
  async function reviewShotCheck(parts) {
    if (!reviewShotThere) return null;
    const amazonWords = clean(reviewWords(parts.body) || parts.title || '');
    let r = null;
    try {
      r = await readers.reviewShot((await fetchCell('reviewShot')).files, { product: reviewProduct(), reviewer, name: parts.name ?? null, title: parts.title ?? null, words: amazonWords });
    } catch (err) {
      if (err instanceof Stopped || err instanceof Paused) throw err;
    }
    const email = Boolean(r?.written?.email);
    const form = Boolean(r?.written?.form);
    result.reviewShot = r ? { kind: r.kind ?? null, name: r.written?.name ? clean(r.written.name) : null, words: clean(r.written?.body ?? r.freeText ?? ''), others: r.others ?? 0, confidence: r.confidence ?? null, email, form } : null;
    if (!r || r.ok === false || !String(r.text ?? '').trim()) return 'The review screenshot could not be read, so it was not compared with the review; the review itself was checked on Amazon.';
    if (r.kind === 'refused') return 'The review screenshot shows a message from Amazon, not the review, so it was not compared with the review.';
    const body = reviewWords(r.written?.body ?? r.freeText ?? '');
    if (r.kind !== 'written' || !wordsOf(body).length) return `The review screenshot ${email ? "is Amazon's email saying the review is live, but it" : ''} shows no written words, so it was not compared with the review.`;
    const what = email ? "is Amazon's email saying the review is live" : form ? 'shows the review being written' : 'shows';
    const shotName = r.written?.name ? cleanName(r.written.name) || r.written.name : null;
    const amazonName = parts.name ?? null;
    // The name on the screenshot, when it shows one Tesseract could read (a row of stars is never a name), against the name on the review; in the email, the name Amazon thanks may be the user's own, as in the Reviewer Name column.
    const nameKnown = Boolean(shotName && amazonName && !isHiddenName(amazonName) && !starsLine(shotName));
    const sameOne = nameKnown && (sameName(shotName, amazonName).same || nameReadAs(amazonName, shotName) || (overlapScore(amazonName, shotName) ?? 0) >= 0.5 || (email && Boolean(reviewer) && sameName(shotName, reviewer).same));
    const differentName = nameKnown && !sameOne;
    // The screenshot's words (its title and words) must be in the review the link opens (its title and words); it may show only part of them (cut short, or scrolled), and the screen's own words around them do not count: lines whose words are mostly in the review are the review.
    const shotText = [r.written?.title, body].filter(Boolean).join('\n');
    const amazonText = [parts.title, amazonWords].filter(Boolean).join('\n');
    const inAmazon = overlapScore(shotText, amazonText) ?? 0;
    const ofAmazon = overlapScore(amazonWords || parts.title || '', shotText) ?? 0;
    const linesFound = shotText.split('\n').filter((l) => wordsOf(l).length >= 3 && (overlapScore(l, amazonText) ?? 0) >= 0.6).length;
    const otherWords = wordsOf(shotText).length >= 2 && wordsOf(amazonText).length >= 2 && inAmazon < 0.5 && ofAmazon < 0.5 && linesFound < 2;
    const then = "A staff member must check which review is the user's.";
    if (differentName) {
      // What is different is kept with the result, for the email sent to the user about it.
      result.reviewShot.problem = 'name';
      flag('reviewShotNotMatching', email ? `The review screenshot is Amazon's email saying a review by ${quoted(shotName, 40)} is live, but the review the link opens is by ${quoted(amazonName, 40)}.` : `The review screenshot ${form ? 'shows the review being written, by' : 'shows a review by'} ${quoted(shotName, 40)}, but the review the link opens is by ${quoted(amazonName, 40)}.`, then);
      return null;
    }
    if (otherWords) {
      result.reviewShot.problem = 'words';
      flag('reviewShotNotMatching', `${email || form ? `The review screenshot ${what}, but its words are` : "The review screenshot's words are"} different from the review the link opens: it says ${quoted(shotText, 80)}, but the review on Amazon says ${quoted(amazonText, 80)}.`, then);
      return null;
    }
    const partly = ofAmazon < 0.85;
    const by = sameOne ? `, by ${quoted(amazonName, 40)}` : shotName && !starsLine(shotName) && !amazonName ? `, by ${quoted(shotName, 40)}` : '';
    if (email || form) return `The review screenshot ${what}${by}, with ${partly ? 'the first words of the review' : 'the same words'}.`;
    return `The review screenshot shows ${partly ? 'part of ' : ''}the same review${by}${r.others ? `, among ${r.others === 1 ? 'one other review' : `${r.others} other reviews`}` : ''}.`;
  }

  let reviewWay = null; // 'picture' | 'amazon'
  let landed = null;
  let wantedId = null;
  let block = null;
  let pageText = null;
  let reviewPic = null;
  let ratingOnly = false;
  let pendingVariant = false;
  let seeAll = null;
  let seeAllFacts = null;
  let searchAsin = null;

  try {
    // ---- 1. Duplicates and links in the sheet ----
    await step(1, async () => {
      start(1, 'Looking for the same order, links and pictures in other rows');
      // The same order ID in another row: only the first of them is checked.
      if (sheetId) {
        const same = others.filter((o) => o.orderId?.value && o.orderId.value === sheetId);
        if (same.length && later(same)) {
          const first = firstOf(same.filter((o) => before(o, row)));
          return dup(1, first.last ? `Order ID ${sheetId} was already checked in ${rowName(first)}.` : `Order ID ${sheetId} is also in ${rowName(first)}, and ${rowName(first)} is the one that will be checked.`, `this row has the same order ID, so it is a duplicate and was not checked${first.last ? ' again' : ''}`);
        }
        if (same.length) laterSaid('order ID', same);
      }
      // A cell whose written link is different from the link that opens when it is clicked: the link that opens is the one checked, as staff would.
      for (const which of PICTURE_CELLS) {
        if (!row.shots?.[which]?.mismatch) continue;
        mismatchSaid.push(`The link written in the ${CELL_WORDS[which]} cell is different from the link that opens when you click it. The dashboard checked the link that opens when clicked.`);
      }
      // The same screenshot or review link as another row, by the link that opens. Only a picture or one review counts:
      // never words, a product's page or its reviews, an error page, a page for the review's writer or an app store's page.
      const sharable = (which, link) => which !== 'review' || ['review', 'drive', 'web'].includes(reviewLinkKind(link).kind);
      const theirs = new Map();
      for (const o of others) {
        for (const which of PICTURE_CELLS) {
          for (const link of o.shots?.[which]?.links ?? []) {
            if (!sharable(which, link)) continue;
            const key = linkKey(link);
            if (!key) continue;
            if (!theirs.has(key)) theirs.set(key, []);
            if (!theirs.get(key).some((x) => x.o === o)) theirs.get(key).push({ o, which });
          }
        }
      }
      for (const which of PICTURE_CELLS) {
        for (const link of row.shots?.[which]?.links ?? []) {
          if (!sharable(which, link)) continue;
          // Amazon's message refusing a review, given by the same link for two orders of one account, is the same message, not the same review.
          const hits = (theirs.get(linkKey(link)) ?? []).filter((h) => !(isReview(which) && (refusalShown(row, which) || refusalShown(h.o, h.which))));
          if (!hits.length) continue;
          const what = which === 'review' ? 'review link' : WHAT[which];
          const share = which === 'review' ? 'two different orders cannot share one review' : 'two different orders cannot share one screenshot';
          if (!later(hits.map((h) => h.o))) {
            laterSaid(what, hits.map((h) => h.o));
            continue;
          }
          const first = firstOf(hits.map((h) => h.o).filter((o) => before(o, row)));
          return dup(1, `This row uses the same ${what} as ${rowName(first)}, ${firstSaid(first)}.`, `${share}, so this row is a duplicate and was not checked${first.last ? ' again' : ''}`);
        }
      }
      // The very same picture file as another row's.
      const sameFile = samePictures(current, others, null);
      for (const which of PICTURE_CELLS) {
        let hits = sameFile[which];
        if (!hits.length) continue;
        // A screenshot is read first, to see whose order it shows (notSame).
        if (!isReview(which) && hits.length && sheetId) {
          const r = await readCell(which);
          hits = notSame(which, hits, { orderIds: r.ok === false ? [] : r.orderIds ?? [], text: r.text ?? '' });
        } else hits = notSame(which, hits, null);
        if (!hits.length) continue;
        if (!later(hits.map((h) => h.o))) {
          markLater(hits, which);
          continue;
        }
        return samePictureStop(1, which, hits);
      }
      // A picture that looks like another row's: read now, so the same picture is found before anything else.
      for (const which of PICTURE_CELLS) {
        if (which === 'review' && !reviewIsPicture) continue;
        if (!lookAlikes(current, others, which).length) continue;
        say(`Reading the ${WHAT[which]}, which looks like another row's`);
        const g = await fetchCell(which);
        if (!g.files.length) continue;
        const r = await readCell(which);
        if (r.ok === false || !r.text) continue;
        seen[which] = wordsRead(which, r);
        if (await samePictureAfterReading(1, which, seen[which])) return;
      }
      return pass(1, `No other row has this order ID, these links or these pictures.${mismatchSaid.length ? ' A written link is different from the link it opens, so the link that opens is the one checked.' : ''}`);
    });

    // ---- 2 and 3. The purchase screenshot ----
    await step(2, () => openShot(2, 'order'));
    await step(3, () => readShot(3, 'order'));
    // ---- 4 and 5. The delivery screenshot: always looked at, even when the purchase screenshot has a problem ----
    await step(4, () => openShot(4, 'delivery'));
    await step(5, () => readShot(5, 'delivery'));
    // Both screenshots looked at: their problems decide the Type, and the review is looked at only when there are none.
    if (!outcome) {
      const problems = judge();
      if (problems.length) {
        // The Type is the first problem that fails the transaction, in the order of RANK; with none, the first problem. A detail that may only
        // be a reading mistake (one digit away from the form) never names a row that fails for something else.
        outcome = { type: (problems.find((p) => p.final === 'fail') ?? problems[0]).type, problems, step: 5 };
        const neither = problems.filter((p) => p.kind === 'not shown' && p.which.length === 2).map((p) => `Neither screenshot shows ${p.detail === 'orderId' ? 'an order ID' : `the ${NOUN[p.detail]}`}.`);
        const s5 = result.steps[4];
        if (neither.length && s5.state !== 'not-reached') await finish(5, 'fail', `${s5.detail ?? ''} ${neither.join(' ')}`.trim());
        // A screenshot judged not to match the order once both were read (the delivery screenshot with neither the product nor the order ID): its step shows it.
        for (const p of problems.filter((x) => (x.kind === 'not shown' || x.kind === 'no details' || x.kind === 'mismatch') && x.which.length === 1)) {
          const n = p.which[0] === 'order' ? 3 : 5;
          const s = result.steps[n - 1];
          if (s.state === 'pass') await finish(n, 'fail', `${s.detail ?? ''} ${cap(notShownClause(p))}.`.trim());
        }
      }
    }

    async function reviewGone(n, id) {
      result.reviewId = id;
      const seenAt = row.seenLive && (!row.seenLive.reviewId || row.seenLive.reviewId === id) ? row.seenLive.at : null;
      const when = seenAt ? dayFirst(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(seenAt))) : null;
      return stop(n, 'reviewDeleted', ['Amazon no longer shows the review, so it has been deleted.', when ? `An earlier check found the review live on ${when}.` : null]);
    }
    const writerOnly = (how) => stop(6, 'needAccess', `The review link ${how} a page only the person who wrote the review can see, so the dashboard did not look at it.`, "Ask the user to send the review's public link, then check this row again.");
    const notAReview = (what) => stop(6, 'wrongReviewLink', `The review link opens ${what}, not a review.`);
    /** The review screenshot, read in place of a review link that is not a link to one review; why is said first. */
    async function useReviewShot(why) {
      reviewWay = 'picture';
      reviewWhich = 'reviewShot';
      landed = null;
      const g = await fetchCell('reviewShot');
      if (!g.files.length) {
        const p = pictureProblem('reviewShot', g.problems[0] ?? { kind: 'access', site: null, says: 'it could not be opened' });
        return stop(6, p.type, [p.line, `${cap(p.because)}.`], p.then);
      }
      return pass(6, `${why}, so the review screenshot was opened instead.`);
    }
    /** Why the review link is not a link to one review, as the start of a sentence; null when it is one, or may be one once it is opened. */
    function notOneReview() {
      const s = reviewCell;
      const k = reviewKind;
      if (!had.reviewLink) return 'The file has no review link column';
      if (!s.links?.length && !s.picture) return s.text ? `The review link cell says ${quoted(s.text, 40)}` : 'The review link cell is empty';
      if (s.picture) return 'The review link cell holds a picture, not a link to one review';
      const what = { product: 'a product page on Amazon', reviews: "a product's list of reviews on Amazon", error: 'an Amazon error page', 'writer-only': 'a page only the person who wrote the review can see', app: "an app store's page", drive: 'a picture on Google Drive', web: `a page on ${k.host}`, 'other-amazon': `Amazon outside India (${k.host})` }[k.kind];
      return what ? `The review link opens ${what}, not one review` : null;
    }

    // ---- 6. Opening the review link ----
    await step(6, async () => {
      start(6, 'Opening the review link');
      const s = reviewCell;
      const k = reviewKind;
      // Not a link to one review (or empty, or words): the review screenshot is read instead, when the row has one.
      const notOne = notOneReview();
      if (notOne && reviewShotThere) return useReviewShot(notOne);
      if (!s.links?.length && !s.picture) return stop(6, 'reviewLinkMissing', reviewMissingSaid());
      if (k.kind === 'writer-only') return writerOnly('is for');
      if (k.kind === 'other-amazon') return stop(6, 'wrongReviewLink', `The review link is on ${k.host}, not Amazon India.`);
      if (k.kind === 'not-a-link') return stop(6, 'reviewLinkMissing', reviewMissingSaid());
      if (k.kind === 'product') return notAReview('a product page on Amazon');
      if (k.kind === 'reviews') return notAReview("a product's list of reviews on Amazon");
      if (k.kind === 'error') return notAReview('an Amazon error page');
      if (k.kind === 'app') return notAReview("an app store's page");
      if (reviewIsPicture) {
        reviewWay = 'picture';
        const g = await fetchCell('review');
        if (!g.files.length) {
          const p = pictureProblem('review', g.problems[0] ?? { kind: 'access', site: null, says: 'it could not be opened' });
          return stop(6, p.type, [p.line, `${cap(p.because)}.`], p.then);
        }
        return pass(6, 'The review cell holds a picture; it was opened.');
      }
      reviewWay = 'amazon';
      if (!(await openBrowser(6))) return;
      say('Opening the review link in the Live Amazon Browser');
      const res = await amazonPage(k.open);
      const u = res.ok ? parseUrl(res.url) : null;
      // Landed on a page that is not one review: the review screenshot is read instead, when the row has one.
      const elsewhere = (why, otherwise) => (reviewShotThere ? useReviewShot(`The review link ${why}`) : otherwise());
      if (res.ok && !isAmazonIn(u)) return elsewhere(`leads to ${u ? u.hostname : 'another website'}, not Amazon India`, () => stop(6, 'wrongReviewLink', `The review link leads to ${u ? u.hostname : 'another website'}, not Amazon India.`));
      const page = await amazonAnswer(6, res, 'review');
      if (!page) return;
      // A short link or an email link may land on a page only the review's writer can see: never read.
      if (isWriterOnlyPage(res.url)) return elsewhere('leads to a page only the person who wrote the review can see', () => writerOnly('leads to'));
      landed = res;
      const expected = k.reviewId ?? reviewIdFrom(res.url);
      if (page.kind === 'not-found') {
        if (expected) return reviewGone(6, expected);
        return elsewhere('opens a page that does not exist on Amazon', () => stop(6, 'wrongReviewLink', 'The review link opens a page that does not exist on Amazon.'));
      }
      const reviews = res.facts?.reviews ?? [];
      // A review page reached without its id in the address shows one review; a product page's own reviews, or its list of reviews, never count.
      const reviewPath = /\/(customer-reviews|review)\//i.test(pathOf(res.url)) && reviewLinkKind(res.url).kind !== 'reviews';
      wantedId = expected ?? (reviewPath && reviews.length === 1 && reviews[0].id ? reviews[0].id : null);
      if (!wantedId) {
        const path = pathOf(res.url);
        const what = res.facts?.productTitle || /\/(dp|gp\/product)\//.test(path) ? 'a product page on Amazon' : path === '/' || path === '' ? "Amazon's home page" : 'a page on Amazon';
        return elsewhere(`opens ${what}, not one review`, () => notAReview(what));
      }
      block = findReview(res.facts, wantedId);
      pageText = textReview(res.facts);
      // The page's text counts only when it shows a review: its own "N out of 5 stars" line.
      if (pageText && pageText.stars === null) pageText = null;
      if (!block && (!pageText || /no longer available|review (?:is )?not available|has been removed/i.test(String(res.facts?.text ?? '').slice(0, 4000)))) return reviewGone(6, wantedId);
      result.reviewId = wantedId;
      // The same review as another row's, found as soon as its id is known (a short link's too, and a rating only's).
      if (await reviewIdDuplicate(6, wantedId)) return;
      return pass(6, 'Opened the review on Amazon.');
    });

    // ---- 7. Reading the rating and the written words ----
    await step(7, async () => {
      start(7, 'Reading the rating and the written words');
      if (reviewWay === 'picture') {
        const r = await readCell(reviewWhich);
        reviewPic = r;
        result.reviewPicture = {
          kind: r.kind,
          stars: r.stars ?? null,
          starsHow: r.starsHow ?? null,
          refusal: r.refusal ? clean(r.refusal) : null,
          ratingPhrase: r.ratingPhrase ? clean(r.ratingPhrase) : null,
          written: r.written ? { name: r.written.name ? clean(r.written.name) : null, title: r.written.title ? clean(r.written.title) : null, dateText: r.written.dateText ?? null, body: clean(r.written.body ?? '') } : null,
          productLines: (r.productLines ?? []).map(clean),
          why: r.why ?? null,
          confidence: r.confidence ?? null,
          text: clean(r.text ?? ''),
        };
        if (r.ok !== false && r.text && r.kind !== 'refused') {
          seen[reviewWhich] = wordsRead(reviewWhich, r);
          if (await samePictureAfterReading(7, reviewWhich, seen[reviewWhich])) return;
        }
        if (r.kind === 'refused') return stop(7, 'cannotAddReviews', `The review screenshot shows a message from Amazon that the review could not be added: ${quoted(String(r.refusal ?? '').replace(/[.!?]+\s*$/, ''), 200)}.`);
        if (r.kind === 'rating') {
          const shownOk = r.productShown && r.productShown.share >= mark;
          if (had.product && r.productLines?.length && !shownOk) return stop(7, 'productNotMatching', byCampaign ? `The review screenshot shows a star rating for ${quoted(r.productLines[0], 80)}, which is not one of the products of ${theCampaign}.` : `The review screenshot shows a star rating for ${quoted(r.productLines[0], 80)}, but the product the user gave is ${quoted(label, 60)}.`);
          ratingOnly = true;
          return pass(7, `${r.stars} stars and no written words${shownOk ? ', for the product ordered' : ''}.`);
        }
        if (r.kind === 'written' && r.written?.email) return pass(7, `Amazon's email saying the review is live${r.written.name ? `, by ${quoted(r.written.name, 40)}` : ''}: ${quoted(r.written.body, 100)}`);
        if (r.kind === 'written' && r.written?.form) return pass(7, `The review being written: ${quoted(r.written.body, 100)}`);
        if (r.kind === 'written') return pass(7, `A written review${r.written?.name && !starsLine(r.written.name) ? ` by ${quoted(r.written.name, 40)}` : ''}: ${quoted(r.written?.body, 100)}`);
        if (r.ok === false || r.unreadable) return stop(7, 'reviewNotClear', `The review screenshot could not be read: ${r.unreadable ? r.why : r.problem ?? 'its words are not clear enough to read'}.`, 'Ask for a clearer screenshot, then check this row again.');
        return stop(7, 'somethingElse', `The review screenshot does not clearly show a written review, a star rating only or a message from Amazon, because ${r.why}.`, 'Open it by hand.');
      }
      // An Amazon review page.
      const parts = reviewParts(block, pageText);
      const product = reviewedProduct(landed.facts);
      result.amazon = {
        reviewId: wantedId,
        name: parts.name ? clean(parts.name) : null,
        stars: parts.stars,
        title: parts.title ? clean(parts.title) : null,
        dateText: parts.dateText,
        body: parts.body ? clean(parts.body) : null,
        verified: parts.verified,
        productTitle: product?.title ? clean(product.title) : null,
        productAsin: product?.asin ?? null,
        pageUrl: landed.url,
      };
      const words = Boolean(parts.body) || Boolean(parts.title);
      // A rating only, only when the page's own text was read whole, agrees with the review's block, and shows stars with no title and no words.
      const textWhole = Boolean(pageText) && !pageText.cut && !parts.disagree.length;
      // A long "Size: …" or "Colour: …" line, from the block or the page's text, may be the review's own words.
      const variantShort = [parts.variant, pageText?.variant].filter(Boolean).every((v) => wordsOf(String(v).replace(/^[^:]*:/, '')).length <= 6);
      const looksRatingOnly = !words && parts.stars && textWhole && variantShort;
      // The reviewed product: one of the campaigns' products (or another colour or size of one), else, with no campaign, by name.
      let byName = false;
      const unreadable = () => stop(7, 'somethingElse', 'The reviewed product could not be read on the review page, so it could not be compared with the product the user gave.', 'Open the review link by hand.');
      if (!had.product) {
        // No product name in the file: the reviewed product is not compared.
      } else if (byCampaign) {
        if (!product?.asin) return unreadable();
        const own = boughtAsins();
        if (!own.has(product.asin)) {
          const other = campaignProducts.find((c) => c.asin === product.asin || (c.variants ?? []).includes(product.asin));
          if (other) return stop(7, 'productNotMatching', `The review is for ${quoted(shortName(other.short ?? other.name), 80)}, another of the campaign's products, not ${quoted(shortName(shownProduct()?.short ?? ''), 80)}, the product the screenshots show.`);
          pendingVariant = true;
        }
      } else {
        if (!product?.title) return unreadable();
        const share = productShown(label, [product.title])?.share ?? 0;
        if (share < mark) return stop(7, 'productNotMatching', `The review is for ${quoted(product.title, 80)}, which is a different product from ${quoted(label, 60)}.`);
        byName = true;
      }
      const after = byName ? ` ${NAME_ONLY}` : '';
      if (!words && !looksRatingOnly) return stop(7, 'somethingElse', 'The review page did not clearly show the stars and the written words, so the dashboard could not tell whether the review is a star rating only.', 'Open the review link by hand.');
      // The name on the review must be the one in the Reviewer Name column; the review screenshot, when there is one, must show this review.
      const who = reviewerCheck(parts.name);
      if (who.says) reviewNotes.push(who.says);
      if (!who.ok) flag('reviewerNotMatching', who.says, 'A staff member must check whose review it is.');
      const shotSaid = looksRatingOnly ? null : await reviewShotCheck(parts);
      if (shotSaid) reviewNotes.push(shotSaid);
      const flagged = flags.length ? ` ${flags.map((f) => f.says).join(' ')}` : '';
      if (looksRatingOnly) {
        ratingOnly = true;
        return finish(7, flags.length ? 'fail' : 'pass', `${parts.stars} stars and no written words on the review page.${after}${flagged}`);
      }
      return finish(7, flags.length ? 'fail' : 'pass', `${parts.stars ? `${parts.stars} stars and ` : ''}a written review${parts.name ? ` by ${quoted(parts.name, 40)}` : ''}: ${quoted(parts.body ?? parts.title, 100)}${after}${flagged}`);
    });

    // ---- 8. The product's page and "See all reviews" ----
    await step(8, async () => {
      if (ratingOnly && !pendingVariant) return notNeeded(8, 'A rating only needs no search.');
      // A review opened from its link is live: no search is needed. Its product page is opened only to tell another colour or size of a campaign's product.
      if (reviewWay === 'amazon' && !pendingVariant) return notNeeded(8, 'The review link opened the review on Amazon, so it is live; no search is needed.');
      start(8, "Opening the product's page");
      let asin;
      if (reviewWay === 'picture') {
        // A written review sent as a picture is looked for under the product the screenshots show.
        const shown = byCampaign ? shownProduct() : null;
        if (!shown) {
          return stop(8, 'reviewLinkNeeded', "The review screenshot shows a written review, but there is no campaign for this product's brand, so the review could not be looked for on Amazon.", "Add a campaign for this brand with its products, or ask the user for the review's link, then check this row again.");
        }
        asin = shown.asin;
        if (!(await openBrowser(8))) return;
      } else asin = result.amazon.productAsin;
      const res = await amazonPage(productPageUrl(asin));
      const page = await amazonAnswer(8, res, 'product');
      if (!page) return;
      if (page.kind === 'not-found') return stop(8, 'somethingElse', "The product's page does not exist on Amazon, so the review could not be looked for.", reviewWay === 'picture' ? "Check the campaign's products in the Campaigns box." : 'Open the review link by hand.');
      say('Scrolling to the reviews');
      const scrolled = browser.scrollToReviews ? await browser.scrollToReviews() : false;
      const f = res.facts ?? {};
      const variants = [...new Set([asin, f.pageAsin, f.parentAsin, ...(f.variantAsins ?? [])].filter(Boolean))];
      result.productPage = { asin, title: f.productTitle ? clean(f.productTitle) : null, variants, scrolled };
      let variantSaid = '';
      if (pendingVariant) {
        if (![...boughtAsins()].some((a) => variants.includes(a))) {
          return stop(8, 'productNotMatching', `The review is for ${result.amazon.productTitle ? quoted(shortName(result.amazon.productTitle), 80) : 'another product'}, which is not ${shownProduct() ? `the product the screenshots show, ${quoted(shortName(shownProduct().short ?? ''), 60)}` : `one of the products of ${theCampaign}`}, or another colour or size of it.`);
        }
        variantSaid = ' The reviewed product is another colour or size of one of the campaign\'s products.';
        if (ratingOnly) return pass(8, `${variantSaid.trim()} A rating only needs no search.`);
        if (reviewWay === 'amazon') return pass(8, `${variantSaid.trim()} The review link opened the review on Amazon, so it is live; no search is needed.`);
      }
      seeAll = seeAllReviewsUrl(f.seeAllHref, asin);
      searchAsin = asinFrom(seeAll) ?? asin;
      say('Opening "See all reviews"');
      const all = await amazonPage(seeAll);
      const allPage = await amazonAnswer(8, all, 'see-all');
      if (!allPage) return;
      if (allPage.kind === 'not-found') return stop(8, 'somethingElse', '"See all reviews" does not exist for this product on Amazon, so the review could not be looked for.', 'Open the product page by hand.');
      seeAllFacts = all.facts ?? {};
      return pass(8, `Opened the product's page${scrolled ? ' and scrolled to its reviews' : ''}, then "See all reviews" (${seeAllFacts.reviews?.length ?? 0} reviews on its first page).${variantSaid}`);
    });

    // ---- 9. Searching for the review ----
    await step(9, async () => {
      if (ratingOnly) return notNeeded(9, 'A rating only needs no search.');
      if (reviewWay === 'amazon') {
        // The review the link opens is live and public: that is what the link shows.
        result.liveAt = now().toISOString();
        result.publicReview = { searched: [], found: true, id: wantedId, link: reviewPageUrl(wantedId) };
        return notNeeded(9, 'The review link opened the review on Amazon, so it is live and public; no search is needed.');
      }
      start(9, 'Choosing a search word');
      // Words this dashboard must not show are never searched for.
      const body = clean(reviewWay === 'picture' ? reviewPic.written?.body ?? '' : result.amazon.body ?? result.amazon.title ?? '');
      const shotName = reviewPic?.written?.name && !starsLine(reviewPic.written.name) ? cleanName(reviewPic.written.name) || reviewPic.written.name : null;
      const name = reviewWay === 'picture' ? shotName : result.amazon.name;
      const avoid = [label, result.productPage?.title ?? '', result.amazon?.productTitle ?? '', name ?? ''];
      // The words to search for come from the review's title too (a picture's title is its own line); the review found is compared by its words.
      const words = rareWords(clean(reviewWay === 'picture' ? [reviewPic.written?.title, body].filter(Boolean).join('\n') : body), avoid).slice(0, MAX_SEARCHES);
      // A review on a picture is the same review only when its words match both ways and its name matches; with no name shown, more words must match.
      const need = settings.passingMarks.reviewTextShare;
      const bodyWords = wordsOf(body).length;
      const textMatch = (r) => {
        const theirs = wordsOf(r?.body ?? '').length;
        const enough = name ? 5 : 8;
        if (bodyWords < enough || theirs < enough) return false;
        const a = overlapScore(r?.body ?? '', body);
        const b = overlapScore(body, r?.body ?? '');
        return a !== null && b !== null && a >= need && b >= need;
      };
      const nameMatch = (r) => !name || compareNames(name, r?.name).ok || nameReadAs(r?.name, name) || sameName(name, r?.name).same;
      const isIt = (r) => (reviewWay === 'picture' ? textMatch(r) && nameMatch(r) : r?.id === wantedId);
      const tried = [];
      let hit = (seeAllFacts?.reviews ?? []).find(isIt) ?? null;
      for (const [i, word] of words.entries()) {
        if (hit) break;
        // A full page of results may go on: the next pages are looked through too, one Amazon page at a time.
        for (let pageNo = 1; pageNo <= MAX_SEARCH_PAGES && !hit; pageNo++) {
          say(pageNo === 1 ? `Searching the reviews for "${word}"` : `Looking at page ${pageNo} of the reviews with "${word}"`);
          const res = await amazonPage(reviewSearchUrl(searchAsin, word, pageNo));
          const page = await amazonAnswer(9, res, `search-${i + 1}${pageNo > 1 ? `-page-${pageNo}` : ''}`);
          if (!page) return;
          const shown = res.facts?.reviews ?? [];
          if (pageNo === 1) tried.push({ word, shown: shown.length, pages: 1 });
          else Object.assign(tried[tried.length - 1], { shown: tried[tried.length - 1].shown + shown.length, pages: pageNo });
          hit = shown.find(isIt) ?? null;
          if (shown.length < REVIEWS_PER_PAGE) break;
        }
      }
      const searchedFor = joinAnd(tried.map((t) => `"${t.word}"`));
      result.publicReview = { searched: tried, found: Boolean(hit), id: hit?.id ?? null, link: hit?.id ? reviewPageUrl(hit.id) : null };
      if (!hit) {
        if (!words.length) return stop(9, 'reviewLinkNeeded', `The review's words${reviewPic?.written?.form ? ' on the review screenshot (the review being written)' : ''} are too common to search for, and it was not on the first page of "See all reviews", so the dashboard could not tell whether it is public.`, "Ask the user for the review's link, then check this row again.");
        return stop(9, 'reviewNotLive', `The review was not found in the product's public reviews on Amazon, after searching for ${searchedFor}.`, 'It may not be public yet.');
      }
      result.reviewId = hit.id;
      result.liveAt = now().toISOString();
      if (reviewWay === 'picture' && (await reviewIdDuplicate(9, hit.id))) return;
      const noName = reviewWay === 'picture' && !name ? " The review screenshot shows no reviewer's name, so only the words were compared." : '';
      // The name on the review found must be the one in the Reviewer Name column.
      const who = reviewerCheck(hit.name);
      if (who.says) reviewNotes.push(who.says);
      if (!who.ok) flag('reviewerNotMatching', who.says, 'A staff member must check whose review it is.');
      return finish(9, who.ok ? 'pass' : 'fail', `Found the review in the product's public reviews ${tried.length ? `by searching for ${searchedFor}` : 'on the first page of "See all reviews"'}.${noName}${who.ok ? '' : ` ${who.says}`}`);
    });
  } catch (err) {
    if (err instanceof Stopped) {
      result.stopped = true;
      for (const s of result.steps) {
        if (s.state === 'waiting' || s.state === 'running') {
          s.state = 'not-reached';
          s.detail = 'The check was stopped.';
        }
      }
    } else if (err instanceof Paused) {
      for (const s of result.steps) {
        if (s.state === 'waiting' || s.state === 'running') {
          s.state = 'not-reached';
          s.detail = 'The check paused before this step.';
        }
      }
    } else throw err;
  }

  if (!result.stopped && !result.paused) {
    // Steps after a problem were not run: after a screenshot's problem, the review is never looked at.
    for (const s of result.steps) {
      if (s.n < 10 && s.state === 'waiting') {
        s.state = 'not-reached';
        s.detail = outcome.problems ? 'A screenshot has a problem, so the review was not checked.' : `Step ${outcome.step} found a problem, so this step was not run.`;
        emit({ event: 'step', step: { ...s } });
      }
    }
    // ---- 10. Status, Type and Note ----
    // A problem found after the screenshots that needs a staff member (the reviewer's name, the review screenshot) gives the Type when nothing stopped the check.
    const flagged = !outcome && flags.length ? flags[0] : null;
    const typeKey = outcome ? outcome.type : flagged ? flagged.type : ratingOnly ? 'ratingOnly' : 'verified';
    const passed = typeKey === 'verified' || typeKey === 'ratingOnly';
    result.typeKey = typeKey;
    result.type = typeWord(typeKey, settings);
    // The Note starts with the Status and its reason, then says the rest once.
    let final;
    let reason;
    let rest = [];
    if (outcome?.type === 'duplicate') {
      // A duplicate: what it shares and which row is the one checked, then anything else known to be missing.
      const subject = { 2: 'order', 3: 'order', 4: 'delivery', 5: 'delivery', 6: 'review', 7: 'review' }[outcome.step];
      const missing = [];
      // Only cells of columns the file has; the review is given by its screenshot too.
      for (const which of ['order', 'delivery', 'review'].filter((w) => (w === 'review' ? had.reviewLink && !reviewShotThere : had[SHOT_COLUMN[w]]))) {
        if (which === subject) continue;
        const s = row.shots?.[which] ?? {};
        if (!s.links?.length && !s.picture) missing.push(`the ${CELL_WORDS[which]} (${s.text ? `the cell says ${quoted(s.text, 30)}` : 'the cell is empty'})`);
        else if ((which !== 'review' || reviewIsPicture) && (current.pictures[which] ?? []).length && current.pictures[which].every((p) => p.problem)) missing.push(`the ${WHAT[which]}, which could not be opened`);
      }
      final = 'fail';
      reason = `it is a duplicate: ${lowerFirst(outcome.line)}`;
      rest = [...mismatchSaid, missing.length ? `Also missing: ${joinAnd(missing)}.` : null, ...afterWhy];
    } else if (outcome?.problems) {
      // The screenshots' problems: the first that fails the transaction gives the reason, else the first of all; then one sentence for each other.
      const reviewMissing = !reviewCell.links?.length && !reviewCell.picture && !reviewShotThere;
      const failing = outcome.problems.find((p) => p.final === 'fail');
      const main = failing ?? (reviewMissing ? null : outcome.problems[0]);
      final = failing || reviewMissing ? 'fail' : 'manual';
      reason = main ? reasonOf(main) : lowerFirst(reviewMissingSaid());
      rest = [...(main ? detailOf(main) : []), ...outcome.problems.filter((p) => p !== main).map(problemSaid), reviewMissing && main ? reviewMissingSaid() : null];
    } else if (outcome) {
      final = TYPE_FINAL[outcome.type] ?? 'manual';
      reason = lowerFirst(outcome.says[0]);
      rest = [...outcome.says.slice(1), outcome.then, outcome.step >= 6 ? SHOTS_MATCH : null];
    } else if (flagged) {
      final = 'manual';
      reason = lowerFirst(flagged.says);
      rest = [flagged.then, ...flags.slice(1).map((f) => f.says), SHOTS_MATCH];
    } else {
      final = 'pass';
      reason = ratingOnly ? `the purchase screenshot and the delivery screenshot match the form, and ${reviewWay === 'picture' ? 'the review screenshot shows' : 'the review on Amazon is'} a star rating with no written words` : 'the purchase screenshot and the delivery screenshot match the form, and the review is live and public on Amazon';
    }
    result.final = final;
    // The Status column holds only Pass, Fail or Needs Manual Staff Checking.
    result.status = FINAL_WORDS[final];
    result.finalSays = clean(finalSentence(final, reason));
    if (outcome?.type === 'duplicate') result.note = noteOf([result.finalSays, ...rest]);
    else {
      // A row with no campaign for its brand was compared with its product name in the sheet, and its Note says so.
      const bySheetName = had.product && !byCampaign && SHOTS.some((w) => shot[w]?.state === 'read');
      // Said once: when the reason already says there is no campaign, only what that meant for the product.
      const saidNoCampaign = [result.finalSays, ...rest].some((t) => /no campaign/.test(String(t ?? '')));
      const sheetNameSaid = !bySheetName ? null : campaigns.length ? `${cap(joinAnd(campaigns.map((c) => `the campaign "${clean(c.name)}"`)))} ${campaigns.length > 1 ? 'have' : 'has'} no product read from Amazon, so the product was compared with the product name in the sheet.` : saidNoCampaign ? 'The product was compared with the product name in the sheet.' : "There is no campaign for this product's brand, so the product was compared with the product name in the sheet.";
      // Sentences the flagged problems already gave are not said twice.
      const said = new Set(flags.map((f) => f.says));
      result.note = noteOf([result.finalSays, ...rest, ...judgeNotes, ...reviewNotes.filter((t) => !said.has(t)), ...warnings, sheetNameSaid, ...mismatchSaid, ...afterWhy]);
    }
    const s10 = result.steps[9];
    s10.state = passed ? 'pass' : 'fail';
    s10.detail = `${result.status}: ${result.type}.`;
    if (shotsDir && browserOpen && browser?.isOpen?.() && (await browser.shot(join(shotsDir, 'step-10.png')))) s10.shot = `/local/amazon/checks/${checkId}/steps/10`;
  }
  result.seen = seen;
  result.comparison = buildComparison(result);
  result.finishedAt = now().toISOString();
  emit({ event: 'step', step: { ...result.steps[9] }, partial: partial() });
  if (result.paused) say(`Paused: ${result.paused.says}`);
  else if (!result.stopped) say(`Done: ${result.status} (${result.type})`);
  emit({ event: 'done', result });
  return result;
}

/**
 * The comparison table: Field, Sheet, Purchase screenshot, Delivery
 * screenshot, Amazon, Result. For the four details, each screenshot shows
 * what it read and whether that is the same as the sheet, different or not
 * shown. ok is true, false, or null for "not compared". Only the details the
 * file has a column for are in it (r.compared), and only the screenshots it
 * has (r.shotsHad).
 */
export function buildComparison(r) {
  const s = r.sheet ?? {};
  const shots = { order: r.order, delivery: r.delivery };
  const had = Array.isArray(r.shotsHad) ? SHOTS.filter((w) => r.shotsHad.includes(w)) : SHOTS;
  const compared = Array.isArray(r.compared) ? r.compared : DETAILS;
  const a = r.amazon;
  const p = r.reviewPicture;
  const rows = [];
  const add = (field, sheet, order, delivery, amazon, result, ok) => rows.push({ field, sheet: sheet || '', order: order || '', delivery: delivery || '', amazon: amazon || '', result, ok });
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
      // A slip of one digit on one screenshot, with the ID exact on the other, was taken as a reading slip.
      if (k === 'orderId' && diff.length === 1 && same.length === 1 && r.judged?.orderIdSlip) return [`${sameSaid} on ${named(same)}; read one digit off on ${named(diff)}, taken as a reading slip.`, true];
      if (diff.length) return [campaign ? `Not one of the campaign's products on ${named(diff)}.` : `Different on ${named(diff)}.`, false];
      if (same.length === 2) return [campaign ? "One of the campaign's products on both screenshots." : 'The same on both screenshots.', true];
      if (same.length && same.length === all.length) return [`${sameSaid} on ${named(same)}.`, true];
      if (same.length && hidden.length) {
        // The delivery screenshot need not show the order ID; the product may show only the start of its name, or be tied to the order by its ID (judged).
        const judged = k === 'orderId' ? same.some((x) => x.w === 'order') : r.judged?.product ? r.judged.product.order && r.judged.product.delivery : null;
        return [`${sameSaid} on ${named(same)}; not shown${hidden.some((x) => shots[x.w]?.details?.[k]?.part) ? ' in full' : ''} on ${named(hidden)}.`, judged];
      }
      if (hidden.length) return [`Not shown on ${hidden.length === 2 ? 'either screenshot' : named(hidden)}.`, false];
      return same.length ? [`The same on ${named(same)}, but the other screenshot was not read.`, false] : ['Not compared.', null];
    }
    if (diff.length) return [`Different on ${named(diff)}.`, false];
    if (same.length) return [`The same on ${named(same)}.`, true];
    if (hidden.length === 2) return ['Not shown on either screenshot.', false];
    return hidden.length ? [`Not shown on ${named(hidden)}.`, null] : ['Not compared.', null];
  };
  const productAmazon = a?.productTitle ? a.productTitle : p?.productLines?.length ? `(review screenshot) ${p.productLines[0]}` : null;
  for (const [k, field, sheet] of [['orderId', 'Order ID', s.orderId], ['orderDate', 'Order date', s.orderDate], ['amount', 'Amount', s.amount], ['product', 'Product', s.product]].filter(([k]) => compared.includes(k))) {
    const [result, ok] = verdict(k);
    // With a campaign, the product name in the sheet is not compared.
    const said = k === 'product' && byCampaign && sheet ? `${sheet} (not compared: the campaign's products are used)` : sheet;
    add(field, said, cell('order', k), cell('delivery', k), k === 'product' ? productAmazon : null, result, ok);
  }
  const d = r.delivery;
  if (had.includes('delivery')) add('Delivered', null, null, !d ? 'Not read' : d.ok === false ? 'Could not be read' : d.delivered ? d.deliveredText : 'Not shown', null, !d || d.ok === false ? 'Not read.' : d.delivered ? 'The delivery screenshot says Delivered.' : 'It does not say Delivered.', !d || d.ok === false ? null : d.delivered);
  const stars = a?.stars ? `${a.stars} stars` : p?.stars ? `(review screenshot) ${p.stars} stars` : null;
  add('Rating', null, null, null, stars, stars ? 'Read.' : a || p ? 'Not read.' : 'Not reached', stars ? true : null);
  const words = a ? a.body ?? a.title : p?.written?.body ?? null;
  add('Written review', null, null, null, words ? (a ? words : `(review screenshot) ${words}`) : a || p ? 'None' : null, words ? 'Written words.' : a || p ? 'No written words.' : 'Not reached', null);
  const pub = r.publicReview;
  add('Live and public', null, null, null, pub?.found ? 'Found' : pub ? 'Not found' : null, !pub ? (r.typeKey === 'ratingOnly' ? 'Not needed for a rating only.' : 'Not searched') : pub.found ? `Found under "See all reviews"${pub.searched?.length ? ` by searching for ${pub.searched.map((t) => `"${t.word}"`).join(' and ')}` : ''}.` : `Not found${pub.searched?.length ? ` (searched for ${pub.searched.map((t) => `"${t.word}"`).join(' and ')})` : ''}.`, pub ? Boolean(pub.found) : null);
  return rows;
}
