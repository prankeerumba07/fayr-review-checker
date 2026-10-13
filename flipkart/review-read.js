// What a Flipkart review screenshot shows, from the words Tesseract read on
// this computer: the star rating, the review's title and words, the
// reviewer's name and the date, or Flipkart's message that the review was not
// accepted or that only a rating was given. Copied from the Amazon checker
// (amazon/shot-read.js: classifyReviewPicture, pickReview and
// readReviewPicture, with isNoise and photoLine), only what reading a review
// screenshot needs, and changed only for Flipkart's screens:
//   - a product's reviews in Flipkart's app and on its new website: "★★★★★ 5.0 • Title", the words, "Name, City",
//     "7 Helpful" and "Verified Purchase · 1 day ago" under each review;
//   - the reviews on Flipkart's older website, and the user's own there ("My Reviews"): "5★ Title", the words, then
//     "Name ✓ Certified Buyer, City" with the date ("12 Sep, 2026", "3 months ago"), and "Edit Delete Share"
//     under the user's own;
//   - a customer's photo opened from a review in the app: the photo, then "5★ Title", the words and "Name 2 days ago";
//   - "My Reviews" in the app: the product's name, the title, the stars Flipkart draws with the date beside them, the
//     words, and "Delete" and "Edit" under it, with no name. Its "Pending" and "Published" tabs list pending reviews too,
//     so it never shows that a review is live (which tab is open is not worked out);
//   - the review being written: "Share your experience" … "Tell us more" in the app (the phone's keyboard under it
//     ends the words); "Review this product", "Description" and "Title (optional)" on the website, whose page address
//     has "/write-review/". Neither shows a name, nor that the review was posted.
// Flipkart writes its own small grey words ("Certified Buyer", "Verified
// Purchase", "Helpful") so that Tesseract often reads them with a slip, which
// still counts. A page's address at the top of a computer's screenshot is
// never a line of the review. A rating Flipkart draws as stars, rather than
// writing it as a number, is not counted: the Amazon checker counts its orange
// stars by their colour in a hidden Chrome, which Flipkart's reading does not
// have, so it is not shown. Nothing is guessed: a part not read clearly is
// null. No API key, nothing sent anywhere.

import { readText, SECOND_LOOK_SCALE } from './shot-read.js';
import { wordsOf, closeWords, normalizeText } from './text.js';

/** Flipkart's words for a review it did not accept. */
export const REVIEW_REFUSED = /\breview\b[^.!?]{0,40}?\b(?:was|has\s+been|is)\s+(?:rejected|removed|declined|not\s+(?:accepted|approved|published))\b|\b(?:could|can)\s*(?:not|n'?t)\s+(?:be\s+)?publish(?:ed)?\b|\bnot\s+eligible\s+to\s+(?:review|rate|write)\b|\bdo(?:es)?\s*(?:n'?t|not)\s+(?:meet|follow)\s+(?:our|the|flipkart'?s)\s+(?:review\s+|community\s+)?guidelines\b|\bviolat\w*\s+(?:our|the|flipkart'?s)\s+(?:review\s+|community\s+)?guidelines\b|\bunable\s+to\s+(?:accept|publish)\b/i;
/** Flipkart's words for a rating given with no review. */
export const RATING_ONLY = /\bthanks?\s+(?:you\s+)?for\s+(?:the\s+|your\s+)?rating\b|\byou\s+(?:have\s+)?rated\b|\brating\s+(?:has\s+been\s+)?submitted\b/i;

// The notes step 6 and the row's page add: what these screens do not show.
export const PENDING_NOTE = 'This is the My Reviews page, which also lists pending reviews, so it does not show that the review is live.';
export const TYPING_NOTE = 'This shows the words being typed, not that the review was posted.';

// The lines that end a review: "Name ✓ Certified Buyer, City", "Verified Purchase · 1 day ago", "Edit Delete" under the
// user's own, and "7 Helpful" right under "Name, City" (when the "Verified Purchase" line under it is not read).
const CERTIFIED = /certified\s*buyer/i;
const VERIFIED = /verified\s*(?:purchase|buyer)/i;
const OWN_END = /^\W*(?:\S{1,3}\s+)?(?:edit\W+delete|delete\W+edit)\b/iu;
// A rating Flipkart writes as a number: "5★" at the start of a line (its star read as "*" or "%", with a mark after it,
// as on the green badge under a customer's photo), "5.0" after the stars in its app and on its new website.
const RATING = /^[^\p{L}\d]{0,3}([1-5])(?:\.0)?\s*[★*✰☆%][)\]|]?(?!\S)|(?:^|[^\d.,])([1-5])\.0(?![\d.,])/u;
const AGO = /\b(?:\d{1,2}|a|an|one)\s+(?:day|week|month|year)s?\s+ago\b|\btoday\b|\byesterday\b/i;
// "5 days ago" with its middle word read with a slip ("5 dayz ago").
const AGO_SLIP = /\b(\d{1,2}|a|an|one)\s+(\p{L}{4,7})\s+ago\b/giu;
const UNITS = ['days', 'weeks', 'months', 'years'];
const DAY = /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s+\d{4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s+\d{4}\b/i;
// The screen's own lines in a review: what it is for ("Review for: Colour Blue"), "READ MORE", the user's own reviews' heading and tabs.
const REVIEW_FOR = /^\W*review\s+for\s*:/i;
const READ_MORE = /^\W*read\s+more\W*$/i;
const OWN_PAGE = /\bmy\s+reviews\b|\breviews?\b.{0,20}\bby\s+you\b/i;
const TABS = /^\W*pending\W+published\W*$/i;
// "My Reviews" in the app: its heading "Product Reviews written by you", and its "Pending" and "Published" tabs.
const APP_OWN = /\breviews?\b.{0,20}\bwritten\s+by\s+you\b/i;
// The phone's top bar, which starts with the time ("9:41").
const TOP_BAR = /^\W{0,2}\d{1,2}:\d{2}(?!\d)/;
// A page's address, at the top of a computer's screenshot (Flipkart's reviews page has "certifiedBuyer=" in it).
const ADDRESS = /(?:https?:\/\/|www\.)\S|\b[\w-]+\.(?:com|in|it|net|org)\/\S/i;
const WRITE_ADDRESS = /\/write-review\b/i;
// The review being written.
const FORM_APP = /\bshare\s+your\s+experience\b/i;
const FORM_APP_WORDS = /^\W*tell\s+us\s+more\W*$/i;
const FORM_WEB = /^\W*review\s+this\s+product\W*$/i;
const FORM_DESCRIPTION = /^\W*description\W*$/i;
const FORM_TITLE = /^\W*title\s*\(?optional\)?\W*$/i;
const FORM_END = /^\W*submit\W*$|^\W*home\b.*\b(?:account|cart)\b/i;
// The phone's keyboard under the words being typed: its row of digits, and "ABC space return".
const KEYBOARD = /^\W*(?:\d{1,2}\W+){6,}|^\W*(?:abc|123)?\W*space\W*(?:return|go|done|send|next|search)?\W*$/i;
// Flipkart's page once a review is sent: it does not show the review.
const SUBMITTED = /\bthank(?:s|\s+you)\s+for\s+(?:your\s+)?review(?:ing)?\b|\breview\s+(?:has\s+been\s+)?submitted\b/i;
// How far left of a review's own lines another line may start and still be the review's: the rest is the page's other
// column (the account's menu beside "My Reviews" on Flipkart's website).
const COLUMN = 60;

/** Where in a line these words start, one after the other, each read with a slip allowed ("Certifed Buyer"), or -1. */
function wordsAt(t, words) {
  const all = [...String(t).matchAll(/[\p{L}\p{N}]+/gu)];
  for (let i = 0; i + words.length <= all.length; i++) if (words.every((w, k) => closeWords(all[i + k][0].toLowerCase(), w))) return all[i].index;
  return -1;
}
const certifiedAt = (t) => (CERTIFIED.test(t) ? t.search(CERTIFIED) : wordsAt(t, ['certified', 'buyer']));
/** The date a line shows: "12 Sep, 2026", "Jul, 2023", "3 months ago", "Today"; a slip in "days" or "months" allowed. */
function dateIn(t) {
  const day = String(t).match(DAY)?.[0];
  if (day) return day;
  const ago = String(t).match(AGO)?.[0];
  if (ago) return ago;
  for (const m of String(t).matchAll(AGO_SLIP)) {
    const unit = UNITS.find((u) => closeWords(m[2].toLowerCase(), u));
    if (unit) return `${m[1]} ${/^(?:1|a|an|one)$/i.test(m[1]) ? unit.slice(0, -1) : unit} ago`;
  }
  return null;
}
const isVerified = (t) => VERIFIED.test(t) || wordsAt(t, ['verified', 'purchase']) >= 0 || (wordsAt(t, ['purchase']) >= 0 && Boolean(dateIn(t)) && t.length < 40);
/** "7 Helpful" (or "Helpful for 1") under a review: a short line with "Helpful", a slip allowed, and no other long word. */
function isHelpful(t) {
  const words = String(t).match(/\p{L}+/gu) ?? [];
  return words.length <= 3 && words.some((w) => closeWords(w.toLowerCase(), 'helpful')) && words.filter((w) => !closeWords(w.toLowerCase(), 'helpful')).every((w) => w.length <= 4);
}
const isRating = (t) => RATING.test(t);
const ends = (t) => certifiedAt(t) >= 0 || isVerified(t) || OWN_END.test(t) || isHelpful(t);

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
 * True when a name on a screenshot and the reviewer named in the sheet can be
 * the same person: one name is the other, or a shorter form of it, either
 * way: a word left out (only the first name, or no surname), a word cut short
 * ("Test Revi..." on Flipkart, "Test Rev" in the sheet) or an initial ("Test
 * R", the same initial on both sides too). Each word may be read with a slip,
 * each is used once, and at least one whole word of two letters or more is
 * the same. "Flipkart Customer", Flipkart's words for a name not shown, never
 * is. Every step that compares names uses this rule.
 */
export function nameFits(wanted, shown) {
  const a = nameParts(wanted);
  const b = nameParts(shown);
  if (!a.length || !b.length || /flipkart\s+customer/i.test(`${wanted} ${shown}`)) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const same = (x, y) => x.length >= 2 && closeWords(x, y);
  const shorter = (x, y) => y.length > x.length && y.startsWith(x);
  const used = new Set();
  let whole = false;
  for (const x of short) {
    let hit = long.findIndex((y, i) => !used.has(i) && same(x, y));
    if (hit >= 0) whole = true;
    else hit = long.findIndex((y, i) => !used.has(i) && (x === y || shorter(x, y) || shorter(y, x)));
    if (hit < 0) return false;
    used.add(hit);
  }
  return whole;
}

/**
 * The reviews a screenshot shows, as { start, end, own } over its lines: each
 * ends at its "Certified Buyer", "Verified Purchase" or "Edit Delete" line, or
 * at "7 Helpful" (with the date line under it); a new review starts at its
 * rating, or at its "Review for:" line, even when the one before showed no
 * line ending it. A review cut off at the bottom is one too.
 */
function reviewBlocks(lines) {
  const out = [];
  let from = 0;
  let rated = false;
  let told = false;
  const close = (end, own = false) => {
    out.push({ start: from, end, own });
    from = end + 1;
    rated = false;
    told = false;
  };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text;
    if ((isRating(t) && rated) || (REVIEW_FOR.test(t) && told)) close(i - 1);
    if (isRating(t)) rated = true;
    if (REVIEW_FOR.test(t)) told = true;
    if (!ends(t)) continue;
    // "Edit Delete Share" right under a "Certified Buyer" line ends the same review: the user's own.
    const last = out.at(-1);
    if (OWN_END.test(t) && last && last.end >= i - 2 && !OWN_END.test(lines[last.end].text) && !rated && !told) {
      last.end = i;
      last.own = true;
      from = i + 1;
      continue;
    }
    // "7 Helpful", then "Verified Purchase · 1 day ago" (or only its date, read with a slip) end the same review.
    let end = i;
    if (isHelpful(t)) {
      const next = [i + 1, i + 2].find((j) => j < lines.length && !isRating(lines[j].text) && !REVIEW_FOR.test(lines[j].text) && (isVerified(lines[j].text) || dateIn(lines[j].text)));
      if (next !== undefined) end = next;
    }
    close(end, OWN_END.test(lines[end].text));
    i = end;
  }
  if (from < lines.length && (rated || told)) out.push({ start: from, end: lines.length - 1, own: false, cut: true });
  return out;
}

/** "Name, City" -> "Name"; a name Flipkart cut short keeps its "...", and the city after it is left out. */
function nameOn(t) {
  const s = String(t ?? '');
  const cut = s.match(/^(.*?(?:\.{2,}|…))/);
  const name = tidy(cut ? cut[1] : s.includes(',') ? s.slice(0, s.lastIndexOf(',')) : s);
  return name && !isNoise(name) ? name.replace(/[,.]+$/, (m) => (/\.{2,}/.test(m) ? m : '')) : null;
}

/** One review's parts from its lines: { stars, starsText, title, body, name, dateText, own, lines }; a part not read clearly is null. */
function partsOf(block, own, productIs) {
  // Only the review's own column, which starts where its rating and its "Certified Buyer", "Verified Purchase" or
  // "Helpful" line do (not "Edit Delete", which the app writes in the middle).
  const lefts = block.filter((l) => Number.isFinite(l.left) && (isRating(l.text) || certifiedAt(l.text) >= 0 || isVerified(l.text) || isHelpful(l.text))).map((l) => l.left);
  const column = lefts.length ? Math.min(...lefts) - COLUMN : null;
  const lines = block.filter((l) => column === null || l.left === null || l.left >= column).map((l) => l.text);
  const at = lines.findIndex((t) => isRating(t));
  const m = at >= 0 ? lines[at].match(RATING) : null;
  const stars = m ? Number(m[1] ?? m[2]) : null;
  const titleText = m ? tidy(lines[at].slice(m.index + m[0].length)) : '';
  let title = titleText && !isNoise(titleText) ? titleText : null;
  // The name and the date, from the lines that end the review.
  let name = null;
  let dateText = null;
  let nameAt = lines.length;
  let from = at >= 0 ? at + 1 : 0;
  const c = lines.findIndex((t) => certifiedAt(t) >= 0);
  const h = lines.findIndex((t) => isHelpful(t));
  const v = lines.findIndex((t) => isVerified(t));
  const end = lines.findIndex((t) => OWN_END.test(t));
  if (c >= 0) {
    const t = lines[c];
    const k = certifiedAt(t);
    // The tick Flipkart draws before "Certified Buyer" is read as a mark or a letter ("@", "V").
    const before = tidy(t.slice(0, k).replace(/\s+[vV✓✔@©®]\W*$/u, ''));
    name = before && !isNoise(before) ? before : null;
    dateText = dateIn(`${t.slice(k)} ${lines[c + 1] ?? ''}`);
    nameAt = c;
  } else if (h >= 0 || v >= 0) {
    // "Name, City" sits right above "7 Helpful" (or above "Verified Purchase" when no "Helpful" is read); the date under them.
    const under = h >= 0 ? h : v;
    dateText = lines.slice(under).map(dateIn).find(Boolean) ?? null;
    // An icon on the same row as "Helpful" may be read as a line of its own between them.
    let n = under - 1;
    while (n > at && n >= under - 2 && isNoise(lines[n])) n--;
    if (n > at && n >= 0 && !REVIEW_FOR.test(lines[n])) {
      name = nameOn(lines[n]);
      nameAt = n;
    } else nameAt = under;
  } else if (at >= 0) {
    // Under a customer's photo: "Name  2 days ago" after the words.
    const d = lines.findIndex((t, i) => i > at && dateIn(t));
    if (d >= 0) {
      const t = lines[d];
      const when = dateIn(t);
      const k = t.search(AGO) >= 0 && !DAY.test(t) ? t.search(AGO) : t.indexOf(when.split(' ')[0]);
      const before = k > 0 ? tidy(t.slice(0, k)) : '';
      name = before && !isNoise(before) && (before.match(/\p{L}+/gu) ?? []).length <= 4 ? before : null;
      dateText = when;
      nameAt = d;
    }
  } else if (own && end >= 0) {
    // "My Reviews" in the app: the product's name, the title, the stars Flipkart draws with the date beside them, the words.
    const heading = (t) => OWN_PAGE.test(t) || TABS.test(t) || isNoise(t);
    const p = lines.findIndex((t) => !heading(t));
    const s = lines.findIndex((t, i) => i > p && i < end && isNoise(t.replace(DAY, ' ')));
    if (p >= 0 && s > p) {
      const titleLines = lines.slice(p + 1, s).map(tidy).filter((t) => t && !isNoise(t));
      title = titleLines.join(' ') || null;
      dateText = lines[s].match(DAY)?.[0] ?? null;
      from = s + 1;
    }
    nameAt = end;
  } else nameAt = end >= 0 ? end : lines.length;
  // The words: the lines after the rating (or from the start) to the name, without the screen's own lines and the product's name.
  const body = lines
    .slice(from, nameAt)
    .filter((t) => !REVIEW_FOR.test(t) && !READ_MORE.test(t) && !isHelpful(t) && !OWN_PAGE.test(t) && !TABS.test(t) && !RATING_ONLY.test(t) && !SUBMITTED.test(t) && !isNoise(t) && !(productIs && productIs([t])))
    .map((t) => t.replace(/^[|]\s*/, '').trim())
    .filter(Boolean);
  return { stars, starsText: m ? m[0].trim() : null, title, body: body.join('\n') || null, name, dateText, own: Boolean(own), lines };
}

/** The review being written: { body, title, form: true }, or null when the picture is not Flipkart's page for writing one. `writing` says the page's address is Flipkart's page for writing a review. */
function formReview(lines, writing = false) {
  const texts = lines.map((l) => l.text);
  // The words after a heading, in its column, up to `stop`, the end of the page or the phone's keyboard.
  const words = (from, stop) => {
    const out = [];
    const left = lines[from]?.left;
    for (let i = from + 1; from >= 0 && i < lines.length; i++) {
      const t = texts[i];
      if (stop(t) || FORM_END.test(t) || KEYBOARD.test(t)) break;
      if (Number.isFinite(left) && Number.isFinite(lines[i].left) && lines[i].left < left - COLUMN) continue;
      const w = t.replace(/^[|]\s*/, '').trim();
      if (w && !isNoise(w) && !SUBMITTED.test(w)) out.push(w);
    }
    return out;
  };
  const app = texts.findIndex((t) => FORM_APP_WORDS.test(t));
  if (app >= 0 || texts.some((t) => FORM_APP.test(t))) {
    const body = words(app, () => false);
    return { body: body.join('\n') || null, title: null, form: true };
  }
  const description = texts.findIndex((t) => FORM_DESCRIPTION.test(t));
  if (!writing && !texts.some((t) => FORM_WEB.test(t)) && !(description >= 0 && texts.some((t) => FORM_TITLE.test(t)))) return null;
  const body = words(description, (t) => FORM_TITLE.test(t));
  const title = words(texts.findIndex((t) => FORM_TITLE.test(t)), () => false);
  return { body: body.join('\n') || null, title: title.join(' ') || null, form: true };
}

/**
 * Of the reviews a screenshot shows, the one that is the user's (FLIPKART-PLAN.md point 4: the reviewer first, never
 * a random review): the only one under a name that fits the reviewer's in the sheet (nameFits); when two or more fit,
 * none, unless all are the user's own (marked by "Edit" and "Delete", all under the user's name), told apart by the
 * product ordered; with none under the reviewer's name, the user's own for the product ordered, else the only review.
 * -> { chosen, others, fitting }; chosen is null when more than one could be the user's.
 */
export function pickReview(list, { reviewer = null, productIs = null } = {}) {
  const all = list ?? [];
  if (all.length <= 1) return { chosen: all[0] ?? null, others: 0, fitting: all.filter((r) => reviewer && nameFits(reviewer, r.name)).length };
  const others = all.length - 1;
  const fits = reviewer ? all.filter((r) => nameFits(reviewer, r.name)) : [];
  if (fits.length === 1) return { chosen: fits[0], others, fitting: 1 };
  if (fits.length > 1 && !fits.every((r) => r.own)) return { chosen: null, others, fitting: fits.length };
  const pool = fits.length ? fits : all.filter((r) => r.own);
  if (pool.length === 1) return { chosen: pool[0], others, fitting: fits.length };
  const byProduct = productIs ? pool.filter((r) => productIs(r.lines)) : [];
  return { chosen: byProduct.length === 1 ? byProduct[0] : null, others, fitting: fits.length };
}

const NONE = { kind: 'unknown', stars: null, starsText: null, title: null, body: null, name: null, dateText: null, message: null, own: false, form: false, pending: false, note: null, others: 0, why: null };

/**
 * What a review screenshot shows, from its lines (Tesseract's line objects or
 * plain strings): { kind, stars, starsText, title, body, name, dateText,
 * message, own, form, pending, note, others, why }. kind is:
 *   refused — Flipkart's message that the review was not accepted (message)
 *   written — the review's own words (body, and its title when shown)
 *   rating  — a star rating and no words: the rating read as a number with no title and no words, or Flipkart's
 *             words for a rating only (message) with the rating read
 *   unknown — anything else, or anything not certain; why says what was seen
 * `reviewer` is the reviewer named in the sheet; `productIs(lines)` says
 * whether some lines show the product ordered. Of several reviews, only the
 * user's is read (pickReview); others says how many more it shows. pending
 * is "My Reviews" in the app, form the review being written; note says what
 * either does not show.
 */
export function parseReviewShot(lines, { reviewer = null, productIs = null } = {}) {
  const all = (lines ?? [])
    .map((l) => ({ text: String(typeof l === 'string' ? l : l?.text ?? '').replace(/\s+/g, ' ').trim(), left: Number.isFinite(l?.left) ? l.left : null }))
    .filter((l) => l.text);
  const writing = all.some((l) => WRITE_ADDRESS.test(l.text));
  const kept = all.filter((l) => !ADDRESS.test(l.text) && !TOP_BAR.test(l.text));
  const texts = kept.map((l) => l.text);
  const refused = texts.find((t) => REVIEW_REFUSED.test(t));
  if (refused) return { ...NONE, kind: 'refused', message: tidy(refused) };
  const ownPage = texts.some((t) => OWN_PAGE.test(t));
  const pending = texts.some((t) => TABS.test(t) || APP_OWN.test(t));
  const blocks = reviewBlocks(kept).map((b) => partsOf(kept.slice(b.start, b.end + 1), b.own || ownPage, productIs));
  if (blocks.length) {
    const { chosen, others, fitting } = pickReview(blocks, { reviewer, productIs });
    const seen = { pending, note: pending ? PENDING_NOTE : null, others };
    if (!chosen) {
      const why = fitting > 1 ? `${fitting} of them are under names that fit the reviewer's name in the sheet` : fitting ? 'the product ordered could not be told among them' : "none is under the reviewer's name in the sheet";
      return { ...NONE, ...seen, why: `it shows ${blocks.length} reviews, and which one is the user's could not be told: ${why}` };
    }
    const { lines: _lines, ...parts } = chosen;
    const ratingOnly = texts.find((t) => RATING_ONLY.test(t));
    if (parts.body || parts.title) return { ...NONE, ...parts, ...seen, kind: 'written' };
    if (parts.stars) return { ...NONE, ...parts, ...seen, kind: 'rating', message: ratingOnly ? tidy(ratingOnly) : null };
    return { ...NONE, ...parts, ...seen, why: 'it shows a review, but neither its words nor its rating could be read' };
  }
  const form = formReview(kept, writing);
  if (form?.body || form?.title) return { ...NONE, ...form, kind: 'written', note: TYPING_NOTE };
  if (form) return { ...NONE, form: true, note: TYPING_NOTE, why: "it is Flipkart's page for writing a review, but no words are written in it" };
  if (pending) return { ...NONE, pending: true, note: PENDING_NOTE, why: "it is the My Reviews page, but no review on it could be read" };
  const ratingOnly = texts.find((t) => RATING_ONLY.test(t));
  if (ratingOnly) return { ...NONE, message: tidy(ratingOnly), why: `it says "${tidy(ratingOnly)}", but the rating could not be read` };
  if (texts.some((t) => SUBMITTED.test(t))) return { ...NONE, why: "it is Flipkart's page saying a review was sent, which does not show the review" };
  const rest = texts.filter((t) => !isNoise(t));
  if (rest.length && rest.every((t) => photoLine(t))) return { ...NONE, why: 'only words printed on a product in a photo could be read' };
  return { ...NONE, why: 'it shows no review, no rating and no message from Flipkart' };
}

/** How much a reading found: a review (or a message) at all, then each of its parts. */
const found = (r) => (r.kind === 'unknown' ? 0 : 10) + ['stars', 'title', 'body', 'name', 'dateText'].filter((k) => r[k]).length;
/** True when a reading lacks what its screen shows: no review told, or a review's name or date, or the date on "My Reviews". */
const lacking = (r) => r.kind === 'unknown' || (r.kind !== 'refused' && !r.form && (r.pending ? !r.dateText : !r.name || !r.dateText));

/**
 * Read a review screenshot (one picture or several) on this computer, as the
 * Amazon checker reads one (amazon/shot-read.js readReviewPicture): its words
 * (read again enlarged when not clear), then parseReviewShot's answer. When
 * that lacks what the screen shows (Flipkart's small grey names and dates are
 * often missed), the picture is read once more with its letters told from the
 * background part by part (ocr.js LIGHT_LETTERS), and the reading that found
 * more is kept. A picture whose words cannot be read is unknown, and says why.
 */
export async function readReviewShot(files, { reviewer = null, productIs = null, ...opts } = {}) {
  const read = await readText(files, { ...opts, looks: opts.looks ?? [{ scale: SECOND_LOOK_SCALE }] });
  if (!read.ok) return { ...read, ...NONE, unreadable: true, why: `its words could not be read (${read.problem})` };
  const first = { ...read, ...parseReviewShot(read.lines, { reviewer, productIs }) };
  if (!lacking(first) || read.pictures.some((p) => p.scale !== 1)) return first;
  const again = await readText(files, { ...opts, first: { light: true }, looks: [] }).catch(() => null);
  if (!again?.ok) return first;
  const second = { ...again, ...parseReviewShot(again.lines, { reviewer, productIs }) };
  return found(second) > found(first) ? second : first;
}
