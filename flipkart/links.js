// Links. The links in a cell of the Flipkart file, for the screen: copied from
// the Amazon reader's way of finding links in words (amazon/links.js) and
// changed so a cell's words stay as they are: each web address written in
// them becomes a link, and a link behind the words follows them when it is
// not one of those. Only addresses that start with http://, https:// or www.
// count, since every column is shown and "1.5L/2L" or "Rs.349/-" is no link.
// And Flipkart's own links, for the campaigns: which websites are Flipkart's,
// the product ID (pid) and the item ID in a link, and the page opened for a
// product. Nothing here opens a link.

export const FLIPKART_ORIGIN = 'https://www.flipkart.com';
/** A Flipkart product ID (pid) typed alone: 16 capital letters and digits, for example FCPHEW7AM9C7RU24. */
export const PID = /^[A-Z0-9]{16}$/;
/** A product ID found in a link or on a page: most are 16 letters and digits, but some are not (a book's is its 13-digit ISBN). */
export const ANY_PID = /^[A-Z0-9]{10,20}$/;
/** A Flipkart item ID: "itm" and then letters and digits, for example itm50a9094e8e73a. */
export const ITEM_ID = /^itm[0-9a-z]{6,20}$/;

/** A pasted link as a URL, or null. A link without a scheme is read as https. */
export function parseUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const u = new URL(withScheme);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname ? u : null;
  } catch {
    return null;
  }
}

const urlOf = (raw) => (raw instanceof URL ? raw : parseUrl(raw));

/** True for a link to Flipkart's own website: flipkart.com, www.flipkart.com, dl.flipkart.com and the like. */
export function isFlipkart(raw) {
  const host = urlOf(raw)?.hostname.toLowerCase().replace(/\.$/, '') ?? '';
  return host === 'flipkart.com' || host.endsWith('.flipkart.com');
}

/** True for an address the Live Flipkart Browser may load: Flipkart's website, and flixcart.com, where Flipkart keeps its pictures and page code. */
export function isFlipkartSite(raw) {
  const host = urlOf(raw)?.hostname.toLowerCase().replace(/\.$/, '') ?? '';
  return isFlipkart(raw) || host === 'flixcart.com' || host.endsWith('.flixcart.com');
}

/** The product ID in a Flipkart link (its "pid"), in capitals, or null. */
export function pidFrom(raw) {
  const u = urlOf(raw);
  if (!u || !isFlipkart(u)) return null;
  const pid = String(u.searchParams.get('pid') ?? '').trim().toUpperCase();
  return ANY_PID.test(pid) ? pid : null;
}

/** The item ID in a Flipkart link (the part of its path starting with "itm"), or null. */
export function itemIdFrom(raw) {
  const u = urlOf(raw);
  if (!u || !isFlipkart(u)) return null;
  const m = u.pathname.match(/\/(?:p|product-reviews)\/(itm[0-9a-z]+)(?:\/|$)/i);
  return m && ITEM_ID.test(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
}

/**
 * The page opened for a product typed as its product ID alone: Flipkart's
 * product page found by the ID. Flipkart may not open a page from it; the
 * screen then asks for the product's link.
 */
export function pageForPid(pid) {
  return `${FLIPKART_ORIGIN}/product/p/itme?pid=${encodeURIComponent(pid)}`;
}

/**
 * The page opened for a Flipkart link: a product page's link (or its reviews'
 * link) as the product page alone, https://www.flipkart.com/<name>/p/<item
 * ID>?pid=<product ID>, without what else the link carries; any other
 * Flipkart link as it is, to see where it leads.
 */
export function pageForLink(raw) {
  const u = urlOf(raw);
  if (!u || !isFlipkart(u)) return null;
  const path = u.pathname.replace(/^\/dl(?=\/)/i, '');
  const m = path.match(/^\/([^/]+)\/(?:p|product-reviews)\/(itm[0-9a-z]+)\/?$/i);
  const pid = pidFrom(u);
  if (m && pid && ITEM_ID.test(m[2].toLowerCase())) return `${FLIPKART_ORIGIN}/${m[1]}/p/${m[2].toLowerCase()}?pid=${pid}`;
  return u.href;
}

/** A piece of words without the brackets, quotes and full stop around it: { lead, core, trail }. */
function trimmed(token) {
  const lead = token.match(/^[(<["']*/)[0];
  const rest = token.slice(lead.length);
  const trail = rest.match(/[)>\]"'.]*$/)[0];
  return { lead, core: rest.slice(0, rest.length - trail.length), trail };
}

/** The web address a piece of words is, or null. */
function linkOf(core) {
  if (!/^(?:https?:\/\/|www\.)/i.test(core)) return null;
  return parseUrl(core)?.href ?? null;
}

/** Every web link in some words, in order: separated by spaces, commas, semicolons or new lines. */
export function linksIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/[^\s,;]+/g)) {
    const link = linkOf(trimmed(m[0]).core);
    if (link && !out.includes(link)) out.push(link);
  }
  return out;
}

/** The key two links share when they open the same page: the website (www or not), the path and the query, http or https alike. */
export function linkKey(raw) {
  const u = raw instanceof URL ? raw : parseUrl(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const query = [...u.searchParams]
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${host}${path}${query ? `?${query}` : ''}`;
}

/**
 * A cell as the screen shows it, in pieces: its words as they are, each web
 * address in them as a link, then each link behind the words that is not one
 * of those. -> [{ text } | { link }]
 */
export function cellParts(text, behind = '') {
  const parts = [];
  const shown = [];
  let words = '';
  for (const m of String(text ?? '').matchAll(/[^\s,;]+|[\s,;]+/g)) {
    const { lead, core, trail } = trimmed(m[0]);
    const link = core ? linkOf(core) : null;
    if (!link) {
      words += m[0];
      continue;
    }
    words += lead;
    if (words) parts.push({ text: words });
    parts.push({ link });
    shown.push(linkKey(link));
    words = trail;
  }
  if (words) parts.push({ text: words });
  // Excel puts the whole of "link one, link two" behind such words, so the link behind is split the same way.
  const raw = String(behind ?? '').trim();
  const hidden = /^https?:\/\//i.test(raw) ? linksIn(raw.replace(/%20/g, ' ').replace(/%2C/gi, ',')) : [];
  for (const link of hidden) {
    if (shown.includes(linkKey(link))) continue;
    const last = parts.at(-1);
    if (last && !(last.text && /\s$/.test(last.text))) parts.push({ text: ' ' });
    parts.push({ link });
    shown.push(linkKey(link));
  }
  return parts;
}
