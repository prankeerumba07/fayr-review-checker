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
// one: each campaign's name, live or ended, and brand, and under each of its
// Flipkart products what was read from Flipkart (its name, its brand, its
// other colours and sizes, and when), or why it is not used. Then, as on
// Amazon, "Start checking" (later "Carry on checking"), which checks the rows
// one by one from the first one not checked yet, with Stop and "Check every
// row again"; while they are checked, the live checking area beside the table
// shows the row being checked and its steps as they run. Then the rows,
// in a table like the Amazon one: every column of the file in its order, with
// its letter, the rows numbered from 1, each link as a small label saying
// where it goes ("Google Drive"), a picture in a cell as "Picture in the
// cell", and Status, Type and Note at the end, empty until rows are checked.
// Each row has a Check button at its end ("Check again" once it is checked),
// and clicking a row opens its page,
// as on Amazon: the row's details, with its screenshots as small pictures
// that open large when clicked (or why one could not be had, in the Amazon
// words), and a check's steps, shown live as each one runs and still shown
// after a reload. For now a check gets the screenshots and reads the purchase
// screenshot on this computer, comparing it with the sheet, and the row's
// page shows what it says (the Amazon screen's "Read from the purchase
// screenshot" card); every other step comes in a later step, and no row gets
// a Status yet: a row counts as checked once its last check finished. No Status cards yet. The local server
// reads and keeps the file and the campaigns, and runs the checks and the
// Google login; this screen only shows them.

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
/** A row with no Status, as on Amazon: no Flipkart row has one yet. */
export const FINAL_NONE = 'Not checked yet';
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
    // The Google login, as the server says it (data.google); error: a button's; lost: the server could not be asked; seq: newer answers win.
    account: { data: null, error: null, lost: null, busy: false, seq: 0 },
    open: null, // the row whose page is open: { id, loading, error, row, result }
    check: null, // the row being checked: { rowId, running, controller, view, notice }
    all: null, // the rows being checked one by one: { running, controller, current, view, paused, summary, notice }
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

/** The table of rows, like the Amazon one: every column of the file in its order, numbered from 1, then Status, Type and Note; the live checking area beside it while the rows are checked one by one. */
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
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Row'), columns.map((c) => h('th', { scope: 'col', key: c.key ?? `c${c.col}`, 'data-col': c.key ?? 'other' }, columnHead(h, c))), h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Check')))),
        h('tbody', null, rows.map((r) => tableRow(ctx, r, columns))),
      ),
    );
  }
  const panel = runPanel(ctx);
  return h(
    'section',
    { class: 'card fk-rows-card', key: 'rows', 'data-id': 'rows' },
    h('div', { class: 'fk-rows-head' }, h('h2', null, 'Rows'), rows.length && !waiting ? h('span', { class: 'fk-rows-count', 'data-id': 'rows-count' }, rowsWord(rows.length)) : null),
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

function campaignForm(ctx, checking) {
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
/** A row that is checked, as the server says: its last check finished. */
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
  const run = { rowId: id, running: true, controller: new AbortController(), view: { ...newView(), action: 'Starting the check…' }, notice: null };
  ctx.update((st) => (st.check = run));
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
 * checks the rows not checked yet, one at a time from the first one, and the
 * table shows each row as soon as it is finished. again: "Check every row
 * again", which removes every row's last check first.
 */
async function checkRows(ctx, { again = false } = {}) {
  const s = ctx.state;
  if (busy(s)) return;
  const run = { running: true, controller: new AbortController(), current: null, view: newView(), paused: null, summary: null, notice: null };
  ctx.update((st) => {
    // An earlier single check's view would hide this one's on the row page.
    if (st.check && !st.check.running) st.check = null;
    st.all = run;
  });
  const isCurrent = () => s.all === run;
  const refreshOpen = (id) => {
    if (id && s.open?.id === id) openRow(ctx, id, { keep: true });
  };
  const out = await ctx.local.stream('POST', `${BASE}/check-all`, again ? { again: true } : {}, (e) => {
    if (!isCurrent()) return;
    if (e?.event === 'run-started') {
      // "Check every row again": the server has removed every row's last check.
      if (e.again) for (const r of arr(s.saved?.rows)) if (r) r.done = false;
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

/** "Check every row again": asks first, then every row's last check goes and the rows are checked from the first one. */
function checkEveryRowAgain(ctx) {
  const n = arr(ctx.state.saved?.rows).length;
  if (!n || busy(ctx.state)) return;
  if (!ctx.confirm(n === 1 ? 'This checks the 1 row again and replaces its last check. Go on?' : `This checks all ${n} rows again and replaces their last checks. Go on?`)) return;
  return checkRows(ctx, { again: true });
}

/** Stop: at once. The row it was on is not checked. */
function stopAll(ctx) {
  ctx.state.all?.controller?.abort();
}

/** Scrolls the table to a row. */
function showRow(ctx, id) {
  const r = arr(ctx.state.saved?.rows).find((x) => x?.id === id);
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

/** The main buttons above the table, as on Amazon: "Start checking" (or "Carry on checking"), Stop while it runs, and "Check every row again". No Status cards yet. */
function overview(ctx, rows) {
  const { h, state } = ctx;
  const running = Boolean(state.all?.running);
  const { total, left } = tallyOf(rows);
  const mark = running ? 'spinner' : total && !left ? 'check' : 'play';
  return h(
    'section',
    { class: 'fk-overview', key: 'overview', 'data-id': 'overview' },
    h(
      'div',
      { class: 'fk-main-actions', 'data-id': 'main-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', disabled: busy(state) || !left, onclick: () => checkRows(ctx), 'data-id': 'start-checking' }, icon(h, mark, running ? 'icon-spin' : ''), runWords(rows, running)),
      running ? h('button', { type: 'button', class: 'btn btn-danger', onclick: () => stopAll(ctx), 'data-id': 'stop-all' }, icon(h, 'stop'), 'Stop') : null,
      h('button', { type: 'button', class: 'btn', disabled: busy(state), onclick: () => checkEveryRowAgain(ctx), 'data-id': 'check-every-row' }, icon(h, 'refresh'), 'Check every row again'),
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

function thumbButton(ctx, r, which, p, large = false) {
  const { h, state } = ctx;
  const url = state.thumbs[thumbKey(r, which, p)];
  return h(
    'button',
    { type: 'button', class: `fk-thumb${large ? ' fk-thumb-large' : ''}`, key: `${which}-${p.i}`, onclick: (e) => { e.stopPropagation(); openBig(ctx, r, which, p); }, 'aria-label': `Enlarge the ${WHAT[which].toLowerCase()} of ${r.label ?? 'this row'}`, 'data-id': `${large ? 'row-' : ''}thumb-${which}-${r.id}-${p.i}` },
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
                  ...(v.message ? [["Flipkart's words", v.message]] : []),
                  ...(v.others ? [['Other reviews on it', String(v.others)]] : []),
                  ...(v.why ? [['Why not certain', v.why]] : []),
                  ['Read by', read(v)],
                ]),
                everything(v.text),
              )
            : h('p', { class: 'muted' }, 'Not read yet.'),
        ),
  ];
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

/** The Type and the Note: none yet for a Flipkart row (the Status comes in a later step), but those the file already had. */
function resultCard(ctx, r) {
  const { h } = ctx;
  return h(
    'section',
    { class: 'card fk-result-card', 'data-id': 'card-result' },
    h('h3', null, 'Type and Note'),
    r?.prev ? h('div', null, h('p', { class: 'fk-row-status' }, h('span', { class: 'tag' }, r.prev.type || 'No Type'), ' ', h('span', { class: 'muted small' }, 'From the file')), h('p', { class: 'fk-note-text' }, r.prev.note)) : h('p', { class: 'muted' }, 'Not checked yet.'),
  );
}

/** At the top of a row's page: its Status, large, and the reason; a Flipkart row has none yet. live: the check running for this row, by its own button or one by one. */
function finalBanner(ctx, live) {
  const { h } = ctx;
  const now = Boolean(live?.running);
  return h(
    'section',
    { class: 'fk-final-banner fk-final-banner-none', key: 'final', 'data-id': 'final-banner' },
    h('p', { class: 'fk-final-big', 'data-id': 'final-word' }, now ? icon(h, 'spinner', 'icon-spin') : icon(h, 'clock'), now ? 'Checking…' : FINAL_NONE),
    h('p', { class: 'fk-final-says', 'data-id': 'final-says' }, now ? 'This row is being checked now.' : 'Not checked yet.'),
  );
}

/** What the check is doing now. The Live Flipkart Browser is not used by the steps that run now: they only open the screenshots. flat: drawn inside the live checking area, without a card of its own, as on Amazon. */
function liveCard(ctx, view, { flat = false } = {}) {
  const { h } = ctx;
  return h(
    'section',
    { class: flat ? 'fk-live fk-live-flat' : 'card fk-live', key: 'live', 'data-id': 'live' },
    h('h3', null, icon(h, 'browser'), 'Live Flipkart Browser'),
    flat ? null : h('p', { class: 'card-sub' }, 'The Chrome window named "Live Flipkart Browser" shows each Flipkart page as it opens. The steps that run now only open the screenshots, so it is not used yet.'),
    h('p', { class: 'fk-action', role: 'status', 'aria-live': 'polite', 'data-id': 'current-action' }, view.action ?? (view.running ? 'Working…' : 'Not running.')),
    h('p', { class: 'fk-live-empty' }, icon(h, 'image'), 'No picture yet. Flipkart pages open in a later step.'),
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
      ),
    ),
    finalBanner(ctx, liveView),
    single?.notice ? words.notice(h, single.notice.tone, single.notice.text) : null,
    h('div', { class: 'fk-page', key: 'page' }, h('div', { class: 'fk-left' }, resultCard(ctx, r), detailsCard(ctx, r), readCards(ctx, res)), h('div', { class: 'fk-right' }, liveCard(ctx, view), activityCard(ctx, view))),
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
