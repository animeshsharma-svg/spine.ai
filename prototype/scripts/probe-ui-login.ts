/** Diagnose which companies can UI-login on cpanel (no OTP). */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const PROTO = join(here, "..");
loadEnv({ path: join(PROTO, "..", "procol test", ".env") });
const UITESTS = join(PROTO, "..", "procol-ui-tests");
const imp = (r: string) => import(pathToFileURL(join(UITESTS, "src", r)).href);

const mc: any = await imp("db/multiClient.ts");
const cfg: any = await imp("config.ts");
const base = String(cfg.CONFIG.appUrl).replace(/\/$/, "");
const STORAGE = cfg.STORAGE_KEYS;

const loginnable = await mc.loginnableCompanies(8);
console.log("Loginnable companies (recent console sessions):");
loginnable.forEach((c: any) => console.log(`  ${c.companyId}  ${c.companyName}  (${c.sessions} sessions)`));

const candidates = [198678, ...loginnable.slice(0, 3).map((c: any) => c.companyId)];
const browser = await chromium.launch({ headless: true });
for (const companyId of candidates) {
  const login = await mc.resolveCompanyLogin(companyId).catch(() => null);
  if (!login) {
    console.log(`\n${companyId}: no session resolved`);
    continue;
  }
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const validity = Math.floor(Date.now() / 1000) + 24 * 3600;
  await page.addInitScript(
    (d: any) => {
      localStorage.setItem(d.keys.accessToken, JSON.stringify(d.token));
      localStorage.setItem(d.keys.selectedApi, d.api);
      localStorage.setItem("procol_app_version", JSON.stringify(d.ver));
      localStorage.setItem("procol_login_validity", String(d.validity));
    },
    { token: login.accessToken, api: cfg.CONFIG.apiUrl, ver: login.appVersion, validity, keys: STORAGE },
  );
  await page.goto(`${base}/home`).catch(() => {});
  await page.waitForTimeout(5000);
  const url = page.url();
  console.log(`\n${companyId} "${login.companyName}" (app_ver ${login.appVersion}) → ${url}  ${/\/login/.test(url) ? "❌ bounced" : "✅ in"}`);
  await ctx.close();
}
await browser.close();
await mc.closeDb();
