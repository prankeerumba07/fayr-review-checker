// Writes orders.xlsx: a made-up orders sheet shaped like the real one, with
// made-up order IDs, links and products only. Three tabs ("Instamart",
// "Flipkart" and "Amazon"); only "Amazon" is checked. Row 1 has a filter.
// Real dates and dates written as words, an amount with paise and amounts
// written as words, links behind their words (some different from the
// words), words in delivery cells, empty cells, every kind of review link,
// one order ID in three rows, and links shared by rows of different orders.
// Run: node test/fixtures/sheets/make-orders.mjs

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const HERE = dirname(fileURLToPath(import.meta.url));
const pad = (n) => String(n).padStart(2, '0');

export const HEADER = ['Order ID', 'Order Date', 'Amount', 'Product Ordered', 'Order Screenshot', 'Delivery Screenshot', 'Live Review Link', 'Status', 'Type'];
export const PRODUCTS = ['Test Brand Floor Cleaner', 'Test Brand Home Cleaning Kit', 'Test Brand Stain Remover'];
export const FILE = join(HERE, 'orders.xlsx');

export const orderId = (row) => `403-10000${pad(row)}-20000${pad(row)}`;
export const driveOpen = (id) => `https://drive.google.com/open?id=${id}`;
export const orderShot = (row) => driveOpen(`1TestOrderRow${pad(row)}abcdefgh`);
export const deliveryShot = (row) => driveOpen(`1TestDeliveryRow${pad(row)}abcdef`);
export const reviewId = (row) => `R1TESTROW${pad(row)}ABC`;
export const reviewLink = (row) => `https://www.amazon.in/gp/customer-reviews/${reviewId(row)}`;
export const SHARED_ORDER_ID = '403-2000018-2000018';
export const SHARED_DELIVERY = driveOpen('1TestSharedDeliveryabcdef');
export const SHARED_REVIEW = 'https://www.amazon.in/gp/customer-reviews/R1TESTSHARED1A';
const enc = encodeURIComponent;

/**
 * The Amazon tab, one entry per sheet row. A cell is a string (its words), or
 * { text, link } for words with a link behind them, or a Date, or a number.
 * `linked` puts each link behind its own words, as most cells in the real sheet are.
 */
const linked = (url) => ({ text: url, link: url });
const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

export const ROWS = {
  2: { id: orderId(2), date: day(2026, 7, 20), amount: 654, product: PRODUCTS[0], order: linked(orderShot(2)), delivery: linked(deliveryShot(2)), review: linked(`https://amazon.in/gp/customer-reviews/${reviewId(2)}?ref=cm_cr_dp_d_rvw_ttl`) },
  3: { id: orderId(3), date: '14/07/2026', amount: 851.95, product: PRODUCTS[1], order: linked(`https://drive.google.com/file/d/1TestOrderRow03abcdefgh/view?usp=drivesdk`), delivery: linked('https://storage.googleapis.com/tryboxs-screenshots/test/delivery-row-03.png'), review: linked(`https://www.amazon.in/gp/customer-reviews/${reviewId(3)}?ref_=cm_cr_arp_d_rvw_ttl&language=en_IN`) },
  4: { id: orderId(4), date: '20-07-2026', amount: '₹499', product: PRODUCTS[2], order: linked(orderShot(4)), delivery: linked('https://tryboxs.in/api/view-screenshot/test-delivery-04'), review: linked(`https://www.amazon.in/review/${reviewId(4)}/ref=pe_00000_000000`) },
  5: { id: orderId(5), date: '20.07.2026', amount: '654.00', product: PRODUCTS[0], order: linked(orderShot(5)), delivery: linked('https://www.tryboxs.in/api/view-screenshot/test-delivery-05'), review: linked(`https://www.amazon.in/review/${reviewId(5)}/`) },
  6: { id: orderId(6), date: day(2026, 7, 18), amount: 299, product: PRODUCTS[1], order: linked(orderShot(6)), delivery: linked(deliveryShot(6)), review: linked(`https://www.amazon.in/gp/f.html?C=1TESTCAMPAIGN&K=2TESTKEY&M=urn:rtn:msg:20260720000000test&R=3TESTR&T=C&U=${enc(`https://www.amazon.in/review/${reviewId(6)}/ref=pe_00000_000000_test`)}&H=TESTHASHVALUE&ref_=pe_00000_000000`) },
  7: { id: orderId(7), date: day(2026, 7, 19), amount: 654, product: PRODUCTS[0], order: linked(orderShot(7)), delivery: linked(deliveryShot(7)), review: linked('https://amzn.in/d/0TestRow07') },
  8: { id: orderId(8), date: day(2026, 7, 19), amount: 499, product: PRODUCTS[2], order: linked(orderShot(8)), delivery: linked(deliveryShot(8)), review: linked('https://amzn.in/TestRow08') },
  9: { id: orderId(9), date: day(2026, 7, 17), amount: 654, product: PRODUCTS[0], order: linked(orderShot(9)), delivery: linked(deliveryShot(9)), review: linked('https://www.amazon.in/review/review-your-purchases/edit?asin=B0TESTFLR1&channel=YAcc-wr') },
  10: { id: orderId(10), date: day(2026, 7, 17), amount: 851, product: PRODUCTS[1], order: linked(orderShot(10)), delivery: linked(deliveryShot(10)), review: linked(`https://www.amazon.in/review/${reviewId(10)}/thankyou?asin=B0TESTKIT1&channel=YAcc-wr`) },
  11: { id: orderId(11), date: day(2026, 7, 16), amount: 499, product: PRODUCTS[2], order: linked(orderShot(11)), delivery: linked(deliveryShot(11)), review: linked(driveOpen('1TestReviewRow11abcdefg')) },
  12: { id: orderId(12), date: day(2026, 7, 16), amount: 654, product: PRODUCTS[0], order: linked(orderShot(12)), delivery: linked(deliveryShot(12)), review: linked('https://tryboxs.in/api/view-screenshot/test-review-12') },
  13: { id: orderId(13), date: day(2026, 7, 15), amount: 851, product: PRODUCTS[1], order: linked(orderShot(13)), delivery: linked(deliveryShot(13)), review: linked('https://storage.googleapis.com/tryboxs-screenshots/test/review-row-13.png') },
  14: { id: orderId(14), date: day(2026, 7, 15), amount: 499, product: PRODUCTS[2], order: linked(orderShot(14)), delivery: linked(deliveryShot(14)), review: null },
  15: { id: orderId(15), date: day(2026, 7, 14), amount: 654, product: PRODUCTS[0], order: linked(orderShot(15)), delivery: 'Cancelled', review: null },
  16: { id: orderId(16), date: day(2026, 7, 14), amount: 851, product: PRODUCTS[1], order: linked(orderShot(16)), delivery: 'Lost in transit', review: null },
  17: { id: orderId(17), date: day(2026, 7, 13), amount: 499, product: PRODUCTS[2], order: linked(orderShot(17)), delivery: '0', review: null },
  18: { id: SHARED_ORDER_ID, date: day(2026, 7, 12), amount: 654, product: PRODUCTS[0], order: linked(orderShot(18)), delivery: linked(deliveryShot(18)), review: linked(reviewLink(18)) },
  19: { id: SHARED_ORDER_ID, date: day(2026, 7, 12), amount: 654, product: PRODUCTS[0], order: linked(orderShot(19)), delivery: linked(deliveryShot(19)), review: linked(reviewLink(19)) },
  20: { id: SHARED_ORDER_ID, date: day(2026, 7, 12), amount: 654, product: PRODUCTS[0], order: linked(orderShot(20)), delivery: linked(deliveryShot(20)), review: linked(reviewLink(20)) },
  21: { id: orderId(21), date: day(2026, 7, 11), amount: 851, product: PRODUCTS[1], order: linked(orderShot(21)), delivery: linked(SHARED_DELIVERY), review: linked(SHARED_REVIEW) },
  22: { id: orderId(22), date: day(2026, 7, 11), amount: 851, product: PRODUCTS[1], order: linked(orderShot(22)), delivery: linked(SHARED_DELIVERY), review: linked(SHARED_REVIEW) },
  23: { id: orderId(23), date: day(2026, 7, 11), amount: 851, product: PRODUCTS[1], order: linked(orderShot(23)), delivery: linked(SHARED_DELIVERY), review: linked(SHARED_REVIEW) },
  // The words are row 25's Drive link; the link behind them is an Amazon review.
  24: { id: orderId(24), date: day(2026, 7, 10), amount: 499, product: PRODUCTS[2], order: linked(orderShot(24)), delivery: linked(deliveryShot(24)), review: { text: driveOpen('1TestReviewRow25abcdefg'), link: `https://www.amazon.in/review/${reviewId(24)}/` } },
  25: { id: orderId(25), date: day(2026, 7, 10), amount: 499, product: PRODUCTS[2], order: linked(orderShot(25)), delivery: linked(deliveryShot(25)), review: linked(driveOpen('1TestReviewRow25abcdefg')) },
  // The words are row 27's delivery link; the link behind them is another Drive file.
  26: { id: orderId(26), date: day(2026, 7, 9), amount: 654, product: PRODUCTS[0], order: linked(orderShot(26)), delivery: { text: deliveryShot(27), link: deliveryShot(26) }, review: linked(reviewLink(26)) },
  27: { id: orderId(27), date: day(2026, 7, 9), amount: 654, product: PRODUCTS[0], order: linked(orderShot(27)), delivery: deliveryShot(27), review: linked(reviewLink(27)) },
  28: { id: orderId(28), date: day(2026, 7, 8), amount: 851, product: PRODUCTS[1], order: null, delivery: linked(deliveryShot(28)), review: linked(reviewLink(28)) },
  // Row 29 is empty.
  30: { id: orderId(30), date: day(2026, 7, 7), amount: 499, product: PRODUCTS[2], order: linked(`${orderShot(30)}, ${driveOpen('1TestOrderRow30second00')}`), delivery: linked(deliveryShot(30)), review: linked(reviewLink(30)) },
  31: { id: orderId(31), date: day(2026, 7, 7), amount: 654, product: PRODUCTS[0], order: { text: 'Open the screenshot', link: orderShot(31) }, delivery: linked(deliveryShot(31)), review: linked(reviewLink(31)) },
  32: { id: null, date: day(2026, 7, 6), amount: 851, product: PRODUCTS[1], order: linked(orderShot(32)), delivery: linked(deliveryShot(32)), review: linked(reviewLink(32)) },
};
export const LAST_ROW = 32;
/** The links behind words that open something else, by row: [which, words, link behind]. */
export const MISMATCHES = { 24: ['review', driveOpen('1TestReviewRow25abcdefg'), `https://www.amazon.in/review/${reviewId(24)}/`], 26: ['delivery', deliveryShot(27), deliveryShot(26)] };

function put(cell, value) {
  if (value === null || value === undefined) return;
  if (value && typeof value === 'object' && !(value instanceof Date) && 'link' in value) cell.value = { text: value.text, hyperlink: value.link };
  else cell.value = value;
}

export async function makeOrders() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Test';
  wb.created = new Date(Date.UTC(2026, 6, 21));
  wb.modified = new Date(Date.UTC(2026, 6, 21));

  // Orders from other shops: never checked, and they must come back exactly as they were.
  const insta = wb.addWorksheet('Instamart', { properties: { tabColor: { argb: 'FF2E7D32' } } });
  insta.mergeCells('A1:E1');
  insta.getCell('A1').value = 'Instamart orders (test)';
  insta.getCell('A1').font = { bold: true, size: 14 };
  insta.addRow(['Order No', 'Date', 'Item', 'Amount', 'Screenshot']);
  insta.addRow(['IM-TEST-0001', day(2026, 7, 2), 'Test Brand Glass Cleaner', 199, { text: 'screenshot', hyperlink: 'https://drive.google.com/open?id=1TestInstamartabcdefgh' }]);
  insta.addRow(['IM-TEST-0002', '03-07-2026', 'Test Brand Dish Soap', 99.5, null]);
  insta.getRow(2).font = { bold: true };
  insta.getColumn(3).width = 30;
  insta.getCell('B3').numFmt = 'dd-mm-yyyy';

  const flip = wb.addWorksheet('Flipkart', { views: [{ state: 'frozen', ySplit: 1 }] });
  flip.addRow(['Order Id', 'Order Date', 'Product', 'Price', 'Twice the price']);
  flip.addRow(['OD-TEST-000000000001', day(2026, 7, 4), 'Test Brand Mop', 349, { formula: 'D2*2', result: 698 }]);
  flip.addRow(['OD-TEST-000000000002', day(2026, 7, 5), 'Test Brand Bucket', 249, { formula: 'D3*2', result: 498 }]);
  flip.getColumn(4).numFmt = '"₹"#,##0.00';
  flip.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF59D' } };

  const ws = wb.addWorksheet('Amazon');
  ws.addRow(HEADER);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
  [22, 13, 10, 30, 44, 44, 60, 12, 26].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (const [n, r] of Object.entries(ROWS)) {
    const row = ws.getRow(Number(n));
    put(row.getCell(1), r.id);
    put(row.getCell(2), r.date);
    if (r.date instanceof Date) row.getCell(2).numFmt = 'dd-mm-yyyy';
    put(row.getCell(3), r.amount);
    put(row.getCell(4), r.product);
    put(row.getCell(5), r.order);
    put(row.getCell(6), r.delivery);
    put(row.getCell(7), r.review);
  }
  ws.autoFilter = `A1:I${LAST_ROW}`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(FILE, await makeOrders());
  console.log('written');
}
