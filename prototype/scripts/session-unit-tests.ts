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
