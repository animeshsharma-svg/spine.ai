// `test` comes from the fixture, not from Playwright directly: that is what
// makes every run leave a result file and a screenshot for the QA platform's
// report. Importing the plain one would silently go back to reporting nothing.
import { test, expect } from '../fixtures/journeyResult.js';
import { login } from '../pages/loginPage.js';
import { openNewPOForm, fillNewPOHeader, addPOLineItem, submitPO } from '../pages/poPage.js';
import { createAndSubmitInvoice_Flow4 } from '../pages/invoicePage.js';
import { createAndSubmitGRN_Flow4 } from '../pages/grnPage.js';
import { createAndSubmitBill } from '../pages/billPage.js';
import { gridRows } from '../locators/common.locators.js';
import { VENDOR, DEPT, LOB, CURRENCY, COUNTRY } from '../utils/constants.js';
import { directPOLineItems } from '../data/testData.js';

/**
 * Each phase says what it just did, tagged `[po-to-bill]`.
 *
 * The QA platform reads this suite's output and turns each tagged line into a
 * step on screen and in the run's report — so a run that stops halfway says
 * WHICH document it got as far as, instead of only "exit 1". Without this the
 * platform would show a Playwright summary line and nothing else, because the
 * suite is otherwise silent.
 */
const say = (line) => console.log(`[po-to-bill] ${line}`);

test('P2P Flow - 3 Way Match', async ({ page }) => {
  // ───── LOGIN ─────
  await login(page);
  await expect(page).toHaveURL(/.*home/);
  say('signed in to the sandbox demo tenant');

  // ───── CREATE PO ─────
  await openNewPOForm(page);
  await expect(page).toHaveURL(/.*flexi_record.*/);

  await fillNewPOHeader(page, { dept: DEPT, lob: LOB, vendor: VENDOR, country: COUNTRY, currency: CURRENCY });
  say(`purchase order header filled — vendor ${VENDOR}, ${DEPT}/${LOB}, ${CURRENCY}`);

  for (const item of directPOLineItems) {
    await addPOLineItem(page, item);
  }
  await expect(gridRows(page)).toHaveCount(directPOLineItems.length);
  say(`${directPOLineItems.length} line item(s) added to the purchase order`);

  // ───── SUBMIT PO ─────
  await submitPO(page);
  await expect(page.getByText('PO Submitted')).toBeVisible({ timeout: 30000 });
  say('purchase order submitted');

  /**
   * Invoice and GRN follow the PURCHASE ORDER, not their own defaults.
   *
   * Both page objects carried a hard-coded list of three products. With the PO
   * down to one line that list described documents this order does not have —
   * the invoice would look for prices that were never raised. A 3-way match is
   * the three documents agreeing, so all three are driven from one source.
   */
  const invoiceLines = directPOLineItems.map((i) => ({ product: i.product, price: i.unitPrice ?? i.mrp }));
  const receivedLines = directPOLineItems.map((i) => ({ product: i.product, qty: i.qty }));

  // ───── INVOICE ─────
  await createAndSubmitInvoice_Flow4(page, invoiceLines);
  say('invoice raised against the purchase order');

  // ───── GRN ─────
  await createAndSubmitGRN_Flow4(page, receivedLines);
  say('goods receipt (GRN) recorded');

  // ───── BILL ─────
  await createAndSubmitBill(page);
  await expect(page.getByText('Bill Submitted')).toBeVisible({ timeout: 30000 });
  say('bill submitted — the 3-way match is complete');
});
