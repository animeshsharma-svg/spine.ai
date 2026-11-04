import { api, appVersion } from "./pra-lib";
await appVersion();
const f = encodeURIComponent(JSON.stringify({ status: ["active"] }));
for (let p = 1; p <= 3; p++) { const rr = await api("GET", `/purchase_requests?page=${p}&page_size=50&filters=${f}&tab=active`); console.log(p, rr.json.purchase_requests.map((x: any) => `${x.rfq_no}(${x.line_items.length})`).join(" ")); }
