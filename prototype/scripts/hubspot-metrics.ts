/**
 * CAN THE PLATFORM CATCH THE SUPPORT TICKETS ON ITS OWN? — the funnel, in counts, from the stored evidence.
 *
 *   npm run hubspot:metrics                 prints the funnel and writes data/hubspot/metrics.json (git-ignored)
 *   npm run hubspot:metrics -- --md path    also writes a Markdown report (counts and case ids only, no ticket text)
 *
 * Truth it is measured against: the support/engineering team's own "Is Defect" column of the RCA export, stage
 * not Closed (src/hubspot/openDefects.ts). Every number below is read from files the pipeline wrote while it ran —
 * tickets.processed.json (classification, case, replay verdict and evidence), data/hubspot/plans (the compiled
 * plan per case), data/hubspot/derived (the cases written around each ticket and their runs). Nothing is estimated.
 *
 * The funnel, per open-defect ticket:
 *   1 sorted as a defect by the platform            classification = defect
 *   2 inside the sourcing-events scope               inEventsScope          (the platform's remit; the rest is out of scope by design)
 *   3 a regression case written                      linkedCaseIds          (HS-<ticket>-1; tickets sharing a pattern share a case)
 *   4 an API plan compiled                           plans/<case>.json has a plan
 *   5 run on a fresh test event                      status reproduced | needs_confirmation | not_reproduced
 *   6 the verdict:
 *       caught        reproduced (failed twice at the ticket's step, full coverage, backend line cited)
 *       flagged       needs_confirmation (failed twice; at another step, partial coverage or no citation yet — a person decides)
 *       not showing   not_reproduced with a pass (the defect did not show on two fresh events — fixed, or data-bound)
 *       couldn't tell not_reproduced with inconclusive evidence
 *       cannot express yet   not_automatable (no plan, or the plan's decisive step tests something else than the ticket's point)
 *       not yet run   not_tried
 *   7 cases written AROUND the ticket (hubspot:derive): how many, by layer, and their run verdicts
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });

import { HUBSPOT_DIR } from "../src/hubspot/mapFeature.js";
import { loadRows, type TicketRow } from "../src/hubspot/store.js";
import { openDefectCases, stageOf, teamDefects, teamOpenDefects } from "../src/hubspot/openDefects.js";
import { closeSpineDb } from "../src/db/spineDb.js";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const PLANS = join(HUBSPOT_DIR, "plans");
const DERIVED = join(HUBSPOT_DIR, "derived");

const { rows, from } = await loadRows();
const gold = teamDefects();
const teamAll = rows.filter((t) => gold.get(String(t.ticketId)) === true);
const open = teamOpenDefects(rows, gold);
const byCase = openDefectCases(rows, gold);

const tally = <T>(xs: T[], f: (x: T) => string) => { const m: Record<string, number> = {}; for (const x of xs) { const k = f(x); m[k] = (m[k] ?? 0) + 1; } return m; };
const ev = (t: TicketRow) => (t.reproductionEvidence ?? {}) as Record<string, any>;

/** The verdict bucket of a case (its lead ticket's replay status + evidence). */
function bucket(ts: TicketRow[]): string {
  const t = ts[0];
  const s = String(t.reproductionStatus ?? "not_tried");
  const e = ev(t);
  if (s === "reproduced") return "caught";
  if (s === "needs_confirmation") return "flagged";
  if (s === "not_reproduced") return e.inconclusive ? "couldn't tell" : "not showing";
  if (s === "not_automatable") return /^the plan ran/.test(String(e.because ?? "")) ? "cannot express yet (off-point plan)" : "cannot express yet (no plan)";
  return "not yet run";
}

const cases = [...byCase.entries()].map(([id, ts]) => {
  const planFile = join(PLANS, `${id}.json`);
  const plan = existsSync(planFile) ? JSON.parse(readFileSync(planFile, "utf8")) : null;
  const derivedFile = join(DERIVED, `${id}.json`);
  const derived = existsSync(derivedFile) ? JSON.parse(readFileSync(derivedFile, "utf8")) : null;
  const e = ev(ts[0]);
  return {
    id, tickets: ts.map((t) => String(t.ticketId)), module: ts[0].module ?? "?", feature: ts[0].featureKey ?? "?",
    status: String(ts[0].reproductionStatus ?? "not_tried"), bucket: bucket(ts),
    planCompiled: !!plan?.plan, planCoverage: plan?.meta?.coverage ?? null, planSource: plan?.meta?.source ?? null,
    ran: ["reproduced", "needs_confirmation", "not_reproduced"].includes(String(ts[0].reproductionStatus)),
    firstEvent: e.firstEvent ?? null, secondEvent: e.secondEvent ?? null, decisive: e.decisiveStep ? `${e.decisiveStep.title} → ${e.decisiveStep.status ?? ""} ${e.decisiveStep.verdict ?? ""}`.trim() : null,
    otherFinding: e.otherFinding ? `${e.otherFinding.step} → ${e.otherFinding.status ?? ""} ${e.otherFinding.code ?? ""}`.trim() : null,
    lastRunAt: ts[0].lastRunAt ?? null,
    derived: derived ? { cases: derived.cases ?? 0, fresh: derived.fresh ?? 0, already: derived.already ?? 0, byLayer: derived.byLayer ?? {}, run: derived.run ? { id: derived.run.id, counts: derived.run.counts } : null, uiPending: (derived.uiPending ?? []).length, status: derived.status } : null,
  };
});

const derivedRecs = existsSync(DERIVED) ? readdirSync(DERIVED).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(DERIVED, f), "utf8"))) : [];
const derivedRunCounts: Record<string, number> = {};
for (const r of derivedRecs) for (const [k, v] of Object.entries(r.run?.counts ?? {})) derivedRunCounts[k] = (derivedRunCounts[k] ?? 0) + Number(v);
const derivedLayer: Record<string, number> = {};
for (const r of derivedRecs) for (const [k, v] of Object.entries(r.byLayer ?? {})) derivedLayer[k] = (derivedLayer[k] ?? 0) + Number(v);

const funnel = {
  teamMarkedDefects: teamAll.length,
  teamMarkedOpen: open.length,
  openByStage: tally(open, stageOf),
  platformSortedDefect: open.filter((t) => t.classification === "defect").length,
  platformSortedOther: tally(open.filter((t) => t.classification !== "defect"), (t) => String(t.classification)),
  inEventsScope: open.filter((t) => t.classification === "defect" && t.inEventsScope).length,
  outOfScopeByModule: tally(open.filter((t) => t.classification === "defect" && !t.inEventsScope), (t) => String(t.module ?? "?")),
  ticketsWithCase: open.filter((t) => t.classification === "defect" && t.inEventsScope && (t.linkedCaseIds ?? []).length).length,
  cases: cases.length,
  planCompiled: cases.filter((c) => c.planCompiled).length,
  planCoverage: tally(cases.filter((c) => c.planCompiled), (c) => String(c.planCoverage)),
  ran: cases.filter((c) => c.ran).length,
  buckets: tally(cases, (c) => c.bucket),
  bucketsByModule: Object.fromEntries([...new Set(cases.map((c) => c.module))].sort().map((m) => [m, tally(cases.filter((c) => c.module === m), (c) => c.bucket)])),
  derived: { cases: derivedRecs.length, rows: derivedRecs.reduce((a, r) => a + (r.cases ?? 0), 0), fresh: derivedRecs.reduce((a, r) => a + (r.fresh ?? 0), 0), already: derivedRecs.reduce((a, r) => a + (r.already ?? 0), 0), byLayer: derivedLayer, runs: derivedRecs.filter((r) => r.run).length, runCounts: derivedRunCounts, questions: derivedRecs.reduce((a, r) => a + (r.questions ?? 0), 0) },
};

const out = { generatedAt: new Date().toISOString(), source: from, funnel, cases: cases.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.id.localeCompare(b.id)) };
mkdirSync(HUBSPOT_DIR, { recursive: true });
writeFileSync(join(HUBSPOT_DIR, "metrics.json"), JSON.stringify(out, null, 1));

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "–");
const lines: string[] = [];
lines.push(`# Can the platform catch the support tickets on its own? (${out.generatedAt.slice(0, 10)})`, "");
lines.push(`Truth: the team's own "Is Defect = yes" rows of the RCA export (Jul–Sep 2026), stage not Closed. Every number is read from the pipeline's stored evidence (tickets.processed.json, data/hubspot/plans, data/hubspot/derived). No ticket text here.`, "");
lines.push("## The funnel", "", "| Step | Tickets / cases | Of the step before |", "|---|---|---|");
lines.push(`| Team-marked defects in the export | ${funnel.teamMarkedDefects} | |`);
lines.push(`| … not Closed (open defects — the denominator) | ${funnel.teamMarkedOpen} | ${pct(funnel.teamMarkedOpen, funnel.teamMarkedDefects)} |`);
lines.push(`| Sorted as a defect by the platform | ${funnel.platformSortedDefect} | ${pct(funnel.platformSortedDefect, funnel.teamMarkedOpen)} |`);
lines.push(`| Inside the sourcing-events scope (the platform's remit) | ${funnel.inEventsScope} | ${pct(funnel.inEventsScope, funnel.platformSortedDefect)} |`);
lines.push(`| A regression case written | ${funnel.ticketsWithCase} tickets → ${funnel.cases} cases | ${pct(funnel.ticketsWithCase, funnel.inEventsScope)} |`);
lines.push(`| An API plan compiled | ${funnel.planCompiled} cases | ${pct(funnel.planCompiled, funnel.cases)} |`);
lines.push(`| Run on a fresh test event (PROCOL DEMO) | ${funnel.ran} cases | ${pct(funnel.ran, funnel.cases)} |`);
lines.push("", "## The verdicts (per case)", "", "| Verdict | Cases | Of all cases | Meaning |", "|---|---|---|---|");
const MEAN: Record<string, string> = {
  "caught": "failed the same way on two fresh events at the ticket's own step, full coverage, backend line cited — bug-sheet grade",
  "flagged": "failed on two fresh events, but at another step / partial coverage / no citation yet — a person decides",
  "not showing": "passed on two fresh events — fixed since, or needs the customer's data",
  "couldn't tell": "the run could not read the result it needed",
  "cannot express yet (no plan)": "no API plan could be compiled from the case's words",
  "cannot express yet (off-point plan)": "a plan ran and passed, but it admitted its decisive step tests something else than the ticket's point",
  "not yet run": "not replayed yet",
};
for (const k of ["caught", "flagged", "not showing", "couldn't tell", "cannot express yet (no plan)", "cannot express yet (off-point plan)", "not yet run"]) lines.push(`| ${k} | ${funnel.buckets[k] ?? 0} | ${pct(funnel.buckets[k] ?? 0, funnel.cases)} | ${MEAN[k]} |`);
lines.push("", "## By module", "", "| Module | " + ["caught", "flagged", "not showing", "couldn't tell", "cannot express yet (no plan)", "cannot express yet (off-point plan)", "not yet run"].join(" | ") + " |", "|---|" + "---|".repeat(7));
for (const [m, b] of Object.entries(funnel.bucketsByModule)) lines.push(`| ${m} | ` + ["caught", "flagged", "not showing", "couldn't tell", "cannot express yet (no plan)", "cannot express yet (off-point plan)", "not yet run"].map((k) => (b as any)[k] ?? 0).join(" | ") + " |");
lines.push("", "## Cases written around the tickets (hubspot:derive)", "");
lines.push(`- Tickets derived from: ${funnel.derived.cases}; rows written: ${funnel.derived.rows} (${funnel.derived.fresh} new, ${funnel.derived.already} already in the catalog); by how they can run: ${JSON.stringify(funnel.derived.byLayer)}; questions for the product team: ${funnel.derived.questions}.`);
lines.push(`- Runs of the API-runnable rows: ${funnel.derived.runs} sheet runs; verdicts ${JSON.stringify(funnel.derived.runCounts)}.`);
lines.push("", "## Every open-defect case", "", "| Case | Tickets | Module · feature | Verdict | Plan | Fresh events | Decisive step | Other finding | Derived rows (run) |", "|---|---|---|---|---|---|---|---|---|");
for (const c of out.cases) lines.push(`| ${c.id} | ${c.tickets.join(", ")} | ${c.module} · ${c.feature} | ${c.bucket} | ${c.planCompiled ? `${c.planCoverage} (${c.planSource})` : "none"} | ${[c.firstEvent, c.secondEvent].filter(Boolean).join(", ") || "–"} | ${c.decisive ?? "–"} | ${c.otherFinding ?? "–"} | ${c.derived ? `${c.derived.cases}${c.derived.run ? ` (${Object.entries(c.derived.run.counts).map(([k, v]) => `${v} ${k}`).join(", ")})` : c.derived.uiPending ? ` (${c.derived.uiPending} UI pending)` : ""}` : "–"} |`);
const md = lines.join("\n") + "\n";
if (arg("md")) writeFileSync(arg("md")!, md);

console.log(`source ${from} · team-marked defects ${funnel.teamMarkedDefects} · open ${funnel.teamMarkedOpen} · platform defect ${funnel.platformSortedDefect} · in scope ${funnel.inEventsScope} · cases ${funnel.cases} · plan ${funnel.planCompiled} · ran ${funnel.ran}`);
console.log("verdicts:", JSON.stringify(funnel.buckets));
console.log("derived:", JSON.stringify(funnel.derived));
console.log(`written: ${join(HUBSPOT_DIR, "metrics.json")}${arg("md") ? ` and ${arg("md")}` : ""}`);
await closeSpineDb();
process.exit(0);
