/**
 * READING A HUBSPOT TICKET EXPORT — JSON, CSV or XLSX, into RawTicket[].
 *
 *   JSON  an array of HubSpot ticket objects: either the API shape
 *         ({ id, properties: { subject, content, … } }) or flat properties.
 *         Optional extras: associated company / contact names (for stripping
 *         only) and a conversation thread (thread[] of { direction, text }).
 *   CSV / XLSX
 *         the CRM > Tickets > Export file. Columns are matched by header name,
 *         case-insensitively; any column may be missing. Exports carry no
 *         conversation thread.
 *
 * What this returns is customer data and lives in memory only — the ingest
 * strips it (strip.ts) before anything is stored or sent anywhere.
 */
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import * as XLSX from "xlsx";

import type { RawTicket, ThreadMessage } from "./types.js";

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();
const list = (v: unknown): string[] => {
  if (v === null || v === undefined || v === "") return [];
  if (Array.isArray(v)) return v.flatMap(list);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const name = o.name ?? o.label ?? [o.firstname ?? o.firstName, o.lastname ?? o.lastName].filter(Boolean).join(" ");
    return list(name);
  }
  return String(v)
    .split(/;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
};

/** HubSpot's API dates are ISO strings or epoch milliseconds; exports are "2026-09-14 10:22". */
export function isoDate(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (/^\d{12,14}$/.test(s)) return new Date(Number(s)).toISOString();
  const d = new Date(s.replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, "$1T$2"));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// ── JSON ────────────────────────────────────────────────────────────────────

function fromJsonObject(o: any): RawTicket | null {
  const p = o?.properties && typeof o.properties === "object" ? { ...o, ...o.properties } : o;
  const id = str(p.hs_object_id ?? o.id ?? p.id);
  if (!id) return null;
  const thread: ThreadMessage[] = (Array.isArray(o.thread) ? o.thread : Array.isArray(o.messages) ? o.messages : Array.isArray(o.conversation) ? o.conversation : [])
    .map((m: any) => ({ direction: str(m?.direction ?? m?.from ?? "inbound"), text: str(m?.text ?? m?.body ?? m?.content) }))
    .filter((m: ThreadMessage) => m.text);
  return {
    id,
    subject: str(p.subject),
    content: str(p.content),
    category: str(p.hs_ticket_category) || undefined,
    priority: str(p.hs_ticket_priority) || undefined,
    pipeline: str(p.hs_pipeline) || undefined,
    pipelineStage: str(p.hs_pipeline_stage) || undefined,
    createdAt: isoDate(p.createdate),
    closedAt: isoDate(p.closed_date),
    lastModifiedAt: isoDate(p.hs_lastmodifieddate),
    sourceType: str(p.source_type) || undefined,
    companyNames: [
      ...list(o.associatedCompanyName ?? o.associated_company_name ?? o.companyName ?? o.company),
      ...list(o.associatedCompanies ?? o.companies),
    ],
    contactNames: [
      ...list(o.associatedContactNames ?? o.associated_contact_names ?? o.contactNames),
      ...list(o.associatedContacts ?? o.contacts),
    ],
    ownerNames: list(o.ownerName ?? o.ticketOwner ?? o.owner),
    thread,
    inputKind: "json",
  };
}

// ── CSV / XLSX ──────────────────────────────────────────────────────────────

/** Header → field, by exact (lower-cased) name first, then by "contains". */
const COLUMNS: Array<{ field: keyof RawTicket | "company" | "contact" | "owner"; exact: string[]; contains?: string[] }> = [
  { field: "id", exact: ["ticket id", "record id", "hs_object_id", "id"] },
  { field: "subject", exact: ["ticket name", "subject", "name"] },
  { field: "content", exact: ["ticket description", "description", "content"] },
  { field: "pipeline", exact: ["pipeline"] },
  { field: "pipelineStage", exact: ["ticket status", "status", "pipeline stage"] },
  { field: "category", exact: ["category", "ticket category"] },
  { field: "priority", exact: ["priority"] },
  { field: "sourceType", exact: ["source", "source type"] },
  { field: "createdAt", exact: ["create date", "created date", "createdate"] },
  { field: "closedAt", exact: ["close date", "closed date"] },
  { field: "lastModifiedAt", exact: ["last activity date", "last modified date"] },
  { field: "company", exact: ["company", "company name"], contains: ["associated company", "primary company"] },
  { field: "contact", exact: ["contact", "contact name"], contains: ["associated contact"] },
  { field: "owner", exact: ["ticket owner", "owner"], contains: ["owner"] },
];

export function mapHeaders(headers: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const used = new Set<string>();
  for (const col of COLUMNS) {
    const hits = headers.filter((h) => !used.has(h) && col.exact.includes(h.trim().toLowerCase()));
    const more = col.contains ? headers.filter((h) => !used.has(h) && !hits.includes(h) && col.contains!.some((c) => h.toLowerCase().includes(c))) : [];
    const all = [...hits, ...more];
    if (!all.length) continue;
    // Single-value fields take the first matching column; name lists take all of them.
    const take = ["company", "contact", "owner"].includes(col.field) ? all : all.slice(0, 1);
    take.forEach((h) => used.add(h));
    out.set(col.field, take);
  }
  return out;
}

export function fromRows(rows: Array<Record<string, unknown>>, kind: "csv" | "xlsx"): { tickets: RawTicket[]; missingColumns: string[] } {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const map = mapHeaders(headers);
  const one = (r: Record<string, unknown>, f: string) => str((map.get(f) ?? []).map((h) => r[h]).find((v) => str(v)));
  const many = (r: Record<string, unknown>, f: string) => (map.get(f) ?? []).flatMap((h) => list(r[h]));
  const tickets: RawTicket[] = [];
  for (const r of rows) {
    const id = one(r, "id");
    if (!id) continue;
    tickets.push({
      id,
      subject: one(r, "subject"),
      content: one(r, "content"),
      category: one(r, "category") || undefined,
      priority: one(r, "priority") || undefined,
      pipeline: one(r, "pipeline") || undefined,
      pipelineStage: one(r, "pipelineStage") || undefined,
      createdAt: isoDate(one(r, "createdAt")),
      closedAt: isoDate(one(r, "closedAt")),
      lastModifiedAt: isoDate(one(r, "lastModifiedAt")),
      sourceType: one(r, "sourceType") || undefined,
      companyNames: many(r, "company"),
      contactNames: many(r, "contact"),
      ownerNames: many(r, "owner"),
      thread: [],
      inputKind: kind,
    });
  }
  const wanted = ["id", "subject", "content", "category", "createdAt", "company", "contact", "owner"];
  return { tickets, missingColumns: wanted.filter((w) => !map.has(w)) };
}

// ── any file ────────────────────────────────────────────────────────────────

export interface LoadResult {
  tickets: RawTicket[];
  kind: RawTicket["inputKind"];
  /** columns an export lacked (CSV/XLSX only) — reported, never fatal */
  missingColumns: string[];
}

export function loadTicketFile(path: string): LoadResult {
  const ext = extname(path).toLowerCase();
  if (ext === ".json") {
    const j = JSON.parse(readFileSync(path, "utf8"));
    const arr: any[] = Array.isArray(j) ? j : Array.isArray(j?.results) ? j.results : Array.isArray(j?.tickets) ? j.tickets : [];
    return { tickets: arr.map(fromJsonObject).filter((t): t is RawTicket => !!t), kind: "json", missingColumns: [] };
  }
  if (ext === ".csv" || ext === ".xlsx" || ext === ".xls") {
    // SheetJS reads both; for CSV it keeps every cell as text (raw), so ids and dates are not reinterpreted.
    const wb = ext === ".csv" ? XLSX.read(readFileSync(path, "utf8"), { type: "string", raw: true }) : XLSX.readFile(path, { cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
    const kind = ext === ".csv" ? "csv" : "xlsx";
    return { kind, ...fromRows(rows, kind) };
  }
  throw new Error(`Unsupported ticket file type "${ext}" — expected .json, .csv or .xlsx`);
}
