/**
 * VENDOR BULK UPLOAD — a bug in full: what the buyer does, what should happen
 * at every place the buyer looks, what the sandbox actually did (read from the
 * case's evidence record, never paraphrased), and the exact messages shown.
 *
 * The plain-language parts live in config/vbuBugDetails.json beside the bug
 * registry (config/vbuBugs.json); the "seen" parts come from each case's
 * evidence (data/evidence/<stamp>/<case>.json). The test report, the
 * dashboard bug sheet and the written bug sheet
 * (test-cases/vendor-bulk-bug-sheet.md) all read through this module.
 *
 * Where a message reaches the screen is the client's own logic
 * (procol-client-dashboard):
 *   • uploadExcelModal.jsx:69-83 — HTTP 200 → green "Vendors Sheet Uploaded";
 *   • actions/index.js:21-64 — a JSON error → red pop-up with error.message
 *     (or the error string, e.g. "Internal Server Error");
 *   • vendorBulkUpload.jsx — the history table (Total / Completed / Failed /
 *     Duplicate) and "Download Excel", enabled only when Failed > 0.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { EVIDENCE_DIR, type VbuEvidence } from "../checks/vendorBulkExtras.js";

const here = dirname(fileURLToPath(import.meta.url));
const DETAILS_FILE = join(here, "..", "..", "config", "vbuBugDetails.json");

export interface BugDetail {
  area: string;
  scenario: string;
  expected: string[];
  actual: string;
  /** the symptom a real buyer sees (without the test's tripwire) */
  sees: string;
  impact: string;
  /** how to read this bug's test history, when it needs saying */
  note?: string;
}

let cache: { mtime: number; bugs: Record<string, BugDetail> } | undefined;
/** The plain-language detail of one bug, re-read whenever the file changes. */
export function bugDetail(bugId: string): BugDetail | undefined {
  try {
    const mtime = statSync(DETAILS_FILE).mtimeMs;
    if (!cache || cache.mtime !== mtime) cache = { mtime, bugs: JSON.parse(readFileSync(DETAILS_FILE, "utf8")).bugs ?? {} };
  } catch {
    cache = { mtime: 0, bugs: {} };
  }
  return cache.bugs[bugId];
}

/** What the sandbox did, by the place the buyer would see it. */
export interface Seen {
  /** the server's answer, e.g. 'HTTP 500 {"status":500,"error":"Internal Server Error"}' */
  server?: string;
  /** the pop-up the screen shows for that answer */
  popup?: string;
  /** the Bulk Upload history line for the job */
  history?: string;
  /** each failed row's message, as the error sheet's Error column holds it */
  errorSheet: string[];
  /** what the rows created, read from the database */
  records: string[];
  /** values the upload changed on the way in: sheet → read */
  changed: string[];
  /** the runner's own one-line verdict */
  verdict: string;
}

const UPLOAD = "/v1/bulk_create_vendor";
const TAB: Record<string, string> = {
  active: "Vendors (active)", invited: "Prospects", rejected: "Rejected", onboarding_in_progress: "Onboarding in progress", blacklisted: "Blacklisted",
};

/** The pop-up the web app shows for an answer to the upload (see the header). */
export function popupFor(status: number | undefined, message: string | null | undefined, path: string): string | undefined {
  if (status === undefined || status === 0) return undefined;
  const ok = status >= 200 && status < 205;
  if (path === UPLOAD) return ok ? "green pop-up “Vendors Sheet Uploaded”" : `red pop-up “${message ?? "error"}”`;
  if (path.startsWith("/invitations/send_invite")) return ok ? "the Invite Vendor form reports success" : `red pop-up on the Invite Vendor form “${message ?? "error"}”`;
  if (path.startsWith("/v1/bulk_create_vendor_error_sheet")) return ok ? "the error sheet downloads" : `red pop-up “${message ?? "error"}” (only reachable through the API; the button is disabled when Failed is 0)`;
  if (path.startsWith("/v1/bulk_create_vendor_template")) return ok ? "the template downloads" : `red pop-up “${message ?? "error"}”`;
  return undefined;
}

/** The server's answer in one line, with the body the web app reads. */
function serverLine(status: number | undefined, message: string | null | undefined, path: string, body?: string): string | undefined {
  if (status === undefined) return undefined;
  if (status === 0) return "no answer (network)";
  if (body) return `HTTP ${status} ${body}`;
  if (status >= 500) return `HTTP ${status} {"status":${status},"error":"${message ?? "Internal Server Error"}"}`;
  if (status >= 200 && status < 205) return path === UPLOAD ? `HTTP ${status} {"status":"success"}` : `HTTP ${status}`;
  return `HTTP ${status} “${message ?? ""}”`;
}

export function seenFromEvidence(ev: VbuEvidence): Seen {
  const path = ev.request?.path ?? "";
  const s: Seen = { errorSheet: [], records: [], changed: [], verdict: ev.verdict.text };
  s.server = serverLine(ev.http?.status, ev.http?.message, path);
  s.popup = popupFor(ev.http?.status, ev.http?.message, path);
  const st: any = ev.job?.statusApi;
  if (st && typeof st === "object" && "total" in st) {
    s.history = `Total ${st.total} · Completed ${st.success} · Failed ${st.failed} · Duplicate ${st.already_mapped}${st.in_progress ? ` · still in progress ${st.in_progress}` : ""}${ev.job?.jobIds?.length ? ` (job ${ev.job.jobIds.join(", ")})` : ""}`;
  } else if (path === UPLOAD && ev.http?.status === 200 && ev.job && !ev.job.staged) {
    s.history = "no new job appears in the history: nothing was staged";
  }
  for (const r of ev.rows ?? []) if (r.status === "failed") s.errorSheet.push(`row ${r.rowNo}: “${r.error ?? ""}”`);
  for (const r of ev.records ?? []) {
    const inv = r.invitations.length
      ? r.invitations.map((i) => `${i.inviteType} ${i.status}${i.skipVendorOnboarding ? ", skip onboarding" : ""}${i.isSubsidiary ? ", subsidiary" : ""}`).join("; ")
      : "no invitation";
    s.records.push(`vendor ${r.companyId} “${r.name}” — ${TAB[r.bscm ?? ""] ?? r.bscm ?? "no mapping"}; city ${r.city ? `${r.city} (id ${r.cityId})` : `none (city_id ${r.cityId ?? "null"})`}; ${inv}`);
  }
  // values the upload changed on the way in (e.g. "Plot No. 100" → "Plot No. 1")
  (ev.rows ?? []).forEach((r, i) => {
    for (const [col, got] of Object.entries(r.parsed ?? {})) {
      const at = ev.sheet?.headers.indexOf(col) ?? -1;
      if (at < 0) continue;
      const sent = ev.sheet!.rows[i]?.[at] ?? "";
      if (sent !== "" && String(got ?? "") !== String(sent)) s.changed.push(`row ${r.rowNo} ${col}: sheet “${sent}” → read as “${got ?? ""}”`);
    }
  });
  return s;
}

/** For a case that left no evidence record (a plain request): its stored result. */
export function seenFromResult(r: { httpStatus?: number | null; message?: string | null; verdict?: string; request?: { path?: string } }): Seen {
  const path = r.request?.path ?? UPLOAD;
  const status = r.httpStatus ?? undefined;
  const msg = status && status >= 500 ? r.message ?? "Internal Server Error" : r.message;
  return {
    server: serverLine(status, msg, path),
    popup: popupFor(status, msg, path),
    errorSheet: [], records: [], changed: [], verdict: r.verdict ?? "",
  };
}

/** The exact messages the buyer is shown, in one line. */
export function shownLine(s: Seen): string {
  const parts: string[] = [];
  if (s.popup) parts.push(`Screen: ${s.popup}`);
  if (s.errorSheet.length) parts.push(`Error sheet: ${[...new Set(s.errorSheet.map((x) => x.replace(/^row \d+: /, "")))].join(" / ")}`);
  if (s.history) parts.push(`History: ${s.history}`);
  return parts.join(" · ");
}

/**
 * The newest evidence record of a case, optionally on one workspace. With
 * `failing`, the newest one that FAILED (an intermittent bug is shown where it
 * happened), falling back to the newest of any verdict.
 */
export function latestEvidence(caseId: string, companyId?: number, opts: { failing?: boolean } = {}): VbuEvidence | undefined {
  if (opts.failing) {
    const bad = latestEvidenceWhere(caseId, companyId, (ev) => !ev.verdict.pass && !ev.verdict.inconclusive);
    if (bad) return bad;
  }
  return latestEvidenceWhere(caseId, companyId, () => true);
}

function latestEvidenceWhere(caseId: string, companyId: number | undefined, ok: (ev: VbuEvidence) => boolean): VbuEvidence | undefined {
  if (!existsSync(EVIDENCE_DIR)) return undefined;
  const stamps = readdirSync(EVIDENCE_DIR).filter((d) => /^\d{10,16}$/.test(d)).sort().reverse();
  for (const st of stamps) {
    const f = join(EVIDENCE_DIR, st, `${caseId}.json`);
    if (!existsSync(f)) continue;
    try {
      const ev = JSON.parse(readFileSync(f, "utf8")) as VbuEvidence;
      if ((companyId === undefined || ev.companyId === companyId) && ok(ev)) return ev;
    } catch {
      /* a half-written record: try the older one */
    }
  }
  return undefined;
}

/** Rows that read "Invalid Status" are our tripwire: the row passed the check under test. */
export function usesTripwire(ev: VbuEvidence | undefined): boolean {
  const rows = ev?.expected?.rows;
  return Array.isArray(rows) && rows.some((r: any) => r?.error === "Invalid Status" || r?.errorIncludes === "Invalid Status");
}

export const TRIPWIRE_NOTE =
  "How to read this test: rows that should NOT create a vendor carry a deliberate second mistake, Status = QA_TRIPWIRE. A row that gets past the rule under test therefore stops at “Invalid Status” and creates nothing, so “Invalid Status” in the error sheet means the rule under test let the row through.";
