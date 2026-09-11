import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Turn the written catalog into something machines can use.
 *
 * `test-cases/events-ui.md` and `events-api.md` are the source of truth and are
 * written for people — each case explains why it matters before it says what to
 * do. This reads them without changing them, so the prose stays the thing
 * humans edit and the JSON is only ever a derived artefact. Run it again after
 * editing the markdown.
 */
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const OUT = join(here, "..", "data", "test-cases.json");

export interface CatalogCase {
  id: string;
  layer: "ui" | "api";
  /** The section code — UI-TPL, API-BID — which is how a reader navigates. */
  group: string;
  /** The enclosing "## 3. Templates and the pricing sheet" heading, so a
   * reader picking cases sees the catalog's own words, not a code. */
  section: string;
  /** Position of that section in the file, so the UI can keep the order. */
  sectionNo: number;
  title: string;
  why: string;
  setup: string;
  steps: string;
  expected: string;
  oracle: string;
  /** P0 … P3, from the trace line. */
  priority: string;
  /** automate | automate-later | manual — the catalog's own verdict. */
  verdict: string;
  /** Feature flag named in Setup as `gate: flag_name`, when there is one. */
  gate?: string;
  /** The case documents present behaviour rather than desired behaviour. */
  recordsCurrentBehaviour?: boolean;
  /** Flows and files the trace line points at. */
  refs: string[];
  source: string;
}

// A field label may carry a qualifier — "**Expected (today).**" marks a case
// that records current behaviour rather than desired behaviour, which is a
// distinction worth keeping.
const FIELD = /^-\s+\*\*(Why it matters|Setup|Steps|Expected|Oracle|Trace)(\s*\([^)]*\))?\.?\*\*\s*/;

function parse(file: string, layer: "ui" | "api"): CatalogCase[] {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf8").split("\n");
  const cases: CatalogCase[] = [];
  let current: Partial<CatalogCase> | null = null;
  let field: string | null = null;
  const buf: Record<string, string[]> = {};

  let expectedLabel = "";
  let section = "";
  let sectionNo = 0;
  const flush = () => {
    if (!current?.id) return;
    const trace = (buf.Trace ?? []).join(" ").replace(/\s+/g, " ").trim();
    // "P0 · automate · flow `auth` + `EventsPage.goto` · PRD §7.1"
    const priority = trace.match(/\bP([0-3])\b/)?.[0] ?? "P2";
    const verdict = /automate-later/.test(trace)
      ? "automate-later"
      : /\bmanual\b/.test(trace)
        ? "manual"
        : /\bautomate\b/.test(trace)
          ? "automate"
          : "unclassified";
    const refs = [...trace.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const setup = (buf.Setup ?? []).join(" ").replace(/\s+/g, " ").trim();
    cases.push({
      id: current.id,
      layer,
      group: current.group!,
      section: current.section ?? section,
      sectionNo: current.sectionNo ?? sectionNo,
      title: current.title!,
      why: (buf["Why it matters"] ?? []).join(" ").replace(/\s+/g, " ").trim(),
      setup,
      steps: (buf.Steps ?? []).join(" ").replace(/\s+/g, " ").trim(),
      expected: (buf.Expected ?? []).join(" ").replace(/\s+/g, " ").trim(),
      /** True when Expected records what happens TODAY, not what should. */
      recordsCurrentBehaviour: /\(today\)/.test(expectedLabel),
      oracle: (buf.Oracle ?? []).join(" ").replace(/\s+/g, " ").trim(),
      priority,
      verdict,
      gate: setup.match(/gate:\s*`?([a-z0-9_]+)`?/i)?.[1],
      refs,
      source: trace,
    });
    current = null;
    field = null;
    expectedLabel = "";
    for (const k of Object.keys(buf)) delete buf[k];
  };

  for (const raw of lines) {
    const sec = raw.match(/^##\s+(?:(\d+)\.?\s+)?(.+?)\s*$/);
    if (sec && !/^#{3,}/.test(raw)) {
      flush();
      sectionNo = sec[1] ? Number(sec[1]) : sectionNo;
      section = sec[2].trim();
      continue;
    }
    const head = raw.match(/^#{3,4}\s+((?:UI|API)-[A-Z]+-\d+)\s*[—–-]\s*(.+)$/);
    if (head) {
      flush();
      current = {
        id: head[1],
        title: head[2].trim(),
        group: head[1].replace(/-\d+$/, ""),
        section,
        sectionNo,
      };
      continue;
    }
    if (!current) continue;
    const f = raw.match(FIELD);
    if (f) {
      field = f[1];
      if (field === "Expected") expectedLabel = raw;
      buf[field] = [raw.replace(FIELD, "")];
      continue;
    }
    // A continuation line of the current field (the catalog wraps prose).
    if (field && /^\s{2,}\S/.test(raw)) buf[field].push(raw.trim());
    else if (/^#{1,3}\s/.test(raw)) flush();
  }
  flush();
  return cases;
}

const ui = parse(join(ROOT, "test-cases", "events-ui.md"), "ui");
const api = parse(join(ROOT, "test-cases", "events-api.md"), "api");
const all = [...ui, ...api];

const byVerdict = all.reduce<Record<string, number>>((a, c) => ({ ...a, [c.verdict]: (a[c.verdict] ?? 0) + 1 }), {});
const byPriority = all.reduce<Record<string, number>>((a, c) => ({ ...a, [c.priority]: (a[c.priority] ?? 0) + 1 }), {});
// Setup is optional by design: 218 cases need no precondition beyond a logged-in
// buyer, and demanding one would be inventing a requirement the catalog does not
// have. The other five fields are mandatory.
const missing = all.filter((c) => !c.why || !c.steps || !c.expected || !c.oracle);

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), cases: all }, null, 2));
console.log(`Parsed ${all.length} cases — ${ui.length} UI, ${api.length} API`);
console.log(`  by verdict:  ${Object.entries(byVerdict).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`  by priority: ${Object.entries(byPriority).sort().map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`  gated cases: ${all.filter((c) => c.gate).length}`);
if (missing.length) console.log(`  ⚠ ${missing.length} case(s) missing a field: ${missing.slice(0, 5).map((c) => c.id).join(", ")}`);
console.log(`Wrote ${OUT}`);
