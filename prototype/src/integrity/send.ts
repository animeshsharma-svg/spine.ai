/**
 * THE ONLY WAY THE INTEGRITY CHECKER TALKS TO PROCOL — app-guarded.
 *
 * A request the session's app may not make is never sent (a wrong-app 401
 * signs that session out: json_helpers.rb:31-35). The guard is the same one
 * engine.ts apiAttempt/apiGet/apiPatch use — appOf + appRefusal from
 * src/checks/appAccess.ts (data/app-access.json) — made STRICT:
 *
 *   versioned (/v1, /v2, …)  must match a route in data/app-access.json AND be on
 *                            the calling app's list; an unmapped route is not sent.
 *   unversioned              must be one of UNVERSIONED below (controller#action read
 *                            from config/routes.rb) AND be on the app's list in
 *                            procol-backend config/app_auth_config.yml (read with
 *                            `git show origin/main:`); anything else is not sent.
 *
 * engine.ts apiGet/apiPatch return no reply body, and the checker must read
 * the figures the app answers, so this module wraps the same guard around
 * api.attempt with a 60 s bound per try and two bounded retries on
 * environment failures (0 / 408 / 429 / 502 / 503 / 504).
 *
 * download() fetches a file (Excel) as bytes through the same guard.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import { appOf, appRefusal } from "../checks/appAccess.js";
import { redactSecrets } from "../checks/engine.js";

const here = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(here, "..", "..", "..", "procol-backend");
const ACCESS_FILE = join(here, "..", "..", "data", "app-access.json");

export interface Reply {
  status: number;
  ok: boolean;
  data: any;
  code?: string;
  message?: string;
  ms: number;
  /** set when the guard refused to send it — the reason, in words */
  notSent?: string;
}

/** Unversioned routes this checker may use → controller#action (config/routes.rb). */
const UNVERSIONED: Array<[string, RegExp, string, string]> = [
  ["POST", /^\/event_groups$/, "event_groups", "create"],
  ["GET", /^\/event_groups\/[^/]+$/, "event_groups", "show"],
  ["PATCH", /^\/event_groups\/[^/]+$/, "event_groups", "update"],
  ["POST", /^\/trade\/template_input$/, "trade", "template_input"],
  ["GET", /^\/trade\/[^/]+$/, "trade", "show"],
  ["POST", /^\/bids\/template_input$/, "bids", "template_input"],
  ["GET", /^\/bids\/[^/]+$/, "bids", "show"],
  ["GET", /^\/templates$/, "templates", "index"],
  ["GET", /^\/templates\/[^/]+$/, "templates", "show"],
  ["POST", /^\/proposal$/, "proposal", "create"],
  ["GET", /^\/proposal\/[^/]+$/, "proposal", "show"],
  ["POST", /^\/proposal\/[^/]+\/add_response$/, "proposal", "add_response"],
  ["POST", /^\/proposal\/discard_draft_proposal$/, "proposal", "discard_draft_proposal"],
];

/** Extra unversioned routes registered at run time (report downloads found in routes.rb). */
export function allowUnversioned(method: string, re: RegExp, controller: string, action: string): void {
  if (!UNVERSIONED.some(([m, r]) => m === method && r.source === re.source)) UNVERSIONED.push([method, re, controller, action]);
}

const APP_CLIENT = { console: "client_admin_dashboard", vendor: "agribid_website" } as const;

let aac: any;
function appAuthConfig(): any {
  if (aac !== undefined) return aac;
  try {
    aac = YAML.parse(execFileSync("git", ["-C", BACKEND, "show", "origin/main:config/app_auth_config.yml"], { encoding: "utf8", maxBuffer: 16e6, timeout: 30_000 }));
  } catch {
    aac = null;
  }
  return aac;
}

interface AccessFile { routes: { method: string; pattern: string; version: string; controller: string; action: string }[] }
let accessFile: AccessFile | null | undefined;
function access(): AccessFile | null {
  if (accessFile !== undefined) return accessFile;
  try {
    accessFile = JSON.parse(readFileSync(ACCESS_FILE, "utf8"));
  } catch {
    accessFile = null;
  }
  return accessFile ?? null;
}

/** Why this app may not send this request (undefined = allowed). Strict: an unmapped route is never sent. */
export function wrongApp(api: unknown, method: string, rawPath: string): string | undefined {
  const app = appOf(api);
  if (!app) return "the session's app could not be identified";
  const path = rawPath.split("?")[0];
  const m = method.toUpperCase();
  if (/^\/(v1|v2|v3|supplier_suite|approval_workflow|integration_builder)\//.test(path)) {
    const a = access();
    if (!a) return "data/app-access.json could not be read";
    const segs = path.split("/").filter(Boolean);
    const known = a.routes.some((x) => x.method === m && x.pattern.split("/").filter(Boolean).length === segs.length
      && x.pattern.split("/").filter(Boolean).every((s, i) => s.startsWith(":") || s === segs[i]));
    if (!known) return `${m} ${path} is not in the route table`;
    return appRefusal(app, m, path);
  }
  const hit = UNVERSIONED.find(([mm, re]) => mm === m && re.test(path));
  if (!hit) return `${m} ${path} is not in the integrity checker's route table`;
  const cfg = appAuthConfig();
  if (!cfg) return "procol-backend's config/app_auth_config.yml could not be read";
  const ok = Object.prototype.hasOwnProperty.call(cfg?.[APP_CLIENT[app]]?.[hit[2]] ?? {}, hit[3]);
  return ok ? undefined : `the ${app === "console" ? "buyer console" : "vendor website"} may not call ${hit[2]}#${hit[3]} (config/app_auth_config.yml) — a 401 would sign the session out`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ENV_STATUS = new Set([0, 408, 429, 502, 503, 504]);
const PER_TRY_MS = 60_000;

/** One guarded request; never throws. */
export async function send(api: any, method: string, path: string, body?: unknown): Promise<Reply> {
  const why = wrongApp(api, method, path);
  if (why) return { status: 0, ok: false, data: null, message: `not sent: ${why}`, ms: 0, notSent: why };
  const t = Date.now();
  for (let tries = 1; ; tries++) {
    let r: Reply;
    try {
      const x: any = await Promise.race([
        api.attempt(method, path, body === undefined ? {} : { body }),
        sleep(PER_TRY_MS).then(() => ({ status: 0, ok: false, data: null, errorMessage: `no reply within ${PER_TRY_MS / 1000} s` })),
      ]);
      r = { status: typeof x?.status === "number" ? x.status : 0, ok: !!x?.ok, data: x?.data, code: x?.errorCode != null ? String(x.errorCode) : undefined, message: redactSecrets(x?.errorMessage) ?? undefined, ms: 0 };
    } catch (e) {
      r = { status: 0, ok: false, data: null, message: redactSecrets(e instanceof Error ? e.message : String(e)) ?? "request failed", ms: 0 };
    }
    if (!ENV_STATUS.has(r.status) || tries > 2) return { ...r, ms: Date.now() - t };
    await sleep(1500 * tries);
  }
}

/** Shorthand for a guarded GET. */
export const get = (api: any, path: string) => send(api, "GET", path);

export interface Download {
  status: number;
  ok: boolean;
  bytes?: Buffer;
  contentType?: string;
  /** when the reply is JSON (an error, or a link to the file), its body */
  json?: any;
  notSent?: string;
  message?: string;
}

/**
 * Fetch a file through the same guard. The sibling ApiClient reads bodies as
 * text (which would corrupt an .xlsx), so the download goes through its
 * Playwright request context with the client's own headers — after the guard.
 */
export async function download(api: any, path: string): Promise<Download> {
  const why = wrongApp(api, "GET", path);
  if (why) return { status: 0, ok: false, notSent: why, message: `not sent: ${why}` };
  if (typeof api?.ctx?.fetch !== "function" || typeof api?.headers !== "function" || typeof api?.buildUrl !== "function") {
    return { status: 0, ok: false, message: "the API client cannot fetch raw bytes" };
  }
  try {
    const res: any = await Promise.race([
      api.ctx.fetch(api.buildUrl(path), { method: "GET", headers: api.headers(), timeout: 90_000 }),
      sleep(95_000).then(() => undefined),
    ]);
    if (!res) return { status: 0, ok: false, message: "no reply within 95 s" };
    const status = res.status();
    const contentType = String(res.headers()["content-type"] ?? "");
    const bytes: Buffer = await res.body();
    const ok = status >= 200 && status < 300;
    if (/json/.test(contentType)) {
      let json: any;
      try {
        json = JSON.parse(bytes.toString("utf8"));
      } catch {
        /* not JSON after all */
      }
      return { status, ok, contentType, json, message: ok ? undefined : redactSecrets(json?.error?.message ?? json?.message ?? `HTTP ${status}`) ?? undefined };
    }
    return { status, ok, bytes, contentType };
  } catch (e) {
    return { status: 0, ok: false, message: redactSecrets(e instanceof Error ? e.message : String(e)) ?? "request failed" };
  }
}

/** The reply in words, for an "actual" line. */
export function said(r: Reply): string {
  if (r.notSent) return `not sent — ${r.notSent}`;
  if (r.status === 0) return `no reply came back (${r.message ?? "network"})`;
  if (r.ok) return `the app answered (HTTP ${r.status})`;
  return `the app refused it: “${r.message ?? "no message"}” (HTTP ${r.status}${r.code ? `, code ${r.code}` : ""})`;
}
