# Amazon Review Checker

A dashboard that runs on this computer only. It checks the Amazon orders in your Excel file row by row, the way staff check them by hand. For every row, it writes a **Status**, a **Type** and a **Note**.

It needs no internet service of its own: no backend, no database and no account with any service. It reads the screenshots on this computer, with the Google Chrome and Tesseract already on it.

## Start it

Open the **Terminal** app (press Command and Space, type `Terminal`, press Return). Paste these lines one at a time, pressing Return after each:

```
cd "/Users/prakashtamang/Amazon Review Checker"
npm install
npm start
```

You only need `npm install` the first time. When Terminal shows `Amazon Review Checker: http://localhost:8093`, open Chrome and go to **http://localhost:8093**.

Keep the Terminal window open while you use the dashboard. To stop the dashboard, click the Terminal window and press Control and C. The dashboard first closes the Live Amazon Browser properly, so Chrome saves your Amazon login, then stops. Closing the Terminal window does the same.

## The page

The page is always light, warm and calm (cream and beige, soft brown for quieter details), even when the computer is set to dark mode, and it uses the whole window. In each part, only the most important button is soft yellow, such as **Start checking**; the others are quieter. From top to bottom:

- **The top bar**: the dashboard's name, the marketplace tabs (**Amazon**; **Flipkart** opens the Flipkart screen, where a Flipkart file (.xlsx or .csv) can be uploaded and its rows seen, and Flipkart campaigns added, each product read from its Flipkart page in a visible, signed-out Live Flipkart Browser; nothing is checked there yet) and the Amazon login, with its button when one is needed. When there is something to do, such as logging in, a soft box under the bar says what.
- **The upload area**: before a file is in, press **Choose file**, or drop the file anywhere on the page; it is uploaded at once. Once a file is in, it becomes one slim line: the file's name, its tab, how many rows it has, and **Replace file**.
- **Campaigns**: it folds shut to save room. Press its title to open or close it. It starts closed when there are campaigns, and its title line still says how many are live.
- **The four Status cards** and the main buttons, in one row: **Pass**, **Fail**, **Needs Manual Staff Checking** and **Not checked yet**, each with its number. Press a card to show only those rows; press it again to show every row. The **Status box** above the table (next to the Type box) lists the same choices, each with its number, and always shows the same choice as the cards. Next to them: **Start checking** (later **Carry on checking**), **Stop** while checking, **Check every row again**, and **Download**.
- **The table** of rows, with most of the screen. While rows are checked, the live checking area sits beside it. When a Type with an email is chosen in the Type box, **Email these users** is there too (see "Email users").
- **More**, closed to start with: **Add a row by hand**, the **Email templates** box (with the **Test email address**), **Remove all rows**, and a line saying which languages the screenshots are read in.

The rows of the sheet are numbered from 1, in the sheet's order: the first row under the heading row is Row 1, the next is Row 2, and so on (empty rows are not counted). The heading row is never a row. These numbers are used everywhere on the dashboard: the table, a row's own page, the checking area, the messages and the Notes. Rows added by hand keep their own names (By hand #1). The results still go into the right rows of the downloaded Excel file.

Messages are soft coloured boxes with an icon: red for a problem, orange for a warning, yellow for information and green when something worked. The font (Poppins, free under the SIL Open Font License) and the line icons are files in the `assets` folder; the page never loads anything from the internet.

## The Amazon login

When the dashboard starts, it opens a Chrome window called "Live Amazon Browser" on Amazon's home page, and reads the line at the top of Amazon's page ("Hello, NAME") to see who is logged in. If that first page shows no name, the dashboard reads the line again a moment later, then opens Amazon's home page once more (at least 3 seconds later), because right after a restart Amazon's first page can say no one is logged in when you are. You press nothing and type nothing. Its bar says "Chrome is being controlled by automated test software"; that is expected. Leave the window open: every check uses it.

The top bar of the dashboard shows one of these:

- **Checking the Amazon login…** while it looks.
- **Logged in to Amazon as NAME**, in green: ready for checks.
- **Not logged in to Amazon**, with a **Log in to Amazon** button. Pressing it opens Amazon's home page first; if you are still logged in, that is all. Only when Amazon shows that no one is logged in does Amazon's login page open in the Live Amazon Browser window.
- **Waiting for you to log in**, with "Log in in the Live Amazon Browser window…" in the box under the bar: log in there by hand, as you normally would, and tick the box that keeps you signed in. Within a few seconds of your login, the top bar says you are logged in; you do not reload anything. If Amazon then shows more pages (such as adding a mobile number), answer them by hand.
- **The login could not be checked**, with a plain sentence in the box under the bar when Amazon shows a robot check or a block instead, and a **Check the login again** button. The dashboard never answers a robot check and never gets around a block.

Each login check writes in the Terminal window, for every Amazon page it opens, the page's address and the words of its account line (never anything typed into a page), then what the top bar says. The same lines are kept, with the date and time, in `data/login-log.txt`, with a line when the dashboard starts and two lines when it stops: "…the Live Amazon Browser is being closed." and "The Live Amazon Browser was closed." (only the first of the two means Chrome was not closed in time to save the login). If the top bar says "Not logged in to Amazon" when you know you are logged in, that file says what Amazon showed. And when you press **Start checking** or a row's **Check** while the top bar says "Not logged in to Amazon", the dashboard first reads Amazon's home page again, the way **Log in to Amazon** does, before the first row starts.

The dashboard never types, stores or reads your password; it only reads the "Hello, NAME" line. The login is kept by Chrome in its own profile, `data/amazon-profile`, which the dashboard never deletes or clears; it never opens Amazon's sign-out page. Tick the box that keeps you signed in when you log in: without it, Amazon itself ends the login when the window closes. If Amazon ends the login later (for example after a password change), the top bar says **Not logged in to Amazon**, and checks pause until you log in again.

## The Google login

The screenshots on Google Drive are usually shared with your Google account, not with anyone who has the link. So the dashboard downloads them through a Google login, kept in the same saved profile as the Amazon login. Next to the Amazon login, the top bar shows one of these:

- **Checking the Google login…** while it looks. No Google page is opened for this: the dashboard only looks at the names and end dates of the cookies Chrome saved (never their values) to see whether a Google login is there.
- **Logged in to Google as NAME**, in green. The name is the one Google's home page showed when you logged in here; after a restart it is read from what was saved.
- **Not logged in to Google**, with a **Log in to Google** button. Pressing it opens Google's login page in the Live Amazon Browser window; you log in there by hand. Google then goes on to its home page, whose account button names the account, and within a few seconds the top bar says you are logged in. If your login is still saved, Google skips the form and goes straight to the home page.
- **Waiting for you to log in to Google**, with what to do in the box under the bar.
- **The Google login could not be checked**, with a plain sentence in the box when Google refuses the login, shows a robot check or cannot be reached, and a **Check the Google login again** button. The dashboard never answers a robot check and never gets around a block.

Google sometimes refuses to let anyone log in inside a window that a program controls ("This browser or app may not be secure"). The dashboard then says so, and offers **Log in to Google in a normal Chrome window**: it closes the Live Amazon Browser properly, opens a normal Chrome window (nothing hidden, no automation) on the same saved profile at Google's login page, and you log in there. When you are done, press **I have logged in**: the dashboard asks that window to quit, the way Command and Q does, waits for it, then checks the login from the saved cookies. While that window is open nothing else can use the profile, so checks and the Amazon login wait.

When a row is checked, each of its Google Drive screenshots is downloaded by the Live Amazon Browser itself, with that login, one at a time and with a short pause between two downloads, and no page is opened for it. Only the Drive links in the sheet are ever opened; nothing else in the Google account. If no one is logged in to Google, checking pauses before the first row that needs a Drive screenshot, and says to log in; a row never gets **Need Google Drive Access** just because nobody is logged in. If Google asks to log in while a file is downloaded, or shows a robot check or a block, checking pauses the same way, and nothing is got around. **Need Google Drive Access** now means only that Google said the logged-in account has no access to that file: the Note says which screenshot, and to ask the file's owner to share it with that account.

The dashboard never types, stores or reads your Google password, never opens Google's sign-out page, and reads only the account button at the top of Google's pages. Each Google login check writes what it did in the Terminal window and in `data/login-log.txt`, like the Amazon login checks.

## Upload the sheet

In the upload area, press **Choose file** and pick the file, or drop the file anywhere on the main page. It is uploaded at once, with no other button to press. To upload a new file later, press **Replace file** on the slim line, or drop the new file anywhere on the main page. A new file can be uploaded at any time. The file chooser offers every Excel file (.xlsx, .xlsm or .xls) and CSV files. A file the dashboard cannot read, such as an old .xls file, gets one sentence right under the upload line saying what to do, for example to open it in Excel and save it as .xlsx. Within a few seconds, the rows show in the table, numbered from 1, with nothing checked yet.

- The tab read is the one named **Amazon**, whatever its capitals or spaces (Amazon, AMAZON, amazon); else the only tab with the word Amazon in its name, such as "Amazon Orders"; else, when the file has just one tab, that tab. No other tab is read or shown, and the other tabs stay exactly as they are. A file with no Amazon tab is told so.
- The dashboard reads each column by what its name means, by whole words, whatever its capitals, spaces or punctuation: "Amount", "Order amount" or "Order value"; "Product", "Product name" or "Product ordered"; "Order screenshot" or "Purchase screenshot"; "Delivery screenshot"; "Review screenshot"; "Review link", "Live review link" or "Review URL"; "Reviewer name", "User name" or "Customer name"; "Order ID"; "Order date"; Status, Type and Note. It looks at the cells too, so a column whose cells clearly hold something else is never used: "Reviewer Name" holds names, so it is never the review link.
- A file may have fewer or other columns. Only the order ID is needed, and a review link or a review screenshot. Only when one of those cannot be found does the dashboard show the column chooser and wait for **Use these columns**; every other field in it can be left as "Not in this file". While it waits, the table says the new file's rows show once its columns are chosen; **Cancel** brings back the rows shown before. A choice you make is remembered for the next file.
- Under the upload line, short lines say which of the file's columns are used for checking, which are only shown, what the file does not have and what that means (for example "This file has no order date, so order dates are not compared."), and which campaign the rows use, or that none was found.
- Uploading opens no link and downloads nothing. A row's pictures are downloaded when that row is checked. So "the same picture in two rows" is found among the rows already checked.
- A new file replaces the rows of the file before, and their results. When rows are in, the dashboard asks once first: "This replaces all N rows and their results with the rows of the new file. Go on?" Press **OK** to replace them; download the checked Excel file before that if you want to keep the results. The rows added by hand and the campaigns stay.
- When rows are being checked, or a campaign's products are being read from Amazon, the same question says so, and **OK** stops that first, then uploads the new file. A campaign's products not read yet are read before the next row is checked.
- Whatever stops an upload is said in one sentence right under the upload line.

The table shows each row as it is in the file, in the same order, numbered from 1, with every column of the file, in the file's order and with its own heading, then Status, Type and Note. A file's own Status, Type or Note column is that same column, never shown twice; one it does not have is shown after the last column, where the checked Excel file adds it. A column the file does not have never shows anywhere: not in the table, on the row's page, in the comparison with the screenshots, or in the "Add a row" form. Each column is headed with its letter, kept small, and its name from the heading row, such as "A: Order ID", and the names stay in view while you scroll. The Note column has a fixed width, and long Notes wrap inside it. Dates show the day first (16-07-2026), amounts in rupees (₹654, ₹851.95). Each link shows where it goes (Google Drive, tryboxs, storage.googleapis.com, Amazon review, Amazon email link, Amazon short link, Amazon page for the writer only); click it to open the link in a new Chrome tab, or rest the mouse on it to see the whole link. Words such as "Cancelled" show as they are, and an empty cell says "Empty". A cell whose words show one link while the link behind them opens another has a small warning. The slim upload line gives the file name, the tab and the number of rows.

When a row is checked, its pictures are downloaded one at a time, with a short pause between two downloads:

- **Google Drive** links are downloaded through the Google login in the top bar (see "The Google login"), by the Live Amazon Browser itself, with no page opened. Some owners turn off downloading for a file that can still be viewed: the dashboard then uses the picture Google Drive itself shows of the file. A large file Drive cannot check for viruses is downloaded through Drive's own "Download anyway" form. A file the logged-in Google account cannot open gets **Need Google Drive Access**: only then, and the Note says to check that the file is shared with the Google account shown in the top bar. With no Google login, checking pauses before the first row that needs a Drive file.
- **A screenshot saved as a PDF** is read: its pages (up to six) are drawn into one tall picture on this computer, by the Mac's own tools, with nothing new to install. **A picture too large to keep** (over 10 megabytes) is made smaller on this computer and read, not refused; only a file over 60 megabytes is not downloaded. A file that cannot be made into a picture (a web page instead of a picture, a file of another kind, a PDF with no page that can be drawn) gets **Purchase screenshot not clear**, **Delivery screenshot not clear** or **Review screenshot not clear**, with its own plain reason, never **Need Google Drive Access**.
- **Other picture websites** are used only when they are on the list in `settings.json` (it starts with `storage.googleapis.com`, `tryboxs.in` and `www.tryboxs.in`). A website that is not on the list, or that refuses, gets **Need Access**.
- **Amazon links** are never downloaded. They are opened in the Live Amazon Browser during the check.

A picture that could not be downloaded is tried again the next time its row is checked, so after the file's owner opens it to everyone, press **Check** again.

Status, Type and Note show the dashboard's result once a row is checked; before that, they show what is in your file.

## Campaigns

The product names in the sheet are often not Amazon's real names. When a campaign starts, the brand gives the Amazon links or ASIN numbers of the products users may buy, and a user may buy any one of them. The **Campaigns** box keeps them:

1. Press **Add a campaign**.
2. Write the **Brand** (for example "Koparo"), the **Campaign name** (for example "Koparo Clean"), and choose **Live** or **Ended**.
3. Under **Products**, write the campaign's products, one on each line: an Amazon link, or an ASIN number (the 10 letters and digits Amazon gives each product).
4. Press **Save**.

When a campaign is saved, the dashboard opens each of its products in the Live Amazon Browser, one page at a time and at least 3 seconds apart: a link as it is, an ASIN number as its Amazon India product page. From each page it reads the real product name, the brand, and the other colours and sizes listed, and shows them under the product with when they were read. A product is used only when its page is a real product page and its brand (or, when no brand is shown, its name) includes the campaign's brand; otherwise the box says why, and that product is not used. A login page, a robot check or a block stops the reading, as always, and is never got around: the box says so, and **Read the products again** tries again. When checking starts, any product of a live campaign that has not been read yet is read first.

A campaign can be changed (**Change**), ended (**End campaign**) or deleted (**Delete**, which asks first). Live campaigns come first; a campaign marked Ended is never used (mark it Live again to use it). **Save** is greyed out while rows are being checked. Campaigns are kept for next time, in the `data` folder (`campaigns.json`).

A row uses every live campaign whose brand is in its product name in the sheet: "Koparo Floor & Toilet Cleaner" uses the live Koparo campaigns. When its product name has no campaign's brand, the row uses the live campaigns whose brand is in the file's name or the tab's name: "Koparo Amazon Review Data.xlsx" uses the live Koparo campaigns for every row. A campaign marked Ended is never used. Capitals, spaces and accents do not matter, and a brand of six letters or more may differ by one letter, as Amazon may spell it ("Manlich" for "Mannlich"). The line under the upload line says which live campaign the rows use, or that none was found; when the brand has only a campaign marked Ended, it says so plainly, and that marking it Live in the Campaigns box would use it. Then:

- on the purchase screenshot and the delivery screenshot, the product must be one of the campaign's products, by its real name from Amazon; the product name in the sheet is not compared;
- a name Amazon cut short, like "Koparo Monthly Home Cleani...", counts when the part shown is the start of its real name (small reading mistakes allowed), or when it fits one of the campaign's products alone, or when both screenshots show the same start;
- the review must be for the product bought (the campaign's product the screenshots show), or another colour or size of it: a review of another of the campaign's products is **Product is not matching**; a written review sent as a picture is looked for under the product the screenshots show;
- the two screenshots must show the same one of the campaign's products (an order of several products needs only one in common); a name Amazon gives the product elsewhere (its quick delivery calls a roll-on "Men Pitstick Under Roll-On") with a word only one of the campaign's products has, such as "Roll-On" or "Soap", is never called another product;
- Notes name a product by the start of its real name, up to the first "|" or comma, for example "Koparo Monthly Home Cleaning Kit", never by its ASIN number.

A row with no campaign for its brand is checked by its product name in the sheet, and its Note says so. " - Amazon" at the end of a product name names the shop, not the product. A short name without the brand matches its long Amazon name ("Face Wash For Man - Amazon" matches "Testbrand Face Wash for Men, 100 ml"), a small spelling slip ("Charcol" for "Charcoal") does not make it a different product, and a cell naming several products, separated by commas, matches any one of them.

## Duplicates

When rows share an order ID, a screenshot, a review link or the same picture, only the first of those rows, the one nearest the top of the sheet, is checked. The later rows are duplicates, and their Status is Fail. "The same picture" means the very same picture file, or a picture that looks the same and whose words read the same (the same order ID); two orders of one product look almost alike, so the words decide. Pictures are compared only with those of rows already checked.

A screenshot belongs to the order it shows. When the same screenshot is in two rows and it shows the order ID of one of them only, it is that row's: that row is checked as usual, wherever it is in the sheet, and the other row is not a duplicate either, but fails for its own reason, the screenshot's order ID (**Order ID is not matching**). Amazon's message refusing a review ("not accepting reviews on this item or product from this account") sent for two orders of one account is the same message, not the same review, so it never makes a duplicate.

A later row's Note says which row was checked, for example: "This transaction failed because it is a duplicate: order ID 408-9386952-8808369 was already checked in row 20." The first row's Note ends with "The same order ID is also in rows 37 and 74. Those rows are duplicates and were not checked."

## Check

Press **Start checking**, next to the Status cards. It checks the rows one at a time, from the top, in the sheet's order (rows added by hand come after the sheet's rows), starting at the first row that has no result yet. Each row is checked completely, then the next one starts at once. Rows that already have a result are passed by: rows the dashboard has checked, rows marked Duplicate when another row was checked, and rows whose Status was already filled in in the uploaded file. The button says **Start checking**, then **Carry on checking** once some rows are done; how many rows are left shows on the **Not checked yet** card. When none are left it says "All rows are checked" and is greyed out, and the cards say how the rows came out.

While it runs, the row being checked is highlighted, and its Status says "Checking…". Beside the table, the live checking area shows one progress bar with the line "Checking row 23: 5 of 200 rows done, 195 left", a link that scrolls the table to that row, a link to that row's page, the row's steps as they happen, and the latest picture of the Live Amazon Browser. As soon as a row is finished, its Status, Type and Note appear in its line, with how long it took ("took 42 seconds"), and the cards' numbers change. When checking ends, **Close** puts the live checking area away.

**Stop** stops at once. The rows finished before it keep their results; the row it was on gets none, and is the first one checked next time. Reloading or closing the dashboard's page stops it the same way. If Amazon logs you out, shows a robot check or refuses a page, checking pauses and says so; that row gets no result yet. The same happens when no one is logged in to Google and a row needs a Google Drive screenshot, or when Google asks to log in, shows a robot check or refuses a file while one is downloaded. Press **Carry on checking** when you are ready: it carries on from that row. The dashboard never answers a robot check and never gets around a login page.

Each row's own button, in the table and on the row's page, says **Check** when the row has no result and **Check again** when it has one, and checks only that row. **Check every row again**, next to **Start checking**, asks first, then removes every result (a Status from the uploaded file too) and checks from the first row.

The four cards above the table say how many rows are **Pass**, **Fail**, **Needs Manual Staff Checking** and **Not checked yet**; press one to show only those rows, and press it again to show every row. The Status box above the table lists the same choices ("Every Status", then each Status with how many rows); choosing one is the same as pressing its card, and the box and the cards always show the same choice. Next to it you can also choose one Type: the Type box always lists every Type the dashboard has, each with how many rows have it (0 too); once a Status is chosen, the numbers count only the rows of that Status, so choosing **Fail** and "Delivery screenshot missing (66)" shows exactly those rows, and a Type with 0 says "No row has that Status and Type". A Type written in the uploaded file that the dashboard does not have is listed after the others. Click a row to see its own page: its Status and the reason at the top, large, what was read from each picture, what was found on Amazon, a comparison table, the steps with ticks and crosses, and the pictures of the Live Amazon Browser.

## Change a result by hand

On a row's page, press **Change the result**. Choose the Status (Pass, Fail or Needs Manual Staff Checking), the Type (every Type is listed) and write the Note, then press **Save**. The row then says **Changed by staff**, with the date and time, at the top of its page, in its Type and Note card, and in the table (in place of how long the check took). The downloaded Excel file and "The results only" keep what you chose.

**Start checking**, **Carry on checking** and **Check every row again** pass such rows by: they keep the result you chose, and the question before "Check every row again" says how many rows keep theirs. **Check again** on the row's own page (or its button in the table) asks first, then replaces your result with what the dashboard finds. A check of another row never makes such a row a Duplicate. While a row is being checked, its result cannot be changed.

## How often the dashboard is right

Next to **Change the result** on a row's page there is **The result is right**. Press it when you have looked at the dashboard's result and it is right: the result stays as it is, and the row says **Marked right by staff** with the date and time, on its page and in the table. Changing a result counts the dashboard's result as wrong. Checking the row again (its own button, "Check every row again", or another row's check making it a Duplicate) clears the mark. A result staff chose by hand cannot be marked right: press "Check again" first to get the dashboard's own result.

Above the table, one line says how often the dashboard is right, from what staff marked: "Staff checked 12 results: 10 right (83%). Pass: 5 checked, 5 right (100%). Fail: 6 checked, 4 right (67%). Needs Manual Staff Checking: 1 checked, 1 right (100%)." Each Status is the one the dashboard gave, before any change.

## Email users

For every Type that is not Pass, except Something else, there is an email asking the user for what is still needed. There are 21 emails: one for each of those Types, and a second **Not delivered** email for an order whose delivery screenshot (or delivery cell) says cancelled or returned. Each email greets the user by the name in the file's Reviewer Name column, names the order ID and the product, says in plain words what is wrong (with the real details, such as "You gave order ID A, but your purchase screenshot shows order ID B"), says exactly what to send, asks the user to reply to the email with it, gives short steps for the Amazon app and website where they help, and ends with a sign-off you can change.

- **On a row's page**: **Email this user**, when the row's Type has an email. The exact email is shown first: to whom, the subject and the message, filled in for that row. Change any words you like, then press **Send**, or **Cancel**.
- **Above the table**: choose a Type with an email in the Type box, and **Email these users (N)** appears. One short line per user: a tick box, the row, the name, the order ID and the email address. Each line opens to show its email, to read and change. No box is ticked to start with; **Tick all** and **Untick all** are there too. Then **Send to the ticked users (N)**, which sends only to them, or **Cancel**.
- **Where the emails go**, chosen above the emails: **Test** (every email goes only to the **Test email address**, never to anyone else) is chosen to start with. Fill the address in (in the email panel, or in the Email templates box under More) and press **Save**; it is kept for next time. **Real** (each email goes to that user's own email address) can only be chosen when the uploaded file has an email address column: a column named "Email", "Email ID", "Email Address", "E-mail" or "Mail ID", or whose cells are email addresses, found like the other columns. It shows in the table and on each row's page like any other column. With Real, pressing Send asks first: "This sends N emails to the users' own email addresses. Go on?" A row with no email address, or with something that is not one, is not sent, and its line says why. The "To" of each email shows where it will really go.
- The emails are sent through your Google account, the one logged in in the Live Amazon Browser: for each email, Gmail's page for writing a new email opens empty in that window, the dashboard writes the address, the subject and the words in that email's own fields (with no key pressed, and never in the page's address, so the browser's history keeps none of them), reads that page until it shows the email as you saw it (your own Gmail signature may follow the words), presses Gmail's **Send** button in that email's own box, waits for Gmail to say "Message sent", stays until Gmail has finished sending (its "Undo" time), and then leaves Gmail. One email at a time, a few seconds apart. Nothing else in Gmail is ever opened, read or changed.
- When Send was pressed but Gmail did not say the email was sent, the email is **Maybe sent: look in your Sent emails**, never just "Not sent": it is kept on the row like a sent one, so nobody sends it twice by mistake. Each row says when it was emailed and about what ("Emailed on 08-10-2026 at 14:05 about Not delivered, as a test", or "Maybe emailed …"), in the table and on its page. Emailing the same row again asks first.
- After sending, or after **Stop**, each email says what happened to it (Sent, Maybe sent, Not sent with its reason, or Not tried), and the numbers are on their own lines: sent, maybe sent, not sent because of a problem, and not tried. Every try is kept in `data/email-log.txt`: the time, the row, what happened and the reason; never the email's words or address, nor what the file has in the email address cell.
- Sending waits while rows are being checked, and checking (and uploading, removing and logging in) waits while emails are being sent. If Gmail shows a login page, a robot check or a block, sending stops and says so plainly; the emails sent before stay sent, and nothing is got around. **Stop** stops after the email being sent.
- Under **More**, the **Email templates** box shows every email, with its name, subject and message, and the sign-off. Read and change any of them, then press **Save the emails**: they are written into the settings file (`settings.json`, under "emails"), where they can be changed too. The words in curly brackets are filled in for each row: `{name}`, `{order ID}`, `{product}`, `{what is wrong}` (what the check found for that row) and `{sign-off}`.

## The ten steps of a check

Duplicates are found first. Then both screenshots are always opened and read, even when the first one already has a problem. The review is looked at only when both screenshots pass; that part stops at its first problem. Steps that were not run show "not reached".

1. **Duplicates and links in the sheet**: the same order ID, the same screenshot or review link, or the very same picture file, as a row nearer the top (**Duplicate**: only the first of them is checked). A picture that only looks like another row's is compared once its words are read, in steps 3, 5 and 7. A cell whose written link is different from the link that opens when it is clicked is not a problem: the dashboard checks the link that opens when clicked, as staff would, and the Note says so; the table shows a small warning.
2. **Opening the purchase screenshot** (the "Order Screenshot" column).
3. **Reading the purchase screenshot and comparing it with the sheet.**
4. **Opening the delivery screenshot.** Words instead of a picture: "Cancelled", "Lost", "In transit", "Not delivered" or "Returned" mean the order was not delivered; anything else, such as "0", means the screenshot is missing.
5. **Reading the delivery screenshot and comparing it.**
6. **Opening the review link.** An Amazon review link opens its review page, whatever its kind (/gp/customer-reviews/…, /review/…, /portal/customer-reviews/srp/-/…, or an email link, even one holding a business.amazon.in review). A short link (amzn.in) is opened to see where it lands. When the review link is empty, is words such as NA, or is not a link to one review (a product's page or its list of reviews, an Amazon error page, a page only the review's writer can see, an app store's page or a picture), the row's review screenshot is read instead, the way a picture in the review link cell is read, and the row gets its Status by the same rules. With no review screenshot: words or an empty cell give **Review link or screenshot missing**; a page only the writer can see gives **Need Access**; a product's page, an error page or an app store's page gives **Wrong review link**.
7. **Reading the rating and the written words.** From a picture: Amazon refusing the review gives **User not being able to add reviews**; a star rating with no written words gives **Rating Only**; a written review goes on to step 8. A review picture can be the user's review on its own, a product's list of reviews ("See all reviews"), Amazon's email saying the review is live (as in Gmail: "Thanks Asha, your latest customer review is live on Amazon", then the review's words), or the "Write a review" form with the review typed in it. Amazon's page shown once a review is sent ("Review Submitted", "Thank you for helping other shoppers") shows no review. A photo of the product in the review shows its packaging's words in capitals ("MADE FOR MEN"), never the review's words; a review picture where only those could be read is **Review screenshot not clear** (a staff member looks). A review's age ("7 days ago"), "Verified Purchase", the page's address and Amazon's own bars are never its words, and on a computer's page the product's ratings beside the review ("354 global ratings", "5 star 72%") are never its words either. In a list, the user's review is the one under the user's name (the Reviewer Name in the file, or the name on the review the link opened), else the one Amazon marks as the viewer's own; its words run up to the next person's name or Amazon's own buttons ("Helpful", "Report", "Thank you for your review.", "Edit", "Delete"), which are never part of the review. The Amazon app shows a row of stars with "Verified Purchase" between the name and the title; Tesseract reads the stars as letters ("KKKKK"), and that line is never taken for the name. From an Amazon page: a review of another product gives **Product is not matching**; stars and no written words give **Rating Only**. The name on the review is compared with the file's Reviewer Name column the way staff read names: Amazon often shortens a name ("Rahul Kumar Sharma" shows as "Rahul K." or "Rahul Sharma"), so capitals, dots, an initial, a missing word, one name only, a name written as one word and one letter different in a word of four letters or more all count as the same name; only a name that is clearly someone else's gives **Reviewer name is different** (a staff member looks); a name Amazon hides ("Amazon Customer") is not compared, and the Note says so. When the row also has a review screenshot, it is read and compared with the review the link opened: the review matches when the name and the words on the screenshot are found in the review the link opens (the screenshot may show only part of the words, cut short or ending in "Read more"), and the Note says so; a screenshot that cannot be read, or shows no review, is said so and does not stop a Pass; one that clearly shows another name or other words gives **Review screenshot not matching** (a staff member looks).
8. **Opening the product's page and "See all reviews".** A review the link opened is live, so this step is not needed; the product's page is opened only to tell another colour or size of a campaign's product. For a written review sent as a picture, this is the page of the campaign's product the screenshots show; with no campaign for the brand: **Review link needed**.
9. **Searching for the review**, with at most two rare words from it, only for a review sent as a picture. A page of results that is full (ten reviews) goes on: its next pages are opened too, one at a time, up to five pages for each word. Found: **Verified**. Not found: **Review not live**. Words too common to search for: **Review link needed** (a staff member asks for the review's link). A review that is also another row's: **Duplicate**.
10. **Status, Type and Note.**

On each screenshot, the order ID, the order date, the amount and the product are compared with the row in the sheet (what the user gave in the form); the product, with the products of the row's campaigns when it has any (see **Campaigns**). Each is **the same**, **different** or **not shown**. A detail that is not shown, or could not be read, is never called different. For the screenshots to pass, the way a staff member reads them:

- the purchase screenshot must show the row's order ID, amount and product (an order ID read only in part, or wrapped over two lines, counts when the part read is the row's; an order ID read one digit off on one screenshot counts when the other screenshot shows it exactly);
- the delivery screenshot must say "Delivered" and show the same product as the purchase screenshot; if it also shows an order ID or a total, they must be the row's. A delivery screenshot that shows this order's ID need not show the product; one that shows neither the product nor the order ID cannot be matched to the order (**Delivery screenshot not clear**). An item's price on it, with no total, is not the order's amount and is not compared;
- when a screenshot does not show the whole product name, it is enough that the part shown is the same on both screenshots and is the start of the product ordered, or that it fits one of the campaign's products alone, or that the other screenshot shows the name in full; a product missing from the purchase screenshot counts when the delivery screenshot of the same order ID shows it;
- the order date must be the same wherever it is shown.

"Delivered" is found as the word itself (in English, in Hindi, or read with a letter lost or changed), or, when the word is off the screenshot, from what Amazon's order page shows only once an order has been delivered: "Leave delivery feedback", "Return window closed on …", "Return or replace items", "Package was handed to …". "Arriving", "Out for delivery", "Shipped", "Expected" or "Cancel items" mean the order was not delivered yet: **Not delivered** (Fail). A picture that says none of this and shows no detail of an order, such as a photo of the product, is **Delivery screenshot not clear** (a staff member looks), never Not delivered. When the delivery screenshot does not say "Delivered" but the purchase screenshot of the same order (the same order ID) does, the two were given the other way round: the order counts as delivered, and the Note says so.

A file with fewer columns is checked with what it has. An order date, an amount or a product name the file has no column for is left out: it is never a problem, and no Note says it matched. With no purchase screenshot or delivery screenshot column, that proof cannot be seen, so the Status is **Needs Manual Staff Checking**; an empty cell in a column the file has is still **Fail**. A review screenshot is shown on the row's page, and checked for the same picture in two rows like the other screenshots. Words such as NA, or the same error page or product page, in two rows never make those rows the same review.

The amount is read the way staff read an order page: the order total, the grand total or the amount paid, as it is; or an item price or subtotal that, with the shipping and fees shown (and the money taken off), adds up to the amount in the sheet; or, when the screenshot shows no total at all (cut off below the subtotal), an item price or subtotal up to a few rupees below the amount in the sheet, because Amazon's marketplace fee is not on it ("feeAllowanceRupees" in the settings file, 5 by default; 0 turns it off). Never a delivery charge, a fee or money taken off on its own. Reading a screenshot sometimes turns the rupee sign into a digit stuck to the number ("₹654.00" comes out as "7654.00" or "3654.00") or loses the decimal point ("₹344.00" comes out as "34400"), so such a number is also read as the number it may be; the rupee sign may also be read as "£" or as "२" with a digit ("₹289" as "२7289"). A large amount alone on its line, read without its rupee sign ("₹314" on Amazon Pay's page), counts only when it is the amount in the sheet, and is never said to be a different amount. An amount read as another on one screenshot is not a problem when the other screenshot of the same order (both show its order ID) shows the amount in the sheet: a reading slip, or a screenshot cut before its grand total; the Note says so. On the delivery screenshot, only a date marked as the order's date counts as the order date: the day it was delivered never does. A delivery date before the order date is written in the Note, but is not a problem.

Every picture is read on this computer with Tesseract. A purchase or delivery screenshot that is not clear, or that lacks what is looked for (an order ID, or not the row's; an amount, or not the row's; the product on a purchase screenshot; "Delivered" on a delivery screenshot), is read again the other ways, in turn, until nothing is lacking: enlarged twice; as words scattered over a page (Tesseract's other way of finding lines, which finds a line the first way may miss, such as "Arriving today"); with a text selection made plain (an order number selected on the screen reads white on blue, or sits under a phone's selection handles: the copy turns it into black words on white); and its top strip enlarged three times, where a computer's screenshot shows the page's address, with the order ID in it ("orderId=408-…"). What every reading finds is used: the words of the other readings are added to the picture's own. The top strip gives only order IDs (it also shows the browser's tabs, which are never taken for a product), and the other readings only help find the product ordered, never another product. A review picture whose words of Amazon's refusal were read only in part (a small screenshot) is read once more enlarged, for the whole message. A picture Tesseract cannot open (a JPEG cut short) is rewritten as a PNG by the Mac's own picture tool and read again. Only then does the dashboard say a picture cannot be read.

When there are several problems, the Type is the first one that fails the transaction, in this order; when none fails it, the first one. So a detail that may only be a reading mistake (an order ID one digit away from the form) never names a row that fails for something else, such as a missing delivery screenshot:

1. a different order ID: **Order ID is not matching**;
2. a different product: **Product is not matching**;
3. not delivered: **Not delivered**;
4. a screenshot that is missing or cannot be opened: **Purchase screenshot missing**, **Delivery screenshot missing**, **Need Google Drive Access** or **Need Access**;
5. a different order date or amount: **Order details not matching**;
6. a detail that is not shown, a picture in the delivery cell that is not an order page (a photo of the product), or a screenshot that cannot be read: **Purchase screenshot not clear** or **Delivery screenshot not clear**.

A row is **Verified** only when every check was done and passed. **Rating Only** is used only when the picture or page clearly shows stars and clearly shows no written words. When the dashboard cannot tell, the Type is **Something else**, and the Note says it could not tell. Anything that goes wrong on this computer is also **Something else**, and is never Verified.

## Status, Type and Note

Every checked row gets one **Status**, in the file's Status column. It is always one of three words, never Verified or Unverified. A row not checked yet has none.

- **Pass** (green): the Type is Verified or Rating Only. The transaction is fully checked and can be paid; nothing else needs reading.
- **Fail** (red): a duplicate; a missing purchase screenshot, delivery screenshot or review; a different order ID, product, order date or amount; not delivered; a wrong review link; a deleted review; Amazon not letting the user add a review.
- **Needs Manual Staff Checking** (orange): a screenshot or link the dashboard cannot open (such as a private Google Drive file); a screenshot it cannot read; a review not found in the public reviews; a review it cannot look for; anything else it cannot decide. A possible reading mistake goes here too, never to Fail: an order ID, order date or amount one digit away from the form (one digit changed, missing or extra), and a delivery screenshot where the word "Delivered" cannot be found. Not delivered is Fail only when the cell or the screenshot clearly says cancelled, returned, lost or not delivered yet (the "notDeliveredWords" in the settings file).

When a row has a problem that fails it and one that needs a staff member, it fails. Rows checked before the three Status words were added get their Status from their saved result; their Note gets the new first sentence when they are checked again.

A Status already in the uploaded file counts as a result from before. It shows as one of the three words, marked "From the file": the file's own word when it is already Pass, Fail or Needs Manual Staff Checking, else the one its Type gives (an older file's "Verified" is Pass). In the downloaded Excel file, such a row keeps its cells as they were, because the dashboard did not check it.

The **Type** says what was found. Every Type stays: **Verified**, **Rating Only**, **Duplicate**, **Purchase screenshot missing**, **Delivery screenshot missing**, **Review link or screenshot missing**, **Need Google Drive Access**, **Need Access**, **Purchase screenshot not clear**, **Delivery screenshot not clear**, **Review screenshot not clear**, **Order ID is not matching**, **Order details not matching**, **Not delivered**, **Product is not matching**, **Wrong review link**, **Amazon review is deleted**, **Review not live**, **Review link needed**, **Reviewer name is different**, **Review screenshot not matching**, **User not being able to add reviews** and **Something else**. Only Verified and Rating Only are Pass.

Every row gets a short **Note** in plain English. It starts with one sentence giving the Status and its reason ("This transaction passed: …", "This transaction failed because …", "A staff member needs to check this transaction because …"), then the values for anything that is different, then one short sentence for each other problem. Nothing is said twice. Order IDs are written in full, dates day first (16-07-2026), amounts in rupees (₹654) and product names in quotes; never a cell name, a column letter or a code. For example:

```
This transaction failed because the order ID on the delivery screenshot does not match the order ID the user gave. The user gave order ID 403-1234567-1234567, and the delivery screenshot shows order ID 403-7654321-7654321.
```

The full detail is on the row's own page, in its comparison table: the four details for the sheet, the purchase screenshot and the delivery screenshot, each as the same, different or not shown.

## Download the results

Press **Download**, next to **Start checking**, and choose:

- **The checked Excel file**: your uploaded file, with only the Status (Pass, Fail or Needs Manual Staff Checking), the Type and the Note of each checked row filled in on the checked tab, in its own Status, Type and Note columns, which keep their headings. No column moves, and no column is added for them, except that a Status, Type or Note column the file does not have is added after the last column, headed "Status", "Type" or "Note". Everything else stays exactly as it was: the other tabs, the links behind cells, the filter, the column widths and the formatting. Rows not checked yet keep those cells as they were. The file is named like yours, with "checked" and the date added, for example `July orders checked 2026-10-05.xlsx`.
- **The results only**: a small file, which Excel can open, with these columns: Row (the row's number on the dashboard), Order ID, Status, Type and Note.

A result is never written over a formula: if a Status, Type or Note cell holds one, the dashboard says which one and in which row (by its number on the dashboard), so you can clear it in Excel. A file with macros (.xlsm) comes back as .xlsm.

## Add a row by hand

Under **More**, at the bottom of the page. For testing one row without a sheet. Fill in the same fields as the sheet: only the fields the uploaded file has a column for show. Each picture can be a file or a link.

## Remove rows

- **Delete row**, on a row's own page. It asks first.
- **Remove all rows**, under **More**, at the bottom of the page. It asks first, and says how many rows it will remove. It removes the rows from the sheet, the rows added by hand, and any rows made with the old layout (User name, Delivery screenshot, Review screenshot, Review link), which are not converted and cannot be checked.

Both are greyed out while a check or a sheet upload is running. Both keep the Amazon login, the uploaded sheet, the remembered columns and the campaigns. Both also remove the rows' check results from the `data` folder: what was read from their screenshots, and the pictures of each check's steps (**Remove all rows** removes every check's, even one stopped part way). Download the results first if you want to keep them.

## The settings file

`settings.json`, next to this README, holds the words and numbers the checks decide by:

- the Type words (the three Status words are fixed: Pass, Fail and Needs Manual Staff Checking);
- the passing marks: how many of a product name's words must be shown (80%), how much of a review's words must match (85%), how many rupees an amount may differ by (1), and how many rupees of Amazon's fees may be missing from a screenshot that shows no total (5);
- the picture websites downloads may use;
- the phrases that mean Amazon refused a review, and the phrases that mean a star rating only;
- the words in a delivery cell that mean not delivered;
- the seconds between two downloads;
- the emails sent to users ("emails": the sign-off and each email's subject and message), which the Email templates box under More writes here too.

Change a value between its quotes, keep the commas and brackets as they are, and save the file. The next check uses it. If something in it is wrong, the dashboard says what and where, and checks nothing until it is put right.

## How the Live Amazon Browser behaves

- One Amazon page at a time, at least 3 seconds apart.
- It never types into Amazon, and never solves or gets around a login page, a robot check or a block. It only reads the "Hello, NAME" line on Amazon, and the account button on Google's pages, to see who is logged in. Into Google it writes only the email you send to a user: the address, the subject and the words, in that email's own fields on Gmail's page for a new email, with no key pressed (never into a login page). The one thing it ever presses is Gmail's **Send** button, on that page; it then stays on that page until Gmail has finished sending, and leaves.
- It never hides that it is automated. The normal Chrome window offered for the Google login is a plain Chrome, with nothing hidden either.
- Of Google, it opens only Google's login page and home page when you press **Log in to Google**, Gmail's page for a new email when you send an email to a user (opened empty: nothing of the email is ever in the page's address, so the browser's history keeps none of it), and downloads only the Google Drive links in the sheet, with no page opened. Nothing else in the Google account, and nothing else in Gmail, is ever opened, read or changed.

## Where things are kept

Everything is in the `data` folder: the rows, their downloaded pictures, the uploaded sheet, each check's result and pictures, a result changed or marked right by staff, the emails sent (or maybe sent) about each row, the test email address, the log of every try at sending an email (`email-log.txt`), and the browser profile, which holds both the Amazon and the Google login. The dashboard never shows that folder as files; a row's pictures are given only through its own guarded routes, and never to another website. Screenshots uploaded by file name with the old layout stay in `data/screenshots/uploaded`.

Checks also keep a copy of each Amazon page they open, until one check has kept the review, product, "See all reviews" and search pages. These copies are for making test files; they still contain the logged-in account's and the reviewer's details. They are kept in the check's folder, so they go with its row (**Delete row**, **Remove all rows**).

## Safety

The server listens on 127.0.0.1 only, port 8093, so other computers cannot reach it, and it answers only when the address is exactly `localhost:8093` or `127.0.0.1:8093`. It sends no CORS headers, so other websites cannot use it. Files are GET and HEAD only; POST works only on the dashboard's own routes, with the page's session token. That token is signed with a random secret made each time the server starts, and lasts 8 hours. As before, while the dashboard runs, another program on this same computer could ask it for that token too; the data folder itself is readable only by your Mac account. Picture downloads use https only, only the allowed websites, never an address on this computer or the local network, at most 10 MB, PNG, JPEG or WebP only, and at most 5 redirects.

## For checking the code

```
cd "/Users/prakashtamang/Amazon Review Checker"
npm test
npm run check
```

`npm test` runs every test. The tests use a made-up orders file, drawn pictures, saved pages and pretend answers only (pretend Amazon, Google and Gmail pages, answered inside a hidden Chrome whose every other address is refused); they never open Amazon, Google, Google Drive, Gmail or any other website, and contain no redirects. `npm run check` runs Node's syntax check on every module.

To make the test files again:

```
node test/fixtures/sheets/make-orders.mjs
node test/fixtures/amazon/make-order-screenshots.mjs
node test/fixtures/amazon/make-order-pages.mjs
node test/fixtures/amazon/make-screenshots.mjs
node test/fixtures/amazon/make-delivery-screenshots.mjs
```

Tesseract reads Hindi with `hin.traineddata` in Homebrew's tessdata folder. After `brew upgrade tesseract`, add it again:

```
curl -L -o /opt/homebrew/share/tessdata/hin.traineddata https://github.com/tesseract-ocr/tessdata_fast/raw/main/hin.traineddata
```
