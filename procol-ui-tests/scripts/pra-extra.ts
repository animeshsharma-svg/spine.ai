import { readFileSync } from "node:fs";
import { search, itemUuid, itemsOf, uuidOf, appVersion, L, PRA_OUT } from "./pra-lib";
await appVersion();
const m = JSON.parse(readFileSync(`${PRA_OUT}/matrix.json`, "utf8"));
const sets = m.out.length, wrong = m.out.reduce((a: number, o: any) => a + o.wrong, 0), checks = m.out.reduce((a: number, o: any) => a + o.rows.length, 0);
const row = (prs: string[], uid: number) => m.out.find((o: any) => JSON.stringify(o.prs) === JSON.stringify(prs))?.rows.find((r: any) => r.uid === uid);
const put = (id: string, title: string, verdict: any, observed: string) => L.put({ id, title, verdict, observed, shots: [] } as any);
put("PRA-ONE-018", "The dropdown shows exactly the users who can see the PR (checked against the PR-list rule for every open DLF PR)", wrong === 0 ? "Pass" : "Fail",
  `${sets} selections (all 22 open PRs one by one + 6 multi-PR mixes) × ${m.reps.length} users, one from each distinct access group = ${checks} searches by name with the screen's own filter; ${wrong} differed from the PR-list rule (shared category/location token, or super admin). Not done: signing in as each user to open their own PR list (needs their sessions).`);
const up = row(["1010"], 18189), up2 = row(["HIT101"], 18189);
put("PRA-ONE-002", "A user limited to a different subcategory of the same category is not offered (Upasana's team has LIQUOR STORE > DOMESTIC SPARKLING only; PR 1010 is LIQUOR STORE > IMPORTED WHITE WINE)", up && !up.got && !up.exp ? "Pass" : "Fail", `Upasana searched by name with PR 1010 ticked → ${up?.got ? "offered" : "not offered"}`);
put("PRA-ONE-013", "A user whose team has the PR's subcategory is offered (Upasana's team has SOFT BEVERAGE STORE > SPARKLING WATER; HIT101 has SPARKLING WATER items)", up2 && up2.got && up2.exp ? "Pass" : "Fail", `Upasana searched by name with HIT101 ticked → ${up2?.got ? "offered" : "not offered"}`);
const pr18 = m.out.find((o: any) => JSON.stringify(o.prs) === '["PR-18"]');
put("PRA-ONE-007", "For a PR with items of two categories, a user who matches any one item is offered (PR-18: FOOD STORE item + SOFT BEVERAGE item)", pr18 && pr18.wrong === 0 ? "Pass" : "Fail", `PR-18 checked for ${pr18?.rows.length} access groups, ${pr18?.wrong} differences against the rule, which matches on the whole PR (any of its items)`);
put("PRA-ONE-014", "Users with the category, with the subcategory, and with no limitation are all offered; others are not", wrong === 0 ? "Pass" : "Fail", `covered by the matrix above (${checks} searches, ${wrong} differences)`);
// removed members (all memberships inactive → tokens emptied)
const dg = itemsOf(31201)[0]; const one1010 = itemsOf(30974)[0];
const res: string[] = []; let bad = 0;
for (const [uid, nm] of [[25946, "Ravinder Negi"], [25944, "Govind Bhatt"], [25949, "Vishal Dutt"], [25835, "Dining dummy user"]] as const) {
  for (const it of [dg, one1010]) { const r = await search(nm, { pr_item_uuids: [itemUuid(it.id)] }); const f = (r.raw.json?.users || []).some((x: any) => x.uuid === uuidOf(uid)); if (f) bad++; res.push(`${nm}/${it.pr === 31201 ? "DGOLF-4081" : "1010"}: ${f ? "OFFERED" : "not offered"}`); }
}
put("PRA-ONE-004", "A user removed from their team is not offered (4 DLF users whose team memberships are all ended)", bad === 0 ? "Pass" : "Fail", `${res.join("; ")}. Their visibility tokens are empty in the database, so they also cannot see the PRs.`);
put("PRA-ONE-003", "A user from a non-purchase team is not offered", "Not run", "DLF has no Sales or other non-purchase team member who shares a PR's category; the only users without a purchase team are the 4 removed users above (not offered).");
// other pickers (REG-001): no PR filter → no category filtering
const a = await search("Testing-T", {}), b = await search("Testing-T", { pr_item_uuids: [itemUuid(dg.id)] });
put("PRA-REG-001", "User pickers that do not send PR items are not affected", (a.raw.json?.users || []).some((x: any) => x.uuid === uuidOf(27876)) && !(b.raw.json?.users || []).some((x: any) => x.uuid === uuidOf(27876)) ? "Pass" : "Fail", `same search for Testing-T: without PR items → ${a.names.join(", ") || "none"}; with the DGOLF-4081 item → ${b.names.join(", ") || "none"}`);
put("PRA-ASN-006", "Assigning a user who cannot see the PR directly through the API (known gap, out of scope)", "Record", "POST assign_pr_to_user (DGOLF-4079 item → Procol Planner User, who cannot see DGOLF PRs) → HTTP 200 and saved. The gap is still open; logged for the follow-up that rejects non-visible assignees.");
