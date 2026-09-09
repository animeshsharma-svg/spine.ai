/** Dump dashboard_configuration structure to find the current company + switcher list. */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const PT = join(here, "..", "..", "procol test");
loadEnv({ path: join(PT, ".env") });
const imp = (r: string) => import(pathToFileURL(join(PT, "src", r)).href);

const userId = Number(process.argv[2] || 16297);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
const s = (await pool.query("select access_token, app_version from sessions where user_id=$1 and status=1 and app_version like '9.4%' order by created_at desc limit 1", [userId])).rows[0];
await pool.end();
const { clientFromSession } = (await imp("auth/sessionAuth.ts")) as any;
const api = await clientFromSession({ userId, sessionAccessToken: s.access_token, appVersion: s.app_version }, { app: "console" });
const cfg: any = await api.get("/v1/dashboard_configuration");

console.log("top-level keys:", Object.keys(cfg).join(", "));
// any key mentioning company
for (const k of Object.keys(cfg)) {
  if (/compan/i.test(k)) console.log(`\n${k}:`, JSON.stringify(cfg[k]).slice(0, 400));
}
// look for a list of companies (the switcher source)
for (const k of Object.keys(cfg)) {
  const v = cfg[k];
  if (Array.isArray(v) && v.length && v[0] && (v[0].company_id || v[0].company_name || (v[0].name && v[0].id))) {
    console.log(`\npossible switcher list "${k}" (${v.length}):`, JSON.stringify(v.slice(0, 3)).slice(0, 500));
  }
}
// configurations sub-object often holds current company / global_config
if (cfg.configurations) console.log("\nconfigurations keys:", Object.keys(cfg.configurations).join(", "));
await api.dispose();
