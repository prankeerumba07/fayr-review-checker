// The frame: the session from serve.mjs, the top bar, and the screen.

import { h, render } from './lib/vdom.js';
import { createClient } from './lib/api.js';
import * as words from './lib/words.js';
import amazon from './views/amazon.js';

const SCREENS = [amazon];
const DEFAULT = 'amazon';

const root = document.getElementById('app');

const app = {
  session: null,
  opening: true,
  openError: null,
  notice: null, // { tone, text, retry }
  renewing: false,
  renewedToken: null, // set after a 401 renewal, cleared by the first answer it gets
  states: Object.fromEntries(SCREENS.map((s) => [s.id, s.initial()])),
};

// This page's own server (serve.mjs).
const local = createClient({
  base: '',
  getToken: () => app.session?.token ?? null,
  onUnauthorized: (tokenUsed) => renewAfter401(tokenUsed),
  onOk: () => {
    app.renewedToken = null;
  },
  unreachableMessage: "The dashboard's server could not be reached. Is it still running in Terminal?",
});

function currentId() {
  const id = (location.hash.match(/^#\/([a-z]+)/) ?? [])[1];
  return SCREENS.some((s) => s.id === id) ? id : DEFAULT;
}

/** What follows the screen in the hash: "#/amazon/u123" gives "u123". */
function currentRoute() {
  return (location.hash.match(/^#\/[a-z]+\/([A-Za-z0-9_-]{1,64})$/) ?? [])[1] ?? '';
}

function screen() {
  return SCREENS.find((s) => s.id === currentId());
}

let queued = false;
function update(change) {
  const s = screen();
  if (typeof change === 'function') change(app.states[s.id]);
  else if (change && typeof change === 'object') Object.assign(app.states[s.id], change);
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    draw();
  });
}

/** Saves a file: words (a CSV) or bytes already fetched (a Blob, such as the checked Excel file). */
function download(name, data, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Runs fn every ms milliseconds; the answer stops it. */
function every(ms, fn) {
  const timer = setInterval(fn, ms);
  return () => clearInterval(timer);
}

/** Scrolls to the part of the page with this data-id, once the page is drawn: to its top, or ('center') to the middle of the screen. */
function reveal(dataId, block = 'start') {
  setTimeout(() => {
    document.querySelector(`[data-id="${dataId}"]`)?.scrollIntoView({ block: block === 'center' ? 'center' : 'start' });
  }, 0);
}

function ctxFor(s) {
  return {
    h,
    words,
    state: app.states[s.id],
    // Each screen's update writes to its own state, whichever screen is showing.
    update: (change) => {
      if (typeof change === 'function') change(app.states[s.id]);
      else if (change && typeof change === 'object') Object.assign(app.states[s.id], change);
      update();
    },
    local,
    route: currentId() === s.id ? currentRoute() : '',
    go: (id) => {
      location.hash = `#/${id}`;
    },
    confirm: (text) => window.confirm(text),
    download,
    every,
    reveal,
  };
}

async function fetchSession(renew) {
  let res;
  try {
    res = await fetch(renew ? '/local-session?renew=1' : '/local-session', { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error("The dashboard's server could not be reached. Is it still running in Terminal?");
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body?.token) throw new Error(body?.message || 'The dashboard refused to open a session.');
  return body;
}

async function open() {
  app.opening = true;
  app.openError = null;
  draw();
  try {
    app.session = await fetchSession(false);
    app.opening = false;
    draw();
    enterCurrent();
  } catch (err) {
    app.opening = false;
    app.openError = err.message;
    draw();
  }
}

function resetAll() {
  for (const s of SCREENS) {
    try {
      s.reset(ctxFor(s));
    } catch {
      // a screen that cannot reset must not stop the others
    }
  }
}

async function renewAfter401(tokenUsed) {
  if (app.renewing || !app.session || tokenUsed !== app.session.token) return;
  resetAll();
  if (app.renewedToken && tokenUsed === app.renewedToken) {
    // The fresh session was refused too. Say so; do not try again by ourselves.
    app.notice = { tone: 'error', text: 'The dashboard refused a fresh session too. Close it in Terminal, start it again, then press Try again.', retry: true };
    draw();
    return;
  }
  app.renewing = true;
  draw();
  try {
    app.session = await fetchSession(true);
    app.renewedToken = app.session.token;
    app.notice = { tone: 'warn', text: 'The session ran out, so a fresh one was opened. Anything that was running has stopped; press its button again to carry on.' };
  } catch (err) {
    app.notice = { tone: 'error', text: `A fresh session could not be opened: ${err.message}`, retry: true };
  } finally {
    app.renewing = false;
  }
  draw();
  enterCurrent();
}

async function retrySession() {
  app.notice = null;
  app.renewedToken = null;
  try {
    app.session = await fetchSession(true);
    resetAll();
    draw();
    enterCurrent();
  } catch (err) {
    app.notice = { tone: 'error', text: `A fresh session could not be opened: ${err.message}`, retry: true };
    draw();
  }
}

function enterCurrent() {
  if (!app.session) return;
  const s = screen();
  try {
    s.enter(ctxFor(s));
  } catch {
    // enter() draws its own errors
  }
  draw();
}

/** The slim top bar: the dashboard's name, then what the screen puts there (the marketplace tabs and the Amazon login). */
function topBar() {
  const s = screen();
  let more = null;
  if (app.session && typeof s.bar === 'function') {
    try {
      more = s.bar(ctxFor(s));
    } catch {
      more = null; // the screen below still draws
    }
  }
  return h(
    'header',
    { class: 'topbar', key: 'top' },
    h('div', { class: 'brand' }, h('img', { src: 'favicon.svg', alt: '', width: '36', height: '36' }), h('span', { class: 'brand-name' }, 'Amazon Review Checker')),
    more,
  );
}

function draw() {
  if (app.opening) return render(root, h('p', { class: 'opening', role: 'status' }, 'Opening…'));
  if (app.openError) {
    return render(
      root,
      h(
        'main',
        { class: 'page' },
        h('div', { class: 'notice notice-error', role: 'alert' }, h('p', null, app.openError), h('button', { type: 'button', class: 'btn', onclick: open }, 'Try again')),
      ),
    );
  }
  const s = screen();
  let body;
  try {
    body = s.render(ctxFor(s));
  } catch {
    body = words.notice(h, 'error', 'This screen could not be drawn.');
  }
  render(root, [
    topBar(),
    h(
      'main',
      { class: 'page', key: `page-${s.id}` },
      app.renewing ? words.notice(h, 'quiet', 'Opening a fresh session…') : null,
      app.notice
        ? h(
            'div',
            { class: `notice notice-${app.notice.tone}`, role: app.notice.tone === 'error' ? 'alert' : 'status', key: 'app-notice' },
            h('p', null, app.notice.text),
            h(
              'div',
              { class: 'actions' },
              app.notice.retry ? h('button', { type: 'button', class: 'btn', onclick: retrySession }, 'Try again') : null,
              h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { app.notice = null; draw(); } }, 'Dismiss'),
            ),
          )
        : null,
      h('div', { key: `body-${s.id}` }, body),
    ),
  ]);
}

// A file held over the page lights up the upload line, and a file dropped
// anywhere on the page goes to the screen showing (the main page uploads it at
// once). A dropped file never opens in this tab instead.
let dragEnd = null;
const holdsFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  const s = screen();
  if (!app.session || !holdsFiles(e) || typeof s.dragging !== 'function') return;
  s.dragging(ctxFor(s), true);
  // No dragover for a moment: the file was taken away again.
  clearTimeout(dragEnd);
  dragEnd = setTimeout(() => s.dragging(ctxFor(s), false), 300);
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  clearTimeout(dragEnd);
  const s = screen();
  if (!app.session) return;
  if (typeof s.dragging === 'function') s.dragging(ctxFor(s), false);
  const file = e.dataTransfer?.files?.[0];
  if (file && typeof s.dropFile === 'function') s.dropFile(ctxFor(s), file);
});
// An open menu (Download) closes when you click anywhere else.
document.addEventListener('click', (e) => {
  for (const menu of document.querySelectorAll('details.menu[open]')) if (!menu.contains(e.target)) menu.removeAttribute('open');
});

window.addEventListener('hashchange', () => {
  draw();
  enterCurrent();
});

open();
