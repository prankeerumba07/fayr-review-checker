// Reading a picture's words on this computer with Tesseract (English and
// Hindi), copied from the Amazon checker (amazon/ocr.js): only what reading a
// purchase screenshot needs. No API key, nothing sent anywhere.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const TESSERACT = process.env.TESSERACT_BIN || 'tesseract';
/** The Mac's own picture tool, used to rewrite a picture Tesseract cannot open and to enlarge a small one. */
export const SIPS = process.env.SIPS_BIN || 'sips';

/** Below this mean word confidence, or with fewer words than this, the screenshot is not clear. */
export const MIN_CONFIDENCE = 60;
export const MIN_WORDS = 3;

/**
 * Tesseract's other way of telling letters from the background: part by part
 * (Sauvola), instead of one level for the whole picture. It keeps small,
 * light grey letters, such as the "Order #OD…" Flipkart writes under the
 * product's name, which the usual way drops when the rest of the screen is
 * dark or busy (black words, coloured adverts).
 */
export const LIGHT_LETTERS = ['-c', 'thresholding_method=2'];

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

/**
 * A picture's colours, read on this computer: the Mac's own picture tool
 * writes a plain BMP copy of it, read here and removed. -> { width, height,
 * rgb(x, y) -> [red, green, blue] }. Throws when no copy could be made.
 */
export async function picturePixels(file, { sips = run } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'arc-flipkart-pixels-'));
  try {
    const out = join(dir, 'picture.bmp');
    await sips(SIPS, ['-s', 'format', 'bmp', file, '--out', out], { timeoutMs: 60_000 });
    return bmpPixels(await readFile(out));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** The colours of a BMP picture of 24 or 32 bits a pixel, not compressed, as the Mac's picture tool writes it: { width, height, rgb(x, y) }. Throws for any other picture. */
export function bmpPixels(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 54 || buf.toString('latin1', 0, 2) !== 'BM') throw new Error('Not a BMP picture.');
  const offset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const rows = buf.readInt32LE(22);
  const bits = buf.readUInt16LE(28);
  const packed = buf.readUInt32LE(30);
  if (width <= 0 || rows === 0 || (bits !== 24 && bits !== 32) || (packed !== 0 && packed !== 3)) throw new Error('A kind of BMP picture this does not read.');
  const height = Math.abs(rows);
  const size = bits / 8;
  const stride = Math.ceil((width * size) / 4) * 4;
  if (offset + stride * height > buf.length) throw new Error('The BMP picture is cut short.');
  return {
    width,
    height,
    rgb(x, y) {
      const col = Math.min(width - 1, Math.max(0, Math.round(x)));
      const line = Math.min(height - 1, Math.max(0, Math.round(y)));
      // Rows are kept from the bottom up unless the height is given below zero.
      const i = offset + (rows > 0 ? height - 1 - line : line) * stride + col * size;
      return [buf[i + 2], buf[i + 1], buf[i]];
    },
  };
}

/**
 * A copy of a picture that Tesseract can open, made with the Mac's own
 * picture tool: as a PNG, and `scale` times as wide when asked (a small or
 * cut-short picture reads better enlarged). -> { file, done() } (done removes
 * the copy). Throws when the copy could not be made.
 */
export async function rewritePicture(file, { scale = 1, sips = run } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'arc-flipkart-picture-'));
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
 * the first way may miss). With `light`, letters are told from the
 * background part by part (LIGHT_LETTERS), which keeps small light grey
 * ones. Throws when the picture could not be read at all.
 */
export async function readLines(file, { tesseract = run, sips = run, scale = 1, psm = '3', light = false } = {}) {
  const langs = await tesseractLanguages();
  const use = ['eng', 'hin'].filter((l) => langs.has(l));
  const lang = use.length ? use.join('+') : 'eng';
  const read = async (f) => {
    const tsv = await tesseract(TESSERACT, [f, 'stdout', '-l', lang, '--psm', String(psm), ...(light ? LIGHT_LETTERS : []), 'tsv']);
    const { words, lines } = parseTsv(tsv);
    const scored = words.filter((w) => w.conf >= 0);
    const confidence = scored.length ? Math.round(scored.reduce((a, w) => a + w.conf, 0) / scored.length) : 0;
    return { lang, hindi: langs.has('hin'), words, lines, confidence };
  };
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
