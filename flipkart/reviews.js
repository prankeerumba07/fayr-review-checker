// A Flipkart product's public reviews, read in the Live Flipkart Browser with
// every rule of reading a product (browser.js): signed out, one page at a
// time, at least 3 seconds apart, a robot check never got around, and nothing
// ever typed into Flipkart (its login box is only closed with its close
// button). The product's "All reviews" link is opened newest first, page 1,
// then page 2, and so on, until the first page whose reviews are all older
// than a given date, the last page, or 50 pages, whichever comes first. A
// robot check, a block or an error stops it there ("Flipkart prevented this
// check"), and the pages read before it are kept. The reviews are kept only in
// data/flipkart/reviews/<product ID>.json, with when they were read. Nothing
// on the screen uses them yet: a later step searches them while checking a
// row, as the Amazon checker searches Amazon's reviews.

import { ANY_PID, parseUrl, isFlipkart } from './links.js';
import { whatPageIs } from './page-read.js';
import { prepareReviewsPage, readReviewsPage, reviewsInPageData, reviewsPageLink, dateFromWords, indiaDay } from './review-page.js';

/** The most pages of reviews read at one time. */
export const MAX_REVIEW_PAGES = 50;

/** What Flipkart did when it prevented a page, in plain words. */
const PREVENTED = {
  captcha: 'it showed a robot check, which this dashboard never answers',
  blocked: 'it refused the page',
  error: 'it showed an error',
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A date as the dashboard writes it: 12-10-2026. */
const written = (day) => day.split('-').reverse().join('-');
const pagesSaid = (n) => (n === 1 ? '1 page' : `${n} pages`);
const reviewsSaid = (n) => (n === 1 ? '1 review' : `${n} reviews`);
/** What happens to the pages read before a stop. */
const keptSaid = (n) => (n === 1 ? 'No review was read; try again later.' : `The reviews of ${n === 2 ? 'page 1' : `pages 1 to ${n - 1}`} were kept.`);

/**
 * Reads a product's public reviews, newest first. product — a product of a
 * campaign that was read (its read.allReviews and read.pid); since — a day
 * (YYYY-MM-DD): the reading stops after the first page whose reviews are all
 * older than it (none: it reads to the last page, or to maxPages). -> { pid,
 * link, readAt, since, pages (how many were read), total (how many reviews
 * Flipkart says the product has), end ('date', 'last page', 'limit',
 * 'prevented', 'closed', 'network', 'elsewhere' or 'none'), stoppedAt (the
 * page that stopped it), says (in plain words), loginBox (whether Flipkart's
 * login box showed), reviews: [{ id, name, stars, title, text, dateSaid,
 * date, dateLatest, city, certified, reviewFor, page }] }.
 */
export async function readReviews(browser, product, { since = null, maxPages = MAX_REVIEW_PAGES, now = () => new Date(), onWait } = {}) {
  const at = now();
  const today = indiaDay(at);
  const until = typeof since === 'string' && DAY.test(since) ? since : null;
  const link = product?.read?.allReviews ?? null;
  const out = { pid: product?.read?.pid ?? product?.pid ?? null, link, readAt: at.toISOString(), since: until, pages: 0, total: null, end: null, stoppedAt: null, says: null, loginBox: false, reviews: [] };
  const stop = (end, n, says) => Object.assign(out, { end, stoppedAt: n, says: `${says} ${keptSaid(n)}` });
  if (!reviewsPageLink(link, 1)) return Object.assign(out, { end: 'none', says: 'Flipkart shows no reviews for this product, so no page was opened.' });
  try {
    await browser.begin();
  } catch {
    return Object.assign(out, { end: 'closed', stoppedAt: 1, says: 'The Live Flipkart Browser could not be opened on this computer, so no review was read.' });
  }
  const seen = new Set();
  for (let n = 1; n <= maxPages; n++) {
    const res = await browser.open(reviewsPageLink(link, n), { onWait, read: readReviewsPage, prepare: prepareReviewsPage, html: true });
    if (res?.error === 'elsewhere') return stop('elsewhere', n, `Page ${n} of the reviews led to ${res.host}, not to Flipkart, so the reading stopped there.`);
    if (!res?.ok) {
      if (res?.error === 'closed') return stop('closed', n, `The Live Flipkart Browser was closed, so the reading stopped at page ${n} of the reviews.`);
      return stop('network', n, `The Live Flipkart Browser could not open page ${n} of the reviews, so the reading stopped there. ${res?.message ?? ''}`.trim());
    }
    if (res.prepared?.loginBox) out.loginBox = true;
    const u = parseUrl(res.url);
    if (!u || !isFlipkart(u)) return stop('elsewhere', n, `Page ${n} of the reviews led to ${u ? u.hostname : 'another website'}, not to Flipkart, so the reading stopped there.`);
    // The page's own data has each review whole, with its own ID; else the reviews as the page shows them.
    const data = reviewsInPageData(res.html);
    const found = data.length ? data : (res.facts?.reviews ?? []).map((r) => ({ id: null, ...r }));
    const page = whatPageIs({ ...res.facts, reviews: found }, res.status);
    if (PREVENTED[page.kind]) return stop('prevented', n, `Flipkart prevented this check at page ${n} of the reviews: ${PREVENTED[page.kind]}.`);
    out.total ??= Number.isInteger(res.facts?.total) ? res.facts.total : null;
    if (page.kind === 'not-found' && n === 1) return Object.assign(out, { end: 'none', says: 'Flipkart says this product has no reviews page.' });
    // A page with no reviews, or only the ones already read, is past the last page.
    const fresh = page.kind === 'not-found' ? [] : found.filter((r) => !seen.has(r.id ?? `${r.name}|${r.stars}|${r.title}|${r.text}|${r.dateSaid}`));
    if (!fresh.length) break;
    out.pages = n;
    for (const r of fresh) {
      seen.add(r.id ?? `${r.name}|${r.stars}|${r.title}|${r.text}|${r.dateSaid}`);
      const when = dateFromWords(r.dateSaid, today);
      out.reviews.push({ id: r.id, name: r.name, stars: r.stars, title: r.title, text: r.text, dateSaid: r.dateSaid, date: when?.date ?? null, dateLatest: when?.latest ?? null, city: r.city, certified: r.certified, reviewFor: r.reviewFor, page: n });
    }
    if (until && out.reviews.slice(-fresh.length).every((r) => r.dateLatest && r.dateLatest < until)) {
      out.end = 'date';
      break;
    }
    if (out.total !== null && out.reviews.length >= out.total) break;
    if (n === maxPages) out.end = 'limit';
  }
  out.end ??= 'last page';
  const count = reviewsSaid(out.reviews.length);
  out.says = {
    date: `${count} read from ${pagesSaid(out.pages)}, newest first, down to the first page whose reviews are all older than ${until ? written(until) : ''}.`,
    'last page': out.reviews.length ? `${count} read from ${pagesSaid(out.pages)}: all the reviews Flipkart shows.` : 'Flipkart shows no reviews for this product.',
    limit: `${count} read from ${pagesSaid(out.pages)}, the most read at one time; older reviews were not read.`,
  }[out.end];
  return out;
}

/** Reads a product's public reviews (as readReviews does) and keeps them in data/flipkart/reviews/<product ID>.json, in place of the ones read before. */
export async function readAndKeepReviews({ browser, store, product, since = null, maxPages = MAX_REVIEW_PAGES, now = () => new Date(), onWait } = {}) {
  const pid = product?.read?.pid ?? product?.pid ?? null;
  if (!ANY_PID.test(String(pid ?? ''))) throw new Error('This product has no Flipkart product ID, so its reviews cannot be kept.');
  const out = await readReviews(browser, product, { since, maxPages, now, onWait });
  await store.saveReviews(pid, out);
  return out;
}
