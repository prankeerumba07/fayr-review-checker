// The Live Flipkart Browser: a real, visible Chrome window a person can watch,
// with its own profile (data/flipkart/browser-profile), never the Live Amazon
// Browser or its profile. It is always signed out: it never logs in and never
// types anything into Flipkart, and its cookies are cleared before every
// page, so no login is ever used, even one made by hand in the window. It
// uses no proxy. One Flipkart page at a time, at least 3 seconds apart; a
// robot check, a block or an error is never got around, and only Flipkart's
// own addresses load in it (anything else a page asks for is refused, and
// no service worker may answer in their place). The window is opened the
// first time a product is read, kept open and reused, and closed properly
// when the dashboard stops; after that it never opens again. Copied from the
// Live Amazon Browser (amazon/browsers.js) and changed for Flipkart.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { readFlipkartPage } from './page-read.js';
import { isFlipkartSite } from './links.js';

export const LIVE_BROWSER_NAME = 'Live Flipkart Browser';
export const PAGE_GAP_MS = 3000;
const NAV_TIMEOUT_MS = 30_000;
/** How long a page is given to show what closing its login box or pressing "Read more" changed. */
const PREPARE_WAIT_MS = 1000;
/** The dashboard closes the browser itself when it stops; Playwright must not as well. */
const NO_SIGNALS = { handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false };
/** Chrome's name lookup in the window: only Flipkart's websites can be found; every other name is "not found". */
export const ONLY_FLIPKART_NAMES = 'MAP * ~NOTFOUND, EXCLUDE flipkart.com, EXCLUDE *.flipkart.com, EXCLUDE flixcart.com, EXCLUDE *.flixcart.com';

/** What the window's first tab shows, so whoever sees the window knows what it is. */
const LABEL_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${LIVE_BROWSER_NAME}</title>
<style>body{font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#2b2a27;background:#fbf8f3;margin:0}main{max-width:640px;margin:48px auto;padding:0 24px}h1{font-size:24px}</style></head>
<body><main><h1>${LIVE_BROWSER_NAME}</h1>
<p>This Chrome window is driven by the dashboard, so that staff can watch each Flipkart product being read. Flipkart pages open in the next tab, one at a time, at least 3 seconds apart, and pages of reviews at least 8 seconds apart.</p>
<p>It is always signed out. It never types into Flipkart, and it never gets around a robot check or a block: when Flipkart stops a page, the dashboard says so.</p>
<p>This window keeps its own Chrome profile, apart from the Live Amazon Browser. Keep it open while products are read.</p>
</main></body></html>`;

/**
 * One Flipkart page at a time, each at least `gapMs` after the last one
 * ended, or longer when a page asks for it (`gap`: pages of reviews).
 * Copied from the Amazon one (amazon/browsers.js).
 */
export function createGate({ gapMs = PAGE_GAP_MS, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let lastEnd = null;
  let chain = Promise.resolve();
  return {
    gapMs,
    run(fn, onWait = () => {}, gap = 0) {
      const turn = chain.then(async () => {
        const wait = lastEnd === null ? 0 : Math.max(0, lastEnd + Math.max(gapMs, gap) - now());
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

export class FlipkartBrowser {
  /**
   * dataDir — the dashboard's data folder; the profile is data/flipkart/browser-profile
   * routes — tests only: answers every request, so a test never reaches Flipkart
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
    this.launches = 0;
    this.leftSite = null; // the website a page tried to go to instead of Flipkart, refused
    this.stopped = false; // the dashboard is stopping: the window never opens again
  }

  /** Flipkart's own profile, never Amazon's. */
  get profileDir() {
    return join(this.dataDir, 'flipkart', 'browser-profile');
  }

  isOpen() {
    return Boolean(this.context && this.page && !this.page.isClosed());
  }

  /** The window: opened the first time it is needed, then kept open and reused; a window closed by hand is opened again, but never once the dashboard is stopping. */
  async begin() {
    if (this.stopped) throw new Error('The dashboard is stopping.');
    if (this.isOpen()) return;
    // Only one window opens at a time, however many ask at once.
    this.starting ??= this.launch().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  /**
   * Lets a request through only when it is for Flipkart's own addresses; a
   * page that tries to go to another website is refused, and that website
   * noted. It never fails: a request that cannot be answered any more (its
   * tab closed) is left.
   */
  async onlyFlipkart(route) {
    try {
      const req = route.request();
      let u = null;
      try {
        u = new URL(req.url());
      } catch {
        u = null;
      }
      if (u && (u.protocol === 'https:' || u.protocol === 'http:') && isFlipkartSite(u)) return await route.continue();
      try {
        if (u && req.isNavigationRequest() && req.frame() === this.page?.mainFrame()) this.leftSite = u.hostname;
      } catch {
        // a request with no page of its own yet, such as a new tab's first one
      }
      return await route.abort();
    } catch {
      // the tab or the window is gone: nothing to answer
    }
  }

  async launch() {
    if (this.context) await this.shut();
    await mkdir(this.profileDir, { recursive: true, mode: 0o700 });
    // No website but Flipkart's can even be found by name, so nothing the check
    // below does not see (the target of a redirect, which Playwright never
    // routes) can reach another website. With test routes, no name at all is
    // found: a request the routes do not answer fails here instead of reaching
    // Flipkart.
    const resolver = [`--host-resolver-rules=${this.routes ? 'MAP * ~NOTFOUND' : ONLY_FLIPKART_NAMES}`];
    const context = await chromium.launchPersistentContext(this.profileDir, {
      ...NO_SIGNALS,
      channel: this.channel,
      headless: this.headless,
      viewport: null,
      // Every request goes through the check below: no service worker answers in its place.
      serviceWorkers: 'block',
      args: [`--window-name=${LIVE_BROWSER_NAME}`, '--window-size=1280,900', '--no-first-run', '--no-default-browser-check', ...resolver],
    });
    this.launches++;
    this.context = context;
    context.on('close', () => {
      if (this.context === context) {
        this.context = null;
        this.page = null;
      }
    });
    // Signed out, always: no login is kept from before.
    await context.clearCookies().catch(() => {});
    await context.route('**/*', this.routes ?? ((route) => this.onlyFlipkart(route)));
    const label = context.pages()[0] ?? (await context.newPage());
    await label.goto(`data:text/html;charset=utf-8,${encodeURIComponent(LABEL_PAGE)}`).catch(() => {});
    this.page = await context.newPage();
  }

  /**
   * Open one Flipkart page, through the gate, and read it. read — what is
   * read inside the page (a product page's facts unless said); prepare — run
   * inside the page first, to close Flipkart's login box or press "Read more"
   * (it never types); html — also give back the page as Flipkart sent it;
   * gap — how long after the last page this one waits, when longer than the
   * gate's own. Never throws: says what went wrong instead.
   */
  async open(url, { onWait, read = readFlipkartPage, prepare = null, html = false, gap = 0 } = {}) {
    if (!this.isOpen()) return { ok: false, error: 'closed', message: 'The Live Flipkart Browser was closed.' };
    return this.gate.run(async () => {
      this.leftSite = null;
      try {
        // Signed out for every page: a login made by hand in the window is never used.
        await this.context.clearCookies();
        const res = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        await this.page.waitForLoadState('load', { timeout: 10_000 }).catch(() => {});
        const prepared = prepare ? await this.page.evaluate(prepare).catch(() => null) : null;
        // Whatever was closed or opened is given a moment to show.
        if (prepared?.closed || prepared?.pressed) await this.page.waitForTimeout(PREPARE_WAIT_MS);
        const facts = await this.page.evaluate(read);
        const sent = html && res ? await res.text().catch(() => null) : null;
        return { ok: true, status: res ? res.status() : null, url: this.page.url(), facts, ...(prepare ? { prepared } : {}), ...(html ? { html: sent } : {}) };
      } catch (err) {
        if (!this.isOpen()) return { ok: false, error: 'closed', message: 'The Live Flipkart Browser was closed.' };
        if (this.leftSite) return { ok: false, error: 'elsewhere', host: this.leftSite, message: `The page went to ${this.leftSite} instead of Flipkart.` };
        const timeout = /timeout/i.test(String(err?.message ?? ''));
        return { ok: false, error: timeout ? 'timeout' : 'network', message: timeout ? 'The page took too long to open.' : 'The page could not be opened.' };
      }
    }, onWait, gap);
  }

  /** Only when the dashboard stops. Chrome is asked to close and waited for, and the window never opens again. */
  async close() {
    this.stopped = true;
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
