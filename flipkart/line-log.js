// A small log file in Flipkart's data folder: each line is written in the
// Terminal window as well, and kept with the date and time in India. The file
// keeps about its last half megabyte, and is readable only by this Mac
// account. Copied from the Amazon checker (amazon/line-log.js) for the
// Flipkart checker's Google login lines (data/flipkart/login-log.txt), as the
// Amazon checker keeps its own in data/login-log.txt. Never a password or a
// cookie.

import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const LOG_MAX = 512 * 1024;
/** The file in data/flipkart/ that keeps the Flipkart Google login's lines. */
export const LOGIN_LOG = 'login-log.txt';

/** "08-10-2026 15:06:04", in India time. */
export function stampIndia(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * -> write(line): writes the line in the Terminal window (log) and keeps it
 * in the file with the time; write.done() waits for the lines still being
 * kept; write.file is the file. A line that cannot be kept is still shown.
 */
export function createLineLog(file, { log = () => {}, now = () => new Date(), max = LOG_MAX } = {}) {
  let chain = Promise.resolve();
  const keep = async (text) => {
    // data/flipkart/ may not be there yet.
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await appendFile(file, text, { mode: 0o600 });
    if ((await stat(file)).size <= max) return;
    const all = await readFile(file, 'utf8');
    const tail = all.slice(-max / 2);
    await writeFile(file, tail.slice(tail.indexOf('\n') + 1), { mode: 0o600 });
  };
  const write = (line) => {
    log(line);
    const text = `${stampIndia(now())} ${String(line).replace(/\s+/g, ' ').trim()}\n`;
    chain = chain.then(() => keep(text)).catch(() => {});
    return chain;
  };
  write.done = () => chain;
  write.file = file;
  return write;
}
