// Reading the orders sheet: only the tab named "Amazon" (or the only tab),
// which column holds what, the words and the link behind them in each cell,
// dates, amounts, order IDs, pictures in cells, CSV files, and a plain
// sentence for anything that cannot be read. The made-up orders file only;
// never a real one.
// Run: node test/workbook.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { openWorkbook, guessColumns, columnProblems, rememberedChoice, resultColumns, sheetRows, dateFromWords, amountOf, orderIdOf, cellValue, formulaLink, SheetError, FIELDS, MAX_ROWS, EMAIL_SHAPE, pickTab } from '../amazon/workbook.js';
import { readZip, replaceInZip } from '../amazon/zip.js';
import { reviewLinkKind, linkKey } from '../amazon/links.js';
import { placeInCells, writeZip } from './fixtures/sheets/zip-tools.mjs';
import { FILE, HEADER, PRODUCTS, ROWS, MISMATCHES, SHARED_ORDER_ID, SHARED_DELIVERY, SHARED_REVIEW, orderId } from './fixtures/sheets/make-orders.mjs';
import { newLayoutBook, NEW_FILE_NAME, NEW_TAB, NEW_HEADER, NEW_ROWS, newOrderId } from './fixtures/sheets/new-layout.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PNG = readFileSync(join(HERE, 'fixtures', 'amazon', 'screenshot-review.png'));
const DELIVERY_PNG = readFileSync(join(HERE, 'fixtures', 'amazon', 'delivery-clear.png'));
const ORDERS = readFileSync(FILE);

async function workbook(tabs) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(tabs)) {
    const ws = wb.addWorksheet(name);
    for (const r of rows) ws.addRow(r);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const refusal = async (buf, opts) => {
  try {
    await openWorkbook(buf, opts);
  } catch (err) {
    assert.ok(err instanceof SheetError, err.message);
    return err.message;
  }
  assert.fail('it was read');
};

async function orders() {
  const book = await openWorkbook(ORDERS, { fileName: 'orders.xlsx' });
  const tab = book.tab;
  const mapping = guessColumns(tab.headers);
  const { rows, unplaced } = sheetRows(tab, mapping);
  return { book, tab, mapping, rows, unplaced, row: (n) => rows.find((r) => r.row === n) };
}

test('what a column can hold: only the order ID is needed, and one of the two review columns; every other one can be missing', () => {
  assert.deepEqual(FIELDS.map((f) => [f.label, f.required, Boolean(f.review)]), [
    ['Order ID', true, false],
    ['Order date', false, false],
    ['Amount', false, false],
    ['Product ordered', false, false],
    ['Purchase screenshot', false, false],
    ['Delivery screenshot', false, false],
    ['Review screenshot', false, true],
    ['Review link', false, true],
    ['Reviewer name', false, false],
    ['Email address', false, false],
    ['Status', false, false],
    ['Type', false, false],
    ['Note', false, false],
  ]);
});

test('the made-up orders file: only the tab named "Amazon" is read; the other tabs are never read', async () => {
  const { book, tab, mapping, rows, unplaced } = await orders();
  assert.equal(book.kind, 'xlsx');
  assert.equal(tab.name, 'Amazon');
  assert.deepEqual(Object.keys(book), ['kind', 'fileName', 'tab'], 'no list of the other tabs');
  assert.doesNotMatch(JSON.stringify(book), /Instamart|Flipkart|IM-TEST|OD-TEST/, 'nothing from the other tabs');
  assert.equal(tab.headerRow, 1, 'row 1 holds the column names');
  assert.deepEqual(tab.headers.map((h) => h.text), HEADER);
  assert.deepEqual(mapping, { orderId: 1, orderDate: 2, amount: 3, product: 4, orderShot: 5, deliveryShot: 6, reviewShot: null, reviewLink: 7, reviewer: null, email: null, status: 8, type: 9, note: null }, 'every column guessed from the heading row; there is no Note column');
  assert.deepEqual(guessColumns(tab.headers, null, tab), mapping, 'looking at the cells too finds the same columns');
  assert.deepEqual(columnProblems(mapping, tab.headers), []);
  assert.deepEqual(rows.map((r) => r.row), Object.keys(ROWS).map(Number), "each row keeps its row in the file, where its results are written; the empty row 29 is left out");
  // On the dashboard, the transactions are numbered from 1 in the sheet's order: the heading row and the empty row never count.
  assert.deepEqual(rows.map((r) => r.n), rows.map((_, i) => i + 1));
  assert.equal(rows[0].row, 2);
  assert.equal(rows[0].n, 1, 'the first row under the heading row is Row 1');
  const after = rows.find((r) => r.row > 29);
  assert.ok(after, 'the made-up file has a row after its empty row');
  assert.equal(after.n, after.row - 2, 'a row after the empty row: the empty row is not counted');
  assert.deepEqual(unplaced, []);
  assert.equal(tab.rowCount, 30);
});

test('dates: real Excel dates, and dates written with the day first', async () => {
  const { row } = await orders();
  assert.deepEqual(row(2).orderDate, { text: '20-07-2026', value: '2026-07-20' }, 'a real Excel date');
  assert.deepEqual(row(3).orderDate, { text: '14/07/2026', value: '2026-07-14' });
  assert.deepEqual(row(4).orderDate, { text: '20-07-2026', value: '2026-07-20' });
  assert.deepEqual(row(5).orderDate, { text: '20.07.2026', value: '2026-07-20' });
  for (const [words, day] of [
    ['20-07-2026', '2026-07-20'],
    ['14/07/2026', '2026-07-14'],
    ['20.07.2026', '2026-07-20'],
    ['5-7-26', '2026-07-05'],
    ['2026-07-20', '2026-07-20'],
    ['20-Jul-2026', '2026-07-20'],
    ['20 July 2026', '2026-07-20'],
    ['July 20, 2026', '2026-07-20'],
    ['07/20/2026', '2026-07-20'],
    ['20-07-2026 14:35', '2026-07-20'],
  ]) {
    assert.equal(dateFromWords(words), day, words);
  }
  for (const words of ['31-02-2026', 'yesterday', '', '2026', 'Juliet 20 2026']) assert.equal(dateFromWords(words), null, words);
});

test('amounts: numbers, paise, and amounts written as words; order IDs as Amazon writes them', async () => {
  const { row } = await orders();
  assert.deepEqual(row(2).amount, { text: '654', value: 654 });
  assert.deepEqual(row(3).amount, { text: '851.95', value: 851.95 });
  assert.deepEqual(row(4).amount, { text: '₹499', value: 499 });
  assert.deepEqual(row(5).amount, { text: '654.00', value: 654 });
  for (const [words, value] of [['₹ 1,299.50', 1299.5], ['Rs. 654', 654], ['INR 654/-', 654], ['1,29,999', 129999]]) assert.equal(amountOf({ text: words }), value, words);
  for (const words of ['six hundred', '', '654.555', '-']) assert.equal(amountOf({ text: words }), null, words);
  assert.equal(orderIdOf('403 1000002 2000002'), '403-1000002-2000002');
  assert.equal(orderIdOf('403–1000002–2000002'), '403-1000002-2000002');
  assert.equal(orderIdOf('#403-1000002-2000002'), '403-1000002-2000002', 'wherever it is in the cell');
  assert.equal(orderIdOf('Order ID: 403 1000002 2000002.'), '403-1000002-2000002');
  assert.equal(orderIdOf('NA'), '', 'words are not an order ID');
  assert.equal(orderIdOf('4031000002200000299'), '', 'too many digits');
  const { rows } = await orders();
  assert.deepEqual(row(2).orderId, { text: orderId(2), value: orderId(2) });
  assert.deepEqual(row(32).orderId, { text: '', value: '' }, 'an empty order ID stays empty');
  assert.deepEqual([...new Set(rows.map((r) => r.product.text))].sort(), [...PRODUCTS].sort());
});

test('each cell keeps its words and the link behind them; words that are another link make a mismatch', async () => {
  const { rows, row } = await orders();
  assert.deepEqual(row(2).shots.order, { text: ROWS[2].order.text, link: ROWS[2].order.link, links: [ROWS[2].order.link], mismatch: null, picture: null });
  const mismatched = rows.filter((r) => Object.values(r.shots).some((s) => s.mismatch)).map((r) => r.row);
  assert.deepEqual(mismatched, [24, 26], 'only the two rows whose words say another link');
  for (const [n, [which, words, behind]] of Object.entries(MISMATCHES)) {
    assert.deepEqual(row(Number(n)).shots[which].mismatch, { text: words, link: behind }, `row ${n}`);
    assert.equal(row(Number(n)).shots[which].link, behind, 'the link behind the words is the one used');
  }
  assert.deepEqual(row(30).shots.order.links, ['https://drive.google.com/open?id=1TestOrderRow30abcdefgh', 'https://drive.google.com/open?id=1TestOrderRow30second00'], 'two links in one cell, both kept');
  assert.equal(row(30).shots.order.mismatch, null);
  assert.deepEqual(row(31).shots.order.links, [ROWS[31].order.link], 'words that are not a link: the link behind them');
  assert.deepEqual(row(27).shots.delivery.links, [ROWS[27].delivery], 'a link with nothing behind it is still a link');
  for (const [n, words] of [[15, 'Cancelled'], [16, 'Lost in transit'], [17, '0']]) assert.deepEqual(row(n).shots.delivery, { text: words, link: '', links: [], mismatch: null, picture: null }, `words in row ${n}`);
  assert.deepEqual(row(14).shots.review, { text: '', link: '', links: [], mismatch: null, picture: null }, 'an empty cell');
  assert.deepEqual(row(28).shots.order.links, []);
  assert.equal(row(2).prev, null, 'Status and Type are empty in this file');
});

test('every kind of review link is in the made-up file, and the shared order IDs and links are there too', async () => {
  const { rows, row } = await orders();
  const kinds = new Set();
  for (const r of rows) {
    const k = r.shots.review.link ? reviewLinkKind(r.shots.review.link) : { kind: 'empty' };
    kinds.add(k.via ? `${k.kind} by email` : k.short ? 'short' : k.kind === 'web' ? `web ${k.host}` : k.kind);
  }
  assert.deepEqual([...kinds].sort(), ['drive', 'empty', 'review', 'review by email', 'short', 'web storage.googleapis.com', 'web tryboxs.in', 'writer-only'].sort());
  assert.deepEqual(rows.filter((r) => r.orderId.value === SHARED_ORDER_ID).map((r) => r.row), [18, 19, 20]);
  const sharing = rows.filter((r) => linkKey(r.shots.delivery.link) === linkKey(SHARED_DELIVERY) && linkKey(r.shots.review.link) === linkKey(SHARED_REVIEW)).map((r) => r.row);
  assert.deepEqual(sharing, [21, 22, 23], 'different orders with the same delivery and review links');
  assert.notEqual(row(21).orderId.value, row(22).orderId.value);
  const delivery = (n) => new URL(row(n).shots.delivery.link).hostname;
  assert.deepEqual([delivery(3), delivery(4), delivery(5)], ['storage.googleapis.com', 'tryboxs.in', 'www.tryboxs.in'], 'delivery pictures on the other websites');
});

test('which tab: the one named "Amazon" whatever its capitals or spaces, else the only tab; a file with neither is told in one plain sentence', async () => {
  const head = HEADER;
  const one = await openWorkbook(await workbook({ Orders: [head, [orderId(2), '20-07-2026', 654, PRODUCTS[0]]] }), { fileName: 'x.xlsx' });
  assert.equal(one.tab.name, 'Orders', 'the only tab');
  assert.equal(one.tab.rows.length, 1);
  const lower = await openWorkbook(await workbook({ Flipkart: [head, [orderId(3)]], ' amazon ': [head, [orderId(2)]] }), { fileName: 'x.xlsx' });
  assert.equal(lower.tab.name, ' amazon ', 'capitals and spaces around the name do not matter');
  assert.deepEqual(lower.tab.rows.map((r) => r.cells[1].text), [orderId(2)]);
  for (const name of ['AMAZON', 'amazon', 'Ama zon']) {
    const book = await openWorkbook(await workbook({ Flipkart: [head, [orderId(3)]], [name]: [head, [orderId(2)]] }), { fileName: 'x.xlsx' });
    assert.equal(book.tab.name, name, `"${name}" is the Amazon tab`);
  }
  assert.equal(await refusal(await workbook({ Instamart: [head, [orderId(2)]], Flipkart: [head, [orderId(3)]] }), { fileName: 'x.xlsx' }), 'This file has no tab named "Amazon", so name the tab with the orders "Amazon" in Excel, save the file, then upload it again.');
  const flipkart = await openWorkbook(await workbook({ Instamart: [head], Flipkart: [head, [orderId(3)]], Amazon: [head, [orderId(2)]] }), { fileName: 'x.xlsx', tabName: 'Flipkart' });
  assert.equal(flipkart.tab.name, 'Flipkart', 'another tab only when asked for by its name');
});

test('the tab read: the one named Amazon; else the only tab with the word Amazon in its name; else the only tab; two such tabs are said plainly', async () => {
  assert.deepEqual(pickTab(['Flipkart', 'Amazon Orders'], 'Amazon'), { name: 'Amazon Orders' });
  assert.deepEqual(pickTab(['Amazon Orders', ' amazon '], 'Amazon'), { name: ' amazon ' }, 'the one named Amazon comes first');
  assert.deepEqual(pickTab(['Orders_Amazon', 'Notes'], 'Amazon'), { name: 'Orders_Amazon' }, 'the word, whatever stands around it');
  assert.deepEqual(pickTab(['AmazonOrders', 'Notes'], 'Amazon'), { name: null }, 'a whole word only');
  assert.deepEqual(pickTab(['Sheet1'], 'Amazon'), { name: 'Sheet1' }, 'the only tab');
  assert.deepEqual(pickTab(['Amazon Orders', 'Amazon Returns'], 'Amazon'), { name: null, several: ['Amazon Orders', 'Amazon Returns'] });
  const book = await openWorkbook(await newLayoutBook({ tabs: ['Notes', NEW_TAB] }), { fileName: NEW_FILE_NAME });
  assert.equal(book.tab.name, NEW_TAB);
  const head = NEW_HEADER;
  assert.equal(await refusal(await workbook({ 'Amazon Orders': [head, [newOrderId(1)]], 'Amazon Returns': [head, [newOrderId(2)]] }), { fileName: 'x.xlsx' }), 'This file has more than one tab with "Amazon" in its name ("Amazon Orders", "Amazon Returns"), so name the tab with the orders "Amazon" in Excel, save the file, then upload it again.');
});

test('a file laid out differently is read by itself: each column by its meaning, whatever its place; "Reviewer Name" is never the review link; no order date, Status, Type or Note is fine', async () => {
  const book = await openWorkbook(await newLayoutBook(), { fileName: NEW_FILE_NAME });
  const tab = book.tab;
  assert.equal(tab.name, NEW_TAB, 'the only tab, named "Amazon Orders"');
  assert.deepEqual(tab.headers.map((h) => h.text), NEW_HEADER);
  const mapping = guessColumns(tab.headers, null, tab);
  assert.deepEqual(mapping, { orderId: 2, orderDate: null, amount: 3, product: 4, orderShot: 5, deliveryShot: 6, reviewShot: 7, reviewLink: 8, reviewer: 1, email: null, status: null, type: null, note: null });
  assert.deepEqual(columnProblems(mapping, tab.headers), [], 'nothing to choose');
  // The old file's remembered choice does not get in the way.
  const oldChoice = { orderId: 'Order ID', orderDate: 'Order Date', amount: 'Amount', product: 'Product Ordered', orderShot: 'Order Screenshot', deliveryShot: 'Delivery Screenshot', reviewLink: 'Live Review Link', status: 'Status', type: 'Type' };
  assert.deepEqual(guessColumns(tab.headers, oldChoice, tab), mapping);
  const { rows } = sheetRows(tab, mapping);
  assert.equal(rows.length, NEW_ROWS.length);
  assert.deepEqual(rows.map((r) => r.n), rows.map((_, i) => i + 1), 'numbered from 1');
  assert.deepEqual(rows[0].values, { 1: { text: 'Test Reviewer One', behind: '' } }, "the reviewer's name is kept to be shown");
  assert.deepEqual([rows[0].orderId.value, rows[0].amount.value, rows[1].amount.value, rows[0].product.text], [newOrderId(1), 349, 499.5, 'Face Wash For Man - Amazon']);
  assert.deepEqual([rows[0].orderDate, rows[0].prev], [{ text: '', value: null }, null], 'no order date, and nothing from before');
  assert.equal(reviewLinkKind(rows[0].shots.review.link).kind, 'review');
  assert.match(rows[0].shots.reviewShot.link, /^https:\/\/drive\.google\.com\/open\?id=1TestNewReviewRow01/, 'the review screenshot, a Google Drive link written as the words');
  assert.deepEqual(rows[8].shots.review.links, [], 'NA is words, not a link');
  assert.equal(rows[8].shots.review.text, 'NA');
  const onlyOrder = rows[11];
  assert.ok(onlyOrder.shots.order.link, 'a row with only a purchase screenshot is kept');
  assert.deepEqual([onlyOrder.shots.delivery.links, onlyOrder.shots.reviewShot.links, onlyOrder.shots.review.links], [[], [], []]);
});

test('column names are read by their meaning and by whole words, whatever the capitals, spaces or punctuation; a column whose cells clearly hold something else is never used', () => {
  const heads = (...names) => names.map((text, i) => ({ col: i + 1, text }));
  const g = (...names) => guessColumns(heads(...names));
  assert.equal(g('Order #', 'Order value').orderId, 1);
  assert.equal(g('Order #', 'Order value').amount, 2);
  assert.equal(g('order_id', 'ORDER AMOUNT').amount, 2);
  assert.equal(g('Order No.', 'Product name').product, 2);
  assert.equal(g('Order ID', 'Purchase screenshot').orderShot, 2);
  assert.equal(g('Order ID', 'Review URL').reviewLink, 2);
  assert.equal(g('Order ID', 'Live review link').reviewLink, 2);
  assert.equal(g('Order ID', 'Review SS').reviewShot, 2);
  assert.equal(g('Order ID', 'Customer name').reviewer, 2);
  assert.equal(g('Order ID', 'User Name').reviewer, 2);
  const names = g('Reviewer Name', 'Order ID');
  assert.deepEqual([names.reviewer, names.reviewLink], [1, null], '"Reviewer" is not the word "review"');
  assert.equal(g('Order ID', 'Order Screenshot').orderId, 1, 'a screenshot column is never the order ID');
  assert.equal(g('Order ID', 'Delivery Date').deliveryShot, null, 'a delivery date is not a delivery screenshot');
  assert.equal(g('Order ID', 'Delivery Date').orderDate, null, 'nor the order date');
  // The cells: a column named like the review link that holds names is never used for it.
  const tab = {
    headerRow: 1,
    headers: heads('Order ID', 'Review Link'),
    rows: [2, 3, 4, 5].map((n) => ({ row: n, cells: { 1: { text: newOrderId(n), behind: '' }, 2: { text: `Test Person ${n}`, behind: '' } } })),
    pictures: [],
  };
  assert.equal(guessColumns(tab.headers, null, tab).reviewLink, null, 'cells of names are not review links');
  assert.equal(guessColumns(tab.headers, { reviewLink: 'Review Link' }, tab).reviewLink, null, 'not even when it was chosen before');
  // A column no name says, found by its cells: order IDs, and Amazon review links.
  const byCells = {
    headerRow: 1,
    headers: heads('Number', 'Proof'),
    rows: [2, 3, 4].map((n) => ({ row: n, cells: { 1: { text: newOrderId(n), behind: '' }, 2: { text: `https://www.amazon.in/gp/customer-reviews/R1TESTCELL0${n}`, behind: '' } } })),
    pictures: [],
  };
  const found = guessColumns(byCells.headers, null, byCells);
  assert.deepEqual([found.orderId, found.reviewLink], [1, 2]);
});

test('the email address column: found by its name ("Email", "Email ID", "Email Address", "E-mail", "Mail ID") or by its cells; a column so named whose cells are not addresses is never used; it is only shown, kept with the file\'s other columns', async () => {
  const heads = (...names) => names.map((text, i) => ({ col: i + 1, text }));
  const g = (...names) => guessColumns(heads(...names));
  for (const name of ['Email', 'Email ID', 'Email Address', 'E-mail', 'Mail ID', 'User Email', 'Customer email id', 'Gmail']) assert.equal(g('Order ID', name).email, 2, name);
  assert.equal(g('Order ID', 'Email sent?').email, null, 'not a column that says whether an email was sent');
  assert.equal(g('Order ID', 'Reviewer Name').email, null);
  assert.equal(g('Order ID', 'User Email').reviewer, null, 'an email column is not the reviewer\'s name');
  const rowsOf = (cells) => [2, 3, 4, 5].map((n) => ({ row: n, cells: { 1: { text: newOrderId(n), behind: '' }, 2: { text: cells(n), behind: '' } } }));
  const named = { headerRow: 1, headers: heads('Order ID', 'Email'), rows: rowsOf((n) => `Test Person ${n}`), pictures: [] };
  assert.equal(guessColumns(named.headers, null, named).email, null, 'cells of names are not email addresses');
  assert.equal(guessColumns(named.headers, { email: 'Email' }, named).email, null, 'not even when it was chosen before');
  const byCells = { headerRow: 1, headers: heads('Order ID', 'Contact'), rows: rowsOf((n) => `test.person.${n}@example.test`), pictures: [] };
  assert.equal(guessColumns(byCells.headers, null, byCells).email, 2, 'a column no name says, found by its cells');
  assert.ok(EMAIL_SHAPE.test('test.person@example.test') && !EMAIL_SHAPE.test('not an address') && !EMAIL_SHAPE.test('two@words @example.test'));
  // In a file like the newer ones, with an "Email ID" column after the review link: kept with the file's other columns, to be shown.
  const header = [...NEW_HEADER, 'Email ID'];
  const rows = NEW_ROWS.map((r, i) => [...r, i === 1 ? 'not an address' : `test.reviewer.${i + 1}@example.test`]);
  const book = await openWorkbook(await newLayoutBook({ header, rows }), { fileName: NEW_FILE_NAME });
  const mapping = guessColumns(book.tab.headers, null, book.tab);
  assert.deepEqual([mapping.email, mapping.reviewer, mapping.reviewLink], [9, 1, 8]);
  assert.deepEqual(columnProblems(mapping, book.tab.headers), []);
  const made = sheetRows(book.tab, mapping).rows;
  assert.deepEqual(made[0].values, { 1: { text: 'Test Reviewer One', behind: '' }, 9: { text: 'test.reviewer.1@example.test', behind: '' } }, 'the name and the address are kept to be shown');
  assert.equal(made[1].values[9].text, 'not an address');
  assert.deepEqual(rememberedChoice(mapping, book.tab.headers).email, 'Email ID');
});

test('a remembered choice is used again when the columns move; the results go in new columns when they are not there', async () => {
  const { tab, mapping } = await orders();
  const saved = rememberedChoice({ ...mapping, note: null }, tab.headers);
  assert.deepEqual(saved, { orderId: 'Order ID', orderDate: 'Order Date', amount: 'Amount', product: 'Product Ordered', orderShot: 'Order Screenshot', deliveryShot: 'Delivery Screenshot', reviewLink: 'Live Review Link', status: 'Status', type: 'Type' });
  const moved = [{ col: 1, text: 'live review link' }, { col: 2, text: 'ORDER ID' }, { col: 3, text: 'Order date' }, { col: 4, text: 'Amount (₹)' }, { col: 5, text: 'Product Ordered' }, { col: 6, text: 'Order Screenshot' }, { col: 7, text: 'Delivery Screenshot' }, { col: 8, text: 'Remarks' }];
  const again = guessColumns(moved, saved);
  assert.deepEqual(again, { orderId: 2, orderDate: 3, amount: 4, product: 5, orderShot: 6, deliveryShot: 7, reviewShot: null, reviewLink: 1, reviewer: null, email: null, status: null, type: null, note: 8 });
  assert.deepEqual(resultColumns(mapping, tab.lastCol), { status: 8, type: 9, note: 10, added: [{ col: 10, header: 'Note' }] }, 'no Note column: a new one right after the last, headed "Note"; the Status goes in the file\'s own Status column');
  assert.deepEqual(resultColumns({ ...mapping, status: null, type: null }, 7), { status: 8, type: 9, note: 10, added: [{ col: 8, header: 'Status' }, { col: 9, header: 'Type' }, { col: 10, header: 'Note' }] }, 'no Status column: one after the last column, headed "Status"');
  assert.deepEqual(resultColumns({ ...mapping, note: 12 }, 12), { status: 8, type: 9, note: 12, added: [] }, 'no column is added when the file has all three');
  assert.equal(guessColumns([...moved, { col: 9, text: 'Final Result' }], saved).status, null, 'a column of another name is never the Status column');
  assert.deepEqual(columnProblems({ ...mapping, amount: null, orderDate: null }, tab.headers), [], 'an amount and an order date can be missing');
  assert.deepEqual(columnProblems({ ...mapping, orderId: null, note: 7 }, tab.headers), ['Say which column holds the order ID.', 'One column cannot hold two things: Review link and Note.']);
  assert.deepEqual(columnProblems({ ...mapping, reviewLink: null }, tab.headers), ['Say which column holds the review link or the review screenshot.']);
  assert.deepEqual(columnProblems({ ...mapping, reviewLink: null, reviewShot: 7 }, tab.headers), [], 'a review screenshot will do');
  assert.deepEqual(columnProblems({ ...mapping, orderId: 40 }, tab.headers), ['The column chosen for Order ID is not in this tab.']);
});

test('a Status, Type or Note already in the file is kept as the result from before', async () => {
  const buf = await workbook({ Amazon: [[...HEADER, 'Note'], [orderId(2), '20-07-2026', 654, PRODUCTS[0], 'https://drive.google.com/open?id=1TestOrderRow02abcdefgh', '', '', 'Unverified', 'Need Access', 'Checked by hand.'], [orderId(3), '20-07-2026', 654, PRODUCTS[0]]] });
  const book = await openWorkbook(buf, { fileName: 'x.xlsx' });
  const tab = book.tab;
  const m = guessColumns(tab.headers);
  assert.equal(m.note, 10);
  const { rows } = sheetRows(tab, m);
  assert.deepEqual(rows[0].prev, { status: 'Unverified', type: 'Need Access', note: 'Checked by hand.' });
  assert.equal(rows[1].prev, null);
  const words = await openWorkbook(await workbook({ Amazon: [[...HEADER, 'Note'], [orderId(2), '20-07-2026', 654, PRODUCTS[0], '', '', '', 'Needs Manual Staff Checking', 'Need Access', 'Checked by hand.']] }), { fileName: 'x.xlsx' });
  assert.deepEqual(sheetRows(words.tab, guessColumns(words.tab.headers)).rows[0].prev, { status: 'Needs Manual Staff Checking', type: 'Need Access', note: 'Checked by hand.' }, 'a Status the dashboard wrote before is kept as it is');
});

test('a picture that is not used is said with the rows\' numbers on the dashboard and the column\'s name, never a cell\'s name', () => {
  const headers = ['Order ID', 'Order Date', 'Amount', 'Product Ordered', 'Order Screenshot', 'Delivery Screenshot', 'Live Review Link', 'Status', 'Type', 'Remarks'].map((text, i) => ({ col: i + 1, text }));
  const png = { type: 'image/png', data: Buffer.from('made-up') };
  const tab = { headerRow: 1, headers, rows: [{ row: 2, cells: { 1: { text: '403-1000002-2000002' } } }, { row: 4, cells: { 1: { text: '403-1000004-2000004' } } }], pictures: [{ row: 4, col: 10, lastCol: 10, how: 'cell', ...png }, { row: 6, col: 10, lastCol: 10, how: 'cell', ...png }] };
  const { rows, unplaced } = sheetRows(tab, guessColumns(headers));
  assert.deepEqual(rows.map((r) => [r.row, r.n]), [[2, 1], [4, 2]], 'the empty row 3 is not counted');
  assert.deepEqual(unplaced, [
    'A picture in the "Remarks" column, in Row 2, is not in the Purchase screenshot, Delivery screenshot or Review link column, so it was not used.',
    'A picture in the "Remarks" column is in a row with nothing else in it, just after Row 2, so it was not used.',
  ]);
});

test('pictures placed inside cells, and pictures over cells, are that cell’s picture', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Amazon');
  ws.addRow(HEADER);
  ws.addRow([orderId(2), '20-07-2026', 654, PRODUCTS[0], 'IN CELL', 'IN CELL', 'https://amzn.in/d/0TestRow02']);
  ws.addRow([orderId(3), '20-07-2026', 654, PRODUCTS[0], '', '', '']);
  const d = wb.addImage({ buffer: DELIVERY_PNG, extension: 'png' });
  ws.addImage(d, { tl: { col: 5.1, row: 2.1 }, ext: { width: 120, height: 70 } });
  const plain = Buffer.from(await wb.xlsx.writeBuffer());
  const buf = placeInCells(plain, [{ ref: 'E2', media: 'incell1.png' }, { ref: 'F2', media: 'incell2.png' }], [['incell1.png', PNG], ['incell2.png', DELIVERY_PNG]]);
  const book = await openWorkbook(buf, { fileName: 'pictures.xlsx' });
  const tab = book.tab;
  const { rows, unplaced } = sheetRows(tab, guessColumns(tab.headers));
  assert.deepEqual(unplaced, []);
  assert.equal(rows[0].shots.order.picture.how, 'cell');
  assert.ok(rows[0].shots.order.picture.data.equals(PNG));
  assert.equal(rows[0].shots.delivery.picture.type, 'image/png');
  assert.equal(rows[1].shots.delivery.picture.how, 'floating', 'a picture over the delivery cell of row 3');
  assert.ok(rows[1].shots.delivery.picture.data.equals(DELIVERY_PNG));
  assert.equal(rows[1].shots.order.picture, null);
});

test('a CSV file with the same columns: one tab, links as words', async () => {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = `﻿${[HEADER, [orderId(2), '20-07-2026', '₹654', PRODUCTS[0], 'https://drive.google.com/open?id=1TestOrderRow02abcdefgh', 'Cancelled', 'https://amzn.in/d/0TestRow02']].map((r) => r.map(q).join(',')).join('\r\n')}\r\n`;
  const book = await openWorkbook(Buffer.from(csv), { fileName: 'july orders.csv' });
  assert.equal(book.kind, 'csv');
  const tab = book.tab;
  assert.equal(tab.name, 'july orders');
  const { rows } = sheetRows(tab, guessColumns(tab.headers));
  assert.equal(rows[0].row, 2);
  assert.equal(rows[0].amount.value, 654);
  assert.equal(rows[0].orderDate.value, '2026-07-20');
  assert.deepEqual(rows[0].shots.order.links, ['https://drive.google.com/open?id=1TestOrderRow02abcdefgh']);
  assert.equal(rows[0].shots.delivery.text, 'Cancelled');
});

test('cell values: numbers, dates, links behind words, formulas, rich text and errors', () => {
  assert.deepEqual(cellValue(654), { text: '654', behind: '', number: 654 });
  assert.deepEqual(cellValue(851.95), { text: '851.95', behind: '', number: 851.95 });
  assert.deepEqual(cellValue(new Date(Date.UTC(2026, 6, 20))), { text: '20-07-2026', behind: '', date: '2026-07-20' });
  assert.deepEqual(cellValue({ text: 'https://a.example/1', hyperlink: 'https://b.example/2' }), { text: 'https://a.example/1', behind: 'https://b.example/2' });
  assert.deepEqual(cellValue({ text: { richText: [{ text: 'Open ' }, { text: 'it' }] }, hyperlink: 'https://b.example/2' }), { text: 'Open it', behind: 'https://b.example/2' });
  assert.deepEqual(cellValue({ text: 'Sheet two', hyperlink: '#Sheet2!A1' }), { text: 'Sheet two', behind: '' }, 'a link inside the file is not a web link');
  assert.deepEqual(cellValue({ formula: 'HYPERLINK("https://amzn.in/d/0TestRow02","review")', result: 'review' }), { text: 'review', behind: 'https://amzn.in/d/0TestRow02' });
  assert.deepEqual(cellValue({ richText: [{ text: 'Lost ' }, { text: 'in transit' }] }), { text: 'Lost in transit', behind: '' });
  assert.deepEqual(cellValue({ error: '#N/A' }), { text: '', behind: '' });
  assert.deepEqual(cellValue(null), { text: '', behind: '' });
});

test('anything that cannot be read is a plain sentence', async () => {
  assert.equal(await refusal(Buffer.alloc(0), { fileName: 'x.xlsx' }), 'The file is empty.');
  const xls = Buffer.alloc(64);
  xls.writeUInt32BE(0xd0cf11e0, 0);
  assert.equal(await refusal(xls, { fileName: 'old.xls' }), 'This is an old Excel file (.xls) that the dashboard cannot read, so open it in Excel, save it as an Excel Workbook (.xlsx), then upload that.');
  assert.equal(await refusal(Buffer.from('<html><body><table><tr><td>Order ID</td><td>Amount</td></tr></table></body></html>'), { fileName: 'export.xls' }), 'This is an old Excel file (.xls) that the dashboard cannot read, so open it in Excel, save it as an Excel Workbook (.xlsx), then upload that.', 'an .xls file that is words inside, as some websites save them');
  assert.equal(await refusal(PNG, { fileName: 'picture.png' }), 'This file is not an Excel file or a CSV file, so choose the Excel file with the orders (.xlsx or .xlsm) or a CSV file.');
  assert.equal(await refusal(await workbook({ Amazon: [['only one cell']] }), { fileName: 'x.xlsx' }), 'The "Amazon" tab is empty: no row has at least two filled cells to use as column names.');
  assert.equal(await refusal(Buffer.from('just one cell\n'), { fileName: 'x.csv' }), 'The file is empty: no row has at least two filled cells to use as column names.');
  const zipNotExcel = Buffer.from('504b0304', 'hex');
  assert.match(await refusal(Buffer.concat([zipNotExcel, Buffer.alloc(40)]), { fileName: 'x.xlsx' }), /could not be opened|not an Excel/);
  const many = [HEADER, ...Array.from({ length: MAX_ROWS + 1 }, (_, i) => [`403-1000000-${String(i).padStart(7, '0')}`])];
  const book = await openWorkbook(await workbook({ Amazon: many }), { fileName: 'big.xlsx' });
  const tab = book.tab;
  assert.throws(() => sheetRows(tab, guessColumns(tab.headers)), (err) => err instanceof SheetError && err.message === `The tab has more than ${MAX_ROWS} rows, so split it into smaller files, then upload each one.`);
});

/** A tab's XML changed by fn, every other part as it was. */
function editSheet(buf, fn, part = 'xl/worksheets/sheet1.xml') {
  return replaceInZip(buf, new Map([[part, Buffer.from(fn(readZip(buf).get(part)().toString('utf8')))]]));
}

test('a link set on several cells at once is behind each of them, with any part after "#"', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Amazon');
  ws.addRow(HEADER);
  ws.addRow([orderId(2), '20-07-2026', 654, PRODUCTS[0], 'https://drive.google.com/open?id=1TestOrderRow02abcdefgh', '', { text: 'Review', hyperlink: 'https://www.amazon.in/gp/customer-reviews/R1TESTROW02ABC' }]);
  ws.addRow([orderId(3), '20-07-2026', 654, PRODUCTS[0], 'https://drive.google.com/open?id=1TestOrderRow03abcdefgh', '', 'Review']);
  ws.addRow([orderId(4), '20-07-2026', 654, PRODUCTS[0], 'https://drive.google.com/open?id=1TestOrderRow04abcdefgh', '', { text: 'Review', hyperlink: 'https://www.amazon.in/gp/customer-reviews/R1TESTROW04ABC' }]);
  const plain = Buffer.from(await wb.xlsx.writeBuffer());
  // One link over G2 and G3, as Excel saves a link added to two cells at once; and one with a part after "#".
  const buf = editSheet(plain, (xml) => xml.replace('ref="G2"', 'ref="G2:G3"').replace(/(<hyperlink ref="G4"[^>]*?)\/>/, '$1 location="fragment-1"/>'));
  const book = await openWorkbook(buf, { fileName: 'links.xlsx' });
  const tab = book.tab;
  const { rows } = sheetRows(tab, guessColumns(tab.headers));
  assert.deepEqual(rows.map((r) => r.shots.review.link), ['https://www.amazon.in/gp/customer-reviews/R1TESTROW02ABC', 'https://www.amazon.in/gp/customer-reviews/R1TESTROW02ABC', 'https://www.amazon.in/gp/customer-reviews/R1TESTROW04ABC#fragment-1']);
});

test('a link a formula builds from pieces is no link; HYPERLINK and IMAGE with the whole link written out are', () => {
  assert.equal(formulaLink('HYPERLINK("https://www.amazon.in/gp/customer-reviews/"&H2,"Open review")'), null);
  assert.deepEqual(cellValue({ formula: 'HYPERLINK("https://www.amazon.in/gp/customer-reviews/"&H2,"Open review")', result: 'Open review' }), { text: 'Open review', behind: '' });
  assert.equal(formulaLink('HYPERLINK("https://amzn.in/d/0TestRow02")'), 'https://amzn.in/d/0TestRow02');
  assert.deepEqual(cellValue({ formula: '_xlfn.IMAGE("https://drive.google.com/uc?id=1TestImageCellabcdef")', result: { error: '#VALUE!' } }), { text: '', behind: 'https://drive.google.com/uc?id=1TestImageCellabcdef' }, 'a picture shown with IMAGE() keeps its link');
  assert.equal(formulaLink('IMAGE("not a link")'), null);
});

test('dates in a file saved with the 1904 day system', async () => {
  for (const flag of ['1', 'true']) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Amazon');
    ws.addRow(HEADER);
    ws.addRow([orderId(2), 44761, 654, PRODUCTS[0]]);
    ws.addRow([orderId(3), 44761, 654, PRODUCTS[0]]);
    ws.getCell('B3').numFmt = 'dd-mm-yyyy';
    const plain = Buffer.from(await wb.xlsx.writeBuffer());
    const book = readZip(plain).get('xl/workbook.xml')().toString('utf8');
    const withFlag = book.includes('<workbookPr') ? book.replace('<workbookPr', `<workbookPr date1904="${flag}"`) : book.replace('<bookViews>', `<workbookPr date1904="${flag}"/><bookViews>`);
    const buf = replaceInZip(plain, new Map([['xl/workbook.xml', Buffer.from(withFlag)]]));
    const opened = await openWorkbook(buf, { fileName: 'x.xlsx' });
    const tab = opened.tab;
    const { rows } = sheetRows(tab, guessColumns(tab.headers));
    assert.deepEqual(rows.map((r) => r.orderDate.value), ['2026-07-20', '2026-07-20'], `date1904="${flag}": a day number, and a cell formatted as a date`);
  }
});

test('a password-protected Excel file gets its own plain sentence, not the advice for an old .xls file', async () => {
  const ole = Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(200), Buffer.from('EncryptedPackage', 'utf16le'), Buffer.alloc(200)]);
  assert.equal(await refusal(ole, { fileName: 'July orders.xlsx' }), 'The Excel file is protected with a password, so open it in Excel, save a copy without the password, then upload that.');
});

test('a part of a file that unpacks larger than it says is refused before anything unpacks it whole', async () => {
  const zip = readZip(ORDERS);
  const parts = [...zip.keys()].map((k) => [k, zip.get(k)()]);
  parts.push(['xl/media/big.png', Buffer.alloc(3 * 1024 * 1024)]);
  const buf = writeZip(parts);
  // The table of contents says the big part is 100 bytes.
  const name = Buffer.from('xl/media/big.png');
  const at = buf.lastIndexOf(name) - 46;
  assert.equal(buf.readUInt32LE(at), 0x02014b50);
  buf.writeUInt32LE(100, at + 24);
  assert.equal(await refusal(buf, { fileName: 'bomb.xlsx' }), 'The Excel file could not be read, so open it in Excel, save it again as an Excel Workbook (.xlsx), then upload it again.');
});
