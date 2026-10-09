// Reading a review screenshot on this computer: Tesseract for the words
// (English and Hindi), the pixels for the stars. No API key, nothing sent
// anywhere.

import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeText, overlapScore, reviewedOn, dayFrom, wordsOf, closeWords, starsLine, cleanName } from './text.js';

export const TESSERACT = process.env.TESSERACT_BIN || 'tesseract';
/** The Mac's own picture tool, used to rewrite a picture Tesseract cannot open and to enlarge a small one. */
export const SIPS = process.env.SIPS_BIN || 'sips';

/** Below this mean word confidence, or with fewer words than this, the screenshot is not clear. */
export const MIN_CONFIDENCE = 60;
export const MIN_WORDS = 3;

function run(cmd, args, { timeoutMs = 90_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => err.push(c));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out).toString('utf8'));
      else reject(new Error(`exit ${code}: ${Buffer.concat(err).toString('utf8').slice(0, 300)}`));
    });
  });
}

let langsCache = null;

/** The languages Tesseract has here. */
export async function tesseractLanguages() {
  if (!langsCache) {
    langsCache = run(TESSERACT, ['--list-langs'], { timeoutMs: 15_000 })
      .then((t) => new Set(t.split('\n').slice(1).map((s) => s.trim()).filter(Boolean)))
      .catch(() => new Set());
  }
  return langsCache;
}

/** Tesseract's TSV as words and lines, in reading order. */
export function parseTsv(tsv) {
  const rows = String(tsv ?? '').split('\n');
  const words = [];
  const lines = new Map();
  for (const row of rows.slice(1)) {
    const c = row.split('\t');
    if (c.length < 12 || c[0] !== '5') continue;
    const text = c.slice(11).join('\t').trim();
    if (!text) continue;
    const w = {
      text,
      conf: Number(c[10]),
      left: Number(c[6]),
      top: Number(c[7]),
      width: Number(c[8]),
      height: Number(c[9]),
      key: `${c[2]}.${c[3]}.${c[4]}`,
    };
    words.push(w);
    if (!lines.has(w.key)) lines.set(w.key, []);
    lines.get(w.key).push(w);
  }
  const out = [...lines.values()].map((ws) => ({
    text: ws.map((w) => w.text).join(' '),
    left: Math.min(...ws.map((w) => w.left)),
    top: Math.min(...ws.map((w) => w.top)),
    right: Math.max(...ws.map((w) => w.left + w.width)),
    bottom: Math.max(...ws.map((w) => w.top + w.height)),
    conf: ws.reduce((a, w) => a + w.conf, 0) / ws.length,
  }));
  return { words, lines: out };
}

// Lines that end a review's words: Amazon's own buttons and labels under a review, the next review, or the screen's bottom bar. Never part of the review.
const STOP = /(people|person) found this helpful|^\W*helpful\b|^\W*report\b|^read (more|less)$|^\W*read less\b|^see (all|more) reviews|^product details$|^translate review|thank you for your review|^\W*edit\b.*\bdelete\b|^\W*(edit|delete)\W*$|^\W*top of page\b|^\W*home\b.*\bcart\b|see your full review|^keep it up/i;
const ABOUT_THE_THING_BOUGHT = /^(colour|color|size|style|set name|scent name|pattern|capacity|configuration|material|flavour|flavor)\s*:/i;
const CUT_SHORT = /\s*(?:\.{3}|…)?\s*\b(see|read) more\W*$/i;
/** A product's name cut short on screen ("Test Brand Garment Rack w..."), or "by <brand>": a line of the page beside the review, never its name. */
const BESIDE = /(\.\.\.|…)\s*$|^\W*by\s+[\p{L}\s]+$/iu;

/** A line of the product's ratings beside a review on a computer's page ("354 global ratings", "5 star 72%", "4.1 out of 5"): never the review's words. */
const RATINGS_PANEL = /\bglobal ratings?\b|\b\d\s*(?:star|scar|sta)\b.*\d\s*%|^\W*\S{0,6}\s*\d{1,3}\s*%\W*$|\bout of 5\b/i;

/** A line of a photo in the review (its packaging: "MADE FOR MEN", "BRIGHTENING"): a few words, nearly all in capitals. */
export function photoLine(t) {
  const letters = String(t).match(/\p{L}/gu) ?? [];
  if (letters.length < 3) return false;
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  // Words of letters only: a stray mark or digit read beside them ("१ GENTLE ON SENSITIVE SKIN") is not a word.
  return wordsOf(t).filter((w) => /\p{L}/u.test(w)).length <= 4 && upper / letters.length >= 0.8;
}

/** A line read from the stars or the small pictures only: fewer than three letters, one or two letters over and over, or a few words of three letters or fewer. */
function noiseLine(t) {
  const letters = String(t ?? '').match(/\p{L}/gu) ?? [];
  if (letters.length < 3) return true;
  if (new Set(letters.map((c) => c.toLowerCase())).size <= 2) return true;
  const words = String(t).split(/\s+/).filter((w) => /\p{L}/u.test(w));
  return words.length <= 3 && words.every((w) => (w.match(/\p{L}/gu) ?? []).length <= 3);
}

function bestLine(lines, wanted, from = 0, to = lines.length, min = 0.6) {
  if (!normalizeText(wanted)) return -1;
  let best = -1;
  let bestScore = min;
  for (let i = from; i < to; i++) {
    const s = overlapScore(wanted, lines[i].text);
    if (s !== null && s >= bestScore && (best < 0 || s > bestScore)) {
      best = i;
      bestScore = s;
    }
  }
  return best;
}

/** A title line read from the first word of the known title on, so the stars read as letters drop off. */
function fromWord(line, title) {
  const first = wordsOf(title)[0];
  if (!first) return line;
  const parts = String(line).split(/\s+/);
  const at = parts.findIndex((p) => {
    const w = wordsOf(p)[0];
    return w && closeWords(w, first);
  });
  return at > 0 ? parts.slice(at).join(' ') : line;
}

/**
 * Where the review's parts are among the lines read. The anchor is the
 * "Reviewed in … on …" line. With what Amazon showed (hints) the name, title
 * and product are found by their words; without it, by their places around
 * the anchor, as Amazon lays a review out: the name, then (in the Amazon app)
 * a line of stars with "Verified Purchase", then the title, on one line or
 * wrapped over two, then the date line, the "Size: …" line, and the words.
 * Lines of the page beside the review (a product name cut short, "by
 * <brand>") are never its name; its buttons ("Helpful", "Edit", "Delete",
 * "Thank you for your review.") and the next review are never its words.
 */
export function segment(lines, hints = {}) {
  const at = lines.findIndex((l) => reviewedOn(l.text));
  const found = { name: null, title: null, titleLine: null, dateText: null, day: null, body: null, product: null, verified: false };
  if (at >= 0) {
    found.dateText = lines[at].text;
    found.day = dayFrom(reviewedOn(lines[at].text).dateText);
  }
  const text = (i) => String(lines[i]?.text ?? '').trim();
  const lo = at >= 0 ? Math.max(0, at - 4) : 0;
  const hi = at >= 0 ? at : lines.length;
  let titleAt = hints.title ? bestLine(lines, hints.title, lo, hi) : -1;
  if (titleAt < 0 && at > 0) titleAt = at - 1;
  // A title wrapped over two lines: the line above or below it is part of it when both lines together read as the title known; without the title known, the line above is when the stars line sits above that line.
  let titleTop = titleAt;
  let titleEnd = titleAt;
  if (titleAt >= 0) {
    const above = titleAt - 1;
    const below = titleAt + 1;
    if (hints.title) {
      const alone = overlapScore(hints.title, text(titleAt)) ?? 0;
      const withAbove = above >= 0 && !starsLine(text(above)) ? overlapScore(hints.title, `${text(above)} ${text(titleAt)}`) ?? 0 : 0;
      const withBelow = below < hi && !reviewedOn(text(below)) ? overlapScore(hints.title, `${text(titleAt)} ${text(below)}`) ?? 0 : 0;
      if (withAbove > alone && withAbove >= 0.6 && withAbove >= withBelow) titleTop = above;
      else if (withBelow > alone && withBelow >= 0.6) titleEnd = below;
    } else if (above > 0 && !starsLine(text(above)) && starsLine(text(above - 1))) titleTop = above;
  }
  if (titleAt >= 0) {
    found.titleLine = lines[titleAt];
    found.title = fromWord(lines.slice(titleTop, titleEnd + 1).map((l) => String(l.text ?? '').trim()).join(' '), hints.title);
  }
  const top = titleTop >= 0 ? titleTop : at;
  let nameAt = hints.name ? bestLine(lines, hints.name, Math.max(0, top - 4), top >= 0 ? top : lines.length, 0.5) : -1;
  if (nameAt < 0 && top > 0) {
    // Up from the title: over the stars line and over lines of the page beside the review.
    let i = top - 1;
    for (let n = 0; i >= 0 && n < 4 && (starsLine(text(i)) || BESIDE.test(text(i)) || /^\W*verified purchase\W*$/i.test(text(i))); n++) i--;
    if (i >= 0 && !STOP.test(text(i)) && !/^customer reviews?$/i.test(text(i)) && !reviewedOn(text(i))) nameAt = i;
  }
  if (nameAt >= 0) found.name = cleanName(text(nameAt)) || text(nameAt);

  if (at >= 0) {
    const body = [];
    // On a computer's page the product's ratings sit beside the review and are read in between its lines; with nothing taken yet,
    // its words may come just under its buttons ("Helpful", "Report"), so a few lines more are looked at.
    let past = 0;
    for (let i = at + 1; i < lines.length; i++) {
      const t = text(i);
      if (STOP.test(t)) {
        if (body.length || past) break;
        past = i;
        continue;
      }
      if (past && i - past > 3) break;
      if (RATINGS_PANEL.test(t)) continue;
      // Under the buttons, only a sentence is taken (a line of four words or more), never a stray word of the page.
      if (past && wordsOf(t).length < 4) continue;
      if (/verified purchase/i.test(t)) {
        found.verified = true;
        if (ABOUT_THE_THING_BOUGHT.test(t) || /^\W*verified purchase\W*$/i.test(t) || t.includes('|')) continue;
      }
      if (ABOUT_THE_THING_BOUGHT.test(t) && body.length === 0) continue;
      if (noiseLine(t)) continue;
      body.push(t);
    }
    // A photo in the review shows its packaging's words in capitals; they are not the review, unless there is nothing else.
    const words = body.some((t) => !photoLine(t)) ? body.filter((t) => !photoLine(t)) : body;
    if (words.length) words[words.length - 1] = words[words.length - 1].replace(CUT_SHORT, '');
    if (words.filter(Boolean).length) found.body = words.filter(Boolean).join('\n');
  }
  // The product: by its words when Amazon's title is known; else the line
  // under "Product Details", or the title line above "Customer Review".
  let productAt = -1;
  if (hints.productTitle) productAt = bestLine(lines, hints.productTitle, 0, lines.length, 0.5);
  else {
    const details = lines.findIndex((l) => /^product details$/i.test(l.text.trim()));
    const head = lines.findIndex((l) => /^customer reviews?$/i.test(l.text.trim()));
    if (details >= 0) productAt = details + 1;
    else if (head > 0 && wordsOf(lines[head - 1].text).length >= 2) productAt = head - 1;
  }
  if (productAt >= 0 && productAt < lines.length && productAt !== titleAt && productAt !== nameAt) found.product = lines[productAt].text;
  return found;
}

/**
 * Every review on a screenshot that shows several (a product's list of
 * reviews), each by its own "Reviewed in … on …" line: segment()'s answer for
 * each, in order, with `own` true when Amazon marks it as the viewer's own
 * review ("Thank you for your review", or Edit and Delete under it). One
 * review, or none, gives one answer.
 */
export function segments(lines, hints = {}) {
  const at = lines.map((l, i) => (reviewedOn(l.text) ? i : -1)).filter((i) => i >= 0);
  if (at.length <= 1) return [{ ...segment(lines, hints), own: ownMark(lines, at[0] ?? -1, lines.length) }];
  return at.map((a, k) => {
    const from = Math.max(k > 0 ? at[k - 1] + 1 : 0, a - 4);
    const to = k + 1 < at.length ? Math.max(a + 1, at[k + 1] - 4) : lines.length;
    return { ...segment(lines.slice(from, to), hints), own: ownMark(lines, a, k + 1 < at.length ? at[k + 1] : lines.length) };
  });
}

/** Amazon's mark of the viewer's own review, between its date line and the next review: "Thank you for your review.", or Edit and Delete under it. */
function ownMark(lines, from, to) {
  if (from < 0) return false;
  return lines.slice(from, to).some((l) => /thank you for your review|^\W*edit\b.*\bdelete\b|^\W*(edit|delete)\W*$/i.test(l.text ?? ''));
}

/**
 * The stars beside the title: one row of orange stars level with the title
 * line, at its left. Anything less certain is skipped, never guessed.
 */
export function starsBesideTitle(groups, titleLine) {
  if (!titleLine) return { stars: null, how: 'Skipped: the title line was not found in the screenshot.' };
  const lineH = titleLine.bottom - titleLine.top;
  const mid = titleLine.left + (titleLine.right - titleLine.left) / 2;
  const level = (g) => {
    const overlap = Math.min(g.bottom, titleLine.bottom + lineH) - Math.max(g.top, titleLine.top - lineH);
    return overlap >= 0.5 * (g.bottom - g.top);
  };
  const near = (groups ?? []).filter((g) => level(g) && g.left < mid && g.right <= titleLine.left + 0.6 * (titleLine.right - titleLine.left) && titleLine.left - g.right <= 6 * g.size);
  if (near.length !== 1) {
    return { stars: null, how: near.length ? 'Skipped: more than one row of stars beside the title.' : 'Skipped: no orange stars beside the title.' };
  }
  const n = near[0].count;
  if (n < 1 || n > 5) return { stars: null, how: 'Skipped: the stars beside the title could not be counted.' };
  return { stars: n, how: 'Counted by colour beside the title.' };
}

/**
 * A copy of a picture that Tesseract can open, made with the Mac's own
 * picture tool: as a PNG, and `scale` times as wide when asked (a small or
 * cut-short picture reads better enlarged). -> { file, done() } (done removes
 * the copy). Throws when the copy could not be made.
 */
export async function rewritePicture(file, { scale = 1, sips = run } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'arc-picture-'));
  const out = join(dir, 'picture.png');
  const done = () => rm(dir, { recursive: true, force: true }).catch(() => {});
  try {
    const args = ['-s', 'format', 'png'];
    if (scale > 1) {
      const said = await sips(SIPS, ['-g', 'pixelWidth', file], { timeoutMs: 30_000 });
      const width = Number(String(said).match(/pixelWidth:\s*(\d+)/)?.[1]);
      if (Number.isFinite(width) && width > 0) args.push('--resampleWidth', String(Math.min(6000, Math.round(width * scale))));
    }
    await sips(SIPS, [...args, file, '--out', out], { timeoutMs: 60_000 });
  } catch (err) {
    await done();
    throw err;
  }
  return { file: out, done };
}

/**
 * Tesseract's reading of one picture, in English and Hindi when both are
 * installed: { lang, hindi, words, lines, confidence }. A picture Tesseract
 * cannot open (a JPEG cut short, a kind it does not read) is rewritten as a
 * PNG by the Mac's own picture tool and read again; with `scale`, the picture
 * is read enlarged that many times. `psm` is Tesseract's way of finding the
 * lines: '3' for a page, '11' for words scattered over it (it finds a line
 * the first way may miss). With `prepare(file)` ({ file, done } or null), a
 * copy made easier to read is read instead (null: there is nothing to read,
 * and null is returned). Throws when the picture could not be read at all.
 */
export async function readLines(file, { tesseract = run, sips = run, scale = 1, psm = '3', prepare = null } = {}) {
  const langs = await tesseractLanguages();
  const use = ['eng', 'hin'].filter((l) => langs.has(l));
  const lang = use.length ? use.join('+') : 'eng';
  const read = async (f) => {
    const tsv = await tesseract(TESSERACT, [f, 'stdout', '-l', lang, '--psm', String(psm), 'tsv']);
    const { words, lines } = parseTsv(tsv);
    const scored = words.filter((w) => w.conf >= 0);
    const confidence = scored.length ? Math.round(scored.reduce((a, w) => a + w.conf, 0) / scored.length) : 0;
    return { lang, hindi: langs.has('hin'), words, lines, confidence };
  };
  if (prepare) {
    const copy = await prepare(file);
    if (!copy) return null;
    try {
      return { ...(await read(copy.file)), prepared: true };
    } finally {
      await copy.done();
    }
  }
  if (scale > 1) {
    const copy = await rewritePicture(file, { scale, sips });
    try {
      return { ...(await read(copy.file)), scale };
    } finally {
      await copy.done();
    }
  }
  try {
    return await read(file);
  } catch (err) {
    let copy;
    try {
      copy = await rewritePicture(file, { sips });
    } catch {
      throw err;
    }
    try {
      return { ...(await read(copy.file)), rewritten: true };
    } finally {
      await copy.done();
    }
  }
}

/**
 * Read one review screenshot. `analyse(file)` gives the fingerprint and star
 * rows (see image-read.js); `hints` is what Amazon showed, when it was read.
 */
export async function readScreenshot(file, { analyse, hints = {}, tesseract = run } = {}) {
  const langs = await tesseractLanguages();
  const use = ['eng', 'hin'].filter((l) => langs.has(l));
  const lang = use.length ? use.join('+') : 'eng';
  const out = { ok: false, problem: null, lang, hindi: langs.has('hin'), text: '', lines: [], confidence: null, wordCount: 0 };
  try {
    const read = await readLines(file, { tesseract });
    const { lines } = read;
    out.lines = lines.map((l) => l.text);
    out.text = out.lines.join('\n');
    out.confidence = read.confidence;
    Object.assign(out, segment(lines, hints));
    out.wordCount = wordsOf(out.body ?? out.text).length;
    const pixels = analyse ? await analyse(file).catch(() => null) : null;
    out.fingerprint = pixels?.fingerprint ?? null;
    const stars = pixels ? starsBesideTitle(pixels.starGroups, out.titleLine) : { stars: null, how: 'Skipped: the image could not be looked at.' };
    out.stars = stars.stars;
    out.starsHow = stars.how;
    delete out.titleLine;
    out.ok = out.confidence >= MIN_CONFIDENCE && out.wordCount >= MIN_WORDS;
    if (!out.ok) out.problem = 'Screenshot is not clear.';
  } catch {
    out.problem = 'Screenshot is not clear: it could not be read on this computer.';
  }
  return out;
}

export async function fileAsDataUrl(file, mime) {
  return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
}
