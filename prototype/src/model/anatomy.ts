/**
 * EVENT ANATOMY — how a Procol sourcing event is built and runs, as data.
 *
 * Inputs: src/model/research/*.json — four read-only code reads (2026-10-01):
 *   composition-status.json       event types, stages, statuses, actions (backend)
 *   time-permissions.json         time rules, actors, policies (backend)
 *   templates-fields-units.json   template types, field rules, units (backend)
 *   dashboard-create-screen.json  what the create screen asks for and checks (dashboard)
 * Every entry carries the file:line it was read from.
 *
 * Output: src/model/anatomy.json — { meta, compositions, rows[] }; each row is
 * one fact (id, section, title, plain, code?, cites[], details). The same rows
 * go into spine.ai's model_anatomy table (migration 002).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const RESEARCH = join(here, "research");
export const ANATOMY_FILE = join(here, "anatomy.json");

export interface AnatomyRow {
  id: string;
  section: string;
  title: string;
  plain: string;
  code: number | null;
  cites: string[];
  details: Record<string, unknown>;
}

export interface Anatomy {
  meta: Record<string, string>;
  compositions: {
    allowed: Array<{ id: string; stages: string[]; plain: string }>;
    refused: Array<{ id: string; plain: string; cites: string[] }>;
  };
  rows: AnatomyRow[];
}

/** Plain names of the sections, in the order a person reads them. */
export const SECTIONS: Array<{ id: string; title: string }> = [
  { id: "stage", title: "Kinds of stage" },
  { id: "event_type", title: "Event types (how stages combine)" },
  { id: "auction_type", title: "Auction types" },
  { id: "stage_rule", title: "Stage rules" },
  { id: "move_to_auction", title: "Turning an RFQ into an auction" },
  { id: "status", title: "Statuses" },
  { id: "transition", title: "How statuses change" },
  { id: "action", title: "What is allowed when" },
  { id: "time_field", title: "Where the times live" },
  { id: "time_rule", title: "Time rules" },
  { id: "actor", title: "Who takes part" },
  { id: "permission", title: "Who may do what" },
  { id: "permission_fact", title: "Permission mechanics" },
  { id: "surrogate", title: "Surrogate bids (buyer bids for a vendor)" },
  { id: "draft_version", title: "Drafts, versions and clones" },
  { id: "template_type", title: "Template types" },
  { id: "template_listing", title: "Which templates are offered" },
  { id: "template_structure", title: "How a template holds its fields" },
  { id: "screen_template_type", title: "Which template list each stage asks for" },
  { id: "screen_chooser", title: "The template chooser on the screen" },
  { id: "screen_flow", title: "The create screen, step by step" },
  { id: "screen_menu", title: "Create-event menu and its switches" },
  { id: "screen_field", title: "How the screen shows and checks fields" },
  { id: "unit_rule", title: "Units" },
  { id: "unit_error", title: "Unit errors" },
  { id: "screen_unit", title: "Units on the screen" },
  { id: "enum", title: "Stored values (enums)" },
  { id: "fact", title: "Other facts" },
];

export function loadAnatomy(): Anatomy | null {
  try {
    return JSON.parse(readFileSync(ANATOMY_FILE, "utf8")) as Anatomy;
  } catch {
    return null;
  }
}

// ── rebuild from the research files ─────────────────────────────────────────

function citesOf(s: unknown): string[] {
  if (!s) return [];
  const parts = Array.isArray(s) ? s.map(String) : String(s).split(/;\s*/);
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/^FE:\s*/, "dashboard "))
    .map((p) => (p.startsWith("src/") ? `dashboard ${p}` : p));
}

const slug = (s: unknown, n = 60) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, n);

const read = (f: string) => JSON.parse(readFileSync(join(RESEARCH, f), "utf8"));

export function rebuildAnatomy(): Anatomy {
  const C = read("composition-status.json");
  const T = read("time-permissions.json");
  const F = read("templates-fields-units.json");
  const D = read("dashboard-create-screen.json");
  const rows: AnatomyRow[] = [];
  const add = (section: string, id: string, title: string, plain: string, cite: unknown, code: unknown = null, details: Record<string, unknown> = {}) => {
    // a few research rows carry a note ("unverified …") where a code would be — keep it, but not as the code
    const n = typeof code === "number" ? code : Number(code);
    const ok = code !== null && code !== undefined && Number.isInteger(n);
    rows.push({ id: `${section}.${id}`, section, title, plain, code: ok ? n : null, cites: citesOf(cite), details: ok || code == null ? details : { ...details, codeNote: code } });
  };

  const stageKinds: Array<[string, string, string, number]> = [
    ["rfp", "Technical round (RFP)", "Vendors answer the buyer's questions and upload documents; evaluators score the answers. Uses a technical (rfi) template.", 1],
    ["rfq", "Price quote round (RFQ)", "Vendors quote a price per line item (they may revise until the end). Uses a pricing (trade) template.", 2],
    ["auction", "Auction", "Vendors bid live against each other and see their rank or the best price; the price keeps moving until the auction ends.", 3],
    ["rfq_then_auction", "Auction made from an RFQ", "The RFQ's quotes become the starting bids of an auction; the RFQ is ended and locked.", 4],
  ];
  for (const [k, title, plain, order] of stageKinds) {
    add("stage", k, title, `${plain} Position in an event: ${order} (earlier stages come first).`,
      "app/models/trade_request.rb:155; app/models/trade_request.rb:164; app/services/event_groups/update_service.rb:376", null, { rfx_mode: k, standard_stage_sequence: order });
  }
  for (const e of C.eventTypes) add("event_type", e.id, e.name, e.how, (e.rules ?? []).slice(0, 4).map((r: any) => r.cite).join("; "), null, { stages: e.stages, rules: e.rules });
  for (const a of C.auctionTypes) add("auction_type", a.id, a.name, a.how, a.cite);
  for (const r of C.stageRules) add("stage_rule", slug(r.rule, 40), r.rule.slice(0, 90), r.rule, r.cite, r.code, { message: r.message });
  for (const r of C.moveToAuction) add("move_to_auction", slug(r.rule, 40), r.rule.slice(0, 90), r.rule, r.cite, r.code, { message: r.message });
  for (const e of C.enums) add("enum", slug(`${e.model}_${e.field}`), `${e.model}.${e.field}`, Object.entries(e.values).map(([k, v]) => `${k} = ${v}`).join(", "), e.cite, null, { values: e.values, note: e.note });
  for (const s of C.statuses) add("status", `${s.entity}_${s.status}`, `${s.entity === "event_group" ? "Event" : "Stage"} status: ${s.status}`, s.meaning, s.cite, null, { value: s.value, entersWhen: s.entersWhen, entity: s.entity });
  C.transitions.forEach((t: any, i: number) => add("transition", `${String(i).padStart(2, "0")}_${slug(`${t.entity}_${t.from}_${t.to}`, 40)}`, `${t.entity}: ${t.from} → ${t.to}`, t.trigger, t.cite, null, { entity: t.entity, from: t.from, to: t.to }));
  C.actionsByStatus.forEach((a: any, i: number) =>
    add("action", `${String(i).padStart(2, "0")}_${slug(a.action, 40)}`, a.action,
      `Allowed: ${(a.allowedIn ?? []).join("; ")}. Refused: ${(a.refusedIn ?? []).join("; ")}.${a.message ? ` Refusal says "${a.message}".` : ""}`, a.cite, a.code, { allowedIn: a.allowedIn, refusedIn: a.refusedIn, message: a.message }));
  for (const r of C.surrogate) add("surrogate", slug(r.rule, 40), r.rule.slice(0, 90), r.rule, r.cite, r.code);
  for (const r of C.draftAndVersioning) add("draft_version", slug(r.fact, 40), r.fact.slice(0, 90), r.fact, r.cite);
  for (const r of C.other) add("fact", slug(r.fact, 40), r.fact.slice(0, 90), r.fact, r.cite);
  for (const f of T.timeFields) add("time_field", slug(`${f.entity}_${f.column}`, 50), `${f.entity}.${f.column}`, f.meaning, f.cite);
  for (const r of T.timeRules) add("time_rule", r.id, r.id.replace(/_/g, " "), `${r.rule}${r.when ? ` When: ${r.when}` : ""}`, r.cite, r.code, { message: r.message, http: r.http });
  for (const a of T.actors) add("actor", a.id, a.id.replace(/_/g, " "), a.who, a.cite);
  for (const p of T.permissions)
    add("permission", slug(p.action, 50), p.action, `Who: ${(p.actors ?? []).join(", ")}. Policy: ${p.policy}. Needs: ${p.permission}.${p.flags?.length ? ` Also: ${p.flags.join("; ")}.` : ""}`, p.cite, p.refusalCode, { policy: p.policy, permission: p.permission, flags: p.flags });
  for (const r of T.other) add("permission_fact", slug(r.fact, 40), r.fact.slice(0, 90), r.fact, r.cite);
  for (const t of F.templateTypes) add("template_type", slug(t.identifier), t.identifier, `${t.meaning} Used for: ${t.usedFor}.`, t.cite);
  for (const r of F.templateListing) add("template_listing", slug(r.fact, 40), r.fact.slice(0, 90), r.fact, r.cite);
  for (const r of F.structure) add("template_structure", slug(r.fact, 40), r.fact.slice(0, 90), r.fact, r.cite);
  for (const r of F.units) add("unit_rule", slug(r.fact, 40), r.fact.slice(0, 90), r.fact, r.cite);
  add("unit_rule", "line_item_unit_end_to_end", "Which unit a line item ends up with, and when it is refused",
    "On the screen the unit list is every unit of the client (from the settings payload), and picking a product pre-selects the product's FIRST linked unit. " +
      "That unit is sent as the quantity column's suffix. The server lower-cases it and looks it up among the client's units: the client's own units, plus Procol-wide " +
      "units unless material codification or company-only units is on. Not found -> the stage is refused with 495 'The unit <x> is not present'. " +
      "A product linked to a unit that belongs to ANOTHER company (product_units is not filtered by company) therefore fails as soon as that unit is pre-selected, " +
      "unless the buyer changes it to one of the client's units.",
    "dashboard src/views/projectCreation/components/manageLineItemsModal.jsx:67-80; dashboard src/components/sheet/sheet.jsx:1957-1977; dashboard src/redux/orders/helpers.js:372-377; " +
      "app/controllers/concerns/trade_template_helper.rb:1386-1416; app/models/unit.rb:48-66; app/models/product.rb:63-64; app/models/company.rb:238-240",
    495);
  for (const r of F.unitErrors) add("unit_error", `${r.code}_${slug(r.raisedWhen, 30)}`, `Unit error ${r.code}`, `${r.message} — ${r.raisedWhen}`, r.cite, r.code);
  for (const r of D.templateTypesByEventType) add("screen_template_type", slug(`${r.eventType}_${r.stage}`, 50), `${r.stage} in ${r.eventType}`, `Asks for "${r.typeIdentifier}" templates: ${r.apiCall}`, r.cite);
  for (const r of D.templateChooser) add("screen_chooser", slug(r.fact, 40), r.fact.slice(0, 90), r.fact, r.cite);
  for (const r of D.createFlow) add("screen_flow", String(r.step).padStart(2, "0"), `Create step ${r.step}`, `${r.what}${r.gate ? ` Gate: ${r.gate}` : ""}`, r.cite);
  for (const r of D.menuGates) add("screen_menu", slug(r.option, 40), r.option, r.flag, r.cite);
  for (const r of D.units) add("screen_unit", slug(r.fact, 40), r.fact.slice(0, 90), r.fact, r.cite);
  for (const r of D.fieldRendering)
    add("screen_field", slug(r.widgetType, 40), r.widgetType, `${r.component}. Honours: ${(r.honours ?? []).join(", ")}. Client check: ${r.clientValidation}${r.message ? ` Message: ${r.message}` : ""}`, r.cite);

  // unique ids
  const seen = new Map<string, number>();
  for (const r of rows) {
    const n = (seen.get(r.id) ?? 0) + 1;
    seen.set(r.id, n);
    if (n > 1) r.id = `${r.id}_${n}`;
  }

  const anatomy: Anatomy = {
    meta: {
      title: "How a Procol sourcing event works",
      backendRef: "procol-backend@origin/main ae36e86894",
      dashboardRef: "procol-client-dashboard@feat/mvvm-orders-only 9776df3cd (working tree)",
      builtAt: new Date().toISOString(),
      citationFormat: "backend paths are app/, lib/, config/, db/; dashboard paths start with 'dashboard src/'",
      note: "Every row cites the lines it was read from. Anything marked unverified was inferred from reading code, not exercised live.",
    },
    compositions: {
      allowed: [
        { id: "rfq_only", stages: ["rfq"], plain: "One price-quote round." },
        { id: "rfp_only", stages: ["rfp"], plain: "One technical round; a live RFP-only event can later get an RFQ added (when the client allows it)." },
        { id: "rfp_rfq", stages: ["rfp", "rfq"], plain: "Technical round then price round; the technical round must end no later than the price round (712)." },
        { id: "rfq_then_auction", stages: ["rfq", "rfq_then_auction"], plain: "RFQ converted into an auction: quotes become opening bids, the RFQ is ended and locked." },
        { id: "rfp_rfq_then_auction", stages: ["rfp", "rfq", "rfq_then_auction"], plain: "Technical, then RFQ, then the RFQ converted to an auction (composed from the rules; not run live)." },
        { id: "auction_only", stages: ["auction"], plain: "A direct auction with no RFQ before it." },
        { id: "rfp_auction", stages: ["rfp", "auction"], plain: "Technical round then a direct auction (composed from the rules; not run live)." },
      ],
      refused: [
        {
          id: "rfq_plus_auction",
          plain: "An RFQ and a direct auction side by side in one event: the screen blocks it and the purchase-request route refuses it (15); the plain stage-create call does NOT (a gap).",
          cites: ["app/services/event_groups/pr_to_erfx_service.rb:27", "dashboard src/views/projectCreation/projectCreation.jsx:3068"],
        },
        {
          id: "duplicate_mode",
          plain: "Two stages of the same kind in one event: refused on a live event (830); on a draft event the older one is silently replaced (854 when there are two).",
          cites: ["app/controllers/concerns/trade_controller_helper.rb:3644-3665"],
        },
        { id: "more_than_two_on_screen", plain: "More than two stages when building on the screen ('+' is disabled at two).", cites: ["dashboard src/views/projectCreation/projectCreation.jsx:3059-3236"] },
      ],
    },
    rows,
  };
  writeFileSync(ANATOMY_FILE, JSON.stringify(anatomy, null, 1));
  return anatomy;
}
