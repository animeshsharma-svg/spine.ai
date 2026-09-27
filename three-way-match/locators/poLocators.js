import { buttonByName, gridRows, gridCell } from './common.locators.js';

export const newPOButton = (page) => buttonByName(page, 'icon: plus New');
export const showMoreButton = (page) => buttonByName(page, /Show More/);
export const submitPOButton = (page) => buttonByName(page, 'Submit PO');
export const addLineItemButton = (page) => buttonByName(page, 'icon: plus New');


export const PO_GRID_COLUMNS = { PRODUCT: 2, QUANTITY_ENTRY: 7 };


export const newestGridRow = (page) => gridRows(page).first();
export const productCellOfNewestRow = (page) => gridCell(newestGridRow(page), PO_GRID_COLUMNS.PRODUCT);
export const quantityCellOfNewestRow = (page) => gridCell(newestGridRow(page), PO_GRID_COLUMNS.QUANTITY_ENTRY);


export const prDerivedPOGridRows = (page) => gridRows(page);
