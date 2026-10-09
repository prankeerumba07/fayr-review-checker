// The page's own helpers: lib/vdom.js, lib/api.js and lib/words.js.
// Run: node test/lib.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { h, render, textOf, findAll, byId } from '../lib/vdom.js';
import { createClient, ApiError, sentenceOf } from '../lib/api.js';
import * as words from '../lib/words.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- a very small DOM, enough for render() ----

function fakeDocument() {
  const doc = {};
  class Node {
    constructor(type) {
      this.nodeType = type;
      this.childNodes = [];
      this.parentNode = null;
      this.ownerDocument = doc;
    }
    insertBefore(node, ref) {
      if (node.parentNode) node.parentNode.removeChild(node);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(node);
      else this.childNodes.splice(i, 0, node);
      node.parentNode = this;
      return node;
    }
    appendChild(node) {
      return this.insertBefore(node, null);
    }
    removeChild(node) {
      this.childNodes.splice(this.childNodes.indexOf(node), 1);
      node.parentNode = null;
      return node;
    }
  }
  class El extends Node {
    constructor(tag) {
      super(1);
      this.tagName = tag;
      this.attributes = {};
      this.listeners = {};
      this.value = '';
    }
    setAttribute(k, v) {
      this.attributes[k] = String(v);
    }
    getAttribute(k) {
      return k in this.attributes ? this.attributes[k] : null;
    }
    removeAttribute(k) {
      delete this.attributes[k];
    }
    addEventListener(type, fn) {
      (this.listeners[type] ??= []).push(fn);
    }
    fire(type) {
      for (const fn of this.listeners[type] ?? []) fn({ type, target: this });
    }
  }
  class Text extends Node {
    constructor(data) {
      super(3);
      this.data = data;
    }
  }
  doc.createElement = (t) => new El(t);
  doc.createTextNode = (d) => new Text(d);
  doc.body = new El('body');
  return doc;
}

// ---- vdom ----

test('vdom: text stays text, even when it looks like HTML', () => {
  const doc = fakeDocument();
  render(doc.body, h('p', null, '<img src=x onerror=alert(1)>'));
  const p = doc.body.childNodes[0];
  assert.equal(p.childNodes.length, 1);
  assert.equal(p.childNodes[0].nodeType, 3);
  assert.equal(p.childNodes[0].data, '<img src=x onerror=alert(1)>');
});

test('vdom: children flatten, and null, false and true draw nothing', () => {
  const t = h('ul', null, [h('li', null, 'a'), [h('li', null, 'b'), null]], false, true, undefined, 0);
  assert.equal(t.children.length, 3);
  assert.equal(textOf(t), 'ab0');
});

test('vdom: textOf, findAll and byId', () => {
  const t = h('div', null, h('span', { 'data-id': 'x' }, 'one'), h('span', null, ' two'));
  assert.equal(textOf(t), 'one two');
  assert.equal(findAll(t, (n) => n.tag === 'span').length, 2);
  assert.equal(textOf(byId(t, 'x')), 'one');
  assert.equal(byId(t, 'missing'), null);
});

test('vdom: render reuses elements, so focus and typing survive', () => {
  const doc = fakeDocument();
  let clicks = 0;
  const draw = (label) =>
    render(doc.body, h('div', null, h('input', { id: 'q', value: 'a' }), h('button', { type: 'button', onclick: () => clicks++ }, label)));
  draw('One');
  const input = doc.body.childNodes[0].childNodes[0];
  input.value = 'typed';
  draw('Two');
  assert.equal(doc.body.childNodes[0].childNodes[0], input, 'the same input element');
  const btn = doc.body.childNodes[0].childNodes[1];
  assert.equal(btn.childNodes[0].data, 'Two');
  btn.fire('click');
  assert.equal(clicks, 1);
  assert.equal(btn.listeners.click.length, 1, 'one listener, not one per render');
});

test('vdom: keyed elements are reused by key, and props are set as properties', () => {
  const doc = fakeDocument();
  render(doc.body, h('ul', null, h('li', { key: 'a' }, 'A'), h('li', { key: 'b' }, 'B')));
  const [a, b] = doc.body.childNodes[0].childNodes;
  render(doc.body, h('ul', null, h('li', { key: 'b' }, 'B'), h('li', { key: 'a' }, 'A')));
  assert.deepEqual(doc.body.childNodes[0].childNodes, [b, a]);
  render(doc.body, h('input', { type: 'checkbox', checked: true, disabled: false }));
  const box = doc.body.childNodes[0];
  assert.equal(box.checked, true);
  assert.equal(box.disabled, false);
  assert.equal(box.getAttribute('checked'), null);
});

test('vdom: a select gets its value after its options exist', () => {
  const doc = fakeDocument();
  render(doc.body, h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')));
  const sel = doc.body.childNodes[0];
  assert.equal(sel.childNodes.length, 2);
  assert.equal(sel.value, 'b');
});

test('no module uses innerHTML, outerHTML, insertAdjacentHTML or document.write', () => {
  const files = ['app.js', ...readdirSync(join(ROOT, 'lib')).map((f) => `lib/${f}`), ...readdirSync(join(ROOT, 'views')).filter((f) => f.endsWith('.js')).map((f) => `views/${f}`)];
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, f);
  }
});

test('no module logs to the console', () => {
  const files = ['app.js', ...readdirSync(join(ROOT, 'lib')).map((f) => `lib/${f}`), ...readdirSync(join(ROOT, 'views')).filter((f) => f.endsWith('.js')).map((f) => `views/${f}`)];
  for (const f of files) assert.doesNotMatch(readFileSync(join(ROOT, f), 'utf8'), /console\./, f);
});

// ---- api ----

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function clientWith(fetchImpl, opts = {}) {
  const calls = [];
  const unauthorized = [];
  const client = createClient({
    base: '',
    getToken: () => opts.token ?? null,
    onUnauthorized: (t) => unauthorized.push(t),
    fetch: async (url, init) => {
      calls.push({ url, init });
      return fetchImpl(url, init);
    },
    URL: opts.URL ?? globalThis.URL,
  });
  return { client, calls, unauthorized };
}

function ndjson(chunks, { hang = false } = {}) {
  const enc = new TextEncoder();
  return (url, init) => {
    const body = new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(enc.encode(ch));
        if (!hang) c.close();
        init.signal?.addEventListener('abort', () => c.error(new DOMException('Aborted', 'AbortError')));
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
  };
}

test('api: the token goes in Authorization only when there is one', async () => {
  const a = clientWith(() => json(200, { ok: 1 }), { token: 'abc' });
  await a.client.api('GET', '/x');
  assert.equal(a.calls[0].init.headers.Authorization, 'Bearer abc');
  assert.equal(a.calls[0].url, '/x');
  const b = clientWith(() => json(200, {}), { token: null });
  await b.client.api('GET', '/x');
  assert.equal('Authorization' in b.calls[0].init.headers, false);
});

test('api: sends JSON and returns parsed JSON', async () => {
  const a = clientWith(() => json(200, { a: 1 }));
  const out = await a.client.api('PATCH', '/m', { mapping: { x: 'y' } });
  assert.deepEqual(out, { a: 1 });
  assert.equal(a.calls[0].init.method, 'PATCH');
  assert.equal(a.calls[0].init.body, '{"mapping":{"x":"y"}}');
  assert.equal(a.calls[0].init.headers['Content-Type'], 'application/json');
});

test('api: a refusal carries the server sentence; an array is joined', async () => {
  const a = clientWith(() => json(400, { statusCode: 400, message: 'Say which column holds: Review link.' }));
  await assert.rejects(a.client.api('GET', '/x'), (e) => e instanceof ApiError && e.status === 400 && e.message === 'Say which column holds: Review link.');
  const b = clientWith(() => json(400, { statusCode: 400, message: ['one.', 'two.'] }));
  await assert.rejects(b.client.api('GET', '/x'), { message: 'one. two.' });
  assert.equal(sentenceOf(null, 502), "The dashboard's server refused this without saying why. Reload the page, then try again.");
});

test('api: an unreachable server says so', async () => {
  const a = clientWith(() => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(a.client.api('GET', '/x'), { status: 0, message: "The dashboard's server could not be reached. Is it still running in Terminal?" });
  const out = await a.client.stream('POST', '/run', {}, () => {});
  assert.deepEqual(out, { ok: false, status: 0, message: "The dashboard's server could not be reached. Is it still running in Terminal?" });
});

test('api: a 401 calls onUnauthorized with the token used, from api, stream and image', async () => {
  const a = clientWith(() => json(401, { statusCode: 401, message: 'Invalid or expired token' }), { token: 't1' });
  await assert.rejects(a.client.api('GET', '/x'), { status: 401 });
  const out = await a.client.stream('POST', '/run', {}, () => {});
  assert.equal(out.ok, false);
  assert.equal(out.status, 401);
  await assert.rejects(a.client.image('/img'), { status: 401 });
  assert.deepEqual(a.unauthorized, ['t1', 't1', 't1']);
});

test('api: PUT is never sent', async () => {
  const a = clientWith(() => json(200, {}));
  await assert.rejects(a.client.api('PUT', '/x', {}));
  assert.equal(a.calls.length, 0);
});

test('api: upload sends multipart with the field "file"', async () => {
  const a = clientWith(() => json(201, { id: 'i' }), { token: 't' });
  const file = new File([new Uint8Array([1, 2])], 'a.xlsx');
  const out = await a.client.upload('/imports', file);
  assert.deepEqual(out, { id: 'i' });
  const body = a.calls[0].init.body;
  assert.ok(body instanceof FormData);
  assert.equal(body.get('file').name, 'a.xlsx');
  assert.equal('Content-Type' in a.calls[0].init.headers, false, 'the browser sets the boundary');
});

test('api: stream reads NDJSON across chunk edges and skips a bad line', async () => {
  const a = clientWith(ndjson(['{"event":"sta', 'rted","total":2}\n{"event":"working","says":"a"}\nnot json\n', '{"event":"done","says":"ok"}']));
  const got = [];
  const out = await a.client.stream('POST', '/run', {}, (e) => got.push(e));
  assert.deepEqual(out, { ok: true, lines: 3 });
  assert.deepEqual(got.map((e) => e.event), ['started', 'working', 'done']);
  assert.equal(got[0].total, 2);
  assert.equal(a.calls[0].init.body, '{}');
});

test('api: a refusal before the first line is an ordinary HTTP error', async () => {
  const a = clientWith(() => json(409, { statusCode: 409, message: 'A check is already running. Wait for it to finish, then press Check again.' }));
  const out = await a.client.stream('POST', '/run', {}, () => assert.fail('no events'));
  assert.deepEqual(out, { ok: false, status: 409, message: 'A check is already running. Wait for it to finish, then press Check again.' });
});

test('api: stream abort resolves {ok:false, aborted:true} and never throws', async () => {
  const a = clientWith(ndjson(['{"event":"started","total":5}\n'], { hang: true }));
  const ctl = new AbortController();
  const got = [];
  const p = a.client.stream('POST', '/run', {}, (e) => {
    got.push(e);
    ctl.abort();
  }, ctl.signal);
  const out = await p;
  assert.deepEqual(out, { ok: false, aborted: true });
  assert.equal(got.length, 1);
});

test('api: image returns an object URL from the fetched blob', async () => {
  const made = [];
  const a = clientWith(() => new Response(new Uint8Array([1]), { status: 200, headers: { 'Content-Type': 'image/png' } }), {
    token: 't',
    URL: { createObjectURL: (b) => (made.push(b), 'blob:x'), revokeObjectURL: (u) => made.push(`revoked ${u}`) },
  });
  assert.equal(await a.client.image('/img'), 'blob:x');
  a.client.revoke('blob:x');
  assert.equal(made[1], 'revoked blob:x');
  assert.equal(a.calls[0].init.headers.Authorization, 'Bearer t');
});

test('api: blob gives a file to save, with the name the server gave it, and the token', async () => {
  const a = clientWith(
    () =>
      new Response(new Uint8Array([80, 75, 3, 4]), {
        status: 200,
        headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="July orders checked 2026-10-05.xlsx"; filename*=UTF-8''July%20orders%20checked%202026-10-05.xlsx` },
      }),
    { token: 't' },
  );
  const out = await a.client.blob('/local/amazon/sheet/checked.xlsx');
  assert.equal(out.fileName, 'July orders checked 2026-10-05.xlsx');
  assert.equal(out.blob.size, 4);
  assert.equal(a.calls[0].init.headers.Authorization, 'Bearer t');
  const plain = clientWith(() => new Response('x', { status: 200, headers: { 'Content-Disposition': 'attachment; filename="a.xlsx"' } }));
  assert.equal((await plain.client.blob('/x')).fileName, 'a.xlsx');
  const none = clientWith(() => new Response('x', { status: 200 }));
  assert.equal((await none.client.blob('/x')).fileName, null);
  const refused = clientWith(() => json(400, { message: 'Upload the Excel file first.' }));
  await assert.rejects(refused.client.blob('/x'), (err) => err.message === 'Upload the Excel file first.');
});

// ---- words ----

test('words: times are India time, the day first', () => {
  assert.equal(words.ist('2026-10-01T12:00:00.000Z'), '01-10-2026 at 17:30');
  assert.equal(words.ist('2026-10-05T20:05:00.000Z'), '06-10-2026 at 01:35', 'after midnight in India');
  assert.equal(words.ist(null), '');
  assert.equal(words.ist('not a date'), '');
});

test('words: links allow http and https only, in a new tab with noopener noreferrer', () => {
  assert.equal(words.safeUrl('javascript:alert(1)'), null);
  assert.equal(words.safeUrl('data:text/html,x'), null);
  assert.equal(words.safeUrl('https://www.amazon.in/dp/B0TESTMAIN'), 'https://www.amazon.in/dp/B0TESTMAIN');
  const a = words.link(h, 'https://drive.google.com/file/d/1/view', 'Drive');
  assert.equal(a.tag, 'a');
  assert.equal(a.attrs.target, '_blank');
  assert.equal(a.attrs.rel, 'noopener noreferrer');
  const bad = words.link(h, 'javascript:alert(1)', 'x');
  assert.equal(bad.tag, 'span');
});

test('words: CSV quotes every cell, escapes formulas and starts with a byte-order mark', () => {
  const text = words.csv([['a', 'b"c', '=SUM(A1)', '+1', '-2', '@x', '\tt', '\rr', null, 5, 'हिन्दी']]);
  assert.equal(text.charCodeAt(0), 0xfeff);
  assert.equal(text.slice(1), `"a","b""c","'=SUM(A1)","'+1","'-2","'@x","'\tt","'\rr","","5","हिन्दी"\r\n`);
});
