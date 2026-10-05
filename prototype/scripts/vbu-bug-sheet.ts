/**
 * Write the vendor bulk upload bug sheet in full:
 * test-cases/vendor-bulk-bug-sheet.md.
 *
 *   npm run vbu:bugsheet
 *
 * For every bug in config/vbuBugs.json it puts together the plain-language
 * detail (config/vbuBugDetails.json), what the sandbox did in the NEWEST
 * evidence of each of its cases (the exact server answer, the pop-up the
 * screen shows for it, the history line, the error-sheet messages, the
 * records created, the values changed on the way in), the sheet that was
 * uploaded, and how often the case failed across every saved run.
 * Nothing here calls Procol.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { vbuBugs, type VbuBug, type VbuEvidence } from "../src/checks/vendorBulkExtras.js";
import { bugDetail, latestEvidence, seenFromEvidence, seenFromResult, TRIPWIRE_NOTE, usesTripwire, type Seen } from "../src/report/vbuBugDetail.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const RUNS = join(ROOT, "data", "runs");
const OUT = join(ROOT, "..", "test-cases", "vendor-bulk-bug-sheet.md");
const CASES: any[] = JSON.parse(readFileSync(join(ROOT, "data", "api-cases-extra", "vbu.json"), "utf8"));
const CLIENT: Record<number, string> = { 47053: "GMMCO LIMITED (47053)", 198678: "PROCOL DEMO (198678)" };

// ── every saved run that holds a vendor bulk case ──────────────────────────
type Hit = { run: string; companyId: number; pass: boolean; inconclusive: boolean; r: any };
const history = new Map<string, Hit[]>();
for (const f of readdirSync(RUNS).filter((f) => f.endsWith(".json")).sort()) {
  let run: any;
  try {
    run = JSON.parse(readFileSync(join(RUNS, f), "utf8"));
  } catch {
    continue;
  }
  for (const r of run.checkResults ?? []) {
    if (!String(r.id).startsWith("VBU-")) continue;
    const list = history.get(r.id) ?? [];
    list.push({ run: f.replace(/\.json$/, ""), companyId: run.companyId, pass: !!r.pass, inconclusive: !r.pass && !!r.inconclusive, r });
    history.set(r.id, list);
  }
}

const md = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const day = (run: string) => {
  const d = new Date(run.slice(0, 10));
  return Number.isNaN(d.getTime()) ? run.slice(0, 10) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

function tally(caseId: string): { text: string; fail: number; pass: number; last?: Hit; lastFail?: Hit } {
  const hits = (history.get(caseId) ?? []).filter((h) => !h.inconclusive);
  const fail = hits.filter((h) => !h.pass).length;
  const pass = hits.length - fail;
  const last = hits[hits.length - 1];
  const lastFail = [...hits].reverse().find((h) => !h.pass);
  const per = new Map<number, { f: number; p: number }>();
  for (const h of hits) {
    const t = per.get(h.companyId) ?? { f: 0, p: 0 };
    h.pass ? t.p++ : t.f++;
    per.set(h.companyId, t);
  }
  const where = [...per].map(([c, t]) => `${CLIENT[c] ?? c}: failed ${t.f} of ${t.f + t.p}`).join("; ");
  return { text: hits.length ? `${where}${last ? ` — last run ${day(last.run)}: ${last.pass ? "PASSED" : "FAILED"}` : ""}` : "not run yet", fail, pass, last, lastFail };
}

function sheetTable(ev: VbuEvidence): string[] {
  if (!ev.sheet?.headers.length) return [];
  const rows = ev.sheet.rows.slice(0, 5);
  return [
    `| Row | ${ev.sheet.headers.map(md).join(" | ")} |`,
    `|---|${ev.sheet.headers.map(() => "---").join("|")}|`,
    ...rows.map((r, i) => `| ${i + 4} | ${r.map((c) => (c === "" ? " " : md(c))).join(" | ")} |`),
    ...(ev.sheet.rows.length > 5 ? [`| … | ${ev.sheet.rows.length - 5} more row(s) | ${ev.sheet.headers.slice(2).map(() => "").join(" | ")} |`] : []),
  ];
}

function seenBullets(s: Seen): string[] {
  const out: string[] = [];
  if (s.server) out.push(`- **Server answer:** \`${s.server}\``);
  if (s.popup) out.push(`- **On screen:** ${s.popup}`);
  if (s.history) out.push(`- **Upload history:** ${s.history}`);
  if (s.errorSheet.length) out.push(`- **Error sheet (Error column):** ${s.errorSheet.join("; ")}`);
  if (s.changed.length) out.push(`- **Changed on the way in:** ${s.changed.join("; ")}`);
  if (s.records.length) out.push(`- **Created:** ${s.records.join("; ")}`);
  else if (s.server?.startsWith("HTTP 2")) out.push("- **Created:** nothing");
  out.push(`- **Test verdict:** ${s.verdict}`);
  return out;
}

function caseBlock(bug: VbuBug, caseId: string): string[] {
  const c = CASES.find((x) => x.id === caseId);
  const t = tally(caseId);
  const ev = latestEvidence(caseId, undefined, { failing: true });
  const hit = t.lastFail ?? t.last;
  const out: string[] = [`#### ${caseId} — ${c?.title ?? ""}`, ""];
  out.push(`*Reproduced:* ${t.text}.`, "");
  if (!ev && !hit) {
    out.push("Not run on the sandbox yet.", "");
    if (c?.tier === "real-mail") out.push("This case creates a Prospect, which emails the workspace's vendor-management team (real people), so it runs only with explicit approval.", "");
    return out;
  }
  if (ev) {
    const when = day(new Date(Number(ev.runStamp)).toISOString());
    const table = sheetTable(ev);
    if (table.length) {
      out.push(`**The sheet uploaded** (${when}, ${CLIENT[ev.companyId] ?? ev.companyId}; column names from row 3, vendors from row 4; empty columns left out):`, "", ...table, "");
    } else if (ev.request) {
      out.push(`**The request** (${when}, ${CLIENT[ev.companyId] ?? ev.companyId}): \`${ev.request.method} ${ev.request.path}\`${ev.request.body && !ev.fixture ? ` with \`${md(JSON.stringify(ev.request.body))}\`` : ""}`, "");
    }
    if (ev.fixture) {
      out.push(`Files: the dashboard serves the exact file at \`/api/vbu/sheet?e=${ev.id}\`; the template it is filled from is \`procol test/fixtures/vendor-bulk-upload/${ev.fixture.file}\`${ev.fixture.file2 ? ` (second sheet \`${ev.fixture.file2}\`)` : ""}.`, "");
    }
    if (usesTripwire(ev)) out.push(`> ${TRIPWIRE_NOTE}`, "");
    out.push(`**What the sandbox did** (run of ${when}):`, "", ...seenBullets(seenFromEvidence(ev)), "");
  } else if (hit) {
    out.push(`**The request** (${day(hit.run)}, ${CLIENT[hit.companyId] ?? hit.companyId}): \`${md(hit.r.inputSummary ?? `${hit.r.request?.method} ${hit.r.request?.path}`)}\``, "");
    out.push(`**What the sandbox did** (run ${hit.run}):`, "", ...seenBullets(seenFromResult(hit.r)), "");
  }
  return out;
}

const SEV = ["Critical", "High", "Medium", "Low"];
const bugs = [...vbuBugs()].sort(
  (a, b) => (a.status === "SUSPECTED" ? 1 : 0) - (b.status === "SUSPECTED" ? 1 : 0) || SEV.indexOf(a.severity) - SEV.indexOf(b.severity) || a.id.localeCompare(b.id),
);

const lines: string[] = [];
const reproduced = bugs.filter((b) => b.status !== "SUSPECTED");
const bySev = SEV.map((s) => `${reproduced.filter((b) => b.severity === s).length} ${s.toLowerCase()}`).join(", ");
const lastRun = [...history.values()].flat().map((h) => h.run).sort().pop() ?? "";
lines.push(
  "# Vendor bulk upload — bug sheet",
  "",
  `**${reproduced.length} bugs reproduced on the UAT sandbox (${bySev}), plus ${bugs.length - reproduced.length} found by reading the code and not yet run.** Clients: GMMCO LIMITED (47053, contactless ON, duplicate check on gst_no + address + pincode + account_group) and PROCOL DEMO (198678, contactless OFF, required extra fields). Latest run: ${day(lastRun)}. Backend: procol-backend origin/main with PR 16267 (65728150bc).`,
  "",
  "Generated by `npm run vbu:bugsheet` from the bug registry (`prototype/config/vbuBugs.json`), the plain-language detail (`prototype/config/vbuBugDetails.json`) and the newest evidence record of every case (`prototype/data/evidence/`). Do not edit by hand.",
  "",
  "## Where the buyer sees a result",
  "",
  "- **The pop-up after Upload.** When the file can be read the server answers HTTP 200 `{\"status\":\"success\"}` at once and the screen shows the green **“Vendors Sheet Uploaded”**. The rows are checked afterwards, in the background. A refused file gets a red pop-up with the server's message (for example **“Invalid file format”**), and a server crash gets the red **“Internal Server Error”**.",
  "- **The Bulk Upload history table:** Status, Total, Completed, Failed, Duplicate, Created, and a **Download Excel** button that is enabled only when Failed > 0.",
  "- **The error sheet** from Download Excel: the failed rows, each with its message in an **Error** column.",
  "- **The Vendors list**, under Vendors (active), Prospects or Rejected, with each vendor's record.",
  "",
  `> ${TRIPWIRE_NOTE} Every vendor the tests create is a test record: name QA_Platform_VBU_<stamp>_…, email qa_vbu_…@example.com, phone 0000000001, made-up tax numbers.`,
  "",
  "## All bugs at a glance",
  "",
  "| Bug | Severity | Area | What goes wrong | What the buyer sees | Reproduced |",
  "|---|---|---|---|---|---|",
);
for (const b of bugs) {
  const d = bugDetail(b.id);
  const t = b.cases.map((c) => tally(c));
  const f = t.reduce((n, x) => n + x.fail, 0);
  const all = t.reduce((n, x) => n + x.fail + x.pass, 0);
  const sees = d?.sees ?? "";
  lines.push(
    `| [${b.id}](#${b.id.toLowerCase()}) | ${b.severity}${b.status === "SUSPECTED" ? " (suspected)" : ""} | ${md(d?.area ?? "")} | ${md(b.title)} | ${md(sees || "—")} | ${d?.reproduced ?? (all ? `failed in ${f} of ${all} test runs` : "not run")} |`,
  );
}
lines.push("");

for (const b of bugs) {
  const d = bugDetail(b.id);
  lines.push(`<a id="${b.id.toLowerCase()}"></a>`, "", `## ${b.id} · ${b.severity}${b.status === "SUSPECTED" ? " · suspected from the code" : ""} — ${b.title}`, "");
  lines.push(`*Area:* ${d?.area ?? "—"} · *Status:* ${b.status === "SUSPECTED" ? "suspected (not reproduced)" : "open"} · *Found:* ${b.found} · *Test case(s):* ${b.cases.join(", ")}`, "");
  if (d) {
    lines.push(`**What the buyer does.** ${d.scenario}`, "");
    lines.push("**What should happen:**", "", ...d.expected.map((x) => `- ${x}`), "");
    lines.push(`**What happens instead.** ${d.actual}`, "");
    lines.push(`**What the buyer sees.** ${d.sees}`, "");
    if (d.note) lines.push(`> **Note on the test history.** ${d.note}`, "");
    lines.push(`**Why it matters.** ${d.impact}`, "");
  }
  lines.push(`**Cause in the code.** ${b.cause}`, "", `**Where:** \`${b.where}\``, "", `**Suggested fix.** ${b.fix}`, "");
  for (const c of b.cases) lines.push(...caseBlock(b, c));
  lines.push("---", "");
}

writeFileSync(OUT, lines.join("\n"));
console.log(`wrote ${OUT} — ${bugs.length} bugs`);
