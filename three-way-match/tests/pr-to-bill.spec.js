import { test, expect } from '@playwright/test';
import { login } from '../pages/loginPage.js';
import { navigateToPRList, openFirstPR } from '../pages/prPage.js';
import { createPOFromPR_Flow3, fillPOHeaderAndPrices_Flow3, submitPO } from '../pages/poPage.js';
import { createAndSubmitInvoice_Flow3 } from '../pages/invoicePage.js';
import { createAndSubmitGRN_Flow3 } from '../pages/grnPage.js';
import { createAndSubmitBill } from '../pages/billPage.js';

test('PR to Bill - Full Flow (No Event)', async ({ page }) => {

  // ───── LOGIN ─────
  await login(page);
  await expect(page).toHaveURL(/.*home/);

  // ───── NAVIGATE TO PR LIST ─────
  await navigateToPRList(page);
  await expect(page).toHaveURL(/.*purchase-requisition.*/);

  // ───── OPEN FIRST PR ─────
  const prPage = await openFirstPR(page);
  await expect(prPage.getByText(/Pr No\s+PR-/)).toBeVisible({ timeout: 10000 });

  // ───── CREATE PO FROM PR ─────
  await createPOFromPR_Flow3(prPage);
 await fillPOHeaderAndPrices_Flow3(prPage);
   await expect(prPage.getByRole('button', { name: 'Submit PO' })).toBeEnabled();
  await submitPO(prPage);
 

  // ───── INVOICE ─────
  await createAndSubmitInvoice_Flow3(prPage);

  // ───── GRN ─────
  await createAndSubmitGRN_Flow3(prPage);

  // ───── BILL ─────
  await createAndSubmitBill(prPage);
  await expect(prPage.getByText('Bill Submitted')).toBeVisible({ timeout: 30000 });

});