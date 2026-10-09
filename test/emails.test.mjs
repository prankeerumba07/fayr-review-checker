// The emails sent to users: one for every Type that is not Pass (except
// Something else) and a second one for an order cancelled or returned; their
// words plain and simple; each filled in for a row from what the check found;
// the "emails" setting checked and saved. Made-up rows and results only.
// Run: node test/emails.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EMAIL_KEYS, DEFAULT_EMAILS, PLACEHOLDERS, checkEmails, EmailsError, emailName, hasEmail, emailKeyFor, whatIsWrong, fill, emailFor, MAX_MESSAGE } from '../amazon/emails.js';
import { TYPE_KEYS, VERIFIED_TYPES, checkSettings, loadSettings, saveEmails, SettingsError, DEFAULT_SETTINGS } from '../amazon/settings.js';
import { assertPlain } from './plain-words.mjs';

const SETTINGS = checkSettings({});
const BANNED = new RegExp(['ZmF5cg==', 'cmVmdW5k', 'Y2FzaGJhY2s=', 'cmV3YXJk'].map((b) => Buffer.from(b, 'base64').toString('utf8')).join('|'), 'i');
const dir = mkdtempSync(join(tmpdir(), 'arc-emails-'));
after(() => rm(dir, { recursive: true, force: true }));

const shot = (over = {}) => ({ text: '', link: '', links: [], mismatch: null, picture: null, ...over });
const ROW = {
  id: 'r0000000000a1',
  source: 'sheet',
  row: 2,
  n: 1,
  orderId: { text: '403-1000002-2000002', value: '403-1000002-2000002' },
  orderDate: { text: '20-07-2026', value: '2026-07-20' },
  amount: { text: '654', value: 654 },
  product: { text: 'Test Brand Floor Cleaner' },
  shots: { order: shot({ link: 'https://drive.google.com/open?id=1TestOrderRow02abcdefgh', links: ['https://drive.google.com/open?id=1TestOrderRow02abcdefgh'] }), delivery: shot(), review: shot(), reviewShot: shot() },
  pictures: { order: [], delivery: [], review: [], reviewShot: [] },
};
const details = (over) => ({ orderId: { state: 'same', shown: ROW.orderId.text }, orderDate: { state: 'same', shown: '20-07-2026' }, amount: { state: 'same', shown: '₹654' }, product: { state: 'same', shown: 'Test Brand Floor Cleaner Liquid' }, ...over });
const result = (over = {}) => ({ sheet: { orderId: ROW.orderId.text, orderDate: '20-07-2026', orderDay: '2026-07-20', amount: '654', amountValue: 654, product: ROW.product.text }, order: { ok: true, details: details() }, delivery: { ok: true, delivered: true, deliveredText: 'Delivered 22 July', notDelivered: null, details: details() }, amazon: null, reviewShot: null, ...over });
const sample = (key, over = {}) => emailFor({ typeKey: key === 'notDeliveredCancelled' ? 'notDelivered' : key, row: ROW, reviewer: 'Test Reviewer One', settings: SETTINGS, to: 'test.person@example.test', ...over });

test('an email for every Type that is not Pass, except Something else, and a second one for Not delivered when the order was cancelled or returned', () => {
  const expected = TYPE_KEYS.filter((k) => !VERIFIED_TYPES.has(k) && k !== 'somethingElse').flatMap((k) => (k === 'notDelivered' ? [k, 'notDeliveredCancelled'] : [k]));
  assert.deepEqual(EMAIL_KEYS, expected);
  assert.deepEqual(Object.keys(DEFAULT_EMAILS.templates), EMAIL_KEYS);
  assert.deepEqual(DEFAULT_SETTINGS.emails, DEFAULT_EMAILS, 'the settings know them');
  assert.ok(hasEmail('notDelivered') && hasEmail('duplicate') && !hasEmail('verified') && !hasEmail('ratingOnly') && !hasEmail('somethingElse') && !hasEmail(null));
  assert.equal(emailName('notDelivered', SETTINGS), 'Not delivered');
  assert.equal(emailName('notDeliveredCancelled', SETTINGS), 'Not delivered (cancelled or returned)');
  assert.equal(emailName('needDriveAccess', checkSettings({ typeWords: { needDriveAccess: 'Drive access please' } })), 'Drive access please', "the Type's word as the settings spell it");
  assert.deepEqual(PLACEHOLDERS.map((p) => p.word), ['{name}', '{order ID}', '{product}', '{what is wrong}', '{sign-off}']);
});

test('every email is short, clear and simple: it greets the user by name, names the order ID and the product, says what to send, asks for a reply, and ends with the sign-off; no double dash, long dash, short code, hard word or emoji; never "Your transaction has failed"', () => {
  const texts = [];
  const filled = [];
  for (const key of EMAIL_KEYS) {
    const t = DEFAULT_EMAILS.templates[key];
    assert.match(t.subject, /\{order ID\}/, `${key}: the subject names the order ID`);
    assert.ok(t.message.startsWith('Hello {name},\n\nThis is about your order {order ID} for {product}.'), `${key}: greets the user by name, then names the order ID and the product`);
    assert.match(t.message, /[Pp]lease reply to this email/, `${key}: asks the user to reply to the email`);
    assert.ok(t.message.endsWith('\n\n{sign-off}'), `${key}: ends with the sign-off`);
    assert.ok(t.message.length <= 1500, `${key}: short (${t.message.length} letters)`);
    assert.ok(t.subject.length <= 90, `${key}: a short subject`);
    const email = sample(key);
    assert.ok(email, key);
    filled.push(email.subject, email.message);
    texts.push(email.subject, email.message, t.subject, t.message);
  }
  texts.push(DEFAULT_EMAILS.signOff);
  const all = texts.join('\n');
  assertPlain(assert, texts, 'the emails');
  assert.doesNotMatch(all, BANNED, 'none of the words this dashboard must not show');
  assert.doesNotMatch(all, /transaction/i, 'never "Your transaction has failed"');
  assert.doesNotMatch(all, /--|—|–/, 'no double dash or long dash');
  assert.doesNotMatch(all, /\b(e\.g\.|i\.e\.|etc\.?|URL|PNG|JPE?G|PDF|OCR|ASIN|FAQ|N\/A|ID:)\b/, 'no short codes');
  assert.doesNotMatch(all, /\p{Extended_Pictographic}/u, 'no emoji');
  assert.doesNotMatch(all, /\b(verify|verification|validate|eligib|transaction|reimburse|credential|authentic|discrepanc|rectif|resubmit)/i, 'no hard words');
  assert.doesNotMatch(filled.join('\n'), /\{[^}]*\}/, 'every placeholder was filled in');
  assert.doesNotMatch(all, /!/, 'calm words');
  // The steps for the Amazon app and website, where they help.
  for (const key of ['orderShotMissing', 'deliveryShotMissing', 'orderNotClear', 'deliveryNotClear', 'orderIdNotMatching', 'orderDetailsNotMatching', 'notDelivered', 'notDeliveredCancelled', 'productNotMatching']) {
    assert.match(DEFAULT_EMAILS.templates[key].message, /In the Amazon app: tap "You", then "Your Orders", then this order\.\nOn the Amazon website: click "Returns & Orders", then "View order details" for this order\./, key);
  }
  for (const key of ['reviewLinkMissing', 'wrongReviewLink', 'reviewNotLive', 'reviewLinkNeeded']) {
    assert.match(DEFAULT_EMAILS.templates[key].message, /In the Amazon app: open your review, tap "Share", then "Copy"\./, key);
    assert.match(DEFAULT_EMAILS.templates[key].message, /search for "review is live"/, key);
    assert.match(DEFAULT_EMAILS.templates[key].message, /the link to your own review and a screenshot of it, or with Amazon's email saying your review is live/, key);
  }
  assert.match(DEFAULT_EMAILS.templates.reviewDeleted.message, /1\. Amazon's email saying your review is live\. It must show your name, the product and the words of your review\.\n2\. The page or email where Amazon says why your review was removed\./);
  assert.match(DEFAULT_EMAILS.templates.cannotAddReviews.message, /after you tap Submit\. It often starts with "Error", or says Amazon is not taking reviews for this product or brand\./);
  assert.match(DEFAULT_EMAILS.templates.cannotAddReviews.message, /please also send the purchase screenshot and the delivery screenshot/);
  assert.match(DEFAULT_EMAILS.templates.reviewerNotMatching.message, /whose Amazon account wrote the review, and why the name is different/);
  assert.match(DEFAULT_EMAILS.templates.reviewShotNotMatching.message, /a screenshot of your own review/);
  assert.match(DEFAULT_EMAILS.templates.duplicate.message, /already sent for another entry\.\n\nIf this is a mistake, please reply to this email and tell us\./);
  for (const key of ['reviewNotClear', 'needDriveAccess', 'needAccess']) assert.match(DEFAULT_EMAILS.templates[key].message, /the same screenshot again, as a clear picture/, key);
  assert.match(DEFAULT_EMAILS.templates.deliveryShotMissing.message, /was not added in the form/);
  assert.match(DEFAULT_EMAILS.templates.deliveryNotClear.message, /shows the word "Delivered" and the product/);
  assert.match(DEFAULT_EMAILS.templates.orderNotClear.message, /shows the order ID, the amount and the product/);
  assert.match(DEFAULT_EMAILS.templates.orderIdNotMatching.message, /the screenshot of the right order, or with the right order ID/);
  assert.match(DEFAULT_EMAILS.templates.orderDetailsNotMatching.message, /the right screenshot, or with the right details/);
  assert.match(DEFAULT_EMAILS.templates.notDelivered.message, /Once the order is delivered, please reply to this email with the delivery screenshot/);
  assert.match(DEFAULT_EMAILS.templates.notDeliveredCancelled.message, /If the order was in fact delivered, please reply to this email with the delivery screenshot/);
  assert.match(DEFAULT_EMAILS.templates.productNotMatching.message, /the right screenshot, or with the review of the right product/);
});

test('which email a row gets: its Type\'s, and the second Not delivered email when the delivery cell or screenshot says cancelled or returned', () => {
  assert.equal(emailKeyFor('verified'), null);
  assert.equal(emailKeyFor('somethingElse'), null);
  assert.equal(emailKeyFor('duplicate'), 'duplicate');
  assert.equal(emailKeyFor('notDelivered', { row: ROW, result: result({ delivery: { ok: true, delivered: false, notDelivered: 'Arriving', details: details() } }), settings: SETTINGS }), 'notDelivered');
  assert.equal(emailKeyFor('notDelivered', { row: ROW, result: result({ delivery: { ok: true, delivered: false, notDelivered: 'Cancelled', details: details() } }), settings: SETTINGS }), 'notDeliveredCancelled');
  assert.equal(emailKeyFor('notDelivered', { row: ROW, result: result({ delivery: { ok: true, delivered: false, notDelivered: 'Returned', details: details() } }), settings: SETTINGS }), 'notDeliveredCancelled');
  assert.equal(emailKeyFor('notDelivered', { row: { ...ROW, shots: { ...ROW.shots, delivery: shot({ text: 'Cancelled' }) } }, result: null, settings: SETTINGS }), 'notDeliveredCancelled', 'words in the cell count too');
  assert.equal(emailKeyFor('notDelivered', { row: ROW, result: null, settings: SETTINGS }), 'notDelivered', 'nothing known: the first email');
});

test('what is wrong, for the row, from what the check found; a sentence that is still true when the details are not known', () => {
  const ctx = (over = {}) => ({ row: ROW, reviewer: 'Test Reviewer One', settings: SETTINGS, ...over });
  // The order ID: what the user gave against what the screenshot shows.
  assert.equal(whatIsWrong('orderIdNotMatching', ctx({ result: result({ delivery: { ok: true, delivered: true, details: details({ orderId: { state: 'different', shown: '403-7654321-7654321' } }) } }) })), 'You gave order ID 403-1000002-2000002, but your delivery screenshot shows order ID 403-7654321-7654321.');
  assert.equal(whatIsWrong('orderIdNotMatching', ctx({ result: result({ order: { ok: true, details: details({ orderId: { state: 'different', shown: '403-7654321-7654321' } }) }, delivery: { ok: true, delivered: true, details: details({ orderId: { state: 'different', shown: '403-7654321-7654321' } }) } }) })), 'You gave order ID 403-1000002-2000002, but your screenshots show order ID 403-7654321-7654321.');
  assert.equal(whatIsWrong('orderIdNotMatching', ctx({ result: null })), 'The order ID you gave, 403-1000002-2000002, is not the order ID on your screenshot.');
  // The order details: which one, with both values.
  assert.equal(whatIsWrong('orderDetailsNotMatching', ctx({ result: result({ order: { ok: true, details: details({ amount: { state: 'different', shown: '₹664' } }) } }) })), 'The amount is different: you gave ₹654, but your purchase screenshot shows ₹664.');
  assert.equal(whatIsWrong('orderDetailsNotMatching', ctx({ result: result({ order: { ok: true, details: details({ orderDate: { state: 'different', shown: '18-07-2026' }, amount: { state: 'different', shown: '₹664' } }) } }) })), 'The order date is different: you gave 20-07-2026, but your purchase screenshot shows 18-07-2026. The amount is different: you gave ₹654, but your purchase screenshot shows ₹664.');
  assert.equal(whatIsWrong('orderDetailsNotMatching', ctx({ result: null })), 'The order date or the amount you gave is different from what your screenshot shows.');
  // The product: what the screenshot or the review shows, and what it should be.
  assert.equal(whatIsWrong('productNotMatching', ctx({ result: result({ order: { ok: true, details: details({ product: { state: 'different', shown: 'Other Maker Glass Cleaner Spray' } }) } }) })), 'Your purchase screenshot shows "Other Maker Glass Cleaner Spray", but the product should be "Test Brand Floor Cleaner".');
  assert.equal(whatIsWrong('productNotMatching', ctx({ result: result({ amazon: { name: 'Test Reviewer One', productTitle: 'Other Maker Glass Cleaner Spray, 500 ml' } }) })), 'Your review is for "Other Maker Glass Cleaner Spray, 500 ml", but it should be for "Test Brand Floor Cleaner".');
  assert.equal(whatIsWrong('productNotMatching', ctx({ result: null })), 'Your screenshot or your review shows a different product. The product should be "Test Brand Floor Cleaner".');
  // Not delivered, and cancelled or returned.
  assert.equal(whatIsWrong('notDelivered', ctx({ result: result({ delivery: { ok: true, delivered: false, notDelivered: 'Arriving', details: details() } }) })), 'Your delivery screenshot says "Arriving", not "Delivered".');
  assert.equal(whatIsWrong('notDelivered', ctx({ result: null })), 'Your delivery screenshot does not show that the order was delivered.');
  assert.equal(whatIsWrong('notDelivered', ctx({ row: { ...ROW, shots: { ...ROW.shots, delivery: shot({ text: 'Lost' }) } }, result: null })), 'You wrote "Lost" in the form instead of giving a delivery screenshot.');
  assert.equal(whatIsWrong('notDeliveredCancelled', ctx({ result: result({ delivery: { ok: true, delivered: false, notDelivered: 'Cancelled', details: details() } }) })), 'Your delivery screenshot says "Cancelled", so it looks like the order was not delivered.');
  assert.equal(whatIsWrong('notDeliveredCancelled', ctx({ row: { ...ROW, shots: { ...ROW.shots, delivery: shot({ text: 'Returned' }) } }, result: null })), 'You wrote "Returned" in the form, so it looks like the order was not delivered.');
  assert.equal(whatIsWrong('notDeliveredCancelled', ctx({ result: null })), 'Your screenshot says the order was cancelled or returned, so it looks like it was not delivered.');
  // A screenshot that is not clear: what could not be seen.
  assert.equal(whatIsWrong('deliveryNotClear', ctx({ result: result({ delivery: { ok: true, delivered: false, details: details({ product: { state: 'not shown' }, orderId: { state: 'not shown' } }) } }) })), 'The delivery screenshot you sent does not show the word "Delivered", the order ID and the product, so it is not enough.');
  assert.equal(whatIsWrong('deliveryNotClear', ctx({ result: result({ delivery: { ok: false, problem: 'its words are not clear enough to read' } }) })), 'What you sent as the delivery screenshot could not be read (for example, a photo of the product is not enough).');
  assert.equal(whatIsWrong('deliveryNotClear', ctx({ result: null })), 'What you sent as the delivery screenshot is not enough (for example, a photo of the product is not enough).');
  assert.equal(whatIsWrong('orderNotClear', ctx({ result: result({ order: { ok: true, details: details({ orderId: { state: 'not shown' }, amount: { state: 'not shown' } }) } }) })), 'On the purchase screenshot you sent, we could not see the order ID and the amount.');
  assert.equal(whatIsWrong('orderNotClear', ctx({ result: result({ order: { ok: false } }) })), 'The purchase screenshot you sent could not be read.');
  assert.equal(whatIsWrong('orderNotClear', ctx({ result: null })), 'On the purchase screenshot you sent, we could not see the order ID, the amount or the product.');
  // The reviewer's name, and the review screenshot.
  assert.equal(whatIsWrong('reviewerNotMatching', ctx({ result: result({ amazon: { name: 'Someone Else' } }) })), 'The name on the review is "Someone Else", but the name you gave is "Test Reviewer One".');
  assert.equal(whatIsWrong('reviewerNotMatching', ctx({ result: null })), 'The name on the review is not the name you gave.');
  assert.equal(whatIsWrong('reviewShotNotMatching', ctx({ result: result({ amazon: { name: 'Test Reviewer One' }, reviewShot: { name: 'Someone Else', problem: 'name' } }) })), 'Your review screenshot shows a review by "Someone Else", but the review your link opens is by "Test Reviewer One".');
  assert.equal(whatIsWrong('reviewShotNotMatching', ctx({ result: result({ reviewShot: { problem: 'words' } }) })), 'The words on your review screenshot are different from the words of the review your link opens.');
  assert.equal(whatIsWrong('reviewShotNotMatching', ctx({ result: null })), 'Your review screenshot does not match the review your link opens: the name or the words are different.');
  // Files that could not be opened: which ones.
  const pictures = { order: [{ link: 'x', problem: { kind: 'drive', site: 'Google Drive', says: 'no access', noAccess: true } }], delivery: [{ link: 'y', problem: { kind: 'drive', site: 'Google Drive', says: 'no access', noAccess: true } }], review: [], reviewShot: [] };
  assert.equal(whatIsWrong('needDriveAccess', ctx({ row: { ...ROW, pictures } })), 'We could not open the purchase screenshot and delivery screenshot you sent on Google Drive.');
  assert.equal(whatIsWrong('needDriveAccess', ctx({})), 'We could not open the file you sent on Google Drive.');
  assert.equal(whatIsWrong('needAccess', ctx({ row: { ...ROW, pictures: { ...pictures, delivery: [] } } })), 'We could not open the purchase screenshot you sent.');
  assert.equal(whatIsWrong('reviewNotClear', ctx({})), 'We could not read the review screenshot you sent.');
  for (const key of EMAIL_KEYS) assert.ok(whatIsWrong(key, ctx({})).length > 10, `${key} always has a sentence`);
  assert.equal(whatIsWrong('verified', ctx({})), '');
  // Words from a screenshot or a review never carry the words this dashboard must not show.
  const hidden = Buffer.from('cmV3YXJk', 'base64').toString('utf8');
  assert.doesNotMatch(whatIsWrong('productNotMatching', ctx({ result: result({ order: { ok: true, details: details({ product: { state: 'different', shown: `Other ${hidden} Spray` } }) } }) })), BANNED);
});

test('filling in: a blank name or order ID goes with its space, a blank product becomes "this product", a blank "what is wrong" goes with its line, and the sign-off is added when the words do not place it', () => {
  const values = { name: 'Test Reviewer One', orderId: '403-1000002-2000002', product: 'Test Brand Floor Cleaner', whatIsWrong: 'You gave A, but your screenshot shows B.', signOff: 'Thank you,\nThe support team' };
  assert.equal(fill('Hello {name},\n\nThis is about your order {order ID} for {product}.\n\n{what is wrong}\n\nPlease reply.\n\n{sign-off}', values), 'Hello Test Reviewer One,\n\nThis is about your order 403-1000002-2000002 for Test Brand Floor Cleaner.\n\nYou gave A, but your screenshot shows B.\n\nPlease reply.\n\nThank you,\nThe support team');
  assert.equal(fill('Hello {name},\n\nThis is about your order {order ID} for {product}.\n\n{what is wrong}\n\nPlease reply.', { ...values, name: '', orderId: '', product: '', whatIsWrong: '' }, { addSignOff: true }), 'Hello,\n\nThis is about your order for this product.\n\nPlease reply.\n\nThank you,\nThe support team');
  assert.equal(fill('Your order {order ID}: it was already sent', { ...values, orderId: ' 403-1 ' }), 'Your order 403-1: it was already sent', 'spaces around a value go');
  assert.equal(fill('Hello {name},', { name: 'Test\nPerson' }), 'Hello Test Person,', 'a value is one line');
});

test('the email for a row: its key and name, the test address it goes to, its subject and message filled in; none for a Type without one', () => {
  const email = sample('orderIdNotMatching', { result: result({ delivery: { ok: true, delivered: true, details: details({ orderId: { state: 'different', shown: '403-7654321-7654321' } }) } }) });
  assert.deepEqual([email.key, email.name, email.to], ['orderIdNotMatching', 'Order ID is not matching', 'test.person@example.test']);
  assert.equal(email.subject, 'Your order 403-1000002-2000002: the order ID does not match');
  assert.equal(
    email.message,
    'Hello Test Reviewer One,\n\nThis is about your order 403-1000002-2000002 for Test Brand Floor Cleaner.\n\nYou gave order ID 403-1000002-2000002, but your delivery screenshot shows order ID 403-7654321-7654321.\n\nPlease reply to this email with the screenshot of the right order, or with the right order ID.\n\nHow to take it:\nIn the Amazon app: tap "You", then "Your Orders", then this order.\nOn the Amazon website: click "Returns & Orders", then "View order details" for this order.\nThe screenshot must show the order ID, the amount and the product.\n\nThank you,\nThe support team',
  );
  assert.equal(sample('notDeliveredCancelled', { result: result({ delivery: { ok: true, delivered: false, notDelivered: 'Cancelled', details: details() } }) }).key, 'notDeliveredCancelled');
  assert.equal(sample('deliveryShotMissing', { reviewer: null }).message.split('\n')[0], 'Hello,', 'no Reviewer Name column: no name');
  assert.equal(emailFor({ typeKey: 'verified', row: ROW, settings: SETTINGS }), null);
  // The words from the settings file are used, and the sign-off is added when they leave it out.
  const changed = checkSettings({ emails: { signOff: 'Thanks,\nTest Team', templates: { duplicate: { subject: 'About order {order ID}', message: 'Hello {name}, this order was sent twice. Please reply if that is a mistake.' } } } });
  const dup = emailFor({ typeKey: 'duplicate', row: ROW, reviewer: 'Test Reviewer One', settings: changed });
  assert.equal(dup.subject, 'About order 403-1000002-2000002');
  assert.equal(dup.message, 'Hello Test Reviewer One, this order was sent twice. Please reply if that is a mistake.\n\nThanks,\nTest Team');
});

test('the "emails" setting: checked, with the dashboard\'s own words for anything left out; anything wrong is a plain sentence; saved into the settings file with every other setting kept', async () => {
  assert.deepEqual(checkEmails(undefined), DEFAULT_EMAILS);
  const part = checkEmails({ templates: { duplicate: { subject: 'Sent twice: {order ID}' } } });
  assert.equal(part.templates.duplicate.subject, 'Sent twice: {order ID}');
  assert.equal(part.templates.duplicate.message, DEFAULT_EMAILS.templates.duplicate.message, 'the message keeps its default');
  assert.equal(part.signOff, DEFAULT_EMAILS.signOff);
  const refusal = (raw) => {
    try {
      checkEmails(raw);
    } catch (err) {
      assert.ok(err instanceof EmailsError, err.message);
      return err.message;
    }
    assert.fail('it was accepted');
  };
  assert.equal(refusal([]), 'In the settings file, "emails" must be a group in curly brackets, like the one it came with.');
  assert.equal(refusal({ signoff: 'x' }), 'In the settings file, "emails" has a setting this dashboard does not know: "signoff". It knows "signOff" and "templates".');
  assert.equal(refusal({ templates: { duplicates: {} } }), 'In the settings file, "emails.templates" has an email this dashboard does not know: "duplicates". Check its spelling.');
  assert.equal(refusal({ templates: { duplicate: { subject: '' } } }), 'In the settings file, "emails.templates.duplicate.subject" must be some words between quotes.');
  assert.equal(refusal({ templates: { duplicate: { message: `${'x'.repeat(MAX_MESSAGE + 1)}` } } }), `In the settings file, "emails.templates.duplicate.message" is too long (at most ${MAX_MESSAGE} characters).`);
  assert.equal(refusal({ templates: { duplicate: { message: 'Hello {user},' } } }), 'In the settings file, "emails.templates.duplicate.message" uses {user}, which the dashboard does not know. It knows {name}, {order ID}, {product}, {what is wrong} and {sign-off}.');
  assert.equal(refusal({ templates: { duplicate: { body: 'x' } } }), 'In the settings file, "emails.templates.duplicate" has a part this dashboard does not know: "body". It knows "subject" and "message".');
  assert.equal(refusal({ signOff: 42 }), 'In the settings file, "emails.signOff" must be some words between quotes.');
  // Through the settings file: the same sentence; and the emails saved from the screen keep every other setting as it is written.
  const file = join(dir, 'settings.json');
  writeFileSync(file, `${JSON.stringify({ about: 'Test', typeWords: { duplicate: 'Twice' }, secondsBetweenDownloads: 2 }, null, 2)}\n`);
  await assert.rejects(saveEmails({ templates: { nope: {} } }, file), (err) => err instanceof SettingsError && /"emails.templates" has an email this dashboard does not know: "nope"/.test(err.message));
  const saved = await saveEmails({ signOff: 'Thanks,\nTest Team', templates: { duplicate: { subject: 'Twice: {order ID}', message: 'Hello {name},\n\nSent twice.\n\n{sign-off}' } } }, file);
  assert.equal(saved.emails.signOff, 'Thanks,\nTest Team');
  assert.equal(saved.emails.templates.duplicate.subject, 'Twice: {order ID}');
  assert.equal(saved.emails.templates.orderShotMissing.subject, DEFAULT_EMAILS.templates.orderShotMissing.subject);
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual([raw.about, raw.typeWords, raw.secondsBetweenDownloads], ['Test', { duplicate: 'Twice' }, 2], 'every other setting stays as it was written');
  assert.deepEqual(Object.keys(raw.emails), ['signOff', 'templates']);
  assert.deepEqual(Object.keys(raw.emails.templates), EMAIL_KEYS, 'every email is written, so it can be read and changed in the file too');
  assert.deepEqual(await loadSettings(file), saved);
  await assert.rejects(saveEmails({}, join(dir, 'missing', 'settings.json')), (err) => err instanceof SettingsError && err.message === 'The settings file could not be written on this computer.');
  assert.equal((await loadSettings(join(dir, 'none.json'))).emails.signOff, DEFAULT_EMAILS.signOff, 'no file: the defaults');
});
