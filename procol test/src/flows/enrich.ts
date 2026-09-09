import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";
import type { TradeProduct } from "./bodies.js";

/** Read the pricing trade to get trade_product ids needed for bids/counters. */
export async function fetchTradeProduct(
  api: ApiClient,
  pricingTradeUuid: string,
): Promise<TradeProduct> {
  const trade = await api.get<any>(Endpoints.tradeDetails(pricingTradeUuid));
  const p = trade.order_details[0].product;
  return {
    trade_product_uuid: p.trade_product_uuid,
    trade_product_id: p.trade_product_id,
    trade_product_category_uuid: p.trade_product_category_uuid,
    product_id: p.id,
    product_code: p.product_code,
  };
}

export interface TechForms {
  form0: { uuid: string; page: string };
  form1: { uuid: string; page: string };
}

/** Read the technical trade to get form uuids + first page of each form. */
export async function fetchTechForms(
  api: ApiClient,
  technicalTradeUuid: string,
): Promise<TechForms> {
  const trade = await api.get<any>(Endpoints.tradeDetails(technicalTradeUuid));
  const forms = trade.sheets.forms;
  return {
    form0: { uuid: forms[0].uuid, page: forms[0].page_uuids[0] },
    form1: { uuid: forms[1].uuid, page: forms[1].page_uuids[0] },
  };
}
