import { test } from "@playwright/test";

import type { CaseKind } from "./apiLog.js";
import type { CheckBasis } from "./outcome.js";

/**
 * How a spec tells the report what it is doing, in words a non-engineer reads.
 *
 * Playwright annotations are the transport: they survive the worker→reporter
 * process boundary, they are attached to the right test without any lookup
 * table, and a case that declares nothing still renders (the report derives a
 * best-effort plain title and expectation instead — see `outcome.ts`).
 *
 * The important property is WHEN these are pushed: `declareCase` runs at the
 * top of the test, before the request goes out. An expectation recorded after
 * the answer arrives is not an expectation, it is a transcript — so the
 * expected result in the report is always something the suite committed to in
 * advance, and the actual result is always something the run produced.
 */

export interface CaseDeclaration {
  /** What this step does, in one sentence, jargon-free. */
  plain: string;
  /** What should happen, in one sentence, jargon-free. Stated up front. */
  expected: string;
  /** Grouping id, e.g. "events.rfp_rfq". */
  flow?: string;
  /** Human name for that group. */
  flowTitle?: string;
  /**
   * The stage of the module's own lifecycle this case sits in — "Creating an
   * event", "Publishing an event", "Awarding". The report cuts the run into
   * these, so a module contributing a hundred cases reads as the stages of the
   * thing it tests rather than as one wall of rows.
   */
  area?: string;
  /** The case's id in the catalogue it came from, e.g. "BE-2.4". */
  ref?: string;
  kind?: CaseKind;
  /** The machine-checkable half of `expected`, when there is one. */
  expect?: "accept" | "reject" | "no-server-error";
  /** Why anyone should care that this case exists. */
  because?: string;
  /** Overrides how the report says the case was decided. */
  basis?: CheckBasis;
}

/** Declares a case up front. Safe to call outside a running test — it no-ops. */
export function declareCase(declaration: CaseDeclaration): void {
  const entries: Array<{ type: string; description: string }> = [
    { type: "plain", description: declaration.plain },
    { type: "expected", description: declaration.expected },
  ];
  const optional: Array<[string, string | undefined]> = [
    ["flow", declaration.flow],
    ["flowTitle", declaration.flowTitle],
    ["area", declaration.area],
    ["ref", declaration.ref],
    ["kind", declaration.kind],
    ["expect", declaration.expect],
    ["because", declaration.because],
    ["basis", declaration.basis],
  ];
  for (const [type, description] of optional) {
    if (description) entries.push({ type, description });
  }

  try {
    test.info().annotations.push(...entries);
  } catch {
    // Called outside the runner (a script reusing a flow). Nothing to annotate.
  }
}

/**
 * Overrides the report's computed "actual result" with one the test itself can
 * state better.
 *
 * Reserved for cases that genuinely know more than the HTTP layer does — the
 * contract cases hold the Oracle's classification, which says not just what
 * came back but what it MEANS. Everything else should leave this alone and let
 * the report read the answer off the recorded calls, because a sentence the
 * test writes about itself is only as honest as the test.
 */
export function recordActual(actual: string): void {
  try {
    test.info().annotations.push({ type: "actual", description: actual });
  } catch {
    // Not inside the runner.
  }
}
