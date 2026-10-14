// The Status, Type and Note of a checked Flipkart row, with the Amazon
// checker's words and rules (amazon/final.js, amazon/settings.js and
// amazon/notes.js), copied here so Flipkart never changes them:
//   Pass: the Type is Verified or Rating Only; fully checked
//   Fail: a missing purchase screenshot, delivery screenshot or review; a
//          different order ID, product, order date or amount; not delivered;
//          Flipkart not accepting the review
//   Needs Manual Staff Checking: anything the dashboard could not decide: a
//          screenshot it could not open or read, a review not found or that
//          cannot be told to be the user's, and a possible reading mistake (an
//          order ID, an order date or an amount one digit away from the sheet,
//          or no "Delivered" found on the delivery screenshot)
// A row not checked yet has none. (In the code, the Status's key is called
// "final": 'pass', 'fail' or 'manual'.) The Type words are the Amazon
// checker's own (its settings' typeWords as they come), never read from its
// settings file.

export const FINAL_KEYS = ['pass', 'fail', 'manual'];
export const FINAL_WORDS = { pass: 'Pass', fail: 'Fail', manual: 'Needs Manual Staff Checking' };

/** Every Type, in the order the Amazon screen lists them, with its words. */
export const TYPE_WORDS = Object.freeze({
  verified: 'Verified',
  ratingOnly: 'Rating Only',
  duplicate: 'Duplicate',
  orderShotMissing: 'Purchase screenshot missing',
  deliveryShotMissing: 'Delivery screenshot missing',
  reviewLinkMissing: 'Review link or screenshot missing',
  needDriveAccess: 'Need Google Drive Access',
  needAccess: 'Need Access',
  orderNotClear: 'Purchase screenshot not clear',
  deliveryNotClear: 'Delivery screenshot not clear',
  reviewNotClear: 'Review screenshot not clear',
  orderIdNotMatching: 'Order ID is not matching',
  orderDetailsNotMatching: 'Order details not matching',
  notDelivered: 'Not delivered',
  productNotMatching: 'Product is not matching',
  wrongReviewLink: 'Wrong review link',
  reviewDeleted: 'Amazon review is deleted',
  reviewNotLive: 'Review not live',
  reviewLinkNeeded: 'Review link needed',
  reviewerNotMatching: 'Reviewer name is different',
  reviewShotNotMatching: 'Review screenshot not matching',
  cannotAddReviews: 'User not being able to add reviews',
  somethingElse: 'Something else',
});
export const TYPE_KEYS = Object.keys(TYPE_WORDS);

/** The Status each Type has when no reading mistake is possible. */
export const TYPE_FINAL = Object.freeze({
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
});

/** A Type's words; "Something else" for a Type this dashboard does not know. */
export const typeWord = (key) => TYPE_WORDS[key] ?? TYPE_WORDS.somethingElse;

/** The first sentence of a Note: the Status and its reason. */
export function finalSentence(key, reason) {
  const r = String(reason ?? '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  if (key === 'pass') return `This transaction passed: ${r}.`;
  if (key === 'fail') return `This transaction failed because ${r}.`;
  return `A staff member needs to check this transaction because ${r}.`;
}

/** A sentence made to follow "because": its first word in small letters, unless it is a name ("Flipkart", "Google"). */
export function lowerFirst(sentence) {
  const t = String(sentence ?? '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  return /^(The|A|An|This|It|Its|Neither|Both|Something|There|Order|One|No)\b/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

/** True when two numbers are the same but for one digit, changed, missing or extra: "OD100000000000000002" and "OD100000000000000003", 654 and 664. */
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

/** True when a date read is one digit away from the sheet's day (only its day and month, when it shows no year). */
export function dateOneDigitOff(read, sheetDay) {
  const mine = dateDigits(read);
  const theirs = dateDigits({ day: sheetDay });
  if (!mine || !sheetDay) return false;
  return oneDigitOff(mine, mine.length === 4 ? theirs.slice(0, 4) : theirs);
}

/** True when an amount is one digit away from the sheet's, in whole rupees. */
export const amountOneDigitOff = (v, sheetAmount) => Number.isFinite(v) && Number.isFinite(sheetAmount) && oneDigitOff(Math.round(v), Math.round(sheetAmount));

/** "Pass", "Fail" or "Needs Manual Staff Checking" written in a file's Status column, as its key; null for anything else. */
export function finalFromWords(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (t === 'pass' || t === 'passed') return 'pass';
  if (t === 'fail' || t === 'failed') return 'fail';
  return /^needs? manual/.test(t) ? 'manual' : null;
}

/** The key of a Type written in a file's Type column, as the Amazon checker reads one (any case, any spaces); null for words that are not a Type. */
export function typeFromWords(text) {
  const norm = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const t = norm(text);
  return t ? TYPE_KEYS.find((k) => norm(TYPE_WORDS[k]) === t) ?? null : null;
}

/**
 * The Status a file's own Status, Type and Note give a row, as on the Amazon
 * screen (amazon/routes.js finalOfRow): its Status when it is already Pass,
 * Fail or Needs Manual Staff Checking, else the one its Type gives, else Pass
 * for an older file's "Verified", else Needs Manual Staff Checking; null when
 * the file gives none.
 */
export function finalOfFile(prev) {
  if (!String(prev?.status ?? '').trim()) return null;
  const fromFile = finalFromWords(prev.status);
  if (fromFile) return fromFile;
  const key = typeFromWords(prev.type);
  if (key) return TYPE_FINAL[key];
  return typeFromWords(prev.status) === 'verified' ? 'pass' : 'manual';
}
