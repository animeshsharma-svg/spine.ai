/**
 * HUBSPOT TICKETS → STRIPPED RECORDS → CLASSIFIED → MAPPED → REGRESSION CASES.
 *
 *   npm run hubspot:ingest                              everything in data/hubspot/ (tickets.raw.json, *.csv, *.xlsx)
 *   npm run hubspot:ingest -- --fixture                 the 100% synthetic fixtures (JSON + CSV) — a self-test
 *   npm run hubspot:ingest -- --input <file|dir>        a specific export
 *     --no-ai        no model at all (rules + local/remote embedder only)
 *     --no-embed     no embedder either (rules only)
 *     --dry          decide and report, write nothing
 *     --no-cases     do not rewrite test-cases/hubspot-regressions.md
 *
 * Order, per ticket — and nothing is stored or sent before step 2:
 *   1  load (JSON / CSV / XLSX; CSV and XLSX columns matched by header name)
 *   2  strip personal data (src/hubspot/strip.ts) and drop the raw text
 *   3  leak check — anything left (an email or phone shape, a dictionary name)
 *      keeps the ticket away from every model and withholds its text from storage
 *   4  classify: defect / how_to / request / config / data (rules; fast tier on a tie)
 *   5  map to a feature-tree leaf (pattern → keywords → embedder → fast tier on a tie)
 *   6  defects: a reproducible scenario (pattern → fast tier → placeholder)
 *   7  store in spine.ai (support_tickets) + data/hubspot/tickets.processed.json
 *   8  write test-cases/hubspot-regressions.md (generic text, HubSpot ids only)
 *
 * What this prints is aggregate or stripped. Then: `npm run cases:import`.
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });

import { loadTicketFile } from "../src/hubspot/load.js";
import { mayReachModel, stripTicket } from "../src/hubspot/strip.js";
import { classifyTicket } from "../src/hubspot/classify.js";
import { HUBSPOT_DIR, mapTicket } from "../src/hubspot/mapFeature.js";
import { buildScenario } from "../src/hubspot/scenario.js";
import { EVENT_FEATURES_ELSEWHERE, EVENT_MODULES } from "../src/hubspot/patterns.js";
import { buildCaseFile, CASES_FILE, writeCaseFile } from "../src/hubspot/cases.js";
import { loadRows, saveRows, summarise, toRow } from "../src/hubspot/store.js";
import { fastUsage, slingringAvailable } from "../src/hubspot/slingringFast.js";
import { spineDb, closeSpineDb } from "../src/db/spineDb.js";
import type { ProcessedTicket, RawTicket } from "../src/hubspot/types.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const AI_ON = !flag("no-ai");
const EMBED_ON = !flag("no-embed");
const DRY = flag("dry");
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

const FIXTURES = join(here, "..", "data", "fixtures");
function inputs(): string[] {
  if (flag("fixture")) return [join(FIXTURES, "hubspot-tickets.synthetic.json"), join(FIXTURES, "hubspot-tickets.synthetic.csv")];
  const given = arg("input");
  const target = given ? (given.startsWith("/") ? given : join(process.cwd(), given)) : HUBSPOT_DIR;
  if (!existsSync(target)) return [];
  if (statSync(target).isFile()) return [target];
  return readdirSync(target)
    .filter((f) => f === "tickets.raw.json" || /\.(csv|xlsx|xls)$/i.test(f) || /^tickets\..*\.raw\.json$/.test(f))
    .map((f) => join(target, f));
}

const files = inputs();
if (!files.length) {
  log(`no ticket export found — put tickets.raw.json, a .csv or a .xlsx in ${relative(process.cwd(), HUBSPOT_DIR)}/ (git-ignored), or pass --fixture`);
  process.exit(1);
}
const dataset: ProcessedTicket["dataset"] = files.every((f) => f.includes(`${"/"}fixtures${"/"}`)) ? "synthetic" : "hubspot";

// ── 1 · load ────────────────────────────────────────────────────────────────
const raws = new Map<string, RawTicket>();
for (const f of files) {
  const r = loadTicketFile(f);
  let added = 0;
  for (const t of r.tickets) {
    // A JSON export (with its thread) wins over the same ticket in a CSV.
    if (raws.has(t.id) && raws.get(t.id)!.inputKind === "json") continue;
    raws.set(t.id, t);
    added += 1;
  }
  log(`${relative(process.cwd(), f)}: ${r.tickets.length} ticket(s) read (${r.kind})${r.missingColumns.length ? ` — columns not in this export: ${r.missingColumns.join(", ")}` : ""}${added < r.tickets.length ? `; ${r.tickets.length - added} already read from JSON` : ""}`);
}
log(`${raws.size} ticket(s) · dataset ${dataset} · model ${AI_ON && slingringAvailable() ? "Slingring fast tier (tie-breaks only, clean tickets only)" : "off"} · embedder ${EMBED_ON ? "on" : "off"}`);

// ── 2–6 · strip, check, classify, map, scenario ────────────────────────────
const processed: ProcessedTicket[] = [];
for (const raw of raws.values()) {
  const ticket = stripTicket(raw);
  raws.delete(raw.id); // the raw text is not needed past this point
  const clean = ticket.leaks.length === 0;
  const ai = mayReachModel(ticket, AI_ON);
  const cls = await classifyTicket(ticket, { ai });
  const map = await mapTicket(ticket, { ai, embed: EMBED_ON && clean });
  const inScope = !!map.module && (EVENT_MODULES.has(map.module) || (!!map.feature && EVENT_FEATURES_ELSEWHERE.has(map.feature)));
  // The model writes a scenario only for event defects (the POC scope); others get the pattern or a placeholder.
  const scenario = cls.classification === "defect" ? await buildScenario(ticket, map.feature, { ai: ai && inScope }) : null;
  processed.push({
    ticket,
    classification: cls.classification,
    classificationConfidence: cls.confidence,
    classifiedBy: cls.by,
    classificationWhy: cls.why,
    module: map.module,
    featureKey: map.feature,
    mapConfidence: map.confidence,
    mappedBy: map.by,
    mapCandidates: map.candidates,
    scenario,
    linkedCaseIds: [],
    aiSkipped: !ai,
    aiSkippedWhy: !clean ? `leak check: ${ticket.leaks.join(", ")} survived stripping` : !AI_ON ? "--no-ai" : undefined,
    inEventsScope: inScope,
    dataset,
  });
  log(
    `  ${ticket.id}  ${cls.classification.padEnd(7)} ${String(cls.confidence).padEnd(4)} (${cls.by})  →  ${map.feature ?? "unmapped"} (${map.by} ${map.confidence})` +
      `${inScope ? " · events" : ""}${scenario ? ` · scenario ${scenario.pattern}${scenario.automatable ? "" : " (not automatable)"}` : ""}${clean ? "" : `  ⚠ LEAK ${ticket.leaks.join(",")} — kept from AI, text withheld`}`,
  );
}

// ── 8 · the regression cases (ids are needed before storing) ────────────────
const generatedAt = new Date().toISOString();
const { md, ids } = buildCaseFile(processed, { generatedAt, note: dataset === "synthetic" ? "synthetic fixture — pipeline self-test" : undefined });

// ── 7 · store ───────────────────────────────────────────────────────────────
const summary = summarise(processed.map((p) => toRow(p)));
if (DRY) {
  log("--dry: nothing written");
} else {
  const { rows: before } = await loadRows();
  const prev = new Map(before.map((r) => [r.ticketId, r]));
  const rows = processed.map((p) => toRow(p, prev.get(p.ticket.id)));
  const saved = await saveRows(rows);
  // Real tickets replace the self-test: synthetic rows would otherwise point at cases that no longer exist.
  if (dataset === "hubspot") {
    const db = await spineDb();
    if (db) await db.query("DELETE FROM support_tickets WHERE dataset = 'synthetic'").catch(() => {});
  }
  log(`stored ${rows.length} stripped record(s) in ${saved.db ? "spine.ai's database (support_tickets) and " : ""}${relative(process.cwd(), join(HUBSPOT_DIR, "tickets.processed.json"))}`);
  if (!flag("no-cases")) {
    writeCaseFile(md);
    log(`wrote ${ids.length} regression case(s) to ${relative(process.cwd(), CASES_FILE)} — now run: npm run cases:import`);
  }
  mkdirSync(HUBSPOT_DIR, { recursive: true });
  writeFileSync(
    join(HUBSPOT_DIR, "ingest-report.json"),
    JSON.stringify({ generatedAt, dataset, files: files.map((f) => relative(process.cwd(), f)), summary, fastUsage, tickets: processed.map((p) => ({ id: p.ticket.id, classification: p.classification, by: p.classifiedBy, why: p.classificationWhy, feature: p.featureKey, mappedBy: p.mappedBy, candidates: p.mapCandidates, scenario: p.scenario?.pattern, leaks: p.ticket.leaks, removed: p.ticket.removed, cases: p.linkedCaseIds })) }, null, 1),
  );
}

log(`classification: ${JSON.stringify(summary.byClassification)}  · decided by ${JSON.stringify(summary.byClassifiedBy)}`);
log(`modules: ${JSON.stringify(summary.byModule)}  · mapped by ${JSON.stringify(summary.byMappedBy)}`);
log(`events scope: ${summary.eventsScope} · event defects: ${summary.eventDefects} · cases: ${ids.length} · leak-flagged: ${summary.leakFlagged} · kept from AI: ${summary.aiSkipped}`);
log(`personal data removed: ${JSON.stringify(summary.piiRemoved)}`);
log(`fast-tier calls: ${fastUsage.calls} (${fastUsage.failures} failed) · ${fastUsage.promptTokens + fastUsage.completionTokens} tokens · reason tier: never`);
await closeSpineDb();
process.exit(0);
