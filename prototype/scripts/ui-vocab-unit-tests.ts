/**
 * Offline unit tests for the browser compiler's vocabulary rules added on 10 Nov 2026:
 * the gap resolver (a declared gap a step in the plan already covers), the vendor_bid lint
 * (a bid on the open supplier portal is never a second sign-in), the label check on the new
 * generic steps, and the step catalog carrying them. No network, no model, no browser.
 *
 *   node --import tsx --test scripts/ui-vocab-unit-tests.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("gap resolver: a gap the plan's own steps cover is dropped, said out loud", () => {
  test("'log in as Vendor A in a separate session' is covered by switch_portal", async () => {
    const { resolveCoveredGaps } = await import("../src/agents/planner.js");
    const r = resolveCoveredGaps(["Vendor portal login as Vendor A in a separate browser session"], [{ step: "switch_portal", args: { to: "vendor" } }, { step: "vendor_open_event" }]);
    assert.deepEqual(r.gaps, []);
    assert.equal(r.resolved.length, 1);
    assert.match(r.resolved[0], /switch_portal/);
  });
  test("…but a SECOND vendor's session is never covered by the one QA vendor", async () => {
    const { resolveCoveredGaps } = await import("../src/agents/planner.js");
    const r = resolveCoveredGaps(["Sign in as vendor B in a separate session and assert the event is absent from B's portal list"], [{ step: "switch_portal", args: { to: "vendor" } }]);
    assert.equal(r.gaps.length, 1);
    assert.equal(r.resolved.length, 0);
  });
  test("…and not when the plan only switches BACK to the buyer", async () => {
    const { resolveCoveredGaps } = await import("../src/agents/planner.js");
    const r = resolveCoveredGaps(["as the vendor, open the event"], [{ step: "switch_portal", args: { to: "buyer" } }]);
    assert.equal(r.gaps.length, 1);
  });
  test("a tooltip gap is covered only by an expect_message of kind tooltip", async () => {
    const { resolveCoveredGaps } = await import("../src/agents/planner.js");
    const yes = resolveCoveredGaps(["hover it to assert the tooltip 'Template used in RFQ has already been selected'"], [{ step: "expect_message", args: { kind: "tooltip", on: "T", text: "already been selected" } }]);
    assert.deepEqual(yes.gaps, []);
    const no = resolveCoveredGaps(["hover it to assert the tooltip"], [{ step: "expect_message", args: { kind: "error" } }]);
    assert.equal(no.gaps.length, 1);
  });
  test("what a dropdown offers is covered by expect_options; a count that rises by expect_remembered{delta}", async () => {
    const { resolveCoveredGaps } = await import("../src/agents/planner.js");
    const a = resolveCoveredGaps(["Assert that the duration dropdown offers exactly the four presets"], [{ step: "expect_options", args: { name: "30 Mins", options: ["30 Mins", "1 Hour"] } }]);
    assert.deepEqual(a.gaps, []);
    const b = resolveCoveredGaps(["Compare the audience count before and after and verify it increases by exactly one"], [{ step: "remember", args: { key: "n", text: "Participants" } }, { step: "expect_remembered", args: { key: "n", delta: "+1" } }]);
    assert.deepEqual(b.gaps, []);
    const c = resolveCoveredGaps(["Compare the audience count before and after"], [{ step: "expect_remembered", args: { key: "n" } }]);
    assert.equal(c.gaps.length, 1, "a plain same-element re-read is not a cross-target comparison");
  });
  test("a second vendor's BID is covered by a surrogate bid; a second vendor's SESSION is not", async () => {
    const { resolveCoveredGaps } = await import("../src/agents/planner.js");
    const bid = resolveCoveredGaps(["The prepared event has only one QA vendor, so a second vendor with a different total cannot be added or asserted."], [{ step: "open_prepared", args: { screen: "master_qcs" } }, { step: "place_surrogate_bid", args: { price: 90 } }, { step: "expect_qcs_ranks" }]);
    assert.deepEqual(bid.gaps, []);
    const session = resolveCoveredGaps(["No catalog step can sign in as vendor B and assert the event is absent from B's portal list"], [{ step: "place_surrogate_bid", args: { price: 90 } }]);
    assert.equal(session.gaps.length, 1);
    const none = resolveCoveredGaps(["The prepared event has only one QA vendor, so a second vendor with a different total cannot be added."], [{ step: "open_prepared", args: { screen: "master_qcs" } }, { step: "expect_qcs_ranks" }]);
    assert.equal(none.gaps.length, 1, "without a surrogate bid in the plan the gap stays");
  });
  test("'the event is in the vendor's Live list' is what vendor_open_event proves", async () => {
    const { resolveCoveredGaps } = await import("../src/agents/planner.js");
    const r = resolveCoveredGaps(["Assert that the invited vendor's Live list contains exactly this event after searching by title", "Assert that the matching card displays the event reference ID"], [{ step: "open_prepared", args: { screen: "vendor" } }, { step: "vendor_open_event", args: { overview: true } }]);
    assert.equal(r.gaps.length, 1, "the ref id stays a gap");
    assert.match(r.gaps[0], /reference ID/);
    const b = resolveCoveredGaps(["assert the event is absent from vendor B's portal list"], [{ step: "vendor_open_event" }]);
    assert.equal(b.gaps.length, 1);
  });
  test("a gap no step covers stays a gap", async () => {
    const { resolveCoveredGaps } = await import("../src/agents/planner.js");
    const r = resolveCoveredGaps(["Enable the tenant setting rfpEvaluationOn = lot"], [{ step: "expect_options", args: { name: "x", options: ["y"] } }, { step: "switch_portal", args: { to: "vendor" } }]);
    assert.equal(r.gaps.length, 1);
  });
});

describe("vendor_bid lint: a bid on the open portal is typed there, never a second sign-in", () => {
  test("place_bid after switch_portal becomes vendor_bid with the same price", async () => {
    const { lintPlan } = await import("../src/agents/planner.js");
    const text = "UI-VBID-010 — A negative price is refused. Steps: as the vendor, enter -100 and submit. Expected: refused with a readable message.";
    const { plan, repairs } = lintPlan(
      { title: "t", steps: [{ step: "open_create", args: { path: "erfx" } }, { step: "compose_stages", args: { stages: ["rfq"] } }, { step: "set_title" }, { step: "select_template" }, { step: "add_line_items" }, { step: "fill_sheet" }, { step: "set_schedule" }, { step: "invite_vendor" }, { step: "publish" }, { step: "expect_published" }, { step: "switch_portal", args: { to: "vendor" } }, { step: "vendor_open_event" }, { step: "place_bid", args: { price: -100 } }, { step: "expect_message", args: { kind: "error" } }] },
      text,
    );
    const names = plan.steps.map((s) => s.step);
    assert.ok(!names.includes("place_bid"), `place_bid should be gone: ${names.join(" → ")}`);
    const vb = plan.steps.find((s) => s.step === "vendor_bid");
    assert.ok(vb, "vendor_bid is there");
    assert.equal(vb!.args?.price, -100);
    assert.ok(repairs.some((r) => /place_bid → vendor_bid/.test(r)));
    assert.ok(names.indexOf("switch_portal") < names.indexOf("vendor_bid"));
  });
  test("vendor_bid with no portal open gets switch_portal + vendor_open_event in front", async () => {
    const { lintPlan } = await import("../src/agents/planner.js");
    const text = "The vendor submits a bid of 90 from the supplier portal and the buyer sees it.";
    const { plan } = lintPlan(
      { title: "t", steps: [{ step: "open_create", args: { path: "erfx" } }, { step: "compose_stages", args: { stages: ["rfq"] } }, { step: "set_title" }, { step: "select_template" }, { step: "add_line_items" }, { step: "fill_sheet" }, { step: "set_schedule" }, { step: "invite_vendor" }, { step: "publish" }, { step: "expect_published" }, { step: "vendor_bid", args: { price: 90 } }, { step: "expect_bid_submitted" }] },
      text,
    );
    const names = plan.steps.map((s) => s.step);
    const vb = names.indexOf("vendor_bid");
    assert.ok(vb > 0);
    assert.equal(names[vb - 1], "vendor_open_event");
    assert.equal(names[vb - 2], "switch_portal");
    assert.ok(names.indexOf("publish") < names.indexOf("switch_portal"), "the event is published before the vendor looks for it");
  });
  test("attempt{place_bid} after the switch becomes attempt{vendor_bid}", async () => {
    const { lintPlan } = await import("../src/agents/planner.js");
    const text = "As the vendor, try to bid after the window closed; the portal refuses it.";
    const { plan } = lintPlan(
      { title: "t", steps: [{ step: "open_event", args: { title: "X" } }, { step: "switch_portal", args: { to: "vendor" } }, { step: "vendor_open_event" }, { step: "attempt", args: { step: "place_bid", args: { price: 100 }, expect: "refused" } }] },
      text,
    );
    const at = plan.steps.find((s) => s.step === "attempt");
    assert.equal(at?.args?.step, "vendor_bid");
    assert.deepEqual(at?.args?.args, { price: 100 });
  });
});

describe("label honesty on the new generic steps", () => {
  test("expect_options' opener is held to the known labels; its option words are not labels", async () => {
    const { labelGuesses } = await import("../src/agents/planner.js");
    const labels = { schedule_drawer: ["30 Mins", "Duration"] };
    const guessed = labelGuesses([{ step: "expect_options", args: { name: "Made-up opener", options: ["30 Mins"] } }], "the presets", labels);
    assert.equal(guessed.length, 1);
    assert.match(guessed[0], /Made-up opener/);
    const known = labelGuesses([{ step: "expect_options", args: { name: "Duration", options: ["30 Mins"] } }], "the presets", labels);
    assert.deepEqual(known, []);
  });
  test("expect_remembered comparing with another element names that element", async () => {
    const { labelGuesses } = await import("../src/agents/planner.js");
    const guessed = labelGuesses([{ step: "expect_remembered", args: { key: "k", text: "Nowhere Label" } }], "compare the totals", { x: ["Sum Total"] });
    assert.equal(guessed.length, 1);
    const fine = labelGuesses([{ step: "expect_remembered", args: { key: "k", text: "Sum Total", as: "number" } }], "compare the totals", { x: ["Sum Total"] });
    assert.deepEqual(fine, []);
  });
});

describe("the step catalog carries the new steps", () => {
  test("expect_options, expect_table, vendor_bid are published with purposes the model can read", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const cat = JSON.parse(readFileSync(join(here, "..", "..", "procol-ui-tests", "plan-catalog.json"), "utf8"));
    for (const name of ["expect_options", "expect_table", "vendor_bid"]) {
      const st = cat.steps.find((s: { name: string }) => s.name === name);
      assert.ok(st, `${name} is in the catalog`);
      assert.ok(st.purpose.length > 80, `${name} has a purpose`);
    }
    assert.ok(cat.steps.find((s: { name: string }) => s.name === "expect_options").assertion, "expect_options asserts");
    assert.ok(cat.steps.find((s: { name: string }) => s.name === "expect_table").assertion, "expect_table asserts");
    assert.ok(/another element|delta/.test(cat.steps.find((s: { name: string }) => s.name === "expect_remembered").purpose));
  });
});

describe("the number reader behind expect_remembered{as:number} and expect_table cells", () => {
  test("₹, Indian grouping, units and currency words are ignored", async () => {
    const { numberOf } = await import("../../procol-ui-tests/src/plan/generic/run.js");
    assert.equal(numberOf("₹ 1,43,980.00"), 143980);
    assert.equal(numberOf("Rs. 1,000 / kg"), 1000);
    assert.equal(numberOf("Participants (12)"), 12);
    assert.equal(numberOf("-50"), -50);
    assert.equal(numberOf("no figure here"), null);
  });
});
