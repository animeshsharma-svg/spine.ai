import { test as base, expect } from '@playwright/test';
import { login } from '../pages/loginPage.js';

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
});

export { expect };