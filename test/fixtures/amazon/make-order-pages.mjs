// Writes the saved Amazon pages for the orders sheet: hand-written in
// Amazon's own markup (its data-hook names), with made-up reviews, ids,
// names and ASINs. Run: node test/fixtures/amazon/make-order-pages.mjs
//
//   review-floor-cleaner.html   a written review (R1TESTROW02ABC)
//   review-stars-only.html      a review with stars only, no written words (R1TESTROW03ABC)
//   review-gone.html            a review that no longer exists
//   short-link-landing.html     the page a short link lands on: a written review (R1TESTROW07ABC)
//   product-floor-cleaner.html  the product's page, with its sizes and "See all reviews"
//   see-all-floor-cleaner.html  "See all reviews": the first page, without those reviews
//   search-floor-cleaner.html   a search under "See all reviews" that finds them

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WRITTEN, FLOOR, KIT } from './make-order-screenshots.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const FLOOR_ASIN = 'B0TESTFLR1';
export const FLOOR_SIZES = ['B0TESTFLR1', 'B0TESTFLR2'];
export const KIT_ASIN = 'B0TESTKIT1';
export const REVIEWS = {
  R1TESTROW02ABC: { name: 'Test Reviewer One', stars: 5, title: 'Cleans tiles without a sticky film', date: 'Reviewed in India on 24 July 2026', body: 'One capful cleans the whole kitchen floor and leaves no sticky film on the vitrified tiles. The bottle has lasted a month.', asin: FLOOR_ASIN },
  R1TESTROW03ABC: { name: 'Test Reviewer Three', stars: 4, title: '', date: 'Reviewed in India on 23 July 2026', body: '', asin: KIT_ASIN },
  R1TESTROW07ABC: { name: 'Test Reviewer Seven', stars: 5, title: 'Fresh smell', date: 'Reviewed in India on 22 July 2026', body: 'Mopping with this leaves a fresh smell and the grout between the tiles looks brighter.', asin: FLOOR_ASIN },
  R1TESTPICREV1: { name: WRITTEN.name, stars: 5, title: WRITTEN.title, date: WRITTEN.date, body: WRITTEN.body, asin: FLOOR_ASIN },
};

const HEAD = (title) => `<!doctype html>
<html lang="en-in"><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body>
<header id="navbar"><a href="/" aria-label="Amazon.in">amazon.in</a> <span id="nav-link-accountList-nav-line-1">Hello, Test Staff</span> <span>Account &amp; Lists</span></header>
`;

function block(id, r, { asItem = false } = {}) {
  const stars = `<a class="a-link-normal" title="${r.stars}.0 out of 5 stars" href="/gp/customer-reviews/${id}/ref=cm_cr_arp_d_rvw_ttl?ie=UTF8&amp;ASIN=${r.asin}"><i data-hook="review-star-rating" class="a-icon a-icon-star a-star-${r.stars} review-rating"><span class="a-icon-alt">${r.stars}.0 out of 5 stars</span></i></a>`;
  const title = r.title ? `<span class="a-letter-space"></span><a data-hook="review-title" class="a-size-base a-link-normal review-title a-color-base review-title-content a-text-bold" href="/gp/customer-reviews/${id}/ref=cm_cr_arp_d_rvw_ttl?ie=UTF8&amp;ASIN=${r.asin}"><span>${esc(r.title)}</span></a>` : '';
  const body = r.body
    ? `<div class="a-row a-spacing-small review-data"><span data-hook="review-body" class="a-size-base review-text review-text-content"><div data-hook="review-collapsed" aria-expanded="false" class="a-expander-content reviewText review-text-content a-expander-partial-collapse-content"><span>${esc(r.body)}</span></div></span></div>`
    : '';
  const inner = `<div id="customer_review-${id}" class="a-section celwidget">
  <div data-hook="genome-widget" class="a-row a-spacing-mini"><a href="/gp/profile/amzn1.account.TEST${id.slice(-6)}/ref=cm_cr_arp_d_gw_btm?ie=UTF8" class="a-profile" data-a-size="small"><div aria-hidden="true" class="a-profile-avatar-wrapper"><div class="a-profile-avatar"><img src="https://m.media-amazon.com/images/S/amazon-avatars-global/default.png" alt=""></div></div><div class="a-profile-content"><span class="a-profile-name">${esc(r.name)}</span></div></a></div>
  <div class="a-row">${stars}${title}</div>
  <span data-hook="review-date" class="a-size-base a-color-secondary review-date">${esc(r.date)}</span>
  <div class="a-row a-spacing-mini review-data review-format-strip"><span data-hook="avp-badge-linkless" class="a-size-mini a-color-state a-text-bold">Verified Purchase</span></div>
  ${body}
</div>`;
  return asItem ? `<li id="${id}" data-hook="review" class="review aok-relative">${inner}</li>` : inner;
}

function reviewPage(id, productTitle) {
  const r = REVIEWS[id];
  return `${HEAD(`Amazon.in:Customer reviews: ${productTitle}`)}<div id="cm_cr-product_info" class="a-section">
  <div class="a-row product-title"><h1 class="a-size-large a-text-ellipsis"><a data-hook="product-link" class="a-link-normal" href="/Test-Brand-Product/dp/${r.asin}/ref=cm_cr_arp_d_product_top?ie=UTF8">${esc(productTitle)}</a></h1></div>
</div>
<div id="cm_cr-review_list" class="a-section a-spacing-none review-views celwidget">
<h3 class="a-spacing-medium">Customer Review</h3>
${block(id, r)}
</div>
</body></html>
`;
}

function listPage(ids, productTitle) {
  return `${HEAD(`Amazon.in:Customer reviews: ${productTitle}`)}<div id="cm_cr-review_list" class="a-section a-spacing-none review-views celwidget"><ul>
${ids.map((id) => block(id, REVIEWS[id], { asItem: true })).join('\n')}
</ul></div>
</body></html>
`;
}

const OTHER = {
  R3TESTFLOORA1: { name: 'Test Shopper A', stars: 4, title: 'Good', date: 'Reviewed in India on 2 July 2026', body: 'Works as expected for daily cleaning.', asin: FLOOR_ASIN },
  R3TESTFLOORB2: { name: 'Test Shopper B', stars: 3, title: 'Strong smell', date: 'Reviewed in India on 1 July 2026', body: 'The smell is too strong for me.', asin: FLOOR_ASIN },
};
Object.assign(REVIEWS, OTHER);

export const PAGES = {
  'review-floor-cleaner.html': () => reviewPage('R1TESTROW02ABC', FLOOR),
  'review-stars-only.html': () => reviewPage('R1TESTROW03ABC', KIT),
  'short-link-landing.html': () => reviewPage('R1TESTROW07ABC', FLOOR),
  'review-gone.html': () => `${HEAD('Amazon.in')}<div class="a-section a-spacing-large"><h2>Customer Review</h2><p>Sorry, this review is no longer available.</p><a href="/">Go to the Amazon.in home page</a></div>
</body></html>
`,
  'product-floor-cleaner.html': () => `${HEAD(`${FLOOR} : Amazon.in: Health &amp; Personal Care`)}<div id="dp" class="a-container">
<h1 id="title" class="a-size-large a-spacing-none"><span id="productTitle" class="a-size-large product-title-word-break">   ${esc(FLOOR)}   </span></h1>
<input type="hidden" id="ASIN" name="ASIN" value="${FLOOR_ASIN}">
<div id="twister_feature_div"><div id="twister"><ul><li data-defaultasin="B0TESTFLR1" title="Click to select 1 Litre">1 Litre</li><li data-defaultasin="B0TESTFLR2" title="Click to select 2 Litre">2 Litre</li></ul></div></div>
<script type="text/javascript">var dpData = {"dimensionValuesDisplayData" : {"B0TESTFLR1":["1 Litre"],"B0TESTFLR2":["2 Litre"]}, "parentAsin":"B0TESTFLRP"};</script>
<div id="reviewsMedley"><h2>Customer reviews</h2>
<ul>${block('R3TESTFLOORA1', OTHER.R3TESTFLOORA1, { asItem: true })}</ul>
<a data-hook="see-all-reviews-link-foot" class="a-link-emphasis a-text-bold" href="/product-reviews/${FLOOR_ASIN}/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&amp;reviewerType=all_reviews">See more reviews</a>
</div>
</div>
</body></html>
`,
  'see-all-floor-cleaner.html': () => listPage(['R3TESTFLOORA1', 'R3TESTFLOORB2'], FLOOR),
  'search-floor-cleaner.html': () => listPage(['R1TESTROW02ABC', 'R1TESTPICREV1', 'R1TESTROW07ABC'], FLOOR),
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [name, make] of Object.entries(PAGES)) writeFileSync(join(HERE, name), make());
  console.log('written');
}
