// A Flipkart row's check, in steps a person can watch, the way the Amazon
// checker checks a row (amazon/check.js), copied and changed for Flipkart.
// Its steps are the Amazon check's, in the same order, changed to the Flipkart
// way of checking (FLIPKART-PLAN.md point 8): the purchase screenshot, the
// delivery screenshot, the review screenshot (the main proof on Flipkart,
// where many rows have no review link), finding the review among Flipkart's
// public reviews, comparing the reviewer's name and the review's words, and
// the Status, Type and Note. For now only the steps that get the screenshots
// run (screenshots.js): each one's pictures are downloaded, or kept with the
// reason they could not be had, said in the Amazon checker's words. Every
// other step says it comes in a later step, and the row gets no Status: it
// stays "Not checked yet". No one logged in to Google, a login using the Live
// Amazon Browser, Google's login page, a robot check or a block pauses the
// check, as on Amazon: the row gets no result, nothing is got around, and the
// row can be checked again later.

import { randomBytes } from 'node:crypto';
import { downloadable } from './screenshots.js';

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
/** The steps that run now, with the cell whose screenshots each one opens; every other step comes in a later step. */
const OPENS = { 1: 'order', 3: 'delivery', 5: 'reviewShot' };
/** What each step was doing, for "Something went wrong on this computer while …". */
const STEP_DOING = ['opening the purchase screenshot', 'reading the purchase screenshot', 'opening the delivery screenshot', 'reading the delivery screenshot', 'opening the review screenshot', 'reading the review screenshot', "finding the review among Flipkart's public reviews", "comparing the reviewer's name and the review's words", 'writing the Status, Type and Note'];
/** The Amazon checker's words for a check paused by a download (amazon/check.js): the screenshots on Google Drive are downloaded through the same Google login. */
export const PAUSE_SAYS = {
  'google-out': 'No one is logged in to Google, so the screenshots on Google Drive cannot be downloaded. Press "Log in to Google" in the top bar and log in there, then press "Carry on checking".',
  'google-signin': 'Google asked to log in, so the screenshots on Google Drive cannot be downloaded. Press "Log in to Google" in the top bar and log in there, then press "Carry on checking".',
  'google-robot': 'Google showed a robot check while a screenshot was being downloaded. This dashboard never answers a robot check. Press "Carry on checking" when you are ready.',
  'google-blocked': 'Google Drive refused to give a screenshot just now. Wait a while, then press "Carry on checking".',
};
const WHAT = { order: 'purchase screenshot', delivery: 'delivery screenshot', review: 'review screenshot', reviewShot: 'review screenshot' };
/** Each cell's column, as the file's columns are named (workbook.js). */
const SHOT_COLUMN = { order: 'orderShot', delivery: 'deliveryShot', review: 'reviewLink', reviewShot: 'reviewShot' };

// Copied from the Amazon checker's Notes (amazon/notes.js): words from the sheet are quoted, and never carry a word this dashboard must not show.
const HIDDEN = ['ZmF5cg==', 'cmVmdW5k', 'Y2FzaGJhY2s=', 'cmV3YXJk'].map((b) => Buffer.from(b, 'base64').toString('utf8'));
const HIDDEN_RE = new RegExp(`[\\p{L}\\p{N}]*(?:${HIDDEN.join('|')})[\\p{L}\\p{N}]*`, 'giu');
const clean = (text) => String(text ?? '').replace(HIDDEN_RE, '…');
function excerpt(text, n = 160) {
  const t = clean(String(text ?? '').replace(/\s+/g, ' ').trim());
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}
const oneSentence = (text) => String(text ?? '').replace(/([.!?])+\s+(?=\S)/g, '; ');
const quoted = (text, n) => `"${oneSentence(excerpt(text, n))}"`;

/** A check's id, as the Amazon checker makes them (amazon/store.js): when it started, and six letters and digits. */
export function newCheckId(date = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const stamp = `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`;
  return `c${stamp}${randomBytes(3).toString('hex')}`;
}

/**
 * A screenshot that could not be had, in the Amazon checker's words (the
 * sentence of pictureProblem in amazon/check.js). `says` follows "but".
 */
function problemLine(which, p) {
  const what = WHAT[which];
  if (p.kind === 'drive' || p.kind === 'busy') return `The ${what} is on Google Drive, but ${p.says}.`;
  if (p.kind === 'allowed') return `The ${what} is on ${p.site}, but ${p.says}.`;
  if (p.kind === 'sheet') return `The ${what} is a picture in the sheet, but ${p.says}.`;
  return `The ${what} is on ${p.site ?? 'a website'}, but ${p.says}.`;
}

/** The review screenshot's cell, the main proof on Flipkart; the review link's cell instead when only that one holds a picture. */
function reviewCell(row, had) {
  const shot = row.shots?.reviewShot ?? {};
  if (had.reviewShot && (shot.links?.length || shot.picture)) return 'reviewShot';
  const link = row.shots?.review ?? {};
  if (had.reviewLink && (link.picture || (link.links ?? []).some((l) => downloadable('review', l)))) return 'review';
  return 'reviewShot';
}

class Stopped extends Error {}
class Paused extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

/**
 * Run one row's check.
 *   row — the row as kept (store.js)
 *   has — the columns the file has: { orderShot, deliveryShot, reviewShot, reviewLink }, each true unless false
 *   screenshots — screenshots.js: forCell(rowId, which, { signal })
 *   emit(event) — started, action, step and done lines for the screen
 * -> the result: { checkId, rowId, n, name, startedAt, finishedAt, seconds, steps, paused, stopped }
 */
export async function runCheck({ row, has = null, screenshots, emit = () => {}, signal = null, checkId = newCheckId(), now = () => new Date() }) {
  const had = { orderShot: true, deliveryShot: true, reviewShot: true, reviewLink: true, ...Object.fromEntries(Object.entries(has ?? {}).map(([k, v]) => [k, v !== false])) };
  const began = Date.now();
  const result = {
    checkId,
    rowId: row.id,
    row: row.row ?? null,
    n: row.n ?? null,
    name: `Row ${row.n ?? '?'}`,
    startedAt: now().toISOString(),
    finishedAt: null,
    seconds: null,
    steps: STEP_NAMES.map((name, i) => ({ n: i + 1, name, state: 'waiting', detail: null })),
    paused: null,
    stopped: false,
  };
  const say = (says) => emit({ event: 'action', says });
  const checkStop = () => {
    if (signal?.aborted) throw new Stopped();
  };
  function start(n, action) {
    checkStop();
    const s = result.steps[n - 1];
    s.state = 'running';
    emit({ event: 'step', step: { ...s } });
    say(action ?? STEP_NAMES[n - 1]);
  }
  function finish(n, state, detail) {
    const s = result.steps[n - 1];
    s.state = state;
    s.detail = detail ? clean(detail) : null;
    emit({ event: 'step', step: { ...s } });
  }
  /** A step that is not part of the check yet: it says it comes in a later step. */
  function later(n) {
    checkStop();
    finish(n, 'later', null);
  }
  /** Pauses the check at step n: the row gets no result, and it can be checked again. */
  function pauseAt(n, kind, says, detail) {
    result.paused = { kind, says, step: n };
    finish(n, 'fail', detail);
    throw new Paused(kind);
  }
  async function step(n, fn) {
    try {
      await fn();
    } catch (err) {
      if (err instanceof Stopped || err instanceof Paused) throw err;
      finish(n, 'fail', `Something went wrong on this computer while ${STEP_DOING[n - 1]}. Check this row again.`);
    }
  }

  /** A cell's pictures, downloading again any that could not be had; a download that cannot be made just now pauses the check here. */
  async function fetchCell(n, which) {
    const g = await screenshots.forCell(row.id, which, { signal });
    checkStop();
    if (g?.pause) {
      const says = g.says ?? PAUSE_SAYS[g.pause] ?? 'The screenshot could not be downloaded just now.';
      pauseAt(n, g.pause, says, `${says.split('. ')[0].replace(/\.$/, '')}. The check paused here, before the ${WHAT[which]} was downloaded; nothing was got around.`);
    }
    return g;
  }

  /** Steps 1, 3 and 5: a screenshot's cell, and its pictures downloaded (amazon/check.js openShot). */
  async function openShot(n, which) {
    start(n, `Opening the ${WHAT[which]}`);
    if (!had[SHOT_COLUMN[which]]) return finish(n, 'fail', `The file has no ${WHAT[which]} column.`);
    const s = row.shots?.[which] ?? {};
    if (!s.links?.length && !s.picture) return finish(n, 'fail', s.text ? `The cell says ${quoted(s.text, 60)} instead of holding a screenshot.` : 'The cell is empty.');
    const g = await fetchCell(n, which);
    if (!g.files.length) return finish(n, 'fail', problemLine(which, g.problems[0] ?? { kind: 'access', site: null, says: 'it could not be opened' }));
    return finish(n, 'pass', `Opened ${g.files.length === 1 ? `the ${WHAT[which]}` : `${g.files.length} ${WHAT[which]}s`}.`);
  }

  emit({ event: 'started', checkId, steps: STEP_NAMES, rowId: row.id, row: row.row ?? null, name: result.name });
  try {
    for (let n = 1; n <= STEP_NAMES.length; n++) {
      const which = n === 5 ? reviewCell(row, had) : OPENS[n];
      if (which) await step(n, () => openShot(n, which));
      else later(n);
    }
  } catch (err) {
    if (err instanceof Stopped) result.stopped = true;
    else if (!(err instanceof Paused)) throw err;
  }
  result.finishedAt = now().toISOString();
  result.seconds = Math.max(0, Math.round((Date.now() - began) / 1000));
  if (result.paused) say(`Paused: ${result.paused.says}`);
  else if (!result.stopped) say('Done. The other steps come in a later step, so this row has no Status yet.');
  emit({ event: 'done', result });
  return result;
}
