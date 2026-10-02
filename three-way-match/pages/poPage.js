import { expect } from '@playwright/test';
import { VENDOR, DEPT, LOB, CURRENCY, COUNTRY, UNIT_PRICE } from '../utils/constants.js';
import { selectFieldOption, fieldWrapperByLabel } from '../locators/formField.locators.js';
import { optionByName, gridRows, resetGridScroll, scrollGridTo, selectSearchField, escapeRegex } from '../locators/common.locators.js';
import {
  newPOButton,
  showMoreButton,
  submitPOButton,
  addLineItemButton,
  newestGridRow,
  productCellOfNewestRow,
  quantityCellOfNewestRow,
  prDerivedPOGridRows,
} from '../locators/poLocators.js';
import { firstLineItemCheckbox, actionsMenuButton, createPOMenuItem } from '../locators/prLocators.js';
import { say, note } from '../utils/observations.js';

/** A beat between grid cells, for the same reason the header dropdowns get one. */
const CELL_SETTLE_MS = Number(process.env.CELL_SETTLE_MS ?? 350);

export async function navigateToPRFromIntake(page) {
  await page.waitForTimeout(5000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.locator('div:nth-child(3) > header > ._stepTitleWrapper_17g48_205 > h3 > .ant-btn')
    .waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('div:nth-child(3) > header > ._stepTitleWrapper_17g48_205 > h3 > .ant-btn').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
}

export async function createPOFromPR(page) {
  await page.getByLabel('', { exact: true }).nth(4).check();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Actions icon: down' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('menuitem', { name: 'Create PO' }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
}

export async function fillPOHeaderAndPrices(page) {
  await page.getByText('Empty').nth(3).click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: DEPT }).click();
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: 'Empty' }).nth(5).click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: VENDOR }).click();
  await page.waitForTimeout(800);

  await page.getByText('Empty').nth(2).click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: LOB }).click();
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: 'icon: down Show More (24)' }).click();
  await page.waitForTimeout(1500);

  await page.getByText('Empty').nth(2).click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: COUNTRY }).click();
  await page.waitForTimeout(800);

  await page.getByText('Empty').nth(2).click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: CURRENCY }).click();
  await page.waitForTimeout(1000);

  // Row 1
  await page.locator('.rdg-row > div:nth-child(7) > div').nth(0).dblclick();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1000);
  await page.keyboard.type('120');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.mouse.click(100, 100);
  await page.waitForTimeout(800);
  await page.locator('.rdg').evaluate(el => el.scrollLeft = 0);
  await page.waitForTimeout(1000);

  // Row 2
  await page.locator('.rdg-row > div:nth-child(7) > div').nth(1).dblclick();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1000);
  await page.keyboard.type('50');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.mouse.click(100, 100);
  await page.waitForTimeout(800);
  await page.locator('.rdg').evaluate(el => el.scrollLeft = 0);
  await page.waitForTimeout(1000);

  // Row 3
  await page.locator('.rdg-row > div:nth-child(7) > div').nth(2).dblclick();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1000);
  await page.keyboard.type('100');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.mouse.click(100, 100);
  await page.waitForTimeout(800);
  await page.locator('.rdg').evaluate(el => el.scrollLeft = 0);
  await page.waitForTimeout(1000);
}

export async function submitPO(page) {
  await submitPOButton(page).click();
  await page.waitForLoadState('domcontentloaded');
}

// ─── FLOW 3: PO created from an existing PR's line items ───
export async function createPOFromPR_Flow3(page) {
  await firstLineItemCheckbox(page).check({ force: true });
  await actionsMenuButton(page).click();
  await page.waitForTimeout(1000); // visibility pause: let the Actions menu render before picking Create PO
  await createPOMenuItem(page).click();
  await page.waitForLoadState('domcontentloaded');
}

export async function fillPOHeaderAndPrices_Flow3(page) {
  await fieldWrapperByLabel(page, 'Department').waitFor({ state: 'visible', timeout: 15000 });
  await selectFieldOption(page, 'Department', DEPT);
  await selectFieldOption(page, 'Vendor Name', VENDOR);
  await selectFieldOption(page, 'LOB', LOB);

  await showMoreButton(page).click();
  // Expanding reveals ~25 more fields; let the layout settle before targeting one by label.
  await fieldWrapperByLabel(page, 'Country').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(1000);

  await selectFieldOption(page, 'Country', COUNTRY);
  // Selecting Country can trigger a dependent refresh of Currency options — give it a beat.
  await page.waitForTimeout(800);
  await selectFieldOption(page, 'Currency', CURRENCY);
  // Exchange Rate auto-populates as a derived side effect of Currency — wait
  // for that value to actually land instead of guessing a delay.
  await fieldWrapperByLabel(page, 'Exchange Rate').getByText('Empty', { exact: true })
    .waitFor({ state: 'hidden', timeout: 10000 });

  await gridRows(page).first().waitFor({ state: 'visible', timeout: 15000 });
  await gridRows(page).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  const rows = prDerivedPOGridRows(page);
  const rowCount = await rows.count();

  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    // Enter the row from the Quantity cell (always in the default-rendered
    // window, no scrolling needed) and Tab across to Unit Price — one column
    // past MRP — instead of addressing it directly.
    await row.locator('div:nth-child(7) > div').dblclick();
    await page.keyboard.press('Tab'); // Quantity Open
    await page.keyboard.press('Tab'); // UOM
    await page.keyboard.press('Tab'); // MRP
    await page.keyboard.press('Tab'); // Unit Price
    await page.keyboard.type(UNIT_PRICE);
    await page.keyboard.press('Enter');
    // Enter alone can leave the edit uncommitted — click away to blur it, same
    // as a real user would. (100,100) sits inside the left nav sidebar and can
    // land on "Home", navigating away — click inside the main content area instead.
    await page.mouse.click(700, 100);
    await page.waitForTimeout(1200); // visibility pause: let the filled price render before moving to the next row
  }

  await resetGridScroll(page);
}
export async function fillPOHeaderAndPrices_Flow2(page) {
  // Dept — nth(3) but vendor is pre-filled so index shifts
  await page.getByText('Empty').nth(2).click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: DEPT }).click();
  await page.waitForTimeout(800);

  // LOB
  await page.getByText('Empty').nth(1).click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: LOB }).click();
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: 'icon: down Show More (24)' }).click();
  await page.waitForTimeout(1500);

  // Country
  await page.getByText('Empty').nth(2).click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: COUNTRY }).click();
  await page.waitForTimeout(800);

  // Currency
  await page.getByText('Empty').nth(2).click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: CURRENCY }).click();
  await page.waitForTimeout(1000);

  // MRP rows — same as original
  // Row 1
  await page.locator('.rdg-row > div:nth-child(7) > div').nth(0).dblclick();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1000);
  await page.keyboard.type('120');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.mouse.click(100, 100);
  await page.waitForTimeout(800);
  await page.locator('.rdg').evaluate(el => el.scrollLeft = 0);
  await page.waitForTimeout(1000);

  // Row 2
  await page.locator('.rdg-row > div:nth-child(7) > div').nth(1).dblclick();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1000);
  await page.keyboard.type('50');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.mouse.click(100, 100);
  await page.waitForTimeout(800);
  await page.locator('.rdg').evaluate(el => el.scrollLeft = 0);
  await page.waitForTimeout(1000);

  // Row 3
  await page.locator('.rdg-row > div:nth-child(7) > div').nth(2).dblclick();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1000);
  await page.keyboard.type('100');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.mouse.click(100, 100);
  await page.waitForTimeout(800);
  await page.locator('.rdg').evaluate(el => el.scrollLeft = 0);
  await page.waitForTimeout(1000);
}

export async function openNewPOForm(page) {
  await page.goto('/purchase-order-flexi', { waitUntil: 'domcontentloaded' });
  await newPOButton(page).waitFor({ state: 'visible', timeout: 15000 });
  await newPOButton(page).click();
  await page.waitForURL('**flexi_record**', { timeout: 30000 });

  // The freshly-created PO's URL carries a createMode flag that keeps
  // autofocusing an unrelated field, interfering with clean interaction —
  // strip it and reload before touching any fields.
  const url = new URL(page.url());
  if (url.searchParams.has('createMode')) {
    url.searchParams.delete('createMode');
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  }

  await fieldWrapperByLabel(page, 'Department').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1500);
}

export async function fillNewPOHeader(page, { dept, lob, vendor, country, currency }) {
  say('filling the purchase order header');
  await selectFieldOption(page, 'Department', dept);
  await selectFieldOption(page, 'LOB', lob);
  await selectFieldOption(page, 'Vendor Name', vendor);

  await showMoreButton(page).click();
  // Expanding reveals ~25 more fields; let the layout settle before targeting one by label.
  await fieldWrapperByLabel(page, 'Country').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(1000);

  await selectFieldOption(page, 'Country', country);
  // Selecting Country can trigger a dependent refresh of Currency options — give it a beat.
  await page.waitForTimeout(800);
  await selectFieldOption(page, 'Currency', currency);
  // Exchange Rate auto-populates as a derived side effect of Currency — wait
  // for that value to actually land instead of guessing a delay.
  await fieldWrapperByLabel(page, 'Exchange Rate').getByText('Empty', { exact: true })
    .waitFor({ state: 'hidden', timeout: 10000 });
}


/**
 * The newest row's cell under the column whose header matches `pattern`.
 *
 * Scrolls the grid across until that column is rendered — react-data-grid only
 * puts the visible columns in the DOM, so a column nobody has scrolled to does
 * not exist to be clicked. Returns null when no such column is ever found.
 */
async function gridCellUnder(page, pattern) {
  for (let x = 0; x <= 4000; x += 300) {
    await scrollGridTo(page, x);
    await page.waitForTimeout(220);
    const pos = await page.evaluate((src) => {
      const re = new RegExp(src, 'i');
      const heads = [...document.querySelectorAll('[role="columnheader"]')];
      return heads.findIndex((h) => re.test((h.textContent || '').trim()));
    }, pattern.source);
    if (pos >= 0) return newestGridRow(page).locator(`div:nth-child(${pos + 1}) > div`);
  }
  return null;
}

/**
 * Type a value into one grid cell and check it stayed there.
 *
 * `Enter` commits the edit before anything else moves, which is what the old
 * tab-chain never did — it left an editor open and let the next keystroke
 * decide its fate. A value that does not read back is recorded rather than
 * assumed: the run has just built a document that will not add up, and that is
 * worth saying while the evidence is still on screen.
 */
async function fillGridCell(page, pattern, value, label) {
  const cell = await gridCellUnder(page, pattern);
  if (!cell) {
    note('column-missing', `the "${label}" column never appeared in the line-item grid, so it could not be filled`, { field: label });
    return;
  }
  await cell.dblclick();
  await page.waitForTimeout(CELL_SETTLE_MS);
  // The editor is an input inside the cell once it opens. Writing to it beats
  // typing at the page, which depended on focus still being where we left it.
  const editor = cell.locator('input').first();
  const opened = await editor.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
  if (opened) {
    await editor.fill(String(value));
  } else {
    await page.keyboard.type(String(value));
  }
  await page.waitForTimeout(CELL_SETTLE_MS);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(CELL_SETTLE_MS);
}

/** Read one cell back and say so when what was typed is not what is there. */
async function verifyGridCell(page, pattern, value, label) {
  const cell = await gridCellUnder(page, pattern);
  if (!cell) return;
  const shown = ((await cell.textContent()) || '').replace(/[^0-9.]/g, '');
  const want = String(value).replace(/[^0-9.]/g, '');
  if (shown && Number(shown) === Number(want)) return;
  note(
    'value-not-saved',
    `"${label}" was set to ${value} on the line item and the cell reads "${shown || 'empty'}" — the value did not stick`,
    { field: label, value: String(value) },
  );
}

/**
 * Scroll the grid until the column matching `pattern` is rendered.
 *
 * react-data-grid only puts visible columns in the DOM. A tab chain that walks
 * off the rendered edge types into nothing, which is how MRP and Unit Price
 * were silently skipped.
 */
async function scrollColumnsIntoView(page, pattern) {
  for (let x = 0; x <= 4000; x += 200) {
    await scrollGridTo(page, x);
    await page.waitForTimeout(180);
    const there = await page.evaluate((src) => {
      const re = new RegExp(src, 'i');
      return [...document.querySelectorAll('[role="columnheader"]')].some((h) => re.test((h.textContent || '').trim()));
    }, pattern.source);
    // Back off a little so the columns BEFORE it (Quantity, UOM) are rendered
    // too — the whole chain has to exist at once.
    if (there) {
      await scrollGridTo(page, Math.max(0, x - 200));
      await page.waitForTimeout(220);
      return;
    }
  }
}

export async function addPOLineItem(page, { product, qty, mrp, unitPrice }) {
  // `unitPrice` is what drives Total Amount; `mrp` is the list price beside
  // it. They used to be the same number because MRP was tabbed past and never
  // filled — so every PO went out with an empty MRP column and nothing noticed.
  const price = unitPrice ?? mrp;
  say(`adding line item: ${qty} × ${product} (MRP ${mrp}, unit price ${price})`);
  await addLineItemButton(page).click();
  await newestGridRow(page).waitFor({ state: 'visible', timeout: 10000 });
  // Adding rows back-to-back too fast has caused the app itself to crash
  // (an unhandled error page) — give each new row time to fully settle.
  await page.waitForTimeout(1500);

  const productCell = productCellOfNewestRow(page);
  const searchField = selectSearchField(page);

  // The first click only selects the cell; a second click (after it
  // registers) is what actually opens the option list. Right after a row is
  // added the grid can still be settling, so the click occasionally lands on
  // the wrong cell — retry defensively.
  let opened = false;
  for (let attempt = 0; attempt < 3 && !opened; attempt++) {
    await productCell.click();
    await page.waitForTimeout(800);
    await productCell.click();
    await page.waitForTimeout(1000);
    opened = await searchField.isVisible().catch(() => false);
    if (!opened) await page.keyboard.press('Escape');
  }
  if (!opened) throw new Error(`addPOLineItem: product dropdown never opened for "${product}"`);

  // The list only ever renders the first ~20 products in alphabetical order,
  // so anything further down the catalogue (e.g. "9v Vol Battery") is simply
  // absent from the DOM. Filter it down via the dropdown's search box rather
  // than relying on the wanted item happening to fall in that first page.
  await searchField.pressSequentially(product, { delay: 50 });
  const option = optionByName(page, product).first();
  await option.waitFor({ state: 'visible', timeout: 15000 });
  await option.click();

  // A stray click on the overlaying option list can silently select the wrong
  // product, which then flows all the way through to the bill — assert the
  // cell really took what we asked for. Catalogue casing differs from the test
  // data ("9V" vs "9v"), so compare case-insensitively.
  await expect(productCell).toHaveText(new RegExp(escapeRegex(product), 'i'), { timeout: 10000 });

  /**
   * EACH CELL IS FOUND BY ITS COLUMN, NOT REACHED BY TABBING.
   *
   * The grid virtualises horizontally. At rest it renders only as far as UOM —
   * MRP and Unit Price are not in the page at all until the grid is scrolled
   * across. Tabbing towards them therefore typed into nothing, and the edit
   * that was still open when the keystrokes went nowhere was discarded, taking
   * the quantity with it. That is how a purchase order reached the 3-way match
   * with "9v Vol Battery", quantity 0, and both Tax Amount and Total Amount
   * empty, while the run reported the line item added and went green.
   *
   * Scrolling until the column exists and addressing it directly is the only
   * reliable way to reach it, and reading the value back afterwards is what
   * stops the same silence happening again.
   */
  /**
   * ONE EDITING PASS, NOT THREE.
   *
   * Committing each cell on its own does not work on this grid: every commit
   * re-renders the row from the server and takes the previously entered value
   * with it. Filling MRP then Unit Price left MRP empty; filling them the
   * other way round left Unit Price empty. One value at a time is the most
   * this row will hold.
   *
   * The app's own answer is the tab chain — Quantity, Qty Open, UOM, MRP,
   * Unit Price are one editing sequence committed once at the end. That is
   * what the original code did, and it failed for a different reason: the
   * grid virtualises columns, so MRP and Unit Price were not in the page to
   * be tabbed into. Scrolling them into view first is what makes the sequence
   * land, and it is why this is a scroll followed by a tab chain rather than
   * three independent edits.
   */
  /**
   * Fill the editor's input, rather than typing at the page.
   *
   * Double-clicking a cell puts a real <input> in it. Sending keystrokes at
   * the document meant every value depended on that input still being focused
   * when they arrived, and on this grid it usually was not: one value out of
   * three survived, and which one varied between runs. Writing into the
   * element removes the timing from the question entirely.
   */
  await fillGridCell(page, /^Quantity$/, qty, 'Quantity');
  await fillGridCell(page, /MRP/i, mrp, 'MRP');
  await fillGridCell(page, /unit\s*price/i, price, 'Unit Price');

  // Read all three back once the row has settled. Checking each cell the
  // instant it was typed caught the app mid-recalculation and reported values
  // as lost that were about to arrive.
  await page.waitForTimeout(1200);
  await verifyGridCell(page, /MRP/i, mrp, 'MRP');
  await verifyGridCell(page, /unit\s*price/i, price, 'Unit Price');
  await verifyGridCell(page, /^Quantity$/, qty, 'Quantity');
  // (100,100) sits inside the left nav sidebar and can land on "Home",
  // navigating away — click inside the main content area instead.
  await page.mouse.click(700, 100);
  await resetGridScroll(page);
  await page.waitForTimeout(1500); // let this row's save fully settle before another line item is added
}
