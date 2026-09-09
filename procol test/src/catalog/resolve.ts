import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";

export interface ResolvedCatalog {
  productUuid: string;
  productQualityUuid: string;
  productName: string;
  technicalTemplateUuid: string;
  pricingTemplateUuid: string;
  locationUuid: string;
  locationName: string;
}

const first = <T = any>(arr: T[] | undefined): T | undefined =>
  Array.isArray(arr) ? arr[0] : undefined;

/**
 * Resolve a client's catalog (product + quality + templates + location) from
 * the authenticated API — the uuids are encoded, so the API (scoped to the
 * logged-in company) is the source of truth, not the DB.
 *
 * Picks the first product that has a variant (needed for the RFQ line item),
 * the default "Buy" trade template, an RFI/technical template, and the first
 * delivery location.
 */
export async function resolveCatalog(
  buyerApi: ApiClient,
  productQuery = "a",
): Promise<ResolvedCatalog> {
  // product + quality (variant)
  const prods = await buyerApi.get<any>(Endpoints.productsSearch(productQuery));
  const products: any[] = prods.products ?? [];
  const product = products.find((p) => first(p.variants)?.uuid) ?? products[0];
  if (!product) throw new Error(`No products found for query "${productQuery}".`);
  const variant = first<any>(product.variants);
  if (!variant?.uuid) throw new Error(`Product "${product.name}" has no variant/quality to bid on.`);

  // templates: pricing = trade (prefer default "Buy" template), technical = rfi
  const trade = await buyerApi.get<any>(Endpoints.templatesByType("trade"));
  const pricingTpl = first<any>(trade.default) ?? first<any>(trade.saved);
  if (!pricingTpl?.uuid) throw new Error("No trade/pricing template available.");

  const rfi = await buyerApi.get<any>(Endpoints.templatesByType("rfi"));
  const technicalTpl = first<any>(rfi.default) ?? first<any>(rfi.saved);
  if (!technicalTpl?.uuid) throw new Error("No rfi/technical template available.");

  // location (delivery hub)
  const hubs = await buyerApi.get<any>(Endpoints.buyerHubsAutocomplete(productQuery));
  const hub = first<any>(hubs.buyer_hubs);
  if (!hub?.uuid) throw new Error("No delivery location (buyer_hub) available.");

  return {
    productUuid: product.uuid,
    productQualityUuid: variant.uuid,
    productName: product.name,
    technicalTemplateUuid: technicalTpl.uuid,
    pricingTemplateUuid: pricingTpl.uuid,
    locationUuid: hub.uuid,
    locationName: hub.name,
  };
}
