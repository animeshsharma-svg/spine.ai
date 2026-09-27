import { buttonByName, gridRows, gridCell, resetGridScroll } from './common.locators.js';

export const createInvoiceButton = (page) => buttonByName(page, 'Create Invoice');
export const submitInvoiceButton = (page) => buttonByName(page, 'Submit Invoice');
export const invoiceGridRows = (page) => gridRows(page);
export const invoicePriceCell = (row, columnIndex) => gridCell(row, columnIndex);
export { resetGridScroll };
