import type { Page } from "@playwright/test";
import { BASE, PO_LIST_PATH } from "./config.js";
import { dismissPopups } from "./signin.js";

const DIGITS = "gZckDpNXdQ";
/** Procol's record uuid → its database id (procol-ui-tests/src/crosscheck/ids.ts). */
export function decodeId(uuid: string): number {
  const mapped = Buffer.from(uuid, "base64").toString("utf8");
  const d = [...mapped].map((c) => DIGITS.indexOf(c));
  const r = 3 % d.length;
  const orig = [...d.slice(d.length - r), ...d.slice(0, d.length - r)];
  return (Number(orig.join("")) - 1022) / 3;
}

export interface ListedPo {
  uuid: string;
  id: number;
  po: string;
  /** PO Status as the list holds it: "0" is Draft */
  status: string;
  createdBy: string;
  costCenter: string | null;
}

export interface PoList {
  tab: string;
  datasource: string;
  total: number;
  rows: ListedPo[];
}

/**
 * Every PO this signed-in user can see on one tab of the PO list.
 *
 * The page asks /api/fx_views/records for 20 at a time; the same read is
 * repeated here for every page with the page's own headers — read-only, and
 * exactly what the list would show if someone paged to the end.
 */
export async function readList(page: Page, tab = "Purchase Order"): Promise<PoList> {
  let first: { url: string; headers: Record<string, string> } | null = null;
  const grab = (q: { url: () => string; headers: () => Record<string, string> }) => {
    if (/\/api\/fx_views\/records\?/.test(q.url())) first = { url: q.url(), headers: q.headers() };
  };
  page.on("request", grab);
  // Opened again even when the sign-in already landed on it: its first read happened before we listened.
  await page.goto(`${BASE}${PO_LIST_PATH}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await dismissPopups(page);
  if (tab !== "Purchase Order") {
    first = null;
    await page.getByRole("tab", { name: tab }).or(page.getByText(tab, { exact: true })).first().click();
  }
  for (let t = 0; t < 60 && !first; t++) await page.waitForTimeout(500);
  page.off("request", grab);
  if (!first) throw new Error(`the ${tab} list asked for no records`);
  const { url, headers } = first as { url: string; headers: Record<string, string> };
  const u = new URL(url);
  const rows: ListedPo[] = [];
  let total = 0;
  for (let p = 1; p <= 300; p++) {
    u.searchParams.set("page", String(p));
    const r = await page.request.get(u.toString(), { headers });
    if (!r.ok()) throw new Error(`the ${tab} list's page ${p} answered ${r.status()}`);
    const b = await r.json();
    total = b.pagination?.total_count ?? total;
    const h: string[] = b.headers.map((x: any) => (typeof x === "string" ? x : x.key_attribute || x.name));
    for (const rec of b.records) {
      const o = Object.fromEntries(h.map((k, i) => [k, rec[i]]));
      rows.push({ uuid: o.fx_response_id, id: decodeId(o.fx_response_id), po: o.po_number || o.title, status: String(o.status), createdBy: o.created_by_user_name, costCenter: o.linked_cost_center?.title ?? null });
    }
    if (p >= (b.pagination?.total_pages ?? 1)) break;
  }
  return { tab, datasource: u.searchParams.get("datasource_uuid") ?? "", total, rows };
}

/** The tabs over the PO list (Purchase Order, Gift Purchase Order, …). */
export async function listTabs(page: Page): Promise<string[]> {
  if (!/purchase-order-flexi/.test(page.url())) await page.goto(`${BASE}${PO_LIST_PATH}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  return page.evaluate(() =>
    [...document.querySelectorAll("[role=tab], .ant-tabs-tab")].map((e) => (e as HTMLElement).innerText.trim()).filter((t) => /purchase order/i.test(t)),
  );
}
