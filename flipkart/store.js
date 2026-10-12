// Flipkart's own storage, only in data/flipkart/ (data/ is kept out of git and
// never served as a file): the uploaded file (upload.xlsx or upload.csv), the
// rows made from it with the columns found (rows.json), the pictures placed
// in its cells and the screenshots got for a row (pictures/), Flipkart's own
// settings with the columns chosen last (settings.json), the campaigns with what was read from their products'
// Flipkart pages (campaigns.json), and each product's public reviews
// (reviews/<product ID>.json). Nothing here writes anywhere else in data/.
// Copied from the Amazon store's way of writing (amazon/store.js): a file is
// written whole under another name, then renamed, readable only by this
// computer's user.

import { mkdir, readFile, writeFile, rename, rm, readdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { basename, join } from 'node:path';
import { ANY_PID } from './links.js';
import { imageType, MAX_PICTURE_BYTES, PICTURE_EXT } from './image-type.js';

/** The largest file taken: the same as for Amazon. */
export const MAX_SHEET_BYTES = 50 * 1024 * 1024;
/** A row's cells that hold pictures or links, as on Amazon: the purchase and delivery screenshots, the review link and the review screenshot. */
export const SHOTS = ['order', 'delivery', 'review', 'reviewShot'];
/** At most this many links, or pictures, are kept from one cell, as on Amazon. */
export const MAX_PICTURES_PER_CELL = 5;
export const SHOT_LABELS = { order: 'purchase screenshot', delivery: 'delivery screenshot', review: 'review picture', reviewShot: 'review screenshot' };
/** A row's own id, given when its file is uploaded. */
export const ROW_ID = /^r[0-9a-f]{12}$/;

/** A problem with what was asked of the store, with the HTTP status that says so. Copied from the Amazon store. */
export class StoreError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const TEXT_LIMIT = 2000;

const cleanText = (v, limit = TEXT_LIMIT) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim().slice(0, limit);

/** A cell of a row as kept: its words, its links, a mismatch, and how a picture was given. Copied from the Amazon store. */
function cleanShot(s) {
  const links = (Array.isArray(s?.links) ? s.links : []).filter((l) => typeof l === 'string' && /^https?:\/\//i.test(l)).slice(0, MAX_PICTURES_PER_CELL).map((l) => l.slice(0, TEXT_LIMIT));
  const out = { text: cleanText(s?.text), link: typeof s?.link === 'string' ? s.link.slice(0, TEXT_LIMIT) : links[0] ?? '', links, mismatch: null, picture: null };
  if (s?.mismatch?.text && s?.mismatch?.link) out.mismatch = { text: cleanText(s.mismatch.text), link: cleanText(s.mismatch.link) };
  if (s?.picture?.how === 'cell' || s?.picture?.how === 'floating') out.picture = s.picture.how;
  return out;
}

/** A row made from the file (workbook.js sheetRows), as kept, with its own id; its pictures come after. Copied from the Amazon store's way of keeping a row. */
function keptRow(r) {
  const row = {
    id: `r${randomBytes(6).toString('hex')}`,
    row: Number.isInteger(r.row) ? r.row : null,
    n: Number.isInteger(r.n) && r.n > 0 ? r.n : null,
    orderId: { text: cleanText(r.orderId?.text, 200), value: cleanText(r.orderId?.value, 200) },
    orderDate: { text: cleanText(r.orderDate?.text, 100), value: /^\d{4}-\d{2}-\d{2}$/.test(r.orderDate?.value ?? '') ? r.orderDate.value : null },
    amount: { text: cleanText(r.amount?.text, 100), value: Number.isFinite(r.amount?.value) ? r.amount.value : null },
    product: { text: cleanText(r.product?.text, 500) },
    shots: Object.fromEntries(SHOTS.map((w) => [w, cleanShot(r.shots?.[w])])),
    prev: null,
    // The file's other columns, by column number, to be shown as they are.
    values: {},
    pictures: Object.fromEntries(SHOTS.map((w) => [w, []])),
  };
  for (const [col, v] of Object.entries(r.values && typeof r.values === 'object' ? r.values : {}).slice(0, 200)) {
    if (!/^[1-9]\d{0,2}$/.test(col) || !v || typeof v !== 'object') continue;
    const behind = typeof v.behind === 'string' && /^https?:\/\//i.test(v.behind) ? v.behind.slice(0, TEXT_LIMIT) : '';
    const text = cleanText(v.text, 500);
    if (text || behind) row.values[col] = { text, behind };
  }
  if (r.prev && (r.prev.status || r.prev.type || r.prev.note)) row.prev = { status: cleanText(r.prev.status, 100), type: cleanText(r.prev.type, 200), note: cleanText(r.prev.note, 4000) };
  return row;
}

/**
 * Puts a campaign, new or changed, in the list of campaigns (in place) as it
 * is kept: its typed words cleaned and cut to length, and when it was made
 * and last changed. Answers it as kept.
 */
export function putCampaign(list, campaign, at = new Date().toISOString()) {
  const i = list.findIndex((c) => c.key === campaign.key);
  const kept = { ...campaign, brand: cleanText(campaign.brand, 60), name: cleanText(campaign.name, 80), live: Boolean(campaign.live), createdAt: i >= 0 ? list[i].createdAt : at, updatedAt: at };
  if (i >= 0) list[i] = kept;
  else list.push(kept);
  return kept;
}

/**
 * A campaign as it is kept now. One saved before campaigns had a brand (with
 * a Campaign ID, until 12-10-2026) is kept: its Campaign ID becomes its name
 * and its brand is left empty, so it is not used until its brand is added;
 * a product read then, before the other colours and sizes were read, is read
 * again.
 */
function upToDate(c) {
  if (!c || typeof c !== 'object' || !Object.hasOwn(c, 'campaignId')) return c;
  const { campaignId, name: _before, ...rest } = c;
  const products = (Array.isArray(c.products) ? c.products : []).map((p) => (p?.read && !Array.isArray(p.read.variants) ? { ...p, read: null, problem: null } : p));
  return { ...rest, brand: '', name: cleanText(campaignId, 80), products };
}

export function createFlipkartStore(dataDir) {
  const dir = join(dataDir, 'flipkart');
  const rowsFile = join(dir, 'rows.json');
  const campaignsFile = join(dir, 'campaigns.json');
  const settingsFile = join(dir, 'settings.json');
  const picturesDir = join(dir, 'pictures');
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

  /** Flipkart's own settings; {} when there are none yet, or when the file cannot be read (it is then written again whole). */
  async function settings() {
    try {
      const s = await readJson(settingsFile, {});
      return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
    } catch {
      return {};
    }
  }

  /** A picture's bytes checked before anything is written: its type, or a StoreError with a plain sentence. Copied from the Amazon store. */
  function pictureType(which, buf) {
    if (!SHOTS.includes(which)) throw new StoreError(400, 'Say which picture this is.');
    if (!buf || !buf.length) throw new StoreError(400, `The ${SHOT_LABELS[which]} file is empty.`);
    if (buf.length > MAX_PICTURE_BYTES) throw new StoreError(400, `The ${SHOT_LABELS[which]} is larger than 10 megabytes.`);
    const type = imageType(buf);
    if (!type) throw new StoreError(400, `The ${SHOT_LABELS[which]} must be a PNG, JPEG or WebP picture.`);
    return type;
  }

  /** The kept file's rows with their file (rows.json as it is), or null when no file was uploaded since its columns could be found. */
  async function savedRows() {
    const d = await readJson(rowsFile, null);
    return d?.sheet?.mapping && Array.isArray(d.rows) ? d : null;
  }

  /** Keeps one picture of a row's cell, as the Amazon store keeps a row's picture. */
  async function writePicture(id, which, index, data) {
    const type = imageType(data);
    const file = `${id}-${which}-${index}.${PICTURE_EXT[type]}`;
    await writeFile(join(picturesDir, file), data, { mode: 0o600 });
    return { file, type, size: data.length, sha256: createHash('sha256').update(data).digest('hex'), at: new Date().toISOString() };
  }

  async function allCampaigns() {
    const d = await readJson(campaignsFile, null);
    return Array.isArray(d?.campaigns) ? d.campaigns.map(upToDate) : [];
  }
  /**
   * Changes the campaigns as they are saved now, one change at a time: fn
   * changes the list in place and answers what to give back, or null or false
   * when there was nothing to change (nothing is written then). When fn
   * throws, nothing is written.
   */
  const changeCampaigns = (fn) =>
    locked(async () => {
      const list = await allCampaigns();
      const out = fn(list);
      if (out === null || out === false) return out;
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeWhole(campaignsFile, JSON.stringify({ campaigns: list }, null, 2));
      return out;
    });

  return {
    dir,
    /** Every campaign, in the order they were added. */
    campaigns: allCampaigns,
    async campaign(key) {
      return (await allCampaigns()).find((c) => c.key === key) ?? null;
    },
    changeCampaigns,
    /** What was read for one product of a campaign; null when the campaign or the product is gone. */
    setCampaignProduct(key, given, product) {
      return changeCampaigns((list) => {
        const c = list.find((x) => x.key === key);
        const j = (c?.products ?? []).findIndex((p) => p.given === given);
        if (j < 0) return null;
        c.products[j] = product;
        return product;
      });
    },
    /** A product's public reviews as last read (reviews.js), or null when none were read. */
    async reviews(pid) {
      return ANY_PID.test(String(pid ?? '')) ? readJson(join(dir, 'reviews', `${pid}.json`), null) : null;
    },
    /** Keeps a product's public reviews, as read, in data/flipkart/reviews/<product ID>.json, in place of the ones read before. */
    saveReviews(pid, read) {
      if (!ANY_PID.test(String(pid ?? ''))) return Promise.reject(new Error('Not a Flipkart product ID.'));
      return locked(async () => {
        await mkdir(join(dir, 'reviews'), { recursive: true, mode: 0o700 });
        await writeWhole(join(dir, 'reviews', `${pid}.json`), JSON.stringify(read, null, 2));
        return read;
      });
    },
    /**
     * The saved file: { sheet: { fileName, kind, tab, headerRow, headers,
     * lastCol, mapping, file, uploadedAt }, rows }, the rows as made from it;
     * { old: true } for a file kept before its columns were found (until
     * 12-10-2026), which must be uploaded again; null when no file was
     * uploaded.
     */
    async sheet() {
      const d = await readJson(rowsFile, null);
      if (!d?.sheet) return null;
      return d.sheet.mapping && Array.isArray(d.sheet.headers) && Array.isArray(d.rows) ? d : { old: true };
    },
    /**
     * Keeps the uploaded file and the rows made from it, in place of the file
     * before and its rows. info: { fileName, kind, tab, headerRow, headers,
     * lastCol, mapping }; rows: as workbook.js sheetRows made them. A picture
     * placed in a cell is part of the file, so it is kept at once, as on
     * Amazon, in pictures/<row's id>-<cell>-0.png (or .jpg, .webp); one that
     * cannot be kept is said with its row. The pictures of the file before go.
     */
    saveSheet(info, data, rows) {
      return locked(async () => {
        await mkdir(dir, { recursive: true, mode: 0o700 });
        const name = `upload.${info.kind === 'csv' ? 'csv' : 'xlsx'}`;
        await writeWhole(join(dir, name), data);
        const kept = [];
        for (const r of rows) {
          const row = keptRow(r);
          for (const w of SHOTS) {
            const p = r.shots?.[w]?.picture;
            if (!p?.data) continue;
            const problem = !imageType(p.data) ? 'it is not a picture the dashboard can read' : p.data.length > MAX_PICTURE_BYTES ? 'it is larger than 10 megabytes' : null;
            if (problem) row.pictures[w] = [{ link: null, problem: { kind: 'sheet', site: null, says: problem } }];
            else {
              await mkdir(picturesDir, { recursive: true, mode: 0o700 });
              row.pictures[w] = [{ link: null, ...(await writePicture(row.id, w, 0, p.data)) }];
            }
          }
          kept.push(row);
        }
        const saved = {
          sheet: {
            fileName: cleanText(info.fileName, 200),
            kind: info.kind === 'csv' ? 'csv' : 'xlsx',
            tab: info.tab === null ? null : cleanText(info.tab, 200),
            headerRow: info.headerRow,
            headers: info.headers.map((h) => ({ col: h.col, text: cleanText(h.text) })),
            lastCol: info.lastCol,
            mapping: info.mapping,
            file: name,
            uploadedAt: new Date().toISOString(),
          },
          rows: kept,
        };
        await writeWhole(rowsFile, JSON.stringify(saved));
        for (const old of ['upload.csv', 'upload.xlsx']) if (old !== name) await rm(join(dir, old), { force: true });
        // The pictures of the file before.
        const keep = new Set(kept.flatMap((r) => SHOTS.flatMap((w) => r.pictures[w].map((p) => p.file).filter(Boolean))));
        let before = [];
        try {
          before = await readdir(picturesDir);
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }
        for (const f of before) if (!keep.has(f)) await rm(join(picturesDir, f), { force: true });
        return saved;
      });
    },
    /** The choice of columns remembered from the last file: { [field]: column name }, or null. */
    /** One row of the kept file, as kept, with its pictures; null when there is no such row. */
    async row(id) {
      if (!ROW_ID.test(String(id ?? ''))) return null;
      return (await savedRows())?.rows.find((r) => r.id === id) ?? null;
    },
    /**
     * One cell's pictures, in the cell's order, as the Amazon store keeps
     * them: { link, data, fingerprint? } for a picture to keep (in
     * data/flipkart/pictures/), or { link, problem: { kind, site, says,
     * noAccess? } } for one that could not be had, with its reason. The
     * cell's earlier pictures go.
     */
    setPictures(id, which, list) {
      return locked(async () => {
        const d = await savedRows();
        const row = d?.rows.find((r) => r.id === id);
        if (!row) throw new StoreError(404, 'No row has that id.');
        if (!SHOTS.includes(which)) throw new StoreError(400, 'Say which picture this is.');
        for (const item of list) if (item.data) pictureType(which, item.data);
        for (const p of row.pictures?.[which] ?? []) if (p?.file) await rm(join(picturesDir, basename(p.file)), { force: true });
        await mkdir(picturesDir, { recursive: true, mode: 0o700 });
        const kept = [];
        for (const [i, item] of list.slice(0, MAX_PICTURES_PER_CELL).entries()) {
          if (item.data) kept.push({ link: item.link ?? null, ...(await writePicture(row.id, which, i, item.data)), ...(item.fingerprint ? { fingerprint: item.fingerprint } : {}) });
          else kept.push({ link: item.link ?? null, problem: { kind: String(item.problem?.kind ?? 'access'), site: item.problem?.site ? String(item.problem.site).slice(0, 200) : null, says: cleanText(item.problem?.says, 500), ...(item.problem?.noAccess ? { noAccess: true } : {}) } });
        }
        row.pictures = { ...Object.fromEntries(SHOTS.map((w) => [w, []])), ...(row.pictures ?? {}), [which]: kept };
        await writeWhole(rowsFile, JSON.stringify(d));
        return row;
      });
    },
    /** Where a row's kept picture is: data/flipkart/pictures/<its file>; null when the row has no such picture. */
    pictureFile(row, which, index) {
      const f = row?.pictures?.[which]?.[index]?.file;
      return typeof f === 'string' && f ? join(picturesDir, basename(f)) : null;
    },
    async columnChoice() {
      const c = (await settings()).columnChoice;
      return c && typeof c === 'object' && !Array.isArray(c) ? c : null;
    },
    /** Remembers a choice of columns for the next file, in Flipkart's own settings (never Amazon's). */
    setColumnChoice(choice) {
      return locked(async () => {
        const s = await settings();
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await writeWhole(settingsFile, JSON.stringify({ ...s, columnChoice: choice }, null, 2));
      });
    },
  };
}
