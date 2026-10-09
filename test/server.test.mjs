// serve.mjs: its own session, and the local-only rules.
// Run: node test/server.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signJwt, verifyJwt, createSessions, createHandler, staticFile, loginLog, LOGIN_LOG, PORT, ALLOWED_HOSTS, RENEW_BEFORE_MS, SESSION_MS, ROOT } from '../serve.mjs';

test('port 8093, and only localhost:8093 or 127.0.0.1:8093 as the Host', () => {
  assert.equal(PORT, 8093);
  assert.deepEqual([...ALLOWED_HOSTS], ['localhost:8093', '127.0.0.1:8093']);
  const src = readFileSync(join(ROOT, 'serve.mjs'), 'utf8');
  assert.match(src, /server\.listen\(port, '127\.0\.0\.1'/, 'listens on 127.0.0.1 only');
  assert.match(src, /export async function startDashboard\(\{ port = PORT,/, 'on port 8093 unless a test asks for another');
  assert.match(src, /app = await startDashboard\(\);/, 'npm start uses port 8093');
  assert.match(src, /console\.log\(`Amazon Review Checker: http:\/\/localhost:\$\{PORT\}`\)/, 'says where it is when it starts');
  assert.doesNotMatch(src, /readFileSync|parseEnv|['"`]\.env|DATABASE_URL|prisma|process\.env\.(?!NODE_ENV)/i, 'no .env, database or settings from any other project');
});

test('the session: a random secret each start, an 8-hour token signed at once, renewed near its end', () => {
  let t = Date.parse('2026-10-04T06:00:00.000Z');
  const a = createSessions({ now: () => t });
  const b = createSessions({ now: () => t });
  const first = a.get();
  assert.equal(a.verify(first.token), true);
  assert.equal(b.verify(first.token), false, 'another start has another secret');
  assert.equal(first.expiresAt, '2026-10-04T14:00:00.000Z', '8 hours');
  assert.equal(a.get().token, first.token, 'the same token while it has time left');
  t += SESSION_MS - RENEW_BEFORE_MS + 1000;
  const second = a.get();
  assert.notEqual(second.token, first.token, 'a fresh token when fewer than 15 minutes are left');
  assert.equal(a.verify(first.token), true, 'the old one still works until it runs out');
  t += RENEW_BEFORE_MS;
  assert.equal(a.verify(first.token), false, 'and not after');
  t += 1000;
  const before = a.get().token;
  assert.notEqual(a.get({ renew: true }).token, before, 'asked to renew, it signs a fresh one');
  const secret = 'a-test-secret-that-is-long-enough-1234567890';
  const now = Math.floor(Date.now() / 1000);
  assert.ok(verifyJwt(signJwt({ typ: 'page', iat: now, exp: now + 60 }, secret), secret));
  assert.equal(verifyJwt(signJwt({ typ: 'other', iat: now, exp: now + 60 }, secret), secret), null, 'only a page token');
  assert.equal(verifyJwt(signJwt({ typ: 'page', iat: now, exp: now + 60 }, 'another-secret-that-is-long-enough-12345'), secret), null);
  assert.equal(verifyJwt('not.a.token', secret), null);
});

// ---- over HTTP ----

const root = mkdtempSync(join(tmpdir(), 'arc-serve-'));
writeFileSync(join(root, 'index.html'), '<!doctype html><p>hi</p>');
writeFileSync(join(root, 'app.js'), 'export {};');
writeFileSync(join(root, '.env'), 'SECRET=1');
mkdirSync(join(root, 'lib'));
writeFileSync(join(root, 'lib', 'a.js'), 'export {};');
mkdirSync(join(root, '.hidden'));
writeFileSync(join(root, '.hidden', 'x.js'), 'x');
mkdirSync(join(root, 'data'));
writeFileSync(join(root, 'data', 'users.json'), '{"users":[]}');

const sessions = createSessions();
const server = createServer(createHandler({ root, sessions }));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
after(() => server.close());

function get(path, { method = 'GET', host = 'localhost:8093', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { Host: host, ...headers } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the page gets its session from /local-session, and the token is good', async () => {
  const r = await get('/local-session', { headers: { 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(r.status, 200);
  const body = JSON.parse(r.body);
  assert.deepEqual(Object.keys(body).sort(), ['expiresAt', 'token']);
  assert.equal(sessions.verify(body.token), true);
  const ok = await get('/local-session', { host: '127.0.0.1:8093', headers: { 'Sec-Fetch-Site': 'none' } });
  assert.equal(ok.status, 200);
  const renewed = JSON.parse((await get('/local-session?renew=1')).body);
  assert.notEqual(renewed.token, body.token);
});

test('a wrong Host gets 421', async () => {
  for (const host of ['evil.example:8093', 'localhost', 'localhost:8092', 'localhost.evil.example:8093', '127.0.0.1:80']) {
    const r = await get('/local-session', { host });
    assert.equal(r.status, 421, host);
    assert.ok(!r.body.includes('token'));
  }
  assert.equal((await get('/', { host: 'rebind.example:8093' })).status, 421);
});

test('a cross-site Sec-Fetch-Site gets 403', async () => {
  for (const site of ['cross-site', 'same-site']) {
    const r = await get('/local-session', { headers: { 'Sec-Fetch-Site': site } });
    assert.equal(r.status, 403, site);
    assert.ok(!r.body.includes('eyJ'));
  }
});

test('only GET and HEAD are answered for files and the session', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const r = await get('/local-session', { method });
    assert.equal(r.status, 405, method);
    assert.equal((await get('/index.html', { method })).status, 405, method);
  }
  const head = await get('/index.html', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
});

test('/local/ paths are not found without the dashboard routes', async () => {
  assert.equal((await get('/local/amazon/users')).status, 404);
  assert.equal((await get('/local/amazon/users', { method: 'POST' })).status, 404);
});

test('the safety headers are sent, and no CORS header ever is', async () => {
  for (const [path, opts] of [['/', {}], ['/local-session', { headers: { Origin: 'http://evil.example' } }], ['/nope', {}], ['/', { host: 'x:1' }], ['/', { method: 'POST' }], ['/local/x', {}]]) {
    const r = await get(path, opts);
    assert.equal(r.headers['cache-control'], 'no-store', path);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-frame-options'], 'DENY');
    assert.equal(r.headers['content-security-policy'], "frame-ancestors 'none'");
    assert.equal(r.headers['referrer-policy'], 'no-referrer');
    for (const k of Object.keys(r.headers)) assert.ok(!k.startsWith('access-control-'), k);
  }
});

test('static files: index, a module, and the right types', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/html/);
  const js = await get('/lib/a.js');
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /javascript/);
});

test('path traversal, encoded traversal, hidden files, folders and data/ get 404', async () => {
  for (const p of ['/../serve.mjs', '/lib/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/lib/%2e%2e%2f%2e%2e%2fetc%2fpasswd', '/..%2f..%2fetc%2fpasswd', '/.env', '/%2eenv', '/.hidden/x.js', '/lib', '/lib/', '/%', '/a%00.js', '/data/users.json', '/data', '/data%2fusers.json', '/lib/..%2fdata%2fusers.json']) {
    const r = await get(p);
    assert.equal(r.status, 404, p);
  }
  assert.equal(staticFile(root, '/../x'), null);
  assert.equal(staticFile(ROOT, '/index.html')?.type, 'text/html; charset=utf-8');
  // Only the page's own files are served: never the server, the tests, data/ or node_modules.
  for (const p of ['/serve.mjs', '/README.md', '/package.json', '/amazon/check.js', '/test/server.test.mjs', '/node_modules/playwright-core/package.json', '/data/users.json', '/data/amazon-profile/Default/Cookies', '/syntax-check.mjs']) {
    assert.equal(staticFile(ROOT, p), null, p);
  }
});

test('the icons and the font are given to the page from assets/, each as its own kind of file; nothing else there is', () => {
  assert.equal(staticFile(ROOT, '/assets/poppins-400.ttf')?.type, 'font/ttf');
  assert.equal(staticFile(ROOT, '/assets/icon-upload.svg')?.type, 'image/svg+xml');
  assert.equal(staticFile(ROOT, '/assets/select-arrow.svg')?.type, 'image/svg+xml');
  assert.equal(staticFile(ROOT, '/assets/poppins-licence.txt'), null, 'a file of another kind is not given');
  for (const p of ['/assets', '/assets/', '/assets/../serve.mjs', '/assets/%2e%2e/serve.mjs', '/assets/x/icon-upload.svg']) assert.equal(staticFile(ROOT, p), null, p);
});

test('the login lines are written in the Terminal window and kept in the data folder, with the date and time in India; the file stays small', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'arc-login-log-'));
  const shown = [];
  const write = loginLog(dir, { log: (m) => shown.push(m), now: () => new Date('2026-10-06T09:33:12Z') });
  const line = 'Amazon login check, when the dashboard started: page 1: opened https://www.amazon.in/, titled "Amazon.in", and its account line says "Hello, sign in".';
  write(line);
  await write.done();
  assert.deepEqual(shown, [line], 'the Terminal window, as before');
  assert.equal(LOGIN_LOG, 'login-log.txt');
  assert.equal(readFileSync(join(dir, LOGIN_LOG), 'utf8'), `06-10-2026 15:03:12 ${line}\n`);
  assert.equal(statSync(join(dir, LOGIN_LOG)).mode & 0o777, 0o600, 'readable only by this Mac account');
  for (let i = 0; i < 2000; i++) write(`line ${i} ${'x'.repeat(300)}`);
  await write.done();
  const kept = readFileSync(join(dir, LOGIN_LOG), 'utf8');
  assert.ok(statSync(join(dir, LOGIN_LOG)).size <= 512 * 1024, 'at most half a megabyte');
  assert.ok(kept.endsWith(`line 1999 ${'x'.repeat(300)}\n`), 'the newest lines are kept');
  assert.match(kept, /^\d{2}-\d{2}-2026 /, 'it starts at the start of a line');
  await rm(dir, { recursive: true, force: true });
});
