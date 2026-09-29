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
  /** users.id behind buyerApi — rows this user stages (e.g. vendor bulk upload jobs) are keyed by it */
  buyerUserId: number;
  /** full catalog: resolved product/templates/location + invited vendor + flags */
  catalog: Catalog;
  /** a company user uuid to assign as the technical evaluator */
  evaluatorUuid: string;
  /** that user's phone exactly as stored (what generate_otp matches), when it is one the backend accepts */
  evaluatorPhone?: string;
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
  /**
   * Send this context's calls somewhere other than the configured host.
   *
   * The base URL is otherwise fixed per client at module load, which is right
   * for a suite run and wrong for a platform where someone picks the target in
   * the UI. `clientFromSession` already took a baseURL; nothing passed one.
   * Optional, so every existing caller is unchanged.
   */
  baseURL?: string,
): Promise<ClientContext> {
  const client = await resolveClient(companyId);
  const buyerApi = await clientFromSession(client.buyer, { app: "console", companyId, ...(baseURL ? { baseURL } : {}) });

  const [cat, vendor] = await Promise.all([
    resolveCatalog(buyerApi),
    pickInvitableVendor(buyerApi),
  ]);
  const evaluator = await resolveEvaluatorUuid(buyerApi, client.buyer.email ?? undefined, companyId);

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
    buyerUserId: client.buyer.userId,
    catalog,
    evaluatorUuid: evaluator.uuid,
    evaluatorPhone: evaluator.phone,
    vendor: { uuid: vendor.uuid, email: vendor.email, name: vendor.name },
    dispose: async () => {
      await buyerApi.dispose();
    },
  };
}
