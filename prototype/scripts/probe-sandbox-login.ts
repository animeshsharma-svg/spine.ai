/** Try OTP login against the sandbox backend + check if the multi-company feature is live. */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PT = join(here, "..", "..", "procol test");
loadEnv({ path: join(PT, ".env") });
const imp = (r: string) => import(pathToFileURL(join(PT, "src", r)).href);

const SANDBOX = "https://procol-sandbox-demo-rfx-qa.ag-ri.in/api";
const phone = process.argv[2] || "1234567516";
const otp = process.argv[3] || "130899";

const { authenticate } = (await imp("auth/login.ts")) as any;
const { CONFIG } = (await imp("config.ts")) as any;
const { ApiClient } = (await imp("api/client.ts")) as any;

const id = { ...CONFIG.identities.buyer, baseURL: SANDBOX, phone, phonePrefix: "+91", otp, role: "buyer" };
console.log(`Trying OTP login on sandbox as ${phone} / OTP ${otp}…`);

try {
  const res = await authenticate(id);
  console.log("LOGIN: OK ✅  (sandbox has this account)");
  const api = await ApiClient.create({ accessToken: res.accessToken, lightspeedToken: res.lightspeedToken }, { baseURL: SANDBOX, appVersion: id.appVersion });
  const cfg: any = await api.get("/v1/dashboard_configuration");
  const raw = JSON.stringify(cfg);
  console.log("\nMulti-company feature on sandbox:");
  console.log("  is_multi_company_user:", "is_multi_company_user" in cfg, "=", cfg.is_multi_company_user);
  console.log("  allowed_client_companies:", JSON.stringify(cfg.allowed_client_companies)?.slice(0, 400));
  console.log('  raw contains "multi_company":', raw.includes("multi_company"));
  console.log('  raw contains "allowed_client":', raw.includes("allowed_client"));
  await api.dispose();
} catch (e: any) {
  console.log(`LOGIN FAILED: ${e?.message ?? e}`.slice(0, 300));
  console.log("→ Need a valid sandbox login (a phone that exists in the sandbox DB) OR the sandbox DATABASE_URL.");
}
