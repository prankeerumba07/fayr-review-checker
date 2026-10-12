// The Flipkart checker's Google login, as the top bar shows it, one clear
// state at a time. Copied from the Amazon checker's Google login
// (amazon/google-login.js) and changed for Flipkart: it uses the Flipkart
// Google Browser, a window of its own with its own saved profile
// (google-browser.js, data/flipkart/google-profile), never the Live Amazon
// Browser or the Live Flipkart Browser, and the saved login is checked
// without opening that window.
//   checking — the saved profile's cookies are being looked at (their names
//              and end dates only, never their values), to see whether a
//              Google login is saved; no page is opened for this
//   in       — a Google login is saved; the name is the one Google's home page
//              showed when the login was made here
//   out      — no Google login is saved
//   waiting  — Google's login page is showing in the Flipkart Google Browser
//              window, for a person to log in by hand; the account button at
//              the top of Google's pages is read every 2 seconds until Google's
//              home page shows a name. Or a normal Chrome window is open on the
//              same saved profile, for when Google will not let anyone log in
//              inside a window the dashboard controls
//   problem  — Google refused the login in the window, showed a robot check,
//              or could not be reached; said in plain words, nothing got around
// Only "Log in to Google" opens a Google page: Google's login page, which goes
// on to Google's home page (nothing of the account is on it). Nothing is typed,
// no password is read or kept, and Google's sign-out page is never opened. The
// login is kept by Chrome in the one saved profile, so it stays after a
// restart. The Google Drive files in the Flipkart file are then downloaded by
// that browser with its login, without opening a page (screenshots.js,
// pictures.js); nothing else of the Google account is ever opened.

import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { GOOGLE_HOME, GOOGLE_SIGN_IN_URL } from './links.js';
import { GOOGLE_BROWSER_NAME } from './google-browser.js';

export const WATCH_MS = 2000;
/** Google's cookies that hold a login, by name: any one of them, not ended, means a login is saved. Their values are never read. */
export const LOGIN_COOKIES = new Set(['SID', 'HSID', 'SSID', '__Secure-1PSID', '__Secure-3PSID', 'LSID', '__Host-1PLSID', '__Host-3PLSID']);
const COOKIE_URLS = ['https://drive.google.com/', 'https://accounts.google.com/'];
/** How long a normal Chrome window asked to quit is given to close by itself. It is never forced shut. */
export const QUIT_WAIT_MS = 15_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WINDOW = GOOGLE_BROWSER_NAME;
const SAYS = {
  launch: `The ${WINDOW} could not be opened on this computer, so the Google login could not be checked. If a ${WINDOW} window from before is still open, close it, then press "Check the Google login again".`,
  closed: `The ${WINDOW} window was closed, so the Google login could not be checked. Press "Check the Google login again" to open it again.`,
  timeout: 'Google took too long to answer, so the Google login could not be checked. Press "Check the Google login again" in a moment.',
  network: 'Google could not be reached, so the Google login could not be checked. Check that this computer is online, then press "Check the Google login again".',
  refused: `Google would not let you log in inside the ${WINDOW} window, because that window is controlled by the dashboard. Press "Log in to Google in a normal Chrome window": the dashboard closes the ${WINDOW}, opens a normal Chrome window with the same saved profile on Google's login page, and you log in there.`,
  robot: `Google showed a robot check in the ${WINDOW} window, so the Google login could not be checked. This dashboard never answers a robot check. Press "Check the Google login again" when you want to try again.`,
  blocked: 'Google refused to show its page, so the Google login could not be checked. Wait a while, then press "Check the Google login again".',
  noChrome: 'Google Chrome could not be found in the Applications folder, so no normal Chrome window could be opened.',
  chromeFailed: 'The normal Chrome window could not be opened. Press "Check the Google login again".',
  stillOpen: 'The normal Chrome window is still open. Quit it (click it, then press Command and Q), then press "I have logged in" again.',
  failed: 'Something went wrong on this computer while checking the Google login. Press "Check the Google login again".',
};

/** Where Google Chrome is on a Mac: in the Applications folder, or in this account's own. */
const CHROME_APPS = (home) => ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', join(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')];

/**
 * The command that opens a normal Chrome window on the saved profile, at
 * Google's login page: a plain Chrome, with none of the automation flags,
 * so nothing is hidden and nothing is got around. Null when Chrome is not
 * installed.
 */
export async function chromeCommand(profileDir, url = GOOGLE_SIGN_IN_URL, { home = homedir(), exists = (f) => access(f).then(() => true, () => false) } = {}) {
  for (const file of CHROME_APPS(home)) {
    if (await exists(file)) return { file, args: [`--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--new-window', url] };
  }
  return null;
}

/** Starts that Chrome. Its own output is not read. */
function startChrome({ file, args }) {
  return spawn(file, args, { stdio: 'ignore' });
}

/** A Google page a login check opened, for the Terminal window: its address, its title and its account button, never anything typed. */
function pageWords(res, seen) {
  const line = seen?.line ?? {};
  const button = line.account ? `its account button says "${line.account}"` : 'it has no account button';
  const login = seen?.account?.loginPage ? " It is Google's login page." : '';
  return `${res?.url ?? line.url ?? 'a Google page'}, titled "${String(line.title ?? '').slice(0, 80)}", and ${button}.${login}`;
}

/**
 * live - the Flipkart Google Browser (begin, open, readGoogle, cookieNames, close, isOpen, profileDir).
 * store - keeps the name Google showed when the login was made here, in Flipkart's own settings, so the top bar can say it after a restart.
 * log(words) - writes a line in the Terminal window.
 * chrome(command) - starts a normal Chrome window; tests give a pretend one.
 * -> { view(), busy, check(why), logIn(why), logInInChrome(why), done(why), loggedOut(), close() }
 */
export function createGoogleLogin({ live, store = null, watchMs = WATCH_MS, log = () => {}, chrome = startChrome, command = chromeCommand }) {
  let now = { state: 'checking', name: null, says: null, chrome: false };
  let busy = false;
  let timer = null;
  let reading = false;
  let child = null; // the normal Chrome window, while it is open
  let after = null; // the cookies being read once that window has closed
  let saved; // the account last seen here, read from the store once

  const tell = (why, words) => log(`Google login check, ${why}: ${words}`);

  function stopWatch() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function set(state, { name = null, says = null, chrome: inChrome = false } = {}) {
    now = { state, name: state === 'in' ? name : null, says: state === 'problem' ? says ?? SAYS.failed : null, chrome: state === 'waiting' && inChrome };
    if (state !== 'waiting') stopWatch();
  }

  async function savedAccount() {
    if (saved === undefined) saved = store?.googleAccount ? await store.googleAccount().catch(() => null) : null;
    return saved;
  }
  async function remember(account) {
    saved = account ? { name: account.name ?? null, email: account.email ?? null } : null;
    if (store?.setGoogleAccount) await store.setGoogleAccount(saved).catch(() => {});
  }

  /**
   * Whether the saved profile holds a Google login: its cookies' names and end
   * dates, never their values, read from the window when it is open, else
   * without opening it. Null when they cannot be read; throws when Chrome
   * cannot be started on the profile.
   */
  async function savedLogin() {
    const seen = await live.cookieNames(COOKIE_URLS);
    if (seen === null) return null;
    const t = Date.now() / 1000;
    return seen.some((c) => LOGIN_COOKIES.has(c.name) && (!(c.expires > 0) || c.expires > t));
  }

  /** The cookies read, without opening the window when it is not open: { state, name } or { state: 'problem', says }. No page is opened. */
  async function readCookies(why) {
    if (child) return { state: 'problem', says: SAYS.stillOpen };
    let has;
    try {
      has = await savedLogin();
    } catch {
      tell(why, `the ${WINDOW} could not be started to read the saved profile.`);
      return { state: 'problem', says: SAYS.launch };
    }
    if (has === null) {
      tell(why, 'the cookies could not be read.');
      return { state: 'problem', says: SAYS.closed };
    }
    const account = has ? await savedAccount() : null;
    const name = account?.name ?? account?.email ?? null;
    tell(why, has ? `the saved profile holds a Google login (from the names and end dates of its cookies only; no page was opened), so the top bar says logged in to Google${name ? ` as ${name}` : ''}.` : 'the saved profile holds no Google login (from the names of its cookies only; no page was opened), so the top bar says not logged in to Google.');
    return has ? { state: 'in', name } : { state: 'out' };
  }

  /** What a Google page the window shows means for the top bar: { state, … }, or null while a login is still going on. */
  function fromPage(seen) {
    const a = seen?.account;
    if (!a) return null;
    if (a.robot) return { state: 'problem', says: SAYS.robot };
    if (a.refused) return { state: 'problem', says: SAYS.refused };
    if (a.signedIn) return { state: 'in', name: a.name ?? a.email ?? null, account: { name: a.name ?? null, email: a.email ?? null } };
    if (a.loginPage) return null;
    return { state: 'out' };
  }

  /** Google's home page opened once in the window (opened for it), to read the name on its account button, when the login was made where it could not be read. */
  async function readName(why) {
    try {
      await live.begin();
    } catch {
      tell(why, `the ${WINDOW} could not be opened, so the top bar says logged in to Google without a name.`);
      return null;
    }
    const res = await live.open(GOOGLE_HOME);
    const seen = res?.ok ? await live.readGoogle() : null;
    tell(why, res?.ok ? `opened ${pageWords(res, seen)}` : "Google's home page could not be opened, so the top bar says logged in to Google without a name.");
    const out = fromPage(seen);
    if (out?.state === 'in') await remember(out.account);
    return out?.state === 'in' ? out.name : null;
  }

  /** Every 2 seconds while Google's login page shows in the window: the account button only. */
  async function tick() {
    if (reading || now.state !== 'waiting' || now.chrome) return;
    reading = true;
    try {
      if (!live.isOpen()) return set('out');
      const seen = await live.readGoogle();
      if (now.state !== 'waiting' || !seen) return;
      const out = fromPage(seen);
      if (!out) return;
      if (out.state === 'in') await remember(out.account);
      set(out.state, out);
    } finally {
      reading = false;
    }
  }

  function watch() {
    stopWatch();
    timer = setInterval(() => {
      tick().catch(() => {});
    }, watchMs);
    timer.unref?.();
  }

  /** Runs one of the flows below, one at a time; anything unexpected becomes a plain problem. */
  async function run(flow) {
    if (busy) return view();
    busy = true;
    set('checking');
    try {
      await flow();
    } catch {
      set('problem', { says: SAYS.failed });
    } finally {
      busy = false;
    }
    return view();
  }

  function view() {
    return { ...now };
  }

  /** Once the normal Chrome window has closed: the cookies, then the name from Google's home page when none is saved. */
  const afterChrome = (why) =>
    run(async () => {
      const seen = await readCookies(why);
      if (seen.state === 'in' && !seen.name) seen.name = await readName(why);
      set(seen.state, seen);
    });

  const login = {
    view,
    get busy() {
      return busy;
    },
    /**
     * When the Flipkart screen first asks, "Check the Google login again",
     * and before a row whose Google Drive pictures are still to be
     * downloaded: the saved profile's cookies, by name and end date only. No
     * page is opened, and the window is not opened for it.
     */
    check: (why = 'when the Flipkart screen first asked') =>
      run(async () => {
        const seen = await readCookies(why);
        set(seen.state, seen);
      }),
    /**
     * "Log in to Google": the Flipkart Google Browser opens, Google's login
     * page opens in it for a person to log in by hand, and the account button
     * is watched until Google's home page shows a name. A login still saved
     * skips the form: Google goes straight to its home page.
     */
    logIn: (why = 'when "Log in to Google" was pressed') =>
      run(async () => {
        if (child) return set('problem', { says: SAYS.stillOpen });
        try {
          await live.begin();
        } catch {
          tell(why, `the ${WINDOW} could not be opened.`);
          return set('problem', { says: SAYS.launch });
        }
        set('waiting');
        tell(why, `Google's login page is opened in the ${WINDOW} window, for a person to log in by hand.`);
        const res = await live.open(GOOGLE_SIGN_IN_URL);
        if (!res?.ok) {
          tell(why, "Google's login page could not be opened.");
          return set('problem', { says: SAYS[res?.error] ?? SAYS.network });
        }
        const seen = await live.readGoogle();
        tell(why, `opened ${pageWords(res, seen)}`);
        const out = fromPage(seen);
        if (out?.state === 'problem') return set('problem', out);
        if ([403, 429, 503].includes(res.status)) return set('problem', { says: SAYS.blocked });
        if (out?.state === 'in') {
          await remember(out.account);
          return set('in', out);
        }
        set('waiting');
        watch();
      }),
    /**
     * "Log in to Google in a normal Chrome window", for when Google will not
     * let anyone log in inside a window the dashboard controls: the Flipkart
     * Google Browser is closed properly (one Chrome at a time can use the
     * saved profile), then a normal Chrome window opens on that same profile
     * at Google's login page. Once that window has closed, the cookies are
     * read, and the Flipkart Google Browser opens again when next needed.
     */
    logInInChrome: (why = 'when "Log in to Google in a normal Chrome window" was pressed') =>
      run(async () => {
        if (child) return set('waiting', { chrome: true });
        const cmd = await command(live.profileDir, GOOGLE_SIGN_IN_URL);
        if (!cmd) {
          tell(why, 'Google Chrome was not found on this computer.');
          return set('problem', { says: SAYS.noChrome });
        }
        await live.close();
        tell(why, `the ${WINDOW} was closed, and a normal Chrome window is opened on the same saved profile, at Google's login page, for a person to log in by hand.`);
        let c;
        try {
          c = chrome(cmd);
        } catch {
          return set('problem', { says: SAYS.chromeFailed });
        }
        child = c;
        after = null;
        c.once('exit', () => {
          if (child !== c) return;
          child = null;
          tell(why, 'the normal Chrome window closed.');
          after = afterChrome(why);
        });
        c.once('error', () => {
          if (child !== c) return;
          child = null;
          set('problem', { says: SAYS.chromeFailed });
        });
        set('waiting', { chrome: true });
      }),
    /**
     * "I have logged in": the normal Chrome window is asked to quit, as
     * Command and Q would, and waited for, so Chrome saves the login; it is
     * never forced shut. Then the cookies are read.
     */
    async done(why = 'when "I have logged in" was pressed') {
      const c = child;
      if (!c) return after ? (await after, view()) : login.check(why);
      tell(why, 'the normal Chrome window is asked to quit.');
      try {
        c.kill('SIGTERM');
      } catch {
        // already gone: its exit is seen below
      }
      const end = Date.now() + QUIT_WAIT_MS;
      while (child === c && Date.now() < end) await sleep(50);
      if (child === c) {
        set('problem', { says: SAYS.stillOpen });
        return view();
      }
      if (after) await after;
      return view();
    },
    /** A Google Drive download was sent to Google's login page: the saved login has ended. */
    loggedOut() {
      if (busy || now.state === 'waiting') return;
      set('out');
    },
    /** When the dashboard stops: a normal Chrome window still open is asked to quit and waited for, so the profile is free next time. */
    async close() {
      stopWatch();
      const c = child;
      if (!c) return;
      child = null;
      try {
        c.kill('SIGTERM');
      } catch {
        return;
      }
      const end = Date.now() + QUIT_WAIT_MS;
      while (c.exitCode === null && c.signalCode === null && Date.now() < end) await sleep(50);
    },
  };
  return login;
}
