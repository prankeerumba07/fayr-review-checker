// The Flipkart screen. The top bar holds the marketplace tabs (bar() below),
// with Flipkart chosen and Amazon one press away. The page: the upload area,
// which looks like the Amazon one ("Choose file", or drop the file anywhere
// on the page: app.js passes it on), for an .xlsx or a .csv file. The local
// server finds what each column holds, as on Amazon; when a needed column
// cannot be found, the same column chooser as on Amazon shows, and "Use these
// columns" sends the same file again with the columns chosen. Once a file is
// in, one slim line says its name, the tab read and how many rows it has,
// with "Replace file", and under it the same lines as on Amazon: which
// columns are used for checking, which are only shown, and what the file does
// not have. Under the upload area, the Campaigns box, the same as the Amazon
// one: each campaign's name, live or ended, and brand, and under each of its
// Flipkart products what was read from Flipkart (its name, its brand, its
// other colours and sizes, and when), or why it is not used. Then the rows,
// in a table like the Amazon one: every column of the file in its order, with
// its letter, the rows numbered from 1, each link as a small label saying
// where it goes ("Google Drive"), a picture in a cell as "Picture in the
// cell", and Status, Type and Note at the end, empty until rows are checked.
// Nothing is checked yet: no Check button and no Status cards, and there are
// no Amazon or Google login lines. The local server reads and keeps the file
// and the campaigns; this screen only shows them.

const BASE = '/local/flipkart';
/** How often the screen looks again while a campaign's products are read from Flipkart. */
const READING_POLL_MS = 2000;

/** The kinds of file the file chooser offers: Excel files (.xlsx) and CSV files. */
export const SHEET_ACCEPT = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const icon = (h, name, extra = '') => h('span', { class: `icon icon-${name}${extra ? ` ${extra}` : ''}`, 'aria-hidden': 'true' });
const pill = (h, text, tone) => h('span', { class: `pill pill-${tone}` }, text);
const rowsWord = (n) => (n === 1 ? '1 row' : `${n} rows`);
const blankCampaign = () => ({ brand: '', name: '', live: true, products: '' });
const freshColumns = () => ({ need: null, mapping: null, error: null });

function initial() {
  return {
    saved: null, // the kept file as the server shows it: { sheet, rows }; uploadAgain: a file kept before its columns were found
    loaded: false,
    loadError: null,
    loadGen: 0,
    // done: what the last upload made ({ made, tab, unplaced }); chooseTab: the tabs to choose from; tab: the tab chosen, sent again with the columns.
    upload: { file: null, gen: 0, busy: false, error: null, dragging: false, done: null, chooseTab: null, tab: null },
    columns: freshColumns(), // shown only when a needed column could not be found
    // list: the campaigns as the server shows them (loaded once the first answer came, loadError when it could not come); reading: products
    // are being read now; editing: null, 'new' or a campaign's key; notice: what was just done (readingNotice: it says products are being
    // read, so it goes when that ends); fold: the box opened or shut by hand (null: open only while there is no campaign).
    campaigns: { list: [], loaded: false, loadError: null, reading: false, gen: 0, editing: null, values: blankCampaign(), busy: false, error: null, notice: null, readingNotice: false, fold: null },
    poll: null,
  };
}

/** The kept file and its rows, from the server: after a reload too. An answer older than an upload since is left. */
async function loadSaved(ctx) {
  const gen = ctx.state.loadGen + 1;
  ctx.update((st) => (st.loadGen = gen));
  try {
    const out = await ctx.local.api('GET', `${BASE}/sheet`);
    if (ctx.state.loadGen !== gen) return;
    ctx.update((st) => Object.assign(st, { saved: out, loaded: true, loadError: null }));
  } catch (err) {
    if (ctx.state.loadGen !== gen) return;
    ctx.update((st) => Object.assign(st, { loaded: true, loadError: err.message }));
  }
}

/** A file chosen, or dropped anywhere on the page, is uploaded at once, with no other button to press. */
async function uploadFile(ctx, file) {
  if (!file) return;
  if (ctx.state.upload.busy) {
    ctx.update((st) => (st.upload.error = `"${st.upload.file?.name || 'The last file'}" is still being uploaded, so wait for it to finish, then upload "${file.name || 'the new file'}" again.`));
    return;
  }
  ctx.update((st) => {
    Object.assign(st.upload, { file, gen: st.upload.gen + 1, error: null, done: null, chooseTab: null, tab: null });
    st.columns = freshColumns();
  });
  return sendFile(ctx);
}

/**
 * Sends the file being uploaded; the server reads it and makes its rows at
 * once. When the file has several tabs and none is named "Flipkart", nothing
 * changed: the tabs show, and pressing one sends the same file again with
 * that tab. When a needed column could not be found, nothing changed either:
 * the column chooser shows, as on Amazon, and "Use these columns" sends the
 * same file again with the columns chosen (and the tab chosen, if one was).
 */
async function sendFile(ctx, { tab = null, mapping = null } = {}) {
  const up = ctx.state.upload;
  const file = up.file;
  if (!file || ((tab !== null || mapping) && up.busy)) return;
  const sentTab = tab ?? up.tab;
  ctx.update((st) => {
    Object.assign(st.upload, { busy: true, error: null, tab: sentTab });
    if (mapping) st.columns.error = null;
  });
  try {
    const fd = new FormData();
    fd.append('file', file, file.name || 'file');
    if (sentTab !== null) fd.append('tab', sentTab);
    if (mapping) fd.append('mapping', JSON.stringify(mapping));
    const out = await ctx.local.form(`${BASE}/sheet`, fd);
    if (out?.chooseTab) {
      ctx.update((st) => Object.assign(st.upload, { busy: false, chooseTab: { says: String(out.chooseTab.says ?? ''), tabs: arr(out.chooseTab.tabs).map(String) } }));
      return;
    }
    if (out?.columns) {
      ctx.update((st) => {
        Object.assign(st.upload, { busy: false, chooseTab: null });
        st.columns = { need: out.columns, mapping: { ...obj(out.columns.mapping) }, error: null };
      });
      return;
    }
    ctx.update((st) => {
      st.upload = { file: null, gen: st.upload.gen + 1, busy: false, error: null, dragging: false, done: { made: Number(out?.made) || 0, tab: out?.tab ?? null, unplaced: arr(out?.unplaced).map(String) }, chooseTab: null, tab: null };
      st.columns = freshColumns();
      // Newer than any answer still on its way.
      Object.assign(st, { saved: { sheet: out?.sheet ?? null, rows: arr(out?.rows) }, loaded: true, loadError: null, loadGen: st.loadGen + 1 });
    });
  } catch (err) {
    ctx.update((st) => {
      st.upload.busy = false;
      // Columns that cannot be used leave the chooser showing, and a tab that cannot be read leaves the tabs showing, to choose again; anything else lets the file go.
      if (mapping) st.columns.error = err.message;
      else if (tab !== null) st.upload.error = err.message;
      else {
        Object.assign(st.upload, { file: null, gen: st.upload.gen + 1, error: err.message, chooseTab: null, tab: null });
        st.columns = freshColumns();
      }
    });
  }
}

function dropFile(ctx, file) {
  return uploadFile(ctx, file);
}

/** A file held over the page lights up the upload area (app.js says when). */
function dragging(ctx, on) {
  if (Boolean(ctx.state.upload.dragging) !== Boolean(on)) ctx.update((st) => (st.upload.dragging = Boolean(on)));
}

/** A column chosen in the column chooser: its number, or null for "Not in this file". */
function setColumn(ctx, key, raw) {
  ctx.update((st) => {
    st.columns.mapping = st.columns.mapping ?? {};
    st.columns.mapping[key] = raw === '' ? null : Number(raw);
  });
}

// ---- the Campaigns box (copied from the Amazon one, views/amazon.js, and changed for Flipkart) ----

/**
 * The campaigns, from the server. An answer older than a change since is
 * left. When the reading ends, a notice saying products are being read goes:
 * each product's own line says how it went.
 */
async function loadCampaigns(ctx) {
  const gen = ctx.state.campaigns.gen + 1;
  ctx.update((st) => (st.campaigns.gen = gen));
  try {
    const out = await ctx.local.api('GET', `${BASE}/campaigns`);
    if (ctx.state.campaigns.gen !== gen) return;
    ctx.update((st) => {
      const c = st.campaigns;
      const ended = c.reading && !out?.reading;
      Object.assign(c, { list: arr(out?.campaigns), reading: Boolean(out?.reading), loaded: true, loadError: null });
      if (ended && c.readingNotice) Object.assign(c, { notice: null, readingNotice: false });
    });
  } catch (err) {
    if (ctx.state.campaigns.gen !== gen) return;
    // Before the first answer, the box says why it is empty; later, the last answer stays until the next look.
    if (!ctx.state.campaigns.loaded) ctx.update((st) => (st.campaigns.loadError = err.message));
  }
}

/** While a campaign's products are read from Flipkart, and once more when that ends, the box shows each one's progress; and it asks again while the campaigns could not be had yet. */
function pollCampaigns(ctx) {
  const c = ctx.state.campaigns;
  if (c.reading || !c.loaded) loadCampaigns(ctx);
}

/** "Add a campaign" (key null) or "Change": the form, filled with the campaign as it is. */
function editCampaign(ctx, key) {
  const c = key ? arr(ctx.state.campaigns.list).find((x) => x?.key === key) : null;
  ctx.update((st) => {
    Object.assign(st.campaigns, { editing: c ? c.key : 'new', values: c ? { brand: c.brand ?? '', name: c.name ?? '', live: c.live !== false, products: arr(c.products).map((p) => p.given).join('\n') } : blankCampaign(), error: null, notice: null });
  });
}

async function saveCampaign(ctx) {
  const c = ctx.state.campaigns;
  if (c.busy || !c.editing) return;
  ctx.update((st) => Object.assign(st.campaigns, { busy: true, error: null, notice: null }));
  try {
    const path = c.editing === 'new' ? `${BASE}/campaigns` : `${BASE}/campaigns/${encodeURIComponent(c.editing)}`;
    const out = await ctx.local.api('POST', path, { ...c.values });
    const reading = Boolean(out?.reading);
    ctx.update((st) => {
      Object.assign(st.campaigns, {
        list: arr(out?.campaigns),
        loaded: true,
        loadError: null,
        reading,
        gen: st.campaigns.gen + 1,
        editing: null,
        values: blankCampaign(),
        busy: false,
        error: null,
        notice: reading ? 'The campaign was saved. Its products are being read from Flipkart in the Live Flipkart Browser, one page at a time.' : 'The campaign was saved.',
        readingNotice: reading,
        // The box stays open, to show the products being read.
        fold: st.campaigns.fold ?? true,
      });
    });
  } catch (err) {
    ctx.update((st) => Object.assign(st.campaigns, { busy: false, error: err.message }));
  }
}

/** "End campaign", "Delete" (asked first) and "Read the products again". */
async function campaignAction(ctx, key, action) {
  const c = ctx.state.campaigns;
  const x = arr(c.list).find((y) => y?.key === key);
  if (!x || c.busy) return;
  if (action === 'delete' && !ctx.confirm(`Delete the campaign "${x.name}"? This cannot be undone.`)) return;
  ctx.update((st) => Object.assign(st.campaigns, { busy: true, error: null, notice: null }));
  try {
    const out = await ctx.local.api('POST', `${BASE}/campaigns/${encodeURIComponent(key)}/${action}`, {});
    ctx.update((st) => {
      Object.assign(st.campaigns, {
        list: arr(out?.campaigns),
        reading: Boolean(out?.reading),
        gen: st.campaigns.gen + 1,
        busy: false,
        notice: { end: `The campaign "${x.name}" has ended. It is no longer used.`, delete: `The campaign "${x.name}" was deleted.`, read: `The products of "${x.name}" are being read from Flipkart again.` }[action],
        readingNotice: action === 'read',
      });
      if (action === 'delete' && st.campaigns.editing === key) Object.assign(st.campaigns, { editing: null, values: blankCampaign() });
    });
  } catch (err) {
    ctx.update((st) => Object.assign(st.campaigns, { busy: false, error: err.message }));
  }
}

function enter(ctx) {
  // The box looks again every 2 seconds, only while products are being read.
  if (!ctx.state.poll && typeof ctx.every === 'function') {
    const stop = ctx.every(READING_POLL_MS, () => pollCampaigns(ctx));
    ctx.update((st) => (st.poll = stop));
  }
  const sheet = loadSaved(ctx);
  loadCampaigns(ctx);
  return sheet;
}

/** A fresh session: what was on its way is left, and the screen loads again when it shows. */
function reset(ctx) {
  if (typeof ctx.state.poll === 'function') ctx.state.poll();
  ctx.update((st) => {
    st.poll = null;
    st.upload = { ...initial().upload, gen: st.upload.gen + 1 };
    st.columns = freshColumns();
    st.loadGen += 1;
    st.campaigns.busy = false;
    st.campaigns.gen += 1;
  });
}

/** The marketplace tabs: Amazon, which opens the Amazon screen, and Flipkart, chosen. */
function marketTabs(ctx) {
  const { h } = ctx;
  return h(
    'div',
    { class: 'fk-market', role: 'tablist', 'aria-label': 'Marketplace', key: 'market', 'data-id': 'market' },
    h('button', { type: 'button', role: 'tab', class: 'fk-market-tab', 'aria-selected': 'false', onclick: () => ctx.go('amazon'), 'data-id': 'market-amazon' }, icon(h, 'bag'), 'Amazon'),
    h('button', { type: 'button', role: 'tab', class: 'fk-market-tab', 'aria-selected': 'true', 'data-id': 'market-flipkart' }, icon(h, 'bag'), 'Flipkart'),
  );
}

function columnLetter(col) {
  let n = col;
  let out = '';
  while (n > 0) {
    out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** The results written in the checked Excel file, and their columns' names. */
const RESULT_WORDS = { status: 'Status', type: 'Type', note: 'Note' };

function whereResultsGo(sheet, mapping) {
  const headers = arr(sheet?.headers);
  const parts = [];
  for (const [key, word] of Object.entries(RESULT_WORDS)) {
    const col = mapping?.[key];
    const name = headers.find((x) => x.col === col)?.text;
    parts.push(Number.isInteger(col) ? `the ${word} goes in the column headed "${name ?? word}"` : `the ${word} goes in a new column headed "${word}"`);
  }
  return `In the checked Excel file, ${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}.${Object.keys(RESULT_WORDS).some((k) => !Number.isInteger(mapping?.[k])) ? ' New columns go after the last one.' : ''}`;
}

/** The column chooser, as on Amazon: shown only when a needed column of the file could not be found. */
function columnChooser(ctx) {
  const { h, words, state } = ctx;
  const up = state.upload;
  const c = state.columns;
  const need = c.need;
  const m = obj(c.mapping);
  return h(
    'div',
    { class: 'fk-columns', key: 'columns', 'data-id': 'columns' },
    words.notice(h, 'warn', need.says),
    h(
      'div',
      { class: 'fk-column-grid' },
      arr(need.fields).map((f) =>
        h(
          'div',
          { class: 'fk-form-field', key: f.key },
          h('label', { for: `fk-col-${f.key}`, class: 'label' }, f.label, f.required ? h('span', { class: 'fk-req' }, ' (required)') : f.review ? h('span', { class: 'fk-req' }, f.key === 'reviewLink' ? ' (or the review screenshot)' : ' (or the review link)') : h('span', { class: 'fk-opt' }, ' (optional)')),
          h(
            'select',
            { id: `fk-col-${f.key}`, 'data-id': `col-${f.key}`, value: m[f.key] === null || m[f.key] === undefined ? '' : String(m[f.key]), disabled: up.busy, onchange: (e) => setColumn(ctx, f.key, e.target.value) },
            h('option', { value: '' }, f.required ? 'Choose a column' : ['status', 'type', 'note'].includes(f.key) ? 'A new column after the last one' : 'Not in this file'),
            arr(need.headers).map((hd) => h('option', { key: `o${hd.col}`, value: String(hd.col) }, `${columnLetter(hd.col)}: ${hd.text}`)),
          ),
        ),
      ),
    ),
    h('p', { class: 'muted small', 'data-id': 'results-go' }, need.kind === 'xlsx' ? whereResultsGo(need, m) : 'This file is not an Excel file, so its results can only be downloaded with "The results only", under Download.'),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-primary', disabled: up.busy, onclick: () => sendFile(ctx, { mapping: c.mapping }), 'data-id': 'use-columns' }, icon(h, 'check'), up.busy ? 'Reading…' : 'Use these columns')),
    words.notice(h, 'error', c.error),
  );
}

/**
 * The upload area. With no file in yet: one clear area where the file is
 * chosen. Once a file is in: one slim line with its name, its tab, how many
 * rows it has, and "Replace file". Whatever stops an upload is said right
 * under it; so are the lines about the file's columns, a picture of the file
 * that was not used, the tabs to choose from, and the column chooser.
 */
function uploadCard(ctx) {
  const { h, words, state } = ctx;
  const up = state.upload;
  const need = state.columns.need;
  const s = state.saved?.sheet ?? null;
  const name = up.file?.name || 'the file';
  // Choosing a file uploads it; the input is made again after each file, so the same file can be chosen again.
  const input = h('input', { key: `fk-file-${up.gen}`, id: 'fk-file', class: 'fk-file-input', type: 'file', accept: SHEET_ACCEPT, 'data-id': 'sheet-file', onchange: (e) => uploadFile(ctx, e.target.files?.[0] ?? null) });
  const asking = Boolean(up.chooseTab && up.file);
  // The file waiting for its columns to be chosen.
  const waiting = Boolean(need && up.file && !up.busy);
  // The file waiting for its tab or its columns can be let go.
  const cancel = (asking || waiting) && !up.busy
    ? h('button', { type: 'button', class: 'btn btn-quiet', key: 'cancel', 'data-id': 'cancel-file', onclick: () => ctx.update((st) => {
      Object.assign(st.upload, { file: null, gen: st.upload.gen + 1, error: null, chooseTab: null, tab: null });
      st.columns = freshColumns();
    }) }, 'Cancel')
    : null;
  const doing = up.busy ? `Uploading "${name}"…` : up.dragging ? 'Drop the file anywhere on this page to upload it.' : null;
  // Which of the file's columns are used for checking, which are only shown, and what the file does not have.
  const about = s && !need && !asking && !up.busy ? arr(s.about) : [];
  const unplaced = arr(up.done?.unplaced);
  const below = [
    words.notice(h, 'error', up.error),
    state.saved?.uploadAgain && !s && !up.file ? h('div', { key: 'again', 'data-id': 'upload-again' }, words.notice(h, 'warn', 'Upload the Flipkart file again. It was uploaded before the dashboard could find what each column holds, so its rows are not shown.')) : null,
    about.length ? h('ul', { class: 'fk-about-file', key: 'about', 'data-id': 'about-file' }, about.map((t, i) => h('li', { key: `a${i}` }, t))) : null,
    unplaced.length ? h('div', { class: 'notice notice-warn', key: 'unplaced', role: 'status', 'data-id': 'unplaced' }, h('ul', { class: 'fk-missing' }, unplaced.map((x, i) => h('li', { key: `u${i}` }, x)))) : null,
    asking
      ? h(
          'div',
          { class: 'fk-choose-tab', key: 'choose-tab', 'data-id': 'choose-tab' },
          words.notice(h, 'warn', up.chooseTab.says),
          h('div', { class: 'actions' }, up.chooseTab.tabs.map((t, i) => h('button', { type: 'button', class: 'btn', key: `tab-${i}`, disabled: up.busy, onclick: () => sendFile(ctx, { tab: t }), 'data-id': `tab-${i}` }, t))),
        )
      : null,
    need ? columnChooser(ctx) : null,
  ];
  if (s) {
    const where = s.kind === 'csv' ? ', a CSV file with no tabs' : `, the ${s.tab} tab`;
    return h(
      'section',
      { class: 'card fk-upload fk-upload-slim', key: 'sheet', 'data-id': 'sheet' },
      h(
        'div',
        { class: `fk-slim${up.dragging ? ' fk-drop-over' : ''}`, 'data-id': 'drop' },
        icon(h, up.busy ? 'spinner' : 'file', up.busy ? 'fk-slim-icon icon-spin' : 'fk-slim-icon'),
        doing
          ? h('p', { class: 'fk-slim-text', key: 'doing', role: 'status', 'data-id': 'upload-doing' }, doing)
          : asking
            ? h('p', { class: 'fk-slim-text', key: 'chosen' }, h('strong', null, name), h('span', { class: 'fk-slim-sub' }, ': choose its tab below.'))
            : waiting
              ? h('p', { class: 'fk-slim-text', key: 'chosen' }, h('strong', null, name), h('span', { class: 'fk-slim-sub' }, ': choose the columns below.'))
              : h('p', { class: 'fk-slim-text', key: 'in', 'data-id': 'sheet-line' }, h('strong', null, s.fileName || 'The file'), h('span', { class: 'fk-slim-sub' }, `${where}: ${rowsWord(Number(s.rowCount) || 0)}.`)),
        up.done && !doing ? h('span', { class: 'pill pill-good', 'data-id': 'upload-done' }, icon(h, 'check'), 'Uploaded') : null,
        h('div', { class: 'fk-slim-actions' }, input, h('label', { for: 'fk-file', class: 'btn', key: 'replace', 'data-id': 'replace-file' }, icon(h, 'refresh'), 'Replace file'), cancel),
      ),
      below,
    );
  }
  return h(
    'section',
    { class: 'card fk-upload', key: 'sheet', 'data-id': 'sheet' },
    h(
      'div',
      { class: `fk-drop${up.dragging ? ' fk-drop-over' : ''}`, 'data-id': 'drop' },
      icon(h, up.busy ? 'spinner' : up.file ? 'file' : 'upload', up.busy ? 'fk-drop-icon icon-spin' : 'fk-drop-icon'),
      h(
        'div',
        { class: 'fk-drop-text' },
        doing
          ? [h('p', { class: 'fk-drop-name', key: 'doing', role: 'status', 'data-id': 'upload-doing' }, doing)]
          : asking
            ? [h('p', { class: 'fk-drop-name', key: 'chosen' }, name), h('p', { class: 'fk-drop-sub', key: 'sub' }, 'Choose its tab below.')]
            : waiting
              ? [h('p', { class: 'fk-drop-name', key: 'chosen' }, name), h('p', { class: 'fk-drop-sub', key: 'sub' }, 'Choose the columns below.')]
              : [h('p', { class: 'fk-drop-name', key: 'none' }, 'Upload the Flipkart file: drop it anywhere on this page, or choose it'), h('p', { class: 'fk-drop-sub', key: 'sub' }, 'An .xlsx or .csv file, up to 50 megabytes. The tab named "Flipkart" is read, or the file\'s only tab. Nothing is checked yet.')],
      ),
      h('div', { class: 'fk-drop-actions' }, input, h('label', { for: 'fk-file', class: 'btn btn-primary', 'data-id': 'choose-file' }, icon(h, 'file'), 'Choose file'), cancel),
    ),
    below,
  );
}

// ---- the table of rows (copied from the Amazon one, views/amazon.js, and changed for Flipkart) ----

const EMPTY = 'Empty';
const emptyCell = (h) => h('span', { class: 'fk-empty-cell' }, EMPTY);

/** One link as a small label saying where it goes; it opens in a new tab, and the mouse resting on it shows the whole link. */
function linkLabel(ctx, x, i, mark = 'link') {
  const { h, words } = ctx;
  const url = words.safeUrl(x?.link);
  const label = x?.label || 'Link';
  if (!url) return h('span', { key: `l${i}`, class: 'fk-link-label fk-nolink', title: String(x?.link ?? '') }, icon(h, mark), label);
  return h('a', { key: `l${i}`, class: 'fk-link-label', href: url, target: '_blank', rel: 'noopener noreferrer', title: url }, icon(h, mark), label);
}

/** A picture or link cell as it is in the file: where each link goes, the words in it, "Empty", and a warning when its words show another link. */
function linkCell(ctx, r, which) {
  const { h } = ctx;
  const s = obj(r?.shots?.[which]);
  const labels = arr(s.labels);
  const mark = which === 'review' ? 'link' : 'image';
  const parts = [];
  if (s.how === 'cell' || s.how === 'floating') parts.push(h('span', { key: 'pic', class: 'fk-link-label fk-nolink' }, icon(h, 'image'), s.how === 'cell' ? 'Picture in the cell' : 'Picture over the cell'));
  labels.forEach((x, i) => parts.push(linkLabel(ctx, x, i, mark)));
  if (labels.length && s.words) parts.push(h('div', { key: 'w', class: 'fk-cell-words' }, s.words));
  if (!parts.length && s.text) parts.push(h('span', { key: 't' }, s.text));
  if (s.mismatch) parts.push(h('div', { key: 'mm', class: 'fk-link-warning', title: 'The link written in this cell is different from the link that opens when you click it. The dashboard checks the link that opens when clicked.' }, icon(h, 'warn'), 'The written link is different'));
  return h('td', { key: which, class: 'fk-link-cell', 'data-cell': which }, parts.length ? parts : emptyCell(h));
}

/** Status, Type and Note: empty until rows are checked, and no Flipkart row is checked yet; a Status, Type or Note the file already has shows as it is. */
function resultCells(ctx, r) {
  const { h } = ctx;
  const p = obj(r?.prev);
  return {
    status: h('td', { key: 'status', class: 'fk-status-cell', 'data-cell': 'status' }, p.status ? [h('span', { key: 's' }, p.status), h('div', { key: 'f', class: 'fk-cell-words' }, 'From the file')] : emptyCell(h)),
    type: h('td', { key: 'type', class: 'fk-type-cell', 'data-cell': 'type' }, p.type ? h('span', { class: 'tag' }, p.type) : emptyCell(h)),
    note: h('td', { key: 'note', class: 'fk-note-cell', 'data-cell': 'note' }, p.note || emptyCell(h)),
  };
}

/** A cell of one of the file's other columns (such as the reviewer's name), as it is in the file: its words, and where each link goes. */
function otherCell(ctx, r, col) {
  const { h } = ctx;
  const v = obj(r?.values?.[col]);
  const labels = arr(v.labels);
  const parts = labels.map((x, i) => linkLabel(ctx, x, i));
  if (labels.length && v.text && !/^\S+$/.test(v.text)) parts.push(h('div', { key: 'w', class: 'fk-cell-words' }, v.text));
  return h('td', { key: `c${col}`, class: 'wrap fk-other-cell' }, parts.length ? parts : v.text || emptyCell(h));
}

/** A column's name with its letter kept small in front ("A: Order ID" to a screen reader). */
const columnHead = (h, c) => (c.letter ? [h('span', { class: 'fk-col-letter', key: 'l' }, c.letter), h('span', { class: 'sr-only', key: 's' }, ': '), c.name] : c.name);

/** One row of the table, its cells in the columns' order. */
function tableRow(ctx, r, columns) {
  const { h } = ctx;
  const plain = (key, v, cls = 'nowrap') => h('td', { key, class: cls }, v || emptyCell(h));
  const results = resultCells(ctx, r);
  const cell = {
    orderId: () => plain('orderId', r?.orderId, 'nowrap fk-strong-cell'),
    orderDate: () => plain('orderDate', r?.orderDate),
    amount: () => plain('amount', r?.amount),
    product: () => plain('product', r?.product, 'wrap fk-product-cell'),
    orderShot: () => linkCell(ctx, r, 'order'),
    deliveryShot: () => linkCell(ctx, r, 'delivery'),
    reviewShot: () => linkCell(ctx, r, 'reviewShot'),
    reviewLink: () => linkCell(ctx, r, 'review'),
    status: () => results.status,
    type: () => results.type,
    note: () => results.note,
  };
  // A column only shown (the reviewer's name, or any other), as it is in the file.
  const cellOf = (c) => (cell[c.key] && c.key !== 'reviewer' ? cell[c.key]() : otherCell(ctx, r, c.col));
  return h('tr', { key: r?.id ?? `n${r?.n}`, 'data-id': `row-${r?.n}` }, h('td', { class: 'nowrap fk-row-cell' }, String(r?.n ?? '')), columns.map(cellOf));
}

/** The table of rows, like the Amazon one: every column of the file in its order, numbered from 1, then Status, Type and Note. */
function rowsCard(ctx) {
  const { h, state } = ctx;
  const sheet = state.saved?.sheet ?? null;
  const rows = arr(state.saved?.rows);
  // While a new file's columns are chosen, its rows are not made yet, and the old file's rows are not shown.
  const waiting = state.columns.need ? state.upload.file?.name || 'the new file' : null;
  let body;
  if (waiting) body = h('p', { class: 'fk-empty-state', 'data-id': 'rows-waiting' }, icon(h, 'table'), `The rows of "${waiting}" show here once its columns are chosen above. Cancel brings back the rows shown before.`);
  else if (!rows.length) body = h('p', { class: 'fk-empty-state', 'data-id': 'no-rows' }, icon(h, 'table'), `This ${sheet?.kind === 'csv' ? 'file' : 'tab'} has column names but no rows under them.`);
  else {
    const columns = arr(sheet?.columns).map((c) => ({ key: c?.key ?? null, col: c?.col ?? null, letter: c?.letter ?? '', name: c?.name ?? '' }));
    // The column names stay in view while the rows scroll under them.
    body = h(
      'div',
      { class: 'table-wrap fk-rows-wrap', 'data-id': 'rows-table' },
      h(
        'table',
        { class: 'fk-rows-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Row'), columns.map((c) => h('th', { scope: 'col', key: c.key ?? `c${c.col}`, 'data-col': c.key ?? 'other' }, columnHead(h, c))))),
        h('tbody', null, rows.map((r) => tableRow(ctx, r, columns))),
      ),
    );
  }
  return h(
    'section',
    { class: 'card fk-rows-card', key: 'rows', 'data-id': 'rows' },
    h('div', { class: 'fk-rows-head' }, h('h2', null, 'Rows'), rows.length && !waiting ? h('span', { class: 'fk-rows-count', 'data-id': 'rows-count' }, rowsWord(rows.length)) : null),
    body,
  );
}

/** Under one product of a campaign: what was read from Flipkart and when, or why it is not used. Copied from the Amazon screen. */
function productSaid(ctx, p) {
  const { h, words } = ctx;
  const read = p.name ? [h('strong', { key: 'name' }, p.name), ` Brand: ${p.brand || 'not shown'}.`] : [];
  const labels = arr(p.variants);
  const more = Math.max(0, (Number(p.variantCount) || 0) - labels.length);
  const variants = labels.length ? ` Other colours and sizes: ${labels.join(', ')}${more ? `, and ${more} more` : ''}.` : more ? ` ${more === 1 ? '1 other colour or size' : `${more} other colours and sizes`} listed.` : ' No other colours or sizes listed.';
  if (p.state === 'reading') return [h('span', { class: 'muted', key: 's' }, 'Reading from Flipkart now…')];
  if (p.state === 'waiting') return [h('span', { class: 'muted', key: 's' }, 'Not read from Flipkart yet.')];
  if (p.state === 'used') return [...read, variants, ` Read on ${words.ist(p.at)}.`];
  return [...read, h('span', { class: 'tone-bad', key: 's' }, ` ${p.says ?? 'This product is not used.'}`)];
}

function campaignBlock(ctx, x, locked) {
  const { h, words } = ctx;
  const again = arr(x.products).some((p) => p?.state === 'stopped' || p?.state === 'not used' || p?.state === 'waiting');
  const button = (id, mark, text, onclick, cls = 'btn btn-small') => h('button', { type: 'button', class: cls, disabled: locked, onclick, 'data-id': `${id}-${x.key}` }, icon(h, mark), text);
  return h(
    'div',
    { class: `fk-campaign${x.live ? '' : ' fk-campaign-ended'}`, key: x.key, 'data-id': `campaign-${x.key}` },
    h(
      'div',
      { class: 'card-head' },
      h('h3', null, `${x.name} `, pill(h, x.live ? 'Live' : 'Ended', x.live ? 'good' : 'quiet'), x.brand ? h('span', { class: 'fk-campaign-brand' }, ` Brand: ${x.brand}`) : null),
      h(
        'div',
        { class: 'actions' },
        button('change', 'edit', 'Change', () => editCampaign(ctx, x.key)),
        x.live ? button('end', 'flag', 'End campaign', () => campaignAction(ctx, x.key, 'end')) : null,
        again ? button('read', 'refresh', 'Read the products again', () => campaignAction(ctx, x.key, 'read')) : null,
        button('delete', 'trash', 'Delete', () => campaignAction(ctx, x.key, 'delete'), 'btn btn-small btn-danger'),
      ),
    ),
    // A campaign saved before campaigns had a brand: it is not used until its brand is added.
    x.brand ? null : words.notice(h, 'warn', 'Add the brand: press Change.'),
    h('ul', { class: 'fk-campaign-products' }, arr(x.products).map((p, i) => h('li', { key: `p${i}`, 'data-id': `product-${x.key}-${i}` }, h('div', { class: 'fk-typed' }, p.given), h('div', { class: 'small' }, productSaid(ctx, p))))),
  );
}

function campaignForm(ctx) {
  const { h, state } = ctx;
  const c = state.campaigns;
  const v = c.values;
  const text = (key, label, placeholder) =>
    h('div', { class: 'fk-form-field', key }, h('label', { class: 'label', for: `fk-campaign-${key}` }, label), h('input', { id: `fk-campaign-${key}`, type: 'text', autocomplete: 'off', placeholder, value: v[key], disabled: c.busy, 'data-id': `campaign-${key}`, oninput: (e) => (v[key] = e.target.value) }));
  return h(
    'div',
    { class: 'fk-campaign-form', 'data-id': 'campaign-form' },
    h('h3', null, c.editing === 'new' ? 'Add a campaign' : 'Change the campaign'),
    h(
      'div',
      { class: 'fk-form-grid' },
      text('brand', 'Brand', 'For example: Koparo'),
      text('name', 'Campaign name', 'For example: Koparo Clean'),
      h(
        'div',
        { class: 'fk-form-field', key: 'live' },
        h('label', { class: 'label', for: 'fk-campaign-live' }, 'Live or ended'),
        h('select', { id: 'fk-campaign-live', value: v.live ? 'live' : 'ended', disabled: c.busy, 'data-id': 'campaign-live', onchange: (e) => (v.live = e.target.value === 'live') }, h('option', { value: 'live', selected: v.live }, 'Live'), h('option', { value: 'ended', selected: !v.live }, 'Ended')),
      ),
    ),
    h(
      'div',
      { class: 'fk-form-field fk-wide' },
      h('label', { class: 'label', for: 'fk-campaign-products' }, 'Products'),
      h('textarea', { id: 'fk-campaign-products', rows: '4', spellcheck: 'false', placeholder: 'One Flipkart link or Flipkart product ID on each line', value: v.products, disabled: c.busy, 'data-id': 'campaign-products', oninput: (e) => (v.products = e.target.value) }),
      h('p', { class: 'fk-note' }, 'A Flipkart link, or a Flipkart product ID (the 16 letters and digits Flipkart gives each product, after "pid=" in a link), one on each line. Users may buy any one of them.'),
    ),
    h(
      'div',
      { class: 'actions' },
      // As on Amazon, Save waits only while rows are checked (no Flipkart row is checked yet); pressed while products are read, it shows the server's sentence.
      h('button', { type: 'button', class: 'btn btn-primary', disabled: c.busy, onclick: () => saveCampaign(ctx), 'data-id': 'save-campaign' }, icon(h, 'check'), c.busy ? 'Saving…' : 'Save'),
      h('button', { type: 'button', class: 'btn btn-quiet', disabled: c.busy, onclick: () => ctx.update((st) => Object.assign(st.campaigns, { editing: null, values: blankCampaign(), error: null })), 'data-id': 'cancel-campaign' }, 'Cancel'),
    ),
  );
}

/** The Campaigns box. It folds shut to save room; folded, its title line still says how many campaigns are live. */
function campaignsCard(ctx) {
  const { h, words, state } = ctx;
  const c = state.campaigns;
  const list = arr(c.list);
  const live = list.filter((x) => x?.live).length;
  const counted = list.length ? [live ? `${live} live` : '', list.length - live ? `${list.length - live} ended` : ''].filter(Boolean).join(', ') : 'None yet';
  // Until the campaigns come from the server, the box says so, rather than "None yet".
  const sum = c.loaded ? counted : c.loadError ? 'Could not be opened' : 'Opening…';
  const reading = c.reading || list.some((x) => arr(x?.products).some((p) => p?.state === 'reading'));
  const open = Boolean(c.editing) || (c.fold ?? (c.loaded ? !list.length : Boolean(c.loadError)));
  const shown = !c.loaded
    ? c.loadError
      ? words.notice(h, 'error', `The campaigns could not be opened: ${c.loadError} The dashboard asks again every 2 seconds.`)
      : h('p', { class: 'muted', 'data-id': 'campaigns-opening' }, 'Opening the campaigns…')
    : list.length
      ? h('div', { class: 'fk-campaigns' }, list.map((x) => campaignBlock(ctx, x, c.busy || reading)))
      : c.editing
        ? null
        : h('p', { class: 'muted', 'data-id': 'no-campaigns' }, 'No campaigns yet. Rows are checked by the product name in the sheet until a campaign has their brand.');
  return h(
    'details',
    {
      class: 'card fk-fold',
      key: 'campaigns',
      'data-id': 'campaigns',
      open,
      ontoggle: (e) => {
        const now = Boolean(e.target?.open);
        if (now !== open && !c.editing) ctx.update((st) => (st.campaigns.fold = now));
      },
    },
    h('summary', { class: 'fk-fold-head' }, icon(h, 'campaign', 'fk-fold-icon'), h('h2', null, 'Campaigns'), h('span', { class: 'fk-fold-sum' }, reading ? `${sum}, reading products from Flipkart…` : sum), icon(h, 'chevron', 'fk-fold-chevron')),
    h(
      'div',
      { class: 'fk-fold-body' },
      h(
        'div',
        { class: 'fk-fold-tools' },
        h('p', { class: 'card-sub' }, 'The Flipkart products users may buy for a brand. A row uses every live campaign whose brand is in its product name, the file\'s name or the tab\'s name; a campaign marked Ended is never used.'),
        c.editing ? null : h('button', { type: 'button', class: 'btn btn-primary', disabled: c.busy || !c.loaded, onclick: () => editCampaign(ctx, null), 'data-id': 'add-campaign' }, icon(h, 'plus'), 'Add a campaign'),
      ),
      c.editing ? campaignForm(ctx) : null,
      shown,
      c.notice ? words.notice(h, 'good', c.notice) : null,
      words.notice(h, 'error', c.error),
    ),
  );
}

function renderScreen(ctx) {
  const { h, words, state } = ctx;
  if (!state.loaded) return h('p', { class: 'muted', key: 'opening', role: 'status', 'data-id': 'opening' }, 'Opening the Flipkart rows…');
  return [uploadCard(ctx), words.notice(h, 'error', state.loadError), campaignsCard(ctx), state.saved?.sheet || state.columns.need ? rowsCard(ctx) : null];
}

export default {
  id: 'flipkart',
  initial,
  enter,
  reset,
  render: renderScreen,
  bar: marketTabs,
  dropFile,
  dragging,
};
