// The settings file, settings.json next to package.json: the Status and Type
// words, the passing marks, the picture websites a download may use, the
// phrases and words the checks look for, and the emails sent to users
// (emails.js). It is read again at the start of every check and every sheet,
// so a change applies without a restart. A setting left out takes its
// default; a wrong one is said in a plain sentence. The Email templates box
// on the screen writes only the "emails" part back into the file.

import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkEmails, EmailsError, DEFAULT_EMAILS } from './emails.js';

export const SETTINGS_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'settings.json');

/** Every Type, in the order the screen lists them. */
export const TYPE_KEYS = [
  'verified',
  'ratingOnly',
  'duplicate',
  'orderShotMissing',
  'deliveryShotMissing',
  'reviewLinkMissing',
  'needDriveAccess',
  'needAccess',
  'orderNotClear',
  'deliveryNotClear',
  'reviewNotClear',
  'orderIdNotMatching',
  'orderDetailsNotMatching',
  'notDelivered',
  'productNotMatching',
  'wrongReviewLink',
  'reviewDeleted',
  'reviewNotLive',
  'reviewLinkNeeded',
  'reviewerNotMatching',
  'reviewShotNotMatching',
  'cannotAddReviews',
  'somethingElse',
];

/** The only Types that pass: Verified and Rating Only. */
export const VERIFIED_TYPES = new Set(['verified', 'ratingOnly']);

export const DEFAULT_SETTINGS = deepFreeze({
  typeWords: {
    verified: 'Verified',
    ratingOnly: 'Rating Only',
    duplicate: 'Duplicate',
    orderShotMissing: 'Purchase screenshot missing',
    deliveryShotMissing: 'Delivery screenshot missing',
    reviewLinkMissing: 'Review link or screenshot missing',
    needDriveAccess: 'Need Google Drive Access',
    needAccess: 'Need Access',
    orderNotClear: 'Purchase screenshot not clear',
    deliveryNotClear: 'Delivery screenshot not clear',
    reviewNotClear: 'Review screenshot not clear',
    orderIdNotMatching: 'Order ID is not matching',
    orderDetailsNotMatching: 'Order details not matching',
    notDelivered: 'Not delivered',
    productNotMatching: 'Product is not matching',
    wrongReviewLink: 'Wrong review link',
    reviewDeleted: 'Amazon review is deleted',
    reviewNotLive: 'Review not live',
    reviewLinkNeeded: 'Review link needed',
    reviewerNotMatching: 'Reviewer name is different',
    reviewShotNotMatching: 'Review screenshot not matching',
    cannotAddReviews: 'User not being able to add reviews',
    somethingElse: 'Something else',
  },
  // feeAllowanceRupees: when a screenshot shows no total, an item price or subtotal up to this many rupees below the sheet's amount is the same amount (Amazon's fees are not shown).
  passingMarks: { productNameShare: 0.8, reviewTextShare: 0.85, amountDifferenceRupees: 1, feeAllowanceRupees: 5 },
  allowedPictureWebsites: ['storage.googleapis.com', 'tryboxs.in', 'www.tryboxs.in'],
  reviewRefusedPhrases: [
    'has not met the minimum eligibility requirements to write a review',
    'unable to accept your review',
    'you cannot review this product',
    "can't review this product",
    'not accepting reviews on this item',
    'is not accepting reviews',
  ],
  ratingOnlyPhrases: ['thank you for rating', 'thanks for rating', 'thanks for your rating'],
  notDeliveredWords: ['Cancelled', 'Canceled', 'Lost', 'In transit', 'Not delivered', 'Returned', 'Arriving', 'Out for delivery', 'Shipped', 'Expected', 'Cancel items'],
  secondsBetweenDownloads: 1,
  // The emails sent to users about what is still needed, and their sign-off (emails.js).
  emails: DEFAULT_EMAILS,
});

const KNOWN = new Set(['about', ...Object.keys(DEFAULT_SETTINGS)]);
/**
 * What an older settings file may still hold, passed over: the words of Types
 * that are gone, and "statusWords" (the Status is always Pass, Fail or Needs
 * Manual Staff Checking now, never words from the settings file).
 */
const RETIRED = { typeWords: new Set(['linkMismatch', 'notClear']) };
const RETIRED_SETTINGS = new Set(['statusWords']);
const MARKS = {
  productNameShare: { min: 0.01, max: 1, says: 'a share from 0.01 to 1 (0.8 means 80% of the words)' },
  reviewTextShare: { min: 0.01, max: 1, says: 'a share from 0.01 to 1 (0.85 means 85% of the words)' },
  amountDifferenceRupees: { min: 0, max: 1000, says: 'a number of rupees from 0 to 1000' },
  feeAllowanceRupees: { min: 0, max: 100, says: 'a number of rupees from 0 to 100' },
};
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** A problem with settings.json, in a plain sentence the screen can show. */
export class SettingsError extends Error {}

function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
}

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** `label` names the setting in a sentence: '"typeWords.verified"' or 'item 2 of "ratingOnlyPhrases"'. */
function words(value, label, { max = 80 } = {}) {
  if (typeof value !== 'string' || !value.trim()) throw new SettingsError(`In the settings file, ${label} must be some words between quotes.`);
  const s = value.replace(/\s+/g, ' ').trim();
  if (s.length > max) throw new SettingsError(`In the settings file, ${label} is too long (at most ${max} characters).`);
  return s;
}

function list(value, name, each) {
  if (!Array.isArray(value)) throw new SettingsError(`In the settings file, "${name}" must be a list in square brackets, like ["one", "two"].`);
  const out = [];
  for (const [i, v] of value.entries()) {
    const x = each(v, `item ${i + 1} of "${name}"`);
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

/** The words of one group (typeWords): each key known, each value some words, no two the same. */
function wordGroup(raw, defaults, name) {
  if (raw === undefined) return { ...defaults };
  if (!isObject(raw)) throw new SettingsError(`In the settings file, "${name}" must be a group in curly brackets, like the one it came with.`);
  for (const k of Object.keys(raw)) if (!Object.hasOwn(defaults, k) && !RETIRED[name]?.has(k)) throw new SettingsError(`In the settings file, "${name}" has a word this dashboard does not know: "${k}". Check its spelling.`);
  const out = {};
  for (const k of Object.keys(defaults)) out[k] = raw[k] === undefined ? defaults[k] : words(raw[k], `"${name}.${k}"`, { max: 60 });
  const seen = new Map();
  for (const [k, v] of Object.entries(out)) {
    const key = v.toLowerCase();
    if (seen.has(key)) throw new SettingsError(`In the settings file, "${name}.${seen.get(key)}" and "${name}.${k}" are both "${v}". Each must be different.`);
    seen.set(key, k);
  }
  return out;
}

/**
 * settings.json's contents (already parsed) as the settings the checks use:
 * every setting present, defaults for any left out. Throws SettingsError,
 * with a plain sentence, for anything wrong.
 */
export function checkSettings(raw) {
  if (!isObject(raw)) throw new SettingsError('The settings file must hold one group in curly brackets, like the one it came with.');
  for (const k of Object.keys(raw)) if (!KNOWN.has(k) && !RETIRED_SETTINGS.has(k)) throw new SettingsError(`The settings file has a setting this dashboard does not know: "${k}". Check its spelling.`);
  const d = DEFAULT_SETTINGS;
  const marks = { ...d.passingMarks };
  if (raw.passingMarks !== undefined) {
    if (!isObject(raw.passingMarks)) throw new SettingsError('In the settings file, "passingMarks" must be a group in curly brackets, like the one it came with.');
    for (const [k, v] of Object.entries(raw.passingMarks)) {
      const rule = MARKS[k];
      if (!rule) throw new SettingsError(`In the settings file, "passingMarks" has a mark this dashboard does not know: "${k}". Check its spelling.`);
      if (typeof v !== 'number' || !Number.isFinite(v) || v < rule.min || v > rule.max) throw new SettingsError(`In the settings file, "passingMarks.${k}" must be ${rule.says}, without quotes.`);
      marks[k] = v;
    }
  }
  const websites =
    raw.allowedPictureWebsites === undefined
      ? [...d.allowedPictureWebsites]
      : list(raw.allowedPictureWebsites, 'allowedPictureWebsites', (v, at) => {
          const host = typeof v === 'string' ? v.trim().toLowerCase().replace(/\.$/, '') : '';
          if (!HOST.test(host) || isIP(host) || host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost')) {
            throw new SettingsError(`In the settings file, ${at} ("${String(v)}") must be a website's name, such as "storage.googleapis.com": no https://, no slashes, never an address on this computer or the local network.`);
          }
          return host;
        });
  const phrases = (key) =>
    raw[key] === undefined
      ? [...d[key]]
      : list(raw[key], key, (v, at) => words(v, at, { max: 200 }));
  let seconds = d.secondsBetweenDownloads;
  if (raw.secondsBetweenDownloads !== undefined) {
    const v = raw.secondsBetweenDownloads;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 60) throw new SettingsError('In the settings file, "secondsBetweenDownloads" must be a number of seconds from 0 to 60, without quotes.');
    seconds = v;
  }
  let emails;
  try {
    emails = checkEmails(raw.emails);
  } catch (err) {
    if (err instanceof EmailsError) throw new SettingsError(err.message);
    throw err;
  }
  const out = {
    typeWords: wordGroup(raw.typeWords, d.typeWords, 'typeWords'),
    passingMarks: marks,
    allowedPictureWebsites: websites,
    reviewRefusedPhrases: phrases('reviewRefusedPhrases'),
    ratingOnlyPhrases: phrases('ratingOnlyPhrases'),
    notDeliveredWords: phrases('notDeliveredWords'),
    secondsBetweenDownloads: seconds,
    emails,
  };
  for (const key of ['reviewRefusedPhrases', 'ratingOnlyPhrases', 'notDeliveredWords']) {
    if (!out[key].length) throw new SettingsError(`In the settings file, "${key}" must hold at least one phrase.`);
  }
  return deepFreeze(out);
}

/** The settings file as it is written, parsed but not checked: {} when there is none. Throws SettingsError with a plain sentence. */
async function rawSettings(file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw new SettingsError('The settings file could not be opened on this computer.');
  }
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    const line = String(err?.message ?? '').match(/line (\d+)/)?.[1];
    throw new SettingsError(`The settings file could not be read: a comma, quote or bracket is missing or extra${line ? ` near line ${line}` : ''}. Put it back, save the file, then try again.`);
  }
}

/** settings.json, read and checked. Throws SettingsError with a plain sentence. */
export async function loadSettings(file = SETTINGS_FILE) {
  return checkSettings(await rawSettings(file));
}

/**
 * The emails changed on the screen (the Email templates box), written into
 * the settings file as its "emails" part; every other setting stays as it
 * is written. -> the settings as they are now. Throws SettingsError with a
 * plain sentence when the emails or the file are wrong.
 */
export async function saveEmails(emails, file = SETTINGS_FILE) {
  const raw = await rawSettings(file);
  if (!isObject(raw)) throw new SettingsError('The settings file must hold one group in curly brackets, like the one it came with.');
  let checked;
  try {
    checked = checkEmails(emails);
  } catch (err) {
    if (err instanceof EmailsError) throw new SettingsError(err.message);
    throw err;
  }
  const next = { ...raw, emails: checked };
  const settings = checkSettings(next);
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await rename(tmp, file);
  } catch {
    throw new SettingsError('The settings file could not be written on this computer.');
  }
  return settings;
}

/** The Type's word, as settings.json spells it. */
export function typeWord(typeKey, settings = DEFAULT_SETTINGS) {
  return settings.typeWords[typeKey] ?? settings.typeWords.somethingElse;
}
