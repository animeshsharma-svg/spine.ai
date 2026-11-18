/**
 * THE OPEN-DEFECT SET — the tickets the platform is measured against.
 *
 * A ticket counts when the support/engineering team's own "Is Defect" column of the RCA export says yes and its
 * stage is not Closed (so the defect is still with the product), and the pipeline sorted it as a defect inside
 * the sourcing-events scope (the platform's remit). Tickets that share a defect pattern share one regression case
 * (HS-<ticket>-1), so the set is kept per case with its tickets. Used by hubspot:reproduce (replay), hubspot:derive
 * (cases around the ticket) and hubspot:metrics (the funnel). Counts only ever leave this module; no ticket text.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { HUBSPOT_DIR } from "./mapFeature.js";
import type { TicketRow } from "./store.js";

export const EXPORT_FILE = join(HUBSPOT_DIR, "rca_retrieval_all_2026-07-01_2026-09-30.xlsx");

/** The team's own "Is Defect" column of the RCA export, by ticket id (true / false / null when blank). */
export function teamDefects(file = EXPORT_FILE): Map<string, boolean | null> {
  const m = new Map<string, boolean | null>();
  if (!existsSync(file)) return m;
  const wb = XLSX.read(readFileSync(file), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const key = (r: Record<string, unknown>, name: string) => Object.keys(r).find((k) => k.trim().toLowerCase() === name);
  for (const r of rows) {
    const id = String(r[key(r, "ticket id") ?? ""] ?? "").trim();
    const d = String(r[key(r, "is defect") ?? ""] ?? "").trim().toLowerCase();
    if (id) m.set(id, /^(yes|true|y|1)$/.test(d) ? true : /^(no|false|n|0)$/.test(d) ? false : null);
  }
  return m;
}

export const stageOf = (t: TicketRow): string => String((t as any).ticket?.pipelineStage ?? (t as any).pipelineStage ?? "");

/** Team-marked defects whose stage is not Closed. */
export function teamOpenDefects(rows: TicketRow[], gold: Map<string, boolean | null>): TicketRow[] {
  return rows.filter((t) => gold.get(String(t.ticketId)) === true && stageOf(t) !== "Closed");
}

/** The open-defect regression cases: team-marked defect, not Closed, sorted as a defect in the events scope. */
export function openDefectCases(rows: TicketRow[], gold: Map<string, boolean | null>): Map<string, TicketRow[]> {
  const byCase = new Map<string, TicketRow[]>();
  for (const t of teamOpenDefects(rows, gold)) {
    if (t.classification !== "defect" || !t.inEventsScope) continue;
    for (const id of t.linkedCaseIds ?? []) byCase.set(id, [...(byCase.get(id) ?? []), t]);
  }
  return byCase;
}
