// Draws made-up Flipkart purchase screenshots, laid out the way Flipkart's
// app shows an order's details, for the tests that read them with Tesseract
// on this computer. Made-up orders, products and amounts only; nothing is
// fetched: every request is refused, and no host name resolves.
// Run: node test/fixtures/flipkart/make-purchase-screenshots.mjs
//
//   purchase-steel-bottle.png      row 1's order: its order ID, the day it was placed, the price details
//                                  (Listing price, Selling price, Total fees, Other discount, Total amount),
//                                  an offer and an advert with prices of their own
//   purchase-lunch-box-coins.png   row 2's order, paid partly with SuperCoins: "Total amount ₹449 + 50"
//   purchase-light-order-id.png    the order on row 6 of flipkart-orders.xlsx, its order ID in small light grey letters with a copy mark after it,
//                                  as Flipkart's app writes it under the product's name, and dark adverts below:
//                                  Tesseract's usual way drops those letters; its way for light letters keeps them

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { orderId } from './make-flipkart.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export const BOTTLE = 'Test Brand Steel Bottle 1 L, Blue';
export const LUNCH_BOX = 'Test Brand Lunch Box 3 Containers, Green';

const BASE = `body { margin: 0; background: #fff; color: #212121; font-family: Arial, Helvetica, sans-serif; }
  .wrap { width: 430px; padding: 14px 16px 18px; }
  .top { display: flex; justify-content: space-between; font-size: 19px; font-weight: 700; margin-bottom: 14px; }
  .help { font-size: 15px; font-weight: 400; border: 1px solid #ccc; border-radius: 6px; padding: 2px 10px; }
  .item { display: flex; gap: 12px; margin-bottom: 10px; }
  .pic { width: 64px; height: 64px; background: #e0e0e0; border-radius: 4px; flex: none; }
  .name { font-size: 16px; line-height: 22px; }
  .small { color: #878787; font-size: 14px; }
  .id { color: #878787; font-size: 14px; margin: 6px 0 12px; }
  .box { border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 15px; line-height: 24px; }
  .ok { font-weight: 700; color: #26a541; }
  .ad { background: #2a55e5; color: #fff; border-radius: 8px; padding: 12px; margin-bottom: 12px; font-size: 18px; font-weight: 700; }
  h2 { font-size: 17px; margin: 0 0 8px; }
  .row { display: flex; justify-content: space-between; }
  .strike { text-decoration: line-through; color: #878787; }
  .green { color: #26a541; }
  .total { font-weight: 700; border-top: 1px dashed #ccc; margin-top: 4px; padding-top: 4px; }
  .coin { display: inline-block; width: 14px; height: 14px; border-radius: 7px; background: #f5c518; vertical-align: -2px; margin: 0 2px; }`;

function bottle() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}</style></head><body><div class="wrap">
    <div class="top"><span>&lt; Order Details</span><span class="help">Help</span></div>
    <div class="item"><div class="pic"></div><div><div class="name">${BOTTLE}</div><div class="small">Blue</div><div>₹349</div></div></div>
    <div class="id">Order #${orderId(2)}</div>
    <div class="box"><div class="ok">Order Confirmed</div><div>Your Order has been placed, Mon 20th Jul</div><div>Delivery by Thu 23rd Jul</div></div>
    <div class="box">Get ₹1,000 off on the Test Bank card</div>
    <div class="ad">Test Phone 9 at ₹9,999*</div>
    <h2>Price details</h2>
    <div class="box">
      <div class="row"><span>Listing price</span><span class="strike">₹999</span></div>
      <div class="row"><span>Selling price ⓘ</span><span>₹329</span></div>
      <div class="row"><span>Total fees ⌄</span><span>₹30</span></div>
      <div class="row"><span>Other discount ⌄</span><span class="green">−₹10</span></div>
      <div class="row total"><span>Total amount</span><span>₹349</span></div>
      <div class="small">Paid by UPI</div>
    </div>
  </div></body></html>`;
}

function lunchBox() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}</style></head><body><div class="wrap">
    <div class="top"><span>&lt; Order Details</span><span class="help">Help</span></div>
    <div class="item"><div class="pic"></div><div><div class="name">${LUNCH_BOX}</div><div class="small">Green</div></div></div>
    <div class="id">Order #${orderId(3)}</div>
    <div class="box"><div class="ok">Order Confirmed</div><div>Your Order has been placed, Tue 21st Jul</div></div>
    <h2>Price details</h2>
    <div class="box">
      <div class="row"><span>Listing price</span><span class="strike">₹1,299</span></div>
      <div class="row"><span>Special price ⓘ</span><span>₹489</span></div>
      <div class="row"><span>Total fees ⌄</span><span>₹10</span></div>
      <div class="row total"><span>Total amount</span><span>₹449 + <span class="coin"></span>50</span></div>
      <div class="small">Paid by UPI, SuperCoins</div>
    </div>
  </div></body></html>`;
}

function lightOrderId() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
  .light-id { color: #9e9e9e; font-size: 12px; margin: 6px 0 12px; display: flex; align-items: center; gap: 6px; }
  .copy { width: 12px; height: 12px; border: 2px solid #2a55e5; border-radius: 3px; box-sizing: border-box; }
  .dark { height: 150px; border-radius: 10px; padding: 18px; margin-bottom: 12px; font-weight: 800; }
  .veg { background: #9b0a4d; color: #ffe000; font-size: 30px; }
  .credit { background: #0c2a7a; color: #fff; font-size: 24px; }</style></head><body><div class="wrap">
    <div class="top"><span>&lt; Order Details</span><span class="help">Help</span></div>
    <div class="item"><div class="pic"></div><div><div class="name">${LUNCH_BOX}</div><div class="small">Green</div></div></div>
    <div class="light-id"><span>Order #${orderId(6)}</span><span class="copy"></span></div>
    <div class="box"><div class="ok">Order Confirmed</div><div>Your Order has been placed.</div></div>
    <div class="box">Delivery Executive details will be available once the order is out for delivery</div>
    <div class="dark veg">Test Veggies, fresh every day</div>
    <div class="dark credit">Get test credit in minutes</div>
  </div></body></html>`;
}

export async function makePurchaseScreenshots() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
  try {
    const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 470, height: 900 } });
    await context.route('**/*', (r) => r.abort());
    const p = await context.newPage();
    for (const [file, html] of [['purchase-steel-bottle.png', bottle()], ['purchase-lunch-box-coins.png', lunchBox()], ['purchase-light-order-id.png', lightOrderId()]]) {
      await p.setContent(html);
      await p.locator('.wrap').screenshot({ path: join(HERE, file) });
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await makePurchaseScreenshots();
  console.log('written');
}
