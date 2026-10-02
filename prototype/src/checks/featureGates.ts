/**
 * Which features this client actually has switched on — read the way the
 * backend decides it, not guessed from one dashboard flag.
 *
 * The gate map (config/featureGates.json) names, for every feature in the
 * tree, the module licence, company setting or predicate the backend checks
 * before it lets anyone use it, with the file:line. `procol test/src/db/
 * featureGates.ts` resolves those against the database (SELECT only). This
 * file loads that resolver, caches the answer per company, and merges it with
 * the older single-flag reading (companyConfig.featureConfigState) so both the
 * feature tree and a run agree on what is "not on for this client".
 *
 * No database, or a company the resolver cannot read → null, and everything
 * behaves exactly as before.
 */
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as loadEnv } from "dotenv";

export interface GateAnswer {
  on: boolean | null;
  reasons: string[];
  gates: { kind: string; key: string; state: string; blocking: boolean; value?: unknown; from?: string }[];
}

const here = dirname(fileURLToPath(import.meta.url));
const PROCOL_TEST = join(here, "..", "..", "..", "procol test");
const RESOLVER = join(PROCOL_TEST, "src", "db", "featureGates.ts");
// The database URL lives in the framework's .env (as executor.ts loads it); never overrides what is set.
loadEnv({ path: join(PROCOL_TEST, ".env") });
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<number, { at: number; value: Record<string, GateAnswer> | null }>();

export async function featureGatesFor(companyId: number): Promise<Record<string, GateAnswer> | null> {
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value: Record<string, GateAnswer> | null = null;
  try {
    const mod = await import(pathToFileURL(RESOLVER).href);
    const all = (await mod.resolveFeatureGates(companyId)) as Record<string, GateAnswer>;
    // A company the database does not know answers null for everything — no information.
    value = Object.values(all).some((g) => g.on !== null) ? all : null;
  } catch {
    value = null;
  }
  cache.set(companyId, { at: Date.now(), value });
  return value;
}

export type ConfigState = { state: "on" | "off" | "unknown" | "n/a"; flag?: string; value?: unknown; reasons?: string[]; source?: string };

/**
 * One answer per feature. The gate map wins whenever it has a definite answer:
 * it knows, for instance, that partial PR closure is on only when the setting's
 * `.enabled` is true (the old reading counted any object as on), and that BOQ
 * needs an active BOQ template as well as the flag. Otherwise the old reading stands.
 */
export function mergeConfigState(old: ConfigState, gate: GateAnswer | undefined): ConfigState {
  if (!gate || gate.on === null) return old;
  if (gate.on === false) {
    const offGate = gate.gates.find((g) => g.state === "off" && g.blocking);
    return { state: "off", flag: offGate?.key ?? old.flag, value: offGate?.value, reasons: gate.reasons, source: "backend gates" };
  }
  // On. Keep "n/a" for features the tree never tied to a setting, so the
  // "on" badge still marks only the ones that depend on one.
  if (old.state === "off" || old.state === "unknown") return { ...old, state: "on", reasons: gate.reasons, source: "backend gates" };
  return old;
}

/** Plain words for why a feature is off, for tooltips, skip reasons and reports. */
export function offReason(st: ConfigState, company: string): string {
  const why = st.reasons?.[0] ?? (st.flag ? `"${st.flag}" is OFF` : "it is switched off");
  return `not on for ${company}: ${why}`;
}
