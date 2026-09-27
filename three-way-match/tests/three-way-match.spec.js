import { test, expect } from '@playwright/test';
import { login } from '../pages/loginPage.js';
import { openNewPOForm, fillNewPOHeader, addPOLineItem, submitPO } from '../pages/poPage.js';
import { createAndSubmitInvoice_Flow4 } from '../pages/invoicePage.js';
import { createAndSubmitGRN_Flow4 } from '../pages/grnPage.js';
import { createAndSubmitBill } from '../pages/billPage.js';
import { gridRows } from '../locators/common.locators.js';
import { VENDOR, DEPT, LOB, CURRENCY, COUNTRY } from '../utils/constants.js';
import { directPOLineItems } from '../data/testData.js';

test('P2P Flow - PO Creation', async ({ page }) => {

  // ───── LOGIN ─────
  await login(page);
  await expect(page).toHaveURL(/.*home/);

  // ───── CREATE PO ─────
  await openNewPOForm(page);
  await expect(page).toHaveURL(/.*flexi_record.*/);

  await fillNewPOHeader(page, { dept: DEPT, lob: LOB, vendor: VENDOR, country: COUNTRY, currency: CURRENCY });

  for (const item of directPOLineItems) {
    await addPOLineItem(page, item);
  }
  await expect(gridRows(page)).toHaveCount(directPOLineItems.length);

  // ───── SUBMIT PO ─────
  await submitPO(page);
  await expect(page.getByText('PO Submitted')).toBeVisible({ timeout: 30000 });

  // ───── INVOICE ─────
  await createAndSubmitInvoice_Flow4(page);

  // ───── GRN ─────
  await createAndSubmitGRN_Flow4(page);

  // ───── BILL ─────
  await createAndSubmitBill(page);
  await expect(page.getByText('Bill Submitted')).toBeVisible({ timeout: 30000 });

});
