import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMPANY_ID } from "../src/config.js";
import { loginAsCompany } from "../src/db/dbLogin.js";
import { closeDb } from "../src/db/multiClient.js";
import { EventsPage } from "../src/pages/EventsPage.js";
import { NetworkCapture } from "../src/crosscheck/capture.js";
import { snapshotScreen } from "../src/crosscheck/screenText.js";
import { encodeProcolId } from "../src/crosscheck/ids.js";
import { FINDINGS_DIR } from "../src/oracle/findings.js";

/**
 * EXPLORATION ONLY — walks an event's screens and dumps what the API sent and
 * what the screen showed, so the field map can be written from real data.
 * Read-only: it opens screens and tabs, it never submits anything.
 *
 *   COMPANY_ID=198678 CROSSCHECK_TITLE=<title> npx playwright test tests/crosscheck-probe.spec.ts --project=chromium --no-deps
 */
const title = process.env.CROSSCHECK_TITLE;
test.skip(!title || process.env.CROSSCHECK_PROBE !== "1", "probe needs CROSSCHECK_PROBE=1 and CROSSCHECK_TITLE");

test.afterAll(async () => {
  await closeDb().catch(() => {});
});

test("probe an event's screens", async ({ page }) => {
  test.setTimeout(600_000);
  const dir = join(FINDINGS_DIR, "crosscheck", `probe-${Date.now().toString(36)}`);
  mkdirSync(dir, { recursive: true });
  if (COMPANY_ID) await loginAsCompany(page, Number(COMPANY_ID));
  const cap = new NetworkCapture(page);
  cap.start();
  const dump = async (name: string) => {
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(2_500);
    await cap.flush();
    const snap = await snapshotScreen(page);
    const buttons = await page.getByRole("button").allTextContents().catch(() => []);
    const tabs = await page.getByRole("tab").allTextContents().catch(() => []);
    writeFileSync(join(dir, `${name}.screen.json`), JSON.stringify({ ...snap, buttons, tabs }, null, 2));
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true }).catch(() => {});
    console.log(`[probe] ${name}: ${snap.segments.length} segments, ${cap.forScreen(name).length} responses, url ${page.url()}`);
  };

  const events = new EventsPage(page);
  cap.setScreen("list");
  await events.goto();
  await events.searchByTitle(title!);
  await page.locator(".ant-skeleton").first().waitFor({ state: "hidden", timeout: 45_000 }).catch(() => {});
  await dump("list");

  cap.setScreen("detail");
  const id = process.env.CROSSCHECK_EVENT_ID;
  if (id) await events.openEvent({ id: /^\d+$/.test(id) ? encodeProcolId(Number(id)) : id });
  else await events.openEvent({ title: title! });
  await dump("detail");

  const tabNames = (await page.getByRole("tab").allTextContents()).map((t) => t.trim()).filter(Boolean);
  console.log(`[probe] tabs: ${tabNames.join(" | ")}`);
  for (let i = 0; i < tabNames.length && i < 8; i++) {
    const name = `tab${i}-${tabNames[i].replace(/[^a-z0-9]+/gi, "_").slice(0, 20)}`;
    cap.setScreen(name);
    await page.getByRole("tab").nth(i).click({ timeout: 10_000 }).catch((e) => console.log(`[probe] tab click failed: ${e.message}`));
    await dump(name);
    const sub = (await page.getByRole("tab").allTextContents()).map((t) => t.trim()).filter(Boolean);
    console.log(`[probe] tabs now: ${sub.join(" | ")}`);
    if (sub.length > tabNames.length && process.env.CROSSCHECK_SUBTABS === "1") {
      for (let j = tabNames.length + 1; j < sub.length; j++) {
        const sname = `${name}-sub${j}-${sub[j].replace(/[^a-z0-9]+/gi, "_").slice(0, 20)}`;
        cap.setScreen(sname);
        await page.getByRole("tab").nth(j).click({ timeout: 10_000 }).catch((e) => console.log(`[probe] sub click failed: ${e.message}`));
        await dump(sname);
      }
    }
  }

  writeFileSync(join(dir, "network.json"), JSON.stringify(cap.responses, null, 2));
  console.log(`[probe] wrote ${dir}`);
});
