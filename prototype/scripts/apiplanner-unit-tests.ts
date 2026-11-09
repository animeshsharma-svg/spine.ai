/**
 * API TEST COMPILER — unit tests that need no model and no network.
 *   npx tsx scripts/apiplanner-unit-tests.ts
 *
 * Each test is a fixed rule of the compiler: the journey-mutation family compiles in code, the validator
 * fixes the actor from the app allow-lists, reads the expected outcome against the case's words, accepts
 * the case's own request on sourcing-event routes only, assumes add:true for a new field whose parent
 * exists, and adds a read-back after a changing act.
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

import { validatePlan, journeyMutation, autoVerify, compileApiPlan, casePolarity, PLAN_VERSION, planInWords } from "../src/agents/apiPlanner.js";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.log(`FAIL ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}` : ""}`);
  }
}

// ── 1 · the journey-mutation family (API-N*) compiles in code ──
{
  const text = "Create the draft event: line_items[0].product_uuid is omitted\nSetup: A sandbox event built by the journey up to this step.\nSteps: Send `POST /event_groups` exactly as the journey does. Remove `line_items[0].product_uuid` from the body.\nExpected: A clean refusal: HTTP 4xx with an error message; nothing is created or changed.";
  const jm = journeyMutation(text, "API-NDRAFT-003");
  check("mutation: create_draft recognised", !!jm && "plan" in jm && jm.plan.act[0].op === "create_draft", jm);
  if (jm && "plan" in jm) {
    check("mutation: change removes the field", JSON.stringify(jm.plan.act[0].change) === JSON.stringify([{ path: "line_items[0].product_uuid", remove: true }]), jm.plan.act[0].change);
    check("mutation: expected reject", jm.plan.expected.outcome === "reject");
    const v = await validatePlan({ ...jm.plan, version: PLAN_VERSION }, { text });
    check("mutation: validates", v.ok, v.errors);
  }
  const t2 = "Price the line item: company_uuid has the wrong type\nSteps: Send `POST /v1/bids/:id/create_bid_products` exactly as the journey does. Send `company_uuid` as 12345 (it is string in a working request).\nExpected: A clean refusal: HTTP 4xx with an error message; nothing is created or changed.";
  const jm2 = journeyMutation(t2, "API-NBIDPRICE-002");
  check("mutation: price_bid after open_bid, as the vendor", !!jm2 && "plan" in jm2 && jm2.plan.act.length === 2 && jm2.plan.act[0].op === "open_bid" && jm2.plan.act[1].op === "price_bid" && jm2.plan.act[1].as === "vendor", jm2);
  if (jm2 && "plan" in jm2) {
    check("mutation: the mistyped value is a number", jm2.plan.act[1].change?.[0].set === 12345);
    const v = await validatePlan({ ...jm2.plan, version: PLAN_VERSION }, { text: t2 });
    check("mutation: price_bid plan validates", v.ok, v.errors);
  }
  const t3 = "Verify the OTP: otp is omitted\nSteps: Send `POST /v1/verify_otp` exactly as the journey does. Remove `otp` from the body.\nExpected: A clean refusal.";
  const jm3 = journeyMutation(t3, "API-NVLOGIN-001");
  check("mutation: an unknown journey step is an honest none", !!jm3 && "none" in jm3 && /not an operation/.test(jm3.none), jm3);
  const t4 = "Add the pricing round: configurations.title is omitted\nSteps: Send `POST /trade/template_input` exactly as the journey does. Remove `configurations.title` from the body.\nExpected: A clean refusal: HTTP 4xx.";
  const jm4 = journeyMutation(t4, "API-NRFPSTG-004");
  check("mutation: the RFP stage group adds the technical round", !!jm4 && "plan" in jm4 && jm4.plan.act[0].op === "add_rfp_round", jm4);
  const jm5 = journeyMutation(t4, "API-NPRICESTG-004");
  check("mutation: the pricing stage group adds the pricing round", !!jm5 && "plan" in jm5 && jm5.plan.act[0].op === "add_rfq_round", jm5);
  const c = await compileApiPlan({ caseId: "API-NPUBLISH-001" }, { llm: false });
  check("mutation: API-NPUBLISH-001 compiles without a model, full, with a read-back", c.plan?.act.some((a) => a.op === "publish_event") === true && c.source === "rules" && c.coverage === "full" && c.plan!.verify.length === 1, { cov: c.coverage, gaps: c.gaps, src: c.source, verify: c.plan?.verify });
}

// ── 2 · the actor is fixed from the app allow-lists ──
{
  const v = await validatePlan({ setup: { recipe: "published_rfq" }, act: [{ op: "open_bid", as: "buyer" }], verify: [], expected: { outcome: "accept" } }, { text: "The vendor can open a bid" });
  check("actor: the buyer's console may not POST /v1/bids → sent as the vendor", v.ok && v.plan.act[0].as === "vendor", { errors: v.errors, as: v.plan.act[0].as, warnings: v.warnings });
  const v2 = await validatePlan({ setup: { recipe: "rfq_with_bid" }, act: [{ op: "read_indicators", as: "vendor" }], verify: [], expected: { outcome: "accept" } }, { text: "The buyer sees the ranks" });
  check("actor: the vendor may not read event_indicators → read as the buyer", v2.ok && v2.plan.act[0].as === "buyer", { errors: v2.errors, as: v2.plan.act[0].as });
  const v3 = await validatePlan({ setup: { recipe: "published_rfq" }, act: [{ op: "open_bid", as: "buyer" }], verify: [], expected: { outcome: "reject" } }, { text: "A buyer's console token on POST /v1/bids is refused: the app is not authorized to use this API" });
  check("actor: a case about the cross-app refusal is not corrected — it cannot be executed", !v3.ok && v3.errors.some((e) => /cannot be executed/.test(e)), v3.errors);
}

// ── 3 · the expected outcome against the case's words ──
{
  check("polarity: refusal", casePolarity({ heads: ["A vendor cannot bid after the window closes", "Refused with code 33"] }) === "reject");
  check("polarity: accepted", casePolarity({ heads: ["Renaming a draft works", "The new title is saved"] }) === "accept");
  const v = await validatePlan({ setup: { recipe: "closed_rfq" }, act: [{ op: "place_bid", as: "vendor" }], verify: [], expected: { outcome: "accept" } }, { heads: ["A vendor cannot bid after the window closes", "Refused. HTTP 422, code 33 'Order not active'"], text: "" });
  check("outcome: a case about a refusal with a plan expecting accept is a soft problem", v.ok && v.soft.length === 1 && /reads as “it is refused”/.test(v.soft[0]), v);
  const v2 = await validatePlan({ setup: { recipe: "closed_rfq" }, act: [{ op: "place_bid", as: "vendor" }], verify: [], expected: { outcome: "reject" } }, { heads: ["A vendor cannot bid after the window closes", "Refused. HTTP 422, code 33 'Order not active'"], text: "" });
  check("outcome: the code the case names is taken", v2.ok && v2.soft.length === 0 && v2.plan.expected.code === "33" && !v2.plan.expected.codeInferred, v2.plan.expected);
  const v3 = await validatePlan({ setup: { recipe: "draft_rfq" }, act: [{ op: "update_event" }], verify: [], expected: { outcome: "no-5xx" } }, { heads: ["Renaming a draft works", "The new title is saved"], text: "" });
  check("outcome: no-5xx on a case that expects success becomes accept in code", v3.ok && v3.plan.expected.outcome === "accept" && v3.soft.length === 0, v3.plan.expected);
  const v4 = await validatePlan({ setup: { recipe: "draft_rfq" }, act: [{ op: "update_event" }], verify: [], expected: { outcome: "no-5xx" } }, { heads: ["A blank title is refused", "Should be 422 (ideally refused); records today's behaviour"], text: "Should be 422; today the app accepts it" });
  check("outcome: a case that records today's behaviour keeps no-5xx without a soft problem", v4.ok && v4.plan.expected.outcome === "no-5xx" && v4.soft.length === 0, v4);
}

// ── 4 · the case's own request ──
{
  const good = { setup: { recipe: "rfq_with_bid" }, act: [{ op: "request", as: "buyer", request: { method: "PATCH", path: "/bids/{{bidUuid}}/reject", body: { rejection_remarks: "QA_Platform_reject_{{stamp}}", allow_rebidding: true } } }], verify: [{ op: "request", request: { method: "GET", path: "/trade/{{tradeId}}?response_type=template" }, assert: [{ path: "$", op: "status_2xx" }] }], expected: { outcome: "accept" } };
  const v = await validatePlan(good, { text: "The buyer rejects a submitted bid. HTTP 200." });
  check("request: a sourcing-event request with known placeholders validates", v.ok, v.errors);
  check("request: the GET read-back is kept with its path", v.ok && v.plan.verify[0].request?.path === "/trade/{{tradeId}}?response_type=template", v.plan.verify);
  const words = planInWords(v.plan);
  check("request: it reads in words", words.steps.length === 2 && /request the case itself writes/.test(words.steps[0]), words);
  const bad1 = await validatePlan({ setup: { recipe: "published_rfq" }, act: [{ op: "request", request: { method: "GET", path: "/v1/chats?module=EventGroup&module_uuid={{eventGroupUuid}}" } }], verify: [], expected: { outcome: "accept" } });
  check("request: /v1/chats on the event is inside the domain", bad1.ok, bad1.errors);
  const bad2 = await validatePlan({ setup: { recipe: "published_rfq" }, act: [{ op: "request", request: { method: "POST", path: "/companies/filter_options" } }], verify: [], expected: { outcome: "accept" } });
  check("request: a route outside the sourcing-event area is refused", !bad2.ok && bad2.errors.some((e) => /outside the sourcing-event area/.test(e)), bad2.errors);
  const bad3 = await validatePlan({ setup: { recipe: "published_rfq" }, act: [{ op: "request", request: { method: "POST", path: "/event_groups/<draft>/pri_to_draft_project", body: {} } }], verify: [], expected: { outcome: "reject" } });
  check("request: a record named by description is refused", !bad3.ok && bad3.errors.some((e) => /names a record by description/.test(e)), bad3.errors);
  const bad4 = await validatePlan({ setup: { recipe: "published_rfq" }, act: [{ op: "request", request: { method: "PATCH", path: "/bids/{{bidUuid}}/reject", body: {} } }], verify: [], expected: { outcome: "accept" } });
  check("request: a placeholder nothing provides is refused", !bad4.ok && bad4.errors.some((e) => /needs \{\{bidUuid\}\}/.test(e)), bad4.errors);
  const bad5 = await validatePlan({ setup: { recipe: "published_rfq" }, act: [{ op: "request", request: { method: "PATCH", path: "/event_groups/{{eventGroupUuid}}/pri_to_draft_project", body: { pr: "{{prId}}" } } }], verify: [], expected: { outcome: "accept" } });
  check("request: a live business record placeholder is refused", !bad5.ok && bad5.errors.some((e) => /live business record/.test(e)), bad5.errors);
  const vendorReq = await validatePlan({ setup: { recipe: "rfq_with_bid" }, act: [{ op: "request", as: "buyer", request: { method: "PATCH", path: "/v1/bids/{{bidUuid}}/line_items/{{lineItemUuid}}/regret_status", body: { company_uuid: "{{vendorUuid}}", trade_request_uuid: "{{tradeId}}", action_type: "regret" } } }], verify: [], expected: { outcome: "accept" } }, { text: "A vendor regrets a line on its own draft bid. Accepted." });
  check("request: a vendor-app route sent as the buyer is re-sent as the vendor", vendorReq.ok && vendorReq.plan.act[0].as === "vendor", { errors: vendorReq.errors, as: vendorReq.plan.act[0].as });
}

// ── 5 · a new field whose parent exists is add:true; a read-back is added after a changing act ──
{
  const v = await validatePlan({ setup: { recipe: "draft_rfq" }, act: [{ op: "update_event", change: [{ path: "description", set: "QA_Platform_desc" }] }], verify: [], expected: { outcome: "accept" } });
  check("fields: a new top-level key is sent as add:true with a warning", v.ok && v.plan.act[0].change?.[0].add === true && v.warnings.some((w) => /add:true/.test(w)), { errors: v.errors, change: v.plan.act[0].change });
  const v2 = await validatePlan({ setup: { recipe: "draft_rfq" }, act: [{ op: "update_event", change: [{ path: "nothing.here.at_all", set: 1 }] }], verify: [], expected: { outcome: "accept" } });
  check("fields: a key whose parent does not exist is still an error", !v2.ok, v2.errors);
  const av = await autoVerify(v.plan);
  check("read-back: an accepted update_event reads the title back", av.plan.verify.length === 1 && av.plan.verify[0].op === "read_event" && av.plan.verify[0].assert.some((a) => a.path === "title" && a.op === "equals"), av.plan.verify);
  const pub = await validatePlan({ setup: { recipe: "draft_event" }, act: [{ op: "publish_event", change: [{ path: "draft_trade_request_uuids", set: [] }] }], verify: [], expected: { outcome: "reject" } });
  const av2 = await autoVerify(pub.plan);
  check("read-back: a refused publish reads the event back as still a draft", av2.plan.verify.length === 1 && av2.plan.verify[0].assert[0].value === "draft", av2.plan.verify);
  const bid = await validatePlan({ setup: { recipe: "closed_rfq" }, act: [{ op: "place_bid", as: "vendor" }], verify: [], expected: { outcome: "reject", code: "33" } });
  const av3 = await autoVerify(bid.plan);
  check("read-back: a refused bid reads the round's bid count as unchanged", av3.plan.verify.length === 1 && av3.plan.verify[0].op === "read_round" && av3.plan.verify[0].assert[0].path === "bid_count" && av3.plan.verify[0].assert[0].value === 0, av3.plan.verify);
  const wd = await validatePlan({ setup: { recipe: "published_rfq" }, act: [{ op: "withdraw_event" }], verify: [], expected: { outcome: "accept" } });
  const av4 = await autoVerify(wd.plan);
  check("read-back: a withdrawal reads the event back as withdrawn", av4.plan.verify[0]?.assert[0].value === "withdrawn", av4.plan.verify);
}

// ── 6 · compiling without a model keeps the old rules green ──
{
  const c = await compileApiPlan({ text: "A vendor cannot bid after the bid end time has passed" }, { llm: false });
  check("rules: the closed-window bid rule still compiles", c.plan?.setup.recipe === "closed_rfq" && c.plan.expected.outcome === "reject", { cov: c.coverage, gaps: c.gaps, plan: c.plan });
  const lib = await compileApiPlan({ caseId: "EDGE-PUB-076" }, { llm: false });
  check("library: a library case still compiles without a model", !!lib.plan && lib.plan.act.some((a) => a.op === "library"), { cov: lib.coverage, gaps: lib.gaps, errors: lib.errors });
}

// ── 7 · convert to auction; a request with no body is not the case's request ──
{
  const t = "Convert the pricing round into a live auction: x is omitted\nSteps: Send `POST /trade/move_to_auction` exactly as the journey does. Remove `widgets.global_price_components[0].uuid` from the body.\nExpected: A clean refusal: HTTP 4xx.";
  const jm = journeyMutation(t, "API-NCONVERT-001");
  check("convert: the journey's convert step is an op now", !!jm && "plan" in jm && jm.plan.act[0].op === "convert_to_auction" && jm.plan.setup.recipe === "rfq_with_bid", jm);
  if (jm && "plan" in jm) {
    const v = await validatePlan({ ...jm.plan, version: PLAN_VERSION }, { text: t });
    check("convert: the mutated auction body validates (the path exists in the builder's body)", v.ok, v.errors);
  }
  const twice = await validatePlan({ setup: { recipe: "rfq_with_bid" }, act: [{ op: "convert_to_auction", expect: "accept" }, { op: "convert_to_auction", decisive: true }], verify: [], expected: { outcome: "reject", code: "93" } }, { text: "Converting an already-auctioning trade is refused. 422, code 93." });
  check("convert: converting twice plans as arrange + decisive refusal", twice.ok && twice.plan.act.length === 2 && twice.plan.expected.code === "93", twice.errors);
  const avc = await autoVerify(twice.plan);
  check("read-back: a refused second conversion reads the event back with 2 rounds (RFQ + the first auction)", avc.plan.verify[0]?.assert[0].path === "stages" && avc.plan.verify[0]?.assert[0].op === "count" && avc.plan.verify[0]?.assert[0].value === 2, avc.plan.verify);
  const ob = await validatePlan({ setup: { recipe: "closed_rfq" }, act: [{ op: "open_bid", as: "vendor" }], verify: [], expected: { outcome: "reject" } });
  const avo = await autoVerify(ob.plan);
  check("read-back: a refused bid opening reads the bid count as unchanged", avo.plan.verify[0]?.assert[0].path === "bid_count" && avo.plan.verify[0]?.assert[0].value === 0, avo.plan.verify);
  const empty = await validatePlan({ setup: { recipe: "published_rfq" }, act: [{ op: "request", request: { method: "PATCH", path: "/trade/{{tradeId}}/edit_weight_parameters", body: {} } }], verify: [], expected: { outcome: "accept" } }, { text: "Saving weights with the happy-path body works. HTTP 200." });
  check("request: a write with an empty body is refused by the validator", !empty.ok && empty.errors.some((e) => /sent with no body/.test(e)), empty.errors);
  const emptyOk = await validatePlan({ setup: { recipe: "published_rfq" }, act: [{ op: "request", request: { method: "PATCH", path: "/trade/{{tradeId}}/edit_weight_parameters", body: {} } }], verify: [], expected: { outcome: "reject" } }, { text: "A request with an empty body {} is refused. HTTP 422 code 2." });
  check("request: an empty body the case itself sends is fine", emptyOk.ok, emptyOk.errors);
}

// ── 8 · polarity: negations and product words ──
{
  const { polarityOf } = await import("../src/agents/apiPlanner.js");
  check("polarity: 'is not blocked' is acceptance", polarityOf("An RFQ-then-auction round next to an RFQ round on the same draft is not blocked") === "accept");
  check("polarity: 'Publishes; no savings error' is acceptance", polarityOf("Publishes; no savings error.") === "accept");
  check("polarity: 'No second award can be started' is a refusal", polarityOf("No second award can be started while one is in approval") === "reject");
  check("polarity: 'the buyer rejects a submitted bid … HTTP 200' is acceptance", polarityOf("The bid is rejected and the reason is stored for the vendor. HTTP 200.") === "accept");
  check("polarity: 'HTTP 422, code 258' is a refusal", polarityOf("Refused. HTTP 422, code 258 'You cannot re-schedule this event!'.") === "reject");
  check("polarity: 'crashes' is no-5xx", polarityOf("A send without a reminder kind crashes") === "no-5xx");
  check("polarity: the expected column outvotes the title", casePolarity({ heads: ["Reopen with the extension written as a word: the round check answers first", "HTTP 422, code 4 'Request not found'."], text: "" }) === "reject");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
