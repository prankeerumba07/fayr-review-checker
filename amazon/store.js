// Local storage for the dashboard, in data/ (kept out of git and never served
// as a file): rows.json, each row's pictures and their small pictures, the
// uploaded sheet and the choice of its columns, the campaigns (campaigns.json),
// each check's result and pictures, a result changed by a staff member, the
// emails sent about a row, and the test email address. The Amazon login is
// kept by Chrome in its own profile (data/amazon-profile), never here.
// Pictures are private: read only through the local server's guarded routes.
// Rows made with the old layout (users.json) are only counted, and removed by
// Remove all rows.

import { mkdir, readFile, writeFile, rename, rm, readdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { join, basename } from 'node:path';
import { imageType, MAX_PICTURE_BYTES, PICTURE_EXT } from './image-type.js';
import { TYPE_FINAL } from './final.js';

export { imageType, MAX_PICTURE_BYTES };
export const MAX_SHEET_BYTES = 50 * 1024 * 1024;
export const ROW_ID = /^r[0-9a-f]{12}$/;
export const CHECK_ID = /^c[0-9]{14}[0-9a-f]{6}$/;
/** A row's cells that hold pictures or links: the purchase and delivery screenshots, the review link (a link or a picture), and the review screenshot. */
export const SHOTS = ['order', 'delivery', 'review', 'reviewShot'];
export const SHOT_LABELS = { order: 'purchase screenshot', delivery: 'delivery screenshot', review: 'review picture', reviewShot: 'review screenshot' };
/** At most this many pictures are kept from one cell. */
export const MAX_PICTURES_PER_CELL = 5;
/** The Amazon pages a check keeps (in its folder, under pages/) until one check has kept them all. */
export const KEPT_PAGES = ['review', 'product', 'see-all', 'search-1'];
const TEXT_LIMIT = 2000;

export class StoreError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function newCheckId(date = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const stamp = `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`;
  return `c${stamp}${randomBytes(3).toString('hex')}`;
}

/**
 * A row that already has a result, so "Start checking" passes it by: checked
 * by the dashboard (or marked Duplicate when another row was checked), or
 * given a Status in the uploaded file, unless "Check every row again" has
 * been pressed since.
 */
export function hasResult(row) {
  return Boolean(row?.last) || (Boolean(String(row?.prev?.status ?? '').trim()) && !row?.recheck);
}

/** Rows in the order the screen shows them: the sheet's rows by their row number, then rows added by hand. */
export function ordered(rows) {
  return [...rows].sort((a, b) => {
    if ((a.source === 'sheet') !== (b.source === 'sheet')) return a.source === 'sheet' ? -1 : 1;
    if (a.source === 'sheet') return (a.row ?? 0) - (b.row ?? 0);
    return (a.hand ?? 0) - (b.hand ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt));
  });
}

const cleanText = (v, limit = TEXT_LIMIT) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim().slice(0, limit);

/** A cell of a row as kept: its words, its links, a mismatch, and how a picture was given. */
function cleanShot(s) {
  const links = (Array.isArray(s?.links) ? s.links : []).filter((l) => typeof l === 'string' && /^https?:\/\//i.test(l)).slice(0, MAX_PICTURES_PER_CELL).map((l) => l.slice(0, TEXT_LIMIT));
  const out = { text: cleanText(s?.text), link: typeof s?.link === 'string' ? s.link.slice(0, TEXT_LIMIT) : links[0] ?? '', links, mismatch: null, picture: null };
  if (s?.mismatch?.text && s?.mismatch?.link) out.mismatch = { text: cleanText(s.mismatch.text), link: cleanText(s.mismatch.link) };
  if (s?.picture === 'cell' || s?.picture === 'floating' || s?.picture === 'upload') out.picture = s.picture;
  return out;
}

/** What the dashboard said for a row, for the count of right results: its Status (from its Type when the check kept none), its Type's key and word. */
function dashboardSaid(last) {
  return { final: last.final ?? TYPE_FINAL[last.typeKey] ?? null, typeKey: last.typeKey ?? null, type: last.type ?? null };
}

export function createStore(dataDir) {
  const rowsFile = join(dataDir, 'rows.json');
  const oldUsersFile = join(dataDir, 'users.json');
  const picturesDir = join(dataDir, 'pictures');
  const smallDir = join(picturesDir, 'small');
  const oldShotsDir = join(dataDir, 'screenshots');
  const sheetDir = join(dataDir, 'sheet');
  const checksDir = join(dataDir, 'checks');
  const settingsFile = join(dataDir, 'settings.json');
  const campaignsFile = join(dataDir, 'campaigns.json');
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
  async function writeJson(file, value) {
    const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(tmp, file);
  }
  async function all() {
    const d = await readJson(rowsFile, { rows: [] });
    return Array.isArray(d?.rows) ? d.rows : [];
  }
  async function saveAll(rows) {
    await writeJson(rowsFile, { rows });
  }
  async function oldUsers() {
    const d = await readJson(oldUsersFile, { users: [] });
    return Array.isArray(d?.users) ? d.users : [];
  }
  async function settings() {
    const s = await readJson(settingsFile, {});
    return s && typeof s === 'object' ? s : {};
  }
  async function allCampaigns() {
    const d = await readJson(campaignsFile, { campaigns: [] });
    return Array.isArray(d?.campaigns) ? d.campaigns : [];
  }
  function changeCampaigns(fn) {
    return locked(async () => {
      const list = await allCampaigns();
      const out = fn(list);
      await writeJson(campaignsFile, { campaigns: list });
      return out;
    });
  }
  function changeSettings(fn) {
    return locked(async () => {
      const s = await settings();
      const out = fn(s);
      await writeJson(settingsFile, s);
      return out;
    });
  }

  /** Removes these rows' pictures and small pictures (every row's when ids is null), even a file rows.json no longer names. */
  async function sweep(ids) {
    for (const dir of [picturesDir, smallDir]) {
      let entries = [];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const m = e.isFile() ? e.name.match(/^(r[0-9a-f]{12})-/) : null;
        if (m && (ids === null || ids.has(m[1]))) await rm(join(dir, e.name), { force: true });
      }
    }
  }

  /** The old layout's screenshots and small pictures. Never the screenshots uploaded by file name, in their own folder. */
  async function sweepOld() {
    for (const dir of [oldShotsDir, join(oldShotsDir, 'small')]) {
      let entries = [];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) if (e.isFile() && /^u[0-9a-f]{12}-/.test(e.name)) await rm(join(dir, e.name), { force: true });
    }
  }

  /** A picture's bytes checked before anything is written: its type, or a StoreError with a plain sentence. */
  function pictureType(which, buf) {
    if (!SHOTS.includes(which)) throw new StoreError(400, 'Say which picture this is.');
    if (!buf || !buf.length) throw new StoreError(400, `The ${SHOT_LABELS[which]} file is empty.`);
    if (buf.length > MAX_PICTURE_BYTES) throw new StoreError(400, `The ${SHOT_LABELS[which]} is larger than 10 megabytes.`);
    const type = imageType(buf);
    if (!type) throw new StoreError(400, `The ${SHOT_LABELS[which]} must be a PNG, JPEG or WebP picture.`);
    return type;
  }

  async function dropPictureFiles(row, which) {
    for (const [i] of (row.pictures?.[which] ?? []).entries()) {
      for (const ext of Object.values(PICTURE_EXT)) await rm(join(picturesDir, `${row.id}-${which}-${i}.${ext}`), { force: true });
      await rm(join(smallDir, `${row.id}-${which}-${i}.jpg`), { force: true });
    }
  }

  async function writePicture(row, which, index, data) {
    const type = pictureType(which, data);
    const name = `${row.id}-${which}-${index}.${PICTURE_EXT[type]}`;
    await writeFile(join(picturesDir, name), data, { mode: 0o600 });
    return { file: name, type, size: data.length, sha256: createHash('sha256').update(data).digest('hex'), fingerprint: null, at: new Date().toISOString() };
  }

  function newRow(source) {
    const at = new Date().toISOString();
    return { id: `r${randomBytes(6).toString('hex')}`, source, row: null, hand: null, createdAt: at, updatedAt: at, cells: {}, pictures: { order: [], delivery: [], review: [], reviewShot: [] }, prev: null, last: null, seenLive: null };
  }

  /** A row's values from the sheet or the form, cleaned. */
  function fill(row, r) {
    row.orderId = { text: cleanText(r.orderId?.text, 200), value: cleanText(r.orderId?.value, 200) };
    row.orderDate = { text: cleanText(r.orderDate?.text, 100), value: /^\d{4}-\d{2}-\d{2}$/.test(r.orderDate?.value ?? '') ? r.orderDate.value : null };
    row.amount = { text: cleanText(r.amount?.text, 100), value: Number.isFinite(r.amount?.value) ? r.amount.value : null };
    row.product = { text: cleanText(r.product?.text, 500) };
    row.shots = { order: cleanShot(r.shots?.order), delivery: cleanShot(r.shots?.delivery), review: cleanShot(r.shots?.review), reviewShot: cleanShot(r.shots?.reviewShot) };
    // The file's other columns, by column number, to be shown as they are.
    row.values = {};
    for (const [col, v] of Object.entries(r.values && typeof r.values === 'object' ? r.values : {}).slice(0, 200)) {
      if (!/^[1-9]\d{0,2}$/.test(col) || !v || typeof v !== 'object') continue;
      const behind = typeof v.behind === 'string' && /^https?:\/\//i.test(v.behind) ? v.behind.slice(0, TEXT_LIMIT) : '';
      const text = cleanText(v.text, 500);
      if (text || behind) row.values[col] = { text, behind };
    }
    row.cells = r.cells && typeof r.cells === 'object' ? Object.fromEntries(Object.entries(r.cells).filter(([, v]) => typeof v === 'string' && /^[A-Z]{1,3}\d{1,7}$/.test(v))) : {};
    if (r.prev && (r.prev.status || r.prev.type || r.prev.note)) row.prev = { status: cleanText(r.prev.status, 100), type: cleanText(r.prev.type, 200), note: cleanText(r.prev.note, 4000) };
  }

  return {
    dataDir,
    async init() {
      for (const d of [dataDir, picturesDir, smallDir, sheetDir, checksDir]) await mkdir(d, { recursive: true, mode: 0o700 });
    },
    list: async () => ordered(await all()),
    async get(id) {
      if (!ROW_ID.test(String(id))) return null;
      return (await all()).find((r) => r.id === id) ?? null;
    },
    /** How many rows were made with the old layout (User name, Delivery screenshot, Review screenshot, Review link). */
    oldRowCount: async () => (await oldUsers()).length,

    /**
     * A row added by hand: { orderId, orderDate, amount, product, shots } as
     * the sheet gives them, and files { order, delivery, review, reviewShot } of { data }
     * for the pictures given as files. Every file is checked first, so a
     * refused form leaves nothing behind.
     */
    addManual(r, files = {}) {
      return locked(async () => {
        for (const w of SHOTS) if (files[w]) pictureType(w, files[w].data);
        const rows = await all();
        const row = newRow('manual');
        fill(row, r);
        row.hand = Math.max(0, ...rows.filter((x) => x.source === 'manual').map((x) => x.hand ?? 0)) + 1;
        for (const w of SHOTS) {
          if (!files[w]) continue;
          row.shots[w] = { ...row.shots[w], links: [], link: '', picture: 'upload' };
          row.pictures[w] = [{ link: null, ...(await writePicture(row, w, 0, files[w].data)) }];
        }
        rows.push(row);
        await saveAll(rows);
        return row;
      });
    },

    /**
     * A new sheet's rows replace the last sheet's (rows added by hand stay),
     * with their pictures. rows: [{ row, n, orderId, orderDate, amount,
     * product, shots, cells, prev }], in the sheet's order: row is the row in
     * the file, n the row's number on the dashboard (from 1). Their pictures
     * come after, through setPictures.
     */
    replaceSheetRows(rows) {
      return locked(async () => {
        const current = await all();
        await sweep(new Set(current.filter((r) => r.source === 'sheet').map((r) => r.id)));
        const made = rows.map((r, i) => {
          const row = newRow('sheet');
          row.row = Number.isInteger(r.row) ? r.row : null;
          row.n = Number.isInteger(r.n) && r.n > 0 ? r.n : i + 1;
          fill(row, r);
          return row;
        });
        await saveAll([...made, ...current.filter((r) => r.source !== 'sheet')]);
        return made;
      });
    },

    /**
     * One cell's pictures, in the cell's order: { link, data, fingerprint? }
     * for a picture to keep, or { link, problem: { kind, site, says, noAccess? } }
     * for one that could not be had (noAccess: Google said the account has no
     * access to the file). The cell's earlier pictures go.
     */
    setPictures(id, which, list) {
      return locked(async () => {
        const rows = await all();
        const row = rows.find((r) => r.id === id);
        if (!row) throw new StoreError(404, 'No row has that id.');
        if (!SHOTS.includes(which)) throw new StoreError(400, 'Say which picture this is.');
        for (const item of list) if (item.data) pictureType(which, item.data);
        await dropPictureFiles(row, which);
        const kept = [];
        for (const [i, item] of list.slice(0, MAX_PICTURES_PER_CELL).entries()) {
          if (item.data) kept.push({ link: item.link ?? null, ...(await writePicture(row, which, i, item.data)), ...(item.fingerprint ? { fingerprint: item.fingerprint } : {}) });
          else kept.push({ link: item.link ?? null, problem: { kind: String(item.problem?.kind ?? 'access'), site: item.problem?.site ? String(item.problem.site).slice(0, 200) : null, says: cleanText(item.problem?.says, 500), ...(item.problem?.noAccess ? { noAccess: true } : {}) } });
        }
        row.pictures[which] = kept;
        if (row.seen?.[which]) delete row.seen[which];
        row.updatedAt = new Date().toISOString();
        await saveAll(rows);
        return row;
      });
    },
    setFingerprint(id, which, index, fingerprint) {
      return locked(async () => {
        const rows = await all();
        const pic = rows.find((r) => r.id === id)?.pictures?.[which]?.[index];
        if (!pic?.file) return;
        pic.fingerprint = fingerprint;
        await saveAll(rows);
      });
    },
    pictureFile(row, which, index) {
      const f = row?.pictures?.[which]?.[index]?.file;
      return f ? join(picturesDir, basename(f)) : null;
    },
    /** Where a picture's small picture is kept (made when first asked for). */
    smallFile(row, which, index) {
      return row?.id && SHOTS.includes(which) && Number.isInteger(index) ? join(smallDir, `${row.id}-${which}-${index}.jpg`) : null;
    },
    /** Keeps a small picture, but only while the row still has that same picture (same file, same content). -> where it was kept, or null. */
    saveSmall(id, which, index, made, data) {
      return locked(async () => {
        const now = (await all()).find((r) => r.id === id)?.pictures?.[which]?.[index];
        if (!now?.file || !made?.file || now.file !== made.file || now.sha256 !== made.sha256) return null;
        const path = join(smallDir, `${id}-${which}-${index}.jpg`);
        await writeFile(path, data, { mode: 0o600 });
        return path;
      });
    },

    /** Removes one row, with its pictures and small pictures. Its check results stay. -> the removed row. */
    remove(id) {
      return locked(async () => {
        const rows = await all();
        const row = rows.find((r) => r.id === id);
        if (!row) throw new StoreError(404, 'No row has that id.');
        await saveAll(rows.filter((r) => r.id !== id));
        await sweep(new Set([id]));
        return row;
      });
    },
    /**
     * Removes every row, from the sheet and added by hand, and every row made
     * with the old layout, with their pictures. `expected` is how many rows
     * the person was asked about: when there are more or fewer now, nothing
     * is removed. -> how many were removed.
     */
    removeAll(expected) {
      return locked(async () => {
        const now = (await all()).length + (await oldUsers()).length;
        if (expected !== undefined && expected !== now) {
          throw new StoreError(409, `The number of rows changed since the screen showed it: there ${now === 1 ? 'is now 1 row' : `are now ${now} rows`}. Look at the table again, then press Remove all rows.`);
        }
        await saveAll([]);
        await sweep(null);
        await rm(oldUsersFile, { force: true });
        await sweepOld();
        return now;
      });
    },

    // ---- the uploaded sheet ----

    /** Keeps the uploaded sheet's file and what was read from it. */
    saveSheet(info, data) {
      return locked(async () => {
        const name = `upload.${info.kind === 'csv' ? 'csv' : 'xlsx'}`;
        for (const old of ['upload.csv', 'upload.xlsx']) if (old !== name) await rm(join(sheetDir, old), { force: true });
        await writeFile(join(sheetDir, name), data, { mode: 0o600 });
        const sheet = { ...info, file: name, uploadedAt: new Date().toISOString() };
        await writeJson(join(sheetDir, 'sheet.json'), sheet);
        return sheet;
      });
    },
    async sheet() {
      return readJson(join(sheetDir, 'sheet.json'), null);
    },
    async sheetData() {
      const s = await readJson(join(sheetDir, 'sheet.json'), null);
      if (!s?.file) return null;
      try {
        return await readFile(join(sheetDir, basename(s.file)));
      } catch {
        return null;
      }
    },
    // ---- remembered choices ----

    /** The remembered choice of columns: { [field]: column name }. */
    async columnChoice() {
      const c = (await settings()).columnChoice;
      return c && typeof c === 'object' ? c : null;
    },
    setColumnChoice: (choice) => changeSettings((s) => (s.columnChoice = choice)),
    /** The Google account seen when someone last logged in to Google here: { name, email, at }, or null. Only the name and email, never a password or a cookie. */
    async googleAccount() {
      const g = (await settings()).googleAccount;
      return g && typeof g === 'object' && (g.name || g.email) ? { name: g.name ?? null, email: g.email ?? null, at: g.at ?? null } : null;
    },
    setGoogleAccount: (account) => changeSettings((s) => (s.googleAccount = account ? { name: cleanText(account.name, 120) || null, email: cleanText(account.email, 200) || null, at: account.at ?? new Date().toISOString() } : null)),
    /** The test email address every email goes to (test mode), kept for next time; '' when none is saved. */
    async testEmail() {
      const e = (await settings()).testEmail;
      return typeof e === 'string' ? e : '';
    },
    setTestEmail: (email) => changeSettings((s) => (s.testEmail = cleanText(email, 200))),
    // ---- campaigns ----

    /** Every campaign: { id, brand, name, live, createdAt, updatedAt, products: [{ given, url, asin, read, problem }] }, in the order made. */
    campaigns: () => allCampaigns(),
    async campaign(id) {
      return (await allCampaigns()).find((c) => c.id === id) ?? null;
    },
    /** Keeps a campaign, new or changed (by its id). -> the campaign as kept. */
    saveCampaign(campaign) {
      return changeCampaigns((list) => {
        const at = new Date().toISOString();
        const i = list.findIndex((c) => c.id === campaign.id);
        const kept = { ...campaign, brand: cleanText(campaign.brand, 60), name: cleanText(campaign.name, 80), live: Boolean(campaign.live), createdAt: i >= 0 ? list[i].createdAt : at, updatedAt: at };
        if (i >= 0) list[i] = kept;
        else list.push(kept);
        return kept;
      });
    },
    removeCampaign(id) {
      return changeCampaigns((list) => {
        const i = list.findIndex((c) => c.id === id);
        if (i < 0) throw new StoreError(404, 'No campaign has that id. Reload the page.');
        return list.splice(i, 1)[0];
      });
    },
    /** One product of a campaign as it is now, once read (or not) from Amazon; nothing when the campaign or the product is gone. */
    setCampaignProduct(id, given, product) {
      return changeCampaigns((list) => {
        const c = list.find((x) => x.id === id);
        const i = c ? (c.products ?? []).findIndex((p) => p.given === given) : -1;
        if (i < 0) return null;
        c.products[i] = product;
        return c;
      });
    },

    // ---- checks ----

    checkDir(checkId) {
      if (!CHECK_ID.test(String(checkId))) throw new StoreError(404, 'No check has that id.');
      return join(checksDir, checkId);
    },
    /** Keeps a check's result, and with its row: the Status (its key and its word), the Type, the Note, the review found, and when it was last seen live. */
    saveResult(result) {
      return locked(async () => {
        const dir = join(checksDir, result.checkId);
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await writeJson(join(dir, 'result.json'), result);
        const rows = await all();
        const row = rows.find((r) => r.id === result.rowId);
        if (row) {
          row.last = { checkId: result.checkId, final: result.final ?? null, finalSays: result.finalSays ?? null, status: result.status, type: result.type, typeKey: result.typeKey, note: result.note, at: result.finishedAt, reviewId: result.reviewId ?? null, seconds: Number.isFinite(result.seconds) ? result.seconds : null, ...(result.numbered ? { numbered: true } : {}) };
          if (result.liveAt) row.seenLive = { at: result.liveAt, reviewId: result.reviewId ?? null };
          // What was read from each cell's pictures, so a later check can tell the same picture from one that only looks the same.
          for (const [which, read] of Object.entries(result.seen ?? {})) {
            if (!SHOTS.includes(which) || !read) continue;
            row.seen = row.seen ?? {};
            row.seen[which] = { orderIds: (read.orderIds ?? []).map(String).slice(0, 10), text: String(read.text ?? '').slice(0, 1500) };
          }
          await saveAll(rows);
        }
      });
    },
    /**
     * A row's result as a staff member changed it: the Status (its key and
     * its word), the Type and the Note they chose, kept with when. The last
     * check's own result stays in its folder, and its id stays with the row,
     * so its steps and pictures still show. "Check every row again" passes
     * such a row by; "Check again" replaces it. -> the row as kept.
     */
    setStaffResult(id, { final, status, typeKey, type, note, at = new Date().toISOString() }) {
      return locked(async () => {
        const rows = await all();
        const row = rows.find((r) => r.id === id);
        if (!row) throw new StoreError(404, 'No row has that id.');
        // What the dashboard itself said (never a result staff set): a change means the dashboard was wrong, for the count of right results.
        const was = row.last && !row.last.staff ? dashboardSaid(row.last) : row.last?.staff?.was ?? null;
        row.last = { checkId: row.last?.checkId ?? null, final, finalSays: null, status, type, typeKey, note: cleanText(note, 4000), at, seconds: null, numbered: true, staff: { at, right: false, was } };
        row.updatedAt = at;
        await saveAll(rows);
        return row;
      });
    },
    /**
     * "The result is right": a staff member looked at the dashboard's result
     * and found it right. The result stays as it is, marked checked by staff
     * and right (for the count of right results); checking the row again
     * clears the mark. -> the row as kept.
     */
    markRight(id, { at = new Date().toISOString() } = {}) {
      return locked(async () => {
        const rows = await all();
        const row = rows.find((r) => r.id === id);
        if (!row) throw new StoreError(404, 'No row has that id.');
        if (!row.last || !row.last.final) throw new StoreError(409, 'This row has no result to mark as right. Check it first.');
        if (row.last.staff && !row.last.staff.right) throw new StoreError(409, 'This result was chosen by staff, not by the dashboard, so it cannot be marked as right. Press "Check again" to get the dashboard\'s result first.');
        row.last.staff = { at, right: true, was: dashboardSaid(row.last) };
        row.updatedAt = at;
        await saveAll(rows);
        return row;
      });
    },
    /**
     * "Check every row again": every row's result goes (each check's own
     * folder stays), and a Status the uploaded file gave a row no longer
     * counts as one, so every row is checked again. A result a staff member
     * changed is kept, so that row is passed by; a result only marked right
     * by staff goes like any other (its mark with it). -> how many rows lost
     * their result.
     */
    clearResults() {
      return locked(async () => {
        const rows = await all();
        let n = 0;
        for (const r of rows) {
          if (r.last?.staff && !r.last.staff.right) continue;
          r.last = null;
          r.recheck = true;
          n++;
        }
        await saveAll(rows);
        return n;
      });
    },
    /**
     * An email sent about a row: when, which email (its key and name), its
     * subject, who it went to, whether it went to the test address or the
     * user's own (mode), and maybe: Gmail did not say it was sent, so it may
     * or may not have gone. The last 20 are kept. -> the row as kept.
     */
    recordEmail(id, { at = new Date().toISOString(), key, name, subject, to, mode = 'test', maybe = false }) {
      return locked(async () => {
        const rows = await all();
        const row = rows.find((r) => r.id === id);
        if (!row) throw new StoreError(404, 'No row has that id.');
        row.emails = [...(Array.isArray(row.emails) ? row.emails : []), { at, key: cleanText(key, 60), name: cleanText(name, 120), subject: cleanText(subject, 200), to: cleanText(to, 200), mode: mode === 'real' ? 'real' : 'test', ...(maybe ? { maybe: true } : {}) }].slice(-20);
        row.updatedAt = at;
        await saveAll(rows);
        return row;
      });
    },
    async result(checkId) {
      if (!CHECK_ID.test(String(checkId))) return null;
      return readJson(join(checksDir, checkId, 'result.json'), null);
    },
    /**
     * Rows checked before the three Status words were added get one, once,
     * worked out from each one's kept result: finalOf(result) -> 'pass',
     * 'fail', 'manual' or null. -> how many rows got one.
     */
    fillFinals(finalOf) {
      return locked(async () => {
        const rows = await all();
        let n = 0;
        for (const r of rows) {
          if (!r.last || r.last.final) continue;
          const kept = CHECK_ID.test(String(r.last.checkId)) ? await readJson(join(checksDir, r.last.checkId, 'result.json'), null) : null;
          const final = finalOf({ ...(kept ?? {}), typeKey: r.last.typeKey });
          if (!final) continue;
          r.last.final = final;
          n++;
        }
        if (n) await saveAll(rows);
        return n;
      });
    },
    /**
     * Rows of the sheet uploaded before rows were numbered from 1 get their
     * number, once: their place among the sheet's rows, in the sheet's order
     * (the heading row never counts). -> how many rows got one.
     */
    numberRows() {
      return locked(async () => {
        const rows = await all();
        const sheet = ordered(rows).filter((r) => r.source === 'sheet');
        if (sheet.every((r) => Number.isInteger(r.n))) return 0;
        sheet.forEach((r, i) => (r.n = i + 1));
        await saveAll(rows);
        return sheet.length;
      });
    },
    /** The first check that kept every page in KEPT_PAGES, or null. */
    async keptPages() {
      const ids = (await readdir(checksDir).catch(() => [])).filter((d) => CHECK_ID.test(d)).sort();
      for (const id of ids) {
        const names = await readdir(join(checksDir, id, 'pages')).catch(() => []);
        if (KEPT_PAGES.every((p) => names.includes(`${p}.html`))) return id;
      }
      return null;
    },
  };
}
