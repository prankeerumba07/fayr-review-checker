// A Flipkart product's public reviews, read in the Live Flipkart Browser with
// every rule of reading a product (browser.js): signed out, one page at a
// time, at least 3 seconds apart, a robot check never got around, and nothing
// ever typed into Flipkart (its login box is only closed with its close
// button). As staff would find them (readProductReviews): the product's own
// page, found by its product ID, then its "See all reviews" link, opened
// newest first, page 1, then page 2, and so on, until the first page whose
// reviews are all older than a given date, the last page, or 50 pages,
// whichever comes first; a reading that stopped at a date can go on from
// where it stopped. A robot check, a block or an error stops it there
// ("Flipkart prevented this check"), and so does a page that takes too long;
// the pages read before it are kept. The reviews are kept only in
// data/flipkart/reviews/<product ID>.json, with when they were read: step 7
// of a row's check searches them (check.js), as the Amazon checker searches
// Amazon's reviews, read once in a checking run for every row (routes.js).

import { ANY_PID, parseUrl, isFlipkart, pageForPid } from './links.js';
import { whatPageIs, productOnPage } from './page-read.js';
import { prepareReviewsPage, readReviewsPage, reviewsInPageData, reviewsPageLink, reviewsLinkInPage, dateFromWords, indiaDay } from './review-page.js';

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

/** A review read before, told from the others: its own ID, else all it shows. */
const keyOf = (r) => r.id ?? `${r.name}|${r.stars}|${r.title}|${r.text}|${r.dateSaid}`;

/**
 * Reads a product's public reviews, newest first. product — a product of a
 * campaign that was read (its read.allReviews and read.pid); since — a day
 * (YYYY-MM-DD): the reading stops after the first page whose reviews are all
 * older than it (none: it reads to the last page, or to maxPages); from — an
 * earlier reading of the same "All reviews" link that stopped at a date: its
 * reviews are kept, and the reading goes on from its next page; onPage(n) —
 * told before each page is opened; signal — Stop: no page is opened after it.
 * -> { pid, link, readAt, since, pages (how many were read), total (how many
 * reviews Flipkart says the product has), end ('date', 'last page', 'limit',
 * 'prevented', 'slow', 'closed', 'network', 'elsewhere', 'stopped' or
 * 'none'), prevented ('captcha', 'blocked' or
 * 'error', when Flipkart prevented it), stoppedAt (the page that stopped it),
 * says (in plain words), loginBox (whether Flipkart's login box showed),
 * reviews: [{ id, name, stars, title, text, dateSaid, date, dateLatest, city,
 * certified, reviewFor, page }] }.
 */
export async function readReviews(browser, product, { since = null, maxPages = MAX_REVIEW_PAGES, now = () => new Date(), onWait, onPage = () => {}, from = null, signal = null } = {}) {
  const at = now();
  const today = indiaDay(at);
  const until = typeof since === 'string' && DAY.test(since) ? since : null;
  const link = product?.read?.allReviews ?? null;
  const out = { pid: product?.read?.pid ?? product?.pid ?? null, link, readAt: at.toISOString(), since: until, pages: 0, total: null, end: null, stoppedAt: null, says: null, loginBox: false, reviews: [] };
  const stop = (end, n, says) => Object.assign(out, { end, stoppedAt: n, says: `${says} ${keptSaid(n)}` });
  if (!reviewsPageLink(link, 1)) return Object.assign(out, { end: 'none', says: 'Flipkart shows no reviews for this product, so no page was opened.' });
  // Going on from where an earlier reading of the same link stopped: its reviews are kept, and its next page is next.
  if (from && from.link === link && Number.isInteger(from.pages) && from.pages > 0 && Array.isArray(from.reviews)) Object.assign(out, { pages: from.pages, total: from.total ?? null, reviews: [...from.reviews], loginBox: Boolean(from.loginBox) });
  try {
    await browser.begin();
  } catch {
    return Object.assign(out, { end: 'closed', stoppedAt: out.pages + 1, says: 'The Live Flipkart Browser could not be opened on this computer, so no review was read.' });
  }
  const seen = new Set(out.reviews.map(keyOf));
  for (let n = out.pages + 1; n <= maxPages; n++) {
    if (signal?.aborted) return stop('stopped', n, `The check was stopped, so the reading stopped before page ${n} of the reviews.`);
    onPage(n);
    const res = await browser.open(reviewsPageLink(link, n), { onWait, read: readReviewsPage, prepare: prepareReviewsPage, html: true });
    if (res?.error === 'elsewhere') return stop('elsewhere', n, `Page ${n} of the reviews led to ${res.host}, not to Flipkart, so the reading stopped there.`);
    if (!res?.ok) {
      if (res?.error === 'closed') return stop('closed', n, `The Live Flipkart Browser was closed, so the reading stopped at page ${n} of the reviews.`);
      if (res?.error === 'timeout') return stop('slow', n, `Flipkart took too long to show page ${n} of the reviews, so the reading stopped there.`);
      return stop('network', n, `The Live Flipkart Browser could not open page ${n} of the reviews, so the reading stopped there. ${res?.message ?? ''}`.trim());
    }
    if (res.prepared?.loginBox) out.loginBox = true;
    const u = parseUrl(res.url);
    if (!u || !isFlipkart(u)) return stop('elsewhere', n, `Page ${n} of the reviews led to ${u ? u.hostname : 'another website'}, not to Flipkart, so the reading stopped there.`);
    // The page's own data has each review whole, with its own ID; else the reviews as the page shows them.
    const data = reviewsInPageData(res.html);
    const found = data.length ? data : (res.facts?.reviews ?? []).map((r) => ({ id: null, ...r }));
    const page = whatPageIs({ ...res.facts, reviews: found }, res.status);
    if (PREVENTED[page.kind]) return Object.assign(stop('prevented', n, `Flipkart prevented this check at page ${n} of the reviews: ${PREVENTED[page.kind]}.`), { prevented: page.kind });
    out.total ??= Number.isInteger(res.facts?.total) ? res.facts.total : null;
    if (page.kind === 'not-found' && n === 1) return Object.assign(out, { end: 'none', says: 'Flipkart says this product has no reviews page.' });
    // A page with no reviews, or only the ones already read, is past the last page.
    const fresh = page.kind === 'not-found' ? [] : found.filter((r) => !seen.has(keyOf(r)));
    if (!fresh.length) break;
    out.pages = n;
    for (const r of fresh) {
      seen.add(keyOf(r));
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

/**
 * A campaign product's public reviews as staff would find them: the product's
 * own page on Flipkart, found by its product ID, then its "See all reviews"
 * link (the page's own link to all its reviews, else the one its own data
 * names), read newest first as readReviews reads them. -> readReviews' answer,
 * with product: { pid, name, rating, ratings, reviews } as its page shows it.
 * end is 'none' when the page does not show the product, or no way to all its
 * reviews; the product's page that cannot be had ends it as a review page
 * would (stoppedAt 0). from — an earlier reading of this product: the reading
 * goes on from where it stopped, and the product's page is not opened again.
 */
export async function readProductReviews(browser, pid, { since = null, maxPages = MAX_REVIEW_PAGES, now = () => new Date(), onWait, onPage = () => {}, from = null, signal = null } = {}) {
  const at = now();
  const until = typeof since === 'string' && DAY.test(since) ? since : null;
  const out = { pid: ANY_PID.test(String(pid ?? '')) ? pid : null, link: null, readAt: at.toISOString(), since: until, pages: 0, total: null, end: null, stoppedAt: null, says: null, loginBox: false, reviews: [], product: null };
  const none = (end, says, extra = {}) => Object.assign(out, { end, says, ...extra });
  if (!out.pid) return none('none', 'The product has no Flipkart product ID, so its reviews could not be read.');
  if (from?.link && from.pid === pid && from.product) return { ...(await readReviews(browser, { read: { pid, allReviews: from.link } }, { since: until, maxPages, now, onWait, onPage, from, signal })), product: from.product };
  if (signal?.aborted) return none('stopped', "The check was stopped, so the product's page was not opened.", { stoppedAt: 0 });
  try {
    await browser.begin();
  } catch {
    return none('closed', 'The Live Flipkart Browser could not be opened on this computer, so no review was read.', { stoppedAt: 0 });
  }
  onPage(0);
  const res = await browser.open(pageForPid(pid), { onWait, html: true });
  if (res?.error === 'elsewhere') return none('elsewhere', `The product's page led to ${res.host}, not to Flipkart, so no review was read.`, { stoppedAt: 0 });
  if (!res?.ok) {
    if (res?.error === 'closed') return none('closed', "The Live Flipkart Browser was closed, so the product's page was not read.", { stoppedAt: 0 });
    if (res?.error === 'timeout') return none('slow', "Flipkart took too long to show the product's page, so no review was read.", { stoppedAt: 0 });
    return none('network', `The Live Flipkart Browser could not open the product's page, so no review was read. ${res?.message ?? ''}`.trim(), { stoppedAt: 0 });
  }
  const u = parseUrl(res.url);
  if (!u || !isFlipkart(u)) return none('elsewhere', `The product's page led to ${u ? u.hostname : 'another website'}, not to Flipkart, so no review was read.`, { stoppedAt: 0 });
  const page = whatPageIs(res.facts, res.status);
  if (PREVENTED[page.kind]) return none('prevented', `Flipkart prevented this check at the product's page: ${PREVENTED[page.kind]}. No review was read; try again later.`, { prevented: page.kind, stoppedAt: 0 });
  const p = productOnPage(res.facts);
  if (page.kind === 'not-found' || !p.name || p.pid !== pid) return none('none', "Flipkart's page for the product's ID did not show the product, so its reviews could not be read.");
  out.product = { pid, name: p.name, rating: p.rating, ratings: p.ratings, reviews: p.reviews };
  const link = p.allReviews ?? reviewsLinkInPage(res.html, pid);
  if (!link) return none('none', p.reviews === 0 ? 'Flipkart shows no reviews for this product.' : "The product's page on Flipkart showed no way to see all its reviews, so they could not be read.");
  return { ...(await readReviews(browser, { read: { pid, allReviews: link } }, { since: until, maxPages, now, onWait, onPage, signal })), product: out.product };
}

/** Reads a product's public reviews (as readReviews does) and keeps them in data/flipkart/reviews/<product ID>.json, in place of the ones read before. */
export async function readAndKeepReviews({ browser, store, product, since = null, maxPages = MAX_REVIEW_PAGES, now = () => new Date(), onWait } = {}) {
  const pid = product?.read?.pid ?? product?.pid ?? null;
  if (!ANY_PID.test(String(pid ?? ''))) throw new Error('This product has no Flipkart product ID, so its reviews cannot be kept.');
  const out = await readReviews(browser, product, { since, maxPages, now, onWait });
  await store.saveReviews(pid, out);
  return out;
}
