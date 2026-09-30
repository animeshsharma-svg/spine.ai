import { FEATURE_TREE } from "../../config/featureTree.js";
import { loadCases, type TestCaseRecord } from "../checks/caseLibrary.js";
import { knownBugSentence } from "./knownBugs.js";
import { journeyPlan, journeyWalksFeature } from "../checks/journeyModel.js";
import { getRun, listRuns, type RunRecord } from "../runStore.js";
import type { CheckResult } from "../ai/types.js";
import { isTemplate, toCurl, TOKEN_VAR } from "./curl.js";
import { PAGE_CSS, escapeHtml, stamp } from "./shared.js";
import { VBU_CSS, renderBugsSection, renderEvidence, renderQaDocSection } from "./vbuReport.js";
import {
  JOURNEY_CSS,
  nestCasesUnderSteps,
  readJourney,
  renderJourneyLede,
  renderJourneyLegend,
  renderJourneySection,
  renderFieldChecksSection,
  fieldCheckTotals,
} from "./journeyReport.js";

/**
 * THE TEST REPORT — what was checked, what the product did, and how to see it
 * again.
 *
 * Organised the way the platform is: by the module ticked in the UI (Intake,
 * Purchase requests, Sourcing events…), then by the test cases that module's
 * library defines, then the verdict, then the curl that produced it.
 *
 * Three decisions worth stating, because they are what make it readable:
 *
 *  1. THE CASE LIST COMES FROM THE MODULE, NOT FROM THE RUN. Every case the
 *     library holds for a ticked feature is listed, whether or not this run
 *     reached it. A case that never ran says "not run" — never "passed".
 *  2. EVIDENCE IS A CURL, NOT A NETWORK LOG. One command per case, with the
 *     credential as $PROCOL_TOKEN, plus the message the API actually returned.
 *     No header tables, no response dumps.
 *  3. INCONCLUSIVE IS ITS OWN VERDICT. A 401, or a rejection for the wrong
 *     reason, proves nothing — reporting either as a pass is how a green
 *     report stops meaning anything.
 *  4. A SOURCING RUN READS AS A JOURNEY. When the run walked the Postman
 *     collection — sign in, draft, rounds, publish, vendor, bid, wait, award —
 *     that walk is the spine of the report, one numbered step per row, and the
 *     library cases sit under the step they vary. The rendering lives in
 *     `journeyReport.ts`; this file decides where it goes and hands it the
 *     case-row renderer so the nested rows look like the module ones.
 */

type Verdict = "pass" | "fail" | "inconclusive" | "notrun";

export interface CaseRow {
  test: TestCaseRecord;
  result?: CheckResult;
  verdict: Verdict;
  /** why it did not run, when the run said so */
  skipReason?: string;
  /** position in the run — the order the API was actually called in */
  ranAt?: number;
}

interface ModuleSection {
  id: string;
  label: string;
  icon: string;
  what: string;
  rows: CaseRow[];
  passed: number;
  failed: number;
  inconclusive: number;
  notrun: number;
}

/**
 * The four verdicts, in words rather than QA jargon.
 *
 * "Inconclusive" was accurate and meant nothing to anyone: the case ran, and
 * proved nothing either way — the request was refused before it reached the
 * logic under test (a 401), or refused for a different reason than the case is
 * about. Calling that a pass would be a lie and calling it a failure would
 * blame the product for something it was never asked. So it says what it is:
 * we could not tell, and the row says why.
 */
/**
 * What a status code means, in words.
 *
 * "422" tells a developer plenty and a reader nothing. The number stays — it
 * is what you quote to engineering — but it never appears alone.
 */
/**
 * Why a test did not run, in plain words.
 *
 * The reasons are written by the machinery that skipped it, for whoever was
 * debugging the machinery: "unresolved placeholder(s): eventGroupUuid" is
 * precise and means nothing to a reader of this page. The original is kept in
 * brackets, because the person who has to fix it needs the exact term.
 */
function skipInWords(reason: string | undefined): string {
  if (!reason) return "this run never got to it";
  const placeholders = reason.match(/unresolved placeholder\(s\):\s*(.+)/i);
  if (placeholders) {
    return `needs something this run did not have — ${placeholders[1].trim()}`;
  }
  // The deferred path words it differently: the case waited for a record that
  // an earlier case was supposed to create, and none did.
  const deferred = reason.match(/needs ([\w, ]+?), which no case in this run produced/i);
  if (deferred) {
    return `waited for ${deferred[1].trim()} — nothing in this run created one`;
  }
  const flagOff = reason.match(/"([^"]+)" is OFF for (.+?) —/);
  if (flagOff) {
    return `“${flagOff[1]}” is switched off for ${flagOff[2]}, so there is nothing to check`;
  }
  const needsRole = reason.match(/needs (.+?); this run is authenticated as "([^"]+)"/);
  if (needsRole) {
    return `needs ${needsRole[1]} — this run signed in as ${needsRole[2]}`;
  }
  if (/only holds when "([^"]+)" is ON/.test(reason)) {
    const flag = reason.match(/only holds when "([^"]+)" is ON/)?.[1];
    return `only applies when “${flag}” is switched on, and it is off here`;
  }
  if (/not on the allowlist/i.test(reason)) {
    return "the platform is not allowed to call that endpoint";
  }
  return reason;
}

/**
 * What each missing record IS, and the step of the journey that creates it.
 *
 * A placeholder name is the machinery's word for a prerequisite: `tradeId`
 * means "a live stage", and a live stage exists only once an event has been
 * created and activated. Naming the step means the reader can go and tick it
 * instead of guessing which of ninety-three features makes a `tradeId` appear.
 */
const PREREQUISITE: Record<string, { what: string; how: string }> = {
  eventGroupUuid: { what: "a draft event", how: "tick Sourcing events → any event type; creating the draft supplies it" },
  tradeId: { what: "a live stage", how: "tick Sourcing events → an event type and Publish event, so a stage goes live" },
  bidUuid: { what: "a bid that has been placed", how: "tick Bidding → Place a bid in the same run" },
  proposalUuid: { what: "an award proposal", how: "tick Awarding → Create award proposal in the same run" },
  vendorUuid: { what: "a vendor this buyer deals with", how: "check this client has at least one active vendor under Vendors" },
  vendorCompanyId: { what: "a vendor company", how: "check this client has at least one active vendor under Vendors" },
  productUuid: { what: "a product in master data", how: "tick Master data → Products, or add one for this client" },
  productQualityUuid: { what: "a product variant", how: "tick Master data → Products; a product with no variant cannot be ordered" },
  locationUuid: { what: "a delivery location", how: "tick Master data → Locations, or add one for this client" },
  prId: { what: "a purchase request", how: "tick Purchase requests → PR list, or raise one for this client" },
  prItemId: { what: "a line on a purchase request", how: "this client needs a PR that has at least one line item" },
  poUuid: { what: "a purchase order", how: "tick Purchase orders → Generate PO in the same run" },
  orderUuid: { what: "an order", how: "tick Purchase orders → Generate PO in the same run" },
  categoryUuid: { what: "a product category", how: "tick Master data → Categories" },
  teamUuid: { what: "a team", how: "tick Users, roles & teams → Teams" },
  userUuid: { what: "a user", how: "tick Users, roles & teams → Create user" },
};

/**
 * The fix, not just the diagnosis.
 *
 * "needs something this run did not have — tradeId" tells the reader their run
 * was incomplete and nothing about what to do next. Every reason this platform
 * can produce has a concrete next action, so the not-checked rows carry it.
 */
function howToRunIt(reason: string | undefined, test: TestCaseRecord, hasRun: boolean): string {
  if (!reason) {
    // No reason means nobody skipped it — either nothing has run at all, or
    // the run ended before reaching it. Those need different answers.
    return hasRun
      ? `This run was in scope for it but stopped before firing it. Run ${test.feature} again on its own; if it keeps stopping short, the run is ending early.`
      : `No run on record yet. Tick ${test.feature} under API automation and press Run selected tests.`;
  }
  const placeholders =
    reason.match(/unresolved placeholder\(s\):\s*(.+)/i) ??
    reason.match(/needs ([\w, ]+?), which no case in this run produced/i);
  if (placeholders) {
    const names = placeholders[1].split(",").map((n) => n.trim()).filter(Boolean);
    const known = names.filter((n) => PREREQUISITE[n]);
    if (!known.length) {
      return `This run had no ${names.join(" or ")} to use. Run the feature that creates one first, in the same run.`;
    }
    // One run creates records the later cases reuse, so ordering the selection
    // is usually the whole fix.
    return known
      .map((n) => `Needs ${PREREQUISITE[n].what} — ${PREREQUISITE[n].how}.`)
      .join(" ");
  }
  const flagOff = reason.match(/"([^"]+)" is OFF for/);
  if (flagOff) {
    return `Switch “${flagOff[1]}” on for this company, or run this case against a client that already has it on. Until then there is nothing to test — this is not a failure.`;
  }
  if (/only holds when "([^"]+)" is ON/.test(reason)) {
    const flag = reason.match(/only holds when "([^"]+)" is ON/)?.[1];
    return `This case only describes behaviour that exists when “${flag}” is on. Run it against a client where it is.`;
  }
  const needsRole = reason.match(/needs (.+?); this run is authenticated as "([^"]+)"/);
  if (needsRole) {
    return `Re-run signed in as ${needsRole[1]}. Run as ${needsRole[2]} it would prove nothing — the wrong actor is allowed to do this.`;
  }
  if (/not on the allowlist/i.test(reason)) {
    return `${test.method} ${test.path} is not on the runner's allowlist, so it cannot be fired from here. Check it by hand, or add the endpoint in src/checks/dynamicChecks.ts if it is safe to automate.`;
  }
  return `Resolve: ${reason}`;
}

function statusInWords(status: number | null | undefined): string {
  if (status === null || status === undefined) return "no reply";
  if (status >= 500) return "the server broke";
  if (status === 404) return "not found";
  if (status === 401 || status === 403) return "not allowed";
  if (status === 422 || status === 400) return "refused the data";
  if (status >= 400) return "refused";
  if (status >= 300) return "redirected";
  if (status >= 200) return "accepted";
  return `HTTP ${status}`;
}

const VERDICT_PILL: Record<Verdict, { cls: string; label: string; meaning: string }> = {
  pass: {
    cls: "p-pass",
    label: "Worked",
    meaning: "Procol did exactly what it should have — nothing to do here.",
  },
  fail: {
    cls: "p-fail",
    label: "Broken",
    meaning:
      "Procol did something it should not have: accepted bad data, refused good data, or fell over. " +
      "These are the rows worth raising with engineering.",
  },
  inconclusive: {
    cls: "p-incon",
    label: "Couldn’t tell",
    meaning:
      "The request was refused before it reached the behaviour under test — usually the record it acts on " +
      "was not in a usable state, or the account was not allowed to do it. The endpoint answered cleanly, " +
      "so this is not a defect; it is also not a pass. Clear the precondition and it becomes one or the other.",
  },
  notrun: {
    cls: "p-notrun",
    label: "Not checked",
    meaning:
      "This run never got to it — a switch is off for this account, or it needs data we did not have. " +
      "The row says which. It is listed so the gap is visible instead of invisible.",
  },
};

function verdictOf(result: CheckResult | undefined): Verdict {
  if (!result) return "notrun";
  if (result.inconclusive) return "inconclusive";
  return result.pass ? "pass" : "fail";
}

/** feature id → the group it belongs to, so a report groups the way the UI does. */
function groupOfFeature(featureId: string) {
  const groupId = featureId.split(".")[0];
  return FEATURE_TREE.find((g) => g.id === groupId);
}


const EVERYTHING_NOTE =
  "This covers every part of Procol the platform knows how to check. Tick a module in the platform to narrow it down.";

/** A feature id ("events.rfq_only") as its readable label ("RFQ only"). */
function labelOfFeature(featureId: string): string {
  for (const group of FEATURE_TREE) {
    const child = group.children.find((c) => c.id === featureId);
    if (child) return child.label;
  }
  return featureId;
}

/** How many cases the whole library holds for a feature's parent module. */
function moduleTotals(features: string[]): { module: string; inScope: number; total: number; parts: number } | null {
  const groupIds = new Set(features.map((f) => f.split(".")[0]));
  if (groupIds.size !== 1) return null;
  const group = FEATURE_TREE.find((g) => g.id === [...groupIds][0]);
  if (!group) return null;
  const all = loadCases();
  const ids = new Set(group.children.map((c) => c.id));
  return {
    module: group.label,
    inScope: all.filter((c) => features.includes(c.feature)).length,
    total: all.filter((c) => ids.has(c.feature)).length,
    parts: group.children.length,
  };
}

function describeScope(features: string[], sections: ModuleSection[]): string {
  const names = features.map(labelOfFeature);
  const listed =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const totals = moduleTotals(features);

  let line =
    `This is about <strong>${escapeHtml(listed)}</strong> and nothing else — ` +
    `${features.length} part${features.length === 1 ? "" : "s"} of Procol, chosen before the run.`;

  // The gap, named. Without this the reader compares three rows against a
  // module they know holds dozens and concludes the library lost them.
  if (totals && totals.total > totals.inScope) {
    const missing = totals.total - totals.inScope;
    line +=
      ` <strong>${escapeHtml(totals.module)}</strong> has ${totals.parts} parts and ` +
      `${totals.total} cases in total; ${missing} of them are not in this run. ` +
      `Tick the module itself, rather than one part of it, to check all ${totals.total}.`;
  } else if (!totals && sections.length > 1) {
    line += ` They sit in ${sections.length} modules.`;
  }
  return line;
}


/**
 * WHY THIS ONE PROVED NOTHING — in the app's own words.
 *
 * "Proved nothing — the request never reached what this test is about" is true
 * and says nothing a reader can act on. It reads as the report hedging, when
 * in fact the platform knows exactly what happened: the check expected one
 * refusal and the app gave a different one, which means a precondition was not
 * in place. EVT-RFQO-002 wanted "Same type of event already exists for this
 * Project" and got "Order not active" — the event group was never published,
 * so the duplicate-stage rule was never reached. That sentence is the whole
 * answer, and it was already in the result.
 */
function inconclusiveInWords(row: CaseRow): string {
  const got = row.result?.message?.trim();
  // The case documents the refusal it expects as a quoted sentence inside
  // `expectedResult`; the check carries the same string as `expectMessage`.
  const wanted =
    (row.result as { expectMessage?: string } | undefined)?.expectMessage?.trim() ??
    row.test.expectedResult?.match(/'([^']{12,120})'/)?.[1]?.trim().replace(/\.$/, "");
  if (got && wanted) {
    return `Proved nothing — this needed “${wanted}” and the app said “${got}” instead, so the rule under test was never reached`;
  }
  if (got) {
    return `Proved nothing — the app answered “${got}”, which is not the refusal this test is about`;
  }
  return "Proved nothing — the request never reached what this test is about";
}

/**
 * Builds the sections.
 *
 * `features` is what the UI had ticked. Empty means "everything the library
 * knows", which is the right default for a report opened without a selection.
 *
 * `keep` lets the caller leave rows out — the ones the journey section has
 * already absorbed under its steps. A row left out is not counted in the
 * section's tallies either, and a section with nothing left is not returned,
 * so a case is never printed twice. Without `keep` every case is returned,
 * which is what the tiles and the audit script want.
 */
export function buildSections(
  features: string[],
  run: RunRecord | null,
  keep?: (row: CaseRow) => boolean,
): ModuleSection[] {
  const wanted = new Set(features);
  // Pasted cases exist only in their run; the library has no row for them.
  const cases = (run?.pastedCases ?? loadCases()).filter((c) => wanted.size === 0 || wanted.has(c.feature));

  const results = new Map<string, CheckResult>();
  // `checkResults` is appended as each check finishes and a run is sequential,
  // so its index IS the order the API was called in.
  const ranAt = new Map<string, number>();
  (run?.checkResults ?? []).forEach((r, i) => {
    results.set(r.id, r);
    if (!ranAt.has(r.id)) ranAt.set(r.id, i);
  });

  // Cases the run deliberately skipped, with the reason it gave.
  const skipped = new Map<string, string>();
  for (const event of run?.events ?? []) {
    const payload: any = (event as any).data ?? (event as any).payload;
    for (const item of payload?.skipped ?? []) {
      if (item?.id) skipped.set(item.id, item.reason ?? "skipped");
    }
  }

  const sections = new Map<string, ModuleSection>();
  for (const test of cases) {
    const group = groupOfFeature(test.feature);
    const id = group?.id ?? test.feature.split(".")[0];
    if (!sections.has(id)) {
      sections.set(id, {
        id,
        label: group?.label ?? id,
        icon: group?.icon ?? "•",
        what: group?.what ?? "",
        rows: [],
        passed: 0,
        failed: 0,
        inconclusive: 0,
        notrun: 0,
      });
    }
    const section = sections.get(id)!;
    const result = results.get(test.id);
    const verdict = verdictOf(result);
    const row: CaseRow = { test, result, verdict, skipReason: skipped.get(test.id), ranAt: ranAt.get(test.id) };
    if (keep && !keep(row)) continue;
    section.rows.push(row);
    if (verdict === "pass") section.passed++;
    else if (verdict === "fail") section.failed++;
    else if (verdict === "inconclusive") section.inconclusive++;
    else section.notrun++;
  }

  /**
   * Journey order — the order the buyer walks the product, which is the order
   * FEATURE_TREE is written in.
   *
   * This used to sort by failure count and then alphabetically, so a report
   * opened with Awarding above Intake above Sourcing events: three modules in
   * an order that matched neither the product nor the tree the reader had just
   * ticked them in. Failures are still findable — the tiles count them and the
   * filter shows only them — but the spine of the document is the journey, so
   * reading top to bottom follows one event from creation to payment.
   */
  /**
   * Within a module: the sequence the run actually fired, not the library's.
   *
   * The run puts functional cases first — they create the records the rest
   * address — so reading a section top to bottom now follows the same path the
   * API took: the event is created, then everything done to it. Cases that
   * never ran keep their library position and sit after the ones that did,
   * since they have no place in a sequence they were not part of.
   */
  for (const section of sections.values()) {
    section.rows = section.rows
      .map((row, i) => ({ row, i }))
      .sort(
        (a, b) =>
          (a.row.ranAt ?? Number.MAX_SAFE_INTEGER) - (b.row.ranAt ?? Number.MAX_SAFE_INTEGER) ||
          a.i - b.i,
      )
      .map((x) => x.row);
  }

  const order = new Map(FEATURE_TREE.map((g, i) => [g.id, i]));
  return [...sections.values()]
    .filter((s) => s.rows.length > 0)
    .sort(
      (a, b) =>
        (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
        a.label.localeCompare(b.label),
    );
}

/**
 * One case: a single line that reads across, and everything else folded away.
 *
 * The first version put the whole story in the summary row and the whole body
 * open beneath it, so twelve cases were a wall of text with no way to scan
 * them. This is a table: verdict, id, what it checks, the call, the result —
 * five columns that line up down the page. Open a row and you get the case's
 * own documentation and the curl, which is what you want only after something
 * has caught your eye.
 */
/**
 * A case that DOCUMENTS a specific success but only asserts "did not crash".
 *
 * Nearly half the library is typed Robustness, which asserts `no-5xx`: any
 * status but a 500 passes. That is the right assertion for hostile input, where
 * serving and refusing are both defensible. It is the wrong assertion for a
 * case whose own expected result says "Created." or "200 with a trade uuid" —
 * there, a 422 passes while the documented behaviour plainly did not happen,
 * and the report prints the two side by side as though they agreed.
 *
 * Detected from the case's own words rather than from a list, so it stays true
 * as cases are added. It changes no verdict — a weak assertion is not a
 * failure — it just refuses to let a weak check read as a strong one.
 */
function documentsASuccess(test: TestCaseRecord): boolean {
  if (test.expected !== "no-5xx") return false;
  const doc = (test.expectedResult ?? "").trim();
  return /^(200|201)\b/.test(doc) || /\b20[01] with\b/.test(doc) || /^Created\b/i.test(doc);
}

function renderRow(row: CaseRow, companyId: number | undefined, hasRun: boolean): string {
  const pill = VERDICT_PILL[row.verdict];
  const result = row.result;
  // The request as fired when we have it; the library's template otherwise —
  // labelled as a template, because a curl with {{placeholders}} will not run.
  const request = result?.request ?? { method: row.test.method, path: row.test.path, body: row.test.body };
  const template = !result?.request && isTemplate(request);

  const status =
    row.verdict === "notrun"
      ? "—"
      : result?.httpStatus === null || result?.httpStatus === undefined
        ? "no reply"
        : `${result.httpStatus} · ${statusInWords(result.httpStatus)}`;

  /**
   * What happened, in a sentence a non-developer can read.
   *
   * The engine's own verdict is written for someone who knows the codes
   * ("ACCEPTED input that should have been rejected (HTTP 200)"). Said plainly
   * it is "the app accepted something it should have refused" — the technical
   * wording is still there when the row is opened.
   */
  // Vendor bulk upload cases are judged on what each staged ROW became, not
  // on the HTTP reply (which is 200 for every sheet the parser can read), so
  // the accept/refuse wording below would describe the wrong thing.
  const bulk = row.test.bulk && row.test.bulk.kind !== "http";
  const outcome =
    row.verdict === "notrun"
      ? skipInWords(row.skipReason)
      : bulk && row.verdict !== "inconclusive"
        ? row.verdict === "pass"
          ? "Came out as documented"
          : (result as { asyncServerError?: boolean } | undefined)?.asyncServerError
            ? "A row crashed the background job"
            : (result?.httpStatus ?? 0) >= 500
              ? "The server broke on it"
              : "Came out differently from the documented result"
      : row.verdict === "pass"
        ? row.test.expected === "reject"
          ? "Refused it, as it should"
          : row.test.expected === "no-5xx"
            ? "Handled it without breaking"
            : "Worked, as it should"
        : row.verdict === "inconclusive"
          ? inconclusiveInWords(row)
          : result?.accepted
            ? "Accepted something it should have refused"
            : (result?.httpStatus ?? 0) >= 500
              ? "The server broke on it"
              : "Refused something it should have accepted";

  // The module the case belongs to travels with the row, because a row nested
  // under a journey step is no longer inside its module's section and the
  // module filter still has to find it.
  const moduleLabel = groupOfFeature(row.test.feature)?.label ?? row.test.feature.split(".")[0];

  return `
<details class="case v-${row.verdict}" id="case-${escapeHtml(row.test.id)}" data-verdict="${row.verdict}" data-feature="${escapeHtml(row.test.feature)}"
         data-module="${escapeHtml(moduleLabel)}"
         data-search="${escapeHtml(`${row.test.id} ${row.test.title} ${row.test.feature} ${request.path}`.toLowerCase())}">
  <summary>
    <span class="col-verdict"><span class="pill ${pill.cls}">${escapeHtml(pill.label)}</span></span>
    <span class="col-id">${escapeHtml(row.test.id)}</span>
    <span class="col-title">${escapeHtml(row.test.title.replace(/^QA_Platform_/, ""))}
      <span class="col-tags"><span class="tag t-${escapeHtml(row.test.type.toLowerCase())}">${escapeHtml(
        row.test.type,
      )}</span> <span class="tag">${escapeHtml(row.test.priority)}</span></span>
    </span>
    <span class="col-call"><code>${escapeHtml(request.method)} ${escapeHtml(
      request.path.split("?")[0],
    )}</code></span>
    <span class="col-status">${escapeHtml(status)}</span>
    <span class="col-outcome">${escapeHtml(outcome)}</span>
  </summary>
  <div class="case-body">
    <div class="panes">
      <div>
        <h5>What should happen</h5>
        <p class="expect">${bulk ? "The sheet's rows should come out <strong>as documented</strong>" : `The app should <strong>${
          row.test.expected === "reject"
            ? "refuse this"
            : row.test.expected === "no-5xx"
              ? "cope with this without breaking"
              : "accept this"
        }</strong>`}. ${escapeHtml(row.test.expectedResult)}</p>
        ${
          // Why this row's verdict is weaker than the outcome it documents, in
          // priority order: the case's own reason (written when the library was
          // built, and the most specific — it names the change that is missing
          // from the request), the runner's downgrade, then the generic case of
          // a documented success checked only for "did not crash".
          row.test.weakReason
            ? `<p class="weakened"><b>Not fully checked.</b> ${escapeHtml(row.test.weakReason)}</p>`
            : (row.result as { weakenedTo5xxOnly?: string } | undefined)?.weakenedTo5xxOnly
              ? `<p class="weakened"><b>Not fully checked.</b> ${escapeHtml(
                  (row.result as { weakenedTo5xxOnly?: string }).weakenedTo5xxOnly!,
                )}</p>`
              : documentsASuccess(row.test)
                ? `<p class="weakened"><b>Not fully checked.</b> This case describes a specific success, but it is
                   typed <code>${escapeHtml(row.test.type)}</code>, which only asserts that the server did not
                   crash. Any status below 500 passes it — so a pass here does not mean the result above
                   happened. To check that, the case needs to assert the success it documents.</p>`
                : ""
        }
        ${
          row.test.steps?.length
            ? `<h5>How the test goes</h5><ol class="steps">${row.test.steps
                .map((st) => `<li>${escapeHtml(st.replace(/^\d+\.\s*/, ""))}</li>`)
                .join("")}</ol>`
            : ""
        }
        ${
          row.test.preconditions
            ? `<h5>Only meaningful if</h5><p class="pre">${escapeHtml(row.test.preconditions)}</p>`
            : ""
        }
      </div>
      <div>
        <h5>What actually happened</h5>
        <p class="${row.verdict === "fail" ? "said-bad" : "said"}">${escapeHtml(
          result?.verdict ?? skipInWords(row.skipReason),
        )}</p>
        ${
          row.verdict === "notrun"
            ? `<div class="todo"><h5>To make this one run</h5><p>${escapeHtml(
                howToRunIt(row.skipReason, row.test, hasRun),
              )}</p></div>`
            : ""
        }
        ${
          !result && row.skipReason && skipInWords(row.skipReason) !== row.skipReason
            ? `<p class="pre">In the machinery's own words: ${escapeHtml(row.skipReason)}</p>`
            : ""
        }
        ${result?.message ? `<p class="apisaid"><span>The app said:</span> ${escapeHtml(result.message)}</p>` : ""}
        ${
          result?.knownBug
            ? `<p class="${/fixed|closed/i.test(result.knownBug.status) ? "known-fixed" : "known-open"}"><b>${
                /fixed|closed/i.test(result.knownBug.status) ? "Known bug, now confirmed fixed." : "Known bug."
              }</b> ${escapeHtml(knownBugSentence(result.knownBug))} “${escapeHtml(result.knownBug.title)}”</p>`
            : row.verdict === "fail"
              ? `<p class="known-new"><b>New.</b> Not on any of the team's bug sheets yet.</p>`
              : ""
        }
        ${result ? `<p class="took">${Math.round(result.durationMs)}ms</p>` : ""}
        <details class="curl">
          <summary>${
            template
              ? "The request we would send (values fill in when it runs)"
              : "Run this exact call yourself"
          }</summary>
          <div class="curl-body">
            <button class="copy" type="button" data-copy="curl-${escapeHtml(row.test.id)}">Copy curl</button>
            <pre id="curl-${escapeHtml(row.test.id)}">${escapeHtml(toCurl(request, companyId))}</pre>
          </div>
        </details>
      </div>
    </div>
    ${renderEvidence(result, row.test)}
  </div>
</details>`;
}

/** A module: how much of it is green, then its cases. */
/**
 * What the run BUILT before it checked anything.
 *
 * The cases in this section are all things done to one event, and a list of
 * verdicts about an event nobody has seen is unreadable. So the section opens
 * with the setup chain as it actually ran — created the event group, added the
 * stage, published it — with the real call, status and timing behind each step.
 * Then the cases follow, as things done to that event.
 */
function renderSetup(run: RunRecord | null): string {
  const steps = run?.setupSteps ?? [];
  const made = run?.setupSummary;
  if (!steps.length) return "";

  return `
<div class="setup">
  <div class="setup-head">
    <span class="setup-kicker">First, the run built something to test</span>
    ${
      made
        ? `<span class="setup-made">“${escapeHtml(made.title)}” — <b>${escapeHtml(made.status)}</b>, ${
            made.stageCount
          } stage${made.stageCount === 1 ? "" : "s"}</span>`
        : ""
    }
  </div>
  <ol class="setup-steps">
    ${steps
      .map(
        (s) => `<li class="${s.ok ? "ok" : "bad"}">
          <span class="setup-did">${escapeHtml(s.did)}</span>
          <code class="setup-call">${escapeHtml(s.method)} ${escapeHtml(s.path)}</code>
          <span class="setup-status ${s.ok ? "ok" : "bad"}">${s.status}</span>
          <span class="setup-ms">${s.ms}ms</span>
        </li>`,
      )
      .join("")}
  </ol>
  <p class="setup-note">Everything below was checked against that event.</p>
</div>`;
}

function renderSection(
  section: ModuleSection,
  companyId: number | undefined,
  hasRun: boolean,
  setup = "",
): string {
  const total = section.rows.length || 1;
  const bar = (n: number, cls: string) =>
    n ? `<span class="seg ${cls}" style="width:${((n / total) * 100).toFixed(1)}%"></span>` : "";

  return `
<section class="module" data-module="${escapeHtml(section.label)}">
  <header class="module-head">
    <span class="mico">${escapeHtml(section.icon)}</span>
    <h3>${escapeHtml(section.label)}</h3>
    <span class="grow"></span>
    <span class="tally">
      ${section.passed ? `<b class="ok">${section.passed} worked</b>` : ""}
      ${section.failed ? `<b class="bad">${section.failed} broken</b>` : ""}
      ${section.inconclusive ? `<b class="warn">${section.inconclusive} unclear</b>` : ""}
      ${section.notrun ? `<b class="mute">${section.notrun} not checked</b>` : ""}
    </span>
  </header>
  <div class="bar" role="img" aria-label="${section.passed} of ${section.rows.length} passed">
    ${bar(section.passed, "s-pass")}${bar(section.failed, "s-fail")}${bar(section.inconclusive, "s-incon")}${bar(
      section.notrun,
      "s-notrun",
    )}
  </div>
  ${section.what ? `<p class="mwhat">${escapeHtml(section.what)}</p>` : ""}
  ${setup}
  <div class="rows">
    ${ROW_HEAD}
    ${section.rows.map((row) => renderRow(row, companyId, hasRun)).join("")}
  </div>
</section>`;
}

/** The column headings every case table opens with — the module sections' and the ones nested under journey steps. */
const ROW_HEAD = `<div class="rowhead">
      <span class="col-verdict">Result</span>
      <span class="col-id">Test</span>
      <span class="col-title">What we checked</span>
      <span class="col-call">Where we checked it</span>
      <span class="col-status">The app replied</span>
      <span class="col-outcome">What that means</span>
    </div>`;

export interface TestReportInput {
  features: string[];
  run: RunRecord | null;
}

export function renderTestReport({ features, run }: TestReportInput): string {
  /**
   * Every case first, for the tiles and the filter's module list; then, when
   * the run walked a journey, the module sections again without the rows the
   * journey absorbed under its steps. A case with a step is printed once,
   * under that step; a case with none keeps its module section as before.
   */
  const journey = readJourney(run);
  /**
   * A journey run no longer replays the library against the event it built,
   * so the sourcing features' cases are not "not checked" — they were never in
   * scope. Listing them would put a hundred grey rows under a green journey.
   * Older runs that did fire them still have their results and keep them.
   */
  const plan = journeyPlan(features);
  const replayedLibrary = (run?.checkResults ?? []).some((r) => journeyWalksFeature(r.flowId, plan));
  const caseFeatures =
    journey && !replayedLibrary
      ? (() => {
          const kept = features.filter((f) => !journeyWalksFeature(f, plan));
          // An empty list means "everything" to buildSections; this means "nothing".
          return kept.length ? kept : ["__journey_only__"];
        })()
      : features;
  const allSections = buildSections(caseFeatures, run);
  const rows = allSections.flatMap((s) => s.rows);
  const nest = journey ? nestCasesUnderSteps(journey, rows) : undefined;
  const sections = nest ? buildSections(caseFeatures, run, (row) => !nest.absorbed.has(row.test.id)) : allSections;
  const eventsGroup = FEATURE_TREE.find((g) => g.id === "events");
  const journeySection =
    journey && nest
      ? renderJourneySection({
          journey,
          nest,
          run,
          icon: eventsGroup?.icon ?? "•",
          moduleLabel: eventsGroup?.label ?? "Sourcing events",
          renderCase: (row) => renderRow(row, run?.companyId, Boolean(run)),
          statusInWords,
          rowHead: ROW_HEAD,
        })
      : "";
  const totals = {
    total: rows.length,
    passed: rows.filter((r) => r.verdict === "pass").length,
    failed: rows.filter((r) => r.verdict === "fail").length,
    inconclusive: rows.filter((r) => r.verdict === "inconclusive").length,
    notrun: rows.filter((r) => r.verdict === "notrun").length,
  };

  /**
   * A run the API turned away at the door.
   *
   * With an expired token every check comes back 401 and every verdict is
   * honestly "couldn't tell" — which reads as an empty report rather than as
   * "nothing was tested". Said once, at the top, in the reader's words.
   */
  const attempted = rows.filter((r) => r.verdict !== "notrun");
  const refused = attempted.filter(
    (r) => r.result?.httpStatus === 401 || r.result?.httpStatus === 403,
  );
  const allRefused = attempted.length > 0 && refused.length === attempted.length;
  const refusalBanner = allRefused
    ? `<p class="refused"><b>Nothing was tested in this run.</b> All ${attempted.length}
       attempted check${attempted.length === 1 ? "" : "s"} came back
       <code>HTTP ${refused[0].result?.httpStatus}</code>${
         refused[0].result?.message ? ` — “${escapeHtml(refused[0].result.message)}”` : ""
       }: the request was refused before it reached Procol's logic. That is an access problem, not a
       product one — the account's token has expired or been revoked. Refresh it and run again; until
       then neither a pass nor a failure below would mean anything.</p>`
    : "";

  const fc = fieldCheckTotals(journey);
  const tile = (label: string, value: number | string, cls = "") =>
    `<div class="tile ${cls}"><div class="tile-v">${escapeHtml(value)}</div><div class="tile-l">${escapeHtml(label)}</div></div>`;

  /**
   * SAY WHAT WAS TICKED, NOT WHAT IT BELONGS TO.
   *
   * This named the parent module — "Sourcing events (RFx)" — whichever part of
   * it was actually selected. So a run of the three RFQ-only cases announced
   * itself as a run of Sourcing events, whose library holds thirty-four, and
   * the only honest conclusion a reader could draw was that thirty-one test
   * cases had gone missing. They had not: they were never in scope.
   *
   * Naming the parts and counting what is left out turns "why so few?" into a
   * sentence, and tells the reader exactly what to tick to get the rest.
   */
  const scopeLine = run?.pastedCases?.length
    ? `This run is the <strong>${run.pastedCases.length} test cases pasted into spine.ai</strong>, in the order they were written, ` +
      `each run as its own step against ${escapeHtml(run.companyName ?? "the client")}.`
    : features.length
      ? describeScope(features, allSections)
      : EVERYTHING_NOTE;

  /**
   * How to read the page, said differently when there is a journey: the
   * spine is then the steps, and the cases are variations under them, so the
   * old "each row below is one thing we expect" would send the reader looking
   * for a flat table that is no longer there.
   */
  const howToRead = journey
    ? rows.length
      ? `<p class="lede">First comes the journey: the run signed in, built an event, answered it as the vendor, waited
    for the window to close and awarded it — <strong>one step per row, in the order the Postman collection runs
    them</strong>. Folded under each step are the variations we tried at that point: each is one thing we expect Procol
    to do, or to refuse, tried for real against a second copy of the event. <strong>Every variation is listed whether
    or not this run got to it</strong>, so the gaps show as well as the results. Open a step or a row to see what we
    expected, what the app replied, and the exact command to try it yourself.</p>`
      : `<p class="lede">The run signed in, built the event, answered it as the vendor, waited for the window to close
    and awarded it — <strong>one step per row, in the order the Postman collection runs them</strong>. Every step
    says what we expected and what the app replied. Open a step for the exact command to try it yourself.</p>`
    : `<p class="lede">Each row below is one thing we expect Procol to do — or to refuse. The platform asked the
    app to do it for real, and wrote down what came back. <strong>Every row is listed whether or not this run
    got to it</strong>, so you can see the gaps as well as the results. Open a row to see the steps it takes,
    what the app replied, and the exact command to try it yourself.</p>`;

  /**
   * NO "WHAT WASN'T CHECKED" PANEL.
   *
   * It grouped the not-run cases by the fix that would unblock them, biggest
   * group first. In practice one permanent blockage — the cases whose body is
   * a paraphrase of the real payload — was the whole list on almost every run,
   * so the panel opened the report with the same paragraph every time and said
   * nothing about the run underneath it. Those cases are now held out of the
   * dashboard entirely (`heldCases()` in `src/checks/caseLibrary.ts`), and the
   * panel went with them.
   *
   * Nothing is hidden by this: the NOT CHECKED tile still counts them, every
   * not-run case still has its own row in its module, and opening that row
   * still shows "To make this one run" with the reason for that case. What is
   * gone is the summary that repeated itself.
   */

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>spine.ai — test report</title>
<style>
${PAGE_CSS}
/* A run refused before it began — an access problem, not a product one. */
.refused { margin: 0 0 14px; padding: 11px 13px; border-radius: 8px;
  border: 1px solid var(--warn, #f0a800); background: var(--warn-soft, #fff8e1);
  color: var(--ink, #4a3800); font-size: 13px; line-height: 1.6; }
.refused b { color: var(--warn, #9a6b00); }
.refused code { font-family: var(--mono, monospace); font-size: 12px; }
/* ── module ─────────────────────────────────────────────────────────── */
.module { margin: 0 0 26px; }
/* A case whose documented success is NOT what was actually asserted. Sits
   directly under the expectation it contradicts, because that is the only
   place a reader would otherwise be misled. */
.weakened { margin-top: 8px; padding: 9px 11px; border-radius: 8px; font-size: 12.5px;
  background: rgba(224,162,74,.12); color: var(--warn, #b06c12);
  border: 1px solid rgba(224,162,74,.3); }
.weakened b { color: inherit; }
/* ── what the run built, before it checked anything ── */
.setup { margin: 12px 0 4px; border: 1px solid var(--line); border-left: 3px solid var(--accent, #6ea2ef);
  border-radius: 10px; background: rgba(110,162,239,.05); padding: 12px 14px; }
.setup-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.setup-kicker { font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  color: var(--accent, #6ea2ef); }
.setup-made { font-size: 13px; color: var(--ink); }
.setup-steps { list-style: none; margin: 0; padding: 0; counter-reset: step; display: grid; gap: 5px; }
.setup-steps li { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; font-size: 13px;
  padding-left: 26px; position: relative; }
.setup-steps li::before { counter-increment: step; content: counter(step); position: absolute; left: 0;
  width: 18px; height: 18px; border-radius: 5px; font-size: 10.5px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(110,162,239,.16); color: var(--accent, #6ea2ef); }
.setup-did { font-weight: 600; color: var(--ink); }
.setup-call { font-size: 11.5px; color: var(--ink-soft); }
.setup-status { font-size: 11.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
.setup-status.ok { color: var(--ok, #4cc38a); }
.setup-status.bad { color: var(--bad, #ef6a5a); }
.setup-ms { font-size: 11px; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.setup-note { margin: 9px 0 0; font-size: 12px; color: var(--ink-soft); }
.module-head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.module-head h3 { margin: 0; font-size: 17px; letter-spacing: -.01em; }
.mico { font-size: 16px; }
.grow { flex: 1 1 auto; }
.tally { display: flex; gap: 10px; font-size: 11.5px; font-weight: 600; }
.tally .ok { color: var(--good); }
.tally .bad { color: var(--bad); }
.tally .warn { color: var(--warn); }
.tally .mute { color: var(--muted); }
.bar { display: flex; height: 6px; border-radius: 999px; overflow: hidden; background: var(--grid); margin: 9px 0 0; }
.seg.s-pass { background: #34a853; }
.seg.s-fail { background: #c5221f; }
.seg.s-incon { background: #f9ab00; }
.seg.s-notrun { background: var(--grid); }
.mwhat { margin: 8px 0 0; font-size: 12.5px; color: var(--muted); }

/* ── the case table ─────────────────────────────────────────────────── */
.rows { margin: 12px 0 0; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; background: var(--card); }
.rowhead, details.case > summary {
  display: grid;
  grid-template-columns: 104px 108px minmax(230px, 1.6fr) minmax(170px, 1fr) 52px minmax(180px, 1.3fr);
  gap: 12px; align-items: baseline; padding: 9px 14px;
}
.rowhead { background: var(--hover); border-bottom: 1px solid var(--line); font-size: 10.5px; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); font-weight: 600; }
details.case { border-top: 1px solid var(--grid); }
details.case:first-of-type { border-top: 0; }
details.case > summary { cursor: pointer; list-style: none; }
details.case > summary::-webkit-details-marker { display: none; }
details.case > summary:hover { background: var(--hover); }
details.case[open] > summary { background: var(--hover); }
/* A colour down the left edge, so a page of rows is scannable at a glance. */
details.case.v-fail { box-shadow: inset 3px 0 0 #c5221f; }
details.case.v-pass { box-shadow: inset 3px 0 0 #34a853; }
details.case.v-inconclusive { box-shadow: inset 3px 0 0 #f9ab00; }
details.case.v-notrun { box-shadow: inset 3px 0 0 #cfd4d9; }
.col-id { font: 600 11px ui-monospace, Menlo, monospace; color: var(--muted); }
.col-title { font-size: 13px; font-weight: 500; line-height: 1.4; }
.col-tags { display: block; margin-top: 3px; }
.col-call code { font-size: 11px; color: var(--ink-2); word-break: break-all; }
.col-status { font: 600 12px ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; }
.col-outcome { font-size: 11.5px; color: var(--muted); line-height: 1.45; }
.tag { display: inline-block; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  padding: 1px 5px; border-radius: 3px; background: var(--code); color: var(--muted); }
.tag.t-negative { background: #fbe3da; color: #8a3b16; }
.tag.t-positive { background: #dfeaf9; color: #14508c; }
.tag.t-security, .tag.t-robustness { background: #e6e0f8; color: #45308c; }
.tag.t-boundary { background: #e0f2f1; color: #00695c; }

/* ── an opened case ─────────────────────────────────────────────────── */
.case-body { padding: 4px 16px 18px; background: var(--hover); }
.panes { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
@media (max-width: 900px) { .panes { grid-template-columns: 1fr; } }
h5 { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 12px 0 5px; }
.expect, .pre, .said, .said-bad { font-size: 12.5px; line-height: 1.55; margin: 0; }
.pre { color: var(--muted); }
/* The action, not the diagnosis. A not-checked case is unfinished business, so
   its next step gets the weight of an instruction rather than a footnote. */
.todo { margin: 10px 0 0; border-left: 3px solid var(--accent, #3b6fd4); background: color-mix(in srgb, var(--accent, #3b6fd4) 7%, transparent); border-radius: 0 6px 6px 0; padding: 8px 11px; }
.todo h5 { margin: 0 0 3px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--accent, #3b6fd4); }
.todo p { margin: 0; font-size: 12.5px; line-height: 1.5; }
.said-bad { color: var(--bad); }
.apisaid { margin: 8px 0 0; font-size: 12px; background: color-mix(in srgb, var(--bad) 12%, transparent); border: 1px solid color-mix(in srgb, var(--bad) 35%, transparent); border-radius: 6px; padding: 7px 9px; }
.apisaid span { color: var(--bad); font-weight: 600; }
.took { margin: 8px 0 0; font-size: 11px; color: var(--muted); }
.known-open, .known-fixed, .known-new { margin: 8px 0 0; font-size: 12px; padding: 6px 9px; border-radius: 6px; line-height: 1.45; }
.known-open { background: #fce8e6; color: #7a1010; }
.known-fixed { background: #e6f4ea; color: #0f5a2a; }
.known-new { background: #fff4d6; color: #6b4b00; }
.steps { margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.6; color: var(--ink-2); }
details.curl { margin: 12px 0 0; }
details.curl > summary { cursor: pointer; font-size: 11.5px; color: var(--link); list-style: none; width: fit-content; }
details.curl > summary::-webkit-details-marker { display: none; }
details.curl > summary::before { content: "▸ "; }
details.curl[open] > summary::before { content: "▾ "; }
.curl-body { margin-top: 7px; }
button.copy { font: inherit; font-size: 11px; padding: 2px 8px; margin-bottom: 6px;
  border: 1px solid var(--line); border-radius: 5px; background: var(--card); color: var(--ink-2); cursor: pointer; }

/* ── the legend: four chips and what they mean ──────────────────────── */
.legend { display: grid; gap: 7px; margin: 12px 0 0; }
.legend div { display: flex; gap: 9px; align-items: baseline; font-size: 12px; color: var(--muted); line-height: 1.5; }
.legend .pill { flex: 0 0 auto; }
/* ── what wasn't checked: a worklist, ordered by how much it unblocks ── */
.filters { position: sticky; top: 0; z-index: 5; background: var(--paper); padding: 10px 0; margin-bottom: 4px; }
${JOURNEY_CSS}
${VBU_CSS}
</style>
</head>
<body>
<div class="wrap">
  <h1>What we tested, and what happened</h1>
  <p class="sub">${
    run
      ? `run ${escapeHtml(run.id)} · ${escapeHtml(run.companyName ?? String(run.companyId))} · ${escapeHtml(stamp(run.ts))}`
      : "no run on record yet — the case list below is what would run"
  }</p>

  <section class="card">
    <h2>The short version</h2>
    ${refusalBanner}
    ${journey ? renderJourneyLede(journey) : ""}
    ${
      journey && !rows.length
        ? `<div class="tiles">
      ${tile("steps in the journey", journey.steps.length)}
      ${tile("worked", journey.steps.filter((st) => st.verdict === "worked").length, "good")}
      ${tile("refused", journey.steps.filter((st) => st.verdict === "refused").length, journey.steps.some((st) => st.verdict === "refused") ? "warn" : "")}
      ${tile("broken", journey.steps.filter((st) => st.verdict === "broken").length, journey.steps.some((st) => st.verdict === "broken") ? "crit" : "")}
      ${tile("not run", journey.steps.filter((st) => st.verdict === "not-run").length)}
    </div>`
        : `<div class="tiles">
      ${tile("things we check", totals.total)}
      ${tile("worked", totals.passed, "good")}
      ${tile("broken", totals.failed, totals.failed ? "crit" : "")}
      ${tile("couldn’t tell", totals.inconclusive, totals.inconclusive ? "warn" : "")}
      ${tile("not checked", totals.notrun)}
    </div>`
    }
    ${
      fc.total
        ? `<h5 style="margin-top:16px">API field checks — every field of every request, checked</h5>
    <div class="tiles">
      ${tile("field checks", fc.total)}
      ${tile("passed", fc.passed, "good")}
      ${tile("failed", fc.failed, fc.failed ? "crit" : "")}
      ${tile("not checked", fc.skipped)}
      ${tile("requests checked", fc.steps)}
    </div>`
        : ""
    }
    ${journey && !rows.length ? "" : `<p class="lede" style="margin-top:14px">${scopeLine}</p>`}
    ${howToRead}
    ${
      // One legend, for what is actually on the page: the steps' words when the
      // run is a journey alone, the cases' words (and then the steps') otherwise.
      journey && !rows.length
        ? renderJourneyLegend()
        : `<h5 style="margin-top:18px">What the four results mean${journey ? " for a case" : ""}</h5>
    <div class="legend">
      ${(["pass", "fail", "inconclusive", "notrun"] as Verdict[])
        .map(
          (v) =>
            `<div><span class="pill ${VERDICT_PILL[v].cls}">${escapeHtml(
              VERDICT_PILL[v].label,
            )}</span><span>${escapeHtml(VERDICT_PILL[v].meaning)}</span></div>`,
        )
        .join("")}
    </div>
    ${journey ? renderJourneyLegend() : ""}`
    }
  </section>


  <div class="filters">
    <input id="q" type="search" placeholder="Search these tests…" aria-label="Filter cases">
    <select id="fverdict" aria-label="Filter by verdict">
      <option value="">Show everything</option>
      <option value="fail">Only what broke</option>
      <option value="pass">Only what worked</option>
      <option value="inconclusive">Only the unclear ones</option>
      <option value="notrun">Only what wasn’t checked</option>
    </select>
    <select id="fmodule" aria-label="Filter by module">
      <option value="">Every part of Procol</option>
      ${fc.total ? `<option value="API field checks">API field checks (${fc.total})</option>` : ""}
      ${allSections.map((s) => `<option value="${escapeHtml(s.label)}">${escapeHtml(s.label)} (${s.rows.length})</option>`).join("")}
    </select>
    <button id="expand" type="button" class="copy">Open everything that broke</button>
    <span class="count" id="showing"></span>
  </div>

  ${renderQaDocSection(rows)}
  ${renderBugsSection(rows)}
  ${renderFieldChecksSection(journey)}
  ${journeySection}
  ${
    journey && sections.length
      ? `<h2 class="other-h">Other checks this run made</h2>
  <p class="lede">The library cases for the parts of Procol that were ticked but are not part of the event journey above —
  each one request the platform expects Procol to accept or refuse.</p>`
      : ""
  }
  ${
    sections.length
      ? sections
          .map((s) =>
            // The legacy setup block is what a run had before it had a
            // journey; with a journey the second event is described inside
            // the journey section instead.
            renderSection(s, run?.companyId, Boolean(run), s.id === "events" && !journey ? renderSetup(run) : ""),
          )
          .join("")
      : journeySection
        ? ""
        : `<p class="none">No cases in the library for this selection.</p>`
  }
</div>
<script>
(function () {
  var q = document.getElementById("q");
  var fv = document.getElementById("fverdict");
  var fm = document.getElementById("fmodule");
  var showing = document.getElementById("showing");
  var cases = [].slice.call(document.querySelectorAll("details.case"));
  var steps = [].slice.call(document.querySelectorAll("details.jstep"));

  // A case's module travels on the row (data-module) because a row nested
  // under a journey step is not inside its module's section any more.
  function moduleOf(el) {
    var own = el.getAttribute("data-module");
    if (own) return own;
    var section = el.closest("section.module");
    return section ? section.getAttribute("data-module") : "";
  }

  function apply() {
    var text = q.value.trim().toLowerCase();
    var seen = 0;
    cases.forEach(function (el) {
      var ok = (!fv.value || el.getAttribute("data-verdict") === fv.value)
        && (!fm.value || moduleOf(el) === fm.value)
        && (!text || (el.getAttribute("data-search") || "").indexOf(text) !== -1);
      el.classList.toggle("hidden", !ok);
      if (ok) seen++;
    });
    // A journey step stays when it matches on its own, or when any variation
    // folded under it does: the filter should never show a case without the
    // step it belongs to.
    var stepsSeen = 0;
    steps.forEach(function (el) {
      var section = el.closest("section.module");
      var own = (!fv.value || el.getAttribute("data-verdict") === fv.value)
        && (!fm.value || (section && section.getAttribute("data-module") === fm.value))
        && (!text || (el.getAttribute("data-search") || "").indexOf(text) !== -1);
      var live = el.querySelectorAll("details.case:not(.hidden)").length;
      [].forEach.call(el.querySelectorAll("details.variations"), function (v) {
        v.classList.toggle("hidden", v.querySelectorAll("details.case:not(.hidden)").length === 0);
      });
      var show = own || live > 0;
      el.classList.toggle("hidden", !show);
      // The "journey stopped here" line belongs to its step and goes with it.
      var stopped = el.parentElement && el.parentElement.querySelector(".step-stopped");
      if (stopped) stopped.classList.toggle("hidden", !show);
      // A search that matched only a folded variation opens the fold, or
      // the reader sees the count change and nothing else.
      if (text && !own && live > 0) {
        el.open = true;
        [].forEach.call(el.querySelectorAll("details.variations"), function (v) { v.open = true; });
      }
      if (show) stepsSeen++;
    });
    [].forEach.call(document.querySelectorAll("section.module"), function (m) {
      var isJourney = m.classList.contains("journey");
      var wrongModule = Boolean(fm.value) && m.getAttribute("data-module") !== fm.value;
      var live = isJourney
        ? m.querySelectorAll("details.jstep:not(.hidden)").length
        : m.querySelectorAll("details.case:not(.hidden)").length;
      // The journey section answers to the module filter through its steps,
      // which already know whether a nested case matched.
      m.classList.toggle("hidden", (isJourney ? false : wrongModule) || live === 0);
    });
    // The field-check section: a row matches on its own; a request's fold
    // stays while any of its rows does, and opens when a filter found one.
    var fcSeen = 0;
    [].forEach.call(document.querySelectorAll("details.fc-step"), function (g) {
      var live = 0;
      [].forEach.call(g.querySelectorAll("tr.fc-row"), function (r) {
        var ok = (!fv.value || r.getAttribute("data-verdict") === fv.value)
          && (!fm.value || fm.value === "API field checks")
          && (!text || (r.getAttribute("data-search") || "").indexOf(text) !== -1);
        r.classList.toggle("hidden", !ok);
        if (ok) live++;
      });
      g.classList.toggle("hidden", live === 0);
      if ((text || fv.value) && live) g.open = true;
      fcSeen += live;
    });
    var fcSection = document.querySelector("section.fieldchecks");
    if (fcSection) fcSection.classList.toggle("hidden", fcSeen === 0);
    var stepText = steps.length
      ? (stepsSeen === steps.length ? steps.length + " steps" : "showing " + stepsSeen + " of " + steps.length + " steps") + " · "
      : "";
    showing.textContent = stepText + (seen === cases.length ? cases.length + " cases" : "showing " + seen + " of " + cases.length + " cases");
  }

  // Opening a row buried under a step and a folded table needs every
  // <details> above it open too, or nothing visibly happens.
  function reveal(el) {
    el.open = true;
    var p = el.parentElement;
    while (p) { if (p.tagName === "DETAILS") p.open = true; p = p.parentElement; }
  }

  [q, fv, fm].forEach(function (el) { el.addEventListener("input", apply); el.addEventListener("change", apply); });

  // #module=Intake opens the report already narrowed — what the UI links to.
  var hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  var wanted = /^module=/.test(hash) ? hash.slice(7) : "";
  if (wanted) {
    for (var i = 0; i < fm.options.length; i++) {
      if (fm.options[i].value.toLowerCase() === wanted.toLowerCase()) { fm.value = fm.options[i].value; break; }
    }
  }
  apply();

  [].forEach.call(document.querySelectorAll("button[data-fc]"), function (b) {
    b.addEventListener("click", function () {
      var mode = b.getAttribute("data-fc");
      if (mode === "fail") { fv.value = "fail"; apply(); return; }
      [].forEach.call(document.querySelectorAll("details.fc-step"), function (g) { g.open = mode === "open"; });
    });
  });

  document.getElementById("expand").addEventListener("click", function () {
    steps.forEach(function (el) { if (el.getAttribute("data-verdict") === "fail") reveal(el); });
    cases.forEach(function (el) { if (el.getAttribute("data-verdict") === "fail") reveal(el); });
  });

  [].forEach.call(document.querySelectorAll("button.copy[data-copy]"), function (b) {
    b.addEventListener("click", function () {
      var pre = document.getElementById(b.getAttribute("data-copy"));
      if (!pre) return;
      var done = function () { var t = b.textContent; b.textContent = "Copied"; setTimeout(function () { b.textContent = t; }, 1200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pre.textContent).then(done, function () {});
      else done();
    });
  });
})();
</script>
</body>
</html>
`;
}

/**
 * The features a saved run covered.
 *
 * A features run stores its selection in the request line ("features: pr.list,
 * pr.read"), which is what lets a report scope itself to that run without the
 * caller having to repeat the list. An agent run's request is prose, so this
 * returns nothing and the report covers the library — correctly, because an
 * agent run is not confined to a module.
 */
export function featuresOfRun(run: RunRecord | null): string[] {
  const match = run?.request?.match(/^\s*features:\s*(.+)$/i);
  // A pasted-case run's scope is whatever its cases touched.
  if (!match && run?.pastedCases?.length) return [...new Set(run.pastedCases.map((c) => c.feature))];
  if (!match) return [];
  return match[1]
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
}

/** The run a report defaults to: the most recent one on disk. */
export function latestRun(): RunRecord | null {
  const [newest] = listRuns(1);
  return newest ? getRun(newest.id) : null;
}
