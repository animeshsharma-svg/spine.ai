import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";

/** small helpers for unique, spottable test values */
const stamp = () => Date.now();
const uid = (o: any): string | undefined => o?.uuid ?? o?.data?.uuid ?? o?.id;

// ── Category ─────────────────────────────────────────────────────────────────
export interface CreatedCategory {
  uuid?: string;
  name: string;
  raw: any;
}

/** Create a product category (or a family when parentUuid is given). */
export async function createCategory(
  api: ApiClient,
  opts: { name?: string; hierarchyType?: "category" | "family" | "commodity"; parentUuid?: string } = {},
): Promise<CreatedCategory> {
  const name = opts.name ?? `API_Test_Category_${stamp()}`;
  const raw = await api.post<any>(Endpoints.productCategories(), {
    body: {
      name,
      hierarchy_type: opts.hierarchyType ?? "category",
      ...(opts.parentUuid ? { parent_uuid: opts.parentUuid } : {}),
    },
  });
  return { uuid: uid(raw), name, raw };
}

// ── Product ──────────────────────────────────────────────────────────────────
export interface CreatedProduct {
  uuid?: string;
  name: string;
  familyUuid: string;
  raw: any;
}

/**
 * Create a product. A product must sit under a *family* (subcategory), so we
 * create category → family → product (self-contained, no per-client lookup).
 */
export async function createProduct(api: ApiClient): Promise<CreatedProduct> {
  const category = await createCategory(api, { hierarchyType: "category" });
  if (!category.uuid) throw new Error("category create returned no uuid (needed as family parent)");
  const family = await createCategory(api, {
    name: `API_Test_Family_${stamp()}`,
    hierarchyType: "family",
    parentUuid: category.uuid,
  });
  if (!family.uuid) throw new Error("family create returned no uuid");

  const name = `API_Test_Product_${stamp()}`;
  const raw = await api.post<any>(Endpoints.createProduct(), {
    body: {
      name,
      category_uuid: family.uuid,
      variants: [{ name: "Variant 1", quality_params: [{ name: "Specs", value: "As per company" }] }],
      product_code: `APITEST${stamp()}`,
    },
  });
  return { uuid: raw?.product?.uuid ?? uid(raw), name, familyUuid: family.uuid, raw };
}

// ── Location (buyer hub) ─────────────────────────────────────────────────────
export interface CreatedLocation {
  uuid?: string;
  name: string;
  raw: any;
}

/** Resolve a city uuid for the client (needed to create a location). */
export async function resolveCityUuid(api: ApiClient): Promise<string> {
  for (const q of ["a", "de", "mu", "b"]) {
    const res = await api.get<any>(Endpoints.citiesAutocomplete(q));
    const cities = res?.cities ?? res?.data ?? (Array.isArray(res) ? res : []);
    const c = (cities as any[]).find((x) => x?.uuid);
    if (c?.uuid) return c.uuid;
  }
  throw new Error("No city found via /cities/autocomplete to attach the location to.");
}

export async function createLocation(api: ApiClient): Promise<CreatedLocation> {
  const cityUuid = await resolveCityUuid(api);
  const name = `API_Test_Location_${stamp()}`;
  const raw = await api.post<any>(Endpoints.createBuyerHub(), {
    body: {
      name,
      city_uuid: cityUuid,
      location_type: "buying_team_hub",
      location_code: `APILOC${stamp()}`,
      address: "API test address",
    },
  });
  return { uuid: uid(raw), name, raw };
}

// ── Team + User (permissions via team membership) ────────────────────────────
export interface CreatedTeam {
  uuid?: string;
  name: string;
  raw: any;
}
export interface CreatedUser {
  uuid?: string;
  name: string;
  email: string;
  phone: string;
  raw: any;
}

export async function createTeam(api: ApiClient, teamType = "purchase"): Promise<CreatedTeam> {
  const name = `API_Test_Team_${stamp()}`;
  const raw = await api.post<any>(Endpoints.createTeam(), {
    body: { name, team_type: teamType },
  });
  return { uuid: uid(raw), name, raw };
}

export async function createUser(
  api: ApiClient,
  opts: { role?: "member" | "manager" | "super_admin"; teams?: Array<{ uuid: string; role: string }> } = {},
): Promise<CreatedUser> {
  const s = stamp();
  const name = `API_Test_User_${s}`;
  const email = `apitest_${s}@example.com`;
  // valid-looking Indian mobile (98 + 8 digits), unlikely to collide
  const phone = `98${String(s).slice(-8)}`;
  const raw = await api.post<any>(Endpoints.createUser(), {
    body: {
      name,
      email,
      phone,
      phone_prefix: "+91",
      role: opts.role ?? "member",
      ...(opts.teams ? { teams: opts.teams } : {}),
    },
  });
  return { uuid: uid(raw), name, email, phone, raw };
}

/** Add a user to a team with a role (the permission-assignment step). */
export async function addTeamMember(
  api: ApiClient,
  teamUuid: string,
  userUuid: string,
  role = "member",
): Promise<any> {
  return api.post<any>(Endpoints.teamAddMember(), {
    body: { team_uuid: teamUuid, users: [{ uuid: userUuid, role }] },
  });
}
