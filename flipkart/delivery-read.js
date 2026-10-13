// What a Flipkart delivery screenshot says, from the words Tesseract read on
// this computer: "Delivered" and its date, and the order IDs. Copied from the
// Amazon checker (amazon/delivery-read.js), only what reading a delivery
// screenshot needs, and changed only for Flipkart's screens: Flipkart writes
// "Delivered, Sep 30" (or "Delivered, Today, Aug 31") with marks around it,
// shows "Return policy ended on …", "How was your delivery experience?" and,
// for a quick delivery, "Arrived in just 12 minutes!" only once an order is
// delivered, names the person it was handed to in
// "Delivered to … at …" (never kept), and lists every stage of an order
// ("Shipped", "Out For Delivery") on its page, delivered or not. The product
// is told by its name, as on the purchase screenshot (check.js), so the
// Amazon checker's guess at it from where its lines sit is left out. No API
// key, nothing sent anywhere.

import { closeWords } from './text.js';
import { orderIdsIn, datesIn } from './screen-text.js';

/**
 * Flipkart's words for an order that was not delivered, the first one a
 * screenshot holds being said: the Amazon checker's (its settings' "not
 * delivered words"), without its own "Cancel items" button.
 */
export const NOT_DELIVERED_WORDS = Object.freeze(['Cancelled', 'Canceled', 'Lost', 'In transit', 'Not delivered', 'Returned', 'Arriving', 'Out for delivery', 'Shipped', 'Expected']);

// "Not delivered", "Delivery attempt failed", "Out for delivery", "Delivery by Thu 23rd Jul", "Delivery expected by …", "Shipped", "You can
// cancel this order till …": never a delivery.
const NOT_DELIVERED = /\b(?:not|never|cannot|can'?t|couldn'?t|failed|unable|yet\s+to\s+be|attempt(?:ed)?)\b[^.!?]{0,40}?\bdeliver(?:ed|y)\b|\bun-?deliver(?:ed|able)\b|\bout\s+for\s+delivery\b|\barriving\b|\bwill\s+be\s+delivered\b|\bdelivery\s+by\b|\bexpected\s+(?:by|delivery|on)\b|\bdelivery\s+expected\b|\bshipped\b|\bdelivery\s+attempt|\bcancel\s+this\s+order\b/i;
// "Delivered, Sep 30", "Delivered on Fri, Sep 26", "Your item has been delivered": the word, then the rest of the line. Never "Delivered to …".
const DELIVERED = /(?:^|[^\p{L}])delivered\b(?!\s+to\b)(?:\s+on\b)?[\s:,-]*(.*)$/iu;
const DELIVERED_HINDI = /डिलीवर\s*(?:किया\s*गया|हो\s*गया)|डिलीवर\s*कर\s*दिया\s*गया/u;
// A word that may be "Delivered" read with a letter lost or changed ("Delivere", "Dellvered").
const DELIVERED_LIKE = /(?<!\p{L})d\p{L}{6,9}(?!\p{L})/giu;
// Flipkart's delivery details once delivered: "Delivered to <the person> at <the place>". Only the words before the name are ever said.
const DELIVERED_TO = /(?:^|[^\p{L}])delivered\s+to\b/iu;
// What Flipkart's order page shows only once an order has been delivered: a sign of delivery when the word itself is off the screenshot
// ("Arrived in just 12 minutes!" on a quick delivery's card).
const DELIVERED_SIGN = /\breturn policy (?:ended|ends)\b|\bhow was your delivery experience\b|\barrived in (?:just )?\d+\s*(?:min(?:ute)?s?|hours?)\b/i;

const textOf = (l) => String(typeof l === 'string' ? l : l?.text ?? '').replace(/\s+/g, ' ').trim();

/** The word "Delivered" in a line, or that word read with one letter lost or changed: { at (where it starts), rest (what follows it) } or null. */
function deliveredWord(t) {
  const m = t.match(DELIVERED);
  if (m) return { at: m.index + m[0].search(/d/i), rest: m[1] };
  for (const c of t.matchAll(DELIVERED_LIKE)) {
    const after = t.slice(c.index + c[0].length);
    if (/^deliver(?:y|ies|ing)?$/i.test(c[0]) || !closeWords(c[0].toLowerCase(), 'delivered') || /^\s+to\b/i.test(after)) continue;
    return { at: c.index, rest: after.replace(/^(?:\s+on\b)?[\s:,-]*/i, '') };
  }
  return null;
}

/**
 * The Delivered line as said on the row's page: from the word to the end of
 * its date, without the marks Flipkart draws around it ("© Delivered, Sep 30
 * ^" is "Delivered, Sep 30"); the whole line when words come before the word
 * ("Your item has been delivered").
 */
function deliveredWords(t, at, on) {
  // Marks only before the word: a sign or two, or a letter or a digit or two read from an icon, then a bracket or a space.
  const marks = /^\W*(?:[\p{L}\p{N}]{1,2}\W)?\W*$/u.test(t.slice(0, at));
  let out = marks ? t.slice(at) : t;
  const end = on?.text ? out.lastIndexOf(on.text) : -1;
  if (end >= 0) out = out.slice(0, end + on.text.length);
  return out.replace(/[\s,;:]+$/, '');
}

/**
 * The "Delivered" line: { at, text, date, on, how } or null. how is 'word'
 * for the word itself (in English, read with a letter wrong, or in Hindi),
 * 'to' for "Delivered to …" (only when no other line has the word), or
 * 'sign' for a line
 * Flipkart's order page shows only once an order has been delivered ("Return
 * policy ended on …", "How was your delivery experience?", "Arrived in just
 * 12 minutes!"), taken only when no line says the order is still on its way.
 */
function deliveredLine(texts) {
  let to = -1;
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    if (NOT_DELIVERED.test(t)) continue;
    if (DELIVERED_HINDI.test(t)) return { at: i, text: t, date: null, on: null, how: 'word' };
    const w = deliveredWord(t);
    if (w) {
      const date = w.rest.replace(/[.,;:!]+$/, '').trim();
      const on = date ? datesIn([date])[0] ?? null : null;
      return { at: i, text: deliveredWords(t, w.at, on), date: on?.text ?? (date || null), on, how: 'word' };
    }
    if (to < 0 && DELIVERED_TO.test(t)) to = i;
  }
  if (to >= 0) return { at: to, text: 'Delivered to …', date: null, on: null, how: 'to' };
  if (texts.some((t) => NOT_DELIVERED.test(t))) return null;
  const at = texts.findIndex((t) => DELIVERED_SIGN.test(t));
  return at >= 0 ? { at, text: texts[at].match(DELIVERED_SIGN)[0], date: null, on: null, how: 'sign' } : null;
}

/**
 * What a delivery screenshot says, from its lines (Tesseract's line objects,
 * or plain strings): { delivered, deliveredText, deliveredHow, deliveredDate,
 * deliveredDay, deliveredOn, orderId, orderIds }. deliveredOn is the date read
 * on the Delivered line ({ day, year, month, date }; Flipkart shows no year,
 * so day is mostly null). Anything not shown is false or null, never guessed.
 */
export function parseDelivery(lines) {
  const texts = (Array.isArray(lines) ? lines : []).map(textOf).filter(Boolean);
  const d = deliveredLine(texts);
  const ids = orderIdsIn(texts);
  const on = d?.on ?? null;
  return {
    delivered: Boolean(d),
    deliveredText: d?.text ?? null,
    deliveredHow: d?.how ?? null,
    deliveredDate: d?.date ?? null,
    deliveredDay: on?.day ?? null,
    deliveredOn: on ? { day: on.day, year: on.year, month: on.month, date: on.date } : null,
    orderId: ids[0] ?? null,
    orderIds: ids,
  };
}
