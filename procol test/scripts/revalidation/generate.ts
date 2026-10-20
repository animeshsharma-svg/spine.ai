/**
 * Generate the vendor revalidation case set from spec.ts and the guide's
 * manual workbook. Writes:
 *
 *   prototype/data/api-cases-extra/revalidation.json   runnable cases (Run tests → Vendor revalidation)
 *   test-cases/api-vendor-revalidation.md               the automation catalog (API-XREV-*)
 *   test-cases/product-vendor-revalidation.md           the 143 manual cases (PRD-VREV-*)
 *   test-cases/vendor-revalidation-findings.md          the findings, for sharing
 *   prototype/config/revalBugs.json                     the findings, for the runner
 *
 *   cd prototype && npm run reval:gen        (then npm run cases:import)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

import { BUGS, CASES, FILES, MODULES, type RevCase } from "./spec.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..", "..");
const OUT_JSON = join(ROOT, "prototype", "data", "api-cases-extra", "revalidation.json");
const OUT_MD = join(ROOT, "test-cases", "api-vendor-revalidation.md");
const OUT_MANUAL = join(ROOT, "test-cases", "product-vendor-revalidation.md");
const OUT_FINDINGS = join(ROOT, "test-cases", "vendor-revalidation-findings.md");
const OUT_BUGS = join(ROOT, "prototype", "config", "revalBugs.json");
const WORKBOOK = join(ROOT, "test-cases", "Vendor_Revalidation_Test_Cases.xlsx");
const BACKEND_AT = "procol-backend rfx-uat-main @ 76b986a012 (15 Oct 2026)";

const PRI = { C: "P0", H: "P1", M: "P2", L: "P3" } as const;
const SEV = { C: "Critical", H: "High", M: "Medium", L: "Low" } as const;
const TYPE = { Neg: "Negative", Pos: "Positive", Edge: "Edge" } as const;
const RUNS = new Set(["read", "audit", "listing", "config", "run"]);

/** "CTL:103-106 (…)" → "app/controllers/…rb:103-106 (…)" */
const expandRule = (r: string) => r.replace(/\b(CTL|SCH|QTW|RUN|VW|SW|VCS|VR|PG|VAL|VVH|CCH|CC|CO|FH)\b(?=[:\s),]|$)/g, (k) => FILES[k] ?? k);
const groupOf = (c: RevCase) => `API-XREV-${c.id[0]}`;
const catalogId = (c: RevCase) => `API-XREV-${c.id}`;

function callOf(c: RevCase): { method: string; path: string } {
  // audits send no request; the path only names what they read (SELECT only)
  if (c.tier === "audit") return { method: "GET", path: "/(database)/vendor_validation_histories" };
  if (c.call) {
    const m = c.call.match(/^([A-Z]+(?: \+ [A-Z]+)?)\s+(\S.*)$/);
    if (m) return { method: m[1].split(" ")[0], path: m[2] };
    return { method: "GET", path: c.call };
  }
  if (c.tier === "run") return { method: "POST", path: "/api/vendor_revalidation_qa/trigger" };
  if (c.tier === "config") return { method: "PUT", path: "/api/vendor_revalidation_qa/config" };
  if (c.tier === "listing") return { method: "GET", path: "/api/companies/all_vendors" };
  return { method: "GET", path: "/api/vendor_revalidation_qa" };
}

function howItRuns(c: RevCase): string {
  switch (c.tier) {
    case "read": return "Runs every time: a GET to the QA API, nothing changes.";
    case "audit": return "Runs every time: SELECTs on the runs already recorded, no request at all.";
    case "listing": return "Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database.";
    case "config": return "Needs VR_QA_TOKEN (the client's buyer access-token). A run request the API must refuse; nothing runs and nothing changes.";
    case "run": return `Needs VR_QA_TOKEN. A real run on ${c.needs?.length ? c.needs.join(", ") : "1–3 vendors"} under the client's own settings (they are not changed).`;
    case "ops": return `Not run: ${c.why}.`;
    case "removed": return `Not run: ${c.why}.`;
    default: return `Not run unattended (${c.tier}): ${c.why ?? ""}`;
  }
}

// ── runnable cases ────────────────────────────────────────────────────
const runnable = CASES.map((c) => {
  const { method, path } = callOf(c);
  return {
    id: catalogId(c),
    feature: MODULES[c.id[0]].feature,
    title: c.title,
    type: TYPE[c.type],
    priority: PRI[c.p],
    severity: SEV[c.p],
    preconditions: howItRuns(c),
    steps: c.steps,
    method,
    path,
    expected: "accept",
    expectedResult: c.expected,
    rule: expandRule(c.rule),
    ...(c.guide ? { disagree: `Guide: ${c.guide}` } : {}),
    tier: c.tier,
    reval: { key: c.id, tier: c.tier, ...(c.needs ? { needs: c.needs } : {}), ...(c.why ? { why: c.why } : {}) },
  };
});
writeFileSync(OUT_JSON, JSON.stringify(runnable, null, 2) + "\n");

// ── the catalog, for people ──────────────────────────────────────────
const tierWord: Record<string, string> = { read: "read", audit: "audit", listing: "listing", config: "refused request (token)", run: "run (token)", dev: "dev", manual: "manual", ui: "ui", code: "code", ops: "needs ops", removed: "feature removed" };
const count = (pred: (c: RevCase) => boolean) => CASES.filter(pred).length;
const md: string[] = [];
md.push(`# Vendor revalidation — test cases

The scheduling engine re-checks every vendor's GST, PAN, MSME and bank on the cycle the client's config sets (nightly at
11 pm IST, or on a QA trigger), writes one row per document value and one final status per client–vendor link, and shows
it on the vendor listing, the vendor page and the Excel download.

These are the guide's 138 automation cases (\`test-cases/Vendor_Revalidation_QA_Automation_Guide.md\`, Part 2) read
against the code — **${BACKEND_AT}** — plus ${count((c) => !!c.added)} cases the code revealed. Each case keeps the guide's
id; **Expected** is what the build does (what the runner asserts); where the guide says otherwise it is quoted, and a
finding (REV-nn, \`test-cases/vendor-revalidation-findings.md\`) is named where the code contradicts the guide or the TRD.
Every case mirrors a runnable case in \`prototype/data/api-cases-extra/revalidation.json\`; both are generated from
\`procol test/scripts/revalidation/spec.ts\`. The 143 manual cases are in \`product-vendor-revalidation.md\`.

**Run it.** Tick *Vendor revalidation* in Run tests, or \`cd prototype && npm run reval:run -- --company 47053\`.

| How a case runs | Cases | Needs |
| --- | --- | --- |
| read — a GET to the QA API | ${count((c) => c.tier === "read")} | nothing |
| audit — SELECTs on recorded runs | ${count((c) => c.tier === "audit")} | nothing |
| listing — the buyer's listing / vendor page / Excel vs the database | ${count((c) => c.tier === "listing")} | nothing (the client's session) |
| refused request — a run request the API must refuse | ${count((c) => c.tier === "config")} | \`VR_QA_TOKEN\` |
| run — a real run on 1–5 named vendors, client's own settings | ${count((c) => c.tier === "run")} | \`VR_QA_TOKEN\` |
| needs ops — the case needs GMMCO's settings changed (no API since 20 Oct) | ${count((c) => c.tier === "ops")} | Procol ops |
| feature removed on 20 Oct (settings API, cancel, top_errors, QA controls) | ${count((c) => c.tier === "removed")} | — |
| dev / manual / ui / code — reported as not run, with why | ${count((c) => ["dev", "manual", "ui", "code"].includes(c.tier))} | a person or dev |

**Host and token.** Since the 20 Oct 2026 rewrite a buyer allowed to edit vendors starts a run for their own company:
\`POST /api/vendor_validation/trigger?workspace_id=<client>\` and \`GET /api/vendor_validation/runs/<run_id>?job_id=&workspace_id=\`,
on \`https://rfx-uat-api.ag-ri.in\` only (override with \`VR_API_BASE\`). The settings API and cancel were removed;
settings are set by Procol ops. \`VR_QA_TOKEN\` in \`prototype/.env\` is that buyer's \`access-token\` (never logged).
Runs are started only for clients in \`VR_WRITE_CLIENTS\` (default 47053).

**Safety, in the order it matters.** \`vendor_ids: []\` is never sent (the API reads it as every vendor — REV-02); no
trigger without a scope or with more than 5 vendors; the config is backed up to \`prototype/data/reval-backup/\` before
the first write and restored after (a backup left by a crash is restored first); mechanics cases use a *silent* config
whose only document reads a column that does not exist, so every row is skipped and no provider is called; vendors whose
shown status a case changed are re-run under the original config. The client super-admin session is used for GETs only.

**Test vendors.** The guide's prepared vendors (V-PASS, V-BADGST …) are found from the client's last run and company
records (V-PASS = every check passed, V-NODOCS = nothing provided, …); an id in
\`prototype/config/revalidationVendors.json\` wins: \`{"47053": {"V-CANCELLED": 12345}}\`. Vendors already shown as
Skipped are preferred, so a run changes nothing a buyer sees.
`);
let n = 0;
for (const [m, mod] of Object.entries(MODULES)) {
  n++;
  md.push(`\n## ${n}. ${mod.title}\n\n${mod.intro}\n`);
  for (const c of CASES.filter((x) => x.id[0] === m)) {
    const verdict = RUNS.has(c.tier) ? "automate" : c.tier === "code" ? "automate-later" : "manual";
    const bug = c.finding ? BUGS.find((b) => b.id === c.finding) : undefined;
    const why = [
      c.added ? "Added from the code (not in the guide)." : `Guide ${c.id} (${c.auto}).`,
      bug ? `Finding ${bug.id} (${bug.severity}): ${bug.title}.` : "",
    ].filter(Boolean).join(" ");
    md.push(`#### ${catalogId(c)} — ${c.title}`);
    md.push(`- **Why it matters.** ${why}`);
    md.push(`- **Setup.** ${howItRuns(c)}${c.needs?.length ? ` Test vendors: ${c.needs.join(", ")}.` : ""}`);
    md.push(`- **Steps.** ${c.steps.map((s, i) => `${i + 1}. ${s}`).join(" ")}`);
    md.push(`- **Expected.** ${c.expected}${c.guide ? ` _Guide:_ ${c.guide}` : ""}`);
    md.push(`- **Oracle.** ${c.tier === "audit" ? "The database rows (SELECT only)." : c.tier === "listing" ? "The listing / vendor page reply against the rows and link worked out from the database." : c.tier === "run" ? "GET /runs, the rows and the client–vendor link in the database, and the listing." : RUNS.has(c.tier) ? "The QA API's reply (status, error code, message) and GET /config afterwards." : "—"}`);
    md.push(`- **Trace.** ${PRI[c.p]} · ${verdict} · \`${groupOf(c)}\` · ${tierWord[c.tier]} · \`${expandRule(c.rule)}\`${c.finding ? ` · \`${c.finding}\`` : ""}\n`);
  }
}
writeFileSync(OUT_MD, md.join("\n").replace(/\n{3,}/g, "\n\n"));

// ── the manual cases, from the guide's workbook ──────────────────────
const wb = XLSX.read(readFileSync(WORKBOOK));
const grid: any[][] = XLSX.utils.sheet_to_json(wb.Sheets["Test Cases"] ?? wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
const head = grid[0].map((h: any) => String(h).trim());
const col = (name: string) => head.findIndex((h: string) => h.toLowerCase() === name.toLowerCase());
const C = { id: col("TC ID"), module: col("Module"), scen: col("Scenario"), tc: col("Test Case"), pre: col("Pre-condition"), data: col("Test Data"), steps: col("Test Steps"), exp: col("Expected Result"), pri: col("Priority"), type: col("Type") };
const rows = grid.slice(1).filter((r) => String(r[C.id]).startsWith("VR_TC_"));
const manual: string[] = [];
manual.push(`# Vendor revalidation — manual test cases

The ${rows.length} manual cases from \`test-cases/Vendor_Revalidation_Test_Cases.xlsx\` (also Part 3 of the QA guide), in
plain language for a person to run on screen. They were written against TRD v1; where they differ from the UAT build the
automation catalog (\`api-vendor-revalidation.md\`) and the guide win: the build calls "unverified" \`system_error\` and
ranks it above passed, checks only vendors whose link status is in \`vendor_statuses\`, allows a \`one_time\` cycle, shows a
never-checked vendor as "Pending" and joins errors with "; ". Ids are \`PRD-VREV-nnn\` = \`VR_TC_nnn\`.
`);
const mods: string[] = [];
for (const r of rows) if (!mods.includes(String(r[C.module]))) mods.push(String(r[C.module]));
const priOf = (p: string) => ({ critical: "P0", high: "P1", medium: "P2", low: "P3" } as Record<string, string>)[String(p).trim().toLowerCase()] ?? "P2";
const flat = (s: any) => String(s ?? "").replace(/\r/g, "").trim();
const asSteps = (s: any) => flat(s).split(/\n+/).map((x) => x.trim()).filter(Boolean).join(" ");
mods.forEach((m, i) => {
  manual.push(`\n## ${i + 1}. ${m}\n`);
  for (const r of rows.filter((x) => String(x[C.module]) === m)) {
    const num = String(r[C.id]).replace("VR_TC_", "");
    manual.push(`#### PRD-VREV-${num} — ${flat(r[C.tc]).replace(/^Verify\s+/i, "").replace(/^./, (x) => x.toUpperCase())}`);
    manual.push(`- **Why it matters.** ${flat(r[C.scen])} — ${flat(r[C.type])} case from the manual sheet.`);
    manual.push(`- **Setup.** ${flat(r[C.pre])}${flat(r[C.data]) && flat(r[C.data]) !== "-" ? ` Test data: ${flat(r[C.data])}.` : ""}`);
    manual.push(`- **Steps.** ${asSteps(r[C.steps])}`);
    manual.push(`- **Expected.** ${flat(r[C.exp])}`);
    manual.push(`- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.`);
    manual.push(`- **Trace.** ${priOf(r[C.pri])} · manual · \`PRD-VREV\` · \`${r[C.id]}\`\n`);
  }
});
writeFileSync(OUT_MANUAL, manual.join("\n").replace(/\n{3,}/g, "\n\n"));

// ── findings ─────────────────────────────────────────────────────────
writeFileSync(OUT_BUGS, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), source: BACKEND_AT, bugs: BUGS.map(({ id, title, severity, status, found, cases }) => ({ id, title, severity, status, found, cases })) }, null, 1) + "\n");
const f: string[] = [];
f.push(`# Vendor revalidation — findings

What the code (${BACKEND_AT}) and the live UAT checks say against the QA guide and the TRD. **Confirmed live** means the
platform reproduced it on UAT; **from the code** means the line is quoted and the behaviour follows from it with no
assumption, but it was not (or must not be) triggered. Each finding names the cases that cover it in
\`api-vendor-revalidation.md\`; the runner attaches the finding to a failing case.

| Id | Severity | Status | Finding | Cases |
| --- | --- | --- | --- | --- |
${BUGS.map((b) => `| ${b.id} | ${b.severity} | ${b.status} | ${b.title} | ${b.cases.join(", ")} |`).join("\n")}
`);
for (const b of BUGS) {
  f.push(`\n## ${b.id} — ${b.title}\n\n**Severity** ${b.severity} · **Status** ${b.status} · **Cases** ${b.cases.join(", ")}\n\n${b.detail}\n\n**Evidence.** ${b.evidence}\n\n**Suggested fix.** ${b.fix}\n`);
}
writeFileSync(OUT_FINDINGS, f.join("\n"));

console.log(`${runnable.length} runnable cases → ${OUT_JSON}`);
console.log(`catalog → ${OUT_MD}; ${rows.length} manual cases → ${OUT_MANUAL}; ${BUGS.length} findings → ${OUT_FINDINGS}`);
const byTier: Record<string, number> = {};
for (const c of CASES) byTier[c.tier] = (byTier[c.tier] ?? 0) + 1;
console.log("by tier:", JSON.stringify(byTier), `· guide cases ${CASES.filter((c) => !c.added).length}, added ${CASES.filter((c) => c.added).length}`);
