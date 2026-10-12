// Reading the Flipkart orders file: an Excel file (.xlsx) or a CSV file.
// Copied from the Amazon reader (amazon/workbook.js) and changed for
// Flipkart. One tab is read: the one named "Flipkart" (capitals and spaces do
// not matter), else the file's only tab; when the file has several tabs and
// none is named so, the screen is told the tabs, to choose one. Row 1 holds
// the column names (else the first row with two filled cells), and each
// column is found as on Amazon: by a choice remembered from the last file, by
// what its name means, by whole words, and with a look at its cells, so a
// column that clearly holds something else is never used. Only the order ID
// is needed (on Flipkart, OD and its digits), and a review screenshot or a
// review link; any other column can be missing from a file. Each cell keeps
// both its words and the link behind them, and the cells of the file's other
// columns are kept to be shown. Dates are read as real dates or as words with
// the day first; amounts as numbers or as words like ₹654. Nothing is
// downloaded and no link is opened.

import ExcelJS from 'exceljs';
import { readZip } from './zip.js';
import { imageType, PICTURE_EXT } from './image-type.js';
import { cellLinks, isFlipkart, isShortLink } from './links.js';
import { unescapeXml, attrs, attr, textPart, relsOf, blocks, columnLetter, columnNumber, tabsOf } from './ooxml.js';

export { columnLetter };

/** The tab read, when the file has one with this name. */
export const FLIPKART_TAB = 'Flipkart';

/**
 * What a column can hold, the same as on Amazon. Only the order ID is needed
 * (required), and one of the two review columns (review); every other one can
 * be missing from a file, and is then left out of the checks.
 */
export const FIELDS = [
  { key: 'orderId', label: 'Order ID', required: true },
  { key: 'orderDate', label: 'Order date', required: false },
  { key: 'amount', label: 'Amount', required: false },
  { key: 'product', label: 'Product ordered', required: false },
  { key: 'orderShot', label: 'Purchase screenshot', required: false },
  { key: 'deliveryShot', label: 'Delivery screenshot', required: false },
  { key: 'reviewShot', label: 'Review screenshot', required: false, review: true },
  { key: 'reviewLink', label: 'Review link', required: false, review: true },
  { key: 'reviewer', label: 'Reviewer name', required: false },
  { key: 'email', label: 'Email address', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'type', label: 'Type', required: false },
  { key: 'note', label: 'Note', required: false },
];
/** Where the results go: the Status, the Type and the Note. One left out gets a new column after the last one, headed with its name. */
export const RESULT_FIELDS = ['status', 'type', 'note'];
export const RESULT_HEADERS = { status: 'Status', type: 'Type', note: 'Note' };
/** The cells that hold pictures or links, and the name each has in a row. */
export const PICTURE_FIELDS = { orderShot: 'order', deliveryShot: 'delivery', reviewShot: 'reviewShot', reviewLink: 'review' };
/** The columns only shown, never used for checking: the reviewer's name and the user's email address. */
export const SHOWN_FIELDS = new Set(['reviewer', 'email']);
/** What an email address looks like: something, an @, something, a dot, something; no spaces. */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_ROWS = 5000;
export const MAX_COLUMNS = 200;

const LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

/** A problem with the file, in a plain sentence the screen can show. */
export class SheetError extends Error {}

// ---- cell values ----

function numberText(v) {
  if (!Number.isFinite(v)) return '';
  return Number.isInteger(v) && Math.abs(v) < 1e21 ? v.toFixed(0) : String(v);
}

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** "2026-07-20" with the day first: "20-07-2026". */
export const dayFirst = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');

/**
 * One exceljs cell value as { text, behind, number?, date? }: its words, the
 * web link behind them ('' when none), and a number or a day when it is one.
 */
export function cellValue(v, { shiftDays = 0 } = {}) {
  if (v === null || v === undefined) return { text: '', behind: '' };
  if (typeof v === 'string') return { text: v.trim(), behind: '' };
  if (typeof v === 'number') return { text: numberText(v), behind: '', number: v };
  if (typeof v === 'boolean') return { text: v ? 'TRUE' : 'FALSE', behind: '' };
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { text: '', behind: '' };
    const d = new Date(v.getTime() + shiftDays * 86400000);
    return { text: dayFirst(isoDay(d)), behind: '', date: isoDay(d) };
  }
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return { text: v.richText.map((r) => r?.text ?? '').join('').trim(), behind: '' };
    if ('hyperlink' in v) {
      const inner = v.text !== null && typeof v.text === 'object' ? cellValue(v.text, { shiftDays }) : { text: String(v.text ?? '').trim() };
      const behind = String(v.hyperlink ?? '').trim();
      return { ...inner, behind: /^https?:\/\//i.test(behind) ? behind : '' };
    }
    if ('formula' in v || 'sharedFormula' in v) {
      const r = v.result;
      const shown = r === undefined || (r && typeof r === 'object' && 'error' in r) ? { text: '', behind: '' } : cellValue(r, { shiftDays });
      return { ...shown, behind: formulaLink(v.formula) ?? shown.behind };
    }
    if ('error' in v) return { text: '', behind: '' };
  }
  return { text: String(v).trim(), behind: '' };
}

/**
 * The link a formula opens: HYPERLINK("…", …) or IMAGE("…") with the whole
 * link written out. A link put together from pieces ("…"&H2) is no link, so
 * the cell's words are used instead.
 */
export function formulaLink(formula) {
  const m = String(formula ?? '').match(/\b(?:_xlfn\.)?(?:HYPERLINK|IMAGE)\(\s*"((?:[^"]|"")+)"\s*[,)]/i);
  const link = m ? m[1].replace(/""/g, '"') : null;
  return link && /^https?:\/\/\S+$/i.test(link) ? link : null;
}

const filled = (c) => Boolean(c && (c.text || c.behind));

// ---- dates, amounts and order IDs ----

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** 7 for "Jul", "July" or "jul"; null for anything that is not a month's name or its first three letters (or "Sept"). */
function monthOf(word) {
  const w = String(word ?? '').toLowerCase();
  const n = MONTHS[w.slice(0, 3)];
  return n && (w.length === 3 || w === 'sept' || MONTH_NAMES[n - 1] === w) ? n : null;
}

function validDay(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? isoDay(date) : null;
}

const fullYear = (y) => (y.length === 2 ? 2000 + Number(y) : Number(y));

// Copied from the Amazon reader's words (amazon/text.js): a month's name in English or Hindi, as its number.
const MONTH_WORDS = Object.fromEntries(
  Object.entries({
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
    july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
    november: 11, nov: 11, december: 12, dec: 12,
    'जनवरी': 1, 'फ़रवरी': 2, 'फरवरी': 2, 'मार्च': 3, 'अप्रैल': 4, 'मई': 5, 'जून': 6, 'जुलाई': 7, 'अगस्त': 8,
    'सितंबर': 9, 'सितम्बर': 9, 'अक्तूबर': 10, 'अक्टूबर': 10, 'नवंबर': 11, 'नवम्बर': 11, 'दिसंबर': 12, 'दिसम्बर': 12,
  }).map(([k, v]) => [k.normalize('NFKC'), v]),
);

/** "5 September 2025", "September 5, 2025" or "5 सितंबर 2025" as "2025-09-05"; null when it is not a date. Copied from amazon/text.js. */
function dayFrom(text) {
  const t = String(text ?? '').normalize('NFKC').replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  let m = t.match(/(\d{1,2})\s+([\p{L}\p{M}]+)\.?\s+(\d{4})/u);
  if (m && MONTH_WORDS[m[2]]) return validDay(Number(m[3]), MONTH_WORDS[m[2]], Number(m[1]));
  m = t.match(/([\p{L}\p{M}]+)\.?\s+(\d{1,2})\s+(\d{4})/u);
  if (m && MONTH_WORDS[m[1]]) return validDay(Number(m[3]), MONTH_WORDS[m[1]], Number(m[2]));
  return null;
}

/**
 * A date written as words, the day first: 20-07-2026, 14/07/2026, 20.07.2026,
 * 20-07-26, 2026-07-20, 20-Jul-2026, 20 July 2026. -> "2026-07-20", or null.
 * When the day first cannot be a date (07/20/2026), the month first is tried.
 */
export function dateFromWords(text) {
  const t = String(text ?? '').trim();
  let m = t.match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4}|\d{2})(?![\d])/);
  if (m) return validDay(fullYear(m[3]), Number(m[2]), Number(m[1])) ?? validDay(fullYear(m[3]), Number(m[1]), Number(m[2]));
  m = t.match(/^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?![\d])/);
  if (m) return validDay(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/^(\d{1,2})\s*[-\s/]\s*([A-Za-z]{3,9})\.?\s*[-\s/,]\s*(\d{4}|\d{2})(?![\d])/);
  if (m && monthOf(m[2])) return validDay(fullYear(m[3]), monthOf(m[2]), Number(m[1]));
  return dayFrom(t);
}

/** An Excel day number as "2026-07-20", for the years 2000 to 2099 only. Most files count from 1899-12-30; some, saved with the 1904 system, from 1904-01-01. */
function serialDay(n, epoch = 1900) {
  if (!Number.isFinite(n)) return null;
  const base = epoch === 1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const day = new Date(base + Math.floor(n) * 86400000);
  return day.getUTCFullYear() >= 2000 && day.getUTCFullYear() <= 2099 ? isoDay(day) : null;
}

/** The order date in a cell: a real Excel date, an Excel day number, or words with the day first. */
export function dateOf(cell) {
  if (!cell) return null;
  if (cell.date) return cell.date;
  if (cell.number !== undefined) return serialDay(cell.number, cell.epoch);
  return dateFromWords(cell.text);
}

/** An amount in rupees: a number, or words like ₹654, Rs. 1,299.50, INR 654 or 654.00. Null when it is not one. */
export function amountOf(cell) {
  if (!cell) return null;
  if (cell.number !== undefined) return Number.isFinite(cell.number) ? cell.number : null;
  const t = String(cell.text ?? '')
    .replace(/₹|\brs\.?|\binr\b|\/-/gi, '')
    .replace(/[,\s]/g, '');
  return /^\d+(?:\.\d{1,2})?$/.test(t) ? Number(t) : null;
}

/**
 * The order ID in a cell, as Flipkart writes it: OD and its digits, usually
 * 18 (OD123456789012345678), wherever it is in the cell ("#OD…", "Order ID:
 * OD…"), in capitals; '' when there is none.
 */
export function orderIdOf(text) {
  const m = String(text ?? '').match(/(?<![A-Za-z0-9])OD[\s-]?(\d{12,22})(?!\d)/i);
  return m ? `OD${m[1]}` : '';
}

// ---- pictures inside cells (Excel's "Place in Cell"), which exceljs does not read ----

/**
 * From the tab's vm="N" cells, through xl/metadata.xml and the xl/richData
 * parts, to the picture in xl/media/. -> [{ row, col, data, name }]
 */
export function cellPicturesOf(zip, tabName) {
  const tab = tabsOf(zip).find((t) => t.name === tabName);
  const sheetXml = tab?.part ? textPart(zip, tab.part) : null;
  if (!sheetXml || !/\bvm="\d+"/.test(sheetXml)) return [];
  const wbRels = relsOf(zip, 'xl/workbook.xml');
  const partOf = (suffix, fallback) => wbRels.find((r) => r.type.endsWith(suffix) && !r.external)?.target ?? fallback;
  const metadata = textPart(zip, partOf('/sheetMetadata', 'xl/metadata.xml'));
  const richValues = textPart(zip, partOf('/rdRichValue', 'xl/richData/rdrichvalue.xml'));
  const structuresXml = textPart(zip, partOf('/rdRichValueStructure', 'xl/richData/rdrichvaluestructure.xml'));
  const relPart = partOf('/richValueRel', 'xl/richData/richValueRel.xml');
  const relXml = textPart(zip, relPart);
  if (!metadata || !richValues || !structuresXml || !relXml) return [];

  const typeNames = blocks(metadata, 'metadataType').map((b) => attrs(b.head).name);
  const future = blocks(metadata, 'futureMetadata').find((b) => attrs(b.head).name === 'XLRICHVALUE');
  const futureRv = future
    ? blocks(future.body, 'bk').map((bk) => {
        const m = bk.body.match(/<(?:\w+:)?rvb\b[^>]*\bi="(\d+)"/);
        return m ? Number(m[1]) : null;
      })
    : [];
  const valueMeta = blocks(blocks(metadata, 'valueMetadata')[0]?.body ?? '', 'bk').map((bk) => blocks(bk.body, 'rc').map((rc) => attrs(rc.head)));
  const values = blocks(richValues, 'rv').map((rv) => ({ s: Number(attrs(rv.head).s ?? 0), v: blocks(rv.body, 'v').map((v) => unescapeXml(v.body.trim())) }));
  const structures = blocks(structuresXml, 's').map((s) => blocks(s.body, 'k').map((k) => attrs(k.head).n));
  const relIds = blocks(relXml, 'rel').map((r) => attr(attrs(r.head), 'id'));
  const relTargets = new Map(relsOf(zip, relPart).map((r) => [r.id, r.target]));

  const out = [];
  for (const m of sheetXml.matchAll(/<(?:\w+:)?c\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1]);
    if (!a.vm || !a.r) continue;
    const ref = a.r.match(/^([A-Z]+)(\d+)$/);
    if (!ref) continue;
    const rcs = valueMeta[Number(a.vm) - 1] ?? [];
    const rc = rcs.find((x) => typeNames[Number(x.t) - 1] === 'XLRICHVALUE');
    const rvIndex = rc ? futureRv[Number(rc.v)] : null;
    const rv = rvIndex === null || rvIndex === undefined ? null : values[rvIndex];
    const keys = rv ? structures[rv.s] ?? [] : [];
    const at = keys.indexOf('_rvRel:LocalImageIdentifier');
    const relIndex = rv && at >= 0 ? Number(rv.v[at]) : NaN;
    const target = Number.isInteger(relIndex) ? relTargets.get(relIds[relIndex]) : null;
    const get = target ? zip.get(target) : null;
    if (!get) continue;
    out.push({ row: Number(ref[2]), col: columnNumber(ref[1]), data: get(), name: target });
  }
  return out;
}

// ---- CSV ----

/** CSV text as records (arrays of cells): quotes, doubled quotes, and commas and line breaks inside quotes. */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const outside = firstLine.replace(/"[^"]*"/g, '');
  const count = (ch) => outside.split(ch).length - 1;
  const delim = [';', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function decodeText(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

// ---- tabs ----

/** A tab's shape from its cells: { headerRow, headers, lastCol, rowCount }. A picture above the column names (a logo) makes no column. */
function shapeOf(rows, pictures = []) {
  const count = (r) => Object.values(r.cells).filter(filled).length;
  const first = rows.find((r) => r.row === 1 && count(r) >= 2) ?? rows.find((r) => count(r) >= 2) ?? null;
  let lastCol = 0;
  for (const r of rows) for (const [c, v] of Object.entries(r.cells)) if (filled(v)) lastCol = Math.max(lastCol, Number(c));
  for (const p of pictures) if (!first || p.row > first.row) lastCol = Math.max(lastCol, p.lastCol ?? p.col);
  if (!first) return { headerRow: null, headers: [], lastCol, rowCount: 0 };
  const after = rows.filter((r) => r.row > first.row && count(r) > 0);
  const headers = [];
  for (let col = 1; col <= Math.min(lastCol, MAX_COLUMNS); col++) {
    const text = first.cells[col]?.text || first.cells[col]?.behind || '';
    const used = text || after.some((r) => filled(r.cells[col])) || pictures.some((p) => p.col === col && p.row > first.row);
    if (used) headers.push({ col, text: text || `Column ${columnLetter(col)}` });
  }
  return { headerRow: first.row, headers, lastCol, rowCount: new Set([...after.map((r) => r.row), ...pictures.filter((p) => p.row > first.row).map((p) => p.row)]).size };
}

function rowsOf(ws, { shiftDays = 0, epoch = 1900, links = new Map() } = {}) {
  const byRow = new Map();
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    const cells = {};
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const v = cellValue(cell.value, { shiftDays });
      if (v.number !== undefined && epoch === 1904) v.epoch = 1904;
      if (filled(v)) cells[c] = v;
    });
    byRow.set(r, { row: r, cells });
  });
  // The links behind cells as the file stores them: one link may cover several cells, and may end with "#…".
  for (const [key, link] of links) {
    const [r, c] = key.split(':').map(Number);
    if (!byRow.has(r)) byRow.set(r, { row: r, cells: {} });
    const cells = byRow.get(r).cells;
    cells[c] = { ...(cells[c] ?? { text: '' }), behind: link };
  }
  return [...byRow.values()].sort((a, b) => a.row - b.row);
}

/** A tab's links behind cells, read from its XML: Map from "row:col" to the link, for every cell a link covers. */
export function linksOf(zip, part) {
  const out = new Map();
  const xml = part ? textPart(zip, part) : null;
  if (!xml) return out;
  const rels = relsOf(zip, part);
  for (const b of blocks(blocks(xml, 'hyperlinks')[0]?.body ?? '', 'hyperlink')) {
    const a = attrs(b.head);
    const rel = rels.find((r) => r.id === attr(a, 'id'));
    if (!rel?.external) continue;
    const link = `${rel.target}${a.location ? `#${a.location}` : ''}`.trim();
    if (!/^https?:\/\//i.test(link)) continue;
    const m = String(a.ref ?? '').toUpperCase().match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    if (!m) continue;
    const [c1, r1] = [columnNumber(m[1]), Number(m[2])];
    const [c2, r2] = m[3] ? [columnNumber(m[3]), Number(m[4])] : [c1, r1];
    if ((Math.abs(r2 - r1) + 1) * (Math.abs(c2 - c1) + 1) > 100000) continue;
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.set(`${r}:${c}`, link);
  }
  return out;
}

function floatingPictures(wb, ws) {
  const out = [];
  for (const img of ws.getImages()) {
    const media = wb.getImage(Number(img.imageId));
    if (!media?.buffer) continue;
    const tl = img.range?.tl ?? {};
    const br = img.range?.br;
    const row = Math.floor(tl.nativeRow ?? tl.row ?? 0) + 1;
    const col = Math.floor(tl.nativeCol ?? tl.col ?? 0) + 1;
    let lastCol = col;
    if (br) {
      lastCol = Math.floor(br.nativeCol ?? br.col ?? col - 1) + 1;
      if ((br.nativeColOff ?? 1) === 0 && lastCol > col) lastCol--;
    }
    const data = Buffer.from(media.buffer);
    const type = imageType(data);
    out.push({ row, col, lastCol: Math.max(col, lastCol), how: 'floating', type, ext: PICTURE_EXT[type] ?? String(media.extension ?? ''), data });
  }
  return out;
}

// What stops an upload, each in one plain sentence that says what to do.
const SAVE_AGAIN = 'The Excel file could not be read, so open it in Excel, save it again as an Excel Workbook (.xlsx), then upload it again.';
const OLD_XLS = 'This is an old Excel file (.xls) that the dashboard cannot read, so open it in Excel, save it as an Excel Workbook (.xlsx), then upload that.';
const NOT_TAKEN = 'This file is not an Excel file (.xlsx) or a CSV file (.csv), so save the Flipkart orders as one of those, then upload that.';
const tooMany = (what) => `The ${what} has more than ${MAX_ROWS} rows, so split it into smaller files, then upload each one.`;

/**
 * The tab to read: the one named "Flipkart" (capitals and spaces do not
 * matter: FLIPKART, " flip kart "), else the only tab. Null when the file has
 * several tabs and none is named so.
 */
export function pickTab(names, want = FLIPKART_TAB) {
  const key = (n) => String(n ?? '').replace(/\s+/g, '').toLowerCase();
  const named = names.find((n) => key(n) === key(want));
  if (named !== undefined) return named;
  return names.length === 1 ? names[0] : null;
}

/** "A", "B" and "C". */
const namesSaid = (names) => {
  const q = names.map((n) => `"${n}"`);
  return q.length <= 2 ? q.join(' and ') : `${q.slice(0, -1).join(', ')} and ${q.at(-1)}`;
};

async function openXlsx(buf, fileName, chosen) {
  let zip;
  try {
    zip = readZip(buf);
  } catch (err) {
    throw new SheetError(err.message);
  }
  if (!zip.has('xl/workbook.xml')) throw new SheetError(NOT_TAKEN);
  // Every part is unpacked once here, never larger than it says it is, before exceljs unpacks it with no limit of its own.
  try {
    for (const get of zip.values()) get();
  } catch {
    throw new SheetError(SAVE_AGAIN);
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    throw new SheetError(SAVE_AGAIN);
  }
  const names = wb.worksheets.map((ws) => ws.name);
  if (!names.length) throw new SheetError(SAVE_AGAIN);
  if (chosen !== null && !names.includes(chosen)) throw new SheetError(`This file has no tab named "${chosen}". Its tabs are ${namesSaid(names)}.`);
  const name = chosen ?? pickTab(names);
  if (name === null) return { chooseTab: { tabs: names, says: `This file has no tab named "${FLIPKART_TAB}", and it has ${names.length} tabs: ${namesSaid(names)}. Choose the tab with the orders.` } };
  const ws = wb.getWorksheet(name);
  const tabPart = tabsOf(zip).find((t) => t.name === name);
  // Excel counts days from 1900, or from 1904 in files saved that way; exceljs knows only date1904="1", not "true".
  const pr = attrs(blocks(textPart(zip, 'xl/workbook.xml'), 'workbookPr')[0]?.head ?? '');
  const date1904 = /^(1|true)$/i.test(String(pr.date1904 ?? ''));
  const shiftDays = date1904 && String(pr.date1904) !== '1' ? 1462 : 0;
  const rows = rowsOf(ws, { shiftDays, epoch: date1904 ? 1904 : 1900, links: linksOf(zip, tabPart?.part) });
  const pictures = floatingPictures(wb, ws);
  for (const p of cellPicturesOf(zip, name)) {
    const type = imageType(p.data);
    pictures.push({ row: p.row, col: p.col, lastCol: p.col, how: 'cell', type, ext: PICTURE_EXT[type] ?? p.name.split('.').pop(), data: p.data });
  }
  return { kind: 'xlsx', fileName, sheet: { name, rows, pictures } };
}

function openCsv(buf, fileName) {
  const records = parseCsv(decodeText(buf));
  const rows = records.map((rec, i) => {
    const cells = {};
    rec.forEach((v, j) => {
      const text = String(v).trim();
      if (text) cells[j + 1] = { text, behind: '' };
    });
    return { row: i + 1, cells };
  });
  return { kind: 'csv', fileName, sheet: { name: null, rows, pictures: [] } };
}

/**
 * Open an uploaded file, an .xlsx or a .csv file, decided by its first bytes
 * and its name, and read one tab: `tab` when the screen chose it, else the
 * one named "Flipkart", else the only tab. A CSV file has no tabs (its name
 * is null).
 *   -> { kind, fileName, tab: { name, headerRow, headers: [{ col, text }],
 *        lastCol, rowCount, rows, pictures } }, the rows being those after
 *        the column names
 *   or { chooseTab: { tabs, says } } when the file has several tabs and none
 *      is named "Flipkart".
 * Throws SheetError, with a plain sentence, for anything that cannot be read.
 */
export async function openWorkbook(buffer, { fileName = '', tab = null } = {}) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
  if (!buf.length) throw new SheetError('The file is empty.');
  const ext = /\.([A-Za-z0-9]+)$/.exec(String(fileName ?? ''))?.[1]?.toLowerCase() ?? '';
  if (ext === 'xls') throw new SheetError(OLD_XLS);
  if (ext && ext !== 'xlsx' && ext !== 'csv') throw new SheetError(NOT_TAKEN);
  let book;
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) {
    book = await openXlsx(buf, fileName, tab);
    if (book.chooseTab) return book;
  } else if (buf.length >= 8 && buf.readUInt32BE(0) === 0xd0cf11e0) {
    if (buf.includes(Buffer.from('EncryptedPackage', 'utf16le'))) throw new SheetError('The Excel file is protected with a password, so open it in Excel, save a copy without the password, then upload that.');
    throw new SheetError(OLD_XLS);
  } else {
    const looksText = !buf.subarray(0, 4096).includes(0);
    if (!(ext === 'csv' || (!ext && looksText))) throw new SheetError(NOT_TAKEN);
    book = openCsv(buf, fileName);
  }
  const s = book.sheet;
  const shape = shapeOf(s.rows, s.pictures);
  if (shape.headerRow === null) {
    throw new SheetError(book.kind === 'csv' ? 'The file is empty: no row has at least two filled cells to use as column names.' : `The "${s.name}" tab is empty: no row has at least two filled cells to use as column names.`);
  }
  if (shape.rowCount > MAX_ROWS) throw new SheetError(tooMany(book.kind === 'csv' ? 'file' : 'tab'));
  return {
    kind: book.kind,
    fileName,
    tab: { name: s.name, ...shape, rows: s.rows.filter((r) => r.row > shape.headerRow), pictures: s.pictures },
  };
}

// ---- which column holds what ----

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}#]+/gu, ' ').trim();
/** A column name's whole words, capitals, spaces and punctuation aside ("Order #" is order and #). */
const headingWords = (s) => norm(s).replace(/#/g, ' # ').split(/\s+/).filter(Boolean);
const PICTURE_WORDS = new Set(['screenshot', 'screenshots', 'screen', 'shot', 'ss', 'image', 'images', 'picture', 'pictures', 'photo', 'photos', 'pic', 'pics', 'snap', 'snapshot', 'proof']);
const REVIEW_WORDS = ['review', 'reviews', 'rating', 'ratings'];
const any = (words, list) => words.some((w) => list.includes(w));
const anyPicture = (words) => words.some((w) => PICTURE_WORDS.has(w));

/**
 * What each column name can mean, by whole words: "Reviewer Name" is never a
 * review link, and "Order Screenshot" is never the order ID. In the order the
 * columns are taken: one column never holds two things. As on Amazon, but a
 * "Flipkart ID" or an "OD Number" is the order ID.
 */
const MEANINGS = [
  ['orderShot', (t) => any(t, ['order', 'ordered', 'purchase', 'purchased', 'invoice']) && anyPicture(t) && !any(t, ['delivery', 'delivered', ...REVIEW_WORDS])],
  ['deliveryShot', (t) => any(t, ['delivery', 'delivered']) && (anyPicture(t) || !any(t, ['date', 'address', 'status', 'time', 'charge', 'charges', 'fee', 'partner', 'pincode', 'city']))],
  ['reviewShot', (t) => any(t, REVIEW_WORDS) && anyPicture(t)],
  ['reviewLink', (t, s) => any(t, REVIEW_WORDS) && !anyPicture(t) && !any(t, ['name', 'status', 'date', 'by', 'title', 'text']) && (any(t, ['link', 'links', 'url', 'urls']) || ['review', 'reviews', 'live review', 'review live', 'rating'].includes(s))],
  ['orderId', (t) => any(t, ['order', 'flipkart', 'od']) && any(t, ['id', 'no', 'number', 'num', 'nr', '#']) && !anyPicture(t)],
  ['orderDate', (t, s) => (t.includes('date') && (any(t, ['order', 'ordered', 'purchase', 'purchased', 'placed', 'bought']) || s === 'date')) || (any(t, ['ordered', 'purchased']) && t.includes('on'))],
  ['amount', (t) => any(t, ['amount', 'value', 'price', 'total', 'paid', 'cost', 'mrp', 'rupees', 'inr', 'rs']) && !any(t, ['date', 'id'])],
  ['product', (t) => any(t, ['product', 'products', 'item', 'items']) && !anyPicture(t) && !any(t, ['link', 'url', 'id', 'asin', 'code', 'price', 'amount', 'value', 'brand'])],
  ['reviewer', (t, s) => (any(t, ['reviewer', 'user', 'customer', 'buyer', 'profile', 'client']) && (t.includes('name') || t.length === 1)) || ['name', 'full name'].includes(s)],
  ['email', (t) => (any(t, ['email', 'emails', 'emailid', 'mail', 'mailid', 'gmail']) || (t.includes('e') && t.includes('mail'))) && !any(t, ['sent', 'date', 'status', 'count'])],
  ['status', (t, s) => ['status', 'verification status', 'final status', 'check status', 'verification'].includes(s)],
  ['type', (t, s) => ['type', 'reason', 'result type'].includes(s)],
  ['note', (t, s) => ['note', 'notes', 'remark', 'remarks', 'comment', 'comments'].includes(s)],
];

/** What a column's cells hold, in the rows under the heading row: how many are filled, and how many hold a link, a Flipkart link, a picture, an order ID, an amount, a date or an email address. */
function cellsOf(tab, col) {
  const out = { filled: 0, links: 0, flipkart: 0, pictures: 0, ids: 0, amounts: 0, dates: 0, emails: 0 };
  for (const r of tab?.rows ?? []) {
    const c = r.cells?.[col];
    if (!filled(c)) continue;
    out.filled++;
    const links = cellLinks(c.text ?? '', c.behind ?? '').links;
    if (links.length) out.links++;
    if (links.some((l) => isFlipkart(l) || isShortLink(l))) out.flipkart++;
    if (orderIdOf(c.text)) out.ids++;
    if (amountOf(c) !== null) out.amounts++;
    if (dateOf(c)) out.dates++;
    if (EMAIL_SHAPE.test(String(c.text ?? '').trim())) out.emails++;
  }
  out.pictures = (tab?.pictures ?? []).filter((p) => p.row > (tab.headerRow ?? 0) && p.col === col).length;
  return out;
}

const share = (n, of) => (of > 0 ? n / of : 0);
/** A column whose cells clearly hold something else is never used for this, whatever its name says. */
const HOLDS_ELSE = {
  orderId: (c) => c.filled >= 3 && share(c.ids, c.filled) < 0.3,
  orderDate: (c) => c.filled >= 3 && share(c.dates, c.filled) < 0.3,
  amount: (c) => c.filled >= 3 && share(c.amounts, c.filled) < 0.3,
  product: (c) => c.filled >= 3 && share(c.links, c.filled) > 0.5,
  orderShot: (c) => c.filled + c.pictures >= 3 && share(c.links + c.pictures, c.filled + c.pictures) < 0.2,
  deliveryShot: (c) => c.filled + c.pictures >= 3 && share(c.links + c.pictures, c.filled + c.pictures) < 0.2,
  reviewShot: (c) => c.filled + c.pictures >= 3 && share(c.links + c.pictures, c.filled + c.pictures) < 0.2,
  reviewLink: (c) => c.filled + c.pictures >= 3 && share(c.links + c.pictures, c.filled + c.pictures) < 0.2,
  reviewer: (c) => c.filled >= 3 && (share(c.links, c.filled) > 0.3 || share(c.ids, c.filled) > 0.3),
  email: (c) => c.filled >= 3 && share(c.emails, c.filled) < 0.3,
};

/**
 * Which column holds what: a remembered choice first (by its column names,
 * ignoring capitals, spaces and punctuation), then what each column name
 * means, by whole words. With the tab's rows, a column whose cells clearly
 * hold something else is never used, and the order ID (cells that are order
 * IDs) or the review link (cells that are Flipkart links) is found by its
 * cells when no name says it, and so is the email address (cells that are
 * email addresses). One column never holds two things.
 * -> { [field]: column number | null }
 */
export function guessColumns(headers, saved = null, tab = null) {
  const list = Array.isArray(headers) ? headers : [];
  const mapping = Object.fromEntries(FIELDS.map((f) => [f.key, null]));
  const used = new Set();
  const seen = new Map();
  const cells = (col) => {
    if (!seen.has(col)) seen.set(col, cellsOf(tab, col));
    return seen.get(col);
  };
  const fits = (key, col) => !tab || !HOLDS_ELSE[key]?.(cells(col));
  const take = (key, col) => {
    mapping[key] = col;
    used.add(col);
  };
  if (saved && typeof saved === 'object') {
    for (const f of FIELDS) {
      const want = saved[f.key];
      if (typeof want !== 'string' || !norm(want)) continue;
      const h = list.find((x) => !used.has(x.col) && norm(x.text) === norm(want) && fits(f.key, x.col));
      if (h) take(f.key, h.col);
    }
  }
  for (const [key, means] of MEANINGS) {
    if (mapping[key] !== null) continue;
    const h = list.find((x) => !used.has(x.col) && means(headingWords(x.text), headingWords(x.text).join(' ')) && fits(key, x.col));
    if (h) take(key, h.col);
  }
  if (tab) {
    const byCells = (test) => list.find((x) => !used.has(x.col) && test(cells(x.col)));
    if (mapping.orderId === null) {
      const h = byCells((c) => c.filled >= 3 && share(c.ids, c.filled) >= 0.8);
      if (h) take('orderId', h.col);
    }
    if (mapping.reviewLink === null && mapping.reviewShot === null) {
      const h = byCells((c) => c.filled >= 3 && share(c.flipkart, c.filled) >= 0.5);
      if (h) take('reviewLink', h.col);
    }
    if (mapping.email === null) {
      const h = byCells((c) => c.filled >= 3 && share(c.emails, c.filled) >= 0.8);
      if (h) take('email', h.col);
    }
  }
  return mapping;
}

/** What is wrong with a choice of columns, in plain sentences; [] when it can be used. */
export function columnProblems(mapping, headers) {
  const m = mapping && typeof mapping === 'object' ? mapping : {};
  const cols = new Set((Array.isArray(headers) ? headers : []).map((h) => h.col));
  const out = [];
  const none = (key) => m[key] === null || m[key] === undefined || m[key] === '';
  if (none('orderId')) out.push('Say which column holds the order ID.');
  if (none('reviewLink') && none('reviewShot')) out.push('Say which column holds the review link or the review screenshot.');
  const byCol = new Map();
  for (const f of FIELDS) {
    const v = m[f.key];
    if (v === null || v === undefined || v === '') continue;
    if (!Number.isInteger(v) || !cols.has(v)) {
      out.push(`The column chosen for ${f.label} is not in this tab.`);
      continue;
    }
    byCol.set(v, [...(byCol.get(v) ?? []), f.label]);
  }
  for (const labels of byCol.values()) if (labels.length > 1) out.push(`One column cannot hold two things: ${labels.join(' and ')}.`);
  return out;
}

/** What to remember of a choice of columns for next time: each field's column name. */
export function rememberedChoice(mapping, headers) {
  const out = {};
  for (const f of FIELDS) {
    const h = (headers ?? []).find((x) => x.col === mapping?.[f.key]);
    if (h) out[f.key] = h.text;
  }
  return out;
}

/**
 * Where Status, Type and Note are written: the chosen columns, and a new
 * column after the last one for each left out, headed with its name.
 * -> { status, type, note, added: [{ col, header }] }
 */
export function resultColumns(mapping, lastCol) {
  const out = { added: [] };
  let next = Math.max(0, Number(lastCol) || 0) + 1;
  for (const key of RESULT_FIELDS) {
    if (Number.isInteger(mapping?.[key])) out[key] = mapping[key];
    else {
      out[key] = next;
      out.added.push({ col: next, header: RESULT_HEADERS[key] });
      next++;
    }
  }
  return out;
}

// ---- the rows ----

function emptyShot(s) {
  return !s.text && !s.links.length && !s.picture;
}

/**
 * The rows of a tab, by a usable choice of columns:
 * { rows: [{ row, n, orderId, orderDate, amount, product, shots: { order,
 *   delivery, review, reviewShot }, prev, values }], unplaced: [sentences] }.
 * values holds the cells of the file's other columns (by column number), to
 * be shown as they are. A field whose column the file does not have is
 * empty. row is the row in the file, where the results are written; n is the
 * row's number on the dashboard: the rows are numbered from 1 in the file's
 * order, and the heading row is never one of them.
 * Each shot is { text, link, links, mismatch, picture }. A picture in a
 * picture cell is used as that cell's picture. Rows with nothing in the
 * chosen columns are left out.
 */
export function sheetRows(tab, mapping) {
  const shotCols = Object.keys(PICTURE_FIELDS).map((k) => mapping[k]).filter(Number.isInteger);
  // The reviewer's name and the email address are only shown, so they are kept with the file's other columns.
  const mapped = new Set(Object.entries(mapping ?? {}).filter(([k, col]) => !SHOWN_FIELDS.has(k) && Number.isInteger(col)).map(([, col]) => col));
  const pictures = (tab.pictures ?? []).filter((p) => p.row > (tab.headerRow ?? 0)).map((p, i) => ({ ...p, i }));
  const taken = new Set();
  const pictureAt = (row, col) => {
    const free = pictures.filter((p) => !taken.has(p.i) && p.row === row);
    const pick =
      free.find((p) => p.how === 'cell' && p.col === col) ??
      free.find((p) => p.how === 'floating' && p.col === col) ??
      free.find((p) => p.how === 'floating' && !shotCols.includes(p.col) && p.col <= col && col <= p.lastCol && shotCols.filter((c) => p.col <= c && c <= p.lastCol).length === 1);
    if (pick) taken.add(pick.i);
    return pick ?? null;
  };
  const rowsWith = new Set([...(tab.rows ?? []).map((r) => r.row), ...pictures.map((p) => p.row)]);
  const byRow = new Map((tab.rows ?? []).map((r) => [r.row, r]));
  const rows = [];
  for (const n of [...rowsWith].sort((a, b) => a - b)) {
    const cells = byRow.get(n)?.cells ?? {};
    const cell = (key) => (Number.isInteger(mapping[key]) ? cells[mapping[key]] ?? null : null);
    const text = (key) => String(cell(key)?.text ?? '').trim();
    const shot = (key) => {
      const c = cell(key);
      const pic = Number.isInteger(mapping[key]) ? pictureAt(n, mapping[key]) : null;
      return { ...cellLinks(c?.text ?? '', c?.behind ?? ''), picture: pic ? { how: pic.how, type: pic.type, data: pic.data } : null };
    };
    const shots = { order: shot('orderShot'), delivery: shot('deliveryShot'), review: shot('reviewLink'), reviewShot: shot('reviewShot') };
    const r = {
      row: n,
      orderId: { text: text('orderId'), value: text('orderId') ? orderIdOf(text('orderId')) : '' },
      orderDate: { text: text('orderDate'), value: dateOf(cell('orderDate')) },
      amount: { text: text('amount'), value: amountOf(cell('amount')) },
      product: { text: text('product') },
      shots,
      prev: null,
    };
    const prev = Object.fromEntries(RESULT_FIELDS.map((k) => [k, text(k)]));
    if (prev.status || prev.type || prev.note) r.prev = prev;
    // The file's other columns, such as the reviewer's name: kept as they are, to be shown.
    r.values = {};
    for (const hd of tab.headers ?? []) {
      const c = cells[hd.col];
      if (!mapped.has(hd.col) && filled(c)) r.values[hd.col] = { text: String(c.text ?? '').trim().slice(0, 500), behind: String(c.behind ?? '').slice(0, 2000) };
    }
    if (!r.orderId.text && !r.orderDate.text && !r.amount.text && !r.product.text && Object.values(shots).every(emptyShot)) {
      for (const p of pictures) if (p.row === n) taken.delete(p.i);
      continue;
    }
    rows.push(r);
  }
  if (rows.length > MAX_ROWS) throw new SheetError(tooMany(tab.name === null ? 'file' : 'tab'));
  rows.forEach((r, i) => (r.n = i + 1));
  // A picture that was not used, said with the rows' numbers on the dashboard and the column's name, never a cell's name.
  const numberAt = new Map(rows.map((r) => [r.row, r.n]));
  const columnName = (col) => {
    const name = (tab.headers ?? []).find((h) => h.col === col)?.text;
    return name ? `the "${name}" column` : 'a column with no name';
  };
  // The picture columns this file has: "Purchase screenshot, Delivery screenshot or Review link".
  const named = Object.keys(PICTURE_FIELDS).filter((k) => Number.isInteger(mapping[k])).map((k) => LABEL[k]);
  const pictureColumns = named.length > 1 ? `${named.slice(0, -1).join(', ')} or ${named.at(-1)}` : named[0] ?? 'picture';
  const unplaced = pictures
    .filter((p) => !taken.has(p.i))
    .map((p) => {
      const where = `A picture ${p.how === 'cell' ? 'in' : 'over'} ${columnName(p.col)}`;
      if (numberAt.has(p.row)) return `${where}, in Row ${numberAt.get(p.row)}, is not in the ${pictureColumns} column, so it was not used.`;
      const before = rows.filter((r) => r.row < p.row).at(-1);
      return `${where} is in a row with nothing else in it, ${before ? `just after Row ${before.n}` : 'above Row 1'}, so it was not used.`;
    });
  return { rows, unplaced };
}
