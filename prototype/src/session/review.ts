/**
 * STEP 4 — THE USER APPROVES: edit, drop, add their own, freeze.
 *
 * The generated cases live in the sheet `gen-<session id>`. Here the user edits any cell, drops rows,
 * merges a sheet of their own (duplicates of the generated set or of the catalog are shown, not added
 * twice), and approves: the approved rows are frozen as a new, versioned sheet named after the feature
 * (`<slug>-v1`, then v2 when the PRD changes), with their own ids, ready for the sheet runner. The
 * generated sheet stays as the working copy; the frozen sheet is what runs and what the report names.
 */
import { addSheetCases, importSheetBuffer, listSheets, removeSheetCases, renameSheet, sheetCases, type SheetCase } from "../checks/sheetCases.js";
import { existingFor, sameTitle } from "../agents/deriveCases.js";
import { advance, updateSession, type Session } from "./store.js";
import type { Understanding } from "./understanding.js";

export interface ReviewState {
  sheet: string;
  cases: SheetCase[];
  /** each generated section with its basis and its cases (the Review screen groups the rows by caseIds), then the uploaded rows */
  sections: Array<{ kind: string; count: number; basis?: string; caseIds: string[] }>;
  frozen?: { sheetId: string; version: number; count: number; at: string };
}

const genSheet = (s: Session) => `gen-${s.id}`;
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "feature";
const prefixOf = (t: string) => (t.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter((w) => w.length > 2).map((w) => w[0]).join("").toUpperCase().slice(0, 3) || "GEN");

export function reviewState(s: Session): ReviewState {
  const cases = sheetCases(genSheet(s));
  const frozen = (s.review as any)?.sheetId ? { sheetId: String((s.review as any).sheetId), version: Number((s.review as any).version), count: Number((s.review as any).approved), at: String((s.review as any).at) } : undefined;
  // the generation's sections, kept to the rows still on the sheet (a dropped case leaves its section)
  const here = new Set(cases.map((c) => c.id));
  const gen = ((s.generation as any)?.sections ?? []) as Array<{ kind: string; basis?: string; caseIds?: string[] }>;
  const sections: ReviewState["sections"] = gen.map((g) => ({ kind: g.kind, basis: g.basis, caseIds: (g.caseIds ?? []).filter((id) => here.has(id)) })).filter((g) => g.caseIds.length).map((g) => ({ ...g, count: g.caseIds.length }));
  const placed = new Set(sections.flatMap((g) => g.caseIds));
  const loose = cases.filter((c) => !placed.has(c.id));
  if (loose.length) sections.push({ kind: "uploaded", basis: "From your sheet", count: loose.length, caseIds: loose.map((c) => c.id) });
  return { sheet: genSheet(s), cases, sections, ...(frozen ? { frozen } : {}) };
}

const EDITABLE = new Set(["title", "role", "portal", "preconditions", "configs", "testData", "steps", "expected", "priority", "testType", "module", "scenario", "why", "source"]);

/** Patch the cells of one generated case; steps may come as an array or as numbered lines. */
export function editCase(s: Session, id: string, patch: Record<string, unknown>): SheetCase | null {
  const sheet = genSheet(s);
  const c = sheetCases(sheet).find((x) => x.id.toUpperCase() === id.toUpperCase());
  if (!c) return null;
  const next: SheetCase = { ...c };
  for (const [k, v] of Object.entries(patch)) {
    if (!EDITABLE.has(k)) continue;
    if (k === "steps") (next as any).steps = Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean) : String(v ?? "").split(/\n/).map((x) => x.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean);
    else (next as any)[k] = String(v ?? "").trim();
  }
  const { sheet: _sheet, ...row } = next;
  addSheetCases([row], sheet);
  return next;
}

export function dropCases(s: Session, ids: string[]): number {
  const n = removeSheetCases(genSheet(s), ids);
  updateSession(s, (f) => { const prev = (f.review as any) ?? {}; f.review = { ...prev, dropped: Number(prev.dropped ?? 0) + n }; });
  return n;
}

/** Merge the user's own sheet: new cases join the generated set; duplicates are reported, not added. */
export function mergeSheet(s: Session, name: string, data: string): { added: SheetCase[]; duplicates: Array<{ id: string; title: string; matches: string }> } {
  const sheet = genSheet(s);
  const tmpId = `merge-${s.id}-${Date.now().toString(36)}`;
  const info = importSheetBuffer(name, Buffer.from(data, "base64"), tmpId);
  const incoming = sheetCases(info.id);
  const have = sheetCases(sheet);
  const added: SheetCase[] = [];
  const duplicates: Array<{ id: string; title: string; matches: string }> = [];
  let n = have.length;
  for (const c of incoming) {
    const twinHere = have.find((h) => sameTitle(h.title, c.title)) ?? added.find((h) => sameTitle(h.title, c.title));
    const twinCatalog = twinHere ? undefined : existingFor(c.title, 5).find((e) => sameTitle(e.title, c.title));
    if (twinHere || twinCatalog) { duplicates.push({ id: c.id, title: c.title, matches: twinHere ? `${twinHere.id} (generated here)` : `${twinCatalog!.id} (in the catalog)` }); continue; }
    n++;
    const row: SheetCase = { ...c, id: `GEN-${String(n).padStart(3, "0")}`, sheet, scenario: `uploaded — ${c.id}`, reference: `uploaded by the user from ${name} as ${c.id}`, why: c.why || "Written by the tester and uploaded at review.", source: c.source || `uploaded ${c.id}` };
    added.push(row);
  }
  if (added.length) addSheetCases(added.map(({ sheet: _sheet, ...r }) => r), sheet);
  removeSheetCases(info.id, incoming.map((c) => c.id));
  updateSession(s, (f) => { const prev = (f.review as any) ?? {}; f.review = { ...prev, merged: Number(prev.merged ?? 0) + added.length, duplicatesSeen: Number(prev.duplicatesSeen ?? 0) + duplicates.length }; });
  return { added, duplicates };
}

/** Freeze the approved rows (all remaining, or the ids given) as a versioned sheet named after the feature. */
export function approve(s: Session, ids?: string[]): { sheetId: string; name: string; version: number; count: number } {
  const card = s.understanding as unknown as Understanding | undefined;
  const title = card?.title ?? s.name;
  const base = slug(title);
  const version = listSheets().filter((x) => x.id.startsWith(`${base}-v`)).length + 1;
  const sheetId = `${base}-v${version}`;
  const want = ids?.length ? new Set(ids.map((x) => x.toUpperCase())) : null;
  const rows = sheetCases(genSheet(s)).filter((c) => !want || want.has(c.id.toUpperCase()));
  const pre = prefixOf(title);
  const frozen = rows.map((c, i) => { const { sheet: _sheet, ...r } = c; return { ...r, id: `${pre}-${String(i + 1).padStart(3, "0")}`, status: "Approved", reference: `${r.reference ?? ""}; approved in session ${s.id} as ${sheetId} (was ${c.id})`.replace(/^; /, "") }; });
  addSheetCases(frozen, sheetId);
  renameSheet(sheetId, `${title} — v${version} (${frozen.length} approved)`);
  updateSession(s, (f) => { const prev = (f.review as any) ?? {}; f.review = { ...prev, sheetId, version, approved: frozen.length, dropped: Number(prev.dropped ?? 0), merged: Number(prev.merged ?? 0), at: new Date().toISOString() }; });
  advance(s, "review");
  return { sheetId, name: `${title} — v${version}`, version, count: frozen.length };
}
