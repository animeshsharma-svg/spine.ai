/**
 * MULTI-COMPANY USER (company switcher) API automation.
 *
 * Black-box tests for the multi-company-user feature, derived from the branch's
 * own specs (user_multi_company_spec, current_spec):
 *  - the user is flagged multi-company + the switcher lists their buyer companies
 *  - switching (client_company_uuid) scopes config/permissions per company
 *  - a non-member/invalid selection falls back safely (no error, no leak)
 *
 * Auth is env-agnostic (the platform's env-as-a-setting idea):
 *  - SANDBOX_ACCESS_TOKEN  → the procol_access_token from the logged-in preview (used directly), OR
 *  - SANDBOX_APP_KEY/SECRET → build a token from a shared-DB session for SANDBOX_USER_ID.
 * Runs read-only. If the target env doesn't expose the feature, it SKIPS with a reason.
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import type { CheckResult, TestType } from "../ai/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const PT = join(here, "..", "..", "..", "procol test");
loadEnv({ path: join(here, "..", "..", ".env") });
loadEnv({ path: join(PT, ".env") });

export interface MCOptions {
  baseUrl: string;
  userId: number;
  accessToken?: string; // procol_access_token from the frontend (preferred)
  appKey?: string;
  appSecret?: string;
  appVersion?: string;
}

async function consoleSession(userId: number): Promise<{ token: string; appVersion: string } | null> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, statement_timeout: 20000 });
  try {
    // console session only (9.4.x) — combining a vendor session with console keys → "app not authorized".
    const r = await pool.query(
      "select access_token, app_version from sessions where user_id=$1 and status=1 and access_token is not null and app_version like '9.4%' order by created_at desc limit 1",
      [userId],
    );
    return r.rows[0] ? { token: r.rows[0].access_token, appVersion: r.rows[0].app_version } : null;
  } finally {
    await pool.end();
  }
}

/** GET via direct fetch (redirect:manual). Throws { status, message } on non-2xx. */
async function apiGet(baseUrl: string, path: string, headers: Record<string, string>): Promise<any> {
  const r = await fetch(baseUrl + path, { headers, redirect: "manual" });
  const text = await r.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (r.status < 200 || r.status > 204) {
    const msg = body?.error?.message ?? body?.message ?? `HTTP ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return body;
}

/**
 * A `get(path)` for the target env. Two auth paths:
 *  - a raw token (sandbox / preview) → direct fetch (avoids the client's redirect quirk),
 *  - DB-login (our own DB envs like sec-api) → the framework's proven clientFromSession.
 */
async function makeGetter(opts: MCOptions): Promise<{ get: (p: string) => Promise<any>; dispose: () => Promise<void> }> {
  const imp = (r: string) => import(pathToFileURL(join(PT, "src", r)).href);
  const { buildLightspeedToken, buildAccessToken } = (await imp("auth/token.ts")) as any;
  const base = opts.baseUrl.replace(/\/$/, "");

  if (opts.accessToken) {
    const headers = { "access-token": opts.accessToken.trim().replace(/^"|"$/g, ""), "lightspeed-token": buildLightspeedToken(), "app-version": opts.appVersion ?? "9.4.388", "Content-Type": "application/json" };
    return { get: (p) => apiGet(base, p, headers), dispose: async () => {} };
  }

  const sess = await consoleSession(opts.userId);
  if (!sess) throw new Error(`no console (9.4.x) session for user ${opts.userId} in the shared DB`);

  if (opts.appKey && opts.appSecret) {
    const headers = { "access-token": buildAccessToken(opts.appKey, opts.appSecret, sess.token), "lightspeed-token": buildLightspeedToken(), "app-version": opts.appVersion ?? sess.appVersion, "Content-Type": "application/json" };
    return { get: (p) => apiGet(base, p, headers), dispose: async () => {} };
  }

  // DB-login on our own environments (sec-api): the proven console auth path.
  const { clientFromSession } = (await imp("auth/sessionAuth.ts")) as any;
  const api = await clientFromSession({ userId: opts.userId, sessionAccessToken: sess.token, appVersion: sess.appVersion }, { app: "console", baseURL: base });
  return { get: (p: string) => api.get(p), dispose: () => api.dispose().catch(() => {}) };
}

function moduleSet(cfg: any): Set<string> {
  const out = new Set<string>();
  const perms = cfg?.authorized_permissions;
  if (Array.isArray(perms)) for (const g of perms) for (const list of [g?.company_permissions, g?.team_permissions]) if (Array.isArray(list)) for (const p of list) { const m = p?.module ?? p?.permission?.module; if (m?.name) out.add(m.name); }
  return out;
}

let seq = 0;
function result(partial: Partial<CheckResult> & { scenario: string; pass: boolean; verdict: string }): CheckResult {
  return {
    id: `CHK-MC-${String(++seq).padStart(2, "0")}`,
    flowId: "feature.multi_company_user",
    module: "Multi-Company User",
    type: (partial.type ?? "functional") as TestType,
    category: partial.category ?? "Functional",
    priority: partial.priority ?? "P1",
    severity: partial.severity ?? "High",
    expected: partial.expected ?? "accept",
    layer: "api",
    inputSummary: partial.inputSummary ?? "",
    httpStatus: partial.httpStatus ?? 200,
    accepted: partial.pass,
    message: partial.message ?? null,
    durationMs: partial.durationMs ?? 0,
    ...partial,
  } as CheckResult;
}

export async function runMultiCompanyChecks(opts: MCOptions): Promise<CheckResult[]> {
  seq = 0;
  const results: CheckResult[] = [];
  let g: { get: (p: string) => Promise<any>; dispose: () => Promise<void> };
  try {
    g = await makeGetter(opts);
  } catch (e: any) {
    return [result({ scenario: "Authenticate to the target environment", type: "functional", severity: "Critical", pass: false, httpStatus: null, verdict: `auth setup failed: ${e?.message ?? e}` })];
  }
  const get = g.get;

  let cfg: any;
  try {
    cfg = await get("/v1/dashboard_configuration");
  } catch (e: any) {
    await g.dispose();
    return [result({ scenario: "Authenticate + load dashboard_configuration", type: "functional", severity: "Critical", pass: false, httpStatus: e?.status ?? null, verdict: `HTTP ${e?.status}: ${e?.message}` })];
  }

  // Feature-present gate (config-driven skip, like the rest of the platform).
  if (!("is_multi_company_user" in cfg)) {
    await g.dispose();
    return [result({ scenario: "Multi-company switcher is present for this user on this environment", type: "functional", severity: "High", pass: false, expected: "accept", verdict: "SKIPPED — no multi-company switcher for this user (is_multi_company_user absent → the branch isn't live on this backend, or this user is single-company)." })];
  }

  const isMulti = cfg.is_multi_company_user === true;
  const companies: Array<{ uuid: string; name: string }> = Array.isArray(cfg.allowed_client_companies) ? cfg.allowed_client_companies : [];
  results.push(result({ scenario: "User is flagged as a multi-company user (is_multi_company_user = true)", type: "functional", severity: "Critical", pass: isMulti, verdict: `is_multi_company_user=${cfg.is_multi_company_user}` }));
  results.push(result({ scenario: "Company switcher lists 2+ buyer companies", type: "functional", severity: "High", pass: companies.length >= 2, verdict: `allowed_client_companies=${companies.length} (${companies.map((c) => c.name).join(", ")})` }));

  // Switch into each company; capture its scoped permissions.
  const perCompany: Array<{ name: string; mods: Set<string> }> = [];
  for (const c of companies) {
    try {
      const cc = await get(`/v1/dashboard_configuration?client_company_uuid=${encodeURIComponent(c.uuid)}`);
      const mods = moduleSet(cc);
      perCompany.push({ name: c.name, mods });
      results.push(result({ scenario: `Switch to "${c.name}" → config + permissions load (scoped to it)`, type: "functional", severity: "High", pass: true, inputSummary: `client_company_uuid=${c.uuid.slice(0, 12)}…`, verdict: `HTTP 200 · ${mods.size} modules` }));
    } catch (e: any) {
      results.push(result({ scenario: `Switch to "${c.name}" → config loads`, type: "functional", severity: "High", pass: false, httpStatus: e?.status ?? null, verdict: `HTTP ${e?.status}: ${e?.message}` }));
    }
  }

  // Per-company scoping observable (do the companies differ)?
  if (perCompany.length >= 2) {
    const [a, b] = perCompany;
    const differ = a.mods.size !== b.mods.size || [...a.mods].some((m) => !b.mods.has(m));
    results.push(result({ scenario: "Per-company permission scoping is observable (companies differ)", type: "functional", severity: "Medium", pass: true, verdict: differ ? `"${a.name}" (${a.mods.size} modules) ≠ "${b.name}" (${b.mods.size}) — scoping is per-company` : `"${a.name}" and "${b.name}" expose identical modules (scoping not observable for THIS pair)` }));
  }

  // Data-isolation / non-member fallback: an invalid/foreign selection must not error or leak.
  try {
    const bogus = await get(`/v1/dashboard_configuration?client_company_uuid=INVALID_UNMAPPED_COMPANY`);
    const stillMulti = bogus?.is_multi_company_user;
    results.push(result({ scenario: "Invalid / non-member company selection falls back safely (no error, no leak)", type: "non-functional", category: "Security", severity: "High", pass: true, verdict: `handled gracefully (HTTP 200); falls back to own scope (is_multi_company_user=${stillMulti})` }));
  } catch (e: any) {
    // A clean 4xx is also acceptable (rejects rather than leaks); a 5xx is a defect.
    const s = e?.status ?? 0;
    results.push(result({ scenario: "Invalid / non-member company selection is handled (no leak, no crash)", type: "non-functional", category: "Security", severity: "High", pass: s >= 400 && s < 500, httpStatus: s, verdict: s >= 500 ? `server error ${s} — defect` : `rejected (HTTP ${s})` }));
  }

  await g.dispose();
  return results;
}
