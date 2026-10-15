// The Flipkart screen. The top bar holds the marketplace tabs (bar() below),
// with Flipkart chosen and Amazon one press away, and the Google login: the
// Amazon screen's own, in the Live Amazon Browser, shown the same way (the
// same states, words, buttons and soft box under the bar). Its buttons ask the
// Amazon screen's own routes, so logging in to Google on either screen counts
// for both, and the screenshots on Google Drive are downloaded through that
// login. There is no Amazon login and no Flipkart login here. The page: the upload area,
// which looks like the Amazon one ("Choose file", or drop the file anywhere
// on the page: app.js passes it on), for an .xlsx or a .csv file. The local
// server finds what each column holds, as on Amazon; when a needed column
// cannot be found, the same column chooser as on Amazon shows, and "Use these
// columns" sends the same file again with the columns chosen. Once a file is
// in, one slim line says its name, the tab read and how many rows it has,
// with "Replace file", and under it the same lines as on Amazon: which
// columns are used for checking, which are only shown, what the file does
// not have, and which campaign the rows use (the line changes as soon as a
// campaign is saved, ended or deleted). Under the upload area, the Campaigns box, the same as the Amazon
// one: each campaign's name, live or ended, and brand, with the day it started
// (Flipkart's own: asked for, day first, when a campaign is added or
// changed), and under each of its
// Flipkart products what was read from Flipkart (its name, its brand, its
// other colours and sizes, and when), or why it is not used. Then, as on
// Amazon, "Start checking" (later "Carry on checking"), which checks the rows
// one by one from the first one with no result yet (a row the uploaded file
// already gives a Status is passed by), with Stop and "Check every row
// again"; while they are checked, the live checking area beside the table
// shows the row being checked and its steps as they run. Then the rows,
// in a table like the Amazon one: every column of the file in its order, with
// its letter, the rows numbered from 1, each link as a small label saying
// where it goes ("Google Drive"), a picture in a cell as "Picture in the
// cell", and Status, Type and Note at the end, as on Amazon: the Status bold
// and in its colour (green Pass, red Fail, orange Needs Manual Staff
// Checking), with when the row was checked and how long it took, or "From the
// file" for one the uploaded file already had, the Type as a small tag, and
// the Note; "Checking…" for the row being checked. Each row has a Check
// button at its end ("Check again" once it is checked), and clicking a row
// opens its page, as on Amazon: its Status at the top, large, with its
// reason, the Type and the Note, the row's details, with its screenshots as
// small pictures that open large when clicked (or why one could not be had,
// in the Amazon words), what was read from each screenshot and found on
// Flipkart, and a check's ten steps (the Amazon check's, duplicates first), shown live as each one runs and still
// shown after a reload. A row's Status shows in the table and on its page as
// soon as its check finishes. As on Amazon, above the table: the four Status
// cards (Pass, Fail, Needs Manual Staff Checking and Not checked yet, each
// with how many rows, changing as each row's check finishes), which show only
// those rows when pressed and every row when pressed again; beside the rows'
// heading, the Status box and the Type box, with "Show every row" and how
// many rows are shown; and the line that says how often staff found the
// dashboard right. On a row's page, as on Amazon, "Change the result" (the
// Status, the Type and the Note, then Save: "Changed by staff") and "The
// result is right" ("Marked right by staff"), each with when; "Check again"
// replaces a staff result, after asking. "Prepare email" opens the Amazon
// screen's email box for the row: who the email is to (the reviewer's name,
// and the email address when the file has an email address column), its
// subject and its message, filled in for the row as on Amazon, which can be
// changed, each with a Copy button, and the row's screenshots as small
// pictures, each with "Copy picture" (to paste into an email in Gmail or
// Outlook) and "Save" (a file to attach). Unlike Amazon, nothing is ever sent
// from here (no Send button, no Test or Real choice, no Gmail), and the box
// says so. Beside "Check every row again", the Amazon screen's Download button:
// "The checked Excel file" and "The results only". The local server reads
// and keeps the file and the campaigns, and runs the checks and the Google
// login; this screen only shows them.

const BASE = '/local/flipkart';
const ROWS = `${BASE}/rows`;
/** The Google login's buttons are the Amazon screen's own routes: it is the same login. */
const GOOGLE_BUTTONS_BASE = '/local/amazon';
/** How often the screen looks again while a campaign's products are read from Flipkart, and how often the top bar asks the server about the Google login. */
const READING_POLL_MS = 2000;
export const LOGIN_POLL_MS = READING_POLL_MS;

/**
 * The Google login's words in the top bar, one state at a time: the Amazon
 * screen's own (views/amazon.js), since it is the same login, in the Live
 * Amazon Browser. The screenshots on Google Drive are downloaded through this
 * login.
 */
export const GOOGLE_WORDS = {
  checking: 'Checking the Google login…',
  in: (name) => (name ? `Logged in to Google as ${name}` : 'Logged in to Google'),
  out: 'Not logged in to Google',
  outButton: 'Log in to Google',
  outHow: "Google's login page opens in the Live Amazon Browser window, for you to log in there by hand. The screenshots on Google Drive are downloaded through that login.",
  waiting: 'Log in to Google in the Live Amazon Browser window. This tool never types, stores or reads a password; Chrome keeps the login, so it stays after a restart.',
  waitingChrome: 'Log in to Google in the normal Chrome window that just opened (it uses the same saved profile, so the login is kept), then press "I have logged in".',
  waitingShort: 'Waiting for you to log in to Google',
  doneButton: 'I have logged in',
  problemShort: 'The Google login could not be checked',
  problemButton: 'Check the Google login again',
  chromeButton: 'Log in to Google in a normal Chrome window',
  chromeHow: "For when Google will not let you log in inside the Live Amazon Browser window: the dashboard closes that window, opens a normal Chrome window with the same saved profile on Google's login page, and you log in there.",
  chromeOffer: 'If Google will not let you log in there, use a normal Chrome window instead:',
};

/** A check's steps: the Amazon check's, in the same order, changed to the Flipkart way of checking (flipkart/check.js). */
export const STEP_NAMES = [
  'Duplicates and links in the sheet',
  'Opening the purchase screenshot',
  'Reading the purchase screenshot and comparing it with the sheet',
  'Opening the delivery screenshot',
  'Reading the delivery screenshot and comparing it',
  'Opening the review screenshot',
  "Reading the reviewer's name and the review's words",
  "Finding the review among Flipkart's public reviews",
  "Comparing the reviewer's name and the review's words",
  'Status, Type and Note',
];
/** Each step's mark and words: the Amazon screen's, and one more for a step that comes in a later step. */
export const MARKS = {
  pass: { mark: '✓', label: 'passed', tone: 'good' },
  fail: { mark: '✗', label: 'failed', tone: 'bad' },
  'not-reached': { mark: '–', label: 'not reached', tone: 'quiet' },
  'not-needed': { mark: '○', label: 'not needed', tone: 'quiet' },
  running: { mark: '…', label: 'running', tone: 'info' },
  waiting: { mark: '·', label: 'waiting', tone: 'quiet' },
  later: { mark: '–', label: 'comes in a later step', tone: 'quiet' },
};
/** The three Statuses, as on Amazon, with their icons; a row with none is "Not checked yet". */
export const FINAL_WORDS = { pass: 'Pass', fail: 'Fail', manual: 'Needs Manual Staff Checking' };
export const FINAL_NONE = 'Not checked yet';
const FINAL_ICON = { pass: 'pass', fail: 'fail', manual: 'manual', none: 'clock' };
/** No Status and no Type chosen: every row shows. Copied from the Amazon screen. */
const noFilter = () => ({ final: '', type: '' });
const PICTURE_KEYS = ['order', 'delivery', 'review', 'reviewShot'];
const WHAT = { order: 'Purchase screenshot', delivery: 'Delivery screenshot', review: 'Review screenshot', reviewShot: 'Review screenshot' };
/** The file's column each picture cell is. */
const CELL_COLUMN = { order: 'orderShot', delivery: 'deliveryShot', review: 'reviewLink', reviewShot: 'reviewShot' };
const freshSteps = () => STEP_NAMES.map((name, i) => ({ n: i + 1, name, state: 'waiting', detail: null }));
const newView = () => ({ steps: freshSteps(), action: null, result: null, done: false, failed: null, paused: null });

/** The kinds of file the file chooser offers: Excel files (.xlsx) and CSV files. */
export const SHEET_ACCEPT = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const icon = (h, name, extra = '') => h('span', { class: `icon icon-${name}${extra ? ` ${extra}` : ''}`, 'aria-hidden': 'true' });
const pill = (h, text, tone) => h('span', { class: `pill pill-${tone}` }, text);
const rowsWord = (n) => (n === 1 ? '1 row' : `${n} rows`);
const blankCampaign = () => ({ brand: '', name: '', live: true, startDate: '', products: '' });
/** A day as the dashboard writes it, the day first: 01-10-2026. */
const dayFirst = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? '')) ? String(iso).split('-').reverse().join('-') : '');
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
    // The Google login, as the server says it (data.google); error: a button's; lost: the server could not be asked; seq: newer answers win.
    account: { data: null, error: null, lost: null, busy: false, seq: 0 },
    open: null, // the row whose page is open: { id, loading, error, row, result }
    check: null, // the row being checked: { rowId, running, controller, view, notice }
    all: null, // the rows being checked one by one: { running, controller, current, view, paused, summary, notice }
    filter: noFilter(), // the Status and the Type the table shows, as on Amazon: '' for every one
    notice: null, // what was just done on a row's page: { tone, text, route }
    rowsNotice: null, // above the table: { tone, text }
    marking: false, // "The result is right" being saved
    edit: null, // "Change the result" on a row's page: { rowId, final, typeKey, note, busy, error }
    email: null, // "Prepare email" on a row's page: { rowId, route, loading, error, item, copied, copyError }; nothing is ever sent
    excel: { busy: false, error: null }, // "The checked Excel file" being prepared, under Download
    thumbs: {}, // `${id}:${which}:${i}:${at}` -> object URL
    big: null, // the picture opened large: { title, url, loading, error }
    seq: { open: 0, big: 0, thumbs: 0 },
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
      // The checking area of the rows before goes with them, as on Amazon.
      if (st.all && !st.all.running) st.all = null;
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
    Object.assign(st.campaigns, { editing: c ? c.key : 'new', values: c ? { brand: c.brand ?? '', name: c.name ?? '', live: c.live !== false, startDate: dayFirst(c.startDate), products: arr(c.products).map((p) => p.given).join('\n') } : blankCampaign(), error: null, notice: null });
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
    // The line under the upload line says which campaign the rows use now.
    loadSaved(ctx);
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
    if (action !== 'read') loadSaved(ctx);
  } catch (err) {
    ctx.update((st) => Object.assign(st.campaigns, { busy: false, error: err.message }));
  }
}

// ---- the Google login in the top bar (copied from the Amazon screen, views/amazon.js: the same login) ----

async function loadAccount(ctx) {
  const n = ++ctx.state.account.seq;
  try {
    const data = await ctx.local.api('GET', `${BASE}/account`);
    if (n !== ctx.state.account.seq) return;
    ctx.update((st) => {
      // A button's message goes once the login moves on.
      if (st.account.data?.google?.state !== data?.google?.state) st.account.error = null;
      Object.assign(st.account, { data, lost: null });
    });
  } catch (err) {
    if (n !== ctx.state.account.seq) return;
    ctx.update((st) => Object.assign(st.account, { lost: err.message }));
  }
}

/** One of the Google login's buttons ('google/…'): the Amazon screen's own route does it, exactly as there, and the top bar follows it. Only the Google login of its answer is kept. */
async function startLogin(ctx, what) {
  if (ctx.state.account.busy) return;
  ctx.update((st) => Object.assign(st.account, { busy: true, error: null }));
  try {
    const data = await ctx.local.api('POST', `${GOOGLE_BUTTONS_BASE}/${what}`, {});
    // An answer to an earlier question must not draw over this one.
    ctx.state.account.seq++;
    ctx.update((st) => Object.assign(st.account, { busy: false, data: { google: data?.google ?? null } }));
  } catch (err) {
    ctx.update((st) => Object.assign(st.account, { busy: false, error: err.message }));
  }
}

function enter(ctx) {
  const s = ctx.state;
  const here = ctx.route || '';
  // As on Amazon: a message belongs to the page it was given on, and goes when you open another page; so do the form to change a result and the email box.
  if (s.notice?.route !== undefined && s.notice.route !== here) s.notice = null;
  if (here) s.rowsNotice = null;
  if (s.edit && s.edit.rowId !== here) s.edit = null;
  if (s.email && s.email.route !== here) s.email = null;
  // Every 2 seconds the top bar asks about the Google login, and the Campaigns box looks again while products are being read.
  if (!ctx.state.poll && typeof ctx.every === 'function') {
    const stop = ctx.every(READING_POLL_MS, () => {
      pollCampaigns(ctx);
      loadAccount(ctx);
    });
    ctx.update((st) => (st.poll = stop));
  }
  const sheet = loadSaved(ctx);
  loadCampaigns(ctx);
  loadAccount(ctx);
  // #/flipkart/<row's id> is that row's page.
  const id = ctx.route;
  if (id && ctx.state.open?.id !== id) openRow(ctx, id);
  else if (!id && ctx.state.open) closeRow(ctx);
  return sheet;
}

/** A fresh session: what was on its way is left, and the screen loads again when it shows. */
function reset(ctx) {
  if (typeof ctx.state.poll === 'function') ctx.state.poll();
  ctx.state.check?.controller?.abort();
  ctx.state.all?.controller?.abort();
  for (const url of Object.values(ctx.state.thumbs)) ctx.local.revoke(url);
  if (ctx.state.big?.url) ctx.local.revoke(ctx.state.big.url);
  ctx.update((st) => {
    st.check = null;
    st.all = null;
    st.thumbs = {};
    st.big = null;
    if (st.open) st.open.loading = false;
    for (const k of Object.keys(st.seq)) st.seq[k] += 1;
    st.poll = null;
    st.upload = { ...initial().upload, gen: st.upload.gen + 1 };
    st.columns = freshColumns();
    st.loadGen += 1;
    st.campaigns.busy = false;
    st.campaigns.gen += 1;
    st.account.busy = false;
    st.account.seq += 1;
    st.excel.busy = false;
    if (st.email) st.email.loading = false;
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

/**
 * The Google login in the top bar, the same as on the Amazon screen: one
 * state at a time, its button when one is needed, and what to do in a soft
 * box under the bar. The screenshots on Google Drive are downloaded through
 * this login. When Google will not let anyone log in inside the Live Amazon
 * Browser window, a normal Chrome window on the same saved profile is
 * offered. A button's refusal, or a server that cannot be asked, is said
 * under the bar too, as the Amazon login line says it.
 */
function googleBar(ctx) {
  const { h, words, state } = ctx;
  const a = state.account;
  const d = obj(obj(a.data).google);
  const kind = ['in', 'out', 'waiting', 'problem'].includes(d.state) ? d.state : 'checking';
  const button = (label, what, title = null, cls = 'btn btn-primary btn-small') => h('button', { type: 'button', class: cls, title, disabled: a.busy, onclick: () => startLogin(ctx, what), 'data-id': what.replace('/', '-') }, icon(h, 'login'), label);
  const [mark, text] = { in: ['pass', GOOGLE_WORDS.in(d.name)], out: ['user', GOOGLE_WORDS.out], waiting: ['spinner', GOOGLE_WORDS.waitingShort], problem: ['warn', GOOGLE_WORDS.problemShort], checking: ['spinner', GOOGLE_WORDS.checking] }[kind];
  const help = kind === 'waiting' ? (d.chrome ? GOOGLE_WORDS.waitingChrome : GOOGLE_WORDS.waiting) : kind === 'problem' ? d.says : null;
  const chrome = () => button(GOOGLE_WORDS.chromeButton, 'google/log-in-in-chrome', GOOGLE_WORDS.chromeHow, 'btn btn-quiet btn-small');
  // While Google's login page shows in the window, the normal Chrome window is offered under the bar, for when Google will not allow the login there.
  const offer = kind === 'waiting' && !d.chrome ? h('p', { class: 'fk-bar-offer' }, GOOGLE_WORDS.chromeOffer, ' ', chrome()) : null;
  const problem = a.error ?? a.lost;
  return [
    h(
      'div',
      // While checking, the line has the plain look (the Amazon screen's checking class has no look of its own either).
      { class: kind === 'checking' ? 'fk-account' : `fk-account fk-account-${kind}`, key: 'google-account', 'data-id': 'google-account' },
      h('p', { class: 'fk-account-line', role: kind === 'in' ? null : 'status', 'data-id': 'google-line' }, icon(h, mark, mark === 'spinner' ? 'icon-spin' : ''), text),
      kind === 'out' ? button(GOOGLE_WORDS.outButton, 'google/log-in', GOOGLE_WORDS.outHow) : null,
      kind === 'problem' ? [button(GOOGLE_WORDS.problemButton, 'google/check-login'), chrome()] : null,
      kind === 'waiting' && d.chrome ? button(GOOGLE_WORDS.doneButton, 'google/logged-in') : null,
    ),
    help || problem ? h('div', { class: 'fk-bar-help', key: 'google-help', 'data-id': 'google-help' }, help ? words.notice(h, kind === 'problem' ? 'warn' : 'info', help) : null, offer, words.notice(h, 'error', problem)) : null,
  ];
}

/** What the top bar shows for this screen, after the dashboard's name: the marketplace tabs and the Google login line, then what to do under the bar. */
function renderBar(ctx) {
  return [marketTabs(ctx), ...googleBar(ctx)];
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
              : [h('p', { class: 'fk-drop-name', key: 'none' }, 'Upload the Flipkart file: drop it anywhere on this page, or choose it'), h('p', { class: 'fk-drop-sub', key: 'sub' }, 'An .xlsx or .csv file, up to 50 megabytes. The tab named "Flipkart" is read, or the file\'s only tab.')],
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

/** "took 12 seconds", "took 1 minute 5 seconds": how long a check took, as on Amazon. */
export function tookWords(seconds) {
  const n = Math.max(0, Math.round(Number(seconds) || 0));
  if (n < 1) return 'took less than a second';
  const part = (x, one) => `${x} ${one}${x === 1 ? '' : 's'}`;
  if (n < 60) return `took ${part(n, 'second')}`;
  return `took ${part(Math.floor(n / 60), 'minute')}${n % 60 ? ` ${part(n % 60, 'second')}` : ''}`;
}

/**
 * What a row shows, as on Amazon: its last check's Status, Type and Note;
 * else the ones already in the file ("From the file"); else nothing. final is
 * the Status's key: 'pass', 'fail', 'manual' or null; status is its word:
 * Pass, Fail or Needs Manual Staff Checking.
 */
function resultOf(r, state) {
  if (state && r?.id && rowBeingChecked(state) === r.id) return { status: 'Checking…', type: '', note: '', from: 'now', final: null };
  if (r?.last && FINAL_WORDS[r.last.final]) return { status: FINAL_WORDS[r.last.final], type: r.last.type ?? '', note: r.last.note ?? '', from: 'check', final: r.last.final, finalSays: r.last.finalSays ?? null, staff: r.last.staff ?? null };
  // After "Check every row again", the file's Status, Type and Note no longer show, as on Amazon.
  const p = r?.recheck ? {} : obj(r?.prev);
  const f = FINAL_WORDS[r?.prevFinal] ? r.prevFinal : null;
  if (p.status || p.type || p.note) return { status: FINAL_WORDS[f] ?? '', type: p.type ?? '', note: p.note ?? '', from: 'file', final: f };
  return { status: '', type: '', note: '', from: null, final: null };
}

/** A Status as a bold label in its colour, with its icon and its word, as on Amazon: green Pass, red Fail, orange Needs Manual Staff Checking. */
function finalPill(h, final, id) {
  return FINAL_WORDS[final] ? h('span', { class: `fk-final fk-final-${final}`, 'data-id': id }, icon(h, FINAL_ICON[final]), FINAL_WORDS[final]) : null;
}

/** The label of a row being checked at this moment. */
const checkingLabel = (h) => h('span', { class: 'fk-final fk-final-checking' }, icon(h, 'spinner', 'icon-spin'), 'Checking…');

/**
 * Status, Type and Note, as on Amazon. The Status is the clearest thing in
 * the row: Pass, Fail or Needs Manual Staff Checking, bold and in its colour,
 * with when it was checked and how long it took, or when a staff member
 * changed it or marked it right, or "From the file" for a Status the uploaded
 * file already had. The Type is a small soft tag.
 */
function resultCells(ctx, r) {
  const { h, words, state } = ctx;
  const res = resultOf(r, state);
  const tag = (type) => (type ? h('span', { class: 'tag' }, type) : emptyCell(h));
  const cells = (status, type, note) => ({
    status: h('td', { key: 'status', class: 'fk-status-cell', 'data-cell': 'status' }, status),
    type: h('td', { key: 'type', class: 'fk-type-cell', 'data-cell': 'type' }, type),
    note: h('td', { key: 'note', class: 'fk-note-cell', 'data-cell': 'note' }, note),
  });
  if (res.from === 'now') return cells(checkingLabel(h), null, null);
  if (res.from === 'check') {
    const staff = res.staff;
    return cells(
      [
        finalPill(h, res.final, `final-${r.id}`),
        // A result a staff member changed by hand, or marked right, says so, with when; a check's says when and how long it took, as on Amazon.
        staff ? h('div', { key: 'staff', class: 'fk-cell-words fk-staff-line', 'data-id': `staff-${r.id}` }, icon(h, staff.right ? 'check' : 'user'), `${staff.right ? 'Marked right' : 'Changed'} by staff on ${words.ist(staff.at)}`) : r?.last?.at ? h('div', { key: 'at', class: 'fk-cell-words' }, words.ist(r.last.at)) : null,
        (!staff || staff.right) && Number.isFinite(r?.last?.seconds) ? h('div', { key: 'took', class: 'fk-cell-words', 'data-id': `took-${r.id}` }, tookWords(r.last.seconds)) : null,
      ],
      tag(res.type),
      res.note || emptyCell(h),
    );
  }
  // A Status, Type or Note the file already has.
  return cells(res.from === 'file' && FINAL_WORDS[res.final] ? [finalPill(h, res.final, `final-${r.id}`), h('div', { key: 'f', class: 'fk-cell-words' }, 'From the file')] : emptyCell(h), tag(res.type), res.note || emptyCell(h));
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

/** One row of the table, its cells in the columns' order, and its Check button; clicking it opens its page. */
function tableRow(ctx, r, columns) {
  const { h, state } = ctx;
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
  const go = (e) => {
    e?.stopPropagation?.();
    ctx.go(`flipkart/${r.id}`);
  };
  const done = isDone(r);
  return h(
    'tr',
    // The row being checked, while the rows are checked one by one, stands out, as on Amazon.
    { key: r?.id ?? `n${r?.n}`, class: `clickable${state.all?.running && rowBeingChecked(state) === r?.id ? ' fk-current-row' : ''}`, onclick: () => ctx.go(`flipkart/${r.id}`), 'data-id': `row-${r?.n}` },
    h('td', { class: 'nowrap fk-row-cell' }, h('button', { type: 'button', class: 'linkish', onclick: go }, String(r?.n ?? ''))),
    columns.map(cellOf),
    h('td', { class: 'nowrap' }, h('button', { type: 'button', class: 'btn btn-small', disabled: busy(state), onclick: (e) => { go(e); startCheck(ctx, r.id); }, 'data-id': `check-${r?.id}` }, icon(h, done ? 'refresh' : 'play'), done ? 'Check again' : 'Check')),
  );
}

// ---- the Status cards, the filter and staff results (copied from the Amazon screen) ----

const sameWord = (x, y) => String(x ?? '').trim().toLowerCase() === String(y ?? '').trim().toLowerCase();
/** A result a staff member changed by hand (kept by "Check every row again"); one only marked right by staff is not one. */
const changedByStaff = (r) => Boolean(r?.last?.staff && !r.last.staff.right);
/** A result a staff member marked right ("The result is right"); checking the row again clears the mark. */
const markedRight = (r) => Boolean(r?.last?.staff?.right);
/** The key of a Type word, from the server's list; '' when it is not one of them. */
const typeKeyOfWord = (types, word) => arr(types).find((t) => sameWord(t?.word, word))?.key ?? '';

/** How many rows have each Status, and how many are not checked yet. */
function finalCounts(rows) {
  const n = { pass: 0, fail: 0, manual: 0, none: 0 };
  for (const r of rows) {
    const f = isDone(r) ? resultOf(r, null).final : null;
    n[FINAL_WORDS[f] ? f : 'none']++;
  }
  return n;
}

/**
 * The four Status cards, each with its number, as on Amazon. They are the
 * Status filter: pressing one shows only those rows, and pressing it again
 * shows every row.
 */
function finalCards(ctx, rows) {
  const { h, state } = ctx;
  const n = finalCounts(rows);
  const card = (key, text) => {
    const on = state.filter.final === key;
    return h(
      'button',
      { type: 'button', class: `fk-final-card fk-final-card-${key}`, key, 'aria-pressed': on ? 'true' : 'false', onclick: () => ctx.update((st) => (st.filter = { ...noFilter(), final: st.filter.final === key ? '' : key })), 'data-id': `count-${key}` },
      h('span', { class: 'fk-final-card-label' }, icon(h, FINAL_ICON[key]), h('span', { 'data-id': `count-${key}-word` }, text)),
      h('span', { class: 'fk-final-card-num', 'data-id': `count-${key}-num` }, String(n[key])),
    );
  };
  return h('div', { class: 'fk-final-cards', role: 'group', 'aria-label': 'Status. Press one to show only those rows.', 'data-id': 'counts' }, card('pass', FINAL_WORDS.pass), card('fail', FINAL_WORDS.fail), card('manual', FINAL_WORDS.manual), card('none', FINAL_NONE));
}

/**
 * Every Type, in the Amazon screen's order, each with how many rows have it
 * (0 too) among the rows of the Status chosen (every row when none is
 * chosen); then any other Type the rows have. A Type's word counts as the
 * same whatever its capitals or spaces. -> [{ word, count }]
 */
export function typeCounts(rows, types, final = '') {
  const counts = new Map();
  for (const r of rows) {
    if (!isDone(r) || !passesFilter(r, { final, type: '' })) continue;
    const res = resultOf(r, null);
    if (!res.type) continue;
    const word = arr(types).find((t) => sameWord(t?.word, res.type))?.word ?? res.type.trim();
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const listed = arr(types).map((t) => ({ word: t.word, count: counts.get(t.word) ?? 0 }));
  const others = [...counts]
    .filter(([word]) => !arr(types).some((t) => sameWord(t?.word, word)))
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => a.word.localeCompare(b.word));
  return [...listed, ...others];
}

/**
 * The Status box and the Type box beside the rows' heading, as on Amazon.
 * The Status box lists every Status with how many rows, and choosing one is
 * the same as pressing its Status card (the box and the cards always show
 * the same choice); the Type box always lists every Type, each with how many
 * rows of that Status have it.
 */
function filters(ctx, rows = []) {
  const { h, state } = ctx;
  const f = state.filter;
  const n = finalCounts(rows);
  const list = typeCounts(rows, state.saved?.types, f.final);
  // A Type chosen before that is no longer listed stays, so the choice is still visible.
  if (f.type && !list.some((t) => sameWord(t.word, f.type))) list.push({ word: f.type, count: 0 });
  return h(
    'div',
    { class: 'fk-filters', 'data-id': 'filters' },
    h(
      'label',
      { class: 'fk-filter', for: 'fk-filter-final' },
      h('span', { class: 'fk-filter-word' }, 'Status'),
      h(
        'select',
        { id: 'fk-filter-final', 'data-id': 'filter-final', value: f.final, onchange: (e) => ctx.update((st) => (st.filter = { ...noFilter(), final: e.target.value })) },
        h('option', { value: '' }, `Every Status (${rows.length})`),
        ['pass', 'fail', 'manual', 'none'].map((k) => h('option', { key: `s-${k}`, value: k }, `${k === 'none' ? FINAL_NONE : FINAL_WORDS[k]} (${n[k]})`)),
      ),
    ),
    h(
      'label',
      { class: 'fk-filter', for: 'fk-filter-type' },
      h('span', { class: 'fk-filter-word' }, 'Type'),
      h('select', { id: 'fk-filter-type', 'data-id': 'filter-type', value: f.type, onchange: (e) => ctx.update((st) => (st.filter.type = e.target.value)) }, h('option', { value: '' }, 'Every Type'), list.map((t) => h('option', { key: `t-${t.word}`, value: t.word }, `${t.word} (${t.count})`))),
    ),
    f.final || f.type ? h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => ctx.update((st) => (st.filter = noFilter())), 'data-id': 'filter-clear' }, icon(h, 'close'), 'Show every row') : null,
  );
}

/** A row the Status and the Type chosen show, as on Amazon. */
function passesFilter(r, f) {
  const res = resultOf(r, null);
  const has = isDone(r);
  if (f.final && (f.final === 'none' ? has && FINAL_WORDS[res.final] : !has || res.final !== f.final)) return false;
  if (f.type && !(has && sameWord(f.type, res.type))) return false;
  return true;
}

/**
 * "Staff checked 12 results: 10 right (83%). Pass: 5 checked, 5 right
 * (100%). …": the rows a staff member marked right or changed by hand, by
 * the Status the dashboard itself gave them. Copied from the Amazon screen.
 */
export function staffStatsLine(rows) {
  const marked = arr(rows).filter((r) => r?.last?.staff?.was);
  if (!marked.length) return 'Staff checked no results yet. On a row\'s page, "The result is right" or "Change the result" counts one.';
  const pct = (right, n) => `${Math.round((right / n) * 100)}%`;
  const part = (list) => {
    const right = list.filter(markedRight).length;
    return `${list.length} checked, ${right} right (${pct(right, list.length)})`;
  };
  const right = marked.filter(markedRight).length;
  const out = [`Staff checked ${marked.length === 1 ? '1 result' : `${marked.length} results`}: ${right} right (${pct(right, marked.length)}).`];
  for (const k of ['pass', 'fail', 'manual']) {
    const list = marked.filter((r) => r.last.staff.was.final === k);
    if (list.length) out.push(`${FINAL_WORDS[k]}: ${part(list)}.`);
  }
  return out.join(' ');
}

/** The table of rows, like the Amazon one: every column of the file in its order, numbered from 1, then Status, Type and Note, the rows the Status and the Type chosen show; the live checking area beside it while the rows are checked one by one. */
function rowsCard(ctx) {
  const { h, words, state } = ctx;
  const sheet = state.saved?.sheet ?? null;
  const rows = arr(state.saved?.rows);
  const shown = rows.filter((r) => passesFilter(r, state.filter));
  // While a new file's columns are chosen, its rows are not made yet, and the old file's rows are not shown.
  const waiting = state.columns.need ? state.upload.file?.name || 'the new file' : null;
  let body;
  if (waiting) body = h('p', { class: 'fk-empty-state', 'data-id': 'rows-waiting' }, icon(h, 'table'), `The rows of "${waiting}" show here once its columns are chosen above. Cancel brings back the rows shown before.`);
  else if (!rows.length) body = h('p', { class: 'fk-empty-state', 'data-id': 'no-rows' }, icon(h, 'table'), `This ${sheet?.kind === 'csv' ? 'file' : 'tab'} has column names but no rows under them.`);
  else if (!shown.length) body = h('p', { class: 'fk-empty-state', 'data-id': 'no-match' }, icon(h, 'table'), 'No row has that Status and Type.');
  else {
    const columns = arr(sheet?.columns).map((c) => ({ key: c?.key ?? null, col: c?.col ?? null, letter: c?.letter ?? '', name: c?.name ?? '' }));
    // The column names stay in view while the rows scroll under them.
    body = h(
      'div',
      { class: 'table-wrap fk-rows-wrap', 'data-id': 'rows-table' },
      h(
        'table',
        { class: 'fk-rows-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Row'), columns.map((c) => h('th', { scope: 'col', key: c.key ?? `c${c.col}`, 'data-col': c.key ?? 'other' }, columnHead(h, c))), h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Check')))),
        h('tbody', null, shown.map((r) => tableRow(ctx, r, columns))),
      ),
    );
  }
  const panel = runPanel(ctx);
  return h(
    'section',
    { class: 'card fk-rows-card', key: 'rows', 'data-id': 'rows' },
    h(
      'div',
      { class: 'fk-rows-head' },
      h('h2', null, 'Rows'),
      rows.length && !waiting ? h('span', { class: 'fk-rows-count', 'data-id': 'rows-count' }, shown.length === rows.length ? rowsWord(rows.length) : `${shown.length} of ${rowsWord(rows.length)} shown`) : null,
      rows.length && !waiting ? filters(ctx, rows) : null,
    ),
    // How often the dashboard is right, by what staff marked right or changed.
    rows.length && !waiting ? h('p', { class: 'fk-staff-stats', 'data-id': 'staff-stats' }, icon(h, 'user'), staffStatsLine(rows)) : null,
    state.rowsNotice ? h('div', { 'data-id': 'rows-notice' }, words.notice(h, state.rowsNotice.tone, state.rowsNotice.text)) : null,
    h('div', { class: `fk-rows-layout${panel ? ' fk-with-live' : ''}` }, h('div', { class: 'fk-rows-main' }, body), panel),
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
      h('h3', null, `${x.name} `, pill(h, x.live ? 'Live' : 'Ended', x.live ? 'good' : 'quiet'), x.brand ? h('span', { class: 'fk-campaign-brand' }, ` Brand: ${x.brand}`) : null, h('span', { class: 'fk-campaign-brand', 'data-id': `start-${x.key}` }, x.startDate ? ` Started on ${dayFirst(x.startDate)}` : ' No start date')),
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

function campaignForm(ctx, checking) {
  const { h, state } = ctx;
  const c = state.campaigns;
  const v = c.values;
  const text = (key, label, placeholder, note = null) =>
    h('div', { class: 'fk-form-field', key }, h('label', { class: 'label', for: `fk-campaign-${key}` }, label), h('input', { id: `fk-campaign-${key}`, type: 'text', autocomplete: 'off', placeholder, value: v[key], disabled: c.busy, 'data-id': `campaign-${key}`, oninput: (e) => (v[key] = e.target.value) }), note ? h('p', { class: 'fk-note', 'data-id': `campaign-${key}-note` }, note) : null);
  return h(
    'div',
    { class: 'fk-campaign-form', 'data-id': 'campaign-form' },
    h('h3', null, c.editing === 'new' ? 'Add a campaign' : 'Change the campaign'),
    h(
      'div',
      { class: 'fk-form-grid' },
      text('brand', 'Brand', 'For example: Koparo'),
      text('name', 'Campaign name', 'For example: Koparo Clean'),
      text('startDate', 'Start date', 'For example: 01-10-2026', "The day the campaign started, the day first. Flipkart's reviews are read back to it, and an order or a review from before it is for a staff member. Leave it empty if you do not know it."),
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
      // As on Amazon, Save waits only while rows are checked; pressed while products are read, it shows the server's sentence.
      h('button', { type: 'button', class: 'btn btn-primary', disabled: c.busy || checking, onclick: () => saveCampaign(ctx), 'data-id': 'save-campaign' }, icon(h, 'check'), c.busy ? 'Saving…' : 'Save'),
      h('button', { type: 'button', class: 'btn btn-quiet', disabled: c.busy, onclick: () => ctx.update((st) => Object.assign(st.campaigns, { editing: null, values: blankCampaign(), error: null })), 'data-id': 'cancel-campaign' }, 'Cancel'),
    ),
    checking ? h('p', { class: 'muted small', 'data-id': 'save-waits' }, 'Save can be pressed once the rows are checked.') : null,
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
  // As on Amazon, Save is greyed out while rows are being checked; a campaign's buttons also wait while products are read.
  const checking = busy(state);
  const open = Boolean(c.editing) || (c.fold ?? (c.loaded ? !list.length : Boolean(c.loadError)));
  const shown = !c.loaded
    ? c.loadError
      ? words.notice(h, 'error', `The campaigns could not be opened: ${c.loadError} The dashboard asks again every 2 seconds.`)
      : h('p', { class: 'muted', 'data-id': 'campaigns-opening' }, 'Opening the campaigns…')
    : list.length
      ? h('div', { class: 'fk-campaigns' }, list.map((x) => campaignBlock(ctx, x, c.busy || reading || checking)))
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
      c.editing ? campaignForm(ctx, checking) : null,
      shown,
      c.notice ? words.notice(h, 'good', c.notice) : null,
      words.notice(h, 'error', c.error),
    ),
  );
}

// ---- one row's page (copied from the Amazon screen, views/amazon.js, and changed for Flipkart) ----

const thumbKey = (r, which, p) => `${r.id}:${which}:${p.i}:${p.at ?? ''}`;

/** The small pictures of the row whose page is open. */
async function loadThumbs(ctx) {
  const s = ctx.state;
  const n = ++s.seq.thumbs;
  const wanted = [];
  const open = s.open?.row;
  if (open?.id) for (const w of PICTURE_KEYS) for (const p of arr(open.shots?.[w]?.pictures)) if (p?.ok) wanted.push([open, w, p]);
  const keys = new Set(wanted.map(([r, w, p]) => thumbKey(r, w, p)));
  for (const [k, url] of Object.entries(s.thumbs)) {
    if (!keys.has(k)) {
      ctx.local.revoke(url);
      delete s.thumbs[k];
    }
  }
  for (const [r, w, p] of wanted) {
    const k = thumbKey(r, w, p);
    if (s.thumbs[k]) continue;
    try {
      const url = await ctx.local.image(`${ROWS}/${encodeURIComponent(r.id)}/small/${w}/${p.i}`);
      if (n !== s.seq.thumbs) {
        ctx.local.revoke(url);
        return;
      }
      s.thumbs[k] = url;
      ctx.update();
    } catch {
      // that small picture could not be fetched; its button says "Picture"
    }
  }
}

async function openBig(ctx, r, which, p) {
  const s = ctx.state;
  closeBig(ctx);
  const n = ++s.seq.big;
  const title = `${WHAT[which]} of ${r.label ?? 'this row'}${arr(r.shots?.[which]?.pictures).length > 1 ? `, picture ${p.i + 1}` : ''}`;
  ctx.update((st) => (st.big = { title, url: null, loading: true, error: null }));
  try {
    const url = await ctx.local.image(`${ROWS}/${encodeURIComponent(r.id)}/picture/${which}/${p.i}`);
    if (n !== s.seq.big) {
      ctx.local.revoke(url);
      return;
    }
    ctx.update((st) => (st.big = { title, url, loading: false, error: null }));
  } catch (err) {
    if (n !== s.seq.big) return;
    ctx.update((st) => (st.big = { title, url: null, loading: false, error: err.message }));
  }
}

function closeBig(ctx) {
  const s = ctx.state;
  if (s.big?.url) ctx.local.revoke(s.big.url);
  s.big = null;
  s.seq.big++;
  ctx.update();
}

function closeRow(ctx) {
  const s = ctx.state;
  s.open = null;
  s.seq.open++;
  ctx.update();
}

/** A row's page: the row, with each picture kept or why it could not be had, and its last check's steps. keep: the page stays while it is fetched again. */
async function openRow(ctx, id, { keep = false } = {}) {
  const s = ctx.state;
  if (!keep) closeRow(ctx);
  const n = ++s.seq.open;
  ctx.update((st) => {
    if (!keep || !st.open) st.open = { id, loading: true, error: null, row: null, result: null };
    else st.open.loading = true;
  });
  try {
    const out = await ctx.local.api('GET', `${ROWS}/${encodeURIComponent(id)}`);
    if (n !== s.seq.open || s.open?.id !== id) return;
    ctx.update((st) => Object.assign(st.open, { loading: false, row: out?.row ?? null, result: out?.result ?? null }));
    loadThumbs(ctx);
  } catch (err) {
    if (n !== s.seq.open || s.open?.id !== id) return;
    ctx.update((st) => Object.assign(st.open, { loading: false, error: err.message }));
  }
}

// ---- checking (copied from the Amazon screen) ----

const busy = (s) => Boolean(s.check?.running || s.all?.running || s.upload.busy);
/** A row with a result, as the server says, as on Amazon: its last check finished, or the uploaded file gives it a Status (until "Check every row again"). */
const isDone = (r) => r?.done === true;
/** The row being checked at this moment, by its own button or one by one; null when none. */
const rowBeingChecked = (s) => (s?.check?.running ? s.check.rowId : s?.all?.running && s.all.current && !s.all.current.finished ? s.all.current.rowId : null);

/** One check's line, onto its view: started, action, step, done, paused, failed. */
function applyCheckEvent(view, e) {
  if (e?.event === 'started') {
    view.steps = arr(e.steps).length ? arr(e.steps).map((name, i) => ({ n: i + 1, name, state: 'waiting', detail: null })) : freshSteps();
  } else if (e?.event === 'action') {
    view.action = typeof e.says === 'string' ? e.says : view.action;
  } else if (e?.event === 'step' && e.step && Number.isInteger(e.step.n)) {
    const i = e.step.n - 1;
    if (i >= 0 && i < STEP_NAMES.length) view.steps[i] = { ...view.steps[i], ...e.step };
    // What was read so far (the purchase and delivery screenshots), for their cards on the row's page.
    if (e.partial) view.result = { ...obj(view.result), ...e.partial };
  } else if (e?.event === 'done') {
    view.result = e.result ?? view.result;
    view.done = true;
  } else if (e?.event === 'paused') {
    view.paused = { kind: e.kind, says: e.says };
  } else if (e?.event === 'failed') {
    // Nothing was saved, even when a result line came first.
    view.failed = typeof e.says === 'string' ? e.says : 'The check stopped part way.';
    view.done = false;
  }
}

/** "Check" (or "Check again"): the server checks the row, and its page shows each step as it runs. */
async function startCheck(ctx, id) {
  const s = ctx.state;
  if (busy(s)) return;
  // A result a staff member changed by hand, or marked right: "Check again" asks first, then replaces it, as on Amazon.
  const listed = arr(s.saved?.rows).find((x) => x?.id === id);
  if (changedByStaff(listed) && !ctx.confirm('A staff member changed this row\'s result by hand. "Check again" replaces it with what the dashboard finds. Go on?')) return;
  if (markedRight(listed) && !ctx.confirm('A staff member marked this row\'s result as right. "Check again" checks it afresh and clears that mark. Go on?')) return;
  const run = { rowId: id, running: true, controller: new AbortController(), view: { ...newView(), action: 'Starting the check…' }, notice: null };
  ctx.update((st) => {
    st.check = run;
    st.notice = null;
    st.rowsNotice = null;
    // The row's email was for its result before this check.
    if (st.email?.rowId === id) st.email = null;
  });
  const isCurrent = () => s.check === run;
  const out = await ctx.local.stream('POST', `${ROWS}/${encodeURIComponent(id)}/check`, {}, (e) => {
    if (!isCurrent()) return;
    applyCheckEvent(run.view, e);
    ctx.update();
  }, run.controller.signal);
  if (!isCurrent()) return;
  const button = isDone(arr(s.saved?.rows).find((x) => x?.id === id)) ? '"Check again"' : 'Check';
  ctx.update(() => {
    run.running = false;
    run.controller = null;
    run.view.action = null;
    const r = run.view.result;
    if (!out.ok && !out.aborted) run.notice = { tone: 'error', text: out.message };
    else if (out.aborted) run.notice = { tone: 'warn', text: `The check was stopped, and nothing was saved for it. Press ${button} to check this row again.` };
    else if (run.view.failed) run.notice = { tone: 'error', text: run.view.failed };
    else if (run.view.paused || r?.paused) run.notice = { tone: 'warn', text: `The check paused, and nothing was saved for this row. ${run.view.paused?.says ?? r.paused.says}` };
    else if (!run.view.done) run.notice = { tone: 'warn', text: `The check stopped part way, and nothing was saved for it. Press ${button} to try again.` };
  });
  loadSaved(ctx);
  if (s.open?.id === id) openRow(ctx, id, { keep: true });
}

function stopCheck(ctx) {
  ctx.state.check?.controller?.abort();
}

/** Puts rows the server sent (the row just checked) into the table in their places. */
function putRows(s, list) {
  const items = arr(s.saved?.rows);
  for (const r of arr(list)) {
    const i = items.findIndex((x) => x?.id === r?.id);
    if (i >= 0) items[i] = r;
  }
}

export const STOPPED_SAYS = 'Stopped. The rows finished before it stay checked. The row it was on was not finished, so it is the first one checked next time.';

/**
 * "Start checking" (later "Carry on checking"), as on Amazon: the server
 * checks the rows with no result yet (not a row the uploaded file gives a
 * Status), one at a time from the first one, and the table shows each row as
 * soon as it is finished. again: "Check every row again", which removes every
 * row's last check first, and after which the file's Statuses no longer
 * count.
 */
async function checkRows(ctx, { again = false } = {}) {
  const s = ctx.state;
  if (busy(s)) return;
  const run = { running: true, controller: new AbortController(), current: null, view: newView(), paused: null, summary: null, notice: null };
  ctx.update((st) => {
    // An earlier single check's view would hide this one's on the row page.
    if (st.check && !st.check.running) st.check = null;
    st.all = run;
    st.rowsNotice = null;
  });
  const isCurrent = () => s.all === run;
  const refreshOpen = (id) => {
    if (id && s.open?.id === id) openRow(ctx, id, { keep: true });
  };
  const out = await ctx.local.stream('POST', `${BASE}/check-all`, again ? { again: true } : {}, (e) => {
    if (!isCurrent()) return;
    if (e?.event === 'run-started') {
      // "Check every row again": the server has removed every row's last check, but for a result a staff member changed, and the file's Statuses no longer count, as on Amazon.
      if (e.again) for (const r of arr(s.saved?.rows)) if (r && !changedByStaff(r)) Object.assign(r, { last: null, done: false, recheck: true, final: null, finalSays: null });
    } else if (e?.event === 'row') {
      run.view = { ...newView(), action: 'Starting the check…' };
      run.current = { rowId: e.rowId, label: e.label ?? '' };
    } else if (e?.event === 'row-done') {
      // The row's line in the table changes at once, before the next row starts.
      if (run.current?.rowId === e.rowId) run.current.finished = true;
      putRows(s, e.rows);
      refreshOpen(e.rowId);
    } else if (e?.event === 'paused') {
      run.paused = { kind: e.kind, says: e.says ?? 'Checking paused.', rowId: e.rowId, label: e.label ?? '' };
    } else if (e?.event === 'run-done' || e?.event === 'run-stopped') {
      run.summary = { stopped: e.event === 'run-stopped', checked: e.checked ?? 0 };
    } else if (e?.event === 'failed' && !run.current) {
      run.notice = { tone: 'error', text: e.says };
    } else {
      applyCheckEvent(run.view, e);
    }
    ctx.update();
  }, run.controller.signal);
  if (!isCurrent()) return;
  ctx.update(() => {
    run.running = false;
    run.controller = null;
    run.view.action = null;
    if (!out.ok && !out.aborted) run.notice = { tone: 'error', text: out.message };
    else if (out.aborted || run.summary?.stopped) run.notice = { tone: 'warn', text: STOPPED_SAYS };
    else if (run.view.failed) run.notice = { tone: 'error', text: run.view.failed };
    else if (!run.summary && !run.paused) {
      run.notice = { tone: 'error', text: `The connection to the dashboard's server broke before checking finished. The rows finished before it stay checked. Press "Carry on checking" to go on from the row it was on.` };
    }
  });
  loadSaved(ctx);
  refreshOpen(run.current?.rowId);
}

/** "Check every row again", as on Amazon: asks first, then every result goes and the rows are checked from the first one; a result a staff member changed stays. */
function checkEveryRowAgain(ctx) {
  const rows = arr(ctx.state.saved?.rows);
  const n = rows.length;
  if (!n || busy(ctx.state)) return;
  // Rows whose result a staff member changed by hand keep it and are passed by; a result only marked right is checked again, and its mark goes.
  const kept = rows.filter(changedByStaff).length;
  const marked = rows.filter(markedRight).length;
  if (kept === n) {
    ctx.update((st) => (st.rowsNotice = { tone: 'warn', text: kept === 1 ? 'The 1 row was changed by staff, so it keeps its result and there is nothing to check again.' : `All ${n} rows were changed by staff, so they keep their results and there is nothing to check again.` }));
    return;
  }
  const marks = marked ? ` The ${rowsWord(marked)} marked right by staff ${marked === 1 ? 'loses its mark' : 'lose their marks'}.` : '';
  const question = kept ? `This checks the ${rowsWord(n - kept)} not changed by staff again and replaces their results. The ${rowsWord(kept)} changed by staff ${kept === 1 ? 'keeps its result' : 'keep their results'}.${marks} Go on?` : n === 1 ? `This checks the 1 row again and replaces its result.${marks} Go on?` : `This checks all ${n} rows again and replaces their results.${marks} Go on?`;
  if (!ctx.confirm(question)) return;
  return checkRows(ctx, { again: true });
}

// ---- a result changed by a staff member (copied from the Amazon screen) ----

/** "Change the result": the form, filled with the row's result as it is. */
function editResult(ctx, r) {
  const res = resultOf(r, null);
  ctx.update((st) => {
    st.edit = { rowId: r.id, final: FINAL_WORDS[res.final] ? res.final : 'manual', typeKey: r?.last?.typeKey ?? typeKeyOfWord(st.saved?.types, res.type), note: res.note ?? '', busy: false, error: null };
    st.notice = null;
  });
}

async function saveResult(ctx) {
  const s = ctx.state;
  const e = s.edit;
  if (!e || e.busy) return;
  ctx.update((st) => Object.assign(st.edit, { busy: true, error: null }));
  try {
    const out = await ctx.local.api('POST', `${ROWS}/${encodeURIComponent(e.rowId)}/result`, { final: e.final, typeKey: e.typeKey, note: e.note });
    ctx.update((st) => {
      if (out?.row) putRows(st, [out.row]);
      // A check that finished on this page no longer gives the row's result.
      if (st.check?.rowId === e.rowId && !st.check.running) st.check = null;
      // The row's email was for its result before.
      if (st.email?.rowId === e.rowId) st.email = null;
      st.edit = null;
      st.notice = { tone: 'good', text: 'The result was changed. This row now says "Changed by staff".', route: e.rowId };
    });
    if (s.open?.id === e.rowId) openRow(ctx, e.rowId, { keep: true });
  } catch (err) {
    ctx.update((st) => {
      if (st.edit) Object.assign(st.edit, { busy: false, error: err.message });
    });
  }
}

/** "The result is right": the dashboard's result stays, marked checked by staff and right; the line above the table counts it. */
async function markRight(ctx, r) {
  const s = ctx.state;
  if (busy(s) || s.marking || !r?.id) return;
  ctx.update((st) => {
    st.marking = true;
    st.notice = null;
  });
  try {
    const out = await ctx.local.api('POST', `${ROWS}/${encodeURIComponent(r.id)}/right`, {});
    ctx.update((st) => {
      st.marking = false;
      if (out?.row) putRows(st, [out.row]);
      if (st.check?.rowId === r.id && !st.check.running) st.check = null;
      st.notice = { tone: 'good', text: 'Marked as right. This row now says "Marked right by staff", and the line above the table counts it.', route: r.id };
    });
    if (s.open?.id === r.id) openRow(ctx, r.id, { keep: true });
  } catch (err) {
    ctx.update((st) => {
      st.marking = false;
      st.notice = { tone: 'error', text: err.message, route: r.id };
    });
  }
}

// ---- "Prepare email": the Amazon screen's email box for one row, with nothing ever sent ----

/** "Prepare email", on a row's page: the email for the row, filled in by the local server as on Amazon, to read, change and copy. */
async function openEmail(ctx, r) {
  const s = ctx.state;
  if (busy(s) || !r?.id) return;
  const box = { rowId: r.id, route: ctx.route || '', loading: true, error: null, item: null, copied: null, copyError: null };
  ctx.update((st) => {
    st.email = box;
    st.notice = null;
  });
  try {
    const out = await ctx.local.api('GET', `${ROWS}/${encodeURIComponent(r.id)}/email`);
    if (s.email !== box) return;
    ctx.update(() => Object.assign(box, { loading: false, item: out?.email && typeof out.email === 'object' ? { ...out.email } : null }));
  } catch (err) {
    if (s.email !== box) return;
    ctx.update(() => Object.assign(box, { loading: false, error: err.message }));
  }
}

const COPY_WHAT = { address: 'email address', subject: 'subject', message: 'message' };

/** A Copy button pressed: the email address, the subject or the message, as the box shows it now (with any words changed), ready to paste into an email. */
async function copyWords(ctx, which) {
  const box = ctx.state.email;
  const it = box?.item;
  if (!it) return;
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (typeof clipboard?.writeText !== 'function') throw new Error('No clipboard here.');
    await clipboard.writeText(String(it[which] ?? ''));
    if (ctx.state.email === box) ctx.update(() => Object.assign(box, { copied: which, copyError: null }));
  } catch {
    if (ctx.state.email === box) ctx.update(() => Object.assign(box, { copied: null, copyError: `The ${COPY_WHAT[which]} could not be copied. Select its words and copy them yourself: Command and C on a Mac, Ctrl and C on Windows.` }));
  }
}

/** A screenshot in a file's name and in a sentence: the kind of picture each picture cell holds. */
const SHOT_WORDS = { order: 'purchase screenshot', delivery: 'delivery screenshot', review: 'review link picture', reviewShot: 'review screenshot' };
const PICTURE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
/** One of a row's kept pictures, as it was kept. */
const pictureRoute = (r, which, p) => `${ROWS}/${encodeURIComponent(r.id)}/picture/${which}/${p.i}`;

/** A picture as a PNG, the kind Gmail and Outlook take when a picture is pasted in: a JPEG or a WEBP is drawn again as a PNG, on this computer. */
async function asPng(blob) {
  if (blob?.type === 'image/png') return blob;
  const bitmap = await globalThis.createImageBitmap(blob);
  const canvas = new globalThis.OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return canvas.convertToBlob({ type: 'image/png' });
}

/** What the email box says after a picture's button is pressed: copied, or why not. */
function pictureSaid(ctx, box, change) {
  if (ctx.state.email === box) ctx.update(() => Object.assign(box, change));
}

/**
 * "Copy picture": the screenshot copied as a picture, to paste into an email
 * in Gmail or Outlook. The copy is asked for at once, while the press counts,
 * and the picture follows once it is fetched (and made a PNG).
 */
function copyPicture(ctx, r, which, p) {
  const box = ctx.state.email;
  const clipboard = globalThis.navigator?.clipboard;
  const Item = globalThis.ClipboardItem;
  if (typeof clipboard?.write !== 'function' || typeof Item !== 'function') return pictureSaid(ctx, box, { copied: null, copyError: `This browser cannot copy pictures. Press Save beside the ${SHOT_WORDS[which]}, then attach the file to your email.` });
  const png = ctx.local.blob(pictureRoute(r, which, p)).then((out) => asPng(out?.blob));
  return clipboard.write([new Item({ 'image/png': png })]).then(
    () => pictureSaid(ctx, box, { copied: `picture-${which}-${p.i}`, copyError: null }),
    () => pictureSaid(ctx, box, { copied: null, copyError: `The ${SHOT_WORDS[which]} could not be copied. Press Save beside it, then attach the file to your email.` }),
  );
}

/** "Save": the screenshot saved as a file, as it was kept, to attach to an email. */
async function savePicture(ctx, r, which, p) {
  const box = ctx.state.email;
  try {
    const out = await ctx.local.blob(pictureRoute(r, which, p));
    const many = arr(r.shots?.[which]?.pictures).filter((x) => x?.ok).length > 1;
    ctx.download(`${r.label ?? 'Row'} ${SHOT_WORDS[which]}${many ? ` ${p.i + 1}` : ''}.${PICTURE_EXT[out?.blob?.type] ?? 'png'}`, out?.blob);
  } catch (err) {
    pictureSaid(ctx, box, { copied: null, copyError: `The ${SHOT_WORDS[which]} could not be saved: ${err.message}` });
  }
}

// ---- downloads (copied from the Amazon screen) ----

/** "The results only": Row (its number on the dashboard), Order ID, Status, Type and Note. A row not checked yet has no Status. */
function downloadCsv(ctx) {
  const rows = [['Row', 'Order ID', 'Status', 'Type', 'Note']];
  for (const r of arr(ctx.state.saved?.rows)) {
    const shown = resultOf(r, null);
    rows.push([r?.n ?? '', r?.orderId ?? '', shown.from ? FINAL_WORDS[shown.final] ?? '' : '', shown.type, shown.note]);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  ctx.download(`flipkart-review-results-${stamp}.csv`, ctx.words.csv(rows));
}

/** "The checked Excel file": the uploaded file with each checked row's Status, Type and Note written in by the local server. */
async function downloadExcel(ctx) {
  const s = ctx.state;
  if (s.excel.busy) return;
  ctx.update((st) => (st.excel = { busy: true, error: null }));
  try {
    const out = await ctx.local.blob(`${BASE}/sheet/checked.xlsx`);
    ctx.download(out?.fileName || 'checked.xlsx', out?.blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.update((st) => (st.excel = { busy: false, error: null }));
  } catch (err) {
    ctx.update((st) => (st.excel = { busy: false, error: err.message }));
  }
}

/** Stop: at once. The row it was on is not checked. */
function stopAll(ctx) {
  ctx.state.all?.controller?.abort();
}

/** Scrolls the table to a row, showing every row first when the filter hides it, as on Amazon. */
function showRow(ctx, id) {
  const r = arr(ctx.state.saved?.rows).find((x) => x?.id === id);
  if (r && !passesFilter(r, ctx.state.filter)) ctx.update((st) => (st.filter = noFilter()));
  if (r) ctx.reveal?.(`row-${r.n}`, 'center');
}

/** How many rows there are, how many are checked, and how many are left to check. */
function tallyOf(rows) {
  const done = rows.filter(isDone).length;
  return { total: rows.length, done, left: rows.length - done };
}

/** The words of the one button that checks the rows one by one. */
function runWords(rows, running) {
  const { total, done, left } = tallyOf(rows);
  if (running) return 'Checking…';
  if (total && !left) return 'All rows are checked';
  return done ? 'Carry on checking' : 'Start checking';
}

/** A row in a sentence: "row 23" (its number on the dashboard, from 1). */
function rowWords(r, label = '') {
  if (r?.n != null) return `row ${r.n}`;
  return String(label || 'the row').replace(/^Row /, 'row ');
}

/** "Checking row 23: 5 of 200 rows done, 195 left". */
function checkingWords(ctx, rows) {
  const run = ctx.state.all;
  const { total, done, left } = tallyOf(rows);
  const r = rows.find((x) => x?.id === run.current.rowId);
  return `Checking ${rowWords(r, run.current.label)}: ${done} of ${total} ${total === 1 ? 'row' : 'rows'} done, ${left} left`;
}

/** The four Status cards and the main buttons, in one row above the table, as on Amazon: "Start checking" (or "Carry on checking"), Stop while it runs, and "Check every row again". */
/** The one Download button, as on Amazon: it offers the checked Excel file and the results only. */
function downloadMenu(ctx) {
  const { h, state } = ctx;
  const excelOk = state.saved?.sheet?.kind === 'xlsx';
  // The menu closes once a file is chosen.
  const shut = (e) => e?.currentTarget?.closest?.('details')?.removeAttribute('open');
  return h(
    'details',
    { class: 'fk-menu', 'data-id': 'download' },
    h('summary', { class: 'btn' }, icon(h, state.excel.busy ? 'spinner' : 'download', state.excel.busy ? 'icon-spin' : ''), state.excel.busy ? 'Preparing…' : 'Download', icon(h, 'chevron', 'fk-menu-chevron')),
    h(
      'div',
      { class: 'fk-menu-list' },
      h('button', { type: 'button', class: 'fk-menu-item', disabled: !excelOk || state.excel.busy, title: excelOk ? null : 'Needs an Excel file uploaded.', onclick: (e) => { shut(e); downloadExcel(ctx); }, 'data-id': 'download-excel' }, icon(h, 'file'), h('span', { class: 'fk-menu-words' }, h('strong', null, 'The checked Excel file'), h('span', { class: 'fk-menu-note' }, 'Your file, with the results filled in'))),
      h('button', { type: 'button', class: 'fk-menu-item', onclick: (e) => { shut(e); downloadCsv(ctx); }, 'data-id': 'download-csv' }, icon(h, 'table'), h('span', { class: 'fk-menu-words' }, h('strong', null, 'The results only'), h('span', { class: 'fk-menu-note' }, 'Row, order ID, Status, Type and Note'))),
    ),
  );
}

function overview(ctx, rows) {
  const { h, words, state } = ctx;
  const running = Boolean(state.all?.running);
  const { total, left } = tallyOf(rows);
  const mark = running ? 'spinner' : total && !left ? 'check' : 'play';
  return h(
    'section',
    { class: 'fk-overview', key: 'overview', 'data-id': 'overview' },
    finalCards(ctx, rows),
    h(
      'div',
      { class: 'fk-main-actions', 'data-id': 'main-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', disabled: busy(state) || !left, onclick: () => checkRows(ctx), 'data-id': 'start-checking' }, icon(h, mark, running ? 'icon-spin' : ''), runWords(rows, running)),
      running ? h('button', { type: 'button', class: 'btn btn-danger', onclick: () => stopAll(ctx), 'data-id': 'stop-all' }, icon(h, 'stop'), 'Stop') : null,
      h('button', { type: 'button', class: 'btn', disabled: busy(state), onclick: () => checkEveryRowAgain(ctx), 'data-id': 'check-every-row' }, icon(h, 'refresh'), 'Check every row again'),
      downloadMenu(ctx),
      words.notice(h, 'error', state.excel.error),
    ),
  );
}

/**
 * The live checking area beside the table, while the rows are checked one by
 * one, as on Amazon: one progress bar with how many rows are done and left,
 * the row being checked with its steps as they happen, and what the check is
 * doing now. A pause is said plainly.
 */
function runPanel(ctx) {
  const { h, words, state } = ctx;
  const run = state.all;
  if (!run) return null;
  const rows = arr(state.saved?.rows);
  const { total, done } = tallyOf(rows);
  const pausedAt = run.paused ? rowWords(rows.find((x) => x?.id === run.paused.rowId), run.paused.label) : null;
  let progress = null;
  if (run.running && run.current) progress = [`${checkingWords(ctx, rows)}. `, h('button', { type: 'button', class: 'linkish', key: 'show', onclick: () => showRow(ctx, run.current.rowId), 'data-id': 'show-current' }, 'Show this row in the table')];
  else if (run.running) progress = run.view.action ?? 'Starting…';
  else if (run.summary && !run.summary.stopped) progress = 'Finished.';
  const view = { ...run.view, running: run.running };
  return h(
    'aside',
    { class: 'fk-live-panel', key: 'run', 'aria-label': 'Checking the rows', 'data-id': 'run' },
    h(
      'div',
      { class: 'fk-live-head' },
      h('h2', null, icon(h, run.running ? 'spinner' : 'browser', run.running ? 'icon-spin' : ''), 'Checking'),
      !run.running ? h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => ctx.update({ all: null }), 'data-id': 'close-run' }, icon(h, 'close'), 'Close') : null,
    ),
    progress ? h('p', { class: 'fk-run-progress', role: 'status', 'aria-live': 'polite', 'data-id': 'run-progress' }, progress) : null,
    total ? h('progress', { max: String(total), value: String(done), 'aria-label': 'Rows done' }) : null,
    run.paused ? h('div', { class: 'notice notice-warn', role: 'alert', 'data-id': 'paused' }, h('p', null, `Paused at ${pausedAt}. ${run.paused.says} That row is not checked yet, so it is the first one checked next time.`)) : null,
    run.notice ? words.notice(h, run.notice.tone, run.notice.text) : null,
    run.current ? h('p', { class: 'fk-live-links', key: 'links' }, h('button', { type: 'button', class: 'linkish', onclick: () => ctx.go(`flipkart/${run.current.rowId}`), 'data-id': 'open-current' }, icon(h, 'open'), "Open this row's page")) : null,
    run.current ? liveCard(ctx, view, { flat: true }) : null,
    run.current ? activityCard(ctx, view, { flat: true }) : null,
  );
}

// ---- drawing one row's page ----

function thumbButton(ctx, r, which, p, large = false, place = large ? 'row-' : '') {
  const { h, state } = ctx;
  const url = state.thumbs[thumbKey(r, which, p)];
  return h(
    'button',
    { type: 'button', class: `fk-thumb${large ? ' fk-thumb-large' : ''}`, key: `${which}-${p.i}`, onclick: (e) => { e.stopPropagation(); openBig(ctx, r, which, p); }, 'aria-label': `Enlarge the ${WHAT[which].toLowerCase()} of ${r.label ?? 'this row'}`, 'data-id': `${place}thumb-${which}-${r.id}-${p.i}` },
    url ? h('img', { src: url, alt: '' }) : h('span', { class: 'muted small' }, 'Picture'),
  );
}

function bigPicture(ctx) {
  const { h, words, state } = ctx;
  const b = state.big;
  if (!b) return null;
  return h(
    'div',
    { class: 'fk-big', role: 'dialog', 'aria-modal': 'true', 'aria-label': b.title, 'data-id': 'big', onclick: () => closeBig(ctx) },
    h(
      'figure',
      { class: 'fk-big-inner', onclick: (e) => e.stopPropagation() },
      h('div', { class: 'card-head' }, h('figcaption', null, b.title), h('button', { type: 'button', class: 'btn btn-small', onclick: () => closeBig(ctx), 'data-id': 'close-big' }, icon(h, 'close'), 'Close')),
      b.url ? h('img', { src: b.url, alt: b.title, 'data-id': 'big-img' }) : b.loading ? h('p', { class: 'muted', role: 'status' }, 'Fetching…') : null,
      words.notice(h, 'error', b.error),
    ),
  );
}

/** A picture or link cell on the row's page: where each link goes, and why a picture could not be had, in the Amazon checker's words. */
function cellSaid(ctx, r, which) {
  const { h, words } = ctx;
  const s = obj(r.shots?.[which]);
  const pics = arr(s.pictures);
  const parts = [];
  if (s.mismatch) parts.push(h('p', { key: 'mm', class: 'fk-missing-word' }, 'The link written in this cell is different from the link that opens when you click it. The dashboard checks the link that opens when clicked.'));
  if (s.how === 'cell' || s.how === 'floating') parts.push(h('p', { key: 'how' }, s.how === 'cell' ? 'A picture placed in the cell.' : 'A picture over the cell.'));
  arr(s.links).forEach((l, i) => {
    const p = pics.find((x) => x?.link === l) ?? null;
    const label = arr(s.labels).find((x) => x?.link === l)?.label ?? 'Open the link';
    parts.push(h('p', { key: `l${i}` }, words.link(h, l, label), p && !p.ok ? h('span', { class: 'fk-missing-word' }, `. Not opened, because ${p.problem?.says || 'it could not be opened'}.`) : null));
  });
  if (!parts.length) parts.push(h('p', { key: 'w' }, s.text ? `Words: "${s.text}"` : 'Empty.'));
  return parts;
}

/** One of the file's other columns on the row's page: its words, and each link. */
function otherSaid(ctx, r, col) {
  const { h, words } = ctx;
  const v = obj(r.values?.[col]);
  const labels = arr(v.labels);
  if (labels.length) return labels.map((x, i) => h('p', { key: `l${i}` }, words.link(h, x.link, x.label || 'Open the link')));
  return v.text || null;
}

/** What the row holds, under the file's own column names and in its order, and the pictures of its picture columns as small pictures that open large. */
function detailsCard(ctx, r) {
  const { h, words, state } = ctx;
  const field = {
    orderId: () => r.orderId || null,
    orderDate: () => (r.orderDate ? `${r.orderDate}${r.orderDateRead ? '' : ' (not read as a date)'}` : null),
    amount: () => (r.amount ? `${r.amount}${r.amountRead ? '' : ' (not read as an amount)'}` : null),
    product: () => r.product || null,
    orderShot: () => cellSaid(ctx, r, 'order'),
    deliveryShot: () => cellSaid(ctx, r, 'delivery'),
    reviewShot: () => cellSaid(ctx, r, 'reviewShot'),
    reviewLink: () => cellSaid(ctx, r, 'review'),
  };
  const columns = arr(state.saved?.sheet?.columns).filter((c) => !['status', 'type', 'note'].includes(c?.key));
  const named = Object.fromEntries(columns.filter((c) => c.key).map((c) => [c.key, c.name]));
  const pictureCells = PICTURE_KEYS.filter((w) => !columns.length || named[CELL_COLUMN[w]]);
  return h(
    'section',
    { class: 'card', 'data-id': 'row-details' },
    h('h3', null, 'From the sheet'),
    words.fields(h, [['Row', r.label], ...columns.map((c) => [c.name, field[c.key] && c.key !== 'reviewer' ? field[c.key]() : otherSaid(ctx, r, c.col)])]),
    h(
      'div',
      { class: 'fk-user-shots' },
      pictureCells.flatMap((w) => arr(r.shots?.[w]?.pictures).filter((p) => p?.ok).map((p) => h('div', { key: `${w}-${p.i}`, class: 'fk-user-shot' }, h('p', { class: 'label' }, named[CELL_COLUMN[w]] ?? WHAT[w]), thumbButton(ctx, r, w, p, true)))),
    ),
    r.prev ? h('p', { class: 'muted small' }, `In the file before: ${[r.prev.status, r.prev.type].filter(Boolean).join(', ') || 'nothing'}${r.prev.note ? `. ${r.prev.note}` : ''}`) : null,
    state.open?.loading ? h('p', { class: 'muted small', role: 'status' }, 'Updating…') : null,
  );
}

/** Amounts read from a screenshot, as rupees with what they are: "₹349 (total amount), ₹999 (listing price)". Copied from the Amazon screen. */
function amountsSaid(amounts) {
  const seen = new Set();
  const out = [];
  for (const a of arr(amounts)) {
    if (!Number.isFinite(a?.value)) continue;
    const said = `₹${Number.isInteger(a.value) ? a.value : a.value.toFixed(2)}${a.label ? ` (${a.label})` : ''}`;
    if (!seen.has(said)) {
      seen.add(said);
      out.push(said);
    }
  }
  return out.join(', ');
}

/** What the purchase, delivery and review screenshots say, as read on this computer: the Amazon screen's cards, for Flipkart's screenshots. A screenshot the file has no column for has no card. */
function readCards(ctx, res) {
  const { h, words, state } = ctx;
  const mapping = state.saved?.sheet ? obj(state.saved.sheet.mapping) : null;
  const shows = (key) => !mapping || Number.isInteger(mapping[key]);
  const o = res?.order;
  const d = res?.delivery;
  const v = res?.review;
  const read = (x) => `Read on this computer, in ${x.hindi ? 'English and Hindi' : 'English only'}: ${x.wordCount ?? 0} words, read with ${x.confidence ?? 0} percent certainty.`;
  const everything = (t) => (t ? h('details', null, h('summary', null, 'Everything read from it'), h('pre', { class: 'fk-ocr-text' }, t)) : null);
  return [
    !shows('orderShot')
      ? null
      : h(
          'section',
          { class: 'card fk-read', key: 'card-order', 'data-id': 'card-order' },
          h('h3', null, 'Read from the purchase screenshot'),
          o
            ? h('div', null, o.problem ? words.notice(h, 'warn', o.problem) : null, words.fields(h, [['Order IDs', arr(o.orderIds).join(', ') || 'None shown'], ['Dates', arr(o.dates).join(', ') || 'None shown'], ['Amounts', amountsSaid(o.amounts) || 'None shown'], ['Product', o.product], ['Read by', read(o)]]), everything(o.text))
            : h('p', { class: 'muted' }, 'Not read yet.'),
        ),
    !shows('deliveryShot')
      ? null
      : h(
          'section',
          { class: 'card fk-read', key: 'card-delivery', 'data-id': 'card-delivery' },
          h('h3', null, 'Read from the delivery screenshot'),
          d
            ? h('div', null, d.problem ? words.notice(h, 'warn', d.problem) : null, words.fields(h, [['Delivered', d.delivered ? d.deliveredText : 'Not shown'], ['Order IDs', arr(d.orderIds).join(', ') || 'None shown'], ['Order dates', arr(d.dates).join(', ') || 'None shown'], ['Amounts', amountsSaid(d.amounts) || 'None shown'], ['Product', d.product], ['Read by', read(d)]]), everything(d.text))
            : h('p', { class: 'muted' }, 'Not read yet.'),
        ),
    // The Amazon screen's card for what the review screenshot shows, with Flipkart's parts of a review.
    !shows('reviewShot') && !shows('reviewLink')
      ? null
      : h(
          'section',
          { class: 'card fk-read', key: 'card-review', 'data-id': 'card-review' },
          h('h3', null, 'Read from the review screenshot'),
          v
            ? h(
                'div',
                null,
                v.problem ? words.notice(h, 'warn', v.problem) : null,
                words.fields(h, [
                  ['What it shows', { refused: 'Flipkart not accepting the review', rating: 'A star rating only', written: v.form ? 'A review being written' : 'A written review', unknown: 'Not certain' }[v.kind] ?? v.kind],
                  ['Stars', v.stars ? `${v.stars} of 5` : 'Not shown'],
                  ['Title', v.title || 'Not shown'],
                  ['Written words', v.body || 'Not shown'],
                  ["Reviewer's name", v.name || 'Not shown'],
                  ['Date', v.dateText || 'Not shown'],
                  ...(v.note ? [['Note', v.note]] : []),
                  ...(v.message ? [["Flipkart's words", v.message]] : []),
                  ...(v.others ? [['Other reviews on it', String(v.others)]] : []),
                  ...(v.why ? [['Why not certain', v.why]] : []),
                  ['Read by', read(v)],
                ]),
                everything(v.text),
              )
            : h('p', { class: 'muted' }, 'Not read yet.'),
        ),
    !shows('reviewShot') && !shows('reviewLink') ? null : foundCard(ctx, res),
  ];
}

/** Step 7's answer for the "Found" line: the review found, to open on Flipkart in one click, as on Amazon, or why not. */
function foundWords(ctx, f) {
  const { h, words } = ctx;
  const r = f?.review;
  const reviews = (n) => (n === 1 ? 'a review' : `${n} reviews`);
  // Kept from an earlier reading, older than today's reading reaches: found, as last seen.
  if (f?.how === 'found' && f.kept) return [`Yes, among the reviews kept from earlier readings: last seen on Flipkart on ${dayFirst(f.lastSeen)}.`, r?.link ? [' ', words.link(h, r.link, 'Open the review on Flipkart')] : null];
  if (f?.how === 'found') return r?.link ? words.link(h, r.link, 'Yes. Open the review on Flipkart') : 'Yes';
  if (f?.how === 'gone') return `No: it was last seen on Flipkart on ${dayFirst(f.lastSeen)}, but it is not among the reviews read today, though they reach back to its day, so it may have been removed`;
  if (f?.how === 'otherName') return `No: the words match ${reviews(f.count)} under another name`;
  if (f?.how === 'noName') return 'No: the words match a review Flipkart shows as "Flipkart Customer", so the name could not be checked';
  if (f?.how === 'noNameToCheck') return 'No: there is no name to check the review with';
  if (f?.how === 'several') return `No: ${f.count} reviews under the name have these words, so none is picked`;
  if (f?.how === 'noWords') return 'Not searched: the review screenshot shows no words';
  return 'No';
}

/** What step 7 found among Flipkart's public reviews: the Amazon screen's "Found on Amazon" box, for Flipkart. A review is shown when its words match, found or not, with why it is not counted, and its own link to open it on Flipkart. No page's number is shown: Flipkart's website shows none. */
function foundCard(ctx, res) {
  const { h, words } = ctx;
  const f = res?.found;
  const k = res?.flipkart;
  const r = f?.review;
  const shown = r && ['found', 'gone', 'otherName', 'noName', 'noNameToCheck'].includes(f.how) ? r : null;
  const notCounted = {
    gone: `This review was on Flipkart when it was last seen there, on ${dayFirst(f?.lastSeen)}, but it is not among the reviews read today, though they reach back to the day it was posted, so it may have been removed.`,
    otherName: 'The words match this review, but it is under another name, so it is not counted as found.',
    noName: 'The words match this review, but Flipkart shows no name for it ("Flipkart Customer"), so the name could not be checked; it is not counted as found.',
    noNameToCheck: 'The words match this review, but there is no name on the review screenshot or in the sheet to check it with; it is not counted as found.',
  }[f?.how];
  const day = (d) => String(d).split('-').reverse().join('-');
  const when = shown?.dateSaid ? `${shown.dateSaid}${shown.date && shown.date === shown.dateLatest ? ` (${day(shown.date)})` : ''}` : null;
  const none = !k ? 'Nothing read from Flipkart yet. Flipkart is opened only to look for the review shown on the review screenshot.' : f?.how === 'several' ? 'Two or more reviews fit, so none is shown.' : f?.how === 'noWords' ? 'Not searched: the review screenshot shows no words to search for.' : 'Not found among the reviews read.';
  const read = k ? `${words.plural(k.count ?? 0, 'review')}, newest first${k.end === 'last page' ? ', all that Flipkart shows' : ''}${k.readAt ? `, ${words.ist(k.readAt)}` : ''}${k.kept ? `; and ${words.plural(k.kept, 'more review')} posted since the campaign started on ${dayFirst(k.start)}, kept on this computer from earlier readings` : ''}` : null;
  return h(
    'section',
    { class: 'card', key: 'card-flipkart', 'data-id': 'card-flipkart' },
    h('h3', null, 'Found on Flipkart'),
    shown
      ? h('div', null, notCounted ? words.notice(h, 'warn', notCounted) : null, words.quote(h, shown.text || shown.title), words.fields(h, [['Reviewer name', shown.name], ['Stars', shown.stars ? `${shown.stars} of 5` : null], ['Title', shown.title], ['Date', when], notCounted && shown.link ? ['On Flipkart', words.link(h, shown.link, 'Open this review on Flipkart')] : null]))
      : h('p', { class: 'muted' }, none),
    k ? words.fields(h, [["Product's page", k.name], ['Reviews Flipkart counts', Number.isInteger(k.total) ? String(k.total) : null]]) : null,
    k ? h('div', null, h('h4', null, 'Under "See all reviews"'), words.fields(h, [['Read', read], ['Found', foundWords(ctx, f)]])) : null,
  );
}

/** The sheet and the two screenshots side by side, as the Amazon screen's comparison table shows them (check.js buildComparison). Its column for what was found on Flipkart comes with the review's steps. */
function comparisonCard(ctx, res) {
  const { h, words } = ctx;
  const rows = arr(res?.comparison);
  // Only the screenshots the file has a column for.
  const shots = Array.isArray(res?.shotsHad) ? ['order', 'delivery'].filter((w) => res.shotsHad.includes(w)) : ['order', 'delivery'];
  return h(
    'section',
    { class: 'card', key: 'card-comparison', 'data-id': 'card-comparison' },
    h('h3', null, 'Comparison'),
    rows.length
      ? words.table(
          h,
          ['Field', 'Sheet', ...shots.map((w) => WHAT[w]), 'Result'],
          rows.map((row, i) =>
            h(
              'tr',
              { key: `c${i}` },
              h('th', { scope: 'row' }, row.field ?? ''),
              h('td', { class: 'wrap fk-cell-text' }, row.sheet ?? ''),
              shots.map((w) => h('td', { key: w, class: 'wrap fk-cell-text' }, row[w] ?? '')),
              h('td', { class: `wrap fk-result-cell tone-${row.ok === true ? 'good' : row.ok === false ? 'bad' : 'quiet'}` }, row.result ?? ''),
            ),
          ),
          { class: 'fk-comparison-table' },
        )
      : h('p', { class: 'muted' }, 'The comparison appears when a check finishes.'),
  );
}

/** "Change the result", on a row's page, as on Amazon: the Status, the Type and the Note, then Save. */
function editForm(ctx, r) {
  const { h, words, state } = ctx;
  const e = state.edit;
  if (!e || e.rowId !== r.id) return null;
  const types = arr(state.saved?.types);
  return h(
    'section',
    { class: 'card fk-edit-result', key: 'edit', 'data-id': 'edit-result' },
    h('h3', null, 'Change the result'),
    h('p', { class: 'card-sub' }, 'Choose the Status and the Type, write the Note, then press Save. The row then says "Changed by staff", and the line above the table counts the dashboard\'s result as wrong. "Check every row again" leaves it as you set it; "Check again" on this page replaces it.'),
    h(
      'div',
      { class: 'fk-form-grid' },
      h(
        'div',
        { class: 'fk-form-field' },
        h('label', { class: 'label', for: 'fk-edit-final' }, 'Status'),
        h('select', { id: 'fk-edit-final', value: e.final, disabled: e.busy, 'data-id': 'edit-final', onchange: (ev) => ctx.update((st) => (st.edit.final = ev.target.value)) }, ['pass', 'fail', 'manual'].map((k) => h('option', { key: k, value: k, selected: e.final === k }, FINAL_WORDS[k]))),
      ),
      h(
        'div',
        { class: 'fk-form-field' },
        h('label', { class: 'label', for: 'fk-edit-type' }, 'Type'),
        h('select', { id: 'fk-edit-type', value: e.typeKey, disabled: e.busy, 'data-id': 'edit-type', onchange: (ev) => ctx.update((st) => (st.edit.typeKey = ev.target.value)) }, h('option', { value: '', selected: !e.typeKey }, 'Choose a Type'), types.map((t) => h('option', { key: t.key, value: t.key, selected: e.typeKey === t.key }, t.word))),
      ),
    ),
    h('div', { class: 'fk-form-field fk-wide' }, h('label', { class: 'label', for: 'fk-edit-note' }, 'Note'), h('textarea', { id: 'fk-edit-note', rows: '4', value: e.note, disabled: e.busy, 'data-id': 'edit-note', oninput: (ev) => (e.note = ev.target.value) })),
    words.notice(h, 'error', e.error),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-primary', disabled: e.busy || !e.typeKey, onclick: () => saveResult(ctx), 'data-id': 'save-result' }, icon(h, 'check'), e.busy ? 'Saving…' : 'Save'),
      h('button', { type: 'button', class: 'btn btn-quiet', disabled: e.busy, onclick: () => ctx.update({ edit: null }), 'data-id': 'cancel-result' }, 'Cancel'),
    ),
  );
}

/** A Copy button beside the email address, the subject or the message; "Copied" once it is. */
function copyButton(ctx, which) {
  const { h, state } = ctx;
  const done = state.email?.copied === which;
  return h('button', { type: 'button', class: 'btn btn-small btn-quiet', title: `Copies the ${COPY_WHAT[which]}, to paste into your own email.`, onclick: () => copyWords(ctx, which), 'data-id': `copy-${which}` }, icon(h, done ? 'check' : 'file'), done ? 'Copied' : 'Copy');
}

/** Words typed into the email box: kept as they are typed, and a Copy button that said "Copied" says Copy again. */
const typedInto = (ctx, it, which) => (ev) => {
  it[which] = ev.target.value;
  if (ctx.state.email?.copied === which) ctx.update((st) => (st.email.copied = null));
};

/**
 * The row's screenshots in the email box, as small pictures (each opens large
 * when clicked), each with "Copy picture", to paste it into an email in Gmail
 * or Outlook, and "Save", to attach it as a file.
 */
function emailShots(ctx, r) {
  const { h, state } = ctx;
  const named = Object.fromEntries(arr(state.saved?.sheet?.columns).filter((c) => c?.key).map((c) => [c.key, c.name]));
  const shots = PICTURE_KEYS.flatMap((w) => arr(r.shots?.[w]?.pictures).filter((p) => p?.ok).map((p) => [w, p]));
  return h(
    'div',
    { class: 'fk-form-field', 'data-id': 'email-shots' },
    h('p', { class: 'label' }, 'Screenshots'),
    shots.length
      ? h(
          'div',
          { class: 'fk-user-shots' },
          shots.map(([w, p]) => {
            const id = `${w}-${p.i}`;
            return h(
              'div',
              { key: id, class: 'fk-user-shot' },
              h('p', { class: 'label' }, named[CELL_COLUMN[w]] ?? WHAT[w]),
              thumbButton(ctx, r, w, p, true, 'email-'),
              h(
                'div',
                { class: 'fk-shot-actions' },
                h('button', { type: 'button', class: 'btn btn-small btn-quiet', title: 'Copies the picture, to paste into an email in Gmail or Outlook.', onclick: () => copyPicture(ctx, r, w, p), 'data-id': `copy-picture-${id}` }, icon(h, state.email?.copied === `picture-${id}` ? 'check' : 'image'), state.email?.copied === `picture-${id}` ? 'Copied' : 'Copy picture'),
                h('button', { type: 'button', class: 'btn btn-small btn-quiet', title: 'Saves the picture as a file, to attach to an email.', onclick: () => savePicture(ctx, r, w, p), 'data-id': `save-picture-${id}` }, icon(h, 'download'), 'Save'),
              ),
            );
          }),
        )
      : h('p', { class: 'muted small', 'data-id': 'email-no-shots' }, 'No screenshot of this row is kept yet. They are kept when the row is checked.'),
  );
}

/**
 * The Amazon screen's email box for one row, with nothing ever sent: who the
 * email is to (the reviewer's name, and the email address when the file has
 * an email address column), its subject and its message, which can be
 * changed, each with a Copy button, and the row's screenshots, each with
 * "Copy picture" and "Save"; then Close. No Send button, no Test or Real
 * choice and no Gmail, and the box says so.
 */
function emailBox(ctx, r) {
  const { h, words, state } = ctx;
  const e = state.email;
  if (!e || e.rowId !== r.id) return null;
  const it = e.item;
  const noAddress = it && !it.addressOk ? (it.emailColumn ? it.addressSays : `${it.addressSays} A column named "Email", "Email ID" or "Email Address" in the next file is found by itself.`) : null;
  return h(
    'section',
    { class: 'card fk-email-panel', key: 'email', 'data-id': 'email-panel' },
    h('div', { class: 'card-head' }, h('h2', null, icon(h, 'mail'), 'Prepare email')),
    h('p', { class: 'card-sub', 'data-id': 'email-not-sent' }, 'Nothing is sent from here. Read the email and change its words if you like, then press Copy beside the email address, the subject and the message, and paste each one into your own email. Under it, the row\'s screenshots, to paste in or attach.'),
    e.loading ? h('p', { class: 'muted', role: 'status' }, 'Preparing the email…') : null,
    words.notice(h, 'error', e.error),
    it
      ? h(
          'div',
          { class: 'fk-email-item', key: it.rowId, 'data-id': `email-${it.rowId}` },
          h('div', { class: 'fk-email-head' }, h('h3', { 'data-id': 'email-name' }, `${it.label}: ${it.name}`)),
          h('p', { class: 'fk-email-to fk-copy-line' }, h('span', { class: 'fk-filter-word' }, 'To: '), h('span', { 'data-id': 'email-to' }, [it.reviewer, it.address].filter(Boolean).join(', ') || 'No name and no email address in the file'), it.addressOk ? copyButton(ctx, 'address') : null),
          noAddress ? h('p', { class: 'muted small', 'data-id': 'email-no-address' }, noAddress) : null,
          h('div', { class: 'fk-form-field' }, h('div', { class: 'fk-copy-head' }, h('label', { class: 'label', for: 'fk-email-subject' }, 'Subject'), copyButton(ctx, 'subject')), h('input', { id: 'fk-email-subject', type: 'text', autocomplete: 'off', value: it.subject, 'data-id': 'email-subject', oninput: typedInto(ctx, it, 'subject') })),
          h('div', { class: 'fk-form-field' }, h('div', { class: 'fk-copy-head' }, h('label', { class: 'label', for: 'fk-email-message' }, 'Message'), copyButton(ctx, 'message')), h('textarea', { id: 'fk-email-message', rows: '14', spellcheck: 'true', value: it.message, 'data-id': 'email-message', oninput: typedInto(ctx, it, 'message') })),
          emailShots(ctx, r),
          words.notice(h, 'error', e.copyError),
        )
      : null,
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => ctx.update({ email: null }), 'data-id': 'close-email' }, 'Close')),
  );
}

/**
 * The row's Type and Note, as on Amazon: those of the check that just
 * finished here (just), else those a staff member chose or marked right, with
 * when, else of its last check, else those the file already had. Its Status
 * is not said again here: it is at the top of the page, large, with its
 * reason.
 */
function resultCard(ctx, r, res, just = null) {
  const { h, words } = ctx;
  // A result a staff member changed by hand comes first: the check's own Type and Note no longer count.
  const staff = just ? null : r?.last?.staff ?? null;
  const shown = just ? { type: just.type, note: just.note, at: just.finishedAt } : staff ? { type: r.last.type, note: r.last.note, at: r.last.at } : res?.type ? { type: res.type, note: res.note, at: res.finishedAt } : r?.last ? { type: r.last.type, note: r.last.note, at: r.last.at } : null;
  const when = staff ? `${staff.right ? 'Marked right' : 'Changed'} by staff on ${words.ist(staff.at)}` : shown?.at ? words.ist(shown.at) : null;
  return h(
    'section',
    { class: 'card fk-result-card', 'data-id': 'card-result' },
    h('h3', null, 'Type and Note'),
    shown
      ? h('div', null, h('p', { class: 'fk-row-status' }, h('span', { class: 'tag', 'data-id': 'result-type' }, shown.type), ' ', when ? h('span', { class: 'muted small', 'data-id': 'result-when' }, when) : null), h('p', { class: 'fk-note-text', 'data-id': 'result-note' }, shown.note))
      : r?.prev && !r.recheck
        ? h('div', null, h('p', { class: 'fk-row-status' }, h('span', { class: 'tag' }, r.prev.type || 'No Type'), ' ', h('span', { class: 'muted small' }, 'From the file')), h('p', { class: 'fk-note-text' }, r.prev.note))
        : h('p', { class: 'muted' }, 'Not checked yet.'),
  );
}

/**
 * At the top of a row's page, as on Amazon: its Status, large, in its colour
 * and with its icon, and the reason; at once when a check of the row has just
 * finished here. live: the check running for this row, or just finished, by
 * its own button or one by one; listed: the row as the table has it.
 */
function finalBanner(ctx, live, listed) {
  const { h, state } = ctx;
  const now = Boolean(live?.running);
  const just = !now && FINAL_WORDS[live?.result?.final] ? live.result : null;
  const res = now ? { from: 'now', final: null } : just ? { from: 'check', final: just.final, finalSays: just.finalSays } : resultOf(listed, state);
  const key = res.from !== 'now' && FINAL_WORDS[res.final] ? res.final : null;
  let says;
  if (res.from === 'now') says = 'This row is being checked now.';
  else if (key && res.from === 'check' && res.staff?.right) says = `Marked right by staff on ${ctx.words.ist(res.staff.at)}.${res.finalSays ? ` ${res.finalSays}` : ''}`;
  else if (key && res.from === 'check' && res.staff) says = `Changed by staff on ${ctx.words.ist(res.staff.at)}. "Check again" replaces it with what the dashboard finds.`;
  else if (key && res.from === 'check') says = res.finalSays || 'This row was checked before the dashboard kept a reason for its Status. Press "Check again" to see the reason.';
  else if (key && res.from === 'file') says = 'From the file: the uploaded file already had a Status for this row.';
  else if (isDone(listed)) says = 'This row was checked before Flipkart rows were given a Status. Press "Check again" to give it one.';
  else says = 'Not checked yet.';
  return h(
    'section',
    { class: `fk-final-banner fk-final-banner-${key ?? 'none'}`, key: 'final', 'data-id': 'final-banner' },
    h('p', { class: 'fk-final-big', 'data-id': 'final-word' }, res.from === 'now' ? icon(h, 'spinner', 'icon-spin') : icon(h, FINAL_ICON[key ?? 'none']), key ? FINAL_WORDS[key] : res.from === 'now' ? 'Checking…' : FINAL_NONE),
    h('p', { class: 'fk-final-says', 'data-id': 'final-says' }, says),
  );
}

/** What the check is doing now, and what the Live Flipkart Browser is for: step 7 opens it to read Flipkart's reviews of the campaign's product. No picture of it is taken. flat: drawn inside the live checking area, without a card of its own, as on Amazon. */
function liveCard(ctx, view, { flat = false } = {}) {
  const { h } = ctx;
  return h(
    'section',
    { class: flat ? 'fk-live fk-live-flat' : 'card fk-live', key: 'live', 'data-id': 'live' },
    h('h3', null, icon(h, 'browser'), 'Live Flipkart Browser'),
    flat ? null : h('p', { class: 'card-sub' }, 'The Chrome window named "Live Flipkart Browser" shows each Flipkart page as it opens. Step 7 opens it to read the reviews of the campaign\'s product on Flipkart: the product\'s page, then "See all reviews", newest first, once in a checking run, kept on this computer for every row. The screenshots are read on this computer, without it.'),
    h('p', { class: 'fk-action', role: 'status', 'aria-live': 'polite', 'data-id': 'current-action' }, view.action ?? (view.running ? 'Working…' : 'Not running.')),
    h('p', { class: 'fk-live-empty' }, icon(h, 'image'), 'No pictures are taken of it. What it read shows in the "Found on Flipkart" box.'),
  );
}

/** A check's steps, each marked as it happens. flat: drawn inside the live checking area, as on Amazon. */
function activityCard(ctx, view, { flat = false } = {}) {
  const { h } = ctx;
  const steps = arr(view.steps).length ? view.steps : freshSteps();
  return h(
    'section',
    { class: flat ? 'fk-steps fk-steps-flat' : 'card fk-steps', key: 'activity', 'data-id': 'activity' },
    h('h3', null, icon(h, 'steps'), 'Steps'),
    h(
      'ol',
      { class: 'fk-activity' },
      steps.map((st) => {
        const m = MARKS[st?.state] ?? MARKS.waiting;
        return h(
          'li',
          // A quiet step has the plain look (the Amazon screen's quiet class has no look of its own either).
          { key: `a${st?.n}`, class: m.tone === 'quiet' ? 'fk-step' : `fk-step fk-step-${m.tone}`, 'data-id': `step-${st?.n}` },
          h('span', { class: 'fk-step-mark', 'aria-hidden': 'true' }, m.mark),
          h('div', { class: 'fk-step-body' }, h('span', { class: 'fk-step-name' }, `${st?.n}. ${st?.name ?? ''}`), ' ', h('span', { class: `fk-step-state tone-${m.tone}` }, m.label), st?.detail ? h('p', { class: 'fk-step-detail' }, st.detail) : null),
        );
      }),
    ),
  );
}

function rowPage(ctx) {
  const { h, words, state } = ctx;
  const o = state.open;
  const back = h('button', { type: 'button', class: 'btn btn-quiet fk-back', onclick: () => ctx.go('flipkart'), 'data-id': 'back' }, icon(h, 'back'), 'All rows');
  if (!o || (o.loading && !o.row)) return h('div', { key: 'row-page' }, h('div', { class: 'actions' }, back), h('p', { class: 'muted', role: 'status' }, 'Opening the row…'));
  if (o.error && !o.row) return h('div', { key: 'row-page' }, h('div', { class: 'actions' }, back), words.notice(h, 'error', o.error));
  const r = obj(o.row);
  // The check running for this row: one by one, as the live checking area shows it, or by its own button.
  const inRun = r.id && state.all?.running && state.all.current?.rowId === r.id ? state.all : null;
  const single = !inRun && r.id && state.check && state.check.rowId === r.id ? state.check : null;
  const liveView = inRun ? { ...inRun.view, running: true } : single ? { ...single.view, running: single.running } : null;
  const view = liveView ?? { running: false, steps: arr(o.result?.steps), action: o.result?.finishedAt ? `Last check finished ${words.ist(o.result.finishedAt)}.` : null };
  // What was read: the check running now, as far as it got, or the last check, kept with the row.
  const res = liveView ? liveView.result : o.result;
  const listed = arr(state.saved?.rows).find((x) => x?.id === r.id) ?? r;
  // A check of this row that has just finished here: its Status, Type and Note show at once, before the table is fetched again.
  const just = liveView && !liveView.running && FINAL_WORDS[liveView.result?.final] ? liveView.result : null;
  return h(
    'div',
    { key: 'row-page', 'data-id': 'row-page' },
    h(
      'div',
      { class: 'fk-row-head', key: 'head' },
      back,
      h('h1', { class: 'fk-row-title' }, `${r.label ?? 'Row'}${r.orderId ? `: order ID ${r.orderId}` : ''}`),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn-primary', disabled: busy(state), onclick: () => startCheck(ctx, r.id), 'data-id': 'check' }, icon(h, single?.running ? 'spinner' : isDone(listed) ? 'refresh' : 'play', single?.running ? 'icon-spin' : ''), single?.running ? 'Checking…' : isDone(listed) ? 'Check again' : 'Check'),
        single?.running ? h('button', { type: 'button', class: 'btn btn-danger', onclick: () => stopCheck(ctx), 'data-id': 'stop' }, icon(h, 'stop'), 'Stop') : null,
        h('button', { type: 'button', class: 'btn', disabled: busy(state) || Boolean(state.edit), title: 'Choose the Status, the Type and the Note yourself.', onclick: () => editResult(ctx, listed), 'data-id': 'change-result' }, icon(h, 'edit'), 'Change the result'),
        // "The result is right": only for the dashboard's own result (not one staff chose).
        isDone(listed) && listed.last && !changedByStaff(listed) ? h('button', { type: 'button', class: 'btn', disabled: busy(state) || state.marking || markedRight(listed), title: 'Counts this result as checked by staff and right.', onclick: () => markRight(ctx, listed), 'data-id': 'result-right' }, icon(h, 'check'), markedRight(listed) ? 'Marked right by staff' : state.marking ? 'Marking…' : 'The result is right') : null,
        // "Prepare email", in place of the Amazon screen's "Email this user": only when the row's Type has an email.
        listed.emailKey ? h('button', { type: 'button', class: 'btn', disabled: busy(state) || Boolean(state.email), title: 'Shows the email for this user, to read, change and copy into your own email. Nothing is sent from here.', onclick: () => openEmail(ctx, listed), 'data-id': 'prepare-email' }, icon(h, 'mail'), 'Prepare email') : null,
      ),
    ),
    finalBanner(ctx, liveView, listed),
    words.notice(h, state.notice?.tone ?? 'info', state.notice?.text),
    single?.notice ? words.notice(h, single.notice.tone, single.notice.text) : null,
    editForm(ctx, r),
    emailBox(ctx, r),
    h('div', { class: 'fk-page', key: 'page' }, h('div', { class: 'fk-left' }, resultCard(ctx, listed, res, just), detailsCard(ctx, r), readCards(ctx, res)), h('div', { class: 'fk-right' }, liveCard(ctx, view), activityCard(ctx, view))),
    comparisonCard(ctx, res),
    bigPicture(ctx),
  );
}

function renderScreen(ctx) {
  const { h, words, state } = ctx;
  if (ctx.route) return rowPage(ctx);
  if (!state.loaded) return h('p', { class: 'muted', key: 'opening', role: 'status', 'data-id': 'opening' }, 'Opening the Flipkart rows…');
  const rows = arr(state.saved?.rows);
  return [uploadCard(ctx), words.notice(h, 'error', state.loadError), campaignsCard(ctx), rows.length && !state.columns.need ? overview(ctx, rows) : null, state.saved?.sheet || state.columns.need ? rowsCard(ctx) : null];
}

export default {
  id: 'flipkart',
  initial,
  enter,
  reset,
  render: renderScreen,
  bar: renderBar,
  dropFile,
  dragging,
};
