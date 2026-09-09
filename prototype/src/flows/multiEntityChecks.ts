/**
 * MULTI-ENTITY (Vendor Entity Mapping) API automation.
 *
 * Runs the SAFE test cases against a client that has `is_vendor_entity_mapping_enabled`
 * ON (live: Ashoka University 56777). "Safe" = read endpoints + negative/validation
 * cases that get rejected BEFORE any ERP integration fires. We deliberately do NOT
 * run the valid POST-create (which would fire a real ERP call for a real client).
 *
 * Grounded in PR #15221 (see knowledge/multi-entity-feature.md).
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { apiGet, apiAttempt, classify, type CheckOutcome } from "../checks/engine.js";
import type { CheckResult, TestType } from "../ai/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const PT = join(here, "..", "..", "..", "procol test");
loadEnv({ path: join(here, "..", "..", ".env") });
loadEnv({ path: join(PT, ".env") });

/** A vendor mapped to this client (dealing_with_company_id) — from the DB, read-only. */
async function resolveVendor(companyId: number): Promise<number | null> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, statement_timeout: 20000 });
  try {
    const r = await pool.query(
      "select dealing_with_company_id from buyer_seller_company_mappings where client_company_id=$1 and dealing_with_company_id is not null order by id desc limit 1",
      [companyId],
    );
    return r.rows[0]?.dealing_with_company_id ?? null;
  } finally {
    await pool.end();
  }
}

interface MECheck {
  id: string;
  scenario: string;
  type: TestType;
  category: string;
  priority: string;
  severity: string;
  expected: "accept" | "reject";
  run: () => Promise<CheckOutcome>;
}

/** Resolve the client's buyer API (no full catalog needed) and run the safe suite. */
export async function runMultiEntityChecks(companyId: number): Promise<CheckResult[]> {
  const imp = (r: string) => import(pathToFileURL(join(PT, "src", r)).href);
  const { resolveClient } = (await imp("db/clients.ts")) as any;
  const { clientFromSession } = (await imp("auth/sessionAuth.ts")) as any;

  const client = await resolveClient(companyId);
  const api = await clientFromSession(client.buyer, { app: "console" });
  const vendor = await resolveVendor(companyId);
  if (!vendor) throw new Error(`No vendor (dealing_with_company_id) found for company ${companyId}.`);

  const p = (s: string) => `/vendor_entity_mappings${s}`;
  const dwc = `?dealing_with_company_id=${vendor}`;

  const checks: MECheck[] = [
    { id: "CHK-ME-01", scenario: "GET unmapped entities without dealing_with_company_id → rejected", type: "data-validation", category: "Data Validation", priority: "P1", severity: "High", expected: "reject", run: () => apiGet(api, p("/unmapped")) },
    { id: "CHK-ME-02", scenario: "GET unmapped entities for a vendor → 200", type: "functional", category: "Functional", priority: "P0", severity: "Critical", expected: "accept", run: () => apiGet(api, p("/unmapped") + dwc) },
    { id: "CHK-ME-03", scenario: "GET the vendor's entity-mapping table → 200 (columns + rows)", type: "functional", category: "Functional", priority: "P0", severity: "Critical", expected: "accept", run: () => apiGet(api, p("") + dwc) },
    { id: "CHK-ME-04", scenario: "POST create with blank entity_key → rejected (400)", type: "data-validation", category: "Data Validation", priority: "P1", severity: "High", expected: "reject", run: () => apiAttempt(api, p("") + dwc, { entity_key: "" }) },
    { id: "CHK-ME-05", scenario: "POST create without dealing_with_company_id → rejected", type: "data-validation", category: "Data Validation", priority: "P1", severity: "High", expected: "reject", run: () => apiAttempt(api, p(""), { entity_key: "ashoka_ent3" }) },
    { id: "CHK-ME-06", scenario: "POST create with a non-existent entity_key → rejected (404, no ERP fired)", type: "edge", category: "Negative", priority: "P1", severity: "High", expected: "reject", run: () => apiAttempt(api, p("") + dwc, { entity_key: "QA_PLATFORM_NONEXISTENT_ENTITY" }) },
  ];

  const results: CheckResult[] = [];
  for (const c of checks) {
    const outcome = await c.run().catch((e: any) => ({ httpStatus: e?.status ?? null, accepted: false, message: e?.message ?? String(e), durationMs: 0 }));
    const { pass, verdict } = classify(c.expected, outcome);
    results.push({
      id: c.id,
      flowId: "feature.multi_entity",
      module: "Vendor Entity Mapping",
      scenario: c.scenario,
      type: c.type,
      category: c.category,
      priority: c.priority,
      severity: c.severity,
      expected: c.expected,
      layer: "api",
      inputSummary: `dealing_with_company_id=${vendor}`,
      ...outcome,
      pass,
      verdict,
    });
  }
  await api.dispose().catch(() => {});
  return results;
}
