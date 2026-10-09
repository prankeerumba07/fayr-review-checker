// Reading an Amazon page. readAmazonPage() runs INSIDE the page (Playwright's
// page.evaluate), so it is self-contained: it uses nothing from this module's
// scope or its imports. It only reads; it never clicks, types or changes the
// page. What the facts mean is decided here in Node, by whatPageIs() and friends.

import { parseReviewPageText, sameText, normalizeText, dayFrom, reviewedOn } from './text.js';

/* eslint-disable no-var */
export function readAmazonPage() {
  var squash = function (s) {
    return (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
  };
  var SKIP = 'script,style,noscript,template,.a-icon-alt,.a-expander-header,.a-letter-space,.cr-translate-review,[data-hook="cr-translate-this-review-section"]';
  function textWithBreaks(el) {
    if (!el) return '';
    var out = [];
    (function walk(n) {
      if (n.nodeType === 3) {
        out.push(n.nodeValue);
        return;
      }
      if (n.nodeType !== 1 || n.matches(SKIP)) return;
      if (n.tagName === 'BR') {
        out.push('\n');
        return;
      }
      var block = /^(P|DIV|LI|H[1-6]|TR|UL|OL)$/.test(n.tagName);
      if (block) out.push('\n');
      for (var i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
      if (block) out.push('\n');
    })(el);
    return out
      .join('')
      .split('\n')
      .map(squash)
      .filter(Boolean)
      .join('\n');
  }
  function asinOf(href) {
    var h = String(href || '');
    var m = h.match(/\/(?:dp|gp\/product|gp\/aw\/d|product-reviews)\/([0-9A-Z]{10})(?=[/?#]|$)/);
    if (m) return m[1];
    var q = h.match(/[?&]ASIN=([0-9A-Za-z]{10})(?![0-9A-Za-z])/);
    return q ? q[1].toUpperCase() : null;
  }
  function starsOf(el) {
    if (!el) return { stars: null, starsText: null };
    var alt = squash((el.querySelector('.a-icon-alt') || {}).textContent || '');
    var m = alt.match(/([0-5](?:[.,]\d)?)\s*out of\s*5/i);
    if (m) return { stars: Math.round(parseFloat(m[1].replace(',', '.'))), starsText: alt };
    var cls = (el.getAttribute('class') || '') + ' ' + Array.prototype.map.call(el.querySelectorAll('[class*="a-star-"]'), function (e) { return e.getAttribute('class'); }).join(' ');
    m = cls.match(/a-star-(?:mini-|medium-)?([1-5])(?![0-9])/);
    return m ? { stars: Number(m[1]), starsText: alt || null } : { stars: null, starsText: alt || null };
  }
  function idOf(el) {
    var m = String(el.id || '').match(/(R[0-9A-Z]{9,19})$/);
    if (m) return m[1];
    var a = el.querySelector('a[href*="/customer-reviews/"]');
    m = a && (a.getAttribute('href') || '').match(/customer-reviews\/(R[0-9A-Z]{9,19})/);
    return m ? m[1] : null;
  }
  function titleOf(el) {
    if (!el) return null;
    var parts = Array.prototype.filter.call(el.querySelectorAll(':scope > span, :scope > a > span'), function (s) {
      return !s.matches('.a-letter-space, .a-icon-alt') && !s.querySelector('.a-icon-alt');
    });
    var t = parts.length ? parts.map(function (s) { return s.textContent; }).join(' ') : textWithBreaks(el);
    return squash(t.replace(/[0-5](?:[.,]\d)?\s*out of\s*5\s*stars?/i, '')) || null;
  }
  function readBlock(el) {
    var q = function (s) { return el.querySelector(s); };
    var starEl = q('[data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"], [data-hook="review-star-rating-view-point"], i[class*="a-star-"]');
    var bodyEl = q('[data-hook="review-collapsed"]') || q('[data-hook="review-body"] .review-text-content') || q('[data-hook="review-body"]');
    var strip = q('[data-hook="format-strip"], [data-hook="format-strip-linkless"]');
    var stars = starsOf(starEl);
    return {
      id: idOf(el),
      name: squash((q('.a-profile-name') || {}).textContent) || null,
      stars: stars.stars,
      starsText: stars.starsText,
      title: titleOf(q('[data-hook="review-title"]')),
      dateText: squash((q('[data-hook="review-date"]') || {}).textContent) || null,
      body: bodyEl ? textWithBreaks(bodyEl) || null : null,
      verified: Boolean(q('[data-hook="avp-badge"], [data-hook="avp-badge-linkless"]')),
      variant: strip ? squash(strip.textContent) || null : null,
      variantAsin: strip ? asinOf(strip.getAttribute('href')) : null,
    };
  }

  var all = Array.prototype.slice.call(document.querySelectorAll('[data-hook="review"], [id^="customer_review-"], [id^="customer_review_foreign-"]'));
  var blocks = all.filter(function (b) {
    return !all.some(function (o) { return o !== b && o.contains(b); });
  });

  // The review's own product link, and every /dp/ link with its words. Which
  // one is the reviewed product is decided in Node, by reviewedProduct().
  var productLink = document.querySelector('a[data-hook="product-link"]');
  var dpLinks = [];
  Array.prototype.forEach.call(document.querySelectorAll('a[href*="/dp/"]'), function (a) {
    var m = (a.getAttribute('href') || '').match(/\/dp\/([0-9A-Z]{10})(?=[/?#]|$)/);
    if (m) dpLinks.push({ asin: m[1], href: a.getAttribute('href'), text: squash(a.innerText || a.textContent) || null, label: squash(a.getAttribute('aria-label')) || null });
  });
  var seeAll =
    document.querySelector('a[data-hook="see-all-reviews-link-foot"]') ||
    Array.prototype.find.call(document.querySelectorAll('a[href*="/product-reviews/"]'), function (a) {
      return /see (all|more) reviews/i.test(a.textContent || '');
    });

  // The product's variants, from its size and colour chooser ("twister"), each with its name when the page gives one ("1 Litre").
  var variants = {};
  var variantNames = {};
  Array.prototype.forEach.call(
    document.querySelectorAll('#twister [data-defaultasin], #twister [data-asin], #twister_feature_div [data-defaultasin], #twister_feature_div [data-asin], [id^="inline-twister"] [data-asin], [id^="inline-twister"] [data-defaultasin]'),
    function (e) {
      var a = e.getAttribute('data-defaultasin') || e.getAttribute('data-asin');
      if (!/^[0-9A-Z]{10}$/.test(a || '')) return;
      variants[a] = 1;
      var named = squash(String(e.getAttribute('title') || '').replace(/^click to select\s*/i, '')) || squash(e.innerText || e.textContent);
      if (named && named.length <= 80 && !variantNames[a]) variantNames[a] = named;
    },
  );
  var html = document.documentElement ? document.documentElement.innerHTML : '';
  var dims = html.match(/"dimensionValuesDisplayData"\s*:\s*\{([^}]*)\}/);
  if (dims) {
    (dims[1].match(/"([0-9A-Z]{10})"\s*:/g) || []).forEach(function (k) { variants[k.slice(1, 11)] = 1; });
    (dims[1].match(/"[0-9A-Z]{10}"\s*:\s*\[[^\]]*\]/g) || []).forEach(function (k) {
      var vals = (k.slice(k.indexOf('[')).match(/"([^"]*)"/g) || []).map(function (v) { return squash(v.slice(1, -1)); }).filter(Boolean);
      if (vals.length) variantNames[k.slice(1, 11)] = vals.join(', ').slice(0, 80);
    });
  }
  // The brand: the line under the title ("Visit the Test Brand Store", "Brand: Test Brand"), and a "Brand" row of the product's details.
  var bylineEl = document.querySelector('#bylineInfo');
  var brandRow = null;
  Array.prototype.some.call(document.querySelectorAll('#productOverview_feature_div tr, #poExpander tr, #productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr, table.prodDetTable tr, #detailBullets_feature_div li'), function (row) {
    var t = squash(String(row.innerText || row.textContent || '').replace(/[\u200e\u200f]/g, ''));
    var m = t.match(/^brand(?: name)?\s*:?\s+(.+)$/i);
    if (m) brandRow = squash(m[1].replace(/^:\s*/, '')).slice(0, 80) || null;
    return Boolean(brandRow);
  });
  var colours = html.match(/"colorToAsin"\s*:\s*\{([\s\S]{0,20000}?)\}\s*\}/);
  if (colours) (colours[1].match(/"asin"\s*:\s*"([0-9A-Z]{10})"/g) || []).forEach(function (k) { variants[k.slice(-11, -1)] = 1; });
  var parent = html.match(/"parentAsin"\s*:\s*"([0-9A-Z]{10})"/);

  var asinInput = document.querySelector('#ASIN, input[name="ASIN"]');
  var productTitleEl = document.querySelector('#productTitle');
  // The account line at the top: "Hello, NAME" or "Hello, sign in".
  var helloEl = document.querySelector('#nav-link-accountList-nav-line-1') || document.querySelector('#nav-link-accountList .nav-line-1');
  var accountBox = document.querySelector('#nav-link-accountList');
  var hello = helloEl ? squash(helloEl.textContent) : accountBox ? squash(String(accountBox.innerText || '').split('\n')[0]) : '';
  var text = document.body ? document.body.innerText || '' : '';

  return {
    url: location.href,
    title: document.title || '',
    text: text.slice(0, 30000),
    textCut: text.length > 30000,
    signInForm: Boolean(document.querySelector('form[name="signIn"], #ap_email, #ap_email_login, #ap_password, form[action*="/ap/signin"], form[action*="/ax/claim"]')),
    hello: hello || null,
    captchaForm: Boolean(document.querySelector('form[action*="validateCaptcha"], #captchacharacters')),
    reviews: blocks.map(readBlock),
    reviewProduct: productLink ? { title: squash(productLink.textContent) || null, asin: asinOf(productLink.getAttribute('href')), href: productLink.getAttribute('href') } : null,
    productLinks: dpLinks,
    productTitle: productTitleEl ? squash(productTitleEl.textContent) || null : null,
    pageAsin: (asinInput && /^[0-9A-Z]{10}$/.test(asinInput.value || '') ? asinInput.value : null) || asinOf(location.pathname),
    parentAsin: parent ? parent[1] : null,
    variantAsins: Object.keys(variants),
    variantNames: variantNames,
    byline: bylineEl ? squash(bylineEl.innerText || bylineEl.textContent) || null : null,
    brandRow: brandRow,
    seeAllHref: seeAll ? seeAll.getAttribute('href') : null,
  };
}

/**
 * Who the page says is logged in, read INSIDE the page like readAmazonPage:
 * only the account line at the top ("Hello, NAME" or "Hello, sign in") and
 * whether a login form is there, never what anyone types.
 */
export function readAccountLine() {
  var squash = function (s) {
    return (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
  };
  var el = document.querySelector('#nav-link-accountList-nav-line-1') || document.querySelector('#nav-link-accountList .nav-line-1');
  var box = document.querySelector('#nav-link-accountList');
  var hello = el ? squash(el.textContent) : box ? squash(String(box.innerText || '').split('\n')[0]) : '';
  return {
    url: location.href,
    hello: hello || null,
    signInForm: Boolean(document.querySelector('form[name="signIn"], #ap_email, #ap_email_login, #ap_password, form[action*="/ap/signin"], form[action*="/ax/claim"]')),
  };
}

/**
 * Who a Google page says is logged in, read INSIDE the page like
 * readAccountLine: only the account button at the top of Google's pages
 * ("Google Account: NAME (EMAIL)"), whether a "Sign in" link or a login form
 * is there, and whether the page is Google refusing a login in this window or
 * a robot check. Never what anyone types.
 */
export function readGoogleLine() {
  var squash = function (s) {
    return (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
  };
  var account = document.querySelector('a[href*="accounts.google.com/SignOutOptions"], a[aria-label^="Google Account"], a[aria-label^="Google account"]');
  var signIn = document.querySelector('a[href*="accounts.google.com/ServiceLogin"], a[href*="accounts.google.com/signin"], a[href*="accounts.google.com/AccountChooser"]');
  var text = squash(document.body ? String(document.body.innerText || '').slice(0, 4000) : '');
  return {
    url: location.href,
    title: squash(document.title),
    account: account ? squash(account.getAttribute('aria-label') || account.getAttribute('title') || '') || null : null,
    signIn: Boolean(signIn),
    loginForm: Boolean(document.querySelector('#identifierId, input[type="email"], input[type="password"], input[name="identifier"], input[name="Passwd"]')),
    refused: /may not be secure|couldn.t sign you in|this browser or app/i.test(text),
    robot: /unusual traffic|not a robot|verify (?:that )?you.re (?:not a robot|human)|type the characters/i.test(text),
  };
}

/** Scrolls a product page to its reviews, INSIDE the page. False when they were not found. */
export function scrollToReviewsInPage() {
  var el = document.querySelector('#reviewsMedley, #customerReviews, #cm-cr-dp-review-list, [data-hook="top-customer-reviews-widget"], [data-hook="reviews-medley-footer"]');
  if (!el) {
    var heads = document.querySelectorAll('h2, h3');
    for (var i = 0; i < heads.length && !el; i++) {
      if (/customer reviews|top reviews/i.test(heads[i].textContent || '')) el = heads[i];
    }
  }
  if (!el) return false;
  el.scrollIntoView({ block: 'start' });
  return true;
}
/* eslint-enable no-var */

/**
 * Who is logged in to Amazon, from a page's facts (readAmazonPage or
 * readAccountLine): { signedIn: true, name }, { signedIn: false }, or null
 * when the page says nothing about it (another site, or no "Hello" line).
 */
export function accountFrom(facts) {
  let host = '';
  try {
    host = new URL(String(facts?.url ?? '')).hostname;
  } catch {
    return null;
  }
  if (!/(^|\.)amazon\.in$/.test(host)) return null;
  let path = '';
  try {
    path = new URL(facts.url).pathname;
  } catch {
    path = '';
  }
  if (facts.signInForm || /^\/(ap\/signin|ap\/mfa|ap\/cvf|ax\/claim)/.test(path)) return { signedIn: false };
  const m = String(facts.hello ?? '').match(/^(?:hello|नमस्ते)\s*,?\s*(.+)$/i);
  if (!m) return null;
  const name = m[1].trim();
  if (/^(sign in|साइन इन करें|साइन इन)$/i.test(name)) return { signedIn: false };
  return { signedIn: true, name };
}

/**
 * Who is logged in to Google, from a Google page's line (readGoogleLine):
 * { signedIn: true, name, email }, { signedIn: false, loginPage }, { refused:
 * true } when Google refuses a login in this window, { robot: true } for a
 * robot check, or null when the page says nothing about it (another site, or
 * no account button and no "Sign in" link). The name is the account button's,
 * or the email when it shows no name.
 */
export function googleAccountFrom(line) {
  let u;
  try {
    u = new URL(String(line?.url ?? ''));
  } catch {
    return null;
  }
  if (!/(^|\.)google\.(com|co\.in)$/i.test(u.hostname)) return null;
  if (line.robot || /^\/sorry\//.test(u.pathname)) return { robot: true };
  if (line.refused) return { refused: true };
  const m = String(line.account ?? '').trim().match(/^google account:?\s*(.*?)\s*(?:\(([^()]*)\))?\s*$/i);
  if (m && (m[1].trim() || (m[2] ?? '').trim())) {
    const email = (m[2] ?? '').trim() || null;
    return { signedIn: true, name: m[1].trim() || email, email };
  }
  if (u.hostname === 'accounts.google.com' || line.loginForm) return { signedIn: false, loginPage: true };
  if (line.signIn) return { signedIn: false, loginPage: false };
  return null;
}

/**
 * One of Amazon's own login pages (the login form, a one-time code, a page
 * Amazon shows after a login, such as adding a mobile number): a person may
 * be logging in there by hand.
 */
export function isLoginPage(facts) {
  try {
    const u = new URL(String(facts?.url ?? ''));
    if (!/(^|\.)amazon\.in$/.test(u.hostname)) return false;
    return Boolean(facts.signInForm) || /^\/(ap|ax)\//.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * What kind of page Amazon gave. Anything that stops a step — a login page,
 * a robot check, an error or a block — is said plainly and never got around.
 */
export function whatPageIs(facts, status) {
  const f = facts ?? {};
  const url = String(f.url ?? '');
  const head = `${f.title ?? ''}\n${String(f.text ?? '').slice(0, 4000)}`;
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    path = '';
  }
  if (/^\/(ap\/signin|ap\/register|ap\/mfa|ax\/claim)/.test(path) || f.signInForm || /sign in or create account/i.test(head) || /^amazon(\.in)?:? sign[ -]in/i.test(String(f.title ?? '').trim())) {
    return { kind: 'signin', why: 'Amazon asked to log in.' };
  }
  if (/\/errors\/validateCaptcha/i.test(url) || f.captchaForm || /enter the characters you see below|type the characters you see in this image/i.test(head)) {
    return { kind: 'captcha', why: 'Amazon showed a robot check.' };
  }
  if (status === 404 || /not a functioning page on our site|looking for something\?[\s\S]{0,300}not a functioning page/i.test(head)) {
    return { kind: 'not-found', why: 'Amazon says the page does not exist.' };
  }
  if (status === 429 || status === 503 || status === 403 || /sorry!? something went wrong|we're sorry\.? an error occurred|to discuss automated access to amazon data/i.test(head)) {
    return { kind: 'blocked', why: 'Amazon refused to show the page.' };
  }
  if (typeof status === 'number' && status >= 400) return { kind: 'blocked', why: 'Amazon did not show the page.' };
  return { kind: 'page', why: null };
}

/**
 * The brand a product page shows: its "Brand" row, else the line under the
 * title ("Visit the Test Brand Store", "Brand: Test Brand"); null when none.
 */
export function brandOf(facts) {
  const f = facts ?? {};
  if (f.brandRow) return String(f.brandRow).trim() || null;
  const line = String(f.byline ?? '').trim();
  const m = line.match(/^visit the (.+?) store$/i) ?? line.match(/^brand\s*:\s*(.+)$/i);
  return m ? m[1].trim() || null : null;
}

/**
 * A product page as a campaign keeps it: { name, asin, brand, variants:
 * [{ asin, label }] }, the variants being the other colours and sizes it
 * lists. name and asin are null on a page that is not a product's.
 */
export function productOnPage(facts) {
  const f = facts ?? {};
  const asin = f.pageAsin ?? null;
  const names = f.variantNames && typeof f.variantNames === 'object' ? f.variantNames : {};
  return {
    name: f.productTitle ?? null,
    asin,
    brand: brandOf(f),
    variants: [...new Set(f.variantAsins ?? [])].filter((a) => a !== asin).map((a) => ({ asin: a, label: typeof names[a] === 'string' ? names[a] : null })),
  };
}

/** The review block with this id on a page, or null. */
export function findReview(facts, reviewId) {
  return (facts?.reviews ?? []).find((r) => r?.id === reviewId) ?? null;
}

// ---- a review's parts, from its block and the page's text ----

/** The parts of a review the check reads, in the order a review shows them. */
export const REVIEW_PARTS = ['name', 'stars', 'title', 'date', 'text'];

const shown = (v) => v !== null && v !== undefined && v !== '';

function dayOf(r) {
  if (r.day) return r.day;
  return r.dateText ? dayFrom(reviewedOn(r.dateText)?.dateText ?? r.dateText) : null;
}

/** One part of a review block (readBlock) or of a page's text (parseReviewPageText); a date only when it reads as a day. */
function partOf(r, part) {
  if (!r) return null;
  const v = { name: r.name, stars: r.stars, title: r.title, date: dayOf(r), text: r.body }[part];
  return shown(v) ? v : null;
}

/** The parts a review block (or a page's text) does not show. */
export function missingParts(r) {
  return REVIEW_PARTS.filter((p) => partOf(r, p) === null);
}

/**
 * The review as the page's text shows it (parseReviewPageText), or null. The
 * text is kept to 30000 characters; when it was cut before Product Details,
 * the review's words may have been cut too, so none are taken from it and
 * `cut` says why.
 */
export function textReview(facts) {
  const t = parseReviewPageText(facts?.text);
  if (!t || !facts?.textCut || t.productTitle !== null) return t;
  return { ...t, body: null, cut: true };
}

/**
 * The review: each part from its block when the block shows it, else from the
 * page's text, and `from` says which ('block', 'text', or null for neither).
 * The text fills only what the block lacks, and only when it is this review:
 * a name, stars or date that both show must agree, else the text is not used
 * and `disagree` names what differed.
 */
export function reviewParts(block, text) {
  const disagree = block && text
    ? ['name', 'stars', 'date'].filter((p) => {
        const a = partOf(block, p);
        const b = partOf(text, p);
        return a !== null && b !== null && (p === 'name' ? normalizeText(a) !== normalizeText(b) : a !== b);
      })
    : [];
  const fill = disagree.length ? null : text;
  const from = {};
  for (const p of REVIEW_PARTS) from[p] = partOf(block, p) !== null ? 'block' : partOf(fill, p) !== null ? 'text' : null;
  const of = (p) => (from[p] === 'block' ? block : from[p] === 'text' ? fill : null);
  const own = block ?? text;
  return {
    name: partOf(of('name'), 'name'),
    stars: partOf(of('stars'), 'stars'),
    title: partOf(of('title'), 'title'),
    dateText: (of('date') ?? own)?.dateText ?? null,
    day: partOf(of('date'), 'date'),
    body: partOf(of('text'), 'text'),
    verified: Boolean(own?.verified),
    variant: own?.variant ?? null,
    from,
    disagree,
  };
}

// ---- the reviewed product ----

const BUYING_OPTIONS = /^see all buying options$/i;

/**
 * The reviewed product, only when it is certain: the review's own product link
 * (data-hook="product-link"); else the /dp/ link whose words are the product
 * title under Product Details in the page's text; else the /dp/ link behind
 * "See All Buying Options". Every other product link on a review page is a
 * recommendation, so the first /dp/ link is never taken. Links that point at
 * different products are not certain. Null when none is; `from` says which.
 */
export function reviewedProduct(facts) {
  const f = facts ?? {};
  const title = parseReviewPageText(f.text)?.productTitle ?? null;
  const own = f.reviewProduct;
  if (own?.asin) return { asin: own.asin, title: own.title ?? title, href: own.href ?? null, from: 'product-link' };
  const links = (f.productLinks ?? []).filter((l) => l?.asin);
  const one = (list) => (list.length && list.every((l) => l.asin === list[0].asin) ? list[0] : null);
  const titled = title ? one(links.filter((l) => sameText(l.text, title))) : null;
  if (titled) return { asin: titled.asin, title, href: titled.href ?? null, from: 'title' };
  const buying = one(links.filter((l) => BUYING_OPTIONS.test(l.text ?? '') || BUYING_OPTIONS.test(l.label ?? '')));
  if (buying) return { asin: buying.asin, title, href: buying.href ?? null, from: 'buying-options' };
  return null;
}
