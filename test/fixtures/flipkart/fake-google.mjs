// Pretend Google pages for the Flipkart Google login tests, copied from the
// Amazon ones (test/fixtures/amazon/fake-google.mjs), answered inside the
// test's own hidden Chrome, so nothing reaches Google: only Google's login page and
// its home page are answered, and every other address is refused. The login
// page's "Next" button sets a cookie named like Google's login cookie (its
// value is made up) and moves on to Google's home page, as Google does after a
// login; the home page shows the account button only when that cookie is
// there, and a "Sign in" link otherwise. No redirects.
// fakeGoogle() -> { handler (for the Flipkart Google Browser's routes), visits, and switches:
//   refuse: Google refusing the login in this window ("may not be secure"),
//   robot: Google's home page showing a robot check }

export const TEST_GOOGLE_NAME = 'Test Person';
export const TEST_GOOGLE_EMAIL = 'test.person@example.test';
const COOKIE = 'SID';

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

const LOGIN_PAGE = page(
  'Sign in - Google Accounts',
  `<h1>Sign in</h1>
<form onsubmit="return false">
  <label>Email or phone <input type="email" id="identifierId" name="identifier" autocomplete="off"></label>
  <button type="button" id="next">Next</button>
</form>
<script>
  document.getElementById('next').addEventListener('click', function () {
    document.cookie = '${COOKIE}=made-up-test-session; domain=.google.com; path=/; secure; samesite=lax; max-age=31536000';
    setTimeout(function () {
      window.location.assign('https://www.google.com/');
    }, 50);
  });
</script>`,
);

const REFUSED_PAGE = page('Sign in - Google Accounts', `<h1>Couldn't sign you in</h1><p>This browser or app may not be secure.</p>`);
const ROBOT_PAGE = page('Sorry...', `<p>Our systems have detected unusual traffic from your computer network.</p>`);

/** Google's home page: the account button when the login cookie is there, else a "Sign in" link. Nothing else of an account. */
const HOME_PAGE = page(
  'Google',
  `<header id="top"></header>
<main><h1>Test home page</h1></main>
<script>
  var loggedIn = /(?:^|; )${COOKIE}=/.test(document.cookie);
  document.getElementById('top').innerHTML = loggedIn
    ? '<a href="https://accounts.google.com/SignOutOptions?hl=en" aria-label="Google Account: ${TEST_GOOGLE_NAME}  (${TEST_GOOGLE_EMAIL})">T</a>'
    : '<a href="https://accounts.google.com/ServiceLogin?hl=en&amp;continue=https://www.google.com/">Sign in</a>';
</script>`,
);

export function fakeGoogle() {
  const site = { refuse: false, robot: false, visits: [] };
  site.handler = (route) => {
    const req = route.request();
    const url = req.url();
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      return route.abort();
    }
    if (!req.isNavigationRequest() || !['accounts.google.com', 'www.google.com'].includes(host)) return route.abort();
    site.visits.push({ url, at: Date.now() });
    const answer = (status, body) => route.fulfill({ status, contentType: 'text/html; charset=utf-8', body });
    if (host === 'accounts.google.com') return answer(200, site.refuse ? REFUSED_PAGE : LOGIN_PAGE);
    if (site.robot) return answer(429, ROBOT_PAGE);
    return answer(200, HOME_PAGE);
  };
  return site;
}
