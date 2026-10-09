# Sheet fixtures

Made-up orders only: made-up order IDs, links, products and names. Never a real file, and nothing copied from one. Write them again with `node test/fixtures/sheets/make-orders.mjs`.

- `orders.xlsx`: three tabs, "Instamart", "Flipkart" and "Amazon". Only "Amazon" is checked; the other two must come back exactly as they were.
  - Row 1 of "Amazon" holds the column names: Order ID, Order Date, Amount, Product Ordered, Order Screenshot, Delivery Screenshot, Live Review Link, Status, Type. There is no Note column. Row 1 has a filter.
  - Real Excel dates, and dates written with the day first (`14/07/2026`, `20-07-2026`, `20.07.2026`).
  - Amounts as numbers (one with paise, `851.95`) and as words (`₹499`, `654.00`).
  - Links behind their words. In rows 24 and 26 the words are one link and the link behind them another (as in the real sheet, the words are the next row's).
  - Delivery cells with words instead of a screenshot: `Cancelled`, `Lost in transit`, `0`.
  - Empty cells (row 14's review link, row 28's order screenshot, row 32's order ID), and an empty row 29.
  - Every kind of review link: Amazon review links in four forms, an Amazon email link (`/gp/f.html?…&U=…`), short links (`amzn.in/d/…`, `amzn.in/…`), pages only the writer can see (`review-your-purchases/edit`, `…/thankyou`), and pictures (Google Drive, `tryboxs.in`, `storage.googleapis.com`).
  - One order ID in three rows (18, 19, 20), and three different orders sharing the same delivery and review links (21, 22, 23).
  - Two links in one cell (row 30), and words with a link behind them (row 31).
- `zip-tools.mjs`: writes a zip with Node's own zlib, and puts pictures inside cells the way Excel stores them (for the test of pictures in cells).
