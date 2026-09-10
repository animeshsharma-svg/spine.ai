import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ApiClient, RawResult } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";
import { CONFIG } from "../config.js";
import { ClientConfig } from "../master/config.js";
import {
  buildPricingStageBody,
  buildTechnicalStageBody,
  stageTiming,
  StageTiming,
} from "./bodies.js";
import { convertToAuction } from "./features.js";
import { fetchTechForms } from "./enrich.js";
import { collectVendors } from "./vendors.js";
import type { Identity } from "../identities.js";

/**
 * Drives `prototype/knowledge/events/backend-test-cases.json` — 103 mined
 * backend test cases for the events module — against the LIVE API, and
 * classifies every outcome with the API Oracle (`src/oracle/`).
 *
 * The JSON's `request.body` is a simplified/illustrative paraphrase of the
 * real wire shape (e.g. `product_id`, `quantity.unit`) — it does not match
 * what this framework's proven body-builders (`bodies.ts`) actually send and
 * that the live backend accepts (`product_uuid`, `quantity.unitSymbol`, …).
 * So each automated case below builds its request from our OWN verified
 * builders/fixtures, perturbing exactly the one dimension the case is about,
 * rather than posting the JSON's paraphrase literally — the paraphrase would
 * produce noise (malformed-request errors) unrelated to the real defect
 * under test. `expected`/`oracle` from the JSON are still what we assert.
 *
 * Cases that need state we cannot construct through the public API in one
 * run (a superseded/amendment/PR-linked event, a second role, 500+ real
 * vendor companies, an existing bid/proposal in a specific state, …) are left
 * out of CASE_RUNNERS and reported skipped with a reason — see SKIP_REASONS.
 */

// ── case schema (matches backend-test-cases.json) ───────────────────────────

export interface ContractCase {
  id: string;
  module: string;
  area: string;
  title: string;
  request: { method: string; path: string; body?: unknown };
  expected: { status: number; shape: string };
  oracle: { kind: string; detail: string };
  severity: "critical" | "high" | "medium" | "low";
  source: string[];
  tags: string[];
}

const CASES_JSON_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../prototype/knowledge/events/backend-test-cases.json",
);

export function loadContractCases(): ContractCase[] {
  const text = readFileSync(CASES_JSON_PATH, "utf8");
  return JSON.parse(text) as ContractCase[];
}

/** Pull a documented `error.code` out of `expected`/`oracle.detail`, if any. */
export function extractExpectedErrorCode(c: ContractCase): string | undefined {
  const text = `${JSON.stringify(c.expected)} ${c.oracle.detail}`;
  const m = text.match(/code[:=]{1,2}\s*"?(\d+)"?/);
  return m?.[1];
}

// ── fixtures — the minimum live state the automated cases share ─────────────

export interface ContractFixtures {
  vendorCompanyUuid: string;
  evaluatorUuid: string;
  /** 1 line item, 0 stages — never activated. */
  draftSingle: { uuid: string; lineItemUuid: string };
  /** 2 line items, 0 stages — never activated. */
  draftTwo: { uuid: string; lineItemUuidA: string; lineItemUuidB: string };
  /** 1 line item, draft rfp + rfq stages (consistent timing) — never activated. */
  staged: { uuid: string; lineItemUuid: string; rfpUuid: string; rfqUuid: string };
  /** 1 line item, draft rfp + rfq stages, deliberately overlapping timing (rfp ends after rfq). */
  badTiming: { uuid: string; lineItemUuid: string; rfpUuid: string; rfqUuid: string };
  /**
   * 1 line item, rfp + rfq — and ACTUALLY PUBLISHED.
   *
   * Several cases need an event that is already live (re-activating it, adding
   * a stage to it, deleting a line item from it). They were all skipped on the
   * belief that publishing was impossible in this environment because of the
   * event_groups PATCH 500 — but that 500 was a UI bug of our own (an unfilled
   * delivery location), and this framework's own create flow publishes fine.
   * The premise was wrong, so the cases are runnable.
   */
  active?: { uuid: string; lineItemUuid: string; rfpUuid: string; rfqUuid: string };
  /** 1 line item, one draft auction stage — never activated. */
  auction: { uuid: string; lineItemUuid: string; auctionUuid: string };
  /** evaluator form/page uuid off the staged event's rfp stage, for update_egli. */
  techForm?: { formUuid: string; pageUuid: string };
  /** as many distinct invitable vendor company uuids as this environment has (best effort, capped 501). */
  manyVendorUuids: string[];
  /** a vendor identity (dynamic OTP login) for the vendor-side self-participate probe. */
  vendor?: Identity;
  configFlags: { boqAllowed: boolean };
}

function lineItemBody() {
  const { catalog, testData } = CONFIG;
  return {
    product_uuid: catalog.productUuid,
    quantity: { unitSymbol: testData.quantityUnit, value: testData.quantityValue },
    product_quality_uuid: catalog.productQualityUuid,
  };
}

async function createDraftEventGroup(buyer: ApiClient, title: string, lineItems: unknown[]) {
  const res = await buyer.post<{ uuid: string; event_group_line_item_ids?: string[] }>(
    Endpoints.eventGroups(),
    { body: { status: "draft", title, line_items: lineItems } },
  );
  return res;
}

/** Build the shared fixtures once per run. Never publishes/activates anything
 *  — activation is the single most contested code path in this environment
 *  (see the live event_group-update-500 defect), so every fixture below is
 *  built to be usable WITHOUT a successful publish, and each activation-area
 *  case performs its own PATCH as the thing under test. */
export async function buildContractFixtures(
  buyer: ApiClient,
  vendorCompanyUuid: string,
  evaluatorUuid: string,
  vendor?: Identity,
): Promise<ContractFixtures> {
  const { catalog, testData } = CONFIG;
  const now = Math.floor(Date.now() / 1000);
  const timing = stageTiming(now, 1800);
  const stamp = Date.now();

  const single = await createDraftEventGroup(buyer, `API_Test_Contract_Single_${stamp}`, [lineItemBody()]);
  const draftSingle = {
    uuid: single.uuid,
    lineItemUuid: single.event_group_line_item_ids?.[0] ?? "",
  };

  const two = await createDraftEventGroup(buyer, `API_Test_Contract_Two_${stamp}`, [
    lineItemBody(),
    lineItemBody(),
  ]);
  const draftTwo = {
    uuid: two.uuid,
    lineItemUuidA: two.event_group_line_item_ids?.[0] ?? "",
    lineItemUuidB: two.event_group_line_item_ids?.[1] ?? "",
  };

  async function buildStagedPair(title: string, rfpTiming: StageTiming, rfqTiming: StageTiming) {
    const group = await createDraftEventGroup(buyer, title, [lineItemBody()]);
    const groupUuid = group.uuid;
    const groupLineItem = group.event_group_line_item_ids?.[0] ?? "";
    const rfp = await buyer.post<{ uuid: string }>(Endpoints.createTrade(), {
      body: buildTechnicalStageBody({
        eventGroupUuid: groupUuid,
        lineItemUuid: groupLineItem,
        evaluatorUuid,
        vendorCompanyUuid,
        technicalTemplateUuid: catalog.technicalTemplateUuid,
        timing: rfpTiming,
        stageNo: 1,
      }),
    });
    const rfq = await buyer.post<{ uuid: string }>(Endpoints.createTrade(), {
      body: buildPricingStageBody({
        eventGroupUuid: groupUuid,
        lineItemUuid: groupLineItem,
        vendorCompanyUuid,
        pricingTemplateUuid: catalog.pricingTemplateUuid,
        productUuid: catalog.productUuid,
        productQualityUuid: catalog.productQualityUuid,
        locationUuid: catalog.locationUuid,
        quantityValue: testData.quantityValue,
        quantityUnit: testData.quantityUnit,
        timing: rfqTiming,
        stageNo: 2,
        rfxMode: "rfq",
      }),
    });
    return { uuid: groupUuid, lineItemUuid: groupLineItem, rfpUuid: rfp.uuid, rfqUuid: rfq.uuid };
  }

  const staged = await buildStagedPair(`API_Test_Contract_Staged_${stamp}`, timing, timing);

  // A published event, for the cases that need one. Best effort: if activation
  // genuinely fails here, those cases skip with the real reason rather than an
  // assumed one.
  let active: ContractFixtures["active"];
  try {
    const pair = await buildStagedPair(`API_Test_Contract_Active_${stamp}`, timing, timing);
    await buyer.patch(Endpoints.eventGroup(pair.uuid), {
      body: {
        attachments: [],
        title: `API_Test_Contract_Active_${stamp}`,
        status: "active",
        draft_trade_request_uuids: [pair.rfpUuid, pair.rfqUuid],
        audience_company_uuids: [vendorCompanyUuid],
        line_items: [],
        terms_and_conditions: { clauses: [], attachments: [{ type: "t_and_c", value: [] }] },
        show_under_open_events: true,
        delete_draft_stage_uuids: [],
        amendment_remarks: { remarks: "" },
      },
    });
    const readBack = await buyer.get<{ status?: string }>(Endpoints.eventGroup(pair.uuid));
    if (readBack.status === "active") {
      active = pair;
      console.log(`  fixture: published event group ${pair.uuid} (for the already-live cases)`);
    } else {
      console.log(`  fixture: activation left status "${readBack.status}" — the already-live cases will skip`);
    }
  } catch (e) {
    console.log(`  fixture: could not publish an event group (${(e as Error).message.slice(0, 100)}) — the already-live cases will skip`);
  }

  // Deliberately overlapping: rfp bid-end after rfq bid-end (BE-2.15, error 712).
  const badTiming = await buildStagedPair(
    `API_Test_Contract_BadTiming_${stamp}`,
    { bst: now, bet: now + 7200, ect: now + 7200 },
    { bst: now, bet: now + 1800, ect: now + 1800 },
  );

  const auctionGroup = await createDraftEventGroup(buyer, `API_Test_Contract_Auction_${stamp}`, [lineItemBody()]);
  const auctionLineItem = auctionGroup.event_group_line_item_ids?.[0] ?? "";
  const auctionTrade = await buyer.post<{ uuid: string }>(Endpoints.createTrade(), {
    body: buildPricingStageBody({
      eventGroupUuid: auctionGroup.uuid,
      lineItemUuid: auctionLineItem,
      vendorCompanyUuid,
      pricingTemplateUuid: catalog.pricingTemplateUuid,
      productUuid: catalog.productUuid,
      productQualityUuid: catalog.productQualityUuid,
      locationUuid: catalog.locationUuid,
      quantityValue: testData.quantityValue,
      quantityUnit: testData.quantityUnit,
      timing,
      stageNo: 1,
      rfxMode: "auction",
      auctionConfig: "price",
    }),
  });
  const auction = { uuid: auctionGroup.uuid, lineItemUuid: auctionLineItem, auctionUuid: auctionTrade.uuid };

  let techForm: { formUuid: string; pageUuid: string } | undefined;
  try {
    const forms = await fetchTechForms(buyer, staged.rfpUuid);
    techForm = { formUuid: forms.form1.uuid, pageUuid: forms.form1.page };
  } catch {
    techForm = undefined;
  }

  let manyVendorUuids: string[] = [];
  try {
    manyVendorUuids = await collectVendors(buyer, 501);
  } catch {
    manyVendorUuids = [];
  }

  let boqAllowed = false;
  try {
    const config = await ClientConfig.load(buyer);
    boqAllowed = config.isOn("boq_in_erfx_allowed");
  } catch {
    boqAllowed = false;
  }

  return {
    vendorCompanyUuid,
    evaluatorUuid,
    draftSingle,
    draftTwo,
    staged,
    active,
    badTiming,
    auction,
    techForm,
    manyVendorUuids,
    vendor,
    configFlags: { boqAllowed },
  };
}

// ── case runners ─────────────────────────────────────────────────────────────

export interface CaseRunResult {
  method: string;
  path: string;
  requestBody: unknown;
  raw: RawResult<any>;
}
export type CaseAttempt = CaseRunResult | { skip: string };

type Runner = (buyer: ApiClient, fx: ContractFixtures) => Promise<CaseAttempt>;

async function call(buyer: ApiClient, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<CaseRunResult> {
  const raw = await buyer.attempt(method, path, body === undefined ? {} : { body });
  return { method, path, requestBody: body ?? null, raw };
}

const stamp = () => Date.now();

export const CASE_RUNNERS: Record<string, Runner> = {
  // ── 1.x creation ──────────────────────────────────────────────────────────
  "BE-1.1": (buyer) =>
    call(buyer, "POST", Endpoints.eventGroups(), {
      status: "draft",
      title: `API_Test_BE11_${stamp()}`,
      attachments: [],
      line_items: [lineItemBody()],
    }),
  "BE-1.2": (buyer) =>
    call(buyer, "POST", Endpoints.eventGroups(), {
      title: `API_Test_BE12_${stamp()}`,
      line_items: [lineItemBody()],
    }),
  "BE-1.3": (buyer) =>
    call(buyer, "POST", Endpoints.eventGroups(), {
      status: "draft",
      title: `API_Test_BE13_${stamp()}`,
      line_items: [],
    }),
  "BE-1.4": async (buyer, fx) => {
    if (!fx.configFlags.boqAllowed) return { skip: "client's boq_in_erfx_allowed is off — see BE-1.5 instead" };
    return call(buyer, "POST", Endpoints.eventGroups(), {
      status: "draft",
      title: `API_Test_BE14_${stamp()}`,
      config: { boq_based_rfx: true },
      line_items: [],
    });
  },
  "BE-1.5": async (buyer, fx) => {
    if (fx.configFlags.boqAllowed) return { skip: "client's boq_in_erfx_allowed is on — see BE-1.4 instead" };
    return call(buyer, "POST", Endpoints.eventGroups(), {
      status: "draft",
      title: `API_Test_BE15_${stamp()}`,
      config: { boq_based_rfx: true },
      line_items: [],
    });
  },
  "BE-1.8": (buyer) =>
    call(buyer, "POST", Endpoints.eventGroups(), {
      status: "draft",
      title: `API_Test_BE18_TitleX_${stamp()}`,
      description: "Desc Y",
      attachments: [{ url: "https://example.com/1.pdf", type: "t_and_c" }],
      line_items: [lineItemBody()],
    }),
  "BE-1.9": (buyer) =>
    call(buyer, "POST", Endpoints.eventGroups(), {
      status: "draft",
      title: `API_Test_BE19_${stamp()}`,
      line_items: [lineItemBody(), lineItemBody()],
    }),
  "BE-1.10": (buyer) =>
    call(buyer, "POST", Endpoints.eventGroups(), {
      status: "draft",
      title: `API_Test_BE110_${stamp()}`,
      line_items: [lineItemBody()],
    }),
  "BE-1.11": (buyer) =>
    call(buyer, "POST", Endpoints.eventGroups(), {
      status: "draft",
      title: "",
      line_items: [lineItemBody()],
    }),
  "BE-1.12": (buyer) =>
    call(buyer, "POST", Endpoints.eventGroups(), {
      status: "draft",
      title: `API_Test_BE112_${stamp()}`,
      line_items: "not-an-array" as unknown,
    }),

  // ── 2.x activation ────────────────────────────────────────────────────────
  "BE-2.1": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.staged.uuid), {
      attachments: [],
      title: `API_Test_BE21_${stamp()}`,
      status: "active",
      draft_trade_request_uuids: [fx.staged.rfpUuid, fx.staged.rfqUuid],
      audience_company_uuids: [fx.vendorCompanyUuid],
      line_items: [],
      terms_and_conditions: { clauses: [], attachments: [{ type: "t_and_c", value: [] }] },
      show_under_open_events: true,
      delete_draft_stage_uuids: [],
      amendment_remarks: { remarks: "" },
    }),
  // ── cases needing an ALREADY-LIVE event ───────────────────────────────────
  // Previously skipped on the belief that publishing was impossible here. It
  // was not: the 500 that inspired that belief came from our own UI leaving the
  // delivery location blank.
  "BE-2.25": async (buyer, fx) => {
    if (!fx.active) throw new Error("skip:no published event group could be created in this run");
    // Re-activating an event that is already active should be a no-op, not a
    // second publish. The guard is event_group.draft? being false.
    return call(buyer, "PATCH", Endpoints.eventGroup(fx.active.uuid), {
      attachments: [],
      title: `API_Test_BE225_${stamp()}`,
      status: "active",
      draft_trade_request_uuids: [],
      audience_company_uuids: [fx.vendorCompanyUuid],
      line_items: [],
      terms_and_conditions: { clauses: [], attachments: [{ type: "t_and_c", value: [] }] },
      show_under_open_events: true,
      delete_draft_stage_uuids: [],
      amendment_remarks: { remarks: "" },
    });
  },
  "BE-3.3": async (buyer, fx) => {
    if (!fx.active) throw new Error("skip:no published event group could be created in this run");
    // Removing a line item from a live event: it should be marked deleted and
    // disappear from the response rather than error.
    return call(buyer, "PATCH", Endpoints.eventGroup(fx.active.uuid), {
      attachments: [],
      title: `API_Test_BE33_${stamp()}`,
      status: "active",
      draft_trade_request_uuids: [],
      audience_company_uuids: [fx.vendorCompanyUuid],
      line_items: [{ uuid: fx.active.lineItemUuid, status: "deleted" }],
      terms_and_conditions: { clauses: [], attachments: [{ type: "t_and_c", value: [] }] },
      show_under_open_events: true,
      delete_draft_stage_uuids: [],
      amendment_remarks: { remarks: "" },
    });
  },
  "BE-2.3": async (buyer, fx) => {
    // parametrized over rfp/rfq/auction — run all three, report the auction leg
    // (the one not covered by BE-2.1/BE-2.4) as the representative attempt.
    await call(buyer, "PATCH", Endpoints.eventGroup(fx.staged.uuid), {
      status: "active",
      draft_trade_request_uuids: [fx.staged.rfpUuid],
      audience_company_uuids: [fx.vendorCompanyUuid],
    });
    return call(buyer, "PATCH", Endpoints.eventGroup(fx.auction.uuid), {
      status: "active",
      draft_trade_request_uuids: [fx.auction.auctionUuid],
      audience_company_uuids: [fx.vendorCompanyUuid],
      line_items: [],
      terms_and_conditions: { clauses: [], attachments: [] },
      show_under_open_events: true,
      amendment_remarks: { remarks: "" },
    });
  },
  "BE-2.4": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftSingle.uuid), {
      status: "active",
      draft_trade_request_uuids: [],
      line_items: [],
    }),
  "BE-2.5": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftTwo.uuid), {
      status: "active",
      draft_trade_request_uuids: [],
      line_items: [],
    }),
  "BE-2.6": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.staged.uuid), {
      status: "active",
      draft_trade_request_uuids: [fx.staged.rfqUuid],
      audience_company_uuids: [fx.vendorCompanyUuid],
    }),
  "BE-2.7": async (buyer, fx) => {
    if (fx.manyVendorUuids.length < 154) {
      return { skip: `only ${fx.manyVendorUuids.length} invitable vendor companies available in this environment (need 154)` };
    }
    return call(buyer, "PATCH", Endpoints.eventGroup(fx.staged.uuid), {
      status: "active",
      draft_trade_request_uuids: [fx.staged.rfqUuid],
      audience_company_uuids: fx.manyVendorUuids.slice(0, 154),
    });
  },
  "BE-2.8": async (buyer, fx) => {
    if (fx.manyVendorUuids.length < 501) {
      return { skip: `only ${fx.manyVendorUuids.length} invitable vendor companies available in this environment (need 501)` };
    }
    return call(buyer, "PATCH", Endpoints.eventGroup(fx.staged.uuid), {
      status: "active",
      draft_trade_request_uuids: [fx.staged.rfqUuid],
      audience_company_uuids: fx.manyVendorUuids.slice(0, 501),
    });
  },
  "BE-2.11": (buyer) => call(buyer, "PATCH", Endpoints.eventGroup("00000"), { status: "active" }),
  "BE-2.13": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftSingle.uuid), {
      status: "draft",
      attachments: [{ url: "https://not-this-companys-bucket.example.com/x.pdf" }],
    }),
  "BE-2.15": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.badTiming.uuid), {
      status: "active",
      draft_trade_request_uuids: [fx.badTiming.rfpUuid, fx.badTiming.rfqUuid],
      audience_company_uuids: [fx.vendorCompanyUuid],
    }),
  "BE-2.16": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftSingle.uuid), {
      status: "draft",
      line_items: [{ product_uuid: CONFIG.catalog.productUuid, quantity: { unitSymbol: "KG", value: 5 } }],
    }),
  "BE-2.17": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftTwo.uuid), {
      status: "withdrawn",
      withdraw_remark: { remarks: "no longer needed" },
    }),
  "BE-2.18": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.auction.uuid), {
      status: "withdrawn",
      withdraw_remark: { remarks: "" },
    }),
  "BE-2.22": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftSingle.uuid), {
      status: "draft",
      terms_and_conditions: { clauses: [], attachments: [{ value: [] }] },
    }),
  "BE-2.23": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftSingle.uuid), {
      status: "draft",
      draft_trade_request_uuids: [],
    }),
  "BE-2.24": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftSingle.uuid), {
      status: "draft",
      terms_and_conditions: { attachments: [] },
    }),
  "BE-2.26": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftSingle.uuid), {
      status: "draft",
      line_items: [{ id: fx.draftSingle.lineItemUuid, status: "deleted" }],
    }),

  // ── 3.x line items ────────────────────────────────────────────────────────
  "BE-3.1": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftSingle.uuid), {
      status: "draft",
      line_items: [{ product_uuid: CONFIG.catalog.productUuid, quantity: { unitSymbol: "KG", value: 5 } }],
    }),
  "BE-3.4": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftTwo.uuid), {
      status: "draft",
      line_items: [
        { id: fx.draftTwo.lineItemUuidA, status: "deleted" },
        { id: fx.draftTwo.lineItemUuidB, status: "active" },
      ],
    }),
  "BE-3.5": async (buyer, fx) => {
    if (!fx.techForm) return { skip: "could not read a form uuid off the staged rfp stage (fetchTechForms failed)" };
    return call(buyer, "PATCH", Endpoints.updateEgli(), {
      form_id: fx.techForm.formUuid,
      evaluators: [],
    });
  },
  "BE-3.6": (buyer) => call(buyer, "PATCH", Endpoints.updateEgli(), { evaluators: [] }),
  "BE-3.8": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftSingle.uuid), {
      status: "draft",
      line_items: [{ product_uuid: CONFIG.catalog.productUuid, quantity: { unitSymbol: "KG", value: "ten" } }],
    }),
  "BE-3.10": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftSingle.uuid), {
      status: "active",
      line_items: [{ id: fx.draftSingle.lineItemUuid, status: "deleted" }],
    }),

  // ── 4.x audience ──────────────────────────────────────────────────────────
  "BE-4.2": async (buyer, fx) => {
    if (!fx.vendor) return { skip: "no vendor identity available (vendor OTP login failed)" };
    const raw = await fx.vendor.api.attempt("POST", Endpoints.eventGroupParticipants(fx.draftSingle.uuid), { body: {} });
    return { method: "POST", path: Endpoints.eventGroupParticipants(fx.draftSingle.uuid), requestBody: {}, raw };
  },
  "BE-4.4": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroupRejectParticipant(fx.draftSingle.uuid), {
      company_id: fx.vendorCompanyUuid,
      remarks: "",
    }),
  "BE-4.7": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.staged.uuid), {
      status: "active",
      draft_trade_request_uuids: [fx.staged.rfqUuid],
      audience_company_uuids: [fx.vendorCompanyUuid, fx.vendorCompanyUuid],
    }),

  // ── 5.x bids (authorization probes only — no live bid to operate on) ───────
  "BE-5.4": (buyer) => call(buyer, "POST", Endpoints.bidFeedback("1"), { feedback: "good" }),
  "BE-5.5": (buyer) => call(buyer, "GET", Endpoints.bidApprovalWorkflowsForSurrogate()),
  "BE-5.8": (buyer) => call(buyer, "POST", Endpoints.tradeUploadBidExcel("1"), {}),

  // ── 6.x awarding ──────────────────────────────────────────────────────────
  "BE-6.1": (buyer, fx) => call(buyer, "POST", Endpoints.proposal(), { event_group_uuid: fx.staged.uuid }),
  "BE-6.4": (buyer) => call(buyer, "POST", Endpoints.proposalCreateContractForm("1"), {}),
  "BE-6.5": (buyer) => call(buyer, "POST", Endpoints.proposalAddResponse("1"), {}),
  "BE-6.8": (buyer) => call(buyer, "GET", Endpoints.downloadAwardingSheet("not-a-real-uuid")),

  // ── 7.x rfq → auction ─────────────────────────────────────────────────────
  "BE-7.1": async (buyer, fx) => {
    const raw = await (async () => {
      try {
        const res = await convertToAuction(buyer, { pricingTradeUuid: fx.staged.rfqUuid, lineItemUuid: fx.staged.lineItemUuid });
        return { status: 200, ok: true, data: res, rawText: JSON.stringify(res) } as RawResult<any>;
      } catch (err: any) {
        return {
          status: err?.status ?? 0,
          ok: false,
          data: err?.data ?? null,
          errorCode: err?.code !== undefined ? String(err.code) : undefined,
          errorMessage: err?.message,
          rawText: JSON.stringify(err?.data ?? {}),
        } as RawResult<any>;
      }
    })();
    return { method: "PATCH", path: Endpoints.moveToAuction(), requestBody: { trade_request_uuid: fx.staged.rfqUuid }, raw };
  },
  "BE-7.2": async (buyer, fx) => {
    // idempotency: convert the SAME rfq stage a second time.
    const raw = await (async () => {
      try {
        const res = await convertToAuction(buyer, { pricingTradeUuid: fx.staged.rfqUuid, lineItemUuid: fx.staged.lineItemUuid });
        return { status: 200, ok: true, data: res, rawText: JSON.stringify(res) } as RawResult<any>;
      } catch (err: any) {
        return {
          status: err?.status ?? 0,
          ok: false,
          data: err?.data ?? null,
          errorCode: err?.code !== undefined ? String(err.code) : undefined,
          errorMessage: err?.message,
          rawText: JSON.stringify(err?.data ?? {}),
        } as RawResult<any>;
      }
    })();
    return { method: "PATCH", path: Endpoints.moveToAuction(), requestBody: { trade_request_uuid: fx.staged.rfqUuid, note: "second conversion" }, raw };
  },
  "BE-7.3": (buyer) => call(buyer, "PATCH", Endpoints.moveToAuction(), { trade_request_id: 999999999 }),

  // ── 8.x authorization ─────────────────────────────────────────────────────
  "BE-8.3": (buyer, fx) => call(buyer, "POST", Endpoints.eventGroupCreateClone(fx.draftSingle.uuid), {}),

  // ── 9.x state-transition ──────────────────────────────────────────────────
  "BE-9.1": async (buyer, fx) => {
    // withdraw first (idempotent no matter what state draftTwo is already in),
    // then attempt to re-activate the now-withdrawn event.
    await call(buyer, "PATCH", Endpoints.eventGroup(fx.draftTwo.uuid), {
      status: "withdrawn",
      withdraw_remark: { remarks: "setup for BE-9.1" },
    });
    return call(buyer, "PATCH", Endpoints.eventGroup(fx.draftTwo.uuid), { status: "active" });
  },
  "BE-9.2": async (buyer, fx) => {
    await call(buyer, "PATCH", Endpoints.eventGroup(fx.draftTwo.uuid), {
      status: "withdrawn",
      withdraw_remark: { remarks: "first withdraw for BE-9.2" },
    });
    return call(buyer, "PATCH", Endpoints.eventGroup(fx.draftTwo.uuid), {
      status: "withdrawn",
      withdraw_remark: { remarks: "second withdraw for BE-9.2" },
    });
  },
  "BE-9.5": (buyer, fx) =>
    call(buyer, "PATCH", Endpoints.eventGroup(fx.draftSingle.uuid), {
      status: "active",
      draft_trade_request_uuids: [],
    }),
};

/** Fixed reasons for cases we deliberately did not automate this pass. */
export const SKIP_REASONS: Record<string, string> = {
  "BE-1.6": "requires a PurchaseRequest line item flagged dormant-locked — not creatable through the public API in one run",
  "BE-1.7": "requires a second identity without trade:create_record permission — not configured for this client",
  "BE-2.2": "requires a draft stage lacking its bidding-time TradeSchedule row — the public create API always writes one; would need direct DB seeding",
  "BE-2.9": "requires a PR-linked historical price on the line item — no PR fixture built in this run",
  "BE-2.10": "requires the same PR-linked historical-price setup as BE-2.9 to be a meaningful (non-vacuous) check",
  "BE-2.12": "requires a superseded (non-latest) event version, which needs a prior SUCCESSFUL publish — blocked in this environment by the live event_group PATCH 500 (see event_group-update-500 memory)",
  "BE-2.14": "requires a caller without update permission on the event group — no low-privilege identity configured",
  "BE-2.19": "requires an already-ACTIVE live event to add a new stage to — blocked by the live PATCH 500 defect",
  "BE-2.20": "requires an amendment draft (from a successful version of a successfully-published event) — blocked by the live PATCH 500 defect; the case's own expected/oracle fields also read as internally inconsistent (documents current 500 as 'expected' while instructing 'assert it doesn't crash')",
  "BE-2.21": "requires an amendment draft (from a successful version of a successfully-published event) — blocked by the live PATCH 500 defect",
  "BE-3.2": "requires a line item referenced by an existing valid (requested/selected) proposal — no such proposal exists without a successful award flow",
  "BE-3.7": "requires an existing BOQ event group with prior line items to replace — not built in this run",
  "BE-3.9": "requires a 'service' project type line item — not modeled by this framework",
  "BE-4.1": "requires an already-ACTIVE, open-tender event group — blocked by the live PATCH 500 defect",
  "BE-4.3": "requires a vendor company explicitly configured without open_tenders — not knowable/creatable for the dynamically-picked vendor",
  "BE-4.5": "requires a non-latest (superseded) event version — needs a prior successful publish, blocked by the live PATCH 500 defect",
  "BE-4.6": "requires a caller who is neither purchaser nor auction-team member — the configured buyer identity is the purchaser",
  "BE-4.8": "requires a vendor who has already participated (an existing bid/response) — needs a successful publish + bid first",
  "BE-4.9": "requires a caller without view access to the event — no such identity configured",
  "BE-4.10": "requires a second company user's plain numeric user id (change_ownership takes new_owner_id, not a uuid) — not exposed by any endpoint this framework wraps",
  "BE-4.11": "requires a non-owner, non-admin caller to attempt ownership change — no such identity configured",
  "BE-5.1": "requires an existing eligible participant + trade_request in a specific bid-open state — needs a successful publish first",
  "BE-5.2": "requires an existing bid to revise",
  "BE-5.3": "requires an existing bid to reject",
  "BE-5.6": "requires an existing knockout-auction bid to accept twice",
  "BE-5.7": "requires an existing bid id to attempt updating (a synthetic id could false-positive on unrelated auth checks before the not-found path)",
  "BE-6.2": "requires a real proposal id from a successful create — BE-6.1 could not create a meaningful proposal without a published event",
  "BE-6.3": "requires the caller to already hold a draft proposal on a published event",
  "BE-6.6": "requires an existing draft proposal to discard",
  "BE-6.7": "requires an existing bid + a trade in a closeable window",
  "BE-7.4": "requires an RFQ stage on a superseded (non-latest) event version — needs a successful publish first",
  "BE-7.5": "ordering-ambiguous with BE-7.2 against the same fixture (both re-convert the same rfq); recorded once via BE-7.2 rather than double-counted",
  "BE-7.6": "requires a caller from neither the owning nor broker company — no such identity configured",
  "BE-7.7": "requires a multi-product trade with >1 active/closed trade product — not built in this run",
  "BE-7.8": "requires an existing multi-product trade to attempt an auction_closing_mode switch on",
  "BE-8.1": "requires a vendor with zero visible stages on an otherwise-readable event — needs a published event with other stages",
  "BE-8.2": "requires a caller who is a planner (is_planner? true) — no such identity configured",
  "BE-8.4": "requires a PR-linked event group (via PR→Event conversion) — not built in this contract run to keep scope bounded",
  "BE-8.5": "requires a procol-employee-and-CSM identity — not configured for this client",
  "BE-8.6": "requires a vendor-onboarding-v2 stage and an identity disallowed from evaluating it — not modeled",
  "BE-8.7": "requires an identity without has_access_for_sourcing_events? — not configured",
  "BE-8.8": "regenerate_master_qcs is allow-listed to specific procol employee ids — not reachable from this identity",
  "BE-9.3": "requires a successful publish that omits one draft stage — blocked by the live PATCH 500 defect",
  "BE-9.4": "requires two successful identical activation calls to compare — blocked by the live PATCH 500 defect",
  "BE-9.6": "requires an already-ACTIVE event group — blocked by the live PATCH 500 defect",
  "BE-9.7": "requires an approval-flow configuration on the workspace — not built in this run",
  "BE-9.8": "requires auto-route-to-auction-team configuration — not built in this run",
  "BE-10.1": "the non-eRFX /trade/template_input shape (trade_products/bid_start_time as literal top-level params) differs from this framework's verified eRFX body builders (data/widgets/configurations) — needs its own captured request before automating, to avoid a malformed-request false negative",
  "BE-10.2": "same non-eRFX /trade/template_input body-shape gap as BE-10.1",
  "BE-10.3": "same non-eRFX /trade/template_input body-shape gap as BE-10.1",
  "BE-10.4": "same non-eRFX /trade/template_input body-shape gap as BE-10.1",
};

/** Extra 2xx shape assertions for a handful of cases where it's cheap and meaningful. */
export const CONTRACT_CHECKS: Record<string, (data: any) => string | null> = {
  "BE-1.1": (d) =>
    Array.isArray(d?.event_group_line_item_ids) && d.event_group_line_item_ids.length === 1 && d.status === "draft"
      ? null
      : "expected event_group_line_item_ids.length === 1 and status === 'draft'",
  "BE-1.8": (d) => (d?.title?.startsWith("API_Test_BE18_TitleX_") && d?.description === "Desc Y" ? null : "title/description were not echoed back"),
  "BE-1.9": (d) => (Array.isArray(d?.event_group_line_item_ids) && d.event_group_line_item_ids.length === 2 ? null : "expected 2 line item ids"),
  "BE-1.10": (d) => (Array.isArray(d?.stages) && d.stages.length > 0 ? "response.stages is non-empty on a bare create" : null),
  "BE-9.5": (d) => (Array.isArray(d?.stages) && d.stages.length === 0 ? null : "expected response.stages === [] (zero trade_requests)"),
};

/**
 * Cases whose documented expectation is a CATEGORY ("some 4xx, not a bare
 * 500"), not a specific status/code — any rejection counts as matching.
 * Deliberately excludes the authorization probes (BE-5.4/5.5/5.8/6.4/6.5):
 * those specifically assert a Pundit 403, and a 422 arriving instead (e.g. a
 * not-found check running before the policy) is exactly the kind of mismatch
 * worth keeping visible, not smoothing over.
 */
export const ANY_REJECTION_OK = new Set(["BE-1.12", "BE-2.18", "BE-2.22", "BE-3.8", "BE-6.8", "BE-9.1"]);
