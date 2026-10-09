// The emails sent to users about what is still needed: one for every Type
// that is not Pass, except Something else, and a second one for an order
// whose screenshot says cancelled or returned. Each email is kept in the
// settings file (settings.json, "emails"), where its words can be changed,
// and shown under More in the Email templates box. The words are short and
// simple, with nothing a child could not follow: no double dashes, no short
// codes, no hard words, and never one of the words this dashboard must not
// show. Before an email is sent, these words are filled in for the row:
//   {name}          the name in the file's Reviewer Name column
//   {order ID}      the row's order ID
//   {product}       the product ordered, as the file names it
//   {what is wrong} what the check found for that row, in one or two
//                   sentences (for example: "You gave order ID A, but your
//                   purchase screenshot shows order ID B.")
//   {sign-off}      the sign-off at the end, the same for every email
// Nothing here sends anything: gmail.js does that, with the email as the
// staff member last saw it on the screen.

import { clean, joinAnd } from './notes.js';
import { dayFirst, rupees, holdsWord } from './screen-text.js';

/** The emails, in the order the Types are listed. notDeliveredCancelled is the second email for Not delivered. */
export const EMAIL_KEYS = [
  'duplicate',
  'orderShotMissing',
  'deliveryShotMissing',
  'reviewLinkMissing',
  'needDriveAccess',
  'needAccess',
  'orderNotClear',
  'deliveryNotClear',
  'reviewNotClear',
  'orderIdNotMatching',
  'orderDetailsNotMatching',
  'notDelivered',
  'notDeliveredCancelled',
  'productNotMatching',
  'wrongReviewLink',
  'reviewDeleted',
  'reviewNotLive',
  'reviewLinkNeeded',
  'reviewerNotMatching',
  'reviewShotNotMatching',
  'cannotAddReviews',
];
/** The words an email may hold between curly brackets, each with what it becomes. */
export const PLACEHOLDERS = [
  { word: '{name}', means: "the name in the file's Reviewer Name column" },
  { word: '{order ID}', means: "the row's order ID" },
  { word: '{product}', means: 'the product ordered, as the file names it' },
  { word: '{what is wrong}', means: 'what the check found for that row, for example: You gave order ID 403-1234567-1234567, but your purchase screenshot shows order ID 403-7654321-7654321.' },
  { word: '{sign-off}', means: 'the sign-off at the end, the same for every email' },
];
export const MAX_SUBJECT = 150;
export const MAX_MESSAGE = 4000;
export const MAX_SIGN_OFF = 300;

const HELLO = 'Hello {name},\n\nThis is about your order {order ID} for {product}.';
const PURCHASE_HOW = 'How to take it:\nIn the Amazon app: tap "You", then "Your Orders", then this order.\nOn the Amazon website: click "Returns & Orders", then "View order details" for this order.\nThe screenshot must show the order ID, the amount and the product.';
const DELIVERY_HOW = 'How to take it:\nIn the Amazon app: tap "You", then "Your Orders", then this order.\nOn the Amazon website: click "Returns & Orders", then "View order details" for this order.\nThe screenshot must show the word "Delivered" and the product.';
const LINK_HOW = 'How to copy the link to your review:\nIn the Amazon app: open your review, tap "Share", then "Copy".\nOn the Amazon website: click the title of your review, then copy the link at the top of the page.';
const MAIL_HOW = 'How to find Amazon\'s email about your review:\nOpen your email and search for "review is live". Open the email from Amazon and take a screenshot of it.';
const LINK_ASK = 'Please reply to this email with the link to your own review and a screenshot of it, or with Amazon\'s email saying your review is live.';
const CLEAR_ASK = 'Please reply to this email with the same screenshot again, as a clear picture.';
const message = (...parts) => `${parts.join('\n\n')}\n\n{sign-off}`;

/** Every email as it comes with the dashboard, and the sign-off. */
export const DEFAULT_EMAILS = {
  signOff: 'Thank you,\nThe support team',
  templates: {
    duplicate: {
      subject: 'Your order {order ID}: it was already sent',
      message: message(HELLO, 'The same order, screenshot or review was already sent for another entry.', 'If this is a mistake, please reply to this email and tell us.'),
    },
    orderShotMissing: {
      subject: 'Your order {order ID}: please send the purchase screenshot',
      message: message(HELLO, 'The purchase screenshot was not added in the form, so we cannot see the order.', 'Please reply to this email with the purchase screenshot: a screenshot of this order on Amazon that shows the order ID, the amount and the product.', PURCHASE_HOW),
    },
    deliveryShotMissing: {
      subject: 'Your order {order ID}: please send the delivery screenshot',
      message: message(HELLO, 'The delivery screenshot was not added in the form, so we cannot see that the order was delivered.', 'Please reply to this email with the delivery screenshot: a screenshot of this order on Amazon that shows the word "Delivered" and the product.', DELIVERY_HOW),
    },
    reviewLinkMissing: {
      subject: 'Your order {order ID}: please send the link to your review',
      message: message(HELLO, 'The link to your review and the screenshot of it were not added in the form, so we cannot see your review.', LINK_ASK, LINK_HOW, MAIL_HOW),
    },
    needDriveAccess: {
      subject: 'Your order {order ID}: please send the screenshot again',
      message: message(HELLO, '{what is wrong}', CLEAR_ASK),
    },
    needAccess: {
      subject: 'Your order {order ID}: please send the screenshot again',
      message: message(HELLO, '{what is wrong}', CLEAR_ASK),
    },
    orderNotClear: {
      subject: 'Your order {order ID}: please send a clear purchase screenshot',
      message: message(HELLO, '{what is wrong}', 'Please reply to this email with a clear screenshot of this order on Amazon that shows the order ID, the amount and the product.', PURCHASE_HOW),
    },
    deliveryNotClear: {
      subject: 'Your order {order ID}: please send a clear delivery screenshot',
      message: message(HELLO, '{what is wrong}', 'Please reply to this email with a screenshot of this order on Amazon that shows the word "Delivered" and the product.', DELIVERY_HOW),
    },
    reviewNotClear: {
      subject: 'Your order {order ID}: please send the review screenshot again',
      message: message(HELLO, '{what is wrong}', CLEAR_ASK),
    },
    orderIdNotMatching: {
      subject: 'Your order {order ID}: the order ID does not match',
      message: message(HELLO, '{what is wrong}', 'Please reply to this email with the screenshot of the right order, or with the right order ID.', PURCHASE_HOW),
    },
    orderDetailsNotMatching: {
      subject: 'Your order {order ID}: the order details do not match',
      message: message(HELLO, '{what is wrong}', 'Please reply to this email with the right screenshot, or with the right details.', PURCHASE_HOW),
    },
    notDelivered: {
      subject: 'Your order {order ID}: please send the delivery screenshot once it is delivered',
      message: message(HELLO, '{what is wrong}', 'Once the order is delivered, please reply to this email with the delivery screenshot: a screenshot of this order on Amazon that shows the word "Delivered" and the product.', DELIVERY_HOW),
    },
    notDeliveredCancelled: {
      subject: 'Your order {order ID}: the screenshot says it was cancelled or returned',
      message: message(HELLO, '{what is wrong}', 'If the order was in fact delivered, please reply to this email with the delivery screenshot: a screenshot of this order on Amazon that shows the word "Delivered" and the product.', DELIVERY_HOW),
    },
    productNotMatching: {
      subject: 'Your order {order ID}: the product does not match',
      message: message(HELLO, '{what is wrong}', 'Please reply to this email with the right screenshot, or with the review of the right product.', PURCHASE_HOW),
    },
    wrongReviewLink: {
      subject: 'Your order {order ID}: please send the link to your review',
      message: message(HELLO, 'The review link you gave does not open your review.', LINK_ASK, LINK_HOW, MAIL_HOW),
    },
    reviewDeleted: {
      subject: 'Your order {order ID}: Amazon no longer shows your review',
      message: message(HELLO, 'Amazon no longer shows your review for this product.', 'Please reply to this email with two screenshots:\n1. Amazon\'s email saying your review is live. It must show your name, the product and the words of your review.\n2. The page or email where Amazon says why your review was removed.', MAIL_HOW),
    },
    reviewNotLive: {
      subject: 'Your order {order ID}: please send the link to your review',
      message: message(HELLO, 'We could not find your review among the reviews of this product on Amazon.', LINK_ASK, LINK_HOW, MAIL_HOW),
    },
    reviewLinkNeeded: {
      subject: 'Your order {order ID}: please send the link to your review',
      message: message(HELLO, 'We could not find your review on Amazon from what you sent, so we need the link to it.', LINK_ASK, LINK_HOW, MAIL_HOW),
    },
    reviewerNotMatching: {
      subject: 'Your order {order ID}: the name on the review is different',
      message: message(HELLO, '{what is wrong}', 'Please reply to this email and tell us whose Amazon account wrote the review, and why the name is different.'),
    },
    reviewShotNotMatching: {
      subject: 'Your order {order ID}: the review screenshot does not match',
      message: message(HELLO, '{what is wrong}', 'Please reply to this email with a screenshot of your own review.'),
    },
    cannotAddReviews: {
      subject: 'Your order {order ID}: please send the message Amazon showed',
      message: message(HELLO, 'Amazon did not let you add a review for this product.', 'Please reply to this email with a screenshot of the message Amazon shows after you tap Submit. It often starts with "Error", or says Amazon is not taking reviews for this product or brand.', 'If you have not sent them yet, please also send the purchase screenshot and the delivery screenshot of this order.'),
    },
  },
};

/** A problem with the emails in the settings file, in a plain sentence. */
export class EmailsError extends Error {}

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const KNOWN_WORDS = new Set(PLACEHOLDERS.map((p) => p.word));

/** Some words of an email, checked: some text, not too long, with only the words between curly brackets this dashboard knows. Line breaks stay. */
function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim()) throw new EmailsError(`In the settings file, ${label} must be some words between quotes.`);
  const s = value.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (s.length > max) throw new EmailsError(`In the settings file, ${label} is too long (at most ${max} characters).`);
  for (const m of s.matchAll(/\{[^{}\n]*\}/g)) {
    if (!KNOWN_WORDS.has(m[0])) throw new EmailsError(`In the settings file, ${label} uses ${m[0]}, which the dashboard does not know. It knows ${joinAnd([...KNOWN_WORDS])}.`);
  }
  return s;
}

/**
 * The "emails" setting, checked: the sign-off and every email, with the
 * dashboard's own words for anything left out. Throws EmailsError with a
 * plain sentence for anything wrong.
 */
export function checkEmails(raw) {
  if (raw === undefined) return structuredClone(DEFAULT_EMAILS);
  if (!isObject(raw)) throw new EmailsError('In the settings file, "emails" must be a group in curly brackets, like the one it came with.');
  for (const k of Object.keys(raw)) if (!['signOff', 'templates'].includes(k)) throw new EmailsError(`In the settings file, "emails" has a setting this dashboard does not know: "${k}". It knows "signOff" and "templates".`);
  const out = { signOff: raw.signOff === undefined ? DEFAULT_EMAILS.signOff : text(raw.signOff, '"emails.signOff"', MAX_SIGN_OFF), templates: {} };
  const t = raw.templates === undefined ? {} : raw.templates;
  if (!isObject(t)) throw new EmailsError('In the settings file, "emails.templates" must be a group in curly brackets, like the one it came with.');
  for (const k of Object.keys(t)) if (!EMAIL_KEYS.includes(k)) throw new EmailsError(`In the settings file, "emails.templates" has an email this dashboard does not know: "${k}". Check its spelling.`);
  for (const k of EMAIL_KEYS) {
    const given = t[k];
    if (given === undefined) {
      out.templates[k] = { ...DEFAULT_EMAILS.templates[k] };
      continue;
    }
    if (!isObject(given)) throw new EmailsError(`In the settings file, "emails.templates.${k}" must be a group in curly brackets with "subject" and "message".`);
    for (const f of Object.keys(given)) if (!['subject', 'message'].includes(f)) throw new EmailsError(`In the settings file, "emails.templates.${k}" has a part this dashboard does not know: "${f}". It knows "subject" and "message".`);
    out.templates[k] = {
      subject: given.subject === undefined ? DEFAULT_EMAILS.templates[k].subject : text(given.subject, `"emails.templates.${k}.subject"`, MAX_SUBJECT).replace(/\s+/g, ' '),
      message: given.message === undefined ? DEFAULT_EMAILS.templates[k].message : text(given.message, `"emails.templates.${k}.message"`, MAX_MESSAGE),
    };
  }
  return out;
}

/** The email's name on the screen: its Type's word; the second Not delivered email says what it is for. */
export function emailName(key, settings) {
  const words = settings?.typeWords ?? {};
  if (key === 'notDeliveredCancelled') return `${words.notDelivered ?? 'Not delivered'} (cancelled or returned)`;
  return words[key] ?? key;
}

/** True when this Type has an email. */
export const hasEmail = (typeKey) => EMAIL_KEYS.includes(typeKey);

const WHICH = { order: 'purchase screenshot', delivery: 'delivery screenshot', review: 'review screenshot', reviewShot: 'review screenshot' };
const CANCELLED = /cancel|return/i;

/** The not-delivered word a delivery cell or its screenshot holds, or null. */
function notDeliveredWord(row, result, settings) {
  if (result?.delivery?.notDelivered) return String(result.delivery.notDelivered);
  const text = String(row?.shots?.delivery?.text ?? '');
  const words = settings?.notDeliveredWords ?? [];
  return words.find((w) => holdsWord(text, [w])) ?? null;
}

/**
 * Which email a row gets: its Type's, or, for Not delivered, the second one
 * when the delivery cell or screenshot says cancelled or returned. Null when
 * the Type has no email.
 */
export function emailKeyFor(typeKey, { row = null, result = null, settings = null } = {}) {
  if (!hasEmail(typeKey)) return null;
  if (typeKey === 'notDelivered' && CANCELLED.test(notDeliveredWord(row, result, settings) ?? '')) return 'notDeliveredCancelled';
  return typeKey;
}

const q = (t) => `"${clean(String(t ?? '').replace(/\s+/g, ' ').trim())}"`;
const NOUN = { orderId: 'order ID', orderDate: 'order date', amount: 'amount', product: 'product' };
/** The screenshots of a check whose detail k is in this state: [{ which, v }]. */
function detailsOn(result, k, state) {
  return ['order', 'delivery'].map((which) => ({ which, v: result?.[which]?.details?.[k] })).filter((x) => x.v?.state === state);
}
/** "your purchase screenshot shows …", or both when both show the same. */
function shownOn(list, say) {
  const vals = list.map((x) => say(x.v));
  if (list.length === 2 && vals[0] === vals[1]) return `your screenshots show ${vals[0]}`;
  return list.map((x, i) => `your ${WHICH[x.which]} shows ${vals[i]}`).join(' and ');
}
/** The cells whose pictures could not be had: their names, in the order they are checked. */
function unopened(row, test) {
  return ['order', 'delivery', 'review', 'reviewShot'].filter((w) => (row?.pictures?.[w] ?? []).some((p) => p?.problem && test(p.problem))).map((w) => WHICH[w]);
}
const theFiles = (names) => (names.length ? `the ${joinAnd([...new Set(names)])}` : 'the file');

/**
 * What is wrong, for the row, in one or two plain sentences, from what the
 * check found (result) and what the file says (row, reviewer). When the
 * check's details are not known (a result changed by staff, or an older
 * check), a sentence that is still true.
 */
export function whatIsWrong(key, { row = null, result = null, reviewer = null, settings = null } = {}) {
  const sheet = result?.sheet ?? {};
  const givenId = clean(String(sheet.orderId || row?.orderId?.text || '').trim());
  const product = clean(String(sheet.product || row?.product?.text || '').trim());
  const wanted = product ? q(product) : 'the product you ordered';
  switch (key) {
    case 'orderIdNotMatching': {
      const diff = detailsOn(result, 'orderId', 'different');
      if (diff.length && givenId) return `You gave order ID ${givenId}, but ${shownOn(diff, (v) => `order ID ${clean(v.shown)}`)}.`;
      return givenId ? `The order ID you gave, ${givenId}, is not the order ID on your screenshot.` : 'The order ID you gave is not the order ID on your screenshot.';
    }
    case 'orderDetailsNotMatching': {
      const out = [];
      for (const k of ['orderDate', 'amount']) {
        const diff = detailsOn(result, k, 'different');
        if (!diff.length) continue;
        const given = k === 'orderDate' ? (sheet.orderDay ? dayFirst(sheet.orderDay) : sheet.orderDate || row?.orderDate?.text) : rupees(sheet.amountValue ?? row?.amount?.value) ?? sheet.amount ?? row?.amount?.text;
        out.push(`The ${NOUN[k]} is different: you gave ${clean(String(given ?? '').trim()) || `${k === 'amount' ? 'an amount' : 'a date'}`}, but ${shownOn(diff, (v) => clean(v.shown))}.`);
      }
      return out.length ? out.join(' ') : 'The order date or the amount you gave is different from what your screenshot shows.';
    }
    case 'productNotMatching': {
      const diff = detailsOn(result, 'product', 'different');
      if (diff.length) return `${shownOn(diff, (v) => q(v.shown)).replace(/^your/, 'Your')}, but the product should be ${wanted}.`;
      if (result?.amazon?.productTitle) return `Your review is for ${q(result.amazon.productTitle)}, but it should be for ${wanted}.`;
      return `Your screenshot or your review shows a different product. The product should be ${wanted}.`;
    }
    case 'notDelivered': {
      const word = notDeliveredWord(row, result, settings);
      const cell = String(row?.shots?.delivery?.text ?? '').trim();
      if (result?.delivery && word) return `Your delivery screenshot says ${q(word)}, not "Delivered".`;
      if (cell && !row?.shots?.delivery?.links?.length) return `You wrote ${q(cell)} in the form instead of giving a delivery screenshot.`;
      return 'Your delivery screenshot does not show that the order was delivered.';
    }
    case 'notDeliveredCancelled': {
      const word = notDeliveredWord(row, result, settings);
      const cell = String(row?.shots?.delivery?.text ?? '').trim();
      if (result?.delivery && word) return `Your delivery screenshot says ${q(word)}, so it looks like the order was not delivered.`;
      if (cell && !row?.shots?.delivery?.links?.length) return `You wrote ${q(cell)} in the form, so it looks like the order was not delivered.`;
      return 'Your screenshot says the order was cancelled or returned, so it looks like it was not delivered.';
    }
    case 'deliveryNotClear': {
      const d = result?.delivery;
      if (d && d.ok !== false && d.details) {
        const missing = [];
        if (!d.delivered) missing.push('the word "Delivered"');
        if (d.details.orderId?.state === 'not shown') missing.push('the order ID');
        if (d.details.product?.state === 'not shown') missing.push('the product');
        if (missing.length) return `The delivery screenshot you sent does not show ${joinAnd(missing)}, so it is not enough.`;
      }
      if (d && d.ok === false) return 'What you sent as the delivery screenshot could not be read (for example, a photo of the product is not enough).';
      return 'What you sent as the delivery screenshot is not enough (for example, a photo of the product is not enough).';
    }
    case 'orderNotClear': {
      const o = result?.order;
      if (o && o.ok !== false && o.details) {
        const missing = ['orderId', 'amount', 'product', 'orderDate'].filter((k) => o.details[k]?.state === 'not shown').map((k) => `the ${NOUN[k]}`);
        if (missing.length) return `On the purchase screenshot you sent, we could not see ${joinAnd(missing)}.`;
      }
      if (o && o.ok === false) return 'The purchase screenshot you sent could not be read.';
      return 'On the purchase screenshot you sent, we could not see the order ID, the amount or the product.';
    }
    case 'reviewerNotMatching': {
      const onReview = clean(String(result?.amazon?.name ?? '').trim());
      const given = clean(String(reviewer ?? '').trim());
      if (onReview && given) return `The name on the review is ${q(onReview)}, but the name you gave is ${q(given)}.`;
      return 'The name on the review is not the name you gave.';
    }
    case 'reviewShotNotMatching': {
      const s = result?.reviewShot ?? {};
      const a = clean(String(result?.amazon?.name ?? '').trim());
      const b = clean(String(s.name ?? '').trim());
      if (s.problem === 'name') return a && b ? `Your review screenshot shows a review by ${q(b)}, but the review your link opens is by ${q(a)}.` : 'The name on your review screenshot is different from the name on the review your link opens.';
      if (s.problem === 'words') return 'The words on your review screenshot are different from the words of the review your link opens.';
      return 'Your review screenshot does not match the review your link opens: the name or the words are different.';
    }
    case 'reviewNotClear':
      return 'We could not read the review screenshot you sent.';
    case 'needDriveAccess':
      return `We could not open ${theFiles(unopened(row, (p) => p.noAccess || p.kind === 'drive'))} you sent on Google Drive.`;
    case 'needAccess':
      return `We could not open ${theFiles(unopened(row, () => true))} you sent.`;
    case 'duplicate':
      return 'The same order, screenshot or review was already sent for another entry.';
    case 'orderShotMissing':
      return 'The purchase screenshot was not added in the form, so we cannot see the order.';
    case 'deliveryShotMissing':
      return 'The delivery screenshot was not added in the form, so we cannot see that the order was delivered.';
    case 'reviewLinkMissing':
      return 'The link to your review and the screenshot of it were not added in the form, so we cannot see your review.';
    case 'wrongReviewLink':
      return 'The review link you gave does not open your review.';
    case 'reviewDeleted':
      return 'Amazon no longer shows your review for this product.';
    case 'reviewNotLive':
      return 'We could not find your review among the reviews of this product on Amazon.';
    case 'reviewLinkNeeded':
      return 'We could not find your review on Amazon from what you sent, so we need the link to it.';
    case 'cannotAddReviews':
      return 'Amazon did not let you add a review for this product.';
    default:
      return '';
  }
}

/**
 * Some words with their placeholders filled in. A blank name or order ID
 * goes with the space before it ("Hello {name}," becomes "Hello,"); a blank
 * product becomes "this product"; a blank {what is wrong} goes with its
 * line. The sign-off is added at the end when the words do not place it.
 */
export function fill(text, { name = '', orderId = '', product = '', whatIsWrong: wrong = '', signOff = '' } = {}, { addSignOff = false } = {}) {
  let out = String(text ?? '');
  const one = (v) => clean(String(v ?? '').replace(/\s+/g, ' ').trim());
  const blankGoes = (word, value) => {
    out = value ? out.split(word).join(value) : out.replace(new RegExp(` ?${word.replace(/[{}]/g, '\\$&')}`, 'g'), '');
  };
  blankGoes('{name}', one(name));
  blankGoes('{order ID}', one(orderId));
  out = out.split('{product}').join(one(product) || 'this product');
  const w = clean(String(wrong ?? '').trim());
  out = w ? out.split('{what is wrong}').join(w) : out.replace(/[ \t]*\{what is wrong\}[ \t]*\n?/g, '');
  const s = clean(String(signOff ?? '').trim());
  if (out.includes('{sign-off}')) out = out.split('{sign-off}').join(s);
  else if (addSignOff && s) out = `${out.trim()}\n\n${s}`;
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * The email for a row: its key and name, who it goes to, and its subject
 * and message filled in from the template in the settings. Null when the
 * row's Type has no email. typeKey is the row's Type; result is its saved
 * check (or null); reviewer is the name in the Reviewer Name column.
 */
export function emailFor({ typeKey, row, result = null, reviewer = null, settings, to = '' }) {
  const key = emailKeyFor(typeKey, { row, result, settings });
  if (!key) return null;
  const t = settings.emails?.templates?.[key] ?? DEFAULT_EMAILS.templates[key];
  const values = { name: reviewer ?? '', orderId: row?.orderId?.text ?? '', product: row?.product?.text ?? '', whatIsWrong: whatIsWrong(key, { row, result, reviewer, settings }), signOff: settings.emails?.signOff ?? DEFAULT_EMAILS.signOff };
  return { key, name: emailName(key, settings), to: String(to ?? ''), subject: fill(t.subject, values), message: fill(t.message, values, { addSignOff: true }) };
}
