import { BASE_URL, PHONE, PASSWORD } from '../utils/constants.js';
import { phoneInput, passwordInput, sendOtpButton, loginButton } from '../locators/loginLocators.js';

export async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await phoneInput(page).fill(PHONE);
  await sendOtpButton(page).click();
  await passwordInput(page).waitFor({ state: 'visible', timeout: 10000 });
  await passwordInput(page).fill(PASSWORD);
  await loginButton(page).click();
  await page.waitForURL('**/home', { timeout: 30000 });
}