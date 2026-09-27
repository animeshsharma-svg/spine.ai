import { buttonByName, textboxByName } from './common.locators.js';

export const phoneInput = (page) => textboxByName(page, 'phone');
export const passwordInput = (page) => textboxByName(page, 'password');
export const sendOtpButton = (page) => buttonByName(page, 'Send OTP');
export const loginButton = (page) => buttonByName(page, 'Login');
