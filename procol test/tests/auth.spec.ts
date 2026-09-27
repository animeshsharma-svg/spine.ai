import { test, expect } from "@playwright/test";

import { login } from "../src/auth/login.js";
import { ApiClient, ApiError } from "../src/api/client.js";
import { CONFIG } from "../src/config.js";
import { declareCase } from "../src/report/caseSpec.js";

/**
 * Milestone 1: prove the auth model end-to-end.
 *   buyer OTP login → 3-segment access token → authenticated GET → 200
 * This spec is self-contained (does its own login) so it does not depend on
 * the `setup` project — it is the smallest possible green.
 */
test.describe("buyer auth", () => {
  test("logs in and reads dashboard configuration", async () => {
    declareCase({
      plain:
        "Sign in as the buyer with a one-time password, then use the session that produces to read the company's dashboard settings.",
      expected:
        "Login returns a usable session token, and reading the dashboard settings with it succeeds.",
      flow: "auth",
      flowTitle: "Authentication & authorization",
      kind: "positive",
      expect: "accept",
      because: "the whole suite depends on this login working",
    });
    // 1) Login as buyer (phone OTP)
    const result = await login({ isVendor: false });

    expect(result.accessToken, "3-segment access token").toBeTruthy();
    expect(result.lightspeedToken, "lightspeed token").toBeTruthy();
    // Sanity: the app builds a 3-segment token → 3 parts once base64-decoded.
    const decoded = Buffer.from(result.accessToken, "base64").toString("utf-8");
    expect(decoded.split(":").length, `decoded token "${decoded}" segments`).toBe(3);

    // 2) Authenticated read. ApiClient.get throws ApiError on non 200–204,
    //    so a resolved, truthy payload IS a 2xx success.
    const api = await ApiClient.create(result);
    try {
      const config = await api.get<Record<string, unknown>>(
        "/v1/dashboard_configuration",
      );
      expect(config, "dashboard_configuration payload").toBeTruthy();
      expect(typeof config).toBe("object");
    } finally {
      await api.dispose();
    }
  });

  test("rejects an authenticated call without a valid token", async () => {
    declareCase({
      plain:
        "Call a protected endpoint with a deliberately bogus session token and see whether the API lets it through.",
      expected:
        "The API refuses the call and the client surfaces that refusal as an error — it does not quietly return data.",
      flow: "auth",
      flowTitle: "Authentication & authorization",
      kind: "negative",
      expect: "reject",
      because: "the error contract must actually fire, not resolve quietly",
    });
    // Build a client with a deliberately bogus token to confirm the error
    // contract (ApiError surfacing error.message) actually fires.
    const api = await ApiClient.create({
      accessToken: Buffer.from("bad:bad:bad").toString("base64"),
      lightspeedToken: "x",
    });
    try {
      await expect(
        api.get("/v1/dashboard_configuration"),
      ).rejects.toBeInstanceOf(ApiError);
    } finally {
      await api.dispose();
    }
  });
});

test.describe.configure({ mode: "serial" });

// Fail fast with a clear message if the active client is not configured.
test.beforeAll(() => {
  const b = CONFIG.identities.buyer;
  if (!CONFIG.baseURL || !b.appKey || !b.appSecret) {
    throw new Error(`Client "${CONFIG.name}" is not configured (see src/config.ts CLIENTS).`);
  }
});
