/**
 * SET UP BY API, TEST ON THE SCREEN (docs/ui-automation-design.md §2).
 *
 * A senior QA prepares the test data the quickest way and then exercises only
 * the screen under test. This module builds a case's starting state through the
 * API journey (src/checks/eventJourney.ts — the same calls, guarded senders and
 * vendors the API runs use) and returns what the browser needs to open
 * the right screen already in that state: the event's ids and the values the
 * API sent, so a screen assertion can compare against them.
 *
 * States (each one a prefix of the journey's own step order):
 *   none        nothing is built — the screen is the events list or a new create screen
 *   draft       a draft event with one pricing round (RFQ)
 *   live        that event published, bidding open for an hour
 *   bid         live, and one invited vendor has submitted a bid
 *   closed      the bidding window has ended after the vendor's bid
 *   proposal    closed, and the buyer has a DRAFT award proposal with the line allocated
 *   awarded     closed, and the buyer has awarded it
 *   converted   a published RFQ with the vendor's bid, converted into a live auction
 * With `technical: true` the event also carries a technical (RFP) round first.
 *
 * States added 10 Nov 2026 (the ones the screen cases name and the set-up could not build):
 *   two_invited live, with a SECOND QA vendor invited (nobody has bid)
 *   two_bids    live, and TWO QA vendors have each submitted their own bid
 *   uninvited   live with one QA vendor invited; the context's vendor is a QA vendor the event does NOT have,
 *               so a vendor-side case can try to open it as that vendor (the invited one is in values.invitedVendorName)
 *   withdrawn   published, then withdrawn by the buyer with a remark (PATCH status withdrawn)
 *   amended     live with the vendor's bid, then a NEW VERSION issued and published — the context opens the OLD
 *               version (v1, no longer the latest); the new one is in made.newVersionEventUuid
 *   amendment   the same build, but the context opens the NEW published version (the amendment itself)
 *   dutch       a live DUTCH auction round (buy side: start price below the end price, the price climbs by the tick)
 *   knockout    a live KNOCKOUT auction round (Procol's name for the Japanese / accept-the-price auction)
 *   forward     a live FORWARD auction round (order_type "sell": the price climbs, the best bid is the highest)
 *   masked      live with the vendor's bid and VENDOR MASKING on for the round (is_vendor_masking_enabled on the stage;
 *               the company's is_vendor_masking_allowed_for_everyone makes it count — read on DEMO 10 Nov: on)
 *   closed_two_bids (12 Nov) the bidding window CLOSED after TWO QA vendors each submitted their own bid — the awarding
 *               cases' "a closed RFQ where Vendor A quoted 100 and Vendor B quoted 90"
 *   pr_rfq      a live RFQ made from an open purchase request's material line (the journey's fromPr: the line's own
 *               product, unit and open quantity, linked by pr_line_item_uuid) — values.prNo names the PR
 *
 * Vendors: the journeys' rule (Aanya, 2026-10-09; for these states 2026-10-20):
 * the event goes to the vendors Procol suggests for its product — each gets
 * Procol's invitation email — and the first of them who can sign in bids. With
 * SPINE_QA_VENDORS_ONLY=1 only the client's QA test vendor (qa_…@example.com),
 * and the build refuses without one. Every event is titled QA_Platform_UI_….
 * Bounded: the whole build has a time limit; a build that does not finish is
 * reported as "could not build the state" (a couldn't-tell, never a failure).
 */
import type { AuctionStrategy } from "./uiCasePrep.js";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { openClientContext, PROCOL_TEST } from "../executor.js";
import { decodeId, encodeId } from "../checks/procolIds.js";
import { runEventJourney } from "../checks/eventJourney.js";
import { journeyPlan } from "../checks/journeyModel.js";
import { withWatchdog } from "../checks/resilience.js";
import { qaVendorsOnly } from "../checks/eventVendors.js";
import { qaVendorsFor } from "../checks/matrixVendors.js";

export type UiState =
  | "none" | "draft" | "upcoming" | "live" | "bid" | "closed" | "proposal" | "awarded" | "converted"
  | "two_invited" | "two_bids" | "closed_two_bids" | "uninvited" | "withdrawn" | "amended" | "amendment" | "dutch" | "knockout" | "forward" | "masked" | "pr_rfq"
  // In-Principle Approval (18 Nov 2026, ipaStates.ts): a closed RFQ with two quotes, and the approval raised / approved by step 1 /
  // approved by both (RFQ 2 in Draft) / rejected at step 2 / rejected at step 1
  | "ipa_pending" | "ipa_step1" | "ipa_approved" | "ipa_rejected" | "ipa_rejected_step1";

/**
 * The event's shape when the case states it (12 Nov): its line items, the quantity on each, and each bidder's
 * price per unit in bidding order — "a closed RFQ for 10 units where Vendor A quoted 100 and Vendor B quoted 90"
 * is {quantity:10, prices:[100, 90]}. Vendor A is the first QA vendor, Vendor B the second.
 */
export interface StateShape {
  lines?: number;
  quantity?: number;
  prices?: number[];
  /** the product the case names — resolved against the company's catalog by name */
  product?: string;
  /** GST % every bid quotes (18 Nov 2026: "₹480 + 15% tax on 10 gms = ₹5,520") */
  gst?: number;
  /** the delivery location the case names ("AES NOIDA HO") — the company's buyer hub of that name */
  location?: string;
  /** the RFQ's pricing template by name ("Buy Template") */
  template?: string;
  /** QA vendors invited besides the bidders who never quote ("ads": invited, never quotes) */
  idleInvitees?: number;
  /** the In-Principle workflow the ipa_* states raise the approval with (default "QA_Platform IPA 2-step") */
  ipaFlow?: string;
  /** the reason the rejecting approver gives in ipa_rejected (default the sheet's "Budget frozen for this quarter") */
  rejectReason?: string;
  /** the event's exact title ("QA IPA IPA-SUB-017") — a sheet profile names its events after the case */
  title?: string;
}
export const UI_STATES: UiState[] = [
  "none", "draft", "live", "bid", "closed", "proposal", "awarded", "converted",
  "two_invited", "two_bids", "closed_two_bids", "uninvited", "withdrawn", "amended", "amendment", "dutch", "knockout", "forward", "masked", "pr_rfq",
  "ipa_pending", "ipa_step1", "ipa_approved", "ipa_rejected", "ipa_rejected_step1",
];
/** The In-Principle Approval states: closed_two_bids, then the approval (ipaStates.ts). */
export const IPA_STATES = new Set<UiState>(["ipa_pending", "ipa_step1", "ipa_approved", "ipa_rejected", "ipa_rejected_step1"]);

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
  /** the bidding vendor's login email — for a vendor-portal step */
  vendorEmail?: string;
  /** the buyer user the API signed in as (the browser signs in as the same user) */
  buyerUserId?: number;
  /** the OTHER QA vendor on the build: the second bidder (two_bids / two_invited) or the invited one (uninvited) */
  otherVendorName?: string;
  otherVendorEmail?: string;
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
  // a published RFQ with the vendor's bid, converted into a live auction (the vendor bids in it too)
  converted: "convert_auction",
  two_invited: "read_back",
  // the LAST bid_submit of the plan (the second vendor's)
  two_bids: "bid_submit",
  closed_two_bids: "wait_close",
  uninvited: "read_back",
  withdrawn: "read_back",
  amended: "bid_submit",
  amendment: "bid_submit",
  dutch: "read_back",
  knockout: "read_back",
  forward: "read_back",
  masked: "bid_submit",
  pr_rfq: "read_back",
  ipa_pending: "wait_close",
  ipa_step1: "wait_close",
  ipa_approved: "wait_close",
  ipa_rejected: "wait_close",
  ipa_rejected_step1: "wait_close",
};

/** The states that are a live AUCTION round of a particular kind (the plan builds an auction, not an RFQ). */
const AUCTION_VARIANT: Partial<Record<UiState, "dutch" | "knockout" | "forward">> = { dutch: "dutch", knockout: "knockout", forward: "forward" };
/** The states that invite a second QA vendor besides the one that bids. */
const WANTS_SECOND_VENDOR = new Set<UiState>(["two_invited", "two_bids", "closed_two_bids", "dutch", "knockout", "forward", "ipa_pending", "ipa_step1", "ipa_approved", "ipa_rejected", "ipa_rejected_step1"]);
/** The states in which two QA vendors each place their own bid. */
const TWO_BIDDERS = new Set<UiState>(["two_bids", "closed_two_bids", "ipa_pending", "ipa_step1", "ipa_approved", "ipa_rejected", "ipa_rejected_step1"]);

/**
 * The dutch / knockout strategy of a QA_Platform round, on the TOTAL amount (not the base price), as the
 * backend validates it (trade_controller_helper set_configurations_for_trade, 10 Nov): bulk_price > 0,
 * time_difference ≥ 30 s and within the round, price_difference ≤ end − start on the buy side, dutch
 * start (bulk) ≤ end. Sized around the journey's own bid (price × quantity) so a later conversion check
 * (L1 above the start, 966/968) would hold too.
 */
export function strategyFor(kind: "dutch" | "knockout", bidTotal: number): Record<string, unknown> {
  const start = Math.max(100, Math.round(bidTotal * 0.6));
  const tick = Math.max(10, Math.round(bidTotal * 0.05));
  const base = { auction_config: kind, bulk_price: start, price_difference: tick, time_difference: 120, is_auction_on_base_price: false, dynamic_closing_time_strategy: "price_based" };
  return kind === "dutch" ? { ...base, end_price: Math.max(start + tick, Math.round(bidTotal * 0.9)), closing_mode: "single" } : base;
}

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

/** Another QA test vendor of the client (not the one the client context bids as), with a login; null when there is none. */
/**
 * A delivery location or pricing template of this company, by the name the case gives (exact, ignoring case and
 * spacing; then the only one that contains it). SELECT only. 18 Nov 2026 — "AES NOIDA HO", "Buy Template" on Amity.
 */
async function rowByName(kind: "location" | "template", companyId: number, name: string): Promise<{ id: number; name: string } | null> {
  const { query } = await import(pathToFileURL(join(PROCOL_TEST, "src", "db/pool.ts")).href);
  const rows: Array<{ id: number; name: string }> =
    kind === "location"
      ? await query(`select id, name from buyer_hubs where company_id = $1 and status = 1 and name ilike $2 order by id`, [companyId, `%${name.trim()}%`])
      : await query(
          `select id, name from templates where (company_id = $1 or company_id is null) and status = 1 and 't-trade' = any(type_identifier) and name ilike $2 order by company_id nulls last, id`,
          [companyId, `%${name.trim()}%`],
        );
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
  const exact = rows.find((r) => norm(r.name) === norm(name));
  return exact ?? (rows.length === 1 ? rows[0] : null);
}

/** The company's active product of exactly this name (ignoring case) and its first active variant. SELECT only. */
async function productByName(companyId: number, name: string): Promise<{ id: number; name: string; variantId: number } | null> {
  const { query } = await import(pathToFileURL(join(PROCOL_TEST, "src", "db/pool.ts")).href);
  const rows: Array<{ id: number; name: string; variant_id: number }> = await query(
    `select p.id, p.name, (select q.id from product_qualities q where q.product_id = p.id and q.status = 1 order by q.id limit 1) as variant_id
       from products p where p.company_id = $1 and p.status = 1 and lower(trim(p.name)) = lower(trim($2)) order by p.id limit 1`,
    [companyId, name],
  );
  const r = rows[0];
  return r?.variant_id ? { id: Number(r.id), name: r.name, variantId: Number(r.variant_id) } : null;
}

async function secondQaVendor(companyId: number, client: any): Promise<{ companyUuid: string; email: string; name: string } | null> {
  const first = String(client?.ctx?.vendor?.uuid ?? "");
  const all = await withWatchdog(qaVendorsFor(companyId, client?.ctx?.buyerApi, 6), 60_000, "listing the client's QA vendors").catch(() => []);
  const other = all.find((v) => v.vendorCompanyUuid && v.vendorCompanyUuid !== first && /^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i.test(v.email ?? ""));
  return other ? { companyUuid: other.vendorCompanyUuid, email: other.email, name: other.name || other.email } : null;
}

/**
 * An open purchase request with a material line that still has quantity to put on an event, as the API plan
 * runner picks one (apiPlanRunner.ts pickPrLines, 27 Oct): the console's Purchase Cart → Create Project data.
 */
async function openPrLine(api: any): Promise<{ prUuid: string; prNo?: string; lines: Array<{ uuid: string; productUuid: string; qualityUuid: string; unit: string; qty: number; hubUuid?: string; name?: string; productCode?: string; itemNo?: string }> } | { why: string }> {
  const q = encodeURIComponent(JSON.stringify({ status: ["active"] }));
  const r = await send(api, "GET", `/purchase_requests?page=1&page_size=50&filters=${q}&tab=active`);
  if (!r.ok) return { why: `the open purchase requests could not be read: ${r.error}` };
  const prs: any[] = r.data?.purchase_requests ?? (Array.isArray(r.data) ? r.data : []);
  const usable = (l: any) => l?.uuid && l?.product_uuid && l.status === "active" && l.line_item_type === "material" && Number(l.quantity_open) > 0 && !l.dormant_locked && l?.data?.uom;
  const pick = prs.map((p) => ({ p, ls: (p?.line_items ?? []).filter(usable) })).find((x) => x.p?.uuid && x.ls.length >= 1);
  if (!pick) return { why: "no open purchase request on the first page has a material line with quantity left to put on an event" };
  const l = pick.ls[0];
  const prod = await send(api, "GET", `/products/${encodeURIComponent(l.product_uuid)}`);
  const p = prod.data?.product ?? prod.data;
  const quality = p?.variants?.[0]?.uuid;
  if (!quality) return { why: `the product of PR ${pick.p?.data?.prNo ?? "?"}'s line has no variant to put on an event` };
  return {
    prUuid: String(pick.p.uuid),
    prNo: pick.p?.data?.prNo ? String(pick.p.data.prNo) : undefined,
    lines: [{ uuid: String(l.uuid), productUuid: String(l.product_uuid), qualityUuid: String(quality), unit: String(l.data.uom), qty: Number(l.quantity_open), ...(l.buyer_hub_uuid ? { hubUuid: String(l.buyer_hub_uuid) } : {}), name: String(p?.name ?? l?.data?.shortText ?? l.product_uuid), ...(l.product_code ? { productCode: String(l.product_code) } : {}), ...(l?.data?.prLno ? { itemNo: String(l.data.prLno) } : {}) }],
  };
}

/** Pull the values a screen should show out of what the journey sent. */
function valuesFrom(journey: any, client: any, vendorName?: string): Record<string, string> {
  const v: Record<string, string> = {};
  if (journey?.title) v.title = String(journey.title);
  const vendor = vendorName ?? client?.ctx?.vendor?.name;
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
      // the round's variant, as sent (10 Nov): strategy, prices, tick, side, masking
      if (c.auction_config) v.strategy = String(c.auction_config);
      if (c.order_type) v.orderType = String(c.order_type);
      if (c.bulk_price !== undefined && c.bulk_price !== null) v.startPrice = String(c.bulk_price);
      if (c.end_price !== undefined && c.end_price !== null && c.auction_config === "dutch") v.endPrice = String(c.end_price);
      if (c.price_difference !== undefined && c.price_difference !== null) v.tick = String(c.price_difference);
      if (c.time_difference !== undefined && c.time_difference !== null) v.roundStepSeconds = String(c.time_difference);
      if (c.closing_mode && c.auction_config === "dutch") v.closingMode = String(c.closing_mode);
      if (c.is_vendor_masking_enabled === true) v.vendorMasking = "on";
    }
    // the vendor's sheet: sheets.inline_components.data.<company>[0].{price,total_amount}.value
    if (s.kind === "bid_products") {
      const rows = body?.sheets?.inline_components?.data;
      const row = rows && typeof rows === "object" ? (Object.values(rows)[0] as any[])?.[0] : undefined;
      // the first vendor's bid stays bidPrice; a later vendor's becomes bidPrice2 (two_bids)
      const k = v.bidPrice === undefined ? "" : "2";
      if (row?.price?.value !== undefined && row.price.value !== null) v[`bidPrice${k}`] = String(row.price.value);
      if (row?.total_amount?.value !== undefined && row.total_amount.value !== null) v[`bidTotal${k}`] = String(row.total_amount.value);
    }
  }
  for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
  return v;
}

/** One request through the buyer's guarded sender, as the journey fires them. */
async function send(api: any, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    const r = await api.attempt(method, path, body === undefined ? {} : { body });
    return { ok: !!r?.ok, status: Number(r?.status) || 0, data: r?.data, error: r?.ok ? undefined : String(r?.errorMessage ?? r?.errorCode ?? `HTTP ${r?.status}`) };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: (e as Error).message };
  }
}

const WITHDRAW_REMARK = "QA_Platform set-up: withdrawn by the API set-up so a screen case can start from a withdrawn event";
const AMEND_REMARK = (stamp: number) => `QA_Platform_${stamp} amendment issued by the API set-up`;

/**
 * Withdraw the published event the way the console does (projectDetails › withdrawProjectModal):
 * PATCH /event_groups/:uuid {status: "withdrawn", withdraw_remark}. Read back to confirm.
 */
async function withdrawEvent(api: any, eventGroupUuid: string, onLine?: (l: string) => void): Promise<{ ok: boolean; why?: string; status?: string; details?: unknown }> {
  const r = await send(api, "PATCH", `/event_groups/${eventGroupUuid}`, { status: "withdrawn", withdraw_remark: { remarks: WITHDRAW_REMARK, attachments: [] } });
  if (!r.ok) return { ok: false, why: `the withdraw was refused: ${r.error}` };
  const back = await send(api, "GET", `/event_groups/${eventGroupUuid}`);
  const status = String(back.data?.status ?? r.data?.status ?? "");
  const details = back.data?.withdraw_details;
  onLine?.(`withdrawn: the event reads back as "${status}"${details ? ` with withdraw details (${JSON.stringify(details).slice(0, 120)})` : ""}`);
  return status === "withdrawn" ? { ok: true, status, details } : { ok: false, why: `after the withdraw the event reads back as "${status || "unknown"}", not withdrawn`, status };
}

/**
 * Issue a new version of the event (POST /item_versions — the journey's own "version" call) and publish
 * the copy (PATCH /event_groups/:new status active with amendment_remarks), so the original is an OLD
 * version beside a newer, published one. The original stops being the latest the moment the version
 * exists (versioning/methods.rb latest?); a copy that will not publish still leaves that true, and is said.
 */
export async function amendEvent(
  api: any,
  eventGroupUuid: string,
  title: string,
  audience: string[],
  onLine?: (l: string) => void,
): Promise<{ ok: boolean; why?: string; newUuid?: string; newTrades?: string[]; newStatus?: string; oldRef?: string; newRef?: string; oldIsLatest?: unknown; versionUuid?: string; published: boolean }> {
  const v = await send(api, "POST", "/item_versions", { item_uuid: eventGroupUuid, item_type: "EventGroup" });
  if (!v.ok) return { ok: false, why: `the new version was refused: ${v.error}`, published: false };
  const newUuid = v.data?.new_item_data?.uuid ? String(v.data.new_item_data.uuid) : undefined;
  const newTrades: string[] = Array.isArray(v.data?.new_item_data?.trade_uuids) ? v.data.new_item_data.trade_uuids.map(String) : [];
  if (!newUuid) return { ok: false, why: "the version reply carried no new copy of the event", published: false };
  onLine?.(`a new version of the event exists (${newTrades.length} round${newTrades.length === 1 ? "" : "s"} copied); publishing it`);
  const pub = await send(api, "PATCH", `/event_groups/${newUuid}`, {
    attachments: [],
    title,
    status: "active",
    draft_trade_request_uuids: newTrades,
    audience_company_uuids: audience,
    line_items: [],
    terms_and_conditions: { clauses: [], attachments: [] },
    show_under_open_events: true,
    delete_draft_stage_uuids: [],
    amendment_remarks: { remarks: AMEND_REMARK(Date.now()) },
  });
  const oldBack = await send(api, "GET", `/event_groups/${eventGroupUuid}`);
  const newBack = await send(api, "GET", `/event_groups/${newUuid}`);
  const newStatus = String(newBack.data?.status ?? pub.data?.status ?? "");
  // the app labels versions on the rounds: RFQ-24264 on the original, RFQ-24264.1 on the amendment (read 10 Nov)
  const refOf = (d: any) => (Array.isArray(d?.stages) ? d.stages.map((st: any) => st?.ref_id).filter(Boolean).join(", ") : "") || (d?.ref_id ? String(d.ref_id) : "");
  const oldRef = refOf(oldBack.data) || undefined;
  const newRef = refOf(newBack.data) || undefined;
  const oldIsLatest = oldBack.data?.is_latest_version;
  if (!pub.ok) {
    onLine?.(`the new version would not publish (${pub.error}); it stays a draft version — the original is no longer the latest either way`);
    return { ok: true, newUuid, newTrades, newStatus: newStatus || "draft", oldRef, newRef, oldIsLatest, versionUuid: v.data?.uuid ? String(v.data.uuid) : undefined, published: false, why: pub.error };
  }
  onLine?.(`amended: ${oldRef ?? "the original"} is now an old version (is_latest_version ${JSON.stringify(oldIsLatest)}); ${newRef ?? "the new version"} reads back as "${newStatus}"`);
  return { ok: true, newUuid, newTrades, newStatus, oldRef, newRef, oldIsLatest, versionUuid: v.data?.uuid ? String(v.data.uuid) : undefined, published: newStatus === "active" };
}

/** What the pricing round reads back as (strategy, side, masking) — for the build's own check. */
async function readRound(api: any, tradeUuid: string): Promise<{ auctionConfig?: string; orderType?: string; masking?: boolean; status?: string; rfxMode?: string; dynamic?: { on: boolean; trigger?: number; extend?: number; top?: number; strategy?: string }; trafficLight?: string }> {
  const r = await send(api, "GET", `/trade/${tradeUuid}`);
  const d = r.data ?? {};
  const t = d.trade_request ?? d.trade ?? d;
  // the app's own read puts trade_request.config under `trade_config` (16 Nov: /trade/:id → trade_config.is_dynamic_closing_time_allowed …)
  const cfg = t.trade_config ?? d.trade_config ?? t.config ?? d.config ?? {};
  // the strategy keys as Procol holds them (trade_request.config): the dynamic time extension and the traffic light
  const pick = (k: string) => cfg[k] ?? t[k] ?? d[k];
  const dteOn = pick("is_dynamic_closing_time_allowed");
  return {
    auctionConfig: t.auction_config ?? d.auction_config ?? cfg.auction_config,
    orderType: t.order_type ?? d.order_type,
    masking: cfg.is_vendor_masking_enabled ?? t.is_vendor_masking_enabled ?? d.is_vendor_masking_enabled,
    status: t.status ?? d.status,
    rfxMode: t.rfx_mode ?? d.rfx_mode,
    ...(dteOn !== undefined ? { dynamic: { on: dteOn === true || dteOn === "true", trigger: Number(pick("last_n_minutes_for_time_extension")) || undefined, extend: Number(pick("time_extension_value")) || undefined, top: Number(pick("rank_limit_for_time_extension")) || undefined, strategy: pick("dynamic_closing_time_strategy") } } : {}),
    ...(pick("traffic_light_based_on_rank_or_price") || pick("traffic_light_config") ? { trafficLight: String(pick("traffic_light_based_on_rank_or_price") ?? pick("traffic_light_config")) } : {}),
  };
}

export async function buildUiState(
  companyId: number,
  state: UiState,
  opts: { technical?: boolean; auction?: boolean; budgetMs?: number; onLine?: (l: string) => void; shape?: StateShape; strategy?: AuctionStrategy; /** the event's exact title ("QA IPA <case id>") */ title?: string } = {},
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
  // The event's own vendors unless the run is QA-only (eventVendors.ts qaVendorsOnly).
  const eventVendors = !qaVendorsOnly(companyId);
  const email = String(client?.ctx?.vendor?.email ?? "");
  if (!eventVendors && !/^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i.test(email)) {
    return { ok: false, why: `client ${companyId} has no QA test vendor to bid with (${client?.ctx?.noQaVendor ?? "none configured"}) — refusing to build with a real supplier` };
  }
  // A second QA vendor, where the state needs one (invited beside the first; for two_bids it bids too).
  // Only QA vendors: these states never go to Procol's suggested (real) vendors.
  let second: { companyUuid: string; email: string; name: string } | null = null;
  // a traffic-light round is about what EACH vendor's zone shows: a second QA vendor is invited so a flow can sign in
  // as another bidder (17 Nov, FL4: "a second vendor's own portal session is unavailable")
  const wantsSecond = WANTS_SECOND_VENDOR.has(state) || (!!opts.strategy?.trafficLight && ["live", "bid", "closed"].includes(state));
  if (wantsSecond || state === "uninvited") {
    second = await secondQaVendor(companyId, client);
    if (!second && !eventVendors) {
      // An empty list from a long-lived sign-in is not "no second vendor" (Amity, 18 Nov 2026: three QA vendors
      // active in the DB, the cached buyer context's lookups came back empty after ~3 h): sign in afresh, ask again.
      clients.delete(companyId);
      client = await withWatchdog(clientFor(companyId), 120_000, "signing in to the client again").catch(() => client);
      second = await secondQaVendor(companyId, client);
    }
    if (!second && (TWO_BIDDERS.has(state) || state === "two_invited" || state === "uninvited"))
      return { ok: false, why: `client ${companyId} has only one QA test vendor with a login — the ${state} state needs a second one (QA vendors only; a real supplier is never invited)` };
    if (second) opts.onLine?.(state === "uninvited" ? `${second.name} is the QA vendor the event will NOT be sent to` : `${second.name} is the second QA vendor on the event${TWO_BIDDERS.has(state) ? " and bids after the first" : ""}`);
  }
  // An RFQ from a purchase request: the PR line is picked first, so a company without an open PR is said plainly.
  let fromPr: Exclude<Awaited<ReturnType<typeof openPrLine>>, { why: string }> | undefined;
  if (state === "pr_rfq") {
    const pr = await withWatchdog(openPrLine(client.ctx.buyerApi), 60_000, "finding an open purchase request").catch((e) => ({ why: (e as Error).message }));
    if ("why" in pr) return { ok: false, why: `the pr_rfq state needs an open purchase request on client ${companyId}: ${pr.why}` };
    fromPr = pr;
    opts.onLine?.(`the event is made from PR ${pr.prNo ?? pr.prUuid.slice(0, 6) + "…"}'s line "${pr.lines[0].name ?? ""}" (${pr.lines[0].qty} ${pr.lines[0].unit} open)`);
  }
  const variant = AUCTION_VARIANT[state];
  // an auction case gets a live auction round (behind a technical round when it needs one)
  const wantsAuction = !!opts.auction || !!variant;
  const plan = journeyPlan(
    [wantsAuction ? (technical ? "events.rfp_auction" : "events.auction_only") : technical ? "events.rfp_rfq" : "events.rfq_only", ...(state === "converted" ? ["auction.convert"] : [])],
    { bidders: TWO_BIDDERS.has(state) ? 2 : 1 },
  );
  const stop = state === "two_bids" ? plan.steps.lastIndexOf(PREFIX[state] as any) : plan.steps.indexOf(PREFIX[state] as any);
  const shape: StateShape = { ...(opts.shape ?? {}) };
  // two bidders with no prices named: different prices, so the round has a ranking to judge (16 Nov, SRC-STR-010:
  // both QA vendors bid the journey's default and Master QCS showed a tie, "Rank 2 and 2")
  // a dynamic-extension round's first bid is 100 when the case names none: a later "late bid" (95 in the cases) must
  // IMPROVE it to trigger the extension (17 Nov: the API bid was 73, the late 95 was higher, nothing extended)
  if (opts.strategy?.dynamic && !TWO_BIDDERS.has(state) && !shape.prices?.length && ["bid", "closed", "proposal", "awarded"].includes(state)) {
    shape.prices = [100];
    opts.onLine?.("the vendor's first bid is 100 per unit (a later late bid below it is an improvement, which is what triggers the extension)");
  }
  if (TWO_BIDDERS.has(state) && !shape.prices?.length) {
    shape.prices = [100, 90];
    opts.onLine?.("the two bidders bid 100 and 90 per unit (the case names no prices; different prices give the round a ranking)");
  }
  if (shape.prices?.length || shape.quantity || (shape.lines ?? 1) > 1)
    opts.onLine?.(`the event is built as the case describes it: ${shape.lines && shape.lines > 1 ? `${shape.lines} line items, ` : ""}${shape.quantity ? `${shape.quantity} units each, ` : ""}${shape.prices?.length ? `bids of ${shape.prices.join(" and ")} per unit, in that order` : ""}`.replace(/, $/, ""));
  if (stop < 0) return { ok: false, why: `the journey has no step "${PREFIX[state]}" for state ${state}` };
  plan.steps = plan.steps.slice(0, stop + 1);
  // A technical event's vendor answers the technical round too before the pricing bid.
  // States that must stay open get an hour; closed/awarded get a short window the run can wait out
  // — 3 minutes, not 75 s: on 23 Oct (C04) one vendor GET took 30 s on UAT and the bid arrived after
  // a 75 s round had closed ("Order not active"), so the state was never built.
  let stageSeconds = state === "closed" || state === "closed_two_bids" || IPA_STATES.has(state) || state === "proposal" || state === "awarded" ? (TWO_BIDDERS.has(state) ? 300 : 180) : 3600;
  // a dynamic time extension's trigger must stay under HALF the bidding time (trade_controller_helper ~3085, 501
  // "Invalid Trigger Time for Dynamic Time Extension."): a short closed-state window grows to fit it (17 Nov, FL5)
  if (opts.strategy?.dynamic) {
    const need = opts.strategy.dynamic.triggerMinutes * 2 * 60 + 60;
    if (stageSeconds < need) { opts.onLine?.(`the bidding window is ${Math.round(need / 60)} min so the ${opts.strategy.dynamic.triggerMinutes}-minute trigger stays under half of it`); stageSeconds = need; }
    // a LIVE round with the extension on is there to be bid on in its last minutes: an hour-long window would make
    // the run wait out most of an hour (17 Nov, FL3 hit the browser test's own 12-minute limit) — a short one, just
    // over twice the trigger, keeps the trigger valid and the wait minutes long
    else if (stageSeconds >= 3600) { stageSeconds = need + 60; opts.onLine?.(`the bidding window is ${Math.round(stageSeconds / 60)} min (the extension's last minutes come inside the run)`); }
  }
  // The round's variant, written into the stage body just before it is sent (JourneyRunOptions.stageBody).
  // the case's own quantity and first price when it names them (17 Nov: traffic-light bounds sized on 100 × 50 put a
  // bid of 100 on quantity 10 in the green zone where the PRD said yellow); else the sibling test data's default
  const bidTotal = (shape.prices?.[0] ?? 100) * (shape.quantity ?? 50);
  const strategy = opts.strategy;
  const stageBody =
    variant || state === "masked" || (wantsAuction && strategy)
      ? (body: Record<string, any>, stage: string) => {
          if (stage === "rfp") return;
          body.configurations ??= {};
          if (variant === "forward") body.configurations.order_type = "sell";
          if (variant === "dutch" || variant === "knockout") Object.assign(body.configurations, strategyFor(variant, bidTotal));
          if (state === "masked") body.configurations.is_vendor_masking_enabled = true;
          // the case's own strategy on the auction round (16 Nov, SRC-STR-010 / 006): the keys the backend reads
          // (trade_request.config — bid.rb dynamic_extension_needed, trade_controller_helper get_config_for_new_trade)
          if (stage === "auction" && strategy?.dynamic) {
            Object.assign(body.configurations, {
              is_dynamic_closing_time_allowed: true,
              dynamic_closing_time_strategy: strategy.dynamic.on === "rank" ? "rank_based" : "price_based",
              last_n_minutes_for_time_extension: strategy.dynamic.triggerMinutes,
              time_extension_value: strategy.dynamic.extendByMinutes,
              rank_limit_for_time_extension: strategy.dynamic.topBids,
            });
          }
          if (stage === "auction" && strategy?.trafficLight) {
            // the keys the backend reads on create (trade_controller_helper ~3078 / ~3204, the same names the console
            // sends — redux/orders/helpers.js): auction_config "traffic_light", traffic_light_config "price" | "rank",
            // traffic_light_ranges {lower_bound, upper_bound} on the lot (by price: gross totals, lower < upper on the
            // buy side — sized around the journey's own bids, price × quantity, so the lower bidder is green)
            const lower = strategy.trafficLight.lower ?? (strategy.trafficLight.by === "rank" ? 1 : Math.round(bidTotal * 0.92));
            const upper = strategy.trafficLight.upper ?? (strategy.trafficLight.by === "rank" ? 2 : Math.round(bidTotal * 1.05));
            const keys = { auction_config: "traffic_light", traffic_light_config: strategy.trafficLight.by, traffic_light_ranges: { lower_bound: lower, upper_bound: upper } };
            Object.assign(body.configurations, keys);
            Object.assign(body, keys);
            for (const key of ["trade_products", "products", "line_items"]) {
              if (Array.isArray(body[key])) for (const it of body[key]) if (it && typeof it === "object") it.meta_data = { ...(it.meta_data ?? {}), lower_bound: lower, upper_bound: upper };
            }
          }
        }
      : undefined;
  // The product the case names (shape.product, 17 Nov): the company's catalog is searched by that name and the
  // journey builds the event on it — a flow that reads "CYLINDER WITH KEY & KNOB" on screen cannot hold on the
  // catalog's first product. Not found: said, and the catalog's own product is used.
  let choose: Record<string, unknown> | undefined;
  if (shape.product) {
    const api = client?.ctx?.buyerApi;
    const q = shape.product.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const r0 = api ? await withWatchdog(send(api, "GET", `/products/search?query=${encodeURIComponent(q)}`), 30_000, "searching the product by name").catch(() => ({ ok: false, data: null } as any)) : { ok: false, data: null };
    const products: any[] = r0?.ok ? (r0.data?.products ?? (Array.isArray(r0.data) ? r0.data : [])) : [];
    const norm = (t: unknown) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const hit = products.find((p) => norm(p?.name) === norm(q)) ?? products.find((p) => norm(p?.name).includes(norm(q)) || norm(q).includes(norm(p?.name))) ?? null;
    const variant = hit ? (hit.variants ?? hit.product_qualities ?? [])[0] : null;
    // The search API can miss a product the company does have (18 Nov 2026: Amity's "DAB Hi-Media Make" → 0 results);
    // then the company's own product of exactly that name and its first active variant, read with a SELECT.
    const fromDb = !(hit?.uuid && variant?.uuid) ? await productByName(companyId, q).catch(() => null) : null;
    if (hit?.uuid && variant?.uuid) {
      choose = { productUuid: String(hit.uuid), productQualityUuid: String(variant.uuid) };
      opts.onLine?.(`the event is built on the product the case names: "${hit.name}"${hit.code || hit.product_code ? ` (${hit.code ?? hit.product_code})` : ""}`);
    } else if (fromDb) {
      choose = { productUuid: encodeId(fromDb.id), productQualityUuid: encodeId(fromDb.variantId) };
      opts.onLine?.(`the event is built on the product the case names: "${fromDb.name}" (found in the company's catalog; the search did not list it)`);
    } else opts.onLine?.(`the company's catalog has no product named "${shape.product}" (search found ${products.length}) — the catalog's own first product is used`);
  }
  // The delivery location and pricing template the case names, found by name among the company's own (SELECT).
  for (const [kind, name] of [["location", shape.location], ["template", shape.template]] as const) {
    if (!name) continue;
    const found = await rowByName(kind, companyId, name).catch(() => null);
    if (!found) {
      opts.onLine?.(`the company has no ${kind === "location" ? "delivery location" : "pricing template"} named "${name}" — the catalog's own is used`);
      continue;
    }
    choose = { ...(choose ?? {}), ...(kind === "location" ? { locationUuid: encodeId(found.id) } : { pricingTemplateUuid: encodeId(found.id) }) };
    opts.onLine?.(`the event uses the ${kind === "location" ? "delivery location" : "pricing template"} the case names: "${found.name}"`);
  }
  // QA vendors invited who never quote (after the bidders), so "only the vendors who quoted" can be judged.
  const idle: string[] = [];
  if ((shape.idleInvitees ?? 0) > 0) {
    const taken = new Set([String(client?.ctx?.vendor?.uuid ?? ""), second?.companyUuid ?? ""]);
    const all = await withWatchdog(qaVendorsFor(companyId, client?.ctx?.buyerApi, 8), 60_000, "listing the client's QA vendors").catch(() => []);
    for (const v of all) {
      if (idle.length >= (shape.idleInvitees ?? 0)) break;
      if (v.vendorCompanyUuid && !taken.has(v.vendorCompanyUuid) && /^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i.test(v.email ?? "")) {
        idle.push(v.vendorCompanyUuid);
        opts.onLine?.(`${v.name} is invited too and never quotes`);
      }
    }
    if (idle.length < (shape.idleInvitees ?? 0)) opts.onLine?.(`only ${idle.length} more QA vendor(s) to invite without a quote — asked for ${shape.idleInvitees}`);
  }
  let r: any;
  try {
    r = await withWatchdog(
      runEventJourney(client, plan, {
        stageSeconds,
        ...(choose ? { choose } : {}),
        ...(shape.gst ? { bidGst: shape.gst } : {}),
        // upcoming: published, not yet open — and with a Delivery Date, so the Reschedule
        // dialog shows that field and its "start on or before delivery" rule can be checked
        ...(state === "upcoming" ? { startDelaySec: 30 * 60, deliveryInDays: 2 } : {}),
        titlePrefix: "QA_Platform_UI",
        ...(opts.title || shape.title ? { title: opts.title ?? shape.title } : {}),
        eventVendors,
        ...(second && TWO_BIDDERS.has(state) ? { extraBidders: [second] } : second && wantsSecond ? { alsoInvite: [second.companyUuid] } : {}),
        ...(idle.length ? { alsoInvite: [...(second && wantsSecond && !TWO_BIDDERS.has(state) ? [second.companyUuid] : []), ...idle] } : {}),
        ...(shape.prices?.length ? { bidPrices: shape.prices } : {}),
        ...(shape.quantity ? { quantity: shape.quantity } : {}),
        ...((shape.lines ?? 1) > 1 ? { lineItemCount: shape.lines } : {}),
        ...(stageBody ? { stageBody } : {}),
        ...(fromPr ? { fromPr } : {}),
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
  // On a converted event the screens are about the NEW auction round: its trade uuid is the stage.
  let stageUuid: string | undefined = state === "converted" && made.auctionTradeUuid ? made.auctionTradeUuid : made.pricingTradeUuid;
  // Who the screen should find on the event: the vendor that bid (or, before a bid, the one that would).
  const bidder = eventVendors ? r?.bidder : undefined;
  if (bidder) opts.onLine?.(`the event went to ${r?.invited ?? "the"} vendor(s) Procol suggests; ${bidder.name} is the one that ${["live", "upcoming", "draft"].includes(state) ? "can bid" : "bid"}`);
  let vendorName = bidder?.name ?? client?.ctx?.vendor?.name;
  let vendorEmail: string | undefined = bidder ? bidder.email : email;
  const values = valuesFrom(j, client, vendorName);
  const api = client.ctx.buyerApi;
  let eventGroupUuid: string = made.eventGroupUuid;
  let technicalStageUuid: string | undefined = made.technicalTradeUuid;
  let otherVendorName: string | undefined;
  let otherVendorEmail: string | undefined;

  // ── the states built on top of the journey (10 Nov) ──
  if (second && wantsSecond) {
    otherVendorName = second.name;
    otherVendorEmail = second.email;
    values.secondVendorName = second.name;
    if (TWO_BIDDERS.has(state)) values.bidders = "2";
  }
  if (state === "uninvited" && second) {
    // the context's vendor is the one the event was NOT sent to; the invited one stays in values
    values.invitedVendorName = String(vendorName ?? "");
    values.uninvitedVendorName = second.name;
    otherVendorName = vendorName ? String(vendorName) : undefined;
    otherVendorEmail = vendorEmail;
    vendorName = second.name;
    vendorEmail = second.email;
  }
  if (state === "pr_rfq" && fromPr) {
    values.prNo = fromPr.prNo ?? "";
    values.prLineProduct = fromPr.lines[0].name ?? "";
    values.prLineOpenQuantity = `${fromPr.lines[0].qty} ${fromPr.lines[0].unit}`;
    if (made.prUuid) values.linkedToPr = "yes";
  }
  if (state === "withdrawn") {
    const w = await withWatchdog(withdrawEvent(api, eventGroupUuid, opts.onLine), 90_000, "withdrawing the event").catch((e) => ({ ok: false, why: (e as Error).message } as Awaited<ReturnType<typeof withdrawEvent>>));
    if (!w.ok) return { ok: false, why: `the API build of the withdrawn state stopped: ${w.why}` };
    values.eventStatus = "withdrawn";
    values.withdrawRemark = WITHDRAW_REMARK;
    if (w.details) values.withdrawDetails = JSON.stringify(w.details).slice(0, 300);
  }
  if (state === "amended" || state === "amendment") {
    const audience = [client?.ctx?.vendor?.uuid, second?.companyUuid].filter(Boolean) as string[];
    const a = await withWatchdog(amendEvent(api, eventGroupUuid, String(j.title), audience, opts.onLine), 120_000, "issuing the new version").catch((e) => ({ ok: false, why: (e as Error).message, published: false } as Awaited<ReturnType<typeof amendEvent>>));
    if (!a.ok || !a.newUuid) return { ok: false, why: `the API build of the ${state} state stopped: ${a.why}` };
    made.oldVersionEventUuid = eventGroupUuid;
    made.newVersionEventUuid = a.newUuid;
    if (a.versionUuid) made.versionUuid = a.versionUuid;
    if (a.newTrades?.length) made.newVersionTradeUuids = a.newTrades.join(",");
    if (a.oldRef) values.oldVersionRef = a.oldRef;
    if (a.newRef) values.newVersionRef = a.newRef;
    if (a.oldIsLatest !== undefined) values.oldVersionIsLatest = String(a.oldIsLatest);
    values.newVersionStatus = a.newStatus ?? "";
    values.amendmentRemark = a.published ? "QA_Platform amendment issued by the API set-up" : "";
    if (state === "amendment") {
      if (!a.published) return { ok: false, why: `the new version of the event was issued but would not publish (${a.why ?? "no reason given"}) — the amendment state needs the published copy` };
      eventGroupUuid = a.newUuid;
      // the copy's rounds, in the original's order (technical first when there is one)
      const nt = a.newTrades ?? [];
      technicalStageUuid = technical && nt.length > 1 ? nt[0] : undefined;
      stageUuid = nt.length ? nt[nt.length - 1] : undefined;
    }
  }
  if (variant || state === "masked") {
    // the round as Procol holds it — the strategy / side / masking the screen should show
    const round = stageUuid ? await withWatchdog(readRound(api, stageUuid), 60_000, "reading the round back").catch(() => ({} as Awaited<ReturnType<typeof readRound>>)) : {};
    if (round.auctionConfig) values.strategyReadBack = String(round.auctionConfig);
    if (round.orderType) values.orderTypeReadBack = String(round.orderType);
    if (round.masking !== undefined) values.vendorMaskingReadBack = round.masking ? "on" : "off";
    const expect = variant === "forward" ? round.orderType === "sell" : variant ? round.auctionConfig === variant : round.masking === true;
    const what = variant === "forward" ? `order type "${round.orderType ?? "?"}"` : variant ? `strategy "${round.auctionConfig ?? "?"}"` : `vendor masking ${round.masking === undefined ? "not readable on the round" : round.masking ? "on" : "off"}`;
    opts.onLine?.(`the round reads back with ${what}`);
    if (!expect && (variant || round.masking !== undefined))
      return { ok: false, why: `the API build of the ${state} state stopped: the round was created but reads back with ${what} (the app did not keep the ${variant ?? "masking"} setting)` };
  }

  // The strategy the case named must have TAKEN on the round, or the case would run on a plain auction and prove
  // nothing about it (16 Nov: the first traffic-light build kept none of the guessed keys) — read it back and say.
  if (strategy && stageUuid) {
    const round = await withWatchdog(readRound(api, stageUuid), 60_000, "reading the round's strategy back").catch(() => ({} as Awaited<ReturnType<typeof readRound>>));
    const problems: string[] = [];
    if (strategy.dynamic) {
      if (!round.dynamic?.on) problems.push("the dynamic time extension is not on the round");
      else {
        values.dynamicExtensionReadBack = `on, trigger ${round.dynamic.trigger ?? "?"} min, extend by ${round.dynamic.extend ?? "?"} min, top ${round.dynamic.top ?? "?"} bids, ${round.dynamic.strategy ?? "?"}`;
        if (round.dynamic.trigger !== strategy.dynamic.triggerMinutes || round.dynamic.extend !== strategy.dynamic.extendByMinutes) problems.push(`the round reads back with trigger ${round.dynamic.trigger ?? "?"} / extend ${round.dynamic.extend ?? "?"} min, not the case's ${strategy.dynamic.triggerMinutes} / ${strategy.dynamic.extendByMinutes}`);
      }
    }
    if (strategy.trafficLight) {
      if (!round.trafficLight && round.auctionConfig !== "traffic_light") problems.push(`the round is not a traffic light auction (strategy "${round.auctionConfig ?? "?"}", traffic light config ${round.trafficLight ?? "none"})`);
      else values.trafficLightReadBack = `${round.auctionConfig ?? "traffic_light"} by ${round.trafficLight ?? strategy.trafficLight.by}`;
    }
    opts.onLine?.(problems.length ? `the round's strategy did NOT take: ${problems.join("; ")}` : `the round reads back with the case's strategy${values.dynamicExtensionReadBack ? ` — dynamic time extension ${values.dynamicExtensionReadBack}` : ""}${values.trafficLightReadBack ? ` — traffic light (${values.trafficLightReadBack})` : ""}`);
    if (problems.length) return { ok: false, why: `the API build of the ${state} state stopped: the round was created but ${problems.join("; ")} — the case would run on a plain auction and prove nothing about its strategy` };
  }

  // In-Principle Approval (18 Nov 2026): the closed RFQ goes for approval — raised as the submit pop-up raises it,
  // then approved / rejected by the QA approvers as the approval page does it (ipaStates.ts); each step read back.
  if (IPA_STATES.has(state)) {
    const ipa = await import("../checks/ipaStates.js");
    const flow = shape.ipaFlow ?? "QA_Platform IPA 2-step";
    const raised = await withWatchdog(ipa.raiseIpa(api, eventGroupUuid, flow), 90_000, "raising the In-Principle approval").catch((e) => ({ ok: false, why: (e as Error).message } as Awaited<ReturnType<typeof ipa.raiseIpa>>));
    if (!raised.ok || !raised.request) return { ok: false, why: `the API build of the ${state} state stopped: ${raised.why}` };
    let req = raised.request;
    values.ipaWorkflow = flow;
    values.ipaApprovalValue = String(raised.value ?? "");
    values.ipaL1Vendor = String(raised.l1 ?? "");
    values.ipaLineItems = String(raised.lines ?? "");
    made.ipaRequestUuid = req.uuid;
    values.ipaRequestUuid = req.uuid;
    values.ipaApprovalPath = `/project/${eventGroupUuid}/in-principle-approval/${req.uuid}`;
    opts.onLine?.(`raised In-Principle Approval with "${flow}" — value ₹${raised.value}, L1 ${raised.l1} (request ${req.id})`);
    const act = async (key: string, resolution: "approved" | "rejected", remarks: string, who: string) => {
      const r = await withWatchdog(ipa.resolveIpaAs(companyId, key, req, resolution, remarks), 120_000, `${who} ${resolution === "approved" ? "approving" : "rejecting"}`).catch((e) => ({ ok: false, why: (e as Error).message } as Awaited<ReturnType<typeof ipa.resolveIpaAs>>));
      if (!r.ok) throw new Error(r.why);
      if (r.after) req = r.after;
      opts.onLine?.(`${who} ${resolution} it${remarks ? ` ("${remarks}")` : ""} — the request now reads status ${req.status}, step ${req.currentStep}`);
    };
    try {
      const reason = shape.rejectReason ?? "Budget frozen for this quarter";
      if (state === "ipa_rejected_step1") await act("approver_a", "rejected", reason, "Approver A");
      if (["ipa_step1", "ipa_approved", "ipa_rejected"].includes(state)) await act("approver_a", "approved", "", "Approver A");
      if (state === "ipa_approved") await act("approver_b", "approved", "", "Approver B");
      if (state === "ipa_rejected") await act("approver_b", "rejected", reason, "Approver B");
      if (state.startsWith("ipa_rejected")) values.ipaRejectReason = reason;
    } catch (e) {
      return { ok: false, why: `the API build of the ${state} state stopped: ${(e as Error).message}` };
    }
    values.ipaRequestStatus = String(req.status);
    if (state === "ipa_approved") {
      const egId = Number(made.eventGroupId) || decodeId(eventGroupUuid) || 0;
      const first = decodeId(String(stageUuid ?? "")) ?? 0;
      const rfq2 = await ipa.waitForRfq2(egId, first, 150_000);
      if (!rfq2) return { ok: false, why: `the API build of the ${state} state stopped: both approved, but no RFQ 2 stage appeared on the project within 2½ minutes` };
      made.rfq2StageUuid = rfq2.uuid;
      values.rfq2StageUuid = rfq2.uuid;
      values.rfq2Ref = rfq2.ref;
      values.rfq2Title = rfq2.title;
      opts.onLine?.(`RFQ 2 was created: ${rfq2.ref} "${rfq2.title}"`);
    }
  }

  // The name Procol shows: the API client tags a generated title as it sends it (spine-API-automation-<n>,
  // procol test tagAutomationTitle), so the journey's own title is not the one on screen. Read once (10 Nov).
  const shown = await withWatchdog(send(api, "GET", `/event_groups/${eventGroupUuid}`), 30_000, "reading the event's title").catch(() => ({ ok: false, data: null } as any));
  const title = shown?.ok && shown.data?.title ? String(shown.data.title) : String(j.title);
  if (title !== j.title) {
    values.requestedTitle = String(j.title);
    values.title = title;
  }
  return {
    ok: true,
    context: {
      state,
      technical,
      companyId,
      eventGroupUuid,
      stageUuid,
      technicalStageUuid,
      title,
      vendorName,
      vendorEmail,
      buyerUserId: Number(client?.ctx?.buyerUserId) || undefined,
      ...(otherVendorName ? { otherVendorName } : {}),
      ...(otherVendorEmail ? { otherVendorEmail } : {}),
      made,
      values,
      builtInMs: Date.now() - t0,
    },
  };
}
