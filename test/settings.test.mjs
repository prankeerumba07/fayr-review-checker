// The settings file: the Status and Type words, the passing marks, the picture
// websites, the phrases, and a plain sentence for anything wrong in it.
// Run: node test/settings.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSettings, checkSettings, typeWord, SettingsError, DEFAULT_SETTINGS, TYPE_KEYS, VERIFIED_TYPES, SETTINGS_FILE } from '../amazon/settings.js';

const dir = mkdtempSync(join(tmpdir(), 'arc-settings-'));
after(() => rm(dir, { recursive: true, force: true }));
const file = (name, text) => {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
};
const refusal = (raw) => {
  try {
    checkSettings(raw);
  } catch (err) {
    assert.ok(err instanceof SettingsError, err.message);
    return err.message;
  }
  assert.fail('it was accepted');
};

test('the settings file that comes with the dashboard reads, and says the same as the defaults', async () => {
  const s = await loadSettings();
  assert.deepEqual(s, checkSettings({}));
  assert.deepEqual(JSON.parse(JSON.stringify(s)), JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  assert.match(SETTINGS_FILE, /settings\.json$/);
  assert.equal(typeof JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')).about, 'string', 'it explains itself to whoever opens it');
});

test('the Types: only Verified and Rating Only pass; the Status words are not settings any more', () => {
  assert.deepEqual(TYPE_KEYS.map((k) => typeWord(k)), [
    'Verified',
    'Rating Only',
    'Duplicate',
    'Purchase screenshot missing',
    'Delivery screenshot missing',
    'Review link or screenshot missing',
    'Need Google Drive Access',
    'Need Access',
    'Purchase screenshot not clear',
    'Delivery screenshot not clear',
    'Review screenshot not clear',
    'Order ID is not matching',
    'Order details not matching',
    'Not delivered',
    'Product is not matching',
    'Wrong review link',
    'Amazon review is deleted',
    'Review not live',
    'Review link needed',
    'Reviewer name is different',
    'Review screenshot not matching',
    'User not being able to add reviews',
    'Something else',
  ]);
  assert.deepEqual([...VERIFIED_TYPES], ['verified', 'ratingOnly']);
  // A settings file from before still loads: the words of the Types that are gone are passed over.
  const older = checkSettings({ typeWords: { linkMismatch: 'Link mismatch', notClear: 'Screenshot not clear', duplicate: 'Duplicate' } });
  assert.equal(older.typeWords.orderNotClear, 'Purchase screenshot not clear');
  assert.equal(older.typeWords.linkMismatch, undefined);
  // The Status is always Pass, Fail or Needs Manual Staff Checking: an older file's "statusWords" is passed over.
  assert.equal(DEFAULT_SETTINGS.statusWords, undefined);
  assert.equal(checkSettings({ statusWords: { verified: 'Verified', unverified: 'Unverified' } }).statusWords, undefined);
  assert.equal(JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')).statusWords, undefined, 'the settings file has no Status words');
  assert.equal(typeWord('nothing-like-this'), 'Something else');
});

test('the passing marks, the picture websites, the phrases and the words, with their defaults', () => {
  const s = checkSettings({});
  assert.deepEqual(s.passingMarks, { productNameShare: 0.8, reviewTextShare: 0.85, amountDifferenceRupees: 1, feeAllowanceRupees: 5 });
  assert.deepEqual(s.allowedPictureWebsites, ['storage.googleapis.com', 'tryboxs.in', 'www.tryboxs.in']);
  assert.deepEqual(s.reviewRefusedPhrases, ['has not met the minimum eligibility requirements to write a review', 'unable to accept your review', 'you cannot review this product', "can't review this product", 'not accepting reviews on this item', 'is not accepting reviews']);
  assert.deepEqual(s.ratingOnlyPhrases, ['thank you for rating', 'thanks for rating', 'thanks for your rating']);
  assert.deepEqual(s.notDeliveredWords, ['Cancelled', 'Canceled', 'Lost', 'In transit', 'Not delivered', 'Returned', 'Arriving', 'Out for delivery', 'Shipped', 'Expected', 'Cancel items']);
  assert.equal(checkSettings({ passingMarks: { feeAllowanceRupees: 0 } }).passingMarks.feeAllowanceRupees, 0, 'the fee allowance can be turned off');
  assert.equal(s.secondsBetweenDownloads, 1);
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.typeWords), 'nothing can change them by mistake');
  // The emails sent to users, with their sign-off, are settings too (emails.js has their words).
  assert.deepEqual(Object.keys(s.emails), ['signOff', 'templates']);
  assert.equal(Object.keys(s.emails.templates).length, 21);
  assert.equal(s.emails.signOff, 'Thank you,\nThe support team');
  assert.equal(checkSettings({ emails: { signOff: 'Thanks' } }).emails.signOff, 'Thanks');
  assert.equal(checkSettings({ emails: { signOff: 'Thanks' } }).emails.templates.duplicate.subject, s.emails.templates.duplicate.subject, 'anything left out keeps its words');
});

test('a change applies, and anything left out keeps its default', async () => {
  const s = await loadSettings(file('some.json', JSON.stringify({ typeWords: { needAccess: 'Need access please' }, passingMarks: { productNameShare: 0.7 }, allowedPictureWebsites: ['Pictures.Example.com.'] })));
  assert.equal(typeWord('needAccess', s), 'Need access please');
  assert.equal(typeWord('verified', s), 'Verified');
  assert.equal(s.passingMarks.productNameShare, 0.7);
  assert.equal(s.passingMarks.amountDifferenceRupees, 1);
  assert.deepEqual(s.allowedPictureWebsites, ['pictures.example.com'], 'capitals and a final dot do not matter');
  assert.deepEqual(await loadSettings(join(dir, 'not-there.json')), checkSettings({}), 'no file: every default');
  assert.equal(typeWord('verified', await loadSettings(file('bom.json', `﻿${JSON.stringify({})}`))), 'Verified', 'a byte-order mark from Notepad is fine');
});

test('anything wrong in the file is a plain sentence', async () => {
  await assert.rejects(loadSettings(file('broken.json', '{\n  "typeWords": {\n    "verified": "Verified"\n    "duplicate": "Duplicate"\n  }\n}\n')), (err) => {
    assert.ok(err instanceof SettingsError);
    assert.equal(err.message, 'The settings file could not be read: a comma, quote or bracket is missing or extra near line 4. Put it back, save the file, then try again.');
    return true;
  });
  assert.equal(refusal([]), 'The settings file must hold one group in curly brackets, like the one it came with.');
  assert.equal(refusal({ alowedPictureWebsites: [] }), 'The settings file has a setting this dashboard does not know: "alowedPictureWebsites". Check its spelling.');
  assert.equal(refusal({ typeWords: { verifed: 'Yes' } }), 'In the settings file, "typeWords" has a word this dashboard does not know: "verifed". Check its spelling.');
  assert.equal(refusal({ typeWords: { duplicate: '' } }), 'In the settings file, "typeWords.duplicate" must be some words between quotes.');
  assert.equal(refusal({ typeWords: { duplicate: 'Verified' } }), 'In the settings file, "typeWords.verified" and "typeWords.duplicate" are both "Verified". Each must be different.');
  assert.equal(refusal({ passingMarks: { productNameShare: 80 } }), 'In the settings file, "passingMarks.productNameShare" must be a share from 0.01 to 1 (0.8 means 80% of the words), without quotes.');
  assert.equal(refusal({ passingMarks: { amountDifferenceRupees: '1' } }), 'In the settings file, "passingMarks.amountDifferenceRupees" must be a number of rupees from 0 to 1000, without quotes.');
  assert.equal(refusal({ passingMarks: { amount: 1 } }), 'In the settings file, "passingMarks" has a mark this dashboard does not know: "amount". Check its spelling.');
  for (const bad of ['https://tryboxs.in', 'tryboxs.in/api', '127.0.0.1', 'localhost', 'printer.local', '10.0.0.8', '', 'no_underscores.example.com']) {
    assert.match(refusal({ allowedPictureWebsites: [bad] }), /^In the settings file, item 1 of "allowedPictureWebsites" \(".*"\) must be a website's name, such as "storage\.googleapis\.com": no https:\/\/, no slashes, never an address on this computer or the local network\.$/, bad);
  }
  assert.equal(refusal({ allowedPictureWebsites: 'tryboxs.in' }), 'In the settings file, "allowedPictureWebsites" must be a list in square brackets, like ["one", "two"].');
  assert.equal(refusal({ ratingOnlyPhrases: [] }), 'In the settings file, "ratingOnlyPhrases" must hold at least one phrase.');
  assert.equal(refusal({ notDeliveredWords: ['Lost', 3] }), 'In the settings file, item 2 of "notDeliveredWords" must be some words between quotes.');
  assert.equal(refusal({ secondsBetweenDownloads: -1 }), 'In the settings file, "secondsBetweenDownloads" must be a number of seconds from 0 to 60, without quotes.');
  assert.equal(refusal({ emails: { templates: { duplicate: { subject: 'Hello {user}' } } } }), 'In the settings file, "emails.templates.duplicate.subject" uses {user}, which the dashboard does not know. It knows {name}, {order ID}, {product}, {what is wrong} and {sign-off}.');
  assert.equal(refusal({ emails: [] }), 'In the settings file, "emails" must be a group in curly brackets, like the one it came with.');
});
