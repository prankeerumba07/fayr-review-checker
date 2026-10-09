// The Flipkart screen. The top bar holds the marketplace tabs (bar() below),
// with Flipkart chosen and Amazon one press away. The page: the upload area,
// which looks like the Amazon one ("Choose file", or drop the file anywhere
// on the page: app.js passes it on), for an .xlsx or a .csv file. Once a file
// is in, one slim line says its name, the tab read and how many rows it has,
// with "Replace file", and a table shows every row with every column as it is
// in the file, numbered from 1. A link shows as "Link" and opens in a new tab;
// a picture in a cell shows as "Picture in the file". Nothing is checked yet,
// and there are no Amazon or Google login lines. The local server reads and
// keeps the file; this screen only shows it.

const BASE = '/local/flipkart';

/** The kinds of file the file chooser offers: Excel files (.xlsx) and CSV files. */
export const SHEET_ACCEPT = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

const arr = (v) => (Array.isArray(v) ? v : []);
const icon = (h, name, extra = '') => h('span', { class: `icon icon-${name}${extra ? ` ${extra}` : ''}`, 'aria-hidden': 'true' });

function initial() {
  return {
    saved: null, // the kept file as the server shows it: { sheet, headers, rows }
    loaded: false,
    loadError: null,
    loadGen: 0,
    upload: { file: null, gen: 0, busy: false, error: null, dragging: false, done: false, chooseTab: null },
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
  ctx.update((st) => Object.assign(st.upload, { file, gen: st.upload.gen + 1, error: null, done: false, chooseTab: null }));
  return sendFile(ctx, null);
}

/**
 * Sends the file being uploaded; the server reads and keeps it at once. When
 * the file has several tabs and none is named "Flipkart", nothing changed:
 * the tabs show, and pressing one sends the same file again with that tab.
 */
async function sendFile(ctx, tab) {
  const up = ctx.state.upload;
  const file = up.file;
  if (!file || (tab !== null && up.busy)) return;
  ctx.update((st) => Object.assign(st.upload, { busy: true, error: null }));
  try {
    const fd = new FormData();
    fd.append('file', file, file.name || 'file');
    if (tab !== null) fd.append('tab', tab);
    const out = await ctx.local.form(`${BASE}/sheet`, fd);
    if (out?.chooseTab) {
      ctx.update((st) => Object.assign(st.upload, { busy: false, chooseTab: { says: String(out.chooseTab.says ?? ''), tabs: arr(out.chooseTab.tabs).map(String) } }));
      return;
    }
    ctx.update((st) => {
      st.upload = { file: null, gen: st.upload.gen + 1, busy: false, error: null, dragging: false, done: true, chooseTab: null };
      // Newer than any answer still on its way.
      Object.assign(st, { saved: out, loaded: true, loadError: null, loadGen: st.loadGen + 1 });
    });
  } catch (err) {
    ctx.update((st) => {
      // A tab that cannot be read leaves the tabs showing, to choose another; anything else lets the file go.
      if (tab !== null) Object.assign(st.upload, { busy: false, error: err.message });
      else Object.assign(st.upload, { file: null, gen: st.upload.gen + 1, busy: false, error: err.message, chooseTab: null });
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

function enter(ctx) {
  return loadSaved(ctx);
}

/** A fresh session: what was on its way is left, and the screen loads again when it shows. */
function reset(ctx) {
  ctx.update((st) => {
    st.upload = { ...initial().upload, gen: st.upload.gen + 1 };
    st.loadGen += 1;
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
 * The upload area. With no file in yet: one clear area where the file is
 * chosen. Once a file is in: one slim line with its name, its tab, how many
 * rows it has, and "Replace file". Whatever stops an upload is said right
 * under it, and so are the tabs to choose from.
 */
function uploadCard(ctx) {
  const { h, words, state } = ctx;
  const up = state.upload;
  const s = state.saved?.sheet ?? null;
  const name = up.file?.name || 'the file';
  // Choosing a file uploads it; the input is made again after each file, so the same file can be chosen again.
  const input = h('input', { key: `fk-file-${up.gen}`, id: 'fk-file', class: 'fk-file-input', type: 'file', accept: SHEET_ACCEPT, 'data-id': 'sheet-file', onchange: (e) => uploadFile(ctx, e.target.files?.[0] ?? null) });
  const asking = Boolean(up.chooseTab && up.file);
  const cancel = asking && !up.busy
    ? h('button', { type: 'button', class: 'btn btn-quiet', key: 'cancel', 'data-id': 'cancel-file', onclick: () => ctx.update((st) => Object.assign(st.upload, { file: null, gen: st.upload.gen + 1, error: null, chooseTab: null })) }, 'Cancel')
    : null;
  const doing = up.busy ? `Uploading "${name}"…` : up.dragging ? 'Drop the file anywhere on this page to upload it.' : null;
  const below = [
    words.notice(h, 'error', up.error),
    asking
      ? h(
          'div',
          { class: 'fk-choose-tab', key: 'choose-tab', 'data-id': 'choose-tab' },
          words.notice(h, 'warn', up.chooseTab.says),
          h('div', { class: 'actions' }, up.chooseTab.tabs.map((t, i) => h('button', { type: 'button', class: 'btn', key: `tab-${i}`, disabled: up.busy, onclick: () => sendFile(ctx, t), 'data-id': `tab-${i}` }, t))),
        )
      : null,
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
            : h('p', { class: 'fk-slim-text', key: 'in', 'data-id': 'sheet-line' }, h('strong', null, s.fileName || 'The file'), h('span', { class: 'fk-slim-sub' }, `${where}: ${words.plural(Number(s.rowCount) || 0, 'row')}.`)),
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
            : [h('p', { class: 'fk-drop-name', key: 'none' }, 'Upload the Flipkart file: drop it anywhere on this page, or choose it'), h('p', { class: 'fk-drop-sub', key: 'sub' }, 'An .xlsx or .csv file, up to 50 megabytes. The tab named "Flipkart" is read, or the file\'s only tab. Nothing is checked yet.')],
      ),
      h('div', { class: 'fk-drop-actions' }, input, h('label', { for: 'fk-file', class: 'btn btn-primary', 'data-id': 'choose-file' }, icon(h, 'file'), 'Choose file'), cancel),
    ),
    below,
  );
}

/** One cell as it is in the file: its words, each link as "Link" opening in a new tab, and "Picture in the file" for a picture. */
function cellView(ctx, c) {
  const { h, words } = ctx;
  const parts = arr(c?.parts).map((p, i) => {
    if (typeof p?.link !== 'string') return String(p?.text ?? '');
    const url = words.safeUrl(p.link);
    return url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', key: `l${i}` }, 'Link') : p.link;
  });
  if (!c?.picture) return parts;
  return [parts, parts.length ? ' ' : null, h('span', { class: 'fk-picture', key: 'picture' }, icon(h, 'image'), 'Picture in the file')];
}

/** Every row of the kept file with every column as it is in the file, numbered from 1. */
function rowsCard(ctx) {
  const { h, words, state } = ctx;
  const headers = arr(state.saved?.headers);
  const rows = arr(state.saved?.rows);
  const csv = state.saved?.sheet?.kind === 'csv';
  return h(
    'section',
    { class: 'card fk-rows-card', key: 'rows', 'data-id': 'rows' },
    h('div', { class: 'fk-rows-head' }, h('h2', null, 'Rows'), h('span', { class: 'fk-rows-count', 'data-id': 'rows-count' }, words.plural(rows.length, 'row'))),
    rows.length
      ? h(
          'div',
          { class: 'table-wrap fk-rows-wrap' },
          h(
            'table',
            { class: 'fk-rows-table', 'data-id': 'rows-table' },
            h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Row'), headers.map((t, i) => h('th', { scope: 'col', key: `h${i}` }, String(t))))),
            h('tbody', null, rows.map((r) => h('tr', { key: `r${r.n}`, 'data-id': `row-${r.n}` }, h('td', { class: 'fk-row-cell nowrap' }, String(r.n)), arr(r.cells).map((c, i) => h('td', { key: `c${i}` }, cellView(ctx, c)))))),
          ),
        )
      : h('p', { class: 'muted fk-rows-empty', 'data-id': 'no-rows' }, `This ${csv ? 'file' : 'tab'} has column names but no rows under them.`),
  );
}

function renderScreen(ctx) {
  const { h, words, state } = ctx;
  if (!state.loaded) return h('p', { class: 'muted', key: 'opening', role: 'status', 'data-id': 'opening' }, 'Opening the Flipkart rows…');
  return [uploadCard(ctx), words.notice(h, 'error', state.loadError), state.saved?.sheet ? rowsCard(ctx) : null];
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
