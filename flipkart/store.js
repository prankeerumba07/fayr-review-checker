// Flipkart's own storage, only in data/flipkart/ (data/ is kept out of git and
// never served as a file): the uploaded file (upload.xlsx or upload.csv) and
// what was read from it (rows.json). Nothing here writes anywhere else in
// data/. Copied from the Amazon store's way of writing (amazon/store.js): a
// file is written whole under another name, then renamed, readable only by
// this computer's user.

import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

/** The largest file taken: the same as for Amazon. */
export const MAX_SHEET_BYTES = 50 * 1024 * 1024;
const TEXT_LIMIT = 2000;

const cleanText = (v, limit = TEXT_LIMIT) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim().slice(0, limit);

/** A cell as kept: its words, the web link behind them, and whether a picture is in it. */
function cleanCell(c) {
  const out = { text: cleanText(c?.text), behind: /^https?:\/\//i.test(String(c?.behind ?? '')) ? String(c.behind).slice(0, TEXT_LIMIT) : '' };
  if (c?.picture) out.picture = true;
  return out;
}

export function createFlipkartStore(dataDir) {
  const dir = join(dataDir, 'flipkart');
  const rowsFile = join(dir, 'rows.json');
  let lock = Promise.resolve();
  const locked = (fn) => {
    const turn = lock.then(fn);
    lock = turn.catch(() => {});
    return turn;
  };

  async function readJson(file, fallback) {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return fallback;
      throw err;
    }
  }
  async function writeWhole(file, data) {
    const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, data, { mode: 0o600 });
    await rename(tmp, file);
  }

  return {
    dir,
    /** The saved file's name and tab, its column names and its rows: { sheet, headers, rows }, or null when no file was uploaded. */
    async sheet() {
      const d = await readJson(rowsFile, null);
      return d?.sheet && Array.isArray(d.headers) && Array.isArray(d.rows) ? d : null;
    },
    /** Keeps the uploaded file and what was read from it, in place of the file before. */
    saveSheet(info, data, headers, rows) {
      return locked(async () => {
        await mkdir(dir, { recursive: true, mode: 0o700 });
        const name = `upload.${info.kind === 'csv' ? 'csv' : 'xlsx'}`;
        await writeWhole(join(dir, name), data);
        const saved = {
          sheet: { fileName: cleanText(info.fileName, 200), kind: info.kind === 'csv' ? 'csv' : 'xlsx', tab: info.tab === null ? null : cleanText(info.tab, 200), headerRow: info.headerRow, file: name, uploadedAt: new Date().toISOString() },
          headers: headers.map((h) => ({ col: h.col, text: cleanText(h.text) })),
          rows: rows.map((r) => ({ row: r.row, cells: Object.fromEntries(Object.entries(r.cells).map(([col, c]) => [col, cleanCell(c)])) })),
        };
        await writeWhole(rowsFile, JSON.stringify(saved));
        for (const old of ['upload.csv', 'upload.xlsx']) if (old !== name) await rm(join(dir, old), { force: true });
        return saved;
      });
    },
  };
}
