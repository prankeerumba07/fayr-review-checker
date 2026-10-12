// Reading a Flipkart row's purchase screenshot on this computer, with
// Tesseract (English and Hindi): its words, every order ID, every date and
// every amount. Copied from the Amazon checker (amazon/shot-read.js): only
// what reading a purchase screenshot needs, with Flipkart's own way of
// reading its order IDs, prices and product names (screen-text.js). A cell
// may hold several pictures; they are read together. No API key, nothing
// sent anywhere, and nothing here throws: a picture that cannot be read says
// so.

import { readLines, MIN_CONFIDENCE, MIN_WORDS } from './ocr.js';
import { orderIdsIn, datesIn, amountsIn, amountMatch } from './screen-text.js';
import { wordsOf } from './text.js';

/** How much larger a picture is read the second time, when the first reading was not clear or missed what was looked for. */
export const SECOND_LOOK_SCALE = 2;

/**
 * The other ways a purchase screenshot is read, in turn, when the first
 * reading is not clear or lacks what is looked for, until nothing is lacking:
 * enlarged, and as words scattered over a page (Tesseract's other way of
 * finding lines, which finds a line the first way may miss). The Amazon
 * checker's two other ways need a copy of the picture made in a hidden
 * Chrome, which Flipkart does not have; they are left out.
 */
export const SECOND_LOOKS = [{ scale: SECOND_LOOK_SCALE }, { psm: '11' }];

/**
 * The words on one or more pictures: { ok, problem, confidence, wordCount,
 * lines (Tesseract's line objects, every picture's in turn), texts, text,
 * pictures: [{ ok, confidence, wordCount, lines, extra }] }. ok when at least
 * one picture is clear enough to read. A picture that is not clear, or that
 * `missing(lines)` says lacks what is looked for, is read again the ways in
 * `looks`. Without `merge`, the first better reading replaces the first one.
 * With `merge`, every reading's words are kept (`extra`, and in texts and text
 * after the picture's own lines) until nothing is lacking: what one reading
 * missed, another may have read.
 */
export async function readText(files, { tesseract, sips, missing = null, looks = [{ scale: SECOND_LOOK_SCALE }], merge = false } = {}) {
  const pictures = [];
  const opts = { ...(tesseract ? { tesseract } : {}), ...(sips ? { sips } : {}) };
  for (const file of [].concat(files ?? []).filter(Boolean)) {
    const one = async (look = {}) => {
      const read = await readLines(file, { ...opts, scale: look.scale ?? 1, psm: look.psm ?? '3' });
      if (!read) return null;
      const wordCount = wordsOf(read.lines.map((l) => l.text).join(' ')).length;
      return { ok: read.confidence >= MIN_CONFIDENCE && wordCount >= MIN_WORDS, confidence: read.confidence, wordCount, lines: read.lines, hindi: read.hindi, scale: look.scale ?? 1 };
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
        let again = null;
        try {
          again = await one(look);
        } catch {
          // this way did not work: the others are tried
        }
        if (!again) continue;
        if (merge) {
          // The first clear reading is the picture's own; the others add their words.
          if (!best.ok && again.ok) best = again;
          else extra.push(again);
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
    pictures.push({ ...best, extra: extra.map((x) => x.lines) });
  }
  const clear = pictures.filter((p) => p.ok);
  const lines = clear.flatMap((p) => p.lines);
  const own = lines.map((l) => l.text);
  const known = new Set(own);
  const more = clear.flatMap((p) => p.extra.flat().map((l) => l.text)).filter((t) => !known.has(t) && known.add(t));
  const texts = [...own, ...more];
  const all = pictures.flatMap((p) => p.lines.map((l) => l.text));
  return {
    ok: clear.length > 0,
    problem: clear.length ? null : pictures.some((p) => p.failed) ? 'it could not be read on this computer' : 'its words are not clear enough to read',
    confidence: pictures.length ? Math.max(...pictures.map((p) => p.confidence)) : 0,
    wordCount: clear.reduce((n, p) => n + p.wordCount, 0),
    hindi: pictures.some((p) => p.hindi),
    lines,
    texts,
    text: (clear.length ? texts : all).join('\n'),
    pictures,
  };
}

/**
 * What the check looks for on a screenshot (`want`, from the sheet): { orderId, amount, tolerance, allowance, product(texts) }.
 * True when the lines lack it: no order ID, or not the sheet's; no amount, or none that is the sheet's; the product not told (product).
 */
function lacksOrder(lines, want = {}) {
  const ids = orderIdsIn(lines);
  const amounts = amountsIn(lines);
  if (!ids.length || !amounts.length) return true;
  if (want.orderId && !ids.includes(want.orderId)) return true;
  if (Number.isFinite(want.amount) && !amountMatch(amounts, want.amount, { tolerance: want.tolerance ?? 1, allowance: want.allowance ?? 0 })) return true;
  return Boolean(want.product && !want.product(lines.map((l) => (typeof l === 'string' ? l : l.text))));
}

/**
 * What a purchase screenshot says: its words, every order ID, every date
 * (marked when it is the order's date) and every amount. Read again the
 * other ways (SECOND_LOOKS) when no order ID or no amount was found, or (with
 * `want`) not the sheet's, or the product could not be told.
 */
export async function readOrderShot(files, opts = {}) {
  const read = await readText(files, { ...opts, missing: opts.missing ?? ((lines) => lacksOrder(lines, opts.want)), looks: opts.looks ?? SECOND_LOOKS, merge: true });
  return { ...read, orderIds: orderIdsIn(read.texts), dates: datesIn(read.texts), amounts: amountsIn(read.texts) };
}
