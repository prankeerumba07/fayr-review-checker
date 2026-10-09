// Draws the delivery screenshot fixtures: a made-up order laid out the way
// Amazon India's "Your Orders" page shows one.
// Run: node test/fixtures/amazon/make-delivery-screenshots.mjs
// Nothing is fetched: every request is refused, and no host name resolves.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));

function page({ status, product }) {
  const name = product ? `<div class="name">${product}</div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; background: #fff; color: #0F1111; font-family: Arial, Helvetica, sans-serif; }
    .wrap { width: 820px; padding: 24px 28px; }
    h1 { font-size: 26px; font-weight: 400; margin: 0 0 16px; }
    .box { border: 1px solid #D5D9D9; border-radius: 8px; }
    .head { background: #F0F2F2; padding: 12px 16px; font-size: 13px; color: #565959; display: flex; gap: 40px; border-bottom: 1px solid #D5D9D9; }
    .body { padding: 16px; }
    .status { font-size: 18px; font-weight: 700; color: ${status.startsWith('Delivered') ? '#007600' : '#0F1111'}; }
    .sub { font-size: 14px; margin: 4px 0 14px; }
    .item { display: flex; gap: 16px; }
    .pic { width: 90px; height: 90px; background: #D5D9D9; border-radius: 4px; flex: none; }
    .name { font-size: 16px; color: #007185; line-height: 22px; }
    .seller { font-size: 13px; color: #565959; margin-top: 6px; }
    .price { font-size: 14px; color: #B12704; margin-top: 4px; }
    .ret { font-size: 13px; color: #565959; margin-top: 6px; }
    .buttons { display: flex; flex-direction: column; gap: 8px; margin-left: auto; }
    .btn { border: 1px solid #D5D9D9; border-radius: 8px; padding: 6px 14px; font-size: 13px; text-align: center; }
  </style></head><body><div class="wrap">
    <h1>Your Orders</h1>
    <div class="box">
      <div class="head"><span>ORDER PLACED<br>28 February 2026</span><span>TOTAL<br>₹1,299.00</span><span>Order # 407-1234567-1234567</span></div>
      <div class="body">
        <div class="status">${status}</div>
        <div class="sub">Package was handed to resident</div>
        <div class="item">
          <div class="pic"></div>
          <div>
            ${name}
            <div class="seller">Sold by: Test Seller</div>
            <div class="price">₹1,299.00</div>
            <div class="ret">Return window closed on 13 March</div>
          </div>
          <div class="buttons"><span class="btn">Track package</span><span class="btn">Write a product review</span><span class="btn">Buy it again</span></div>
        </div>
      </div>
    </div>
  </div></body></html>`;
}

const RACK = 'Test Brand Folding Garment Rack<br>with Wheels';
const BOTTLE = 'Test Brand Insulated Steel Water Bottle,<br>1 Litre, Black';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
try {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 880, height: 520 } });
  await context.route('**/*', (r) => r.abort());
  const p = await context.newPage();
  const draw = async (spec, file) => {
    await p.setContent(page(spec));
    await p.locator('.wrap').screenshot({ path: join(HERE, file) });
  };
  await draw({ status: 'Delivered 3 March', product: RACK }, 'delivery-clear.png');
  await draw({ status: 'Delivered 3 March', product: null }, 'delivery-no-product.png');
  await draw({ status: 'Delivered 3 March', product: BOTTLE }, 'delivery-other-product.png');
  await draw({ status: 'Arriving tomorrow', product: RACK }, 'delivery-arriving.png');
} finally {
  await browser.close();
}
