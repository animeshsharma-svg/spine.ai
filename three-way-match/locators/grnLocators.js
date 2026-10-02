import { buttonByName, gridRows } from './common.locators.js';

export const createGRNButton = (page) => buttonByName(page, 'Create GRN');
export const submitGRNButton = (page) => buttonByName(page, 'Submit GRN');
export const grnGridRows = (page) => gridRows(page);
export const grnRowEditButton = (row) => row.getByRole('button').nth(1);
export const grnRowQtyTextbox = (row) => row.getByRole('textbox');
