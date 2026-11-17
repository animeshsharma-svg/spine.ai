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
import { advance, updateSession, type Session } from "./store.js";
import { askAndWait, askLater, onAnswer, plural } from "./questions.js";
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
export function configsFor(flow: Pick<Flow, "feature" | "steps" | "preconditions">, rules: Rule[], s: Session): string {
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
  // a feature the company has off, which the tester asked to switch on for the runs: the gate's reason names the flag
  const feat = ((s.understanding as any)?.features ?? []).find((x: any) => x.id === flow.feature);
  if (feat?.testAnyway) {
    const key = String(feat.off ?? "").match(/"([a-z][a-z0-9]*(?:_[a-z0-9]+)+)"/i)?.[1] ?? String(feat.off ?? "").match(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/i)?.[1];
    if (key && now[key] !== true) lines.push(`${key} = On — you asked to switch the feature "${feat.name}" on for the runs (it is off on this company)`);
  }
  return lines.length ? lines.join("\n") : "None";
}

/** The flows to run: the ones named, else every flow the tester has not left out. */
export function chosenFlows(card: Understanding, flowIds?: string[]): Flow[] {
  const want = flowIds?.length ? new Set(flowIds) : null;
  return card.flows.filter((f) => (want ? want.has(f.id) : !f.skip));
}

/** One temporary case per flow, in the house format the sheet runner reads. */
export function flowsAsCases(s: Session, card: Understanding, flowIds?: string[]): SheetCase[] {
  const sheet = `session-${s.id}`;
  const flows = chosenFlows(card, flowIds);
  return flows.map((f, i) => {
    const feature = card.features.find((x) => x.id === f.feature);
    const vendorSide = VENDOR.test(f.role) && !/\bbuyer\b/i.test(f.role);
    let steps = f.steps;
    let preList = f.preconditions;
    // A flow that starts from the unpublished event an earlier flow builds ("configured … not yet published")
    // cannot start from a draft the API builds: a draft's schedule and publish live on the create screen the
    // earlier flow is on. So it runs as a continuation: the earlier flow's steps first, then its own (12 Nov, FL2).
    const startsFromDraft = /\b(not (yet )?(been )?published|unpublished|configured|draft|before (it is |the )?publish)\b/i.test(preList.join(" "));
    const prevIndex = card.flows.findIndex((x) => x.id === f.id) - 1;
    const prev = prevIndex >= 0 ? card.flows[prevIndex] : undefined;
    if (startsFromDraft && prev && /\b(create|creates|new event|single-stage)\b/i.test(`${prev.name} ${prev.steps.join(" ")}`)) {
      steps = [...prev.steps, ...f.steps];
      preList = prev.preconditions;
    }
    // The feature the PRD is about goes into the pre-conditions (17 Nov): the sheet prep reads them for the start
    // state's kind and strategy — "Traffic Light Auction with Dynamic Time Extension" builds a live traffic-light
    // auction round with the extension on, not a plain RFQ (sanity FL2–FL4 ran on an RFQ and could not reach the zones)
    const about = card.title ? `This flow is part of "${card.title}". ` : "";
    const pre = about + (preList.length ? preList.map((p) => p.replace(/\.?$/, ".")).join(" ") : "The buyer can create events.");
    return {
      id: `SAN-${String(i + 1).padStart(3, "0")}`,
      sheet,
      module: card.module,
      scenario: feature?.name ?? f.name,
      title: f.name,
      role: f.role || (vendorSide ? "Vendor" : "Buyer"),
      portal: vendorSide ? "Supplier portal" : f.layer === "api" ? "API" : "Buyer portal",
      preconditions: pre,
      configs: configsFor({ ...f, steps, preconditions: preList }, card.rules, s),
      testData: "-",
      steps,
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
  if (!cases.length) { emit({ type: "error", why: flowIds?.length ? "None of the chosen flow ids is on the card." : "Every flow was left out when you answered “which flows should I test?”; reopen the requirement step to pick some." }); return s; }
  const chosen = chosenFlows(card, flowIds);
  const byCase = new Map(cases.map((c, i) => [c.id, chosen[i]]));
  const company = s.env.companyName ?? `company ${s.env.companyId}`;
  // a company with no QA test vendor cannot prove a flow that invites one: ask before holding the browser
  const inviting = chosen.filter((f) => /\b(invite|vendor|supplier)\b/i.test(`${f.steps.join(" ")} ${f.preconditions.join(" ")}`));
  if (inviting.length && (s.env.snapshot?.vendors?.count ?? 0) === 0) {
    const a = await askAndWait(s, {
      step: "sanity", source: "sanity", kind: "one",
      text: `${company} has no QA test vendor, and ${inviting.length === chosen.length ? (chosen.length === 1 ? "the flow" : "every flow") : plural(inviting.length, "flow")} invites one. What should I do?`,
      why: "Without a QA vendor the invite step cannot be done, so those flows will come back “couldn't reach”.",
      options: [
        { value: "run", label: "Run anyway", means: "The flows without an invite are proved; the others stop at the invite step." },
        { value: "stop", label: "Stop, I'll add a QA vendor first", means: "Nothing runs; come back to this step when the company has one." },
      ],
      suggested: "stop",
    }, 5 * 60_000);
    if (a.answer === null || /^stop/i.test(a.answer)) { emit({ type: "error", why: `Stopped before the run: ${company} has no QA test vendor. Add one (invite + vendor sign-up on UAT) and run the sanity step again.` }); return s; }
    emit({ type: "line", line: "Running anyway, as you chose; the invite steps will stop where the company has no vendor." });
  }
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
        askAboutVerdict(s, flow);
      }
    },
  });
  const tally: Record<FlowVerdict, number> = { works: 0, broken: 0, "couldn't reach": 0 };
  for (const f of flows) tally[f.verdict]++;
  const result: SanityResult = { at: new Date().toISOString(), runId: run.id, sheet: cases[0].sheet, flows, tally };
  updateSession(s, (f) => { f.sanity = result as unknown as Record<string, unknown>; });
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

/**
 * A flow that did not work makes the platform ask what to do with it, without holding the run:
 * a flow it could not reach (skip it, try again later, or write cases anyway) and a broken one
 * (cases are worth writing: the bug is already there; or leave it out).
 */
function askAboutVerdict(s: Session, flow: SanityFlow): void {
  if (flow.verdict === "works") return;
  const because = flow.blockers.length ? flow.blockers.join("; ") : flow.why.replace(/\s+/g, " ").slice(0, 200);
  if (flow.verdict === "couldn't reach") {
    askLater(s, {
      step: "sanity", source: "sanity", kind: "one",
      text: `I couldn't get through the flow “${flow.name}”. What should I do with it?`,
      why: `What stopped me: ${because}.`,
      options: [
        { value: "again", label: "I'll fix that, try it again", means: "The flow stays in; run the sanity step again when it is fixed." },
        { value: "cases", label: "Write cases for it anyway", means: "Its cases are written and marked as resting on a flow the run could not prove." },
        { value: "skip", label: "Leave it out", means: "No cases for this flow." },
      ],
      suggested: "again",
      ref: { flowId: flow.id },
    });
  } else {
    askLater(s, {
      step: "sanity", source: "sanity", kind: "one",
      text: `The flow “${flow.name}” is broken: the app did not do what the PRD says. Should I still write cases for it?`,
      why: `What went wrong: ${because}.`,
      options: [
        { value: "cases", label: "Yes, write them", means: "The cases will catch the same break every run until it is fixed." },
        { value: "skip", label: "Leave it out", means: "No cases for this flow." },
      ],
      suggested: "cases",
      ref: { flowId: flow.id },
    });
  }
}

onAnswer("sanity", (s, q) => {
  const id = q.ref?.flowId;
  if (!id) return;
  if (q.skipped) return "Skipped: the flow stays in, unproven.";
  const a = (q.answer ?? "").toLowerCase();
  const pick = /^(skip|leave)/.test(a) ? "skip" : /^(cases|yes|write)/.test(a) ? "cases" : /^(again|i'll fix|try)/.test(a) ? "again" : null;
  if (!pick) return `I couldn't read “${q.answer}” as one of the choices; nothing changed.`;
  let name = id;
  updateSession(s, (f) => {
    const c = f.understanding as unknown as Understanding | undefined; const fl = c?.flows.find((x) => x.id === id); if (!fl) return;
    name = fl.name;
    fl.skip = pick === "skip"; fl.unproven = pick === "cases";
  });
  return pick === "skip" ? `“${name}” is left out: no cases for it.` : pick === "cases" ? `Cases will be written for “${name}”, marked as resting on a flow the sanity run could not prove.` : `“${name}” stays in; run the sanity step again when it is fixed.`;
});
