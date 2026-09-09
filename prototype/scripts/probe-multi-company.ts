/** Probe the multi-company user: how does the API scope config per company? Read-only. */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const PT = join(here, "..", "..", "procol test");
loadEnv({ path: join(PT, ".env") });
const imp = (r: string) => import(pathToFileURL(join(PT, "src", r)).href);

const userId = Number(process.argv[2] || 16297);
const companies = (process.argv[3] || "32215,32216").split(",").map(Number);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, statement_timeout: 30000 });
const srow = (await pool.query(
  "select access_token, app_version from sessions where user_id=$1 and status=1 and access_token is not null and app_version like '9.4%' order by created_at desc limit 1",
  [userId],
)).rows[0];
await pool.end();
if (!srow) { console.log(`no session for user ${userId}`); process.exit(1); }

const { clientFromSession } = (await imp("auth/sessionAuth.ts")) as any;
const session = { userId, sessionAccessToken: srow.access_token, appVersion: srow.app_version };
const api = await clientFromSession(session, { app: "console" });

function summarize(cfg: any) {
  const company = cfg?.company ?? cfg?.current_company ?? {};
  const perms = cfg?.authorized_permissions;
  let moduleCount = 0;
  const mods = new Set<string>();
  if (Array.isArray(perms)) for (const g of perms) for (const list of [g?.company_permissions, g?.team_permissions]) if (Array.isArray(list)) for (const p of list) { const m = p?.module ?? p?.permission?.module; if (m?.name) mods.add(m.name); }
  moduleCount = mods.size;
  return { companyId: company?.id ?? cfg?.company_id ?? cfg?.current_company_id, companyName: company?.name, moduleCount, modules: [...mods].sort().slice(0, 12) };
}

async function tryCfg(label: string, opts: any) {
  try {
    const cfg = await api.get("/v1/dashboard_configuration", opts);
    console.log(`\n${label}: OK →`, JSON.stringify(summarize(cfg)));
  } catch (e: any) {
    console.log(`\n${label}: ${e?.status ?? "ERR"} ${e?.message ?? e}`);
  }
}

console.log(`User ${userId}; companies ${companies.join(", ")}`);
await tryCfg("default (no company hint)", {});
for (const c of companies) {
  await tryCfg(`?company_id=${c}`, { params: { company_id: c } });
  await tryCfg(`header company-id=${c}`, { headers: { "company-id": String(c) } });
  await tryCfg(`header current-company-id=${c}`, { headers: { "current-company-id": String(c) } });
}
await api.dispose();
