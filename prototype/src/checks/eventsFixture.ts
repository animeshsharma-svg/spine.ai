import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PROCOL_TEST } from "../executor.js";

/**
 * A REAL EVENT FOR THE EVENTS CASES TO ACT ON.
 *
 * The events case library addresses an event group and a trade (a stage) by
 * placeholder — 48 of the 49 RFQ cases need `{{eventGroupUuid}}` and 30 of them
 * need `{{tradeId}}`. Nothing in the library produced a trade, so those 30 were
 * reported "not checked" on every run, and the rest acted on whatever a single
 * `POST /event_groups` happened to leave behind.
 *
 * So the run now opens by building a genuine RFQ event through the sibling
 * framework's own `createEvent` — the code path that is exercised end to end
 * and DB-verified by `procol test` — rather than by assembling one out of case
 * bodies. That is the difference between a fixture and a guess: this chain
 * (event group → line item → pricing stage → activate) is known to work
 * against this product, so a case that then fails is telling us something
 * about the case, not about the setup.
 *
 * It writes real data to the target environment. So did the seed case it
 * replaces; the difference is that this one produces a complete, usable event
 * instead of a bare draft.
 */

/** One real API call the setup chain made, as a reader meets it. */
export interface FixtureStep {
  n: number;
  /** plain English: what this call did */
  did: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  ok: boolean;
}

export interface EventFixture {
  eventGroupUuid: string;
  /** the pricing stage's trade uuid — what `{{tradeId}}` resolves to */
  tradeId?: string;
  lineItemUuid: string;
  title: string;
  status: string;
  stageCount: number;
  /** the calls that built it, in the order they were made */
  steps: FixtureStep[];
}

type SiblingCreateEvent = (
  buyerApi: unknown,
  opts: Record<string, unknown>,
) => Promise<{
  eventGroupUuid: string;
  lineItemUuid: string;
  pricingTradeUuid?: string;
  technicalTradeUuid?: string;
  title: string;
  status: string;
  stages: unknown[];
}>;

type ApiCall = {
  timestamp: string;
  method: string;
  uri: string;
  status: number;
  durationMs: number;
  ok: boolean;
};

let createEventFn: SiblingCreateEvent | undefined;
let readApiCallsFn: (() => ApiCall[]) | undefined;

/**
 * Plain English for one call in the chain.
 *
 * The report's job here is to say what the automation DID before the cases
 * ran — "created the event group", "added the RFQ stage" — not to reprint a
 * route. A reader who is not an engineer should be able to follow the setup.
 */
/**
 * The endpoints that actually build an event.
 *
 * The recorder captures everything this process does, and other parts of the
 * run read configuration and purchase requests in the same window. Claiming
 * those as "how the event was built" would be a lie in a block whose whole
 * point is to say truthfully what was made, so the window is filtered down to
 * the chain's own calls.
 */
const BUILD_CALL =
  /\/event_groups(\/|$|\?)|\/trade\/template_input|\/trade\/[^/]+\/?(add_audience)?|\/templates?(\/|$|\?)/;

function describeCall(call: ApiCall): string {
  const path = call.uri.split("?")[0];
  if (/\/event_groups$/.test(path) && call.method === "POST") return "Created the event group, with its line item";
  if (/\/trade\/template_input/.test(path)) return "Added a stage to the event";
  if (/\/event_groups\/[^/]+$/.test(path) && call.method === "PATCH") return "Published the event";
  if (/\/event_groups\/[^/]+$/.test(path) && call.method === "GET") return "Read the event back";
  if (/add_audience/.test(path)) return "Invited the supplier to the event";
  if (/templates?/.test(path)) return "Looked up the template the stage is built from";
  if (/products|categor/.test(path)) return "Looked up the product to put on the event";
  return `${call.method} ${path}`;
}

async function loadCreateEvent(): Promise<SiblingCreateEvent> {
  if (!createEventFn) {
    const mod = await import(
      pathToFileURL(join(PROCOL_TEST, "src", "flows", "createEvent.ts")).href
    );
    createEventFn = mod.createEvent as SiblingCreateEvent;
  }
  return createEventFn;
}

/**
 * The sibling's recorder already writes every call this process makes through
 * its ApiClient, so the setup chain does not need instrumenting — it needs
 * reading. Snapshotting the log around the build gives the real calls, with
 * the real statuses and timings, in the real order.
 */
async function loadReadApiCalls(): Promise<() => ApiCall[]> {
  if (!readApiCallsFn) {
    const mod = await import(
      pathToFileURL(join(PROCOL_TEST, "src", "report", "apiLog.ts")).href
    );
    readApiCallsFn = mod.readApiCalls as () => ApiCall[];
  }
  return readApiCallsFn;
}

/**
 * Builds one RFQ-only event and returns the ids the cases address.
 *
 * Never throws: a fixture that cannot be built is a fact the run should report
 * and carry on with — the cases that needed it are then skipped with a reason,
 * which is honest, rather than the whole run dying on setup.
 */
export async function buildEventFixture(client: {
  ctx: { buyerApi: unknown; catalog?: unknown; vendor?: { uuid?: string } };
}): Promise<{ fixture?: EventFixture; error?: string }> {
  try {
    const createEvent = await loadCreateEvent();
    const readApiCalls = await loadReadApiCalls().catch(() => undefined);
    const startedAt = new Date().toISOString();

    const result = await createEvent(client.ctx.buyerApi, {
      // RFQ only: a pricing stage needs no evaluator, so the fixture does not
      // depend on one being resolvable for this company.
      stages: [{ kind: "rfq" }],
      catalog: client.ctx.catalog,
      vendorCompanyUuid: client.ctx.vendor?.uuid,
      title: `QA_Platform_Fixture_${Date.now()}`,
    });
    const steps: FixtureStep[] = (readApiCalls?.() ?? [])
      .filter((c) => c.timestamp >= startedAt && BUILD_CALL.test(c.uri.split("?")[0]))
      .map((c, i) => ({
        n: i + 1,
        did: describeCall(c),
        method: c.method,
        path: c.uri.split("?")[0],
        status: c.status,
        ms: Math.round(c.durationMs),
        ok: c.ok,
      }));

    return {
      fixture: {
        eventGroupUuid: result.eventGroupUuid,
        tradeId: result.pricingTradeUuid,
        lineItemUuid: result.lineItemUuid,
        title: result.title,
        status: result.status,
        stageCount: result.stages?.length ?? 0,
        steps,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** True when this selection contains cases that address an event. */
export const needsEventFixture = (featureIds: string[]): boolean =>
  featureIds.some((id) => id === "events" || id.startsWith("events."));
