// Flipkart's routes, under /local/flipkart/. serve.mjs has already checked
// the Host; here, as on Amazon's routes, every request must also carry the
// page's session token and come from this page itself. Nothing here sends
// CORS headers. The routes: /local/flipkart/status (the checker is not ready
// yet) and /local/flipkart/sheet (GET the uploaded file's rows, POST a file to
// upload). The file is read on this computer and kept in data/flipkart/; its
// links are only shown, never opened, and nothing is downloaded.

import { openWorkbook, SheetError } from './workbook.js';
import { createFlipkartStore, MAX_SHEET_BYTES } from './store.js';
import { cellParts } from './links.js';

const TOO_BIG = `The file is larger than ${MAX_SHEET_BYTES / (1024 * 1024)} megabytes, so save a smaller copy (only the Flipkart tab, for example), then upload that.`;

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
 */
export function createFlipkartRoutes({ dataDir, auth, log = () => {} }) {
  const store = createFlipkartStore(dataDir);

  async function readForm(req) {
    const type = String(req.headers['content-type'] ?? '');
    if (!/^multipart\/form-data/i.test(type)) throw new HttpError(415, 'The form could not be read. Reload the page, then try again.');
    return parseMultipart(await readBody(req, MAX_SHEET_BYTES + 256 * 1024, TOO_BIG), type);
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
  return async function handle(req, res, url) {
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
  };
}
