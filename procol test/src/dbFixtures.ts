import { test as base } from "@playwright/test";

import { ClientContext, resolveClientContext } from "./context.js";
import type { ApiClient } from "./api/client.js";

/**
 * DB-driven fixtures. Resolve the client (COMPANY_ID) for the test:
 *   DB session → buyer API → catalog → vendor → evaluator.
 * Tests just use `client` / `buyerApi` — no credentials, no SQL, no hardcoding.
 *
 *   COMPANY_ID=39490 npx playwright test tests/clients
 */
export const test = base.extend<{ client: ClientContext; buyerApi: ApiClient }>({
  client: async ({}, use) => {
    const ctx = await resolveClientContext();
    await use(ctx);
    await ctx.dispose();
  },
  buyerApi: async ({ client }, use) => {
    await use(client.buyerApi);
  },
});

export { expect } from "@playwright/test";
