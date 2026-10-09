// Comparing words: review text, names, dates, and a rare word to search by.
// Pure. Nothing here opens a page or reads a file.

/** Lower case, NFKC, punctuation and symbols gone, spaces collapsed. Letters, marks and digits stay (Hindi matras are marks). */
export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The same text with no spaces at all, for "ignoring capital letters, extra spaces and punctuation". */
export function compactText(s) {
  return normalizeText(s).replace(/\s+/g, '');
}

/** Exactly the same review text, ignoring capitals, spaces and punctuation. Empty is never the same. */
export function sameText(a, b) {
  const x = compactText(a);
  return x.length > 0 && x === compactText(b);
}

export function wordsOf(s) {
  const n = normalizeText(s);
  return n ? n.split(' ') : [];
}

/** Levenshtein distance, stopping early past `max`. */
export function editDistance(a, b, max = Infinity) {
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

/** Two words the same allowing a small reading mistake: none under 4 letters, 1 up to 7, 2 from 8. */
export function closeWords(a, b) {
  if (a === b) return true;
  const len = Math.max([...a].length, [...b].length);
  const allowed = len < 4 ? 0 : len < 8 ? 1 : 2;
  return allowed > 0 && editDistance(a, b, allowed) <= allowed;
}

/** The letters Tesseract most often mistakes for each other, folded the same way on both sides. */
function ocrFold(w) {
  return w.replace(/rn/g, 'm').replace(/[1|]/g, 'l').replace(/0/g, 'o');
}

/**
 * How much of `reference` was read in `candidate`, from 0 to 1: the share of
 * the reference's words found in the candidate, each candidate word used once,
 * small reading mistakes allowed. Null when the reference has no words.
 */
export function overlapScore(reference, candidate) {
  const ref = wordsOf(reference).map(ocrFold);
  if (!ref.length) return null;
  const pool = new Map();
  for (const w of wordsOf(candidate).map(ocrFold)) pool.set(w, (pool.get(w) ?? 0) + 1);
  let matched = 0;
  const missed = [];
  for (const w of ref) {
    if ((pool.get(w) ?? 0) > 0) {
      pool.set(w, pool.get(w) - 1);
      matched++;
    } else missed.push(w);
  }
  const rest = [...pool.entries()].flatMap(([w, n]) => Array(n).fill(w));
  for (const w of missed) {
    const j = rest.findIndex((c) => closeWords(w, c));
    if (j >= 0) {
      rest.splice(j, 1);
      matched++;
    }
  }
  return matched / ref.length;
}

export function percent(score) {
  return score === null || score === undefined ? '—' : `${Math.round(score * 100)}%`;
}

// ---- names ----

const HIDDEN_NAMES = new Set(['amazon customer', 'kindle customer', 'amazon kunde']);

export function isHiddenName(name) {
  return HIDDEN_NAMES.has(normalizeText(name));
}

/**
 * A name the user gave (or a screenshot shows) against the name Amazon shows.
 * Every word Amazon shows must be in the other name; an initial may stand for
 * a word, and a small display difference (case, dots, one letter in a long
 * word) is not a failure. Anything less certain goes to a person.
 */
export function compareNames(userName, amazonName) {
  if (!normalizeText(amazonName)) return { result: 'missing', ok: false, says: 'Amazon showed no name.' };
  if (isHiddenName(amazonName)) return { result: 'hidden', ok: false, says: `Amazon hides the name ("${amazonName.trim()}"), so it could not be compared.` };
  if (!normalizeText(userName)) return { result: 'missing', ok: false, says: 'There is no name to compare with.' };
  const user = wordsOf(userName);
  const shown = wordsOf(amazonName);
  if (user.join(' ') === shown.join(' ')) return { result: 'same', ok: true, says: 'Same name.' };
  const fits = (w) =>
    user.some((u) => u === w || (w.length === 1 && u.startsWith(w)) || (u.length === 1 && w.startsWith(u)) || (Math.min(u.length, w.length) >= 4 && editDistance(u, w, 1) <= 1));
  if (shown.every(fits)) return { result: 'small-difference', ok: true, says: 'A small display difference only.' };
  return { result: 'different', ok: false, says: 'The name on Amazon is not the user’s name, so staff must check it.' };
}

/** A name's words: capitals, dots, accents and punctuation aside. */
const nameParts = (s) => normalizeText(String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')).split(' ').filter(Boolean);

/**
 * Whether two names are the same person's name, the way staff read them.
 * Amazon often shortens a name: "Rahul Kumar Sharma" shows as "Rahul K." or
 * "Rahul Sharma". So capitals, dots and accents do not count, and every word
 * of the shorter name only has to be one of the longer name's words (or the
 * initial of one, or one letter apart in a word of four letters or more),
 * each used once, in any order: a missing word, an initial, one name only
 * ("Asha" for "Asha Verma") and a name written as one word all count as the
 * same name. Only a name with a word that is not in the other is different.
 * -> { same, how }: how is 'same', 'initial', 'missing word', 'one name',
 * 'spelling', 'joined', 'missing' (nothing to compare) or 'different'.
 */
export function sameName(a, b) {
  const x = nameParts(a);
  const y = nameParts(b);
  if (!x.length || !y.length) return { same: false, how: 'missing' };
  if (x.join(' ') === y.join(' ')) return { same: true, how: 'same' };
  if (x.join('') === y.join('')) return { same: true, how: 'joined' };
  const wordSame = (p, q) => p === q || (Math.min(p.length, q.length) >= 4 && editDistance(p, q, 1) <= 1);
  const initial = (p, q) => (p.length === 1 && q.startsWith(p)) || (q.length === 1 && p.startsWith(q));
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const left = [...long];
  let initials = 0;
  let slips = 0;
  for (const w of short) {
    let j = left.findIndex((q) => wordSame(w, q));
    if (j >= 0) {
      if (w !== left[j]) slips++;
    } else {
      j = left.findIndex((q) => initial(w, q));
      if (j < 0) return { same: false, how: 'different' };
      initials++;
    }
    left.splice(j, 1);
  }
  if (initials) return { same: true, how: 'initial' };
  if (short.length === 1 && long.length > 1) return { same: true, how: 'one name' };
  if (short.length < long.length) return { same: true, how: 'missing word' };
  return { same: true, how: slips ? 'spelling' : 'same' };
}

/** A name as read from a screenshot against the name on Amazon: every Amazon word read, small reading mistakes allowed. */
export function nameReadAs(amazonName, readName) {
  const score = overlapScore(amazonName, readName);
  return score !== null && score >= 0.99;
}

/**
 * A line read from a screenshot that is only the stars (Tesseract reads a
 * row of orange stars as "KKKKK", "Kk kkk", "tototkotok" or Hindi marks),
 * with or without "Verified Purchase" beside them, as the Amazon app shows
 * between the reviewer's name and the title. Never someone's name.
 */
export function starsLine(text) {
  const raw = String(text ?? '');
  const rest = raw.replace(/verified\s*purchase/gi, '');
  if (!rest.trim()) return /verified\s*purchase/i.test(raw);
  if (/verified\s*purchase/i.test(raw)) return true;
  const latin = (rest.match(/[a-z]/gi) ?? []).map((c) => c.toLowerCase());
  if (latin.length < 3) return true;
  const distinct = new Set(latin).size;
  const ks = latin.filter((c) => c === 'k').length;
  // One or two letters over and over ("KKKKK"), mostly k's ("KkKkekKks"), or a long run of three letters ("tototkotok"); never a short word such as "Good" or "Raj".
  return distinct <= 2 || ks / latin.length >= 0.5 || (distinct <= 3 && latin.length >= 6);
}

/** A name read from a screenshot, with what Tesseract read from the small picture beside it ("€", "@)", "(Re", "«©") dropped, and anything after a "|" (another column of the page). */
export function cleanName(text) {
  const parts = String(text ?? '').replace(/\s*\|.*$/, '').trim().split(/\s+/);
  const word = (p) => /^\p{L}[\p{L}\p{M}.'’-]*$/u.test(p);
  while (parts.length > 1 && !word(parts[0])) parts.shift();
  return parts.filter(word).join(' ');
}

// ---- product names ----

const CUT = /(\.{3}|…)\s*$/;

/** A product name's words. A name cut short on screen ("… Steel Wat…") loses its cut word. */
export function productWords(name) {
  const raw = String(name ?? '').normalize('NFKC').trim();
  const cut = CUT.test(raw);
  const words = wordsOf(raw.replace(CUT, ''));
  if (cut && words.length > 1) words.pop();
  return words;
}

/**
 * How much two product names agree, 0 to 1: the share of the shorter name's
 * words found in the longer one, small reading mistakes allowed. Names are
 * often cut short on screen, so only the shorter name's words count. Null
 * when the shorter name has fewer than `minWords` words.
 */
export function nameShare(a, b, minWords = 2) {
  const x = productWords(a);
  const y = productWords(b);
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  if (shorter.length < minWords) return null;
  return overlapScore(shorter.join(' '), longer.join(' '));
}

// ---- dates ----

const MONTH_WORDS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
  'जनवरी': 1, 'फ़रवरी': 2, 'फरवरी': 2, 'मार्च': 3, 'अप्रैल': 4, 'मई': 5, 'जून': 6, 'जुलाई': 7, 'अगस्त': 8,
  'सितंबर': 9, 'सितम्बर': 9, 'अक्तूबर': 10, 'अक्टूबर': 10, 'नवंबर': 11, 'नवम्बर': 11, 'दिसंबर': 12, 'दिसम्बर': 12,
};
// Keys in NFKC, the form dayFrom() compares in (a nukta may be typed either way).
const MONTHS = Object.fromEntries(Object.entries(MONTH_WORDS).map(([k, v]) => [k.normalize('NFKC'), v]));

function iso(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "5 September 2025", "September 5, 2025" or "5 सितंबर 2025" as "2025-09-05"; null when it is not a date. */
export function dayFrom(text) {
  const t = String(text ?? '').normalize('NFKC').replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  let m = t.match(/(\d{1,2})\s+([\p{L}\p{M}]+)\.?\s+(\d{4})/u);
  if (m && MONTHS[m[2]]) return iso(Number(m[3]), MONTHS[m[2]], Number(m[1]));
  m = t.match(/([\p{L}\p{M}]+)\.?\s+(\d{1,2})\s+(\d{4})/u);
  if (m && MONTHS[m[1]]) return iso(Number(m[3]), MONTHS[m[1]], Number(m[2]));
  return null;
}

/** The date part of a "Reviewed in India on 5 September 2025" line (or its Hindi form), or null. */
export function reviewedOn(line) {
  const t = String(line ?? '').normalize('NFKC');
  const en = t.match(/reviewed\s+in\s+(.+?)\s+on\s+(.+)$/i);
  if (en) return { country: en[1].trim(), dateText: en[2].trim() };
  const hi = t.match(/(.+?)\s+में\s+(.+?)\s+को\s+समीक्षा/);
  if (hi) return { country: hi[1].trim(), dateText: hi[2].trim() };
  return null;
}

// ---- a rare word to search by ----

const COMMON = new Set(
  (
    'about above after again against also although always among another because before being below between both ' +
    'could didnt does doesnt doing done down during each enough even every first from further have having here ' +
    'into itself just know like made make many more most much must never only other ours over quite really same ' +
    'should since some still such than that their them then there these they thing things this those though ' +
    'through under until very want were what when where which while with within without would your yours ' +
    'amazing amazon awesome bought brand buying cheap colour color comfortable delivery design excellent ' +
    'fantastic product products quality price prices value money worth recommend recommended highly great ' +
    'nice good best better perfect super happy satisfied overall using used useful works working worked ' +
    'easily item items purchase purchased review reviews stars star months month weeks week years year days ' +
    'little looks looking lovely loved order ordered received package packing seller service size sizes ' +
    'totally truly usage simple performance experience features feature okay thanks ' +
    'बहुत अच्छा अच्छी अच्छे प्रोडक्ट बिल्कुल बढ़िया लेकिन क्योंकि इसका इसकी इसके उसका सामान'
  )
    .split(' ')
    .map((w) => w.normalize('NFKC')),
);
const VERY_RARE_LETTERS = /[qxzj]/g;
const RARE_LETTERS = /[kvwy]/g;

/**
 * Words worth searching a product's reviews by, rarest first: long, not common
 * in reviews, not in the product's title or the reviewer's name, seen once.
 */
export function rareWords(text, avoid = []) {
  const avoidSet = new Set(avoid.flatMap((a) => wordsOf(a)));
  const counts = new Map();
  for (const w of wordsOf(text)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const scored = [];
  for (const [w, n] of counts) {
    const letters = [...w].filter((c) => /\p{L}/u.test(c)).length;
    if (letters < 5 && !(letters >= 3 && /\p{Script=Devanagari}/u.test(w))) continue;
    if (/\d/.test(w) || COMMON.has(w) || avoidSet.has(w)) continue;
    const score = [...w].length + 3 * (w.match(VERY_RARE_LETTERS)?.length ?? 0) + (w.match(RARE_LETTERS)?.length ?? 0) - 3 * (n - 1);
    scored.push({ w, score });
  }
  scored.sort((a, b) => b.score - a.score || a.w.localeCompare(b.w));
  return scored.map((s) => s.w);
}

// ---- a review page read as text ----
//
// A fallback for when the page's own markup cannot be read. The layout is the
// one measured on real signed-in review pages:
//
//   Customer Review / name / "5.0 out of 5 stars" / title /
//   "Reviewed in India on 13 June 2026" / Colour: … / Verified Purchase /
//   the words … / "2 people found this helpful" / Helpful / Report /
//   Product Details / the product's title
//
// The first star line after "Customer Review" is the reviewer's; the second,
// under Product Details, is the product's average and is never read as theirs.

// "Colour: White", "Size Name: 1 Litre"; never a review's own first words ("Size is perfect…").
const ABOUT_THE_THING_BOUGHT = /^(colour|color|size|style|set name|pattern|capacity|configuration|item package quantity|material)( name)?\s*:/i;
const AFTER_THE_WORDS = /^(helpful|report|permalink|comment|translate review to english|read more|(one|\d+) (person|people) found this helpful)$/i;

function starOn(line) {
  const m = line.toLowerCase().match(/^([0-5](?:\.\d)?)\s+out of\s+5\s+stars?\b/);
  if (!m) return null;
  const n = Math.round(Number(m[1]));
  return n >= 1 && n <= 5 ? n : null;
}

export function parseReviewPageText(text) {
  const out = { name: null, stars: null, title: null, dateText: null, day: null, verified: false, variant: null, body: null, productTitle: null };
  const all = String(text ?? '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const start = all.findIndex((l) => l.toLowerCase() === 'customer review');
  if (start < 0) return null;
  const productAt = all.findIndex((l, i) => i > start && l.toLowerCase() === 'product details');
  const end = productAt < 0 ? all.length : productAt;

  let i = start + 1;
  if (i < end && starOn(all[i]) === null) out.name = all[i++];
  while (i < end) {
    const s = starOn(all[i++]);
    if (s !== null) {
      out.stars = s;
      // A review with no title goes straight to its date, its variant or "Verified Purchase".
      if (i < end && !reviewedOn(all[i]) && !/^verified purchase$/i.test(all[i]) && !ABOUT_THE_THING_BOUGHT.test(all[i])) out.title = all[i++];
      break;
    }
  }
  let from = i;
  for (let k = i; k < end; k++) {
    const on = reviewedOn(all[k]);
    if (on && !out.dateText) {
      out.dateText = all[k];
      out.day = dayFrom(on.dateText);
      from = k + 1;
    } else if (/^verified purchase$/i.test(all[k])) {
      out.verified = true;
      from = k + 1;
    } else if (ABOUT_THE_THING_BOUGHT.test(all[k])) {
      out.variant = all[k];
      from = k + 1;
    } else break;
  }
  const body = [];
  for (let k = from; k < end; k++) {
    if (AFTER_THE_WORDS.test(all[k])) break;
    body.push(all[k]);
  }
  if (body.length) out.body = body.join('\n');
  if (productAt >= 0 && productAt + 1 < all.length) out.productTitle = all[productAt + 1];
  return out;
}
