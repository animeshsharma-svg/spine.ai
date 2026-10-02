import { test, expect } from '@playwright/test';
import { login } from '../pages/loginPage.js';
import { navigateToIntake, fillIntakeTitle, fillDetailsForm, fillLineItems, sendRequest, approveIntake } from '../pages/intakePage.js';
import { navigateToPRFromIntake, createPOFromPR, fillPOHeaderAndPrices, submitPO } from '../pages/poPage.js';
import { createAndSubmitInvoice } from '../pages/invoicePage.js';
import { createAndSubmitGRN } from '../pages/grnPage.js';
import { createAndSubmitBill } from '../pages/billPage.js';
import { lineItems } from '../data/testData.js';

test('Intake to Bill - Full Flow', async ({ page }) => {

  // ───── LOGIN ─────
  await login(page);
  await expect(page).toHaveURL(/.*home/);

  // ───── NAVIGATE TO INTAKE ─────
  await navigateToIntake(page);
  await expect(page).toHaveURL(/.*intake.*/);

  // ───── CREATE REQUEST ─────
  await page.getByRole('button', { name: 'Create Request' }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  await expect(page.getByRole('button', { name: 'Next' })).not.toBeVisible();
  await fillIntakeTitle(page);

  // ───── DETAILS FORM ─────
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(800);
  await expect(page.getByText('Please fill all required fields')).toBeVisible();

  await fillDetailsForm(page);
  await expect(page.getByRole('spinbutton').nth(1)).toHaveValue('1000');

  // ───── LINE ITEMS ─────
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByText('Sheet partially filled')).toBeVisible({ timeout: 10000 });

  await fillLineItems(page);

  await expect(page.getByTestId('sheet-cell-1-product')).toBeVisible();
  await expect(page.getByTestId('sheet-cell-2-product')).toBeVisible();
  await expect(page.getByTestId('sheet-cell-3-product')).toBeVisible();

  await expect(page.locator('text=100 Unit').first()).toBeVisible();
  await expect(page.locator('text=50 Unit').first()).toBeVisible();
  await expect(page.locator('text=10 Unit').first()).toBeVisible();

  for (const item of lineItems) {
    await expect(page.getByText(item.expectedExpense)).toBeVisible();
  }

  // ───── REVIEW ─────
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/.*intake.*/);

  const pages = page.context().pages();
  expect(pages.length).toBe(1);

  // ───── SEND REQUEST ─────
  await sendRequest(page);

  // ───── APPROVAL ─────
  await approveIntake(page);
  await expect(page.getByText('Approved').first()).toBeVisible({ timeout: 15000 });

  // ───── PR → PO ─────
  await navigateToPRFromIntake(page);
  await createPOFromPR(page);
  await fillPOHeaderAndPrices(page);

  await expect(page.getByRole('button', { name: 'Submit PO' })).toBeEnabled();
  await submitPO(page);

  // ───── INVOICE ─────
  await createAndSubmitInvoice(page);

  // ───── GRN ─────
  await createAndSubmitGRN(page);

  // ───── BILL ─────
  await createAndSubmitBill(page);
  await expect(page.getByText('Bill Submitted')).toBeVisible({ timeout: 30000 });

});