# Amazon Review Checker

## Wall rules for the Flipkart work

A Flipkart checker is being added to this dashboard. The Amazon checker works and must keep working exactly as it does now. Every session follows these rules:

1. Flipkart code goes only in new places: a `flipkart/` folder, `views/flipkart.js`, test files whose names start with `flipkart` (for example `test/flipkart-check.test.mjs`), `test/fixtures/flipkart/` and `data/flipkart/`.
2. Never change anything in the `amazon/` folder, `views/amazon.js`, the Amazon tests, the Amazon fixtures or the Amazon data while working on Flipkart.
   - Amazon tests: every file in `test/` whose name does not start with `flipkart`.
   - Amazon fixtures: everything in `test/fixtures/` except `test/fixtures/flipkart/`.
   - Amazon data: everything in `data/` except `data/flipkart/`.
   - Also Amazon's own: `views/amazon.css`, `live-browser.html` and `settings.json` in this folder.
3. Shared files may only get the few lines needed to add the Flipkart screen and its routes. For anything bigger, stop and ask the user first. The shared files are `serve.mjs`, `app.js`, `index.html`, `styles.css`, `lib/`, `assets/`, `package.json`, `package-lock.json`, `syntax-check.mjs`, `README.md` and `.gitignore`.
4. If Flipkart needs something the Amazon code has, copy it into the `flipkart/` folder. Never change the Amazon one so both can use it.
5. Flipkart gets its own settings and its own browser login folder, never Amazon's. Amazon's are `settings.json` in this folder, `data/settings.json` and `data/amazon-profile/`.
6. After every Flipkart change, run every test (`npm test`). Every Amazon test must still pass, with the same count as before. If any Amazon test fails, undo the change and tell the user.
   - The count before any Flipkart work (2026-10-09): 392 tests in 25 test files, all passing.
   - Only the Amazon tests: `node --test --test-concurrency=1 $(ls test/*.test.mjs | grep -v '^test/flipkart')`
7. Every change gets one line in `CHANGELOG.md`: the date, a tag, and what changed in plain words. The tag is `[AMAZON]` for a change only to Amazon, `[FLIPKART]` for a change only to Flipkart, or `[SHARED]` for a change that is neither only Amazon nor only Flipkart.

## Good to know before changing anything

- `test/rules.test.mjs` reads every file in this folder except `data/`, `node_modules/` and `.git/`, Flipkart files and these notes included. Three words are banned in every file name and file (they are written in base64 in that test; "Fayr", the name in the top bar, was taken off that list on 2026-10-12); only `exceljs` and `playwright-core` may be used; tests may hold no redirects. Breaking any of these changes the Amazon count.
- `test/lib.test.mjs` also checks every `views/*.js`, so `views/flipkart.js` too: no `innerHTML` and no `console`.
- The Flipkart "Coming soon" tab is drawn inside the Amazon screen (`marketTabs()` in `views/amazon.js`), and an Amazon test (`test/amazon-view.test.mjs`, "the marketplace tabs") requires it to stay switched off. Making that tab work means changing an Amazon file and an Amazon test, so ask the user first.

## Save point

- The code before any Flipkart work is saved in git as "Amazon working, before Flipkart".
- A copy of `data/` from that day is at `/Users/prakashtamang/data-backup-before-flipkart`. Keep copies of `data/` outside this folder: the rules test would read them and fail on the customer files.
