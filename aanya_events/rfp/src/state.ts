/**
 * WHAT ONE STEP HANDS THE NEXT.
 *
 * Postman kept this in collection variables. Here it is a JSON file under
 * reports/, written after every case: Playwright restarts its worker after a
 * failed test, and anything held in memory would go with it — so a single red
 * check in step 1.3 would otherwise make 1.4 onwards forget which products
 * were picked.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { REPORTS_DIR } from "./config.js";

export interface Header {
  key_attribute: string;
  name: string;
  description: string;
  input_type: string;
  configuration: Record<string, unknown>;
  widget_type: string;
}

export interface SelectedProduct {
  index: number;
  product_uuid: string;
  name: string;
  product_code: string | null;
  category: string;
  family_name: string;
  unit: string | null;
  quantity: number;
  variant_uuid: string | null;
  variant_name: string | null;
  quality_params: Array<{ name: string; value?: unknown; unit?: unknown }>;
  image_url?: string | null;
}

export interface LineItemPayload {
  product_uuid: string | null;
  quantity?: { unitSymbol: string | null; value: unknown };
  product_quality_uuid: string | null;
}

export interface StagePlan {
  /** RFQ stages carry rows and widgets instead of forms */
  rfq?: boolean;
  rows?: Array<{ egli: string; product_uuid: string; name: string; qty: number; unit: string | null; hub: { uuid: string; value: string } | null; variant: string | null }>;
  inline_keys?: string[];
  global_keys?: string[];
  plan: Array<{
    egli: string;
    product_uuid: string;
    name: string;
    header_keys: string[];
    header_names: string[];
    evaluators: string[];
  }>;
  vendor_assessment: string[] | null;
  forms_count: number;
}

export interface Timing {
  start: number;
  end: number;
  extra: number;
  duration: number;
  evaluation: number;
}

export interface RunState {
  stopped?: { at: string; reason: string };
  cfgErrors?: string[];
  cfgDefaults?: {
    event_duration: number;
    evaluation_duration: number;
    auction_closing_mode: string;
    rfp_evaluation_mode: string;
    /** the account only allows a product's own units */
    freeze_default_uom?: boolean;
  };
  tnc?: { uuid: string; title: string; terms_and_conditions: unknown[]; attachments: Array<{ type: string; value: unknown[] }> };
  selProducts?: SelectedProduct[];
  lineItems?: LineItemPayload[];
  productCsv?: string;
  suggestedAudience?: Array<{ uuid: string; name: string; status?: string; is_vendor_tna?: boolean }>;
  templateType?: string;
  template?: { uuid: string | null; name?: string; forms?: number };
  /** when the template was not named, the others to fall back to, in list order */
  templateFallbacks?: Array<{ uuid: string; name: string }>;
  templateHeaders?: Header[];
  /** RFQ: the template's price widgets */
  rfqTemplate?: { widgets: any; mapped_widgets: any[]; global_mapped_widgets: any[]; order_type?: string };
  /** RFQ: where each line item is delivered */
  rfqHubs?: Array<{ uuid: string; value: string }>;
  evaluatorPool?: string[];
  vendors?: Array<{ uuid: string; name?: string }>;
  eventGroupUuid?: string;
  egli?: string[];
  currentUserUuid?: string;
  timing?: Timing;
  stagePlan?: StagePlan;
  tradeUuid?: string;
  titleResolved?: string;
  published?: boolean;
  negEventGroupUuid?: string;
  negEgli?: string[];
  negLeaks?: Array<{ request: string; uuid: string }>;
  // ---- surrogate bid ----
  sbEg?: string;
  sbTrade?: string;
  sbBuyerCompany?: string;
  sbUser?: string;
  sbTiming?: { start: number; end: number; extra: number };
  sbBaseline?: {
    total_bids: number;
    active_participants: number;
    total_participants: number;
    revised_bids: number;
    bid_count?: number;
    already_bid?: string[];
    bid_placed_companies?: string[];
    invited_users?: number;
  };
  sbForms?: SbForm[];
  sbVendors?: Array<{ uuid: string; name: string }>;
  sbEligible?: Array<{ uuid: string; name: string }>;
  sbSent?: Record<string, any>;
  sbResults?: Record<string, string>;
  sbPlaced?: boolean;
  sbPostBidCount?: number;
  // ---- vendor bid ----
  bidEg?: string;
  bidTrade?: string;
  bidStage?: { start: number; end: number; extra: number; total_bids: number; active_participants: number };
  bidAlready?: string[];
  bidInvitedUsers?: Array<{ company: string; email: string | null; name: string | null }>;
  bidList?: Array<{ uuid: string; name: string; email: string; vendor_code: string; status: string; has_bid: boolean }>;
  /** the vendors this run bids as, with their login and what each did */
  vbVendors?: Array<{
    uuid: string;
    name: string;
    email: string;
    token?: string;
    user?: string;
    forms?: SbForm[];
    sheet?: string;
    sent?: Record<string, any>;
    submitted?: boolean;
    tradeBidCount?: number;
    // RFQ price bid
    rfqRows?: any[];
    rfqPad?: Record<string, any>;
    tradeCfg?: { over_qty?: boolean; fixed_qty?: boolean };
    bid?: string;
    plan?: Array<{ egli: string; name: string; qty: number; price: number; gst: number | null; total: number; creator_qty: number }>;
    gross?: number;
  }>;
  /** rfp or rfq — the kind of round being bid on */
  bidRfx?: string;
  vbLoggedIn?: boolean;
  vbSubmitted?: boolean;
  vbPostBidCount?: number;
}

export interface SbForm {
  form_uuid: string;
  name: string;
  page_uuid: string;
  egli: string | null;
  headers: Array<{ key: string; name: string; input_type: string; required: boolean; description: string | null; options: Array<{ value: string; id: string }> | null }>;
}

const FILE = join(REPORTS_DIR, ".state.json");

export function loadState(): RunState {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as RunState;
  } catch {
    return {};
  }
}

export function saveState(state: RunState): void {
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(state, null, 2));
}

export function resetState(): void {
  rmSync(FILE, { force: true });
}

/** Why a case cannot run, in the words of the step that should have produced what it needs. */
export const NEEDS_REASON: Partial<Record<keyof RunState, string>> = {
  cfgDefaults: "the account's event settings were not read (step 1.1 did not complete)",
  selProducts: "no products were picked (step 1.2 did not complete)",
  lineItems: "no products were picked (step 1.2 did not complete)",
  templateType: "the template list was not read (step 1.4 did not complete)",
  evaluatorPool: "the evaluators were not read (step 1.6 did not complete)",
  vendors: "no vendors were picked (step 1.7 did not complete)",
  eventGroupUuid: "the draft event was not created (step 1.8 did not complete)",
  tradeUuid: "the technical stage was not created (step 1.9 did not complete)",
  published: "the event was not published (step 1.10 did not complete)",
  negEventGroupUuid: "the draft the negative cases act on was not created (case 3.0 did not complete)",
  sbTrade: "the event to bid on was not confirmed live (step 4.1 did not complete)",
  sbForms: "the bid's forms were not read (step 4.2 did not complete)",
  sbVendors: "no vendor was picked to bid for (step 4.3 did not complete)",
  sbPlaced: "the surrogate bid was not placed (step 4.5 did not complete)",
  rfqTemplate: "the RFQ template's widgets were not read (step 1.5 did not complete)",
  bidTrade: "the event to bid on was not confirmed live (step 4.0a did not complete)",
  vbVendors: "no vendor was picked to bid as (step 4.0c did not complete)",
  vbLoggedIn: "no vendor could log in (step 4B.2 did not complete)",
  vbSubmitted: "the vendor bid was not submitted (step 4B.9 did not complete)",
  rfqHubs: "no delivery location was found (step 1.5c did not complete)",
};
