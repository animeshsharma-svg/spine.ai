import { optionByName } from './common.locators.js';
import { note } from '../utils/observations.js';

/**
 * How long to let each dropdown settle. Tunable from the environment so a
 * flakier day can be given more room without editing code.
 */
const SETTLE_BEFORE_MS = Number(process.env.FIELD_SETTLE_MS ?? 300);
const SETTLE_AFTER_OPEN_MS = Number(process.env.FIELD_OPEN_MS ?? 400);
const SETTLE_AFTER_PICK_MS = Number(process.env.FIELD_PICK_MS ?? 400);

export const fieldWrapperByLabel = (page, labelText) =>
  page.locator('.styles_fieldWrapper').filter({
    has: page.locator('.styles_labelWrapper', { hasText: labelText }),
  });

export const fieldTriggerByLabel = (page, labelText) =>
  fieldWrapperByLabel(page, labelText).locator('.styles_inputWrapper');

/** Is this field still showing the placeholder rather than a value? */
async function looksEmpty(field) {
  return (await field.getByText('Empty', { exact: true }).count()) > 0;
}

/**
 * Watch a field settle after a pick, and say so when it misbehaves.
 *
 * Two things happen on this form that are survivable but not right, and both
 * used to pass unrecorded:
 *
 *   - the value lands, the field goes back to "Empty", and then the value
 *     returns a moment later — the disappear/reappear;
 *   - the value never arrives at all, and the caller retries.
 *
 * Rather than sleep a fixed amount and hope, this samples the field for a
 * couple of seconds and reports the shape of what it saw.
 */
async function watchSettle(field, labelText, optionName) {
  const deadline = Date.now() + 2_000;
  let wentEmpty = false;
  let filled = !(await looksEmpty(field));

  while (Date.now() < deadline) {
    const empty = await looksEmpty(field);
    if (empty && filled) wentEmpty = true;   // had a value, lost it
    if (!empty) filled = true;
    // Settled: it has a value and stayed that way through a sample.
    if (!empty && wentEmpty) break;
    await field.page().waitForTimeout(150);
  }

  if (wentEmpty && filled) {
    note(
      'value-vanished',
      `"${labelText}" was set to "${optionName}", then the field went blank and the value came back a moment later`,
      { field: labelText, value: optionName },
    );
  }
  return filled;
}

export async function selectFieldOption(page, labelText, optionName, { retries = 2 } = {}) {
  const field = fieldWrapperByLabel(page, labelText);
  const inputWrapper = field.locator('.styles_inputWrapper');

  for (let attempt = 1; attempt <= retries; attempt++) {
    /**
     * Let the form breathe around every dropdown.
     *
     * These selects misbehave when driven at full speed: the list opens and
     * shuts itself, or a value lands and is thrown away. Both are the app
     * losing an interaction it had already acknowledged, and both get much
     * rarer when the click is not landing on a field that is still settling
     * from the last one. The pauses are deliberate, not padding — 300ms
     * before reaching for the control, 400ms after it opens, so the list is
     * actually rendered before an option is clicked.
     */
    await page.waitForTimeout(SETTLE_BEFORE_MS);
    const combobox = inputWrapper.getByRole('combobox');
    if (await combobox.count() > 0) {
      await combobox.click();
    } else {
      await inputWrapper.click();
    }
    await page.waitForTimeout(SETTLE_AFTER_OPEN_MS);

    /**
     * The dropdown sometimes shuts itself before anything can be chosen.
     *
     * Clicking an option that is no longer there waits out the full action
     * timeout and then throws something that reads like a missing option —
     * when what actually happened is that the list closed on its own. Checking
     * first turns that into a named observation and a fast retry.
     */
    const option = optionByName(page, optionName);
    const open = await option
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!open) {
      note(
        'dropdown-closed',
        `the "${labelText}" dropdown opened and then closed by itself before "${optionName}" could be picked` +
          (attempt < retries ? ' — trying again' : ''),
        { field: labelText, value: optionName, attempt },
      );
      if (attempt < retries) {
        await page.waitForTimeout(500);
        continue;
      }
      break;
    }

    await option.click();
    // And once more after the choice, before anything reads the field back.
    await page.waitForTimeout(SETTLE_AFTER_PICK_MS);
    await watchSettle(field, labelText, optionName);

    if (!(await looksEmpty(field))) {
      if (attempt > 1) {
        note(
          'needed-retries',
          `"${labelText}" only accepted "${optionName}" on attempt ${attempt} of ${retries}`,
          { field: labelText, value: optionName, attempts: attempt },
        );
      }
      return;
    }
    if (attempt < retries) await page.waitForTimeout(500);
  }

  throw new Error(`selectFieldOption: "${labelText}" still shows "Empty" after ${retries} attempt(s) selecting "${optionName}"`);
}
