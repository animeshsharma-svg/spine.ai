import type { Page } from "@playwright/test";
import type { PlanStep } from "./steps.js";
import type { PlanContext } from "./screens.js";
import { QCS_AUDIENCE_NAMES } from "./qcsAudienceCatalog.js";
import { MasterQcsPage } from "../pages/MasterQcsPage.js";
import { ParticipantsPage, type ParticipantRow } from "../pages/ParticipantsPage.js";
import { AwardPage } from "../pages/AwardPage.js";
import { qaVendorNames, isQaVendorName, allowRealVendors } from "../db/qaVendors.js";
import {
  PLACEHOLDER_VENDOR,
  cellAt,
  checkAmounts,
  checkRanks,
  findRowLabel,
  lineBlocks,
  qcsEmpty,
  qcsNumber,
  qcsTolerance,
  rowLabels,
  vendorIndex,
  type QcsGrid,
} from "./qcsModel.js";

/**
 * Executor for the Master QCS and Participants-list steps (qcsAudienceCatalog.ts).
 *
 * How a failure reads matters (prototype/scripts/run-ui-cases.ts judge()): a
 * step that could not READ the screen says "couldn't tell — …", so the case is
 * judged could-not-tell; a step that read the screen and found it wrong says
 * what it read and what the case expects, in words that do not look like an
 * automation fault, so the case is judged failed and re-run on a fresh state
 * before anyone calls it a bug. An assertion never passes by not finding what
 * it was told to look for.
 */
export interface QcsAudienceCtx {
  page: Page;
  context: PlanContext;
  /** who counts as a QA test vendor — the client's, from the database; the self-test passes its own */
  qaNames?: () => Promise<string[]>;
  /** surrogate bids this plan typed (runPlan): the price a QCS cell is compared with when no API value exists */
  typedBids?: Array<{ vendor: string; price: number }>;
  /** vendors the case named that the participants search did not know when inviting (runPlan) */
  unmatchedVendors?: string[];
  /** vendors this plan placed surrogate bids for, in order (runPlan) */
  surrogateBids?: string[];
}

const NOT_ON_SCREEN = (what: string) => `couldn't tell — ${what}`;

/**
 * What select_participant did earlier in this plan (one plan per page): the vendor it added —
 * what a later participant step means when it names no vendor — and how many vendors the round
 * held before, so "it is added and counted" is checked as one more, not as a number the plan
 * had to guess about an event it did not build.
 */
const added = new WeakMap<Page, { vendor: string; countBefore: number | null }>();

async function grid(page: Page): Promise<QcsGrid> {
  const qcs = new MasterQcsPage(page);
  let g = await qcs.read();
  if (!g || !g.vendors.length) {
    // Asked on the project page before the tab was opened: open it, as open_master_qcs would.
    if (/\/project\//.test(page.url())) await new AwardPage(page).openMasterQcs().catch(() => false);
    g = await qcs.read();
  }
  // An event with no bids shows "No bids are placed yet!" in place of the grid.
  const noBids = () => page.getByText(/no bids (are|have been) placed/i).first().isVisible().catch(() => false);
  if (!g) {
    throw new Error(NOT_ON_SCREEN((await noBids()) ? "Master QCS says no bids are placed yet, so there is no comparison grid to read" : "no Master QCS comparison grid is on this screen (open_master_qcs or open_prepared master_qcs first)"));
  }
  if (!g.vendors.length) {
    throw new Error(NOT_ON_SCREEN((await noBids()) ? "Master QCS says no bids are placed yet, so the grid has no vendor column to read" : "the comparison grid shows no vendor column"));
  }
  return g;
}

const show = (s: string) => (qcsEmpty(s) ? `“${s.trim() || "(blank)"}” (empty)` : `“${s.trim()}”`);
const same = (a: string, b: string) => a.replace(/[₹,\s]/g, "").replace(/\.0+(?=\D|$)/, "").toLowerCase() === b.replace(/[₹,\s]/g, "").replace(/\.0+(?=\D|$)/, "").toLowerCase();

function vendorOrThrow(g: QcsGrid, want: unknown, ctx: PlanContext): number {
  const v = vendorIndex(g, want, ctx.vendorName);
  if (v < 0) throw new Error(NOT_ON_SCREEN(`no vendor column matches “${String(want)}” (columns: ${g.vendors.join(" | ")})`));
  return v;
}

/** The price this run typed for a vendor's surrogate bid: the bid's label starts with the column's name ("PROCOL TECH PRIVATE LIMITED-test@dummy.c" under "PROCOL TECH PRIVATE LIMITED"); one bid and one name match also when shortened. */
function typedBidFor(bids: Array<{ vendor: string; price: number }> | undefined, column: string | undefined): number | undefined {
  if (!bids?.length || !column) return undefined;
  const n = (t: string) => t.toLowerCase().replace(/[^a-z0-9@.]+/g, " ").trim();
  const c = n(column).replace(/\.{3}$|…$/, "").trim();
  const hit = bids.filter((b) => n(b.vendor).startsWith(c) || c.startsWith(n(b.vendor)) || n(b.vendor).includes(c));
  return hit.length ? hit[hit.length - 1].price : bids.length === 1 ? bids[0].price : undefined;
}

export async function runQcsAudienceStep(x: QcsAudienceCtx, step: PlanStep): Promise<string | null> {
  if (!QCS_AUDIENCE_NAMES.includes(step.step)) return null;
  const a = step.args ?? {};
  const { page, context } = x;

  switch (step.step) {
    case "expect_qcs_vendors": {
      const g = await grid(page);
      const problems: string[] = [];
      if (a.count !== undefined && g.vendors.length !== Number(a.count)) problems.push(`it has ${g.vendors.length} vendor column(s) (${g.vendors.join(" | ")}) — the case expects ${Number(a.count)}`);
      const want = Array.isArray(a.vendors) ? a.vendors.map(String) : a.vendors ? [String(a.vendors)] : [];
      const absent = want.filter((w) => !g.vendors.some((v) => v.toLowerCase().includes(w.toLowerCase())));
      if (absent.length) problems.push(`its columns (${g.vendors.join(" | ")}) leave out ${absent.join(", ")}`);
      if (a.realNames !== false) {
        const fake = g.vendors.filter((v) => PLACEHOLDER_VENDOR.test(v));
        if (fake.length) problems.push(`a column is headed by a placeholder instead of a company name: ${fake.map((f) => `“${f}”`).join(", ")}`);
      }
      if (problems.length) throw new Error(`Master QCS: ${problems.join("; ")}`);
      return `Master QCS has ${g.vendors.length} vendor column(s): ${g.vendors.join(" | ")}`;
    }

    case "expect_qcs_cell": {
      if (!a.row) throw new Error(NOT_ON_SCREEN("expect_qcs_cell needs the row label to read (automation needs update)"));
      const g = await grid(page);
      const labels = rowLabels(g);
      const label = findRowLabel(labels, String(a.row));
      if (!label) throw new Error(NOT_ON_SCREEN(`Master QCS has no “${String(a.row)}” row (its rows: ${labels.join(", ")})`));
      const v = vendorOrThrow(g, a.vendor, context);
      const blocks = lineBlocks(g, a.product);
      const pool = blocks.some((b) => b.rows.some((r) => r.label === label)) ? blocks : g.blocks;
      const cell = cellAt(pool, label, v);
      if (!cell) throw new Error(NOT_ON_SCREEN(`no line item${a.product ? ` matching “${String(a.product)}”` : ""} has a “${label}” row`));
      const where = `“${label}” for ${g.vendors[v]}${cell.block.heading ? ` on ${cell.block.heading}` : ""}`;
      const read = cell.text;
      const asked = label.toLowerCase() === String(a.row).toLowerCase() ? "" : ` (the case's “${String(a.row)}”)`;

      let want: string | undefined;
      let wantNumber: number | undefined;
      if (a.key !== undefined) {
        // A plan that built its own event has no API values; the price it typed for this vendor's
        // surrogate bid is the bid price (21 Oct, B04: key bidPrice on a browser-built event).
        const typed = String(a.key) === "bidPrice" ? typedBidFor(x.typedBids, g.vendors[v]) : undefined;
        const val = context.values?.[String(a.key)] || (typed !== undefined ? String(typed) : undefined);
        if (val === undefined || val === "") throw new Error(NOT_ON_SCREEN(`the API handed this case no value for “${String(a.key)}” (it has: ${Object.keys(context.values ?? {}).join(", ") || "none"})${String(a.key) === "bidPrice" ? " and this run typed no bid for that vendor" : ""}`));
        want = val;
        wantNumber = qcsNumber(val) ?? undefined;
      } else if (a.number !== undefined) {
        wantNumber = Number(a.number);
        want = String(a.number);
      } else if (a.equals !== undefined) {
        want = String(a.equals);
      }

      // The case may expect the cell EMPTY ("–" for a vendor that did not bid that line).
      if (want !== undefined && wantNumber === undefined && qcsEmpty(want)) {
        if (!qcsEmpty(read)) throw new Error(`Master QCS ${where}${asked} reads ${show(read)} — the case expects it empty`);
        return `Master QCS ${where}${asked} is empty, as expected`;
      }
      if (qcsEmpty(read)) {
        throw new Error(`Master QCS ${where}${asked} reads ${show(read)} — the case expects ${want ?? (a.contains ? `text containing “${String(a.contains)}”` : "a value")}`);
      }
      if (wantNumber !== undefined && Number.isFinite(wantNumber)) {
        const got = qcsNumber(read);
        if (got === null || Math.abs(got - wantNumber) > qcsTolerance(read)) throw new Error(`Master QCS ${where}${asked} reads ${show(read)} — the case expects ${want}`);
      } else if (want !== undefined && !same(read, want)) {
        throw new Error(`Master QCS ${where}${asked} reads ${show(read)} — the case expects “${want}”`);
      }
      if (a.contains !== undefined && !read.toLowerCase().includes(String(a.contains).toLowerCase())) {
        throw new Error(`Master QCS ${where}${asked} reads ${show(read)} — the case expects it to contain “${String(a.contains)}”`);
      }
      return `Master QCS ${where}${asked} reads “${read.trim()}”${want !== undefined ? ` as expected (${want})` : ""}`;
    }

    case "expect_qcs_amounts": {
      const g = await grid(page);
      const v = a.vendor !== undefined ? vendorOrThrow(g, a.vendor, context) : undefined;
      const r = checkAmounts(g, { vendor: v, product: a.product, rate: a.rate, qty: a.qty, amount: a.amount, total: a.total === false ? false : undefined });
      const missing = (["rate", "qty", "amount"] as const).filter((k) => !r.labels[k]);
      if (missing.length) throw new Error(NOT_ON_SCREEN(`Master QCS has no row for the ${missing.join(", ")} (its rows: ${rowLabels(g).join(", ")})`));
      if (r.wrong.length) throw new Error(`Master QCS arithmetic is off — ${r.wrong.slice(0, 4).join("; ")}${r.wrong.length > 4 ? `; and ${r.wrong.length - 4} more` : ""}`);
      if (!r.checked.length) throw new Error(NOT_ON_SCREEN(`no priced line to check (${r.skipped.slice(0, 3).join("; ") || "the grid holds no bid"})`));
      return `Master QCS arithmetic holds on ${r.checked.length} check(s): ${r.checked.slice(0, 3).join("; ")}${r.skipped.length ? ` · skipped ${r.skipped.length}: ${r.skipped.slice(0, 2).join("; ")}` : ""}`;
    }

    case "expect_qcs_ranks": {
      const g = await grid(page);
      const order = /high|sell/i.test(String(a.order ?? "")) ? "highest" : "lowest";
      const r = checkRanks(g, { by: a.by, product: a.product, order });
      if (!r.labels.rank) throw new Error(NOT_ON_SCREEN(`Master QCS has no “Rank” row (its rows: ${rowLabels(g).join(", ")})`));
      if (!r.labels.by) throw new Error(NOT_ON_SCREEN(`Master QCS has no row for the amount the ranks follow (its rows: ${rowLabels(g).join(", ")})`));
      const ranked = g.vendors.length;
      if (a.atLeast !== undefined && ranked < Number(a.atLeast)) {
        throw new Error(NOT_ON_SCREEN(`the grid has ${ranked} vendor column(s) and the case needs at least ${Number(a.atLeast)} ranked vendors — the starting state does not have them`));
      }
      if (r.wrong.length) throw new Error(`Master QCS ranks do not follow ${r.labels.by} (${order} first) — ${r.wrong.slice(0, 4).join("; ")}`);
      if (!r.checked.length) throw new Error(NOT_ON_SCREEN(`nothing here can be judged (${r.skipped.slice(0, 3).join("; ") || "no line item holds a ranked bid"})`));
      return `ranks follow ${r.labels.by} (${order} is Rank 1): ${r.checked.slice(0, 3).join("; ")}`;
    }

    case "search_participants":
    case "expect_participant": {
      const list = new ParticipantsPage(page);
      if (!(await list.ensureOpen())) throw new Error(NOT_ON_SCREEN("the Participants list with its “Search vendors” box is not on this screen (open_prepared participants or open_participants first)"));
      // No vendor named: the one select_participant added, the case's own, else the one this plan just bid for
      // (27 Oct, SB04: "place a surrogate bid for an invited vendor who has not bid yet, then check its row").
      const bidFor = x.surrogateBids?.at(-1)?.replace(/[-\s]+\S*@\S*.*$/, "").replace(/\s+\d{6,}.*$/, "").trim();
      const vendor = String(a.vendor ?? added.get(page)?.vendor ?? (context.vendorName || bidFor) ?? "").trim();
      // "an invited vendor who has not bid yet", before any bid: any ticked row that still offers Add Bid is one.
      if (!vendor && a.addBid === true && a.present !== false && step.step === "expect_participant") {
        const open = (await list.rows()).filter((r) => r.addBid && r.selected !== false);
        if (!open.length) throw new Error("no invited vendor on this page offers Add Bid — every listed vendor has bid, or none is invited");
        return `${open.length} invited vendor(s) on this page offer Add Bid: ${open.slice(0, 5).map((r) => r.name).join(" | ")}`;
      }
      if (!vendor) throw new Error(NOT_ON_SCREEN("no vendor was named and the case has no vendor of its own (automation needs update)"));
      // A vendor the participants search did not know when inviting was never on this round (21 Oct,
      // B05: "Acme Nonexistent Supplier"): its row cannot be there, and that is not the product failing.
      if (a.present !== false && x.unmatchedVendors?.some((u) => u.toLowerCase() === vendor.toLowerCase())) {
        throw new Error(NOT_ON_SCREEN(`“${vendor}” was never invited — the participants search knows no vendor by that name, so the invite fell back to the vendors Procol suggests; there is no row of it to check`));
      }
      if (step.step === "search_participants" || a.present === false) await list.showOnlySelected(false);
      const rows = await list.searchFor(vendor);
      const row = list.rowFor(rows, vendor);
      if (step.step === "search_participants") {
        if (!rows.length && !(await list.saysEmpty())) throw new Error(NOT_ON_SCREEN(`the list showed neither rows nor an empty message after searching “${vendor}”`));
        return `searched “${vendor}” — ${rows.length} row(s): ${rows.slice(0, 5).map((r) => r.name).join(" | ") || "(empty)"}`;
      }
      const shown = (rs: ParticipantRow[]) => rs.slice(0, 5).map((r) => r.name).join(" | ") || "(empty)";
      if (a.present === false) {
        if (row) throw new Error(`“${vendor}” is listed on the Participants list — the case expects it absent (row: ${row.text.slice(0, 120)})`);
        return `“${vendor}” is not on the Participants list (searched; it shows ${shown(rows)})`;
      }
      if (!row) {
        if (!rows.length && !(await list.saysEmpty())) throw new Error(NOT_ON_SCREEN(`the list showed neither rows nor an empty message after searching “${vendor}”`));
        throw new Error(`“${vendor}” is absent from the Participants list after searching for it (it shows ${shown(rows)})`);
      }
      const problems: string[] = [];
      if (a.selected !== undefined && row.selected !== (a.selected === true || a.selected === "true")) {
        if (row.selected === null) throw new Error(NOT_ON_SCREEN(`the row for “${row.name}” has no readable selection box`));
        problems.push(`its box is ${row.selected ? "ticked" : "unticked"} — the case expects it ${a.selected === true || a.selected === "true" ? "ticked (on this round)" : "unticked"}`);
      }
      if (a.addBid !== undefined && row.addBid !== (a.addBid === true || a.addBid === "true")) {
        problems.push(`it ${row.addBid ? "offers" : "does not offer"} Add Bid — the case expects ${a.addBid === true || a.addBid === "true" ? "the control" : "none"}`);
      }
      if (problems.length) throw new Error(`the Participants row for “${row.name}”: ${problems.join("; ")}`);
      return `“${row.name}” is listed${row.selected ? ", ticked" : row.selected === false ? ", unticked" : ""}${row.addBid ? ", with Add Bid" : ", without Add Bid"}${row.email ? ` (${row.email})` : ""}`;
    }

    case "expect_participant_count": {
      const list = new ParticipantsPage(page);
      if (!(await list.ensureOpen())) throw new Error(NOT_ON_SCREEN("the Participants list is not on this screen (open_prepared participants or open_participants first)"));
      if (a.count === undefined && a.atLeast === undefined && a.grewBy === undefined) throw new Error(NOT_ON_SCREEN("expect_participant_count needs count, atLeast or grewBy (automation needs update)"));
      const memo = added.get(page);
      if (a.grewBy !== undefined && (memo?.countBefore === undefined || memo.countBefore === null)) {
        throw new Error(NOT_ON_SCREEN("grewBy compares with the count before select_participant, and no select_participant counted the round earlier in this plan"));
      }
      if (!(await list.showOnlySelected(true))) throw new Error(NOT_ON_SCREEN("the “Show only selected vendors” switch would not turn on, so the round's own vendors cannot be counted"));
      await list.clearSearch();
      const all = await list.allRows();
      if (!all.complete) throw new Error(NOT_ON_SCREEN(`the list ran past ${all.pages} pages; counting stopped there`));
      if (!all.rows.length && !(await list.saysEmpty())) throw new Error(NOT_ON_SCREEN("the list showed neither rows nor an empty message"));
      const n = all.rows.length;
      if (a.count !== undefined && n !== Number(a.count)) throw new Error(`the round lists ${n} selected vendor(s) over ${all.pages} page(s) — the case expects ${Number(a.count)}`);
      if (a.atLeast !== undefined && n < Number(a.atLeast)) throw new Error(`the round lists ${n} selected vendor(s) — the case expects at least ${Number(a.atLeast)}`);
      if (a.grewBy !== undefined && memo?.countBefore !== null && memo?.countBefore !== undefined && n !== memo.countBefore + Number(a.grewBy)) {
        throw new Error(`the round lists ${n} selected vendor(s), ${memo.countBefore} before “${memo.vendor}” was added — the case expects ${memo.countBefore + Number(a.grewBy)} (${Number(a.grewBy)} more)`);
      }
      return `the round lists ${n} selected vendor(s) over ${all.pages} page(s)${n ? `: ${all.rows.slice(0, 5).map((r) => r.name).join(" | ")}` : ""}`;
    }

    case "select_participant": {
      const list = new ParticipantsPage(page);
      if (!(await list.ensureOpen())) throw new Error(NOT_ON_SCREEN("the Participants list is not on this screen (open_prepared participants or open_participants first)"));
      // Which vendors, the same switch as every other step (db/qaVendors.ts allowRealVendors):
      // by default the product's own vendors (Aanya, 8 Oct and 19 Oct 2026: "use the one really
      // used in the event"); with SPINE_QA_VENDORS_ONLY=1, this client's QA test vendors only.
      // Either way, selecting a vendor invites it, and the invitation mails its people.
      const qaOnly = !allowRealVendors();
      const qa = qaOnly ? await (x.qaNames ?? (() => qaVendorNames()))().catch(() => [] as string[]) : [];
      if (qaOnly && !qa.length) throw new Error(NOT_ON_SCREEN("this client's QA test vendors could not be read (database unreachable, or the client has none), so nobody was selected"));
      let vendor = String(a.vendor ?? "").trim();
      if (qaOnly && vendor && !isQaVendorName(vendor, qa)) {
        throw new Error(NOT_ON_SCREEN(`“${vendor}” is not one of this client's QA test vendors; with SPINE_QA_VENDORS_ONLY=1 select_participant adds QA vendors only (qa_…@example.com), so nobody was selected`));
      }
      // The round as it stands, before anything is added: who is on it, and how many.
      await list.showOnlySelected(true);
      await list.clearSearch();
      const before = await list.allRows(30);
      const countBefore = before.complete && (before.rows.length || (await list.saysEmpty())) ? before.rows.length : null;
      if (!vendor && qaOnly) {
        vendor = qa.find((q) => !before.rows.some((r) => isQaVendorName(r.name, [q]))) ?? "";
        if (!vendor) throw new Error(NOT_ON_SCREEN(`every QA vendor of this client (${qa.join(", ")}) is already on this round — there is none left to add`));
      }
      if (!(await list.showOnlySelected(false))) throw new Error(NOT_ON_SCREEN("the “Show only selected vendors” switch would not turn off, so vendors not yet on the round are hidden"));
      if (!vendor) {
        // The product's own audience: the first vendor on the full list who is not on the round yet.
        await list.clearSearch();
        const pick = (await list.allRows(5)).rows.find((r) => r.selected === false && r.name);
        if (!pick) throw new Error(NOT_ON_SCREEN("every vendor on the first pages of the list is already on this round — none left to add"));
        vendor = pick.name;
      }
      const rows = await list.searchFor(vendor);
      const row = list.rowFor(rows, vendor);
      if (!row) throw new Error(NOT_ON_SCREEN(`“${vendor}” did not show in the full vendor list after searching (it shows ${rows.slice(0, 5).map((r) => r.name).join(" | ") || "(empty)"})`));
      if (row.selected) {
        // Already on the round: a later grewBy:1 must not pass on a vendor this step did not add.
        added.set(page, { vendor: row.name || vendor, countBefore: null });
        return `“${row.name}” is already on this round — nothing to add`;
      }
      const r = await list.tick(row.name || vendor);
      if (r.refusal) throw new Error(`the app refused to add “${row.name}”: ${r.refusal}`);
      if (!r.selected) throw new Error(NOT_ON_SCREEN(`ticking “${row.name}” did not leave its box ticked within 10 s and the app said nothing`));
      added.set(page, { vendor: row.name || vendor, countBefore });
      return `selected “${row.name}” on this round (its box is now ticked; the round held ${countBefore ?? "an unknown number of"} vendor(s) before)`;
    }
  }
  return null;
}
