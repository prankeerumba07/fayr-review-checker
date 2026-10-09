// What the words read from a screenshot say: order IDs, dates, amounts, how
// well a product's name is shown, and the phrases settings.json lists. Pure.
// Tesseract often reads the rupee sign as "%" or "२", and a sentence may be
// split over two lines; both are allowed for.

import { overlapScore, productWords, wordsOf, closeWords, normalizeText } from './text.js';

const textOf = (l) => String(typeof l === 'string' ? l : l?.text ?? '');

// ---- order IDs ----

// Letters Tesseract mistakes for digits in an order ID.
const ID = '[0-9OoIlSB|]';
const ORDER_ID = new RegExp(`(?<![0-9A-Za-z])(${ID}{3})\\s*[-–—‐_.\\s]\\s*(${ID}{7})\\s*[-–—‐_.\\s]\\s*(${ID}{7})(?![0-9A-Za-z])`, 'gu');
// The same, with a space read inside a group of digits ("403-1234 567-8901234"); the groups are joined again.
const ORDER_ID_SPACED = new RegExp(`(?<![0-9A-Za-z])(${ID}{3})\\s*[-–—‐_.]\\s*(${ID}(?: ?${ID}){6})\\s*[-–—‐_.]\\s*(${ID}(?: ?${ID}){6})(?![0-9A-Za-z])`, 'gu');
const fold = (s) => s.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
/** A line that ends part way through an order ID, which goes on on the next line ("Order number 406-" / "2468024-1357913"). */
const ID_WRAPS = new RegExp(`${ID}{3}\\s*[-–—‐]\\s*(?:${ID}{7}\\s*[-–—‐]\\s*)?$`, 'u');

/**
 * The lines, and each line joined with the next where an order ID wraps onto
 * the next line: a line ending with the ID's first (or second) group and its
 * hyphen.
 */
function withWraps(lines) {
  const texts = [].concat(lines ?? []).map(textOf);
  const out = [];
  texts.forEach((t, i) => {
    out.push(t);
    if (i + 1 < texts.length && ID_WRAPS.test(t.trim())) out.push(`${t.trim()} ${texts[i + 1].trim()}`);
  });
  return out;
}

/** Every order ID (3, 7 and 7 digits) in some words, as Amazon writes it, each once, in order; an ID wrapped over two lines, or with a space read inside it, too. */
export function orderIdsIn(lines) {
  const out = [];
  for (const line of withWraps(lines)) {
    for (const re of [ORDER_ID, ORDER_ID_SPACED]) {
      for (const m of line.matchAll(re)) {
        const parts = [m[1], m[2].replace(/ /g, ''), m[3].replace(/ /g, '')];
        const raw = parts.join('');
        if ((raw.match(/\d/g) ?? []).length < 14) continue;
        const id = parts.map(fold).join('-');
        if (!out.includes(id)) out.push(id);
      }
    }
  }
  return out;
}

/**
 * An order ID shown only in part (cut off at the edge of the screenshot, or
 * a digit lost in reading): a run of 10 digits or more, read as the sheet's
 * order ID has them, one after another. -> { digits } (how many were read)
 * or null. A whole ID is found by orderIdsIn, never here.
 */
export function partialOrderId(lines, sheetId) {
  const want = String(sheetId ?? '').replace(/\D/g, '');
  if (want.length !== 17) return null;
  let best = null;
  for (const line of withWraps(lines)) {
    for (const m of line.matchAll(new RegExp(`${ID}(?:[ \\-–—‐]?${ID}){9,}`, 'gu'))) {
      const digits = fold(m[0]).replace(/\D/g, '');
      if (digits.length < 10 || digits.length >= 17 || !want.includes(digits)) continue;
      if (!best || digits.length > best.digits) best = { digits: digits.length };
    }
  }
  return best;
}

/** "2026-07-20" as "20-07-2026", the day first, as the sheet is read in India. */
export const dayFirst = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');

/** An order ID shown by its last 5 digits, as staff say it: "ends 12345". */
export function lastFive(id) {
  const digits = String(id ?? '').replace(/\D/g, '');
  return digits.length >= 5 ? digits.slice(-5) : String(id ?? '').trim();
}

// ---- dates ----

const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const monthNo = (w) => MONTHS[String(w).toLowerCase().slice(0, 3)] ?? null;
const ORDER_LABEL = /order(?:ed)?\s*(?:date|placed|on)\b|date\s+of\s+(?:the\s+)?order|placed\s+on|order\s+placed/i;

function partsToDate(y, m, d) {
  if (!m || !d || d > 31 || m > 12) return null;
  if (y === null) return { year: null, month: m, date: d, day: null };
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { year: y, month: m, date: d, day: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

const DATE_PATTERNS = [
  [new RegExp(`(?<![\\d])(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+${MONTH_RE}\\.?[\\s,-]+(\\d{4})(?![\\d])`, 'gi'), (m) => partsToDate(Number(m[3]), monthNo(m[2]), Number(m[1]))],
  [new RegExp(`(?<![a-z])${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?![\\d])`, 'gi'), (m) => partsToDate(Number(m[3]), monthNo(m[1]), Number(m[2]))],
  [/(?<![\d.\-/])(\d{4})-(\d{1,2})-(\d{1,2})(?![\d.\-/])/g, (m) => partsToDate(Number(m[1]), Number(m[2]), Number(m[3]))],
  [/(?<![\d.\-/])(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?![\d.\-/])/g, (m) => partsToDate(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[2]), Number(m[1]))],
  [new RegExp(`(?<![\\d])(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+${MONTH_RE}(?![a-z])(?![\\s,-]*\\d{4})`, 'gi'), (m) => partsToDate(null, monthNo(m[2]), Number(m[1]))],
  [new RegExp(`(?<![a-z])${MONTH_RE}\\.?\\s+(\\d{1,2})(?![\\d])(?!,?\\s+\\d{4})`, 'gi'), (m) => partsToDate(null, monthNo(m[1]), Number(m[2]))],
];

// A line about the delivery, not the order: its date is never the order's date.
const DELIVERY_LINE = /deliver|arriv|dispatch|shipped|ships|return|replace|expected|डिलीवर/i;

/**
 * Every date in some lines: [{ text, day, year, month, date, labelled,
 * delivery }]. day is "2026-07-20" when the year is shown, else null.
 * labelled is true when the line, or the line above, says it is the order's
 * date; delivery is true when, instead, its line is about the delivery
 * ("Delivered 22 July", "Arriving 25 July").
 */
export function datesIn(lines) {
  const texts = [].concat(lines ?? []).map(textOf);
  const out = [];
  texts.forEach((t, i) => {
    const labelled = ORDER_LABEL.test(t) || (i > 0 && ORDER_LABEL.test(texts[i - 1]) && !/\d{4}/.test(texts[i - 1].replace(/\d{3}-\d{7}-\d{7}/g, '')));
    const delivery = !labelled && DELIVERY_LINE.test(t);
    const taken = [];
    for (const [re, make] of DATE_PATTERNS) {
      for (const m of t.matchAll(re)) {
        if (taken.some(([a, b]) => m.index < b && m.index + m[0].length > a)) continue;
        const d = make(m);
        if (!d) continue;
        taken.push([m.index, m.index + m[0].length]);
        out.push({ text: m[0].trim(), ...d, labelled, delivery });
      }
    }
  });
  return out;
}

/** True when a date read from a screenshot is the sheet's day ("2026-07-20"); a date shown without its year is compared by day and month. */
export function sameDay(read, sheetDay) {
  if (!read || !sheetDay) return false;
  if (read.day) return read.day === sheetDay;
  return Number(sheetDay.slice(5, 7)) === read.month && Number(sheetDay.slice(8, 10)) === read.date;
}

/** A date read without its year, given the year that puts it nearest to a day ("2026-07-20"); with its year, as it is. */
export function dayNear(read, nearDay) {
  if (!read) return null;
  if (read.day) return read.day;
  if (!nearDay) return null;
  const y = Number(nearDay.slice(0, 4));
  const base = Date.parse(`${nearDay}T00:00:00Z`);
  const options = [y - 1, y, y + 1].map((yy) => partsToDate(yy, read.month, read.date)).filter((d) => d?.day);
  options.sort((a, b) => Math.abs(Date.parse(`${a.day}T00:00:00Z`) - base) - Math.abs(Date.parse(`${b.day}T00:00:00Z`) - base));
  return options[0]?.day ?? null;
}

// ---- amounts ----

const AMOUNT_LABEL = /(order total|grand total|item\(?s\)?\s*sub-?total|sub-?total|total amount|amount paid|you paid|\btotal|\bpaid|item price|\bprice|\bamount|\bmrp)\s*:?\s*(?:\(\d+\s*items?\))?\s*:?\s*$/i;
const NUMBER = '(\\d{1,3}(?:,\\d{2,3})+|\\d+)(?:\\.(\\d{1,2}))?';
// ₹ as Tesseract reads it: ₹, %, २, £, Rs, INR.
const MONEY = new RegExp(`(?:₹|%|२|£|\\brs\\.?|\\binr)\\s*${NUMBER}(?![\\d.,])`, 'gi');
// A line that is only a number, as a large amount on its own line is read when its rupee sign is lost ("₹314" on Amazon Pay's page).
const LONE = /^\W{0,2}(\d{2,3}(?:,\d{3})*|\d{2,6})(?:\.(\d{2}))?\W{0,2}$/;
const DECIMAL = /(?<![\d.,/-])(\d{1,3}(?:,\d{2,3})+|\d+)\.(\d{2})(?![\d.,/-])/g;

const toNumber = (whole, paise) => Number(`${whole.replace(/,/g, '')}${paise ? `.${paise}` : ''}`);

/**
 * Tesseract may read the rupee sign as a digit stuck to the number (a 2, 3,
 * 7 or 8: "₹654.00" comes out as "7654.00", "₹314" as "3314"), and may lose
 * the decimal point ("₹344.00" comes out as "34400"). For a number read with
 * no rupee sign, the other numbers it may really be: without its first digit,
 * without its last two digits as paise, and both. "2,654" is never one
 * ("₹654" read wrongly never has a comma after its first digit).
 */
function otherReadings(whole, paise) {
  const out = [];
  const push = (v) => {
    if (Number.isFinite(v) && v > 0 && !out.includes(v)) out.push(v);
  };
  const digits = whole.replace(/,/g, '');
  if (/^[2378]\d/.test(whole)) push(toNumber(whole.slice(1), paise));
  if (!paise && /^\d{3,}00$/.test(digits)) push(Number(digits) / 100);
  if (!paise && /^[2378]\d{2,}00$/.test(digits)) push(Number(digits.slice(1)) / 100);
  return out;
}

// Amounts that are never the order's amount: delivery charges and fees (kind 'fee'), money taken off (kind 'off') and tax (kind 'tax').
const FEE = /(shipping|delivery|postage|packing|handling|convenience|platform|marketplace|\bcod\b|\bfees?\b|charges?)[^\d₹%२]*$/i;
const OFF = /(promotion|\bpromo|discount|coupon|offer|saving|saved|you save|gift|wrap|donation|\bemi\b|interest|cash\s*back)[^\d₹%२]*$/i;
const TAX = /(\btax|\bgst)[^\d₹%२]*$/i;
const skipKind = (before) => (/[-−–]\s*$/.test(before) ? 'off' : OFF.test(before) ? 'off' : FEE.test(before) ? 'fee' : TAX.test(before) ? 'tax' : null);
/** A label that names the order's total, or what was paid: never a subtotal. */
const TOTAL_LABEL = /^(?!.*sub-?total)(?=.*(?:total|paid))/i;

/**
 * Every amount shown in some lines: [{ text, value, label, skip, kind, alts }].
 * A rupee sign, two decimals, or a label like "Grand Total" makes a number an
 * amount. skip is true for one that is never the order's amount: below zero,
 * or a delivery charge, a fee, a discount, an offer, a saving or tax; kind
 * says which ('fee', 'off' or 'tax'). alts are the other numbers it may
 * really be when the rupee sign was read as a digit or the decimal point was
 * lost (otherReadings). A line that is only a number is kept too, marked
 * lone: it is the amount only when it is the sheet's (matchingAmount), and is
 * never said to be a different amount.
 */
export function amountsIn(lines) {
  const out = [];
  const add = (text, value, label, before, alts = []) => {
    if (!Number.isFinite(value) || value <= 0) return;
    const kind = skipKind(before);
    const skip = kind !== null;
    if (!out.some((a) => a.value === value && a.label === label && a.skip === skip)) out.push({ text: text.trim(), value, label, skip, kind, alts });
  };
  for (const line of [].concat(lines ?? []).map(textOf)) {
    const seen = new Set();
    for (const m of line.matchAll(MONEY)) {
      const before = line.slice(0, m.index);
      // A rupee sign read as "२" and a digit ("₹289" as "२7289"): the number may be without that digit.
      const misread = /^२/.test(m[0]) && /^[2378]\d{2}/.test(m[1]) ? [toNumber(m[1].slice(1), m[2])] : [];
      add(m[0], toNumber(m[1], m[2]), before.match(AMOUNT_LABEL)?.[1]?.toLowerCase() ?? null, before, misread);
      seen.add(m.index + m[0].length);
    }
    for (const m of line.matchAll(DECIMAL)) {
      if ([...seen].some((end) => end === m.index + m[0].length)) continue;
      const before = line.slice(0, m.index);
      add(m[0], toNumber(m[1], m[2]), before.match(AMOUNT_LABEL)?.[1]?.toLowerCase() ?? null, before, otherReadings(m[1], m[2]));
    }
    const lone = seen.size ? null : line.match(LONE);
    if (lone && !out.some((a) => a.value === toNumber(lone[1], lone[2]))) out.push({ text: line.trim(), value: toNumber(lone[1], lone[2]), label: null, skip: false, kind: null, alts: otherReadings(lone[1], lone[2]), lone: true });
    const labelled = line.match(/(order total|grand total|item\(?s\)?\s*sub-?total|amount paid|you paid|item price)\s*:?\s*(\d[\d,]*)(?![\d.,])/i);
    if (labelled) add(labelled[2], toNumber(labelled[2], null), labelled[1].toLowerCase(), line.slice(0, labelled.index + labelled[0].length - labelled[2].length), otherReadings(labelled[2], null));
  }
  return out;
}

/**
 * The amount shown that is the sheet's (an order total, an amount paid or an
 * item price), within `tolerance` rupees, as it is or as it may really be
 * (alts); its value is the one that matched. null when none is.
 */
export function matchingAmount(amounts, sheetAmount, tolerance) {
  if (!Number.isFinite(sheetAmount)) return null;
  const near = (v) => Number.isFinite(v) && Math.abs(v - sheetAmount) <= tolerance + 1e-9;
  const hit = (amounts ?? []).find((a) => !a.skip && (near(a.value) || (a.alts ?? []).some(near)));
  return hit ? { ...hit, value: near(hit.value) ? hit.value : hit.alts.find(near) } : null;
}

/** True when some amounts hold a line that names the order's total or what was paid. */
export const totalShown = (amounts) => (amounts ?? []).some((a) => a.label && TOTAL_LABEL.test(a.label));

/**
 * The amount shown that is the sheet's, the way staff read an order page:
 * the amount itself (matchingAmount); else an item price or subtotal that,
 * with the shipping and fees shown (and the money taken off), adds up to the
 * sheet's amount; else, when no total is shown at all, an item price or
 * subtotal up to `allowance` rupees below the sheet's amount (Amazon's fees
 * are not on the screenshot). -> { value, label, how, parts } or null; how is
 * 'same', 'with fees' or 'fees not shown'.
 */
export function amountMatch(amounts, sheetAmount, { tolerance = 1, allowance = 0 } = {}) {
  if (!Number.isFinite(sheetAmount)) return null;
  const direct = matchingAmount(amounts, sheetAmount, tolerance);
  if (direct) return { value: direct.value, label: direct.label, how: 'same', parts: [] };
  const near = (v) => Math.abs(v - sheetAmount) <= tolerance + 1e-9;
  const list = amounts ?? [];
  // A number alone on a line counts only as it is (matchingAmount): it is never added up with fees.
  const bases = list.filter((a) => !a.skip && !a.lone && !(a.label && TOTAL_LABEL.test(a.label)));
  const readings = (a) => [a.value, ...(a.alts ?? [])];
  const fees = list.filter((a) => a.kind === 'fee');
  const offs = list.filter((a) => a.kind === 'off');
  const sum = (xs) => xs.reduce((n, a) => n + a.value, 0);
  // Each way the lines may add up: every fee, each fee alone, with and without the money taken off.
  const feeSets = [fees, ...fees.map((f) => [f]), []].filter((s, i, all) => all.findIndex((t) => t.length === s.length && t.every((x, k) => x === s[k])) === i);
  for (const base of bases) {
    for (const v of readings(base)) {
      for (const set of feeSets) {
        for (const less of [[], offs]) {
          if (!set.length && !less.length) continue;
          if (near(v + sum(set) - sum(less))) return { value: v, label: base.label, how: 'with fees', parts: [...set.map((a) => ({ value: a.value, kind: 'fee' })), ...less.map((a) => ({ value: a.value, kind: 'off' }))] };
        }
      }
    }
  }
  if (allowance > 0 && !totalShown(list)) {
    for (const base of bases) {
      for (const v of readings(base)) {
        const gap = sheetAmount - v;
        if (gap > 1e-9 && gap <= allowance + 1e-9) return { value: v, label: base.label, how: 'fees not shown', parts: [] };
      }
    }
  }
  return null;
}

/** A rupee amount as staff write it: ₹654 or ₹851.95. */
export function rupees(v) {
  if (!Number.isFinite(v)) return '';
  return `₹${Number.isInteger(v) ? v : v.toFixed(2)}`;
}

// ---- product names ----

/** The shop's name after a product's name in a sheet ("Face Wash For Man - Amazon"): it names the shop, not the product. */
const SHOP_AT_END = /\s*[-–—|:]+\s*amazon(?:\.in)?\s*$/i;
/** Words that only give a size or a pack, not what the product is. */
const SIZE_WORDS = new Set(['ml', 'l', 'ltr', 'litre', 'litres', 'liter', 'liters', 'g', 'gm', 'gms', 'gram', 'grams', 'kg', 'pack', 'of', 'pcs', 'pc', 'piece', 'pieces', 'combo', 'set', 'x']);
const realWords = (t) => productWords(t).filter((w) => /\p{L}/u.test(w) && !SIZE_WORDS.has(w));

/**
 * The products a sheet's cell names, each without the shop's name at its
 * end: the whole name, and, when commas part it into names of two real words
 * or more each, every one of those too ("Face Wash For Man - Amazon, Beard
 * Oil - Amazon"). A long name with a size after a comma ("…Liquid, Lavender,
 * 1 Litre") stays one name.
 */
export function productNames(text) {
  const raw = String(text ?? '').trim();
  const parts = raw.split(',').map((p) => p.replace(SHOP_AT_END, '').trim()).filter(Boolean);
  if (!parts.length) return [];
  const several = parts.length > 1 && parts.every((p) => realWords(p).length >= 2);
  const whole = parts.join(', ');
  return several ? [whole, ...parts] : [whole];
}

/** A word's plain form for product names: "men" is "man", "women" is "woman", and a plural loses its last s ("cleaners", "wipes"). */
function plainForm(w) {
  if (w === 'men') return 'man';
  if (w === 'women') return 'woman';
  if ([...w].length >= 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}
const plainWords = (t) => wordsOf(t).map(plainForm).join(' ');

/**
 * How well a product's name (the sheet's short label) is shown in some
 * lines: the best share of its words found in one line or in two or three
 * lines one after another (a name wraps), small reading mistakes allowed
 * ("Charcol" is "Charcoal"), "men" as "man" and plurals as one. A short name
 * without the brand is found in the long name ("Face Wash For Man - Amazon"
 * in "Testbrand Face Wash for Men, 100 ml"), and a cell that names several
 * products is shown when any one of them is. -> { share, shown, name } (name:
 * which of its names) or null when the name has no words.
 */
export function productShown(name, lines) {
  const names = productNames(name).filter((n) => productWords(n).length);
  if (!names.length) return null;
  const texts = [].concat(lines ?? []).map(textOf).map((t) => t.trim()).filter(Boolean);
  let best = null;
  for (const one of names) {
    const want = productWords(one).map(plainForm).join(' ');
    let top = { share: 0, shown: null, name: one };
    for (let i = 0; i < texts.length; i++) {
      for (let n = 1; n <= 3 && i + n <= texts.length; n++) {
        const shown = texts.slice(i, i + n).join(' ');
        const share = overlapScore(want, plainWords(shown)) ?? 0;
        if (share > top.share + 1e-9 || (share === top.share && top.shown && shown.length < top.shown.length)) top = { share, shown, name: one };
      }
    }
    if (!best || top.share > best.share + 1e-9) best = top;
  }
  return best;
}

// ---- a product's real name, or its start ----

const CUT_SHORT = /(\.{3}|…)\s*$/;
/** The words of a name or a line: capitals and punctuation aside, letters and digits only. */
const nameWords = (s) => normalizeText(s).split(' ').filter(Boolean);

/** How far a line shows a name's start: { full, cut, whole } or null when its words go another way. `lead` is how many of the name's first words are the brand's. */
function startOn(line, want, lead = 1) {
  const cut = CUT_SHORT.test(line);
  const words = nameWords(line.replace(CUT_SHORT, ''));
  // The name's first word, among the first few words read (a stray mark may come before it).
  let q = words.slice(0, 4).findIndex((w) => closeWords(want[0], w));
  if (q < 0) return null;
  let p = 0;
  let stray = 0;
  while (q < words.length && p < want.length) {
    const w = words[q];
    if (closeWords(want[p], w)) {
      p++;
      q++;
      continue;
    }
    // The last word of a name Amazon cut short: the start of the name's next word.
    if (cut && q === words.length - 1 && (want[p].startsWith(w) || (w.length >= 4 && closeWords(w, want[p].slice(0, w.length))))) return { full: p, cut: true, whole: false };
    // A price, a stray mark of one or two letters ("mi" for "ml"), or a word read wrongly in place of the name's word (the next word is the name's next) is passed over, at most twice. An extra word in the middle is not: that is another name.
    const next = words[q + 1];
    const misread = next !== undefined && p + 1 < want.length && closeWords(want[p + 1], next) && !closeWords(want[p], next);
    if (stray < 2 && (/^\d/.test(w) || [...w].length <= 2 || misread)) {
      stray++;
      q++;
      if (misread) p++;
      continue;
    }
    break;
  }
  if (p === want.length) return { full: p, cut: false, whole: true };
  // The line ends, or goes on with other words (a button read onto the end of the name, "Cancel items"): the start shown, when it is the brand and a word or more of the name. The brand alone ("Sold by: Koparo") is not a start.
  return p >= Math.max(1, lead) + 1 ? { full: p, cut: false, whole: false } : null;
}

/**
 * Whether some lines show a product's real name, or its start: from the
 * name's first word on, the words read are its words in order (small reading
 * mistakes allowed) until the line ends, or until Amazon cut it short with
 * "..." (the last word may then be the start of a word). A name over two or
 * three lines counts too. A line that goes on with other words after the
 * name's start (a button read onto its end) still shows that start, when it
 * is the brand (`lead` words) and a word or more of the name. -> { full, cut,
 * whole, shown } for the longest start shown, or null: full is how many of
 * its words show whole, cut is true when the next one shows only in part,
 * shown is the words as read.
 */
export function nameStartShown(lines, name, { lead = 1 } = {}) {
  const want = nameWords(name);
  if (!want.length) return null;
  const texts = [].concat(lines ?? []).map(textOf).map((t) => t.trim()).filter(Boolean);
  let best = null;
  const score = (x) => x.full + (x.cut ? 1 : 0);
  for (let i = 0; i < texts.length; i++) {
    for (let n = 1; n <= 3 && i + n <= texts.length; n++) {
      const shown = texts.slice(i, i + n).join(' ');
      const got = startOn(shown, want, lead);
      if (got && (!best || score(got) > score(best) || (score(got) === score(best) && shown.length < best.shown.length))) best = { ...got, shown };
    }
  }
  return best;
}

/**
 * True when two lines show the same start of a product's name, as two
 * screenshots cut it short the same way ("2. Mannlich Intimate Anti-C..." and
 * "Mannlich Intimate Anti-C..."): stray marks before the name and the cut
 * ends aside, the words of the shorter are the words of the longer, in order,
 * small reading mistakes allowed, the last word of either as the start of
 * the other's.
 */
export function sameStart(a, b) {
  const strip = (t) => {
    const ws = nameWords(String(t ?? '').replace(CUT_SHORT, ''));
    let i = 0;
    while (i < ws.length - 1 && ([...ws[i]].length <= 2 || /^\d/.test(ws[i]))) i++;
    return ws.slice(i);
  };
  const x = strip(a);
  const y = strip(b);
  if (!x.length || !y.length) return false;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.every((w, i) => (i === s.length - 1 ? closeWords(w, l[i]) || l[i].startsWith(w) || w.startsWith(l[i]) : closeWords(w, l[i])));
}

/**
 * True when a start shown is enough to name the product: its whole name, or
 * two of its words or more after the brand's (`lead`, the words of the brand
 * the name starts with), the first of them whole.
 */
export const enoughOfName = (hit, lead = 1) => Boolean(hit && (hit.whole || (hit.full >= Math.max(1, lead) + 1 && hit.full + (hit.cut ? 1 : 0) >= Math.max(1, lead) + 2)));

/**
 * True when a line could be the start of a product's name: after at most
 * three stray marks, it has the name's first `lead + 1` words (the brand and
 * the word after it) in order, small reading mistakes allowed. Weaker than
 * nameStartShown: a line that could be this product is never called another
 * product.
 */
export function nameCouldBe(line, name, lead = 1) {
  const want = nameWords(name).slice(0, Math.max(1, lead) + 1);
  const words = nameWords(String(line ?? '').replace(CUT_SHORT, ''));
  if (!want.length || words.length < want.length) return false;
  for (let i = 0; i <= Math.min(3, words.length - want.length); i++) {
    if (want.every((w, j) => closeWords(w, words[i + j]))) return true;
  }
  return false;
}

/** How many of a name's first words are a brand's words: 0 when the name does not start with the brand. */
export function brandWordsAtStart(name, brand) {
  const n = nameWords(name);
  const b = nameWords(brand);
  return b.length && b.every((w, i) => n[i] && closeWords(w, n[i])) ? b.length : 0;
}

/**
 * A line that starts with one of these brands, after at most two stray marks
 * of one or two letters ("a)"), and shows two words or more after it: a
 * product's name, whichever product it is. Never a line like "Visit the
 * Test Brand Store" or "Sold by Test Brand". The line as read, or null.
 */
export function nameLineStarting(lines, brands) {
  const starts = [...new Set((brands ?? []).map((b) => nameWords(b).join(' ')).filter(Boolean))].map((b) => b.split(' '));
  for (const raw of [].concat(lines ?? []).map(textOf)) {
    const words = nameWords(raw.replace(CUT_SHORT, ''));
    const at = (i) => starts.find((b) => b.every((w, j) => words[i + j] && closeWords(w, words[i + j])));
    let i = 0;
    while (i < 2 && words[i] && [...words[i]].length <= 2 && !at(i)) i++;
    const brand = at(i);
    if (brand && words.length - i - brand.length >= 2) return raw.trim();
  }
  return null;
}

// ---- phrases ----

// Apostrophes of any kind go, and the digits Tesseract reads for letters (0 for o, 1 for l) are read as those letters.
const phraseWords = (s) => wordsOf(String(s ?? '').replace(/[’‘`´']/g, '')).map((w) => w.replace(/0/g, 'o').replace(/1/g, 'l'));

/**
 * Where a phrase from settings.json is in some lines, as the words read
 * there; null when it is not. Capitals, punctuation, apostrophes, line
 * breaks and small reading mistakes do not matter.
 */
export function phraseIn(lines, phrase) {
  const texts = [].concat(lines ?? []).map(textOf);
  const want = phraseWords(phrase);
  if (!want.length) return null;
  const words = [];
  texts.forEach((t, li) => {
    for (const w of phraseWords(t)) words.push({ w, li });
  });
  for (let i = 0; i + want.length <= words.length; i++) {
    let ok = true;
    for (let j = 0; j < want.length && ok; j++) ok = closeWords(want[j], words[i + j].w);
    if (ok) {
      const from = words[i].li;
      const to = words[i + want.length - 1].li;
      const span = texts.slice(from, to + 1).join(' ').replace(/\s+/g, ' ').trim();
      // Only the sentence that says it, when it fits in one.
      const sentences = span.split(/(?<=[.!?])\s+/);
      return sentences.length > 1 ? sentences.find((s) => phraseIn([s], phrase)) ?? span : span;
    }
  }
  return null;
}

/** The first phrase of a list that is in some lines: { phrase, words } or null. */
export function firstPhrase(lines, phrases) {
  for (const p of phrases ?? []) {
    const words = phraseIn(lines, p);
    if (words) return { phrase: p, words };
  }
  return null;
}

/** True when some words (a cell, a line) hold one of the words listed, as whole words. */
export function holdsWord(text, list) {
  const t = ` ${normalizeText(text)} `;
  return (list ?? []).some((w) => {
    const n = normalizeText(w);
    return n && t.includes(` ${n} `);
  });
}
