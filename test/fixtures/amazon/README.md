# Amazon fixtures

Pages and pictures the tests read instead of Amazon. Tests never contact Amazon.

- `review-text-*.txt` are real signed-in review pages saved as page text. The reviewer's name and delivery address are replaced with "Test Reviewer" and "Test City 000000".
- The `.html` pages are hand-written in Amazon's own markup (its `data-hook` names), with made-up reviews, ids and ASINs. None has been saved from a real run yet. After the first real check, save that run's pages over these, with personal details replaced, and keep the tests passing. Checks keep a copy of each real Amazon page they open (never a sign-in page, robot check or block) in `data/checks/<check id>/pages/` (`review.html`, `product.html`, `see-all.html`, `search-1.html`, …) until one check has kept all four kinds. Those copies are private and still carry the signed-in account's and the reviewer's details.
- `review-page-real-shape.html` is shaped like the real review page read in a signed-in Chrome on 1 October 2026, with made-up details (Test Reviewer, ASIN B0TESTPROD): the review's block has the name, stars, date and Verified Purchase badge, but no title and an empty text; the page's text has the whole review; the reviewed product's link is the `/dp/` link with its title under Product Details (and behind "See All Buying Options"); recommended products' links come before it, including one whose title holds the product's title ("… (Pack of 2)") and one whose cut-short title is part of it.
- `screenshot-*` are review screenshots drawn by `make-screenshots.mjs`, with the same made-up review. Run `node test/fixtures/amazon/make-screenshots.mjs` to draw them again.
- `delivery-*` are delivery screenshots (Amazon India's "Your Orders" page) drawn by `make-delivery-screenshots.mjs`: `delivery-clear.png` (Delivered 3 March, order 407-1234567-1234567, the rack), `delivery-no-product.png` (no product name), `delivery-other-product.png` (a water bottle) and `delivery-arriving.png` (not delivered yet). Run `node test/fixtures/amazon/make-delivery-screenshots.mjs` to draw them again.

## For the orders sheet

Made-up orders, products, names, ids and ASINs only.

- Pictures drawn by `make-order-screenshots.mjs`: `order-floor-cleaner.png` (an order's details: order ID 403-1000002-2000002, order date 20 July 2026, ₹654.00, the product), `delivery-floor-cleaner.png` ("Delivered 22 July", the same order ID and product), `delivery-other-order.png` (the same, with another order ID), `review-rating-only.png` ("Thanks for rating!", four stars, no written words), `review-refused.png` (Amazon refusing a review) and `review-written-floor.png` (a written review, as Amazon shows it). Run `node test/fixtures/amazon/make-order-screenshots.mjs` to draw them again.
- Pages written by `make-order-pages.mjs`, in Amazon's own markup: `review-floor-cleaner.html` (a written review), `review-stars-only.html` (a review with stars and no written words), `review-gone.html` (a review that no longer exists), `short-link-landing.html` (the page a short link lands on), `product-floor-cleaner.html` (the product's page, with two sizes), `see-all-floor-cleaner.html` and `search-floor-cleaner.html`. Run `node test/fixtures/amazon/make-order-pages.mjs` to write them again.
- `product-kit.html`: a made-up product page for a campaign's product, written by hand: its real name, the line under it naming the brand's store, a "Brand" row, and other sizes with their names.

## For the Amazon login

- `fake-amazon.mjs` answers pretend Amazon pages inside the test's own hidden Chrome: a home page whose account line says "Hello, Test Staff" only when a long-lasting test cookie is set ("Hello, sign in" otherwise), and a login page that sets that cookie when its button is pressed (for a year with "Keep me signed in" ticked, only until the window closes without it), then moves on to the home page by itself. It can also answer with the robot check (`captcha-page.html`), a block (`error-page.html`), or a login Amazon has ended. No redirects.
- `run-dashboard.mjs` starts the dashboard as `npm start` does, with the same stop on Control+C, but with a made-up data folder, any free port, a hidden Chrome and those pretend pages, so a test can stop it the way Control+C does and start it again.
