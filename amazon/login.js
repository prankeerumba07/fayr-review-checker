// The Amazon login, as the top bar shows it, one clear state at a time:
//   checking — Amazon's home page is being opened to read who is logged in
//   in       — Amazon's account line says "Hello, NAME"
//   out      — Amazon says no one is logged in
//   waiting  — Amazon's login page is showing in the Live Amazon Browser
//              window for a person to log in by hand; the account line is
//              read every 2 seconds until it shows a name
//   problem  — Amazon showed a robot check or a block, or could not be
//              reached; said in plain words, and nothing is got around
// Only the account line at the top of Amazon's pages is read, never anything
// typed into a page. Each home page a login check opens is written in the
// Terminal window: its address and the words of its account line, so a wrong
// answer can be looked into. Nothing is typed into Amazon, no password is read or
// kept, and Amazon's sign-out page is never opened. Pages open through the
// Live Amazon Browser's gate (one at a time, at least 3 seconds apart);
// reading the account line opens no page.

import { AMAZON_HOME, SIGN_IN_URL } from './links.js';
import { whatPageIs, accountFrom, isLoginPage } from './page-read.js';

export const WATCH_MS = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SAYS = {
  launch: 'The Live Amazon Browser could not be opened on this computer, so the login could not be checked. If a Live Amazon Browser window from before is still open, close it, then press "Check the login again".',
  closed: 'The Live Amazon Browser window was closed, so the login could not be checked. Press "Check the login again" to open it again.',
  timeout: 'Amazon took too long to answer, so the login could not be checked. Press "Check the login again" in a moment.',
  network: 'Amazon could not be reached, so the login could not be checked. Check that this computer is online, then press "Check the login again".',
  captcha: 'Amazon showed a robot check in the Live Amazon Browser window, so the login could not be checked. This dashboard never answers a robot check. Press "Check the login again" when you want to try again.',
  blocked: 'Amazon refused to show its page, so the login could not be checked. Wait a while, then press "Check the login again".',
  failed: 'Something went wrong on this computer while checking the Amazon login. Press "Check the login again".',
};

/** One home page a login check opened, for the Terminal window: its address, its title and its account line, never anything typed. */
function pageWords(res) {
  const f = res?.facts ?? {};
  const line = f.hello ? `its account line says "${f.hello}"` : 'it has no account line';
  const login = whatPageIs(f, res?.status).kind === 'signin' ? " It is Amazon's login page." : '';
  return `${res?.url ?? f.url ?? 'an Amazon page'}, titled "${String(f.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)}", and ${line}.${login}`;
}

/**
 * live - the LiveBrowser. Its pages (a check's, or one a person opens) tell
 * this who is logged in too, so a login Amazon ends later shows at once.
 * log(words) - writes a line in the Terminal window.
 * -> { view(), busy, check(why), logIn(why), recheck(why), note(account, facts), close() }
 */
export function createLogin({ live, watchMs = WATCH_MS, log = () => {} }) {
  let now = { state: 'checking', name: null, says: null };
  let busy = false; // Amazon's home page (and then its login page) is being opened
  let timer = null;
  let reading = false;

  function stopWatch() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function set(state, { name = null, says = null } = {}) {
    now = { state, name: state === 'in' ? name : null, says: state === 'problem' ? says ?? SAYS.failed : null };
    if (state !== 'waiting') stopWatch();
  }

  /** What a page that could not be used says, as a problem; null when the page can be read. */
  function trouble(res) {
    if (!res?.ok) return SAYS[res?.error] ?? SAYS.network;
    const kind = whatPageIs(res.facts, res.status).kind;
    if (kind === 'captcha') return SAYS.captcha;
    if (kind === 'blocked' || kind === 'not-found') return SAYS.blocked;
    return null;
  }

  /**
   * Opens Amazon's home page with the saved profile and reads who is logged
   * in: { state: 'in', name }, { state: 'out' } or { state: 'problem', says }.
   * A page that shows no name has its account line read once more, 2
   * seconds later (that opens no page), in case it was still being filled in.
   * `say` writes what was seen in the Terminal window.
   */
  async function readHome(say) {
    try {
      await live.begin();
    } catch {
      say('the Live Amazon Browser could not be opened.');
      return { state: 'problem', says: SAYS.launch };
    }
    const res = await live.open(AMAZON_HOME);
    const since = Number.isFinite(live.openedAt) ? ` (${Math.round((Date.now() - live.openedAt) / 1000)} seconds after the Live Amazon Browser window opened)` : '';
    if (!res?.ok) say(`Amazon's home page could not be opened${since}.`);
    else say(`opened${since} ${pageWords(res)}`);
    const says = trouble(res);
    if (says) return { state: 'problem', says };
    let account = whatPageIs(res.facts, res.status).kind === 'signin' ? { signedIn: false } : accountFrom(res.facts);
    if (!account?.signedIn) {
      await sleep(watchMs);
      const seen = await live.readAccount();
      say(seen ? `${Math.round(watchMs / 1000)} seconds later, ${seen.line?.hello ? `the account line says "${seen.line.hello}"` : 'the page has no account line'}.` : `${Math.round(watchMs / 1000)} seconds later, the account line could not be read.`);
      if (seen?.account?.signedIn) account = seen.account;
    }
    return account?.signedIn ? { state: 'in', name: account.name } : { state: 'out' };
  }

  /** A login check's lines for the Terminal window, each saying which check it is. */
  function teller(why) {
    let n = 0;
    return {
      page: (words) => log(`Amazon login check, ${why}: page ${++n}: ${words}`),
      line: (words) => log(`Amazon login check, ${why}: ${words}`),
    };
  }
  /** Reads the home page and writes it in the Terminal window. */
  async function look(tell) {
    return readHome((words) => (/^(opened|Amazon's home page)/.test(words) ? tell.page(words) : tell.line(words)));
  }
  const RESULT = { in: 'logged in to Amazon.', out: 'not logged in to Amazon.', problem: 'the login could not be checked.' };

  /** Every 2 seconds while Amazon's login page shows: the account line only. */
  async function tick() {
    if (reading || now.state !== 'waiting') return;
    reading = true;
    try {
      if (!live.isOpen()) return set('out');
      const seen = await live.readAccount();
      if (now.state !== 'waiting' || !seen) return;
      if (seen.account?.signedIn) set('in', { name: seen.account.name });
      else if (seen.account && !seen.loginPage) set('out');
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

  const login = {
    view,
    get busy() {
      return busy;
    },
    /**
     * When the dashboard starts, and "Check the login again": Amazon's home
     * page, read with the saved profile. Just after a restart, the first page
     * Amazon showed said no one was logged in while the next one showed the
     * name, so a home page that shows no name is opened once more (through
     * the gate, at least 3 seconds later) before the top bar says "Not logged
     * in to Amazon".
     */
    check: (why = 'when the dashboard started') =>
      run(async () => {
        const tell = teller(why);
        let seen = await look(tell);
        if (seen.state === 'out') seen = await look(tell);
        tell.line(`the top bar says ${RESULT[seen.state]}`);
        set(seen.state, seen);
      }),
    /**
     * "Start checking" or a row's "Check", pressed while the top bar says
     * "Not logged in to Amazon": Amazon's home page is read again first, the
     * way "Log in to Amazon" reads it, but no login page is opened.
     */
    recheck: (why = 'before checking') =>
      run(async () => {
        const tell = teller(why);
        const seen = await look(tell);
        tell.line(`the top bar says ${RESULT[seen.state]}`);
        set(seen.state, seen);
      }),
    /**
     * "Log in to Amazon": Amazon's home page first. When it shows who is
     * logged in, that is all; only when it shows no one, Amazon's login page
     * opens for a person to log in by hand, and the account line is watched.
     */
    logIn: (why = 'when "Log in to Amazon" was pressed') =>
      run(async () => {
        const tell = teller(why);
        const seen = await look(tell);
        tell.line(seen.state === 'out' ? "not logged in, so Amazon's login page is opened for a person to log in." : `the top bar says ${RESULT[seen.state]}`);
        if (seen.state !== 'out') return set(seen.state, seen);
        set('waiting');
        const res = await live.open(SIGN_IN_URL);
        const says = trouble(res);
        if (says) return set('problem', { says });
        const account = accountFrom(res.facts);
        if (account?.signedIn) return set('in', { name: account.name });
        watch();
      }),
    /** A page a check or a person opened says who is logged in (or that no one is). */
    note(account, facts) {
      if (!account || busy) return;
      if (account.signedIn) return set('in', { name: account.name });
      // Amazon's own login pages say no one is logged in yet; while a person logs in there, the wait goes on.
      if (now.state === 'waiting' && isLoginPage(facts)) return;
      set('out');
    },
    /** When the dashboard stops. */
    close() {
      stopWatch();
    },
  };
  const before = live.onAccount;
  live.onAccount = (account, facts) => {
    login.note(account, facts);
    if (typeof before === 'function') before(account, facts);
  };
  return login;
}
