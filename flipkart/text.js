// Comparing words read from a screenshot with words in the sheet, copied from
// the Amazon checker's text helpers (amazon/text.js): only what reading a
// screenshot and finding its review among Flipkart's reviews need. Pure.
// Nothing here opens a page or reads a file.

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

const CUT = /(\.{3}|…)\s*$/;

/** A product name's words. A name cut short on screen ("… Steel Wat…") loses its cut word. */
export function productWords(name) {
  const raw = String(name ?? '').normalize('NFKC').trim();
  const cut = CUT.test(raw);
  const words = wordsOf(raw.replace(CUT, ''));
  if (cut && words.length > 1) words.pop();
  return words;
}

// ---- distinctive words, copied from amazon/text.js ----

const COMMON = new Set(
  (
    'about above after again against also although always among another because before being below between both ' +
    'could didnt does doesnt doing done down during each enough even every first from further have having here ' +
    'into itself just know like made make many more most much must never only other ours over quite really same ' +
    'should since some still such than that their them then there these they thing things this those though ' +
    'through under until very want were what when where which while with within without would your yours ' +
    'amazing amazon awesome bought brand buying cheap colour color comfortable delivery design excellent flipkart ' +
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
