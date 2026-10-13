// What a Flipkart review screenshot shows, from the words Tesseract read on
// this computer: the star rating, the review's title and words, the
// reviewer's name and the date, or Flipkart's message that the review was not
// accepted or that only a rating was given. Copied from the Amazon checker
// (amazon/shot-read.js: classifyReviewPicture, pickReview and
// readReviewPicture, with isNoise and photoLine), only what reading a review
// screenshot needs, and changed only for Flipkart's screens:
//   - a product's reviews in Flipkart's app: "★★★★★ 5.0 • Title", the words, "Name, City", "7 Helpful" and
//     "Verified Purchase · 1 day ago" under each review;
//   - the reviews on Flipkart's website, and the user's own there ("My Reviews"): "5★ Title", the words, then
//     "Name ✓ Certified Buyer, City" with the date ("12 Sep, 2026", "3 months ago"), and "Edit Delete Share"
//     under the user's own;
//   - "My Reviews" in the app: the user's own review, with "Delete" and "Edit" under it and no name;
//   - the review being written: "Share your experience" … "Tell us more" in the app; "Review this product",
//     "Description" and "Title (optional)" on the website. Neither shows a name.
// A rating Flipkart draws as stars, rather than writing it as a number, is not
// counted: the Amazon checker counts its orange stars by their colour in a
// hidden Chrome, which Flipkart's reading does not have, so it is not shown.
// Nothing is guessed: a part not read clearly is null. No API key, nothing
// sent anywhere.

import { readText, SECOND_LOOK_SCALE } from './shot-read.js';
import { wordsOf, closeWords, normalizeText } from './text.js';

/** Flipkart's words for a review it did not accept. */
export const REVIEW_REFUSED = /\breview\b[^.!?]{0,40}?\b(?:was|has\s+been|is)\s+(?:rejected|removed|declined|not\s+(?:accepted|approved|published))\b|\b(?:could|can)\s*(?:not|n'?t)\s+(?:be\s+)?publish(?:ed)?\b|\bnot\s+eligible\s+to\s+(?:review|rate|write)\b|\bdo(?:es)?\s*(?:n'?t|not)\s+(?:meet|follow)\s+(?:our|the|flipkart'?s)\s+(?:review\s+|community\s+)?guidelines\b|\bviolat\w*\s+(?:our|the|flipkart'?s)\s+(?:review\s+|community\s+)?guidelines\b|\bunable\s+to\s+(?:accept|publish)\b/i;
/** Flipkart's words for a rating given with no review. */
export const RATING_ONLY = /\bthanks?\s+(?:you\s+)?for\s+(?:the\s+|your\s+)?rating\b|\byou\s+(?:have\s+)?rated\b|\brating\s+(?:has\s+been\s+)?submitted\b/i;

// The lines that end a review: "Name ✓ Certified Buyer, City", "Verified Purchase · 1 day ago", and "Edit Delete" under the user's own.
const CERTIFIED = /certified\s*buyer/i;
const VERIFIED = /verified\s*(?:purchase|buyer)/i;
const OWN_END = /^\W*(?:\p{L}{1,2}\W+)?(?:edit\W+delete|delete\W+edit)\b/iu;
const HELPFUL = /\bhelpful\b/i;
// A rating Flipkart writes as a number: "5★" at the start of a line on its website (its star read as "*" or "%"), "5.0" after
// the stars in its app.
const RATING = /^[^\p{L}\d]{0,3}([1-5])(?:\.0)?\s*[★*✰☆%](?!\S)|(?:^|[^\d.,])([1-5])\.0(?![\d.,])/u;
const AGO = /\b(?:\d{1,2}|a|an|one)\s+(?:day|week|month|year)s?\s+ago\b|\btoday\b|\byesterday\b/i;
const DAY = /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s+\d{4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s+\d{4}\b/i;
// The screen's own lines in a review: what it is for ("Review for: Colour Blue"), "READ MORE", the user's own reviews' heading and tabs.
const REVIEW_FOR = /^\W*review\s+for\s*:/i;
const READ_MORE = /^\W*read\s+more\W*$/i;
const OWN_PAGE = /\bmy\s+reviews\b|\breviews?\b.{0,20}\bby\s+you\b/i;
const TABS = /^\W*pending\W+published\W*$/i;
// The phone's top bar, which starts with the time ("9:41").
const TOP_BAR = /^\W{0,2}\d{1,2}:\d{2}(?!\d)/;
// The review being written.
const FORM_APP = /\bshare\s+your\s+experience\b/i;
const FORM_APP_WORDS = /^\W*tell\s+us\s+more\W*$/i;
const FORM_WEB = /^\W*review\s+this\s+product\W*$/i;
const FORM_DESCRIPTION = /^\W*description\W*$/i;
const FORM_TITLE = /^\W*title\s*\(?optional\)?\W*$/i;
const FORM_END = /^\W*submit\W*$|^\W*home\b.*\b(?:account|cart)\b/i;
// Flipkart's page once a review is sent: it does not show the review.
const SUBMITTED = /\bthank(?:s|\s+you)\s+for\s+(?:your\s+)?review(?:ing)?\b|\breview\s+(?:has\s+been\s+)?submitted\b/i;

/** A line that is only noise read from stars or icons, copied from the Amazon checker: fewer than three letters, one or two letters over and over, or a few words of three letters or fewer. */
export function isNoise(t) {
  const letters = String(t ?? '').match(/\p{L}/gu) ?? [];
  if (letters.length < 3) return true;
  if (new Set(letters.map((c) => c.toLowerCase())).size <= 2) return true;
  const words = String(t).split(/\s+/).filter((w) => /\p{L}/u.test(w));
  return words.length <= 3 && words.every((w) => (w.match(/\p{L}/gu) ?? []).length <= 3);
}

/** Words printed on the product in a photo, copied from the Amazon checker: four words or fewer, almost all in capitals. */
export function photoLine(t) {
  const letters = String(t).match(/\p{L}/gu) ?? [];
  if (letters.length < 3) return false;
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  return wordsOf(t).filter((w) => /\p{L}/u.test(w)).length <= 4 && upper / letters.length >= 0.8;
}

const tidy = (t) => String(t ?? '').replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}"'“‘(]+/u, '').replace(/[\s|=_~©®@•·*>-]+$/u, '').trim();
const nameParts = (t) => normalizeText(String(t ?? '').replace(/(?:\.{2,}|…)\s*$/, '')).split(' ').filter((x) => /\p{L}/u.test(x));

/**
 * True when a name on a screenshot can be `wanted` (the reviewer named in the
 * sheet): each word shown is one of its words (a slip allowed) or its first
 * letter, and a name Flipkart cut short ("Test Revi...") may end with the
 * start of one; at least one word of three letters or more. "Flipkart
 * Customer", Flipkart's word for a name not shown, never is.
 */
export function nameFits(wanted, shown) {
  const w = nameParts(wanted);
  const s = nameParts(shown);
  if (!w.length || !s.length || /flipkart\s+customer/i.test(String(shown))) return false;
  const cut = /(?:\.{2,}|…)\s*$/.test(String(shown).trim());
  return s.some((x) => x.length >= 3) && s.every((x, i) => w.some((y) => closeWords(x, y) || (x.length === 1 && y.startsWith(x)) || (cut && i === s.length - 1 && x.length >= 2 && y.startsWith(x))));
}

/** The reviews a screenshot shows, each the lines up to and with the line that ends it ("Certified Buyer", "Verified Purchase", "Edit Delete"). */
function reviewBlocks(texts) {
  const out = [];
  let from = 0;
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    if (!(CERTIFIED.test(t) || VERIFIED.test(t) || OWN_END.test(t))) continue;
    // "Edit Delete Share" right under a "Certified Buyer" line ends the same review: the user's own.
    const last = out.at(-1);
    if (OWN_END.test(t) && last && last.end >= i - 2 && !OWN_END.test(texts[last.end])) {
      last.end = i;
      last.own = true;
      from = i + 1;
      continue;
    }
    out.push({ start: from, end: i, own: OWN_END.test(t) });
    from = i + 1;
  }
  return out;
}

/** One review's parts from its lines: { stars, starsText, title, body, name, dateText, own, lines }; a part not read clearly is null. */
function partsOf(lines, own, productIs) {
  const at = lines.findIndex((t) => !TOP_BAR.test(t) && RATING.test(t));
  const m = at >= 0 ? lines[at].match(RATING) : null;
  const stars = m ? Number(m[1] ?? m[2]) : null;
  const titleText = m ? tidy(lines[at].slice(m.index + m[0].length)) : '';
  const title = titleText && !isNoise(titleText) ? titleText : null;
  // The name and the date, from the line that ends the review.
  let name = null;
  let dateText = null;
  let nameAt = lines.length;
  const c = lines.findIndex((t) => CERTIFIED.test(t));
  const v = lines.findIndex((t) => VERIFIED.test(t));
  if (c >= 0) {
    const t = lines[c];
    const k = t.search(CERTIFIED);
    // The tick Flipkart draws before "Certified Buyer" is read as a mark or a letter ("@", "V").
    const before = tidy(t.slice(0, k).replace(/\s+[vV✓✔@©®]\W*$/u, ''));
    name = before && !isNoise(before) ? before : null;
    const after = `${t.slice(k)} ${lines[c + 1] ?? ''}`;
    dateText = after.match(DAY)?.[0] ?? after.match(AGO)?.[0] ?? null;
    nameAt = c;
  } else if (v >= 0) {
    dateText = lines[v].match(AGO)?.[0] ?? lines[v].match(DAY)?.[0] ?? null;
    // "Name, City" sits above "7 Helpful", above "Verified Purchase · 1 day ago".
    const h = lines.slice(0, v).findLastIndex((t) => HELPFUL.test(t));
    const n = (h >= 0 ? h : v) - 1;
    if (n > at && n >= 0) {
      const t = tidy(lines[n].includes(',') ? lines[n].slice(0, lines[n].lastIndexOf(',')) : lines[n]);
      name = t && !isNoise(t) ? t : null;
      nameAt = n;
    } else nameAt = h >= 0 ? h : v;
  } else nameAt = lines.findIndex((t) => OWN_END.test(t)) >= 0 ? lines.findIndex((t) => OWN_END.test(t)) : lines.length;
  // The words: the lines after the rating (or from the start) to the name, without the screen's own lines and the product's name.
  const body = lines
    .slice(at >= 0 ? at + 1 : 0, nameAt)
    .filter((t) => !TOP_BAR.test(t) && !REVIEW_FOR.test(t) && !READ_MORE.test(t) && !HELPFUL.test(t) && !OWN_PAGE.test(t) && !TABS.test(t) && !RATING_ONLY.test(t) && !SUBMITTED.test(t) && !isNoise(t) && !(productIs && productIs([t])))
    .map((t) => t.replace(/^[|]\s*/, '').trim())
    .filter(Boolean);
  return { stars, starsText: m ? m[0].trim() : null, title, body: body.join('\n') || null, name, dateText, own: Boolean(own), lines };
}

/** The review being written: { body, title, form: true }, or null when the picture is not Flipkart's page for writing one. */
function formReview(texts) {
  const words = (from, stop) => {
    const out = [];
    for (let i = from + 1; from >= 0 && i < texts.length; i++) {
      if (stop(texts[i]) || FORM_END.test(texts[i])) break;
      const t = texts[i].replace(/^[|]\s*/, '').trim();
      if (t && !isNoise(t) && !SUBMITTED.test(t)) out.push(t);
    }
    return out;
  };
  const app = texts.findIndex((t) => FORM_APP_WORDS.test(t));
  if (app >= 0 || texts.some((t) => FORM_APP.test(t))) {
    const body = words(app, () => false);
    return { body: body.join('\n') || null, title: null, form: true };
  }
  const web = texts.findIndex((t) => FORM_WEB.test(t));
  if (web < 0) return null;
  const body = words(texts.findIndex((t) => FORM_DESCRIPTION.test(t)), (t) => FORM_TITLE.test(t));
  const title = words(texts.findIndex((t) => FORM_TITLE.test(t)), () => false);
  return { body: body.join('\n') || null, title: title.join(' ') || null, form: true };
}

/**
 * Of the reviews a screenshot shows, the one that is the user's (FLIPKART-PLAN.md point 4: the reviewer first, never
 * a random review): the one under the reviewer's name in the sheet; else, of the user's own reviews (marked by
 * "Edit" and "Delete"), the one for the product ordered; else the only one. -> { chosen, others }; chosen is null
 * when more than one could be the user's.
 */
export function pickReview(list, { reviewer = null, productIs = null } = {}) {
  const all = list ?? [];
  if (all.length <= 1) return { chosen: all[0] ?? null, others: 0 };
  const byName = reviewer ? all.filter((r) => nameFits(reviewer, r.name)) : [];
  const pool = byName.length ? byName : all.filter((r) => r.own).length ? all.filter((r) => r.own) : all;
  if (pool.length === 1) return { chosen: pool[0], others: all.length - 1 };
  const byProduct = productIs ? pool.filter((r) => productIs(r.lines)) : [];
  return { chosen: byProduct.length === 1 ? byProduct[0] : null, others: all.length - 1 };
}

const NONE = { kind: 'unknown', stars: null, starsText: null, title: null, body: null, name: null, dateText: null, message: null, own: false, form: false, others: 0, why: null };

/**
 * What a review screenshot shows, from its lines (Tesseract's line objects or
 * plain strings): { kind, stars, starsText, title, body, name, dateText,
 * message, own, form, others, why }. kind is:
 *   refused — Flipkart's message that the review was not accepted (message)
 *   written — the review's own words (body, and its title when shown)
 *   rating  — a star rating and no words: the rating read as a number with no title and no words, or Flipkart's
 *             words for a rating only (message) with the rating read
 *   unknown — anything else, or anything not certain; why says what was seen
 * `reviewer` is the reviewer named in the sheet; `productIs(lines)` says
 * whether some lines show the product ordered. Of several reviews, only the
 * user's is read (pickReview); others says how many more it shows.
 */
export function parseReviewShot(lines, { reviewer = null, productIs = null } = {}) {
  const texts = (lines ?? []).map((l) => String(typeof l === 'string' ? l : l?.text ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const refused = texts.find((t) => REVIEW_REFUSED.test(t));
  if (refused) return { ...NONE, kind: 'refused', message: tidy(refused) };
  const ownPage = texts.some((t) => OWN_PAGE.test(t));
  const blocks = reviewBlocks(texts).map((b) => partsOf(texts.slice(b.start, b.end + 1), b.own || ownPage, productIs));
  // A review with no line ending it: a rating and words cut out of a page.
  if (!blocks.length && texts.some((t) => !TOP_BAR.test(t) && RATING.test(t))) blocks.push(partsOf(texts, ownPage, productIs));
  if (blocks.length) {
    const { chosen, others } = pickReview(blocks, { reviewer, productIs });
    if (!chosen) return { ...NONE, others, why: `it shows ${blocks.length} reviews, and which one is the user's could not be told: none is under the reviewer's name in the sheet` };
    const { lines: _lines, ...parts } = chosen;
    const ratingOnly = texts.find((t) => RATING_ONLY.test(t));
    if (parts.body || parts.title) return { ...NONE, ...parts, kind: 'written', others };
    if (parts.stars) return { ...NONE, ...parts, kind: 'rating', message: ratingOnly ? tidy(ratingOnly) : null, others };
    return { ...NONE, ...parts, others, why: 'it shows a review, but neither its words nor its rating could be read' };
  }
  const form = formReview(texts);
  if (form?.body || form?.title) return { ...NONE, ...form, kind: 'written' };
  if (form) return { ...NONE, form: true, why: "it is Flipkart's page for writing a review, but no words are written in it" };
  const ratingOnly = texts.find((t) => RATING_ONLY.test(t));
  if (ratingOnly) return { ...NONE, message: tidy(ratingOnly), why: `it says "${tidy(ratingOnly)}", but the rating could not be read` };
  if (texts.some((t) => SUBMITTED.test(t))) return { ...NONE, why: "it is Flipkart's page saying a review was sent, which does not show the review" };
  const rest = texts.filter((t) => !TOP_BAR.test(t) && !isNoise(t));
  if (rest.length && rest.every((t) => photoLine(t))) return { ...NONE, why: 'only words printed on a product in a photo could be read' };
  return { ...NONE, why: 'it shows no review, no rating and no message from Flipkart' };
}

/**
 * Read a review screenshot (one picture or several) on this computer, as the
 * Amazon checker reads one (amazon/shot-read.js readReviewPicture): its words
 * (read again enlarged when not clear), then parseReviewShot's answer. A
 * picture whose words cannot be read is unknown, and says why.
 */
export async function readReviewShot(files, { reviewer = null, productIs = null, ...opts } = {}) {
  const read = await readText(files, { ...opts, looks: opts.looks ?? [{ scale: SECOND_LOOK_SCALE }] });
  if (!read.ok) return { ...read, ...NONE, unreadable: true, why: `its words could not be read (${read.problem})` };
  return { ...read, ...parseReviewShot(read.lines, { reviewer, productIs }) };
}
