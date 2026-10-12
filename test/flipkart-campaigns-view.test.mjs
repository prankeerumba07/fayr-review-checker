// The Flipkart screen's Campaigns box, drawn the way app.js draws it, with a
// fake ctx and a fake client shaped like the local server's answers: each
// campaign with its Campaign ID, name, live or ended, and under each product
// what was read from Flipkart and when, or why it could not be read; adding,
// changing, ending, deleting and reading again; and following the reading
// every 2 seconds. No browser, no server and no website. Made-up campaigns
// only.
// Run: node test/flipkart-campaigns-view.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { h, textOf, findAll, byId } from '../lib/vdom.js';
import { ApiError } from '../lib/api.js';
import * as words from '../lib/words.js';
import flipkart from '../views/flipkart.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};
const classesOf = (tree) => findAll(tree, () => true).flatMap((n) => String(n.attrs?.class ?? '').split(/\s+/)).filter(Boolean);
const tagged = (tree, tag) => findAll(tree, (n) => n.tag === tag);
const withClass = (tree, cls) => findAll(tree, (n) => new RegExp(`\\b${cls}\\b`).test(n.attrs?.class ?? ''));

const KA = 'f0000000000a1';
const KB = 'f0000000000b2';
const GLOW = 'https://www.flipkart.com/test-glow-face-mask/p/itmtestglow0001?pid=FCPTESTGLOW00001';
const GLOW_REVIEWS = 'https://www.flipkart.com/test-glow-face-mask/product-reviews/itmtestglow0001?pid=FCPTESTGLOW00001&marketplace=FLIPKART';
const JAR = 'https://www.flipkart.com/test-jar/p/itmtestjar00001?pid=FCPTESTJAR000001';
const AT = '2026-10-12T05:00:00.000Z';
const PREVENTED = 'Flipkart prevented this check: it showed a robot check, which this dashboard never answers. This product was not read; press "Read the products again" later.';
const ADD_LINK = "No Flipkart product page opened from this product ID. Add this product's link instead.";
const NOTHING_READ = { name: null, brand: null, pid: null, itemId: null, rating: null, ratings: null, reviews: null, allReviews: null };
const product = (given, state, extra = {}) => ({ given, state, ...NOTHING_READ, at: null, says: null, prevented: false, ...extra });

/** Two campaigns as the server shows them: one live (read, stopped by a robot check, not read yet), one ended (a product ID that opened nothing, a product with no ratings). */
const CAMPAIGNS = [
  {
    key: KA,
    campaignId: 'FK-TEST-1',
    name: 'Test Glow',
    live: true,
    updatedAt: AT,
    products: [
      product(GLOW, 'read', { name: 'Test Glow Face Mask', brand: 'Test Glow', pid: 'FCPTESTGLOW00001', itemId: 'itmtestglow0001', rating: 4.1, ratings: 1355, reviews: 47, allReviews: GLOW_REVIEWS, at: AT }),
      product('FCPTESTCLAY00001', 'stopped', { at: AT, says: PREVENTED, prevented: true }),
      product(JAR, 'waiting'),
    ],
  },
  {
    key: KB,
    campaignId: 'FK-TEST-0',
    name: '',
    live: false,
    updatedAt: AT,
    products: [product('FCPTESTMISS00001', 'not read', { at: AT, says: ADD_LINK }), product('FCPTESTJAR000002', 'read', { name: 'Test Jar', pid: 'FCPTESTJAR000002', itemId: 'itmtestjar00002', at: AT })],
  },
];

/** A client like lib/api.js, answering as the local server does: the campaigns (list), whether products are being read (reading), and every request made, with its body. */
function fakeLocal() {
  const calls = [];
  const local = {
    calls,
    list: structuredClone(CAMPAIGNS),
    reading: false,
    save: null, // a refusal to give to the next Save, when set
    look: null, // what the campaigns' answer does instead, when set: a refusal, or an answer that never comes
    api: async (method, path, body) => {
      calls.push({ method, path, body });
      if (method === 'GET' && path === '/local/flipkart/sheet') return { sheet: null, headers: [], rows: [] };
      if (method === 'GET' && path === '/local/flipkart/campaigns') {
        if (local.look) return local.look();
        return structuredClone({ campaigns: local.list, reading: local.reading });
      }
      if (method === 'POST' && /^\/local\/flipkart\/campaigns(\/f[0-9a-f]{12})?$/.test(path)) {
        if (local.save) throw local.save;
        const key = path.split('/')[4] ?? 'f0000000000c3';
        const campaign = { key, campaignId: body.campaignId, name: body.name, live: body.live, updatedAt: AT, products: body.products.split('\n').map((given) => product(given, 'waiting')) };
        local.list = [...local.list.filter((c) => c.key !== key), campaign];
        local.reading = true;
        return structuredClone({ campaign, campaigns: local.list, reading: true });
      }
      const m = method === 'POST' ? path.match(/^\/local\/flipkart\/campaigns\/(f[0-9a-f]{12})\/(end|delete|read)$/) : null;
      if (m) {
        const [, key, action] = m;
        if (action === 'end') local.list = local.list.map((c) => (c.key === key ? { ...c, live: false } : c));
        if (action === 'delete') local.list = local.list.filter((c) => c.key !== key);
        if (action === 'read') {
          local.list = local.list.map((c) => (c.key === key ? { ...c, products: c.products.map((p) => (p.state === 'read' ? p : product(p.given, 'waiting'))) } : c));
          local.reading = true;
        }
        return structuredClone({ campaigns: local.list, reading: local.reading });
      }
      throw new ApiError(404, 'Not found.');
    },
    form: async () => {
      throw new ApiError(404, 'Not found.');
    },
  };
  return local;
}

/** A screen with a ctx like app.js's: it keeps what it was asked to confirm, and every timer it was given. */
function screen(local) {
  const state = flipkart.initial();
  const timers = [];
  const asked = [];
  const ctx = {
    h,
    words,
    state,
    route: '',
    local,
    go: () => {},
    update(change) {
      if (typeof change === 'function') change(state);
      else if (change && typeof change === 'object') Object.assign(state, change);
    },
    confirm: (text) => (asked.push(text), true),
    download: () => {},
    every: (ms, fn) => {
      const t = { ms, fn, stopped: false };
      timers.push(t);
      return () => (t.stopped = true);
    },
    reveal: () => {},
  };
  const page = () => flipkart.render(ctx);
  return { ctx, state, timers, asked, local, page, box: () => byId(page(), 'campaigns'), click: async (id) => (byId(page(), id).attrs.onclick({ stopPropagation() {} }), settle()) };
}

async function opened(local = fakeLocal()) {
  const s = screen(local);
  flipkart.enter(s.ctx);
  await settle();
  return s;
}

const goodNotice = (s) => textOf(withClass(s.box(), 'notice-good')[0] ?? null);

test('the Campaigns box: each campaign with its Campaign ID, name, live or ended, and under each product what was read from Flipkart and when, or why it could not be read', async () => {
  const s = await opened();
  assert.deepEqual(s.page().filter(Boolean).map((n) => n.attrs['data-id']), ['sheet', 'campaigns'], 'under the upload area');
  const box = s.box();
  assert.deepEqual([box.tag, box.attrs.open], ['details', false], 'shut to start with, once there are campaigns');
  assert.equal(textOf(tagged(box, 'summary')[0]), 'Campaigns1 live, 1 ended');
  const a = byId(box, `campaign-${KA}`);
  assert.equal(textOf(tagged(a, 'h3')[0]), 'FK-TEST-1 Live Name: Test Glow');
  assert.deepEqual(tagged(a, 'li').map(textOf), [
    `${GLOW}Test Glow Face Mask Brand: Test Glow. Product ID: FCPTESTGLOW00001. Item ID: itmtestglow0001. 4.1 stars from 1,355 ratings and 47 reviews. All reviews Read on 12-10-2026 at 10:30.`,
    `FCPTESTCLAY00001${PREVENTED} Tried on 12-10-2026 at 10:30.`,
    `${JAR}Not read from Flipkart yet.`,
  ]);
  const all = byId(a, `all-reviews-${KA}-0`);
  assert.deepEqual([all.tag, textOf(all), all.attrs.href, all.attrs.target, all.attrs.rel], ['a', 'All reviews', GLOW_REVIEWS, '_blank', 'noopener noreferrer'], 'the link to all its reviews opens in a new tab');
  assert.deepEqual(withClass(a, 'notice-warn').map(textOf), ['Flipkart prevented this check, so the reading stopped. The products not read yet were left as they are; press "Read the products again" when you are ready.']);
  assert.deepEqual(tagged(a, 'button').map(textOf), ['Change', 'End campaign', 'Read the products again', 'Delete']);
  const b = byId(box, `campaign-${KB}`);
  assert.match(b.attrs.class, /\bfk-campaign-ended\b/);
  assert.equal(textOf(tagged(b, 'h3')[0]), 'FK-TEST-0 Ended', 'no name, none shown');
  assert.deepEqual(tagged(b, 'li').map(textOf), [`FCPTESTMISS00001${ADD_LINK} Tried on 12-10-2026 at 10:30.`, 'FCPTESTJAR000002Test Jar Brand: not shown. Product ID: FCPTESTJAR000002. Item ID: itmtestjar00002. No ratings or reviews shown. No link to all reviews. Read on 12-10-2026 at 10:30.']);
  assert.deepEqual(tagged(b, 'button').map(textOf), ['Change', 'Read the products again', 'Delete'], 'an ended campaign is not ended again');
  assert.doesNotMatch(textOf(s.page()), /log ?in|Google|account|captcha|—/i, 'no login lines, and plain words');
});

test('adding a campaign: a Campaign ID (required), a name (optional), live or ended, and products one per line; a refusal keeps the form; Change fills the form with the campaign', async () => {
  const s = await opened();
  await s.click('add-campaign');
  const form = byId(s.page(), 'campaign-form');
  assert.equal(s.box().attrs.open, true, 'the box opens while a campaign is added');
  assert.equal(textOf(tagged(form, 'h3')[0]), 'Add a campaign');
  assert.deepEqual(tagged(form, 'label').map(textOf), ['Campaign ID (required)', 'Campaign name (optional)', 'Live or ended', 'Products']);
  assert.deepEqual(tagged(byId(form, 'campaign-live'), 'option').map(textOf), ['Live', 'Ended']);
  assert.equal(byId(form, 'campaign-products').attrs.placeholder, 'One Flipkart link or product ID on each line');
  byId(s.page(), 'campaign-id').attrs.oninput({ target: { value: 'FK-TEST-2' } });
  byId(s.page(), 'campaign-name').attrs.oninput({ target: { value: 'Test Clay' } });
  byId(s.page(), 'campaign-live').attrs.onchange({ target: { value: 'ended' } });
  byId(s.page(), 'campaign-products').attrs.oninput({ target: { value: `${GLOW}\nFCPTESTCLAY00001` } });
  await s.click('save-campaign');
  const post = s.local.calls.find((c) => c.method === 'POST');
  assert.deepEqual([post.path, post.body], ['/local/flipkart/campaigns', { campaignId: 'FK-TEST-2', name: 'Test Clay', live: false, products: `${GLOW}\nFCPTESTCLAY00001` }]);
  assert.equal(byId(s.page(), 'campaign-form'), null, 'the form closes');
  assert.equal(goodNotice(s), 'The campaign was saved. Its products are being read from Flipkart in the Live Flipkart Browser, one page at a time.');
  assert.equal(textOf(tagged(s.box(), 'summary')[0]), 'Campaigns1 live, 2 ended, reading products from Flipkart…');
  // The server refuses: the form stays, with what was typed, and says why.
  const r = await opened();
  r.local.save = new ApiError(400, 'Write the Campaign ID.');
  await r.click('add-campaign');
  byId(r.page(), 'campaign-products').attrs.oninput({ target: { value: GLOW } });
  await r.click('save-campaign');
  assert.deepEqual(withClass(r.box(), 'notice-error').map(textOf), ['Write the Campaign ID.']);
  assert.equal(byId(r.page(), 'campaign-products').attrs.value, GLOW);
  // Change: the form, filled with the campaign as it is; Save sends it to that campaign.
  r.local.save = null;
  await r.click('cancel-campaign');
  await r.click(`change-${KA}`);
  const change = byId(r.page(), 'campaign-form');
  assert.equal(textOf(tagged(change, 'h3')[0]), 'Change the campaign');
  assert.deepEqual([byId(change, 'campaign-id').attrs.value, byId(change, 'campaign-name').attrs.value, byId(change, 'campaign-live').attrs.value, byId(change, 'campaign-products').attrs.value], ['FK-TEST-1', 'Test Glow', 'live', [GLOW, 'FCPTESTCLAY00001', JAR].join('\n')]);
  await r.click('save-campaign');
  assert.equal(r.local.calls.filter((c) => c.method === 'POST').at(-1).path, `/local/flipkart/campaigns/${KA}`);
});

test('a campaign ended, deleted (asked first) or its products read again; while products are read, the box looks again every 2 seconds, its buttons wait, and Save waits', async () => {
  const s = await opened();
  assert.deepEqual(s.timers.map((t) => t.ms), [2000]);
  const looks = () => s.local.calls.filter((c) => c.method === 'GET' && c.path === '/local/flipkart/campaigns').length;
  const first = looks();
  s.timers[0].fn();
  await settle();
  assert.equal(looks(), first, 'nothing is being read: the server is not asked again');
  await s.click(`end-${KA}`);
  assert.deepEqual(s.local.calls.at(-1), { method: 'POST', path: `/local/flipkart/campaigns/${KA}/end`, body: {} });
  assert.equal(goodNotice(s), 'The campaign "FK-TEST-1" has ended.');
  s.ctx.confirm = (text) => (s.asked.push(text), false);
  await s.click(`delete-${KA}`);
  assert.deepEqual(s.asked, ['Delete the campaign "FK-TEST-1"? This cannot be undone.']);
  assert.equal(s.local.calls.some((c) => c.path.endsWith('/delete')), false, 'not deleted when the answer is no');
  s.ctx.confirm = () => true;
  await s.click(`delete-${KA}`);
  assert.equal(s.local.calls.at(-1).path, `/local/flipkart/campaigns/${KA}/delete`);
  assert.equal(goodNotice(s), 'The campaign "FK-TEST-1" was deleted.');
  assert.equal(byId(s.box(), `campaign-${KA}`), null);
  // Read again: the box follows the reading every 2 seconds until it ends.
  await s.click(`read-${KB}`);
  assert.equal(goodNotice(s), 'The products of "FK-TEST-0" are being read from Flipkart again.');
  assert.equal(textOf(tagged(s.box(), 'summary')[0]), 'Campaigns1 ended, reading products from Flipkart…');
  assert.equal(byId(s.box(), `change-${KB}`).attrs.disabled, true, "a campaign's buttons wait while products are read");
  await s.click('add-campaign');
  assert.equal(byId(s.page(), 'save-campaign').attrs.disabled, true);
  assert.equal(textOf(byId(s.page(), 'save-waits')), 'Save can be pressed once the products are read.');
  const reading = looks();
  s.timers[0].fn();
  await settle();
  assert.equal(looks(), reading + 1, 'asked again while products are read');
  s.local.reading = false;
  s.local.list = s.local.list.map((c) => ({ ...c, products: c.products.map((p) => ({ ...p, state: 'read', name: 'Test Jar', at: AT })) }));
  s.timers[0].fn();
  await settle();
  assert.equal(looks(), reading + 2, 'and once more when it ends');
  assert.equal(byId(s.page(), 'save-campaign').attrs.disabled, false, 'Save can be pressed again');
  s.timers[0].fn();
  await settle();
  assert.equal(looks(), reading + 2, 'then no more');
  // A fresh session stops the timer; showing the screen again starts one.
  flipkart.reset(s.ctx);
  assert.deepEqual([s.timers[0].stopped, s.state.poll], [true, null]);
  flipkart.enter(s.ctx);
  await settle();
  assert.deepEqual(s.timers.map((t) => t.stopped), [true, false]);
  flipkart.enter(s.ctx);
  assert.equal(s.timers.length, 2, 'one timer, however often the screen shows');
});

test('the box while the campaigns are on their way, when they cannot be had, and after the first campaign is saved: it says so, asks again, and stays open to show the reading', async () => {
  const waiting = fakeLocal();
  waiting.look = () => new Promise(() => {});
  const w = await opened(waiting);
  assert.deepEqual([textOf(tagged(w.box(), 'summary')[0]), w.box().attrs.open, textOf(byId(w.box(), 'campaigns-opening')), byId(w.box(), 'add-campaign').attrs.disabled], ['CampaignsOpening…', false, 'Opening the campaigns…', true], 'never "None yet" before the answer');
  const failing = fakeLocal();
  failing.look = async () => {
    throw new ApiError(500, 'Something went wrong on this computer.');
  };
  const f = await opened(failing);
  assert.deepEqual([textOf(tagged(f.box(), 'summary')[0]), f.box().attrs.open], ['CampaignsCould not be opened', true]);
  assert.deepEqual(withClass(f.box(), 'notice-error').map(textOf), ['The campaigns could not be opened: Something went wrong on this computer. The dashboard asks again every 2 seconds.']);
  failing.look = null;
  f.timers[0].fn();
  await settle();
  assert.deepEqual(tagged(f.box(), 'h3').map(textOf), ['FK-TEST-1 Live Name: Test Glow', 'FK-TEST-0 Ended'], 'asked again, and shown');
  // The first campaign: the box stays open after Save, and its "being read" notice goes when the reading ends.
  const empty = fakeLocal();
  empty.list = [];
  const s = await opened(empty);
  await s.click('add-campaign');
  byId(s.page(), 'campaign-id').attrs.oninput({ target: { value: 'FK-TEST-3' } });
  byId(s.page(), 'campaign-products').attrs.oninput({ target: { value: GLOW } });
  await s.click('save-campaign');
  assert.equal(s.box().attrs.open, true, 'still open');
  assert.equal(goodNotice(s), 'The campaign was saved. Its products are being read from Flipkart in the Live Flipkart Browser, one page at a time.');
  empty.reading = false;
  empty.list = empty.list.map((c) => ({ ...c, products: c.products.map((p) => ({ ...p, state: 'read', name: 'Test Glow Face Mask', at: AT })) }));
  s.timers[0].fn();
  await settle();
  assert.deepEqual([goodNotice(s), s.box().attrs.open], ['', true], 'the notice went; each product says how it went');
  assert.match(textOf(byId(s.box(), 'product-f0000000000c3-0')), /Test Glow Face Mask Brand: not shown\./);
});

test("the Campaigns box's look: the shared one and its own fk- names, never the Amazon screen's", async () => {
  const css = readFileSync(join(ROOT, 'views', 'flipkart.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const shared = readFileSync(join(ROOT, 'styles.css'), 'utf8');
  const used = new Set();
  const add = (tree) => classesOf(tree).forEach((c) => used.add(c));
  const s = await opened();
  s.box().attrs.ontoggle({ target: { open: true } });
  add(s.page());
  await s.click('add-campaign');
  add(s.page());
  s.local.save = new ApiError(400, 'Write the Campaign ID.');
  await s.click('save-campaign');
  add(s.page());
  s.local.save = null;
  await s.click('save-campaign');
  add(s.page());
  const empty = fakeLocal();
  empty.list = [];
  const none = await opened(empty);
  assert.equal(textOf(byId(none.page(), 'no-campaigns')), 'No campaigns yet.');
  assert.equal(none.box().attrs.open, true, 'open to start with while there is no campaign');
  add(none.page());
  for (const cls of used) {
    const from = cls.startsWith('fk-') ? css : shared;
    assert.match(from, new RegExp(`\\.${cls}\\b`), `${cls}: from ${cls.startsWith('fk-') ? 'views/flipkart.css' : 'styles.css'}`);
  }
  for (const cls of ['fk-fold', 'fk-fold-head', 'fk-campaigns', 'fk-campaign', 'fk-campaign-ended', 'fk-campaign-name', 'fk-campaign-products', 'fk-typed', 'fk-campaign-form', 'fk-form-grid', 'fk-form-field', 'fk-wide', 'fk-req', 'fk-opt', 'fk-note', 'pill-good', 'pill-quiet', 'tone-bad', 'notice-warn', 'notice-good', 'notice-error', 'btn-danger']) assert.ok(used.has(cls), `${cls} is drawn`);
});
