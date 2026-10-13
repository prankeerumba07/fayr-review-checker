// Reading one page of a Flipkart product's public reviews (its "All reviews"
// page, newest first). prepareReviewsPage() and readReviewsPage() run INSIDE
// the page (Playwright's page.evaluate), so each is self-contained: it uses
// nothing from this module's scope or its imports. prepareReviewsPage only
// closes Flipkart's login box with its close button, when one covers the
// page, and presses "Read more" where a review's text is cut (never a link,
// so no other page opens); it never types anything. readReviewsPage reads each
// review as the page shows it. In Node: the reviews in the page's own data,
// as Flipkart sent the page (reviewsInPageData: they carry each review's own
// ID and its whole text), and Flipkart's date words made into dates
// (dateFromWords). Reviews are kept as Flipkart shows them; whatever is shown
// on the screen later is cleaned first.

import { parseUrl, isFlipkart, FLIPKART_ORIGIN } from './links.js';

/** How a review page is asked for: Flipkart's newest reviews first. */
export const NEWEST_FIRST = 'MOST_RECENT';

/**
 * Inside the page: Flipkart's login box, when one covers the page (a box over
 * it that asks for a mobile number or an email address), closed with its close
 * button; nothing is ever typed in it. Then "Read more" pressed wherever a
 * review's text is cut, unless it is a link. -> { loginBox, closed, pressed }.
 */
export function prepareReviewsPage() {
  const squash = (s) => (s === null || s === undefined ? '' : String(s)).replace(/\s+/g, ' ').trim();
  const shown = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const did = { loginBox: false, closed: false, pressed: 0 };
  const boxes = [...document.querySelectorAll('body *')].filter((e) => {
    const where = getComputedStyle(e).position;
    return (where === 'fixed' || where === 'absolute') && shown(e) && /Request OTP|Enter Email\/Mobile number|Enter Mobile Number|Login (?:with|using) OTP/i.test(e.innerText || '');
  });
  // The outermost such box: its close button may sit on its edge.
  const box = boxes.find((b) => !boxes.some((o) => o !== b && o.contains(b))) ?? null;
  if (box) {
    did.loginBox = true;
    const close = [...box.querySelectorAll('*')].find((e) => shown(e) && !e.closest('a[href]') && (/^(?:✕|×|x|close)$/i.test(squash(e.textContent)) || /^close$/i.test(squash(e.getAttribute('aria-label')))));
    if (close) {
      close.click();
      did.closed = true;
    }
  }
  for (const e of document.querySelectorAll('body *')) {
    if (e.childElementCount === 0 && /^read more$/i.test(squash(e.textContent)) && shown(e) && !e.closest('a[href]')) {
      e.click();
      did.pressed++;
    }
  }
  return did;
}

/**
 * Inside the page: every review as the page shows it ({ name, stars, title,
 * text, dateSaid, city, certified, reviewFor }), how many reviews the product
 * has ("1,355 ratings and 47 reviews"), and the page's words, to tell a robot
 * check or a block. A review's box is found from its stars and the "•" after
 * them; in it, the title follows the stars, then "Review for: …" when shown,
 * the text, the reviewer's name and ", city", then "Helpful", "Verified
 * Purchase" and the date ("· 1 month ago").
 */
export function readReviewsPage() {
  const squash = (s) => (s === null || s === undefined ? '' : String(s)).replace(/\s+/g, ' ').trim();
  const leaves = (root) => [...root.querySelectorAll('*')].filter((e) => e.childElementCount === 0 && squash(e.textContent));
  const STARS = /^[1-5](?:\.0)?$/;
  const DATE = /^(?:·\s*)?(?:today|yesterday|\d+ (?:days?|weeks?|months?|years?) ago|an? (?:day|week|month|year) ago|(?:\d{1,2} )?[a-z]{3,9},? \d{4})$/i;
  const HELPFUL = /^Helpful(?: for \d+)?$/i;
  const CERTIFIED = /^(?:Certified Buyer|Verified Purchase|Verified Buyer)$/i;
  const all = document.body ? leaves(document.body) : [];
  const starsAt = (words) => words.findIndex((w, k) => STARS.test(w) && words[k + 1] === '•');
  const reviews = [];
  const done = new Set();
  for (let i = 0; i + 1 < all.length; i++) {
    if (!STARS.test(squash(all[i].textContent)) || squash(all[i + 1].textContent) !== '•') continue;
    // The review's box: the nearest box around its stars that also holds its date, and no other review's stars.
    let card = all[i].parentElement;
    for (let up = 0; card && up < 10 && !leaves(card).some((e) => DATE.test(squash(e.textContent))); up++) card = card.parentElement;
    if (!card || done.has(card)) continue;
    const els = leaves(card);
    const words = els.map((e) => squash(e.textContent));
    if (words.filter((w, k) => STARS.test(w) && words[k + 1] === '•').length !== 1) continue;
    done.add(card);
    const s = starsAt(words);
    let k = s + 2;
    const title = words[k] !== undefined && !/^Review for:/i.test(words[k]) && !HELPFUL.test(words[k]) ? words[k++] : '';
    let reviewFor = null;
    if (/^Review for:/i.test(words[k] ?? '')) reviewFor = words[k++].replace(/^Review for:\s*/i, '') || null;
    let end = words.findIndex((w, j) => j >= k && HELPFUL.test(w));
    if (end < 0) end = words.findIndex((w, j) => j >= k && (CERTIFIED.test(w) || DATE.test(w)));
    if (end < 0) end = words.length;
    let at = end - 1;
    let city = null;
    if (at >= k && words[at].startsWith(',')) city = words[at--].replace(/^,\s*/, '') || null;
    const name = at >= k ? words[at] : null;
    // The text: a paragraph for each box of words between the title and the name, without a "Read more" left over.
    const boxes = [];
    for (const e of els.slice(k, Math.max(k, at))) {
      const own = e.closest('[dir="auto"]');
      const box = own && card.contains(own) ? own : e;
      if (!boxes.includes(box)) boxes.push(box);
    }
    const text = boxes
      .map((b) => String(b.innerText || b.textContent || '').trim())
      .join('\n')
      .replace(/\s*(?:…|\.\.\.)?\s*read more$/i, '')
      .trim();
    const date = [...words].reverse().find((w) => DATE.test(w)) ?? null;
    reviews.push({ name, stars: Number(words[s]), title, text, dateSaid: date ? date.replace(/^·\s*/, '') : null, city, certified: words.some((w) => CERTIFIED.test(w)), reviewFor });
  }
  const body = document.body ? document.body.innerText : '';
  const counts = body.match(/([\d,]+)\s+ratings?\s*(?:&|and)\s*([\d,]+)\s+reviews?/i);
  const frames = [...document.querySelectorAll('iframe')].map((f) => f.getAttribute('src') || '').filter(Boolean);
  return {
    url: location.href,
    title: squash(document.title).slice(0, 400),
    text: body.slice(0, 8000),
    product: null,
    reviews,
    total: counts ? Number(counts[2].replace(/,/g, '')) : null,
    robotFrame: frames.some((f) => /captcha|challenges\.cloudflare|arkoselabs/i.test(f)),
    robotForm: Boolean(document.querySelector('input[name*="captcha" i], .g-recaptcha, .h-captcha')),
  };
}

/**
 * The page's own data, as Flipkart sent the page: the object it gives to
 * window.__INITIAL_STATE__, or null when there is none or it cannot be read.
 */
export function pageData(html) {
  const t = String(html ?? '');
  const m = /window\.__INITIAL_STATE__\s*=\s*\{/.exec(t);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(t.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const words = (v, limit = 5000) => (typeof v === 'string' ? v.replace(/[^\S\n]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, limit) : '');

/**
 * The reviews in the page's own data, in the page's order: each one's own ID,
 * the reviewer's name, the stars, the title, the whole text, the date words,
 * the city, whether Flipkart marks it a certified (verified) purchase, and
 * what it is a review for ("Quantity 50 ml"). [] when the page has none.
 */
export function reviewsInPageData(html) {
  const out = [];
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 60) return;
    if (o.type === 'ProductReviewValue') {
      const stars = Number(o.rating);
      const about = (Array.isArray(o.productAttributeList) ? o.productAttributeList : []).map((a) => words(`${a?.name ?? ''} ${a?.value ?? ''}`, 80)).filter(Boolean);
      out.push({
        id: words(o.id, 80) || null,
        name: words(o.author, 120) || null,
        stars: Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null,
        title: words(o.title, 300),
        text: words(o.text),
        dateSaid: words(o.created, 40) || null,
        city: words(o.location?.city, 80) || null,
        certified: Boolean(o.certifiedBuyer || o.reviewPropertyMap?.VERIFIED_PURCHASE),
        reviewFor: about.join(', ') || null,
      });
      return;
    }
    for (const v of Array.isArray(o) ? o : Object.values(o)) walk(v, depth + 1);
  };
  walk(pageData(html), 0);
  return out;
}

/**
 * The address of one page of a product's reviews, newest first, from its "All
 * reviews" link: https://www.flipkart.com/<name>/product-reviews/<item
 * ID>?pid=<product ID>&marketplace=FLIPKART&sortOrder=MOST_RECENT&page=<n>.
 * Null when the link is not one.
 */
export function reviewsPageLink(allReviews, n) {
  const u = parseUrl(allReviews);
  if (!u || !isFlipkart(u) || !/^\/[^/]+\/product-reviews\/itm[0-9a-z]+\/?$/i.test(u.pathname)) return null;
  const q = new URLSearchParams();
  for (const key of ['pid', 'marketplace']) if (u.searchParams.get(key)) q.set(key, u.searchParams.get(key));
  q.set('sortOrder', NEWEST_FIRST);
  q.set('page', String(n));
  return `${FLIPKART_ORIGIN}${u.pathname.replace(/\/$/, '')}?${q}`;
}

/**
 * The link to all of a product's reviews, from its page as Flipkart sent it,
 * whose own data names it even when the page shows it only further down: the
 * first "/<name>/product-reviews/<item ID>" in it that is for this product and
 * not only about one thing ("aid="); else one made from the first
 * "/<name>/p/<item ID>?pid=<this product ID>" in it. As
 * https://www.flipkart.com/<name>/product-reviews/<item
 * ID>?pid=<product ID>&marketplace=FLIPKART; null when there is neither.
 */
export function reviewsLinkInPage(html, pid) {
  const t = String(html ?? '')
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
  const queryOf = (q) => new URLSearchParams(String(q ?? '').replace(/^\?/, ''));
  const made = (name, item) => `${FLIPKART_ORIGIN}/${name.toLowerCase()}/product-reviews/${item.toLowerCase()}?pid=${pid}&marketplace=FLIPKART`;
  if (!pid) return null;
  for (const m of t.matchAll(/\/([a-z0-9][a-z0-9-]{0,200})\/product-reviews\/(itm[0-9a-z]{6,20})(?![0-9a-z])(\?[^"'\s<>\\]*)?/gi)) {
    const q = queryOf(m[3]);
    if (q.has('aid')) continue;
    const p = String(q.get('pid') ?? '').toUpperCase();
    if (!p || p === pid) return made(m[1], m[2]);
  }
  for (const m of t.matchAll(/\/([a-z0-9][a-z0-9-]{0,200})\/p\/(itm[0-9a-z]{6,20})(?![0-9a-z])(\?[^"'\s<>\\]*)?/gi)) {
    if (String(queryOf(m[3]).get('pid') ?? '').toUpperCase() === pid) return made(m[1], m[2]);
  }
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const FULL_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** India's date at a moment, as YYYY-MM-DD: Flipkart's "Today" is India's today. */
export const indiaDay = (at) => new Date(new Date(at).getTime() + 330 * 60_000).toISOString().slice(0, 10);

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12

/**
 * Flipkart's date words made into dates, from India's date on the day the
 * page was read (today, as YYYY-MM-DD): { date, latest }, date being the
 * plain reading of the words and latest the last day they can mean. "Today",
 * "1 day ago" and "12 Aug, 2026" name one day; "2 months ago" may be a little
 * less than two months ago (latest: half a month later), and "Aug, 2026" any
 * day of August (date: its first day, latest: its last); latest is never
 * after today. Null for words it does not know.
 */
export function dateFromWords(said, today) {
  const w = String(said ?? '').replace(/^·\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const [y, m, d] = String(today ?? '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const back = (days) => iso(Date.UTC(y, m - 1, d - days));
  const monthsBack = (n) => {
    const first = new Date(Date.UTC(y, m - 1 - n, 1));
    const yy = first.getUTCFullYear();
    const mm = first.getUTCMonth() + 1;
    return iso(Date.UTC(yy, mm - 1, Math.min(d, lastDay(yy, mm))));
  };
  const plus = (day, days) => {
    const t = iso(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000);
    return t > today ? today : t;
  };
  const one = (day) => ({ date: day, latest: day });
  if (w === 'today') return one(today);
  if (w === 'yesterday') return one(back(1));
  const ago = w.match(/^(\d+|an?) (day|week|month|year)s? ago$/);
  if (ago) {
    const n = /^an?$/.test(ago[1]) ? 1 : Number(ago[1]);
    if (ago[2] === 'day') return one(back(n));
    if (ago[2] === 'week') return one(back(7 * n));
    if (ago[2] === 'month') {
      const date = monthsBack(n);
      return { date, latest: plus(date, 15) };
    }
    const date = monthsBack(12 * n);
    return { date, latest: plus(date, 182) };
  }
  const named = w.match(/^(?:(\d{1,2}) )?([a-z]{3,9}),? (\d{4})$/);
  if (named) {
    const mi = MONTHS.indexOf(named[2].slice(0, 3));
    if (mi < 0 || !FULL_MONTHS[mi].startsWith(named[2])) return null;
    const year = Number(named[3]);
    if (named[1]) {
      const day = Number(named[1]);
      return day >= 1 && day <= lastDay(year, mi + 1) ? one(iso(Date.UTC(year, mi, day))) : null;
    }
    const latest = iso(Date.UTC(year, mi, lastDay(year, mi + 1)));
    return { date: iso(Date.UTC(year, mi, 1)), latest: latest > today ? today : latest };
  }
  return null;
}
