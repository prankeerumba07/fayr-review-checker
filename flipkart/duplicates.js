// Rows that share an order, a screenshot or a review, found the way the
// Amazon checker finds them (amazon/check.js before, sameWords,
// samePictures and lookAlikes; amazon/notes.js rowName and rowsNamed),
// copied for Flipkart. Rows count in the file's order, whichever was checked
// first: of the rows that share one, only the first (nearest the top) is
// checked, and the later ones are Duplicate. Pure: nothing here opens a
// picture, a file or a page.

import { wordsOf, overlapScore } from './text.js';
import { fingerprintDistance, SAME_SCREENSHOT } from './fingerprint.js';

/** A row's cells that hold pictures or links: the purchase and delivery screenshots, the review link and the review screenshot. */
export const PICTURE_CELLS = ['order', 'delivery', 'review', 'reviewShot'];

/** A row's place in the file: its row there, then its number on the dashboard. */
const rank = (r) => [Number.isInteger(r?.row) ? r.row : Infinity, Number.isInteger(r?.n) ? r.n : Infinity];
/** True when row a is nearer the top of the file than row b. */
export function before(a, b) {
  const x = rank(a);
  const y = rank(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}
/** The row nearest the top of the file among some rows. */
export const firstOf = (list) => [...list].sort((a, b) => (before(a, b) ? -1 : before(b, a) ? 1 : 0))[0];

/** "a", "a and b", "a, b and c". */
function joinAnd(list) {
  const l = list.filter(Boolean);
  if (l.length <= 1) return l[0] ?? '';
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
}
/** A row by its number on the dashboard, from 1, as a Note names it: "row 3". */
export const rowName = (r) => `row ${r?.n ?? '?'}`;
/** Several rows named at once: "row 3", "rows 3 and 7". */
export function rowsNamed(rows) {
  const n = rows.map((r) => r?.n).filter(Number.isInteger).sort((a, b) => a - b);
  return n.length ? `${n.length === 1 ? 'row' : 'rows'} ${joinAnd(n.map(String))}` : '';
}

/** True when two cells read the same: the same order IDs, or (with none shown) almost all the same words. Copied from amazon/check.js. */
export function sameWords(a, b) {
  if (!a || !b) return false;
  const x = a.orderIds ?? [];
  const y = b.orderIds ?? [];
  if (x.length || y.length) return x.length > 0 && x.length === y.length && x.every((id) => y.includes(id));
  if (wordsOf(a.text).length < 5 || wordsOf(b.text).length < 5) return false;
  const one = overlapScore(a.text, b.text);
  const two = overlapScore(b.text, a.text);
  return one !== null && two !== null && one >= 0.9 && two >= 0.9;
}

/**
 * Other rows' pictures that are this row's: { order: [{ o, which }],
 * delivery: [...], review: [...], reviewShot: [...] }. With reading null, only
 * the very same file (the same bytes) counts. With reading { which, read } for
 * a cell just read, a picture whose fingerprint is this close counts too, but
 * only when its words, read when its row was checked (seenOf(o, which)), are
 * the same: two orders' screenshots of one product look almost the same, and
 * only their words tell them apart. Copied from amazon/check.js.
 */
export function samePictures(row, others, reading, seenOf) {
  const out = { order: [], delivery: [], review: [], reviewShot: [] };
  const cells = reading ? [reading.which] : PICTURE_CELLS;
  for (const which of cells) {
    for (const pic of row.pictures?.[which] ?? []) {
      if (!pic.file) continue;
      for (const o of others) {
        if (out[which].some((h) => h.o === o)) continue;
        for (const ow of PICTURE_CELLS) {
          const hit = (o.pictures?.[ow] ?? []).some((op) => {
            if (!op.file) return false;
            if (pic.sha256 && op.sha256 === pic.sha256) return true;
            if (!reading) return false;
            const dist = fingerprintDistance(pic.fingerprint, op.fingerprint);
            return dist !== null && dist <= SAME_SCREENSHOT && sameWords(reading.read, seenOf(o, ow));
          });
          if (hit) {
            out[which].push({ o, which: ow });
            break;
          }
        }
      }
    }
  }
  return out;
}

/**
 * Other rows' pictures that look like this cell's (a fingerprint this close)
 * and whose words were read when their row was checked: the ones worth reading
 * this cell for, to tell the same picture from one that only looks the same.
 * Copied from amazon/check.js.
 */
export function lookAlikes(row, others, which, seenOf) {
  const out = [];
  for (const pic of row.pictures?.[which] ?? []) {
    if (!pic.file || !pic.fingerprint) continue;
    for (const o of others) {
      for (const ow of PICTURE_CELLS) {
        if (!seenOf(o, ow)) continue;
        if ((o.pictures?.[ow] ?? []).some((op) => op.file && op.sha256 !== pic.sha256 && (fingerprintDistance(pic.fingerprint, op.fingerprint) ?? 1) <= SAME_SCREENSHOT)) out.push({ o, which: ow });
      }
    }
  }
  return out;
}
