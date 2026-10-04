/**
 * AUTOMATION EXEMPLARS — the memory of how automation was built before.
 *
 * Every test case that already has a WORKING automation is an exemplar: its
 * words, the validated API plan that tests it, and the last real verdict that
 * plan got on the real app. When the API test compiler (apiPlanner.ts) meets a
 * case it has never seen, it asks this module for the closest exemplars — by
 * meaning (the memory's embeddings) AND by structure (same actor, same action,
 * same starting state, same expected outcome) — and either
 *
 *   • REUSES one outright, without a model, when it fits exactly (the new case
 *     says nothing the exemplar's case does not, the frames agree and the
 *     meaning is near-identical) — the plan is re-validated and re-judged for
 *     coverage like any other; or
 *   • shows the closest few to the model as WORKED EXAMPLES ("this case was
 *     automated as this plan, and that plan passed on the real app").
 *
 * Where exemplars come from (collectExemplars):
 *   stored-plan      data/compiled-plans/api/<id>.json — validated, FULL coverage
 *                    (incl. assistant drafts a person approved: source assistant-reviewed)
 *   library-case     runnable library cases (data/api-cases*.json + api-cases-extra/*)
 *                    turned into plans without a model (planFromLibraryCase), only
 *                    when the starting state is one a recipe builds; the words are
 *                    the catalog case that cites it, when there is one
 *   deep2-twin       data/deep2-plans/*.json (validated twins): a native-op plan is a
 *                    full exemplar; a twin that sends its own library request (only
 *                    loaded by the deep-dig runner) is a SHAPE hint (recipe, actor,
 *                    request, code) — never copied as a plan
 *
 * Learning loop: addExemplar() files a new one at once (data/exemplars.json + one
 * memory chunk) — called when a person approves a draft whose plan ran with a
 * decisive verdict (draftReview.ts). Stored full plans that appear later are
 * picked up on the next load (by words) and on the next `npm run rag:build`
 * (by meaning). Verdicts are read live from the run store (results), so an
 * exemplar's trust follows its latest real run.
 *
 * Nothing here decides pass or fail. Everything a plan does still goes through
 * validatePlan + storedPlanProblems, and the oracle stays deterministic.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCases, type TestCaseRecord } from "../checks/caseLibrary.js";
import { allCases, caseById } from "../checks/testCatalog.js";
import { allStoredApiPlans } from "../checks/compiledPlans.js";
import { frameOf, normalizeText, conceptsIn, type Frame } from "../checks/caseMatcher.js";
import { spineDb, toVector } from "../db/spineDb.js";
import { embedOne, embedderId, ensureEmbedderReady } from "../rag/embedder.js";
import { candidates as pgCandidates } from "../rag/pgMemory.js";
import type { ApiPlan, ActorId, RecipeId } from "./apiPlanner.js";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "..", "data");
export const EXEMPLARS_FILE = join(DATA, "exemplars.json");
const DEEP2_PLANS = join(DATA, "deep2-plans");
const DEEP2_CASES = join(DATA, "deep2-cases");

export type ExemplarSource = "stored-plan" | "library-case" | "deep2-twin" | "approved-draft";

export interface ExemplarShape {
  recipe: RecipeId | string;
  /** the decisive act's op ("library" for a library request) */
  op: string;
  /** "POST /v1/bids" — the decisive request */
  endpoint?: string;
  actor: ActorId | string;
  outcome: string;
  code?: string;
  verifies: number;
  acts: number;
}

export interface Exemplar {
  /** the case id the words come from (catalog API-…, library EDGE-…, twin EVD2-…) */
  id: string;
  /** ids whose run results count as this exemplar's verdict */
  caseIds: string[];
  title: string;
  /** the case's words — what is embedded and compared */
  text: string;
  source: ExemplarSource;
  /** a plan that validates in an ordinary process; null = a shape hint only */
  plan: ApiPlan | null;
  shape: ExemplarShape;
  /** the library case the decisive act sends, when it is one */
  libraryId?: string;
  /** for a shape hint: the twin's own request, in words */
  request?: string;
}

export interface ExemplarVerdict {
  verdict: "pass" | "fail" | "inconclusive" | "never-run";
  at?: string;
  runs: number;
  reason?: string;
}

export interface ExemplarHit {
  ex: Exemplar;
  /** final rank score 0..1 */
  score: number;
  /** cosine similarity of the case words (0 when only words were compared) */
  dense: number;
  words: number;
  structure: number;
  /** what agrees / differs in structure, in words */
  agrees: string[];
  differs: string[];
  verdict: ExemplarVerdict;
}

const oneLine = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

// ── building the exemplar set ───────────────────────────────────────────────

function shapeOf(plan: ApiPlan, lib: Map<string, TestCaseRecord>): ExemplarShape {
  const acts = plan.act ?? [];
  const dec = acts.find((a) => a.decisive) ?? [...acts].reverse().find((a) => a.op !== "wait") ?? acts[0];
  let endpoint: string | undefined;
  if (dec?.op === "library" && dec.caseId) {
    const lc = lib.get(dec.caseId);
    if (lc) endpoint = `${String(lc.method).toUpperCase()} ${String(lc.path).split("?")[0].replace(/\{\{\w+\}\}/g, ":id")}`;
  }
  return {
    recipe: plan.setup?.recipe,
    op: dec?.op ?? "none",
    endpoint,
    actor: dec?.as ?? (dec?.op && ["open_bid", "price_bid", "submit_bid", "place_bid", "start_tech_response"].includes(dec.op) ? "vendor" : "buyer"),
    outcome: plan.expected?.outcome,
    code: plan.expected?.code,
    verifies: plan.verify?.length ?? 0,
    acts: acts.length,
  };
}

function catalogText(c: { title: string; setup?: string; steps?: string; expected?: string }): string {
  return oneLine(`${c.title}. ${c.setup ? `Setup: ${c.setup}. ` : ""}${c.steps ? `Steps: ${c.steps}. ` : ""}${c.expected ? `Expected: ${c.expected}` : ""}`).slice(0, 900);
}
function libraryText(c: TestCaseRecord): string {
  return oneLine(`${c.title.replace(/^QA_Platform_/, "").replace(/_/g, " ")}. Setup: ${c.preconditions ?? ""}. Steps: ${(c.steps ?? []).join(" ")}. Expected: ${c.expectedResult ?? ""}`).slice(0, 900);
}

/**
 * Gather every exemplar, validating each plan in code. Slow-ish (validates
 * ~1,000 plans); the result is written to data/exemplars.json.
 */
export async function collectExemplars(log: (s: string) => void = () => {}): Promise<{ exemplars: Exemplar[]; counts: Record<string, number>; skipped: Record<string, number> }> {
  const { validatePlan, planFromLibraryCase, libraryCaseProblem, recipeForLibraryCase } = await import("./apiPlanner.js");
  const libAll = loadCases();
  const lib = new Map(libAll.map((c) => [c.id, c]));
  const out = new Map<string, Exemplar>();
  const counts: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);
  const add = (e: Exemplar) => {
    if (out.has(e.id)) return;
    out.set(e.id, e);
    counts[e.source] = (counts[e.source] ?? 0) + 1;
  };

  // (1) stored full plans (compiled by the model, or approved assistant drafts)
  for (const sp of allStoredApiPlans()) {
    if (!sp.meta.validated || sp.meta.coverage !== "full") {
      skip("stored plan not full / not validated");
      continue;
    }
    const v = await validatePlan(sp.plan);
    if (!v.ok) {
      skip("stored plan no longer validates");
      continue;
    }
    const cat = caseById(sp.meta.caseId);
    const dec = v.plan.act.find((a) => a.decisive) ?? v.plan.act[v.plan.act.length - 1];
    add({
      id: sp.meta.caseId,
      caseIds: [sp.meta.caseId],
      title: cat?.title ?? sp.meta.title,
      text: cat ? catalogText(cat) : oneLine(sp.meta.title),
      source: sp.meta.source === "assistant-reviewed" ? "approved-draft" : "stored-plan",
      plan: v.plan,
      shape: shapeOf(v.plan, lib),
      ...(dec?.op === "library" && dec.caseId ? { libraryId: dec.caseId } : {}),
    });
  }

  // (2) runnable library cases → plans without a model. The catalog case that
  // cites one gives the words (a QA engineer's prose, like a new case's).
  const citedBy = new Map<string, string[]>();
  for (const c of allCases()) for (const r of c.refs ?? []) if (lib.has(r)) citedBy.set(r, [...(citedBy.get(r) ?? []), c.id]);
  let n = 0;
  for (const lc of libAll) {
    if (libraryCaseProblem(lc)) {
      skip("library case not usable as an act");
      continue;
    }
    const r = recipeForLibraryCase(lc);
    if (r.unbuilt || r.setting || r.gaps.length) {
      skip("library case needs a state or setting no recipe builds");
      continue;
    }
    const { plan, gaps } = await planFromLibraryCase(lc);
    if (gaps.length) {
      skip("library plan has gaps");
      continue;
    }
    const v = await validatePlan(plan);
    if (!v.ok) {
      skip("library plan does not validate");
      continue;
    }
    const cats = (citedBy.get(lc.id) ?? []).map((id) => caseById(id)!).filter(Boolean);
    const cat = cats.find((c) => c.layer === "api") ?? cats[0];
    const id = cat && !out.has(cat.id) ? cat.id : lc.id;
    add({
      id,
      caseIds: [...new Set([lc.id, ...cats.map((c) => c.id)])],
      title: cat?.title ?? lc.title.replace(/^QA_Platform_/, "").replace(/_/g, " "),
      text: cat ? catalogText(cat) : libraryText(lc),
      source: "library-case",
      plan: { ...v.plan, caseId: id, title: cat?.title ?? v.plan.title },
      shape: shapeOf(v.plan, lib),
      libraryId: lc.id,
    });
    if (++n % 200 === 0) log(`  … ${n} library cases turned into plans`);
  }

  // (3) deep-dig twins (validated by their own runner)
  if (existsSync(DEEP2_PLANS)) {
    const twins = new Map<string, any>();
    if (existsSync(DEEP2_CASES))
      for (const f of readdirSync(DEEP2_CASES).filter((x) => x.endsWith(".json"))) {
        try {
          for (const t of JSON.parse(readFileSync(join(DEEP2_CASES, f), "utf8"))) twins.set(t.id, t);
        } catch {
          /* a damaged file is skipped */
        }
      }
    for (const f of readdirSync(DEEP2_PLANS).filter((x) => /^EVD2-.*\.json$/.test(x))) {
      let d: any;
      try {
        d = JSON.parse(readFileSync(join(DEEP2_PLANS, f), "utf8"));
      } catch {
        continue;
      }
      if (!d?.plan || !d.meta?.validated || (d.meta.gaps ?? []).length) {
        skip("deep2 twin without a validated full plan");
        continue;
      }
      const cat = caseById(d.meta.caseId);
      if (!cat) {
        skip("deep2 twin whose catalog case is not imported");
        continue;
      }
      const usesTwin = (d.plan.act ?? []).some((a: any) => a.op === "library" && !lib.has(a.caseId));
      const twin = twins.get(d.meta.twinId);
      let plan: ApiPlan | null = null;
      if (!usesTwin) {
        const v = await validatePlan(d.plan);
        if (!v.ok) {
          skip("deep2 native plan does not validate here");
          continue;
        }
        plan = v.plan;
      }
      const shape = shapeOf(d.plan, lib);
      if (usesTwin && twin) {
        shape.endpoint = `${String(twin.method).toUpperCase()} ${String(twin.path).split("?")[0].replace(/\{\{\w+\}\}/g, ":id")}`;
        shape.actor = twin.plan?.actor ?? shape.actor;
      }
      add({
        id: cat.id,
        caseIds: [cat.id, d.meta.twinId],
        title: cat.title,
        text: catalogText(cat),
        source: "deep2-twin",
        plan,
        shape,
        ...(usesTwin && twin ? { request: `${shape.endpoint} with ${JSON.stringify(twin.body ?? null).slice(0, 240)}` } : {}),
      });
    }
  }
  return { exemplars: [...out.values()], counts, skipped };
}

export async function writeExemplars(list: Exemplar[]): Promise<void> {
  writeFileSync(EXEMPLARS_FILE, JSON.stringify({ builtAt: new Date().toISOString(), count: list.length, exemplars: list }, null, 0));
  cache = null;
}

let cache: { at: number; list: Exemplar[]; byId: Map<string, Exemplar> } | null = null;

/** The exemplar set: data/exemplars.json plus any stored full plan filed since it was built. */
export function loadExemplars(): Exemplar[] {
  if (cache && Date.now() - cache.at < 60_000) return cache.list;
  let list: Exemplar[] = [];
  try {
    if (existsSync(EXEMPLARS_FILE)) list = JSON.parse(readFileSync(EXEMPLARS_FILE, "utf8")).exemplars ?? [];
  } catch {
    list = [];
  }
  const byId = new Map(list.map((e) => [e.id, e]));
  // Full plans stored after the file was built count at once (by words until
  // the next memory build embeds them). Validated when they were stored.
  for (const sp of allStoredApiPlans()) {
    if (byId.has(sp.meta.caseId) || !sp.meta.validated || sp.meta.coverage !== "full") continue;
    const cat = caseById(sp.meta.caseId);
    const e: Exemplar = {
      id: sp.meta.caseId,
      caseIds: [sp.meta.caseId],
      title: cat?.title ?? sp.meta.title,
      text: cat ? catalogText(cat) : oneLine(sp.meta.title),
      source: sp.meta.source === "assistant-reviewed" ? "approved-draft" : "stored-plan",
      plan: sp.plan,
      shape: shapeOf(sp.plan, new Map(loadCases().map((c) => [c.id, c]))),
    };
    list.push(e);
    byId.set(e.id, e);
  }
  cache = { at: Date.now(), list, byId };
  return list;
}

export function exemplarById(id: string): Exemplar | undefined {
  loadExemplars();
  return cache?.byId.get(id);
}

/** Memory chunks (kind automation-exemplar) — read by src/rag/sources.ts. */
export function exemplarChunks(): Array<{ id: string; source: string; kind: string; module: string; labels: string[]; text: string }> {
  return loadExemplars().map((e) => ({
    id: `exemplar:${e.id}`,
    source: `automation exemplar (${e.source})`,
    kind: "automation-exemplar",
    module: "events",
    labels: [e.id, ...e.caseIds.filter((x) => x !== e.id), `recipe:${e.shape.recipe}`, `op:${e.shape.op}`, `actor:${e.shape.actor}`, `outcome:${e.shape.outcome}`, ...(e.shape.code ? [`code:${e.shape.code}`] : []), ...(e.plan ? ["plan"] : ["shape-only"])],
    // What is embedded is the case's words: an exemplar is found by what its case means.
    text: `${e.title}. ${e.text}`.slice(0, 1200),
  }));
}

// ── finding the closest ones ────────────────────────────────────────────────

const STOP = new Set("a an the and or of to in on for with is are was were be been it its this that at by from as if then than so should must will can could may do does did has have had when which who what there their they them test case verify check ensure able after before not no".split(" "));
const toks = (s: string) => [...new Set(s.toLowerCase().replace(/\{\{\w+\}\}/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(?:ing|ed|es|s)$/, "")))];

let idf: Map<string, number> | null = null;
function idfOf(list: Exemplar[]): Map<string, number> {
  if (idf) return idf;
  const df = new Map<string, number>();
  for (const e of list) for (const t of toks(`${e.title} ${e.text}`)) df.set(t, (df.get(t) ?? 0) + 1);
  idf = new Map([...df].map(([t, n]) => [t, Math.log(1 + list.length / (1 + n))]));
  return idf;
}
/** IDF-weighted share of the query's words that the exemplar's words contain. */
function wordShare(query: string, e: Exemplar, list: Exemplar[]): number {
  const w = idfOf(list);
  const q = toks(query);
  if (!q.length) return 0;
  const have = new Set(toks(`${e.title} ${e.text}`));
  let got = 0;
  let total = 0;
  for (const t of q) {
    const x = w.get(t) ?? Math.log(1 + list.length);
    total += x;
    if (have.has(t)) got += x;
  }
  return total ? got / total : 0;
}

const RECIPE_STATE: Record<string, string> = {
  none: "none", draft_event: "draft", draft_rfq: "draft", draft_rfp_rfq: "draft", published_rfq: "open", published_rfq_short: "open",
  published_rfp_rfq: "open", rfq_with_bid: "with-bid", rfq_with_2_bids: "with-bid", rfp_rfq_with_tech_response: "with-bid",
  closed_rfq: "closed", closed_rfq_with_bid: "closed", closed_rfq_with_2_bids: "closed", closed_rfp_rfq_with_tech_response: "closed", awarded_rfq: "awarded",
};
const OP_VERB: Record<string, string> = {
  open_bid: "bid", price_bid: "bid", submit_bid: "bid", place_bid: "bid", surrogate_bid: "surrogate", publish_event: "publish", update_event: "edit",
  withdraw_event: "withdraw", extend_round: "extend", add_vendor: "invite", remove_vendor: "invite", open_proposal: "award", award_vendor: "award",
  new_version: "version", clone_event: "clone", create_draft: "create", add_rfq_round: "create", add_rfp_round: "create", start_tech_response: "bid",
  read_event: "view", read_round: "view", read_rfp_round: "view", read_audience: "view", read_line_items: "view", read_indicators: "view", list_events: "view",
};
const ACTOR_OF: Record<string, string> = { vendor: "vendor", vendor2: "uninvited-vendor", buyer: "buyer" };
const POL_OUTCOME: Record<string, string> = { refuse: "reject", success: "accept", crash: "no-5xx" };

/** What a library request does, from its endpoint (the plan says what was really automated). */
const ENDPOINT_VERB: Array<[RegExp, string]> = [
  [/^GET /, "view"],
  [/\/bids\/template_input|surrogate/, "surrogate"],
  [/\/reject\b|update_bid_status|\/bids\/:id\/(?:accept|select)/, "decide"],
  [/^(?:POST|PATCH) \/v1\/bids(?:$|\/:id$|\/:id\/create_bid_products)|\/template_responses/, "bid"],
  [/counter_offer|negotiat/, "counter"],
  [/\/proposal|award/, "award"],
  [/\/evaluations|score/, "evaluate"],
  [/move_to_auction|convert/, "convert"],
  [/add_audience|remove_audience|participant|invite/, "invite"],
  [/create_clone|clone/, "clone"],
  [/item_versions|version/, "version"],
  [/attachments|upload/, "upload"],
  [/^PATCH \/trade\/:id$/, "edit"],
  [/^POST \/trade\/template_input|^POST \/event_groups$/, "create"],
];
function planVerb(e: Exemplar): string | undefined {
  if (e.shape.op !== "library") return OP_VERB[e.shape.op];
  const ep = e.shape.endpoint ?? "";
  return ENDPOINT_VERB.find(([re]) => re.test(ep))?.[1];
}

/** The frame of an exemplar's CASE words (cached per exemplar). */
const frameCache = new Map<string, Frame>();
function exFrame(e: Exemplar): Frame {
  let f = frameCache.get(e.id);
  if (!f) {
    f = frameOf(normalizeText(`${e.title}. ${e.text.slice(0, 400)}`).text);
    frameCache.set(e.id, f);
  }
  return f;
}

/**
 * Structure agreement between a new case and an exemplar, 0..1, with the
 * reasons in words. Compares the new case's frame with BOTH the exemplar's case
 * frame and its plan's shape (the plan says what was really automated).
 */
export function structureAgreement(f: Frame, e: Exemplar): { score: number; agrees: string[]; differs: string[] } {
  const agrees: string[] = [];
  const differs: string[] = [];
  let s = 0;
  let w = 0;
  const ef = exFrame(e);
  // actor: who sends the decisive request in the PLAN (what was really automated)
  const pv = planVerb(e);
  const planActor = ACTOR_OF[String(e.shape.actor)] ?? "buyer";
  const exActor = pv === "surrogate" || e.shape.op === "surrogate_bid" ? "buyer-for-vendor" : ef.actor === "evaluator" || ef.actor === "other-company" ? ef.actor : planActor;
  if (f.actor !== "unknown") {
    w += 0.3;
    if (f.actor === exActor) {
      s += 0.3;
      agrees.push(`same actor (${f.actor.replace(/-/g, " ")})`);
    } else differs.push(`it acts as ${exActor.replace(/-/g, " ")}, not ${f.actor.replace(/-/g, " ")}`);
  }
  // action
  const exVerbs = new Set([pv ?? ef.verb].filter(Boolean) as string[]);
  if (f.verb) {
    w += 0.3;
    if (exVerbs.has(f.verb) || (f.verb === "submit" && exVerbs.has("bid"))) {
      s += 0.3;
      agrees.push(`same action (${f.verb})`);
    } else differs.push(`its decisive step is ${[...exVerbs][0] ?? e.shape.op}, not ${f.verb}`);
  }
  // starting state
  const exState = RECIPE_STATE[String(e.shape.recipe)] ?? null;
  if (f.state) {
    w += 0.2;
    if (f.state === exState || (f.state === "open" && exState === "with-bid")) {
      s += 0.2;
      agrees.push(`same starting state (${f.state})`);
    } else if (exState) differs.push(`it starts from a ${exState} event, not ${f.state}`);
  }
  // outcome
  const want = POL_OUTCOME[f.polarity];
  if (want) {
    w += 0.2;
    if (want === e.shape.outcome) {
      s += 0.2;
      agrees.push(`same expected outcome (${want})`);
    } else differs.push(`it expects ${e.shape.outcome}, not ${want}`);
  }
  return { score: w ? s / w : 0.5, agrees, differs };
}

/** Last real verdict per exemplar, from the run store (best effort). */
async function verdicts(list: Exemplar[]): Promise<Map<string, ExemplarVerdict>> {
  const out = new Map<string, ExemplarVerdict>();
  const db = await spineDb();
  if (!db || !list.length) return out;
  const ids = [...new Set(list.flatMap((e) => e.caseIds))];
  const r = await db
    .query(
      `SELECT case_id, count(*)::int AS runs,
              (array_agg(verdict ORDER BY created_at DESC))[1] AS last,
              (array_agg(verdict ORDER BY created_at DESC) FILTER (WHERE verdict IN ('pass','fail')))[1] AS last_decisive,
              max(created_at) AS at,
              (array_agg(reason ORDER BY created_at DESC))[1] AS reason
         FROM results WHERE kind = 'case' AND case_id = ANY($1::text[]) GROUP BY case_id`,
      [ids],
    )
    .catch(() => null);
  const byCase = new Map((r?.rows ?? []).map((x: any) => [x.case_id, x]));
  for (const e of list) {
    const rows = e.caseIds.map((id) => byCase.get(id)).filter(Boolean) as any[];
    if (!rows.length) {
      out.set(e.id, { verdict: "never-run", runs: 0 });
      continue;
    }
    rows.sort((a, b) => +new Date(b.at) - +new Date(a.at));
    const dec = rows.find((x) => x.last_decisive);
    out.set(e.id, {
      verdict: (dec?.last_decisive ?? rows[0].last) as ExemplarVerdict["verdict"],
      at: new Date(rows[0].at).toISOString(),
      runs: rows.reduce((n, x) => n + x.runs, 0),
      reason: oneLine(rows[0].reason).slice(0, 200),
    });
  }
  return out;
}

const TRUST: Record<ExemplarVerdict["verdict"], number> = { pass: 1, fail: 0.97, "never-run": 0.9, inconclusive: 0.8 };

export interface FindOptions {
  k?: number;
  /** case ids never returned (the case being compiled) */
  exclude?: string[];
  /** only exemplars whose plan can be copied */
  usableOnly?: boolean;
}

/** The k closest exemplars to a case's words: meaning + words + structure, weighted by trust. */
export async function findExemplars(text: string, opts: FindOptions = {}): Promise<ExemplarHit[]> {
  const k = opts.k ?? 5;
  const list = loadExemplars();
  if (!list.length) return [];
  const exclude = new Set(opts.exclude ?? []);
  const byId = new Map(list.map((e) => [e.id, e]));
  const norm = normalizeText(text).text;
  const f = frameOf(norm);
  const dense = new Map<string, number>();
  const db = await spineDb();
  if (db) {
    try {
      const built = (await db.query(`SELECT embedder FROM memory_builds ORDER BY id DESC LIMIT 1`)).rows[0]?.embedder as string | undefined;
      if (built) {
        await ensureEmbedderReady();
        const vec = built === embedderId() ? await embedOne(text.slice(0, 2000)) : null;
        if (vec) {
          const rows = await pgCandidates(db, built, vec, [], { kinds: ["automation-exemplar" as never] }, 60);
          for (const r of rows) {
            const id = String(r.labels?.[0] ?? "");
            if (byId.has(id)) dense.set(id, Math.max(dense.get(id) ?? 0, r.dense));
          }
        }
      }
    } catch (e) {
      console.warn(`[exemplars] meaning search failed, using words only: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  const useDense = dense.size > 0;
  const scored = list
    .filter((e) => !exclude.has(e.id) && !e.caseIds.some((id) => exclude.has(id)) && (!opts.usableOnly || e.plan))
    .map((e) => {
      const words = wordShare(norm, e, list);
      const st = structureAgreement(f, e);
      const d = dense.get(e.id) ?? 0;
      // Words-only candidates that the meaning search did not return get no dense credit.
      const score = useDense ? 0.5 * d + 0.2 * words + 0.3 * st.score : 0.6 * words + 0.4 * st.score;
      return { e, words, st, d, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(k * 3, 15));
  const vs = await verdicts(scored.map((x) => x.e));
  return scored
    .map((x) => {
      const verdict = vs.get(x.e.id) ?? { verdict: "never-run" as const, runs: 0 };
      return { ex: x.e, score: +(x.score * TRUST[verdict.verdict]).toFixed(4), dense: +x.d.toFixed(4), words: +x.words.toFixed(3), structure: +x.st.score.toFixed(3), agrees: x.st.agrees, differs: x.st.differs, verdict };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ── reuse without a model ───────────────────────────────────────────────────

/** Thresholds for "fits exactly" — tuned conservatively (a wrong reuse is a false plan). */
export const REUSE = { dense: 0.86, words: 0.8, structure: 1 };

/**
 * When the best exemplar fits the new case exactly, its plan IS the new case's
 * plan (caseId and title replaced). Exactly = every concept the new case names
 * is in the exemplar's case, the frames agree on everything both state, the
 * meaning is near-identical, and the new case has no number the exemplar lacks.
 */
export function exactFit(text: string, hits: ExemplarHit[], caseId?: string, title?: string): { plan: ApiPlan; from: ExemplarHit; why: string } | null {
  const h = hits.find((x) => x.ex.plan);
  if (!h || !h.ex.plan) return null;
  if (h.verdict.verdict === "inconclusive") return null;
  if (h.structure < REUSE.structure) return null;
  if (h.dense < REUSE.dense && !(h.dense === 0 && h.words >= 0.95)) return null;
  if (h.words < REUSE.words) return null;
  const norm = normalizeText(text).text;
  const exNorm = normalizeText(`${h.ex.title}. ${h.ex.text}`).text;
  const mine = conceptsIn(norm).filter((c) => c.kind !== "thing" || !["vendor", "rfq", "price"].includes(c.id));
  const theirs = new Set(conceptsIn(exNorm).map((c) => c.id));
  const extra = mine.filter((c) => !theirs.has(c.id));
  if (extra.length) return null;
  const nums = (s: string) => new Set((s.match(/(?<![\w{])-?\d+(?:\.\d+)?(?![\w}])/g) ?? []).filter((n) => !/^(?:0|1|2)$/.test(n)));
  const theirNums = nums(exNorm);
  if ([...nums(norm)].some((n) => !theirNums.has(n))) return null;
  const plan: ApiPlan = JSON.parse(JSON.stringify(h.ex.plan));
  if (caseId) plan.caseId = caseId;
  else delete plan.caseId;
  if (title) plan.title = title;
  return { plan, from: h, why: `reused the validated plan of ${h.ex.id} (${h.agrees.join(", ")}; meaning ${(h.dense * 100).toFixed(0)}% alike; last run ${h.verdict.verdict})` };
}

// ── worked examples for the model ───────────────────────────────────────────

/** The exemplars as a prompt block: case words → plan JSON (or the shape, for hints). */
export function workedExamples(hits: ExemplarHit[]): string {
  if (!hits.length) return "";
  const lines = hits.map((h, i) => {
    const words = `${h.ex.title}${h.ex.text && !h.ex.text.startsWith(h.ex.title) ? ` — ${h.ex.text.slice(0, 320)}` : ""}`;
    const ran = h.verdict.verdict === "never-run" ? "validated, not yet run" : `last real run: ${h.verdict.verdict}`;
    if (h.ex.plan) {
      const p = { title: h.ex.plan.title, setup: h.ex.plan.setup, act: h.ex.plan.act, verify: h.ex.plan.verify, expected: h.ex.plan.expected };
      return `${i + 1}. CASE: "${words}"\n   PLAN (${ran}): ${JSON.stringify(p).slice(0, 1400)}`;
    }
    return `${i + 1}. CASE: "${words}"\n   SHAPE ONLY (${ran}; its request is not in your vocabulary — do not copy it): setup ${h.ex.shape.recipe}, ${h.ex.shape.actor} sends ${h.ex.shape.endpoint ?? h.ex.shape.op}, expected ${h.ex.shape.outcome}${h.ex.shape.code ? ` code ${h.ex.shape.code}` : ""}`;
  });
  return `WORKED EXAMPLES — similar cases whose automation is VALIDATED and ran on the real app. Reuse their recipe, acts and expected outcome when the new case means the same thing; change only what the new case says differently:\n${lines.join("\n")}`;
}

// ── the learning loop ───────────────────────────────────────────────────────

/**
 * File one new exemplar now: into data/exemplars.json and, when the memory is
 * in Postgres, as one embedded chunk. Called when a person approves a draft
 * whose plan ran with a decisive verdict. Best effort — never throws.
 */
export async function addExemplar(e: Exemplar): Promise<{ filed: boolean; embedded: boolean; error?: string }> {
  try {
    const list = loadExemplars().filter((x) => x.id !== e.id);
    list.push(e);
    await writeExemplars(list);
  } catch (err) {
    return { filed: false, embedded: false, error: (err as Error).message };
  }
  const db = await spineDb();
  if (!db) return { filed: true, embedded: false };
  try {
    const built = (await db.query(`SELECT embedder FROM memory_builds ORDER BY id DESC LIMIT 1`)).rows[0]?.embedder as string | undefined;
    await ensureEmbedderReady();
    const emb = embedderId();
    const chunk = exemplarChunks().find((c) => c.id === `exemplar:${e.id}`)!;
    const vec = built === emb ? await embedOne(chunk.text) : null;
    const col = emb.startsWith("slingring:") ? "embedding" : "embedding_small";
    const { chunkHash } = await import("../rag/pgMemory.js");
    await db.query(
      `INSERT INTO memory_chunks (id, kind, source, module, labels, text, content_hash, ${col}, embedded_with)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9)
       ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, source = EXCLUDED.source, labels = EXCLUDED.labels, text = EXCLUDED.text,
         content_hash = EXCLUDED.content_hash, ${col} = COALESCE(EXCLUDED.${col}, memory_chunks.${col}),
         embedded_with = COALESCE(EXCLUDED.embedded_with, memory_chunks.embedded_with), updated_at = now()`,
      [chunk.id, chunk.kind, chunk.source, chunk.module, chunk.labels, chunk.text, chunkHash(chunk as never), vec ? toVector(vec) : null, vec ? emb : null],
    );
    return { filed: true, embedded: !!vec };
  } catch (err) {
    return { filed: true, embedded: false, error: (err as Error).message.slice(0, 200) };
  }
}

/** An approved draft → its exemplar (null when it has no validated full plan). */
export async function exemplarFromApproved(id: string, title: string, caseText: string, plan: ApiPlan): Promise<Exemplar | null> {
  const { validatePlan } = await import("./apiPlanner.js");
  const v = await validatePlan(plan);
  if (!v.ok) return null;
  return {
    id,
    caseIds: [id],
    title,
    text: oneLine(caseText).slice(0, 900),
    source: "approved-draft",
    plan: { ...v.plan, caseId: id, title },
    shape: shapeOf(v.plan, new Map(loadCases().map((c) => [c.id, c]))),
  };
}
