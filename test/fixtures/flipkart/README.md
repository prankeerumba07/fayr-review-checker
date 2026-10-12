# Flipkart fixtures

Made-up Flipkart orders only: made-up names, order IDs and links. Never a real file, and nothing copied from one. Write the file again with `node test/fixtures/flipkart/make-flipkart.mjs`. The one real page here is `product-page.html` (below), with every reviewer's name made up.

- `flipkart-orders.xlsx`: three tabs, "Amazon", "Flipkart" and "Notes". Only "Flipkart" is read.
  - Row 1 holds the column names: Order ID, Order Date, Product, Amount, Reviewer Name, Order Screenshot, Delivery Screenshot, Review Link, Email ID.
  - A real Excel date and a date written as words (`21-07-2026`); amounts as numbers (one with paise, `349.5`) and as words (`₹499`).
  - Links behind their words: `Screenshot` (row 2), links behind themselves (row 2), and `Open review` put there by a HYPERLINK formula (row 4).
  - Links written in the words: a link alone (row 3), two links in one cell (row 4), and a link inside a sentence (row 6).
  - A cell with two lines (row 4), empty cells (row 6), and an empty row 5.
  - A picture placed inside a cell (row 3, Order Screenshot), a picture over a cell (row 3, Delivery Screenshot), and a row with only a picture in it (row 7).
- `zip-tools.mjs`: writes a zip with Node's own zlib, puts pictures inside cells the way Excel stores them, and draws a tiny made-up picture.
- `product-page.html`: one real Flipkart product page (Renee Pink Therapy Collagen Night Wrapping Face Mask, product ID FCPHEW7AM9C7RU24, item ID itm50a9094e8e73a), opened once on 2026-10-12 with the user's leave, signed out, in a fresh Chrome profile that let only Flipkart's own addresses load, and saved as Chrome showed it. Changed before it was saved here: every script left out except its JSON-LD (what the page tells search engines: the name, the brand, the product ID, the stars and the counts); the links to Flipkart's page code and styles left out (the canonical link kept); every reviewer's name swapped for a made-up one ("Test Reviewer One" to "Test Reviewer Six"; "Flipkart Customer" is Flipkart's own word and stays), in the page and in its JSON-LD; the reviewers' photos left out, and the photos' file names too; and one word in Flipkart's top menu changed, because this project bans it. The page shows 4.2 stars from 1,355 ratings, and its JSON-LD says 47 reviews.
- `robot-check-page.html`, `blocked-page.html` (served as refused, 403), `error-page.html` (served as an error, 500), `not-found-page.html` (served as not found, 404) and `search-page.html` (not a product's page): made up, since Flipkart showed none of these. The robot check and the block are written the way such pages usually look.
- `fake-flipkart.mjs`: answers the Live Flipkart Browser in the tests with these pages, inside the test's own hidden Chrome, so nothing reaches Flipkart. Every other address, and every picture, script or other part a page asks for, is refused. No redirects.
