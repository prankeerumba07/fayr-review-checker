// Sending an email through Gmail in the Live Amazon Browser: first with a
// pretend Live Amazon Browser (no browser at all), for every way it can end;
// then through the real Live Amazon Browser code, in a hidden Chrome with a
// made-up profile, answered by pretend Gmail pages (fixtures/amazon/
// fake-gmail.mjs): no host name resolves, every other address is refused,
// and nothing reaches Google. Gmail's page is opened empty, the email is
// written in its own fields with no key pressed (never put in the page's
// address, which Chrome would keep), and only its Send button is pressed.
// Run: node test/gmail.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LiveBrowser, createGate } from '../amazon/browsers.js';
import { composeUrl, gmailPageIs, createEmailSender, differs, EMAIL_PAUSE_SAYS, EMAIL_SAYS, readGmailPage } from '../amazon/gmail.js';
import { GMAIL_COMPOSE_URL } from '../amazon/links.js';
import { fakeGmail } from './fixtures/amazon/fake-gmail.mjs';
import { assertPlain } from './plain-words.mjs';

const dirs = [];
function newDataDir(name) {
  const d = mkdtempSync(join(tmpdir(), `arc-gmail-${name}-`));
  dirs.push(d);
  return d;
}
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

const EMAIL = {
  to: 'test.person@example.test',
  subject: 'Your order 403-1000002-2000002: please send the delivery screenshot',
  message: 'Hello Test Reviewer One,\n\nThis is about your order 403-1000002-2000002 for Test Brand Floor Cleaner.\n\nThe delivery screenshot was not added in the form, so we cannot see that the order was delivered.\n\nThank you,\nThe support team',
};
/** Gmail's page as the Live Amazon Browser reads it: the box of the new email, with the email written in it as it was on the screen. */
const COMPOSE = (over = {}) => ({ url: composeUrl(), title: 'New Message', forms: 1, compose: { to: EMAIL.to, chips: [], subject: EMAIL.subject, body: EMAIL.message.replace(/\s+/g, ' '), send: true, ...over }, sent: false, sending: false, undo: false, loginForm: false, refused: false, robot: false });
const SENT = { ...COMPOSE(), compose: null, sent: true, undo: true };
const DONE = { ...COMPOSE(), compose: null, sent: false, undo: false };
const terminal = [];
const outcomes = [];

/**
 * A stand-in for the Live Amazon Browser: what each read of Gmail's page
 * says, in turn, what was written in it, and what was pressed. write is what
 * each try at writing the email answers ('written', 'none' or 'failed'), or
 * a function of the try's number (from 1).
 */
function pretendLive({ lines = [], open = { ok: true, status: 200 }, begin = null, pressed = true, write = 'written' } = {}) {
  const live = { opened: [], pressed: 0, wanted: [], left: 0, window: true, reads: 0, writes: [] };
  live.writeGmail = async (email) => {
    live.writes.push(email);
    return typeof write === 'function' ? write(live.writes.length) : write;
  };
  live.begin = async () => {
    if (begin) throw begin;
    live.window = true;
  };
  live.isOpen = () => live.window;
  live.open = async (url, opts) => {
    live.opened.push(url);
    opts?.onWait?.(3000);
    return { ...open, url };
  };
  live.readGmail = async () => {
    const i = Math.min(live.reads, lines.length - 1);
    live.reads++;
    return lines[i] ?? null;
  };
  live.pressSend = async (wanted) => {
    live.pressed++;
    live.wanted.push(wanted);
    return pressed;
  };
  live.leave = async () => {
    live.left++;
  };
  return live;
}
const make = (live, google = null) => createEmailSender({ live, google, log: (m) => terminal.push(m), waitMs: 300, sentWaitMs: 300, settleMs: 200, pollMs: 20, goneGraceMs: 60 });
const send = async (live, email = EMAIL, opts = {}) => {
  const out = await make(live, opts.google).send(email, opts);
  outcomes.push(out.says);
  return out;
};

test("the address of Gmail's page for a new email holds nothing of the email: the page is opened empty, and the email is written in it", () => {
  const url = composeUrl();
  const u = new URL(url);
  assert.equal(`${u.origin}${u.pathname}`, GMAIL_COMPOSE_URL);
  assert.deepEqual([...u.searchParams.keys()], ['view', 'fs', 'tf'], 'no address, subject or words');
  assert.deepEqual([u.searchParams.get('view'), u.searchParams.get('fs'), u.searchParams.get('tf')], ['cm', '1', '1']);
  assert.equal(composeUrl(EMAIL), url, 'an email handed to it changes nothing');
  for (const part of ['test.person', '403-1000002-2000002', 'Reviewer']) assert.ok(!url.includes(part), part);
  assert.ok(url.startsWith('https://mail.google.com/mail/?'), 'the only Gmail page ever opened');
});

test('what kind of page Gmail gave: the page for a new email, a login page, a refusal, a robot check or a block', () => {
  assert.equal(gmailPageIs(COMPOSE()), 'compose');
  assert.equal(gmailPageIs({ ...COMPOSE(), compose: null }), 'other');
  assert.equal(gmailPageIs({ ...COMPOSE(), loginForm: true }), 'signin');
  assert.equal(gmailPageIs({ url: 'https://accounts.google.com/v3/signin/identifier?x', compose: null }), 'signin');
  assert.equal(gmailPageIs({ ...COMPOSE(), refused: true }), 'refused');
  assert.equal(gmailPageIs({ ...COMPOSE(), robot: true }), 'robot');
  assert.equal(gmailPageIs({ url: 'https://www.google.com/sorry/index?x', compose: null }), 'robot');
  assert.equal(gmailPageIs({ url: 'https://mail.google.com/mail/', compose: null }, 503), 'blocked');
  assert.equal(gmailPageIs({ url: 'https://mail.google.com/mail/', compose: null }, 429), 'blocked');
  assert.equal(gmailPageIs({ url: 'not a link' }), 'other');
  assert.equal(gmailPageIs(null), 'other');
});

test('which part of the page differs from the email on the screen: the address, the subject or the words; a signature after the words is fine', () => {
  assert.equal(differs(COMPOSE().compose, EMAIL), null);
  assert.equal(differs({ ...COMPOSE().compose, to: '', chips: [EMAIL.to] }, EMAIL), null, 'the address as a chip');
  assert.equal(differs({ ...COMPOSE().compose, body: `${EMAIL.message}\n\nTest Person\nSent from Test Gmail` }, EMAIL), null, "the account's own signature after the words");
  assert.equal(differs({ ...COMPOSE().compose, body: EMAIL.message.replace(/\n+/g, '  ') }, EMAIL), null, 'spaces and line breaks as Gmail shows them');
  assert.equal(differs({ ...COMPOSE().compose, to: 'someone.else@example.test' }, EMAIL), 'the address');
  assert.equal(differs({ ...COMPOSE().compose, subject: 'Another subject' }, EMAIL), 'the subject');
  assert.equal(differs({ ...COMPOSE().compose, body: 'Other words' }, EMAIL), 'the words');
  assert.equal(differs({ ...COMPOSE().compose, body: 'Hello Test Reviewer One, This is about your order' }, EMAIL), 'the words', 'cut short');
  assert.equal(differs({ ...COMPOSE().compose, body: `Something first. ${EMAIL.message}` }, EMAIL), 'the words', 'the words must come first');
  assert.equal(differs({ ...COMPOSE().compose, body: null }, EMAIL), 'the words');
  assert.equal(differs(null, EMAIL), 'the address');
});

test('with a pretend Live Amazon Browser: the email is written in the page once its box is there, and sent only when the page shows it as it was on the screen; Gmail is left once it has finished; every other way it can end is said plainly', async () => {
  // Sent: the page opened empty, the box drawn, the email written in it once, read until it shows the email, Send pressed in that box, "Message sent" with "Undo", then the toast gone: the window leaves Gmail.
  const fine = pretendLive({ lines: [{ ...COMPOSE(), compose: null }, COMPOSE({ to: '', subject: '', body: '' }), COMPOSE(), SENT, SENT, DONE] });
  const said = [];
  const out = await send(fine, EMAIL, { say: (s) => said.push(s) });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.match(out.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(fine.opened, [composeUrl()], "Gmail's page for a new email, opened empty: nothing of the email in its address");
  assert.deepEqual(fine.writes, [EMAIL], 'the email written in the page once, as it was on the screen');
  assert.deepEqual([fine.pressed, fine.left, fine.wanted], [1, 1, [{ subject: EMAIL.subject }]], "Send pressed once, in this email's own box, then the window leaves Gmail");
  assert.deepEqual(said, ["Opening Gmail's page for a new email in the Live Amazon Browser", 'Waiting 3 seconds before opening Gmail', 'Writing the email in Gmail', 'Pressing Send in Gmail', 'Gmail says the email was sent; waiting for it to finish']);
  assert.ok(fine.reads >= 6, 'the page was read until the toast had gone');
  // The toast that never goes: the window still leaves once the waiting time is up.
  const slowToast = pretendLive({ lines: [COMPOSE(), COMPOSE(), SENT] });
  assert.deepEqual([(await send(slowToast)).ok, slowToast.left], [true, 1]);
  // The words differ only in spaces and line breaks (as Gmail shows them), or the account's signature follows them: still the same email.
  for (const body of [EMAIL.message.replace(/\n+/g, '  '), `${EMAIL.message} Test Person Sent from Test Gmail`]) assert.equal((await send(pretendLive({ lines: [COMPOSE(), COMPOSE({ body }), SENT, DONE] }))).ok, true);
  // The address as a chip, not words in the box.
  assert.equal((await send(pretendLive({ lines: [COMPOSE(), COMPOSE({ to: '', chips: [EMAIL.to] }), SENT, DONE] }))).ok, true);
  // The box for a new email not there at first: the email is written once it is.
  const later = pretendLive({ lines: [COMPOSE(), COMPOSE(), COMPOSE(), COMPOSE(), SENT, DONE], write: (n) => (n < 3 ? 'none' : 'written') });
  assert.deepEqual([(await send(later)).ok, later.writes.length, later.pressed], [true, 3, 1]);
  // Not shown as it was on the screen, even after waiting: not sent, which part is said, and Gmail is left.
  for (const [over, part] of [[{ to: 'someone.else@example.test', chips: [] }, 'the address'], [{ subject: 'Another subject' }, 'the subject'], [{ body: 'Other words' }, 'the words'], [{ body: null }, 'the words']]) {
    const wrong = pretendLive({ lines: [COMPOSE(over)] });
    const r = await send(wrong);
    assert.deepEqual([r.ok, r.maybe, r.says, wrong.pressed, wrong.left, wrong.writes.length], [false, undefined, EMAIL_SAYS.different(part), 0, 1, 1], JSON.stringify(over));
  }
  assert.equal(EMAIL_SAYS.different('the words'), 'Gmail did not show the email as it was on the screen (the words were different), so it was not sent.');
  assert.equal(EMAIL_SAYS.different('the subject'), 'Gmail did not show the email as it was on the screen (the subject was different), so it was not sent.');
  // The email could not be written: the new email's box never came, or writing went wrong part way (then nothing more is written there). Not sent, and Gmail is left.
  const never = pretendLive({ lines: [COMPOSE()], write: 'none' });
  const n = await send(never);
  assert.deepEqual([n.ok, n.says, never.pressed, never.left], [false, EMAIL_SAYS.noFields, 0, 1]);
  assert.ok(never.writes.length > 1, 'tried again while the box was waited for');
  const broke = pretendLive({ lines: [COMPOSE()], write: 'failed' });
  const b = await send(broke);
  assert.deepEqual([b.ok, b.says, broke.pressed, broke.left, broke.writes.length], [false, EMAIL_SAYS.noFields, 0, 1, 1]);
  // A login page, a robot check, a block or a refusal: sending stops, nothing is written there, and the top bar is told about the login.
  let loggedOut = 0;
  const google = { loggedOut: () => loggedOut++ };
  const loginPage = pretendLive({ lines: [{ ...COMPOSE(), compose: null, loginForm: true }] });
  const signIn = await send(loginPage, EMAIL, { google });
  assert.deepEqual(signIn, { ok: false, pause: 'google-signin', says: EMAIL_PAUSE_SAYS['google-signin'] });
  assert.deepEqual(loginPage.writes, [], 'nothing is written in a login page');
  assert.equal(loggedOut, 1, 'the saved Google login has ended, so the top bar says so');
  assert.deepEqual(await send(pretendLive({ lines: [{ ...COMPOSE(), compose: null, robot: true }] })), { ok: false, pause: 'google-robot', says: EMAIL_PAUSE_SAYS['google-robot'] });
  assert.deepEqual(await send(pretendLive({ lines: [{ ...COMPOSE(), compose: null }], open: { ok: true, status: 503 } })), { ok: false, pause: 'google-blocked', says: EMAIL_PAUSE_SAYS['google-blocked'] });
  assert.deepEqual(await send(pretendLive({ lines: [{ ...COMPOSE(), compose: null, refused: true }] })), { ok: false, pause: 'google-refused', says: EMAIL_PAUSE_SAYS['google-refused'] });
  // Gmail never shows the page for a new email, or its Send button is not there or cannot be pressed: not sent, and Gmail is left.
  const blank = pretendLive({ lines: [{ ...COMPOSE(), compose: null }] });
  assert.deepEqual([(await send(blank)).says, blank.left], [EMAIL_SAYS.noCompose, 1]);
  assert.equal((await send(pretendLive({ lines: [COMPOSE({ send: false })] }))).says, EMAIL_SAYS.noSend);
  assert.equal((await send(pretendLive({ lines: [COMPOSE()], pressed: false }))).says, EMAIL_SAYS.noSend);
  // Send pressed, but Gmail never says "Message sent": maybe sent, never "not sent". The box staying, or the box gone without a word.
  const quiet = pretendLive({ lines: [COMPOSE()] });
  const q = await send(quiet);
  assert.deepEqual([q.ok, q.maybe, q.says, quiet.pressed, quiet.left], [false, true, EMAIL_SAYS.maybe, 1, 1]);
  assert.match(EMAIL_SAYS.maybe, /^Send was pressed, but Gmail did not say the email was sent, so it may or may not have gone\. Look in your Sent emails/);
  const gone = pretendLive({ lines: [COMPOSE(), COMPOSE(), { ...COMPOSE(), compose: null }] });
  const g = await send(gone);
  assert.deepEqual([g.ok, g.maybe, gone.pressed, gone.left], [false, true, 1, 1]);
  // Still sending when the box goes: waited for, then "Message sent".
  const slowSend = pretendLive({ lines: [COMPOSE(), COMPOSE(), { ...COMPOSE(), compose: null, sending: true }, { ...COMPOSE(), compose: null, sending: true }, SENT, DONE] });
  assert.equal((await send(slowSend)).ok, true);
  // A login page or a robot check once the email is written, before Send: sending stops, and nothing was sent.
  assert.deepEqual(await send(pretendLive({ lines: [COMPOSE(), { ...COMPOSE(), compose: null, loginForm: true }] }), EMAIL, { google }), { ok: false, pause: 'google-signin', says: EMAIL_PAUSE_SAYS['google-signin'] });
  // A login page or a robot check right after Send: sending stops, and this email may have gone.
  const lateSignIn = await send(pretendLive({ lines: [COMPOSE(), COMPOSE(), { ...COMPOSE(), compose: null, loginForm: true }] }), EMAIL, { google });
  assert.deepEqual(lateSignIn, { ok: false, pause: 'google-signin', says: EMAIL_PAUSE_SAYS['google-signin'], maybe: true });
  assert.deepEqual(await send(pretendLive({ lines: [COMPOSE(), COMPOSE(), { ...COMPOSE(), compose: null, robot: true }] })), { ok: false, pause: 'google-robot', says: EMAIL_PAUSE_SAYS['google-robot'], maybe: true });
  // The window could not be opened, was closed, or Gmail could not be reached.
  assert.equal((await send(pretendLive({ begin: new Error('no Chrome') }))).says, EMAIL_SAYS.launch);
  assert.equal((await send(pretendLive({ open: { ok: false, error: 'closed' } }))).says, EMAIL_SAYS.closed);
  assert.equal((await send(pretendLive({ open: { ok: false, error: 'timeout' } }))).says, EMAIL_SAYS.timeout);
  assert.equal((await send(pretendLive({ open: { ok: false, error: 'network' } }))).says, EMAIL_SAYS.network);
  // Stopped before Send was pressed: not sent. Before Gmail is opened, and while the box is waited for.
  const early = new AbortController();
  early.abort();
  const stopped = pretendLive({ lines: [COMPOSE()] });
  const r = await send(stopped, EMAIL, { signal: early.signal });
  assert.deepEqual([r.ok, r.says, stopped.pressed, stopped.opened.length], [false, EMAIL_SAYS.stopped, 0, 0]);
  const late = new AbortController();
  setTimeout(() => late.abort(), 60);
  const waiting = pretendLive({ lines: [{ ...COMPOSE(), compose: null }] });
  const w = await send(waiting, EMAIL, { signal: late.signal });
  assert.deepEqual([w.ok, w.says, waiting.pressed, waiting.left, waiting.writes.length], [false, EMAIL_SAYS.stopped, 0, 1, 0]);
  // Stopped once the email is written, before Send: not sent.
  const stopNow = new AbortController();
  const written = pretendLive({ lines: [COMPOSE()], write: () => (stopNow.abort(), 'written') });
  const s = await send(written, EMAIL, { signal: stopNow.signal });
  assert.deepEqual([s.ok, s.says, written.pressed, written.left], [false, EMAIL_SAYS.stopped, 0, 1]);
});

// ---- the real Live Amazon Browser code, in a hidden Chrome, with pretend Gmail pages ----

function liveFor(dataDir, site) {
  return new LiveBrowser({ dataDir, labelUrl: 'data:text/html,<title>Live Amazon Browser</title>', headless: true, routes: site.handler, gate: createGate({ gapMs: 200 }) });
}
const sender = (live, over = {}) => createEmailSender({ live, log: (m) => terminal.push(m), waitMs: 6000, sentWaitMs: 6000, settleMs: 4000, pollMs: 100, goneGraceMs: 500, ...over });

/** Which files in a folder (and the folders in it) hold each of these words, as Chrome may keep them: [word]: [file, ...]. */
function keptIn(dir, words) {
  const found = Object.fromEntries(words.map((w) => [w, []]));
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      let info;
      try {
        info = statSync(path);
      } catch {
        continue;
      }
      if (info.isDirectory()) walk(path);
      else if (info.size <= 50 * 1024 * 1024) {
        let data;
        try {
          data = readFileSync(path);
        } catch {
          continue;
        }
        for (const w of words) if (data.includes(Buffer.from(w, 'utf8')) || data.includes(Buffer.from(w, 'utf16le'))) found[w].push(path.slice(dir.length + 1));
      }
    }
  };
  walk(dir);
  return found;
}

test("in a hidden Chrome: Gmail's page for a new email is opened empty, the email written in that email's own fields with no key pressed, the page read until it shows the email, and its Send button pressed in that email's own box; what Gmail sends is the email as it was on the screen; the window leaves Gmail once it has finished", { timeout: 180_000 }, async () => {
  const site = fakeGmail();
  site.slowMs = 300;
  site.slowChipMs = 400;
  const live = liveFor(newDataDir('send'), site);
  try {
    await live.begin();
    const out = await sender(live).send(EMAIL);
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.deepEqual(site.visits.map((v) => v.url), [composeUrl()], 'one page: the page for a new email, opened empty');
    assert.deepEqual(site.sent, [{ to: EMAIL.to, subject: EMAIL.subject, body: EMAIL.message }], 'what Gmail sent: the email, word for word, with its line breaks');
    assert.equal(live.page.url(), 'about:blank', 'the window left Gmail');
    // An older email's box left open on the page, and the account's own signature: still this email, written in and sent from its own box.
    site.slowMs = 0;
    site.slowChipMs = 0;
    site.twoForms = true;
    site.signature = true;
    const again = await sender(live).send(EMAIL);
    assert.equal(again.ok, true, JSON.stringify(again));
    const last = site.sent.at(-1);
    assert.deepEqual([last.to, last.subject], [EMAIL.to, EMAIL.subject], "this email's own box was sent, to this email's address only");
    assert.ok(last.body.startsWith(EMAIL.message), 'the words first, word for word');
    assert.ok(last.body.endsWith('Test Person\nSent from Test Gmail'), 'then the signature Gmail had put there');
    assert.equal(site.sent.length, 2, "the older email's box was never sent");
    // The cursor not in the address field: the field is found by Gmail's label for it.
    site.twoForms = false;
    site.signature = false;
    site.noCursor = true;
    assert.equal((await sender(live).send(EMAIL)).ok, true);
    assert.deepEqual(site.sent.at(-1), { to: EMAIL.to, subject: EMAIL.subject, body: EMAIL.message });
    site.noCursor = false;
    // Written without sending: only the new email's box gets the email, and the older box keeps its own; a box already written in is never written in again.
    site.twoForms = true;
    site.signature = true;
    await live.page.goto(composeUrl());
    await live.page.waitForSelector('input[name="subjectbox"]');
    assert.equal(await live.writeGmail(EMAIL), 'written');
    await live.page.waitForFunction(() => document.querySelectorAll('input[name="to"]')[1]?.value !== '');
    const boxes = await live.page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map((b) => ({ to: b.querySelector('input[name="to"]').value, subject: b.querySelector('input[name="subjectbox"]').value, body: b.querySelector('[aria-label="Message Body"]').textContent })));
    assert.deepEqual(boxes[0], { to: 'older.person@example.test', subject: 'An older email left open', body: 'Older words that must not go.' }, 'the older box is left as it was');
    assert.deepEqual([boxes[1].to, boxes[1].subject], [EMAIL.to, EMAIL.subject]);
    assert.equal(await live.writeGmail(EMAIL), 'none', 'no empty box is left to write in');
    // What is read from Gmail's page: only the new email's fields (of the box asked for) and what kind of page it is.
    const line = await live.readGmail({ subject: EMAIL.subject });
    assert.deepEqual(Object.keys(line).sort(), ['compose', 'forms', 'loginForm', 'refused', 'robot', 'sending', 'sent', 'title', 'undo', 'url']);
    assert.deepEqual([line.forms, line.compose.to, line.compose.subject, line.compose.send, line.sent, line.undo], [2, EMAIL.to, EMAIL.subject, true, false, false]);
    assert.equal(line.compose.body, `${EMAIL.message} Test Person Sent from Test Gmail`.replace(/\s+/g, ' '));
    assert.equal((await live.readGmail()).compose.subject, 'An older email left open', 'with no box asked for, the first box');
    assert.equal(await live.page.evaluate(readGmailPage, { subject: EMAIL.subject }).then((l) => l.compose.subject), EMAIL.subject);
    // After Send: this email's box is gone (the older one is still there), and "Message sent" with "Undo" shows for a moment, then goes.
    await live.pressSend({ subject: EMAIL.subject });
    const toast = await live.readGmail({ subject: EMAIL.subject });
    assert.deepEqual([toast.sent, toast.undo, toast.forms, toast.compose.subject], [true, true, 1, 'An older email left open']);
    await live.page.waitForSelector('#after[hidden]', { state: 'attached' });
    const over = await live.readGmail({ subject: EMAIL.subject });
    assert.deepEqual([over.sent, over.undo], [false, false]);
    // The Send button is pressed, and the email written, only on a Gmail page, never elsewhere.
    await live.page.goto('about:blank');
    assert.equal(await live.pressSend({ subject: EMAIL.subject }), false);
    assert.equal(await live.writeGmail(EMAIL), 'none');
  } finally {
    await live.close();
  }
});

test("in a hidden Chrome: once an email is sent, or written but not sent, nothing of it (the address, the order ID in its subject, its words) is kept in the Live Amazon Browser's profile: not in its history, its saved tabs or anywhere else", { timeout: 180_000 }, async () => {
  const site = fakeGmail();
  const dataDir = newDataDir('kept');
  const live = liveFor(dataDir, site);
  try {
    await live.begin();
    // A page whose address holds a made-up mark, to show that the search below finds what Chrome keeps of the pages it opened.
    await live.open(`${composeUrl()}&mark=made-up-mark-4242`);
    const out = await sender(live).send(EMAIL);
    assert.equal(out.ok, true, JSON.stringify(out));
    // Written, but Gmail lost the words: not sent, and the page is left with the address and the subject still in it.
    site.dropBody = true;
    const notSent = await sender(live, { waitMs: 1500 }).send(EMAIL);
    assert.deepEqual([notSent.ok, notSent.says, site.sent.length], [false, EMAIL_SAYS.different('the words'), 1]);
  } finally {
    await live.close();
  }
  const words = ['test.person', '403-1000002-2000002', '4031000002', 'Test Reviewer One', 'Test+Reviewer+One', 'Test%20Reviewer', 'Floor Cleaner', 'Floor+Cleaner', 'Floor%20Cleaner'];
  const kept = keptIn(join(dataDir, 'amazon-profile'), ['made-up-mark-4242', ...words]);
  assert.ok(kept['made-up-mark-4242'].length > 0, 'Chrome keeps the address of a page it opened, and the search finds it');
  for (const w of words) assert.deepEqual(kept[w], [], `"${w}" is kept in the profile`);
});

test('in a hidden Chrome: a login form, a refusal, a robot check, a block, a page that lost the words written in it, a page with two empty boxes for a new email, and Gmail not saying "Message sent": nothing is written in a login form, nothing is said to be sent that was not, and the window leaves Gmail', { timeout: 180_000 }, async () => {
  const site = fakeGmail();
  const live = liveFor(newDataDir('stops'), site);
  const send = () => sender(live).send(EMAIL);
  try {
    await live.begin();
    site.signIn = true;
    assert.deepEqual((await send()).pause, 'google-signin');
    assert.equal(await live.page.inputValue('#identifierId'), '', 'nothing is written in a login form');
    assert.equal(await live.writeGmail(EMAIL), 'none', 'not even when asked');
    assert.equal(await live.page.inputValue('#identifierId'), '');
    site.signIn = false;
    site.refuse = true;
    assert.deepEqual((await send()).pause, 'google-refused');
    site.refuse = false;
    site.robot = true;
    assert.deepEqual((await send()).pause, 'google-robot');
    site.robot = false;
    site.blocked = true;
    assert.deepEqual((await send()).pause, 'google-blocked');
    site.blocked = false;
    site.dropBody = true;
    const r = await send();
    assert.deepEqual([r.ok, r.maybe, r.says], [false, undefined, EMAIL_SAYS.different('the words')]);
    assert.equal(site.sent.length, 0, 'Send was never pressed');
    assert.equal(live.page.url(), 'about:blank', 'the window left Gmail');
    site.dropBody = false;
    // Two empty boxes for a new email: neither can be told to be this email's, so nothing is written in either, and nothing is sent.
    site.twoNew = true;
    await live.page.goto(composeUrl());
    await live.page.waitForSelector('input[name="subjectbox"]');
    assert.equal(await live.writeGmail(EMAIL), 'none');
    const untouched = await live.page.evaluate(() => [...document.querySelectorAll('input[name="subjectbox"], input[aria-label="To recipients"], input[name="to"]')].every((e) => e.value === '') && [...document.querySelectorAll('[aria-label="Message Body"]')].every((e) => e.textContent === ''));
    assert.equal(untouched, true, 'both boxes are still empty');
    const two = await sender(live, { waitMs: 1500 }).send(EMAIL);
    assert.deepEqual([two.ok, two.says, site.sent.length, live.page.url()], [false, EMAIL_SAYS.noFields, 0, 'about:blank']);
    site.twoNew = false;
    site.noSentWord = true;
    const quiet = await send();
    assert.deepEqual([quiet.ok, quiet.maybe, quiet.says], [false, true, EMAIL_SAYS.maybe], 'maybe sent, never "not sent"');
    assert.equal(site.sent.length, 1, 'Send was pressed once there (Gmail just did not say so)');
    assert.equal(live.page.url(), 'about:blank');
  } finally {
    await live.close();
  }
});

test('every sentence the sender says is plain', () => {
  const texts = [...terminal, ...outcomes, ...Object.values(EMAIL_PAUSE_SAYS), ...Object.values(EMAIL_SAYS).map((s) => (typeof s === 'function' ? s('the words') : s))].filter((t) => typeof t === 'string' && t);
  assert.ok(texts.length > 10);
  assertPlain(assert, texts, 'the sender');
  assert.doesNotMatch(texts.join('\n'), /transaction/i);
});
