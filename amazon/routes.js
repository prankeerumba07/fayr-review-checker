// The dashboard's routes, under /local/amazon/. serve.mjs has already checked
// the Host; here every request must also carry the page's session token and
// come from this page itself. Nothing here sends CORS headers.

import { createReadStream } from 'node:fs';
import { mkdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCheck, STEP_NAMES, PAUSE_SAYS } from './check.js';
import { StoreError, ROW_ID, CHECK_ID, SHOTS, MAX_PICTURE_BYTES, MAX_SHEET_BYTES, newCheckId, hasResult } from './store.js';
import { CAMPAIGN_ID, newCampaignId, productLines, confirmProducts, needsReading, readProduct, usable, campaignsFor, campaignsFound, brandIn } from './campaigns.js';
import { readOrderShot, readDeliveryShot, readReviewPicture } from './shot-read.js';
import { tesseractLanguages } from './ocr.js';
import { reviewLinkKind, linkKey, cellLinks, linkLabel, linksIn, isDriveLink } from './links.js';
import { openWorkbook, guessColumns, columnProblems, rememberedChoice, resultColumns, sheetRows, SheetError, FIELDS, RESULT_FIELDS, RESULT_HEADERS, columnLetter, orderIdOf, dateFromWords, amountOf } from './workbook.js';
import { downloadPicture, createPacer } from './pictures.js';
import { preparePicture } from './picture-fix.js';
import { loadSettings, saveEmails, SettingsError, TYPE_KEYS, DEFAULT_SETTINGS, typeWord } from './settings.js';
import { emailFor, emailName, hasEmail, EMAIL_KEYS, PLACEHOLDERS, MAX_SUBJECT, MAX_MESSAGE } from './emails.js';
import { createEmailSender } from './gmail.js';
import { createLineLog, EMAIL_LOG } from './line-log.js';
import { writeCells, headingStyle, WriteError } from './xlsx-write.js';
import { readZip } from './zip.js';
import { dayFirst } from './screen-text.js';
import { noteOf, rowName, joinAnd, clean } from './notes.js';
import { createLogin } from './login.js';
import { createGoogleLogin } from './google-login.js';
import { TYPE_FINAL, FINAL_KEYS, FINAL_WORDS, finalSentence, finalFromWords, finalOfSaved } from './final.js';

const MAX_FORM_BYTES = 3 * MAX_PICTURE_BYTES + 256 * 1024;
const MAX_JSON_BYTES = 64 * 1024;
/** How long a button pressed just after Stop waits for the stopped check to finish the step it is on. */
const STOPPING_WAIT_MS = 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const READING_NOW = "The products of a campaign are being read from Amazon.";
const SENDING_NOW = 'Emails are being sent.';
/** At most this many emails in one go. */
const MAX_EMAILS = 200;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        done = true;
        reject(new HttpError(413, 'That is too large to send here.'));
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on('error', (e) => {
      if (!done) {
        done = true;
        reject(e);
      }
    });
  });
}

/**
 * multipart/form-data as { fields, files, fileList }. files has the first
 * file of each field; fileList has every file, in order. A file part with no
 * name and no bytes is no file.
 */
export function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(String(contentType ?? ''));
  if (!m) throw new HttpError(400, 'The form could not be read.');
  const boundary = m[1] ?? m[2];
  const delim = Buffer.from(`--${boundary}`);
  const between = Buffer.from(`\r\n--${boundary}`);
  const fields = {};
  const files = {};
  const fileList = [];
  let pos = buf.indexOf(delim);
  while (pos >= 0) {
    pos += delim.length;
    if (buf[pos] === 0x2d && buf[pos + 1] === 0x2d) break;
    if (buf[pos] === 0x0d && buf[pos + 1] === 0x0a) pos += 2;
    const headEnd = buf.indexOf('\r\n\r\n', pos);
    if (headEnd < 0) break;
    const head = buf.toString('utf8', pos, headEnd);
    const end = buf.indexOf(between, headEnd + 4);
    if (end < 0) break;
    const data = buf.subarray(headEnd + 4, end);
    const disp = /content-disposition:\s*form-data\s*;([^\r\n]*)/i.exec(head)?.[1] ?? '';
    const name = /(?:^|;)\s*name="([^"]*)"/i.exec(disp)?.[1];
    const filename = /(?:^|;)\s*filename="([^"]*)"/i.exec(disp)?.[1];
    if (name) {
      if (filename !== undefined) {
        if (filename !== '' || data.length) {
          const file = { field: name, filename, data };
          if (!files[name]) files[name] = file;
          fileList.push(file);
        }
      } else fields[name] = data.toString('utf8');
    }
    pos = end + 2;
  }
  return { fields, files, fileList };
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(text));
  res.end(text);
}

function refuse(res, status, message, extra = {}) {
  sendJson(res, status, { statusCode: status, message, ...extra });
}

async function sendFile(res, file, type) {
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
  } catch {
    return refuse(res, 404, 'Not found.');
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', 'inline');
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
}

/** A cell's picture as the screen sees it: never its file name, hash or fingerprint. */
function pictureView(p, i) {
  if (p?.file) return { i, ok: true, type: p.type, at: p.at ?? null, link: p.link ?? null };
  return { i, ok: false, link: p?.link ?? null, problem: { kind: p?.problem?.kind ?? 'access', site: p?.problem?.site ?? null, says: p?.problem?.says ?? '' } };
}

/** What the Review link cell holds, for the screen. */
function reviewKind(r) {
  const s = r.shots?.review ?? {};
  if (s.picture) return 'picture';
  if (!s.links?.length) return s.text ? 'words' : 'empty';
  const k = reviewLinkKind(s.link).kind;
  return k === 'review' || k === 'amazon' ? 'amazon' : k === 'drive' || k === 'web' ? 'picture' : k;
}

/** An amount as rupees, as the table shows it: ₹654, ₹851.95, ₹1,299. Null when there is none. */
export function rupees(value) {
  if (!Number.isFinite(value) || value < 0) return null;
  const n = Math.round(value * 100) / 100;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/**
 * A row's name on the screen: "Row 23" for a row of the sheet, by its number
 * on the dashboard (the transactions are numbered from 1 in the sheet's order,
 * and the heading row is never one of them), "By hand #2" for one added by hand.
 */
const labelOf = (r) => (r.source === 'sheet' ? `Row ${r.n ?? '?'}` : `By hand #${r.hand ?? '?'}`);

/** The words a file's Status and Type are read back by, for a row's Status: each Type's words, and "Verified", which older files hold. */
export function resultWords(settings) {
  const norm = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return { norm, types: new Map(TYPE_KEYS.map((k) => [norm(typeWord(k, settings)), k])), verified: 'verified' };
}

/**
 * A row's Status ('pass', 'fail' or 'manual'): its check's; else, with a
 * Status in the file (until "Check every row again"), that Status when it is
 * already Pass, Fail or Needs Manual Staff Checking, or the one the file's
 * Type gives, or Pass for an older file's "Verified"; else null (not checked
 * yet).
 */
export function finalOfRow(r, words = null) {
  if (r.last) return r.last.final ?? TYPE_FINAL[r.last.typeKey] ?? 'manual';
  if (r.recheck || !String(r.prev?.status ?? '').trim()) return null;
  const fromFile = finalFromWords(r.prev.status);
  if (fromFile) return fromFile;
  const key = words?.types.get(words.norm(r.prev.type));
  if (key) return TYPE_FINAL[key];
  return words && words.norm(r.prev.status) === words.verified ? 'pass' : 'manual';
}

/** The key of a row's Type: its check's (or the one staff chose), else the one its Type in the file names; null when the row has no result. */
export function typeKeyOf(r, words = null) {
  if (r.last?.typeKey) return r.last.typeKey;
  if (!hasResult(r) || !r.prev) return null;
  return words?.types.get(words.norm(r.prev.type)) ?? null;
}

/** Each row of the sheet's row in the file, with its number on the dashboard: row 21 of the file is Row 20. */
export function rowNumbers(rows) {
  return new Map(rows.filter((r) => r.source === 'sheet' && Number.isInteger(r.row) && Number.isInteger(r.n)).map((r) => [r.row, r.n]));
}

/**
 * Words a check wrote before rows were numbered from 1, said with the
 * numbers the dashboard shows now: such a check named another row by its row
 * in the file ("row 21", "rows 37 and 74"), which is Row 20, Rows 36 and 73.
 */
export function renumbered(text, numbers) {
  if (typeof text !== 'string' || !numbers?.size) return text;
  return text.replace(/\b(rows?) (\d+(?:(?:, | and )\d+)*)/g, (_, word, list) => `${word} ${list.replace(/\d+/g, (d) => String(numbers.get(Number(d)) ?? d))}`);
}

/** A check's result as the screen is given it: one made before rows were numbered from 1 has its rows said with the numbers the dashboard shows now. */
export function resultView(result, numbers) {
  if (!result || result.numbered) return result;
  return {
    ...result,
    note: renumbered(result.note, numbers),
    finalSays: renumbered(result.finalSays, numbers),
    steps: Array.isArray(result.steps) ? result.steps.map((s) => (s && typeof s.detail === 'string' ? { ...s, detail: renumbered(s.detail, numbers) } : s)) : result.steps,
  };
}

/**
 * A row as the screen sees it. Pictures only through their own routes. Each
 * link of a cell comes with a few words saying where it goes; `words` are the
 * cell's own words when they are not a link themselves ("Open the screenshot").
 */
/** The staff mark on a row's result, as the screen sees it: { at, right, was: { final, typeKey, type } | null }, or null. */
function staffView(r) {
  const s = r.last?.staff;
  if (!s) return null;
  return { at: s.at ?? r.last.at, right: Boolean(s.right), was: s.was && typeof s.was === 'object' ? { final: s.was.final ?? null, typeKey: s.was.typeKey ?? null, type: s.was.type ?? null } : null };
}

export function rowView(r, words = null, numbers = null) {
  const shot = (which) => {
    const s = r.shots?.[which] ?? {};
    const links = s.links ?? [];
    return {
      text: s.text ?? '',
      link: s.link ?? '',
      links,
      labels: links.map((link) => ({ link, label: linkLabel(link) })),
      words: links.length && !linksIn(s.text ?? '').length ? s.text ?? '' : '',
      mismatch: s.mismatch ?? null,
      how: s.picture ?? null,
      pictures: (r.pictures?.[which] ?? []).map(pictureView),
    };
  };
  const final = finalOfRow(r, words);
  // A check made before rows were numbered from 1 named other rows by their row in the file.
  const said = (text) => (r.last?.numbered ? text : renumbered(text, numbers));
  return {
    id: r.id,
    source: r.source ?? 'manual',
    row: r.row ?? null,
    // The row's number on the dashboard, from 1; row is its row in the file.
    n: r.source === 'sheet' ? r.n ?? null : null,
    hand: r.hand ?? null,
    label: labelOf(r),
    orderId: r.orderId?.text ?? '',
    orderDate: r.orderDate?.value ? dayFirst(r.orderDate.value) : r.orderDate?.text ?? '',
    orderDateRead: Boolean(r.orderDate?.value),
    amount: rupees(r.amount?.value) ?? r.amount?.text ?? '',
    amountRead: Number.isFinite(r.amount?.value),
    product: r.product?.text ?? '',
    cells: r.cells ?? {},
    shots: Object.fromEntries(SHOTS.map((w) => [w, shot(w)])),
    // The file's other columns (such as the reviewer's name), by column number: their words, and where each link goes.
    values: Object.fromEntries(Object.entries(r.values ?? {}).map(([col, v]) => [col, { text: v?.text ?? '', labels: cellLinks(v?.text ?? '', v?.behind ?? '').links.map((link) => ({ link, label: linkLabel(link) })) }])),
    reviewKind: reviewKind(r),
    prev: r.prev ?? null,
    // The Status the uploaded file gave the row, as Pass, Fail or Needs Manual Staff Checking, even after the row is checked.
    prevFinal: r.prev ? finalOfRow({ ...r, last: null, recheck: false }, words) : null,
    // staff: when a staff member checked the result: right (true: "The result is right" was pressed, the result stays the dashboard's) or changed by hand (false: "Changed by staff"); was is what the dashboard itself said, for the count of right results.
    last: r.last ? { checkId: r.last.checkId, final: final ?? null, finalSays: said(r.last.finalSays) ?? null, status: FINAL_WORDS[final] ?? '', type: r.last.type, typeKey: r.last.typeKey, note: said(r.last.note), at: r.last.at, seconds: r.last.seconds ?? null, staff: staffView(r) } : null,
    // The email this row's Type has (its key), or null; and the emails sent about the row, the latest last (maybe: Gmail did not say it was sent).
    emailKey: hasEmail(typeKeyOf(r, words)) ? typeKeyOf(r, words) : null,
    emails: (Array.isArray(r.emails) ? r.emails : []).map((e) => ({ at: e.at, key: e.key, name: e.name, subject: e.subject, mode: e.mode === 'real' ? 'real' : 'test', maybe: Boolean(e.maybe) })),
    // The Status: 'pass', 'fail', 'manual', or null when the row is not checked yet; its word is Pass, Fail or Needs Manual Staff Checking, and finalSays is its reason, from the Note's first sentence.
    final,
    finalSays: said(r.last?.finalSays) ?? null,
    // A result of any kind, so "Start checking" passes the row by; recheck: "Check every row again" was pressed, so the file's Status no longer counts.
    done: hasResult(r),
    recheck: Boolean(r.recheck),
    createdAt: r.createdAt,
  };
}

/**
 * The table's columns: every column of the file, in its order, each with its
 * letter, its name in the heading row, and the field it holds (key, or null
 * for a column only shown, such as the reviewer's name); then the Status, Type
 * and Note columns the file does not have, which the checked Excel file adds
 * after the last one. A file's own Status, Type or Note column is that same
 * column, never shown twice.
 */
function tableColumns(tab, mapping) {
  const results = resultColumns(mapping, tab.lastCol);
  const fieldAt = new Map(FIELDS.filter((f) => Number.isInteger(mapping[f.key])).map((f) => [mapping[f.key], f.key]));
  const cols = (tab.headers ?? []).map((h) => ({ key: fieldAt.get(h.col) ?? null, col: h.col, letter: columnLetter(h.col), name: h.text, added: false }));
  for (const a of results.added) cols.push({ key: RESULT_FIELDS.find((k) => results[k] === a.col) ?? null, col: a.col, letter: columnLetter(a.col), name: a.header, added: true });
  return cols;
}

/** The fields checked against the screenshots and the review, in the order a row is checked. */
const CHECKED_FIELDS = ['orderId', 'orderDate', 'amount', 'product', 'orderShot', 'deliveryShot', 'reviewShot', 'reviewLink'];

/** The columns a file has, for a check: { orderDate, amount, product, orderShot, deliveryShot, reviewShot, reviewLink }; null with no file (every one then). */
function columnsHad(view) {
  if (!view?.mapping) return null;
  return Object.fromEntries(CHECKED_FIELDS.filter((k) => k !== 'orderId').map((k) => [k, Number.isInteger(view.mapping[k])]));
}

/** What the file does not have, and what that means. */
const LACKS = {
  orderDate: 'This file has no order date, so order dates are not compared.',
  amount: 'This file has no amount, so amounts are not compared.',
  product: 'This file has no product name, so products are not compared.',
  orderShot: 'This file has no purchase screenshot, so every row needs a staff member to check the purchase.',
  deliveryShot: 'This file has no delivery screenshot, so every row needs a staff member to check the delivery.',
  reviewLink: 'This file has no review link, so each review is read from its review screenshot.',
};

/** Which live campaign the rows use: by the brand in their product names, or else in the file's name or the tab's name; or that none was found, plainly when the brand has only a campaign marked Ended. */
function campaignSaid(view, rows, campaigns) {
  const places = [view.fileName, view.tab].filter(Boolean);
  const placeOf = (c) => (brandIn(view.fileName, c.brand) ? "the file's name" : "the tab's name");
  const count = (n) => (n === 1 ? '1 row' : `${n} rows`);
  const tally = new Map();
  const endedOnly = new Map();
  let none = 0;
  for (const r of rows.filter((x) => x.source === 'sheet')) {
    const found = campaignsFound(r.product?.text ?? '', campaigns, places);
    if (!found.list.length) {
      none++;
      for (const c of campaignsFound(r.product?.text ?? '', campaigns, places, { live: false }).list) endedOnly.set(c.id, c);
    }
    for (const c of found.list) {
      const t = tally.get(c.id) ?? { c, product: 0, file: 0 };
      t[found.by]++;
      tally.set(c.id, t);
    }
  }
  const ended = [...endedOnly.values()];
  const endedSaid = ended.length ? ` ${ended.length === 1 ? `The campaign ${quotedName(ended[0])} has the brand, but it is marked Ended, so it is not used` : `The campaigns ${joinAnd(ended.map(quotedName))} have the brand, but they are marked Ended, so they are not used`}: mark it Live in the Campaigns box to use it.` : '';
  if (!tally.size) {
    if (ended.length) return `No live campaign was found for these rows, so each product is compared with its name in the file.${endedSaid}`;
    return "No campaign was found for these rows: no campaign's brand is in their product names, the file's name or the tab's name, so each product is compared with its name in the file.";
  }
  const how = ({ c, product, file }) => (product && file ? "their product names or the file's name" : product ? 'their product names' : placeOf(c));
  const named = (c) => `the live campaign "${c.name}"`;
  const list = [...tally.values()];
  if (list.length === 1 && !none) return `The rows use ${named(list[0].c)}: its brand, ${list[0].c.brand}, is in ${how(list[0])}.`;
  const said = `The rows use ${joinAnd(list.map((t) => `${named(t.c)} (${count(t.product + t.file)}, by ${how(t)})`))}.`;
  return none ? `${said} ${count(none)} ${none === 1 ? 'uses no campaign, so its product is compared with its name' : 'use no campaign, so their products are compared with their names'} in the file.${endedSaid}` : said;
}
const quotedName = (c) => `"${c.name}"`;

/** The row's reviewer name, from the file's Reviewer Name column (shown in the table, and compared with the name on the review); null when the file has no such column. */
function reviewerOf(row, sheet) {
  const col = sheet?.mapping?.reviewer;
  return Number.isInteger(col) ? String(row?.values?.[col]?.text ?? '') : null;
}

/**
 * The short lines under the upload line: which of the file's columns are used
 * for checking, which are only shown, what the file does not have and what
 * that means, and which campaign the rows use.
 */
function aboutFile(view, rows, campaigns) {
  if (!view?.mapping || !view.used) return [];
  const m = view.mapping;
  const named = (h) => (/^Column [A-Z]{1,3}$/.test(h.text) ? 'a column with no name' : h.text);
  const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] ?? '');
  const checked = new Set(CHECKED_FIELDS.map((k) => m[k]).filter(Number.isInteger));
  const results = new Set(RESULT_FIELDS.map((k) => m[k]).filter(Number.isInteger));
  const out = [`Used for checking: ${list(view.headers.filter((h) => checked.has(h.col)).map(named))}.`];
  const shown = view.headers.filter((h) => !checked.has(h.col) && !results.has(h.col)).map(named);
  if (shown.length) out.push(`Only shown, not used for checking: ${list(shown)}.`);
  for (const [k, said] of Object.entries(LACKS)) if (!Number.isInteger(m[k])) out.push(said);
  const added = RESULT_FIELDS.filter((k) => !Number.isInteger(m[k])).map((k) => RESULT_HEADERS[k]);
  if (added.length) out.push(`It has no ${added.length > 1 ? `${added.slice(0, -1).join(', ')} or ${added.at(-1)}` : added[0]} column, so the checked Excel file adds ${added.length === 1 ? 'it' : 'them'} after the last column.`);
  out.push(campaignSaid(view, rows, campaigns));
  return out;
}

/** What the screen is told about the uploaded sheet: its name, the one tab read, and its columns. Never any other tab. */
function sheetView(s) {
  if (!s) return null;
  const name = s.usedTab ?? s.tab;
  const tab = (s.tabs ?? []).find((t) => t.name === name) ?? null;
  const mapping = s.usedMapping ?? s.mapping ?? null;
  return {
    fileName: s.fileName ?? '',
    kind: s.kind,
    tab: tab?.name ?? null,
    headers: tab?.headers ?? [],
    lastCol: tab?.lastCol ?? 0,
    mapping,
    // The fields the file has a column for: a field it does not have never shows.
    has: mapping ? FIELDS.filter((f) => Number.isInteger(mapping[f.key])).map((f) => f.key) : [],
    columns: tab && mapping ? tableColumns(tab, mapping) : [],
    resultColumns: tab && mapping ? resultColumns(mapping, tab.lastCol) : null,
    used: Boolean(s.usedAt),
    uploadedAt: s.uploadedAt ?? null,
  };
}

/** A file name as safe words for a download: no folder, no quotes, no control characters. */
function downloadName(fileName, today, ext = 'xlsx') {
  const base = String(fileName ?? '').toWellFormed().split(/[\\/]/).pop().replace(/\.(xlsx|xlsm|csv)$/i, '').replace(/[\u0000-\u001f"\\]/g, '').trim() || 'sheet';
  return `${base} checked ${today}.${ext}`;
}

/** Today in India, as 2026-10-05. */
function todayInIndia(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * store — store.js; live — a LiveBrowser; images — an ImageReader;
 * login — login.js's, for the top bar (made from live when not given);
 * auth(req) — true when the request carries this page's session token.
 * check, download, readers, settings and pause can be replaced in tests.
 */
export function createAmazonRoutes({ store, live, images, auth, log = () => {}, check = runCheck, download = downloadPicture, prepare = preparePicture, readers = null, settings: getSettings = () => loadSettings(), saveEmailSettings = saveEmails, now = () => new Date(), login = createLogin({ live }), google = createGoogleLogin({ live, store, log }), sender = null, emailLog = null }) {
  let running = null; // { kind: 'check' | 'run' | 'sheet' | 'remove' | 'campaign' | 'email', rowId, stop }
  // Sends an email through Gmail in the Live Amazon Browser (gmail.js); tests give a pretend one.
  const mailer = sender ?? createEmailSender({ live, google, now });
  // Every try at sending an email: the time, the row, what happened and the reason, in the Terminal window and in data/email-log.txt; never the email's words or address, nor what the file has in its email address cell.
  const emailLines = emailLog ?? createLineLog(join(store.dataDir, EMAIL_LOG), { log, now });
  let finalsFilled = null; // rows checked before the three Status words were added get one, once
  let rowsNumbered = null; // rows of a sheet uploaded before rows were numbered from 1 get their number, once
  const numberRows = () => (rowsNumbered ??= store.numberRows().catch(() => ((rowsNumbered = null), 0)));
  let gapSeconds = 1;
  const pacer = createPacer(() => gapSeconds * 1000);

  /** What runs now, as the first words of a refusal: the campaign's products being read, emails being sent, or something else. */
  const busyWords = () => (running?.kind === 'campaign' ? READING_NOW : running?.kind === 'email' ? SENDING_NOW : 'Something else is running.');
  /** Marks something as running at once, before any waiting, so two things never start together. Null when something else runs. */
  function claim(kind, rowId = null) {
    if (running) return null;
    running = { kind, rowId, stop: new AbortController() };
    return running;
  }
  function release(job) {
    if (running === job) running = null;
  }
  /** A streamed job stops when the page closes its request (Stop). */
  function stopOnClose(job, res) {
    res.on('close', () => {
      if (!res.writableFinished) job.stop.abort();
    });
  }
  function endStream(res) {
    if (res.headersSent && !res.writableEnded) res.end();
  }
  function streamTo(res) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.flushHeaders();
    return (e) => {
      if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(e)}\n`);
    };
  }

  /** settings.json, or a refusal saying what is wrong with it. */
  async function currentSettings() {
    const s = await getSettings();
    gapSeconds = s.secondsBetweenDownloads;
    return s;
  }

  // ---- pictures ----

  /** A picture link of a cell that is downloaded: every screenshot link, and a review link that is a picture. */
  const downloadable = (which, link) => which !== 'review' || ['drive', 'web'].includes(reviewLinkKind(link).kind);

  async function fingerprint(row) {
    for (const which of SHOTS) {
      for (const [i, p] of (row.pictures?.[which] ?? []).entries()) {
        if (!p.file || p.fingerprint) continue;
        try {
          const out = await images.analyse(store.pictureFile(row, which, i), p.type);
          if (out?.fingerprint) await store.setFingerprint(row.id, which, i, out.fingerprint);
        } catch {
          // left without one; a picture without a fingerprint is compared by its bytes only
        }
      }
    }
  }

  /**
   * Downloads one link, kept apart from the last download. A Google Drive
   * link is downloaded by the Live Amazon Browser itself, with its Google
   * login, without opening a page; other websites never with a login.
   */
  function fetchOne(link, settings, signal) {
    return pacer.run(async () => {
      const opts = { allowed: settings.allowedPictureWebsites, signal };
      if (isDriveLink(link) && typeof live.fetch === 'function') {
        try {
          await live.begin();
        } catch {
          return { ok: false, kind: 'busy', site: 'Google Drive', says: 'the Live Amazon Browser could not be opened, so it was not downloaded' };
        }
        opts.fetch = (url, init) => live.fetch(url, { headers: init?.headers ?? {}, signal: init?.signal ?? null });
      }
      // A PDF's pages are turned into one picture, and a picture too large to keep is made smaller, on this computer.
      return prepare(await download(link, opts));
    });
  }
  /** The words kept with a picture that could not be had: its reason, and whether Google said the account has no access (the only "Need Google Drive Access"). */
  const problemOf = (out) => ({ kind: out.kind, site: out.site, says: out.says, ...(out.noAccess ? { noAccess: true } : {}) });
  /** The Google login is in use: a Google Drive file can be downloaded. */
  const googleIn = () => google.view().state === 'in';
  /** The words kept with a Google Drive picture that was not downloaded because no one is logged in to Google. */
  const NO_GOOGLE = { kind: 'drive', site: 'Google Drive', says: 'no one is logged in to Google, so it was not downloaded yet' };
  /** Google's login page while downloading: the saved Google login has ended, so the top bar says so. */
  function noteDownload(out) {
    if (out?.pause === 'google-signin') google.loggedOut?.();
    return out;
  }

  /**
   * A cell's pictures for a check: the ones kept, and those that could not be
   * had downloaded once more (the owner may have opened them since). A Google
   * Drive file with no Google login, or a download Google answers with its
   * login page, a robot check or a block, pauses the check instead:
   * { pause }, with nothing saved for the cell.
   */
  async function picturesFor(rowId, which, settings, signal) {
    let row = await store.get(rowId);
    const kept = row?.pictures?.[which] ?? [];
    const links = (row?.shots?.[which]?.links ?? []).filter((l) => downloadable(which, l));
    if (links.length && (kept.length !== links.length || kept.some((p) => !p.file))) {
      const list = [];
      for (const link of links) {
        const had = kept.find((p) => p.file && p.link && linkKey(p.link) === linkKey(link));
        if (had) {
          list.push({ link, keep: had });
          continue;
        }
        if (isDriveLink(link) && !googleIn()) return { pause: 'google-out', files: [], problems: [], types: [], records: kept };
        const out = noteDownload(await fetchOne(link, settings, signal));
        if (out.pause) return { pause: out.pause, files: [], problems: [], types: [], records: kept };
        list.push(out.ok ? { link, data: out.data } : { link, problem: problemOf(out) });
      }
      // The pictures kept before are read again from their files, so setPictures can keep them in order.
      const items = [];
      for (const x of list) {
        if (x.keep) {
          items.push({ link: x.link, data: await readFile(store.pictureFile(row, which, kept.indexOf(x.keep))), fingerprint: x.keep.fingerprint });
        } else items.push(x);
      }
      row = await store.setPictures(rowId, which, items);
      await fingerprint(row);
      row = await store.get(rowId);
    }
    const pics = row?.pictures?.[which] ?? [];
    return {
      files: pics.map((p, i) => (p.file ? store.pictureFile(row, which, i) : null)).filter(Boolean),
      problems: pics.filter((p) => p.problem).map((p) => ({ link: p.link, ...p.problem })),
      types: pics.filter((p) => p.file).map((p) => p.type),
      // The cell's pictures as they are now, so the check compares a picture just downloaded with other rows' too.
      records: pics,
    };
  }

  // ---- checks ----

  /** One row's check, streamed through emit; saved unless it was stopped or paused. */
  async function checkOne(row, emit, signal, settings) {
    const started = Date.now();
    const checkId = newCheckId();
    const dir = store.checkDir(checkId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    // Checks keep a copy of each Amazon page they open, to be made into test fixtures, until one check has kept them all.
    const pagesDir = !(await store.keptPages()) ? join(dir, 'pages') : null;
    if (pagesDir) await mkdir(pagesDir, { recursive: true, mode: 0o700 });
    await numberRows();
    const fresh = (await store.get(row.id)) ?? row;
    await fingerprint(fresh);
    const all = await store.list();
    const me = all.find((r) => r.id === fresh.id) ?? fresh;
    const others = all.filter((r) => r.id !== fresh.id);
    // Each picture file's type, for reading the review picture, whichever cell it is in.
    const types = new Map();
    const sheet = sheetView(await store.sheet());
    const result = await check({
      row: me,
      others,
      settings,
      // The campaigns whose brand is in the row's product name, or else in the file's name or the tab's name (live ones first), with the products read from Amazon.
      campaigns: campaignsFor(me.product?.text ?? '', await store.campaigns(), [sheet?.fileName, sheet?.tab].filter(Boolean)),
      // The columns the file has: a column it does not have is left out of the check.
      has: columnsHad(sheet),
      // The name in the file's Reviewer Name column, compared with the name on the review; null when the file has no such column.
      reviewer: reviewerOf(me, sheet),
      pictures: async (which) => {
        const got = await picturesFor(me.id, which, settings, signal);
        got.files.forEach((f, i) => types.set(f, got.types[i]));
        return got;
      },
      // A screenshot that lacks what is looked for is read again other ways; two of them read a copy made in the headless Chrome.
      readOrder: readers?.order ?? ((files, opts) => readOrderShot(files, { ...opts, prepare: (f, how) => images.forReading(f, types.get(f) ?? 'image/png', how) })),
      readDelivery: readers?.delivery ?? ((files, opts) => readDeliveryShot(files, { ...opts, prepare: (f, how) => images.forReading(f, types.get(f) ?? 'image/png', how) })),
      readReview:
        readers?.review ??
        ((files, opts) => readReviewPicture(files, { ...opts, analyse: (f) => images.analyse(f, types.get(f) ?? 'image/png'), settings, product: opts?.product ?? me.product?.text ?? '' })),
      browser: live,
      emit,
      signal,
      checkId,
      shotsDir: dir,
      pagesDir,
      now,
    });
    // How long the row took, for its line in the table: "took 42 seconds".
    result.seconds = Math.max(0, Math.round((Date.now() - started) / 1000));
    if (!result.stopped && !result.paused) {
      await store.saveResult(result);
      // Another row whose review this is: Duplicate too.
      for (const d of result.alsoDuplicate ?? []) {
        const id = typeof d === 'string' ? d : d?.id;
        const twin = id ? await store.get(id) : null;
        // A result a staff member changed by hand is kept (one only marked right by staff is not: the check replaces it, and the mark goes).
        if (!twin || (twin.last?.staff && !twin.last.staff.right)) continue;
        await store.saveResult({
          checkId: newCheckId(),
          rowId: id,
          status: FINAL_WORDS.fail,
          type: typeWord('duplicate', settings),
          typeKey: 'duplicate',
          final: 'fail',
          numbered: true,
          finalSays: d?.finalSays ?? finalSentence('fail', `it is a duplicate: it shares an order, a screenshot or a review with ${rowName(me)}, which is the one checked`),
          note: d?.note ?? noteOf([finalSentence('fail', `it is a duplicate: it shares an order, a screenshot or a review with ${rowName(me)}, which is the one checked`)]),
          finishedAt: now().toISOString(),
          reviewId: twin.last?.reviewId ?? null,
          steps: [],
          comparison: [],
          from: result.checkId,
        });
      }
    }
    return result;
  }

  /**
   * A check that was just stopped (Stop, or its page closed) finishes the
   * step it is on first. A button pressed again meanwhile waits for that, at
   * most a minute, instead of being refused. False when the page closed this
   * request while it waited.
   */
  async function afterStopping(res) {
    let closed = false;
    const onClose = () => (closed = true);
    res.once('close', onClose);
    const end = Date.now() + STOPPING_WAIT_MS;
    while (running?.stop.signal.aborted && !closed && Date.now() < end) await sleep(50);
    res.off('close', onClose);
    return !closed;
  }

  /**
   * When the top bar says "Not logged in to Amazon" as checking starts, the
   * login is read again first, the way "Log in to Amazon" reads it, so a
   * saved login the check at start missed is found before the first row.
   */
  async function loginFirst(why) {
    if (login.view().state !== 'out' || login.busy || !login.recheck) return;
    try {
      await login.recheck(why);
    } catch {
      // the check goes on; a login Amazon asks for pauses it, as always
    }
  }

  /** A row with a Google Drive picture still to be downloaded: it needs the Google login. */
  function needsGoogle(row) {
    return SHOTS.some((w) => {
      const kept = row?.pictures?.[w] ?? [];
      return (row?.shots?.[w]?.links ?? []).filter((l) => downloadable(w, l) && isDriveLink(l)).some((l) => !kept.some((p) => p.file && p.link && linkKey(p.link) === linkKey(l)));
    });
  }
  /**
   * Before a row that needs the Google login while the top bar says no one
   * is logged in to Google: the saved profile's cookies are read again (no
   * page is opened). Still no one, and checking pauses before the row.
   * -> true when the row can be checked
   */
  async function googleFirst(row, why) {
    if (!needsGoogle(row)) return true;
    if (!googleIn() && !google.busy && google.check) {
      try {
        await google.check(why);
      } catch {
        // said below
      }
    }
    return googleIn();
  }
  /** Why nothing can use the Live Amazon Browser just now because of the Google login, naming the button to press later; null when it can. */
  function googleBusy(button, again = '') {
    if (google.busy) return `The Google login is being checked. Wait a moment, then press ${button}${again}.`;
    if (google.view().chrome) return `A normal Chrome window is open for the Google login. Log in to Google there and press "I have logged in", then press ${button}${again}.`;
    return null;
  }

  /** A row's own button, as the screen words it: Check, or "Check again" once the row has a result. */
  const checkButton = (row) => (row && hasResult(row) ? '"Check again"' : 'Check');
  /** The button that checks the rows one by one: "Carry on checking" once a row has a result. */
  const runButton = (rows) => (rows.some(hasResult) ? '"Carry on checking"' : '"Start checking"');

  /** "Check" or "Check again": that row only. */
  async function startCheck(req, res, id) {
    const button = checkButton(await store.get(id));
    if (!(await afterStopping(res))) return;
    if (login.busy) return refuse(res, 409, `The Amazon login is being checked. Wait a moment, then press ${button}.`);
    if (googleBusy(button)) return refuse(res, 409, googleBusy(button));
    const job = claim('check', id);
    if (!job) return refuse(res, 409, `${busyWords()} Wait for it to finish, then press ${button}.`);
    stopOnClose(job, res);
    try {
      const row = await store.get(id);
      if (!row) return refuse(res, 404, 'No row has that id.');
      let settings;
      try {
        settings = await currentSettings();
      } catch (err) {
        if (err instanceof SettingsError) return refuse(res, 400, err.message);
        throw err;
      }
      await loginFirst(`before checking ${labelOf(row).toLowerCase()}`);
      if (job.stop.signal.aborted) return;
      const emit = streamTo(res);
      try {
        // A live campaign's products not read yet are read first; a login page, a robot check or a block pauses here.
        const stopped = await readLiveCampaigns(job, emit);
        if (stopped) return emit({ event: 'paused', kind: stopped, says: PAUSE_SAYS[stopped].replace('"Carry on checking"', button) });
        if (job.stop.signal.aborted) return;
        // A row with a Google Drive screenshot to download needs the Google login: with none, the check pauses before it.
        if (!(await googleFirst(row, `before checking ${labelOf(row).toLowerCase()}`))) return emit({ event: 'paused', kind: 'google-out', says: PAUSE_SAYS['google-out'].replace('"Carry on checking"', button) });
        if (job.stop.signal.aborted) return;
        const result = await checkOne(row, emit, job.stop.signal, settings);
        // The pause names the button that is there for this row.
        if (result.paused) emit({ event: 'paused', kind: result.paused.kind, says: result.paused.says.replace('"Carry on checking"', button) });
      } catch (err) {
        log(`check failed: ${err?.name ?? 'Error'}`);
        emit({ event: 'failed', says: `Something went wrong on this computer part way through the check. Nothing was saved for it; press ${button} to try again.` });
      }
    } finally {
      release(job);
      endStream(res);
    }
  }

  /** How many rows there are, how many have a result, and how many are left. */
  function tally(rows) {
    const done = rows.filter(hasResult).length;
    return { total: rows.length, done, left: rows.length - done };
  }

  /**
   * "Start checking" (later "Carry on checking"): the rows with no result
   * yet, one at a time, from the top, in the sheet's order with the rows
   * added by hand after it. "Check every row again" (again) first removes
   * every result. A login page, a robot check or a block pauses it; Stop, or
   * the page closing, stops it at once. Either way the row it was on gets no
   * result, so it is the first one checked next time.
   */
  async function checkAll(req, res, body) {
    const again = body?.again === true;
    const button = again ? '"Check every row again"' : runButton(await store.list());
    if (!(await afterStopping(res))) return;
    if (login.busy) return refuse(res, 409, `The Amazon login is being checked. Wait a moment, then press ${button} again.`);
    if (googleBusy(button, ' again')) return refuse(res, 409, googleBusy(button, ' again'));
    const job = claim('run');
    if (!job) return refuse(res, 409, `${busyWords()} Wait for it to finish, then press ${button} again.`);
    stopOnClose(job, res);
    try {
      const rows = await store.list();
      if (!rows.length) return refuse(res, 400, 'There are no rows to check. Upload the sheet first.');
      if (!again && rows.every(hasResult)) return refuse(res, 409, 'All rows are checked. To check them all again, press "Check every row again".');
      let settings;
      try {
        settings = await currentSettings();
      } catch (err) {
        if (err instanceof SettingsError) return refuse(res, 400, err.message);
        throw err;
      }
      await loginFirst(again ? 'before checking every row again' : 'before checking the rows');
      if (job.stop.signal.aborted) return;
      if (again) await store.clearResults();
      await runAll(job, res, settings, again);
    } finally {
      release(job);
      endStream(res);
    }
  }

  async function runAll(job, res, settings, again) {
    const emit = streamTo(res);
    const tried = new Set(); // no row is checked twice in one go
    const counts = { checked: 0, pass: 0, fail: 0, manual: 0 };
    const words = resultWords(settings);
    try {
      await numberRows();
      let rows = await store.list();
      emit({ event: 'run-started', again, ...tally(rows) });
      // A live campaign's products not read yet are read before the first row; a login page, a robot check or a block pauses here.
      const stopped = await readLiveCampaigns(job, emit);
      if (stopped) {
        emit({ event: 'paused', kind: stopped, says: PAUSE_SAYS[stopped], ...counts, ...tally(rows) });
        return;
      }
      for (;;) {
        if (job.stop.signal.aborted) break;
        // The first row with no result. A row the last check marked Duplicate has one now, so it is passed by.
        const r = rows.find((x) => !hasResult(x) && !tried.has(x.id));
        if (!r) break;
        tried.add(r.id);
        job.rowId = r.id;
        emit({ event: 'row', rowId: r.id, label: labelOf(r), ...tally(rows) });
        // The first row with a Google Drive screenshot to download needs the Google login: with none, checking pauses before it.
        if (!(await googleFirst(r, `before checking ${labelOf(r).toLowerCase()}`))) {
          emit({ event: 'paused', kind: 'google-out', says: PAUSE_SAYS['google-out'], rowId: r.id, label: labelOf(r), ...counts, ...tally(rows) });
          return;
        }
        if (job.stop.signal.aborted) break;
        const result = await checkOne(r, emit, job.stop.signal, settings);
        if (result.stopped) break;
        if (result.paused) {
          emit({ event: 'paused', kind: result.paused.kind, says: result.paused.says, rowId: r.id, label: labelOf(r), ...counts, ...tally(rows) });
          return;
        }
        counts.checked++;
        const status = result.final ?? TYPE_FINAL[result.typeKey];
        if (counts[status] !== undefined) counts[status]++;
        rows = await store.list();
        // The row's new line for the table, and the line of each row it made Duplicate, before the next row starts.
        const changed = new Set([r.id, ...(result.alsoDuplicate ?? []).map((d) => (typeof d === 'string' ? d : d?.id))]);
        emit({ event: 'row-done', rowId: r.id, label: labelOf(r), final: result.final, finalSays: result.finalSays, status: result.status, type: result.type, note: result.note, seconds: result.seconds, rows: rows.filter((x) => changed.has(x.id)).map((x) => rowView(x, words, rowNumbers(rows))), ...tally(rows) });
      }
      rows = await store.list();
      emit({ event: job.stop.signal.aborted ? 'run-stopped' : 'run-done', ...counts, ...tally(rows) });
    } catch (err) {
      log(`checking failed: ${err?.name ?? 'Error'}`);
      emit({ event: 'failed', says: 'Something went wrong on this computer part way through checking. The rows finished before it keep their results. Press "Carry on checking" to go on from the row it was on.' });
    }
  }

  // ---- the sheet ----

  /** The columns staff chose, sent with the file again: { [field]: column number | null }, or null when none were sent. */
  function chosenColumns(raw) {
    if (raw === undefined || raw === '') return null;
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'The chosen columns could not be read.');
    }
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new HttpError(400, 'The chosen columns could not be read.');
    return Object.fromEntries(FIELDS.map((f) => [f.key, m[f.key] === null || m[f.key] === undefined || m[f.key] === '' ? null : m[f.key]]));
  }

  /** The one sentence saying which needed column could not be found: the order ID, or the review link and the review screenshot. */
  function missingSays(mapping) {
    const noId = !Number.isInteger(mapping.orderId);
    const noReview = !Number.isInteger(mapping.reviewLink) && !Number.isInteger(mapping.reviewShot);
    if (noId && noReview) return 'No column of this file could be found for the order ID, nor for the review link or the review screenshot, so choose them below (every other column can be left as "Not in this file").';
    if (noId) return 'No column of this file could be found for the order ID, so choose it below (every other column can be left as "Not in this file").';
    return 'No column of this file could be found for the review link or the review screenshot, so choose one of them below (every other column can be left as "Not in this file").';
  }

  /** What runs now, in one plain sentence's first words, for a message about uploading. */
  function runningSays() {
    if (running?.kind === 'check' || running?.kind === 'run') return 'Rows are being checked right now';
    if (running?.kind === 'campaign') return "A campaign's products are being read from Amazon right now";
    if (running?.kind === 'sheet') return 'Another file is being uploaded right now';
    if (running?.kind === 'remove') return 'Rows are being removed right now';
    if (running?.kind === 'email') return 'Emails are being sent right now';
    return 'Something else is running right now';
  }

  /**
   * Uploading a file makes its rows at once, from the "Amazon" tab (or the
   * only tab), with the columns found by their names in the heading row. The
   * rows of the file before, and their results, go; the rows added by hand
   * and the campaigns stay. Nothing is downloaded and no link is opened: a
   * row's pictures are opened when that row is checked; pictures placed
   * inside cells are part of the file, so they are kept. When a needed column
   * cannot be found, nothing changes: the screen is told which, and sends the
   * file again with the columns chosen. Rows with results are replaced only
   * when the screen has asked first (replace=1). Rows being checked, or a
   * campaign's products being read, stop first when the screen has asked that
   * too (stop=1), and only once the file is known to be readable.
   */
  async function uploadSheet(req, res) {
    const { fields, files } = await readForm(req, MAX_SHEET_BYTES + 256 * 1024);
    const file = files.file ?? files.sheet;
    if (!file) return refuse(res, 400, 'Choose the Excel file first.');
    const chosen = chosenColumns(fields.mapping);
    let tab;
    let kind;
    try {
      ({ tab, kind } = await openWorkbook(file.data, { fileName: file.filename }));
    } catch (err) {
      if (err instanceof SheetError) return refuse(res, 400, err.message);
      throw err;
    }
    const mapping = chosen ?? guessColumns(tab.headers, await store.columnChoice(), tab);
    const problems = columnProblems(mapping, tab.headers);
    if (problems.length && chosen) return refuse(res, 400, problems.join(' '), { problems });
    if (problems.length) {
      return sendJson(res, 200, { columns: { says: missingSays(mapping), kind, tab: tab.name, headers: tab.headers, lastCol: tab.lastCol, mapping, fields: FIELDS } });
    }
    let made;
    try {
      made = sheetRows(tab, mapping);
    } catch (err) {
      if (err instanceof SheetError) return refuse(res, 400, err.message);
      throw err;
    }
    const unasked = async () => fields.replace !== '1' && (await store.list()).some((r) => r.source === 'sheet' && r.last);
    const UNASKED = 'Rows were checked since the screen last showed them, so upload the file again to be asked first whether their results may go.';
    if (await unasked()) return refuse(res, 409, UNASKED);
    // Checking, or a campaign's products being read, stops first when the screen asked: it finishes the step it is on, at most a minute.
    const stoppable = ['check', 'run', 'campaign'].includes(running?.kind);
    if (stoppable && fields.stop === '1') {
      running.stop.abort();
      if (!(await afterStopping(res))) return;
    }
    const job = claim('sheet');
    if (!job) {
      if (stoppable && fields.stop === '1') return refuse(res, 409, `${runningSays()} and it did not stop in time, so wait a moment, then upload the file again.`);
      if (['check', 'run', 'campaign'].includes(running?.kind)) return refuse(res, 409, `${runningSays()}, so upload the file again to be asked whether to stop that first.`);
      return refuse(res, 409, `${runningSays()}, so wait for it to finish, then upload the file again.`);
    }
    try {
      if (await unasked()) return refuse(res, 409, UNASKED);
      const { rows, unplaced } = made;
      const tabInfo = { name: tab.name, state: tab.state, headerRow: tab.headerRow, headers: tab.headers, lastCol: tab.lastCol, rowCount: tab.rowCount };
      const at = now().toISOString();
      // `tabs` holds only the tab read, as the checked Excel file needs it.
      const info = { fileName: Array.from(String(file.filename ?? '')).slice(0, 200).join(''), kind, tabs: [tabInfo], tab: tab.name, mapping, usedAt: at, usedTab: tab.name, usedMapping: mapping };
      await store.saveSheet(info, file.data);
      await store.setColumnChoice(rememberedChoice(mapping, tab.headers));
      const cells = (n) => Object.fromEntries(Object.entries(mapping).filter(([, col]) => Number.isInteger(col)).map(([key, col]) => [key, `${columnLetter(col)}${n}`]));
      const saved = await store.replaceSheetRows(rows.map((r) => ({ ...r, cells: cells(r.row), shots: Object.fromEntries(SHOTS.map((w) => [w, { ...r.shots[w], picture: r.shots[w].picture?.how ?? null }])) })));
      // Pictures placed inside cells are part of the file: kept at once. A picture that cannot be kept is that cell's problem; the other rows carry on.
      for (const [i, r] of rows.entries()) {
        for (const w of SHOTS) {
          const p = r.shots[w].picture;
          if (!p) continue;
          const problem = !p.type ? 'it is not a picture the dashboard can read' : p.data.length > MAX_PICTURE_BYTES ? 'it is larger than 10 megabytes' : null;
          await store.setPictures(saved[i].id, w, [problem ? { link: null, problem: { kind: 'sheet', site: null, says: problem } } : { link: null, data: p.data }]);
        }
      }
      return sendJson(res, 200, { made: saved.length, tab: tab.name, unplaced, sheet: sheetView(await store.sheet()) });
    } finally {
      release(job);
    }
  }

  /** The uploaded Excel file with each checked row's Status (Pass, Fail or Needs Manual Staff Checking), Type and Note written in, and nothing else changed. */
  async function checkedExcel(res) {
    const s = await store.sheet();
    const data = await store.sheetData();
    if (!s || !data) return refuse(res, 400, 'Upload the Excel file first.');
    if (s.kind !== 'xlsx') return refuse(res, 400, 'The uploaded sheet is not an Excel file, so there is no Excel file to fill in. Press "Download", then "The results only", instead.');
    // The tab and the columns the rows were made from, even if another tab has been chosen since.
    const tab = (s.tabs ?? []).find((t) => t.name === s.usedTab);
    const mapping = s.usedMapping ?? s.mapping;
    if (!s.usedAt || !tab || !mapping) return refuse(res, 400, 'Upload the Excel file first.');
    const cols = resultColumns(mapping, tab.lastCol);
    const writes = [];
    await numberRows();
    const rows = await store.list();
    const numbers = rowNumbers(rows);
    for (const r of rows) {
      if (r.source !== 'sheet' || !Number.isInteger(r.row) || !r.last) continue;
      // Each write names its row as the dashboard does ("Row 20"), for a message about it; it goes in the row of the file.
      const where = labelOf(r);
      const note = r.last.numbered ? r.last.note : renumbered(r.last.note, numbers);
      writes.push({ row: r.row, label: where, col: cols.status, text: FINAL_WORDS[finalOfRow(r)] ?? '', name: 'Status' }, { row: r.row, label: where, col: cols.type, text: r.last.type, name: 'Type' }, { row: r.row, label: where, col: cols.note, text: note ?? '', name: 'Note', wrap: true });
    }
    for (const a of cols.added) writes.push({ row: tab.headerRow ?? 1, col: a.col, text: a.header, style: headingStyle(data, tab.name, tab.headerRow ?? 1, a.col) });
    let out;
    try {
      out = writeCells(data, tab.name, writes);
    } catch (err) {
      if (err instanceof WriteError) return refuse(res, 400, err.message);
      throw err;
    }
    // A file with macros (.xlsm) keeps its own kind, or Excel would refuse to open it.
    const macros = /macroEnabled/i.test(String(readZip(data).get('[Content_Types].xml')?.() ?? ''));
    const name = downloadName(s.fileName, todayInIndia(now()), macros ? 'xlsm' : 'xlsx');
    res.statusCode = 200;
    res.setHeader('Content-Type', macros ? 'application/vnd.ms-excel.sheet.macroEnabled.12' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('Content-Length', out.length);
    res.end(out);
  }

  // ---- rows ----

  /** A row added by hand, from the form: its words, and each picture as a file or a link. */
  async function addRow(req, res) {
    const { fields, files } = await readForm(req);
    const f = (k) => String(fields[k] ?? '').trim();
    let settings;
    try {
      settings = await currentSettings();
    } catch (err) {
      if (err instanceof SettingsError) return refuse(res, 400, err.message);
      throw err;
    }
    const shot = (w) => {
      const c = cellLinks(f(`${w}Link`), null);
      return { ...c, picture: null };
    };
    const r = {
      orderId: { text: f('orderId'), value: f('orderId') ? orderIdOf(f('orderId')) : '' },
      orderDate: { text: f('orderDate'), value: dateFromWords(f('orderDate')) },
      amount: { text: f('amount'), value: amountOf({ text: f('amount') }) },
      product: { text: f('product') },
      shots: Object.fromEntries(SHOTS.map((w) => [w, shot(w)])),
    };
    const given = Object.fromEntries(SHOTS.filter((w) => files[w]).map((w) => [w, files[w]]));
    let row = await store.addManual(r, given);
    for (const w of SHOTS) {
      if (given[w]) continue;
      const links = row.shots[w].links.filter((l) => downloadable(w, l));
      if (!links.length) continue;
      const list = [];
      for (const link of links) {
        // A Google Drive file needs the Google login; without one it is downloaded when the row is checked.
        const out = isDriveLink(link) && !googleIn() ? { ok: false, ...NO_GOOGLE } : noteDownload(await fetchOne(link, settings, null));
        list.push(out.ok ? { link, data: out.data } : { link, problem: problemOf(out) });
      }
      try {
        row = await store.setPictures(row.id, w, list);
      } catch (err) {
        // A row removed while its pictures were being downloaded is passed over.
        if (err instanceof StoreError && err.status === 404) return refuse(res, 404, 'The row was removed while its pictures were being downloaded.');
        throw err;
      }
    }
    await fingerprint(row);
    return sendJson(res, 201, { row: rowView((await store.get(row.id)) ?? row, resultWords(settings)) });
  }

  async function smallPicture(res, row, which, i, tries = 2) {
    const p = row.pictures?.[which]?.[i];
    if (!p?.file) return refuse(res, 404, 'This row has no such picture.');
    let small = store.smallFile(row, which, i);
    try {
      await stat(small);
    } catch {
      let data;
      try {
        data = await images.thumbnail(store.pictureFile(row, which, i), p.type);
      } catch {
        return sendFile(res, store.pictureFile(row, which, i), p.type);
      }
      small = await store.saveSmall(row.id, which, i, { file: p.file, sha256: p.sha256 }, data);
      if (!small) {
        const now2 = await store.get(row.id);
        if (now2?.pictures?.[which]?.[i]?.file && tries > 1) return smallPicture(res, now2, which, i, tries - 1);
        return refuse(res, 404, 'This row has no such picture any more.');
      }
    }
    return sendFile(res, small, 'image/jpeg');
  }

  async function removeRow(req, res, id) {
    await readBody(req, MAX_JSON_BYTES);
    const job = claim('remove');
    if (!job) return refuse(res, 409, `${running?.kind === 'campaign' ? READING_NOW : running?.kind === 'email' ? SENDING_NOW : 'A check or a sheet upload is running.'} Wait for it to finish, then delete the row.`);
    try {
      const row = await store.remove(id);
      return sendJson(res, 200, { removed: 1, row: { id: row.id, label: labelOf(row) } });
    } finally {
      release(job);
    }
  }

  /** Removes every row (and every row of the old layout); `expected` is how many the screen showed. */
  async function removeAll(req, res, body) {
    const expected = body?.expected;
    if (expected !== undefined && !(Number.isInteger(expected) && expected >= 0)) return refuse(res, 400, 'Say how many rows the screen showed.');
    const job = claim('remove');
    if (!job) return refuse(res, 409, `${running?.kind === 'campaign' ? READING_NOW : running?.kind === 'email' ? SENDING_NOW : 'A check or a sheet upload is running.'} Wait for it to finish, then remove the rows.`);
    try {
      const removed = await store.removeAll(expected);
      return sendJson(res, 200, { removed });
    } finally {
      release(job);
    }
  }

  // ---- campaigns ----

  /** A campaign as the screen sees it: what staff typed, and under each product what was read from Amazon, or why it is not used. */
  function campaignView(c) {
    const reading = running?.reading ?? null;
    return {
      id: c.id,
      brand: c.brand,
      name: c.name,
      live: Boolean(c.live),
      updatedAt: c.updatedAt ?? null,
      products: (c.products ?? []).map((p) => ({
        given: p.given,
        state: reading?.campaignId === c.id && reading.given === p.given ? 'reading' : usable(p) ? 'used' : p.problem ? (p.problem.retry ? 'stopped' : 'not used') : 'waiting',
        name: p.read?.name ?? null,
        brand: p.read?.brand ?? null,
        variants: (p.read?.variants ?? []).map((v) => v.label).filter(Boolean),
        variantCount: (p.read?.variants ?? []).length,
        at: p.problem?.at ?? p.read?.at ?? null,
        says: p.problem?.says ?? null,
      })),
    };
  }
  const campaignsView = async () => (await store.campaigns()).map(campaignView);

  /** Why a campaign cannot be changed just now, naming the button to press later; null when it can. */
  function campaignBusy(button) {
    if (running?.kind === 'check' || running?.kind === 'run') return `Rows are being checked. Wait for them to finish, then press ${button}.`;
    if (running?.kind === 'campaign') return `${READING_NOW} Wait for it to finish, then press ${button}.`;
    if (running?.kind === 'email') return `${SENDING_NOW} Wait for them to finish, then press ${button}.`;
    if (running) return `Something else is running. Wait for it to finish, then press ${button}.`;
    if (login.busy) return `The Amazon login is being checked. Wait a moment, then press ${button}.`;
    return googleBusy(button);
  }

  /** A campaign from the screen's form: its brand, its name, live or ended, and its products, one per line. A product typed before keeps what was read for it. */
  function campaignFrom(body, old) {
    const words = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
    const brand = words(body?.brand);
    const name = words(body?.name);
    if (!/[\p{L}\p{N}]/u.test(brand)) throw new HttpError(400, 'Write the brand, for example Koparo.');
    if (brand.length > 60) throw new HttpError(400, 'The brand is too long: at most 60 letters.');
    if (!/[\p{L}\p{N}]/u.test(name)) throw new HttpError(400, "Write the campaign's name, for example Koparo Clean.");
    if (name.length > 80) throw new HttpError(400, "The campaign's name is too long: at most 80 letters.");
    const { products, problems } = productLines(body?.products);
    if (problems.length) throw new HttpError(400, problems.join(' '));
    if (!products.length) throw new HttpError(400, 'Write at least one product: an Amazon link or an ASIN number on each line.');
    const kept = products.map((p) => {
      const was = (old?.products ?? []).find((x) => x.given === p.given);
      return was ? { ...was, url: p.url } : { ...p, read: null, problem: null };
    });
    return confirmProducts({ id: old?.id ?? newCampaignId(), brand, name, live: body?.live !== false, products: kept });
  }

  /**
   * Reads, in the Live Amazon Browser, every product of these campaigns that
   * is still to be read, one page at a time. -> null, or the kind of page that
   * stopped it ('signin', 'captcha' or 'blocked'): nothing more is read then.
   */
  async function readProducts(job, ids, emit = () => {}) {
    const onWait = (ms) => emit({ event: 'action', says: `Waiting ${Math.ceil(ms / 1000)} seconds before the next Amazon page` });
    try {
      for (const id of ids) {
        const c = await store.campaign(id);
        const todo = (c?.products ?? []).filter(needsReading);
        for (const [i, p] of todo.entries()) {
          if (job.stop.signal.aborted) return null;
          job.reading = { campaignId: c.id, given: p.given };
          emit({ event: 'action', says: `Reading the products of the campaign "${c.name}" from Amazon: ${i + 1} of ${todo.length}` });
          const out = await readProduct(live, p, c.brand, { onWait, now });
          await store.setCampaignProduct(c.id, p.given, out.product);
          if (out.pause) return out.pause;
        }
      }
      return null;
    } finally {
      job.reading = null;
    }
  }
  /** The live campaigns' products not read yet, read before any row is checked. */
  async function readLiveCampaigns(job, emit) {
    const ids = (await store.campaigns()).filter((c) => c.live && (c.products ?? []).some(needsReading)).map((c) => c.id);
    return ids.length ? readProducts(job, ids, emit) : null;
  }
  /** Reads a campaign's products after it is saved, while the screen shows each one's progress. */
  function readInBackground(id) {
    const job = claim('campaign');
    if (!job) return;
    readProducts(job, [id])
      .catch((err) => log(`reading products failed: ${err?.name ?? 'Error'}`))
      .finally(() => release(job));
  }

  async function saveCampaign(req, res, id) {
    const body = await readJson(req);
    const old = id ? await store.campaign(id) : null;
    if (id && !old) return refuse(res, 404, 'No campaign has that id. Reload the page.');
    const busyNow = campaignBusy('Save');
    if (busyNow) return refuse(res, 409, busyNow);
    const kept = await store.saveCampaign(campaignFrom(body, old));
    if (kept.products.some(needsReading)) readInBackground(kept.id);
    return sendJson(res, id ? 200 : 201, { campaign: campaignView(kept), campaigns: await campaignsView() });
  }

  /** "End campaign", "Delete" and "Read the products again". */
  async function campaignAction(req, res, id, action) {
    await readBody(req, MAX_JSON_BYTES);
    const c = await store.campaign(id);
    if (!c) return refuse(res, 404, 'No campaign has that id. Reload the page.');
    const busyNow = campaignBusy({ end: '"End campaign"', delete: 'Delete', read: '"Read the products again"' }[action]);
    if (busyNow) return refuse(res, 409, busyNow);
    if (action === 'delete') await store.removeCampaign(id);
    else if (action === 'end') await store.saveCampaign({ ...c, live: false });
    else {
      // Every product that is not used is read again.
      await store.saveCampaign({ ...c, products: (c.products ?? []).map((p) => (usable(p) ? p : { given: p.given, url: p.url, asin: p.asin ?? null, read: null, problem: null })) });
      readInBackground(id);
    }
    return sendJson(res, 200, { campaigns: await campaignsView() });
  }

  async function readForm(req, limit = MAX_FORM_BYTES) {
    const type = String(req.headers['content-type'] ?? '');
    if (!/^multipart\/form-data/i.test(type)) throw new HttpError(415, 'The form could not be read. Reload the page, then try again.');
    return parseMultipart(await readBody(req, limit), type);
  }

  async function readJson(req) {
    if (!/^application\/json/i.test(String(req.headers['content-type'] ?? ''))) throw new HttpError(415, 'The request could not be read. Reload the page, then try again.');
    try {
      return JSON.parse((await readBody(req, MAX_JSON_BYTES)).toString('utf8') || '{}');
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, 'The request could not be read. Reload the page, then try again.');
    }
  }

  /** The top bar: the Amazon login's one state ({ state, name, says }), the Google login's (google: { state, name, says, chrome }), and what this computer reads pictures with. */
  async function accountView() {
    const langs = await tesseractLanguages();
    const l = login.view();
    return { ...l, loggedIn: l.state === 'in', google: google.view(), hindi: langs.has('hin'), english: langs.has('eng'), browserOpen: live.isOpen(), running: running ? { kind: running.kind, rowId: running.rowId } : null };
  }

  /** "Log in to Amazon" and "Check the login again": started here, followed through the top bar; never while something else uses the window. */
  async function loginRoute(req, res, flow, button) {
    await readBody(req, MAX_JSON_BYTES);
    if (running) return refuse(res, 409, `${running.kind === 'campaign' ? READING_NOW : running.kind === 'email' ? SENDING_NOW : 'A check, a sheet upload or a removal is running.'} Wait for it to finish, then press ${button}.`);
    if (googleBusy(button)) return refuse(res, 409, googleBusy(button));
    if (!login.busy) {
      flow().catch((err) => log(`login failed: ${err?.name ?? 'Error'}`));
    }
    return sendJson(res, 200, await accountView());
  }
  /** The Google login's buttons: the same, with the Live Amazon Browser (or the normal Chrome window) used by one login at a time. */
  async function googleRoute(req, res, flow, button, { wait = false } = {}) {
    await readBody(req, MAX_JSON_BYTES);
    if (running) return refuse(res, 409, `${running.kind === 'campaign' ? READING_NOW : running.kind === 'email' ? SENDING_NOW : 'A check, a sheet upload or a removal is running.'} Wait for it to finish, then press ${button}.`);
    if (login.busy) return refuse(res, 409, `The Amazon login is being checked. Wait a moment, then press ${button}.`);
    if (!google.busy) {
      const going = flow().catch((err) => log(`Google login failed: ${err?.name ?? 'Error'}`));
      // "I have logged in" answers once the normal Chrome window has closed and the login has been read, so the top bar is right at once.
      if (wait) await going;
    }
    return sendJson(res, 200, await accountView());
  }

  // ---- a result changed by a staff member ----

  /**
   * "Change the result", on a row's page: the Status, the Type and the Note
   * a staff member chose replace the row's result, and the row says
   * "Changed by staff". "Check every row again" passes the row by; "Check
   * again" on its page replaces the staff's result.
   */
  async function changeResult(req, res, id, body) {
    const final = String(body?.final ?? '');
    if (!FINAL_KEYS.includes(final)) return refuse(res, 400, 'Choose a Status: Pass, Fail or Needs Manual Staff Checking.');
    const typeKey = String(body?.typeKey ?? '');
    if (!TYPE_KEYS.includes(typeKey)) return refuse(res, 400, 'Choose a Type from the list.');
    const note = typeof body?.note === 'string' ? body.note.replace(/\r\n?/g, '\n').trim() : '';
    if (note.length > 4000) return refuse(res, 400, 'The Note is too long: at most 4000 letters.');
    if (running && (running.rowId === id || ['sheet', 'remove'].includes(running.kind))) return refuse(res, 409, running.rowId === id ? 'This row is being checked right now. Wait for it to finish, then change its result.' : `${runningSays()}, so wait for it to finish, then change the result.`);
    let settings;
    try {
      settings = await currentSettings();
    } catch (err) {
      if (err instanceof SettingsError) return refuse(res, 400, err.message);
      throw err;
    }
    if (!(await store.get(id))) return refuse(res, 404, 'No row has that id.');
    const kept = await store.setStaffResult(id, { final, status: FINAL_WORDS[final], typeKey, type: typeWord(typeKey, settings), note: clean(note), at: now().toISOString() });
    return sendJson(res, 200, { row: rowView(kept, resultWords(settings), rowNumbers(await store.list())) });
  }

  /** "The result is right": the dashboard's result for the row stays, marked checked by staff and right (for the count of right results). */
  async function markRight(req, res, id) {
    if (running && (running.rowId === id || ['sheet', 'remove'].includes(running.kind))) return refuse(res, 409, running.rowId === id ? 'This row is being checked right now. Wait for it to finish, then mark its result.' : `${runningSays()}, so wait for it to finish, then mark the result.`);
    let settings;
    try {
      settings = await currentSettings();
    } catch (err) {
      if (err instanceof SettingsError) return refuse(res, 400, err.message);
      throw err;
    }
    if (!(await store.get(id))) return refuse(res, 404, 'No row has that id.');
    const kept = await store.markRight(id, { at: now().toISOString() });
    return sendJson(res, 200, { row: rowView(kept, resultWords(settings), rowNumbers(await store.list())) });
  }

  // ---- emails to users ----

  /** The emails as the screen sees them: the test address, whether the file has an email address column (only then can Real be chosen), the sign-off, every email with its name, and the words that get filled in. */
  const emailsView = (settings, testEmail, sheet = null) => ({
    testEmail,
    emailColumn: Number.isInteger(sheet?.mapping?.email),
    signOff: settings.emails.signOff,
    templates: EMAIL_KEYS.map((k) => ({ key: k, name: emailName(k, settings), subject: settings.emails.templates[k].subject, message: settings.emails.templates[k].message })),
    placeholders: PLACEHOLDERS,
  });

  /**
   * The row's own email address, from the file's email address column:
   * { address, ok, says, logSays }, says being why a Real email cannot go to
   * it (for the screen), and logSays the same without what the file has in
   * the cell, for the email log and the Terminal window.
   */
  function addressOf(row, sheet) {
    const col = sheet?.mapping?.email;
    if (!Number.isInteger(col)) return { address: '', ok: false, says: 'This file has no email address column.' };
    const text = String(row?.values?.[col]?.text ?? '').trim();
    if (!text) return { address: '', ok: false, says: 'There is no email address in the file for this row.' };
    if (!EMAIL_SHAPE.test(text)) return { address: text, ok: false, says: `What the file has for this row is not an email address: "${text}".`, logSays: 'What the file has for this row is not an email address.' };
    return { address: text, ok: true, says: null };
  }

  /**
   * The email for one row, filled in from its check and the file, as the
   * screen shows it before sending: with the row's own email address from
   * the file (where a Real email goes, or why it cannot), the user's name
   * and the order ID for the row's line, and whether the row was emailed
   * before. Null when its Type has no email.
   */
  async function emailOf(row, settings, sheet, to) {
    const words = resultWords(settings);
    const typeKey = typeKeyOf(row, words);
    if (!hasEmail(typeKey)) return null;
    const result = row.last?.checkId ? await store.result(row.last.checkId) : null;
    const email = emailFor({ typeKey, row, result, reviewer: reviewerOf(row, sheet), settings, to });
    if (!email) return null;
    const before = Array.isArray(row.emails) && row.emails.length ? row.emails.at(-1) : null;
    const own = addressOf(row, sheet);
    return { rowId: row.id, label: labelOf(row), reviewer: reviewerOf(row, sheet) ?? '', orderId: row.orderId?.text ?? '', address: own.address, addressOk: own.ok, addressSays: own.says, ...email, emailedBefore: before ? { at: before.at, name: before.name, maybe: Boolean(before.maybe) } : null };
  }

  /** "Email this user" and "Email these users": every email first, filled in for each row, for the staff member to read and change. */
  async function emailPreview(res, ids) {
    let settings;
    try {
      settings = await currentSettings();
    } catch (err) {
      if (err instanceof SettingsError) return refuse(res, 400, err.message);
      throw err;
    }
    await numberRows();
    const sheet = sheetView(await store.sheet());
    const to = await store.testEmail();
    const emails = [];
    const skipped = [];
    for (const id of ids) {
      const row = await store.get(id);
      if (!row) {
        skipped.push({ rowId: id, says: 'This row is no longer there.' });
        continue;
      }
      const email = await emailOf(row, settings, sheet, to);
      if (email) emails.push(email);
      else skipped.push({ rowId: id, label: labelOf(row), says: `${labelOf(row)} has no email: its Type has none, or it is not checked yet.` });
    }
    if (ids.length === 1 && !emails.length) return refuse(res, 400, skipped[0].says);
    return sendJson(res, 200, { emails, skipped, testEmail: to, emailColumn: Number.isInteger(sheet?.mapping?.email) });
  }

  /** The rows named in a request: their ids, checked. */
  function rowIds(body) {
    const list = Array.isArray(body?.rowIds) ? body.rowIds : [];
    if (!list.length) throw new HttpError(400, 'Choose at least one row.');
    if (list.length > MAX_EMAILS) throw new HttpError(400, `At most ${MAX_EMAILS} rows at a time.`);
    for (const id of list) if (!ROW_ID.test(String(id))) throw new HttpError(400, 'A row could not be found. Reload the page, then try again.');
    return [...new Set(list)];
  }

  /**
   * "Send" and "Send to the ticked users": each email, as the staff member
   * last saw it on the screen, sent through Gmail in the Live Amazon
   * Browser, one at a time, a few seconds apart. In Test mode every email
   * goes to the test email address; in Real mode each one goes to the
   * address in the file's email address column, and a row without one (or
   * with something that is not an address) is not sent, and says why. Every
   * try is kept in data/email-log.txt (the time, the row, what happened and
   * the reason; never the email's words or address, nor what the file has in
   * its email address cell). An email Gmail did not
   * say was sent is "maybe sent", kept on the row like a sent one, so nobody
   * sends it twice by mistake. Rows cannot be checked while emails are sent,
   * and no email is sent while rows are checked. A login page, a robot
   * check or a block stops it, and so does Stop; the emails sent before
   * stay sent, and the rest are not tried.
   */
  async function sendEmails(req, res, body) {
    const list = Array.isArray(body?.emails) ? body.emails : [];
    const mode = body?.mode === 'real' ? 'real' : body?.mode === undefined || body?.mode === 'test' ? 'test' : null;
    if (!mode) return refuse(res, 400, 'Choose Test or Real.');
    if (!list.length) return refuse(res, 400, 'There is no email to send.');
    if (list.length > MAX_EMAILS) return refuse(res, 400, `At most ${MAX_EMAILS} emails at a time.`);
    for (const e of list) {
      if (!ROW_ID.test(String(e?.rowId ?? '')) || !EMAIL_KEYS.includes(String(e?.key ?? ''))) return refuse(res, 400, 'An email could not be matched to its row. Reload the page, then try again.');
      if (typeof e.subject !== 'string' || !e.subject.trim()) return refuse(res, 400, 'Every email needs a subject.');
      if (e.subject.length > MAX_SUBJECT * 2) return refuse(res, 400, `A subject is too long: at most ${MAX_SUBJECT * 2} letters.`);
      if (typeof e.message !== 'string' || !e.message.trim()) return refuse(res, 400, 'Every email needs some words.');
      if (e.message.length > MAX_MESSAGE * 2) return refuse(res, 400, `An email is too long: at most ${MAX_MESSAGE * 2} letters.`);
    }
    const sheet = sheetView(await store.sheet());
    const testTo = await store.testEmail();
    if (mode === 'test' && !testTo) return refuse(res, 400, 'Fill in the Test email address first: every email goes to that address.');
    if (mode === 'real' && !Number.isInteger(sheet?.mapping?.email)) return refuse(res, 400, 'This file has no email address column, so emails can only go to the test email address. Choose Test.');
    if (!(await afterStopping(res))) return;
    if (login.busy) return refuse(res, 409, 'The Amazon login is being checked. Wait a moment, then press Send again.');
    if (googleBusy('Send')) return refuse(res, 409, googleBusy('Send'));
    if (google.view().state !== 'in') return refuse(res, 409, 'No one is logged in to Google, so no email can be sent. Press "Log in to Google" in the top bar and log in there, then press Send again.');
    const job = claim('email');
    if (!job) return refuse(res, 409, `${running?.kind === 'check' || running?.kind === 'run' ? 'Rows are being checked.' : busyWords()} Wait for it to finish, then press Send again.`);
    stopOnClose(job, res);
    try {
      let settings;
      try {
        settings = await currentSettings();
      } catch (err) {
        if (err instanceof SettingsError) return refuse(res, 400, err.message);
        throw err;
      }
      const words = resultWords(settings);
      const emit = streamTo(res);
      const total = list.length;
      const counts = { sent: 0, maybe: 0, failed: 0 };
      const numbers = () => `${counts.sent} sent, ${counts.maybe} maybe sent, ${counts.failed} not sent, ${total - counts.sent - counts.maybe - counts.failed} not tried`;
      emailLines(`Sending ${total === 1 ? '1 email' : `${total} emails`}: ${mode === 'test' ? 'every one to the test email address' : "each one to the user's own email address from the file"}.`);
      emit({ event: 'emails-started', total, mode, to: mode === 'test' ? testTo : null });
      try {
        for (const [i, e] of list.entries()) {
          if (job.stop.signal.aborted) break;
          const row = await store.get(e.rowId);
          if (!row) {
            counts.failed++;
            emailLines('A row that is no longer there: not sent.');
            emit({ event: 'email-failed', rowId: e.rowId, says: 'This row is no longer there, so its email was not sent.' });
            continue;
          }
          const label = labelOf(row);
          const name = emailName(e.key, settings);
          // Real mode: the row's own address from the file, or why it cannot be emailed.
          const own = mode === 'real' ? addressOf(row, sheet) : null;
          if (own && !own.ok) {
            counts.failed++;
            // Never what the file has in the cell: it can be anything the user typed.
            emailLines(`${label}, ${name}: not sent. ${own.logSays ?? own.says}`);
            emit({ event: 'email-failed', rowId: row.id, label, says: own.says });
            continue;
          }
          const to = own ? own.address : testTo;
          job.rowId = row.id;
          emit({ event: 'email', rowId: row.id, label, index: i + 1, total, to });
          const email = { to, subject: clean(e.subject.replace(/\s+/g, ' ').trim()), message: clean(e.message.replace(/\r\n?/g, '\n').trim()) };
          const out = await mailer.send(email, { signal: job.stop.signal, say: (says) => emit({ event: 'action', says }) });
          const record = async (maybe, at) => rowView(await store.recordEmail(row.id, { at, key: e.key, name, subject: email.subject, to, mode, maybe }), words, rowNumbers(await store.list()));
          if (out.ok) {
            counts.sent++;
            emailLines(`${label}, ${name}: sent.`);
            emit({ event: 'email-sent', rowId: row.id, label, at: out.at, rows: [await record(false, out.at)] });
          } else if (out.maybe) {
            // Send was pressed, but Gmail did not say the email went: kept on the row as maybe sent.
            counts.maybe++;
            const at = now().toISOString();
            emailLines(`${label}, ${name}: maybe sent. ${out.says}`);
            emit({ event: 'email-maybe', rowId: row.id, label, at, says: out.says, rows: [await record(true, at)] });
          } else if (!out.pause) {
            counts.failed++;
            emailLines(`${label}, ${name}: not sent. ${out.says}`);
            emit({ event: 'email-failed', rowId: row.id, label, says: out.says });
          }
          if (out.pause) {
            emailLines(`Sending stopped at ${label}: ${out.says} ${numbers()}.`);
            emit({ event: 'paused', kind: out.pause, says: out.says, rowId: row.id, label, maybe: Boolean(out.maybe), ...counts, total });
            return;
          }
        }
        const stopped = job.stop.signal.aborted;
        emailLines(`${stopped ? 'Stopped' : 'Done'}: ${numbers()}.`);
        emit({ event: stopped ? 'emails-stopped' : 'emails-done', ...counts, total });
      } catch (err) {
        log(`sending failed: ${err?.name ?? 'Error'}`);
        emailLines(`Sending broke off on this computer: ${numbers()}.`);
        emit({ event: 'failed', says: 'Something went wrong on this computer part way through sending. The emails marked Sent were sent. Press Send again for the rest.' });
      }
    } finally {
      release(job);
      endStream(res);
    }
  }

  /** The Test email address box: every email goes only to this address. '' clears it. */
  async function setTestEmail(res, body) {
    const email = String(body?.email ?? '').trim();
    if (email.length > 200) return refuse(res, 400, 'The email address is too long.');
    if (email && !EMAIL_SHAPE.test(email)) return refuse(res, 400, 'Write an email address, such as name@example.com.');
    await store.setTestEmail(email);
    return sendJson(res, 200, { testEmail: await store.testEmail() });
  }

  /** The Email templates box: the sign-off and every email, written into the settings file. */
  async function saveTemplates(res, body) {
    const templates = body?.templates && typeof body.templates === 'object' && !Array.isArray(body.templates) ? body.templates : {};
    let settings;
    try {
      settings = await saveEmailSettings({ signOff: body?.signOff, templates });
    } catch (err) {
      if (err instanceof SettingsError) return refuse(res, 400, err.message);
      throw err;
    }
    return sendJson(res, 200, { emails: emailsView(settings, await store.testEmail()) });
  }

  async function rowsView() {
    let settings = null;
    let settingsProblem = null;
    try {
      settings = await currentSettings();
    } catch (err) {
      if (!(err instanceof SettingsError)) throw err;
      settingsProblem = err.message;
    }
    const s = settings ?? DEFAULT_SETTINGS;
    // Rows checked before the three Status words were added get one from their kept result, once; rows of an older upload get their number from 1.
    finalsFilled ??= store.fillFinals((kept) => finalOfSaved(kept, s.notDeliveredWords)).catch(() => 0);
    await finalsFilled;
    await numberRows();
    const words = resultWords(s);
    const rows = await store.list();
    const numbers = rowNumbers(rows);
    const sheet = sheetView(await store.sheet());
    if (sheet) sheet.about = aboutFile(sheet, rows, await store.campaigns());
    return {
      rows: rows.map((r) => rowView(r, words, numbers)),
      oldRows: await store.oldRowCount(),
      sheet,
      campaigns: await campaignsView(),
      types: TYPE_KEYS.map((k) => ({ key: k, word: typeWord(k, s), status: FINAL_WORDS[TYPE_FINAL[k]] })),
      emails: emailsView(s, await store.testEmail(), sheet),
      settingsProblem,
      steps: STEP_NAMES,
    };
  }

  /** True when the path was one of these routes (answered or refused). */
  return async function handle(req, res, url) {
    if (!url.pathname.startsWith('/local/amazon/')) return false;
    const site = req.headers['sec-fetch-site'];
    if (site !== undefined && site !== 'same-origin') {
      refuse(res, 403, 'Only this page itself may use these routes.');
      return true;
    }
    if (!(await auth(req))) {
      refuse(res, 401, 'The session is not valid. Reload the page.');
      return true;
    }
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    const parts = url.pathname.slice('/local/amazon/'.length).split('/');
    try {
      if (parts[0] === 'rows' && parts.length === 1) {
        if (method === 'GET') return sendJson(res, 200, await rowsView()), true;
        if (method === 'POST') return (await addRow(req, res)), true;
      }
      if (parts[0] === 'rows' && ROW_ID.test(parts[1] ?? '')) {
        const id = parts[1];
        if (parts.length === 2 && method === 'GET') {
          await numberRows();
          const row = await store.get(id);
          if (!row) return refuse(res, 404, 'No row has that id.'), true;
          const result = row.last?.checkId ? await store.result(row.last.checkId) : null;
          let s = DEFAULT_SETTINGS;
          try {
            s = await currentSettings();
          } catch {
            // the default words then
          }
          const numbers = rowNumbers(await store.list());
          const shown = resultView(result, numbers);
          // The Status word the row's page shows, never an older check's Verified or Unverified.
          if (shown && FINAL_WORDS[shown.final ?? row.last?.final]) shown.status = FINAL_WORDS[shown.final ?? row.last.final];
          return sendJson(res, 200, { row: rowView(row, resultWords(s), numbers), result: shown }), true;
        }
        if (parts.length === 5 && (parts[2] === 'picture' || parts[2] === 'small') && SHOTS.includes(parts[3]) && /^[0-9]$/.test(parts[4]) && method === 'GET') {
          const row = await store.get(id);
          const i = Number(parts[4]);
          if (!row?.pictures?.[parts[3]]?.[i]?.file) return refuse(res, 404, 'This row has no such picture.'), true;
          if (parts[2] === 'small') return (await smallPicture(res, row, parts[3], i)), true;
          return (await sendFile(res, store.pictureFile(row, parts[3], i), row.pictures[parts[3]][i].type)), true;
        }
        if (parts.length === 3 && parts[2] === 'check' && method === 'POST') {
          await readBody(req, MAX_JSON_BYTES);
          return (await startCheck(req, res, id)), true;
        }
        if (parts.length === 3 && parts[2] === 'remove' && method === 'POST') return (await removeRow(req, res, id)), true;
        if (parts.length === 3 && parts[2] === 'result' && method === 'POST') return (await changeResult(req, res, id, await readJson(req))), true;
        if (parts.length === 3 && parts[2] === 'right' && method === 'POST') {
          await readBody(req, MAX_JSON_BYTES);
          return (await markRight(req, res, id)), true;
        }
        if (parts.length === 3 && parts[2] === 'email' && method === 'GET') return (await emailPreview(res, [id])), true;
      }
      if (parts[0] === 'emails' && parts.length === 2 && method === 'POST') {
        if (parts[1] === 'preview') return (await emailPreview(res, rowIds(await readJson(req)))), true;
        if (parts[1] === 'send') return (await sendEmails(req, res, await readJson(req))), true;
        if (parts[1] === 'templates') return (await saveTemplates(res, await readJson(req))), true;
      }
      if (parts[0] === 'email-address' && parts.length === 1 && method === 'POST') return (await setTestEmail(res, await readJson(req))), true;
      if (parts[0] === 'rows' && parts[1] === 'remove-all' && parts.length === 2 && method === 'POST') return (await removeAll(req, res, await readJson(req))), true;
      if (parts[0] === 'check-all' && parts.length === 1 && method === 'POST') return (await checkAll(req, res, await readJson(req))), true;
      if (parts[0] === 'sheet' && parts.length === 1 && method === 'POST') return (await uploadSheet(req, res)), true;
      if (parts[0] === 'sheet' && parts[1] === 'checked.xlsx' && parts.length === 2 && method === 'GET') return (await checkedExcel(res)), true;
      if (parts[0] === 'campaigns' && parts.length === 1) {
        if (method === 'GET') return sendJson(res, 200, { campaigns: await campaignsView() }), true;
        if (method === 'POST') return (await saveCampaign(req, res, null)), true;
      }
      if (parts[0] === 'campaigns' && CAMPAIGN_ID.test(parts[1] ?? '') && method === 'POST') {
        if (parts.length === 2) return (await saveCampaign(req, res, parts[1])), true;
        if (parts.length === 3 && ['end', 'delete', 'read'].includes(parts[2])) return (await campaignAction(req, res, parts[1], parts[2])), true;
      }
      if (parts[0] === 'checks' && CHECK_ID.test(parts[1] ?? '') && parts[2] === 'steps' && /^([1-9]|10)$/.test(parts[3] ?? '') && parts.length === 4 && method === 'GET') {
        return (await sendFile(res, join(store.checkDir(parts[1]), `step-${parts[3]}.png`), 'image/png')), true;
      }
      if (parts[0] === 'account' && parts.length === 1 && method === 'GET') return sendJson(res, 200, await accountView()), true;
      if (parts[0] === 'log-in' && parts.length === 1 && method === 'POST') return (await loginRoute(req, res, () => login.logIn('when "Log in to Amazon" was pressed'), 'Log in to Amazon')), true;
      if (parts[0] === 'check-login' && parts.length === 1 && method === 'POST') return (await loginRoute(req, res, () => login.check('when "Check the login again" was pressed'), 'Check the login again')), true;
      if (parts[0] === 'google' && parts.length === 2 && method === 'POST') {
        if (parts[1] === 'log-in') return (await googleRoute(req, res, () => google.logIn('when "Log in to Google" was pressed'), '"Log in to Google"')), true;
        if (parts[1] === 'check-login') return (await googleRoute(req, res, () => google.check('when "Check the Google login again" was pressed'), '"Check the Google login again"')), true;
        if (parts[1] === 'log-in-in-chrome') return (await googleRoute(req, res, () => google.logInInChrome('when "Log in to Google in a normal Chrome window" was pressed'), '"Log in to Google in a normal Chrome window"')), true;
        if (parts[1] === 'logged-in') return (await googleRoute(req, res, () => google.done('when "I have logged in" was pressed'), '"I have logged in"', { wait: true })), true;
      }
      if (['GET', 'POST'].includes(method)) return refuse(res, 404, 'Not found.'), true;
      res.setHeader('Allow', 'GET, HEAD, POST');
      return refuse(res, 405, 'Only GET, HEAD and POST are answered here.'), true;
    } catch (err) {
      if (err instanceof StoreError || err instanceof HttpError) {
        if (!res.headersSent) refuse(res, err.status, err.message);
        else res.destroy();
        return true;
      }
      log(`route failed: ${err?.name ?? 'Error'}`);
      if (!res.headersSent) refuse(res, 500, 'Something went wrong on this computer.');
      else res.destroy();
      return true;
    }
  };
}
