// Getting a Flipkart row's screenshots: the downloads (flipkart/pictures.js)
// and making a download into a picture (flipkart/picture-fix.js), copied from
// the Amazon checker's. Downloads with pretend answers only: a pretend Google
// Drive and pretend picture websites, so nothing reaches Google Drive or any
// other website, and there are no redirects. Made-up pictures and a made-up
// PDF only, made into pictures with the Mac's own tools.
// Run: node test/flipkart-pictures.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadPicture, nextDriveUrl, nextPictureUrl, driveDownloadUrl, drivePreviewUrl, driveConfirmUrl, isPublicAddress, makeSafeLookup, safeFetch, isAllowedSite, createPacer, MAX_REDIRECTS, MAX_DOWNLOAD_BYTES } from '../flipkart/pictures.js';
import { isPdf, pdfToPicture, shrinkPicture, preparePicture, PDF_PAGE_WIDTH } from '../flipkart/picture-fix.js';
import { imageType, MAX_PICTURE_BYTES } from '../flipkart/image-type.js';
import { PICTURE_WEBSITES } from '../flipkart/screenshots.js';
import { tinyPng } from './fixtures/flipkart/zip-tools.mjs';
import { madeUpPdf, dotsPng } from './fixtures/flipkart/made-up-files.mjs';

const PNG = tinyPng([52, 107, 55]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('a made-up JPEG start')]);
const PDF = madeUpPdf(2);
const ALLOWED = PICTURE_WEBSITES;
const ID = '1TestFlipkartOrder02abcd';
const DRIVE = `https://drive.google.com/open?id=${ID}`;
const WEB = 'https://tryboxs.in/api/view-screenshot/test-flipkart-delivery-04';
const answer = (status, body, headers = {}) => new Response(body, { status, headers });
const NEED_ACCESS_PAGE = '<!doctype html><html><head><title>Google Drive</title></head><body>You need access</body></html>';
const never = async () => {
  throw new Error('nothing should be fetched');
};

async function get(link, reply, opts = {}) {
  const calls = [];
  const out = await downloadPicture(link, {
    allowed: ALLOWED,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return typeof reply === 'function' ? reply(url, init) : reply;
    },
    ...opts,
  });
  return { out, calls };
}

test("the picture websites besides Google Drive are the Amazon checker's own list, kept for Flipkart", () => {
  assert.deepEqual(ALLOWED, ['storage.googleapis.com', 'tryboxs.in', 'www.tryboxs.in']);
});

test('Google Drive: a file open to everyone with the link is downloaded from its direct-download address, with the fetch given (the Flipkart Google Browser\'s)', async () => {
  const { out, calls } = await get(DRIVE, () => answer(200, PNG, { 'Content-Type': 'application/octet-stream' }));
  assert.deepEqual([out.ok, out.type, out.site, out.data.equals(PNG)], [true, 'image/png', 'Google Drive', true]);
  assert.deepEqual(calls.map((c) => c.url), [driveDownloadUrl(ID)]);
  assert.equal(calls[0].init.redirect, 'manual', 'a redirect is never followed without being looked at');
  assert.equal((await get('https://drive.google.com/file/d/1TestFlipkartOrder03abcd/view?usp=drivesdk', answer(200, JPG))).out.type, 'image/jpeg');
  // The Flipkart Google Browser not open: said plainly.
  const closed = await get(DRIVE, () => Promise.reject(Object.assign(new Error('closed'), { code: 'CLOSED' })));
  assert.deepEqual([closed.out.ok, closed.out.kind, closed.out.says], [false, 'busy', 'the Flipkart Google Browser is not open, so it could not be downloaded']);
});

test('Google Drive: a file that can be viewed but whose download is refused is opened through the picture Drive shows of it; a PDF and a large picture are downloaded as they are; the "Download anyway" form is sent once', async () => {
  const refusals = [() => answer(403, 'no'), () => answer(401, 'no'), () => answer(404, 'no'), () => answer(200, NEED_ACCESS_PAGE, { 'Content-Type': 'text/html; charset=utf-8' })];
  for (const refuse of refusals) {
    const { out, calls } = await get(DRIVE, (url) => (url === drivePreviewUrl(ID) ? answer(200, PNG, { 'Content-Type': 'image/png' }) : refuse()));
    assert.deepEqual([out.ok, out.data.equals(PNG)], [true, true], 'the picture Drive shows');
    assert.deepEqual(calls.map((c) => c.url), [driveDownloadUrl(ID), drivePreviewUrl(ID)], 'the download first, then the picture Drive shows');
  }
  const pdf = await get(DRIVE, () => answer(200, PDF));
  assert.deepEqual([pdf.out.ok, pdf.out.type, pdf.calls.length], [true, 'application/pdf', 1], 'its pages are turned into a picture afterwards');
  const big = Buffer.concat([PNG, Buffer.alloc(MAX_PICTURE_BYTES)]);
  const kept = await get(DRIVE, () => answer(200, big));
  assert.deepEqual([kept.out.ok, kept.out.data.length], [true, big.length], 'made smaller afterwards; only a far larger file is refused');
  const VIRUS_PAGE = `<!doctype html><html><head><title>Google Drive - Virus scan warning</title></head><body><form id="download-form" action="https://drive.usercontent.google.com/download" method="get"><input type="submit" value="Download anyway"><input type="hidden" name="id" value="${ID}"><input type="hidden" name="export" value="download"><input type="hidden" name="confirm" value="t"><input type="hidden" name="uuid" value="test-uuid"></form><p>Google Drive can&#39;t scan this file for viruses.</p></body></html>`;
  const confirm = `https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t&uuid=test-uuid`;
  assert.equal(driveConfirmUrl(VIRUS_PAGE, driveDownloadUrl(ID)), confirm);
  assert.equal(driveConfirmUrl(VIRUS_PAGE.replace('https://drive.usercontent.google.com/download', 'https://evil.example.com/download'), driveDownloadUrl(ID)), null, 'never to another website');
  const anyway = await get(DRIVE, (url) => (url === confirm ? answer(200, PNG, { 'Content-Type': 'image/png' }) : answer(200, VIRUS_PAGE, { 'Content-Type': 'text/html; charset=utf-8' })));
  assert.deepEqual([anyway.out.ok, anyway.calls.map((c) => c.url)], [true, [driveDownloadUrl(ID), confirm]]);
});

test("Google Drive: Google's login page, a robot check or a block while downloading stops there (pause): nothing more is tried, nothing is got around", async () => {
  const SIGN_IN_PAGE = '<!doctype html><html><head><title>Sign in - Google Accounts</title></head><body>Sign in</body></html>';
  const ROBOT_PAGE = '<!doctype html><html><head><title>Sorry...</title></head><body>Our systems have detected unusual traffic from your computer network.</body></html>';
  for (const [reply, pause, says] of [
    [() => answer(200, SIGN_IN_PAGE, { 'Content-Type': 'text/html; charset=utf-8' }), 'google-signin', 'Google asked to log in'],
    [() => answer(403, SIGN_IN_PAGE, { 'Content-Type': 'text/html; charset=utf-8' }), 'google-signin', 'Google asked to log in'],
    [() => answer(200, ROBOT_PAGE, { 'Content-Type': 'text/html; charset=utf-8' }), 'google-robot', 'Google showed a robot check'],
    [() => answer(429, 'slow down'), 'google-blocked', 'Google Drive is limiting downloads right now'],
  ]) {
    const { out, calls } = await get(DRIVE, reply);
    assert.deepEqual([out.ok, out.pause, out.says], [false, pause, says], pause);
    assert.deepEqual(calls.map((c) => c.url), [driveDownloadUrl(ID)], `${pause}: the picture Drive shows is not tried either`);
  }
  assert.deepEqual(nextDriveUrl('https://accounts.google.com/ServiceLogin?continue=x', driveDownloadUrl(ID)), { ok: false, pause: 'google-signin', says: 'Google asked to log in' });
  assert.deepEqual(nextDriveUrl('https://www.google.com/sorry/index?continue=x', driveDownloadUrl(ID)), { ok: false, pause: 'google-robot', says: 'Google showed a robot check' });
});

test('Google Drive: no access, a missing file, too large, not a picture: each said plainly; "no access" only when Google said so', async () => {
  const says = async (reply, opts) => {
    const { out } = await get(DRIVE, reply, opts);
    assert.equal(out.ok, false);
    return [out.kind, out.says, ...(out.noAccess ? ['no access'] : [])];
  };
  const NO_ACCESS = 'the Google account logged in to the dashboard has no access to the file';
  assert.deepEqual(await says(() => answer(403, 'no')), ['drive', NO_ACCESS, 'no access']);
  assert.deepEqual(await says(() => answer(200, NEED_ACCESS_PAGE, { 'Content-Type': 'text/html; charset=utf-8' })), ['drive', 'Google Drive showed a page asking for access instead of the picture', 'no access']);
  assert.deepEqual(await says(() => answer(404, 'gone')), ['drive', 'Google Drive could not find the file, or the Google account logged in to the dashboard has no access to it', 'no access']);
  assert.deepEqual(await says(answer(200, 'x', { 'Content-Length': String(MAX_DOWNLOAD_BYTES + 1) })), ['drive', 'the file is larger than 60 megabytes, so it was not downloaded']);
  assert.deepEqual(await says(answer(200, Buffer.from('GIF89a-not-a-picture-here'))), ['drive', 'the file is a file that is not a picture the dashboard can read']);
  assert.deepEqual(await says(answer(503, 'down')), ['busy', 'Google Drive had a problem of its own']);
  assert.deepEqual(await says(() => Promise.reject(new Error('offline'))), ['busy', 'it could not be reached from this computer']);
  assert.deepEqual(await says((url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))), { timeoutMs: 30 }), ['busy', 'it did not answer within 0 seconds']);
  assert.deepEqual((await get('https://drive.google.com/drive/my-drive', never)).out, { ok: false, kind: 'drive', site: 'Google Drive', says: 'the Google Drive link has no file in it' });
});

test("where a Drive download may go next: Google's own https addresses on the usual port; Google's login page means the Google login is missing or has ended", () => {
  const from = driveDownloadUrl(ID);
  assert.equal(nextDriveUrl(`https://drive.usercontent.google.com/download?id=${ID}&export=download`, from).ok, true);
  assert.equal(nextDriveUrl('https://doc-0s-1c-docs.googleusercontent.com/docs/securesc/x', from).ok, true);
  assert.equal(nextDriveUrl('https://lh3.googleusercontent.com/drive-storage/x=w4000', from).ok, true, 'the picture Drive shows');
  assert.deepEqual(nextDriveUrl('https://evil.example/x.png', from), { ok: false, says: 'Google Drive sent the download to another website, evil.example' });
  assert.deepEqual(nextDriveUrl('http://drive.usercontent.google.com/download?id=x', from), { ok: false, says: 'Google Drive sent the download to an address that is not safe to open' });
  assert.deepEqual(nextDriveUrl('https://drive.google.com:8443/x', from), { ok: false, says: 'Google Drive sent the download to an address that is never opened' });
  assert.equal(nextDriveUrl('https://googleusercontent.com.evil.example/x', from).ok, false);
});

test('other picture websites: an allowed website gives its picture; refused, missing, not a picture, and a website not on the list are each said, with the website', async () => {
  for (const link of [WEB, 'https://www.tryboxs.in/api/view-screenshot/test-flipkart-delivery-05', 'https://storage.googleapis.com/test-bucket/flipkart/delivery-row-03.png']) {
    const { out, calls } = await get(link, answer(200, PNG, { 'Content-Type': 'image/png' }));
    assert.deepEqual([out.ok, out.site, calls.map((c) => c.url)], [true, new URL(link).hostname, [link]], link);
  }
  const says = async (link, reply, opts) => {
    const { out } = await get(link, reply, opts);
    assert.equal(out.ok, false);
    return [out.kind, out.site, out.says];
  };
  assert.deepEqual(await says(WEB, answer(403, 'no')), ['access', 'tryboxs.in', 'the website refused to give it']);
  assert.deepEqual(await says(WEB, answer(404, 'no')), ['access', 'tryboxs.in', 'the website could not find it']);
  assert.deepEqual(await says(WEB, answer(200, '<!doctype html><title>Screenshot</title>', { 'Content-Type': 'text/html' })), ['access', 'tryboxs.in', 'the website sent a web page instead of a picture']);
  assert.deepEqual(await says('https://pictures.example.com/review.png', never), ['allowed', 'pictures.example.com', "the website is not on the dashboard's list of picture websites"], 'a website not on the list is never opened');
  assert.deepEqual(await says('http://tryboxs.in/api/view-screenshot/test-1', never), ['access', 'tryboxs.in', 'the link is not a safe link, so it was not opened']);
  assert.deepEqual(await says(WEB, () => Promise.reject(Object.assign(new Error('private'), { code: 'PRIVATE_ADDRESS' }))), ['access', 'tryboxs.in', 'the link leads to this computer or the local network, which is never opened']);
  assert.deepEqual((await get('not a link', never)).out, { ok: false, kind: 'access', site: null, says: 'it is not a web link' });
  const stop = new AbortController();
  stop.abort();
  assert.equal((await get(WEB, never, { signal: stop.signal })).out.stopped, true, 'a stopped download fetches nothing');
  assert.deepEqual(nextPictureUrl('https://evil.example/x.png', WEB, ALLOWED), { ok: false, says: "the website sent the download to evil.example, which is not on the dashboard's list of picture websites" });
  assert.deepEqual(nextPictureUrl('/api/file/x.png', WEB, ALLOWED), { ok: true, url: 'https://tryboxs.in/api/file/x.png' });
  assert.equal(MAX_REDIRECTS, 5);
  assert.deepEqual([isAllowedSite('TRYBOXS.IN.', ALLOWED), isAllowedSite('evil-tryboxs.in', ALLOWED)], [true, false]);
});

test('never an address on this computer or the local network: not by its number, and not by a name that leads to one', async () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '192.168.1.10', '169.254.169.254', '::1', 'fd12:3456::1', '::ffff:127.0.0.1']) assert.equal(isPublicAddress(a), false, a);
  for (const a of ['8.8.8.8', '2001:4860:4860::8888']) assert.equal(isPublicAddress(a), true, a);
  const lookup = makeSafeLookup((host, opts, cb) => cb(null, [{ address: '10.0.0.5', family: 4 }]));
  const err = await new Promise((resolve) => lookup('pictures.example', {}, (e) => resolve(e)));
  assert.equal(err.code, 'PRIVATE_ADDRESS');
  for (const [url, code] of [
    ['http://tryboxs.in/x.png', 'NOT_HTTPS'],
    ['https://127.0.0.1/x.png', 'PRIVATE_ADDRESS'],
    ['https://user:pw@tryboxs.in/x.png', 'CREDENTIALS'],
  ]) {
    await assert.rejects(safeFetch(url, { timeoutMs: 2000 }), (e) => e.code === code, url);
  }
});

test('downloads are kept apart: one at a time, each a set time after the last one ended', async () => {
  let clock = 0;
  const slept = [];
  const pacer = createPacer(1000, { now: () => clock, sleep: async (ms) => (slept.push(ms), (clock += ms)) });
  const order = [];
  await Promise.all([pacer.run(async () => order.push('a')), pacer.run(async () => order.push('b')), pacer.run(async () => ((clock += 300), order.push('c')))]);
  assert.deepEqual([order, slept], [['a', 'b', 'c'], [1000, 1000]]);
});

test("a PDF's pages are drawn into one tall picture on this computer; a picture too large to keep is made smaller; a file that cannot be made into a picture says so plainly", { timeout: 180_000 }, async () => {
  assert.deepEqual([isPdf(PDF), isPdf(PNG)], [true, false]);
  const pages = await pdfToPicture(PDF);
  assert.equal(pages.ok, true, pages.says);
  assert.deepEqual([pages.type, pages.pages, pages.pageCount, imageType(pages.data)], ['image/png', 2, 2, 'image/png']);
  const one = await pdfToPicture(PDF, { maxPages: 1 });
  assert.deepEqual([one.pages, one.pageCount], [1, 2], 'at most the number of pages asked for');
  assert.deepEqual(await pdfToPicture(PNG), { ok: false, says: 'the file is not a PDF' });
  assert.equal((await pdfToPicture(Buffer.from('%PDF-1.7 not really a document'))).ok, false);
  assert.deepEqual(await pdfToPicture(PDF, { osascript: async () => { throw new Error('no such tool'); } }), { ok: false, says: 'the file is a PDF whose pages could not be turned into a picture on this computer' });
  // A large picture of made-up dots, made smaller: narrower or as a JPEG, until it fits.
  const dots = dotsPng();
  const small = await shrinkPicture(dots, { maxBytes: 200_000 });
  assert.equal(small.ok, true, small.says);
  assert.deepEqual([small.type, imageType(small.data), small.data.length <= 200_000, small.width <= PDF_PAGE_WIDTH], ['image/jpeg', 'image/jpeg', true, true]);
  const same = await shrinkPicture(PNG, { maxBytes: PNG.length });
  assert.deepEqual([same.ok, same.data.equals(PNG)], [true, true], 'a picture that fits stays as it is');
  assert.deepEqual(await shrinkPicture(dots, { maxBytes: 100 }), { ok: false, says: 'the picture is too large, and could not be made small enough on this computer' });
  assert.deepEqual(await shrinkPicture(Buffer.from('GIF89a-not-a-picture'), { maxBytes: 1 }), { ok: false, says: 'the file is not a picture the dashboard can read' });
  // A download made ready to keep.
  const ready = await preparePicture({ ok: true, data: PDF, type: 'application/pdf', site: 'Google Drive' });
  assert.deepEqual([ready.ok, ready.type, ready.pages], [true, 'image/png', 2]);
  const shrunk = await preparePicture({ ok: true, data: dots, type: 'image/png', site: 'Google Drive' }, { maxBytes: 200_000 });
  assert.deepEqual([shrunk.ok, shrunk.type, shrunk.shrunk], [true, 'image/jpeg', true]);
  assert.deepEqual(await preparePicture({ ok: false, kind: 'drive', site: 'Google Drive', says: 'no' }), { ok: false, kind: 'drive', site: 'Google Drive', says: 'no' }, 'a download that failed is left as it is');
  const cannot = await preparePicture({ ok: true, data: Buffer.from('%PDF-1.7 not really a document'), type: 'application/pdf', site: 'Google Drive' });
  assert.deepEqual([cannot.ok, cannot.kind], [false, 'file']);
});
