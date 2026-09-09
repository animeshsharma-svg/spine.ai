import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const PT = join(here, "..", "..", "procol test");
loadEnv({ path: join(here, "..", ".env") });
loadEnv({ path: join(PT, ".env") });
const { buildLightspeedToken } = (await import(pathToFileURL(join(PT, "src", "auth/token.ts")).href)) as any;

const SANDBOX = "https://procol-sandbox-demo-rfx-qa.ag-ri.in/api";
const token = process.env.SANDBOX_ACCESS_TOKEN!;
const ls = buildLightspeedToken();

for (const ver of ["9.4.388", "9.4.86", "9.5.0", "10.0.0", ""]) {
  const headers: any = { "access-token": token, "lightspeed-token": ls, "Content-Type": "application/json" };
  if (ver) headers["app-version"] = ver;
  try {
    const r = await fetch(SANDBOX + "/v1/dashboard_configuration", { headers, redirect: "manual" });
    const body = (await r.text());
    const hasMulti = body.includes("is_multi_company_user");
    console.log(`app-version "${ver || "(none)"}" → ${r.status} | multiField=${hasMulti} | ${body.slice(0, 90).replace(/\n/g, " ")}`);
  } catch (e: any) {
    console.log(`app-version "${ver}" → ERR ${e?.message}`);
  }
}
