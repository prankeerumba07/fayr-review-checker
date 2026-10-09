// Writing the results into the uploaded Excel file: the downloaded file
// differs from the uploaded one only in the Amazon tab's Status, Type and Note
// cells (and the heading of the new Note column). The other tabs, the links
// behind cells, the filter, the column widths and the formatting stay byte for
// byte the same; a Note of several lines keeps each on its own line, with a
// "wrap text" look added for its cell. The made-up orders file only.
// Run: node test/xlsx-write.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { writeCells, headingStyle, WriteError } from '../amazon/xlsx-write.js';
import { readZip, replaceInZip } from '../amazon/zip.js';
import { tabsOf } from '../amazon/ooxml.js';
import { FILE, ROWS } from './fixtures/sheets/make-orders.mjs';

const ORDERS = readFileSync(FILE);
const AMAZON = tabsOf(readZip(ORDERS)).find((t) => t.name === 'Amazon').part;
const H = 8;
const I = 9;
const J = 10;

/** Every cell of a worksheet's XML: Map from its place ("H5") to its XML. */
function cellsOf(xml) {
  const out = new Map();
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g)) out.set(m[1].match(/\br="([A-Z]+\d+)"/)[1], m[0]);
  return out;
}
/** Excel refuses a row whose cells are not left to right: every row's cells, in order, with no column twice. */
function assertCellsInOrder(xml) {
  const letters = (ref) => [...ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cols = [...row[1].matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"/g)].map((m) => letters(m[1]));
    for (let i = 1; i < cols.length; i++) assert.ok(cols[i] > cols[i - 1], `cells out of order in ${row[0].slice(0, 30)}`);
  }
}
const outsideCells = (xml) => xml.replace(/<sheetData\b[\s\S]*?<\/sheetData>/, '<sheetData/>');
const rowHeads = (xml) => [...xml.matchAll(/<row\b[^>]*>/g)].map((m) => m[0]);
const entries = (buf) => {
  const zip = readZip(buf);
  return new Map([...zip.keys()].map((k) => [k, zip.get(k)()]));
};

const RESULTS = [
  { row: 2, status: 'Verified', type: 'Verified', note: 'Order screenshot, delivery screenshot and the review all match. The review is live and public.' },
  { row: 15, status: 'Unverified', type: 'Not delivered', note: 'The delivery screenshot cell says "Cancelled" instead of holding a screenshot.' },
  { row: 24, status: 'Unverified', type: 'Need Access', note: 'The review link opens a page & another: <words> "differ".' },
];
const writesFor = (results, style = null) => [
  { row: 1, col: J, text: 'Note', style },
  ...results.flatMap((r) => [
    { row: r.row, col: H, text: r.status },
    { row: r.row, col: I, text: r.type },
    { row: r.row, col: J, text: r.note },
  ]),
];

test('only the Amazon tab’s Status, Type and Note cells change; every other part of the file is byte for byte the same', () => {
  const style = headingStyle(ORDERS, 'Amazon', 1, J);
  const out = writeCells(ORDERS, 'Amazon', writesFor(RESULTS, style));
  const before = entries(ORDERS);
  const after = entries(out);
  assert.deepEqual([...after.keys()], [...before.keys()], 'the same parts, in the same order');
  for (const [name, data] of before) {
    if (name === AMAZON) continue;
    assert.ok(after.get(name).equals(data), `${name} is unchanged`);
  }
  const oldXml = before.get(AMAZON).toString('utf8');
  const newXml = after.get(AMAZON).toString('utf8');
  assert.equal(outsideCells(newXml), outsideCells(oldXml), 'the filter, the column widths, the links behind cells and everything else in the tab is unchanged');
  assert.deepEqual(rowHeads(newXml), rowHeads(oldXml), 'every row as it was');
  const oldCells = cellsOf(oldXml);
  const newCells = cellsOf(newXml);
  const written = new Set(['J1', ...RESULTS.flatMap((r) => [`H${r.row}`, `I${r.row}`, `J${r.row}`])]);
  for (const [ref, xml] of oldCells) if (!written.has(ref)) assert.equal(newCells.get(ref), xml, `cell ${ref} is unchanged`);
  for (const ref of newCells.keys()) assert.ok(oldCells.has(ref) || written.has(ref), `no other cell was added: ${ref}`);
  assert.equal(newCells.get('J1'), `<c r="J1"${style ? ` s="${style}"` : ''} t="inlineStr"><is><t>Note</t></is></c>`, 'the new Note column is headed "Note", looking like the heading beside it');
  assert.ok(style, 'the heading beside it has a look of its own');
  // The bytes of every part but the Amazon tab are copied as they were, not packed again.
  const raw = (buf, name) => {
    const at = buf.indexOf(Buffer.from(name));
    return buf.subarray(at - 30, at + name.length + 40);
  };
  assert.ok(raw(out, 'xl/worksheets/sheet1.xml').equals(raw(ORDERS, 'xl/worksheets/sheet1.xml')));
});

test('the written cells say what the dashboard found, exactly; rows not checked keep H, I and J empty', async () => {
  const out = writeCells(ORDERS, 'Amazon', writesFor(RESULTS));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out);
  const ws = wb.getWorksheet('Amazon');
  for (const r of RESULTS) {
    assert.equal(ws.getCell(r.row, H).value, r.status);
    assert.equal(ws.getCell(r.row, I).value, r.type);
    assert.equal(ws.getCell(r.row, J).value, r.note, 'every character, & < > and quotes too');
  }
  assert.equal(ws.getCell(1, J).value, 'Note');
  for (const n of [3, 14, 16, 32]) for (const col of [H, I, J]) assert.equal(ws.getCell(n, col).value, null, `row ${n} column ${col} stays empty`);
  // What exceljs reads back of the rest: the other tabs, the links behind cells, the filter and the widths.
  const before = new ExcelJS.Workbook();
  await before.xlsx.load(ORDERS);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Instamart', 'Flipkart', 'Amazon']);
  for (const name of ['Instamart', 'Flipkart']) {
    const a = before.getWorksheet(name);
    const b = wb.getWorksheet(name);
    a.eachRow((row, n) => row.eachCell((cell, c) => assert.deepEqual(b.getCell(n, c).value, cell.value, `${name} ${cell.address}`)));
  }
  assert.deepEqual(ws.getCell('G2').value, { text: ROWS[2].review.text, hyperlink: ROWS[2].review.link });
  assert.deepEqual(ws.getCell('G24').value, { text: ROWS[24].review.text, hyperlink: ROWS[24].review.link }, 'the link behind words that say another link is kept as it was');
  assert.deepEqual(ws.autoFilter, before.getWorksheet('Amazon').autoFilter);
  assert.deepEqual(ws.columns.slice(0, 9).map((c) => c.width), before.getWorksheet('Amazon').columns.slice(0, 9).map((c) => c.width));
});

test('a row checked again gets its new result, and nothing else moves', () => {
  const first = writeCells(ORDERS, 'Amazon', writesFor(RESULTS));
  const again = writeCells(first, 'Amazon', [
    { row: 15, col: H, text: 'Verified' },
    { row: 15, col: I, text: 'Rating Only' },
    { row: 15, col: J, text: 'Checked again.' },
  ]);
  const a = cellsOf(entries(first).get(AMAZON).toString('utf8'));
  const b = cellsOf(entries(again).get(AMAZON).toString('utf8'));
  for (const [ref, xml] of a) if (!['H15', 'I15', 'J15'].includes(ref)) assert.equal(b.get(ref), xml, ref);
  assert.match(b.get('I15'), /<t>Rating Only<\/t>/);
  assert.match(b.get('J15'), /<t>Checked again\.<\/t>/);
});

test('a cell that was there keeps its look; a new cell takes its column’s; a row not in the file is made in its place', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Amazon');
  ws.addRow(['Order ID', 'Status']);
  ws.addRow(['403-1000002-2000002', '']);
  ws.getCell('B2').font = { italic: true };
  ws.getCell('B2').value = 'old';
  ws.getColumn(3).font = { bold: true };
  ws.addRow(['403-1000004-2000004']);
  ws.getRow(5).getCell(1).value = '403-1000005-2000005';
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const out = writeCells(buf, 'Amazon', [
    { row: 2, col: 2, text: 'Verified' },
    { row: 2, col: 3, text: 'A note' },
    { row: 4, col: 2, text: 'Unverified' },
    { row: 3, col: 2, text: 'Unverified' },
    { row: 7, col: 3, text: 'A row that was empty' },
  ]);
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(out);
  const s = back.getWorksheet('Amazon');
  assert.equal(s.getCell('B2').value, 'Verified');
  assert.equal(s.getCell('B2').font?.italic, true, 'the old cell’s look is kept');
  assert.equal(s.getCell('C2').font?.bold, true, "a new cell takes its column's look");
  assert.equal(s.getCell('B3').value, 'Unverified');
  assert.equal(s.getCell('B4').value, 'Unverified', 'a row that was not in the file is made');
  assert.equal(s.getCell('A5').value, '403-1000005-2000005');
  assert.equal(s.getCell('C7').value, 'A row that was empty');
  const xml = entries(out).get(tabsOf(readZip(out)).find((t) => t.name === 'Amazon').part).toString('utf8');
  assert.deepEqual([...xml.matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1])), [1, 2, 3, 4, 5, 7], 'rows stay in order');
  assertCellsInOrder(xml);
  assertCellsInOrder(entries(writeCells(ORDERS, 'Amazon', writesFor(RESULTS))).get(AMAZON).toString('utf8'));
});

test('a new cell between two cells that are there goes between them, left to right', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Amazon');
  ws.addRow(['Order ID']);
  ws.getCell('A2').value = '403-1000002-2000002';
  ws.getCell('K2').value = 'a note far to the right';
  const out = writeCells(Buffer.from(await wb.xlsx.writeBuffer()), 'Amazon', [{ row: 2, col: 9, text: 'Duplicate' }, { row: 2, col: 8, text: 'Unverified' }]);
  const xml = entries(out).get(tabsOf(readZip(out)).find((t) => t.name === 'Amazon').part).toString('utf8');
  assertCellsInOrder(xml);
  assert.deepEqual([...xml.match(/<row r="2"[\s\S]*?<\/row>/)[0].matchAll(/<c r="([A-Z]+)2"/g)].map((m) => m[1]), ['A', 'H', 'I', 'K']);
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(out);
  assert.deepEqual(['A2', 'H2', 'I2', 'K2'].map((ref) => back.getWorksheet('Amazon').getCell(ref).value), ['403-1000002-2000002', 'Unverified', 'Duplicate', 'a note far to the right']);
});

test('a Note with Hindi, the rupee sign, a line break and spaces at the ends is written exactly', async () => {
  const note = '  Amount ₹851.95 matches. मज़बूत\nSecond line.  ';
  const out = writeCells(ORDERS, 'Amazon', [{ row: 3, col: J, text: note }]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out);
  assert.equal(wb.getWorksheet('Amazon').getCell(3, J).value, note);
  assert.match(entries(out).get(AMAZON).toString('utf8'), /<t xml:space="preserve">/);
});

test('a Note of several lines keeps each line on its own line: its cell gets its own look with "wrap text" on, added after the file\'s own looks', async () => {
  const note = 'Order ID in the sheet: 403-1000002-2000002\nOrder ID on the order screenshot: 403-1000002-2000002 (same)\nWhy: the order screenshot is for this order, so this row is Verified.';
  const before = entries(ORDERS);
  const out = writeCells(ORDERS, 'Amazon', [
    { row: 2, col: J, text: note, wrap: true, name: 'Note' },
    { row: 3, col: J, text: `${note}\nOne more line.`, wrap: true, name: 'Note' },
    { row: 4, col: J, text: 'One line only.', wrap: true, name: 'Note' },
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out);
  const ws = wb.getWorksheet('Amazon');
  assert.equal(ws.getCell(2, J).value, note, 'every line, as it is');
  assert.equal(ws.getCell(2, J).alignment?.wrapText, true, 'each line shows on its own line in Excel');
  assert.equal(ws.getCell(3, J).alignment?.wrapText, true);
  assert.notEqual(ws.getCell(4, J).alignment?.wrapText, true, 'a Note of one line keeps its look');
  const after = entries(out);
  const looks = (buf) => [...buf.toString('utf8').match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
  const old = looks(before.get('xl/styles.xml'));
  const now = looks(after.get('xl/styles.xml'));
  assert.deepEqual(now.slice(0, old.length), old, "the file's own looks stay as they were");
  assert.equal(now.length, old.length + 1, 'one look added, used by both Notes of several lines');
  assert.match(now.at(-1), /wrapText="1"/);
  assert.match(after.get('xl/styles.xml').toString('utf8'), new RegExp(`<cellXfs count="${now.length}"`));
  for (const [name, bytes] of before) if (name !== AMAZON && name !== 'xl/styles.xml') assert.ok(after.get(name).equals(bytes), `${name} is byte for byte the same`);
});

test('what cannot be written is a plain sentence', () => {
  assert.throws(() => writeCells(ORDERS, 'Myntra', [{ row: 2, col: H, text: 'x' }]), (err) => err instanceof WriteError && err.message === 'The uploaded Excel file has no tab named "Myntra" any more. Upload it again.');
  assert.throws(() => writeCells(Buffer.from('not a zip at all, just words'), 'Amazon', []), (err) => err instanceof WriteError && /could not be opened again/.test(err.message));
  assert.throws(() => writeCells(ORDERS, 'Amazon', [{ row: 0, col: H, text: 'x' }]), (err) => err instanceof WriteError && err.message === 'A result has no place in the sheet.');
  assert.throws(() => replaceInZip(ORDERS, new Map([['xl/nothing.xml', Buffer.from('x')]])), /no part named xl\/nothing\.xml/);
});

test('a result is never written over a formula: a plain sentence says what to do', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Amazon');
  ws.addRow(['Order ID', 'Status']);
  ws.addRow(['403-1000002-2000002', { formula: 'IF(A2="","","Pending")', result: 'Pending' }]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  assert.throws(() => writeCells(buf, 'Amazon', [{ row: 2, col: 2, text: 'Verified', name: 'Status' }]), (err) => err instanceof WriteError && err.message === 'The Status cell of row 2 holds a formula, so a result cannot be written there. In Excel, clear the formulas from the Status, Type and Note columns, save the file, upload it again, then download the checked file.');
});
