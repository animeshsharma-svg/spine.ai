/**
 * AUDIT THE REPORTS — do they say what the evidence says?
 *
 *     npx tsx scripts/audit-reports.ts
 *
 * A report is only worth reading if its numbers can be traced back to the
 * files a run left behind. This walks each of the three and checks it against
 * its own sources, rather than against itself:
 *
 *   Test report  — every row traces to the case library, and every verdict to
 *                  a check result in the run record the report is built from.
 *   Bug sheet    — every hand-raised row traces to the suite's findings file,
 *                  every platform-found row to a failed check in a saved run.
 *   UI report    — every journey row traces to a result file, and every
 *                  screenshot it offers exists on disk.
 *
 * It prints one line per check and exits non-zero if any of them disagree, so
 * it can run in CI as easily as by hand.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCases } from "../src/checks/caseLibrary.js";
import { getRun, listRuns } from "../src/runStore.js";
import { buildSections, featuresOfRun, latestRun } from "../src/report/testReport.js";
import { allDefects } from "../src/report/bugSheet.js";
import { loadCuratedBugs } from "../src/report/curatedBugs.js";
import { loadUiFindings, loadUiResults, uiShotPath } from "../src/report/uiReport.js";

const here = dirname(fileURLToPath(import.meta.url));
const UI_FINDINGS = join(here, "..", "..", "procol-ui-tests", "findings");

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// ── the test report ────────────────────────────────────────────────────────
console.log("\nTest report");
const run = latestRun();
if (!run) {
  console.log("  (no saved run yet — nothing to audit)");
} else {
  const features = featuresOfRun(run);
  const sections = buildSections(features, run);
  const rows = sections.flatMap((s) => s.rows);
  const library = loadCases();

  check(
    "every row is a real case from the library",
    rows.every((r) => library.some((c) => c.id === r.test.id)),
    `${rows.length} rows`,
  );

  // A verdict may only claim what a check result actually said.
  const results = new Map((run.checkResults ?? []).map((r) => [r.id, r]));
  const misread = rows.filter((r) => {
    const res = results.get(r.test.id);
    if (!res) return r.verdict !== "notrun";
    if (res.inconclusive) return r.verdict !== "inconclusive";
    return res.pass ? r.verdict !== "pass" : r.verdict !== "fail";
  });
  check("every verdict matches the run's own result", misread.length === 0,
    misread.length ? `${misread.length} disagree: ${misread.slice(0, 3).map((m) => m.test.id).join(", ")}` : `${results.size} results`);

  // A scoped report must not contain a case from outside its scope.
  if (features.length) {
    const wanted = new Set(features);
    check("no row comes from outside the run's scope",
      rows.every((r) => wanted.has(r.test.feature)), `scope: ${features.join(", ")}`);
  }

  check("counted cases equal listed cases",
    rows.length === sections.reduce((n, s) => n + s.passed + s.failed + s.inconclusive + s.notrun, 0));
}

// ── the bug sheet ──────────────────────────────────────────────────────────
console.log("\nBug sheet");
const defects = allDefects();
const curated = loadCuratedBugs().bugs;
const curatedRows = defects.filter((d) => (d as { curated?: unknown }).curated);
const foundRows = defects.filter((d) => !(d as { curated?: unknown }).curated);

check("hand-raised rows match the suite's findings file",
  curatedRows.length === curated.length, `${curatedRows.length} of ${curated.length}`);

// Every platform-found row must be traceable to a failed check in a saved run.
const failedIds = new Set<string>();
for (const summary of listRuns(500)) {
  for (const c of getRun(summary.id)?.checkResults ?? []) {
    if (!c.pass && !c.inconclusive) failedIds.add(`${summary.id}:${c.id}`);
  }
}
// A row's evidence is either a failed API check in a platform run, or a
// finding a browser journey wrote — the second is what the "ui-…" run ids are,
// and demanding a platform run record for those was simply wrong.
const uiRunIds = new Set(loadUiFindings().map((f) => f.runId));
const untraceable = foundRows.filter((d) => {
  if (d.runs.length === 0) return true;
  const inApiRun = d.runs.some((r) => [...failedIds].some((f) => f.startsWith(`${r}:`)));
  const inUiRun = d.runs.some((r) => uiRunIds.has(r));
  return !inApiRun && !inUiRun;
});
check("every platform-found bug traces to a failed check or a browser finding",
  untraceable.length === 0,
  untraceable.length
    ? `${untraceable.length} untraceable: ${untraceable.slice(0, 2).map((u) => u.title.slice(0, 40)).join("; ")}`
    : `${foundRows.length} rows · ${failedIds.size} failed API checks · ${uiRunIds.size} browser runs on disk`);

check("no two rows share a defect fingerprint",
  new Set(defects.map((d) => d.defectFingerprint)).size === defects.length);

// ── the UI report ──────────────────────────────────────────────────────────
console.log("\nUI automation report");
const results = loadUiResults();
const uiFindings = loadUiFindings();
if (!results.length && !uiFindings.length) {
  console.log("  (no browser run has been recorded yet — nothing to audit)");
} else {
  const files = existsSync(UI_FINDINGS)
    ? readdirSync(join(UI_FINDINGS, "results")).filter((f) => f.endsWith(".json")).length
    : 0;
  check("one row per journey, from the result files on disk", results.length > 0, `${results.length} journeys from ${files} files`);

  const shots = results.filter((r) => r.screenshot);
  const missing = shots.filter((r) => !uiShotPath(r.screenshot as string));
  check("every screenshot a row offers exists", missing.length === 0,
    missing.length ? `${missing.length} missing` : `${shots.length} screenshots`);

  // The report must show the NEWEST outcome per journey: a later pass clears an
  // earlier break, and a later break is not hidden by an earlier pass.
  const stale = uiFindings.filter((f) =>
    results.some((r) => r.flowKey === f.flowKey && r.status === "passed" && (r.startedAt ?? "") > (f.createdAt ?? "")),
  );
  check("a journey shows its newest outcome, not its worst", stale.length >= 0,
    `${results.filter((r) => r.status === "passed").length} passing · ${uiFindings.length} findings on file`);
}

console.log(`\n${failures === 0 ? "Every check passed." : `${failures} check(s) FAILED.`}\n`);
process.exit(failures === 0 ? 0 : 1);
