/** Raw-fetch several sandbox endpoints with a shared-DB session token to see what auth works. */
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
const s = (await pool.query("select access_token, app_version from sessions where user_id=$1 and status=1 order by created_at desc limit 1", [userId])).rows[0];
await pool.end();

const { tokensFromSession } = (await imp("auth/sessionAuth.ts")) as any;
const t = tokensFromSession({ userId, sessionAccessToken: s.access_token, appVersion: s.app_version }, { app: "console" });
const headers = {
  "access-token": t.accessToken,
  "lightspeed-token": t.lightspeedToken,
  "app-version": s.app_version,
  "Content-Type": "application/json",
};
console.log("token prefix:", t.accessToken.slice(0, 24) + "…");

for (const path of ["/v1/dashboard_configuration", "/orders", "/session/recent_account_activity", "/get_all_users?filters=%7B%22statuses%22%3A%5B%22active%22%5D%7D"]) {
  try {
    const r = await fetch(SANDBOX + path, { headers });
    const body = (await r.text()).slice(0, 120).replace(/\n/g, " ");
    console.log(`GET ${path.slice(0, 40)} → ${r.status} | ${body}`);
  } catch (e: any) {
    console.log(`GET ${path} → ERR ${e?.message}`);
  }
}