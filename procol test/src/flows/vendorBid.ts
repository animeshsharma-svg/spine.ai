import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";
import { Catalog, CONFIG } from "../config.js";
import {
  buildBidProductsBody,
  buildCreateBid,
  buildStartTechnicalResponse,
  buildSubmitBidBody,
  buildSubmitTechnicalResponse,
  buildTechnicalAnswerBody,
  TradeProduct,
} from "./bodies.js";

export interface VendorBidContext {
  technicalTradeUuid: string;
  pricingTradeUuid: string;
  lineItemUuid: string;
  /** Vendor company the logged-in vendor bids as. Default: catalog. */
  vendorCompanyUuid?: string;
  /** Catalog (product/quality/location). Default: CONFIG.catalog. */
  catalog?: Catalog;
}

export interface VendorBidResult {
  tradeProduct: TradeProduct;
  templateResponseUuid: string;
  bidUuid: string;
  bidTotal: number;
  submitted: boolean;
}

/**
 * Vendor flow (mirrors the "vendor technical and bid" folder [11]→[18]):
 *   read pricing trade → read technical forms → technical response (start/fill/submit)
 *   → create bid → create bid products → submit bid.
 */
export async function submitVendorBid(
  vendorApi: ApiClient,
  ctx: VendorBidContext,
): Promise<VendorBidResult> {
  const { testData } = CONFIG;
  const catalog = ctx.catalog ?? CONFIG.catalog;
  const vendorCompanyUuid = ctx.vendorCompanyUuid ?? catalog.vendorBidCompanyUuid;

  // 11) pricing trade details → trade_product_* + product ids
  const pricingTrade = await vendorApi.get<any>(Endpoints.tradeDetails(ctx.pricingTradeUuid));
  const p = pricingTrade.order_details[0].product;
  const tradeProduct: TradeProduct = {
    trade_product_uuid: p.trade_product_uuid,
    trade_product_id: p.trade_product_id,
    trade_product_category_uuid: p.trade_product_category_uuid,
    product_id: p.id,
    product_code: p.product_code,
  };

  // 12) technical trade details → Line-Item form (form 1) uuid + page
  const techTrade = await vendorApi.get<any>(Endpoints.tradeDetails(ctx.technicalTradeUuid));
  const forms = techTrade.sheets.forms;
  const lineItemForm = forms[1];
  const formUuid = lineItemForm.uuid;
  const pageUuid = lineItemForm.page_uuids[0];

  // 13) start technical response
  const started = await vendorApi.post<{ uuid: string }>(Endpoints.templateResponses(), {
    body: buildStartTechnicalResponse({
      technicalTradeUuid: ctx.technicalTradeUuid,
      vendorCompanyUuid,
    }),
  });
  const templateResponseUuid = started.uuid;

  // 14) fill technical answers (line-item form)
  await vendorApi.put(Endpoints.createPageResponses(templateResponseUuid), {
    body: buildTechnicalAnswerBody({
      technicalTradeUuid: ctx.technicalTradeUuid,
      formUuid,
      pageUuid,
    }),
  });

  // 15) submit technical response
  await vendorApi.patch(Endpoints.templateResponse(templateResponseUuid), {
    body: buildSubmitTechnicalResponse({
      technicalTradeUuid: ctx.technicalTradeUuid,
      vendorCompanyUuid,
    }),
  });

  // 16) create bid
  const bid = await vendorApi.post<{ bid_uuid: string }>(Endpoints.createBid(), {
    body: buildCreateBid({
      pricingTradeUuid: ctx.pricingTradeUuid,
      vendorCompanyUuid,
    }),
  });
  const bidUuid = bid.bid_uuid;

  // 17) create bid products
  const { body: bidProductsBody, total } = buildBidProductsBody({
    pricingTradeUuid: ctx.pricingTradeUuid,
    vendorCompanyUuid,
    productUuid: catalog.productUuid,
    productQualityUuid: catalog.productQualityUuid,
    locationUuid: catalog.locationUuid,
    lineItemUuid: ctx.lineItemUuid,
    quantityValue: testData.quantityValue,
    quantityUnit: testData.quantityUnit,
    price: testData.bidPrice,
    tradeProduct,
  });
  await vendorApi.post(Endpoints.createBidProducts(bidUuid), { body: bidProductsBody });

  // 18) submit bid
  const submit = await vendorApi.patch<{ success?: boolean }>(Endpoints.submitBid(bidUuid), {
    body: buildSubmitBidBody({
      pricingTradeUuid: ctx.pricingTradeUuid,
      vendorCompanyUuid,
      total,
    }),
  });

  return {
    tradeProduct,
    templateResponseUuid,
    bidUuid,
    bidTotal: total,
    submitted: submit.success === true,
  };
}
