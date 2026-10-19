# Fix plan from the audit

Made on 19-10-2026 from the read-only audit of 15 to 19-10-2026. No code was changed to make it. The audit's full notes (each finding's details, the second helpers' verdicts and the data checks) are outside the project, in `~/.claude/projects/-Users-prakashtamang-FAYR-Review-Checker/audit-2026-10-15/`.

## Rules for every group

1. When the dashboard cannot be sure, the row goes to a staff member. It never passes or fails on a guess.
2. Both screens follow the same rule, unless only the way Amazon or Flipkart is read differs (CLAUDE.md rule 9).
3. A result a staff member set is never changed.
4. Nothing about customers leaves this computer, and no outside service is used.
5. A fix that cannot be done safely is left, with the reason.

## Your decisions (19-10-2026)

1. Amazon: a review dated before the day the order was delivered (or the order date, when that day is not known) goes to a staff member.
2. A delivery date before the order date, on a delivery screenshot that does not show the order ID, goes to a staff member.
3. When the total paid is read clearly, the form's amount must match it; SuperCoins count as paid, as now. Price lines stand in for the total only when no total was read clearly. MRP and Flipkart's listing price are never the amount. A form amount equal to the item's price or subtotal, while the total paid is lower, goes to a staff member.
4. Two rows' review screenshots that look alike with the same words are Duplicate only when there are 5 words or more and no name on them differs. Otherwise a staff member checks.

## How to work through this plan

- You send one group at a time. Each group is one step: change the code, add tests that use made-up data only, run every test and the syntax check once at the end, add one line to CHANGELOG.md, and save it in git.
- Many fixes change Amazon files. CLAUDE.md rule 2 keeps Amazon files unchanged during Flipkart work, so a group that changes them needs your go-ahead in that group's message. Its CHANGELOG tag is [AMAZON], [FLIPKART] or [SHARED], by what it changes (rule 7).
- Shared files get only a few lines; anything bigger is asked about first (CLAUDE.md rule 3). This touches group 1 (serve.mjs, .gitignore) and group 7 (README.md).
- Code that both screens need is written in amazon/ and copied into flipkart/ (CLAUDE.md rule 4).
- The Amazon and shared test count, 392 tests in 25 files, grows when Amazon tests are added. Each step says the new count, and every earlier test must still pass.
- No new package may be added: test/rules.test.mjs allows only exceljs and playwright-core.
- Groups 8 to 10 only show signs. Group 11 turns them into a Status, and only when you send it. Group 9's price-line sign uses group 3's reading of price lines, so group 3 comes first.

## How to read an entry

- The ID is the audit's. a- and f- are from the reviews of the Amazon and Flipkart code, parity- from the review of differences between the screens, shared- from the shared files, X from the cross check, T is a test gap, and D-A and D-F are problems the data check found in Amazon's and Flipkart's saved rows (rows are named by screen and number only). The number before the ID (2.1, 2.2 …) is this plan's.
- How sure: *confirmed* (a second helper ran it again with made-up data), *plausible* (likely, not fully proven), *cross check* (found by the cross check), *data check* (seen in the saved rows), *not double-checked* (no second helper looked), *test gap* (a rule no test covers). After the comma: high, medium or low.
- How serious: could give a wrong Pass, a wrong Fail, or either; could mislead; privacy; could lose results; or only looks wrong.
- "Same problem" lines under an entry repeat it, often on the other screen. Fix them with it.

## How many in each group

| Group | Items | Findings | Data problems | Test gaps |
|---|---|---|---|---|
| 1. Privacy and safety | 22 | 21 | 0 | 1 |
| 2. Products, "Delivered", ratings and review words | 43 | 34 | 2 | 7 |
| 3. Amounts and dates, on screenshots and in the file | 25 | 20 | 0 | 5 |
| 4. Duplicates, and what is kept between checks and uploads | 30 | 24 | 2 | 4 |
| 5. Reading the uploaded file, and the two downloads | 53 | 50 | 1 | 2 |
| 6. Emails | 33 | 26 | 7 | 0 |
| 7. Status, Type, step marks, words on the screen and README | 65 | 57 | 5 | 3 |
| 8. Is the screenshot real? (1) The file | 0 | new work | | |
| 9. Is the screenshot real? (2) The facts | 0 | new work | | |
| 10. Is the screenshot real? (3) The picture | 0 | new work | | |
| 11. Turn the screenshot signs on | 0 | new work | | |
| **All** | **271** | | | |

Not placed: **parity-3**, which the second helper proved wrong: Flipkart passing when neither screenshot shows the amount was your own choice on 14-10-2026, and the Note says so. Placed by the nearest fit: f-readers-7 (an order ID reading, in group 3, because the same reader reads amounts and dates), T8 (group 3, though two of its rules are group 2's) and D-A7 (group 2, though its cause was not looked at). Of the 66 findings no second helper checked, 28 sit under the finding they repeat, and 38 are in group 7's second part.

## 1. Privacy and safety

**Fixed means:** no customer detail is kept, logged or pushed where it should not be, the word in the test file is gone, Flipkart asks before replacing rows, a broken Flipkart settings file is reported instead of quietly reset, and running work never stops because the 8-hour session ended.

- **How X8 is fixed:** a script finds the word by its line and place and puts a made-up name there, so the word itself is never typed anywhere, and a yes-or-no check confirms the new name equals no Reviewer Name in data/.
- **Left, with the reason (X8):** the word is also in older commits already on GitHub. Taking it out of the history means rewriting the history and force-pushing, which breaks every other copy of the repository. Only you can decide that, and whether the GitHub repository should be private. The fix changes the current file only.
- **Left, with the reason (X6):** emails already in the Live Amazon Browser's history cannot be removed safely by the dashboard: Chrome keeps that history open, and the profile's own files are not touched. The fix stops new ones from being added. Old ones can be cleared in that browser with Chrome's own "Clear browsing data".
- **Shared files:** serve.mjs (shared-4) and .gitignore (X9) may get only a few lines. If keeping running work alive past the 8 hours needs more, the step stops and asks you first (CLAUDE.md rule 3). For X9, .gitignore leaves out every .xlsx, .xlsm, .xls and .csv file outside test/fixtures/.

- **1.1 X8** · `test/accuracy.test.mjs:324` · Amazon · *cross check, confirmed by hand* · privacy  
  A word in a test file equals one Amazon customer's whole Reviewer Name cell, and the file is on GitHub.  
  *Example (not made up, so the word itself is not written here):* Anyone who can open the repository on GitHub can read the word, in the file and in its history.
- **1.2 a-routes-5** · `amazon/routes.js:1473` · Amazon · *confirmed, high* · privacy  
  When a row's email cell is not a proper address, the Amazon email log and the Terminal keep the cell's whole text.  
  *Made-up example:* A made-up email cell holds a phone number, or two addresses. The row is not sent, and the whole cell goes into the email log and the Terminal.
  - Same problem: **a-mail-login-10** · `amazon/routes.js:1473` · Amazon · *confirmed, high*: The email log and the Terminal keep what the file has in the email address cell.
  - Same problem: **X5** · `amazon/routes.js:1343` · Amazon · *cross check, high*: Privacy: the email log keeps whatever is in the email cell when it is not an address.
- **1.3 X6** · `amazon/gmail.js:30` · Amazon · *cross check, medium* · privacy  
  Each email sent from the Amazon screen leaves its address, subject and words in the Live Amazon Browser's history, because Gmail's compose page is opened with them in its address.  
  *Made-up example:* After 50 real emails, the browser profile's history holds 50 addresses with order IDs, and "Remove all rows" does not clear them.
  - Same problem: **a-mail-login-16** · `amazon/gmail.js:32` · Amazon · *not double-checked, medium*: Every email's full words and address are kept in the Live Amazon Browser profile's history.
  - Same problem: **a-routes-16** · `amazon/gmail.js:32` · Amazon · *not double-checked, medium*: Sending an email puts the address, subject and words in the Gmail page address, which Chrome keeps in the Live Amazon Browser's saved profile.
  - Same problem: **shared-8** · `amazon/gmail.js:32` · Amazon · *not double-checked, medium*: Each email's address, subject and words stay in the Live Amazon Browser's history.
- **1.4 X7** · `amazon/store.js:352` · Amazon · *cross check, medium* · privacy  
  "Remove all rows" and "Delete row" leave each check's record in data/checks, with everything read from the screenshots, and the buttons do not say so.  
  *Made-up example:* Staff remove a finished batch. The words read from every screenshot, a delivery name and address among them, stay on disk.
  - Same problem: **a-view-16** · `views/amazon.js:1065` · Amazon · *not double-checked, medium*: "Delete row" and "Remove all rows" say the pictures go, but what was read from them stays on this computer.
- **1.5 X9** · `.gitignore:2` · shared files · *cross check, low* · privacy  
  .gitignore keeps only data/ out of git, so a customer's Excel or CSV file saved anywhere else in the folder can be committed and pushed.  
  *Made-up example:* Staff save the customer file in the project folder to upload it, and the next commit takes it along.
- **1.6 a-view-15** · `views/flipkart.js:192` · Flipkart · *confirmed, high* · could lose results  
  Flipkart replaces every row and every result, staff changes too, on any upload, without asking, even for a file dropped on a row's page. Amazon asks first and ignores drops on a row's page.  
  *Made-up example:* 200 Flipkart rows are checked, and a file dropped by mistake replaces them all with no question.
  - Same problem: **f-view-4** · `views/flipkart.js:192` · Flipkart · *confirmed, high*: A new file replaces every row and its results without asking (Amazon asks first).
  - Same problem: **f-view-5** · `views/flipkart.js:261` · Flipkart · *confirmed, high*: A file dropped on a row's page is uploaded; Amazon ignores drops on a row's page.
  - Same problem: **shared-2** · `views/flipkart.js:261` · Flipkart · *confirmed, high*: Flipkart replaces every row and result on any upload or drop, without the question Amazon asks.
  - Same problem: **parity-7** · `views/flipkart.js:192` · Flipkart · *confirmed, high*: Flipkart replaces every row and result, staff changes included, on any upload or drop, with no question.
  - Same problem: **f-routes-6** · `flipkart/routes.js:658` · Flipkart · *confirmed, high*: Uploading a file wipes every result and staff change without asking.
  - Same problem: **a-routes-15** · `flipkart/routes.js:687` · Flipkart · *confirmed, high*: Flipkart's "Replace file" throws away every row and its result (staff results too) without asking; Amazon asks first.
  - Same problem: **T7** · `flipkart/routes.js:658-690`, `flipkart/store.js:394-428` · Flipkart · *test gap*: No test that Flipkart asks before an upload replaces rows that have results.
- **1.7 f-routes-4** · `flipkart/store.js:266` · Flipkart · *confirmed, medium* · could give a wrong Pass or Fail  
  A typing slip in data/flipkart/settings.json makes Flipkart quietly go back to the default passing marks. Amazon shows a message.  
  *Made-up example:* Staff set the allowed amount difference to 0 but leave a stray comma. The next check rewrites the file with the defaults, and an amount ₹1 off counts as the same.
  - Same problem: **f-files-2** · `flipkart/store.js:266` · Flipkart · *confirmed, medium*: A Flipkart settings file with a JSON typo or a BOM is silently replaced with the default passing marks.
- **1.8 shared-4** · `serve.mjs:78` · shared files · *confirmed, high* · could lose results  
  The page's session ends 8 hours after the dashboard started, and when it ends everything running stops.  
  *Made-up example:* The dashboard starts at 09:00. At 17:00 a long "Start checking" run stops, and the row being checked gets no result.

## 2. Products, "Delivered", ratings and review words

**Fixed means:** a row passes only when its screenshots show this order's product and a "Delivered" that belongs to this order, and its rating or review is tied to that product; whenever the dashboard cannot be sure, the row goes to a staff member, on both screens alike.

- A rating screenshot that shows no product name can never be tied to the order, so after the fix it goes to a staff member instead of passing (rule 1).
- D-A7 (Amazon rows 37 and 123): the cause was not looked at in the audit. The step looks first, with scripts that print only kinds and row numbers.

- **2.1 a-check-1** · `amazon/check.js:638`, also `flipkart/check.js:681`, `flipkart/screen-text.js:464` · both screens · *confirmed, high* · could give a wrong Pass  
  Another product of the same brand passes as the campaign's product: one or two different words in the name are taken as misreadings.  
  *Made-up example:* Campaign product "Testbrand Floor Cleaner". Both screenshots show "Testbrand Glass Cleaner Spray" with the right order ID, date and amount. Result: Pass, and the table names the floor cleaner.
  - Same problem: **a-readers-2** · `amazon/screen-text.js:390` · Amazon · *confirmed, high*: Another product of the same brand is taken as the campaign's product.
- **2.2 a-check-2** · `amazon/check.js:851`, also `flipkart/check.js:772` · both screens · *confirmed, medium* · could give a wrong Pass  
  With no product column in the file, nothing ties the delivery screenshot to the order: any screenshot that says Delivered passes.  
  *Made-up example:* The delivery screenshot shows "Delivered 22 July" for another brand's water bottle, with no order ID. Result: Pass.
- **2.3 a-check-16** · `amazon/check.js:558`, also `flipkart/check.js:1234` · both screens · *confirmed, high* · could mislead  
  An empty product cell sends a row to staff even when the campaign's product is on both screenshots.  
  *Made-up example:* Product cell empty; both screenshots show the campaign's product with the right ID, date and amount. Result: Needs Manual Staff Checking.
- **2.4 f-check-12** · `flipkart/check.js:1008` · Flipkart · *confirmed, high* · could mislead  
  Flipkart ignores the product on the delivery screenshot. When the purchase screenshot has no product line, the review is not searched, and the Note contradicts itself.  
  *Made-up example:* Two-product campaign; the delivery screenshot shows the bottle with the same order ID. Result: Needs Manual, Something else, "because which of the campaign's products was bought could not be told", next to "the delivery screenshot shows it".
  - Same problem: **parity-14** · `flipkart/check.js:1008` · Flipkart · *confirmed, high*: Flipkart ignores the delivery screenshot's product and sends the row to staff with 'because Which of…'.
  - Same problem: **T13** · `flipkart/check.js:1006-1012`, `1059-1063`, `1514` · Flipkart · *test gap*: No Flipkart test for telling which campaign product was bought. Flipkart uses only the purchase screenshot; Amazon also uses the delivery screenshot.
- **2.5 a-readers-1** · `amazon/delivery-read.js:65` · Amazon · *confirmed, high* · could give a wrong Pass  
  "Delivered" is taken from any line of the delivery screenshot: another order's line on an orders list, or a sentence about a future delivery.  
  *Made-up example:* This order says "Arriving tomorrow"; an older order below it says "Delivered 18 July". Result: Pass.
  - Same problem: **f-readers-6** · `flipkart/delivery-read.js:87` · Flipkart · *confirmed, medium*: Any 'delivered'-like phrase counts as Delivered, even next to lines that say the order is on its way or was returned.
- **2.6 parity-5** · `flipkart/check.js:1290` · Flipkart · *confirmed, medium* · could give a wrong Fail  
  Flipkart fails a delivered order as Not delivered when its Delivered line was not read, because the tracker also lists "Shipped" and "Out for delivery".  
  *Made-up example:* A delivered order's tracker with the Delivered line cut off. Result: Fail, Not delivered, instead of a staff check.
  - Same problem: **f-readers-5** · `flipkart/delivery-read.js:23` · Flipkart · *plausible, low*: Stage names that Flipkart lists on delivered orders too ('Out For Delivery', 'Shipped') are treated as clear proof of not delivered, so the row fails.
- **2.7 a-check-10** · `amazon/check.js:714`, also `flipkart/check.js:814` · both screens · *plausible, low* · could give a wrong Fail  
  When "Delivered" is not read, a not-delivered word anywhere on the screenshot gives a sure Fail.  
  *Made-up example:* This order's line is misread as "Delvrd 22 July", and another order on the list says "Arriving tomorrow". Result: Fail, Not delivered.
- **2.8 D-F7** · `flipkart/check.js:1333` · Flipkart · *data check, medium* · could mislead (wrong Type or words)  
  Flipkart row 41: Fail with the Type "Delivery screenshot missing", though its purchase screenshot shows the order as Delivered. The code uses a purchase screenshot's "Delivered" only when a delivery screenshot was given. The Fail itself is right (the review is missing too).
- **2.9 parity-1** · `flipkart/check.js:951` · Flipkart · *confirmed, high* · could give a wrong Pass  
  Flipkart passes a star rating for any product as Rating Only. Amazon fails one for another product.  
  *Made-up example:* The screenshots match, and the rating screenshot is for another maker's mixer grinder. Flipkart: Pass, Rating Only. Amazon: Fail, Product is not matching.
  - Same problem: **f-check-9** · `flipkart/check.js:951` · Flipkart · *confirmed, medium*: Rating Only passes with nothing tying the rating to the product ordered.
  - Same problem: **f-readers-1** · `flipkart/review-read.js:430` · Flipkart · *confirmed, high*: A number rating with no words passes as Rating Only, and neither the name nor the product on the screenshot is checked.
  - Same problem: **T3** · `flipkart/check.js:951-955`, `flipkart/check.js:1508`, `flipkart/review-read.js:419-431` · Flipkart · *test gap*: No test, and no rule, that a Flipkart rating screenshot is for the product ordered.
- **2.10 a-check-3** · `amazon/check.js:1302` · Amazon · *confirmed, medium* · could give a wrong Pass  
  Amazon passes a rating screenshot that shows no product at all as Rating Only.  
  *Made-up example:* A cropped "Thanks for rating!" screen with 5 stars and no product name; the purchase and delivery screenshots match. Result: Pass, Rating Only.
  - Same problem: **a-readers-8** · `amazon/shot-read.js:381` · Amazon · *confirmed, medium*: Rating Only passes on a rating screenshot that does not show the product.
- **2.11 a-check-18** · `amazon/check.js:1302` · Amazon · *confirmed, high* · could mislead  
  A rating screenshot for another of the campaign's products is said to be "not one of the products of the campaign".  
  *Made-up example:* Campaign with products A and B. The screenshots show A, and the rating screenshot shows B. The Note says B is not a campaign product.
- **2.12 a-readers-9** · `amazon/shot-read.js:370` · Amazon · *plausible, low* · could give a wrong Fail  
  A "Size: 100 ml" or "Pack of 2" line on a rating screenshot is taken for another product.  
  *Made-up example:* The product's title was not read, but its "Size: 100 ml" line was. Result: Fail, Product is not matching.
- **2.13 T9** · `flipkart/check.js:1274-1278` · Flipkart · *test gap* · could give a wrong Pass or Fail  
  No Flipkart test that two screenshots showing two different campaign products fail as "Product is not matching".
- **2.14 T2** · `flipkart/check.js:1309-1343` · Flipkart · *test gap* · could give a wrong Pass  
  No Flipkart test, at the level of the Status, that a screenshot not tied to the order goes to staff: no order ID on the purchase screenshot, the product not shown or only the start of its name, the order date on neither screenshot, a photo with no order details in the delivery cell.
- **2.15 f-readers-2** · `flipkart/review-read.js:53` · Flipkart · *confirmed, medium* · could give a wrong Pass  
  Flipkart takes some of a review's own words for Flipkart's page lines ("5.0", "Helpful", "purchase … yesterday"). This splits one review into two, and can turn a written review into a Rating Only Pass.  
  *Made-up example:* A made-up review that mentions "Bluetooth 5.0" is read as 5 stars with its words cut off. With the reviewer's name it becomes Rating Only.
- **2.16 f-check-1** · `flipkart/review-match.js:87` · Flipkart · *confirmed, medium* · could give a wrong Pass  
  On Flipkart, a review of one or two common words passes when only the first name fits. Amazon needs at least 5 words.  
  *Made-up example:* The review screenshot says only "Good". A Flipkart review under the same first name says "Good quality, worth it". Result: Pass.
- **2.17 f-readers-10** · `flipkart/review-read.js:250` · Flipkart · *confirmed, high* · could mislead (wrong Type or words)  
  When Flipkart's small grey name line is not read, the review's last line becomes the "name", and the row goes to "Reviewer name is different".  
  *Made-up example:* The review's last line, "Lid closes tight", is taken as the name. Result: Needs Manual, Reviewer name is different, and the email quotes that line as the name.
- **2.18 T18** · `flipkart/check.js:1201-1207` · Flipkart · *test gap* · could mislead  
  No Flipkart test for step 9's Reviewer Name rules: an empty cell is said and not compared; a name that only fits (a short form, an initial) is said as fitting.
- **2.19 a-readers-4** · `amazon/screen-text.js:524` · Amazon · *confirmed, medium* · could give a wrong Fail  
  The user's own review words are read as the shop refusing the review.  
  *Made-up example:* A made-up review saying "anyone can review this product only after a month" gives Fail, User not being able to add reviews, with the user's sentence quoted as Amazon's message.
  - Same problem: **f-readers-3** · `flipkart/review-read.js:36` · Flipkart · *confirmed, medium*: The pattern for Flipkart's 'review not accepted' message also matches ordinary review words, and the row fails.
- **2.20 a-readers-5** · `amazon/ocr.js:245` · Amazon · *confirmed, medium* · could give a wrong Pass or Fail  
  On a computer's list of reviews, the user's last line is cut off and another person's review is picked.  
  *Made-up example:* A desktop list with Reviewer A's review and then Reviewer B's: the dashboard picks Reviewer B's.
- **2.21 a-check-7** · `amazon/check.js:1270` · Amazon · *plausible, low* · could give a wrong Fail  
  A review page that opens but cannot be read is called "Amazon review is deleted" (Fail) instead of going to staff.  
  *Made-up example:* The review link opens a page in another layout, and its review block is not found. Result: Fail, Amazon review is deleted.
- **2.22 f-check-10** · `flipkart/check.js:1516` · Flipkart · *confirmed, high* · could mislead (wrong Type or words)  
  Flipkart says "Review not live: not among the reviews Flipkart shows" when Flipkart's reviews were never read, or could not be read.  
  *Made-up example:* The product's page showed no way to see all its reviews. Result: Needs Manual, Review not live, and the email tells the user the review is not there.
  - Same problem: **parity-4** · `flipkart/check.js:1516` · Flipkart · *confirmed, high*: Flipkart's reviews that could not be read become 'Review not live: the review is not among the reviews Flipkart shows'.
  - Same problem: **f-reviews-mail-3** · `flipkart/reviews.js:250` · Flipkart · *confirmed, high*: Reviews that could not be read become "Review not live", and the email tells the user so.
  - Same problem: **f-reviews-mail-5** · `flipkart/reviews.js:182` · Flipkart · *not double-checked, medium*: A review page where no review could be read counts as "Flipkart shows no reviews".
- **2.23 f-check-11** · `flipkart/check.js:1546` · Flipkart · *confirmed, high* · could mislead (wrong Type or words)  
  Flipkart says "not among Flipkart's reviews" when a review with exactly the screenshot's words is there under another name.  
  *Made-up example:* The review screenshot has no name; Flipkart has a review with exactly its words under a name that is not in the file. Result: "not among".
- **2.24 f-check-13** · `flipkart/check.js:1120` · Flipkart · *confirmed, high* · could mislead  
  Flipkart opens Flipkart even when a review link is given and nothing needs searching. A Flipkart block then pauses rows that do not need it, and step 8 promises a later step that does not exist.  
  *Made-up example:* A rating screenshot plus a review link, and Flipkart shows a robot check: the row pauses with no Status. Without the block: Pass, with "the review link is opened in a later step".
  - Same problem: **parity-13** · `flipkart/check.js:1120` · Flipkart · *confirmed, high*: Flipkart step 8 promises 'the review link is opened in a later step', and a refused reading pauses rows that do not need it.
  - Same problem: **f-view-6** · `views/flipkart.js:117` · Flipkart · *confirmed, high*: Step 8 of a finished check says 'comes in a later step' and 'the review link is opened in a later step'; no later step opens it.
  - Same problem: **f-check-14** · `flipkart/check.js:1097` · Flipkart · *not double-checked, medium*: A row whose screenshots already fail still opens Flipkart, and a Flipkart block pauses it.
- **2.25 T21** · `amazon/check.js:1445-1458` · Amazon · *test gap* · could give a wrong Pass or Fail  
  No test of Amazon's search limit: 5 full pages of 10 reviews for each search word.
- **2.26 T22** · `amazon/check.js:1335-1339`, `1387`, `1408` · Amazon · *test gap* · could mislead  
  No test of Amazon's "Something else" cases: no product on the review page of a campaign row, no product page, no "See all reviews".
- **2.27 D-A7** · `amazon/check.js (review steps 7 to 9)` · Amazon · *data check, medium* · could mislead (wrong Type or words)  
  Amazon rows 37 and 123 differ from the staff answers saved in data/staff-check.json. Row 37: staff gave Pass (Verified), the dashboard gives Needs Manual Staff Checking (Review screenshot not matching), which is the safe side. Row 123: both Needs Manual, but staff chose "Review link needed" and the dashboard chose "Review screenshot not clear". Known since the accuracy check on 09-10-2026 (224 of 226 agree). The cause was not looked at in the audit.

## 3. Amounts and dates, on screenshots and in the file

**Fixed means:** only the amount actually paid is compared (your decision 3); Amazon checks the review's day (decision 1) and a delivery date before the order date (decision 2); Flipkart's "N months ago" is never taken as a sure day; dates in a column are read one way for the whole column; and any amount or date the dashboard cannot read for sure sends the row to a staff member.

- Your decision 3 is for a-check-4 and the items under it, and also for f-files-8 (an MRP column in the file is never the amount). Decision 1 is for a-check-9. Decision 2 is for a-check-8, and Flipkart gets the same rule (rule 2).
- Whether a text date is day first or month first cannot always be told. When nothing in the column shows it, those rows go to a staff member (rule 1).

- **3.1 a-check-4** · `amazon/check.js:585` · Amazon · *confirmed, medium* · could give a wrong Pass  
  An amount that was not paid counts as the same: the printed price (MRP, Flipkart's "Listing price"), a subtotal plus a fee, or the total before a discount, even when a different total was paid.  
  *Made-up example:* Form ₹654; the screenshot says "MRP ₹654 … Grand Total ₹499". Result: Pass, "The same: ₹654, the printed price".
  - Same problem: **a-readers-3** · `amazon/screen-text.js:244` · Amazon · *confirmed, medium*: An amount that was not paid (the total before a promotion, the items subtotal, the printed price) counts as "the same".
  - Same problem: **f-readers-4** · `flipkart/screen-text.js:289` · Flipkart · *confirmed, high*: Flipkart's 'Listing price' (the price before the discount) is accepted as the order's amount.
- **3.2 f-files-8** · `flipkart/workbook.js:543` · both screens · *plausible, low* · could give a wrong Pass or Fail  
  An "MRP" column that comes before the amount-paid column is taken as the file's amount.  
  *Made-up example:* Columns "MRP" then "Amount Paid": the MRP column is compared, and only a screenshot that shows just the total gives a Fail.
- **3.3 a-readers-6** · `amazon/screen-text.js:163` · Amazon · *confirmed, medium* · could give a wrong Fail  
  Phone status-bar numbers, or other products' prices, are read as the amount, so the row fails instead of going to staff.  
  *Made-up example:* Status bar "0.50 KB/s 85%"; no order ID and no amount on the screenshot; form ₹654. Result: Fail, Order details not matching.
- **3.4 a-check-19** · `amazon/check.js:746` · Amazon · *confirmed, high* · could mislead  
  The purchase or delivery card shows the misread amount while the comparison says "the same" (the code reads a field that does not exist).  
  *Made-up example:* The screenshot is read as "Grand Total 7654" and the form says ₹654. Result: Pass, but the card shows ₹7654.
  - Same problem: **a-readers-7** · `amazon/check.js:746` · Amazon · *confirmed, high*: The screenshot box shows the misread amount while the comparison says "the same".
- **3.5 f-reviews-mail-1** · `flipkart/review-page.js:294` · Flipkart · *confirmed, high* · could give a wrong Pass  
  Flipkart reads "1 month ago" too loosely, so a review posted before delivery can pass with a Note saying it came after.  
  *Made-up example:* Checked 12-10, delivered 24-09: a review shown as "1 month ago" gives Pass; the same review shown as "21 days ago" goes to staff.
  - Same problem: **f-check-8** · `flipkart/check.js:1223` · Flipkart · *confirmed, medium*: Pass when the review's day is only possibly after the delivery day, though the Note says it was.
  - Same problem: **X4** · `flipkart/review-page.js:269` · Flipkart · *cross check, low*: Flipkart's 'N months ago' (and 'N weeks ago') is treated as a sure earliest day.
- **3.6 a-check-9** · `amazon/check.js:1320`, also `flipkart/check.js:1218` · both screens · *confirmed, medium* · could give a wrong Pass  
  Amazon never checks when the review was posted. Flipkart counts only a review posted on or after the delivery day.  
  *Made-up example:* Delivered 22-07-2026; the review link opens a review dated 10-03-2025. Amazon: Pass.
- **3.7 a-check-8** · `amazon/check.js:775` · Amazon · *confirmed, medium* · could give a wrong Pass  
  A delivery date before the order date still passes. On Amazon it is only a sentence at the end of the Note.  
  *Made-up example:* Order date 20-07-2026; the delivery screenshot says "Delivered 14 July" and shows no order ID. Result: Pass.
- **3.8 a-check-11** · `amazon/check.js:127`, also `flipkart/check.js:190` · both screens · *plausible, low* · could give a wrong Fail  
  A stray date on the purchase screenshot, such as a computer's clock, is taken as the order date and called different.  
  *Made-up example:* No order date can be read, but a taskbar clock shows 15-10-2026, and the form says 20-07-2026. Result: Fail, Order details not matching.
- **3.9 a-files-4** · `amazon/workbook.js:144` · both screens · *confirmed, medium* · could give a wrong Fail  
  Dates written as words in the file are read day first, one cell at a time, so a month-first column is read two different ways.  
  *Made-up example:* A CSV file with "07/05/2026" meant as 5 July is read as 7 May, and the screenshot's 5 July gives Fail, Order details not matching.
  - Same problem: **f-files-7** · `flipkart/workbook.js:169` · both screens · *confirmed, medium*: Text dates fall back to month-first only when day-first is impossible, so a month-first column is read half right and half wrong.
  - Same problem: **X1** · `amazon/workbook.js:141 (copy: flipkart/workbook.js:166)` · both screens · *cross check, medium*: Text dates in the file can be read day-first or month-first, row by row, in the same column.
- **3.10 f-files-1** · `flipkart/workbook.js:575` · both screens · *confirmed, medium* · could give a wrong Pass  
  An order date or amount column the dashboard cannot read is quietly dropped, so it is never compared, and the screen says the file has no such column.  
  *Made-up example:* Date cells like "20th July 2026" and amount cells like "₹341 (incl. delivery)": both columns are dropped, and a row whose screenshot shows another total still passes.
- **3.11 a-check-15** · `amazon/check.js:841` · Amazon · *confirmed, high* · could mislead (wrong Type or words)  
  A missing or unreadable form value gets the Type "Order details not matching", and its email says the date or amount is different.  
  *Made-up example:* The order ID cell says "NA". The email says "your order NA … the order date or the amount you gave is different".
  - Same problem: **f-files-12** · `flipkart/workbook.js:166` · both screens · *confirmed, high*: A sheet value the reader cannot parse is called 'not a date' or 'not an order ID', with the Type 'Order details not matching' and an email blaming the screenshot.
  - Same problem: **T15** · `amazon/check.js:841`, `917-922`, `flipkart/check.js:1306`, `1395-1400` · both screens · *test gap*: No test that a missing or unreadable form value (an empty amount, "NA", a date written as words) is not compared and goes to staff. Only Amazon's order ID "NA" is tested.
- **3.12 f-readers-7** · `flipkart/screen-text.js:26` · Flipkart · *plausible, low* · could give a wrong Fail  
  Flipkart: an order ID read with one digit missing takes the mark after it as its last digit, so the row fails on an ID nobody wrote. (Placed here because the same reader reads amounts and dates.)  
  *Made-up example:* "OD1234…567 O" is read as an ID ending in 0, which differs from the file's ID. Result: Fail instead of a staff check.
- **3.13 T4** · `flipkart/check.js:1221` · Flipkart · *test gap* · could give a wrong Pass  
  No test that a Flipkart row goes to staff when the found review's posting day cannot be read.
- **3.14 T5** · `flipkart/check.js:1264-1266`, `1305`, `1347-1348` · Flipkart · *test gap* · could give a wrong Pass or Fail  
  No Flipkart test, at the level of the Status, for a different order date (Fail), one digit away (staff), and which Type wins when several problems fail.
- **3.15 T8** · `flipkart/check.js:1267-1336` · Flipkart · *test gap* · could give a wrong Pass or Fail  
  No Flipkart tests for the rescue rules copied from Amazon: an order ID one digit off on one screenshot but exact on the other; an amount one digit off while the other screenshot shows the form's amount; "Delivered" on the purchase screenshot; a product shown only by the start of its name. (Placed here for the numbers; its last two rules are group 2's.)
- **3.16 T11** · `flipkart/check.js:998-1005` · Flipkart · *test gap* · could give a wrong Pass or Fail  
  No test for which campaign start date is used when a row fits several campaigns, or when one of them has no start date.

## 4. Duplicates, and what is kept between checks and uploads

**Fixed means:** what catches a reused order, link, picture or review survives "Change the result", uploading the checked file again and a refused reading; every later row that shares an order ID or link is marked Duplicate; and only real copies are Duplicate (your decision 4), with anything unsure going to a staff member.

- Your decision 4 is for f-check-4 and f-readers-9. The other look-alike items (a-check-6, a-readers-11, f-check-5) follow the same idea on both screens: Duplicate only when the words show it is the same picture; otherwise a staff member checks.
- Staff results stay as they are (rule 3): a row a staff member changed is never made Duplicate or changed by another row's check.

- **4.1 a-routes-1** · `amazon/store.js:488` · Amazon · *confirmed, high* · could give a wrong Pass  
  Amazon's "Change the result" throws away the review the check found, so after "Check every row again" a later row that reuses that review is not caught.  
  *Made-up example:* Row 3's review is found; staff change Row 3 to Pass. After "Check every row again", Row 9 with the same review is not Duplicate and can pass.
- **4.2 a-routes-2** · `amazon/check.js:425` · both screens · *confirmed, high* · could give a wrong Pass  
  Rows skipped because the uploaded file already gives them a Status keep nothing from their earlier check, so a new row that reuses their review or screenshot is not caught.  
  *Made-up example:* Round 1: Row 10 passes. Round 2: the checked file is uploaded again with new rows, and new Row 60 uses a re-taken screenshot of Row 10's review. Row 60 can pass.
  - Same problem: **f-routes-2** · `flipkart/store.js:394` · Flipkart · *confirmed, medium*: Uploading the checked file again loses what catches a reused review.
- **4.3 f-routes-3** · `flipkart/routes.js:790` · Flipkart · *confirmed, medium* · could give a wrong Pass  
  When Flipkart refuses before any review page is read, every kept review counts as found and the row passes, with no pause.  
  *Made-up example:* A kept review matches the screenshot, and today Flipkart refuses the product page. Result: Pass, "as last seen".
  - Same problem: **f-check-2** · `flipkart/check.js:1087` · Flipkart · *confirmed, medium*: A kept copy of a review passes even when today's reading was stopped or read nothing.
  - Same problem: **f-reviews-mail-2** · `flipkart/check.js:1097` · Flipkart · *confirmed, medium*: Pass from the kept copy when today's reading of Flipkart failed; the pause is skipped.
- **4.4 f-routes-5** · `flipkart/routes.js:865` · Flipkart · *confirmed, medium* · could give a wrong Pass  
  Campaign products that Flipkart stopped are never read again before checking, so the start-date check (Possible misuse) and the product check are skipped.  
  *Made-up example:* Campaign start date 01-10-2026; its product was stopped by a robot check. A rating-only row ordered on 20-07-2026 gets Pass instead of Possible misuse.
- **4.5 f-reviews-mail-4** · `flipkart/reviews.js:152` · Flipkart · *confirmed, high* · could mislead  
  Going on from an earlier, unfinished reading never reads the newest page again.  
  *Made-up example:* Day 1: page 3 refused, pages 1 and 2 kept. Day 2: the reading goes on at page 3, so a review posted overnight on page 1 is never read. Result: Review not live.
  - Same problem: **f-reviews-mail-13** · `flipkart/reviews.js:181` · Flipkart · *not double-checked, medium*: After going on from a reading that ended on Flipkart's last page, up to 35 extra pages are opened and the result says "older reviews were not read".
- **4.6 T14** · `flipkart/check.js:117`, `1079`, `1097` · Flipkart · *test gap* · could give a wrong Pass or Fail  
  No test that a Flipkart reading stopped by "network" or "elsewhere" pauses the check, unless the review was already found.
- **4.7 a-routes-3** · `amazon/check.js:1088`, also `flipkart/check.js:572` · both screens · *confirmed, medium* · could give a wrong Pass  
  A later row with the same order ID or link as a row above, which already has a result, is never marked Duplicate. It is only named in the first row's Note, so one order can pass twice.  
  *Made-up example:* A hand row with order ID A passes. Later a file row with A is checked: its Note names the hand row, but both rows keep Pass.
  - Same problem: **parity-11** · `amazon/check.js:1088` · both screens · *confirmed, high*: A later row sharing an order ID or link is called 'a duplicate' in the first row's Note but is never marked Duplicate.
  - Same problem: **f-check-7** · `flipkart/check.js:572` · both screens · *confirmed, low*: A new row above a row the file already passed can pass the same order again, and its Note says the other row was not checked.
- **4.8 a-check-5** · `amazon/check.js:1097`, also `flipkart/check.js:576` · both screens · *confirmed, medium* · could give a wrong Fail  
  Two rows that give the same link which is not a picture fail the later row as Duplicate.  
  *Made-up example:* Rows 1 and 2, each with its own order ID, both paste the link of Amazon's order history page. Row 2: Fail, Duplicate.
  - Same problem: **f-check-6** · `flipkart/check.js:576` · both screens · *confirmed, low*: Any link shared by two rows' screenshot cells makes a Duplicate, even one that is not a picture.
  - Same problem: **f-files-6** · `flipkart/screenshots.js:52` · both screens · *confirmed, medium*: Any link in a screenshot cell counts as a screenshot, so rows that paste the same product link become Duplicate (Fail).
- **4.9 f-check-3** · `flipkart/check.js:1093` · Flipkart · *confirmed, medium* · could give a wrong Fail  
  Flipkart: a row whose screenshots fail still "claims" the review it found, so the real owner's row becomes Duplicate.  
  *Made-up example:* Row 1's screenshots show another order (Fail), but it found Row 5's review. Row 5 becomes a Duplicate of Row 1.
- **4.10 f-check-4** · `flipkart/duplicates.js:68` · Flipkart · *plausible, medium* · could give a wrong Fail  
  Two users' look-alike review screenshots with the same short words count as one picture, so the later row fails as Duplicate.  
  *Made-up example:* Two rows both read "Terrific purchase / Good product", and their pictures are within the look-alike mark. The later row: Fail, Duplicate.
  - Same problem: **f-readers-9** · `flipkart/duplicates.js:68` · Flipkart · *plausible, medium*: Two different users' 'My Reviews' screenshots with the same short review are called the same picture, and the later row fails as Duplicate.
- **4.11 a-check-6** · `amazon/check.js:178` · Amazon · *plausible, low* · could give a wrong Fail  
  Amazon: two users' look-alike "Thanks for rating!" screens, with no words of their own, count as the same picture.  
  *Made-up example:* Rows 1 and 2 send the same product's "Thanks for rating!" screen; the words differ only in the clock. Row 2: Fail, Duplicate.
- **4.12 a-readers-11** · `amazon/image-read.js:309` · Amazon · *plausible, low* · could give a wrong Fail  
  Amazon: two customers' nearly identical screenshots can be judged the same picture.  
  *Made-up example:* Rows 4 and 9 send the same product's rating screen from the same phone model. Row 9: Fail, Duplicate.
- **4.13 f-check-5** · `flipkart/duplicates.js:46` · both screens · *plausible, low* · could give a wrong Fail  
  Delivery screenshots with no order ID that differ only in the date count as one picture.  
  *Made-up example:* Two delivery cards, "Delivered, Oct 05" and "Delivered, Oct 09", for the same product: the later row can fail as Duplicate.
- **4.14 a-mail-login-1** · `amazon/routes.js:497` · Amazon · *plausible, low* · could give a wrong Pass  
  When a picture's fingerprint cannot be made, the look-alike duplicate check is quietly skipped.  
  *Made-up example:* Rows 3 and 7 give the same delivery screenshot, saved again. The fingerprint fails for Row 7, which can pass with no word that the check was skipped.
  - Same problem: **D-F9** · `flipkart/fingerprint.js` · Flipkart · *data check, high*: Flipkart rows 8 and 15: their kept pictures have no fingerprint, so a copy saved again in another row can only be found if it is the very same file.
- **4.15 a-routes-14** · `amazon/check.js:374` · Amazon · *confirmed, high* · could mislead  
  Amazon's Duplicate Note says a row with a Status from the file "is the one that will be checked", but it never is. (Flipkart was corrected in step 19.)  
  *Made-up example:* Row 2 has Pass from the file, and Row 9 shares its order ID. Row 9's Note says Row 2 will be checked, but it never is.
  - Same problem: **parity-9** · `amazon/check.js:374` · Amazon · *confirmed, high*: Amazon's duplicate Note says the first row 'is the one that will be checked' when 'Start checking' never checks it.
- **4.16 D-A6** · `amazon/check.js:1088` · Amazon · *data check, high* · only looks wrong  
  Amazon rows 36, 67, 98, 135 and 154: the first row's Note names the same later Duplicate row twice, in two sentences (for example same order ID and same purchase screenshot).
- **4.17 T6** · `amazon/check.js:1468`, `amazon/check.js:424-436` · Amazon · *test gap* · could give a wrong Pass  
  No test that an Amazon review found by searching (step 9), whose review ID another row's check already found, makes the later row a Duplicate.
- **4.18 T16** · `amazon/store.js:464-469`, `amazon/routes.js:490-501`, `flipkart/check.js:451-456`, `flipkart/store.js:76-96` · both screens · *test gap* · could give a wrong Pass or Fail  
  No test of look-alike duplicates between rows checked at different times, through what is kept from earlier checks.
- **4.19 T17** · `amazon/check.js:134-140` · Amazon · *test gap* · could give a wrong Pass or Fail  
  No test that a file row comes before any row added by hand when deciding which of two rows is the Duplicate.

## 5. Reading the uploaded file, and the two downloads

**Fixed means:** links, columns, pictures and order IDs are read as the file holds them; the dashboard asks when it is not sure which column to use; the file's own Status column counts only when it holds a real Status; and both downloads hold only results the dashboard or a staff member really gave, with row numbers that match the Excel file.

- **Left, with the reason (a-files-2, X2):** digits that Excel already dropped from an order ID cannot be got back. The fix spots such IDs and sends the row to a staff member, saying why.
- a-files-12: Flipkart may never read Amazon's settings.json (CLAUDE.md rule 5). So Flipkart's list of picture websites moves into Flipkart's own settings, or its Note stops saying a website can be added.

- **5.1 a-files-1** · `amazon/links.js:314`, also `flipkart/links.js:228` · both screens · *confirmed, high* · could give a wrong Fail  
  A link behind a cell is cut at its first "%20" or "%2C", so two different files can look like one link. Google Drive links are not affected.  
  *Made-up example:* Rows 1 and 2 link to two different "WhatsApp Image …" files; both are cut to ".../WhatsApp". Row 2 fails as Duplicate, and Row 1's download fails.
- **5.2 f-files-4** · `flipkart/workbook.js:464` · both screens · *confirmed, medium* · could give a wrong Fail  
  Link words whose link was lost (a CSV file, or a link built from pieces) count as "screenshot missing", a Fail.  
  *Made-up example:* A file whose cells say "Screenshot", with Drive links behind them, is saved as CSV. Every row fails "Purchase screenshot missing".
- **5.3 a-files-9** · `amazon/links.js:263`, also `flipkart/links.js:181` · both screens · *confirmed, low* · could give a wrong Fail  
  A link stuck to a word in front of it is not found, so the cell counts as empty.  
  *Made-up example:* A cell typed as "Proof:https://drive.google.com/…" gives Fail, Purchase screenshot missing.
- **5.4 a-files-12** · `settings.json:34` · Flipkart · *confirmed, high* · could mislead  
  A picture website added to settings.json works only on Amazon. Flipkart's list is fixed in its code, yet its Note says the website can be added.  
  *Made-up example:* Staff add a website as the Note advises. Amazon rows on it download; Flipkart rows stay Need Access, with the same advice.
  - Same problem: **f-files-13** · `flipkart/screenshots.js:32` · Flipkart · *confirmed, high*: Flipkart's picture-website list and download gap are hard-coded, yet the Note tells staff a website 'can be added to that list'.
- **5.5 a-files-3** · `amazon/workbook.js:589` · both screens · *confirmed, medium* · could give a wrong Pass or Fail  
  The first column whose name could fit is used, not the best match, and a guessed column is never shown to staff to confirm.  
  *Made-up example:* A "Date" column (the day the row was typed) comes before "Order Date". The wrong one is compared, and rows fail Order details not matching.
- **5.6 a-files-10** · `amazon/workbook.js:599` · Amazon · *confirmed, medium* · could give a wrong Fail  
  A column of product links can become the review link column without asking, so every row fails "Wrong review link".  
  *Made-up example:* A product link column comes before "Feedback Link". Every row fails "The review link opens a product page".
  - Same problem: **f-files-3** · `flipkart/workbook.js:629` · Flipkart · *confirmed, medium*: A column of Flipkart product links is taken as the review link column, so every row fails 'Wrong review link'.
- **5.7 a-routes-13** · `amazon/routes.js:389` · both screens · *confirmed, high* · could mislead  
  The line under the upload says the Reviewer Name column is "only shown, not used for checking", but it decides "Reviewer name is different".  
  *Made-up example:* The upload says the column is not used, and then rows come back as "Reviewer name is different" because of it.
  - Same problem: **f-routes-8** · `flipkart/routes.js:375` · both screens · *confirmed, high*: The Reviewer Name column is described as 'not used for checking', though it decides the Status.
  - Same problem: **f-view-3** · `flipkart/routes.js:375` · both screens · *confirmed, high*: Upload line says the Reviewer Name column is 'Only shown, not used for checking', but the check uses it.
  - Same problem: **a-files-11** · `amazon/routes.js:316` · both screens · *confirmed, medium*: The reviewer name column is said to be 'not used for checking', and a file without one never says the name was not compared.
- **5.8 f-routes-9** · `flipkart/routes.js:725` · Flipkart · *confirmed, high* · only looks wrong  
  Flipkart treats an empty Reviewer Name cell like no column, so the Note never says the name was not compared. Amazon's Note does.  
  *Made-up example:* A row with an empty Reviewer Name cell passes, and its Note lacks the sentence that the name was not compared.
- **5.9 a-files-2** · `amazon/workbook.js:66` · Amazon · *confirmed, medium* · could give a wrong Fail  
  Amazon: a 17-digit order ID that the spreadsheet stored as a number loses its last digits, so the row fails "Order ID is not matching" or looks like a Duplicate.  
  *Made-up example:* An ID typed without hyphens becomes a number. The check reads a different ID, and the email says the user gave the wrong ID.
  - Same problem: **X2** · `amazon/workbook.js:64` · Amazon · *cross check, medium*: An Amazon order ID stored as a number in the file becomes a wrong ID: wrong 'Order ID not matching' Fail and false Duplicates.
- **5.10 f-files-9** · `flipkart/workbook.js:209` · both screens · *plausible, low* · could give a wrong Pass or Fail  
  Only the first order ID in a cell is used.  
  *Made-up example:* A cell holds two order IDs, and the screenshot shows the second: Fail, Order ID is not matching. A later row with the second ID is not caught as Duplicate.
- **5.11 f-files-5** · `flipkart/workbook.js:386` · both screens · *confirmed, medium* · could give a wrong Fail  
  Floating pictures are placed by their top-left corner only, so a picture that sits a little above its row goes to the wrong row, or is dropped.  
  *Made-up example:* Row 2's picture starts just inside Row 1, so Row 2 has no purchase screenshot (Fail).
- **5.12 a-files-7** · `amazon/workbook.js:691` · both screens · *confirmed, medium* · could mislead  
  A second floating picture over the same cell is dropped, and the upload says it is not in a picture column.  
  *Made-up example:* A screenshot pasted as two halves: only the first half is read. With the order ID on the other half, the row gets "not clear".
- **5.13 a-routes-12** · `amazon/routes.js:969` · both screens · *confirmed, medium* · could mislead (wrong Type or words)  
  A picture inside a cell that is over 10 MB is kept as "not clear" without being read, while the same picture from a link is made smaller and read.  
  *Made-up example:* A 12 MB screenshot in the cell gives "Purchase screenshot not clear", and an email asking for a clearer one.
- **5.14 f-readers-8** · `flipkart/shot-read.js:94` · Flipkart · *confirmed, medium* · could mislead  
  When one of several pictures in a cell cannot be read clearly, it is dropped without a word, and what it shows (such as the amount) counts as not shown.  
  *Made-up example:* One clear picture and one blurred price picture: the amount is "not shown", and the row can pass with no warning.
  - Same problem: **T19** · `amazon/check.js:708`, `flipkart/check.js:659` · both screens · *test gap*: No test that when only some of several pictures in a cell open, the Note says so (a Pass is still possible).
- **5.15 a-files-8** · `amazon/pictures.js:392` · both screens · *confirmed, high* · could mislead (wrong Type or words)  
  Download failures that are nobody's fault (the website is down, the link is a Drive folder) get "not clear" or "Need Access", and the email asks the user to send again.  
  *Made-up example:* The picture website is down during a run, so every row on it gets Need Access and an email asking for the screenshot again.
  - Same problem: **f-files-11** · `flipkart/pictures.js:275` · both screens · *confirmed, high*: Download failures that are not about the picture become '… screenshot not clear', or Need Access on other websites.
  - Same problem: **a-mail-login-15** · `amazon/emails.js:311` · both screens · *not double-checked, medium*: 'Not clear' emails blame the screenshot's content when the file could not be opened at all.
  - Same problem: **f-readers-11** · `flipkart/shot-read.js:107` · both screens · *not double-checked, medium*: A failure on this computer (Tesseract missing, broken or timed out) is reported as a 'not clear' screenshot, and the user is asked for a clearer one.
- **5.16 T10** · `flipkart/check.js:1292-1296`, `flipkart/check.js:255-271` · Flipkart · *test gap* · could give a wrong Pass or Fail  
  No Flipkart test, at the level of the Status, for a file with no screenshot column (staff, not Fail), and for screenshots that cannot be had (Need Access, Something else, not clear).
- **5.17 f-routes-1** · `flipkart/store.js:46` · both screens · *confirmed, high* · could mislead  
  Any word in the file's Status column counts as a finished result. Those rows are skipped, shown as "Needs Manual Staff Checking, From the file", counted, and written to the downloads.  
  *Made-up example:* A Status column holds "Pending" on every row: all rows show Needs Manual, "All rows are checked", and a later row with Row 1's order ID becomes Duplicate.
  - Same problem: **a-routes-9** · `amazon/store.js:50` · both screens · *confirmed, medium*: Any words in the file's Status column count as a result: those rows are skipped, called "checked", counted, and downloaded as a Status.
  - Same problem: **a-view-7** · `views/amazon.js:1871` · Amazon · *confirmed, medium*: Any word in the file's Status cell makes a row count as already checked, shown with a Status the file never had.
  - Same problem: **f-view-2** · `views/flipkart.js:709` · both screens · *confirmed, medium*: Any word in the file's Status column counts as a result, under a Status word the file may not have.
  - Same problem: **shared-1** · `views/amazon.js:771` · both screens · *confirmed, medium*: "The results only" CSV shows a file's own Status as if the dashboard had checked the row.
  - Same problem: **f-files-14** · `flipkart/workbook.js:547` · both screens · *not double-checked, medium*: Any words in a column named 'Status' count as a result: 'Pending' rows show Needs Manual Staff Checking and are never checked.
  - Same problem: **f-check-16** · `flipkart/final.js:153` · both screens · *not double-checked, medium*: Any other word in the file's Status column becomes 'Needs Manual Staff Checking', and the row is never checked.
- **5.18 a-files-6** · `amazon/workbook.js:508` · both screens · *confirmed, medium* · could mislead  
  Columns named Status, Type, Reason, Note, Remarks or Comments become the result columns without staff being told, and are written over.  
  *Made-up example:* A "Comments" column written by users is overwritten by Notes in the checked Excel file.
  - Same problem: **f-routes-12** · `flipkart/routes.js:372` · both screens · *not double-checked, medium*: A file's Type, Note, Remarks or Comments column is overwritten without ever being named.
- **5.19 a-routes-4** · `amazon/routes.js:608` · Amazon · *confirmed, medium* · could give a wrong Pass or Fail  
  Amazon rows added by hand are checked with the uploaded file's columns, so details typed in the form are not compared, or are called missing.  
  *Made-up example:* A hand row has a review screenshot. Then a file with no review screenshot column is uploaded, and the hand row fails "Review link or screenshot missing".
- **5.20 a-routes-10** · `amazon/routes.js:995` · both screens · *confirmed, high* · could mislead  
  After "Check every row again" is stopped part way, "The checked Excel file" still holds the old results for the rows not checked again, while the screen shows them as not checked.  
  *Made-up example:* Stop after 20 of 100 rows and download: rows 21 to 100 still show last round's results, with nothing to tell them apart.
  - Same problem: **a-view-8** · `amazon/routes.js:995` · Amazon · *confirmed, medium*: After "Check every row again" is stopped or paused, the checked Excel file still shows the old Statuses that the screen has cleared.
  - Same problem: **a-files-5** · `amazon/routes.js:995` · both screens · *confirmed, high*: After 'Check every row again', the checked Excel file keeps the old Status, Type and Note for rows not yet checked again.
  - Same problem: **f-routes-11** · `flipkart/routes.js:1047` · both screens · *confirmed, high*: The checked Excel file keeps old Statuses that the screen no longer shows.
  - Same problem: **parity-16** · `amazon/routes.js:995` · both screens · *not double-checked, medium*: After a partial 'Check every row again', the checked Excel file still shows the file's old Statuses that the screen hides.
- **5.21 f-files-15** · `flipkart/routes.js:1050` · both screens · *confirmed, high* · could mislead  
  Notes in "The checked Excel file" name rows by the dashboard's number, which is not Excel's row number.  
  *Made-up example:* A Note says "also in row 7", but Excel's row 7 is a different order (the dashboard's Row 6).
  - Same problem: **X3** · `amazon/notes.js:42 (numbers from amazon/workbook.js:733 and flipkart/workbook.js:763)` · both screens · *cross check, high*: 'row N' in Notes is the dashboard number, not the Excel row, but it is written into the checked Excel file.
  - Same problem: **f-check-17** · `flipkart/duplicates.js:34` · both screens · *not double-checked, medium*: Row numbers in Notes are the dashboard's, but the same Notes are written into the checked Excel file.
  - Same problem: **a-view-12** · `views/amazon.js:771` · both screens · *not double-checked, medium*: "The results only" has only the dashboard's row number, which does not line up with the uploaded file's rows.
- **5.22 f-files-10** · `flipkart/store.js:418` · Flipkart · *confirmed, high* · could mislead  
  A Flipkart tab named "Flipkart " (with an extra space) uploads fine, but "The checked Excel file" is always refused.  
  *Made-up example:* The upload works, and every download of the checked file is refused, with advice that cannot help.
- **5.23 D-A5** · `amazon/xlsx-write.js` · Amazon · *data check, medium* · only looks wrong  
  Amazon: "The checked Excel file" keeps the tab's old size range (its <dimension> line), which does not reach the 3 new Status, Type and Note columns. Look at Flipkart's copy too.
- **5.24 X10** · `views/amazon.js:773 (same: views/flipkart.js:1523)` · both screens · *cross check, high* · only looks wrong  
  "The results only" file is named with the UTC date, not India's.  
  *Made-up example:* Downloaded at 02:00 on 20-10-2026 India time, it is named "…2026-10-19.csv", while the checked Excel file a minute later says 2026-10-20.
  - Same problem: **a-view-13** · `views/amazon.js:773` · both screens · *not double-checked, high*: The results file is named with the UTC date, not the India date.
  - Same problem: **a-routes-18** · `views/amazon.js:773` · both screens · *not double-checked, high*: "The results only" CSV is named with the UTC date, while the checked Excel file uses the India date.
  - Same problem: **f-view-14** · `views/flipkart.js:1523` · both screens · *not double-checked, high*: 'The results only' file name uses the UTC date; the checked Excel uses India's date.
  - Same problem: **shared-10** · `views/amazon.js:773` · both screens · *not double-checked, high*: "The results only" file name uses the UTC date; the checked Excel file uses the India date.
  - Same problem: **parity-17** · `views/amazon.js:773` · both screens · *not double-checked, high*: 'The results only' is named with the UTC date, the Excel file with India's date.

## 6. Emails

**Fixed means:** every email says only what the check found for that row, never states a possible misreading as a fact, asks only for what is really missing, and cannot be sent when it is out of date, or twice by mistake.

- Flipkart's emails stay copy-only (never sent by the dashboard), as now. Amazon's sending stays as it is, apart from these fixes.

- **6.1 a-view-1** · `views/amazon.js:1134` · Amazon · *confirmed, high* · could mislead  
  Amazon: an email box opened before "Check again" or "Change the result" still sends the old email, and the server does not check the row's Type.  
  *Made-up example:* Row 1 is "Not delivered". Staff open its email and press "Check again", and the row passes. The old email can still be sent.
  - Same problem: **a-routes-7** · `amazon/routes.js:1424` · Amazon · *confirmed, high*: Send sends the email as it was prepared, without checking that the row still has that Type.
  - Same problem: **a-mail-login-9** · `amazon/routes.js:1425` · Amazon · *not double-checked, medium*: An email prepared before 'Check again' or 'Change the result' can still be sent with its old Type.
- **6.2 a-view-2** · `views/amazon.js:935` · Amazon · *confirmed, high* · could mislead  
  Amazon: after an email is sent, Send stays on and sends it again, with no "emailed before" question.  
  *Made-up example:* Real mode: Send, "The email was sent.", Send again: the user gets a second email.
  - Same problem: **shared-3** · `views/amazon.js:935` · Amazon · *confirmed, high*: Pressing Send again sends emails a second time without the "emailed before" question.
- **6.3 a-view-3** · `views/amazon.js:2056` · Amazon · *confirmed, medium* · could mislead  
  "Emailed before" never says whether the email was a test, and it shows only the last email.  
  *Made-up example:* Only a test email was sent. Later the Real-mode question says "emailed before", and staff may cancel an email that is needed.
- **6.4 a-routes-6** · `amazon/routes.js:287` · both screens · *confirmed, high* · could mislead  
  Emails are offered for every Type whatever the Status, including rows sent to staff because of the dashboard's own limits, and those emails tell the user something false.  
  *Made-up example:* A file with no purchase screenshot column: every row is Needs Manual, and "Email these users" tells each user they did not add one.
  - Same problem: **a-view-4** · `views/amazon.js:1805` · Amazon · *not double-checked, medium*: "Email these users" mixes Fail rows with rows the dashboard was unsure about, and the lines do not show the Status.
- **6.5 f-reviews-mail-10** · `flipkart/emails.js:398` · Flipkart · *confirmed, high* · could mislead  
  Flipkart's "Something else" email asks the user to send everything again for the dashboard's own problems.  
  *Made-up example:* Everything matches, but the review's date words were not understood. The email asks the user to send two screenshots again.
  - Same problem: **parity-8** · `flipkart/emails.js:157` · Flipkart · *not double-checked, medium*: Flipkart offers a 'Something else' email asking the user to resend proof, even when the cause is the dashboard's own.
  - Same problem: **D-F4** · `flipkart/emails.js:398` · Flipkart · *data check, high*: Flipkart row 6: the "Something else" email asks for two new screenshots, though both order screenshots passed and only the review screenshot was not clear.
- **6.6 a-mail-login-2** · `amazon/emails.js:268` · both screens · *confirmed, high* · could mislead  
  Emails state possible reading slips as facts, for rows the check gave to a staff member.  
  *Made-up example:* One digit of the order ID was misread (a staff case), and the email tells the user their screenshot shows a different ID.
  - Same problem: **f-reviews-mail-7** · `flipkart/emails.js:284` · Flipkart · *confirmed, high*: Emails state as fact values the check called reading slips or possible reading mistakes.
  - Same problem: **D-A2** · `amazon/emails.js:268` · Amazon · *data check, high*: Amazon row 178: the email tells the user the amount is different, while the row went to staff because the amount read may be one digit off.
- **6.7 a-mail-login-3** · `amazon/emails.js:274` · both screens · *confirmed, high* · could mislead  
  The order-details email blames an amount the check had already accepted.  
  *Made-up example:* The Fail is for the date, but the email also says the amount is different.
- **6.8 a-mail-login-4** · `amazon/emails.js:279` · both screens · *confirmed, high* · could mislead  
  The order-details email says the date or amount is different when the form simply lacks a value.  
  *Made-up example:* The amount cell is empty, and the email blames a different amount.
  - Same problem: **f-reviews-mail-6** · `flipkart/emails.js:290` · Flipkart · *confirmed, high*: "Order details not matching" email blames the date or amount when the form lacks a detail.
- **6.9 a-mail-login-5** · `amazon/emails.js:215` · Amazon · *confirmed, high* · could mislead  
  A pending order that shows only "Cancel items" gets the "cancelled or returned" email.  
  *Made-up example:* The screenshot shows a pending order with a "Cancel items" button: Fail, Not delivered, and the user is told it looks cancelled.
- **6.10 a-mail-login-6** · `amazon/emails.js:341` · Amazon · *confirmed, high* · could mislead  
  The Need Access email asks for "the same screenshot again" when the problem was the review link.  
  *Made-up example:* The review cell holds a "write a review" link, and the email asks for the same screenshot instead of the review's link.
- **6.11 a-mail-login-7** · `amazon/emails.js:77` · both screens · *confirmed, high* · could mislead  
  The "screenshot missing" emails say the user did not add it when the file has no such column.  
  *Made-up example:* A file with no purchase screenshot column: every user is told they did not add it.
  - Same problem: **a-files-13** · `settings.json:75` · Amazon · *not double-checked, medium*: The 'Purchase screenshot missing' email tells users they left it out of the form, even when the file simply has no such column.
- **6.12 a-routes-8** · `amazon/routes.js:1358` · both screens · *confirmed, medium* · could mislead  
  For a result changed by staff, the email's "what is wrong" comes from the dashboard's old check, which staff overruled.  
  *Made-up example:* Staff set Fail because the date is wrong, and the email blames the amount the dashboard had misread.
- **6.13 f-reviews-mail-8** · `flipkart/emails.js:294` · Flipkart · *confirmed, high* · could mislead  
  The "Product is not matching" email compares with the form's product, though the check compared with the campaign's products.  
  *Made-up example:* The email quotes the screenshots' product, then asks for a screenshot of the form's product name.
  - Same problem: **D-A3** · `amazon/emails.js` · Amazon · *data check, low*: Amazon rows 20, 36, 65, 77, 136 and 145: the product email quotes the fuller product name and asks for a review of the file's product name, while the check compared with the campaign's products.
- **6.14 f-reviews-mail-9** · `flipkart/emails.js:334` · Flipkart · *confirmed, high* · could mislead  
  The "names do not match" email is offered when no name was compared, and can list the same name twice.  
  *Made-up example:* There is no name on the review screenshot, but the email says "the names we found do not match" and lists one name twice.
  - Same problem: **D-F6** · `flipkart/emails.js:334` · Flipkart · *data check, medium*: Flipkart row 30: the reviewer-name email says "the names we found do not match" when Flipkart shows no name ("Flipkart Customer").
- **6.15 f-reviews-mail-11** · `flipkart/emails.js:360` · Flipkart · *confirmed, high* · could mislead  
  Flipkart emails claim things the check never found out.  
  *Made-up example:* With no campaign set up, the email says "we looked for your review on Flipkart and could not find it".
  - Same problem: **D-F5** · `flipkart/emails.js` · Flipkart · *data check, medium*: Flipkart rows 1, 7 and 9: the "Review not live" email says the reviews were checked back to a day, but not that Flipkart hides older reviews (the Note says the review may be among them).
  - Same problem: **f-reviews-mail-15** · `flipkart/emails.js:349` · Flipkart · *not double-checked, medium*: Email states the oldest review day as exact when Flipkart gave only months.
- **6.16 f-reviews-mail-12** · `flipkart/emails.js:353` · Flipkart · *not double-checked, medium* · could mislead  
  The "Review not live" email asks for a Published-tab screenshot that the user already sent. (No second helper checked it, but the data check found it on a real row.)  
  *Made-up example:* The user's screenshot shows the Published tab, and the email still asks for one.
  - Same problem: **D-F3** · `flipkart/emails.js:353` · Flipkart · *data check, high*: Flipkart row 37: the "Review not live" email asks for a Published-tab screenshot, which the user's review screenshot already shows.
- **6.17 D-F2** · `flipkart/emails.js` · Flipkart · *data check, high* · could mislead  
  Flipkart rows 3, 12, 20, 32, 34, 36, 38, 41, 42, 43 and 44: the "Delivery screenshot missing" email asks only for a delivery screenshot, though the review link and review screenshot are missing too (the Note says so). After sending it, the user would still fail.
- **6.18 f-reviews-mail-14** · `flipkart/emails.js:235` · Flipkart · *confirmed, high* · privacy  
  Flipkart keeps, shows and emails the "Delivered to" name read from the delivery screenshot, though the code's own comments say it is never kept.  
  *Made-up example:* A "Delivered to <name> at Home" line: the name is in the check's record, on the row's page and in the reviewer-name email.

## 7. Status, Type, step marks, words on the screen and README

**Fixed means:** the Status, Type, step marks, comparison table and Note of each row agree with each other on both screens, README says what the dashboard does today, and each smaller finding below is checked first and fixed only if it is real.

- README.md is a shared file. Rewriting its Flipkart and Safety parts is more than a few lines, so the step asks you first (CLAUDE.md rule 3).
- Staff results stay as they are (rule 3), Flipkart row 15 included.

- **7.1 a-check-12** · `amazon/check.js:1170` · Amazon · *confirmed, high* · could mislead (wrong Type or words)  
  Amazon: a missing review plus an unclear screenshot gives Fail with the screenshot's staff Type, so the Type and the email ask for the wrong thing. Flipkart gives "Review link or screenshot missing".  
  *Made-up example:* Empty review cell, and a purchase screenshot without the order ID: Fail, "Purchase screenshot not clear", and the email asks only for a clearer purchase screenshot.
  - Same problem: **parity-15** · `amazon/check.js:1170` · Amazon · *confirmed, high*: Amazon: a missing review plus an unclear screenshot gives Fail with the screenshot's manual Type and its email.
  - Same problem: **T1** · `amazon/check.js:1170`, `amazon/check.js:1531-1536`, `flipkart/check.js:1663-1667` · both screens · *test gap*: No test for a missing review together with a screenshot problem only a staff member can decide (not clear, no Drive access, a detail not shown). Amazon gives Fail with the screenshot's staff Type; Flipkart gives "Review link or screenshot missing". The screens disagree.
- **7.2 parity-6** · `flipkart/check.js:1645` · Flipkart · *confirmed, medium* · could give a wrong Fail  
  The same row can get a different Status on each screen: Flipkart lets the review, or a later step, fail a row that Amazon sends to staff.  
  *Made-up example:* Three made-up rows: Flipkart gives Fail each time, and Amazon gives Needs Manual Staff Checking.
  - Same problem: **T12** · `flipkart/check.js:1658-1705` · Flipkart · *test gap*: No test for the order of Flipkart's Status decision in step 10 when several problems come together.
- **7.3 a-check-13** · `amazon/check.js:1622`, also `flipkart/check.js:1796` · both screens · *confirmed, high* · could mislead  
  The comparison table can disagree with the Status, Type and steps.  
  *Made-up example:* An order ID reading slip accepted for the Status still shows as "Different" in red in the table.
  - Same problem: **f-check-15** · `flipkart/check.js:895` · Flipkart · *confirmed, high*: An order ID taken as a reading slip shows as a mismatch in step 5 and the comparison table.
  - Same problem: **parity-2** · `flipkart/check.js:1795` · Flipkart · *confirmed, high*: Flipkart shows an order-ID reading slip as 'Different' in red and step 5 as failed, while the row passes.
- **7.4 a-check-14** · `amazon/check.js:684`, also `flipkart/check.js:1712` · both screens · *confirmed, high* · could mislead  
  Step lines show ✗ "failed" on rows that passed, and step 10 shows ✗ for every Needs Manual row.  
  *Made-up example:* The purchase screenshot lacks the product, but the delivery screenshot shows it: Pass, with ✗ on step 3.
  - Same problem: **a-view-9** · `amazon/check.js:1565` · both screens · *confirmed, high*: Step 10 shows a red "failed" for a row whose Status is Needs Manual Staff Checking.
  - Same problem: **D-A1** · `amazon/check.js:1165` · Amazon · *data check, high*: Amazon Pass rows 90, 106 and 144 show a red ✗ on step 3. Each screenshot's own step is marked failed before both screenshots are judged together, and the mark is not updated after. The Pass itself is right.
- **7.5 a-view-10** · `views/amazon.js:2545` · both screens · *not double-checked, high* · could mislead  
  A row made Duplicate by another row's check shows all ten steps as "waiting" and "Not read yet". (No second helper checked it, but the data check found it on real rows.)  
  *Made-up example:* Checking Row 1 makes Row 3 a Duplicate. Row 3's page says Fail, while every step says "waiting".
  - Same problem: **f-view-9** · `views/flipkart.js:746` · Flipkart · *not double-checked, high*: A row marked Duplicate by another row's check says it 'took less than a second'.
  - Same problem: **D-A4** · `views/amazon.js:2545` · Amazon · *data check, high*: Amazon rows 41, 133, 141 and 234 (made Duplicate by another row's check) show all 10 steps as "waiting".
- **7.6 a-view-6** · `views/amazon.js:1849` · both screens · *confirmed, medium* · could mislead  
  The staff line counts a staff decision on a "Needs Manual Staff Checking" row as the dashboard being wrong.  
  *Made-up example:* Staff decide all 30 rows the dashboard flagged, and the line says 0 right (0%).
  - Same problem: **D-F8** · `views/flipkart.js:922` · Flipkart · *data check, medium*: Flipkart row 15: the staff line counts it as the dashboard being wrong ("0 right (0%)"), though staff kept its Type and only decided the Status the dashboard had left to them.
- **7.7 a-view-5** · `views/amazon.js:1847`, also `views/flipkart.js:922` · both screens · *confirmed, high* · only looks wrong  
  The staff line rounds 99.5% or more up to "100%".  
  *Made-up example:* 225 of 226 right shows "(100%)".
- **7.8 a-view-11** · `views/amazon.js:2327` · Amazon · *confirmed, medium* · could mislead  
  In a review cell with two links, "Not opened" is shown next to the wrong link.  
  *Made-up example:* "Not opened" sits next to the Amazon link instead of the private Drive link, so staff open the wrong one.
- **7.9 f-view-1** · `views/flipkart.js:2133` · Flipkart · *confirmed, medium* · could mislead  
  Flipkart's row page shows a check's Status, Type and Note even when the server then says nothing was saved.  
  *Made-up example:* Saving fails after a Pass: the row's page shows Pass, while the table and the downloads have no result.
- **7.10 f-routes-7** · `flipkart/screenshots.js:136` · Flipkart · *confirmed, high* · only looks wrong  
  Flipkart's pause messages for a Google sign-in page, a robot check or a download limit are cut short.  
  *Made-up example:* "Paused at Row 7. Google asked to log in That row is not checked yet…", with no button named.
- **7.11 a-mail-login-11** · `live-browser.html:16` · Amazon · *confirmed, high* · only looks wrong  
  The Live Amazon Browser's own page says stopped steps go to a staff member, but the check pauses.  
  *Made-up example:* Staff read it during a robot check and think the row went to staff.
- **7.12 f-readers-12** · `flipkart/review-read.js:424` · Flipkart · *confirmed, high* · only looks wrong  
  With no reviewer name in the file, the Note says "none is under the reviewer's name in the sheet".  
  *Made-up example:* Two reviews on one screenshot and no name in the file: the Note speaks of a name the file does not have.
- **7.13 shared-5** · `README.md:25` · shared files · *confirmed, high* · could mislead  
  README says Flipkart checks nothing; Flipkart's checking, Types and kept data are not described.  
  *Made-up example:* A manager reads README to learn what a Flipkart Pass means and is told Flipkart checks nothing.
- **7.14 shared-6** · `README.md:274` · shared files · *confirmed, high* · could mislead  
  README's Safety section says downloads are pictures of at most 10 MB, but 60 MB and PDF files are accepted.  
  *Made-up example:* A reader of the Safety section believes a 40 MB PDF file is never downloaded.
- **7.15 T20** · `flipkart/store.js:46-48`, `flipkart/routes.js:268-274`, `views/flipkart.js:815-821` · Flipkart · *test gap* · could mislead  
  No test that a Flipkart row checked before rows had a Status is treated the same by "Start checking" and by the Status cards (see parity-12 below).
- **7.16 D-F10** · `flipkart/store.js (clearChecks)` · Flipkart · *data check, high* · only looks wrong  
  Flipkart row 15 (changed by staff) keeps a check made by an older version, with 9 steps instead of 10, because "Check every row again" passes staff-changed rows by. Its result must stay; only the row's page should say the steps come from an older check.

### Smaller findings no second helper checked

Check each one first (read the code, run it with made-up data). Fix only the real ones, and say which were not real.

- **7.17 a-routes-11** · `amazon/routes.js:1293` · both screens · *not double-checked, medium* · could mislead  
  "Change the result" accepts a Status, Type and Note that contradict each other.  
  *Made-up example:* Staff change only the Status of a Duplicate row to Pass: it shows Pass with Type Duplicate and a "failed because" Note, and the duplicate email is still offered.
  - Same problem: **D-F1** · `flipkart/routes.js ("Change the result")` · Flipkart · *data check, high*: Flipkart row 15: staff set Fail with the Type "Reviewer name is different" (whose own Status is Needs Manual Staff Checking), and the staff Note does not start with a Status sentence. Allowed today. A result a staff member set is never changed.
- **7.18 parity-12** · `views/flipkart.js:818` · Flipkart · *not double-checked, medium* · could mislead  
  Flipkart rows checked before rows had a Status: "Not checked yet" counts them, but "Start checking" skips them. (Test gap T20 above.)  
  *Made-up example:* Two such rows: the card says 2 rows are not checked, and the button says all rows are checked.
- **7.19 parity-10** · `amazon/check.js:1155` · both screens · *not double-checked, high* · only looks wrong  
  Small Note and step-line differences between the screens; Amazon's step 1 line contradicts its Note.  
  *Made-up example:* Rows 1 and 5 share an order ID. Amazon's step 1 says no other row has it, while its Note names Row 5.
- **7.20 a-check-17** · `amazon/check.js:1439` · Amazon · *not double-checked, medium* · could mislead  
  Amazon: a review screenshot cut short ("… Read more") is never matched, so the row says the review is not live.  
  *Made-up example:* The first 18 words of a 60-word review and then "Read more": Needs Manual, Review not live.
- **7.21 a-readers-10** · `amazon/page-read.js:326` · Amazon · *not double-checked, medium* · could mislead  
  Amazon: some review words, such as "something went wrong", make the check pause as if Amazon refused the page, every time.  
  *Made-up example:* A made-up review that says "something went wrong with the cap" pauses the run at that row again and again.
- **7.22 f-routes-10** · `flipkart/routes.js:751` · Flipkart · *not double-checked, medium* · could mislead  
  Flipkart: a row with no day on its screenshots reads Flipkart only as far back as other rows need.  
  *Made-up example:* Row 8's review was posted before the day Row 4 needed. The reading stops there, and Row 8 gets Review not live.
- **7.23 f-check-18** · `flipkart/check.js:1123` · Flipkart · *not double-checked, high* · only looks wrong  
  Flipkart: a kept review shows the date words of the earlier reading as if they were today's.  
  *Made-up example:* A review kept on 05-10 as "Today" is shown on 15-10 as "posted Today (05-10-2026)".
- **7.24 f-check-19** · `flipkart/check.js:1765` · Flipkart · *not double-checked, high* · only looks wrong  
  Flipkart's comparison table has no review rows, unlike Amazon's, and its comment says they come later.  
  *Made-up example:* A row that passed because its review was found shows no review line in the table.
  - Same problem: **f-view-10** · `views/flipkart.js:1883` · Flipkart · *not double-checked, high*: Comparison card has no Flipkart column or rating/review rows; comment says they come 'with the review's steps', which are now built.
- **7.25 f-routes-13** · `flipkart/routes.js:509` · Flipkart · *not double-checked, medium* · could mislead  
  Right after Stop, the next press is refused and told to press a Stop button that is no longer shown.  
  *Made-up example:* Stop, then "Carry on checking" a second later: a red message asks for Stop, which is gone.
- **7.26 f-view-7** · `views/flipkart.js:1003` · Flipkart · *not double-checked, medium* · could mislead  
  A Flipkart campaign's start date is shown back exactly as typed, so a day/month swap cannot be seen.  
  *Made-up example:* "10/01/2026", typed for 1 October, is kept as 10 January and shown as typed.
- **7.27 f-view-8** · `views/flipkart.js:2086` · Flipkart · *not double-checked, high* · only looks wrong  
  The Live Flipkart Browser card says "Step 7 opens it"; it is step 8.  
  *Made-up example:* Staff look at step 7 for a pause that happened in step 8.
- **7.28 f-view-11** · `views/flipkart.js:245` · Flipkart · *not double-checked, high* · only looks wrong  
  After a Flipkart upload, the Type box and "Change the result" lose the list of Types until the rows are fetched again.  
  *Made-up example:* Right after an upload, the Type box shows only "Every Type".
- **7.29 f-view-12** · `views/flipkart.js:1590` · Flipkart · *not double-checked, high* · only looks wrong  
  Flipkart's Download menu does not close when you click elsewhere.  
  *Made-up example:* On Flipkart the menu stays open over the table; on Amazon it closes.
  - Same problem: **shared-11** · `app.js:289` · Flipkart · *not double-checked, high*: Flipkart's Download menu does not close when you click elsewhere.
- **7.30 f-view-13** · `views/flipkart.js:671` · Flipkart · *not double-checked, high* · only looks wrong  
  Clicking a link in Flipkart's table also opens the row's page.  
  *Made-up example:* Clicking "Google Drive" in Row 3 opens the file and also moves the dashboard to Row 3's page.
- **7.31 f-files-16** · `flipkart/workbook.js:494` · Flipkart · *not double-checked, high* · only looks wrong  
  Flipkart refuses .xlsm files; Amazon reads them.  
  *Made-up example:* "orders.xlsm" is read on Amazon and refused on Flipkart.
- **7.32 f-files-17** · `flipkart/campaigns.js:184` · Flipkart · *not double-checked, high* · only looks wrong  
  A Flipkart short link typed into a campaign is refused as "not to Flipkart".  
  *Made-up example:* A fkrt.it product link is refused.
- **7.33 a-check-21** · `amazon/check.js:887` · Amazon · *not double-checked, high* · only looks wrong  
  Amazon Notes write amounts without thousands separators, unlike the table.  
  *Made-up example:* ₹129999 in the Note, ₹1,29,999 in the table.
- **7.34 a-files-14** · `amazon/campaigns.js:81` · both screens · *not double-checked, high* · only looks wrong  
  The campaign products message names the wrong line when the box has blank lines.  
  *Made-up example:* A link on line 3 is reported as being on line 2.
- **7.35 a-files-15** · `amazon/xlsx-write.js:200` · Amazon · *not double-checked, high* · only looks wrong  
  Two fixes made only in Flipkart's copies are missing on Amazon: new headings that look plain, and a logo counted as a column.  
  *Made-up example:* In Amazon's checked file, the "Type" and "Note" headings look plain next to "Status".
- **7.36 a-files-16** · `amazon/workbook.js:417` · both screens · *not double-checked, high* · only looks wrong  
  The two screens open the same workbook differently (choosing the tab, .xlsm files).  
  *Made-up example:* A file with tabs "Orders" and "Summary": Flipkart asks which tab to read; Amazon says the file has no "Amazon" tab.
- **7.37 a-files-17** · `amazon/pictures.js:3` · Amazon · *not double-checked, high* · only looks wrong  
  Some code comments no longer match the code.  
  *Made-up example:* A comment still says pictures are at most 10 MB.
- **7.38 a-routes-17** · `amazon/routes.js:29` · Amazon · *not double-checked, high* · only looks wrong  
  The add-row form takes 4 pictures of up to 10 MB each, but the size limit fits only 3.  
  *Made-up example:* Four 8 MB screenshots are refused as too large.
- **7.39 a-view-14** · `views/amazon.js:2138` · Amazon · *not double-checked, high* · only looks wrong  
  The Amazon email box's tick count and Send count disagree, and a hover text names a button that does not exist.  
  *Made-up example:* "3 of 3 ticked" next to "Send to the ticked users (2)".
- **7.40 a-mail-login-8** · `amazon/gmail.js:119` · Amazon · *not double-checked, medium* · could mislead  
  Amazon looks for Gmail's "Message sent" in the whole page, the email's own words included.  
  *Made-up example:* An email that mentions "the message sent to you" is recorded as sent, though Gmail did not send it.
- **7.41 a-mail-login-14** · `amazon/routes.js:1480` · Amazon · *not double-checked, medium* · could mislead  
  Words the dashboard hides are quietly replaced in a sent email.  
  *Made-up example:* Staff add a sentence with a hidden word. The user receives "…" in its place, while the panel still shows the sentence.
- **7.42 a-mail-login-19** · `amazon/routes.js:1454` · Amazon · *not double-checked, high* · only looks wrong  
  After a pause, the email log and the screen count the stopped email differently.  
  *Made-up example:* The log says 3 were not tried; the screen says 1 was not sent and 2 were not tried.
- **7.43 a-mail-login-20** · `views/amazon.js:1827` · Amazon · *not double-checked, high* · only looks wrong  
  "Email these users" says nothing is sent until "Send all", but no button has that name.  
  *Made-up example:* Staff look for a "Send all" button that is not there.
- **7.44 shared-7** · `serve.mjs:257` · Amazon · *not double-checked, low* · could mislead  
  Stopping the dashboard just after Gmail's Send can lose the "maybe sent" record.  
  *Made-up example:* Control+C two seconds after Send: no "maybe emailed" line is kept, so a second Send does not ask.
- **7.45 a-mail-login-12** · `amazon/google-login.js:154` · both screens · *not double-checked, medium* · could mislead  
  The top bar can name the wrong Google account after a login in the normal Chrome window.  
  *Made-up example:* Account B logs in, and the bar still names account A.
- **7.46 a-mail-login-13** · `amazon/google-login.js:331` · both screens · *not double-checked, medium* · could lose results  
  "I have logged in" quits Chrome at once, which can lose a login made in the last 30 seconds (known, not fixed).  
  *Made-up example:* Staff log in and press the button straight away; the first Drive download stops at Google's login page.
- **7.47 a-mail-login-17** · `amazon/google-login.js:49` · both screens · *not double-checked, medium* · could mislead  
  Google login messages name buttons the top bar does not show, and the "still open" problem lifts the guard.  
  *Made-up example:* The bar says to press "I have logged in" again, but that button is gone.
- **7.48 a-mail-login-21** · `amazon/google-login.js:23` · Amazon · *not double-checked, high* · only looks wrong  
  A comment in amazon/google-login.js says nothing else of the Google account is opened, but Gmail is.  
  *Made-up example:* Someone who trusts the comment misses that emails are sent from that account.
- **7.49 a-mail-login-18** · `amazon/google-login.js:86` · Amazon · *not double-checked, high* · privacy  
  The login log (data/login-log.txt) keeps the staff Google account's email address.  
  *Made-up example:* After a login, the log says "logged in to Google as <name> (<email>)".
- **7.50 a-check-20** · `amazon/check.js:1247` · Amazon · *not double-checked, medium* · privacy  
  Amazon keeps copies of pages for almost every check, including a page the code says it never reads.  
  *Made-up example:* A short link lands on a "review your purchases" page. Its copy and picture are kept, while the Note says the page was not looked at.
- **7.51 f-readers-13** · `flipkart/ocr.js:99` · both screens · *not double-checked, low* · privacy  
  Full copies of customer screenshots are made in the Mac's temp folder, and stay there if the dashboard is forced to stop during a reading.  
  *Made-up example:* Control+C twice during a reading leaves a copy of the screenshot in the temp folder.
- **7.52 shared-9** · `README.md:123` · shared files · *not double-checked, low* · privacy  
  README's duplicate example might use a real customer's order ID. Already answered by the cross check: it matches no customer's order ID, so nothing needs fixing.  
  *Made-up example:* README goes to GitHub with the code, so a real order ID in it would go too.

## Rules for groups 8 to 10

- Everything runs on this computer, inside the existing steps: step 1 for copies across rows, the screenshot steps for the rest. A check still has 10 steps.
- A crop, a resize or a re-save alone is never a sign.
- Each sign says what was found and where. The row's page says that finding no sign does not prove a screenshot is real.
- Until group 11, signs only show on the row's page under "Is the screenshot real?" and are counted. They change no Status, Type, Note or email.
- Both screens get the same signs (CLAUDE.md rule 9).
- Tests use made-up pictures only, including an edited copy of a made-up screenshot, which must be found, and its original, which must not.
- No new package (test/rules.test.mjs allows only exceljs and playwright-core). The programs are all already on this computer, already used by the dashboard, and run only here: sips (part of macOS), tesseract (/opt/homebrew/bin/tesseract), and, only to draw made-up test pictures once from made-up HTML with no network, the Chrome that playwright-core already drives. Node's own zlib reads compressed PNG text.
- Only what a sign needs is kept: an app's name, an AI label, a date. Never the places (GPS), device numbers or owner names that some files carry.
- Where the code goes: a new file amazon/picture-signs.js and its copy flipkart/picture-signs.js (CLAUDE.md rule 4). Signs are kept with the check (Amazon: data/checks/<check>/result.json; Flipkart: the row's check in data/flipkart/rows.json) as a list of which step, which screenshot, what was found and where.
- On both screens, the row's page gets a box "Is the screenshot real?". It lists each sign in plain words, or says "No sign found.", and always says: "Finding no sign does not prove a screenshot is real: many apps, and WhatsApp, Google Drive and Excel, remove these labels." By the Status cards, both screens count them: "Rows with a sign that a screenshot may be edited: N. Signs change no Status yet."

## 8. Is the screenshot real? (1) The file

From the audit: none. This is new work you asked for.

**Fixed means:** each screenshot's file is read on this computer for editing apps, AI labels (Content Credentials too) and dates inside it, and anything found shows as a sign on the row's page and is counted, with no Status changed.

- **8.1 An editing app named in the file.** Read the file's own labels: EXIF Software, the XMP CreatorTool and edit history, Photoshop's block, PNG text. A sign when one names an app made for changing pictures (for example Adobe Photoshop, GIMP, PicsArt, Snapseed, Canva, Pixlr, Fotor, Lightroom, Affinity Photo, Photopea). Not a sign: the phone's own screenshot or gallery app, or a tool that only crops, resizes or re-saves (for example Photos, Google Photos, Preview, WhatsApp, Excel, sips). The list is kept in the code of both screens, with tests.
- **8.2 Content Credentials (C2PA).** Find the C2PA block (a JPEG's APP11 part, a PNG's caBX chunk) and read who made it (its claim generator), its actions and its digital source type. A sign: an action that changes what the picture shows (c2pa.edited, c2pa.drawing, c2pa.placed and the like), or an AI source type (trainedAlgorithmicMedia, compositeWithTrainedAlgorithmicMedia, algorithmicMedia). Not a sign: c2pa.created, c2pa.opened, c2pa.cropped, c2pa.resized, c2pa.converted, c2pa.transcoded, c2pa.published.
- **8.3 Other AI labels.** The IPTC digital source type in XMP (the same AI values), PNG text left by AI picture makers ("parameters", "prompt", "workflow"), and Software names of AI picture makers (for example DALL·E, Midjourney, Firefly, Stable Diffusion).
- **8.4 A date inside the file before the order date.** EXIF DateTimeOriginal, DateTimeDigitized and DateTime; XMP CreateDate; PNG tIME and "Creation Time". A sign when the earliest of these days is before the form's order date (or, when the form has none, the order date on the screenshots). Times with no zone are read as India time; PNG's tIME is UTC and is turned into India time. Impossible dates (all zeros, before 2000, after today) are left out.
- **8.5 A screenshot time in the file's name before the order date.** Today the dashboard keeps no file name. A Google Drive download usually carries the file's name, and a link to a picture website often has it in the link; pictures inside the Excel file have none. Names such as "Screenshot_20260712-153012…", "Screenshot 2026-07-12 at 15.30.12" and "WhatsApp Image 2026-07-12 at 15.30.12" (made up) give a day. A sign when that day is before the order date.
- **When:** in the screenshot steps (steps 2, 4 and 6 open the screenshots), on the file exactly as it was downloaded or taken from the Excel file, before picture-fix.js makes a big picture smaller, because that re-save drops the labels.
- **Tests (made up only):** tiny PNG and JPEG files built in the test, one for each label: an editing app, an AI label, a made-up C2PA block with c2pa.edited and another with only c2pa.cropped, dates inside the file before and after the order date, and file names with dates. Each must give exactly the sign expected. Made-up pictures with no labels, cropped, resized or saved again with sips, must give none, and every row's Status stays as it was.
- **Left, with the reason:** the C2PA signature is not checked. That needs the C2PA library or the c2patool program; neither is on this computer, and adding a package is not allowed. So a sign says what the file claims about itself, never that it is proven. HEIC, GIF and PDF files are not read for labels at first, and the row's page says "not looked at" for them.

## 9. Is the screenshot real? (2) The facts

From the audit: none. This is new work you asked for.

**Fixed means:** facts that cannot be true on a clear screenshot show as signs on the row's page, each saying what was found and where, with no Status changed.

- **9.1 A weekday that does not fit its date.** When a screenshot shows a weekday with a date (for example "Mon, 20 Jul" or "Delivered Monday, 20 July"), both read clearly (Tesseract's confidence 90 or more for each word), and the weekday fits neither the year shown nor, when no year is shown, the order's year or the year before.
- **9.2 Price lines that do not add up.** On Flipkart's "Price details" and Amazon's "Order Summary": when every line from the first price to the total was read clearly, and the lines (fees added; discounts, coupons and SuperCoins taken off) miss the total by more than ₹1. It uses the price lines that group 3 reads.
- **9.3 Dates out of order.** Ordered, shipped, delivered and reviewed dates, read clearly on the screenshots, in an order that cannot happen (for example "Shipped 14 July" after "Delivered 12 July" on one tracker). Group 3's decisions 1 and 2 already send some of these rows to a staff member; the sign also shows them on the row's page.
- **9.4 The shop's own labels misspelled on a clear picture.** A fixed list of each shop's labels ("Order ID", "Delivered", "Grand Total", "Listing price" …). A sign only when the picture is clear, the word was read with confidence 95 or more, it is one or two letters away from a label but is not a usual reading slip (O and 0, l and 1, rn and m), and a second reading of that part of the picture gives the same spelling.
- **Where:** picture-signs.js (both copies), in the reading steps 3, 5 and 7, using the words, places and confidences the readers already have (parseTsv in amazon/ocr.js and flipkart/ocr.js keeps each word's box and confidence).
- **Tests (made up only):** made-up word lists with places and confidences (no picture needed) for each sign, each with a true twin that must give none, and one made-up screenshot read with tesseract from start to end.
- **Left, with the reason:** a misspelling can be Tesseract's own slip, so 9.4 stays strict, and facts that were not read clearly give no sign.

## 10. Is the screenshot real? (3) The picture

From the audit: none. This is new work you asked for.

**Fixed means:** a patch behind a detail, a detail unlike the text beside it, or an edited copy of another row's screenshot shows as a sign with its place, and a crop, a resize or a re-save never does.

- **10.1 A patch behind a detail.** For the order ID, the amount, the dates and the product name (their places come from the word boxes), compare the background just around the words with the background of the rest of the line and of the lines above and below. A sign when a box of another shade, or a straight box edge, hugs the words on an otherwise plain background.
- **10.2 A detail unlike its neighbours.** The same details' letter height, colour and sharpness, compared with the same kind of text beside them (the rest of the line; the other dates on the same tracker). A sign when one is clearly different.
- **10.3 An edited copy of another row's screenshot (step 1).** When two rows' screenshots look alike (their fingerprints are close) but their order ID, amount, date or product differ, compare the two pictures part by part. A sign when they are the same everywhere (same clock, battery and layout) except around those details. It runs in step 1 when both pictures are already kept, otherwise as soon as the screenshot step opens the picture, and it is written under step 1 and shown on both rows' pages.
- **Pixels:** sips already turns any picture into a BMP file for the fingerprints (bmpGrey in flipkart/fingerprint.js). A colour BMP reader is added next to it (both copies).
- **Where:** picture-signs.js (both copies): 10.1 and 10.2 in the reading steps 3, 5 and 7, and 10.3 as said above.
- **Tests (made up only):** a made-up screenshot, drawn once from made-up HTML and kept in test/fixtures/flipkart/ and in Amazon's test/fixtures/; an edited copy made by changing its pixels (the amount painted over on a slightly different shade, one order ID digit pasted in a little larger), which must be found; and the original, plus cropped, resized and re-saved copies of it, which must not. Also small pictures drawn in the test itself (a plain background with dark blocks for words) with made-up word boxes, for each sign and its true twin.
- **Left, with the reason:** the marks (how different a shade, size or sharpness must be) can only be set on made-up pictures, so real screenshots may give false signs. That is why signs change no Status until group 11.

## 11. Turn the screenshot signs on

Only when you send this group. From the audit: none.

**Fixed means:** a row with a sign gets Needs Manual Staff Checking and the Type "Possible edited screenshot", with no email; a row that also fails for another reason keeps that Type, and its Note mentions the sign; and the new Type comes before the other staff Types, on both screens.

- **11.1 A new Type, "Possible edited screenshot",** on both screens, with the Status Needs Manual Staff Checking and no email. It is listed, and chosen, before the other staff Types (on Flipkart before "Possible misuse" too). On Amazon it goes into the Type lists in amazon/settings.js and amazon/final.js; on Flipkart into flipkart/final.js.
- **11.2 A row with a sign that would pass, or would go to staff for another reason,** gets Needs Manual Staff Checking and the new Type. Its Note names each sign (what and where), and keeps any other staff reason after it.
- **11.3 A row with a sign that fails for another reason** keeps its Fail and its Type, and its Note mentions the sign.
- **11.4 Everything else follows:** the Status cards, the Type box, both downloads and the staff line treat it like any other Type; "Email these users" and "Prepare email" offer nothing for it; a staff result is never changed (rule 3).
- **Tests (made up only):** made-up rows with each kind of sign: one that would pass, one that would go to staff for another reason, and one that fails; the new Type's place in the lists; no email offered; both downloads.
