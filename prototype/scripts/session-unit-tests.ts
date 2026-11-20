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
  assert.equal(cases[1].preconditions, `This flow is part of "T". The buyer is on Events.`); // the PRD's title travels with every flow case (17 Nov)
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

// ── the platform asks on screen (session/questions.ts) ──────────────────────────────────────────
import { answerQuestion as answerOnScreen, askAndWait, askLater, onAnswer, openQuestions, questionsOf, subscribe } from "../src/session/questions.js";

test("askLater saves the question, streams it once, and the answer runs the source's applier", () => {
  const s = createSession("unit-q");
  const seen: string[] = [];
  const unsub = subscribe(s.id, (e) => seen.push(e.type));
  onAnswer("cases", (_s, q) => `applied ${q.answer}`);
  const q = askLater(s, { step: "cases", source: "cases", kind: "text", text: "What should happen?", ref: { caseId: "GEN-001" } });
  askLater(s, { step: "cases", source: "cases", kind: "text", text: "What should happen?", ref: { caseId: "GEN-001" } }); // the same ask is not stacked
  assert.equal(questionsOf(s).length, 1);
  assert.equal(openQuestions(s).length, 1);
  assert.equal(q.blocking, false);
  const r = answerOnScreen(s, q.qid, "it is refused");
  assert.equal(r.ok, true);
  assert.equal(r.question?.outcome, "applied it is refused");
  assert.equal(openQuestions(s).length, 0);
  assert.deepEqual(seen, ["ask", "answered"]);
  assert.equal(answerOnScreen(s, q.qid, "again").ok, false, "answering twice is refused in words");
  unsub();
  deleteSession(s.id);
});
test("askAndWait resolves with the answer, and with the suggestion when the deadline passes", async () => {
  const s = createSession("unit-q2");
  const p = askAndWait(s, { step: "run", source: "run", kind: "one", text: "Run anyway?", options: [{ value: "out", label: "Leave them out" }, { value: "anyway", label: "Run anyway" }], suggested: "out" }, 60_000);
  const q = openQuestions(s)[0];
  assert.ok(q.deadlineAt && q.ifNoAnswer?.includes("Leave them out"));
  answerOnScreen(s, q.qid, "anyway");
  const a = await p;
  assert.equal(a.answer, "anyway");
  assert.equal(a.how, "answered");
  const p2 = askAndWait(s, { step: "run", source: "run", kind: "one", text: "Stop?", suggested: "out" }, 30);
  const d = await p2;
  assert.equal(d.how, "deadline");
  assert.equal(d.answer, "out");
  assert.equal(questionsOf(s).find((x) => x.text === "Stop?")?.closed, "deadline");
  deleteSession(s.id);
});

test("generation swaps product / template / vendor names the PRD never gives (19 Nov)", async () => {
  const { scrubInventedNames } = await import("../src/session/generation.js");
  assert.equal(scrubInventedNames("Line item: QA test line item; template: QA RFQ Template; vendor: QA_Platform Vendor A", "a prd"), "Line item: the test product; template: the first pricing template; vendor: Vendor A");
  assert.equal(scrubInventedNames("Vendor: QA_Platform Vendor 1 1790820862139", ""), "Vendor: QA_Platform Vendor 1 1790820862139");
  assert.equal(scrubInventedNames("product QA Test Bolt", "the prd names qa test bolt"), "product QA Test Bolt");
});

test("every invite case is written both ways: by name and with Invite Vendor (20 Nov)", async () => {
  const { pairInviteCases, vendorsNeeded } = await import("../src/session/generation.js");
  const base = { id: "", module: "RFQ", scenario: "", role: "Buyer", portal: "Buyer portal", preconditions: "-", configs: "None", testData: "-", priority: "P1", testType: "Happy path", why: "FL1.", source: "FL1", kind: "happy" as const, layer: "ui" as const };
  const bidCase = { ...base, title: "Buyer enters a surrogate bid", steps: ["Create an RFQ with the test product.", "Invite Vendor A to the event.", "Publish.", "Add a surrogate bid of 100 for Vendor A."], expected: "Vendor A is the only invited vendor. Responses shows 1/1 and the price 100." };
  const noInvite = { ...base, title: "Publish without a vendor is refused", steps: ["Create an RFQ.", "Publish without inviting any vendor."], expected: "Publish is refused." };
  const out = pairInviteCases([bidCase, noInvite] as any);
  assert.equal(out.length, 3);
  const [named, all, plain] = out;
  assert.match(named.title, /\(vendors invited by name\)$/);
  assert.match(named.steps[1], /search for Vendor A and add it by name — do not press "Invite Vendor"/);
  assert.match(all.title, /\(Invite Vendor — all suggested vendors\)$/);
  assert.match(all.steps[1], /^Press "Invite Vendor".*Then search for Vendor A .* the bidding is done as Vendor A\.$/);
  assert.doesNotMatch(all.expected, /only invited vendor|1\/1/);
  assert.match(all.expected, /record (how many|N)/);
  assert.equal(plain.title, noInvite.title);
  assert.equal(vendorsNeeded({ title: "", preconditions: "", testData: "", steps: ["Invite two vendors."], expected: "Vendor B is L1." }), 2);
  assert.equal(pairInviteCases(out as any).length, 3, "already-paired cases are not paired again");
});
test("the planner presses Invite Vendor only for the case that says so (20 Nov)", async () => {
  const { lintPlan } = await import("../src/agents/planner.js");
  const p = () => ({ steps: [{ step: "open_create", args: { path: "single-stage" } }, { step: "invite_vendor", args: { vendors: ["Vendor A"], count: 1 } }] } as any);
  const all = lintPlan(p(), 'Press "Invite Vendor" to invite every vendor the product suggests. Then search for Vendor A and add it by name.');
  const inv = (r: any) => r.plan.steps.find((x: any) => x.step === "invite_vendor");
  assert.equal(inv(all).args.all, true);
  assert.deepEqual(inv(all).args.vendors, ["Vendor A"]);
  const named = lintPlan(p(), 'In Participants, search for Vendor A and add it by name — do not press "Invite Vendor".');
  assert.equal(inv(named).args.all, undefined);
});
test("the by-name half becomes invite_vendor with the names, never a do_on_screen goal (20 Nov, INV-001N)", async () => {
  const { lintPlan } = await import("../src/agents/planner.js");
  const r = lintPlan({ steps: [{ step: "open_create", args: { path: "single-stage" } }, { step: "set_title" }, { step: "do_on_screen", args: { goal: "In Participants, search for Vendor A and add it by name without pressing Invite Vendor; verify that exactly one vendor is selected" } }, { step: "expect_text", args: { text: "Vendor A" } }] } as any,
    'Create an RFQ (vendors invited by name). In Participants, search for Vendor A and add it by name — do not press "Invite Vendor". Vendor A is the one invited vendor.');
  const names = r.plan.steps.map((x: any) => x.step);
  assert.ok(!names.includes("do_on_screen"));
  const inv = r.plan.steps.find((x: any) => x.step === "invite_vendor") as any;
  assert.deepEqual(inv.args.vendors, ["Vendor A"]);
  assert.equal(inv.args.all, undefined);
  assert.ok(names.includes("expect_participant_count"));
});
test("a Fail is confirmed only by a second Fail on a different event (23 Nov plan)", async () => {
  const { repeatOf } = await import("../src/session/execution.js");
  const ev = (key: string) => ({ key, label: `project ${key}` });
  assert.equal(repeatOf([{ status: "Fail", runId: "r1", event: ev("A"), ownEvent: false }]).state, "once");
  assert.equal(repeatOf([{ status: "Fail", runId: "r1", event: ev("A"), ownEvent: false }, { status: "Fail", runId: "r2", event: ev("A"), ownEvent: false }]).state, "same event");
  assert.equal(repeatOf([{ status: "Fail", runId: "r1", event: ev("A"), ownEvent: false }, { status: "Pass", runId: "r2", event: ev("B"), ownEvent: false }, { status: "Fail", runId: "r3", event: ev("C"), ownEvent: false }]).state, "confirmed");
  // a case that creates its own event in the browser is on a new one every run, even when no project page was reached
  assert.equal(repeatOf([{ status: "Fail", runId: "r1", ownEvent: true }, { status: "Fail", runId: "r2", ownEvent: true }]).state, "confirmed");
});
test("a second Fail at a different step does not confirm the first (20 Nov, SSR-001)", async () => {
  const { repeatOf } = await import("../src/session/execution.js");
  assert.equal(repeatOf([{ status: "Fail", runId: "r1", ownEvent: true, at: "publish" }, { status: "Fail", runId: "r2", ownEvent: true, at: "expect_visible" }]).state, "once");
  assert.equal(repeatOf([{ status: "Fail", runId: "r1", ownEvent: true, at: "publish" }, { status: "Fail", runId: "r2", ownEvent: true, at: "publish" }]).state, "confirmed");
});
test("click Create Event + expect the create screen becomes open_create (20 Nov, SSR-011)", async () => {
  const { lintPlan } = await import("../src/agents/planner.js");
  const r = lintPlan({ steps: [{ step: "open_events_list" }, { step: "click", args: { role: "button", name: "Create Event" } }, { step: "expect_navigated", args: { screen: "create" } }, { step: "expect_visible", args: { text: "Event Type" } }] } as any, "Create Event opens the single-stage screen with the default event type");
  const names = r.plan.steps.map((x: any) => x.step);
  assert.ok(!names.includes("expect_navigated"));
  assert.deepEqual((r.plan.steps.find((x: any) => x.step === "open_create") as any)?.args, { path: "single-stage" });
});
