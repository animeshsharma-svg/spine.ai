import type { Page } from "@playwright/test";
import { BASE, PO_DATASOURCE_UUID } from "./config.js";

/**
 * A PO's own page, read without changing it.
 *
 * On Procol record pages a field's value is an inline editor that saves at
 * once, and clearing a linked value empties the fields that hang off it (22 Oct:
 * a look clicked an invoice's PO value, then its ✕, and unlinked the PO). So
 * nothing here clicks a value: only the ⋮ menu trigger, closed again with
 * Escape, and the page's text and buttons are read.
 */

/** Procol's "Want to stay updated?" card arrives a few seconds after a page loads and covers the header. */
export async function calmPage(page: Page): Promise<void> {
  const notNow = page.getByRole("button", { name: /^not now$/i });
  for (let i = 0; i < 12 && !(await notNow.isVisible().catch(() => false)); i++) await page.waitForTimeout(500);
  await notNow.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(500);
}

/** Opens a PO by its link and waits (UAT is slow) until its details show. False when they never do. */
export async function openPo(page: Page, uuid: string, po: string): Promise<boolean> {
  await page.goto(`${BASE}/flexi_record/${PO_DATASOURCE_UUID}/${uuid}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const ok = await page.getByText(po, { exact: true }).first().waitFor({ timeout: 90_000 }).then(() => true).catch(() => false);
  await calmPage(page);
  return ok;
}

/** The buttons in the PO page's header, by their words (an icon by what it is). */
export async function headerButtons(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.y > 95 && b.y < 165 && b.x > 600; })
      .map((e) => {
        const t = (e as HTMLElement).innerText.trim() || e.getAttribute("aria-label") || e.getAttribute("title") || "";
        if (t) return t;
        const c = e.className.toString();
        return /download/i.test(c) ? "(download icon)" : /dropdown-trigger/i.test(c) ? "(⋮ menu)" : "(icon)";
      }),
  );
}

/** What the header's ⋮ menu offers: opened, read, closed. Nothing in it is clicked. */
export async function moreMenu(page: Page): Promise<string[]> {
  const trigger = page.locator("button.pro-dropdown-trigger").filter({ hasNotText: /./ }).first();
  if (!(await trigger.isVisible().catch(() => false))) return [];
  // Only text that appears in the menu's own corner (below the trigger, toward it): the line-item
  // table further down loads late on UAT and would otherwise read as menu items.
  const t = (await trigger.boundingBox())!;
  const area = { left: t.x + t.width - 360, right: t.x + t.width + 40, top: t.y + t.height - 4, bottom: t.y + t.height + 280 };
  const leaves = () =>
    page.evaluate((a) =>
      [...document.querySelectorAll("body *")]
        .filter((e) => {
          const b = e.getBoundingClientRect();
          return e.children.length === 0 && b.width > 0 && (e as HTMLElement).innerText?.trim() && b.x >= a.left && b.right <= a.right && b.y >= a.top && b.bottom <= a.bottom;
        })
        .map((e) => (e as HTMLElement).innerText.trim()),
    area);
  const before = new Set(await leaves());
  await trigger.click();
  await page.waitForTimeout(1200);
  const items = (await leaves()).filter((t) => !before.has(t) && t.length < 40);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  return [...new Set(items)];
}
