// The email for a user about what is still needed, for "Prepare email" on a
// row's page: one for every Type but Verified and Rating Only, and a second
// one for an order whose screenshot says cancelled or returned. First copied
// from the Amazon checker's emails (amazon/emails.js); rewritten on
// 14-10-2026, after staff tried them on real rows, to be short and clear:
// about 150 words at most, with a short subject, each says what we checked,
// what we found for this order (the facts from its screenshots and the form;
// a name read from a screenshot only when it was read clearly) and exactly
// what the user must send, with numbered steps for finding it in the Flipkart
// app. The proof of a review is a screenshot from My Reviews, on its
// Published tab; a link is asked for only where one is truly needed, and only
// from the Flipkart website, since links shared from Flipkart's app do not
// open on a computer. Plain words a child could follow: no double dashes, no
// short codes, no hard words, and never one of the words this dashboard must
// not show. These words are filled in for the row:
//   {name}          the name in the file's Reviewer Name column
//   {order ID}      the row's order ID
//   {product}       the product ordered, as the file names it
//   {what is wrong} what the check found for that row: a sentence or two, or
//                   for "Reviewer name is different", each name found and where
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
  'possibleMisuse',
  'somethingElse',
];

const HELLO = 'Hello {name},';
/** What we checked, then what we found for this order. */
const checked = (what) => `We checked ${what} for your Flipkart order {order ID} ({product}). {what is wrong}`;
const LOOKED = 'We looked for your review of {product} on Flipkart, for your order {order ID}. {what is wrong}';
const ORDER_STEPS = 'How to find it:\n1. Open the Flipkart app and tap Account.\n2. Tap Orders, then tap this order.\n3. Take a screenshot that shows the order ID, the product and the amount.';
const DELIVERY_STEPS = 'How to find it:\n1. Open the Flipkart app and tap Account.\n2. Tap Orders, then tap this order.\n3. Take a screenshot that shows "Delivered", the date and the product.';
const REVIEW_STEPS = '1. Open the Flipkart app and tap Account.\n2. Tap My Reviews (scroll down if needed).\n3. Open the Published tab.\n4. Find your review of this product.\n5. Take a screenshot that shows the product and your review.';
const REVIEW_HOW = `How to find it:\n${REVIEW_STEPS}`;
const LINK_HOW = 'How to get the link, on a computer (links from the Flipkart app do not open on a computer):\n1. Go to flipkart.com and log in.\n2. Open My Reviews in your account.\n3. Click Share under your review of this product.\n4. Copy the link and paste it into your reply.';
const REVIEW_ASK = 'Please send a screenshot of your review from the Published tab of My Reviews.';
const AGAIN_ASK = 'Please attach the same screenshot to your reply as a picture, not as a link.';
const message = (...parts) => `${parts.join('\n\n')}\n\n{sign-off}`;

/** Every email, and the sign-off. */
export const EMAILS = {
  signOff: 'Thank you,\nThe support team',
  templates: {
    duplicate: {
      subject: 'Order {order ID}: already sent before',
      message: message(HELLO, checked('your entry'), 'You do not need to send anything. If you think this is a mistake, please reply and tell us.'),
    },
    orderShotMissing: {
      subject: 'Order {order ID}: purchase screenshot needed',
      message: message(HELLO, checked('the form you filled in'), 'Please send a screenshot of this order on Flipkart.', ORDER_STEPS),
    },
    deliveryShotMissing: {
      subject: 'Order {order ID}: delivery screenshot needed',
      message: message(HELLO, checked('the form you filled in'), 'Please send a screenshot of this order that shows it was delivered.', DELIVERY_STEPS),
    },
    reviewLinkMissing: {
      subject: 'Order {order ID}: review screenshot needed',
      message: message(HELLO, checked('the form you filled in'), REVIEW_ASK, REVIEW_HOW),
    },
    needDriveAccess: {
      subject: 'Order {order ID}: please send the screenshot again',
      message: message(HELLO, checked('the screenshots you sent'), AGAIN_ASK),
    },
    needAccess: {
      subject: 'Order {order ID}: please send the screenshot again',
      message: message(HELLO, checked('the screenshots you sent'), AGAIN_ASK),
    },
    orderNotClear: {
      subject: 'Order {order ID}: clearer purchase screenshot needed',
      message: message(HELLO, checked('the purchase screenshot you sent'), 'Please send a clear screenshot of this order on Flipkart.', ORDER_STEPS),
    },
    deliveryNotClear: {
      subject: 'Order {order ID}: clearer delivery screenshot needed',
      message: message(HELLO, checked('the delivery screenshot you sent'), 'Please send a screenshot of this order that shows it was delivered.', DELIVERY_STEPS),
    },
    reviewNotClear: {
      subject: 'Order {order ID}: clearer review screenshot needed',
      message: message(HELLO, checked('the review screenshot you sent'), 'Please send a clear screenshot of your review from the Published tab of My Reviews.', REVIEW_HOW),
    },
    orderIdNotMatching: {
      subject: 'Order {order ID}: order ID does not match',
      message: message(HELLO, checked('the screenshots you sent'), 'Please send a screenshot of order {order ID}. If the order ID in your form is wrong, reply with the right one.', ORDER_STEPS),
    },
    orderDetailsNotMatching: {
      subject: 'Order {order ID}: order details do not match',
      message: message(HELLO, checked('the screenshots you sent'), 'Please send a screenshot of this order that shows the right details, or reply with the right details.', ORDER_STEPS),
    },
    notDelivered: {
      subject: 'Order {order ID}: not delivered yet',
      message: message(HELLO, checked('the delivery details you sent'), 'Once the order is delivered, please send a screenshot that shows "Delivered".', DELIVERY_STEPS),
    },
    notDeliveredCancelled: {
      subject: 'Order {order ID}: cancelled or returned',
      message: message(HELLO, checked('the delivery details you sent'), 'If the order was in fact delivered, please send a screenshot that shows "Delivered".', DELIVERY_STEPS),
    },
    productNotMatching: {
      subject: 'Order {order ID}: product does not match',
      message: message(HELLO, checked('the screenshots you sent'), 'Please send a screenshot of your Flipkart order for {product}.', ORDER_STEPS),
    },
    wrongReviewLink: {
      subject: 'Order {order ID}: review screenshot needed',
      message: message(HELLO, checked('the review link you sent'), `${REVIEW_ASK} You do not need to send a link.`, REVIEW_HOW),
    },
    reviewNotLive: {
      subject: 'Order {order ID}: review not found on Flipkart',
      message: message(HELLO, LOOKED, REVIEW_ASK, REVIEW_HOW, 'If your review is still on the Pending tab, Flipkart has not published it yet. Please wait until it moves to Published, then send the screenshot.'),
    },
    reviewLinkNeeded: {
      subject: 'Order {order ID}: link to your review needed',
      message: message(HELLO, LOOKED, 'Please send the link to your review.', LINK_HOW),
    },
    reviewerNotMatching: {
      subject: 'Order {order ID}: names do not match',
      message: message(HELLO, 'We checked your review of {product} on Flipkart, for your order {order ID}.', '{what is wrong}', 'We cannot confirm the review was written from your own Flipkart account.', `Please send a screenshot of the review from your own account:\n${REVIEW_STEPS}`, "If your Flipkart account uses a different name, or the review was written from someone else's account, please tell us."),
    },
    reviewShotNotMatching: {
      subject: 'Order {order ID}: review screenshot does not match',
      message: message(HELLO, 'We compared the review screenshot you sent with your review of {product} on Flipkart, for your order {order ID}. {what is wrong}', REVIEW_ASK, REVIEW_HOW),
    },
    cannotAddReviews: {
      subject: 'Order {order ID}: review not accepted by Flipkart',
      message: message(HELLO, checked('the review screenshot you sent'), 'If Flipkart publishes a review from you for this product later, please send a screenshot of it from the Published tab of My Reviews.', REVIEW_HOW),
    },
    possibleMisuse: {
      subject: 'Order {order ID}: dates before the offer started',
      message: message(HELLO, checked('the dates'), 'If you think a date here is wrong, please reply and tell us.'),
    },
    somethingElse: {
      subject: 'Order {order ID}: please send two screenshots',
      message: message(HELLO, checked('the screenshots and the review you sent'), 'Please send two screenshots:\n1. This order: in the Flipkart app, tap Account, then Orders, then this order.\n2. Your review: tap Account, then My Reviews (scroll down if needed), then the Published tab.'),
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

/** "a", "a and b", "a, b and c"; with "or" in place of "and" when asked. */
function joinAnd(list, word = 'and') {
  const l = list.filter(Boolean);
  if (l.length <= 1) return l[0] ?? '';
  return `${l.slice(0, -1).join(', ')} ${word} ${l[l.length - 1]}`;
}
const q = (t) => `"${clean(String(t ?? '').replace(/\s+/g, ' ').trim())}"`;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
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
  return [...new Set(['order', 'delivery', 'review', 'reviewShot'].filter((w) => (row?.pictures?.[w] ?? []).some((p) => p?.problem && test(p.problem))).map((w) => WHICH[w]))];
}

// "Delivered to <the person> at <the place>" on Flipkart's page of a delivered order (delivery-read.js); words such as "Customer" are not a name.
const DELIVERED_TO = /(?:^|[^\p{L}])delivered\s+to\b[\s:]+(.+?)(?:\s+at(?:\s.*)?)?$/iu;
const NOT_A_NAME = /^(?:(?:the|your|a|an|this|our|my)\b.*|customer\b.*|self|you|yourself|family(?:\s+member)?|relative|friend|neighbou?r|security(?:\s+guard)?|guard|reception(?:ist)?|colleague|office|home|front\s+door|door|flipkart\b.*)$/i;
/** A name as a screenshot shows it, only when it was read clearly: one to four words made only of letters (an initial may have a full stop), and not a word such as "Customer"; null otherwise. */
const clearName = (t) => {
  const name = String(t ?? '').replace(/[\s,:;]+$/u, '').replace(/\s+/g, ' ').trim();
  const words = name.split(' ');
  const word = /^(?:\p{L}[\p{L}'’-]*\p{L}\.?|\p{Lu}\.?)$/u;
  return name && name.length <= 40 && words.length <= 4 && words.every((w) => word.test(w)) && !NOT_A_NAME.test(name) ? name : null;
};

/**
 * The name the order was delivered to, from the delivery screenshot as read
 * ("Delivered to Test Person at Home"), only when the screenshot shows one
 * and it was read clearly; null otherwise.
 */
export function deliveredToName(delivery) {
  if (!delivery?.ok) return null;
  for (const line of String(delivery.text ?? '').split('\n')) {
    const m = DELIVERED_TO.exec(line.trim());
    if (m) return clearName(m[1]);
  }
  return null;
}

/**
 * The names found for a row's review and where, for "Reviewer name is
 * different": the name the order was delivered to (from the delivery
 * screenshot), the name the user gave in the form, the name on the review on
 * Flipkart and the name on the review screenshot; a name read from a
 * screenshot only when it was read clearly. -> [{ where, name }]
 */
export function namesFound({ result = null, reviewer = null } = {}) {
  const out = [];
  const one = (t) => clean(String(t ?? '').replace(/\s+/g, ' ').trim()).slice(0, 60);
  const delivered = deliveredToName(result?.delivery);
  if (delivered) out.push({ where: 'Delivered to (on your delivery screenshot)', name: one(delivered) });
  if (one(reviewer)) out.push({ where: 'In your form', name: one(reviewer) });
  const f = result?.found ?? null;
  if (f?.how === 'noName') out.push({ where: 'On the review on Flipkart', name: 'no name, only "Flipkart Customer"' });
  else if (one(f?.review?.name)) out.push({ where: 'On the review on Flipkart', name: one(f.review.name) });
  const shot = result?.review?.ok ? clearName(one(result.review.name)) : null;
  if (shot) out.push({ where: 'On your review screenshot', name: shot });
  return out;
}

/**
 * What we found for the row, in a sentence or two, from what its check found
 * (result: the row's last check, as kept with it) and what the file says
 * (row, reviewer); for "Reviewer name is different", each name found and
 * where. When the check's details are not known (a result changed by staff,
 * or a row checked before they were kept), a sentence that is still true.
 */
export function whatIsWrong(key, { row = null, result = null, reviewer = null } = {}) {
  const givenId = clean(String(row?.orderId?.text ?? '').trim());
  const product = clean(String(row?.product?.text ?? '').trim());
  switch (key) {
    case 'orderIdNotMatching': {
      const diff = detailsOn(result, 'orderId', 'different');
      if (diff.length && givenId) return `In the form you gave order ID ${givenId}, but ${shownOn(diff, (v) => `order ID ${clean(v.shown)}`)}.`;
      return givenId ? `The order ID on your screenshot is not ${givenId}, the one in your form.` : 'The order ID on your screenshot is not the one in your form.';
    }
    case 'orderDetailsNotMatching': {
      const out = [];
      for (const k of ['orderDate', 'amount']) {
        const diff = detailsOn(result, k, 'different');
        if (!diff.length) continue;
        const given = clean(String((k === 'orderDate' ? (row?.orderDate?.value ? dayFirst(row.orderDate.value) : row?.orderDate?.text) : rupees(row?.amount?.value) || row?.amount?.text) ?? '').trim());
        const shown = shownOn(diff, (v) => clean(v.shown));
        out.push(given ? `In the form you gave the ${NOUN[k]} ${given}, but ${shown}.` : `${cap(shown)}, which is not the ${NOUN[k]} in your form.`);
      }
      return out.length ? out.join(' ') : 'The order date or the amount on your screenshot is not the one in your form.';
    }
    case 'productNotMatching': {
      const diff = detailsOn(result, 'product', 'different');
      if (diff.length) return `${cap(shownOn(diff, (v) => q(v.shown)))}, not ${product ? q(product) : 'the product of this offer'}.`;
      return 'Your screenshot shows a different product.';
    }
    case 'notDelivered': {
      const word = notDeliveredWord(row, result);
      const cell = String(row?.shots?.delivery?.text ?? '').trim();
      if (result?.delivery && word) return `Your delivery screenshot says ${q(word)}, not "Delivered".`;
      if (cell && !row?.shots?.delivery?.links?.length) return `In the form you wrote ${q(cell)} instead of sending a delivery screenshot.`;
      return 'Your delivery screenshot does not show that the order was delivered.';
    }
    case 'notDeliveredCancelled': {
      const word = notDeliveredWord(row, result);
      const cell = String(row?.shots?.delivery?.text ?? '').trim();
      if (result?.delivery && word) return `Your delivery screenshot says ${q(word)}.`;
      if (cell && !row?.shots?.delivery?.links?.length) return `In the form you wrote ${q(cell)}.`;
      return 'Your screenshot says the order was cancelled or returned.';
    }
    case 'deliveryNotClear': {
      const d = result?.delivery;
      if (d && d.ok !== false && d.details) {
        const missing = [];
        if (!d.delivered) missing.push('the word "Delivered"');
        if (d.details.product?.state === 'not shown') missing.push('the product');
        if (missing.length) return `It does not show ${joinAnd(missing, 'or')}.`;
      }
      if (d && d.ok === false) return 'We could not read it.';
      return 'It does not show that this order was delivered.';
    }
    case 'orderNotClear': {
      const o = result?.order;
      if (o && o.ok !== false && o.details) {
        const missing = ['orderId', 'amount', 'product', 'orderDate'].filter((k) => o.details[k]?.state === 'not shown').map((k) => `the ${NOUN[k]}`);
        if (missing.length) return `We could not see ${joinAnd(missing, 'or')} on it.`;
      }
      if (o && o.ok === false) return 'We could not read it.';
      return 'We could not see the order ID, the amount or the product on it.';
    }
    case 'reviewerNotMatching': {
      const names = namesFound({ result, reviewer });
      const lines = names.map((n) => `- ${n.where}: ${n.name}`).join('\n');
      if (names.length > 1) return `The names we found do not match:\n${lines}`;
      if (names.length === 1) return `We found only one name, so we could not match it:\n${lines}`;
      return 'The name on the review is not the name in your form.';
    }
    case 'reviewShotNotMatching': {
      const a = result?.review?.stars;
      const b = result?.found?.review?.stars;
      if (Number.isInteger(a) && Number.isInteger(b) && a !== b) return `Your review screenshot shows ${starsWord(a)}, but your review on Flipkart has ${starsWord(b)}.`;
      return 'Your review screenshot does not match your review on Flipkart.';
    }
    case 'reviewNotLive': {
      const v = result?.review ?? null;
      const f = result?.found ?? null;
      const day = result?.reviewsFrom?.day ?? null;
      const oldest = result?.flipkart?.oldest ?? null;
      const among = `it is not among the reviews Flipkart shows for this product${oldest ? `, which we checked back to ${dayFirst(oldest)}` : ''}.`;
      if (f?.how === 'gone' && f.lastSeen) return `We last saw your review on Flipkart on ${dayFirst(f.lastSeen)}, but it is no longer among the reviews Flipkart shows for this product.`;
      if (v?.tab === 'pending') return 'Your review screenshot shows it on the Pending tab of My Reviews, so Flipkart had not published it yet.';
      if (f?.before && day) return `We found ${f.before === 1 ? 'a review' : `${f.before} reviews`} with the same words, but ${f.before === 1 ? 'it was' : 'they were'} posted before your order was ${result.reviewsFrom.from === 'order' ? 'placed' : 'delivered'} on ${dayFirst(day)}, so ${f.before === 1 ? 'it does' : 'they do'} not count for this order.`;
      if (v?.tab === 'published') return `Your review screenshot shows it on the Published tab, but ${among}`;
      if (v?.form) return `Your review screenshot shows the review being written, not posted, and ${among}`;
      return cap(among);
    }
    case 'reviewLinkNeeded': {
      const f = result?.found;
      if (f?.how === 'several' && f.count > 1) return `We found ${f.count} reviews on Flipkart with the same words, so we cannot tell which one is yours.`;
      return 'We could not find your review on Flipkart from what you sent, so we need its link.';
    }
    case 'reviewNotClear':
      return 'We could not read it clearly.';
    case 'needDriveAccess': {
      const names = unopened(row, (p) => p.noAccess || p.kind === 'drive');
      return names.length ? `We could not open your ${joinAnd(names)} on Google Drive.` : 'We could not open the screenshot you sent on Google Drive.';
    }
    case 'needAccess': {
      const names = unopened(row, () => true);
      return names.length ? `We could not open your ${joinAnd(names)}.` : 'We could not open the screenshot you sent.';
    }
    case 'duplicate':
      return 'This order, screenshot or review was already sent in another entry, so it cannot count again.';
    case 'orderShotMissing':
      return 'There was no purchase screenshot in it.';
    case 'deliveryShotMissing':
      return 'There was no delivery screenshot in it.';
    case 'reviewLinkMissing':
      return 'There was no review screenshot or review link in it.';
    case 'wrongReviewLink':
      return 'It does not open your review.';
    case 'cannotAddReviews':
      return 'It shows a message from Flipkart that your review was not accepted.';
    case 'possibleMisuse': {
      // Only what came before the day the offer started, with the dates.
      const x = result?.misuse;
      const p = x?.posted;
      const parts = [
        x?.placed ? `your purchase screenshot shows the order was placed on ${dayFirst(x.placed)}` : null,
        x?.delivered ? `your delivery screenshot shows ${x.placed ? 'it' : 'the order'} was delivered on ${dayFirst(x.delivered)}` : null,
        p?.dateLatest ? `your review of this product on Flipkart was posted ${p.date === p.dateLatest ? 'on' : 'by'} ${dayFirst(p.dateLatest)}` : null,
      ].filter(Boolean);
      if (!x?.start || !parts.length) return 'Some dates for this order are before the day this offer started.';
      return `This offer started on ${dayFirst(x.start)}. ${cap(joinAnd(parts))}, ${['', 'before that day', 'both before that day', 'all before that day'][parts.length]}.`;
    }
    case 'somethingElse':
      return 'Some of it was not clear enough for us to finish.';
    default:
      return '';
  }
}

/**
 * Some words with their placeholders filled in, as on Amazon. A blank name or
 * order ID goes with the space before it ("Hello {name}," becomes "Hello,");
 * a blank product goes with its brackets, or else becomes "this product"; a
 * blank {what is wrong} goes with its line. The sign-off is added at the end
 * when the words do not place it.
 */
export function fill(text, { name = '', orderId = '', product = '', whatIsWrong: wrong = '', signOff = '' } = {}, { addSignOff = false } = {}) {
  let out = String(text ?? '');
  const one = (v) => clean(String(v ?? '').replace(/\s+/g, ' ').trim());
  const blankGoes = (word, value) => {
    out = value ? out.split(word).join(value) : out.replace(new RegExp(` ?${word.replace(/[{}]/g, '\\$&')}`, 'g'), '');
  };
  blankGoes('{name}', one(name));
  blankGoes('{order ID}', one(orderId));
  if (!one(product)) out = out.split(' ({product})').join('');
  out = out.split('{product}').join(one(product) || 'this product');
  const w = clean(String(wrong ?? '').trim());
  out = w ? out.split('{what is wrong}').join(w) : out.replace(/[ \t]*\{what is wrong\}[ \t]*\n?/g, '');
  const s = clean(String(signOff ?? '').trim());
  if (out.includes('{sign-off}')) out = out.split('{sign-off}').join(s);
  else if (addSignOff && s) out = `${out.trim()}\n\n${s}`;
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * The email for a row: its key and name, and its subject and message filled
 * in for the row. Null when the row's Type has no email. typeKey is the row's
 * Type; result is its last check, as kept with the row (or null); reviewer is
 * the name in the Reviewer Name column.
 */
export function emailFor({ typeKey, row, result = null, reviewer = null }) {
  const key = emailKeyFor(typeKey, { row, result });
  if (!key) return null;
  const t = EMAILS.templates[key];
  const values = { name: reviewer ?? '', orderId: row?.orderId?.text ?? '', product: row?.product?.text ?? '', whatIsWrong: whatIsWrong(key, { row, result, reviewer }), signOff: EMAILS.signOff };
  return { key, name: emailName(key), subject: fill(t.subject, values), message: fill(t.message, values, { addSignOff: true }) };
}
