import { readFileSync } from "node:fs";
const API = "https://sec-api.ag-ri.in/api";
const tok = JSON.parse(readFileSync(".auth/tokens.json", "utf8")).accessTokenHeader;
for (const tab of ["verified", "unverified", "onboarding_in_progress", "rejected"]) {
  const out: any[] = [];
  for (let p = 1; p <= 40; p++) {
    const r = await fetch(`${API}/companies/all_vendors?tab=${tab}&page=${p}`, { headers: { "access-token": tok, "app-version": "1.0.0" } }).then((r) => r.json()).catch(() => ({}));
    const cs = r.companies ?? []; if (!cs.length) break;
    out.push(...cs.filter((c: any) => /QA_Platform|Qa_platform/i.test(c.name)));
  }
  console.log(tab, out.map((c) => `${c.name} [${c.uuid}] ${c.vendor_status ?? c.status}`).join("\n   "));
}
