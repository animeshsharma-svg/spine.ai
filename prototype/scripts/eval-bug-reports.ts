/**
 * HOW GOOD ARE THE BUG REPORTS — the verified bug sheet (docs/bugs/Procol_bugs_found_*.xlsx,
 * "Bugs" tab) judged two ways:
 *   • completeness, measured: does each report carry steps, expected, actual, where found,
 *     severity, kind, how it was verified, when, and a test case that re-checks it?
 *   • quality, judged: a model reads each report cold (as a Procol developer would) and scores
 *     clarity, reproducibility and actionability 1–5, and says whether it could fix it from the
 *     report alone. Batches of 6 reports per call; Wilson intervals on "≥ 4".
 *
 *   npx tsx scripts/eval-bug-reports.ts [--limit N]
 * Report: data/eval/reports/bug-reports-<date>.json and .md
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
const { chat } = await import("../src/ai/llm.js");
const { wilson } = await import("../src/eval/metrics.js");

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const limit = Number(arg("limit") ?? 0) || Infinity;
const t = () => new Date().toISOString().slice(11, 19);

// The sheet is read through python/openpyxl (already on the machine) into JSON.
const sheetDir = join(here, "..", "..", "docs", "bugs");
const py = `
import openpyxl,glob,json,sys
f=sorted(glob.glob(${JSON.stringify(join(sheetDir, "Procol_bugs_found_*.xlsx"))}))[-1]
ws=openpyxl.load_workbook(f,read_only=True)["Bugs"]
rows=list(ws.iter_rows(values_only=True)); head=[str(c or "") for c in rows[0]]
out=[dict(zip(head,[("" if c is None else str(c)) for c in r])) for r in rows[1:] if r and r[0]]
print(json.dumps({"file":f,"bugs":out}))`;
const sheet = JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8" })) as { file: string; bugs: Array<Record<string, string>> };
const bugs = sheet.bugs.slice(0, limit);
console.log(`[${t()}] ${bugs.length} verified bugs from ${sheet.file.split("/").pop()}`);

interface Row {
  id: string;
  area: string;
  severity: string;
  complete: Record<string, boolean>;
  completeness: number;
  clarity: number | null;
  reproducibility: number | null;
  actionability: number | null;
  fixable: boolean | null;
  note: string;
}
const F = { steps: "How to see it", expected: "What should happen", actual: "What actually happens", where: "Client(s) where found", severity: "Severity", kind: "Kind", verified: "How it was verified", when: "Last confirmed", cases: "Test cases", summary: "What goes wrong" };
const rows: Row[] = bugs.map((b) => {
  const complete = {
    summary: (b[F.summary] ?? "").length > 20,
    steps: /\d\./.test(b[F.steps] ?? "") || (b[F.steps] ?? "").length > 40,
    expected: (b[F.expected] ?? "").length > 10,
    actual: (b[F.actual] ?? "").length > 10,
    where: (b[F.where] ?? "").length > 2,
    severity: /critical|high|medium|low/i.test(b[F.severity] ?? ""),
    kind: (b[F.kind] ?? "").length > 2,
    verified: (b[F.verified] ?? "").length > 10,
    when: /\d{4}/.test(b[F.when] ?? ""),
    testCase: /[A-Z]{2,}-[A-Z0-9-]*\d/.test(b[F.cases] ?? ""),
  };
  const n = Object.values(complete).filter(Boolean).length;
  return { id: b["Bug #"], area: b["Area"] ?? "", severity: b[F.severity] ?? "", complete, completeness: Math.round((n / Object.keys(complete).length) * 100) / 100, clarity: null, reproducibility: null, actionability: null, fixable: null, note: "" };
});

const system = [
  "You are a senior Procol developer reading bug reports from a QA platform. You have NOT seen the product behaviour yourself; judge each report on what it gives you.",
  "For EACH report score 1–5: clarity (a reader understands what goes wrong in one read), reproducibility (the steps let you reproduce it without asking), actionability (expected vs actual, where, severity and the rule make it fixable); and fixable: true if you could start fixing from the report alone.",
  'Return ONLY a JSON array, one object per report in the same order: [{"id":"BUG-01","clarity":n,"reproducibility":n,"actionability":n,"fixable":true|false,"note":"one short sentence on the biggest weakness"}].',
].join("\n");
for (let i = 0; i < bugs.length; i += 6) {
  const batch = bugs.slice(i, i + 6);
  const user = batch.map((b) => `### ${b["Bug #"]} — ${b["Bug"]}\nArea: ${b["Area"]} · Severity: ${b[F.severity]} · Kind: ${b[F.kind]} · Where: ${b[F.where]}\nWhat goes wrong: ${b[F.summary]}\nHow to see it: ${b[F.steps]}\nWhat should happen: ${b[F.expected]}\nWhat actually happens: ${b[F.actual]}\nHow it was verified: ${b[F.verified]} (${b[F.when]})\nTest cases: ${b[F.cases] || "none"}`).join("\n\n");
  const raw = await chat([{ role: "system", content: system }, { role: "user", content: user }], { tier: "reason", temperature: 0, maxTokens: 1500 }).catch(() => "");
  let arr: any[] = [];
  try {
    arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
  } catch {
    arr = [];
  }
  for (const j of arr) {
    const r = rows.find((x) => x.id === j?.id);
    if (!r) continue;
    const sc = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 1 && Number(v) <= 5 ? Number(v) : null);
    r.clarity = sc(j.clarity);
    r.reproducibility = sc(j.reproducibility);
    r.actionability = sc(j.actionability);
    r.fixable = typeof j.fixable === "boolean" ? j.fixable : null;
    r.note = String(j.note ?? "").slice(0, 160);
  }
  console.log(`[${t()}] judged ${Math.min(i + 6, bugs.length)}/${bugs.length}`);
}

const judged = rows.filter((r) => r.clarity !== null);
const mean = (k: "clarity" | "reproducibility" | "actionability") => (judged.length ? Math.round((judged.reduce((s, r) => s + (r[k] ?? 0), 0) / judged.length) * 100) / 100 : null);
const good = (k: "clarity" | "reproducibility" | "actionability") => judged.filter((r) => (r[k] ?? 0) >= 4).length;
const fixable = judged.filter((r) => r.fixable === true).length;
const completeness = Math.round((rows.reduce((s, r) => s + r.completeness, 0) / Math.max(1, rows.length)) * 1000) / 10;
const fieldShare = Object.fromEntries(Object.keys(rows[0]?.complete ?? {}).map((k) => [k, Math.round((rows.filter((r) => (r.complete as any)[k]).length / Math.max(1, rows.length)) * 100)]));
const report = { at: new Date().toISOString(), sheet: sheet.file, bugs: rows.length, judged: judged.length, completeness, fieldShare, means: { clarity: mean("clarity"), reproducibility: mean("reproducibility"), actionability: mean("actionability") }, good: { clarity: [good("clarity"), judged.length, wilson(good("clarity"), judged.length)], reproducibility: [good("reproducibility"), judged.length, wilson(good("reproducibility"), judged.length)], actionability: [good("actionability"), judged.length, wilson(good("actionability"), judged.length)] }, fixable: [fixable, judged.length, wilson(fixable, judged.length)], bySeverity: Object.fromEntries(["Critical", "High", "Medium", "Low"].map((s) => [s, rows.filter((r) => r.severity.toLowerCase() === s.toLowerCase()).length])), rows };
const dir = join(here, "..", "data", "eval", "reports");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(join(dir, `bug-reports-${stamp}.json`), JSON.stringify(report, null, 2));
const pct = (x: any) => (x?.[2] ? `${x[0]}/${x[1]} · ${Math.round(x[2][0] * 100)}–${Math.round(x[2][1] * 100)}%` : "—");
const md = [
  `# Bug report quality — ${report.at.slice(0, 16)}`,
  "",
  `${rows.length} verified bugs (${sheet.file.split("/").pop()}), ${judged.length} judged by a model reading each report cold.`,
  "",
  `**Completeness (measured): ${completeness}%** of the ten fields filled on average — ${Object.entries(fieldShare).map(([k, v]) => `${k} ${v}%`).join(", ")}.`,
  "",
  "| Judged | Mean (1–5) | Rated ≥ 4 (Wilson 95%) |",
  "| --- | ---: | --- |",
  `| Clarity | ${report.means.clarity ?? "—"} | ${pct(report.good.clarity)} |`,
  `| Reproducibility | ${report.means.reproducibility ?? "—"} | ${pct(report.good.reproducibility)} |`,
  `| Actionability | ${report.means.actionability ?? "—"} | ${pct(report.good.actionability)} |`,
  `| Fixable from the report alone | — | ${pct(report.fixable)} |`,
  "",
  `By severity: ${Object.entries(report.bySeverity).map(([k, v]) => `${k} ${v}`).join(" · ")}.`,
  "",
  "| Bug | Area | Sev | Complete | Clar | Repro | Action | Fixable | Judge's note |",
  "| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |",
  ...rows.map((r) => `| ${r.id} | ${r.area} | ${r.severity} | ${Math.round(r.completeness * 100)}% | ${r.clarity ?? "—"} | ${r.reproducibility ?? "—"} | ${r.actionability ?? "—"} | ${r.fixable === null ? "—" : r.fixable ? "yes" : "no"} | ${r.note.replace(/\|/g, "/")} |`),
].join("\n");
writeFileSync(join(dir, `bug-reports-${stamp}.md`), md);
console.log(`[${t()}] completeness ${completeness}% · clarity ${report.means.clarity} · reproducibility ${report.means.reproducibility} · actionability ${report.means.actionability} · fixable ${fixable}/${judged.length}`);
console.log(`report → data/eval/reports/bug-reports-${stamp}.md`);
process.exit(0);
