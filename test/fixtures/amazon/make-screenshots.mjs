// Draws the screenshot fixtures: a made-up review laid out the way Amazon's
// desktop review page shows one. Run: node test/fixtures/amazon/make-screenshots.mjs
// Nothing is fetched: every request is refused.

import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));

function star(filled) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 9 : 4.2;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(10 + r * Math.cos(a)).toFixed(2)},${(10 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<svg width="20" height="20" viewBox="0 0 20 20"><polygon points="${pts.join(' ')}" fill="${filled ? '#FFA41C' : '#E7E9EC'}" stroke="${filled ? '#DE7921' : '#B7B7B7'}" stroke-width="0.8"/></svg>`;
}

function page({ name, stars, title, date, body, product, hindi = false }) {
  const row = Array.from({ length: 5 }, (_, i) => star(i < stars)).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; background: #fff; color: #0F1111; font-family: Arial, Helvetica, sans-serif; }
    .wrap { width: 860px; padding: 28px 32px; }
    .product { font-size: 22px; margin-bottom: 18px; }
    h3 { font-size: 20px; margin: 0 0 14px; }
    .profile { display: flex; align-items: center; gap: 10px; font-size: 15px; margin-bottom: 8px; }
    .avatar { width: 34px; height: 34px; border-radius: 50%; background: #D5D9D9; }
    .titlerow { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; }
    .stars { display: inline-flex; gap: 1px; }
    .date { color: #565959; font-size: 15px; margin: 6px 0 4px; }
    .strip { font-size: 13px; color: #565959; margin-bottom: 10px; }
    .vp { color: #C45500; font-weight: 700; }
    .body { font-size: 15px; line-height: 22px; max-width: 760px; ${hindi ? "font-family: 'Kohinoor Devanagari', 'Devanagari Sangam MN', 'ITF Devanagari', sans-serif;" : ''} }
    .help { color: #565959; font-size: 13px; margin-top: 14px; }
  </style></head><body><div class="wrap">
    <div class="product">${product}</div>
    <h3>Customer Review</h3>
    <div class="profile"><span class="avatar"></span><span>${name}</span></div>
    <div class="titlerow"><span class="stars">${row}</span><span>${title}</span></div>
    <div class="date">${date}</div>
    <div class="strip">Colour: Grey | <span class="vp">Verified Purchase</span></div>
    <div class="body">${body}</div>
    <div class="help">2 people found this helpful</div>
    <div class="help">Helpful | Report</div>
  </div></body></html>`;
}

const REVIEW = {
  name: 'Asha R Verma',
  stars: 4,
  title: 'Folds flat and holds a lot',
  date: 'Reviewed in India on 12 August 2026',
  product: 'Test Brand Folding Garment Rack with Wheels',
  body: 'The rack folds flat in seconds and holds a full load of winter clothes.<br>The wheels lock firmly and the zircon grey finish has not chipped after a month of daily use.',
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 924, height: 520 } });
  await context.route('**/*', (r) => r.abort());
  const p = await context.newPage();

  const draw = async (spec, file) => {
    await p.setContent(page(spec));
    await p.locator('.wrap').screenshot({ path: join(HERE, file) });
  };
  await draw(REVIEW, 'screenshot-review.png');
  await draw({ ...REVIEW, stars: 2 }, 'screenshot-two-stars.png');
  await draw(
    {
      ...REVIEW,
      title: 'मुड़ जाता है और बहुत जगह है',
      body: 'यह रैक कुछ ही सेकंड में मुड़ जाता है और सर्दियों के पूरे कपड़े रखता है।<br>पहिये मज़बूती से रुकते हैं और एक महीने बाद भी रंग नहीं उतरा।',
      hindi: true,
    },
    'screenshot-hindi.png',
  );

  // The same review saved again as a JPEG: a different file that is the same picture.
  const jpeg = await p.evaluate(async (dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * 0.8);
    c.height = Math.round(img.naturalHeight * 0.8);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  }, `data:image/png;base64,${readFileSync(join(HERE, 'screenshot-review.png')).toString('base64')}`);
  await writeFile(join(HERE, 'screenshot-review-again.jpg'), Buffer.from(jpeg, 'base64'));

  // Noise: nothing a person could read.
  const noise = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 400;
    const g = c.getContext('2d');
    const d = g.createImageData(c.width, c.height);
    let x = 12345;
    for (let i = 0; i < d.data.length; i += 4) {
      x = (x * 1103515245 + 12345) % 2147483648;
      const v = x % 256;
      d.data[i] = v;
      d.data[i + 1] = (v * 7) % 256;
      d.data[i + 2] = (v * 13) % 256;
      d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  });
  await writeFile(join(HERE, 'screenshot-noise.png'), Buffer.from(noise, 'base64'));
} finally {
  await browser.close();
}
console.log('drawn');
