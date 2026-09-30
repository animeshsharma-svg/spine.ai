/**
 * VENDOR BULK UPLOAD — the parts of a bulk case that are not the upload itself:
 *
 *   • who makes the request (the workspace admin, one of OUR OWN QA test
 *     vendors, or a workspace member confirmed to lack company:create_record);
 *   • the onboarding payload a few cases send beside the sheet;
 *   • the EVIDENCE RECORD every bulk case leaves behind — one JSON file per
 *     case execution under data/evidence/<run stamp>/<case id>.json, shaped as
 *     a database row (schema "vbu.evidence.v1") so it can move into the
 *     platform's database unchanged;
 *   • the bug registry (config/vbuBugs.json) that names the bug a failing case
 *     reproduces, with its cause and suggested fix.
 *
 * Database access here is SELECT only, like everywhere else in the platform.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as XLSX from "xlsx";

import type { Client } from "./engine.js";

const here = dirname(fileURLToPath(import.meta.url));
const PROCOL_TEST = join(here, "..", "..", "..", "procol test");
export const EVIDENCE_DIR = join(here, "..", "..", "data", "evidence");
const BUGS_FILE = join(here, "..", "..", "config", "vbuBugs.json");

const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);

// ── actors ───────────────────────────────────────────────────────────────

export interface ActorApi {
  api: any;
  userId: number;
  label: string;
  dispose: () => Promise<void>;
}

const actorCache = new Map<string, { at: number; p: Promise<ActorApi | { unavailable: string }> }>();
const ACTOR_TTL_MS = 20 * 60_000;

/**
 * The client to send a case's requests as.
 *
 *  seller-qa                 — a vendor user that one of OUR runs created
 *                              (qa_vbu_…@example.com, e.g. for a Status=rejected
 *                              row), signed in through the vendor app with the
 *                              sandbox OTP rule. Never a real supplier.
 *  member-no-company-create  — a live console session of one of OUR QA users
 *                              (qa_…@example.com) in the workspace whose
 *                              dashboard configuration shows no
 *                              company:create_record. Never a real employee's
 *                              session. Used only for requests the product must
 *                              refuse; sheets it sends are tripwired.
 */
export async function actorApi(client: Client, kind: string): Promise<ActorApi | { unavailable: string }> {
  const key = `${client.ctx.companyId}:${kind}`;
  // A signed-in actor is reused for a while (sessions expire, so not forever);
  // "unavailable" is never remembered — the next case asks again.
  const hit = actorCache.get(key);
  if (hit && Date.now() - hit.at < ACTOR_TTL_MS) return hit.p;
  const p = (kind === "seller-qa" ? qaSeller(client) : memberWithoutCreate(client)).catch((e) => ({ unavailable: (e as Error).message }));
  actorCache.set(key, { at: Date.now(), p });
  const got = await p;
  if ("unavailable" in got) actorCache.delete(key);
  return got;
}

async function qaSeller(client: Client): Promise<ActorApi | { unavailable: string }> {
  const { query } = await imp("db/pool.ts");
  const rows = await query(
    `select u.id, u.email from users u
       join user_company_mappings ucm on ucm.user_id = u.id and ucm.status = 1
       join buyer_seller_company_mappings b on b.dealing_with_company_id = ucm.company_id
            and b.client_company_id = $1 and b.status <> 0
      where u.status = 1 and u.email like 'qa\\_vbu\\_%@example.com'
      order by u.id desc limit 3`,
    [client.ctx.companyId],
  );
  if (!rows.length)
    return { unavailable: "no QA test vendor user exists for this workspace yet — run VBU-125 (Status rejected creates one) first" };
  const { authenticate } = await imp("auth/login.ts");
  const { ApiClient } = await imp("api/client.ts");
  const { CONFIG } = await imp("config.ts");
  let last = "";
  for (const r of rows) {
    try {
      const login = await authenticate({ ...CONFIG.identities.vendor, email: r.email, tenantCompanyId: client.ctx.companyId });
      const api = await ApiClient.create(login, { baseURL: login.baseURL, appVersion: login.appVersion, identity: "vendor" });
      return { api, userId: Number(r.id), label: `QA test vendor ${String(r.email).replace(/^(.{10}).*@/, "$1…@")}`, dispose: () => api.dispose() };
    } catch (e) {
      last = (e as Error).message;
    }
  }
  return { unavailable: `could not sign in as a QA test vendor (${last})` };
}

async function memberWithoutCreate(client: Client): Promise<ActorApi | { unavailable: string }> {
  const { query } = await imp("db/pool.ts");
  const { clientFromSession } = await imp("auth/sessionAuth.ts");
  const rows = await query(
    `select distinct on (u.id) u.id, u.first_name, u.email, u.role, s.access_token, s.app_version, s.created_at
       from sessions s
       join users u on u.id = s.user_id and u.status = 1
       join user_company_mappings ucm on ucm.user_id = u.id and ucm.company_id = $1 and ucm.status = 1
      where s.status = 1 and s.access_token is not null and s.app_version like '9.4%' and u.role in (0, 1, 2)
        and u.email like 'qa\\_%@example.com'
      order by u.id, s.created_at desc limit 6`,
    [client.ctx.companyId],
  );
  for (const r of rows) {
    const session = { userId: r.id, firstName: r.first_name, phone: null, phonePrefix: null, email: r.email, role: r.role,
      sessionAccessToken: r.access_token, appVersion: r.app_version, sessionCreatedAt: r.created_at };
    const api = await clientFromSession(session, { app: "console", companyId: client.ctx.companyId });
    const dc = await api.raw("GET", "/v1/dashboard_configuration");
    if (!dc.ok) { await api.dispose(); continue; }
    const perms = new Set<string>();
    for (const block of (dc.data as any)?.authorized_permissions ?? [])
      for (const list of Object.values(block ?? {}))
        if (Array.isArray(list)) for (const p of list as any[]) if (p?.module?.name) perms.add(`${p.module.name}:${p.module.operation}`);
    if (!perms.has("company:create_record"))
      return { api, userId: Number(r.id), label: `workspace member without company:create_record (user ${r.id})`, dispose: () => api.dispose() };
    await api.dispose();
  }
  return { unavailable: "no live session of a QA test user (qa_…@example.com) WITHOUT company:create_record in this workspace — add one to run this case" };
}

// ── the onboarding payload ───────────────────────────────────────────────

/** configurations + forms, as the Start Onboarding drawer builds them (vendorOnboardingFlow/mutation.js). */
export async function onboardingPayload(api: any, stamp: string): Promise<Record<string, unknown> | { unavailable: string }> {
  const list = await api.raw("GET", "/templates?type_identifier=vendor_onboarding");
  // The list answers {default: [...], saved: [...]} (the workspace's own templates are "saved").
  const d: any = list.data ?? {};
  const items: any[] = [...(d.saved ?? []), ...(d.default ?? []), ...(d.templates ?? []), ...(Array.isArray(d) ? d : [])];
  const t = items.find((x) => x?.uuid);
  if (!t) return { unavailable: `no vendor_onboarding template found (HTTP ${list.status})` };
  const full = await api.raw("GET", `/templates/${t.uuid}`);
  const fd: any = full.data ?? {};
  const forms = fd.forms ?? fd.template?.forms ?? fd.data?.forms ?? fd.templates?.[0]?.forms;
  if (!forms) return { unavailable: `template ${t.uuid} returned no forms` };
  const now = Date.now();
  return {
    configurations: {
      bid_start_time: new Date(now + 5 * 60_000).toISOString(),
      bid_end_time: new Date(now + 7 * 86_400_000).toISOString(),
      extra_closing_time: new Date(now + 8 * 86_400_000).toISOString(),
      title: `QA_Platform_VBU_${stamp} Vendor Onboarding`,
      rfx_mode: "rfi",
      order_type: "vendor_onboarding",
      is_tnc_mandatory: false,
      template_uuid: t.uuid,
      terms_and_conditions: [],
    },
    forms,
  };
}

// ── evidence ─────────────────────────────────────────────────────────────

/** One case execution, shaped as a database row. */
export interface VbuEvidence {
  schema: "vbu.evidence.v1";
  id: string; // "<stamp>/<caseId>"
  caseId: string;
  runStamp: string;
  recordedAt: string;
  companyId: number;
  actor: string;
  tier: string;
  fixture?: { file: string; file2?: string; bytes?: number; vars: Record<string, string> };
  /** the sheet as sent: row-3 column names that hold a value, and each data row */
  sheet?: { headers: string[]; rows: string[][] };
  request: { method: string; path: string; body?: unknown };
  http?: { status: number; message?: string | null; ms?: number };
  job?: { jobIds: number[]; staged: number; waitedMs: number; statusApi?: unknown };
  rows?: { rowNo: number; jobId: number; status: string; error: string | null; parsed: Record<string, unknown> }[];
  records?: {
    companyId: number; name: string; bscm: string | null; city: string | null; cityId: number | null; gstNo: string | null;
    panNo: string | null; address: string | null; vendorCode: string | null; misc: Record<string, unknown> | null;
    invitations: { status: string; inviteType: string; inviteInfo: string; skipVendorOnboarding: unknown; isSubsidiary: unknown }[];
  }[];
  expected: { text?: string; rows?: unknown };
  verdict: { pass: boolean; inconclusive?: boolean; text: string };
  rule?: string;
  bug?: VbuBug;
  qaDoc?: string[];
  steps?: string[];
}

export function writeEvidence(ev: VbuEvidence): string {
  const dir = join(EVIDENCE_DIR, ev.runStamp);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${ev.caseId}.json`), JSON.stringify(ev, null, 1));
  return ev.id;
}

/** Read one evidence record by "<stamp>/<caseId>" (path-guarded). */
export function readEvidence(ref: string): VbuEvidence | null {
  const m = String(ref).match(/^(\d{10,16})\/(VBU-[A-Za-z0-9]+)$/);
  if (!m) return null;
  const file = join(EVIDENCE_DIR, m[1], `${m[2]}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as VbuEvidence;
  } catch {
    return null;
  }
}

/** A filled workbook as the evidence grid: the named columns that hold a value, row by row. */
export function sheetGrid(base64: string): { headers: string[]; rows: string[][] } | undefined {
  try {
    const buf = Buffer.from(base64, "base64");
    // Only open real workbooks: SheetJS spins forever on some zips that are not
    // one (a Word .docx hung the whole run at 100% CPU).
    const isXlsx = buf.subarray(0, 2).toString("latin1") === "PK" && buf.includes("xl/workbook");
    const isXls = buf.subarray(0, 4).toString("hex") === "d0cf11e0";
    const isText = buf.length > 0 && !buf.subarray(0, 512).includes(0) && !/^(PK|%PDF)/.test(buf.subarray(0, 4).toString("latin1"));
    if (!isXlsx && !isXls && !isText) return undefined;
    const wb = XLSX.read(buf, { type: "buffer", sheetRows: 30 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const g: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: true, raw: false });
    const hdr: string[] = (g[2] ?? []).map((h) => String(h));
    const data = g.slice(3, 23);
    const used = hdr.map((_, i) => i).filter((i) => hdr[i] && data.some((r) => String(r[i] ?? "") !== ""));
    return { headers: used.map((i) => hdr[i]), rows: data.map((r) => used.map((i) => String(r[i] ?? ""))) };
  } catch {
    return undefined;
  }
}

// ── bug registry ─────────────────────────────────────────────────────────

export interface VbuBug {
  id: string;
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  status: string;
  cases: string[];
  cause: string;
  fix: string;
  where: string;
  found: string;
}

let bugs: { mtime: number; list: VbuBug[] } | undefined;
/** The registry, re-read whenever the file changes (a renamed or newly filed bug shows at once). */
export function vbuBugs(): VbuBug[] {
  try {
    const mtime = statSync(BUGS_FILE).mtimeMs;
    if (!bugs || bugs.mtime !== mtime) bugs = { mtime, list: JSON.parse(readFileSync(BUGS_FILE, "utf8")).bugs as VbuBug[] };
  } catch {
    bugs = { mtime: 0, list: [] };
  }
  return bugs.list;
}
export const bugForCase = (caseId: string): VbuBug | undefined => vbuBugs().find((b) => b.cases.includes(caseId));
