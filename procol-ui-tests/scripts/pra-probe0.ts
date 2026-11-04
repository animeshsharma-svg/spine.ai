import { search, itemUuid, itemsOf, appVersion } from "./pra-lib";
await appVersion();
const it = itemsOf(30974)[0];
for (const extra of [{}, { pr_item_uuids: [itemUuid(it.id)] }, { pr_item_ids: [it.id] }]) {
  const r = await search("", extra);
  console.log(JSON.stringify(extra), r.status, r.names.length, r.names.slice(0, 25).join(", "));
}
const a = await search("a", {}); console.log(a.status, JSON.stringify(a.raw.json).slice(0, 400));
