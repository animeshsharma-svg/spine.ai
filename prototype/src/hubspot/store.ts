/**
 * WHERE PROCESSED TICKETS LIVE — spine.ai's database (support_tickets, migration
 * 007), with a git-ignored file under data/hubspot/ when the database is down.
 *
 * Only stripped text is ever written. A ticket whose stripped text tripped the
 * leak check is written with its subject, summary and scenario prose
 * WITHHELD — the counts and the classification survive, the words do not.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { spineDb } from "../db/spineDb.js";
import { HUBSPOT_DIR } from "./mapFeature.js";
import type { ProcessedTicket, ReproStatus, Scenario } from "./types.js";

export const PROCESSED_FILE = join(HUBSPOT_DIR, "tickets.processed.json");
const WITHHELD = "[withheld: personal data survived stripping — fix the stripper, then ingest again]";

/** One stored row, in the shape the route and the reproduce script read. */
export interface TicketRow {
  ticketId: string;
  dataset: string;
  inputKind: string | null;
  subject: string | null;
  summary: string | null;
  category: string | null;
  priority: string | null;
  pipelineStage: string | null;
  sourceType: string | null;
  createdAt: string | null;
  closedAt: string | null;
  clientId: number | null;
  module: string | null;
  featureKey: string | null;
  inEventsScope: boolean;
  classification: string | null;
  confidence: number | null;
  classifiedBy: string | null;
  mappedBy: string | null;
  mapConfidence: number | null;
  classificationWhy: string | null;
  scenario: Scenario | null;
  linkedCaseIds: string[];
  reproductionStatus: ReproStatus;
  reproductionEvidence: any;
  lastRunAt: string | null;
  piiRemoved: Record<string, number>;
  leakKinds: string[];
  aiSkipped: boolean;
}

export function toRow(p: ProcessedTicket, prev?: TicketRow): TicketRow {
  const leaky = p.ticket.leaks.length > 0;
  const scenario = p.scenario && leaky ? { ...p.scenario, preconditions: WITHHELD, steps: [WITHHELD], expected: WITHHELD, observed: WITHHELD } : p.scenario;
  const sameCases = prev && JSON.stringify(prev.linkedCaseIds) === JSON.stringify(p.linkedCaseIds);
  return {
    ticketId: p.ticket.id,
    dataset: p.dataset,
    inputKind: p.ticket.inputKind,
    subject: leaky ? WITHHELD : p.ticket.subject,
    summary: leaky ? WITHHELD : p.ticket.summary,
    category: p.ticket.category ?? null,
    priority: p.ticket.priority ?? null,
    pipelineStage: p.ticket.pipelineStage ?? null,
    sourceType: p.ticket.sourceType ?? null,
    createdAt: p.ticket.createdAt ?? null,
    closedAt: p.ticket.closedAt ?? null,
    clientId: p.ticket.clientId,
    module: p.module,
    featureKey: p.featureKey,
    inEventsScope: p.inEventsScope,
    classification: p.classification,
    confidence: p.classificationConfidence,
    classifiedBy: p.classifiedBy,
    mappedBy: p.mappedBy,
    mapConfidence: p.mapConfidence,
    classificationWhy: leaky ? "classified by rules only (text withheld)" : p.classificationWhy,
    scenario,
    linkedCaseIds: p.linkedCaseIds,
    // A re-ingest keeps an earlier live verdict as long as the linked cases are the same.
    reproductionStatus: sameCases && prev ? prev.reproductionStatus : p.scenario && !p.scenario.automatable ? "not_automatable" : "not_tried",
    reproductionEvidence: sameCases && prev ? prev.reproductionEvidence : p.scenario && !p.scenario.automatable ? { because: p.scenario.notAutomatableBecause } : null,
    lastRunAt: sameCases && prev ? prev.lastRunAt : null,
    piiRemoved: p.ticket.removed as Record<string, number>,
    leakKinds: p.ticket.leaks,
    aiSkipped: p.aiSkipped,
  };
}

function fromDb(r: any): TicketRow {
  const iso = (d: any) => (d ? new Date(d).toISOString() : null);
  return {
    ticketId: r.ticket_id,
    dataset: r.dataset,
    inputKind: r.input_kind,
    subject: r.subject,
    summary: r.summary,
    category: r.category,
    priority: r.priority,
    pipelineStage: r.pipeline_stage,
    sourceType: r.source_type,
    createdAt: iso(r.created_at),
    closedAt: iso(r.closed_at),
    clientId: r.client_id,
    module: r.module,
    featureKey: r.feature_key,
    inEventsScope: r.in_events_scope,
    classification: r.classification,
    confidence: r.confidence,
    classifiedBy: r.classified_by,
    mappedBy: r.mapped_by,
    mapConfidence: r.map_confidence,
    classificationWhy: r.classification_why,
    scenario: r.scenario,
    linkedCaseIds: r.linked_case_ids ?? [],
    reproductionStatus: r.reproduction_status,
    reproductionEvidence: r.reproduction_evidence,
    lastRunAt: iso(r.last_run_at),
    piiRemoved: r.pii_removed ?? {},
    leakKinds: r.leak_kinds ?? [],
    aiSkipped: r.ai_skipped,
  };
}

function readFile(): TicketRow[] {
  if (!existsSync(PROCESSED_FILE)) return [];
  try {
    return JSON.parse(readFileSync(PROCESSED_FILE, "utf8")).tickets ?? [];
  } catch {
    return [];
  }
}
function writeFile(rows: TicketRow[]): void {
  mkdirSync(HUBSPOT_DIR, { recursive: true });
  writeFileSync(PROCESSED_FILE, JSON.stringify({ note: "STRIPPED support tickets — customer-derived, git-ignored, never commit", updatedAt: new Date().toISOString(), tickets: rows }, null, 1));
}

/** Every stored row: the database when it is up, else the file. */
export async function loadRows(): Promise<{ rows: TicketRow[]; from: "db" | "file" }> {
  const db = await spineDb();
  if (db) {
    try {
      const r = await db.query("SELECT * FROM support_tickets ORDER BY created_at DESC NULLS LAST, ticket_id");
      return { rows: r.rows.map(fromDb), from: "db" };
    } catch {
      /* table missing → file */
    }
  }
  return { rows: readFile(), from: "file" };
}

/** Save rows to the database (upsert) AND the file, so either can answer. */
export async function saveRows(rows: TicketRow[]): Promise<{ db: boolean }> {
  const byId = new Map(readFile().map((r) => [r.ticketId, r]));
  for (const r of rows) byId.set(r.ticketId, r);
  writeFile([...byId.values()]);
  const db = await spineDb();
  if (!db) return { db: false };
  try {
    for (const r of rows) {
      await db.query(
        `INSERT INTO support_tickets (ticket_id, dataset, input_kind, subject, summary, category, priority, pipeline_stage, source_type,
           created_at, closed_at, client_id, module, feature_key, in_events_scope, classification, confidence, classified_by, mapped_by,
           map_confidence, classification_why, scenario, linked_case_ids, reproduction_status, reproduction_evidence, last_run_at,
           pii_removed, leak_kinds, ai_skipped, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29, now())
         ON CONFLICT (ticket_id) DO UPDATE SET
           dataset=EXCLUDED.dataset, input_kind=EXCLUDED.input_kind, subject=EXCLUDED.subject, summary=EXCLUDED.summary,
           category=EXCLUDED.category, priority=EXCLUDED.priority, pipeline_stage=EXCLUDED.pipeline_stage, source_type=EXCLUDED.source_type,
           created_at=EXCLUDED.created_at, closed_at=EXCLUDED.closed_at, client_id=EXCLUDED.client_id, module=EXCLUDED.module,
           feature_key=EXCLUDED.feature_key, in_events_scope=EXCLUDED.in_events_scope, classification=EXCLUDED.classification,
           confidence=EXCLUDED.confidence, classified_by=EXCLUDED.classified_by, mapped_by=EXCLUDED.mapped_by,
           map_confidence=EXCLUDED.map_confidence, classification_why=EXCLUDED.classification_why, scenario=EXCLUDED.scenario,
           linked_case_ids=EXCLUDED.linked_case_ids, reproduction_status=EXCLUDED.reproduction_status,
           reproduction_evidence=EXCLUDED.reproduction_evidence, last_run_at=EXCLUDED.last_run_at, pii_removed=EXCLUDED.pii_removed,
           leak_kinds=EXCLUDED.leak_kinds, ai_skipped=EXCLUDED.ai_skipped, updated_at=now()`,
        [
          r.ticketId, r.dataset, r.inputKind, r.subject, r.summary, r.category, r.priority, r.pipelineStage, r.sourceType,
          r.createdAt, r.closedAt, r.clientId, r.module, r.featureKey, r.inEventsScope, r.classification, r.confidence, r.classifiedBy,
          r.mappedBy, r.mapConfidence, r.classificationWhy, r.scenario ? JSON.stringify(r.scenario) : null, r.linkedCaseIds,
          r.reproductionStatus, r.reproductionEvidence ? JSON.stringify(r.reproductionEvidence) : null, r.lastRunAt,
          JSON.stringify(r.piiRemoved), r.leakKinds, r.aiSkipped,
        ],
      );
    }
    return { db: true };
  } catch (e) {
    console.warn(`[hubspot] database write failed (${(e as Error).message}) — the file copy is current`);
    return { db: false };
  }
}

/** Store a live reproduction verdict for one ticket. */
export async function saveReproduction(ticketId: string, status: TicketRow["reproductionStatus"], evidence: unknown): Promise<void> {
  const now = new Date().toISOString();
  const rows = readFile();
  const r = rows.find((x) => x.ticketId === ticketId);
  if (r) {
    r.reproductionStatus = status;
    r.reproductionEvidence = evidence;
    r.lastRunAt = now;
    writeFile(rows);
  }
  const db = await spineDb();
  if (!db) return;
  await db
    .query(`UPDATE support_tickets SET reproduction_status=$2, reproduction_evidence=$3, last_run_at=$4, updated_at=now() WHERE ticket_id=$1`, [ticketId, status, JSON.stringify(evidence), now])
    .catch((e) => console.warn(`[hubspot] could not store the verdict for ${ticketId}: ${(e as Error).message}`));
}

/** Aggregates only — no text. */
export function summarise(rows: TicketRow[]) {
  const count = (key: (r: TicketRow) => string | null | undefined) =>
    rows.reduce<Record<string, number>>((a, r) => {
      const k = key(r) ?? "unmapped";
      a[k] = (a[k] ?? 0) + 1;
      return a;
    }, {});
  return {
    total: rows.length,
    byDataset: count((r) => r.dataset),
    byClassification: count((r) => r.classification),
    byModule: count((r) => r.module),
    byFeature: count((r) => r.featureKey),
    // Reproduction only means something for event defects; how-tos and requests are never "tried".
    byReproduction: rows
      .filter((r) => r.inEventsScope && r.classification === "defect")
      .reduce<Record<string, number>>((a, r) => ({ ...a, [r.reproductionStatus]: (a[r.reproductionStatus] ?? 0) + 1 }), {}),
    byClassifiedBy: count((r) => r.classifiedBy),
    byMappedBy: count((r) => r.mappedBy),
    eventsScope: rows.filter((r) => r.inEventsScope).length,
    eventDefects: rows.filter((r) => r.inEventsScope && r.classification === "defect").length,
    linkedCases: rows.reduce((n, r) => n + r.linkedCaseIds.length, 0),
    leakFlagged: rows.filter((r) => r.leakKinds.length).length,
    aiSkipped: rows.filter((r) => r.aiSkipped).length,
    piiRemoved: rows.reduce<Record<string, number>>((a, r) => {
      for (const [k, v] of Object.entries(r.piiRemoved ?? {})) a[k] = (a[k] ?? 0) + v;
      return a;
    }, {}),
  };
}
