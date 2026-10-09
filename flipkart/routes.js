// Flipkart's routes, under /local/flipkart/. serve.mjs has already checked
// the Host; here, as on Amazon's routes, every request must also carry the
// page's session token and come from this page itself. Nothing here sends
// CORS headers. The Flipkart checker is being built, so for now there is one
// route: /local/flipkart/status, which says it is not ready.

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(text));
  res.end(text);
}

function refuse(res, status, message) {
  sendJson(res, status, { statusCode: status, message });
}

/** auth(req) — true when the request carries this page's session token. */
export function createFlipkartRoutes({ auth }) {
  /** True when the path was one of these routes (answered or refused). */
  return async function handle(req, res, url) {
    if (!url.pathname.startsWith('/local/flipkart/')) return false;
    const site = req.headers['sec-fetch-site'];
    if (site !== undefined && site !== 'same-origin') {
      refuse(res, 403, 'Only this page itself may use these routes.');
      return true;
    }
    if (!(await auth(req))) {
      refuse(res, 401, 'The session is not valid. Reload the page.');
      return true;
    }
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    if (url.pathname !== '/local/flipkart/status') return refuse(res, 404, 'Not found.'), true;
    if (method === 'GET') return sendJson(res, 200, { ready: false }), true;
    res.setHeader('Allow', 'GET, HEAD');
    return refuse(res, 405, 'Only GET and HEAD are answered here.'), true;
  };
}
