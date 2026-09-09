/** Sandbox shares the UAT DB → retry auth with correct app-versions; check the feature. */
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
  "select access_token, app_version from sessions where user_id=$1 and status=1 and access_token is not null order by created_at desc limit 1",
  [userId],
)).rows[0];
await pool.end();
console.log(`user ${userId}: session app_version=${s?.app_version}`);

const { clientFromSession } = (await imp("auth/sessionAuth.ts")) as any;

for (const ver of [s?.app_version, "9.4.388", "9.4.500", "9.5.0"].filter(Boolean)) {
  try {
    const api = await clientFromSession(
      { userId, sessionAccessToken: s.access_token, appVersion: ver },
      { app: "console", baseURL: SANDBOX, appVersion: ver },
    );
    const cfg: any = await api.get("/v1/dashboard_configuration");
    const raw = JSON.stringify(cfg);
    console.log(`\napp-version ${ver}: OK ✅  is_multi_company_user=${cfg.is_multi_company_user}  allowed_client_companies=${JSON.stringify(cfg.allowed_client_companies)?.slice(0, 200)}  hasMultiCompany=${raw.includes("multi_company")}`);
    await api.dispose();
    break;
  } catch (e: any) {
    console.log(`app-version ${ver}: ${e?.status ?? "ERR"} ${(e?.message ?? e)?.toString().slice(0, 80)}`);
  }
}
