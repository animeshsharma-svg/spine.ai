/**
 * DRAFT TEST CASES — what the assistant wrote when a typed case was new.
 *
 * A draft lives in two places on purpose:
 *   • test-cases/generated-<date>.md, in the catalog's own format, so a person
 *     reviews it the way they review every other case (and can promote it by
 *     moving the block into a catalog file);
 *   • spine.ai's database (generated_cases, migration 003), with its embedding,
 *     so the next time someone types the same thing the matcher finds the draft
 *     instead of writing a second one.
 * With the database down, the markdown file is the whole record and drafts are
 * still found (by words) from it.
 *
 * A draft is never part of the catalog until a person says so: the importer
 * reads only events-*.md, api-*.md and product-*.md, and ids are GEN-…, which
 * it does not parse. Status stays "draft" until someone changes it.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spineDb, toVector } from "../db/spineDb.js";
import { embedOne, embedderId, ensureEmbedderReady } from "../rag/embedder.js";
import { registerDraftSearch, type DraftLike, type FoundConcept } from "../checks/caseMatcher.js";

const here = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(here, "..", "..", "..", "test-cases");

export interface DraftRecord {
  id: string;
  area: string;
  typed: string;
  title: string;
  why: string;
  setup: string;
  steps: string[];
  expected: string;
  oracle: string;
  priority: string;
  layer: "api" | "ui" | "api+ui" | "none";
  coverage: "full" | "partial" | "none";
  gaps: string[];
  partialOf: string[];
  apiCase?: unknown;
  uiPlan?: unknown;
  lastRun?: unknown;
  companyId?: number;
}

/** Which area code a draft is filed under, from what the typed case is about. */
const AREA_ORDER: Array<[string, string]> = [
  ["upload", "VBU"],
  ["surrogate", "SUR"],
  ["convert", "CONV"],
  ["withdraw", "LC"],
  ["clone", "LC"],
  ["award", "AWD"],
  ["approve", "AWD"],
  ["evaluate", "EVL"],
  ["counter", "NEG"],
  ["bid", "BID"],
  ["invite", "AUD"],
  ["schedule", "SCH"],
  ["template", "TPL"],
  ["lineitem", "LI"],
  ["boq", "LI"],
  ["publish", "PUB"],
  ["stage", "STG"],
  ["auction", "AUC"],
  ["permission", "PERM"],
  ["login", "AUTH"],
  ["search", "LIST"],
  ["view", "LIST"],
  ["title", "CRT"],
  ["create", "CRT"],
];

export function areaFor(concepts: FoundConcept[]): string {
  const ids = new Set(concepts.map((c) => c.id));
  return AREA_ORDER.find(([c]) => ids.has(c))?.[1] ?? "GEN";
}

function mdFiles(): string[] {
  if (!existsSync(CASES_DIR)) return [];
  return readdirSync(CASES_DIR)
    .filter((f) => /^generated-.*\.md$/.test(f))
    .sort()
    .map((f) => join(CASES_DIR, f));
}

/** Every GEN- id already used, in the database or the markdown. */
async function usedIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const f of mdFiles()) for (const m of readFileSync(f, "utf8").matchAll(/^###\s+(GEN-[A-Z]+-\d{3})/gm)) ids.add(m[1]);
  const db = await spineDb();
  if (db) {
    const r = await db.query<{ id: string }>(`SELECT id FROM generated_cases`).catch(() => ({ rows: [] as Array<{ id: string }> }));
    for (const x of r.rows) ids.add(x.id);
  }
  return ids;
}

export async function nextDraftId(area: string): Promise<string> {
  const used = await usedIds();
  let n = 1;
  for (const id of used) {
    const m = id.match(new RegExp(`^GEN-${area}-(\\d{3})$`));
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return `GEN-${area}-${String(n).padStart(3, "0")}`;
}

const today = () => new Date().toISOString().slice(0, 10);

/** The block, in the catalog's format (see scripts/import-test-cases.ts). */
export function draftMarkdown(d: DraftRecord): string {
  const steps = d.steps.map((s, i) => `${i + 1}. ${s.replace(/^\d+[.)]\s*/, "")}`).join(" ");
  const covered =
    d.coverage === "full"
      ? "the automation built for it covers all of it"
      : d.coverage === "partial"
        ? `the automation covers part of it — not yet: ${d.gaps.join("; ") || "see the gaps"}`
        : `no automation could be built for it yet — ${d.gaps.join("; ") || "no step or request fits"}`;
  return [
    `### ${d.id} — ${d.title}`,
    "",
    `- **Why it matters.** ${d.why.replace(/([^.!?])$/, "$1.")} **Draft, needs review** — written by the assistant on ${today()} from a request typed in the chat box; ${covered}.`,
    `- **Setup.** ${d.setup || "A buyer signed in to the client under test."}`,
    `- **Steps.** ${steps}`,
    `- **Expected.** ${d.expected}`,
    `- **Oracle.** ${d.oracle}`,
    `- **Trace.** ${d.priority} · draft · \`${d.id}\` · layer ${d.layer} · coverage ${d.coverage}${d.partialOf.length ? ` · overlaps ${d.partialOf.slice(0, 3).map((x) => `\`${x}\``).join(", ")}` : ""} · typed: “${d.typed.replace(/\s+/g, " ").slice(0, 200)}”`,
    "",
  ].join("\n");
}

/** Write the draft to the day's markdown file and to the database. */
export async function saveDraft(d: DraftRecord): Promise<{ id: string; mdFile: string; stored: "postgres" | "markdown only"; error?: string }> {
  const file = join(CASES_DIR, `generated-${today()}.md`);
  const md = draftMarkdown(d);
  if (!existsSync(file)) {
    writeFileSync(
      file,
      `# Generated test cases — drafts (${today()})\n\n` +
        "Every case below was written by the spine.ai assistant when someone typed a test case that no existing case covered.\n" +
        "They are DRAFTS: nothing here is in the catalog until a person reviews it and moves it into a catalog file\n" +
        "(the importer does not read `generated-*.md`, and `GEN-` ids are not parsed).\n\n" +
        "## 1. Drafts from the assistant\n\n",
    );
  }
  appendFileSync(file, md + "\n");

  const db = await spineDb();
  if (!db) return { id: d.id, mdFile: file, stored: "markdown only" };
  try {
    let vec: number[] | null = null;
    try {
      await ensureEmbedderReady();
      vec = await embedOne(`${d.title}. ${d.steps.join(" ")} Expected: ${d.expected}`);
    } catch {
      vec = null; // stored without a vector; still found by words
    }
    const emb = embedderId();
    const col = emb.startsWith("slingring:") ? "embedding" : "embedding_small";
    await db.query(
      `INSERT INTO generated_cases (id, area, status, typed_text, title, setup, steps, expected, oracle, layer, coverage, gaps, partial_of,
                                    api_case, ui_plan, last_run, company_id, case_md, md_file, ${col}, embedded_with)
       VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::vector,$20)
       ON CONFLICT (id) DO UPDATE SET last_run = EXCLUDED.last_run, updated_at = now()`,
      [
        d.id, d.area, d.typed, d.title, d.setup, d.steps, d.expected, d.oracle, d.layer, d.coverage, d.gaps, d.partialOf,
        d.apiCase ? JSON.stringify(d.apiCase) : null,
        d.uiPlan ? JSON.stringify(d.uiPlan) : null,
        d.lastRun ? JSON.stringify(d.lastRun) : null,
        d.companyId ?? null, md, file,
        vec ? toVector(vec) : null, vec ? emb : null,
      ],
    );
    return { id: d.id, mdFile: file, stored: "postgres" };
  } catch (e) {
    return { id: d.id, mdFile: file, stored: "markdown only", error: (e as Error).message };
  }
}

/** One stored draft's automation (the API record and the UI plan), or null. */
export async function getDraftAutomation(id: string): Promise<{ apiCase: any; uiPlan: any; coverage: string; gaps: string[] } | null> {
  const db = await spineDb();
  if (!db) return null;
  const r = await db.query(`SELECT api_case, ui_plan, coverage, gaps FROM generated_cases WHERE id = $1`, [id]).catch(() => null);
  const x = r?.rows[0];
  return x ? { apiCase: x.api_case, uiPlan: x.ui_plan, coverage: x.coverage, gaps: x.gaps ?? [] } : null;
}

/** Record the API part's latest run against the draft. */
export async function updateDraftRun(id: string, lastRun: unknown): Promise<void> {
  const db = await spineDb();
  if (!db) return;
  await db.query(`UPDATE generated_cases SET last_run = $2, updated_at = now() WHERE id = $1`, [id, JSON.stringify(lastRun)]).catch(() => {});
}

export interface DraftSummary {
  id: string;
  title: string;
  status: string;
  layer: string;
  coverage: string;
  gaps: string[];
  typed: string;
  createdAt: string | null;
  mdFile: string | null;
  lastRun?: unknown;
}

/** Drafts, newest first: the database when it is up, else parsed from the markdown. */
export async function listDrafts(limit = 50): Promise<DraftSummary[]> {
  const db = await spineDb();
  if (db) {
    const r = await db
      .query(
        `SELECT id, title, status, layer, coverage, gaps, typed_text, created_at, md_file, last_run
           FROM generated_cases ORDER BY created_at DESC LIMIT $1`,
        [limit],
      )
      .catch(() => null);
    if (r)
      return r.rows.map((x: any) => ({
        id: x.id, title: x.title, status: x.status, layer: x.layer, coverage: x.coverage, gaps: x.gaps ?? [],
        typed: x.typed_text, createdAt: new Date(x.created_at).toISOString(), mdFile: x.md_file, lastRun: x.last_run ?? undefined,
      }));
  }
  return mdDrafts().slice(-limit).reverse().map((d) => ({ id: d.id, title: d.title, status: "draft", layer: "?", coverage: "?", gaps: [], typed: "", createdAt: null, mdFile: null }));
}

/** Drafts read back from the markdown files (no database needed). */
function mdDrafts(): DraftLike[] {
  const out: DraftLike[] = [];
  for (const f of mdFiles()) {
    const text = readFileSync(f, "utf8");
    for (const block of text.split(/^(?=###\s+GEN-)/m)) {
      const head = block.match(/^###\s+(GEN-[A-Z]+-\d{3})\s+—\s+(.+)$/m);
      if (!head) continue;
      const field = (name: string) => block.match(new RegExp(`\\*\\*${name}\\.\\*\\*\\s*(.+)`))?.[1]?.trim() ?? "";
      out.push({ id: head[1], title: head[2].trim(), steps: field("Steps"), expected: field("Expected"), status: "draft" });
    }
  }
  return out;
}

/** The matcher's hook: drafts by meaning when the database has vectors, else by words. */
async function searchDrafts(vec: number[] | null, embedder: string, _text: string): Promise<DraftLike[]> {
  const db = await spineDb();
  if (db) {
    const col = embedder.startsWith("slingring:") ? "embedding" : "embedding_small";
    const r = await db
      .query(
        vec
          ? `SELECT id, title, steps, expected, status, COALESCE(1 - (${col} <=> $1::vector), 0) AS dense
               FROM generated_cases WHERE status <> 'rejected' ORDER BY ${col} <=> $1::vector NULLS LAST LIMIT 10`
          : `SELECT id, title, steps, expected, status FROM generated_cases WHERE status <> 'rejected' ORDER BY created_at DESC LIMIT 30`,
        vec ? [toVector(vec)] : [],
      )
      .catch(() => null);
    if (r)
      return r.rows.map((x: any) => ({
        id: x.id, title: x.title, steps: (x.steps ?? []).join(" "), expected: x.expected, status: x.status,
        dense: x.dense !== undefined ? Number(x.dense) : undefined,
      }));
  }
  return mdDrafts();
}

registerDraftSearch(searchDrafts);

/** One row per assistant turn (best effort — a database outage never fails a turn). */
export async function recordTurn(t: {
  typed: string;
  companyId?: number;
  decision: string;
  matched: string[];
  partial: string[];
  generatedId?: string | null;
  runIds: string[];
  answer: string;
  record: unknown;
}): Promise<number | null> {
  const db = await spineDb();
  if (!db) return null;
  const r = await db
    .query(
      `INSERT INTO assistant_turns (typed_text, company_id, decision, matched, partial, generated_id, run_ids, answer, record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [t.typed, t.companyId ?? null, t.decision, t.matched, t.partial, t.generatedId ?? null, t.runIds, t.answer, JSON.stringify(t.record)],
    )
    .catch((e) => {
      console.warn(`[assistant] turn not recorded: ${(e as Error).message}`);
      return null;
    });
  return r?.rows[0]?.id ?? null;
}

export async function recentTurns(limit = 20): Promise<unknown[]> {
  const db = await spineDb();
  if (!db) return [];
  const r = await db
    .query(`SELECT id, at, typed_text, decision, matched, partial, generated_id, run_ids, answer FROM assistant_turns ORDER BY at DESC LIMIT $1`, [limit])
    .catch(() => null);
  return r?.rows ?? [];
}
