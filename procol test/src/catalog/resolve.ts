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

// ── alternatives, for a run that must try again with different data ──────────

export interface ProductChoice {
  uuid: string;
  name: string;
  /** the first variant (quality) — what the line item is raised against */
  qualityUuid: string;
  /** the product's own units, as the app displays them ("KG", "Nos") */
  units: string[];
}

export interface TemplateChoice {
  uuid: string;
  name: string;
  /** "default" templates are Procol's own; "saved" ones are the company's */
  source: "default" | "saved";
}

export interface LocationChoice {
  uuid: string;
  name: string;
}

/**
 * Every usable option the app offers this company for the things an event is
 * built from, in the app's own order. `resolveCatalog` takes the first of each;
 * a run whose first pick is refused ("The unit kg is not present", "Template
 * not found") needs the others to try next. Each list is read on its own and a
 * list that cannot be read is empty with the reason in `problems`, so one
 * failing endpoint never costs the others. Never throws.
 */
export interface CatalogAlternatives {
  products: ProductChoice[];
  /** the company's active units (GET /units — the list the backend checks a unit against) */
  units: string[];
  pricingTemplates: TemplateChoice[];
  technicalTemplates: TemplateChoice[];
  locations: LocationChoice[];
  problems: string[];
}

export async function resolveCatalogAlternatives(
  buyerApi: ApiClient,
  productQuery = "a",
): Promise<CatalogAlternatives> {
  const problems: string[] = [];
  const read = async (what: string, path: string): Promise<any> => {
    try {
      const r = await buyerApi.attempt<any>("GET", path);
      if (!r.ok) {
        problems.push(`${what}: HTTP ${r.status}${r.errorMessage ? ` — ${r.errorMessage}` : ""}`);
        return undefined;
      }
      return r.data;
    } catch (e) {
      problems.push(`${what}: ${(e as Error).message}`);
      return undefined;
    }
  };
  const [prods, units, trade, rfi, hubs] = await Promise.all([
    read("products", Endpoints.productsSearch(productQuery)),
    read("units", "/units"),
    read("pricing templates", Endpoints.templatesByType("trade")),
    read("technical templates", Endpoints.templatesByType("rfi")),
    read("delivery locations", Endpoints.buyerHubsAutocomplete(productQuery)),
  ]);

  const products: ProductChoice[] = [];
  for (const p of (prods?.products ?? []) as any[]) {
    const v = first<any>(p?.variants);
    if (!p?.uuid || !v?.uuid) continue;
    products.push({
      uuid: String(p.uuid),
      name: String(p.name ?? p.uuid),
      qualityUuid: String(v.uuid),
      units: (Array.isArray(p.units) ? p.units : [])
        .filter((u: any) => u?.symbol && (u.status === undefined || u.status === "active"))
        .map((u: any) => String(u.symbol)),
    });
  }

  const unitList: string[] = (Array.isArray(units) ? units : [])
    .filter((u: any) => u?.symbol && (u.status === undefined || u.status === "active"))
    .map((u: any) => String(u.symbol));

  const templates = (d: any): TemplateChoice[] => [
    ...((d?.default ?? []) as any[]).filter((t) => t?.uuid).map((t) => ({ uuid: String(t.uuid), name: String(t.name ?? t.uuid), source: "default" as const })),
    ...((d?.saved ?? []) as any[]).filter((t) => t?.uuid).map((t) => ({ uuid: String(t.uuid), name: String(t.name ?? t.uuid), source: "saved" as const })),
  ];

  const locations: LocationChoice[] = ((hubs?.buyer_hubs ?? []) as any[])
    .filter((h) => h?.uuid && (h.status === undefined || h.status === "active"))
    .map((h) => ({ uuid: String(h.uuid), name: String(h.name ?? h.display_name ?? h.uuid) }));

  return {
    products,
    units: unitList,
    pricingTemplates: templates(trade),
    technicalTemplates: templates(rfi),
    locations,
    problems,
  };
}
