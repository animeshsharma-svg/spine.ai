/**
 * TEST CASES FROM A TYPED JOURNEY — what a tester would write down before running it, what the
 * run then proved, and what the run found on the way.
 *
 * A sentence typed into Run tests ("create an RFQ with 3 items, bid for 1 vendor and award it")
 * compiles to a plan. That plan is read back as TEST CASES, one per assertion it carries
 * (the acts before an assertion are its steps; the assertion is its expected result), plus the
 * journey itself as a case. A model then drafts the cases a senior tester would add for that
 * flow — grounded in the rules Procol's code enforces — and each draft is matched against the
 * written catalog: a case the catalog already has is shown with its id; a genuinely new one is
 * saved as a draft (GEN-JRN-…) so it joins the catalog after review.
 *
 * After the run, every case is marked from the steps that cover it: passed, failed (with the
 * app's words), not reached, or not run (no step for it yet). Screens the run passed through
 * are photographed with their controls (UI_DISCOVER=1 in the runner) and the screen-cases agent
 * writes the cases those screens deserve — "new test cases found on this run".
 *
 * Everything is kept in data/journeys/<runId>.json and exported as CSV, Markdown or Excel.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "../ai/llm.js";
import { retrieve } from "../rag/knowledgeBase.js";
import { matchTestCase } from "../checks/caseMatcher.js";
import { listDrafts, nextDraftId, saveDraft, type DraftRecord } from "./drafts.js";
import { recordScreen, getScreen, slug } from "./screenModel.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const JOURNEYS = join(ROOT, "data", "journeys");
const CATALOG = join(ROOT, "..", "procol-ui-tests", "plan-catalog.json");
const EVIDENCE = join(ROOT, "..", "procol-ui-tests", "evidence");

export interface PlanStep {
  step: string;
  args?: Record<string, unknown>;
  note?: string;
}
export interface JourneyCase {
  id: string;
  title: string;
  steps: string[];
  expected: string;
  /** journey = read off the plan · catalog = the catalog already has it · new = drafted now and saved */
  source: "journey" | "catalog" | "new";
  /** the catalog case(s) this is, when the matcher found one */
  catalogIds?: string[];
  grounded?: string;
  /** 0-based indexes of the plan steps that cover it; empty = no step for it yet */
  stepIndexes: number[];
  status?: "passed" | "failed" | "not reached" | "not run";
  detail?: string;
  /** when a screen's case: the screen it was written from */
  screen?: string;
}
export interface JourneyRecord {
  runId: string;
  text: string;
  companyId: number;
  at: string;
  plan: PlanStep[];
  cases: JourneyCase[];
  newCases: JourneyCase[];
  screens: string[];
  result?: { passed: boolean; ok: number; steps: number };
}

const ASSERT = /^(expect_|attempt$|skip$)/;
const WORDS: Record<string, string> = (() => {
  try {
    const cat = JSON.parse(readFileSync(CATALOG, "utf8")) as { steps: Array<{ name: string; purpose: string }> };
    return Object.fromEntries(cat.steps.map((s) => [s.name, s.purpose]));
  } catch {
    return {};
  }
})();
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** One plan step in a tester's words. */
export function stepWords(st: PlanStep): string {
  const a = st.args ?? {};
  const v = (k: string) => (a[k] === undefined ? "" : typeof a[k] === "object" ? JSON.stringify(a[k]) : String(a[k]));
  switch (st.step) {
    case "open_create":
      return `Open the ${v("path") === "single-stage" ? "single-stage" : v("path") === "boq" ? "BOQ" : "eRFX"} create screen.`;
    case "open_events_list":
      return "Open the events list.";
    case "open_prepared":
      return `Open the prepared event's ${v("screen").replace(/_/g, " ") || "page"}.`;
    case "set_title":
      return v("title") ? `Set the title "${v("title")}".` : "Give the event a title.";
    case "compose_stages":
      return `Set the stages to ${v("stages").replace(/[\[\]"]/g, "") || "the default"}.`;
    case "switch_stage":
      return `Switch to the ${v("stage").toUpperCase()} stage tab.`;
    case "select_template":
      return v("name") ? `Choose the template "${v("name")}".` : "Choose a template.";
    case "add_line_items":
      return `Add ${v("count") || 1} line item(s)${v("quantity") ? ` with quantity ${v("quantity")}` : ""}${v("search") ? ` searching "${v("search")}"` : ""}.`;
    case "fill_sheet":
      return "Fill the pricing sheet for every line item.";
    case "fill_questionnaires":
      return "Fill the technical questionnaire.";
    case "assign_evaluator":
      return "Assign an evaluator.";
    case "set_schedule":
      return `Save the schedule${v("minutes") ? ` (${v("minutes")} minutes)` : ""}.`;
    case "invite_vendor":
      return Array.isArray(a.vendors) && (a.vendors as unknown[]).length ? `Invite ${(a.vendors as unknown[]).map(String).join(", ")}.` : `Invite ${v("count") && Number(v("count")) > 1 ? `${v("count")} vendors` : "the vendors the product suggests"}.`;
    case "publish":
      return "Press Publish and confirm.";
    case "save_draft":
      return "Save as draft.";
    case "place_surrogate_bid":
      return `Place a surrogate bid${v("vendor") ? ` for ${v("vendor")}` : ""}${v("price") ? ` of ${v("price")}` : ""}.`;
    case "place_bid":
      return `Place a bid from the vendor portal${v("vendor") ? ` as ${v("vendor")}` : ""}.`;
    case "place_counter_offer":
      return `Send a counter offer${v("price") ? ` of ${v("price")}` : ""}${v("vendor") ? ` to ${v("vendor")}` : ""}.`;
    case "open_master_qcs":
      return "Open Master QCS.";
    case "open_participants":
      return "Open the participants list.";
    case "open_event_settings":
      return "Open the event's Settings menu.";
    case "close_event":
      return "Close the event (wait for its window to end).";
    case "award_event":
      return "Award the event: Start Awarding, allocate, create and submit the proposal.";
    case "start_awarding":
      return "Press Start Awarding.";
    case "allocate_award":
      return `Allocate the lines${v("vendor") ? ` to ${v("vendor")}` : ""}.`;
    case "convert_to_auction":
      return "Convert the RFQ to an auction from Settings.";
    case "create_new_version":
      return "Create a new version of the event.";
    case "remove_line_items":
      return `Remove ${v("count") || 1} line item(s).`;
    case "create_po":
      return "Create the purchase order.";
    case "filter_events":
      return `Switch to the ${v("tab")} tab.`;
    case "open_event":
      return v("title") ? `Open the event "${v("title")}".` : "Open the event.";
    case "go_to":
      return `Go to ${v("screen").replace(/_/g, " ")}${v("path") ? ` (${v("path")})` : ""}.`;
    case "click":
      return `Click ${v("role") ? `the ${v("role")} ` : ""}"${v("name") || v("text") || v("label")}".`;
    case "fill":
      return `Type "${v("value")}" into "${v("label") || v("name") || v("placeholder")}".`;
    case "select":
      return `Choose "${v("value") || v("option")}" in "${v("label") || v("name")}".`;
    case "press":
      return `Press ${v("key")}.`;
    case "skip":
      return `Deliberately leave out: ${v("step").replace(/_/g, " ")}${v("reason") ? ` (${v("reason")})` : ""}.`;
    default:
      return `${st.step.replace(/_/g, " ")}${Object.keys(a).length ? ` (${Object.entries(a).map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : x}`).join(", ")})` : ""}.`;
  }
}

/** An assertion step as an expected result, in a tester's words. */
export function expectedWords(st: PlanStep): string {
  const a = st.args ?? {};
  const v = (k: string) => (a[k] === undefined ? "" : typeof a[k] === "object" ? JSON.stringify(a[k]) : String(a[k]));
  switch (st.step) {
    case "expect_published":
      return "The event is published and its project page opens.";
    case "expect_publish_blocked":
      return `Publish is refused${v("contains") || v("message") ? ` with "${v("contains") || v("message")}"` : " with the app's own message"}.`;
    case "expect_line_items":
      return `The toolbar shows ${v("count")} line item(s).`;
    case "expect_stages":
      return `The stage tabs read ${v("stages").replace(/[\[\]"]/g, "")}.`;
    case "expect_template_selected":
      return `The template${v("name") ? ` "${v("name")}"` : ""} is selected.`;
    case "expect_bid_submitted":
      return "The bid is submitted and shows on the event.";
    case "expect_awarded":
      return "The award is submitted.";
    case "expect_award_counters":
      return `The awarding counters read ${[v("items") && `${v("items")} items`, v("vendors") && `${v("vendors")} vendors`].filter(Boolean).join(", ")}.`;
    case "expect_counter_offer_sent":
      return "The counter offer is sent and marked on the grid.";
    case "expect_counter_offer_accepted":
      return "The vendor's acceptance shows on the buyer's grid.";
    case "expect_event_in_list":
      return `The event${v("title") ? ` "${v("title")}"` : ""} is in the list.`;
    case "expect_event_status":
      return `The event's row shows the status "${v("status")}".`;
    case "expect_events_list":
      return "The events list renders with its Create Event control.";
    case "expect_no_error":
      return "No error is shown.";
    case "expect_error":
      return `The app shows an error${v("contains") ? ` containing "${v("contains")}"` : ""}.`;
    case "expect_text":
      return `${v("present") === "false" ? "The text is NOT on screen" : `The text "${v("text")}" is on screen`}${v("within") ? ` inside ${v("within")}` : ""}.`;
    case "expect_visible":
      return `${v("visible") === "false" ? "Not visible" : "Visible"}: ${v("role") ? `the ${v("role")} ` : ""}"${v("name") || v("text") || v("label")}".`;
    case "expect_count":
      return `${v("count") || `${v("min") ?? "…"}–${v("max") ?? "…"}`} × "${v("name") || v("text")}" on screen.`;
    case "expect_disabled":
      return `"${v("control") || v("name")}" is disabled.`;
    case "expect_enabled":
      return `"${v("control") || v("name")}" is enabled.`;
    case "expect_url_contains":
      return `The URL contains "${v("text") || v("contains")}".`;
    case "expect_po_items":
      return "The purchase order lists the awarded items.";
    case "expect_api_value":
      return `The screen shows the API's ${v("key")}.`;
    case "expect_navigated":
      return "The screen moves on as expected.";
    case "expect_toast":
      return `A toast says "${v("contains") || v("text")}".`;
    case "expect_message":
      return `The app says "${v("contains") || v("text")}".`;
    case "attempt":
      return `Trying "${v("step").replace(/_/g, " ")}" is refused by the app${v("contains") ? ` with "${v("contains")}"` : ""}.`;
    default:
      return `${st.step.replace(/^expect_/, "").replace(/_/g, " ")}${Object.keys(a).length ? ` ${JSON.stringify(a)}` : ""} holds.`;
  }
}

function parseArray(raw: string): any[] {
  const i = raw.indexOf("["), j = raw.lastIndexOf("]");
  if (i < 0 || j <= i) return [];
  try {
    const v = JSON.parse(raw.slice(i, j + 1));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * The cases a journey carries and the cases a tester would add. `draft` false skips the model.
 */
export async function casesForJourney(text: string, plan: { title?: string; steps: PlanStep[] }, opts: { companyId?: number; draft?: boolean; max?: number; onLine?: (l: string) => void; planCases?: boolean } = {}): Promise<JourneyCase[]> {
  const say = opts.onLine ?? (() => {});
  const steps = plan.steps ?? [];
  const cases: JourneyCase[] = [];
  // 1 · the journey as a whole
  cases.push({ id: "J-0", title: clean(text).slice(0, 140), steps: steps.filter((s) => !ASSERT.test(s.step)).map(stepWords), expected: steps.filter((s) => ASSERT.test(s.step)).map(expectedWords).join(" ") || "The journey completes without the app refusing a step.", source: "journey", stepIndexes: steps.map((_, i) => i) });
  // 2 · one case per assertion: the acts since the previous assertion are its steps — only when
  //     the plan IS the journey (a "closest plan" the compiler could not vouch for proves nothing)
  let from = 0;
  let k = 1;
  steps.forEach((st, i) => {
    if (opts.planCases === false) return;
    if (!ASSERT.test(st.step) || st.step === "skip") return;
    const acts = steps.slice(from, i).filter((s) => !ASSERT.test(s.step) || s.step === "skip");
    const idx = steps.map((_, j) => j).filter((j) => j <= i && j >= Math.max(0, from - 0));
    const title = expectedWords(st).replace(/\.$/, "");
    cases.push({ id: `J-${k++}`, title: title.charAt(0).toUpperCase() + title.slice(1), steps: (acts.length ? acts : steps.slice(0, i).filter((s) => !ASSERT.test(s.step))).map(stepWords), expected: expectedWords(st), source: "journey", stepIndexes: idx });
    from = i + 1;
  });

  // 3 · what a senior tester would add — drafted by the model, grounded in the rules, matched to the catalog
  if (opts.draft !== false) {
    const topic = `${text} ${steps.map((s) => s.step.replace(/_/g, " ")).join(" ")}`;
    const rules = await retrieve(topic, 14, { kinds: ["backend-code", "frontend-code", "product-fact"] as any }).catch(() => [] as Array<{ text: string; source?: string }>);
    const system = [
      "You are a senior QA engineer for Procol, a B2B sourcing platform (buyers run RFQ/RFP events and auctions; vendors bid; awards become purchase orders).",
      "A tester typed a journey and the platform will run the plan below. Write the test cases a senior tester would ADD for this journey: the refusals, the edge values, the state checks and the numbers that must be right along this flow — not restatements of the plan's own assertions.",
      "Rules: steps are short imperative sentences a person can follow on the Procol console; expected says what the screen shows, quoting the app's message when a rule gives one; ground each case in one RULE below when one applies (its number), else 'journey'; name real controls (Publish, Save as draft, Items, Participants, Master QCS, Start Awarding, Counter Offer…); never invent a vendor name.",
      `Return ONLY a JSON array of at most ${opts.max ?? 8} objects: {"title","steps":[…],"expected","grounded":"R-… or journey","kind":"positive|negative|boundary|state|calculation"}.`,
    ].join("\n");
    const user = `JOURNEY: ${text}\n\nTHE PLAN THAT WILL RUN:\n${steps.map((s, i) => `${i + 1}. ${stepWords(s)}`).join("\n")}\n\nRULES FROM PROCOL'S CODE AND PRODUCT FACTS:\n${rules.map((r, i) => `[${i + 1}] ${clean(r.text).slice(0, 240)}`).join("\n")}`;
    const raw = await chat([{ role: "system", content: system }, { role: "user", content: user }], { tier: "fast", temperature: 0.2, maxTokens: 3000 }).catch(() => "");
    const drafts = parseArray(raw);
    say(`[journey] the model drafted ${drafts.length} extra case(s) for this flow`);
    const seen = new Set(cases.map((c) => c.title.toLowerCase()));
    // The drafts earlier journeys wrote (markdown, no database needed): the same case typed
    // again is shown with the id it already has instead of being saved a second time.
    const earlier = await listDrafts(2000).catch(() => [] as Array<{ id: string; title: string }>);
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const byTitle = new Map(earlier.filter((d) => /^GEN-(JRN|SCR)-/.test(d.id)).map((d) => [norm(d.title), d.id]));
    for (const d of drafts.slice(0, opts.max ?? 8)) {
      const title = clean(d?.title);
      const stepsD = Array.isArray(d?.steps) ? d.steps.map(clean).filter(Boolean) : [];
      const expected = clean(d?.expected);
      if (!title || !stepsD.length || !expected || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      const g = String(d?.grounded ?? "journey");
      const rule = /^\[?(\d+)\]?$/.test(g) || /^R-/.test(g) ? g.replace(/[\[\]]/g, "") : "journey";
      const caseText = `${title}. ${stepsD.join(" ")} Expected: ${expected}`;
      const m = await matchTestCase(caseText, { llm: false, top: 3 }).catch(() => null);
      const same = m?.decision === "existing" ? m.same.filter((c) => c.origin === "catalog").map((c) => c.id) : [];
      // Which plan steps cover it. A refusal case ("reject…", "without…", "cannot…") can only be
      // proved by a refusal assertion (publish blocked, error, attempt…), never by the happy path
      // it sits next to — "Reject publishing without a title" was once marked passed by
      // expect_published on word overlap alone. A positive case needs three shared words.
      const negative = d?.kind === "negative" || /\b(reject|refus|without|cannot|can't|not allowed|blocked|invalid|error|disabled|prevent|forbid)/i.test(`${title} ${expected}`);
      const REFUSALS = /^(expect_publish_blocked|expect_error|expect_message|expect_toast|expect_disabled|expect_field_error|attempt)$/;
      // Words every assertion shares ("publish", "refused", "event"…) prove nothing on their own:
      // the overlap must be in the words that say WHAT is checked.
      const STOP = new Set(["publish", "publishing", "published", "refused", "refuse", "reject", "rejects", "event", "with", "message", "shows", "screen", "page", "opens", "their", "this", "that", "when", "must", "should", "project"]);
      const tokens = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w));
      const words = new Set(tokens(`${title} ${expected}`));
      const idx = steps
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => ASSERT.test(s.step) && s.step !== "skip" && (negative ? REFUSALS.test(s.step) : !REFUSALS.test(s.step)))
        .filter(({ s }) => tokens(`${expectedWords(s)} ${JSON.stringify(s.args ?? {})}`).filter((w) => words.has(w)).length >= 2)
        .map(({ i }) => i);
      if (same.length) {
        cases.push({ id: same[0], title, steps: stepsD, expected, source: "catalog", catalogIds: same, grounded: rule, stepIndexes: idx });
        continue;
      }
      const had = byTitle.get(norm(title));
      if (had) {
        cases.push({ id: had, title, steps: stepsD, expected, source: "catalog", catalogIds: [had], grounded: rule, stepIndexes: idx });
        continue;
      }
      const draft: DraftRecord = {
        id: await nextDraftId("JRN"),
        area: "JRN",
        typed: `journey: ${clean(text).slice(0, 200)}`,
        title,
        why: `A senior tester's addition to the journey "${clean(text).slice(0, 120)}"${rule !== "journey" ? `, grounded in rule ${rule}` : ""}.`,
        setup: "A buyer signed in to the client under test.",
        steps: stepsD,
        expected,
        oracle: expected,
        priority: d?.kind === "negative" || d?.kind === "calculation" ? "P1" : "P2",
        layer: "ui",
        coverage: idx.length ? "partial" : "none",
        gaps: idx.length ? [] : ["no step of this journey's plan checks it yet"],
        partialOf: [],
        companyId: opts.companyId,
      };
      const saved = await saveDraft(draft).catch(() => ({ id: draft.id }));
      cases.push({ id: saved.id, title, steps: stepsD, expected, source: "new", grounded: rule, stepIndexes: idx });
    }
  }
  return cases;
}

/** What the run proved for each case, from the steps that cover it. */
export function markTested(cases: JourneyCase[], result: { steps: Array<{ status: string; detail?: string }> } | null): JourneyCase[] {
  const st = result?.steps ?? [];
  return cases.map((c) => {
    if (!c.stepIndexes.length) return { ...c, status: "not run", detail: "no step of this run checks it" };
    const mine = c.stepIndexes.map((i) => st[i]).filter(Boolean);
    if (!mine.length) return { ...c, status: "not run" };
    const failed = mine.find((s) => s.status === "failed");
    if (failed) return { ...c, status: "failed", detail: clean(failed.detail).slice(0, 300) };
    if (mine.some((s) => s.status === "skipped")) return { ...c, status: "not reached", detail: "the run stopped before this step" };
    return { ...c, status: "passed" };
  });
}

/** New cases from the screens the run passed through (inventories written by UI_DISCOVER=1). */
export async function discoverFromRun(runId: string, plan: PlanStep[], companyId: number, onLine?: (l: string) => void): Promise<{ cases: JourneyCase[]; screens: string[] }> {
  const dir = join(EVIDENCE, runId.replace(/[^\w.-]+/g, "_"));
  if (!existsSync(dir)) return { cases: [], screens: [] };
  // at most 6 screens a run, so the wait after the run stays in minutes, not hours
  const files = readdirSync(dir).filter((f) => f.endsWith(".inventory.json")).sort().slice(0, 6);
  const cases: JourneyCase[] = [];
  const screens: string[] = [];
  const seen: Array<{ id: string; title: string }> = [];
  for (const f of files) {
    const file = join(dir, f);
    let stepNo = Number(f.split("-")[0]) || 0;
    let label = "";
    try {
      const inv = JSON.parse(readFileSync(file, "utf8"));
      label = inv.label;
      stepNo = Number(inv.stepNo) || stepNo;
    } catch {
      continue;
    }
    // A screen the library already has cases for is only re-photographed; the cases it
    // carries are shown as what the screen already has (same id, not "found now").
    const known = getScreen(slug(label));
    const write = !known || known.cases.length < 4;
    onLine?.(`${write ? "writing test cases from" : "re-reading"} the "${label}" screen the run passed through…`);
    const before = new Set((known?.cases ?? []).map((c) => c.id));
    const rec = await recordScreen(file, { companyId, reachedBy: plan.slice(0, Math.max(0, stepNo - 1)).map((s) => ({ step: s.step, args: s.args })), cases: write, effects: false, maxCases: 4, seen, onLine }).catch(() => null);
    if (!rec) continue;
    screens.push(rec.id);
    for (const c of rec.cases) {
      if (cases.some((x) => x.id === c.id)) continue;
      cases.push({ id: c.id, title: c.title, steps: c.steps, expected: c.expected, source: before.has(c.id) ? "catalog" : "new", catalogIds: before.has(c.id) ? [c.id] : undefined, grounded: c.grounded, stepIndexes: [], status: "not run", screen: rec.label });
    }
  }
  return { cases, screens };
}

export function saveJourney(r: JourneyRecord): string {
  mkdirSync(JOURNEYS, { recursive: true });
  const f = join(JOURNEYS, `${r.runId.replace(/[^\w.-]+/g, "_")}.json`);
  writeFileSync(f, JSON.stringify(r, null, 2));
  return f;
}
export function loadJourney(runId: string): JourneyRecord | null {
  const f = join(JOURNEYS, `${runId.replace(/[^\w.-]+/g, "_")}.json`);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return null;
  }
}
export function listJourneys(limit = 30): Array<Pick<JourneyRecord, "runId" | "text" | "at" | "result"> & { cases: number; newCases: number }> {
  if (!existsSync(JOURNEYS)) return [];
  return readdirSync(JOURNEYS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, t: statSync(join(JOURNEYS, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(0, limit)
    .map(({ f }) => {
      try {
        const r = JSON.parse(readFileSync(join(JOURNEYS, f), "utf8")) as JourneyRecord;
        return { runId: r.runId, text: r.text, at: r.at, result: r.result, cases: r.cases.length, newCases: r.newCases.length };
      } catch {
        return null;
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

/** The journey's cases as a file: csv, md or xlsx. */
export async function exportJourney(r: JourneyRecord, format: "csv" | "md" | "xlsx"): Promise<{ body: Buffer | string; mime: string; name: string }> {
  // The 13 columns of the team's manual test-case sheets (the PO Amendment sheet): every export,
  // for any flow, comes out in that shape so it can be pasted next to the hand-written ones.
  const refusal = /\b(refus|reject|cannot|can't|not allowed|blocked|disabled|greyed|invalid|error|not offered)/i;
  const module = `${clean(r.text).slice(0, 80)}`;
  const rows = [...r.cases, ...r.newCases].map((c) => {
    const neg = refusal.test(`${c.title} ${c.expected}`);
    const vendor = /\bvendor (portal|logs? in)|as vendor|vendor's user/i.test(c.steps.join(" "));
    return {
      "Test Case ID": c.id,
      Module: c.screen ? `${module} — ${c.screen} screen` : module,
      Scenario: c.source === "journey" ? (c.id === "J-0" ? "The journey as typed" : "Checked by the journey's plan") : c.source === "catalog" ? `Already in the catalog (${(c.catalogIds ?? [c.id]).join(", ")})` : c.screen ? `New — written from the ${c.screen} screen` : "New — a senior tester's addition",
      "Test Case Title": c.title,
      "User Role": vendor ? "Buyer, Vendor" : "Buyer",
      Portal: vendor ? "Buyer + Vendor portal" : "Buyer portal",
      "Pre-conditions": c.grounded && c.grounded !== "journey" && c.grounded !== "screen" ? `Product rule ${c.grounded}` : "-",
      "Test Data": "-",
      "Test Steps": [/^log in/i.test(c.steps[0] ?? "") ? "" : "Log in to Procol (buyer side) with the buyer user", ...c.steps].filter(Boolean).map((s, k) => `${k + 1}. ${s.replace(/\.$/, "")}`).join("\n"),
      "Expected Result": c.expected,
      Priority: c.id === "J-0" || (neg && c.source !== "catalog") ? "High" : "Medium",
      "Test Type": neg ? "Negative" : "Positive",
      Status: c.status === "passed" ? "Pass" : c.status === "failed" ? `Fail — ${c.detail ?? ""}`.trim() : c.status === "not reached" ? "Blocked" : "Not Run",
    };
  });
  const base = `test-cases-${r.runId}`;
  if (format === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions", "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status"];
    const body = [head.map(esc).join(","), ...rows.map((row) => head.map((h) => esc((row as any)[h])).join(","))].join("\n");
    return { body: "﻿" + body, mime: "text/csv; charset=utf-8", name: `${base}.csv` };
  }
  if (format === "md") {
    const body = [
      `# Test cases — ${r.text}`,
      "",
      `Run ${r.runId} · ${r.at.slice(0, 16).replace("T", " ")} · ${r.result ? `${r.result.ok}/${r.result.steps} steps passed` : "not run"} · ${r.cases.length} cases on the journey, ${r.newCases.length} found on its screens.`,
      "",
      ...[...r.cases, ...r.newCases].map((c, i) => [`## ${i + 1}. ${c.title}`, "", `**Id:** ${c.id} · **Source:** ${c.source}${c.screen ? ` (${c.screen})` : ""}${c.grounded && c.grounded !== "journey" ? ` · **Rule:** ${c.grounded}` : ""} · **Result:** ${c.status ?? "—"}${c.detail ? ` — ${c.detail}` : ""}`, "", ...c.steps.map((s, k) => `${k + 1}. ${s}`), "", `**Expected:** ${c.expected}`, ""].join("\n")),
    ].join("\n");
    return { body, mime: "text/markdown; charset=utf-8", name: `${base}.md` };
  }
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  (ws as any)["!cols"] = [14, 30, 28, 46, 18, 18, 30, 20, 80, 70, 10, 11, 14].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, "Test cases");
  const info = XLSX.utils.aoa_to_sheet([["Journey", r.text], ["Run", r.runId], ["When", r.at], ["Result", r.result ? `${r.result.ok}/${r.result.steps} steps passed` : "not run"], ["Cases on the journey", r.cases.length], ["Found on its screens", r.newCases.length], ["Screens photographed", r.screens.join(", ")]]);
  XLSX.utils.book_append_sheet(wb, info, "Run");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { body: buf, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name: `${base}.xlsx` };
}
