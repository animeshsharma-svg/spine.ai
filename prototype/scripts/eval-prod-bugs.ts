/**
 * THE PRODUCTION RECORD AS THE YARDSTICK — the RCA / triage sheet of support tickets
 * (data/eval/prod/rca-triage.xlsx, customer data: never committed, names never printed).
 *
 * For every ticket: a model reads the CS description, the engineer's description, the triage
 * checks and the RCA, and says whether it was a real product DEFECT (vs config, data, user error,
 * feature request, unclear), which module, which bug class, and a one-line summary with no names.
 * Then, for each defect in the events module:
 *   • covered  — the written catalog has a case about it (matchTestCase, words + memory, no model);
 *   • re-checkable — that case has a stored plan the platform can run (data/compiled-plans/*);
 *   • already found — the verified bug sheet names the same behaviour (BUG-xx).
 * Those three shares are what "would spine.ai have caught what customers reported" means.
 *
 *   npx tsx scripts/eval-prod-bugs.ts [--limit N]
 * Report: data/eval/reports/prod-bugs-<date>.json and .md (summaries only, no names, no ticket text)
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
const { chat } = await import("../src/ai/llm.js");
const { matchTestCase } = await import("../src/checks/caseMatcher.js");
const { wilson } = await import("../src/eval/metrics.js");

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const limit = Number(arg("limit") ?? 0) || Infinity;
const t = () => new Date().toISOString().slice(11, 19);

const xlsx = join(here, "..", "data", "eval", "prod", "rca-triage.xlsx");
if (!existsSync(xlsx)) {
  console.log(`no ${xlsx} — drop the RCA sheet there first`);
  process.exit(1);
}
const py = `
import openpyxl,json,glob
ws=openpyxl.load_workbook(${JSON.stringify(xlsx)},read_only=True)["Master data"]
rows=list(ws.iter_rows(values_only=True)); head=[str(c or "").strip() for c in rows[0]][:11]
data=[dict(zip(head,[("" if c is None else str(c)) for c in r[:11]])) for r in rows[1:] if r and r[0]]
bugs=[]
for f in sorted(glob.glob(${JSON.stringify(join(here, "..", "..", "docs", "bugs", "Procol_bugs_found_*.xlsx"))}))[-1:]:
    bws=openpyxl.load_workbook(f,read_only=True)["Bugs"]; br=list(bws.iter_rows(values_only=True)); bh=[str(c or "") for c in br[0]]
    bugs=[dict(zip(bh,[("" if c is None else str(c)) for c in r])) for r in br[1:] if r and r[0]]
print(json.dumps({"tickets":data,"bugs":bugs}))`;
const src = JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })) as { tickets: Array<Record<string, string>>; bugs: Array<Record<string, string>> };
const tickets = src.tickets.slice(0, limit);
const bugList = src.bugs.map((b) => `${b["Bug #"]}: ${b["Bug"]}`).join("\n");
console.log(`[${t()}] ${tickets.length} tickets · ${src.bugs.length} verified bugs on the sheet`);

const PLAN_DIRS = ["api", "ui", "ui-prepared"].map((d) => join(here, "..", "data", "compiled-plans", d));
const storedPlanIds = new Set(PLAN_DIRS.flatMap((d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")) : [])));

interface Row {
  ticket: string;
  date: string;
  verdict: string;
  module: string;
  bugClass: string;
  events: boolean;
  summary: string;
  knownBug: string | null;
  coveredBy: string[];
  partialBy: string[];
  rechecks: string[];
}
const rows: Row[] = [];
const system = [
  "You triage support tickets of Procol (B2B sourcing: events/RFX, bidding, awarding/NFA, QCS, POs, invoices, vendors, master data, admin configs). For EACH ticket, from the CS description, the engineer's description, the triage checks, the finding and the RCA, decide:",
  "- verdict: defect (the product misbehaved against its rules) | config (a setting/flag had to be changed) | data (bad or missing data, a cleanup) | user_error | feature_request | unclear",
  "- module: events | bidding | awarding | qcs | po | invoice | vendor | master_data | admin | approvals | reports | other",
  "- bugClass: calculation | state | visibility | permission | validation | config | ui | integration | performance | data | other",
  "- events: true when the behaviour lives in the sourcing-events flow (create/publish/stages/bids/QCS/awarding/NFA/PO-from-award/versions), false otherwise",
  "- summary: ONE line in plain words with NO person or company names and no ticket numbers — what the product did wrong (or what was asked), as a tester would phrase it",
  "- knownBug: the id (BUG-xx) from KNOWN BUGS whose behaviour is the same, or null",
  'Return ONLY a JSON array in the ticket order: [{"ticket":"<id>","verdict":"…","module":"…","bugClass":"…","events":true|false,"summary":"…","knownBug":"BUG-12"|null}].',
].join("\n");
for (let i = 0; i < tickets.length; i += 8) {
  const batch = tickets.slice(i, i + 8);
  const user = `KNOWN BUGS (verified by the QA platform):\n${bugList}\n\nTICKETS:\n` + batch.map((x) => `### ${x["Ticket ID"]} (${x["Date Created"].slice(0, 10)})\nCS: ${x["Description by CS"].slice(0, 900)}\nEngineering: ${x["Description by Engineering"].slice(0, 700)}\nChecks: ${x["Checks Performed (Triage)"].slice(0, 400)}\nFinding: ${x["Finding"].slice(0, 200)}\nNotes: ${x["Notes"].slice(0, 300)}\nRCA: ${x["RCA"].slice(0, 900)}`).join("\n\n");
  const raw = await chat([{ role: "system", content: system }, { role: "user", content: user }], { tier: "reason", temperature: 0, maxTokens: 2500 }).catch(() => "");
  let arr: any[] = [];
  try {
    arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
  } catch {
    arr = [];
  }
  for (const x of batch) {
    const j = arr.find((a) => String(a?.ticket) === String(x["Ticket ID"])) ?? arr[batch.indexOf(x)];
    rows.push({ ticket: String(x["Ticket ID"]).replace(/\.0$/, ""), date: x["Date Created"].slice(0, 10), verdict: String(j?.verdict ?? "unclear"), module: String(j?.module ?? "other"), bugClass: String(j?.bugClass ?? "other"), events: j?.events === true, summary: String(j?.summary ?? "").slice(0, 220), knownBug: typeof j?.knownBug === "string" && /^BUG-\d+/.test(j.knownBug) ? j.knownBug : null, coveredBy: [], partialBy: [], rechecks: [] });
  }
  console.log(`[${t()}] classified ${Math.min(i + 8, tickets.length)}/${tickets.length}`);
}

// the catalog: is there a case about it, and can that case run?
for (const r of rows) {
  if (r.verdict !== "defect" || !r.events || !r.summary) continue;
  const m = await matchTestCase(r.summary, { llm: false, top: 5 }).catch(() => null);
  if (!m) continue;
  r.coveredBy = m.same.filter((c) => c.origin === "catalog").map((c) => c.id).slice(0, 5);
  r.partialBy = m.partial.filter((c) => c.origin === "catalog").map((c) => c.id).slice(0, 5);
  r.rechecks = [...r.coveredBy, ...r.partialBy].filter((id) => storedPlanIds.has(id));
}

const defects = rows.filter((r) => r.verdict === "defect");
const ev = defects.filter((r) => r.events);
const covered = ev.filter((r) => r.coveredBy.length || r.partialBy.length);
const exact = ev.filter((r) => r.coveredBy.length);
const rechecks = ev.filter((r) => r.rechecks.length);
const known = ev.filter((r) => r.knownBug);
const count = (k: keyof Row, list: Row[]) => Object.entries(list.reduce<Record<string, number>>((m, r) => ((m[String(r[k])] = (m[String(r[k])] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
const report = {
  at: new Date().toISOString(), tickets: rows.length, verdicts: count("verdict", rows), modules: count("module", defects), bugClasses: count("bugClass", ev),
  defects: defects.length, eventsDefects: ev.length,
  coveredByCatalog: [covered.length, ev.length, wilson(covered.length, ev.length)], coveredExactly: [exact.length, ev.length, wilson(exact.length, ev.length)],
  recheckable: [rechecks.length, ev.length, wilson(rechecks.length, ev.length)], alreadyOnBugSheet: [known.length, ev.length, wilson(known.length, ev.length)],
  rows: rows.map((r) => ({ ...r })),
};
const dir = join(here, "..", "data", "eval", "reports");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(join(dir, `prod-bugs-${stamp}.json`), JSON.stringify(report, null, 2));
const pct = (x: any) => `${x[0]}/${x[1]} (${x[1] ? Math.round((x[0] / x[1]) * 100) : 0}%${x[2] ? `, 95% ${Math.round(x[2][0] * 100)}–${Math.round(x[2][1] * 100)}%` : ""})`;
const md = [
  `# Production tickets as the yardstick — ${report.at.slice(0, 16)}`,
  "",
  `${rows.length} RCA'd support tickets (${rows[0]?.date ?? "?"} → ${rows[rows.length - 1]?.date ?? "?"}), read by a model from the CS and engineering descriptions, the triage checks and the RCA. Names and ticket text are not in this report.`,
  "",
  `- Verdicts: ${report.verdicts.map(([k, n]) => `${k} ${n}`).join(" · ")}`,
  `- Real defects: **${defects.length}**, of which in the events flow: **${ev.length}** (modules of all defects: ${report.modules.map(([k, n]) => `${k} ${n}`).join(", ")})`,
  `- Events defects by class: ${report.bugClasses.map(([k, n]) => `${k} ${n}`).join(", ")}`,
  "",
  "| Of the events defects customers reported | Share |",
  "| --- | --- |",
  `| A written case in the catalog is about it (same or partial) | ${pct(report.coveredByCatalog)} |`,
  `| … exactly (a case asserting that behaviour) | ${pct(report.coveredExactly)} |`,
  `| A stored plan can re-check it today | ${pct(report.recheckable)} |`,
  `| Already on the verified bug sheet (found by spine.ai on UAT) | ${pct(report.alreadyOnBugSheet)} |`,
  "",
  "| Ticket | Date | Verdict | Module | Class | Events | Summary (no names) | Known bug | Covered by | Re-checks |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((r) => `| ${r.ticket} | ${r.date} | ${r.verdict} | ${r.module} | ${r.bugClass} | ${r.events ? "yes" : ""} | ${r.summary.replace(/\|/g, "/")} | ${r.knownBug ?? ""} | ${[...r.coveredBy, ...r.partialBy.map((x) => `${x}~`)].join(" ")} | ${r.rechecks.join(" ")} |`),
].join("\n");
writeFileSync(join(dir, `prod-bugs-${stamp}.md`), md);
console.log(`[${t()}] defects ${defects.length} (events ${ev.length}) · covered ${pct(report.coveredByCatalog)} · re-checkable ${pct(report.recheckable)} · already found ${pct(report.alreadyOnBugSheet)}`);
console.log(`report → data/eval/reports/prod-bugs-${stamp}.md`);
process.exit(0);
