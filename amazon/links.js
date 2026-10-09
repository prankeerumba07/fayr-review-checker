// Links: which hosts are Amazon India, Google Drive or a short link; the
// review id, the ASIN and the Drive file id in a link; what a link in the
// Review link cell is; the links in a cell; and the key two links share when
// they open the same thing. Pure: nothing here opens a page.

export const AMAZON_HOSTS = new Set(['www.amazon.in', 'amazon.in', 'm.amazon.in']);
export const SHORT_HOSTS = new Set(['amzn.in', 'amzn.to', 'a.co']);
export const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com']);
export const AMAZON_ORIGIN = 'https://www.amazon.in';
/** Amazon.in's home page, where the account line at the top says who is logged in. */
export const AMAZON_HOME = `${AMAZON_ORIGIN}/`;

/**
 * Amazon.in's own login page, for a person to log in by hand. It carries no
 * "max_auth_age=0", which would make Amazon ask for the password again even
 * when the saved login still works.
 */
export const SIGN_IN_URL =
  'https://www.amazon.in/ap/signin?openid.return_to=https%3A%2F%2Fwww.amazon.in%2F%3Fref_%3Dnav_signin&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=inflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0';

/** Google's home page: where Google goes after a login, with an account button at the top that says who is logged in. Nothing of the account is on it. */
export const GOOGLE_HOME = 'https://www.google.com/';
/**
 * Google's own login page, for a person to log in by hand; Google goes on to
 * its home page afterwards. A login still saved skips the form: Google goes
 * straight to the home page.
 */
export const GOOGLE_SIGN_IN_URL = 'https://accounts.google.com/ServiceLogin?hl=en&continue=https%3A%2F%2Fwww.google.com%2F';
/** Gmail's page for writing a new email (gmail.js adds the address, the subject and the words to it). The only Gmail page ever opened. */
export const GMAIL_COMPOSE_URL = 'https://mail.google.com/mail/';
/** True for Google's own hosts: google.com, google.co.in and their subdomains. */
export function isGoogleHost(host) {
  return /(^|\.)google\.(com|co\.in)$/i.test(String(host ?? ''));
}

const REVIEW_ID = /^R[0-9A-Z]{9,19}$/;
const ASIN = /^[0-9A-Z]{10}$/;
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,}$/;
/** Pages of Amazon only the review's writer can see: writing, changing or having just sent a review. */
const WRITER_ONLY = /review-your-purchases|create-review|edit-review|write-a-review|\/thankyou(?:[/?#]|$)/i;

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
const hostOf = (u) => u.hostname.toLowerCase().replace(/\.$/, '');

export function isAmazonIn(url) {
  const u = urlOf(url);
  return Boolean(u && AMAZON_HOSTS.has(hostOf(u)));
}

/** Amazon India or one of its own websites (business.amazon.in): a review id there is an Amazon India review. */
export function isAmazonInFamily(url) {
  const u = urlOf(url);
  return Boolean(u && /(^|\.)amazon\.in$/.test(hostOf(u)));
}

/** An app store's page (Apple's App Store, Google Play): never a review or a picture. */
export function isAppStore(url) {
  const u = urlOf(url);
  return Boolean(u && /^(apps|itunes)\.apple\.com$|^play\.google\.com$/.test(hostOf(u)));
}

export function isShortLink(url) {
  const u = urlOf(url);
  return Boolean(u && SHORT_HOSTS.has(hostOf(u)));
}

/** Amazon in another country (amazon.com, amazon.co.uk…): never Amazon India. */
export function isOtherAmazon(url) {
  const u = urlOf(url);
  const host = u ? hostOf(u) : '';
  return Boolean(u && !/(^|\.)amazon\.in$/.test(host) && /(^|\.)amazon\.(com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/.test(host));
}

/**
 * The review id (R…) in a review link: /gp/customer-reviews/R…, /review/R…,
 * /gp/aw/review/ASIN/R…, /portal/customer-reviews/srp/-/R…, /abredir/review/R…
 * or ?reviewId=R…; else null.
 */
export function reviewIdFrom(raw) {
  const u = urlOf(raw);
  if (!u) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const at = parts.findIndex((p) => /^(customer-reviews|review|reviews)$/i.test(p));
  if (at >= 0) {
    for (const p of parts.slice(at + 1, at + 5)) {
      // Real links carry the id in capitals; a small-letter one counts only with a digit, so a word is never an id.
      if (REVIEW_ID.test(p) || (REVIEW_ID.test(p.toUpperCase()) && /\d/.test(p))) return p.toUpperCase();
    }
  }
  const q = u.searchParams.get('reviewId') ?? u.searchParams.get('reviewID');
  return q && REVIEW_ID.test(q.toUpperCase()) ? q.toUpperCase() : null;
}

/** The ASIN in a product link, or a bare ASIN, or null. */
export function asinFrom(raw) {
  const text = String(raw ?? '').trim();
  if (ASIN.test(text.toUpperCase()) && /[0-9]/.test(text)) return text.toUpperCase();
  const u = parseUrl(text);
  if (!u) return null;
  const m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|product-reviews|gp\/product-reviews)\/([0-9A-Z]{10})(?=[/?#]|$)/i);
  if (m) return m[1].toUpperCase();
  const q = u.searchParams.get('ASIN') ?? u.searchParams.get('asin');
  return q && ASIN.test(q.toUpperCase()) ? q.toUpperCase() : null;
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

/** The real address in an Amazon email link (/gp/f.html?…&U=…), as a URL; null when it has none. */
export function emailTarget(raw) {
  const u = urlOf(raw);
  if (!u || !isAmazonIn(u) || !/^\/gp\/f\.html$/i.test(u.pathname)) return null;
  const target = u.searchParams.get('U') ?? u.searchParams.get('u');
  if (!target) return null;
  try {
    const t = new URL(target, AMAZON_ORIGIN);
    return t.protocol === 'https:' || t.protocol === 'http:' ? t : null;
  } catch {
    return null;
  }
}

export function isWriterOnlyPage(raw) {
  const u = urlOf(raw);
  return Boolean(u && isAmazonIn(u) && WRITER_ONLY.test(u.pathname));
}

export function reviewPageUrl(reviewId) {
  return `${AMAZON_ORIGIN}/gp/customer-reviews/${encodeURIComponent(reviewId)}`;
}

export function productPageUrl(asin) {
  return `${AMAZON_ORIGIN}/dp/${encodeURIComponent(asin)}`;
}

/** Amazon's own keyword search inside one product's reviews; `page` 2 and on are its next pages of ten reviews. */
export function reviewSearchUrl(asin, word, page = 1) {
  return `${AMAZON_ORIGIN}/product-reviews/${encodeURIComponent(asin)}?filterByKeyword=${encodeURIComponent(word)}${page > 1 ? `&pageNumber=${page}` : ''}`;
}

/** The "See all reviews" link read off a product page, made absolute; null unless it stays on amazon.in. */
export function seeAllReviewsUrl(href, asin) {
  if (href) {
    try {
      const u = new URL(href, AMAZON_ORIGIN);
      if (isAmazonIn(u) && /\/product-reviews\//.test(u.pathname)) return u.href;
    } catch {
      // fall through
    }
  }
  return asin ? `${AMAZON_ORIGIN}/product-reviews/${encodeURIComponent(asin)}` : null;
}

/** An Amazon page that is a product's own page, or its list of reviews: { kind: 'product' | 'reviews', asin }, else null. */
function productPageKind(u) {
  const m = u.pathname.match(/\/(?:portal\/customer-reviews|product-reviews|gp\/product-reviews)\/([0-9A-Z]{10})(?=[/?#]|$)/i);
  if (m) return { kind: 'reviews', asin: m[1].toUpperCase() };
  const p = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([0-9A-Z]{10})(?=[/?#]|$)/i);
  return p ? { kind: 'product', asin: p[1].toUpperCase() } : null;
}

/**
 * What a link in the Review link cell is, and what to do with it:
 *   review — an Amazon review: open `open` (its review page)
 *   amazon — another Amazon India page, an email link or a short link: open `open` and see where it lands
 *   product — a product's own page on Amazon, not one review
 *   reviews — a product's list of reviews on Amazon, not one review
 *   error — an Amazon error page
 *   writer-only — a page only the review's writer can see: never opened
 *   other-amazon — Amazon in another country
 *   app — an app store's page
 *   drive — a picture on Google Drive
 *   web — a link on another website (a picture when the website is allowed)
 *   not-a-link — words, a file name, or a link that is not http(s)
 * An email link whose U is an Amazon India address is read as that address,
 * and so is one whose U is a review on business.amazon.in; otherwise the
 * email link itself is opened.
 */
export function reviewLinkKind(raw) {
  const u = urlOf(raw);
  if (!u) return { kind: 'not-a-link', text: String(raw ?? '').trim() };
  const link = u.href;
  if (isShortLink(u)) return { kind: 'amazon', link, open: link, short: true };
  if (driveFileId(u)) return { kind: 'drive', link, fileId: driveFileId(u) };
  if (isOtherAmazon(u)) return { kind: 'other-amazon', link, host: hostOf(u) };
  if (isAppStore(u)) return { kind: 'app', link, host: hostOf(u) };
  if (!isAmazonIn(u)) {
    // A review on another of Amazon India's own websites (business.amazon.in) is that review.
    const id = isAmazonInFamily(u) ? reviewIdFrom(u) : null;
    return id ? { kind: 'review', link, reviewId: id, open: reviewPageUrl(id) } : { kind: 'web', link, host: hostOf(u) };
  }
  const target = emailTarget(u);
  if (target && isAmazonIn(target) && !emailTarget(target)) return { ...reviewLinkKind(target.href), link, via: 'email' };
  if (target && isAmazonInFamily(target) && reviewIdFrom(target)) return { kind: 'review', link, reviewId: reviewIdFrom(target), open: reviewPageUrl(reviewIdFrom(target)), via: 'email' };
  if (target || /^\/gp\/f\.html$/i.test(u.pathname)) return { kind: 'amazon', link, open: link, email: true };
  if (/\/error\/?$/i.test(u.pathname)) return { kind: 'error', link };
  if (isWriterOnlyPage(u)) return { kind: 'writer-only', link };
  const id = reviewIdFrom(u);
  if (id) return { kind: 'review', link, reviewId: id, open: reviewPageUrl(id) };
  const page = productPageKind(u);
  if (page) return { ...page, link };
  return { kind: 'amazon', link, open: link };
}

/**
 * Where a link goes, in a few words for the table of rows: "Google Drive",
 * "tryboxs", "storage.googleapis.com", "Amazon review", "Amazon email link",
 * "Amazon short link", "Amazon page for the writer only", "Amazon page", or
 * the website's name.
 */
export function linkLabel(raw) {
  const u = urlOf(raw);
  if (!u) return 'Link';
  const host = hostOf(u);
  if (isShortLink(u)) return 'Amazon short link';
  if (DRIVE_HOSTS.has(host)) return 'Google Drive';
  if (host === 'tryboxs.in' || host.endsWith('.tryboxs.in')) return 'tryboxs';
  if (isOtherAmazon(u)) return 'Amazon outside India';
  if (isAppStore(u)) return 'App store';
  if (!isAmazonIn(u)) return isAmazonInFamily(u) && reviewIdFrom(u) ? 'Amazon review' : host.replace(/^www\./, '');
  if (/^\/gp\/f\.html$/i.test(u.pathname)) return 'Amazon email link';
  if (/\/error\/?$/i.test(u.pathname)) return 'Amazon error page';
  if (isWriterOnlyPage(u)) return 'Amazon page for the writer only';
  if (reviewIdFrom(u)) return 'Amazon review';
  const page = productPageKind(u);
  if (page) return page.kind === 'reviews' ? "Amazon product's reviews" : 'Amazon product page';
  return 'Amazon page';
}

// ---- links in a cell ----

const KNOWN_HOST = /^(?:www\.)?(?:amazon\.in|amzn\.in|amzn\.to|a\.co|drive\.google\.com|docs\.google\.com|storage\.googleapis\.com|tryboxs\.in)\//i;

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
 * id, an Amazon review by its id, an email link by the address it holds, and
 * any other link by its website, path and query (http or https, www or not).
 */
export function linkKey(raw) {
  const u = urlOf(raw);
  if (!u) return null;
  const drive = driveFileId(u);
  if (drive) return `drive:${drive}`;
  const target = emailTarget(u);
  if (target && !emailTarget(target)) return linkKey(target);
  if (isAmazonInFamily(u) && !isWriterOnlyPage(u)) {
    const id = reviewIdFrom(u);
    if (id) return `review:${id}`;
  }
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
