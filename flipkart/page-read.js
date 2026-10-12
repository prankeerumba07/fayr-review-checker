// Reading a Flipkart page. readFlipkartPage() runs INSIDE the page (Playwright's
// page.evaluate), so it is self-contained: it uses nothing from this module's
// scope or its imports. It only reads; it never clicks, types or changes the
// page. What the facts mean is decided here in Node: what kind of page it is
// (whatPageIs) and the product it shows (productOnPage). Copied from the way
// the Amazon pages are read (amazon/page-read.js) and changed for Flipkart,
// whose product pages say most of what is read in their JSON-LD.

import { parseUrl, isFlipkart, pidFrom, itemIdFrom, FLIPKART_ORIGIN, ANY_PID } from './links.js';

/** What a Flipkart page shows, read inside the page. */
export function readFlipkartPage() {
  const squash = (s) => (s === null || s === undefined ? '' : String(s)).replace(/\s+/g, ' ').trim();
  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  // The page's JSON-LD: the product's name, brand, product ID, stars and counts, as Flipkart gives them to search engines.
  const items = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const j = JSON.parse(s.textContent || '');
      for (const x of Array.isArray(j) ? j : [j]) if (x && typeof x === 'object') items.push(x);
    } catch {
      // not JSON: left out
    }
  }
  const p = items.find((x) => [].concat(x['@type'] ?? []).map(String).includes('Product')) ?? null;
  const agg = p && p.aggregateRating && typeof p.aggregateRating === 'object' ? p.aggregateRating : null;
  const brand = p ? (typeof p.brand === 'string' ? p.brand : p.brand && typeof p.brand === 'object' ? p.brand.name : null) : null;
  const frames = [...document.querySelectorAll('iframe')].map((f) => f.getAttribute('src') || '').filter(Boolean);
  // The other colours and sizes: the links of each chooser under words like "Selected Quantity:" or "Selected Color:", each to a
  // product page and its product ID, with its name ("20 ml"). The chooser is the nearest box around those words (at most 6 boxes
  // out) that holds links to product pages.
  const variants = [];
  const LINKS = 'a[href*="/p/itm"]';
  const walk = document.body ? document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT) : null;
  for (let n = walk ? walk.nextNode() : null; n; n = walk.nextNode()) {
    if (!/^Selected\s+[^:]{1,40}:/i.test(squash(n.nodeValue))) continue;
    let box = n.parentElement;
    for (let up = 0; box && !box.querySelector(LINKS); up++) box = up < 6 ? box.parentElement : null;
    for (const a of box ? box.querySelectorAll(LINKS) : []) {
      let pid = null;
      try {
        pid = new URL(a.href).searchParams.get('pid');
      } catch {
        pid = null;
      }
      const label = squash(a.getAttribute('title')) || squash(a.innerText || a.textContent);
      if (pid && variants.length < 100) variants.push({ pid: pid.slice(0, 40), label: label && label.length <= 80 ? label : null });
    }
  }
  return {
    url: location.href,
    title: squash(document.title).slice(0, 400),
    text: (document.body ? document.body.innerText : '').slice(0, 8000),
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    product: p ? { name: squash(p.name).slice(0, 600) || null, brand: squash(brand).slice(0, 120) || null, sku: squash(p.sku).slice(0, 40) || null, rating: num(agg?.ratingValue), ratings: num(agg?.ratingCount), reviews: num(agg?.reviewCount) } : null,
    reviewLinks: [...document.querySelectorAll('a[href*="/product-reviews/"]')].map((a) => a.href).slice(0, 40),
    variants,
    robotFrame: frames.some((s) => /captcha|challenges\.cloudflare|arkoselabs/i.test(s)),
    robotForm: Boolean(document.querySelector('input[name*="captcha" i], .g-recaptcha, .h-captcha')),
  };
}

const ROBOT_WORDS = /are you a (human|robot)|verify (that )?you('| a)re (a )?human|(confirm|prove) (that )?you('| a)re (a )?human|i'?m not a robot|unusual (traffic|activity)|automated (requests|queries|access)|press (and|&) hold|captcha/i;
const BLOCK_WORDS = /access denied|you don'?t have permission to access|request (was )?blocked|(temporarily|been) blocked|too many requests/i;
const MISSING_WORDS = /page you are looking for (has been|was|is) (moved|deleted|removed)|page (was )?not found|this page (does not|doesn'?t) exist/i;
const ERROR_WORDS = /something went wrong|something'?s not right|site is (overloaded|down|under maintenance)|service (is )?unavailable|internal server error|bad gateway|gateway time-?out|please try again later/i;

/**
 * What kind of page Flipkart showed: { kind, why }, kind being 'captcha' (a
 * robot check), 'blocked', 'error', 'not-found' or 'page'. A page whose
 * JSON-LD names a product is a product page whatever its reviews say (one
 * may say "something went wrong"), and so is a page that shows reviews
 * (facts.reviews); only its address, a robot check in it or its status can
 * make it a robot check, a block or an error.
 */
export function whatPageIs(facts, status) {
  const f = facts ?? {};
  const url = String(f.url ?? '');
  const head = `${f.title ?? ''}\n${String(f.text ?? '').slice(0, 4000)}`;
  const product = Boolean(f.product?.name) || (Array.isArray(f.reviews) && f.reviews.length > 0);
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    path = '';
  }
  // A robot check's own address ("/captcha", "/challenge"), never a product's name in its address ("ab-challenge-wheel").
  const robotPath = /(?:^|\/)(?:captcha|challenge)s?(?:\/|$)/i.test(path);
  if (robotPath || f.robotFrame || f.robotForm || (!product && ROBOT_WORDS.test(head))) {
    return { kind: 'captcha', why: 'Flipkart showed a robot check.' };
  }
  if (status === 403 || status === 429 || (!product && BLOCK_WORDS.test(head))) return { kind: 'blocked', why: 'Flipkart refused to show the page.' };
  if (status === 404 || (!product && MISSING_WORDS.test(head))) return { kind: 'not-found', why: 'Flipkart says the page does not exist.' };
  if ((typeof status === 'number' && status >= 500) || (!product && ERROR_WORDS.test(head))) return { kind: 'error', why: 'Flipkart showed an error.' };
  if (typeof status === 'number' && status >= 400) return { kind: 'blocked', why: 'Flipkart did not show the page.' };
  return { kind: 'page', why: null };
}

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
const stars = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 5 ? Math.round(v * 10) / 10 : null);
const digits = (s) => {
  const n = Number(String(s ?? '').replace(/,/g, ''));
  return Number.isInteger(n) ? n : null;
};

/**
 * The product's name: the JSON-LD's; else, on a product page's address, the
 * page title before " - Price in India", as Flipkart titles its product pages
 * ("<name> - Price in India, Buy <name> Online ... | Flipkart.com"); else null.
 */
function nameOf(f) {
  if (f.product?.name) return f.product.name;
  const title = String(f.title ?? '').trim();
  const m = title.match(/^(.+?)\s+-\s+Price in India\b/i);
  return m && /\/p\/itm/i.test(String(f.url ?? '')) ? m[1].trim() : null;
}

/**
 * The link to all of a product's reviews: the page's own link to them
 * (without the one that shows only reviews about one thing, such as
 * "Brightness"), as https://www.flipkart.com/<name>/product-reviews/<item
 * ID>?pid=<product ID>; else, when the product has ratings or reviews, the
 * same link made from the page's address. Null when there is neither.
 */
export function allReviewsLink(f, pid, itemId, hasReviews) {
  for (const href of f.reviewLinks ?? []) {
    const u = parseUrl(href);
    if (!u || !isFlipkart(u) || u.searchParams.has('aid')) continue;
    const m = u.pathname.match(/^\/([^/]+)\/product-reviews\/(itm[0-9a-z]+)\/?$/i);
    if (!m) continue;
    const p = pidFrom(u) ?? pid;
    const q = new URLSearchParams();
    if (p) q.set('pid', p);
    if (u.searchParams.get('marketplace')) q.set('marketplace', u.searchParams.get('marketplace'));
    const query = q.toString();
    return `${FLIPKART_ORIGIN}/${m[1]}/product-reviews/${m[2].toLowerCase()}${query ? `?${query}` : ''}`;
  }
  if (!hasReviews || !itemId) return null;
  for (const raw of [f.canonical, f.url]) {
    const u = parseUrl(raw);
    const m = u && isFlipkart(u) ? u.pathname.match(/^\/([^/]+)\/p\/(itm[0-9a-z]+)\/?$/i) : null;
    if (m && m[2].toLowerCase() === itemId) return `${FLIPKART_ORIGIN}/${m[1]}/product-reviews/${itemId}${pid ? `?pid=${pid}&marketplace=FLIPKART` : ''}`;
  }
  return null;
}

/**
 * A product page as a campaign keeps it: { name, brand, pid, itemId,
 * variants: [{ pid, label }], rating, ratings, reviews, allReviews }, the
 * variants being the other colours and sizes it lists, each once, never the
 * product itself (label null when the page gives no name). name is null on a
 * page that is not a product's; brand is null when the page shows none; a
 * count Flipkart does not give is null.
 */
export function productOnPage(facts) {
  const f = facts ?? {};
  const p = f.product ?? {};
  const name = nameOf(f);
  // The product ID: the one the page says it shows (its JSON-LD), else the one in its address, else in its reviews' link.
  const pid = (ANY_PID.test(String(p.sku ?? '').toUpperCase()) ? String(p.sku).toUpperCase() : null) ?? pidFrom(f.url) ?? (f.reviewLinks ?? []).map(pidFrom).find(Boolean) ?? null;
  const itemId = itemIdFrom(f.url) ?? itemIdFrom(f.canonical) ?? (f.reviewLinks ?? []).map(itemIdFrom).find(Boolean) ?? null;
  // Counts the JSON-LD leaves out are looked for in the page's words: "1,355 Ratings & 47 Reviews", or "based on 1,355 ratings".
  const text = String(f.text ?? '');
  const both = text.match(/([\d,]+)\s+ratings?\s*(?:&|and)\s*([\d,]+)\s+reviews?/i);
  const based = text.match(/based on\s+([\d,]+)\s+ratings?/i);
  const ratings = count(p.ratings) ?? (both ? digits(both[1]) : based ? digits(based[1]) : null);
  const reviews = count(p.reviews) ?? (both ? digits(both[2]) : null);
  const variants = [];
  for (const v of Array.isArray(f.variants) ? f.variants : []) {
    const id = String(v?.pid ?? '').toUpperCase();
    const label = typeof v?.label === 'string' && v.label.trim() ? v.label.trim() : null;
    if (!ANY_PID.test(id) || id === pid) continue;
    const seen = variants.find((x) => x.pid === id);
    if (seen) seen.label ??= label;
    else variants.push({ pid: id, label });
  }
  return {
    name: name || null,
    brand: p.brand || null,
    pid,
    itemId,
    variants,
    rating: stars(p.rating),
    ratings,
    reviews,
    allReviews: name ? allReviewsLink(f, pid, itemId, Boolean(ratings || reviews)) : null,
  };
}
