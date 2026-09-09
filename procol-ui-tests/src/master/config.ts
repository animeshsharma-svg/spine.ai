import { request as pwRequest, APIRequestContext } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { ClientProfile, TOKENS_FILE } from "../config.js";

/**
 * Per-client configuration, loaded once via a READ-ONLY probe of the backend's
 * `/v1/dashboard_configuration` (the same source the API framework gates on).
 * Flows call `flag()` / `hasModule()` in their `enabledFor()` gates so UI and
 * API layers mean the same thing by "enabled for this client".
 *
 * Auth for the probe reuses the access token captured during auth.setup — no
 * second OTP dance. If the probe can't run (no token / offline), config is
 * marked not-loaded and gates FAIL OPEN (flow runs) so we never silently skip.
 */
export class ClientConfig {
  private constructor(
    public readonly loaded: boolean,
    public readonly raw: Record<string, unknown>,
    public readonly modules: string[],
    public readonly note?: string,
  ) {}

  static async load(profile: ClientProfile, accessTokenHeaderOverride?: string): Promise<ClientConfig> {
    // Override lets us load ANY company's config (DB-session multi-client) instead
    // of the clientA token captured by auth.setup.
    const accessTokenHeader = accessTokenHeaderOverride || readAccessTokenHeader();
    if (!accessTokenHeader) {
      return new ClientConfig(false, {}, [], "no access token captured; run auth.setup first");
    }
    let api: APIRequestContext | null = null;
    try {
      api = await pwRequest.newContext({
        baseURL: profile.apiUrl.replace(/\/$/, ""),
        extraHTTPHeaders: {
          // Already fully-encoded by the console; use verbatim.
          "access-token": accessTokenHeader,
          "lightspeed-token": buildLightspeedToken(),
          "app-version": profile.appVersion,
          "content-type": "application/json",
        },
      });
      const res = await api.get("/v1/dashboard_configuration");
      if (!res.ok()) {
        return new ClientConfig(false, {}, [], `dashboard_configuration -> HTTP ${res.status()}`);
      }
      const body = (await res.json()) as Record<string, unknown>;
      const raw = (body?.data as Record<string, unknown>) ?? body ?? {};
      return new ClientConfig(true, raw, extractModules(raw));
    } catch (e) {
      return new ClientConfig(false, {}, [], `probe error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await api?.dispose();
    }
  }

  /** Truthy feature flag, checked at top level AND under configurations.global_config. */
  flag(key: string): boolean {
    if (!this.loaded) return true; // fail-open
    const top = this.raw?.[key];
    if (isTruthy(top)) return true;
    const cfg = this.raw?.["configurations"] as Record<string, unknown> | undefined;
    const global = cfg?.["global_config"] as Record<string, unknown> | undefined;
    return isTruthy(global?.[key]);
  }

  /** Whether an authorized module is present (optionally with a specific op). */
  hasModule(name: string, op?: string): boolean {
    if (!this.loaded) return true; // fail-open
    if (!op) return this.modules.includes(name);
    return eachPermissionModule(this.raw).some((m) => m.name === name && m.operation === op);
  }

  moduleNames(): string[] {
    return this.modules;
  }
}

function isTruthy(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

interface ModulePerm {
  name: string;
  operation?: string;
}

/**
 * Flatten every permission entry into {name, operation}. Each entry looks like
 * `{uuid, module: {name, operation}}`, grouped under company_permissions /
 * team_permissions across the authorized_permissions blocks.
 */
function eachPermissionModule(raw: Record<string, unknown>): ModulePerm[] {
  const perms = (raw?.["authorized_permissions"] as unknown[]) ?? [];
  const out: ModulePerm[] = [];
  for (const block of perms) {
    const b = block as Record<string, unknown>;
    const groups = [
      ...((b?.["company_permissions"] as unknown[]) ?? []),
      ...((b?.["team_permissions"] as unknown[]) ?? []),
    ];
    for (const g of groups) {
      const mod = (g as Record<string, unknown>)?.["module"] as Record<string, unknown> | undefined;
      const name = mod?.["name"];
      if (typeof name === "string") {
        out.push({ name, operation: typeof mod?.["operation"] === "string" ? (mod["operation"] as string) : undefined });
      }
    }
  }
  return out;
}

function extractModules(raw: Record<string, unknown>): string[] {
  return [...new Set(eachPermissionModule(raw).map((m) => m.name))].sort();
}

// ── auth header builders (mirror the API framework's token model) ────────────
function readAccessTokenHeader(): string | null {
  if (!existsSync(TOKENS_FILE)) return null;
  try {
    const j = JSON.parse(readFileSync(TOKENS_FILE, "utf8")) as { accessTokenHeader?: string };
    return j.accessTokenHeader || null;
  } catch {
    return null;
  }
}

function buildLightspeedToken(): string {
  const descriptor = { "device-type": "web-console", uuid: randomId(10) };
  return Buffer.from(JSON.stringify(descriptor)).toString("base64");
}

function randomId(n: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
