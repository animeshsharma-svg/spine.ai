/** Probe the multi-entity endpoints for Ashoka University (56777). Read-only. */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PT = join(here, "..", "..", "procol test");
loadEnv({ path: join(PT, ".env") });
const imp = (r: string) => import(pathToFileURL(join(PT, "src", r)).href);

const { resolveClient } = await imp("db/clients.ts");
const { clientFromSession } = await imp("auth/sessionAuth.ts");

const companyId = Number(process.argv[2] || 56777);
console.log(`Resolving client ${companyId}…`);
const client = await resolveClient(companyId).catch((e: any) => {
  console.log("resolveClient FAILED:", e.message);
  return null;
});
if (!client) process.exit(1);
console.log(`OK — ${client.companyName} (buyer user ${client.buyer.userId})`);
const api = await clientFromSession(client.buyer, { app: "console" });

async function show(label: string, fn: () => Promise<any>) {
  try {
    const r = await fn();
    console.log(`\n${label}: OK`);
    console.log("  keys:", Object.keys(r ?? {}).slice(0, 10).join(", "));
    console.log("  sample:", JSON.stringify(r).slice(0, 400));
  } catch (e: any) {
    console.log(`\n${label}: ${e?.status ?? "ERR"} ${e?.message ?? e}`);
  }
}

// dealing_with_company_id comes from buyer_seller_company_mappings.dealing_with_company_id
const vendorId: number | undefined = process.argv[3] ? Number(process.argv[3]) : undefined;
console.log(`\ndealing_with_company_id = ${vendorId}`);

await show("GET /vendor_entity_mappings/unmapped (no param)", () => api.get("/vendor_entity_mappings/unmapped"));
if (vendorId) {
  await show(`GET /vendor_entity_mappings/unmapped?dealing_with_company_id=${vendorId}`, () => api.get(`/vendor_entity_mappings/unmapped?dealing_with_company_id=${vendorId}`));
  await show(`GET /vendor_entity_mappings?dealing_with_company_id=${vendorId}`, () => api.get(`/vendor_entity_mappings?dealing_with_company_id=${vendorId}`));
}
await api.dispose();
