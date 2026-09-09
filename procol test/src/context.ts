import { ApiClient } from "./api/client.js";
import { Catalog, CONFIG } from "./config.js";
import { resolveClient } from "./db/clients.js";
import { clientFromSession } from "./auth/sessionAuth.js";
import { resolveCatalog } from "./catalog/resolve.js";
import { resolveEvaluatorUuid } from "./catalog/users.js";
import { pickInvitableVendor } from "./flows/vendors.js";

export interface ClientContext {
  companyId: number;
  companyName: string | null;
  /** authenticated buyer (DB session → token, no OTP) */
  buyerApi: ApiClient;
  /** full catalog: resolved product/templates/location + invited vendor + flags */
  catalog: Catalog;
  /** a company user uuid to assign as the technical evaluator */
  evaluatorUuid: string;
  /** invited vendor (uuid + login email) */
  vendor: { uuid: string; email?: string; name?: string };
  dispose: () => Promise<void>;
}

/** The company to test: COMPANY_ID env, else a known-good default. */
export function activeCompanyId(): number {
  return process.env.COMPANY_ID ? Number(process.env.COMPANY_ID) : 212346;
}

/**
 * Resolve everything a flow needs for one client, entirely from DB + API:
 *   DB session → buyer token → catalog (API) → vendor (API) → evaluator (API).
 * Nothing is hardcoded per client.
 */
export async function resolveClientContext(
  companyId: number = activeCompanyId(),
): Promise<ClientContext> {
  const client = await resolveClient(companyId);
  const buyerApi = await clientFromSession(client.buyer, { app: "console" });

  const [cat, vendor] = await Promise.all([
    resolveCatalog(buyerApi),
    pickInvitableVendor(buyerApi),
  ]);
  const evaluator = await resolveEvaluatorUuid(buyerApi, client.buyer.email ?? undefined);

  const catalog: Catalog = {
    productUuid: cat.productUuid,
    productQualityUuid: cat.productQualityUuid,
    technicalTemplateUuid: cat.technicalTemplateUuid,
    pricingTemplateUuid: cat.pricingTemplateUuid,
    locationUuid: cat.locationUuid,
    vendorBidCompanyUuid: vendor.uuid,
    useRfqQuotes: CONFIG.catalog.useRfqQuotes,
  };

  return {
    companyId,
    companyName: client.companyName,
    buyerApi,
    catalog,
    evaluatorUuid: evaluator.uuid,
    vendor: { uuid: vendor.uuid, email: vendor.email, name: vendor.name },
    dispose: async () => {
      await buyerApi.dispose();
    },
  };
}
