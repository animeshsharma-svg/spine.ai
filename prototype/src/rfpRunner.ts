import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TokenClient } from "../config/tokenClients.js";

/**
 * THE RFP SUITE, DRIVEN FROM THE PLATFORM.
 *
 * aanya_events/rfp is a Playwright project of its own — the "RFP/RFQ Event
 * Publish" Postman collection, ported request for request. The platform does
 * not re-implement any of it: it resolves the account's token, passes the
 * run's choices (which parts, how many line items, what quantities, how many
 * vendors) through the environment, streams each case as the suite reports
 * it, and files the suite's own report under a run id so the test report and
 * the bug sheet for THIS run stay reachable after the next one.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SUITE_DIR = join(here, "..", "..", "aanya_events", "rfp");
const RUNS_DIR = join(here, "..", "data", "rfp-runs");

export type RfpPart = "publish" | "verify" | "negative";

/**
 * Which platform features the suite covers, and with how many cases.
 *
 * Read from the suite's own features.json (feature → case-id patterns) and
 * the case ids in its specs, so the tree's numbers follow the suite as cases
 * are added — nothing is counted by hand here.
 */
export function rfpFeatureCases(): Record<string, number> {
  const mapFile = join(SUITE_DIR, "features.json");
  if (!existsSync(mapFile)) return {};
  const map = JSON.parse(readFileSync(mapFile, "utf8")) as { features: Array<{ id: string; cases: string[] }> };
  const ids = new Set<string>();
  const testsDir = join(SUITE_DIR, "tests");
  const specs = existsSync(testsDir) ? readdirSync(testsDir).filter((f) => f.endsWith(".spec.ts")) : [];
  for (const f of specs) {
    const path = join(testsDir, f);
    if (!existsSync(path)) continue;
    // Cases are declared as `id: "1.2"` or through a helper, `reqCase("5.2.1", …)`.
    const src = readFileSync(path, "utf8");
    // Ids are "1.2", "1.5b", "4B.1", "5B.3.10".
    for (const m of src.match(/\bid: "\d+[A-Z]?(?:\.\d+[a-z]?)+"|(?:reqCase|typeCase|simpleRead|rfqOnly)\(\s*"\d+[A-Z]?(?:\.\d+[a-z]?)+"/g) ?? []) {
      ids.add(m.match(/\d+[A-Z]?(?:\.\d+[a-z]?)+/)![0]);
    }
  }
  const out: Record<string, number> = {};
  for (const f of map.features) {
    const res = f.cases.map((p) => new RegExp(p));
    out[f.id] = [...ids].filter((id) => res.some((r) => r.test(id))).length;
  }
  return out;
}

/** The steps listed as the run's journey, from features.json. */
export function rfpJourney(): Array<{ id: string; title: string; actor: string; feature?: string; mode?: "rfp" | "rfq" }> {
  const mapFile = join(SUITE_DIR, "features.json");
  if (!existsSync(mapFile)) return [];
  return (JSON.parse(readFileSync(mapFile, "utf8")).journey ?? []) as Array<{ id: string; title: string; actor: string; feature?: string; mode?: "rfp" | "rfq" }>;
}

export function rfpReady(): { ready: boolean; reason?: string } {
  if (!existsSync(join(SUITE_DIR, "playwright.config.ts"))) return { ready: false, reason: "aanya_events/rfp is not in this repo" };
  if (!existsSync(join(SUITE_DIR, "node_modules", ".bin", "playwright"))) {
    return { ready: false, reason: "aanya_events/rfp needs `npm install` before it can run" };
  }
  return { ready: true };
}

export interface RfpInputs {
  /** the platform features ticked — the suite runs the cases that test them */
  features: string[];
  lineItems?: number;
  /** "5" for every item, or "5,10,2.5" one per item */
  quantities?: string;
  vendors?: number;
  /** how many invited vendors to place a surrogate bid for */
  surrogateBids?: number;
  /** how many invited vendors log in to the portal and bid themselves */
  vendorBids?: number;
}

/** What the run was asked for, checked before anything is spawned. Null when fine. */
export function inputProblem(i: RfpInputs): string | null {
  if (i.lineItems !== undefined && !(Number.isInteger(i.lineItems) && i.lineItems >= 1 && i.lineItems <= 50)) {
    return "line items must be a whole number from 1 to 50";
  }
  if (i.vendors !== undefined && !(Number.isInteger(i.vendors) && i.vendors >= 1 && i.vendors <= 50)) {
    return "vendors must be a whole number from 1 to 50";
  }
  if (i.vendorBids !== undefined) {
    if (!(Number.isInteger(i.vendorBids) && i.vendorBids >= 1)) return "vendor bids must be a whole number of at least 1";
    const both = (i.vendorBids ?? 0) + (i.surrogateBids ?? 0);
    if (both > (i.vendors ?? 3)) return `${both} bids in all but only ${i.vendors ?? 3} vendor(s) invited — each vendor bids once, so invite at least as many vendors as bids`;
  }
  if (i.surrogateBids !== undefined) {
    if (!(Number.isInteger(i.surrogateBids) && i.surrogateBids >= 1)) return "surrogate bids must be a whole number of at least 1";
    if (i.surrogateBids > (i.vendors ?? 3)) return `${i.surrogateBids} surrogate bids but only ${i.vendors ?? 3} vendor(s) invited — invite at least as many vendors as bids`;
  }
  if (i.quantities) {
    const list = i.quantities.split(",").map((s) => s.trim());
    if (list.some((q) => !(Number(q) > 0))) return `every quantity must be a number above 0 — got "${i.quantities}"`;
    const n = i.lineItems ?? 2;
    if (list.length > 1 && list.length !== n) {
      return `${list.length} quantities for ${n} line item${n === 1 ? "" : "s"} — give one quantity for all, or exactly ${n}`;
    }
  }
  return null;
}

export interface RfpCaseEvent {
  order: number;
  id: string;
  title: string;
  plain: string;
  anchor: string;
  part: RfpPart;
  kind: string;
  verdict: "pass" | "fail" | "not-run";
  reason?: string;
  expected: string;
  actual: string;
  ms: number;
  status: number | null;
  failed: string[];
}

export interface RfpRunEvent {
  type: "start" | "log" | "case" | "done" | "run-error";
  line?: string;
  case?: RfpCaseEvent;
  runId?: string;
  exitCode?: number;
  summary?: { total: number; passed: number; failed: number; notRun: number; checks: number; checksFailed: number };
  event?: { eventGroupUuid?: string; title?: string; published: boolean };
}

export interface RfpRunRecord {
  runId: string;
  startedAt: string;
  endedAt: string;
  companyName: string;
  exitCode: number;
  inputs: RfpInputs;
  model: any;
}

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*[A-Za-z]", "g");

export function runRfp(
  client: TokenClient,
  auth: { token: string; lightspeed?: string },
  inputs: RfpInputs,
  emit: (e: RfpRunEvent) => void,
): { stop: () => void; runId: string } {
  const runId = `rfp-${Date.now().toString(36)}`;
  const started = Date.now();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AANYA_EVENTS_ACCESS_TOKEN: auth.token,
    AANYA_EVENTS_LIGHTSPEED_TOKEN: auth.lightspeed ?? "",
    RFP_BASE_URL: client.apiBaseUrl,
    RFP_APP_VERSION: client.appVersion,
    RFP_FEATURES: inputs.features.join(","),
    FORCE_COLOR: "0",
    // The suite prints machine lines ([rfp-case] …) for this reader, plain ones for a person.
    RFP_STREAM: "1",
  };
  // Only what this run asked for travels; everything else takes the suite's default.
  delete env.RFP_SCENARIO;
  delete env.RFP_SUITES;
  delete env.RFP_RFX_MODE;
  // "RFQ only" ticked makes this run an RFQ; anything else is an RFP.
  env.RFP_RFX_MODE = inputs.features.includes("events.rfq_only") ? "rfq" : "rfp";
  delete env.RFP_NUM_LINE_ITEMS;
  delete env.RFP_QUANTITIES;
  delete env.RFP_NUM_VENDORS;
  delete env.RFP_NUM_SURROGATE_BIDS;
  delete env.RFP_NUM_BIDS;
  if (inputs.vendorBids) env.RFP_NUM_BIDS = String(inputs.vendorBids);
  if (inputs.surrogateBids) env.RFP_NUM_SURROGATE_BIDS = String(inputs.surrogateBids);
  if (inputs.lineItems) env.RFP_NUM_LINE_ITEMS = String(inputs.lineItems);
  if (inputs.quantities) env.RFP_QUANTITIES = inputs.quantities.replace(/\s+/g, "");
  if (inputs.vendors) env.RFP_NUM_VENDORS = String(inputs.vendors);

  const bin = join(SUITE_DIR, "node_modules", ".bin", "playwright");
  emit({ type: "start", runId, line: `$ npx playwright test   (aanya_events/rfp · ${inputs.features.join(", ")})` });
  const child = spawn(bin, ["test"], { cwd: SUITE_DIR, env });

  let buf = "";
  const onData = (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const raw = buf.slice(0, nl).replace(ANSI, "");
      buf = buf.slice(nl + 1);
      // The line reporter redraws in place with \r; only the last frame is news.
      const line = raw.split("\r").pop()!.trim();
      if (!line) continue;
      if (line.startsWith("[rfp-case] ")) {
        try {
          emit({ type: "case", runId, case: JSON.parse(line.slice(11)) as RfpCaseEvent });
        } catch {
          /* a malformed line is not worth failing a run over */
        }
        continue;
      }
      if (line.startsWith("[rfp-done] ")) continue;
      // Playwright's progress counter ("[12/104] …") says nothing the rows do not.
      if (/^\[\d+\/\d+\]/.test(line)) continue;
      emit({ type: "log", runId, line });
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  child.on("close", (code) => {
    const exitCode = code ?? 1;
    const jsonFile = join(SUITE_DIR, "reports", "rfp-run.json");
    const htmlFile = join(SUITE_DIR, "reports", "rfp-report.html");
    // A report older than this run is the previous run's — never show it as this one.
    if (!existsSync(jsonFile) || statSync(jsonFile).mtimeMs < started) {
      emit({ type: "run-error", runId, line: `the suite exited (${exitCode}) without writing a report — see the log above` });
      emit({ type: "done", runId, exitCode });
      return;
    }
    const model = JSON.parse(readFileSync(jsonFile, "utf8"));
    mkdirSync(RUNS_DIR, { recursive: true });
    const record: RfpRunRecord = {
      runId,
      startedAt: new Date(started).toISOString(),
      endedAt: new Date().toISOString(),
      companyName: client.name,
      exitCode,
      inputs,
      model,
    };
    writeFileSync(join(RUNS_DIR, `${runId}.json`), JSON.stringify(record));
    if (existsSync(htmlFile)) writeFileSync(join(RUNS_DIR, `${runId}.html`), readFileSync(htmlFile));
    emit({
      type: "done",
      runId,
      exitCode,
      summary: model.summary,
      event: { eventGroupUuid: model.event?.eventGroupUuid, title: model.event?.title, published: !!model.event?.published },
    });
  });
  child.on("error", (e) => {
    emit({ type: "run-error", runId, line: `could not start the suite: ${e.message}` });
    emit({ type: "done", runId, exitCode: 1 });
  });

  return { runId, stop: () => child.kill("SIGTERM") };
}

const safe = (id: string) => id.replace(/[^0-9a-zA-Z_-]/g, "");

export function readRfpRun(id: string): RfpRunRecord | null {
  if (!id.startsWith("rfp-")) return null;
  const file = join(RUNS_DIR, `${safe(id)}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as RfpRunRecord) : null;
}

export function readRfpRunHtml(id: string): string | null {
  const file = join(RUNS_DIR, `${safe(id)}.html`);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/** The newest run, for a report link opened without a run id. */
export function latestRfpRunId(): string | null {
  if (!existsSync(RUNS_DIR)) return null;
  const ids = readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort();
  return ids.length ? ids[ids.length - 1] : null;
}
