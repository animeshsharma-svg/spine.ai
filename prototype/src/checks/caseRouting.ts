import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UI_FLOWS } from "../ui/uiFlowRunner.js";
import { ALL_SUITES } from "./suites.js";
import type { CatalogCase } from "./testCatalog.js";
import { allCases } from "./testCatalog.js";

/**
 * How a written case reaches an actual runner — and, just as importantly, when
 * it does not.
 *
 * The catalog has 648 cases and the two frameworks do not implement 648 things.
 * Pretending otherwise would be the worst outcome available: a dashboard where
 * every case shows a Run button, half of them quietly compile to a generic plan
 * that proves nothing, and the pass rate becomes meaningless. So each case is
 * routed to the most specific runner that genuinely exists for it, and a case
 * with no runner says so.
 *
 * Order matters — most specific first:
 *   ui-journey   a hand-written, healed journey covers it exactly
 *   api-case     the API framework already has this case, by its own id
 *   api-suite    a validation suite covers this section
 *   ui-compile   no journey, but the compiler can build a plan from the prose
 *   manual       the catalog itself says a person must do this
 *   none         honestly unrunnable today
 */
const here = dirname(fileURLToPath(import.meta.url));
const API_REGISTRY = join(here, "..", "..", "..", "procol test", "src", "flows", "eventsContract.ts");

export type RouteKind =
  | "ui-journey"
  | "api-case"
  | "api-section"
  | "api-suite"
  | "ui-compile"
  | "manual"
  | "none";

export interface CaseRoute {
  kind: RouteKind;
  /** The journey key, BE- id or suite id this case runs as. */
  target?: string;
  /** Why this route, in one line, for the dashboard to show on hover. */
  because: string;
  runnable: boolean;
}

const FLOW_KEYS = new Set(UI_FLOWS.map((f) => f.key));
const SUITE_IDS = new Set(ALL_SUITES.map((s) => s.id));

let apiCaseIds: Set<string> | null = null;

/**
 * The case ids the API framework actually implements, read from its own
 * registry rather than kept as a second list here. A list maintained by hand
 * would drift the first time someone adds a case there.
 *
 * Scoped to the `CASE_RUNNERS` object on purpose. The same file also holds a
 * `SKIP_REASONS` map keyed by the same ids — counting those as implemented
 * would claim a runner for every case the framework has explicitly declared it
 * cannot run yet, which is the opposite of what that map means.
 */
function implementedApiCases(): Set<string> {
  if (apiCaseIds) return apiCaseIds;
  apiCaseIds = new Set();
  if (!existsSync(API_REGISTRY)) return apiCaseIds;
  try {
    const src = readFileSync(API_REGISTRY, "utf8");
    // Anchor on the DECLARATION. Plain "CASE_RUNNERS" first matches the file's
    // own doc comment, which slices out a window containing no cases at all.
    const start = src.indexOf("export const CASE_RUNNERS");
    const end = start >= 0 ? src.indexOf("\nexport const", start + 1) : -1;
    const registry = start >= 0 ? src.slice(start, end > 0 ? end : undefined) : "";
    for (const m of registry.matchAll(/["'](BE-\d+\.\d+)["']\s*:/g)) apiCaseIds.add(m[1]);
  } catch {
    /* the API project may not be checked out — routing degrades, nothing breaks */
  }
  return apiCaseIds;
}

/**
 * Catalog section → the API framework's own section that covers the same
 * ground, mapped from the section comments in its `CASE_RUNNERS` registry
 * (`1.x creation`, `3.x line items`, and so on).
 *
 * This is a WEAKER claim than `api-case` and is labelled as one: running BE-3.x
 * exercises line items at the HTTP layer, but it is not running this specific
 * written case. Offering it is still worth more than nothing — it is real
 * traffic against the right endpoints — as long as nobody reads it as the case
 * itself having passed.
 */
const SECTION_TO_BE_GROUP: Record<string, { group: number; what: string }> = {
  "API-EG": { group: 1, what: "creating the draft event group" },
  "API-STG": { group: 1, what: "stage creation" },
  "API-PUB": { group: 2, what: "activation" },
  "API-LC": { group: 9, what: "state transitions" },
  "API-LI": { group: 3, what: "line items" },
  "API-AUD": { group: 4, what: "audience and participants" },
  "API-BID": { group: 5, what: "bids" },
  "API-SUR": { group: 5, what: "bids" },
  "API-AWD": { group: 6, what: "awarding" },
  "API-CONV": { group: 7, what: "RFQ → Auction conversion" },
  "API-PERM": { group: 8, what: "authorization" },
};

/** The implemented case ids in one of the framework's sections. */
function beGroupCases(group: number): string[] {
  return [...implementedApiCases()].filter((id) => id.startsWith(`BE-${group}.`));
}

/** Section code → the validation suite that covers it, where one does. */
const SECTION_SUITES: Record<string, string> = {
  "API-EG": "events.rfp_rfq",
  "API-STG": "events.rfp_rfq",
  "API-VAL": "events.rfp_rfq",
};

export function routeFor(c: CatalogCase): CaseRoute {
  // 1 · a built journey named in the trace line beats everything: it is
  //     deterministic, healed, and needs no compile step.
  const journey = c.refs.find((r) => FLOW_KEYS.has(r));
  if (journey && c.layer === "ui") {
    return { kind: "ui-journey", target: journey, because: `the "${journey}" journey covers this`, runnable: true };
  }

  // 2 · the API framework may already implement this exact case.
  const be = c.refs.concat(c.source.match(/BE-\d+\.\d+/g) ?? []).find((r) => implementedApiCases().has(r));
  if (be && c.layer === "api") {
    return { kind: "api-case", target: be, because: `the API framework implements this as ${be}`, runnable: true };
  }

  if (c.verdict === "manual") {
    return { kind: "manual", because: "the catalog marks this one for a person", runnable: false };
  }

  // 3 · the framework may cover this AREA without covering this case.
  const area = SECTION_TO_BE_GROUP[c.group];
  if (c.layer === "api" && area) {
    const ids = beGroupCases(area.group);
    if (ids.length) {
      return {
        kind: "api-section",
        target: ids.join(","),
        because: `no exact runner — the API framework covers ${area.what} as ${ids.length} case(s) (BE-${area.group}.x)`,
        runnable: true,
      };
    }
  }

  // 4 · a validation suite covering the same ground is the last API answer.
  const suite = SECTION_SUITES[c.group];
  if (c.layer === "api" && suite && SUITE_IDS.has(suite)) {
    return { kind: "api-suite", target: suite, because: `the "${suite}" validation suite covers this section`, runnable: true };
  }

  // 4 · the compiler can turn any written UI case into a plan. Worth offering,
  //     but it is a compile, so the plan is shown before it runs.
  if (c.layer === "ui" && c.verdict !== "manual") {
    return { kind: "ui-compile", because: "no journey covers this — the compiler builds a plan from the prose", runnable: true };
  }

  return {
    kind: "none",
    because: c.layer === "api" ? "no API runner for this section yet" : "no runner for this case yet",
    runnable: false,
  };
}

/** Coverage, counted rather than claimed. */
export function routingCoverage() {
  const byKind: Record<string, number> = {};
  let runnable = 0;
  for (const c of allCases()) {
    const r = routeFor(c);
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    if (r.runnable) runnable += 1;
  }
  const total = allCases().length;
  return { total, runnable, unrunnable: total - runnable, byKind };
}
