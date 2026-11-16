// Remove my QA buyer form B1 so the company's own buyer form is the active one again; confirm by DB (read-only).
import { readFileSync } from "node:fs";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const setup = JSON.parse(readFileSync(`${OUT}/setup.json`, "utf8"));
if (!/^QA_Platform VOE /.test(setup.buyerForm.name)) throw new Error("not my template");
const tok = JSON.parse(readFileSync(".auth/tokens.json", "utf8")).accessTokenHeader;
const r = await fetch(`https://sec-api.ag-ri.in/api/templates/${encodeURIComponent(setup.buyerForm.uuid)}`, { method: "DELETE", headers: { "access-token": tok, "app-version": "9.4.377" } });
console.log("delete B1", r.status, (await r.text()).slice(0, 200));
const { query, closePool } = await import("file:///Users/animesh/Desktop/procol/procol%20test/src/db/pool.ts");
console.log(JSON.stringify(await query("select id, name, status from templates where company_id=198678 and 't-vendor_onboarding_buyer_form' = any(type_identifier) order by id")));
await closePool();
