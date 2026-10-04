/**
 * DEFECT TICKETS → REGRESSION CASES in test-cases/hubspot-regressions.md.
 *
 * That file is COMMITTED, so nothing in it may come from a customer's words:
 *
 *   - a ticket that matches a defect pattern gets the pattern's own,
 *     hand-written text (patterns.ts);
 *   - any other defect gets a generic placeholder that points at the ticket's
 *     stored scenario in spine.ai (stripped, git-ignored, never here);
 *   - the ticket is referenced ONLY by its HubSpot id, in the Trace line
 *     (the "Details" a reader expands).
 *
 * Several tickets reporting the same pattern share one case (the first
 * ticket's id names it); every ticket's id is listed in the Trace.
 * Ids are HS-<ticketId>-N.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findFeature } from "../../config/featureTree.js";
import { PATTERNS } from "./patterns.js";
import type { ProcessedTicket } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const CASES_FILE = join(here, "..", "..", "..", "test-cases", "hubspot-regressions.md");

const GROUP_TITLE: Record<string, string> = {
  "API-XCRT": "Building the event",
  "API-XPUB": "Publishing and inviting vendors",
  "API-XBID": "Bidding",
  "API-TECH": "Technical evaluation",
  "API-XDQCS": "Comparing quotes",
  "API-XDNEG": "Counter offers and negotiation",
  "API-XAWD": "Awarding",
  "API-XDAPR": "Approvals",
  "API-XDAUC": "Auctions",
  "API-XDAMD": "Amending a live event",
  "API-XDBOQ": "Bills of quantities",
  "API-XDLST": "The events list and the event's status",
  "API-XDPRE": "Purchase requests into events",
};
const GROUP_ORDER = Object.keys(GROUP_TITLE);

function priorityOf(tickets: ProcessedTicket[]): string {
  const ps = tickets.map((t) => (t.ticket.priority ?? "").toUpperCase());
  if (ps.some((p) => /URGENT|HIGH|CRITICAL/.test(p))) return "P0";
  if (ps.some((p) => /MEDIUM|NORMAL/.test(p))) return "P1";
  return "P2";
}

interface CaseBlock {
  id: string;
  group: string;
  md: string;
  tickets: string[];
}

/** Which tickets get a regression case: classified defects in the sourcing-events scope. */
export function caseWorthy(p: ProcessedTicket): boolean {
  return p.classification === "defect" && p.inEventsScope && !!p.scenario;
}

/**
 * Build the case blocks and fill each ticket's linkedCaseIds (mutates the
 * tickets). Returns the markdown and the ids written.
 */
export function buildCaseFile(tickets: ProcessedTicket[], meta: { generatedAt: string; note?: string }): { md: string; ids: string[] } {
  const worthy = tickets.filter(caseWorthy).sort((a, b) => a.ticket.id.localeCompare(b.ticket.id, undefined, { numeric: true }));
  const byKey = new Map<string, ProcessedTicket[]>();
  for (const p of worthy) {
    // Pattern cases are shared by every ticket reporting the same pattern; anything else is one case per ticket.
    const key = p.scenario!.pattern !== "llm" && p.scenario!.pattern !== "generic" ? `pattern:${p.scenario!.pattern}` : `ticket:${p.ticket.id}`;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  for (const p of tickets) p.linkedCaseIds = [];
  const blocks: CaseBlock[] = [];
  for (const [key, group] of byKey) {
    const first = group[0];
    const sc = first.scenario!;
    const id = `HS-${first.ticket.id}-1`;
    for (const p of group) p.linkedCaseIds = [id];
    const pattern = key.startsWith("pattern:") ? PATTERNS.find((x) => x.id === sc.pattern) : undefined;
    const feature = first.featureKey ? findFeature(first.featureKey) : undefined;
    const featureLabel = feature?.label ?? "an event feature";
    const ticketIds = group.map((p) => p.ticket.id);
    const reported = group.length === 1 ? "one support ticket" : `${group.length} support tickets`;
    const automatable = sc.automatable && !!pattern;
    const verdict = automatable ? "automate" : sc.modelWritten ? "automate-later" : "manual";
    const lines: string[] = [];
    if (pattern) {
      lines.push(`#### ${id} — ${pattern.title}`);
      lines.push(`- **Why it matters.** ${pattern.why} Reported through ${reported}.`);
      lines.push(`- **Setup.** ${pattern.preconditions}`);
      lines.push(`- **Steps.** ${pattern.steps.map((s, i) => `${i + 1}. ${s}`).join(" ")}`);
      lines.push(`- **Expected.** ${pattern.expected}`);
      lines.push(`- **Oracle.** ${pattern.oracle}${pattern.automatable ? "" : ` Not automatable yet: ${pattern.notAutomatableBecause}.`}`);
    } else {
      lines.push(`#### ${id} — A support-reported defect in ${featureLabel.toLowerCase()} does not come back`);
      lines.push(
        `- **Why it matters.** A customer reported a defect in ${featureLabel.toLowerCase()} through support. Its specific steps are kept in spine.ai, stripped of personal data — not in this file.`,
      );
      lines.push(`- **Setup.** The scenario stored for this ticket in spine.ai (Support tickets).`);
      lines.push(`- **Steps.** 1. Follow the stored scenario's steps on a fresh test event with QA vendors only.`);
      lines.push(`- **Expected.** ${feature ? `${feature.label} works as documented` : "The feature works as documented"}, and the behaviour reported in the ticket does not occur.`);
      lines.push(
        `- **Oracle.** ${sc.modelWritten ? "The stored scenario is compiled into an API plan and run on two fresh events; a person confirms the verdict." : "A person checks it against the stored scenario."}`,
      );
    }
    const refs = [
      ...ticketIds.map((t) => `HS-${t}`),
      ...(pattern?.libraryTwin ? [pattern.libraryTwin] : []),
      sc.journeyGroup,
      ...(pattern?.backendCite ? [pattern.backendCite.split(" (")[0].split(";")[0]] : []),
    ];
    lines.push(`- **Trace.** ${priorityOf(group)} · ${verdict} · hubspot · ${refs.map((r) => `\`${r}\``).join(" · ")}`);
    blocks.push({ id, group: sc.journeyGroup, md: lines.join("\n"), tickets: ticketIds });
  }

  const order = (g: string) => (GROUP_ORDER.includes(g) ? GROUP_ORDER.indexOf(g) : 99);
  const groups = [...new Set(blocks.map((b) => b.group))].sort((a, b) => order(a) - order(b));
  const out: string[] = [
    "# Support-ticket regressions — event defects customers reported, as regression cases",
    "",
    "Generated by `npm run hubspot:ingest` (prototype/scripts/hubspot-ingest.ts) from HubSpot support tickets that were",
    "classified as product defects in sourcing events. **Do not edit by hand** — edit `prototype/src/hubspot/patterns.ts` and",
    "ingest again. Nothing here comes from a customer's words: a ticket that matches a known defect pattern gets that pattern's",
    "own generic text, anything else a placeholder; the ticket's stripped scenario lives in spine.ai's database, never in git.",
    "Tickets are referenced only by their HubSpot id in each case's Trace. A ticket becomes a bug only when its case fails on",
    "two fresh test events AND the backend code confirms it (`npm run hubspot:reproduce`).",
    "",
    `_Last generated ${meta.generatedAt.slice(0, 10)} · ${blocks.length} case(s) from ${worthy.length} defect ticket(s)${meta.note ? ` · ${meta.note}` : ""}._`,
    "",
  ];
  groups.forEach((g, i) => {
    out.push(`## ${i + 1}. ${GROUP_TITLE[g] ?? g}`, "");
    for (const b of blocks.filter((x) => x.group === g)) out.push(b.md, "");
  });
  if (!blocks.length) out.push("_No defect tickets in the sourcing-events scope yet._", "");
  return { md: out.join("\n"), ids: blocks.map((b) => b.id) };
}

export function writeCaseFile(md: string): void {
  writeFileSync(CASES_FILE, md);
}
