/**
 * TEST CASES AROUND A SUPPORT TICKET — so the platform catches the ticket's bug and its neighbours on its own.
 *
 *   npm run hubspot:derive -- --dry                       which tickets, nothing written
 *   npm run hubspot:derive -- --limit 5                   derive for five open-defect cases, run the API-runnable rows
 *   npm run hubspot:derive -- --ids HS-…-1,HS-…-1          exactly these cases
 *   npm run hubspot:derive -- --status reproduced,needs_confirmation   only cases whose replay ended so
 *   npm run hubspot:derive -- --no-run                    derive only
 *   npm run hubspot:derive -- --company 198678            PROCOL DEMO (the default and the only company whose settings may be switched)
 *
 * Which tickets: the team's "Is Defect = yes" rows of the RCA export whose stage is not Closed, sorted as a defect
 * in the events scope by the pipeline — the same set `hubspot:reproduce` replays. One derivation per regression
 * case (tickets sharing a pattern share a case): the ticket's STRIPPED scenario (setup, steps, expected, what was
 * seen) goes to agents/deriveCases.ts, which walks the permutations a senior tester would — who else does it, in
 * which event state, under which company setting, with which awkward values and at which moment — grounded in
 * Procol's code rules, the settings catalogue, last quarter's RCA defects and the catalog (a case the team already
 * has is shown with its id, never written twice).
 *
 * Where it goes: the rows are saved as the sheet `derived-<subject>` in data/sheet-cases.json (git-ignored) and the
 * derivation record with its run verdicts in data/hubspot/derived/<case>.json (git-ignored, like every ticket-derived
 * file). Ticket text may reach Slingring (approved) and nothing else: Groq and Gemini are switched off here.
 *
 * Running: the API-runnable rows run through the sheet runner at once (own fresh event per case, QA vendors only,
 * settings switched and restored on PROCOL DEMO). UI rows need the single browser slot and are left for the UI
 * batch (`scripts/run-ui-cases.ts`); the record lists them.
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
delete process.env.GROQ_API_KEY;
delete process.env.GOOGLE_API_KEY;
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";

import { deriveCases, type Derivation } from "../src/agents/deriveCases.js";
import { openDefectCases, teamDefects } from "../src/hubspot/openDefects.js";
import { sheetCases, renameSheet } from "../src/checks/sheetCases.js";
import { runSheetCases, activeSheetRun } from "../src/checks/sheetRunner.js";
import { withWatchdog } from "../src/checks/resilience.js";
import { usageReport } from "../src/ai/llm.js";
import { HUBSPOT_DIR } from "../src/hubspot/mapFeature.js";
import { loadRows, type TicketRow } from "../src/hubspot/store.js";
import { closeSpineDb } from "../src/db/spineDb.js";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (n: string) => process.argv.includes(`--${n}`);
const DRY = flag("dry");
const NO_RUN = flag("no-run");
const LIMIT = Number(arg("limit")) || 0;
const COMPANY = Number(arg("company")) || 198678;
const IDS = new Set((arg("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const STATUS = new Set((arg("status") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const MAX = Math.min(Math.max(Number(arg("max")) || 16, 8), 40);
const OUT = join(HUBSPOT_DIR, "derived");
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

/** The words the derivation starts from: the stripped scenario, never the raw ticket. */
function subjectText(caseId: string, t: TicketRow): string {
  const sc = t.scenario;
  const head = `A support-reported defect in ${t.featureKey ?? t.module ?? "sourcing events"} (regression case ${caseId}).`;
  if (!sc) return `${head} ${t.classificationWhy ?? ""}`.trim();
  return [head, `Setup: ${sc.preconditions}`, `Steps: ${sc.steps.join(" ")}`, `Expected: ${sc.expected}`, sc.observed ? `What the ticket saw instead: ${sc.observed}` : ""].filter(Boolean).join("\n");
}

interface Record_ {
  caseId: string; tickets: string[]; status: string; at: string; subject: string; module: string; sheet: string;
  derivationId: string; cases: number; fresh: number; already: number; byDimension: Record<string, number>; byLayer: Record<string, number>;
  questions: number; run?: { id: string; counts: Record<string, number>; cases: Array<{ id: string; status: string; why: string }> }; uiPending: string[]; ms: number; usd: number;
}

const { rows, from } = await loadRows();
const byCase = openDefectCases(rows, teamDefects());

// ── --run-pending: the API rows of derivations made with --no-run (or left pending by a busy runner) ────────────
if (flag("run-pending")) {
  mkdirSync(OUT, { recursive: true });
  const { readdirSync } = await import("node:fs");
  const recs = readdirSync(OUT).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(OUT, f), "utf8")) as Record_)
    .filter((r) => r.sheet && !r.run && (IDS.size ? IDS.has(r.caseId) : true));
  log(`${recs.length} derivation(s) with API rows not run yet`);
  for (const rec of recs.slice(0, LIMIT || recs.length)) {
    const apiRows = sheetCases(rec.sheet).filter((c) => c.layer === "api");
    if (!apiRows.length) { rec.status = "derived; no API rows"; writeFileSync(join(OUT, `${rec.caseId}.json`), JSON.stringify(rec, null, 1)); continue; }
    if (activeSheetRun()) { log(`a sheet run is already going (${activeSheetRun()}) — stopping here`); break; }
    log(`${rec.caseId} · running ${apiRows.length} API row(s) of ${rec.sheet} on client ${COMPANY}…`);
    try {
      const run = await runSheetCases(apiRows, { companyId: COMPANY, sheet: rec.sheet, repair: false, emit: (e: any) => { if (e.type === "case-done") log(`    ${e.result.id} → ${e.result.status}: ${String(e.result.why ?? "").slice(0, 140)}`); } });
      const counts: Record<string, number> = {};
      for (const c of run.cases) counts[c.status] = (counts[c.status] ?? 0) + 1;
      rec.run = { id: run.id, counts, cases: run.cases.map((c) => ({ id: c.id, status: c.status, why: c.why })) };
      rec.status = "derived and run";
      log(`  run ${run.id}: ${JSON.stringify(counts)}`);
    } catch (e) {
      rec.status = "derived; run failed";
      log(`  the run did not finish: ${(e as Error).message.slice(0, 200)}`);
    }
    writeFileSync(join(OUT, `${rec.caseId}.json`), JSON.stringify(rec, null, 1));
  }
  await closeSpineDb();
  process.exit(0);
}
let todo = [...byCase.entries()].filter(([id, ts]) => (IDS.size ? IDS.has(id) : true) && (STATUS.size ? ts.some((t) => STATUS.has(String(t.reproductionStatus))) : true));
mkdirSync(OUT, { recursive: true });
if (!IDS.size && !flag("again")) todo = todo.filter(([id]) => !existsSync(join(OUT, `${id}.json`)));
if (LIMIT) todo = todo.slice(0, LIMIT);
log(`${byCase.size} open-defect case(s) from ${rows.length} stored ticket(s) (${from}); ${todo.length} to derive${DRY ? " (dry)" : ""}`);
if (DRY) { for (const [id, ts] of todo) log(`  ${id} · ${ts[0].reproductionStatus} · ${ts[0].featureKey ?? ts[0].module ?? "?"} · ${ts.length} ticket(s)`); await closeSpineDb(); process.exit(0); }

const spend0 = usageReport().totalUsd;
for (const [caseId, tickets] of todo) {
  const lead = tickets[0];
  const t0 = Date.now();
  const usd0 = usageReport().totalUsd;
  log(`${caseId} (${tickets.length} ticket(s), replay ${lead.reproductionStatus}) — deriving`);
  let d: Derivation;
  try {
    d = await withWatchdog(deriveCases({ text: subjectText(caseId, lead), companyId: COMPANY, max: MAX, save: true }, (e) => { if (e.type === "line") log(`    ${e.line.slice(0, 160)}`); }), 300_000, `deriving ${caseId}`);
  } catch (e) {
    log(`  derivation failed: ${(e as Error).message.slice(0, 200)}`);
    writeFileSync(join(OUT, `${caseId}.json`), JSON.stringify({ caseId, tickets: tickets.map((t) => t.ticketId), status: "derivation failed", why: (e as Error).message, at: new Date().toISOString() }, null, 1));
    continue;
  }
  renameSheet(d.sheet, `${caseId} · ${d.subject.slice(0, 70)}`);
  const fresh = d.cases.filter((c) => !c.already);
  const byDim: Record<string, number> = {}, byLayer: Record<string, number> = {};
  for (const c of d.cases) { byDim[c.dimension] = (byDim[c.dimension] ?? 0) + 1; byLayer[c.runnable] = (byLayer[c.runnable] ?? 0) + 1; }
  const rec: Record_ = {
    caseId, tickets: tickets.map((t) => String(t.ticketId)), status: "derived", at: new Date().toISOString(), subject: d.subject, module: d.module, sheet: d.sheet, derivationId: d.id,
    cases: d.cases.length, fresh: fresh.length, already: d.cases.length - fresh.length, byDimension: byDim, byLayer, questions: d.questions.length,
    uiPending: fresh.filter((c) => c.runnable === "ui").map((c) => c.id), ms: 0, usd: 0,
  };
  log(`  ${d.cases.length} case(s): ${fresh.length} new on sheet ${d.sheet}, ${rec.already} already in the catalog · ${JSON.stringify(byLayer)} · ${d.questions.length} question(s)`);
  // run the API-runnable new rows now, one fresh event each
  const apiRows = sheetCases(d.sheet).filter((c) => c.layer === "api" && fresh.some((f) => f.id === c.id && f.runnable === "api"));
  if (!NO_RUN && apiRows.length) {
    if (activeSheetRun()) log(`  a sheet run is already going (${activeSheetRun()}) — the ${apiRows.length} API row(s) are left pending`);
    else {
      log(`  running ${apiRows.length} API row(s) on client ${COMPANY}…`);
      try {
        const run = await runSheetCases(apiRows, { companyId: COMPANY, sheet: d.sheet, repair: false, emit: (e: any) => { if (e.type === "case-done") log(`    ${e.result.id} → ${e.result.status}: ${String(e.result.why ?? "").slice(0, 140)}`); } });
        const counts: Record<string, number> = {};
        for (const c of run.cases) counts[c.status] = (counts[c.status] ?? 0) + 1;
        rec.run = { id: run.id, counts, cases: run.cases.map((c) => ({ id: c.id, status: c.status, why: c.why })) };
        rec.status = "derived and run";
        log(`  run ${run.id}: ${JSON.stringify(counts)}`);
      } catch (e) {
        log(`  the run did not finish: ${(e as Error).message.slice(0, 200)}`);
        rec.status = "derived; run failed";
      }
    }
  }
  rec.ms = Date.now() - t0;
  rec.usd = Number((usageReport().totalUsd - usd0).toFixed(4));
  writeFileSync(join(OUT, `${caseId}.json`), JSON.stringify(rec, null, 1));
}
log(`model spend this run: $${(usageReport().totalUsd - spend0).toFixed(4)}`);
await closeSpineDb();
process.exit(0);
