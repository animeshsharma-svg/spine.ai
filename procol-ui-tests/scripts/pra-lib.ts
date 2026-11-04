/**
 * PR assignee filter + assignment notification run on DLF Hospitality UAT (company 43386).
 * Reuses the approval-routing session helpers (token from .auth/dlf.json, never printed).
 * Expected visibility is computed from a read-only DB snapshot (pra-data.json): a user sees a PR when
 * their user_company_mappings.trade_identifier shares a token with purchase_requests.team_identifiers,
 * or they are a super admin / process validator (DLF has no process-validator team).
 */
import { readFileSync, mkdirSync } from "node:fs";
import { api, uuidOf, Ledger } from "./aw-lib";
export * from "./aw-lib";
export const PRA_OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/pr-assignee";
export const PRA_SHOTS = `${PRA_OUT}/shots`;
mkdirSync(PRA_SHOTS, { recursive: true });
export const L = new Ledger(`${PRA_OUT}/results.json`);
export const DATA_FILE = process.env.PRA_DATA || "/private/tmp/claude-501/-Users-animesh-Desktop-procol/f9cb15d1-0780-4694-8954-a5a5bc10390e/scratchpad/pra-data.json";
export type U = { id: number; nm: string; role: number; status: number; ucm_status: number; tok: string[] | null; team_types: number[] | null; teams: string[] | null };
export const D: { users: U[]; items: { id: number; pr: number; assignee_id: number | null }[]; prs: Record<string, { rfq_no: string; tok: string[]; items: number }> } = JSON.parse(readFileSync(DATA_FILE, "utf8"));
export const isSuper = (u: U) => u.role === 3;
export const purchaseUser = (u: U) => u.status === 1 && u.ucm_status === 1 && (u.team_types || []).includes(0);
export const sees = (u: U, prId: number) => isSuper(u) || (u.tok || []).some((t) => D.prs[String(prId)].tok.includes(t));
export const itemsOf = (prId: number) => D.items.filter((i) => i.pr === prId);
/** GET /users/search exactly like the PR screen (team_types purchase) plus the given extra filter keys */
export async function search(q: string, extra: Record<string, unknown>) {
  const filters = JSON.stringify({ team_types: ["purchase"], ...extra });
  const r = await api("GET", `/users/search?${new URLSearchParams({ query: q, filters })}`);
  const list: any[] = Array.isArray(r.json) ? r.json : r.json?.users || r.json?.data || [];
  return { status: r.status, names: list.map((x) => String(x.name || `${x.first_name || ""} ${x.last_name || ""}`).trim()), raw: r };
}
export const itemUuid = (id: number) => uuidOf(id);

// ---- sessions for other DLF test accounts (Procol Planner User, Testing-T); codes via the UAT rule, never printed
import { chromium, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { cfg, API, WEB, appVersion as _ver, type NetEntry } from "./aw-lib";
const PT = "/Users/animesh/Desktop/procol/procol test";
export const PLANNER = 19120, TESTING_T = 27876, ME = 19743;
const tokCache = new Map<number, string>();
export async function tokenFor(userId: number): Promise<string> {
  if (userId === ME) return cfg.accessTokenHeader;
  if (tokCache.has(userId)) return tokCache.get(userId)!;
  const { query, closePool } = await import(pathToFileURL(`${PT}/src/db/pool.ts`).href);
  const { loginOtpCandidates } = await import(pathToFileURL(`${PT}/src/auth/uatOtp.ts`).href);
  const r = await query(`select phone from users where id=${Number(userId)}`);
  const row0 = (r.rows ?? r)[0]; const [prefix, phone] = String(row0.phone).split("/");
  const [key, sec] = Buffer.from(cfg.accessTokenHeader, "base64").toString().split(":");
  const ver = await _ver();
  const h = { "access-token": Buffer.from(`${key}:${sec}`).toString("base64"), "app-version": ver, "Content-Type": "application/json" };
  await fetch(API + "/v1/generate_otp", { method: "POST", headers: h, body: JSON.stringify({ phone, phone_prefix: prefix }) });
  const cands: { otp: string }[] = [{ otp: cfg.loginCode }, ...(await loginOtpCandidates({ phone: `${prefix}/${phone}` }, 43386))];
  await closePool().catch(() => {});
  for (const c of cands) {
    const v = await fetch(API + "/v1/verify_otp", { method: "POST", headers: h, body: JSON.stringify({ phone, phone_prefix: prefix, otp: c.otp, push_token: null, device_info: { browser: "Chrome", os: "macOS" }, device_id: `qa-${Date.now()}` }) });
    const j: any = await v.json().catch(() => ({}));
    if (j.access_token) { const t = Buffer.from(`${key}:${sec}:${j.access_token}`).toString("base64"); tokCache.set(userId, t); return t; }
    if (!/invalid otp/i.test(JSON.stringify(j))) throw new Error(`sign-in for user ${userId}: ${v.status} ${j.error?.code ?? ""} ${String(j.error?.message ?? "").slice(0, 80)}`);
  }
  throw new Error(`no login code accepted for user ${userId}`);
}
export async function openAs(token: string, viewport = { width: 1600, height: 1000 }) {
  const ver = await _ver();
  const dc: any = await fetch(API + "/v1/dashboard_configuration", { headers: { "access-token": token, "app-version": ver } }).then((r) => r.json());
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((d: any) => {
    if (!localStorage.getItem("procol_access_token")) {
      localStorage.setItem("procol_access_token", JSON.stringify(d.tok));
      localStorage.setItem("procol_current_selected_api", d.api);
      localStorage.setItem("procol_app_version", JSON.stringify(d.ver));
      localStorage.setItem("procol_login_validity", String(Math.floor(Date.now() / 1000)));
      localStorage.setItem("procol_user_profile", JSON.stringify(d.user));
    }
  }, { tok: token, api: API, ver, user: dc.user });
  const page = await ctx.newPage();
  const net: NetEntry[] = [];
  page.on("response", async (r) => {
    const u = r.url(); if (!/\/api\//.test(u)) return;
    const req = r.request(); let reply = ""; try { reply = (await r.text()).slice(0, 1500); } catch { /* */ }
    net.push({ at: Date.now(), method: req.method(), url: u.replace(/^https:\/\/[^/]+\/api/, ""), status: r.status(), body: req.postData()?.slice(0, 4000), reply });
  });
  return { browser, ctx, page, net, perms: dc };
}
export async function pshot(page: Page, name: string): Promise<string> {
  const file = `${PRA_SHOTS}/${name.replace(/[^\w.-]+/g, "_")}.png`;
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return file;
}
export { WEB };
