// Pretend Amazon pages for the login tests, answered inside the test's own
// hidden Chrome, so nothing reaches Amazon. The home page's account line says
// "Hello, Test Staff" only when the long-lasting test cookie is set, and
// "Hello, sign in" otherwise. The login page sets that cookie when its button
// is pressed (lasting a year when "Keep me signed in" is ticked, and only
// until the window closes when it is not), then moves on to the home page by
// itself, the way Amazon does after a login. No redirects.
// fakeAmazon() -> { handler (for LiveBrowser's routes), visits, and switches:
//   home: 'page' | 'captcha' | 'blocked', loggedOut: Amazon ending the login,
//   slowStart: the first page after the window opens shows no name even with
//   the login saved, and the next page shows it (as a restart once did) }

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_COOKIE = 'arc-test-login';
export const TEST_NAME = 'Test Staff';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAPTCHA_PAGE = readFileSync(join(HERE, 'captcha-page.html'), 'utf8');
const BLOCKED_PAGE = readFileSync(join(HERE, 'error-page.html'), 'utf8');

const page = (title, body) => `<!doctype html><html lang="en-in"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

/**
 * A page with Amazon's account line at the top; `ended` is a login Amazon has
 * ended (a password changed elsewhere). With `slowStart`, the first page this
 * window shows says "Hello, sign in" even when the login is saved; a cookie
 * that lasts until the window closes remembers that one has been shown.
 */
function homePage(ended, slowStart) {
  return page(
    'Amazon.in',
    `<header id="navbar"><a id="nav-link-accountList" href="/gp/css/homepage.html"><span id="nav-link-accountList-nav-line-1"></span><span class="nav-line-2">Account &amp; Lists</span></a></header>
<main><h1>Test home page</h1></main>
<script>
  var shownBefore = /(?:^|; )arc-test-shown=1(?:;|$)/.test(document.cookie);
  document.cookie = 'arc-test-shown=1; path=/; secure; samesite=lax';
  var loggedIn = ${ended ? 'false' : `/(?:^|; )${TEST_COOKIE}=1(?:;|$)/.test(document.cookie) && (shownBefore || ${!slowStart})`};
  document.getElementById('nav-link-accountList-nav-line-1').textContent = loggedIn ? 'Hello, ${TEST_NAME}' : 'Hello, sign in';
</script>`,
  );
}

const LOGIN_PAGE = page(
  'Amazon Sign In',
  `<form name="signIn" onsubmit="return false">
  <h1>Sign in</h1>
  <label>Email or mobile phone number <input id="ap_email" name="email" autocomplete="off"></label>
  <label><input type="checkbox" id="remember" name="rememberMe"> Keep me signed in</label>
  <button type="button" id="log-in">Sign in</button>
</form>
<script>
  document.getElementById('log-in').addEventListener('click', function () {
    var keep = document.getElementById('remember').checked;
    document.cookie = '${TEST_COOKIE}=1; path=/; secure; samesite=lax' + (keep ? '; max-age=31536000' : '');
    setTimeout(function () {
      window.location.assign('https://www.amazon.in/');
    }, 50);
  });
</script>`,
);

export function fakeAmazon() {
  const site = { home: 'page', loggedOut: false, slowStart: false, visits: [] };
  site.handler = (route) => {
    const req = route.request();
    const url = req.url();
    if (!req.isNavigationRequest() || !url.startsWith('https://www.amazon.in/')) return route.abort();
    site.visits.push({ url, at: Date.now() });
    const answer = (status, body) => route.fulfill({ status, contentType: 'text/html; charset=utf-8', body });
    const { pathname } = new URL(url);
    if (pathname.startsWith('/ap/')) return answer(200, LOGIN_PAGE);
    if (pathname === '/' && site.home === 'captcha') return answer(200, CAPTCHA_PAGE);
    if (pathname === '/' && site.home === 'blocked') return answer(503, BLOCKED_PAGE);
    // After Amazon ends a login, its pages that need one show the login page.
    if (pathname !== '/' && site.loggedOut) return answer(200, LOGIN_PAGE);
    return answer(200, homePage(site.loggedOut, site.slowStart));
  };
  return site;
}
