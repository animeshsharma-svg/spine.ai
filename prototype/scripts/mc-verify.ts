import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const PT = join(here, "..", "..", "procol test");
loadEnv({ path: join(PT, ".env") });
const imp = (r: string) => import(pathToFileURL(join(PT, "src", r)).href);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
const s = (await pool.query(
  "select access_token, app_version from sessions where user_id=16297 and status=1 and app_version like '9.4%' order by created_at desc limit 1",
)).rows[0];
await pool.end();

const { clientFromSession } = (await imp("auth/sessionAuth.ts")) as any;
const api = await clientFromSession({ userId: 16297, sessionAccessToken: s.access_token, appVersion: s.app_version }, { app: "console" });
const cfg: any = await api.get("/v1/dashboard_configuration");
const raw = JSON.stringify(cfg);
console.log("is_multi_company_user present:", "is_multi_company_user" in cfg, "=", cfg.is_multi_company_user);
console.log("allowed_client_companies present:", "allowed_client_companies" in cfg, "=", JSON.stringify(cfg.allowed_client_companies));
console.log("under cfg.user?:", cfg.user && "is_multi_company_user" in cfg.user, cfg.user?.is_multi_company_user);
console.log('raw contains "multi_company":', raw.includes("multi_company"));
console.log('raw contains "allowed_client":', raw.includes("allowed_client"));
await api.dispose();
