// The links in a cell of the Flipkart file, for the screen. Copied from the
// Amazon reader's way of finding links in words (amazon/links.js) and changed
// so a cell's words stay as they are: each web address written in them
// becomes a link, and a link behind the words follows them when it is not one
// of those. Only addresses that start with http://, https:// or www. count,
// since every column is shown and "1.5L/2L" or "Rs.349/-" is no link. Nothing
// here opens a link.

/** A pasted link as a URL, or null. A link without a scheme is read as https. */
export function parseUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const u = new URL(withScheme);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname ? u : null;
  } catch {
    return null;
  }
}

/** A piece of words without the brackets, quotes and full stop around it: { lead, core, trail }. */
function trimmed(token) {
  const lead = token.match(/^[(<["']*/)[0];
  const rest = token.slice(lead.length);
  const trail = rest.match(/[)>\]"'.]*$/)[0];
  return { lead, core: rest.slice(0, rest.length - trail.length), trail };
}

/** The web address a piece of words is, or null. */
function linkOf(core) {
  if (!/^(?:https?:\/\/|www\.)/i.test(core)) return null;
  return parseUrl(core)?.href ?? null;
}

/** Every web link in some words, in order: separated by spaces, commas, semicolons or new lines. */
export function linksIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/[^\s,;]+/g)) {
    const link = linkOf(trimmed(m[0]).core);
    if (link && !out.includes(link)) out.push(link);
  }
  return out;
}

/** The key two links share when they open the same page: the website (www or not), the path and the query, http or https alike. */
export function linkKey(raw) {
  const u = raw instanceof URL ? raw : parseUrl(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const query = [...u.searchParams]
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${host}${path}${query ? `?${query}` : ''}`;
}

/**
 * A cell as the screen shows it, in pieces: its words as they are, each web
 * address in them as a link, then each link behind the words that is not one
 * of those. -> [{ text } | { link }]
 */
export function cellParts(text, behind = '') {
  const parts = [];
  const shown = [];
  let words = '';
  for (const m of String(text ?? '').matchAll(/[^\s,;]+|[\s,;]+/g)) {
    const { lead, core, trail } = trimmed(m[0]);
    const link = core ? linkOf(core) : null;
    if (!link) {
      words += m[0];
      continue;
    }
    words += lead;
    if (words) parts.push({ text: words });
    parts.push({ link });
    shown.push(linkKey(link));
    words = trail;
  }
  if (words) parts.push({ text: words });
  // Excel puts the whole of "link one, link two" behind such words, so the link behind is split the same way.
  const raw = String(behind ?? '').trim();
  const hidden = /^https?:\/\//i.test(raw) ? linksIn(raw.replace(/%20/g, ' ').replace(/%2C/gi, ',')) : [];
  for (const link of hidden) {
    if (shown.includes(linkKey(link))) continue;
    const last = parts.at(-1);
    if (last && !(last.text && /\s$/.test(last.text))) parts.push({ text: ' ' });
    parts.push({ link });
    shown.push(linkKey(link));
  }
  return parts;
}
