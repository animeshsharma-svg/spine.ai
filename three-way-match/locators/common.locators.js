export const buttonByName = (page, name, opts = {}) => page.getByRole('button', { name, ...opts });
export const linkByName = (page, name, opts = {}) => page.getByRole('link', { name, ...opts });
export const optionByName = (page, name, opts = {}) => page.getByRole('option', { name, ...opts });
export const menuItemByName = (page, name, opts = {}) => page.getByRole('menuitem', { name, ...opts });
export const tabByName = (page, name, opts = {}) => page.getByRole('tab', { name, ...opts });
export const rowByName = (page, name, opts = {}) => page.getByRole('row', { name, ...opts });
export const textboxByName = (page, name, opts = {}) => page.getByRole('textbox', { name, ...opts });

export const gridRows = (page) => page.locator('.rdg-row');
export const gridRowByText = (page, text) => gridRows(page).filter({ hasText: text });
export const gridCell = (row, columnIndex) => row.locator(`div:nth-child(${columnIndex}) > div`);
export const scrollGridTo = (page, scrollLeft) => page.locator('.rdg').evaluate((el, x) => { el.scrollLeft = x; }, scrollLeft);
export const resetGridScroll = (page) => scrollGridTo(page, 0);


export const gridCellByColIndex = (row, colIndex) => row.locator(`[role="gridcell"][aria-colindex="${colIndex}"]`);

export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The app's select widgets render a search box inside the open dropdown. The
// option list itself is server-capped at ~20 alphabetically-sorted entries, so
// this field is the only way to reach an item further down the catalogue.
export const selectSearchField = (page) => page.locator('input.pro-select-search__field');
