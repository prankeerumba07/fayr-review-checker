// Reading the Flipkart orders file (flipkart/workbook.js) and the links in
// its cells (flipkart/links.js): the tab rules, the heading row and every row
// under it, what each column holds (found as on Amazon, with Flipkart's order
// IDs), the rows made from it, links behind words and links in words and
// where each goes, pictures in cells, CSV files, and what cannot be read.
// Made-up files only.
// Run: node test/flipkart-workbook.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { openWorkbook, pickTab, SheetError, MAX_ROWS, FIELDS, orderIdOf, guessColumns, columnProblems, rememberedChoice, resultColumns, sheetRows } from '../flipkart/workbook.js';
import { FIELDS as AMAZON_FIELDS } from '../amazon/workbook.js';
import { cellLinks, linkLabel, linksIn } from '../flipkart/links.js';
import { MAX_SHEET_BYTES } from '../flipkart/store.js';
import { MAX_SHEET_BYTES as AMAZON_MAX_SHEET_BYTES } from '../amazon/store.js';
import { FILE, HEADER, orderId, orderShot, deliveryShot, reviewLink, reviewShot, SECOND_ORDER_SHOT, person, email } from './fixtures/flipkart/make-flipkart.mjs';
import { tinyPng } from './fixtures/flipkart/zip-tools.mjs';

const FIXTURE = readFileSync(FILE);
const NOT_TAKEN = 'This file is not an Excel file (.xlsx) or a CSV file (.csv), so save the Flipkart orders as one of those, then upload that.';
const OLD_XLS = 'This is an old Excel file (.xls) that the dashboard cannot read, so open it in Excel, save it as an Excel Workbook (.xlsx), then upload that.';
/** The columns of a Flipkart file as staff often name them. */
const USUAL = ['Reviewer Name', 'Order ID', 'Amount', 'Product Ordered', 'Order Screenshot', 'Delivery Screenshot', 'Review Screenshot', 'Review Link'];

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
/** Which column each field was found in, by the column's name: { orderId: 'Order ID', … }. */
const foundIn = (mapping, headers) => Object.fromEntries(Object.entries(mapping).filter(([, col]) => col !== null).map(([k, col]) => [k, headers.find((h) => h.col === col)?.text]));

test('the made-up file: the "Flipkart" tab, its heading row and every row under it; the other tabs are not read', async () => {
  const { kind, tab } = await openWorkbook(FIXTURE, { fileName: 'flipkart-orders.xlsx' });
  assert.deepEqual([kind, tab.name, tab.headerRow, tab.lastCol, tab.rowCount], ['xlsx', 'Flipkart', 1, 10, 5]);
  assert.deepEqual(tab.headers.map((h) => h.text), HEADER);
  assert.deepEqual(tab.rows.map((r) => r.row), [2, 3, 4, 6], 'the empty row 5 is left out; row 7 has only a picture over a cell');
  assert.deepEqual(wordsOf(tab.rows[0]), { 1: orderId(2), 2: '20-07-2026', 3: 'Test Brand Steel Bottle', 4: '349', 5: person(2), 6: 'Screenshot', 7: deliveryShot(2), 8: reviewLink(2), 9: email(2), 10: reviewShot(2) });
  assert.deepEqual([tab.rows[1].cells[2].text, tab.rows[1].cells[4].text], ['21-07-2026', '₹499'], 'a date and an amount written as words');
  assert.deepEqual([tab.rows[2].cells[4].number, tab.rows[2].cells[7].text], [349.5, 'Delivered\nLeft at the door'], 'paise, and a cell with two lines');
  assert.equal(tab.rows[0].cells[2].date, '2026-07-20', 'a real Excel date');
  assert.doesNotMatch(JSON.stringify(tab.rows), /403-TEST|Made-up notes/, 'nothing from the "Amazon" or "Notes" tab');
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
  assert.deepEqual([named.tab.name, named.tab.rows[0].cells[1].text], ['FLIP KART', orderId(2)]);
  const only = await openWorkbook(await workbook({ Sheet1: [head, [orderId(3), 'Test Box']] }), { fileName: 'b.xlsx' });
  assert.deepEqual([only.tab.name, only.tab.rows[0].cells[1].text], ['Sheet1', orderId(3)]);
  const several = await workbook({ Orders: [head, [orderId(4), 'Test Box']], Returns: [head, [orderId(5), 'Test Lid']], 'Flipkart Orders': [head, [orderId(6), 'Test Jar']] });
  assert.deepEqual(await openWorkbook(several, { fileName: 'c.xlsx' }), {
    chooseTab: { tabs: ['Orders', 'Returns', 'Flipkart Orders'], says: 'This file has no tab named "Flipkart", and it has 3 tabs: "Orders", "Returns" and "Flipkart Orders". Choose the tab with the orders.' },
  });
  const chosen = await openWorkbook(several, { fileName: 'c.xlsx', tab: 'Returns' });
  assert.deepEqual([chosen.tab.name, chosen.tab.rows[0].cells[1].text], ['Returns', orderId(5)]);
  assert.equal(await refusal(several, { fileName: 'c.xlsx', tab: 'Nope' }), 'This file has no tab named "Nope". Its tabs are "Orders", "Returns" and "Flipkart Orders".');
  assert.equal((await openWorkbook(FIXTURE, { fileName: 'f.xlsx', tab: 'Amazon' })).tab.name, 'Amazon', 'a tab chosen on the screen is the one read');
});

test('a CSV file: no tabs, its rows, commas and line breaks inside quotes, and its links in the words', async () => {
  const csv = `﻿Order ID,Reviewer Name,Review Link,Note\r\n${orderId(2)},${person(2)},${reviewLink(2)},"Late, but fine"\r\n${orderId(3)},${person(3)},,"Two\nlines"\r\n`;
  const { kind, tab } = await openWorkbook(Buffer.from(csv), { fileName: 'flipkart orders.csv' });
  assert.deepEqual([kind, tab.name, tab.headers.map((h) => h.text)], ['csv', null, ['Order ID', 'Reviewer Name', 'Review Link', 'Note']]);
  assert.deepEqual(tab.rows.map(wordsOf), [
    { 1: orderId(2), 2: person(2), 3: reviewLink(2), 4: 'Late, but fine' },
    { 1: orderId(3), 2: person(3), 4: 'Two\nlines' },
  ]);
  assert.deepEqual(cellLinks(tab.rows[0].cells[3].text, tab.rows[0].cells[3].behind).links, [reviewLink(2)]);
  const semi = await openWorkbook(Buffer.from(`Order ID;Product\n${orderId(4)};Test Jar\n`), { fileName: 'semi.csv' });
  assert.deepEqual(semi.tab.rows.map(wordsOf), [{ 1: orderId(4), 2: 'Test Jar' }], 'cells split by semicolons too');
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
  assert.deepEqual([headsOnly.tab.headers.length, headsOnly.tab.rows], [HEADER.length, []]);
  assert.deepEqual(sheetRows(headsOnly.tab, guessColumns(headsOnly.tab.headers)), { rows: [], unplaced: [] });
  const tooMany = `Order ID,Product\n${Array.from({ length: MAX_ROWS + 1 }, (_, i) => `OD${String(i).padStart(18, '0')},Test`).join('\n')}\n`;
  assert.equal(await refusal(Buffer.from(tooMany), { fileName: 'many.csv' }), `The file has more than ${MAX_ROWS} rows, so split it into smaller files, then upload each one.`);
});

test('the largest file taken is the same as for Amazon: 50 megabytes', () => {
  assert.equal(MAX_SHEET_BYTES, AMAZON_MAX_SHEET_BYTES);
  assert.equal(MAX_SHEET_BYTES, 50 * 1024 * 1024);
});

test("a Flipkart order ID is OD and its digits (usually 18), wherever it is in the cell; Amazon's order IDs and other words are not", () => {
  assert.equal(orderIdOf('OD123456789012345678'), 'OD123456789012345678');
  assert.equal(orderIdOf('Order ID: OD123456789012345678'), 'OD123456789012345678');
  assert.equal(orderIdOf('#OD123456789012345678 (2 items)'), 'OD123456789012345678');
  assert.equal(orderIdOf('od123456789012345678'), 'OD123456789012345678', 'written in small letters');
  assert.equal(orderIdOf('OD 123456789012345678'), 'OD123456789012345678', 'with a space after OD');
  assert.equal(orderIdOf('OD12345678901234567'), 'OD12345678901234567', 'one digit fewer than usual');
  for (const words of ['403-1234567-1234567', '123456789012345678', 'OD-TEST-000000000002', 'OD12345', 'GOOD123456789012345678', 'Not delivered', '']) assert.equal(orderIdOf(words), '', words);
});

test('what each column holds, found as on Amazon: the same fields, the made-up file and the usual Flipkart column names, each found by its name', async () => {
  assert.deepEqual(FIELDS, AMAZON_FIELDS, 'the same fields as Amazon');
  const { tab } = await openWorkbook(FIXTURE, { fileName: 'flipkart-orders.xlsx' });
  assert.deepEqual(foundIn(guessColumns(tab.headers, null, tab), tab.headers), { orderId: 'Order ID', orderDate: 'Order Date', amount: 'Amount', product: 'Product', orderShot: 'Order Screenshot', deliveryShot: 'Delivery Screenshot', reviewShot: 'Review Screenshot', reviewLink: 'Review Link', reviewer: 'Reviewer Name', email: 'Email ID' });
  const usual = USUAL.map((text, i) => ({ col: i + 1, text }));
  const mapping = guessColumns(usual);
  assert.deepEqual(foundIn(mapping, usual), { reviewer: 'Reviewer Name', orderId: 'Order ID', amount: 'Amount', product: 'Product Ordered', orderShot: 'Order Screenshot', deliveryShot: 'Delivery Screenshot', reviewShot: 'Review Screenshot', reviewLink: 'Review Link' });
  assert.deepEqual([mapping.orderDate, mapping.email, mapping.status, mapping.type, mapping.note], [null, null, null, null, null], 'what the file does not have');
  // Other ways of naming the order ID on Flipkart.
  for (const name of ['Flipkart Order ID', 'Flipkart ID', 'OD Number', 'Order No.', 'Order #']) assert.equal(guessColumns([{ col: 1, text: name }, { col: 2, text: 'Review Screenshot' }]).orderId, 1, name);
  for (const name of ['Order Screenshot', 'Order Date', 'Email ID']) assert.equal(guessColumns([{ col: 1, text: name }]).orderId, null, name);
});

test('a column whose cells clearly hold something else is not used, and the order ID, a review link and an email address are found by their cells when no name says so', async () => {
  const drive = (n) => `https://drive.google.com/file/d/1TestFlipkartShot${n}abcd/view`;
  const rows = [2, 3, 4].map((n) => [`Test Person ${n}`, `403-123456${n}-123456${n}`, orderId(n), `https://www.flipkart.com/test-item/p/itmtest0000000${n}?pid=TESTPID000000${n}`, drive(n), `test.person${n}@example.test`]);
  const { tab } = await openWorkbook(await workbook({ Flipkart: [['Name', 'Order ID', 'Reference', 'Link', 'Proof', 'Contact'], ...rows] }), { fileName: 'x.xlsx' });
  const mapping = guessColumns(tab.headers, null, tab);
  assert.deepEqual(foundIn(mapping, tab.headers), { reviewer: 'Name', orderId: 'Reference', reviewLink: 'Link', email: 'Contact' }, '"Order ID" holds Amazon order IDs, so the column of Flipkart order IDs is used; the Flipkart links are the review links');
  assert.deepEqual(columnProblems(mapping, tab.headers), []);
  // With no rows to look at, the names alone decide.
  assert.equal(guessColumns(tab.headers).orderId, 2);
});

test('the columns chosen before come first, a needed column missing is said plainly, and one column never holds two things', () => {
  const headers = [{ col: 1, text: 'OD' }, { col: 2, text: 'Evidence' }, { col: 3, text: 'Buyer' }, { col: 4, text: 'Status' }];
  const none = guessColumns(headers);
  assert.deepEqual(columnProblems(none, headers), ['Say which column holds the order ID.', 'Say which column holds the review link or the review screenshot.']);
  const remembered = guessColumns(headers, { orderId: 'od', reviewShot: 'EVIDENCE', reviewer: 'Buyer' });
  assert.deepEqual([remembered.orderId, remembered.reviewShot, remembered.reviewer, remembered.status], [1, 2, 3, 4], 'capitals, spaces and punctuation aside');
  assert.deepEqual(columnProblems(remembered, headers), [], 'a review screenshot alone is enough: many Flipkart rows have no review link');
  assert.deepEqual(rememberedChoice(remembered, headers), { orderId: 'OD', reviewShot: 'Evidence', reviewer: 'Buyer', status: 'Status' });
  assert.deepEqual(columnProblems({ ...remembered, reviewLink: 2 }, headers), ['One column cannot hold two things: Review screenshot and Review link.']);
  assert.deepEqual(columnProblems({ ...remembered, email: 9 }, headers), ['The column chosen for Email address is not in this tab.']);
  assert.deepEqual(resultColumns(remembered, 4), { status: 4, type: 5, note: 6, added: [{ col: 5, header: 'Type' }, { col: 6, header: 'Note' }] }, 'a Type and a Note column after the last one');
});

test('the rows of the made-up file: numbered from 1, with their order ID, date, amount, product, picture and link cells, and the other columns kept to be shown', async () => {
  const { tab } = await openWorkbook(FIXTURE, { fileName: 'flipkart-orders.xlsx' });
  const { rows, unplaced } = sheetRows(tab, guessColumns(tab.headers, null, tab));
  assert.deepEqual(rows.map((r) => [r.n, r.row]), [[1, 2], [2, 3], [3, 4], [4, 6], [5, 7]], 'numbered from 1; the empty row 5 is no row; row 7 has only a picture');
  assert.deepEqual(unplaced, []);
  const [one, two, three, four, five] = rows;
  assert.deepEqual([one.orderId, one.orderDate, one.amount, one.product], [{ text: orderId(2), value: orderId(2) }, { text: '20-07-2026', value: '2026-07-20' }, { text: '349', value: 349 }, { text: 'Test Brand Steel Bottle' }]);
  assert.deepEqual([two.orderDate.value, two.amount.value, three.amount.value], ['2026-07-21', 499, 349.5], 'a date and an amount written as words, and paise');
  assert.deepEqual(one.shots.order, { text: 'Screenshot', link: orderShot(2), links: [orderShot(2)], mismatch: null, picture: null }, 'a link behind words');
  assert.deepEqual(one.shots.reviewShot.links, [reviewShot(2)]);
  assert.deepEqual(one.values, { 5: { text: person(2), behind: '' }, 9: { text: email(2), behind: '' } }, "the reviewer's name and the email address are only shown");
  assert.deepEqual([two.shots.order.picture.how, two.shots.delivery.picture.how, two.shots.reviewShot.picture.how], ['cell', 'floating', 'cell'], 'pictures in cells and over a cell');
  assert.equal(two.shots.order.picture.type, 'image/png');
  assert.deepEqual(three.shots.order.links, [orderShot(4), SECOND_ORDER_SHOT], 'two links in one cell');
  assert.deepEqual([three.shots.review.text, three.shots.review.links], ['Open review', [reviewLink(4)]], 'a link put behind words by a HYPERLINK formula');
  assert.deepEqual([four.shots.review.links, four.shots.reviewShot.links], [[], [reviewShot(6)]], 'a review screenshot and no review link');
  assert.deepEqual([five.orderId.text, five.shots.order.picture.how], ['', 'floating']);
  assert.ok(rows.every((r) => r.prev === null), 'the file has no Status, Type or Note');
});

test("a file's own Status, Type and Note are kept with each row, and a picture outside the picture columns is said plainly", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Flipkart');
  ws.addRow(['Order ID', 'Review Screenshot', 'Reviewer Name', 'Status', 'Type', 'Note']);
  ws.addRow([orderId(2), 'https://drive.google.com/open?id=1TestFlipkartReview02abcd', person(2), 'Pass', 'Verified', 'Checked by hand']);
  ws.addRow([orderId(3), 'https://drive.google.com/open?id=1TestFlipkartReview03abcd', person(3)]);
  const pic = wb.addImage({ buffer: tinyPng(), extension: 'png' });
  ws.addImage(pic, { tl: { col: 2.1, row: 2.1 }, ext: { width: 20, height: 20 } });
  ws.addImage(pic, { tl: { col: 1.1, row: 4.1 }, ext: { width: 20, height: 20 } });
  const { tab } = await openWorkbook(Buffer.from(await wb.xlsx.writeBuffer()), { fileName: 'p.xlsx' });
  const mapping = guessColumns(tab.headers, null, tab);
  assert.deepEqual([mapping.status, mapping.type, mapping.note], [4, 5, 6]);
  const { rows, unplaced } = sheetRows(tab, mapping);
  assert.deepEqual(rows.map((r) => r.prev), [{ status: 'Pass', type: 'Verified', note: 'Checked by hand' }, null, null]);
  assert.deepEqual(unplaced, ['A picture over the "Reviewer Name" column, in Row 2, is not in the Review screenshot column, so it was not used.']);
  assert.equal(rows.length, 3, 'the picture in a row of its own, over the review screenshot column, is a row');
  assert.equal(rows[2].shots.reviewShot.picture.how, 'floating');
});

test('a picture above the column names (a logo) makes no column; a picture beside the named columns gets a column of its own', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Flipkart');
  ws.addRow(['Made-up Flipkart orders']);
  ws.addRow(['Order ID', 'Product']);
  ws.addRow([orderId(2), 'Test Bottle']);
  const pic = wb.addImage({ buffer: tinyPng(), extension: 'png' });
  ws.addImage(pic, { tl: { col: 2.1, row: 0.1 }, ext: { width: 20, height: 20 } });
  ws.addImage(pic, { tl: { col: 3.1, row: 2.1 }, ext: { width: 20, height: 20 } });
  const { tab } = await openWorkbook(Buffer.from(await wb.xlsx.writeBuffer()), { fileName: 'p.xlsx' });
  assert.equal(tab.headerRow, 2, 'the first row with two filled cells holds the column names');
  assert.deepEqual(tab.headers.map((h) => h.text), ['Order ID', 'Product', 'Column D'], 'a column with no name is named by its letter');
  assert.deepEqual(tab.pictures.filter((p) => p.row > tab.headerRow).map((p) => [p.row, p.col, p.how]), [[3, 4, 'floating']]);
});

test('links behind words and links written in words, as on Amazon, and where each goes in a few words', () => {
  assert.deepEqual(cellLinks('Screenshot', orderShot(2)), { text: 'Screenshot', link: orderShot(2), links: [orderShot(2)], mismatch: null });
  assert.deepEqual(cellLinks(deliveryShot(2), deliveryShot(2)).links, [deliveryShot(2)], 'a link behind the same link counts once');
  assert.deepEqual(cellLinks(`See the screenshot: ${orderShot(6)} (sent late)`, '').links, [orderShot(6)], 'a link inside a sentence');
  assert.deepEqual(cellLinks('Two links', 'https://example.test/one,%20https://example.test/two').links, ['https://example.test/one', 'https://example.test/two'], 'two links behind words, as Excel keeps them');
  assert.deepEqual(cellLinks(orderShot(2), deliveryShot(2)).mismatch, { text: orderShot(2), link: deliveryShot(2) }, 'the written link is not the one that opens');
  assert.deepEqual(cellLinks('Open', 'javascript:alert(1)').links, [], 'a link behind words that is not a web link is left out');
  assert.deepEqual(linksIn('drive.google.com/file/d/1TestFlipkartShot02abcd/view and flipkart.com/test-item/p/itmtest000000002?pid=TESTPID0000002'), ['https://drive.google.com/file/d/1TestFlipkartShot02abcd/view', 'https://flipkart.com/test-item/p/itmtest000000002?pid=TESTPID0000002'], 'a known website without https://');
  for (const words of ['screenshot.png', 'test.person2@example.test', 'javascript:alert(1)', `Order ID ${orderId(2)}`]) assert.deepEqual(linksIn(words), [], words);
  const said = {
    [orderShot(2)]: 'Google Drive',
    'https://docs.google.com/document/d/1TestFlipkartDoc02abcd/edit': 'Google Drive',
    'https://www.tryboxs.in/shots/test-02.png': 'tryboxs',
    'https://storage.googleapis.com/test-bucket/test-02.png': 'storage.googleapis.com',
    [reviewLink(2)]: "Flipkart product's reviews",
    'https://www.flipkart.com/reviews/TESTPID0000002:3?reviewId=0a1b2c3d-0000-4000-8000-000000000002': 'Flipkart review',
    'https://www.flipkart.com/test-brand-steel-bottle/p/itmtest000000002?pid=TESTPID0000002': 'Flipkart product page',
    'https://fkrt.it/TestShort02': 'Flipkart short link',
    'https://dl.flipkart.com/s/TestShare02': 'Flipkart short link',
    'https://www.flipkart.com/account/orders': 'Flipkart page',
    'https://play.google.com/store/apps/details?id=com.flipkart.android': 'App store',
    'https://www.example.test/a': 'example.test',
    'not a link': 'Link',
  };
  for (const [link, words] of Object.entries(said)) assert.equal(linkLabel(link), words, link);
});
