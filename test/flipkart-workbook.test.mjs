// Reading the Flipkart orders file (flipkart/workbook.js) and the links in
// its cells (flipkart/links.js): the tab rules, the heading row and every row
// under it as they are, links behind words and links in words, pictures in
// cells, CSV files, and what cannot be read. Made-up files only.
// Run: node test/flipkart-workbook.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { openWorkbook, pickTab, SheetError, MAX_ROWS } from '../flipkart/workbook.js';
import { cellParts } from '../flipkart/links.js';
import { MAX_SHEET_BYTES } from '../flipkart/store.js';
import { MAX_SHEET_BYTES as AMAZON_MAX_SHEET_BYTES } from '../amazon/store.js';
import { FILE, HEADER, FILLED_ROWS, orderId, orderShot, deliveryShot, reviewLink, SECOND_ORDER_SHOT, person, email } from './fixtures/flipkart/make-flipkart.mjs';
import { tinyPng } from './fixtures/flipkart/zip-tools.mjs';

const FIXTURE = readFileSync(FILE);
const NOT_TAKEN = 'This file is not an Excel file (.xlsx) or a CSV file (.csv), so save the Flipkart orders as one of those, then upload that.';
const OLD_XLS = 'This is an old Excel file (.xls) that the dashboard cannot read, so open it in Excel, save it as an Excel Workbook (.xlsx), then upload that.';

/** A made-up Excel file: { tab name: [row, ...] }, each row a list of cells. */
async function workbook(tabs) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(tabs)) {
    const ws = wb.addWorksheet(name);
    for (const r of rows) ws.addRow(r);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function refusal(buf, opts) {
  try {
    await openWorkbook(buf, opts);
  } catch (err) {
    if (err instanceof SheetError) return err.message;
    throw err;
  }
  return null;
}

/** A row's words by column, as read. */
const wordsOf = (row) => Object.fromEntries(Object.entries(row.cells).map(([c, v]) => [c, v.text]));

test('the made-up file: the "Flipkart" tab, its heading row and every row under it as they are; the other tabs are not read', async () => {
  const book = await openWorkbook(FIXTURE, { fileName: 'flipkart-orders.xlsx' });
  assert.deepEqual([book.kind, book.tab, book.headerRow], ['xlsx', 'Flipkart', 1]);
  assert.deepEqual(book.headers.map((h) => h.text), HEADER);
  assert.deepEqual(book.rows.map((r) => r.row), FILLED_ROWS, 'the empty row 5 is left out; row 7, with only a picture, is kept');
  assert.deepEqual(wordsOf(book.rows[0]), { 1: orderId(2), 2: '20-07-2026', 3: 'Test Brand Steel Bottle', 4: '349', 5: person(2), 6: 'Screenshot', 7: deliveryShot(2), 8: reviewLink(2), 9: email(2) });
  assert.deepEqual([book.rows[1].cells[2].text, book.rows[1].cells[4].text], ['21-07-2026', '₹499'], 'a date and an amount written as words stay as they are');
  assert.deepEqual([book.rows[2].cells[4].text, book.rows[2].cells[7].text], ['349.5', 'Delivered\nLeft at the door'], 'paise, and a cell with two lines');
  assert.deepEqual(Object.keys(book.rows[3].cells), ['1', '2', '3', '4', '5', '6', '7'], 'empty cells stay empty');
  assert.doesNotMatch(JSON.stringify(book), /403-TEST|Made-up notes/, 'nothing from the "Amazon" or "Notes" tab');
});

test('the tab rules: "Flipkart" with any capitals or spaces, else the only tab, else the tabs are named to choose one', async () => {
  assert.equal(pickTab(['Amazon', 'Flipkart', 'Notes']), 'Flipkart');
  assert.equal(pickTab(['Orders', 'FLIP KART']), 'FLIP KART');
  assert.equal(pickTab(['Orders', 'flipkart']), 'flipkart');
  assert.equal(pickTab(['Sheet1']), 'Sheet1');
  assert.equal(pickTab(['Orders', 'Returns']), null);
  assert.equal(pickTab(['Flipkart Orders', 'Amazon']), null, 'a name with other words in it is not "Flipkart"');
  const head = ['Order ID', 'Product'];
  const named = await openWorkbook(await workbook({ Amazon: [head, ['403-TEST-0000001', 'Test Mop']], 'FLIP KART': [head, [orderId(2), 'Test Bottle']] }), { fileName: 'a.xlsx' });
  assert.deepEqual([named.tab, named.rows[0].cells[1].text], ['FLIP KART', orderId(2)]);
  const only = await openWorkbook(await workbook({ Sheet1: [head, [orderId(3), 'Test Box']] }), { fileName: 'b.xlsx' });
  assert.deepEqual([only.tab, only.rows[0].cells[1].text], ['Sheet1', orderId(3)]);
  const several = await workbook({ Orders: [head, [orderId(4), 'Test Box']], Returns: [head, [orderId(5), 'Test Lid']], 'Flipkart Orders': [head, [orderId(6), 'Test Jar']] });
  assert.deepEqual(await openWorkbook(several, { fileName: 'c.xlsx' }), {
    chooseTab: { tabs: ['Orders', 'Returns', 'Flipkart Orders'], says: 'This file has no tab named "Flipkart", and it has 3 tabs: "Orders", "Returns" and "Flipkart Orders". Choose the tab with the orders.' },
  });
  const chosen = await openWorkbook(several, { fileName: 'c.xlsx', tab: 'Returns' });
  assert.deepEqual([chosen.tab, chosen.rows[0].cells[1].text], ['Returns', orderId(5)]);
  assert.equal(await refusal(several, { fileName: 'c.xlsx', tab: 'Nope' }), 'This file has no tab named "Nope". Its tabs are "Orders", "Returns" and "Flipkart Orders".');
  assert.equal((await openWorkbook(FIXTURE, { fileName: 'f.xlsx', tab: 'Amazon' })).tab, 'Amazon', 'a tab chosen on the screen is the one read');
});

test('a CSV file: no tabs, its rows as they are, commas and line breaks inside quotes, and its links in the words', async () => {
  const csv = `﻿Order ID,Reviewer Name,Review Link,Note\r\n${orderId(2)},${person(2)},${reviewLink(2)},"Late, but fine"\r\n${orderId(3)},${person(3)},,"Two\nlines"\r\n`;
  const book = await openWorkbook(Buffer.from(csv), { fileName: 'flipkart orders.csv' });
  assert.deepEqual([book.kind, book.tab, book.headers.map((h) => h.text)], ['csv', null, ['Order ID', 'Reviewer Name', 'Review Link', 'Note']]);
  assert.deepEqual(book.rows.map(wordsOf), [
    { 1: orderId(2), 2: person(2), 3: reviewLink(2), 4: 'Late, but fine' },
    { 1: orderId(3), 2: person(3), 4: 'Two\nlines' },
  ]);
  assert.deepEqual(cellParts(book.rows[0].cells[3].text, book.rows[0].cells[3].behind), [{ link: reviewLink(2) }]);
  const semi = await openWorkbook(Buffer.from(`Order ID;Product\n${orderId(4)};Test Jar\n`), { fileName: 'semi.csv' });
  assert.deepEqual(semi.rows.map(wordsOf), [{ 1: orderId(4), 2: 'Test Jar' }], 'cells split by semicolons too');
});

test('an empty file, an empty tab, and a file that is not .xlsx or .csv are refused in plain words; column names with no rows under them are not', async () => {
  assert.equal(await refusal(Buffer.alloc(0), { fileName: 'flipkart.xlsx' }), 'The file is empty.');
  assert.equal(await refusal(Buffer.from('just one word\n'), { fileName: 'flipkart.csv' }), 'The file is empty: no row has at least two filled cells to use as column names.');
  assert.equal(await refusal(await workbook({ Flipkart: [], Other: [['a', 'b']] }), { fileName: 'e.xlsx' }), 'The "Flipkart" tab is empty: no row has at least two filled cells to use as column names.');
  for (const name of ['flipkart.xlsm', 'flipkart.pdf', 'flipkart.ods', 'flipkart.txt']) assert.equal(await refusal(FIXTURE, { fileName: name }), NOT_TAKEN, name);
  assert.equal(await refusal(Buffer.from('Order ID,Product\nOD-1,Test\n'), { fileName: 'flipkart.xlsx' }), NOT_TAKEN, 'words named .xlsx are not an Excel file');
  const oldExcel = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504)]);
  assert.equal(await refusal(oldExcel, { fileName: 'flipkart.xls' }), OLD_XLS);
  assert.equal(await refusal(oldExcel, { fileName: 'flipkart.xlsx' }), OLD_XLS, 'an old Excel file with a new name');
  const headsOnly = await openWorkbook(await workbook({ Flipkart: [HEADER] }), { fileName: 'h.xlsx' });
  assert.deepEqual([headsOnly.headers.length, headsOnly.rows], [HEADER.length, []]);
  const tooMany = `Order ID,Product\n${Array.from({ length: MAX_ROWS + 1 }, (_, i) => `OD-TEST-${i},Test`).join('\n')}\n`;
  assert.equal(await refusal(Buffer.from(tooMany), { fileName: 'many.csv' }), `The file has more than ${MAX_ROWS} rows, so split it into smaller files, then upload each one.`);
});

test('the largest file taken is the same as for Amazon: 50 megabytes', () => {
  assert.equal(MAX_SHEET_BYTES, AMAZON_MAX_SHEET_BYTES);
  assert.equal(MAX_SHEET_BYTES, 50 * 1024 * 1024);
});

test('links behind words and links written in words are kept, each shown as a link; nothing else is a link', async () => {
  const book = await openWorkbook(FIXTURE, { fileName: 'flipkart-orders.xlsx' });
  const parts = (row, col) => {
    const c = book.rows.find((r) => r.row === row).cells[col];
    return cellParts(c.text, c.behind);
  };
  assert.equal(book.rows[0].cells[6].behind, orderShot(2), 'the link behind "Screenshot" is kept');
  assert.deepEqual(parts(2, 6), [{ text: 'Screenshot' }, { text: ' ' }, { link: orderShot(2) }]);
  assert.deepEqual(parts(2, 7), [{ link: deliveryShot(2) }], 'a link behind the same link shows once');
  assert.deepEqual(parts(3, 8), [{ link: reviewLink(3) }], 'a link written in a cell, with nothing behind it');
  assert.deepEqual(parts(4, 6), [{ link: orderShot(4) }, { text: ', ' }, { link: SECOND_ORDER_SHOT }], 'two links in one cell');
  assert.deepEqual(parts(4, 8), [{ text: 'Open review' }, { text: ' ' }, { link: reviewLink(4) }], 'a link put behind words by a HYPERLINK formula');
  assert.deepEqual(parts(6, 6), [{ text: 'See the screenshot: ' }, { link: orderShot(6) }, { text: ' (sent late)' }], 'a link inside a sentence');
  for (const words of ['Rs.349/-', '1.5L/2L', 'test.person2@example.test', 'javascript:alert(1)', 'OD-TEST-000000000002', 'Delivered\nLeft at the door']) {
    assert.deepEqual(cellParts(words, ''), [{ text: words }], words);
  }
  assert.deepEqual(cellParts('www.flipkart.com/test-item', ''), [{ link: 'https://www.flipkart.com/test-item' }], 'a link starting with www.');
  assert.deepEqual(cellParts('https://example.test/a.', ''), [{ link: 'https://example.test/a' }, { text: '.' }], 'the full stop after a link stays words');
  assert.deepEqual(cellParts('Open', 'javascript:alert(1)'), [{ text: 'Open' }], 'a link behind words that is not a web link is left out');
  assert.deepEqual(cellParts('http://www.example.test/a', 'https://example.test/a/'), [{ link: 'http://www.example.test/a' }], 'the same page, written two ways, shows once');
  assert.deepEqual(cellParts('Two links', 'https://example.test/one,%20https://example.test/two'), [{ text: 'Two links' }, { text: ' ' }, { link: 'https://example.test/one' }, { text: ' ' }, { link: 'https://example.test/two' }], 'two links behind words, as Excel keeps them');
});

test('a picture placed inside a cell, a picture over a cell, and a row with only a picture are each "a picture in this cell"', async () => {
  const book = await openWorkbook(FIXTURE, { fileName: 'flipkart-orders.xlsx' });
  const at = (row, col) => book.rows.find((r) => r.row === row)?.cells[col];
  assert.deepEqual(at(3, 6), { text: '', behind: '', picture: true }, 'placed inside the cell');
  assert.deepEqual(at(3, 7), { text: '', behind: '', picture: true }, 'over the cell');
  assert.deepEqual(book.rows.at(-1), { row: 7, cells: { 6: { text: '', behind: '', picture: true } } }, 'a row with only a picture');
  assert.equal(book.rows.flatMap((r) => Object.values(r.cells)).filter((c) => c.picture).length, 3);
  // A title above the column names; a logo above them is no row and makes no column; a picture beside the named columns gets a column of its own.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Flipkart');
  ws.addRow(['Made-up Flipkart orders']);
  ws.addRow(['Order ID', 'Product']);
  ws.addRow([orderId(2), 'Test Bottle']);
  const pic = wb.addImage({ buffer: tinyPng(), extension: 'png' });
  ws.addImage(pic, { tl: { col: 2.1, row: 0.1 }, ext: { width: 20, height: 20 } });
  ws.addImage(pic, { tl: { col: 3.1, row: 2.1 }, ext: { width: 20, height: 20 } });
  const beside = await openWorkbook(Buffer.from(await wb.xlsx.writeBuffer()), { fileName: 'p.xlsx' });
  assert.equal(beside.headerRow, 2, 'the first row with two filled cells holds the column names');
  assert.deepEqual(beside.headers.map((h) => h.text), ['Order ID', 'Product', 'Column D'], 'a column with no name is named by its letter');
  assert.deepEqual(beside.rows, [{ row: 3, cells: { 1: { text: orderId(2), behind: '' }, 2: { text: 'Test Bottle', behind: '' }, 4: { text: '', behind: '', picture: true } } }]);
});
