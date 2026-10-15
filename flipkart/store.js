// Flipkart's own storage, only in data/flipkart/ (data/ is kept out of git and
// never served as a file): the uploaded file (upload.xlsx or upload.csv), the
// rows made from it with the columns found, each with its last check's steps
// and a result a staff member changed or marked right (rows.json), the
// pictures placed in its cells and the screenshots got for a
// row (pictures/), Flipkart's own settings with the columns chosen last and
// the passing marks (settings.json), the campaigns with what was read from their products'
// Flipkart pages (campaigns.json), and each product's public reviews
// (reviews/<product ID>.json), with every review since its campaign's start
// date kept from all its readings (reviews/<product ID>-kept.json). Nothing
// here writes anywhere else in data/.
// Copied from the Amazon store's way of writing (amazon/store.js): a file is
// written whole under another name, then renamed, readable only by this
// computer's user.

import { mkdir, readFile, writeFile, rename, rm, readdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { basename, join } from 'node:path';
import { ANY_PID, reviewPageLink } from './links.js';
import { FINAL_WORDS, TYPE_WORDS } from './final.js';
import { imageType, MAX_PICTURE_BYTES, PICTURE_EXT } from './image-type.js';
import { DEFAULT_MARKS, checkMarks } from './settings.js';

/** The largest file taken: the same as for Amazon. */
export const MAX_SHEET_BYTES = 50 * 1024 * 1024;
/** A row's cells that hold pictures or links, as on Amazon: the purchase and delivery screenshots, the review link and the review screenshot. */
export const SHOTS = ['order', 'delivery', 'review', 'reviewShot'];
/** At most this many links, or pictures, are kept from one cell, as on Amazon. */
export const MAX_PICTURES_PER_CELL = 5;
export const SHOT_LABELS = { order: 'purchase screenshot', delivery: 'delivery screenshot', review: 'review picture', reviewShot: 'review screenshot' };
/** A row's own id, given when its file is uploaded. */
export const ROW_ID = /^r[0-9a-f]{12}$/;
/** A check's id, as the Amazon store's (check.js newCheckId). */
export const CHECK_ID = /^c[0-9]{14}[0-9a-f]{6}$/;
/** The ways a check's step can end, as on Amazon, and "comes in a later step". */
const STEP_STATES = new Set(['pass', 'fail', 'not-reached', 'not-needed', 'running', 'waiting', 'later']);
const timeOrNull = (t) => (typeof t === 'string' && t.length <= 40 && !Number.isNaN(Date.parse(t)) ? t : null);

/**
 * A row that already has a result, so "Start checking" and "Carry on
 * checking" pass it by, as on Amazon (amazon/store.js hasResult): checked by
 * the dashboard (or marked Duplicate when another row was checked), or given
 * a Status in the uploaded file, unless "Check every row again" has been
 * pressed since.
 */
export function hasResult(row) {
  return Boolean(row?.check) || (Boolean(String(row?.prev?.status ?? '').trim()) && !row?.recheck);
}

/** A problem with what was asked of the store, with the HTTP status that says so. Copied from the Amazon store. */
export class StoreError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const TEXT_LIMIT = 2000;

const cleanText = (v, limit = TEXT_LIMIT) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim().slice(0, limit);

/** What the dashboard itself said of a row, for the count of right results: its check's Status, Type key and Type. Copied from the Amazon store. */
function dashboardSaid(check) {
  return { final: check.final ?? null, typeKey: check.typeKey ?? null, type: check.type ?? null };
}

/** A cell of a row as kept: its words, its links, a mismatch, and how a picture was given. Copied from the Amazon store. */
function cleanShot(s) {
  const links = (Array.isArray(s?.links) ? s.links : []).filter((l) => typeof l === 'string' && /^https?:\/\//i.test(l)).slice(0, MAX_PICTURES_PER_CELL).map((l) => l.slice(0, TEXT_LIMIT));
  const out = { text: cleanText(s?.text), link: typeof s?.link === 'string' ? s.link.slice(0, TEXT_LIMIT) : links[0] ?? '', links, mismatch: null, picture: null };
  if (s?.mismatch?.text && s?.mismatch?.link) out.mismatch = { text: cleanText(s.mismatch.text), link: cleanText(s.mismatch.link) };
  if (s?.picture?.how === 'cell' || s?.picture?.how === 'floating') out.picture = s.picture.how;
  return out;
}

/** What a screenshot says, as read (check.js), as kept with the row's last check: its words cut to length, and what each detail is. Null when it was not read. */
function keptRead(o) {
  if (!o || typeof o !== 'object') return null;
  const list = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
  return {
    ok: Boolean(o.ok),
    problem: o.problem ? cleanText(o.problem, 300) : null,
    confidence: Number.isFinite(o.confidence) ? Math.round(o.confidence) : null,
    wordCount: Number.isInteger(o.wordCount) && o.wordCount >= 0 ? o.wordCount : 0,
    hindi: Boolean(o.hindi),
    orderIds: list(o.orderIds, 10).map((x) => cleanText(x, 40)),
    dates: list(o.dates, 20).map((x) => cleanText(x, 60)),
    amounts: list(o.amounts, 40).map((a) => ({ text: cleanText(a?.text, 60), value: Number.isFinite(a?.value) ? a.value : null, label: a?.label ? cleanText(a.label, 40) : null, skip: Boolean(a?.skip) })),
    product: o.product ? cleanText(o.product, 500) : null,
    productShare: Number.isFinite(o.productShare) ? o.productShare : null,
    text: cleanText(o.text, 20000),
    details: o.details && typeof o.details === 'object' ? JSON.parse(JSON.stringify(o.details)) : null,
    // The delivery screenshot's: whether it says Delivered (its words), and the first of Flipkart's not-delivered words it holds.
    ...('delivered' in o ? { delivered: Boolean(o.delivered), deliveredText: o.deliveredText ? cleanText(o.deliveredText, 200) : null, notDelivered: o.notDelivered ? cleanText(o.notDelivered, 60) : null } : {}),
  };
}

/** What the review screenshot says, as read (check.js step 6), as kept with the row's last check: its words cut to length. Null when it was not read. */
function keptReview(o) {
  if (!o || typeof o !== 'object') return null;
  const words = (v, n) => (v ? cleanText(v, n) : null);
  return {
    ok: Boolean(o.ok),
    problem: words(o.problem, 300),
    confidence: Number.isFinite(o.confidence) ? Math.round(o.confidence) : null,
    wordCount: Number.isInteger(o.wordCount) && o.wordCount >= 0 ? o.wordCount : 0,
    hindi: Boolean(o.hindi),
    kind: ['written', 'rating', 'refused', 'unknown'].includes(o.kind) ? o.kind : 'unknown',
    stars: Number.isInteger(o.stars) && o.stars >= 1 && o.stars <= 5 ? o.stars : null,
    title: words(o.title, 300),
    body: words(o.body, 5000),
    name: words(o.name, 200),
    dateText: words(o.dateText, 60),
    message: words(o.message, 500),
    own: Boolean(o.own),
    form: Boolean(o.form),
    pending: Boolean(o.pending),
    tab: o.tab === 'pending' || o.tab === 'published' ? o.tab : null,
    note: words(o.note, 300),
    others: Number.isInteger(o.others) && o.others >= 0 ? o.others : 0,
    why: words(o.why, 500),
    text: cleanText(o.text, 20000),
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** From which day a review can be the user's (check.js reviewsFrom), as kept with the row's last check. */
function keptFrom(o) {
  if (!o || typeof o !== 'object') return null;
  return { day: DAY.test(String(o.day ?? '')) ? o.day : null, from: o.from === 'delivery' || o.from === 'order' ? o.from : null, said: o.said ? cleanText(o.said, 300) : null };
}
/** What step 7 read of Flipkart's reviews for the row, as kept with its last check: how many, how far back, and with a campaign's start date, that day and how many reviews kept from earlier readings were searched too; never the reviews themselves (they are kept in reviews/<product ID>.json and reviews/<product ID>-kept.json). */
function keptReading(o) {
  if (!o || typeof o !== 'object') return null;
  const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  return {
    ...(DAY.test(String(o.start ?? '')) ? { start: o.start, kept: count(o.kept) ?? 0 } : {}),
    pid: ANY_PID.test(String(o.pid ?? '')) ? o.pid : null,
    name: o.name ? cleanText(o.name, 500) : null,
    readAt: timeOrNull(o.readAt),
    reused: Boolean(o.reused),
    pages: count(o.pages) ?? 0,
    count: count(o.count) ?? 0,
    total: count(o.total),
    end: o.end ? cleanText(o.end, 20) : null,
    since: DAY.test(String(o.since ?? '')) ? o.since : null,
    oldest: DAY.test(String(o.oldest ?? '')) ? o.oldest : null,
    says: o.says ? cleanText(o.says, 500) : null,
  };
}
const FOUND_HOW = new Set(['found', 'gone', 'several', 'otherName', 'noName', 'noNameToCheck', 'notFound', 'noWords']);
/** What step 7's search found among Flipkart's reviews (review-match.js), as kept with the row's last check: how ('gone': found only among the reviews kept from earlier readings, though today's reading reaches back to its day), and the review it points at, its words cut to length, with its own link on Flipkart, only in the form Flipkart's website opens (links.js reviewPageLink), and, for one kept from an earlier reading, the last day it was seen on Flipkart. */
function keptFound(o) {
  if (!o || typeof o !== 'object' || !FOUND_HOW.has(o.how)) return null;
  const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  const share = (v) => (Number.isFinite(v) && v >= 0 && v <= 1 ? Math.round(v * 1000) / 1000 : null);
  const r = o.review && typeof o.review === 'object' ? o.review : null;
  return {
    how: o.how,
    count: count(o.count),
    nameFrom: o.nameFrom === 'screenshot' || o.nameFrom === 'sheet' ? o.nameFrom : null,
    counted: count(o.counted),
    nameOnly: count(o.nameOnly),
    before: count(o.before),
    share: share(o.share),
    rareShare: share(o.rareShare),
    review: r ? { id: r.id ? cleanText(r.id, 100) : null, name: r.name ? cleanText(r.name, 100) : null, stars: Number.isInteger(r.stars) && r.stars >= 1 && r.stars <= 5 ? r.stars : null, title: r.title ? cleanText(r.title, 300) : null, text: r.text ? cleanText(r.text, 3000) : null, dateSaid: r.dateSaid ? cleanText(r.dateSaid, 60) : null, date: DAY.test(String(r.date ?? '')) ? r.date : null, dateLatest: DAY.test(String(r.dateLatest ?? '')) ? r.dateLatest : null, link: reviewPageLink(r.link, r.id ?? null) } : null,
    ...(o.kept === true && DAY.test(String(o.lastSeen ?? '')) ? { kept: true, lastSeen: o.lastSeen } : {}),
  };
}
/** What came before the campaign's start date (check.js misuseOf), as kept with the row's last check: the start date, and the day the order was placed and delivered, when the review was posted, and the full date the review screenshot shows, each only when it came before it. */
function keptMisuse(o) {
  if (!o || typeof o !== 'object' || !DAY.test(String(o.start ?? ''))) return null;
  const day = (v) => (DAY.test(String(v ?? '')) ? v : null);
  const p = o.posted && typeof o.posted === 'object' ? o.posted : null;
  return { start: o.start, placed: day(o.placed), delivered: day(o.delivered), posted: p && day(p.dateLatest) ? { date: day(p.date), dateLatest: p.dateLatest, dateSaid: p.dateSaid ? cleanText(p.dateSaid, 60) : null } : null, shot: day(o.shot) };
}

/** The comparison table (check.js buildComparison), as kept with the row's last check: its words cut to length. */
function keptComparison(rows) {
  const ok = (v) => (v === true || v === false ? v : null);
  return (Array.isArray(rows) ? rows : []).slice(0, 20).map((x) => ({ field: cleanText(x?.field, 60), sheet: cleanText(x?.sheet, 600), order: cleanText(x?.order, 600), delivery: cleanText(x?.delivery, 600), result: cleanText(x?.result, 300), ok: ok(x?.ok) }));
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
 * is kept: its typed words cleaned and cut to length, its start date
 * (YYYY-MM-DD, or null), and when it was made and last changed. Answers it as
 * kept.
 */
export function putCampaign(list, campaign, at = new Date().toISOString()) {
  const i = list.findIndex((c) => c.key === campaign.key);
  const kept = { ...campaign, brand: cleanText(campaign.brand, 60), name: cleanText(campaign.name, 80), live: Boolean(campaign.live), startDate: DAY.test(String(campaign.startDate ?? '')) ? campaign.startDate : null, createdAt: i >= 0 ? list[i].createdAt : at, updatedAt: at };
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
    /** Every review of a product since its campaign's start date, kept from all its readings (kept-reviews.js), or null when none were kept. */
    async keptReviews(pid) {
      return ANY_PID.test(String(pid ?? '')) ? readJson(join(dir, 'reviews', `${pid}-kept.json`), null) : null;
    },
    /** Keeps them in data/flipkart/reviews/<product ID>-kept.json, in place of the ones kept before. */
    saveKeptReviews(pid, kept) {
      if (!ANY_PID.test(String(pid ?? ''))) return Promise.reject(new Error('Not a Flipkart product ID.'));
      return locked(async () => {
        await mkdir(join(dir, 'reviews'), { recursive: true, mode: 0o700 });
        await writeWhole(join(dir, 'reviews', `${pid}-kept.json`), JSON.stringify(kept, null, 2));
        return kept;
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
    /** The uploaded file's bytes as it came (upload.xlsx or upload.csv), for the checked Excel file; null when there is none. */
    async sheetData() {
      const name = (await readJson(rowsFile, null))?.sheet?.file;
      if (name !== 'upload.xlsx' && name !== 'upload.csv') return null;
      try {
        return await readFile(join(dir, name));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
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
    /** A kept picture's fingerprint (fingerprint.js), for finding the same screenshot in another row; null when the picture is gone. */
    setFingerprint(id, which, index, fingerprint) {
      return locked(async () => {
        const d = await savedRows();
        const pic = d?.rows.find((r) => r.id === id)?.pictures?.[which]?.[index];
        if (!pic?.file || typeof fingerprint !== 'string' || !/^[0-9a-f]{8,1024}$/.test(fingerprint)) return null;
        pic.fingerprint = fingerprint;
        await writeWhole(rowsFile, JSON.stringify(d));
        return pic;
      });
    },
    /**
     * A row's last check, kept with the row, so its page shows the check's
     * steps after a reload too: { checkId, startedAt, finishedAt, seconds,
     * steps: [{ n, name, state, detail }], order, delivery, review,
     * reviewsFrom, flipkart, shotsHad, comparison } (order, delivery and
     * review: what the purchase, the delivery and the review screenshots say,
     * as read; reviewsFrom: from which day a review can be the user's;
     * flipkart: what step 7 read of Flipkart's reviews; found: what its search
     * found; misuse: what came before the campaign's start date, or null;
     * comparison: the sheet and the two side by side, for the
     * screenshots the file has), and step 9's Status (final: 'pass', 'fail' or
     * 'manual'; status: its words), Type (typeKey, and type: its words), Note
     * and the Status's reason (finalSays). The check before goes.
     */
    saveCheck(id, result) {
      return locked(async () => {
        const d = await savedRows();
        const row = d?.rows.find((r) => r.id === id);
        if (!row) throw new StoreError(404, 'No row has that id.');
        row.check = {
          checkId: CHECK_ID.test(String(result?.checkId ?? '')) ? result.checkId : null,
          startedAt: timeOrNull(result?.startedAt),
          finishedAt: timeOrNull(result?.finishedAt),
          seconds: Number.isFinite(result?.seconds) && result.seconds >= 0 ? Math.round(result.seconds) : null,
          steps: (Array.isArray(result?.steps) ? result.steps : []).slice(0, 20).map((s, i) => ({ n: i + 1, name: cleanText(s?.name, 200), state: STEP_STATES.has(s?.state) ? s.state : 'waiting', detail: s?.detail ? cleanText(s.detail) : null })),
          order: keptRead(result?.order),
          delivery: keptRead(result?.delivery),
          review: keptReview(result?.review),
          reviewsFrom: keptFrom(result?.reviewsFrom),
          flipkart: keptReading(result?.flipkart),
          found: keptFound(result?.found),
          misuse: keptMisuse(result?.misuse),
          shotsHad: (Array.isArray(result?.shotsHad) ? result.shotsHad : []).filter((w) => w === 'order' || w === 'delivery'),
          comparison: keptComparison(result?.comparison),
          final: Object.hasOwn(FINAL_WORDS, String(result?.final)) ? result.final : null,
          status: Object.hasOwn(FINAL_WORDS, String(result?.final)) ? FINAL_WORDS[result.final] : null,
          typeKey: Object.hasOwn(TYPE_WORDS, String(result?.typeKey)) ? result.typeKey : null,
          type: Object.hasOwn(TYPE_WORDS, String(result?.typeKey)) ? TYPE_WORDS[result.typeKey] : null,
          note: result?.note ? cleanText(result.note, 4000) : null,
          finalSays: result?.finalSays ? cleanText(result.finalSays, 1000) : null,
        };
        await writeWhole(rowsFile, JSON.stringify(d));
        return row;
      });
    },
    /**
     * A row's result as a staff member changed it, as on Amazon: the Status
     * (its key and its word), the Type (its key and its words) and the Note
     * they chose, kept with when, in place of the check's own (its steps and
     * what it read stay, so the row's page still shows them); a row not
     * checked yet gets this result alone. "Check every row again" passes such
     * a row by; "Check again" replaces it. -> the row as kept.
     */
    setStaffResult(id, { final, typeKey, note, at = new Date().toISOString() }) {
      return locked(async () => {
        const d = await savedRows();
        const row = d?.rows.find((r) => r.id === id);
        if (!row) throw new StoreError(404, 'No row has that id.');
        if (!Object.hasOwn(FINAL_WORDS, String(final))) throw new StoreError(400, 'Choose a Status: Pass, Fail or Needs Manual Staff Checking.');
        if (!Object.hasOwn(TYPE_WORDS, String(typeKey))) throw new StoreError(400, 'Choose a Type from the list.');
        const c = row.check ?? null;
        // What the dashboard itself said (never a result staff set): a change means the dashboard was wrong, for the count of right results.
        const was = c?.final && !c.staff ? dashboardSaid(c) : c?.staff?.was ?? null;
        row.check = { ...(c ?? { checkId: null, startedAt: null, finishedAt: null, seconds: null, steps: [] }), final, status: FINAL_WORDS[final], typeKey, type: TYPE_WORDS[typeKey], note: cleanText(note, 4000), finalSays: null, staff: { at: timeOrNull(at) ?? new Date().toISOString(), right: false, was } };
        await writeWhole(rowsFile, JSON.stringify(d));
        return row;
      });
    },
    /**
     * "The result is right", as on Amazon: a staff member looked at the
     * dashboard's result and found it right. The result stays as it is,
     * marked checked by staff and right (for the count of right results);
     * checking the row again clears the mark. -> the row as kept.
     */
    markRight(id, { at = new Date().toISOString() } = {}) {
      return locked(async () => {
        const d = await savedRows();
        const row = d?.rows.find((r) => r.id === id);
        if (!row) throw new StoreError(404, 'No row has that id.');
        if (!row.check?.final) throw new StoreError(409, 'This row has no result to mark as right. Check it first.');
        if (row.check.staff && !row.check.staff.right) throw new StoreError(409, 'This result was chosen by staff, not by the dashboard, so it cannot be marked as right. Press "Check again" to get the dashboard\'s result first.');
        row.check.staff = { at: timeOrNull(at) ?? new Date().toISOString(), right: true, was: dashboardSaid(row.check) };
        await writeWhole(rowsFile, JSON.stringify(d));
        return row;
      });
    },
    /**
     * "Check every row again", as on Amazon: every row's last check goes, and
     * a Status the uploaded file gave a row no longer counts as one (recheck),
     * so the rows are checked again from the first one; a result a staff
     * member changed is kept, so that row is passed by, and a result only
     * marked right by staff goes like any other (its mark with it). Their
     * pictures stay. -> how many rows lost their check.
     */
    clearChecks() {
      return locked(async () => {
        const d = await savedRows();
        if (!d) return 0;
        let n = 0;
        for (const r of d.rows) {
          if (r.check?.staff && !r.check.staff.right) continue;
          r.recheck = true;
          if (!r.check) continue;
          delete r.check;
          n++;
        }
        await writeWhole(rowsFile, JSON.stringify(d));
        return n;
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
    /**
     * Flipkart's passing marks (settings.js), from Flipkart's own settings
     * (never Amazon's). The first time, they are written there with the Amazon
     * checker's values, so they can be seen and changed. Throws SettingsError
     * for a mark that is wrong.
     */
    passingMarks() {
      return locked(async () => {
        const s = await settings();
        if (s.passingMarks !== undefined) return checkMarks(s.passingMarks);
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await writeWhole(settingsFile, JSON.stringify({ ...s, passingMarks: { ...DEFAULT_MARKS } }, null, 2));
        return { ...DEFAULT_MARKS };
      });
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
