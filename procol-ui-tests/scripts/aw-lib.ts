/**
 * Shared helpers for the approval-routing test run on DLF Hospitality (UAT, cpanel.ag-ri.in).
 * Session = the tester's pasted access token (.auth/dlf.json, git-ignored), injected into
 * localStorage the way the dashboard stores it. Never prints the token.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

export const cfg = JSON.parse(readFileSync("/Users/animesh/Desktop/procol/procol-ui-tests/.auth/dlf.json", "utf8"));
export const API: string = cfg.apiUrl;
export const WEB: string = cfg.webUrl;
export const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/approval-routing";
export const SHOTS = `${OUT}/shots`;
mkdirSync(SHOTS, { recursive: true });

let version = "9.4.377";
export async function appVersion(): Promise<string> {
  try { const m: any = await fetch(WEB + "/meta.json").then((r) => r.json()); version = m.version || version; } catch { /* keep */ }
  return version;
}

export type Res = { status: number; json: any; text: string };
export async function api(method: string, path: string, body?: unknown, opts: { token?: string | null; headers?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { "app-version": version, "Content-Type": "application/json", ...(opts.headers || {}) };
  const tok = opts.token === undefined ? cfg.accessTokenHeader : opts.token;
  if (tok) headers["access-token"] = tok;
  const url = path.startsWith("http") ? path : API + path;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
      const text = await r.text();
      let json: any = text; try { json = JSON.parse(text); } catch { /* text */ }
      return { status: r.status, json, text };
    } catch (e: any) {
      if (attempt === 2) throw e;
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
  throw new Error("unreachable");
}

/** The app's error shape {error:{code,message}} → "code message" */
export const errOf = (r: Res) => (r.json && r.json.error ? `${r.json.error.code ?? ""} ${r.json.error.message ?? ""}`.trim() : r.status === 200 ? "" : `HTTP ${r.status} ${String(r.text).slice(0, 120)}`);

/** uuid the app uses in URLs (EncryptDecrypt.encode_data) */
export function uuidOf(id: number): string {
  const s = String(id * 3 + 1022).split(""); const rot = [...s.slice(3), ...s.slice(0, 3)];
  const sp = "gZckDpNXdQ"; return Buffer.from(rot.map((c) => sp[Number(c)]).join("")).toString("base64");
}
export function idOf(uuid: string): number {
  const sp = "gZckDpNXdQ"; const raw = Buffer.from(uuid, "base64").toString();
  const digits = raw.split("").map((c) => String(sp.indexOf(c)));
  const s = [...digits.slice(-3), ...digits.slice(0, -3)].join("");
  return (Number(s) - 1022) / 3;
}

export async function openBrowser(opts: { headed?: boolean; viewport?: { width: number; height: number } } = {}): Promise<{ browser: Browser; ctx: BrowserContext; page: Page; net: NetEntry[] }> {
  await appVersion();
  const dc: any = (await api("GET", "/v1/dashboard_configuration")).json;
  const browser = await chromium.launch({ headless: !opts.headed });
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1600, height: 1000 } });
  await ctx.addInitScript((d: any) => {
    if (!localStorage.getItem("procol_access_token")) {
      localStorage.setItem("procol_access_token", JSON.stringify(d.tok));
      localStorage.setItem("procol_current_selected_api", d.api);
      localStorage.setItem("procol_app_version", JSON.stringify(d.ver));
      localStorage.setItem("procol_login_validity", String(Math.floor(Date.now() / 1000)));
      localStorage.setItem("procol_user_profile", JSON.stringify(d.user));
    }
  }, { tok: cfg.accessTokenHeader, api: API, ver: version, user: dc.user });
  const page = await ctx.newPage();
  const net: NetEntry[] = [];
  page.on("response", async (r) => {
    const u = r.url();
    if (!/\/api\//.test(u) || /\/api\/(v1\/dashboard_configuration|notifications|meta)/.test(u)) return;
    const req = r.request();
    let reply = ""; try { reply = (await r.text()).slice(0, 600); } catch { /* */ }
    net.push({ at: Date.now(), method: req.method(), url: u.replace(/^https:\/\/[^/]+\/api/, ""), status: r.status(), body: req.postData()?.slice(0, 4000), reply });
  });
  return { browser, ctx, page, net };
}
export type NetEntry = { at: number; method: string; url: string; status: number; body?: string; reply?: string };

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function settle(page: Page, ms = 1500) { await page.waitForLoadState("domcontentloaded"); await sleep(ms); await dismiss(page); }
export async function dismiss(page: Page) {
  for (const t of ["Got it", "Not now", "Skip"]) { const b = page.getByRole("button", { name: t }); if (await b.count()) await b.first().click({ timeout: 1500 }).catch(() => {}); }
}
export const toasts = async (page: Page) => (await page.locator(".ant-message-notice, .ant-notification-notice").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
export async function waitToast(page: Page, ms = 8000): Promise<string> {
  const end = Date.now() + ms;
  while (Date.now() < end) { const t = await toasts(page); if (t.length) return t.join(" | "); await sleep(200); }
  return "";
}
export async function shot(page: Page, name: string): Promise<string> {
  const file = `${SHOTS}/${name.replace(/[^\w.-]+/g, "_")}.png`;
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return file;
}

/** Results ledger: one json per runner, merged by the report builder. */
export type Verdict = "Pass" | "Fail" | "Couldn't tell" | "Not run" | "Record";
export type Result = { id: string; title: string; verdict: Verdict; observed: string; expected?: string; shots?: string[]; api?: Array<{ method: string; path: string; status: number; reply?: string }>; bug?: string; at: string };
export class Ledger {
  rows: Result[] = [];
  constructor(public file: string) { if (existsSync(file)) { try { this.rows = JSON.parse(readFileSync(file, "utf8")).rows || []; } catch { /* fresh */ } } }
  put(r: Omit<Result, "at">) {
    const row = { ...r, at: new Date().toISOString() };
    const i = this.rows.findIndex((x) => x.id === r.id);
    if (i >= 0) this.rows[i] = row; else this.rows.push(row);
    writeFileSync(this.file, JSON.stringify({ rows: this.rows }, null, 1));
    const mark = r.verdict === "Pass" ? "✓" : r.verdict === "Fail" ? "✗" : "·";
    console.log(`${mark} ${r.id} ${r.verdict}: ${r.observed.slice(0, 160)}`);
  }
}

export const STAMP = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "");
export const NAME = (s: string) => `QA_Platform AW ${STAMP} ${s}`;

/** DLF UAT fixture facts (read from the DB on 3 Nov 2026) */
export const DLF = {
  companyId: 43386,
  poTemplateId: 7503,
  rfqTemplateId: 6686,
  teamAll: 95659,            // "All Categories" — the test user is a member (not admin)
  testUserId: 19743,         // Test - Sumanta Dey (super_admin, the token's user)
  hubs: { lodhi: "12525", camellias: "12523", kochi: "12518", ecoVista: "12606", emporio: "7240", reveria: "7239", club3: "7237", aralias: "12522", plant: "10959" },
  draftProposalId: 14751,    // RFX-2112 draft PO form (creator = test user); 14728 was submitted + rejected on 3 Nov
  eventGroupId: 96868,       // RFX-2112
};
