// Flipkart's routes, under /local/flipkart/. serve.mjs has already checked
// the Host; here, as on Amazon's routes, every request must also carry the
// page's session token and come from this page itself. Nothing here sends
// CORS headers. The routes: /local/flipkart/status (the checker is not ready
// yet), /local/flipkart/sheet (GET the uploaded file's rows, POST a file to
// upload), /local/flipkart/campaigns (GET them; POST to add one, to change
// one, or to end, delete or read again one), /local/flipkart/account (GET:
// the Google login, for the top bar), /local/flipkart/rows/… (GET a row's
// page, with its last check, and its pictures; POST …/check to check it, as on
// Amazon, the steps streamed as they run) and /local/flipkart/check-all (POST:
// "Start checking", later "Carry on checking", or "Check every row again",
// the rows checked one by one as on Amazon, each row's steps streamed as they
// run). The file is read on this
// computer, its columns are found as on Amazon (or chosen on the screen when
// a needed one cannot be found), and it is kept in data/flipkart/ with its
// rows and the pictures placed in its cells; under the upload line, the
// screen is told, as on Amazon, which campaign the rows use. Its links are
// only shown, never opened, and nothing is downloaded until a row is checked
// (check.js); a check reads the purchase screenshot on this computer
// (shot-read.js), with Flipkart's own passing marks (settings.js). A
// campaign's products are read, after it
// is saved, from their Flipkart pages in the Live Flipkart Browser
// (browser.js), one page at a time; the window opens only then, or when a
// check reads the campaign product's public reviews (step 7: its own page,
// then "See all reviews", read once in a checking run, kept on this computer
// and searched for every row), never when the dashboard starts, and it
// closes when the dashboard stops. The Google
// login, for the screenshots on Google Drive, is the Amazon screen's own, in
// the Live Amazon Browser, handed over by serve.mjs: the top bar shows its
// state, and its buttons are the Amazon screen's own routes, so logging in on
// either screen counts for both. Nothing here changes that login or that
// window.

import { openWorkbook, guessColumns, columnProblems, rememberedChoice, sheetRows, SheetError, FIELDS, RESULT_FIELDS, RESULT_HEADERS, columnLetter, resultColumns, dayFirst } from './workbook.js';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createFlipkartStore, putCampaign, MAX_SHEET_BYTES, SHOTS, ROW_ID } from './store.js';
import { cellLinks, linkLabel, linksIn, isDriveLink, linkKey } from './links.js';
import { createScreenshots, downloadable } from './screenshots.js';
import { runCheck, PAUSE_SAYS } from './check.js';
import { CAMPAIGN_KEY, newCampaignKey, productLines, usable, confirmProducts, needsReading, readProduct, campaignsFound, campaignsFor, brandIn } from './campaigns.js';
import { readOrderShot, readDeliveryShot } from './shot-read.js';
import { readReviewShot } from './review-read.js';
import { SettingsError } from './settings.js';
import { FlipkartBrowser } from './browser.js';
import { readProductReviews } from './reviews.js';

const TOO_BIG = `The file is larger than ${MAX_SHEET_BYTES / (1024 * 1024)} megabytes, so save a smaller copy (only the Flipkart tab, for example), then upload that.`;
const MAX_JSON_BYTES = 64 * 1024;
const READING_NOW = 'The products of a campaign are being read from Flipkart.';
const CHECKING_NOW = 'A row is being checked.';
const CHECKING_ALL = 'Rows are being checked.';
const GONE = 'This campaign is no longer saved. Reload the page.';
/** The button that checks the rows one by one, once a row is checked, as a pause names it. */
const RUN_BUTTON = '"Carry on checking"';
/** How long a copy of Flipkart's reviews read for one row's Check serves the next row's Check. */
const KEPT_REVIEWS_MS = 60 * 60 * 1000;
/** A reading of Flipkart's reviews that went as far as it was meant to (reviews.js). */
const wholeReading = (r) => ['date', 'last page', 'limit'].includes(r?.end);

/** A row counts as checked once its last check finished: only a finished check is kept with the row (store.js saveCheck). */
const isChecked = (r) => Boolean(r?.check);
/** A row in a sentence, as on Amazon: "Row 3", its number on the dashboard. */
const labelOf = (r) => `Row ${r?.n ?? '?'}`;
/** A pause's sentence, naming the button there is to press: Check or "Check again" for one row, "Carry on checking" for the rows one by one. */
const pressing = (says, button) => String(says).replace('"Carry on checking"', button).replace(/then try again\.$/, `then press ${button}.`);

// Copied from the Amazon routes (amazon/routes.js): a refusal with its status, the request's bytes up to a limit, and a multipart form.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readBody(req, limit, tooBig) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        done = true;
        reject(new HttpError(413, tooBig));
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

/** multipart/form-data as { fields, files }: files has the first file of each field. A file part with no name and no bytes is no file. */
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(String(contentType ?? ''));
  if (!m) throw new HttpError(400, 'The form could not be read.');
  const boundary = m[1] ?? m[2];
  const delim = Buffer.from(`--${boundary}`);
  const between = Buffer.from(`\r\n--${boundary}`);
  const fields = {};
  const files = {};
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
        if ((filename !== '' || data.length) && !files[name]) files[name] = { field: name, filename, data };
      } else fields[name] = data.toString('utf8');
    }
    pos = end + 2;
  }
  return { fields, files };
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

// Copied from the Amazon routes: a kept picture as it is, and a check's lines streamed as they happen.
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
function streamTo(res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.flushHeaders();
  return (e) => {
    if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(e)}\n`);
  };
}
function endStream(res) {
  if (res.headersSent && !res.writableEnded) res.end();
}

// ---- the rows as the screen sees them (copied from the Amazon routes, amazon/routes.js, and changed for Flipkart) ----

/** An amount as rupees, as the table shows it: ₹654, ₹851.95, ₹1,299. Null when there is none. */
export function rupees(value) {
  if (!Number.isFinite(value) || value < 0) return null;
  const n = Math.round(value * 100) / 100;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** One of a cell's pictures as the screen sees it, as on Amazon: kept (ok, its type), or why it could not be had. */
function pictureView(p, i) {
  if (p?.file) return { i, ok: true, type: p.type, at: p.at ?? null, link: p.link ?? null };
  return { i, ok: false, link: p?.link ?? null, problem: { kind: p?.problem?.kind ?? 'access', site: p?.problem?.site ?? null, says: p?.problem?.says ?? '' } };
}

/**
 * A row as the screen sees it, as on Amazon: its number on the dashboard
 * (from 1), its order ID, order date, amount and product, each picture or
 * link cell with a few words saying where each link goes (`words` are the
 * cell's own words when they are not a link themselves) and how a picture
 * was given ('cell' or 'floating') with each picture kept or why it could
 * not be had, the file's other columns, the Status, Type and Note the file
 * already had, and whether it is checked (done: its last check finished). The
 * pictures themselves never come with it.
 */
export function rowView(r) {
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
  return {
    id: r.id,
    row: r.row ?? null,
    n: r.n ?? null,
    label: `Row ${r.n ?? '?'}`,
    orderId: r.orderId?.text ?? '',
    orderDate: r.orderDate?.value ? dayFirst(r.orderDate.value) : r.orderDate?.text ?? '',
    orderDateRead: Boolean(r.orderDate?.value),
    amount: rupees(r.amount?.value) ?? r.amount?.text ?? '',
    amountRead: Number.isFinite(r.amount?.value),
    product: r.product?.text ?? '',
    shots: Object.fromEntries(SHOTS.map((w) => [w, shot(w)])),
    // The file's other columns (such as the reviewer's name), by column number: their words, and where each link goes.
    values: Object.fromEntries(Object.entries(r.values ?? {}).map(([col, v]) => [col, { text: v?.text ?? '', labels: cellLinks(v?.text ?? '', v?.behind ?? '').links.map((link) => ({ link, label: linkLabel(link) })) }])),
    prev: r.prev ?? null,
    done: isChecked(r),
  };
}

/**
 * The table's columns: every column of the file, in its order, each with its
 * letter, its name in the heading row, and the field it holds (key, or null
 * for a column only shown, such as the reviewer's name); then the Status, Type
 * and Note columns the file does not have, after the last one. A file's own
 * Status, Type or Note column is that same column, never shown twice.
 */
function tableColumns(sheet, mapping) {
  const results = resultColumns(mapping, sheet.lastCol);
  const fieldAt = new Map(FIELDS.filter((f) => Number.isInteger(mapping[f.key])).map((f) => [mapping[f.key], f.key]));
  const cols = (sheet.headers ?? []).map((h) => ({ key: fieldAt.get(h.col) ?? null, col: h.col, letter: columnLetter(h.col), name: h.text, added: false }));
  for (const a of results.added) cols.push({ key: RESULT_FIELDS.find((k) => results[k] === a.col) ?? null, col: a.col, letter: columnLetter(a.col), name: a.header, added: true });
  return cols;
}

/** The fields checked against the screenshots and the review, in the order a row is checked. */
const CHECKED_FIELDS = ['orderId', 'orderDate', 'amount', 'product', 'orderShot', 'deliveryShot', 'reviewShot', 'reviewLink'];

/** What the file does not have, and what that means: the same words as on Amazon. */
const LACKS = {
  orderDate: 'This file has no order date, so order dates are not compared.',
  amount: 'This file has no amount, so amounts are not compared.',
  product: 'This file has no product name, so products are not compared.',
  orderShot: 'This file has no purchase screenshot, so every row needs a staff member to check the purchase.',
  deliveryShot: 'This file has no delivery screenshot, so every row needs a staff member to check the delivery.',
  reviewLink: 'This file has no review link, so each review is read from its review screenshot.',
};

// Copied from the Amazon routes' words (amazon/notes.js): a list in a sentence, "a, b and c".
function joinAnd(list) {
  const l = list.filter(Boolean);
  if (l.length <= 1) return l[0] ?? '';
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
}
const quotedName = (c) => `"${c.name}"`;

/**
 * Which live campaign the rows use, as on Amazon (amazon/routes.js
 * campaignSaid): by the brand in their product names, or else in the file's
 * name or the tab's name; or that none was found, plainly when the brand has
 * only a campaign marked Ended.
 */
function campaignSaid(view, rows, campaigns) {
  const places = [view.fileName, view.tab].filter(Boolean);
  const placeOf = (c) => (brandIn(view.fileName, c.brand) ? "the file's name" : "the tab's name");
  const count = (n) => (n === 1 ? '1 row' : `${n} rows`);
  const tally = new Map();
  const endedOnly = new Map();
  let none = 0;
  for (const r of rows) {
    const found = campaignsFound(r.product?.text ?? '', campaigns, places);
    if (!found.list.length) {
      none++;
      for (const c of campaignsFound(r.product?.text ?? '', campaigns, places, { live: false }).list) endedOnly.set(c.key, c);
    }
    for (const c of found.list) {
      const t = tally.get(c.key) ?? { c, product: 0, file: 0 };
      t[found.by]++;
      tally.set(c.key, t);
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

/**
 * The short lines under the upload line, as on Amazon: which of the file's
 * columns are used for checking, which are only shown, what the file does not
 * have and what that means, and which campaign the rows use.
 */
function aboutFile(view, rows = [], campaigns = []) {
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

/**
 * What the screen shows of the kept file: { sheet, rows }. sheet: its name,
 * the tab read (null for a CSV file), its column names, the columns found,
 * the table's columns, the lines about it (with which of the campaigns the
 * rows use) and how many rows it has; rows: every row as rowView gives it. A
 * file kept before its columns were found shows no rows: it must be uploaded
 * again (uploadAgain).
 */
export function sheetView(saved, campaigns = []) {
  if (!saved || saved.old) return { sheet: null, rows: [], ...(saved?.old ? { uploadAgain: true } : {}) };
  const s = saved.sheet;
  const sheet = { fileName: s.fileName, kind: s.kind, tab: s.tab, headers: s.headers, lastCol: s.lastCol, mapping: s.mapping, columns: tableColumns(s, s.mapping), rowCount: saved.rows.length, uploadedAt: s.uploadedAt };
  sheet.about = aboutFile(sheet, saved.rows, campaigns);
  return { sheet, rows: saved.rows.map(rowView) };
}

/**
 * dataDir — the dashboard's data folder; only data/flipkart/ in it is used.
 * auth(req) — true when the request carries this page's session token.
 * browser — tests only: the Live Flipkart Browser to read products with;
 * else makeBrowser() makes one the first time a product is read (tests give
 * one that counts, to show that no window opens before then).
 * google — the Amazon screen's Google login, handed over by serve.mjs: the
 * top bar shows its state (view), and screenshots.js says what else of it
 * the downloads use; tests give a pretend one.
 * shotOptions — tests only: the downloads' own options (screenshots.js).
 * readers — tests only: { order(files, opts), delivery(files, opts),
 * review(files, opts), reviews(browser, pid, opts) } in place of reading the
 * purchase, delivery and review screenshots with Tesseract (shot-read.js,
 * review-read.js) and a product's reviews on Flipkart (reviews.js).
 * The answer is the routes' handler; its close() closes the Live Flipkart
 * Browser, when the dashboard stops.
 */
export function createFlipkartRoutes({ dataDir, auth, log = () => {}, browser = null, makeBrowser = () => new FlipkartBrowser({ dataDir }), now = () => new Date(), google = null, shotOptions = {}, readers = null }) {
  const store = createFlipkartStore(dataDir);
  // What a purchase screenshot and a delivery screenshot say, read on this computer.
  const readOrder = readers?.order ?? ((files, opts) => readOrderShot(files, opts));
  const readDelivery = readers?.delivery ?? ((files, opts) => readDeliveryShot(files, opts));
  const readReview = readers?.review ?? ((files, opts) => readReviewShot(files, opts));
  // A campaign product's public reviews, read in the Live Flipkart Browser: its own page, then "See all reviews".
  const readReviewsOf = readers?.reviews ?? ((b, pid, opts) => readProductReviews(b, pid, opts));
  // A row's screenshots, downloaded when it is checked; the ones on Google Drive through the Amazon screen's Google login.
  const screenshots = createScreenshots({ store, google, ...shotOptions });
  let checking = null; // the row being checked: { rowId, stop }, with all: true while the rows are checked one by one. One check at a time.
  let live = browser;
  let closing = false; // the dashboard is stopping: no window is made, and no product is read
  const liveBrowser = () => {
    if (closing) throw new Error('The dashboard is stopping.');
    return (live ??= makeBrowser());
  };
  // While a campaign's products are read: { reading: { key, given } | null }. One reading at a time.
  let job = null;

  async function readForm(req) {
    const type = String(req.headers['content-type'] ?? '');
    if (!/^multipart\/form-data/i.test(type)) throw new HttpError(415, 'The form could not be read. Reload the page, then try again.');
    return parseMultipart(await readBody(req, MAX_SHEET_BYTES + 256 * 1024, TOO_BIG), type);
  }

  // Copied from the Amazon routes (amazon/routes.js): a JSON request's body.
  async function readJson(req) {
    if (!/^application\/json/i.test(String(req.headers['content-type'] ?? ''))) throw new HttpError(415, 'The request could not be read. Reload the page, then try again.');
    try {
      return JSON.parse((await readBody(req, MAX_JSON_BYTES, 'That is too large to send here.')).toString('utf8') || '{}');
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, 'The request could not be read. Reload the page, then try again.');
    }
  }

  // ---- campaigns (copied from the Amazon campaigns, amazon/routes.js, and changed for Flipkart) ----

  /**
   * A campaign as the screen sees it: what staff typed, and under each product
   * what was read from Flipkart, or why it is not used, as on Amazon; and
   * whether Flipkart prevented the reading. The other details read (product
   * ID, item ID, stars, counts, the link to all reviews) are kept, not shown.
   */
  function campaignView(c) {
    const reading = job?.reading ?? null;
    return {
      key: c.key,
      brand: c.brand,
      name: c.name,
      live: Boolean(c.live),
      updatedAt: c.updatedAt ?? null,
      products: (c.products ?? []).map((p) => ({
        given: p.given,
        state: reading?.key === c.key && reading.given === p.given ? 'reading' : usable(p) ? 'used' : p.problem ? (p.problem.retry ? 'stopped' : 'not used') : 'waiting',
        name: p.read?.name ?? null,
        brand: p.read?.brand ?? null,
        variants: (p.read?.variants ?? []).map((v) => v.label).filter(Boolean),
        variantCount: (p.read?.variants ?? []).length,
        at: p.problem?.at ?? p.read?.at ?? null,
        says: p.problem?.says ?? null,
        prevented: Boolean(p.problem?.stop),
      })),
    };
  }
  /**
   * Every campaign as the screen sees it, and whether products are being read
   * now. A reading that was running when the list was read still counts, so
   * the screen looks once more and sees the last product read too.
   */
  async function campaignsView() {
    const busy = Boolean(job);
    const list = await store.campaigns();
    return { campaigns: list.map(campaignView), reading: busy || Boolean(job) };
  }

  /** What a row being checked, or the rows being checked one by one (Stop stops them), says to anything asked meanwhile, naming what to do after. */
  const checkingSays = (then) => (checking?.all ? `${CHECKING_ALL} Press Stop, or wait for checking to finish, then ${then}.` : `${CHECKING_NOW} Wait for it to finish, then ${then}.`);
  /** Why a campaign cannot be changed just now, naming the button to press later; null when it can. */
  const campaignBusy = (button) => (job ? `${READING_NOW} Wait for it to finish, then press ${button}.` : checking ? checkingSays(`press ${button}`) : null);

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
    if (!products.length) throw new HttpError(400, 'Write at least one product: a Flipkart link or a Flipkart product ID on each line.');
    const kept = products.map((p) => {
      const was = (old?.products ?? []).find((x) => x.given === p.given);
      return was ? { ...was, url: p.url } : { ...p, read: null, problem: null };
    });
    return confirmProducts({ key: old?.key ?? newCampaignKey(), brand, name, live: body?.live !== false, products: kept });
  }

  /**
   * Reads, in the Live Flipkart Browser, every product of this campaign that
   * is still to be read, one page at a time. -> null, or the kind of page that
   * stopped it ('captcha', 'blocked' or 'error'): nothing more is read then,
   * and the products after it stay not read yet.
   */
  async function readProducts(mine, key) {
    try {
      const c = await store.campaign(key);
      for (const p of (c?.products ?? []).filter(needsReading)) {
        if (closing) return null;
        mine.reading = { key, given: p.given };
        const out = await readProduct(liveBrowser(), p, c.brand, { now });
        await store.setCampaignProduct(key, p.given, out.product);
        if (out.stop) return out.stop;
      }
      return null;
    } finally {
      mine.reading = null;
    }
  }
  /** Marks a reading as running, at once, so nothing else starts or changes a campaign until it ends. Null when one runs. */
  function claim() {
    if (job) return null;
    job = { reading: null };
    return job;
  }
  function release(mine) {
    if (job === mine) job = null;
  }
  /** Reads a campaign's products after it is saved, while the screen shows each one's progress. */
  function readInBackground(mine, key) {
    readProducts(mine, key)
      .catch((err) => log(`Reading Flipkart products failed: ${err?.name ?? 'Error'}`))
      .finally(() => release(mine));
  }

  // A save and the buttons change the campaigns as they are saved at that moment, in one step that nothing
  // else can come between (store.changeCampaigns), and only when no reading runs: so a product just read is
  // never written over with what was there before.

  async function saveCampaign(req, res, key) {
    const body = await readJson(req);
    let mine = null;
    let kept;
    try {
      kept = await store.changeCampaigns((list) => {
        const old = key ? list.find((c) => c.key === key) ?? null : null;
        if (key && !old) throw new HttpError(404, GONE);
        const busyNow = campaignBusy('Save');
        if (busyNow) throw new HttpError(409, busyNow);
        const saved = putCampaign(list, campaignFrom(body, old));
        if (saved.products.some(needsReading)) mine = claim();
        return saved;
      });
    } catch (err) {
      if (mine) release(mine);
      throw err;
    }
    if (mine) readInBackground(mine, kept.key);
    return sendJson(res, key ? 200 : 201, { campaign: campaignView(kept), ...(await campaignsView()) });
  }

  /** "End campaign", "Delete" and "Read the products again". */
  async function campaignAction(req, res, key, action) {
    await readBody(req, MAX_JSON_BYTES, 'That is too large to send here.');
    let mine = null;
    try {
      await store.changeCampaigns((list) => {
        const c = list.find((x) => x.key === key);
        if (!c) throw new HttpError(404, GONE);
        const busyNow = campaignBusy({ end: '"End campaign"', delete: 'Delete', read: '"Read the products again"' }[action]);
        if (busyNow) throw new HttpError(409, busyNow);
        if (action === 'delete') list.splice(list.indexOf(c), 1);
        else if (action === 'end') putCampaign(list, { ...c, live: false });
        else {
          // Every product that is not used is read again, as on Amazon.
          putCampaign(list, { ...c, products: (c.products ?? []).map((p) => (usable(p) ? p : { given: p.given, url: p.url, pid: p.pid ?? null, itemId: p.itemId ?? null, byId: Boolean(p.byId), read: null, problem: null })) });
          mine = claim();
        }
        return true;
      });
    } catch (err) {
      if (mine) release(mine);
      throw err;
    }
    if (mine) readInBackground(mine, key);
    return sendJson(res, 200, await campaignsView());
  }

  // ---- the file (copied from the Amazon routes, amazon/routes.js, and changed for Flipkart) ----

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

  /**
   * An uploaded file: read at once, its columns found as on Amazon, and its
   * rows made and kept, in place of the file before, with the pictures placed
   * in its cells. When the file has several tabs and none is named
   * "Flipkart", nothing changes: the screen is told the tabs, and sends the
   * file again with the one chosen (tab). When a needed column cannot be
   * found, nothing changes either: the screen is told which, and sends the
   * file again with the columns chosen (mapping). The columns used are
   * remembered for the next file.
   */
  async function uploadSheet(req, res) {
    const { fields, files } = await readForm(req);
    const file = files.file;
    if (!file) return refuse(res, 400, 'Choose the Flipkart file first.');
    if (checking) return refuse(res, 409, checkingSays('upload the file again'));
    if (file.data.length > MAX_SHEET_BYTES) return refuse(res, 413, TOO_BIG);
    const chosen = chosenColumns(fields.mapping);
    let book;
    try {
      book = await openWorkbook(file.data, { fileName: file.filename, tab: fields.tab ? fields.tab : null });
    } catch (err) {
      if (err instanceof SheetError) return refuse(res, 400, err.message);
      throw err;
    }
    if (book.chooseTab) return sendJson(res, 200, { chooseTab: book.chooseTab });
    const { tab, kind } = book;
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
    const saved = await store.saveSheet({ fileName: file.filename, kind, tab: tab.name, headerRow: tab.headerRow, headers: tab.headers, lastCol: tab.lastCol, mapping }, file.data, made.rows);
    await store.setColumnChoice(rememberedChoice(mapping, tab.headers));
    return sendJson(res, 200, { made: saved.rows.length, tab: tab.name, unplaced: made.unplaced, ...sheetView(saved, await store.campaigns()) });
  }

  // ---- the Google login: the Amazon screen's own ----

  /** The top bar: the Google login's one state ({ state, name, says, chrome }), read as it is, the same as on the Amazon screen; null when none was handed over. */
  const accountView = () => ({ google: google ? google.view() : null });

  // ---- checking one row (copied from the Amazon routes, amazon/routes.js, and changed for Flipkart) ----

  /** A row with a Google Drive picture still to be downloaded: it needs the Google login. */
  function needsGoogle(row) {
    return SHOTS.some((w) => {
      const kept = row?.pictures?.[w] ?? [];
      return (row?.shots?.[w]?.links ?? []).filter((l) => downloadable(w, l) && isDriveLink(l)).some((l) => !kept.some((p) => p.file && p.link && linkKey(p.link) === linkKey(l)));
    });
  }

  /**
   * Before a row with a Google Drive screenshot still to download, as on
   * Amazon: why it cannot be checked just now, { kind, says }, or null. A
   * login using the Live Amazon Browser (screenshots.js says which, in a plain
   * sentence), or no one logged in to Google.
   */
  function googleBefore(row) {
    if (!needsGoogle(row)) return null;
    const busy = screenshots.busyNow();
    if (busy) return { kind: 'login-busy', says: busy };
    if (accountView().google?.state !== 'in') return { kind: 'google-out', says: PAUSE_SAYS['google-out'] };
    return null;
  }

  /** The file's columns a check needs to know about: { orderDate, amount, product, orderShot, deliveryShot, reviewShot, reviewLink }, each true when the file has it. */
  const hasColumns = (mapping) => Object.fromEntries(['orderDate', 'amount', 'product', 'orderShot', 'deliveryShot', 'reviewShot', 'reviewLink'].map((k) => [k, Number.isInteger(mapping?.[k])]));
  /** The live campaigns a row uses, as on Amazon: by the brand in its product name, or else in the file's name or the tab's name; each with its products' real names read from Flipkart. */
  /** The reviewer named in the row's cell of the file's reviewer column, which finds the user's review among several on a review screenshot. */
  const reviewerOf = (row, saved) => (Number.isInteger(saved?.sheet?.mapping?.reviewer) ? row.values?.[saved.sheet.mapping.reviewer]?.text ?? null : null);
  const campaignsOf = (row, saved, campaigns) => campaignsFor(row.product?.text ?? '', campaigns, [saved?.sheet?.fileName, saved?.sheet?.tab].filter(Boolean));
  /** Flipkart's passing marks, from its own settings; a mark that is wrong is refused with its plain sentence, and nothing is checked. -> the marks, or null when refused. */
  async function marksOr(res) {
    try {
      return await store.passingMarks();
    } catch (err) {
      if (!(err instanceof SettingsError)) throw err;
      refuse(res, 400, `${err.message} Nothing can be checked until it is put right.`);
      return null;
    }
  }
  /** A row's own button, as the screen words it, as on Amazon: Check, or "Check again" once the row is checked. */
  const checkButton = (row) => (isChecked(row) ? '"Check again"' : 'Check');
  /** The button that checks the rows one by one: "Carry on checking" once a row is checked. */
  const runButton = (rows) => (rows.some(isChecked) ? RUN_BUTTON : '"Start checking"');
  /** True when a row has a review to search Flipkart's reviews for: a review screenshot, or a review link. */
  const hasReviewProof = (r) => Boolean(r.shots?.reviewShot?.links?.length || r.shots?.reviewShot?.picture || r.shots?.review?.links?.length);
  /**
   * How far back step 7 reads Flipkart's reviews: to the oldest day a row of
   * the file needs (its delivery day, else its order day, as its last check
   * found them; for the row being checked, `day`), or null, as far as allowed
   * (50 pages), while a row with a review to search for has not been checked
   * that way yet.
   */
  function oldestDay(rows, rowId, day) {
    const days = [day];
    for (const r of rows) {
      if (r.id === rowId) continue;
      if (r.check?.reviewsFrom) days.push(r.check.reviewsFrom.day);
      else if (hasReviewProof(r)) return null;
    }
    return days.filter(Boolean).sort()[0] ?? null;
  }
  /** A copy of a product's reviews kept on this computer, when it was read in full in the last hour; else null. */
  async function reviewsReadLately(pid) {
    const kept = await store.reviews(pid).catch(() => null);
    return kept && wholeReading(kept) && now().getTime() - Date.parse(kept.readAt ?? '') < KEPT_REVIEWS_MS ? kept : null;
  }
  /**
   * Flipkart's public reviews of a campaign's product, for step 7 of the
   * check: read once in a checking run in the Live Flipkart Browser (its own
   * page, then "See all reviews", newest first; reviews.js
   * readProductReviews) and kept on this computer, in
   * data/flipkart/reviews/<product ID>.json; every row of the run searches
   * that copy, and Flipkart is not opened again. A copy that stopped at a
   * newer day than a row needs is read on from where it stopped. One row's
   * Check (single) also uses a copy read in the last hour. A reading stopped
   * part way (a robot check, a block, a page too slow) is kept only when it
   * has more reviews than the copy kept before.
   */
  function reviewsSource(single) {
    const run = new Map();
    const covers = (r, since) => r.end === 'last page' || r.end === 'limit' || (r.end === 'date' && since !== null && r.since !== null && r.since <= since);
    return async (pid, { rowId = null, day = null, onPage, signal = null } = {}) => {
      const since = oldestDay(await keptRows(), rowId, day);
      const prior = run.get(pid) ?? (single ? await reviewsReadLately(pid) : null);
      if (prior && covers(prior, since)) return { ...prior, reused: true };
      const read = await readReviewsOf(liveBrowser(), pid, { since, now, onPage, signal, from: prior?.end === 'date' ? prior : null });
      const kept = await store.reviews(pid).catch(() => null);
      if (read.reviews?.length && (wholeReading(read) || read.reviews.length > (kept?.reviews?.length ?? 0))) await store.saveReviews(pid, read);
      if (wholeReading(read)) run.set(pid, read);
      return { ...read, reused: false };
    };
  }
  /** The kept file's rows, as kept; none when no file is kept. */
  const keptRows = async () => {
    const saved = await store.sheet();
    return Array.isArray(saved?.rows) ? saved.rows : [];
  };

  /**
   * "Check" (or "Check again"): one row's check, its steps streamed as they
   * run, as on Amazon. One check at a time, never while a campaign's products
   * are read. A row with a Google Drive screenshot to download while a login
   * is using the Live Amazon Browser, or while no one is logged in to Google,
   * pauses before it starts, as on Amazon. A paused or stopped check saves
   * nothing for the row; a finished one keeps its steps with the row.
   */
  async function startCheck(req, res, id) {
    await readBody(req, MAX_JSON_BYTES, 'That is too large to send here.');
    if (closing) throw new HttpError(409, 'The dashboard is stopping.');
    const row = await store.row(id);
    if (!row) return refuse(res, 404, 'No row has that id.');
    const marks = await marksOr(res);
    if (!marks) return;
    const button = checkButton(row);
    if (job) return refuse(res, 409, `${READING_NOW} Wait for it to finish, then press ${button}.`);
    if (checking) return refuse(res, 409, checkingSays(`press ${button}`));
    const run = (checking = { rowId: id, stop: new AbortController() });
    res.on('close', () => {
      if (!res.writableFinished) run.stop.abort();
    });
    const emit = streamTo(res);
    try {
      // The pause names the button there is for the row.
      const pause = (kind, says) => emit({ event: 'paused', kind, says: pressing(says, button) });
      const before = googleBefore(row);
      if (before) return pause(before.kind, before.says);
      const saved = await store.sheet();
      const result = await runCheck({ row, has: hasColumns(saved?.sheet?.mapping), screenshots, marks, campaigns: campaignsOf(row, saved, await store.campaigns()), readOrder, readDelivery, readReview, reviewer: reviewerOf(row, saved), reviews: reviewsSource(true), emit, signal: run.stop.signal, now });
      if (result.paused) pause(result.paused.kind, result.paused.says);
      else if (!result.stopped) await store.saveCheck(id, result);
    } catch (err) {
      log(`Flipkart check failed: ${err?.name ?? 'Error'}`);
      emit({ event: 'failed', says: `Something went wrong on this computer part way through the check. Nothing was saved for it; press ${button} to try again.` });
    } finally {
      if (checking === run) checking = null;
      endStream(res);
    }
  }

  // ---- checking the rows one by one (copied from the Amazon routes, amazon/routes.js, and changed for Flipkart) ----

  /** How many rows there are, how many are checked, and how many are left. */
  function tally(rows) {
    const done = rows.filter(isChecked).length;
    return { total: rows.length, done, left: rows.length - done };
  }

  /**
   * "Start checking" (later "Carry on checking"): the rows not checked yet,
   * one at a time, from the first one, in the file's order, as on Amazon.
   * "Check every row again" (again) first removes every row's last check. As
   * on Amazon, before a row with a Google Drive screenshot to download, a
   * login using the Live Amazon Browser or no one logged in to Google pauses
   * it; so does a pause in a row's check (Google's login page, a robot check
   * or a block). Stop, or the page closing, stops it at once. Either way the
   * row it was on is not checked, so it is the first one checked next time.
   * Never while a campaign's products are read, or while a row is checked.
   */
  async function checkAll(req, res) {
    const body = await readJson(req);
    if (closing) throw new HttpError(409, 'The dashboard is stopping.');
    const again = body?.again === true;
    const marks = await marksOr(res);
    if (!marks) return;
    const rows = await keptRows();
    const button = again ? '"Check every row again"' : runButton(rows);
    if (job) return refuse(res, 409, `${READING_NOW} Wait for it to finish, then press ${button} again.`);
    if (checking) return refuse(res, 409, checkingSays(`press ${button} again`));
    if (!rows.length) return refuse(res, 400, 'There are no rows to check. Upload the file first.');
    if (!again && rows.every(isChecked)) return refuse(res, 409, 'All rows are checked. To check them all again, press "Check every row again".');
    const run = (checking = { rowId: null, all: true, stop: new AbortController() });
    res.on('close', () => {
      if (!res.writableFinished) run.stop.abort();
    });
    try {
      if (again) await store.clearChecks();
      await runAll(run, res, again, marks);
    } finally {
      if (checking === run) checking = null;
      endStream(res);
    }
  }

  async function runAll(run, res, again, marks) {
    const emit = streamTo(res);
    const tried = new Set(); // no row is checked twice in one go
    let checked = 0;
    try {
      const saved = await store.sheet();
      const has = hasColumns(saved?.sheet?.mapping);
      // Nothing changes a campaign while rows are checked.
      const campaigns = await store.campaigns();
      // Flipkart's reviews are read once for the whole run, and every row searches that copy.
      const reviews = reviewsSource(false);
      let rows = Array.isArray(saved?.rows) ? saved.rows : [];
      emit({ event: 'run-started', again, ...tally(rows) });
      for (;;) {
        if (run.stop.signal.aborted) break;
        // The first row not checked yet.
        const r = rows.find((x) => !isChecked(x) && !tried.has(x.id));
        if (!r) break;
        tried.add(r.id);
        run.rowId = r.id;
        emit({ event: 'row', rowId: r.id, label: labelOf(r), ...tally(rows) });
        const paused = (kind, says) => emit({ event: 'paused', kind, says: pressing(says, RUN_BUTTON), rowId: r.id, label: labelOf(r), checked, ...tally(rows) });
        // A row with a Google Drive screenshot to download, while a login is using the Live Amazon Browser or no one is logged in to Google: checking pauses before it.
        const before = googleBefore(r);
        if (before) return paused(before.kind, before.says);
        const result = await runCheck({ row: r, has, screenshots, marks, campaigns: campaignsOf(r, saved, campaigns), readOrder, readDelivery, readReview, reviewer: reviewerOf(r, saved), reviews, emit, signal: run.stop.signal, now });
        if (result.stopped) break;
        if (result.paused) return paused(result.paused.kind, result.paused.says);
        const kept = await store.saveCheck(r.id, result);
        checked++;
        rows = await keptRows();
        // The row's new line for the table, before the next row starts.
        emit({ event: 'row-done', rowId: r.id, label: labelOf(r), seconds: result.seconds, rows: [rowView(kept)], ...tally(rows) });
      }
      rows = await keptRows();
      emit({ event: run.stop.signal.aborted ? 'run-stopped' : 'run-done', checked, ...tally(rows) });
    } catch (err) {
      log(`Flipkart checking failed: ${err?.name ?? 'Error'}`);
      emit({ event: 'failed', says: `Something went wrong on this computer part way through checking. The rows finished before it stay checked. Press ${RUN_BUTTON} to go on from the row it was on.` });
    }
  }

  /** A row's routes: its page (GET), its check (POST …/check), and its pictures (GET …/picture/<cell>/<n>, or …/small/…, the same picture). */
  async function rowRoute(req, res, method, parts) {
    const id = parts[1];
    if (parts.length === 2) {
      if (method !== 'GET') {
        res.setHeader('Allow', 'GET, HEAD');
        return refuse(res, 405, 'Only GET and HEAD are answered here.');
      }
      const row = await store.row(id);
      if (!row) return refuse(res, 404, 'No row has that id.');
      return sendJson(res, 200, { row: rowView(row), result: row.check ?? null });
    }
    if (parts.length === 3 && parts[2] === 'check') {
      if (method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return refuse(res, 405, 'Only POST is answered here.');
      }
      return startCheck(req, res, id);
    }
    if (parts.length === 5 && ['picture', 'small'].includes(parts[2]) && SHOTS.includes(parts[3]) && /^[0-9]$/.test(parts[4])) {
      if (method !== 'GET') {
        res.setHeader('Allow', 'GET, HEAD');
        return refuse(res, 405, 'Only GET and HEAD are answered here.');
      }
      const row = await store.row(id);
      const i = Number(parts[4]);
      const p = row?.pictures?.[parts[3]]?.[i];
      if (!p?.file) return refuse(res, 404, 'This row has no such picture.');
      return sendFile(res, store.pictureFile(row, parts[3], i), p.type);
    }
    return refuse(res, 404, 'Not found.');
  }

  /** True when the path was one of these routes (answered or refused). */
  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/local/flipkart/')) return false;
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
    const path = url.pathname.slice('/local/flipkart/'.length);
    try {
      if (path === 'status') {
        if (method === 'GET') return sendJson(res, 200, { ready: false }), true;
        res.setHeader('Allow', 'GET, HEAD');
        return refuse(res, 405, 'Only GET and HEAD are answered here.'), true;
      }
      if (path === 'account') {
        if (method === 'GET') return sendJson(res, 200, accountView()), true;
        res.setHeader('Allow', 'GET, HEAD');
        return refuse(res, 405, 'Only GET and HEAD are answered here.'), true;
      }
      if (path === 'sheet') {
        if (method === 'GET') return sendJson(res, 200, sheetView(await store.sheet(), await store.campaigns())), true;
        if (method === 'POST') return (await uploadSheet(req, res)), true;
        res.setHeader('Allow', 'GET, HEAD, POST');
        return refuse(res, 405, 'Only GET, HEAD and POST are answered here.'), true;
      }
      if (path === 'check-all') {
        if (method === 'POST') return (await checkAll(req, res)), true;
        res.setHeader('Allow', 'POST');
        return refuse(res, 405, 'Only POST is answered here.'), true;
      }
      const parts = path.split('/');
      if (parts[0] === 'rows' && ROW_ID.test(parts[1] ?? '')) return (await rowRoute(req, res, method, parts)), true;
      if (parts[0] === 'campaigns' && parts.length <= 3) {
        if (method !== 'GET' && method !== 'POST') {
          res.setHeader('Allow', parts.length === 1 ? 'GET, HEAD, POST' : 'POST');
          return refuse(res, 405, parts.length === 1 ? 'Only GET, HEAD and POST are answered here.' : 'Only POST is answered here.'), true;
        }
        if (parts.length === 1 && method === 'GET') return sendJson(res, 200, await campaignsView()), true;
        if (parts.length === 1) return (await saveCampaign(req, res, null)), true;
        if (CAMPAIGN_KEY.test(parts[1]) && method === 'POST') {
          if (parts.length === 2) return (await saveCampaign(req, res, parts[1])), true;
          if (['end', 'delete', 'read'].includes(parts[2])) return (await campaignAction(req, res, parts[1], parts[2])), true;
        }
      }
      return refuse(res, 404, 'Not found.'), true;
    } catch (err) {
      if (err instanceof HttpError) {
        if (!res.headersSent) refuse(res, err.status, err.message);
        else res.destroy();
        return true;
      }
      log(`Flipkart route failed: ${err?.name ?? 'Error'}`);
      if (!res.headersSent) refuse(res, 500, 'Something went wrong on this computer.');
      else res.destroy();
      return true;
    }
  }
  /** Only when the dashboard stops: a check still running is stopped, the Live Flipkart Browser is closed properly, when it was opened, and no product is read after that. */
  handle.close = async () => {
    closing = true;
    checking?.stop.abort();
    if (live) await live.close();
  };
  return handle;
}
