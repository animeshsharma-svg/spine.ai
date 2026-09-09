import { test, expect } from "../../src/fixtures.js";
import { fetchVendorsFiltered } from "../../src/flows/vendors.js";
import { Endpoints } from "../../src/api/endpoints.js";

/** Vendor discovery (buyer): filtered list + all_vendors summary. */
test.describe("vendor discovery", () => {
  test("fetch vendors (filtered) returns a page of companies", async ({ buyerApi }) => {
    const page = await fetchVendorsFiltered(buyerApi, 1);
    expect(Array.isArray(page.companies)).toBe(true);
    expect(page.companies.length).toBeGreaterThan(0);
    expect(page.companies[0]).toHaveProperty("uuid");
    expect(page.totalPages).toBeGreaterThanOrEqual(1);
  });

  test("all_vendors returns tab counts", async ({ buyerApi }) => {
    const res = await buyerApi.get<Record<string, unknown>>(Endpoints.allVendors(1));
    expect(res).toHaveProperty("total_pages");
    expect(res).toHaveProperty("total_verified_vendors");
  });
});
