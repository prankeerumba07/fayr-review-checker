// Pretend Gmail pages for the email sending tests, answered inside the test's
// own hidden Chrome, so nothing reaches Google: only Gmail's page for writing
// a new email is answered, and every other address is refused. The page opens
// empty, as Gmail's does, with the cursor in the address field; what is
// written in that field becomes the email's own address (a chip, and a hidden
// field) when the field is left, as in Gmail. Its Send button records the
// email (the address, the subject, and the words line by line as the reader
// sees them) with a request the handler keeps (site.sent), removes the box
// and shows "Message sent" with "Undo" for a moment (toastMs). No redirects.
// fakeGmail() -> { handler (for LiveBrowser's routes), visits, sent, and switches:
//   signIn: Gmail showing a login form instead of the page,
//   refuse: Google refusing this window ("may not be secure"),
//   robot: a robot check (answered 429),
//   blocked: Google refusing to show the page (answered 503),
//   dropBody: the page losing the words written in it,
//   noSentWord: Send pressed, but Gmail never saying "Message sent",
//   slowMs: the box drawn only after this many milliseconds,
//   slowChipMs: the address made the email's own only this many milliseconds after its field is left,
//   signature: the account's own signature already in the words of a new email, as Gmail does,
//   twoForms: an older email's box left open on the page, before the new one,
//   twoNew: two empty boxes for a new email, so neither can be told to be the new one,
//   noCursor: the cursor not put in the address field, so the field is found by its label,
//   toastMs: how long "Message sent" and "Undo" stay }

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

/** Gmail's page for a new email: its box is made (as Gmail makes it, a moment after the page opens), empty, with the cursor in the address field. */
const COMPOSE_PAGE = ({ dropBody, noSentWord, slowMs, slowChipMs, signature, twoForms, twoNew, noCursor, toastMs }) =>
  page(
    'New Message - Test Gmail',
    `<div id="compose"></div>
<div id="after" hidden><div role="alert">Message sent</div> <span role="button" id="undo">Undo</span></div>
<script>
  function make(tag, attrs, text) {
    var el = document.createElement(tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (text) el.textContent = text;
    return el;
  }
  // The words of an email, line by line, as the reader sees them: each line of the box, with words or empty.
  function linesOf(el) {
    var lines = [];
    var line = null;
    var end = function () { if (line !== null) { lines.push(line); line = null; } };
    (function walk(node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) line = (line || '') + c.textContent;
        else if (c.nodeName === 'BR') { lines.push(line || ''); line = null; }
        else if (c.nodeName === 'DIV' || c.nodeName === 'P') { end(); walk(c); end(); }
        else walk(c);
      }
    })(el);
    end();
    return lines.join('\\n');
  }
  // One box for an email, as Gmail draws it: the field an address is written in, the addresses the email goes to (a chip each, and a hidden field), the subject, the words and Send.
  function box(fields) {
    var b = make('div', { role: 'dialog', 'aria-label': 'New Message' });
    var chips = make('div', { role: 'listbox' });
    var typed = make('input', { type: 'text', role: 'combobox', 'aria-label': 'To recipients' });
    var to = make('input', { type: 'hidden', name: 'to' });
    var own = function (address) {
      to.value = to.value ? to.value + ', ' + address : address;
      chips.appendChild(make('div', { role: 'option', 'data-hovercard-id': address }, address));
    };
    // As in Gmail: what is written in the address field becomes an address of the email when the field is left.
    typed.addEventListener('blur', function () {
      var address = typed.value.trim();
      if (!address) return;
      typed.value = '';
      setTimeout(function () { own(address); }, ${Number(slowChipMs) || 0});
    });
    if (fields.to) own(fields.to);
    var subject = make('input', { name: 'subjectbox', type: 'text' });
    subject.value = fields.subject || '';
    var body = make('div', { 'aria-label': 'Message Body', role: 'textbox', contenteditable: 'true', g_editable: 'true' });
    if (fields.body) body.textContent = fields.body;
    var send = make('div', { role: 'button', 'aria-label': 'Send ‪(⌘Enter)‬' }, 'Send');
    send.addEventListener('click', function () {
      var sent = { to: to.value, subject: subject.value, body: linesOf(body) };
      fetch('https://mail.google.com/sent-record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent) }).catch(function () {});
      ${noSentWord ? '' : `b.remove(); document.getElementById('after').hidden = false; setTimeout(function () { document.getElementById('after').hidden = true; }, ${Number(toastMs) || 300});`}
    });
    [chips, typed, to, subject, body, send].forEach(function (el) { b.appendChild(el); });
    return { box: b, typed: typed, body: body };
  }
  function draw() {
    var place = document.getElementById('compose');
    ${twoForms ? "place.appendChild(box({ to: 'older.person@example.test', subject: 'An older email left open', body: 'Older words that must not go.' }).box);" : ''}
    ${twoNew ? 'place.appendChild(box({}).box);' : ''}
    var mine = box({});
    ${signature ? "mine.body.innerHTML = '<div><br></div><div>Test Person<br>Sent from Test Gmail</div>';" : ''}
    ${dropBody ? "mine.body.addEventListener('input', function () { mine.body.textContent = ''; });" : ''}
    place.appendChild(mine.box);
    ${noCursor ? '' : '// As Gmail does for a new email: the cursor in the address field.\n    mine.typed.focus();'}
  }
  setTimeout(draw, ${Number(slowMs) || 0});
</script>`,
  );
const SIGN_IN_PAGE = page('Gmail', `<h1>Sign in</h1><form onsubmit="return false"><label>Email or phone <input type="email" id="identifierId" name="identifier"></label></form>`);
const REFUSED_PAGE = page('Sign in - Google Accounts', `<h1>Couldn't sign you in</h1><p>This browser or app may not be secure.</p>`);
const ROBOT_PAGE = page('Sorry...', `<p>Our systems have detected unusual traffic from your computer network.</p>`);
const BLOCKED_PAGE = page('Gmail', `<p>Something went wrong.</p>`);

export function fakeGmail() {
  const site = { signIn: false, refuse: false, robot: false, blocked: false, dropBody: false, noSentWord: false, slowMs: 0, slowChipMs: 0, signature: false, twoForms: false, twoNew: false, noCursor: false, toastMs: 300, visits: [], sent: [] };
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
