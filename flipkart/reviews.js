// A Flipkart product's public reviews, read in the Live Flipkart Browser with
// every rule of reading a product (browser.js): signed out, one page at a
// time, at least 3 seconds apart (pages of reviews 8 seconds apart), a robot
// check never got around, and nothing ever typed into Flipkart (its login box
// is only closed with its close button). As staff would find them
// (readProductReviews): the product's own page, found by its product ID, then
// its "See all reviews" link, opened newest first, page 1, then page 2, and
// so on, until the first page whose reviews are all older than a given date,
// the last page, or 50 pages, whichever comes first. A robot check or a block
// stops it there ("Flipkart prevented this check", with the page's status
// number, its title and whether it showed any reviews), and so does an error
// page still there when it is opened once more 60 seconds later (the only
// page ever opened again), and a page that takes too long; the pages read
// before it are kept. A
// reading that stopped, at a date or part way, can go on from the page where
// it stopped, keeping the pages read before. Each review keeps its own link,
// as the page's data gives it (the one link to one review Flipkart's website
// opens). The reviews are kept only in
// data/flipkart/reviews/<product ID>.json, with when they were read (and the
// ones since a campaign's start date in <product ID>-kept.json too, by
// routes.js with kept-reviews.js): step 7
// of a row's check searches them (check.js), as the Amazon checker searches
// Amazon's reviews, read once in a checking run for every row (routes.js).

import { ANY_PID, parseUrl, isFlipkart, pageForPid } from './links.js';
import { whatPageIs, productOnPage } from './page-read.js';
import { prepareReviewsPage, readReviewsPage, reviewsInPageData, reviewsPageLink, reviewsLinkInPage, dateFromWords, indiaDay } from './review-page.js';

/** The most pages of reviews read at one time. */
export const MAX_REVIEW_PAGES = 50;
/** How long after the page before a page of reviews is opened, at the least: gentler than other pages. */
export const REVIEW_PAGE_GAP_MS = 8000;
/** How long after Flipkart's error page before that page is opened once more: the only page ever opened again, never after a robot check or a refused page. */
export const ERROR_WAIT_MS = 60_000;

/** What Flipkart did when it prevented a page, in plain words. */
const PREVENTED = {
  captcha: 'it showed a robot check, which this dashboard never answers',
  blocked: 'it refused the page',
  error: 'it showed an error',
};
/** Said after what Flipkart did on a page opened once more after an error. */
const againSaid = (kind) => (kind === 'error' ? `, also when the page was opened once more ${ERROR_WAIT_MS / 1000} seconds later` : `, when the page was opened once more ${ERROR_WAIT_MS / 1000} seconds after an error`);

/** Waits ms, or less when Stop is pressed. */
function waitFor(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}
/** What Flipkart showed on a page that opened on Flipkart (page-read.js whatPageIs), with the reviews it shows when told how to find them; else null. */
function kindOn(res, reviewsOf = null) {
  const u = res?.ok ? parseUrl(res.url) : null;
  if (!u || !isFlipkart(u)) return null;
  return whatPageIs(reviewsOf ? { ...res.facts, reviews: reviewsOf(res) } : res.facts, res.status).kind;
}
/** A page of reviews' reviews: from the page's own data, each whole with its own ID; else as the page shows them. */
function reviewsOn(res) {
  const data = reviewsInPageData(res.html);
  return data.length ? data : (res.facts?.reviews ?? []).map((r) => ({ id: null, ...r, link: null }));
}
/**
 * Opens a page (open); when Flipkart shows an error on it, waits
 * ERROR_WAIT_MS, told first (onAgain), and opens it once more, only once;
 * never after a robot check or a refused page, and nothing after Stop.
 * -> { res, again (opened once more), stopped }
 */
async function openOnceMore(open, kindOf, { sleep, signal, onAgain }) {
  const res = await open();
  if (kindOf(res) !== 'error') return { res, again: false, stopped: false };
  onAgain(ERROR_WAIT_MS);
  await sleep(ERROR_WAIT_MS, signal);
  if (signal?.aborted) return { res, again: false, stopped: true };
  return { res: await open(), again: true, stopped: false };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A date as the dashboard writes it: 12-10-2026. */
const written = (day) => day.split('-').reverse().join('-');
const reviewsSaid = (n) => (n === 1 ? '1 review' : `${n} reviews`);
/** What happens to the reviews read before a stop (never a page's number: Flipkart's website shows none). */
const keptSaid = (n) => (n === 0 ? 'No review was read; try again later.' : n === 1 ? 'The review read before was kept.' : `The ${n} reviews read before were kept.`);

/** A review read before, told from the others: its own ID, else all it shows. */
const keyOf = (r) => r.id ?? `${r.name}|${r.stars}|${r.title}|${r.text}|${r.dateSaid}`;

/** What a page Flipkart prevented showed, in plain terms, never a name or a review's words: { page (0: the product's page), status, title, reviews (how many it showed; null on the product's page) }. */
function refusedPage(n, res, found) {
  const t = String(res?.facts?.title ?? '').replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  return { page: n, status: Number.isInteger(res?.status) ? res.status : null, title: t.length > 120 ? `${t.slice(0, 119)}…` : t, reviews: found ? found.length : null };
}
/** The same, in a sentence. */
function refusedSaid(r) {
  const parts = [`status ${r.status ?? 'unknown'}`, r.title ? `the title "${r.title}"` : 'no title', ...(r.reviews === null ? [] : [r.reviews ? `${reviewsSaid(r.reviews)} on it` : 'no reviews on it'])];
  return `The page Flipkart sent had ${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}.`;
}

/**
 * Reads a product's public reviews, newest first. product — a product of a
 * campaign that was read (its read.allReviews and read.pid); since — a day
 * (YYYY-MM-DD): the reading stops after the first page whose reviews are all
 * older than it (none: it reads to the last page, or to maxPages); from — an
 * earlier reading of the same "All reviews" link that stopped, at a date or
 * part way: its reviews are kept, and the reading goes on from the page after
 * its last one (none is opened when its last page is already all older than
 * the date); onPage(n, read, wait) — told before each page is opened, with how
 * many reviews were read before it, and with wait (ERROR_WAIT_MS) before a
 * page that showed an error is opened once more; signal — Stop: no page is
 * opened after it; sleep — how that wait is waited (tests only). -> { pid, link, readAt, since, pages (how many
 * were read), total (how many reviews Flipkart says the product has), end
 * ('date', 'last page', 'limit', 'prevented', 'slow', 'closed', 'network',
 * 'elsewhere', 'stopped' or 'none'), prevented ('captcha', 'blocked' or
 * 'error', when Flipkart prevented it), refused (what that page showed:
 * { page, status, title, reviews }), stoppedAt (the page that stopped it),
 * says (in plain words), loginBox (whether Flipkart's login box showed),
 * wentOn (the page it went on from, when it went on from an earlier
 * reading), opened (how many pages it opened), links (true: each review's
 * own link was looked for; a copy kept before 14-10-2026 has none), reviews:
 * [{ id, name, stars, title, text, dateSaid, date, dateLatest, city,
 * certified, reviewFor, link (its own link on Flipkart, or null), page }] }.
 */
export async function readReviews(browser, product, { since = null, maxPages = MAX_REVIEW_PAGES, now = () => new Date(), onWait, onPage = () => {}, from = null, signal = null, sleep = waitFor } = {}) {
  const at = now();
  const today = indiaDay(at);
  const until = typeof since === 'string' && DAY.test(since) ? since : null;
  const link = product?.read?.allReviews ?? null;
  const out = { pid: product?.read?.pid ?? product?.pid ?? null, link, readAt: at.toISOString(), since: until, pages: 0, total: null, end: null, stoppedAt: null, says: null, loginBox: false, wentOn: null, opened: 0, links: true, reviews: [] };
  const stop = (end, n, says) => Object.assign(out, { end, stoppedAt: n, says: `${says} ${keptSaid(out.reviews.length)}` });
  if (!reviewsPageLink(link, 1)) return Object.assign(out, { end: 'none', says: 'Flipkart shows no reviews for this product, so no page was opened.' });
  // Going on from where an earlier reading of the same link stopped: its reviews are kept, and the page after its last one is next.
  if (from && from.link === link && Number.isInteger(from.pages) && from.pages > 0 && Array.isArray(from.reviews)) Object.assign(out, { pages: from.pages, total: from.total ?? null, reviews: [...from.reviews], loginBox: Boolean(from.loginBox), wentOn: from.pages + 1 });
  /** Every review of a page is surely older than the date. */
  const older = (list) => Boolean(until) && list.length > 0 && list.every((r) => r.dateLatest && r.dateLatest < until);
  // The reviews kept already reach the date, or are as many pages as are read at one time: no page is opened.
  if (out.pages && older(out.reviews.filter((r) => r.page === out.pages))) out.end = 'date';
  else if (out.pages >= maxPages) out.end = 'limit';
  else {
    try {
      await browser.begin();
    } catch {
      return Object.assign(out, { end: 'closed', stoppedAt: out.pages + 1, says: 'The Live Flipkart Browser could not be opened on this computer, so no review was read.' });
    }
    const seen = new Set(out.reviews.map(keyOf));
    const before = new Set(seen);
    for (let n = out.pages + 1; n <= maxPages; n++) {
      if (signal?.aborted) return stop('stopped', n, 'The check was stopped, so the reading of the reviews stopped there.');
      onPage(n, out.reviews.length);
      const open = () => {
        out.opened++;
        return browser.open(reviewsPageLink(link, n), { onWait, read: readReviewsPage, prepare: prepareReviewsPage, html: true, gap: REVIEW_PAGE_GAP_MS });
      };
      const { res, again, stopped } = await openOnceMore(open, (r) => kindOn(r, reviewsOn), { sleep, signal, onAgain: (ms) => onPage(n, out.reviews.length, ms) });
      if (stopped) return stop('stopped', n, 'The check was stopped, so the reading of the reviews stopped there.');
      if (res?.error === 'elsewhere') return stop('elsewhere', n, `A page of the reviews led to ${res.host}, not to Flipkart, so the reading stopped there.`);
      if (!res?.ok) {
        if (res?.error === 'closed') return stop('closed', n, 'The Live Flipkart Browser was closed, so the reading of the reviews stopped there.');
        if (res?.error === 'timeout') return stop('slow', n, 'Flipkart took too long to show more reviews, so the reading stopped there.');
        return stop('network', n, `The Live Flipkart Browser could not open more reviews, so the reading stopped there. ${res?.message ?? ''}`.trim());
      }
      if (res.prepared?.loginBox) out.loginBox = true;
      const u = parseUrl(res.url);
      if (!u || !isFlipkart(u)) return stop('elsewhere', n, `A page of the reviews led to ${u ? u.hostname : 'another website'}, not to Flipkart, so the reading stopped there.`);
      const found = reviewsOn(res);
      const page = whatPageIs({ ...res.facts, reviews: found }, res.status);
      if (PREVENTED[page.kind]) {
        const refused = refusedPage(n, res, found);
        return Object.assign(stop('prevented', n, `Flipkart prevented this check while its reviews were read: ${PREVENTED[page.kind]}${again ? againSaid(page.kind) : ''}. ${refusedSaid(refused)}`), { prevented: page.kind, refused });
      }
      out.total ??= Number.isInteger(res.facts?.total) ? res.facts.total : null;
      if (page.kind === 'not-found' && n === 1) return Object.assign(out, { end: 'none', says: 'Flipkart says this product has no reviews page.' });
      const fresh = page.kind === 'not-found' ? [] : found.filter((r) => !seen.has(keyOf(r)));
      // A page with no reviews, or only the ones already read, is past the last page; but not one with only reviews read
      // before this reading went on, while Flipkart says there are more: newer reviews have moved them down a page.
      const movedDown = page.kind !== 'not-found' && found.length > 0 && found.every((r) => before.has(keyOf(r))) && out.total !== null && out.reviews.length < out.total;
      if (!fresh.length && !movedDown) break;
      out.pages = n;
      for (const r of fresh) {
        seen.add(keyOf(r));
        const when = dateFromWords(r.dateSaid, today);
        out.reviews.push({ id: r.id, name: r.name, stars: r.stars, title: r.title, text: r.text, dateSaid: r.dateSaid, date: when?.date ?? null, dateLatest: when?.latest ?? null, city: r.city, certified: r.certified, reviewFor: r.reviewFor, link: r.link ?? null, page: n });
      }
      if (fresh.length && older(out.reviews.slice(-fresh.length))) {
        out.end = 'date';
        break;
      }
      if (out.total !== null && out.reviews.length >= out.total) break;
      if (n === maxPages) out.end = 'limit';
    }
  }
  out.end ??= 'last page';
  const count = reviewsSaid(out.reviews.length);
  out.says = {
    date: `${count} read, newest first, until they were all older than ${until ? written(until) : ''}.`,
    'last page': out.reviews.length ? `${count} read: all the reviews Flipkart shows.` : 'Flipkart shows no reviews for this product.',
    limit: `${count} read, the most read at one time; older reviews were not read.`,
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
 * would (stoppedAt 0), and its error page is opened once more 60 seconds
 * later as one would be. from — an earlier reading of this product that
 * stopped, at a date or part way: the reading goes on from the page where it
 * stopped, and the product's page is not opened again.
 */
export async function readProductReviews(browser, pid, { since = null, maxPages = MAX_REVIEW_PAGES, now = () => new Date(), onWait, onPage = () => {}, from = null, signal = null, sleep = waitFor } = {}) {
  const at = now();
  const until = typeof since === 'string' && DAY.test(since) ? since : null;
  const out = { pid: ANY_PID.test(String(pid ?? '')) ? pid : null, link: null, readAt: at.toISOString(), since: until, pages: 0, total: null, end: null, stoppedAt: null, says: null, loginBox: false, links: true, reviews: [], product: null };
  const none = (end, says, extra = {}) => Object.assign(out, { end, says, ...extra });
  if (!out.pid) return none('none', 'The product has no Flipkart product ID, so its reviews could not be read.');
  if (from?.link && from.pid === pid && from.product) return { ...(await readReviews(browser, { read: { pid, allReviews: from.link } }, { since: until, maxPages, now, onWait, onPage, from, signal, sleep })), product: from.product };
  if (signal?.aborted) return none('stopped', "The check was stopped, so the product's page was not opened.", { stoppedAt: 0 });
  try {
    await browser.begin();
  } catch {
    return none('closed', 'The Live Flipkart Browser could not be opened on this computer, so no review was read.', { stoppedAt: 0 });
  }
  onPage(0);
  const { res, again, stopped } = await openOnceMore(() => browser.open(pageForPid(pid), { onWait, html: true }), (r) => kindOn(r), { sleep, signal, onAgain: (ms) => onPage(0, 0, ms) });
  if (stopped) return none('stopped', "The check was stopped, so the product's page was not read.", { stoppedAt: 0 });
  if (res?.error === 'elsewhere') return none('elsewhere', `The product's page led to ${res.host}, not to Flipkart, so no review was read.`, { stoppedAt: 0 });
  if (!res?.ok) {
    if (res?.error === 'closed') return none('closed', "The Live Flipkart Browser was closed, so the product's page was not read.", { stoppedAt: 0 });
    if (res?.error === 'timeout') return none('slow', "Flipkart took too long to show the product's page, so no review was read.", { stoppedAt: 0 });
    return none('network', `The Live Flipkart Browser could not open the product's page, so no review was read. ${res?.message ?? ''}`.trim(), { stoppedAt: 0 });
  }
  const u = parseUrl(res.url);
  if (!u || !isFlipkart(u)) return none('elsewhere', `The product's page led to ${u ? u.hostname : 'another website'}, not to Flipkart, so no review was read.`, { stoppedAt: 0 });
  const page = whatPageIs(res.facts, res.status);
  if (PREVENTED[page.kind]) {
    const refused = refusedPage(0, res, null);
    return none('prevented', `Flipkart prevented this check at the product's page: ${PREVENTED[page.kind]}${again ? againSaid(page.kind) : ''}. ${refusedSaid(refused)} No review was read; try again later.`, { prevented: page.kind, refused, stoppedAt: 0 });
  }
  const p = productOnPage(res.facts);
  if (page.kind === 'not-found' || !p.name || p.pid !== pid) return none('none', "Flipkart's page for the product's ID did not show the product, so its reviews could not be read.");
  out.product = { pid, name: p.name, rating: p.rating, ratings: p.ratings, reviews: p.reviews };
  const link = p.allReviews ?? reviewsLinkInPage(res.html, pid);
  if (!link) return none('none', p.reviews === 0 ? 'Flipkart shows no reviews for this product.' : "The product's page on Flipkart showed no way to see all its reviews, so they could not be read.");
  return { ...(await readReviews(browser, { read: { pid, allReviews: link } }, { since: until, maxPages, now, onWait, onPage, signal, sleep })), product: out.product };
}

/** Reads a product's public reviews (as readReviews does) and keeps them in data/flipkart/reviews/<product ID>.json, in place of the ones read before. */
export async function readAndKeepReviews({ browser, store, product, since = null, maxPages = MAX_REVIEW_PAGES, now = () => new Date(), onWait } = {}) {
  const pid = product?.read?.pid ?? product?.pid ?? null;
  if (!ANY_PID.test(String(pid ?? ''))) throw new Error('This product has no Flipkart product ID, so its reviews cannot be kept.');
  const out = await readReviews(browser, product, { since, maxPages, now, onWait });
  await store.saveReviews(pid, out);
  return out;
}
