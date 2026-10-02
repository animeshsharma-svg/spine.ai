import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./pool.js";

/**
 * WHICH FEATURES ARE SWITCHED ON FOR ONE CLIENT — read straight from the database.
 *
 * The map of "what decides whether a client can use feature X" lives in
 * `prototype/config/featureGates.json` (every feature in the platform's feature
 * tree, each gate cited to the backend source). This file only executes it:
 * every gate carries a read-only SELECT taking `$1 = company id` and returning
 * one row `{ value, source }`, and an `on_when` rule saying how to read `value`.
 *
 * Rules:
 *   - A feature is ON only when every blocking gate is on.
 *   - `per_event` gates and gates marked `blocking: false` are reported as
 *     reasons but never turn a feature off (they are decided per event, or only
 *     narrow the feature).
 *   - A gate whose query fails is UNKNOWN, never a crash; any unknown blocking
 *     gate (with no gate off) makes the feature `on: null`.
 *
 * Read-only: only SELECT/WITH statements are executed; anything else is refused.
 */

export type GateKind = "company_config" | "company_predicate" | "module" | "per_event";

export interface GateDef {
  kind: GateKind;
  key: string;
  on_when: string;
  default?: unknown;
  sql: string | null;
  source: string;
  why: string;
  blocking?: boolean;
  /** For on_when "equals". */
  expected?: unknown;
  /** For on_when "equals": what the backend substitutes when the value is null. */
  null_means?: unknown;
}

export interface FeatureGatesFile {
  generatedAt: string;
  features: Record<string, { gates: GateDef[]; note?: string }>;
}

export type GateState = "on" | "off" | "unknown" | "per_event";

export interface GateOutcome {
  kind: GateKind;
  key: string;
  state: GateState;
  blocking: boolean;
  value?: unknown;
  /** Where the value came from, e.g. custom_configurations / master_configurations / companies.allowed_modules. */
  from?: string;
  error?: string;
}

export interface FeatureGateState {
  on: boolean | null;
  reasons: string[];
  gates: GateOutcome[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GATES_PATH = resolve(HERE, "../../../prototype/config/featureGates.json");

let cachedFile: { path: string; data: FeatureGatesFile } | undefined;

export function loadFeatureGates(path = process.env.FEATURE_GATES_PATH || DEFAULT_GATES_PATH): FeatureGatesFile {
  if (cachedFile?.path === path) return cachedFile.data;
  const data = JSON.parse(readFileSync(path, "utf8")) as FeatureGatesFile;
  cachedFile = { path, data };
  return data;
}

// ── value interpretation (mirrors the Ruby idioms the backend uses) ──────────

/** Ruby truthiness — the `cached_all_configs(...) || false` pattern. */
function rubyTruthy(v: unknown): boolean {
  return v !== null && v !== undefined && v !== false;
}

/** Rails `present?` — the `cached_all_configs(...).present?` pattern. */
function railsPresent(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

function evaluate(gate: GateDef, value: unknown): boolean {
  switch (gate.on_when) {
    case "truthy":
      return rubyTruthy(value);
    case "present":
      return railsPresent(value);
    case "equals_true":
    case "true":
      return value === true;
    case "falsy":
      return !rubyTruthy(value);
    case "enabled_key_true":
      return !!value && typeof value === "object" && !Array.isArray(value) && (value as any).enabled === true;
    case "equals": {
      const v = value === null || value === undefined ? gate.null_means ?? null : value;
      return JSON.stringify(v) === JSON.stringify(gate.expected);
    }
    default:
      throw new Error(`unknown on_when rule "${gate.on_when}"`);
  }
}

// ── safe query execution ─────────────────────────────────────────────────────

const WRITE_WORDS = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|merge|call|do|vacuum|lock|set)\b/i;

function assertReadOnly(sql: string): void {
  const s = sql.trim();
  if (!/^(select|with)\b/i.test(s)) throw new Error("refused: gate SQL must start with SELECT or WITH");
  if (s.replace(/;\s*$/, "").includes(";")) throw new Error("refused: gate SQL must be a single statement");
  // Strip quoted literals before looking for write keywords (config keys never contain them, but be safe).
  if (WRITE_WORDS.test(s.replace(/'[^']*'/g, "''"))) throw new Error("refused: gate SQL contains a write keyword");
}

async function runOnce(sql: string, companyId: number): Promise<{ value: unknown; source?: string }> {
  assertReadOnly(sql);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const rows = await query<{ value: unknown; source?: string }>(sql, [companyId]);
      const row = rows[0] ?? { value: null, source: "no row" };
      return { value: row.value ?? null, source: row.source };
    } catch (e: any) {
      lastErr = e;
      // Retry only transient network errors; a SQL error will not fix itself.
      const transient = /ETIMEDOUT|ECONNRESET|EPIPE|Connection terminated|timeout/i.test(String(e?.message ?? e));
      if (!transient) break;
    }
  }
  throw lastErr;
}

/** Run tasks with a small concurrency cap (the pool has max 4 connections). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ── human wording ────────────────────────────────────────────────────────────

function short(v: unknown): string {
  const s = JSON.stringify(v);
  if (s === undefined) return "null";
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

function fromLabel(source?: string): string {
  if (source === "custom_configurations") return "company override";
  if (source === "master_configurations") return "Procol default";
  if (source === "not configured") return "not configured anywhere";
  return source ?? "";
}

function reasonFor(gate: GateDef, o: GateOutcome): string {
  const prefix = o.blocking ? "" : "(does not block) ";
  if (o.state === "per_event") return `${prefix}${gate.key} is decided per event, not per client — ${gate.why}`;
  if (o.state === "unknown") return `${prefix}${gate.key} could not be determined (${o.error ?? "query failed"})`;
  const onOff = o.state === "on" ? "ON" : "OFF";
  switch (gate.kind) {
    case "module": {
      const names = gate.key.split("|").map((n) => `'${n}'`).join(" or ");
      return o.state === "on"
        ? `${prefix}module ${names} is licensed for this company`
        : `${prefix}module ${names} is NOT licensed for this company`;
    }
    case "company_predicate":
      return `${prefix}${gate.key} is ${onOff} for this company — ${gate.why}`;
    case "company_config":
    default:
      // Inverted flags (hide_/lock_…): the flag being set is what takes the feature away.
      if (gate.on_when === "falsy") {
        return o.state === "on"
          ? `${prefix}${gate.key} is not set for this company (value ${short(o.value)}, ${fromLabel(o.from)}), so it does not restrict this feature`
          : `${prefix}${gate.key} is SET for this company (value ${short(o.value)}, ${fromLabel(o.from)}) — ${gate.why}`;
      }
      return `${prefix}${gate.key} is ${onOff} for this company (value ${short(o.value)}, ${fromLabel(o.from)})`;
  }
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * For one client company, decide per feature whether it is switched on.
 * Never throws: database trouble turns into `on: null` with a reason.
 */
export async function resolveFeatureGates(companyId: number): Promise<Record<string, FeatureGateState>> {
  const result: Record<string, FeatureGateState> = {};

  let file: FeatureGatesFile;
  try {
    file = loadFeatureGates();
  } catch (e: any) {
    // Without the map we don't even know the feature ids.
    return { _error: { on: null, reasons: [`featureGates.json could not be read: ${e?.message ?? e}`], gates: [] } };
  }
  const entries = Object.entries(file.features);
  const allUnknown = (why: string) => {
    for (const [id] of entries) result[id] = { on: null, reasons: [why], gates: [] };
    return result;
  };

  if (!Number.isInteger(companyId) || companyId <= 0) return allUnknown(`invalid company id ${companyId}`);

  // Does the company exist at all? Otherwise every module check would read "not licensed".
  try {
    const rows = await query<{ id: number }>("SELECT id FROM companies WHERE id = $1", [companyId]);
    if (!rows.length) return allUnknown(`company ${companyId} was not found in the database`);
  } catch (e: any) {
    return allUnknown(`database could not be read: ${e?.message ?? e}`);
  }

  // Many features share gates (module 'trade', rfx_project_enabled, ...): run each distinct SQL once.
  const distinctSql = [...new Set(entries.flatMap(([, f]) => f.gates.map((g) => g.sql).filter((s): s is string => !!s)))];
  const answers = new Map<string, { value: unknown; source?: string } | { error: string }>();
  await mapLimit(distinctSql, 4, async (sql) => {
    try {
      answers.set(sql, await runOnce(sql, companyId));
    } catch (e: any) {
      answers.set(sql, { error: String(e?.message ?? e).slice(0, 200) });
    }
  });

  for (const [id, feature] of entries) {
    const gates: GateOutcome[] = [];
    const reasons: string[] = [];

    for (const gate of feature.gates) {
      const blocking = gate.kind !== "per_event" && gate.blocking !== false;
      let outcome: GateOutcome;
      if (gate.kind === "per_event" || !gate.sql) {
        outcome = { kind: gate.kind, key: gate.key, state: "per_event", blocking: false };
      } else {
        const ans = answers.get(gate.sql);
        if (!ans || "error" in ans) {
          outcome = { kind: gate.kind, key: gate.key, state: "unknown", blocking, error: ans && "error" in ans ? ans.error : "not run" };
        } else {
          try {
            const on = evaluate(gate, ans.value);
            outcome = { kind: gate.kind, key: gate.key, state: on ? "on" : "off", blocking, value: ans.value, from: ans.source };
          } catch (e: any) {
            outcome = { kind: gate.kind, key: gate.key, state: "unknown", blocking, value: ans.value, from: ans.source, error: e?.message ?? String(e) };
          }
        }
      }
      gates.push(outcome);
      reasons.push(reasonFor(gate, outcome));
    }

    const decisive = gates.filter((g) => g.blocking);
    let on: boolean | null;
    if (decisive.some((g) => g.state === "off")) on = false;
    else if (decisive.some((g) => g.state === "unknown")) on = null;
    else on = true;

    // Lead with what turned it off (then what is unknown), so reasons[0] is the one to show.
    const rank = (g: GateOutcome) => (g.blocking && g.state === "off" ? 0 : g.blocking && g.state === "unknown" ? 1 : 2);
    const ordered = gates.map((g, i) => ({ g, r: reasons[i] })).sort((a, b) => rank(a.g) - rank(b.g)).map((x) => x.r);

    if (!feature.gates.length) ordered.push("no client-level switch — always available");
    else if (!decisive.length) ordered.unshift("no client-level switch decides this feature — always available");

    result[id] = { on, reasons: ordered, gates };
  }
  return result;
}
