/**
 * DEFECTS as data — in from the bug workbook once, out to the workbook from
 * then on (scripts/export-bug-sheet.ts), so the workbook is a view of the
 * database instead of a hand-kept file.
 *
 * Column-for-column with docs/bugs/Procol_bugs_found_*.xlsx:
 *   Bugs               Bug # · Area · Bug · What goes wrong · How to see it · What should happen ·
 *                      What actually happens · Client(s) where found · Severity · Kind ·
 *                      How it was verified · Last confirmed · Test cases
 *   Needs confirmation # · Area · Behaviour · What we saw · Client(s) · What to confirm
 *   Data problems      # · Client(s) · Problem · Details · Suggested fix
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { REPO } from "./catalogSource.js";
import type { OrgContext, Queryable } from "./tenant.js";

export const BUG_HEADERS = ["Bug #", "Area", "Bug", "What goes wrong", "How to see it", "What should happen", "What actually happens",
  "Client(s) where found", "Severity", "Kind", "How it was verified", "Last confirmed", "Test cases"] as const;
export const QUESTION_HEADERS = ["#", "Area", "Behaviour", "What we saw", "Client(s)", "What to confirm"] as const;
export const DATA_HEADERS = ["#", "Client(s)", "Problem", "Details", "Suggested fix"] as const;

export interface DefectInput {
  ref: string;
  category: "bug" | "question" | "data-problem";
  title: string;
  area: string | null;
  description: string;
  howToSee: string | null;
  expected: string | null;
  actual: string | null;
  clients: string[];
  severity: string | null;
  kind: string | null;
  verification: string | null;
  toConfirm: string | null;
  suggestedFix: string | null;
  lastConfirmed: string | null; // ISO date
  cases: string[];
  position: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1 Oct 2026" → "2026-10-01"; null when it is not that shape. */
export function parseSheetDate(s: unknown): string | null {
  if (s instanceof Date && !isNaN(s.getTime())) return s.toISOString().slice(0, 10);
  const m = String(s ?? "").trim().match(/^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? "").trim()) ? String(s).trim() : null;
  const mi = MONTHS.indexOf(m[2]);
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** "2026-10-01" → "1 Oct 2026" (the workbook's own format). */
export function formatSheetDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export const splitClients = (s: unknown): string[] => String(s ?? "").split(";").map((x) => x.trim()).filter(Boolean);
export const splitCases = (s: unknown): string[] => String(s ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const text = (v: unknown): string | null => {
  const s = String(v ?? "");
  return s.trim() === "" ? null : s;
};

/** The newest docs/bugs/Procol_bugs_found_*.xlsx, or null. */
export function newestWorkbook(): string | null {
  const dir = join(REPO, "docs", "bugs");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^Procol_bugs_found_.*\.xlsx$/.test(f)).sort();
  return files.length ? join(dir, files[files.length - 1]) : null;
}

/** Every defect in a workbook, word for word. */
export function parseWorkbook(file: string): DefectInput[] {
  const wb = XLSX.read(readFileSync(file), { type: "buffer" });
  const rows = (name: string): Record<string, unknown>[] => (wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "", raw: false }) : []);
  const out: DefectInput[] = [];
  rows("Bugs")
    .filter((r) => /^BUG-\d+$/.test(String(r["Bug #"]).trim()))
    .forEach((r, i) =>
      out.push({
        ref: String(r["Bug #"]).trim(),
        category: "bug",
        title: String(r["Bug"]),
        area: text(r["Area"]),
        description: String(r["What goes wrong"] ?? ""),
        howToSee: text(r["How to see it"]),
        expected: text(r["What should happen"]),
        actual: text(r["What actually happens"]),
        clients: splitClients(r["Client(s) where found"]),
        severity: text(r["Severity"]),
        kind: text(r["Kind"]),
        verification: text(r["How it was verified"]),
        toConfirm: null,
        suggestedFix: null,
        lastConfirmed: parseSheetDate(r["Last confirmed"]),
        cases: splitCases(r["Test cases"]),
        position: i + 1,
      }),
    );
  rows("Needs confirmation")
    .filter((r) => /^Q-\d+$/.test(String(r["#"]).trim()))
    .forEach((r, i) =>
      out.push({
        ref: String(r["#"]).trim(),
        category: "question",
        title: String(r["Behaviour"]),
        area: text(r["Area"]),
        description: String(r["What we saw"] ?? ""),
        howToSee: null,
        expected: null,
        actual: null,
        clients: splitClients(r["Client(s)"]),
        severity: null,
        kind: null,
        verification: null,
        toConfirm: text(r["What to confirm"]),
        suggestedFix: null,
        lastConfirmed: null,
        cases: [],
        position: i + 1,
      }),
    );
  rows("Data problems")
    .filter((r) => /^D-\d+$/.test(String(r["#"]).trim()))
    .forEach((r, i) =>
      out.push({
        ref: String(r["#"]).trim(),
        category: "data-problem",
        title: String(r["Problem"]),
        area: null,
        description: String(r["Details"] ?? ""),
        howToSee: null,
        expected: null,
        actual: null,
        clients: splitClients(r["Client(s)"]),
        severity: null,
        kind: null,
        verification: null,
        toConfirm: null,
        suggestedFix: text(r["Suggested fix"]),
        lastConfirmed: null,
        cases: [],
        position: i + 1,
      }),
    );
  return out;
}

/** The status a defect starts with when it first comes in from the workbook. */
export const initialStatus = (d: Pick<DefectInput, "category">): "confirmed" | "needs-confirmation" => (d.category === "question" ? "needs-confirmation" : "confirmed");

/**
 * Upsert defects (by ref). Wording follows the workbook; STATUS is set only
 * when a defect is new — a status someone changed in the database is never
 * overwritten by a re-import. Clients and cases are replaced to match.
 */
export async function importDefects(c: Queryable, ctx: OrgContext, defects: DefectInput[], source: string): Promise<{ upserted: number; created: number; unknownClients: string[]; cases: number; unresolvedCases: string[] }> {
  const companies = await c.query(`SELECT id, name, procol_company_id FROM target_companies WHERE org_id = $1 AND environment_id = $2`, [ctx.orgId, ctx.environmentId]);
  const byName = new Map(companies.rows.map((x: any) => [String(x.name).toLowerCase(), Number(x.id)]));
  const unknownClients = new Set<string>();
  const unresolved = new Set<string>();
  let created = 0;
  let cases = 0;
  for (const d of defects) {
    const r = await c.query(
      `INSERT INTO defects (org_id, ref, category, status, title, area, description, how_to_see, expected_behaviour, actual_behaviour,
                            severity, kind, verification, to_confirm, suggested_fix, last_confirmed_on, sheet_position, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (org_id, ref) DO UPDATE SET
         category = EXCLUDED.category, title = EXCLUDED.title, area = EXCLUDED.area, description = EXCLUDED.description,
         how_to_see = EXCLUDED.how_to_see, expected_behaviour = EXCLUDED.expected_behaviour, actual_behaviour = EXCLUDED.actual_behaviour,
         severity = EXCLUDED.severity, kind = EXCLUDED.kind, verification = EXCLUDED.verification, to_confirm = EXCLUDED.to_confirm,
         suggested_fix = EXCLUDED.suggested_fix, last_confirmed_on = EXCLUDED.last_confirmed_on, sheet_position = EXCLUDED.sheet_position,
         source = EXCLUDED.source
       RETURNING id, (xmax = 0) AS inserted`,
      [ctx.orgId, d.ref, d.category, initialStatus(d), d.title, d.area, d.description, d.howToSee, d.expected, d.actual,
        d.severity, d.kind, d.verification, d.toConfirm, d.suggestedFix, d.lastConfirmed, d.position, source],
    );
    const defectId = Number(r.rows[0].id);
    if (r.rows[0].inserted) created++;

    await c.query(`DELETE FROM defect_companies WHERE defect_id = $1`, [defectId]);
    let pos = 0;
    for (const name of d.clients) {
      const cid = byName.get(name.toLowerCase());
      if (!cid) {
        unknownClients.add(name);
        continue;
      }
      await c.query(`INSERT INTO defect_companies (org_id, defect_id, company_id, position) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [ctx.orgId, defectId, cid, ++pos]);
    }

    await c.query(`DELETE FROM defect_cases WHERE defect_id = $1`, [defectId]);
    let cpos = 0;
    for (const key of d.cases) {
      const tc = await c.query(`SELECT id FROM test_cases WHERE org_id = $1 AND case_key = $2`, [ctx.orgId, key]);
      if (!tc.rows[0]) unresolved.add(key);
      await c.query(
        `INSERT INTO defect_cases (org_id, defect_id, case_key, case_id, position) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [ctx.orgId, defectId, key, tc.rows[0]?.id ?? null, ++cpos],
      );
      cases++;
    }
  }
  return { upserted: defects.length, created, unknownClients: [...unknownClients], cases, unresolvedCases: [...unresolved] };
}

// ── out: the workbook's rows, from the database ────────────────────────────

export interface SheetRows {
  bugs: string[][];
  questions: string[][];
  data: string[][];
  /** for the Summary sheet */
  kinds: string[];
  clients: string[];
  confirmedRange: { first: string | null; last: string | null };
}

/**
 * The rows the bug sheet shows. Bugs = verified bugs still open or confirmed
 * (fixed and won't-fix ones leave the sheet); questions = still awaiting
 * confirmation; data problems = not fixed.
 */
export async function sheetRows(c: Queryable, ctx: OrgContext): Promise<SheetRows> {
  const r = await c.query(
    `SELECT d.*, coalesce((SELECT string_agg(t.name, '; ' ORDER BY dc.position) FROM defect_companies dc
                           JOIN target_companies t ON t.org_id = dc.org_id AND t.id = dc.company_id WHERE dc.defect_id = d.id), '') AS clients,
            coalesce((SELECT string_agg(x.case_key, ', ' ORDER BY x.position) FROM defect_cases x WHERE x.defect_id = d.id), '') AS cases
       FROM defects d
      WHERE d.org_id = $1
      ORDER BY d.category, d.sheet_position, d.ref`,
    [ctx.orgId],
  );
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const day = (v: unknown) => (v instanceof Date ? formatSheetDate(`${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`) : formatSheetDate(s(v)));
  const bugs = r.rows.filter((d: any) => d.category === "bug" && (d.status === "confirmed" || d.status === "open"));
  const questions = r.rows.filter((d: any) => d.category === "question" && d.status === "needs-confirmation");
  const data = r.rows.filter((d: any) => d.category === "data-problem" && d.status !== "fixed" && d.status !== "wont-fix");
  const clientOrder: string[] = [];
  for (const b of bugs) for (const cl of splitClients(b.clients)) if (!clientOrder.includes(cl)) clientOrder.push(cl);
  const confirmed = bugs.map((b: any) => b.last_confirmed_on).filter(Boolean).map((d: any) => (d instanceof Date ? d.getTime() : Date.parse(d))).sort((a: number, b: number) => a - b);
  const asDay = (t: number | undefined) => (t === undefined ? null : new Date(t));
  return {
    bugs: bugs.map((d: any) => [d.ref, s(d.area), s(d.title), s(d.description), s(d.how_to_see), s(d.expected_behaviour), s(d.actual_behaviour), s(d.clients), s(d.severity), s(d.kind), s(d.verification), day(d.last_confirmed_on), s(d.cases)]),
    questions: questions.map((d: any) => [d.ref, s(d.area), s(d.title), s(d.description), s(d.clients), s(d.to_confirm)]),
    data: data.map((d: any) => [d.ref, s(d.clients), s(d.title), s(d.description), s(d.suggested_fix)]),
    kinds: [...new Set(bugs.map((b: any) => String(b.kind)))].sort() as string[],
    clients: clientOrder,
    confirmedRange: {
      first: confirmed.length ? day(asDay(confirmed[0])) : null,
      last: confirmed.length ? day(asDay(confirmed[confirmed.length - 1])) : null,
    },
  };
}
