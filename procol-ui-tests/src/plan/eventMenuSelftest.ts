/**
 * SELF-TEST for the buyer's Responses check (expect_responses) — no network, no Procol, one headless browser
 * on local HTML shaped like the recorded screen (27 Oct, RFX-19308 Responses: a column per vendor, a level-2
 * heading with its name, "Surrogate Bid" on the ones the buyer entered, and "Participation : x / y").
 *
 *   npx tsx src/plan/eventMenuSelftest.ts
 */
import { chromium } from "@playwright/test";
import { runEventMenuStep, type EventMenuState } from "./eventMenuSteps.js";
import type { PlanStep } from "./steps.js";

function responses(cols: Array<{ vendor: string; surrogate: boolean }>, participation: string | null, stage = "RFQ"): string {
  return `<html><body>
<div role="tablist"><div role="tab" aria-selected="false">Project Details</div><div role="tab" aria-selected="true">${stage}</div><div role="tab" aria-selected="false">Master QCS</div></div>
<div role="tablist"><button data-testid="event-settings-button">Settings</button>
<div role="tab" aria-selected="true">Responses</div><div role="tab" aria-selected="false">Participants</div></div>
${participation ? `<span>Participation :</span><button>${participation}</button>` : ""}
${cols.length ? `<div role="grid"><div role="row"><div role="columnheader"></div>${cols
    .map((c) => `<div role="columnheader"><h2>${c.vendor}</h2><p>27 October 2026 04:17 AM ${c.surrogate ? "<button>Surrogate Bid</button>" : ""}</p></div>`)
    .join("")}</div></div>` : "<p>No responses yet</p>"}
</body></html>`;
}

const MIXED = responses([{ vendor: "PROCOL TECH PRIVATE LIMITED", surrogate: false }, { vendor: "samplevendor@vendortestt.co", surrogate: true }], "2 / 3 66%");
const NONE = responses([], "0 / 2 0%");

interface Case { name: string; html: string; step: PlanStep; expect: "pass" | "failed"; says?: string }
const CASES: Case[] = [
  { name: "one from the portal, one surrogate, 2 of 3 took part", html: MIXED, step: { step: "expect_responses", args: { count: 2, surrogate: 1, direct: 1, participation: "2/3" } }, expect: "pass", says: "from the vendor portal" },
  { name: "the portal vendor is named", html: MIXED, step: { step: "expect_responses", args: { vendors: ["PROCOL TECH"] } }, expect: "pass" },
  { name: "two surrogate where one is FAILS", html: MIXED, step: { step: "expect_responses", args: { surrogate: 2 } }, expect: "failed", says: "1 marked" },
  { name: "a wrong participation FAILS", html: MIXED, step: { step: "expect_responses", args: { participation: "2/2" } }, expect: "failed", says: "participation 2/3" },
  { name: "a vendor with no column FAILS", html: MIXED, step: { step: "expect_responses", args: { vendors: ["Acme Steel"] } }, expect: "failed", says: "no response from" },
  { name: "no responses where one is expected FAILS", html: NONE, step: { step: "expect_responses", args: { atLeast: 1 } }, expect: "failed", says: "0 response" },
  { name: "no responses, asked for none, passes", html: NONE, step: { step: "expect_responses", args: { count: 0 } }, expect: "pass", says: "No responses yet" },
  { name: "a live stage (no tags) with no records to read is COULD NOT TELL, never a guess", html: responses([{ vendor: "samplevendor@vendortestt.co", surrogate: false }], "1 / 2 50%"), step: { step: "expect_responses", args: { surrogate: 1 } }, expect: "failed", says: "couldn't tell" },
  { name: "participation reads 1/2 from \"1 / 2 50%\", not 1/250", html: responses([{ vendor: "samplevendor@vendortestt.co", surrogate: false }], "1 / 2 <span>50%</span>"), step: { step: "expect_responses", args: { participation: "1/2" } }, expect: "pass", says: "participation 1/2" },
  { name: "a technical stage reads the same", html: responses([{ vendor: "PROCOL TECH PRIVATE LIMITED", surrogate: true }], "1 / 1 100%", "Technical Stage"), step: { step: "expect_responses", args: { stage: "rfp", surrogate: 1 } }, expect: "pass", says: "Technical Stage Responses" },
];

const browser = await chromium.launch({ headless: true });
let bad = 0;
for (const c of CASES) {
  const page = await (await browser.newContext()).newPage();
  await page.setContent(c.html);
  const state: EventMenuState = {};
  let got: "pass" | "failed";
  let detail = "";
  try {
    detail = (await runEventMenuStep({ page, state }, c.step)) ?? "(not handled)";
    got = "pass";
  } catch (e) {
    detail = (e as Error).message;
    got = "failed";
  }
  const ok = got === c.expect && (!c.says || detail.toLowerCase().includes(c.says.toLowerCase()));
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${c.name}\n    ${got}${got === c.expect ? "" : ` (expected ${c.expect})`} — ${detail.slice(0, 220)}`);
  await page.context().close();
}
await browser.close();
console.log(`\n${CASES.length - bad}/${CASES.length} as expected`);
process.exitCode = bad ? 1 : 0;
