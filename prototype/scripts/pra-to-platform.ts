// Put the PR-assignee sheet and its live run (4 Nov 2026, DLF UAT) into the platform's Test sheets:
// imports the xlsx as sheet "pr-assignee" and writes the run to data/sheet-runs so #/sheets shows the report.
import { readFileSync, writeFileSync } from "node:fs";
import { importSheetFile, sheetCases } from "../src/checks/sheetCases.js";
const XLSX = "/Users/animesh/Desktop/procol/test-cases/PR_Assignee_Filter_and_Notification_Test_Cases.xlsx";
const EV = "/Users/animesh/Desktop/procol/procol-ui-tests/evidence/pr-assignee-2026-11-04";
const res = JSON.parse(readFileSync("/Users/animesh/Desktop/procol/prototype/data/evidence/pr-assignee/sheet-results.json", "utf8"));
const info = importSheetFile(XLSX, "pr-assignee");
const cases = sheetCases("pr-assignee");
const verdict: Record<string, string> = { Pass: "Pass", Fail: "Fail", Blocked: "Not run", "Not Run": "Not run", Observation: "Partly checked", "Couldn't tell": "Couldn't tell" };
const sev = (s: string) => (s.startsWith("High") ? "High" : s.startsWith("Medium") ? "Medium" : "Low");
const id = `sheet-pra-${Date.now().toString(36)}`;
const run = {
  id, sheet: "pr-assignee", companyId: 43386, startedAt: "2026-11-04T10:52:21.778Z", endedAt: "2026-11-04T11:13:30.222Z", status: "done", total: cases.length,
  cases: cases.map((c) => {
    const r = res.results[c.id] || { status: "Not Run", actual: "Not reached in this run.", shots: [] };
    const bug = res.bugs.find((b: any) => b.cases.split(/,\s*/).includes(c.id));
    const shots = r.shots.map((f: string) => ({ file: `${EV}/${f}`, caption: f.replace(/\.png$/, "").replace(/-/g, " ") }));
    return {
      id: c.id, title: c.title, module: c.module, layer: c.layer, priority: c.priority, status: verdict[r.status] || "Not run",
      why: (r.status === "Blocked" ? "Blocked: " : "") + r.actual, startedFrom: "DLF Hospitality UAT, open PR list, signed in as Test - Sumanta Dey (super admin)",
      steps: c.steps.map((w, n) => ({ n: n + 1, words: w, outcome: r.status === "Pass" || r.status === "Fail" ? "done" : "not reached" })),
      shots, ms: 0, case: c,
      ...(bug && (r.status === "Fail" || r.status === "Observation") ? { bug: { title: `${bug.id}: ${bug.actual.split(". ")[0]}.`, severity: sev(bug.severity), whatHappened: bug.actual, expected: bug.expected, where: bug.where, shots: bug.shots.map((f: string) => ({ file: `${EV}/${f}`, caption: f })) } } : {}),
    };
  }),
};
writeFileSync(`/Users/animesh/Desktop/procol/prototype/data/sheet-runs/${id}.json`, JSON.stringify(run, null, 1));
const counts = run.cases.reduce((m: any, c: any) => ((m[c.status] = (m[c.status] || 0) + 1), m), {});
console.log("sheet", info.id, info.count, "cases; run", id, counts, "bugs", run.cases.filter((c: any) => c.bug).length);
