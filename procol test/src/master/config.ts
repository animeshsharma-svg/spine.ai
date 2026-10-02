import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";

/**
 * Wraps GET /v1/dashboard_configuration. The app reads feature flags from BOTH
 * the top level of the response AND `configurations.global_config`, and gates
 * modules via `authorized_permissions`. This class exposes both.
 */
export class ClientConfig {
  constructor(public readonly raw: any) {}

  static async load(api: ApiClient): Promise<ClientConfig> {
    const raw = await api.get<any>(Endpoints.dashboardConfiguration());
    return new ClientConfig(raw);
  }

  /** Read a feature flag from top-level or configurations.global_config. */
  flag<T = unknown>(key: string): T | undefined {
    const r = this.raw ?? {};
    if (key in r) return r[key];
    const gc = r.configurations?.global_config ?? {};
    if (key in gc) return gc[key];
    return undefined;
  }

  /** true when the flag is present and truthy. */
  isOn(key: string): boolean {
    return Boolean(this.flag(key));
  }

  /** All permission `module` objects across every permission group. */
  private modules(): Array<{ name?: string; operation?: string }> {
    const perms = this.raw?.authorized_permissions;
    if (!Array.isArray(perms)) return [];
    const out: Array<{ name?: string; operation?: string }> = [];
    for (const grp of perms) {
      for (const list of [grp?.company_permissions, grp?.team_permissions]) {
        if (Array.isArray(list)) {
          for (const p of list) {
            const m = p?.module ?? p?.permission?.module;
            if (m?.name) out.push({ name: m.name, operation: m.operation });
          }
        }
      }
    }
    return out;
  }

  /** true when the client is authorized for a module (optionally an operation). */
  hasModule(name: string, operation?: string): boolean {
    return this.modules().some(
      (m) => m.name === name && (!operation || m.operation === operation),
    );
  }

  /** Distinct module names the client is authorized for (for reporting). */
  moduleNames(): string[] {
    return [...new Set(this.modules().map((m) => m.name!).filter(Boolean))];
  }
}
