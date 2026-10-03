/**
 * Offline unit tests of the HubSpot ticket pipeline's privacy and decision
 * logic: the personal-data stripper, the leak check that fails closed, the
 * model gate, the loader's column mapping, the rule classifier, the feature
 * patterns, the schema checks on model answers and the committed case file.
 *
 *   npm run hubspot:unit
 *   node --import tsx --test scripts/hubspot-unit-tests.ts
 *
 * No network, no database, no model. Every name, number and company in here
 * is invented.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDictionary, clientIdFor, leakCheck, mayReachModel, stripText, stripTicket } from "../src/hubspot/strip.js";
import { fromRows, loadTicketFile, mapHeaders } from "../src/hubspot/load.js";
import { classifyByRules, validClassification } from "../src/hubspot/classify.js";
import { FEATURE_GROUP, PATTERNS, matchPattern } from "../src/hubspot/patterns.js";
import { FEATURE_KEYWORDS, keywordScores } from "../src/hubspot/mapFeature.js";
import { validModelScenario } from "../src/hubspot/scenario.js";
import { buildCaseFile } from "../src/hubspot/cases.js";
import { toRow } from "../src/hubspot/store.js";
import { parseJsonObject } from "../src/hubspot/slingringFast.js";
import { findFeature } from "../config/featureTree.js";
import type { ProcessedTicket, RawTicket } from "../src/hubspot/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, "..", "data", "fixtures");

const raw = (o: Partial<RawTicket>): RawTicket => ({
  id: "1",
  subject: "",
  content: "",
  companyNames: [],
  contactNames: [],
  ownerNames: [],
  thread: [],
  inputKind: "json",
  ...o,
});
const dict = (o: Partial<Pick<RawTicket, "contactNames" | "ownerNames" | "companyNames">> = {}) =>
  buildDictionary({ contactNames: [], ownerNames: [], companyNames: [], ...o });
const strip = (text: string, d = dict()) => stripText(text, d).text;

// ── the stripper: what must go ─────────────────────────────────────────────

describe("stripText removes personal data", () => {
  test("emails, including inside sentences", () => {
    const out = strip("Write to ravi.k+rfq@example.co.in for details.");
    assert.doesNotMatch(out, /@/);
    assert.match(out, /\[email\]/);
  });
  test("Indian mobile and landline numbers in their usual shapes", () => {
    for (const p of ["+91 98765 43210", "9876543210", "+91-9876543210", "022-2345 6789", "(022) 23456789", "0091 98765 43210"]) {
      const out = strip(`Call me on ${p} today`);
      assert.doesNotMatch(out, /\d{4}/, `${p} survived: ${out}`);
    }
  });
  test("labelled phone numbers of any length", () => {
    assert.match(strip("Mobile: 98765 4321"), /\[phone\]/);
  });
  test("every link, with or without a token", () => {
    const out = strip("Open https://app.example.com/e/abc?token=XYZ and www.example.org/x");
    assert.doesNotMatch(out, /https?:|www\.|token/);
  });
  test("tax and bank identifiers: GSTIN, PAN, IFSC, account number, Aadhaar, UPI", () => {
    const out = strip(
      "GSTIN 27ABCDE1234F1Z5, gstin 29aaacb1234c1z9, PAN ABCPE1234F, IFSC HDFC0001234, A/c No: 1234 5678 9012, Aadhaar 1234 5678 9012, UPI ravi@okhdfcbank",
    );
    for (const bad of ["27ABCDE1234F1Z5", "29aaacb1234c1z9", "ABCPE1234F", "HDFC0001234", "5678", "ravi@"]) assert.ok(!out.includes(bad), `${bad} survived: ${out}`);
  });
  test("addresses: a labelled address, a pincode, an address sentence — and only that sentence", () => {
    const out = strip("The bid failed. Address: Plot 12, Sector 5, MIDC Road, Pune - 411001. Please check the RFQ.");
    assert.doesNotMatch(out, /Plot|Sector|411001/);
    assert.match(out, /The bid failed\./);
    assert.match(out, /Please check the RFQ\./);
    assert.match(strip("Ship to pincode 560058 please"), /\[pincode\]/);
  });
  test("the ticket's own contact and owner names, wherever and however they are written", () => {
    const d = dict({ contactNames: ["Ravi Kumar (ravi@example.com)"], ownerNames: ["Neha Kapoor"] });
    const out = strip("RAVI said the event is broken; kumar confirmed. ravi.kumar is the login. Neha replied.", d);
    assert.doesNotMatch(out, /ravi|kumar|neha/i);
  });
  test("honorifics, self-introductions and unlisted Capitalised names", () => {
    assert.doesNotMatch(strip("Please ask Mr. Anil Mehta about it"), /Anil|Mehta/);
    assert.doesNotMatch(strip("My name is Sunita and the RFQ is stuck"), /Sunita/);
    assert.doesNotMatch(strip("This is Arvind from purchase."), /Arvind/);
    assert.doesNotMatch(strip("Please add Rohan Das and Sneha Pillai as users"), /Rohan|Das|Sneha|Pillai/);
  });
  test("customer companies: the ticket's own, M/s …, and … Pvt Ltd shapes", () => {
    const d = dict({ companyNames: ["Northwind Components Pvt Ltd"] });
    const out = strip("Northwind Components raised it; vendor M/s Blue Ridge Traders and Shree Ganesh Steel Traders Pvt Ltd cannot bid.", d);
    assert.doesNotMatch(out, /Northwind|Blue Ridge|Ganesh/);
    assert.match(out, /\[company\]/);
  });
  test("a known Procol client becomes 'the client' and keeps only its id", () => {
    assert.equal(clientIdFor(["GMMCO LIMITED"]), 47053);
    assert.equal(clientIdFor(["PROCOL DEMO"]), 198678);
    assert.equal(clientIdFor(["Demo Account 2"]), 32461);
    assert.equal(clientIdFor(["Some Other Pvt Ltd"]), null);
    const out = strip("GMMCO users see the unit error", dict({ companyNames: ["GMMCO LIMITED"] }));
    assert.match(out, /the client users see the unit error/);
  });
  test("greetings, signature blocks, quoted replies and attachments", () => {
    const out = strip(
      "Hi Team,\nThe bid is wrong.\nAttachment: proof.png\nRegards,\nSomeone Unlisted\nSenior Buyer\n+91 98765 43210",
    );
    assert.equal(out, "The bid is wrong.\n[attachment]");
    const quoted = strip("It is still broken.\nOn Tue, 2 Sep 2026 at 10:01, Support <s@example.com> wrote:\n> old text with 9876543210");
    assert.equal(quoted, "It is still broken.");
    assert.match(strip("See file bid_sheet final.xlsx for rows"), /\[attachment\]/);
  });
});

// ── the stripper: what must stay ───────────────────────────────────────────

describe("stripText keeps what a test needs", () => {
  test("error codes, dates, times, quantities and product words survive", () => {
    const out = strip("Error 712 on 2026-09-14 at 5:40 pm: 50 units at Rs 1,25,000 in the RFQ technical round, code 495.");
    for (const keep of ["712", "2026-09-14", "5:40 pm", "50 units", "1,25,000", "RFQ", "technical round", "495"]) assert.ok(out.includes(keep), `${keep} lost: ${out}`);
  });
  test("is deterministic", () => {
    const t = "Hi Ravi,\nCall +91 98765 43210, GSTIN 27ABCDE1234F1Z5.\nThanks";
    assert.equal(strip(t), strip(t));
  });
});

// ── the leak check: broader, fails closed ──────────────────────────────────

describe("leakCheck fails closed", () => {
  test("obfuscated emails and split phone numbers are caught", () => {
    assert.deepEqual(leakCheck("write to ravi [at] example [dot] com", dict()), ["email"]);
    assert.deepEqual(leakCheck("call 98765/43210", dict()), ["phone"]);
    assert.deepEqual(leakCheck("call +91 98765", dict()), ["phone"]);
  });
  test("lower-case or spaced tax ids and a surviving dictionary name are caught", () => {
    assert.ok(leakCheck("gst 27 abcde 1234 f1z5", dict()).includes("gstin"));
    assert.ok(leakCheck("Ravi says hi", dict({ contactNames: ["Ravi Kumar"] })).includes("name"));
    assert.ok(leakCheck("Acme Widgets again", dict({ companyNames: ["Acme Widgets Ltd"] })).includes("company"));
  });
  test("our own placeholders, dates and times are not leaks", () => {
    assert.deepEqual(leakCheck("[email] [phone] [name] [company] on 14/10/2026 10:30 and 2026-09-14 5:40 pm, code 712", dict()), []);
  });
  test("a ticket whose stripping missed something is flagged and kept from every model", () => {
    const t = stripTicket(raw({ content: "Quote total wrong. Call 98765/43210 or ravi [at] example [dot] com", contactNames: ["Ravi Kumar"] }));
    assert.ok(t.leaks.includes("phone") && t.leaks.includes("email"), JSON.stringify(t.leaks));
    assert.equal(mayReachModel(t, true), false);
    assert.equal(mayReachModel({ leaks: [] }, true), true);
    assert.equal(mayReachModel({ leaks: [] }, false), false);
  });
  test("a flagged ticket is stored with its words withheld", () => {
    const t = stripTicket(raw({ id: "77", subject: "Bid wrong", content: "Call 98765/43210" }));
    const row = toRow({
      ticket: t, classification: "defect", classificationConfidence: 0.7, classifiedBy: "rule", classificationWhy: "x",
      module: "bids", featureKey: "bids.place", mapConfidence: 0.5, mappedBy: "rule", mapCandidates: [], scenario: null,
      linkedCaseIds: [], aiSkipped: true, inEventsScope: true, dataset: "synthetic",
    });
    assert.match(row.subject!, /withheld/);
    assert.match(row.summary!, /withheld/);
    assert.ok(!JSON.stringify(row).includes("43210"));
  });
});

// ── the fixtures, end to end through the stripper ──────────────────────────

describe("synthetic fixtures", () => {
  const json = loadTicketFile(join(FIX, "hubspot-tickets.synthetic.json"));
  const csv = loadTicketFile(join(FIX, "hubspot-tickets.synthetic.csv"));
  test("load: 16 JSON tickets with threads, 6 CSV rows without", () => {
    assert.equal(json.tickets.length, 16);
    assert.equal(csv.tickets.length, 6);
    assert.ok(json.tickets[0].thread.length > 0);
    assert.ok(csv.tickets.every((t) => t.thread.length === 0 && t.inputKind === "csv"));
    assert.deepEqual(csv.missingColumns, []);
  });
  test("only the deliberately-obfuscated ticket leaks; no contact, owner or company name survives anywhere", () => {
    for (const r of [...json.tickets, ...csv.tickets]) {
      const s = stripTicket(r);
      if (r.id === "900000015") {
        assert.ok(s.leaks.length > 0, "the obfuscated ticket must be flagged");
        continue;
      }
      assert.deepEqual(s.leaks, [], `${r.id} leaked ${s.leaks}`);
      const blob = JSON.stringify(s).toLowerCase();
      for (const n of [...r.contactNames, ...r.ownerNames]) for (const tok of n.replace(/\(.*?\)/g, "").split(/\s+/).filter((x) => x.length > 2)) assert.ok(!blob.includes(tok.toLowerCase()), `${r.id}: "${tok}" survived`);
      for (const c of r.companyNames) if (!clientIdFor([c])) assert.ok(!blob.includes(c.toLowerCase().replace(/ (pvt ltd|private limited|ltd)$/, "")), `${r.id}: company survived`);
      assert.doesNotMatch(blob, /@example|\+91|98765|27abcde|hdfc0/);
    }
  });
});

// ── the loader ─────────────────────────────────────────────────────────────

describe("export column mapping", () => {
  test("headers match case-insensitively; associated company/contact/owner columns are found by name", () => {
    const m = mapHeaders(["TICKET ID", "ticket name", "Ticket Description", "Associated Company (Primary)", "Associated Contact", "Ticket owner", "Create date"]);
    assert.deepEqual(m.get("id"), ["TICKET ID"]);
    assert.deepEqual(m.get("company"), ["Associated Company (Primary)"]);
    assert.deepEqual(m.get("contact"), ["Associated Contact"]);
    assert.deepEqual(m.get("owner"), ["Ticket owner"]);
  });
  test("a missing column is reported, not fatal; rows without an id are skipped", () => {
    const r = fromRows([{ "Ticket ID": "5", "Ticket name": "x" }, { "Ticket name": "no id" }], "csv");
    assert.equal(r.tickets.length, 1);
    assert.ok(r.missingColumns.includes("content"));
  });
  test("several contacts in one cell become several dictionary entries", () => {
    const r = fromRows([{ "Ticket ID": "5", "Associated Contact": "Ravi Kumar; Neha Kapoor" }], "csv");
    assert.deepEqual(r.tickets[0].contactNames, ["Ravi Kumar", "Neha Kapoor"]);
  });
});

// ── classification ─────────────────────────────────────────────────────────

describe("rule classifier", () => {
  const cls = (subject: string, content: string, opts: Partial<RawTicket> = {}) => classifyByRules(stripTicket(raw({ subject, content, ...opts }))).classification;
  test("defects, questions, requests, settings and data are told apart", () => {
    assert.equal(cls("Quote accepted after deadline", "The vendor's quote was accepted after the deadline, this should not happen. It is a bug.", { category: "PRODUCT_ISSUE" }), "defect");
    assert.equal(cls("Reset", "Please reset my password, I am locked out."), "request");
    assert.equal(cls("GST", "Please update the GSTIN of our vendor."), "data");
    assert.equal(cls("BOQ", "Please enable the BOQ setting for our company account."), "config");
    assert.equal(cls("Evaluator", "How do I add a second evaluator? Is there a way to do it after publishing?"), "how_to");
  });
  test("support saying 'expected behaviour' outweighs the customer's 'error'", () => {
    const t = stripTicket(
      raw({
        subject: "Error 712",
        content: "I get error 712 when extending the technical round.",
        thread: [{ direction: "outbound", text: "This is expected behaviour: extend the RFQ first." }],
      }),
    );
    assert.equal(classifyByRules(t).classification, "how_to");
  });
  test("a tie is 'unclear' — never guessed as a defect by the rules", () => {
    assert.equal(cls("Hmm", "The vendor page."), "unclear");
  });
  test("the model's answer is schema-checked", () => {
    assert.ok(validClassification({ classification: "defect", confidence: 0.7, reason: "x" }));
    assert.equal(validClassification({ classification: "bug", confidence: 0.7 }), null);
    assert.equal(validClassification({ classification: "defect", confidence: 7 }), null);
    assert.equal(validClassification("defect"), null);
    assert.deepEqual(parseJsonObject('Sure! ```json\n{"a":1}\n```'), { a: 1 });
    assert.equal(parseJsonObject("no json"), null);
    assert.ok(validModelScenario({ preconditions: "p", steps: ["s"], expected: "e", observed: "o", eventType: "rfq_only" }));
    assert.equal(validModelScenario({ preconditions: "p", steps: [], expected: "e", observed: "o", eventType: "rfq_only" }), null);
    assert.equal(validModelScenario({ preconditions: "p", steps: ["s"], expected: "e", observed: "o", eventType: "po" }), null);
  });
});

// ── patterns, features, journey groups ─────────────────────────────────────

describe("patterns and the feature tree", () => {
  test("every pattern, keyword list and group mapping names a real feature", () => {
    for (const p of PATTERNS) assert.ok(findFeature(p.feature), p.feature);
    for (const f of Object.keys(FEATURE_KEYWORDS)) assert.ok(findFeature(f), f);
    for (const f of Object.keys(FEATURE_GROUP)) assert.ok(findFeature(f), f);
  });
  test("every pattern that claims to be reproducible names the backend lines or says it is not automatable", () => {
    for (const p of PATTERNS) assert.ok(p.automatable || p.notAutomatableBecause, p.id);
  });
  test("the most specific pattern wins", () => {
    assert.equal(matchPattern("after awarding 50 units the award total is wrong")?.id, "award_total_wrong");
    assert.equal(matchPattern("the unit kg is not available on the line item")?.id, "unit_mismatch");
    assert.equal(matchPattern("error 712 rfp duration exceeds rfq end time")?.id, "rfp_ends_after_rfq");
    assert.equal(matchPattern("the vendor cannot see the event in their dashboard")?.id, "vendor_cannot_see_event");
    assert.equal(matchPattern("the bid was accepted after the deadline")?.id, "late_bid_accepted");
    assert.equal(matchPattern("the vendor page loads slowly"), null);
  });
  test("keywords score longer phrases higher", () => {
    const k = keywordScores("surrogate bid entered on behalf of the vendor");
    assert.equal(k[0].feature, "bids.surrogate");
  });
});

// ── the committed case file carries no customer wording ────────────────────

describe("hubspot-regressions.md", () => {
  test("pattern cases use the pattern's text; tickets appear only by id; no customer words", () => {
    const secret = "Zanzibar Widgets told Mr. Qwerty the late quote was accepted after the deadline";
    const t = stripTicket(raw({ id: "424242", subject: "Late quote", content: secret, priority: "HIGH", companyNames: ["Zanzibar Widgets Pvt Ltd"] }));
    const p: ProcessedTicket = {
      ticket: t, classification: "defect", classificationConfidence: 0.8, classifiedBy: "rule", classificationWhy: "", module: "bids",
      featureKey: "bids.submit", mapConfidence: 0.9, mappedBy: "rule", mapCandidates: [], linkedCaseIds: [], aiSkipped: false,
      inEventsScope: true, dataset: "synthetic",
      scenario: { pattern: "late_bid_accepted", eventType: "rfq_only", preconditions: "", steps: [], expected: "", observed: "", clientId: null, automatable: true, journeyGroup: "API-XBID", libraryTwin: "EDGE-BID-049" },
    };
    const generic: ProcessedTicket = { ...p, ticket: { ...t, id: "535353" }, featureKey: "bids.surrogate", linkedCaseIds: [], scenario: { ...p.scenario!, pattern: "llm", modelWritten: true, preconditions: secret, steps: [secret], expected: secret, observed: secret } };
    const { md, ids } = buildCaseFile([p, generic], { generatedAt: "2026-10-03T00:00:00Z" });
    assert.deepEqual(ids, ["HS-424242-1", "HS-535353-1"]);
    assert.deepEqual(p.linkedCaseIds, ["HS-424242-1"]);
    assert.doesNotMatch(md, /Zanzibar|Qwerty|late quote was accepted/i);
    assert.match(md, /#### HS-424242-1 — A vendor cannot open a bid after the bidding window has closed/);
    assert.match(md, /- \*\*Trace\.\*\* P0 · automate · hubspot · `HS-424242` · `EDGE-BID-049` · `API-XBID`/);
    assert.match(md, /#### HS-535353-1 — A support-reported defect in surrogate bid does not come back/);
  });
});
