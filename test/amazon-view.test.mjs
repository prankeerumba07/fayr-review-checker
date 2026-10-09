// The screen: drawn with data shaped like the local server's, and driven
// through a fake client. No browser, no Amazon. Made-up rows only.
// Run: node test/amazon-view.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { h, textOf, findAll, byId } from '../lib/vdom.js';
import { ApiError } from '../lib/api.js';
import * as words from '../lib/words.js';
import amazon, { FORM_FIELDS, STEP_NAMES as VIEW_STEPS, NOT_CHECKED, LOGIN_WORDS, GOOGLE_WORDS, LOGIN_POLL_MS, FINAL_WORDS as VIEW_FINAL_WORDS, SHEET_ACCEPT, uploadQuestion, typeCounts, staffStatsLine, summaryLines } from '../views/amazon.js';
import { STEP_NAMES, buildComparison, PAUSE_SAYS } from '../amazon/check.js';
import { FIELDS } from '../amazon/workbook.js';
import { TYPE_KEYS, typeWord, DEFAULT_SETTINGS } from '../amazon/settings.js';
import { EMAIL_KEYS, PLACEHOLDERS, emailName } from '../amazon/emails.js';
import { FINAL_WORDS, TYPE_FINAL } from '../amazon/final.js';
import { assertPlain } from './plain-words.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEW_SRC = readFileSync(join(ROOT, 'views', 'amazon.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'views', 'amazon.css'), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));

const R2 = 'r0000000000a2';
const R3 = 'r0000000000b3';
const R4 = 'r0000000000c4';
const H1 = 'r0000000000d5';
const pic = (i, link) => ({ i, ok: true, type: 'image/png', at: '2026-10-05T06:00:00.000Z', link });
const lost = (link, kind, site, says) => ({ i: 0, ok: false, link, problem: { kind, site, says } });
const shot = (over = {}) => ({ text: '', link: '', links: [], labels: [], words: '', mismatch: null, how: null, pictures: [], ...over });
const DRIVE = (id) => `https://drive.google.com/open?id=${id}`;
const drive = (id) => ({ link: DRIVE(id), label: 'Google Drive' });
const PASS_SAYS = 'This transaction passed: the purchase screenshot and the delivery screenshot match the form, and the review is live and public on Amazon.';
const MANUAL_SAYS = 'A staff member needs to check this transaction because the purchase screenshot is on Google Drive, but the file is private.';
const rows = [
  {
    id: R2, source: 'sheet', row: 2, n: 1, hand: null, label: 'Row 1', orderId: '403-1000002-2000002', orderDate: '20-07-2026', orderDateRead: true, amount: '₹654', amountRead: true, product: 'Test Brand Floor Cleaner',
    cells: { orderId: 'A2', orderShot: 'E2', deliveryShot: 'F2', reviewLink: 'G2' },
    shots: {
      order: shot({ text: DRIVE('1TestOrderRow02abcdefgh'), links: [DRIVE('1TestOrderRow02abcdefgh')], link: DRIVE('1TestOrderRow02abcdefgh'), labels: [drive('1TestOrderRow02abcdefgh')], pictures: [pic(0, DRIVE('1TestOrderRow02abcdefgh'))] }),
      delivery: shot({ text: DRIVE('1TestDeliveryRow02abcdef'), links: [DRIVE('1TestDeliveryRow02abcdef')], labels: [drive('1TestDeliveryRow02abcdef')], pictures: [pic(0, DRIVE('1TestDeliveryRow02abcdef'))] }),
      review: shot({ links: ['https://amazon.in/gp/customer-reviews/R1TESTROW02ABC'], link: 'https://amazon.in/gp/customer-reviews/R1TESTROW02ABC', labels: [{ link: 'https://amazon.in/gp/customer-reviews/R1TESTROW02ABC', label: 'Amazon review' }] }),
    },
    reviewKind: 'amazon', prev: null,
    last: { checkId: 'c20261005063000aaaaaa', final: 'pass', finalSays: PASS_SAYS, status: 'Pass', type: 'Verified', typeKey: 'verified', note: `${PASS_SAYS} The same order ID is also in row 9. That row is a duplicate and was not checked.`, at: '2026-10-05T06:30:00.000Z', staff: null },
    final: 'pass', finalSays: PASS_SAYS,
    done: true, recheck: false, emailKey: null, emails: [],
  },
  {
    id: R3, source: 'sheet', row: 3, n: 2, hand: null, label: 'Row 2', orderId: '403-1000003-2000003', orderDate: '14-07-2026', orderDateRead: true, amount: '₹851.95', amountRead: true, product: 'Test Brand Home Cleaning Kit',
    cells: { orderShot: 'E3', deliveryShot: 'F3', reviewLink: 'G3' },
    shots: {
      // The words show another row's link; the link behind them is this row's.
      order: shot({ text: DRIVE('1TestOrderRow04abcdefgh'), links: [DRIVE('1TestOrderRow03abcdefgh')], labels: [drive('1TestOrderRow03abcdefgh')], mismatch: { text: DRIVE('1TestOrderRow04abcdefgh'), link: DRIVE('1TestOrderRow03abcdefgh') }, pictures: [lost(DRIVE('1TestOrderRow03abcdefgh'), 'drive', 'Google Drive', 'the Google account logged in to the dashboard has no access to the file')] }),
      delivery: shot({ text: 'Cancelled' }),
      review: shot({ links: [DRIVE('1TestReviewRow03abcdefg')], link: DRIVE('1TestReviewRow03abcdefg'), labels: [drive('1TestReviewRow03abcdefg')], pictures: [pic(0, DRIVE('1TestReviewRow03abcdefg'))] }),
    },
    reviewKind: 'picture', prev: null,
    last: { checkId: 'c20261005064000bbbbbb', final: 'manual', finalSays: MANUAL_SAYS, status: 'Needs Manual Staff Checking', type: 'Need Google Drive Access', typeKey: 'needDriveAccess', note: `${MANUAL_SAYS} The dashboard can only open Drive files that are shared with anyone who has the link. Ask the file's owner to share it, then check this row again.`, at: '2026-10-05T06:40:00.000Z', staff: null },
    final: 'manual', finalSays: MANUAL_SAYS,
    done: true, recheck: false, emailKey: 'needDriveAccess', emails: [],
  },
  {
    id: R4, source: 'sheet', row: 4, n: 3, hand: null, label: 'Row 3', orderId: '403-1000004-2000004', orderDate: 'someday', orderDateRead: false, amount: '₹499', amountRead: true, product: 'Test Brand Stain Remover',
    cells: { orderShot: 'E4', deliveryShot: 'F4', reviewLink: 'G4' },
    shots: { order: shot(), delivery: shot({ text: 'Open the screenshot', links: ['https://tryboxs.in/api/view-screenshot/test-delivery-04'], labels: [{ link: 'https://tryboxs.in/api/view-screenshot/test-delivery-04', label: 'tryboxs' }], words: 'Open the screenshot' }), review: shot() },
    reviewKind: 'empty', prev: { status: 'Unverified', type: 'Need Access', note: 'Checked by hand on Monday.' }, prevFinal: 'manual', last: null, final: 'manual', finalSays: null, done: true, recheck: false, emailKey: 'needAccess', emails: [],
  },
  {
    id: H1, source: 'manual', row: null, hand: 1, label: 'By hand #1', orderId: '403-7777777-7777777', orderDate: '14-07-2026', orderDateRead: true, amount: '₹499', amountRead: true, product: 'Test Brand Stain Remover',
    cells: {}, shots: { order: shot({ how: 'upload', pictures: [pic(0, null)] }), delivery: shot(), review: shot() }, reviewKind: 'empty', prev: null, last: null, final: null, finalSays: null, done: false, recheck: false, emailKey: null, emails: [],
  },
];
/** The emails as the server sends them: no test address yet, no email address column in the file, the sign-off, every email with its name, and the words that get filled in. */
const EMAILS = { testEmail: '', emailColumn: false, signOff: DEFAULT_SETTINGS.emails.signOff, templates: EMAIL_KEYS.map((k) => ({ key: k, name: emailName(k, DEFAULT_SETTINGS), subject: DEFAULT_SETTINGS.emails.templates[k].subject, message: DEFAULT_SETTINGS.emails.templates[k].message })), placeholders: PLACEHOLDERS };
const TEST_ADDRESS = 'test.person@example.test';
/** An email as the server fills it in for a row (of a file with no email address column). */
const emailOf = (r, key, over = {}) => ({ rowId: r.id, label: r.label, key, name: emailName(key, DEFAULT_SETTINGS), reviewer: '', orderId: r.orderId, address: '', addressOk: false, addressSays: 'This file has no email address column.', to: TEST_ADDRESS, subject: `Your order ${r.orderId}: please send the screenshot again`, message: `Hello,\n\nThis is about your order ${r.orderId} for ${r.product}.\n\nWe could not open the file you sent on Google Drive.\n\nPlease reply to this email with the same screenshot again, as a clear picture.\n\nThank you,\nThe support team`, emailedBefore: null, ...over });
const types = TYPE_KEYS.map((k) => ({ key: k, word: typeWord(k), status: FINAL_WORDS[TYPE_FINAL[k]] }));
const HEADS = ['Order ID', 'Order Date', 'Amount', 'Product Ordered', 'Order Screenshot', 'Delivery Screenshot', 'Live Review Link', 'Status', 'Type'];
const sheet = {
  fileName: 'July orders.xlsx',
  kind: 'xlsx',
  tab: 'Amazon',
  headers: HEADS.map((text, i) => ({ col: i + 1, text })),
  lastCol: 9,
  mapping: { orderId: 1, orderDate: 2, amount: 3, product: 4, orderShot: 5, deliveryShot: 6, reviewShot: null, reviewLink: 7, reviewer: null, email: null, status: 8, type: 9, note: null },
  // Every column of the file, in its order, then the Note it does not have: as the server sends them.
  columns: ['orderId', 'orderDate', 'amount', 'product', 'orderShot', 'deliveryShot', 'reviewLink', 'status', 'type', 'note'].map((key, i) => ({ key, col: i + 1, letter: 'ABCDEFGHIJ'[i], name: HEADS[i] ?? 'Note', added: i === 9 })),
  has: ['orderId', 'orderDate', 'amount', 'product', 'orderShot', 'deliveryShot', 'reviewLink', 'status', 'type'],
  about: ['Used for checking: Order ID, Order Date, Amount, Product Ordered, Order Screenshot, Delivery Screenshot and Live Review Link.', 'It has no Note column, so the checked Excel file adds it after the last column.', 'The rows use the live campaign "Test Clean": its brand, Test Brand, is in their product names.'],
  resultColumns: { status: 8, type: 9, note: 10, added: [{ col: 10, header: 'Note' }] },
  used: true,
  uploadedAt: '2026-10-05T05:00:00.000Z',
};
/** The same file with an "Email ID" column after Type, as the server sends it; the rows' addresses (Row 3's is not one); and the rows, with Rows 2 and 3 both Need Google Drive Access. */
const EMAIL_HEADS = [...HEADS, 'Email ID'];
const emailSheet = {
  ...sheet,
  headers: EMAIL_HEADS.map((text, i) => ({ col: i + 1, text })),
  lastCol: 10,
  mapping: { ...sheet.mapping, email: 10 },
  columns: [...sheet.columns.slice(0, 9), { key: 'email', col: 10, letter: 'J', name: 'Email ID', added: false }, { key: 'note', col: 11, letter: 'K', name: 'Note', added: true }],
  has: [...sheet.has, 'email'],
  resultColumns: { status: 8, type: 9, note: 11, added: [{ col: 11, header: 'Note' }] },
};
const ADDRESSES = { [R2]: 'test.one@example.test', [R3]: 'test.two@example.test', [R4]: 'not an address' };
const emailRows = () =>
  rows.map((r) => {
    const x = structuredClone(r);
    if (ADDRESSES[x.id]) x.values = { 10: { text: ADDRESSES[x.id], labels: [] } };
    if (x.id === R4) Object.assign(x, { last: structuredClone(rows[1].last), prev: null, prevFinal: null, final: 'manual', finalSays: MANUAL_SAYS, done: true, emailKey: 'needDriveAccess' });
    return x;
  });
const withAddress = (id) => emailOf(rows.find((x) => x.id === id), 'needDriveAccess', id === R4 ? { address: 'not an address', addressOk: false, addressSays: 'What the file has for this row is not an email address: "not an address".' } : { address: ADDRESSES[id], addressOk: true, addressSays: null });
const missingReview = { says: 'No column of this file could be found for the review link or the review screenshot, so choose one of them below (every other column can be left as "Not in this file").', kind: 'xlsx', tab: 'Amazon', headers: sheet.headers, lastCol: 9, mapping: { ...sheet.mapping, reviewLink: null }, fields: FIELDS };
const aFile = (name = 'July orders.xlsx') => new File([Buffer.from('made-up bytes')], name);
const KC = 'k0000000000a1';
/** A campaign as the server sends it: what staff typed, and under each product what was read from Amazon, or why it is not used. */
const CAMPAIGNS = [
  {
    id: KC,
    brand: 'Test Brand',
    name: 'Test Clean',
    live: true,
    updatedAt: '2026-10-06T05:00:00.000Z',
    products: [
      { given: 'B0TESTKIT9', state: 'used', name: 'Test Brand Monthly Home Cleaning Kit | Dishwash Liquid 2L Refill, Floor Cleaner 1L', brand: 'Test Brand', variants: ['2 Litre'], variantCount: 2, at: '2026-10-06T05:01:00.000Z', says: null },
      { given: 'https://www.amazon.in/dp/B0TESTOTH1', state: 'not used', name: 'Other Maker Glass Cleaner Spray, 500 ml', brand: 'Other Maker', variants: [], variantCount: 0, at: '2026-10-06T05:01:05.000Z', says: 'Amazon says this product\'s brand is "Other Maker", not "Test Brand", so this product is not used.' },
      { given: 'B0TESTFRS1', state: 'waiting', name: null, brand: null, variants: [], variantCount: 0, at: null, says: null },
    ],
  },
  { id: 'k0000000000a2', brand: 'Test Brand', name: 'Test Summer', live: false, updatedAt: '2026-09-01T05:00:00.000Z', products: [{ given: 'B0TESTSUM1', state: 'used', name: 'Test Brand Sun Shield Spray, 100 ml', brand: 'Test Brand', variants: [], variantCount: 0, at: '2026-09-01T05:01:00.000Z', says: null }] },
];
const listAnswer = (over = {}) => ({ rows: structuredClone(rows), oldRows: 0, sheet: structuredClone(sheet), campaigns: structuredClone(CAMPAIGNS), types, emails: structuredClone(EMAILS), statuses: ['Verified', 'Unverified'], settingsProblem: null, steps: STEP_NAMES, ...over });
const step = (n, state, detail = null, shot = null) => ({ n, name: STEP_NAMES[n - 1], state, detail, shot });
const pastResult = {
  checkId: 'c20261005063000aaaaaa',
  rowId: R2,
  status: 'Verified',
  type: 'Verified',
  typeKey: 'verified',
  note: 'The purchase screenshot and the delivery screenshot match the form, and the review is live and public on Amazon.',
  finishedAt: '2026-10-05T06:30:00.000Z',
  steps: [...[1, 2, 3, 4, 5].map((n) => step(n, 'pass', 'Fine.')), step(6, 'pass', 'Opened the review page.', '/local/amazon/checks/c20261005063000aaaaaa/steps/6'), step(7, 'pass', 'A written review.'), step(8, 'pass', 'Opened.'), step(9, 'pass', 'Found.'), step(10, 'pass', 'Verified: Verified.', '/local/amazon/checks/c20261005063000aaaaaa/steps/10')],
  sheet: { orderId: '403-1000002-2000002', orderDate: '20-07-2026', amount: '654', product: 'Test Brand Floor Cleaner' },
  order: { ok: true, confidence: 92, wordCount: 40, hindi: true, orderIds: ['403-1000002-2000002'], dates: ['20 July 2026'], amounts: [{ text: '%654.00', value: 654, label: 'order total' }], product: 'Test Brand Floor Cleaner Liquid, Lavender, 1', productShare: 1, text: 'Order Details', details: { orderId: { state: 'same', shown: '403-1000002-2000002' }, orderDate: { state: 'same', shown: '20-07-2026' }, amount: { state: 'same', shown: '₹654', label: 'the order total' }, product: { state: 'same', shown: 'Test Brand Floor Cleaner Liquid, Lavender, 1', share: 1 } } },
  delivery: { ok: true, confidence: 90, wordCount: 30, hindi: true, delivered: true, deliveredText: 'Delivered 22 July', orderIds: ['403-1000002-2000002'], dates: [], amounts: [], product: 'Test Brand Floor Cleaner Liquid,', text: 'Your Orders', details: { orderId: { state: 'same', shown: '403-1000002-2000002' }, orderDate: { state: 'not shown' }, amount: { state: 'not shown' }, product: { state: 'same', shown: 'Test Brand Floor Cleaner Liquid,', share: 1 } } },
  reviewPicture: null,
  amazon: { reviewId: 'R1TESTROW02ABC', name: 'Test Reviewer One', stars: 5, title: 'Cleans tiles', body: 'One capful cleans the whole kitchen floor.', productTitle: 'Test Brand Floor Cleaner Liquid, Lavender, 1 Litre', productAsin: 'B0TESTFLR1' },
  productPage: { asin: 'B0TESTFLR1', title: 'Test Brand Floor Cleaner Liquid', variants: ['B0TESTFLR1', 'B0TESTFLR2'] },
  publicReview: { searched: [{ word: 'vitrified', shown: 3 }], found: true, id: 'R1TESTROW02ABC', link: 'https://www.amazon.in/gp/customer-reviews/R1TESTROW02ABC' },
};
pastResult.comparison = buildComparison(pastResult);

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
}

function fakeLocal(answer) {
  const c = {
    calls: [],
    revoked: [],
    streamCtl: null,
    api: async (method, path, body) => {
      c.calls.push({ method, path, body });
      return answer(method, path, body);
    },
    form: async (path, fd) => {
      c.calls.push({ method: 'POST', path, form: fd });
      return answer('FORM', path, fd);
    },
    image: async (path) => {
      c.calls.push({ method: 'GET', path, image: true });
      return `blob:${path}`;
    },
    blob: async (path) => {
      c.calls.push({ method: 'GET', path, blob: true });
      return answer('BLOB', path);
    },
    revoke: (u) => c.revoked.push(u),
    stream: (method, path, body, onEvent, signal) => {
      c.calls.push({ method, path, body, stream: true });
      const d = deferred();
      c.streamCtl = { onEvent, signal, end: d.resolve };
      signal?.addEventListener('abort', () => d.resolve({ ok: false, aborted: true }));
      return d.promise;
    },
  };
  return c;
}

const GOOGLE_IN = { state: 'in', name: 'Test Person', says: null, chrome: false };
const account = { state: 'out', name: null, says: null, loggedIn: false, google: GOOGLE_IN, hindi: true, english: true, browserOpen: true, running: null };
function standard(method, path, body) {
  if (method === 'GET' && path === '/local/amazon/rows') return listAnswer();
  if (method === 'GET' && path === '/local/amazon/account') return structuredClone(account);
  if (method === 'GET' && path === `/local/amazon/rows/${R2}`) return { row: structuredClone(rows[0]), result: structuredClone(pastResult) };
  if (method === 'GET' && path === `/local/amazon/rows/${R3}`) return { row: structuredClone(rows[1]), result: null };
  if (method === 'GET' && path === `/local/amazon/rows/${R4}`) return { row: structuredClone(rows[2]), result: null };
  if (method === 'POST' && (path === '/local/amazon/log-in' || path === '/local/amazon/check-login')) return { ...structuredClone(account), state: 'checking' };
  if (method === 'POST' && /^\/local\/amazon\/google\/(log-in|check-login|log-in-in-chrome|logged-in)$/.test(path)) return { ...structuredClone(account), google: { ...GOOGLE_IN, state: 'checking', name: null } };
  if (method === 'GET' && path === '/local/amazon/campaigns') return { campaigns: structuredClone(CAMPAIGNS) };
  if (method === 'POST' && /^\/local\/amazon\/campaigns(\/k[0-9a-f]{12})?$/.test(path)) {
    const campaign = { id: 'k0000000000b1', brand: body.brand, name: body.name, live: body.live, updatedAt: '2026-10-06T06:00:00.000Z', products: String(body.products).split('\n').filter(Boolean).map((given) => ({ given, state: 'waiting', name: null, brand: null, variants: [], variantCount: 0, at: null, says: null })) };
    return { campaign, campaigns: [...structuredClone(CAMPAIGNS), campaign] };
  }
  if (method === 'POST' && /^\/local\/amazon\/campaigns\/k[0-9a-f]{12}\/(end|delete|read)$/.test(path)) return { campaigns: structuredClone(CAMPAIGNS).filter((c) => !(path.endsWith('/delete') && path.includes(c.id))) };
  if (method === 'POST' && /^\/local\/amazon\/rows\/r[0-9a-f]{12}\/remove$/.test(path)) return { removed: 1 };
  if (method === 'POST' && path === '/local/amazon/rows/remove-all') return { removed: body.expected };
  if (method === 'FORM' && path === '/local/amazon/sheet') return { made: 30, tab: 'Amazon', unplaced: [], sheet: { ...structuredClone(sheet), uploadedAt: '2026-10-06T05:00:00.000Z' } };
  if (method === 'FORM' && path === '/local/amazon/rows') return { row: { ...structuredClone(rows[3]), id: 'r0000000000e6' } };
  if (method === 'BLOB' && path === '/local/amazon/sheet/checked.xlsx') return { blob: 'the bytes', fileName: 'July orders checked 2026-10-05.xlsx' };
  if (method === 'POST' && /^\/local\/amazon\/rows\/r[0-9a-f]{12}\/result$/.test(path)) {
    const r = structuredClone(rows.find((x) => path.includes(x.id)));
    const was = r.last && !r.last.staff ? { final: r.last.final, typeKey: r.last.typeKey, type: r.last.type } : r.last?.staff?.was ?? null;
    return { row: { ...r, final: body.final, last: { ...(r.last ?? { checkId: null }), final: body.final, status: FINAL_WORDS[body.final], type: typeWord(body.typeKey), typeKey: body.typeKey, note: body.note, finalSays: null, at: '2026-10-08T08:35:00.000Z', seconds: null, staff: { at: '2026-10-08T08:35:00.000Z', right: false, was } }, done: true, emailKey: EMAIL_KEYS.includes(body.typeKey) ? body.typeKey : null } };
  }
  if (method === 'POST' && /^\/local\/amazon\/rows\/r[0-9a-f]{12}\/right$/.test(path)) {
    const r = structuredClone(rows.find((x) => path.includes(x.id)));
    if (!r?.last) throw new ApiError(409, 'This row has no result to mark as right. Check it first.');
    return { row: { ...r, last: { ...r.last, staff: { at: '2026-10-08T08:35:00.000Z', right: true, was: { final: r.last.final, typeKey: r.last.typeKey, type: r.last.type } } } } };
  }
  if (method === 'GET' && path === `/local/amazon/rows/${R3}/email`) return { emails: [emailOf(rows[1], 'needDriveAccess')], skipped: [], testEmail: TEST_ADDRESS, emailColumn: false };
  if (method === 'POST' && path === '/local/amazon/emails/preview') return { emails: body.rowIds.map((id) => emailOf(rows.find((x) => x.id === id), id === R4 ? 'needAccess' : 'needDriveAccess')), skipped: [], testEmail: TEST_ADDRESS, emailColumn: false };
  if (method === 'POST' && path === '/local/amazon/email-address') return { testEmail: body.email.trim() };
  if (method === 'POST' && path === '/local/amazon/emails/templates') return { emails: { ...structuredClone(EMAILS), signOff: body.signOff, templates: EMAILS.templates.map((t) => ({ ...t, ...(body.templates?.[t.key] ?? {}) })) } };
  throw new ApiError(404, 'No row has that id.');
}

/** Every word the screen drew in these tests, its text and the words of its labels, for the plain-words test at the end; the Campaigns box's words apart. */
const shown = [];
const campaignWords = [];
function drawn(tree) {
  const box = byId(tree, 'campaigns');
  if (box) {
    for (const node of findAll(box, () => true)) {
      for (const k of ['placeholder', 'aria-label']) if (typeof node.attrs?.[k] === 'string') campaignWords.push(node.attrs[k]);
      if (['p', 'li', 'button', 'h2', 'h3', 'label', 'option', 'span', 'strong'].includes(node.tag)) campaignWords.push(textOf(node));
    }
  }
  for (const node of findAll(tree, (n) => !box || !findAll(box, (m) => m === n).length)) {
    for (const k of ['title', 'aria-label', 'placeholder', 'alt']) if (typeof node.attrs?.[k] === 'string' && !(k === 'title' && node.tag === 'a')) shown.push(node.attrs[k]);
    if (node.tag === 'p' || node.tag === 'li' || node.tag === 'td' || node.tag === 'th' || node.tag === 'button' || node.tag === 'h2' || node.tag === 'h3' || node.tag === 'label' || node.tag === 'option' || node.tag === 'dd' || node.tag === 'span') shown.push(textOf(node));
  }
  return tree;
}
function screen(local, route = '') {
  const state = amazon.initial();
  const went = [];
  const downloads = [];
  const timers = [];
  const revealed = [];
  const asked = [];
  const ctx = {
    h,
    words,
    local,
    state,
    route,
    go: (p) => went.push(p),
    update(change) {
      if (typeof change === 'function') change(state);
      else if (change && typeof change === 'object') Object.assign(state, change);
    },
    confirm: (text) => (asked.push(text), true),
    download: (name, data, type) => downloads.push({ name, data, type }),
    every: (ms, fn) => {
      const t = { ms, fn, stopped: false };
      timers.push(t);
      return () => (t.stopped = true);
    },
    reveal: (id, block) => revealed.push(block ? `${id}:${block}` : id),
  };
  // The top bar's part (the marketplace tabs and the login) and the page, as app.js draws them.
  const draw = () => drawn([amazon.bar(ctx), amazon.render(ctx)]);
  return { ctx, state, went, downloads, timers, revealed, asked, draw, click: (id) => byId(draw(), id).attrs.onclick({ stopPropagation() {} }) };
}

async function settle() {
  for (let i = 0; i < 12; i++) await tick();
}
async function mainPage(local) {
  const s = screen(local);
  amazon.enter(s.ctx);
  await settle();
  return s;
}
async function rowPageOf(local, id = R2) {
  const s = screen(local, id);
  amazon.enter(s.ctx);
  await settle();
  return s;
}
const cellsOf = (tr) => findAll(tr, (n) => n.tag === 'td').map((td) => textOf(td));

// ---- contract with the local server ----

test("the screen draws the server's ten steps, its columns and its Types", () => {
  assert.deepEqual(VIEW_STEPS, STEP_NAMES);
  assert.deepEqual(FORM_FIELDS.map((f) => f.label), ['Order ID', 'Order date', 'Amount', 'Product ordered', 'Purchase screenshot', 'Delivery screenshot', 'Review link', 'Review screenshot']);
  assert.deepEqual(FORM_FIELDS.map((f) => f.column), ['orderId', 'orderDate', 'amount', 'product', 'orderShot', 'deliveryShot', 'reviewLink', 'reviewShot'], "each is one of the file's columns");
  assert.equal(NOT_CHECKED, 'Not checked');
});

test('no exclamation marks in the screen’s words', () => {
  const strings = [...VIEW_SRC.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)].map((m) => m[2]);
  for (const s of strings) assert.ok(!/[A-Za-z]!(\s|$)/.test(s), s);
});

test('the top bar shows one clear login state at a time, each with only its own words and buttons, and what to do in a soft box under it', async () => {
  const barFor = async (over) => {
    const s = await mainPage(fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/account' ? { ...structuredClone(account), ...over } : standard(m, p, b))));
    const tree = s.draw();
    const bar = byId(tree, 'account');
    return { text: textOf(bar), buttons: findAll(bar, (n) => n.tag === 'button').map(textOf), help: textOf(byId(tree, 'login-help')), icons: findAll(bar, (n) => /\bicon-/.test(n.attrs?.class ?? '')).map((n) => n.attrs.class), tree };
  };
  const first = screen(fakeLocal(standard)).draw();
  assert.equal(textOf(byId(first, 'account')), 'Checking the Amazon login…', 'before the first answer');
  const checking = await barFor({ state: 'checking' });
  assert.deepEqual([checking.text, checking.buttons, checking.help], ['Checking the Amazon login…', [], '']);
  const logged = await barFor({ state: 'in', name: 'Test Staff', loggedIn: true });
  assert.deepEqual([logged.text, logged.buttons, logged.help], ['Logged in to Amazon as Test Staff', [], ''], 'no login button, no instructions, no notice');
  assert.deepEqual(logged.icons, ['icon icon-pass'], 'a green tick icon');
  const out = await barFor({ state: 'out' });
  assert.deepEqual([out.text, out.buttons, out.help], [`Not logged in to Amazon${LOGIN_WORDS.outButton}`, ['Log in to Amazon'], ''], 'the top bar stays slim');
  assert.equal(byId(out.tree, 'log-in').attrs.title, LOGIN_WORDS.outHow, 'what the button does, when the mouse rests on it');
  assert.match(byId(out.tree, 'log-in').attrs.class, /\bbtn-primary\b/, 'the one button of the top bar is the yellow one');
  assert.equal(LOGIN_WORDS.outHow, "Amazon's login page opens in the Live Amazon Browser window only if you need to log in.");
  const waiting = await barFor({ state: 'waiting' });
  assert.deepEqual([waiting.text, waiting.buttons, waiting.help], ['Waiting for you to log in', [], 'Log in in the Live Amazon Browser window, and tick the box that keeps you signed in, so you stay logged in after a restart. This tool never types, stores or reads a password.']);
  const says = 'Amazon showed a robot check in the Live Amazon Browser window, so the login could not be checked. This dashboard never answers a robot check. Press "Check the login again" when you want to try again.';
  const problem = await barFor({ state: 'problem', says });
  assert.deepEqual([problem.text, problem.buttons, problem.help], ['The login could not be checkedCheck the login again', ['Check the login again'], says]);
  assert.equal(textOf(byId(logged.tree, 'reader-line')), 'The dashboard reads the screenshots on this computer, in English and Hindi.', 'what reads the pictures sits under "More", not in the top bar');
  assert.ok(byId(byId(logged.tree, 'more'), 'reader-line'));
  assert.doesNotMatch(VIEW_SRC, /[Ss]ign(ed)? in to Amazon|[Ss]ign in again|Amazon: not signed in/, 'log in, not sign in, everywhere on the screen');
});

test('the marketplace tabs: Amazon is chosen; Flipkart says "Coming soon" and cannot be chosen', () => {
  const s = screen(fakeLocal(standard));
  const tree = s.draw();
  const tabs = byId(tree, 'market');
  assert.equal(tabs.attrs.role, 'tablist');
  assert.deepEqual(findAll(tabs, (n) => n.attrs?.role === 'tab').map(textOf), ['Amazon', 'FlipkartComing soon']);
  assert.equal(byId(tree, 'market-amazon').attrs['aria-selected'], 'true');
  const flipkart = byId(tree, 'market-flipkart');
  assert.deepEqual([flipkart.attrs['aria-selected'], flipkart.attrs['aria-disabled'], flipkart.attrs.disabled], ['false', 'true', true]);
  assert.equal(flipkart.attrs.onclick, undefined, 'pressing it does nothing');
});

test('"Log in to Amazon": the top bar follows the login every 2 seconds, with no reload, until it says logged in', async () => {
  let now = { ...account };
  const local = fakeLocal((m, p, b) => {
    if (m === 'GET' && p === '/local/amazon/account') return structuredClone(now);
    if (m === 'POST' && p === '/local/amazon/log-in') return structuredClone((now = { ...now, state: 'checking' }));
    if (m === 'POST' && p === '/local/amazon/check-login') return structuredClone((now = { ...now, state: 'checking', says: null }));
    return standard(m, p, b);
  });
  const s = await mainPage(local);
  assert.equal(LOGIN_POLL_MS, 2000);
  assert.equal(s.timers[0].ms, 2000, 'the top bar asks every 2 seconds');
  s.click('log-in');
  await settle();
  assert.ok(local.calls.some((c) => c.method === 'POST' && c.path === '/local/amazon/log-in'));
  assert.equal(textOf(byId(s.draw(), 'account')), LOGIN_WORDS.checking);
  now = { ...now, state: 'waiting' };
  s.timers[0].fn();
  await settle();
  assert.equal(textOf(byId(s.draw(), 'login-help')), LOGIN_WORDS.waiting);
  now = { ...now, state: 'in', name: 'Test Staff', loggedIn: true };
  s.timers[0].fn();
  await settle();
  assert.equal(textOf(byId(s.draw(), 'account')), 'Logged in to Amazon as Test Staff');
  assert.equal(byId(s.draw(), 'login-help'), null, 'nothing left to do, so no box');
  assert.equal(local.calls.filter((c) => c.method === 'GET' && c.path === '/local/amazon/rows').length, 1, 'the dashboard was never reloaded');
  now = { ...now, state: 'problem', name: null, loggedIn: false, says: 'Amazon refused to show its page, so the login could not be checked. Wait a while, then press "Check the login again".' };
  s.timers[0].fn();
  await settle();
  s.click('check-login');
  await settle();
  assert.ok(local.calls.some((c) => c.method === 'POST' && c.path === '/local/amazon/check-login'));
  assert.equal(textOf(byId(s.draw(), 'account')), LOGIN_WORDS.checking);
  const busy = await mainPage(fakeLocal((m, p, b) => (p === '/local/amazon/log-in' ? Promise.reject(new ApiError(409, 'A check, a sheet upload or a removal is running. Wait for it to finish, then press Log in to Amazon.')) : standard(m, p, b))));
  busy.click('log-in');
  await settle();
  assert.match(textOf(byId(busy.draw(), 'login-help')), /Wait for it to finish, then press Log in to Amazon\./, 'a refusal is said under the top bar');
});

test('the table shows the rows as they are in the file, numbered from 1: its columns headed "A: Order ID", the Status in the Status column, dates day first, rupees, where each link goes, "Empty", and a warning for a link that differs from its words', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  const tree = s.draw();
  const heads = findAll(byId(tree, 'rows-table'), (n) => n.tag === 'th').map(textOf);
  assert.deepEqual(heads, ['Row', 'A: Order ID', 'B: Order Date', 'C: Amount', 'D: Product Ordered', 'E: Order Screenshot', 'F: Delivery Screenshot', 'G: Live Review Link', 'H: Status', 'I: Type', 'J: Note', 'Check'], 'the columns in the file\'s order; the Status is in the Status column, and there is no other column for it');
  assert.match(byId(tree, 'rows-table').attrs.class, /\brows-wrap\b/);
  assert.match(CSS, /\.rows-wrap \{[^}]*max-height: calc\(100vh - 132px\); overflow: auto;/, 'the table gets most of the screen');
  assert.match(CSS, /\.note-cell \{ width: 340px; min-width: 340px; max-width: 340px; white-space: pre-line; \}/, 'Notes wrap neatly in a column of fixed width');
  assert.match(CSS, /\.rows-table tbody tr\.clickable:hover > td \{ background: var\(--hover\); \}/, 'a soft highlight under the mouse');
  assert.ok(findAll(byId(tree, 'rows-table'), (n) => n.attrs?.class === 'col-letter').length >= 9, "each column's letter is kept small");
  assert.match(CSS, /\.rows-table thead th \{[^}]*position: sticky; top: 0;/, 'the column names stay in view while the rows scroll');
  assert.equal(textOf(byId(tree, 'sheet-line')), 'July orders.xlsx, the Amazon tab: 3 rows.');

  const two = cellsOf(byId(tree, `row-${R2}`));
  assert.deepEqual(two.slice(0, 8), ['1', '403-1000002-2000002', '20-07-2026', '₹654', 'Test Brand Floor Cleaner', 'Google Drive', 'Google Drive', 'Amazon review'], 'row 2 of the file is Row 1 on the dashboard');
  assert.ok(two[STATUS].startsWith('Pass'), two[STATUS]);
  assert.deepEqual(two.slice(9), ['Verified', rows[0].last.note, 'Check again'], 'the Type stays Verified; the Note in full');
  assert.equal(byId(tree, `final-${R2}`).attrs.class, 'final final-pass', 'Pass in green');
  assert.equal(byId(tree, `final-${R3}`).attrs.class, 'final final-manual', 'Needs Manual Staff Checking in orange');
  assert.deepEqual(['1', '2', '3', 'By hand #1'], [R2, R3, R4, H1].map((id) => cellsOf(byId(tree, `row-${id}`))[0]), 'numbered from 1; a row added by hand keeps its own name');
  assert.deepEqual(findAll(byId(tree, `final-${R2}`), (n) => /\bicon\b/.test(n.attrs?.class ?? '')).map((n) => n.attrs.class), ['icon icon-pass'], 'always with its word and its icon, never colour alone');
  assert.equal(findAll(byId(tree, `row-${R3}`), (n) => n.attrs?.class === 'tag').map(textOf)[0], 'Need Google Drive Access', 'the Type is a small soft tag');
  assert.match(CSS, /\.final-pass \{[^}]*color: var\(--good\)/);
  assert.match(CSS, /\.final-fail \{[^}]*color: var\(--bad\)/);
  assert.match(CSS, /\.final-manual \{[^}]*color: var\(--warn\)/);
  const link = findAll(byId(tree, `row-${R2}`), (n) => n.tag === 'a')[0];
  assert.deepEqual([textOf(link), link.attrs.href, link.attrs.target, link.attrs.rel, link.attrs.title], ['Google Drive', DRIVE('1TestOrderRow02abcdefgh'), '_blank', 'noopener noreferrer', DRIVE('1TestOrderRow02abcdefgh')], 'opens in a new tab; the whole link shows when the mouse rests on it');
  let stopped = false;
  link.attrs.onclick({ stopPropagation: () => (stopped = true) });
  assert.ok(stopped, 'opening a link does not also open the row’s page');

  const three = cellsOf(byId(tree, `row-${R3}`));
  assert.deepEqual(three.slice(2, 8), ['14-07-2026', '₹851.95', 'Test Brand Home Cleaning Kit', 'Google DriveThe written link is different', 'Cancelled', 'Google Drive'], 'the small warning stays');
  const warning = findAll(byId(tree, `row-${R3}`), (n) => n.attrs?.class === 'link-warning')[0];
  assert.equal(warning.attrs.title, 'The link written in this cell is different from the link that opens when you click it. The dashboard checks the link that opens when clicked.');
  assert.ok(findAll(warning, (n) => n.attrs?.class === 'icon icon-warn').length === 1, 'with its icon');
  assert.equal(findAll(byId(tree, `row-${R3}`), (n) => n.tag === 'a')[0].attrs.href, DRIVE('1TestOrderRow03abcdefgh'), 'the label opens the link behind the cell');

  const four = cellsOf(byId(tree, `row-${R4}`));
  assert.deepEqual(four.slice(1, 8), ['403-1000004-2000004', 'someday', '₹499', 'Test Brand Stain Remover', 'Empty', 'tryboxsOpen the screenshot', 'Empty'], 'words that are not a date, as they are; an empty cell says "Empty"');
  assert.deepEqual(four.slice(8, 11), ['Needs Manual Staff CheckingFrom the file', 'Need Access', 'Checked by hand on Monday.'], 'not checked yet: the Status the file had, as one of the three words and marked "From the file", never Unverified');
  assert.ok(findAll(byId(tree, `row-${R4}`), (n) => n.attrs?.class === 'empty-cell').every((n) => textOf(n) === 'Empty'));
  const hand = cellsOf(byId(tree, `row-${H1}`));
  assert.deepEqual([hand[0], hand[5], hand[STATUS], hand[9], hand[10]], ['By hand #1', 'A file given by hand', 'Empty', 'Empty', 'Empty'], 'a row not checked yet has no Status');
  // The Status column holds only the three words.
  for (const id of [R2, R3, R4]) assert.match(cellsOf(byId(tree, `row-${id}`))[STATUS], /^(Pass|Fail|Needs Manual Staff Checking)/, id);
  assert.ok(!local.calls.some((c) => c.image), 'the table fetches no pictures');

  byId(tree, `row-${R4}`).attrs.onclick();
  assert.equal(s.went.at(-1), `amazon/${R4}`, 'clicking a row opens its own page');
  assert.ok(byId(tree, `check-${R4}`), 'each row keeps its Check button');
});

test('four Status cards: Pass, Fail, Needs Manual Staff Checking and Not checked yet; pressing one shows only those rows, and they are the only Status filter', async () => {
  const s = await mainPage(fakeLocal(standard));
  const tree = s.draw();
  assert.equal(countsLine(tree), 'Pass: 1, Fail: 0, Needs Manual Staff Checking: 2, Not checked yet: 1', 'a Status already in the file counts too');
  assert.equal(textOf(byId(tree, 'rows-count')), '4 rows');
  assert.equal(byId(tree, 'counts').attrs['aria-label'], 'Status. Press one to show only those rows.');
  // The Status box next to the Type box: every Status with how many rows; it and the cards always show the same choice.
  const statusBox = () => byId(s.draw(), 'filter-final');
  assert.deepEqual(findAll(statusBox(), (n) => n.tag === 'option').map(textOf), ['Every Status (4)', 'Pass (1)', 'Fail (0)', 'Needs Manual Staff Checking (2)', 'Not checked yet (1)']);
  assert.equal(statusBox().attrs.value, '');
  const shownNow = () => findAll(byId(s.draw(), 'rows'), (n) => n.tag === 'tr' && n.attrs?.['data-id']?.startsWith('row-')).map((n) => n.attrs['data-id']);
  s.click('count-manual');
  assert.deepEqual(shownNow(), [`row-${R3}`, `row-${R4}`], 'only the rows that need a staff member');
  assert.equal(byId(s.draw(), 'count-manual').attrs['aria-pressed'], 'true');
  assert.equal(statusBox().attrs.value, 'manual', 'the box shows the card pressed');
  assert.equal(textOf(byId(s.draw(), 'rows-count')), '2 of 4 rows shown', 'said once, above the table');
  s.click('count-manual');
  assert.equal(shownNow().length, 4, 'pressed again, every row shows');
  assert.equal(statusBox().attrs.value, '');
  statusBox().attrs.onchange({ target: { value: 'pass' } });
  assert.deepEqual(shownNow(), [`row-${R2}`], 'choosing a Status in the box shows only those rows');
  assert.equal(byId(s.draw(), 'count-pass').attrs['aria-pressed'], 'true', 'and presses its card');
  statusBox().attrs.onchange({ target: { value: 'none' } });
  assert.deepEqual(shownNow(), [`row-${H1}`]);
  statusBox().attrs.onchange({ target: { value: '' } });
  assert.equal(shownNow().length, 4, '"Every Status" shows every row');
  assert.equal(byId(s.draw(), 'count-none').attrs['aria-pressed'], 'false');
  s.click('count-pass');
  assert.deepEqual(shownNow(), [`row-${R2}`]);
  s.click('count-none');
  assert.deepEqual(shownNow(), [`row-${H1}`]);
  s.click('count-fail');
  assert.equal(textOf(byId(s.draw(), 'no-match')), 'No row has that Status and Type.');
  s.click('filter-clear');
  byId(s.draw(), 'filter-type').attrs.onchange({ target: { value: 'Need Access' } });
  assert.deepEqual(shownNow(), [`row-${R4}`], 'a Type from the file is found too');
  byId(s.draw(), 'filter-type').attrs.onchange({ target: { value: 'Need Google Drive Access' } });
  assert.deepEqual(shownNow(), [`row-${R3}`]);
  // The Type box always lists every Type the dashboard has, each with how many rows have it (0 too), in the order the settings list them.
  const typeOptions = () => findAll(byId(s.draw(), 'filter-type'), (n) => n.tag === 'option').map(textOf);
  const every = (counts) => ['Every Type', ...types.map((t) => `${t.word} (${counts[t.word] ?? 0})`)];
  assert.deepEqual(typeOptions(), every({ Verified: 1, 'Need Google Drive Access': 1, 'Need Access': 1 }), 'every Type, with how many rows have it; a Type from the file counts too');
  assert.equal(typeOptions().length, 24, 'the 23 Types and "Every Type"');
  // A Status card pressed: still every Type, counted among the rows of that Status.
  s.click('count-manual');
  assert.deepEqual(typeOptions(), every({ 'Need Google Drive Access': 1, 'Need Access': 1 }), 'pressing a Status card counts the Types among those rows, and still lists every Type');
  byId(s.draw(), 'filter-type').attrs.onchange({ target: { value: 'Need Google Drive Access' } });
  assert.deepEqual(shownNow(), [`row-${R3}`], 'a Status and a Type together show exactly those rows');
  byId(s.draw(), 'filter-type').attrs.onchange({ target: { value: 'Not delivered' } });
  assert.equal(textOf(byId(s.draw(), 'no-match')), 'No row has that Status and Type.', 'a Type with 0 rows can be chosen, and says so');
  s.click('count-pass');
  assert.deepEqual(typeOptions(), every({ Verified: 1 }));
  assert.equal(s.state.filter.type, '', 'the Type chosen goes when another Status card is pressed');
  s.click('count-none');
  assert.deepEqual(typeOptions(), every({}), 'rows not checked yet have no Type, so every Type has 0');
  assert.deepEqual(typeCounts([{ done: true, last: { type: 'Verified', final: 'pass' } }, { done: true, last: { type: 'not delivered', final: 'fail' } }, { done: true, last: { type: 'Not delivered', final: 'fail' } }, { done: false }], types).filter((t) => t.count), [{ word: 'Verified', count: 1 }, { word: 'Not delivered', count: 2 }], 'a Type word from the file counts whatever its capitals');
  assert.equal(typeCounts([{ done: true, last: { type: 'Verified', final: 'pass' } }], types).length, 23, 'every Type, 0 too');
  assert.deepEqual(typeCounts([{ done: true, last: { type: 'Verified', final: 'pass' } }, { done: true, last: { type: 'Not delivered', final: 'fail' } }], types, 'fail').filter((t) => t.count), [{ word: 'Not delivered', count: 1 }]);
  assert.deepEqual(typeCounts([{ done: true, prev: { status: 'Verified', type: 'Checked by hand' }, final: 'pass' }], types).at(-1), { word: 'Checked by hand', count: 1 }, 'a Type the dashboard does not have, written in the file, is listed after the others');
});

test('the upload area mentions no other tab; once a file is in it is one slim line with "Replace file"; choosing a file uploads it at once, asking once first when rows are in', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  const card = byId(s.draw(), 'sheet');
  assert.doesNotMatch(textOf(card), /Instamart|Flipkart/);
  assert.match(card.attrs.class, /\bupload-slim\b/, 'a file is in: one slim line');
  assert.equal(textOf(byId(card, 'sheet-line')), 'July orders.xlsx, the Amazon tab: 3 rows.', "the file's name, its tab and how many rows");
  assert.equal(textOf(byId(card, 'replace-file')), 'Replace file');
  assert.equal(byId(card, 'replace-file').attrs.for, 'sheet-file', 'it chooses another file');
  assert.equal(byId(card, 'sheet-file').attrs.accept, SHEET_ACCEPT);
  assert.deepEqual(SHEET_ACCEPT.split(',').filter((k) => k.startsWith('.')), ['.xlsx', '.xlsm', '.xls', '.csv'], 'every Excel file and CSV files can be picked');
  assert.equal(byId(s.draw(), 'upload-sheet'), null, 'no second button to press');
  for (const gone of ['tab-choice', 'save-columns', 'stop-columns', 'columns-progress', 'columns', 'cancel-file']) assert.equal(byId(s.draw(), gone), null, `${gone} is gone`);
  const empty = await mainPage(fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ rows: [], sheet: null }) : standard(m, p, b))));
  const large = byId(empty.draw(), 'sheet');
  assert.doesNotMatch(large.attrs.class, /\bupload-slim\b/, 'no file in yet: the large area');
  assert.match(textOf(large), /^Upload the Excel file: drop it anywhere on this page, or choose itOnly the tab named "Amazon" is read\. Another file replaces the rows\./, 'one short line');
  assert.match(byId(large, 'choose-file').attrs.class, /\bbtn-primary\b/, 'Choose file is the one yellow button there');
  byId(empty.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile()] } });
  await settle();
  assert.deepEqual(empty.asked, [], 'no rows yet: nothing to ask');
  assert.equal(empty.ctx.local.calls.find((c) => c.path === '/local/amazon/sheet').form.get('replace'), null);

  const listed = local.calls.filter((c) => c.method === 'GET' && c.path === '/local/amazon/rows').length;
  byId(s.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile('August orders.xlsx')] } });
  await settle();
  assert.deepEqual(s.asked, ['This replaces all 3 rows and their results with the rows of the new file. Go on?'], 'asked once, about the rows of the file before only');
  const sent = local.calls.find((c) => c.path === '/local/amazon/sheet').form;
  assert.deepEqual([sent.get('file').name, sent.get('replace'), sent.get('stop'), sent.get('mapping')], ['August orders.xlsx', '1', null, null]);
  assert.equal(textOf(byId(s.draw(), 'upload-done')), 'Uploaded');
  assert.equal(textOf(byId(s.draw(), 'sheet-line')), 'July orders.xlsx, the Amazon tab: 30 rows.', "the file's name and how many rows it has, once it is in");
  assert.equal(local.calls.filter((c) => c.method === 'GET' && c.path === '/local/amazon/rows').length, listed + 1, 'the rows show at once');

  const cancel = await mainPage(fakeLocal(standard));
  cancel.ctx.confirm = (text) => (cancel.asked.push(text), false);
  const gen = cancel.state.upload.gen;
  byId(cancel.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile()] } });
  await settle();
  assert.equal(cancel.asked.length, 1);
  assert.ok(!cancel.ctx.local.calls.some((c) => c.path === '/local/amazon/sheet'), 'Cancel sends nothing');
  assert.equal(textOf(byId(cancel.draw(), 'sheet-line')), 'July orders.xlsx, the Amazon tab: 3 rows.', 'the rows stay as they were');
  assert.equal(cancel.state.upload.gen, gen + 1, 'the same file can be chosen again');

  const byHand = await mainPage(fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ rows: [structuredClone(rows[3])] }) : standard(m, p, b))));
  byId(byHand.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile()] } });
  await settle();
  assert.deepEqual(byHand.asked, [], 'only rows added by hand: they stay, so there is nothing to ask');
  const one = await mainPage(fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ rows: [structuredClone(rows[2])] }) : standard(m, p, b))));
  byId(one.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile()] } });
  await settle();
  assert.deepEqual(one.asked, ['This replaces the 1 row and its result with the rows of the new file. Go on?'], 'asked even when no row has a result yet');
});

test('the question before an upload: about the rows of the file before, and what it stops first', () => {
  assert.equal(uploadQuestion(0, null), null, 'nothing to ask');
  assert.equal(uploadQuestion(0, 'sheet'), null, 'another upload is not stopped: the server says to wait');
  assert.equal(uploadQuestion(4, null), 'This replaces all 4 rows and their results with the rows of the new file. Go on?');
  assert.equal(uploadQuestion(4, 'run'), 'This replaces all 4 rows and their results with the rows of the new file. Rows are being checked right now: OK stops the checking first, then uploads the new file. Go on?');
  assert.equal(uploadQuestion(1, 'check'), 'This replaces the 1 row and its result with the rows of the new file. A row is being checked right now: OK stops that check first, then uploads the new file. Go on?');
  assert.equal(uploadQuestion(0, 'campaign'), "A campaign's products are being read from Amazon right now: OK stops that first, then uploads the new file. Go on?");
});

test('a new file while rows are checked: the same question says so, OK stops the checking first, then the new rows show and the checking area goes; Cancel stops nothing', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  s.click('start-checking');
  local.streamCtl.onEvent({ event: 'row', rowId: R4, label: 'Row 3' });
  const run = local.streamCtl;
  s.ctx.confirm = (text) => (s.asked.push(text), false);
  byId(s.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile('August orders.xlsx')] } });
  await settle();
  assert.deepEqual(s.asked, ['This replaces all 3 rows and their results with the rows of the new file. Rows are being checked right now: OK stops the checking first, then uploads the new file. Go on?']);
  assert.ok(!local.calls.some((c) => c.path === '/local/amazon/sheet'), 'Cancel sends nothing');
  assert.equal(run.signal.aborted, false, 'and stops nothing');
  assert.ok(s.state.all.running);
  s.ctx.confirm = (text) => (s.asked.push(text), true);
  const answer = deferred();
  local.form = async (path, fd) => (local.calls.push({ method: 'POST', path, form: fd }), answer.promise);
  byId(s.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile('August orders.xlsx')] } });
  await settle();
  const sent = local.calls.find((c) => c.path === '/local/amazon/sheet').form;
  assert.deepEqual([sent.get('replace'), sent.get('stop')], ['1', '1'], 'the server stops the checking first');
  assert.equal(textOf(byId(s.draw(), 'upload-doing')), 'Stopping that first, then uploading "August orders.xlsx"…');
  answer.resolve({ made: 30, tab: 'Amazon', unplaced: [], sheet: { ...structuredClone(sheet), fileName: 'August orders.xlsx' } });
  await settle();
  assert.equal(s.state.all, null, "the checking area of the old rows goes");
  assert.equal(run.signal.aborted, true, 'the page lets go of the stopped run');
  assert.equal(byId(s.draw(), 'start-checking').attrs.disabled, false, 'the new rows can be checked');
  assert.equal(textOf(byId(s.draw(), 'upload-done')), 'Uploaded');
});

test("a new file while a campaign's products are read: the same question says so, and OK stops that first", async () => {
  const local = fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/account' ? { ...structuredClone(account), running: { kind: 'campaign', rowId: null } } : standard(m, p, b)));
  const s = await mainPage(local);
  amazon.dropFile(s.ctx, aFile('August orders.xlsx'));
  await settle();
  assert.deepEqual(s.asked, ["This replaces all 3 rows and their results with the rows of the new file. A campaign's products are being read from Amazon right now: OK stops that first, then uploads the new file. Go on?"]);
  assert.equal(local.calls.find((c) => c.path === '/local/amazon/sheet').form.get('stop'), '1');
});

test('whatever stops an upload is said in one sentence right under the upload line, and the file before stays; a second file while one is uploading is told to wait', async () => {
  const OLD = 'This is an old Excel file (.xls) that the dashboard cannot read, so open it in Excel, save it as an Excel Workbook (.xlsx), then upload that.';
  const local = fakeLocal((m, p, b) => {
    if (m === 'FORM' && p === '/local/amazon/sheet') throw new ApiError(400, OLD);
    return standard(m, p, b);
  });
  const s = await mainPage(local);
  byId(s.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile('old orders.xls')] } });
  await settle();
  const card = byId(s.draw(), 'sheet');
  assert.equal(textOf(findAll(card, (n) => /\bnotice-error\b/.test(n.attrs?.class ?? ''))[0]), OLD, 'under the upload line');
  assert.equal(textOf(byId(card, 'sheet-line')), 'July orders.xlsx, the Amazon tab: 3 rows.', 'the file before stays');
  assert.equal(findAll(s.draw(), (n) => n.tag === 'button' && /^Upload$/.test(textOf(n))).length, 0, 'no button that does nothing');
  const answer = deferred();
  const slow = await mainPage(fakeLocal((m, p, b) => (m === 'FORM' && p === '/local/amazon/sheet' ? answer.promise : standard(m, p, b))));
  byId(slow.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile('August orders.xlsx')] } });
  await settle();
  assert.equal(textOf(byId(slow.draw(), 'upload-doing')), 'Uploading "August orders.xlsx"…');
  assert.equal(byId(slow.draw(), 'start-checking').attrs.disabled, true, 'checking waits for the upload');
  byId(slow.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile('September orders.xlsx')] } });
  await settle();
  assert.match(textOf(byId(slow.draw(), 'sheet')), /"August orders\.xlsx" is still being uploaded, so wait for it to finish, then upload "September orders\.xlsx" again\./);
  answer.resolve({ made: 30, tab: 'Amazon', unplaced: [], sheet: { ...structuredClone(sheet), fileName: 'August orders.xlsx' } });
  await settle();
  assert.equal(slow.ctx.local.calls.filter((c) => c.path === '/local/amazon/sheet').length, 1, 'the second file was not sent');
});

test('a needed column that cannot be found: one sentence says which, the chooser shows with "Not in this file" for every other field, the table waits for the new rows, and "Use these columns" sends the same file again', async () => {
  let answers = 0;
  const local = fakeLocal((m, p, b) => (m === 'FORM' && p === '/local/amazon/sheet' && answers++ === 0 ? { columns: structuredClone(missingReview) } : standard(m, p, b)));
  const s = await mainPage(local);
  byId(s.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile('Testbrand Amazon Review Data.xlsx')] } });
  await settle();
  assert.match(textOf(byId(s.draw(), 'columns')), /No column of this file could be found for the review link or the review screenshot, so choose one of them below \(every other column can be left as "Not in this file"\)\./);
  assert.equal(textOf(findAll(byId(s.draw(), 'drop'), (n) => n.tag === 'p')[0]), 'Testbrand Amazon Review Data.xlsx: choose the columns below.', 'the file waits for its columns');
  assert.deepEqual(findAll(byId(s.draw(), 'columns'), (n) => n.tag === 'label' && n.attrs?.for?.startsWith('col-')).map((n) => textOf(n)), FIELDS.map((f) => `${f.label}${f.required ? ' (required)' : f.review ? (f.key === 'reviewLink' ? ' (or the review screenshot)' : ' (or the review link)') : ' (optional)'}`));
  assert.equal(textOf(findAll(byId(s.draw(), 'col-orderDate'), (n) => n.tag === 'option')[0]), 'Not in this file', 'a field the file does not have can be left out');
  assert.equal(textOf(findAll(byId(s.draw(), 'col-orderId'), (n) => n.tag === 'option')[0]), 'Choose a column');
  assert.equal(textOf(findAll(byId(s.draw(), 'col-note'), (n) => n.tag === 'option')[0]), 'A new column after the last one');
  assert.equal(byId(s.draw(), 'col-reviewLink').attrs.value, '');
  assert.equal(byId(s.draw(), 'col-orderId').attrs.value, '1');
  assert.equal(textOf(byId(s.draw(), 'results-go')), 'In the checked Excel file, the Status goes in the column headed "Status", the Type goes in the column headed "Type" and the Note goes in a new column headed "Note". New columns go after the last one.');
  assert.equal(byId(s.draw(), 'upload-done'), null, 'no rows made yet');
  // The table does not show the old file's rows meanwhile.
  assert.equal(textOf(byId(s.draw(), 'rows-waiting')), 'The rows of "Testbrand Amazon Review Data.xlsx" show here once its columns are chosen above. Cancel brings back the rows shown before.');
  assert.equal(byId(s.draw(), `row-${R2}`), null, "no row of the old file");
  assert.equal(byId(s.draw(), 'overview'), null, 'nor its Status cards');
  byId(s.draw(), 'col-reviewLink').attrs.onchange({ target: { value: '7' } });
  s.click('use-columns');
  await settle();
  const forms = local.calls.filter((c) => c.path === '/local/amazon/sheet').map((c) => c.form);
  assert.equal(forms.length, 2);
  assert.equal(forms[1].get('file').name, 'Testbrand Amazon Review Data.xlsx', 'the same file, sent again');
  assert.deepEqual(JSON.parse(forms[1].get('mapping')), { ...missingReview.mapping, reviewLink: 7 });
  assert.equal(forms[1].get('replace'), '1', 'the answer to the question asked at the first press');
  assert.equal(s.asked.length, 1, 'asked once');
  assert.equal(byId(s.draw(), 'columns'), null, 'the chooser goes once the rows are made');
  assert.equal(textOf(byId(s.draw(), 'upload-done')), 'Uploaded');
  assert.ok(byId(s.draw(), 'rows-table'), 'the rows show again');
  byId(s.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile('another.xlsx')] } });
  await settle();
  assert.equal(local.calls.filter((c) => c.path === '/local/amazon/sheet').at(-1).form.get('file').name, 'another.xlsx', 'another file is uploaded at once');
  const let_go = await mainPage(fakeLocal((m, p, b) => (m === 'FORM' && p === '/local/amazon/sheet' ? { columns: structuredClone(missingReview) } : standard(m, p, b))));
  byId(let_go.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile()] } });
  await settle();
  assert.ok(byId(let_go.draw(), 'rows-waiting'));
  let_go.click('cancel-file');
  assert.equal(byId(let_go.draw(), 'columns'), null, 'Cancel lets the file waiting for its columns go');
  assert.equal(textOf(byId(let_go.draw(), 'sheet-line')), 'July orders.xlsx, the Amazon tab: 3 rows.');
  assert.ok(byId(let_go.draw(), `row-${R2}`), 'and brings back the rows shown before');
});

// ---- a file laid out differently: only its own columns ----

const NEW_HEADS = ['Reviewer Name', 'Order ID', 'Amount', 'Product Ordered', 'Order Screenshot', 'Delivery Screenshot', 'Review Screenshot', 'Review Link'];
const NEW_KEYS = ['reviewer', 'orderId', 'amount', 'product', 'orderShot', 'deliveryShot', 'reviewShot', 'reviewLink'];
/** A newer file as the server sends it: no order date, Status, Type or Note, a review screenshot, and the reviewer's name first. */
const newSheet = {
  fileName: 'Testbrand Amazon Review Data.xlsx',
  kind: 'xlsx',
  tab: 'Amazon Orders',
  headers: NEW_HEADS.map((text, i) => ({ col: i + 1, text })),
  lastCol: 8,
  mapping: { orderId: 2, orderDate: null, amount: 3, product: 4, orderShot: 5, deliveryShot: 6, reviewShot: 7, reviewLink: 8, reviewer: 1, email: null, status: null, type: null, note: null },
  columns: [...NEW_KEYS.map((key, i) => ({ key, col: i + 1, letter: 'ABCDEFGH'[i], name: NEW_HEADS[i], added: false })), ...['Status', 'Type', 'Note'].map((name, i) => ({ key: name.toLowerCase(), col: 9 + i, letter: 'IJK'[i], name, added: true }))],
  resultColumns: { status: 9, type: 10, note: 11, added: [{ col: 9, header: 'Status' }, { col: 10, header: 'Type' }, { col: 11, header: 'Note' }] },
  has: ['orderId', 'amount', 'product', 'orderShot', 'deliveryShot', 'reviewShot', 'reviewLink', 'reviewer'],
  about: [
    'Used for checking: Order ID, Amount, Product Ordered, Order Screenshot, Delivery Screenshot, Review Screenshot and Review Link.',
    'Only shown, not used for checking: Reviewer Name.',
    'This file has no order date, so order dates are not compared.',
    'It has no Status, Type or Note column, so the checked Excel file adds them after the last column.',
    'The rows use the live campaign "Testbrand Men": its brand, Testbrand, is in the file\'s name.',
  ],
  used: true,
  uploadedAt: '2026-10-07T05:00:00.000Z',
};
const NEW_ID = 'r0000000000e1';
const newRow = {
  id: NEW_ID, source: 'sheet', row: 2, n: 1, hand: null, label: 'Row 1', orderId: '403-5000001-6000001', orderDate: '', orderDateRead: false, amount: '₹349', amountRead: true, product: 'Face Wash For Man - Amazon',
  cells: {},
  values: { 1: { text: 'Test Reviewer One', labels: [] } },
  shots: {
    order: shot({ text: DRIVE('1TestNewOrderRow01abcdefgh'), links: [DRIVE('1TestNewOrderRow01abcdefgh')], labels: [drive('1TestNewOrderRow01abcdefgh')] }),
    delivery: shot({ text: DRIVE('1TestNewDeliveryRow01abcdefgh'), links: [DRIVE('1TestNewDeliveryRow01abcdefgh')], labels: [drive('1TestNewDeliveryRow01abcdefgh')] }),
    reviewShot: shot({ text: DRIVE('1TestNewReviewRow01abcdefgh'), links: [DRIVE('1TestNewReviewRow01abcdefgh')], labels: [drive('1TestNewReviewRow01abcdefgh')], pictures: [pic(0, DRIVE('1TestNewReviewRow01abcdefgh'))] }),
    review: shot({ text: 'NA' }),
  },
  reviewKind: 'words', prev: null, last: null, final: null, finalSays: null, done: false, recheck: false,
};
const newLocal = (over = () => null) => fakeLocal((m, p, b) => over(m, p, b) ?? (m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ rows: [structuredClone(newRow)], sheet: structuredClone(newSheet) }) : standard(m, p, b)));

test('a file laid out differently: the table shows every column of the file, in its order and with its own heading, then Status, Type and Note; a column the file does not have never shows', async () => {
  const s = await mainPage(newLocal());
  const tree = s.draw();
  const heads = findAll(byId(tree, 'rows-table'), (n) => n.tag === 'th').map(textOf);
  assert.deepEqual(heads, ['Row', 'A: Reviewer Name', 'B: Order ID', 'C: Amount', 'D: Product Ordered', 'E: Order Screenshot', 'F: Delivery Screenshot', 'G: Review Screenshot', 'H: Review Link', 'I: Status', 'J: Type', 'K: Note', 'Check']);
  assert.ok(!heads.some((x) => /date/i.test(x)), 'no order date column');
  assert.deepEqual(cellsOf(byId(tree, `row-${NEW_ID}`)).slice(0, 12), ['1', 'Test Reviewer One', '403-5000001-6000001', '₹349', 'Face Wash For Man - Amazon', 'Google Drive', 'Google Drive', 'Google Drive', 'NA', 'Empty', 'Empty', 'Empty']);
  assert.equal(textOf(byId(tree, 'sheet-line')), 'Testbrand Amazon Review Data.xlsx, the Amazon Orders tab: 1 row.');
  // Under the upload line: what is used for checking, what the file does not have, and the campaign.
  assert.deepEqual(findAll(byId(tree, 'about-file'), (n) => n.tag === 'li').map(textOf), newSheet.about);
  assert.match(CSS, /\.about-file \{[^}]*font-size: 12px;/, 'small, quiet lines');
  // "Add a row" shows only the fields the file has.
  const labels = findAll(byId(tree, 'add'), (n) => n.tag === 'label' && !/\bsr-only\b/.test(n.attrs?.class ?? '')).map(textOf);
  assert.deepEqual(labels, ['Order ID', 'Amount', 'Product ordered', 'Purchase screenshot', 'Delivery screenshot', 'Review link', 'Review screenshot']);
  // The old file's columns show for the old file, and its form has every one of them.
  const old = await mainPage(fakeLocal(standard));
  assert.deepEqual(findAll(byId(old.draw(), 'add'), (n) => n.tag === 'label' && !/\bsr-only\b/.test(n.attrs?.class ?? '')).map(textOf), ['Order ID', 'Order date', 'Amount', 'Product ordered', 'Purchase screenshot', 'Delivery screenshot', 'Review link'], 'no review screenshot for a file that has none');
});

test("a row's page shows only the file's columns, under the file's own names; the comparison shows only the screenshots it has", async () => {
  const result = { ...structuredClone(pastResult), shotsHad: ['order'], comparison: [{ field: 'Order ID', sheet: '403-5000001-6000001', order: 'The same: 403-5000001-6000001', delivery: '', amazon: '', result: 'The same on the purchase screenshot.', ok: true }] };
  const s = await rowPageOf(newLocal((m, p) => (p === `/local/amazon/rows/${NEW_ID}` ? { row: structuredClone(newRow), result } : null)), NEW_ID);
  const tree = s.draw();
  const details = byId(tree, 'row-details');
  assert.deepEqual(findAll(details, (n) => n.tag === 'dt').map(textOf), ['Row', ...NEW_HEADS], 'in the file\'s order, with its own names; no order date');
  assert.equal(textOf(findAll(details, (n) => n.tag === 'dd')[1]), 'Test Reviewer One');
  assert.deepEqual(findAll(details, (n) => n.attrs?.class === 'user-shot').map((n) => textOf(findAll(n, (x) => x.tag === 'p')[0])), ['Review Screenshot'], "a picture is named by its column's name");
  assert.deepEqual(findAll(byId(tree, 'card-comparison'), (n) => n.tag === 'th' && n.attrs?.scope === 'col').map(textOf), ['Field', 'Sheet', 'Purchase screenshot', 'Amazon', 'Result'], 'no delivery screenshot column in the comparison of a file without one');
});

test('the Campaigns box: each campaign with its brand, live or ended, and under each product what was read from Amazon and when, or why it is not used', async () => {
  const s = await mainPage(fakeLocal(standard));
  const card = byId(s.draw(), 'campaigns');
  assert.ok(card, 'in place of the Products box');
  assert.equal(byId(s.draw(), 'products'), null);
  assert.match(textOf(byId(card, `campaign-${KC}`)), /^Test Clean Live Brand: Test Brand/);
  assert.match(textOf(byId(card, 'campaign-k0000000000a2')), /^Test Summer Ended/);
  assert.equal(textOf(byId(card, `product-${KC}-0`)), 'B0TESTKIT9Test Brand Monthly Home Cleaning Kit | Dishwash Liquid 2L Refill, Floor Cleaner 1L Brand: Test Brand. Other colours and sizes: 2 Litre, and 1 more. Read on 06-10-2026 at 10:31.');
  assert.match(textOf(byId(card, `product-${KC}-1`)), /Other Maker Glass Cleaner Spray, 500 ml Brand: Other Maker\. Amazon says this product's brand is "Other Maker", not "Test Brand", so this product is not used\.$/);
  assert.equal(textOf(byId(card, `product-${KC}-2`)), 'B0TESTFRS1Not read from Amazon yet.');
  assert.ok(byId(card, `read-${KC}`), '"Read the products again" when a product is not used or not read');
  assert.equal(byId(card, 'read-k0000000000a2'), null);
  assert.equal(byId(card, 'end-k0000000000a2'), null, 'an ended campaign cannot be ended again');
});

test('adding a campaign: its brand, its name, live or ended, and its products one per line; Save is greyed out while rows are checked', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  s.click('add-campaign');
  let form = byId(s.draw(), 'campaign-form');
  assert.deepEqual(findAll(form, (n) => n.tag === 'label').map(textOf), ['Brand', 'Campaign name', 'Live or ended', 'Products']);
  byId(s.draw(), 'campaign-brand').attrs.oninput({ target: { value: 'Test Brand' } });
  byId(s.draw(), 'campaign-name').attrs.oninput({ target: { value: 'Test Fresh' } });
  byId(s.draw(), 'campaign-products').attrs.oninput({ target: { value: 'B0TESTFRS1\nB0TESTFRS2' } });
  s.click('save-campaign');
  assert.equal(byId(s.draw(), 'campaign-products').attrs.disabled, true, 'nothing can be typed while it saves');
  await settle();
  assert.deepEqual(local.calls.find((c) => c.path === '/local/amazon/campaigns').body, { brand: 'Test Brand', name: 'Test Fresh', live: true, products: 'B0TESTFRS1\nB0TESTFRS2' });
  assert.equal(byId(s.draw(), 'campaign-form'), null, 'the form closes');
  assert.match(textOf(byId(s.draw(), 'campaigns')), /The campaign was saved\. Its products are being read from Amazon in the Live Amazon Browser, one page at a time\./);
  s.click(`change-${KC}`);
  assert.equal(byId(s.draw(), 'campaign-products').attrs.value, 'B0TESTKIT9\nhttps://www.amazon.in/dp/B0TESTOTH1\nB0TESTFRS1', 'Change opens the form with the campaign as it is');
  byId(s.draw(), 'campaign-live').attrs.onchange({ target: { value: 'ended' } });
  s.click('save-campaign');
  await settle();
  assert.deepEqual(local.calls.find((c) => c.path === `/local/amazon/campaigns/${KC}`).body.live, false);
  // Save waits while rows are being checked.
  const busyPage = await mainPage(fakeLocal(standard));
  busyPage.click('add-campaign');
  busyPage.state.all = { running: true, view: { steps: [], shots: [] } };
  assert.equal(byId(busyPage.draw(), 'save-campaign').attrs.disabled, true);
  assert.equal(textOf(byId(busyPage.draw(), 'save-waits')), 'Save can be pressed once the rows are checked.');
  busyPage.state.all = null;
  busyPage.state.account.data = { ...account, running: { kind: 'run', rowId: null } };
  assert.equal(byId(busyPage.draw(), 'save-campaign').attrs.disabled, true, 'rows checked in another window count too');
  const refusing = await mainPage(fakeLocal((m, p, b) => (m === 'POST' && p === '/local/amazon/campaigns' ? Promise.reject(new ApiError(400, 'Write the brand, for example Koparo.')) : standard(m, p, b))));
  refusing.click('add-campaign');
  refusing.click('save-campaign');
  await settle();
  assert.match(textOf(byId(refusing.draw(), 'campaigns')), /Write the brand, for example Koparo\./);
  assert.ok(byId(refusing.draw(), 'campaign-form'), 'what was typed stays to be put right');
});

test('a campaign ended, deleted (asked first) or its products read again; while products are read, the box follows them', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  s.click(`end-${KC}`);
  await settle();
  assert.ok(local.calls.some((c) => c.path === `/local/amazon/campaigns/${KC}/end`));
  assert.match(textOf(byId(s.draw(), 'campaigns')), /The campaign "Test Clean" has ended\. It is no longer used\./);
  s.click(`delete-${KC}`);
  assert.equal(s.asked.at(-1), 'Delete the campaign "Test Clean"? This cannot be undone.');
  await settle();
  assert.ok(local.calls.some((c) => c.path === `/local/amazon/campaigns/${KC}/delete`));
  const kept = await mainPage(fakeLocal(standard));
  kept.ctx.confirm = () => false;
  kept.click(`delete-${KC}`);
  await settle();
  assert.ok(!kept.ctx.local?.calls?.some?.((c) => c.path.endsWith('/delete')), 'Cancel deletes nothing');
  const again = fakeLocal(standard);
  const r = await mainPage(again);
  r.click(`read-${KC}`);
  await settle();
  assert.ok(again.calls.some((c) => c.path === `/local/amazon/campaigns/${KC}/read`));
  // The top bar's look every 2 seconds also fetches the campaigns while their products are read.
  const reading = fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/account' ? { ...account, running: { kind: 'campaign', rowId: null } } : standard(m, p, b)));
  const page = await mainPage(reading);
  const before = reading.calls.filter((c) => c.path === '/local/amazon/campaigns').length;
  page.timers.find((t) => t.ms === 2000).fn();
  await settle();
  assert.ok(reading.calls.filter((c) => c.path === '/local/amazon/campaigns').length > before);
  assert.equal(byId(page.draw(), `change-${KC}`).attrs.disabled, true, "a campaign's buttons wait while products are read");
});

test('there is no Duplicates section and no duplicate choice', async () => {
  const s = await mainPage(fakeLocal(standard));
  const tree = s.draw();
  for (const gone of ['duplicates', 'rule-first', 'rule-all']) assert.equal(byId(tree, gone), null, gone);
  assert.doesNotMatch(VIEW_SRC, /duplicate-rule/);
});

const notDone = (r) => ({ ...structuredClone(r), last: null, prev: null, final: null, finalSays: null, done: false, recheck: false });
const FINAL_OF = { verified: 'pass', ratingOnly: 'pass', needDriveAccess: 'manual', needAccess: 'manual' };
const doneAs = (r, type, typeKey, seconds) => ({ ...notDone(r), last: { checkId: 'c20261005070000cccccc', final: FINAL_OF[typeKey] ?? 'fail', status: FINAL_WORDS[FINAL_OF[typeKey] ?? 'fail'], type, typeKey, note: `A note for ${r.label}.`, at: '2026-10-05T07:00:00.000Z', seconds }, final: FINAL_OF[typeKey] ?? 'fail', done: true });
/** The counts at the top, as the four cards say them: each card's word and its number. */
const countsLine = (tree) => ['pass', 'fail', 'manual', 'none'].map((k) => `${textOf(byId(tree, `count-${k}-word`))}: ${textOf(byId(tree, `count-${k}-num`))}`).join(', ');
const STATUS = 8; // the Status cell of a row of the table: Row, then A to G, then H: Status

test('"Start checking": the row being checked is highlighted and says "Checking…", named in the live checking area beside the table with a link to it; each row’s result shows at once with how long it took; Stop, then the button carries on', async () => {
  const server = rows.map(notDone);
  const local = fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ rows: structuredClone(server) }) : standard(m, p, b)));
  const s = await mainPage(local);
  let tree = s.draw();
  assert.equal(textOf(byId(tree, 'start-checking')), 'Start checking', 'how many are left shows once, on the Not checked yet card');
  assert.equal(byId(tree, 'start-checking').attrs.disabled, false);
  s.click('start-checking');
  assert.deepEqual(local.calls.at(-1), { method: 'POST', path: '/local/amazon/check-all', body: {}, stream: true });
  const ctl = local.streamCtl;
  ctl.onEvent({ event: 'run-started', again: false, total: 4, done: 0, left: 4 });
  ctl.onEvent({ event: 'row', rowId: R2, label: 'Row 1', total: 4, done: 0, left: 4 });
  ctl.onEvent({ event: 'started', steps: STEP_NAMES });
  ctl.onEvent({ event: 'step', step: step(1, 'pass', 'No duplicates.') });
  tree = s.draw();
  assert.equal(textOf(byId(tree, 'start-checking')), 'Checking…');
  assert.equal(byId(tree, 'start-checking').attrs.disabled, true);
  assert.equal(byId(tree, `row-${R2}`).attrs.class, 'clickable current-row', 'the row being checked is highlighted');
  assert.deepEqual([cellsOf(byId(tree, `row-${R2}`))[STATUS], cellsOf(byId(tree, `row-${R2}`))[STATUS + 1]], ['Checking…', ''], 'said once, in its Status cell');
  assert.equal(textOf(byId(tree, 'run-progress')), 'Checking row 1: 0 of 4 rows done, 4 left. Show this row in the table', 'the row named by its number on the dashboard');
  assert.equal(findAll(tree, (n) => n.tag === 'progress').length, 1, 'one progress bar');
  assert.ok(byId(byId(tree, 'rows'), 'run'), 'the live checking area sits beside the table');
  assert.equal(findAll(byId(tree, 'rows'), (n) => n.attrs?.class === 'rows-layout with-live').length, 1);
  assert.ok(byId(byId(tree, 'run'), 'activity') && byId(byId(tree, 'run'), 'live'), "with the row's steps and the Live Amazon Browser");
  assert.match(textOf(byId(tree, 'step-1')), /passed/, 'the steps of that row show as they happen');
  const rowButtons = findAll(byId(tree, 'rows'), (n) => n.tag === 'button' && /^check-r/.test(n.attrs?.['data-id'] ?? ''));
  assert.equal(rowButtons.length, 4);
  assert.ok(rowButtons.every((b) => b.attrs.disabled === true), "each row's own button is greyed out");
  s.click('show-current');
  assert.deepEqual(s.revealed, [`row-${R2}:center`], 'the link scrolls the table to that row');

  // Row 1 is finished: its line and the counts change at once, before the next row starts.
  server[0] = doneAs(rows[0], 'Verified', 'verified', 42);
  ctl.onEvent({ event: 'row-done', rowId: R2, label: 'Row 1', status: 'Pass', type: 'Verified', note: 'A note for Row 1.', seconds: 42, rows: [structuredClone(server[0])], total: 4, done: 1, left: 3 });
  tree = s.draw();
  const two = cellsOf(byId(tree, `row-${R2}`));
  assert.match(two[STATUS], /^Pass.+took 42 seconds$/, 'its Status shows at once, with how long it took');
  assert.equal(two[STATUS + 2], 'A note for Row 1.');
  assert.equal(textOf(byId(tree, `took-${R2}`)), 'took 42 seconds');
  assert.equal(countsLine(tree), 'Pass: 1, Fail: 0, Needs Manual Staff Checking: 0, Not checked yet: 3');
  assert.equal(textOf(byId(tree, 'start-checking')), 'Checking…');
  ctl.onEvent({ event: 'row', rowId: R3, label: 'Row 2', total: 4, done: 1, left: 3 });
  assert.equal(textOf(byId(s.draw(), 'run-progress')), 'Checking row 2: 1 of 4 rows done, 3 left. Show this row in the table');

  // Stop: at once; the row it was on has no result.
  s.click('stop-all');
  await settle();
  tree = s.draw();
  assert.match(textOf(byId(tree, 'run')), /Stopped\. The rows finished before it keep their results\. The row it was on has no result, so it is the first one checked next time\./);
  assert.equal(textOf(byId(tree, 'start-checking')), 'Carry on checking');
  assert.equal(byId(tree, 'run-progress'), null);
  assert.equal(byId(tree, 'stop-all'), null, 'Stop shows only while checking');
  assert.equal(cellsOf(byId(tree, `row-${R3}`))[STATUS], 'Empty');

  // Pressed again: the server carries on from Row 2, and the rest finish.
  s.click('start-checking');
  assert.deepEqual(local.calls.at(-1).body, {}, 'the server knows where to carry on from');
  const more = local.streamCtl;
  for (const [i, type, key, secs] of [[1, 'Need Google Drive Access', 'needDriveAccess', 65], [2, 'Need Access', 'needAccess', 0], [3, 'Verified', 'verified', 30]]) {
    more.onEvent({ event: 'row', rowId: rows[i].id, label: rows[i].label });
    server[i] = doneAs(rows[i], type, key, secs);
    more.onEvent({ event: 'row-done', rowId: rows[i].id, rows: [structuredClone(server[i])] });
  }
  assert.equal(textOf(byId(s.draw(), `took-${R3}`)), 'took 1 minute 5 seconds');
  assert.equal(textOf(byId(s.draw(), `took-${R4}`)), 'took less than a second');
  more.onEvent({ event: 'run-done', checked: 3, pass: 1, fail: 0, manual: 2, total: 4, done: 4, left: 0 });
  more.end({ ok: true });
  await settle();
  tree = s.draw();
  assert.equal(textOf(byId(tree, 'start-checking')), 'All rows are checked');
  assert.equal(byId(tree, 'start-checking').attrs.disabled, true);
  assert.equal(byId(tree, 'all-checked'), null, 'the counts show once, on the cards');
  assert.equal(countsLine(tree), 'Pass: 2, Fail: 0, Needs Manual Staff Checking: 2, Not checked yet: 0');
});

test('a pause names the button; the same button carries on from the row it paused at, and there is no "Go on" button', async () => {
  const local = fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ rows: [structuredClone(rows[0]), notDone(rows[1]), notDone(rows[2]), notDone(rows[3])] }) : standard(m, p, b)));
  const s = await mainPage(local);
  assert.equal(textOf(byId(s.draw(), 'start-checking')), 'Carry on checking', 'once some rows are done');
  s.click('start-checking');
  const ctl = local.streamCtl;
  ctl.onEvent({ event: 'row', rowId: R3, label: 'Row 2' });
  ctl.onEvent({ event: 'paused', kind: 'captcha', says: PAUSE_SAYS.captcha, rowId: R3, label: 'Row 2' });
  ctl.end({ ok: true });
  await settle();
  const tree = s.draw();
  assert.equal(textOf(byId(tree, 'paused')), 'Paused at row 2. Amazon showed a robot check. This dashboard never answers a robot check. Press "Carry on checking" when you are ready. That row has no result yet.');
  assert.equal(byId(tree, 'go-on'), null);
  assert.equal(textOf(byId(tree, 'start-checking')), 'Carry on checking');
  s.click('start-checking');
  assert.deepEqual(local.calls.at(-1), { method: 'POST', path: '/local/amazon/check-all', body: {}, stream: true }, 'the server starts at the first row with no result: the paused row');
});

test('each row’s own button says "Check" or "Check again" and checks that row only', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  const tree = s.draw();
  assert.deepEqual([R2, R3, R4, H1].map((id) => textOf(byId(tree, `check-${id}`))), ['Check again', 'Check again', 'Check again', 'Check'], 'a Status in the file is a result too');
  s.click(`check-${H1}`);
  assert.deepEqual(local.calls.at(-1), { method: 'POST', path: `/local/amazon/rows/${H1}/check`, body: {}, stream: true });
  local.streamCtl.end({ ok: false, aborted: true });
  await settle();
  assert.equal(s.state.check.notice.text, 'The check was stopped, and nothing was saved for it. Press Check to check this row again.');
  assert.equal(textOf(byId((await rowPageOf(fakeLocal(standard), R2)).draw(), 'check')), 'Check again');
  assert.equal(textOf(byId((await rowPageOf(fakeLocal(standard), R4)).draw(), 'check')), 'Check again');
});

test('"Check every row again" asks first, then every result goes and the rows are checked from the first one', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  s.ctx.confirm = (text) => (s.asked.push(text), false);
  s.click('check-every-row');
  assert.deepEqual(s.asked, ['This checks all 4 rows again and replaces their results. Go on?']);
  assert.equal(local.calls.some((c) => c.stream), false, 'nothing starts without a yes');
  s.ctx.confirm = () => true;
  s.click('check-every-row');
  assert.deepEqual(local.calls.at(-1), { method: 'POST', path: '/local/amazon/check-all', body: { again: true }, stream: true });
  local.streamCtl.onEvent({ event: 'run-started', again: true, total: 4, done: 0, left: 4 });
  local.streamCtl.onEvent({ event: 'row', rowId: R2, label: 'Row 1' });
  const tree = s.draw();
  assert.equal(countsLine(tree), 'Pass: 0, Fail: 0, Needs Manual Staff Checking: 0, Not checked yet: 4');
  assert.equal(cellsOf(byId(tree, `row-${R4}`))[STATUS], 'Empty', 'the Status from the file no longer shows either');
  assert.equal(cellsOf(byId(tree, `row-${R2}`))[STATUS], 'Checking…');
  assert.equal(textOf(byId(tree, 'run-progress')), 'Checking row 1: 0 of 4 rows done, 4 left. Show this row in the table');
  assert.equal(byId(tree, 'check-every-row').attrs.disabled, true);
});

test("one row's page: its Status large at the top with its reason, the Type and Note, what the sheet says, what was read, the comparison, and the steps", async () => {
  const local = fakeLocal(standard);
  const s = await rowPageOf(local);
  const tree = s.draw();
  assert.match(textOf(tree), /Row 1: order ID 403-1000002-2000002/, 'its number on the dashboard, and the order ID in full');
  assert.deepEqual([textOf(byId(tree, 'final-word')), textOf(byId(tree, 'final-says'))], ['Pass', PASS_SAYS], 'the Status and its reason at the top');
  assert.match(byId(tree, 'final-banner').attrs.class, /\bfinal-banner-pass\b/);
  assert.match(CSS, /\.final-big \{[^}]*font-size: 24px;/, 'large');
  assert.equal(textOf(findAll(byId(tree, 'card-result'), (n) => n.tag === 'h3')[0]), 'Type and Note', 'the Status is not said twice');
  assert.match(textOf(byId(tree, 'row-details')), /RowRow 1Order ID/, 'the row, by its number on the dashboard');
  const fromFile = (await rowPageOf(fakeLocal((m, p, b) => (m === 'GET' && p === `/local/amazon/rows/${R4}` ? { row: structuredClone(rows[2]), result: null } : standard(m, p, b))), R4)).draw();
  assert.deepEqual([textOf(byId(fromFile, 'final-word')), textOf(byId(fromFile, 'final-says'))], ['Needs Manual Staff Checking', 'From the file: the uploaded file already had a Status for this row.'], 'a Status from the file, as one of the three words');
  assert.match(textOf(byId(fromFile, 'row-details')), /In the file before: Needs Manual Staff Checking, Need Access\. Checked by hand on Monday\./, 'never Unverified');
  assert.ok(findAll(byId(tree, 'final-word'), (n) => n.attrs?.class === 'icon icon-pass').length === 1, 'with its icon');
  assert.equal(byId(amazon.render(s.ctx), 'account'), null, 'the login is in the top bar, not on the page');
  const notYet = (await rowPageOf(fakeLocal((m, p, b) => (m === 'GET' && p === `/local/amazon/rows/${R4}` ? { row: { ...structuredClone(rows[2]), prev: null, final: null, done: false }, result: null } : m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ rows: [structuredClone(rows[0]), structuredClone(rows[1]), { ...structuredClone(rows[2]), prev: null, final: null, done: false }, structuredClone(rows[3])] }) : standard(m, p, b))), R4)).draw();
  assert.deepEqual([textOf(byId(notYet, 'final-word')), textOf(byId(notYet, 'final-says'))], ['Not checked yet', 'Not checked yet.']);
  assert.equal(textOf(byId(tree, 'result-type')), 'Verified');
  assert.equal(textOf(byId(tree, 'result-note')), pastResult.note);
  assert.doesNotMatch(textOf(byId(tree, 'row-details')), /Cell E2/, 'no cell names');
  assert.match(textOf(byId(tree, 'row-details')), /Google Drive/, 'each link by where it goes');
  assert.match(textOf(byId(tree, 'card-order')), /403-1000002-2000002/);
  assert.match(textOf(byId(tree, 'card-delivery')), /Delivered 22 July/);
  assert.match(textOf(byId(tree, 'card-amazon')), /One capful cleans the whole kitchen floor\./);
  const heads = findAll(byId(tree, 'card-comparison'), (n) => n.tag === 'th' && n.attrs?.scope === 'col').map(textOf);
  assert.deepEqual(heads, ['Field', 'Sheet', 'Purchase screenshot', 'Delivery screenshot', 'Amazon', 'Result']);
  const fields = findAll(byId(tree, 'card-comparison'), (n) => n.tag === 'th' && n.attrs?.scope === 'row').map(textOf);
  assert.deepEqual(fields, ['Order ID', 'Order date', 'Amount', 'Product', 'Delivered', 'Rating', 'Written review', 'Live and public']);
  const firstRow = findAll(byId(tree, 'card-comparison'), (n) => n.tag === 'tr')[1];
  assert.deepEqual(findAll(firstRow, (n) => n.tag === 'td').map(textOf), ['403-1000002-2000002', 'The same: 403-1000002-2000002', 'The same: 403-1000002-2000002', '', 'The same on both screenshots.'], 'each screenshot: the same, different or not shown');
  assert.match(textOf(byId(tree, 'card-delivery')), /Order dates/, 'the delivery screenshot\'s dates and amounts are read too');
  assert.equal(findAll(byId(tree, 'activity'), (n) => n.attrs?.class?.startsWith('step step-')).length, 10);
  assert.ok(byId(tree, 'live-shot'), 'the pictures of the Live Amazon Browser');
  assert.ok(byId(tree, 'delete-row'));
  assert.ok(local.calls.some((c) => c.image && c.path === `/local/amazon/rows/${R2}/small/order/0`), 'the row page shows its small pictures');
  s.click(`row-thumb-order-${R2}-0`);
  await settle();
  assert.equal(byId(s.draw(), 'big-img').attrs.src, `blob:/local/amazon/rows/${R2}/picture/order/0`);
  s.click('close-big');
  assert.ok(local.revoked.includes(`blob:/local/amazon/rows/${R2}/picture/order/0`), 'the enlarged picture is let go on Close');
});

test('one check, live: steps marked in place, "not needed", a pause said plainly, and nothing saved for a paused row', async () => {
  const local = fakeLocal(standard);
  const s = await rowPageOf(local);
  s.click('check');
  const ctl = local.streamCtl;
  ctl.onEvent({ event: 'started', steps: STEP_NAMES });
  ctl.onEvent({ event: 'step', step: step(1, 'pass', 'No duplicates.') });
  ctl.onEvent({ event: 'step', step: step(8, 'not-needed', 'A rating only needs no search.') });
  ctl.onEvent({ event: 'action', says: 'Opening the review link in the Live Amazon Browser' });
  let tree = s.draw();
  assert.equal(textOf(byId(tree, 'current-action')), 'Opening the review link in the Live Amazon Browser');
  assert.match(textOf(byId(tree, 'step-8')), /not needed/);
  ctl.onEvent({ event: 'step', step: step(6, 'fail', 'Amazon asked to log in, so the check paused here.') });
  ctl.onEvent({ event: 'paused', kind: 'signin', says: 'Amazon logged you out. Log in again in the Live Amazon Browser, then press Check.' });
  ctl.end({ ok: true });
  await settle();
  tree = s.draw();
  assert.match(textOf(tree), /The check paused, and nothing was saved for this row\. Amazon logged you out\. Log in again in the Live Amazon Browser, then press Check\./);
});

test('one Download button offers "The checked Excel file" and "The results only" (Row, Order ID, Status, Type and Note); it sits with Start checking', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  s.click('download-csv');
  const csv = s.downloads[0].data;
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).trim().split('\r\n');
  assert.equal(lines[0], '"Row","Order ID","Status","Type","Note"');
  assert.equal(lines[1], `"1","403-1000002-2000002","Pass","Verified","${rows[0].last.note}"`, 'the row by its number on the dashboard; the Status as one of the three words; the Note in full');
  assert.equal(lines[3], '"3","403-1000004-2000004","Needs Manual Staff Checking","Need Access","Checked by hand on Monday."', 'a Status from the file, as one of the three words');
  assert.equal(lines[4], '"By hand #1","403-7777777-7777777","","",""', 'a row not checked yet has no Status');
  assert.doesNotMatch(csv, /Verified"?,"Verified|Unverified/, 'never Unverified, and Verified only as a Type');
  const actions = findAll(byId(s.draw(), 'overview'), (n) => n.tag === 'button' && ['start-checking', 'check-every-row', 'download-excel', 'download-csv'].includes(n.attrs?.['data-id'])).map((n) => n.attrs['data-id']);
  assert.deepEqual(actions, ['start-checking', 'check-every-row', 'download-excel', 'download-csv'], 'the main buttons, in one row with the Status cards');
  // Only the most important button of this part is yellow.
  assert.deepEqual(findAll(byId(s.draw(), 'overview'), (n) => /\bbtn-primary\b/.test(n.attrs?.class ?? '')).map((n) => n.attrs['data-id']), ['start-checking']);
  assert.doesNotMatch(findAll(byId(s.draw(), 'download'), (n) => n.tag === 'summary')[0].attrs.class, /btn-primary|btn-dark/, 'Download is quieter');
  const menu = byId(s.draw(), 'download');
  assert.deepEqual([menu.tag, textOf(findAll(menu, (n) => n.tag === 'summary')[0])], ['details', 'Download'], 'one Download button');
  assert.deepEqual(findAll(menu, (n) => n.tag === 'strong').map(textOf), ['The checked Excel file', 'The results only']);
  s.click('download-excel');
  await settle();
  assert.ok(local.calls.some((c) => c.blob && c.path === '/local/amazon/sheet/checked.xlsx'));
  assert.deepEqual(s.downloads[1], { name: 'July orders checked 2026-10-05.xlsx', data: 'the bytes', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const csvOnly = await mainPage(fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ sheet: { ...structuredClone(sheet), kind: 'csv' } }) : standard(m, p, b))));
  assert.equal(byId(csvOnly.draw(), 'download-excel').attrs.disabled, true, 'a CSV upload has no Excel file to fill in');
});

test('Delete row asks first; Remove all rows asks with the number, counting the rows of the old layout, which the screen also mentions', async () => {
  const local = fakeLocal(standard);
  const page = await rowPageOf(local);
  page.click('delete-row');
  await settle();
  assert.equal(page.asked.at(-1), 'Delete this row and its pictures from this dashboard? This cannot be undone.');
  assert.ok(local.calls.some((c) => c.path === `/local/amazon/rows/${R2}/remove`));
  assert.deepEqual(page.went.at(-1), 'amazon');
  assert.deepEqual(page.revealed, ['rows']);
  const old = fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ oldRows: 2 }) : standard(m, p, b)));
  const s = await mainPage(old);
  assert.equal(textOf(byId(s.draw(), 'old-rows')), '2 rows were made with the old layout and cannot be checked. "Remove all rows", under "More", removes them.');
  const more = byId(s.draw(), 'more');
  assert.equal(more.tag, 'details', '"More" starts closed');
  assert.equal(more.attrs.open, undefined);
  assert.ok(byId(more, 'remove-all') && byId(more, 'add'), '"Add a row by hand" and "Remove all rows" are under "More"');
  s.click('remove-all');
  await settle();
  assert.equal(s.asked.at(-1), 'Remove all 6 rows from this dashboard, with their pictures? This removes the rows from the sheet, the rows added by hand, and any rows made with the old layout. This cannot be undone.');
  assert.deepEqual(old.calls.find((c) => c.path === '/local/amazon/rows/remove-all').body, { expected: 6 });
  assert.match(textOf(byId(s.draw(), 'rows-notice')), /^Removed 6 rows and their pictures\./);
});

test('Add a row by hand: the same fields as the sheet, each picture as a file or a link', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  byId(s.draw(), 'add-orderId').attrs.oninput({ target: { value: '403-7777777-7777777' } });
  byId(s.draw(), 'add-delivery-link').attrs.oninput({ target: { value: 'https://storage.googleapis.com/tryboxs-screenshots/test/x.png' } });
  const file = new File([Buffer.from('png')], 'order.png', { type: 'image/png' });
  byId(s.draw(), 'add-order-file').attrs.onchange({ target: { files: [file] } });
  s.click('add-row');
  await settle();
  const sent = local.calls.find((c) => c.method === 'POST' && c.path === '/local/amazon/rows').form;
  assert.equal(sent.get('orderId'), '403-7777777-7777777');
  assert.equal(sent.get('deliveryLink'), 'https://storage.googleapis.com/tryboxs-screenshots/test/x.png');
  assert.equal(sent.get('order').name, 'order.png');
  assert.equal(s.went.at(-1), 'amazon/r0000000000e6');
});

test('the calm, compact look: always light, one font kept in the project, nothing from the internet, nothing smaller than 12 pixels, the full width of the window', () => {
  const shared = readFileSync(join(ROOT, 'styles.css'), 'utf8');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.doesNotMatch(shared + CSS, /prefers-color-scheme/, 'no dark look, even when the computer is set to dark mode');
  assert.match(shared, /color-scheme: light;/);
  assert.match(html, /<meta name="color-scheme" content="light">/);
  assert.match(shared, /--bg: #faf6ef;/, 'a cream page');
  assert.match(shared, /--yellow: #f6cf5f;/, 'soft yellow for the most important button');
  assert.match(shared, /--text: #2a2017;/, 'deep brown text');
  assert.match(shared, /--font: "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui,/, "one font family, the computer's own font if it cannot be read");
  for (const w of [400, 500, 600, 700]) {
    assert.match(shared, new RegExp(`@font-face \\{ font-family: "Poppins"; src: url\\("assets/poppins-${w}\\.ttf"\\)`), `weight ${w}`);
    assert.ok(statSync(join(ROOT, 'assets', `poppins-${w}.ttf`)).size > 100000, `the font file for weight ${w} is in the project`);
  }
  assert.match(readFileSync(join(ROOT, 'assets', 'poppins-licence.txt'), 'utf8'), /SIL Open Font License/, 'with its free licence');
  for (const [name, text] of [['styles.css', shared], ['views/amazon.css', CSS], ['index.html', html]]) {
    assert.doesNotMatch(text.replace(/<meta http-equiv[^>]*>/, ''), /url\(\s*["']?(?:https?:)?\/\/|@import|<link[^>]+href="(?:https?:)?\/\//i, `${name} loads nothing from the internet`);
  }
  // Sizes: body 14, the table 13, small notes and labels 12 (never smaller), section titles 16, the page title 20.
  const sizes = [...(shared + CSS).matchAll(/font-size: ([\d.]+)(px|rem|em)/g)].map(([, n, unit]) => (unit === 'px' ? Number(n) : Number(n) * 16));
  assert.ok(sizes.length > 50 && sizes.every((n) => n >= 12), `nothing smaller than 12 pixels: ${sizes.filter((n) => n < 12)}`);
  assert.match(shared, /body \{[^}]*font: 14px\/1\.5 var\(--font\);/, 'body text 14 pixels');
  assert.match(shared, /table \{[^}]*font-size: 13px;/, 'the table 13 pixels');
  assert.match(shared, /\.small \{ font-size: 12px; \}/, 'small notes 12 pixels');
  assert.match(shared, /h1 \{ font-size: 20px;[^}]*\}\nh2 \{ font-size: 16px; \}/, 'page title 20 pixels, section titles 16');
  // Buttons about 36 pixels tall, small ones about 30; a slim top bar about 56 pixels tall.
  assert.match(shared, /\.btn \{[^}]*height: 36px;[^}]*border-radius: var\(--radius-sm\);/);
  assert.match(shared, /\.btn-small \{ height: 30px;/);
  assert.match(shared, /\.topbar \{[^}]*min-height: 56px;/);
  // Compact Status cards: about 80 pixels tall, numbers about 26.
  assert.match(CSS, /\.final-card \{[^}]*min-height: 80px;/);
  assert.match(CSS, /\.final-card-num \{ font-size: 26px;/);
  // Corners about 12 pixels on cards and 8 on buttons and fields; very light shadows; 16 pixels inside cards.
  assert.match(shared, /--radius: 12px;\n  --radius-sm: 8px;/);
  assert.match(shared, /--shadow: 0 1px 2px rgba\(74, 52, 28, \.04\);/);
  assert.match(shared, /\.card \{[^}]*border-radius: var\(--radius\);[^}]*padding: 16px;[^}]*box-shadow: var\(--shadow\);/);
  // Spacing in steps of 4 and 8 pixels.
  // (The words kept only for screen readers use the usual one-pixel rule.)
  const gaps = [...(shared + CSS).replace(/\.sr-only \{[^}]*\}/g, '').matchAll(/\b(?:gap|margin(?:-(?:top|bottom|left|right))?|padding(?:-(?:top|bottom|left|right))?): ([^;]+);/g)].flatMap((m) => [...m[1].matchAll(/(\d+)px/g)].map((x) => Number(x[1])));
  assert.ok(gaps.length > 100 && gaps.every((n) => n % 2 === 0 && n <= 48), `spacing in small even steps: ${[...new Set(gaps.filter((n) => n % 2 || n > 48))]}`);
  // Folded boxes open and close smoothly; nothing moves much.
  assert.match(CSS, /\.fold::details-content \{[^}]*transition: block-size \.22s ease/);
  assert.match(shared, /\.page \{ max-width: none;/, 'the full width, with small margins');
  // Every icon the screen draws has its line icon, a file in the project.
  const used = new Set([...(VIEW_SRC + readFileSync(join(ROOT, 'app.js'), 'utf8')).matchAll(/icon\(h, '([a-z]+)'/g)].map((m) => m[1]).concat(['pass', 'fail', 'manual', 'clock', 'spinner', 'warn', 'error', 'info']));
  assert.ok(used.size > 20, `${used.size} icons`);
  for (const name of used) {
    assert.match(shared, new RegExp(`\\.icon-${name} \\{ -webkit-mask-image: url\\("assets/icon-${name}\\.svg"\\)`), `the icon ${name} is drawn`);
    assert.match(readFileSync(join(ROOT, 'assets', `icon-${name}.svg`), 'utf8'), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24" fill="none"/, `the icon ${name} is a line icon in the project`);
  }
  // Messages are soft coloured boxes, each with its icon.
  for (const tone of ['good', 'error', 'warn', 'info']) assert.match(shared, new RegExp(`\\.notice-${tone} \\{ background: var\\(--`), tone);
  assert.match(shared, /\.notice::before \{[^}]*mask: url\("assets\/icon-info\.svg"\)/);
  // The Status always in its three colours, with its word.
  assert.match(CSS, /\.final-pass \{[^}]*color: var\(--good\)/);
  assert.match(CSS, /\.final-fail \{[^}]*color: var\(--bad\)/);
  assert.match(CSS, /\.final-manual \{[^}]*color: var\(--warn\)/);
  // Bold only for headings and the Status words.
  const bold = [...(shared + CSS).matchAll(/([^{}]+)\{[^}]*font-weight: (600|700)/g)].map((m) => m[1].trim().split('\n').pop());
  assert.ok(bold.every((sel) => /^(h1|h2|h3|h4|h1, h2, h3, h4|th|\.brand-name|\.final|\.final-card-label|\.final-card-num|\.final-big|@font-face.*)/.test(sel)), `bold only for headings and the Status words: ${bold.join(' | ')}`);
});

test('from top to bottom: the top bar with the marketplace tabs and the login, the upload, the Campaigns box, the Status cards with the main buttons, the table, then "More"; no "Final result" anywhere', async () => {
  const s = await mainPage(fakeLocal(standard));
  const order = findAll(s.draw(), (n) => ['market', 'account', 'sheet', 'campaigns', 'overview', 'rows', 'more'].includes(n.attrs?.['data-id'])).map((n) => n.attrs['data-id']);
  assert.deepEqual(order, ['market', 'account', 'sheet', 'campaigns', 'overview', 'rows', 'more']);
  for (const gone of ['results', 'duplicates', 'counts-line', 'run-line', 'all-checked', 'filter-status', 'stop-run']) assert.equal(byId(s.draw(), gone), null, `no "${gone}"`);
  assert.ok(byId(s.draw(), 'filter-final'), 'the Status box, next to the Type box');
  assert.doesNotMatch(VIEW_SRC, /['"`][^'"`\n]*Final result[^'"`\n]*['"`]/, 'no "Final result" in the screen\'s words');
  assert.doesNotMatch(readFileSync(join(ROOT, 'README.md'), 'utf8'), /Final result/i, 'nor in the README');
});

test('nothing shown twice: one place for the Status counts and filter, one progress line, one Download button, one Stop button', async () => {
  const s = await mainPage(fakeLocal(standard));
  s.click('start-checking');
  s.ctx.local.streamCtl.onEvent({ event: 'run-started', total: 4, done: 0, left: 4 });
  s.ctx.local.streamCtl.onEvent({ event: 'row', rowId: H1, label: 'By hand #1' });
  const tree = s.draw();
  const count = (test) => findAll(tree, test).length;
  assert.equal(count((n) => n.attrs?.role === 'group' && n.attrs?.['data-id'] === 'counts'), 1, 'the four cards, once');
  assert.equal(count((n) => /^count-(pass|fail|manual|none)$/.test(n.attrs?.['data-id'] ?? '')), 4);
  assert.equal(count((n) => n.tag === 'progress'), 1, 'one progress bar');
  assert.equal(count((n) => n.attrs?.['data-id'] === 'run-progress'), 1, 'one progress line');
  assert.equal(count((n) => n.tag === 'summary' && textOf(n) === 'Download'), 1, 'one Download button');
  assert.equal(count((n) => n.tag === 'button' && textOf(n) === 'Stop'), 1, 'one Stop button');
  assert.equal(count((n) => n.attrs?.['data-id'] === 'sheet-line'), 1, "the file's name and rows, once");
});

test('a file dropped anywhere on the main page is uploaded at once; held over the page, the upload line lights up and says so; a row\'s page leaves it', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  const zone = () => byId(s.draw(), 'drop');
  amazon.dragging(s.ctx, true);
  assert.match(zone().attrs.class, /\bdrop-over\b/, 'it lights up while a file is held over the page');
  assert.equal(textOf(byId(s.draw(), 'upload-doing')), 'Drop the file anywhere on this page to upload it.');
  amazon.dragging(s.ctx, false);
  assert.doesNotMatch(zone().attrs.class, /\bdrop-over\b/);
  assert.equal(textOf(byId(s.draw(), 'sheet-line')), 'July orders.xlsx, the Amazon tab: 3 rows.');
  amazon.dropFile(s.ctx, aFile('August orders.xlsx'));
  await settle();
  assert.equal(s.asked.length, 1, 'asked once');
  assert.equal(local.calls.find((c) => c.path === '/local/amazon/sheet').form.get('file').name, 'August orders.xlsx');
  assert.equal(textOf(byId(s.draw(), 'upload-done')), 'Uploaded');
  assert.equal(textOf(byId(s.draw(), 'replace-file')), 'Replace file', 'once it is in, the slim line again');
  const row = await rowPageOf(fakeLocal(standard));
  amazon.dropFile(row.ctx, aFile('August orders.xlsx'));
  await settle();
  assert.ok(!row.ctx.local.calls.some((c) => c.path === '/local/amazon/sheet'), "a row's page does not upload");
  const app = readFileSync(join(ROOT, 'app.js'), 'utf8');
  assert.match(app, /window\.addEventListener\('drop'[\s\S]*?s\.dropFile\(ctxFor\(s\), file\)/, 'app.js passes a file dropped anywhere on the page to the screen');
  assert.match(app, /window\.addEventListener\('dragover', \(e\) => \{\n\s+e\.preventDefault\(\);/, 'and never lets it open in the tab instead');
  const empty = await mainPage(fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ rows: [], sheet: null }) : standard(m, p, b))));
  assert.equal(findAll(byId(empty.draw(), 'drop'), (n) => n.tag === 'label' && n.attrs?.for === 'sheet-file').map(textOf)[0], 'Choose file', 'no file in yet: the large area');
});

test('the Campaigns box folds shut: closed to start with once there are campaigns, open while one is added, and it remembers being opened', async () => {
  const s = await mainPage(fakeLocal(standard));
  const box = () => byId(s.draw(), 'campaigns');
  assert.deepEqual([box().tag, box().attrs.open], ['details', false]);
  assert.match(textOf(findAll(box(), (n) => n.tag === 'summary')[0]), /^Campaigns1 live, 1 ended$/, 'folded, it still says how many are live');
  box().attrs.ontoggle({ target: { open: true } });
  assert.equal(box().attrs.open, true);
  box().attrs.ontoggle({ target: { open: false } });
  s.click('add-campaign');
  assert.equal(box().attrs.open, true, 'adding a campaign opens it');
  const none = await mainPage(fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ campaigns: [] }) : standard(m, p, b))));
  assert.equal(byId(none.draw(), 'campaigns').attrs.open, true, 'open when there is no campaign yet');
});

test('a problem in settings.json is said at the top, and "Start checking" waits until it is put right', async () => {
  const s = await mainPage(fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ settingsProblem: 'The settings file has a setting this dashboard does not know: "x". Check its spelling.' }) : standard(m, p, b))));
  assert.equal(textOf(byId(s.draw(), 'settings-problem')), 'The settings file has a problem, so nothing can be checked until it is put right. The settings file has a setting this dashboard does not know: "x". Check its spelling.');
  assert.equal(byId(s.draw(), 'start-checking').attrs.disabled, true);
});

test('reset stops what runs and lets go of every picture; render never throws on missing fields', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  s.click('start-checking');
  amazon.reset(s.ctx);
  assert.equal(local.streamCtl.signal.aborted, true);
  assert.deepEqual(s.state.thumbs, {});
  const odd = fakeLocal((m, p) => (m === 'GET' && p === '/local/amazon/rows' ? { rows: [{ id: 'r000000000099' }, null, { id: 'r000000000098', shots: { order: { pictures: [null] } }, last: {} }], sheet: { tabs: null }, campaigns: null, types: null } : standard(m, p)));
  const weird = await mainPage(odd);
  assert.doesNotThrow(() => weird.draw());
  const blankPage = screen(fakeLocal(() => ({})), 'r000000000097');
  blankPage.state.open = { id: 'r000000000097', loading: false, row: {}, result: { steps: [null, {}], comparison: [{}], order: {}, delivery: {}, reviewPicture: {}, amazon: {} }, shots: [] };
  assert.doesNotThrow(() => blankPage.draw());
});

// ---- what the review of the screen found, each now tested ----

test('a row’s page is fetched again when checking finishes that row, and checking is never hidden behind an older single check', async () => {
  const local = fakeLocal(standard);
  const s = await rowPageOf(local);
  s.click('check');
  local.streamCtl.end({ ok: false, aborted: true });
  await settle();
  assert.ok(s.state.check, 'the stopped single check is still shown');
  // "Carry on checking" is pressed on the main page, while the row's page stays open.
  byId(amazon.render({ ...s.ctx, route: '' }), 'start-checking').attrs.onclick({ stopPropagation() {} });
  assert.equal(s.state.check, null, 'it lets go of the older single check');
  const ctl = local.streamCtl;
  ctl.onEvent({ event: 'run-started', total: 4 });
  ctl.onEvent({ event: 'row', index: 1, total: 4, rowId: R2, label: 'Row 2' });
  ctl.onEvent({ event: 'action', says: 'Reading the purchase screenshot' });
  assert.equal(textOf(byId(s.draw(), 'current-action')), 'Reading the purchase screenshot', "the row page shows the run's live view");
  const before = local.calls.filter((c) => c.path === `/local/amazon/rows/${R2}`).length;
  ctl.onEvent({ event: 'row-done', index: 1, total: 4, rowId: R2, status: 'Verified', type: 'Verified', note: 'x' });
  await settle();
  assert.equal(local.calls.filter((c) => c.path === `/local/amazon/rows/${R2}`).length, before + 1, 'the open row is fetched again');
});

test('a step picture that arrives after checking has moved on to the next row is let go', async () => {
  let release;
  const slow = new Promise((r) => (release = r));
  const local = fakeLocal(standard);
  local.image = async (path) => {
    local.calls.push({ method: 'GET', path, image: true });
    if (path.endsWith('/steps/10')) await slow;
    return `blob:${path}`;
  };
  const s = await mainPage(local);
  s.click('start-checking');
  const ctl = local.streamCtl;
  ctl.onEvent({ event: 'row', index: 1, total: 4, rowId: R2, label: 'Row 2' });
  ctl.onEvent({ event: 'step', step: step(10, 'pass', 'Verified: Verified.', '/local/amazon/checks/c1/steps/10') });
  ctl.onEvent({ event: 'row', index: 2, total: 4, rowId: R3, label: 'Row 3' });
  release();
  await settle();
  assert.ok(local.revoked.includes('blob:/local/amazon/checks/c1/steps/10'), 'never kept on a view no longer shown');
  assert.deepEqual(s.state.all.view.shots, []);
});

test('a connection that breaks part way is always said: while the rows are checked (the button carries on), and a check whose result was not saved', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  s.click('start-checking');
  local.streamCtl.onEvent({ event: 'run-started', total: 4 });
  local.streamCtl.onEvent({ event: 'row', rowId: H1, label: 'By hand #1' });
  local.streamCtl.end({ ok: true });
  await settle();
  assert.match(textOf(byId(s.draw(), 'run')), /The connection to the dashboard's server broke before checking finished\. The rows finished before it keep their results\. Press "Carry on checking" to go on from the row it was on\./);
  s.click('start-checking');
  assert.deepEqual(local.calls.at(-1).body, {});
  local.streamCtl.end({ ok: false, aborted: true });
  await settle();
  const page = await rowPageOf(fakeLocal(standard));
  page.click('check');
  const ctl = page.ctx.local.streamCtl;
  ctl.onEvent({ event: 'done', result: { ...structuredClone(pastResult), type: 'Duplicate', status: 'Unverified', note: 'Not saved.' } });
  ctl.onEvent({ event: 'failed', says: 'Something went wrong on this computer part way through the check. Nothing was saved for it; press Check again.' });
  ctl.end({ ok: true });
  await settle();
  assert.match(textOf(page.draw()), /Nothing was saved for it; press Check again\./);
  assert.notEqual(textOf(byId(page.draw(), 'result-type')), 'Duplicate', 'a result that was not saved is not shown as the row’s');
});

test('uploading another file makes a pause of the old rows go; a pause before the first row says so', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  s.click('start-checking');
  local.streamCtl.onEvent({ event: 'row', rowId: H1, label: 'By hand #1' });
  local.streamCtl.onEvent({ event: 'paused', kind: 'signin', says: 'Amazon logged you out.', rowId: H1, label: 'By hand #1' });
  local.streamCtl.end({ ok: true });
  await settle();
  assert.equal(textOf(byId(s.draw(), 'paused')), 'Paused at the row added by hand (#1). Amazon logged you out. That row has no result yet.');
  byId(s.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile('next.xlsx')] } });
  await settle();
  assert.equal(byId(s.draw(), 'paused'), null, 'a pause of rows that were replaced goes');
  const early = await mainPage(fakeLocal(standard));
  early.click('start-checking');
  early.ctx.local.streamCtl.onEvent({ event: 'run-started', total: 4, done: 0, left: 4 });
  early.ctx.local.streamCtl.onEvent({ event: 'action', says: 'Reading the products of the campaign "Test Clean" from Amazon: 1 of 1' });
  assert.equal(textOf(byId(early.draw(), 'run-progress')), 'Reading the products of the campaign "Test Clean" from Amazon: 1 of 1', 'what it is doing before the first row');
  early.ctx.local.streamCtl.onEvent({ event: 'paused', kind: 'signin', says: 'Amazon logged you out.', total: 4, done: 0, left: 4 });
  early.ctx.local.streamCtl.end({ ok: true });
  await settle();
  assert.equal(textOf(byId(early.draw(), 'paused')), "Paused before the first row, while the campaigns' products were read from Amazon. Amazon logged you out.");
});

test('every picture of the open row loads, even after the grid reloads; "1 row"', async () => {
  const two = { ...structuredClone(rows[0]), shots: { ...structuredClone(rows[0].shots), order: { ...structuredClone(rows[0].shots.order), pictures: [pic(0, 'a'), pic(1, 'b')] } } };
  const local = fakeLocal((m, p, b) => (p === `/local/amazon/rows/${R2}` ? { row: structuredClone(two), result: null } : m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ rows: [structuredClone(two)] }) : standard(m, p, b)));
  const s = await rowPageOf(local);
  amazon.enter({ ...s.ctx, route: R2 });
  await settle();
  assert.ok(local.calls.some((c) => c.image && c.path === `/local/amazon/rows/${R2}/small/order/1`), 'the second order picture');
  const one = await mainPage(fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ rows: [structuredClone(rows[0])] }) : standard(m, p, b))));
  byId(one.draw(), 'sheet-file').attrs.onchange({ target: { files: [aFile()] } });
  await settle();
  assert.equal(one.asked[0], 'This replaces the 1 row and its result with the rows of the new file. Go on?');
});

test('the Google login in the top bar, beside the Amazon login: one state at a time, its buttons, what to do under the bar, and a normal Chrome window offered for when Google will not allow the login in the window', async () => {
  const barFor = async (google) => {
    const local = fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/account' ? { ...structuredClone(account), google } : standard(m, p, b)));
    const s = await mainPage(local);
    const tree = s.draw();
    const bar = byId(tree, 'google-account');
    const help = byId(tree, 'google-help');
    return { s, local, tree, text: textOf(byId(bar, 'google-line')), buttons: findAll(bar, (n) => n.tag === 'button').map(textOf), help: help ? textOf(findAll(help, (n) => /\bnotice\b/.test(n.attrs?.class ?? ''))[0]) : '', helpButtons: help ? findAll(help, (n) => n.tag === 'button').map(textOf) : [] };
  };
  const first = screen(fakeLocal(standard)).draw();
  assert.equal(textOf(byId(first, 'google-line')), 'Checking the Google login…', 'before the first answer');
  const logged = await barFor(GOOGLE_IN);
  assert.deepEqual([logged.text, logged.buttons, logged.help, logged.helpButtons], ['Logged in to Google as Test Person', [], '', []], 'no button, no box');
  assert.equal((await barFor({ ...GOOGLE_IN, name: null })).text, 'Logged in to Google', 'without a name when none was read');
  const out = await barFor({ state: 'out', name: null, says: null, chrome: false });
  assert.deepEqual([out.text, out.buttons, out.help], ['Not logged in to Google', ['Log in to Google'], ''], 'the top bar stays slim');
  assert.equal(byId(out.tree, 'google-log-in').attrs.title, GOOGLE_WORDS.outHow);
  const waiting = await barFor({ state: 'waiting', name: null, says: null, chrome: false });
  assert.deepEqual([waiting.text, waiting.buttons], ['Waiting for you to log in to Google', []]);
  assert.equal(waiting.help, 'Log in to Google in the Live Amazon Browser window. This tool never types, stores or reads a password; Chrome keeps the login, so it stays after a restart.');
  assert.deepEqual(waiting.helpButtons, ['Log in to Google in a normal Chrome window'], 'offered under the bar, for when Google will not allow the login in the window');
  const chrome = await barFor({ state: 'waiting', name: null, says: null, chrome: true });
  assert.deepEqual([chrome.text, chrome.buttons, chrome.helpButtons], ['Waiting for you to log in to Google', ['I have logged in'], []]);
  assert.equal(chrome.help, 'Log in to Google in the normal Chrome window that just opened (it uses the same saved profile, so the login is kept), then press "I have logged in".');
  const says = 'Google would not let you log in inside the Live Amazon Browser window, because that window is controlled by the dashboard. Press "Log in to Google in a normal Chrome window": the dashboard closes the Live Amazon Browser, opens a normal Chrome window with the same saved profile on Google\'s login page, and you log in there.';
  const problem = await barFor({ state: 'problem', name: null, says, chrome: false });
  assert.deepEqual([problem.text, problem.buttons, problem.help], ['The Google login could not be checked', ['Check the Google login again', 'Log in to Google in a normal Chrome window'], says]);
  assert.equal(byId(problem.tree, 'google-log-in-in-chrome').attrs.title, GOOGLE_WORDS.chromeHow);
  // The Amazon login's line comes first, then Google's; the boxes under the bar follow in the same order.
  const order = findAll(problem.tree, (n) => ['account', 'google-account', 'login-help', 'google-help'].includes(n.attrs?.['data-id'])).map((n) => n.attrs['data-id']);
  assert.deepEqual(order, ['account', 'google-account', 'google-help'], 'the Amazon login (not logged in) shows no box; Google shows its problem');
  // Each button asks the server, and the top bar follows.
  out.s.click('google-log-in');
  await settle();
  assert.deepEqual(out.local.calls.at(-1), { method: 'POST', path: '/local/amazon/google/log-in', body: {} });
  assert.equal(textOf(byId(out.s.draw(), 'google-line')), 'Checking the Google login…', 'the server answers at once that it is checking');
  problem.s.click('google-check-login');
  await settle();
  assert.deepEqual(problem.local.calls.at(-1), { method: 'POST', path: '/local/amazon/google/check-login', body: {} });
  chrome.s.click('google-logged-in');
  await settle();
  assert.deepEqual(chrome.local.calls.at(-1), { method: 'POST', path: '/local/amazon/google/logged-in', body: {} });
  waiting.s.click('google-log-in-in-chrome');
  await settle();
  assert.deepEqual(waiting.local.calls.at(-1), { method: 'POST', path: '/local/amazon/google/log-in-in-chrome', body: {} });
  assert.doesNotMatch(VIEW_SRC, /[Ss]ign(ed)? in to Google/, 'log in, not sign in');
});

test('no Google login: the pause before a row is said plainly, naming the row and "Log in to Google"', async () => {
  const local = fakeLocal((m, p, b) => (m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ rows: [structuredClone(rows[0]), notDone(rows[1]), notDone(rows[2]), notDone(rows[3])] }) : standard(m, p, b)));
  const s = await mainPage(local);
  s.click('start-checking');
  const ctl = local.streamCtl;
  ctl.onEvent({ event: 'row', rowId: R3, label: 'Row 2' });
  ctl.onEvent({ event: 'paused', kind: 'google-out', says: PAUSE_SAYS['google-out'], rowId: R3, label: 'Row 2' });
  ctl.end({ ok: true });
  await settle();
  assert.equal(textOf(byId(s.draw(), 'paused')), 'Paused at row 2. No one is logged in to Google, so the screenshots on Google Drive cannot be downloaded. Press "Log in to Google" in the top bar and log in there, then press "Carry on checking". That row has no result yet.');
  assert.equal(textOf(byId(s.draw(), 'start-checking')), 'Carry on checking');
});

// ---- a result changed by a staff member, and the emails to users ----

test('"Change the result" on a row’s page: the Status, the Type (every Type) and the Note, then Save; the row then says "Changed by staff" with the date and time, on its page and in the table; "Check again" asks first; "Check every row again" says such rows keep their result', async () => {
  // The row as the server keeps it: once the result is changed, every later answer carries the change.
  let r2 = structuredClone(rows[0]);
  const local = fakeLocal(async (m, p, b) => {
    if (m === 'GET' && p === '/local/amazon/rows') return listAnswer({ rows: [structuredClone(r2), structuredClone(rows[1]), structuredClone(rows[2]), structuredClone(rows[3])] });
    if (m === 'GET' && p === `/local/amazon/rows/${R2}`) return { row: structuredClone(r2), result: structuredClone(pastResult) };
    if (m === 'POST' && p === `/local/amazon/rows/${R2}/result`) {
      r2 = (await standard(m, p, b)).row;
      return { row: structuredClone(r2) };
    }
    return standard(m, p, b);
  });
  const s = await rowPageOf(local, R2);
  assert.equal(byId(s.draw(), 'edit-result'), null, 'closed until the button is pressed');
  s.click('change-result');
  let form = byId(s.draw(), 'edit-result');
  assert.ok(form, 'the form');
  assert.deepEqual(findAll(byId(form, 'edit-final'), (n) => n.tag === 'option').map(textOf), ['Pass', 'Fail', 'Needs Manual Staff Checking']);
  assert.deepEqual(findAll(byId(form, 'edit-type'), (n) => n.tag === 'option').map(textOf).slice(1), types.map((t) => t.word), 'every Type');
  assert.deepEqual([byId(form, 'edit-final').attrs.value, byId(form, 'edit-type').attrs.value, byId(form, 'edit-note').attrs.value], ['pass', 'verified', rows[0].last.note], 'filled with the result as it is');
  byId(form, 'edit-final').attrs.onchange({ target: { value: 'fail' } });
  byId(s.draw(), 'edit-type').attrs.onchange({ target: { value: 'notDelivered' } });
  byId(s.draw(), 'edit-note').attrs.oninput({ target: { value: 'The user said the order never came.' } });
  s.click('save-result');
  await settle();
  assert.deepEqual(local.calls.find((c) => c.path === `/local/amazon/rows/${R2}/result`), { method: 'POST', path: `/local/amazon/rows/${R2}/result`, body: { final: 'fail', typeKey: 'notDelivered', note: 'The user said the order never came.' } });
  let tree = s.draw();
  assert.equal(byId(tree, 'edit-result'), null, 'the form closes');
  assert.match(textOf(tree), /The result was changed\. This row now says "Changed by staff", and the downloaded Excel file keeps what you chose\./);
  assert.deepEqual([textOf(byId(tree, 'final-word')), textOf(byId(tree, 'final-says'))], ['Fail', 'Changed by staff on 08-10-2026 at 14:05. "Check again" replaces it with what the dashboard finds.'], 'at the top of the page, with the date and time');
  assert.equal(textOf(byId(tree, 'result-type')), 'Not delivered');
  assert.equal(textOf(byId(tree, 'result-note')), 'The user said the order never came.');
  assert.match(textOf(byId(tree, 'card-result')), /Changed by staff on 08-10-2026 at 14:05/);
  // In the table too: "Changed by staff" with the date and time, instead of how long the check took.
  const main = amazon.render({ ...s.ctx, route: '' });
  assert.equal(cellsOf(byId(main, `row-${R2}`))[STATUS], 'FailChanged by staff on 08-10-2026 at 14:05');
  assert.equal(textOf(byId(main, `staff-${R2}`)), 'Changed by staff on 08-10-2026 at 14:05');
  assert.equal(byId(main, `took-${R2}`), null);
  assert.equal(countsLine(main), 'Pass: 0, Fail: 1, Needs Manual Staff Checking: 2, Not checked yet: 1', 'the cards follow');
  assert.equal(textOf(byId(main, 'staff-stats')), 'Staff checked 1 result: 0 right (0%). Pass: 1 checked, 0 right (0%).', 'the line above the table counts the dashboard\'s Pass as wrong');
  // "Check again" on such a row asks first, then replaces the staff's result with what the dashboard finds.
  s.click('check');
  assert.equal(s.asked.at(-1), 'A staff member changed this row\'s result by hand. "Check again" replaces it with what the dashboard finds. Go on?');
  assert.equal(local.calls.at(-1).path, `/local/amazon/rows/${R2}/check`, 'OK: the check starts');
  local.streamCtl.end({ ok: false, aborted: true });
  await settle();
  // "Check every row again" says the rows changed by staff keep their result.
  byId(amazon.render({ ...s.ctx, route: '' }), 'check-every-row').attrs.onclick({ stopPropagation() {} });
  assert.equal(s.asked.at(-1), 'This checks the 3 rows not changed by staff again and replaces their results. The 1 row changed by staff keeps its result. Go on?');
  local.streamCtl.onEvent({ event: 'run-started', again: true, total: 4, done: 1, left: 3 });
  assert.deepEqual(s.state.list.items.map((r) => Boolean(r.last)), [true, false, false, false], 'on the screen, the row changed by staff keeps its result; the others lose theirs');
  local.streamCtl.end({ ok: false, aborted: true });
  await settle();
  // Cancel closes the form without saving; a refusal is said in the form.
  s.click('change-result');
  s.click('cancel-result');
  assert.equal(byId(s.draw(), 'edit-result'), null);
  const refusing = await rowPageOf(fakeLocal((m, p, b) => (m === 'POST' && p.endsWith('/result') ? Promise.reject(new ApiError(409, 'This row is being checked right now. Wait for it to finish, then change its result.')) : standard(m, p, b))), R2);
  refusing.click('change-result');
  refusing.click('save-result');
  await settle();
  assert.match(textOf(byId(refusing.draw(), 'edit-result')), /This row is being checked right now/);
});

test('"Email this user" on a row’s page: the exact email is shown first (to, subject and message), its words can be changed, Send sends exactly those words to the test address, and the row then says when it was emailed and about what; emailing the same row again asks first', async () => {
  let r3 = structuredClone(rows[1]);
  const emailed = { at: '2026-10-08T08:35:00.000Z', key: 'needDriveAccess', name: 'Need Google Drive Access', subject: 'Please send the screenshot again', mode: 'test', maybe: false };
  const local = fakeLocal((m, p, b) => {
    if (m === 'GET' && p === '/local/amazon/rows') return listAnswer({ rows: [structuredClone(rows[0]), structuredClone(r3), structuredClone(rows[2]), structuredClone(rows[3])] });
    if (m === 'GET' && p === `/local/amazon/rows/${R3}`) return { row: structuredClone(r3), result: null };
    if (m === 'GET' && p === `/local/amazon/rows/${R3}/email`) return { emails: [emailOf(r3, 'needDriveAccess', { emailedBefore: r3.emails.length ? { at: r3.emails.at(-1).at, name: r3.emails.at(-1).name, maybe: false } : null })], skipped: [], testEmail: TEST_ADDRESS, emailColumn: false };
    return standard(m, p, b);
  });
  const s = await rowPageOf(local, R3);
  assert.ok(byId(s.draw(), 'email-user'), 'its Type has an email');
  assert.equal(byId((await rowPageOf(fakeLocal(standard), R2)).draw(), 'email-user'), null, 'a Pass row has none');
  assert.equal(byId(s.draw(), 'email-panel'), null, 'nothing shown until the button is pressed');
  s.click('email-user');
  await settle();
  assert.ok(local.calls.some((c) => c.method === 'GET' && c.path === `/local/amazon/rows/${R3}/email`), 'the email is fetched, filled in for the row');
  let panel = byId(s.draw(), 'email-panel');
  assert.ok(panel, 'the email, before anything is sent');
  assert.equal(textOf(findAll(panel, (n) => n.tag === 'h2')[0]), 'Email this user');
  assert.equal(textOf(findAll(panel, (n) => n.tag === 'h3')[0]), 'Row 2: Need Google Drive Access');
  assert.equal(textOf(byId(panel, `email-to-${R3}`)), TEST_ADDRESS, 'to the test address');
  assert.equal(byId(panel, `email-subject-${R3}`).attrs.value, 'Your order 403-1000003-2000003: please send the screenshot again');
  assert.match(byId(panel, `email-message-${R3}`).attrs.value, /^Hello,\n\nThis is about your order 403-1000003-2000003 for Test Brand Home Cleaning Kit\./);
  assert.equal(textOf(byId(panel, 'send-emails')), 'Send');
  assert.equal(byId(panel, 'send-emails').attrs.disabled, false);
  assert.equal(byId(panel, 'test-email-input').attrs.value, TEST_ADDRESS, 'the Test email address box, with the address kept');
  assert.match(textOf(panel), /Test mode: every email goes only to test\.person@example\.test, never to anyone else\./);
  // The words changed, then Send: exactly those words go.
  byId(panel, `email-subject-${R3}`).attrs.oninput({ target: { value: 'Please send the screenshot again' } });
  byId(panel, `email-message-${R3}`).attrs.oninput({ target: { value: 'Hello,\n\nPlease send the screenshot again.\n\nThank you,\nThe support team' } });
  s.click('send-emails');
  assert.deepEqual(local.calls.at(-1), { method: 'POST', path: '/local/amazon/emails/send', body: { mode: 'test', emails: [{ rowId: R3, key: 'needDriveAccess', subject: 'Please send the screenshot again', message: 'Hello,\n\nPlease send the screenshot again.\n\nThank you,\nThe support team' }] }, stream: true });
  assert.deepEqual([byId(s.draw(), 'mode-test').attrs.checked, byId(s.draw(), 'mode-real').attrs.disabled], [true, true], 'Test is chosen; Real cannot be, as the file has no email address column');
  assert.equal(s.asked.length, 0, 'not emailed before: nothing to ask');
  const ctl = local.streamCtl;
  ctl.onEvent({ event: 'emails-started', total: 1, to: TEST_ADDRESS });
  ctl.onEvent({ event: 'email', rowId: R3, label: 'Row 2', index: 1, total: 1 });
  ctl.onEvent({ event: 'action', says: 'Pressing Send in Gmail' });
  panel = byId(s.draw(), 'email-panel');
  assert.equal(textOf(byId(panel, 'email-action')), 'Pressing Send in Gmail');
  assert.deepEqual([textOf(byId(panel, 'send-emails')), byId(panel, 'send-emails').attrs.disabled, Boolean(byId(panel, 'stop-emails')), byId(panel, `email-message-${R3}`).attrs.disabled], ['Sending…', true, true, true]);
  assert.equal(byId(s.draw(), 'check').attrs.disabled, true, 'no check while emails are sent');
  r3 = { ...r3, emails: [emailed] };
  ctl.onEvent({ event: 'email-sent', rowId: R3, label: 'Row 2', at: emailed.at, rows: [structuredClone(r3)] });
  ctl.onEvent({ event: 'emails-done', sent: 1, failed: 0, total: 1 });
  ctl.end({ ok: true });
  await settle();
  const after = s.draw();
  assert.match(textOf(byId(after, 'email-panel')), /The email was sent\./);
  assert.ok(findAll(byId(after, `email-${R3}`), (n) => n.tag === 'span' && textOf(n) === 'Sent').length, 'marked Sent');
  assert.equal(textOf(byId(after, 'cancel-emails')), 'Close');
  assert.equal(textOf(byId(after, `emailed-${R3}`)), 'Emailed on 08-10-2026 at 14:05 about Need Google Drive Access, as a test.', 'on the row\'s page: when, and about what; a test email never reached the user');
  assert.equal(textOf(byId(amazon.render({ ...s.ctx, route: '' }), `emailed-${R3}`)), 'Emailed on 08-10-2026 at 14:05 about Need Google Drive Access, as a test.', 'in the table too');
  assert.deepEqual(findAll(byId(after, 'email-summary'), (n) => n.tag === 'li').map(textOf), ['Sent: 1', 'Not sent because of a problem: 0', 'Not tried: 0'], 'the numbers, each on its own line');
  // Emailing the same row again asks first.
  s.click('cancel-emails');
  assert.equal(byId(s.draw(), 'email-panel'), null);
  s.click('email-user');
  await settle();
  assert.match(textOf(byId(s.draw(), `emailed-before-${R3}`)), /Emailed before, on 08-10-2026 at 14:05 \(Need Google Drive Access\)\./);
  s.click('send-emails');
  assert.equal(s.asked.at(-1), 'Row 2 was emailed before, on 08-10-2026 at 14:05 (Need Google Drive Access). Send it another email?');
  local.streamCtl.end({ ok: false, aborted: true });
  await settle();
  assert.match(textOf(byId(s.draw(), 'email-panel')), /Sending was stopped\./);
  assert.deepEqual(findAll(byId(s.draw(), 'email-summary'), (n) => n.tag === 'li').map(textOf), ['Sent: 0', 'Not sent because of a problem: 0', 'Not tried: 1']);
  // A login page, a robot check or a block while sending: said plainly, and the emails after it are not sent.
  s.click('cancel-emails');
  s.click('email-user');
  await settle();
  s.click('send-emails');
  local.streamCtl.onEvent({ event: 'emails-started', total: 1, to: TEST_ADDRESS });
  local.streamCtl.onEvent({ event: 'email', rowId: R3, label: 'Row 2', index: 1, total: 1 });
  local.streamCtl.onEvent({ event: 'paused', kind: 'google-signin', says: 'Gmail asked you to log in, so sending stopped. Press "Log in to Google" in the top bar and log in there, then press Send again.', rowId: R3, label: 'Row 2', sent: 0, failed: 0, total: 1 });
  local.streamCtl.end({ ok: true });
  await settle();
  assert.match(textOf(byId(s.draw(), 'email-panel')), /Gmail asked you to log in, so sending stopped\. Press "Log in to Google" in the top bar and log in there, then press Send again\./);
  assert.match(textOf(byId(s.draw(), `email-${R3}`)), /Not sent.*Gmail asked you to log in/, 'the email it stopped at says so');
  assert.deepEqual(findAll(byId(s.draw(), 'email-summary'), (n) => n.tag === 'li').map(textOf), ['Sent: 0', 'Not sent because of a problem: 1', 'Not tried: 0']);
});

test('the Test email address box: nothing is sent without an address; the address typed is saved and kept for next time, and every email goes only to it', async () => {
  const local = fakeLocal((m, p, b) => (m === 'GET' && p === `/local/amazon/rows/${R3}/email` ? { emails: [emailOf(rows[1], 'needDriveAccess', { to: '' })], skipped: [], testEmail: '' } : standard(m, p, b)));
  const s = await rowPageOf(local, R3);
  s.click('email-user');
  await settle();
  let panel = byId(s.draw(), 'email-panel');
  assert.deepEqual([byId(panel, 'send-emails').attrs.disabled, byId(panel, 'send-emails').attrs.title], [true, 'Fill in the Test email address first.']);
  assert.equal(textOf(byId(panel, `email-to-${R3}`)), 'the test email address (fill it in above)');
  assert.match(textOf(byId(panel, 'test-email')), /Test mode: every email goes only to this address, never to anyone else\. Fill it in and press Save; it is kept for next time\./);
  assert.equal(byId(panel, 'save-test-email').attrs.disabled, true, 'nothing typed yet');
  byId(panel, 'test-email-input').attrs.oninput({ target: { value: ` ${TEST_ADDRESS} ` } });
  assert.equal(byId(s.draw(), 'save-test-email').attrs.disabled, false);
  s.click('save-test-email');
  await settle();
  assert.deepEqual(local.calls.at(-1), { method: 'POST', path: '/local/amazon/email-address', body: { email: TEST_ADDRESS } });
  panel = byId(s.draw(), 'email-panel');
  assert.match(textOf(byId(panel, 'test-email')), /Saved\. Every email goes to test\.person@example\.test\./);
  assert.deepEqual([byId(panel, 'send-emails').attrs.disabled, textOf(byId(panel, `email-to-${R3}`))], [false, TEST_ADDRESS], 'now it can be sent, to that address');
  assert.equal(s.state.list.emails.testEmail, TEST_ADDRESS, 'kept');
  // A wrong address is said under the box.
  const refusing = await rowPageOf(fakeLocal((m, p, b) => (m === 'POST' && p === '/local/amazon/email-address' ? Promise.reject(new ApiError(400, 'Write an email address, such as name@example.com.')) : standard(m, p, b))), R3);
  refusing.click('email-user');
  await settle();
  byId(refusing.draw(), 'test-email-input').attrs.oninput({ target: { value: 'nope' } });
  refusing.click('save-test-email');
  await settle();
  assert.match(textOf(byId(refusing.draw(), 'test-email')), /Write an email address, such as name@example\.com\./);
});

/** The small label on one email in the panel: Sent, Maybe sent, Not sent, Not tried, Sending or Waiting; null when none. */
const markOf = (tree, id) => {
  const pill = findAll(byId(tree, `email-${id}`), (n) => n.tag === 'span' && String(n.attrs?.class ?? '').startsWith('pill'))[0];
  return pill ? textOf(pill) : null;
};

test('"Email these users" above the table, when a Type with an email is chosen: one line per user with a tick box, the row, the name, the order ID and the email address; each line opens to show its email; nothing ticked to start with; "Tick all" and "Untick all"; "Send to the ticked users (N)" sends only to them; a Pass Type has no button; the panel sits above the table', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  assert.equal(byId(s.draw(), 'email-these'), null, 'no Type chosen: no button');
  byId(s.draw(), 'filter-type').attrs.onchange({ target: { value: 'Verified' } });
  assert.equal(byId(s.draw(), 'email-these'), null, 'Verified has no email');
  byId(s.draw(), 'filter-type').attrs.onchange({ target: { value: 'Need Google Drive Access' } });
  assert.equal(textOf(byId(s.draw(), 'email-these')), 'Email these users (1)');
  s.click('count-pass');
  assert.equal(byId(s.draw(), 'email-these'), null, 'the Type chosen went with the card');
  byId(s.draw(), 'filter-type').attrs.onchange({ target: { value: 'Need Access' } });
  assert.equal(byId(s.draw(), 'email-these'), null, 'no row with that Status and Type');
  s.click('count-manual');
  byId(s.draw(), 'filter-type').attrs.onchange({ target: { value: 'Need Access' } });
  assert.equal(textOf(byId(s.draw(), 'email-these')), 'Email these users (1)', 'a Type from the file counts too');
  s.click('email-these');
  await settle();
  assert.deepEqual(local.calls.at(-1), { method: 'POST', path: '/local/amazon/emails/preview', body: { rowIds: [R4] } });
  let tree = s.draw();
  let panel = byId(tree, 'email-panel');
  assert.equal(textOf(findAll(panel, (n) => n.tag === 'h2')[0]), 'Email these users');
  assert.match(textOf(panel), /Tick the users to email\. Each line opens to show its email, to read and change\./);
  // One short line per user: a tick box, the row, the name, the order ID and the email address (none in this file).
  assert.equal(textOf(byId(panel, `email-line-${R4}`)), 'Row 3: no name, order 403-1000004-2000004, no email address');
  assert.deepEqual([byId(panel, `tick-${R4}`).attrs.checked, byId(panel, `tick-${R4}`).attrs.disabled], [false, false], 'nothing ticked to start with');
  assert.equal(textOf(byId(panel, 'ticked-count')), '0 of 1 ticked');
  assert.deepEqual([textOf(byId(panel, 'send-emails')), byId(panel, 'send-emails').attrs.disabled, byId(panel, 'send-emails').attrs.title], ['Send to the ticked users (0)', true, 'Tick at least one user first.']);
  const open = byId(panel, `email-open-${R4}`);
  assert.equal(open.tag, 'details', 'the line opens');
  assert.equal(textOf(findAll(open, (n) => n.tag === 'summary')[0]), 'Show the email (Need Access)');
  assert.equal(textOf(byId(open, `email-to-${R4}`)), TEST_ADDRESS);
  assert.equal(byId(open, `email-subject-${R4}`).attrs.value, 'Your order 403-1000004-2000004: please send the screenshot again');
  assert.ok(byId(open, `email-message-${R4}`), 'each email open to read and change');
  assert.equal(byId(panel, 'mode-test').attrs.checked, true, 'Test to start with');
  // Tick all, Untick all, and one tick box.
  s.click('tick-all');
  assert.deepEqual([byId(s.draw(), `tick-${R4}`).attrs.checked, textOf(byId(s.draw(), 'send-emails')), byId(s.draw(), 'send-emails').attrs.disabled], [true, 'Send to the ticked users (1)', false]);
  s.click('untick-all');
  assert.deepEqual([byId(s.draw(), `tick-${R4}`).attrs.checked, textOf(byId(s.draw(), 'send-emails'))], [false, 'Send to the ticked users (0)']);
  byId(s.draw(), `tick-${R4}`).attrs.onchange({ target: { checked: true } });
  assert.equal(textOf(byId(s.draw(), 'ticked-count')), '1 of 1 ticked');
  const order = findAll(s.draw(), (n) => ['overview', 'email-panel', 'rows'].includes(n.attrs?.['data-id'])).map((n) => n.attrs['data-id']);
  assert.deepEqual(order, ['overview', 'email-panel', 'rows'], 'above the table');
  assert.ok(s.revealed.includes('email-panel'), 'scrolled to');
  // Send to the ticked users: one stream for the ticked emails only; each row is marked as it goes; the numbers at the end, on their own lines.
  byId(s.draw(), `email-subject-${R4}`).attrs.oninput({ target: { value: 'Please send it again' } });
  s.click('send-emails');
  const ctl = local.streamCtl;
  assert.deepEqual(local.calls.at(-1).body, { mode: 'test', emails: [{ rowId: R4, key: 'needAccess', subject: 'Please send it again', message: emailOf(rows[2], 'needAccess').message }] }, 'the ticked email, as it is on the screen');
  ctl.onEvent({ event: 'emails-started', total: 1, mode: 'test', to: TEST_ADDRESS });
  ctl.onEvent({ event: 'email', rowId: R4, label: 'Row 3', index: 1, total: 1, to: TEST_ADDRESS });
  tree = s.draw();
  assert.equal(textOf(byId(tree, 'email-action')), 'Sending 1 of 1: Row 3');
  assert.deepEqual([markOf(tree, R4), byId(tree, `tick-${R4}`).attrs.disabled, byId(tree, 'tick-all').attrs.disabled, byId(tree, 'mode-real').attrs.disabled], ['Sending…', true, true, true]);
  assert.equal(byId(tree, 'start-checking').attrs.disabled, true, 'no checking while emails are sent');
  ctl.onEvent({ event: 'email-failed', rowId: R4, label: 'Row 3', says: "Gmail's Send button could not be pressed, so the email was not sent." });
  ctl.onEvent({ event: 'emails-done', sent: 0, maybe: 0, failed: 1, total: 1 });
  ctl.end({ ok: true });
  await settle();
  tree = s.draw();
  assert.equal(markOf(tree, R4), 'Not sent');
  assert.match(textOf(byId(tree, `email-${R4}`)), /Send button could not be pressed, so the email was not sent\./, 'its reason next to it');
  assert.deepEqual(findAll(byId(tree, 'email-summary'), (n) => n.tag === 'li').map(textOf), ['Sent: 0', 'Not sent because of a problem: 1', 'Not tried: 0']);
  assert.match(textOf(byId(tree, 'email-panel')), /Sending finished, but not every email was sent\./);
  s.click('cancel-emails');
  assert.equal(byId(s.draw(), 'email-panel'), null, 'Cancel puts it away');
});

test("Test or Real: Test is chosen to start with; Real can only be chosen when the file has an email address column, which shows in the table like any other; then the To of each email shows the user's own address, a row without one says why and cannot be ticked, Send asks first, and the row then says it was emailed for real", async () => {
  let r3 = emailRows()[1];
  const local = fakeLocal((m, p, b) => {
    if (m === 'GET' && p === '/local/amazon/rows') {
      const list = emailRows();
      list[1] = structuredClone(r3);
      return listAnswer({ rows: list, sheet: structuredClone(emailSheet), emails: { ...structuredClone(EMAILS), testEmail: TEST_ADDRESS, emailColumn: true } });
    }
    if (m === 'POST' && p === '/local/amazon/emails/preview') return { emails: b.rowIds.map(withAddress), skipped: [], testEmail: TEST_ADDRESS, emailColumn: true };
    return standard(m, p, b);
  });
  const s = await mainPage(local);
  assert.ok(cellsOf(byId(s.draw(), `row-${R2}`)).includes('test.one@example.test'), 'the email address column shows in the table');
  assert.deepEqual(findAll(byId(s.draw(), 'rows-table'), (n) => n.tag === 'th').map(textOf).slice(10, 12), ['J: Email ID', 'K: Note']);
  s.click('count-manual');
  byId(s.draw(), 'filter-type').attrs.onchange({ target: { value: 'Need Google Drive Access' } });
  assert.equal(textOf(byId(s.draw(), 'email-these')), 'Email these users (2)');
  s.click('email-these');
  await settle();
  let tree = s.draw();
  const box = byId(tree, 'email-mode');
  assert.deepEqual([byId(box, 'mode-test').attrs.checked, byId(box, 'mode-real').attrs.checked, byId(box, 'mode-real').attrs.disabled], [true, false, false], 'Test to start with; Real can be chosen');
  assert.match(textOf(box), /Test: every email goes only to the test email address/);
  assert.match(textOf(box), /Real: each email goes to that user's own email address/);
  assert.doesNotMatch(textOf(box), /no email address column/);
  assert.equal(textOf(byId(tree, `email-line-${R3}`)), 'Row 2: no name, order 403-1000003-2000003, test.two@example.test', 'the line: the row, the name, the order ID and the email address');
  assert.equal(textOf(byId(tree, `email-line-${R4}`)), 'Row 3: no name, order 403-1000004-2000004, not an address');
  assert.deepEqual([textOf(byId(tree, `email-to-${R3}`)), textOf(byId(tree, `email-to-${R4}`)), Boolean(byId(byId(tree, 'email-panel'), 'test-email'))], [TEST_ADDRESS, TEST_ADDRESS, true], 'in Test mode: to the test address, with its box');
  byId(tree, 'mode-real').attrs.onchange();
  tree = s.draw();
  assert.equal(byId(byId(tree, 'email-panel'), 'test-email'), null, 'the test address box is not needed in Real mode');
  assert.equal(textOf(byId(tree, `email-to-${R3}`)), 'test.two@example.test', "in Real mode: to the user's own address");
  assert.equal(textOf(byId(tree, `email-to-${R4}`)), 'not an address (not an email address, so it will not be sent)');
  assert.equal(byId(tree, `tick-${R4}`).attrs.disabled, true, 'a row without an email address cannot be ticked');
  assert.equal(textOf(byId(tree, `email-why-${R4}`)), 'Not sent: What the file has for this row is not an email address: "not an address".');
  s.click('tick-all');
  tree = s.draw();
  assert.deepEqual([byId(tree, `tick-${R3}`).attrs.checked, byId(tree, `tick-${R4}`).attrs.checked, textOf(byId(tree, 'send-emails'))], [true, false, 'Send to the ticked users (1)']);
  s.click('send-emails');
  assert.equal(s.asked.at(-1), "This sends 1 email to the user's own email address. Go on?");
  assert.deepEqual([local.calls.at(-1).body.mode, local.calls.at(-1).body.emails.map((e) => e.rowId)], ['real', [R3]]);
  const ctl = local.streamCtl;
  ctl.onEvent({ event: 'emails-started', total: 1, mode: 'real', to: null });
  ctl.onEvent({ event: 'email', rowId: R3, label: 'Row 2', index: 1, total: 1, to: 'test.two@example.test' });
  r3 = { ...r3, emails: [{ at: '2026-10-08T08:35:00.000Z', key: 'needDriveAccess', name: 'Need Google Drive Access', subject: 'Please send it again', mode: 'real', maybe: false }] };
  ctl.onEvent({ event: 'email-sent', rowId: R3, label: 'Row 2', at: '2026-10-08T08:35:00.000Z', rows: [structuredClone(r3)] });
  ctl.onEvent({ event: 'emails-done', sent: 1, maybe: 0, failed: 0, total: 1 });
  ctl.end({ ok: true });
  await settle();
  tree = s.draw();
  assert.equal(markOf(tree, R3), 'Sent');
  assert.equal(textOf(byId(tree, `emailed-${R3}`)), 'Emailed on 08-10-2026 at 14:05 about Need Google Drive Access.', 'a real email: not "as a test"');
  assert.match(textOf(byId(tree, 'email-panel')), /The email was sent\./);
  assert.deepEqual(findAll(byId(tree, 'email-summary'), (n) => n.tag === 'li').map(textOf), ['Sent: 1', 'Not sent because of a problem: 0', 'Not tried: 0']);
  // Several in Real mode: the question says how many; emailed before is asked about first.
  s.click('cancel-emails');
  s.click('email-these');
  await settle();
  byId(s.draw(), 'mode-real').attrs.onchange();
  s.click('tick-all');
  s.click('send-emails');
  assert.equal(s.asked.at(-1), "This sends 1 email to the user's own email address. Go on?");
  local.streamCtl.end({ ok: false, aborted: true });
  await settle();
  // "Email this user" on a row's page, in Real mode, for a row with no email address: nothing can be sent, and it says so.
  const page = await rowPageOf(fakeLocal((m, p, b) => (m === 'GET' && p === `/local/amazon/rows/${R3}/email` ? { emails: [withAddress(R3)], skipped: [], testEmail: TEST_ADDRESS, emailColumn: true } : m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ rows: emailRows(), sheet: structuredClone(emailSheet), emails: { ...structuredClone(EMAILS), testEmail: TEST_ADDRESS, emailColumn: true } }) : standard(m, p, b))), R3);
  page.click('email-user');
  await settle();
  byId(page.draw(), 'mode-real').attrs.onchange();
  assert.equal(textOf(byId(page.draw(), `email-to-${R3}`)), 'test.two@example.test');
  page.click('send-emails');
  assert.equal(page.asked.at(-1), "This sends 1 email to the user's own email address. Go on?");
  assert.deepEqual(page.ctx.local.calls.at(-1).body.mode, 'real');
  page.ctx.local.streamCtl.end({ ok: false, aborted: true });
  await settle();
});

test('Stop while emails are sent, and the numbers after: each email says what happened to it (Sent, Maybe sent, Not sent with its reason, Not tried), and the numbers are on their own lines; an email Gmail may have sent without saying so is "Maybe sent", never "Not sent", on the row too', async () => {
  const ids = ['r0000000000f1', 'r0000000000f2', 'r0000000000f3', 'r0000000000f4'];
  const many = ids.map((id, i) => ({ ...structuredClone(rows[1]), id, row: 10 + i, n: 9 + i, label: `Row ${9 + i}`, orderId: `403-1000010-200001${i}` }));
  const local = fakeLocal((m, p, b) => {
    if (m === 'GET' && p === '/local/amazon/rows') return listAnswer({ rows: structuredClone(many) });
    if (m === 'POST' && p === '/local/amazon/emails/preview') return { emails: b.rowIds.map((id) => emailOf(many.find((x) => x.id === id), 'needDriveAccess')), skipped: [], testEmail: TEST_ADDRESS, emailColumn: false };
    return standard(m, p, b);
  });
  const s = await mainPage(local);
  s.click('count-manual');
  byId(s.draw(), 'filter-type').attrs.onchange({ target: { value: 'Need Google Drive Access' } });
  s.click('email-these');
  await settle();
  s.click('tick-all');
  assert.equal(textOf(byId(s.draw(), 'ticked-count')), '4 of 4 ticked');
  s.click('send-emails');
  const ctl = local.streamCtl;
  assert.deepEqual(local.calls.at(-1).body.emails.map((e) => e.rowId), ids, 'all four, ticked');
  ctl.onEvent({ event: 'emails-started', total: 4, mode: 'test', to: TEST_ADDRESS });
  ctl.onEvent({ event: 'email', rowId: ids[0], label: 'Row 9', index: 1, total: 4, to: TEST_ADDRESS });
  ctl.onEvent({ event: 'email-sent', rowId: ids[0], label: 'Row 9', at: '2026-10-08T08:35:00.000Z', rows: [] });
  ctl.onEvent({ event: 'email', rowId: ids[1], label: 'Row 10', index: 2, total: 4, to: TEST_ADDRESS });
  const unsure = 'Send was pressed, but Gmail did not say the email was sent, so it may or may not have gone. Look in your Sent emails before sending it again.';
  ctl.onEvent({ event: 'email-maybe', rowId: ids[1], label: 'Row 10', at: '2026-10-08T08:36:00.000Z', says: unsure, rows: [{ ...many[1], emails: [{ at: '2026-10-08T08:36:00.000Z', key: 'needDriveAccess', name: 'Need Google Drive Access', subject: 'x', mode: 'test', maybe: true }] }] });
  ctl.onEvent({ event: 'email', rowId: ids[2], label: 'Row 11', index: 3, total: 4, to: TEST_ADDRESS });
  let tree = s.draw();
  assert.deepEqual(ids.map((id) => markOf(tree, id)), ['Sent', 'Maybe sent: look in your Sent emails', 'Sending…', 'Waiting']);
  assert.equal(textOf(byId(tree, `emailed-${ids[1]}`)), 'Maybe emailed on 08-10-2026 at 14:06 about Need Google Drive Access, as a test: look in your Sent emails.', 'on the row, so nobody sends it twice by mistake');
  s.click('stop-emails');
  await settle();
  tree = s.draw();
  assert.deepEqual(ids.map((id) => markOf(tree, id)), ['Sent', 'Maybe sent: look in your Sent emails', 'Maybe sent: look in your Sent emails', 'Not tried']);
  assert.match(textOf(byId(tree, `email-${ids[1]}`)), /Send was pressed, but Gmail did not say the email was sent/, 'its reason next to it');
  assert.match(textOf(byId(tree, `email-${ids[2]}`)), /The dashboard lost track of this email while it was being sent, so it may have gone\./, 'the one Stop cut off may still have gone');
  assert.deepEqual(findAll(byId(tree, 'email-summary'), (n) => n.tag === 'li').map(textOf), ['Sent: 1', 'Maybe sent (look in your Sent emails): 2', 'Not sent because of a problem: 0', 'Not tried: 1'], 'each number on its own line');
  assert.match(textOf(byId(tree, 'email-panel')), /Sending was stopped\. The emails marked Sent were sent; each of the others says what happened to it\./);
  assert.equal(textOf(byId(tree, 'cancel-emails')), 'Close');
  assert.deepEqual(summaryLines({ sent: 2, maybe: 0, failed: 10, notTried: 58 }), ['Sent: 2', 'Not sent because of a problem: 10', 'Not tried: 58']);
  // Sending to that row again asks first, saying it may have been emailed.
  s.click('cancel-emails');
  const again = fakeLocal((m, p, b) => (m === 'POST' && p === '/local/amazon/emails/preview' ? { emails: [emailOf(many[1], 'needDriveAccess', { emailedBefore: { at: '2026-10-08T08:36:00.000Z', name: 'Need Google Drive Access', maybe: true } })], skipped: [], testEmail: TEST_ADDRESS, emailColumn: false } : local.api(m, p, b)));
  const t = await mainPage(again);
  t.click('count-manual');
  byId(t.draw(), 'filter-type').attrs.onchange({ target: { value: 'Need Google Drive Access' } });
  t.click('email-these');
  await settle();
  assert.match(textOf(byId(t.draw(), `emailed-before-${ids[1]}`)), /Maybe emailed before, on 08-10-2026 at 14:06 \(Need Google Drive Access\)\./);
  t.click('tick-all');
  t.click('send-emails');
  assert.equal(t.asked.at(-1), 'Row 10 may have been emailed before, on 08-10-2026 at 14:06 (Need Google Drive Access). Send it another email?');
  again.streamCtl.end({ ok: false, aborted: true });
  await settle();
});

test('"The result is right" on a row’s page, next to "Change the result": the result stays, marked right by staff with the date and time, on its page and in the table; the line above the table counts right and wrong results, by Status; "Check again" asks first and clears the mark; "Check every row again" says the marks go; no button for a result staff chose or a row with no result', async () => {
  let r2 = structuredClone(rows[0]);
  const local = fakeLocal(async (m, p, b) => {
    if (m === 'GET' && p === '/local/amazon/rows') return listAnswer({ rows: [structuredClone(r2), structuredClone(rows[1]), structuredClone(rows[2]), structuredClone(rows[3])] });
    if (m === 'GET' && p === `/local/amazon/rows/${R2}`) return { row: structuredClone(r2), result: structuredClone(pastResult) };
    if (m === 'POST' && p === `/local/amazon/rows/${R2}/right`) {
      r2 = (await standard(m, p, b)).row;
      return { row: structuredClone(r2) };
    }
    return standard(m, p, b);
  });
  const s = await rowPageOf(local, R2);
  const buttons = findAll(byId(s.draw(), 'final-banner') ? s.draw() : s.draw(), (n) => n.tag === 'button' && ['change-result', 'result-right'].includes(n.attrs?.['data-id'])).map((n) => n.attrs['data-id']);
  assert.deepEqual(buttons, ['change-result', 'result-right'], 'next to "Change the result"');
  assert.deepEqual([textOf(byId(s.draw(), 'result-right')), byId(s.draw(), 'result-right').attrs.disabled], ['The result is right', false]);
  assert.equal(byId((await rowPageOf(fakeLocal(standard), H1)).draw(), 'result-right'), null, 'a row with no result has no button');
  assert.equal(byId((await rowPageOf(fakeLocal(standard), R4)).draw(), 'result-right'), null, 'nor a row whose Status is only from the file');
  assert.equal(textOf(byId(amazon.render({ ...s.ctx, route: '' }), 'staff-stats')), 'Staff checked no results yet. On a row\'s page, "The result is right" or "Change the result" counts one.');
  s.click('result-right');
  await settle();
  assert.deepEqual(local.calls.find((c) => c.path.endsWith('/right')), { method: 'POST', path: `/local/amazon/rows/${R2}/right`, body: {} });
  let tree = s.draw();
  assert.match(textOf(tree), /Marked as right\. This row now says "Marked right by staff", and the line above the table counts it\./);
  assert.deepEqual([textOf(byId(tree, 'final-word')), textOf(byId(tree, 'final-says'))], ['Pass', `Marked right by staff on 08-10-2026 at 14:05. ${PASS_SAYS}`], 'at the top of the page, with the date and time, and the reason stays');
  assert.deepEqual([textOf(byId(tree, 'result-type')), textOf(byId(tree, 'result-note'))], ['Verified', rows[0].last.note], 'the result stays');
  assert.match(textOf(byId(tree, 'card-result')), /Marked right by staff on 08-10-2026 at 14:05/);
  assert.deepEqual([textOf(byId(tree, 'result-right')), byId(tree, 'result-right').attrs.disabled], ['Marked right by staff', true]);
  assert.equal(byId(tree, 'change-result').attrs.disabled, false, 'it can still be changed, which then counts it as wrong');
  const main = amazon.render({ ...s.ctx, route: '' });
  assert.equal(textOf(byId(main, `staff-${R2}`)), 'Marked right by staff on 08-10-2026 at 14:05', 'in the table too');

  assert.equal(textOf(byId(main, 'staff-stats')), 'Staff checked 1 result: 1 right (100%). Pass: 1 checked, 1 right (100%).');
  // "Check again" asks first, then clears the mark.
  s.click('check');
  assert.equal(s.asked.at(-1), 'A staff member marked this row\'s result as right. "Check again" checks it afresh and clears that mark. Go on?');
  assert.equal(local.calls.at(-1).path, `/local/amazon/rows/${R2}/check`);
  local.streamCtl.end({ ok: false, aborted: true });
  await settle();
  // "Check every row again" says the marks go, and the rows marked right lose their results like any other.
  byId(amazon.render({ ...s.ctx, route: '' }), 'check-every-row').attrs.onclick({ stopPropagation() {} });
  assert.equal(s.asked.at(-1), 'This checks all 4 rows again and replaces their results. The 1 row marked right by staff loses its mark. Go on?');
  local.streamCtl.onEvent({ event: 'run-started', again: true, total: 4, done: 0, left: 4 });
  assert.deepEqual(s.state.list.items.map((r) => Boolean(r.last)), [false, false, false, false]);
  local.streamCtl.end({ ok: false, aborted: true });
  await settle();
  // The line above the table, from what staff marked: right and wrong, by the Status the dashboard gave.
  const mixed = [{ last: { staff: { right: true, was: { final: 'pass' } } } }, { last: { staff: { right: false, was: { final: 'pass' } } } }, { last: { staff: { right: true, was: { final: 'fail' } } } }, { last: { staff: { right: false, was: null } } }, { last: null }, {}];
  assert.equal(staffStatsLine(mixed), 'Staff checked 3 results: 2 right (67%). Pass: 2 checked, 1 right (50%). Fail: 1 checked, 1 right (100%).');
  assert.equal(staffStatsLine([{ last: { staff: { right: false, was: { final: 'manual' } } } }]), 'Staff checked 1 result: 0 right (0%). Needs Manual Staff Checking: 1 checked, 0 right (0%).');
  // No button for a result staff chose; a refusal is said on the page.
  const changed = { ...structuredClone(rows[0]), last: { ...rows[0].last, staff: { at: '2026-10-08T08:35:00.000Z', right: false, was: { final: 'pass', typeKey: 'verified', type: 'Verified' } } } };
  const c = await rowPageOf(fakeLocal((m, p, b) => (m === 'GET' && p === `/local/amazon/rows/${R2}` ? { row: structuredClone(changed), result: structuredClone(pastResult) } : m === 'GET' && p === '/local/amazon/rows' ? listAnswer({ rows: [structuredClone(changed), ...rows.slice(1).map((r) => structuredClone(r))] }) : standard(m, p, b))), R2);
  assert.equal(byId(c.draw(), 'result-right'), null);
  const refusing = await rowPageOf(fakeLocal((m, p, b) => (m === 'POST' && p.endsWith('/right') ? Promise.reject(new ApiError(409, 'This row is being checked right now. Wait for it to finish, then mark its result.')) : standard(m, p, b))), R2);
  refusing.click('result-right');
  await settle();
  assert.match(textOf(refusing.draw()), /This row is being checked right now\. Wait for it to finish, then mark its result\./);
});

test('the Email templates box, under More: every email with its name, subject and message, the sign-off and the test email address, to read and change; "Save the emails" writes them into the settings file', async () => {
  const local = fakeLocal(standard);
  const s = await mainPage(local);
  const box = byId(byId(s.draw(), 'more'), 'templates');
  assert.ok(box, 'under More');
  assert.deepEqual(findAll(box, (n) => n.tag === 'h4').map(textOf), EMAIL_KEYS.map((k) => emailName(k, DEFAULT_SETTINGS)), 'one for every Type that is not Pass (except Something else), and the second Not delivered email');
  assert.equal(findAll(box, (n) => n.tag === 'h4').length, 21);
  assert.deepEqual(findAll(byId(box, 'placeholders'), (n) => n.tag === 'li').map((n) => textOf(findAll(n, (x) => x.tag === 'strong')[0])), ['{name}', '{order ID}', '{product}', '{what is wrong}', '{sign-off}'], 'the words that get filled in, explained');
  assert.equal(byId(box, 'template-sign-off').attrs.value, 'Thank you,\nThe support team');
  assert.equal(byId(box, 'template-subject-duplicate').attrs.value, 'Your order {order ID}: it was already sent');
  assert.match(byId(box, 'template-message-notDeliveredCancelled').attrs.value, /^Hello \{name\},/);
  assert.ok(byId(box, 'test-email'), 'the Test email address box is here too');
  assert.equal(byId(box, 'save-templates').attrs.disabled, true, 'nothing changed yet');
  byId(box, 'template-subject-duplicate').attrs.oninput({ target: { value: 'Sent twice: {order ID}' } });
  byId(s.draw(), 'template-sign-off').attrs.oninput({ target: { value: 'Thanks,\nTest Team' } });
  assert.equal(byId(s.draw(), 'save-templates').attrs.disabled, false);
  assert.ok(byId(s.draw(), 'undo-templates'));
  s.click('save-templates');
  await settle();
  const saved = local.calls.at(-1);
  assert.equal(saved.path, '/local/amazon/emails/templates');
  assert.equal(saved.body.signOff, 'Thanks,\nTest Team');
  assert.deepEqual(Object.keys(saved.body.templates), EMAIL_KEYS, 'every email is sent back, as it is');
  assert.deepEqual(saved.body.templates.duplicate, { subject: 'Sent twice: {order ID}', message: DEFAULT_SETTINGS.emails.templates.duplicate.message });
  const after = byId(s.draw(), 'templates');
  assert.match(textOf(after), /The emails were saved in the settings file\. The next email uses the new words\./);
  assert.equal(byId(after, 'template-subject-duplicate').attrs.value, 'Sent twice: {order ID}', 'as the server kept them');
  assert.equal(byId(after, 'save-templates').attrs.disabled, true);
  // A refusal is said in the box, and the words typed stay.
  const refusing = await mainPage(fakeLocal((m, p, b) => (m === 'POST' && p === '/local/amazon/emails/templates' ? Promise.reject(new ApiError(400, 'In the settings file, "emails.templates.duplicate.message" uses {user}, which the dashboard does not know. It knows {name}, {order ID}, {product}, {what is wrong} and {sign-off}.')) : standard(m, p, b))));
  byId(refusing.draw(), 'template-message-duplicate').attrs.oninput({ target: { value: 'Hello {user}' } });
  refusing.click('save-templates');
  await settle();
  assert.match(textOf(byId(refusing.draw(), 'templates')), /uses \{user\}, which the dashboard does not know/);
  assert.equal(byId(refusing.draw(), 'template-message-duplicate').attrs.value, 'Hello {user}');
  refusing.click('undo-templates');
  assert.equal(byId(refusing.draw(), 'template-message-duplicate').attrs.value, DEFAULT_SETTINGS.emails.templates.duplicate.message);
});

test('every word the screen drew in these tests is plain: no cell name, column letter, code, long dash or double dash', () => {
  const texts = shown.filter((t) => typeof t === 'string' && t.trim());
  assert.ok(texts.length > 1000, `${texts.length} words looked at`);
  assertPlain(assert, texts, 'words on the screen');
  // Only the Campaigns box may say "ASIN number", and show the links and ASIN numbers staff typed.
  const typed = CAMPAIGNS.flatMap((c) => c.products.map((p) => p.given)).concat(['B0TESTFRS1', 'B0TESTFRS2']);
  const inBox = campaignWords.filter((t) => typeof t === 'string' && t.trim()).map((t) => typed.reduce((x, g) => x.split(g).join('(typed)'), t).replace(/ASIN numbers?/g, 'product numbers'));
  assert.ok(inBox.length > 20, `${inBox.length} words of the Campaigns box looked at`);
  assertPlain(assert, inBox, 'words in the Campaigns box');
  assert.ok(texts.every((t) => !/ASIN/.test(t)), 'nowhere else');
  assert.doesNotMatch(VIEW_SRC, /Tesseract,|by Tesseract|No API key|\(\.xlsx\)|\(\.csv\)/, 'none in the screen code either');
});
