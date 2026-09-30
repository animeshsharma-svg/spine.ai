/**
 * VENDOR BULK UPLOAD — build a sheet, upload it, wait for the job, read what
 * each row became.
 *
 * Why this is more than one request: `POST /v1/bulk_create_vendor` only parses
 * the file and stages one `vendor_bulk_upload_jobs` row per sheet row, then
 * answers `{"status":"success"}` with no job id
 * (procol-backend app/controllers/api/v1/companies_controller.rb:199-215). Every
 * row rule runs later in Sidekiq (app/workers/vendor_bulk_upload_worker_v2.rb),
 * so the verdict for a row lives in that table, not in the HTTP reply. This
 * module does the upload and then reads the rows back — SELECT only.
 *
 * Sheet layout the backend expects (app/services/conversions/
 * excel_to_json_conversion_service.rb:163-182): row 1 and 2 are the group
 * headers, row 3 holds the column names, data starts at row 4. Columns are
 * matched BY NAME, so their order does not matter.
 */
import * as XLSX from "xlsx";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";
import { query as rawQuery } from "../db/pool.js";

/** SELECT with two retries — the sandbox database drops the odd connection (ETIMEDOUT). */
async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await rawQuery<T>(sql, params);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (attempt >= 3 || !/ETIMEDOUT|ECONNRESET|EPIPE|57P01/.test(code + String((e as Error).message))) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

const here = dirname(fileURLToPath(import.meta.url));
export const VBU_FIXTURE_DIR = join(here, "..", "..", "fixtures", "vendor-bulk-upload");

/** The 22 columns GMMCO's live template carried on 2026-09-29 (PR 16267 layout). */
export const GMMCO_TEMPLATE_HEADERS = [
  "Company Name", "Tax Type", "Tax No.", "Business Location", "City", "Address", "Vendor Profile",
  "POC - Full Name", "POC - Email Address", "Vendor Code", "VRP Code", "PAN No.", "Pincode",
  "POC 2 - Full Name", "POC 2 - Email Address", "Deals In", "Status", "Account Group",
  "MSME Registration Number", "Bank Account Number", "Bank IFSC Code", "Vendor Onboarding Required",
];

export type Cell = string | number | boolean | null | { f: string } | { n: string };

// ── template ─────────────────────────────────────────────────────────────

export interface TemplateInfo {
  headers: string[];
  /** row-1 group each column sits under ("Mandatory Details" / "Optional Details") */
  group: Record<string, "mandatory" | "optional">;
  sampleRow: Record<string, string>;
  /** what the file claims its used range is (`<dimension ref>`) */
  declaredRef: string;
  /** the range the cells really occupy */
  actualRef: string;
  /** data-validation dropdowns: range → title */
  validations: { sqref: string; title: string }[];
  dataSheet: {
    profiles: string[];
    categories: { name: string; uuid: string }[];
    businessLocations: string[];
    taxTypes: string[];
    statuses: string[];
    onboarding: string[];
  };
  bytes: number;
}

/** Download and read the workspace's own template (the file a buyer starts from). */
export async function fetchTemplate(api: ApiClient): Promise<TemplateInfo> {
  const res = (await api.get<{ excel_url: string }>(Endpoints.bulkCreateVendorTemplate())) as { excel_url: string };
  const buf = Buffer.from(await (await fetch(res.excel_url)).arrayBuffer());
  return readTemplate(buf);
}

export function readTemplate(buf: Buffer): TemplateInfo {
  const wb = XLSX.read(buf, { type: "buffer", cellStyles: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const declaredRef = String(ws["!ref"] ?? "");
  // The file's <dimension> can be stale (GMMCO's says A1:T4 while cells run to
  // V), and SheetJS trusts it — so recompute the range from the real cells.
  const actualRef = realRange(ws);
  ws["!ref"] = actualRef;
  const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
  const headers = (grid[2] ?? []).map((h) => String(h)).filter((h) => h !== "");
  const group: Record<string, "mandatory" | "optional"> = {};
  let current: "mandatory" | "optional" = "mandatory";
  (grid[2] ?? []).forEach((h, i) => {
    const g = String(grid[0]?.[i] ?? "");
    if (/optional/i.test(g)) current = "optional";
    else if (/mandatory/i.test(g)) current = "mandatory";
    if (h) group[String(h)] = current;
  });
  const sampleRow: Record<string, string> = {};
  (grid[2] ?? []).forEach((h, i) => {
    if (h) sampleRow[String(h)] = String(grid[3]?.[i] ?? "");
  });

  const ds = wb.Sheets[wb.SheetNames[1]];
  const dgrid: any[][] = ds ? XLSX.utils.sheet_to_json(ds, { header: 1, defval: "", raw: false }) : [];
  const dh = (dgrid[0] ?? []).map((h) => String(h));
  const col = (name: string) => {
    const i = dh.indexOf(name);
    return i < 0 ? [] : dgrid.slice(1).map((r) => String(r[i] ?? "")).filter((v) => v !== "");
  };
  const names = col("Category Name");
  const codes = col("Category Code");

  return {
    headers,
    group,
    sampleRow,
    declaredRef,
    actualRef,
    validations: readValidations(buf),
    dataSheet: {
      profiles: col("Vendor Profiles"),
      categories: names.map((n, i) => ({ name: n, uuid: codes[i] ?? "" })),
      businessLocations: col("Business Location"),
      taxTypes: col("Tax Type"),
      statuses: col("Status"),
      onboarding: col("Vendor Onboarding Required"),
    },
    bytes: buf.length,
  };
}

function realRange(ws: XLSX.WorkSheet): string {
  let maxR = 0;
  let maxC = 0;
  for (const k of Object.keys(ws)) {
    if (k.startsWith("!")) continue;
    const a = XLSX.utils.decode_cell(k);
    maxR = Math.max(maxR, a.r);
    maxC = Math.max(maxC, a.c);
  }
  return XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
}

/** SheetJS drops data validations on read, so they are read from the sheet XML. */
function readValidations(buf: Buffer): { sqref: string; title: string }[] {
  try {
    const wb = XLSX.read(buf, { type: "buffer", bookFiles: true } as any);
    const files = (wb as any).files ?? (wb as any).keys;
    const entry = files?.["xl/worksheets/sheet1.xml"];
    const xml: string = entry?.content ? Buffer.from(entry.content).toString("utf8") : "";
    return [...xml.matchAll(/<dataValidation\b[^>]*?sqref="([^"]+)"[^>]*?errorTitle="([^"]*)"/g)].map((m) => ({
      sqref: m[1],
      title: m[2],
    }));
  } catch {
    return [];
  }
}

// ── building a sheet ─────────────────────────────────────────────────────

export interface SheetSpec {
  /**
   * `template` (default) — rows 1-2 group headers, row 3 column names, data from row 4.
   * `headerRow1`         — an ordinary spreadsheet: names in row 1, data from row 2.
   * `emptyWorkbook`      — one sheet with no cells at all.
   * `grid`               — write `grid` exactly as given.
   */
  layout?: "template" | "headerRow1" | "emptyWorkbook" | "grid";
  headers?: string[];
  rows?: Array<Record<string, Cell>>;
  grid?: Cell[][];
  bookType?: "xlsx" | "xls" | "csv";
  /** extra sheets after the upload sheet, e.g. a second sheet holding the data */
  extraSheets?: Record<string, Cell[][]>;
  /** blank rows to leave BETWEEN data rows (index → count) */
  gapsAfter?: Record<number, number>;
}

function toCell(v: Cell): XLSX.CellObject | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return { t: "n", v };
  if (typeof v === "boolean") return { t: "b", v };
  if (typeof v === "object" && "f" in v) return { t: "s", f: v.f } as XLSX.CellObject;
  if (typeof v === "object" && "n" in v) return { t: "n", v: Number(v.n) };
  return { t: "s", v: String(v) };
}

function gridToSheet(grid: Cell[][]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxR = 0;
  let maxC = 0;
  grid.forEach((row, r) =>
    row.forEach((v, c) => {
      const cell = toCell(v);
      if (!cell) return;
      ws[XLSX.utils.encode_cell({ r, c })] = cell;
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
    }),
  );
  ws["!ref"] = grid.length ? XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } }) : "A1";
  return ws;
}

/** The grid a spec describes (before it is written to a file). */
export function specToGrid(spec: SheetSpec): Cell[][] {
  const layout = spec.layout ?? "template";
  if (layout === "grid") return spec.grid ?? [];
  if (layout === "emptyWorkbook") return [];
  // A copy: extra columns are appended below, and the shared list must never change.
  const headers = [...(spec.headers ?? GMMCO_TEMPLATE_HEADERS)];
  const dataRows: Cell[][] = [];
  (spec.rows ?? []).forEach((row, i) => {
    dataRows.push(headers.map((h) => (h in row ? row[h] : "")));
    for (let g = 0; g < (spec.gapsAfter?.[i] ?? 0); g++) dataRows.push([]);
  });
  // Extra keys a row names that are not in `headers` become extra columns.
  const extra = [...new Set((spec.rows ?? []).flatMap((r) => Object.keys(r)).filter((k) => !headers.includes(k)))];
  if (extra.length) {
    const all = [...headers, ...extra];
    dataRows.length = 0;
    (spec.rows ?? []).forEach((row, i) => {
      dataRows.push(all.map((h) => (h in row ? row[h] : "")));
      for (let g = 0; g < (spec.gapsAfter?.[i] ?? 0); g++) dataRows.push([]);
    });
    headers.splice(0, headers.length, ...all);
  }
  if (layout === "headerRow1") return [headers, ...dataRows];
  const row1: Cell[] = headers.map((_, i) => (i === 0 ? "Mandatory Details" : i === 4 ? "Optional Details" : ""));
  const row2: Cell[] = headers.map((_, i) => (i === 1 ? "With Tax No." : ""));
  return [row1, row2, headers, ...dataRows];
}

export function buildWorkbook(spec: SheetSpec): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, gridToSheet(specToGrid(spec)), "Vendor Bulk Upload Sheet");
  for (const [name, grid] of Object.entries(spec.extraSheets ?? {})) {
    XLSX.utils.book_append_sheet(wb, gridToSheet(grid), name);
  }
  const bookType = spec.bookType ?? "xlsx";
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: bookType === "xls" ? "biff8" : bookType }));
}

// ── fixtures on disk ─────────────────────────────────────────────────────

/**
 * Load a fixture and fill its {{placeholders}} for this run.
 *
 * Fixtures keep literal tokens such as {{stamp}} in their cells so the file a
 * person opens is the file the run sends, with only the per-run values swapped
 * in. Non-spreadsheet fixtures (a PDF, a PNG) are sent byte for byte.
 */
export function loadFixture(file: string, vars: Record<string, string>): { base64: string; bytes: number; cellsFilled: number } {
  const path = join(VBU_FIXTURE_DIR, file);
  if (!existsSync(path)) throw new Error(`fixture ${file} not found in ${VBU_FIXTURE_DIR}`);
  const raw = readFileSync(path);
  if (!/\.(xlsx|xls)$/i.test(file)) return { base64: raw.toString("base64"), bytes: raw.length, cellsFilled: 0 };
  const wb = XLSX.read(raw, { type: "buffer", cellFormula: true, cellNF: false });
  let filled = 0;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    for (const [addr, cell] of Object.entries(ws)) {
      if (addr.startsWith("!") || !cell || (cell as any).t !== "s" || typeof (cell as any).v !== "string") continue;
      const before = (cell as any).v as string;
      const after = fillVars(before, vars);
      if (after !== before) {
        (cell as any).v = after;
        delete (cell as any).w;
        delete (cell as any).h;
        delete (cell as any).r;
        filled++;
      }
    }
  }
  const bookType = /\.xls$/i.test(file) ? "biff8" : "xlsx";
  const out = Buffer.from(XLSX.write(wb, { type: "buffer", bookType }));
  return { base64: out.toString("base64"), bytes: out.length, cellsFilled: filled };
}

export function fillVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/**
 * Per-run values every fixture may use. All of them are visibly fake:
 * names QA_Platform_…, emails qa_…@example.com (a reserved domain), and GST
 * numbers whose PAN part has entity letter "Z", which no real PAN carries.
 */
export function runVars(stamp: string, template?: TemplateInfo): Record<string, string> {
  const d4 = stamp.slice(-4).padStart(4, "0");
  const gst = (letter: string) => `27QATZQ${d4}${letter}1Z5`;
  const cats = template?.dataSheet.categories ?? [];
  const profiles = template?.dataSheet.profiles ?? [];
  const main = gst("Q");
  const profile = profiles[0] ?? "manufacturer";
  return {
    stamp,
    gst: main,
    gstLower: main.toLowerCase(),
    gst14: main.slice(0, 14),
    gstB: gst("R"),
    gstC: gst("S"),
    gstD: gst("T"),
    pan: `QATZQ${d4}Q`,
    // UK VAT numbers (GB + 9 digits) — "United Kingdom" is a single, active
    // country on the sandbox, unlike "India" (see case VBU-059).
    vatA: `GB9${d4}0000`,
    vatB: `GB9${d4}0001`,
    vatC: `GB9${d4}0002`,
    vatD: `GB9${d4}0003`,
    vatE: `GB9${d4}0004`,
    vatF: `GB9${d4}0005`,
    vatG: `GB9${d4}0006`,
    vatH: `GB9${d4}0007`,
    vatI: `GB9${d4}0008`,
    vatJ: `GB9${d4}0009`,
    /** exactly 100 / 101 characters once filled */
    vcode100: `QA${stamp}`.padEnd(100, "V"),
    profile,
    profileUpper: profile.toUpperCase(),
    profile2: profiles[1] ?? profiles[0] ?? "brokerage",
    categoryUuid: cats[0]?.uuid ?? "",
    categoryUuid2: cats[1]?.uuid ?? cats[0]?.uuid ?? "",
    categoryName: cats[0]?.name ?? "",
  };
}

// ── upload + job ─────────────────────────────────────────────────────────

export interface JobRow {
  id: number;
  jobId: number;
  status: "in_progress" | "success" | "failed" | "already_mapped" | string;
  error: string | null;
  data: Record<string, unknown>;
}

const STATUS_NAMES: Record<number, JobRow["status"]> = { 0: "in_progress", 1: "success", 2: "failed", 3: "already_mapped" };

/** Highest job id this user has so far (SELECT only). */
export async function lastJobId(userId: number): Promise<number> {
  const r = await query<{ m: number | null }>(
    "select max(job_id) as m from vendor_bulk_upload_jobs where user_id = $1",
    [userId],
  );
  return Number(r[0]?.m ?? 0);
}

export async function readJobRows(userId: number, afterJobId: number): Promise<JobRow[]> {
  const rows = await query<any>(
    `select id, job_id, status, error, data from vendor_bulk_upload_jobs
     where user_id = $1 and job_id > $2 order by id`,
    [userId, afterJobId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    jobId: Number(r.job_id),
    status: STATUS_NAMES[Number(r.status)] ?? String(r.status),
    error: r.error,
    data: r.data ?? {},
  }));
}

export interface UploadOutcome {
  http: { ok: boolean; status: number; message?: string; code?: string; data?: unknown };
  /** rows the upload staged; empty when the request was refused */
  rows: JobRow[];
  jobId?: number;
  /** true when the rows were still in progress at the deadline */
  timedOut: boolean;
  waitedMs: number;
  /** what GET /v1/bulk_create_vendor_status said about this job */
  statusApi?: { job_uuid: string; success: number; failed: number; in_progress: number; already_mapped: number; total: number };
}

/**
 * Upload a base64 sheet and wait for every staged row to leave `in_progress`.
 * Uploads by one user must never overlap: the backend numbers a job as
 * "this user's job count + 1" (app/helpers/api/companies_helper.rb:684), so two
 * concurrent uploads share one job id.
 */
export async function uploadAndWait(
  api: ApiClient,
  userId: number,
  body: Record<string, unknown>,
  opts: { timeoutMs?: number; pollMs?: number; expectRows?: number } = {},
): Promise<UploadOutcome> {
  const before = await lastJobId(userId);
  const started = Date.now();
  const http = await api.raw("POST", Endpoints.bulkCreateVendor(), { body, timeoutMs: 180_000 });
  if (!http.ok) return { http, rows: [], timedOut: false, waitedMs: Date.now() - started };

  const deadline = Date.now() + (opts.timeoutMs ?? 240_000);
  const pollMs = opts.pollMs ?? 2_500;
  let rows: JobRow[] = [];
  let quietPolls = 0;
  for (;;) {
    rows = await readJobRows(userId, before);
    const pending = rows.filter((r) => r.status === "in_progress").length;
    if (rows.length && !pending) break;
    // A sheet with no data rows stages nothing: give it a few polls, then stop.
    if (!rows.length && ++quietPolls >= 4) break;
    if (Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  const timedOut = rows.some((r) => r.status === "in_progress");
  const jobId = rows[0]?.jobId;
  // Uploads by this user are strictly sequential, so the newest job the
  // status API lists is this one (it orders by job_id desc).
  let statusApi: UploadOutcome["statusApi"];
  const st = await api.raw("GET", Endpoints.bulkCreateVendorStatus());
  if (st.ok && jobId !== undefined) statusApi = ((st.data as any)?.jobs ?? [])[0];
  return { http, rows, jobId, timedOut, waitedMs: Date.now() - started, statusApi };
}

// ── what a row created ───────────────────────────────────────────────────

export interface CreatedVendor {
  companyId: number;
  name: string;
  email: string | null;
  gstNo: string | null;
  panNo: string | null;
  address: string | null;
  cityId: number | null;
  cityName: string | null;
  category: number | null;
  misc: Record<string, unknown> | null;
  bscmStatus: string | null;
  vendorCode: string | null;
  vrpCode: string | null;
  invitations: { status: string; inviteType: string; inviteInfo: string; skipVendorOnboarding: unknown; isSubsidiary: unknown }[];
  users: number;
}

const BSCM: Record<number, string> = {
  0: "in_active", 1: "active", 2: "invited", 3: "onboarding_in_progress", 4: "in_review", 5: "rejected", 6: "in_approval", 7: "blacklisted",
};
const INV: Record<number, string> = { 0: "in_active", 1: "active", 2: "accepted", 3: "rejected", 4: "revoked", 5: "in_progress", 6: "blacklisted" };

/** Vendors of this workspace with exactly this name (newest first). */
export async function findVendorsByName(workspaceId: number, name: string): Promise<CreatedVendor[]> {
  const rows = await query<any>(
    `select c.id, c.name, c.email, c.gst_no, c.pan_no, c.address, c.city_id, ci.name as city_name, c.category, c.misc,
            b.status as bscm_status, b.vendor_code, b.vrp_code
       from companies c
       join buyer_seller_company_mappings b on b.dealing_with_company_id = c.id and b.client_company_id = $1
       left join cities ci on ci.id = c.city_id
      where c.name = $2
      order by c.id desc limit 5`,
    [workspaceId, name],
  );
  const out: CreatedVendor[] = [];
  for (const r of rows) {
    const inv = await query<any>(
      `select status, invite_type, invite_info, other_details from invitations
        where inviter_company_id = $1 and invitee_company_id = $2 order by id`,
      [workspaceId, r.id],
    );
    const users = await query<{ n: number }>(
      "select count(*)::int as n from user_company_mappings where company_id = $1 and status = 1",
      [r.id],
    );
    out.push({
      companyId: Number(r.id),
      name: r.name,
      email: r.email,
      gstNo: r.gst_no,
      panNo: r.pan_no,
      address: r.address,
      cityId: r.city_id,
      cityName: r.city_name,
      category: r.category,
      misc: r.misc,
      bscmStatus: BSCM[Number(r.bscm_status)] ?? String(r.bscm_status),
      vendorCode: r.vendor_code,
      vrpCode: r.vrp_code,
      invitations: inv.map((i) => ({
        status: INV[Number(i.status)] ?? String(i.status),
        inviteType: i.invite_type,
        inviteInfo: i.invite_info,
        skipVendorOnboarding: i.other_details?.skip_vendor_onboarding,
        isSubsidiary: i.other_details?.is_subsidiary,
      })),
      users: Number(users[0]?.n ?? 0),
    });
  }
  return out;
}

// ── the workspace settings that change this feature ──────────────────────

export const VBU_FLAG_KEYS = [
  "allow_contactless_vendor_upload",
  "can_skip_vendor_onboarding",
  "vendor_onboarding_version",
  "vendor_invitation_v2",
  "disable_manual_vendor_creation",
  "vendor_duplicate_check_fields",
  "allow_same_gst_multiple_addresses_vendor_invite",
  "extra_fields_for_vendor_invite",
  "vendor_category_type_mapping",
  "stopping_invite_for_onboarding_team",
  "vendor_invite_recipient_scope",
  "is_p2p_vendor_portal_enabled",
  "restrict_vendor_bulk_download",
  "custom_communication_templates_allowed",
  "allow_broker_manufacturer_dual_role",
  "restricted_pan_email_domains",
] as const;

/**
 * The resolved value of each setting for one company, the way
 * CustomConfiguration.cached_all_configs resolves it: the company override,
 * else the company's master default, else the global master default.
 */
export async function resolveVbuFlags(companyId: number): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const key of VBU_FLAG_KEYS) {
    const r = await query<{ value: unknown }>(
      `WITH c AS (SELECT modifications->'value' AS v FROM custom_configurations
                   WHERE item_type = 'Company' AND item_id = $1 AND config_key = $2 AND status = 1 ORDER BY id DESC LIMIT 1),
            m AS (SELECT defaults->'value' AS v FROM master_configurations
                   WHERE item_type = 1 AND status = 1 AND config_key = $2 AND (company_id = $1 OR company_id IS NULL)
                   ORDER BY company_id NULLS LAST, id DESC LIMIT 1)
       SELECT CASE WHEN EXISTS (SELECT 1 FROM c) THEN (SELECT v FROM c) ELSE (SELECT v FROM m) END AS value`,
      [companyId, key],
    );
    out[key] = r[0]?.value ?? null;
  }
  return out;
}

/** Ruby truthiness, which is how most of these settings are read. */
export const rubyTruthy = (v: unknown): boolean => v !== null && v !== undefined && v !== false;
/** Rails `.present?` — how can_skip_vendor_onboarding is read (company.rb:907-910). */
export const railsPresent = (v: unknown): boolean =>
  !(v === null || v === undefined || v === false || v === "" || (Array.isArray(v) && !v.length) ||
    (typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length));

/** How many users would get the "new prospect added" email for this workspace (count only). */
export async function vendorManagementRecipientCount(companyId: number): Promise<number | null> {
  try {
    // Same rule as VendorOnboardingMailerWorker#vendor_management_users
    // (app/workers/vendor_onboarding_mailer_worker.rb:198-203): active members
    // of the workspace's active vendor_management (team_type 10) teams.
    const r = await query<{ n: number }>(
      `select count(distinct u.id)::int as n
         from users u
         join team_members tm on tm.user_id = u.id and tm.status = 1
         join teams t on t.id = tm.team_id and t.company_id = $1 and t.status = 1 and t.team_type = 10
         join user_company_mappings ucm on ucm.user_id = u.id and ucm.company_id = $1 and ucm.status = 1
        where u.status = 1`,
      [companyId],
    );
    return Number(r[0]?.n ?? 0);
  } catch {
    return null;
  }
}
