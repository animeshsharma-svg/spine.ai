import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
const here = dirname(fileURLToPath(import.meta.url));
const PT = join(here, "..", "..", "procol test");
loadEnv({ path: join(PT, ".env") });
const imp = (r: string) => import(pathToFileURL(join(PT, "src", r)).href);
const SANDBOX = "https://procol-sandbox-demo-rfx-qa.ag-ri.in/api";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
const s = (await pool.query("select access_token, app_version from sessions where user_id=16297 and status=1 order by created_at desc limit 1")).rows[0];
await pool.end();
const { tokensFromSession } = (await imp("auth/sessionAuth.ts")) as any;
for (const app of ["console","agribid"]) {
  const t = tokensFromSession({ userId:16297, sessionAccessToken: s.access_token, appVersion: s.app_version }, { app });
  const r = await fetch(SANDBOX + "/v1/dashboard_configuration", { headers: { "access-token": t.accessToken, "lightspeed-token": t.lightspeedToken, "app-version": s.app_version, "Content-Type":"application/json" } });
  console.log(`app=${app}: ${r.status} ${(await r.text()).slice(0,80)}`);
}
