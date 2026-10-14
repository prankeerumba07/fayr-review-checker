// The email for a user about what is still needed, copied from the Amazon
// checker's emails (amazon/emails.js) and changed for Flipkart: one for every
// Type that is not Pass, and a second one for an order whose screenshot says
// cancelled or returned. The Amazon checker has no email for Something else,
// so its email here is written in the same way. "Amazon" is "Flipkart" here,
// and what fits only Amazon is changed to fit Flipkart: where a user finds an
// order (Flipkart's "Orders") and a review ("My Reviews", its "Published"
// tab, and "Share" under a review on the website), and Flipkart's own message
// for a review it did not accept; Amazon's email saying a review is live is
// not asked for. The words are short and simple, with nothing a
// child could not follow: no double dashes, no short codes, no hard words,
// and never one of the words this dashboard must not show. On a row's page,
// "Prepare email" fills these words in for the row:
//   {name}          the name in the file's Reviewer Name column
//   {order ID}      the row's order ID
//   {product}       the product ordered, as the file names it
//   {what is wrong} what the check found for that row, in one or two
//                   sentences (for example: "You gave order ID A, but your
//                   purchase screenshot shows order ID B.")
//   {sign-off}      the sign-off at the end, the same for every email
// Nothing here, or anywhere on the Flipkart screen, sends an email: a staff
// member copies the words into their own email.

import { clean } from './check.js';
import { TYPE_WORDS } from './final.js';
import { NOT_DELIVERED_WORDS } from './delivery-read.js';
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
  'reviewNotLive',
  'reviewLinkNeeded',
  'reviewerNotMatching',
  'reviewShotNotMatching',
  'cannotAddReviews',
  'somethingElse',
];

const HELLO = 'Hello {name},\n\nThis is about your order {order ID} for {product}.';
const ORDERS = 'In the Flipkart app: tap "Account", then "Orders", then this order.\nOn the Flipkart website: open the menu under your name at the top of the page, click "Orders", then this order.';
const PURCHASE_HOW = `How to take it:\n${ORDERS}\nThe screenshot must show the order ID, the amount and the product.`;
const DELIVERY_HOW = `How to take it:\n${ORDERS}\nThe screenshot must show the word "Delivered" and the product.`;
const LINK_HOW = 'How to copy the link to your review:\nOn the Flipkart website, open "My Reviews" in your account, click "Share" under your review, and copy the link.';
const SHOT_HOW = 'How to take the screenshot of your review:\nOpen "My Reviews" in your Flipkart account. In the Flipkart app, a review Flipkart has published is on the "Published" tab. The screenshot must show the product and the words of your review.';
const LINK_ASK = 'Please reply to this email with the link to your own review on Flipkart and a screenshot of it.';
const CLEAR_ASK = 'Please reply to this email with the same screenshot again, as a clear picture.';
const message = (...parts) => `${parts.join('\n\n')}\n\n{sign-off}`;

/** Every email, and the sign-off: the Amazon checker's own, changed for Flipkart. */
export const EMAILS = {
  signOff: 'Thank you,\nThe support team',
  templates: {
    duplicate: {
      subject: 'Your order {order ID}: it was already sent',
      message: message(HELLO, 'The same order, screenshot or review was already sent for another entry.', 'If this is a mistake, please reply to this email and tell us.'),
    },
    orderShotMissing: {
      subject: 'Your order {order ID}: please send the purchase screenshot',
      message: message(HELLO, 'The purchase screenshot was not added in the form, so we cannot see the order.', 'Please reply to this email with the purchase screenshot: a screenshot of this order on Flipkart that shows the order ID, the amount and the product.', PURCHASE_HOW),
    },
    deliveryShotMissing: {
      subject: 'Your order {order ID}: please send the delivery screenshot',
      message: message(HELLO, 'The delivery screenshot was not added in the form, so we cannot see that the order was delivered.', 'Please reply to this email with the delivery screenshot: a screenshot of this order on Flipkart that shows the word "Delivered" and the product.', DELIVERY_HOW),
    },
    reviewLinkMissing: {
      subject: 'Your order {order ID}: please send the link to your review',
      message: message(HELLO, 'The link to your review and the screenshot of it were not added in the form, so we cannot see your review.', LINK_ASK, LINK_HOW, SHOT_HOW),
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
      message: message(HELLO, '{what is wrong}', 'Please reply to this email with a clear screenshot of this order on Flipkart that shows the order ID, the amount and the product.', PURCHASE_HOW),
    },
    deliveryNotClear: {
      subject: 'Your order {order ID}: please send a clear delivery screenshot',
      message: message(HELLO, '{what is wrong}', 'Please reply to this email with a screenshot of this order on Flipkart that shows the word "Delivered" and the product.', DELIVERY_HOW),
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
      message: message(HELLO, '{what is wrong}', 'Once the order is delivered, please reply to this email with the delivery screenshot: a screenshot of this order on Flipkart that shows the word "Delivered" and the product.', DELIVERY_HOW),
    },
    notDeliveredCancelled: {
      subject: 'Your order {order ID}: the screenshot says it was cancelled or returned',
      message: message(HELLO, '{what is wrong}', 'If the order was in fact delivered, please reply to this email with the delivery screenshot: a screenshot of this order on Flipkart that shows the word "Delivered" and the product.', DELIVERY_HOW),
    },
    productNotMatching: {
      subject: 'Your order {order ID}: the product does not match',
      message: message(HELLO, '{what is wrong}', 'Please reply to this email with the right screenshot, or with the review of the right product.', PURCHASE_HOW),
    },
    wrongReviewLink: {
      subject: 'Your order {order ID}: please send the link to your review',
      message: message(HELLO, 'The review link you gave does not open your review.', LINK_ASK, LINK_HOW, SHOT_HOW),
    },
    reviewNotLive: {
      subject: 'Your order {order ID}: please send the link to your review',
      message: message(HELLO, 'We could not find your review among the reviews of this product on Flipkart.', LINK_ASK, LINK_HOW, SHOT_HOW),
    },
    reviewLinkNeeded: {
      subject: 'Your order {order ID}: please send the link to your review',
      message: message(HELLO, 'We could not find your review on Flipkart from what you sent, so we need the link to it.', LINK_ASK, LINK_HOW, SHOT_HOW),
    },
    reviewerNotMatching: {
      subject: 'Your order {order ID}: the name on the review is different',
      message: message(HELLO, '{what is wrong}', 'Please reply to this email and tell us whose Flipkart account wrote the review, and why the name is different.'),
    },
    reviewShotNotMatching: {
      subject: 'Your order {order ID}: the review screenshot does not match',
      message: message(HELLO, '{what is wrong}', 'Please reply to this email with a screenshot of your own review.'),
    },
    cannotAddReviews: {
      subject: 'Your order {order ID}: please send the message Flipkart showed',
      message: message(HELLO, 'Flipkart did not accept your review for this product.', 'If you have not sent it yet, please reply to this email with a screenshot of the message Flipkart showed about your review. It often says the review was not accepted, or that it does not follow Flipkart\'s guidelines.', 'If you have not sent them yet, please also send the purchase screenshot and the delivery screenshot of this order.'),
    },
    somethingElse: {
      subject: 'Your order {order ID}: we could not finish checking it',
      message: message(HELLO, '{what is wrong}', 'Please reply to this email with a clear screenshot of this order and a screenshot of your review on Flipkart, and tell us anything that can help us check it.', PURCHASE_HOW, SHOT_HOW),
    },
  },
};

/** The email's name on the screen: its Type's words; the second Not delivered email says what it is for. */
export function emailName(key) {
  if (key === 'notDeliveredCancelled') return `${TYPE_WORDS.notDelivered} (cancelled or returned)`;
  return TYPE_WORDS[key] ?? key;
}

/** True when this Type has an email: every Type but Verified and Rating Only. */
export const hasEmail = (typeKey) => EMAIL_KEYS.includes(typeKey);

const WHICH = { order: 'purchase screenshot', delivery: 'delivery screenshot', review: 'review screenshot', reviewShot: 'review screenshot' };
const CANCELLED = /cancel|return/i;

/** The not-delivered word the delivery screenshot or the delivery cell holds ("Cancelled", "Returned", "Shipped"…), or null. */
function notDeliveredWord(row, result) {
  if (result?.delivery?.notDelivered) return String(result.delivery.notDelivered);
  const text = String(row?.shots?.delivery?.text ?? '');
  return NOT_DELIVERED_WORDS.find((w) => holdsWord(text, [w])) ?? null;
}

/**
 * Which email a row gets: its Type's, or, for Not delivered, the second one
 * when the delivery screenshot or cell says cancelled or returned. Null when
 * the Type has no email.
 */
export function emailKeyFor(typeKey, { row = null, result = null } = {}) {
  if (!hasEmail(typeKey)) return null;
  if (typeKey === 'notDelivered' && CANCELLED.test(notDeliveredWord(row, result) ?? '')) return 'notDeliveredCancelled';
  return typeKey;
}

/** "a", "a and b", "a, b and c". */
function joinAnd(list) {
  const l = list.filter(Boolean);
  if (l.length <= 1) return l[0] ?? '';
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
}
const q = (t) => `"${clean(String(t ?? '').replace(/\s+/g, ' ').trim())}"`;
const NOUN = { orderId: 'order ID', orderDate: 'order date', amount: 'amount', product: 'product' };
const starsWord = (n) => (n === 1 ? '1 star' : `${n} stars`);
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
 * What is wrong, for the row, in one or two plain sentences, from what its
 * check found (result: the row's last check, as kept with it) and what the
 * file says (row, reviewer). When the check's details are not known (a result
 * changed by staff, or a row checked before they were kept), a sentence that
 * is still true.
 */
export function whatIsWrong(key, { row = null, result = null, reviewer = null } = {}) {
  const givenId = clean(String(row?.orderId?.text ?? '').trim());
  const product = clean(String(row?.product?.text ?? '').trim());
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
        const given = k === 'orderDate' ? (row?.orderDate?.value ? dayFirst(row.orderDate.value) : row?.orderDate?.text) : rupees(row?.amount?.value) || row?.amount?.text;
        out.push(`The ${NOUN[k]} is different: you gave ${clean(String(given ?? '').trim()) || `${k === 'amount' ? 'an amount' : 'a date'}`}, but ${shownOn(diff, (v) => clean(v.shown))}.`);
      }
      return out.length ? out.join(' ') : 'The order date or the amount you gave is different from what your screenshot shows.';
    }
    case 'productNotMatching': {
      const diff = detailsOn(result, 'product', 'different');
      if (diff.length) return `${shownOn(diff, (v) => q(v.shown)).replace(/^your/, 'Your')}, but the product should be ${wanted}.`;
      return `Your screenshot or your review shows a different product. The product should be ${wanted}.`;
    }
    case 'notDelivered': {
      const word = notDeliveredWord(row, result);
      const cell = String(row?.shots?.delivery?.text ?? '').trim();
      if (result?.delivery && word) return `Your delivery screenshot says ${q(word)}, not "Delivered".`;
      if (cell && !row?.shots?.delivery?.links?.length) return `You wrote ${q(cell)} in the form instead of giving a delivery screenshot.`;
      return 'Your delivery screenshot does not show that the order was delivered.';
    }
    case 'notDeliveredCancelled': {
      const word = notDeliveredWord(row, result);
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
      // On Flipkart the review is found among its reviews by the review screenshot's words, under the name on the screenshot or the one in the file.
      const f = result?.found ?? null;
      const onFlipkart = clean(String(f?.review?.name ?? '').trim());
      const onShot = clean(String(result?.review?.name ?? '').trim());
      const given = clean(String(reviewer ?? '').trim());
      if (f?.how === 'noName') return 'Your review on Flipkart shows "Flipkart Customer" instead of a name, so we could not see that it is yours.';
      if (f?.how === 'noNameToCheck') return 'No name came with your review screenshot or in the form, so we could not see that the review on Flipkart is yours.';
      const shotName = (f?.how === 'otherName' && f?.nameFrom === 'screenshot') || !given;
      const mine = shotName ? onShot : given;
      if (onFlipkart && mine) return `The name on the review on Flipkart is ${q(onFlipkart)}, but ${shotName ? 'the name on your review screenshot' : 'the name you gave'} is ${q(mine)}.`;
      return 'The name on the review is not the name you gave.';
    }
    case 'reviewShotNotMatching': {
      const a = result?.review?.stars;
      const b = result?.found?.review?.stars;
      if (Number.isInteger(a) && Number.isInteger(b) && a !== b) return `Your review screenshot shows ${starsWord(a)}, but your review on Flipkart has ${starsWord(b)}.`;
      return 'Your review screenshot does not match your review on Flipkart.';
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
    case 'reviewNotLive':
      return 'We could not find your review among the reviews of this product on Flipkart.';
    case 'reviewLinkNeeded':
      return 'We could not find your review on Flipkart from what you sent, so we need the link to it.';
    case 'cannotAddReviews':
      return 'Flipkart did not accept your review for this product.';
    case 'somethingElse':
      return 'We could not finish checking your order from what you sent.';
    default:
      return '';
  }
}

/**
 * Some words with their placeholders filled in, as on Amazon. A blank name or
 * order ID goes with the space before it ("Hello {name}," becomes "Hello,");
 * a blank product becomes "this product"; a blank {what is wrong} goes with
 * its line. The sign-off is added at the end when the words do not place it.
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
 * The email for a row, as on Amazon: its key and name, and its subject and
 * message filled in for the row. Null when the row's Type has no email.
 * typeKey is the row's Type; result is its last check, as kept with the row
 * (or null); reviewer is the name in the Reviewer Name column.
 */
export function emailFor({ typeKey, row, result = null, reviewer = null }) {
  const key = emailKeyFor(typeKey, { row, result });
  if (!key) return null;
  const t = EMAILS.templates[key];
  const values = { name: reviewer ?? '', orderId: row?.orderId?.text ?? '', product: row?.product?.text ?? '', whatIsWrong: whatIsWrong(key, { row, result, reviewer }), signOff: EMAILS.signOff };
  return { key, name: emailName(key), subject: fill(t.subject, values), message: fill(t.message, values, { addSignOff: true }) };
}
