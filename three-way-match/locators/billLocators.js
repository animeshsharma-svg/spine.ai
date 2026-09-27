import { buttonByName, menuItemByName } from './common.locators.js';

export const backButton = (page) => buttonByName(page, 'icon: arrow-left');
export const actionsDropdownTrigger = (page) => page.locator('.pro-btn.pro-dropdown-trigger').first();
export const createBillMenuItem = (page) => menuItemByName(page, 'Create Bill');
export const viewDraftBillButton = (page) => buttonByName(page, 'View Draft Bill');
export const submitBillButton = (page) => buttonByName(page, 'Submit Bill');
