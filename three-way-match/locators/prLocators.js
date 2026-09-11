import { buttonByName, linkByName, menuItemByName } from './common.locators.js';

export const purchaseRequisitionsNavLink = (page) => linkByName(page, 'Purchase Requisitions');
export const prLinkByNumber = (page) => linkByName(page, /PR-\d+/);
export const firstLineItemCheckbox = (page) => page.getByLabel('', { exact: true }).first();
export const actionsMenuButton = (page) => buttonByName(page, 'Actions icon: down');
export const createPOMenuItem = (page) => menuItemByName(page, 'Create PO');
export const prNumberText = (page) => page.getByText(/Pr No\s+PR-/);
