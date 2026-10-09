// Makes the made-up PDF used by the tests: two pages, as a screenshot saved
// as a PDF might be (a purchase page, then a delivery page), drawn by a
// hidden Chrome whose every address is refused. Made-up words only.
// Run: node test/fixtures/amazon/make-pdf.mjs
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { FLOOR, ORDER_ID } from './make-order-screenshots.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
const page = await browser.newPage();
await page.setContent(`<html><body style="font: 26px Arial, sans-serif; margin: 40px">
<div style="height: 900px"><h2>Order details</h2><p>Order date 20 July 2026</p><p>Order # ${ORDER_ID}</p><p>Order total ₹654.00</p><p>${FLOOR}</p></div>
<div style="page-break-before: always; height: 900px"><h2>Your Orders</h2><p>Delivered 22 July</p><p>Order # ${ORDER_ID}</p><p>${FLOOR}</p></div>
</body></html>`);
await page.pdf({ path: join(here, 'order-two-pages.pdf'), format: 'A4' });
await browser.close();
console.log('made order-two-pages.pdf');
