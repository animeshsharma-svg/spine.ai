/**
 * Offline unit tests of the platform's decision logic — the code that turns
 * an HTTP answer into a verdict, a response into field checks, a verdict into
 * words, and (for CI itself) a backend diff into features to re-test.
 *
 *   npm run ci:unit
 *   node --import tsx --test scripts/ci-unit-tests.ts
 *
 * No network, no database, no Procol. Each test pins a rule someone wrote
 * down in a comment; if the rule changes on purpose, change the test with it.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { apiAttempt, classify, documentedCodes, redactSecrets, runCheck, type Check, type CheckOutcome } from "../src/checks/engine.js";
import { appOf, appRefusal } from "../src/checks/appAccess.js";
import { endpointOf, evaluateStepAssertions, type AssertionCatalog } from "../src/checks/apiAssertions.js";
import { humanActual } from "../src/checks/humanize.js";
import { journeyOutcome, journeyPlan, type JourneyStepRecord } from "../src/checks/journeyModel.js";
import { resultRows } from "../src/db/runHistory.js";
import { classifyChange, compareResults, knownPlaceholders, resultKey, tally, takeLock, validateCases } from "./ci-lib.js";
import {
  changedLines,
  classNamesOfFile,
  controllerOfFile,
  enclosingDefs,
  keywordFeatures,
  mapChangedFiles,
  normaliseCasePath,
  parseRoutes,
  routeMatchesCase,
} from "./ci-backend-map.js";

const outcome = (o: Partial<CheckOutcome>): CheckOutcome => ({ httpStatus: 200, accepted: true, message: null, durationMs: 5, ...o });

// ── engine.classify: an HTTP answer → a verdict ─────────────────────────────

describe("engine.classify", () => {
  test("a 5xx is always a defect, whatever the case expected", () => {
    for (const e of ["accept", "reject", "no-5xx"] as const) {
      const r = classify(e, outcome({ httpStatus: 500, accepted: false }));
      assert.equal(r.pass, false);
      assert.ok(!r.inconclusive);
      assert.match(r.verdict, /5xx is always a defect/);
    }
  });
  test("a 401 proves nothing: inconclusive, never a pass", () => {
    const r = classify("reject", outcome({ httpStatus: 401, accepted: false }));
    assert.equal(r.pass, false);
    assert.equal(r.inconclusive, true);
  });
  test("reject: a refusal passes, an acceptance fails", () => {
    assert.equal(classify("reject", outcome({ httpStatus: 422, accepted: false, message: "Quantity must be positive" })).pass, true);
    const bad = classify("reject", outcome({ httpStatus: 200, accepted: true }));
    assert.equal(bad.pass, false);
    assert.match(bad.verdict, /ACCEPTED/);
  });
  test("reject for a different reason than expected is inconclusive", () => {
    const r = classify("reject", outcome({ httpStatus: 422, accepted: false, message: "Trade not found" }), "duration exceeds");
    assert.equal(r.pass, false);
    assert.equal(r.inconclusive, true);
  });
  test("reject with the expected message passes", () => {
    const r = classify(
      "reject",
      outcome({ httpStatus: 422, accepted: false, message: "RFP duration exceeds RFQ end time. Please adjust." }),
      "RFP duration exceeds RFQ end time",
    );
    assert.equal(r.pass, true);
  });
  test("no-5xx: a clean refusal (a WAF 403) is fine", () => {
    assert.equal(classify("no-5xx", outcome({ httpStatus: 403, accepted: false })).pass, true);
    assert.equal(classify("no-5xx", outcome({ httpStatus: 200, accepted: true })).pass, true);
  });
  test("accept: 2xx passes, a refusal fails", () => {
    assert.equal(classify("accept", outcome({ httpStatus: 201 })).pass, true);
    const r = classify("accept", outcome({ httpStatus: 422, accepted: false, message: "Name can't be blank" }));
    assert.equal(r.pass, false);
    assert.match(r.verdict, /REJECTED a valid input/);
  });
  test("a documented not-found code is the case working, not a broken fixture", () => {
    // EDGE-PUB-088: GET /event_groups/1 documents "code 533 or 455"; 533 is "Project does not exist."
    const doc = "HTTP 422, code 533 or 455 — for uuid-enabled clients check_for_uuid decodes even an integer id.";
    assert.deepEqual(documentedCodes(doc), ["533", "455"]);
    const ok = classify("reject", outcome({ httpStatus: 422, accepted: false, message: "Project does not exist." }), undefined, doc);
    assert.equal(ok.pass, true);
    // Without the code in the documentation it stays "the fixture was not usable".
    const r = classify("reject", outcome({ httpStatus: 422, accepted: false, message: "Project does not exist." }), undefined, "HTTP 422 for a bad id.");
    assert.equal(r.inconclusive, true);
  });
  test("a code mentioned after the lead clause is not the expected answer", () => {
    assert.deepEqual(documentedCodes("HTTP 422, code 2001 'New stage…' — when the setting is OFF the answer is code 1127 first."), ["2001"]);
  });
  test("a case quoting its own message is still held to it, whatever the code", () => {
    const r = classify("reject", outcome({ httpStatus: 422, accepted: false, message: "failed to add remark", errorCode: "472" }), "You can attach a maximum of 10 files", "HTTP 422 code 472 with message 'You can attach a maximum of 10 files'");
    assert.equal(r.inconclusive, true);
  });
  test("a message lifted from the explanation does not override the code the lead clause names", () => {
    // EDGE-PUB-102: the runner lifted "s company in the caller" from "the event's company in the caller's …".
    const doc = "HTTP 422, code 888 (if id 1 is not active/latest) or 455 — the raw item_id is looked up unscoped, then update? requires the event's company in the caller's allowed companies.";
    const r = classify("reject", outcome({ httpStatus: 422, accepted: false, message: "Invalid Parameters" }), "s company in the caller", doc);
    assert.equal(r.pass, true);
    const other = classify("reject", outcome({ httpStatus: 422, accepted: false, message: "Insufficient parameters" }), "s company in the caller", doc);
    assert.equal(other.inconclusive, true);
  });
  test("the buyer's console session is never sent to a vendor-only API (it would be signed out)", async () => {
    const tok = (key: string) => ({ tokens: { accessToken: Buffer.from(`${key}:s:t`).toString("base64") } });
    const buyer = { ...tok("console_app_key"), post: async () => { throw new Error("must not be sent"); } };
    assert.equal(appOf(buyer), "console");
    assert.equal(appOf(tok("agribid_web_key")), "vendor");
    assert.ok(appRefusal("console", "POST", "/v1/bids"));
    assert.ok(appRefusal("console", "POST", "/v1/bids/WHBERFpw/create_bid_products"));
    assert.equal(appRefusal("vendor", "POST", "/v1/bids"), undefined);
    assert.equal(appRefusal("console", "GET", "/v1/dashboard_configuration"), undefined);
    assert.equal(appRefusal("console", "POST", "/v1/bulk_create_vendor"), undefined);
    assert.equal(appRefusal("console", "POST", "/event_groups"), undefined); // unversioned: never judged
    const o = await apiAttempt(buyer, "/v1/bids", {});
    assert.ok(o.notSent);
    const r = classify("reject", o);
    assert.equal(r.inconclusive, true);
    assert.match(r.verdict, /^not sent/);
  });
  test("a unit the case sent and this client lacks is a data mismatch, not a product answer", async () => {
    const mk = (expected: "accept" | "reject", expectedResult: string): Check => ({
      id: "T1", flowId: "events.rfq_only", module: "m", scenario: "s", type: "Negative" as any, category: "c", priority: "P1", severity: "High",
      expected, layer: "api", inputSummary: "", expectedResult,
      request: { method: "POST", path: "/trade/template_input", body: { data: [{ product: { unit_type: "KG" } }] } },
      exec: async () => ({ httpStatus: 422, accepted: false, message: "The unit kg is not present", durationMs: 1 }),
    } as Check);
    const acc = await runCheck({} as any, mk("accept", "2xx. The guard is time_difference < 30."));
    assert.equal(acc.inconclusive, true, "an accept case refused for the client's unit is not a product failure");
    const doc = await runCheck({} as any, mk("reject", "HTTP 422 'The unit kg is not present' — the unit is checked first."));
    assert.equal(doc.pass, true, "a case that documents the unit refusal is judged normally");
  });
  test("credentials never survive into a stored message", () => {
    const s = redactSecrets(`headers: access-token: abcDEF123456789 authorization: Bearer xyz.abc`)!;
    assert.ok(!s.includes("abcDEF123456789"));
    assert.ok(!s.includes("xyz.abc"));
  });
});

// ── apiAssertions: a live reply → field checks ──────────────────────────────

describe("apiAssertions", () => {
  test("endpointOf normalises ids and drops the query", () => {
    assert.equal(endpointOf("post", "/event_groups/RHBjY3Bj/x?y=1"), "POST /event_groups/:id/x");
    assert.equal(endpointOf("GET", "/trade/12345/event_summary"), "GET /trade/:id/event_summary");
  });

  const catalog: AssertionCatalog = {
    generatedAt: "2026-01-01T00:00:00Z",
    fromRuns: [],
    steps: {
      create_draft: {
        step: "create_draft",
        endpoint: "POST /event_groups",
        samples: 3,
        assertions: [
          { id: "A1", step: "create_draft", endpoint: "POST /event_groups", path: "", op: "status_2xx", title: "ok", expected: "2xx", why: "", severity: "critical", samples: 3 },
          { id: "A2", step: "create_draft", endpoint: "POST /event_groups", path: "uuid", op: "exists", title: "uuid", expected: "present", why: "", severity: "major", samples: 3 },
          { id: "A3", step: "create_draft", endpoint: "POST /event_groups", path: "name", op: "equals_request", ref: "name", title: "name", expected: "as sent", why: "", severity: "major", samples: 3 },
          { id: "A4", step: "create_draft", endpoint: "POST /event_groups", path: "rfp_mode", op: "one_of", value: ["a", "b"], title: "mode", expected: "a|b", why: "", severity: "minor", samples: 3 },
          { id: "A5", step: "create_draft", endpoint: "POST /event_groups", path: "qty", op: "gte", value: 0, title: "qty", expected: ">=0", why: "", severity: "minor", samples: 3 },
          { id: "A6", step: "create_draft", endpoint: "POST /event_groups", path: "uuid", op: "equals_made", ref: "eventGroupUuid", title: "same", expected: "same", why: "", severity: "minor", samples: 3 },
        ],
      },
    },
  };
  const step = (over: Partial<JourneyStepRecord>): JourneyStepRecord => ({
    n: 2,
    kind: "create_draft",
    actor: "buyer",
    title: "Create the draft",
    expected: "",
    actual: "",
    verdict: "worked",
    call: { method: "POST", path: "/event_groups", body: { name: "API_Test_1" } },
    status: 201,
    ms: 300,
    startedAt: "2026-01-01T00:00:00Z",
    ...over,
  });

  test("a worked step is checked field by field", () => {
    const r = evaluateStepAssertions(step({}), { uuid: "RFFEY0RO", name: "API_Test_1", rfp_mode: null, qty: "12.5" }, { eventGroupUuid: "RFFEY0RO" }, catalog)!;
    const by = Object.fromEntries(r.results.map((x) => [x.id, x.pass]));
    assert.equal(by.A1, true);
    assert.equal(by.A2, true);
    assert.equal(by.A3, true);
    assert.equal(by.A4, null, "null means 'not set', which one_of does not judge");
    assert.equal(by.A5, true, "a numeric string counts as a number");
    assert.equal(by.A6, true);
    assert.equal(r.total, 6);
  });
  test("a documented server replacement wins over what was sent; a retired check is not judged", () => {
    const cat: AssertionCatalog = {
      ...catalog,
      steps: {
        create_draft: {
          ...catalog.steps.create_draft,
          assertions: [
            { id: "P1", step: "create_draft", endpoint: "POST /event_groups", path: "w[*].configuration.precision", op: "equals_request", ref: "w[0].configuration.precision", title: "p", expected: "as sent", why: "", severity: "critical", samples: 3, overriddenBy: { path: "trade_config.widget_precision", source: "trade_template_helper.rb:1816-1829" } },
            { id: "R1", step: "create_draft", endpoint: "POST /event_groups", path: "x", op: "exists", title: "x", expected: "present", why: "", severity: "major", samples: 3, retired: "learned from one client" },
          ],
        },
      },
    };
    const sent = step({ call: { method: "POST", path: "/event_groups", body: { w: [{ configuration: { precision: 4 } }] } } });
    const two = evaluateStepAssertions(sent, { w: [{ configuration: { precision: 2 } }], trade_config: { widget_precision: 2 } }, {}, cat)!;
    assert.equal(two.results.find((x) => x.id === "P1")!.pass, true, "the company's precision (2) replaces the sent 4");
    assert.equal(two.results.some((x) => x.id === "R1"), false);
    const lost = evaluateStepAssertions(sent, { w: [{ configuration: { precision: 2 } }] }, {}, cat)!;
    assert.equal(lost.results.find((x) => x.id === "P1")!.pass, false, "without a company setting the echo must hold");
  });
  test("a changed value is a failed check, not a skipped one", () => {
    const r = evaluateStepAssertions(step({}), { uuid: "OTHER123", name: "renamed", qty: -1 }, { eventGroupUuid: "RFFEY0RO" }, catalog)!;
    const by = Object.fromEntries(r.results.map((x) => [x.id, x.pass]));
    assert.equal(by.A3, false);
    assert.equal(by.A5, false);
    assert.equal(by.A6, false);
  });
  test("a refused step only has its status judged", () => {
    const r = evaluateStepAssertions(step({ verdict: "refused", status: 422 }), { error: { code: 2 } }, {}, catalog)!;
    assert.equal(r.total, 1);
    assert.equal(r.results[0].id, "A1");
    assert.equal(r.results[0].pass, false);
  });
  test("a step the catalog does not know, or one that did not run, gets no checks", () => {
    assert.equal(evaluateStepAssertions(step({ verdict: "not-run" }), {}, {}, catalog), undefined);
    assert.equal(evaluateStepAssertions(step({ call: { method: "GET", path: "/event_groups" } }), {}, {}, catalog), undefined);
  });
});

// ── humanize: a check's outcome in words ────────────────────────────────────

describe("humanize.humanActual", () => {
  test("a 5xx reads as the app breaking, a 4xx as a refusal", () => {
    assert.match(humanActual({ op: "status_2xx", pass: false, status: 500 }), /broke/);
    assert.match(humanActual({ op: "status_2xx", pass: false, status: 422 }), /refused/);
    assert.match(humanActual({ op: "status_2xx", pass: false, status: 0 }), /No answer/);
  });
  test("not evaluated says so, with the reason", () => {
    assert.equal(humanActual({ op: "exists", pass: null, reason: "the array was empty" }), "Not checked — the array was empty.");
  });
  test("no internal words leak into the sentence", () => {
    const s = humanActual({ op: "equals_request", pass: false, sent: "A", bad: "B" });
    assert.ok(!/equals_request|undefined|\{/.test(s), s);
  });
});

// ── journeyModel: which steps a run walks, and its one-line outcome ─────────

describe("journeyModel", () => {
  test("a technical + RFQ event with surrogate bidding", () => {
    const p = journeyPlan(["events.rfp_rfq", "bids.surrogate"]);
    assert.equal(p.wanted, true);
    assert.equal(p.eventType, "rfp_rfq");
    assert.equal(p.features.surrogate, true);
    assert.equal(p.features.counterOffer, false);
    assert.ok(p.steps.includes("buyer_login"));
  });
  test("features with no journey do not start one", () => {
    assert.equal(journeyPlan(["masterdata.category"]).wanted, false);
  });
  const s = (n: number, verdict: JourneyStepRecord["verdict"], message?: string): JourneyStepRecord => ({
    n,
    kind: "create_draft",
    actor: "buyer",
    title: `Step ${n}`,
    expected: "",
    actual: "",
    verdict,
    message,
    startedAt: "",
  });
  test("an all-green journey says so", () => {
    assert.equal(journeyOutcome([s(1, "worked"), s(2, "worked")]).outcome, "All 2 steps that ran worked.");
  });
  test("the first refusal is where the journey stopped", () => {
    const o = journeyOutcome([s(1, "worked"), s(2, "refused", "Not allowed"), s(3, "not-run")]);
    assert.equal(o.stoppedAt, 2);
    assert.match(o.outcome, /1 of 2 steps worked; step 2 — step 2 — was refused: “Not allowed”/);
  });
});

// ── runHistory.resultRows: one row per verdict ──────────────────────────────

describe("runHistory.resultRows", () => {
  test("cases, steps and evaluated field checks each become a row; inconclusive stays inconclusive", () => {
    const rows = resultRows({
      id: "r1",
      ts: "2026-01-01T00:00:00Z",
      checkResults: [
        { id: "EDGE-1", pass: true, inconclusive: false } as any,
        { id: "EDGE-2", pass: false, inconclusive: true } as any,
      ],
      journey: {
        eventType: "rfq_only",
        steps: [{ kind: "create_draft", title: "Create", verdict: "worked", actual: "ok", assertions: { results: [{ id: "F1", pass: true }, { id: "F2", pass: null }] } }],
      },
    } as any);
    assert.deepEqual(
      rows.map((r) => `${r.kind}:${r.case_id}:${r.verdict}`),
      ["case:EDGE-1:pass", "case:EDGE-2:inconclusive", "journey-step:create_draft:worked", "field-check:F1:pass"],
    );
  });
});

// ── the nightly's "what broke since last time" ──────────────────────────────

describe("nightly comparison", () => {
  test("every combination of tonight × previous", () => {
    assert.equal(classifyChange("fail", "pass"), "newly-broken");
    assert.equal(classifyChange("broken", "worked"), "newly-broken");
    assert.equal(classifyChange("refused", "refused"), "still-broken");
    assert.equal(classifyChange("fail", undefined), "broken-first-time");
    assert.equal(classifyChange("fail", "inconclusive"), "broken-first-time");
    assert.equal(classifyChange("pass", "fail"), "fixed");
    assert.equal(classifyChange("pass", "pass"), "still-good");
    assert.equal(classifyChange("worked", undefined), "new-good");
    assert.equal(classifyChange("inconclusive", "pass"), "unclear", "couldn't tell is never a pass");
    assert.equal(classifyChange("not-run", "fail"), "unclear");
  });
  test("a journey step is the same check only on the same event type", () => {
    const a = resultKey({ company_id: 1, kind: "journey-step", case_id: "create_draft", feature: "rfq_only" });
    const b = resultKey({ company_id: 1, kind: "journey-step", case_id: "create_draft", feature: "rfp_only" });
    assert.notEqual(a, b);
    const c = resultKey({ company_id: 1, kind: "case", case_id: "EDGE-1", feature: "x" });
    const d = resultKey({ company_id: 1, kind: "case", case_id: "EDGE-1", feature: "y" });
    assert.equal(c, d);
  });
  test("compareResults pairs tonight with the previous verdict", () => {
    const row = { company_id: 1, kind: "case", case_id: "EDGE-1", feature: "f", title: "t", verdict: "fail", reason: null };
    const prev = new Map([[resultKey(row), { verdict: "pass", at: "2026-01-01" }]]);
    const out = compareResults([row, { ...row, case_id: "EDGE-2" }], prev);
    assert.deepEqual(out.map((x) => x.change), ["newly-broken", "broken-first-time"]);
    assert.equal(tally(out)["newly-broken"], 1);
  });
  test("the lock admits one run at a time and is taken over when its owner died", () => {
    const dir = mkdtempSync(join(tmpdir(), "spine-lock-"));
    const f = join(dir, ".lock");
    try {
      const a = takeLock(f, "a");
      assert.equal(a.ok, true);
      const b = takeLock(f, "b");
      assert.equal(b.ok, false);
      if (a.ok) a.release();
      assert.equal(existsSync(f), false);
      // a stale lock (a pid that cannot exist)
      writeFileSync(f, JSON.stringify({ pid: 2 ** 22 + 12345, label: "dead" }));
      const c = takeLock(f, "c");
      assert.equal(c.ok, true);
      if (c.ok) c.release();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});


// ── the case library's shape ────────────────────────────────────────────────

describe("case-data validation", () => {
  test("the placeholder list is read from caseLibrary.ts itself", () => {
    const k = knownPlaceholders();
    for (const n of ["eventGroupUuid", "tradeId", "stamp", "vbuSheet", "rfpTradeId"]) assert.ok(k.has(n), n);
    assert.ok(!k.has("vbu"), "comments are not placeholders");
  });
  const known = new Set(["eventGroupUuid", "stamp"]);
  const features = new Set(["events.publish"]);
  const good = { id: "X-1", feature: "events.publish", title: "t", method: "PATCH", path: "/event_groups/{{eventGroupUuid}}", expected: "reject", expectedResult: "422", body: { a: "{{stamp}}" } };
  test("a well-formed case passes", () => {
    const r = validateCases([{ name: "a.json", text: JSON.stringify([good]) }], known, features);
    assert.deepEqual(r.errors, []);
    assert.equal(r.count, 1);
  });
  test("duplicate ids across files, bad expected, unknown feature, unknown placeholder, bad JSON", () => {
    const r = validateCases(
      [
        { name: "a.json", text: JSON.stringify([good]) },
        { name: "b.json", text: JSON.stringify([{ ...good, expected: "maybe", feature: "nope", path: "/x/{{mystery}}" }]) },
        { name: "c.json", text: "{not json" },
      ],
      known,
      features,
    );
    const all = r.errors.join("\n");
    assert.match(all, /used twice/);
    assert.match(all, /must be accept, reject or no-5xx/);
    assert.match(all, /not in config\/featureTree.ts/);
    assert.match(all, /\{\{mystery\}\}/);
    assert.match(all, /c.json: not valid JSON/);
  });
  test("an unknown placeholder on a case marked notRunnable is a note, not an error", () => {
    const r = validateCases([{ name: "a.json", text: JSON.stringify([{ ...good, path: "/x/{{mystery}}", notRunnable: "needs a form uuid" }]) }], known, features);
    assert.deepEqual(r.errors, []);
    assert.equal(r.notes.length, 1);
  });
});

// ── backend-watch: changed files → features ─────────────────────────────────

const ROUTES_RB = `
Rails.application.routes.draw do
  def api_routes
    namespace :v1 do
      v1_api_routes
    end
    scope :trade, :controller => 'trade' do
      post 'template_input' => 'trade#template_input' # the add-stage call
      patch ':id/template_input' => 'trade#template_input_trade_update'
    end
    resources :trade, only: [:show, :update]
    scope :proposal, :controller => 'proposal' do
      post ':id/submit', to: 'proposal#submit'
    end
    resources :workflows, only: [:index] do
      member do
        post :transition
      end
    end
  end
  def v1_api_routes
    get 'purchase_requests/:id' => 'purchase_requests#show'
  end
  namespace :api, defaults: { format: 'json' } do
    api_routes
  end
end
`;

describe("backend-watch mapping", () => {
  const routes = parseRoutes(ROUTES_RB);
  test("routes.rb: scopes, resources, member blocks, helpers and namespaces", () => {
    const got = routes.map((r) => `${r.method} ${r.path} ${r.controller}#${r.action}`).sort();
    assert.deepEqual(got, [
      "GET v1/purchase_requests/:id api/v1/purchase_requests#show",
      "GET trade/:id api/trade#show",
      "GET workflows api/workflows#index",
      "PATCH trade/:id api/trade#update",
      "PATCH trade/:id/template_input api/trade#template_input_trade_update",
      "POST proposal/:id/submit api/proposal#submit",
      "POST trade/template_input api/trade#template_input",
      "POST workflows/:id/transition api/workflows#transition",
      "PUT trade/:id api/trade#update",
    ].sort());
  });
  test("case paths: placeholders and ids become :id, the query goes", () => {
    assert.equal(normaliseCasePath("/trade/{{tradeId}}/template_input?x=1"), "trade/:id/template_input");
    assert.equal(normaliseCasePath("/v1/purchase_requests/12345"), "v1/purchase_requests/:id");
    assert.ok(routeMatchesCase({ method: "PATCH", path: "trade/:id/template_input" }, "PATCH", "/trade/{{tradeId}}/template_input"));
    assert.ok(!routeMatchesCase({ method: "POST", path: "trade/template_input" }, "PATCH", "/trade/template_input"));
    assert.ok(routeMatchesCase({ method: "PUT", path: "trade/:id" }, "PATCH", "/trade/{{tradeId}}"));
  });
  test("a diff's hunks → the methods they sit in", () => {
    const src = ["class TradeController", "  before_action :x", "  def template_input", "    a", "  end", "  def show", "    b", "  end", "end"].join("\n");
    const diff = "@@ -4 +4 @@\n-a\n+a2\n@@ -7,0 +7,2 @@\n+c\n+d";
    assert.deepEqual(changedLines(diff), [4, 7, 8]);
    assert.deepEqual(enclosingDefs(src, [4, 7]), ["template_input", "show"]);
    assert.deepEqual(enclosingDefs(src, [2]), ["*"]);
  });
  test("file names → controllers, classes and feature words", () => {
    assert.equal(controllerOfFile("app/controllers/api/v1/purchase_requests_controller.rb"), "api/v1/purchase_requests");
    assert.deepEqual(classNamesOfFile("app/services/trade/template_input_service.rb"), ["TemplateInputService", "Trade::TemplateInputService"]);
    assert.ok(keywordFeatures("app/services/auction/dutch_price_service.rb").includes("auction.convert"));
    assert.ok(keywordFeatures("app/workers/surrogate_bid_worker.rb").includes("bids.surrogate"));
    assert.deepEqual(keywordFeatures("app/models/weather.rb"), []);
  });
  test("end to end: controller action, a service used by it, a spec, and an unknown file", () => {
    const cases = [
      { id: "C1", feature: "events.rfp_rfq", title: "add a stage", method: "POST", path: "/trade/template_input" },
      { id: "C2", feature: "events.config", title: "edit a stage", method: "PATCH", path: "/trade/{{tradeId}}/template_input" },
      { id: "C3", feature: "award.submit", title: "submit an award", method: "POST", path: "/proposal/{{proposalUuid}}/submit" },
    ];
    const trade = ["class Api::TradeController", "  def template_input", "    x", "  end", "  def template_input_trade_update", "    y", "  end", "end"].join("\n");
    const out = mapChangedFiles({
      files: [
        "app/controllers/api/trade_controller.rb",
        "app/services/proposal_submit_service.rb",
        "spec/requests/trade_spec.rb",
        "app/models/weather.rb",
      ],
      routes,
      cases,
      sourceOf: (f) => (f.includes("trade_controller") ? trade : undefined),
      diffOf: (f) => (f.includes("trade_controller") ? "@@ -3 +3 @@\n-x\n+x2" : undefined),
      controllersReferencing: (cls) => (cls === "ProposalSubmitService" ? ["api/proposal"] : []),
    });
    const [ctrl, svc, spec, unknown] = out;
    assert.equal(ctrl.via, "route");
    assert.deepEqual(ctrl.actions, ["template_input"]);
    assert.deepEqual(ctrl.cases, ["C1"], "only the action the hunk touched");
    assert.deepEqual(ctrl.features, ["events.rfp_rfq"]);
    assert.equal(svc.via, "reference");
    assert.deepEqual(svc.features, ["award.submit"]);
    assert.equal(spec.via, "inert");
    assert.equal(unknown.via, "none");
  });
});

// ── the workflow and scripts this file ships with ───────────────────────────

describe("repository wiring", () => {
  test("package.json exposes the CI scripts", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"));
    for (const s of ["ci:check", "ci:unit", "nightly", "backend:watch"]) assert.ok(pkg.scripts[s], s);
  });
});

describe("backend-watch planning", () => {
  test("controller concerns resolve to the module a controller includes", async () => {
    const { classNamesOfFile } = await import("./ci-backend-map.js");
    assert.deepEqual(classNamesOfFile("app/controllers/concerns/trade_controller_helper.rb"), ["TradeControllerHelper"]);
  });
  test("the fewest journeys cover the matched features; non-journey features ride on the first run", async () => {
    const { planTargetedRuns } = await import("./ci-backend-map.js");
    const { COMBOS } = await import("./ci-lib.js");
    const walks = (f: string, combo: string[]) => journeyWalksFeatureFor(f, combo);
    const plan = planTargetedRuns(
      [
        { feature: "bids.surrogate", cases: ["EDGE-BID-001"], via: "route" },
        { feature: "events.rfp_rfq", cases: ["EDGE-STG-001"], via: "route" },
        { feature: "events.validation", cases: ["EDGE-CRT-001"], via: "route" },
        { feature: "pr.list", cases: ["PR-1"], via: "route" },
      ],
      COMBOS,
      walks,
      { maxRuns: 3 },
    );
    assert.equal(plan.runs.length, 1, "one journey (technical + RFQ with a surrogate bid) covers both");
    assert.equal(plan.runs[0].combo, "rfp_rfq_surrogate");
    assert.ok(plan.runs[0].features.includes("events.validation"));
    assert.deepEqual(plan.outOfScope, ["pr.list"]);
    assert.deepEqual(plan.runs[0].cases.sort(), ["EDGE-BID-001", "EDGE-CRT-001", "EDGE-STG-001"]);
  });
  test("a keyword-only match widens the run to every case of the feature", async () => {
    const { planTargetedRuns } = await import("./ci-backend-map.js");
    const { COMBOS } = await import("./ci-lib.js");
    const plan = planTargetedRuns([{ feature: "events.rfp_only", cases: [], via: "keyword" }], COMBOS, journeyWalksFeatureFor);
    assert.equal(plan.runs[0].combo, "rfp_only");
    assert.deepEqual(plan.runs[0].cases, []);
  });
});

import { journeyWalksFeature } from "../src/checks/journeyModel.js";
function journeyWalksFeatureFor(feature: string, comboFeatures: string[]): boolean {
  return journeyWalksFeature(feature, journeyPlan(comboFeatures));
}

describe("backend-watch planning limits", () => {
  test("a journey type left over at the run limit is reported, never ticked onto another journey", async () => {
    const { planTargetedRuns } = await import("./ci-backend-map.js");
    const { COMBOS } = await import("./ci-lib.js");
    const plan = planTargetedRuns(
      [
        { feature: "events.rfp_only", cases: [], via: "keyword" },
        { feature: "events.rfp_auction", cases: [], via: "keyword" },
        { feature: "events.boq", cases: [], via: "keyword" },
      ],
      COMBOS,
      journeyWalksFeatureFor,
      { maxRuns: 1 },
    );
    assert.equal(plan.runs.length, 1);
    assert.equal(plan.runs[0].features.filter((f) => /^events\.(rfq_only|rfp_only|rfp_rfq|rfp_auction)$/.test(f)).length, 1);
    assert.ok(plan.runs[0].features.includes("events.boq"), "a feature no journey walks rides along");
    assert.equal(plan.dropped.length, 1);
  });
});

describe("nightly edge-case placement", () => {
  test("each feature's edge cases run once, on a journey that fits; journey-shaping ones only on their own", async () => {
    const { assignEdgeCases } = await import("./ci-backend-map.js");
    const combos = [
      { name: "rfp_only", features: ["events.rfp_only"] },
      { name: "rfq_only", features: ["events.rfq_only"] },
    ];
    const { byCombo, unplaced } = assignEdgeCases(
      [
        { id: "E1", feature: "evaluation.score" },
        { id: "E2", feature: "award.submit" },
        { id: "E3", feature: "bids.surrogate" },
        { id: "E4", feature: "events.rfq_only" },
        { id: "E5", feature: "events.validation" },
      ],
      combos,
    );
    assert.ok(byCombo.get("rfp_only")!.cases.includes("E1"), "evaluation needs the technical round");
    assert.ok(byCombo.get("rfq_only")!.cases.includes("E2"), "awarding needs a priced round");
    assert.ok(byCombo.get("rfq_only")!.cases.includes("E4"));
    assert.deepEqual(unplaced, ["bids.surrogate"], "a surrogate bid changes the journey, so it waits for its own");
    const all = [...byCombo.values()].flatMap((v) => v.cases);
    assert.equal(new Set(all).size, all.length, "no case runs twice");
  });
});

describe("report wording", () => {
  test("identifier-style case titles become words; prose titles are left alone", async () => {
    const { humanTitle } = await import("./ci-history.js");
    assert.equal(humanTitle("QA_Platform_publish_with_empty_audience_invites_nobody").includes("_"), false);
    assert.equal(humanTitle("Create the draft event"), "Create the draft event");
    assert.equal(humanTitle(""), "an untitled check");
  });
});

describe("API planner: what a typed case expects", () => {
  test("a question is not read as an expected outcome", async () => {
    const { polarityOf } = await import("../src/agents/apiPlanner.js");
    assert.equal(polarityOf("create an rfq event check whether a vendor can bid after submission time is over"), null);
    assert.equal(polarityOf("Can a vendor bid after the deadline?"), null);
    assert.equal(polarityOf("A vendor can bid before the deadline"), "accept");
    assert.equal(polarityOf("A vendor cannot bid after the deadline"), "reject");
    assert.equal(polarityOf("check whether a vendor is refused after the deadline"), "reject");
  });
});

import "./hubspot-unit-tests.js"; // HubSpot stripper, leak check, classifier, case file

import "./db-unit-tests.js"; // product tables: run mapping, case versions, redaction, bug sheet (database part skips without SPINE_DB_URL)
import "./integrity-unit-tests.js"; // bid-number calculator: exact decimals, template formulas, ranks, savings, invariants
import "./matcher-unit-tests.js"; // case matcher frame + automation-exemplar reuse rules
