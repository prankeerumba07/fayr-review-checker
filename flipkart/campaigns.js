// Flipkart campaigns: a brand, a name, live or ended, the day it started
// (written day first, as 01-10-2026; a campaign with none works as before it
// had one), and the Flipkart products
// users may buy for it, typed as Flipkart links or Flipkart product IDs (the
// pid, Flipkart's version of Amazon's ASIN), one per line. Each product is
// read once from its Flipkart page in the Live Flipkart Browser (one page at a
// time, at least 3 seconds apart): its name, its brand and the other colours
// and sizes it lists, and, kept for later steps though not shown, its product
// ID, its item ID, its stars, how many ratings and reviews it has, and the
// link to all its reviews. A product is used only when its page is a real
// product page whose brand (or, when no brand is shown, its name) includes
// the campaign's brand. A campaign saved before campaigns had a brand has
// none, and is not used until its brand is added. A robot check, a block or
// an error stops the reading ("Flipkart prevented this check"), and is never
// got around. Copied from the Amazon campaigns (amazon/campaigns.js) and
// changed for Flipkart. A row uses every live campaign whose brand is in its
// product name, or else in the file's name or the tab's name, as on Amazon;
// nothing here checks a row yet.

import { randomBytes } from 'node:crypto';
import { parseUrl, isFlipkart, pidFrom, itemIdFrom, pageForPid, pageForLink, PID } from './links.js';
import { whatPageIs, productOnPage } from './page-read.js';

/** The dashboard's own key for a campaign, in its address; staff never type it. */
export const CAMPAIGN_KEY = /^f[0-9a-f]{12}$/;
export const MAX_CAMPAIGN_PRODUCTS = 30;
export const newCampaignKey = () => `f${randomBytes(6).toString('hex')}`;

/** The words this dashboard never shows, as the rules test bans them (kept as base64 so this file does not hold them). */
const HIDDEN = ['cmVmdW5k', 'Y2FzaGJhY2s=', 'cmV3YXJk'].map((b) => Buffer.from(b, 'base64').toString('utf8'));
const HIDDEN_RE = new RegExp(`[\\p{L}\\p{N}]*(?:${HIDDEN.join('|')})[\\p{L}\\p{N}]*`, 'giu');

/** Words from a Flipkart page or typed by staff, on one line, with any word this dashboard must not show replaced by "…". Copied from amazon/notes.js. */
export function clean(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().replace(HIDDEN_RE, '…');
}

/** Why a product was not read, when Flipkart showed a robot check, a block or an error: never got around. */
export const PREVENTED_SAYS = {
  captcha: 'Flipkart prevented this check: it showed a robot check, which this dashboard never answers. This product was not read; press "Read the products again" later.',
  blocked: 'Flipkart prevented this check: it refused the page. This product was not read; wait a while, then press "Read the products again".',
  error: 'Flipkart prevented this check: it showed an error. This product was not read; press "Read the products again" later.',
};

/** A campaign's start date as kept: YYYY-MM-DD. */
const START_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** What the form says when the start date cannot be read. */
export const START_SAYS = "Write the day the campaign started, the day first, like 01-10-2026, or leave it empty.";

/**
 * The day a campaign started, as staff typed it, the day first (01-10-2026;
 * 1-10-2026, 01/10/2026 and 01.10.2026 too). -> { day: YYYY-MM-DD, or null
 * when nothing was typed } or { problem } when it is not a real day.
 */
export function startDayFrom(text) {
  const t = String(text ?? '').trim();
  if (!t) return { day: null };
  const m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!m) return { problem: START_SAYS };
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(Date.UTC(y, mo - 1, d));
  if (y < 2000 || at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return { problem: START_SAYS };
  return { day: at.toISOString().slice(0, 10) };
}
/** A start date as kept, or null. */
export const startDayOf = (c) => (START_DAY.test(String(c?.startDate ?? '')) ? c.startDate : null);

/** When a product was typed as its product ID alone and no product page opened from it. */
export const ADD_LINK_SAYS = "No Flipkart product page opened from this product ID. Add this product's link instead.";

/** The start of a product's name, up to its first "|" or comma ("Test Glow Face Mask"). Copied from amazon/campaigns.js. */
export function shortName(name) {
  const t = String(name ?? '').replace(/\s+/g, ' ').trim();
  const cut = t.split(/[|,]/)[0].trim();
  return cut || t;
}

// Copied from amazon/text.js: words to compare, with capitals, punctuation and invisible marks aside; and how many letters two words differ by.
function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a, b, max = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// The brand rule, copied from amazon/campaigns.js.

/** A name's words for finding a brand in it: capitals, punctuation and accents aside ("Männlich" is mannlich). */
const brandWords = (t) => normalizeText(String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')).split(' ').filter(Boolean);

/** The same brand word, or one of six letters or more that differs by one letter ("Manlich" for "Mannlich"). */
export function sameBrandWord(a, b) {
  if (a === b) return true;
  return [...a].length >= 6 && [...b].length >= 6 && editDistance(a, b, 1) <= 1;
}

/**
 * True when a brand is in a name, whatever its capitals, spaces, punctuation
 * or accents: its words one after another ("Test Brand"), or the same letters
 * written together or apart ("TestBrand", "Test brand"). A brand word of six
 * letters or more may differ by one letter, as Flipkart may spell it.
 */
export function brandIn(name, brand) {
  const b = brandWords(brand);
  if (!b.length) return false;
  const n = brandWords(name);
  const together = b.join('');
  for (let i = 0; i < n.length; i++) {
    if (b.every((w, j) => n[i + j] && sameBrandWord(n[i + j], w))) return true;
    let joined = '';
    for (let j = i; j < n.length && joined.length <= together.length + 1; j++) {
      joined += n[j];
      if (sameBrandWord(joined, together)) return true;
    }
  }
  return false;
}

/**
 * Where a row finds its campaigns, as on Amazon: 'product' when a live
 * campaign's brand is in the row's product name, else 'file' when one's brand
 * is in the file's name or the tab's name (places), else null; with those
 * campaigns. A campaign marked Ended is never used. With `live: false`, the
 * same search among the ended campaigns, to say that a brand has only ended
 * ones. Copied from amazon/campaigns.js.
 */
export function campaignsFound(productName, campaigns, places = [], { live = true } = {}) {
  const pool = (campaigns ?? []).filter((c) => Boolean(c?.live) === live);
  const byProduct = pool.filter((c) => brandIn(productName, c.brand));
  if (byProduct.length) return { by: 'product', list: byProduct };
  const byFile = pool.filter((c) => places.some((p) => brandIn(p, c.brand)));
  if (byFile.length) return { by: 'file', list: byFile };
  return { by: null, list: [] };
}

/** A product ID typed alone: 16 letters and digits, with both in it ("FCPHEW7AM9C7RU24"). */
function pidOfLine(line) {
  const t = line.toUpperCase();
  return PID.test(t) && /\d/.test(t) && /[A-Z]/.test(t) ? t : null;
}

/**
 * The products as staff typed them, one per line: a Flipkart product ID
 * (opened as Flipkart's page for that ID) or a Flipkart link (a product page's
 * link opened as the product page alone, any other Flipkart link as it is).
 * -> { products: [{ given, url, pid, itemId, byId }], problems: [sentence] }.
 * A line that is neither, or a link to another website, is a problem; the
 * same product typed twice counts once.
 */
export function productLines(text) {
  const products = [];
  const problems = [];
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const at = `Line ${i + 1} of the products`;
    let item = null;
    const pid = pidOfLine(line);
    if (pid) {
      item = { given: pid, url: pageForPid(pid), pid, itemId: null, byId: true };
    } else {
      // A link starts with http:// or https://, or is a Flipkart link without them ("www.flipkart.com/...").
      const u = /^https?:\/\//i.test(line) || /^(?:www\.|dl\.)?flipkart\.com\//i.test(line) ? parseUrl(line) : null;
      if (!u) problems.push(`${at}, "${clean(line).slice(0, 60)}", is not a Flipkart link or a Flipkart product ID.`);
      else if (!isFlipkart(u)) problems.push(`${at} is a link to ${u.hostname}, not to Flipkart, so it cannot be used.`);
      else item = { given: line.slice(0, 2000), url: pageForLink(u), pid: pidFrom(u), itemId: itemIdFrom(u), byId: false };
    }
    if (!item) continue;
    if (products.some((p) => p.given === item.given || (p.pid && p.pid === item.pid))) continue;
    products.push(item);
  }
  if (products.length > MAX_CAMPAIGN_PRODUCTS) problems.push(`A campaign can have at most ${MAX_CAMPAIGN_PRODUCTS} products.`);
  return { products, problems };
}

/**
 * Whether a product read from Flipkart belongs to a campaign's brand: its
 * brand must include the campaign's brand, or, when the page shows no brand,
 * its name must. -> null when it does, else the sentence saying why it is not
 * used. A campaign with no brand (saved before campaigns had one) checks
 * none: the campaign itself is not used until its brand is added.
 */
export function brandProblem(read, brand) {
  if (!read?.name) return 'This link does not open a product page on Flipkart, so this product is not used.';
  if (!brandWords(brand).length) return null;
  if (read.brand) return brandIn(read.brand, brand) ? null : `Flipkart says this product's brand is "${clean(read.brand)}", not "${clean(brand)}", so this product is not used.`;
  return brandIn(read.name, brand) ? null : `The product's page shows no brand, and its name "${clean(shortName(read.name))}" does not include "${clean(brand)}", so this product is not used.`;
}

/** A product that is used: read from Flipkart, and confirmed. */
export const usable = (p) => Boolean(p?.read?.name && !p.problem);

/**
 * The campaigns a row uses, as on Amazon: every live one whose brand is in the
 * row's product name in the sheet, or else in the file's name or the tab's
 * name (places), with only the products that are used, as the check needs
 * them: { key, name, brand, live, startDate (YYYY-MM-DD, or null), products:
 * [{ pid, name, short, variants: [pid] }] }, each product by its real name
 * read from Flipkart. Copied from amazon/campaigns.js.
 */
export function campaignsFor(productName, campaigns, places = []) {
  return campaignsFound(productName, campaigns, places).list.map((c) => ({
    key: c.key,
    name: c.name,
    brand: c.brand,
    live: Boolean(c.live),
    startDate: startDayOf(c),
    products: (c.products ?? []).filter(usable).map((p) => ({ pid: p.read.pid ?? p.pid ?? null, name: p.read.name, short: shortName(p.read.name), variants: (p.read.variants ?? []).map((v) => v.pid).filter(Boolean) })),
  }));
}

/** Every product of a campaign confirmed again for its brand, from what was read (a changed brand needs no page opened). */
export function confirmProducts(campaign) {
  return {
    ...campaign,
    products: (campaign.products ?? []).map((p) => {
      if (!p.read || p.problem?.retry) return p;
      const says = brandProblem(p.read, campaign.brand);
      return { ...p, problem: says ? { says, at: p.problem?.at ?? p.read.at } : null };
    }),
  };
}

/** A product still to be read: never read, or its last reading was stopped or could not open the page. */
export const needsReading = (p) => !p?.read && !p?.problem?.final;

/**
 * Reads one product's page in the Live Flipkart Browser and confirms it for
 * the campaign's brand. browser — begin(), open(url, { onWait }). -> {
 * product, stop } where product is the product as it is now, and stop says
 * why nothing more is read now: 'captcha', 'blocked' or 'error' when Flipkart
 * showed one of those ("Flipkart prevented this check"), 'closed' when the
 * window could not be opened or was closed, or 'network' when the page could
 * not be opened at all (no point opening the next one then); else null.
 */
export async function readProduct(browser, product, brand, { onWait, now = () => new Date() } = {}) {
  const at = now().toISOString();
  const not = (says, extra = {}) => ({ product: { ...product, read: null, problem: { says, at, ...extra } }, stop: null });
  const halt = (says, stop) => ({ product: { ...product, read: null, problem: { says, at, retry: true } }, stop });
  try {
    await browser.begin();
  } catch {
    return halt('The Live Flipkart Browser could not be opened on this computer, so this product was not read and the reading stopped.', 'closed');
  }
  const res = await browser.open(product.url, { onWait });
  if (res?.error === 'elsewhere') return not(`The link leads to ${res.host}, not to Flipkart, so this product is not used.`, { final: true });
  if (!res?.ok) return halt(`The Live Flipkart Browser could not open the page, so this product was not read and the reading stopped. ${res?.message ?? ''}`.trim(), res?.error === 'closed' ? 'closed' : 'network');
  // Another website's page is never taken for something Flipkart showed.
  const u = parseUrl(res.url);
  if (!u || !isFlipkart(u)) return not(`The link leads to ${u ? u.hostname : 'another website'}, not to Flipkart, so this product is not used.`, { final: true });
  const page = whatPageIs(res.facts, res.status);
  if (page.kind === 'captcha' || page.kind === 'blocked' || page.kind === 'error') {
    return { product: { ...product, read: null, problem: { says: PREVENTED_SAYS[page.kind], at, retry: true, stop: page.kind } }, stop: page.kind };
  }
  const p = productOnPage(res.facts);
  const isProduct = page.kind === 'page' && Boolean(p.name) && Boolean(p.pid || p.itemId);
  // A product ID alone: only a product page with that very ID will do.
  if (product.byId && (!isProduct || p.pid !== product.pid)) return not(ADD_LINK_SAYS, { final: true });
  if (page.kind === 'not-found') return not('Flipkart says this product page does not exist, so this product is not used.', { final: true });
  if (!isProduct) return not('This link does not open a product page on Flipkart, so this product is not used.', { final: true });
  const read = {
    at,
    name: clean(p.name).slice(0, 500),
    brand: p.brand ? clean(p.brand).slice(0, 80) || null : null,
    // The other colours and sizes: each one's product ID, and its name when the page gives one ("20 ml").
    variants: p.variants.slice(0, 60).map((v) => ({ pid: v.pid, label: v.label ? clean(v.label).slice(0, 80) || null : null })),
    pid: p.pid,
    itemId: p.itemId,
    rating: p.rating,
    ratings: p.ratings,
    reviews: p.reviews,
    allReviews: p.allReviews,
  };
  const says = brandProblem(read, brand);
  return { product: { ...product, pid: product.pid ?? p.pid, itemId: product.itemId ?? p.itemId, read, problem: says ? { says, at } : null }, stop: null };
}
