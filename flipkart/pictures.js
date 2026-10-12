// Downloading the pictures a Flipkart row gives as links: a Google Drive file,
// or a picture on one of the picture websites allowed (screenshots.js). Copied
// from the Amazon checker's downloads (amazon/pictures.js) and changed for
// Flipkart. https only, never an address on this computer or the local
// network, PNG, JPEG or WebP (or a PDF, made into a picture afterwards), at
// most 5 redirects, each to an allowed website. A Drive file is downloaded
// with the `fetch` given (screenshots.js gives the Live Amazon Browser's own
// download, which carries its Google login, without opening a page);
// this file itself never logs in anywhere, and nothing is typed. A
// Drive file whose download is refused (its owner may have turned downloading
// off) but which can still be viewed is opened through the picture Drive
// itself shows of it. Every answer is { ok: true, data, type, site } or
// { ok: false, kind, site, says, pause? }, says being plain words that follow
// "but", and nothing here throws.
//
// kind is what went wrong, for the Type and the Note:
//   drive    - Google Drive did not give the picture (Need Google Drive Access)
//   access   - another website did not give it (Need Access)
//   allowed  - the website is not on the list of picture websites (Need Access)
//   busy     - Google Drive was busy or could not be reached; try again later (Something else)
// pause is set when Google answered with its login page ('google-signin'), a
// robot check ('google-robot') or a block ('google-blocked'): the check pauses
// there, nothing is got around, and the row gets no Type for it.

import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { Readable } from 'node:stream';
import { imageType } from './image-type.js';
import { driveFileId, DRIVE_HOSTS, parseUrl } from './links.js';

export const MAX_REDIRECTS = 5;
/** The largest file a download takes: a picture larger than the dashboard keeps is made smaller afterwards (picture-fix.js), so only a far larger file is refused. */
export const MAX_DOWNLOAD_BYTES = 60 * 1024 * 1024;
export const DOWNLOAD_TIMEOUT_MS = 30_000;
const megabytes = (bytes) => `${Math.round(bytes / (1024 * 1024))} megabytes`;

// ---- never an address on this computer or the local network ----

const PRIVATE = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) PRIVATE.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8], ['100::', 64], ['2001:db8::', 32], ['64:ff9b::', 96], ['2002::', 16]]) PRIVATE.addSubnet(net, bits, 'ipv6');

/** True only for an address on the internet: never this computer, the local network, or an address kept for special use. */
export function isPublicAddress(address) {
  const a = String(address ?? '').trim().replace(/^\[|\]$/g, '');
  const family = isIP(a);
  if (!family) return false;
  if (family === 6) {
    const mapped = a.match(/^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return isPublicAddress(mapped[1]);
    const hex = a.match(/^::ffff:(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hex) {
      const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
      return isPublicAddress([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
    }
    return !PRIVATE.check(a, 'ipv6');
  }
  return !PRIVATE.check(a, 'ipv4');
}

const privateError = () => Object.assign(new Error('That website is on this computer or the local network.'), { code: 'PRIVATE_ADDRESS' });

/** A DNS lookup for node:https that refuses any name leading to a private address, so nothing reaches this computer or the local network. */
export function makeSafeLookup(resolve = dnsLookup) {
  return function safeLookup(hostname, options, callback) {
    const opts = typeof options === 'object' && options ? options : {};
    resolve(hostname, { ...opts, all: true }, (err, addresses) => {
      if (err) return callback(err);
      const list = (Array.isArray(addresses) ? addresses : [{ address: addresses, family: opts.family ?? isIP(addresses) }]).filter((x) => x?.address);
      if (!list.length || list.some((x) => !isPublicAddress(x.address))) return callback(privateError());
      if (opts.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };
}

const safeLookup = makeSafeLookup();

/**
 * One GET over https, as a fetch() Response, with redirects never followed:
 * the caller decides each one. Refuses anything that is not https, and any
 * address on this computer or the local network.
 */
export function safeFetch(url, { signal = null, headers = {}, timeoutMs = DOWNLOAD_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      reject(new Error('That is not a web link.'));
      return;
    }
    if (u.protocol !== 'https:') return reject(Object.assign(new Error('Only https links are opened.'), { code: 'NOT_HTTPS' }));
    if (u.username || u.password) return reject(Object.assign(new Error('Links with a name and password in them are never opened.'), { code: 'CREDENTIALS' }));
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && !isPublicAddress(host)) return reject(privateError());
    const req = httpsRequest(u, { method: 'GET', headers: { 'User-Agent': 'FlipkartReviewChecker/1.0 (a staff dashboard on one computer)', Accept: 'image/png,image/jpeg,image/webp,image/*;q=0.9,*/*;q=0.5', ...headers }, lookup: safeLookup, signal: signal ?? undefined, timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? 0;
      const h = new Headers();
      for (const [k, v] of Object.entries(res.headers)) {
        try {
          if (Array.isArray(v)) v.forEach((x) => h.append(k, x));
          else if (v !== undefined) h.set(k, String(v));
        } catch {
          // a header that cannot be held is left out
        }
      }
      if (status < 200 || status > 599) {
        res.resume();
        reject(new Error(`The website answered ${status}.`));
        return;
      }
      const empty = [204, 205, 304].includes(status);
      if (empty) res.resume();
      resolve(new Response(empty ? null : Readable.toWeb(res), { status, headers: h }));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('The website took too long to answer.'), { code: 'TIMEOUT' })));
    req.on('error', reject);
    req.end();
  });
}

// ---- reading a body, no more than the limit ----

/** The body, but no more than maxBytes: { data } or { tooBig: true }. Stops reading as soon as it is too large. */
async function readCapped(res, maxBytes) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    return { tooBig: true };
  }
  if (!res.body) return { data: Buffer.alloc(0) };
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return { tooBig: true };
    }
    chunks.push(Buffer.from(value));
  }
  return { data: Buffer.concat(chunks) };
}

const looksLikePage = (res, data) => {
  const head = data.subarray(0, 512).toString('utf8').toLowerCase();
  return /text\/html/i.test(res.headers.get('content-type') ?? '') || head.includes('<html') || head.includes('<!doctype');
};

/** A PDF, by its first bytes: its pages are turned into a picture on this computer (picture-fix.js). */
const isPdf = (data) => data.subarray(0, 5).toString('latin1') === '%PDF-';

/** What a website sent instead of a picture, said plainly. */
function notAPicture(res, data) {
  if (looksLikePage(res, data)) return 'a web page instead of a picture';
  if (!data.length) return 'nothing';
  return 'a file that is not a picture the dashboard can read';
}

/**
 * Drive's own page for a large file it cannot check for viruses, with its
 * "Download anyway" form: the address that form sends to, on Google's own
 * website, or null when the page is not that one.
 */
export function driveConfirmUrl(html, from) {
  const page = String(html ?? '').slice(0, 65536);
  if (!/can'?t scan this file for viruses|virus scan warning|download anyway|confirm=t/i.test(page)) return null;
  const form = page.match(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i);
  if (!form) return null;
  let u;
  try {
    u = new URL(form[1].replace(/&amp;/g, '&'), from);
  } catch {
    return null;
  }
  for (const m of form[2].matchAll(/<input[^>]*>/gi)) {
    const name = m[0].match(/name="([^"]+)"/i)?.[1];
    const value = m[0].match(/value="([^"]*)"/i)?.[1];
    if (name && value !== undefined && /^(id|export|confirm|uuid|authuser|at)$/.test(name)) u.searchParams.set(name, value.replace(/&amp;/g, '&'));
  }
  const next = nextDriveUrl(u.href, from);
  return next.ok ? next.url : null;
}

// ---- Google Drive ----

/** Drive's direct-download address for a file. */
export function driveDownloadUrl(id) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
}

/**
 * The picture Google Drive shows of a file when it is opened in a browser, as
 * large as Drive gives it. A file anyone with the link can view shows it even
 * when its owner has turned downloading off.
 */
export function drivePreviewUrl(id) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w4000`;
}

/**
 * Where a Drive download may go next when Drive answers with a redirect:
 * Google's own https addresses only. Google's login page means no Google
 * login is in use, or it has ended; its "sorry" page is a robot check.
 * -> { ok, url } or { ok: false, pause?, says }
 */
export function nextDriveUrl(location, from) {
  let u;
  try {
    u = new URL(String(location ?? ''), from);
  } catch {
    return { ok: false, says: 'Google Drive sent the download somewhere that is not a web link' };
  }
  const host = u.hostname.toLowerCase();
  if (host === 'accounts.google.com' || /servicelogin|\/signin\b/i.test(u.pathname)) return { ok: false, pause: 'google-signin', says: 'Google asked to log in' };
  if (/^\/sorry\//.test(u.pathname) && /(^|\.)google\.com$/.test(host)) return { ok: false, pause: 'google-robot', says: 'Google showed a robot check' };
  if (u.protocol !== 'https:') return { ok: false, says: 'Google Drive sent the download to an address that is not safe to open' };
  if (u.username || u.password || (u.port && u.port !== '443')) return { ok: false, says: 'Google Drive sent the download to an address that is never opened' };
  if (DRIVE_HOSTS.has(host) || host.endsWith('.googleusercontent.com') || /^lh\d+\.google\.com$/.test(host)) return { ok: true, url: u.href };
  return { ok: false, says: `Google Drive sent the download to another website, ${host}` };
}

/** The words of a page Google showed instead of the file: its login page, a robot check, or a page asking for access. */
function pageSays(data) {
  const head = data.subarray(0, 8192).toString('utf8');
  if (/unusual traffic|not a robot|type the characters|\/sorry\//i.test(head)) return { pause: 'google-robot', says: 'Google showed a robot check' };
  if (/<title>[^<]*sign in[^<]*<\/title>|accounts\.google\.com\/(?:servicelogin|signin|v3\/signin)/i.test(head)) return { pause: 'google-signin', says: 'Google asked to log in' };
  return null;
}

/** The words for a file the logged-in Google account cannot open. */
const NO_ACCESS = 'the Google account logged in to the dashboard has no access to the file';
const NOT_FOUND = 'Google Drive could not find the file, or the Google account logged in to the dashboard has no access to it';

/**
 * One file from Google Drive at this address. A failure says whether it was
 * about access (a refusal, a missing file, or a page asking for access:
 * `noAccess`), which the picture Drive shows of the file may get past, or
 * whether the check must pause (Google's login page, a robot check or a
 * block). A PDF comes back as one (type 'application/pdf'); its pages are
 * turned into a picture afterwards. Drive's own page for a large file it
 * cannot check for viruses is answered by its "Download anyway" form, once.
 */
async function driveFile(start, { fetch, signal, maxBytes, accept, state = {} }) {
  const site = 'Google Drive';
  const fail = (kind, says, extra = {}) => ({ ok: false, kind, site, says, ...extra });
  const refused = (says) => fail('drive', says, { access: true, noAccess: true });
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS + 1; hop++) {
    const res = await fetch(url, { redirect: 'manual', signal, headers: { Accept: accept } });
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      const next = nextDriveUrl(res.headers.get('location'), url);
      if (!next.ok) return fail('drive', next.says, next.pause ? { pause: next.pause } : {});
      url = next.url;
      continue;
    }
    if (res.status === 429) return fail('busy', 'Google Drive is limiting downloads right now', { pause: 'google-blocked' });
    if (res.status >= 500) return fail('busy', 'Google Drive had a problem of its own');
    if (res.status === 404 || res.status === 410) return refused(NOT_FOUND);
    if (res.status === 401 || res.status === 403) {
      const body = await readCapped(res, 64 * 1024).catch(() => ({ data: Buffer.alloc(0) }));
      const page = body.data ? pageSays(body.data) : null;
      return page ? fail('drive', page.says, { pause: page.pause }) : refused(NO_ACCESS);
    }
    if (!res.ok) return fail('drive', 'Google Drive did not give the file');
    const body = await readCapped(res, maxBytes);
    if (body.tooBig) return fail('drive', `the file is larger than ${megabytes(maxBytes)}, so it was not downloaded`);
    const type = imageType(body.data);
    if (type) return { ok: true, data: body.data, type, site };
    if (isPdf(body.data)) return { ok: true, data: body.data, type: 'application/pdf', site };
    if (looksLikePage(res, body.data)) {
      const page = pageSays(body.data);
      if (page) return fail('drive', page.says, { pause: page.pause });
      const confirm = !state.confirmed ? driveConfirmUrl(body.data.toString('utf8'), url) : null;
      if (confirm) {
        // A large file Drive cannot check for viruses: its "Download anyway" form is sent, once for the file.
        state.confirmed = true;
        url = confirm;
        continue;
      }
      return refused('Google Drive showed a page asking for access instead of the picture');
    }
    return fail('drive', `the file is ${notAPicture(res, body.data)}`);
  }
  return fail('drive', 'Google Drive sent the download on too many times');
}

async function fromDrive(link, id, { fetch, signal, maxBytes }) {
  const state = {};
  const direct = await driveFile(driveDownloadUrl(id), { fetch, signal, maxBytes, accept: 'image/*,*/*;q=0.8', state });
  if (direct.ok || direct.pause || !direct.access) return strip(direct);
  // Downloading was refused: the file may still be open to view (its owner may have turned downloading off).
  // Drive's own picture of it is used then (PNG or JPEG, not WebP).
  let preview = null;
  try {
    preview = await driveFile(drivePreviewUrl(id), { fetch, signal, maxBytes, accept: 'image/png,image/jpeg;q=0.9,*/*;q=0.1', state });
  } catch (err) {
    if (signal?.aborted) throw err;
  }
  if (preview?.pause) return strip(preview);
  return strip(preview?.ok ? preview : direct);
}
const strip = ({ access, ...rest }) => rest;

// ---- other picture websites ----

/** Whether a website is on the list in settings.json: its exact name, capitals and a final dot aside. */
export function isAllowedSite(host, allowed) {
  const h = String(host ?? '').toLowerCase().replace(/\.$/, '');
  return Boolean(h) && (allowed ?? []).some((a) => String(a).toLowerCase().replace(/\.$/, '') === h);
}

/**
 * Where a picture download may go next when a website answers with a
 * redirect: https, on an allowed website, no name or password, no other port.
 * -> { ok, url } or { ok: false, says }
 */
export function nextPictureUrl(location, from, allowed) {
  let u;
  try {
    u = new URL(String(location ?? ''), from);
  } catch {
    return { ok: false, says: 'the website sent the download somewhere that is not a web link' };
  }
  if (u.protocol !== 'https:') return { ok: false, says: 'the website sent the download to an address that is not safe to open' };
  if (u.username || u.password || (u.port && u.port !== '443')) return { ok: false, says: 'the website sent the download to an address that is never opened' };
  if (!isAllowedSite(u.hostname, allowed)) return { ok: false, says: `the website sent the download to ${u.hostname}, which is not on the dashboard's list of picture websites` };
  return { ok: true, url: u.href };
}

async function fromWebsite(u, { fetch, signal, maxBytes, allowed }) {
  const site = u.hostname.toLowerCase();
  const fail = (says, kind = 'access') => ({ ok: false, kind, site, says });
  if (!isAllowedSite(site, allowed)) return fail("the website is not on the dashboard's list of picture websites", 'allowed');
  if (u.protocol !== 'https:') return fail('the link is not a safe link, so it was not opened');
  if (u.username || u.password || (u.port && u.port !== '443')) return fail('the link is of a kind that is never opened');
  let url = u.href;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, { redirect: 'manual', signal });
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      const next = nextPictureUrl(res.headers.get('location'), url, allowed);
      if (!next.ok) return fail(next.says);
      url = next.url;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return fail(res.status === 401 || res.status === 403 ? 'the website refused to give it' : res.status === 404 || res.status === 410 ? 'the website could not find it' : 'the website did not give it');
    }
    const body = await readCapped(res, maxBytes);
    if (body.tooBig) return fail(`the picture is larger than ${megabytes(maxBytes)}, so it was not downloaded`);
    const type = imageType(body.data);
    if (type) return { ok: true, data: body.data, type, site };
    if (isPdf(body.data)) return { ok: true, data: body.data, type: 'application/pdf', site };
    return fail(`the website sent ${notAPicture(res, body.data)}`);
  }
  return fail('the website sent the download on too many times');
}

/**
 * Download one picture link. `allowed` is the list of picture websites
 * (screenshots.js). Never throws; see the top of this file for what comes back. A
 * PDF comes back with type 'application/pdf'; a picture larger than the
 * dashboard keeps comes back as it is: both are made ready afterwards
 * (picture-fix.js).
 */
export async function downloadPicture(link, { allowed = [], fetch = safeFetch, signal = null, maxBytes = MAX_DOWNLOAD_BYTES, timeoutMs = DOWNLOAD_TIMEOUT_MS } = {}) {
  const u = parseUrl(link);
  if (!u) return { ok: false, kind: 'access', site: null, says: 'it is not a web link' };
  const id = driveFileId(u);
  const drive = DRIVE_HOSTS.has(u.hostname.toLowerCase());
  if (signal?.aborted) return { ok: false, kind: 'busy', site: drive ? 'Google Drive' : u.hostname, says: 'the download was stopped', stopped: true };
  if (drive && !id) return { ok: false, kind: 'drive', site: 'Google Drive', says: 'the Google Drive link has no file in it' };
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(), timeoutMs);
  const onStop = () => timer.abort();
  signal?.addEventListener('abort', onStop);
  try {
    if (drive) return await fromDrive(link, id, { fetch, signal: timer.signal, maxBytes });
    return await fromWebsite(u, { fetch, signal: timer.signal, maxBytes, allowed });
  } catch (err) {
    const site = drive ? 'Google Drive' : u.hostname.toLowerCase();
    const kind = drive ? 'busy' : 'access';
    if (signal?.aborted) return { ok: false, kind: 'busy', site, says: 'the download was stopped', stopped: true };
    if (err?.code === 'PRIVATE_ADDRESS') return { ok: false, kind: 'access', site, says: 'the link leads to this computer or the local network, which is never opened' };
    if (err?.code === 'CLOSED') return { ok: false, kind: 'busy', site, says: 'the Live Amazon Browser is not open, so it could not be downloaded' };
    if (timer.signal.aborted || err?.code === 'TIMEOUT') return { ok: false, kind, site, says: `it did not answer within ${Math.round(timeoutMs / 1000)} seconds` };
    return { ok: false, kind, site, says: 'it could not be reached from this computer' };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onStop);
  }
}

/**
 * Keeps downloads apart: wait() resolves once `gapMs` has passed since the
 * last download ended, then that download runs; one at a time.
 */
export function createPacer(gapMs, { now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let lastEnd = null;
  let chain = Promise.resolve();
  return {
    run(fn) {
      const turn = chain.then(async () => {
        const gap = typeof gapMs === 'function' ? gapMs() : gapMs;
        const wait = lastEnd === null ? 0 : Math.max(0, lastEnd + gap - now());
        if (wait > 0) await sleep(wait);
        try {
          return await fn();
        } finally {
          lastEnd = now();
        }
      });
      chain = turn.catch(() => {});
      return turn;
    },
  };
}
