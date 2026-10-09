// Reading a delivery screenshot on this computer: a picture of the user's
// Amazon order page. Tesseract reads the words (English and Hindi); this
// module finds the word "Delivered" and its date, the order id and the
// product's name. No API key, nothing sent anywhere.

import { readLines, MIN_CONFIDENCE, MIN_WORDS } from './ocr.js';
import { dayFrom, wordsOf, closeWords } from './text.js';
import { orderIdsIn, datesIn } from './screen-text.js';

// "Not delivered", "Could not be delivered", "Not yet delivered", "Delivery attempted", "Out for delivery", "Arriving tomorrow"…: never a delivery.
const NOT_DELIVERED = /\b(?:not|never|cannot|can'?t|couldn'?t|failed|unable|yet\s+to\s+be|attempt(?:ed)?)\b[^.!?]{0,40}?\bdeliver(?:ed|y)\b|\bun-?deliver(?:ed|able)\b|\bout\s+for\s+delivery\b|\barriving\b|\bwill\s+be\s+delivered\b|\bdelivery\s+by\b|\bexpected\s+(?:by|delivery|on)\b|\bshipped\b|\bdelivery\s+attempt|\bcancel items?\b|we'?ll drop (?:the|your) order/i;
const DELIVERED = /(?:^|[^\p{L}])delivered\b(?:\s+on\b)?[\s:,-]*(.*)$/iu;
const DELIVERED_HINDI = /डिलीवर\s*(?:किया\s*गया|हो\s*गया)|डिलीवर\s*कर\s*दिया\s*गया/u;
// "Delivered" read with a letter lost or changed ("Delivere 20 August", "Dellvered"): the word, then the rest of the line.
const DELIVERED_LIKE = /(?:^|[^\p{L}])(d\p{L}{6,9})\b(?:\s+on\b)?[\s:,-]*(.*)$/iu;
// What Amazon's order page shows only once an order has been delivered: a sign of delivery when the word itself is off the screenshot.
const DELIVERED_SIGN = /\bleave delivery feedback\b|\breturn window (?:closed|closes|is closed|has closed)\b|\breturn or replace items?\b|\bpackage was (?:handed|delivered|left|received)\b|\bhanded (?:to|over)\b|\bdelivered to (?:a |your )?(?:neighbou?r|security|reception|mailroom)\b|\bleft (?:at|in|with) (?:the |your )?(?:door|porch|front|reception|security|mailroom|neighbou?r)/i;
const ORDER_ID = /(?<!\d)(\d{3})\s*[-–—‐\s]\s*(\d{7})\s*[-–—‐\s]\s*(\d{7})(?!\d)/u;

// Words on an order page that are never the product's name.
const UI_LABEL =
  /^(your orders?|orders?\b|order details|order placed|order #|order no|delivered\b|package (was )?(handed|delivered|left|received)|arriving|shipped|track (package|order)|return or replace|return window|returns?\b|replace\b|write a (product )?review|buy it again|view (order details|your item|invoice)|ship(ping)? to|deliver(y|ed)? to|payment|invoice|sold by|qty|quantity|total|grand total|item\(?s\)? subtotal|subtotal|hello\b|search amazon|account|cart|menu|get product support|leave seller feedback|ask product question|share gift receipt|cancel items?|archive order|need help|delivery (address|instructions)|amazon\.in|amazon)\b/i;
const MONEY = /₹|\brs\.?\s*\d|\binr\b/i;
const PIN_CODE = /(?<!\d)\d{6}(?!\d)/;

const textOf = (l) => String(typeof l === 'string' ? l : l?.text ?? '').replace(/\s+/g, ' ').trim();
const placed = (l) => l && typeof l === 'object' && [l.left, l.top, l.bottom].every(Number.isFinite);

function letterCount(s) {
  return [...s].filter((c) => /\p{L}/u.test(c)).length;
}

/** Mostly letters: a name, not a price, a date or a code. */
function mostlyLetters(s) {
  const chars = s.replace(/\s/g, '');
  return chars.length > 0 && letterCount(s) / chars.length >= 0.6;
}

/** A line that is not a label, a price or an address. */
function plainLine(s) {
  return !UI_LABEL.test(s) && !NOT_DELIVERED.test(s) && !MONEY.test(s) && !PIN_CODE.test(s) && !ORDER_ID.test(s);
}

/** A line that could be the first line of a product's name. */
function titleLike(s) {
  return plainLine(s) && wordsOf(s).length >= 2 && letterCount(s) >= 12 && mostlyLetters(s);
}

/** A line that could carry on a product's name from the line above. */
function carriesOn(s) {
  return plainLine(s) && wordsOf(s).length >= 1 && letterCount(s) >= 3 && mostlyLetters(s);
}

/**
 * The "Delivered" line: { at, text, date, how } or null. how is 'word' for
 * the word itself (in English, read with a letter wrong, or in Hindi), or
 * 'sign' for a line Amazon's order page shows only once an order has been
 * delivered ("Leave delivery feedback", "Return window closed on …", "Package
 * was handed to …"), taken only when no line says the order is still on its
 * way.
 */
function deliveredLine(texts) {
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    if (NOT_DELIVERED.test(t)) continue;
    if (DELIVERED_HINDI.test(t)) return { at: i, text: t, date: null, how: 'word' };
    const m = t.match(DELIVERED) ?? closeMatch(t);
    if (m) {
      const date = m[1].replace(/[.,;:!]+$/, '').trim();
      return { at: i, text: t, date: date || null, how: 'word' };
    }
  }
  if (texts.some((t) => NOT_DELIVERED.test(t))) return null;
  const at = texts.findIndex((t) => DELIVERED_SIGN.test(t));
  return at >= 0 ? { at, text: texts[at].match(DELIVERED_SIGN)[0], date: null, how: 'sign' } : null;
}

/** "Delivered" read with one letter lost or changed, as the DELIVERED match would be: [, rest] or null. */
function closeMatch(t) {
  const m = t.match(DELIVERED_LIKE);
  if (!m || /^deliver(?:y|ies|ing)?$/i.test(m[1]) || !closeWords(m[1].toLowerCase(), 'delivered')) return null;
  return [m[0], m[2]];
}

/**
 * The product's name: a title-like line, and the lines that carry it on (at
 * most 3 lines). Tesseract may read a button beside the name between its
 * lines, so with positions a carried-on line must sit right under the first,
 * at the same left; without them, at most two labels in between are skipped.
 */
function productName(items, from, to) {
  for (let i = from; i < to; i++) {
    if (!titleLike(items[i].text)) continue;
    const first = items[i];
    const parts = [first.text];
    let prev = first;
    let skipped = 0;
    for (let j = i + 1; j < to && parts.length < 3; j++) {
      const it = items[j];
      if (placed(first) && placed(it)) {
        const h = Math.max(1, first.bottom - first.top);
        if (it.top - prev.bottom > 1.5 * h) break;
        const under = Math.abs(it.left - first.left) <= 1.5 * h && it.top >= prev.top;
        if (!under) continue;
        if (!carriesOn(it.text)) break;
        parts.push(it.text);
        prev = it;
      } else if (carriesOn(it.text)) {
        parts.push(it.text);
      } else if (UI_LABEL.test(it.text) && skipped < 2) {
        skipped++;
      } else break;
    }
    return parts.join(' ').replace(/[\s,;:]+$/, '');
  }
  return null;
}

/**
 * What a delivery screenshot says, from its lines (Tesseract's line objects,
 * or plain strings): { delivered, deliveredText, deliveredDate, deliveredDay,
 * deliveredOn, orderId, orderIds, product }. deliveredOn is the date read on
 * the Delivered line ({ day, year, month, date }, the year may be null).
 * Anything not shown is false or null, never guessed.
 */
export function parseDelivery(lines) {
  const items = (Array.isArray(lines) ? lines : []).map((l) => ({ ...(placed(l) ? l : {}), text: textOf(l) })).filter((l) => l.text);
  const texts = items.map((l) => l.text);
  const d = deliveredLine(texts);
  const ids = orderIdsIn(texts);
  // The name comes after the Delivered line on Amazon's order page; else before it.
  const product = d ? productName(items, d.at + 1, items.length) ?? productName(items, 0, d.at) : productName(items, 0, items.length);
  const day = d?.date && /\d{4}/.test(d.date) ? dayFrom(d.date) : null;
  const on = d?.date ? datesIn([d.date])[0] ?? null : null;
  return {
    delivered: Boolean(d),
    deliveredText: d?.text ?? null,
    deliveredHow: d?.how ?? null,
    deliveredDate: d?.date ?? null,
    deliveredDay: day ?? on?.day ?? null,
    deliveredOn: on ? { day: on.day, year: on.year, month: on.month, date: on.date } : null,
    orderId: ids[0] ?? null,
    orderIds: ids,
    product,
  };
}

/**
 * Read one delivery screenshot. `analyse(file)` (optional) gives its
 * fingerprint, to find the same picture given by another row. Never throws.
 */
export async function readDeliveryScreenshot(file, { analyse, tesseract } = {}) {
  const out = {
    ok: false,
    problem: null,
    lang: null,
    hindi: false,
    confidence: null,
    wordCount: 0,
    text: '',
    lines: [],
    delivered: false,
    deliveredText: null,
    deliveredDate: null,
    deliveredDay: null,
    deliveredOn: null,
    orderId: null,
    orderIds: [],
    product: null,
    fingerprint: null,
  };
  try {
    const read = await readLines(file, tesseract ? { tesseract } : {});
    out.lang = read.lang;
    out.hindi = read.hindi;
    out.confidence = read.confidence;
    out.lines = read.lines.map((l) => l.text);
    out.text = out.lines.join('\n');
    out.wordCount = wordsOf(out.text).length;
    Object.assign(out, parseDelivery(read.lines));
    out.ok = out.confidence >= MIN_CONFIDENCE && out.wordCount >= MIN_WORDS;
    if (!out.ok) out.problem = 'Delivery screenshot is not clear.';
  } catch {
    out.problem = 'Delivery screenshot is not clear: it could not be read on this computer.';
  }
  if (analyse) {
    try {
      out.fingerprint = (await analyse(file))?.fingerprint ?? null;
    } catch {
      out.fingerprint = null;
    }
  }
  return out;
}
