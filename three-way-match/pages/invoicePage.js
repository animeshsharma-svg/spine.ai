import { createInvoiceButton, submitInvoiceButton, invoiceGridRows } from '../locators/invoiceLocators.js';
import { escapeRegex } from '../locators/common.locators.js';
import { UNIT_PRICE } from '../utils/constants.js';
import { say } from '../utils/observations.js';

export async function createAndSubmitInvoice(page) {
  await page.getByRole('button', { name: 'Create Invoice' }).waitFor({ state: 'visible', timeout: 18000 });
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Create Invoice' }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);

  await page.locator('.rdg-row').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Row 1: Academic Textbook → 120
  await page.locator('.rdg-row > div:nth-child(8) > div').nth(0).click();
  await page.waitForTimeout(500);
  await page.locator('.rdg-row > div:nth-child(8) > div').nth(0).dblclick();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1000);
  await page.keyboard.type('120');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // Row 2: 9v Vol Battery → 50
  await page.locator('.rdg-row > div:nth-child(8) > div').nth(1).click();
  await page.waitForTimeout(500);
  await page.locator('.rdg-row > div:nth-child(8) > div').nth(1).dblclick();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1000);
  await page.keyboard.type('50');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // Row 3: Business Laptop → 100
  await page.locator('div:nth-child(5) > div:nth-child(8) > div').click();
  await page.waitForTimeout(500);
  await page.locator('div:nth-child(5) > div:nth-child(8) > div').dblclick();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1000);
  await page.keyboard.type('100');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: 'Submit Invoice' }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(8000);
}

export async function createAndSubmitInvoice_Flow3(page) {
  await createInvoiceButton(page).waitFor({ state: 'visible', timeout: 18000 });
  await createInvoiceButton(page).click();
  await page.waitForLoadState('domcontentloaded');

  const rows = invoiceGridRows(page);
  await rows.first().waitFor({ state: 'visible', timeout: 15000 });
  await rows.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500); // visibility pause: let the invoice line item render before editing it
  const rowCount = await rows.count();

  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);

    // Quantity: read whatever value is already carried over from the PO, and
    // try to re-confirm it the same way as price. If it turns out not to be
    // directly editable here, this is skipped rather than hanging.
    const currentQty = ((await row.locator('div:nth-child(7) > div').textContent()) || '').trim();
    if (currentQty) {
      const qtyButton = row.getByRole('button', { name: currentQty, exact: true }).first();
      if (await qtyButton.count() > 0) {
        await qtyButton.dblclick();
        await page.waitForTimeout(600);
        const qtyTextbox = row.getByRole('textbox').first();
        if (await qtyTextbox.count() > 0) {
          await qtyTextbox.fill(currentQty);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(1000);
        } else {
          await page.keyboard.press('Escape');
        }
      }
    }

    // Price: addressed by its current carried-over value (e.g. "₹ 100") —
    // dynamic and scoped per-row, matching the same technique used for the
    // direct-PO flow.
    await row.getByRole('button', { name: `₹ ${UNIT_PRICE}` }).first().dblclick();
    await row.getByRole('textbox').first().fill(UNIT_PRICE);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
  }

  // Click the results-count label to blur — always present, never a nav link.
  await page.getByText(/Showing \d+ out of \d+ results/).click();
  await page.waitForTimeout(1500); // visibility pause: let the row settle before submitting

  await submitInvoiceButton(page).click();
  await page.waitForLoadState('domcontentloaded');
  // Submission is async — "Create GRN" can render before it's actually
  // clickable, silently no-op-ing the next step. Wait for the real signal.
  await page.getByText('Approved').first().waitFor({ state: 'visible', timeout: 20000 });
}

export async function createAndSubmitInvoice_Flow4(page, lineItems = [
  { product: 'Vol Battery', price: '50' },
  { product: 'Coconut Water', price: '90' },
  { product: 'Gypsum Board', price: '1000' },
]) {
  await createInvoiceButton(page).waitFor({ state: 'visible', timeout: 18000 });
  await createInvoiceButton(page).click();
  await page.waitForLoadState('domcontentloaded');

  await invoiceGridRows(page).first().waitFor({ state: 'visible', timeout: 15000 });
  await invoiceGridRows(page).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  const rowByProduct = (product) => page.getByRole('row', { name: new RegExp(escapeRegex(product), 'i') });

  // Price is addressed by its current carried-over value (e.g. "₹ 50") —
  // dynamic and scoped per-row, so it survives row order/position changes.
  // Quantity isn't directly editable here (confirmed: dblclicking it opens no
  // textbox) — it already carries over correctly from the PO, so it's left alone.
  say(`invoice opened — pricing ${lineItems.length} line(s)`);
  let priced = 0;
  for (const { product, price } of lineItems) {
    const row = rowByProduct(product);
    await row.getByRole('button', { name: `₹ ${price}` }).first().dblclick();
    await row.getByRole('textbox').first().fill(price);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    say(`priced ${++priced} of ${lineItems.length}: ${product} at ₹${price}`);
  }

  // Click the results-count label to blur — always present, never a nav link.
  await page.getByText(/Showing \d+ out of \d+ results/).click();
  await page.waitForTimeout(1000);

  await submitInvoiceButton(page).click();
  await page.waitForLoadState('domcontentloaded');
  await page.getByText('Approved').first().waitFor({ state: 'visible', timeout: 20000 });
}