// The rule for every word the dashboard shows or writes (the screen, the
// Notes, the Types, the pause messages, and the Notes in the Excel file):
// never a cell name, a column letter, a code, a technical word, a long dash
// or a double dash. plainWordProblems(text) says what in some words breaks it.

const RULES = [
  [/\b(?:[Cc]ells?|[Cc]olumns?)\s+[A-Z]{1,3}\d*\b/, 'a cell name or a column letter'],
  [/\b[A-Z]{1,3}[1-9]\d{0,6}\b/, 'a cell name'],
  [/\bR[0-9A-Z]{9,}\b/, 'a review code'],
  [/\bB0[0-9A-Z]{8}\b/, 'a product code'],
  [/\b(?:c\d{14}[0-9a-f]{6}|r[0-9a-f]{12})\b/, 'a code of the dashboard'],
  [/https?:\/\//i, 'a web address'],
  [/\bHTTP\b|\banswered \d{3}\b/i, 'a status code'],
  [/tesseract|\bapi key\b|settings\.json|fingerprint|\bASIN\b|\bOCR\b|captcha/i, 'a technical word'],
  [/[—–]/, 'a long dash'],
  [/--/, 'a double dash'],
  [/\b(?:ends|ending) \d{5}\b/, 'an order ID cut short'],
];

/** What in these words breaks the rule: [{ rule, found }], empty when nothing does. */
export function plainWordProblems(text) {
  const t = String(text ?? '');
  const out = [];
  for (const [re, rule] of RULES) {
    const m = t.match(re);
    if (m) out.push({ rule, found: m[0] });
  }
  return out;
}

/** Fails with every broken rule, and the words it was found in. */
export function assertPlain(assert, texts, where) {
  const bad = [];
  for (const text of new Set(texts)) for (const p of plainWordProblems(text)) bad.push(`${p.rule} ("${p.found}") in: ${String(text).slice(0, 200)}`);
  assert.deepEqual(bad, [], `${where}:\n${bad.join('\n')}`);
}
