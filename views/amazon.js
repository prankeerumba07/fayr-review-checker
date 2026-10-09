// The Amazon Review Checker screen. The top bar (drawn by app.js) holds the
// dashboard's name, the marketplace tabs and the Amazon login (bar() below).
// The page, from top to bottom: the upload area (one slim line once a file is
// in), the Campaigns box (it folds shut), the four Status cards with the main
// buttons in one row, the table of rows as they are in the file (with the
// live checking area beside it while rows are checked), and "More" at the
// bottom, closed to start with. Each checked row gets a Status (Pass, Fail or
// Needs Manual Staff Checking), a Type and a Note; a staff member can change
// a row's result by hand on its page ("Changed by staff") or mark it right
// ("The result is right"), which the line above the table counts, and email
// the user about what is still needed (one row, or the ticked rows of a
// Type), through Gmail in the Live Amazon Browser: in Test mode only to the
// test email address, in Real mode to each user's own address from the
// file's email address column. Rows of the sheet are numbered from 1 in the
// sheet's order. The local server decides every result; this screen only
// shows it.

const BASE = '/local/amazon';
const ROWS = `${BASE}/rows`;

/** The fields of a row added by hand, each with the file's column it is (column). Each picture is a file or a link. Only the fields the uploaded file has show. */
export const FORM_FIELDS = [
  { key: 'orderId', column: 'orderId', label: 'Order ID' },
  { key: 'orderDate', column: 'orderDate', label: 'Order date', note: 'As the sheet writes it, the day first: 20-07-2026.' },
  { key: 'amount', column: 'amount', label: 'Amount', note: 'In rupees, such as 654 or ₹851.95.' },
  { key: 'product', column: 'product', label: 'Product ordered' },
  { key: 'order', column: 'orderShot', label: 'Purchase screenshot', picture: true },
  { key: 'delivery', column: 'deliveryShot', label: 'Delivery screenshot', picture: true, note: 'Or words such as "Cancelled".' },
  { key: 'review', column: 'reviewLink', label: 'Review link', picture: true, note: 'An Amazon link, or a picture of the review or the rating.' },
  { key: 'reviewShot', column: 'reviewShot', label: 'Review screenshot', picture: true },
];
const TEXT_FIELDS = FORM_FIELDS.filter((f) => !f.picture).map((f) => f.key);
const PICTURE_KEYS = ['order', 'delivery', 'review', 'reviewShot'];
const WHAT = { order: 'Purchase screenshot', delivery: 'Delivery screenshot', review: 'Review screenshot', reviewShot: 'Review screenshot' };
/** The file's column each picture cell is. */
const CELL_COLUMN = { order: 'orderShot', delivery: 'deliveryShot', review: 'reviewLink', reviewShot: 'reviewShot' };
/** The fields the uploaded file has a column for, or null with no file in (every field then). */
const fieldsHad = (sheet) => (sheet?.used && arr(sheet?.has).length ? new Set(sheet.has) : null);

export const STEP_NAMES = [
  'Duplicates and links in the sheet',
  'Opening the purchase screenshot',
  'Reading the purchase screenshot and comparing it with the sheet',
  'Opening the delivery screenshot',
  'Reading the delivery screenshot and comparing it',
  'Opening the review link',
  'Reading the rating and the written words',
  'Opening the product\'s page and "See all reviews"',
  'Searching for the review',
  'Status, Type and Note',
];
export const MARKS = {
  pass: { mark: '✓', label: 'passed', tone: 'good' },
  fail: { mark: '✗', label: 'failed', tone: 'bad' },
  'not-reached': { mark: '–', label: 'not reached', tone: 'quiet' },
  'not-needed': { mark: '○', label: 'not needed', tone: 'quiet' },
  running: { mark: '…', label: 'running', tone: 'info' },
  waiting: { mark: '·', label: 'waiting', tone: 'quiet' },
};
export const NOT_CHECKED = 'Not checked';
/** The top bar's words, one state at a time. */
export const LOGIN_WORDS = {
  checking: 'Checking the Amazon login…',
  in: (name) => `Logged in to Amazon as ${name}`,
  out: 'Not logged in to Amazon',
  outButton: 'Log in to Amazon',
  outHow: "Amazon's login page opens in the Live Amazon Browser window only if you need to log in.",
  waiting: 'Log in in the Live Amazon Browser window, and tick the box that keeps you signed in, so you stay logged in after a restart. This tool never types, stores or reads a password.',
  waitingShort: 'Waiting for you to log in',
  problemShort: 'The login could not be checked',
  problemButton: 'Check the login again',
};
/** The Google login's words in the top bar, one state at a time. The screenshots on Google Drive are downloaded through this login. */
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
/** How often the top bar asks the server about the login. */
export const LOGIN_POLL_MS = 2000;
/** The Status of a checked row, and its colour: green, red or orange. A row not checked yet has none. */
export const FINAL_WORDS = { pass: 'Pass', fail: 'Fail', manual: 'Needs Manual Staff Checking' };
export const FINAL_NONE = 'Not checked yet';
const noFilter = () => ({ final: '', type: '' });
/** Each Status's line icon; a row not checked yet has the clock. */
const FINAL_ICON = { pass: 'pass', fail: 'fail', manual: 'manual', none: 'clock' };

/** A line icon from assets/, drawn by the stylesheet. It has no words of its own: the words next to it say what it means. */
const icon = (h, name, extra = '') => h('span', { class: `icon icon-${name}${extra ? ` ${extra}` : ''}`, 'aria-hidden': 'true' });

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
/** A row that has a result, as the server says: checked, marked Duplicate by another row's check, or given a Status in the file. */
const isDone = (r) => r?.done === true;
/** A result a staff member changed by hand (kept by "Check every row again"); one only marked right by staff is not one. */
const changedByStaff = (r) => Boolean(r?.last?.staff && !r.last.staff.right);
/** A result a staff member marked right ("The result is right"); checking the row again clears the mark. */
const markedRight = (r) => Boolean(r?.last?.staff?.right);
const rowsWord = (n) => (n === 1 ? '1 row' : `${n} rows`);
const blankValues = () => ({ orderId: '', orderDate: '', amount: '', product: '', orderLink: '', deliveryLink: '', reviewLink: '', reviewShotLink: '' });
const noFiles = () => ({ order: null, delivery: null, review: null, reviewShot: null });
const freshSteps = () => STEP_NAMES.map((name, i) => ({ n: i + 1, name, state: 'waiting', detail: null }));
const newView = () => ({ steps: freshSteps(), action: null, shots: [], result: null, done: false, failed: null, paused: null });
const freshColumns = () => ({ need: null, mapping: null, error: null });
const blankCampaign = () => ({ brand: '', name: '', live: true, products: '' });

function initial() {
  return {
    list: { loading: false, error: null, items: null, oldRows: 0, sheet: null, campaigns: [], types: [], emails: null, settingsProblem: null },
    account: { data: null, error: null, lost: null, busy: false }, // error: a button's; lost: the server could not be asked
    upload: { file: null, gen: 0, busy: false, error: null, replace: false, stop: false, done: null, dragging: false },
    fold: { campaigns: null }, // null: the Campaigns box opens by itself only when there is no campaign yet
    columns: freshColumns(), // shown only when a needed column could not be found
    campaigns: { editing: null, values: blankCampaign(), busy: false, error: null, notice: null }, // editing: null, 'new' or a campaign's id
    form: { values: blankValues(), files: noFiles(), gen: 0, saving: false, error: null },
    open: null, // { id, loading, error, row, result, shots }
    check: null, // { rowId, running, controller, view, notice }
    all: null, // the rows being checked one by one: { running, controller, current, view, paused, summary, notice }
    filter: noFilter(),
    thumbs: {}, // `${id}:${which}:${i}:${at}` -> object URL
    big: null, // { title, url, loading, error }
    picked: null,
    notice: null, // { tone, text, route }
    removing: false,
    marking: false, // "The result is right" being saved
    removeError: null,
    rowsNotice: null,
    excel: { busy: false, error: null },
    edit: null, // "Change the result" on a row's page: { rowId, final, typeKey, note, busy, error }
    email: null, // the emails being read before sending: { kind: 'one' | 'many', route, loading, error, items, skipped, sending, controller, action, done, paused, notice }
    address: { value: null, saving: false, error: null, notice: null }, // the Test email address box; value is null until something is typed
    templates: { values: null, saving: false, error: null, notice: null }, // the Email templates box; values is null until something is changed
    poll: null,
    seq: { list: 0, account: 0, open: 0, big: 0, thumbs: 0 },
  };
}

// ---- loading ----

async function loadList(ctx) {
  const s = ctx.state;
  const n = ++s.seq.list;
  ctx.update((st) => {
    st.list.loading = true;
    st.list.error = null;
  });
  try {
    const out = await ctx.local.api('GET', ROWS);
    if (n !== s.seq.list) return;
    ctx.update((st) => {
      st.list = {
        loading: false,
        error: null,
        items: arr(out?.rows),
        oldRows: Number(out?.oldRows) || 0,
        sheet: out?.sheet ?? null,
        campaigns: arr(out?.campaigns),
        types: arr(out?.types),
        emails: out?.emails && typeof out.emails === 'object' ? out.emails : null,
        settingsProblem: out?.settingsProblem ?? null,
      };
    });
    loadThumbs(ctx);
  } catch (err) {
    if (n !== s.seq.list) return;
    ctx.update((st) => Object.assign(st.list, { loading: false, error: err.message }));
  }
}

async function loadAccount(ctx) {
  const s = ctx.state;
  const n = ++s.seq.account;
  try {
    const data = await ctx.local.api('GET', `${BASE}/account`);
    if (n !== s.seq.account) return;
    const reading = s.account.data?.running?.kind === 'campaign' || data?.running?.kind === 'campaign';
    ctx.update((st) => {
      // A button's message goes once the login moves on.
      if (st.account.data?.state !== data?.state || st.account.data?.google?.state !== data?.google?.state) st.account.error = null;
      Object.assign(st.account, { data, lost: null });
    });
    // While a campaign's products are read from Amazon, and once more when that ends, the Campaigns box shows each one's progress.
    if (reading) loadCampaigns(ctx);
  } catch (err) {
    if (n !== s.seq.account) return;
    ctx.update((st) => Object.assign(st.account, { lost: err.message }));
  }
}

/** "Log in to Amazon" (what: 'log-in'), "Check the login again" ('check-login'), or one of the Google login's buttons ('google/…'): the server does it, and the top bar follows it. */
async function startLogin(ctx, what) {
  const s = ctx.state;
  if (s.account.busy) return;
  ctx.update((st) => Object.assign(st.account, { busy: true, error: null }));
  try {
    const data = await ctx.local.api('POST', `${BASE}/${what}`, {});
    // An answer to an earlier question must not draw over this one.
    s.seq.account++;
    ctx.update((st) => Object.assign(st.account, { busy: false, data }));
  } catch (err) {
    ctx.update((st) => Object.assign(st.account, { busy: false, error: err.message }));
  }
}

// ---- small pictures and the big one ----

const thumbKey = (r, which, p) => `${r.id}:${which}:${p.i}:${p.at ?? ''}`;

/** The small pictures of the row whose page is open (the table of rows shows where each link goes instead). */
async function loadThumbs(ctx, extra = []) {
  const s = ctx.state;
  const n = ++s.seq.thumbs;
  const wanted = [...extra];
  const openRow = s.open?.row;
  if (openRow?.id) for (const w of PICTURE_KEYS) for (const p of arr(openRow.shots?.[w]?.pictures)) if (p?.ok) wanted.push([openRow, w, p]);
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
      // that small picture could not be fetched; the cell says so
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

// ---- the sheet ----

/** The kinds of file the file chooser offers: every Excel file and CSV files. A file the dashboard cannot read is told what to do. */
export const SHEET_ACCEPT = '.xlsx,.xlsm,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel,text/csv';

/** What an upload stops first, as its question says it. */
const STOPS_FIRST = {
  run: 'Rows are being checked right now: OK stops the checking first, then uploads the new file.',
  check: 'A row is being checked right now: OK stops that check first, then uploads the new file.',
  campaign: "A campaign's products are being read from Amazon right now: OK stops that first, then uploads the new file.",
};

/** The one question asked before a file is uploaded: about the n rows of the file before, and what runs ('run', 'check' or 'campaign'). Null when there is nothing to ask. */
export function uploadQuestion(n, kind) {
  const says = [];
  if (n) says.push(n === 1 ? 'This replaces the 1 row and its result with the rows of the new file.' : `This replaces all ${n} rows and their results with the rows of the new file.`);
  if (STOPS_FIRST[kind]) says.push(STOPS_FIRST[kind]);
  return says.length ? `${says.join(' ')} Go on?` : null;
}

/**
 * A file chosen, or dropped anywhere on the main page, is uploaded at once,
 * with no other button to press. When rows of a file are in, it asks once
 * first, since they and their results go; when rows are being checked or a
 * campaign's products are being read, the same question says so, and OK
 * stops that first. The rows added by hand and the campaigns stay.
 */
async function uploadFile(ctx, file) {
  const s = ctx.state;
  if (!file) return;
  if (s.upload.busy) {
    ctx.update((st) => (st.upload.error = `"${st.upload.file?.name || 'The last file'}" is still being uploaded, so wait for it to finish, then upload "${file.name || 'the new file'}" again.`));
    return;
  }
  // What runs right now, as the server says, so the question can say so.
  let data = s.account.data;
  try {
    data = await ctx.local.api('GET', `${BASE}/account`);
  } catch {
    // what the top bar heard last, then
  }
  const kind = s.all?.running ? 'run' : s.check?.running ? 'check' : data?.running?.kind ?? null;
  const n = arr(s.list.items).filter((r) => r?.source === 'sheet').length;
  const question = uploadQuestion(n, kind);
  if (question && !ctx.confirm(question)) {
    ctx.update((st) => Object.assign(st.upload, { gen: st.upload.gen + 1, error: null }));
    return;
  }
  ctx.update((st) => {
    Object.assign(st.upload, { file, gen: st.upload.gen + 1, error: null, done: null, replace: n > 0, stop: Boolean(STOPS_FIRST[kind]) });
    st.columns = freshColumns();
    st.rowsNotice = null;
  });
  return sendSheet(ctx);
}

/**
 * Sends the file being uploaded; the server makes its rows at once. When a
 * needed column could not be found, nothing changed: the column chooser
 * shows, and "Use these columns" sends the same file again with the columns
 * chosen, with the answer to the question asked before.
 */
async function sendSheet(ctx, mapping = null) {
  const s = ctx.state;
  const up = s.upload;
  const file = up.file;
  if (!file || (mapping && up.busy)) return;
  ctx.update((st) => {
    Object.assign(st.upload, { busy: true, error: null });
    if (mapping) st.columns.error = null;
  });
  try {
    const fd = new FormData();
    fd.append('file', file, file.name || 'sheet');
    if (up.replace) fd.append('replace', '1');
    if (up.stop) fd.append('stop', '1');
    if (mapping) fd.append('mapping', JSON.stringify(mapping));
    const out = await ctx.local.form(`${BASE}/sheet`, fd);
    if (out?.columns) {
      ctx.update((st) => {
        st.upload.busy = false;
        st.columns = { need: out.columns, mapping: { ...obj(out.columns.mapping) }, error: null };
      });
      return;
    }
    // The rows were replaced: what the screen showed about the old ones goes, a check this stopped too (the server has ended it).
    ctx.update((st) => {
      for (const key of ['all', 'check']) {
        const run = st[key];
        if (!run?.running) continue;
        run.controller?.abort();
        revokeAll(ctx, run.view.shots);
        st[key] = null;
      }
    });
    forget(ctx, null);
    ctx.update((st) => {
      st.upload = { file: null, gen: st.upload.gen + 1, busy: false, error: null, replace: false, stop: false, dragging: false, done: { made: Number(out?.made) || 0, tab: out?.tab ?? '', unplaced: arr(out?.unplaced) } };
      st.columns = freshColumns();
      st.list.sheet = out?.sheet ?? st.list.sheet;
    });
    loadList(ctx);
    if (up.stop) loadAccount(ctx);
  } catch (err) {
    ctx.update((st) => {
      st.upload.busy = false;
      if (mapping) st.columns.error = err.message;
      else Object.assign(st.upload, { file: null, gen: st.upload.gen + 1, error: err.message, replace: false, stop: false });
    });
    // Rows may have been checked since the screen last showed them, or something else may have started.
    if (err?.status === 409) {
      loadList(ctx);
      loadAccount(ctx);
    }
  }
}

/** A file dropped anywhere on the main page (app.js passes it on) is uploaded at once. A row's page leaves it. */
function dropFile(ctx, file) {
  if (ctx.route || !file) return;
  return uploadFile(ctx, file);
}

/** A file held over the page lights up the upload line (app.js says when). */
function dragging(ctx, on) {
  if (Boolean(ctx.state.upload.dragging) !== Boolean(on)) ctx.update((st) => (st.upload.dragging = Boolean(on)));
}

function setColumn(ctx, key, raw) {
  ctx.update((st) => {
    st.columns.mapping = st.columns.mapping ?? {};
    st.columns.mapping[key] = raw === '' ? null : Number(raw);
  });
}

// ---- the Campaigns box ----

async function loadCampaigns(ctx) {
  try {
    const out = await ctx.local.api('GET', `${BASE}/campaigns`);
    ctx.update((st) => (st.list.campaigns = arr(out?.campaigns)));
  } catch {
    // shown again at the next look
  }
}

/** "Add a campaign" (id null) or "Change": the form, filled with the campaign as it is. */
function editCampaign(ctx, id) {
  const c = id ? arr(ctx.state.list.campaigns).find((x) => x?.id === id) : null;
  ctx.update((st) => {
    st.campaigns = { ...st.campaigns, editing: c ? c.id : 'new', values: c ? { brand: c.brand ?? '', name: c.name ?? '', live: c.live !== false, products: arr(c.products).map((p) => p.given).join('\n') } : blankCampaign(), error: null, notice: null };
  });
}

async function saveCampaign(ctx) {
  const s = ctx.state;
  const c = s.campaigns;
  if (c.busy || !c.editing) return;
  ctx.update((st) => Object.assign(st.campaigns, { busy: true, error: null, notice: null }));
  try {
    const path = c.editing === 'new' ? `${BASE}/campaigns` : `${BASE}/campaigns/${encodeURIComponent(c.editing)}`;
    const out = await ctx.local.api('POST', path, { ...c.values });
    const waiting = arr(out?.campaign?.products).some((p) => p?.state === 'waiting' || p?.state === 'reading');
    ctx.update((st) => {
      st.list.campaigns = arr(out?.campaigns);
      st.campaigns = { editing: null, values: blankCampaign(), busy: false, error: null, notice: waiting ? 'The campaign was saved. Its products are being read from Amazon in the Live Amazon Browser, one page at a time.' : 'The campaign was saved.' };
    });
    loadAccount(ctx);
  } catch (err) {
    ctx.update((st) => Object.assign(st.campaigns, { busy: false, error: err.message }));
  }
}

/** "End campaign", "Delete" (asked first) and "Read the products again". */
async function campaignAction(ctx, id, action) {
  const s = ctx.state;
  const x = arr(s.list.campaigns).find((c) => c?.id === id);
  if (!x || s.campaigns.busy) return;
  if (action === 'delete' && !ctx.confirm(`Delete the campaign "${x.name}"? This cannot be undone.`)) return;
  ctx.update((st) => Object.assign(st.campaigns, { busy: true, error: null, notice: null }));
  try {
    const out = await ctx.local.api('POST', `${BASE}/campaigns/${encodeURIComponent(id)}/${action}`, {});
    ctx.update((st) => {
      st.list.campaigns = arr(out?.campaigns);
      Object.assign(st.campaigns, { busy: false, notice: { end: `The campaign "${x.name}" has ended. It is no longer used.`, delete: `The campaign "${x.name}" was deleted.`, read: `The products of "${x.name}" are being read from Amazon again.` }[action] });
      if (action === 'delete' && st.campaigns.editing === id) Object.assign(st.campaigns, { editing: null, values: blankCampaign() });
    });
    loadAccount(ctx);
  } catch (err) {
    ctx.update((st) => Object.assign(st.campaigns, { busy: false, error: err.message }));
  }
}

// ---- adding a row by hand ----

async function addRow(ctx) {
  const s = ctx.state;
  if (s.form.saving) return;
  ctx.update((st) => {
    Object.assign(st.form, { saving: true, error: null });
    st.rowsNotice = null;
  });
  try {
    const fd = new FormData();
    for (const k of TEXT_FIELDS) fd.append(k, s.form.values[k] ?? '');
    for (const w of PICTURE_KEYS) {
      fd.append(`${w}Link`, s.form.values[`${w}Link`] ?? '');
      if (s.form.files[w]) fd.append(w, s.form.files[w], s.form.files[w].name || w);
    }
    const out = await ctx.local.form(ROWS, fd);
    ctx.update((st) => {
      st.form = { values: blankValues(), files: noFiles(), gen: st.form.gen + 1, saving: false, error: null };
      st.notice = { tone: 'good', text: 'The row was added.', route: out?.row?.id ?? '' };
    });
    loadList(ctx);
    if (out?.row?.id) ctx.go(`amazon/${out.row.id}`);
  } catch (err) {
    ctx.update((st) => Object.assign(st.form, { saving: false, error: err.message }));
  }
}

// ---- one row's page ----

function revokeAll(ctx, list) {
  for (const x of arr(list)) if (x?.url) ctx.local.revoke(x.url);
}

async function fetchShots(ctx, steps, isCurrent) {
  const shots = [];
  for (const st of arr(steps)) {
    if (!st?.shot) continue;
    try {
      const url = await ctx.local.image(st.shot);
      if (!isCurrent()) {
        ctx.local.revoke(url);
        revokeAll(ctx, shots);
        return null;
      }
      shots.push({ n: st.n, name: st.name, url });
    } catch {
      // that picture could not be fetched; the step still shows
    }
  }
  return shots;
}

function closeRow(ctx) {
  const s = ctx.state;
  revokeAll(ctx, s.open?.shots);
  s.open = null;
  s.picked = null;
  s.seq.open++;
  ctx.update();
}

async function openRow(ctx, id, { keep = false } = {}) {
  const s = ctx.state;
  if (!keep) closeRow(ctx);
  const n = ++s.seq.open;
  ctx.update((st) => {
    if (!keep || !st.open) st.open = { id, loading: true, error: null, row: null, result: null, shots: [] };
    else st.open.loading = true;
  });
  try {
    const out = await ctx.local.api('GET', `${ROWS}/${encodeURIComponent(id)}`);
    if (n !== s.seq.open || s.open?.id !== id) return;
    const result = out?.result ?? null;
    const old = s.open.shots;
    const liveNow = rowBeingChecked(s) === id;
    const shots = liveNow ? [] : await fetchShots(ctx, result?.steps, () => n === s.seq.open && s.open?.id === id);
    if (shots === null || n !== s.seq.open || s.open?.id !== id) {
      revokeAll(ctx, shots);
      return;
    }
    revokeAll(ctx, old);
    ctx.update((st) => Object.assign(st.open, { loading: false, row: out?.row ?? null, result, shots }));
    const row = out?.row;
    if (row) loadThumbs(ctx, PICTURE_KEYS.flatMap((w) => arr(row.shots?.[w]?.pictures).filter((p) => p?.ok).map((p) => [row, w, p])));
  } catch (err) {
    if (n !== s.seq.open || s.open?.id !== id) return;
    ctx.update((st) => Object.assign(st.open, { loading: false, error: err.message }));
  }
}

// ---- checking ----

const busy = (s) => Boolean(s.check?.running || s.all?.running || s.upload.busy || s.email?.sending);
/** The row being checked at this moment, by its own button or one by one; null when none. */
const rowBeingChecked = (s) => (s?.check?.running ? s.check.rowId : s?.all?.running && s.all.current && !s.all.current.finished ? s.all.current.rowId : null);
/** The remove buttons wait while anything runs: a check, the rows being checked one by one, a sheet being uploaded, or another removal. */
const removeBlocked = (s) => Boolean(busy(s) || s.removing);

async function fetchStepShot(ctx, view, step, isCurrent) {
  try {
    const url = await ctx.local.image(step.shot);
    if (!isCurrent()) {
      ctx.local.revoke(url);
      return;
    }
    const old = view.shots.find((x) => x.n === step.n);
    if (old) ctx.local.revoke(old.url);
    view.shots = view.shots.filter((x) => x.n !== step.n).concat({ n: step.n, name: step.name, url }).sort((a, b) => a.n - b.n);
    ctx.update();
  } catch {
    // the picture could not be fetched; the step still shows
  }
}

/** One check's line, onto its view: started, action, step, done, paused, failed. */
function applyCheckEvent(ctx, view, e, isCurrent) {
  // A step's picture belongs to this view only; one that arrives after the next row has started is let go.
  if (e?.event === 'started') {
    view.steps = arr(e.steps).length ? arr(e.steps).map((name, i) => ({ n: i + 1, name, state: 'waiting', detail: null })) : freshSteps();
  } else if (e?.event === 'action') {
    view.action = typeof e.says === 'string' ? e.says : view.action;
  } else if (e?.event === 'step' && e.step && Number.isInteger(e.step.n)) {
    const i = e.step.n - 1;
    if (i >= 0 && i < STEP_NAMES.length) view.steps[i] = { ...view.steps[i], ...e.step };
    if (e.partial) view.result = { ...obj(view.result), ...e.partial };
    if (e.step.shot) fetchStepShot(ctx, view, e.step, isCurrent);
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

async function startCheck(ctx, id) {
  const s = ctx.state;
  if (busy(s)) return;
  // A result a staff member changed by hand: "Check again" asks first, then replaces it.
  const listed = arr(s.list.items).find((x) => x?.id === id);
  if (changedByStaff(listed) && !ctx.confirm('A staff member changed this row\'s result by hand. "Check again" replaces it with what the dashboard finds. Go on?')) return;
  if (markedRight(listed) && !ctx.confirm('A staff member marked this row\'s result as right. "Check again" checks it afresh and clears that mark. Go on?')) return;
  if (s.check) revokeAll(ctx, s.check.view.shots);
  const run = { rowId: id, running: true, controller: new AbortController(), view: { ...newView(), action: 'Starting the check…' }, notice: null };
  ctx.update((st) => {
    st.check = run;
    st.picked = null;
    st.notice = null;
    st.rowsNotice = null;
  });
  const isCurrent = () => s.check === run;
  const out = await ctx.local.stream('POST', `${ROWS}/${encodeURIComponent(id)}/check`, {}, (e) => {
    if (!isCurrent()) return;
    applyCheckEvent(ctx, run.view, e, isCurrent);
    ctx.update();
  }, run.controller.signal);
  if (!isCurrent()) return;
  const button = isDone(arr(s.list.items).find((x) => x?.id === id)) ? '"Check again"' : 'Check';
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
  loadList(ctx);
  loadAccount(ctx);
  if (s.open?.id === id) openRow(ctx, id, { keep: true });
}

/** Puts rows the server sent (the row just checked, and any row it made Duplicate) into the table in their places. */
function putRows(s, list) {
  const items = arr(s.list.items);
  for (const r of arr(list)) {
    const i = items.findIndex((x) => x?.id === r?.id);
    if (i >= 0) items[i] = r;
  }
}

export const STOPPED_SAYS = 'Stopped. The rows finished before it keep their results. The row it was on has no result, so it is the first one checked next time.';

/**
 * "Start checking" (later "Carry on checking"): the server checks the rows
 * that have no result yet, one at a time from the top, and says each row's
 * Status, Type and Note as soon as it is finished. again: "Check every row
 * again", which removes every result first.
 */
async function checkRows(ctx, { again = false } = {}) {
  const s = ctx.state;
  if (busy(s)) return;
  if (s.all) revokeAll(ctx, s.all.view.shots);
  const run = { running: true, controller: new AbortController(), current: null, view: newView(), paused: null, summary: null, notice: null };
  ctx.update((st) => {
    // An earlier single check's view would hide this one's on the row page.
    if (st.check && !st.check.running) {
      revokeAll(ctx, st.check.view.shots);
      st.check = null;
    }
    st.all = run;
    st.notice = null;
    st.rowsNotice = null;
    st.picked = null;
  });
  const isCurrent = () => s.all === run;
  const refreshOpen = (id) => {
    if (id && s.open?.id === id) openRow(ctx, id, { keep: true });
  };
  const out = await ctx.local.stream('POST', `${BASE}/check-all`, again ? { again: true } : {}, (e) => {
    if (!isCurrent()) return;
    if (e?.event === 'run-started') {
      // "Check every row again": the server has removed every result.
      if (e.again) for (const r of arr(s.list.items)) if (r && !changedByStaff(r)) Object.assign(r, { last: null, done: false, recheck: true });
    } else if (e?.event === 'row') {
      revokeAll(ctx, run.view.shots);
      run.view = { ...newView(), action: 'Starting the check…' };
      run.current = { rowId: e.rowId, label: e.label ?? '' };
      s.picked = null;
    } else if (e?.event === 'row-done') {
      // The row's Status, Type and Note show in its line at once, before the next row starts, and the counts change with them.
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
      const view = run.view;
      applyCheckEvent(ctx, view, e, () => isCurrent() && run.view === view);
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
      run.notice = { tone: 'error', text: `The connection to the dashboard's server broke before checking finished. The rows finished before it keep their results. Press "Carry on checking" to go on from the row it was on.` };
    }
  });
  loadList(ctx);
  loadAccount(ctx);
  refreshOpen(run.current?.rowId);
}

/** "Check every row again": asks first, then every result goes and the rows are checked from the first one. */
function checkEveryRowAgain(ctx) {
  const items = arr(ctx.state.list.items);
  const n = items.length;
  if (!n || busy(ctx.state)) return;
  // Rows whose result a staff member changed by hand keep it and are passed by; a result only marked right is checked again, and its mark goes.
  const kept = items.filter(changedByStaff).length;
  const marked = items.filter(markedRight).length;
  if (kept === n) {
    ctx.update((st) => (st.rowsNotice = { tone: 'warn', text: kept === 1 ? 'The 1 row was changed by staff, so it keeps its result and there is nothing to check again.' : `All ${n} rows were changed by staff, so they keep their results and there is nothing to check again.` }));
    return;
  }
  const marks = marked ? ` The ${rowsWord(marked)} marked right by staff ${marked === 1 ? 'loses its mark' : 'lose their marks'}.` : '';
  const question = kept ? `This checks the ${rowsWord(n - kept)} not changed by staff again and replaces their results. The ${rowsWord(kept)} changed by staff ${kept === 1 ? 'keeps its result' : 'keep their results'}.${marks} Go on?` : n === 1 ? `This checks the 1 row again and replaces its result.${marks} Go on?` : `This checks all ${n} rows again and replaces their results.${marks} Go on?`;
  if (!ctx.confirm(question)) return;
  return checkRows(ctx, { again: true });
}

/** Stop: at once. The row it was on gets no result. */
function stopAll(ctx) {
  ctx.state.all?.controller?.abort();
}

/** Scrolls the table to a row, showing every row first when a filter hides it. */
function showRow(ctx, id) {
  const r = arr(ctx.state.list.items).find((x) => x?.id === id);
  if (r && !passesFilter(r, ctx.state.filter)) ctx.update((st) => (st.filter = noFilter()));
  ctx.reveal?.(`row-${id}`, 'center');
}

function stopCheck(ctx) {
  ctx.state.check?.controller?.abort();
}

// ---- downloads ----

/** "The results only": Row (its number on the dashboard), Order ID, Status, Type and Note. A row not checked yet has no Status. */
function downloadCsv(ctx) {
  const rows = [['Row', 'Order ID', 'Status', 'Type', 'Note']];
  for (const r of arr(ctx.state.list.items)) {
    const shown = resultOf(r, null);
    rows.push([r?.source === 'sheet' ? r?.n ?? '' : r?.label ?? '', r?.orderId ?? '', shown.from ? FINAL_WORDS[shown.final] ?? '' : '', shown.type, shown.note]);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  ctx.download(`amazon-review-results-${stamp}.csv`, ctx.words.csv(rows));
}

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

// ---- a result changed by a staff member ----

/** The key of a Type word, from the server's list; '' when it is not one of them. */
const typeKeyOfWord = (types, word) => arr(types).find((t) => sameWord(t?.word, word))?.key ?? '';

/** "Change the result": the form, filled with the row's result as it is. */
function editResult(ctx, r) {
  const res = resultOf(r, null);
  ctx.update((st) => {
    st.edit = { rowId: r.id, final: FINAL_WORDS[res.final] ? res.final : 'manual', typeKey: r?.last?.typeKey ?? typeKeyOfWord(st.list.types, res.type), note: res.note ?? '', busy: false, error: null };
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
      st.edit = null;
      st.notice = { tone: 'good', text: 'The result was changed. This row now says "Changed by staff", and the downloaded Excel file keeps what you chose.', route: e.rowId };
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

// ---- emails to users ----

/** "Email this user" (one row) or "Email these users" (the rows shown): every email first, filled in for each row, with nothing ticked yet. */
async function openEmails(ctx, kind, rowIds) {
  const s = ctx.state;
  if (busy(s) || !arr(rowIds).length) return;
  // mode: Test (every email to the test email address) to start with; Real (each to the user's own address from the file) can be chosen when the file has an email address column.
  const panel = { kind, route: ctx.route || '', rowIds, mode: 'test', loading: true, error: null, items: [], skipped: [], sending: false, controller: null, action: null, done: null, paused: null, notice: null };
  ctx.update((st) => {
    st.email = panel;
    st.notice = null;
    st.rowsNotice = null;
  });
  try {
    const out = kind === 'one' ? await ctx.local.api('GET', `${ROWS}/${encodeURIComponent(rowIds[0])}/email`) : await ctx.local.api('POST', `${BASE}/emails/preview`, { rowIds });
    if (s.email !== panel) return;
    ctx.update((st) => {
      panel.loading = false;
      panel.items = arr(out?.emails).map((e) => ({ ...e, ticked: false, state: null, says: null }));
      panel.skipped = arr(out?.skipped);
      if (st.list.emails) {
        if (typeof out?.testEmail === 'string') st.list.emails.testEmail = out.testEmail;
        if (typeof out?.emailColumn === 'boolean') st.list.emails.emailColumn = out.emailColumn;
      }
    });
    if (kind === 'many') ctx.reveal?.('email-panel');
  } catch (err) {
    if (s.email !== panel) return;
    ctx.update(() => Object.assign(panel, { loading: false, error: err.message }));
  }
}

function closeEmails(ctx) {
  const s = ctx.state;
  s.email?.controller?.abort();
  s.email = null;
  ctx.update();
}

/** Stop, while emails are sent: the email being sent may still go (it is then "maybe sent"); the ones after it are not tried. */
function stopEmails(ctx) {
  ctx.state.email?.controller?.abort();
}

/** The emails Send would send now: the one email, or the ticked ones; in Real mode only the rows with an email address in the file. */
function chosenEmails(e) {
  const items = e.kind === 'one' ? e.items : e.items.filter((x) => x.ticked);
  return e.mode === 'real' ? items.filter((x) => x.addressOk) : items;
}

/** After sending or Stop: each number on its own line. */
export function summaryLines(done) {
  const { sent = 0, maybe = 0, failed = 0, notTried = 0 } = done ?? {};
  const lines = [`Sent: ${sent}`];
  if (maybe) lines.push(`Maybe sent (look in your Sent emails): ${maybe}`);
  lines.push(`Not sent because of a problem: ${failed}`, `Not tried: ${notTried}`);
  return lines;
}

const LOST_SAYS = 'The dashboard lost track of this email while it was being sent, so it may have gone. Look in your Sent emails, or reload this page and look at this row, before sending it again.';

/**
 * Send, or "Send to the ticked users": each chosen email as it is on the
 * screen now, through Gmail in the Live Amazon Browser; in Test mode only
 * to the test email address, in Real mode (asked first) to each user's own
 * address. A row emailed before is asked about first. At the end, each
 * email says what happened to it, and the numbers are said on their own
 * lines.
 */
async function sendEmails(ctx) {
  const s = ctx.state;
  const e = s.email;
  if (!e || e.sending || e.loading || busy(s)) return;
  const mode = e.mode === 'real' ? 'real' : 'test';
  if (mode === 'test' && !s.list.emails?.testEmail) {
    ctx.update(() => (e.error = 'Fill in the Test email address first: every email goes to that address.'));
    return;
  }
  if (mode === 'real' && !s.list.emails?.emailColumn) {
    ctx.update(() => (e.error = 'This file has no email address column, so emails can only go to the test email address. Choose Test.'));
    return;
  }
  const chosen = chosenEmails(e);
  if (!chosen.length) {
    ctx.update(() => (e.error = e.kind === 'one' ? 'This row has no email address in the file, so its email cannot go to the user. Choose Test.' : 'Tick at least one user first.'));
    return;
  }
  const again = chosen.filter((x) => x.emailedBefore);
  if (again.length) {
    const one = again[0];
    const question = again.length === 1 ? `${one.label} ${one.emailedBefore.maybe ? 'may have been' : 'was'} emailed before, on ${ctx.words.ist(one.emailedBefore.at)} (${one.emailedBefore.name}). Send it another email?` : `${again.length} of these rows were emailed before, or may have been: ${again.map((x) => x.label).join(', ')}. Send them another email?`;
    if (!ctx.confirm(question)) return;
  }
  if (mode === 'real' && !ctx.confirm(chosen.length === 1 ? "This sends 1 email to the user's own email address. Go on?" : `This sends ${chosen.length} emails to the users' own email addresses. Go on?`)) return;
  const controller = new AbortController();
  ctx.update(() => {
    Object.assign(e, { sending: true, controller, error: null, done: null, paused: null, notice: null, action: 'Starting…' });
    for (const it of e.items) Object.assign(it, { state: chosen.includes(it) ? 'waiting' : null, says: null });
  });
  const isCurrent = () => s.email === e && e.controller === controller;
  const item = (id) => e.items.find((x) => x.rowId === id);
  let ended = false;
  const out = await ctx.local.stream('POST', `${BASE}/emails/send`, { mode, emails: chosen.map((x) => ({ rowId: x.rowId, key: x.key, subject: x.subject, message: x.message })) }, (ev) => {
    if (!isCurrent()) return;
    if (ev?.event === 'email') {
      const it = item(ev.rowId);
      if (it) it.state = 'sending';
      e.action = `Sending ${ev.index} of ${ev.total}: ${ev.label ?? ''}`;
    } else if (ev?.event === 'action') e.action = typeof ev.says === 'string' ? ev.says : e.action;
    else if (ev?.event === 'email-sent') {
      const it = item(ev.rowId);
      if (it) Object.assign(it, { state: 'sent', at: ev.at, says: null });
      putRows(s, ev.rows);
    } else if (ev?.event === 'email-maybe') {
      const it = item(ev.rowId);
      if (it) Object.assign(it, { state: 'maybe', at: ev.at, says: ev.says });
      putRows(s, ev.rows);
    } else if (ev?.event === 'email-failed') {
      const it = item(ev.rowId);
      if (it) Object.assign(it, { state: 'failed', says: ev.says });
    } else if (ev?.event === 'paused') {
      e.paused = { kind: ev.kind, says: ev.says, label: ev.label ?? '' };
      // The email it stopped at was not sent (unless the server already said it may have been).
      const it = item(ev.rowId);
      if (it && it.state === 'sending') Object.assign(it, { state: 'failed', says: ev.says });
      ended = true;
    } else if (ev?.event === 'emails-done' || ev?.event === 'emails-stopped') {
      e.done = { stopped: ev.event === 'emails-stopped' };
      ended = true;
    } else if (ev?.event === 'failed') {
      e.notice = { tone: 'error', text: ev.says };
      ended = true;
    }
    ctx.update();
  }, controller.signal);
  if (!isCurrent()) return;
  ctx.update(() => {
    Object.assign(e, { sending: false, controller: null, action: null });
    for (const it of chosen) {
      // Stopped, or the connection broke, while this one was being sent: it may still have gone. Never started: not tried.
      if (it.state === 'sending') Object.assign(it, { state: 'maybe', says: LOST_SAYS });
      else if (it.state === 'waiting') Object.assign(it, { state: 'untried', says: null });
    }
    const count = (state) => chosen.filter((x) => x.state === state).length;
    e.done = { sent: count('sent'), maybe: count('maybe'), failed: count('failed'), notTried: count('untried'), total: chosen.length, stopped: out.aborted || Boolean(e.done?.stopped) || Boolean(e.paused) };
    if (!out.ok && !out.aborted) e.notice = { tone: 'error', text: out.message };
    else if (out.aborted) e.notice = { tone: 'warn', text: 'Sending was stopped. The emails marked Sent were sent; each of the others says what happened to it.' };
    else if (e.paused) e.notice = { tone: 'warn', text: e.paused.says };
    else if (e.notice) {
      // the server's own sentence about what went wrong stays
    } else if (!ended) e.notice = { tone: 'error', text: "The connection to the dashboard's server broke before sending finished. The emails marked Sent were sent. Look in your Sent emails before sending the others again." };
    else if (e.done.sent === chosen.length) e.notice = { tone: 'good', text: chosen.length === 1 ? 'The email was sent.' : `All ${chosen.length} emails were sent.` };
    else e.notice = { tone: 'warn', text: 'Sending finished, but not every email was sent. Each email below says what happened to it.' };
  });
  loadList(ctx);
  loadAccount(ctx);
  if (s.open?.id) openRow(ctx, s.open.id, { keep: true });
}

/** The Test email address box: saved for next time. */
async function saveAddress(ctx) {
  const s = ctx.state;
  const a = s.address;
  if (a.saving) return;
  const value = String(a.value ?? s.list.emails?.testEmail ?? '').trim();
  ctx.update((st) => Object.assign(st.address, { saving: true, error: null, notice: null }));
  try {
    const out = await ctx.local.api('POST', `${BASE}/email-address`, { email: value });
    const saved = typeof out?.testEmail === 'string' ? out.testEmail : value;
    ctx.update((st) => {
      if (st.list.emails) st.list.emails.testEmail = saved;
      Object.assign(st.address, { saving: false, value: null, notice: saved ? `Saved. Every email goes to ${saved}.` : 'Saved. There is no test email address now, so nothing can be sent until one is filled in.' });
    });
  } catch (err) {
    ctx.update((st) => Object.assign(st.address, { saving: false, error: err.message }));
  }
}

/** The Email templates box: the sign-off and every email, saved in the settings file. */
async function saveTemplates(ctx) {
  const s = ctx.state;
  const t = s.templates;
  if (t.saving || !t.values) return;
  ctx.update((st) => Object.assign(st.templates, { saving: true, error: null, notice: null }));
  try {
    const out = await ctx.local.api('POST', `${BASE}/emails/templates`, { signOff: t.values.signOff, templates: t.values.templates });
    ctx.update((st) => {
      if (out?.emails && typeof out.emails === 'object') st.list.emails = { ...out.emails, testEmail: st.list.emails?.testEmail ?? out.emails.testEmail };
      st.templates = { values: null, saving: false, error: null, notice: 'The emails were saved in the settings file. The next email uses the new words.' };
    });
  } catch (err) {
    ctx.update((st) => Object.assign(st.templates, { saving: false, error: err.message }));
  }
}

// ---- removing rows ----

/** Lets go of what the screen shows about removed rows: their check, their page, an enlarged picture. ids null means every row. */
function forget(ctx, ids) {
  const s = ctx.state;
  const gone = (id) => ids === null || ids.includes(id);
  if (s.check && !s.check.running && gone(s.check.rowId)) {
    revokeAll(ctx, s.check.view.shots);
    s.check = null;
  }
  if (s.all && !s.all.running && (ids === null || (s.all.current && gone(s.all.current.rowId)))) {
    revokeAll(ctx, s.all.view.shots);
    s.all = null;
  }
  if (s.open && gone(s.open.id)) closeRow(ctx);
  if (s.big) closeBig(ctx);
  if (ids === null) s.upload.done = null;
}

async function deleteRow(ctx, id) {
  const s = ctx.state;
  if (!id || removeBlocked(s)) return;
  if (!ctx.confirm('Delete this row and its pictures from this dashboard? This cannot be undone.')) return;
  ctx.update((st) => {
    st.removing = true;
    st.notice = null;
    st.rowsNotice = null;
  });
  let text = 'The row and its pictures were deleted. Its check results stay saved on this computer, but no longer show here.';
  try {
    await ctx.local.api('POST', `${ROWS}/${encodeURIComponent(id)}/remove`, {});
  } catch (err) {
    if (err?.status !== 404) {
      ctx.update((st) => {
        st.removing = false;
        st.notice = { tone: 'error', text: err.message, route: id };
      });
      return;
    }
    text = 'This row had already been deleted.';
  }
  forget(ctx, [id]);
  ctx.update((st) => {
    st.removing = false;
    st.rowsNotice = { tone: 'good', text };
  });
  ctx.go('amazon');
  loadList(ctx);
  ctx.reveal?.('rows');
}

async function removeAllRows(ctx) {
  const s = ctx.state;
  const n = arr(s.list.items).length + (s.list.oldRows || 0);
  if (!n || removeBlocked(s)) return;
  const who = n === 1 ? 'the 1 row' : `all ${n} rows`;
  if (!ctx.confirm(`Remove ${who} from this dashboard, with their pictures? This removes the rows from the sheet, the rows added by hand, and any rows made with the old layout. This cannot be undone.`)) return;
  ctx.update((st) => {
    st.removing = true;
    st.removeError = null;
    st.notice = null;
    st.rowsNotice = null;
  });
  try {
    const out = await ctx.local.api('POST', `${ROWS}/remove-all`, { expected: n });
    const removed = Number.isFinite(out?.removed) ? out.removed : n;
    forget(ctx, null);
    ctx.update((st) => {
      st.removing = false;
      st.rowsNotice = { tone: 'good', text: `Removed ${removed === 1 ? '1 row' : `${removed} rows`} and their pictures. The Amazon login, the uploaded sheet, the remembered columns and the campaigns are kept. The check results stay saved on this computer, but no longer show here.` };
    });
    ctx.reveal?.('rows');
  } catch (err) {
    ctx.update((st) => {
      st.removing = false;
      st.removeError = err.message;
    });
  }
  loadList(ctx);
}

// ---- screen hooks ----

function enter(ctx) {
  const s = ctx.state;
  const here = ctx.route || '';
  // A message belongs to the page it was given on, and goes when you open another page.
  if (s.notice?.route !== undefined && s.notice.route !== here) s.notice = null;
  if (here) s.rowsNotice = null;
  // The form and the emails belong to the page they were opened on; emails still being sent stay.
  if (s.edit && s.edit.rowId !== here) s.edit = null;
  if (s.email && !s.email.sending && s.email.route !== here) s.email = null;
  loadList(ctx);
  loadAccount(ctx);
  if (!s.poll && typeof ctx.every === 'function') s.poll = ctx.every(LOGIN_POLL_MS, () => loadAccount(ctx));
  const id = ctx.route;
  if (id && s.open?.id !== id) openRow(ctx, id);
  else if (!id && s.open) closeRow(ctx);
}

function reset(ctx) {
  const s = ctx.state;
  s.check?.controller?.abort();
  s.all?.controller?.abort();
  if (s.check) revokeAll(ctx, s.check.view.shots);
  if (s.all) revokeAll(ctx, s.all.view.shots);
  s.check = null;
  s.all = null;
  revokeAll(ctx, s.open?.shots);
  if (s.open) s.open.shots = [];
  for (const url of Object.values(s.thumbs)) ctx.local.revoke(url);
  s.thumbs = {};
  if (s.big?.url) ctx.local.revoke(s.big.url);
  s.big = null;
  if (typeof s.poll === 'function') s.poll();
  s.poll = null;
  for (const k of Object.keys(s.seq)) s.seq[k]++;
  s.list.loading = false;
  s.account.busy = false;
  s.upload.busy = false;
  s.campaigns.busy = false;
  s.removing = false;
  s.marking = false;
  s.form.saving = false;
  s.excel.busy = false;
  s.email?.controller?.abort();
  if (s.email) Object.assign(s.email, { sending: false, controller: null, loading: false });
  if (s.edit) s.edit.busy = false;
  s.address.saving = false;
  s.templates.saving = false;
  if (s.open) s.open.loading = false;
  ctx.update();
}

// ---- drawing ----

/**
 * What a row shows: its last check's Status, Type and Note; else the ones
 * already in the file ("From the file"), until "Check every row again" is
 * pressed; else nothing. final is the Status's key: 'pass', 'fail', 'manual'
 * or null; status is its word: Pass, Fail or Needs Manual Staff Checking.
 */
function resultOf(r, state) {
  const checking = state && r?.id && rowBeingChecked(state) === r.id;
  const final = FINAL_WORDS[r?.final] ? r.final : null;
  if (checking) return { status: 'Checking…', type: '', note: '', from: 'now', final: null };
  if (r?.last) {
    const f = final ?? (FINAL_WORDS[r.last.final] ? r.last.final : null);
    return { status: FINAL_WORDS[f] ?? '', type: r.last.type ?? '', note: r.last.note ?? '', from: 'check', final: f, finalSays: r.last.finalSays ?? null, staff: r.last.staff ?? null };
  }
  if (r?.prev && !r.recheck && (r.prev.status || r.prev.type || r.prev.note)) return { status: FINAL_WORDS[final] ?? '', type: r.prev.type ?? '', note: r.prev.note ?? '', from: 'file', final };
  return { status: '', type: '', note: '', from: null, final: null };
}

/** A Status as a bold label in its colour, with its icon and its word: green Pass, red Fail, orange Needs Manual Staff Checking. */
function finalPill(h, final, id) {
  return FINAL_WORDS[final] ? h('span', { class: `final final-${final}`, 'data-id': id }, icon(h, FINAL_ICON[final]), FINAL_WORDS[final]) : null;
}

/** The label of a row being checked at this moment. */
const checkingLabel = (h) => h('span', { class: 'final final-checking' }, icon(h, 'spinner', 'icon-spin'), 'Checking…');

function pill(h, text, tone) {
  return h('span', { class: `pill pill-${tone === 'info' ? 'quiet' : tone}` }, text || EMPTY);
}

/** The marketplace tabs: Amazon, and Flipkart, which opens the Flipkart screen (go is the screen's ctx.go). */
function marketTabs(h, go) {
  return h(
    'div',
    { class: 'market', role: 'tablist', 'aria-label': 'Marketplace', key: 'market', 'data-id': 'market' },
    h('button', { type: 'button', role: 'tab', class: 'market-tab', 'aria-selected': 'true', 'data-id': 'market-amazon' }, icon(h, 'bag'), 'Amazon'),
    h('button', { type: 'button', role: 'tab', class: 'market-tab', 'aria-selected': 'false', onclick: () => go('flipkart'), 'data-id': 'market-flipkart' }, icon(h, 'bag'), 'Flipkart'),
  );
}

/**
 * The Amazon login in the top bar, one state at a time: a short line with its
 * icon, the button when one is needed, and under the bar what to do, in a
 * soft box, only when there is something to do.
 */
function loginBar(ctx) {
  const { h, words, state } = ctx;
  const a = state.account;
  const d = obj(a.data);
  const kind = ['in', 'out', 'waiting', 'problem'].includes(d.state) ? d.state : 'checking';
  const button = (label, what, title = null) => h('button', { type: 'button', class: 'btn btn-primary btn-small', title, disabled: a.busy || busy(state), onclick: () => startLogin(ctx, what), 'data-id': what }, icon(h, 'login'), label);
  const [mark, text] = { in: ['pass', LOGIN_WORDS.in(d.name)], out: ['user', LOGIN_WORDS.out], waiting: ['spinner', LOGIN_WORDS.waitingShort], problem: ['warn', LOGIN_WORDS.problemShort], checking: ['spinner', LOGIN_WORDS.checking] }[kind];
  // Something to do is said in a soft box under the bar; "Log in to Amazon" explains itself when the mouse rests on it, so the bar stays slim.
  const help = { waiting: LOGIN_WORDS.waiting, problem: d.says }[kind] ?? null;
  const problem = a.error ?? a.lost;
  return [
    h(
      'div',
      { class: `account account-${kind}`, key: 'account', 'data-id': 'account' },
      h('p', { class: 'account-line', role: kind === 'in' ? null : 'status', 'data-id': 'account-line' }, icon(h, mark, mark === 'spinner' ? 'icon-spin' : ''), text),
      kind === 'out' ? button(LOGIN_WORDS.outButton, 'log-in', LOGIN_WORDS.outHow) : kind === 'problem' ? button(LOGIN_WORDS.problemButton, 'check-login') : null,
    ),
    help || problem ? h('div', { class: 'bar-help', key: 'login-help', 'data-id': 'login-help' }, help ? words.notice(h, kind === 'problem' ? 'warn' : 'info', help) : null, words.notice(h, 'error', problem)) : null,
  ];
}

/**
 * The Google login in the top bar, beside the Amazon login, the same way:
 * one state at a time, its button when one is needed, and what to do in a
 * soft box under the bar. The screenshots on Google Drive are downloaded
 * through this login. When Google will not let anyone log in inside the Live
 * Amazon Browser window, a normal Chrome window on the same saved profile is
 * offered.
 */
function googleBar(ctx) {
  const { h, words, state } = ctx;
  const a = state.account;
  const d = obj(obj(a.data).google);
  const kind = ['in', 'out', 'waiting', 'problem'].includes(d.state) ? d.state : 'checking';
  const button = (label, what, title = null, cls = 'btn btn-primary btn-small') => h('button', { type: 'button', class: cls, title, disabled: a.busy || busy(state), onclick: () => startLogin(ctx, what), 'data-id': what.replace('/', '-') }, icon(h, 'login'), label);
  const [mark, text] = { in: ['pass', GOOGLE_WORDS.in(d.name)], out: ['user', GOOGLE_WORDS.out], waiting: ['spinner', GOOGLE_WORDS.waitingShort], problem: ['warn', GOOGLE_WORDS.problemShort], checking: ['spinner', GOOGLE_WORDS.checking] }[kind];
  const help = kind === 'waiting' ? (d.chrome ? GOOGLE_WORDS.waitingChrome : GOOGLE_WORDS.waiting) : kind === 'problem' ? d.says : null;
  const chrome = () => button(GOOGLE_WORDS.chromeButton, 'google/log-in-in-chrome', GOOGLE_WORDS.chromeHow, 'btn btn-quiet btn-small');
  // While Google's login page shows in the window, the normal Chrome window is offered under the bar, for when Google will not allow the login there.
  const offer = kind === 'waiting' && !d.chrome ? h('p', { class: 'bar-offer' }, GOOGLE_WORDS.chromeOffer, ' ', chrome()) : null;
  return [
    h(
      'div',
      { class: `account account-${kind} google-account`, key: 'google-account', 'data-id': 'google-account' },
      h('p', { class: 'account-line', role: kind === 'in' ? null : 'status', 'data-id': 'google-line' }, icon(h, mark, mark === 'spinner' ? 'icon-spin' : ''), text),
      kind === 'out' ? button(GOOGLE_WORDS.outButton, 'google/log-in', GOOGLE_WORDS.outHow) : null,
      kind === 'problem' ? [button(GOOGLE_WORDS.problemButton, 'google/check-login'), chrome()] : null,
      kind === 'waiting' && d.chrome ? button(GOOGLE_WORDS.doneButton, 'google/logged-in') : null,
    ),
    help ? h('div', { class: 'bar-help', key: 'google-help', 'data-id': 'google-help' }, words.notice(h, kind === 'problem' ? 'warn' : 'info', help), offer) : null,
  ];
}

/** What the top bar shows for this screen, after the dashboard's name: the marketplace tabs, the two login lines, then what to do for each under the bar. */
function renderBar(ctx) {
  const amazon = loginBar(ctx);
  const google = googleBar(ctx);
  return [marketTabs(ctx.h, ctx.go), amazon[0], google[0], amazon[1], google[1]];
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

/**
 * The upload area. With no file in yet: one clear area where the Excel file
 * is chosen. Once a file is in: one slim line with its name, its tab, how
 * many rows it has, and "Replace file". Choosing a file uploads it at once,
 * and so does dropping it anywhere on the main page (app.js passes the file
 * on). Whatever stops an upload is said right under the line.
 */
function sheetCard(ctx) {
  const { h, words, state } = ctx;
  const up = state.upload;
  const c = state.columns;
  const need = c.need;
  const m = obj(c.mapping);
  const chooser = need
    ? h(
        'div',
        { class: 'columns', 'data-id': 'columns' },
        words.notice(h, 'warn', need.says),
        h(
          'div',
          { class: 'column-grid' },
          arr(need.fields).map((f) =>
            h(
              'div',
              { class: 'form-field', key: f.key },
              h('label', { for: `col-${f.key}`, class: 'label' }, f.label, f.required ? h('span', { class: 'req' }, ' (required)') : f.review ? h('span', { class: 'req' }, f.key === 'reviewLink' ? ' (or the review screenshot)' : ' (or the review link)') : h('span', { class: 'opt' }, ' (optional)')),
              h(
                'select',
                { id: `col-${f.key}`, 'data-id': `col-${f.key}`, value: m[f.key] === null || m[f.key] === undefined ? '' : String(m[f.key]), disabled: up.busy, onchange: (e) => setColumn(ctx, f.key, e.target.value) },
                h('option', { value: '' }, f.required ? 'Choose a column' : ['status', 'type', 'note'].includes(f.key) ? 'A new column after the last one' : 'Not in this file'),
                arr(need.headers).map((hd) => h('option', { key: `o${hd.col}`, value: String(hd.col) }, `${columnLetter(hd.col)}: ${hd.text}`)),
              ),
            ),
          ),
        ),
        h('p', { class: 'muted small', 'data-id': 'results-go' }, need.kind === 'xlsx' ? whereResultsGo(need, m) : 'This file is not an Excel file, so its results can only be downloaded with "The results only", under Download.'),
        h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-primary', disabled: up.busy, onclick: () => sendSheet(ctx, c.mapping), 'data-id': 'use-columns' }, icon(h, 'check'), up.busy ? 'Reading…' : 'Use these columns')),
        words.notice(h, 'error', c.error),
      )
    : null;
  const sheet = state.list.sheet;
  const tab = up.done?.tab || sheet?.tab;
  const made = up.done ? up.done.made : arr(state.list.items).filter((r) => r?.source === 'sheet').length;
  const isIn = Boolean(sheet && made);
  const unplaced = arr(up.done?.unplaced);
  const name = up.file?.name || 'the file';
  // Choosing a file uploads it; the input is made again after each file, so the same file can be chosen again.
  const input = h('input', { key: `sheet-file-${up.gen}`, id: 'sheet-file', class: 'file-input', type: 'file', accept: SHEET_ACCEPT, 'data-id': 'sheet-file', onchange: (e) => uploadFile(ctx, e.target.files?.[0] ?? null) });
  // The file waiting for its columns to be chosen can be let go.
  const waiting = Boolean(need && up.file && !up.busy);
  const cancel = waiting
    ? h('button', { type: 'button', class: 'btn btn-quiet', key: 'cancel', 'data-id': 'cancel-file', onclick: () => ctx.update((st) => {
      Object.assign(st.upload, { file: null, gen: st.upload.gen + 1, error: null, replace: false, stop: false });
      st.columns = freshColumns();
    }) }, 'Cancel')
    : null;
  // While a file is uploaded, or held over the page, the line says so.
  const doing = up.busy ? (up.stop ? `Stopping that first, then uploading "${name}"…` : `Uploading "${name}"…`) : up.dragging ? 'Drop the file anywhere on this page to upload it.' : null;
  // Which of the file's columns are used for checking, what it does not have and what that means, and which campaign its rows use.
  const about = !need && !up.busy && isIn ? arr(sheet?.about) : [];
  const below = [
    words.notice(h, 'error', up.error),
    about.length ? h('ul', { class: 'about-file', 'data-id': 'about-file' }, about.map((t, i) => h('li', { key: `a${i}` }, t))) : null,
    unplaced.length ? h('div', { class: 'notice notice-warn', role: 'status', 'data-id': 'unplaced' }, h('ul', { class: 'missing' }, unplaced.map((x, i) => h('li', { key: `u${i}` }, x)))) : null,
    chooser,
  ];
  if (isIn) {
    // One slim line: the file in, the file being uploaded, or the file waiting for its columns.
    return h(
      'section',
      { class: 'card upload upload-slim', key: 'sheet', 'data-id': 'sheet' },
      h(
        'div',
        { class: `slim${up.dragging ? ' drop-over' : ''}`, 'data-id': 'drop' },
        icon(h, up.busy ? 'spinner' : 'file', up.busy ? 'slim-icon icon-spin' : 'slim-icon'),
        doing
          ? h('p', { class: 'slim-text', key: 'doing', role: 'status', 'data-id': 'upload-doing' }, doing)
          : waiting
            ? h('p', { class: 'slim-text', key: 'chosen' }, h('strong', null, name), h('span', { class: 'slim-sub' }, ': choose the columns below.'))
            : h('p', { class: 'slim-text', key: 'in', 'data-id': 'sheet-line' }, h('strong', null, sheet.fileName || 'The sheet'), h('span', { class: 'slim-sub' }, `${sheet.kind === 'xlsx' && tab ? `, the ${tab} tab` : ''}: ${rowsWord(made)}.`)),
        up.done && !doing ? h('span', { class: 'pill pill-good', 'data-id': 'upload-done' }, icon(h, 'check'), 'Uploaded') : null,
        h('div', { class: 'slim-actions' }, input, cancel, h('label', { for: 'sheet-file', class: 'btn', key: 'replace', 'data-id': 'replace-file' }, icon(h, 'refresh'), 'Replace file')),
      ),
      below,
    );
  }
  // No file in yet: the large area.
  return h(
    'section',
    { class: 'card upload', key: 'sheet', 'data-id': 'sheet' },
    h(
      'div',
      { class: `drop${up.dragging ? ' drop-over' : ''}${up.file ? ' drop-chosen' : ''}`, 'data-id': 'drop' },
      icon(h, up.busy ? 'spinner' : up.file ? 'file' : 'upload', up.busy ? 'drop-icon icon-spin' : 'drop-icon'),
      h(
        'div',
        { class: 'drop-text' },
        doing
          ? [h('p', { class: 'drop-name', key: 'doing', role: 'status', 'data-id': 'upload-doing' }, doing)]
          : waiting
            ? [h('p', { class: 'drop-name', key: 'chosen' }, name), h('p', { class: 'drop-sub', key: 'sub' }, 'Choose the columns below.')]
            : [h('p', { class: 'drop-name', key: 'none' }, 'Upload the Excel file: drop it anywhere on this page, or choose it'), h('p', { class: 'drop-sub', key: 'sub' }, 'Only the tab named "Amazon" is read. Another file replaces the rows.')],
      ),
      h('div', { class: 'drop-actions' }, input, cancel, h('label', { for: 'sheet-file', class: 'btn btn-primary', 'data-id': 'choose-file' }, icon(h, 'file'), 'Choose file')),
    ),
    below,
  );
}

/** Under one product of a campaign: what was read from Amazon and when, or why it is not used. */
function productSaid(ctx, p) {
  const { h, words } = ctx;
  const read = p.name ? [h('strong', { key: 'name' }, p.name), ` Brand: ${p.brand || 'not shown'}.`] : [];
  const labels = arr(p.variants);
  const more = Math.max(0, (Number(p.variantCount) || 0) - labels.length);
  const variants = labels.length ? ` Other colours and sizes: ${labels.join(', ')}${more ? `, and ${more} more` : ''}.` : more ? ` ${more === 1 ? '1 other colour or size' : `${more} other colours and sizes`} listed.` : ' No other colours or sizes listed.';
  if (p.state === 'reading') return [h('span', { class: 'muted', key: 's' }, 'Reading from Amazon now…')];
  if (p.state === 'waiting') return [h('span', { class: 'muted', key: 's' }, 'Not read from Amazon yet.')];
  if (p.state === 'used') return [...read, variants, ` Read on ${words.ist(p.at)}.`];
  return [...read, h('span', { class: 'tone-bad', key: 's' }, ` ${p.says ?? 'This product is not used.'}`)];
}

function campaignBlock(ctx, x, locked) {
  const { h } = ctx;
  const again = arr(x.products).some((p) => p?.state === 'stopped' || p?.state === 'not used' || p?.state === 'waiting');
  const button = (id, mark, text, onclick, cls = 'btn btn-small') => h('button', { type: 'button', class: cls, disabled: locked, onclick, 'data-id': `${id}-${x.id}` }, icon(h, mark), text);
  return h(
    'div',
    { class: `campaign${x.live ? '' : ' campaign-ended'}`, key: x.id, 'data-id': `campaign-${x.id}` },
    h(
      'div',
      { class: 'card-head' },
      h('h3', null, `${x.name} `, pill(h, x.live ? 'Live' : 'Ended', x.live ? 'good' : 'quiet'), h('span', { class: 'campaign-brand' }, ` Brand: ${x.brand}`)),
      h(
        'div',
        { class: 'actions' },
        button('change', 'edit', 'Change', () => editCampaign(ctx, x.id)),
        x.live ? button('end', 'flag', 'End campaign', () => campaignAction(ctx, x.id, 'end')) : null,
        again ? button('read', 'refresh', 'Read the products again', () => campaignAction(ctx, x.id, 'read')) : null,
        button('delete', 'trash', 'Delete', () => campaignAction(ctx, x.id, 'delete'), 'btn btn-small btn-danger'),
      ),
    ),
    h('ul', { class: 'campaign-products' }, arr(x.products).map((p, i) => h('li', { key: `p${i}`, 'data-id': `product-${x.id}-${i}` }, h('div', { class: 'typed' }, p.given), h('div', { class: 'small' }, productSaid(ctx, p))))),
  );
}

function campaignForm(ctx, checking) {
  const { h, state } = ctx;
  const c = state.campaigns;
  const v = c.values;
  const text = (key, label, placeholder) =>
    h('div', { class: 'form-field', key }, h('label', { class: 'label', for: `campaign-${key}` }, label), h('input', { id: `campaign-${key}`, type: 'text', autocomplete: 'off', placeholder, value: v[key], disabled: c.busy, 'data-id': `campaign-${key}`, oninput: (e) => (v[key] = e.target.value) }));
  return h(
    'div',
    { class: 'campaign-form', 'data-id': 'campaign-form' },
    h('h3', null, c.editing === 'new' ? 'Add a campaign' : 'Change the campaign'),
    h(
      'div',
      { class: 'form-grid' },
      text('brand', 'Brand', 'For example: Koparo'),
      text('name', 'Campaign name', 'For example: Koparo Clean'),
      h(
        'div',
        { class: 'form-field', key: 'live' },
        h('label', { class: 'label', for: 'campaign-live' }, 'Live or ended'),
        h('select', { id: 'campaign-live', value: v.live ? 'live' : 'ended', disabled: c.busy, 'data-id': 'campaign-live', onchange: (e) => (v.live = e.target.value === 'live') }, h('option', { value: 'live', selected: v.live }, 'Live'), h('option', { value: 'ended', selected: !v.live }, 'Ended')),
      ),
    ),
    h(
      'div',
      { class: 'form-field wide' },
      h('label', { class: 'label', for: 'campaign-products' }, 'Products'),
      h('textarea', { id: 'campaign-products', rows: '4', spellcheck: 'false', placeholder: 'One Amazon link or ASIN number on each line', value: v.products, disabled: c.busy, 'data-id': 'campaign-products', oninput: (e) => (v.products = e.target.value) }),
      h('p', { class: 'note' }, 'An Amazon link, or an ASIN number (the 10 letters and digits Amazon gives each product), one on each line. Users may buy any one of them.'),
    ),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-primary', disabled: c.busy || checking, onclick: () => saveCampaign(ctx), 'data-id': 'save-campaign' }, icon(h, 'check'), c.busy ? 'Saving…' : 'Save'),
      h('button', { type: 'button', class: 'btn btn-quiet', disabled: c.busy, onclick: () => ctx.update((st) => Object.assign(st.campaigns, { editing: null, values: blankCampaign(), error: null })), 'data-id': 'cancel-campaign' }, 'Cancel'),
    ),
    checking ? h('p', { class: 'muted small', 'data-id': 'save-waits' }, 'Save can be pressed once the rows are checked.') : null,
  );
}

/** The Campaigns box. It folds shut to save room; folded, its title line still says how many campaigns are live. */
function campaignsCard(ctx) {
  const { h, words, state } = ctx;
  const list = arr(state.list.campaigns);
  const c = state.campaigns;
  const running = state.account.data?.running?.kind;
  // Save is greyed out while rows are being checked; a campaign's buttons also wait while products are read.
  const checking = busy(state) || running === 'check' || running === 'run';
  const live = list.filter((x) => x?.live).length;
  const sum = list.length ? [live ? `${live} live` : '', list.length - live ? `${list.length - live} ended` : ''].filter(Boolean).join(', ') : 'None yet';
  const reading = running === 'campaign' || list.some((x) => arr(x?.products).some((p) => p?.state === 'reading'));
  const open = Boolean(c.editing) || (state.fold.campaigns ?? !list.length);
  return h(
    'details',
    {
      class: 'card fold campaigns-card',
      key: 'campaigns',
      'data-id': 'campaigns',
      open,
      ontoggle: (e) => {
        const now = Boolean(e.target?.open);
        if (now !== open && !c.editing) ctx.update((st) => (st.fold.campaigns = now));
      },
    },
    h('summary', { class: 'fold-head' }, icon(h, 'campaign', 'fold-icon'), h('h2', null, 'Campaigns'), h('span', { class: 'fold-sum' }, reading ? `${sum}, reading products from Amazon…` : sum), icon(h, 'chevron', 'fold-chevron')),
    h(
      'div',
      { class: 'fold-body' },
      h(
        'div',
        { class: 'fold-tools' },
        h('p', { class: 'card-sub' }, 'The Amazon products users may buy for a brand. A row uses every live campaign whose brand is in its product name, the file\'s name or the tab\'s name; a campaign marked Ended is never used.'),
        c.editing ? null : h('button', { type: 'button', class: 'btn btn-primary', disabled: c.busy, onclick: () => editCampaign(ctx, null), 'data-id': 'add-campaign' }, icon(h, 'plus'), 'Add a campaign'),
      ),
      c.editing ? campaignForm(ctx, checking) : null,
      list.length ? h('div', { class: 'campaigns' }, list.map((x) => campaignBlock(ctx, x, c.busy || checking || running === 'campaign'))) : c.editing ? null : h('p', { class: 'muted', 'data-id': 'no-campaigns' }, 'No campaigns yet. Rows are checked by the product name in the sheet until a campaign has their brand.'),
      c.notice ? words.notice(h, 'good', c.notice) : null,
      words.notice(h, 'error', c.error),
    ),
  );
}

function thumbButton(ctx, r, which, p, large = false) {
  const { h, state } = ctx;
  const url = state.thumbs[thumbKey(r, which, p)];
  return h(
    'button',
    { type: 'button', class: `thumb${large ? ' thumb-large' : ''}`, key: `${which}-${p.i}`, onclick: (e) => { e.stopPropagation(); openBig(ctx, r, which, p); }, 'aria-label': `Enlarge the ${WHAT[which].toLowerCase()} of ${r.label ?? 'this row'}`, 'data-id': `${large ? 'row-' : ''}thumb-${which}-${r.id}-${p.i}` },
    url ? h('img', { src: url, alt: '' }) : h('span', { class: 'muted small' }, 'Picture'),
  );
}

const EMPTY = 'Empty';
const emptyCell = (h) => h('span', { class: 'empty-cell' }, EMPTY);

/** One link as a small label saying where it goes; it opens in a new tab, and the mouse resting on it shows the whole link. */
function linkLabel(ctx, x, i, mark = 'link') {
  const { h, words } = ctx;
  const url = words.safeUrl(x?.link);
  const label = x?.label || 'Link';
  if (!url) return h('span', { key: `l${i}`, class: 'link-label nolink', title: String(x?.link ?? '') }, icon(h, mark), label);
  return h('a', { key: `l${i}`, class: 'link-label', href: url, target: '_blank', rel: 'noopener noreferrer', title: url, onclick: (e) => e.stopPropagation() }, icon(h, mark), label);
}

/** A picture or link cell as it is in the file: where each link goes, the words in it, "Empty", and a warning when its words show another link. */
function linkCell(ctx, r, which) {
  const { h } = ctx;
  const s = obj(r?.shots?.[which]);
  const labels = arr(s.labels);
  const mark = which === 'review' ? 'link' : 'image';
  const parts = [];
  if (s.how === 'cell' || s.how === 'floating') parts.push(h('span', { key: 'pic', class: 'link-label nolink' }, icon(h, 'image'), s.how === 'cell' ? 'Picture in the cell' : 'Picture over the cell'));
  else if (s.how === 'upload') parts.push(h('span', { key: 'pic', class: 'link-label nolink' }, icon(h, 'image'), 'A file given by hand'));
  labels.forEach((x, i) => parts.push(linkLabel(ctx, x, i, mark)));
  if (labels.length && s.words) parts.push(h('div', { key: 'w', class: 'cell-words' }, s.words));
  if (!parts.length && s.text) parts.push(h('span', { key: 't' }, s.text));
  if (s.mismatch) parts.push(h('div', { key: 'mm', class: 'link-warning', title: 'The link written in this cell is different from the link that opens when you click it. The dashboard checks the link that opens when clicked.' }, icon(h, 'warn'), 'The written link is different'));
  return h('td', { key: which, class: 'link-cell', 'data-cell': which }, parts.length ? parts : emptyCell(h));
}

/** How long a row's check took, in plain words: "took 42 seconds", "took 2 minutes 5 seconds". */
export function tookWords(seconds) {
  const n = Math.max(0, Math.round(Number(seconds) || 0));
  if (n < 1) return 'took less than a second';
  const part = (x, one) => `${x} ${one}${x === 1 ? '' : 's'}`;
  if (n < 60) return `took ${part(n, 'second')}`;
  return `took ${part(Math.floor(n / 60), 'minute')}${n % 60 ? ` ${part(n % 60, 'second')}` : ''}`;
}

/**
 * Status, Type and Note. The Status is the clearest thing in the row: Pass,
 * Fail or Needs Manual Staff Checking, bold and in its colour, with when it
 * was checked and how long it took, or "From the file" for a Status the
 * uploaded file already had. The Type is a small soft tag.
 */
function resultCells(ctx, r) {
  const { h, words, state } = ctx;
  const res = resultOf(r, state);
  const tag = (type) => (type ? h('span', { class: 'tag' }, type) : emptyCell(h));
  if (res.from === 'now') return { status: h('td', { key: 'status', class: 'status-cell' }, checkingLabel(h)), type: h('td', { key: 'type', class: 'type-cell' }), note: h('td', { key: 'note', class: 'note-cell' }) };
  if (res.from === 'check') {
    const staff = res.staff;
    return {
      status: h(
        'td',
        { key: 'status', class: 'status-cell', 'data-cell': 'status' },
        finalPill(h, res.final, `final-${r.id}`) ?? emptyCell(h),
        // A result a staff member changed by hand, or marked right, says so, with when; a check's says when and how long it took.
        staff ? h('div', { class: 'cell-words staff-line', 'data-id': `staff-${r.id}` }, icon(h, staff.right ? 'check' : 'user'), `${staff.right ? 'Marked right' : 'Changed'} by staff on ${words.ist(staff.at)}`) : r?.last?.at ? h('div', { class: 'cell-words' }, words.ist(r.last.at)) : null,
        (!staff || staff.right) && Number.isFinite(r?.last?.seconds) ? h('div', { class: 'cell-words', 'data-id': `took-${r.id}` }, tookWords(r.last.seconds)) : null,
      ),
      type: h('td', { key: 'type', class: 'type-cell' }, tag(res.type), emailedLine(ctx, r)),
      note: h('td', { key: 'note', class: 'note-cell' }, res.note || emptyCell(h)),
    };
  }
  // After "Check every row again", the cells from the file no longer show either.
  const p = r?.recheck ? {} : obj(r?.prev);
  return {
    status: h('td', { key: 'status', class: 'status-cell', 'data-cell': 'status' }, res.from === 'file' && FINAL_WORDS[res.final] ? [finalPill(h, res.final, `final-${r.id}`), h('div', { key: 'f', class: 'cell-words' }, 'From the file')] : emptyCell(h)),
    type: h('td', { key: 'type', class: 'type-cell' }, tag(p.type), emailedLine(ctx, r)),
    note: h('td', { key: 'note', class: 'note-cell' }, p.note || emptyCell(h)),
  };
}

/**
 * When the row was last emailed, and about what: "Emailed on 08-10-2026 at
 * 14:05 about Not delivered, as a test." (a test email went to the test
 * email address, not to the user); "Maybe emailed …" when Gmail did not say
 * the email was sent. Nothing when it never was.
 */
function emailedLine(ctx, r) {
  const { h, words } = ctx;
  const last = arr(r?.emails).at(-1);
  if (!last) return null;
  const test = last.mode !== 'real' ? ', as a test' : '';
  return h('div', { class: 'cell-words staff-line', 'data-id': `emailed-${r?.id}` }, icon(h, 'mail'), last.maybe ? `Maybe emailed on ${words.ist(last.at)} about ${last.name ?? 'this row'}${test}: look in your Sent emails.` : `Emailed on ${words.ist(last.at)} about ${last.name ?? 'this row'}${test}.`);
}

/** Each field's plain name, for rows added by hand when no sheet has been uploaded. */
const PLAIN_NAMES = { orderId: 'Order ID', orderDate: 'Order date', amount: 'Amount', product: 'Product ordered', orderShot: 'Purchase screenshot', deliveryShot: 'Delivery screenshot', reviewLink: 'Review link', reviewShot: 'Review screenshot', status: 'Status', type: 'Type', note: 'Note' };

/**
 * The table's columns: every column of the uploaded file, in its order, each
 * with its letter, its name in the heading row and the field it holds (null
 * for a column only shown), then the Status, Type and Note it does not have.
 * With no file in, the fields' plain names.
 */
function tableColumns(sheet) {
  const cols = arr(sheet?.columns);
  if (cols.length) return cols.map((c) => ({ key: c?.key ?? null, col: c?.col ?? null, letter: c?.letter ?? '', name: c?.name ?? PLAIN_NAMES[c?.key] ?? '' }));
  return Object.keys(PLAIN_NAMES).map((key) => ({ key, col: null, letter: '', name: PLAIN_NAMES[key] }));
}

/** A cell of one of the file's other columns (such as the reviewer's name), as it is in the file: its words, and where each link goes. */
function otherCell(ctx, r, col) {
  const { h } = ctx;
  const v = obj(r?.values?.[col]);
  const labels = arr(v.labels);
  const parts = labels.map((x, i) => linkLabel(ctx, x, i));
  if (labels.length && v.text && !/^\S+$/.test(v.text)) parts.push(h('div', { key: 'w', class: 'cell-words' }, v.text));
  return h('td', { key: `c${col}`, class: 'wrap other-cell' }, parts.length ? parts : v.text || emptyCell(h));
}

/** A column's name with its letter kept small in front ("A: Order ID" to a screen reader). */
const columnHead = (h, c) => (c.letter ? [h('span', { class: 'col-letter', key: 'l' }, c.letter), h('span', { class: 'sr-only', key: 's' }, ': '), c.name] : c.name);

/** One row of the table, its cells in the columns' order. */
function tableRow(ctx, r, columns) {
  const { h, state } = ctx;
  const plain = (key, v, cls = 'nowrap') => h('td', { key, class: cls }, v || emptyCell(h));
  const results = resultCells(ctx, r);
  const cell = {
    orderId: () => plain('orderId', r?.orderId, 'nowrap strong-cell'),
    orderDate: () => plain('orderDate', r?.orderDate),
    amount: () => plain('amount', r?.amount),
    product: () => plain('product', r?.product, 'wrap product-cell'),
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
  const done = isDone(r);
  return h(
    'tr',
    { key: r?.id ?? 'x', class: `clickable${state.all?.running && rowBeingChecked(state) === r?.id ? ' current-row' : ''}`, onclick: () => ctx.go(`amazon/${r.id}`), 'data-id': `row-${r?.id}` },
    h('td', { class: 'nowrap row-cell' }, h('button', { type: 'button', class: 'linkish', onclick: (e) => { e.stopPropagation(); ctx.go(`amazon/${r.id}`); } }, r?.source === 'sheet' ? String(r.n ?? '') : r?.label ?? 'Row')),
    columns.map(cellOf),
    h('td', { class: 'nowrap check-cell' }, h('button', { type: 'button', class: 'btn btn-small', disabled: busy(state), onclick: (e) => { e.stopPropagation(); ctx.go(`amazon/${r.id}`); startCheck(ctx, r.id); }, 'data-id': `check-${r?.id}` }, icon(h, done ? 'refresh' : 'play'), done ? 'Check again' : 'Check')),
  );
}

const sameWord = (x, y) => String(x ?? '').trim().toLowerCase() === String(y ?? '').trim().toLowerCase();

/** How many rows have each Status, and how many are not checked yet. */
function finalCounts(items) {
  const n = { pass: 0, fail: 0, manual: 0, none: 0 };
  for (const r of items) {
    const f = isDone(r) ? resultOf(r, null).final : null;
    n[FINAL_WORDS[f] ? f : 'none']++;
  }
  return n;
}

/**
 * The four Status cards, each with its number. They are the Status filter:
 * pressing one shows only those rows, and pressing it again shows every row.
 */
function finalCards(ctx, items) {
  const { h, state } = ctx;
  const n = finalCounts(items);
  const card = (key, text) => {
    const on = state.filter.final === key;
    return h(
      'button',
      { type: 'button', class: `final-card final-card-${key}`, key, 'aria-pressed': on ? 'true' : 'false', onclick: () => ctx.update((st) => (st.filter = { ...noFilter(), final: st.filter.final === key ? '' : key })), 'data-id': `count-${key}` },
      h('span', { class: 'final-card-label' }, icon(h, FINAL_ICON[key]), h('span', { 'data-id': `count-${key}-word` }, text)),
      h('span', { class: 'final-card-num', 'data-id': `count-${key}-num` }, String(n[key])),
    );
  };
  return h('div', { class: 'final-cards', role: 'group', 'aria-label': 'Status. Press one to show only those rows.', 'data-id': 'counts' }, card('pass', FINAL_WORDS.pass), card('fail', FINAL_WORDS.fail), card('manual', FINAL_WORDS.manual), card('none', FINAL_NONE));
}

/** The one Download button: it offers the checked Excel file and the results only. */
function downloadMenu(ctx) {
  const { h, state } = ctx;
  const sheet = state.list.sheet;
  const excelOk = sheet?.kind === 'xlsx' && sheet?.used;
  // The menu closes once a file is chosen.
  const shut = (e) => e?.currentTarget?.closest?.('details')?.removeAttribute('open');
  return h(
    'details',
    { class: 'menu', 'data-id': 'download' },
    h('summary', { class: 'btn' }, icon(h, state.excel.busy ? 'spinner' : 'download', state.excel.busy ? 'icon-spin' : ''), state.excel.busy ? 'Preparing…' : 'Download', icon(h, 'chevron', 'menu-chevron')),
    h(
      'div',
      { class: 'menu-list' },
      h('button', { type: 'button', class: 'menu-item', disabled: !excelOk || state.excel.busy, title: excelOk ? null : 'Needs an Excel file uploaded.', onclick: (e) => { shut(e); downloadExcel(ctx); }, 'data-id': 'download-excel' }, icon(h, 'file'), h('span', { class: 'menu-words' }, h('strong', null, 'The checked Excel file'), h('span', { class: 'menu-note' }, 'Your file, with the results filled in'))),
      h('button', { type: 'button', class: 'menu-item', onclick: (e) => { shut(e); downloadCsv(ctx); }, 'data-id': 'download-csv' }, icon(h, 'table'), h('span', { class: 'menu-words' }, h('strong', null, 'The results only'), h('span', { class: 'menu-note' }, 'Row, order ID, Status, Type and Note'))),
    ),
  );
}

/** The four Status cards and the main buttons, in one row above the table. */
function overview(ctx, items) {
  const { h, words, state } = ctx;
  const l = state.list;
  const running = Boolean(state.all?.running);
  const { total, left } = tallyOf(items);
  const mark = running ? 'spinner' : total && !left ? 'check' : 'play';
  return h(
    'section',
    { class: 'overview', key: 'overview', 'data-id': 'overview' },
    finalCards(ctx, items),
    h(
      'div',
      { class: 'main-actions', 'data-id': 'main-actions' },
      h('button', { type: 'button', class: 'btn btn-primary start', disabled: busy(state) || !left || Boolean(l.settingsProblem), onclick: () => checkRows(ctx), 'data-id': 'start-checking' }, icon(h, mark, running ? 'icon-spin' : ''), runWords(items, running)),
      running ? h('button', { type: 'button', class: 'btn btn-danger stop', onclick: () => stopAll(ctx), 'data-id': 'stop-all' }, icon(h, 'stop'), 'Stop') : null,
      h('button', { type: 'button', class: 'btn', disabled: busy(state) || Boolean(l.settingsProblem), onclick: () => checkEveryRowAgain(ctx), 'data-id': 'check-every-row' }, icon(h, 'refresh'), 'Check every row again'),
      downloadMenu(ctx),
      words.notice(h, 'error', state.excel.error),
    ),
  );
}

/**
 * Every Type the dashboard has, in the order the settings list them, each
 * with how many rows have it (0 too) among the rows of the Status chosen
 * (every row when none is chosen); then any other Type the rows have (one
 * written in the uploaded file that is not one of the dashboard's). A
 * Type's word in the file counts as the same whatever its capitals or
 * spaces. -> [{ word, count }]
 */
export function typeCounts(items, types, final = '') {
  const counts = new Map();
  for (const r of items) {
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
 * The Status box and the Type box above the table. The Status box lists
 * every Status with how many rows, and choosing one is the same as pressing
 * its Status card (the box and the cards always show the same choice); the
 * Type box always lists every Type, each with how many rows of that Status
 * have it. When the Type chosen has an email, "Email these users" is there.
 */
function filters(ctx, items = []) {
  const { h, state } = ctx;
  const f = state.filter;
  const n = finalCounts(items);
  const list = typeCounts(items, state.list.types, f.final);
  // A Type chosen before that is no longer listed stays, so the choice is still visible.
  if (f.type && !list.some((t) => sameWord(t.word, f.type))) list.push({ word: f.type, count: 0 });
  // The rows shown, when the Type chosen has an email.
  const chosenKey = f.type ? typeKeyOfWord(state.list.types, f.type) : '';
  const emailable = Boolean(chosenKey) && arr(state.list.emails?.templates).some((t) => t?.key === chosenKey);
  const shownIds = emailable ? items.filter((r) => passesFilter(r, f)).map((r) => r.id) : [];
  return h(
    'div',
    { class: 'filters', 'data-id': 'filters' },
    h(
      'label',
      { class: 'filter', for: 'filter-final' },
      h('span', { class: 'filter-word' }, 'Status'),
      h(
        'select',
        { id: 'filter-final', 'data-id': 'filter-final', value: f.final, onchange: (e) => ctx.update((st) => (st.filter = { ...noFilter(), final: e.target.value })) },
        h('option', { value: '' }, `Every Status (${items.length})`),
        ['pass', 'fail', 'manual', 'none'].map((k) => h('option', { key: `s-${k}`, value: k }, `${k === 'none' ? FINAL_NONE : FINAL_WORDS[k]} (${n[k]})`)),
      ),
    ),
    h(
      'label',
      { class: 'filter', for: 'filter-type' },
      h('span', { class: 'filter-word' }, 'Type'),
      h('select', { id: 'filter-type', 'data-id': 'filter-type', value: f.type, onchange: (e) => ctx.update((st) => (st.filter.type = e.target.value)) }, h('option', { value: '' }, 'Every Type'), list.map((t) => h('option', { key: `t-${t.word}`, value: t.word }, `${t.word} (${t.count})`))),
    ),
    f.final || f.type ? h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => ctx.update((st) => (st.filter = noFilter())), 'data-id': 'filter-clear' }, icon(h, 'close'), 'Show every row') : null,
    shownIds.length ? h('button', { type: 'button', class: 'btn btn-small', disabled: busy(state), title: 'Every email is shown first, for you to read and change; nothing is sent until you press Send all.', onclick: () => openEmails(ctx, 'many', shownIds), 'data-id': 'email-these' }, icon(h, 'mail'), `Email these users (${shownIds.length})`) : null,
  );
}

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
 * the Status the dashboard itself gave them.
 */
export function staffStatsLine(items) {
  const marked = arr(items).filter((r) => r?.last?.staff?.was);
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

/** How many rows there are, how many have a result, and how many are left to check. */
function tallyOf(items) {
  const done = items.filter(isDone).length;
  return { total: items.length, done, left: items.length - done };
}

/** The words of the one button that checks the rows one by one. How many are left shows once, on the "Not checked yet" card. */
function runWords(items, running) {
  const { total, done, left } = tallyOf(items);
  if (running) return 'Checking…';
  if (total && !left) return 'All rows are checked';
  return done ? 'Carry on checking' : 'Start checking';
}

/** A row in a sentence: "row 23" (its number on the dashboard, from 1), or "the row added by hand (#2)". */
function rowWords(r, label = '') {
  if (r?.source === 'sheet' && r.n != null) return `row ${r.n}`;
  if (r?.source === 'manual') return `the row added by hand (#${r.hand ?? '?'})`;
  return String(label || 'the row').replace(/^Row /, 'row ');
}

/** "Checking row 23: 5 of 200 rows done, 195 left". */
function checkingWords(ctx, items) {
  const run = ctx.state.all;
  const { total, done, left } = tallyOf(items);
  const r = items.find((x) => x?.id === run.current.rowId);
  return `Checking ${rowWords(r, run.current.label)}: ${done} of ${total} ${total === 1 ? 'row' : 'rows'} done, ${left} left`;
}

/** The table of rows, with the live checking area beside it while rows are checked. */
function rowsCard(ctx) {
  const { h, words, state } = ctx;
  const l = state.list;
  const items = arr(l.items);
  const shown = items.filter((r) => passesFilter(r, state.filter));
  let body;
  // While a new file's columns are chosen, its rows are not made yet, and the old file's rows are not shown.
  const waiting = state.columns.need ? state.upload.file?.name || 'the new file' : null;
  if (waiting) body = h('p', { class: 'empty-state', 'data-id': 'rows-waiting' }, icon(h, 'table'), `The rows of "${waiting}" show here once its columns are chosen above. Cancel brings back the rows shown before.`);
  else if (l.items === null && l.loading) body = h('p', { class: 'muted', role: 'status' }, 'Loading rows…');
  else if (l.items === null) body = null;
  else if (!items.length) body = h('p', { class: 'empty-state', 'data-id': 'no-rows' }, icon(h, 'table'), 'No rows yet. Upload the sheet.');
  else if (!shown.length) body = h('p', { class: 'empty-state', 'data-id': 'no-match' }, icon(h, 'table'), 'No row has that Status and Type.');
  else {
    const columns = tableColumns(l.sheet);
    // The column names stay in view while the rows scroll under them.
    body = h(
      'div',
      { class: 'table-wrap rows-wrap', 'data-id': 'rows-table' },
      h(
        'table',
        { class: 'rows-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'row-head-cell' }, 'Row'), columns.map((c) => h('th', { scope: 'col', key: c.key ?? `c${c.col}`, class: `head-${c.key ?? 'other'}` }, columnHead(h, c))), h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Check')))),
        h('tbody', null, shown.map((r) => tableRow(ctx, r, columns))),
      ),
    );
  }
  const panel = runPanel(ctx);
  return h(
    'section',
    { class: 'card rows-card', key: 'rows', 'data-id': 'rows' },
    h(
      'div',
      { class: 'rows-head' },
      h('h2', null, 'Rows'),
      items.length && !waiting ? h('span', { class: 'rows-count', 'data-id': 'rows-count' }, shown.length === items.length ? rowsWord(items.length) : `${shown.length} of ${rowsWord(items.length)} shown`) : null,
      items.length && !waiting ? filters(ctx, items) : null,
    ),
    // How often the dashboard is right, by what staff marked right or changed.
    items.length && !waiting ? h('p', { class: 'staff-stats', 'data-id': 'staff-stats' }, icon(h, 'user'), staffStatsLine(items)) : null,
    state.rowsNotice ? h('div', { 'data-id': 'rows-notice' }, words.notice(h, state.rowsNotice.tone, state.rowsNotice.text)) : null,
    l.oldRows ? h('div', { 'data-id': 'old-rows' }, words.notice(h, 'warn', `${l.oldRows === 1 ? '1 row was' : `${l.oldRows} rows were`} made with the old layout and cannot be checked. "Remove all rows", under "More", removes ${l.oldRows === 1 ? 'it' : 'them'}.`)) : null,
    words.notice(h, 'error', l.error),
    h('div', { class: `rows-layout${panel ? ' with-live' : ''}` }, h('div', { class: 'rows-main' }, body), panel),
  );
}

/**
 * The live checking area beside the table, while the rows are checked one by
 * one: one progress bar with how many rows are done and left, the row being
 * checked with its steps as they happen, and the latest picture of the Live
 * Amazon Browser. A pause is said plainly.
 */
function runPanel(ctx) {
  const { h, words, state } = ctx;
  const run = state.all;
  if (!run) return null;
  const items = arr(state.list.items);
  const { total, done } = tallyOf(items);
  const pausedAt = run.paused ? rowWords(items.find((x) => x?.id === run.paused.rowId), run.paused.label) : null;
  let progress = null;
  if (run.running && run.current) progress = [`${checkingWords(ctx, items)}. `, h('button', { type: 'button', class: 'linkish', key: 'show', onclick: () => showRow(ctx, run.current.rowId), 'data-id': 'show-current' }, 'Show this row in the table')];
  else if (run.running) progress = run.view.action ?? 'Starting…';
  else if (run.summary && !run.summary.stopped) progress = 'Finished.';
  const view = { ...run.view, running: run.running };
  return h(
    'aside',
    { class: 'live-panel', key: 'run', 'aria-label': 'Checking the rows', 'data-id': 'run' },
    h(
      'div',
      { class: 'live-head' },
      h('h2', null, icon(h, run.running ? 'spinner' : 'browser', run.running ? 'icon-spin' : ''), 'Checking'),
      !run.running ? h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => { revokeAll(ctx, run.view.shots); ctx.update({ all: null }); }, 'data-id': 'close-run' }, icon(h, 'close'), 'Close') : null,
    ),
    progress ? h('p', { class: 'run-progress', role: 'status', 'aria-live': 'polite', 'data-id': 'run-progress' }, progress) : null,
    total ? h('progress', { max: String(total), value: String(done), 'aria-label': 'Rows done' }) : null,
    run.paused ? h('div', { class: 'notice notice-warn', role: 'alert', 'data-id': 'paused' }, h('p', null, run.paused.rowId ? `Paused at ${pausedAt}. ${run.paused.says} That row has no result yet.` : `Paused before the first row, while the campaigns' products were read from Amazon. ${run.paused.says}`)) : null,
    run.notice ? words.notice(h, run.notice.tone, run.notice.text) : null,
    run.current ? h('p', { class: 'live-links', key: 'links' }, h('button', { type: 'button', class: 'linkish', onclick: () => ctx.go(`amazon/${run.current.rowId}`), 'data-id': 'open-current' }, icon(h, 'open'), "Open this row's page")) : null,
    run.current ? liveCard(ctx, view, { flat: true }) : null,
    run.current ? activityCard(ctx, view, { flat: true }) : null,
  );
}

/** The Test email address box: the one address every email goes to (test mode), kept for next time. */
function addressBox(ctx) {
  const { h, words, state } = ctx;
  const a = state.address;
  const saved = state.list.emails?.testEmail ?? '';
  const typed = a.value ?? saved;
  return h(
    'div',
    { class: 'address-box', 'data-id': 'test-email' },
    h('label', { class: 'label', for: 'test-email-input' }, 'Test email address'),
    h(
      'div',
      { class: 'address-line' },
      h('input', { id: 'test-email-input', type: 'text', inputmode: 'email', autocomplete: 'off', spellcheck: 'false', placeholder: 'name@example.com', value: typed, disabled: a.saving, 'data-id': 'test-email-input', oninput: (e) => ctx.update((st) => (st.address.value = e.target.value)) }),
      h('button', { type: 'button', class: 'btn btn-small', disabled: a.saving || typed.trim() === saved, onclick: () => saveAddress(ctx), 'data-id': 'save-test-email' }, icon(h, 'check'), a.saving ? 'Saving…' : 'Save'),
    ),
    h('p', { class: 'note' }, saved ? `Test mode: every email goes only to ${saved}, never to anyone else. The address is kept for next time.` : 'Test mode: every email goes only to this address, never to anyone else. Fill it in and press Save; it is kept for next time.'),
    a.notice ? words.notice(h, 'good', a.notice) : null,
    words.notice(h, 'error', a.error),
  );
}

/** Where one email will really go, as the mode says: the test email address, or the row's own address from the file (or why it cannot go there). */
function toWords(ctx, it) {
  const { state } = ctx;
  if (state.email?.mode === 'real') return it.addressOk ? it.address : it.address ? `${it.address} (not an email address, so it will not be sent)` : 'no email address in the file, so it will not be sent';
  return state.list.emails?.testEmail || 'the test email address (fill it in above)';
}

/** What happened to one email, as a small label. */
function emailMark(h, it) {
  if (it.state === 'sent') return pill(h, 'Sent', 'good');
  if (it.state === 'maybe') return pill(h, 'Maybe sent: look in your Sent emails', 'warn');
  if (it.state === 'failed') return pill(h, 'Not sent', 'bad');
  if (it.state === 'untried') return pill(h, 'Not tried', 'quiet');
  if (it.state === 'sending') return pill(h, 'Sending…', 'info');
  if (it.state === 'waiting') return pill(h, 'Waiting', 'quiet');
  return null;
}

/**
 * The Test or Real choice above the emails: Test (every email only to the
 * test email address) to start with; Real (each email to that user's own
 * email address, from the file) only when the file has an email address
 * column.
 */
function modeChoice(ctx) {
  const { h, state } = ctx;
  const e = state.email;
  const column = Boolean(state.list.emails?.emailColumn);
  const choice = (mode, text, disabled) =>
    h(
      'label',
      { class: `mode-choice${disabled ? ' is-disabled' : ''}`, key: mode },
      h('input', { type: 'radio', name: 'email-mode', value: mode, checked: e.mode === mode, disabled: Boolean(e.sending) || disabled, 'data-id': `mode-${mode}`, onchange: () => ctx.update(() => Object.assign(e, { mode, error: null })) }),
      h('span', null, text),
    );
  return h(
    'fieldset',
    { class: 'mode-choices', 'data-id': 'email-mode' },
    h('legend', { class: 'label' }, 'Where the emails go'),
    choice('test', 'Test: every email goes only to the test email address', false),
    choice('real', "Real: each email goes to that user's own email address", !column),
    column ? null : h('p', { class: 'note' }, 'This file has no email address column, so Real cannot be chosen. A column named "Email", "Email ID" or "Email Address" in the next file is found by itself.'),
  );
}

/** One email's fields: where it goes, its subject and its words, which can be changed until it is sent. */
function emailFields(ctx, it, locked) {
  const { h } = ctx;
  return [
    h('p', { class: 'email-to', key: 'to' }, h('span', { class: 'filter-word' }, 'To: '), h('span', { 'data-id': `email-to-${it.rowId}` }, toWords(ctx, it))),
    h('div', { class: 'form-field', key: 'subject' }, h('label', { class: 'label', for: `subject-${it.rowId}` }, 'Subject'), h('input', { id: `subject-${it.rowId}`, type: 'text', autocomplete: 'off', value: it.subject, disabled: locked, 'data-id': `email-subject-${it.rowId}`, oninput: (ev) => (it.subject = ev.target.value) })),
    h('div', { class: 'form-field', key: 'message' }, h('label', { class: 'label', for: `message-${it.rowId}` }, 'Message'), h('textarea', { id: `message-${it.rowId}`, rows: '14', spellcheck: 'true', value: it.message, disabled: locked, 'data-id': `email-message-${it.rowId}`, oninput: (ev) => (it.message = ev.target.value) })),
  ];
}

/** "Emailed before, on 08-10-2026 at 14:05 (Not delivered)." under an email whose row was emailed before (or may have been). */
function emailedBeforeLine(ctx, it) {
  const { h, words } = ctx;
  if (!it.emailedBefore) return null;
  return h('p', { class: 'cell-words', 'data-id': `emailed-before-${it.rowId}` }, `${it.emailedBefore.maybe ? 'Maybe emailed' : 'Emailed'} before, on ${words.ist(it.emailedBefore.at)} (${it.emailedBefore.name}).`);
}

/** The one email, on a row's page: the row, the email's name, where it goes, and its subject and words. */
function emailItem(ctx, it) {
  const { h, words, state } = ctx;
  const e = state.email;
  const locked = Boolean(e?.sending) || it.state === 'sent' || it.state === 'maybe';
  return h(
    'div',
    { class: 'email-item', key: it.rowId, 'data-id': `email-${it.rowId}` },
    h('div', { class: 'email-head' }, h('h3', null, `${it.label}: ${it.name}`), emailMark(h, it)),
    emailedBeforeLine(ctx, it),
    emailFields(ctx, it, locked),
    it.says ? words.notice(h, it.state === 'maybe' ? 'warn' : 'error', it.says) : null,
  );
}

/**
 * One line per user, in "Email these users": a tick box, the row, the name,
 * the order ID and the email address; what happened to its email; and the
 * email itself, folded, to read and change.
 */
function emailLine(ctx, it) {
  const { h, words, state } = ctx;
  const e = state.email;
  const real = e?.mode === 'real';
  const sendable = !real || Boolean(it.addressOk);
  const locked = Boolean(e?.sending) || it.state === 'sent' || it.state === 'maybe';
  return h(
    'div',
    { class: 'email-item', key: it.rowId, 'data-id': `email-${it.rowId}` },
    h(
      'div',
      { class: 'email-line' },
      h('input', { type: 'checkbox', id: `tick-${it.rowId}`, checked: Boolean(it.ticked), disabled: locked || !sendable, 'data-id': `tick-${it.rowId}`, onchange: (ev) => ctx.update(() => (it.ticked = Boolean(ev.target.checked))) }),
      h('label', { for: `tick-${it.rowId}`, class: 'email-line-words', 'data-id': `email-line-${it.rowId}` }, h('strong', null, it.label), `: ${it.reviewer || 'no name'}, order ${it.orderId || 'unknown'}, ${it.address || 'no email address'}`),
      emailMark(h, it),
    ),
    real && !sendable ? h('p', { class: 'note', 'data-id': `email-why-${it.rowId}` }, `Not sent: ${it.addressSays ?? 'there is no email address in the file for this row.'}`) : null,
    emailedBeforeLine(ctx, it),
    it.says ? words.notice(h, it.state === 'maybe' ? 'warn' : 'error', it.says) : null,
    h('details', { class: 'email-open', 'data-id': `email-open-${it.rowId}` }, h('summary', null, `Show the email (${it.name})`), emailFields(ctx, it, locked)),
  );
}

/**
 * The emails before they are sent: the Test or Real choice, the test email
 * address (in Test mode), then the one email, or one line per user with a
 * tick box, "Tick all" and "Untick all". Then Send (or "Send to the ticked
 * users (N)") and Cancel. While they are sent, each one says Waiting,
 * Sending, Sent, Maybe sent, Not sent or Not tried, with its reason, and
 * Stop stops after the one being sent. At the end, the numbers are said on
 * their own lines.
 */
function emailPanel(ctx) {
  const { h, words, state } = ctx;
  const e = state.email;
  if (!e) return null;
  const to = state.list.emails?.testEmail ?? '';
  const one = e.kind === 'one';
  const real = e.mode === 'real';
  const chosen = chosenEmails(e);
  const canSend = !e.loading && !e.sending && e.items.length > 0 && (real ? Boolean(state.list.emails?.emailColumn) : Boolean(to)) && !busy(state);
  const locked = Boolean(e.sending);
  const sendable = (it) => !real || Boolean(it.addressOk);
  return h(
    'section',
    { class: 'card email-panel', key: 'email', 'data-id': 'email-panel' },
    h('div', { class: 'card-head' }, h('h2', null, icon(h, 'mail'), one ? 'Email this user' : 'Email these users')),
    h('p', { class: 'card-sub' }, one ? 'Read the email, change its words if you like, then press Send. Nothing is sent until you do.' : 'Tick the users to email. Each line opens to show its email, to read and change. Nothing is sent until you press "Send to the ticked users". The emails go one at a time, a few seconds apart.'),
    modeChoice(ctx),
    real ? null : addressBox(ctx),
    e.loading ? h('p', { class: 'muted', role: 'status' }, 'Preparing the emails…') : null,
    words.notice(h, 'error', e.error),
    e.skipped.length ? words.notice(h, 'warn', e.skipped.map((x) => x.says).join(' ')) : null,
    !one && e.items.length
      ? h(
          'div',
          { class: 'tick-actions' },
          h('button', { type: 'button', class: 'btn btn-small btn-quiet', disabled: locked, onclick: () => ctx.update(() => e.items.forEach((it) => (it.ticked = sendable(it)))), 'data-id': 'tick-all' }, 'Tick all'),
          h('button', { type: 'button', class: 'btn btn-small btn-quiet', disabled: locked, onclick: () => ctx.update(() => e.items.forEach((it) => (it.ticked = false))), 'data-id': 'untick-all' }, 'Untick all'),
          h('span', { class: 'muted small', 'data-id': 'ticked-count' }, `${e.items.filter((it) => it.ticked).length} of ${e.items.length} ticked`),
        )
      : null,
    e.items.map((it) => (one ? emailItem(ctx, it) : emailLine(ctx, it))),
    e.action ? h('p', { class: 'action', role: 'status', 'aria-live': 'polite', 'data-id': 'email-action' }, e.action) : null,
    e.notice ? words.notice(h, e.notice.tone, e.notice.text, e.done ? h('ul', { class: 'email-summary', 'data-id': 'email-summary' }, summaryLines(e.done).map((l) => h('li', { key: l }, l))) : null) : null,
    h(
      'div',
      { class: 'actions' },
      e.items.length || e.loading ? h('button', { type: 'button', class: 'btn btn-primary', disabled: !canSend || !chosen.length, title: !real && !to ? 'Fill in the Test email address first.' : !one && !chosen.length ? 'Tick at least one user first.' : null, onclick: () => sendEmails(ctx), 'data-id': 'send-emails' }, icon(h, e.sending ? 'spinner' : 'mail', e.sending ? 'icon-spin' : ''), e.sending ? 'Sending…' : one ? 'Send' : `Send to the ticked users (${chosen.length})`) : null,
      e.sending ? h('button', { type: 'button', class: 'btn btn-danger', onclick: () => stopEmails(ctx), 'data-id': 'stop-emails' }, icon(h, 'stop'), 'Stop') : h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => closeEmails(ctx), 'data-id': 'cancel-emails' }, e.done || e.paused ? 'Close' : 'Cancel'),
    ),
  );
}

/** "Change the result", on a row's page: the Status, the Type and the Note, then Save. */
function editForm(ctx, r) {
  const { h, words, state } = ctx;
  const e = state.edit;
  if (!e || e.rowId !== r.id) return null;
  const types = arr(state.list.types);
  return h(
    'section',
    { class: 'card edit-result', key: 'edit', 'data-id': 'edit-result' },
    h('h3', null, 'Change the result'),
    h('p', { class: 'card-sub' }, 'Choose the Status and the Type, write the Note, then press Save. The row then says "Changed by staff", and the line above the table counts the dashboard\'s result as wrong. "Check every row again" leaves it as you set it; "Check again" on this page replaces it.'),
    h(
      'div',
      { class: 'form-grid' },
      h(
        'div',
        { class: 'form-field' },
        h('label', { class: 'label', for: 'edit-final' }, 'Status'),
        h('select', { id: 'edit-final', value: e.final, disabled: e.busy, 'data-id': 'edit-final', onchange: (ev) => ctx.update((st) => (st.edit.final = ev.target.value)) }, ['pass', 'fail', 'manual'].map((k) => h('option', { key: k, value: k, selected: e.final === k }, FINAL_WORDS[k]))),
      ),
      h(
        'div',
        { class: 'form-field' },
        h('label', { class: 'label', for: 'edit-type' }, 'Type'),
        h('select', { id: 'edit-type', value: e.typeKey, disabled: e.busy, 'data-id': 'edit-type', onchange: (ev) => ctx.update((st) => (st.edit.typeKey = ev.target.value)) }, h('option', { value: '', selected: !e.typeKey }, 'Choose a Type'), types.map((t) => h('option', { key: t.key, value: t.key, selected: e.typeKey === t.key }, t.word))),
      ),
    ),
    h('div', { class: 'form-field wide' }, h('label', { class: 'label', for: 'edit-note' }, 'Note'), h('textarea', { id: 'edit-note', rows: '4', value: e.note, disabled: e.busy, 'data-id': 'edit-note', oninput: (ev) => (e.note = ev.target.value) })),
    words.notice(h, 'error', e.error),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-primary', disabled: e.busy || !e.typeKey, onclick: () => saveResult(ctx), 'data-id': 'save-result' }, icon(h, 'check'), e.busy ? 'Saving…' : 'Save'),
      h('button', { type: 'button', class: 'btn btn-quiet', disabled: e.busy, onclick: () => ctx.update({ edit: null }), 'data-id': 'cancel-result' }, 'Cancel'),
    ),
  );
}

/** The Email templates box, under More: the sign-off and every email, to read and change, and the test email address. */
function templatesCard(ctx) {
  const { h, words, state } = ctx;
  const t = state.templates;
  const got = state.list.emails;
  if (!got) return null;
  // What is shown: the words being changed, else the ones the server has.
  const v = t.values ?? { signOff: got.signOff ?? '', templates: Object.fromEntries(arr(got.templates).map((x) => [x.key, { subject: x.subject ?? '', message: x.message ?? '' }])) };
  const change = (fn) =>
    ctx.update((st) => {
      st.templates.values ??= v;
      fn(st.templates.values);
    });
  return h(
    'section',
    { class: 'more-part templates', key: 'templates', 'data-id': 'templates' },
    h('h3', null, icon(h, 'mail'), ' Email templates'),
    h('p', { class: 'card-sub' }, 'The email sent for each Type that is not Pass. Read each one and change its words if you like, then press "Save the emails". The words in curly brackets are filled in for each row:'),
    h('ul', { class: 'placeholders', 'data-id': 'placeholders' }, arr(got.placeholders).map((p) => h('li', { key: p.word }, h('strong', null, p.word), ` is ${p.means}`))),
    addressBox(ctx),
    h('div', { class: 'form-field wide sign-off' }, h('label', { class: 'label', for: 'template-sign-off' }, 'Sign-off, at the end of every email'), h('textarea', { id: 'template-sign-off', rows: '2', value: v.signOff, disabled: t.saving, 'data-id': 'template-sign-off', oninput: (ev) => change((x) => (x.signOff = ev.target.value)) })),
    arr(got.templates).map((x) =>
      h(
        'div',
        { class: 'template', key: x.key, 'data-id': `template-${x.key}` },
        h('h4', null, x.name),
        h('div', { class: 'form-field' }, h('label', { class: 'label', for: `template-subject-${x.key}` }, 'Subject'), h('input', { id: `template-subject-${x.key}`, type: 'text', autocomplete: 'off', value: v.templates[x.key]?.subject ?? '', disabled: t.saving, 'data-id': `template-subject-${x.key}`, oninput: (ev) => change((y) => (y.templates[x.key] = { ...y.templates[x.key], subject: ev.target.value })) })),
        h('div', { class: 'form-field' }, h('label', { class: 'label', for: `template-message-${x.key}` }, 'Message'), h('textarea', { id: `template-message-${x.key}`, rows: '12', value: v.templates[x.key]?.message ?? '', disabled: t.saving, 'data-id': `template-message-${x.key}`, oninput: (ev) => change((y) => (y.templates[x.key] = { ...y.templates[x.key], message: ev.target.value })) })),
      ),
    ),
    words.notice(h, 'error', t.error),
    t.notice ? words.notice(h, 'good', t.notice) : null,
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-primary', disabled: t.saving || !t.values, onclick: () => saveTemplates(ctx), 'data-id': 'save-templates' }, icon(h, 'check'), t.saving ? 'Saving…' : 'Save the emails'),
      t.values && !t.saving ? h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => ctx.update((st) => (st.templates = { values: null, saving: false, error: null, notice: null })), 'data-id': 'undo-templates' }, 'Undo my changes') : null,
    ),
  );
}

function addCard(ctx) {
  const { h, words, state } = ctx;
  const f = state.form;
  // Only the fields the uploaded file has; with no file in, every one.
  const had = fieldsHad(state.list.sheet);
  return h(
    'section',
    { class: 'more-part', key: 'add', 'data-id': 'add' },
    h('h3', null, 'Add a row by hand'),
    h('p', { class: 'card-sub' }, 'For testing one row. Each picture can be a file or a link.'),
    h(
      'div',
      { class: 'user-form' },
      FORM_FIELDS.filter((field) => !had || had.has(field.column)).map((field) => {
        const id = `add-${field.key}`;
        if (!field.picture) {
          return h('div', { class: 'form-field', key: field.key }, h('label', { for: id, class: 'label' }, field.label), h('input', { id, type: 'text', autocomplete: 'off', spellcheck: 'false', value: f.values[field.key] ?? '', 'data-id': id, oninput: (e) => (f.values[field.key] = e.target.value) }), field.note ? h('p', { class: 'note' }, field.note) : null);
        }
        return h(
          'div',
          { class: 'form-field', key: field.key },
          h('label', { for: `${id}-link`, class: 'label' }, field.label),
          h('input', { id: `${id}-link`, type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'A link', value: f.values[`${field.key}Link`] ?? '', 'data-id': `${id}-link`, oninput: (e) => (f.values[`${field.key}Link`] = e.target.value) }),
          h('label', { for: `${id}-file`, class: 'sr-only' }, `${field.label} as a file`),
          h('input', { key: `${id}-file-${f.gen}`, id: `${id}-file`, type: 'file', accept: 'image/png,image/jpeg,image/webp', 'data-id': `${id}-file`, onchange: (e) => ctx.update(() => (f.files[field.key] = e.target.files?.[0] ?? null)) }),
          h('p', { class: 'note' }, `${field.note ? `${field.note} ` : ''}Or choose a picture file, at most 10 megabytes.`),
        );
      }),
    ),
    words.notice(h, 'error', f.error),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-primary', disabled: f.saving, onclick: () => addRow(ctx), 'data-id': 'add-row' }, icon(h, 'plus'), f.saving ? 'Adding…' : 'Add row')),
  );
}

/** "More", at the bottom, closed to start with: adding a row by hand, and removing every row. */
function moreSection(ctx) {
  const { h, words, state } = ctx;
  const l = state.list;
  const total = arr(l.items).length + (l.oldRows || 0);
  return h(
    'details',
    { class: 'card fold more', key: 'more', 'data-id': 'more' },
    h('summary', { class: 'fold-head' }, icon(h, 'more', 'fold-icon'), h('h2', null, 'More'), h('span', { class: 'fold-sum' }, total ? 'Add a row by hand, the email templates, or remove all rows' : 'Add a row by hand, or the email templates'), icon(h, 'chevron', 'fold-chevron')),
    h(
      'div',
      { class: 'fold-body' },
      addCard(ctx),
      templatesCard(ctx),
      total
        ? h(
            'div',
            { class: 'more-part remove-all', 'data-id': 'remove-all-area' },
            h('h3', null, 'Remove all rows'),
            h('p', { class: 'card-sub' }, 'Removes every row and its pictures. The login, the sheet and the campaigns stay. Download the results first to keep them.'),
            h('button', { type: 'button', class: 'btn btn-danger', disabled: removeBlocked(state), onclick: () => removeAllRows(ctx), 'data-id': 'remove-all' }, icon(h, 'trash'), state.removing ? 'Removing…' : 'Remove all rows'),
            words.notice(h, 'error', state.removeError),
          )
        : null,
      state.account.data ? h('p', { class: 'reader-line more-part', 'data-id': 'reader-line' }, icon(h, 'info'), obj(state.account.data).hindi ? 'The dashboard reads the screenshots on this computer, in English and Hindi.' : 'The dashboard reads the screenshots on this computer, in English only, because Hindi reading is not set up on this computer.') : null,
    ),
  );
}

function bigPicture(ctx) {
  const { h, words, state } = ctx;
  const b = state.big;
  if (!b) return null;
  return h(
    'div',
    { class: 'big', role: 'dialog', 'aria-modal': 'true', 'aria-label': b.title, 'data-id': 'big', onclick: () => closeBig(ctx) },
    h(
      'figure',
      { class: 'big-inner', onclick: (e) => e.stopPropagation() },
      h('div', { class: 'card-head' }, h('figcaption', null, b.title), h('button', { type: 'button', class: 'btn btn-small', onclick: () => closeBig(ctx), 'data-id': 'close-big' }, icon(h, 'close'), 'Close')),
      b.url ? h('img', { src: b.url, alt: b.title, 'data-id': 'big-img' }) : b.loading ? h('p', { class: 'muted', role: 'status' }, 'Fetching…') : null,
      words.notice(h, 'error', b.error),
    ),
  );
}

// ---- one row's full result ----

function dl(ctx, pairs) {
  return ctx.words.fields(ctx.h, pairs);
}

function cellSaid(ctx, r, which) {
  const { h, words } = ctx;
  const s = obj(r.shots?.[which]);
  const pics = arr(s.pictures);
  const parts = [];
  if (s.mismatch) parts.push(h('p', { key: 'mm', class: 'missing-word' }, 'The link written in this cell is different from the link that opens when you click it. The dashboard checks the link that opens when clicked.'));
  if (s.how === 'cell' || s.how === 'floating') parts.push(h('p', { key: 'how' }, s.how === 'cell' ? 'A picture placed in the cell.' : 'A picture over the cell.'));
  if (s.how === 'upload') parts.push(h('p', { key: 'how' }, 'A file given here.'));
  arr(s.links).forEach((l, i) => {
    const p = pics[i];
    const label = arr(s.labels).find((x) => x?.link === l)?.label ?? 'Open the link';
    parts.push(h('p', { key: `l${i}` }, words.link(h, l, label), p && !p.ok ? h('span', { class: 'missing-word' }, `. Not opened, because ${p.problem?.says ?? 'it could not be opened'}.`) : null));
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

/**
 * What the row holds, under the uploaded file's own column names and in its
 * order: only the columns the file has (with no file in, the fields' plain
 * names), and the pictures of its picture columns.
 */
function detailsCard(ctx, r) {
  const { h, state } = ctx;
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
  const columns = tableColumns(state.list.sheet).filter((c) => !['status', 'type', 'note'].includes(c.key));
  const named = Object.fromEntries(columns.filter((c) => c.key).map((c) => [c.key, c.name]));
  const had = fieldsHad(state.list.sheet);
  const pictureCells = PICTURE_KEYS.filter((w) => !had || had.has(CELL_COLUMN[w]));
  return h(
    'section',
    { class: 'card', 'data-id': 'row-details' },
    h('h3', null, 'From the sheet'),
    dl(ctx, [['Row', r.label], ...columns.map((c) => [c.name, field[c.key] ? field[c.key]() : otherSaid(ctx, r, c.col)])]),
    h(
      'div',
      { class: 'user-shots' },
      pictureCells.flatMap((w) => arr(r.shots?.[w]?.pictures).filter((p) => p?.ok).map((p) => h('div', { key: `${w}-${p.i}`, class: 'user-shot' }, h('p', { class: 'label' }, named[CELL_COLUMN[w]] ?? WHAT[w]), thumbButton(ctx, r, w, p, true)))),
    ),
    r.prev ? h('p', { class: 'muted small' }, `In the file before: ${[FINAL_WORDS[r.prevFinal], r.prev.type].filter(Boolean).join(', ') || 'nothing'}${r.prev.note ? `. ${r.prev.note}` : ''}`) : null,
    state.open?.loading ? h('p', { class: 'muted small', role: 'status' }, 'Updating…') : null,
  );
}

/** Amounts read from a screenshot, as rupees with what they are: "₹654 (order total), ₹654 (grand total)". */
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

function readCards(ctx, res) {
  const { h, words, state } = ctx;
  const o = res?.order;
  const d = res?.delivery;
  const p = res?.reviewPicture;
  const a = res?.amazon;
  // A screenshot the file has no column for has no card.
  const had = fieldsHad(state.list.sheet);
  const shows = (key) => !had || had.has(key);
  const read = (x) => `Read on this computer, in ${x.hindi ? 'English and Hindi' : 'English only'}: ${x.wordCount ?? 0} words, read with ${x.confidence ?? 0} percent certainty.`;
  const everything = (t) => (t ? h('details', null, h('summary', null, 'Everything read from it'), h('pre', { class: 'ocr-text' }, t)) : null);
  return [
    !shows('orderShot') ? null : h(
      'section',
      { class: 'card', key: 'card-order', 'data-id': 'card-order' },
      h('h3', null, 'Read from the purchase screenshot'),
      o
        ? h('div', null, o.problem ? words.notice(h, 'warn', o.problem) : null, dl(ctx, [['Order IDs', arr(o.orderIds).join(', ') || 'None shown'], ['Dates', arr(o.dates).join(', ') || 'None shown'], ['Amounts', amountsSaid(o.amounts) || 'None shown'], ['Product', o.product], ['Read by', read(o)]]), everything(o.text))
        : h('p', { class: 'muted' }, 'Not read yet.'),
    ),
    !shows('deliveryShot') ? null : h(
      'section',
      { class: 'card', key: 'card-delivery', 'data-id': 'card-delivery' },
      h('h3', null, 'Read from the delivery screenshot'),
      d
        ? h('div', null, d.problem ? words.notice(h, 'warn', d.problem) : null, dl(ctx, [['Delivered', d.delivered ? d.deliveredText : 'Not shown'], ['Order IDs', arr(d.orderIds).join(', ') || 'None shown'], ['Order dates', arr(d.dates).join(', ') || 'None shown'], ['Amounts', amountsSaid(d.amounts) || 'None shown'], ['Product', d.product], ['Read by', read(d)]]), everything(d.text))
        : h('p', { class: 'muted' }, 'Not read yet.'),
    ),
    p
      ? h(
          'section',
          { class: 'card', key: 'card-review-picture', 'data-id': 'card-review-picture' },
          h('h3', null, 'Read from the review screenshot'),
          dl(ctx, [
            ['What it shows', { refused: 'Amazon refusing the review', rating: 'A star rating only', written: 'A written review', unknown: 'Not certain' }[p.kind] ?? p.kind],
            ['Stars', p.stars ? `${p.stars} of 5 (${p.starsHow})` : p.starsHow],
            ["Amazon's words", p.refusal],
            ['Name', p.written?.name],
            ['Written words', p.written?.body],
            ['Why not certain', p.why],
          ]),
          everything(p.text),
        )
      : null,
    h(
      'section',
      { class: 'card', key: 'card-amazon', 'data-id': 'card-amazon' },
      h('h3', null, 'Found on Amazon'),
      a
        ? h('div', null, words.quote(h, a.body), dl(ctx, [['Reviewer name', a.name], ['Stars', a.stars ? `${a.stars} of 5` : null], ['Title', a.title], ['Date', a.dateText], ['Reviewed product', a.productTitle]]))
        : h('p', { class: 'muted' }, 'Nothing read from Amazon yet. Amazon is opened only for an Amazon link, or to look for a review sent as a picture.'),
      res?.productPage ? dl(ctx, [["Product's page", res.productPage.title], ['Colours and sizes listed', arr(res.productPage.variants).length ? String(arr(res.productPage.variants).length) : null]]) : null,
      res?.publicReview
        ? h('div', null, h('h4', null, 'Under "See all reviews"'), dl(ctx, [['Searched for', arr(res.publicReview.searched).map((t) => `"${t.word}"`).join(' and ') || null], ['Found', res.publicReview.found ? words.link(h, res.publicReview.link, 'Yes. Open the review on Amazon') : 'No']]))
        : null,
    ),
  ];
}

function comparisonCard(ctx, res) {
  const { h, words } = ctx;
  const rows = arr(res?.comparison);
  // Only the screenshots the file has a column for (a check made before this was known has both).
  const shots = Array.isArray(res?.shotsHad) ? ['order', 'delivery'].filter((w) => res.shotsHad.includes(w)) : ['order', 'delivery'];
  return h(
    'section',
    { class: 'card', key: 'card-comparison', 'data-id': 'card-comparison' },
    h('h3', null, 'Comparison'),
    rows.length
      ? words.table(
          h,
          ['Field', 'Sheet', ...shots.map((w) => WHAT[w]), 'Amazon', 'Result'],
          rows.map((row, i) =>
            h(
              'tr',
              { key: `c${i}` },
              h('th', { scope: 'row' }, row.field ?? ''),
              h('td', { class: 'wrap cell-text' }, row.sheet ?? ''),
              shots.map((w) => h('td', { key: w, class: 'wrap cell-text' }, row[w] ?? '')),
              h('td', { class: 'wrap cell-text' }, row.amazon ?? ''),
              h('td', { class: `wrap result-cell tone-${row.ok === true ? 'good' : row.ok === false ? 'bad' : 'quiet'}` }, row.result ?? ''),
            ),
          ),
          { class: 'comparison-table' },
        )
      : h('p', { class: 'muted' }, 'The comparison appears when a check finishes.'),
  );
}

/** The row's Type and Note. Its Status is not said again here: it is at the top of the page, large, with its reason. */
function resultCard(ctx, r, res) {
  const { h, words } = ctx;
  // A result a staff member changed by hand comes first: the check's own Type and Note no longer count.
  const staff = r?.last?.staff ?? null;
  const shown = staff ? { type: r.last.type, note: r.last.note, at: r.last.at } : res?.type ? { type: res.type, note: res.note, at: res.finishedAt } : r?.last ? { ...resultOf(r, null), at: r.last.at } : null;
  return h(
    'section',
    { class: 'card result-card', 'data-id': 'card-result' },
    h('h3', null, 'Type and Note'),
    shown
      ? h('div', null, h('p', { class: 'row-status' }, h('span', { class: 'tag', 'data-id': 'result-type' }, shown.type), ' ', h('span', { class: 'muted small' }, staff ? `${staff.right ? 'Marked right' : 'Changed'} by staff on ${words.ist(staff.at)}` : words.ist(shown.at))), h('p', { class: 'note-text', 'data-id': 'result-note' }, shown.note), emailedLine(ctx, r))
      : r?.prev && !r.recheck
        ? h('div', null, h('p', { class: 'row-status' }, h('span', { class: 'tag' }, r.prev.type || 'No Type'), ' ', h('span', { class: 'muted small' }, 'From the file')), h('p', { class: 'note-text' }, r.prev.note))
        : h('p', { class: 'muted' }, 'Not checked yet.'),
  );
}

/** At the top of a row's page: its Status, large, in its colour and with its icon, and the reason. */
function finalBanner(ctx, listed) {
  const { h, state } = ctx;
  const res = resultOf(listed, state);
  const key = res.from !== 'now' && FINAL_WORDS[res.final] ? res.final : null;
  let says;
  if (res.from === 'now') says = 'This row is being checked now.';
  else if (!isDone(listed) || !FINAL_WORDS[res.final]) says = 'Not checked yet.';
  else if (res.from === 'file') says = 'From the file: the uploaded file already had a Status for this row.';
  else if (res.staff?.right) says = `Marked right by staff on ${ctx.words.ist(res.staff.at)}.${res.finalSays ? ` ${res.finalSays}` : ''}`;
  else if (res.staff) says = `Changed by staff on ${ctx.words.ist(res.staff.at)}. "Check again" replaces it with what the dashboard finds.`;
  else says = res.finalSays || 'This row was checked before the dashboard kept a reason for its Status. Press "Check again" to see the reason.';
  return h(
    'section',
    { class: `final-banner final-banner-${key ?? 'none'}`, key: 'final', 'data-id': 'final-banner' },
    h('p', { class: 'final-big', 'data-id': 'final-word' }, res.from === 'now' ? icon(h, 'spinner', 'icon-spin') : icon(h, FINAL_ICON[key ?? 'none']), key ? FINAL_WORDS[key] : res.from === 'now' ? 'Checking…' : FINAL_NONE),
    h('p', { class: 'final-says', 'data-id': 'final-says' }, says),
  );
}

/** The latest picture of the Live Amazon Browser, with the step it was taken after. flat: drawn inside the live checking area, without a card of its own. */
function liveCard(ctx, view, { flat = false } = {}) {
  const { h, state } = ctx;
  const shots = arr(view.shots);
  const latest = shots.find((x) => x.n === state.picked) ?? shots[shots.length - 1] ?? null;
  return h(
    'section',
    { class: flat ? 'live live-flat' : 'card live', key: 'live', 'data-id': 'live' },
    h('h3', null, icon(h, 'browser'), 'Live Amazon Browser'),
    flat ? null : h('p', { class: 'card-sub' }, 'The Chrome window named "Live Amazon Browser" shows each Amazon page as it opens. A picture of it is taken after every step once it is open.'),
    h('p', { class: 'action', role: 'status', 'aria-live': 'polite', 'data-id': 'current-action' }, view.action ?? (view.running ? 'Working…' : 'Not running.')),
    latest
      ? h('figure', { class: 'live-shot' }, h('img', { src: latest.url, alt: `The Live Amazon Browser after step ${latest.n}: ${latest.name}`, 'data-id': 'live-shot' }), h('figcaption', null, `Step ${latest.n}: ${latest.name}`))
      : h('p', { class: 'live-empty' }, icon(h, 'image'), 'No picture yet. The pictures are read on this computer first; Amazon opens at step 6.'),
    shots.length > 1
      ? h('div', { class: 'shot-list', role: 'group', 'aria-label': 'Pictures by step' }, shots.map((x) => h('button', { type: 'button', key: `s${x.n}`, class: 'chip', 'aria-pressed': latest?.n === x.n ? 'true' : 'false', onclick: () => ctx.update({ picked: x.n }), 'data-id': `pick-${x.n}` }, `Step ${x.n}`)))
      : null,
  );
}

/** The ten steps of a check, each marked as it happens. */
function activityCard(ctx, view, { flat = false } = {}) {
  const { h } = ctx;
  const steps = arr(view.steps).length ? view.steps : freshSteps();
  return h(
    'section',
    { class: flat ? 'steps steps-flat' : 'card steps', key: 'activity', 'data-id': 'activity' },
    h('h3', null, icon(h, 'steps'), 'Steps'),
    h(
      'ol',
      { class: 'activity' },
      steps.map((st) => {
        const m = MARKS[st?.state] ?? MARKS.waiting;
        return h(
          'li',
          { key: `a${st?.n}`, class: `step step-${m.tone}`, 'data-id': `step-${st?.n}` },
          h('span', { class: 'step-mark', 'aria-hidden': 'true' }, m.mark),
          h('div', { class: 'step-body' }, h('span', { class: 'step-name' }, `${st?.n}. ${st?.name ?? ''}`), ' ', h('span', { class: `step-state tone-${m.tone}` }, m.label), st?.detail ? h('p', { class: 'step-detail' }, st.detail) : null),
        );
      }),
    ),
  );
}

function rowPage(ctx) {
  const { h, words, state } = ctx;
  const o = state.open;
  const back = h('button', { type: 'button', class: 'btn btn-quiet back', onclick: () => ctx.go('amazon'), 'data-id': 'back' }, icon(h, 'back'), 'All rows');
  if (!o || (o.loading && !o.row)) return h('div', { class: 'amazon row-page' }, h('div', { class: 'actions' }, back), h('p', { class: 'muted', role: 'status' }, 'Opening the row…'));
  if (o.error && !o.row) return h('div', { class: 'amazon row-page' }, h('div', { class: 'actions' }, back), words.notice(h, 'error', o.error));
  const r = obj(o.row);
  const inRun = r.id && state.all?.running && state.all.current?.rowId === r.id ? state.all : null;
  const single = !inRun && r.id && state.check && state.check.rowId === r.id ? state.check : null;
  const liveView = inRun ? { ...inRun.view, running: true } : single ? { ...single.view, running: single.running } : null;
  const view = liveView ?? { running: false, steps: arr(o.result?.steps), shots: o.shots, action: o.result?.finishedAt ? `Last check finished ${words.ist(o.result.finishedAt)}.` : null };
  const res = liveView ? liveView.result : o.result;
  const listed = arr(state.list.items).find((x) => x?.id === r.id) ?? r;

  return h(
    'div',
    { class: 'amazon row-page' },
    h(
      'div',
      { class: 'row-head', key: 'head' },
      back,
      h('h1', { class: 'row-title' }, `${r.label ?? 'Row'}${r.orderId ? `: order ID ${r.orderId}` : ''}`),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn-primary', disabled: busy(state) || Boolean(state.list.settingsProblem), onclick: () => startCheck(ctx, r.id), 'data-id': 'check' }, icon(h, single?.running ? 'spinner' : isDone(listed) ? 'refresh' : 'play', single?.running ? 'icon-spin' : ''), single?.running ? 'Checking…' : isDone(listed) ? 'Check again' : 'Check'),
        single?.running ? h('button', { type: 'button', class: 'btn btn-danger', onclick: () => stopCheck(ctx), 'data-id': 'stop' }, icon(h, 'stop'), 'Stop') : null,
        h('button', { type: 'button', class: 'btn', disabled: busy(state) || Boolean(state.edit), title: 'Choose the Status, the Type and the Note yourself.', onclick: () => editResult(ctx, listed), 'data-id': 'change-result' }, icon(h, 'edit'), 'Change the result'),
        // "The result is right": only for the dashboard's own result (not one staff chose).
        isDone(listed) && listed.last && !changedByStaff(listed) ? h('button', { type: 'button', class: 'btn', disabled: busy(state) || state.marking || markedRight(listed), title: 'Counts this result as checked by staff and right.', onclick: () => markRight(ctx, listed), 'data-id': 'result-right' }, icon(h, 'check'), markedRight(listed) ? 'Marked right by staff' : state.marking ? 'Marking…' : 'The result is right') : null,
        listed.emailKey ? h('button', { type: 'button', class: 'btn', disabled: busy(state) || Boolean(state.email), title: 'The email is shown first, for you to read and change; nothing is sent until you press Send.', onclick: () => openEmails(ctx, 'one', [r.id]), 'data-id': 'email-user' }, icon(h, 'mail'), 'Email this user') : null,
        h('button', { type: 'button', class: 'btn btn-danger', disabled: removeBlocked(state), onclick: () => deleteRow(ctx, r.id), 'data-id': 'delete-row' }, icon(h, 'trash'), state.removing ? 'Deleting…' : 'Delete row'),
      ),
    ),
    finalBanner(ctx, listed),
    words.notice(h, state.notice?.tone ?? 'info', state.notice?.text),
    single?.notice ? words.notice(h, single.notice.tone, single.notice.text) : null,
    editForm(ctx, r),
    emailPanel(ctx),
    h(
      'div',
      { class: 'amazon-page', key: 'page' },
      // The Type and Note card shows the row as the table has it (a result changed by staff, and the emails sent, reach the table at once).
      h('div', { class: 'amazon-left' }, resultCard(ctx, listed, liveView ? (liveView.done && !liveView.failed && !liveView.running ? res : null) : res?.type ? res : null), detailsCard(ctx, r), readCards(ctx, res)),
      h('div', { class: 'amazon-right' }, liveCard(ctx, view), activityCard(ctx, view)),
    ),
    comparisonCard(ctx, res),
    bigPicture(ctx),
  );
}

function renderScreen(ctx) {
  const { h, words, state } = ctx;
  if (ctx.route) return rowPage(ctx);
  const items = arr(state.list.items);
  return h(
    'div',
    { class: 'amazon' },
    state.list.settingsProblem ? h('div', { 'data-id': 'settings-problem' }, words.notice(h, 'error', `The settings file has a problem, so nothing can be checked until it is put right. ${state.list.settingsProblem}`)) : null,
    words.notice(h, state.notice?.tone ?? 'info', state.notice?.text),
    sheetCard(ctx),
    campaignsCard(ctx),
    items.length && !state.columns.need ? overview(ctx, items) : null,
    state.email?.kind === 'many' ? emailPanel(ctx) : null,
    rowsCard(ctx),
    moreSection(ctx),
    bigPicture(ctx),
  );
}

export default {
  id: 'amazon',
  title: 'Amazon Review Checker',
  blurb: 'Check each Amazon order row by row, the way staff check it by hand, and write a Status (Pass, Fail or Needs Manual Staff Checking), a Type and a Note for every row.',
  initial,
  enter,
  reset,
  render: renderScreen,
  bar: renderBar,
  dropFile,
  dragging,
};
