import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";
import { CONFIG } from "../config.js";
import { buildAuctionBody, buildItemVersionBody, stageTiming, StageTiming } from "./bodies.js";

/** F2 — create a new version of an event group [23]. */
export async function versionEvent(buyerApi: ApiClient, eventGroupUuid: string) {
  const res = await buyerApi.post<{
    uuid: string;
    new_item_data?: { uuid?: string; trade_uuids?: string[] };
  }>(Endpoints.itemVersions(), { body: buildItemVersionBody({ eventGroupUuid }) });
  return {
    versionUuid: res.uuid,
    versionedEventUuid: res.new_item_data?.uuid,
    versionedTradeUuids: res.new_item_data?.trade_uuids ?? [],
  };
}

/** F5 — convert the RFQ stage into an auction [27]. */
export async function convertToAuction(
  buyerApi: ApiClient,
  ctx: { pricingTradeUuid: string; lineItemUuid: string },
  timing?: StageTiming,
) {
  const { catalog, testData } = CONFIG;
  const t = timing ?? stageTiming(Math.floor(Date.now() / 1000), 600);
  const res = await buyerApi.post<{ uuid: string; status: string }>(Endpoints.moveToAuction(), {
    body: buildAuctionBody({
      pricingTradeUuid: ctx.pricingTradeUuid,
      vendorCompanyUuid: catalog.vendorBidCompanyUuid,
      productUuid: catalog.productUuid,
      productQualityUuid: catalog.productQualityUuid,
      locationUuid: catalog.locationUuid,
      lineItemUuid: ctx.lineItemUuid,
      pricingTemplateUuid: catalog.pricingTemplateUuid,
      quantityValue: testData.quantityValue,
      quantityUnit: testData.quantityUnit,
      useRfqQuotes: catalog.useRfqQuotes,
      timing: t,
    }),
  });
  return { auctionTradeUuid: res.uuid, status: res.status };
}
