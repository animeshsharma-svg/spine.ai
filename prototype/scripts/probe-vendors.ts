/** Probe both vendor endpoints to build a resilient fallback. */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PT = join(here, "..", "..", "procol test");
loadEnv({ path: join(PT, ".env") });
const imp = (r: string) => import(pathToFileURL(join(PT, "src", r)).href);

const { resolveClient } = await imp("db/clients.ts");
const { clientFromSession } = await imp("auth/sessionAuth.ts");

const client = await resolveClient(198678);
const api = await clientFromSession(client.buyer, { app: "console" });

async function probe(label: string, fn: () => Promise<any>) {
  try {
    const res = await fn();
    const companies = res?.companies ?? res?.data ?? res?.vendors ?? [];
    console.log(`\n${label}: OK — ${Array.isArray(companies) ? companies.length : "?"} companies`);
    console.log("  top keys:", Object.keys(res ?? {}).slice(0, 8).join(", "));
    if (Array.isArray(companies) && companies[0])
      console.log("  first company keys:", Object.keys(companies[0]).slice(0, 12).join(", "));
  } catch (e: any) {
    console.log(`\n${label}: FAIL ${e?.status ?? ""} ${e?.message ?? e}`);
  }
}

await probe("POST /companies/vendorlist_filtered", () =>
  api.post("/companies/vendorlist_filtered", { body: { query: "", product_uuids: [], page: 1 } }),
);
await probe("GET /companies/all_vendors (tab=unverified)", () =>
  api.get(`/companies/all_vendors?search=${encodeURIComponent(JSON.stringify({ category: "name", value: "" }))}&page=1&tab=unverified`),
);
await probe("GET /companies/all_vendors (tab=verified)", () =>
  api.get(`/companies/all_vendors?search=${encodeURIComponent(JSON.stringify({ category: "name", value: "" }))}&page=1&tab=verified`),
);
await api.dispose();
