// Sending an email through Gmail, in the Live Amazon Browser, with the
// Google login already saved there: Gmail's page for writing a new email is
// opened empty, and the address, the subject and the words are written in
// that email's own fields, with no key pressed. They are never put in the
// page's address, which Chrome would keep in the window's history (and in its
// saved tabs) on this computer. The page is read until it shows the email as
// the staff member saw it, and then Gmail's Send button is pressed, in that
// email's own box. Then the page is read until Gmail says "Message sent", and
// the window stays until Gmail has finished (its "Undo" time) before it
// leaves Gmail. When Gmail does not say the email was sent, the email is
// "maybe sent": it may or may not have gone, and the staff member is told to
// look in their Sent emails. Nothing else in Gmail is ever opened, read or
// changed. A login page, a robot check or a block stops the sending and is
// said plainly; nothing is got around, and nothing is written there.
// readGmailPage(), gmailFields() and gmailSendButton() run INSIDE the page
// (Playwright's page.evaluate), so they are self-contained and only read.

import { GMAIL_COMPOSE_URL } from './links.js';

/** How long Gmail is given to show the page for a new email, and then to show the email written in it as it was on the screen. */
export const GMAIL_WAIT_MS = 30_000;
/** How long Gmail is given, after Send is pressed, to say "Message sent". */
export const GMAIL_SENT_WAIT_MS = 30_000;
/** How long the window stays on Gmail after "Message sent", for Gmail to finish sending (its "Undo" time), before it leaves. */
export const GMAIL_SETTLE_MS = 35_000;
/** Once the box of the new email is gone without a word from Gmail, how much longer the page is read for "Message sent". */
const GONE_GRACE_MS = 3000;
const POLL_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The address of Gmail's page for writing a new email, opened empty: nothing of the email is ever in it. */
export function composeUrl() {
  const u = new URL(GMAIL_COMPOSE_URL);
  u.search = new URLSearchParams({ view: 'cm', fs: '1', tf: '1' }).toString();
  return u.href;
}

/* eslint-disable no-var */
/**
 * What Gmail's page shows, read INSIDE the page: the fields of the new email
 * (the address, the subject and the words, and whether its Send button is
 * there), how many boxes for a new email the page has (Gmail can bring back
 * an older one beside it; the one whose subject is `wanted.subject` is
 * read), whether Gmail says "Message sent", is still sending, or still
 * offers "Undo", and whether the page is a login page, Google refusing this
 * window, or a robot check. Never anything else on the page: no other
 * email, no list, no name.
 */
export function readGmailPage(wanted) {
  var squash = function (s) {
    return (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
  };
  var list = function (nodes) {
    return Array.prototype.slice.call(nodes || []);
  };
  var want = wanted && typeof wanted === 'object' ? squash(wanted.subject).toLowerCase() : '';
  var SUBJECT = 'input[name="subjectbox"], input[name="subject"]';
  var TO = 'textarea[name="to"], input[name="to"]';
  var BODY = 'div[aria-label="Message Body"], div[g_editable="true"][role="textbox"], textarea[name="body"]';
  var SEND = 'div[role="button"][aria-label^="Send"], button[aria-label^="Send"], [data-tooltip^="Send"]';
  var CHIPS = '[role="option"][data-hovercard-id], div[aria-label="To"] [email], [name="to"] ~ * [email]';
  // The box of one new email: from its subject field up to the nearest ancestor that also holds its Send button and its address field.
  var boxOf = function (el) {
    var node = el;
    for (var i = 0; node && i < 20; i++) {
      if (node.querySelector && node.querySelector(SEND) && node.querySelector(TO)) return node;
      node = node.parentElement;
    }
    return document;
  };
  // Only what is on the screen counts: a box Gmail has hidden is gone, and a hidden "Message sent" is not one.
  var shown = function (e) {
    return e.getClientRects().length > 0;
  };
  var subjects = list(document.querySelectorAll(SUBJECT)).filter(shown);
  var pick = null;
  for (var k = 0; k < subjects.length && !pick; k++) if (want && squash(subjects[k].value).toLowerCase() === want) pick = subjects[k];
  if (!pick && subjects.length) pick = subjects[0];
  var root = pick ? boxOf(pick) : document;
  var first = function (sel) {
    return list(root.querySelectorAll(sel)).filter(shown)[0] || null;
  };
  // Gmail keeps the address in a field it may hide behind the address chips: that field counts even when hidden.
  var to = root.querySelector(TO);
  var chips = list(root.querySelectorAll(CHIPS))
    .map(function (e) {
      return squash(e.getAttribute('email') || e.getAttribute('data-hovercard-id'));
    })
    .filter(Boolean);
  var subject = pick || first(SUBJECT);
  var body = first(BODY);
  var send = first(SEND);
  var compose = null;
  if (to || subject || body) {
    compose = {
      to: to ? squash(to.value) : chips.join(', '),
      chips: chips,
      subject: subject ? squash(subject.value) : null,
      body: body ? squash(body.value !== undefined && body.tagName === 'TEXTAREA' ? body.value : body.innerText || body.textContent) : null,
      send: Boolean(send),
    };
  }
  // Gmail's own short messages (its alert strip), then the page's words: only looked at for these few phrases.
  var alerts = squash(
    list(document.querySelectorAll('[role="alert"], [aria-live]'))
      .filter(shown)
      .map(function (e) {
        return e.innerText;
      })
      .join(' '),
  );
  var text = squash(document.body ? String(document.body.innerText || '') : '');
  var undo = list(document.querySelectorAll('[role="button"], button, span, a')).some(function (e) {
    return squash(e.textContent).toLowerCase() === 'undo' && shown(e);
  });
  return {
    url: location.href,
    title: squash(document.title),
    forms: subjects.length,
    compose: compose,
    sent: /message sent|your message has been sent/i.test(alerts) || /message sent|your message has been sent/i.test(text),
    sending: /\b(?:sending|still working)\b/i.test(alerts),
    undo: undo,
    loginForm: Boolean(document.querySelector('#identifierId, input[type="email"], input[type="password"], input[name="identifier"], input[name="Passwd"]')),
    refused: /may not be secure|couldn.t sign you in|this browser or app/i.test(text),
    robot: /unusual traffic|not a robot|verify (?:that )?you.re (?:not a robot|human)|type the characters/i.test(text),
  };
}

/**
 * Gmail's Send button, found INSIDE the page: the one in the box of the new
 * email whose subject is `wanted.subject` (else the first box). Null when
 * there is none. The only thing the Live Amazon Browser ever presses.
 */
export function gmailSendButton(wanted) {
  var squash = function (s) {
    return (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
  };
  var want = wanted && typeof wanted === 'object' ? squash(wanted.subject).toLowerCase() : '';
  var SUBJECT = 'input[name="subjectbox"], input[name="subject"]';
  var TO = 'textarea[name="to"], input[name="to"]';
  var SEND = 'div[role="button"][aria-label^="Send"], button[aria-label^="Send"], [data-tooltip^="Send"]';
  var shown = function (e) {
    return e.getClientRects().length > 0;
  };
  var subjects = Array.prototype.slice.call(document.querySelectorAll(SUBJECT)).filter(shown);
  var pick = null;
  for (var k = 0; k < subjects.length && !pick; k++) if (want && squash(subjects[k].value).toLowerCase() === want) pick = subjects[k];
  if (!pick && subjects.length) pick = subjects[0];
  var root = document;
  if (pick) {
    var node = pick;
    for (var i = 0; node && i < 20; i++) {
      if (node.querySelector && node.querySelector(SEND) && node.querySelector(TO)) {
        root = node;
        break;
      }
      node = node.parentElement;
    }
  }
  return Array.prototype.slice.call(root.querySelectorAll(SEND)).filter(shown)[0] || null;
}

/**
 * Where the email is written, found INSIDE the page: the fields of the new
 * email's box, { to, subject, body }, or null. The new email's box is the
 * one box whose subject is still empty: with none, or with more than one,
 * nothing is written. Its address field is the one Gmail put the cursor in
 * (as it does for a new email), else the one Gmail names for the address; a
 * field Gmail has hidden is never used. A box that cannot be told apart from
 * the rest of the page is used only when it is the page's one box.
 */
export function gmailFields() {
  var squash = function (s) {
    return (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
  };
  var list = function (nodes) {
    return Array.prototype.slice.call(nodes || []);
  };
  var SUBJECT = 'input[name="subjectbox"], input[name="subject"]';
  var TO = 'textarea[name="to"], input[name="to"]';
  var BODY = 'div[aria-label="Message Body"], div[g_editable="true"][role="textbox"], textarea[name="body"]';
  var SEND = 'div[role="button"][aria-label^="Send"], button[aria-label^="Send"], [data-tooltip^="Send"]';
  // The field for the address, best first: by Gmail's own label for it, by its name, then by the kind of field it is.
  var ADDRESS = ['input[aria-label="To recipients"], input[aria-label="To"], textarea[aria-label="To"]', 'textarea[name="to"], input[name="to"]', 'input[peoplekit-id], input[role="combobox"]'];
  var shown = function (e) {
    return e.getClientRects().length > 0;
  };
  var subjects = list(document.querySelectorAll(SUBJECT)).filter(shown);
  var empty = subjects.filter(function (s) {
    return !squash(s.value);
  });
  if (empty.length !== 1) return null;
  var subject = empty[0];
  // A field the address can be written in: shown, open to writing, one line of words, and not a subject.
  var writable = function (e) {
    if (!e || !e.tagName || subjects.indexOf(e) >= 0 || e.disabled || e.readOnly || !shown(e)) return false;
    if (e.tagName === 'TEXTAREA') return true;
    return e.tagName === 'INPUT' && ['', 'text', 'email'].indexOf(String(e.getAttribute('type') || '').toLowerCase()) >= 0;
  };
  var firstIn = function (root, sel) {
    return list(root.querySelectorAll(sel)).filter(writable)[0] || null;
  };
  // The box of the new email: from its subject up to the nearest ancestor that also holds a Send button and a field for the address.
  var box = null;
  var node = subject.parentElement;
  for (var i = 0; node && i < 20 && !box; i++) {
    if (node.querySelector(SEND) && (node.querySelector(TO) || ADDRESS.some(function (sel) { return firstIn(node, sel); }))) box = node;
    node = node.parentElement;
  }
  if (!box && subjects.length > 1) return null;
  var root = box || document;
  var active = document.activeElement;
  var to = writable(active) && root.contains(active) ? active : null;
  for (var k = 0; k < ADDRESS.length && !to; k++) to = firstIn(root, ADDRESS[k]);
  var body = list(root.querySelectorAll(BODY)).filter(shown)[0] || null;
  return to && body ? { to: to, subject: subject, body: body } : null;
}
/* eslint-enable no-var */

/**
 * What kind of page Gmail gave: 'compose' (the page for a new email, with
 * its fields), 'signin', 'refused', 'robot', 'blocked', or 'other'.
 */
export function gmailPageIs(line, status = null) {
  let host = '';
  let path = '';
  try {
    const u = new URL(String(line?.url ?? ''));
    host = u.hostname;
    path = u.pathname;
  } catch {
    return 'other';
  }
  if (line?.robot || /^\/sorry\//.test(path)) return 'robot';
  if (line?.refused) return 'refused';
  if (host === 'accounts.google.com' || line?.loginForm) return 'signin';
  if ([403, 429, 503].includes(status)) return 'blocked';
  if (host === 'mail.google.com' && line?.compose) return 'compose';
  return 'other';
}

/** What stops the sending, and what to do, in one plain sentence each. */
export const EMAIL_PAUSE_SAYS = {
  'google-signin': 'Gmail asked you to log in, so sending stopped. Press "Log in to Google" in the top bar and log in there, then press Send again.',
  'google-robot': 'Google showed a robot check, so sending stopped. This dashboard never answers a robot check. Press Send again when you are ready.',
  'google-blocked': 'Google refused to show Gmail just now, so sending stopped. Wait a while, then press Send again.',
  'google-refused': 'Google would not open Gmail inside the Live Amazon Browser window, so sending stopped. Nothing was got around.',
};
/** Why an email was not sent (nothing was pressed), or may not have been sent (Send was pressed, but Gmail did not say it went). */
export const EMAIL_SAYS = {
  launch: 'The Live Amazon Browser could not be opened on this computer, so the email was not sent.',
  closed: 'The Live Amazon Browser window was closed, so the email was not sent.',
  timeout: 'Gmail took too long to open, so the email was not sent.',
  network: 'Gmail could not be reached, so the email was not sent. Check that this computer is online.',
  noCompose: 'Gmail did not show its page for writing a new email, so the email was not sent.',
  noFields: "The email could not be written in Gmail's page for a new email, so it was not sent.",
  different: (what) => `Gmail did not show the email as it was on the screen (${what} ${what === 'the words' ? 'were' : 'was'} different), so it was not sent.`,
  noSend: "Gmail's Send button could not be pressed, so the email was not sent.",
  maybe: 'Send was pressed, but Gmail did not say the email was sent, so it may or may not have gone. Look in your Sent emails before sending it again.',
  stopped: 'Sending was stopped, so the email was not sent.',
};

const same = (a, b) => String(a ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
/** The words of a message, without the line breaks and extra spaces Gmail may change. */
const wordsOf = (t) => String(t ?? '').replace(/[​ ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Which part of the page's fields differs from the email the staff member
 * saw: 'the address', 'the subject' or 'the words'; null when none does.
 * Gmail may add the account's own signature after the words, which is fine:
 * the words themselves must all be there, in their order.
 */
export function differs(compose, email) {
  const to = String(email?.to ?? '').trim().toLowerCase();
  const toOk = to && (String(compose?.to ?? '').toLowerCase().includes(to) || (compose?.chips ?? []).some((c) => String(c).toLowerCase() === to));
  if (!toOk) return 'the address';
  if (!same(compose?.subject, email?.subject)) return 'the subject';
  const words = wordsOf(email?.message);
  if (!words || !wordsOf(compose?.body).startsWith(words)) return 'the words';
  return null;
}

/**
 * live - the LiveBrowser (begin, open, readGmail, writeGmail, pressSend, leave).
 * google - the Google login (loggedOut), told when Gmail asks to log in.
 * log(words) - writes a line in the Terminal window (nothing by default).
 * -> { send(email, { signal, say }) }:
 *   { ok: true, at } when Gmail said the email was sent;
 *   { ok: false, maybe: true, says } when Send was pressed but Gmail did not say so (it may have gone);
 *   { ok: false, pause, says } when a login page, a robot check or a block stopped it (nothing more should be sent now; with maybe: true when Send had been pressed);
 *   { ok: false, says } when nothing was pressed. Never throws.
 */
export function createEmailSender({ live, google = null, log = () => {}, now = () => new Date(), waitMs = GMAIL_WAIT_MS, sentWaitMs = GMAIL_SENT_WAIT_MS, settleMs = GMAIL_SETTLE_MS, pollMs = POLL_MS, goneGraceMs = GONE_GRACE_MS }) {
  const tell = (words) => log(`Email: ${words}`);

  /** Gmail's page read until it shows what is waited for, or the time is up (or sending is stopped, when a signal is given). */
  async function readUntil(test, limit, signal, wanted) {
    const end = Date.now() + limit;
    let line = await live.readGmail(wanted);
    while (!test(line) && Date.now() < end && !signal?.aborted) {
      await sleep(pollMs);
      line = await live.readGmail(wanted);
    }
    return line;
  }

  /**
   * Gmail's page read until the box for a new email is there, and the email
   * then written in it, once: { line, wrote }, wrote being 'written', 'none'
   * (the box never came, the page is one that stops the sending, or sending
   * was stopped) or 'failed' (writing went wrong part way, so nothing more is
   * written on this page).
   */
  async function writeWhenDrawn(email, signal, say, stops) {
    const end = Date.now() + waitMs;
    let told = false;
    for (;;) {
      const line = await live.readGmail(null);
      if (stops(line)) return { line, wrote: 'none' };
      if (line?.compose && !signal?.aborted) {
        if (!told) say('Writing the email in Gmail');
        told = true;
        const wrote = await live.writeGmail(email);
        if (wrote !== 'none') return { line, wrote };
      }
      if (signal?.aborted || Date.now() >= end) return { line, wrote: 'none' };
      await sleep(pollMs);
    }
  }

  /** After Send: read until Gmail says "Message sent" (or asks to log in, or shows a robot check); a box gone without a word is given a little longer, then that is that. */
  async function readAfterSend(wanted) {
    const end = Date.now() + sentWaitMs;
    let goneSince = null;
    let line = await live.readGmail(wanted);
    for (;;) {
      if (line && (line.sent || line.loginForm || line.robot)) return line;
      const gone = line && !line.compose && !line.sending;
      if (gone && goneSince === null) goneSince = Date.now();
      if (!gone) goneSince = null;
      if (Date.now() >= end || (goneSince !== null && Date.now() - goneSince >= goneGraceMs)) return line;
      await sleep(pollMs);
      line = await live.readGmail(wanted);
    }
  }

  async function send(email, { signal = null, say = () => {} } = {}) {
    const wanted = { subject: String(email?.subject ?? '') };
    const pause = (kind, extra = {}) => {
      if (kind === 'google-signin') google?.loggedOut?.();
      tell(EMAIL_PAUSE_SAYS[kind]);
      return { ok: false, pause: kind, says: EMAIL_PAUSE_SAYS[kind], ...extra };
    };
    const fail = async (says) => {
      tell(says);
      await live.leave?.();
      return { ok: false, says };
    };
    if (signal?.aborted) return { ok: false, says: EMAIL_SAYS.stopped };
    try {
      await live.begin();
    } catch {
      return { ok: false, says: EMAIL_SAYS.launch };
    }
    say("Opening Gmail's page for a new email in the Live Amazon Browser");
    // Opened empty: the email is written in the page, never put in its address, which Chrome would keep in the window's history.
    const res = await live.open(composeUrl(), { onWait: (ms) => say(`Waiting ${Math.ceil(ms / 1000)} seconds before opening Gmail`) });
    if (!res?.ok) return { ok: false, says: EMAIL_SAYS[res?.error] ?? EMAIL_SAYS.network };
    const stops = (l) => Boolean(l?.loginForm || l?.refused || l?.robot);
    // Gmail draws the box for the new email a moment after it opens: the email is written in it once it is there.
    const first = await writeWhenDrawn(email, signal, say, stops);
    const kind = gmailPageIs(first.line, res.status);
    if (kind === 'signin') return pause('google-signin');
    if (kind === 'robot') return pause('google-robot');
    if (kind === 'blocked') return pause('google-blocked');
    if (kind === 'refused') return pause('google-refused');
    if (first.wrote === 'failed') return fail(EMAIL_SAYS.noFields);
    if (signal?.aborted) return fail(EMAIL_SAYS.stopped);
    if (kind !== 'compose') return fail(EMAIL_SAYS.noCompose);
    if (first.wrote !== 'written') return fail(EMAIL_SAYS.noFields);
    // Gmail takes the address as the email's own a moment after its field is left: the page is read until the email is there as it was on the screen.
    const ready = (l) => Boolean(l?.compose && !differs(l.compose, email) && l.compose.send);
    let line = await readUntil((l) => l && (ready(l) || stops(l)), waitMs, signal, wanted);
    const shown = gmailPageIs(line, null);
    if (shown === 'signin') return pause('google-signin');
    if (shown === 'robot') return pause('google-robot');
    if (shown === 'refused') return pause('google-refused');
    if (signal?.aborted && !ready(line)) return fail(EMAIL_SAYS.stopped);
    if (shown !== 'compose') return fail(EMAIL_SAYS.noCompose);
    const wrong = differs(line.compose, email);
    if (wrong) return fail(EMAIL_SAYS.different(wrong));
    if (!line.compose.send) return fail(EMAIL_SAYS.noSend);
    if (signal?.aborted) return fail(EMAIL_SAYS.stopped);
    say('Pressing Send in Gmail');
    if (!(await live.pressSend(wanted))) return fail(EMAIL_SAYS.noSend);
    // From here on the email may have gone, whatever happens next: so "maybe sent", never "not sent".
    line = await readAfterSend(wanted);
    const after = gmailPageIs(line, null);
    if (after === 'signin') return pause('google-signin', { maybe: true });
    if (after === 'robot') return pause('google-robot', { maybe: true });
    if (!line?.sent) {
      tell(EMAIL_SAYS.maybe);
      await live.leave?.();
      return { ok: false, maybe: true, says: EMAIL_SAYS.maybe };
    }
    const at = now().toISOString();
    // Gmail holds the email for its "Undo" time before it really goes: the window stays until that is over.
    say('Gmail says the email was sent; waiting for it to finish');
    await readUntil((l) => !l || (!l.sent && !l.undo), settleMs, null, wanted);
    // Nothing else of Gmail stays on the screen or is read.
    await live.leave?.();
    tell(`Gmail said the email was sent (subject: ${String(email.subject ?? '').slice(0, 80)}).`);
    return { ok: true, at };
  }

  return { send };
}
