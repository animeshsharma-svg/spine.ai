/**
 * PER-COMPANY CONFIGURATION — what this client actually has switched on.
 *
 * WHY THIS EXISTS
 * Procol is one codebase serving many companies, and each company has its own
 * settings. The same request is legitimately valid for one client and invalid
 * for another. Without reading those settings we cannot tell a real bug from
 * "that feature simply isn't enabled here" — which is exactly how we ended up
 * reporting two BOQ results we could not prove either way.
 *
 * HOW PROCOL RESOLVES A SETTING (three layers, in order)
 *   1. custom_configurations  — this company's own override
 *   2. master_configurations  — that company's default
 *   3. master_configurations  — Procol's global default
 *
 * We don't reimplement that. We ask the backend for the finished answer via
 * GET /v1/dashboard_configuration — the very same endpoint the real Procol
 * frontend uses to reconfigure itself when you switch company. That response
 * carries `configurations.global_config` (the resolved flags) and
 * `authorized_permissions` (what this user may do), so one read gives us both.
 */
import { Client } from "./engine.js";

export interface CompanyConfig {
  companyId: number;
  companyName?: string;
  /** Resolved flag values, flattened to one lookup: flagKey → value. */
  flags: Record<string, any>;
  /** "module:operation" strings the acting user is permitted, e.g. "pr:create_record". */
  permissions: string[];
  /** The acting user, so role-dependent cases can be gated. */
  actorRole?: string;
  actorEmail?: string;
  /** True when we genuinely read the config (false = we could not, so don't guess). */
  loaded: boolean;
  error?: string;
}

/** Treat these shapes as "switched on". Procol stores flags loosely. */
export function isFlagOn(value: any): boolean {
  if (value === true) return true;
  if (typeof value === "string") return value === "true" || value === "1" || value === "yes";
  if (typeof value === "number") return value > 0;
  // A populated object/array (e.g. a config block) counts as configured.
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

/**
 * Read one company's live configuration. Never throws — a failure returns
 * `loaded: false` so callers report "config unknown" instead of assuming.
 */
export async function loadCompanyConfig(client: Client, companyId: number): Promise<CompanyConfig> {
  const base: CompanyConfig = {
    companyId,
    companyName: client.companyName ?? undefined,
    flags: {},
    permissions: [],
    loaded: false,
  };
  try {
    const dc: any = await client.ctx.buyerApi.get("/v1/dashboard_configuration");

    // 1) The resolved flags. global_config holds most of them; several useful
    //    ones sit at the top level, so merge both into a single lookup.
    const globalCfg = dc?.configurations?.global_config ?? {};
    const topLevel: Record<string, any> = {};
    for (const [k, v] of Object.entries(dc ?? {})) {
      // Only scalar-ish top-level entries are flags; skip big payloads.
      if (k === "configurations" || k === "authorized_permissions" || k === "user") continue;
      if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") topLevel[k] = v;
      else if (v && typeof v === "object" && Object.keys(v).length <= 12) topLevel[k] = v;
    }
    base.flags = { ...topLevel, ...globalCfg };

    // 2) The acting user's permissions, flattened to "module:operation".
    const perms = new Set<string>();
    const blocks = Array.isArray(dc?.authorized_permissions) ? dc.authorized_permissions : [];
    for (const block of blocks) {
      for (const list of Object.values(block ?? {})) {
        if (!Array.isArray(list)) continue;
        for (const p of list as any[]) {
          const name = p?.module?.name;
          const op = p?.module?.operation;
          if (name && op) perms.add(`${name}:${op}`);
        }
      }
    }
    base.permissions = [...perms].sort();

    // 3) Who we are (role-dependent cases need this).
    const u = dc?.user ?? {};
    base.actorRole = u?.role;
    base.actorEmail = u?.email;

    base.loaded = true;
    return base;
  } catch (e: any) {
    base.error = e?.message ?? String(e);
    return base;
  }
}

/**
 * Is the feature's required flag on for this company?
 *   "on"      — flag present and truthy → the feature exists here, test it
 *   "off"     — flag present and falsy  → NOT a bug if the feature is absent
 *   "unknown" — we couldn't read it     → don't guess, report as unknown
 *   "n/a"     — the feature isn't gated by any flag
 */
export function featureConfigState(
  cfg: CompanyConfig,
  requiresConfig?: string,
): { state: "on" | "off" | "unknown" | "n/a"; flag?: string; value?: any } {
  if (!requiresConfig) return { state: "n/a" };
  if (!cfg.loaded) return { state: "unknown", flag: requiresConfig };
  if (!(requiresConfig in cfg.flags)) return { state: "unknown", flag: requiresConfig };
  const value = cfg.flags[requiresConfig];
  return { state: isFlagOn(value) ? "on" : "off", flag: requiresConfig, value };
}

/** A short human summary for the UI header, e.g. "BOQ on · multi-entity off". */
export function summariseFlags(cfg: CompanyConfig, keys: string[]): string {
  if (!cfg.loaded) return "configuration could not be read";
  const parts: string[] = [];
  for (const k of keys) {
    if (!(k in cfg.flags)) continue;
    parts.push(`${k.replace(/^is_|_enabled$/g, "").replace(/_/g, " ")} ${isFlagOn(cfg.flags[k]) ? "on" : "off"}`);
  }
  return parts.length ? parts.join(" · ") : `${Object.keys(cfg.flags).length} settings read`;
}
