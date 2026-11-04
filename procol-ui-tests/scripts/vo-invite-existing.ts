import { readFileSync } from "node:fs";
const API = "https://sec-api.ag-ri.in/api";
const tok = JSON.parse(readFileSync(".auth/tokens.json", "utf8")).accessTokenHeader;
const email = process.argv[2]; const firm = `QA_Platform VO Prospect ${Date.now() % 1e6}`;
const r = await fetch(API + "/invitations/send_invite", { method: "POST", headers: { "access-token": tok, "app-version": "9.4.377", "Content-Type": "application/json" }, body: JSON.stringify({ invite_type: "vendor_invite", firm_name: firm, name: "QA VO Prospect", email, category: "manufacturer", address: "QA Platform Street 9", city_id: 8, skip_vendor_onboarding: false }) });
const t = await r.text(); console.log(r.status, t.slice(0, 260)); console.log("FIRM", firm);
