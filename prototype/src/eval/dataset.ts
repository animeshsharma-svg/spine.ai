/**
 * THE EVAL DATASET — which cases measure the agent, and the label each one carries.
 *
 * Labels never come from the run being measured:
 *   bug       a case the bug sheet names for a verified bug (people confirmed it on fresh events)
 *   clean     a stored plan that PASSED at least twice before, never failed or gave up, and that
 *             no bug names — its earlier runs, not this one, say it is clean
 *   candidate a stored plan with no clean history: it is not counted for precision; it only
 *             carries planted bugs, and only after it passes every baseline run of the eval
 * Only cases with a stored API plan are in it: the agent runs those without any model at run
 * time, so two runs of the same version differ only where UAT does.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import type { ApiPlan } from "../agents/apiPlanner.js";

const here = dirname(fileURLToPath(import.meta.url));
const PROTO = join(here, "..", "..");
const PLANS = join(PROTO, "data", "compiled-plans", "api");
const RUNS = join(PROTO, "data", "runs");
const BUGS = join(PROTO, "..", "docs", "bugs");
const LABELS = join(PROTO, "data", "eval", "labels.json");

/** What a plan DOES — two plans with the same steps share history, a recompiled one does not. */
export function planHash(p: ApiPlan): string {
  return createHash("sha256").update(JSON.stringify({ setup: p.setup, act: p.act, verify: p.verify, expected: p.expected })).digest("hex").slice(0, 12);
}

/** Labels a person settled by tracing the cause (data/eval/labels.json); they override history. */
interface HumanLabel { caseId: string; label: "bug" | "clean"; bugKey?: string; planHash?: string; why: string; by: string; at: string }
function humanLabels(): HumanLabel[] {
  try {
    return existsSync(LABELS) ? (JSON.parse(readFileSync(LABELS, "utf8")).labels ?? []) : [];
  } catch {
    return [];
  }
}

export interface EvalCase {
  caseId: string;
  label: "bug" | "clean" | "candidate";
  bugKeys: string[];
  plan: ApiPlan;
  why: string;
}

export interface Dataset {
  version: string;
  builtAt: string;
  cases: EvalCase[];
  /** bugs on the sheet, and how many of them a stored plan can re-check */
  bugsOnSheet: number;
  bugsWithPlan: string[];
  sources: { bugSheet: string | null; plans: number; runFiles: number };
}

function loadPlans(): Map<string, ApiPlan> {
  const m = new Map<string, ApiPlan>();
  if (!existsSync(PLANS)) return m;
  for (const f of readdirSync(PLANS).filter((x) => x.endsWith(".json"))) {
    try {
      const d = JSON.parse(readFileSync(join(PLANS, f), "utf8"));
      const p = (d.plan ?? d) as ApiPlan;
      m.set(p.caseId ?? f.replace(/\.json$/, ""), p);
    } catch {
      /* a broken plan file is skipped */
    }
  }
  return m;
}

/** Bug → the case ids the sheet names for it ("Test cases" column). */
export function bugCases(): { file: string | null; total: number; map: Map<string, string[]> } {
  const map = new Map<string, string[]>();
  if (!existsSync(BUGS)) return { file: null, total: 0, map };
  const name = readdirSync(BUGS).filter((f) => /^Procol_bugs_found_.*\.xlsx$/.test(f)).sort().pop();
  if (!name) return { file: null, total: 0, map };
  const wb = XLSX.read(readFileSync(join(BUGS, name)), { type: "buffer" });
  const rows: any[] = wb.Sheets.Bugs ? XLSX.utils.sheet_to_json(wb.Sheets.Bugs, { defval: "" }) : [];
  let total = 0;
  for (const r of rows) {
    const id = String(r["Bug #"] ?? "");
    if (!/^BUG-\d+/.test(id)) continue;
    total++;
    const cases = String(r["Test cases"] ?? "").split(/[,\s]+/).map((x) => x.trim()).filter((x) => /^[A-Z]+(-[A-Z0-9]+)+$/.test(x));
    if (cases.length) map.set(id, cases);
  }
  return { file: `docs/bugs/${name}`, total, map };
}

/** Earlier verdicts of each stored plan, from the saved runs ("api plan: …"). */
function planHistory(): { byCase: Map<string, string[]>; files: number } {
  const byCase = new Map<string, string[]>();
  if (!existsSync(RUNS)) return { byCase, files: 0 };
  let files = 0;
  for (const f of readdirSync(RUNS).filter((x) => x.endsWith(".json"))) {
    try {
      const d = JSON.parse(readFileSync(join(RUNS, f), "utf8"));
      if (!String(d.request ?? "").startsWith("api plan:")) continue;
      files++;
      for (const e of d.events ?? []) {
        const p = e?.data?.plan;
        const v = e?.data?.verdict;
        // history belongs to a PLAN, not a case id: a recompiled plan for the same case starts with none
        if (p?.caseId && v) {
          const key = `${p.caseId}@${planHash(p)}`;
          (byCase.get(key) ?? byCase.set(key, []).get(key)!).push(String(v));
        }
      }
    } catch {
      /* unreadable run file */
    }
  }
  return { byCase, files };
}

export function buildDataset(): Dataset {
  const plans = loadPlans();
  const bugs = bugCases();
  const hist = planHistory();
  const bugOf = new Map<string, string[]>();
  for (const [bug, cases] of bugs.map) for (const c of cases) (bugOf.get(c) ?? bugOf.set(c, []).get(c)!).push(bug);

  const cases: EvalCase[] = [];
  const human = new Map(humanLabels().map((l) => [l.caseId, l]));
  for (const [caseId, plan] of [...plans.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const linked = bugOf.get(caseId) ?? [];
    const h = hist.byCase.get(`${caseId}@${planHash(plan)}`) ?? [];
    const hl = human.get(caseId);
    if (hl && (!hl.planHash || hl.planHash === planHash(plan))) {
      cases.push({ caseId, label: hl.label, bugKeys: hl.bugKey ? [hl.bugKey] : hl.label === "bug" ? linked : [], plan, why: `labelled by ${hl.by} on ${hl.at}: ${hl.why}` });
    } else if (linked.length) {
      cases.push({ caseId, label: "bug", bugKeys: linked, plan, why: `the bug sheet names it for ${linked.join(", ")}` });
    } else if (h.filter((v) => v === "passed").length >= 2 && !h.some((v) => v === "failed" || v === "couldn't tell")) {
      cases.push({ caseId, label: "clean", bugKeys: [], plan, why: `this exact plan passed ${h.length} earlier run(s), never failed or gave up` });
    } else {
      cases.push({ caseId, label: "candidate", bugKeys: [], plan, why: h.length ? `history of this plan not clean (${h.join(", ")})` : "this exact plan never ran before" });
    }
  }
  const bugsWithPlan = [...bugs.map.entries()].filter(([, cs]) => cs.some((c) => plans.has(c))).map(([b]) => b).sort();
  const version = createHash("sha256")
    .update(JSON.stringify(cases.map((c) => [c.caseId, c.label, c.bugKeys, c.plan])))
    .digest("hex")
    .slice(0, 12);
  return { version, builtAt: new Date().toISOString(), cases, bugsOnSheet: bugs.total, bugsWithPlan, sources: { bugSheet: bugs.file, plans: plans.size, runFiles: hist.files } };
}
