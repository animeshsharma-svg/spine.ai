/**
 * STEP 2 — PROVE THE HAPPY PATH BEFORE WRITING A SINGLE CASE.
 *
 * Each flow on the understanding card (one happy path per feature) becomes a temporary house-format
 * case — title, pre-conditions, steps, expected end state, the settings the PRD's rules name — and runs
 * through the sheet runner exactly as a written case would: the start state built by API, the settings
 * switched and restored, one browser, a framed screenshot per action, the fairness rules. So the sanity
 * step costs nothing new and its verdicts mean what the Test sheets page's verdicts mean.
 *
 * The verdict per flow, in the tester's words:
 *   works          every step ran and the end state held (the runner's Pass)
 *   broken         a step ran and the app did not do what the PRD says (the runner's Fail — already re-read
 *                  by the fairness rules, never a locator timeout or a guessed label)
 *   couldn't reach the automation could not do or build something (Couldn't tell / Not run / Partly
 *                  checked), with the reason and the blockers — a setting that cannot be switched, a
 *                  vendor the company lacks, a step the vocabulary does not have yet
 *
 * Cases written on a broken or unreachable flow are noise, so the session moves on to "cases" only when
 * at least one flow works; the card shows the rest so the user decides what to fix or skip.
 */
import { addSheetCases, type SheetCase } from "../checks/sheetCases.js";
import { runSheetCases, type SheetEvent, type SheetRunCase } from "../checks/sheetRunner.js";
import { advance, saveSession, type Session } from "./store.js";
import type { Flow, Rule, Understanding } from "./understanding.js";

export type FlowVerdict = "works" | "broken" | "couldn't reach";

export interface SanityFlow {
  id: string;
  name: string;
  caseId: string;
  layer: "ui" | "api";
  verdict: FlowVerdict;
  why: string;
  blockers: string[];
  shots: string[];
  steps: SheetRunCase["steps"];
  settings?: SheetRunCase["settings"];
  ms: number;
}

export interface SanityResult {
  at: string;
  runId: string;
  sheet: string;
  flows: SanityFlow[];
  tally: Record<FlowVerdict, number>;
}

export type SanityEvent =
  | { type: "line"; line: string }
  | { type: "flow-start"; id: string; name: string; index: number; total: number }
  | { type: "frame"; frame: string }
  | { type: "flow-done"; flow: SanityFlow }
  | { type: "done"; result: SanityResult }
  | { type: "error"; why: string };

const VENDOR = /\bvendor\b|\bsupplier\b/i;

/** The settings a flow needs: what the PRD's rules name (when the company does not already have it), plus the two DEMO facts every create-and-publish flow needs. */
function configsFor(flow: Flow, rules: Rule[], s: Session): string {
  const lines: string[] = [];
  const now = (s.env?.snapshot?.settings?.key ?? {}) as Record<string, unknown>;
  for (const r of rules) {
    if (!r.settingKey || (r.feature && flow.feature && r.feature !== flow.feature)) continue;
    // "when X is off the action is hidden" → the flow needs X on; only switch when the company has it off
    const wantsOn = /\b(off|disabled|not enabled)\b/i.test(r.text) && /\b(hidden|not shown|not offered|refused|cannot)\b/i.test(r.text);
    if (wantsOn && now[r.settingKey] === false) lines.push(`${r.settingKey} = On — the PRD says the feature needs it (${r.id})`);
  }
  const text = `${flow.steps.join(" ")} ${flow.preconditions.join(" ")}`.toLowerCase();
  if (/\b(create|publish)\b/.test(text) && !/\bauction\b/.test(text) && now.lock_vendors_addition_in_event_creation === true) lines.push("lock_vendors_addition_in_event_creation = Off — with it On the create screen greys out Invite Vendor and Publish");
  if (/\b(single[- ]stage|create)\b/.test(text) && /\brfq\b/.test(text) && now.default_event_type !== "rfq") lines.push("default_event_type = rfq — the create screen must open with this type selected");
  return lines.length ? lines.join("\n") : "None";
}

/** One temporary case per flow, in the house format the sheet runner reads. */
export function flowsAsCases(s: Session, card: Understanding, flowIds?: string[]): SheetCase[] {
  const sheet = `session-${s.id}`;
  const want = flowIds?.length ? new Set(flowIds) : null;
  const flows = card.flows.filter((f) => !want || want.has(f.id));
  return flows.map((f, i) => {
    const feature = card.features.find((x) => x.id === f.feature);
    const vendorSide = VENDOR.test(f.role) && !/\bbuyer\b/i.test(f.role);
    const pre = f.preconditions.length ? f.preconditions.map((p) => p.replace(/\.?$/, ".")).join(" ") : "The buyer can create events.";
    return {
      id: `SAN-${String(i + 1).padStart(3, "0")}`,
      sheet,
      module: card.module,
      scenario: feature?.name ?? f.name,
      title: f.name,
      role: f.role || (vendorSide ? "Vendor" : "Buyer"),
      portal: vendorSide ? "Supplier portal" : f.layer === "api" ? "API" : "Buyer portal",
      preconditions: pre,
      configs: configsFor(f, card.rules, s),
      testData: "-",
      steps: f.steps,
      expected: f.endState || "The flow completes as the PRD describes.",
      priority: "P1",
      testType: "Happy path",
      status: "",
      reference: `flow ${f.id} of the PRD "${card.title}"`,
      layer: f.layer === "api" ? "api" : "ui",
    };
  });
}

function blockersOf(why: string): string[] {
  const out: string[] = [];
  const m = why.match(/Blocked: it needs ([^.]+)\./i);
  if (m) out.push(`needs ${m[1].trim()} on the test company`);
  if (/no QA test vendor/i.test(why)) out.push("the company has no QA test vendor to invite");
  if (/could not be built|does not build/i.test(why)) out.push("the start state could not be built by API");
  if (/no step yet for: ([^.]+)/i.test(why)) out.push(`the automation has no step yet for: ${why.match(/no step yet for: ([^.]+)/i)![1].trim()}`);
  if (/could not do step \d+ \(([^)]+)\)/i.test(why)) out.push(`the automation could not do: ${why.match(/could not do step \d+ \(([^)]+)\)/i)![1].trim()}`);
  if (/setting could not be switched|cannot be switched/i.test(why)) out.push("a company setting could not be switched for the flow");
  return out;
}

const verdictOf = (c: SheetRunCase): FlowVerdict => (c.status === "Pass" ? "works" : c.status === "Fail" ? "broken" : "couldn't reach");

/** Run the chosen flows (all when none are named). Streams the sheet runner's events as flow events. */
export async function runSanity(s: Session, flowIds: string[] | undefined, emit: (e: SanityEvent) => void): Promise<Session> {
  const card = s.understanding as unknown as Understanding | undefined;
  if (!card?.flows?.length) { emit({ type: "error", why: "There are no flows to run: read the requirement first (the understanding card lists the happy flows)." }); return s; }
  if (!s.env) { emit({ type: "error", why: "Choose the environment first: the flows run on its company and its QA vendors." }); return s; }
  if (s.env.kind !== "uat") { emit({ type: "error", why: `The sanity run needs a company on Procol's UAT (the start states are built from its database); ${s.env.companyName ?? s.env.url} is a ${s.env.kind} account, which the runners cannot build states on yet.` }); return s; }
  const cases = flowsAsCases(s, card, flowIds);
  if (!cases.length) { emit({ type: "error", why: "None of the chosen flow ids is on the card." }); return s; }
  const byCase = new Map(cases.map((c, i) => [c.id, card.flows.filter((f) => !flowIds?.length || flowIds.includes(f.id))[i]]));
  // kept in the sheet store so the run has a report on the Test sheets page too
  addSheetCases(cases.map(({ sheet: _sheet, ...c }) => c), cases[0].sheet);
  emit({ type: "line", line: `${cases.length} happy flow(s) to prove on ${s.env.companyName ?? s.env.companyId}, one at a time, each on a fresh event built by API.` });
  const flows: SanityFlow[] = [];
  const t0 = Date.now();
  const run = await runSheetCases(cases, {
    companyId: s.env.companyId,
    sheet: cases[0].sheet,
    headed: false,
    repair: true,
    emit: (e: SheetEvent) => {
      if (e.type === "case-start") { const f = byCase.get(e.id); emit({ type: "flow-start", id: f?.id ?? e.id, name: e.title, index: e.index, total: e.total }); }
      else if (e.type === "line") emit({ type: "line", line: e.line });
      else if (e.type === "frame") emit({ type: "frame", frame: e.frame });
      else if (e.type === "case-done") {
        const r = e.result;
        const f = byCase.get(r.id);
        const flow: SanityFlow = { id: f?.id ?? r.id, name: r.title, caseId: r.id, layer: r.layer, verdict: verdictOf(r), why: r.why, blockers: blockersOf(r.why), shots: (r.shots ?? []).map((x: any) => x.file ?? String(x)), steps: r.steps, settings: r.settings, ms: r.ms };
        flows.push(flow);
        emit({ type: "flow-done", flow });
      }
    },
  });
  const tally: Record<FlowVerdict, number> = { works: 0, broken: 0, "couldn't reach": 0 };
  for (const f of flows) tally[f.verdict]++;
  const result: SanityResult = { at: new Date().toISOString(), runId: run.id, sheet: cases[0].sheet, flows, tally };
  s.sanity = result as unknown as Record<string, unknown>;
  saveSession(s);
  emit({ type: "line", line: `Sanity done in ${Math.round((Date.now() - t0) / 60_000)} min: ${tally.works} work, ${tally.broken} broken, ${tally["couldn't reach"]} could not be reached.` });
  emit({ type: "done", result });
  if (tally.works > 0) advance(s, "sanity");
  else emit({ type: "line", line: "No flow worked yet, so the session stays on this step: fix what blocked them, or go on to the cases knowing they rest on an unproven path." });
  return s;
}

/** The user chooses to write cases anyway (a broken flow is itself worth cases). */
export function acceptSanity(s: Session): Session {
  return advance(s, "sanity");
}
