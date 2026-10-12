// A Flipkart row's check (flipkart/check.js), with a pretend screenshots.js:
// its steps are the Amazon check's, in the same order, changed for Flipkart;
// only the steps that get the screenshots run now, every other step comes in
// a later step, and the row gets no Status. A screenshot that cannot be had
// says why in the Amazon words; a pause stops the check at its step. Made-up
// rows only; nothing is downloaded.
// Run: node test/flipkart-check.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck, STEP_NAMES, PAUSE_SAYS, newCheckId } from '../flipkart/check.js';
import { CHECK_ID } from '../flipkart/store.js';
import { STEP_NAMES as SCREEN_STEPS } from '../views/flipkart.js';
import { STEP_NAMES as AMAZON_STEPS, PAUSE_SAYS as AMAZON_PAUSE_SAYS } from '../amazon/check.js';

const drive = (id) => `https://drive.google.com/open?id=${id}`;
const cell = (over = {}) => ({ text: '', link: '', links: [], mismatch: null, picture: null, ...over });
const ROW = {
  id: 'r00000000000a',
  row: 2,
  n: 1,
  shots: { order: cell({ links: [drive('1TestOrder01')] }), delivery: cell({ links: [drive('1TestDelivery01')] }), review: cell({ links: ['https://www.flipkart.com/reviews/TESTPID0000001:1'] }), reviewShot: cell({ links: [drive('1TestReview01')] }) },
};

/** A pretend screenshots.js: what each cell gives (a picture, unless said otherwise), and the cells asked for. */
function pretend(answers) {
  const asked = [];
  return {
    asked,
    async forCell(rowId, which) {
      asked.push(which);
      const a = answers[which] ?? { files: ['/made-up/picture.png'], problems: [] };
      if (a instanceof Error) throw a;
      return { files: [], problems: [], types: [], records: [], ...a };
    },
  };
}

async function run(row, answers, opts = {}) {
  const events = [];
  const screenshots = pretend(answers);
  const result = await runCheck({ row, screenshots, emit: (e) => events.push(e), ...opts });
  return { result, events, asked: screenshots.asked };
}

test("a check's steps are the Amazon check's, in the same order, changed for Flipkart: the screenshot steps run, each shown as it runs; every other step comes in a later step; the row gets no Status", async () => {
  assert.deepEqual(STEP_NAMES, SCREEN_STEPS, 'the screen names them the same');
  assert.deepEqual([STEP_NAMES[0], STEP_NAMES[1], STEP_NAMES[2], STEP_NAMES[3], STEP_NAMES[8]], [AMAZON_STEPS[1], AMAZON_STEPS[2], AMAZON_STEPS[3], AMAZON_STEPS[4], AMAZON_STEPS[9]], "the screenshots' steps and the last one in the Amazon words");
  const { result, events, asked } = await run(ROW, {});
  assert.deepEqual(asked, ['order', 'delivery', 'reviewShot']);
  assert.deepEqual(result.steps.map((s) => [s.state, s.detail]), [['pass', 'Opened the purchase screenshot.'], ['later', null], ['pass', 'Opened the delivery screenshot.'], ['later', null], ['pass', 'Opened the review screenshot.'], ['later', null], ['later', null], ['later', null], ['later', null]]);
  const said = (e) => (e.event === 'step' ? `step ${e.step.n} ${e.step.state}` : e.event === 'action' ? `action ${e.says}` : e.event);
  assert.deepEqual(events.map(said), ['started', 'step 1 running', 'action Opening the purchase screenshot', 'step 1 pass', 'step 2 later', 'step 3 running', 'action Opening the delivery screenshot', 'step 3 pass', 'step 4 later', 'step 5 running', 'action Opening the review screenshot', 'step 5 pass', 'step 6 later', 'step 7 later', 'step 8 later', 'step 9 later', 'action Done. The other steps come in a later step, so this row has no Status yet.', 'done']);
  assert.deepEqual([result.paused, result.stopped, 'status' in result, 'type' in result, 'note' in result], [null, false, false, false, false], 'no Status, Type or Note');
  assert.match(result.checkId, CHECK_ID);
  assert.match(newCheckId(new Date('2026-10-12T12:30:00Z')), /^c20261012123000[0-9a-f]{6}$/);
  assert.equal((await run(ROW, { order: { files: ['/made-up/a.png', '/made-up/b.png'], problems: [] } })).result.steps[0].detail, 'Opened 2 purchase screenshots.');
});

test("a screenshot that cannot be had says why, in the Amazon words; an empty cell, words instead of a screenshot and a missing column are said too; the review link's picture is opened when the review screenshot cell has none", async () => {
  const { result } = await run(ROW, {
    order: { files: [], problems: [{ link: drive('1TestOrder01'), kind: 'drive', site: 'Google Drive', says: 'the Google account logged in to the dashboard has no access to the file', noAccess: true }] },
    delivery: { files: [], problems: [{ link: 'https://pictures.example.com/x.png', kind: 'allowed', site: 'pictures.example.com', says: "the website is not on the dashboard's list of picture websites" }] },
    reviewShot: { files: [], problems: [{ link: drive('1TestReview01'), kind: 'busy', site: 'Google Drive', says: 'Google Drive did not answer, so it could not be downloaded' }] },
  });
  assert.deepEqual(
    [0, 2, 4].map((i) => [result.steps[i].state, result.steps[i].detail]),
    [
      ['fail', 'The purchase screenshot is on Google Drive, but the Google account logged in to the dashboard has no access to the file.'],
      ['fail', "The delivery screenshot is on pictures.example.com, but the website is not on the dashboard's list of picture websites."],
      ['fail', 'The review screenshot is on Google Drive, but Google Drive did not answer, so it could not be downloaded.'],
    ],
  );
  const odd = { ...ROW, shots: { order: cell(), delivery: cell({ text: 'Sent on WhatsApp. See chat' }), review: cell({ links: [drive('1TestReviewPicture01')] }), reviewShot: cell() } };
  const said = await run(odd, {});
  assert.deepEqual(said.asked, ['review'], "only a cell with a picture is opened: the review link's, since the review screenshot cell has none");
  assert.deepEqual([0, 2, 4].map((i) => said.result.steps[i].detail), ['The cell is empty.', 'The cell says "Sent on WhatsApp; See chat" instead of holding a screenshot.', 'Opened the review screenshot.']);
  const noColumn = await run(ROW, {}, { has: { deliveryShot: false } });
  assert.deepEqual([noColumn.result.steps[2].detail, noColumn.asked], ['The file has no delivery screenshot column.', ['order', 'reviewShot']]);
  const broke = await run(ROW, { delivery: new Error('made-up') });
  assert.deepEqual([broke.result.steps[2].state, broke.result.steps[2].detail, broke.result.steps[4].state], ['fail', 'Something went wrong on this computer while opening the delivery screenshot. Check this row again.', 'pass'], 'that step says so, and the others still run');
});

test("no one logged in to Google, a login using the Live Amazon Browser, or Google's login page pauses the check at its step, saying why; nothing more is opened, and the row can be checked again; Stop stops it", async () => {
  assert.deepEqual(PAUSE_SAYS, Object.fromEntries(Object.entries(AMAZON_PAUSE_SAYS).filter(([k]) => k.startsWith('google-'))), "the Amazon checker's words");
  const out = await run(ROW, { delivery: { pause: 'google-out' } });
  assert.deepEqual(out.asked, ['order', 'delivery'], 'nothing more is opened');
  assert.deepEqual(out.result.paused, { kind: 'google-out', says: PAUSE_SAYS['google-out'], step: 3 });
  assert.deepEqual([out.result.steps[2].state, out.result.steps[2].detail], ['fail', 'No one is logged in to Google, so the screenshots on Google Drive cannot be downloaded. The check paused here, before the delivery screenshot was downloaded; nothing was got around.']);
  assert.deepEqual(out.result.steps.slice(3).map((s) => s.state), ['waiting', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting']);
  assert.deepEqual(out.events.slice(-2).map((e) => e.says ?? e.event), [`Paused: ${PAUSE_SAYS['google-out']}`, 'done']);
  const waiting = 'The Google login is being checked, so the Google Drive screenshots were not downloaded yet. Wait a moment, then try again.';
  const busy = await run(ROW, { order: { pause: 'login-busy', says: waiting } });
  assert.deepEqual([busy.result.paused.kind, busy.result.paused.says, busy.result.steps[0].detail], ['login-busy', waiting, 'The Google login is being checked, so the Google Drive screenshots were not downloaded yet. The check paused here, before the purchase screenshot was downloaded; nothing was got around.']);
  const signin = await run(ROW, { reviewShot: { pause: 'google-signin' } });
  assert.deepEqual([signin.result.paused.kind, signin.result.steps[4].detail], ['google-signin', 'Google asked to log in, so the screenshots on Google Drive cannot be downloaded. The check paused here, before the review screenshot was downloaded; nothing was got around.']);
  const stop = new AbortController();
  stop.abort();
  const stopped = await run(ROW, {}, { signal: stop.signal });
  assert.deepEqual([stopped.result.stopped, stopped.asked, stopped.result.steps.filter((s) => s.state !== 'waiting')], [true, [], []]);
});
