/**
 * CHECK SUITES — the executable test cases per flow.
 *
 * Each suite = a valid baseline request + one check per field edge case
 * (from fields.ts) + flow-specific extras. Every check fires a REAL request
 * against UAT. Add a new flow = add a suite here.
 */
import type { TestType } from "../ai/types.js";
import { Check, Client, apiAttempt } from "./engine.js";
import { FieldSpec, Variant, OMIT, variantsFor } from "./fields.js";
import { buildReadChecks, isReadSuite, READ_SUITE_META } from "./readSuites.js";

// ── mapping helpers ───────────────────────────────────────────────────────
function catToType(category: string): TestType {
  if (category === "Functional") return "functional";
  if (category === "Security") return "non-functional";
  if (category === "Boundary" || category === "Edge") return "edge";
  return "data-validation"; // Data Validation / Negative
}
const sevToPri: Record<string, string> = { Critical: "P0", High: "P1", Medium: "P2", Low: "P2" };
function describe(name: string, value: any): string {
  if (value === OMIT) return `${name}: (omitted)`;
  let s = typeof value === "string" ? value : JSON.stringify(value);
  if (s.length > 50) s = s.slice(0, 50) + `… (${s.length} chars)`;
  return `${name} = ${s}`;
}

// ── generic suite builder ─────────────────────────────────────────────────
interface SuiteDef {
  flowId: string;
  module: string;
  endpoint: string;
  idPrefix: string;
  functionalTitle: string;
  makeBase: () => any; // a fresh, fully-valid payload
  fields: FieldSpec[];
  setField?: (payload: any, name: string, value: any) => void;
  extras?: (h: { mk: (p: Partial<Check>) => Check; makeBase: () => any; post: (p: any) => Promise<any> }) => Check[];
}

function buildSuite(def: SuiteDef, client: Client): Check[] {
  const checks: Check[] = [];
  let n = 1;
  const nextId = () => `CHK-${def.idPrefix}-${String(n++).padStart(2, "0")}`;
  const setField =
    def.setField ??
    ((p: any, name: string, val: any) => {
      if (val === OMIT) delete p[name];
      else p[name] = val;
    });
  const post = (payload: any) => apiAttempt(client.ctx.buyerApi, def.endpoint, payload);

  // 1) functional baseline
  checks.push({
    id: nextId(),
    flowId: def.flowId,
    module: def.module,
    scenario: def.functionalTitle,
    type: "functional",
    category: "Functional",
    priority: "P0",
    severity: "Critical",
    expected: "accept",
    layer: "api",
    inputSummary: "all fields valid",
    exec: () => post(def.makeBase()),
  });

  // 2) one check per field edge case
  for (const f of def.fields) {
    for (const vv of variantsFor(f)) {
      checks.push({
        id: nextId(),
        flowId: def.flowId,
        module: def.module,
        field: f.name,
        scenario: `${f.label}: ${vv.label}`,
        type: catToType(vv.category),
        category: vv.category,
        priority: sevToPri[vv.severity] ?? "P2",
        severity: vv.severity,
        expected: vv.expected,
        layer: "api",
        inputSummary: describe(f.name, vv.value),
        exec: () => {
          const p = def.makeBase();
          setField(p, f.name, vv.value);
          return post(p);
        },
      });
    }
  }

  // 3) flow-specific extras
  if (def.extras) {
    const mk = (p: Partial<Check>): Check =>
      ({ id: nextId(), flowId: def.flowId, module: def.module, layer: "api", ...(p as any) });
    checks.push(...def.extras({ mk, makeBase: def.makeBase, post }));
  }
  return checks;
}

// ── flow suites ───────────────────────────────────────────────────────────
const stamp = () => Date.now();

function userDef(): SuiteDef {
  return {
    flowId: "masterdata.user_permissions",
    module: "User Management",
    endpoint: "/users/create_user",
    idPrefix: "USR",
    functionalTitle: "Create a user with all valid details",
    makeBase: () => ({
      name: `QA_Platform_User_${stamp()}`,
      email: `qa_${stamp()}_${Math.floor(Math.random() * 1e4)}@example.com`,
      phone: `98${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`,
      phone_prefix: "+91",
      role: "member",
    }),
    fields: [
      { name: "name", type: "text", label: "Name", required: true },
      { name: "email", type: "email", label: "Email", required: true },
      { name: "phone", type: "phone", label: "Phone", required: true },
      { name: "role", type: "enum", label: "Role", required: true, enumValues: ["member", "manager", "super_admin"] },
    ],
    // Deepen the suite: the `phone_prefix` must be "+91". A plain enum field
    // mishandles the "+91" wrong-case case, so we spell these out precisely.
    extras: ({ mk, makeBase, post }) => [
      mk({
        field: "phone_prefix",
        scenario: "Phone prefix: wrong country (+1)",
        type: "data-validation",
        category: "Data Validation",
        priority: "P1",
        severity: "High",
        expected: "reject",
        inputSummary: "phone_prefix = +1",
        exec: () => post({ ...makeBase(), phone_prefix: "+1" }),
      }),
      mk({
        field: "phone_prefix",
        scenario: "Phone prefix: missing plus (91)",
        type: "edge",
        category: "Edge",
        priority: "P2",
        severity: "Medium",
        expected: "reject",
        inputSummary: "phone_prefix = 91",
        exec: () => post({ ...makeBase(), phone_prefix: "91" }),
      }),
      mk({
        field: "phone_prefix",
        scenario: "Phone prefix: empty",
        type: "data-validation",
        category: "Data Validation",
        priority: "P1",
        severity: "High",
        expected: "reject",
        inputSummary: "phone_prefix = (empty)",
        exec: () => post({ ...makeBase(), phone_prefix: "" }),
      }),
      mk({
        field: "phone_prefix",
        scenario: "Phone prefix: omitted",
        type: "data-validation",
        category: "Data Validation",
        priority: "P1",
        severity: "High",
        expected: "reject",
        inputSummary: "phone_prefix = (omitted)",
        exec: () => {
          const p = makeBase();
          delete p.phone_prefix;
          return post(p);
        },
      }),
    ],
  };
}

function categoryDef(): SuiteDef {
  return {
    flowId: "masterdata.category",
    module: "Master Data",
    endpoint: "/product_categories",
    idPrefix: "CAT",
    functionalTitle: "Create a product category with valid details",
    makeBase: () => ({ name: `QA_Platform_Category_${stamp()}`, hierarchy_type: "category" }),
    fields: [
      { name: "name", type: "text", label: "Category name", required: true },
      { name: "hierarchy_type", type: "enum", label: "Hierarchy type", required: true, enumValues: ["category", "family", "commodity"] },
    ],
  };
}

function subcategoryDef(parentUuid: string): SuiteDef {
  return {
    flowId: "masterdata.subcategory",
    module: "Master Data",
    endpoint: "/product_categories",
    idPrefix: "SUBCAT",
    functionalTitle: "Create a family (sub-category) under a valid parent category",
    makeBase: () => ({ name: `QA_Platform_Family_${stamp()}`, hierarchy_type: "family", parent_uuid: parentUuid }),
    fields: [
      { name: "name", type: "text", label: "Family name", required: true },
      { name: "hierarchy_type", type: "enum", label: "Hierarchy type", required: true, enumValues: ["category", "family", "commodity"] },
    ],
    // The new dimension: this suite attacks the PARENT LINK (a foreign key),
    // something none of the flat-form suites test.
    extras: ({ mk, makeBase, post }) => [
      mk({
        field: "parent_uuid",
        scenario: "Parent category: non-existent uuid",
        type: "data-validation",
        category: "Negative",
        priority: "P1",
        severity: "High",
        expected: "reject",
        inputSummary: "parent_uuid = INVALID_UUID==",
        exec: () => {
          const p = makeBase();
          p.parent_uuid = "INVALID_UUID==";
          return post(p);
        },
      }),
      mk({
        field: "parent_uuid",
        scenario: "Parent category: omitted (a family must sit under a parent)",
        type: "data-validation",
        category: "Data Validation",
        priority: "P1",
        severity: "High",
        expected: "reject",
        inputSummary: "parent_uuid = (omitted)",
        exec: () => {
          const p = makeBase();
          delete p.parent_uuid;
          return post(p);
        },
      }),
    ],
  };
}

async function setupParentCategory(client: Client): Promise<string> {
  const api = client.ctx.buyerApi;
  const uid = (o: any) => o?.uuid ?? o?.data?.uuid ?? o?.id;
  const cat: any = await api.post("/product_categories", { body: { name: `QA_Platform_ParentCat_${stamp()}`, hierarchy_type: "category" } });
  const u = uid(cat);
  if (!u) throw new Error("Could not create a parent category for the sub-category suite.");
  return u;
}

function eventDef(client: Client): SuiteDef {
  const cat = client.ctx.catalog;
  const base = () => ({
    status: "draft",
    title: `QA_Platform_Event_${stamp()}`,
    line_items: [
      { product_uuid: cat.productUuid, product_quality_uuid: cat.productQualityUuid, quantity: { unitSymbol: "Nos", value: 10 } },
    ],
  });
  return {
    flowId: "events.rfp_rfq",
    module: "Event Management",
    endpoint: "/event_groups",
    idPrefix: "EVT",
    functionalTitle: "Create a draft event group with valid line items",
    makeBase: base,
    fields: [
      { name: "title", type: "text", label: "Event title", required: true },
      { name: "quantity", type: "number", label: "Line-item quantity", required: true, minValue: 1 },
    ],
    setField: (p, name, val) => {
      if (name === "title") {
        if (val === OMIT) delete p.title;
        else p.title = val;
      } else if (name === "quantity") {
        if (val === OMIT) delete p.line_items[0].quantity;
        else p.line_items[0].quantity.value = val;
      }
    },
    extras: ({ mk, makeBase, post }) => [
      mk({
        field: "line_items",
        scenario: "Line items: empty list",
        type: "data-validation",
        category: "Data Validation",
        priority: "P1",
        severity: "High",
        expected: "reject",
        inputSummary: "line_items = []",
        exec: () => post({ ...makeBase(), line_items: [] }),
      }),
      mk({
        field: "product_uuid",
        scenario: "Line items: non-existent product uuid",
        type: "data-validation",
        category: "Negative",
        priority: "P1",
        severity: "High",
        expected: "reject",
        inputSummary: "product_uuid = INVALID_UUID==",
        exec: () => {
          const p = makeBase();
          p.line_items[0].product_uuid = "INVALID_UUID==";
          return post(p);
        },
      }),
    ],
  };
}

function productDef(familyUuid: string): SuiteDef {
  return {
    flowId: "masterdata.product",
    module: "Master Data",
    endpoint: "/products",
    idPrefix: "PRD",
    functionalTitle: "Create a product with valid details",
    makeBase: () => ({
      name: `QA_Platform_Product_${stamp()}`,
      category_uuid: familyUuid,
      variants: [{ name: "Variant 1", quality_params: [{ name: "Specs", value: "As per company" }] }],
      product_code: `QA${stamp()}`,
    }),
    fields: [
      { name: "name", type: "text", label: "Product name", required: true },
      { name: "product_code", type: "text", label: "Product code", required: true },
    ],
  };
}

async function setupFamily(client: Client): Promise<string> {
  const api = client.ctx.buyerApi;
  const uid = (o: any) => o?.uuid ?? o?.data?.uuid ?? o?.id;
  const cat: any = await api.post("/product_categories", { body: { name: `QA_Platform_Cat_${stamp()}`, hierarchy_type: "category" } });
  const fam: any = await api.post("/product_categories", { body: { name: `QA_Platform_Fam_${stamp()}`, hierarchy_type: "family", parent_uuid: uid(cat) } });
  return uid(fam);
}

function teamDef(): SuiteDef {
  return {
    flowId: "masterdata.team",
    module: "Master Data",
    endpoint: "/teams",
    idPrefix: "TEAM",
    functionalTitle: "Create a team with valid details",
    makeBase: () => ({ name: `QA_Platform_Team_${stamp()}`, team_type: "purchase" }),
    fields: [
      { name: "name", type: "text", label: "Team name", required: true },
      { name: "team_type", type: "enum", label: "Team type", required: true, enumValues: ["purchase"] },
    ],
  };
}

function teamMemberDef(teamUuid: string, userUuid: string): SuiteDef {
  return {
    flowId: "masterdata.team_member",
    module: "User Management",
    endpoint: "/teams/add_member_dashboard",
    idPrefix: "TMEM",
    functionalTitle: "Add a user to a team with a valid role",
    makeBase: () => ({ team_uuid: teamUuid, users: [{ uuid: userUuid, role: "member" }] }),
    fields: [
      { name: "role", type: "enum", label: "Member role", required: true, enumValues: ["member", "manager"] },
    ],
    // role lives inside users[0], so the setter reaches into the nested shape.
    setField: (p, name, val) => {
      if (name === "role") {
        if (val === OMIT) delete p.users[0].role;
        else p.users[0].role = val;
      }
    },
    // The new dimension: BOTH sides of the membership are foreign keys.
    extras: ({ mk, makeBase, post }) => [
      mk({
        field: "team_uuid",
        scenario: "Team: non-existent uuid",
        type: "data-validation",
        category: "Negative",
        priority: "P1",
        severity: "High",
        expected: "reject",
        inputSummary: "team_uuid = INVALID_UUID==",
        exec: () => {
          const p = makeBase();
          p.team_uuid = "INVALID_UUID==";
          return post(p);
        },
      }),
      mk({
        field: "user_uuid",
        scenario: "User: non-existent uuid",
        type: "data-validation",
        category: "Negative",
        priority: "P1",
        severity: "High",
        expected: "reject",
        inputSummary: "users[0].uuid = INVALID_UUID==",
        exec: () => {
          const p = makeBase();
          p.users[0].uuid = "INVALID_UUID==";
          return post(p);
        },
      }),
    ],
  };
}

async function setupTeamAndUser(client: Client): Promise<{ teamUuid: string; userUuid: string }> {
  const api = client.ctx.buyerApi;
  const uid = (o: any) =>
    o?.uuid ?? o?.data?.uuid ?? o?.user?.uuid ?? o?.data?.user?.uuid ?? o?.id;
  const team: any = await api.post("/teams", { body: { name: `QA_Platform_Team_${stamp()}`, team_type: "purchase" } });
  const user: any = await api.post("/users/create_user", {
    body: {
      name: `QA_Platform_User_${stamp()}`,
      email: `qa_${stamp()}_${Math.floor(Math.random() * 1e4)}@example.com`,
      phone: `98${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`,
      phone_prefix: "+91",
      role: "member",
    },
  });
  const teamUuid = uid(team);
  const userUuid = uid(user);
  if (!teamUuid || !userUuid) throw new Error("Could not set up a team + user for the team-member suite.");
  return { teamUuid, userUuid };
}

function locationDef(cityUuid: string): SuiteDef {
  return {
    flowId: "masterdata.location",
    module: "Master Data",
    endpoint: "/buyer_hubs/create",
    idPrefix: "LOC",
    functionalTitle: "Create a location (buyer hub) with valid details",
    makeBase: () => ({
      name: `QA_Platform_Location_${stamp()}`,
      city_uuid: cityUuid,
      location_type: "buying_team_hub",
      location_code: `QALOC${stamp()}`,
      address: "QA Platform address",
    }),
    fields: [
      { name: "name", type: "text", label: "Location name", required: true },
      { name: "location_type", type: "enum", label: "Location type", required: true, enumValues: ["buying_team_hub", "delivery_center"] },
    ],
    extras: ({ mk, makeBase, post }) => [
      mk({
        field: "city_uuid",
        scenario: "Non-existent city uuid",
        type: "data-validation",
        category: "Negative",
        priority: "P1",
        severity: "High",
        expected: "reject",
        inputSummary: "city_uuid = INVALID_UUID==",
        exec: () => {
          const p = makeBase();
          p.city_uuid = "INVALID_UUID==";
          return post(p);
        },
      }),
    ],
  };
}

async function setupCity(client: Client): Promise<string> {
  const api = client.ctx.buyerApi;
  for (const q of ["a", "de", "mu", "b"]) {
    const res: any = await api.get(`/cities/autocomplete?query=${q}&additional_fields=countries`).catch(() => null);
    const cities = res?.cities ?? res?.data ?? (Array.isArray(res) ? res : []);
    const c = (cities as any[]).find((x) => x?.uuid);
    if (c?.uuid) return c.uuid;
  }
  throw new Error("Could not resolve a city uuid for the location suite.");
}

function boqDef(client: Client): SuiteDef {
  const cat = client.ctx.catalog;
  const base = () => ({
    status: "draft",
    title: `QA_Platform_BOQ_${stamp()}`,
    config: { boq_based_rfx: true },
    line_items: [
      { product_uuid: cat.productUuid, product_quality_uuid: cat.productQualityUuid, quantity: { unitSymbol: "Nos", value: 10 } },
    ],
  });
  return {
    flowId: "events.boq",
    module: "Event Management",
    endpoint: "/event_groups",
    idPrefix: "BOQ",
    functionalTitle: "Create a BOQ draft event group (config.boq_based_rfx) with valid line items",
    makeBase: base,
    fields: [
      { name: "title", type: "text", label: "BOQ title", required: true },
      { name: "quantity", type: "number", label: "Line-item quantity", required: true, minValue: 1 },
    ],
    setField: (p, name, val) => {
      if (name === "title") {
        if (val === OMIT) delete p.title;
        else p.title = val;
      } else if (name === "quantity") {
        if (val === OMIT) delete p.line_items[0].quantity;
        else p.line_items[0].quantity.value = val;
      }
    },
    extras: ({ mk, makeBase, post }) => [
      mk({
        field: "line_items",
        scenario: "Line items: empty list",
        type: "data-validation",
        category: "Data Validation",
        priority: "P1",
        severity: "High",
        expected: "reject",
        inputSummary: "line_items = []",
        exec: () => post({ ...makeBase(), line_items: [] }),
      }),
    ],
  };
}

// ── public API ────────────────────────────────────────────────────────────
/** A stable key so several event flow ids share the one event suite. */
export function suiteKey(flowId: string): string | null {
  if (isReadSuite(flowId)) return flowId; // read suites are keyed by their own id
  if (flowId === "events.boq") return "boq";
  if (flowId.startsWith("events.")) return "event";
  if (flowId === "masterdata.user_permissions") return "user";
  if (flowId === "masterdata.subcategory") return "subcategory";
  if (flowId === "masterdata.category") return "category";
  if (flowId === "masterdata.product") return "product";
  if (flowId === "masterdata.location") return "location";
  if (flowId === "masterdata.team") return "team";
  if (flowId === "masterdata.team_member") return "team_member";
  return null;
}

export function hasSuite(flowId: string): boolean {
  return suiteKey(flowId) !== null;
}

/**
 * Every runnable suite, for the UI's "Validation suites" panel.
 * `kind` tells the user what a suite does: "write" suites submit forms (they
 * create clearly-named QA_Platform_* sandbox records); "read" suites only fuzz
 * parameters on GET endpoints and create nothing.
 */
export interface SuiteInfo {
  id: string;
  label: string;
  module: string;
  kind: "write" | "read";
}

export const ALL_SUITES: SuiteInfo[] = [
  { id: "masterdata.user_permissions", label: "Create user (name/email/phone/role/prefix)", module: "User Management", kind: "write" },
  { id: "masterdata.category", label: "Create category", module: "Master Data", kind: "write" },
  { id: "masterdata.subcategory", label: "Create sub-category (parent link)", module: "Master Data", kind: "write" },
  { id: "masterdata.product", label: "Create product", module: "Master Data", kind: "write" },
  { id: "masterdata.location", label: "Create location", module: "Master Data", kind: "write" },
  { id: "masterdata.team", label: "Create team", module: "Master Data", kind: "write" },
  { id: "masterdata.team_member", label: "Add team member (needs team-admin rights)", module: "User Management", kind: "write" },
  { id: "events.rfp_rfq", label: "Create draft event", module: "Event Management", kind: "write" },
  { id: "events.boq", label: "Create BOQ event", module: "Event Management", kind: "write" },
  ...READ_SUITE_META.map((m) => ({ ...m, kind: "read" as const })),
];

/** Build the executable checks for one flow (async because some need setup). */
export async function buildChecksForFlow(client: Client, flowId: string): Promise<Check[]> {
  if (isReadSuite(flowId)) return buildReadChecks(client, flowId);
  switch (suiteKey(flowId)) {
    case "user":
      return buildSuite(userDef(), client);
    case "category":
      return buildSuite(categoryDef(), client);
    case "subcategory": {
      const parent = await setupParentCategory(client);
      return buildSuite(subcategoryDef(parent), client);
    }
    case "event":
      return buildSuite(eventDef(client), client);
    case "product": {
      const fam = await setupFamily(client);
      return buildSuite(productDef(fam), client);
    }
    case "team":
      return buildSuite(teamDef(), client);
    case "team_member": {
      const { teamUuid, userUuid } = await setupTeamAndUser(client);
      return buildSuite(teamMemberDef(teamUuid, userUuid), client);
    }
    case "location": {
      const city = await setupCity(client);
      return buildSuite(locationDef(city), client);
    }
    case "boq":
      return buildSuite(boqDef(client), client);
    default:
      return [];
  }
}
