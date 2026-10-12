// Making a downloaded file into a picture the dashboard can read, on this
// computer, with the Mac's own tools and nothing new to install. Copied from
// the Amazon checker (amazon/picture-fix.js) for the Flipkart checker: a PDF's
// pages are drawn into one tall picture (osascript, the Mac's own script
// runner, with its PDF and picture frameworks), and a picture too large to
// keep is made smaller (sips, the Mac's own picture tool). Nothing is sent
// anywhere. Nothing here throws: a file that cannot be made into a picture
// says so plainly.

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageType, MAX_PICTURE_BYTES, PICTURE_EXT } from './image-type.js';

export const OSASCRIPT = process.env.OSASCRIPT_BIN || 'osascript';
export const SIPS = process.env.SIPS_BIN || 'sips';
/** How wide a PDF's pages are drawn, in pixels, and how many pages at most. */
export const PDF_PAGE_WIDTH = 1600;
export const PDF_MAX_PAGES = 6;
/** The widths a too-large picture is tried at, with the JPEG quality for each, until it fits. */
const SHRINK_STEPS = [
  [2400, 85],
  [1600, 75],
  [1200, 60],
  [900, 50],
  [600, 40],
];

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

/** A PDF, by its first bytes. */
export function isPdf(buf) {
  return Boolean(buf) && buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

// The script run by the Mac's own script runner: every page of the PDF (up to the number given), drawn one under another into one picture of the width given, saved as a PNG.
const PAGES_SCRIPT = String.raw`
ObjC['import']('Foundation');
ObjC['import']('AppKit');
ObjC['import']('Quartz');
function run(argv) {
  const file = argv[0];
  const out = argv[1];
  const width = Number(argv[2]) || 1600;
  const maxPages = Number(argv[3]) || 6;
  const doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(file));
  if (doc.isNil()) return 'NOT_PDF';
  const count = doc.pageCount;
  const pages = [];
  let total = 0;
  for (let i = 0; i < Math.min(count, maxPages); i++) {
    const page = doc.pageAtIndex(i);
    const box = page.boundsForBox($.kPDFDisplayBoxMediaBox);
    if (!(box.size.width > 0) || !(box.size.height > 0)) continue;
    const scale = width / box.size.width;
    const height = Math.round(box.size.height * scale);
    if (total + height > 24000) break;
    pages.push({ page: page, scale: scale, height: height, x: box.origin.x, y: box.origin.y });
    total += height;
  }
  if (!pages.length) return 'NO_PAGES';
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(null, width, total, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
  const ctx = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext(ctx);
  $.NSColor.whiteColor.setFill;
  $.NSRectFill($.NSMakeRect(0, 0, width, total));
  const cg = ctx.CGContext;
  let y = total;
  for (const p of pages) {
    y -= p.height;
    $.CGContextSaveGState(cg);
    $.CGContextTranslateCTM(cg, 0, y);
    $.CGContextScaleCTM(cg, p.scale, p.scale);
    $.CGContextTranslateCTM(cg, -p.x, -p.y);
    p.page.drawWithBoxToContext($.kPDFDisplayBoxMediaBox, cg);
    $.CGContextRestoreGState(cg);
  }
  $.NSGraphicsContext.restoreGraphicsState;
  const png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary);
  if (!png.writeToFileAtomically(out, true)) return 'WRITE_FAILED';
  return 'OK ' + pages.length + ' ' + count;
}
`;

/**
 * A PDF's pages as one tall PNG picture: { ok, data, type: 'image/png',
 * pages, pageCount } or { ok: false, says }. At most `maxPages` pages, each
 * `width` pixels wide. `osascript(cmd, args, opts)` runs the Mac's own script
 * runner (a test may give its own).
 */
export async function pdfToPicture(buf, { osascript = run, width = PDF_PAGE_WIDTH, maxPages = PDF_MAX_PAGES } = {}) {
  if (!isPdf(buf)) return { ok: false, says: 'the file is not a PDF' };
  const dir = await mkdtemp(join(tmpdir(), 'arc-flipkart-pdf-'));
  const file = join(dir, 'file.pdf');
  const script = join(dir, 'pages.js');
  const out = join(dir, 'pages.png');
  try {
    await writeFile(file, buf, { mode: 0o600 });
    await writeFile(script, PAGES_SCRIPT, { mode: 0o600 });
    const said = String(await osascript(OSASCRIPT, ['-l', 'JavaScript', script, file, out, String(width), String(maxPages)], { timeoutMs: 120_000 })).trim();
    const m = said.match(/^OK (\d+) (\d+)/);
    if (!m) return { ok: false, says: said === 'NOT_PDF' || said === 'NO_PAGES' ? 'the file is a PDF with no page that could be drawn' : "the file is a PDF whose pages could not be turned into a picture on this computer" };
    const data = await readFile(out);
    if (imageType(data) !== 'image/png') return { ok: false, says: "the file is a PDF whose pages could not be turned into a picture on this computer" };
    return { ok: true, data, type: 'image/png', pages: Number(m[1]), pageCount: Number(m[2]) };
  } catch {
    return { ok: false, says: "the file is a PDF whose pages could not be turned into a picture on this computer" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * A picture larger than `maxBytes`, made smaller with the Mac's own picture
 * tool: narrower and as a JPEG, step by step, until it fits. -> { ok, data,
 * type: 'image/jpeg', width } or { ok: false, says }. A picture that already
 * fits comes back as it is. `sips(cmd, args, opts)` may be a test's own.
 */
export async function shrinkPicture(buf, { sips = run, maxBytes = MAX_PICTURE_BYTES } = {}) {
  const type = imageType(buf);
  if (!type) return { ok: false, says: 'the file is not a picture the dashboard can read' };
  if (buf.length <= maxBytes) return { ok: true, data: buf, type, width: null };
  const dir = await mkdtemp(join(tmpdir(), 'arc-flipkart-shrink-'));
  const file = join(dir, `picture.${PICTURE_EXT[type]}`);
  try {
    await writeFile(file, buf, { mode: 0o600 });
    const said = await sips(SIPS, ['-g', 'pixelWidth', file], { timeoutMs: 30_000 });
    const width = Number(String(said).match(/pixelWidth:\s*(\d+)/)?.[1]);
    for (const [to, quality] of SHRINK_STEPS) {
      const out = join(dir, `small-${to}.jpg`);
      const args = ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality)];
      if (!Number.isFinite(width) || width > to) args.push('--resampleWidth', String(to));
      await sips(SIPS, [...args, file, '--out', out], { timeoutMs: 120_000 });
      const data = await readFile(out);
      if (imageType(data) === 'image/jpeg' && data.length <= maxBytes) return { ok: true, data, type: 'image/jpeg', width: Number.isFinite(width) ? Math.min(width, to) : to };
    }
    return { ok: false, says: 'the picture is too large, and could not be made small enough on this computer' };
  } catch {
    return { ok: false, says: 'the picture is too large, and could not be made smaller on this computer' };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * A download's answer made ready to keep: a PDF's pages become one picture,
 * and a picture too large to keep is made smaller. Anything else comes back
 * as it is. A file that could not be made into a picture fails with kind
 * 'file' and a plain reason (never about access).
 */
export async function preparePicture(out, { osascript = run, sips = run, maxBytes = MAX_PICTURE_BYTES } = {}) {
  if (!out?.ok) return out;
  let { data, type } = out;
  const extra = {};
  if (type === 'application/pdf' || isPdf(data)) {
    const p = await pdfToPicture(data, { osascript });
    if (!p.ok) return { ok: false, kind: 'file', site: out.site ?? null, says: p.says };
    data = p.data;
    type = p.type;
    extra.pages = p.pages;
  }
  if (data.length > maxBytes) {
    const s = await shrinkPicture(data, { sips, maxBytes });
    if (!s.ok) return { ok: false, kind: 'file', site: out.site ?? null, says: s.says };
    data = s.data;
    type = s.type;
    extra.shrunk = true;
  }
  return { ...out, data, type, ...extra };
}
