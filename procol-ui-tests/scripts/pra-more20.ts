import { search, itemUuid, itemsOf, D, sees, purchaseUser, uuidOf, appVersion, L } from "./pra-lib";
await appVersion();
const it = itemsOf(31081)[0]; const f = { pr_item_uuids: [itemUuid(it.id)] };
const first = await search("", f);
const firstU = new Set((first.raw.json?.users || []).map((x: any) => x.uuid));
const allowed = D.users.filter((u) => purchaseUser(u) && sees(u, 31081));
const outside = allowed.filter((u) => !firstU.has(uuidOf(u.id)) && D.users.filter((x) => x.nm === u.nm).length === 1).slice(0, 3);
const found: string[] = [];
for (const u of outside) { const r = await search(u.nm, f); found.push(`${u.nm}: ${(r.raw.json?.users || []).some((x: any) => x.uuid === uuidOf(u.id)) ? "found" : "NOT found"}`); }
const hidden = D.users.find((u) => purchaseUser(u) && !sees(u, 31081) && D.users.filter((x) => x.nm === u.nm).length === 1)!;
const h = await search(hidden.nm, f); const hf = (h.raw.json?.users || []).some((x: any) => x.uuid === uuidOf(hidden.id));
L.put({ id: "PRA-ONE-011", title: "When more than 20 users can see the PR, typing finds the rest", verdict: first.names.length <= 20 && found.every((x) => x.endsWith(": found")) && !hf ? "Pass" : "Fail",
  observed: `PR 369 can be seen by ${allowed.length} purchase users; the first list shows ${first.names.length}. Typed three allowed users missing from it → ${found.join("; ")}. Typed ${hidden.nm}, who cannot see 369 → ${hf ? "FOUND" : "not found"}. (On DGOLF-4081 the screen also showed exactly 20 names at first.)`, shots: ["/Users/animesh/Desktop/procol/prototype/data/evidence/pr-assignee/shots/D01-dgolf4081-list.png"] } as any);
