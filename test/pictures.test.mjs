// Downloading pictures given as links, with pretend answers only: nothing
// reaches Google Drive or any other website, and there are no redirects.
// Google Drive: an open file, a file anyone can view whose download is
// refused, a private file, a missing file, too large, not a picture. Other
// websites: the same, and a website not on the allowed list.
// Run: node test/pictures.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadPicture, nextDriveUrl, nextPictureUrl, driveDownloadUrl, drivePreviewUrl, driveConfirmUrl, isPublicAddress, makeSafeLookup, safeFetch, isAllowedSite, createPacer, MAX_REDIRECTS, MAX_DOWNLOAD_BYTES } from '../amazon/pictures.js';
import { MAX_PICTURE_BYTES } from '../amazon/image-type.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'amazon');
const PNG = readFileSync(join(FIX, 'screenshot-review.png'));
const JPG = readFileSync(join(FIX, 'screenshot-review-again.jpg'));
const ALLOWED = ['storage.googleapis.com', 'tryboxs.in', 'www.tryboxs.in'];
const DRIVE = 'https://drive.google.com/open?id=1TestOrderRow02abcdefgh';
const WEB = 'https://tryboxs.in/api/view-screenshot/test-delivery-04';
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

test('Google Drive: a file open to everyone with the link is downloaded from its direct-download address', async () => {
  const { out, calls } = await get(DRIVE, () => answer(200, PNG, { 'Content-Type': 'application/octet-stream' }));
  assert.equal(out.ok, true);
  assert.equal(out.type, 'image/png');
  assert.ok(out.data.equals(PNG));
  assert.equal(out.site, 'Google Drive');
  assert.deepEqual(calls.map((c) => c.url), [driveDownloadUrl('1TestOrderRow02abcdefgh')]);
  assert.equal(calls[0].init.redirect, 'manual', 'a redirect is never followed without being looked at');
  assert.equal((await get('https://drive.google.com/file/d/1TestOrderRow03abcdefgh/view?usp=drivesdk', answer(200, JPG))).out.type, 'image/jpeg');
});

test('Google Drive: a file that can be viewed but whose download is refused is opened through the picture Drive shows of it', async () => {
  const ID = '1TestOrderRow02abcdefgh';
  const refusals = [() => answer(403, 'no'), () => answer(401, 'no'), () => answer(404, 'no'), () => answer(200, NEED_ACCESS_PAGE, { 'Content-Type': 'text/html; charset=utf-8' })];
  for (const refuse of refusals) {
    const { out, calls } = await get(DRIVE, (url) => (url === drivePreviewUrl(ID) ? answer(200, PNG, { 'Content-Type': 'image/png' }) : refuse()));
    assert.equal(out.ok, true);
    assert.ok(out.data.equals(PNG), 'the picture Drive shows');
    assert.deepEqual(calls.map((c) => c.url), [driveDownloadUrl(ID), drivePreviewUrl(ID)], 'the download first, then the picture Drive shows');
    assert.match(calls[1].init.headers.Accept, /^image\/png,image\/jpeg/, 'a PNG or JPEG picture is asked for');
    assert.equal(calls[1].init.redirect, 'manual');
  }
  assert.equal(drivePreviewUrl(ID), 'https://drive.google.com/thumbnail?id=1TestOrderRow02abcdefgh&sz=w4000');
  // A file that is not a picture is not looked at again: the picture Drive shows would not help.
  const { calls } = await get(DRIVE, () => answer(200, Buffer.from('GIF89a-not-a-picture-here')));
  assert.equal(calls.length, 1);
  // A PDF is downloaded as one: its pages are turned into a picture afterwards (picture-fix.js).
  const pdf = await get(DRIVE, () => answer(200, Buffer.from('%PDF-1.7 test')));
  assert.deepEqual([pdf.out.ok, pdf.out.type, pdf.calls.length], [true, 'application/pdf', 1]);
  // A picture larger than the dashboard keeps is downloaded as it is, to be made smaller afterwards; only a far larger file is refused.
  const big = Buffer.concat([PNG, Buffer.alloc(MAX_PICTURE_BYTES)]);
  const kept = await get(DRIVE, () => answer(200, big));
  assert.deepEqual([kept.out.ok, kept.out.data.length], [true, big.length]);
  // Drive's own page for a large file it cannot check for viruses: its "Download anyway" form is sent, once, to Google's own address.
  const VIRUS_PAGE = '<!doctype html><html><head><title>Google Drive - Virus scan warning</title></head><body><form id="download-form" action="https://drive.usercontent.google.com/download" method="get"><input type="submit" value="Download anyway"><input type="hidden" name="id" value="1TestOrderRow02abcdefgh"><input type="hidden" name="export" value="download"><input type="hidden" name="confirm" value="t"><input type="hidden" name="uuid" value="test-uuid"></form><p>Google Drive can&#39;t scan this file for viruses.</p></body></html>';
  const confirm = 'https://drive.usercontent.google.com/download?id=1TestOrderRow02abcdefgh&export=download&confirm=t&uuid=test-uuid';
  assert.equal(driveConfirmUrl(VIRUS_PAGE, driveDownloadUrl(ID)), confirm);
  assert.equal(driveConfirmUrl(NEED_ACCESS_PAGE, driveDownloadUrl(ID)), null, 'a page asking for access has no such form');
  assert.equal(driveConfirmUrl(VIRUS_PAGE.replace('https://drive.usercontent.google.com/download', 'https://evil.example.com/download'), driveDownloadUrl(ID)), null, 'never to another website');
  const anyway = await get(DRIVE, (url) => (url === confirm ? answer(200, PNG, { 'Content-Type': 'image/png' }) : answer(200, VIRUS_PAGE, { 'Content-Type': 'text/html; charset=utf-8' })));
  assert.deepEqual([anyway.out.ok, anyway.out.type], [true, 'image/png']);
  assert.deepEqual(anyway.calls.map((c) => c.url), [driveDownloadUrl(ID), confirm], 'the form is sent once; the picture Drive shows is not needed');
  const twice = await get(DRIVE, () => answer(200, VIRUS_PAGE, { 'Content-Type': 'text/html; charset=utf-8' }));
  assert.equal(twice.calls.filter((c) => c.url === confirm).length, 1, 'the form is never sent twice');
});

test('Google Drive: Google’s login page, a robot check or a block while downloading pauses the check: nothing more is tried, nothing is got around', async () => {
  const ID = '1TestOrderRow02abcdefgh';
  const SIGN_IN_PAGE = '<!doctype html><html><head><title>Sign in - Google Accounts</title></head><body>Sign in</body></html>';
  const ROBOT_PAGE = '<!doctype html><html><head><title>Sorry...</title></head><body>Our systems have detected unusual traffic from your computer network.</body></html>';
  const pauses = [
    [() => answer(200, SIGN_IN_PAGE, { 'Content-Type': 'text/html; charset=utf-8' }), 'google-signin', 'Google asked to log in'],
    [() => answer(403, SIGN_IN_PAGE, { 'Content-Type': 'text/html; charset=utf-8' }), 'google-signin', 'Google asked to log in'],
    [() => answer(200, ROBOT_PAGE, { 'Content-Type': 'text/html; charset=utf-8' }), 'google-robot', 'Google showed a robot check'],
    [() => answer(429, 'slow down'), 'google-blocked', 'Google Drive is limiting downloads right now'],
  ];
  for (const [reply, pause, says] of pauses) {
    const { out, calls } = await get(DRIVE, reply);
    assert.deepEqual([out.ok, out.pause, out.says], [false, pause, says], pause);
    assert.deepEqual(calls.map((c) => c.url), [driveDownloadUrl(ID)], `${pause}: the picture Drive shows is not tried either`);
  }
  // Where Drive may send the download: Google's login page and its robot check are pauses too.
  assert.deepEqual(nextDriveUrl('https://accounts.google.com/ServiceLogin?continue=x', driveDownloadUrl(ID)), { ok: false, pause: 'google-signin', says: 'Google asked to log in' });
  assert.deepEqual(nextDriveUrl('https://www.google.com/sorry/index?continue=x', driveDownloadUrl(ID)), { ok: false, pause: 'google-robot', says: 'Google showed a robot check' });
  // The download is made with the fetch given: the Live Amazon Browser's own, with its Google login (routes.js).
  const { calls } = await get(DRIVE, answer(200, PNG, { 'Content-Type': 'image/png' }));
  assert.equal(calls.length, 1, 'the fetch given is the one used');
});

test('Google Drive: a file the logged-in Google account cannot open, a missing file, too large, not a picture: each said plainly', async () => {
  const says = async (reply, opts) => {
    const { out } = await get(DRIVE, reply, opts);
    assert.equal(out.ok, false);
    return [out.kind, out.says, ...(out.noAccess ? ['no access'] : [])];
  };
  const NO_ACCESS = 'the Google account logged in to the dashboard has no access to the file';
  // Only a refusal, a missing file or a page asking for access is about access (noAccess): the only "Need Google Drive Access".
  assert.deepEqual(await says(() => answer(403, 'no')), ['drive', NO_ACCESS, 'no access'], 'a file the account has no access to');
  assert.deepEqual(await says(() => answer(401, 'no')), ['drive', NO_ACCESS, 'no access']);
  assert.deepEqual(await says(() => answer(200, NEED_ACCESS_PAGE, { 'Content-Type': 'text/html; charset=utf-8' })), ['drive', 'Google Drive showed a page asking for access instead of the picture', 'no access'], 'shown as a page');
  assert.deepEqual(await says(() => answer(404, 'gone')), ['drive', 'Google Drive could not find the file, or the Google account logged in to the dashboard has no access to it', 'no access'], 'a missing file');
  assert.deepEqual(await says(answer(200, 'x', { 'Content-Length': String(MAX_DOWNLOAD_BYTES + 1) })), ['drive', 'the file is larger than 60 megabytes, so it was not downloaded'], 'too large, by what it says');
  assert.deepEqual(await says(answer(200, Buffer.concat([PNG, Buffer.alloc(64)])), { maxBytes: PNG.length }), ['drive', 'the file is larger than 0 megabytes, so it was not downloaded'], 'too large, found while reading');
  assert.deepEqual(await says(answer(200, Buffer.from('GIF89a-not-a-picture-here'))), ['drive', 'the file is a file that is not a picture the dashboard can read'], 'not a picture');
  assert.deepEqual(await says(answer(200, '<!doctype html><html><head><title>Oops</title></head><body>Nothing here</body></html>', { 'Content-Type': 'text/html' })), ['drive', 'Google Drive showed a page asking for access instead of the picture', 'no access'], 'a page with no file');
  assert.deepEqual(await says(answer(503, 'down')), ['busy', 'Google Drive had a problem of its own']);
  assert.deepEqual(await says(() => Promise.reject(new Error('offline'))), ['busy', 'it could not be reached from this computer']);
  assert.deepEqual(await says((url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))), { timeoutMs: 30 }), ['busy', 'it did not answer within 0 seconds']);
  assert.deepEqual((await get('https://drive.google.com/drive/my-drive', never)).out, { ok: false, kind: 'drive', site: 'Google Drive', says: 'the Google Drive link has no file in it' });
});

test("where a Drive download may go next: Google's own https addresses; Google's login page means the Google login is missing or has ended", () => {
  const from = driveDownloadUrl('1TestOrderRow02abcdefgh');
  assert.deepEqual(nextDriveUrl('https://drive.usercontent.google.com/download?id=1TestOrderRow02abcdefgh&export=download', from), { ok: true, url: 'https://drive.usercontent.google.com/download?id=1TestOrderRow02abcdefgh&export=download' });
  assert.equal(nextDriveUrl('https://doc-0s-1c-docs.googleusercontent.com/docs/securesc/x', from).ok, true);
  assert.equal(nextDriveUrl('/uc?export=download&id=x&confirm=t', from).url, 'https://drive.google.com/uc?export=download&id=x&confirm=t');
  assert.deepEqual(nextDriveUrl('https://accounts.google.com/ServiceLogin?continue=x', from), { ok: false, pause: 'google-signin', says: 'Google asked to log in' });
  assert.deepEqual(nextDriveUrl('https://www.google.com/a/ServiceLogin?x', from), { ok: false, pause: 'google-signin', says: 'Google asked to log in' });
  assert.deepEqual(nextDriveUrl('https://evil.example/x.png', from), { ok: false, says: 'Google Drive sent the download to another website, evil.example' });
  assert.deepEqual(nextDriveUrl('http://drive.usercontent.google.com/download?id=x', from), { ok: false, says: 'Google Drive sent the download to an address that is not safe to open' });
  assert.equal(nextDriveUrl('https://lh3.googleusercontent.com/drive-storage/x=w4000', from).ok, true, 'the picture Drive shows');
  assert.equal(nextDriveUrl('https://lh3.google.com/u/0/d/x=w4000', from).ok, true);
  assert.equal(nextDriveUrl('https://googleusercontent.com.evil.example/x', from).ok, false);
});

test('other picture websites: an allowed website gives its picture', async () => {
  for (const link of [WEB, 'https://www.tryboxs.in/api/view-screenshot/test-delivery-05', 'https://storage.googleapis.com/tryboxs-screenshots/test/delivery-row-03.png']) {
    const { out, calls } = await get(link, answer(200, PNG, { 'Content-Type': 'image/png' }));
    assert.equal(out.ok, true, link);
    assert.equal(out.site, new URL(link).hostname);
    assert.deepEqual(calls.map((c) => c.url), [link]);
    assert.equal(calls[0].init.redirect, 'manual');
  }
});

test('other picture websites: refused, missing, too large, not a picture, and a website not on the list — each is said, with the website', async () => {
  const says = async (link, reply, opts) => {
    const { out } = await get(link, reply, opts);
    assert.equal(out.ok, false);
    return [out.kind, out.site, out.says];
  };
  assert.deepEqual(await says(WEB, answer(403, 'no')), ['access', 'tryboxs.in', 'the website refused to give it'], 'a private file');
  assert.deepEqual(await says(WEB, answer(404, 'no')), ['access', 'tryboxs.in', 'the website could not find it'], 'a missing file');
  assert.deepEqual(await says(WEB, answer(500, 'oops')), ['access', 'tryboxs.in', 'the website did not give it']);
  assert.deepEqual(await says(WEB, answer(200, 'x', { 'Content-Length': String(MAX_DOWNLOAD_BYTES + 1) })), ['access', 'tryboxs.in', 'the picture is larger than 60 megabytes, so it was not downloaded'], 'too large');
  assert.deepEqual((await get(WEB, answer(200, Buffer.from('%PDF-1.7 test')))).out.type, 'application/pdf', 'a PDF is downloaded, to be turned into a picture afterwards');
  assert.deepEqual(await says(WEB, answer(200, '<!doctype html><title>Screenshot</title>', { 'Content-Type': 'text/html' })), ['access', 'tryboxs.in', 'the website sent a web page instead of a picture'], 'not a picture');
  assert.deepEqual(await says(WEB, answer(200, Buffer.from('GIF89a-not-allowed-here'))), ['access', 'tryboxs.in', 'the website sent a file that is not a picture the dashboard can read']);
  assert.deepEqual(await says('https://pictures.example.com/review.png', never), ['allowed', 'pictures.example.com', "the website is not on the dashboard's list of picture websites"], 'a website not on the list is never opened');
  assert.deepEqual(await says('http://tryboxs.in/api/view-screenshot/test-1', never), ['access', 'tryboxs.in', 'the link is not a safe link, so it was not opened']);
  assert.deepEqual(await says('https://tryboxs.in:8443/x', never), ['access', 'tryboxs.in', 'the link is of a kind that is never opened']);
  assert.deepEqual(await says(WEB, () => Promise.reject(Object.assign(new Error('private'), { code: 'PRIVATE_ADDRESS' }))), ['access', 'tryboxs.in', 'the link leads to this computer or the local network, which is never opened']);
  assert.deepEqual(await says(WEB, () => Promise.reject(new Error('offline'))), ['access', 'tryboxs.in', 'it could not be reached from this computer']);
  assert.deepEqual(await says(WEB, (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))), { timeoutMs: 20 }), ['access', 'tryboxs.in', 'it did not answer within 0 seconds']);
  assert.deepEqual((await get('not a link', never)).out, { ok: false, kind: 'access', site: null, says: 'it is not a web link' });
  const stop = new AbortController();
  stop.abort();
  assert.equal((await get(WEB, never, { signal: stop.signal })).out.stopped, true, 'a stopped download fetches nothing');
});

test('where a picture download may go next: https, an allowed website, no name or password, no other port; at most 5 times', () => {
  const from = WEB;
  assert.deepEqual(nextPictureUrl('https://storage.googleapis.com/tryboxs-screenshots/test/x.png', from, ALLOWED), { ok: true, url: 'https://storage.googleapis.com/tryboxs-screenshots/test/x.png' });
  assert.deepEqual(nextPictureUrl('/api/file/x.png', from, ALLOWED), { ok: true, url: 'https://tryboxs.in/api/file/x.png' });
  assert.deepEqual(nextPictureUrl('https://evil.example/x.png', from, ALLOWED), { ok: false, says: "the website sent the download to evil.example, which is not on the dashboard's list of picture websites" });
  assert.deepEqual(nextPictureUrl('http://tryboxs.in/x.png', from, ALLOWED), { ok: false, says: 'the website sent the download to an address that is not safe to open' });
  assert.deepEqual(nextPictureUrl('https://user:pw@tryboxs.in/x.png', from, ALLOWED), { ok: false, says: 'the website sent the download to an address that is never opened' });
  assert.deepEqual(nextPictureUrl('https://tryboxs.in:8443/x.png', from, ALLOWED), { ok: false, says: 'the website sent the download to an address that is never opened' });
  assert.deepEqual(nextPictureUrl('https://127.0.0.1/x.png', from, ALLOWED), { ok: false, says: "the website sent the download to 127.0.0.1, which is not on the dashboard's list of picture websites" });
  assert.equal(MAX_REDIRECTS, 5);
  assert.equal(isAllowedSite('TRYBOXS.IN.', ALLOWED), true);
  assert.equal(isAllowedSite('evil-tryboxs.in', ALLOWED), false);
  assert.equal(isAllowedSite('tryboxs.in.evil.example', ALLOWED), false);
});

test('never an address on this computer or the local network: not by its number, and not by a name that leads to one', async () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '172.16.5.4', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:192.168.0.1', 'not an address']) {
    assert.equal(isPublicAddress(a), false, a);
  }
  for (const a of ['8.8.8.8', '142.250.183.110', '2001:4860:4860::8888', '::ffff:8.8.8.8']) assert.equal(isPublicAddress(a), true, a);
  const lookup = (answerWith) => makeSafeLookup((host, opts, cb) => cb(null, answerWith));
  const ask = (fn, opts) => new Promise((resolve) => fn('pictures.example', opts, (err, address, family) => resolve({ err, address, family })));
  assert.equal((await ask(lookup([{ address: '10.0.0.5', family: 4 }]), {})).err.code, 'PRIVATE_ADDRESS');
  assert.equal((await ask(lookup([{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]), {})).err.code, 'PRIVATE_ADDRESS', 'one private address among several is enough to refuse');
  assert.deepEqual(await ask(lookup([{ address: '93.184.216.34', family: 4 }]), {}), { err: null, address: '93.184.216.34', family: 4 });
  assert.deepEqual((await ask(lookup([{ address: '93.184.216.34', family: 4 }]), { all: true })).address, [{ address: '93.184.216.34', family: 4 }]);
  for (const [url, code] of [
    ['http://tryboxs.in/x.png', 'NOT_HTTPS'],
    ['https://127.0.0.1/x.png', 'PRIVATE_ADDRESS'],
    ['https://[::1]/x.png', 'PRIVATE_ADDRESS'],
    ['https://localhost:9/x.png', 'PRIVATE_ADDRESS'],
    ['https://user:pw@tryboxs.in/x.png', 'CREDENTIALS'],
  ]) {
    await assert.rejects(safeFetch(url, { timeoutMs: 2000 }), (err) => err.code === code, url);
  }
});

test('downloads are kept apart: one at a time, each a set time after the last one ended', async () => {
  let clock = 0;
  const slept = [];
  const pacer = createPacer(1000, { now: () => clock, sleep: async (ms) => (slept.push(ms), (clock += ms)) });
  const order = [];
  await Promise.all([pacer.run(async () => order.push('a')), pacer.run(async () => order.push('b')), pacer.run(async () => (clock += 300, order.push('c')))]);
  assert.deepEqual(order, ['a', 'b', 'c']);
  assert.deepEqual(slept, [1000, 1000]);
  clock += 5000;
  await pacer.run(async () => order.push('d'));
  assert.deepEqual(slept, [1000, 1000], 'no wait when the last download ended long ago');
});

test('Google Drive redirects go to Google’s own https addresses on the usual port, never with a name and password', () => {
  const from = driveDownloadUrl('1TestOrderRow02abcdefgh');
  assert.deepEqual(nextDriveUrl('https://drive.google.com:8443/x', from), { ok: false, says: 'Google Drive sent the download to an address that is never opened' });
  assert.deepEqual(nextDriveUrl('https://u:p@doc-0s.googleusercontent.com/x', from), { ok: false, says: 'Google Drive sent the download to an address that is never opened' });
  assert.equal(nextDriveUrl('https://drive.usercontent.google.com:443/download?id=x', from).ok, true);
});
