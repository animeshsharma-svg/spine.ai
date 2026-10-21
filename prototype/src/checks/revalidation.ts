/**
 * VENDOR REVALIDATION — the runner behind the "Vendor revalidation" column.
 *
 * The engine (procol-backend rfx-uat-main, app/workers/vendor_revalidation/*,
 * app/services/vendor_revalidation/*) re-checks every vendor's GST / PAN /
 * MSME / bank on a schedule and writes one final status per client–vendor
 * link. QA drives it through five endpoints under
 * /api/vendor_revalidation_qa (config GET/PUT, trigger POST/DELETE, run
 * status GET) that exist ONLY on the rfx-uat-api host — the platform's usual
 * host answers 404 for them. The database is the same, so the platform's DB
 * sessions work there.
 *
 * A case is one of five kinds (RevalSpec.tier):
 *
 *   read     a GET to the QA API (or no/garbage token): no state changes.
 *   audit    SELECTs on the runs already in the database: no requests at all.
 *   listing  the buyer's own listing / vendor page / Excel, read with the
 *            client's session, compared with the database.
 *   config   PUTs a config or sends a trigger the API must refuse. Needs a
 *            Procol employee token (VR_QA_TOKEN); the config is saved first
 *            and put back after, whatever happens.
 *   run      a real run on 1–5 named vendors: trigger, wait, then check the
 *            API, the rows, the final status and the listing. Same guard,
 *            plus: vendors whose shown status the case changed are re-run
 *            with the original config, so the client's screen is left as it was.
 *
 * Cases tagged dev / manual / ui / code are reported as not run with the reason.
 *
 * SAFETY — written down because each line is a way this could hurt UAT:
 *   • `vendor_ids: []` is never sent: the API reads a blank list as "every
 *     vendor of the client" (qa controller parse_vendor_scope). Neither is a
 *     trigger with no scope at all, nor more than 5 vendors.
 *   • Writes go only to clients in VR_WRITE_CLIENTS (default 47053, the
 *     client the guide names) and only with the employee token. The client
 *     super-admin session can ALSO write today (defect REV-01); it is used for
 *     GETs only, never for a write.
 *   • The config is backed up to data/reval-backup/<client>.json before the
 *     first write and restored after; a backup left by a crash is restored
 *     before anything else runs. A lock file stops two runs overlapping.
 *   • Mechanics cases (dates, scope, cancel, run id) use a "silent" config
 *     whose only document reads a column that does not exist, so every row is
 *     `skipped` and no provider is called.
 *   • The token is never written anywhere: requests are logged without headers.
 *
 * Database access is SELECT only, like everywhere else in the platform.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Check, CheckOutcome, Client } from "./engine.js";

const here = dirname(fileURLToPath(import.meta.url));
const PROCOL_TEST = join(here, "..", "..", "..", "procol test");
const DATA = join(here, "..", "..", "data");
export const REVAL_EVIDENCE_DIR = join(DATA, "evidence");
const BACKUP_DIR = join(DATA, "reval-backup");
const VENDORS_FILE = join(here, "..", "..", "config", "revalidationVendors.json");
const BUGS_FILE = join(here, "..", "..", "config", "revalBugs.json");

// ── environment ─────────────────────────────────────────────────────────
export const QA_HOST = (process.env.VR_API_BASE ?? "https://rfx-uat-api.ag-ri.in").replace(/\/+$/, "").replace(/\/api$/, "");
/**
 * Since 20 Oct 2026 (procol-backend 0f365a7e52 "revamp apis", a717f107ce) the
 * private QA controls are gone. A buyer who may edit vendors starts a run for
 * their OWN company (workspace_id), and reads its progress; the settings are
 * set by Procol ops only and there is no cancel.
 */
const QA = "/api/vendor_validation";
/** what changed on 20 Oct, for the reasons cases give */
export const REVAMP = "the 20 Oct 2026 rewrite (procol-backend 0f365a7e52 / a717f107ce)";
const employeeToken = () => process.env.VR_QA_TOKEN?.trim() || undefined;
const writeClients = () => new Set((process.env.VR_WRITE_CLIENTS ?? "47053").split(",").map((s) => Number(s.trim())).filter(Boolean));
const MAX_VENDORS = 5;
const POLL_MS = 15_000;

export const ALL_STATUSES = ["active", "invited", "onboarding_in_progress", "in_review", "in_approval", "rejected", "blacklisted", "in_active"] as const;
const BSCM_STATUS: Record<string, number> = { in_active: 0, active: 1, invited: 2, onboarding_in_progress: 3, in_review: 4, rejected: 5, in_approval: 6, blacklisted: 7 };
const DOC = ["pan", "gst", "msme", "vat", "bank", "cin", "fssai", "tan"] as const;
const ROW_STATUS = ["pending", "passed", "failed", "skipped", "system_error"] as const;
const FINAL = { 1: "passed", 2: "failed", 3: "skipped", 4: "system_error" } as Record<number, string>;
const LABEL: Record<string, string> = { passed: "Passed", failed: "Failed", skipped: "Skipped", system_error: "System Error", pending: "Pending" };
const PRECEDENCE = ["failed", "system_error", "passed", "skipped"];
const NOT_PROVIDED = "not provided";
const SYSTEM_ERROR = "verification is temporarily unavailable";
/** a column no company has: every row reading it is `skipped`, so no provider is called */
const NO_SUCH_COLUMN = "company.qa_platform_no_such_column";
/** the build that made last_validated_at the run's start (d18f8ac4c9, 15 Oct 2026 16:58 IST) */
const LAST_VALIDATED_FIX = Date.parse("2026-10-15T11:28:09Z");

// ── the case shape (generated from procol test/scripts/revalidation/spec.ts) ──
export interface RevalSpec {
  /** guide id, e.g. "B-13" — scenarios are keyed by it */
  key: string;
  tier: "read" | "audit" | "listing" | "config" | "run" | "dev" | "manual" | "ui" | "code" | "ops" | "removed";
  /** test vendors the case needs (V-PASS …), for the report */
  needs?: string[];
  /** why a dev / manual / ui / code case is not run */
  why?: string;
}

// ── small helpers ───────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);
let poolMod: any;
async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  poolMod ??= await imp("db/pool.ts");
  return poolMod.query(sql, params);
}

/** today in IST as YYYY-MM-DD (the engine's Date.current) */
export function todayIST(now = Date.now()): string {
  return new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
}
export function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
/** Ruby's Date#>> : same day n months on, clamped to the month's last day */
export function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = idx - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
/** an IST wall-clock time with offset, `ms` from now */
export function istIso(msFromNow: number): string {
  const t = new Date(Date.now() + msFromNow + 5.5 * 3600_000);
  return t.toISOString().replace(/\.\d{3}Z$/, "+05:30");
}
/** Digest::UUID.uuid_v5(URL_NAMESPACE, name) — the engine's run id */
export function uuidV5(name: string, ns = "6ba7b811-9dad-11d1-80b4-00c04fd430c8"): string {
  const nsBytes = Buffer.from(ns.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([nsBytes, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
export const runIdFor = (client: number, date: string) => uuidV5(`procol://vendor_revalidation/${client}/${date}`);
const short = (v: unknown, n = 1500) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n)}…` : s;
};
const sameJson = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
/** the vendor's final status from its rows, the way finalize does it */
export function precedence(statuses: string[]): string {
  return PRECEDENCE.find((s) => statuses.includes(s)) ?? "skipped";
}
export const errorLine = (r: Row) => `${[r.doc.toUpperCase(), r.value].filter((x) => x != null).join(" ")}: ${r.error}`;

class NotRunnable extends Error {}

// ── bugs this suite has found (config/revalBugs.json) ──────────────────
interface RevalBug { id: string; title: string; severity: string; status: string; found: string; cases: string[] }
let bugs: { mtime: number; list: RevalBug[] } | undefined;
export function revalBugs(): RevalBug[] {
  try {
    const mtime = statSync(BUGS_FILE).mtimeMs;
    if (!bugs || bugs.mtime !== mtime) bugs = { mtime, list: JSON.parse(readFileSync(BUGS_FILE, "utf8")).bugs };
  } catch {
    bugs = { mtime: 0, list: [] };
  }
  return bugs!.list;
}
export const revalBugForCase = (key: string) => revalBugs().find((b) => b.cases.includes(key));

// ── rows ────────────────────────────────────────────────────────────────
export interface Row {
  id: number; vendor: number; doc: string; value: string | null; valueIndex: number; status: string;
  error: string | null; runId: string; runDate: string; createdAt: string; lastRunAt: string | null; updatedAt: string;
}
/** timestamps are stored as UTC without a zone; the driver would read them as local time */
const TS = (c: string) => `to_char(${c}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const ROW_SQL = `SELECT id, vendor_company_id, doc_type, value, value_index, status, error_message, run_id::text AS run_id,
  to_char(run_scheduled_on, 'YYYY-MM-DD') AS run_date, ${TS("created_at")} AS created_at, ${TS("last_run_at")} AS last_run_at,
  ${TS("updated_at")} AS updated_at FROM vendor_validation_histories`;
const toRow = (r: any): Row => ({
  id: Number(r.id), vendor: r.vendor_company_id, doc: DOC[r.doc_type], value: r.value, valueIndex: r.value_index,
  status: ROW_STATUS[r.status], error: r.error_message, runId: r.run_id, runDate: r.run_date,
  createdAt: r.created_at, lastRunAt: r.last_run_at ?? null, updatedAt: r.updated_at,
});
export async function rowsOf(client: number, opts: { runId?: string; vendors?: number[] } = {}): Promise<Row[]> {
  const where = ["client_company_id = $1"];
  const p: unknown[] = [client];
  if (opts.runId) (p.push(opts.runId), where.push(`run_id = $${p.length}::uuid`));
  if (opts.vendors) (p.push(opts.vendors), where.push(`vendor_company_id = ANY($${p.length}::int[])`));
  return (await q(`${ROW_SQL} WHERE ${where.join(" AND ")} ORDER BY vendor_company_id, doc_type, value_index, id`, p)).map(toRow);
}
export interface Final { status: string | null; runId: string | null; lastValidatedAt: string | null; linkStatus: number }
export async function finalsOf(client: number, vendors: number[]): Promise<Map<number, Final>> {
  const rows = await q(
    `SELECT dealing_with_company_id v, vendor_validation_status s, vendor_validation_run_id::text r, ${TS("vendor_last_validated_at")} t, status
       FROM buyer_seller_company_mappings WHERE client_company_id = $1 AND dealing_with_company_id = ANY($2::int[])`,
    [client, vendors],
  );
  return new Map(rows.map((r: any) => [r.v, { status: r.s == null ? null : FINAL[r.s], runId: r.r, lastValidatedAt: r.t ?? null, linkStatus: r.status }]));
}
/**
 * VendorValidationHistory.latest_rows: for each vendor and configured doc type,
 * the finished rows of the newest run date that is not after the date of the
 * run named on the vendor's link.
 */
export async function latestRows(client: number, vendors: number[], docs: string[]): Promise<Row[]> {
  if (!vendors.length || !docs.length) return [];
  const rows = await q(
    `SELECT h.* FROM (
       SELECT h.id, h.vendor_company_id, h.doc_type, h.value, h.value_index, h.status, h.error_message, h.run_id::text AS run_id,
              to_char(h.run_scheduled_on, 'YYYY-MM-DD') AS run_date, ${TS("h.created_at")} AS created_at, ${TS("h.last_run_at")} AS last_run_at,
              ${TS("h.updated_at")} AS updated_at,
              RANK() OVER (PARTITION BY h.vendor_company_id, h.doc_type ORDER BY h.run_scheduled_on DESC) AS rk
         FROM vendor_validation_histories h
         JOIN buyer_seller_company_mappings b ON b.client_company_id = h.client_company_id AND b.dealing_with_company_id = h.vendor_company_id
        WHERE h.client_company_id = $1 AND h.vendor_company_id = ANY($2::int[]) AND h.doc_type = ANY($3::int[]) AND h.status <> 0
          AND h.run_scheduled_on <= (SELECT r.run_scheduled_on FROM vendor_validation_histories r WHERE r.run_id = b.vendor_validation_run_id LIMIT 1)
     ) h WHERE rk = 1 ORDER BY vendor_company_id, doc_type, value_index, id`,
    [client, vendors, docs.map((d) => DOC.indexOf(d as any))],
  );
  return rows.map(toRow);
}

// ── who the test vendors are ───────────────────────────────────────────
/**
 * The guide names prepared vendors (V-PASS, V-BADGST …). An id recorded in
 * config/revalidationVendors.json wins; otherwise the vendor is found from the
 * client's last finished run, among links the engine would pick (source
 * referral/procol, active company). Vendors whose shown status is already
 * Skipped or blank are preferred, so a run changes nothing a buyer sees.
 */
const ELIGIBLE = `b.client_company_id = $1 AND b.source IN (0, 1) AND c.status = 1`;
const ROLE_SQL: Record<string, { sql: string; why: string }> = {
  "V-PASS": { why: "every check passed in the last run", sql: `
    SELECT v FROM lastrun GROUP BY v HAVING bool_and(s = 1) AND count(DISTINCT d) >= 3 ORDER BY count(DISTINCT d) DESC, v LIMIT 1` },
  "V-BADGST": { why: "GST failed in the last run (GST input is incorrect / Provided GSTIN is invalid)", sql: `
    SELECT v FROM lastrun GROUP BY v HAVING bool_or(d = 1 AND s = 2 AND e IN ('GST input is incorrect', 'Provided GSTIN is invalid'))
    ORDER BY count(*) FILTER (WHERE s = 2) , v LIMIT 1` },
  "V-BADPAN": { why: "PAN failed in an earlier run and not checked today", sql: `
    SELECT v FROM lastrun GROUP BY v HAVING bool_or(d = 0 AND s = 2) AND NOT bool_or(dt = $2::date) ORDER BY bool_or(d = 1 AND s = 2), v LIMIT 1` },
  "V-BANKFAIL": { why: "bank failed in the last run (preferably the only failure)", sql: `
    SELECT v FROM lastrun GROUP BY v HAVING bool_or(d = 4 AND s = 2) ORDER BY bool_or(d <> 4 AND s IN (2, 4)), v LIMIT 1` },
  "V-PASS-SKIP": { why: "some checks passed, the rest were not provided", sql: `
    SELECT v FROM lastrun GROUP BY v HAVING bool_or(s = 1) AND bool_or(s = 3) AND NOT bool_or(s IN (2, 4)) ORDER BY v LIMIT 1` },
  "V-MULTIFAIL": { why: "two or more failed / system-error checks", sql: `
    SELECT v FROM lastrun GROUP BY v HAVING count(*) FILTER (WHERE s IN (2, 4)) >= 2 ORDER BY v LIMIT 1` },
  "V-2GST": { why: "two GST values in the last run", sql: `
    SELECT v FROM lastrun WHERE d = 1 AND vi >= 1 ORDER BY v LIMIT 1` },
  "V-2GST-MIXED": { why: "two GST values, one passed and one failed", sql: `
    SELECT v FROM lastrun GROUP BY v HAVING bool_or(d = 1 AND vi >= 1) AND bool_or(d = 1 AND s = 1) AND bool_or(d = 1 AND s = 2) ORDER BY v LIMIT 1` },
};
for (const [n, k] of [["V-NODOCS", 0], ["V-NODOCS2", 1], ["V-NODOCS3", 2], ["V-NODOCS4", 3], ["V-NODOCS5", 4]] as const)
  ROLE_SQL[n] = { why: "nothing provided for any document in the last run (shown as Skipped)", sql: `
    SELECT v FROM lastrun GROUP BY v HAVING bool_and(s = 3) AND count(DISTINCT d) >= 4 ORDER BY v OFFSET ${k} LIMIT 1` };

/** roles found from the company record rather than from a run */
const COMPANY_ROLE_SQL: Record<string, { sql: string; why: string }> = {
  "V-COMPANYGST": { why: "a valid-looking GSTIN in companies.gst_no and a PAN in companies.pan_no", sql: `
    SELECT c.id v FROM buyer_seller_company_mappings b JOIN companies c ON c.id = b.dealing_with_company_id
     WHERE ${ELIGIBLE} AND c.gst_no ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][0-9A-Z][0-9A-Z]$' AND coalesce(c.pan_no, '') <> ''
     ORDER BY (b.vendor_validation_status IS NULL OR b.vendor_validation_status = 3) DESC, c.id LIMIT 1` },
  "V-COMPANYPAN": { why: "a PAN in companies.pan_no", sql: `
    SELECT c.id v FROM buyer_seller_company_mappings b JOIN companies c ON c.id = b.dealing_with_company_id
     WHERE ${ELIGIBLE} AND c.pan_no ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
     ORDER BY (b.vendor_validation_status IS NULL OR b.vendor_validation_status = 3) DESC, c.id LIMIT 1` },
  "V-FOREIGN": { why: "a foreign tax number (two letters first) in companies.gst_no", sql: `
    SELECT c.id v FROM buyer_seller_company_mappings b JOIN companies c ON c.id = b.dealing_with_company_id
     WHERE ${ELIGIBLE} AND c.gst_no ~ '^[A-Z]{2}[0-9]' ORDER BY c.id LIMIT 1` },
  "V-MISC": { why: "a PAN only in the company's extra data (misc.pan) — a bulk-uploaded vendor", sql: `
    SELECT c.id v FROM buyer_seller_company_mappings b JOIN companies c ON c.id = b.dealing_with_company_id
     WHERE ${ELIGIBLE} AND coalesce(c.misc #>> '{pan}', '') ~ '^[A-Z]{5}[0-9]{4}[A-Z]$' ORDER BY c.id LIMIT 1` },
  "V-BANKHALF": { why: "a bank account in misc.bank_account_number but no misc.bank_ifsc_code", sql: `
    SELECT c.id v FROM buyer_seller_company_mappings b JOIN companies c ON c.id = b.dealing_with_company_id
     WHERE ${ELIGIBLE} AND coalesce(c.misc #>> '{bank_account_number}', '') <> '' AND coalesce(c.misc #>> '{bank_ifsc_code}', '') = ''
     ORDER BY c.id LIMIT 1` },
  "V-SPACES": { why: "a GST number stored with spaces around it", sql: `
    SELECT c.id v FROM buyer_seller_company_mappings b JOIN companies c ON c.id = b.dealing_with_company_id
     WHERE ${ELIGIBLE} AND c.gst_no ~ '^\\s+\\S|\\S\\s+$' ORDER BY c.id LIMIT 1` },
  "V-NOTCLIENT": { why: "an active vendor linked to another client and not to this one", sql: `
    SELECT c.id v FROM buyer_seller_company_mappings b JOIN companies c ON c.id = b.dealing_with_company_id
     WHERE b.client_company_id <> $1 AND c.status = 1 AND c.category = 1
       AND NOT EXISTS (SELECT 1 FROM buyer_seller_company_mappings x WHERE x.client_company_id = $1 AND x.dealing_with_company_id = c.id)
     ORDER BY c.id LIMIT 1` },
  "V-INACTIVE": { why: "linked to this client in a configured status, but the vendor's company is inactive", sql: `
    SELECT c.id v FROM buyer_seller_company_mappings b JOIN companies c ON c.id = b.dealing_with_company_id
     WHERE b.client_company_id = $1 AND b.status IN (1, 2) AND c.status <> 1 ORDER BY c.id LIMIT 1` },
  "V-NEVER": { why: "a linked vendor that no run has finished (no final status)", sql: `
    SELECT c.id v FROM buyer_seller_company_mappings b JOIN companies c ON c.id = b.dealing_with_company_id
     WHERE ${ELIGIBLE} AND c.category = 1 AND b.status <> 0 AND b.vendor_validation_status IS NULL ORDER BY b.status = 1 DESC, c.id LIMIT 1` },
};
for (const s of ALL_STATUSES)
  COMPANY_ROLE_SQL[`V-STATUS-${s}`] = { why: `linked with status ${s}, shown status Skipped or blank`, sql: `
    SELECT c.id v FROM buyer_seller_company_mappings b JOIN companies c ON c.id = b.dealing_with_company_id
     WHERE ${ELIGIBLE} AND b.status = ${BSCM_STATUS[s]} ORDER BY (b.vendor_validation_status IS NULL OR b.vendor_validation_status = 3) DESC, c.id LIMIT 1` };

export async function findRole(client: number, role: string, statuses?: string[]): Promise<{ id: number; how: string } | null> {
  // only links in these statuses (the ones the client's settings check); ids come from our own map, never from input
  const only = statuses?.length ? ` AND b.status = ANY(ARRAY[${statuses.map((st) => BSCM_STATUS[st]).filter((n) => n != null).join(",") || "-1"}]::int[])` : "";
  const narrow = (sql: string) => (only ? sql.split(ELIGIBLE).join(`${ELIGIBLE}${only}`) : sql);
  try {
    const pinned = JSON.parse(readFileSync(VENDORS_FILE, "utf8"))?.[String(client)]?.[role];
    if (typeof pinned === "number") return { id: pinned, how: `recorded in config/revalidationVendors.json` };
  } catch {
    /* no file: discover */
  }
  const c = COMPANY_ROLE_SQL[role];
  if (c) {
    const r = await q(narrow(c.sql), [client]);
    return r[0] ? { id: r[0].v, how: `found: ${c.why}` } : null;
  }
  const s = ROLE_SQL[role];
  if (!s) return null;
  // "lastrun" = each eligible vendor's rows from its newest finished run date.
  const sql = `WITH runs AS (
      SELECT h.vendor_company_id v, h.doc_type d, h.status s, h.error_message e, h.value_index vi, h.run_scheduled_on dt,
             RANK() OVER (PARTITION BY h.vendor_company_id ORDER BY h.run_scheduled_on DESC) rk
        FROM vendor_validation_histories h
        JOIN buyer_seller_company_mappings b ON b.client_company_id = h.client_company_id AND b.dealing_with_company_id = h.vendor_company_id
        JOIN companies c ON c.id = h.vendor_company_id
       WHERE h.client_company_id = $1 AND h.status <> 0 AND ${ELIGIBLE} AND c.category = 1),
    lastrun AS (SELECT * FROM runs WHERE rk = 1 AND $2::date IS NOT NULL)
    ${s.sql}`;
  const r = await q(narrow(sql), [client, todayIST()]);
  return r[0] ? { id: r[0].v, how: `found: ${s.why}` } : null;
}

// ── the QA API ──────────────────────────────────────────────────────────
type As = "session" | "employee" | "none" | "garbage";
interface Reply { status: number; data: any; code?: number; message?: string; ms: number }
interface Call { as: As; method: string; path: string; body?: unknown; status: number; reply: string; ms: number; at: string }

function headersFor(client: Client, as: As, appVersion?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "procol-qa-platform/revalidation" };
  if (as === "employee") {
    const t = employeeToken();
    if (!t) throw new NotRunnable("needs the client's buyer access-token (a login allowed to edit vendors) in prototype/.env as VR_QA_TOKEN");
    h["access-token"] = t;
  } else if (as === "session") {
    const api: any = client.ctx.buyerApi;
    h["access-token"] = api.authTokens.accessToken;
    h["lightspeed-token"] = api.authTokens.lightspeedToken;
    h["app-version"] = appVersion ?? api.appVersion ?? "1.0.0";
  } else if (as === "garbage") {
    h["access-token"] = `qa-not-a-token-${randomUUID()}`;
  }
  return h;
}

export interface RevalEvidence {
  schema: "reval.evidence.v1";
  id: string; caseId: string; key: string; runStamp: string; companyId: number; recordedAt: string;
  roles: Record<string, { id: number; how: string }>;
  calls: Call[];
  notes: string[];
  restore?: string;
  verdict?: { pass: boolean; inconclusive?: boolean; text: string };
  bug?: string;
}

// ── the harness every scenario gets ─────────────────────────────────────
export class H {
  readonly clientId: number;
  readonly today = todayIST();
  ev: RevalEvidence;
  original: any = undefined;
  /** vendor_statuses of the config in force now (for vendor_limit triggers) */
  private currentStatuses: string[] = [];
  /** document types the client's own nightly run still has to check today */
  private nightlyDue: string[] = [];
  private configChanged = false;
  private currentDocs: string[] = [];
  private jobs = new Set<string>();
  /** vendors a run touched, with what a buyer saw before */
  private touched = new Map<number, string | null>();
  private checks: Array<[boolean, string]> = [];

  constructor(readonly client: Client, readonly key: string, caseId: string, stamp: string) {
    this.clientId = client.ctx.companyId;
    this.ev = { schema: "reval.evidence.v1", id: `${stamp}/${key}`, caseId, key, runStamp: stamp, companyId: this.clientId, recordedAt: new Date().toISOString(), roles: {}, calls: [], notes: [] };
  }

  note(s: string) {
    this.ev.notes.push(s);
  }
  /** record one assertion; the verdict lists every failed one */
  expect(ok: boolean, what: string) {
    this.checks.push([!!ok, what]);
    return ok;
  }
  verdict(summary = ""): { pass: boolean; verdict: string } {
    const bad = this.checks.filter(([ok]) => !ok).map(([, w]) => w);
    const good = this.checks.filter(([ok]) => ok).length;
    if (!this.checks.length) return { pass: false, verdict: "nothing was asserted — a case that checks nothing proves nothing" };
    return bad.length
      ? { pass: false, verdict: `${bad.join(" · ")}${summary ? ` [${summary}]` : ""}` }
      : { pass: true, verdict: `${summary ? `${summary} — ` : ""}confirmed: ${this.checks.map(([, w]) => w).join(" · ")}` };
  }

  async call(as: As, method: string, path: string, body?: unknown, opts: { host?: string; appVersion?: string } = {}): Promise<Reply> {
    const t0 = Date.now();
    const res = await fetch(`${opts.host ?? QA_HOST}${path}`, {
      method,
      headers: headersFor(this.client, as, opts.appVersion),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(90_000),
    });
    const text = await res.text();
    let data: any = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    const r: Reply = { status: res.status, data, ms: Date.now() - t0, code: data?.error?.code, message: data?.error?.message };
    this.ev.calls.push({ as, method, path, body, status: r.status, reply: short(data), ms: r.ms, at: new Date(t0).toISOString() });
    return r;
  }
  qa(as: As, method: string, path: string, body?: unknown, workspace = this.clientId) {
    return this.call(as, method, `${QA}${path}${path.includes("?") ? "&" : "?"}workspace_id=${workspace}`, body);
  }

  async role(name: string): Promise<number> {
    if (this.ev.roles[name]) return this.ev.roles[name].id;
    // Vendors a run is started for must be in a link status the client's
    // settings check; the refusal and listing roles are taken as they are.
    const anyStatus = /^V-(NOTCLIENT|INACTIVE|STATUS-|NEVER)/.test(name);
    const cfg = anyStatus ? null : await this.settings();
    const r = await findRole(this.clientId, name, cfg ? cfg.config?.vendor_statuses ?? [] : undefined);
    if (!r) throw new NotRunnable(`test vendor ${name} not found for client ${this.clientId} — record its id in config/revalidationVendors.json`);
    this.ev.roles[name] = r;
    return r.id;
  }
  async roles(...names: string[]): Promise<number[]> {
    const ids: number[] = [];
    for (const n of names) ids.push(await this.role(n));
    return ids;
  }

  // ── settings (read from the database: the API to read or change them was removed) ──
  private cfgCache: any;
  async settings(): Promise<{ config: any; enabled: boolean }> {
    if (this.cfgCache) return this.cfgCache;
    const r = await q(
      `SELECT modifications->'value' v FROM custom_configurations WHERE config_key = 'vendor_revalidation_config' AND item_type = 'Company' AND item_id = $1 AND status = 1 ORDER BY id DESC LIMIT 1`,
      [this.clientId],
    );
    const config = r[0]?.v ?? {};
    this.cfgCache = { config, enabled: config.enabled === true };
    return this.cfgCache;
  }
  async getConfig(): Promise<any> {
    this.cfgCache = undefined;
    return this.settings();
  }
  /**
   * Save the client's settings through the general configuration endpoint
   * (custom_configuration/update_or_create). Only a Procol employee may save
   * this key (it is staff-only in master_configurations), so VR_QA_TOKEN has
   * to be a staff token. NOTHING validates the value any more (REV-17): the
   * caller must send a complete, correct config. Read back from the database.
   */
  async putConfig(config: any): Promise<Reply> {
    this.assertWritable();
    this.configChanged = true;
    const r = await this.call("employee", "POST", `/api/custom_configuration/update_or_create?workspace_id=${this.clientId}`, { item_type: "Company", config_key: "vendor_revalidation_config", modifications: { value: config } });
    if (r.status !== 200) throw new Error(`saving the settings was refused (${r.status} ${r.message ?? short(r.data, 160)}) — a Procol employee token is needed`);
    const now = await this.getConfig();
    if (!sameJson(now.config, config)) throw new Error("the settings read back from the database differ from what was saved");
    this.currentStatuses = [...(config.vendor_statuses ?? [])];
    this.currentDocs = Object.keys(config.validations ?? {});
    return r;
  }
  async putRaw(_body: any): Promise<Reply> {
    throw new NotRunnable(`the settings API with its checks was removed in ${REVAMP}; the general configuration endpoint saves anything (REV-17)`);
  }
  private assertWritable() {
    if (!writeClients().has(this.clientId))
      throw new NotRunnable(`runs are started only for client(s) ${[...writeClients()].join(", ")} (VR_WRITE_CLIENTS)`);
    if (this.original === undefined) throw new Error("a run outside the guard — refusing");
  }
  /** a config whose only document reads a column that does not exist: every row skipped, no provider call */
  silent(statuses: readonly string[] = this.original?.config?.vendor_statuses ?? ALL_STATUSES, start = this.today) {
    return { enabled: true, vendor_statuses: [...statuses], validations: { cin: { paths: [NO_SUCH_COLUMN], frequency: "yearly", start_date: start } } };
  }
  /** the original config with some document settings replaced */
  withDocs(validations: Record<string, any>, extra: Record<string, any> = {}) {
    return { ...this.original.config, enabled: true, vendor_statuses: [...ALL_STATUSES], validations, ...extra };
  }
  doc(name: string, over: Record<string, any> = {}) {
    const base = this.original?.config?.validations?.[name] ?? { paths: [], frequency: "yearly", start_date: this.today };
    return { ...base, start_date: this.today, ...over };
  }

  // ── trigger / run ──
  async trigger(body: Record<string, any>, opts: { refused?: boolean } = {}): Promise<Reply> {
    this.assertWritable();
    const ids = body.vendor_ids;
    if (Array.isArray(ids) && ids.length === 0) throw new Error("refusing to send vendor_ids: [] — the API reads it as EVERY vendor of the client");
    if (!opts.refused && !("vendor_ids" in body) && !("vendor_limit" in body)) throw new Error("refusing a trigger with no vendor scope — it would run every vendor");
    if (Array.isArray(ids) && ids.length > MAX_VENDORS) throw new Error(`refusing more than ${MAX_VENDORS} vendors in one trigger`);
    if (typeof body.vendor_limit === "number" && body.vendor_limit > MAX_VENDORS) throw new Error(`refusing vendor_limit above ${MAX_VENDORS}`);
    if (!opts.refused) {
      // what a buyer sees now, read BEFORE the trigger resets it (for the evidence)
      const chosen = Array.isArray(ids) ? ids.map(Number) : typeof body.vendor_limit === "number" ? (await eligibleIds(this.clientId, this.currentStatuses)).slice(0, body.vendor_limit) : [];
      for (const v of chosen) await this.markTouched(v);
    }
    const r = await this.qa("employee", "POST", "/trigger", body);
    if (r.status === 200 && r.data?.job_id) this.jobs.add(r.data.job_id);
    return r;
  }
  async markTouched(vendor: number) {
    if (this.touched.has(vendor)) return;
    const f = (await finalsOf(this.clientId, [vendor])).get(vendor);
    this.touched.set(vendor, f?.status ?? null);
  }
  async status(runId: string, jobId?: string): Promise<any> {
    const r = await this.qa("employee", "GET", `/runs/${runId}${jobId ? `?job_id=${jobId}` : ""}`);
    if (r.status !== 200) throw new Error(`run status answered ${r.status} ${r.message ?? ""}`);
    return r.data;
  }
  /** poll until the trigger settles: complete, or a terminal state */
  async wait(t: { run_id: string; job_id: string }, timeoutMs = 15 * 60_000): Promise<{ s: any; timedOut: boolean }> {
    const until = Date.now() + timeoutMs;
    let s: any;
    for (;;) {
      s = await this.status(t.run_id, t.job_id);
      const state = s?.trigger?.state;
      if (["nothing_due", "disabled", "cancelled"].includes(state)) return { s, timedOut: false };
      if (state === "started" && s?.complete) return { s, timedOut: false };
      if (Date.now() > until) return { s, timedOut: true };
      await sleep(POLL_MS);
    }
  }
  /** trigger and wait; throws NotRunnable (Blocked) when rows stay pending */
  async run(body: Record<string, any>, timeoutMs?: number): Promise<{ t: any; s: any }> {
    const r = await this.trigger(body);
    if (r.status !== 200) throw new Error(`the trigger was refused: ${r.status} ${r.message ?? short(r.data, 200)}`);
    const { s, timedOut } = await this.wait(r.data, timeoutMs);
    if (timedOut)
      throw new NotRunnable(`Blocked: rows still pending after ${Math.round((timeoutMs ?? 900_000) / 60_000)} min (a provider is rate-limiting or down) — by_status ${short(s?.by_status, 200)}`);
    return { t: r.data, s };
  }
  /** a run must have added up: by_status sums to total_rows, every vendor finished */
  sums(s: any) {
    const sum = Object.values(s?.by_status ?? {}).reduce((a: number, b: any) => a + Number(b), 0);
    this.expect(sum === s?.total_rows, `by_status adds up to ${sum}, total_rows says ${s?.total_rows}`);
    if (s?.complete) this.expect(s.finished_vendors === s.vendors, `finished_vendors ${s.finished_vendors} = vendors ${s.vendors} once complete`);
  }

  // ── the guard ──
  async guarded<T>(fn: () => Promise<T>): Promise<T> {
    if (!employeeToken()) throw new NotRunnable("needs the client's buyer access-token (a login allowed to edit vendors) in prototype/.env as VR_QA_TOKEN");
    if (!writeClients().has(this.clientId)) throw new NotRunnable(`writes are allowed only for client(s) ${[...writeClients()].join(", ")} (VR_WRITE_CLIENTS)`);
    mkdirSync(BACKUP_DIR, { recursive: true });
    const lock = join(BACKUP_DIR, `${this.clientId}.lock`);
    if (existsSync(lock)) {
      const pid = Number(readFileSync(lock, "utf8"));
      let alive = false;
      try {
        process.kill(pid, 0);
        alive = pid !== process.pid;
      } catch {
        alive = false;
      }
      if (alive) throw new NotRunnable(`another revalidation run (pid ${pid}) holds the config of client ${this.clientId}`);
    }
    // Not near the nightly run: a QA trigger takes that night's claim for an
    // hour (REV-10), and a changed config at 11 pm would be what the nightly
    // run reads for every vendor of the client.
    const ist = new Date(Date.now() + 5.5 * 3600_000);
    const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    if (minutes >= 21 * 60 + 50 && minutes <= 23 * 60 + 30)
      throw new NotRunnable("too close to the 11 pm IST nightly run (no runs started between 21:50 and 23:30 IST)");
    const busy = await q(`SELECT count(*)::int n FROM vendor_validation_histories WHERE client_company_id = $1 AND status = 0`, [this.clientId]);
    if (busy[0].n > 0) throw new NotRunnable(`a run is in progress for client ${this.clientId} (${busy[0].n} rows pending) — not starting another now`);
    writeFileSync(lock, String(process.pid));
    const backup = join(BACKUP_DIR, `${this.clientId}.json`);
    try {
      if (existsSync(backup)) {
        // a run that died mid-case: put its saved settings back before anything else
        const saved = JSON.parse(readFileSync(backup, "utf8"));
        this.original = { config: {}, enabled: true };
        await this.putConfig(saved.config);
        this.note(`restored the settings saved by an interrupted run (${saved.savedAt})`);
        rmSync(backup);
      }
      this.original = await this.getConfig();
      this.currentStatuses = [...(this.original.config?.vendor_statuses ?? [])];
      this.currentDocs = Object.keys(this.original.config?.validations ?? {});
      if (!this.original.enabled && !/^(A-13|C-04|I-10)$/.test(this.key)) throw new NotRunnable(`revalidation is off for client ${this.clientId}`);
      writeFileSync(backup, JSON.stringify({ savedAt: new Date().toISOString(), config: this.original.config }, null, 1));
      try {
        return await fn();
      } finally {
        await this.restore(backup);
      }
    } finally {
      rmSync(lock, { force: true });
    }
  }

  private async restore(backup: string) {
    const out: string[] = [];
    if (this.configChanged) {
      const orig = this.original.config;
      if (!orig || !Object.keys(orig).length) out.push("the original settings were empty; left as the case set them — CHECK BY HAND");
      else {
        this.configChanged = false;
        try {
          await this.putConfig(orig);
          out.push("settings restored and read back identical");
        } catch (e) {
          this.ev.restore = `SETTINGS NOT RESTORED (${(e as Error).message}) — the saved copy is in ${backup}`;
          throw new Error(this.ev.restore);
        }
      }
    }
    rmSync(backup, { force: true });
    this.ev.restore = out.join("; ") || "nothing to restore";
  }

}

async function eligibleUnder(client: number, statuses: string[]): Promise<Set<number>> {
  const ids = statuses.map((s) => BSCM_STATUS[s]).filter((n) => n != null);
  const r = await q(
    `SELECT b.dealing_with_company_id v FROM buyer_seller_company_mappings b JOIN companies c ON c.id = b.dealing_with_company_id
      WHERE ${ELIGIBLE} AND b.status = ANY($2::int[])`,
    [client, ids],
  );
  return new Set(r.map((x: any) => x.v));
}
async function eligibleIds(client: number, statuses: readonly string[]): Promise<number[]> {
  return [...(await eligibleUnder(client, [...statuses]))].sort((a, b) => a - b);
}

/** SchedulerWorker.due_dates for one document's settings */
export function dueDates(frequency: string, start: string, today: string): string[] {
  const window = [addDays(today, -2), addDays(today, -1), today];
  if (frequency === "one_time") return window.includes(start) ? [start] : [];
  const cycle = ({ monthly: 1, quarterly: 3, six_monthly: 6, yearly: 12 } as Record<string, number>)[frequency];
  if (!cycle || !/^\d{4}-\d{2}-\d{2}$/.test(String(start))) return [];
  return window.filter((d) => {
    const months = (Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7))) - (Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)));
    return months >= 0 && months % cycle === 0 && addMonths(start, months) === d;
  });
}
/** document types the nightly scheduler would still run today (SchedulerWorker#due?) */
async function nightlyDueToday(client: number, config: any, today: string): Promise<string[]> {
  const out: string[] = [];
  for (const [doc, st] of Object.entries<any>(config?.validations ?? {})) {
    const due = dueDates(st?.frequency, st?.start_date, today).at(-1);
    if (!due || !(DOC as readonly string[]).includes(doc)) continue;
    const r = await q(`SELECT 1 FROM vendor_validation_histories WHERE client_company_id = $1 AND doc_type = $2 AND run_scheduled_on BETWEEN $3::date AND $4::date LIMIT 1`, [client, DOC.indexOf(doc as any), due, today]);
    if (!r.length) out.push(doc);
  }
  return out;
}

// ── the buyer's listing (read with the client's own session) ───────────
interface ListedVendor { id: number | null; uuid: string; name: string; vendor_validation_status?: string; vendor_last_validated_at?: string; vendor_validation_errors?: string }
/**
 * The listing as the buyer's session gets it. An app-version below the
 * uuid-only versions makes each vendor carry its numeric id
 * (CommonFunctions.get_id_for_lower_versions), so rows match the database
 * without decoding the encrypted uuid; the validation fields are the same.
 */
async function listing(h: H, params: string): Promise<{ list: ListedVendor[]; ms: number; status: number; raw: any }> {
  const r = await h.call("session", "GET", `/api/companies/all_vendors?${params}`, undefined, { appVersion: "1.0.0" });
  const list = Array.isArray(r.data?.companies) ? r.data.companies : [];
  return { list, ms: r.ms, status: r.status, raw: r.data };
}
const TAB_OF: Record<number, string> = { 1: "verified", 7: "verified", 2: "unverified", 3: "onboarding_in_progress", 4: "onboarding_in_progress", 6: "onboarding_in_progress", 5: "rejected" };
/**
 * The vendor's listing row, in the tab its link status puts it. The listing
 * ignores a search parameter, so the tab is paged through (20 a page, sorted
 * by name) until the vendor's id turns up.
 */
async function listedRow(h: H, vendor: number): Promise<ListedVendor | null> {
  const link = (await finalsOf(h.clientId, [vendor])).get(vendor);
  if (!link) return null;
  const tab = TAB_OF[link.linkStatus] ?? "verified";
  for (let page = 1, pages = 1; page <= Math.min(pages, 80); page++) {
    const { list, raw } = await listing(h, `tab=${tab}&page=${page}`);
    pages = Number(raw?.total_pages ?? 1);
    const hit = list.find((x) => Number(x.id) === vendor);
    if (hit) return hit;
    if (!list.length) break;
  }
  return null;
}
/** what the listing must show for a vendor, worked out from the database */
async function expectedListing(h: H, vendor: number, docs: string[]): Promise<{ label: string; errors: string; rows: Row[] }> {
  const f = (await finalsOf(h.clientId, [vendor])).get(vendor);
  const rows = await latestRows(h.clientId, [vendor], docs);
  const errors = rows.filter((r) => r.status === "failed" || r.status === "system_error").map(errorLine).join("; ");
  return { label: LABEL[f?.status ?? "pending"], errors, rows };
}
async function configuredDocs(client: number): Promise<{ enabled: boolean; docs: string[]; statuses: string[] }> {
  const r = await q(
    `SELECT modifications->'value' v FROM custom_configurations WHERE config_key = 'vendor_revalidation_config' AND item_type = 'Company' AND item_id = $1 AND status = 1 ORDER BY id DESC LIMIT 1`,
    [client],
  );
  const v = r[0]?.v ?? {};
  return { enabled: v.enabled === true, docs: Object.keys(v.validations ?? {}).filter((d) => (DOC as readonly string[]).includes(d)), statuses: v.vendor_statuses ?? [] };
}
async function latestRun(client: number): Promise<{ runId: string; date: string } | null> {
  const r = await q(
    `SELECT run_id::text r, to_char(run_scheduled_on, 'YYYY-MM-DD') d FROM vendor_validation_histories WHERE client_company_id = $1
      GROUP BY 1, 2 ORDER BY 2 DESC, max(created_at) DESC LIMIT 1`,
    [client],
  );
  return r[0] ? { runId: r[0].r, date: r[0].d } : null;
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIOS — keyed by the guide's id. Each returns nothing; it records its
// assertions with h.expect and throws NotRunnable when it cannot be set up.
// ═══════════════════════════════════════════════════════════════════════
type Scenario = (h: H) => Promise<string | void>;
const S: Record<string, Scenario> = {};

// ── A. access and input ────────────────────────────────────────────────
const NOT_AUTHORIZED = (r: Reply) => r.status !== 200 && r.code === 5;
S["A-01"] = async (h) => {
  // Product decision (QA lead, 19 Oct 2026): a client's buyer who may edit
  // vendors runs revalidation for their own company.
  const run = await latestRun(h.clientId);
  const id = run?.runId ?? runIdFor(h.clientId, h.today);
  const r = await h.qa("session", "GET", `/runs/${id}`);
  h.expect(r.status === 200, `the client's own buyer login reads its own run (HTTP ${r.status}${r.message ? ` '${r.message}'` : ""})`);
  if (run) h.expect(r.data?.total_rows > 0, `the reply carries the run's rows (total_rows ${r.data?.total_rows})`);
  return `GET /api/vendor_validation/runs/${run?.date ?? "today"} as the client's buyer`;
};
S["A-30"] = async (h) => {
  // Another company cannot be reached: a workspace_id the login does not
  // belong to is ignored and the login's own company is used (seen live 20 Oct).
  const other = h.clientId === 198678 ? 47053 : 198678;
  const mine = await latestRun(h.clientId);
  if (!mine) throw new NotRunnable("this client has no run to look for from another company");
  const theirs = runIdFor(other, mine.date);
  const r = await h.qa("session", "GET", `/runs/${theirs}`, undefined, other);
  h.expect(!(r.status === 200 && Number(r.data?.total_rows) > 0), `company ${other}'s run (${theirs}) read with workspace_id=${other} returns none of its rows (HTTP ${r.status}, total_rows ${r.data?.total_rows ?? "—"})`);
  const own = await h.qa("session", "GET", `/runs/${mine.runId}`, undefined, other);
  const ownRows = (await rowsOf(h.clientId, { runId: mine.runId })).length;
  h.expect(own.status !== 200 || Number(own.data?.total_rows) === ownRows, `with workspace_id=${other} the login still sees only its own company's run (${own.data?.total_rows ?? "—"} rows = ${ownRows} in the database)`);
  h.note(`a workspace_id the login does not belong to is not refused; the login's own company is used instead`);
};
S["A-02"] = async (h) => {
  for (const as of ["none", "garbage"] as const) {
    const r = await h.qa(as, "GET", `/runs/${runIdFor(h.clientId, h.today)}`);
    h.expect(r.status !== 200 && r.data?.total_rows === undefined, `${as === "none" ? "no access-token" : "a random access-token"}: refused with no run data (got HTTP ${r.status}${r.message ? ` '${r.message}'` : ""})`);
  }
};
S["A-03"] = async (h) => {
  const r = await h.qa("session", "GET", `/runs/${runIdFor(h.clientId, h.today)}`, undefined, 999999999);
  h.expect(r.status !== 200 || Number(r.data?.total_rows) === 0, `workspace_id=999999999 (no such company) gives no data (HTTP ${r.status}${r.message ? ` '${r.message}'` : ""})`);
};
const readAs = (): As => (employeeToken() ? "employee" : "session");
S["A-26"] = async (h) =>
  h.guarded(async () => {
    // 20 s in the past: inside the 1-minute tolerance even with a few seconds of clock difference
    const r = await h.trigger({ mode: "force", vendor_ids: [await h.role("V-NODOCS")], run_at: istIso(-20_000) });
    h.expect(r.status === 200, `run_at 20 seconds ago is accepted (got ${r.status} '${r.message ?? ""}')`);
    if (r.status === 200) {
      const { s } = await h.wait(r.data, 5 * 60_000);
      h.expect(s?.trigger?.state === "started", `it runs straight away (state ${s?.trigger?.state})`);
    }
  });
S["A-25"] = async (h) => {
  const r = await h.qa(readAs(), "GET", `/runs/${randomUUID()}`);
  h.expect(r.status === 200, `unknown run answers 200, not an error (got ${r.status})`);
  h.expect(r.data?.total_rows === 0 && r.data?.vendors === 0 && r.data?.complete === false, `total_rows 0, vendors 0, complete false (got ${short({ t: r.data?.total_rows, v: r.data?.vendors, c: r.data?.complete })})`);
};

/** a PUT that must be refused with this message, leaving the config as it was */
const refusedPut = (variants: Array<[string, (cfg: any) => any]>, message: (label: string) => string | RegExp): Scenario => async (h) =>
  h.guarded(async () => {
    for (const [label, make] of variants) {
      const body = make(structuredClone(h.original.config));
      const r = await h.putRaw({ client_company_id: h.clientId, ...body });
      const want = message(label);
      const ok = r.status === 422 && r.code === 2 && (typeof want === "string" ? r.message === want : want.test(r.message ?? ""));
      h.expect(ok, `${label}: refused 422 code 2 '${typeof want === "string" ? want : want.source}' (got ${r.status} '${r.message ?? short(r.data, 120)}')`);
      const now = await h.getConfig();
      h.expect(sameJson(now.config, h.original.config), `${label}: config unchanged after the refusal`);
    }
  });
const cfgWith = (patch: (c: any) => void) => (c: any) => (patch(c), { config: c });
// the enum's own order: in_active, active, invited, onboarding_in_progress, in_review, rejected, in_approval, blacklisted
const STATUS_LIST = "in_active, active, invited, onboarding_in_progress, in_review, rejected, in_approval, blacklisted";
S["A-04"] = refusedPut([["config \"abc\"", () => ({ config: "abc" })], ["config [1]", () => ({ config: [1] })]], () => "config must be an object");
S["A-05"] = refusedPut(
  [["no enabled", cfgWith((c) => delete c.enabled)], ['enabled "yes"', cfgWith((c) => (c.enabled = "yes"))], ['enabled "true" (a string)', cfgWith((c) => (c.enabled = "true"))]],
  () => "enabled must be true or false",
);
S["A-06"] = refusedPut(
  [["vendor_statuses []", cfgWith((c) => (c.vendor_statuses = []))], ['vendor_statuses ["approved"]', cfgWith((c) => (c.vendor_statuses = ["approved"]))], ['vendor_statuses ["active","approved"]', cfgWith((c) => (c.vendor_statuses = ["active", "approved"]))], ['vendor_statuses "active" (not a list)', cfgWith((c) => (c.vendor_statuses = "active"))]],
  () => `vendor_statuses must be a non-empty list from: ${STATUS_LIST}`,
);
S["A-07"] = refusedPut([["validations {}", cfgWith((c) => (c.validations = {}))], ["validations []", cfgWith((c) => (c.validations = []))]], () => "validations must be a non-empty object");
S["A-08"] = refusedPut([["aadhaar added", cfgWith((c) => (c.validations.aadhaar = { paths: ["form.aadhaar"], frequency: "yearly", start_date: "2026-10-15" }))]], () => "unsupported doc types: aadhaar");
S["A-09"] = refusedPut(
  [["gst weekly", cfgWith((c) => (c.validations.gst = { ...gstOf(c), frequency: "weekly" }))], ["gst frequency missing", cfgWith((c) => (c.validations.gst = { ...gstOf(c), frequency: undefined }))]],
  (l) => (l.includes("weekly") ? "gst: unsupported frequency 'weekly'" : "gst: unsupported frequency ''"),
);
S["A-10"] = refusedPut(
  [["2026-13-45", cfgWith((c) => (c.validations.gst = { ...gstOf(c), start_date: "2026-13-45" }))], ["15-10-2026", cfgWith((c) => (c.validations.gst = { ...gstOf(c), start_date: "15-10-2026" }))], ["2026-02-30", cfgWith((c) => (c.validations.gst = { ...gstOf(c), start_date: "2026-02-30" }))]],
  (l) => `gst: invalid start_date '${l}'`,
);
S["A-11"] = refusedPut([["paths []", cfgWith((c) => (c.validations.gst = { ...gstOf(c), paths: [] }))], ["paths missing", cfgWith((c) => (c.validations.gst = { ...gstOf(c), paths: undefined }))]], () => "gst: paths must be a non-empty list");
S["A-12"] = refusedPut(
  [["vendor.gst", cfgWith((c) => (c.validations.gst = { ...gstOf(c), paths: ["vendor.gst"] }))], ["form.", cfgWith((c) => (c.validations.gst = { ...gstOf(c), paths: ["form."] }))], ["company.GST_NO", cfgWith((c) => (c.validations.gst = { ...gstOf(c), paths: ["company.GST_NO"] }))]],
  (l) => `gst: unsupported path '${l}'`,
);
S["A-32"] = refusedPut([['gst: "yearly" (a string, not settings)', cfgWith((c) => (c.validations.gst = "yearly"))]], () => "gst: settings must be an object");
function gstOf(c: any) {
  return c?.validations?.gst ?? { paths: ["form.gstin"], frequency: "quarterly", start_date: "2026-10-15" };
}
S["A-33"] = async (h) =>
  h.guarded(async () => {
    // A single path given as a string (not a list) is accepted: Array.wrap.
    const cfg = { ...h.original.config, validations: { ...h.original.config.validations, gst: { ...gstOf(h.original.config), paths: "form.gstin" } } };
    const r = await h.putRaw({ client_company_id: h.clientId, config: cfg });
    h.expect(r.status === 200, `paths "form.gstin" (one string) is accepted, as the code wraps it (got ${r.status} '${r.message ?? ""}')`);
    h.note("the guide says paths is a list; the build accepts one string too (SchedulerWorker.settings_error uses Array.wrap)");
  });
S["A-27"] = async (h) =>
  h.guarded(async () => {
    const cfg = { ...h.original.config, vendor_statuses: [...(h.original.config.vendor_statuses ?? ["active"])].reverse() };
    const put = await h.putConfig(cfg);
    const got = await h.getConfig();
    h.expect(sameJson(got.config, cfg), "GET returns exactly the config last PUT");
    h.expect(sameJson(put.data?.config, cfg), "PUT answers with the saved config");
    h.expect(got.enabled === (cfg.enabled === true && got.vendor_onboarding_v2 === true), `enabled (${got.enabled}) = config enabled AND vendor_onboarding_v2 (${got.vendor_onboarding_v2})`);
  });
S["A-28"] = async (h) =>
  h.guarded(async () => {
    const cfg = { ...h.original.config, validations: { gst: gstOf(h.original.config) } };
    await h.putConfig(cfg);
    const got = await h.getConfig();
    h.expect(sameJson(Object.keys(got.config?.validations ?? {}), ["gst"]), `only gst left in the config (got ${Object.keys(got.config?.validations ?? {}).join(", ")})`);
  });

/** run requests that must be refused (code 8 since the 20 Oct rewrite); the client's own settings stay as they are */
const refusedTrigger = (sends: (h: H) => Promise<Array<[string, Record<string, any>, string | RegExp, number?]>>): Scenario => async (h) =>
  h.guarded(async () => {
    for (const [label, body, want, http] of await sends(h)) {
      const r = await h.trigger(body, { refused: true });
      const ok = r.status === (http ?? 422) && r.code === 8 && (typeof want === "string" ? r.message === want : want.test(r.message ?? ""));
      h.expect(ok, `${label}: refused ${http ?? 422}, code 8, '${typeof want === "string" ? want : want.source}' (got ${r.status} code ${r.code ?? "—"} '${r.message ?? short(r.data, 160)}')`);
    }
  });
const DISABLED_MSG = "Vendor revalidation is not enabled for this client";
S["A-13"] = async (h) => {
  // On a client with revalidation off (e.g. PROCOL DEMO), with its own buyer login. Refused, so nothing runs.
  if ((await h.settings()).enabled) throw new NotRunnable(`revalidation is on for client ${h.clientId}; run this case on a client with it off (e.g. 198678)`);
  const r = await h.qa("session", "POST", "/trigger", { mode: "force", vendor_ids: [await h.role("V-STATUS-active")] });
  h.expect(r.status === 422 && r.code === 8 && r.message === DISABLED_MSG, `refused 422, code 8, '${DISABLED_MSG}' (got ${r.status} code ${r.code ?? "—"} '${r.message ?? short(r.data, 120)}')`);
};
S["A-14"] = refusedTrigger(async (h) => {
  const v = await h.role("V-NODOCS");
  return [["no mode", { vendor_ids: [v] }, "mode must be one of: force, scheduler"], ["mode now", { mode: "now", vendor_ids: [v] }, "mode must be one of: force, scheduler"], ["mode FORCE", { mode: "FORCE", vendor_ids: [v] }, "mode must be one of: force, scheduler"]];
});
S["A-15"] = refusedTrigger(async (h) => [["vendor_ids and vendor_limit", { mode: "force", vendor_ids: [await h.role("V-NODOCS")], vendor_limit: 1 }, "send either vendor_ids or vendor_limit, not both"]]);
S["A-16"] = refusedTrigger(async () => [
  ["vendor_limit 0", { mode: "force", vendor_limit: 0 }, "vendor_limit must be a positive integer"],
  ["vendor_limit -1", { mode: "force", vendor_limit: -1 }, "vendor_limit must be a positive integer"],
  ['vendor_limit "abc"', { mode: "force", vendor_limit: "abc" }, "vendor_limit must be a positive integer"],
  ["vendor_limit 1.5", { mode: "force", vendor_limit: 1.5 }, "vendor_limit must be a positive integer"],
]);
S["A-17"] = refusedTrigger(async () => [
  ['vendor_ids ["abc", 1.5]', { mode: "force", vendor_ids: ["abc", 1.5] }, "vendor_ids must be a list of integers"],
  ['vendor_ids ["1x"]', { mode: "force", vendor_ids: ["1x"] }, "vendor_ids must be a list of integers"],
]);
S["A-18"] = refusedTrigger(async (h) => {
  const v = await h.role("V-NOTCLIENT");
  return [["a vendor not linked to this client", { mode: "force", vendor_ids: [v] }, `vendor_ids not among this client's vendors in the configured statuses: ${v}`]];
});
S["A-19"] = async (h) => {
  // a vendor linked in a status the client's settings do not check
  const cfg = await h.settings();
  const off = ALL_STATUSES.filter((st) => !(cfg.config?.vendor_statuses ?? []).includes(st));
  let v: number | undefined;
  let st: string | undefined;
  for (const o of off) {
    try {
      v = await h.role(`V-STATUS-${o}`);
      st = o;
      break;
    } catch {
      /* next status */
    }
  }
  if (!v) throw new NotRunnable("no vendor is linked in a status the settings leave out");
  return refusedTrigger(async () => [[`a vendor linked as ${st} (not in the client's statuses)`, { mode: "force", vendor_ids: [v!] }, `vendor_ids not among this client's vendors in the configured statuses: ${v}`]])(h);
};
S["A-20"] = async () => {
  throw new NotRunnable(`needs the client's vendor_statuses set to a status with no vendor — settings have no API since ${REVAMP}`);
};
S["A-21"] = refusedTrigger(async (h) => [["run_at 10 minutes ago", { mode: "force", vendor_ids: [await h.role("V-NODOCS")], run_at: istIso(-10 * 60_000) }, "run_at is in the past"]]);
S["A-22"] = refusedTrigger(async (h) => [["run_at 31 days ahead", { mode: "force", vendor_ids: [await h.role("V-NODOCS")], run_at: istIso(31 * 86_400_000) }, "run_at must be within 30 days from now"]]);
S["A-23"] = refusedTrigger(async (h) => {
  const v = await h.role("V-NODOCS");
  const like = /^run_at must be a time like \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30 \(IST if no offset\)$/;
  return [["run_at tomorrow", { mode: "force", vendor_ids: [v], run_at: "tomorrow" }, like], ["run_at 2026-02-30T10:00", { mode: "force", vendor_ids: [v], run_at: "2026-02-30T10:00:00" }, like]];
});
S["C-03"] = refusedTrigger(async (h) => {
  const v = await h.role("V-INACTIVE");
  return [["a vendor whose company is inactive", { mode: "force", vendor_ids: [v] }, `vendor_ids not among this client's vendors in the configured statuses: ${v}`]];
});
S["C-04"] = async (h) => {
  if (!employeeToken()) throw new NotRunnable("reading another client's config needs the employee token (the client session would only prove REV-01 again)");
  const r0 = await q(`SELECT c.id FROM companies c WHERE c.category = 0 AND c.status = 1 AND c.id <> $1 AND NOT EXISTS (
      SELECT 1 FROM custom_configurations x WHERE x.item_id = c.id AND x.config_key = 'vendor_onboarding_version' AND x.status = 1 AND x.modifications->>'value' = 'v2')
      ORDER BY c.id LIMIT 1`, [h.clientId]);
  if (!r0[0]) throw new NotRunnable("no active client without onboarding v2 found");
  const r = await h.qa("employee", "GET", `/config?client_company_id=${r0[0].id}`);
  h.expect(r.status === 200 && r.data?.enabled === false, `client ${r0[0].id}: enabled false (got ${short(r.data, 160)})`);
  h.note("the write half (config enabled on a client without v2, then trigger refused) is manual: the API cannot put an empty config back");
};
S["A-29"] = async (h) =>
  h.guarded(async () => {
    const tomorrow = addDays(h.today, 1);
    const r = await h.trigger({ mode: "force", vendor_ids: [await h.role("V-NODOCS")], run_at: `${tomorrow}T15:00:00` });
    h.expect(r.status === 200, `accepted (got ${r.status} '${r.message ?? ""}')`);
    h.expect(String(r.data?.scheduled_for) === `${tomorrow}T15:00:00+05:30`, `scheduled_for ${tomorrow}T15:00:00+05:30 (got ${r.data?.scheduled_for})`);
    h.expect(r.data?.run_scheduled_on === tomorrow && r.data?.run_id === runIdFor(h.clientId, tomorrow), `run date ${tomorrow} and its run id`);
    h.note(`cancel was removed in ${REVAMP}: this trigger runs at ${tomorrow} 15:00 IST on one vendor with nothing to check`);
  });
S["A-31"] = async (h) =>
  h.guarded(async () => {
    // 20:00 UTC is 01:30 IST the next day: the run belongs to the IST date.
    const at = new Date(Date.now() + 26 * 3600_000);
    const utcDay = at.toISOString().slice(0, 10);
    const sent = `${utcDay}T20:00:00Z`;
    const istDay = addDays(utcDay, 1);
    const r = await h.trigger({ mode: "force", vendor_ids: [await h.role("V-NODOCS")], run_at: sent });
    h.expect(r.status === 200, `accepted (got ${r.status} '${r.message ?? ""}')`);
    h.expect(r.data?.run_scheduled_on === istDay, `run_at ${sent} is ${istDay} 01:30 IST → run_scheduled_on ${istDay} (got ${r.data?.run_scheduled_on})`);
    h.expect(r.data?.run_id === runIdFor(h.clientId, istDay), "run id is the IST date's");
    h.note(`cancel was removed in ${REVAMP}: this trigger runs at ${istDay} 01:30 IST on one vendor with nothing to check`);
  });

// ── B. triggers and schedule ──────────────────────────────────────────
/** a scheduler-mode trigger on the silent vendor; returns the settled state */
async function schedulerState(h: H, validations: Record<string, any>): Promise<{ state: string; s: any; t: any }> {
  await h.putConfig({ enabled: true, vendor_statuses: [...ALL_STATUSES], validations });
  const r = await h.trigger({ mode: "scheduler", vendor_ids: [await h.role("V-NODOCS")] });
  if (r.status !== 200) throw new Error(`trigger refused: ${r.status} ${r.message}`);
  const { s, timedOut } = await h.wait(r.data, 5 * 60_000);
  if (timedOut) throw new NotRunnable(`Blocked: trigger still ${s?.trigger?.state} after 5 min`);
  return { state: s?.trigger?.state, s, t: r.data };
}
const silentDoc = (frequency: string, start: string, doc = "gst") => ({ [doc]: { paths: [NO_SUCH_COLUMN], frequency, start_date: start } });
S["B-01"] = async (h) =>
  h.guarded(async () => {
    // Scheduler mode picks exactly the document types due today under the client's own settings.
    const cfg = (await h.settings()).config;
    const due = Object.entries<any>(cfg.validations ?? {}).filter(([, st]) => dueDates(st?.frequency, st?.start_date, h.today).length).map(([d]) => d);
    const r = await h.trigger({ mode: "scheduler", vendor_ids: [await h.role("V-NODOCS")] });
    if (r.status !== 200) throw new Error(`trigger refused: ${r.status} ${r.message}`);
    const { s, timedOut } = await h.wait(r.data, 5 * 60_000);
    if (timedOut) throw new NotRunnable(`Blocked: trigger still ${s?.trigger?.state} after 5 min`);
    if (!due.length) h.expect(s?.trigger?.state === "nothing_due", `nothing is due on ${h.today} under the client's settings → nothing_due (got ${s?.trigger?.state})`);
    else h.expect(s?.trigger?.state === "started" && sameJson([...(s.trigger.doc_types ?? [])].sort(), [...due].sort()), `due today: ${due.join(", ")} → started with exactly those (got ${s?.trigger?.state}, ${short(s?.trigger?.doc_types)})`);
  });
S["B-02"] = async (h) =>
  h.guarded(async () => {
    // A type already checked since its due date is not due again: use a real
    // earlier run of this client inside the 2-day catch-up window.
    const r = await q(`SELECT to_char(max(run_scheduled_on), 'YYYY-MM-DD') d FROM vendor_validation_histories WHERE client_company_id = $1 AND doc_type = 1
       AND run_scheduled_on BETWEEN $2::date AND $3::date`, [h.clientId, addDays(h.today, -2), addDays(h.today, -1)]);
    const d = r[0]?.d;
    if (!d) throw new NotRunnable("needs a GST run of this client in the last 2 days (before today)");
    const { state } = await schedulerState(h, silentDoc("monthly", addMonths(d, -1)));
    h.expect(state === "nothing_due", `gst monthly due ${d}, already checked on ${d} → nothing_due (got ${state})`);
  });
S["B-03"] = async (h) =>
  h.guarded(async () => {
    const start = addDays(h.today, -5);
    const { state } = await schedulerState(h, silentDoc("one_time", start, "msme"));
    h.expect(state === "nothing_due", `msme one_time from ${start} does not run again → nothing_due (got ${state})`);
  });
S["B-04"] = async (h) =>
  h.guarded(async () => {
    const start = addMonths(addDays(h.today, -3), -1);
    const { state } = await schedulerState(h, silentDoc("monthly", start, "cin"));
    h.expect(state === "nothing_due", `cin monthly from ${start}: due ${addDays(h.today, -3)}, 3 days ago, past the 2-day catch-up → nothing_due (got ${state})`);
  });
S["B-05"] = async (h) =>
  h.guarded(async () => {
    await h.putConfig(h.silent());
    const v = await h.role("V-NODOCS");
    const before = (await rowsOf(h.clientId, { vendors: [v] })).map((r) => r.id).join(",");
    const r = await h.trigger({ mode: "force", vendor_ids: [v], run_at: istIso(2 * 60_000) });
    h.expect(r.status === 200, `scheduled (got ${r.status})`);
    const c = await h.qa("employee", "DELETE", `/trigger/${r.data.job_id}`);
    h.expect(c.status === 200 && c.data?.state === "cancelled", `DELETE → state cancelled (got ${c.status} ${short(c.data, 80)})`);
    await sleep(3 * 60_000);
    const s = await h.status(r.data.run_id, r.data.job_id);
    h.expect(s?.trigger?.state === "cancelled", `after run_at the trigger is still cancelled (got ${s?.trigger?.state})`);
    const after = (await rowsOf(h.clientId, { vendors: [v] })).map((x) => x.id).join(",");
    h.expect(before === after, "the vendor's rows were not touched");
  });
S["B-06"] = async (h) =>
  h.guarded(async () => {
    await h.putConfig(h.silent());
    const v = await h.role("V-NODOCS");
    const before = (await rowsOf(h.clientId, { vendors: [v] })).map((r) => r.id).join(",");
    const r = await h.trigger({ mode: "force", vendor_ids: [v], run_at: istIso(2 * 60_000) });
    await h.putConfig({ ...h.silent(), enabled: false });
    await sleep(3 * 60_000);
    const s = await h.status(r.data.run_id, r.data.job_id);
    h.expect(s?.trigger?.state === "disabled", `switched off before it fired → state disabled (got ${s?.trigger?.state})`);
    const after = (await rowsOf(h.clientId, { vendors: [v] })).map((x) => x.id).join(",");
    h.expect(before === after, "no rows created or reset");
  });
S["B-07"] = async (h) =>
  h.guarded(async () => {
    const docs = Object.keys((await h.settings()).config.validations ?? {});
    const { s } = await h.run({ mode: "force", vendor_ids: [await h.role("V-PASS")] });
    h.expect(s.trigger?.state === "started", `started (got ${s.trigger?.state})`);
    h.expect(sameJson([...(s.trigger?.doc_types ?? [])].sort(), [...docs].sort()), `force checks every configured type whatever its dates: ${short(s.trigger?.doc_types)} = ${docs.join(", ")}`);
    const rows = await rowsOf(h.clientId, { runId: s.run_id, vendors: s.trigger?.vendor_ids ?? [] });
    h.expect(sameJson([...new Set(rows.map((x) => x.doc))].sort(), [...docs].sort()), `rows for every configured type (${[...new Set(rows.map((x) => x.doc))].join(", ")})`);
    h.sums(s);
  });
S["B-08"] = async (h) =>
  h.guarded(async () => {
    const { state, s } = await schedulerState(h, { gst: { ...h.doc("gst"), frequency: "quarterly", start_date: h.today } });
    h.expect(state === "started", `gst quarterly from today is due → started (got ${state})`);
    h.expect(sameJson(Object.keys(s.by_doc_type ?? {}), ["gst"]), `only gst rows (by_doc_type ${Object.keys(s.by_doc_type ?? {}).join(", ")})`);
  });
S["B-09"] = async (h) =>
  h.guarded(async () => {
    for (const [f, m] of [["monthly", 1], ["quarterly", 3], ["six_monthly", 6], ["yearly", 12]] as const) {
      const on = await schedulerState(h, silentDoc(f, addMonths(h.today, -m)));
      h.expect(on.state === "started", `${f} from ${addMonths(h.today, -m)} is due today → started (got ${on.state})`);
      const off = await schedulerState(h, silentDoc(f, addMonths(addDays(h.today, -3), -m)));
      h.expect(off.state === "nothing_due", `${f} from ${addMonths(addDays(h.today, -3), -m)} (cycle date 3 days ago) → nothing_due (got ${off.state})`);
    }
    const mid = await schedulerState(h, silentDoc("quarterly", addMonths(h.today, -2)));
    h.expect(mid.state === "nothing_due", `quarterly from ${addMonths(h.today, -2)}: 2 months is not a whole cycle → nothing_due (got ${mid.state})`);
  });
S["B-10"] = async (h) =>
  h.guarded(async () => {
    const [y, m, d] = h.today.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d !== last || last === 31) throw new NotRunnable("the month-end case can run only on the last day of a month shorter than 31 days (e.g. 30 Nov)");
    // the newest 31st before this month: monthly from it lands on today, clamped
    let k = 1;
    while (new Date(Date.UTC(y, m - 1 - k + 1, 0)).getUTCDate() !== 31) k++;
    const start = `${addMonths(`${h.today.slice(0, 8)}01`, -k).slice(0, 8)}31`;
    const { state } = await schedulerState(h, silentDoc("monthly", start));
    h.expect(state === "started", `monthly from ${start} is due on ${h.today} (clamped month end) → started (got ${state})`);
  });
S["B-11"] = async (h) =>
  h.guarded(async () => {
    const used = new Set((await q(`SELECT DISTINCT doc_type d FROM vendor_validation_histories WHERE client_company_id = $1`, [h.clientId])).map((r: any) => DOC[r.d] as string));
    const doc = ["cin", "fssai", "vat"].find((d) => !used.has(d));
    if (!doc) throw new NotRunnable("needs a document type this client has never checked");
    const start = addMonths(addDays(h.today, -2), -1);
    const { state } = await schedulerState(h, silentDoc("monthly", start, doc));
    h.expect(state === "started", `${doc} monthly due ${addDays(h.today, -2)} (2 days ago), never checked → caught up, started (got ${state})`);
  });
S["B-12"] = async (h) =>
  h.guarded(async () => {
    const v = await h.role("V-NODOCS");
    const a = await h.run({ mode: "force", vendor_ids: [v] });
    const b = await h.run({ mode: "force", vendor_ids: [v] });
    const want = runIdFor(h.clientId, h.today);
    h.expect(a.t.run_id === b.t.run_id, `both triggers share one run id (${a.t.run_id} / ${b.t.run_id})`);
    h.expect(a.t.run_id === want, `run id = uuid v5 of client + ${h.today} (${want})`);
    const c = await h.qa("employee", "DELETE", `/trigger/${a.t.job_id}`);
    h.expect(c.status === 404 && c.message === "trigger not found or already started", `cancel after it started → 404 'trigger not found or already started' (got ${c.status} '${c.message}')`);
  });
/** two runs on the same vendors: same counts, rebuilt rows */
S["B-13"] = async (h) =>
  h.guarded(async () => {
    const ids = await h.roles("V-PASS", "V-BADGST");
    const runId = runIdFor(h.clientId, h.today);
    await h.run({ mode: "force", vendor_ids: ids });
    const first = await rowsOf(h.clientId, { runId, vendors: ids });
    await h.run({ mode: "force", vendor_ids: ids });
    const second = await rowsOf(h.clientId, { runId, vendors: ids });
    const count = (rs: Row[]) => JSON.stringify(rs.reduce((a: any, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {}));
    h.expect(second.length === first.length, `same number of rows (${first.length} then ${second.length}), not doubled`);
    h.expect(count(first) === count(second), `same rows per status (${count(first)} / ${count(second)})`);
    h.expect(!second.some((r) => first.some((x) => x.id === r.id)), "the second run rebuilt the rows (new row ids)");
    const dup = new Set(second.map((r) => `${r.vendor}/${r.doc}/${r.valueIndex}`));
    h.expect(dup.size === second.length, "one row per vendor per document value");
  });
S["G-13"] = S["B-13"];
S["B-14"] = async (h) =>
  h.guarded(async () => {
    const [pass, bad] = await h.roles("V-PASS", "V-BADGST");
    const runId = runIdFor(h.clientId, h.today);
    await h.run({ mode: "force", vendor_ids: [pass, bad] });
    const badBefore = await rowsOf(h.clientId, { runId, vendors: [bad] });
    const passBefore = await rowsOf(h.clientId, { runId, vendors: [pass] });
    await h.run({ mode: "force", vendor_ids: [pass] });
    const badAfter = await rowsOf(h.clientId, { runId, vendors: [bad] });
    const passAfter = await rowsOf(h.clientId, { runId, vendors: [pass] });
    h.expect(sameJson(badBefore, badAfter), `V-BADGST's ${badBefore.length} row(s) unchanged`);
    h.expect(passAfter.length > 0 && !passAfter.some((r) => passBefore.some((x) => x.id === r.id)), "V-PASS's rows rebuilt");
  });
S["B-15"] = async (h) =>
  h.guarded(async () => {
    const runAt = Date.now() + 2 * 60_000;
    const r = await h.trigger({ mode: "force", vendor_ids: [await h.role("V-NODOCS")], run_at: istIso(2 * 60_000) });
    const s0 = await h.status(r.data.run_id, r.data.job_id);
    h.expect(s0?.trigger?.state === "scheduled", `scheduled before run_at (got ${s0?.trigger?.state})`);
    const { s } = await h.wait(r.data, 8 * 60_000);
    const fired = Date.parse(s?.trigger?.fired_at ?? "");
    h.expect(s?.trigger?.state === "started", `started (got ${s?.trigger?.state})`);
    h.expect(Number.isFinite(fired) && fired >= runAt - 5_000 && fired - runAt <= 120_000, `fired within 2 minutes after run_at (fired ${s?.trigger?.fired_at}, ${Math.round((fired - runAt) / 1000)} s late)`);
  });
S["B-16"] = async (h) =>
  h.guarded(async () => {
    const a = await h.run({ mode: "force", vendor_limit: 3 });
    const b = await h.run({ mode: "force", vendor_limit: 3 });
    const want = (await eligibleIds(h.clientId, (await h.settings()).config.vendor_statuses ?? [])).slice(0, 3);
    h.expect(sameJson(a.s.trigger?.vendor_ids, b.s.trigger?.vendor_ids), `same vendors both times (${a.s.trigger?.vendor_ids} / ${b.s.trigger?.vendor_ids})`);
    h.expect(sameJson(a.s.trigger?.vendor_ids, want), `the 3 lowest eligible vendor ids (${want})`);
  });
S["B-19"] = async (h) =>
  h.guarded(async () => {
    // Two triggers for different vendors firing together: the second one's
    // QA reset deletes every queued RunWorker job of the run (delete_jobs
    // matches on run id only), which can drop the first trigger's run.
    const [a, b] = await h.roles("V-NODOCS", "V-NODOCS2");
    const at = istIso(90_000);
    const ta = await h.trigger({ mode: "force", vendor_ids: [a], run_at: at });
    const tb = await h.trigger({ mode: "force", vendor_ids: [b], run_at: at });
    const [ra, rb] = [await h.wait(ta.data, 6 * 60_000), await h.wait(tb.data, 6 * 60_000)];
    h.expect(!ra.timedOut && ra.s?.complete, `first trigger (vendor ${a}) completes (state ${ra.s?.trigger?.state}, complete ${ra.s?.complete}, rows ${ra.s?.total_rows})`);
    h.expect(!rb.timedOut && rb.s?.complete, `second trigger (vendor ${b}) completes (state ${rb.s?.trigger?.state}, complete ${rb.s?.complete})`);
  });

// ── C. coverage ───────────────────────────────────────────────────────
S["C-01"] = async (h) =>
  h.guarded(async () => {
    const statuses: string[] = (await h.settings()).config.vendor_statuses ?? [];
    const { s } = await h.run({ mode: "force", vendor_limit: 3 });
    const ids: number[] = s.trigger?.vendor_ids ?? [];
    const f = await finalsOf(h.clientId, ids);
    const allowed = statuses.map((st) => BSCM_STATUS[st]);
    h.expect(ids.length > 0 && ids.every((v) => allowed.includes(f.get(v)!.linkStatus)), `every chosen vendor is linked in a configured status (${statuses.join(", ")}): ${ids.map((v) => `${v}:${f.get(v)?.linkStatus}`).join(", ")}`);
  });
S["C-05"] = async (h) =>
  h.guarded(async () => {
    let tried = 0;
    for (const st of (await h.settings()).config.vendor_statuses ?? []) {
      let v: number;
      try {
        v = await h.role(`V-STATUS-${st}`);
      } catch {
        h.note(`no eligible vendor linked as ${st}`);
        continue;
      }
      tried++;
      const { s } = await h.run({ mode: "force", vendor_ids: [v] });
      h.expect(s.total_rows > 0 && s.finished_vendors === 1, `${st}: rows created and the vendor finished (rows ${s.total_rows})`);
    }
    if (!tried) throw new NotRunnable("no eligible vendor in the configured statuses");
  });
const miscPan: Scenario = async (h) =>
  h.guarded(async () => {
    const v = await h.role("V-MISC");
    await h.putConfig(h.withDocs({ pan: { paths: ["company.misc.pan"], frequency: "yearly", start_date: h.today } }));
    const { s } = await h.run({ mode: "force", vendor_ids: [v] });
    const rows = await rowsOf(h.clientId, { runId: s.run_id, vendors: [v] });
    const want = (await q(`SELECT trim(misc #>> '{pan}') p FROM companies WHERE id = $1`, [v]))[0]?.p;
    h.expect(rows.length === 1 && rows[0].doc === "pan", `one PAN row for the bulk-uploaded vendor (got ${rows.length})`);
    h.expect(rows[0]?.value === want, `value read from company misc.pan (${rows[0]?.value === want ? "same" : `row ${rows[0]?.value} vs misc ${want}`})`);
  });
S["C-06"] = miscPan;
S["D-09"] = miscPan;

// ── D. reading values ────────────────────────────────────────────────
/** run one vendor under the original config (or a document override) and return its rows */
async function runOne(h: H, role: string, validations?: Record<string, any>) {
  const v = await h.role(role);
  if (validations) await h.putConfig(h.withDocs(validations));
  else if (!(await eligibleUnder(h.clientId, h.original.config?.vendor_statuses ?? [])).has(v))
    throw new NotRunnable(`test vendor ${role} (${v}) is not in a link status the client's settings check`);
  const { s, t } = await h.run({ mode: "force", vendor_ids: [v] });
  const rows = await rowsOf(h.clientId, { runId: s.run_id, vendors: [v] });
  const final = (await finalsOf(h.clientId, [v])).get(v);
  h.sums(s);
  return { v, s, t, rows, final };
}
S["D-01"] = async (h) =>
  h.guarded(async () => {
    const { rows, final } = await runOne(h, "V-NODOCS");
    h.expect(rows.length > 0 && rows.every((r) => r.status === "skipped" && r.error === NOT_PROVIDED), `every row skipped 'not provided' (${rows.map((r) => `${r.doc}:${r.status}`).join(", ")})`);
    h.expect(final?.status === "skipped", `final status skipped (got ${final?.status})`);
  });
S["D-03"] = async (h) =>
  h.guarded(async () => {
    const { rows } = await runOne(h, "V-MSMELINK", { msme: { paths: ["company.misc.msme_registration_number"], frequency: "one_time", start_date: h.today } });
    h.expect(rows.length === 1 && rows[0].status === "skipped" && rows[0].error === NOT_PROVIDED, `a link in the MSME field counts as no value → skipped 'not provided' (got ${rows.map((r) => `${r.status} '${r.error}' value ${r.value}`).join(", ")})`);
  });
S["D-04"] = async (h) =>
  h.guarded(async () => {
    const { rows } = await runOne(h, "V-BANKHALF", { bank: { paths: [{ bank_account_no: "company.misc.bank_account_number", ifsc: "company.misc.bank_ifsc_code" }], frequency: "quarterly", start_date: h.today } });
    h.expect(rows.length === 1 && rows[0].status === "skipped" && rows[0].error === NOT_PROVIDED, `bank with an account but no IFSC → skipped 'not provided' (got ${rows.map((r) => `${r.status} '${r.error}'`).join(", ")})`);
  });
const companyGst = async (v: number) => (await q(`SELECT trim(gst_no) g, trim(pan_no) p FROM companies WHERE id = $1`, [v]))[0];
S["D-05"] = async (h) =>
  h.guarded(async () => {
    const { rows, v } = await runOne(h, "V-COMPANYGST", { gst: { paths: ["company.gst_number_wrong", "company.gst_no"], frequency: "quarterly", start_date: h.today } });
    const c = await companyGst(v);
    h.expect(rows.length === 1 && rows[0].value === c.g, `a column that does not exist is skipped over; GST read from company.gst_no (row ${rows[0]?.value}, company ${c.g})`);
    h.expect(rows[0]?.status !== "system_error", `no error from the missing column (status ${rows[0]?.status})`);
  });
S["D-06"] = async (h) =>
  h.guarded(async () => {
    const { rows, v } = await runOne(h, "V-COMPANYGST", { gst: { paths: ["company.gst_no", "company.pan_no"], frequency: "quarterly", start_date: h.today } });
    const c = await companyGst(v);
    h.expect(rows.length === 1 && rows[0].value === c.g, `first path with a value wins: gst_no ${c.g}, not pan_no (row ${rows.map((r) => r.value).join(", ")})`);
  });
S["D-07"] = async (h) =>
  h.guarded(async () => {
    const { rows, v } = await runOne(h, "V-COMPANYGST", { gst: { paths: ["form.qa_platform_no_such_field", "company.gst_no"], frequency: "quarterly", start_date: h.today } });
    const c = await companyGst(v);
    h.expect(rows.length === 1 && rows[0].value === c.g, `empty form field → falls to company.gst_no (row ${rows[0]?.value}, company ${c.g})`);
  });
S["D-08"] = async (h) =>
  h.guarded(async () => {
    const { rows } = await runOne(h, "V-2GST");
    const gst = rows.filter((r) => r.doc === "gst");
    h.expect(gst.length >= 2 && sameJson(gst.map((r) => r.valueIndex), gst.map((_, i) => i)), `one gst row per value, value_index 0..${gst.length - 1} (got ${gst.map((r) => r.valueIndex)})`);
  });
S["D-12"] = async (h) =>
  h.guarded(async () => {
    const { rows, v } = await runOne(h, "V-SPACES", { gst: { paths: ["company.gst_no"], frequency: "quarterly", start_date: h.today } });
    const raw = (await q(`SELECT gst_no g FROM companies WHERE id = $1`, [v]))[0]?.g;
    h.expect(rows[0]?.value === String(raw).trim(), `stored as trimmed '${String(raw).trim()}' (got '${rows[0]?.value}')`);
  });
S["D-13"] = async (h) =>
  h.guarded(async () => {
    const v = await h.role("V-PASS");
    const snap = async () => JSON.stringify({
      forms: await q(`SELECT id, status, approval_status, updated_at FROM template_responses WHERE company_id = $1 ORDER BY id`, [v]),
      link: await q(`SELECT status, updated_at FROM buyer_seller_company_mappings WHERE client_company_id = $1 AND dealing_with_company_id = $2`, [h.clientId, v]).then((r) => r.map((x: any) => x.status)),
      company: await q(`SELECT gst_no, pan_no, misc FROM companies WHERE id = $1`, [v]),
    });
    const before = await snap();
    await h.run({ mode: "force", vendor_ids: [v] });
    h.expect(before === (await snap()), "the vendor's onboarding forms, link status and company record are unchanged by the run");
  });

// ── E. documents ──────────────────────────────────────────────────────
const formatMsg = (doc: string) => `${doc.toUpperCase()} input is incorrect`;
S["E-01"] = async (h) =>
  h.guarded(async () => {
    const { rows, final, v } = await runOne(h, "V-BADGST");
    const bad = rows.filter((r) => r.doc === "gst" && r.status === "failed");
    h.expect(bad.length > 0, `gst failed (${rows.filter((r) => r.doc === "gst").map((r) => `${r.status} '${r.error}'`).join(", ")})`);
    h.expect(final?.status === "failed", `vendor Failed (got ${final?.status})`);
    const listed = await listedRow(h, v);
    h.expect(!!listed && bad.every((r) => listed.vendor_validation_errors?.includes(errorLine(r))), `listing shows '${bad.map(errorLine).join("; ")}' (shows '${listed?.vendor_validation_errors}')`);
  });
const formatCase = (role: string, doc: string, paths: string[]): Scenario => async (h) =>
  h.guarded(async () => {
    const { rows } = await runOne(h, role, { [doc]: { paths, frequency: "yearly", start_date: h.today } });
    h.expect(rows.length === 1 && rows[0].status === "failed" && rows[0].error === formatMsg(doc), `${doc} from ${paths[0]} ('${rows[0]?.value}') fails the format pre-check with '${formatMsg(doc)}' (got ${rows[0]?.status} '${rows[0]?.error}')`);
  });
S["E-02"] = formatCase("V-COMPANYPAN", "gst", ["company.pan_no"]);
S["E-06"] = formatCase("V-FOREIGN", "gst", ["company.gst_no"]);
S["E-08"] = formatCase("V-COMPANYGST", "pan", ["company.gst_no"]);
S["E-09"] = formatCase("V-COMPANYPAN", "msme", ["company.pan_no"]);
S["E-04"] = async (h) =>
  h.guarded(async () => {
    const { rows, final, v } = await runOne(h, "V-2GST-MIXED");
    const gst = rows.filter((r) => r.doc === "gst");
    h.expect(gst.some((r) => r.status === "passed") && gst.some((r) => r.status === "failed"), `one GST passed, one failed (${gst.map((r) => r.status)})`);
    h.expect(final?.status === "failed", `vendor Failed (got ${final?.status})`);
    const listed = await listedRow(h, v);
    const passed = gst.filter((r) => r.status === "passed");
    h.expect(!!listed && passed.every((r) => !listed.vendor_validation_errors?.includes(String(r.value))), "the error names only the bad GST");
  });
const failsDoc = (role: string, doc: string): Scenario => async (h) =>
  h.guarded(async () => {
    const { rows, final } = await runOne(h, role);
    const d = rows.filter((r) => r.doc === doc);
    h.expect(d.some((r) => r.status === "failed"), `${doc} failed (${d.map((r) => `${r.status} '${r.error}'`).join(", ")})`);
    h.expect(final?.status === "failed", `vendor Failed (got ${final?.status})`);
  });
S["E-07"] = failsDoc("V-BADPAN", "pan");
S["E-10"] = failsDoc("V-BANKFAIL", "bank");
S["E-12"] = async (h) =>
  h.guarded(async () => {
    const { rows, final, v } = await runOne(h, "V-PASS");
    h.expect(rows.length > 0 && rows.every((r) => r.status === "passed"), `every row passed (${rows.map((r) => `${r.doc}:${r.status}${r.error ? ` '${r.error}'` : ""}`).join(", ")})`);
    h.expect(final?.status === "passed", `vendor Passed (got ${final?.status})`);
    const listed = await listedRow(h, v);
    h.expect(listed?.vendor_validation_status === "Passed" && !listed?.vendor_validation_errors, `listing: Passed, no errors (got '${listed?.vendor_validation_status}' / '${listed?.vendor_validation_errors}')`);
  });

// ── F. provider trouble (only the one the API can stage) ─────────────
S["F-10"] = async (h) =>
  h.guarded(async () => {
    await h.putConfig(h.silent());
    const ids = await h.roles("V-NODOCS", "V-NODOCS2", "V-NODOCS3", "V-NODOCS4", "V-NODOCS5");
    const r = await h.trigger({ mode: "force", vendor_ids: ids });
    // vendor jobs are spread 2 s apart; switching off now lands mid-run
    await sleep(1500);
    await h.putConfig({ ...h.silent(), enabled: false });
    const until = Date.now() + 4 * 60_000;
    let rows: Row[] = [];
    while (Date.now() < until) {
      rows = await rowsOf(h.clientId, { runId: r.data.run_id, vendors: ids });
      if (rows.length && !rows.some((x) => x.status === "pending")) break;
      await sleep(10_000);
    }
    const s = await h.status(r.data.run_id, r.data.job_id);
    if (s?.trigger?.state === "disabled") throw new NotRunnable("the switch-off landed before the trigger fired (state disabled) — nothing ran to interrupt");
    const closed = rows.filter((x) => x.status === "system_error");
    h.expect(!rows.some((x) => x.status === "pending"), `no row left pending (${rows.length} rows)`);
    h.expect(closed.length > 0 && closed.every((x) => x.error === SYSTEM_ERROR), `rows not yet checked closed as system_error '${SYSTEM_ERROR}' (${closed.length} of ${rows.length})`);
    const f = await finalsOf(h.clientId, ids);
    h.note(`final status after the switch-off: ${ids.map((v) => `${v}:${f.get(v)?.status ?? "none"}`).join(", ")}`);
  });
S["F-16"] = async (h) =>
  h.guarded(async () => {
    await h.putConfig(h.silent());
    const ids = await h.roles("V-NODOCS", "V-NODOCS2", "V-NODOCS3", "V-NODOCS4", "V-NODOCS5");
    const r = await h.trigger({ mode: "force", vendor_ids: ids });
    await sleep(1500);
    await h.putConfig({ ...h.silent(), enabled: false });
    await sleep(60_000);
    const s = await h.status(r.data.run_id, r.data.job_id);
    if (s?.trigger?.state === "disabled") throw new NotRunnable("the switch-off landed before the trigger fired");
    const rows = await rowsOf(h.clientId, { runId: r.data.run_id, vendors: ids });
    const f = await finalsOf(h.clientId, ids);
    const cut = [...new Set(rows.filter((x) => x.status === "system_error").map((x) => x.vendor))];
    h.expect(cut.length > 0, "some vendors were cut off by the switch-off");
    h.expect(cut.every((v) => f.get(v)?.status != null), `every vendor whose rows were closed has a final status (${cut.map((v) => `${v}:${f.get(v)?.status ?? "none — the listing shows Pending"}`).join(", ")})`);
  });

// ── G. final status ──────────────────────────────────────────────────
S["G-01"] = async (h) =>
  h.guarded(async () => {
    const { rows, final, v } = await runOne(h, "V-BANKFAIL");
    const bad = rows.filter((r) => r.status === "failed" || r.status === "system_error");
    h.expect(final?.status === precedence(rows.map((r) => r.status)), `final ${final?.status} = precedence of ${rows.map((r) => r.status).join(", ")}`);
    const listed = await listedRow(h, v);
    h.expect((listed?.vendor_validation_errors ?? "") === bad.map(errorLine).join("; "), `errors list only the bad rows: '${bad.map(errorLine).join("; ")}' (shows '${listed?.vendor_validation_errors}')`);
  });
S["G-02"] = async (h) =>
  h.guarded(async () => {
    const { rows, final, v } = await runOne(h, "V-PASS-SKIP");
    if (rows.some((r) => r.status === "failed" || r.status === "system_error")) throw new NotRunnable(`V-PASS-SKIP no longer passes (${rows.map((r) => `${r.doc}:${r.status}`)})`);
    h.expect(rows.some((r) => r.status === "skipped"), "at least one document skipped");
    h.expect(final?.status === "passed", `skipped never makes the vendor Failed: final passed (got ${final?.status})`);
    const listed = await listedRow(h, v);
    h.expect(!listed?.vendor_validation_errors, `skipped documents are not listed as errors (shows '${listed?.vendor_validation_errors}')`);
  });
S["G-06"] = async (h) =>
  h.guarded(async () => {
    const v = await h.role("V-BADPAN");
    const old = (await rowsOf(h.clientId, { vendors: [v] })).filter((r) => r.doc === "pan" && r.status === "failed" && r.runDate < h.today);
    if (!old.length) throw new NotRunnable("V-BADPAN has no failed PAN row from an earlier day");
    await h.putConfig(h.withDocs({ gst: { ...h.doc("gst"), frequency: "quarterly", start_date: h.today }, pan: { ...h.doc("pan"), frequency: "yearly", start_date: addDays(h.today, -10) } }));
    const { s } = await h.run({ mode: "scheduler", vendor_ids: [v] });
    h.expect(sameJson(Object.keys(s.by_doc_type ?? {}), ["gst"]), `only gst was due today (by_doc_type ${Object.keys(s.by_doc_type ?? {}).join(", ")})`);
    const f = (await finalsOf(h.clientId, [v])).get(v);
    h.expect(f?.status === "failed", `final stays Failed because PAN's latest row (${old.at(-1)!.runDate}) failed (got ${f?.status})`);
  });
S["G-07"] = async (h) =>
  h.guarded(async () => {
    const { final, s } = await runOne(h, "V-PASS");
    const fired = Date.parse(s.trigger?.fired_at ?? "");
    const lv = Date.parse(final?.lastValidatedAt ?? "");
    h.expect(final?.status === "passed", `final Passed (got ${final?.status})`);
    h.expect(Number.isFinite(lv) && lv % 1000 === 0 && Math.abs(lv - fired) <= 2000, `last validated = this run's start (${final?.lastValidatedAt} vs trigger fired ${s.trigger?.fired_at})`);
  });
S["G-17"] = async (h) =>
  h.guarded(async () => {
    // A document removed from the config after it failed: the listing drops
    // its error line, but the vendor's final status is not recomputed.
    const v = await h.role("V-BADPAN");
    const docs = Object.keys(h.original.config.validations ?? {});
    if (!docs.includes("pan")) throw new NotRunnable("PAN is not in the client's config");
    const before = await listedRow(h, v);
    await h.putConfig({ ...h.original.config, validations: Object.fromEntries(Object.entries(h.original.config.validations).filter(([d]) => d !== "pan")) });
    const after = await listedRow(h, v);
    const exp = await expectedListing(h, v, docs.filter((d) => d !== "pan"));
    const worked = precedence(exp.rows.map((r) => r.status));
    h.note(`before: '${before?.vendor_validation_status}' / '${before?.vendor_validation_errors}'`);
    h.expect(after?.vendor_validation_status === LABEL[worked], `with PAN out of the config the shown status matches the remaining documents (${LABEL[worked]}) — shows '${after?.vendor_validation_status}' with errors '${after?.vendor_validation_errors}'`);
  });

// ── H / I. the listing, read with the client's own session ──────────
async function revalOn(h: H) {
  const c = await configuredDocs(h.clientId);
  if (!c.enabled) throw new NotRunnable(`revalidation is off for client ${h.clientId}`);
  return c;
}
S["H-01"] = async (h) => {
  const c = await configuredDocs(h.clientId);
  if (c.enabled) throw new NotRunnable(`revalidation is on for client ${h.clientId}; run this case on a client with it off (e.g. 198678)`);
  const { list, status } = await listing(h, "tab=verified&page=1");
  h.expect(status === 200 && list.length > 0, `listing answered (${status}, ${list.length} vendors)`);
  h.expect(list.every((x) => !("vendor_validation_status" in x) && !("vendor_validation_errors" in x) && !("vendor_last_validated_at" in x)), "no validation fields on any vendor");
};
S["H-02"] = async (h) => {
  await revalOn(h);
  const v = await h.role("V-NEVER");
  const row = await listedRow(h, v);
  if (!row) throw new NotRunnable(`vendor ${v} not found in its listing tab`);
  h.expect(row.vendor_last_validated_at === "" && row.vendor_validation_errors === "", `no date and no errors (got '${row.vendor_last_validated_at}' / '${row.vendor_validation_errors}')`);
  h.expect(row.vendor_validation_status === "", `status blank for a vendor no run has checked (shows '${row.vendor_validation_status}')`);
};
S["H-04"] = async (h) => {
  await revalOn(h);
  for (const tab of ["verified", "unverified", "onboarding_in_progress", "rejected"]) {
    const { list, status } = await listing(h, `tab=${tab}&page=1`);
    const missing = list.filter((x) => !("vendor_validation_status" in x && "vendor_last_validated_at" in x && "vendor_validation_errors" in x));
    h.expect(status === 200 && missing.length === 0, `${tab}: all three columns on every vendor (${list.length} vendors, ${missing.length} without)`);
  }
};
S["H-05"] = async (h) => {
  const c = await revalOn(h);
  const { list } = await listing(h, "tab=verified&page=1");
  let compared = 0;
  const off: string[] = [];
  for (const x of list) {
    const v = Number(x.id);
    if (!v) continue;
    const exp = await expectedListing(h, v, c.docs);
    compared++;
    if (x.vendor_validation_status !== exp.label) off.push(`${v}: status '${x.vendor_validation_status}' ≠ '${exp.label}'`);
    if ((x.vendor_validation_errors ?? "") !== exp.errors) off.push(`${v}: errors '${short(x.vendor_validation_errors, 80)}' ≠ '${short(exp.errors, 80)}'`);
  }
  h.expect(compared > 0, `compared ${compared} vendor(s)`);
  h.expect(!off.length, off.length ? `${off.length} mismatch(es): ${off.slice(0, 5).join(" · ")}` : "status and errors match the rows for every vendor on the page");
};
S["H-09"] = async (h) => {
  const c = await revalOn(h);
  const v = await h.role("V-MULTIFAIL").catch(() => h.role("V-BADGST"));
  // the vendor page is companies#show; vendor_detail answers 500 for every vendor (REV-15)
  const r = await h.call("session", "GET", `/api/companies/${v}`, undefined, { appVersion: "1.0.0" });
  const rd = r.data?.revalidation_data ?? r.data?.company?.revalidation_data;
  h.expect(r.status === 200 && !!rd, `vendor page carries revalidation_data (HTTP ${r.status})`);
  const exp = await latestRows(h.clientId, [v], c.docs);
  for (const row of exp) {
    const got = (rd?.documents?.[row.doc] ?? []).find((d: any) => d.value === row.value);
    h.expect(!!got && got.status === row.status && (got.error_message ?? null) === (row.status === "skipped" ? null : row.error), `${row.doc} ${row.value ?? "(none)"}: ${row.status}${row.status === "skipped" ? ", no error shown" : ` '${row.error}'`} (page shows ${short(got, 120)})`);
  }
};
S["H-10"] = async (h) => {
  await revalOn(h);
  const r = await h.call("session", "GET", "/api/companies/all_vendors?tab=verified&download_excel=true");
  const url = r.data?.report_url;
  if (!url) throw new Error(`no report_url (HTTP ${r.status} ${short(r.data, 160)})`);
  const XLSX = await import("xlsx");
  const buf = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(60_000) })).arrayBuffer());
  const wb = XLSX.read(buf);
  const grid: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const hi = grid.findIndex((row) => row.some((c) => /validation status/i.test(String(c))));
  const head = grid[hi] ?? [];
  const si = head.findIndex((c) => /validation status/i.test(String(c)));
  const ei = head.findIndex((c) => /validation errors?/i.test(String(c)));
  h.expect(si >= 0 && ei >= 0, `Excel has Validation Status and Validation Errors columns (header: ${short(head.join(" | "), 200)})`);
  const multi = grid.slice(hi + 1).map((row) => String(row[ei] ?? "")).filter((e) => e.includes("; ") || e.includes("\n"));
  if (multi.length) h.expect(multi.every((e) => !e.includes("; ")), `errors one per line (found ${multi.filter((e) => e.includes("; ")).length} cell(s) joined with "; ", e.g. '${short(multi[0], 120)}')`);
  else h.note("no vendor on this tab has more than one error line, so 'one per line' could not be seen");
};
S["H-12"] = async (h) => {
  await revalOn(h);
  const times: number[] = [];
  for (let i = 0; i < 3; i++) times.push((await listing(h, `tab=verified&page=1&${i ? `x=${i}` : ""}`)).ms);
  const med = times.sort((a, b) => a - b)[1];
  h.expect(med <= 5000, `listing page loads in ≤ 5 s (median ${med} ms of ${times.join(", ")})`);
};
const errorsFor = (role: string, what: string, check: (listed: ListedVendor, rows: Row[]) => [boolean, string]): Scenario => async (h) => {
  const c = await revalOn(h);
  const v = await h.role(role);
  const listed = await listedRow(h, v);
  if (!listed) throw new NotRunnable(`vendor ${v} not found in its listing tab`);
  const rows = await latestRows(h.clientId, [v], c.docs);
  const [ok, msg] = check(listed, rows);
  h.expect(ok, `${what}: ${msg}`);
};
S["G-03"] = errorsFor("V-NODOCS", "skipped is not an error", (l) => [!l.vendor_validation_errors, `errors '${l.vendor_validation_errors}', status '${l.vendor_validation_status}'`]);
S["G-08"] = errorsFor("V-BADGST", "error line format", (l, rows) => {
  const bad = rows.filter((r) => r.doc === "gst" && r.status === "failed");
  return [bad.length > 0 && bad.every((r) => (l.vendor_validation_errors ?? "").includes(`GST ${r.value}: ${r.error}`)), `want '${bad.map((r) => `GST ${r.value}: ${r.error}`).join("; ")}', shows '${l.vendor_validation_errors}'`];
});
S["G-09"] = errorsFor("V-MULTIFAIL", "one error line per bad row", (l, rows) => {
  const bad = rows.filter((r) => r.status === "failed" || r.status === "system_error");
  const shown = (l.vendor_validation_errors ?? "").split("; ").filter(Boolean);
  return [shown.length === bad.length, `${bad.length} bad row(s), ${shown.length} line(s) shown`];
});
const PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
S["I-01"] = errorsFor("V-BADPAN", "PAN masked on screen", (l, rows) => {
  const pan = rows.find((r) => r.doc === "pan" && r.status === "failed");
  const shown = l.vendor_validation_errors ?? "";
  return [!!pan && !shown.includes(String(pan.value)) && !PAN_RE.test(shown), `the listing shows '${shown}'`];
});
S["I-02"] = errorsFor("V-BANKFAIL", "bank account masked on screen", (l, rows) => {
  const bank = rows.find((r) => r.doc === "bank" && r.status === "failed");
  const acct = String(bank?.value ?? "").split(" / ")[0];
  return [!!bank && !(l.vendor_validation_errors ?? "").includes(acct), `the listing shows '${l.vendor_validation_errors}'`];
});
S["I-03"] = async (h) => {
  // Compared with the values stored on the rows, not a PAN-shaped pattern:
  // a malformed PAN (the very one that failed) would slip past a regex.
  const c = await revalOn(h);
  let looked = 0;
  for (const role of ["V-BADPAN", "V-BANKFAIL"]) {
    const v = await h.role(role).catch(() => null);
    if (!v) continue;
    const r = await h.call("session", "GET", `/api/companies/${v}`, undefined, { appVersion: "1.0.0" });
    const rd = r.data?.revalidation_data ?? r.data?.company?.revalidation_data;
    h.expect(r.status === 200 && !!rd, `${role}: vendor page answered with revalidation_data (${r.status})`);
    const stored = (await latestRows(h.clientId, [v], c.docs)).filter((x) => (x.doc === "pan" || x.doc === "bank") && (x.value ?? "").length > 4);
    const shown = JSON.stringify(rd ?? {});
    const full = stored.filter((x) => shown.includes(String(x.value).split(" / ")[0]));
    looked += stored.length;
    h.expect(!full.length, `${role}: no full PAN or account number in the API response (${full.map((x) => `${x.doc.toUpperCase()} ${x.value}`).join(", ") || "none"} shown in full)`);
  }
  if (!looked) throw new NotRunnable("no PAN or bank value found to look for");
};
S["I-10"] = async (h) =>
  h.guarded(async () => {
    const rowsBefore = Number((await q(`SELECT count(*) n FROM vendor_validation_histories WHERE client_company_id = $1`, [h.clientId]))[0].n);
    const linksBefore = JSON.stringify(await q(`SELECT dealing_with_company_id, status FROM buyer_seller_company_mappings WHERE client_company_id = $1 ORDER BY 1`, [h.clientId]));
    await h.putConfig({ ...h.original.config, enabled: false });
    const got = await h.getConfig();
    h.expect(got.enabled === false, "GET says enabled false");
    const { list } = await listing(h, "tab=verified&page=1");
    h.expect(list.length > 0 && list.every((x) => !("vendor_validation_status" in x)), "the listing drops the validation columns");
    const rowsAfter = Number((await q(`SELECT count(*) n FROM vendor_validation_histories WHERE client_company_id = $1`, [h.clientId]))[0].n);
    h.expect(rowsAfter >= rowsBefore, `old rows kept (${rowsBefore} → ${rowsAfter})`);
    const linksAfter = JSON.stringify(await q(`SELECT dealing_with_company_id, status FROM buyer_seller_company_mappings WHERE client_company_id = $1 ORDER BY 1`, [h.clientId]));
    h.expect(linksBefore === linksAfter, "every vendor's onboarding (link) status unchanged");
  });

// ── G-14 / G-15: the run status endpoint against the rows ───────────
S["G-14"] = async (h) => {
  const run = await latestRun(h.clientId);
  if (!run) throw new NotRunnable("no run for this client yet");
  const r = await h.qa(readAs(), "GET", `/runs/${run.runId}`);
  const rows = await rowsOf(h.clientId, { runId: run.runId });
  h.sums(r.data);
  h.expect(r.data?.total_rows === rows.length, `total_rows ${r.data?.total_rows} = ${rows.length} rows in the database`);
  const pendingVendors = new Set(rows.filter((x) => x.status === "pending").map((x) => x.vendor)).size;
  const vendors = new Set(rows.map((x) => x.vendor)).size;
  h.expect(r.data?.vendors === vendors && r.data?.finished_vendors === vendors - pendingVendors, `vendors ${r.data?.vendors}/${vendors}, finished ${r.data?.finished_vendors}/${vendors - pendingVendors}`);
  h.expect(r.data?.complete === (rows.length > 0 && !pendingVendors), `complete ${r.data?.complete}`);
  return `run ${run.date}`;
};
S["G-15"] = async (h) => {
  const run = await latestRun(h.clientId);
  if (!run) throw new NotRunnable("no run for this client yet");
  const r = await h.qa(readAs(), "GET", `/runs/${run.runId}`);
  const top: any[] = r.data?.top_errors ?? [];
  const want = await q(`SELECT doc_type d, status s, error_message e, count(*)::int n FROM vendor_validation_histories WHERE run_id = $1::uuid AND status IN (2, 4)
     GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 10`, [run.runId]);
  h.expect(top.length === want.length && top.length <= 10, `${top.length} entries (database: ${want.length}, cap 10)`);
  h.expect(top.every((t, i) => i === 0 || top[i - 1].count >= t.count), "sorted by count, largest first");
  const key = (d: string, s: string, e: string) => `${d}/${s}/${e}`;
  const db = new Map(want.map((w: any) => [key(DOC[w.d], ROW_STATUS[w.s], w.e), w.n]));
  const off = top.filter((t) => db.get(key(t.doc_type, t.status, t.error_message)) !== t.count);
  h.expect(!off.length, `every entry's doc_type, status, message and count match the rows${off.length ? ` (off: ${short(off, 160)})` : ""}`);
};

// ── R. audits of the runs already recorded (SELECT only) ────────────
async function auditRun(h: H) {
  const run = await latestRun(h.clientId);
  if (!run) throw new NotRunnable("no run recorded for this client");
  const rows = await rowsOf(h.clientId, { runId: run.runId });
  h.note(`run ${run.date} (${run.runId}): ${rows.length} rows, ${new Set(rows.map((r) => r.vendor)).size} vendors`);
  return { run, rows };
}
S["R-01"] = async (h) => {
  const runs = await q(`SELECT DISTINCT run_id::text r, to_char(run_scheduled_on, 'YYYY-MM-DD') d FROM vendor_validation_histories WHERE client_company_id = $1`, [h.clientId]);
  if (!runs.length) throw new NotRunnable("no run recorded");
  const off = runs.filter((x: any) => x.r !== runIdFor(h.clientId, x.d));
  h.expect(!off.length, `every run id = uuid v5('procol://vendor_revalidation/${h.clientId}/<date>') (${runs.length} run(s)${off.length ? `, off: ${short(off, 160)}` : ""})`);
};
S["R-02"] = async (h) => {
  const dups = await q(`SELECT run_id, vendor_company_id, doc_type, value, count(*) n FROM vendor_validation_histories WHERE client_company_id = $1
     GROUP BY 1, 2, 3, 4 HAVING count(*) > 1 LIMIT 5`, [h.clientId]);
  h.expect(!dups.length, `no document value checked twice in one run for one vendor${dups.length ? ` (e.g. ${short(dups, 200)})` : ""}`);
};
S["R-03"] = async (h) => {
  const { run } = await auditRun(h);
  const c = await configuredDocs(h.clientId);
  const vs = (await q(`SELECT dealing_with_company_id v FROM buyer_seller_company_mappings WHERE client_company_id = $1 AND vendor_validation_run_id = $2::uuid`, [h.clientId, run.runId])).map((x: any) => x.v);
  const rows = await latestRows(h.clientId, vs, c.docs);
  const finals = await finalsOf(h.clientId, vs);
  const by = new Map<number, string[]>();
  for (const r of rows) by.set(r.vendor, [...(by.get(r.vendor) ?? []), r.status]);
  const off = vs.filter((v) => finals.get(v)?.status !== precedence(by.get(v) ?? []));
  h.expect(vs.length > 0, `${vs.length} vendor(s) finished by this run`);
  h.expect(!off.length, `final status = failed > system_error > passed > skipped over the latest rows for every vendor${off.length ? ` — ${off.length} differ, e.g. ${off.slice(0, 5).map((v) => `${v}: ${finals.get(v)?.status} vs ${precedence(by.get(v) ?? [])} (${by.get(v)})`).join(" · ")}` : ""}`);
};
S["R-04"] = async (h) => {
  const { rows } = await auditRun(h);
  const bad = (pred: (r: Row) => boolean) => rows.filter(pred);
  const sk = bad((r) => r.status === "skipped" && (r.error !== NOT_PROVIDED || (r.value ?? "") !== ""));
  const pa = bad((r) => r.status === "passed" && !!r.error);
  const fa = bad((r) => r.status === "failed" && !r.error);
  const se = bad((r) => r.status === "system_error" && r.error !== SYSTEM_ERROR);
  h.expect(!sk.length, `skipped rows: no value, 'not provided' (${sk.length} differ${sk.length ? `, e.g. ${short(sk[0], 160)}` : ""})`);
  h.expect(!pa.length, `passed rows carry no error (${pa.length} differ)`);
  h.expect(!fa.length, `failed rows carry a message (${fa.length} without)`);
  h.expect(!se.length, `system_error rows say '${SYSTEM_ERROR}' (${se.length} differ)`);
};
S["R-05"] = async (h) => {
  const old = await q(`SELECT count(*)::int n, ${TS("min(created_at)")} t FROM vendor_validation_histories WHERE client_company_id = $1 AND status = 0 AND created_at < now() - interval '25 hours'`, [h.clientId]);
  h.expect(old[0].n === 0, `no row pending for more than 25 hours (the sweeper closes them) — ${old[0].n} found${old[0].n ? `, oldest ${old[0].t}` : ""}`);
};
S["R-06"] = async (h) => {
  const { run, rows } = await auditRun(h);
  const start = rows.map((r) => r.createdAt).sort()[0];
  // the config in force when the run started, from the audit trail
  const v = await q(`SELECT object_changes oc, object o FROM versions WHERE item_type = 'CustomConfiguration'
      AND item_id = (SELECT id FROM custom_configurations WHERE config_key = 'vendor_revalidation_config' AND item_id = $1 ORDER BY id DESC LIMIT 1)
      AND created_at <= $2 ORDER BY id DESC LIMIT 1`, [h.clientId, start]);
  const m = [...String(v[0]?.oc ?? "").matchAll(/vendor_statuses\\?":\[([^\]]*)\]/g)].at(-1);
  if (!m) throw new NotRunnable("could not read the config in force at the run's start from the audit trail");
  const statuses = m[1].replace(/\\/g, "").split(",").map((s) => s.replace(/"/g, "").trim()).filter(Boolean);
  const eligible = await q(`SELECT b.dealing_with_company_id v FROM buyer_seller_company_mappings b JOIN companies c ON c.id = b.dealing_with_company_id
      WHERE ${ELIGIBLE} AND b.status = ANY($2::int[]) AND b.created_at < $3`, [h.clientId, statuses.map((s) => BSCM_STATUS[s]), start]);
  const inRun = new Set(rows.map((r) => r.vendor));
  const el = new Set(eligible.map((x: any) => x.v));
  if (inRun.size < el.size / 2) throw new NotRunnable(`run ${run.date} covered ${inRun.size} of ${el.size} eligible vendors — a QA run on chosen vendors, not a full run`);
  const missing = [...el].filter((x) => !inRun.has(x));
  const extra = [...inRun].filter((x) => !el.has(x));
  h.note(`statuses in force: ${statuses.join(", ")}`);
  h.expect(!missing.length, `every eligible vendor was checked (${missing.length} missing${missing.length ? `: ${missing.slice(0, 8).join(", ")}` : ""})`);
  h.expect(!extra.length, `no vendor outside the configured statuses / source / active companies (${extra.length} extra${extra.length ? `: ${extra.slice(0, 8).join(", ")}` : ""})`);
};
S["R-07"] = async (h) => {
  const { run, rows } = await auditRun(h);
  const start = Date.parse(rows.map((r) => r.createdAt).sort()[0]);
  if (start < LAST_VALIDATED_FIX) throw new NotRunnable(`run ${run.date} was made before d18f8ac4c9 (15 Oct, 16:58 IST), when last validated was the vendor's last check time`);
  const f = await q(`SELECT dealing_with_company_id v, ${TS("vendor_last_validated_at")} t FROM buyer_seller_company_mappings WHERE client_company_id = $1 AND vendor_validation_run_id = $2::uuid`, [h.clientId, run.runId]);
  const first = new Map<number, number>();
  for (const r of rows) first.set(r.vendor, Math.min(first.get(r.vendor) ?? Infinity, Date.parse(r.createdAt)));
  const off = f.filter((x: any) => {
    const t = Date.parse(x.t);
    return t % 1000 !== 0 || t > (first.get(x.v) ?? 0) + 1000;
  });
  h.expect(!off.length, `last validated is the run's start (whole seconds, not after the vendor's first row) for ${f.length} vendor(s)${off.length ? ` — ${off.length} differ` : ""}`);
};
S["R-08"] = async (h) => {
  const { rows } = await auditRun(h);
  const g = new Map<string, number[]>();
  for (const r of rows) g.set(`${r.vendor}/${r.doc}`, [...(g.get(`${r.vendor}/${r.doc}`) ?? []), r.valueIndex]);
  const off = [...g.entries()].filter(([, ix]) => !sameJson([...ix].sort((a, b) => a - b), ix.map((_, i) => i)));
  h.expect(!off.length, `value_index runs 0..n-1 per vendor and document (${off.length} gap(s))`);
};
S["R-09"] = async (h) => {
  const { run, rows } = await auditRun(h);
  const done = new Set(rows.map((r) => r.vendor));
  for (const r of rows) if (r.status === "pending") done.delete(r.vendor);
  const f = await finalsOf(h.clientId, [...done]);
  const later = new Set((await q(`SELECT DISTINCT vendor_company_id v FROM vendor_validation_histories WHERE client_company_id = $1 AND run_scheduled_on > $2::date`, [h.clientId, run.date])).map((x: any) => x.v));
  const off = [...done].filter((v) => !later.has(v) && (f.get(v)?.runId !== run.runId || f.get(v)?.status == null));
  h.expect(!off.length, `every vendor with no pending row was finalised on its link (${done.size} vendors${off.length ? `; ${off.length} not, e.g. ${off.slice(0, 6).map((v) => `${v}:${f.get(v)?.status ?? "none"}`).join(", ")}` : ""})`);
};
S["C-09"] = async (h) => {
  const { run } = await auditRun(h);
  const r = await q(`SELECT c.category, count(DISTINCT c.id)::int n FROM vendor_validation_histories h JOIN companies c ON c.id = h.vendor_company_id
      WHERE h.run_id = $1::uuid GROUP BY 1`, [run.runId]);
  const hidden = r.filter((x: any) => ![1, 2, 4].includes(x.category));
  h.expect(!hidden.length, `every checked vendor is a selling firm, brokerage or subsidiary, so the listing can show it (${hidden.map((x: any) => `${x.n} of category ${x.category}`).join(", ") || "all are"})`);
};
S["C-10"] = async (h) => {
  const c = await configuredDocs(h.clientId);
  if (!c.enabled) throw new NotRunnable("revalidation is off for this client");
  const n = (await eligibleIds(h.clientId, c.statuses)).length;
  const minutes = Math.ceil((n * 60 * c.docs.length) / 30 / 60);
  h.expect(minutes <= 24 * 60, `${n} eligible vendors × ${c.docs.length} documents at 30 calls/min = ${minutes} min of spread, inside the 24-hour deadline`);
};
S["G-04"] = async (h) => {
  const c = await configuredDocs(h.clientId);
  const vs = (await q(`SELECT dealing_with_company_id v FROM buyer_seller_company_mappings WHERE client_company_id = $1 AND vendor_validation_run_id IS NOT NULL`, [h.clientId])).map((x: any) => x.v);
  const rows = await latestRows(h.clientId, vs, c.docs);
  const by = new Map<number, Set<string>>();
  for (const r of rows) by.set(r.vendor, (by.get(r.vendor) ?? new Set()).add(r.status));
  const mixed = [...by.entries()].filter(([, s]) => s.has("passed") && s.has("system_error") && !s.has("failed")).map(([v]) => v);
  if (!mixed.length) throw new NotRunnable("no vendor with passed + system_error (and no failure) in its latest rows");
  const f = await finalsOf(h.clientId, mixed);
  const off = mixed.filter((v) => f.get(v)?.status !== "system_error");
  h.expect(!off.length, `${mixed.length} vendor(s) with passed + system_error show System Error, not Passed${off.length ? ` (${off.length} differ)` : ""}`);
  h.note("the TRD expected Pass here (unverified never affects Pass); the build ranks system_error above passed — confirm with product");
};
S["G-05"] = async (h) => {
  const c = await configuredDocs(h.clientId);
  const vs = (await q(`SELECT dealing_with_company_id v FROM buyer_seller_company_mappings WHERE client_company_id = $1 AND vendor_validation_run_id IS NOT NULL`, [h.clientId])).map((x: any) => x.v);
  const rows = await latestRows(h.clientId, vs, c.docs);
  const by = new Map<number, Set<string>>();
  for (const r of rows) by.set(r.vendor, (by.get(r.vendor) ?? new Set()).add(r.status));
  const mixed = [...by.entries()].filter(([, s]) => s.has("failed") && s.has("system_error")).map(([v]) => v);
  if (!mixed.length) throw new NotRunnable("no vendor with failed + system_error in its latest rows");
  const f = await finalsOf(h.clientId, mixed);
  const off = mixed.filter((v) => f.get(v)?.status !== "failed");
  h.expect(!off.length, `${mixed.length} vendor(s) with failed + system_error show Failed${off.length ? ` (${off.length} differ)` : ""}`);
};
S["G-12"] = async (h) => {
  const runs = await q(`SELECT to_char(run_scheduled_on, 'YYYY-MM-DD') d, run_id::text r, ${TS("min(created_at)")} c0, ${TS("max(updated_at)")} u1, count(*)::int n
      FROM vendor_validation_histories WHERE client_company_id = $1 GROUP BY 1, 2 ORDER BY 1`, [h.clientId]);
  if (runs.length < 2) throw new NotRunnable(`only ${runs.length} run date recorded — needs runs on two dates`);
  h.expect(runs.every((r: any) => r.r === runIdFor(h.clientId, r.d)), `each date has its own run id (${runs.map((r: any) => `${r.d}:${r.n}`).join(", ")})`);
  const off = runs.slice(0, -1).filter((r: any, i: number) => Date.parse(r.u1) > Date.parse(runs[i + 1].c0));
  h.expect(!off.length, `an earlier day's rows were not changed once a later day's run began${off.length ? ` (${off.map((r: any) => r.d).join(", ")} changed later)` : ""}`);
};

// ── recorded nightly runs as evidence for the provider / schedule cases ──
const IST = (c: string) => `to_char(${c} at time zone 'UTC' at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')`;
async function recordedRuns(client: number) {
  return q(`SELECT run_id::text r, to_char(run_scheduled_on, 'YYYY-MM-DD') d, ${IST("min(created_at)")} started, ${IST("max(last_run_at)")} finished,
      count(*)::int rows, bool_or(partial_run) partial FROM vendor_validation_histories WHERE client_company_id = $1 GROUP BY 1, 2 ORDER BY 2`, [client]);
}
S["B-18"] = async (h) => {
  const runs = await recordedRuns(h.clientId);
  if (!runs.length) throw new NotRunnable("no run recorded for this client");
  const nightly = runs.filter((r: any) => /23:0[0-4]:/.test(r.started));
  h.note(`runs recorded: ${runs.map((r: any) => `${r.d} started ${r.started.slice(11)} IST (${r.rows} rows)`).join("; ")}`);
  h.expect(nightly.length > 0, `at least one run started at 23:00 IST, the nightly time — ${nightly.length ? nightly.map((r: any) => `${r.d} at ${r.started.slice(11)}`).join(", ") : "none did (" + runs.map((r: any) => r.started.slice(11)).join(", ") + ")"}`);
};
S["F-07"] = async (h) => {
  // rows the engine gave up on: how long after the run's start were they closed?
  const r = await q(`WITH r AS (SELECT run_id, min(created_at) t0 FROM vendor_validation_histories WHERE client_company_id = $1 GROUP BY 1)
      SELECT to_char(h.run_scheduled_on, 'YYYY-MM-DD') d, count(*)::int n, round(min(extract(epoch FROM (h.last_run_at - r.t0)) / 3600)::numeric, 1) min_h,
             round(max(extract(epoch FROM (h.last_run_at - r.t0)) / 3600)::numeric, 1) max_h, min(h.error_message) msg
        FROM vendor_validation_histories h JOIN r ON r.run_id = h.run_id WHERE h.client_company_id = $1 AND h.status = 4 GROUP BY 1 ORDER BY 1`, [h.clientId]);
  if (!r.length) throw new NotRunnable("no run with system_error rows recorded for this client");
  for (const x of r) {
    h.expect(x.msg === SYSTEM_ERROR, `${x.d}: the ${x.n} given-up rows say '${SYSTEM_ERROR}' (got '${x.msg}')`);
    h.expect(Number(x.min_h) >= 23.5 && Number(x.max_h) <= 25.5, `${x.d}: rows were given up 24 h after the run started (the documented deadline) — they were closed ${x.min_h}–${x.max_h} h after the start`);
  }
};
S["F-08"] = async (h) => {
  const late = await q(`WITH r AS (SELECT run_id, min(created_at) t0 FROM vendor_validation_histories WHERE client_company_id = $1 GROUP BY 1)
      SELECT count(*)::int n FROM vendor_validation_histories h JOIN r ON r.run_id = h.run_id WHERE h.client_company_id = $1 AND h.status = 0 AND now() > r.t0 + interval '25 hours'`, [h.clientId]);
  const runs = await recordedRuns(h.clientId);
  h.expect(late[0].n === 0, `no row is still pending 25 h after its run started — the cleaner closed them (${late[0].n} left)`);
  h.expect(runs.every((x: any) => x.finished), `every recorded run has finished (${runs.map((x: any) => `${x.d}: ${x.finished ? "finished " + x.finished.slice(11) + " IST" : "not finished"}`).join("; ")})`);
};
S["F-13"] = async (h) => {
  // a passed row = the provider answered (or the 24-hour cache did); GST has its own provider, the rest share Attestr
  const r = await q(`SELECT CASE WHEN doc_type = 1 THEN 'GST provider' ELSE 'Attestr (PAN/MSME/bank)' END p, to_char(last_run_at, 'YYYY-MM-DD HH24:MI') m, count(*)::int n
      FROM vendor_validation_histories WHERE client_company_id = $1 AND status = 1 GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 6`, [h.clientId]);
  if (!r.length) throw new NotRunnable("no passed rows recorded");
  const worst = r[0];
  h.note(`busiest minutes: ${r.map((x: any) => `${x.p} ${x.m} UTC: ${x.n}`).join("; ")}`);
  h.expect(Number(worst.n) <= 30, `no provider answered more than 30 checks in one minute (busiest: ${worst.p}, ${worst.n} in the minute of ${worst.m} UTC)${Number(worst.n) > 30 ? " — above the 30-per-minute cap unless those answers came from the 24-hour cache; the provider logs decide" : ""}`);
};
S["F-14"] = async (h) => {
  const waited = await q(`SELECT count(*)::int n, round(max(extract(epoch FROM (last_run_at - created_at)) / 3600)::numeric, 1) max_h FROM vendor_validation_histories
      WHERE client_company_id = $1 AND status = 1 AND last_run_at > created_at + interval '30 minutes'`, [h.clientId]);
  if (!waited[0].n) throw new NotRunnable("no recorded row waited more than 30 minutes before passing — no provider trouble to recover from in the data");
  const dups = await q(`SELECT count(*)::int n FROM (SELECT run_id, vendor_company_id, doc_type, value FROM vendor_validation_histories WHERE client_company_id = $1 GROUP BY 1, 2, 3, 4 HAVING count(*) > 1) d`, [h.clientId]);
  h.expect(true, `${waited[0].n} rows waited on the provider (up to ${waited[0].max_h} h) and then passed — the same rows, not new ones`);
  h.expect(dups[0].n === 0, `no duplicate row was created while waiting (${dups[0].n} duplicates)`);
};
S["F-01"] = async (h) => {
  const bad = await q(`SELECT count(*)::int n FROM vendor_validation_histories WHERE client_company_id = $1 AND status = 2 AND error_message = $2`, [h.clientId, SYSTEM_ERROR]);
  const waited = await q(`SELECT count(*)::int n FROM vendor_validation_histories WHERE client_company_id = $1 AND status IN (1, 2) AND last_run_at > created_at + interval '30 minutes'`, [h.clientId]);
  if (!waited[0].n) throw new NotRunnable("no recorded row waited on a provider");
  h.expect(bad[0].n === 0, `a provider wait never became 'Failed': no failed row carries the wait message (${bad[0].n} do); ${waited[0].n} rows waited more than 30 minutes and then got a real answer`);
};
S["F-11"] = async (h) => {
  const r = await q(`SELECT count(DISTINCT (a.run_id, a.vendor_company_id))::int n FROM vendor_validation_histories a WHERE a.client_company_id = $1 AND a.status = 4
      AND EXISTS (SELECT 1 FROM vendor_validation_histories b WHERE b.run_id = a.run_id AND b.vendor_company_id = a.vendor_company_id AND b.doc_type <> a.doc_type AND b.status IN (1, 2))`, [h.clientId]);
  if (!r[0].n) throw new NotRunnable("in the recorded runs no vendor had one document time out while another document got an answer");
  h.expect(true, `${r[0].n} vendor-runs had one document given up (System Error) while another document of the same vendor was answered — the other provider carried on`);
};

// ═══════════════════════════════════════════════════════════════════════
// wiring into the case library
// ═══════════════════════════════════════════════════════════════════════
const PRI: Record<string, string> = { Critical: "P0", High: "P1", Medium: "P2", Low: "P3" };

/** why a revalidation case will not run here, or null */
export function revalSkipReason(spec: RevalSpec): string | null {
  if (spec.tier === "ops") return null; // runs: a Procol employee token can save the settings (checked when the case runs)
  if (["dev", "manual", "ui", "code", "removed"].includes(spec.tier)) return spec.why ?? `${spec.tier} case — not run unattended`;
  if (!S[spec.key]) return `no runner for ${spec.key} yet`;
  return null;
}

export interface RevalCaseMeta { id: string; feature: string; title: string; severity: string; type: string; expectedResult: string; steps?: string[]; preconditions?: string; method: string; path: string }

/** a Check whose exec runs the scenario and decides the verdict itself */
export function makeRevalCheck(c: RevalCaseMeta, spec: RevalSpec, stamp: string): Check {
  const check: any = {
    id: c.id,
    flowId: c.feature,
    module: c.feature,
    scenario: c.title,
    type: /edge/i.test(c.type) ? "edge" : "functional",
    category: c.type,
    priority: PRI[c.severity] ?? "P2",
    severity: c.severity,
    expected: "accept",
    layer: "api",
    inputSummary: `${c.method} ${c.path} · ${spec.tier}${spec.needs?.length ? ` · ${spec.needs.join(", ")}` : ""}`,
    request: { method: c.method, path: c.path },
    expectedResult: c.expectedResult,
    steps: c.steps,
    preconditions: c.preconditions,
    revalTier: spec.tier,
  };
  check.exec = async (client: Client): Promise<CheckOutcome> => {
    const t0 = Date.now();
    const h = new H(client, spec.key, c.id, stamp);
    let v: { pass: boolean; verdict: string; inconclusive?: boolean };
    try {
      const summary = await S[spec.key](h);
      v = h.verdict(typeof summary === "string" ? summary : "");
    } catch (e) {
      const msg = (e as Error).message;
      const failed = h.verdict();
      // assertions that already failed stay a failure, whatever stopped the case after them
      v = !failed.pass && !/nothing was asserted/.test(failed.verdict)
        ? { pass: false, verdict: `${failed.verdict} · then: ${msg}` }
        : e instanceof NotRunnable
          ? { pass: false, inconclusive: true, verdict: `not run — ${msg}` }
          : { pass: false, inconclusive: true, verdict: `could not finish: ${msg}` };
    }
    if (h.ev.restore && /NOT RESTORED|CHECK BY HAND/.test(h.ev.restore)) v = { pass: false, inconclusive: true, verdict: `${v.verdict} — ⚠ ${h.ev.restore}` };
    const bug = !v.pass && !v.inconclusive ? revalBugForCase(spec.key) : undefined;
    h.ev.verdict = { pass: v.pass, inconclusive: v.inconclusive, text: v.verdict };
    if (bug) h.ev.bug = bug.id;
    let evidenceRef: string | undefined;
    try {
      const dir = join(REVAL_EVIDENCE_DIR, `reval-${stamp}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${spec.key}.json`), JSON.stringify(h.ev, null, 1));
      evidenceRef = `reval-${stamp}/${spec.key}`;
    } catch {
      /* evidence is best effort */
    }
    const roles = Object.entries(h.ev.roles).map(([n, r]) => `${n}=${r.id}`).join(", ");
    const out: any = {
      httpStatus: h.ev.calls.at(-1)?.status ?? null,
      accepted: v.pass,
      message: v.pass ? null : `${v.verdict}${roles ? ` [vendors: ${roles}]` : ""}`.slice(0, 600),
      durationMs: Date.now() - t0,
      verdictOverride: { ...v, verdict: `${v.verdict}${roles ? ` [vendors: ${roles}]` : ""}${h.ev.restore && h.ev.restore !== "nothing to restore" ? ` [after: ${h.ev.restore}]` : ""}` },
      ...(evidenceRef ? { evidenceRef } : {}),
    };
    if (bug) out.knownBug = { id: bug.id, sheet: "Vendor revalidation — QA platform (config/revalBugs.json)", title: bug.title, status: bug.status, reported: bug.found, priority: PRI[bug.severity] ?? "P2", blocker: bug.severity === "Critical" };
    return out;
  };
  return check as Check;
}

/** the scenario keys this runner implements (for the generator's coverage note) */
export const REVAL_SCENARIOS = Object.keys(S);
