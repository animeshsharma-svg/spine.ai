/**
 * VENDOR BULK UPLOAD RUNNER — turns a `bulk` case into a real upload and a
 * verdict about what each ROW became.
 *
 * Why the generic check engine is not enough here: `POST /v1/bulk_create_vendor`
 * only parses the file and answers `{"status":"success"}`. Every row rule runs
 * later, in Sidekiq, and its outcome is a `vendor_bulk_upload_jobs` row
 * (procol-backend app/workers/vendor_bulk_upload_worker_v2.rb). A 200 says
 * nothing about whether the rule under test fired, so judging these cases on
 * the HTTP status would pass every negative case vacuously.
 *
 * So a bulk case: loads its fixture (procol test/fixtures/vendor-bulk-upload),
 * fills the per-run tokens, uploads it, waits until no staged row is still
 * in_progress, and compares each row with the case's expectation — status,
 * exact error text, the parsed values, and (for rows that create a vendor) the
 * company / mapping / invitation rows. Every database read is a SELECT.
 *
 * Worker-side exceptions ("Internal error …", "Vendor onboarding could not be
 * started …") are the asynchronous twin of an HTTP 500 and are reported as such.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as XLSX from "xlsx";

import type { Client, CheckOutcome } from "./engine.js";
import { actorApi, bugForCase, onboardingPayload, sheetGrid, writeEvidence, type VbuEvidence } from "./vendorBulkExtras.js";

const here = dirname(fileURLToPath(import.meta.url));
const PROCOL_TEST = join(here, "..", "..", "..", "procol test");

type Vbu = typeof import("../../../procol test/src/flows/vendorBulkUpload.js");
let mod: Vbu | undefined;
async function vbu(): Promise<Vbu> {
  if (!mod) mod = (await import(pathToFileURL(join(PROCOL_TEST, "src", "flows", "vendorBulkUpload.ts")).href)) as Vbu;
  return mod;
}

export interface BulkSpec {
  kind: "http" | "bulk" | "template" | "errorSheet" | "formulaSheet" | "concurrent" | "errorSheetReupload" | "manualInvite";
  actor?: "seller-qa" | "member-no-company-create";
  payload?: "onboarding";
  fixture2?: string;
  inviteBody?: Record<string, unknown>;
  inviteExpect?: { http: "accept" | "reject"; message?: string; verify?: RowExpect["verify"] };
  tier: "safe" | "creates" | "real-mail";
  requires?: Record<string, unknown>;
  fixture?: string | null;
  wrap?: "dataUrl";
  refuse?: { message?: string; code?: string };
  rows?: RowExpect[];
  anyOrder?: boolean;
  /** fixture that must have been uploaded (and succeeded) first, once per run */
  baseline?: string;
  templateCheck?: string;
  errorSheetCheck?: "noJob" | "unknownJob" | "realJob";
  everyRow?: boolean;
}
interface RowExpect {
  status: string;
  error?: string;
  errorIncludes?: string;
  dataEquals?: Record<string, string>;
  dataExcludes?: Record<string, string>;
  verify?: {
    bscm?: string;
    invitations?: number;
    invitationStatus?: string;
    skipOnboarding?: boolean;
    fields?: Record<string, string | null>;
    minUsers?: number;
    absent?: boolean;
    subsidiary?: boolean;
  };
}

/** Settings the cases are gated on, read once per run (DB, SELECT only). */
export interface VbuWorkspace {
  flags: Record<string, unknown>;
  effective: {
    contactless: boolean;
    canSkip: boolean;
    onboardingV2: boolean;
    invitationV2: boolean;
    disableManual: boolean;
    dupFields: string[];
    sameGstMulti: boolean;
    extraFieldNames: string[];
    requiredExtraFields: boolean;
    customProfiles: string[];
    /** ok = a usable duplicate-field list; empty = none; no-anchor / unknown-field = set but rejected by the backend */
    dupFieldsState: "ok" | "empty" | "no-anchor" | "unknown-field";
  };
}

export async function resolveVbuWorkspace(companyId: number): Promise<VbuWorkspace | null> {
  try {
    const m = await vbu();
    const flags = await m.resolveVbuFlags(companyId);
    const extra = Array.isArray(flags.extra_fields_for_vendor_invite) ? (flags.extra_fields_for_vendor_invite as any[]) : [];
    const profiles = Array.isArray(flags.vendor_category_type_mapping)
      ? (flags.vendor_category_type_mapping as any[]).map((e) => e?.key).filter((k) => typeof k === "string" && k)
      : [];
    const onboardingV2 = flags.vendor_onboarding_version === "v2";
    return {
      flags,
      effective: {
        contactless: m.rubyTruthy(flags.allow_contactless_vendor_upload),
        canSkip: onboardingV2 && m.railsPresent(flags.can_skip_vendor_onboarding),
        onboardingV2,
        invitationV2: m.rubyTruthy(flags.vendor_invitation_v2),
        disableManual: m.rubyTruthy(flags.disable_manual_vendor_creation),
        dupFields: Array.isArray(flags.vendor_duplicate_check_fields) ? (flags.vendor_duplicate_check_fields as string[]) : [],
        sameGstMulti: m.rubyTruthy(flags.allow_same_gst_multiple_addresses_vendor_invite),
        extraFieldNames: extra.map((f) => f?.name).filter(Boolean),
        requiredExtraFields: extra.some((f) => f?.configuration?.is_required === true),
        customProfiles: [...new Set(profiles)] as string[],
        dupFieldsState: dupState(flags.vendor_duplicate_check_fields, extra.map((f) => f?.key).filter(Boolean)),
      },
    };
  } catch (e) {
    console.log(`[vendorBulk] settings could not be read: ${(e as Error).message}`);
    return null;
  }
}

/** The backend's own reading of vendor_duplicate_check_fields (PR16267 duplicate_check_fields.rb:58-82). */
function dupState(v: unknown, extraKeys: string[]): "ok" | "empty" | "no-anchor" | "unknown-field" {
  if (!Array.isArray(v) || !v.length) return "empty";
  const names = v.map((x) => String(x).trim()).filter(Boolean);
  if (!names.includes("gst_no")) return "no-anchor";
  const base = ["gst_no", "pan_no", "address", "pincode"];
  return names.every((n) => base.includes(n) || extraKeys.includes(n)) ? "ok" : "unknown-field";
}

/** Why this case must not run here, or null. Synchronous: the workspace was read beforehand. */
export function vbuSkipReason(
  bulk: BulkSpec,
  ws: VbuWorkspace | null | undefined,
  opts: { realMail?: boolean; creates?: boolean; hasUser?: boolean },
): string | null {
  if (bulk.tier === "real-mail" && !opts.realMail)
    return (
      "this case creates a Prospect, and the backend then emails the workspace's vendor-management team " +
      "(real people on the sandbox). It runs only when the run is started with realMail=1."
    );
  if (bulk.tier === "creates" && opts.creates === false) return "creating test vendors was switched off for this run (vbuCreate=0)";
  if (bulk.kind !== "http" && opts.hasUser === false)
    return "the session has no users.id to read the staged rows by (token clients cannot run bulk cases)";
  const r = bulk.requires ?? {};
  if (!Object.keys(r).length) return null;
  if (!ws) return "this workspace's vendor settings could not be read, so whether the case applies is unknown";
  const e = ws.effective;
  const want = (name: string, need: boolean, have: boolean) =>
    need === have ? null : `this case needs ${name} ${need ? "ON" : "OFF"}; it is ${have ? "ON" : "OFF"} here, so the outcome it expects would not apply`;
  const checks: (string | null)[] = [
    r.contactless !== undefined ? want("allow_contactless_vendor_upload", !!r.contactless, e.contactless) : null,
    r.canSkip !== undefined ? want("can_skip_vendor_onboarding (with onboarding v2)", !!r.canSkip, e.canSkip) : null,
    r.invitationV2 !== undefined ? want("vendor_invitation_v2", !!r.invitationV2, e.invitationV2) : null,
    r.onboardingV2 !== undefined ? want("vendor_onboarding_version v2", !!r.onboardingV2, e.onboardingV2) : null,
    r.disableManual !== undefined ? want("disable_manual_vendor_creation", !!r.disableManual, e.disableManual) : null,
    r.sameGstMulti !== undefined ? want("allow_same_gst_multiple_addresses_vendor_invite", !!r.sameGstMulti, e.sameGstMulti) : null,
    r.requiredExtraFields !== undefined ? want("a required extra field", !!r.requiredExtraFields, e.requiredExtraFields) : null,
  ];
  if (r.dupFieldsEmpty !== undefined && (e.dupFieldsState === "empty") !== !!r.dupFieldsEmpty)
    checks.push(`this case needs vendor_duplicate_check_fields ${r.dupFieldsEmpty ? "NOT set" : "set"}; here it is [${e.dupFields.join(", ")}]`);
  if (typeof r.dupFieldsState === "string" && e.dupFieldsState !== r.dupFieldsState)
    checks.push(`this case needs a vendor_duplicate_check_fields list that is "${r.dupFieldsState}"; here it is "${e.dupFieldsState}" ([${e.dupFields.join(", ")}])`);
  if (Array.isArray(r.dupFieldsInclude)) {
    const missing = (r.dupFieldsInclude as string[]).filter((f) => !e.dupFields.includes(f));
    if (missing.length) checks.push(`this case needs vendor_duplicate_check_fields to list ${missing.join(", ")}; here it is [${e.dupFields.join(", ")}]`);
  }
  if (r.extraField === "__custom_profiles__" && !e.customProfiles.length)
    checks.push("this case needs vendor_category_type_mapping (the workspace's own profiles); it is not set here");
  else if (typeof r.extraField === "string" && r.extraField !== "__custom_profiles__" && !e.extraFieldNames.includes(r.extraField))
    checks.push(`this case needs an extra field '${r.extraField}'; this workspace has none`);
  return checks.find(Boolean) ?? null;
}

// ── per-run state ────────────────────────────────────────────────────────

interface RunState {
  template?: Awaited<ReturnType<Vbu["fetchTemplate"]>>;
  templateError?: string;
  vars: Record<string, string>;
  baselines: Map<string, Promise<{ ok: boolean; why?: string }>>;
}
const runs = new Map<string, Promise<RunState>>();

async function runState(client: Client, stamp: string): Promise<RunState> {
  const key = `${client.ctx.companyId}:${stamp}`;
  let p = runs.get(key);
  if (!p) {
    p = (async () => {
      const m = await vbu();
      let last = "";
      // The sandbox drops the odd request; three tries before giving up.
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const template = await m.fetchTemplate(client.ctx.buyerApi);
          return { template, vars: m.runVars(stamp, template), baselines: new Map() };
        } catch (e) {
          last = (e as Error).message;
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
      return { templateError: last, vars: m.runVars(stamp), baselines: new Map() };
    })();
    runs.set(key, p);
  }
  const state = await p;
  // A failed download is not remembered: the next case tries again.
  if (!state.template) runs.delete(key);
  return state;
}

// ── verdicts ─────────────────────────────────────────────────────────────

type Verdict = { pass: boolean; verdict: string; inconclusive?: boolean };
const TAX_TRAP = "Tax Type not configured for the selected Business Location";
const WORKER_CRASH = /internal error|could not be started|undefined method|nomethoderror/i;

function outcome(
  v: Verdict,
  extra: Partial<CheckOutcome> & Record<string, unknown> = {},
): CheckOutcome {
  return {
    httpStatus: (extra.httpStatus as number | null) ?? 200,
    accepted: extra.accepted ?? true,
    message: (extra.message as string | null) ?? null,
    durationMs: (extra.durationMs as number) ?? 0,
    ...(extra as object),
    verdictOverride: v,
  } as CheckOutcome;
}

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));

function dig(obj: any, path: string): unknown {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

async function verifyRow(
  companyId: number,
  row: { data: Record<string, unknown> },
  exp: NonNullable<RowExpect["verify"]>,
  vars: Record<string, string>,
): Promise<string[]> {
  const m = await vbu();
  const name = String(row.data["Company Name"] ?? "");
  const found = await m.findVendorsByName(companyId, name);
  const problems: string[] = [];
  if (exp.absent) {
    if (found.length) problems.push(`vendor "${name}" WAS created (company ${found[0].companyId}, mapping ${found[0].bscmStatus}) although the row was refused`);
    return problems;
  }
  const v = found[0];
  if (!v) return [`no vendor named "${name}" exists for this workspace`];
  if (exp.bscm && v.bscmStatus !== exp.bscm) problems.push(`mapping status ${v.bscmStatus} (expected ${exp.bscm})`);
  const own = v.invitations.filter((i) => i.inviteType !== "vendor_member_invite");
  if (exp.invitations !== undefined && v.invitations.length !== exp.invitations)
    problems.push(`${v.invitations.length} invitation(s) (expected ${exp.invitations})`);
  if (exp.invitationStatus && own[0]?.status !== exp.invitationStatus)
    problems.push(`invitation status ${own[0]?.status ?? "none"} (expected ${exp.invitationStatus})`);
  if (exp.skipOnboarding !== undefined && own[0] && !!own[0].skipVendorOnboarding !== exp.skipOnboarding)
    problems.push(`invitation skip_vendor_onboarding=${String(own[0].skipVendorOnboarding)} (expected ${exp.skipOnboarding})`);
  if (exp.subsidiary && !v.invitations.some((i) => i.isSubsidiary)) problems.push("no subsidiary invitation");
  const sub = v.invitations.find((i) => i.isSubsidiary);
  if (exp.subsidiary && sub && exp.skipOnboarding !== undefined && !!sub.skipVendorOnboarding !== exp.skipOnboarding)
    problems.push(`subsidiary invitation skip_vendor_onboarding=${String(sub.skipVendorOnboarding)} (expected ${exp.skipOnboarding})`);
  if (exp.minUsers !== undefined && v.users < exp.minUsers) problems.push(`${v.users} user(s) mapped (expected ≥ ${exp.minUsers})`);
  for (const [k, want] of Object.entries(exp.fields ?? {})) {
    const got =
      k === "city" ? v.cityName :
      k === "city_id" ? v.cityId :
      k === "gst_no" ? v.gstNo :
      k === "pan_no" ? v.panNo :
      k === "address" ? v.address :
      k === "vendor_code" ? v.vendorCode :
      k === "name" ? v.name :
      k.startsWith("misc.") ? dig(v.misc, k.slice(5)) : undefined;
    const w = want === null ? null : fill(want, vars);
    if ((got ?? null) !== w && String(got ?? "") !== String(w ?? "")) problems.push(`${k} = ${JSON.stringify(got)} (expected ${JSON.stringify(w)})`);
  }
  return problems;
}

async function matchRow(
  companyId: number,
  actual: { status: string; error: string | null; data: Record<string, unknown> },
  exp: RowExpect,
  vars: Record<string, string>,
): Promise<string[]> {
  const p: string[] = [];
  if (actual.status !== exp.status) p.push(`status ${actual.status}${actual.error ? ` "${actual.error}"` : ""} (expected ${exp.status}${exp.error ? ` "${exp.error}"` : exp.errorIncludes ? ` "…${exp.errorIncludes}…"` : ""})`);
  else {
    if (exp.error !== undefined && (actual.error ?? "").trim() !== fill(exp.error, vars)) p.push(`error "${actual.error}" (expected "${fill(exp.error, vars)}")`);
    if (exp.errorIncludes && !(actual.error ?? "").toLowerCase().includes(fill(exp.errorIncludes, vars).toLowerCase()))
      p.push(`error "${actual.error}" (expected it to contain "${fill(exp.errorIncludes, vars)}")`);
  }
  for (const [k, want] of Object.entries(exp.dataEquals ?? {})) {
    const got = String(actual.data[k] ?? "");
    if (got !== fill(want, vars)) p.push(`parsed ${k} = ${JSON.stringify(got)} (sheet said ${JSON.stringify(fill(want, vars))})`);
  }
  for (const [k, bad] of Object.entries(exp.dataExcludes ?? {})) {
    if (String(actual.data[k] ?? "").toLowerCase().includes(bad.toLowerCase())) p.push(`parsed ${k} still contains ${JSON.stringify(bad)}`);
  }
  // Only look the vendor up when the row reached the state the check is about.
  if (exp.verify && (actual.status === exp.status || exp.verify.absent)) p.push(...(await verifyRow(companyId, actual, exp.verify, vars)));
  return p;
}

function describeRows(rows: { status: string; error: string | null }[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.status}${r.error ? ` "${r.error}"` : ""}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => (n > 1 ? `${n}× ${k}` : k)).join("; ") || "no rows staged";
}

// ── the exec functions ───────────────────────────────────────────────────

/** What the case library knows about the case, carried into its evidence record. */
export interface BulkCaseMeta {
  method: string;
  path: string;
  expectedResult?: string;
  rule?: string;
  qaDoc?: string[];
  steps?: string[];
}

const sevToPri: Record<string, string> = { Critical: "P0", High: "P1", Medium: "P2", Low: "P3" };

export function makeBulkExec(bulk: BulkSpec, stamp: string, caseId: string, meta: BulkCaseMeta = { method: "POST", path: "/v1/bulk_create_vendor" }) {
  return async (client: Client): Promise<CheckOutcome> => {
    const t0 = Date.now();
    const m = await vbu();
    const companyId: number = client.ctx.companyId;
    const st = await runState(client, stamp);
    const vars = st.vars;
    let api = client.ctx.buyerApi;
    let userId: number | undefined = (client.ctx as any).buyerUserId;
    let actorLabel = "workspace admin (the run's session)";

    const ev: VbuEvidence = {
      schema: "vbu.evidence.v1",
      id: `${stamp}/${caseId}`,
      caseId,
      runStamp: stamp,
      recordedAt: new Date().toISOString(),
      companyId,
      actor: actorLabel,
      tier: bulk.tier,
      request: { method: meta.method, path: meta.path },
      expected: { text: meta.expectedResult, rows: bulk.rows ?? bulk.inviteExpect ?? bulk.refuse },
      verdict: { pass: false, text: "" },
      rule: meta.rule,
      qaDoc: meta.qaDoc,
      steps: meta.steps,
    };

    /** Every exit goes through here: it writes the evidence record and names the bug. */
    const finish = (v: Verdict, extra: Record<string, unknown> = {}): CheckOutcome => {
      ev.actor = actorLabel;
      ev.verdict = { pass: v.pass, inconclusive: v.inconclusive, text: v.verdict };
      const bug = !v.pass && !v.inconclusive ? bugForCase(caseId) : undefined;
      if (bug) ev.bug = bug;
      let evidenceRef: string | undefined;
      try {
        evidenceRef = writeEvidence(ev);
      } catch {
        /* evidence is best effort; the verdict stands */
      }
      // A failing row case answers HTTP 200, so the message is what tells a
      // bug sheet reader what went wrong.
      const line = v.pass ? null : v.verdict.replace(/\s*\[\d+ row\(s\) in \d+ s\]$/, "").slice(0, 300);
      return outcome(v, {
        durationMs: Date.now() - t0,
        ...extra,
        message: (extra.message as string | null | undefined) ?? line,
        ...(evidenceRef ? { evidenceRef } : {}),
        ...(bug
          ? { knownBug: { id: bug.id, sheet: "Vendor bulk upload — QA platform (config/vbuBugs.json)", title: bug.title, status: bug.status, reported: bug.found, priority: sevToPri[bug.severity] ?? "P2", blocker: bug.severity === "Critical" } }
          : {}),
      });
    };

    try {
      if (bulk.actor) {
        const a = await actorApi(client, bulk.actor);
        if ("unavailable" in a) return finish({ pass: false, inconclusive: true, verdict: `could not act as ${bulk.actor}: ${a.unavailable}` });
        api = a.api;
        userId = a.userId;
        actorLabel = a.label;
      }

      // ── a plain request made as another actor ──
      if (bulk.kind === "http") {
        const r = await api.raw(meta.method, meta.path, meta.method === "GET" ? {} : { body: {} });
        ev.http = { status: r.status, message: r.message ?? null };
        const refused = !r.ok;
        if (r.status >= 500) return finish({ pass: false, verdict: `server error ${r.status}` }, { httpStatus: r.status, accepted: false });
        if (refused) return finish({ pass: true, verdict: `correctly refused (HTTP ${r.status}${r.message ? `: ${r.message}` : ""})` }, { httpStatus: r.status, accepted: false, message: r.message ?? null });
        return finish({ pass: false, verdict: `SERVED a request this user may not make (HTTP 200) — as ${actorLabel}` }, { httpStatus: 200, accepted: true });
      }

      if (bulk.kind === "template") return finish(await templateVerdict(bulk.templateCheck ?? "headers", st, client));
      if (bulk.kind === "errorSheet" && bulk.errorSheetCheck !== "realJob") return finish(await errorSheetVerdict(bulk, api));
      if (!userId) return finish({ pass: false, inconclusive: true, verdict: "no users.id for this session — staged rows cannot be read" });
      // Fixtures name this workspace's own profile and category values, which
      // come from its template. Guessing them would make every row fail for
      // the wrong reason, so without the template nothing is sent.
      if (!st.template)
        return finish({ pass: false, inconclusive: true, verdict: `the workspace template could not be downloaded (${st.templateError}), so the per-workspace values the sheet needs are unknown — nothing was uploaded` });

      if (bulk.baseline) {
        const b = await ensureBaseline(client, stamp, (client.ctx as any).buyerUserId, bulk.baseline);
        if (!b.ok)
          return finish({
            pass: false,
            inconclusive: true,
            verdict:
              `the baseline vendor (${bulk.baseline}) could not be created (${b.why}) — nothing to compare against` +
              (b.why?.includes(TAX_TRAP) ? "; blocked by the sandbox's duplicate 'India' countries (see VBU-059)" : ""),
          });
      }

      // ── the single-vendor Invite Vendor call ──
      if (bulk.kind === "manualInvite") {
        const body = JSON.parse(fill(JSON.stringify(bulk.inviteBody ?? {}), vars));
        ev.request = { method: "POST", path: "/invitations/send_invite", body };
        const r = await api.raw("POST", "/invitations/send_invite", { body });
        ev.http = { status: r.status, message: r.message ?? null };
        const found = await m.findVendorsByName(companyId, String(body.firm_name ?? ""));
        ev.records = found.map(recordOf);
        const exp = bulk.inviteExpect ?? { http: "accept" };
        const detail = { httpStatus: r.ok ? 200 : r.status, accepted: r.ok, message: r.ok ? null : r.message ?? null };
        if (r.status >= 500) return finish({ pass: false, verdict: `server error ${r.status} on send_invite` }, detail);
        if (exp.http === "reject") {
          if (r.ok)
            return finish({ pass: false, verdict: `ACCEPTED an invite that should be refused${found[0] ? ` — vendor ${found[0].companyId} created (mapping ${found[0].bscmStatus}, ${found[0].invitations.length} invitation(s))` : ""}` }, detail);
          if (exp.message && !(r.message ?? "").toLowerCase().includes(exp.message.toLowerCase().replace(/\.$/, "")))
            return finish({ pass: false, verdict: `refused (HTTP ${r.status}) but with "${r.message}" — expected "${exp.message}"` }, detail);
          if (exp.verify?.absent && found.length) return finish({ pass: false, verdict: `refused, but vendor ${found[0].companyId} exists` }, detail);
          return finish({ pass: true, verdict: `correctly refused (HTTP ${r.status}: ${r.message})` }, detail);
        }
        if (!r.ok) return finish({ pass: false, verdict: `REFUSED an invite that should be accepted (HTTP ${r.status}: ${r.message})` }, detail);
        const probs = exp.verify ? await verifyRow(companyId, { data: { "Company Name": body.firm_name } }, exp.verify, vars) : [];
        return probs.length ? finish({ pass: false, verdict: probs.join(" · ") }, detail) : finish({ pass: true, verdict: "accepted and the vendor matches" }, detail);
      }

      const fx = m.loadFixture(bulk.fixture!, vars);
      ev.fixture = { file: bulk.fixture!, bytes: fx.bytes, vars, ...(bulk.fixture2 ? { file2: bulk.fixture2 } : {}) };
      ev.sheet = sheetGrid(fx.base64);
      const excel = bulk.wrap === "dataUrl" ? `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${fx.base64}` : fx.base64;
      let extraBody: Record<string, unknown> = {};
      if (bulk.payload === "onboarding") {
        const pl = await onboardingPayload(api, stamp);
        if ("unavailable" in pl) return finish({ pass: false, inconclusive: true, verdict: `the onboarding payload could not be built: ${pl.unavailable}` });
        extraBody = pl;
      }
      ev.request = { method: "POST", path: "/v1/bulk_create_vendor", body: { excel_data: `<base64 of ${bulk.fixture}, ${fx.bytes} bytes>`, ...(Object.keys(extraBody).length ? { configurations: (extraBody as any).configurations, forms: "<the template's forms>" } : {}) } };

      // ── two uploads at the same moment ──
      if (bulk.kind === "concurrent") {
        const fx2 = m.loadFixture(bulk.fixture2!, vars);
        const before = await m.lastJobId(userId);
        const [h1, h2] = await Promise.all([
          api.raw("POST", "/v1/bulk_create_vendor", { body: { excel_data: fx.base64 }, timeoutMs: 180_000 }),
          api.raw("POST", "/v1/bulk_create_vendor", { body: { excel_data: fx2.base64 }, timeoutMs: 180_000 }),
        ]);
        ev.http = { status: h1.ok && h2.ok ? 200 : (h1.ok ? h2.status : h1.status), message: h1.message ?? h2.message ?? null };
        if (!h1.ok || !h2.ok) return finish({ pass: false, verdict: `an upload was refused (HTTP ${h1.status}/${h2.status})` }, { httpStatus: ev.http.status, accepted: false });
        let rows: any[] = [];
        for (let i = 0; i < 60; i++) {
          rows = await m.readJobRows(userId, before);
          if (rows.length >= 2 && !rows.some((r) => r.status === "in_progress")) break;
          await new Promise((r) => setTimeout(r, 2500));
        }
        const jobIds = [...new Set(rows.map((r) => r.jobId))];
        ev.job = { jobIds, staged: rows.length, waitedMs: Date.now() - t0 };
        ev.rows = rows.map((r, i) => ({ rowNo: i + 4, jobId: r.jobId, status: r.status, error: r.error, parsed: pick(r.data, ev.sheet?.headers) }));
        if (jobIds.length === 1 && rows.length >= 2)
          return finish({ pass: false, verdict: `both uploads were staged under ONE job id (${jobIds[0]}) — their rows, status line and error sheet are mixed` });
        return finish({ pass: true, verdict: `two separate jobs (${jobIds.join(", ")})` });
      }

      const out = await m.uploadAndWait(api, userId, { excel_data: excel, ...extraBody }, { timeoutMs: bulk.everyRow ? 600_000 : 240_000 });
      const http = out.http;
      ev.http = { status: http.ok ? 200 : http.status, message: http.ok ? null : http.message ?? null, ms: out.waitedMs };
      ev.job = { jobIds: [...new Set(out.rows.map((r) => r.jobId))], staged: out.rows.length, waitedMs: out.waitedMs, statusApi: out.statusApi };
      ev.rows = out.rows.slice(0, bulk.everyRow ? 5 : 20).map((r, i) => ({ rowNo: i + 4, jobId: r.jobId, status: r.status, error: r.error, parsed: pick(r.data, ev.sheet?.headers) }));
      const detail = {
        httpStatus: http.ok ? 200 : http.status || null,
        accepted: http.ok,
        message: http.ok ? null : http.message ?? null,
        bulk: { fixture: bulk.fixture, bytes: fx.bytes, jobId: out.jobId, staged: out.rows.length, waitedMs: out.waitedMs, rows: out.rows.slice(0, 20).map((r) => ({ status: r.status, error: r.error })), statusApi: out.statusApi },
      };

      if (!http.ok && http.status === 0)
        return finish({ pass: false, inconclusive: true, verdict: `the upload request never completed (${(http.message ?? "").split("\n")[0]}) — network, not a product answer` }, detail);
      if (!http.ok && http.status >= 500) return finish({ pass: false, verdict: `server error ${http.status} on upload — a 5xx is always a defect (${http.message ?? ""})` }, detail);
      if (bulk.refuse) {
        if (!http.ok) {
          const want = bulk.refuse.message;
          if (want && !(http.message ?? "").toLowerCase().includes(want.toLowerCase().replace(/\.$/, "")))
            return finish({ pass: false, verdict: `refused (HTTP ${http.status}) but with "${http.message}" — expected "${want}"` }, detail);
          return finish({ pass: true, verdict: `correctly refused (HTTP ${http.status}: ${http.message})` }, detail);
        }
        return finish({ pass: false, verdict: `ACCEPTED a file that should be refused (HTTP 200, ${out.rows.length} row(s) staged${out.rows.length ? `: ${describeRows(out.rows)}` : " — the buyer is told 'Vendors Sheet Uploaded' and nothing appears"})${bulk.actor ? ` — as ${actorLabel}` : ""}` }, detail);
      }
      if (!http.ok) return finish({ pass: false, verdict: `the upload itself was refused (HTTP ${http.status}: ${http.message}) — the rows were never processed` }, detail);
      if (out.timedOut)
        return finish({ pass: false, inconclusive: true, verdict: `${out.rows.filter((r) => r.status === "in_progress").length} row(s) still in_progress after ${Math.round(out.waitedMs / 1000)} s — the sandbox's bulk_upload queue did not drain; nothing proved` }, detail);

      // The sandbox's duplicate "India" countries (see VBU-059) make the tax
      // lookup fail before the rule under test is reached. That proves nothing
      // about the case, so it is reported as blocked, not as a product verdict.
      const taxTrap = out.rows.some((r) => r.error === TAX_TRAP) && !(bulk.rows ?? []).some((e) => e.error === TAX_TRAP) && caseId !== "VBU-059";
      if (taxTrap)
        return finish({ pass: false, inconclusive: true, verdict: `blocked by sandbox master data: the row stopped at "${TAX_TRAP}" before reaching the rule under test — Country.find_by(name: 'India') picks one of 36 'India' rows whose GST mapping is inactive (see VBU-059)` }, detail);

      const crashed = out.rows.filter((r) => r.error && WORKER_CRASH.test(r.error));
      const expected = bulk.rows ?? [];
      const problems: string[] = [];
      if (bulk.everyRow) {
        const bad = out.rows.filter((r) => r.status !== expected[0]?.status || (expected[0]?.error && r.error !== expected[0].error));
        if (bad.length) problems.push(`${bad.length} of ${out.rows.length} rows differ: ${describeRows(bad)}`);
      } else if (bulk.anyOrder) {
        const pool = [...out.rows];
        if (pool.length !== expected.length) problems.push(`${pool.length} row(s) staged (expected ${expected.length})`);
        for (const e of expected) {
          let hit = -1;
          for (let i = 0; i < pool.length; i++) if (!(await matchRow(companyId, pool[i], e, vars)).length) { hit = i; break; }
          if (hit >= 0) pool.splice(hit, 1);
          else problems.push(`no row came out as ${e.status}${e.error ? ` "${e.error}"` : e.errorIncludes ? ` "…${e.errorIncludes}…"` : ""}`);
        }
      } else {
        if (out.rows.length !== expected.length) problems.push(`${out.rows.length} row(s) staged (expected ${expected.length})`);
        for (let i = 0; i < Math.min(out.rows.length, expected.length); i++) {
          const p = await matchRow(companyId, out.rows[i], expected[i], vars);
          if (p.length) problems.push(`row ${i + 1}: ${p.join("; ")}`);
        }
      }

      if (bulk.kind === "errorSheet" || bulk.kind === "formulaSheet") problems.push(...(await errorSheetOfJob(bulk, api, out.rows.length)));
      if (bulk.kind === "errorSheetReupload") problems.push(...(await reuploadErrorSheet(api, userId, out.rows, ev)));

      // What the rows created, for the report: every vendor a row named.
      const names = [...new Set(out.rows.slice(0, 10).map((r) => String(r.data["Company Name"] ?? "")).filter(Boolean))];
      if (!bulk.everyRow && names.length) {
        const recs: VbuEvidence["records"] = [];
        for (const n of names.slice(0, 6)) for (const v of await m.findVendorsByName(companyId, n)) recs.push(recordOf(v));
        ev.records = recs;
      }

      const timing = `${out.rows.length} row(s) in ${Math.round(out.waitedMs / 1000)} s`;
      if (crashed.length)
        return finish({ pass: false, verdict: `worker error (the async 500): ${describeRows(crashed)}${problems.length ? ` · also: ${problems.join(" · ")}` : ""}` }, { ...detail, asyncServerError: true });
      if (problems.length) return finish({ pass: false, verdict: `${problems.join(" · ")} [${timing}]` }, detail);
      return finish({ pass: true, verdict: `every row came out as documented: ${describeRows(out.rows)} [${timing}]` }, detail);
    } catch (e) {
      return finish({ pass: false, inconclusive: true, verdict: `the runner could not complete ${caseId}: ${(e as Error).message}` }, { accepted: false });
    }
  };
}

/** The parsed values of a staged row, limited to the columns the sheet used. */
function pick(data: Record<string, unknown>, headers?: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const h of headers ?? Object.keys(data)) if (h in data) out[h] = data[h];
  for (const k of ["city_id", "tax_no", "pan_no"]) if (k in data) out[k] = data[k];
  return out;
}

function recordOf(v: any): NonNullable<VbuEvidence["records"]>[number] {
  const misc = v.misc && typeof v.misc === "object" ? Object.fromEntries(Object.entries(v.misc).filter(([k]) => k !== "category_data" || true)) : null;
  return {
    companyId: v.companyId, name: v.name, bscm: v.bscmStatus, city: v.cityName, cityId: v.cityId, gstNo: v.gstNo, panNo: v.panNo,
    address: v.address, vendorCode: v.vendorCode, misc, invitations: v.invitations,
  };
}

/** Download the job's error sheet and upload it back; the rows must fail the same way again. */
async function reuploadErrorSheet(api: any, userId: number, firstRows: { error: string | null }[], ev: VbuEvidence): Promise<string[]> {
  const m = await vbu();
  const st = await api.raw("GET", "/v1/bulk_create_vendor_status");
  const job = ((st.data as any)?.jobs ?? [])[0];
  if (!job?.job_uuid) return ["no job to download an error sheet for"];
  const r = await api.raw("GET", `/v1/bulk_create_vendor_error_sheet?job_uuid=${encodeURIComponent(job.job_uuid)}`);
  if (!r.ok) return [`error sheet refused (HTTP ${r.status}: ${r.message})`];
  const buf = Buffer.from(await (await fetch((r.data as any).excel_url)).arrayBuffer());
  const again = await m.uploadAndWait(api, userId, { excel_data: buf.toString("base64") });
  (ev as any).reupload = {
    http: again.http.ok ? 200 : again.http.status,
    message: again.http.message ?? null,
    rows: again.rows.map((x) => ({ jobId: x.jobId, status: x.status, error: x.error })),
  };
  if (!again.http.ok) return [`re-uploading the error sheet was refused (HTTP ${again.http.status}: ${again.http.message})`];
  const want = firstRows.map((x) => x.error).join(" | ");
  const got = again.rows.map((x) => x.error).join(" | ");
  return want === got ? [] : [`re-uploaded rows came out "${got}" (first upload: "${want}")`];
}

async function ensureBaseline(client: Client, stamp: string, userId: number, fixture: string): Promise<{ ok: boolean; why?: string }> {
  const st = await runState(client, stamp);
  if (!st.baselines.has(fixture)) {
    st.baselines.set(fixture, (async () => {
      const m = await vbu();
      const fx = m.loadFixture(fixture, st.vars);
      const out = await m.uploadAndWait(client.ctx.buyerApi, userId, { excel_data: fx.base64 });
      if (!out.http.ok) return { ok: false, why: `upload refused: ${out.http.message}` };
      const r = out.rows[0];
      if (!r || r.status !== "success") return { ok: false, why: r ? `${r.status} "${r.error}"` : "no row staged" };
      return { ok: true };
    })());
  }
  return st.baselines.get(fixture)!;
}

// ── template checks ──────────────────────────────────────────────────────

async function templateVerdict(check: string, st: RunState, client: Client): Promise<Verdict> {
  if (!st.template) return { pass: false, verdict: `the template could not be downloaded: ${st.templateError}` };
  const t = st.template;
  const ws = await resolveVbuWorkspace(client.ctx.companyId);
  const e = ws?.effective;
  const col = (name: string) => {
    const i = t.headers.indexOf(name);
    return i < 0 ? null : XLSX.utils.encode_col(i);
  };
  switch (check) {
    case "headers": {
      const want = [
        "Company Name", "Tax Type", "Tax No.", "Business Location", "City", "Address", "Vendor Profile",
        "POC - Full Name", "POC - Email Address", "Vendor Code", "VRP Code", "PAN No.", "Pincode",
        "POC 2 - Full Name", "POC 2 - Email Address", "Deals In", "Status",
        ...(e?.extraFieldNames ?? []),
        ...(e?.canSkip ? ["Vendor Onboarding Required"] : []),
      ];
      const missing = want.filter((h) => !t.headers.includes(h));
      return missing.length
        ? { pass: false, verdict: `template is missing ${missing.join(", ")} (has ${t.headers.length} columns)` }
        : { pass: true, verdict: `all ${want.length} expected columns present (${t.headers.length} in the file)` };
    }
    case "sampleAligned": {
      const want: Record<string, string> = {
        "Company Name": "Procol", "POC - Full Name": "Procol Contact", "POC - Email Address": "example@procol.in", City: "Gurgaon", Address: "Platina Tower",
      };
      const off = Object.entries(want).filter(([h, v]) => t.sampleRow[h] !== v);
      if (!off.length) return { pass: true, verdict: "the sample row lines up with its headers" };
      const where = Object.entries(t.sampleRow).filter(([, v]) => v).map(([h, v]) => `${h}="${v.length > 24 ? v.slice(0, 24) + "…" : v}"`);
      return { pass: false, verdict: `sample row is shifted against the headers — ${off.map(([h, v]) => `${h} should be "${v}" but is "${t.sampleRow[h] ?? ""}"`).join("; ")}. Row 4 as downloaded: ${where.join(", ")}` };
    }
    case "dropdowns": {
      const expectCol: Record<string, string | null> = {
        "Invalid Vendor Profile": col("Vendor Profile"),
        "Invalid Tax Type": col("Tax Type"),
        "Invalid Business Location": col("Business Location"),
        "Invalid Status": col("Status"),
        ...(e?.canSkip ? { "Invalid Vendor Onboarding Required": col("Vendor Onboarding Required") } : {}),
      };
      const problems: string[] = [];
      const perCol = new Map<string, string[]>();
      for (const v of t.validations) {
        const c = v.sqref.replace(/\d.*$/, "");
        perCol.set(c, [...(perCol.get(c) ?? []), v.title]);
        const want = expectCol[v.title];
        if (want !== undefined && want !== c) problems.push(`"${v.title}" list is on column ${c} (${t.headers[XLSX.utils.decode_col(c)] ?? "?"}) — expected ${want} (${t.headers[XLSX.utils.decode_col(want ?? "A")]})`);
      }
      for (const [c, titles] of perCol) if (titles.length > 1) problems.push(`column ${c} carries ${titles.length} dropdowns (${titles.join(", ")})`);
      for (const title of Object.keys(expectCol)) if (!t.validations.some((v) => v.title === title)) problems.push(`no "${title}" dropdown`);
      return problems.length ? { pass: false, verdict: problems.join(" · ") } : { pass: true, verdict: `${t.validations.length} dropdowns, each on its own column` };
    }
    case "dimension":
      return t.declaredRef === t.actualRef
        ? { pass: true, verdict: `declared range ${t.declaredRef} matches the cells` }
        : { pass: false, verdict: `the file declares ${t.declaredRef} but cells run to ${t.actualRef} — readers that trust the declared range drop the last column(s): ${t.headers.slice(XLSX.utils.decode_range(t.declaredRef).e.c + 1).join(", ")}` };
    case "dataSheet": {
      const problems: string[] = [];
      const wantProfiles = e?.customProfiles.length ? e.customProfiles : ["manufacturer", "brokerage"];
      const miss = wantProfiles.filter((p) => !t.dataSheet.profiles.includes(p));
      if (miss.length) problems.push(`Vendor Profiles missing ${miss.join(", ")} (has ${t.dataSheet.profiles.join(", ")})`);
      if (e?.canSkip && t.dataSheet.onboarding.join(",") !== "Yes,No") problems.push(`Vendor Onboarding Required offers [${t.dataSheet.onboarding.join(", ")}]`);
      if (t.dataSheet.statuses.join(",") !== "rejected,active") problems.push(`Status offers [${t.dataSheet.statuses.join(", ")}]`);
      return problems.length ? { pass: false, verdict: problems.join(" · ") } : { pass: true, verdict: `profiles ${t.dataSheet.profiles.join(", ")}; onboarding ${t.dataSheet.onboarding.join("/") || "n/a"}; ${t.dataSheet.categories.length} categories` };
    }
    case "groups": {
      const optional = ["POC - Full Name", "POC - Email Address", "Vendor Profile", "City", "Address"];
      const wrong = optional.filter((h) => t.group[h] !== "optional");
      if (t.group["Company Name"] !== "mandatory") wrong.unshift("Company Name (should be mandatory)");
      return wrong.length ? { pass: false, verdict: `wrong group for: ${wrong.join(", ")}` } : { pass: true, verdict: "only Company Name (and the With-Tax trio) is under Mandatory Details" };
    }
  }
  return { pass: false, inconclusive: true, verdict: `unknown template check ${check}` };
}

// ── error sheet ──────────────────────────────────────────────────────────

async function errorSheetVerdict(bulk: BulkSpec, api: any): Promise<Verdict> {
  if (bulk.errorSheetCheck === "noJob") {
    const r = await api.raw("GET", "/v1/bulk_create_vendor_error_sheet");
    if (r.status >= 500) return { pass: false, verdict: `server error ${r.status}` };
    if (r.ok) return { pass: false, verdict: "ACCEPTED a request with no job id" };
    return /insufficient/i.test(r.message ?? "")
      ? { pass: true, verdict: `correctly refused (HTTP ${r.status}: ${r.message})` }
      : { pass: false, verdict: `refused with "${r.message}" — expected 'Insufficient parameters'` };
  }
  // A well-formed uuid for a job id that does not exist (999999999).
  const r = await api.raw("GET", "/v1/bulk_create_vendor_error_sheet?job_uuid=Z2dnWmdaUWtnZw%3D%3D");
  if (r.status >= 500) return { pass: false, verdict: `server error ${r.status}` };
  if (r.ok) return { pass: false, verdict: "served an error sheet for a job with no failed rows" };
  if (/phone/i.test(r.message ?? ""))
    return { pass: false, verdict: `refused (HTTP ${r.status}) with "${r.message}" — a message about phone numbers for a job with no failed rows (error 487 reused)` };
  return { pass: true, verdict: `refused with a relevant message (HTTP ${r.status}: ${r.message})` };
}

/** Download the error sheet of the newest job and check it. */
async function errorSheetOfJob(bulk: BulkSpec, api: any, staged: number): Promise<string[]> {
  const st = await api.raw("GET", "/v1/bulk_create_vendor_status");
  const job = ((st.data as any)?.jobs ?? [])[0];
  if (!job?.job_uuid) return ["the status list has no job to download an error sheet for"];
  const r = await api.raw("GET", `/v1/bulk_create_vendor_error_sheet?job_uuid=${encodeURIComponent(job.job_uuid)}`);
  if (!r.ok) return [`error sheet refused (HTTP ${r.status}: ${r.message})`];
  const url = (r.data as any)?.excel_url;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer", cellFormula: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const hdrRow = grid.findIndex((row) => row[0] === "Error");
  if (hdrRow < 0) return ["the error sheet has no 'Error' header column"];
  const data = grid.slice(hdrRow + 1).filter((row) => row.some((c) => c !== ""));
  const problems: string[] = [];
  if (data.length !== staged) problems.push(`error sheet lists ${data.length} row(s), job has ${staged} failed`);
  if (bulk.kind === "formulaSheet") {
    const nameCol = grid[hdrRow].indexOf("Company Name");
    const addr = XLSX.utils.encode_cell({ r: hdrRow + 1, c: nameCol });
    const cell: any = ws[addr];
    if (cell?.f) problems.push(`the Company Name cell (${addr}) is a LIVE FORMULA "=${cell.f}" — opening the error sheet runs what the uploader typed`);
  } else if (data[0] && !String(data[0][0]).length) problems.push("first failed row has an empty Error cell");
  return problems;
}
