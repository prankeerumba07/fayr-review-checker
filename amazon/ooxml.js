// Small readers for the parts of an Excel file (.xlsx) that exceljs does not
// read or must not rewrite: XML text, a part's relationships, and which
// worksheet part holds a tab. Pure; the zip is readZip()'s Map.

export function unescapeXml(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Text as XML: &, < and > escaped (and " for attributes), and characters XML cannot hold left out. */
export function escapeXml(s, { attribute = false } = {}) {
  const t = String(s ?? '')
    .replace(/[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return attribute ? t.replace(/"/g, '&quot;') : t;
}

/** A tag's attributes as an object. */
export function attrs(tag) {
  const out = {};
  for (const m of String(tag).matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = unescapeXml(m[2]);
  for (const m of String(tag).matchAll(/([\w:.-]+)\s*=\s*'([^']*)'/g)) if (out[m[1]] === undefined) out[m[1]] = unescapeXml(m[2]);
  return out;
}

/** An attribute by its name, with or without a namespace prefix ("r:id" or "id"). */
export function attr(a, name) {
  if (a[name] !== undefined) return a[name];
  const key = Object.keys(a).find((k) => k.split(':').pop() === name);
  return key === undefined ? undefined : a[key];
}

export function textPart(zip, name) {
  const get = zip.get(name);
  return get ? get().toString('utf8') : null;
}

/** A relationship target as a path inside the zip. */
export function resolvePart(fromDir, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = fromDir.split('/').filter(Boolean);
  for (const p of target.split('/')) {
    if (p === '..') parts.pop();
    else if (p && p !== '.') parts.push(p);
  }
  return parts.join('/');
}

/** A part's relationships: [{ id, type, target, external }], internal targets resolved to zip paths. */
export function relsOf(zip, part) {
  const dir = part.includes('/') ? part.slice(0, part.lastIndexOf('/')) : '';
  const name = part.slice(part.lastIndexOf('/') + 1);
  const xml = textPart(zip, `${dir ? `${dir}/` : ''}_rels/${name}.rels`);
  if (!xml) return [];
  return [...xml.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)].map((m) => {
    const a = attrs(m[1]);
    const external = a.TargetMode === 'External';
    return { id: a.Id, type: a.Type ?? '', target: external ? a.Target ?? '' : resolvePart(dir, a.Target ?? ''), external };
  });
}

/** Every <tag …>…</tag> or <tag …/> in some XML, with any namespace prefix: [{ head, body }]. */
export function blocks(xml, tag) {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*?(?:/>|>([\\s\\S]*?)</(?:\\w+:)?${tag}>)`, 'g');
  return [...String(xml ?? '').matchAll(re)].map((m) => ({ head: m[0].slice(0, m[0].indexOf('>') + 1), body: m[1] ?? '' }));
}

/** "C" for column 3. */
export function columnLetter(col) {
  let n = col;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 3 for column "C". */
export function columnNumber(letters) {
  let n = 0;
  for (const ch of String(letters).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** The tabs of a workbook, in order: [{ name, sheetId, state, part }] (part: the worksheet XML's path in the zip). */
export function tabsOf(zip) {
  const workbook = textPart(zip, 'xl/workbook.xml');
  if (!workbook) return [];
  const rels = relsOf(zip, 'xl/workbook.xml');
  return blocks(workbook, 'sheet').map((b) => {
    const a = attrs(b.head);
    const rel = rels.find((r) => r.id === attr(a, 'id'));
    return { name: a.name ?? '', sheetId: a.sheetId ?? null, state: a.state ?? 'visible', part: rel && !rel.external ? rel.target : null };
  });
}
