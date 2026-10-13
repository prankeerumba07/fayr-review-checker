// Reading a Flipkart row's purchase and delivery screenshots on this
// computer, with Tesseract (English and Hindi): their words, every order ID,
// every date and every amount, and "Delivered" on the delivery screenshot.
// Copied from the Amazon checker (amazon/shot-read.js): only what reading
// those two screenshots needs, with Flipkart's own way of reading its order
// IDs, prices and product names (screen-text.js) and its words for delivered
// (delivery-read.js). A cell may hold several pictures; they are read
// together. No API key, nothing sent anywhere, and nothing here throws: a
// picture that cannot be read says so.

import { readLines, MIN_CONFIDENCE, MIN_WORDS } from './ocr.js';
import { parseDelivery } from './delivery-read.js';
import { orderIdsIn, datesIn, amountsIn, amountMatch } from './screen-text.js';
import { wordsOf } from './text.js';

/** How much larger a picture is read the second time, when the first reading was not clear or missed what was looked for. */
export const SECOND_LOOK_SCALE = 2;

/**
 * The other ways a screenshot is read, in turn, when the first
 * reading is not clear or lacks what is looked for, until nothing is lacking:
 * enlarged; as words scattered over a page (Tesseract's other way of
 * finding lines, which finds a line the first way may miss); and, only for
 * order IDs (`idsOnly`, as the Amazon checker's last way), with the letters
 * told from the background part by part (ocr.js LIGHT_LETTERS), as the
 * picture is and enlarged three times. Those last two keep small light grey
 * letters: the order ID Flipkart's app writes under the product's name, and
 * the page's address at the top of a computer's screenshot ("order_id=OD…"),
 * on a purchase screenshot and a delivery one alike; an advert's big price
 * they read is never an amount. The Amazon checker's two other ways need a
 * copy of the picture made in a hidden Chrome, which Flipkart does not have;
 * they are left out.
 */
export const SECOND_LOOKS = [{ scale: SECOND_LOOK_SCALE }, { psm: '11' }, { light: true, idsOnly: true }, { light: true, scale: 3, idsOnly: true }];

/**
 * The words on one or more pictures: { ok, problem, confidence, wordCount,
 * lines (Tesseract's line objects, every picture's in turn), texts, text,
 * pictures: [{ ok, confidence, wordCount, lines, extra }] }. ok when at least
 * one picture is clear enough to read. A picture that is not clear, or that
 * `missing(lines)` says lacks what is looked for, is read again the ways in
 * `looks`. Without `merge`, the first better reading replaces the first one.
 * With `merge`, every reading's words are kept (`extra`, and in texts and text
 * after the picture's own lines) until nothing is lacking: what one reading
 * missed, another may have read; a look marked `idsOnly` adds its words only
 * to idTexts, where order IDs are looked for. `first` is the way the first
 * reading is made (as the picture is, unless it says otherwise).
 */
export async function readText(files, { tesseract, sips, missing = null, looks = [{ scale: SECOND_LOOK_SCALE }], merge = false, first: firstLook = {} } = {}) {
  const pictures = [];
  const opts = { ...(tesseract ? { tesseract } : {}), ...(sips ? { sips } : {}) };
  for (const file of [].concat(files ?? []).filter(Boolean)) {
    const one = async (look = {}) => {
      const read = await readLines(file, { ...opts, scale: look.scale ?? 1, psm: look.psm ?? '3', light: Boolean(look.light) });
      if (!read) return null;
      const wordCount = wordsOf(read.lines.map((l) => l.text).join(' ')).length;
      return { ok: read.confidence >= MIN_CONFIDENCE && wordCount >= MIN_WORDS, confidence: read.confidence, wordCount, lines: read.lines, hindi: read.hindi, scale: look.scale ?? 1, idsOnly: Boolean(look.idsOnly), wordByWord: look.psm === '11' };
    };
    let first = null;
    try {
      first = await one(firstLook);
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
          if (!best.ok && again.ok && !again.idsOnly) best = again;
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
    const others = extra.filter((x) => !x.idsOnly);
    const textsOf = (wordByWord) => [best, ...others].filter((x) => Boolean(x.wordByWord) === wordByWord).flatMap((x) => (x.lines ?? []).map((l) => l.text));
    pictures.push({ ...best, extra: others.map((x) => x.lines), idLines: extra.filter((x) => x.idsOnly).map((x) => x.lines), wordByWord: textsOf(true), byLine: textsOf(false) });
  }
  const clear = pictures.filter((p) => p.ok);
  const lines = clear.flatMap((p) => p.lines);
  const own = lines.map((l) => l.text);
  const known = new Set(own);
  const more = clear.flatMap((p) => p.extra.flat().map((l) => l.text)).filter((t) => !known.has(t) && known.add(t));
  const texts = [...own, ...more];
  const idTexts = clear.flatMap((p) => (p.idLines ?? []).flat().map((l) => l.text)).filter((t) => !known.has(t));
  // The lines only the reading of every word on its own read (Tesseract's way of finding words scattered over a page): a number alone there is never an amount.
  const byLine = new Set(clear.flatMap((p) => p.byLine ?? []));
  const alone = [...new Set(clear.flatMap((p) => p.wordByWord ?? []))].filter((t) => !byLine.has(t));
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
    alone,
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
  return { ...read, orderIds: orderIdsIn([...read.texts, ...read.idTexts]), dates: datesIn(read.texts), amounts: amountsIn(read.texts, { alone: read.alone }) };
}

/** Every reading of the clear pictures: each picture's own lines, then the lines of its other readings. */
const readingsOf = (read) => read.pictures.filter((p) => p.ok).flatMap((p) => [p.lines, ...(p.extra ?? [])]);

/**
 * What a delivery screenshot says: its words, "Delivered" and its date, every
 * order ID, every date and amount (as on a purchase screenshot). Read again
 * the other ways (SECOND_LOOKS) when "Delivered" was not found, when it shows
 * no order ID (it ties the screenshot to the order best), or (with `want`) an
 * order ID that is not the sheet's. Each reading is looked at on its own for
 * "Delivered", the ways for light letters too: Flipkart may write it in white
 * on a coloured card ("Delivered before time", for a quick delivery), which
 * only those read. Their words are still never amounts.
 */
export async function readDeliveryShot(files, opts = {}) {
  const want = opts.want ?? {};
  const lacks = (lines) => {
    const d = parseDelivery(lines);
    if (!d.delivered) return true;
    // The order ID is what ties a delivery screenshot to the order best: when none is read, the other ways are tried (it may be written
    // small and light, or only in the page's address).
    if (!d.orderIds.length) return true;
    return Boolean(want.orderId && !d.orderIds.includes(want.orderId));
  };
  const read = await readText(files, { ...opts, missing: opts.missing ?? lacks, looks: opts.looks ?? SECOND_LOOKS, merge: true });
  const own = read.pictures.filter((p) => p.ok).map((p) => parseDelivery(p.lines));
  const light = read.pictures.filter((p) => p.ok).flatMap((p) => p.idLines ?? []);
  const each = [...readingsOf(read), ...light].map((lines) => parseDelivery(lines));
  // The word itself ("Delivered, Sep 30") is said before "Delivered to …", and that before a sign, whichever reading read it; the word with
  // a real date before the word whose date could not be read.
  const rank = (d) => ({ word: d.deliveredDateUnread ? 1 : 0, to: 2, sign: 3 })[d.deliveredHow] ?? 4;
  const delivered = [...each].sort((a, b) => rank(a) - rank(b)).find((d) => d.delivered) ?? own[0] ?? parseDelivery([]);
  return {
    ...read,
    dates: datesIn(read.texts),
    amounts: amountsIn(read.texts, { alone: read.alone }),
    delivered: each.some((d) => d.delivered),
    deliveredText: delivered.deliveredText,
    deliveredHow: delivered.deliveredHow ?? null,
    deliveredDate: delivered.deliveredDate,
    deliveredDateUnread: Boolean(delivered.deliveredDateUnread),
    deliveredOn: delivered.deliveredOn,
    orderIds: [...new Set([...each.flatMap((d) => d.orderIds), ...orderIdsIn(read.idTexts)])],
  };
}
