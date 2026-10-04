/**
 * THE SCREEN MODEL the prepared-state steps are grounded on
 * (docs/ui-automation-design.md §3): each events screen's route, the API calls
 * that feed it, and which state it needs. Routes and feeding calls are the ones
 * the UI↔API cross-check reads (src/crosscheck/screens.ts) and the console code
 * declares (prototype/knowledge/events/frontend-digest/*.md, routeConfigs.js).
 */

/** What the API built for this case (prototype/src/ui/uiSetup.ts), handed to the plan. */
export interface PlanContext {
  state?: "none" | "draft" | "upcoming" | "live" | "bid" | "closed" | "proposal" | "awarded";
  eventGroupUuid?: string;
  stageUuid?: string;
  technicalStageUuid?: string;
  title?: string;
  vendorName?: string;
  vendorEmail?: string;
  /** values the API sent, by key — for expect_api_value */
  values?: Record<string, string>;
}

export interface ScreenSpec {
  /** console path; {eg} = event group, {stage} = pricing round, {tstage} = technical round */
  path: string;
  /** API calls (pathname + search) that must be answered once the screen opens */
  feeds: string[];
  /** which built states the screen makes sense on */
  needs: Array<NonNullable<PlanContext["state"]>>;
  /** the URL a correct navigation lands on (for expect_navigated) */
  lands: RegExp;
  what: string;
}

// "upcoming" = published, bidding not yet open (the only state that offers Reschedule Event)
const ANY_EVENT: ScreenSpec["needs"] = ["upcoming", "live", "bid", "closed", "proposal", "awarded"];

export const SCREENS: Record<string, ScreenSpec> = {
  events_list: { path: "/orders", feeds: ["/api/event_groups\\?"], needs: ["none", "draft", "upcoming", "live", "bid", "closed", "proposal", "awarded"], lands: /\/orders(\?|$)/, what: "the events list" },
  drafts_list: { path: "/orders?tab=draft", feeds: ["/api/event_groups/draft"], needs: ["none", "draft"], lands: /\/orders\?tab=draft/, what: "the Drafts tab of the events list" },
  history_list: { path: "/orders?tab=history", feeds: ["/api/event_groups/history"], needs: ["none", "closed", "proposal", "awarded"], lands: /\/orders\?tab=history/, what: "the History tab of the events list" },
  create: { path: "/orders/quick-create?projectCreation=true", feeds: [], needs: ["none"], lands: /\/orders\/quick-create/, what: "a new event's create screen" },
  draft: {
    path: "/orders/quick-create?projectCreation=true&projectId={eg}&draftStageIds={stage}&isEditingAllowed=true",
    feeds: [],
    needs: ["draft"],
    lands: /\/orders\/quick-create\?.*projectId=/,
    what: "the draft event's create screen",
  },
  summary: { path: "/project/{eg}/details", feeds: ["/api/event_groups/{eg}$", "/get_line_items"], needs: ANY_EVENT, lands: /\/project\/[^/]+\/details/, what: "the event's summary" },
  responses: { path: "/project/{eg}/{stage}?tab=compare", feeds: ["/trade/{stage}/schema"], needs: ANY_EVENT, lands: /\/project\/[^/]+\/[^/?]+\?tab=compare/, what: "the pricing round's Responses (comparison)" },
  overview: { path: "/project/{eg}/{stage}?tab=order_info", feeds: ["/trade/{stage}/event_summary"], needs: ANY_EVENT, lands: /tab=order_info/, what: "the pricing round's Overview" },
  participants: { path: "/project/{eg}/{stage}?tab=audience", feeds: ["/companies/audience_for_product"], needs: ANY_EVENT, lands: /tab=audience/, what: "the pricing round's Participants" },
  analytics: { path: "/project/{eg}/{stage}?tab=analytics", feeds: [], needs: ["bid", "closed", "proposal", "awarded"], lands: /tab=analytics/, what: "the pricing round's Analytics" },
  technical: { path: "/project/{eg}/{tstage}?tab=compare", feeds: [], needs: ANY_EVENT, lands: /\/project\/[^/]+\/[^/?]+/, what: "the technical round" },
  master_qcs: { path: "/project/{eg}/master_qcs", feeds: ["/api/sheets/schema\\?view_type=summary_view"], needs: ["bid", "closed", "proposal", "awarded"], lands: /\/master_qcs/, what: "Master QCS (the comparison across rounds)" },
};

export const SCREEN_NAMES = Object.keys(SCREENS);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Fill a screen's path and feeding calls from the context; throws when an id it needs is missing. */
export function resolveScreen(name: string, ctx: PlanContext): { path: string; feeds: RegExp[]; spec: ScreenSpec } {
  const spec = SCREENS[name];
  if (!spec) throw new Error(`no screen "${name}" in the screen model — known: ${SCREEN_NAMES.join(", ")}`);
  const ids: Record<string, string | undefined> = { eg: ctx.eventGroupUuid, stage: ctx.stageUuid, tstage: ctx.technicalStageUuid };
  const fill = (t: string, forRegex: boolean) =>
    t.replace(/\{(eg|stage|tstage)\}/g, (_m, k: string) => {
      const v = ids[k];
      if (!v) throw new Error(`the screen "${name}" needs the ${k === "eg" ? "event" : k === "stage" ? "pricing round" : "technical round"} id, and the API setup did not build one (state ${ctx.state ?? "none"})`);
      return forRegex ? esc(encodeURIComponent(v)) + "|" + esc(v) : encodeURIComponent(v);
    });
  const feeds = spec.feeds.map((f) => {
    // An id may appear encoded or not in the request; accept either.
    const src = f.replace(/\{(eg|stage|tstage)\}/g, (m) => `(?:${fill(m, true)})`);
    return new RegExp(src.replace(/\$$/, "(\\?|$)"));
  });
  return { path: fill(spec.path, false), feeds, spec };
}
