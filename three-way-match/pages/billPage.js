import { backButton, actionsDropdownTrigger, createBillMenuItem, viewDraftBillButton, submitBillButton } from '../locators/billLocators.js';
import { say } from '../utils/observations.js';

export async function createAndSubmitBill(page) {
  await backButton(page).click();
  await page.waitForLoadState('domcontentloaded');
  say('creating the bill from the matched documents');
  await actionsDropdownTrigger(page).click();
  await createBillMenuItem(page).click();
  await page.waitForLoadState('domcontentloaded');
  say('opening the draft bill');
  await viewDraftBillButton(page).click();
  await page.waitForLoadState('domcontentloaded');
  say('submitting the bill');
  await submitBillButton(page).click();
}