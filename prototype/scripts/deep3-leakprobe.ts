/** One-off investigation for deep3 (reads only, as QA vendors): where in a vendor's view do competitor values appear? */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
import { listQaVendors, vendorClient } from "../src/checks/matrixVendors.js";
import { appOf, appRefusal } from "../src/checks/appAccess.js";
const [company, trade, eg, readerN, ...needles] = process.argv.slice(2);
const vs = await listQaVendors(Number(company));
const reader = vs.find((v) => v.n === Number(readerN))!;
const { api, error } = await vendorClient(Number(company), reader.email);
if (!api) throw new Error(error);
const paths = [`/trade/${trade}?response_type=template&additional_fields=order_details`, `/v1/trade/${trade}/schema?response_type=template&additional_fields=order_details`, `/event_groups/${eg}`];
const names = Object.fromEntries(vs.map((v) => [v.name, `V${v.n} name`]).concat(vs.map((v) => [v.vendorCompanyUuid, `V${v.n} uuid`])));
for (const p of paths) {
  if (appRefusal(appOf(api), "GET", p)) { console.log("refused locally", p); continue; }
  const r: any = await api.attempt("GET", p, {});
  console.log(`== ${p} → ${r.status}`);
  const walk = (x: any, path: string, parent: any) => {
    if (Array.isArray(x)) return x.forEach((y, i) => walk(y, `${path}[${i}]`, x));
    if (x && typeof x === "object") return Object.entries(x).forEach(([k, y]) => walk(y, path ? `${path}.${k}` : k, x));
    const s = String(x);
    for (const n of needles) if (s === n || Number(s) === Number(n)) console.log(`  ${path} = ${s}`);
    for (const [n, w] of Object.entries(names)) if (typeof x === "string" && x.includes(n)) console.log(`  ${path} contains ${w}`);
  };
  walk(r.data, "", null);
  for (const pd of r.data?.participants_data ?? []) {
    const v = vs.find((x) => x.vendorCompanyUuid === pd.key);
    console.log(`  participant: ${v ? `QA vendor ${v.n}${v.n === reader.n ? " (self)" : ""}` : "other"} fields=[${Object.keys(pd).join(",")}] name_shown=${v ? pd.label === v.name : "?"} bid_id_shown=${!!pd.sheet_uuid} bid_status=${pd.bid_status} bids_count=${pd.bids_count} surrogate=${pd.is_surrogate_bid}`);
  }
}
await api.dispose?.();
process.exit(0);
