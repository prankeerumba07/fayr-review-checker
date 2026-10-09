# Flipkart fixtures

Made-up Flipkart orders only: made-up names, order IDs and links. Never a real file, and nothing copied from one. Write the file again with `node test/fixtures/flipkart/make-flipkart.mjs`.

- `flipkart-orders.xlsx`: three tabs, "Amazon", "Flipkart" and "Notes". Only "Flipkart" is read.
  - Row 1 holds the column names: Order ID, Order Date, Product, Amount, Reviewer Name, Order Screenshot, Delivery Screenshot, Review Link, Email ID.
  - A real Excel date and a date written as words (`21-07-2026`); amounts as numbers (one with paise, `349.5`) and as words (`₹499`).
  - Links behind their words: `Screenshot` (row 2), links behind themselves (row 2), and `Open review` put there by a HYPERLINK formula (row 4).
  - Links written in the words: a link alone (row 3), two links in one cell (row 4), and a link inside a sentence (row 6).
  - A cell with two lines (row 4), empty cells (row 6), and an empty row 5.
  - A picture placed inside a cell (row 3, Order Screenshot), a picture over a cell (row 3, Delivery Screenshot), and a row with only a picture in it (row 7).
- `zip-tools.mjs`: writes a zip with Node's own zlib, puts pictures inside cells the way Excel stores them, and draws a tiny made-up picture.
