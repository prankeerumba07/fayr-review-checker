// Made-up files for the Flipkart screenshot tests, made on the spot: a PDF
// with a coloured box on each page (to be drawn into one picture), and a large
// picture of made-up dots (to be made smaller). Nothing in them comes from a
// real screenshot.

import { crc32, deflateSync } from 'node:zlib';

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** A made-up picture of coloured dots, width by height, as a PNG file: large, since dots do not pack down. */
export function dotsPng(width = 640, height = 480, seed = 7) {
  let x = seed;
  const next = () => (x = (Math.imul(x, 1103515245) + 12345) >>> 0) >>> 24;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(1 + width * 3);
    for (let i = 1; i < line.length; i++) line[i] = next();
    rows.push(line);
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8; // 8 bits for each colour
  head[9] = 2; // red, green and blue
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', head), pngChunk('IDAT', deflateSync(Buffer.concat(rows))), pngChunk('IEND', Buffer.alloc(0))]);
}

/** A made-up PDF of `pages` pages, each 200 by 100 points with one coloured box on it. */
export function madeUpPdf(pages = 2) {
  const objects = [
    [1, '<< /Type /Catalog /Pages 2 0 R >>'],
    [2, `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages} >>`],
  ];
  for (let i = 0; i < pages; i++) {
    const draw = `0.${(i % 8) + 1} 0.4 0.8 rg 20 20 ${160 - (i % 6) * 20} 60 re f`;
    objects.push([3 + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents ${4 + i * 2} 0 R >>`]);
    objects.push([4 + i * 2, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`]);
  }
  let out = '%PDF-1.4\n';
  const at = [];
  for (const [n, body] of objects) {
    at[n] = out.length;
    out += `${n} 0 obj\n${body}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= objects.length; n++) out += `${String(at[n]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
