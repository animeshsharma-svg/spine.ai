/**
 * 01 — E2E PUBLISH FLOW (happy path), requests 1.1 to 1.10.
 *
 * Search products → template → evaluators → vendors → create the draft event
 * → add the technical (RFP) stage → publish. Nothing is hard-coded: every
 * product, unit, variant, template, evaluator and vendor is looked up on the
 * account at run time, and the settings in src/config.ts only say how many or
 * which ones by name.
 */
import { expect } from "@playwright/test";

import { buildPublishBody, buildStageBody, cloneTemplateHeader, resolveTitle, toHeader, verifyEventGroup, ALLOWED_INPUT_TYPES } from "../src/builders.js";
import { ACCOUNT, audienceSource, cfg, cfgBool, cfgInt, cfgJson, cfgList, cfgNum, cfgStr, isRfq, isSet, numVendors, stageTitle } from "../src/config.js";
import { rfqStageTest, rfqTemplateTest } from "../src/rfq.js";
import { now, rfpCase, uniq } from "../src/harness.js";
import type { SelectedProduct } from "../src/state.js";

const q = encodeURIComponent;

/** Everything request 1.1's pre-request script refused to start with. */
function configErrors(): string[] {
  const errors: string[] = [];
  if (!ACCOUNT.baseUrl) errors.push("the base URL is not set");
  if (!ACCOUNT.token) errors.push("AANYA_EVENTS_ACCESS_TOKEN is not set — copy the access-token header from the console into aanya_events/rfp/.env");
  const rfx = cfgStr("rfx_mode").toLowerCase();
  if (!["rfp", "rfq"].includes(rfx)) errors.push(`rfx_mode must be rfp or rfq, got "${rfx}"`);

  const productUuids = cfgList("product_uuids");
  let n = cfgInt("num_line_items");
  if (productUuids.length) n = productUuids.length;
  if (!(Number.isInteger(n) && (n as number) >= 1)) errors.push(`num_line_items must be a whole number of at least 1, got "${cfg("num_line_items")}"`);
  const count = n ?? 0;
  const listLenOk = (k: string, list: string[]) => {
    if (list.length > 1 && list.length !== count) {
      errors.push(`${k} has ${list.length} values but there are ${count} line items (give 1 value for all, or exactly ${count})`);
    }
  };
  const qtys = cfgList("quantities");
  listLenOk("quantities", qtys);
  qtys.forEach((v, i) => {
    const num = Number(v);
    if (!Number.isFinite(num) || num <= 0) errors.push(`quantity ${i + 1} ("${v}") is not a positive number`);
  });
  if (!((cfgNum("default_quantity") ?? 0) > 0)) errors.push("default_quantity must be more than 0");
  const mode = cfgStr("qty_mode").toLowerCase();
  if (!["fixed", "random"].includes(mode)) errors.push("qty_mode must be fixed or random");
  if (mode === "random") {
    const mn = cfgNum("qty_min") ?? 0;
    const mx = cfgNum("qty_max") ?? 0;
    if (!(mn > 0 && mx >= mn)) errors.push("qty_min / qty_max are invalid (need 0 < qty_min <= qty_max)");
  }
  listLenOk("unit_symbols", cfgList("unit_symbols"));
  listLenOk("variant_uuids", cfgList("variant_uuids"));
  if (!((cfgInt("variant_index") ?? -1) >= 0)) errors.push("variant_index must be 0 or more");
  if (!cfgList("vendor_uuids").length && !(numVendors() >= 1)) errors.push('num_vendors must be at least 1, or "all" (or give vendor_uuids)');
  if (!["auto", "vendor_search", "product_audience"].includes(cfgStr("audience_source").toLowerCase())) {
    errors.push("audience_source must be auto, vendor_search or product_audience");
  }
  if (rfx === "rfq") {
    if (!cfgBool("use_template")) errors.push("an RFQ needs a template (use_template = true) — its price widgets come from it");
    const hubs = cfgList("rfq_delivery_locations");
    hubs.forEach((h) => {
      if (h.split("|").length !== 2 || !h.split("|")[0].trim()) errors.push(`delivery location "${h}" must be written "uuid|name"`);
    });
    if (hubs.length > 1 && hubs.length !== count) errors.push(`${hubs.length} delivery locations for ${count} line items — give one for all, or exactly ${count}`);
    try {
      const cv = cfgJson("rfq_creator_values");
      if (cv && (typeof cv !== "object" || Array.isArray(cv))) errors.push("rfq_creator_values must be a JSON object");
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (!((cfgInt("max_vendor_pages") ?? 0) >= 1)) errors.push("max_vendor_pages must be at least 1");
  if (!((cfgInt("evaluators_per_line_item") ?? -1) >= 0)) errors.push("evaluators_per_line_item must be 0 or more");
  if (!((cfgInt("template_index") ?? -1) >= 0)) errors.push("template_index must be 0 or more");
  for (const k of ["event_duration_sec", "evaluation_duration_sec"] as const) {
    if (isSet(k) && !((cfgInt(k) ?? 0) > 0)) errors.push(`${k} must be a positive whole number of seconds`);
  }
  if (!Number.isInteger(cfgInt("bid_start_offset_sec"))) errors.push("bid_start_offset_sec must be a whole number of seconds");
  if (!((cfgInt("sla_ms") ?? 0) > 0 && (cfgInt("sla_heavy_ms") ?? 0) > 0)) errors.push("sla_ms / sla_heavy_ms must be more than 0");
  for (const k of ["extra_line_item_headers", "vendor_assessment_headers"] as const) {
    try {
      const arr = cfgJson<any[]>(k) || [];
      if (!Array.isArray(arr)) throw new Error("must be a JSON array");
      arr.forEach((h) => {
        if (!h.name) throw new Error('every header needs a "name"');
        toHeader(h);
      });
    } catch (e) {
      errors.push(`${k}: ${(e as Error).message}`);
    }
  }
  if (cfgBool("vendor_assessment_enabled") && !(cfgJson<any[]>("vendor_assessment_headers") || []).length) {
    errors.push("vendor_assessment_enabled is true but vendor_assessment_headers is empty");
  }
  return errors;
}

rfpCase(
  {
    id: "1.1",
    title: "Auth & Config — GET new_request_config",
    plain: "Sign in with the account's token and read its event settings: how long an RFP runs, how it is evaluated and closed, and which terms and conditions exist.",
    expected: "The token is accepted (200), the run's settings are valid, and the account has duration presets for RFP events.",
    anchor: "1.1",
    part: "publish",
    kind: "step",
    chain: true,
  },
  async (t) => {
    const errors = configErrors();
    t.state.cfgErrors = errors;
    t.critical("The run's settings are valid", () => expect(errors, errors.join(" | ")).toEqual([]));
    const res = await t.api.call("GET", "/api/v1/trade/new_request_config?additional_fields=terms_and_conditions");
    t.critical("Access token is accepted (not 401/403)", () =>
      expect([401, 403], "the token was refused — paste a fresh access-token into aanya_events/rfp/.env").not.toContain(res.status),
    );
    t.basic(res, { status: 200, schema: "newRequestConfig", critical: true });
    const b = res.json;
    const rfx = cfgStr("rfx_mode").toLowerCase();
    const dur = (b.event_duration_predefined_values || {})[rfx];
    t.critical(`The account has duration presets for ${rfx.toUpperCase()} events`, () => expect(typeof dur, `no preset for ${rfx}`).toBe("object"));
    t.check("The default duration is one of the allowed durations", () => expect(dur.event_duration).toContain(dur.default_duration));
    t.check("The default evaluation window is one of the allowed windows", () => expect(dur.evaluation_duration).toContain(dur.default_evaluation));
    t.check("The default closing mode is a known value", () =>
      expect(["line_item_based", "basket_based", "single", "lot_based"]).toContain(b.default_closing_mode),
    );
    t.check("The default RFP evaluation mode is a known value", () =>
      expect(["line_item_based", "basket_based", "lot_based"]).toContain(b.default_rfp_evaluation_mode),
    );
    t.check("Terms and conditions have unique ids", () => {
      const u = (b.all_terms_and_conditions || []).map((x: any) => x.uuid);
      expect(uniq(u).length).toBe(u.length);
    });
    if (b.is_allowed_to_modify_audience === false && cfgList("vendor_uuids").length) {
      t.note("This account does not allow changing the audience, but vendor_uuids were given.");
    }

    const evDur = cfgInt("event_duration_sec") || dur.default_duration;
    const evalDur = cfgInt("evaluation_duration_sec") || dur.default_evaluation;
    if (cfgInt("event_duration_sec") && !dur.event_duration.includes(evDur)) {
      t.note(`event_duration_sec ${evDur} is not one of the account's presets ${JSON.stringify(dur.event_duration)}.`);
    }
    t.state.cfgDefaults = {
      freeze_default_uom: b.freeze_default_uom === true,
      event_duration: evDur,
      evaluation_duration: evalDur,
      auction_closing_mode: cfgStr("auction_closing_mode") || b.default_closing_mode,
      rfp_evaluation_mode: cfgStr("rfp_evaluation_mode") || b.default_rfp_evaluation_mode,
    };

    const tncUuid = cfgStr("tnc_uuid");
    if (tncUuid) {
      const all = (b.all_terms_and_conditions || []).concat(b.project_terms_and_conditions || []);
      const found = all.find((x: any) => x.uuid === tncUuid);
      t.critical("The configured terms and conditions exist", () => expect(found, `tnc_uuid ${tncUuid} not found`).toBeTruthy());
      t.state.tnc = {
        uuid: found.uuid,
        title: found.title,
        terms_and_conditions: found.terms_and_conditions || [],
        attachments: (found.attachments || []).map((a: any) => ({ type: a.type, value: a.value || [] })),
      };
    }
    t.actual(
      `Signed in. ${rfx.toUpperCase()} events here run ${Math.round(evDur / 60)} min by default with a ` +
        `${Math.round(evalDur / 60)} min evaluation window, closing "${t.state.cfgDefaults.auction_closing_mode}".`,
    );
  },
);

rfpCase(
  {
    id: "1.2",
    title: "Search Products — GET products/search",
    plain: "Search the catalogue and pick the products the event will source, with a unit, a variant and a quantity for each.",
    expected: "The search returns products, and enough of them are active and approved to make the line items asked for.",
    anchor: "1.2",
    part: "publish",
    kind: "step",
    chain: true,
    needs: ["cfgDefaults"],
  },
  async (t) => {
    const query = cfgStr("product_search_query");
    const res = await t.api.call("GET", `/api/products/search?query=${q(query)}`);
    t.basic(res, { status: 200, sla: "heavy", schema: "productSearch", critical: true });
    const b = res.json;
    const ql = query.toLowerCase();
    t.check("The search returned at least one product", () => expect(b.products.length).toBeGreaterThan(0));
    t.check("Product ids are unique", () => {
      const u = b.products.map((p: any) => p.uuid);
      expect(uniq(u).length).toBe(u.length);
    });
    t.check("Every product has a unit and a variant", () =>
      b.products.forEach((p: any) => {
        expect(p.units.length, p.name).toBeGreaterThan(0);
        expect(p.variants.length, p.name).toBeGreaterThan(0);
      }),
    );
    t.check("Unit conversion factors are above 0", () =>
      b.products.forEach((p: any) => p.units.forEach((u: any) => expect(u.conversion_factor, `${p.name}/${u.symbol}`).toBeGreaterThan(0))),
    );
    if (ql) {
      t.check(`Results are relevant to "${ql}"`, () => {
        const hits = b.products.filter((p: any) =>
          [p.name, p.product_code, p.category, p.family_name, p.description].join(" ").toLowerCase().includes(ql),
        );
        expect(hits.length, "no product mentions the query").toBeGreaterThan(0);
      });
    }
    if (b.product_config) {
      t.check("product_config only names returned products", () => {
        const ids = b.products.map((p: any) => p.uuid);
        b.product_config.forEach((c: any) => (c.product_uuids || []).forEach((u: string) => expect(ids).toContain(u)));
      });
    }

    const eligible = (p: any) =>
      p.status === "active" &&
      ["approval_not_required", "approved"].includes(p.approval_status || "approval_not_required") &&
      p.units.some((u: any) => u.status === "active") &&
      p.variants.length > 0;
    const wanted = cfgList("product_uuids");
    let chosen: any[];
    if (wanted.length) {
      const missing = wanted.filter((u) => !b.products.find((p: any) => p.uuid === u));
      t.critical("Every configured product is in the search results", () =>
        expect(missing, `not found for "${query}": ${missing.join(", ")} — change product_search_query`).toEqual([]),
      );
      chosen = wanted.map((u) => b.products.find((p: any) => p.uuid === u)).filter(Boolean);
      const inactive = chosen.filter((p) => !eligible(p)).map((p) => p.name);
      t.critical("The configured products are active and approved, with units and variants", () => expect(inactive).toEqual([]));
    } else {
      const n = cfgInt("num_line_items")!;
      const pool = b.products.filter(eligible);
      t.critical(`Enough eligible products for ${n} line item${n === 1 ? "" : "s"}`, () =>
        expect(pool.length, `only ${pool.length} eligible for "${query}" — change the search or ask for fewer line items`).toBeGreaterThanOrEqual(n),
      );
      chosen = pool.slice(0, n);
    }

    const qtys = cfgList("quantities");
    const units = cfgList("unit_symbols");
    const variants = cfgList("variant_uuids");
    const vIdx = cfgInt("variant_index")!;
    const mode = cfgStr("qty_mode").toLowerCase();
    const pick = (list: string[], i: number) => (list.length === 0 ? null : list.length === 1 ? list[0] : list[i]);
    const qtyFor = (i: number) => {
      const one = pick(qtys, i);
      if (one !== null) return Number(one);
      if (mode === "random") {
        const mn = cfgNum("qty_min")!;
        const mx = cfgNum("qty_max")!;
        return Math.floor(mn + Math.random() * (mx - mn + 1));
      }
      return cfgNum("default_quantity")!;
    };
    const errors: string[] = [];
    const sel: SelectedProduct[] = chosen.map((p, i) => {
      const activeUnits = p.units.filter((u: any) => u.status === "active");
      const uWanted = pick(units, i);
      let unit = activeUnits[0];
      if (uWanted) {
        unit = activeUnits.find(
          (u: any) => u.symbol.trim().toLowerCase() === uWanted.toLowerCase() || u.name.trim().toLowerCase() === uWanted.toLowerCase(),
        );
        if (!unit) {
          // Some accounts let the buyer type any unit; others only allow the product's own.
          if (t.state.cfgDefaults?.freeze_default_uom) {
            errors.push(`Unit "${uWanted}" is not valid for ${p.name} (this account only allows: ${activeUnits.map((u: any) => u.symbol).join(", ")})`);
          } else {
            t.note(`"${uWanted}" is not one of ${p.name}'s units; used as typed, which this account allows.`);
            unit = { symbol: uWanted };
          }
        }
      }
      const vWanted = pick(variants, i);
      let variant = p.variants[Math.min(vIdx, p.variants.length - 1)];
      if (vIdx >= p.variants.length) t.note(`variant_index ${vIdx} is out of range for ${p.name}; used its last variant.`);
      if (vWanted) {
        variant = p.variants.find((v: any) => v.uuid === vWanted);
        if (!variant) errors.push(`Variant "${vWanted}" does not belong to ${p.name}`);
      }
      return {
        index: i,
        product_uuid: p.uuid,
        name: p.name,
        product_code: p.product_code,
        image_url: p.image_url || null,
        category: (p.category || "").trim(),
        family_name: (p.family_name || "").trim(),
        unit: unit ? unit.symbol : null,
        quantity: qtyFor(i),
        variant_uuid: variant ? variant.uuid : null,
        variant_name: variant ? variant.name : null,
        quality_params: (variant && variant.quality_params) || p.quality_params || [],
      };
    });
    t.critical("Unit and variant overrides fit the chosen products", () => expect(errors, errors.join(" | ")).toEqual([]));
    t.check("Every quantity is a positive number", () =>
      sel.forEach((s) => {
        expect(typeof s.quantity, s.name).toBe("number");
        expect(s.quantity, s.name).toBeGreaterThan(0);
      }),
    );

    t.state.selProducts = sel;
    t.state.lineItems = sel.map((s) => ({
      product_uuid: s.product_uuid,
      quantity: { unitSymbol: s.unit, value: s.quantity },
      product_quality_uuid: s.variant_uuid,
    }));
    t.state.productCsv = sel.map((s) => s.product_uuid).join(",");
    t.actual(
      `Found ${b.products.length} product${b.products.length === 1 ? "" : "s"} for "${query}" and picked ${sel.length}: ` +
        sel.map((s) => `${s.name} × ${s.quantity} ${s.unit}`).join("; ") +
        ".",
    );
  },
);

rfpCase(
  {
    id: "1.3",
    title: "Audience for Products — GET audience_for_product",
    plain: "Ask which vendors the platform suggests for these products.",
    expected: "A list of suggested vendor companies comes back (200), with no company listed twice.",
    anchor: "1.3",
    part: "publish",
    kind: "step",
    needs: ["productCsv"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/companies/audience_for_product?product_uuids=[${t.state.productCsv}]`);
    t.basic(res, { status: 200, schema: "audienceForProduct" });
    const b = res.json;
    if (b?.companies) {
      t.check("Suggested vendors are unique", () => {
        const u = b.companies.map((c: any) => c.uuid);
        expect(uniq(u).length).toBe(u.length);
      });
      t.state.suggestedAudience = b.companies.map((c: any) => ({ uuid: c.uuid, name: c.name, status: c.status, is_vendor_tna: c.is_vendor_tna }));
      if (audienceSource() === "product_audience") {
        t.check("There are suggested vendors to invite (this run invites the product's audience)", () =>
          expect(b.companies.length, "no suggested vendors for these products — use audience_source = vendor_search").toBeGreaterThan(0),
        );
      }
      t.actual(`The platform suggests ${b.companies.length} vendor compan${b.companies.length === 1 ? "y" : "ies"} for these products.`);
    }
  },
);

rfpCase(
  {
    id: "1.4",
    title: "List Templates — GET templates",
    plain: "List the templates this account can build the event from — technical (RFP) or price (RFQ) — and pick one (by id, by name, or the first).",
    expected: "The account's templates come back (200), all for this kind of event, and the one asked for is among them.",
    anchor: "1.4",
    part: "publish",
    kind: "step",
    chain: true,
    needs: ["selProducts"],
  },
  async (t) => {
    let type = cfgStr("template_type_identifier");
    if (!type) type = isRfq() ? "trade" : "rfi";
    t.state.templateType = type;
    const res = await t.api.call("GET", `/api/templates?type_identifier=${q(type)}&hide_onboarding_v2_templates=true`);
    t.basic(res, { status: 200, schema: "templatesList", critical: true });
    const b = res.json;
    const all = (b.saved || []).concat(b.default || []);
    t.check("Template ids are unique", () => {
      const u = all.map((x: any) => x.uuid);
      expect(uniq(u).length).toBe(u.length);
    });
    t.check(`Every saved template is for "${type}"`, () => (b.saved || []).forEach((x: any) => expect(x.template_for, x.name).toContain(type)));
    t.check("No onboarding-v2 templates came back", () =>
      all.forEach((x: any) => expect(String(x.template_type || "")).not.toContain("onboarding_v2")),
    );

    if (!cfgBool("use_template")) {
      t.state.template = { uuid: null };
      t.actual(`${all.length} template${all.length === 1 ? "" : "s"} listed; this run builds the stage without one (use_template = false).`);
      return;
    }
    let byUuid = cfgStr("template_uuid");
    let byName = cfgStr("template_name");
    const idx = cfgInt("template_index")!;
    if (isRfq()) {
      /**
       * One .env usually names the RFP's template. On an RFQ that template is
       * not in the list — an RFP template has questions, an RFQ one prices —
       * so the RFQ's own setting wins, and an RFP-only one is set aside.
       */
      const rfqUuid = cfgStr("rfq_template_uuid");
      const rfqName = cfgStr("rfq_template_name");
      if (rfqUuid || rfqName) {
        byUuid = rfqUuid;
        byName = rfqUuid ? "" : rfqName;
      } else {
        const named = byUuid ? all.find((x: any) => x.uuid === byUuid) : byName ? all.find((x: any) => String(x.name).trim().toLowerCase() === byName.toLowerCase()) : null;
        if ((byUuid || byName) && !named) {
          t.note(`The template in the settings (${byUuid || byName}) is not an RFQ template, so it was set aside; set rfq_template_uuid to choose one.`);
          byUuid = "";
          byName = "";
        }
      }
    }
    const found = byUuid
      ? all.find((x: any) => x.uuid === byUuid)
      : byName
        ? all.find((x: any) => String(x.name).trim().toLowerCase() === byName.toLowerCase())
        : all[idx];
    const how = byUuid ? `id ${byUuid}` : byName ? `name "${byName}"` : `position ${idx + 1}`;
    t.critical(`The template was found (${how})`, () => expect(found, `not among ${all.length} "${type}" templates`).toBeTruthy());
    t.state.template = { uuid: found.uuid, name: found.name };
    // Picked by position, not by name: if it will not open, the next one will
    // do just as well — so 1.5 may fall back rather than stop the whole run.
    t.state.templateFallbacks =
      byUuid || byName ? [] : all.slice(idx + 1).map((x: any) => ({ uuid: x.uuid, name: x.name }));
    t.actual(`${all.length} template${all.length === 1 ? "" : "s"} listed; using "${found.name}".`);
  },
);

rfpCase(
  {
    id: "1.5",
    title: "Get Template Details — GET templates/:uuid",
    plain: "Open the chosen template — the questions of an RFP, or the price widgets of an RFQ.",
    expected: "The template opens (200); it is the one chosen, its question keys are unique and its question types are supported.",
    anchor: "1.5",
    part: "publish",
    kind: "step",
    chain: true,
    needs: ["template"],
  },
  async (t) => {
    let sel = t.state.template!;
    if (!sel.uuid) t.skip("this run uses no template (use_template = false), so there is nothing to open");
    let res = await t.api.call("GET", `/api/templates/${q(sel.uuid!)}`);
    /**
     * A template picked by position that will not open is a bug in that
     * template — worth a failed check and a row on the bug sheet — but not a
     * reason to leave the event untested. Try the next ones, in list order.
     * A template named in the settings is never swapped: that one was asked for.
     */
    const broken: string[] = [];
    const fallbacks = [...(t.state.templateFallbacks ?? [])];
    while (res.status >= 500 && fallbacks.length) {
      broken.push(`"${sel.name}" → ${res.status}`);
      const next = fallbacks.shift()!;
      sel = { uuid: next.uuid, name: next.name };
      res = await t.api.call("GET", `/api/templates/${q(sel.uuid!)}`);
    }
    if (broken.length) {
      t.check("The template picked opens", () => expect(broken, `server error opening ${broken.join(", ")}`).toEqual([]));
      t.note(`Fell back to "${sel.name}" after ${broken.join(", ")}.`);
      t.state.template = { uuid: sel.uuid, name: sel.name };
    }
    if (isRfq()) {
      rfqTemplateTest(t, res);
      return;
    }
    t.basic(res, { status: 200, schema: "templateDetail", critical: true });
    const b = res.json;
    t.check("It is the template chosen", () => expect(b.uuid).toBe(sel.uuid));
    t.check("Its name matches", () => expect(b.name).toBe(sel.name));
    t.check(`It is for "${t.state.templateType}"`, () => expect(b.template_for).toContain(t.state.templateType));
    const headers: any[] = [];
    b.forms.forEach((f: any) => f.page_response_headers.forEach((h: any) => headers.push(h)));
    t.check("Question keys are unique across the template", () => {
      const k = headers.map((h) => h.key_attribute);
      expect(uniq(k).length).toBe(k.length);
    });
    t.check("Question types are supported", () => headers.forEach((h) => expect(ALLOWED_INPUT_TYPES, h.name).toContain(h.input_type)));
    t.check("Dropdown questions have options with unique ids", () =>
      headers
        .filter((h) => h.input_type === "dropdown")
        .forEach((h) => {
          const o = (h.configuration || {}).cell_options || [];
          expect(o.length, h.name).toBeGreaterThan(0);
          expect(uniq(o.map((x: any) => x.id)).length, `${h.name} ids`).toBe(o.length);
        }),
    );
    t.check("Forms are numbered in order", () => b.forms.forEach((f: any, i: number) => expect(f.order).toBe(i + 1)));
    t.state.templateHeaders = headers.map(cloneTemplateHeader);
    t.state.template = { uuid: b.uuid, name: b.name, forms: b.forms.length };
    t.actual(`"${b.name}" has ${b.forms.length} form${b.forms.length === 1 ? "" : "s"} and ${headers.length} question${headers.length === 1 ? "" : "s"}, copied into each line item.`);
  },
);

rfpCase(
  {
    id: "1.5b",
    title: "RFQ Config for Template — GET new_request_config?filters",
    plain: "Read the account's RFQ settings for the chosen template: how long it may run and how it closes.",
    expected: "The settings come back (200) with an RFQ duration preset, and the run's duration is one the template allows.",
    anchor: "1.5b",
    part: "publish",
    kind: "step",
    mode: "rfq",
    needs: ["rfqTemplate"],
  },
  async (t) => {
    const f = q(JSON.stringify({ template_uuid: t.state.template?.uuid || "" }));
    const res = await t.api.call("GET", `/api/v1/trade/new_request_config?additional_fields=terms_and_conditions&filters=${f}`);
    if (!t.basic(res, { status: 200, schema: "newRequestConfig" })) return;
    const b = res.json;
    const d = t.state.cfgDefaults!;
    const p = b.event_duration_predefined_values?.rfq;
    t.check("There is an RFQ duration preset for this template", () => expect(typeof p).toBe("object"));
    if (p) t.check(`The run's duration (${Math.round(d.event_duration / 60)} min) is one the template allows`, () => expect(p.event_duration).toContain(d.event_duration));
    t.check("Default closing and evaluation modes are there", () => {
      expect(typeof b.default_closing_mode).toBe("string");
      expect(typeof b.default_rfp_evaluation_mode).toBe("string");
    });
    t.check("The terms and conditions list comes back", () => expect(Array.isArray(b.all_terms_and_conditions)).toBe(true));
    t.actual(
      p
        ? `RFQs from this template run ${Math.round(p.default_duration / 60)} min by default; allowed: ${p.event_duration.map((x: number) => `${Math.round(x / 60)} min`).join(", ")}.`
        : "No RFQ preset for this template.",
    );
  },
);

rfpCase(
  {
    id: "1.5c",
    title: "Delivery Locations — GET buyer_hubs/autocomplete",
    plain: "Pick where each line item is to be delivered — named in the settings, or the account's first active delivery location.",
    expected: "The account's delivery locations come back (200), and the one(s) used are active locations of this account.",
    anchor: "1.5c",
    part: "publish",
    kind: "step",
    chain: true,
    mode: "rfq",
    needs: ["selProducts"],
  },
  async (t) => {
    const res = await t.api.call("GET", "/api/buyer_hubs/autocomplete?query=");
    t.basic(res, { status: 200, critical: true });
    const all: any[] = res.json?.buyer_hubs ?? [];
    t.check("Delivery location ids are unique", () => {
      const u = all.map((h) => h.uuid);
      expect(uniq(u).length).toBe(u.length);
    });
    const given = cfgList("rfq_delivery_locations").map((h) => {
      const [uuid, name] = h.split("|");
      return { uuid: uuid.trim(), value: (name || "").trim() };
    });
    let hubs: Array<{ uuid: string; value: string }>;
    if (given.length) {
      const unknown = given.filter((g) => !all.find((h) => h.uuid === g.uuid));
      if (unknown.length) t.note(`Not in this account's list (used anyway): ${unknown.map((u) => u.uuid).join(", ")}.`);
      hubs = given;
    } else {
      const active = all.filter((h) => h.status === "active");
      t.critical("The account has an active delivery location", () =>
        expect(active.length, "no active delivery location — add one, or set rfq_delivery_locations").toBeGreaterThan(0),
      );
      hubs = [{ uuid: active[0].uuid, value: active[0].name }];
    }
    t.state.rfqHubs = hubs;
    t.actual(
      `Delivering to ${uniq(hubs.map((h) => h.value)).join(", ")}` +
        (given.length ? " (from the settings)." : ` — the first of ${all.length} location(s) on the account.`),
    );
  },
);

rfpCase(
  {
    id: "1.6",
    title: "Get Evaluators — GET get_all_users",
    plain: "Find the people who can evaluate the vendors' technical answers.",
    expected: "The account's active users with the evaluator designation come back (200), and there is at least one to assign.",
    anchor: "1.6",
    part: "publish",
    kind: "step",
    mode: "rfp",
    needs: ["selProducts"],
  },
  async (t) => {
    const f: Record<string, unknown> = { statuses: ["active"] };
    const d = cfgStr("evaluator_designation");
    if (d) f.designation = d.split(",").map((s) => s.trim());
    const res = await t.api.call(
      "GET",
      `/api/get_all_users?filters=${q(JSON.stringify(f))}&search=${q(JSON.stringify({ category: "name", value: "" }))}&include_current_user=false`,
    );
    const ok = t.basic(res, { status: 200, schema: "users" });
    const b = res.json || { users: [] };
    if (ok) {
      t.check("Every user returned is active", () => b.users.forEach((u: any) => expect(u.status, u.uuid).toBe("active")));
      t.check("User ids are unique", () => {
        const u = b.users.map((x: any) => x.uuid);
        expect(uniq(u).length).toBe(u.length);
      });
      t.check("The page number is within the pages", () => expect(b.current_page).toBeLessThanOrEqual(Math.max(b.total_pages, 1)));
    }
    if (!cfgBool("assign_evaluators")) {
      t.state.evaluatorPool = [];
      t.actual("Evaluators are not assigned in this run (assign_evaluators = false).");
      return;
    }
    const given = cfgList("evaluator_uuids");
    const pool = given.length ? given : (b.users || []).map((u: any) => u.uuid);
    if (given.length && ok) {
      const unknown = given.filter((g) => !b.users.find((u: any) => u.uuid === g));
      if (unknown.length) t.note(`Not in the filtered list, used anyway: ${unknown.join(", ")}`);
    }
    const per = cfgInt("evaluators_per_line_item")!;
    if (per > 0) {
      t.check("There is at least one evaluator to assign", () =>
        expect(pool.length, `no users with the designation "${d}"`).toBeGreaterThan(0),
      );
    }
    t.state.evaluatorPool = pool;
    t.actual(`${pool.length} evaluator${pool.length === 1 ? "" : "s"} available; ${per} assigned to each line item, round robin.`);
  },
);

rfpCase(
  {
    id: "1.7",
    title: "Vendor List (paginated) — GET vendorlist_filtered",
    plain: "Pick the vendors to invite — from a vendor search (RFP), or the products' own audience (RFQ).",
    expected: "Each page comes back (200) with at most 10 active selling firms, and enough active vendors are found to invite.",
    anchor: "1.7",
    part: "publish",
    kind: "step",
    chain: true,
    needs: ["productCsv"],
  },
  async (t) => {
    const given = cfgList("vendor_uuids");
    const need = numVendors();
    const maxPages = cfgInt("max_vendor_pages")!;
    if (!given.length && audienceSource() === "product_audience") {
      // RFQs invite the products' own audience (from 1.3), as the console does.
      const sug = (t.state.suggestedAudience ?? []).filter((c) => ["active", "invited"].includes(c.status || "active") && !c.is_vendor_tna);
      const chosen = sug.slice(0, need === Infinity ? sug.length : need);
      t.critical(`The products' audience has ${need === Infinity ? "vendors" : `${need} vendor(s)`} to invite`, () =>
        expect(chosen.length, `only ${sug.length} suggested vendor(s)`).toBeGreaterThanOrEqual(need === Infinity ? 1 : need),
      );
      t.state.vendors = chosen.map((c) => ({ uuid: c.uuid, name: c.name }));
      t.actual(`Inviting ${chosen.length} vendor(s) from the products' own audience: ${chosen.map((c) => c.name).join(", ")}.`);
      return;
    }
    const sel: Array<{ uuid: string; name?: string }> = [];
    let page = 1;
    let pages = 1;
    for (;;) {
      const res = await t.api.call(
        "GET",
        `/api/companies/vendorlist_filtered?query=${q(cfgStr("vendor_search_query"))}&product_uuids=${t.state.productCsv}&page=${page}`,
      );
      const tag = page > 1 ? ` (page ${page})` : "";
      if (!t.basic(res, { status: 200, schema: "vendorList", critical: true })) break;
      const b = res.json;
      pages = b.total_pages;
      t.check(`At most 10 vendors on the page${tag}`, () => expect(b.companies.length).toBeLessThanOrEqual(10));
      t.check(`total_count agrees with total_pages${tag}`, () =>
        expect(b.total_pages).toBe(b.total_count === 0 ? b.total_pages : Math.ceil(b.total_count / 10)),
      );
      t.check(`Only selling firms are listed${tag}`, () =>
        b.companies.forEach((c: any) => expect(["selling_firm", "vendor", "seller"], c.name).toContain(c.category)),
      );
      t.check(`Vendors on the page are unique${tag}`, () => {
        const u = b.companies.map((c: any) => c.uuid);
        expect(uniq(u).length).toBe(u.length);
      });
      if (given.length) break;
      b.companies
        .filter((c: any) => c.status === "active" && !c.is_vendor_tna && !sel.find((s) => s.uuid === c.uuid))
        .forEach((c: any) => {
          if (sel.length < need) sel.push({ uuid: c.uuid, name: c.name });
        });
      if (sel.length < need && page < b.total_pages && page < maxPages) {
        page += 1;
        continue;
      }
      break;
    }
    if (given.length) {
      t.check(`The ${given.length} vendors given are not repeated`, () => expect(uniq(given).length, "duplicate vendor ids").toBe(given.length));
      t.state.vendors = given.map((u) => ({ uuid: u }));
      t.actual(`Inviting the ${given.length} vendors named in the settings.`);
      return;
    }
    t.critical(`Found ${need === Infinity ? "all the" : need} active vendor${need === 1 ? "" : "s"} to invite`, () =>
      expect(sel.length, `only ${sel.length} for "${cfgStr("vendor_search_query")}" after ${page} of ${pages} page(s)`).toBeGreaterThanOrEqual(
        need === Infinity ? 1 : need,
      ),
    );
    t.state.vendors = sel;
    t.actual(`Read ${page} page${page === 1 ? "" : "s"} of vendors and picked ${sel.length}: ${sel.map((v) => v.name).join(", ")}.`);
  },
);

rfpCase(
  {
    id: "1.8",
    title: "Create Event Group (Draft) — POST event_groups",
    plain: "Create the event as a draft, with one line item per product picked.",
    expected: "A draft event comes back (200) with one line-item id per product, no stages yet, and owned by the signed-in company.",
    anchor: "1.8",
    part: "publish",
    kind: "step",
    chain: true,
    needs: ["lineItems", "vendors"],
  },
  async (t) => {
    const sel = t.state.selProducts!;
    const res = await t.api.call("POST", "/api/event_groups", { body: { status: "draft", line_items: t.state.lineItems } });
    t.basic(res, { status: 200, sla: "heavy", schema: "eventGroup", critical: true });
    const b = res.json;
    t.critical("An event id came back", () => expect(typeof b.uuid === "string" && b.uuid.length > 0).toBe(true));
    t.check("It is a draft", () => expect(b.status).toBe("draft"));
    t.critical(`One line-item id per product (${sel.length})`, () => expect(b.event_group_line_item_ids).toHaveLength(sel.length));
    t.check("Line-item ids are unique", () => expect(uniq(b.event_group_line_item_ids).length).toBe(b.event_group_line_item_ids.length));
    t.check("A new draft has no stages", () => expect(b.stages).toEqual([]));
    t.check("It is not on hold", () => expect(b.is_project_on_hold).toBe(false));
    t.check("created_at equals updated_at on creation (±2 s)", () => expect(Math.abs(b.updated_at - b.created_at)).toBeLessThanOrEqual(2));
    t.check("created_at is recent (±10 min)", () => expect(Math.abs(b.created_at - now())).toBeLessThan(600));
    t.check("It belongs to the signed-in company", () =>
      expect(b.company.uuid).toBe(b.user_details.company ? b.user_details.company.uuid : b.company.uuid),
    );
    t.check("Evaluation score bands are ordered, scores descending", () => {
      const l = b.config.label_vs_evaluation_score || [];
      l.forEach((x: any, i: number) => {
        expect(x.order).toBe(i);
        if (i) expect(x.score).toBeLessThanOrEqual(l[i - 1].score);
      });
    });
    t.state.eventGroupUuid = b.uuid;
    t.state.egli = b.event_group_line_item_ids;
    t.state.currentUserUuid = b.user_details.uuid;
    t.produced = { eventGroupUuid: b.uuid };
    t.actual(`Draft event ${b.uuid} was created with ${b.event_group_line_item_ids.length} line item${b.event_group_line_item_ids.length === 1 ? "" : "s"}.`);
  },
);

rfpCase(
  {
    id: "1.9",
    title: "Create Stage (Draft) — POST trade/template_input",
    plain: "Add the round: for an RFP its forms of questions and evaluators, for an RFQ its price widgets and a row per line item — plus the timings and the vendors to invite.",
    expected: "A draft stage comes back (200) linked to the event, with the timings, title and mode sent, created by the signed-in user.",
    anchor: "1.9",
    part: "publish",
    kind: "step",
    chain: true,
    needs: ["eventGroupUuid", "cfgDefaults", "vendors"],
  },
  async (t) => {
    const r = buildStageBody(t.state, t.state.eventGroupUuid!, t.state.egli!);
    t.state.timing = r.timing;
    t.state.stagePlan = r.meta;
    const res = await t.api.call("POST", `/api/trade/template_input?template_name=${q(cfgStr("trade_template_name"))}&additional_fields=order_details`, {
      body: r.body,
    });
    if (isRfq()) {
      const b = rfqStageTest(t, res, r.meta);
      t.state.tradeUuid = b.uuid;
      t.produced = { tradeUuid: b.uuid };
      t.actual(
        `Draft RFQ round ${b.ref_uuid} was added with ${(b.order_details || []).length} priced row(s), ` +
          `open ${new Date(r.timing.start * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC for ${Math.round(r.timing.duration / 60)} min.`,
      );
      return;
    }
    t.basic(res, { status: 200, sla: "heavy", schema: "trade", critical: true });
    const b = res.json;
    const tm = r.timing;
    const sel = t.state.selProducts!;
    t.critical("A stage id came back", () => expect(typeof b.uuid === "string" && b.uuid.length > 0).toBe(true));
    t.check("The stage is a draft", () => expect(b.status).toBe("draft"));
    t.check("Its mode is the one sent", () => expect(b.rfx_mode).toBe(cfgStr("rfx_mode").toLowerCase()));
    t.check("Its title is the one sent", () => expect(String(b.title).trim()).toBe(stageTitle().trim()));
    t.check("It belongs to this event", () => expect(b.event_group_uuid).toBe(t.state.eventGroupUuid));
    t.check("It starts when asked", () => expect(b.starting_from).toBe(tm.start));
    t.check("It ends when asked", () => expect(b.ending_at).toBe(tm.end));
    t.check("Its evaluation window closes when asked", () => expect(b.extra_closing_time).toBe(tm.extra));
    t.check("start < end ≤ evaluation close", () => {
      expect(b.starting_from).toBeLessThan(b.ending_at);
      expect(b.ending_at).toBeLessThanOrEqual(b.extra_closing_time);
    });
    t.check("It is multi-product exactly when there is more than one line item", () => expect(b.is_multi_product).toBe(sel.length > 1));
    t.check("A new stage has no bids", () => {
      expect(b.bids).toEqual([]);
      expect(b.unverified_bids || []).toEqual([]);
    });
    t.check("The creation flow is the one sent", () => expect(b.misc.creation_flow_type).toBe(cfgStr("creation_flow_type")));
    t.check("It was created by the signed-in user", () => expect(b.user.uuid).toBe(t.state.currentUserUuid));
    t.check("It belongs to the user's company", () => expect(b.company_uuid).toBe(b.user.company ? b.user.company.uuid : b.company_uuid));
    t.state.tradeUuid = b.uuid;
    t.produced = { tradeUuid: b.uuid };
    t.actual(
      `Draft ${cfgStr("rfx_mode").toUpperCase()} stage ${b.uuid} was added with ${r.meta.forms_count} form${r.meta.forms_count === 1 ? "" : "s"}, ` +
        `open ${new Date(tm.start * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC for ${Math.round(tm.duration / 60)} min.`,
    );
  },
);

rfpCase(
  {
    id: "1.10",
    title: "Publish Event — PATCH event_groups/:uuid",
    plain: "Publish the event: give it its title, attach the stage, and send it to the vendors.",
    expected: "The event comes back active (200) with one active stage, the right products, every vendor invited, no bids, and the timings kept.",
    anchor: "1.10",
    part: "publish",
    kind: "step",
    chain: true,
    needs: ["tradeUuid"],
  },
  async (t) => {
    t.state.titleResolved = resolveTitle(t.state);
    const body = buildPublishBody(t.state, t.state.tradeUuid!);
    const res = await t.api.call("PATCH", `/api/event_groups/${q(t.state.eventGroupUuid!)}`, { body });
    t.basic(res, { status: 200, sla: "heavy", schema: "eventGroup", critical: true });
    verifyEventGroup(t, res.json, "publish");
    t.state.published = res.json?.status === "active";
    t.produced = { eventGroupUuid: t.state.eventGroupUuid!, tradeUuid: t.state.tradeUuid! };
    t.actual(
      `"${t.state.titleResolved}" is ${res.json?.status}, with ${(t.state.selProducts ?? []).length} line item(s) sent to ` +
        `${(t.state.vendors ?? []).length} vendor(s).`,
    );
  },
);
