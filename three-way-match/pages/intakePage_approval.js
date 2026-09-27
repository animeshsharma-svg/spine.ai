// intakePage_approval.js — approves intake using a separate browser context
// Buyer stays logged in and on the same page throughout — no logout needed

import { BASE_URL, APPROVER_PHONE, APPROVER_PASSWORD } from '../utils/constants.js';

export async function approveIntakeWithSecondAccount(page) {
  // Open a brand new browser context = separate session
  const approverContext = await page.context().browser().newContext();
  const approverPage = await approverContext.newPage();

  // ── Login as approver ──
  await approverPage.goto(`${BASE_URL}/login`);
  await approverPage.waitForLoadState('domcontentloaded');
  await approverPage.waitForTimeout(1000);

  await approverPage.getByRole('textbox', { name: 'phone' }).fill(APPROVER_PHONE);
  await approverPage.getByRole('button', { name: 'Send OTP' }).click();
  await approverPage.waitForTimeout(500);
  await approverPage.getByRole('textbox', { name: 'password' }).fill(APPROVER_PASSWORD);
  await approverPage.getByRole('button', { name: 'Login' }).click();
  await approverPage.waitForLoadState('domcontentloaded');
  await approverPage.waitForTimeout(2000);

  // ── Click notification bell → Approve ──
  await approverPage.getByRole('button').nth(3).click();
  await approverPage.waitForTimeout(500);
  await approverPage.getByRole('button', { name: 'Approve' }).first().click();
  await approverPage.waitForTimeout(1000);

  // ── Close approver context — buyer page completely unaffected ──
  await approverContext.close();
}