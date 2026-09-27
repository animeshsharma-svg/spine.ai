import { expect } from '@playwright/test';
import { purchaseRequisitionsNavLink, prLinkByNumber } from '../locators/prLocators.js';

export async function navigateToPRFromIntake(page) {
  // Click the PR step button from intake detail page
  await page.locator('div:nth-child(3) > header > ._stepTitleWrapper_17g48_205 > h3 > .ant-btn').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
}

export async function openFirstPRAndGetPage(page) {
  // PR link opens in a new tab — capture popup
  const [prPage] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('link', { name: /PR-/ }).first().click(),
  ]);
  await prPage.waitForLoadState('domcontentloaded');
  await prPage.waitForTimeout(2000);
  return prPage;
}

  export async function createEventFromPR(prPage) {
  // Select the PR line item
  await prPage.getByLabel('', { exact: true }).nth(4).check();

  // Purchase Items button
  const purchaseItemsBtn = prPage.getByRole('button', {
    name: /Purchase/i,
  });

  await expect(purchaseItemsBtn).toBeEnabled();
  await purchaseItemsBtn.click();

  // Purchase Item
  await prPage.getByText('Purchase Item', { exact: true }).click();

  // Start New Project
  await prPage.getByText('Start New Project').click();

  // Create Project popup
  await prPage.getByRole('button', { name: 'Create Project' }).click();

  // Select RFQ
  await prPage
    .getByRole('menuitem', { name: 'RFQ' })
    
    .getByRole('checkbox')
    .check();

  // Final Create Project
  await prPage.getByRole('button', { name: 'Create Project' }).click();

  await prPage.waitForLoadState('networkidle');
}
//   await prPage.getByRole('columnheader').filter({ hasText: /^$/ }).nth(1).click();
//   await prPage.waitForTimeout(500);

//  const purchaseItemsBtn = prPage.getByRole('button', { name: /Purchase Items/ });
//   await expect(purchaseItemsBtn).toBeEnabled();
//    await purchaseItemsBtn.click();

//   await prPage.getByText('Purchase Item', { exact: true }).click();
//   await prPage.waitForLoadState('domcontentloaded');
//   await prPage.waitForTimeout(1500);
//   await prPage.getByText('Start New Project').click();
//   await prPage.waitForLoadState('domcontentloaded');
//   await prPage.waitForTimeout(1500);
//   await prPage.getByRole('button', { name: 'Create Project' }).click();
//   await prPage.waitForTimeout(1000);

//   // Select RFQ
//   await prPage.getByRole('menuitem', { name: 'RFQ' }).getByLabel('', { exact: true }).check();
//   await prPage.waitForTimeout(500);
//   await prPage.getByRole('button', { name: 'Create Project' }).click();
//   await prPage.waitForLoadState('domcontentloaded');
//   await prPage.waitForTimeout(2000);


export async function navigateToPRList(page) {
  await purchaseRequisitionsNavLink(page).click();
  await page.waitForLoadState('domcontentloaded');
}

export async function openFirstPR(page) {
  // Repeated test runs consume PRs (their line items get checked off and
  // locked once a PO exists), so the very first PR in the list may no longer
  // have anything available. Walk the list until one actually does.
  const prLinks = prLinkByNumber(page);
  const linkCount = await prLinks.count();

  for (let i = 0; i < linkCount; i++) {
    const [prPage] = await Promise.all([
      page.context().waitForEvent('page'),
      prLinks.nth(i).click(),
    ]);
    await prPage.waitForLoadState('domcontentloaded');
    await prPage.waitForTimeout(1000);

    const checkbox = prPage.getByLabel('', { exact: true }).first();
    const isDisabled = await checkbox.isDisabled().catch(() => true);
    if (!isDisabled) {
      return prPage;
    }
    await prPage.close();
  }

  throw new Error('openFirstPR: no PR with an available line item was found — every PR in the list has already been used.');
}