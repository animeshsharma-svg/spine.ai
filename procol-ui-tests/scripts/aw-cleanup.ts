/**
 * Deletes ONLY the approval workflows this test run created on DLF UAT:
 *  - every workflow whose name starts with "QA_Platform AW", and
 *  - the blank-named one made by the API case "F13 blank name" (passed as --also <uuid>, verified
 *    to have been created today by the test user before it is touched).
 * Nothing else is ever deleted. Prints what it will delete first.
 *   npx tsx scripts/aw-cleanup.ts [--also <uuid>] [--dry]
 */
import { api, appVersion, DLF, idOf } from "./aw-lib";

await appVersion();
const DRY = process.argv.includes("--dry");
const alsoI = process.argv.indexOf("--also");
const also = alsoI >= 0 ? process.argv[alsoI + 1] : null;

// before deleting, note whether the odd rules broke matching for the draft
const m = await api("GET", `/proposal/${(await import("./aw-lib")).uuidOf(DLF.draftProposalId)}/approval_workflows`);
console.log("match list now:", m.status, Array.isArray(m.json) ? m.json.map((f: any) => f.name) : m.text.slice(0, 200));

const victims: Array<{ uuid: string; name: string; id: number }> = [];
for (const type of ["team", "company"]) {
  for (let page = 1; page <= 20; page++) {
    const r = await api("GET", `/approval_workflow/approval_flows?page=${page}&initiator_type=${type}`);
    const rows: any[] = r.json?.approval_flows || [];
    for (const f of rows) if (String(f.name || "").startsWith("QA_Platform AW")) victims.push({ uuid: f.uuid, name: f.name, id: idOf(f.uuid) });
    if (page >= (r.json?.total_pages || 1)) break;
  }
}
if (also) {
  const r = await api("GET", `/approval_workflow/approval_flows/${also}`);
  const f = r.json;
  const today = new Date().toISOString().slice(0, 10);
  const createdToday = f?.created_at && new Date(f.created_at * 1000).toISOString().slice(0, 10) === today;
  const mine = (f?.steps || []).every((s: any) => (s.approvers || []).every((a: any) => a.name === "Test - Sumanta Dey"));
  if (f && (f.name || "") === "" && createdToday && mine) victims.push({ uuid: also, name: "(blank name, test-made)", id: idOf(also) });
  else console.log("--also refused: not a blank-named workflow made today with only the test user as approver", JSON.stringify(f).slice(0, 200));
}
console.log(`will delete ${victims.length}:`); for (const v of victims) console.log("  ", v.id, v.uuid, v.name);
if (DRY || !victims.length) { console.log(DRY ? "dry run" : "nothing to delete"); process.exit(0); }
const d = await api("DELETE", "/approval_workflow/approval_flows/delete_approval_flows", { uuids: victims.map((v) => v.uuid) });
console.log("delete →", d.status, d.text.slice(0, 200));
const check = await api("GET", `/approval_workflow/approval_flows?page=1&initiator_type=team`);
console.log("still named QA_Platform AW on page 1:", (check.json?.approval_flows || []).filter((f: any) => String(f.name).startsWith("QA_Platform AW")).length);
