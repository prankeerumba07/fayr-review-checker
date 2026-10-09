// Reading the Flipkart orders file: an Excel file (.xlsx) or a CSV file.
// Copied from the Amazon reader (amazon/workbook.js) and changed for
// Flipkart. One tab is read: the one named "Flipkart" (capitals and spaces do
// not matter), else the file's only tab; when the file has several tabs and
// none is named so, the screen is told the tabs, to choose one. The heading
// row (row 1, else the first row with two filled cells) and every row under
// it are read as they are: each cell's words, the link behind them, and
// whether a picture is in it. A row with nothing in it is left out. Nothing
// is downloaded and no link is opened.

import ExcelJS from 'exceljs';
import { readZip } from './zip.js';
import { imageType, PICTURE_EXT } from './image-type.js';
import { unescapeXml, attrs, attr, textPart, relsOf, blocks, columnLetter, columnNumber, tabsOf } from './ooxml.js';

/** The tab read, when the file has one with this name. */
export const FLIPKART_TAB = 'Flipkart';
export const MAX_ROWS = 5000;
export const MAX_COLUMNS = 200;

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
const dayFirst = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');

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
 * The rows under the heading row, each with its cells in the columns that
 * have a name or something in them: { row, cells: { [col]: { text, behind,
 * picture? } } }. A row with nothing in it is left out; a row with only a
 * picture is kept.
 */
function tableRows(shape, rows, pictures) {
  const cols = new Set(shape.headers.map((h) => h.col));
  const byRow = new Map();
  for (const r of rows) {
    if (r.row <= shape.headerRow) continue;
    const cells = {};
    for (const [c, v] of Object.entries(r.cells)) if (cols.has(Number(c)) && filled(v)) cells[c] = { text: v.text ?? '', behind: v.behind ?? '' };
    byRow.set(r.row, { row: r.row, cells });
  }
  for (const p of pictures) {
    if (p.row <= shape.headerRow || !cols.has(p.col)) continue;
    if (!byRow.has(p.row)) byRow.set(p.row, { row: p.row, cells: {} });
    const cells = byRow.get(p.row).cells;
    cells[p.col] = { ...(cells[p.col] ?? { text: '', behind: '' }), picture: true };
  }
  return [...byRow.values()].filter((r) => Object.keys(r.cells).length).sort((a, b) => a.row - b.row);
}

/**
 * Open an uploaded file, an .xlsx or a .csv file, decided by its first bytes
 * and its name, and read one tab: `tab` when the screen chose it, else the
 * one named "Flipkart", else the only tab. A CSV file has no tabs.
 *   -> { kind, fileName, tab, headerRow, headers: [{ col, text }], rows }
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
  const rows = tableRows(shape, s.rows, s.pictures);
  if (rows.length > MAX_ROWS) throw new SheetError(`The ${book.kind === 'csv' ? 'file' : 'tab'} has more than ${MAX_ROWS} rows, so split it into smaller files, then upload each one.`);
  return { kind: book.kind, fileName, tab: s.name, headerRow: shape.headerRow, headers: shape.headers, rows };
}
