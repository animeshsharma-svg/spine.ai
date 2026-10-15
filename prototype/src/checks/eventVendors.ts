import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PROCOL_TEST } from "../executor.js";

/**
 * THE VENDORS PROCOL ITSELF INVITES TO AN EVENT, AND WHICH OF THEM BID.
 *
 * Aanya, 2026-10-09: an API journey bids as the vendors invited to its event,
 * never as QA test vendors — and the invite is Procol's own suggestion for the
 * product, the list the create screen pre-fills (`/companies/audience_for_product`).
 * That list can be long (160 vendors for one product on PROCOL DEMO), and
 * every vendor on it gets Procol's invitation email. The bidders are the first
 * of them with a user who can sign in, found read-only in Procol's database.
 * SPINE_QA_VENDORS_ONLY=1 keeps the QA-only journey.
 */
const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);

export const qaVendorsOnly = (): boolean => process.env.SPINE_QA_VENDORS_ONLY === "1";

/** A QA test vendor's login: these never bid in event-vendor mode. */
export const QA_LOGIN = /^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i;

export interface SuggestedVendor {
  uuid: string;
  name: string;
}

/** Procol's suggested audience for these products — what the create screen pre-fills. */
export async function suggestedAudience(buyerApi: any, productUuids: string[]): Promise<SuggestedVendor[]> {
  const ids = [...new Set(productUuids.filter(Boolean))];
  if (!ids.length) return [];
  const r: any = await buyerApi.get(`/companies/audience_for_product?product_uuids=[${ids.join(",")}]`);
  const list: any[] = r?.companies ?? r?.data?.companies ?? [];
  return list.filter((c) => c?.uuid).map((c) => ({ uuid: String(c.uuid), name: String(c.name ?? "").trim() }));
}

/** This client's vendors that have an active user with an email, by lower-cased company name (read-only). */
export async function vendorLoginsByName(companyId: number): Promise<Map<string, string>> {
  const { query } = await imp("db/pool.ts");
  const rows: Array<{ name: string; email: string }> = await query(
    `select distinct on (c.id) c.name, u.email
       from companies c
       join buyer_seller_company_mappings b on b.dealing_with_company_id = c.id and b.client_company_id = $1 and b.status = 1
       join user_company_mappings m on m.company_id = c.id and m.status = 1
       join users u on u.id = m.user_id and u.status = 1 and coalesce(u.email, '') <> ''
      where c.status = 1
      order by c.id, u.email_verified desc nulls last, u.id`,
    [companyId],
  );
  const out = new Map<string, string>();
  for (const r of rows) {
    const k = String(r.name ?? "").trim().toLowerCase();
    if (k && !out.has(k)) out.set(k, r.email);
  }
  return out;
}
