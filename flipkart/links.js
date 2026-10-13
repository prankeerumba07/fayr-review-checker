// Links. Flipkart's own links, for the campaigns: which websites are
// Flipkart's, the product ID (pid) and the item ID in a link, and the page
// opened for a product. And the links in a cell of the Flipkart file, copied
// from the Amazon reader (amazon/links.js) and changed for Flipkart: the links
// in a cell's words and behind them, the key two links share when they open
// the same thing, and where a link goes, in a few words for the table of rows
// ("Google Drive", "Flipkart review"). Nothing here opens a link.

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

// ---- links in a cell, and where each goes (copied from amazon/links.js and changed for Flipkart) ----

/** Flipkart's own short links. */
export const SHORT_HOSTS = new Set(['fkrt.it']);
export const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com']);
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,}$/;
const hostOf = (u) => u.hostname.toLowerCase().replace(/\.$/, '');
/** A Flipkart link's path without the "/dl" some shared links start with. */
const flipkartPath = (u) => u.pathname.replace(/^\/dl(?=\/)/i, '');

/** A short link to Flipkart: fkrt.it, or a link shared from Flipkart's app (dl.flipkart.com/s/…). */
export function isShortLink(raw) {
  const u = urlOf(raw);
  return Boolean(u && (SHORT_HOSTS.has(hostOf(u)) || (hostOf(u) === 'dl.flipkart.com' && /^\/s\//i.test(u.pathname))));
}

/** An app store's page (Apple's App Store, Google Play): never a review or a picture. */
export function isAppStore(raw) {
  const u = urlOf(raw);
  return Boolean(u && /^(apps|itunes)\.apple\.com$|^play\.google\.com$/.test(hostOf(u)));
}

/** The Drive file id in a link, or null. Links on other hosts give null. */
export function driveFileId(raw) {
  const u = urlOf(raw);
  if (!u || !DRIVE_HOSTS.has(hostOf(u))) return null;
  const inPath = u.pathname.match(/\/(?:file\/(?:u\/\d+\/)?d|document\/d|presentation\/d|spreadsheets\/d)\/([^/?#]+)/);
  const id = inPath ? inPath[1] : u.searchParams.get('id');
  return id && DRIVE_FILE_ID.test(id) ? id : null;
}

export function isDriveLink(raw) {
  return driveFileId(raw) !== null;
}

/** A review's own ID, as Flipkart's reviews pages give it: a UUID. */
const REVIEW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The link that opens one review on Flipkart, from its own ID, as Flipkart's
 * "Share" gives it (www.flipkart.com/reviews/<ID>, the single-review links in
 * the sheet); null for anything that is not a review's ID.
 */
export function reviewLink(id) {
  const v = String(id ?? '').trim();
  return REVIEW_ID.test(v) ? `${FLIPKART_ORIGIN}/reviews/${v.toLowerCase()}` : null;
}

/** The review ID in a link to one Flipkart review (/reviews/<product ID>:<n>?reviewId=…), in small letters, or null. */
export function reviewIdFrom(raw) {
  const u = urlOf(raw);
  if (!u || !isFlipkart(u) || !/^\/reviews\//i.test(flipkartPath(u))) return null;
  const id = String(u.searchParams.get('reviewId') ?? '').trim();
  return /^[0-9a-f][0-9a-f-]{7,63}$/i.test(id) ? id.toLowerCase() : null;
}

/**
 * Where a link goes, in a few words for the table of rows: "Google Drive",
 * "tryboxs", "storage.googleapis.com", "Flipkart review", "Flipkart product's
 * reviews", "Flipkart product page", "Flipkart short link", "Flipkart page",
 * "App store", or the website's name.
 */
export function linkLabel(raw) {
  const u = urlOf(raw);
  if (!u) return 'Link';
  const host = hostOf(u);
  if (isShortLink(u)) return 'Flipkart short link';
  if (DRIVE_HOSTS.has(host)) return 'Google Drive';
  if (host === 'tryboxs.in' || host.endsWith('.tryboxs.in')) return 'tryboxs';
  if (isAppStore(u)) return 'App store';
  if (!isFlipkart(u)) return host.replace(/^www\./, '');
  const path = flipkartPath(u);
  if (/^\/reviews\//i.test(path)) return 'Flipkart review';
  if (/^\/[^/]+\/product-reviews\/itm/i.test(path)) return "Flipkart product's reviews";
  if (/^\/[^/]+\/p\/itm/i.test(path)) return 'Flipkart product page';
  return 'Flipkart page';
}

const KNOWN_HOST = /^(?:www\.)?(?:flipkart\.com|dl\.flipkart\.com|fkrt\.it|drive\.google\.com|docs\.google\.com|storage\.googleapis\.com|tryboxs\.in)\//i;

/** Every web link in a cell's words, in order: separated by spaces, commas or new lines. A file name is not a link. */
export function linksIn(text) {
  const out = [];
  for (let token of String(text ?? '').split(/[\s,;]+/)) {
    token = token.replace(/^[(<["']+/, '').replace(/[)>\]"'.]+$/, '');
    if (!token) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(token) && !/^https?:\/\//i.test(token)) continue;
    const looksLike = /^https?:\/\//i.test(token) || /^www\./i.test(token) || KNOWN_HOST.test(token) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*/i.test(token);
    if (!looksLike) continue;
    const u = parseUrl(token);
    if (u && !out.includes(u.href)) out.push(u.href);
  }
  return out;
}

/**
 * The key two links share when they open the same thing: a Drive file by its
 * id, a Flipkart review by its id, and any other link by its website, path
 * and query (http or https, www or not).
 */
export function linkKey(raw) {
  const u = urlOf(raw);
  if (!u) return null;
  const drive = driveFileId(u);
  if (drive) return `drive:${drive}`;
  const review = reviewIdFrom(u);
  if (review) return `review:${review}`;
  const host = hostOf(u).replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const query = [...u.searchParams]
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `url:${host}${path}${query ? `?${query}` : ''}`;
}

/** True when two links open the same thing. */
export function sameTarget(a, b) {
  const x = linkKey(a);
  return x !== null && x === linkKey(b);
}

/**
 * A cell's words and the link behind them, as a row keeps them: every link
 * (the one behind the words first), and a mismatch when the words are a link
 * but the link behind them opens something else.
 *   -> { text, link, links: [..], mismatch: { text, link } | null }
 */
export function cellLinks(text, behind) {
  const words = String(text ?? '').trim();
  const shown = linksIn(words);
  // Excel puts the whole of "link one, link two" behind such words, so the link behind is split the same way.
  const raw = String(behind ?? '').trim();
  const hidden = /^https?:\/\//i.test(raw) ? linksIn(raw.replace(/%20/g, ' ').replace(/%2C/gi, ',')) : [];
  if (!hidden.length) return { text: words, link: shown[0] ?? '', links: shown, mismatch: null };
  if (shown.length && !hidden.every((h) => shown.some((s) => sameTarget(s, h)))) {
    return { text: words, link: hidden[0], links: hidden, mismatch: { text: shown[0], link: hidden[0] } };
  }
  const links = [...hidden, ...shown.filter((s) => !hidden.some((h) => sameTarget(s, h)))];
  return { text: words, link: links[0], links, mismatch: null };
}
