// Flipkart's own storage, only in data/flipkart/ (data/ is kept out of git and
// never served as a file): the uploaded file (upload.xlsx or upload.csv), what
// was read from it (rows.json), and the campaigns with what was read from
// their products' Flipkart pages (campaigns.json). Nothing here writes
// anywhere else in data/. Copied from the Amazon store's way of writing
// (amazon/store.js): a file is written whole under another name, then
// renamed, readable only by this computer's user.

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
