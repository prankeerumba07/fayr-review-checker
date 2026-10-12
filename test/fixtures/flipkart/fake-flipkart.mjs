// Pretend Flipkart pages for the Live Flipkart Browser tests, answered inside
// the test's own hidden Chrome, so nothing reaches Flipkart: the saved
// product page (product-page.html, a real page, with every reviewer's name
// made up) at its own address and at Flipkart's address for its product ID
// alone; its first two pages of reviews, newest first (reviews-page-1.html
// and reviews-page-2.html, real pages, every reviewer's name made up); and
// made-up pages: a robot check, a refusal (a block), an error, Flipkart's
// "page not found" for a product ID that opens nothing, a search page, which
// is not a product's, a third page of older reviews, a review cut short with
// "Read more", reviews under a login box, and a product with no reviews.
// Every other address, and every picture, script or other part a page asks
// for, is refused. No redirects.
// fakeFlipkart() -> { handler (for FlipkartBrowser's routes), visits, refused }

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = (name) => readFileSync(join(HERE, name), 'utf8');

/** What the saved product page says about its product, and its other size ("Selected Quantity: 50 ml", or 20 ml). */
export const PRODUCT = {
  name: 'Renee Pink Therapy Collagen Night Wrapping Face Mask, Hydrates, Repairs Improves Skin',
  brand: 'Renee',
  pid: 'FCPHEW7AM9C7RU24',
  itemId: 'itm50a9094e8e73a',
  variants: [{ pid: 'FCPHZGXXGCHZH83U', label: '20 ml' }],
  rating: 4.2,
  ratings: 1355,
  reviews: 47,
  allReviews: 'https://www.flipkart.com/renee-pink-therapy-collagen-night-wrapping-face-mask-hydrates-repairs-improves-skin/product-reviews/itm50a9094e8e73a?pid=FCPHEW7AM9C7RU24&marketplace=FLIPKART',
};

/** The "All reviews" links of the products whose review pages are here: the saved product's, and made-up ones'. */
export const ALL_REVIEWS = {
  saved: PRODUCT.allReviews,
  readMore: 'https://www.flipkart.com/test-glow-face-mask/product-reviews/itmtestglow0001?pid=FCPTESTGLOW00001&marketplace=FLIPKART',
  loginBox: 'https://www.flipkart.com/test-clay-face-mask/product-reviews/itmtestclay0001?pid=FCPTESTCLAY00001&marketplace=FLIPKART',
  none: 'https://www.flipkart.com/test-jar/product-reviews/itmtestjar00001?pid=FCPTESTJAR000001&marketplace=FLIPKART',
  robot: 'https://www.flipkart.com/test-robot-mask/product-reviews/itmtestrobo0001?pid=FCPTESTROBO00001&marketplace=FLIPKART',
};
const newest = (link, n) => `${link}&sortOrder=MOST_RECENT&page=${n}`;

export const URLS = {
  product: 'https://www.flipkart.com/renee-pink-therapy-collagen-night-wrapping-face-mask-hydrates-repairs-improves-skin/p/itm50a9094e8e73a?pid=FCPHEW7AM9C7RU24',
  byId: 'https://www.flipkart.com/product/p/itme?pid=FCPHEW7AM9C7RU24',
  missingId: 'https://www.flipkart.com/product/p/itme?pid=FCPHTESTMISS0001',
  robot: 'https://www.flipkart.com/test-robot-check/p/itmtestrobot0001?pid=FCPHTESTROBO0001',
  blocked: 'https://www.flipkart.com/test-blocked/p/itmtestblock0001?pid=FCPHTESTBLOK0001',
  error: 'https://www.flipkart.com/test-error/p/itmtesterror0001?pid=FCPHTESTERRO0001',
  search: 'https://www.flipkart.com/search?q=face%20mask',
  // The saved product's reviews, newest first: the two saved pages, then a made-up third.
  reviews1: newest(ALL_REVIEWS.saved, 1),
  reviews2: newest(ALL_REVIEWS.saved, 2),
  reviews3: newest(ALL_REVIEWS.saved, 3),
  readMore: newest(ALL_REVIEWS.readMore, 1),
  loginBox: newest(ALL_REVIEWS.loginBox, 1),
  noReviews: newest(ALL_REVIEWS.none, 1),
  robotReviews1: newest(ALL_REVIEWS.robot, 1),
  robotReviews2: newest(ALL_REVIEWS.robot, 2),
};

const PAGES = new Map([
  [URLS.product, [200, 'product-page.html']],
  [URLS.byId, [200, 'product-page.html']],
  [URLS.missingId, [404, 'not-found-page.html']],
  [URLS.robot, [200, 'robot-check-page.html']],
  [URLS.blocked, [403, 'blocked-page.html']],
  [URLS.error, [500, 'error-page.html']],
  [URLS.search, [200, 'search-page.html']],
  [URLS.reviews1, [200, 'reviews-page-1.html']],
  [URLS.reviews2, [200, 'reviews-page-2.html']],
  [URLS.reviews3, [200, 'reviews-page-3.html']],
  [URLS.readMore, [200, 'reviews-read-more.html']],
  [URLS.loginBox, [200, 'reviews-login-box.html']],
  [URLS.noReviews, [200, 'reviews-none.html']],
  [URLS.robotReviews1, [200, 'reviews-page-3.html']],
  [URLS.robotReviews2, [200, 'robot-check-page.html']],
]);

export function fakeFlipkart() {
  const site = { visits: [], refused: 0 };
  site.handler = (route) => {
    const req = route.request();
    const page = req.isNavigationRequest() ? PAGES.get(req.url()) : null;
    if (!page) {
      site.refused++;
      return route.abort();
    }
    site.visits.push({ url: req.url(), at: Date.now() });
    return route.fulfill({ status: page[0], contentType: 'text/html; charset=utf-8', body: html(page[1]) });
  };
  return site;
}
