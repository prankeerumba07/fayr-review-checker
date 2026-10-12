// The Flipkart Google Browser: a second visible Chrome window, apart from the
// Live Flipkart Browser, only for the Google login and the Google Drive
// downloads of the Flipkart checker. Copied from the Live Amazon Browser
// (amazon/browsers.js) and changed for Flipkart: it keeps its own saved
// profile (data/flipkart/google-profile), never Amazon's and never the Live
// Flipkart Browser's, so a staff member logs in to Google there by hand and
// stays logged in after a restart. The window is opened the first time it is
// needed ("Log in to Google", or a Google Drive download), kept open and
// reused, and closed properly when the dashboard stops; after that it never
// opens again. It never types anything; the only pages it opens are Google's
// login page and home page (google-login.js), one at a time, at least 3
// seconds apart, and a Google Drive file is downloaded with its login without
// opening a page. Whether a Google login is saved is read from the profile's
// cookies, their names and end dates only: from the window when it is open,
// else from a hidden Chrome on the same profile, which opens no page and
// closes at once, so no window shows just to check the login.
//
// Playwright never closes the browser by itself when the dashboard is
// stopped: the dashboard closes it itself, properly, first.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createGate } from './browser.js';
import { readGoogleLine, googleAccountFrom } from './page-read.js';

export const GOOGLE_BROWSER_NAME = 'Flipkart Google Browser';
const NAV_TIMEOUT_MS = 30_000;
/** The dashboard closes the browser itself when it stops; Playwright must not as well. */
const NO_SIGNALS = { handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false };

/** What the window's first tab shows, so whoever sees the window knows what it is. */
const LABEL_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${GOOGLE_BROWSER_NAME}</title>
<style>body{font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#2b2a27;background:#fbf8f3;margin:0}main{max-width:640px;margin:48px auto;padding:0 24px}h1{font-size:24px}</style></head>
<body><main><h1>${GOOGLE_BROWSER_NAME}</h1>
<p>This Chrome window is driven by the dashboard, for the Google login of the Flipkart checker only. When you press "Log in to Google" on the Flipkart screen, Google's login page opens in the next tab: log in there by hand. The dashboard never types, stores or reads a password.</p>
<p>The screenshots on Google Drive in the Flipkart file are downloaded through this login, without opening their pages.</p>
<p>This window keeps its own Chrome profile, apart from the Live Amazon Browser and the Live Flipkart Browser.</p>
</main></body></html>`;

export class FlipkartGoogleBrowser {
  /**
   * dataDir — the dashboard's data folder; the profile is data/flipkart/google-profile
   * routes — tests only: answers every request, so a test never reaches Google
   */
  constructor({ dataDir, gate = createGate(), headless = false, routes = null, channel = 'chrome' }) {
    this.dataDir = dataDir;
    this.gate = gate;
    this.headless = headless;
    this.routes = routes;
    this.channel = channel;
    this.context = null;
    this.page = null;
    this.starting = null;
    this.turns = Promise.resolve(); // one Chrome at a time on the profile: the window, or the hidden one that reads the cookies
    this.launches = 0; // windows opened
    this.peeks = 0; // hidden Chromes that read the cookies with no window
    this.stopped = false; // the dashboard is stopping: the window never opens again
  }

  /** Flipkart's own Google profile, never Amazon's. */
  get profileDir() {
    return join(this.dataDir, 'flipkart', 'google-profile');
  }

  isOpen() {
    return Boolean(this.context && this.page && !this.page.isClosed());
  }

  /** Runs fn when nothing else is using the profile, one Chrome at a time. */
  inTurn(fn) {
    const turn = this.turns.then(fn);
    this.turns = turn.catch(() => {});
    return turn;
  }

  /** How Chrome is started on the profile: with test routes, no host name resolves, so a request the routes do not answer fails here instead of reaching Google. */
  options(headless) {
    const offline = this.routes ? ['--host-resolver-rules=MAP * ~NOTFOUND'] : [];
    return { ...NO_SIGNALS, channel: this.channel, headless, viewport: null, args: [`--window-name=${GOOGLE_BROWSER_NAME}`, '--window-size=1280,900', '--no-first-run', '--no-default-browser-check', ...offline] };
  }

  /**
   * The window, with the saved profile. Opened the first time it is needed,
   * then kept open and reused; a window closed by hand is opened again, with
   * the same profile, but never once the dashboard is stopping.
   */
  async begin() {
    if (this.stopped) throw new Error('The dashboard is stopping.');
    if (this.isOpen()) return;
    // Only one window opens at a time, however many ask at once.
    this.starting ??= this.inTurn(() => this.launch()).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  async launch() {
    if (this.stopped) throw new Error('The dashboard is stopping.');
    if (this.isOpen()) return;
    if (this.context) await this.shut();
    await mkdir(this.profileDir, { recursive: true, mode: 0o700 });
    const context = await chromium.launchPersistentContext(this.profileDir, this.options(this.headless));
    this.launches++;
    this.context = context;
    context.on('close', () => {
      if (this.context === context) {
        this.context = null;
        this.page = null;
      }
    });
    if (this.routes) await context.route('**/*', this.routes);
    const label = context.pages()[0] ?? (await context.newPage());
    await label.goto(`data:text/html;charset=utf-8,${encodeURIComponent(LABEL_PAGE)}`).catch(() => {});
    this.page = await context.newPage();
  }

  /** Open one Google page, through the gate. Never throws: says what went wrong instead. */
  async open(url, { onWait } = {}) {
    if (!this.isOpen()) return { ok: false, error: 'closed', message: 'The Flipkart Google Browser was closed.' };
    return this.gate.run(async () => {
      try {
        const res = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        await this.page.waitForLoadState('load', { timeout: 10_000 }).catch(() => {});
        return { ok: true, status: res ? res.status() : null, url: this.page.url() };
      } catch (err) {
        if (!this.isOpen()) return { ok: false, error: 'closed', message: 'The Flipkart Google Browser was closed.' };
        const timeout = /timeout/i.test(String(err?.message ?? ''));
        return { ok: false, error: timeout ? 'timeout' : 'network', message: timeout ? 'The page took too long to open.' : 'The page could not be opened.' };
      }
    }, onWait);
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
   * The names and end dates of the saved profile's cookies for these
   * addresses, never their values: [{ name, domain, expires }]. From the
   * window when it is open (null when it closes meanwhile); else from a
   * hidden Chrome on the same profile, which opens no page and is closed at
   * once. Throws when Chrome cannot be started on the profile.
   */
  async cookieNames(urls) {
    const list = (Array.isArray(urls) ? urls : [urls]).map(String);
    const names = (cookies) => cookies.map((c) => ({ name: c.name, domain: c.domain, expires: c.expires }));
    if (this.starting) await this.starting.catch(() => {});
    return this.inTurn(async () => {
      if (this.context) {
        try {
          return names(await this.context.cookies(list));
        } catch {
          return null;
        }
      }
      if (this.stopped) throw new Error('The dashboard is stopping.');
      await mkdir(this.profileDir, { recursive: true, mode: 0o700 });
      const hidden = await chromium.launchPersistentContext(this.profileDir, this.options(true));
      this.peeks++;
      try {
        if (this.routes) await hidden.route('**/*', this.routes);
        return names(await hidden.cookies(list));
      } finally {
        await hidden.close().catch(() => {});
      }
    });
  }

  /**
   * One https download made by the window's own browser, with its saved
   * Google login, without opening a page: a fetch() Response, redirects never
   * followed (the caller looks at each one). Only https, never a link with a
   * name and password in it. Throws when the window is not open or the
   * download fails or is stopped.
   */
  async fetch(url, { headers = {}, signal = null, timeoutMs = 30_000 } = {}) {
    if (!this.context) throw Object.assign(new Error('The Flipkart Google Browser is not open.'), { code: 'CLOSED' });
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

  /**
   * The window closed properly, so Chrome saves the login in the profile,
   * which stays: before a normal Chrome window opens on the same profile
   * (google-login.js). It opens again when next needed.
   */
  async close() {
    // A window still opening is let finish first, then closed properly too.
    if (this.starting) await this.starting.catch(() => {});
    await this.inTurn(() => this.shut());
  }

  /** Only when the dashboard stops: closed properly, and it never opens again. */
  async stop() {
    this.stopped = true;
    await this.close();
  }

  async shut() {
    const context = this.context;
    this.context = null;
    this.page = null;
    if (context) await context.close().catch(() => {});
  }
}
