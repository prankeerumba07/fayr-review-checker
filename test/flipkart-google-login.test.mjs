// The Flipkart checker's Google login (flipkart/google-login.js), the way the
// Amazon checker's works, in a window of its own: the Flipkart Google Browser
// (flipkart/google-browser.js). First with a pretend Flipkart Google Browser
// (no browser at all): the login found from the saved profile's cookies by
// name only, with no page and no window opened; "Log in to Google" opening
// Google's login page and noticing the login from the account button on
// Google's home page; Google refusing the login in the window, a robot
// check; a Google Drive download sent to Google's login page; the normal
// Chrome window on the same profile, with a pretend Chrome, and "I have
// logged in". Then through the real Flipkart Google Browser, in a hidden
// Chrome with made-up profiles, answered by pretend Google pages
// (fixtures/flipkart/fake-google.mjs): no host name resolves, every other
// address is refused, and nothing reaches Google.
// Run: node test/flipkart-google-login.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FlipkartGoogleBrowser, GOOGLE_BROWSER_NAME } from '../flipkart/google-browser.js';
import { FlipkartBrowser, createGate } from '../flipkart/browser.js';
import { createGoogleLogin, chromeCommand, WATCH_MS, LOGIN_COOKIES } from '../flipkart/google-login.js';
import { googleAccountFrom } from '../flipkart/page-read.js';
import { GOOGLE_HOME, GOOGLE_SIGN_IN_URL } from '../flipkart/links.js';
import { createFlipkartStore } from '../flipkart/store.js';
import { fakeGoogle, TEST_GOOGLE_NAME, TEST_GOOGLE_EMAIL } from './fixtures/flipkart/fake-google.mjs';
import { assertPlain } from './plain-words.mjs';

const dirs = [];
function newDataDir(name) {
  const d = mkdtempSync(join(tmpdir(), `arc-flipkart-google-${name}-`));
  dirs.push(d);
  return d;
}
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(ok, what, ms = 8000) {
  const end = Date.now() + ms;
  while (!(await ok())) {
    if (Date.now() > end) throw new Error(`Timed out waiting for: ${what}`);
    await sleep(25);
  }
}
const IN = { state: 'in', name: TEST_GOOGLE_NAME, says: null, chrome: false };
const OUT = { state: 'out', name: null, says: null, chrome: false };
const LOGIN_COOKIE = { name: 'SID', domain: '.google.com', expires: Date.now() / 1000 + 86_400 };
const ACCOUNT_LINE = { url: GOOGLE_HOME, title: 'Google', account: `Google Account: ${TEST_GOOGLE_NAME}  (${TEST_GOOGLE_EMAIL})`, signIn: false, loginForm: false, refused: false, robot: false };
const SIGN_IN_LINE = { url: GOOGLE_HOME, title: 'Google', account: null, signIn: true, loginForm: false, refused: false, robot: false };
const LOGIN_PAGE_LINE = { url: 'https://accounts.google.com/v3/signin/identifier?x', title: 'Sign in - Google Accounts', account: null, signIn: false, loginForm: true, refused: false, robot: false };

/** A stand-in for the Flipkart Google Browser: its cookies (names only), readable with no window, and what each Google page shows. */
function pretendBrowser({ cookies = [], pages = {} } = {}) {
  const b = {
    opened: [],
    begun: 0,
    closed: 0,
    asked: [],
    window: false,
    at: null,
    cookies,
    pages,
    profileDir: '/made-up/data/flipkart/google-profile',
    async begin() {
      b.begun++;
      b.window = true;
    },
    isOpen: () => b.window,
    async close() {
      b.closed++;
      b.window = false;
    },
    async cookieNames(urls) {
      b.asked.push(urls);
      return b.cookies;
    },
    async open(url) {
      b.opened.push(url);
      b.at = url;
      return { ok: true, status: 200, url };
    },
    async readGoogle() {
      if (!b.window) return null;
      const line = b.pages[b.at] ?? { url: b.at };
      return { account: googleAccountFrom(line), line };
    },
  };
  return b;
}
/** A pretend store for the name Google showed. */
function pretendStore(account = null) {
  const s = { account, async googleAccount() { return s.account; }, async setGoogleAccount(a) { s.account = a; } };
  return s;
}
/** A pretend normal Chrome window: what it was started with, the signals it got, and its exit when the test says so. */
function pretendChrome() {
  const made = { started: [], child: null };
  made.start = (cmd) => {
    const c = new EventEmitter();
    c.exitCode = null;
    c.signalCode = null;
    c.signals = [];
    c.kill = (sig) => c.signals.push(sig);
    c.quit = () => {
      c.exitCode = 0;
      c.emit('exit', 0, null);
    };
    made.started.push(cmd);
    made.child = c;
    return c;
  };
  return made;
}
const terminal = [];
const make = (live, { store = pretendStore(), chrome = pretendChrome(), command = async (dir, url) => ({ file: '/made-up/Google Chrome', args: [`--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--new-window', url] }) } = {}) =>
  createGoogleLogin({ live, store, watchMs: 30, log: (m) => terminal.push(m), chrome: chrome.start, command });

test("checked from the saved profile's cookies, by name and end date only, with no page and no window opened; the name is the one saved when the login was made", async () => {
  const browser = pretendBrowser({ cookies: [LOGIN_COOKIE, { name: 'NID', domain: '.google.com', expires: -1 }] });
  const google = make(browser, { store: pretendStore({ name: TEST_GOOGLE_NAME, email: TEST_GOOGLE_EMAIL }) });
  assert.equal(google.view().state, 'checking', 'the top bar starts by checking');
  assert.deepEqual(await google.check(), IN);
  assert.deepEqual([browser.opened, browser.begun], [[], 0], 'no page and no window are opened to check the login');
  assert.deepEqual(browser.asked, [['https://drive.google.com/', 'https://accounts.google.com/']], "Google Drive's and Google's login cookies, asked for once");
  // Other cookies on google.com do not mean a login; a login cookie that has ended does not either.
  for (const cookies of [[], [{ name: 'NID', domain: '.google.com', expires: -1 }, { name: 'CONSENT', domain: '.google.com', expires: 0 }], [{ name: 'SID', domain: '.google.com', expires: Date.now() / 1000 - 10 }]]) {
    assert.deepEqual(await make(pretendBrowser({ cookies })).check(), OUT, JSON.stringify(cookies));
  }
  assert.equal((await make(pretendBrowser({ cookies: [{ name: '__Secure-1PSID', domain: '.google.com', expires: -1 }] })).check()).state, 'in', 'a login cookie that lasts until the window closes still counts');
  assert.deepEqual(await make(pretendBrowser({ cookies: [LOGIN_COOKIE] })).check(), { state: 'in', name: null, says: null, chrome: false }, 'logged in, but no name was ever read: said without a name');
  assert.ok(LOGIN_COOKIES.has('SID') && LOGIN_COOKIES.has('HSID') && LOGIN_COOKIES.has('__Secure-1PSID'), "Google's login cookies, by name");
  // Chrome could not be started on the profile, or the window closed while its cookies were read.
  const broken = pretendBrowser();
  broken.cookieNames = async () => {
    throw new Error('no Chrome');
  };
  const problem = await make(broken).check();
  assert.equal(problem.state, 'problem');
  assert.equal(problem.says, 'The Flipkart Google Browser could not be opened on this computer, so the Google login could not be checked. If a Flipkart Google Browser window from before is still open, close it, then press "Check the Google login again".');
  const closed = pretendBrowser();
  closed.cookieNames = async () => null;
  assert.equal((await make(closed).check()).says, 'The Flipkart Google Browser window was closed, so the Google login could not be checked. Press "Check the Google login again" to open it again.');
  assert.equal(WATCH_MS, 2000, 'every 2 seconds while the login page shows');
});

test('"Log in to Google": the Flipkart Google Browser opens with Google\'s login page; the login is noticed from the account button on Google\'s home page and the name is saved; a login still saved goes straight to the home page', async () => {
  const browser = pretendBrowser({ pages: { [GOOGLE_SIGN_IN_URL]: LOGIN_PAGE_LINE } });
  const store = pretendStore();
  const google = make(browser, { store });
  const pressed = google.logIn();
  assert.equal(google.view().state, 'checking', 'at once');
  assert.equal(google.busy, true);
  assert.deepEqual(await pressed, { state: 'waiting', name: null, says: null, chrome: false });
  assert.equal(browser.begun, 1, 'the window is opened for the login');
  assert.deepEqual(browser.opened, [GOOGLE_SIGN_IN_URL], "Google's login page, which goes on to Google's home page");
  assert.equal(google.busy, false, 'the wait does not hold the dashboard');
  await sleep(120);
  assert.equal(google.view().state, 'waiting', 'while the login page shows, the wait goes on');
  // The person logs in by hand: Google goes to its home page, whose account button names the account.
  browser.pages[GOOGLE_HOME] = ACCOUNT_LINE;
  browser.at = GOOGLE_HOME;
  await until(() => google.view().state === 'in', 'the login is noticed');
  assert.deepEqual(google.view(), IN);
  assert.deepEqual(store.account, { name: TEST_GOOGLE_NAME, email: TEST_GOOGLE_EMAIL }, 'the name and email on the account button are saved for the top bar after a restart, nothing else');
  assert.deepEqual(browser.opened, [GOOGLE_SIGN_IN_URL], 'no other page was opened');
  // Pressed again with the login saved: Google skips the form and lands on the home page at once.
  assert.deepEqual(await make(pretendBrowser({ pages: { [GOOGLE_SIGN_IN_URL]: ACCOUNT_LINE } }), { store }).logIn(), IN);
  // The person goes elsewhere instead of logging in: Google's home page with its "Sign in" link.
  const left = pretendBrowser({ pages: { [GOOGLE_SIGN_IN_URL]: LOGIN_PAGE_LINE } });
  const leftLogin = make(left);
  await leftLogin.logIn();
  left.pages[GOOGLE_HOME] = SIGN_IN_LINE;
  left.at = GOOGLE_HOME;
  await until(() => leftLogin.view().state === 'out', 'not logged in');
  // The window closed while the login page showed.
  const shut = pretendBrowser({ pages: { [GOOGLE_SIGN_IN_URL]: LOGIN_PAGE_LINE } });
  const shutLogin = make(shut);
  await shutLogin.logIn();
  shut.window = false;
  await until(() => shutLogin.view().state === 'out', 'the window closed');
  // The window could not be opened.
  const none = pretendBrowser();
  none.begin = async () => {
    throw new Error('no Chrome');
  };
  assert.match((await make(none).logIn()).says, /^The Flipkart Google Browser could not be opened on this computer/);
  google.close();
  leftLogin.close();
  shutLogin.close();
});

test("Google refusing the login inside the window, a robot check, a block, and a download sent to Google's login page: each said plainly, nothing got around", async () => {
  const refused = pretendBrowser({ pages: { [GOOGLE_SIGN_IN_URL]: { url: 'https://accounts.google.com/v3/signin/rejected?x', title: 'Sign in - Google Accounts', account: null, signIn: false, loginForm: false, refused: true, robot: false } } });
  const out = await make(refused).logIn();
  assert.equal(out.state, 'problem');
  assert.equal(out.says, 'Google would not let you log in inside the Flipkart Google Browser window, because that window is controlled by the dashboard. Press "Log in to Google in a normal Chrome window": the dashboard closes the Flipkart Google Browser, opens a normal Chrome window with the same saved profile on Google\'s login page, and you log in there.');
  // The refusal shown only after the person pressed Next: noticed by the watch.
  const later = pretendBrowser({ pages: { [GOOGLE_SIGN_IN_URL]: LOGIN_PAGE_LINE } });
  const laterLogin = make(later);
  await laterLogin.logIn();
  later.pages['https://accounts.google.com/v3/signin/rejected'] = { url: 'https://accounts.google.com/v3/signin/rejected', title: 'Sign in', account: null, signIn: false, loginForm: false, refused: true, robot: false };
  later.at = 'https://accounts.google.com/v3/signin/rejected';
  await until(() => laterLogin.view().state === 'problem', 'the refusal is noticed');
  assert.match(laterLogin.view().says, /^Google would not let you log in inside the Flipkart Google Browser window/);
  const robot = pretendBrowser({ pages: { [GOOGLE_SIGN_IN_URL]: { url: 'https://www.google.com/sorry/index?continue=x', title: 'Sorry...', account: null, signIn: false, loginForm: false, refused: false, robot: true } } });
  robot.open = async (url) => (robot.opened.push(url), (robot.at = url), { ok: true, status: 429, url });
  assert.equal((await make(robot).logIn()).says, 'Google showed a robot check in the Flipkart Google Browser window, so the Google login could not be checked. This dashboard never answers a robot check. Press "Check the Google login again" when you want to try again.');
  const blocked = pretendBrowser({ pages: { [GOOGLE_SIGN_IN_URL]: { url: GOOGLE_SIGN_IN_URL, title: 'Error', account: null, signIn: false, loginForm: false, refused: false, robot: false } } });
  blocked.open = async (url) => (blocked.opened.push(url), (blocked.at = url), { ok: true, status: 503, url });
  assert.equal((await make(blocked).logIn()).says, 'Google refused to show its page, so the Google login could not be checked. Wait a while, then press "Check the Google login again".');
  const offline = pretendBrowser();
  offline.open = async () => ({ ok: false, error: 'network' });
  assert.match((await make(offline).logIn()).says, /^Google could not be reached, so the Google login could not be checked\./);
  // A Google Drive download answered with Google's login page: the saved login has ended.
  const browser = pretendBrowser({ cookies: [LOGIN_COOKIE] });
  const google = make(browser, { store: pretendStore({ name: TEST_GOOGLE_NAME, email: null }) });
  assert.deepEqual(await google.check(), IN);
  google.loggedOut();
  assert.deepEqual(google.view(), OUT);
  laterLogin.close();
});

test('the normal Chrome window, as on Amazon: the Flipkart Google Browser is closed properly first, a plain Chrome opens on the same profile at Google\'s login page, and "I have logged in" asks it to quit, then reads the cookies', async () => {
  const browser = pretendBrowser({ pages: { [GOOGLE_HOME]: ACCOUNT_LINE } });
  browser.window = true;
  const chrome = pretendChrome();
  const store = pretendStore();
  const google = make(browser, { store, chrome });
  assert.deepEqual(await google.logInInChrome(), { state: 'waiting', name: null, says: null, chrome: true });
  assert.deepEqual([browser.closed, browser.window], [1, false], 'the Flipkart Google Browser was closed, so the profile is free');
  assert.deepEqual(chrome.started, [{ file: '/made-up/Google Chrome', args: ['--user-data-dir=/made-up/data/flipkart/google-profile', '--no-first-run', '--no-default-browser-check', '--new-window', GOOGLE_SIGN_IN_URL] }], "Flipkart's own Google profile, at the login page, with no automation flag");
  assert.doesNotMatch(JSON.stringify(chrome.started), /automation|remote-debugging|headless|amazon-profile/, 'a normal Chrome, on the Flipkart Google profile: nothing hidden');
  // While that window holds the profile, the login cannot be checked from the dashboard.
  assert.match((await google.check()).says, /^The normal Chrome window is still open\. Quit it/);
  // The person logs in there, then presses "I have logged in": Chrome is asked to quit, as Command and Q would, and waited for.
  browser.cookies = [LOGIN_COOKIE];
  const pressed = google.done();
  await until(() => chrome.child.signals.length > 0, 'asked to quit');
  assert.deepEqual(chrome.child.signals, ['SIGTERM'], 'asked to quit; never forced shut');
  chrome.child.quit();
  assert.deepEqual(await pressed, IN);
  assert.deepEqual(browser.opened, [GOOGLE_HOME], "no name was saved yet, so Google's home page was opened once to read the account button");
  assert.deepEqual(store.account, { name: TEST_GOOGLE_NAME, email: TEST_GOOGLE_EMAIL });
  // Quit by the person instead (Command and Q): the cookies are read by themselves.
  const second = pretendBrowser({ cookies: [LOGIN_COOKIE] });
  const chrome2 = pretendChrome();
  const g2 = make(second, { store, chrome: chrome2 });
  await g2.logInInChrome();
  chrome2.child.quit();
  await until(() => g2.view().state === 'in', 'read once the window closed');
  assert.deepEqual([g2.view(), second.opened, second.begun], [IN, [], 0], 'the name was saved before: no page and no window are opened');
  const none = make(pretendBrowser(), { command: async () => null });
  assert.equal((await none.logInInChrome()).says, 'Google Chrome could not be found in the Applications folder, so no normal Chrome window could be opened.');
  // When the dashboard stops, a window still open is asked to quit.
  const third = pretendBrowser();
  const chrome3 = pretendChrome();
  const g3 = make(third, { chrome: chrome3 });
  await g3.logInInChrome();
  const closing = g3.close();
  await until(() => chrome3.child.signals.length > 0, 'asked to quit when the dashboard stops');
  chrome3.child.quit();
  await closing;
  const cmd = await chromeCommand('/made-up/profile', GOOGLE_SIGN_IN_URL, { home: '/made-up/home', exists: async (f) => f.startsWith('/made-up/home/') });
  assert.deepEqual(cmd, { file: '/made-up/home/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--user-data-dir=/made-up/profile', '--no-first-run', '--no-default-browser-check', '--new-window', GOOGLE_SIGN_IN_URL] });
});

test("what Google's pages say about the login is read from the account button only", () => {
  assert.deepEqual(googleAccountFrom(ACCOUNT_LINE), { signedIn: true, name: TEST_GOOGLE_NAME, email: TEST_GOOGLE_EMAIL });
  assert.deepEqual(googleAccountFrom({ ...ACCOUNT_LINE, account: `Google Account: ${TEST_GOOGLE_EMAIL}` }), { signedIn: true, name: TEST_GOOGLE_EMAIL, email: null }, 'the email when no name shows');
  assert.deepEqual(googleAccountFrom(SIGN_IN_LINE), { signedIn: false, loginPage: false });
  assert.deepEqual(googleAccountFrom(LOGIN_PAGE_LINE), { signedIn: false, loginPage: true });
  assert.equal(googleAccountFrom({ url: 'https://www.flipkart.com/', account: 'Google Account: x' }), null, 'another site says nothing');
  assert.equal(googleAccountFrom({ url: 'not a link' }), null);
});

// ---- the real Flipkart Google Browser, in a hidden Chrome, with pretend Google pages ----

const googleWindow = (dataDir, site) => new FlipkartGoogleBrowser({ dataDir, headless: true, routes: site.handler, gate: createGate({ gapMs: 200 }) });

test('in a hidden Chrome: the saved login checked with no window, the login page in the Flipkart Google Browser, the login noticed from the account button, cookies read by name only, and the login still there after a restart, with no page opened', { timeout: 120_000 }, async () => {
  const site = fakeGoogle();
  const dataDir = newDataDir('window');
  const store = createFlipkartStore(dataDir);
  const browser = googleWindow(dataDir, site);
  const google = createGoogleLogin({ live: browser, store, watchMs: 100, log: (m) => terminal.push(m) });
  try {
    assert.equal(browser.profileDir, join(dataDir, 'flipkart', 'google-profile'), "Flipkart's own Google profile");
    assert.notEqual(browser.profileDir, new FlipkartBrowser({ dataDir }).profileDir, "never the Live Flipkart Browser's profile");
    assert.ok(browser.options(false).args.includes(`--window-name=${GOOGLE_BROWSER_NAME}`) && GOOGLE_BROWSER_NAME === 'Flipkart Google Browser', 'the window is named "Flipkart Google Browser"');
    assert.deepEqual(await google.check(), OUT, 'a fresh profile: not logged in');
    assert.deepEqual([site.visits, browser.launches, browser.peeks, browser.isOpen()], [[], 0, 1, false], 'read in a hidden Chrome that opened no page; no window opened');
    assert.deepEqual(await google.logIn(), { state: 'waiting', name: null, says: null, chrome: false });
    assert.deepEqual([browser.launches, site.visits.map((v) => v.url)], [1, [GOOGLE_SIGN_IN_URL]], "the window opened, with Google's login page");
    assert.equal(await browser.context.pages()[0].title(), GOOGLE_BROWSER_NAME, 'its first tab says what the window is');
    await browser.page.fill('#identifierId', 'typed-by-the-person@example.test');
    const seen = await browser.readGoogle();
    assert.deepEqual(seen.account, { signedIn: false, loginPage: true });
    assert.doesNotMatch(JSON.stringify(seen), /typed-by-the-person/, 'nothing typed into a page is ever read');
    await browser.page.click('#next');
    await until(() => google.view().state === 'in', 'the top bar is told', 6000);
    assert.deepEqual(google.view(), IN);
    assert.deepEqual(await store.googleAccount().then((a) => [a.name, a.email]), [TEST_GOOGLE_NAME, TEST_GOOGLE_EMAIL], "kept in Flipkart's own settings");
    const cookies = await browser.cookieNames(['https://drive.google.com/']);
    assert.ok(cookies.some((c) => c.name === 'SID'), 'the login cookie, by name, from the open window');
    assert.deepEqual(Object.keys(cookies[0]).sort(), ['domain', 'expires', 'name'], 'never a value');
    assert.doesNotMatch(JSON.stringify(cookies), /made-up-test-session/);
    assert.equal(browser.peeks, 1, 'with the window open, its cookies are read from it');
    assert.deepEqual(site.visits.map((v) => v.url), [GOOGLE_SIGN_IN_URL, GOOGLE_HOME], "the login page, then Google's home page, where Google went by itself");
  } finally {
    google.close();
    await browser.stop();
  }
  assert.equal(browser.isOpen(), false);
  await assert.rejects(browser.begin(), /The dashboard is stopping\./, 'once the dashboard stops, the window never opens again');
  // The same profile after a restart: the login is found from the cookies, with no page and no window opened.
  const again = googleWindow(dataDir, site);
  try {
    site.visits.length = 0;
    assert.deepEqual(await createGoogleLogin({ live: again, store }).check(), IN, 'still logged in, with the name saved before');
    assert.deepEqual([site.visits, again.launches, again.peeks], [[], 0, 1], 'no page, no window, no password');
  } finally {
    await again.stop();
  }
  assert.deepEqual(readdirSync(join(dataDir, 'flipkart')).sort(), ['google-profile', 'settings.json'], 'only in data/flipkart/');
});

test('in a hidden Chrome: Google refusing the login in the Flipkart Google Browser, and a robot check after the person pressed Next; nothing is typed by the dashboard', { timeout: 120_000 }, async () => {
  const site = fakeGoogle();
  site.refuse = true;
  const browser = googleWindow(newDataDir('refused'), site);
  const google = createGoogleLogin({ live: browser, watchMs: 100 });
  try {
    const out = await google.logIn();
    assert.equal(out.state, 'problem');
    assert.match(out.says, /^Google would not let you log in inside the Flipkart Google Browser window/);
    assert.deepEqual(site.visits.map((v) => v.url), [GOOGLE_SIGN_IN_URL], 'nothing more is opened');
    site.refuse = false;
    site.robot = true;
    await google.logIn();
    assert.equal(await browser.page.inputValue('#identifierId'), '', 'nothing is typed into the login page');
    await browser.page.click('#next');
    await until(() => google.view().state === 'problem', 'the robot check is noticed');
    assert.match(google.view().says, /^Google showed a robot check in the Flipkart Google Browser window/);
  } finally {
    google.close();
    await browser.stop();
  }
});

test('every sentence the Google login says is plain', () => {
  const texts = terminal.filter((t) => typeof t === 'string' && t && !/^Google login check, .*: opened /.test(t));
  assert.ok(texts.length > 5);
  assertPlain(assert, texts, 'the Terminal lines');
});
