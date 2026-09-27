import {
  JOURNEY_ORDER,
  STEP_META,
  STEP_VERDICT_LABEL,
  refineStageStep,
  stepKindForCase,
  type Actor,
  type JourneyCall,
  type JourneyRecord,
  type JourneyStepRecord,
  type StepKind,
  type StepVerdict,
  type VariationsEvent,
} from "../checks/journeyModel.js";
import { redactSecrets } from "../checks/engine.js";
import type { RunRecord } from "../runStore.js";
import { toCurl } from "./curl.js";
import { escapeHtml } from "./shared.js";
import type { CaseRow } from "./testReport.js";

/**
 * THE JOURNEY SECTION — the spine of a test report about a sourcing event.
 *
 * The report used to open with forty rows about one endpoint. Every "RFQ
 * only" case is a variation of activating the same event, so the table was
 * honest and unreadable: nothing in it said whether a buyer can run a
 * sourcing round on this build, which is the question the run exists to
 * answer. The run now walks the Postman collection first — sign in, draft,
 * rounds, publish, vendor, bid, wait, award — and this section prints that
 * walk as numbered steps in plain sentences. The library cases become the
 * variations tried at each step, folded under the step they vary, so
 * "activation with 501 vendors is refused" sits under "Publish the event"
 * instead of beside "sign in".
 *
 * This module knows how to nest cases under steps and how to draw the
 * section. It does not know how a case row is drawn — that stays in
 * `testReport.ts`, and is handed in as a function — so the two files do not
 * import each other at runtime.
 */

/** The case rows of a run, sorted into the steps they vary. */
export interface JourneyNest {
  /** cases that vary a step this journey walked, by step kind */
  byStep: Map<StepKind, CaseRow[]>;
  /** cases that vary a step this journey has no need for, by step kind */
  unwalked: Map<StepKind, CaseRow[]>;
  /** every case id that landed in either map — the module sections leave these out */
  absorbed: Set<string>;
}

export interface JourneySectionInput {
  journey: JourneyRecord;
  nest: JourneyNest;
  /** the run, for the company id behind the curls and the legacy setup steps */
  run: RunRecord | null;
  /** the icon of the module the journey belongs to, so the section matches its neighbours */
  icon: string;
  /** the module label the filter treats this section as, usually "Sourcing events (RFx)" */
  moduleLabel: string;
  /** draws one library case as a row — `renderRow` from testReport.ts */
  renderCase: (row: CaseRow) => string;
  /** what a status code means, in words — `statusInWords` from testReport.ts */
  statusInWords: (status: number | null | undefined) => string;
  /** the column headings a `.rows` table opens with, so nested tables line up with the module ones */
  rowHead: string;
}

/**
 * The journey a run saved, if it saved one.
 *
 * `RunRecord.journey` is being added by the store at the same time as this
 * renderer, so it is read structurally: a run written before the field
 * existed has none, and the report falls back to the old setup block.
 */
export function readJourney(run: RunRecord | null | undefined): JourneyRecord | undefined {
  const journey = (run as (RunRecord & { journey?: JourneyRecord }) | null | undefined)?.journey;
  return journey && Array.isArray(journey.steps) ? journey : undefined;
}

// ── nesting ────────────────────────────────────────────────────────────────

/**
 * Sort the case rows under the steps they vary.
 *
 * The join is the endpoint (`stepKindForCase`), refined for stage cases that
 * name the technical round. A case whose step the journey walked nests under
 * that step; one whose step this event type never has — a surrogate bid on
 * an event with no surrogate, an evaluation on an event with no technical
 * round — goes in the trailing "steps this journey did not walk" block, so it
 * is still read in collection order rather than as an orphan. A case that is
 * not a variation of anything the journey does (purchase requests, master
 * data) is left alone and keeps its module section.
 */
export function nestCasesUnderSteps(journey: JourneyRecord, rows: CaseRow[]): JourneyNest {
  const walked = journey.steps.map((s) => s.kind);
  const byStep = new Map<StepKind, CaseRow[]>();
  const unwalked = new Map<StepKind, CaseRow[]>();
  const absorbed = new Set<string>();

  for (const row of rows) {
    const rough = stepKindForCase(row.test.method, row.test.path);
    if (!rough) continue;
    const hay = `${row.test.title} ${JSON.stringify(row.test.body ?? "")}`;
    const kind = refineStageStep(rough, hay, walked);
    const target = walked.includes(kind) ? byStep : unwalked;
    if (!target.has(kind)) target.set(kind, []);
    target.get(kind)!.push(row);
    absorbed.add(row.test.id);
  }
  return { byStep, unwalked, absorbed };
}

// ── words and small formats ────────────────────────────────────────────────

/** The filter's three buckets. A refusal is filed with the breaks: it is what "only what broke" is for. */
export function filterVerdictOf(verdict: StepVerdict): "pass" | "fail" | "notrun" {
  if (verdict === "worked") return "pass";
  if (verdict === "not-run") return "notrun";
  return "fail";
}

/** Refused borrows the amber of "couldn't tell": a clean no is not yet a defect. */
const STEP_PILL: Record<StepVerdict, string> = {
  worked: "p-pass",
  refused: "p-incon",
  broken: "p-fail",
  "not-run": "p-notrun",
};

const ACTOR_LABEL: Record<Actor, string> = {
  buyer: "Buyer",
  vendor: "Vendor",
  evaluator: "Evaluator",
  platform: "Platform",
};

/**
 * What a produced id IS, for the chips. The runner names them for the code
 * that consumes them (`pricingTradeUuid`); a reader wants "pricing round".
 */
const PRODUCED_LABEL: Record<string, string> = {
  eventGroupUuid: "event",
  lineItemUuid: "line item",
  technicalTradeUuid: "technical round",
  pricingTradeUuid: "pricing round",
  auctionTradeUuid: "auction round",
  tradeProductUuid: "line on the round",
  templateResponseUuid: "technical response",
  bidUuid: "bid",
  evalFormUuid: "evaluation form",
  evaluationUuid: "evaluation",
  proposalUuid: "award proposal",
  approvalFlowUuid: "approval workflow",
  versionUuid: "new version",
  counterOfferUuid: "counter offer",
  vendorUuid: "vendor",
  evaluatorUuid: "evaluator",
};

function producedLabel(key: string): string {
  if (PRODUCED_LABEL[key]) return PRODUCED_LABEL[key];
  return key
    .replace(/Uuid$|Id$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

/** "834ms", "1.6s", "1m 42s" — whichever a person would say. */
function duration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms - m * 60_000) / 1000);
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** Local wall clock to the second, for "started at". */
function clock(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Text that came from the app or the runner, made safe twice: redacted, then escaped. */
const safe = (text: string | null | undefined): string => escapeHtml(redactSecrets(text ?? "") ?? "");

/** `METHOD /path` with the query dropped — the curl has the whole thing. */
function callLabel(call: JourneyCall | undefined): string {
  if (!call) return "";
  return `${call.method.toUpperCase()} ${call.path.split("?")[0]}`;
}

interface Tally {
  total: number;
  worked: number;
  broken: number;
  unclear: number;
  notrun: number;
}

function tallyCases(rows: CaseRow[]): Tally {
  const t: Tally = { total: rows.length, worked: 0, broken: 0, unclear: 0, notrun: 0 };
  for (const r of rows) {
    if (r.verdict === "pass") t.worked++;
    else if (r.verdict === "fail") t.broken++;
    else if (r.verdict === "inconclusive") t.unclear++;
    else t.notrun++;
  }
  return t;
}

/** "3 worked · 1 broken · 2 not checked" — zero counts are left out, except broken, which is the one people look for. */
function tallyWords(t: Tally, html = true): string {
  const parts: string[] = [];
  const b = (n: number, w: string, cls: string) => (html ? `<b class="${cls}">${n} ${w}</b>` : `${n} ${w}`);
  if (t.worked) parts.push(b(t.worked, "worked", "ok"));
  parts.push(b(t.broken, "broken", t.broken ? "bad" : "mute"));
  if (t.unclear) parts.push(b(t.unclear, "couldn’t tell", "warn"));
  if (t.notrun) parts.push(b(t.notrun, "not checked", "mute"));
  return parts.join(" · ");
}

// ── the short version's opening line ───────────────────────────────────────

/**
 * One sentence for the top of the report: how the journey went, and which
 * event it built. No link — the event lives in a UAT tenant the reader may
 * not have; the id is enough to find it.
 */
export function renderJourneyLede(journey: JourneyRecord): string {
  const made = journey.made ?? {};
  const eventId = made.eventGroupUuid ?? journey.steps.find((s) => s.produced?.eventGroupUuid)?.produced?.eventGroupUuid;
  const event = journey.title
    ? ` The event it built: “${safe(journey.title)}”${eventId ? ` (<code>${safe(eventId)}</code>)` : ""}.`
    : "";
  return `<p class="lede journey-lede"><strong>The ${safe(journey.label)} journey.</strong> ${safe(journey.outcome)}${event}</p>`;
}

/** The legend rows for the step verdicts, appended under the case legend when a report has a journey. */
export function renderJourneyLegend(): string {
  const rows: Array<[StepVerdict, string]> = [
    ["worked", "The app did what the step asked, and the reply had what we expected in it."],
    [
      "refused",
      "The app said no, cleanly — a 4xx with a message. The row quotes it. A refusal is only a defect if the refusal is wrong.",
    ],
    ["broken", "The server fell over (a 5xx) or never answered. Always worth raising."],
    ["not-run", "The step was never attempted. The row says why — usually a step it depended on did not work."],
  ];
  return `
    <h5 style="margin-top:14px">What the results mean for the journey’s steps</h5>
    <div class="legend">
      ${rows
        .map(
          ([v, meaning]) =>
            `<div><span class="pill ${STEP_PILL[v]}">${escapeHtml(STEP_VERDICT_LABEL[v])}</span><span>${escapeHtml(meaning)}</span></div>`,
        )
        .join("")}
    </div>`;
}

// ── one step ───────────────────────────────────────────────────────────────

function renderCurl(call: JourneyCall, id: string, companyId: number | undefined): string {
  return `<button class="copy" type="button" data-copy="${escapeHtml(id)}">Copy curl</button>
<pre id="${escapeHtml(id)}">${escapeHtml(toCurl(call, companyId))}</pre>`;
}

/**
 * The curl block for a step. Vendor and evaluator steps carry a note: the
 * token in the command is that actor's, not the buyer's the rest of the
 * report uses, because pasting a buyer token into a vendor call is the first
 * thing a reader would otherwise do.
 */
function renderStepCurls(step: JourneyStepRecord, companyId: number | undefined): string {
  if (!step.call) return "";
  const actorNote =
    step.actor === "vendor" || step.actor === "evaluator"
      ? `<p class="actor-note">$PROCOL_TOKEN here is the <b>${ACTOR_LABEL[step.actor].toLowerCase()}’s</b> token — this call was made signed in as the ${ACTOR_LABEL[step.actor].toLowerCase()}, not as the buyer.</p>`
      : "";
  const also = (step.alsoCalled ?? [])
    .map(
      (c, i) =>
        `<p class="pre also">It first called <code>${escapeHtml(callLabel(c))}</code>:</p>${renderCurl(
          c,
          `curl-step-${step.n}-also-${i + 1}`,
          companyId,
        )}`,
    )
    .join("");
  return `
<details class="curl">
  <summary>Run this exact call yourself</summary>
  <div class="curl-body">
    ${actorNote}
    ${renderCurl(step.call, `curl-step-${step.n}`, companyId)}
    ${also}
  </div>
</details>`;
}

function renderProduced(step: JourneyStepRecord): string {
  const entries = Object.entries(step.produced ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return "";
  return `
<h5>What this step produced</h5>
<div class="chips">
  ${entries
    .map(([k, v]) => `<span class="chip"><b>${escapeHtml(producedLabel(k))}</b><code>${safe(String(v))}</code></span>`)
    .join("")}
</div>`;
}

/**
 * The nested table of library cases that vary this step, closed by default.
 * The summary line carries the tally, so a reader scanning closed rows still
 * sees "1 broken" without opening anything.
 */
function renderVariations(rows: CaseRow[], input: JourneySectionInput, heading: string): string {
  if (!rows.length) return "";
  const t = tallyCases(rows);
  return `
<details class="variations">
  <summary>${escapeHtml(heading)} (${t.total}) — ${tallyWords(t)}</summary>
  <div class="rows">
    ${input.rowHead}
    ${rows.map((row) => input.renderCase(row)).join("")}
  </div>
</details>`;
}

function renderStep(step: JourneyStepRecord, rows: CaseRow[], input: JourneySectionInput): string {
  const companyId = input.run?.companyId;
  const call = callLabel(step.call);
  const status =
    step.verdict === "not-run" || !step.call
      ? "—"
      : !step.status
        ? "no reply"
        : `${step.status} · ${input.statusInWords(step.status)}`;
  const actual = step.verdict === "not-run" ? step.actual || step.reason || "Did not run." : step.actual;
  const tally = rows.length ? tallyCases(rows) : undefined;
  const search = [
    String(step.n),
    step.title,
    step.kind,
    step.actor,
    call,
    step.actual,
    step.reason ?? "",
    step.message ?? "",
    ...Object.values(step.produced ?? {}),
  ]
    .join(" ")
    .toLowerCase();

  return `
<details class="jstep v-${step.verdict}" data-verdict="${filterVerdictOf(step.verdict)}"
         data-search="${safe(search)}">
  <summary>
    <span class="col-verdict"><span class="pill ${STEP_PILL[step.verdict]}">${escapeHtml(
      STEP_VERDICT_LABEL[step.verdict],
    )}</span></span>
    <span class="js-n">${step.n}</span>
    <span class="js-title">${safe(step.title)}
      <span class="js-meta"><span class="actor a-${step.actor}">${ACTOR_LABEL[step.actor]}</span>${
        tally
          ? ` <span class="js-var">${tally.total} variation${tally.total === 1 ? "" : "s"} tried here · ${tallyWords(tally)}</span>`
          : ""
      }</span>
    </span>
    <span class="col-call js-call">${call ? `<code>${escapeHtml(call)}</code>` : `<span class="mute">—</span>`}</span>
    <span class="col-status js-status">${escapeHtml(status)}${step.ms ? `<span class="js-ms">${escapeHtml(duration(step.ms))}</span>` : ""}</span>
    <span class="js-actual">${safe(actual)}</span>
  </summary>
  <div class="jstep-body">
    <div class="panes">
      <div>
        <h5>What should happen</h5>
        <p class="expect">${safe(step.expected)}</p>
        <h5>What actually happened</h5>
        <p class="${step.verdict === "broken" || step.verdict === "refused" ? "said-bad" : "said"}">${safe(actual)}</p>
        ${
          step.verdict === "not-run" && step.reason && step.reason !== actual
            ? `<p class="pre">Why it did not run: ${safe(step.reason)}</p>`
            : ""
        }
        ${
          step.message
            ? `<p class="apisaid"><span>The app said:</span> ${safe(step.message)}${
                step.errorCode ? ` <span class="mute">(code ${safe(step.errorCode)})</span>` : ""
              }</p>`
            : ""
        }
        ${renderProduced(step)}
      </div>
      <div>
        ${step.postman ? `<h5>The Postman request it mirrors</h5><p class="pre">${safe(step.postman)}</p>` : ""}
        ${
          step.verdict !== "not-run"
            ? `<p class="took">${[
                step.ms ? `took ${duration(step.ms)}` : "",
                clock(step.startedAt) ? `started at ${clock(step.startedAt)}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}</p>`
            : ""
        }
        ${renderStepCurls(step, companyId)}
      </div>
    </div>
    ${renderVariations(rows, input, "Variations tried at this step")}
  </div>
</details>`;
}

/**
 * The line under the step where the journey stopped. Mirrors the sibling
 * framework's report: whatever depended on this step never ran, so the rows
 * below are neither worked nor broken — they are untested in this run.
 */
function renderStopped(step: JourneyStepRecord, journey: JourneyRecord): string {
  const later = journey.steps.filter((s) => s.n > step.n);
  const notRun = later.filter((s) => s.verdict === "not-run").length;
  const still = later.length - notRun;
  const verb = step.verdict === "broken" ? "broke" : "was refused";
  return `<p class="step-stopped"><b>The journey stopped here.</b> Step ${step.n} ${verb}${
    notRun
      ? `, so the ${notRun === 1 ? "step" : `${notRun} steps`} below that depended on it never ran — ${
          notRun === 1 ? "it is" : "they are"
        } neither worked nor broken, just untested in this run`
      : ""
  }${still && notRun ? `; ${still === 1 ? "one step" : `${still} steps`} that could run on ${still === 1 ? "its" : "their"} own still did` : ""}.</p>`;
}

// ── the second copy of the event ───────────────────────────────────────────

/**
 * Where the variations ran. The journey's own event has to reach the close of
 * its bidding window undisturbed, so the library cases act on a second copy,
 * built the same way. Its four build calls are listed so "the event" in the
 * variation rows is a specific thing, not a phrase.
 */
function renderVariationsEvent(journey: JourneyRecord, run: RunRecord | null, input: JourneySectionInput): string {
  const ve = journey.variationsEvent;
  const veSteps = (ve as (VariationsEvent & { steps?: JourneyStepRecord[] }) | undefined)?.steps;
  type Line = { did: string; call: string; status: number | undefined; ms: number | undefined; ok: boolean };
  let lines: Line[] = [];
  if (veSteps?.length) {
    lines = veSteps.map((s) => ({
      did: s.actual || s.title,
      call: callLabel(s.call),
      status: s.status,
      ms: s.ms,
      ok: s.verdict === "worked",
    }));
  }
  // No second copy means the cases (if any) acted on the journey's own event,
  // which the steps above already describe. The legacy `setupSteps` on a
  // journey run are those same steps and must not be re-listed as a "copy".
  if (!ve) return "";
  if (!lines.length) return "";

  const made = ve
    ? `“${safe(ve.title)}” — <b>${safe(ve.status)}</b>, ${ve.stageCount} round${ve.stageCount === 1 ? "" : "s"}${
        ve.eventGroupUuid ? ` (<code>${safe(ve.eventGroupUuid)}</code>)` : ""
      }`
    : run?.setupSummary
      ? `“${safe(run.setupSummary.title)}” — <b>${safe(run.setupSummary.status)}</b>, ${run.setupSummary.stageCount} round${
          run.setupSummary.stageCount === 1 ? "" : "s"
        }`
      : "";
  const note =
    ve?.note ??
    "The variations below were tried on a second copy of the event so the journey's own event could run to its close undisturbed.";

  return `
<details class="setup jvar">
  <summary>
    <span class="setup-kicker">Where the variations ran</span>
    <span class="setup-made">${safe(note)} ${made}${lines.length ? ` — built the same way. <span class="chev">Show the ${lines.length} calls ▸</span>` : ""}</span>
  </summary>
  ${
    lines.length
      ? `<ol class="setup-steps">
    ${lines
      .map(
        (l) => `<li class="${l.ok ? "ok" : "bad"}">
          <span class="setup-did">${safe(l.did)}</span>
          ${l.call ? `<code class="setup-call">${escapeHtml(l.call)}</code>` : ""}
          ${l.status !== undefined ? `<span class="setup-status ${l.ok ? "ok" : "bad"}">${l.status} · ${escapeHtml(input.statusInWords(l.status))}</span>` : ""}
          ${l.ms !== undefined ? `<span class="setup-ms">${escapeHtml(duration(l.ms))}</span>` : ""}
        </li>`,
      )
      .join("")}
  </ol>`
      : ""
  }
</details>`;
}

// ── steps this journey did not walk ────────────────────────────────────────

function renderUnwalked(journey: JourneyRecord, input: JourneySectionInput): string {
  const kinds = JOURNEY_ORDER.filter((k) => input.nest.unwalked.has(k));
  if (!kinds.length) return "";
  const total = kinds.reduce((n, k) => n + input.nest.unwalked.get(k)!.length, 0);
  return `
<div class="unwalked">
  <h4>Variations of steps this journey did not walk <span class="count">${total} case${total === 1 ? "" : "s"}</span></h4>
  <p class="mwhat">A ${safe(journey.label)} event has no such steps — a technical round to evaluate, a surrogate bid, an
  auction to convert — so the journey never made them. The cases that vary them still ran, as written, against the second
  copy of the event; they are listed here in collection order rather than beside a step that never happened.</p>
  <ol class="jsteps">
    ${kinds
      .map((kind) => {
        const rows = input.nest.unwalked.get(kind)!;
        const meta = STEP_META[kind];
        const t = tallyCases(rows);
        const search = [meta.title, kind, meta.actor, ...rows.map((r) => r.test.id)].join(" ").toLowerCase();
        return `<li>
<details class="jstep v-unwalked" data-verdict="" data-search="${escapeHtml(search)}">
  <summary>
    <span class="col-verdict"><span class="pill p-notrun">Not walked</span></span>
    <span class="js-n">—</span>
    <span class="js-title">${escapeHtml(meta.title)}
      <span class="js-meta"><span class="actor a-${meta.actor}">${ACTOR_LABEL[meta.actor]}</span> <span class="js-var">${t.total} variation${
        t.total === 1 ? "" : "s"
      } · ${tallyWords(t)}</span></span>
    </span>
    <span class="col-call js-call"><span class="mute">—</span></span>
    <span class="col-status js-status">—</span>
    <span class="js-actual">This journey had no such step${
      meta.postman ? `; in the collection it is “${escapeHtml(meta.postman)}”` : ""
    }.</span>
  </summary>
  <div class="jstep-body">
    ${renderVariations(rows, input, "Variations of this step")}
  </div>
</details>
</li>`;
      })
      .join("")}
  </ol>
</div>`;
}

// ── the section ────────────────────────────────────────────────────────────

/**
 * How the journey went, as a sentence with its numbers: outcome, how long,
 * how much of that was waiting for the bidding window.
 */
function describeJourney(journey: JourneyRecord): string {
  const parts: string[] = [];
  if (journey.stageSeconds) {
    parts.push(`Each round was open for ${duration(journey.stageSeconds * 1000)} so the run could wait it out`);
  }
  if (journey.waitedMs) parts.push(`the run spent ${duration(journey.waitedMs)} waiting for the window to close`);
  if (journey.durationMs) parts.push(`the whole journey took ${duration(journey.durationMs)}`);
  if (!parts.length) return "";
  const sentence = parts.join("; ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

export function renderJourneySection(input: JourneySectionInput): string {
  const { journey, nest } = input;
  const steps = journey.steps;
  const counts = {
    worked: steps.filter((s) => s.verdict === "worked").length,
    refused: steps.filter((s) => s.verdict === "refused").length,
    broken: steps.filter((s) => s.verdict === "broken").length,
    notrun: steps.filter((s) => s.verdict === "not-run").length,
  };
  const total = steps.length || 1;
  const bar = (n: number, cls: string) =>
    n ? `<span class="seg ${cls}" style="width:${((n / total) * 100).toFixed(1)}%"></span>` : "";
  const stoppedAt = journey.stoppedAt ?? steps.find((s) => s.verdict === "refused" || s.verdict === "broken")?.n;
  const nestedTotal = [...nest.byStep.values()].reduce((n, rows) => n + rows.length, 0);

  return `
<section class="module journey" id="journey" data-module="${escapeHtml(input.moduleLabel)}">
  <header class="module-head">
    <span class="mico">${escapeHtml(input.icon)}</span>
    <h3>The journey this run walked — ${safe(journey.label)}</h3>
    <span class="grow"></span>
    <span class="tally">
      ${counts.worked ? `<b class="ok">${counts.worked} worked</b>` : ""}
      ${counts.refused ? `<b class="warn">${counts.refused} refused</b>` : ""}
      ${counts.broken ? `<b class="bad">${counts.broken} broken</b>` : ""}
      ${counts.notrun ? `<b class="mute">${counts.notrun} not run</b>` : ""}
    </span>
  </header>
  <div class="bar" role="img" aria-label="${counts.worked} of ${steps.length} steps worked">
    ${bar(counts.worked, "s-pass")}${bar(counts.refused, "s-incon")}${bar(counts.broken, "s-fail")}${bar(counts.notrun, "s-notrun")}
  </div>
  <p class="mwhat"><strong>${safe(journey.outcome)}</strong> ${describeJourney(journey)}</p>
  <p class="mwhat">The steps are numbered in the order the Postman collection runs them: the buyer builds the event, the
  vendor answers it, the window closes, the award is made. Open a step for what we expected, what came back, the ids it
  produced and the exact call to repeat it.${
    nestedTotal
      ? ` The ${nestedTotal} library case${nestedTotal === 1 ? "" : "s"} that vary these steps are folded under the step they vary.`
      : ""
  }</p>
  ${renderVariationsEvent(journey, input.run, input)}
  <ol class="jsteps">
    ${steps
      .map(
        (step) =>
          `<li>${renderStep(step, nest.byStep.get(step.kind) ?? [], input)}${
            stoppedAt === step.n ? renderStopped(step, journey) : ""
          }</li>`,
      )
      .join("")}
  </ol>
  ${renderUnwalked(journey, input)}
</section>`;
}

// ── styles ─────────────────────────────────────────────────────────────────

/**
 * The journey's own rules, spliced into the report's stylesheet. They follow
 * the module tables — the same grid, pills and tags — so a step row and a
 * case row read as two levels of one document, not two designs.
 */
export const JOURNEY_CSS = `
/* ── the journey: one row per step, in collection order ─────────────── */
.journey-lede { font-size: 13.5px; color: var(--ink); margin: 0 0 14px; line-height: 1.6; }
.journey-lede strong { color: var(--ink); }
.journey .jsteps { list-style: none; margin: 12px 0 0; padding: 0; border: 1px solid var(--line); border-radius: 9px;
  overflow: hidden; background: var(--card); }
.journey .jsteps > li { border-top: 1px solid var(--grid); }
.journey .jsteps > li:first-child { border-top: 0; }
details.jstep > summary {
  display: grid;
  grid-template-columns: 104px 26px minmax(230px, 1.6fr) minmax(170px, 1fr) 116px minmax(220px, 1.5fr);
  gap: 12px; align-items: baseline; padding: 10px 14px; cursor: pointer; list-style: none;
}
details.jstep > summary::-webkit-details-marker { display: none; }
details.jstep > summary:hover, details.jstep[open] > summary { background: var(--hover); }
details.jstep.v-worked { box-shadow: inset 3px 0 0 #34a853; }
details.jstep.v-refused { box-shadow: inset 3px 0 0 #f9ab00; }
details.jstep.v-broken { box-shadow: inset 3px 0 0 #c5221f; }
details.jstep.v-not-run, details.jstep.v-unwalked { box-shadow: inset 3px 0 0 #cfd4d9; }
details.jstep.v-not-run > summary .js-title, details.jstep.v-unwalked > summary .js-title { color: var(--ink-2); font-weight: 500; }
.js-n { font: 700 12px ui-monospace, Menlo, monospace; color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; }
.js-title { font-size: 13.5px; font-weight: 600; line-height: 1.4; }
.js-meta { display: block; margin-top: 3px; font-weight: 400; }
.actor { display: inline-block; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  padding: 1px 6px; border-radius: 3px; background: var(--code); color: var(--muted); vertical-align: middle; }
.actor.a-buyer { background: #dfeaf9; color: #14508c; }
.actor.a-vendor { background: #e0f2f1; color: #00695c; }
.actor.a-evaluator { background: #e6e0f8; color: #45308c; }
.js-var { font-size: 11px; color: var(--muted); }
.js-var b { font-weight: 600; }
.js-var .ok { color: var(--good); } .js-var .bad { color: var(--bad); } .js-var .warn { color: var(--warn); } .js-var .mute { color: var(--muted); }
.js-status .js-ms { display: block; font-weight: 400; font-size: 11px; color: var(--muted); }
.js-actual { font-size: 12.5px; color: var(--ink-2); line-height: 1.45; }
details.jstep.v-not-run .js-actual, details.jstep.v-unwalked .js-actual { color: var(--muted); }
.mute { color: var(--muted); }
.jstep-body { padding: 4px 16px 16px; background: var(--hover); border-top: 1px dashed var(--line); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 0; }
.chip { display: inline-flex; gap: 7px; align-items: baseline; font-size: 11.5px; padding: 2px 9px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--card); }
.chip b { font-weight: 600; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
.chip code { font-size: 11px; color: var(--ink); }
.actor-note { margin: 0 0 7px; font-size: 11.5px; color: var(--warn); }
.actor-note b { color: inherit; }
.pre.also { margin-top: 10px; }
/* the line under the step that ended the journey — the sibling report's .step-stopped */
.step-stopped { margin: 0; padding: 8px 14px 10px 158px; font-size: 12.5px; color: var(--warn); line-height: 1.5;
  background: color-mix(in srgb, var(--warn) 9%, transparent); border-top: 1px dashed var(--line); }
.step-stopped b { color: inherit; }
/* the variations folded under a step: a full case table, closed by default */
details.variations { margin: 12px 0 0; }
details.variations > summary { cursor: pointer; list-style: none; font-size: 12.5px; font-weight: 600; color: var(--ink-2); width: fit-content; }
details.variations > summary::-webkit-details-marker { display: none; }
details.variations > summary::before { content: "▸ "; color: var(--muted); }
details.variations[open] > summary::before { content: "▾ "; }
details.variations > summary b { font-weight: 600; }
details.variations > summary .ok { color: var(--good); } details.variations > summary .bad { color: var(--bad); }
details.variations > summary .warn { color: var(--warn); } details.variations > summary .mute { color: var(--muted); }
details.variations .rows { margin-top: 8px; }
/* the second copy of the event, folded to one line */
details.setup.jvar > summary { cursor: pointer; list-style: none; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
details.setup.jvar > summary::-webkit-details-marker { display: none; }
details.setup.jvar .chev { color: var(--link); font-size: 11px; }
details.setup.jvar[open] .chev { display: none; }
details.setup.jvar .setup-steps { margin-top: 10px; }
details.setup.jvar .setup-call, details.setup.jvar .setup-ms { color: var(--muted); }
details.setup.jvar .setup-status.ok { color: var(--good); }
details.setup.jvar .setup-status.bad { color: var(--bad); }
.unwalked { margin: 18px 0 0; }
.unwalked h4 { margin: 0 0 4px; font-size: 14px; }
.unwalked h4 .count { margin-left: 6px; }
@media (max-width: 900px) {
  details.jstep > summary { grid-template-columns: 90px 24px 1fr; }
  .js-call, .js-status, .js-actual { grid-column: 3; }
  .step-stopped { padding-left: 14px; }
}
@media print {
  details.jstep, details.case, details.variations { break-inside: avoid; }
  .filters { display: none; }
}
`;
