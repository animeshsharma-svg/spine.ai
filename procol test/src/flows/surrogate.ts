import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";
import { Catalog, CONFIG } from "../config.js";
import { buildSurrogateRfqBody, buildSurrogateTechnicalBody } from "./bodies.js";
import { fetchTechForms, fetchTradeProduct } from "./enrich.js";

export interface SurrogateContext {
  technicalTradeUuid: string;
  pricingTradeUuid: string;
  lineItemUuid: string;
  vendorCompanyUuid?: string;
  catalog?: Catalog;
}

export interface SurrogateResult {
  technicalPlaced: boolean;
  rfqPlaced: boolean;
}

/**
 * Buyer places a surrogate bid on behalf of the vendor (F3): technical response
 * for both forms + an RFQ price bid. No vendor login required.
 * Collection requests [24] + [25].
 */
export async function placeSurrogateBid(
  buyerApi: ApiClient,
  ctx: SurrogateContext,
): Promise<SurrogateResult> {
  const { testData } = CONFIG;
  const catalog = ctx.catalog ?? CONFIG.catalog;
  const vendorCompanyUuid = ctx.vendorCompanyUuid ?? catalog.vendorBidCompanyUuid;

  const forms = await fetchTechForms(buyerApi, ctx.technicalTradeUuid);
  const tradeProduct = await fetchTradeProduct(buyerApi, ctx.pricingTradeUuid);

  const tech = await buyerApi.post<{ success?: boolean }>(Endpoints.createSurrogateResponse(), {
    body: buildSurrogateTechnicalBody({
      technicalTradeUuid: ctx.technicalTradeUuid,
      vendorCompanyUuid,
      form0Page: forms.form0.page,
      form1Page: forms.form1.page,
    }),
  });

  const rfq = await buyerApi.post(Endpoints.surrogateRfqBid(), {
    body: buildSurrogateRfqBody({
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
    }),
  });

  return {
    technicalPlaced: tech?.success === true,
    rfqPlaced: rfq != null,
  };
}
