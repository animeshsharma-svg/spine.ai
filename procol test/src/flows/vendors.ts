import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";

export interface VendorCompany {
  uuid: string;
  name?: string;
  email?: string;
}

export interface VendorPage {
  companies: VendorCompany[];
  totalPages: number;
}

/**
 * The platform's OWN test vendors for this buyer: companies with an ACTIVE
 * buyer link whose active member is a qa_…@example.com user with a verified
 * email (made by prototype/src/checks/matrixVendors.ts — invite + vendor
 * signup). Inviting or signing in as them mails only a reserved domain, so
 * they are the default everywhere a vendor is invited. SELECT only; the
 * uuid comes from the buyer's own vendor list. [] when none (or no database).
 */
export async function listQaVendors(buyerApi: ApiClient, workspaceId?: number, limit = 4): Promise<VendorCompany[]> {
  const ws = workspaceId ?? (buyerApi as unknown as { companyId?: number }).companyId;
  if (!ws) return [];
  let rows: Array<{ id: number; name: string; email: string }> = [];
  const lookup = async () => {
    const { query: sql } = await import("../db/pool.js");
    return sql<{ id: number; name: string; email: string }>(
      `select distinct on (c.id) c.id, c.name, u.email
         from companies c
         join buyer_seller_company_mappings b on b.dealing_with_company_id = c.id and b.client_company_id = $1 and b.status = 1
         join user_company_mappings m on m.company_id = c.id and m.status = 1
         join users u on u.id = m.user_id and u.status = 1 and u.email_verified = 1
        where c.status = 1 and u.email ilike 'qa\\_%@example.com'
        order by c.id, u.id`,
      [ws],
    );
  };
  // One retry: a dropped idle connection must not turn into "no QA vendor".
  try {
    rows = await lookup();
  } catch {
    try {
      rows = await lookup();
    } catch {
      return [];
    }
  }
  const out: VendorCompany[] = [];
  for (const r of rows.slice(0, Math.max(limit * 2, limit))) {
    if (out.length >= limit) break;
    const { companies } = await fetchVendorsFiltered(buyerApi, 1, r.name).catch(() => ({ companies: [] as VendorCompany[], totalPages: 0 }));
    const hit = companies.find((c) => c.name === r.name && c.uuid);
    if (hit) out.push({ uuid: hit.uuid, name: r.name, email: r.email });
  }
  return out;
}

/**
 * Real suppliers are NEVER invited by default: inviting one mails real people
 * (invites, one-time codes). Only an explicit SPINE_ALLOW_REAL_VENDORS=1 lets
 * the old "first vendor with an email" fallback run. Without a QA vendor the
 * caller gets NoQaVendorError and must run without a vendor.
 */
export class NoQaVendorError extends Error {
  constructor(workspaceId?: number) {
    super(
      `No QA test vendor on this client${workspaceId ? ` (${workspaceId})` : ""} — real suppliers are never invited. ` +
        `Create QA vendors for it first (prototype: npm run matrix, which sets them up), or set SPINE_ALLOW_REAL_VENDORS=1 deliberately.`,
    );
    this.name = "NoQaVendorError";
  }
}

const allowRealVendors = () => process.env.SPINE_ALLOW_REAL_VENDORS === "1";
const warned = new Set<number>();
function warnRealVendor(ws: number | undefined): void {
  if (warned.has(ws ?? 0)) return;
  warned.add(ws ?? 0);
  console.warn(`[vendors] SPINE_ALLOW_REAL_VENDORS=1 and no QA vendor for this client${ws ? ` (${ws})` : ""} — using a REAL vendor. Its people get the invite and one-time-code emails.`);
}

/** Vendors that have a login email (candidates for the vendor self-bid flow). QA vendors only, unless explicitly allowed. */
export async function listInvitableVendors(
  buyerApi: ApiClient,
  query = "",
  limit = 5,
  workspaceId?: number,
): Promise<VendorCompany[]> {
  if (!query) {
    const ws = workspaceId ?? (buyerApi as unknown as { companyId?: number }).companyId;
    const qa = await listQaVendors(buyerApi, ws, limit);
    if (qa.length) return qa;
    if (!allowRealVendors()) throw new NoQaVendorError(ws);
    warnRealVendor(ws);
  }
  const { companies } = await fetchVendorsFiltered(buyerApi, 1, query);
  const withEmail = companies.filter((c) => c.uuid && c.email && c.email.includes("@"));
  if (withEmail.length) return withEmail.slice(0, limit);
  // Fallback: when no vendor exposes a login email (e.g. the all_vendors
  // endpoint), return uuid-only vendors — enough to invite as an event audience
  // (the vendor self-bid E2E needs an email, but most flows only need a uuid).
  return companies.filter((c) => c.uuid).slice(0, limit);
}

/**
 * Pick an invitable vendor that has a login email — needed for the vendor
 * self-bid flow (invite this company, then log in as its email).
 */
export async function pickInvitableVendor(
  buyerApi: ApiClient,
  query = "",
  workspaceId?: number,
): Promise<VendorCompany> {
  const [first] = await listInvitableVendors(buyerApi, query, 1, workspaceId);
  if (!first) throw new Error("No vendor with a login email found in the vendor list.");
  return first;
}

/** Fetch a page of vendors via the filtered list (collection [32]). */
export async function fetchVendorsFiltered(
  buyerApi: ApiClient,
  page = 1,
  query = "ve",
): Promise<VendorPage> {
  try {
    const res = await buyerApi.post<any>(Endpoints.vendorlistFiltered(), {
      body: { query, product_uuids: [], page },
    });
    return { companies: res.companies ?? [], totalPages: res.total_pages ?? 1 };
  } catch (err: any) {
    // Resilience: the filtered endpoint is sometimes unavailable on UAT
    // (e.g. 404 after a deploy). Fall back to the all_vendors list, which
    // returns the same companies (uuid + name).
    const status = err?.status;
    if (status === 404 || status === 400 || status === 405 || status === 500) {
      const res = await buyerApi.get<any>(Endpoints.allVendors(page));
      return { companies: res.companies ?? [], totalPages: res.total_pages ?? 1 };
    }
    throw err;
  }
}

/**
 * Collect up to `target` vendor uuids by paging through the filtered list.
 * Mirrors the collection's "fetch vendors" loop, without Postman's runner.
 */
export async function collectVendors(
  buyerApi: ApiClient,
  target = 100,
): Promise<string[]> {
  const collected: string[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { companies, totalPages: tp } = await fetchVendorsFiltered(buyerApi, page);
    totalPages = tp;
    for (const c of companies) {
      if (c.uuid && !collected.includes(c.uuid)) collected.push(c.uuid);
    }
    page += 1;
  } while (collected.length < target && page <= totalPages);
  return collected.slice(0, target);
}
