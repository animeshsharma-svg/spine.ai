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

/** Vendors that have a login email (candidates for the vendor self-bid flow). */
export async function listInvitableVendors(
  buyerApi: ApiClient,
  query = "",
  limit = 5,
): Promise<VendorCompany[]> {
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
): Promise<VendorCompany> {
  const [first] = await listInvitableVendors(buyerApi, query, 1);
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
