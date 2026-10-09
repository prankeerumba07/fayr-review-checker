// Campaigns: a brand, a name, live or ended, and the Amazon products users may
// buy for it, typed as Amazon links or ASIN numbers, one per line. Each
// product is read once from its Amazon page in the Live Amazon Browser (one
// page at a time, at least 3 seconds apart, as every Amazon page): its real
// name, its brand, and the other colours and sizes it lists. A product is
// used only when its page is a real product page whose brand (or, when no
// brand is shown, its name) includes the campaign's brand. A login page, a
// robot check or a block stops the reading, and is never got around. A row
// uses every live campaign whose brand is in its product name in the sheet,
// or else in the file's name or the tab's name.

import { randomBytes } from 'node:crypto';
import { parseUrl, isAmazonIn, isShortLink, asinFrom, productPageUrl } from './links.js';
import { whatPageIs, productOnPage } from './page-read.js';
import { normalizeText, editDistance } from './text.js';
import { clean } from './notes.js';

export const CAMPAIGN_ID = /^k[0-9a-f]{12}$/;
export const MAX_CAMPAIGN_PRODUCTS = 30;
const ASIN = /^[A-Z0-9]{10}$/;

export const newCampaignId = () => `k${randomBytes(6).toString('hex')}`;

/** Why a product was not read, when Amazon showed a login page, a robot check or a block: never got around. */
export const READ_PAUSE_SAYS = {
  signin: 'Amazon asked to log in, so this product was not read. Log in in the Live Amazon Browser, then press "Read the products again".',
  captcha: 'Amazon showed a robot check, so this product was not read. This dashboard never answers a robot check. Press "Read the products again" when you are ready.',
  blocked: 'Amazon refused the page, so this product was not read. Wait a while, then press "Read the products again".',
};

/** The start of a product's real name, up to its first "|" or comma: how a Note names it ("Test Brand Monthly Home Cleaning Kit"). */
export function shortName(name) {
  const t = String(name ?? '').replace(/\s+/g, ' ').trim();
  const cut = t.split(/[|,]/)[0].trim();
  return cut || t;
}

/** A name's words for finding a brand in it: capitals, punctuation and accents aside ("Männlich" is mannlich). */
const brandWords = (t) => normalizeText(String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')).split(' ').filter(Boolean);

/** The same brand word, or one of six letters or more that differs by one letter ("Manlich" for "Mannlich"). */
export function sameBrandWord(a, b) {
  if (a === b) return true;
  return [...a].length >= 6 && [...b].length >= 6 && editDistance(a, b, 1) <= 1;
}

/**
 * True when a brand is in a name, whatever its capitals, spaces, punctuation
 * or accents: its words one after another ("Test Brand"), or the same letters
 * written together or apart ("TestBrand", "Test brand"). A brand word of six
 * letters or more may differ by one letter, as Amazon may spell it.
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
 * The products as staff typed them, one per line: an ASIN number (opened as
 * its Amazon India product page) or an Amazon link (opened as it is). ->
 * { products: [{ given, url, asin }], problems: [sentence] }. A line that is
 * neither, or a link to another website, is a problem; the same product typed
 * twice counts once.
 */
export function productLines(text) {
  const products = [];
  const problems = [];
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const at = `Line ${i + 1} of the products`;
    let item = null;
    if (ASIN.test(line.toUpperCase()) && /\d/.test(line) && !/[./:]/.test(line)) {
      const asin = line.toUpperCase();
      item = { given: asin, url: productPageUrl(asin), asin };
    } else {
      const u = /^https?:\/\//i.test(line) ? parseUrl(line) : null;
      if (!u) problems.push(`${at}, "${clean(line).slice(0, 60)}", is not an Amazon link or an ASIN number.`);
      else if (!isAmazonIn(u) && !isShortLink(u)) problems.push(`${at} is a link to ${u.hostname}, not to Amazon India, so it cannot be used.`);
      else item = { given: line.slice(0, 2000), url: u.href, asin: asinFrom(u.href) };
    }
    if (!item) continue;
    if (products.some((p) => p.given === item.given || (p.asin && p.asin === item.asin))) continue;
    products.push(item);
  }
  if (products.length > MAX_CAMPAIGN_PRODUCTS) problems.push(`A campaign can have at most ${MAX_CAMPAIGN_PRODUCTS} products.`);
  return { products, problems };
}

/**
 * Whether a product read from Amazon belongs to a campaign's brand: its brand
 * must include the campaign's brand, or, when the page shows no brand, its
 * name must. -> null when it does, else the sentence saying why it is not used.
 */
export function brandProblem(read, brand) {
  if (!read?.name) return 'This link does not open a product page on Amazon, so this product is not used.';
  if (read.brand) return brandIn(read.brand, brand) ? null : `Amazon says this product's brand is "${clean(read.brand)}", not "${clean(brand)}", so this product is not used.`;
  return brandIn(read.name, brand) ? null : `The product's page shows no brand, and its name "${clean(shortName(read.name))}" does not include "${clean(brand)}", so this product is not used.`;
}

/** A product that is used: read from Amazon, and confirmed. */
export const usable = (p) => Boolean(p?.read?.name && p.read.asin && !p.problem);

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
 * Reads one product's page in the Live Amazon Browser and confirms it for the
 * campaign's brand. browser — begin(), open(url, { onWait }). -> { product,
 * pause } where product is the product as it is now, and pause is 'signin',
 * 'captcha' or 'blocked' when Amazon showed one of those (nothing more is
 * read then), else null.
 */
export async function readProduct(browser, product, brand, { onWait, now = () => new Date() } = {}) {
  const at = now().toISOString();
  const not = (says, extra = {}) => ({ product: { ...product, read: null, problem: { says, at, ...extra } }, pause: null });
  try {
    await browser.begin();
  } catch {
    return not('The Live Amazon Browser could not be opened on this computer, so this product was not read.', { retry: true });
  }
  const res = await browser.open(product.url, { onWait });
  if (!res?.ok) return not(`The Live Amazon Browser could not open the page, so this product was not read. ${res?.message ?? ''}`.trim(), { retry: true });
  const page = whatPageIs(res.facts, res.status);
  if (page.kind === 'signin' || page.kind === 'captcha' || page.kind === 'blocked') return { product: { ...product, read: null, problem: { says: READ_PAUSE_SAYS[page.kind], at, retry: true, pause: page.kind } }, pause: page.kind };
  const u = parseUrl(res.url);
  if (!isAmazonIn(u)) return not(`The link leads to ${u ? u.hostname : 'another website'}, not to Amazon India, so this product is not used.`, { final: true });
  if (page.kind === 'not-found') return not('Amazon says this product page does not exist, so this product is not used.', { final: true });
  const p = productOnPage(res.facts);
  if (!p.name || !p.asin) return not('This link does not open a product page on Amazon, so this product is not used.', { final: true });
  const read = { at, name: clean(p.name).slice(0, 500), brand: p.brand ? clean(p.brand).slice(0, 80) : null, asin: p.asin, variants: p.variants.slice(0, 60).map((v) => ({ asin: v.asin, label: v.label ? clean(v.label).slice(0, 80) : null })) };
  const says = brandProblem(read, brand);
  return { product: { ...product, asin: product.asin ?? p.asin, read, problem: says ? { says, at } : null }, pause: null };
}

/**
 * Where a row finds its campaigns: 'product' when a live campaign's brand is
 * in the row's product name, else 'file' when one's brand is in the file's
 * name or the tab's name (places), else null; with those campaigns. A
 * campaign marked Ended is never used. With `live: false`, the same search
 * among the ended campaigns, to say that a brand has only ended ones.
 */
export function campaignsFound(productName, campaigns, places = [], { live = true } = {}) {
  const pool = (campaigns ?? []).filter((c) => Boolean(c?.live) === live);
  const byProduct = pool.filter((c) => brandIn(productName, c.brand));
  if (byProduct.length) return { by: 'product', list: byProduct };
  const byFile = pool.filter((c) => places.some((p) => brandIn(p, c.brand)));
  if (byFile.length) return { by: 'file', list: byFile };
  return { by: null, list: [] };
}

/**
 * The campaigns a row uses: every live one whose brand is in the row's
 * product name in the sheet, or else in the file's name or the tab's name
 * (places), with only the products that are used, as the check needs them:
 * { id, name, brand, live, products: [{ asin, name, short, variants: [asin] }] }.
 */
export function campaignsFor(productName, campaigns, places = []) {
  return campaignsFound(productName, campaigns, places)
    .list.map((c) => ({
      id: c.id,
      name: c.name,
      brand: c.brand,
      live: Boolean(c.live),
      products: (c.products ?? []).filter(usable).map((p) => ({ asin: p.read.asin, name: p.read.name, short: shortName(p.read.name), variants: (p.read.variants ?? []).map((v) => v.asin).filter(Boolean) })),
    }));
}
