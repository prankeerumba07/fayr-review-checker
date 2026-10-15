// A screenshot's fingerprint, to find the same screenshot given twice, even
// when it was saved again as another file (made smaller, or as another kind of
// picture): the Amazon checker's difference hash of the grey picture with its
// margins trimmed (amazon/image-read.js analyseImage), copied for Flipkart.
// The Amazon checker works it out in a hidden Chrome page; here it is worked
// out on this computer from a plain copy of the picture that the Mac's own
// picture tool (sips) makes, so nothing new is installed and no browser is
// started. Nothing is sent anywhere, and nothing here throws: a picture that
// cannot be looked at gets no fingerprint, and is then compared by its file
// alone.

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SIPS = process.env.SIPS_BIN || 'sips';
/** The fingerprint's grid: GRID rows of GRID + 1 cells, compared side by side. Copied from amazon/image-read.js. */
export const GRID = 48;
/** Two fingerprints this close (the share of their bits that differ) are the same screenshot. Copied from amazon/image-read.js. */
export const SAME_SCREENSHOT = 0.08;

/** The share of two fingerprints' bits that differ, from 0 (the same) to 1; null when they cannot be compared. Copied from amazon/image-read.js. */
export function fingerprintDistance(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      diff += x & 1;
      x >>= 1;
    }
  }
  return diff / (a.length * 4);
}

/**
 * A BMP file's pixels as grey levels (0 to 255), row by row from the top:
 * { width, height, grey }, or null when it is not a BMP this can read (24 or
 * 32 bits for each pixel, not packed).
 */
export function bmpGrey(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 54 || buf.toString('latin1', 0, 2) !== 'BM') return null;
  const start = buf.readUInt32LE(10);
  const head = buf.readUInt32LE(14);
  const width = buf.readInt32LE(18);
  const tall = buf.readInt32LE(22);
  const bits = buf.readUInt16LE(28);
  const packing = buf.readUInt32LE(30);
  const height = Math.abs(tall);
  if (width <= 0 || height <= 0 || width * height > 50_000_000 || (bits !== 24 && bits !== 32) || (packing !== 0 && packing !== 3)) return null;
  // Where red, green and blue are in a pixel: blue, green, red unless the file's own masks say otherwise.
  let at = { r: 2, g: 1, b: 0 };
  if (packing === 3 && bits === 32) {
    const masks = head >= 52 ? 54 : 14 + head;
    if (buf.length < masks + 12) return null;
    const byteOf = (m) => [0xff, 0xff00, 0xff0000, 0xff000000].indexOf(m >>> 0);
    at = { r: byteOf(buf.readUInt32LE(masks)), g: byteOf(buf.readUInt32LE(masks + 4)), b: byteOf(buf.readUInt32LE(masks + 8)) };
    if (at.r < 0 || at.g < 0 || at.b < 0) return null;
  }
  const size = bits / 8;
  const line = Math.ceil((width * size) / 4) * 4;
  if (buf.length < start + line * height) return null;
  const grey = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    // Rows are kept from the bottom up, unless the height is written as below zero.
    const from = start + (tall > 0 ? height - 1 - y : y) * line;
    for (let x = 0; x < width; x++) {
      const k = from + x * size;
      grey[y * width + x] = 0.299 * buf[k + at.r] + 0.587 * buf[k + at.g] + 0.114 * buf[k + at.b];
    }
  }
  return { width, height, grey };
}

/**
 * The fingerprint of a picture's grey levels, as the Amazon checker makes it
 * (amazon/image-read.js analyseImage): the margins of near white (235 and
 * lighter) trimmed, the rest made into GRID rows of GRID + 1 cells, each the
 * average of the pixels under it, and a bit set only where one cell is
 * clearly darker than the next, so the flat white of a page does not flip with
 * the noise of saving it again. -> GRID * GRID / 4 hex digits.
 */
export function fingerprintOf({ width, height, grey }) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grey[y * width + x] < 235) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) [x0, y0, x1, y1] = [0, 0, width - 1, height - 1];
  const N = GRID;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  // Each cell: the average of the pixels it covers, parts of pixels counting for their part.
  const cells = new Float64Array((N + 1) * N);
  for (let cy = 0; cy < N; cy++) {
    const top = y0 + (cy * h) / N;
    const bottom = y0 + ((cy + 1) * h) / N;
    for (let cx = 0; cx <= N; cx++) {
      const left = x0 + (cx * w) / (N + 1);
      const right = x0 + ((cx + 1) * w) / (N + 1);
      let sum = 0;
      let area = 0;
      for (let py = Math.floor(top); py < Math.ceil(bottom); py++) {
        const dy = Math.min(bottom, py + 1) - Math.max(top, py);
        if (dy <= 0) continue;
        for (let px = Math.floor(left); px < Math.ceil(right); px++) {
          const dx = Math.min(right, px + 1) - Math.max(left, px);
          if (dx <= 0) continue;
          sum += grey[py * width + px] * dx * dy;
          area += dx * dy;
        }
      }
      cells[cy * (N + 1) + cx] = area ? sum / area : 255;
    }
  }
  let hex = '';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x += 4) {
      let nib = 0;
      for (let b = 0; b < 4; b++) nib = (nib << 1) | (cells[y * (N + 1) + x + b] > cells[y * (N + 1) + x + b + 1] + 8 ? 1 : 0);
      hex += nib.toString(16);
    }
  }
  return hex;
}

function run(cmd, args, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch {
      return resolve(false);
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

/** A picture file's fingerprint (fingerprintOf), from a plain copy the Mac's picture tool makes in a folder of its own, removed after; null when it cannot be looked at. */
export async function fingerprintFile(file, { sips = SIPS } = {}) {
  let dir = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'arc-flipkart-print-'));
    const out = join(dir, 'picture.bmp');
    if (!(await run(sips, ['-s', 'format', 'bmp', file, '--out', out]))) return null;
    const pixels = bmpGrey(await readFile(out));
    return pixels ? fingerprintOf(pixels) : null;
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
