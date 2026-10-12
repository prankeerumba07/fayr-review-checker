// Pretend Flipkart pages for the Live Flipkart Browser tests, answered inside
// the test's own hidden Chrome, so nothing reaches Flipkart: the saved
// product page (product-page.html, the one real page, with every reviewer's
// name made up) at its own address and at Flipkart's address for its product
// ID alone, and made-up pages: a robot check, a refusal (a block), an error,
// Flipkart's "page not found" for a product ID that opens nothing, and a
// search page, which is not a product's. Every other address, and every
// picture, script or other part a page asks for, is refused. No redirects.
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

export const URLS = {
  product: 'https://www.flipkart.com/renee-pink-therapy-collagen-night-wrapping-face-mask-hydrates-repairs-improves-skin/p/itm50a9094e8e73a?pid=FCPHEW7AM9C7RU24',
  byId: 'https://www.flipkart.com/product/p/itme?pid=FCPHEW7AM9C7RU24',
  missingId: 'https://www.flipkart.com/product/p/itme?pid=FCPHTESTMISS0001',
  robot: 'https://www.flipkart.com/test-robot-check/p/itmtestrobot0001?pid=FCPHTESTROBO0001',
  blocked: 'https://www.flipkart.com/test-blocked/p/itmtestblock0001?pid=FCPHTESTBLOK0001',
  error: 'https://www.flipkart.com/test-error/p/itmtesterror0001?pid=FCPHTESTERRO0001',
  search: 'https://www.flipkart.com/search?q=face%20mask',
};

const PAGES = new Map([
  [URLS.product, [200, 'product-page.html']],
  [URLS.byId, [200, 'product-page.html']],
  [URLS.missingId, [404, 'not-found-page.html']],
  [URLS.robot, [200, 'robot-check-page.html']],
  [URLS.blocked, [403, 'blocked-page.html']],
  [URLS.error, [500, 'error-page.html']],
  [URLS.search, [200, 'search-page.html']],
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
