import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";
import { Catalog, CONFIG } from "../config.js";
import {
  buildEventGroupBody,
  buildPricingStageBody,
  buildPublishBody,
  buildTechnicalStageBody,
  stageTiming,
  StageTiming,
} from "./bodies.js";

export type StageKind = "rfp" | "rfq" | "auction";

export interface StageSpec {
  kind: StageKind;
  /** auction strategy when kind === "auction". Default "price". */
  auctionConfig?: "rank" | "price";
}

export interface CreateEventOptions {
  /** Required if any stage is "rfp" (the technical evaluator). */
  evaluatorUuid?: string;
  /** Vendor company to invite. Default: CONFIG.catalog.vendorBidCompanyUuid. */
  vendorCompanyUuid?: string;
  /** Catalog (product/templates/location). Default: CONFIG.catalog. */
  catalog?: Catalog;
  /** Event title; `API_Test_` prefix is added if absent. */
  title?: string;
  /** Ordered stages. Default: [rfp, rfq]. */
  stages?: StageSpec[];
  nowSec?: number;
  stageDurationSec?: number;
  timing?: StageTiming;
}

export interface StageTrade {
  kind: StageKind;
  auctionConfig?: "rank" | "price";
  uuid: string;
}

export interface CreateEventResult {
  eventGroupUuid: string;
  refUuid?: string;
  lineItemUuid: string;
  vendorCompanyUuid: string;
  title: string;
  timing: StageTiming;
  status: string;
  stages: Array<{ uuid: string; rfx_mode?: string }>;
  stageTrades: StageTrade[];
  /** first rfp stage trade (if any) */
  technicalTradeUuid?: string;
  /** first rfq/auction stage trade (if any) */
  pricingTradeUuid?: string;
  published: any;
}

interface EventGroupResponse {
  uuid: string;
  ref_uuid?: string;
  event_group_line_item_ids?: string[];
}

/**
 * General, composable event builder. Creates a draft event group, then one
 * trade stage per StageSpec (correct stage_no + rfx_mode), then publishes with
 * all stage trade-uuids. Supports rfp / rfq / auction stages in any order:
 *   [rfp]              technical only
 *   [rfq]              pricing only
 *   [auction]          auction only (rank or price)
 *   [rfp, rfq]         technical + pricing
 *   [rfp, auction]     technical + auction
 */
export async function createEvent(
  buyerApi: ApiClient,
  opts: CreateEventOptions,
): Promise<CreateEventResult> {
  const { testData } = CONFIG;
  const catalog = opts.catalog ?? CONFIG.catalog;
  const vendorCompanyUuid = opts.vendorCompanyUuid ?? catalog.vendorBidCompanyUuid;
  const stages = opts.stages ?? [{ kind: "rfp" }, { kind: "rfq" }];
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const timing = opts.timing ?? stageTiming(now, opts.stageDurationSec ?? 1800);
  const rawTitle = opts.title ?? `Event_${Date.now()}`;
  const title = rawTitle.startsWith("API_Test_") ? rawTitle : `API_Test_${rawTitle}`;

  if (stages.some((s) => s.kind === "rfp") && !opts.evaluatorUuid) {
    throw new Error("evaluatorUuid is required when the event has an rfp (technical) stage.");
  }

  // 1) draft event group
  const group = await buyerApi.post<EventGroupResponse>(Endpoints.eventGroups(), {
    body: buildEventGroupBody({
      productUuid: catalog.productUuid,
      quantityUnit: testData.quantityUnit,
      quantityValue: testData.quantityValue,
      productQualityUuid: catalog.productQualityUuid,
    }),
  });
  const eventGroupUuid = group.uuid;
  const lineItemUuid = group.event_group_line_item_ids?.[0];
  if (!eventGroupUuid || !lineItemUuid) {
    throw new Error("event_groups create missing uuid / line item id");
  }

  // 2) one trade per stage
  const stageTrades: StageTrade[] = [];
  for (let i = 0; i < stages.length; i++) {
    const spec = stages[i];
    const stageNo = i + 1;
    let body: unknown;
    if (spec.kind === "rfp") {
      body = buildTechnicalStageBody({
        eventGroupUuid,
        lineItemUuid,
        evaluatorUuid: opts.evaluatorUuid!,
        vendorCompanyUuid,
        technicalTemplateUuid: catalog.technicalTemplateUuid,
        timing,
        stageNo,
      });
    } else {
      body = buildPricingStageBody({
        eventGroupUuid,
        lineItemUuid,
        vendorCompanyUuid,
        pricingTemplateUuid: catalog.pricingTemplateUuid,
        productUuid: catalog.productUuid,
        productQualityUuid: catalog.productQualityUuid,
        locationUuid: catalog.locationUuid,
        quantityValue: testData.quantityValue,
        quantityUnit: testData.quantityUnit,
        timing,
        stageNo,
        rfxMode: spec.kind === "auction" ? "auction" : "rfq",
        auctionConfig: spec.auctionConfig,
      });
    }
    const trade = await buyerApi.post<{ uuid: string }>(Endpoints.createTrade(), { body });
    stageTrades.push({ kind: spec.kind, auctionConfig: spec.auctionConfig, uuid: trade.uuid });
  }

  // 3) publish with all stage trade-uuids
  const draftUuids = stageTrades.map((s) => s.uuid);
  const published = await buyerApi.patch<{ uuid: string; status: string; stages?: any[] }>(
    Endpoints.eventGroup(eventGroupUuid),
    {
      body: {
        ...buildPublishBody({
          title,
          technicalTradeUuid: draftUuids[0],
          pricingTradeUuid: draftUuids[1] ?? draftUuids[0],
          vendorCompanyUuid,
        }),
        draft_trade_request_uuids: draftUuids,
      },
    },
  );

  const publishedStages = (published.stages ?? []) as Array<{ uuid: string; rfx_mode?: string }>;

  return {
    eventGroupUuid,
    refUuid: group.ref_uuid,
    lineItemUuid,
    vendorCompanyUuid,
    title,
    timing,
    status: published.status,
    stages: publishedStages,
    stageTrades,
    technicalTradeUuid: stageTrades.find((s) => s.kind === "rfp")?.uuid,
    pricingTradeUuid: stageTrades.find((s) => s.kind === "rfq" || s.kind === "auction")?.uuid,
    published,
  };
}

/**
 * Convenience wrapper for the classic 2-stage RFP+RFQ event (guarantees both
 * technicalTradeUuid and pricingTradeUuid). Kept for the existing flows.
 */
export async function createRfqTechnicalEvent(
  buyerApi: ApiClient,
  opts: Omit<CreateEventOptions, "stages"> & { evaluatorUuid: string },
): Promise<CreateEventResult & { technicalTradeUuid: string; pricingTradeUuid: string }> {
  const res = await createEvent(buyerApi, {
    ...opts,
    stages: [{ kind: "rfp" }, { kind: "rfq" }],
  });
  if (!res.technicalTradeUuid || !res.pricingTradeUuid) {
    throw new Error("RFP+RFQ event did not produce both stage trades.");
  }
  return res as CreateEventResult & { technicalTradeUuid: string; pricingTradeUuid: string };
}
