import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DefectGroup } from "../agents/oracle.js";

/**
 * CONSOLE BUGS: what a tester reported from a run's Console tab (Aanya, 28 Oct: "console where console errors are
 * logged like network tab, bugs can be counted from there and reported from there").
 *
 * The session screen lists every console error and warning, and every failed browser call, that a run's steps saw
 * (observe.ts records them per step). A person presses "Report as bug" on one; it lands here and on the Bugs page
 * as a product defect, with the run, the step and the page it came from. Keyed by the message with its numbers and
 * ids blurred, so the same error seen in a later run adds a sighting instead of a second bug.
 */
const here = dirname(fileURLToPath(import.meta.url));
const STORE = join(here, "..", "..", "data", "console-bugs.json");

export interface ConsoleBug {
  fingerprint: string;
  kind: "error" | "warning" | "network";
  text: string;
  /** what the tester wrote, if anything */
  note?: string;
  sightings: Array<{ runId: string; step: number; stepName: string; url: string; caseText: string; at: string }>;
  reportedAt: string;
}

/** The same message with its numbers, ids and quoted values blurred: "…/project/a2NYY2RY…" and "…/project/a05rY2RY…" match. */
export function consoleFingerprint(kind: string, text: string): string {
  const t = String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/[^\s"')]+/g, (u) => u.replace(/\?.*$/, "").replace(/\/[A-Za-z0-9_-]{6,}(?=\/|$)/g, "/:id"))
    .replace(/\b\d+(\.\d+)?\b/g, "#")
    .replace(/"[^"]{0,80}"|'[^']{0,80}'/g, "\"…\"")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return `console:${kind}:${t}`;
}

export function loadConsoleBugs(): ConsoleBug[] {
  try {
    return existsSync(STORE) ? (JSON.parse(readFileSync(STORE, "utf8")) as ConsoleBug[]) : [];
  } catch {
    return [];
  }
}

function save(bugs: ConsoleBug[]): void {
  mkdirSync(dirname(STORE), { recursive: true });
  writeFileSync(STORE, JSON.stringify(bugs, null, 1));
}

/** Report one console line as a bug; a second report of the same message adds the sighting. */
export function reportConsoleBug(x: {
  kind?: string;
  text: string;
  note?: string;
  runId?: string;
  step?: number;
  stepName?: string;
  url?: string;
  caseText?: string;
}): ConsoleBug {
  const kind = x.kind === "warning" || x.kind === "network" ? x.kind : "error";
  // Never store a token a console line carried in its URL (observe.ts masks them too).
  x = { ...x, text: String(x.text).replace(/([?&;](?:access[-_]?token|lightspeed[-_]?token|token|auth|api[-_]?key|key|secret|signature|sig|session)=)[^&\s'"]+/gi, "$1…") };
  const fingerprint = consoleFingerprint(kind, x.text);
  const bugs = loadConsoleBugs();
  let bug = bugs.find((b) => b.fingerprint === fingerprint);
  const sighting = {
    runId: String(x.runId ?? ""),
    step: Number(x.step ?? 0),
    stepName: String(x.stepName ?? ""),
    url: String(x.url ?? ""),
    caseText: String(x.caseText ?? "").slice(0, 300),
    at: new Date().toISOString(),
  };
  if (!bug) {
    bug = { fingerprint, kind, text: String(x.text).slice(0, 600), note: x.note ? String(x.note).slice(0, 600) : undefined, sightings: [], reportedAt: sighting.at };
    bugs.push(bug);
  } else if (x.note) {
    bug.note = String(x.note).slice(0, 600);
  }
  if (!bug.sightings.some((s) => s.runId === sighting.runId && s.step === sighting.step)) bug.sightings.push(sighting);
  save(bugs);
  return bug;
}

/** Reported console lines as Bugs-page rows. */
export function consoleBugsAsDefects(): DefectGroup[] {
  return loadConsoleBugs().map((b) => {
    const first = b.sightings[0];
    const last = b.sightings[b.sightings.length - 1];
    const what = b.kind === "network" ? "A failed call in the browser" : b.kind === "warning" ? "A console warning" : "A console error";
    return {
      defectFingerprint: b.fingerprint,
      kind: "product_defect",
      severity: b.kind === "warning" ? "low" : "medium",
      title: `${what}: ${b.text.replace(/\s+/g, " ").slice(0, 110)}`,
      rationale:
        `${what} the browser showed while a run was on ${first?.url || "the page"}${first?.stepName ? ` (step “${first.stepName}”)` : ""}. ` +
        `Reported from the run's Console tab${b.note ? `: ${b.note}` : "."}`,
      flows: [...new Set(b.sightings.map((s) => s.caseText).filter(Boolean))].slice(0, 5),
      runs: [...new Set(b.sightings.map((s) => s.runId).filter(Boolean))],
      occurrences: b.sightings.length,
      firstSeen: first?.at ?? b.reportedAt,
      lastSeen: last?.at ?? b.reportedAt,
      evidence: [b.text, ...b.sightings.slice(0, 5).map((s) => `run ${s.runId} · step ${s.step} ${s.stepName} · ${s.url}`)],
      reproduction: [
        first?.caseText ? `Run the case: “${first.caseText}”` : "Repeat the run it was reported from",
        `Open the browser's console${first?.url ? ` on ${first.url}` : ""}${first?.stepName ? ` at the step “${first.stepName}”` : ""}`,
        `Look for: ${b.text.slice(0, 160)}`,
      ],
      actionable: true,
    };
  });
}
