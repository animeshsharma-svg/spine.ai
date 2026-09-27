/**
 * THE EXECUTOR — the "muscle" of the platform.
 *
 * It runs the REAL Playwright flows that already live in `procol test/`, but
 * WITHOUT launching the Playwright test runner. It hands back a clean, tidy
 * result object that both the UI and (later) the AI agents can use.
 *
 * Later, the AI agents will call `runFlows(...)` as a TOOL. Build the muscle
 * first, prove it by hand, then attach the brain.
 */
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isTokenClient } from "../config/tokenClients.js";
import { openTokenClient } from "./tokenClient.js";

const here = dirname(fileURLToPath(import.meta.url));
export const PROCOL_TEST = join(here, "..", "..", "procol test");

// Load OUR env first (e.g. GROQ_API_KEY from prototype/.env), then the sibling
// framework's env (DATABASE_URL, etc.). dotenv never overwrites an already-set
// variable, so this order is safe. Both are loaded BEFORE importing sibling
// modules, which read the database at import time.
loadEnv({ path: join(here, "..", ".env") });
loadEnv({ path: join(PROCOL_TEST, ".env") });

// Catalog metadata (plain names + "does it check the DB") for nicer results.
const catalog = JSON.parse(
  readFileSync(join(here, "..", "data", "catalog.json"), "utf8"),
) as { flows: Array<{ id: string; name: string; category: string; verifiedInDb: boolean }> };
const catalogById = new Map(catalog.flows.map((f) => [f.id, f]));

// ── The shape we hand back for every flow ─────────────────────────────────
export interface FlowResult {
  flowId: string;
  name: string;
  category: string;
  status: "passed" | "failed" | "skipped";
  /** why the flow was allowed to run (or not) for this client's config */
  gate: { enabled: boolean; reason?: string };
  /** does a PASS also mean it was confirmed in the database? */
  verifiesDatabase: boolean;
  durationMs: number;
  error: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface RunReport {
  companyId: number;
  companyName: string | null;
  results: FlowResult[];
}

// ── Loading the sibling framework (done lazily, once env is ready) ─────────
// We import by file:// URL so the space in "procol test" is handled safely.
type Sibling = {
  resolveClientContext: (companyId?: number, baseUrl?: string) => Promise<any>;
  ClientConfig: { load: (api: any) => Promise<any> };
  REGISTRY: Array<{
    key: string;
    category: string;
    title: string;
    enabledFor: (config: any) => { enabled: boolean; reason?: string };
    run: (ctx: any) => Promise<void>;
  }>;
};

let sibling: Sibling | undefined;
async function loadSibling(): Promise<Sibling> {
  if (sibling) return sibling;
  const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);
  const [ctxMod, cfgMod, regMod] = await Promise.all([
    imp("context.ts"),
    imp("master/config.ts"),
    imp("master/registry.ts"),
  ]);
  sibling = {
    resolveClientContext: ctxMod.resolveClientContext,
    ClientConfig: cfgMod.ClientConfig,
    REGISTRY: regMod.REGISTRY,
  };
  return sibling;
}

/**
 * Open a client (login + catalog + vendor + evaluator + config) once and hand
 * back the live context + a disposer. Used by the orchestrator's Executor agent
 * so it can run flows AND the data-validation probe against the same session.
 */
export async function openClientContext(companyId: number, baseUrl?: string) {
  // A token client is not a company on UAT: it has its own host and a static
  // token, so the session lookup does not apply to it.
  if (isTokenClient(companyId)) return openTokenClient(companyId) as any;
  return openClient(companyId, baseUrl);
}

// Resolve one client once (login + catalog + vendor + evaluator + config),
// and give back a disposer so callers can clean up the DB/HTTP connections.
async function openClient(companyId: number, baseUrl?: string) {
  const s = await loadSibling();
  // A base URL chosen in the UI wins over the one configured for this client.
  const base = await s.resolveClientContext(companyId, baseUrl);
  const config = await s.ClientConfig.load(base.buyerApi);
  const ctx = { ...base, config };
  return {
    s,
    ctx,
    config,
    companyName: base.companyName as string | null,
    dispose: () => base.dispose() as Promise<void>,
  };
}

/**
 * Run one or more flows (by id) for a client. Resolves the client ONCE, runs
 * each flow, and always cleans up. A flow that is disabled for this client is
 * reported as "skipped" with the reason (never treated as a failure).
 */
export async function runFlows(flowIds: string[], companyId: number): Promise<RunReport> {
  const client = await openClient(companyId);
  const results: FlowResult[] = [];
  try {
    for (const flowId of flowIds) {
      results.push(await runOne(client, flowId));
    }
  } finally {
    await client.dispose().catch(() => {});
  }
  return { companyId, companyName: client.companyName, results };
}

/** Convenience: run a single flow. */
export async function runFlow(flowId: string, companyId: number): Promise<FlowResult> {
  const report = await runFlows([flowId], companyId);
  return report.results[0];
}

/** Run flows against an ALREADY-open client (used by the orchestrator, which
 * opens the client once and reuses it for flows + the validation probe). */
export async function runSelected(
  client: Awaited<ReturnType<typeof openClientContext>>,
  flowIds: string[],
): Promise<FlowResult[]> {
  const out: FlowResult[] = [];
  for (const id of flowIds) out.push(await runOne(client, id));
  return out;
}

interface RegistryModule {
  key: string;
  title: string;
  category: string;
  enabledFor: (config: unknown) => { enabled: boolean; reason?: string };
}

/**
 * The capability map (flow on/off + reason) from an already-open client.
 *
 * A token client carries no flow registry — its journeys live in the UAT
 * database, which that account has none of — so it reports an empty map
 * rather than every flow "off", which would read as a problem with the
 * account rather than an absence of one.
 */
export function capabilityFromClient(client: Awaited<ReturnType<typeof openClientContext>>) {
  const registry = (client as { s?: { REGISTRY?: RegistryModule[] } }).s?.REGISTRY;
  if (!registry) return [];
  return registry.map((m: RegistryModule) => {
    const g = m.enabledFor(client.config);
    return {
      id: m.key,
      title: m.title,
      category: m.category,
      enabled: g.enabled,
      reason: g.reason ?? null,
    };
  });
}

async function runOne(
  client: Awaited<ReturnType<typeof openClient>>,
  flowId: string,
): Promise<FlowResult> {
  const meta = catalogById.get(flowId);
  const mod = client.s.REGISTRY.find((m) => m.key === flowId);
  const startedAt = new Date().toISOString();
  const start = Date.now();

  const base = {
    flowId,
    name: meta?.name ?? mod?.title ?? flowId,
    category: meta?.category ?? mod?.category ?? "unknown",
    verifiesDatabase: meta?.verifiedInDb ?? false,
  };

  // Unknown id → clearly report it rather than throwing.
  if (!mod) {
    return {
      ...base,
      status: "failed",
      gate: { enabled: false, reason: "no such flow id in the registry" },
      durationMs: 0,
      error: `Unknown flow id "${flowId}"`,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  // Config gate: is this flow turned on for this client?
  const gate = mod.enabledFor(client.config);
  if (!gate.enabled) {
    return {
      ...base,
      status: "skipped",
      gate,
      durationMs: Date.now() - start,
      error: null,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  // Run it. The flow throws on failure (Playwright `expect` inside).
  try {
    await mod.run(client.ctx);
    return {
      ...base,
      status: "passed",
      gate,
      durationMs: Date.now() - start,
      error: null,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      ...base,
      status: "failed",
      gate,
      durationMs: Date.now() - start,
      error: cleanError(err),
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }
}

/** Turn any thrown value into a short, readable one-liner (no stack dump). */
function cleanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.split("\n")[0].slice(0, 400);
}

/**
 * The capability map: for a client, which flows are ON/OFF and why.
 * (The UI's "feature map" panel will use this.)
 */
export async function getCapabilityMap(companyId: number) {
  if (isTokenClient(companyId)) {
    // Nothing to report: the sourcing journeys resolve their data from the UAT
    // database. Say that, rather than showing every flow as "off" — which
    // would read as a configuration problem on the account.
    const client = await openTokenClient(companyId);
    await client.dispose();
    return {
      companyId,
      companyName: client.companyName,
      flows: [],
      note: `${client.tokenClient.name}: ${client.tokenClient.covers}`,
    };
  }
  const client = await openClient(companyId);
  try {
    return { companyId, companyName: client.companyName, flows: capabilityFromClient(client) };
  } finally {
    await client.dispose().catch(() => {});
  }
}
