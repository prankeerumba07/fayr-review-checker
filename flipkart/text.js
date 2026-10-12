// Comparing words read from a screenshot with words in the sheet, copied from
// the Amazon checker's text helpers (amazon/text.js): only what reading a
// purchase screenshot needs. Pure. Nothing here opens a page or reads a file.

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
