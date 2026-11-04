// Sign in to console.ag-ri.in with the session token the tester gave (kept in .auth/console.json), save a storage state.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/template-studio";
const cfg = JSON.parse(readFileSync(".auth/console.json", "utf8"));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const meta: any = await fetch(cfg.app + "/meta.json").then((r) => r.json());
const dc: any = await fetch(`${cfg.api}/v1/dashboard_configuration?client_company_uuid=${cfg.companyUuid}`, { headers: { "access-token": cfg.accessTokenHeader, "app-version": meta.version } }).then((r) => r.json());
if (!dc?.user) throw new Error("no profile from dashboard_configuration");
await ctx.addInitScript((d: any) => {
  if (!localStorage.getItem("procol_access_token")) {
    localStorage.setItem("procol_access_token", JSON.stringify(d.tok));
    localStorage.setItem("procol_current_selected_api", JSON.stringify(d.api));
    localStorage.setItem("procol_app_version", JSON.stringify(d.ver));
    localStorage.setItem("procol_login_validity", String(Math.floor(Date.now() / 1000)));
    localStorage.setItem("procol_user_profile", JSON.stringify(d.user));
    localStorage.setItem("procol_support_dashboard_company", JSON.stringify(d.company));
  }
}, { tok: cfg.accessTokenHeader, api: cfg.api, ver: meta.version, user: dc.user, company: cfg.companyUuid });
const page = await ctx.newPage();
const seen: string[] = [];
page.on("response", async (r) => {
  const u = r.url();
  if (/dashboard_configuration/.test(u)) {
    seen.push(`${r.status()} ${u.replace(/^https:\/\/[^/]+/, "")}`);
    try { const d = await r.json(); const us = d.user || {}; const c = us.company || {};
      console.log("USER", (us.first_name || "").slice(0, 3) + "…", us.role, "employee:", us.is_procol_employee, "| COMPANY", typeof c === "object" ? c.name : c, "| VO", d.vendor_onboarding_version);
      const perms = (d.authorized_permissions || []).flatMap((b: any) => [...(b.company_permissions || []), ...(b.team_permissions || [])]);
      console.log("PERMS", [...new Set(perms.filter((p: any) => /template|admin_controls/.test(p.module.name)).map((p: any) => `${p.module.name}:${p.module.operation}`))].join(", "));
      if (us && Object.keys(us).length) await page.evaluate((p) => localStorage.setItem("procol_user_profile", JSON.stringify(p)), us);
    } catch {}
  }
});
await page.goto(cfg.app + "/orders", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
console.log("orders →", page.url());
await page.goto(cfg.app + "/controls", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);
console.log("controls →", page.url());
console.log((await page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 1800));
await page.screenshot({ path: `${OUT}/console_controls.png` });
console.log(seen.join("\n"));
await ctx.storageState({ path: ".auth/console-state.json" });
await browser.close();
