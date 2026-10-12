// A picture's type by its first bytes, never by its name, and the largest
// picture the dashboard takes. Copied from the Amazon reader
// (amazon/image-type.js).

export const MAX_PICTURE_BYTES = 10 * 1024 * 1024;
export const PICTURE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** 'image/png', 'image/jpeg' or 'image/webp' by the picture's first bytes; null for anything else. */
export function imageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
