import type { Page } from "@playwright/test";
import { CONFIG, NAV } from "../config.js";
import { buyerApi } from "./buyerApi.js";
import { focusFrames } from "./liveCursor.js";

/**
 * A VENDOR'S LOGIN, LOOKED UP THE WAY A TESTER WOULD — in the Vendors module.
 *
 * Aanya, 15 Oct: a bid from a second vendor stopped because the run knew no
 * other vendor it could sign in as. "There's a module named vendors in my
 * platform: open it in a next tab, search for the vendor invited and copy its
 * email id, and the OTP will be the same used for the buyer."
 *
 * So: a new tab in the buyer's own browser opens Vendors (the live view
 * follows it), the vendor's name goes into its search, and the email is read
 * from what the module itself answers — GET /companies/all_vendors, the call
 * the page makes, per tab: Vendors (verified), Onboarding In Progress and
 * Prospects. Only an exact name match counts: "12" must not pick up
 * "API-BESTQ_1782294512931". The vendor portal accepts the inviting buyer's
 * UAT login code, which VendorPortalPage.login already tries.
 */

const TABS: Array<{ tab: string; label: string }> = [
  { tab: "verified", label: "Vendors" },
  { tab: "onboarding_in_progress", label: "Onboarding In Progress" },
  { tab: "unverified", label: "Prospects" },
];

const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

export interface FoundVendor {
  name: string;
  email: string;
  /** the Vendors module tab it is listed under */
  tab: string;
  contact?: string;
}

/** Look a vendor up in the Vendors module; null when it is not there or has no email. */
export async function lookUpVendor(buyerPage: Page, name: string): Promise<FoundVendor | null> {
  const tab = await buyerPage.context().newPage();
  const release = focusFrames(tab);
  try {
    console.log(`[vendors] opening the Vendors module in a new tab to find “${name}”`);
    await tab.goto(`${CONFIG.appUrl.replace(/\/$/, "")}/vendors`, NAV).catch(() => {});
    // What a person does: type the name into the module's search (the live view shows it).
    const search = tab.locator("input[placeholder='Search']").first();
    if (await search.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await search.fill(name).catch(() => {});
      await search.press("Enter").catch(() => {});
      await tab.waitForTimeout(1_500);
    }
    // What the module answers, tab by tab.
    const api = await buyerApi(tab);
    if (!api) {
      console.log("[vendors] could not read the Vendors module (no buyer session to ask with)");
      return null;
    }
    try {
      for (const t of TABS) {
        const r = await api
          .get("companies/all_vendors", { params: { search: JSON.stringify({ category: "name", value: name }), page: 1, tab: t.tab } })
          .catch(() => null);
        if (!r || !r.ok()) continue;
        const j: any = await r.json().catch(() => null);
        const list: any[] = Array.isArray(j?.companies) ? j.companies : [];
        const hit = list.find((c) => same(String(c?.name ?? ""), name));
        const email = String(hit?.email ?? "").trim();
        if (hit && /@/.test(email)) {
          console.log(`[vendors] found “${name}” under ${t.label} — email ${email}`);
          return { name, email, tab: t.label, contact: hit.contact_person_name ? String(hit.contact_person_name) : undefined };
        }
      }
    } finally {
      await api.dispose().catch(() => {});
    }
    console.log(`[vendors] “${name}” is not in the Vendors module with an email (looked under ${TABS.map((t) => t.label).join(", ")})`);
    return null;
  } finally {
    release();
    await tab.close().catch(() => {});
  }
}

/** The vendor an email belongs to, from the Vendors module's search by email; null when it cannot tell. */
export async function vendorNameForEmail(buyerPage: Page, email: string): Promise<string | null> {
  const api = await buyerApi(buyerPage);
  if (!api) return null;
  try {
    for (const t of TABS) {
      const r = await api.get("companies/all_vendors", { params: { search: JSON.stringify({ category: "email", value: email }), page: 1, tab: t.tab } }).catch(() => null);
      if (!r || !r.ok()) continue;
      const j: any = await r.json().catch(() => null);
      const hit = (Array.isArray(j?.companies) ? j.companies : []).find((c: any) => String(c?.email ?? "").toLowerCase() === email.toLowerCase());
      if (hit?.name) return String(hit.name);
    }
    return null;
  } finally {
    await api.dispose().catch(() => {});
  }
}
