// Draws the pictures for the orders sheet: made-up orders, made-up products,
// laid out the way Amazon India shows them. Nothing is fetched: every request
// is refused, and no host name resolves.
// Run: node test/fixtures/amazon/make-order-screenshots.mjs
//
//   order-floor-cleaner.png     the order's details: order ID, order date, amounts, product
//   delivery-floor-cleaner.png  "Delivered", with the same order ID and product
//   delivery-other-order.png    "Delivered", the same product, a different order ID
//   review-rating-only.png      "Thanks for rating": four stars and no written words
//   review-refused.png          Amazon refusing a review
//   review-written-floor.png    a written review, as Amazon shows it

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));

export const FLOOR = 'Test Brand Floor Cleaner Liquid, Lavender, 1 Litre';
export const STAIN = 'Test Brand Stain Remover Spray, 500 ml';
export const KIT = 'Test Brand Home Cleaning Kit, 6 Pieces';
export const ORDER_ID = '403-1000002-2000002';
export const OTHER_ORDER_ID = '403-9999999-8888888';
export const WRITTEN = {
  name: 'Test Reviewer Two',
  title: 'Leaves the floor squeaky clean',
  date: 'Reviewed in India on 25 July 2026',
  body: 'The smell is mild and the floor dries quickly without any streaks. One capful in a bucket and the marble looks polished.',
};

function star(filled, size = 20) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 9 : 4.2;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(10 + r * Math.cos(a)).toFixed(2)},${(10 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20"><polygon points="${pts.join(' ')}" fill="${filled ? '#FFA41C' : '#FFFFFF'}" stroke="${filled ? '#DE7921' : '#B7B7B7'}" stroke-width="0.8"/></svg>`;
}
const stars = (n, size) => Array.from({ length: 5 }, (_, i) => star(i < n, size)).join('');

const BASE = `body { margin: 0; background: #fff; color: #0F1111; font-family: Arial, Helvetica, sans-serif; }`;

function orderDetails() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
    .wrap { width: 430px; padding: 18px 20px; }
    h1 { font-size: 22px; margin: 0 0 14px; }
    .box { border: 1px solid #D5D9D9; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; font-size: 15px; line-height: 26px; }
    .row { display: flex; justify-content: space-between; }
    .k { color: #565959; }
    h2 { font-size: 18px; margin: 0 0 8px; }
    .ok { color: #007600; font-weight: 700; font-size: 17px; }
    .item { display: flex; gap: 12px; margin-top: 8px; }
    .pic { width: 70px; height: 70px; background: #D5D9D9; border-radius: 4px; flex: none; }
    .name { color: #007185; font-size: 15px; line-height: 21px; }
    .small { color: #565959; font-size: 13px; }
  </style></head><body><div class="wrap">
    <h1>Order Details</h1>
    <div class="box">
      <div class="row"><span class="k">Order date</span><span>20 July 2026</span></div>
      <div class="row"><span class="k">Order #</span><span>${ORDER_ID}</span></div>
      <div class="row"><span class="k">Order total</span><span>₹654.00 (1 item)</span></div>
    </div>
    <h2>Shipment details</h2>
    <div class="box">
      <div class="ok">Delivered 22 July</div>
      <div class="item"><div class="pic"></div><div><div class="name">${FLOOR}</div><div class="small">Sold by: Test Seller</div><div>₹654.00</div></div></div>
    </div>
    <h2>Payment information</h2>
    <div class="box"><div class="k">Payment method</div><div>Pay on Delivery</div></div>
    <h2>Order Summary</h2>
    <div class="box">
      <div class="row"><span>Item(s) Subtotal:</span><span>₹654.00</span></div>
      <div class="row"><span>Shipping:</span><span>₹0.00</span></div>
      <div class="row"><span><b>Grand Total:</b></span><span><b>₹654.00</b></span></div>
    </div>
  </div></body></html>`;
}

function delivery({ orderId }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
    .wrap { width: 820px; padding: 24px 28px; }
    h1 { font-size: 26px; font-weight: 400; margin: 0 0 16px; }
    .box { border: 1px solid #D5D9D9; border-radius: 8px; }
    .head { background: #F0F2F2; padding: 12px 16px; font-size: 13px; color: #565959; display: flex; gap: 40px; border-bottom: 1px solid #D5D9D9; }
    .body { padding: 16px; }
    .status { font-size: 18px; font-weight: 700; color: #007600; }
    .sub { font-size: 14px; margin: 4px 0 14px; }
    .item { display: flex; gap: 16px; }
    .pic { width: 90px; height: 90px; background: #D5D9D9; border-radius: 4px; flex: none; }
    .name { font-size: 16px; color: #007185; line-height: 22px; }
    .seller { font-size: 13px; color: #565959; margin-top: 6px; }
    .buttons { display: flex; flex-direction: column; gap: 8px; margin-left: auto; }
    .btn { border: 1px solid #D5D9D9; border-radius: 8px; padding: 6px 14px; font-size: 13px; text-align: center; }
  </style></head><body><div class="wrap">
    <h1>Your Orders</h1>
    <div class="box">
      <div class="head"><span>ORDER PLACED<br>20 July 2026</span><span>TOTAL<br>₹654.00</span><span>Order # ${orderId}</span></div>
      <div class="body">
        <div class="status">Delivered 22 July</div>
        <div class="sub">Package was handed to resident</div>
        <div class="item">
          <div class="pic"></div>
          <div><div class="name">Test Brand Floor Cleaner Liquid,<br>Lavender, 1 Litre</div><div class="seller">Sold by: Test Seller</div></div>
          <div class="buttons"><span class="btn">Track package</span><span class="btn">Write a product review</span></div>
        </div>
      </div>
    </div>
  </div></body></html>`;
}

function ratingOnly() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
    .wrap { width: 430px; padding: 22px 20px; text-align: center; }
    .pic { width: 90px; height: 90px; background: #D5D9D9; border-radius: 4px; margin: 0 auto 12px; }
    .name { font-size: 16px; line-height: 22px; margin-bottom: 14px; }
    .stars { display: inline-flex; gap: 6px; margin-bottom: 16px; }
    h2 { font-size: 21px; margin: 0 0 6px; }
    .sub { color: #565959; font-size: 15px; margin-bottom: 18px; }
    .btn { border: 1px solid #D5D9D9; border-radius: 20px; padding: 9px 14px; font-size: 15px; margin: 8px 0; }
  </style></head><body><div class="wrap">
    <div class="pic"></div>
    <div class="name">${STAIN}</div>
    <div class="stars">${stars(4, 34)}</div>
    <h2>Thanks for rating!</h2>
    <div class="sub">Your rating has been submitted.</div>
    <div class="btn">Write a review</div>
    <div class="btn">Add a photo or video</div>
  </div></body></html>`;
}

function refused() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
    .wrap { width: 640px; padding: 22px 26px; }
    h1 { font-size: 24px; font-weight: 400; margin: 0 0 14px; }
    .item { display: flex; gap: 14px; align-items: center; margin-bottom: 14px; }
    .pic { width: 70px; height: 70px; background: #D5D9D9; border-radius: 4px; flex: none; }
    .name { font-size: 16px; }
    .alert { border: 2px solid #C40000; border-radius: 8px; padding: 14px 16px; font-size: 15px; line-height: 22px; }
    .alert b { color: #C40000; display: block; margin-bottom: 6px; font-size: 16px; }
  </style></head><body><div class="wrap">
    <h1>Create Review</h1>
    <div class="item"><div class="pic"></div><div class="name">${KIT}</div></div>
    <div class="alert"><b>Sorry, we are unable to accept your review of this product</b>We apologize but this account has not met the minimum eligibility requirements to write a review. If you would like to learn more about our eligibility criteria, please see our community guidelines.</div>
  </div></body></html>`;
}

function written() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
    .wrap { width: 860px; padding: 28px 32px; }
    .product { font-size: 22px; margin-bottom: 18px; }
    h3 { font-size: 20px; margin: 0 0 14px; }
    .profile { display: flex; align-items: center; gap: 10px; font-size: 15px; margin-bottom: 8px; }
    .avatar { width: 34px; height: 34px; border-radius: 50%; background: #D5D9D9; }
    .titlerow { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; }
    .stars { display: inline-flex; gap: 1px; }
    .date { color: #565959; font-size: 15px; margin: 6px 0 4px; }
    .strip { font-size: 13px; color: #C45500; font-weight: 700; margin-bottom: 10px; }
    .body { font-size: 15px; line-height: 22px; max-width: 760px; }
    .help { color: #565959; font-size: 13px; margin-top: 14px; }
  </style></head><body><div class="wrap">
    <div class="product">${FLOOR}</div>
    <h3>Customer Review</h3>
    <div class="profile"><span class="avatar"></span><span>${WRITTEN.name}</span></div>
    <div class="titlerow"><span class="stars">${stars(5)}</span><span>${WRITTEN.title}</span></div>
    <div class="date">${WRITTEN.date}</div>
    <div class="strip">Verified Purchase</div>
    <div class="body">${WRITTEN.body}</div>
    <div class="help">Helpful | Report</div>
  </div></body></html>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
  try {
    const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 924, height: 520 } });
    await context.route('**/*', (r) => r.abort());
    const p = await context.newPage();
    const draw = async (html, file) => {
      await p.setContent(html);
      await p.locator('.wrap').screenshot({ path: join(HERE, file) });
    };
    await draw(orderDetails(), 'order-floor-cleaner.png');
    await draw(delivery({ orderId: ORDER_ID }), 'delivery-floor-cleaner.png');
    await draw(delivery({ orderId: OTHER_ORDER_ID }), 'delivery-other-order.png');
    await draw(ratingOnly(), 'review-rating-only.png');
    await draw(refused(), 'review-refused.png');
    await draw(written(), 'review-written-floor.png');
  } finally {
    await browser.close();
  }
  console.log('drawn');
}
