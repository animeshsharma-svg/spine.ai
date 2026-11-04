import { api, appVersion } from "./pra-lib";
await appVersion();
const f = encodeURIComponent(JSON.stringify({ status: ["active"] }));
const rr = await api("GET", `/purchase_requests?page=1&page_size=50&filters=${f}&tab=active`);
for (const pr of rr.json.purchase_requests) if (["1005", "1004", "100001"].includes(pr.rfq_no)) for (const l of pr.line_items) console.log(pr.rfq_no, l.data?.prLno, l.uuid, `open ${l.quantity_open}/${l.quantity_requested}`, l.assignee?.name ?? l.assignee?.first_name ?? JSON.stringify(l.assignee)?.slice(0, 40));
