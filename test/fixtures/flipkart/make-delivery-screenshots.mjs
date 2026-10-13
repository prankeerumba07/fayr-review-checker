// Draws made-up Flipkart delivery screenshots, laid out the way Flipkart's
// app shows a delivered order, for the tests that read them with Tesseract on
// this computer. Made-up orders, products, names and amounts only; nothing is
// fetched: every request is refused, and no host name resolves.
// Run: node test/fixtures/flipkart/make-delivery-screenshots.mjs
//
//   delivery-steel-bottle.png       row 1's order, delivered: "Delivered, Thu 23rd Jul" with its marks, "Return policy ended on
//                                   …", "How was your delivery experience?", its order ID in small light grey letters, a dark
//                                   advert, and the delivery details naming a made-up person ("Delivered to Test Person at Home")
//   delivery-lunch-box-minutes.png  row 2's order, a quick delivery: "Arrived in just 12 minutes!" and "Delivered before time"
//                                   in white on a coloured card, and the item's own price beside the product, with no total

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { orderId } from './make-flipkart.mjs';
import { BASE, BOTTLE, LUNCH_BOX } from './make-purchase-screenshots.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The made-up person the delivery details name; never kept by the reading. */
export const PERSON = 'Test Person';

const MORE = `.light-id { color: #9e9e9e; font-size: 12px; margin: 6px 0 12px; display: flex; align-items: center; gap: 6px; }
  .copy { width: 12px; height: 12px; border: 2px solid #2a55e5; border-radius: 3px; box-sizing: border-box; }
  .done { font-size: 19px; font-weight: 700; color: #26a541; display: flex; align-items: center; gap: 8px; }
  .tick { width: 20px; height: 20px; border-radius: 10px; background: #26a541; flex: none; }
  .note { color: #878787; font-size: 14px; }
  .dark { height: 130px; border-radius: 10px; padding: 18px; margin-bottom: 12px; font-weight: 800; background: #0c2a7a; color: #fff; font-size: 24px; }
  .quick { border-radius: 10px; padding: 20px 18px; margin-bottom: 12px; background: #b0124f; color: #fff; }
  .quick .small-white { font-size: 15px; }
  .quick .big-white { font-size: 24px; font-weight: 700; margin: 4px 0 12px; }
  .quick .early { font-size: 15px; font-style: italic; }
  .price { margin-left: auto; text-align: right; font-size: 16px; }`;

function bottle() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}\n${MORE}</style></head><body><div class="wrap">
    <div class="top"><span>&lt; Order Details</span><span class="help">Help</span></div>
    <div class="item"><div class="pic"></div><div><div class="name">${BOTTLE}</div><div class="small">Blue</div></div></div>
    <div class="light-id"><span>Order #${orderId(2)}</span><span class="copy"></span></div>
    <div class="box"><div class="done"><span class="tick"></span>Delivered, Thu 23rd Jul</div><div class="note">ⓘ Return policy ended on Thu 30th Jul</div></div>
    <h2>Rate your experience</h2>
    <div class="box">How was your delivery experience? &gt;</div>
    <div class="dark">Get test credit in minutes</div>
    <h2>Delivery details</h2>
    <div class="box"><div>Home Test Street 1, Test Town</div><div>Delivered to ${PERSON} at Home</div></div>
  </div></body></html>`;
}

function lunchBox() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}\n${MORE}</style></head><body><div class="wrap">
    <div class="top"><span>&lt; Order Details</span><span class="help">Help</span></div>
    <div class="id">Order #${orderId(3)}</div>
    <div class="small">Placed on 21st Jul 2026</div>
    <div class="quick"><div class="small-white">Arrived in just</div><div class="big-white">12 minutes!</div><div class="early">⚡ Delivered before time</div></div>
    <div class="item"><div class="pic"></div><div><div class="name">${LUNCH_BOX}</div><div class="small">1 x Green</div></div><div class="price">₹449<div class="strike">₹1,299</div></div></div>
    <h2>Rate your experience</h2>
    <div class="box">Add a photo or a video</div>
  </div></body></html>`;
}

export async function makeDeliveryScreenshots() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
  try {
    const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 470, height: 1000 } });
    await context.route('**/*', (r) => r.abort());
    const p = await context.newPage();
    for (const [file, html] of [['delivery-steel-bottle.png', bottle()], ['delivery-lunch-box-minutes.png', lunchBox()]]) {
      await p.setContent(html);
      await p.locator('.wrap').screenshot({ path: join(HERE, file) });
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await makeDeliveryScreenshots();
  console.log('written');
}
