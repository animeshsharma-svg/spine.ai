import { test, expect } from "../../src/fixtures.js";
import { fetchVendorsFiltered } from "../../src/flows/vendors.js";
import { Endpoints } from "../../src/api/endpoints.js";
import { declareCase } from "../../src/report/caseSpec.js";

/** Vendor discovery (buyer): filtered list + all_vendors summary. */
test.describe("vendor discovery", () => {
  test("fetch vendors (filtered) returns a page of companies", async ({ buyerApi }) => {
    declareCase({
      plain: "Search the supplier directory the way the buyer does when picking who to invite to an event.",
      expected:
        "The API returns at least one supplier company, each carrying an identifier, across at least one page of results.",
      flow: "vendor.discovery",
      flowTitle: "Finding suppliers",
      kind: "positive",
      expect: "accept",
    });
    const page = await fetchVendorsFiltered(buyerApi, 1);
    expect(Array.isArray(page.companies)).toBe(true);
    expect(page.companies.length).toBeGreaterThan(0);
    expect(page.companies[0]).toHaveProperty("uuid");
    expect(page.totalPages).toBeGreaterThanOrEqual(1);
  });

  test("all_vendors returns tab counts", async ({ buyerApi }) => {
    declareCase({
      plain: "Read the supplier directory's summary counts — the numbers shown on the tabs above the list.",
      expected: "The API returns the counts, including the page total and how many suppliers are verified.",
      flow: "vendor.discovery",
      flowTitle: "Finding suppliers",
      kind: "positive",
      expect: "accept",
    });
    const res = await buyerApi.get<Record<string, unknown>>(Endpoints.allVendors(1));
    expect(res).toHaveProperty("total_pages");
    expect(res).toHaveProperty("total_verified_vendors");
  });
});
