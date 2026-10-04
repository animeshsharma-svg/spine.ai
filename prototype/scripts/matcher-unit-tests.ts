/**
 * Offline unit tests: the case matcher's frame (who does what, expecting what)
 * and the automation-exemplar rules (when a validated plan may be reused).
 * No network, no database. Imported by scripts/ci-unit-tests.ts.
 *
 *   node --import tsx --test scripts/matcher-unit-tests.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("case matcher: the frame of a typed case", () => {
  test("a setup clause is not what the case tests, and a question states no outcome", async () => {
    const { understand } = await import("../src/checks/caseMatcher.js");
    const u = understand("create an rfq event check whether a vendor can bid after submission time is over");
    assert.equal(u.frame.verb, "bid");
    assert.equal(u.frame.actor, "vendor");
    assert.equal(u.frame.state, "closed");
    assert.equal(u.frame.question, true);
    assert.equal(u.polarity, "neutral");
    assert.ok(u.concepts.find((c) => c.id === "create")?.setup, "create is only the setup");
    assert.ok(u.concepts.some((c) => c.id === "closed"), "'submission time is over' is the closed window");
    assert.ok(!u.concepts.some((c) => c.id === "submit"), "'submission time' is not the action 'submit'");
  });
  test("Hinglish postpositions and negations", async () => {
    const { understand } = await import("../src/checks/caseMatcher.js");
    const u = understand("vendor ko deadline ke baad bid nahi karne dena chahiye");
    assert.match(u.normalized, /after the deadline/);
    assert.equal(u.polarity, "refuse");
    assert.ok(u.concepts.some((c) => c.id === "closed"));
  });
  test("who acts: a surrogate bid is the buyer on the vendor's behalf, not the vendor", async () => {
    const { frameOf } = await import("../src/checks/caseMatcher.js");
    assert.equal(frameOf("the buyer cannot bid for a vendor after the bid end time").actor, "buyer-for-vendor");
    assert.equal(frameOf("a vendor cannot bid after the bid end time").actor, "vendor");
    assert.equal(frameOf("an uninvited vendor cannot read the event").actor, "uninvited-vendor");
  });
  test("a different actor or the opposite outcome is never SAME", async () => {
    const { decideRelation } = await import("../src/checks/caseMatcher.js");
    const strong = { final: 0.9, concepts: 1, clash: false };
    assert.equal(decideRelation(strong, 0.9), "same");
    assert.notEqual(decideRelation({ ...strong, actorClash: true }, 0.9), "same");
    assert.notEqual(decideRelation({ ...strong, clash: true }, 0.9), "same");
  });
});

describe("automation exemplars: reuse only on an exact fit", () => {
  const plan = { version: 1, title: "A bid cannot be opened after the window closes", setup: { recipe: "closed_rfq" }, act: [{ op: "place_bid", as: "vendor", decisive: true }], verify: [], expected: { outcome: "reject", code: "33" } };
  const ex = { id: "API-XBID-049", caseIds: ["API-XBID-049"], title: "A bid cannot be opened after the window closes", text: "A vendor cannot open a bid after the window closes. Expected: refused, order not active.", source: "library-case", plan, shape: { recipe: "closed_rfq", op: "place_bid", actor: "vendor", outcome: "reject", code: "33", verifies: 0, acts: 1 } };
  const hit = (over: Record<string, unknown>) => ({ ex, score: 0.9, dense: 0.95, words: 0.9, structure: 1, agrees: [], differs: [], verdict: { verdict: "pass", runs: 3 }, ...over }) as any;
  test("a near-identical case reuses the plan, with its own id and title", async () => {
    const { exactFit } = await import("../src/agents/exemplars.js");
    const fit = exactFit("A vendor cannot open a bid after the window closes", [hit({})], "API-NEW-001", "New title");
    assert.ok(fit);
    assert.equal(fit!.plan.caseId, "API-NEW-001");
    assert.equal(fit!.plan.title, "New title");
    assert.equal(ex.plan.title, "A bid cannot be opened after the window closes", "the exemplar itself is not changed");
  });
  test("no reuse when the structure differs, the meaning is not close, the last run was inconclusive, or the case adds a condition", async () => {
    const { exactFit } = await import("../src/agents/exemplars.js");
    const t = "A vendor cannot open a bid after the window closes";
    assert.equal(exactFit(t, [hit({ structure: 0.75 })]), null);
    assert.equal(exactFit(t, [hit({ dense: 0.7 })]), null);
    assert.equal(exactFit(t, [hit({ verdict: { verdict: "inconclusive", runs: 1 } })]), null);
    assert.equal(exactFit("A vendor cannot open a bid with a negative price after the window closes", [hit({})]), null);
    assert.equal(exactFit("A vendor cannot open a bid after the window closes, 500 times", [hit({})]), null);
  });
  test("structure agreement reads actor, action, state and outcome", async () => {
    const { structureAgreement } = await import("../src/agents/exemplars.js");
    const { frameOf } = await import("../src/checks/caseMatcher.js");
    assert.equal(structureAgreement(frameOf("a vendor cannot bid after the deadline is over"), ex as any).score, 1);
    assert.ok(structureAgreement(frameOf("the buyer cannot bid for a vendor after the deadline is over"), ex as any).score < 1);
    assert.ok(structureAgreement(frameOf("a vendor can bid after the deadline is over"), ex as any).score < 1);
  });
});
