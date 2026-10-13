// Draws made-up Flipkart review screenshots, laid out the way Flipkart shows
// reviews, for the tests that read them with Tesseract on this computer.
// Made-up products, reviewers and words only; nothing is fetched: every
// request is refused, and no host name resolves.
// Run: node test/fixtures/flipkart/make-review-screenshots.mjs
//
//   review-app-list.png  a product's reviews in Flipkart's app: two reviews, each "★★★★★ 5.0 • Title", "Review for: …",
//                        the words, "Name, City", "7 Helpful" and "Verified Purchase · 3 days ago", under the phone's top bar
//   review-web-mine.png  the user's own reviews on Flipkart's website ("My Reviews"): the product's name, "5★ Title" in
//                        a green badge, the words, "Name ✓ Certified Buyer 12 Sep, 2026" and "Edit Delete Share"
//   review-app-mine-published.png  "My Reviews" in Flipkart's app with its Published tab open: both tab names on the blue
//                        tab bar, the yellow bar under "Published" just below it, "Product Reviews written by you..", then
//                        the product's name, the title, drawn stars with a light grey date, the words, "Delete" and "Edit"

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BOTTLE } from './make-purchase-screenshots.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The made-up reviewers. */
export const REVIEWER = 'Test Reviewer One';
export const OTHER_REVIEWER = 'Test Reviewer Two';
/** The made-up review's words. */
export const WORDS = 'Keeps water cold all day and the grip is good.';

const STYLE = `body { margin: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #212121; background: #fff; }
  .wrap { width: 440px; padding: 12px 16px 20px; }
  .bar { display: flex; justify-content: space-between; font-size: 14px; font-weight: 600; margin-bottom: 14px; }
  .head { font-size: 18px; font-weight: 600; margin-bottom: 14px; }
  .review { border-top: 1px solid #e0e0e0; padding: 14px 0; }
  .rate { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; }
  .stars { color: #26a541; letter-spacing: 1px; }
  .for { color: #878787; font-size: 14px; margin: 6px 0; }
  .words { font-size: 16px; line-height: 1.4; margin: 6px 0 10px; }
  .who { color: #212121; font-size: 15px; }
  .small { color: #878787; font-size: 14px; margin-top: 6px; }
  .badge { background: #c8e6c9; color: #1b5e20; border-radius: 3px; padding: 2px 8px; font-size: 16px; font-weight: 700; }
  .title { font-size: 16px; font-weight: 600; }
  .links { color: #2874f0; font-size: 14px; margin-top: 8px; display: flex; gap: 18px; }`;

function appList() {
  const review = (stars, n, title, words, who, helpful, days) => `<div class="review">
      <div class="rate"><span class="stars">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span><span>${n}</span><span>• ${title}</span></div>
      <div class="for">Review for: Colour Blue</div>
      <div class="words">${words}</div>
      <div class="who">${who}</div>
      <div class="small">👍 ${helpful} Helpful</div>
      <div class="small">✓ Verified Purchase · ${days} days ago</div>
    </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body><div class="wrap">
    <div class="bar"><span>9:41</span><span>4G 71%</span></div>
    <div class="head">&lt; Ratings and Reviews</div>
    ${review(5, '5.0', 'Wonderful', WORDS, `${REVIEWER}, Test City`, 7, 3)}
    ${review(4, '4.0', 'Nice product', 'The lid is a bit tight but it does not leak.', `${OTHER_REVIEWER}, Test Town`, 2, 9)}
  </div></body></html>`;
}

function webMine() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE} .wrap { width: 640px; }</style></head><body><div class="wrap">
    <div class="head">My Reviews (1)</div>
    <div class="review">
      <div class="small">${BOTTLE}</div>
      <div class="rate"><span class="badge">5 ★</span><span class="title">Terrific purchase</span></div>
      <div class="words">${WORDS}</div>
      <div class="small">${REVIEWER} ✓ Certified Buyer 12 Sep, 2026</div>
      <div class="links"><span>Edit</span><span>Delete</span><span>Share</span></div>
    </div>
  </div></body></html>`;
}

function appMinePublished() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}
    .wrap { width: 540px; padding: 0; background: #eeeeee; }
    .top { background: #fff; padding: 14px 16px; font-size: 20px; }
    .tabs { display: flex; background: #2874f0; color: #fff; font-size: 18px; }
    .tabs div, .under div { flex: 1; text-align: center; }
    .tabs div { padding: 14px 0; }
    .under { display: flex; height: 6px; }
    .open { background: #ffc200; }
    .yours { text-align: center; font-weight: 600; font-size: 18px; padding: 18px 0; }
    .card { background: #fff; margin: 0 10px 16px; padding: 14px; }
    .what { color: #878787; font-size: 13px; }
    .heading { font-size: 19px; margin: 6px 0; }
    .rated { display: flex; justify-content: space-between; align-items: center; }
    .drawn { color: #ffc200; font-size: 22px; }
    .when { color: #bdbdbd; font-size: 12px; }
    .acts { display: flex; border-top: 1px solid #eeeeee; font-size: 16px; }
    .acts div { flex: 1; text-align: center; padding: 12px; }</style></head><body><div class="wrap">
    <div class="top">&lt; My Reviews</div>
    <div class="tabs"><div>Pending</div><div>Published</div></div>
    <div class="under"><div></div><div class="open"></div></div>
    <div class="yours">Product Reviews written by you..</div>
    <div class="card">
      <div class="what">${BOTTLE}</div>
      <div class="heading">Terrific purchase</div>
      <div class="rated"><span class="drawn">★★★★☆</span><span class="when">12 Sep 2026</span></div>
      <div class="words">${WORDS}</div>
      <div class="acts"><div style="color:#878787">Delete</div><div>Edit</div></div>
    </div>
  </div></body></html>`;
}

/** Draws the pictures; `only`, a file's name, draws that one alone, leaving the others as they are. */
export async function makeReviewScreenshots(only = null) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
  try {
    const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 700, height: 1000 } });
    await context.route('**/*', (r) => r.abort());
    const p = await context.newPage();
    for (const [file, html] of [['review-app-list.png', appList()], ['review-web-mine.png', webMine()], ['review-app-mine-published.png', appMinePublished()]].filter(([f]) => !only || f === only)) {
      await p.setContent(html);
      await p.locator('.wrap').screenshot({ path: join(HERE, file) });
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await makeReviewScreenshots(process.argv[2] ?? null);
  console.log('written');
}
