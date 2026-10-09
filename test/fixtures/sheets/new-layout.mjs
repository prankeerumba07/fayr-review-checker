// A made-up orders file laid out like the newer files: one tab named
// "Amazon Orders", the reviewer's name first, no order date, Status, Type or
// Note, a review screenshot column, product names that are short, have no
// brand and end with " - Amazon", and the brand only in the file's name. Made
// up names, order IDs, links and codes only; never a real file. Built in
// memory, so no file is written.

import ExcelJS from 'exceljs';

export const NEW_FILE_NAME = 'Testbrand Amazon Review Data.xlsx';
export const NEW_TAB = 'Amazon Orders';
export const NEW_HEADER = ['Reviewer Name', 'Order ID', 'Amount', 'Product Ordered', 'Order Screenshot', 'Delivery Screenshot', 'Review Screenshot', 'Review Link'];

const pad = (n) => String(n).padStart(2, '0');
export const newOrderId = (n) => `403-50000${pad(n)}-60000${pad(n)}`;
const drive = (what, n) => `https://drive.google.com/open?id=1TestNew${what}Row${pad(n)}abcdefgh`;

/** Each made-up row's review link: the kinds the newer files hold, and words instead of a link. */
export const NEW_REVIEW_LINKS = {
  1: 'https://www.amazon.in/gp/customer-reviews/R1TESTNEWROW1?ref=cm_cr_dp_d_rvw_ttl',
  2: 'https://www.amazon.in/portal/customer-reviews/srp/-/R1TESTCODE1/ref=cm_cr_srp_d_rvw_ttl',
  3: `https://www.amazon.in/gp/f.html?C=1TESTCAMPAIGN&K=2TESTKEY&R=3TESTR&T=C&U=${encodeURIComponent('https://business.amazon.in/abredir/review/R1TESTCODE2/ref=pe_00000_000000_test')}&H=TESTHASH`,
  4: 'https://www.amazon.in/portal/customer-reviews/B0TESTPRD1/ref=cm_cr_dp_d_show_all_btm?sortBy=recent',
  5: 'https://www.amazon.in/review/create-review/error?asin=B0TESTPRD1',
  6: 'https://www.amazon.in/review/review-your-purchases/error?ref=test',
  7: 'https://apps.apple.com/in/app/test-shopping/id0000000001',
  8: 'https://lh3.googleusercontent.com/TestPictureRow08',
  9: 'NA',
  10: 'N/A',
  11: 'The review is not posted yet',
};

/** The made-up rows: [reviewer, order ID, amount, product, order screenshot, delivery screenshot, review screenshot, review link]. Row 12 has only a purchase screenshot. */
export const NEW_ROWS = [
  ['Test Reviewer One', newOrderId(1), 349, 'Face Wash For Man - Amazon'],
  ['Test Reviewer Two', newOrderId(2), 499.5, 'Beard Oil - Amazon'],
  ['Test Reviewer Three', newOrderId(3), 299, 'Charcol Face Scrub - Amazon'],
  ['Test Reviewer Four', newOrderId(4), 1047, 'Face Wash For Man - Amazon, Beard Oil - Amazon, Hair Wax - Amazon'],
  ['Test Reviewer Five', newOrderId(5), 349, 'Face Wash For Man - Amazon'],
  ['Test Reviewer Six', newOrderId(6), 349, 'Face Wash For Man - Amazon'],
  ['Test Reviewer Seven', newOrderId(7), 249.75, 'Hair Wax - Amazon'],
  ['Test Reviewer Eight', newOrderId(8), 349, 'Face Wash For Man - Amazon'],
  ['Test Reviewer Nine', newOrderId(9), 499.5, 'Beard Oil - Amazon'],
  ['Test Reviewer Ten', newOrderId(10), 299, 'Charcol Face Scrub - Amazon'],
  ['Test Reviewer Eleven', newOrderId(11), 349, 'Face Wash For Man - Amazon'],
  ['Test Reviewer Twelve', newOrderId(12), 349, 'Face Wash For Man - Amazon'],
].map((r, i) => {
  const n = i + 1;
  if (n === 12) return [...r, drive('Order', n), '', '', ''];
  return [...r, drive('Order', n), drive('Delivery', n), drive('Review', n), NEW_REVIEW_LINKS[n]];
});

/** The made-up file: the "Amazon Orders" tab only, or with other tabs before it. Links are the cells' words, as in the newer files. */
export async function newLayoutBook({ tabs = [NEW_TAB], header = NEW_HEADER, rows = NEW_ROWS } = {}) {
  const wb = new ExcelJS.Workbook();
  for (const name of tabs) {
    const ws = wb.addWorksheet(name);
    if (name !== NEW_TAB) {
      ws.addRow(['Something else', 'Not orders']);
      continue;
    }
    ws.addRow(header);
    for (const r of rows) ws.addRow(r);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
