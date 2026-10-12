// Getting a Flipkart row's screenshots (flipkart/screenshots.js), the way the
// Amazon checker gets a row's: with a pretend Flipkart Google Browser that
// answers like a pretend Google Drive, pretend picture websites, and
// made-up pictures, so nothing reaches Google or any other website. Each
// picture kept only in data/flipkart/pictures/; a screenshot that cannot be
// had keeps its reason ("no one is logged in to Google", "no access", …);
// Google's login page stops there.
// Run: node test/flipkart-screenshots.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import ExcelJS from 'exceljs';
import { createScreenshots, downloadable, NO_GOOGLE, PICTURE_WEBSITES } from '../flipkart/screenshots.js';
import { downloadPicture, driveDownloadUrl, drivePreviewUrl } from '../flipkart/pictures.js';
import { createFlipkartStore, StoreError } from '../flipkart/store.js';
import { openWorkbook, guessColumns, sheetRows } from '../flipkart/workbook.js';
import { imageType } from '../flipkart/image-type.js';
import { tinyPng } from './fixtures/flipkart/zip-tools.mjs';
import { madeUpPdf } from './fixtures/flipkart/made-up-files.mjs';
import { orderId } from './fixtures/flipkart/make-flipkart.mjs';

const dirs = [];
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

const PNG = tinyPng([166, 58, 43]);
const SIGN_IN_PAGE = '<!doctype html><html><head><title>Sign in - Google Accounts</title></head><body>Sign in</body></html>';
const drive = (id) => `https://drive.google.com/file/d/${id}/view?usp=sharing`;
const FILES = { open: '1TestFlipkartShotOpen01', private: '1TestFlipkartShotPrivate1', pdf: '1TestFlipkartShotPdf00001', login: '1TestFlipkartShotLogin001', later: '1TestFlipkartShotLater01' };
const TRYBOXS = 'https://tryboxs.in/api/view-screenshot/test-flipkart-order-03';
const ELSEWHERE = 'https://pictures.example.com/test-flipkart-delivery-03.png';
const REVIEW = 'https://www.flipkart.com/reviews/TESTPID0000002:3?reviewId=0a1b2c3d-0000-4000-8000-000000000002';

/** A pretend Google Drive, answering by the file's id: what the Flipkart Google Browser's own download gets. */
function pretendDrive(url) {
  const u = new URL(url);
  const id = u.searchParams.get('id');
  const answer = (status, body, type = 'application/octet-stream') => new Response(body, { status, headers: { 'Content-Type': type } });
  if (id === FILES.open || id === FILES.later) return answer(200, PNG);
  if (id === FILES.pdf) return answer(200, madeUpPdf(2));
  if (id === FILES.login) return answer(200, SIGN_IN_PAGE, 'text/html; charset=utf-8');
  return answer(403, 'no');
}

/** A made-up Flipkart file's rows, kept as an upload keeps them: three rows with Google Drive links, other websites, a Flipkart review link and a picture over a cell. */
async function keptRows(dataDir) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Flipkart');
  ws.addRow(['Order ID', 'Order Screenshot', 'Delivery Screenshot', 'Review Screenshot', 'Review Link']);
  ws.addRow([orderId(2), drive(FILES.open), drive(FILES.private), drive(FILES.pdf), REVIEW]);
  ws.addRow([orderId(3), TRYBOXS, ELSEWHERE, drive(FILES.login), null]);
  ws.addRow([orderId(4), null, drive(FILES.later), null, drive(FILES.later)]);
  ws.addImage(wb.addImage({ buffer: PNG, extension: 'png' }), { tl: { col: 1.1, row: 3.1 }, ext: { width: 20, height: 20 } });
  const { tab, kind } = await openWorkbook(Buffer.from(await wb.xlsx.writeBuffer()), { fileName: 'made-up.xlsx' });
  const mapping = guessColumns(tab.headers, null, tab);
  const store = createFlipkartStore(dataDir);
  const saved = await store.saveSheet({ fileName: 'made-up.xlsx', kind, tab: tab.name, headerRow: tab.headerRow, headers: tab.headers, lastCol: tab.lastCol, mapping }, Buffer.from('made-up file'), sheetRows(tab, mapping).rows);
  return { store, rows: saved.rows };
}

/** Everything in the data folder, by its path inside it. */
function filesIn(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

test("a row's screenshots: a Google Drive file through the Flipkart Google Browser, with its login; a picture on an allowed website; a PDF made into one picture; each kept only in data/flipkart/pictures/; a kept picture is not downloaded again", { timeout: 120_000 }, async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'arc-flipkart-shots-'));
  dirs.push(dataDir);
  const { store, rows } = await keptRows(dataDir);
  const browser = { begun: 0, fetched: [], async begin() { this.begun++; }, async fetch(url) { this.fetched.push(url); return pretendDrive(url); } };
  const google = { state: 'in', outs: 0, view() { return { state: this.state }; }, loggedOut() { this.state = 'out'; this.outs++; } };
  const websites = [];
  const shots = createScreenshots({
    store,
    browser,
    google,
    gapMs: 20,
    download: (link, opts) => downloadPicture(link, { ...opts, fetch: opts.fetch ?? (async (url) => (websites.push(url), new Response(PNG, { status: 200 }))) }),
  });
  const [one, two, three] = rows;
  // A Google Drive file open to the Google account: downloaded by the Flipkart Google Browser itself.
  const order = await shots.forCell(one.id, 'order');
  assert.deepEqual([browser.begun, browser.fetched], [1, [driveDownloadUrl(FILES.open)]], 'through the Flipkart Google Browser');
  assert.deepEqual([order.types, order.problems, order.files.map((f) => relative(dataDir, f))], [['image/png'], [], [`flipkart/pictures/${one.id}-order-0.png`]]);
  assert.ok(readFileSync(order.files[0]).equals(PNG), 'the picture as Google Drive gave it');
  assert.equal(statSync(order.files[0]).mode & 0o777, 0o600, 'readable only by this computer\'s user');
  const kept = (await store.row(one.id)).pictures.order[0];
  assert.deepEqual([kept.link, kept.type, kept.size, typeof kept.sha256], [drive(FILES.open), 'image/png', PNG.length, 'string'], 'kept with its row in data/flipkart/rows.json');
  assert.deepEqual((await shots.forCell(one.id, 'order')).types, ['image/png']);
  assert.equal(browser.fetched.length, 1, 'a picture kept before is not downloaded again');
  // A PDF on Google Drive: its pages made into one picture on this computer.
  const pdf = await shots.forCell(one.id, 'reviewShot');
  assert.deepEqual([pdf.types, imageType(readFileSync(pdf.files[0]))], [['image/png'], 'image/png']);
  // A Flipkart review link is a review, not a picture: nothing is downloaded for it.
  assert.deepEqual(await shots.forCell(one.id, 'review'), { files: [], problems: [], types: [], records: [] });
  // A picture on an allowed website: downloaded with no login, never by the Flipkart Google Browser.
  const before = browser.fetched.length;
  const tryboxs = await shots.forCell(two.id, 'order');
  assert.deepEqual([tryboxs.types, websites, browser.fetched.length], [['image/png'], [TRYBOXS], before]);
  // A picture over a cell of the file, kept when the file was uploaded: nothing to download.
  const fromFile = await shots.forCell(three.id, 'order');
  assert.deepEqual([fromFile.types, fromFile.records[0].link], [['image/png'], null]);
  assert.ok(filesIn(dataDir).every((p) => p.startsWith('flipkart/')), 'nothing anywhere else in the data folder');
  assert.deepEqual(filesIn(dataDir).filter((p) => p.startsWith('flipkart/pictures/')).length, 4, 'the file\'s picture, two from Google Drive, one from tryboxs');
});

test('a screenshot that cannot be had keeps its reason, as on Amazon: no access, a website not on the list, no one logged in to Google; Google\'s login page stops there', { timeout: 120_000 }, async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'arc-flipkart-shots-'));
  dirs.push(dataDir);
  const { store, rows } = await keptRows(dataDir);
  const browser = { begun: 0, fetched: [], async begin() { this.begun++; }, async fetch(url) { this.fetched.push(url); return pretendDrive(url); } };
  const google = { state: 'in', outs: 0, view() { return { state: this.state }; }, loggedOut() { this.state = 'out'; this.outs++; } };
  const shots = createScreenshots({ store, browser, google, gapMs: 20, download: (link, opts) => downloadPicture(link, { ...opts, fetch: opts.fetch ?? (async () => { throw new Error('no website may be reached'); }) }) });
  const [one, two, three] = rows;
  // No access: the download and the picture Drive shows both refused.
  const noAccess = await shots.forCell(one.id, 'delivery');
  assert.deepEqual(noAccess.problems, [{ link: drive(FILES.private), kind: 'drive', site: 'Google Drive', says: 'the Google account logged in to the dashboard has no access to the file', noAccess: true }]);
  assert.deepEqual(browser.fetched, [driveDownloadUrl(FILES.private), drivePreviewUrl(FILES.private)]);
  assert.deepEqual((await store.row(one.id)).pictures.delivery, [{ link: drive(FILES.private), problem: { kind: 'drive', site: 'Google Drive', says: 'the Google account logged in to the dashboard has no access to the file', noAccess: true } }], 'the reason is kept with the row');
  // A website not on the list of picture websites: never opened.
  const elsewhere = await shots.forCell(two.id, 'delivery');
  assert.deepEqual(elsewhere.problems, [{ link: ELSEWHERE, kind: 'allowed', site: 'pictures.example.com', says: "the website is not on the dashboard's list of picture websites" }]);
  // Google's login page while downloading: stopped there, nothing kept for the cell, and the top bar is told the login has ended.
  const login = await shots.forCell(two.id, 'reviewShot');
  assert.deepEqual([login.pause, google.outs, google.state], ['google-signin', 1, 'out']);
  assert.deepEqual((await store.row(two.id)).pictures.reviewShot, [], 'nothing saved for the cell');
  // No one logged in to Google: a Google Drive screenshot keeps that reason, and the Flipkart Google Browser is not even opened.
  const begun = browser.begun;
  const fetched = browser.fetched.length;
  const out = await shots.forCell(three.id, 'delivery');
  assert.deepEqual(out.problems, [{ link: drive(FILES.later), ...NO_GOOGLE }]);
  assert.equal(NO_GOOGLE.says, 'no one is logged in to Google, so it was not downloaded yet');
  assert.deepEqual([browser.begun, browser.fetched.length], [begun, fetched], 'nothing fetched, no window opened');
  // Logged in again: a screenshot that could not be had is tried once more.
  google.state = 'in';
  const later = await shots.forCell(three.id, 'delivery');
  assert.deepEqual([later.types, later.problems], [['image/png'], []]);
  assert.equal(browser.fetched.at(-1), driveDownloadUrl(FILES.later));
  // The store keeps only pictures it can read, in data/flipkart/pictures/, and only for a row of the file.
  await assert.rejects(store.setPictures(one.id, 'order', [{ link: null, data: Buffer.from('not a picture at all') }]), (e) => e instanceof StoreError && e.status === 400 && e.message === 'The purchase screenshot must be a PNG, JPEG or WebP picture.');
  await assert.rejects(store.setPictures('r000000000000', 'order', []), (e) => e instanceof StoreError && e.status === 404);
});

test('which links of a cell are pictures to download: every screenshot link; a review link only when it is a picture, never a Flipkart review', () => {
  for (const which of ['order', 'delivery', 'reviewShot']) assert.equal(downloadable(which, REVIEW), true, which);
  assert.equal(downloadable('review', drive(FILES.open)), true, 'a Google Drive picture in the Review Link column');
  assert.equal(downloadable('review', TRYBOXS), true, 'a picture on another website');
  for (const link of [REVIEW, 'https://dl.flipkart.com/s/TestShare02', 'https://fkrt.it/TestShort02', 'https://play.google.com/store/apps/details?id=com.flipkart.android', 'not a link']) assert.equal(downloadable('review', link), false, link);
  assert.deepEqual(PICTURE_WEBSITES, ['storage.googleapis.com', 'tryboxs.in', 'www.tryboxs.in']);
});
