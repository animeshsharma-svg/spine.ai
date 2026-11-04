// Dropdown = PR visibility, checked per PR and per access group: search each representative user by name with the
// screen's filter (team_types purchase + pr_item_uuids of the selected items) and compare with the token rule.
import { writeFileSync } from "node:fs";
import { search, itemUuid, D, itemsOf, sees, purchaseUser, isSuper, uuidOf, appVersion, PRA_OUT, type U } from "./pra-lib";
await appVersion();
const users = D.users.filter(purchaseUser);
const groups = new Map<string, U[]>();
for (const u of users) { const k = `${u.role}|${[...(u.tok || [])].sort().join(",")}`; groups.set(k, [...(groups.get(k) || []), u]); }
const nameCount = (n: string) => D.users.filter((x) => x.nm === n).length;
const reps = [...groups.values()].map((g) => g.find((u) => u.nm && nameCount(u.nm) === 1) || g[0]);
console.log(users.length, "purchase users in", groups.size, "access groups");
const has = async (u: U, extra: Record<string, unknown>) => { const r = await search(u.nm, extra); return { status: r.status, found: (r.raw.json?.users || []).some((x: any) => x.uuid === uuidOf(u.id)) }; };
const out: any[] = [];
const prIds = Object.keys(D.prs).map(Number);
const sets: number[][] = [...prIds.map((p) => [p]), [30974, 30897], [30903, 30969], [31081, 30051], [30582, 29318], [31201, 31203], [30903, 30904, 30905]];
for (const set of sets) {
  const sel = set.map((p) => itemsOf(p)[0]?.id).filter(Boolean) as number[];
  const extra = { pr_item_uuids: sel.map(itemUuid) };
  let wrong = 0; const rows: any[] = [];
  for (const u of reps) {
    const exp = set.every((p) => sees(u, p));
    const got = await has(u, extra);
    if (got.found !== exp) wrong++;
    rows.push({ user: u.nm, uid: u.id, role: u.role, exp, got: got.found, status: got.status });
  }
  out.push({ prs: set.map((p) => D.prs[String(p)].rfq_no), set, items: sel, wrong, rows });
  console.log(set.map((p) => D.prs[String(p)].rfq_no).join("+").padEnd(40), "expected shown", rows.filter((r) => r.exp).length, "| wrong", wrong, wrong ? rows.filter((r) => r.exp !== r.got).map((r) => `${r.user}(exp ${r.exp} got ${r.got})`).join("; ") : "");
}
writeFileSync(`${PRA_OUT}/matrix.json`, JSON.stringify({ at: new Date().toISOString(), reps: reps.map((u) => ({ id: u.id, nm: u.nm, role: u.role, tok: u.tok, teams: u.teams })), out }, null, 1));
