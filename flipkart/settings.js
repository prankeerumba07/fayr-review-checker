// Flipkart's passing marks, kept in Flipkart's own settings
// (data/flipkart/settings.json, store.js), never Amazon's: how much of a
// product's name a screenshot must show, how many rupees an amount may be
// off, and how many rupees of fees may be missing from a screenshot that
// shows no total. They start with the Amazon checker's values
// (amazon/settings.js), and are checked the same way, with the same words.

/** The Amazon checker's values, the ones Flipkart starts with. */
export const DEFAULT_MARKS = Object.freeze({ productNameShare: 0.8, amountDifferenceRupees: 1, feeAllowanceRupees: 5 });
const MARKS = {
  productNameShare: { min: 0.01, max: 1, says: 'a share from 0.01 to 1 (0.8 means 80% of the words)' },
  amountDifferenceRupees: { min: 0, max: 1000, says: 'a number of rupees from 0 to 1000' },
  feeAllowanceRupees: { min: 0, max: 100, says: 'a number of rupees from 0 to 100' },
};
const WHERE = "In Flipkart's settings file, data/flipkart/settings.json,";

/** A problem with Flipkart's passing marks, in a plain sentence the screen can show. */
export class SettingsError extends Error {}

/**
 * Flipkart's passing marks as written in its settings file, as the check uses
 * them: every mark, the Amazon checker's value for any left out. Throws
 * SettingsError, with a plain sentence, for anything wrong.
 */
export function checkMarks(raw) {
  const marks = { ...DEFAULT_MARKS };
  if (raw === undefined) return marks;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SettingsError(`${WHERE} "passingMarks" must be a group in curly brackets, like the one it came with.`);
  for (const [k, v] of Object.entries(raw)) {
    const rule = MARKS[k];
    if (!rule) throw new SettingsError(`${WHERE} "passingMarks" has a mark this dashboard does not know: "${k}". Check its spelling.`);
    if (typeof v !== 'number' || !Number.isFinite(v) || v < rule.min || v > rule.max) throw new SettingsError(`${WHERE} "passingMarks.${k}" must be ${rule.says}, without quotes.`);
    marks[k] = v;
  }
  return marks;
}
