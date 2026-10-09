// Reading a row's pictures on this computer, with Tesseract (English and
// Hindi) for the words and the pixels for the stars: the purchase screenshot
// (order ID, order date, amounts), the delivery screenshot ("Delivered", order
// IDs, dates, amounts, product) and the review picture (Amazon refusing a review, a star
// rating only, or a written review). A cell may hold several pictures; they
// are read together. No API key, nothing sent anywhere, and nothing here
// throws: a picture that cannot be read says so.

import { readLines, segments, photoLine, MIN_CONFIDENCE, MIN_WORDS } from './ocr.js';
import { parseDelivery } from './delivery-read.js';
import { orderIdsIn, datesIn, amountsIn, amountMatch, productShown, firstPhrase } from './screen-text.js';
import { wordsOf, overlapScore, sameName, nameReadAs, starsLine, cleanName } from './text.js';

/** How much larger a picture is read the second time, when the first reading was not clear or missed what was looked for. */
export const SECOND_LOOK_SCALE = 2;

/**
 * The other ways a purchase or delivery screenshot is read, in turn, when the
 * first reading is not clear or lacks what is looked for, until nothing is
 * lacking: enlarged; as words scattered over a page (Tesseract's other way of
 * finding lines, which finds a line the first way may miss); with a text
 * selection made plain (an order number selected on the screen reads white on
 * blue, or sits under a phone's selection handles); and the top strip
 * enlarged, where a computer's screenshot shows the page's address (Amazon
 * writes the order ID in it). The last two need a copy of the picture made in
 * the headless Chrome (`prepare`), and are skipped without one.
 */
export const SECOND_LOOKS = [{ scale: SECOND_LOOK_SCALE }, { psm: '11' }, { prepare: { plain: true } }, { prepare: { top: true, scale: 3 }, idsOnly: true }];

/**
 * The words on one or more pictures: { ok, problem, confidence, wordCount,
 * lines (Tesseract's line objects, every picture's in turn), texts, text,
 * pictures: [{ ok, confidence, wordCount, lines, extra }] }. ok when at least
 * one picture is clear enough to read. A picture that is not clear, or that
 * `missing(lines)` says lacks what is looked for, is read again the ways in
 * `looks` (every way the dashboard has, before it says a picture cannot be
 * read). Without `merge`, the first better reading replaces the first one.
 * With `merge`, every reading's words are kept (`extra`, and in texts and
 * text after the picture's own lines) until nothing is lacking: what one
 * reading missed, another may have read; a look marked `idsOnly` (the top
 * strip, which also shows the browser's tabs) adds its words only to idTexts,
 * where order IDs are looked for. `prepare(file, how)` makes a copy of a
 * picture for a look that needs one (browsers.js ImageReader.forReading).
 */
export async function readText(files, { tesseract, sips, missing = null, looks = [{ scale: SECOND_LOOK_SCALE }], merge = false, prepare = null } = {}) {
  const pictures = [];
  const opts = { ...(tesseract ? { tesseract } : {}), ...(sips ? { sips } : {}) };
  for (const file of [].concat(files ?? []).filter(Boolean)) {
    const one = async (look = {}) => {
      const read = await readLines(file, { ...opts, scale: look.scale ?? 1, psm: look.psm ?? '3', prepare: look.prepare ? (f) => prepare(f, look.prepare) : null });
      if (!read) return null;
      const wordCount = wordsOf(read.lines.map((l) => l.text).join(' ')).length;
      return { ok: read.confidence >= MIN_CONFIDENCE && wordCount >= MIN_WORDS, confidence: read.confidence, wordCount, lines: read.lines, hindi: read.hindi, scale: look.scale ?? 1, idsOnly: Boolean(look.idsOnly) };
    };
    let first = null;
    try {
      first = await one();
    } catch {
      first = { ok: false, confidence: 0, wordCount: 0, lines: [], failed: true, hindi: false, scale: 1 };
    }
    let best = first;
    const extra = [];
    if (!first.ok || (missing && missing(first.lines))) {
      for (const look of looks) {
        if (look.prepare && !prepare) continue;
        let again = null;
        try {
          again = await one(look);
        } catch {
          // this way did not work: the others are tried
        }
        if (!again) continue;
        if (merge) {
          // The first clear reading is the picture's own; the others add their words.
          if (!best.ok && again.ok && !again.idsOnly) {
            best = again;
          } else extra.push(again);
          if (best.ok && !(missing && missing([...best.lines, ...extra.flatMap((x) => x.lines)]))) break;
        } else {
          const better = !first.ok ? again.ok || again.wordCount > first.wordCount : missing ? !missing(again.lines) : false;
          if (better) {
            best = again;
            break;
          }
        }
      }
    }
    pictures.push({ ...best, extra: extra.filter((x) => !x.idsOnly).map((x) => x.lines), idLines: extra.filter((x) => x.idsOnly).map((x) => x.lines) });
  }
  const clear = pictures.filter((p) => p.ok);
  const lines = clear.flatMap((p) => p.lines);
  const own = lines.map((l) => l.text);
  const known = new Set(own);
  const more = clear.flatMap((p) => p.extra.flat().map((l) => l.text)).filter((t) => !known.has(t) && known.add(t));
  const texts = [...own, ...more];
  const idTexts = clear.flatMap((p) => (p.idLines ?? []).flat().map((l) => l.text)).filter((t) => !known.has(t));
  const all = pictures.flatMap((p) => p.lines.map((l) => l.text));
  return {
    ok: clear.length > 0,
    problem: clear.length ? null : pictures.some((p) => p.failed) ? 'it could not be read on this computer' : 'its words are not clear enough to read',
    confidence: pictures.length ? Math.max(...pictures.map((p) => p.confidence)) : 0,
    wordCount: clear.reduce((n, p) => n + p.wordCount, 0),
    hindi: pictures.some((p) => p.hindi),
    lines,
    texts,
    idTexts,
    text: (clear.length ? texts : all).join('\n'),
    pictures,
  };
}

/** Every reading of the clear pictures: each picture's own lines, then the lines of its other readings. */
const readingsOf = (read) => read.pictures.filter((p) => p.ok).flatMap((p) => [p.lines, ...(p.extra ?? [])]);

/**
 * What the check looks for on a screenshot (`want`, from the form): { orderId, amount, tolerance, allowance, product(texts) }.
 * True when the lines lack it: no order ID, or not the form's; no amount, or none that is the form's; the product not told (product).
 */
function lacksOrder(lines, want = {}) {
  const ids = orderIdsIn(lines);
  const amounts = amountsIn(lines);
  if (!ids.length || !amounts.length) return true;
  return lacksWanted(lines, ids, amounts, want);
}

/** True when the lines lack what the form gives (`want`): its order ID, its amount, or (product) the product. */
function lacksWanted(lines, ids, amounts, want) {
  if (want.orderId && !ids.includes(want.orderId)) return true;
  if (Number.isFinite(want.amount) && !amountMatch(amounts, want.amount, { tolerance: want.tolerance ?? 1, allowance: want.allowance ?? 0 })) return true;
  return Boolean(want.product && !want.product(lines.map((l) => (typeof l === 'string' ? l : l.text))));
}

/**
 * What a purchase screenshot says: its words, every order ID, every date (marked when it is the order's date), every amount, and
 * "Delivered" when it is the page of a delivered order. Read again the other ways (SECOND_LOOKS) when no order ID or no amount was found,
 * or (with `want`) not the form's, or the product could not be told.
 */
export async function readOrderShot(files, opts = {}) {
  const read = await readText(files, { ...opts, missing: opts.missing ?? ((lines) => lacksOrder(lines, opts.want)), looks: opts.looks ?? SECOND_LOOKS, merge: true });
  const each = readingsOf(read).map((lines) => parseDelivery(lines));
  const delivered = each.find((d) => d.delivered) ?? null;
  return { ...read, orderIds: orderIdsIn([...read.texts, ...read.idTexts]), dates: datesIn(read.texts), amounts: amountsIn(read.texts), delivered: Boolean(delivered), deliveredText: delivered?.deliveredText ?? null };
}

/**
 * What a delivery screenshot says: its words, "Delivered" and its date, every order ID, every date and amount (as on a purchase
 * screenshot), and the product's name. Read again the other ways (SECOND_LOOKS) when "Delivered" was not found, when it shows no
 * order ID (it ties the screenshot to the order best), or (with `want`) an order ID that is not the form's.
 */
export async function readDeliveryShot(files, opts = {}) {
  const want = opts.want ?? {};
  const lacks = (lines) => {
    const d = parseDelivery(lines);
    if (!d.delivered) return true;
    // The order ID is what ties a delivery screenshot to the order best: when none is read, the other ways are tried (it may be selected
    // on the screen, written small, or only in the page's address).
    if (!d.orderIds.length) return true;
    return Boolean(want.orderId && !d.orderIds.includes(want.orderId));
  };
  const read = await readText(files, { ...opts, missing: opts.missing ?? lacks, looks: opts.looks ?? SECOND_LOOKS, merge: true });
  // Each reading is parsed on its own (the product's name is found by where its lines sit); the picture's own reading names the product.
  const own = read.pictures.filter((p) => p.ok).map((p) => parseDelivery(p.lines));
  const each = readingsOf(read).map((lines) => parseDelivery(lines));
  const delivered = each.find((d) => d.delivered) ?? own[0] ?? parseDelivery([]);
  return {
    ...read,
    dates: datesIn(read.texts),
    amounts: amountsIn(read.texts),
    delivered: each.some((d) => d.delivered),
    deliveredText: delivered.deliveredText,
    deliveredHow: delivered.deliveredHow ?? null,
    deliveredDate: delivered.deliveredDate,
    deliveredOn: delivered.deliveredOn,
    orderIds: [...new Set([...each.flatMap((d) => d.orderIds), ...orderIdsIn(read.idTexts)])],
    product: [...own, ...each].map((d) => d.product).find(Boolean) ?? null,
  };
}

// ---- the review picture ----

// Words of a review screen's own buttons and labels, never someone's review.
const SCREEN_WORDS = new Set(
  (
    'thanks thank rating ratings rated rate review reviews reviewed reviewing write writing written add added photo photos picture video videos share ' +
    'submit submitted submission tell others help report star stars overall headline title create edit delete done skip continue next back ' +
    'purchase purchases purchased verified customer customers public name profile see read sorry ok okay cancel home search account cart ' +
    'menu orders order buy again track package feedback experience thoughts opinion upload image images optional required characters guidelines ' +
    'community learn eligibility minimum requirements accept apologize unable criteria please received posted live processing hours shortly product ' +
    'products item items amazon successfully success close got it view details notify notified published publish ' +
    'approved approval moderation tap select choose update updated changes saved others what ' +
    // The Amazon app's bars and headings: the search bar, the bottom bar, the headings over a list of reviews, a profile page, the page's foot.
    'q ask question wallet cart menu browse rufus deliver returns hello lists top page translate english people found ' +
    'india from most recent filter go public manage content posts create sell recalls safety alerts service download live app ' +
    'recently viewed pay could first imagine required video'
  ).split(' '),
);
const LITTLE = new Set('a an the of for to in on at by with and or is are was were be been has have had it its this that your you we us our my i me as so if not no yes can will would should do did does how what why when where which who more all any some very'.split(' '));
// The Amazon app's search bar, however Tesseract runs its words together ("Searchoraska..."), and a line of the page's foot.
const SCREEN_LINE = /searchorask|search or ask|'s amazon\.in\b|^\W*deliver to\b|^\W*hello,|amazon\.in\/|\baccount\s*&\s*lists\b|\bdeliver to \p{Lu}|\bverified purchase\W*$|^\W*\d+\s+(?:minutes?|hours?|days?|weeks?|months?)\s+ago\W*$/iu;
// A product's title: most words begin with a capital, or a size like "500 ml", "1 Litre", "Pack of 2".
const SIZE = /\b\d+(?:\.\d+)?\s*(?:ml|l|ltr|litre|litres|liter|kg|g|gm|grams?|pcs|pieces?|pack|units?|x)\b|\bpack of \d+/i;

function contentWords(t) {
  return wordsOf(t).filter((w) => !LITTLE.has(w));
}

/** A line of the screen itself: buttons, labels, "Your rating has been submitted", the search bar. */
export function isScreenLine(t) {
  if (SCREEN_LINE.test(String(t ?? ''))) return true;
  const words = contentWords(t);
  return words.length === 0 || words.every((w) => SCREEN_WORDS.has(w) || /^\d+$/.test(w));
}

// ---- Amazon's email saying the review is live, and the "Write a review" form ----

const EMAIL_LIVE = /your review is live|customer review is live/i;
const EMAIL_SENTENCE = /^thanks?\b.*,|your latest|customer review is live|shoppers on amazon|appreciate the time|experience with this item|^\W*your review\W*$|^\W*to me\b|^\W*amazon\W*in\W*$|^\W*amazon reviews\b|^\W*thank you for reviewing\b|^\W*inbox\b/i;
const EMAIL_END = /see your full review|keep it up|^\W*(reply|forward)\b|write another|^\W*thanks for\b|shop now|^\W*view your review/i;

/**
 * A screenshot of Amazon's email saying the review is live ("Thanks Asha,
 * your latest customer review is live on Amazon…", then "Your review" with
 * its stars, title and words): { name, title, body, email: true }, or null
 * when the picture is not that email.
 */
export function emailReview(texts) {
  const list = (texts ?? []).map((t) => String(t ?? '').trim()).filter(Boolean);
  const live = list.findIndex((t) => EMAIL_LIVE.test(t));
  if (live < 0) return null;
  const thanks = list.map((t) => t.match(/^thanks?\s+(.+?),\s*your\b/i)).find(Boolean);
  const name = thanks ? cleanName(thanks[1]) || null : null;
  const head = list.findIndex((t, i) => i >= live && /^\W*your review\W*$/i.test(t));
  const words = [];
  for (let i = (head >= 0 ? head : live) + 1; i < list.length; i++) {
    const t = list[i];
    if (EMAIL_END.test(t)) break;
    if (EMAIL_SENTENCE.test(t) || starsLine(t) || isNoise(t) || isScreenLine(t)) continue;
    words.push(t);
  }
  if (!words.length) return { name, title: null, body: null, email: true };
  if (words.length === 1) return { name, title: null, body: words[0], email: true };
  return { name, title: words[0], body: words.slice(1).join('\n'), email: true };
}

const FORM_WRITE = /^\W*write a review\W*$/i;
const FORM_TITLE = /^\W*title your review\b/i;
const FORM_BREAK = /share a video|add a photo|^\W*submit\b|^\W*(cancel|next|done|clear)\W*$|^\W*home\b.*\bcart\b/i;

/**
 * A screenshot of Amazon's "Write a review" form, with the review typed in
 * it ("How was the item?", the stars, "Write a review", the words, "Title your
 * review (required)", the title): { name: null, title, body, form: true }, or
 * null when the picture is not that form. It shows no name.
 */
export function formReview(texts) {
  const list = (texts ?? []).map((t) => String(t ?? '').trim()).filter(Boolean);
  const write = list.findIndex((t) => FORM_WRITE.test(t));
  const titleAt = list.findIndex((t) => FORM_TITLE.test(t));
  if (write < 0 && titleAt < 0) return null;
  if (!list.some((t) => /how was the item|share a video|add a photo|title your review/i.test(t))) return null;
  const body = [];
  for (let i = write + 1; write >= 0 && i < list.length; i++) {
    const t = list[i];
    if (FORM_BREAK.test(t) || FORM_TITLE.test(t)) break;
    if (starsLine(t) || isNoise(t) || isScreenLine(t)) continue;
    body.push(t);
  }
  const title = [];
  for (let i = titleAt + 1; titleAt >= 0 && i < list.length; i++) {
    const t = list[i];
    if (FORM_BREAK.test(t) || isScreenLine(t)) break;
    if (starsLine(t) || isNoise(t)) continue;
    title.push(t);
  }
  if (!body.length && !title.length) return null;
  return { name: null, title: title.join(' ') || null, body: body.join('\n') || title.join(' '), form: true };
}

/** A line that looks like a product's title rather than someone's words. */
export function looksLikeTitle(t) {
  const raw = String(t ?? '').trim();
  const words = raw.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (words.length < 2) return false;
  const capital = words.filter((w) => /^\p{Lu}/u.test(w)).length / words.length;
  return SIZE.test(raw) || (capital >= 0.6 && !/[.!?]$/.test(raw));
}

/** The largest row of orange stars, when there is exactly one such row: its count from 1 to 5; else null. */
export function ratingStars(starGroups) {
  const groups = (starGroups ?? []).filter((g) => g.count >= 1 && g.count <= 5);
  if (!groups.length) return { stars: null, how: 'no orange stars were seen' };
  const size = Math.max(...groups.map((g) => g.size));
  const big = groups.filter((g) => g.size >= 0.75 * size);
  if (big.length !== 1) return { stars: null, how: 'more than one row of stars was seen' };
  return { stars: big[0].count, how: 'counted by their colour' };
}

/** A line that is only noise read from stars or icons: fewer than three letters, one or two letters over and over, or a few words of three letters or fewer. */
export function isNoise(t) {
  const letters = String(t ?? '').match(/\p{L}/gu) ?? [];
  if (letters.length < 3) return true;
  if (new Set(letters.map((c) => c.toLowerCase())).size <= 2) return true;
  const words = String(t).split(/\s+/).filter((w) => /\p{L}/u.test(w));
  return words.length <= 3 && words.every((w) => (w.match(/\p{L}/gu) ?? []).length <= 3);
}

/**
 * What a review picture shows, from its lines (Tesseract's line objects) and
 * its star rows: { kind, refusal, ratingPhrase, stars, starsHow, written,
 * freeText, productShown, productLines, why }. kind is:
 *   refused — Amazon refusing the review (a phrase from settings.json)
 *   written — someone's own words, even one word
 *   rating  — a star rating only: a phrase from settings.json, stars counted, and nothing else but the screen's own words and the product's name
 *   unknown — anything else, or anything not certain; `why` says what was seen
 * `product` is the sheet's Product ordered; `settings` is settings.json's.
 * Amazon's email saying the review is live is read for the name it thanks
 * and the review's words (`written.email`); the "Write a review" form with
 * the review typed in it, for its words (`written.form`, no name). A
 * screenshot of a product's list of reviews shows several: the one taken is
 * the one by `reviewer` (the name in the sheet) or `name` (the name on the
 * review opened on Amazon), else the viewer's own (Amazon marks it), else
 * the one whose words are `words` (the review read on Amazon), else the
 * first; `others` says how many more there were. `name` and `title` also
 * help find the name and the title among the lines.
 */
export function classifyReviewPicture(lines, starGroups, { settings, product = '', reviewer = null, name = null, title = null, words: amazonWords = null } = {}) {
  const objs = (lines ?? []).map((l) => (typeof l === 'string' ? { text: l } : l)).filter((l) => String(l.text ?? '').trim());
  const texts = objs.map((l) => l.text.trim());
  const out = { kind: 'unknown', refusal: null, ratingPhrase: null, stars: null, starsHow: null, written: null, freeText: null, productShown: null, productLines: [], why: null, others: 0 };
  const refusal = firstPhrase(texts, settings.reviewRefusedPhrases);
  if (refusal) return { ...out, kind: 'refused', refusal: refusal.words };

  const shown = product ? productShown(product, texts) : null;
  out.productShown = shown;
  const productText = shown && shown.share >= settings.passingMarks.productNameShare ? shown.shown : null;
  const isProduct = (t) => Boolean(productText && productText.includes(t));
  const rating = firstPhrase(texts, settings.ratingOnlyPhrases);
  out.ratingPhrase = rating?.words ?? null;
  const isPhrase = (t) => Boolean(rating && (t.includes(rating.words) || rating.words.includes(t)));
  const star = ratingStars(starGroups);
  out.stars = star.stars;
  out.starsHow = star.how;

  // Amazon's page saying a review was sent ("Review Submitted", "Thank you for helping other shoppers"): it shows no review.
  if (texts.some((t) => SUBMITTED.test(t))) return { ...out, why: "it is Amazon's page saying a review was submitted, which does not show the review" };
  // Amazon's email saying the review is live, or the "Write a review" form with the review typed in it.
  const email = emailReview(texts);
  if (email) {
    if (!email.body) return { ...out, why: "it is Amazon's email saying the review is live, but the review's words could not be read on it" };
    out.written = { name: email.name, title: email.title, dateText: null, body: email.body, own: true, email: true };
    return { ...out, kind: 'written' };
  }
  const form = formReview(texts);
  if (form) {
    out.written = { name: null, title: form.title, dateText: null, body: form.body, own: false, form: true };
    return { ...out, kind: 'written' };
  }

  // Someone's own words: the review under "Reviewed in … on …" (of several, the right one); else any line that is not the screen's own, not noise, not the phrase and not the product ordered.
  const seg = pickReview(segments(objs, { name: name ?? reviewer ?? undefined, title: title ?? undefined }), { reviewer, name, words: amazonWords });
  out.others = seg.others;
  // Under its "Reviewed in … on …" line, even one word ("Good product") is the review's words.
  if (seg.body && wordsOf(seg.body).length >= 1) {
    out.written = { name: seg.name, title: seg.title, dateText: seg.dateText, body: seg.body, own: Boolean(seg.own) };
    return { ...out, kind: 'written' };
  }
  const rest = texts.filter((t) => !isProduct(t) && !isPhrase(t) && !isScreenLine(t) && !isNoise(t));
  // Only a line with a size ("500 ml", "Pack of 2") is taken for another product's name; any other line is someone's words, but not
  // the packaging's words in capitals on a photo in the review ("MADE FOR MEN"), unless there is nothing else.
  out.productLines = rest.filter((t) => SIZE.test(t));
  const unsized = rest.filter((t) => !SIZE.test(t));
  // Only the packaging's words were read (the review's words are on the photo, too small or faint to read): no review words were read.
  if (unsized.length && unsized.every((t) => photoLine(t))) return { ...out, unreadable: true, why: 'only the words printed on the product in a photo could be read, not the review\'s own words' };
  const words = unsized.filter((t) => !photoLine(t));
  if (words.length) {
    out.freeText = words.join('\n');
    out.written = { name: null, title: null, dateText: null, body: out.freeText };
    return { ...out, kind: 'written' };
  }
  if (out.productLines.length && productText) return { ...out, why: 'it shows the product ordered and another product too' };
  if (rating && star.stars) return { ...out, kind: 'rating' };
  if (rating) return { ...out, why: `it says "${rating.words}", but ${star.how}, so the stars could not be seen clearly` };
  if (star.stars) return { ...out, why: 'it shows stars, but no words saying it is a rating only' };
  return { ...out, why: 'it shows no review, no rating and no message from Amazon' };
}

/** Amazon's page shown once a review is sent: it does not show the review. */
const SUBMITTED = /^\W*review submitted\W*$|thank you for helping other shoppers|create-review\/thankyou/i;

/** Part of Amazon's message refusing a review ("…not accepting reviews on this item or product from this account"), as a small screenshot reads it. */
const REFUSAL_PART = /not accepting|apologi[sz]e but amazon|item or product|from this account|minimum eligibility|unable to accept/i;

/** A name on a screenshot is `wanted` (the name in the sheet, or on Amazon): the same name the way staff read it, or every word of `wanted` read in it. */
const nameIs = (wanted, shown) => Boolean(wanted && shown && !starsLine(shown) && (sameName(wanted, shown).same || nameReadAs(wanted, shown)));

/**
 * Of the reviews a screenshot shows, the one that is the user's: the one
 * under the user's name (the reviewer named in the sheet, or the name on the
 * review opened on Amazon), else the one Amazon marks as the viewer's own,
 * else the one whose words are the review's words read on Amazon, else the
 * first. With `others`, how many other reviews the screenshot shows.
 */
export function pickReview(list, { reviewer = null, name = null, words = null } = {}) {
  const all = (list ?? []).filter(Boolean);
  if (!all.length) return { body: null, name: null, title: null, dateText: null, own: false, others: 0 };
  const withBody = all.filter((s) => s.body);
  const pool = withBody.length ? withBody : all;
  const named = pool.find((s) => nameIs(reviewer, s.name) || nameIs(name, s.name)) ?? null;
  const own = pool.find((s) => s.own);
  const scored = words ? pool.map((s) => ({ s, score: s.body ? overlapScore(words, s.body) ?? 0 : 0 })).sort((a, b) => b.score - a.score) : [];
  const byWords = scored.length && scored[0].score >= 0.5 ? scored[0].s : null;
  const chosen = named ?? own ?? byWords ?? pool[0];
  return { ...chosen, others: all.length - 1 };
}

/**
 * Read one review picture (or several). `analyse(file)` gives each picture's
 * star rows (image-read.js). -> classifyReviewPicture()'s answer, with the
 * words read; a picture whose words cannot be read is "unknown". `reviewer`,
 * `name`, `title` and `words` (the name in the sheet, and what the review
 * opened on Amazon showed) find the right review and its parts.
 */
export async function readReviewPicture(files, { analyse = null, settings, product = '', reviewer = null, name = null, title = null, words = null, tesseract, sips } = {}) {
  // Words of Amazon's refusal read only in part (a small screenshot): the picture is read once more enlarged, for the whole message.
  const partRefusal = (lines) => {
    const texts = lines.map((l) => (typeof l === 'string' ? l : l.text));
    return !firstPhrase(texts, settings.reviewRefusedPhrases) && texts.some((t) => REFUSAL_PART.test(t));
  };
  const read = await readText(files, { ...(tesseract ? { tesseract } : {}), ...(sips ? { sips } : {}), missing: partRefusal });
  const list = [].concat(files ?? []).filter(Boolean);
  const groups = [];
  if (analyse) {
    for (const f of list) {
      try {
        groups.push(...((await analyse(f))?.starGroups ?? []));
      } catch {
        // stars left uncounted; the answer says so
      }
    }
  }
  if (!read.ok) return { ...read, kind: 'unknown', why: `its words could not be read (${read.problem}), so it could not be told whether it shows a written review or only a rating`, stars: null, starsHow: null, written: null, productLines: [], refusal: null, ratingPhrase: null, others: 0 };
  return { ...read, ...classifyReviewPicture(read.lines, groups, { settings, product, reviewer, name, title, words }) };
}
