// Writes flipkart-orders.xlsx: a made-up Flipkart orders file, with made-up
// names, order IDs and links only. Three tabs ("Amazon", "Flipkart" and
// "Notes"); only "Flipkart" is read. Row 1 holds the column names. A real
// date and a date written as words, amounts as numbers and as words, links
// behind their words (one put there by a HYPERLINK formula), links written in
// the words, two links in one cell, a cell with two lines, an empty row, a
// picture placed inside a cell, a picture over a cell, and a row with only a
// picture in it.
// Run: node test/fixtures/flipkart/make-flipkart.mjs

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { readZip } from '../../../flipkart/zip.js';
import { tabsOf } from '../../../flipkart/ooxml.js';
import { placeInCells, tinyPng } from './zip-tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const pad = (n) => String(n).padStart(2, '0');

export const FILE = join(HERE, 'flipkart-orders.xlsx');
export const TABS = ['Amazon', 'Flipkart', 'Notes'];
export const HEADER = ['Order ID', 'Order Date', 'Product', 'Amount', 'Reviewer Name', 'Order Screenshot', 'Delivery Screenshot', 'Review Link', 'Email ID'];

export const orderId = (row) => `OD-TEST-${String(row).padStart(12, '0')}`;
export const drive = (id) => `https://drive.google.com/open?id=${id}`;
export const orderShot = (row) => drive(`1TestFlipkartOrder${pad(row)}abcd`);
export const deliveryShot = (row) => drive(`1TestFlipkartDelivery${pad(row)}ab`);
export const reviewLink = (row) => `https://www.flipkart.com/test-brand-steel-bottle/product-reviews/itmTEST0000000${pad(row)}?pid=TESTPID00000${pad(row)}`;
export const SECOND_ORDER_SHOT = drive('1TestFlipkartOrder04second');
export const person = (row) => `Test Person ${['', '', 'Two', 'Three', 'Four', 'Five', 'Six'][row]}`;
export const email = (row) => `test.person${row}@example.test`;
/** The rows of the "Flipkart" tab that have something in them (row 5 is empty; row 7 has only a picture). */
export const FILLED_ROWS = [2, 3, 4, 6, 7];

const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

export async function makeFlipkart() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Test';

  const amazon = wb.addWorksheet('Amazon');
  amazon.addRow(['Order ID', 'Product', 'Amount']);
  amazon.addRow(['403-TEST-0000001', 'Test Brand Mop', 299]);

  const ws = wb.addWorksheet('Flipkart');
  ws.addRow(HEADER);
  ws.getRow(1).font = { bold: true };
  [22, 13, 26, 10, 18, 40, 40, 60, 26].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const rows = {
    2: [orderId(2), day(2026, 7, 20), 'Test Brand Steel Bottle', 349, person(2), { text: 'Screenshot', hyperlink: orderShot(2) }, { text: deliveryShot(2), hyperlink: deliveryShot(2) }, { text: reviewLink(2), hyperlink: reviewLink(2) }, email(2)],
    3: [orderId(3), '21-07-2026', 'Test Brand Lunch Box', '₹499', person(3), 'IN CELL', null, reviewLink(3), email(3)],
    4: [orderId(4), day(2026, 7, 22), 'Test Brand Steel Bottle', 349.5, person(4), `${orderShot(4)}, ${SECOND_ORDER_SHOT}`, 'Delivered\nLeft at the door', { formula: `HYPERLINK("${reviewLink(4)}","Open review")`, result: 'Open review' }, email(4)],
    6: [orderId(6), day(2026, 7, 23), 'Test Brand Lunch Box', 499, person(6), `See the screenshot: ${orderShot(6)} (sent late)`, 'Not delivered yet', null, null],
  };
  for (const [n, values] of Object.entries(rows)) {
    const row = ws.getRow(Number(n));
    values.forEach((v, i) => {
      if (v !== null) row.getCell(i + 1).value = v;
    });
  }
  for (const n of [2, 4, 6]) ws.getCell(`B${n}`).numFmt = 'dd-mm-yyyy';
  ws.getCell('G4').alignment = { wrapText: true };
  // A picture over the delivery cell of row 3, and one over the order cell of row 7 (a row with nothing else in it).
  const over = wb.addImage({ buffer: tinyPng([52, 107, 55]), extension: 'png' });
  ws.addImage(over, { tl: { col: 6.1, row: 2.1 }, ext: { width: 40, height: 40 } });
  ws.addImage(over, { tl: { col: 5.1, row: 6.1 }, ext: { width: 40, height: 40 } });

  const notes = wb.addWorksheet('Notes');
  notes.getCell('A1').value = 'Made-up notes: this tab is not read.';

  const plain = Buffer.from(await wb.xlsx.writeBuffer());
  // A picture placed inside the order cell of row 3, as Excel's "Place in Cell" stores it.
  const part = tabsOf(readZip(plain)).find((t) => t.name === 'Flipkart').part;
  return placeInCells(plain, [{ ref: 'F3', media: 'flipkart-in-cell.png' }], [['flipkart-in-cell.png', tinyPng([166, 58, 43])]], part);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(FILE, await makeFlipkart());
  console.log('written');
}
