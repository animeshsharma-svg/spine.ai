import type { Locator, Page } from "@playwright/test";

/**
 * Fill the price cells of a bid-style sheet inside `scope`.
 *
 * The surrogate-bid drawer, the vendor portal's bid sheet and the counter-offer
 * drawer all render the same sheet component: `data-celltype="price"` cells
 * that open an input on click (or double-click), plus a participant-quantity
 * column. One filler for all of them, so a change to the sheet is fixed once.
 * Returns how many cells were filled; 0 means the sheet shape is unknown and
 * the caller should say so rather than claim a bid.
 */
export async function fillSheetPrices(page: Page, scope: Locator, price: number, quantity = "1"): Promise<number> {
  const cells = scope.locator(
    '[data-celltype="price"]:not([data-testid^="sheet-header"]), [data-celltype="participant_quantity"]:not([data-testid^="sheet-header"])',
  );
  let filled = 0;
  const total = await cells.count();
  for (let i = 0; i < total; i++) {
    const cell = cells.nth(i);
    if ((await cell.getAttribute("aria-disabled")) === "true") continue;
    const type = await cell.getAttribute("data-celltype");
    const value = type === "price" ? String(price) : quantity;
    await cell.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
    await cell.click({ timeout: 5_000 }).catch(() => {});
    let input = cell.locator("input, textarea").first();
    if (!(await input.count())) {
      await cell.dblclick({ timeout: 5_000 }).catch(() => {});
      input = cell.locator("input, textarea").first();
    }
    if (!(await input.count())) continue;
    await input.fill(value).catch(() => {});
    await page.keyboard.press("Tab").catch(() => {});
    filled++;
  }
  if (!filled) {
    const inputs = scope.locator("input[type='number'], input.ant-input-number-input");
    for (let i = 0; i < (await inputs.count()); i++) {
      await inputs.nth(i).fill(String(price)).catch(() => {});
      filled++;
    }
  }
  return filled;
}
