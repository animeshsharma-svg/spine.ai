/**
 * The catalog AS FILES — read here so the database can hold it, and so the
 * run writer can tell which exact version of a case a result ran.
 *
 *   data/test-cases.json            the written catalog (npm run cases:import)
 *   data/journeys.json              journeys and the cases in each
 *   data/api-cases.json + data/api-cases-extra/*.json   the runnable library
 *   config/featureTree.ts           the feature tree
 *   data/compiled-plans/{api,ui}/*.json                 compiled plans
 *
 * A case's VERSION is the sha256 of its content in canonical JSON (keys
 * sorted): { written: <catalog entry>, automation: <library entry> }. Either
 * part changing makes a new version; whitespace in the JSON file does not.
 * Fields that are positions or derived values (the catalog's sectionNo, the
 * journey's routeKind / runnable) are left out so a re-numbering is not a
 * "new case".
 *
 * Files are read once and re-read only when they change (mtime), so the run
 * writer can call this on every save.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const PROTO = join(here, "..", "..");
export const REPO = join(PROTO, "..");
const DATA = join(PROTO, "data");

// ── canonical JSON + hash ───────────────────────────────────────────────────

/** JSON with object keys sorted at every level; undefined dropped. */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(sortKeys(v));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}
export const sha256 = (s: string | Buffer): string => createHash("sha256").update(s).digest("hex");
export const contentHash = (content: unknown): string => sha256(canonicalJson(content));

// ── file cache ──────────────────────────────────────────────────────────────

const cache = new Map<string, { mtime: number; value: unknown }>();
function readJsonCached<T>(file: string, fallback: T): T {
  try {
    const { mtimeMs } = statSync(file);
    const hit = cache.get(file);
    if (hit && hit.mtime === mtimeMs) return hit.value as T;
    const value = JSON.parse(readFileSync(file, "utf8")) as T;
    cache.set(file, { mtime: mtimeMs, value });
    return value;
  } catch {
    return fallback;
  }
}

// ── the sources ─────────────────────────────────────────────────────────────

export interface WrittenCase {
  id: string;
  layer?: string;
  group?: string;
  title?: string;
  priority?: string;
  [k: string]: unknown;
}
export interface LibraryCase {
  id: string;
  feature?: string;
  title?: string;
  priority?: string;
  [k: string]: unknown;
}

/** Written catalog cases by id. */
export function writtenCases(): Map<string, WrittenCase> {
  const file = join(DATA, "test-cases.json");
  const j = readJsonCached<{ cases?: WrittenCase[] }>(file, { cases: [] });
  return memo(`written:${statKey(file)}`, () => new Map((j.cases ?? []).filter((c) => c?.id).map((c) => [c.id, c])));
}

/** Library (runnable API) cases by id, from api-cases.json and every api-cases-extra file. */
export function libraryCases(): Map<string, LibraryCase & { _file: string }> {
  const files = [join(DATA, "api-cases.json")];
  const extra = join(DATA, "api-cases-extra");
  if (existsSync(extra)) for (const f of readdirSync(extra).filter((n) => n.endsWith(".json")).sort()) files.push(join(extra, f));
  return memo(`library:${files.map(statKey).join("|")}`, () => {
    const out = new Map<string, LibraryCase & { _file: string }>();
    for (const f of files) {
      const arr = readJsonCached<unknown>(f, []);
      const list = (Array.isArray(arr) ? arr : ((arr as { cases?: unknown[] })?.cases ?? [])) as LibraryCase[];
      for (const c of list) if (c?.id && !out.has(c.id)) out.set(c.id, { ...c, _file: relative(REPO, f) });
    }
    return out;
  });
}

export interface JourneyDef {
  id: string;
  title: string;
  persona?: string;
  goal?: string;
  order: number;
  uiGroups: string[];
  apiGroups: string[];
  caseIds: string[];
}
export function journeyDefs(): JourneyDef[] {
  const file = join(DATA, "journeys.json");
  const j = readJsonCached<{ journeys?: any[] }>(file, { journeys: [] });
  return (j.journeys ?? []).map((x, i) => ({
    id: String(x.id),
    title: String(x.title ?? x.id),
    persona: x.persona,
    goal: x.goal,
    order: Number(x.order ?? i + 1),
    uiGroups: x.uiGroups ?? [],
    apiGroups: x.apiGroups ?? [],
    caseIds: (x.cases ?? []).map((c: any) => String(c.id)),
  }));
}

export interface CompiledPlanFile {
  caseId: string;
  kind: "api" | "ui";
  file: string;
  meta: any;
  plan: any;
}
/** Compiled plans on disk (data/compiled-plans/{api,ui}, data/deep2-plans). */
export function compiledPlanFiles(): CompiledPlanFile[] {
  const out: CompiledPlanFile[] = [];
  const dirs: Array<[string, "api" | "ui" | "auto"]> = [
    [join(DATA, "compiled-plans", "api"), "api"],
    [join(DATA, "compiled-plans", "ui"), "ui"],
    [join(DATA, "deep2-plans"), "auto"],
  ];
  for (const [dir, kind] of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
      const j = readJsonCached<any>(join(dir, f), null);
      const caseId = j?.meta?.caseId ?? j?.plan?.caseId ?? f.replace(/\.json$/, "");
      if (!j?.plan || !caseId) continue;
      const k = kind === "auto" ? (Array.isArray(j.plan.steps) && !j.plan.act ? "ui" : "api") : kind;
      out.push({ caseId: String(caseId), kind: k, file: relative(REPO, join(dir, f)), meta: j.meta ?? {}, plan: j.plan });
    }
  }
  return out;
}

// ── a case's content, as versioned ──────────────────────────────────────────

const WRITTEN_DROP = new Set(["id", "sectionNo", "routeKind", "runnable"]);
const LIBRARY_DROP = new Set(["id", "_file"]);

function strip(o: Record<string, unknown> | undefined, drop: Set<string>): Record<string, unknown> | null {
  if (!o) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!drop.has(k)) out[k] = v;
  return out;
}

export interface CaseContent {
  key: string;
  origin: "catalog" | "library";
  title: string;
  layer: "api" | "ui" | "api+ui" | "unknown";
  priority: string | null;
  groupKey: string | null;
  featureKey: string | null;
  content: { written: Record<string, unknown> | null; automation: Record<string, unknown> | null };
  hash: string;
  source: string;
}

/** The current content of a catalog or library case, or null when neither file has it. */
export function caseContent(key: string): CaseContent | null {
  const w = writtenCases().get(key);
  const l = libraryCases().get(key);
  if (!w && !l) return null;
  const content = { written: strip(w, WRITTEN_DROP), automation: strip(l, LIBRARY_DROP) };
  const layerW = w?.layer === "api" || w?.layer === "ui" ? w.layer : null;
  const layer = layerW && l && layerW === "ui" ? "api+ui" : (layerW ?? (l ? "api" : "unknown"));
  const prio = String(w?.priority ?? l?.priority ?? "").trim();
  return {
    key,
    origin: w ? "catalog" : "library",
    title: String(w?.title ?? l?.title ?? key),
    layer: layer as CaseContent["layer"],
    priority: /^P[0-4]$/.test(prio) ? prio : null,
    groupKey: (w?.group as string) ?? key.replace(/-\d+(\.\d+)?$/, "") ?? null,
    featureKey: (l?.feature as string) ?? null,
    content,
    hash: contentHash(content),
    source: w ? "data/test-cases.json" : (l?._file ?? "data/api-cases.json"),
  };
}

/** Every case key in the written catalog and the library. */
export function allCaseKeys(): string[] {
  return [...new Set([...writtenCases().keys(), ...libraryCases().keys()])].sort();
}

// ── tiny helpers ────────────────────────────────────────────────────────────

function statKey(f: string): string {
  try {
    return `${f}@${statSync(f).mtimeMs}`;
  } catch {
    return `${f}@none`;
  }
}
const memos = new Map<string, unknown>();
function memo<T>(key: string, make: () => T): T {
  const prefix = key.split(":")[0];
  if (memos.has(key)) return memos.get(key) as T;
  for (const k of [...memos.keys()]) if (k.startsWith(`${prefix}:`)) memos.delete(k);
  const v = make();
  memos.set(key, v);
  return v;
}
