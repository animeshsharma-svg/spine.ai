import { knownBugSentence } from "./knownBugs.js";
import { FEATURE_TREE } from "../../config/featureTree.js";
import { summariseFindings, type DefectGroup } from "../agents/oracle.js";
import { defectsFromRuns } from "./checkDefects.js";
import { uiRunDefects } from "./uiFrictionDefects.js";
import { curatedAsDefects, loadCuratedBugs, type CuratedBug } from "./curatedBugs.js";
import { loadTriage, type Triage, type TriageStore } from "../triageStore.js";
import {
  BUG_STATUSES,
  DEV_TYPES,
  DEV_TYPE_COLOR,
  EDITABLE_CSS,
  PRIORITIES,
  PRIORITY_COLOR,
  STATUS_COLOR,
  chipStyle,
} from "./bugStatus.js";
import { PAGE_CSS, escapeHtml, stamp } from "./shared.js";
import { defectsFromObservations } from "./uiObservationDefects.js";

/**
 * THE BUG REPORT — the platform's findings, as the QA bug sheet.
 *
 * Same columns, order and colour language as the sheet the team already reads:
 * Issue ID, Status, Dev ETA, Priority, Blocker, Dev Type, Dev Comment, Sprint
 * Week, User Type, Module, Description, Notes. A row can move between this
 * page and that sheet without being re-keyed, which is the whole point —
 * nobody should have to learn a second bug format because a tool generated it.
 *
 * Every column is derived from recorded fact. Nothing here is a model's
 * opinion: the defect, its blast radius and its evidence all come from the
 * oracle's verdicts on real runs.
 *
 * Two status columns, because they are two different claims:
 *   Status         where the fix has got to — everything starts OPEN here,
 *                  since the platform is reporting what it just found.
 *   Verification   how far the finding itself is proven, under the
 *                  description. A product defect and a harness problem are
 *                  never allowed to look alike.
 */

const SHEET_CSS = `
.sheet-wrap { overflow-x: auto; border: 1px solid #c9c9c9; border-radius: 6px; background: #fff; }
table.sheet { border-collapse: collapse; width: 100%; min-width: 1040px; background: #fff;
  font-family: Arial, Helvetica, system-ui, sans-serif; font-size: 12px; color: #202124; }
table.sheet th, table.sheet td { border: 1px solid #d7d7d7; padding: 7px 8px; vertical-align: middle; text-align: left; }
table.sheet thead th { position: sticky; top: 0; z-index: 2; background: #4a86e8; color: #fff;
  font-weight: 700; text-align: center; white-space: nowrap; }
table.sheet tbody tr:hover td { background: #f3f7fd; }
table.sheet td.c-id { font-weight: 600; white-space: nowrap; text-align: center; }
table.sheet td.c-mid { text-align: center; white-space: nowrap; }
table.sheet td.c-desc { min-width: 240px; }
table.sheet td.c-note { color: #3c4043; min-width: 130px; font-size: 11.5px; }
table.sheet td.tinted { background: #fce5cd; }
.chip { display: inline-block; border-radius: 999px; padding: 3px 12px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.chip-open { background: #a02020; color: #fff; }
.chip-discuss { background: #fce8b2; color: #5c4404; }
.chip-p0 { background: #a02020; color: #fff; }
.chip-p1 { background: #f4c7c3; color: #5c1a16; }
.chip-p2 { background: #fff2cc; color: #5c4404; }
.chip-p3 { background: #efefef; color: #5f6368; }
.chip-yes { background: #a02020; color: #fff; }
.chip-no { background: #d9ead3; color: #274e13; }
.chip-dev { background: #a61c00; color: #fff; }
.chip-harness { background: #7f4f10; color: #fff; }
.chip-env { background: #4a86e8; color: #fff; }
.chip-test { background: #cfe2f3; color: #163b5c; }
.desc-title { display: block; }
.desc-meta { display: block; margin-top: 4px; font-size: 11px; color: #5f6368; }
.verify { font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.v-confirmed { color: #a02020; }
.v-unconfirmed { color: #7a6a00; }
.v-not-a-bug { color: #7a7a7a; }
details.more { margin-top: 5px; }
details.more > summary { font-size: 11px; color: #1a73e8; cursor: pointer; list-style: none; width: fit-content; }
details.more > summary::-webkit-details-marker { display: none; }
details.more > summary::before { content: "▸ "; }
details.more[open] > summary::before { content: "▾ "; }
details.more p, details.more li { font-size: 11px; color: #3c4043; line-height: 1.5; margin: 5px 0 0; }
details.more ol { margin: 4px 0 0; padding-left: 18px; }
.known { display: block; margin: 4px 0 2px; font-size: 11px; padding: 3px 7px; border-radius: 4px; }
.k-open { background: #fce8e6; color: #a50e0e; }
.k-fixed { background: #e6f4ea; color: #137333; }
`;

const COLUMNS = [
  "Issue ID",
  "Status",
  "Dev ETA",
  "Priority",
  "Blocker",
  "DEV TYPE",
  "Dev Comment",
  "Sprint Week",
  "User Type",
  "Module",
  "Description",
  "Notes",
] as const;

/** severity → the sheet's priority column. */
const PRIORITY: Record<DefectGroup["severity"], string> = {
  critical: "P0",
  high: "P1",
  medium: "P2",
  low: "P3",
};

/**
 * What kind of work a finding is, and how far it is proven.
 *
 * A harness problem and a product defect both start life as a red check; the
 * sheet has to keep them apart or engineering is handed our bugs as theirs.
 */
const KIND: Record<
  DefectGroup["kind"],
  { devType: string; chip: string; verification: "confirmed" | "unconfirmed" | "not-a-bug"; status: "OPEN" | "TO BE DISCUSSED" }
> = {
  product_defect: { devType: "BE", chip: "chip-dev", verification: "confirmed", status: "OPEN" },
  contradiction: { devType: "BE", chip: "chip-dev", verification: "confirmed", status: "OPEN" },
  product_rejected_input: { devType: "TEST", chip: "chip-test", verification: "unconfirmed", status: "TO BE DISCUSSED" },
  automation_defect: { devType: "HARNESS", chip: "chip-harness", verification: "not-a-bug", status: "OPEN" },
  environment: { devType: "ENV", chip: "chip-env", verification: "not-a-bug", status: "TO BE DISCUSSED" },
};

const VERIFY_LABEL = {
  confirmed: "confirmed",
  unconfirmed: "test gap — unconfirmed",
  "not-a-bug": "not a product bug",
} as const;

/** flow ids ("events.rfp_rfq") → the modules the UI names. */
function modulesOf(flows: string[]): string {
  const labels = new Set<string>();
  for (const flow of flows) {
    const group = FEATURE_TREE.find((g) => g.id === flow.split(".")[0]);
    labels.add(group?.label ?? flow.split(".")[0]);
  }
  return [...labels].join(", ") || "Platform";
}

/** A dropdown that looks like the sheet's chip and saves on change. */
function chipSelect(
  id: string,
  field: string,
  value: string,
  options: readonly string[],
  colors: Record<string, [string, string]>,
): string {
  const list = options.includes(value) ? options : [value, ...options];
  return `<select class="cell-select" data-id="${escapeHtml(id)}" data-field="${field}"
    style="${chipStyle(colors, value)}" aria-label="${field}">${list
      .map(
        (option) =>
          `<option value="${escapeHtml(option)}"${option === value ? " selected" : ""}>${escapeHtml(option)}</option>`,
      )
      .join("")}</select>`;
}

/** A one-line editable cell. */
function textCell(id: string, field: string, value: string, placeholder = "—"): string {
  return `<input class="cell-input" type="text" data-id="${escapeHtml(id)}" data-field="${field}"
    value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" aria-label="${field}">`;
}

/** A multi-line editable cell, for the two comment columns. */
function textArea(id: string, field: string, value: string, placeholder: string): string {
  return `<textarea class="cell-text" rows="2" data-id="${escapeHtml(id)}" data-field="${field}"
    placeholder="${escapeHtml(placeholder)}" aria-label="${field}">${escapeHtml(value)}</textarea>`;
}

/**
 * One bug row.
 *
 * Every column a person owns is an input pre-filled with what the platform
 * derived, so the sheet is usable the moment it opens and an edit is a
 * correction rather than data entry. Edits save to the triage store on change;
 * the derived columns (Description, blast radius, evidence) stay read-only
 * because a re-run recomputes them and an edit there would be silently lost.
 */
function row(group: DefectGroup, index: number, triage: TriageStore): string {
  const kind = KIND[group.kind];
  const saved: Triage = triage[group.defectFingerprint] ?? {};
  const id = group.defectFingerprint;
  // A curated row brings its own columns — someone already filled them in.
  const curated = (group as DefectGroup & { curated?: CuratedBug }).curated;

  const issueId = curated?.issueId ?? group.knownBug?.id ?? `D__${String(index + 1).padStart(3, "0")}`;
  const status = saved.status ?? curated?.devStatus ?? group.knownBug?.status ?? kind.status;
  const priority = saved.priority ?? curated?.priority ?? group.knownBug?.priority ?? PRIORITY[group.severity];
  const blocker = saved.blocker ?? (curated ? (curated.blocker ? "YES" : "NO") : group.severity === "critical" ? "YES" : "NO");
  const devType = saved.devType ?? curated?.devType ?? kind.devType;
  const module = saved.module ?? curated?.module ?? modulesOf(group.flows);
  /**
   * Notes stays empty unless a person wrote something.
   *
   * It was being pre-filled with "first seen … last …", which squats on the
   * one column in this sheet that belongs to whoever is reading it, and reads
   * as noise besides. The dates are still shown — under the description, with
   * the other facts the platform derived.
   */
  const notes = saved.notes ?? curated?.note ?? "";

  const search = [group.title, group.rationale, ...group.flows, module, status].join(" ").toLowerCase();

  return `
      <tr data-row="${escapeHtml(id)}" data-status="${escapeHtml(status)}" data-priority="${escapeHtml(priority)}"
          data-module="${escapeHtml(module)}" data-blocker="${escapeHtml(blocker.toLowerCase())}"
          data-search="${escapeHtml(search)}">
        <td class="c-id">${escapeHtml(issueId)}</td>
        <td class="c-mid">${chipSelect(id, "status", status, BUG_STATUSES, STATUS_COLOR)}</td>
        <td class="c-mid">${textCell(id, "devEta", saved.devEta ?? curated?.devEta ?? "", "dd/mm")}</td>
        <td class="c-mid">${chipSelect(id, "priority", priority, PRIORITIES, PRIORITY_COLOR)}</td>
        <td class="c-mid">${chipSelect(id, "blocker", blocker, ["YES", "NO"], {
          YES: ["#a02020", "#ffffff"],
          NO: ["#d9ead3", "#274e13"],
        })}</td>
        <td class="c-mid">${chipSelect(id, "devType", devType, DEV_TYPES, DEV_TYPE_COLOR)}</td>
        <td class="c-comment">${textArea(id, "devComment", saved.devComment ?? curated?.devComment ?? "", "what engineering said")}</td>
        <td class="c-mid">${textCell(id, "sprintWeek", saved.sprintWeek ?? curated?.sprintWeek ?? "", "wk")}</td>
        <td>${textCell(id, "userType", saved.userType ?? curated?.userType ?? "All users", "who hits it")}</td>
        <td class="c-mid">${textCell(id, "module", module, "module")}</td>
        <td class="c-desc${blocker === "YES" ? " tinted" : ""}">
          <strong class="desc-title">${escapeHtml(group.title)}</strong>
          <span class="desc-meta">
            <span class="verify v-${curated ? (curated.status === "not-a-bug" ? "not-a-bug" : curated.status === "confirmed" ? "confirmed" : "unconfirmed") : kind.verification}">${escapeHtml(
              curated ? curated.status.replace(/-/g, " ") : VERIFY_LABEL[kind.verification],
            )}</span>
            ${
              curated
                ? `· raised by hand${curated.endpoint ? ` · <code>${escapeHtml(curated.endpoint)}</code>` : ""}${
                    curated.client ? ` · ${escapeHtml(curated.client)}` : ""
                  }`
                : `· found by the platform · seen ${group.occurrences}× · ${group.flows.length} journey${
                    group.flows.length === 1 ? "" : "s"
                  }${group.firstSeen ? ` · first ${escapeHtml(stamp(group.firstSeen))}` : ""}${
                    group.lastSeen && group.lastSeen !== group.firstSeen
                      ? `, last ${escapeHtml(stamp(group.lastSeen))}`
                      : ""
                  }`
            }
          </span>
          ${
            group.knownBug
              ? `<span class="known ${/fixed|closed/i.test(group.knownBug.status) ? "k-fixed" : "k-open"}">${escapeHtml(
                  knownBugSentence(group.knownBug),
                )}</span>`
              : ""
          }
          <details class="more">
            <summary>what we found${group.reproduction.length ? " · how to reproduce" : ""}</summary>
            <p>${escapeHtml(group.rationale)}</p>
            ${
              group.evidence.length
                ? `<p><strong>Evidence:</strong></p><ol>${group.evidence
                    .slice(0, 6)
                    .map((e) => `<li>${escapeHtml(e)}</li>`)
                    .join("")}</ol>`
                : ""
            }
            ${
              group.reproduction.length
                ? group.reproduction[0].startsWith("curl")
                  ? `<p><strong>Reproduce:</strong></p><pre>${escapeHtml(group.reproduction.join("\n"))}</pre>`
                  : `<p><strong>Reproduce:</strong></p><ol>${group.reproduction
                      .slice(0, 8)
                      .map((r) => {
                        // Links the vendor bulk upload reproduction carries (the sheet, the evidence).
                        const m = r.match(/^(.*?: )(\/api\/\S+)$/);
                        return m
                          ? `<li>${escapeHtml(m[1])}<a href="${escapeHtml(m[2])}">${escapeHtml(m[2].startsWith("/api/vbu/sheet") ? "download the .xlsx" : "open")}</a></li>`
                          : `<li>${escapeHtml(r)}</li>`;
                      })
                      .join("")}</ol>`
                : ""
            }
            <p><strong>Journeys hit:</strong> ${escapeHtml(group.flows.join(", ") || "—")}</p>
          </details>
        </td>
        <td class="c-note">${textArea(id, "notes", notes, "your remark")}</td>
      </tr>`;
}

/**
 * Every defect the platform knows about, worst first.
 *
 * Two sources, one list: the oracle's verdicts on agent runs, and the failed
 * checks from "run selected tests" runs. They were separate before, which meant
 * a feature run could turn a check red and leave the bug report empty.
 */
export function allDefects(): DefectGroup[] {
  const order: DefectGroup["severity"][] = ["critical", "high", "medium", "low"];
  const seen = new Set<string>();
  // Curated rows lead, in their own issue-id order — that is the list people
  // read in standup. The platform's own findings follow, worst first.
  const curated = curatedAsDefects(loadCuratedBugs().bugs);
  const found = [
    ...summariseFindings(),
    ...defectsFromRuns(),
    ...defectsFromObservations(),
    // What a browser run put up with on its way to passing: the waits, the
    // retries, and the calls the app made in the background that failed. A
    // green journey used to contribute nothing here at all.
    ...uiRunDefects(),
  ]
    .filter((g) => {
      if (seen.has(g.defectFingerprint)) return false;
      seen.add(g.defectFingerprint);
      return true;
    })
    .sort(
      (a, b) =>
        order.indexOf(a.severity) - order.indexOf(b.severity) ||
        b.occurrences - a.occurrences ||
        a.title.localeCompare(b.title),
    );
  return [...curated, ...found];
}

/**
 * One table per source, each with its own heading.
 *
 * The two lists were one table with a small "raised by hand" note per row, and
 * opening the sheet then looked like the wrong report: the first thing you saw
 * was a PO sandbox bug, when you had just run Intake. Labelled separately, a
 * reader knows in one glance which half they are looking at.
 */
function table(
  heading: string,
  blurb: string,
  rows: DefectGroup[],
  triage: TriageStore,
  startAt = 0,
): string {
  if (rows.length === 0) return "";
  return `
    <h3 class="sheet-h">${escapeHtml(heading)} <span class="count">${rows.length}</span></h3>
    <p class="lede">${escapeHtml(blurb)}</p>
    <div class="sheet-wrap">
      <table class="sheet">
        <thead><tr>${COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((g, i) => row(g, startAt + i, triage)).join("")}</tbody>
      </table>
    </div>`;
}

/** The run a scoped sheet describes, for its heading. */
export interface SheetScope {
  runId: string;
  ts?: string;
  request?: string;
  companyName?: string | null;
  checks?: number;
  /**
   * What kind of run this was. A browser journey has steps, not checks, and
   * files a bug only when something actually goes wrong — so an empty sheet
   * after one means "nothing broke", not "nothing ran". Saying that in check
   * vocabulary made a correct, empty page read as a broken one.
   */
  kind?: "checks" | "journey";
  /** "it passed" / "it broke" — why the sheet below is the length it is. */
  outcome?: string;
  /**
   * Things this run could not finish — facts about the run, not defects.
   *
   * A purchase order that never entered approval because the account has no
   * flow accepting it is worth saying and is not a bug. Filed as one it got an
   * issue id, a P1, a Dev ETA and a Sprint Week column, which invites someone
   * to triage as engineering work something no engineer will ever fix. It
   * belongs next to the run's outcome, above the bugs, where a run-level fact
   * belongs.
   */
  notes?: string[];
  /**
   * What earlier runs found on the SAME modules and nobody has closed.
   *
   * A journey that works files nothing, and the sheet for it was a blank page
   * — which read as "the platform found nothing", when three product defects
   * on this very module were sitting in the all-time list. Carried here,
   * labelled as earlier findings, so a clean run says "nothing new, and here
   * is what is still open" instead of nothing at all.
   */
  stillOpen?: DefectGroup[];
}

/**
 * The defects from every kept run that touch the modules a run covered,
 * minus the ones that run found itself.
 */
export function stillOpenFor(features: string[], found: DefectGroup[]): DefectGroup[] {
  const modules = new Set(features.map((f) => f.split(".")[0]));
  if (!modules.size) return [];
  const seen = new Set(found.map((g) => g.defectFingerprint));
  const triage = loadTriage();
  // "Still open" has to mean reproduced lately, more than once. The all-time
  // list also holds one-off failures from runs weeks ago, many of them the
  // platform's own earlier mistakes since corrected; carrying those onto a
  // fresh run's sheet would be padding of the worst kind.
  const recent = Date.now() - 3 * 24 * 60 * 60 * 1000;
  return defectsFromRuns().filter((g) => {
    if (seen.has(g.defectFingerprint)) return false;
    if (new Date(g.lastSeen).getTime() < recent || g.occurrences < 2) return false;
    if (g.kind !== "product_defect" && g.kind !== "contradiction") return false;
    const status = (triage[g.defectFingerprint] as Triage | undefined)?.status;
    if (status && /fixed|closed|won.t fix|not a bug/i.test(status)) return false;
    return g.flows.some((f) => modules.has(f.split(".")[0]));
  }).slice(0, 12);
}

export function renderBugSheet(
  groups: DefectGroup[] = allDefects(),
  scope?: SheetScope,
): string {
  const triage = loadTriage();
  const blockers = groups.filter((g) => g.severity === "critical").length;
  const product = groups.filter((g) => g.kind === "product_defect" || g.kind === "contradiction").length;
  const harness = groups.filter((g) => g.kind === "automation_defect" || g.kind === "environment").length;

  const tile = (label: string, value: number, cls = "") =>
    `<div class="tile ${cls}"><div class="tile-v">${value}</div><div class="tile-l">${escapeHtml(label)}</div></div>`;

  const options = (values: string[]) =>
    [...new Set(values)].sort().map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>spine.ai — bug report</title>
<style>
${PAGE_CSS}
${SHEET_CSS}
${EDITABLE_CSS}
.scope-note { margin: -4px 0 12px; padding: 7px 10px; border-left: 3px solid #f9ab00;
  background: #fff8e1; border-radius: 5px; font-size: 12.5px; color: #5c4404; }
</style>
</head>
<body>
<div class="wrap">
  <h1>spine.ai — bug report</h1>
  ${
    scope
      ? `<p class="sub">${groups.length} defect${groups.length === 1 ? "" : "s"} from
        <b>this run</b>${scope.request ? ` — ${escapeHtml(scope.request)}` : ""}${
          scope.companyName ? ` on ${escapeHtml(scope.companyName)}` : ""
        }${scope.ts ? `, ${escapeHtml(new Date(scope.ts).toLocaleString())}` : ""}${
          scope.checks ? ` · ${scope.checks} checks ran` : ""
        }${scope.outcome ? ` · ${escapeHtml(scope.outcome)}` : ""}.<br><a href="/api/bug-report">Open the full sheet</a> for every run and the team's hand-raised list.</p>`
      : `<p class="sub">${groups.length} defect${groups.length === 1 ? "" : "s"} the platform has found ·
        generated ${escapeHtml(stamp())}</p>`
  }

  ${
    scope?.notes?.length
      ? `<section class="card note-card">
    <h2>What this run could not finish</h2>
    <p class="sub">Not defects — facts about this run and the account it ran against. Nothing here is engineering work.</p>
    <ul class="run-notes">${scope.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
  </section>`
      : ""
  }

  <section class="card">
    <h2>Where this stands</h2>
    <div class="tiles">
      ${tile("defects", groups.length)}
      ${tile("product", product, product ? "crit" : "")}
      ${tile("blockers", blockers, blockers ? "crit" : "")}
      ${tile("not product", harness, "warn")}
    </div>
    <p class="lede" style="margin-top:14px">Grouped by the DEFECT, not by the journey — seven journeys
    failing on one 500 is one release blocker with a blast radius of seven, and filing it seven times is
    how a triage queue becomes useless. <strong>Status</strong> is where the fix has got to;
    <strong>verification</strong>, under each description, is how far the finding itself is proven, so a
    product defect is never confused with a harness or environment problem.</p>
  </section>

  <section class="card">
    <h2>Bugs</h2>
    <p class="save-note">${
      scope
        ? `<b>Only what this run found</b> — grouped by defect, so one broken endpoint hit by four cases is
           one row. Status, ETA, priority, blocker, dev type, comments, sprint, user type, module and notes are
           <b>editable</b>; your edits are kept separately from what the platform found, so re-running never
           overwrites them. The description, evidence and blast radius are read-only: those are recomputed from
           each run.`
        : `Two lists, one sheet: the <b>hand-raised bugs</b> first — the D__ rows the team
           maintains, each marked “raised by hand” — then everything the platform found on its own runs, marked
           “found by the platform”. Status, ETA, priority, blocker, dev type, comments, sprint, user type, module and
           notes are <b>editable</b> on both — change a cell and it saves itself. Your edits are kept separately from what
           the platform found, so re-running the tests never overwrites them. The description, evidence and blast
           radius are read-only: those are recomputed from each run.`
    }</p>
    ${
      groups.length === 0
        ? scope
          ? scope.kind === "journey"
            ? scope.notes?.length
              /**
               * An empty bug table is only "the good outcome" when the run did
               * what it set out to do. This one did not finish, and saying so
               * here — rather than congratulating it — is the difference
               * between a report and a reassurance.
               */
              ? `<p class="none"><strong>Nothing to raise as a bug.</strong>
               This run did not finish what it set out to do, and the reason is above under
               <b>What this run could not finish</b> — it is a fact about this account, not engineering work,
               so it is not filed as a defect. <a href="/api/ui-report?run=${encodeURIComponent(scope.runId)}">The run's own report</a>
               has every step it took, and <a href="/api/bug-report">the full sheet</a> has everything the platform
               has found across all runs.</p>`
              : `<p class="none"><strong>Nothing to raise — ${escapeHtml(scope.outcome ?? "this journey filed nothing")}.</strong>
               A journey files a bug when it stops on something, or when the app throws an error at it
               while it works. This one did neither, so there is nothing here — that is the good outcome, not a
               missing page. <a href="/api/ui-report?run=${encodeURIComponent(scope.runId)}">The run's own report</a>
               has every step it took, and <a href="/api/bug-report">the full sheet</a> has everything the platform
               has found across all runs.</p>`
            : `<p class="none">This run found no defects — every step of the journey worked${
                scope.checks ? ", and every case it ran either passed or was inconclusive" : ""
              }. The cases that probe the product with bad input live under
               <b>Event validation</b> and <b>API hardening</b>; tick those with the event type to run them.
               <a href="/api/bug-report">The full sheet</a> shows what earlier runs found.</p>`
          : `<p class="none">No defects recorded yet. Either no run has finished, or every check passed.</p>`
        : `
    <div class="filters">
      <input id="bq" type="search" placeholder="Filter bugs by text, module or journey…" aria-label="Filter bugs">
      <select id="bstatus" aria-label="Filter by status"><option value="">Any status</option>${options(
        [...BUG_STATUSES],
      )}</select>
      <select id="bpriority" aria-label="Filter by priority"><option value="">Any priority</option>${options(
        groups.map((g) => PRIORITY[g.severity]),
      )}</select>
      <select id="bmodule" aria-label="Filter by module"><option value="">Any module</option>${options(
        groups.map((g) => modulesOf(g.flows)),
      )}</select>
      <select id="bblocker" aria-label="Filter by blocker">
        <option value="">Blocker: any</option><option value="yes">Blocker: yes</option><option value="no">Blocker: no</option>
      </select>
      <span class="count" id="bcount"></span>
    </div>
    <p class="scope-note" id="bnote" hidden></p>
    ${table(
      "Raised by hand",
      "The list the team maintains in the API suite’s config/findings.yaml — written up by a person, with " +
        "a description in product language. These are the D__ rows you know from the sheet.",
      groups.filter((g) => (g as DefectGroup & { curated?: CuratedBug }).curated),
      triage,
    )}
    ${table(
      "Found by the platform",
      "Defects the platform turned up on its own runs, grouped by defect rather than by test. Nobody has " +
        "written these up yet — that is what the editable columns are for.",
      groups.filter((g) => !(g as DefectGroup & { curated?: CuratedBug }).curated),
      triage,
      // Numbering continues past the curated rows, so no two rows in the sheet
      // ever share an issue id.
      groups.filter((g) => (g as DefectGroup & { curated?: CuratedBug }).curated).length,
    )}`
    }
    ${
      scope?.stillOpen?.length
        ? table(
            "Still open from earlier runs on these modules",
            "Not found by this run — found before, on the same part of Procol, and not yet marked fixed. Listed so a " +
              "clean run reads as \"nothing new\" rather than \"nothing known\".",
            scope.stillOpen,
            triage,
            groups.length,
          )
        : ""
    }
  </section>
</div>
<script>
(function () {
  var q = document.getElementById("bq");
  if (!q) return;
  var st = document.getElementById("bstatus");
  var pr = document.getElementById("bpriority");
  var md = document.getElementById("bmodule");
  var bl = document.getElementById("bblocker");
  var count = document.getElementById("bcount");
  var rows = [].slice.call(document.querySelectorAll("table.sheet tbody tr"));

  function apply() {
    var text = q.value.trim().toLowerCase();
    var seen = 0;
    rows.forEach(function (tr) {
      var ok = (!st.value || tr.getAttribute("data-status") === st.value)
        && (!pr.value || tr.getAttribute("data-priority") === pr.value)
        && (!md.value || (tr.getAttribute("data-module") || "").indexOf(md.value) !== -1)
        && (!bl.value || tr.getAttribute("data-blocker") === bl.value)
        && (!text || (tr.getAttribute("data-search") || "").indexOf(text) !== -1);
      tr.style.display = ok ? "" : "none";
      if (ok) seen++;
    });
    count.textContent = seen + " of " + rows.length + " bugs";
  }

  [q, st, pr, md, bl].forEach(function (el) { el.addEventListener("input", apply); el.addEventListener("change", apply); });

  /**
   * Saving an edit.
   *
   * One field per request, on change (a dropdown) or on blur (a text cell), so
   * a half-typed comment is never saved and nothing is lost by moving on. The
   * row flashes green when it lands and red when it does not — a silent
   * failure here would let someone triage a whole sheet into nothing.
   */
  var COLORS = ${JSON.stringify({
    status: STATUS_COLOR,
    priority: PRIORITY_COLOR,
    devType: DEV_TYPE_COLOR,
    blocker: { YES: ["#a02020", "#ffffff"], NO: ["#d9ead3", "#274e13"] },
  })};

  function paint(select) {
    var map = COLORS[select.getAttribute("data-field")];
    var pair = map && map[select.value];
    if (pair) { select.style.background = pair[0]; select.style.color = pair[1]; }
  }

  function mark(tr, cls) {
    tr.classList.remove("saving", "saved", "savefail");
    tr.classList.add(cls);
    if (cls !== "saving") setTimeout(function () { tr.classList.remove(cls); }, 1600);
  }

  function save(el) {
    var tr = el.closest("tr");
    var body = JSON.stringify({ id: el.getAttribute("data-id"), field: el.getAttribute("data-field"), value: el.value });
    mark(tr, "saving");
    fetch("/api/bug-triage", { method: "POST", headers: { "content-type": "application/json" }, body: body })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function () {
        mark(tr, "saved");
        // Keep the row's filter attributes in step with what it now says.
        var field = el.getAttribute("data-field");
        if (field === "status") tr.setAttribute("data-status", el.value);
        if (field === "priority") tr.setAttribute("data-priority", el.value);
        if (field === "module") tr.setAttribute("data-module", el.value);
        if (field === "blocker") tr.setAttribute("data-blocker", el.value.toLowerCase());
        apply();
      })
      .catch(function () { mark(tr, "savefail"); });
  }

  [].forEach.call(document.querySelectorAll(".cell-select"), function (el) {
    paint(el);
    el.addEventListener("change", function () { paint(el); save(el); });
  });
  [].forEach.call(document.querySelectorAll(".cell-input, .cell-text"), function (el) {
    var initial = el.value;
    el.addEventListener("blur", function () { if (el.value !== initial) { initial = el.value; save(el); } });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && el.classList.contains("cell-input")) { e.preventDefault(); el.blur(); }
    });
  });

  // #module=Intake arrives from the UI when a feature is ticked there. If that
  // module has no bugs, say so — quietly showing every other module's bugs
  // instead reads as "here are Intake's bugs", which would be a lie.
  var hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  var wanted = /^module=/.test(hash) ? hash.slice(7) : "";
  if (wanted) {
    var matched = "";
    for (var i = 0; i < md.options.length; i++) {
      if (md.options[i].value && md.options[i].value.toLowerCase().indexOf(wanted.toLowerCase()) !== -1) {
        matched = md.options[i].value;
        break;
      }
    }
    if (matched) {
      md.value = matched;
    } else {
      var note = document.getElementById("bnote");
      if (note) {
        note.textContent = "No bugs recorded for " + wanted + " — showing every module instead.";
        note.hidden = false;
      }
    }
  }
  apply();
})();
</script>
</body>
</html>
`;
}
