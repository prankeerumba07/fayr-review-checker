// Pretend Gmail pages for the email sending tests, answered inside the test's
// own hidden Chrome, so nothing reaches Google: only Gmail's page for writing
// a new email is answered (it fills its fields from the address, as Gmail
// does), and every other address is refused. Its Send button records the
// email with a request the handler keeps (site.sent), removes the box and
// shows "Message sent" with "Undo" for a moment (toastMs). No redirects.
// fakeGmail() -> { handler (for LiveBrowser's routes), visits, sent, and switches:
//   signIn: Gmail showing a login form instead of the page,
//   refuse: Google refusing this window ("may not be secure"),
//   robot: a robot check (answered 429),
//   blocked: Google refusing to show the page (answered 503),
//   dropBody: the page filling the address and the subject, but not the words,
//   noSentWord: Send pressed, but Gmail never saying "Message sent",
//   slowMs: the box drawn only after this many milliseconds,
//   slowBodyMs: the words filled in only this many milliseconds after the box,
//   signature: the account's own signature added after the words, as Gmail does,
//   twoForms: an older email's box left open on the page, before the new one,
//   toastMs: how long "Message sent" and "Undo" stay }

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

/** Gmail's page for a new email: its fields are made (as Gmail makes them, a moment after the page opens) and filled from the address. */
const COMPOSE_PAGE = ({ dropBody, noSentWord, slowMs, slowBodyMs, signature, twoForms, toastMs }) =>
  page(
    'New Message - Test Gmail',
    `<div id="compose"></div>
<div id="after" hidden><div role="alert">Message sent</div> <span role="button" id="undo">Undo</span></div>
<script>
  var q = new URLSearchParams(location.search);
  var email = { to: q.get('to') || '', subject: q.get('su') || '', body: q.get('body') || '' };
  function make(tag, attrs, text) {
    var el = document.createElement(tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (text) el.textContent = text;
    return el;
  }
  function box(fields) {
    var b = make('div', { role: 'dialog', 'aria-label': 'New Message' });
    var to = make('textarea', { name: 'to' });
    to.value = fields.to;
    var subject = make('input', { name: 'subjectbox', type: 'text' });
    subject.value = fields.subject;
    var body = make('div', { 'aria-label': 'Message Body', role: 'textbox', contenteditable: 'true', g_editable: 'true' });
    var send = make('div', { role: 'button', 'aria-label': 'Send ‪(⌘Enter)‬' }, 'Send');
    send.addEventListener('click', function () {
      var sent = { to: to.value, subject: subject.value, body: body.innerText };
      fetch('https://mail.google.com/sent-record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent) }).catch(function () {});
      ${noSentWord ? '' : `b.remove(); document.getElementById('after').hidden = false; setTimeout(function () { document.getElementById('after').hidden = true; }, ${Number(toastMs) || 300});`}
    });
    [to, subject, body, send].forEach(function (el) { b.appendChild(el); });
    return { box: b, body: body };
  }
  function draw() {
    ${twoForms ? "var older = box({ to: email.to, subject: 'An older email left open' }); older.body.innerText = 'Older words that must not go.'; document.getElementById('compose').appendChild(older.box);" : ''}
    var mine = box(email);
    document.getElementById('compose').appendChild(mine.box);
    var fill = function () { mine.body.innerText = email.body${signature ? " + '\\n\\nTest Person\\nSent from Test Gmail'" : ''}; };
    ${dropBody ? '' : `${Number(slowBodyMs) > 0 ? `setTimeout(fill, ${Number(slowBodyMs)});` : 'fill();'}`}
  }
  setTimeout(draw, ${Number(slowMs) || 0});
</script>`,
  );
const SIGN_IN_PAGE = page('Gmail', `<h1>Sign in</h1><form onsubmit="return false"><label>Email or phone <input type="email" id="identifierId" name="identifier"></label></form>`);
const REFUSED_PAGE = page('Sign in - Google Accounts', `<h1>Couldn't sign you in</h1><p>This browser or app may not be secure.</p>`);
const ROBOT_PAGE = page('Sorry...', `<p>Our systems have detected unusual traffic from your computer network.</p>`);
const BLOCKED_PAGE = page('Gmail', `<p>Something went wrong.</p>`);

export function fakeGmail() {
  const site = { signIn: false, refuse: false, robot: false, blocked: false, dropBody: false, noSentWord: false, slowMs: 0, slowBodyMs: 0, signature: false, twoForms: false, toastMs: 300, visits: [], sent: [] };
  site.handler = (route) => {
    const req = route.request();
    const url = req.url();
    let u;
    try {
      u = new URL(url);
    } catch {
      return route.abort();
    }
    if (u.hostname !== 'mail.google.com') return route.abort();
    // The Send button's record of what it sent.
    if (u.pathname === '/sent-record' && req.method() === 'POST') {
      try {
        site.sent.push(JSON.parse(req.postData() ?? '{}'));
      } catch {
        site.sent.push(null);
      }
      return route.fulfill({ status: 204, body: '' });
    }
    if (!req.isNavigationRequest()) return route.abort();
    site.visits.push({ url, at: Date.now() });
    const answer = (status, body) => route.fulfill({ status, contentType: 'text/html; charset=utf-8', body });
    if (site.robot) return answer(429, ROBOT_PAGE);
    if (site.blocked) return answer(503, BLOCKED_PAGE);
    if (site.refuse) return answer(200, REFUSED_PAGE);
    if (site.signIn) return answer(200, SIGN_IN_PAGE);
    if (u.pathname === '/mail/' && u.searchParams.get('view') === 'cm') return answer(200, COMPOSE_PAGE(site));
    return answer(200, page('Gmail', '<p>Nothing here.</p>'));
  };
  return site;
}
