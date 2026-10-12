// Getting a Flipkart row's screenshots, the way the Amazon checker gets a
// row's (amazon/routes.js: fetchOne and picturesFor), copied and changed for
// Flipkart. Nothing on the screen gets screenshots yet: the checking step will,
// when a row is checked, as on Amazon. A cell's links are downloaded one at a
// time, a set time apart (pictures.js): a Google Drive file through the Live
// Amazon Browser's own download, with the Amazon screen's Google login and
// without opening a page in that window, the same way the Amazon checker
// downloads its Google Drive files (serve.mjs hands both over); a picture on
// another website only when that website is one of the picture websites
// below, never with a login. Flipkart never changes that window or that login:
// while the Amazon login or the Google login is using the window, a Google
// Drive download is not made, and it stops there with a plain sentence
// instead (pause). A PDF's pages become one picture and a picture over 10
// megabytes is made smaller, on this computer (picture-fix.js). Every picture
// is kept only in data/flipkart/pictures/ (store.js), and a screenshot that
// cannot be had keeps its reason, as on Amazon: "no one is logged in to
// Google", "no access", and the like. Google's login page, a robot check or a
// block while downloading stops there too (pause), and nothing is got around;
// Google's login page means the Google login has ended, so both screens say so.

import { readFile } from 'node:fs/promises';
import { downloadPicture, createPacer } from './pictures.js';
import { preparePicture } from './picture-fix.js';
import { isDriveLink, isFlipkart, isShortLink, isAppStore, linkKey, parseUrl } from './links.js';

/** The picture websites a screenshot may be downloaded from, besides Google Drive: the Amazon checker's own list (amazon/settings.js), Flipkart's own copy. */
export const PICTURE_WEBSITES = ['storage.googleapis.com', 'tryboxs.in', 'www.tryboxs.in'];
/** The time kept between two downloads, as on Amazon. */
export const DOWNLOAD_GAP_MS = 1000;
/** The reason kept with a Google Drive screenshot that was not downloaded because no one is logged in to Google: the Amazon checker's words. */
export const NO_GOOGLE = { kind: 'drive', site: 'Google Drive', says: 'no one is logged in to Google, so it was not downloaded yet' };
/** What a Google Drive download stops with while a login is using the Live Amazon Browser, in plain words, as the Amazon screen says it when a button is pressed then. */
export const BUSY_SAYS = {
  amazon: 'The Live Amazon Browser is busy with the Amazon login, so the Google Drive screenshots were not downloaded yet. Wait until that is done, then try again.',
  checking: 'The Google login is being checked, so the Google Drive screenshots were not downloaded yet. Wait a moment, then try again.',
  waiting: "Google's login page is open in the Live Amazon Browser, so the Google Drive screenshots were not downloaded yet. Log in to Google there, then try again.",
  chrome: 'A normal Chrome window is open for the Google login, so the Google Drive screenshots were not downloaded yet. Log in to Google there and press "I have logged in", then try again.',
};

/**
 * Whether a link of a cell is a picture to download: every screenshot link,
 * and a review link that is a picture (a Google Drive file, or a link on
 * another website). A review link to Flipkart itself, a Flipkart short link or
 * an app store is a review, not a picture.
 */
export function downloadable(which, link) {
  if (which !== 'review') return true;
  if (isDriveLink(link)) return true;
  return Boolean(parseUrl(link)) && !isFlipkart(link) && !isShortLink(link) && !isAppStore(link);
}

/**
 * store — the Flipkart store (row, setPictures, pictureFile)
 * google — the Amazon screen's Google login, handed over by serve.mjs: view()
 *   its state, as the top bar shows it; busy() true while it is being
 *   checked; amazonLogin() the Amazon login's { state, busy }; loggedOut()
 *   when a download shows the Google login has ended; begin() and
 *   fetch(url, init), the Live Amazon Browser opened when it is not (as
 *   before an Amazon download) and its own download, with no page opened
 * download, prepare — tests may give their own
 * -> { forCell(rowId, which, { signal }), fetchOne(link, signal) }
 */
export function createScreenshots({ store, google, download = downloadPicture, prepare = preparePicture, allowed = PICTURE_WEBSITES, gapMs = DOWNLOAD_GAP_MS }) {
  const pacer = createPacer(gapMs);
  /** The Google login is in use: a Google Drive file can be downloaded. */
  const googleIn = () => google.view().state === 'in';
  /** The words kept with a picture that could not be had: its reason, and whether Google said the account has no access. */
  const problemOf = (out) => ({ kind: out.kind, site: out.site, says: out.says, ...(out.noAccess ? { noAccess: true } : {}) });
  /** Google's login page while downloading: the Google login has ended, so both screens' top bars say so. */
  function noteDownload(out) {
    if (out?.pause === 'google-signin') google.loggedOut?.();
    return out;
  }

  /**
   * Why the Live Amazon Browser is not used for a Google Drive download just
   * now, in a plain sentence, or null: the Google login is being checked or
   * made, or, with someone logged in to Google, the Amazon login is using the
   * window. With no one logged in to Google nothing is downloaded, so the
   * window is not needed.
   */
  function busyNow() {
    const g = google.view();
    if (google.busy() || g.state === 'checking') return BUSY_SAYS.checking;
    if (g.state === 'waiting') return g.chrome ? BUSY_SAYS.chrome : BUSY_SAYS.waiting;
    if (g.state !== 'in') return null;
    const a = google.amazonLogin();
    return a.busy || a.state === 'waiting' ? BUSY_SAYS.amazon : null;
  }

  /**
   * Downloads one link, kept apart from the last download. A Google Drive
   * link is downloaded by the Live Amazon Browser itself, with the Google
   * login, without opening a page; other websites never with a login.
   */
  function fetchOne(link, signal = null) {
    return pacer.run(async () => {
      const opts = { allowed, signal };
      if (isDriveLink(link)) {
        // Asked again just before the download: the logins may have moved on while it waited its turn.
        const busy = busyNow();
        if (busy) return { pause: 'login-busy', says: busy };
        if (!googleIn()) return { ok: false, ...NO_GOOGLE };
        try {
          await google.begin();
        } catch {
          return { ok: false, kind: 'busy', site: 'Google Drive', says: 'the Live Amazon Browser could not be opened, so it was not downloaded' };
        }
        opts.fetch = (url, init) => google.fetch(url, { headers: init?.headers ?? {}, signal: init?.signal ?? null });
      }
      // A PDF's pages are turned into one picture, and a picture too large to keep is made smaller, on this computer.
      return prepare(await download(link, opts));
    });
  }

  /**
   * A cell's pictures, for a check: the ones kept, and those that could not
   * be had downloaded once more (the owner may have opened them since). A
   * Google Drive file while no one is logged in to Google is not downloaded:
   * it keeps that reason. While a login is using the Live Amazon Browser, or
   * when Google answers a download with its login page, a robot check or a
   * block, it stops there: { pause, says? }, with nothing saved for the cell.
   * -> { files, problems, types, records } or { pause, … }.
   */
  async function forCell(rowId, which, { signal = null } = {}) {
    let row = await store.row(rowId);
    const kept = row?.pictures?.[which] ?? [];
    const links = (row?.shots?.[which]?.links ?? []).filter((l) => downloadable(which, l));
    const stop = (out) => ({ pause: out.pause, ...(out.says ? { says: out.says } : {}), files: [], problems: [], types: [], records: kept });
    if (links.length && (kept.length !== links.length || kept.some((p) => !p.file))) {
      const list = [];
      for (const link of links) {
        const had = kept.find((p) => p.file && p.link && linkKey(p.link) === linkKey(link));
        if (had) {
          list.push({ link, keep: had });
          continue;
        }
        if (isDriveLink(link)) {
          const busy = busyNow();
          if (busy) return stop({ pause: 'login-busy', says: busy });
          if (!googleIn()) {
            list.push({ link, problem: { ...NO_GOOGLE } });
            continue;
          }
        }
        const out = noteDownload(await fetchOne(link, signal));
        if (out.pause) return stop(out);
        list.push(out.ok ? { link, data: out.data } : { link, problem: problemOf(out) });
      }
      // The pictures kept before are read again from their files, so setPictures can keep them in order.
      const items = [];
      for (const x of list) {
        if (x.keep) items.push({ link: x.link, data: await readFile(store.pictureFile(row, which, kept.indexOf(x.keep))), ...(x.keep.fingerprint ? { fingerprint: x.keep.fingerprint } : {}) });
        else items.push(x);
      }
      row = await store.setPictures(rowId, which, items);
    }
    const pics = row?.pictures?.[which] ?? [];
    return {
      files: pics.map((p, i) => (p.file ? store.pictureFile(row, which, i) : null)).filter(Boolean),
      problems: pics.filter((p) => p.problem).map((p) => ({ link: p.link, ...p.problem })),
      types: pics.filter((p) => p.file).map((p) => p.type),
      records: pics,
    };
  }

  return { forCell, fetchOne };
}
