/** The guided session's store and step machine — `npx tsx scripts/session-unit-tests.ts` */
import { test } from "node:test";
import assert from "node:assert/strict";
import { advance, createSession, deleteSession, listSessions, loadSession, reopen, STEPS } from "../src/session/store.js";
import { describeUrl } from "../src/session/environment.js";

test("a new session starts on environment and is listed", () => {
  const s = createSession("unit");
  assert.equal(s.step, "environment");
  assert.ok(listSessions().some((x) => x.id === s.id));
  assert.equal(loadSession(s.id)?.name, "unit");
  deleteSession(s.id);
  assert.equal(loadSession(s.id), null);
});
test("advance never skips a step and never goes backwards", () => {
  const s = createSession("unit");
  advance(s, "environment");
  assert.equal(s.step, "requirement");
  advance(s, "environment");
  assert.equal(s.step, "requirement");
  advance(s, "cases");
  assert.equal(s.step, "review");
  deleteSession(s.id);
});
test("reopen marks the later answered steps stale, and answering again clears it", () => {
  const s = createSession("unit");
  advance(s, "environment"); advance(s, "requirement");
  reopen(s, "environment");
  assert.equal(s.step, "environment");
  assert.deepEqual(s.stale, ["requirement", "sanity"]);
  // answering the environment again does not re-answer the requirement: it stays stale until it is redone
  advance(s, "environment");
  assert.deepEqual(s.stale, ["requirement", "sanity"]);
  advance(s, "requirement");
  assert.deepEqual(s.stale, ["sanity"]);
  deleteSession(s.id);
});
test("describeUrl reads the host", () => {
  assert.equal((describeUrl("cpanel.ag-ri.in") as any).kind, "uat");
  assert.equal((describeUrl("https://quotes.ag-ri.in/x") as any).kind, "uat");
  assert.equal((describeUrl("https://procol-sandbox-demo-proco-internal-demo.ag-ri.in") as any).kind, "token");
  assert.equal((describeUrl("https://example.org") as any).kind, "custom");
  assert.equal((describeUrl("not a url at all") as any).ok, false);
  assert.equal(STEPS.length, 6);
});

import { flowsAsCases } from "../src/session/sanity.js";
import { KINDS, KIND_BASIS } from "../src/session/generation.js";
const card: any = {
  version: 1, at: "", title: "T", summary: "", module: "RFQ", features: [{ id: "F1", name: "Create", what: "" }], roles: [], states: [], data: [], outOfScope: [], assumptions: [], questions: [], grounding: { settings: [], off: [], defects: [], existing: 0, figmaLabels: 0 }, notes: [],
  flows: [
    { id: "FL1", name: "Create RFQ", feature: "F1", role: "Buyer", layer: "browser", preconditions: ["The buyer is on Events."], steps: ["Select Create Event.", "Keep RFQ on the single-stage screen.", "Invite one vendor by name."], endState: "A configured RFQ" },
    { id: "FL2", name: "Publish", feature: "F1", role: "Buyer", layer: "browser", preconditions: ["The buyer has configured a single-stage RFQ.", "The event has not yet been published."], steps: ["Set the schedule.", "Publish the event."], endState: "Live" },
    { id: "FL3", name: "Bid", feature: "F2", role: "Vendor user", layer: "browser", preconditions: ["The RFQ is live."], steps: ["Open the event.", "Place a bid."], endState: "A bid" },
  ],
  rules: [{ id: "R1", text: "When counter_offer_modification_enabled is off the action is hidden", kind: "setting", source: "x", settingKey: "counter_offer_modification_enabled", settingNow: false, feature: "F1" }],
};
const session: any = { id: "s-test1", env: { kind: "uat", companyId: 1, snapshot: { settings: { key: { lock_vendors_addition_in_event_creation: true, default_event_type: "rfi", counter_offer_modification_enabled: false } } } } };
test("a flow that starts from the unpublished event an earlier flow builds runs chained after it", () => {
  const cases = flowsAsCases(session, card);
  assert.equal(cases.length, 3);
  assert.deepEqual(cases[1].steps, [...card.flows[0].steps, ...card.flows[1].steps]);
  assert.equal(cases[1].preconditions, "The buyer is on Events.");
  assert.deepEqual(cases[2].steps, card.flows[2].steps);
  assert.equal(cases[2].portal, "Supplier portal");
});
test("the settings a flow needs come from the environment snapshot and the PRD's rules", () => {
  const cases = flowsAsCases(session, card);
  assert.match(cases[0].configs ?? "", /lock_vendors_addition_in_event_creation = Off/);
  assert.match(cases[0].configs ?? "", /default_event_type = rfq/);
  assert.match(cases[0].configs ?? "", /counter_offer_modification_enabled = On/);
  assert.equal(cases[2].configs, "None");
});
test("every kind has a basis sentence", () => {
  for (const k of KINDS) assert.ok(KIND_BASIS[k].length > 40, k);
});
