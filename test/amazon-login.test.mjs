// The Amazon login through the real Live Amazon Browser code, in a hidden
// Chrome with made-up profiles, answered by pretend Amazon pages
// (fixtures/amazon/fake-amazon.mjs): no host name resolves and nothing
// reaches Amazon. The login button; a login noticed within seconds, reading
// only the account line; a login kept after the window closes and opens
// again, and after the dashboard is stopped the way Control+C stops it and
// started again, found by itself even when Amazon's first page after the
// restart shows no name; the browser closed properly when the dashboard
// stops; a robot check, a block, and Amazon ending a login later.
// Run: node test/amazon-login.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, lstatSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { LiveBrowser, createGate } from '../amazon/browsers.js';
import { createLogin, WATCH_MS } from '../amazon/login.js';
import { AMAZON_HOME, SIGN_IN_URL } from '../amazon/links.js';
import { fakeAmazon, TEST_NAME } from './fixtures/amazon/fake-amazon.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const dirs = [];
function newDataDir(name) {
  const d = mkdtempSync(join(tmpdir(), `arc-login-${name}-`));
  dirs.push(d);
  return d;
}
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

const LOGGED_IN = { state: 'in', name: TEST_NAME, says: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(ok, what, ms = 8000) {
  const end = Date.now() + ms;
  while (!(await ok())) {
    if (Date.now() > end) throw new Error(`Timed out waiting for: ${what}`);
    await sleep(25);
  }
}
function liveFor(dataDir, site, gate = createGate({ gapMs: 200 })) {
  return new LiveBrowser({ dataDir, labelUrl: 'data:text/html,<title>Live Amazon Browser</title>', headless: true, routes: site.handler, gate });
}
/** The person, logging in by hand on the pretend login page. */
async function personLogsIn(live, { keep = true } = {}) {
  await live.page.fill('#ap_email', 'typed-by-the-person@example.test');
  if (keep) await live.page.check('#remember');
  await live.page.click('#log-in');
}

test('the account line is read every 2 seconds while the login page shows, and nothing else', async () => {
  const reads = [];
  let answer = { account: { signedIn: false }, loginPage: true };
  const live = { onAccount: null, isOpen: () => true, begin: async () => {}, readAccount: async () => (reads.push(Date.now()), answer) };
  live.open = async (url) => ({ ok: true, status: 200, url, facts: url === AMAZON_HOME ? { url, hello: 'Hello, sign in' } : { url, hello: null, signInForm: true } });
  const login = createLogin({ live, watchMs: 100 });
  try {
    assert.deepEqual(await login.logIn(), { state: 'waiting', name: null, says: null });
    await until(() => reads.length >= 3, 'the account line is read again and again');
    // A page Amazon shows after a login, with no account line: the wait goes on.
    answer = { account: null, loginPage: true };
    await sleep(250);
    assert.equal(login.view().state, 'waiting');
    answer = { account: { signedIn: true, name: TEST_NAME }, loginPage: false };
    await until(() => login.view().state === 'in', 'the login is noticed');
    assert.deepEqual(login.view(), LOGGED_IN);
    const after = reads.length;
    await sleep(300);
    assert.equal(reads.length, after, 'once logged in, the reading stops');
  } finally {
    login.close();
  }
  const real = createLogin({ live: { onAccount: null } });
  assert.equal(real.view().state, 'checking', 'the dashboard starts by checking');
  assert.equal(WATCH_MS, 2000, 'every 2 seconds');
});

test('"Log in to Amazon", not logged in: the home page, then the login page at least 3 seconds later; the login is noticed within seconds, from the account line only', { timeout: 120_000 }, async () => {
  const site = fakeAmazon();
  const live = liveFor(newDataDir('first'), site, createGate());
  const login = createLogin({ live });
  try {
    const pressed = login.logIn();
    assert.equal(login.view().state, 'checking', 'at once: "Checking the Amazon login…"');
    assert.equal(login.busy, true);
    assert.deepEqual(await pressed, { state: 'waiting', name: null, says: null });
    assert.deepEqual(site.visits.map((v) => v.url), [AMAZON_HOME, SIGN_IN_URL], "Amazon's home page first, and its login page only because no one is logged in");
    assert.ok(site.visits[1].at - site.visits[0].at >= 3000, `one Amazon page at a time, at least 3 seconds apart (${site.visits[1].at - site.visits[0].at} ms)`);
    await live.page.fill('#ap_email', 'typed-by-the-person@example.test');
    const seen = await live.readAccount();
    assert.deepEqual([seen.account, seen.loginPage], [{ signedIn: false }, true]);
    assert.deepEqual(Object.keys(seen.line).sort(), ['hello', 'signInForm', 'url'], 'only the address, the account line and whether a login form is there');
    assert.doesNotMatch(JSON.stringify(seen), /typed-by-the-person/, 'nothing typed into a page is ever read');
    const loggedAt = Date.now();
    await personLogsIn(live);
    await until(() => login.view().state === 'in', 'the top bar is told', 6000);
    assert.ok(Date.now() - loggedAt < 5000, `noticed ${Date.now() - loggedAt} ms after the login`);
    assert.deepEqual(login.view(), LOGGED_IN);
    assert.equal(site.visits.filter((v) => v.url.startsWith('https://www.amazon.in/ap/')).length, 1, 'the login page was opened once');

    // Pressed again with the login saved: only the home page, never the login page.
    site.visits.length = 0;
    assert.deepEqual(await login.logIn(), LOGGED_IN);
    assert.deepEqual(site.visits.map((v) => v.url), [AMAZON_HOME]);
  } finally {
    login.close();
    await live.close();
  }
});

test('the login is still there after the Live Amazon Browser is closed and opened again with the same profile; one made without "Keep me signed in" is not', { timeout: 120_000 }, async () => {
  const site = fakeAmazon();
  const dataDir = newDataDir('kept');
  const first = liveFor(dataDir, site);
  const login = createLogin({ live: first });
  await login.logIn();
  await personLogsIn(first);
  await until(() => login.view().state === 'in', 'logged in');
  login.close();
  await first.close();
  assert.equal(first.isOpen(), false);
  const again = liveFor(dataDir, site);
  try {
    site.visits.length = 0;
    assert.deepEqual(await createLogin({ live: again }).check(), LOGGED_IN, 'the same profile, opened again: still logged in');
    assert.deepEqual(site.visits.map((v) => v.url), [AMAZON_HOME], 'no login page, no password');
    assert.equal(again.profileDir, join(dataDir, 'amazon-profile'));
  } finally {
    await again.close();
  }

  // Without the box ticked, Amazon ends the login when the window closes, and nothing tries to keep it.
  const shortDir = newDataDir('short');
  const short = liveFor(shortDir, site);
  const shortLogin = createLogin({ live: short });
  await shortLogin.logIn();
  await personLogsIn(short, { keep: false });
  await until(() => shortLogin.view().state === 'in', 'logged in for this window only');
  shortLogin.close();
  await short.close();
  const reopened = liveFor(shortDir, site);
  try {
    assert.equal((await createLogin({ live: reopened }).check()).state, 'out');
  } finally {
    await reopened.close();
  }
});

test('Amazon ending the login later turns the top bar to "Not logged in"; a robot check or a block is said plainly, and nothing is got around', { timeout: 120_000 }, async () => {
  const site = fakeAmazon();
  const live = liveFor(newDataDir('later'), site);
  const login = createLogin({ live });
  try {
    await login.logIn();
    await personLogsIn(live);
    await until(() => login.view().state === 'in', 'logged in');
    // A password changed elsewhere: the next Amazon page a check opens is the login page.
    site.loggedOut = true;
    const page = await live.open('https://www.amazon.in/gp/customer-reviews/R1TESTROW02ABC');
    assert.match(page.facts.title, /Sign In/);
    assert.deepEqual(login.view(), { state: 'out', name: null, says: null });
    site.loggedOut = false;

    site.home = 'captcha';
    site.visits.length = 0;
    const robot = await login.check();
    assert.equal(robot.state, 'problem');
    assert.equal(robot.says, 'Amazon showed a robot check in the Live Amazon Browser window, so the login could not be checked. This dashboard never answers a robot check. Press "Check the login again" when you want to try again.');
    assert.deepEqual(site.visits.map((v) => v.url), [AMAZON_HOME], 'nothing more is opened');
    assert.equal(await live.page.inputValue('#captchacharacters'), '', 'nothing is typed into the robot check');
    site.home = 'blocked';
    assert.deepEqual(await login.check(), { state: 'problem', name: null, says: 'Amazon refused to show its page, so the login could not be checked. Wait a while, then press "Check the login again".' });
    site.home = 'page';
    assert.deepEqual(await login.check(), LOGGED_IN);
  } finally {
    login.close();
    await live.close();
  }
});

test('two asking at once open one window; a stop while it is still opening closes it properly too', { timeout: 60_000 }, async () => {
  const site = fakeAmazon();
  const dataDir = newDataDir('once');
  const live = liveFor(dataDir, site);
  await Promise.all([live.begin(), live.begin()]);
  assert.equal(live.launches, 1);
  await live.close();
  const early = liveFor(dataDir, site);
  const opening = early.begin();
  await early.close();
  await opening;
  assert.equal(early.isOpen(), false);
  assert.deepEqual(chromeUsing(join(dataDir, 'amazon-profile')), [], 'no Chrome left running');
  const prefs = JSON.parse(readFileSync(join(dataDir, 'amazon-profile', 'Default', 'Preferences'), 'utf8'));
  assert.equal(prefs.profile?.exit_type, 'Normal');
});

// ---- the dashboard itself, stopped the way Control+C stops it ----

/** The dashboard started as "npm start" does, in a separate process, with a made-up data folder and the pretend pages. */
function startDashboard(dataDir, extra = []) {
  const child = spawn(process.execPath, [join(HERE, 'fixtures', 'amazon', 'run-dashboard.mjs'), dataDir, ...extra], { stdio: ['pipe', 'pipe', 'inherit'] });
  const events = [];
  const waiting = [];
  const terminal = [];
  createInterface({ input: child.stdout }).on('line', (line) => {
    const e = JSON.parse(line);
    if (e.event === 'log') return terminal.push(e.says);
    events.push(e);
    for (const w of waiting.splice(0)) w();
  });
  let ended = null;
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve((ended = { code, signal }))));
  async function next(name, ms = 60_000) {
    const end = Date.now() + ms;
    for (;;) {
      const e = events.find((x) => x.event === name);
      if (e) return e;
      if (ended) throw new Error(`The dashboard stopped (${JSON.stringify(ended)}) before saying "${name}"`);
      if (Date.now() > end) throw new Error(`The dashboard did not say "${name}" in time`);
      await Promise.race([new Promise((r) => waiting.push(r)), sleep(200), exited]);
    }
  }
  return { child, next, exited, terminal, send: (line) => child.stdin.write(`${line}\n`) };
}
/** Chrome processes using this profile. */
function chromeUsing(profileDir) {
  return execFileSync('ps', ['-axww', '-o', 'command'], { encoding: 'utf8' })
    .split('\n')
    .filter((l) => l.includes(`--user-data-dir=${profileDir}`));
}
function exists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

test('stopping the dashboard the way Control+C does closes the browser properly; a login made just before is found by itself when it starts again, with no button pressed, even when Amazon’s first page after the restart shows no name', { timeout: 180_000 }, async () => {
  const dataDir = newDataDir('restart');
  const profile = join(dataDir, 'amazon-profile');
  const first = startDashboard(dataDir);
  try {
    const ready = await first.next('ready');
    assert.deepEqual(ready.login, { state: 'out', name: null, says: null }, 'checked by itself when the dashboard starts');
    assert.equal(chromeUsing(profile).length > 0, true, 'the Live Amazon Browser stays open for the checks');
    assert.equal(exists(join(profile, 'SingletonLock')), true, 'Chrome holds the profile while it runs');
    first.send('log-in');
    const logged = await first.next('logged-in');
    assert.deepEqual(logged.login, LOGGED_IN);
    assert.ok(logged.ms < 5000, `the login was noticed ${logged.ms} ms after it was made`);
    first.child.kill('SIGINT'); // what Control+C sends
    assert.deepEqual(await first.exited, { code: 0, signal: null });
  } finally {
    first.child.kill('SIGKILL');
  }
  assert.deepEqual(chromeUsing(profile), [], 'no Chrome is left running with the profile');
  const prefs = JSON.parse(readFileSync(join(profile, 'Default', 'Preferences'), 'utf8'));
  assert.equal(prefs.profile?.exit_type, 'Normal', 'Chrome closed properly, not forced shut');
  assert.equal(exists(join(profile, 'SingletonLock')), false, 'Chrome let go of the profile itself');

  // As happened after a real restart: Amazon's first page said no one was logged in; the next one showed the name.
  const second = startDashboard(dataDir, ['slow-start']);
  try {
    const ready = await second.next('ready');
    assert.deepEqual(ready.login, LOGGED_IN, 'still logged in after the restart: no button pressed, no password typed');
    assert.deepEqual(ready.visits, [AMAZON_HOME, AMAZON_HOME], "the home page showed no name, so it was opened once more; Amazon's login page was never opened");
    // What the check at start saw is written in the Terminal window: each page's address and the words of its account line.
    const lines = second.terminal.filter((l) => l.startsWith('Amazon login check, when the dashboard started'));
    assert.match(lines[0], /^Amazon login check, when the dashboard started: page 1: opened \(\d+ seconds after the Live Amazon Browser window opened\) https:\/\/www\.amazon\.in\/, titled "Amazon\.in", and its account line says "Hello, sign in"\.$/);
    assert.match(lines[1], /^Amazon login check, when the dashboard started: 2 seconds later, the account line says "Hello, sign in"\.$/);
    assert.match(lines[2], /^Amazon login check, when the dashboard started: page 2: opened .*its account line says "Hello, Test Staff"\.$/);
    assert.equal(lines.at(-1), 'Amazon login check, when the dashboard started: the top bar says logged in to Amazon.');
    second.child.kill('SIGINT');
    assert.deepEqual(await second.exited, { code: 0, signal: null });
  } finally {
    second.child.kill('SIGKILL');
  }
  assert.deepEqual(chromeUsing(profile), []);
  // The same lines are kept in the data folder, with the date and time, with each start and each stop.
  const kept = readFileSync(join(dataDir, 'login-log.txt'), 'utf8').trim().split('\n');
  assert.ok(kept.every((l) => /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2} /.test(l)), 'each line starts with the date and time');
  const said = kept.map((l) => l.slice(20));
  assert.equal(said.filter((l) => l === 'The dashboard started.').length, 2);
  assert.equal(said.filter((l) => l === 'The dashboard is stopping, so the Live Amazon Browser is being closed.').length, 2);
  assert.equal(said.filter((l) => l === 'The Live Amazon Browser was closed.').length, 2, 'closed in time, both times');
  assert.ok(said.includes('Amazon login check, when the dashboard started: the top bar says logged in to Amazon.'));
  assert.ok(said.some((l) => /^Amazon login check, when the dashboard started: page 1: opened .*"Hello, sign in"\.$/.test(l)), 'what the check at start saw, page by page');
  assert.doesNotMatch(kept.join('\n'), /password|test-password/i, 'never anything typed');
});
