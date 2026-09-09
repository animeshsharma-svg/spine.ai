import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const PT = join(here, "..", "..", "procol test");
loadEnv({ path: join(here, "..", ".env") });
loadEnv({ path: join(PT, ".env") });
const { buildLightspeedToken } = (await import(pathToFileURL(join(PT, "src", "auth/token.ts")).href)) as any;

const SANDBOX = "https://procol-sandbox-demo-rfx-qa.ag-ri.in/api";
const headers: any = { "access-token": process.env.SANDBOX_ACCESS_TOKEN!, "lightspeed-token": buildLightspeedToken(), "app-version": "9.4.388", "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(SANDBOX + path, { headers, redirect: "manual" });
  return { status: r.status, body: await r.text() };
}

const cfg = await get("/v1/dashboard_configuration");
console.log("dashboard_configuration →", cfg.status);
if (cfg.status === 200) {
  const obj = JSON.parse(cfg.body);
  const hits = Object.keys(obj).filter((k) => /multi|client_compan|allowed_client|switch|workspace|compan/i.test(k));
  console.log("  keys matching multi/company/switch:", hits.join(", ") || "(none)");
  console.log("  body markers:", ["is_multi_company_user", "allowed_client_companies", "multi_company", "client_company", "switch"].filter((m) => cfg.body.includes(m)).join(", ") || "(none)");
}

for (const p of ["/companies/allowed_client_companies", "/v1/companies/allowed_client_companies", "/allowed_client_companies"]) {
  const r = await get(p);
  console.log(`\n${p} → ${r.status} | ${r.body.slice(0, 140).replace(/\n/g, " ")}`);
}
