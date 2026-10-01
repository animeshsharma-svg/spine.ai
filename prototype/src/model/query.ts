/**
 * QUERY LAYER of the product model — what the route answers.
 *
 *   anatomyView()                     the whole event anatomy, grouped by section
 *   templatesFor(c, type)             templates the client REALLY has for that event type
 *   templateView(c, uuid)             one template's fields + rules in plain words
 *   ask(c, q)                         deterministic lookups first; memory (RAG) only as context
 *
 * Everything a person reads is in `answer` / `plain` / `summary`; codes,
 * keys and citations are under `details`.
 */
import type { ClientModel, EventUse, ModelTemplate } from "./types.js";
import { loadAnatomy, SECTIONS, type AnatomyRow } from "./anatomy.js";
import { loadLatestModel } from "./store.js";
import { EVENT_TYPE_TO_USES, TEMPLATE_KIND_PLAIN } from "./templateUse.js";

export async function modelFor(companyId: number): Promise<{ model: ClientModel | null; from: string }> {
  return loadLatestModel(companyId);
}

const notBuilt = (c: number) => ({
  error: `No product model has been built for client ${c} yet.`,
  hint: `Run: cd prototype && npm run model:build -- --c ${c}`,
});

// ── anatomy ──────────────────────────────────────────────────────────────────

export function anatomyView(section?: string) {
  const a = loadAnatomy();
  if (!a) return { error: "The event anatomy file is missing.", hint: "Run: npm run model:build -- --anatomy" };
  const sections = SECTIONS.filter((s) => !section || s.id === section).map((s) => ({
    id: s.id,
    title: s.title,
    items: a.rows
      .filter((r) => r.section === s.id)
      .map((r) => ({ id: r.id, title: r.title, plain: r.plain, details: { code: r.code, cites: r.cites, ...r.details } })),
  }));
  return {
    title: a.meta.title,
    compositions: a.compositions,
    counts: { facts: a.rows.length, sections: sections.filter((s) => s.items.length).length },
    sections: sections.filter((s) => s.items.length),
    details: a.meta,
  };
}

// ── templates for a stage type ───────────────────────────────────────────────

export function chooserEntry(t: ModelTemplate) {
  const blocks = t.problems.filter((p) => p.severity === "blocks");
  return {
    uuid: t.uuid,
    name: t.name,
    isDefault: t.isDefault,
    source: t.isDefault ? "Procol default" : "Client's own",
    usable: t.opens && blocks.length === 0,
    summary: t.summary,
    fieldCount: t.fieldCount,
    requiredCount: t.requiredCount,
    buyerFields: t.buyerFields,
    vendorFields: t.vendorFields,
    computedFields: t.computedFields,
    quantityUnit: t.quantityUnit ?? null,
    warnings: t.problems.map((p) => p.plain),
    details: { templateType: t.templateType, orderType: t.orderType, typeIdentifiers: t.typeIdentifiers, listedUnder: t.listedUnder, useFor: t.useFor, updatedAt: t.updatedAt },
  };
}

export async function templatesFor(companyId: number, type: string) {
  const { model, from } = await modelFor(companyId);
  if (!model) return notBuilt(companyId);
  const uses = EVENT_TYPE_TO_USES[type];
  if (!uses) return { error: `Unknown event type "${type}". Use one of: ${Object.keys(EVENT_TYPE_TO_USES).join(", ")}.` };
  const list = model.templates.filter((t) => t.useFor.some((u) => uses.includes(u)));
  // a usable Procol default first, then usable client templates, then the rest
  const entries = list.map(chooserEntry).sort((a, b) => Number(b.usable) - Number(a.usable) || Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  const usable = entries.filter((e) => e.usable);
  const kind = uses.map((u) => TEMPLATE_KIND_PLAIN[u as EventUse]).join(" / ");
  return {
    client: { id: model.companyId, name: model.companyName },
    type,
    question: `Which templates can ${model.companyName ?? `client ${companyId}`} use for a ${kind} stage?`,
    answer: list.length
      ? `${list.length} template(s) are offered for a ${kind} stage; ${usable.length} can be used as they are.`
      : `This client has no template for a ${kind} stage.`,
    suggested: usable[0]?.uuid ?? null,
    templates: entries,
    fetchedAt: model.fetchedAt,
    details: {
      from,
      templateList: type === "rfp" ? "GET /templates?type_identifier=rfi" : type === "boq" ? "GET /templates?type_identifier=boq" : "GET /templates?type_identifier=trade (BOQ-tagged templates hidden outside a BOQ project)",
      cites: [
        "dashboard src/views/eventCreation/templateSelection.jsx:120-133,439-448",
        "app/helpers/templates_helper.rb:4-53",
        "app/controllers/api/templates_controller.rb:107-144",
      ],
      snapshotId: model.snapshotId ?? null,
      hash: model.hash,
    },
  };
}

// ── one template ─────────────────────────────────────────────────────────────

export async function templateView(companyId: number, uuid: string) {
  const { model, from } = await modelFor(companyId);
  if (!model) return notBuilt(companyId);
  const t = model.templates.find((x) => x.uuid === uuid);
  if (!t) return { error: `Template ${uuid} is not among the templates this client was offered when the model was built.` };
  const group = (pred: (f: ModelTemplate["fields"][number]) => boolean) =>
    t.fields.filter(pred).map((f) => ({
      name: f.name,
      plain: f.plain,
      filledBy: f.filledBy,
      required: f.required,
      kind: f.kindLabel,
      unit: f.unit ?? null,
      options: f.options ?? null,
      page: f.page ?? null,
      rules: f.rules.map((r) => ({
        plain: r.plain,
        checkedBy: r.enforcedBy === "backend" ? "server" : r.enforcedBy === "screen" ? "screen only" : r.enforcedBy === "template-only" ? "nobody (template only)" : "not confirmed",
        details: { kind: r.kind, value: r.value, code: r.code ?? null, message: r.message ?? null, cites: r.cites ?? [] },
      })),
      details: { key: f.key, inputType: f.inputType, section: f.section, position: f.position, formula: f.formula ?? null, ...f.details },
    }));
  const pages = [...new Set(t.fields.filter((f) => f.section === "form").map((f) => f.page ?? "Page"))];
  return {
    client: { id: model.companyId, name: model.companyName },
    template: chooserEntry(t),
    whatYouCanFill: {
      buyer: t.fields.filter((f) => f.filledBy === "buyer").map((f) => f.name),
      vendor: t.fields.filter((f) => f.filledBy === "vendor").map((f) => f.name),
      calculated: t.fields.filter((f) => f.filledBy === "computed").map((f) => f.name),
      hidden: t.fields.filter((f) => f.filledBy === "nobody").map((f) => f.name),
    },
    sections: [
      { id: "line_item", title: "Each line item", fields: group((f) => f.section === "line_item") },
      { id: "whole_bid", title: "Once for the whole bid", fields: group((f) => f.section === "whole_bid") },
      ...pages.map((p) => ({ id: `page:${p}`, title: `Page: ${p}`, fields: group((f) => f.section === "form" && (f.page ?? "Page") === p) })),
    ].filter((s) => s.fields.length),
    problems: t.problems,
    units: { rule: model.units.rulePlain, usable: model.units.usable.slice(0, 400).map((u) => u.symbol) },
    fetchedAt: model.fetchedAt,
    details: { from, snapshotId: model.snapshotId ?? null, uuid: t.uuid },
  };
}

// ── ask ──────────────────────────────────────────────────────────────────────

const STOP = new Set("a an the is are was be can i we you it of to in on for and or with what which who how when does do my our this that there any".split(" "));
const terms = (s: string) => s.toLowerCase().replace(/[^a-z0-9_ ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

function searchAnatomy(q: string, k = 5): AnatomyRow[] {
  const a = loadAnatomy();
  if (!a) return [];
  const qt = terms(q);
  if (!qt.length) return [];
  const code = q.match(/\b(\d{2,4})\b/)?.[1];
  return a.rows
    .map((r) => {
      const hay = `${r.title} ${r.plain} ${r.section}`.toLowerCase();
      let s = qt.reduce((n, w) => n + (hay.includes(w) ? (r.title.toLowerCase().includes(w) ? 2 : 1) : 0), 0);
      if (code && r.code === Number(code)) s += 6;
      return { r, s };
    })
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, k)
    .map((x) => x.r);
}

/** Questions people actually ask → the rows that answer them (ids in anatomy.json). */
const FAQ: Array<{ when: RegExp; answer: string; rows: string[] }> = [
  { when: /\b712\b|rfp.*(end|after|later|exceed).*rfq|rfq.*before.*rfp/, answer: "No. The technical round must end no later than the price round; otherwise the stage edit or the publish is refused with \"RFP duration exceeds RFQ end time. Please adjust.\" (712). Stages still in draft are only checked when the event is published.", rows: ["time_rule.rfp_end_not_after_rfq_end", "time_rule.publish_712_draft_project"] },
  { when: /surrogate|on behalf/, answer: "A surrogate bid is a buyer typing a bid on a vendor's behalf. Only a super admin, the event owner or a member of a team covering the event may do it (165), and only if the event does not forbid surrogate bids (10). It is allowed before the start and while running; after the end only when the event allows it. A second surrogate bid for the same vendor needs a client switch (99).", rows: ["surrogate.surrogate_buyer_side_user", "time_rule.bid_only_while_running", "surrogate.only_super_admin", "surrogate.second_surrogate_bid"] },
  { when: /(bid|quote|submit).*(after|past|once).*(end|close|expir|deadline)|late bid|(before|until).*start.*bid|bid.*before.*start/, answer: "No. A vendor can bid only while the stage is running; before the start or after the end the bid is refused (\"Order not active\", 33). After the end a revision is accepted only in a counter-offer window, for a bid waiting for justification, or when a buyer edits a bid and the client allows it.", rows: ["time_rule.bid_only_while_running", "time_rule.bid_revise_only_while_running", "time_rule.bid_v1_create_only_while_running", "time_rule.lock_quote_after_submission"] },
  { when: /reopen|re-open|extend|extension|more time|increase.*time/, answer: "The buyer can push the end time out. A closed technical round reopens. An RFQ or auction whose time has already run out can be reopened only by Procol staff or when the client allows reopening (else 496). Extending is refused once an award proposal exists (801).", rows: ["time_rule.extend_bidding_time", "time_rule.reopen_expired_496", "time_rule.extension_blocked_after_proposal", "time_rule.reopen_expired_evaluation_496", "time_rule.dynamic_time_extension"] },
  { when: /anti.?snip|dynamic.*(time|extension)/, answer: "In an auction with dynamic extension on, a bid in the last N minutes that changes the top ranks (or improves the price) extends the auction (by 3 minutes unless set otherwise). The trigger window must be at least 1 minute and at most half the time left (501).", rows: ["time_rule.dynamic_time_extension", "time_rule.dte_trigger_window_valid"] },
  { when: /evaluat|score/, answer: "An evaluator can score only after the technical round's bidding has ended and while the stage is still active (else \"Order not active\", 33). Each score must be one of the event's score labels; a zero needs a remark (code 2).", rows: ["time_rule.evaluate_only_after_bid_end", "time_rule.evaluation_score_valid", "time_rule.evaluation_submit_only_after_bid_end", "permission.evaluate_score_a_vendor_response"] },
  { when: /award|proposal/, answer: "Only one award proposal per event (per lot) can be live at a time (573). If the client restricts closing to the evaluation window, a proposal cannot be created while bidding is open (720). Submitting a proposal for approval closes any bidding still open; it cannot be submitted if an awarded bid was revised afterwards (1126).", rows: ["time_rule.award_blocked_in_bidding_time", "time_rule.one_live_proposal", "time_rule.proposal_submit_ends_bidding", "time_rule.proposal_bids_not_revised"] },
  { when: /withdraw|cancel/, answer: "An event or stage cannot be withdrawn once an award proposal is submitted or selected (841). \"Cancel\" is only for draft stages. A withdrawn draft cannot be brought back.", rows: ["time_rule.withdraw_blocked_after_proposal", "time_rule.cancel_only_draft"] },
  { when: /reschedul|change.*start/, answer: "Start and end can be moved together only before the stage starts (258). A start time already in the past at publish is moved to now, keeping the same length.", rows: ["time_rule.reschedule_only_before_start", "time_rule.publish_past_start_shifts_window"] },
  { when: /(rfq|price).*(and|with|\+).*auction.*(same|together|one event)|both.*rfq.*auction/, answer: "Not side by side: the screen blocks an RFQ plus a direct auction in one event and the purchase-request route refuses it (15). The plain stage-create call does not check it (a gap). The supported way is to convert the RFQ into an auction.", rows: ["event_type.rfq_plus_auction_refused", "event_type.rfq_then_auction"] },
  { when: /(convert|move|turn).*(rfq)?.*auction|rfq.*to.*auction/, answer: "Converting an RFQ creates an auction stage right after it; the RFQ's quotes become the opening bids, the RFQ is ended at once and locked (no more RFQ edits or bids, 769), and its products cannot change.", rows: ["event_type.rfq_then_auction"] },
  { when: /auction type|kind of auction|knockout|dutch|traffic light|rank auction/, answer: "Auction types: rank (vendors see only their rank), price (vendors see the best price), rank and price, traffic light (colour bands), knockout (rounds; non-acceptors drop out), Dutch (price steps from a start price) and book building. Buy vs sell (reverse vs forward) comes from the template, not the type.", rows: ["auction_type.rank", "auction_type.price", "auction_type.traffic_light", "auction_type.knockout", "auction_type.dutch", "auction_type.reverse_vs_forward"] },
  { when: /event type|kinds? of event|combination|which stages/, answer: "Allowed: RFQ only, technical only, technical + RFQ, RFQ converted to an auction, direct auction, technical + direct auction. Not allowed: an RFQ and a direct auction side by side, or two stages of the same kind.", rows: ["event_type.rfq_only", "event_type.rfp_only", "event_type.rfp_rfq", "event_type.rfq_then_auction", "event_type.auction_direct", "event_type.rfq_plus_auction_refused"] },
  { when: /status|lifecycle|life cycle/, answer: "An event is draft, active, withdrawn or inactive. A stage is draft, requested (awaiting approval), active, closed, withdrawn/inactive, cancelled or void. Nothing changes status when bidding starts or ends \u2014 Upcoming/Open/Expired are worked out from the clock; a stage closes only when all its line items are awarded (or a technical round is fully evaluated).", rows: ["status.event_group_draft", "status.event_group_active", "status.event_group_withdrawn", "status.trade_request_active", "status.trade_request_closed", "fact.display_status"] },
  { when: /who can|permission|allowed to|not authori[sz]ed|455/, answer: "Buyers need the client's \"trade: create\" permission for creating, publishing, extending, withdrawing and awarding; a refusal is code 455. Evaluators are checked by their evaluator assignment, vendors by being in the audience (782). Super admins and Procol staff bypass most checks; permission changes can take up to 12 hours to apply.", rows: ["permission_fact.any_pundit_refusal", "permission.create_event_project", "permission.submit_bid_vendor", "permission.evaluate_score_a_vendor_response", "permission.create_award_proposal"] },
];

function rowsById(ids: string[]): AnatomyRow[] {
  const a = loadAnatomy();
  if (!a) return [];
  // exact id, else the first id that starts with it (row ids end in a shortened slug)
  return ids.map((id) => a.rows.find((r) => r.id === id) ?? a.rows.find((r) => r.id.startsWith(id))).filter((r): r is AnatomyRow => !!r);
}

const NOT_UNITS = new Set(["not", "present", "available", "found", "valid", "allowed", "is", "a", "the", "of", "this", "that", "for", "refused", "error"]);
/** The unit the question names, if it names one: quoted ("kg"), or "unit kg", or "use kg as …". */
function unitAsked(q: string): string | undefined {
  const m =
    q.match(/["“']([^"”']{1,20})["”']/) ??
    q.match(/\b(?:unit|uom|symbol)\s+([a-z0-9%./-]{1,15})\b/i) ??
    q.match(/\b(?:use|is)\s+([a-z0-9%./-]{1,15})\s+(?:as a unit|a valid unit|allowed|valid)\b/i);
  const v = m?.[1]?.trim().toLowerCase();
  return v && !NOT_UNITS.has(v) ? v : undefined;
}

function findTemplate(model: ClientModel, q: string): ModelTemplate | undefined {
  const lq = q.toLowerCase();
  const quoted = q.match(/["“']([^"”']+)["”']/)?.[1]?.toLowerCase();
  const cands = model.templates.filter((t) => (quoted ? t.name.toLowerCase() === quoted.trim() : lq.includes(t.name.toLowerCase()) && t.name.length > 3));
  return cands.sort((a, b) => b.name.length - a.name.length)[0];
}

function stageTypeIn(q: string): string | undefined {
  const lq = q.toLowerCase();
  if (/\bboq\b|bill of quantit/.test(lq)) return "boq";
  if (/\brfp\b|technical|\brfi\b/.test(lq)) return "rfp";
  if (/forward auction|sell auction/.test(lq)) return "forward_auction";
  if (/auction/.test(lq)) return "auction";
  if (/\brfq\b|price quote|pricing|quotation/.test(lq)) return "rfq";
  return undefined;
}

export interface AskAnswer {
  question: string;
  answer: string;
  method: "client lookup" | "anatomy lookup" | "memory" | "none";
  matches: Array<{ title: string; plain: string; details?: Record<string, unknown> }>;
  context?: Array<{ source: string; text: string }>;
  details: Record<string, unknown>;
}

export async function ask(companyId: number | undefined, q: string, opts: { memory?: boolean } = {}): Promise<AskAnswer> {
  const question = q.trim();
  const lq = question.toLowerCase();
  const model = companyId ? (await modelFor(companyId)).model : null;
  const out = (answer: string, method: AskAnswer["method"], matches: AskAnswer["matches"] = [], details: Record<string, unknown> = {}): AskAnswer => ({ question, answer, method, matches, details });
  const who = model?.companyName ?? (companyId ? `client ${companyId}` : "this client");

  if (model) {
    // 1. a named template
    const t = findTemplate(model, question);
    if (t) {
      const req = t.fields.filter((f) => f.required).map((f) => f.name);
      return out(
        `"${t.name}" has ${t.fieldCount} fields: the buyer fills ${t.buyerFields}, the vendor ${t.vendorFields}, ${t.computedFields} are calculated. Required: ${req.join(", ") || "none"}.${t.problems.length ? ` Watch out: ${t.problems.map((p) => p.plain).join(" ")}` : ""}`,
        "client lookup",
        t.fields.map((f) => ({ title: f.name, plain: f.plain, details: { key: f.key, rules: f.rules } })),
        { uuid: t.uuid },
      );
    }
    // 2. units
    if (/\bunits?\b|\buom\b|unit of measure|not present|not available/.test(lq)) {
      const sym = model.units.usable.map((u) => u.symbol.toLowerCase());
      const asked = unitAsked(question);
      const parts = [model.units.rulePlain];
      if (asked) parts.push(sym.includes(asked) ? `"${asked}" IS one of ${who}'s units.` : `"${asked}" is NOT one of ${who}'s units — a line item in it is refused ("The unit ${asked} is not present", code 495).`);
      if (model.units.productsWithUnusableUnit) {
        parts.push(`${model.units.productsWithUnusableUnit} product(s) are linked to a unit ${who} cannot use (${model.units.unusableProductUnits.slice(0, 6).map((u) => `${u.symbol} ×${u.products}`).join(", ")}); the screen pre-selects a product's first unit, so these fail unless the buyer picks another unit.`);
      }
      return out(parts.join(" "), "client lookup", model.units.unusableProductUnits.map((u) => ({ title: `${u.symbol} (${u.unitName})`, plain: `${u.products} product(s), e.g. ${u.sample.join(", ")}`, details: { ownerCompanyId: u.ownerCompanyId } })), {
        usableUnits: model.units.count,
        companyOnly: model.units.companyOnly,
        cites: ["app/controllers/concerns/trade_template_helper.rb:1386-1416", "app/models/unit.rb:48-66", "dashboard src/views/projectCreation/components/manageLineItemsModal.jsx:67-80"],
      });
    }
    // 3. templates for a stage type
    if (/template/.test(lq)) {
      const type = stageTypeIn(question) ?? "rfq";
      const r: any = await templatesFor(model.companyId, type);
      return out(`${r.answer}${r.templates?.length ? ` Usable: ${r.templates.filter((x: any) => x.usable).slice(0, 8).map((x: any) => x.name).join(", ") || "none"}.` : ""}`, "client lookup",
        (r.templates ?? []).map((x: any) => ({ title: x.name, plain: x.summary, details: { uuid: x.uuid, usable: x.usable } })), { type });
    }
    // 4. vendors / products / settings
    if (/vendor|supplier|invite/.test(lq) && !/surrogate|bid/.test(lq)) {
      const v = model.vendors;
      return out(`${who} can invite ${v.invitable} vendors (status ${v.allowedStatuses.join(" or ")}, from ${v.allowedStatusesFrom}). QA-safe test vendors: ${v.qaSafe.map((x) => x.name).join(", ") || "none found"}.`, "client lookup", [], { byStatus: v.byStatus, cites: ["app/controllers/api/companies_controller.rb:487-488", "app/models/company.rb:179-181"] });
    }
    if (/\bproducts?\b|material/.test(lq)) {
      const p = model.products;
      return out(`${who} has ${p.active} active products with ${p.activeQualities} active qualities; ${p.withUnitLinks} have linked units. ${model.units.productsWithUnusableUnit} are linked to a unit the client cannot use.`, "client lookup", p.sample.map((s) => ({ title: s.name, plain: s.usable ? `usable (units ${s.units.join(", ") || "none linked"})` : `not usable as is: ${s.why}` })));
    }
    if (/setting|config|switch|flag/.test(lq)) {
      return out(model.settings.filter((s) => !s.key.startsWith("db:") || s.value !== null).map((s) => s.plain).slice(0, 14).join(" "), "client lookup", model.settings.map((s) => ({ title: s.key, plain: s.plain })));
    }
  }

  // 5. the anatomy (how events work): known questions first, then a scored search
  const faq = FAQ.find((f) => f.when.test(lq));
  const hits = faq ? rowsById(faq.rows) : searchAnatomy(question);
  if (hits.length) {
    const first = hits[0];
    const askedCode = Number(question.match(/\bcode\s*(\d{1,4})\b/i)?.[1]);
    const msg = (first.details as any)?.message;
    const answer =
      faq?.answer ??
      (askedCode && first.code === askedCode && msg
        ? `Code ${askedCode} is the refusal "${msg}". It applies to: ${first.title.replace(/_/g, " ")}. ${first.plain}`
        : `${first.plain}${first.code ? ` (refusal code ${first.code})` : ""}`);
    const res = out(answer, "anatomy lookup", hits.map((h) => ({ title: h.title, plain: h.plain, details: { code: h.code, cites: h.cites } })), { cites: first.cites });
    if (opts.memory) res.context = await memoryContext(question);
    return res;
  }

  // 6. memory — context only, never the deciding answer
  const context = await memoryContext(question);
  return {
    question,
    answer: context.length ? "No exact rule matched; the closest notes from the platform's memory are listed below — read them as context, not as a rule." : "No rule or note matched this question.",
    method: context.length ? "memory" : "none",
    matches: [],
    context,
    details: {},
  };
}

async function memoryContext(q: string): Promise<Array<{ source: string; text: string }>> {
  try {
    const { retrieve } = await import("../rag/knowledgeBase.js");
    const r = await Promise.race([retrieve(q, 3), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10_000))]);
    return r.map((x) => ({ source: x.source, text: x.text.slice(0, 600) }));
  } catch {
    return [];
  }
}
