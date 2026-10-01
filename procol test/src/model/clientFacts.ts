/**
 * LIVE CLIENT FACTS — what one client really has for building a sourcing event.
 *
 * Read-only by construction:
 *   - API: GET only, as the client's own buyer (the DB session → token path the
 *     rest of the framework uses; no OTP, nothing created).
 *   - Procol DB: SELECT only, through `query()` in ../db/pool.ts, and every
 *     statement here goes through `select()` which refuses anything else.
 *
 * What it gathers (each item says where the rule behind it lives in the backend):
 *   templates   every template the event screen can offer, per template type,
 *               with each template's full field list (GET /templates/:uuid)
 *   units       the client's usable units + the scope rule that decides them
 *               (unit.rb:48-66 — company-only when material codification or
 *               get_company_only_units is on, else company + Procol-wide units)
 *   products    active products / qualities, and products whose linked unit is
 *               NOT usable by this client (the GMMCO 47053 failure class)
 *   vendors     who can be invited (companies_controller.rb:487-488: status in
 *               allowed_statuses_for_vendor, default active+invited; source 0/1)
 *   config      the settings that change how an event behaves
 *   gates       per-feature on/off (src/db/featureGates.ts)
 *
 * Never throws for a partial failure: each section records its own error and
 * the rest still comes back.
 */
import { createHash } from "node:crypto";
import type { ApiClient } from "../api/client.js";
import { query } from "../db/pool.js";
import { resolveClient } from "../db/clients.js";
import { clientFromSession } from "../auth/sessionAuth.js";

/** Template types the event screens ask for (templates_controller.rb:119 accepts only Template::TEMPLATE_FOR_TYPES). */
export const EVENT_TEMPLATE_TYPES = ["trade", "rfi", "boq", "service", "vendor_assessment", "site_visit"] as const;
export type EventTemplateType = (typeof EVENT_TEMPLATE_TYPES)[number];

export interface TemplateListItem {
  uuid: string;
  name: string;
  templateType: string; // default | custom | dynamic
  orderType?: string | null; // buy | sell
  typeIdentifier: string[]; // t-trade, t-boq …
  templateFor: string[];
  updatedAt?: number;
  isDefault: boolean; // came from the "default" list
}

export interface SectionError {
  section: string;
  message: string;
}

export interface UnitRow {
  id: number;
  symbol: string;
  name: string;
  companyId: number | null;
  baseUnitId: number | null;
  conversionFactor: number | null;
}

export interface ClientFacts {
  companyId: number;
  companyName: string | null;
  fetchedAt: string;
  actor: { userId: number; role: number | null; email: string | null };
  /** per template type: what GET /templates returned (default + saved) */
  templatesByType: Record<string, { default: TemplateListItem[]; saved: TemplateListItem[]; error?: string }>;
  /** GET /templates/:uuid, raw (fields live in widgets.inline_components / global_price_components / forms) */
  templateDetails: Record<string, any>;
  units: {
    /** GET /units — the list the buyer's screen offers */
    api: Array<{ uuid: string; name: string; symbol: string; conversion_factor?: number }>;
    /** the rows Unit.for_company would return (company rows, plus Procol-wide rows unless company-only) */
    usable: UnitRow[];
    scope: { materialCodification: unknown; companyOnlyUnits: unknown; companyOnly: boolean; companyRows: number; procolWideRows: number };
    defaultUnit: unknown;
    allowUserToAddUom: unknown;
  };
  products: {
    active: number;
    activeQualities: number;
    withUnitLinks: number;
    /**
     * unit symbols linked to this client's products that the client cannot use.
     * Only ACTIVE linked units count: a product's unit list skips inactive units
     * (product.rb:64), so the screen never pre-selects them; and the server
     * matches by symbol (trade_template_helper.rb:1399), so a link to an
     * inactive row whose symbol the client also has active is harmless.
     */
    unusableUnitLinks: Array<{ symbol: string; unitName: string; unitOwnerCompanyId: number | null; products: number; sample: string[] }>;
    productsWithUnusableUnit: number;
    sample: Array<{ name: string; code: string | null; qualities: number; units: string[]; usable: boolean; why?: string }>;
    apiSample: Array<{ uuid: string; name: string; code?: string; variants: number }>;
  };
  locations: { active: number };
  /** options behind dropdowns whose list comes from the client's own data (dropdown_data "/widget_data_mapping?type=<key>") */
  dropdownOptions: Record<string, { count: number; values: string[] }>;
  vendors: {
    byStatus: Record<string, number>;
    allowedStatuses: string[];
    allowedStatusesFrom: string;
    invitable: number;
    qaSafe: Array<{ name: string; status: string }>;
  };
  config: Record<string, unknown>;
  permissions: { count: number; sample: string[] };
  gates: Record<string, { on: boolean | null; reasons: string[] }>;
  errors: SectionError[];
  /** sha256 over everything except fetchedAt — equal hash = nothing changed */
  hash: string;
}

// ── small helpers ────────────────────────────────────────────────────────────

const WRITE_WORDS = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|merge|call|vacuum|lock)\b/i;

/** SELECT-only guard around the shared pool. */
async function select<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const s = sql.trim();
  if (!/^(select|with)\b/i.test(s)) throw new Error("refused: only SELECT/WITH is allowed here");
  if (s.replace(/;\s*$/, "").includes(";")) throw new Error("refused: one statement only");
  if (WRITE_WORDS.test(s.replace(/'[^']*'/g, "''"))) throw new Error("refused: write keyword in a read");
  return query<T>(s, params);
}

/**
 * A company's resolved setting, exactly as CustomConfiguration.cached_all_configs
 * resolves it (custom_configuration.rb:164-173): company override → master default
 * for this company → Procol global default. Same SQL as config/featureGates.json.
 */
export async function readCompanyConfig(companyId: number, key: string): Promise<{ value: unknown; source: string }> {
  const rows = await select<{ value: unknown; source: string }>(
    `WITH c AS (SELECT modifications->'value' AS v FROM custom_configurations
                 WHERE company_id = $1 AND item_type = 'Company' AND item_id = $1 AND config_key = $2 AND status = 1
                 ORDER BY id DESC LIMIT 1),
          m AS (SELECT defaults->'value' AS v FROM master_configurations
                 WHERE item_type = 1 AND status = 1 AND config_key = $2 AND (company_id = $1 OR company_id IS NULL)
                 ORDER BY company_id NULLS LAST, id DESC LIMIT 1)
     SELECT CASE WHEN EXISTS (SELECT 1 FROM c) THEN (SELECT v FROM c) ELSE (SELECT v FROM m) END AS value,
            CASE WHEN EXISTS (SELECT 1 FROM c) THEN 'company override' WHEN EXISTS (SELECT 1 FROM m) THEN 'Procol default' ELSE 'not configured' END AS source`,
    [companyId, key],
  );
  return rows[0] ?? { value: null, source: "not configured" };
}

/** GET with a retry for the transient 502/503/504 UAT returns now and then. */
async function getRetry<T = any>(api: ApiClient, path: string, tries = 3): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try {
      return await api.get<T>(path);
    } catch (e: any) {
      last = e;
      const st = Number(e?.status);
      if (!(st === 502 || st === 503 || st === 504 || st === 429 || !st)) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** JSON with object keys sorted at every level. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

const rubyTruthy = (v: unknown) => v !== null && v !== undefined && v !== false;

function maskEmail(e: string | null): string | null {
  if (!e) return e;
  const [u, d] = e.split("@");
  return d ? `${u.slice(0, 2)}***@${d}` : "***";
}

/** Strip anything URL-shaped (presigned S3 links carry credentials) from a value before storing it. */
function scrub<T>(v: T): T {
  return JSON.parse(
    JSON.stringify(v, (_k, x) => (typeof x === "string" && /^https?:\/\//i.test(x) && /X-Amz-|Signature=|token=/i.test(x) ? "[signed url removed]" : x)),
  );
}

function listItem(x: any, isDefault: boolean): TemplateListItem {
  return {
    uuid: String(x.uuid),
    name: String(x.name ?? "").trim(),
    templateType: String(x.template_type ?? ""),
    orderType: x.order_type ?? null,
    typeIdentifier: Array.isArray(x.type_identifier) ? x.type_identifier : [],
    templateFor: Array.isArray(x.template_for) ? x.template_for : [],
    updatedAt: x.updated_at,
    isDefault,
  };
}

const STATUS_NAMES: Record<number, string> = {
  0: "in_active",
  1: "active",
  2: "invited",
  3: "onboarding_in_progress",
  4: "in_review",
  5: "rejected",
  6: "in_approval",
  7: "blacklisted",
}; // buyer_seller_company_mapping.rb:35

/** Settings that change how an event is built or behaves (all read from GET /v1/dashboard_configuration). */
const EVENT_CONFIG_KEYS = [
  "rfx_project_enabled",
  "boq_in_erfx_allowed",
  "allowed_maximum_line_items",
  "scheduled_events_enabled",
  "allow_draft_project_creation",
  "default_project_stages",
  "is_user_allowed_to_withdraw_project",
  "enable_bid_masking_for_event",
  "show_best_price_by_default_in_english_auction",
  "lock_vendors_addition_in_event_creation",
  "restrict_event_visibility_to_owner",
  "is_material_codification_enabled",
  "allow_user_to_add_uom",
  "enable_template_access_filtering",
  "allow_template_custom_field_edit",
  "is_auction_team_user",
  "can_buyer_edit_bid",
  "is_bid_sheet_upload_enabled",
  "allow_sheet_awarding",
  "hide_counter_offer_rfq",
  "evaluator_config",
  "show_line_lot_evaluation",
  "over_quantity_tolerance_percentage",
  "pr_attachments_in_event_disabled",
  "group_service_activities_in_rfp",
  "autofill_in_sheet_enabled",
  "enable_upload_bid_during_best_offer",
  "default_unit",
  "vendor_onboarding_version",
];

/** Settings read straight from the DB because the dashboard payload does not carry them. */
const DB_CONFIG_KEYS = [
  "material_codification",
  "get_company_only_units",
  "hide_default_templates",
  "allowed_statuses_for_vendor",
  "is_saving_configuration_mandatory",
  "mandatory_rfp_form_widgets",
  "widget_precision",
];

const EVENT_GATE_PREFIXES = ["events.", "auction.", "bids.", "evaluation.", "award."];

// ── the fetcher ──────────────────────────────────────────────────────────────

export interface FetchOptions {
  templateTypes?: readonly string[];
  /** cap on template detail fetches (a client with hundreds of templates stays bounded) */
  maxTemplateDetails?: number;
  baseURL?: string;
  log?: (msg: string) => void;
}

export async function fetchClientFacts(companyId: number, opts: FetchOptions = {}): Promise<ClientFacts> {
  const log = opts.log ?? (() => {});
  const errors: SectionError[] = [];
  const fail = (section: string, e: any) => errors.push({ section, message: String(e?.message ?? e).slice(0, 300) });

  const client = await resolveClient(companyId);
  const api = await clientFromSession(client.buyer, { app: "console", companyId, ...(opts.baseURL ? { baseURL: opts.baseURL } : {}) });

  const facts: ClientFacts = {
    companyId,
    companyName: client.companyName,
    fetchedAt: new Date().toISOString(),
    actor: { userId: client.buyer.userId, role: client.buyer.role ?? null, email: maskEmail(client.buyer.email) },
    templatesByType: {},
    templateDetails: {},
    units: {
      api: [],
      usable: [],
      scope: { materialCodification: null, companyOnlyUnits: null, companyOnly: false, companyRows: 0, procolWideRows: 0 },
      defaultUnit: null,
      allowUserToAddUom: null,
    },
    products: { active: 0, activeQualities: 0, withUnitLinks: 0, unusableUnitLinks: [], productsWithUnusableUnit: 0, sample: [], apiSample: [] },
    locations: { active: 0 },
    dropdownOptions: {},
    vendors: { byStatus: {}, allowedStatuses: [], allowedStatusesFrom: "", invitable: 0, qaSafe: [] },
    config: {},
    permissions: { count: 0, sample: [] },
    gates: {},
    errors,
    hash: "",
  };

  try {
    // ── 1. settings (dashboard payload) ──
    log("reading settings");
    try {
      const dash: any = await getRetry(api, "/v1/dashboard_configuration");
      for (const k of EVENT_CONFIG_KEYS) if (k in dash) facts.config[k] = dash[k];
      const perms: string[] = Array.isArray(dash.authorized_permissions) ? dash.authorized_permissions.map(String) : [];
      facts.permissions = { count: perms.length, sample: perms.slice(0, 200) };
      facts.units.defaultUnit = dash.default_unit ?? null;
      facts.units.allowUserToAddUom = dash.allow_user_to_add_uom ?? null;
    } catch (e) {
      fail("settings", e);
    }
    for (const k of DB_CONFIG_KEYS) {
      try {
        const r = await readCompanyConfig(companyId, k);
        facts.config[`db:${k}`] = r.value;
        facts.config[`db:${k}:from`] = r.source;
      } catch (e) {
        fail(`setting ${k}`, e);
      }
    }

    // ── 2. templates, per type ──
    const types = opts.templateTypes ?? EVENT_TEMPLATE_TYPES;
    for (const t of types) {
      log(`listing ${t} templates`);
      try {
        const r: any = await getRetry(api, `/templates?type_identifier=${encodeURIComponent(t)}&hide_onboarding_v2_templates=true`);
        facts.templatesByType[t] = {
          default: (r.default ?? []).map((x: any) => listItem(x, true)),
          saved: (r.saved ?? []).map((x: any) => listItem(x, false)),
        };
      } catch (e: any) {
        facts.templatesByType[t] = { default: [], saved: [], error: `${e?.status ?? ""} ${e?.message ?? e}`.trim() };
        fail(`templates:${t}`, e);
      }
    }
    const uuids = [
      ...new Set(Object.values(facts.templatesByType).flatMap((g) => [...g.default, ...g.saved].map((x) => x.uuid))),
    ].slice(0, opts.maxTemplateDetails ?? 400);
    log(`reading ${uuids.length} template details`);
    await mapLimit(uuids, 3, async (u) => {
      try {
        const d: any = await getRetry(api, `/templates/${encodeURIComponent(u)}`);
        // the palette of addable widgets and T&C text are large and not fields of this template
        const { terms_and_conditions, terms_and_conditions_structured, shared_with, ...rest } = d ?? {};
        facts.templateDetails[u] = scrub(rest);
      } catch (e: any) {
        facts.templateDetails[u] = { error: `${e?.status ?? ""} ${e?.message ?? e}`.trim() };
        fail(`template ${u}`, e);
      }
    });

    // ── 2b. options of data-driven dropdowns (widget_data_mappings, SELECT only) ──
    try {
      const keys = new Set<string>();
      const visit = (x: any) => {
        const dd = x?.configuration?.dropdown_data;
        const m = typeof dd === "string" ? dd.match(/widget_data_mapping\?type=([^&]+)/) : null;
        if (m) {
          try {
            keys.add(decodeURIComponent(m[1]));
          } catch {
            keys.add(m[1]);
          }
        }
      };
      for (const d of Object.values(facts.templateDetails)) {
        for (const x of [...(d?.widgets?.inline_components ?? []), ...(d?.widgets?.global_price_components ?? [])]) visit(x);
        for (const f of d?.forms ?? []) for (const x of [...(f.page_headers ?? []), ...(f.page_response_headers ?? [])]) visit(x);
      }
      for (const k of keys) {
        const rows = await select<any>(
          `SELECT value, configuration->>'display_value' AS label FROM widget_data_mappings
            WHERE company_id = $1 AND key = $2 AND status = 1 ORDER BY id LIMIT 60`,
          [companyId, k],
        );
        const [n] = await select<any>(`SELECT count(*)::int AS n FROM widget_data_mappings WHERE company_id = $1 AND key = $2 AND status = 1`, [companyId, k]);
        facts.dropdownOptions[k] = { count: n?.n ?? rows.length, values: rows.map((r) => String(r.label ?? r.value)) };
      }
    } catch (e) {
      fail("dropdown options (DB)", e);
    }

    // ── 3. units ──
    log("reading units");
    try {
      const u: any = await getRetry(api, "/units");
      facts.units.api = (Array.isArray(u) ? u : u?.units ?? []).map((x: any) => ({
        uuid: x.uuid,
        name: x.name,
        symbol: x.symbol,
        conversion_factor: x.conversion_factor,
      }));
    } catch (e) {
      fail("units (API)", e);
    }
    try {
      const mc = facts.config["db:material_codification"];
      const co = facts.config["db:get_company_only_units"];
      // unit.rb:50 — `material_codification == true` (strict) OR get_company_only_units? (truthy, company.rb:238-240)
      const companyOnly = mc === true || rubyTruthy(co);
      facts.units.scope.materialCodification = mc;
      facts.units.scope.companyOnlyUnits = co;
      facts.units.scope.companyOnly = companyOnly;
      const rows = await select<any>(
        `SELECT id, symbol, name, company_id, base_unit_id, conversion_factor FROM units
          WHERE status = 1 AND (company_id = $1 ${companyOnly ? "" : "OR company_id IS NULL"}) ORDER BY symbol`,
        [companyId],
      );
      facts.units.usable = rows.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        name: r.name,
        companyId: r.company_id,
        baseUnitId: r.base_unit_id,
        conversionFactor: r.conversion_factor,
      }));
      facts.units.scope.companyRows = rows.filter((r) => r.company_id === companyId).length;
      facts.units.scope.procolWideRows = rows.filter((r) => r.company_id === null).length;
    } catch (e) {
      fail("units (DB)", e);
    }

    // ── 4. products + their units ──
    log("reading products");
    try {
      const [c] = await select<any>(
        `SELECT (SELECT count(*) FROM products WHERE company_id = $1 AND status = 1)::int AS active,
                (SELECT count(*) FROM product_qualities pq JOIN products p ON p.id = pq.product_id
                  WHERE p.company_id = $1 AND p.status = 1 AND pq.status = 1)::int AS qualities,
                (SELECT count(DISTINCT pu.product_id) FROM product_units pu JOIN products p ON p.id = pu.product_id
                  WHERE p.company_id = $1 AND p.status = 1 AND pu.status = 1)::int AS with_units`,
        [companyId],
      );
      facts.products.active = c.active;
      facts.products.activeQualities = c.qualities;
      facts.products.withUnitLinks = c.with_units;
      const usableSymbols = facts.units.usable.map((u) => u.symbol);
      const bad = await select<any>(
        `SELECT u.symbol, u.name, u.company_id, count(DISTINCT p.id)::int AS products,
                (array_agg(DISTINCT p.name))[1:3] AS sample
           FROM product_units pu JOIN products p ON p.id = pu.product_id JOIN units u ON u.id = pu.unit_id
          WHERE p.company_id = $1 AND p.status = 1 AND pu.status = 1
            AND u.status = 1 AND NOT (u.symbol = ANY ($2::text[]))
          GROUP BY 1, 2, 3 ORDER BY 4 DESC`,
        [companyId, usableSymbols],
      );
      facts.products.unusableUnitLinks = bad.map((b) => ({
        symbol: b.symbol,
        unitName: b.name,
        unitOwnerCompanyId: b.company_id,
        products: b.products,
        sample: b.sample ?? [],
      }));
      const [n] = await select<any>(
        `SELECT count(DISTINCT p.id)::int AS n
           FROM product_units pu JOIN products p ON p.id = pu.product_id JOIN units u ON u.id = pu.unit_id
          WHERE p.company_id = $1 AND p.status = 1 AND pu.status = 1
            AND u.status = 1 AND NOT (u.symbol = ANY ($2::text[]))`,
        [companyId, usableSymbols],
      );
      facts.products.productsWithUnusableUnit = n?.n ?? 0;
      const sample = await select<any>(
        `SELECT p.name, p.product_code AS code,
                (SELECT count(*) FROM product_qualities pq WHERE pq.product_id = p.id AND pq.status = 1)::int AS qualities,
                coalesce((SELECT array_agg(u.symbol ORDER BY u.symbol) FROM product_units pu JOIN units u ON u.id = pu.unit_id
                           WHERE pu.product_id = p.id AND pu.status = 1 AND u.status = 1), '{}') AS units
           FROM products p WHERE p.company_id = $1 AND p.status = 1
          ORDER BY p.updated_at DESC NULLS LAST LIMIT 12`,
        [companyId],
      );
      facts.products.sample = sample.map((p) => {
        const units: string[] = p.units ?? [];
        const badUnits = units.filter((s) => !usableSymbols.includes(s));
        const why =
          p.qualities === 0
            ? "has no active quality/variant — a line item needs one"
            : badUnits.length
              ? `its unit ${badUnits.join(", ")} is not one of this client's units`
              : undefined;
        return { name: p.name, code: p.code ?? null, qualities: p.qualities, units, usable: !why, why };
      });
    } catch (e) {
      fail("products (DB)", e);
    }
    try {
      const r: any = await getRetry(api, "/products/search?query=a");
      facts.products.apiSample = (r.products ?? []).slice(0, 10).map((p: any) => ({
        uuid: p.uuid,
        name: p.name,
        code: p.product_code,
        variants: Array.isArray(p.variants) ? p.variants.length : 0,
      }));
    } catch (e) {
      fail("products (API)", e);
    }

    // ── 5. delivery locations ──
    try {
      const [h] = await select<any>(`SELECT count(*)::int AS n FROM buyer_hubs WHERE company_id = $1 AND status = 1`, [companyId]);
      facts.locations.active = h?.n ?? 0;
    } catch (e) {
      fail("locations (DB)", e);
    }

    // ── 6. vendors ──
    log("reading vendors");
    try {
      const rows = await select<any>(
        `SELECT status, count(*)::int AS n FROM buyer_seller_company_mappings WHERE client_company_id = $1 GROUP BY 1`,
        [companyId],
      );
      for (const r of rows) facts.vendors.byStatus[STATUS_NAMES[r.status] ?? String(r.status)] = r.n;
      const cfg = await readCompanyConfig(companyId, "allowed_statuses_for_vendor");
      const allowed = Array.isArray(cfg.value) && cfg.value.length ? (cfg.value as string[]) : ["active", "invited"];
      facts.vendors.allowedStatuses = allowed;
      facts.vendors.allowedStatusesFrom = Array.isArray(cfg.value) && cfg.value.length ? cfg.source : "code default (company.rb:180)";
      const ids = Object.entries(STATUS_NAMES).filter(([, n]) => allowed.includes(n)).map(([i]) => Number(i));
      const [inv] = await select<any>(
        `SELECT count(*)::int AS n FROM buyer_seller_company_mappings bsm JOIN companies c ON c.id = bsm.dealing_with_company_id
          WHERE bsm.client_company_id = $1 AND bsm.status = ANY ($2::int[]) AND bsm.source IN (0, 1) AND c.status = 1`,
        [companyId, ids],
      );
      facts.vendors.invitable = inv?.n ?? 0;
      const qa = await select<any>(
        `SELECT c.name, bsm.status FROM buyer_seller_company_mappings bsm JOIN companies c ON c.id = bsm.dealing_with_company_id
          WHERE bsm.client_company_id = $1 AND bsm.status = ANY ($2::int[]) AND bsm.source IN (0, 1) AND c.status = 1
            AND (c.name ILIKE 'QA\\_%' OR c.name ILIKE 'API\\_Test%' OR c.name ILIKE 'QA %'
                 OR EXISTS (SELECT 1 FROM users u WHERE u.company_id = c.id AND u.email ILIKE 'qa\\_%@example.com'))
          ORDER BY bsm.id DESC LIMIT 5`,
        [companyId, ids],
      );
      facts.vendors.qaSafe = qa.map((q) => ({ name: q.name, status: STATUS_NAMES[q.status] ?? String(q.status) }));
    } catch (e) {
      fail("vendors (DB)", e);
    }

    // ── 7. feature gates (events area only) ──
    try {
      const { resolveFeatureGates } = await import("../db/featureGates.js");
      const all = await resolveFeatureGates(companyId);
      for (const [k, v] of Object.entries(all)) {
        if (EVENT_GATE_PREFIXES.some((p) => k.startsWith(p))) facts.gates[k] = { on: (v as any).on ?? null, reasons: (v as any).reasons ?? [] };
      }
    } catch (e) {
      fail("feature gates", e);
    }
  } finally {
    await api.dispose().catch(() => {});
  }

  // who read it and when do not change what the client has
  const { fetchedAt, hash, errors: _e, actor: _a, ...stable } = facts;
  // keys sorted: template details arrive in completion order, which must not change the hash
  facts.hash = createHash("sha256").update(canonical(stable)).digest("hex");
  return facts;
}
