/**
 * SET UP BY API, TEST ON THE SCREEN (docs/ui-automation-design.md §2).
 *
 * A senior QA prepares the test data the quickest way and then exercises only
 * the screen under test. This module builds a case's starting state through the
 * API journey (src/checks/eventJourney.ts — the same calls, guarded senders and
 * QA test vendors the API runs use) and returns what the browser needs to open
 * the right screen already in that state: the event's ids and the values the
 * API sent, so a screen assertion can compare against them.
 *
 * States (each one a prefix of the journey's own step order):
 *   none        nothing is built — the screen is the events list or a new create screen
 *   draft       a draft event with one pricing round (RFQ)
 *   live        that event published, bidding open for an hour
 *   bid         live, and the client's QA vendor has submitted a bid
 *   closed      the bidding window has ended after the vendor's bid
 *   proposal    closed, and the buyer has a DRAFT award proposal with the line allocated
 *   awarded     closed, and the buyer has awarded it
 * With `technical: true` the event also carries a technical (RFP) round first.
 *
 * Safety: only the client's QA test vendor (qa_…@example.com) is ever invited —
 * the build refuses otherwise. Every event is titled QA_Platform_UI_….
 * Bounded: the whole build has a time limit; a build that does not finish is
 * reported as "could not build the state" (a couldn't-tell, never a failure).
 */
import { openClientContext } from "../executor.js";
import { runEventJourney } from "../checks/eventJourney.js";
import { journeyPlan } from "../checks/journeyModel.js";
import { withWatchdog } from "../checks/resilience.js";

export type UiState = "none" | "draft" | "upcoming" | "live" | "bid" | "closed" | "proposal" | "awarded";
export const UI_STATES: UiState[] = ["none", "draft", "live", "bid", "closed", "proposal", "awarded"];

/** What the browser (and the screen assertions) get from the build. */
export interface UiSetupContext {
  state: UiState;
  technical: boolean;
  companyId: number;
  eventGroupUuid?: string;
  /** the pricing round's trade (stage) uuid */
  stageUuid?: string;
  /** the technical round's trade uuid, when there is one */
  technicalStageUuid?: string;
  title?: string;
  vendorName?: string;
  /** the QA test vendor's address (qa_…@example.com) — for a vendor-portal step */
  vendorEmail?: string;
  /** every id the journey produced, by name */
  made: Record<string, string>;
  /** values the API sent, for expect_api_value (key → text as a person would read it) */
  values: Record<string, string>;
  builtInMs: number;
}

export interface UiSetupResult {
  ok: boolean;
  context?: UiSetupContext;
  /** plain English: why the state could not be built */
  why?: string;
}

const PREFIX: Record<Exclude<UiState, "none">, string> = {
  draft: "add_stage_pricing",
  // published with bidding starting in 30 minutes — "Reschedule Event" is offered only then
  upcoming: "read_back",
  live: "read_back",
  bid: "bid_submit",
  closed: "wait_close",
  proposal: "award_lines",
  awarded: "award_submit",
};

/** Clients (or a test) can share one opened client context across builds. */
const clients = new Map<number, Promise<any>>();
function clientFor(companyId: number): Promise<any> {
  if (!clients.has(companyId)) clients.set(companyId, openClientContext(companyId));
  return clients.get(companyId)!;
}

/** The client's QA test vendor (name + qa_…@example.com address), or null when it has none. */
export async function qaVendorOf(companyId: number): Promise<{ name: string; email: string } | null> {
  try {
    const client = await withWatchdog(clientFor(companyId), 120_000, "signing in to the client");
    const email = String(client?.ctx?.vendor?.email ?? "");
    if (!/^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i.test(email)) return null;
    return { name: String(client.ctx.vendor.name ?? ""), email };
  } catch {
    clients.delete(companyId);
    return null;
  }
}

/** Pull the values a screen should show out of what the journey sent. */
function valuesFrom(journey: any, client: any): Record<string, string> {
  const v: Record<string, string> = {};
  if (journey?.title) v.title = String(journey.title);
  const vendor = client?.ctx?.vendor?.name;
  if (vendor) v.vendorName = String(vendor);
  for (const s of journey?.steps ?? []) {
    const body = s?.call?.body;
    if (!body) continue;
    // POST /event_groups {line_items:[{quantity:{unitSymbol, value}}]}
    if (s.kind === "create_draft") {
      const q = body?.line_items?.[0]?.quantity;
      if (q?.value !== undefined) v.quantity = String(q.value);
      if (q?.unitSymbol) v.unit = String(q.unitSymbol);
    }
    // the pricing round's window: configurations.{bid_start_time, bid_end_time, extra_closing_time}
    // (unix s) — what a reschedule must preserve (round length, closing grace)
    if (s.kind === "add_stage_pricing") {
      const c = body?.configurations ?? {};
      const [bst, bet, ect] = [Number(c.bid_start_time), Number(c.bid_end_time), Number(c.extra_closing_time)];
      if (bst && bet) v.roundSeconds = String(bet - bst);
      if (bet && ect) v.extraSeconds = String(ect - bet);
      const del = c.delivery_schedules?.[0]?.delivery_by;
      if (del) v.deliveryBy = String(del);
    }
    // the vendor's sheet: sheets.inline_components.data.<company>[0].{price,total_amount}.value
    if (s.kind === "bid_products") {
      const rows = body?.sheets?.inline_components?.data;
      const row = rows && typeof rows === "object" ? (Object.values(rows)[0] as any[])?.[0] : undefined;
      if (row?.price?.value !== undefined && row.price.value !== null) v.bidPrice = String(row.price.value);
      if (row?.total_amount?.value !== undefined && row.total_amount.value !== null) v.bidTotal = String(row.total_amount.value);
    }
  }
  for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
  return v;
}

export async function buildUiState(
  companyId: number,
  state: UiState,
  opts: { technical?: boolean; budgetMs?: number; onLine?: (l: string) => void } = {},
): Promise<UiSetupResult> {
  const t0 = Date.now();
  if (state === "none") return { ok: true, context: { state, technical: false, companyId, made: {}, values: {}, builtInMs: 0 } };
  const technical = !!opts.technical;
  let client: any;
  try {
    client = await withWatchdog(clientFor(companyId), 120_000, "signing in to the client");
  } catch (e) {
    clients.delete(companyId);
    return { ok: false, why: `could not sign in to client ${companyId}: ${(e as Error).message}` };
  }
  const email = String(client?.ctx?.vendor?.email ?? "");
  if (!/^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i.test(email)) {
    return { ok: false, why: `client ${companyId} has no QA test vendor to bid with (${client?.ctx?.noQaVendor ?? "none configured"}) — refusing to build with a real supplier` };
  }
  const plan = journeyPlan([technical ? "events.rfp_rfq" : "events.rfq_only"]);
  const stop = plan.steps.indexOf(PREFIX[state] as any);
  if (stop < 0) return { ok: false, why: `the journey has no step "${PREFIX[state]}" for state ${state}` };
  plan.steps = plan.steps.slice(0, stop + 1);
  // A technical event's vendor answers the technical round too before the pricing bid.
  // States that must stay open get an hour; closed/awarded get the shortest window the run can wait out.
  const stageSeconds = state === "closed" || state === "proposal" || state === "awarded" ? 75 : 3600;
  let r: any;
  try {
    r = await withWatchdog(
      runEventJourney(client, plan, {
        stageSeconds,
        // upcoming: published, not yet open — and with a Delivery Date, so the Reschedule
        // dialog shows that field and its "start on or before delivery" rule can be checked
        ...(state === "upcoming" ? { startDelaySec: 30 * 60, deliveryInDays: 2 } : {}),
        titlePrefix: "QA_Platform_UI",
        journeyBudgetMs: opts.budgetMs ?? 12 * 60_000,
        onLine: (l: string) => opts.onLine?.(l),
      }),
      (opts.budgetMs ?? 12 * 60_000) + 60_000,
      `building the ${state} state`,
    );
  } catch (e) {
    return { ok: false, why: `the API build of the ${state} state did not finish: ${(e as Error).message}` };
  }
  const j = r?.journey;
  const failed = (j?.steps ?? []).find((s: any) => s.verdict !== "worked");
  const made: Record<string, string> = j?.made ?? {};
  if (!made.eventGroupUuid || failed) {
    return { ok: false, why: `the API build of the ${state} state stopped: ${j?.outcome ?? "no outcome"}${failed ? ` (at ${failed.kind}: ${String(failed.actual ?? failed.why ?? "").slice(0, 160)})` : ""}` };
  }
  const stageUuid = made.pricingTradeUuid;
  return {
    ok: true,
    context: {
      state,
      technical,
      companyId,
      eventGroupUuid: made.eventGroupUuid,
      stageUuid,
      technicalStageUuid: made.technicalTradeUuid,
      title: j.title,
      vendorName: client?.ctx?.vendor?.name,
      vendorEmail: email,
      made,
      values: valuesFrom(j, client),
      builtInMs: Date.now() - t0,
    },
  };
}
