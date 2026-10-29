import type { Page } from "@playwright/test";
import type { PlanStep } from "./steps.js";
import { EventActionsPage } from "../pages/EventActionsPage.js";
import { responsesOf, withdrawalOf } from "../db/pickEvent.js";
import { decodeProcolId } from "../crosscheck/ids.js";

/**
 * THE EVENT MENUS AS STEPS (Aanya, 27 Oct: withdraw "at any phase of time", Add Price Cap, and "if anything
 * from these options is asked by user remember to open this and perform the activity"). Where each item
 * lives is in pages/EventActionsPage.ts. A refusal the case expects comes back as "blocked: …", the same
 * words the rest of the runner uses for an app's refusal.
 */
export const EVENT_MENU_STEPS = new Set(["event_menu", "expect_menu_item", "withdraw_event", "expect_withdrawn", "extend_submission_time", "add_price_cap", "expect_price_cap", "expect_responses"]);

export interface EventMenuState {
  withdrawn?: "project" | "stage";
  /** the project the withdrawal was made on (a stage withdrawal leaves for the Events list) */
  projectUuid?: string;
  priceCaps?: Array<{ vendor: string; price: number }>;
}

const asNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export async function runEventMenuStep(x: { page: Page; state: EventMenuState }, step: PlanStep): Promise<string | null> {
  if (!EVENT_MENU_STEPS.has(step.step)) return null;
  const a = (step.args ?? {}) as Record<string, unknown>;
  const ev = new EventActionsPage(x.page);
  const stage = a.stage ? String(a.stage) : undefined;
  switch (step.step) {
    case "event_menu": {
      const item = String(a.item ?? "").trim();
      if (!item) throw new Error('event_menu needs the "item" to choose (e.g. "Order Activity", "Shared With")');
      const r = await ev.choose(item, stage);
      if (a.close === true) await ev.closeOverlay();
      return `${r.menu === "project" ? "⋮" : "Settings"} → ${r.item}${r.opened ? ` opened “${r.opened}”` : ""}${a.close === true ? " (closed again)" : ""}`;
    }
    case "expect_menu_item": {
      const item = String(a.item ?? "").trim();
      if (!item) throw new Error('expect_menu_item needs the "item"');
      const which = EventActionsPage.menuFor(item);
      const items = await ev.listMenu(which, stage);
      const found = items.find((i) => i.text.toLowerCase() === item.toLowerCase()) ?? items.find((i) => i.text.toLowerCase().includes(item.toLowerCase()));
      const where = which === "project" ? "the project's ⋮ menu" : "the stage's Settings menu";
      const offered = items.map((i) => i.text + (i.disabled ? " (greyed out)" : "")).join(", ");
      if (a.present === false) {
        if (found) throw new Error(`${where} offers “${found.text}” — the case expects it gone (it offers: ${offered})`);
        return `blocked: ${where} does not offer “${item}” (it offers: ${offered || "nothing"})`;
      }
      if (!found) throw new Error(`${where} has no “${item}” (it offers: ${offered || "nothing"})`);
      if (a.enabled === false) {
        if (!found.disabled) throw new Error(`“${found.text}” is offered and enabled in ${where} — the case expects it greyed out`);
        return `blocked: “${found.text}” is greyed out in ${where}`;
      }
      if (found.disabled) throw new Error(`“${found.text}” is greyed out in ${where} — the case expects it available`);
      return `“${found.text}” is offered in ${where}`;
    }
    case "withdraw_event": {
      const scope = /stage|round|rfq|rfp|auction|technical/i.test(String(a.scope ?? "")) ? "stage" : "project";
      const reason = a.noReason === true || a.reason === "" ? null : String(a.reason ?? "Withdrawn by the spine.ai test");
      x.state.projectUuid = x.page.url().match(/\/project\/([^/?#]+)/)?.[1] ?? x.state.projectUuid;
      const done = await ev.withdraw(scope, reason, stage);
      if (!done.startsWith("blocked:")) x.state.withdrawn = scope;
      return done;
    }
    case "expect_withdrawn": {
      // Procol's own rows decide; the page's word is shown beside them. A stage withdrawal sends the
      // browser to the Events list (27 Oct, WD03), where there is no event page to read.
      const uuid = x.state.projectUuid ?? x.page.url().match(/\/project\/([^/?#]+)/)?.[1];
      const eg = uuid ? decodeProcolId(uuid) : null;
      const rows = eg ? await withdrawalOf(eg) : null;
      const onPage = /\/project\//.test(x.page.url()) ? await ev.withdrawnSign() : "";
      if (rows) {
        const stageGone = rows.stages.filter((st) => st.status === 0).length;
        const projectGone = rows.eventStatus === 3;
        const words = `${projectGone ? "the project is withdrawn (status 3)" : `the project is ${rows.eventStatus === 1 ? "live" : `status ${rows.eventStatus}`}`}; ${stageGone}/${rows.stages.length} stage(s) withdrawn`;
        const want = x.state.withdrawn ?? "project";
        if ((want === "project" && !projectGone) || (want === "stage" && !stageGone && !projectGone)) throw new Error(`Procol's records do not show the ${want} withdrawn: ${words}`);
        return `Procol's records: ${words}${onPage ? `; the page says “${onPage}”` : ""}`;
      }
      if (!onPage) throw new Error(`the event's page shows no “Withdrawn” after ${x.state.withdrawn ? `withdrawing the ${x.state.withdrawn}` : "the withdrawal"}, and the database could not be read`);
      return `the event's page says “${onPage}”`;
    }
    case "extend_submission_time": {
      return ev.extendSubmissionTime(String(a.by ?? a.option ?? "15 minutes"), stage);
    }
    case "add_price_cap": {
      const price = a.noPrice === true ? null : asNumber(a.price ?? a.cap ?? 100);
      const vendor = a.vendor ? String(a.vendor) : undefined;
      const done = await ev.addPriceCap(vendor, price);
      if (!done.startsWith("blocked:") && price !== null) (x.state.priceCaps ??= []).push({ vendor: vendor ?? done.replace(/^.*set for (.+?) on .*$/, "$1"), price });
      return done;
    }
    case "expect_price_cap": {
      // With no price named, the cap this plan's add_price_cap saved last.
      const last = x.state.priceCaps?.at(-1);
      const want = asNumber(a.price ?? a.cap ?? last?.price);
      if (want === null) throw new Error("expect_price_cap needs the price to read back (or an add_price_cap earlier in the plan)");
      const vendor = a.vendor ? String(a.vendor) : undefined;
      const { forWho, caps } = await ev.readPriceCap(vendor);
      if (!caps.length) throw new Error(`“Edit Price Cap for ${forWho}” shows no Price cap cells to read`);
      const wrong = caps.filter((c) => asNumber(c) !== want);
      if (wrong.length) throw new Error(`the saved price cap for ${forWho} reads ${caps.map((c) => c || "(empty)").join(", ")} — the case expects ${want}`);
      return `the saved price cap for ${forWho} reads ${want} on ${caps.length} product(s) (Edit Price Cap, closed without saving)`;
    }
    case "expect_responses": {
      // The buyer's side of vendor bidding (Aanya, 27 Oct: "vendor can submit the responses then buyer can see it").
      const r = await ev.readResponses(stage);
      // A live stage shows no "Surrogate Bid" tag: who placed each response comes from Procol's records then
      // (the event's creator = a surrogate response; the vendor's own user = the vendor portal).
      let fromRecords = false;
      if (r.columns.some((c) => c.surrogate === null)) {
        const uuid = x.page.url().match(/\/project\/([^/?#]+)/)?.[1];
        const eg = uuid ? decodeProcolId(uuid) : null;
        const mode = /technical|rfp/i.test(r.tab) ? 5 : /auction/i.test(r.tab) ? 0 : 1;
        const rows = (eg ? await responsesOf(eg) : null)?.filter((row) => row.mode === mode) ?? null;
        if (rows) {
          fromRecords = true;
          for (const c of r.columns) {
            if (c.surrogate !== null) continue;
            const hit = rows.filter((row) => row.vendor.toLowerCase() === c.vendor.toLowerCase() || row.vendor.toLowerCase().startsWith(c.vendor.toLowerCase().replace(/[.…]+$/, "")));
            if (hit.length) c.surrogate = hit.some((row) => row.surrogate);
          }
        }
      }
      const how = (c: { surrogate: boolean | null }) => (c.surrogate === true ? "surrogate" : c.surrogate === false ? "from the vendor portal" : "who placed it unknown");
      const list = r.columns.map((c) => `${c.vendor} (${how(c)})`).join(" | ");
      const seen = `${r.tab} Responses: ${list || r.empty || "no vendor columns"}${r.participation ? ` — participation ${r.participation.done}/${r.participation.of}` : ""}${fromRecords ? " (surrogate or not: Procol's records)" : ""}`;
      const problems: string[] = [];
      const n = r.columns.length;
      const sur = r.columns.filter((c) => c.surrogate === true).length;
      if ((a.surrogate !== undefined || a.direct !== undefined) && r.columns.some((c) => c.surrogate === null)) {
        throw new Error(`couldn't tell which responses are surrogate: the page shows no “Surrogate Bid” tag and Procol's records could not be read — ${seen}`);
      }
      if (a.count !== undefined && n !== asNumber(a.count)) problems.push(`${n} response(s), the case expects ${a.count}`);
      if (a.atLeast !== undefined && n < (asNumber(a.atLeast) ?? 0)) problems.push(`${n} response(s), the case expects at least ${a.atLeast}`);
      if (a.surrogate !== undefined && sur !== asNumber(a.surrogate)) problems.push(`${sur} marked “Surrogate Bid”, the case expects ${a.surrogate}`);
      if (a.direct !== undefined && n - sur !== asNumber(a.direct)) problems.push(`${n - sur} from the vendor portal (no “Surrogate Bid” tag), the case expects ${a.direct}`);
      for (const v of (Array.isArray(a.vendors) ? a.vendors : a.vendors ? [a.vendors] : []).map(String)) {
        if (!r.columns.some((c) => c.vendor.toLowerCase().includes(v.toLowerCase()) || v.toLowerCase().includes(c.vendor.toLowerCase()))) problems.push(`no response from “${v}”`);
      }
      if (a.participation !== undefined) {
        const want = String(a.participation).match(/(\d+)\s*\/\s*(\d+)/);
        const got = r.participation;
        if (!got) problems.push("the page shows no “Participation : x / y”");
        else if (want && (Number(want[1]) !== got.done || Number(want[2]) !== got.of)) problems.push(`participation ${got.done}/${got.of}, the case expects ${want[1]}/${want[2]}`);
      }
      if (!n && a.count === undefined && a.atLeast === undefined && !problems.length) problems.push("no vendor has responded on this stage");
      if (problems.length) throw new Error(`${problems.join("; ")} — ${seen}`);
      return seen;
    }
  }
  return null;
}
