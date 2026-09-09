/** Probe the sandbox preview backend: auth + is the multi-company feature live? Read-only. */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const PT = join(here, "..", "..", "procol test");
loadEnv({ path: join(PT, ".env") });
const imp = (r: string) => import(pathToFileURL(join(PT, "src", r)).href);

const SANDBOX = "https://procol-sandbox-demo-rfx-qa.ag-ri.in/api";
const userId = Number(process.argv[2] || 16297);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
const s = (await pool.query(
  "select access_token, app_version from sessions where user_id=$1 and status=1 and app_version like '9.4%' order by created_at desc limit 1",
  [userId],
)).rows[0];
await pool.end();

const { clientFromSession } = (await imp("auth/sessionAuth.ts")) as any;

console.log(`Probing sandbox backend: ${SANDBOX}`);
console.log(`Using user ${userId}'s UAT session token (tests whether the sandbox shares the UAT DB)…\n`);

const api = await clientFromSession(
  { userId, sessionAccessToken: s?.access_token, appVersion: s?.app_version },
  { app: "console", baseURL: SANDBOX },
);
try {
  const cfg: any = await api.get("/v1/dashboard_configuration");
  const raw = JSON.stringify(cfg);
  console.log("AUTH: OK (sandbox accepts the UAT session token → shared DB)");
  console.log("is_multi_company_user present:", "is_multi_company_user" in cfg, "=", cfg.is_multi_company_user);
  console.log("allowed_client_companies present:", "allowed_client_companies" in cfg, "=", JSON.stringify(cfg.allowed_client_companies)?.slice(0, 300));
  console.log('raw contains "multi_company":', raw.includes("multi_company"));
  console.log('raw contains "allowed_client":', raw.includes("allowed_client"));
} catch (e: any) {
  console.log(`AUTH/CALL: ${e?.status ?? "ERR"} ${e?.message ?? e}`);
  console.log("→ If 401/app_error_auth_failed: the sandbox likely uses a DIFFERENT database (own users/sessions) — we'll need a sandbox login (OTP) or its DB URL.");
}
await api.dispose();
