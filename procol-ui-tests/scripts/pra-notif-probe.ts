import { tokenFor, PLANNER, TESTING_T, ME, api, appVersion } from "./pra-lib";
await appVersion();
for (const u of [ME, PLANNER, TESTING_T]) {
  try {
    const t = await tokenFor(u);
    const r = await api("GET", "/notification/menu_items", undefined, { token: t });
    const items = r.json?.items || r.json?.data || r.json?.menu_items || r.json;
    console.log(u, r.status, Object.keys(r.json || {}).join(","), Array.isArray(items) ? items.length : typeof items);
    const arr = Array.isArray(items) ? items : [];
    console.log(JSON.stringify(arr.slice(0, 2)).slice(0, 900));
  } catch (e: any) { console.log(u, "ERR", e.message.slice(0, 200)); }
}
