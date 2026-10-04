import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG, COMPANY_ID, NAV } from "../src/config.js";
import { loginAsCompany } from "../src/db/dbLogin.js";
import { closeDb } from "../src/db/multiClient.js";
import { NetworkCapture } from "../src/crosscheck/capture.js";
import { snapshotScreen } from "../src/crosscheck/screenText.js";
import { FINDINGS_DIR } from "../src/oracle/findings.js";

/**
 * EXPLORATION ONLY — opens a list of console paths one after another and dumps,
 * per path, every API response (tokens masked), the screen's text segments, its
 * tabs and buttons, and a screenshot. Used to write a new cross-check map from
 * real data. Read-only: it navigates, it never clicks anything.
 *
 *   COMPANY_ID=198678 CROSSCHECK_PROBE_URLS="/project/X/details|/project/X/master_qcs" \
 *     npx playwright test tests/crosscheck-probe-urls.spec.ts --project=chromium --no-deps
 */
const urls = (process.env.CROSSCHECK_PROBE_URLS ?? "").split("|").map((s) => s.trim()).filter(Boolean);
test.skip(!urls.length, "set CROSSCHECK_PROBE_URLS");

test.afterAll(async () => {
  await closeDb().catch(() => {});
});

test("probe console paths", async ({ page }) => {
  test.setTimeout(120_000 + urls.length * 60_000);
  const dir = join(FINDINGS_DIR, "crosscheck", `probeu-${Date.now().toString(36)}`);
  mkdirSync(dir, { recursive: true });
  if (COMPANY_ID) await loginAsCompany(page, Number(COMPANY_ID));
  const cap = new NetworkCapture(page);
  cap.start();
  for (const [i, u] of urls.entries()) {
    const name = `p${i}`;
    cap.setScreen(name);
    await page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}${u}`, NAV).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.locator(".ant-skeleton, .ant-spin-spinning").first().waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(4_000);
    await cap.flush();
    const snap = await snapshotScreen(page);
    const buttons = await page.getByRole("button").allTextContents().catch(() => []);
    const tabs = await page.getByRole("tab").allTextContents().catch(() => []);
    writeFileSync(join(dir, `${name}.screen.json`), JSON.stringify({ path: u, ...snap, buttons, tabs }, null, 2));
    writeFileSync(join(dir, `${name}.network.json`), JSON.stringify(cap.forScreen(name), null, 2));
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true, timeout: 20_000 }).catch(() => {});
    console.log(`[probe] ${name} ${u}: ${snap.segments.length} segments, ${cap.forScreen(name).length} responses, now at ${page.url()}`);
    console.log(`[probe]   tabs: ${tabs.map((t) => t.trim()).filter(Boolean).join(" | ")}`);
  }
  cap.stop();
  console.log(`[probe] wrote ${dir}`);
});
