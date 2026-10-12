// The Flipkart screen. The top bar holds the marketplace tabs (bar() below),
// with Flipkart chosen and Amazon one press away. The page: the upload area,
// which looks like the Amazon one ("Choose file", or drop the file anywhere
// on the page: app.js passes it on), for an .xlsx or a .csv file. Once a file
// is in, one slim line says its name, the tab read and how many rows it has,
// with "Replace file", and a table shows every row with every column as it is
// in the file, numbered from 1. A link shows as "Link" and opens in a new tab;
// a picture in a cell shows as "Picture in the file". Under the upload area,
// the Campaigns box, the same as the Amazon one: each campaign's name, live or
// ended, and brand, and under each of its Flipkart products what was read from
// Flipkart (its name, its brand, its other colours and sizes, and when), or
// why it is not used. Nothing is checked yet, and there are no Amazon or
// Google login lines. The local server reads and keeps the file and the
// campaigns; this screen only shows them.

const BASE = '/local/flipkart';
/** How often the screen looks again while a campaign's products are read from Flipkart. */
const READING_POLL_MS = 2000;

/** The kinds of file the file chooser offers: Excel files (.xlsx) and CSV files. */
export const SHEET_ACCEPT = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

const arr = (v) => (Array.isArray(v) ? v : []);
const icon = (h, name, extra = '') => h('span', { class: `icon icon-${name}${extra ? ` ${extra}` : ''}`, 'aria-hidden': 'true' });
const pill = (h, text, tone) => h('span', { class: `pill pill-${tone}` }, text);
const blankCampaign = () => ({ brand: '', name: '', live: true, products: '' });

function initial() {
  return {
    saved: null, // the kept file as the server shows it: { sheet, headers, rows }
    loaded: false,
    loadError: null,
    loadGen: 0,
    upload: { file: null, gen: 0, busy: false, error: null, dragging: false, done: false, chooseTab: null },
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
  return [uploadCard(ctx), words.notice(h, 'error', state.loadError), campaignsCard(ctx), state.saved?.sheet ? rowsCard(ctx) : null];
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
