// The client for this dashboard's own server (serve.mjs). Every answer the
// screens show comes from here; nothing in this file decides a result.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** The server's own sentence from an error body: { statusCode, message: string | string[] }. */
export function sentenceOf(body, status) {
  const m = body && typeof body === 'object' ? body.message : null;
  if (Array.isArray(m) && m.length) return m.map(String).join(' ');
  if (typeof m === 'string' && m.trim()) return m;
  return "The dashboard's server refused this without saying why. Reload the page, then try again.";
}

async function readError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return new ApiError(res.status, sentenceOf(body, res.status));
}

/**
 * base — '' for this page's own server
 * getToken() — the session token, or null
 * onUnauthorized(tokenUsed) — called on any 401
 * onOk() — called on any answer that was not refused
 * unreachableMessage — what to say when nothing answers
 */
export function createClient({ base, getToken, onUnauthorized = () => {}, onOk = () => {}, unreachableMessage = null, fetch: f = globalThis.fetch.bind(globalThis), URL: U = globalThis.URL }) {
  const root = String(base).replace(/\/+$/, '');
  const unreachable = () => new ApiError(0, unreachableMessage ?? "The dashboard's server could not be reached. Is it still running in Terminal?");

  function headers(extra = {}) {
    const out = { ...extra };
    const token = getToken();
    if (token) out.Authorization = `Bearer ${token}`;
    return { out, token };
  }

  async function send(method, path, init) {
    if (method === 'PUT') throw new ApiError(0, 'PUT is never sent.');
    const { out, token } = headers(init.headers);
    let res;
    try {
      res = await f(root + path, { method, ...init, headers: out });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw unreachable();
    }
    if (res.status === 401) {
      const e = await readError(res);
      onUnauthorized(token);
      throw e;
    }
    if (!res.ok) throw await readError(res);
    onOk();
    return res;
  }

  async function api(method, path, body) {
    const init = { headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await send(method, path, init);
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError(res.status, "The dashboard's server sent an answer that could not be read.");
    }
  }

  async function upload(path, file) {
    const form = new FormData();
    form.append('file', file, file?.name);
    const res = await send('POST', path, { headers: { Accept: 'application/json' }, body: form });
    return res.json();
  }

  /** A whole form (text fields and files) as multipart. */
  async function form(path, data) {
    const res = await send('POST', path, { headers: { Accept: 'application/json' }, body: data });
    return res.json();
  }

  /** Never throws. Resolves {ok:true, lines} | {ok:false, aborted:true} | {ok:false, status, message}. */
  async function stream(method, path, body, onEvent, signal) {
    let lines = 0;
    const deliver = (raw) => {
      const line = raw.trim();
      if (!line) return;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      lines++;
      try {
        onEvent(event);
      } catch {
        // a screen's mistake must not end the read
      }
    };
    try {
      const init = {
        headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
        signal,
      };
      const res = await send(method, path, init);
      if (!res.body || typeof res.body.getReader !== 'function') {
        const text = await res.text();
        text.split('\n').forEach(deliver);
        return { ok: true, lines };
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let rest = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          rest += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = rest.indexOf('\n')) >= 0) {
            deliver(rest.slice(0, nl));
            rest = rest.slice(nl + 1);
          }
        }
      } catch (err) {
        if (signal?.aborted || err?.name === 'AbortError') return { ok: false, aborted: true };
        // The connection broke part way: what arrived is kept, and the screen
        // sees there was no done line.
        return { ok: true, lines };
      }
      rest += decoder.decode();
      deliver(rest);
      if (signal?.aborted) return { ok: false, aborted: true };
      return { ok: true, lines };
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError') return { ok: false, aborted: true };
      if (err instanceof ApiError) return { ok: false, status: err.status, message: err.message };
      return { ok: false, status: 0, message: unreachable().message };
    }
  }

  /** A file to save: its bytes and the name the server gave it. */
  async function blob(path) {
    const res = await send('GET', path, { headers: {} });
    const disp = res.headers.get('content-disposition') ?? '';
    const star = disp.match(/filename\*=UTF-8''([^;]+)/i);
    const plain = disp.match(/filename="([^"]+)"/i);
    let fileName = plain ? plain[1] : null;
    if (star) {
      try {
        fileName = decodeURIComponent(star[1]);
      } catch {
        // keep the plain name
      }
    }
    return { blob: await res.blob(), fileName };
  }

  /** The image as an object URL. The caller must revoke it. */
  async function image(path) {
    const res = await send('GET', path, { headers: {} });
    const blob = await res.blob();
    return U.createObjectURL(blob);
  }

  function revoke(url) {
    if (url) U.revokeObjectURL(url);
  }

  return { api, upload, form, stream, image, blob, revoke, base: root };
}
