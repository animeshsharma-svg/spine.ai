/**
 * Bugs found by running test sheets (data/sheet-runs) and by exploring the flows (data/flow-explore/bugs.json),
 * as rows of the platform's Bugs page (bugSheet.allDefects). A sheet case that failed against the product — not a
 * gap in the automation — carries a SheetBug; the same bug seen by several runs or cases is one row with every
 * case and run listed, newest evidence first.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DefectGroup } from "../agents/oracle.js";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "..", "data");
const SEV: Record<string, DefectGroup["severity"]> = { Critical: "critical", High: "high", Medium: "medium", Low: "low" };

export interface ExploreBug { id: string; title: string; seen: string; flow: string; caseId: string; severity: "Critical" | "High" | "Medium" | "Low"; expected: string; steps: string[]; screenshot?: string; at: string }

const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);

export function sheetDefects(): DefectGroup[] {
  const groups = new Map<string, DefectGroup>();
  const add = (fp: string, make: () => DefectGroup, at: string, run: string, flow: string, evidence: string[]) => {
    const g = groups.get(fp) ?? make();
    g.occurrences++;
    if (!g.runs.includes(run)) g.runs.push(run);
    if (!g.flows.includes(flow)) g.flows.push(flow);
    for (const e of evidence) if (e && !g.evidence.includes(e)) g.evidence.push(e);
    if (at < g.firstSeen) g.firstSeen = at;
    if (at > g.lastSeen) g.lastSeen = at;
    groups.set(fp, g);
  };
  const runsDir = join(DATA, "sheet-runs");
  // only a case whose LATEST run still fails: a re-run that passes (or was fixed in the automation) clears it
  const latest = new Map<string, string>();
  const files = existsSync(runsDir) ? readdirSync(runsDir).filter((x) => x.endsWith(".json")) : [];
  const runs: Array<{ id: string; startedAt: string; cases: Array<{ id: string; status: string }> }> = [];
  for (const f of files) {
    try {
      runs.push(JSON.parse(readFileSync(join(runsDir, f), "utf8")));
    } catch {
      /* skip */
    }
  }
  runs.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  for (const r of runs) for (const c of r.cases ?? []) if (c.status !== "Not run") latest.set(c.id, `${r.id}|${c.status}`);
  if (existsSync(runsDir))
    for (const f of files) {
      let run: { id: string; startedAt: string; cases: Array<{ id: string; title: string; module: string; status: string; why: string; bug?: { title: string; severity: string; whatHappened: string; expected: string; where?: string; appSaid?: string; shots?: Array<{ file?: string; path?: string }> }; case?: { steps?: string[] } }> };
      try {
        run = JSON.parse(readFileSync(join(runsDir, f), "utf8"));
      } catch {
        continue;
      }
      for (const c of run.cases ?? []) {
        if (c.status !== "Fail" || !c.bug || latest.get(c.id) !== `${run.id}|Fail`) continue;
        const b = c.bug;
        const fp = `sheet|${key(b.appSaid || b.title)}`;
        add(
          fp,
          () => ({
            defectFingerprint: fp, kind: "product_defect", severity: SEV[b.severity] ?? "medium", title: b.title,
            rationale: `${b.whatHappened} Expected: ${b.expected}`, flows: [], runs: [], occurrences: 0, firstSeen: run.startedAt, lastSeen: run.startedAt,
            evidence: [], reproduction: (c.case?.steps ?? []).map((s, i) => `${i + 1}. ${s}`), actionable: true,
          }),
          run.startedAt, run.id, `${c.id} — ${c.title}`,
          [b.appSaid ? `the app said "${b.appSaid}"` : "", b.where ?? "", ...(b.shots ?? []).map((s) => s.file ?? s.path ?? "").slice(0, 3)],
        );
      }
    }
  const explored = join(DATA, "flow-explore", "bugs.json");
  if (existsSync(explored)) {
    let bugs: ExploreBug[] = [];
    try {
      bugs = JSON.parse(readFileSync(explored, "utf8"));
    } catch {
      bugs = [];
    }
    for (const b of bugs) {
      const fp = `explore|${b.id}|${key(b.title)}`;
      add(
        fp,
        () => ({
          defectFingerprint: fp, kind: "product_defect", severity: SEV[b.severity] ?? "medium", title: b.title,
          rationale: `Seen while exploring ${b.flow}: ${b.seen}. Expected: ${b.expected}`, flows: [], runs: [], occurrences: 0, firstSeen: b.at, lastSeen: b.at,
          evidence: [], reproduction: b.steps, actionable: true,
        }),
        b.at, `explore:${b.flow}`, `${b.caseId} — ${b.flow}`, [b.seen, b.screenshot ?? ""],
      );
    }
  }
  return [...groups.values()];
}
