import { api, appVersion } from "./pra-lib";
await appVersion();
const f = encodeURIComponent(JSON.stringify({ status: ["active"] }));
const r = await api("GET", `/purchase_requests?page=1&page_size=50&filters=${f}&tab=active`);
console.log(r.status, Object.keys(r.json || {}).join(","));
const j = r.json; const rows: any[] = Array.isArray(j) ? j : ((Object.values(j || {}).find((v) => Array.isArray(v)) as any[]) || []);
console.log(JSON.stringify(rows[0]).slice(0, 1500));
const li = rows[0].line_items[0]; console.log(Object.keys(li).join(","), JSON.stringify({ ...li, data: undefined }).slice(0, 600));
const map: string[] = [];
for (let p = 1; p <= 8; p++) {
  const rr = await api("GET", `/purchase_requests?page=${p}&page_size=50&filters=${f}&tab=active`);
  for (const pr of rr.json.purchase_requests) for (const l of pr.line_items) map.push(`${p}|${pr.rfq_no}|${l.data?.prLno}|${l.uuid}|open=${l.quantity_open}/req=${l.quantity_requested}|${l.assignee?.name || l.assignee?.first_name || "-"}`);
}
const byPr = new Map<string, string[]>(); for (const m of map) { const k = m.split("|")[1]; byPr.set(k, [...(byPr.get(k) || []), m]); }
for (const [k, v] of byPr) if (!/HIT101|369/.test(k) || v.length < 3) console.log(k, v.length, v.slice(0, 3).join("  ;  ")); else console.log(k, v.length, "pages", [...new Set(v.map((x) => x.split("|")[0]))].join(","), "partly:", v.filter((x) => { const m = x.match(/open=([\d.]+)\/req=([\d.]+)/); return m && m[1] !== m[2]; }).length);
