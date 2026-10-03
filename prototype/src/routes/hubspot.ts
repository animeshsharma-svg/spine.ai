/**
 * Support tickets from HubSpot, as spine.ai stored them (stripped of personal data).
 *
 *   GET /api/hubspot/summary
 *     → aggregates only: counts by classification, module, feature,
 *       reproduction status, how each was decided, personal data removed.
 *   GET /api/hubspot/tickets[?module=&feature=&classification=&status=&dataset=&events=1]
 *     → the stripped records (no raw text exists anywhere to return). A
 *       ticket whose stripped text tripped the leak check shows "[withheld …]".
 *
 * Read-only. Filled by `npm run hubspot:ingest` and `npm run hubspot:reproduce`.
 */
import type { RouteHandler } from "./index.js";
import { loadRows, summarise, type TicketRow } from "../hubspot/store.js";
import { findFeature, FEATURE_TREE } from "../../config/featureTree.js";

const STATUS_WORDS: Record<string, string> = {
  not_tried: "Not tried yet",
  reproduced: "Reproduced — a confirmed bug",
  not_reproduced: "Not reproduced",
  needs_confirmation: "Failed twice — needs a person to confirm",
  not_automatable: "Needs a person (cannot be automated yet)",
};
const CLASS_WORDS: Record<string, string> = {
  defect: "Product defect",
  how_to: "How-to question",
  request: "Service request",
  config: "Setting change",
  data: "Data correction",
  unclear: "Unclear",
};

function view(r: TicketRow) {
  const feature = r.featureKey ? findFeature(r.featureKey) : undefined;
  const module = FEATURE_TREE.find((g) => g.id === r.module);
  const ev = r.reproductionEvidence ?? null;
  return {
    id: r.ticketId,
    title: r.subject,
    summary: r.summary,
    kind: CLASS_WORDS[r.classification ?? "unclear"] ?? r.classification,
    area: [module?.label, feature?.label].filter(Boolean).join(" › ") || "Not mapped",
    status: STATUS_WORDS[r.reproductionStatus] ?? r.reproductionStatus,
    verdictReason: ev?.reason ?? ev?.because ?? null,
    cases: r.linkedCaseIds,
    created: r.createdAt,
    closed: r.closedAt,
    scenario: r.scenario
      ? { preconditions: r.scenario.preconditions, steps: r.scenario.steps, expected: r.scenario.expected, observed: r.scenario.observed, automatable: r.scenario.automatable }
      : null,
    flagged: r.leakKinds.length > 0,
    details: {
      classification: r.classification,
      confidence: r.confidence,
      classifiedBy: r.classifiedBy,
      classificationWhy: r.classificationWhy,
      module: r.module,
      featureKey: r.featureKey,
      mappedBy: r.mappedBy,
      mapConfidence: r.mapConfidence,
      inEventsScope: r.inEventsScope,
      clientId: r.clientId,
      category: r.category,
      priority: r.priority,
      pipelineStage: r.pipelineStage,
      sourceType: r.sourceType,
      inputKind: r.inputKind,
      dataset: r.dataset,
      pattern: r.scenario?.pattern ?? null,
      errorCode: r.scenario?.errorCode ?? null,
      backendCite: r.scenario?.backendCite ?? null,
      reproductionStatus: r.reproductionStatus,
      reproductionEvidence: ev,
      lastRunAt: r.lastRunAt,
      piiRemoved: r.piiRemoved,
      leakKinds: r.leakKinds,
      aiSkipped: r.aiSkipped,
    },
  };
}

export const handle: RouteHandler = async (ctx) => {
  if (ctx.path !== "/api/hubspot/summary" && ctx.path !== "/api/hubspot/tickets") return false;
  if (ctx.req.method !== "GET") {
    ctx.json({ error: "read-only" }, 405);
    return true;
  }
  const { rows, from } = await loadRows().catch(() => ({ rows: [] as TicketRow[], from: "file" as const }));
  if (ctx.path === "/api/hubspot/summary") {
    ctx.json({ from, ...summarise(rows), statusWords: STATUS_WORDS, classWords: CLASS_WORDS });
    return true;
  }
  const q = ctx.url.searchParams;
  const pick = (k: string) => q.get(k) || null;
  const filtered = rows.filter(
    (r) =>
      (!pick("module") || r.module === pick("module")) &&
      (!pick("feature") || r.featureKey === pick("feature")) &&
      (!pick("classification") || r.classification === pick("classification")) &&
      (!pick("status") || r.reproductionStatus === pick("status")) &&
      (!pick("dataset") || r.dataset === pick("dataset")) &&
      (q.get("events") !== "1" || r.inEventsScope),
  );
  ctx.json({ from, total: filtered.length, tickets: filtered.map(view) });
  return true;
};
