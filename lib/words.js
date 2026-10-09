// Shared words and small pieces the screens draw the same way: India times,
// safe links, notices, CSV, fields and tables. Nothing here decides a result;
// it only names the one the server gave.

// ---- times ----

const IST = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: false,
});
/** A server time in India time, the day first: "01-10-2026 at 17:27". Empty when there is none. */
export function ist(value) {
  if (value === null || value === undefined || value === '') return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(IST.formatToParts(d).map((x) => [x.type, x.value]));
  const two = (n) => String(Number(n)).padStart(2, '0');
  return `${two(p.day)}-${two(p.month)}-${p.year} at ${two(Number(p.hour) % 24)}:${p.minute}`;
}

// ---- links ----

/** The link when it is http or https, else null. */
export function safeUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** A link that opens in a new tab, or plain text when the link is not http(s). */
export function link(h, href, text) {
  const url = safeUrl(href);
  const label = text ?? href ?? '';
  if (!url) return h('span', { class: 'nolink' }, label || 'Link');
  return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label || url);
}

// ---- notices ----

export function notice(h, tone, text, extra = null) {
  if (!text) return null;
  const role = tone === 'error' ? 'alert' : 'status';
  return h('div', { class: `notice notice-${tone}`, role }, h('p', null, text), extra);
}

// ---- counts ----

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// ---- CSV ----

/** One cell: always quoted; a cell that a spreadsheet would run as a formula starts with '. */
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Rows (arrays of cells) as CSV text, with a byte-order mark so Excel reads Hindi. */
export function csv(rows) {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ---- fields and tables ----

function field(h, label, value) {
  return h('div', { class: 'field-row' }, h('dt', null, label), h('dd', null, value === null || value === undefined || value === '' ? 'None' : value));
}

export function fields(h, pairs) {
  return h('dl', { class: 'fields' }, pairs.filter(Boolean).map(([l, v]) => field(h, l, v)));
}

export function quote(h, text) {
  if (!text) return h('p', { class: 'muted' }, 'No review text.');
  return h('blockquote', { class: 'quote' }, text);
}

/** A table always sits in a wrapper that scrolls sideways on its own. */
export function table(h, head, rows, attrs = {}) {
  return h(
    'div',
    { class: 'table-wrap' },
    h('table', attrs, h('thead', null, h('tr', null, head.map((c) => h('th', { scope: 'col' }, c)))), h('tbody', null, rows)),
  );
}
