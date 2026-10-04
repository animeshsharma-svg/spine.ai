import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
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
    // A support-ticket regression lives in the journey group its Trace names (`API-XBID` …).
    if (current.id.startsWith("HS-")) current.group = refs.find((r) => /^API-[A-Z]+$/.test(r)) ?? "HS";
    // An approved assistant draft (api-assistant-approved.md) joins the group its Trace names.
    if (current.id.startsWith("GEN-")) current.group = refs.find((r) => /^(API|UI)-[A-Z]+$/.test(r)) ?? "GEN";
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
      gate: setup.match(/gate:\s*`?([a-z0-9_.]+)`?/i)?.[1],
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
    // UI-/API- are the hand-written catalog; PRD- are the product-knowledge
    // cases generated from the Modules & Features workbook.
    // HS-<ticketId>-N are the support-ticket regressions (hubspot-regressions.md);
    // their group is the journey group named in the Trace (see flush()).
    const head = raw.match(/^#{3,4}\s+((?:UI|API|PRD)-[A-Z]+(?:-[A-Z]+)?-\d+|EVI-[A-Z]+-\d+|HS-\d+-\d+|GEN-[A-Z]+-\d{3})\s*[—–-]\s*(.+)$/);
    if (head) {
      flush();
      current = {
        id: head[1],
        title: head[2].trim(),
        // UI-XCHK-<SCREEN>-NNN (the UI↔API cross-checks) all belong to the UI-XCHK group
        group: head[1].startsWith("UI-XCHK-") ? "UI-XCHK" : head[1].replace(/-\d+$/, ""),
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

// The two hand-written files first, then any generated case files that follow
// the same format: `api-*.md` (e.g. the per-field API assertions) and
// `product-*.md` (the product-knowledge cases). Other files in test-cases/
// (reviews of a PR, backend-change notes) use their own layouts and are left out.
const CASES_DIR = join(ROOT, "test-cases");
const extra = (prefix: string) =>
  readdirSync(CASES_DIR).filter((f) => f.startsWith(prefix) && f.endsWith(".md")).sort().map((f) => join(CASES_DIR, f));
// `ui-*.md`: generated UI-layer cases in the same format (e.g. the UI↔API cross-checks).
const ui = [join(CASES_DIR, "events-ui.md"), join(CASES_DIR, "events-ui-crosscheck.md"), ...extra("product-"), ...extra("ui-")].flatMap((f) => parse(f, "ui"));
// `hubspot-*.md`: regression cases generated from support tickets (scripts/hubspot-ingest.ts), API layer.
const api = [join(CASES_DIR, "events-api.md"), ...extra("api-"), ...extra("hubspot-")].flatMap((f) => parse(f, "api"));
// `events-deep-*.md`: sourcing events in depth, one file per area, holding BOTH
// screen (UI-XD…) and API (API-XD…) cases — the layer is read off each id.
// `events-integrity.md`: the bid-number checks (EVI-…), recomputed by src/integrity/.
// `events-deep2-*.md` / `events-deep3-*.md`: the second and third deep-dig rounds (API-EVD… / UI-EVD…).
const deep = [...extra("events-deep-"), ...extra("events-deep2-"), ...extra("events-deep3-"), ...extra("events-rules-"), ...extra("events-integrity")].flatMap((f) =>
  parse(f, "api").map((c) => (c.id.startsWith("UI-") ? { ...c, layer: "ui" as const } : c)),
);
const all = [...ui, ...api, ...deep];
const dupes = [...all.reduce((m, c) => m.set(c.id, (m.get(c.id) ?? 0) + 1), new Map<string, number>())].filter(([, n]) => n > 1);
if (dupes.length) console.log(`  ⚠ ${dupes.length} duplicate case id(s): ${dupes.slice(0, 5).map(([id]) => id).join(", ")}`);

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

// Keep the derived user-journeys file in sync with the catalog we just wrote.
try {
  const { buildJourneys } = await import("../src/checks/journeys.js");
  const { writeFileSync } = await import("node:fs");
  const { journeys, orphans } = buildJourneys();
  writeFileSync(join(here, "..", "data", "journeys.json"), JSON.stringify({ generatedAt: new Date().toISOString(), journeys, orphans }, null, 2));
  console.log(`Journeys: ${journeys.length} · ${journeys.reduce((n, j) => n + j.counts.total, 0)} cases placed · ${orphans.length} orphan(s)`);
} catch (e) {
  console.warn("journeys not rebuilt:", (e as Error).message);
}
