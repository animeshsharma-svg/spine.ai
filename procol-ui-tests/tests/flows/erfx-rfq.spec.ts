import { test } from "@playwright/test";
import { CONFIG } from "../../src/config.js";
import { ClientConfig } from "../../src/master/config.js";
import { erfxRfqFlow } from "../../src/flows/erfxRfq.js";

/** Focused, always-on spec for the RFQ create-and-publish flow. */
test(`${erfxRfqFlow.key} — ${erfxRfqFlow.title}`, async ({ page }) => {
  const config = await ClientConfig.load(CONFIG);
  const g = erfxRfqFlow.enabledFor(config);
  test.skip(!g.enabled, `disabled for ${CONFIG.name}: ${g.reason}`);
  await erfxRfqFlow.run({ page, profile: CONFIG, config });
});
