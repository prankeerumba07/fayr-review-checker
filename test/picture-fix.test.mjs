// Making a downloaded file into a picture on this computer: a PDF's pages
// drawn into one picture (and read by Tesseract), a picture too large to
// keep made smaller, and plain words when neither can be done. Made-up
// files only, with the Mac's own tools.
// Run: node test/picture-fix.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPdf, pdfToPicture, shrinkPicture, preparePicture, PDF_PAGE_WIDTH } from '../amazon/picture-fix.js';
import { imageType } from '../amazon/image-type.js';
import { readOrderShot, readDeliveryShot } from '../amazon/shot-read.js';
import { ORDER_ID } from './fixtures/amazon/make-order-screenshots.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'amazon');
const PDF = readFileSync(join(FIX, 'order-two-pages.pdf'));
const PNG = readFileSync(join(FIX, 'screenshot-review.png'));

test("a PDF's pages are drawn into one tall picture on this computer, and read like any screenshot", { timeout: 180_000 }, async () => {
  assert.equal(isPdf(PDF), true);
  assert.equal(isPdf(PNG), false);
  const out = await pdfToPicture(PDF);
  assert.equal(out.ok, true, out.says);
  assert.deepEqual([out.type, out.pages, out.pageCount, imageType(out.data)], ['image/png', 2, 2, 'image/png']);
  const dir = mkdtempSync(join(tmpdir(), 'arc-test-pdf-'));
  try {
    const file = join(dir, 'pages.png');
    writeFileSync(file, out.data);
    const order = await readOrderShot([file]);
    assert.equal(order.ok, true, order.problem);
    assert.deepEqual(order.orderIds, [ORDER_ID], 'the first page: the order ID');
    assert.ok(order.amounts.some((a) => a.value === 654), 'and the amount');
    const delivery = await readDeliveryShot([file]);
    assert.equal(delivery.delivered, true, 'the second page: Delivered');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // At most the number of pages asked for.
  const one = await pdfToPicture(PDF, { maxPages: 1 });
  assert.deepEqual([one.pages, one.pageCount], [1, 2]);
  assert.ok(one.data.length < out.data.length);
  // Not a PDF, or a PDF the Mac's own tools cannot draw: said plainly, never a crash.
  assert.deepEqual(await pdfToPicture(PNG), { ok: false, says: 'the file is not a PDF' });
  const broken = await pdfToPicture(Buffer.from('%PDF-1.7 not really a document'));
  assert.equal(broken.ok, false);
  assert.match(broken.says, /^the file is a PDF (with no page that could be drawn|whose pages could not be turned into a picture on this computer)$/);
  const failing = await pdfToPicture(PDF, { osascript: async () => { throw new Error('no such tool'); } });
  assert.deepEqual(failing, { ok: false, says: 'the file is a PDF whose pages could not be turned into a picture on this computer' });
});

test('a picture too large to keep is made smaller on this computer: narrower, as a JPEG, until it fits; one that fits stays as it is', { timeout: 180_000 }, async () => {
  const same = await shrinkPicture(PNG, { maxBytes: PNG.length });
  assert.deepEqual([same.ok, same.type, same.data.equals(PNG)], [true, 'image/png', true]);
  const pages = await pdfToPicture(PDF);
  const small = await shrinkPicture(pages.data, { maxBytes: 150_000 });
  assert.equal(small.ok, true, small.says);
  assert.deepEqual([small.type, imageType(small.data)], ['image/jpeg', 'image/jpeg']);
  assert.ok(small.data.length <= 150_000, `${small.data.length} bytes`);
  assert.ok(small.width <= PDF_PAGE_WIDTH);
  const never = await shrinkPicture(pages.data, { maxBytes: 100 });
  assert.deepEqual(never, { ok: false, says: 'the picture is too large, and could not be made small enough on this computer' });
  assert.deepEqual(await shrinkPicture(Buffer.from('GIF89a-not-a-picture'), { maxBytes: 1 }), { ok: false, says: 'the file is not a picture the dashboard can read' });
  const failing = await shrinkPicture(Buffer.concat([PNG, Buffer.alloc(10)]), { maxBytes: PNG.length, sips: async () => { throw new Error('no such tool'); } });
  assert.deepEqual(failing, { ok: false, says: 'the picture is too large, and could not be made smaller on this computer' });
});

test("a download made ready to keep: a PDF becomes a picture, a large picture is made smaller, anything else stays; a file that cannot be made into a picture fails with kind 'file' and a plain reason", { timeout: 180_000 }, async () => {
  const pdf = await preparePicture({ ok: true, data: PDF, type: 'application/pdf', site: 'Google Drive' });
  assert.deepEqual([pdf.ok, pdf.type, pdf.pages, imageType(pdf.data)], [true, 'image/png', 2, 'image/png']);
  const big = await preparePicture({ ok: true, data: pdf.data, type: 'image/png', site: 'Google Drive' }, { maxBytes: 150_000 });
  assert.deepEqual([big.ok, big.type, big.shrunk], [true, 'image/jpeg', true]);
  const same = await preparePicture({ ok: true, data: PNG, type: 'image/png', site: 'tryboxs.in' });
  assert.deepEqual([same.ok, same.data.equals(PNG), same.shrunk], [true, true, undefined]);
  const failed = await preparePicture({ ok: false, kind: 'drive', site: 'Google Drive', says: 'no' });
  assert.deepEqual(failed, { ok: false, kind: 'drive', site: 'Google Drive', says: 'no' }, 'a download that failed is left as it is');
  const cannot = await preparePicture({ ok: true, data: Buffer.from('%PDF-1.7 not really a document'), type: 'application/pdf', site: 'Google Drive' });
  assert.equal(cannot.ok, false);
  assert.equal(cannot.kind, 'file');
  assert.match(cannot.says, /^the file is a PDF/);
});
