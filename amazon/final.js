// The Status of a checked row: the one thing staff read first, and the word
// written in the file's Status column.
//   Pass: the Type is Verified or Rating Only; fully checked
//   Fail: a duplicate; a missing purchase screenshot, delivery screenshot or
//          review; a different order ID, product, order date or amount; not
//          delivered; a wrong review link; a deleted review; Amazon not
//          letting the user add a review
//   Needs Manual Staff Checking: anything the dashboard could not decide: a
//          screenshot or link it could not open or read, a review not found
//          or not looked for, and a possible reading mistake (an order ID, an
//          order date or an amount one digit away from the form, or no
//          "Delivered" found on the delivery screenshot)
// A row not checked yet has none. (In the code, the Status's key is called
// "final": 'pass', 'fail' or 'manual'.)

import { holdsWord } from './screen-text.js';

export const FINAL_KEYS = ['pass', 'fail', 'manual'];
export const FINAL_WORDS = { pass: 'Pass', fail: 'Fail', manual: 'Needs Manual Staff Checking' };

/** The Status each Type has when no reading mistake is possible. */
export const TYPE_FINAL = {
  verified: 'pass',
  ratingOnly: 'pass',
  duplicate: 'fail',
  orderShotMissing: 'fail',
  deliveryShotMissing: 'fail',
  reviewLinkMissing: 'fail',
  orderIdNotMatching: 'fail',
  orderDetailsNotMatching: 'fail',
  notDelivered: 'fail',
  productNotMatching: 'fail',
  wrongReviewLink: 'fail',
  reviewDeleted: 'fail',
  cannotAddReviews: 'fail',
  needDriveAccess: 'manual',
  needAccess: 'manual',
  orderNotClear: 'manual',
  deliveryNotClear: 'manual',
  reviewNotClear: 'manual',
  reviewNotLive: 'manual',
  reviewLinkNeeded: 'manual',
  reviewerNotMatching: 'manual',
  reviewShotNotMatching: 'manual',
  somethingElse: 'manual',
};

/** The first sentence of a Note: the Status and its reason. */
export function finalSentence(key, reason) {
  const r = String(reason ?? '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  if (key === 'pass') return `This transaction passed: ${r}.`;
  if (key === 'fail') return `This transaction failed because ${r}.`;
  return `A staff member needs to check this transaction because ${r}.`;
}

/** A sentence made to follow "because": its first word in small letters, unless it is a name ("Amazon", "Google"). */
export function lowerFirst(sentence) {
  const t = String(sentence ?? '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  return /^(The|A|An|This|It|Its|Neither|Both|Something|There|Order|One|No)\b/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

/** True when two numbers are the same but for one digit, changed, missing or extra: "403-1234567-1234567" and "403-1234567-1234561", 654 and 664. */
export function oneDigitOff(a, b) {
  const x = String(a ?? '').replace(/\D/g, '');
  const y = String(b ?? '').replace(/\D/g, '');
  if (!x || !y || x === y || Math.abs(x.length - y.length) > 1) return false;
  if (x.length === y.length) return [...x].filter((c, i) => c !== y[i]).length === 1;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return [...long].some((_, i) => long.slice(0, i) + long.slice(i + 1) === short);
}

/** A date's digits, day first: "16072026" for 2026-07-16; "1607" when it has no year. */
export function dateDigits(d) {
  if (!d) return '';
  if (d.day) return `${d.day.slice(8, 10)}${d.day.slice(5, 7)}${d.day.slice(0, 4)}`;
  return Number.isInteger(d.month) && Number.isInteger(d.date) ? `${String(d.date).padStart(2, '0')}${String(d.month).padStart(2, '0')}` : '';
}

/** True when a date read is one digit away from the form's day (only its day and month, when it shows no year). */
export function dateOneDigitOff(read, sheetDay) {
  const mine = dateDigits(read);
  const theirs = dateDigits({ day: sheetDay });
  if (!mine || !sheetDay) return false;
  return oneDigitOff(mine, mine.length === 4 ? theirs.slice(0, 4) : theirs);
}

/** True when an amount is one digit away from the form's, in whole rupees. */
export const amountOneDigitOff = (v, sheetAmount) => Number.isFinite(v) && Number.isFinite(sheetAmount) && oneDigitOff(Math.round(v), Math.round(sheetAmount));

/** "Pass", "Fail" or "Needs Manual Staff Checking" written in a file's Status column, as its key; null for anything else. */
export function finalFromWords(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (t === 'pass' || t === 'passed') return 'pass';
  if (t === 'fail' || t === 'failed') return 'fail';
  return /^needs? manual/.test(t) ? 'manual' : null;
}

/** The Types a reading mistake can give: these are looked at again for a check made before the three Status words were added. */
const MAYBE_MISREAD = new Set(['orderIdNotMatching', 'orderDetailsNotMatching', 'notDelivered']);
const fromWords = (w) => {
  const m = String(w ?? '').match(/^(\d{2})-(\d{2})(?:-(\d{4}))?/);
  return m ? (m[3] ? { day: `${m[3]}-${m[2]}-${m[1]}` } : { month: Number(m[2]), date: Number(m[1]) }) : null;
};

/**
 * The Status of a check made before the three Status words were added, from
 * what it kept: its Type, and, for a Type a reading mistake can give, what
 * each screenshot showed. Null when it has no Type.
 */
export function finalOfSaved(r, notDeliveredWords = []) {
  if (!r?.typeKey) return null;
  if (FINAL_KEYS.includes(r.final)) return r.final;
  const base = TYPE_FINAL[r.typeKey] ?? 'manual';
  if (!MAYBE_MISREAD.has(r.typeKey)) return base;
  const s = r.sheet ?? {};
  for (const rec of [r.order, r.delivery]) {
    const d = rec?.details;
    if (!d) continue;
    if (d.product?.state === 'different') return 'fail';
    if (d.orderId?.state === 'different' && !(rec.orderIds ?? []).some((id) => oneDigitOff(id, s.orderId))) return 'fail';
    if (d.orderDate?.state === 'different' && !(rec.dates ?? []).some((w) => dateOneDigitOff(fromWords(w), s.orderDay))) return 'fail';
    if (d.amount?.state === 'different' && !(rec.amounts ?? []).some((a) => !a.skip && amountOneDigitOff(a.value, s.amountValue))) return 'fail';
  }
  // A screenshot cell that is empty or holds words ("Cancelled"), and a delivery screenshot that clearly says it was not delivered.
  if ([1, 3].some((i) => /^The cell (is empty|says)/.test(r.steps?.[i]?.detail ?? ''))) return 'fail';
  if (r.delivery?.details && !r.delivery.delivered && holdsWord(r.delivery.text, notDeliveredWords)) return 'fail';
  return 'manual';
}
