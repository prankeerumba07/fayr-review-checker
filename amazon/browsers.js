// The two browsers. The Live Amazon Browser is a real, visible Chrome window
// a person can watch. It keeps one saved profile (data/amazon-profile), so a
// staff member logs in to Amazon there by hand, and stays logged in after a
// restart; the window is opened once and reused for every check, never
// closed between checks, and closed properly when the dashboard stops, so
// Chrome saves the login. The profile is never deleted or cleared, and no
// other profile is ever started. One Amazon page at a time, at least 3
// seconds apart, never hidden as automated (Chrome's own "controlled by
// automated test software" bar stays), and it never types anything into
// Amazon or Google. The one thing it ever presses is Gmail's Send button, on
// Gmail's page for a new email, when a staff member sends an email to a user
// (gmail.js). The image reader is a headless Chrome that only ever looks at
// local images.
//
// Playwright never closes either browser by itself when the dashboard is
// stopped (Control+C, or its Terminal window closing): the dashboard closes
// them itself, properly, first. Playwright closing Chrome as well made the
// second close force Chrome shut before it had saved everything.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { readAmazonPage, readAccountLine, accountFrom, isLoginPage, scrollToReviewsInPage, readGoogleLine, googleAccountFrom } from './page-read.js';
import { analyseImage, makeThumbnail, pictureForReading } from './image-read.js';
import { readGmailPage, gmailSendButton } from './gmail.js';

export const LIVE_BROWSER_NAME = 'Live Amazon Browser';
export const PAGE_GAP_MS = 3000;
const NAV_TIMEOUT_MS = 30_000;
/** The dashboard closes the browsers itself when it stops; Playwright must not as well. */
const NO_SIGNALS = { handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false };

/**
 * One Amazon page at a time, each at least `gapMs` after the last one ended,
 * across every check.
 */
export function createGate({ gapMs = PAGE_GAP_MS, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let lastEnd = null;
  let chain = Promise.resolve();
  return {
    gapMs,
    run(fn, onWait = () => {}) {
      const turn = chain.then(async () => {
        const wait = lastEnd === null ? 0 : Math.max(0, lastEnd + gapMs - now());
        if (wait > 0) {
          onWait(wait);
          await sleep(wait);
        }
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

export class LiveBrowser {
  /**
   * dataDir — the dashboard's data folder; the profile is data/amazon-profile
   * labelUrl — the local page the window's first tab shows
   * onAccount({ signedIn, name }, facts) — told whenever an Amazon page shows who is logged in
   * routes — tests only: answers every request, so a test never reaches Amazon
   */
  constructor({ dataDir, labelUrl, gate = createGate(), headless = false, routes = null, channel = 'chrome', onAccount = () => {} }) {
    this.dataDir = dataDir;
    this.labelUrl = labelUrl;
    this.gate = gate;
    this.headless = headless;
    this.routes = routes;
    this.channel = channel;
    this.onAccount = onAccount;
    this.context = null;
    this.page = null;
    this.starting = null;
    this.launches = 0;
    this.openedAt = null; // when the window last opened, for the login check's lines in the Terminal window
  }

  /** The one saved profile. Never a new one, so nobody signs in twice. */
  get profileDir() {
    return join(this.dataDir, 'amazon-profile');
  }

  isOpen() {
    return Boolean(this.context && this.page && !this.page.isClosed());
  }

  /** Who an Amazon page says is logged in, passed on when it says anything. */
  noteAccount(account, facts) {
    if (!account) return;
    try {
      this.onAccount(account, facts);
    } catch {
      // the top bar must not stop a check
    }
  }

  /**
   * The window, with the saved profile. Opened the first time it is needed,
   * then kept open and reused; only a window closed by hand is opened again,
   * with the same profile.
   */
  async begin() {
    if (this.isOpen()) return;
    // Only one window opens at a time, however many ask at once.
    this.starting ??= this.launch().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  async launch() {
    if (this.context) await this.shut();
    await mkdir(this.profileDir, { recursive: true, mode: 0o700 });
    // With test routes, no host name resolves: a request the routes do not
    // answer (Playwright never routes a redirect's target) fails here instead
    // of reaching Amazon.
    const offline = this.routes ? ['--host-resolver-rules=MAP * ~NOTFOUND'] : [];
    const context = await chromium.launchPersistentContext(this.profileDir, {
      ...NO_SIGNALS,
      channel: this.channel,
      headless: this.headless,
      viewport: null,
      args: [`--window-name=${LIVE_BROWSER_NAME}`, '--window-size=1280,900', '--no-first-run', '--no-default-browser-check', ...offline],
    });
    this.launches++;
    this.openedAt = Date.now();
    this.context = context;
    context.on('close', () => {
      if (this.context === context) {
        this.context = null;
        this.page = null;
      }
    });
    if (this.routes) await context.route('**/*', this.routes);
    const label = context.pages()[0] ?? (await context.newPage());
    await label.goto(this.labelUrl).catch(() => {});
    const page = await context.newPage();
    // Each page that loads says who is logged in: only the account line and
    // whether a login form is there are read, never what is typed.
    page.on('load', () => {
      page
        .evaluate(readAccountLine)
        .then((line) => this.noteAccount(accountFrom(line), line))
        .catch(() => {});
    });
    this.page = page;
  }

  /** Open one Amazon page, through the gate. Never throws: says what went wrong instead. */
  async open(url, { onWait } = {}) {
    if (!this.isOpen()) return { ok: false, error: 'closed', message: 'The Live Amazon Browser was closed.' };
    return this.gate.run(async () => {
      try {
        const res = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        await this.page.waitForLoadState('load', { timeout: 10_000 }).catch(() => {});
        const facts = await this.page.evaluate(readAmazonPage);
        this.noteAccount(accountFrom(facts), facts);
        return { ok: true, status: res ? res.status() : null, url: this.page.url(), facts };
      } catch (err) {
        if (!this.isOpen()) return { ok: false, error: 'closed', message: 'The Live Amazon Browser was closed.' };
        const timeout = /timeout/i.test(String(err?.message ?? ''));
        return { ok: false, error: timeout ? 'timeout' : 'network', message: timeout ? 'The page took too long to open.' : 'The page could not be opened.' };
      }
    }, onWait);
  }

  /**
   * Who the window's page says is logged in, from its account line only,
   * never anything typed, and opening no page: { account, loginPage } where
   * account is { signedIn, name } or null; null when it cannot be read.
   */
  async readAccount() {
    if (!this.isOpen()) return null;
    try {
      const line = await this.page.evaluate(readAccountLine);
      return { account: accountFrom(line), loginPage: isLoginPage(line), line };
    } catch {
      return null;
    }
  }

  /**
   * Who the window's page says is logged in to Google, from the account
   * button at the top of Google's pages only, never anything typed, and
   * opening no page: { account, line }, account being googleAccountFrom's
   * answer; null when it cannot be read.
   */
  async readGoogle() {
    if (!this.isOpen()) return null;
    try {
      const line = await this.page.evaluate(readGoogleLine);
      return { account: googleAccountFrom(line), line };
    } catch {
      return null;
    }
  }

  /**
   * What Gmail's page shows (readGmailPage): the fields of the new email
   * (the box whose subject is wanted.subject, when the page has more than
   * one), whether Gmail says the email was sent, and whether the page is a
   * login page, a refusal or a robot check. Nothing else on the page is
   * read, and no page is opened. Null when it cannot be read.
   */
  async readGmail(wanted = null) {
    if (!this.isOpen()) return null;
    try {
      return await this.page.evaluate(readGmailPage, wanted);
    } catch {
      return null;
    }
  }

  /**
   * Presses Gmail's Send button, and nothing else: only on a Gmail page, and
   * only that button, in the box of the new email whose subject is
   * wanted.subject (gmailSendButton). The one thing this browser ever
   * presses. False when the button is not there.
   */
  async pressSend(wanted = null) {
    if (!this.isOpen()) return false;
    try {
      if (new URL(this.page.url()).hostname !== 'mail.google.com') return false;
      const handle = await this.page.evaluateHandle(gmailSendButton, wanted);
      const button = handle.asElement();
      if (!button) {
        await handle.dispose();
        return false;
      }
      await button.click({ timeout: 5000 });
      await handle.dispose();
      return true;
    } catch {
      return false;
    }
  }

  /** Leaves the page the window shows (an empty page instead), so nothing of it stays on the screen. Opens no website. */
  async leave() {
    if (!this.isOpen()) return;
    await this.page.goto('about:blank').catch(() => {});
  }

  /**
   * The names and end dates of the saved profile's cookies for this address,
   * never their values: [{ name, domain, expires }], or null when the window
   * is not open. This is how the dashboard tells a saved Google login from
   * none without opening any page.
   */
  async cookieNames(url) {
    if (!this.context) return null;
    try {
      const list = await this.context.cookies([url]);
      return list.map((c) => ({ name: c.name, domain: c.domain, expires: c.expires }));
    } catch {
      return null;
    }
  }

  /**
   * One https download made by the window's own browser, with its saved
   * logins, without opening a page: a fetch() Response, redirects never
   * followed (the caller looks at each one). Only https, never a link with a
   * name and password in it. Throws when the window is not open or the
   * download fails or is stopped.
   */
  async fetch(url, { headers = {}, signal = null, timeoutMs = 30_000 } = {}) {
    if (!this.context) throw Object.assign(new Error('The Live Amazon Browser is not open.'), { code: 'CLOSED' });
    // Test routes answer pages only: this download is made outside the browser's pages, where neither the
    // routes nor the blocked name resolver apply, so with test routes nothing is ever downloaded.
    if (this.routes) throw Object.assign(new Error('Nothing is downloaded with test routes.'), { code: 'OFFLINE' });
    const u = new URL(url);
    if (u.protocol !== 'https:') throw Object.assign(new Error('Only https links are opened.'), { code: 'NOT_HTTPS' });
    if (u.username || u.password) throw Object.assign(new Error('Links with a name and password in them are never opened.'), { code: 'CREDENTIALS' });
    if (signal?.aborted) throw Object.assign(new Error('The download was stopped.'), { code: 'ABORTED' });
    const stopped = new Promise((_, reject) => signal?.addEventListener('abort', () => reject(Object.assign(new Error('The download was stopped.'), { code: 'ABORTED' })), { once: true }));
    const res = await Promise.race([this.context.request.fetch(u.href, { method: 'GET', maxRedirects: 0, headers, timeout: timeoutMs, failOnStatusCode: false }), stopped]);
    const status = res.status();
    const h = new Headers();
    for (const [k, v] of Object.entries(res.headers())) {
      try {
        h.set(k, v);
      } catch {
        // a header that cannot be held is left out
      }
    }
    const empty = [204, 205, 304].includes(status) || (status >= 300 && status < 400);
    const body = empty ? null : await Promise.race([res.body(), stopped]);
    await res.dispose().catch(() => {});
    return new Response(body, { status, headers: h });
  }

  /** The page scrolled to the product's reviews, before its picture is taken. False when they were not found. */
  async scrollToReviews() {
    if (!this.isOpen()) return false;
    try {
      const found = await this.page.evaluate(scrollToReviewsInPage);
      // A moment for reviews that load as they come into view.
      await this.page.waitForTimeout(800);
      return Boolean(found);
    } catch {
      return false;
    }
  }

  /** A picture of the window's page as it is now. */
  async shot(file) {
    if (!this.isOpen()) return false;
    try {
      await this.page.screenshot({ path: file, type: 'png', timeout: 15_000 });
      return true;
    } catch {
      return false;
    }
  }

  /** The window's page as HTML, kept private on this computer (data/ is never served). */
  async savePage(file) {
    if (!this.isOpen()) return false;
    try {
      await writeFile(file, await this.page.content(), { mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Only when the dashboard stops. Chrome is asked to close and waited for,
   * so it saves the login in the profile, which stays.
   */
  async close() {
    // A window still opening is let finish first, then closed properly too.
    if (this.starting) await this.starting.catch(() => {});
    await this.shut();
  }

  async shut() {
    const context = this.context;
    this.context = null;
    this.page = null;
    if (context) await context.close().catch(() => {});
  }
}

/** A headless Chrome for looking at screenshots: nothing it opens leaves this computer. */
export class ImageReader {
  constructor({ channel = 'chrome' } = {}) {
    this.channel = channel;
    this.browser = null;
    this.page = null;
    this.chain = Promise.resolve();
  }

  async ready() {
    if (this.page && !this.page.isClosed()) return this.page;
    this.browser = await chromium.launch({ ...NO_SIGNALS, channel: this.channel, headless: true });
    const context = await this.browser.newContext();
    await context.route('**/*', (r) => r.abort());
    this.page = await context.newPage();
    await this.page.setContent('<!doctype html><title>image</title>');
    return this.page;
  }

  /** { fingerprint, starGroups, width, height } for one image file. */
  analyse(file, mime = 'image/png') {
    const turn = this.chain.then(async () => {
      const page = await this.ready();
      const dataUrl = `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
      return page.evaluate(analyseImage, dataUrl);
    });
    this.chain = turn.catch(() => {});
    return turn;
  }

  /**
   * A copy of one image file made easier to read (image-read.js
   * pictureForReading: `how` is { plain } or { top, scale }), kept as a PNG in
   * a folder of its own until done() removes it: { file, done }, or null when
   * there is nothing to change.
   */
  forReading(file, mime = 'image/png', how = {}) {
    const turn = this.chain.then(async () => {
      const page = await this.ready();
      const dataUrl = `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
      const png = await page.evaluate(pictureForReading, { dataUrl, how });
      if (!png) return null;
      const dir = await mkdtemp(join(tmpdir(), 'arc-reading-'));
      const out = join(dir, 'picture.png');
      await writeFile(out, Buffer.from(png, 'base64'), { mode: 0o600 });
      return { file: out, done: () => rm(dir, { recursive: true, force: true }).catch(() => {}) };
    });
    this.chain = turn.catch(() => {});
    return turn;
  }

  /** A small JPEG of one image file, at most `width` pixels wide. */
  thumbnail(file, mime = 'image/png', width = 240) {
    const turn = this.chain.then(async () => {
      const page = await this.ready();
      const dataUrl = `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
      return Buffer.from(await page.evaluate(makeThumbnail, { dataUrl, width }), 'base64');
    });
    this.chain = turn.catch(() => {});
    return turn;
  }

  async close() {
    const b = this.browser;
    this.browser = null;
    this.page = null;
    if (b) await b.close().catch(() => {});
  }
}
