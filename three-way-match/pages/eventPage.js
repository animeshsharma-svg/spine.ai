import { BASE_URL } from '../utils/constants.js';
import { expect } from '@playwright/test';

const VENDOR_URL = BASE_URL.replace('client-', 'vendor-');
const SUPPLIER_EMAIL = 'anita.verma@samplemail.com';
const SUPPLIER_OTP = '991133';

export async function inviteVendorAndPublish(prPage) {
  await prPage.getByRole('button', { name: 'Invite Vendor' }).click();
  await prPage.waitForTimeout(1000);
  await prPage.getByRole('button', { name: 'Publish' }).click();
  await prPage.waitForTimeout(1000);
  await prPage.getByRole('button', { name: 'Publish' }).last().click();
  await prPage.waitForLoadState('domcontentloaded');
  await prPage.waitForTimeout(3000);
}

export async function loginAsSupplierAndBid(page) {
  const supplierContext = await page.context().browser().newContext();
  const supplierPage = await supplierContext.newPage();

  await supplierPage.goto(`${VENDOR_URL}/login`);
  await supplierPage.waitForLoadState('domcontentloaded');
  await supplierPage.waitForTimeout(1500);

  await supplierPage.getByRole('button', { name: 'Continue with email' }).click();
  await supplierPage.waitForTimeout(500);
  await supplierPage.getByRole('textbox', { name: 'Enter your email address' }).fill(SUPPLIER_EMAIL);
  await supplierPage.getByRole('button', { name: 'Send OTP' }).click();
  await supplierPage.waitForTimeout(1000);
  await supplierPage.getByRole('textbox', { name: 'Enter Your OTP' }).fill(SUPPLIER_OTP);
  await supplierPage.getByRole('button', { name: 'Login', exact: true }).click();
  await supplierPage.waitForLoadState('domcontentloaded');
  await supplierPage.waitForTimeout(2000);

  try {
    await supplierPage.locator('.ant-notification-notice-close').waitFor({ state: 'visible', timeout: 3000 });
    await supplierPage.locator('.ant-notification-notice-close').click();
    await supplierPage.waitForTimeout(500);
  } catch {}

  await supplierPage.getByText('Acme Corp').first().click();
  await supplierPage.waitForLoadState('domcontentloaded');
  await supplierPage.waitForTimeout(2000);

  try {
    await supplierPage.locator('.ant-notification-notice-close').waitFor({ state: 'visible', timeout: 3000 });
    await supplierPage.locator('.ant-notification-notice-close').click();
    await supplierPage.waitForTimeout(500);
  } catch {}

  await supplierPage.getByRole('button', { name: 'I will participate' }).waitFor({ state: 'visible', timeout: 10000 });
  await supplierPage.getByRole('button', { name: 'I will participate' }).click();
  await supplierPage.waitForTimeout(1000);

  await supplierPage.locator('.ant-tabs-nav > div > div:nth-child(2) > div > div').click();
  await supplierPage.waitForTimeout(1000);

  await supplierPage.getByRole('grid').filter({ hasText: 'S no. Product Product Variant' })
    .evaluate(el => el.scrollLeft = 2000);
  await supplierPage.waitForTimeout(1000);

  // Row 1
  await supplierPage.getByRole('gridcell').filter({ hasText: /^$/ }).nth(1).dblclick();
  await supplierPage.waitForTimeout(600);
  await supplierPage.keyboard.type('100');
  await supplierPage.keyboard.press('Enter');
  await supplierPage.waitForTimeout(600);

  // Row 2
  await supplierPage.getByRole('gridcell').filter({ hasText: /^$/ }).nth(1).dblclick();
  await supplierPage.waitForTimeout(600);
  await supplierPage.keyboard.type('80');
  await supplierPage.keyboard.press('Enter');
  await supplierPage.waitForTimeout(600);

  // Row 3
  await supplierPage.getByRole('gridcell').filter({ hasText: /^$/ }).nth(1).dblclick();
  await supplierPage.waitForTimeout(600);
  await supplierPage.keyboard.type('150');
  await supplierPage.keyboard.press('Enter');
  await supplierPage.waitForTimeout(500);
  await supplierPage.locator('body').click({ position: { x: 100, y: 100 } });
  await supplierPage.waitForTimeout(400);

  await supplierPage.getByRole('button', { name: 'Submit Quote' }).first().click();
  await supplierPage.waitForLoadState('domcontentloaded');
  await supplierPage.waitForTimeout(2000);

  await supplierContext.close();
}
export async function awardBidAndNavigateToPO(prPage, buyerPage) 
 {
  // Click Master QCS tab
  await prPage.getByRole('tab', { name: 'Master QCS' }).click();
  await expect(prPage.getByRole('tab', { name: 'Master QCS' })).toHaveAttribute('aria-selected', 'true', { timeout: 30000 });

  // Start Awarding
  const startAwarding = prPage.getByRole('button', { name: 'Start Awarding' });
  await expect(startAwarding).toBeVisible({ timeout: 30000 });
  await startAwarding.first().click();

  // Select supplier
  await prPage.getByLabel('', { exact: true }).first().check();

  // Click Transpose button
  const transposeButton = prPage.locator('.ant-btn._transpose_1fgvv_149');
  await expect(transposeButton).toBeVisible({ timeout: 30000 });
  await transposeButton.click();
  await prPage.waitForTimeout(1000);

  // Select all 3 line items
  await prPage.getByRole('row', { name: /Business Laptop 14inch i7/i }).getByLabel('', { exact: true }).check();
  await prPage.getByRole('row', { name: /9v Vol Battery/i }).getByLabel('', { exact: true }).check();
  await prPage.getByRole('row', { name: /Academic Textbook/i }).getByLabel('', { exact: true }).check();
  await prPage.waitForTimeout(500);

  // Proceed
  const proceedBtn = prPage.getByRole('button', { name: 'Proceed' });
  await expect(proceedBtn).toBeVisible({ timeout: 30000 });
  await proceedBtn.click();
  await prPage.waitForTimeout(1000);

  // Create Proposal
  const createProposal = prPage.getByRole('menuitem', { name: 'Create Proposal' });
  await expect(createProposal).toBeVisible({ timeout: 30000 });
  await createProposal.click();
  await prPage.waitForTimeout(1000);

  // Submit Proposal
  const submitProposal = prPage.getByRole('button', { name: 'Submit Proposal' }).first();
  await expect(submitProposal).toBeVisible({ timeout: 30000 });
  await submitProposal.click();
  await prPage.waitForTimeout(1000);

  // Submit Proposal confirm
const confirmSubmit = prPage.getByLabel('Submit Proposal').getByRole('button', { name: 'Submit Proposal' });
await expect(confirmSubmit).toBeVisible({ timeout: 30000 });
await confirmSubmit.click();
await prPage.waitForTimeout(5000); 

await prPage.locator('span').filter({ hasText: /^0123456789/ }).getByRole('button').click();
await prPage.waitForTimeout(2000);

await expect(prPage.getByText(/a few seconds/i).first()).toBeVisible({ timeout: 15000 });
await prPage.getByRole('button', { name: 'Approve' }).first().click();
await prPage.waitForTimeout(500);
await prPage.getByRole('button', { name: 'Close', exact: true }).click();
await prPage.waitForTimeout(1000);
await buyerPage.goto(`${BASE_URL}/purchase-order-flexi`);
await buyerPage.waitForLoadState('domcontentloaded');
await buyerPage.waitForTimeout(3000);
await buyerPage.getByRole('button', { name: /PO\/\d+\/\d+/ }).first().click();
await buyerPage.waitForLoadState('domcontentloaded');
await buyerPage.waitForTimeout(2000);
}