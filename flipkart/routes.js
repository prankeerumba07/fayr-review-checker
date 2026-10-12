// Flipkart's routes, under /local/flipkart/. serve.mjs has already checked
// the Host; here, as on Amazon's routes, every request must also carry the
// page's session token and come from this page itself. Nothing here sends
// CORS headers. The routes: /local/flipkart/status (the checker is not ready
// yet), /local/flipkart/sheet (GET the uploaded file's rows, POST a file to
// upload) and /local/flipkart/campaigns (GET them; POST to add one, to
// change one, or to end, delete or read again one). The file is read on this
// computer and kept in data/flipkart/; its links are only shown, never
// opened, and nothing is downloaded. A campaign's products are read, after it
// is saved, from their Flipkart pages in the Live Flipkart Browser
// (browser.js), one page at a time; the window opens only then, never when
// the dashboard starts.

import { openWorkbook, SheetError } from './workbook.js';
import { createFlipkartStore, putCampaign, MAX_SHEET_BYTES } from './store.js';
import { cellParts } from './links.js';
import { CAMPAIGN_KEY, newCampaignKey, productLines, usable, confirmProducts, needsReading, readProduct } from './campaigns.js';
import { FlipkartBrowser } from './browser.js';

const TOO_BIG = `The file is larger than ${MAX_SHEET_BYTES / (1024 * 1024)} megabytes, so save a smaller copy (only the Flipkart tab, for example), then upload that.`;
const MAX_JSON_BYTES = 64 * 1024;
const READING_NOW = 'The products of a campaign are being read from Flipkart.';
const GONE = 'This campaign is no longer saved. Reload the page.';

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

function refuse(res, status, message) {
  sendJson(res, status, { statusCode: status, message });
}

/**
 * What the screen shows of the kept file: its name, the tab read (null for a
 * CSV file), how many rows it has, the column names, and every row's cells
 * in the columns' order, numbered from 1. A cell is its words in pieces
 * ({ text } or { link }), and picture: true when a picture is in it.
 */
export function sheetView(saved) {
  if (!saved) return { sheet: null, headers: [], rows: [] };
  const cols = saved.headers.map((h) => h.col);
  const cell = (c) => (c ? { parts: cellParts(c.text, c.behind), ...(c.picture ? { picture: true } : {}) } : { parts: [] });
  return {
    sheet: { fileName: saved.sheet.fileName, kind: saved.sheet.kind, tab: saved.sheet.tab, rowCount: saved.rows.length, uploadedAt: saved.sheet.uploadedAt },
    headers: saved.headers.map((h) => h.text),
    rows: saved.rows.map((r, i) => ({ n: i + 1, cells: cols.map((col) => cell(r.cells?.[col])) })),
  };
}

/**
 * dataDir — the dashboard's data folder; only data/flipkart/ in it is used.
 * auth(req) — true when the request carries this page's session token.
 * browser — tests only: the Live Flipkart Browser to read products with;
 * else makeBrowser() makes one the first time a product is read (tests give
 * one that counts, to show that no window opens before then).
 * The answer is the routes' handler; its close() closes the Live Flipkart
 * Browser, when the dashboard stops.
 */
export function createFlipkartRoutes({ dataDir, auth, log = () => {}, browser = null, makeBrowser = () => new FlipkartBrowser({ dataDir }), now = () => new Date() }) {
  const store = createFlipkartStore(dataDir);
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

  /** Why a campaign cannot be changed just now, naming the button to press later; null when it can. */
  const campaignBusy = (button) => (job ? `${READING_NOW} Wait for it to finish, then press ${button}.` : null);

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

  /**
   * An uploaded file: read at once and kept with its rows, in place of the
   * file before. When the file has several tabs and none is named
   * "Flipkart", nothing changes: the screen is told the tabs, and sends the
   * file again with the one chosen (tab).
   */
  async function uploadSheet(req, res) {
    const { fields, files } = await readForm(req);
    const file = files.file;
    if (!file) return refuse(res, 400, 'Choose the Flipkart file first.');
    if (file.data.length > MAX_SHEET_BYTES) return refuse(res, 413, TOO_BIG);
    let book;
    try {
      book = await openWorkbook(file.data, { fileName: file.filename, tab: fields.tab ? fields.tab : null });
    } catch (err) {
      if (err instanceof SheetError) return refuse(res, 400, err.message);
      throw err;
    }
    if (book.chooseTab) return sendJson(res, 200, { chooseTab: book.chooseTab });
    const saved = await store.saveSheet({ fileName: file.filename, kind: book.kind, tab: book.tab, headerRow: book.headerRow }, file.data, book.headers, book.rows);
    return sendJson(res, 200, sheetView(saved));
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
      if (path === 'sheet') {
        if (method === 'GET') return sendJson(res, 200, sheetView(await store.sheet())), true;
        if (method === 'POST') return (await uploadSheet(req, res)), true;
        res.setHeader('Allow', 'GET, HEAD, POST');
        return refuse(res, 405, 'Only GET, HEAD and POST are answered here.'), true;
      }
      const parts = path.split('/');
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
  /** Only when the dashboard stops: the Live Flipkart Browser is closed properly, when it was opened, and no product is read after that. */
  handle.close = async () => {
    closing = true;
    if (live) await live.close();
  };
  return handle;
}
