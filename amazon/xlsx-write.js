// Writing the results into the uploaded Excel file. Only the Status, Type and
// Note cells of the checked tab change, and the heading of a new Note column;
// they are written straight into that tab's XML. A Note keeps each of its
// lines on its own line: its cell gets a copy of its own look with "wrap
// text" turned on, added at the end of the file's list of cell looks. Every
// other part of the file stays byte for byte the same: the other tabs, the
// links behind cells, the filter, the column widths and the formatting.
// exceljs never writes the file, because it would change or drop parts it
// does not know.

import { readZip, replaceInZip } from './zip.js';
import { tabsOf, textPart, escapeXml, attrs, columnLetter, columnNumber } from './ooxml.js';

/** A problem writing the file, in a plain sentence the screen can show. */
export class WriteError extends Error {}

const cellRef = (row, col) => `${columnLetter(col)}${row}`;

/** The style a new cell in this row and column takes, as Excel gives it: the row's own, else the column's. */
function newCellStyle(rowHead, col, cols) {
  const a = rowHead ? attrs(rowHead) : {};
  if (a.customFormat === '1' || a.customFormat === 'true') return a.s ?? null;
  const c = cols.find((x) => col >= x.min && col <= x.max);
  return c?.style ?? null;
}

function inlineCell(p, ref, style, text) {
  const t = escapeXml(text);
  const space = /^\s|\s$|\n/.test(t) ? ' xml:space="preserve"' : '';
  return `<${p}c r="${ref}"${style !== null && style !== undefined ? ` s="${style}"` : ''} t="inlineStr"><${p}is><${p}t${space}>${t}</${p}t></${p}is></${p}c>`;
}

/**
 * The file's list of cell looks (xl/styles.xml), to add looks with "wrap
 * text" turned on: wrap(style) gives the look to use for a cell of that look
 * whose lines must show on their own lines. null when the file has no list.
 */
function wrapLooks(zip) {
  const name = 'xl/styles.xml';
  const xml = textPart(zip, name);
  const m = xml?.match(/<((?:\w+:)?)cellXfs\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?cellXfs>/);
  if (!m) return null;
  const p = m[1];
  const xfs = [...m[3].matchAll(/<(?:\w+:)?xf\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?xf>)/g)].map((x) => x[0]);
  const added = [];
  const made = new Map();
  return {
    wrap(style) {
      const base = Number.isInteger(Number(style)) && Number(style) >= 0 && Number(style) < xfs.length ? Number(style) : 0;
      if (!xfs.length) return style;
      if (/wrapText\s*=\s*"(1|true)"/.test(xfs[base])) return String(base);
      if (made.has(base)) return made.get(base);
      let xf = xfs[base].replace(/\sapplyAlignment\s*=\s*"[^"]*"/, '').replace(/^<((?:\w+:)?xf)\b/, '<$1 applyAlignment="1"');
      if (/<(?:\w+:)?alignment\b/.test(xf)) xf = xf.replace(/<((?:\w+:)?alignment)\b([^>]*?)(\/?)>/, (all, tag, a, close) => `<${tag}${a.replace(/\swrapText\s*=\s*"[^"]*"/, '')} wrapText="1"${close}>`);
      else if (/\/>$/.test(xf)) xf = xf.replace(/\s*\/>$/, `><${p}alignment wrapText="1"/></${p}xf>`);
      else xf = xf.replace(/^(<(?:\w+:)?xf\b[^>]*>)/, `$1<${p}alignment wrapText="1"/>`);
      const index = String(xfs.length + added.length);
      added.push(xf);
      made.set(base, index);
      return index;
    },
    /** The changed list, when a look was added: [name, bytes]; else null. */
    part() {
      if (!added.length) return null;
      const count = xfs.length + added.length;
      const head = m[2].match(/\scount\s*=\s*"/) ? m[2].replace(/(\scount\s*=\s*")\d*"/, `$1${count}"`) : `${m[2]} count="${count}"`;
      const out = xml.slice(0, m.index) + `<${p}cellXfs${head}>${m[3]}${added.join('')}</${p}cellXfs>` + xml.slice(m.index + m[0].length);
      return [name, Buffer.from(out, 'utf8')];
    },
  };
}

/**
 * One row's cells with some written: `cells` is the row's inner XML, `writes`
 * is [{ col, text, style, wrap, name }] where style undefined means "as Excel
 * would give a new cell" (keeping the old cell's style when there is one),
 * wrap asks for each line on its own line, and name says which cell it is
 * ("Status") in a problem.
 */
function writeRow(p, rowNo, rowHead, cells, writes, cols, looks = null) {
  const list = []; // { col, xml, style, lead }: lead is what came before the cell (usually nothing)
  const re = /<((?:\w+:)?)c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
  let last = 0;
  let prevCol = 0;
  let m;
  while ((m = re.exec(cells))) {
    const a = attrs(m[2]);
    const ref = a.r ? String(a.r).match(/^([A-Z]+)(\d+)$/) : null;
    const col = ref ? columnNumber(ref[1]) : prevCol + 1;
    let xml = m[0];
    // A cell without its place written gets it, so the cells after a new one keep theirs.
    if (!a.r) xml = xml.replace(/^<((?:\w+:)?c)\b/, `<$1 r="${cellRef(rowNo, col)}"`);
    list.push({ col, xml, style: a.s ?? null, lead: cells.slice(last, m.index) });
    prevCol = col;
    last = m.index + m[0].length;
  }
  const tail = cells.slice(last);
  for (const w of writes) {
    const at = list.findIndex((c) => c.col === w.col);
    // A formula is never written over: other cells and Excel's own list of formulas may point to it.
    if (at >= 0 && /<(?:\w+:)?f\b/.test(list[at].xml)) {
      // The row is named as the dashboard names it ("Row 20") when the write says so.
      throw new WriteError(`The ${w.name ?? 'result'} cell of ${w.label ?? `row ${rowNo}`} holds a formula, so a result cannot be written there. In Excel, clear the formulas from the Status, Type and Note columns, save the file, upload it again, then download the checked file.`);
    }
    let style = w.style !== undefined ? w.style : at >= 0 ? list[at].style : newCellStyle(rowHead, w.col, cols);
    if (w.wrap && looks && /\n/.test(w.text)) style = looks.wrap(style);
    const xml = inlineCell(p, cellRef(rowNo, w.col), style, w.text);
    if (at >= 0) list[at] = { ...list[at], xml };
    else {
      const before = list.findIndex((c) => c.col > w.col);
      const item = { col: w.col, xml, style, lead: '' };
      if (before < 0) list.push(item);
      else list.splice(before, 0, item);
    }
  }
  return list.map((c) => c.lead + c.xml).join('') + tail;
}

/**
 * The uploaded file with these cells written on one tab, every other part as
 * it was. writes: [{ row, col, text, style? }]. Returns the new file's bytes.
 * Throws WriteError with a plain sentence when it cannot be done.
 */
export function writeCells(buffer, tabName, writes) {
  let zip;
  try {
    zip = readZip(buffer);
  } catch (err) {
    throw new WriteError(`The uploaded Excel file could not be opened again: ${err.message}`);
  }
  const tab = tabsOf(zip).find((t) => t.name === tabName);
  if (!tab?.part) throw new WriteError(`The uploaded Excel file has no tab named "${tabName}" any more. Upload it again.`);
  const xml = textPart(zip, tab.part);
  if (!xml) throw new WriteError(`The tab "${tabName}" could not be read in the uploaded Excel file.`);
  const sd = xml.match(/<((?:\w+:)?)sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?sheetData>)/);
  if (!sd) throw new WriteError(`The tab "${tabName}" holds no cells that can be written.`);
  const p = sd[1];
  const cols = [...xml.matchAll(/<(?:\w+:)?col\b([^>]*?)\/?>/g)].map((c) => {
    const a = attrs(c[1]);
    return { min: Number(a.min), max: Number(a.max), style: a.style ?? null };
  });
  const byRow = new Map();
  for (const w of writes) {
    if (!Number.isInteger(w.row) || w.row < 1 || !Number.isInteger(w.col) || w.col < 1) throw new WriteError('A result has no place in the sheet.');
    if (!byRow.has(w.row)) byRow.set(w.row, []);
    byRow.get(w.row).push({ col: w.col, text: String(w.text ?? ''), style: w.style, wrap: Boolean(w.wrap), name: w.name });
  }
  for (const list of byRow.values()) list.sort((a, b) => a.col - b.col);

  const looks = wrapLooks(zip);
  const inner = sd[2] ?? '';
  const rowRe = /<((?:\w+:)?)row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
  let out = '';
  let last = 0;
  let prevRow = 0;
  const done = new Set();
  const insertBefore = (n) => {
    // Rows that do not exist yet, in order, before row n.
    let s = '';
    for (const r of [...byRow.keys()].filter((x) => !done.has(x) && x < n).sort((a, b) => a - b)) {
      s += `<${p}row r="${r}">${writeRow(p, r, null, '', byRow.get(r), cols, looks)}</${p}row>`;
      done.add(r);
    }
    return s;
  };
  let m;
  while ((m = rowRe.exec(inner))) {
    const a = attrs(m[2]);
    const n = a.r ? Number(a.r) : prevRow + 1;
    out += inner.slice(last, m.index);
    out += insertBefore(n);
    if (byRow.has(n) && !done.has(n)) {
      const head = `<${m[1]}row${a.r ? '' : ` r="${n}"`}${m[2]}>`;
      out += `${head}${writeRow(p, n, head, m[3] ?? '', byRow.get(n), cols, looks)}</${m[1]}row>`;
      done.add(n);
    } else out += m[0];
    prevRow = n;
    last = m.index + m[0].length;
  }
  out += inner.slice(last);
  out += insertBefore(Infinity);
  const open = sd[0].slice(0, sd[0].indexOf('>') + 1).replace(/\/>$/, '>');
  const newSheetData = `${open}${out}</${p}sheetData>`;
  const newXml = xml.slice(0, sd.index) + newSheetData + xml.slice(sd.index + sd[0].length);
  const parts = new Map([[tab.part, Buffer.from(newXml, 'utf8')]]);
  const styles = looks?.part();
  if (styles) parts.set(styles[0], styles[1]);
  return replaceInZip(buffer, parts);
}

/** The style of the heading cell nearest to the left of a column on the heading row, for a new heading; null when none. */
export function headingStyle(buffer, tabName, row, col) {
  const zip = readZip(buffer);
  const tab = tabsOf(zip).find((t) => t.name === tabName);
  const xml = tab?.part ? textPart(zip, tab.part) : null;
  if (!xml) return null;
  const rowXml = [...xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)].find((m) => Number(attrs(m[1]).r) === row);
  if (!rowXml?.[2]) return null;
  let best = null;
  for (const c of rowXml[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>)/g)) {
    const a = attrs(c[1]);
    const ref = String(a.r ?? '').match(/^([A-Z]+)\d+$/);
    if (!ref) continue;
    const at = columnNumber(ref[1]);
    if (at < col && (!best || at > best.at)) best = { at, style: a.s ?? null };
  }
  return best?.style ?? null;
}
