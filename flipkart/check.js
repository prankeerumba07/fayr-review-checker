// A Flipkart row's check, in steps a person can watch, the way the Amazon
// checker checks a row (amazon/check.js), copied and changed for Flipkart.
// Its steps are the Amazon check's, in the same order, changed to the Flipkart
// way of checking (FLIPKART-PLAN.md point 8): the purchase screenshot, the
// delivery screenshot, the review screenshot (the main proof on Flipkart,
// where many rows have no review link), finding the review among Flipkart's
// public reviews, comparing the reviewer's name and the review's words, and
// the Status, Type and Note. For now these steps run: the steps that get the
// screenshots (screenshots.js), each one's pictures downloaded or kept with
// the reason they could not be had, said in the Amazon checker's words; step
// 2, which reads the purchase screenshot on this computer (shot-read.js) and
// compares it with the sheet, as the Amazon checker's step 3 does: the order
// ID, the order date (only when the file has that column), the amount and the
// product are each the same, different or not shown; and step 4, which reads
// the delivery screenshot the same way, as the Amazon checker's step 5 does:
// it must say Delivered, and when the two screenshots show different order
// IDs, it says both (FLIPKART-PLAN.md point 6); and step 6, which reads the
// review screenshot (review-read.js), as the Amazon checker's step 7 reads
// one: the rating, the review's title and words, the reviewer's name and the
// date, or Flipkart's message that the review was not accepted or that only a
// rating was given; of several reviews, only the user's; and the first part
// of step 7, finding the review among Flipkart's public reviews: the campaign
// product's own page on Flipkart, then "See all reviews", newest first, read
// once in a checking run and kept on this computer for every row (routes.js,
// reviews.js), with the day from which a review can be the user's (the
// delivery day, else the order day). The product is compared by
// its name with the products of the live campaigns the row uses, by their
// real names read from Flipkart, or, with no live campaign, with its product
// name in the sheet. A detail that is not shown, or could not be read, is
// never called different and never passes. Both screenshots are read, even
// when the first has a problem; then the comparison table puts the sheet and
// the two screenshots side by side. Every other step, and searching the
// reviews read, says it comes in a later step, and the row gets no Status: it
// stays "Not checked yet". No one
// logged in to Google, a login using the Live Amazon Browser,
// Google's login page, or Flipkart's robot check, a block or a page too slow
// pauses the check, as on Amazon: the row gets no result, nothing is got
// around, and the row can be checked again later.

import { randomBytes } from 'node:crypto';
import { downloadable } from './screenshots.js';
import { readOrderShot, readDeliveryShot } from './shot-read.js';
import { NOT_DELIVERED_WORDS, parseDelivery } from './delivery-read.js';
import { readReviewShot } from './review-read.js';
import { matchReview } from './review-match.js';
import { indiaDay, reviewsPageLink } from './review-page.js';
import { linkLabel, isShortLink } from './links.js';
import { DEFAULT_MARKS } from './settings.js';
import { shortName } from './campaigns.js';
import { wordsOf, productWords } from './text.js';
import { sameDay, amountMatch, totalRead, totalShown, priceDetailsShown, partialOrderId, rupees, productShown, holdsWord, dayFirst, nameStartShown, enoughOfName, nameLineStarting, brandWordsAtStart, nameCouldBe, datesOnce, nameAsShown, productNames } from './screen-text.js';

export const STEP_NAMES = [
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
/** The steps that open a screenshot, with its cell, and the steps that read one; every other step comes in a later step. */
const OPENS = { 1: 'order', 3: 'delivery', 5: 'reviewShot' };
const READS = { 2: 'order', 4: 'delivery' };
/** What each step was doing, for "Something went wrong on this computer while …". */
const STEP_DOING = ['opening the purchase screenshot', 'reading the purchase screenshot', 'opening the delivery screenshot', 'reading the delivery screenshot', 'opening the review screenshot', 'reading the review screenshot', "finding the review among Flipkart's public reviews", "comparing the reviewer's name and the review's words", 'writing the Status, Type and Note'];
/** The Amazon checker's words for a check paused by a download (amazon/check.js): the screenshots on Google Drive are downloaded through the same Google login. */
export const PAUSE_SAYS = {
  'google-out': 'No one is logged in to Google, so the screenshots on Google Drive cannot be downloaded. Press "Log in to Google" in the top bar and log in there, then press "Carry on checking".',
  'google-signin': 'Google asked to log in, so the screenshots on Google Drive cannot be downloaded. Press "Log in to Google" in the top bar and log in there, then press "Carry on checking".',
  'google-robot': 'Google showed a robot check while a screenshot was being downloaded. This dashboard never answers a robot check. Press "Carry on checking" when you are ready.',
  'google-blocked': 'Google Drive refused to give a screenshot just now. Wait a while, then press "Carry on checking".',
  // While Flipkart's reviews are read in the Live Flipkart Browser (step 7), as the Amazon checker pauses for Amazon's pages.
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
/** Each cell's column, as the file's columns are named (workbook.js). */
const SHOT_COLUMN = { order: 'orderShot', delivery: 'deliveryShot', review: 'reviewLink', reviewShot: 'reviewShot' };
/** The two screenshots compared with the sheet. */
const SHOTS = ['order', 'delivery'];

// Copied from the Amazon checker's Notes (amazon/notes.js): words from the sheet are quoted, and never carry a word this dashboard must not show.
const HIDDEN = ['ZmF5cg==', 'cmVmdW5k', 'Y2FzaGJhY2s=', 'cmV3YXJk'].map((b) => Buffer.from(b, 'base64').toString('utf8'));
const HIDDEN_RE = new RegExp(`[\\p{L}\\p{N}]*(?:${HIDDEN.join('|')})[\\p{L}\\p{N}]*`, 'giu');
const clean = (text) => String(text ?? '').replace(HIDDEN_RE, '…');
function excerpt(text, n = 160) {
  const t = clean(String(text ?? '').replace(/\s+/g, ' ').trim());
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}
const oneSentence = (text) => String(text ?? '').replace(/([.!?])+\s+(?=\S)/g, '; ');
const quoted = (text, n) => `"${oneSentence(excerpt(text, n))}"`;

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
 * check found it: step 7's own day, else the day on the delivery screenshot's
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
// Copied from amazon/final.js: two numbers one digit apart (one digit different, or one left out or read in), as a reading slip makes them.
function oneDigitOff(a, b) {
  const x = String(a ?? '').replace(/\D/g, '');
  const y = String(b ?? '').replace(/\D/g, '');
  if (!x || !y || x === y || Math.abs(x.length - y.length) > 1) return false;
  if (x.length === y.length) return [...x].filter((c, i) => c !== y[i]).length === 1;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return [...long].some((_, i) => long.slice(0, i) + long.slice(i + 1) === short);
}
const amountOneDigitOff = (v, sheetAmount) => Number.isFinite(v) && Number.isFinite(sheetAmount) && oneDigitOff(Math.round(v), Math.round(sheetAmount));

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
 *   row — the row as kept (store.js)
 *   has — the columns the file has: { orderDate, amount, product, orderShot, deliveryShot, reviewShot, reviewLink }, each true unless false
 *   screenshots — screenshots.js: forCell(rowId, which, { signal })
 *   marks — Flipkart's passing marks (settings.js): { productNameShare, amountDifferenceRupees, feeAllowanceRupees }
 *   campaigns — the live campaigns the row uses (campaigns.js campaignsFor): { name, brand, products: [{ pid, name, short, variants }] }
 *   readOrder(files, { want }) — what the purchase screenshot says (shot-read.js readOrderShot)
 *   readDelivery(files, { want }) — what the delivery screenshot says (shot-read.js readDeliveryShot)
 *   readReview(files, { reviewer, productIs }) — what the review screenshot says (review-read.js readReviewShot)
 *   reviewer — the reviewer named in the sheet, which finds the user's review among several on the review screenshot
 *   reviews(pid, { rowId, day, onPage, signal }) — Flipkart's public reviews of a campaign's product, read once in a checking run and kept on this computer (routes.js, reviews.js readProductReviews); day is the oldest day this row needs
 *   emit(event) — started, action, step and done lines for the screen; a step's line carries what was read so far (partial)
 * -> the result: { checkId, rowId, n, name, startedAt, finishedAt, seconds, steps, sheet, order, delivery, review, reviewsFrom, flipkart, found, compared, shotsHad, comparison, paused, stopped }
 */
export async function runCheck({ row, has = null, screenshots, marks = DEFAULT_MARKS, campaigns = [], readOrder = readOrderShot, readDelivery = readDeliveryShot, readReview = readReviewShot, reviewer = null, reviews = null, emit = () => {}, signal = null, checkId = newCheckId(), now = () => new Date() }) {
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
    steps: STEP_NAMES.map((name, i) => ({ n: i + 1, name, state: 'waiting', detail: null })),
    // What the sheet says of the details compared, as it is written there, for the comparison table.
    sheet: { orderId: row.orderId?.text ?? '', orderDate: row.orderDate?.text ?? '', amount: row.amount?.text ?? '', product: label },
    // What each screenshot says, as read on this computer, with each detail compared (steps 2 and 4).
    order: null,
    delivery: null,
    // What the review screenshot says, as read on this computer (step 6).
    review: null,
    // From which day a review can be the user's, and Flipkart's reviews as read for this row (step 7).
    reviewsFrom: null,
    flipkart: null,
    found: null,
    // What was compared, and the screenshots the file has: the comparison shows only those.
    compared,
    shotsHad: SHOTS.filter((w) => had[SHOT_COLUMN[w]]),
    // The sheet and the two screenshots side by side (buildComparison), once the check has finished.
    comparison: [],
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
    // What was read so far for the row's page; what step 7 read and found once it has.
    emit({ event: 'step', step: { ...s }, partial: { order: result.order, delivery: result.delivery, review: result.review, ...(result.flipkart ? { flipkart: result.flipkart } : {}), ...(result.found ? { found: result.found } : {}) } });
  }
  /** A step that is not part of the check yet: it says it comes in a later step. */
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
  async function step(n, fn) {
    try {
      await fn();
    } catch (err) {
      if (err instanceof Stopped || err instanceof Paused) throw err;
      finish(n, 'fail', `Something went wrong on this computer while ${STEP_DOING[n - 1]}. Check this row again.`);
    }
  }

  /** Each screenshot's cell as its opening step left it: 'no column', 'missing', 'unopened' or 'opened', with its pictures. */
  const shot = {};
  /** The days steps 2 and 4 read: { order: the purchase screenshot's dates that can be the order's, delivery: the Delivered line's date }. */
  const daysRead = {};
  /** A cell's pictures, downloading again any that could not be had; a download that cannot be made just now pauses the check here. */
  async function fetchCell(n, which) {
    const g = await screenshots.forCell(row.id, which, { signal });
    checkStop();
    if (g?.pause) {
      const says = g.says ?? PAUSE_SAYS[g.pause] ?? 'The screenshot could not be downloaded just now.';
      pauseAt(n, g.pause, says, `${says.split('. ')[0].replace(/\.$/, '')}. The check paused here, before the ${WHAT[which]} was downloaded; nothing was got around.`);
    }
    return g;
  }

  /** Steps 1, 3 and 5: a screenshot's cell, and its pictures downloaded (amazon/check.js openShot). */
  async function openShot(n, which) {
    start(n, `Opening the ${WHAT[which]}`);
    if (!had[SHOT_COLUMN[which]]) {
      shot[which] = { state: 'no column' };
      return finish(n, 'fail', `The file has no ${WHAT[which]} column.`);
    }
    const s = row.shots?.[which] ?? {};
    if (!s.links?.length && !s.picture) {
      shot[which] = { state: 'missing' };
      return finish(n, 'fail', s.text ? `The cell says ${quoted(s.text, 60)} instead of holding a screenshot.` : 'The cell is empty.');
    }
    const g = await fetchCell(n, which);
    if (!g.files.length) {
      shot[which] = { state: 'unopened' };
      return finish(n, 'fail', problemLine(which, g.problems[0] ?? { kind: 'access', site: null, says: 'it could not be opened' }));
    }
    shot[which] = { state: 'opened', files: g.files };
    return finish(n, 'pass', `Opened ${g.files.length === 1 ? `the ${WHAT[which]}` : `${g.files.length} ${WHAT[which]}s`}.`);
  }

  // ---- steps 2 and 4: each screenshot read, and each detail compared with the sheet (amazon/check.js readShot and detailsOf) ----
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

  /** Steps 2 and 4: the screenshot read on this computer, and each detail compared with the sheet. */
  async function readShot(n, which) {
    const was = shot[which]?.state;
    if (was !== 'opened') {
      const why = was === 'no column' ? `The file has no ${WHAT[which]} column, so there is nothing to read.` : was === 'missing' ? `There is no ${WHAT[which]} to read.` : `The ${WHAT[which]} could not be opened, so it was not read.`;
      return finish(n, 'not-reached', why);
    }
    start(n, `Reading the ${WHAT[which]}`);
    // A screenshot is read again the other ways when it lacks what the sheet gives: the order ID, the amount, and on the purchase screenshot the product.
    const want = { orderId: sheetId || null, amount: sheetAmount, tolerance, allowance, product: which === 'order' && had.product ? productTold : null };
    const r = await (which === 'order' ? readOrder : readDelivery)(shot[which].files, { want });
    checkStop();
    // The days read, for step 7: the order's on the purchase screenshot, the delivery's on the delivery screenshot.
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
    if (!r.ok) return finish(n, 'fail', `It could not be read: ${r.problem ?? 'its words are not clear enough to read'}.`);
    const details = detailsOf(which, r);
    record.details = details;
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
   * Step 6: the review screenshot read on this computer, as the Amazon
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
      note: text(r.note),
      others: Number.isInteger(r.others) ? r.others : 0,
      why: text(r.why),
      text: clean(r.text ?? ''),
    };
    const v = result.review;
    if (!r.ok) return finish(n, 'fail', `It could not be read: ${r.problem ?? 'its words are not clear enough to read'}.`);
    if (v.kind === 'refused') return finish(n, 'fail', `It shows a message from Flipkart that the review was not accepted: ${quoted(v.message, 200)}.`);
    // What the screen does not show ("My Reviews" lists pending reviews too; the review being written is not posted) ends the line.
    const note = v.note ? ` ${v.note}` : '';
    if (v.kind === 'rating') return finish(n, 'pass', `${v.stars} stars and no written words.${note}`);
    const among = v.others ? `, one of ${v.others + 1} reviews it shows` : '';
    // As the Amazon checker says it: the review's own words, quoted, end its line (then the note, as a sentence of its own).
    const said = quoted(v.body ?? v.title, 100);
    const words = `${said}${note ? `${/[.!?…]["”]$/.test(said) ? '' : '.'}${note}` : ''}`;
    if (v.kind === 'written' && v.form) return finish(n, 'pass', `The review being written: ${words}`);
    if (v.kind === 'written') return finish(n, 'pass', `A written review${v.name && !/flipkart\s+customer/i.test(v.name) ? ` by ${quoted(v.name, 40)}` : ''}${among}: ${words}`);
    return finish(n, 'fail', `It does not clearly show a written review, a star rating only or a message from Flipkart, because ${v.why}.${note}`);
  }

  // ---- step 7: finding the review among Flipkart's public reviews (FLIPKART-PLAN.md point 4) ----

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
    const dates = daysRead.order ?? [];
    const marked = dates.filter((d) => d.labelled).map((d) => dayOf(d, today)).find(Boolean);
    const ordered = marked ?? dates.map((d) => dayOf(d, today)).filter(Boolean).sort()[0] ?? null;
    if (ordered) return { day: ordered, from: 'order', said: `the day the order was placed (${dayFirst(ordered)}, on the purchase screenshot, as the delivery screenshot shows no delivery day)` };
    return { day: null, from: null, said: 'neither the delivery screenshot nor the purchase screenshot shows a day' };
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
   * Step 7: finding the review among Flipkart's public reviews, as staff
   * would: the campaign product's own page on Flipkart, then "See all
   * reviews", newest first (reviews.js readProductReviews), read once in a
   * checking run and kept on this computer for every row (routes.js); then
   * the review screenshot's words and name searched for among them
   * (review-match.js), only reviews posted on or after the day the order was
   * delivered (else placed) counting (reviewsFrom). Found, it passes, with
   * the stars Flipkart shows; words under another name, or under "Flipkart
   * Customer", two reviews that fit, or none, it fails, saying which. A row
   * with nothing to search with opens nothing. A robot check, a block or a
   * page that takes too long pauses the check, as on Amazon, and nothing is
   * got around; but a review found among the pages read before it is found.
   */
  async function findReviewStep(n) {
    if (!reviews) return later(n);
    start(n, "Finding the review among Flipkart's public reviews");
    result.reviewsFrom = reviewsFrom();
    const nothing = nothingToSearch();
    if (nothing) return finish(n, 'not-reached', `${nothing}, so there is nothing to search with.`);
    if (!byCampaign) return finish(n, 'not-reached', "The row uses no live campaign with a product read from Flipkart, so there is no product's page to find the review on.");
    const product = boughtProduct();
    if (!product) return finish(n, 'not-reached', "Which of the campaign's products was bought could not be told from the purchase screenshot, so it is not known whose reviews to search.");
    const got = await reviews(product.pid, {
      rowId: row.id,
      signal,
      day: result.reviewsFrom.day,
      onPage: (p) => say(p === 0 ? "Opening the product's page on Flipkart" : `Reading page ${p} of Flipkart's reviews, newest first`),
    });
    checkStop();
    const kept = (got.reviews ?? []).length;
    const oldest = (got.reviews ?? []).map((r) => r.date).filter(Boolean).sort()[0] ?? null;
    result.flipkart = { pid: product.pid, name: got.product?.name ?? product.name ?? null, readAt: got.readAt ?? null, reused: Boolean(got.reused), pages: got.pages ?? 0, count: kept, total: got.total ?? null, end: got.end ?? null, since: got.since ?? null, oldest, says: got.says ?? null };
    const pause = got.end === 'prevented' ? `flipkart-${got.prevented ?? 'blocked'}` : READING_PAUSES[got.end];
    // Searched even when the reading stopped part way: a review found among the pages read is found, and nothing more is needed.
    const day = result.reviewsFrom.day;
    const m = kept && got.end !== 'none' ? matchReview({ shot: result.review, sheetName: reviewer, reviews: got.reviews, day, avoid: [product.name ?? '', got.product?.name ?? ''] }) : null;
    result.found = m ? { how: m.how, count: m.count, nameFrom: m.name.from, counted: m.counted, nameOnly: m.nameOnly, before: m.before, share: m.share, rareShare: m.rareShare, review: m.review ? { id: m.review.id ?? null, name: m.review.name ?? null, stars: m.review.stars ?? null, title: m.review.title ?? null, text: m.review.text ?? null, dateSaid: m.review.dateSaid ?? null, date: m.review.date ?? null, dateLatest: m.review.dateLatest ?? null, page: m.review.page ?? null, pageLink: Number.isInteger(m.review.page) ? reviewsPageLink(got.link, m.review.page) : null } : null } : null;
    if (pause && m?.how !== 'found') pauseAt(n, pause, PAUSE_SAYS[pause], `${got.says} The check paused here; nothing was got around.`);
    if (got.end === 'none' || !kept) return finish(n, 'fail', got.says ?? "Flipkart's reviews could not be read.");
    const how = got.reused || (got.wentOn && !got.opened) ? ' They were read earlier and kept on this computer, so Flipkart was not opened again.' : got.wentOn ? ` The reading went on from page ${got.wentOn}, where it had stopped, keeping the ${got.wentOn === 2 ? 'page' : 'pages'} read before.` : '';
    // "1 month ago" is a day only roughly: the oldest review read, about then.
    const rough = (got.reviews ?? []).some((r) => r.date === oldest && r.dateLatest !== r.date);
    const reach = oldest ? `back to ${rough ? 'about ' : ''}${dayFirst(oldest)}` : null;
    // Flipkart may show fewer reviews than it counts: then older ones cannot be read at all.
    const hidden = got.end === 'last page' && Number.isInteger(got.total) && got.total > kept;
    const back = got.end === 'last page' ? `all the reviews Flipkart shows${hidden ? `, ${kept} of the ${got.total.toLocaleString('en-IN')} it counts` : ''}${reach ? `, ${reach}` : ''}` : reach ? `${reach}${got.end === 'limit' ? ', the most read at one time' : got.end === 'date' && got.since ? `; the rows need reviews back to ${dayFirst(got.since)}` : ''}` : 'their dates could not be read';
    const rule = day ? `Reviews posted on or after ${result.reviewsFrom.said} can be the user's.` : `The date is not used for this row: ${result.reviewsFrom.said}.`;
    const reading = pause ? `${got.says} The review was found among the pages read before that.` : `Read ${kept === 1 ? '1 review' : `${kept} reviews`} of the product from ${got.pages === 1 ? '1 page' : `${got.pages} pages`} of "See all reviews" on Flipkart, newest first (${back}).${how}`;
    const [state, said] = foundSaid(m, got, oldest);
    return finish(n, state, `${said} ${reading} ${rule}`);
  }
  /** Step 7's result, in plain words, never a review's words: [state, sentence]. */
  function foundSaid(m, got, oldest) {
    const v = result.review;
    const r = m.review;
    const many = (k, one, more) => (k === 1 ? one : more);
    const whose = m.name.from === 'screenshot' ? 'the name on the review screenshot' : m.name.from === 'sheet' ? "the reviewer's name in the sheet" : null;
    const at = r?.page ? ` (page ${r.page} of "See all reviews")` : '';
    if (m.how === 'noWords') return ['later', 'The review screenshot shows no words to search for; the review link is opened in a later step.'];
    if (m.how === 'found') {
      const exact = r.date && r.date === r.dateLatest ? ` (${dayFirst(r.date)})` : '';
      const shown = [Number.isInteger(r.stars) ? `it has ${r.stars} ${many(r.stars, 'star', 'stars')}` : null, r.dateSaid ? `it was posted ${r.dateSaid}${exact}` : null].filter(Boolean).join(', and ');
      const live = v?.form || v?.pending ? ' Finding it among Flipkart\'s public reviews shows the review is live.' : '';
      return ['pass', `Found the review among Flipkart's public reviews${at}: its words match the review screenshot's, and it is under ${whose}.${shown ? ` On Flipkart ${shown}.` : ''}${live}`];
    }
    if (m.how === 'several') return ['fail', `${m.count} reviews under ${whose} have the review screenshot's words, so which one is the user's could not be told; none is picked.`];
    if (m.how === 'otherName') return ['fail', `The review screenshot's words match ${many(m.count, 'a review', `${m.count} reviews`)} under another name${at}, not under ${whose}, so ${many(m.count, 'it is', 'they are')} not counted as found.`];
    if (m.how === 'noName') return ['fail', `The review screenshot's words match ${many(m.count, 'a review', `${m.count} reviews`)}${at}, but Flipkart shows no name for ${many(m.count, 'it', 'them')} ("Flipkart Customer"), so the name could not be checked; ${many(m.count, 'it is', 'they are')} not counted as found.`];
    if (m.how === 'noNameToCheck') return ['fail', `The review screenshot's words match ${many(m.count, 'a review', `${m.count} reviews`)}${at}, but there is no reviewer's name on the review screenshot or in the sheet to check ${many(m.count, 'it', 'them')} with, so ${many(m.count, 'it is', 'they are')} not counted as found.`];
    const day = result.reviewsFrom.day;
    const which = day ? `that can be posted on or after ${dayFirst(day)}` : 'read';
    const under = whose ? ` under ${whose}` : '';
    const none = m.counted === 0 ? `none of the reviews read can be posted on or after ${dayFirst(day)}` : m.counted === 1 ? `the only review ${which} does not have the review screenshot's words${under}` : `none of the ${m.counted} reviews ${which} has the review screenshot's words${under}`;
    const notes = [];
    if (m.nameOnly) notes.push(`${many(m.nameOnly, 'A review', `${m.nameOnly} reviews`)} under that name ${many(m.nameOnly, 'is', 'are')} there, but ${many(m.nameOnly, 'its', 'their')} words do not match.`);
    if (m.before) notes.push(`${many(m.before, 'A review', `${m.before} reviews`)} with these words under that name ${many(m.before, 'was', 'were')} posted before ${dayFirst(day)}, so ${many(m.before, 'it does', 'they do')} not count.`);
    const hidden = got.end === 'last page' && Number.isInteger(got.total) && got.total > (got.reviews ?? []).length;
    if (oldest && day && day < oldest && (got.end !== 'last page' || hidden)) notes.push(`The order was ${result.reviewsFrom.from === 'delivery' ? 'delivered' : 'placed'} on ${dayFirst(day)}, before the oldest review ${hidden ? 'Flipkart shows, so the review may be among the older ones it does not show' : 'read, so the review may be among older reviews not read yet'}.`);
    return ['fail', `Not found among Flipkart's reviews: ${none}.${notes.length ? ` ${notes.join(' ')}` : ''}`];
  }

  emit({ event: 'started', checkId, steps: STEP_NAMES, rowId: row.id, row: row.row ?? null, name: result.name });
  try {
    for (let n = 1; n <= STEP_NAMES.length; n++) {
      const which = n === 5 ? reviewCell(row, had) : OPENS[n];
      if (which) await step(n, () => openShot(n, which));
      else if (READS[n]) await step(n, () => readShot(n, READS[n]));
      else if (n === 6) await step(n, () => readReviewStep(n, reviewCell(row, had)));
      else if (n === 7) await step(n, () => findReviewStep(n));
      else later(n);
    }
  } catch (err) {
    if (err instanceof Stopped) result.stopped = true;
    else if (!(err instanceof Paused)) throw err;
  }
  // The sheet and the two screenshots side by side, as the Amazon checker's comparison table shows them.
  result.comparison = buildComparison(result);
  result.finishedAt = now().toISOString();
  result.seconds = Math.max(0, Math.round((Date.now() - began) / 1000));
  if (result.paused) say(`Paused: ${result.paused.says}`);
  else if (!result.stopped) say('Done. The other steps come in a later step, so this row has no Status yet.');
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
    if (hidden.length === 2) return ['Not shown on either screenshot.', false];
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
