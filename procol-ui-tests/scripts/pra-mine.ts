import { api, appVersion } from "./pra-lib";
await appVersion();
let key: any = undefined; const all: any[] = [];
for (let i = 0; i < 6; i++) {
  const r = await api("GET", `/notification/menu_items${key ? `?last_evaluated_key=${encodeURIComponent(JSON.stringify(key))}` : ""}`);
  all.push(...(r.json?.items || [])); key = r.json?.last_evaluated_key; if (!key) break;
}
console.log("count", all.length, "unseen", all.filter((x) => x.data?.status === "unseen").length);
const pr = all.filter((x) => /purchase|PR /i.test(JSON.stringify(x.data)) || /pr/i.test(x.type));
console.log(pr.slice(0, 12).map((x) => `${new Date(x.created_at * 1000).toISOString().slice(0, 16)} ${x.type} | ${x.data?.title} | ${x.data?.message} | ${x.data?.deeplink_url || x.data?.deeplink_uuid_url}`).join("\n"));
console.log([...new Set(all.map((x) => String(x.type).replace(/_\d+$/, "")))].join(", "));
