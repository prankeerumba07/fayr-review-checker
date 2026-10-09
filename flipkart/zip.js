// Reading a zip file, such as an .xlsx (an Excel file is a zip of XML files
// and pictures). Copied from the Amazon reader (amazon/zip.js), reading only.
// Built on Node's own zlib; limited, so a hostile file cannot fill this
// computer's memory.

import { inflateRawSync } from 'node:zlib';

export const MAX_ENTRIES = 5000;
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024;

const NOT_A_ZIP = 'The file could not be opened as an Excel file, so open it in Excel, save it as an Excel Workbook (.xlsx), then upload it again.';

/** Where the zip's table of contents ends, searching back from the end of the file. */
function endOfDirectory(buf) {
  const lowest = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/**
 * The entries of a zip: a Map from each entry's name to a function that
 * returns its bytes (read only when asked for). Throws an Error with a plain
 * sentence when the file is not a zip, is encrypted, or is too large.
 */
export function readZip(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) throw new Error(NOT_A_ZIP);
  const end = endOfDirectory(buf);
  if (end < 0) throw new Error(NOT_A_ZIP);
  const count = buf.readUInt16LE(end + 10);
  const dirSize = buf.readUInt32LE(end + 12);
  const dirStart = buf.readUInt32LE(end + 16);
  if (count === 0xffff || dirStart === 0xffffffff) throw new Error('The Excel file is too large to read here.');
  if (count > MAX_ENTRIES) throw new Error('The Excel file holds too many parts to read here.');
  if (dirStart + dirSize > buf.length) throw new Error(NOT_A_ZIP);

  const entries = new Map();
  let total = 0;
  let p = dirStart;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error(NOT_A_ZIP);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const packed = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (flags & 0x1) throw new Error('The Excel file is protected with a password, so open it in Excel, save a copy without the password, then upload that.');
    if (packed === 0xffffffff || size === 0xffffffff) throw new Error('The Excel file is too large to read here.');
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new Error('The Excel file is too large to read here.');
    if (method !== 0 && method !== 8) throw new Error('The Excel file uses a kind of packing that cannot be read here.');
    entries.set(name, () => {
      if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error(NOT_A_ZIP);
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + packed);
      if (data.length !== packed) throw new Error(NOT_A_ZIP);
      if (method === 0) return Buffer.from(data);
      const out = inflateRawSync(data, { maxOutputLength: Math.max(1, size) });
      if (out.length !== size) throw new Error(NOT_A_ZIP);
      return out;
    });
  }
  return entries;
}
