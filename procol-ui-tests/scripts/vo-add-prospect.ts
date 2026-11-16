import { readFileSync, writeFileSync } from "node:fs";
import { vendorLogin, vcall } from "./vo-vendor-login.js";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const setup = JSON.parse(readFileSync(`${OUT}/setup.json`, "utf8"));
const tok = JSON.parse(readFileSync(".auth/tokens.json", "utf8")).accessTokenHeader;
for (const [key, tplKey] of process.argv.slice(2).map((a) => a.split("="))) {
  const email = `qa_voe_${setup.stamp}_${key.toLowerCase()}@example.com`, firm = `QA_Platform VOE ${setup.stamp} ${key} Vendor`;
  const r = await fetch("https://sec-api.ag-ri.in/api/invitations/send_invite", { method: "POST", headers: { "access-token": tok, "app-version": "9.4.377", "Content-Type": "application/json" }, body: JSON.stringify({ invite_type: "vendor_invite", firm_name: firm, name: `QA VOE ${key}`, email, category: "manufacturer", address: `QA Platform Street ${key}`, city_id: 8, skip_vendor_onboarding: false }) });
  const j: any = await r.json();
  const { token } = await vendorLogin(email);
  const su = await vcall(token, "POST", "/v1/vendor_signup", { email, name: `QA VOE ${key}`, firm_name: `${firm} Home`, city_id: 8, address: `QA Platform Street ${key}`, terms_and_policy_accepted: true });
  console.log(key, "invite", r.status, "signup", su.s);
  setup.prospects[key] = { email, firm, uuid: j?.company?.uuid, invite: r.status, signup: su.s };
  setup.templates[key] = setup.templates[tplKey];
}
writeFileSync(`${OUT}/setup.json`, JSON.stringify(setup, null, 2));
const { closePool } = await import("file:///Users/animesh/Desktop/procol/procol%20test/src/db/pool.ts"); await closePool();
