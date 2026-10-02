import { test as base } from "@playwright/test";

import { ApiClient, AuthTokens } from "./api/client.js";
import { BUYER_AUTH_FILE, loadAuth } from "./auth/store.js";

interface Fixtures {
  /** Buyer tokens loaded from the setup project's cached file. */
  buyerTokens: AuthTokens;
  /** Authenticated buyer API client (wraps Playwright's request fixture). */
  buyerApi: ApiClient;
}

export const test = base.extend<Fixtures>({
  buyerTokens: async ({}, use) => {
    const cached = loadAuth(BUYER_AUTH_FILE);
    await use({
      accessToken: cached.accessToken,
      lightspeedToken: cached.lightspeedToken,
      userUuid: cached.userUuid,
      companyUuid: cached.companyUuid,
    });
  },
  buyerApi: async ({ request, buyerTokens }, use) => {
    const client = ApiClient.wrap(request, buyerTokens, { identity: "buyer" });
    await use(client);
  },
});

export { expect } from "@playwright/test";
