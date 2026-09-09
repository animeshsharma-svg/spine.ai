import { test as setup, expect } from "@playwright/test";

import { login } from "../src/auth/login.js";
import { CONFIG } from "../src/config.js";
import { BUYER_AUTH_FILE, saveAuth } from "../src/auth/store.js";

setup("authenticate buyer", async () => {
  const result = await login({ isVendor: false });

  expect(result.accessToken, "buyer access token").toBeTruthy();
  expect(result.lightspeedToken, "lightspeed token").toBeTruthy();

  saveAuth(BUYER_AUTH_FILE, {
    client: CONFIG.name,
    accessToken: result.accessToken,
    lightspeedToken: result.lightspeedToken,
    userUuid: result.userUuid,
    companyUuid: result.companyUuid,
  });
});
