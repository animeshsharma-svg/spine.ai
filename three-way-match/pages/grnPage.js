import { createGRNButton, submitGRNButton, grnGridRows } from '../locators/grnLocators.js';
import { escapeRegex } from '../locators/common.locators.js';
import { say } from '../utils/observations.js';

// Fixed test value for Quantity Accepted — simpler and more reliable across
// environments than matching the exact ordered quantity.
const GRN_QUANTITY_ACCEPTED = '10';

export async function createAndSubmitGRN(page) {
  await page.getByRole('button', { name: 'Create GRN' }).waitFor({ state: 'visible', timeout: 18000 });
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Create GRN' }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);

  await page.locator('.rdg-row').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Row 1: Academic Textbook → 10
  await page.getByRole('row', { name: 'Academic Textbook 10.0' }).getByRole('button').nth(1).click();
  await page.waitForTimeout(400);
  await page.getByRole('row', { name: 'Academic Textbook 10.0' }).getByRole('button').nth(1).click();
  await page.waitForTimeout(400);
  await page.getByRole('row', { name: 'Academic Textbook 10.0' }).getByRole('textbox').fill('10');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  // Row 2: 9v Vol Battery → 50
  await page.getByRole('row', { name: '9v Vol Battery 50.0 9v Vol Battery' }).getByRole('button').nth(1).click();
  await page.waitForTimeout(400);
  await page.getByRole('row', { name: '9v Vol Battery 50.0 9v Vol Battery' }).getByRole('button').nth(1).click();
  await page.waitForTimeout(400);
  await page.getByRole('row', { name: '9v Vol Battery 50.0 9v Vol Battery' }).getByRole('textbox').fill('50');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  // Row 3: Business Laptop → 100
  await page.getByRole('row', { name: 'Business Laptop 14inch i7 100.0 Business Laptop 14inch i7' }).getByRole('button').nth(1).click();
  await page.waitForTimeout(400);
  await page.getByRole('row', { name: 'Business Laptop 14inch i7 100.0 Business Laptop 14inch i7' }).getByRole('button').nth(1).click();
  await page.waitForTimeout(400);
  await page.getByRole('row', { name: 'Business Laptop 14inch i7 100.0 Business Laptop 14inch i7' }).getByRole('textbox').fill('100');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

// ─── FLOW 3 ───

export async function createAndSubmitGRN_Flow3(page) {
  await createGRNButton(page).waitFor({ state: 'visible', timeout: 18000 });
  await createGRNButton(page).click();
  await page.waitForLoadState('domcontentloaded');

  await grnGridRows(page).first().waitFor({ state: 'visible', timeout: 15000 });
  await grnGridRows(page).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  const rows = grnGridRows(page);
  const rowCount = await rows.count();

  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    await row.locator('div:nth-child(3) > div').click();
    await page.waitForTimeout(1000);
    await row.getByRole('textbox').first().fill(GRN_QUANTITY_ACCEPTED);
    await page.waitForTimeout(800);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(1000);

  await page.getByText(/Showing \d+ out of \d+ results/).click();
  await page.waitForTimeout(1000);

  say('submitting the goods receipt');
  await submitGRNButton(page).click();
  await page.waitForLoadState('domcontentloaded');
}

export async function createAndSubmitGRN_Flow4(page, lineItems = [
  { product: 'Vol Battery', qty: '50' },
  { product: 'Coconut Water', qty: '12' },
  { product: 'Gypsum Board', qty: '100' },
]) {
  await createGRNButton(page).waitFor({ state: 'visible', timeout: 18000 });
  await createGRNButton(page).click();
  await page.waitForLoadState('domcontentloaded');

  await grnGridRows(page).first().waitFor({ state: 'visible', timeout: 15000 });
  await grnGridRows(page).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  
  say(`goods receipt opened — recording ${lineItems.length} received line(s)`);
  let done = 0;
  for (const { product, qty } of lineItems) {
    const row = page.getByRole('row', { name: new RegExp(escapeRegex(product), 'i') });
    await row.locator('div:nth-child(3) > div').click();
    await page.waitForTimeout(1000);
    await row.getByRole('textbox').first().fill(qty);
    await page.waitForTimeout(800);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    say(`received ${++done} of ${lineItems.length}: ${qty} × ${product}`);
  }
  await page.waitForTimeout(1000);

  await page.getByText(/Showing \d+ out of \d+ results/).click();
  await page.waitForTimeout(1000);

  await submitGRNButton(page).click();
  await page.waitForLoadState('domcontentloaded');
}