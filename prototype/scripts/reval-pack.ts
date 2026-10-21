/**
 * The vendor revalidation pack — one workbook to share: every automation case
 * with its last result, the 143 manual cases ready to fill in, and the findings.
 *
 *   npm run reval:pack                       # newest revalidation run in data/runs
 *   npm run reval:pack -- --run <run id>
 *
 * Writes ../vendor-revalidation-pack-<date>.xlsx (gitignored: it carries run results).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as XLSX from "xlsx";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const RUNS = join(here, "..", "data", "runs");
const spec = await import(pathToFileURL(join(ROOT, "procol test", "scripts", "revalidation", "spec.ts")).href);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// the newest run that ran revalidation cases (or the one asked for)
const runFile = arg("run")
  ? `${arg("run")}.json`
  : readdirSync(RUNS).filter((f) => f.endsWith(".json")).sort().reverse().find((f) => {
      try {
        const r = JSON.parse(readFileSync(join(RUNS, f), "utf8"));
        return (r.checkResults ?? []).some((c: any) => String(c.id).startsWith("API-XREV-")) && (r.checkResults ?? []).length > 20;
      } catch {
        return false;
      }
    });
const run = runFile ? JSON.parse(readFileSync(join(RUNS, runFile), "utf8")) : null;
const results = new Map<string, any>((run?.checkResults ?? []).map((c: any) => [c.id, c]));
const skipped = new Map<string, string>(((run?.events ?? []).find((e: any) => e.data?.skipped)?.data?.skipped ?? []).map((s: any) => [s.id, s.reason]));

const cases = JSON.parse(readFileSync(join(here, "..", "data", "api-cases-extra", "revalidation.json"), "utf8"));
const P = { P0: "Critical", P1: "High", P2: "Medium", P3: "Low" } as Record<string, string>;
const resultOf = (id: string) => {
  const r = results.get(id);
  if (r) return r.pass ? "PASS" : r.inconclusive ? (/^not run/.test(r.verdict) ? "Not run (needs set-up)" : "Couldn't tell") : "FAIL";
  return skipped.has(id) ? "Not run unattended" : "—";
};
const tierWord: Record<string, string> = { read: "API read", audit: "DB audit", listing: "Listing vs DB", config: "Config (needs token)", run: "Live run (needs token)", dev: "Dev-assisted", manual: "Manual", ui: "Screen", code: "From the code" };

const auto = cases.map((c: any) => {
  const r = results.get(c.id);
  return {
    "Case ID": c.id.replace("API-XREV-", ""),
    Area: c.feature.replace("revalidation.", ""),
    Test: c.title,
    Priority: P[c.priority] ?? c.priority,
    Type: c.type,
    "How it runs": tierWord[c.reval.tier] ?? c.reval.tier,
    "Test vendors": (c.reval.needs ?? []).join(", "),
    Steps: (c.steps ?? []).map((s: string, i: number) => `${i + 1}. ${s}`).join("\n"),
    "Expected (build)": c.expectedResult,
    "Guide says": (c.disagree ?? "").replace(/^Guide: /, ""),
    "Code rule": c.rule ?? "",
    Finding: spec.CASES.find((x: any) => x.id === c.reval.key)?.finding ?? "",
    "Last result": resultOf(c.id),
    "Result detail": r?.verdict ?? skipped.get(c.id) ?? c.reval.why ?? "",
  };
});

// manual cases straight from the guide's workbook, with its blank result columns
const wbIn = XLSX.read(readFileSync(join(ROOT, "test-cases", "Vendor_Revalidation_Test_Cases.xlsx")));
const manual: any[] = XLSX.utils.sheet_to_json(wbIn.Sheets["Test Cases"] ?? wbIn.Sheets[wbIn.SheetNames[0]], { defval: "" });

const findings = spec.BUGS.map((b: any) => ({
  Id: b.id, Severity: b.severity, Status: b.status, Finding: b.title, Detail: b.detail, Evidence: b.evidence, "Suggested fix": b.fix, Cases: b.cases.join(", "),
}));

const count = (k: string) => auto.filter((a: any) => a["Last result"] === k).length;
const summary = [
  ["Vendor revalidation — QA pack", ""],
  ["Generated", new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"],
  ["Backend read", "procol-backend rfx-uat-main @ 76b986a012 (15 Oct 2026)"],
  ["Run", run ? `${run.id} — ${run.companyName ?? ""} (${run.companyId})` : "no revalidation run found"],
  ["", ""],
  ["Automation cases", auto.length],
  ["  PASS", count("PASS")],
  ["  FAIL (each names a finding)", count("FAIL")],
  ["  Couldn't tell", count("Couldn't tell")],
  ["  Not run — needs the employee token or data that does not exist yet", count("Not run (needs set-up)")],
  ["  Not run unattended — dev / manual / screen / from the code", count("Not run unattended")],
  ["Manual cases", manual.length],
  ["Findings", findings.length],
  ["", ""],
  ["How to run", "Run tests → Vendor revalidation, or: cd prototype && npm run reval:run -- --company 47053"],
  ["Token", "Config / live-run cases need a Procol employee access-token from rfx-uat-api in prototype/.env as VR_QA_TOKEN"],
  ["Safety", "Config saved and restored per case; never vendor_ids: []; at most 5 vendors; no writes 21:50–23:30 IST or while a run is in progress; no QA run on a day the client's own nightly run is still due"],
];

const wb = XLSX.utils.book_new();
const sheet = (rows: any[], widths: number[]) => {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = widths.map((w) => ({ wch: w }));
  return ws;
};
const s0 = XLSX.utils.aoa_to_sheet(summary);
s0["!cols"] = [{ wch: 62 }, { wch: 110 }];
XLSX.utils.book_append_sheet(wb, s0, "Summary");
XLSX.utils.book_append_sheet(wb, sheet(auto, [8, 11, 44, 9, 9, 20, 22, 60, 60, 40, 50, 9, 18, 80]), "Automation cases");
XLSX.utils.book_append_sheet(wb, sheet(manual, [12, 18, 22, 44, 40, 24, 60, 60, 20, 10, 9, 10]), "Manual cases");
XLSX.utils.book_append_sheet(wb, sheet(findings, [8, 9, 26, 60, 90, 70, 60, 16]), "Findings");
const out = join(ROOT, `vendor-revalidation-pack-${new Date().toISOString().slice(0, 10)}.xlsx`);
XLSX.writeFile(wb, out);
console.log(`${auto.length} automation · ${manual.length} manual · ${findings.length} findings · run ${run?.id ?? "none"}\n→ ${out}`);
