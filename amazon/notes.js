// The words of a Note: plain English a child could follow, in two or three
// short sentences, with one more for each other problem (a duplicate's Note
// keeps its own shape: a line for what it shares, then a last line starting
// "Why:"). Order IDs in full, dates day first, amounts in rupees, product
// names in quotes; never a cell name, a column letter or a code. Words that come from a picture, an
// Amazon page or the sheet are quoted, never trusted, and never carry one of
// the words this dashboard must not show.

const HIDDEN = ['ZmF5cg==', 'cmVmdW5k', 'Y2FzaGJhY2s=', 'cmV3YXJk'].map((b) => Buffer.from(b, 'base64').toString('utf8'));
const HIDDEN_RE = new RegExp(`[\\p{L}\\p{N}]*(?:${HIDDEN.join('|')})[\\p{L}\\p{N}]*`, 'giu');

/** Text with any word this dashboard must not show replaced by "…". */
export function clean(text) {
  return String(text ?? '').replace(HIDDEN_RE, '…');
}

/** Some words, cut short when long, on one line, cleaned. */
export function excerpt(text, n = 160) {
  const t = clean(String(text ?? '').replace(/\s+/g, ' ').trim());
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** Words quoted inside a Note as one sentence: a full stop, a question mark or an exclamation mark between sentences becomes a semicolon. */
export function oneSentence(text) {
  return String(text ?? '').replace(/([.!?])+\s+(?=\S)/g, '; ');
}

/** Some words in double quotes, cut short when long, never more than one sentence. */
export const quoted = (text, n) => `"${oneSentence(excerpt(text, n))}"`;

/** "a", "a and b", "a, b and c". */
export function joinAnd(list) {
  const l = list.filter(Boolean);
  if (l.length <= 1) return l[0] ?? '';
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
}

/** A row of the sheet with its number on the dashboard: the transactions are numbered from 1 in the sheet's order, and the heading row is never one of them. */
const numbered = (r) => r?.source === 'sheet' && Number.isInteger(r.n);

/** How a row is named in a Note: "row 37" (its number on the dashboard), or "the row added by hand (#2)". */
export function rowName(r) {
  return numbered(r) ? `row ${r.n}` : `the row added by hand (#${r?.hand ?? '?'})`;
}

/** Several rows named at once: "rows 37 and 74", "row 37 and the row added by hand (#1)". */
export function rowsNamed(rows) {
  const sheet = rows.filter(numbered).map((r) => r.n).sort((a, b) => a - b);
  const hand = rows.filter((r) => !numbered(r)).map((r) => `the row added by hand (#${r.hand ?? '?'})`);
  const parts = [];
  if (sheet.length) parts.push(`${sheet.length === 1 ? 'row' : 'rows'} ${joinAnd(sheet.map(String))}`);
  return joinAnd([...parts, ...hand]);
}

/** A Note from its lines, each on its own line, then "Why: ..." as the last line; cleaned. */
export function noteFrom(lines, why) {
  const out = lines.filter(Boolean).map((l) => clean(String(l).replace(/\s+/g, ' ').trim()));
  if (why) out.push(clean(`Why: ${String(why).replace(/\s+/g, ' ').trim()}`));
  return out.join('\n');
}

/** A Note from its sentences, in one paragraph, each ending with a full stop, cleaned. */
export function noteOf(sentences) {
  return clean(
    sentences
      .filter(Boolean)
      .map((s) => {
        const t = String(s).replace(/\s+/g, ' ').trim();
        return /[.!?]$/.test(t) ? t : `${t}.`;
      })
      .join(' '),
  );
}
