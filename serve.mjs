// Amazon Review Checker's local server: the page's own files, /local-session,
// which hands the page its session token so there is no sign-in, and the
// dashboard's routes under /local/amazon/.
// Local only: 127.0.0.1, an exact Host, no CORS. Files and the session answer
// GET and HEAD only; the dashboard's routes also take POST, but only from this
// page itself and only with its token.
//
// Node built-ins, plus playwright-core and exceljs for the dashboard's routes.
// No backend, no database, no .env and no API key: the secret is made fresh
// every time the server starts, and it never leaves this process.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { statSync, createReadStream } from 'node:fs';

import { createLineLog, EMAIL_LOG } from './amazon/line-log.js';

export { EMAIL_LOG };
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PORT = 8093;
export const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
export const SESSION_MS = 8 * 60 * 60 * 1000;
export const RENEW_BEFORE_MS = 15 * 60 * 1000;
export const ROOT = dirname(fileURLToPath(import.meta.url));

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** The payload of an HS256 session token signed with this secret and not expired, else null. */
export function verifyJwt(token, secret, nowMs = Date.now()) {
  if (typeof token !== 'string' || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const head = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (head?.alg !== 'HS256') return null;
    const want = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const got = Buffer.from(parts[2], 'base64url');
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload?.typ !== 'page' || typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) return null;
    return payload;
  } catch {
    return null;
  }
}

/** The bearer token on a request, or null. */
export function bearerOf(req) {
  const h = req.headers.authorization;
  return typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

/** An HS256 JWT. */
export function signJwt(payload, secret) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

/**
 * The page's session. A random secret is made when the server starts, and an
 * 8-hour token is signed with it at once; a fresh one is signed when fewer
 * than 15 minutes are left, or when the page asks to renew.
 */
export function createSessions({ secret = randomBytes(32), now = () => Date.now() } = {}) {
  function make() {
    const iat = Math.floor(now() / 1000);
    const exp = iat + SESSION_MS / 1000;
    const jti = randomBytes(8).toString('hex');
    return { token: signJwt({ sub: 'page', typ: 'page', iat, exp, jti }, secret), expiresAt: new Date(exp * 1000).toISOString(), exp: exp * 1000 };
  }
  let current = make();
  return {
    get({ renew = false } = {}) {
      if (renew || current.exp - now() < RENEW_BEFORE_MS) current = make();
      return current;
    },
    /** True when this token is one of ours and still good. */
    verify: (token) => Boolean(verifyJwt(token, secret, now())),
  };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};

/** The only files the page is given: these, and the files directly in lib/, views/ and assets/ (the icons and the font). Never data/. */
export const PUBLIC_FILES = new Set(['index.html', 'app.js', 'styles.css', 'favicon.svg', 'live-browser.html']);
export const PUBLIC_DIRS = new Set(['lib', 'views', 'assets']);

/** The file a URL path names inside root, or null: no .., no hidden files, no folders, nothing off the list. */
export function staticFile(root, urlPath) {
  let path;
  try {
    path = decodeURIComponent(String(urlPath).split('?')[0]);
  } catch {
    return null;
  }
  if (path === '/' || path === '') path = '/index.html';
  if (path.includes('\0') || path.includes('\\')) return null;
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return null;
  if (parts.some((p) => p === '..' || p.startsWith('.'))) return null;
  const listed = (parts.length === 1 && PUBLIC_FILES.has(parts[0])) || (parts.length === 2 && PUBLIC_DIRS.has(parts[0]));
  if (!listed) return null;
  const file = resolve(root, ...parts);
  if (!file.startsWith(resolve(root) + sep)) return null;
  const type = TYPES[extname(file).toLowerCase()];
  if (!type) return null;
  try {
    if (!statSync(file).isFile()) return null;
  } catch {
    return null;
  }
  return { file, type };
}

function baseHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function sendJson(res, status, body, head) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(text));
  res.end(head ? undefined : text);
}

function sendText(res, status, text, head) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(head ? undefined : text);
}

/**
 * local(req, res, url) — the dashboard's routes; answers true when the path
 * was theirs. Without it, /local/ paths are not found. flipkart(req, res, url)
 * — Flipkart's routes, the same way: they get every path under /local/flipkart/.
 */
export function createHandler({ root = ROOT, sessions, local = null, flipkart = null }) {
  return async function handle(req, res) {
    baseHeaders(res);
    const head = req.method === 'HEAD';
    if (!ALLOWED_HOSTS.has(req.headers.host ?? '')) return sendText(res, 421, 'Misdirected request.', head);
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      return sendText(res, 400, 'Bad request.', head);
    }
    if (url.pathname.startsWith('/local/')) {
      const routes = url.pathname.startsWith('/local/flipkart/') ? flipkart : local;
      if (routes && (await routes(req, res, url))) return;
      return sendText(res, 404, 'Not found.', head);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return sendText(res, 405, 'Only GET and HEAD are answered here.', false);
    }

    if (url.pathname === '/local-session') {
      const site = req.headers['sec-fetch-site'];
      if (site !== undefined && site !== 'same-origin' && site !== 'none') {
        return sendJson(res, 403, { message: 'A session is only handed to this page itself.' }, head);
      }
      const s = sessions.get({ renew: url.searchParams.get('renew') === '1' });
      return sendJson(res, 200, { token: s.token, expiresAt: s.expiresAt }, head);
    }

    const found = staticFile(root, url.pathname);
    if (!found) return sendText(res, 404, 'Not found.', head);
    res.statusCode = 200;
    res.setHeader('Content-Type', found.type);
    if (head) return res.end();
    createReadStream(found.file)
      .on('error', () => {
        if (!res.headersSent) sendText(res, 404, 'Not found.', false);
        else res.destroy();
      })
      .pipe(res);
  };
}

/** The file in the data folder that keeps the login lines, so they can be read later. */
export const LOGIN_LOG = 'login-log.txt';

/**
 * The Amazon login lines: each one written in the Terminal window, as
 * before, and kept in data/login-log.txt with the date and time in India,
 * with when the dashboard started and when it closed the Live Amazon
 * Browser. Only what the login check writes: a page's address, its title and
 * its account line, never anything typed. The file keeps about its last half
 * megabyte. -> write(line), with write.done() for the lines still being kept.
 */
export function loginLog(dataDir, { log = (m) => console.error(m), now = () => new Date() } = {}) {
  return createLineLog(join(dataDir, LOGIN_LOG), { log, now });
}

/**
 * Starts the dashboard: its routes, the Live Amazon Browser and the picture
 * reader, then checks the Amazon login by itself, on Amazon's home page with
 * the saved profile, and the Google login from that profile's cookies (no
 * page opened), so the top bar is right from the start. -> { server, port,
 * store, live, images, login, google, loginChecked, stop }. stop() closes the
 * server, then the Live Amazon Browser properly (Chrome is asked to close
 * and waited for, so it saves the login), then the picture reader. Tests
 * pass their own data folder, port and pretend Amazon pages (liveOptions).
 */
export async function startDashboard({ port = PORT, dataDir = join(ROOT, 'data'), liveOptions = {}, log = (m) => console.error(m) } = {}) {
  // The dashboard's data stays in data/, never served.
  const { createStore } = await import('./amazon/store.js');
  const { LiveBrowser, ImageReader } = await import('./amazon/browsers.js');
  const { createAmazonRoutes } = await import('./amazon/routes.js');
  const { createLogin } = await import('./amazon/login.js');
  const { createGoogleLogin } = await import('./amazon/google-login.js');
  const { createFlipkartRoutes } = await import('./flipkart/routes.js');
  const sessions = createSessions();
  const store = createStore(dataDir);
  await store.init();
  const live = new LiveBrowser({ dataDir: store.dataDir, labelUrl: `http://localhost:${PORT}/live-browser.html`, ...liveOptions });
  const images = new ImageReader();
  const loginLines = loginLog(store.dataDir, { log });
  const login = createLogin({ live, log: loginLines });
  // The Google login, kept in the same saved profile: checked from its cookies' names only, no page opened.
  const google = createGoogleLogin({ live, store, log: loginLines });
  // Every try at sending an email, kept in data/email-log.txt: the time, the row, what happened and the reason; never the email's words or address.
  const emailLines = createLineLog(join(store.dataDir, EMAIL_LOG), { log });
  const local = createAmazonRoutes({ store, live, images, log, login, google, emailLog: emailLines, auth: (req) => sessions.verify(bearerOf(req)) });
  // Flipkart's top bar shows this same Google login, and its Google Drive screenshots are downloaded through the Live Amazon Browser's own download, without opening a page; Flipkart never changes that window.
  const amazonGoogle = { view: () => google.view(), busy: () => google.busy, amazonLogin: () => ({ state: login.view().state, busy: login.busy }), loggedOut: () => google.loggedOut(), begin: () => live.begin(), fetch: (url, init) => live.fetch(url, init) };
  const flipkart = createFlipkartRoutes({ dataDir, log, google: amazonGoogle, auth: (req) => sessions.verify(bearerOf(req)) });
  const server = createServer(createHandler({ sessions, local, flipkart }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  loginLines('The dashboard started.');
  // The Amazon login first (it opens the window), then the Google login from the profile's cookies.
  const loginChecked = login.check().then(() => google.check());
  let stopping = null;
  const stop = () =>
    (stopping ??= (async () => {
      login.close();
      await google.close();
      server.close();
      server.closeAllConnections();
      // Both lines in the file mean Chrome was closed in time to save the login; only the first means it was not.
      if (live.isOpen()) loginLines('The dashboard is stopping, so the Live Amazon Browser is being closed.');
      const wasOpen = live.isOpen();
      await Promise.allSettled([live.close(), images.close(), flipkart.close()]);
      if (wasOpen) loginLines('The Live Amazon Browser was closed.');
      await loginLines.done();
      await emailLines.done();
    })());
  return { server, port: server.address().port, store, live, images, login, google, loginChecked, stop };
}

/**
 * Control+C, the Terminal window closing, or another stop request: the
 * dashboard closes the Live Amazon Browser properly first, so Chrome saves
 * the login, then ends. A second Control+C ends at once.
 */
export function stopOnSignals(stop, { exit = (code) => process.exit(code), limitMs = 20_000 } = {}) {
  let stopping = false;
  const onSignal = () => {
    if (stopping) return exit(1);
    stopping = true;
    const limit = new Promise((r) => setTimeout(r, limitMs).unref());
    Promise.race([stop(), limit]).finally(() => exit(0));
  };
  for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(name, onSignal);
  return onSignal;
}

export async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to start: NODE_ENV is production. This dashboard is for use on this computer only.');
    process.exit(1);
  }
  // A Terminal window closed while the dashboard stops must not cut the stop short.
  for (const out of [process.stdout, process.stderr]) out.on('error', () => {});
  let app;
  try {
    app = await startDashboard();
  } catch (err) {
    console.error(err?.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Is the dashboard already open in another Terminal window?` : `Server error: ${err?.code ?? 'unknown'}`);
    process.exit(1);
  }
  stopOnSignals(app.stop);
  console.log(`Amazon Review Checker: http://localhost:${PORT}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
