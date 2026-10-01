/**
 * 02 — POST-PUBLISH VERIFICATION, requests 2.1 to 2.10.
 *
 * Re-reads the published event from every angle the console shows it — the
 * event, its line items, its audience, the stage's forms, the invitations —
 * and holds each against what the publish flow sent.
 */
import { expect } from "@playwright/test";

import { verifyEventGroup } from "../src/builders.js";
import { audienceSource, cfgStr, isRfq } from "../src/config.js";
import { rfqSchemaTest } from "../src/rfq.js";
import { approx, parseQty, rfpCase, sameSet, uniq } from "../src/harness.js";

const q = encodeURIComponent;

rfpCase(
  {
    id: "2.1",
    title: "GET Event Group",
    plain: "Open the published event again and check it still says what was published.",
    expected: "The event reads back (200) active, with the same title, stage, products, vendors and timings.",
    anchor: "2.1",
    part: "verify",
    kind: "step",
    needs: ["published"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/event_groups/${q(t.state.eventGroupUuid!)}`);
    if (t.basic(res, { status: 200, sla: "heavy", schema: "eventGroup" })) verifyEventGroup(t, res.json, "read-back");
    t.actual(`The event reads back as "${res.json?.title}", status ${res.json?.status}.`);
  },
);

rfpCase(
  {
    id: "2.2",
    title: "GET Line Items",
    plain: "Read the event's line items and check each one against the product, quantity, unit and variant sent.",
    expected: "One line item per product (200), numbered 1..N, each with the product, quantity, unit, variant and quality parameters sent, all still open.",
    anchor: "2.2",
    part: "verify",
    kind: "step",
    needs: ["published"],
  },
  async (t) => {
    const res = await t.api.call(
      "GET",
      `/api/event_groups/${q(t.state.eventGroupUuid!)}/get_line_items?filters=%7B%7D&page=1&query=&prevent_pagination=false`,
    );
    if (!t.basic(res, { status: 200, schema: "lineItems" })) return;
    const b = res.json;
    const sel = t.state.selProducts!;
    const egli = t.state.egli!;
    t.check(`${sel.length} line item${sel.length === 1 ? "" : "s"}`, () => {
      expect(b.count).toBe(sel.length);
      expect(b.data).toHaveLength(sel.length);
    });
    t.check("Serial numbers are 1..N", () =>
      expect(b.data.map((d: any) => d.serial_number).sort((a: number, c: number) => a - c)).toEqual(sel.map((_, i) => i + 1)),
    );
    t.check("The line items are the ones created", () => expect(sameSet(b.data.map((d: any) => d.uuid), egli)).toBe(true));
    sel.forEach((s, i) => {
      const d = b.data.find((x: any) => x.serial_number === i + 1);
      const tag = `#${i + 1} ${s.name}`;
      t.check(`${tag} is at its serial number`, () => expect(d).toBeTruthy());
      if (!d) return;
      t.check(`${tag}: in its position`, () => expect(d.uuid).toBe(egli[i]));
      t.check(`${tag}: product`, () => expect(d.product_uuid).toBe(s.product_uuid));
      t.check(`${tag}: title is the product name`, () => expect(d.title).toBe(s.name));
      t.check(`${tag}: quantity is ${s.quantity}`, () => {
        const qty = parseQty(d.quantity);
        expect(qty, d.quantity).not.toBeNull();
        expect(approx(qty!.value, s.quantity, 1e-4), d.quantity).toBe(true);
      });
      t.check(`${tag}: unit is ${s.unit}`, () => expect(parseQty(d.quantity)?.unit).toBe(s.unit));
      t.check(`${tag}: all of it still open (nothing awarded)`, () => expect(approx(d.quantity_open, s.quantity, 1e-4)).toBe(true));
      t.check(`${tag}: variant`, () => expect(d.variant && d.variant.uuid).toBe(s.variant_uuid));
      t.check(`${tag}: quality parameters match the variant`, () =>
        expect(d.quality_params.map((x: any) => `${x.name}=${x.value}`)).toEqual((s.quality_params || []).map((x) => `${x.name}=${x.value}`)),
      );
      t.check(`${tag}: active`, () => expect(d.status).toBe("active"));
      if (s.family_name) t.check(`${tag}: subcategory is the family`, () => expect(String(d.subcategory || "").trim()).toBe(s.family_name));
      if (s.category) t.check(`${tag}: category`, () => expect(String(d.category || "").trim()).toBe(s.category));
    });
    t.check("Filter keys are unique", () => {
      const k = b.filters_data.map((f: any) => f.key);
      expect(uniq(k).length).toBe(k.length);
    });
    t.check("At least one page", () => expect(b.total_pages).toBeGreaterThanOrEqual(1));
    t.actual(`${b.count} line item(s) read back: ${b.data.map((d: any) => `${d.title} (${d.quantity})`).join("; ")}.`);
  },
);

rfpCase(
  {
    id: "2.3",
    title: "GET Audience",
    plain: "Read who the event was sent to.",
    expected: "Exactly the vendors picked (200), all added by the creator, all active, each invited to the one stage, with no bids or rejections yet.",
    anchor: "2.3",
    part: "verify",
    kind: "step",
    needs: ["published"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/event_groups/${q(t.state.eventGroupUuid!)}/get_audience`);
    if (!t.basic(res, { status: 200, schema: "audience" })) return;
    const b = res.json;
    const vendors = (t.state.vendors ?? []).map((v) => v.uuid);
    t.check(`${vendors.length} vendors invited`, () => expect(b.count).toBe(vendors.length));
    t.check("They are the vendors picked", () =>
      expect(sameSet(b.vendors.map((v: any) => v.uuid), vendors), JSON.stringify(b.vendors.map((v: any) => v.uuid))).toBe(true),
    );
    t.check("All were added by the creator", () => b.vendors.forEach((v: any) => expect(v.scope, v.name).toBe("added_by_creator")));
    // An RFQ invites the products' own audience, which can include vendors
    // invited but not yet signed up; everywhere else only active vendors are invited.
    const okStatus = audienceSource() === "product_audience" ? ["active", "invited"] : ["active"];
    t.check(`All are ${okStatus.join(" or ")} vendors`, () => b.vendors.forEach((v: any) => expect(okStatus, `${v.name}: ${v.vendor_status}`).toContain(v.vendor_status)));
    t.check("Exactly one stage", () => expect(b.stages).toHaveLength(1));
    const st = b.stages[0] || {};
    t.check("The stage is the technical stage", () => expect(st.uuid).toBe(t.state.tradeUuid));
    t.check("The stage invited exactly the vendors picked", () => expect(sameSet(st.invited_company_uuids || [], vendors)).toBe(true));
    t.check("No bids or rejections yet", () => {
      expect(st.bid_placed_company_uuids).toEqual([]);
      expect(st.rejected_company_uuids).toEqual([]);
    });
    t.check('Every vendor\'s status on the stage is "invited"', () =>
      vendors.forEach((v) => expect((st.vendors || {})[v], v).toBe("invited")),
    );
    t.actual(`${b.count} vendor(s) on the audience: ${b.vendors.map((v: any) => v.name).join(", ")}.`);
  },
);

rfpCase(
  {
    id: "2.4",
    title: "GET Audience Filter Options",
    plain: "Read the filters the audience screen offers.",
    expected: "The filters come back (200), each with a unique key and a known type.",
    anchor: "2.4",
    part: "verify",
    kind: "step",
    needs: ["published"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/event_groups/${q(t.state.eventGroupUuid!)}/audience_filter_options`);
    if (!t.basic(res, { status: 200, schema: "filterOptions" })) return;
    const b = res.json;
    t.check("Filter keys are unique", () => {
      const k = b.data.map((f: any) => f.key);
      expect(uniq(k).length).toBe(k.length);
    });
    t.check("Filter types are known", () =>
      b.data.forEach((f: any) => expect(["select", "multi_select", "text", "date", "range", "boolean"], f.key).toContain(f.type)),
    );
    t.actual(`${b.data.length} audience filter(s): ${b.data.map((f: any) => f.name).join(", ")}.`);
  },
);

rfpCase(
  {
    id: "2.5",
    title: "GET Stage Schema (forms)",
    plain: "Open the round and check everything arrived as sent — each form, question and evaluator of an RFP, or each priced row of an RFQ.",
    expected: "The stage schema (200) is active with the right forms: the vendor assessment and one per line item, each with its questions, quantity, template and evaluators.",
    anchor: "2.5",
    part: "verify",
    kind: "step",
    needs: ["published", "stagePlan"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/v1/trade/${q(t.state.tradeUuid!)}/schema?response_type=template&additional_fields=order_details`);
    if (isRfq()) {
      rfqSchemaTest(t, res);
      return;
    }
    if (!t.basic(res, { status: 200, schema: "stageSchema" })) return;
    const b = res.json;
    const plan = t.state.stagePlan!;
    const sel = t.state.selProducts!;
    const tpl = t.state.template ?? { uuid: null };
    const tm = t.state.timing!;
    const rfx = cfgStr("rfx_mode");
    t.check("It is the technical stage", () => expect(b.uuid).toBe(t.state.tradeUuid));
    t.check(`Reference looks like ${rfx.toUpperCase()}-<n>`, () => expect(b.ref_uuid).toMatch(new RegExp(`^${rfx.toUpperCase()}-\\d+$`)));
    t.check("It is active", () => expect(b.status).toBe("active"));
    t.check("Its mode", () => expect(b.rfx_mode).toBe(rfx.toLowerCase()));
    t.check("It is stage 1", () => expect(b.stage_no).toBe(1));
    t.check("No bids yet", () => expect(b.bid_count).toBe(0));
    t.check("It points at the event, with its title", () => {
      expect(b.event_group.uuid).toBe(t.state.eventGroupUuid);
      expect(b.event_group.title).toBe(t.state.titleResolved);
    });
    t.check("Its template", () => expect(b.template_uuid || null).toBe(tpl.uuid || null));
    if (tpl.name) t.check("Its template name", () => expect(b.template_name).toBe(tpl.name));
    t.check("The bid window survived publishing", () => expect(b.ending_at - b.starting_from).toBe(tm.duration));
    t.check("The evaluation window survived publishing", () => expect(b.extra_closing_time - b.ending_at).toBe(tm.evaluation));
    const forms = b.sheets.forms;
    t.check(`${plan.forms_count} forms`, () => expect(forms).toHaveLength(plan.forms_count));
    t.check("Line-item forms are numbered 1..N", () => {
      const li = forms.filter((f: any) => f.egli_uuid);
      expect(li.map((f: any) => f.serial_number)).toEqual(li.map((_: any, i: number) => i + 1));
    });
    t.check("Other forms are numbered 1..N", () => {
      const g = forms.filter((f: any) => !f.egli_uuid);
      expect(g.map((f: any) => f.serial_number)).toEqual(g.map((_: any, i: number) => i + 1));
    });
    t.check("All forms are active", () => forms.forEach((f: any) => expect(f.status, f.name).toBe("active")));
    if (plan.vendor_assessment) {
      const va = forms.find((f: any) => !f.egli_uuid);
      t.check("The vendor-assessment form is there", () => expect(va).toBeTruthy());
      if (va) {
        t.check("The vendor-assessment form's name", () => expect(va.name).toBe(cfgStr("vendor_assessment_name")));
        t.check("The vendor-assessment questions", () =>
          expect(va.page_response_headers.map((h: any) => h.name)).toEqual(expect.arrayContaining(plan.vendor_assessment!)),
        );
      }
    }
    plan.plan.forEach((p, i) => {
      const f = forms.find((x: any) => x.egli_uuid === p.egli);
      const tag = `Form #${i + 1} ${p.name}`;
      t.check(`${tag} is there for its line item`, () => expect(f).toBeTruthy());
      if (!f) return;
      t.check(`${tag}: name`, () => expect(f.name).toBe(p.name));
      t.check(`${tag}: quantity`, () => {
        const qty = parseQty(f.quantity);
        expect(approx(qty?.value, sel[i].quantity, 1e-4)).toBe(true);
        expect(qty?.unit).toBe(sel[i].unit);
      });
      if (sel[i].product_code) t.check(`${tag}: material code is the product code`, () => expect(f.material_code).toBe(sel[i].product_code));
      if (tpl.uuid) t.check(`${tag}: template`, () => expect(f.template_uuid).toBe(tpl.uuid));
      t.check(`${tag}: every question sent is there`, () =>
        expect(f.page_response_headers.map((h: any) => h.key_attribute)).toEqual(expect.arrayContaining(p.header_keys)),
      );
      t.check(`${tag}: question names kept`, () =>
        p.header_keys.forEach((k, j) => {
          const h = f.page_response_headers.find((x: any) => x.key_attribute === k);
          expect(h && h.name).toBe(p.header_names[j]);
        }),
      );
      t.check(`${tag}: the platform added its evaluation score`, () =>
        expect(f.page_response_headers.map((h: any) => h.key_attribute)).toContain("evaluation_score"),
      );
      t.check(`${tag}: questions = sent + system`, () => expect(f.page_response_headers.length).toBeGreaterThanOrEqual(p.header_keys.length + 1));
      t.check(`${tag}: ${p.evaluators.length} evaluator(s)`, () => expect(f.evaluators).toHaveLength(p.evaluators.length));
    });
    t.actual(`Stage ${b.ref_uuid} has ${forms.length} form(s), status ${b.status}.`);
  },
);

rfpCase(
  {
    id: "2.6",
    title: "GET Bidders Delivery Stats",
    plain: "Check the invitations went out: every vendor company has someone invited, and nobody has bid.",
    expected: "The delivery stats (200) list at least one invited user for every vendor, no bids, and no invitation resent.",
    anchor: "2.6",
    part: "verify",
    kind: "step",
    needs: ["published"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/trade/${q(t.state.tradeUuid!)}/bidders_delivery_stats`);
    if (!t.basic(res, { status: 200, schema: "bidderStats" })) return;
    const b = res.json;
    const vendors = (t.state.vendors ?? []).map((v) => v.uuid);
    const invitedCompanies = uniq(b.invited.map((x: any) => x.user.company_uuid)) as string[];
    t.check("Every vendor company has at least one invited user", () =>
      expect(sameSet(invitedCompanies, vendors), JSON.stringify(invitedCompanies)).toBe(true),
    );
    t.check("No bids yet", () => {
      expect(b.bid_placed).toEqual([]);
      expect(b.total_active_bids).toBe(0);
    });
    t.check("Everyone invited is still to bid", () =>
      expect(sameSet(b.bid_not_placed.map((x: any) => x.uuid), b.invited.map((x: any) => x.uuid))).toBe(true),
    );
    t.check("Anyone who has seen it was invited", () =>
      b.seen.forEach((s: any) => expect(b.invited.map((x: any) => x.uuid)).toContain(s.uuid || (s.user && s.user.uuid))),
    );
    t.check("No invitation was resent", () => b.invited.forEach((x: any) => expect(x.resent).toBe(false)));
    t.actual(`${b.invited.length} user(s) invited across ${invitedCompanies.length} vendor(s); ${b.total_active_bids} bid(s).`);
  },
);

rfpCase(
  {
    id: "2.7",
    title: "GET Event Indicators",
    plain: "Read the stage's auction indicators.",
    expected: "The indicators come back (200) in the expected shape.",
    anchor: "2.7",
    part: "verify",
    kind: "step",
    needs: ["published"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/v1/trade/${q(t.state.tradeUuid!)}/event_indicators`);
    t.basic(res, { status: 200, schema: "eventIndicators" });
  },
);

rfpCase(
  {
    id: "2.8",
    title: "GET Viewing Stats",
    plain: "Read who has viewed the stage so far.",
    expected: "The viewing stats come back (200) with a list of who has seen it.",
    anchor: "2.8",
    part: "verify",
    kind: "step",
    needs: ["published"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/event_tracking/viewing_stats?item_type=TradeRequest&item_uuid=${q(t.state.tradeUuid!)}`);
    if (t.basic(res, { status: 200, schema: "viewingStats" })) {
      t.check("'seen' is a list", () => expect(Array.isArray(res.json.seen)).toBe(true));
      t.actual(`${res.json.seen.length} viewer(s) so far.`);
    }
  },
);

rfpCase(
  {
    id: "2.9",
    title: "GET User Preferences (TradeRequest)",
    plain: "Read the signed-in user's saved table preferences for events.",
    expected: "The preferences come back (200) with their columns.",
    anchor: "2.9",
    part: "verify",
    kind: "step",
    needs: ["published"],
  },
  async (t) => {
    const res = await t.api.call("GET", "/api/user_preferences/show?item_type=TradeRequest");
    t.basic(res, { status: 200, schema: "userPrefs" });
  },
);

rfpCase(
  {
    id: "2.10",
    title: "GET Chats Count + Run Summary",
    plain: "Check a new event has no chat threads yet.",
    expected: "The chat counts come back (200) with no threads.",
    anchor: "2.10",
    part: "verify",
    kind: "step",
    needs: ["published"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/v1/chats/get_chats_count_data?module=EventGroup&module_uuid=${q(t.state.eventGroupUuid!)}`);
    if (t.basic(res, { status: 200, schema: "chatsCount" })) {
      t.check("No chat threads on a new event", () => expect(res.json.total_threads_count).toBe(0));
    }
    t.actual(`${res.json?.total_threads_count ?? "?"} chat thread(s).`);
  },
);
