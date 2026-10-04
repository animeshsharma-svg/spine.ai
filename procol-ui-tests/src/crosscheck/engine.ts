import type { CapturedResponse } from "./capture.js";
import type { ScreenMap, Vars } from "./fieldMap.js";
import { resolveSources } from "./fieldMap.js";
import type { ScreenSnapshot } from "./screenText.js";
import { checkCount, checkField, type ItemResult } from "./checks.js";
import { runSpecial } from "./specials.js";

/**
 * One screen's map, run against what was captured while the screen was open.
 * Produces a verdict per catalog case and a plain-English finding for every
 * disagreement — the record a person reads.
 */

export type CaseVerdict = "passed" | "failed" | "inconclusive";

export interface CrossFinding {
  id: string;
  case: string;
  screen: string;
  kind: "missing-on-screen" | "different-value" | "count-mismatch" | "status-mismatch" | "api-error-ui-silent" | "ui-error-api-ok" | "list-shows-other-events";
  severity: "high" | "medium" | "low";
  /** One sentence a QA engineer would write. */
  title: string;
  apiValue: string;
  screenValue: string;
  where: string;
  screenshot?: string;
  /** Collapsible detail: route, JSON path, rule. */
  details: { source?: string; rule: string; field: string; item?: string; code?: string; raw?: { api?: unknown; screen?: string } };
}

export interface CaseResult {
  case: string;
  title: string;
  screen: string;
  screenTitle: string;
  verdict: CaseVerdict;
  reason: string;
  counts: { checked: number; passed: number; failed: number; skipped: number; unread: number };
  items: ItemResult[];
  findings: CrossFinding[];
  screenshot?: string;
}

function kindOf(r: ItemResult): CrossFinding["kind"] {
  if (r.key === "list.search") return "list-shows-other-events";
  if (r.key === "errors.api-failed") return "api-error-ui-silent";
  if (r.key === "errors.ui-error") return "ui-error-api-ok";
  if (r.key === "stage.status") return "status-mismatch";
  if (/count|rows/.test(r.key) || /^count\./.test(r.key)) return "count-mismatch";
  return r.verdict === "missing" ? "missing-on-screen" : "different-value";
}

/** A zero the screen renders as "–" — information lost, but a presentation choice. */
const zeroAsDash = (r: ItemResult) => r.shown === "(blank)" && /^\D{0,3}0(\.0+)?(\s|$)/.test(r.api);

function severityOf(r: ItemResult, kind: CrossFinding["kind"]): CrossFinding["severity"] {
  if (zeroAsDash(r)) return "low";
  if (kind === "api-error-ui-silent" && /HTTP 5/.test(r.api)) return "high";
  if (kind === "list-shows-other-events" || kind === "status-mismatch" || kind === "count-mismatch") return "high";
  if (/price|rate|amount|total|quantity|qty|savings/i.test(r.field)) return "high";
  if (kind === "missing-on-screen") return "medium";
  return "medium";
}

/** "Order duration" → "order duration", but "GST" stays "GST". */
const lc = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

function sentence(r: ItemResult, screenTitle: string): string {
  const of = r.item ? ` for "${r.item}"` : "";
  switch (kindOf(r)) {
    case "list-shows-other-events":
      return `Searching the events list for "${r.item}" shows other events: the API returned ${r.api}, the screen shows ${r.shown}.`;
    case "api-error-ui-silent":
      return /success/.test(r.shown)
        ? `On the ${screenTitle}, a request failed (${r.api}) but the screen showed a success message.`
        : `On the ${screenTitle}, a request the screen depends on failed (${r.api}) and the screen gave no sign of it.`;
    case "ui-error-api-ok":
      return `The ${screenTitle} shows an error ("${r.shown}") although every API call behind it succeeded.`;
    case "status-mismatch":
      return `The stage${of} shows "${r.shown}" but by the API it is ${r.api}.`;
    case "count-mismatch":
      return `The ${screenTitle} shows ${r.shown} for ${lc(r.field)} but the API returned ${r.api}.`;
    default:
      if (zeroAsDash(r)) return `On the ${screenTitle}, ${lc(r.field)}${of} shows a dash, as if nothing was entered — the API says ${r.api}.`;
      return r.verdict === "missing"
        ? `On the ${screenTitle}, ${lc(r.field)}${of} is not shown — the API says ${r.api}.`
        : `On the ${screenTitle}, ${lc(r.field)}${of} shows "${r.shown}" but the API says ${r.api}.`;
  }
}

export function runScreen(
  map: ScreenMap,
  screen: string,
  snap: ScreenSnapshot,
  all: CapturedResponse[],
  vars: Vars,
  toasts: Array<{ severity: string; text: string }>,
  opts: { cases?: Set<string>; screenshot?: string; screenTitle?: string } = {},
): CaseResult[] {
  const sources = resolveSources(map, screen, all, vars);
  const responses = all.filter((r) => r.screen === screen);
  const screenTitle = opts.screenTitle ?? map.title;
  const out: CaseResult[] = [];
  for (const g of map.groups) {
    if (opts.cases && !opts.cases.has(g.case)) continue;
    const items: ItemResult[] = [];
    for (const f of g.fields ?? []) items.push(...checkField(g.case, screen, f, snap, sources, vars));
    for (const c of g.counts ?? []) items.push(...checkCount(g.case, screen, c, snap, sources, vars));
    for (const s of g.special ?? []) items.push(...runSpecial({ caseId: g.case, screen, snap, sources, vars, responses, toasts }, s));
    const bad = items.filter((i) => (i.verdict === "mismatch" || i.verdict === "missing") && !i.optional);
    const counts = {
      checked: items.filter((i) => i.verdict !== "skipped" && i.verdict !== "unread").length,
      passed: items.filter((i) => i.verdict === "pass").length,
      failed: bad.length,
      skipped: items.filter((i) => i.verdict === "skipped").length,
      unread: items.filter((i) => i.verdict === "unread").length,
    };
    const findings: CrossFinding[] = bad.map((r, n) => {
      const kind = kindOf(r);
      return {
        id: `${g.case}-${screen}-${n + 1}`,
        case: g.case,
        screen,
        kind,
        severity: severityOf(r, kind),
        title: sentence(r, screenTitle),
        apiValue: r.api,
        screenValue: r.shown,
        where: r.scope,
        screenshot: opts.screenshot,
        details: { source: r.source, rule: r.how, field: r.field, item: r.item, code: r.code, raw: r.raw },
      };
    });
    const verdict: CaseVerdict = bad.length ? "failed" : counts.passed > 0 ? "passed" : "inconclusive";
    const reason =
      verdict === "failed"
        ? `${bad.length} of ${counts.checked} checked value(s) disagree with the API`
        : verdict === "passed"
          ? `all ${counts.passed} checked value(s) match the API${counts.skipped ? ` (${counts.skipped} had nothing to show or were not displayed)` : ""}`
          : counts.unread
            ? "the API data for this screen was not captured, so nothing could be compared"
            : "the API had no values to compare on this screen";
    out.push({ case: g.case, title: g.title, screen, screenTitle, verdict, reason, counts, items, findings, screenshot: opts.screenshot });
  }
  // When the list shows a stale answer, the event's card is missing BECAUSE
  // of it. Say so, rather than presenting eight symptoms as eight defects.
  const stale = out.flatMap((r) => r.findings).find((f) => f.kind === "list-shows-other-events");
  if (stale) {
    for (const f of out.flatMap((r) => r.findings)) {
      if (f === stale || f.kind !== "missing-on-screen") continue;
      f.severity = "low";
      f.details.rule = `follows from ${stale.case} (the list is showing a stale answer, so this event's card is not on screen) — ${f.details.rule}`;
    }
  }
  return out;
}
