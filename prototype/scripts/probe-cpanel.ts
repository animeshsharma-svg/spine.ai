/** Check the multi-company feature on cpanel's backend (sec-api) via proven DB-login. */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const PT = join(here, "..", "..", "procol test");
loadEnv({ path: join(PT, ".env") });
const imp = (r: string) => import(pathToFileURL(join(PT, "src", r)).href);

const baseURL = process.argv[2] || "https://sec-api.ag-ri.in/api";
const userId = Number(process.argv[3] || 16297);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
const s = (await pool.query("select access_token, app_version from sessions where user_id=$1 and status=1 and app_version like '9.4%' order by created_at desc limit 1", [userId])).rows[0];
await pool.end();

const { clientFromSession } = (await imp("auth/sessionAuth.ts")) as any;
const { CONFIG } = (await imp("config.ts")) as any;
console.log(`baseURL=${baseURL} user=${userId} (companies checked)  console appVersion=${CONFIG.identities.buyer.appVersion}`);

const api = await clientFromSession({ userId, sessionAccessToken: s.access_token, appVersion: s.app_version }, { app: "console", baseURL });
try {
  const cfg: any = await api.get("/v1/dashboard_configuration");
  const raw = JSON.stringify(cfg);
  console.log("AUTH OK ✅");
  console.log("  is_multi_company_user:", "is_multi_company_user" in cfg, "=", cfg.is_multi_company_user);
  console.log("  allowed_client_companies:", JSON.stringify(cfg.allowed_client_companies)?.slice(0, 300));
  console.log('  raw has "multi_company":', raw.includes("multi_company"), ' "allowed_client":', raw.includes("allowed_client"));
} catch (e: any) {
  console.log(`CALL FAILED: ${e?.status} ${e?.message}`);
}
await api.dispose();
