/**
 * TEST FROM AN UPLOAD — the homepage takes a sheet of test cases, a PRD, or both, and tests it end to end.
 *
 *   sheet only    import it → understand every case (prompts/test-case-runner.md) → run the whole sheet in order
 *   sheet + PRD   the same, with every case judged by the PRD (the PRD wins where the case differs)
 *   PRD only      write the cases from the PRD alone (prompts/test-case-writer.md) → then as above
 *
 * One job at a time (one browser). The job keeps its place in data/home-jobs/<id>.json; the run itself is a sheet
 * campaign (sheetCampaign.ts), which already resumes after a restart, and a job stopped while writing or
 * understanding carries on from its saved PRD / sheet. The report is one .xlsx — Test Cases (Status, Actual
 * Result, Screenshots), Bugs in the house format, Summary, and the case-vs-PRD differences
 * (test-cases/sheet_run_report.py).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importSheetBuffer, sheetCases, type SheetCase } from "./sheetCases.js";
import { linkPrd, loadPrd, prdForSheet, readPrdText, savePrd, PRD_FILE, SHEET_FILE } from "./prdDocs.js";
import { activeCampaign, campaignResults, loadCampaign, startCampaign, stopCampaign } from "./sheetCampaign.js";
import { activeSheetRun, type SheetRunCase } from "./sheetRunner.js";
import { writeCasesFromPrd } from "../agents/prdCases.js";
import { understandCase } from "../agents/caseUnderstanding.js";
import { chat } from "../ai/llm.js";
import { parseJsonObject } from "../hubspot/slingringFast.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const DIR = join(ROOT, "data", "home-jobs");
const REPORT_PY = join(ROOT, "..", "test-cases", "sheet_run_report.py");

export type JobStage = "reading" | "writing" | "understanding" | "ready" | "running" | "done" | "stopped" | "failed";
export interface HomeJob {
  id: string;
  createdAt: string;
  endedAt?: string;
  companyId: number;
  autoRun: boolean;
  files: Array<{ name: string; kind: "sheet" | "prd" }>;
  stage: JobStage;
  lines: string[];
  prd?: { id: string; name: string };
  sheet?: { id: string; name: string; count: number; skipped: number };
  written?: { file: string; requirements: number; uncovered: string[]; questions: string[] };
  understood?: { done: number; total: number; blocked: Array<{ id: string; title: string; why: string }>; differs: Array<{ id: string; title: string; difference: string }> };
  campaignId?: string;
  error?: string;
}

let live: { id: string; stopped: boolean } | null = null;

function save(j: HomeJob): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${j.id}.json`), JSON.stringify(j, null, 1));
}
export function loadHomeJob(id: string): HomeJob | null {
  const f = join(DIR, `${id.replace(/[^\w.-]/g, "")}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as HomeJob) : null;
}
export function listHomeJobs(limit = 10): HomeJob[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => ({ f, t: statSync(join(DIR, f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(0, limit).map(({ f }) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as HomeJob);
}
function update(id: string, fn: (j: HomeJob) => void): HomeJob | null {
  const j = loadHomeJob(id);
  if (!j) return null;
  fn(j);
  save(j);
  return j;
}
const say = (id: string, line: string) => update(id, (j) => void (j.lines = [...j.lines, line].slice(-40)));

const busy = (): string | null =>
  live ? `spine.ai is already testing an upload (${live.id}). Wait for it to finish or stop it first.` : activeCampaign() ? "A whole sheet is already running from Test sheets. Wait for it or stop it first." : activeSheetRun() ? "A sheet run is going. Wait for it to finish first." : null;

/** Take the uploaded files and start the job. Throws with a plain reason when the files cannot be used. */
export function createHomeJob(input: { files: Array<{ name: string; data: Buffer }>; companyId: number; autoRun: boolean }): HomeJob {
  const why = busy();
  if (why) throw new Error(why);
  const sheets = input.files.filter((f) => SHEET_FILE.test(f.name));
  const prds = input.files.filter((f) => PRD_FILE.test(f.name));
  const other = input.files.filter((f) => !SHEET_FILE.test(f.name) && !PRD_FILE.test(f.name));
  if (other.length) throw new Error(`${other.map((f) => `"${f.name}"`).join(", ")} is not a sheet (.xlsx, .xls, .csv) or a PRD (.docx, .pdf, .md, .txt).`);
  if (!sheets.length && !prds.length) throw new Error("Add a sheet of test cases, a PRD, or both.");
  if (sheets.length > 1 || prds.length > 1) throw new Error("Upload one sheet and/or one PRD at a time.");
  const j: HomeJob = {
    id: `home-${Date.now().toString(36)}`, createdAt: new Date().toISOString(), companyId: input.companyId, autoRun: input.autoRun,
    files: [...sheets.map((f) => ({ name: f.name, kind: "sheet" as const })), ...prds.map((f) => ({ name: f.name, kind: "prd" as const }))], stage: "reading", lines: [],
  };
  // read both now, so a file that cannot be read is refused before anything starts
  if (prds[0]) {
    const prd = savePrd(prds[0].name, readPrdText(prds[0].name, prds[0].data));
    j.prd = { id: prd.id, name: prd.name };
    j.lines.push(`Read the PRD "${prd.name}" (${Math.round(prd.text.length / 1000)}k characters).`);
  }
  if (sheets[0]) {
    let info;
    try {
      info = importSheetBuffer(sheets[0].name, sheets[0].data);
    } catch (e) {
      throw new Error(`The sheet could not be read: ${(e as Error).message}. It needs at least a "Test Case Title" and a "Test Steps" column.`);
    }
    j.sheet = { id: info.id, name: info.name, count: info.count, skipped: info.skipped };
    if (j.prd) linkPrd(info.id, j.prd.id);
    j.lines.push(`Imported "${info.name}": ${info.count} test cases${info.skipped ? ` (${info.skipped} rows skipped — no title or no steps)` : ""}${j.prd ? `, judged by the PRD "${j.prd.name}"` : ""}.`);
  }
  j.stage = j.sheet ? "understanding" : "writing";
  save(j);
  void drive(j.id);
  return j;
}

async function drive(id: string): Promise<void> {
  if (live) return;
  live = { id, stopped: false };
  const stopped = () => !!live?.stopped;
  try {
    let j = loadHomeJob(id)!;
    if (j.stage === "writing") {
      const prd = j.prd ? loadPrd(j.prd.id) : null;
      if (!prd) throw new Error("the PRD is missing — upload it again");
      const out = await writeCasesFromPrd(prd, (l) => say(id, l), stopped);
      j = update(id, (x) => {
        x.sheet = { id: out.sheet.id, name: out.sheet.name, count: out.sheet.count, skipped: out.sheet.skipped };
        x.written = { file: out.file, requirements: out.requirements.length, uncovered: out.uncovered.map((u) => `${u.id} ${u.text}`), questions: out.questions };
        x.stage = "understanding";
      })!;
    }
    if (j.stage === "understanding") {
      const cases = sheetCases(j.sheet!.id);
      const prd = prdForSheet(j.sheet!.id);
      say(id, `Reading all ${cases.length} cases first${prd ? " against the PRD" : ""}, so anything that cannot run here is known before the run starts…`);
      const blocked: NonNullable<HomeJob["understood"]>["blocked"] = [];
      const differs: NonNullable<HomeJob["understood"]>["differs"] = [];
      let done = 0;
      const queue = [...cases];
      const worker = async () => {
        for (let c = queue.shift(); c && !stopped(); c = queue.shift()) {
          const u = await understandCase(c, prd).catch(() => null);
          if (u?.blocked) blocked.push({ id: c.id, title: c.title, why: u.blocked });
          if (u?.difference) differs.push({ id: c.id, title: c.title, difference: u.difference });
          done++;
          if (done % 5 === 0 || done === cases.length) update(id, (x) => void (x.understood = { done, total: cases.length, blocked, differs }));
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      if (stopped()) throw new Error("stopped");
      j = update(id, (x) => {
        x.understood = { done, total: cases.length, blocked, differs };
        x.lines.push(`All ${cases.length} cases read: ${blocked.length} blocked here${differs.length ? `, ${differs.length} differ from the PRD (they are judged by the PRD)` : ""}.`);
        x.stage = x.autoRun ? "running" : "ready";
      })!;
    }
    if (j.stage === "running" && !j.campaignId) startRun(j);
  } catch (e) {
    const msg = (e as Error).message;
    update(id, (x) => {
      x.stage = msg === "stopped" ? "stopped" : "failed";
      x.error = msg === "stopped" ? undefined : msg;
      x.endedAt = new Date().toISOString();
    });
  } finally {
    live = null;
  }
}

function startRun(j: HomeJob): void {
  const c = startCampaign({ sheet: j.sheet!.id, companyId: j.companyId });
  update(j.id, (x) => {
    x.campaignId = c.id;
    x.stage = "running";
    x.lines.push(`Running all ${j.sheet!.count} cases one by one, module by module, in one browser.`);
  });
}

/** "Run them" after the cases were written and read (when the job did not start the run on its own). */
export function runHomeJob(id: string): HomeJob {
  const j = loadHomeJob(id);
  if (!j || j.stage !== "ready") throw new Error("This upload is not waiting to run.");
  const why = busy();
  if (why) throw new Error(why);
  startRun(j);
  return loadHomeJob(id)!;
}

export function stopHomeJob(id: string): boolean {
  const j = loadHomeJob(id);
  if (!j) return false;
  if (live?.id === id) live.stopped = true;
  if (j.campaignId && activeCampaign()?.id === j.campaignId) stopCampaign(j.campaignId);
  update(id, (x) => {
    if (!["done", "failed"].includes(x.stage)) (x.stage = "stopped"), (x.endedAt = new Date().toISOString());
  });
  return true;
}

/** Carry on a job the server stopped mid-way (writing and understanding are cached; the campaign resumes itself). */
export function resumeHomeJobs(): void {
  const j = listHomeJobs(5).find((x) => x.stage === "writing" || x.stage === "understanding");
  if (j && !live) setTimeout(() => void drive(j.id), 5_000);
}

const verdictOf = (r: SheetRunCase | undefined): string => (!r ? "Not Run" : r.status === "Not run" ? (/^Blocked/.test(r.why) ? "Blocked" : "Not Run") : r.status);

/** The job with its run's progress, for the homepage. */
export function homeJobView(j: HomeJob): HomeJob & { run?: { done: number; total: number; counts: Record<string, number>; bugs: number; current?: { caseId: string; title: string; module: string }; report: string; status: string } } {
  if (!j.campaignId) return j;
  const c = loadCampaign(j.campaignId);
  if (!c) return j;
  const res = campaignResults(c);
  const counts: Record<string, number> = {};
  for (const r of res) counts[verdictOf(r)] = (counts[verdictOf(r)] ?? 0) + 1;
  const total = c.modules.reduce((n, m) => n + m.ids.length, 0);
  if (j.stage === "running" && c.status !== "running") {
    update(j.id, (x) => {
      x.stage = c.status === "done" ? "done" : "stopped";
      x.endedAt = c.endedAt;
    });
    j = loadHomeJob(j.id)!;
  }
  return { ...j, run: { done: res.length, total, counts, bugs: res.filter((r) => r.bug).length, current: c.current ? { caseId: c.current.caseId, title: c.current.title, module: c.current.module } : undefined, report: `/api/sheets/campaign/report?id=${c.id}`, status: c.status } };
}

// ── the report file ─────────────────────────────────────────────────────────

const PRI: Record<string, string> = { Critical: "P0", High: "P1", Medium: "P2", Low: "P2" };
const bugCache = new Map<string, any>();

/** One bug in the house words: a one-line summary, a description (no steps), steps of its own. */
async function bugRow(r: SheetRunCase, n: number, feature: string, envLine: string): Promise<Record<string, unknown>> {
  const b = r.bug!;
  const key = `${r.id}|${b.whatHappened}`;
  let w = bugCache.get(key);
  if (!w) {
    const raw = await chat(
      [
        { role: "system", content: "You write one bug for a QA bug sheet, in plain words someone with basic knowledge of the feature understands without the code. Answer with JSON only." },
        {
          role: "user",
          content: `Test case ${r.id}: ${r.title}\nSteps the tester did:\n${r.case.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nWhat should happen: ${b.expected}\nWhat happened: ${b.whatHappened}${b.appSaid ? `\nThe app said: "${b.appSaid}"` : ""}${b.where ? `\nWhere: ${b.where}` : ""}\n\nAnswer: {"summary": "ONE plain line that tells the bug at a glance", "description": "what happens. Expected behavior: … Why it matters: … (no steps)", "steps": ["numbered steps to reproduce, with the real names used"], "priority": "P0 (blocker, no workaround) | P1 (main flow wrong) | P2 (small or cosmetic)", "blocker": "YES only when the flow cannot be finished at all, else NO", "dev_type": "FE | BE | Both | PRODUCT GAP"}`,
        },
      ],
      { tier: "fast", temperature: 0.2, maxTokens: 900, timeoutMs: 45_000 },
    ).catch(() => "");
    w = parseJsonObject(raw) ?? {};
    bugCache.set(key, w);
  }
  const shots = (b.shots.length ? b.shots : r.shots).map((s) => s.file).filter((f) => existsSync(f) && /\.(png|jpe?g)$/i.test(f)).slice(0, 3);
  return {
    id: `BUG-${String(n).padStart(2, "0")}`,
    summary: String(w.summary || b.title),
    status: "OPEN",
    feature,
    priority: /^P[012]$/.test(String(w.priority)) ? w.priority : PRI[b.severity] ?? "P1",
    blocker: w.blocker === "YES" ? "YES" : "NO",
    dev_type: ["FE", "BE", "Both", "PRODUCT GAP"].includes(w.dev_type) ? w.dev_type : b.severity === "Critical" ? "BE" : "",
    user_type: r.case.role || "Buyer",
    module: r.module,
    description: String(w.description || `${b.whatHappened}\nExpected behavior: ${b.expected}`),
    steps: Array.isArray(w.steps) && w.steps.length ? w.steps.map(String).map((s: string) => s.replace(/^\s*\d+[.)]\s*/, "")) : r.case.steps,
    shots,
    artefact: shots.length ? undefined : b.where ?? "",
    qa: process.env.QA_NAME ?? "Animesh",
    qa_status: "FAIL",
    qa_comment: `${envLine} · ${new Date().toISOString().slice(0, 10)} · test case ${r.id}${b.appSaid ? ` · the app said "${b.appSaid}"` : ""}`,
  };
}

/** The .xlsx: Test Cases + Bugs (house format) + Summary (+ Case vs PRD, Questions for the PM). */
export async function homeReport(id: string): Promise<{ body: Buffer; name: string }> {
  const j = loadHomeJob(id);
  if (!j?.sheet) throw new Error("This upload has no cases yet.");
  const cases: SheetCase[] = sheetCases(j.sheet.id);
  const camp = j.campaignId ? loadCampaign(j.campaignId) : null;
  const res = new Map((camp ? campaignResults(camp) : []).map((r) => [r.id, r]));
  const feature = j.prd?.name.replace(/\.[a-z]+$/i, "") ?? j.sheet.name.replace(/\.[a-z]+$/i, "");
  const envLine = `company ${j.companyId}`;
  const hasRef = cases.some((c) => c.prdRef);
  const rows = cases.map((c) => {
    const r = res.get(c.id);
    const row: Record<string, string> = {
      "Test Case ID": c.id, Module: c.module, Scenario: c.scenario, "Test Case Title": c.title, "User Role": c.role, Portal: c.portal, "Pre-conditions": c.preconditions,
      "Configs Needed": c.configs ?? "None", "Test Data": c.testData, "Test Steps": c.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"), "Expected Result": c.expected, Priority: c.priority, "Test Type": c.testType, Status: "",
    };
    if (hasRef) row["PRD Reference"] = c.prdRef ?? "";
    const did = r?.steps.length ? `\nWhat the run did: ${r.steps.map((s) => `${s.n}. ${s.words} — ${s.outcome}`).join("; ")}` : "";
    // a case not run yet still carries what reading it found: blocked here, or different from the PRD
    const blocked = !r ? j.understood?.blocked.find((b) => b.id === c.id) : undefined;
    const differs = j.understood?.differs.find((d) => d.id === c.id);
    return {
      row,
      status: blocked ? "Blocked" : verdictOf(r),
      actual: r ? `${r.why}${did}` : blocked ? `Blocked: ${blocked.why}` : camp?.status === "running" ? "Not reached yet — the run is still going." : "Not run.",
      shots: (r?.shots ?? []).map((s) => s.file),
      prd_note: r?.understanding?.difference ?? differs?.difference ?? "",
    };
  });
  const bugged = cases.map((c) => res.get(c.id)).filter((r): r is SheetRunCase & { moduleKey: string; runId: string } => !!r?.bug);
  const bugs = [];
  for (let i = 0; i < bugged.length; i++) bugs.push(await bugRow(bugged[i], i + 1, feature, envLine));
  const count = (v: string) => rows.filter((r) => r.status === v).length;
  const summary: Array<[string, string]> = [
    ["Feature / sheet", `${feature} (${j.sheet.name})`],
    ["Judged by", j.prd ? `the PRD "${j.prd.name}" — where a case differs from it, the PRD wins` : "the cases' own expected results (no PRD was uploaded)"],
    ["Cases written from the PRD", j.written ? `${j.sheet.count} cases for ${j.written.requirements} requirements${j.written.uncovered.length ? `; not covered: ${j.written.uncovered.join("; ")}` : ""}` : "— (the sheet was uploaded)"],
    ["Counts", ["Pass", "Fail", "Partly checked", "Blocked", "Not Run", "Couldn't tell"].map((v) => `${count(v)} ${v}`).join(" · ")],
    ["Bugs", String(bugs.length)],
    ["Does it work?", count("Fail") ? `No — ${bugs.length} bug${bugs.length === 1 ? "" : "s"}: ${bugs.slice(0, 5).map((b) => b.summary).join("; ")}` : rows.every((r) => r.status === "Pass") ? "Yes — every case passed." : "No failures, but not every case could be checked (see Blocked / Not Run / Couldn't tell)."],
    ["Not checked", rows.filter((r) => ["Blocked", "Not Run", "Couldn't tell"].includes(r.status)).map((r) => `${r.row["Test Case ID"]}: ${r.actual.split("\n")[0]}`).slice(0, 30).join("\n") || "—"],
    ["Run", camp ? `${camp.status}, started ${new Date(camp.startedAt).toLocaleString()} on ${envLine}` : "not started"],
  ];
  const payload = {
    feature, cases: rows, bugs, summary, questions: j.written?.questions ?? [],
    prd_checks: (j.understood?.differs ?? []).map((d) => [d.id, d.title, d.difference]),
  };
  const dir = join(DIR, j.id);
  mkdirSync(dir, { recursive: true });
  const src = join(dir, "report.json");
  const out = join(dir, "report.xlsx");
  writeFileSync(src, JSON.stringify(payload, (_, v) => (v === undefined ? null : v)));
  const p = spawnSync("python3", ["-P", REPORT_PY, src, out], { timeout: 180_000, encoding: "utf8" });
  if (p.status !== 0) throw new Error(`the report could not be built: ${String(p.stderr).trim().split("\n").pop()}`);
  return { body: readFileSync(out), name: `${feature.replace(/[^\w .()-]/g, "").trim() || "Report"} - Test Report.xlsx` };
}

