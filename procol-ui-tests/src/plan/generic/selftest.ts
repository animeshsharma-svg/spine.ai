/**
 * SELF-TEST for the generic steps — no network, no Procol, one headless
 * browser on local HTML. It proves the guards rather than the happy path:
 *
 *   - an absence check on a SLOW page does not pass while the page is loading
 *     (the thing it looks for arrives late → the check must FAIL);
 *   - an absence check on a page that never finishes loading FAILS as
 *     "could not tell";
 *   - a genuine absence on a ready page passes;
 *   - an attempt whose control is missing is "could not tell", never "blocked";
 *   - an attempt on an enabled control that does nothing is "allowed" (fail);
 *   - an attempt on a disabled control with a tooltip is "blocked" (pass);
 *   - every found element reports the strategy that found it.
 *
 *   npx tsx src/plan/generic/selftest.ts
 */
import { chromium, Page } from "@playwright/test";
import { EventsPage } from "../../pages/EventsPage.js";
import { runGenericStep, GenericCtx } from "./run.js";
import type { PlanStep } from "../steps.js";

const SLOW = `<html><body><div id="app"><div class="ant-spin ant-spin-spinning">Loading your event details...</div></div>
<script>setTimeout(()=>{document.getElementById('app').innerHTML='<h1>Participants</h1><button>Add Bid</button><button>Remove Bid</button>'},4000)</script></body></html>`;
const NEVER = `<html><body><div class="ant-spin ant-spin-spinning">Loading your event details...</div><p>shell</p><p>more text so the page is not empty</p></body></html>`;
const READY = `<html><body><h1>Participants</h1><button>Invite</button><table><tr role="row"><td>AMD LTD</td><td><button>Remove Bid</button></td></tr></table>
<label for="t">Title</label><input id="t" value="QA_Platform draft"/>
<label for="s">Range type</label><select id="s"><option>Rank</option><option>Price</option></select>
<label><input type="checkbox" id="c"/> Mark as Recurring Event</label>
<span class="wrap" style="display:inline-block;cursor:not-allowed"><button disabled id="items" style="pointer-events:none">Items 0</button></span>
<div role="tooltip" id="tip" style="display:none">Please choose a template and add a product</div>
<button id="noop">Save as draft</button>
<div class="footer"><div class="cell"><span>Schedule</span><div><button id="chip">Now - 03:27 pm (30 Mins)</button></div></div></div>
<script>
(()=>{const w=document.querySelector('.wrap');const show=()=>{document.getElementById('tip').style.display='block'};w.addEventListener('mouseenter',show);w.addEventListener('mouseover',show);})();
</script></body></html>`;

interface Case {
  name: string;
  html: string;
  step: PlanStep;
  expect: "pass" | "fail";
  /** The failure text must contain this (for fail cases). */
  because?: string;
}

const CASES: Case[] = [
  { name: "absence on a slow page does NOT pass (element arrives after loading)", html: SLOW, step: { step: "expect_count", args: { role: "button", name: "Add Bid", count: 0 } }, expect: "fail", because: "IS on screen" },
  { name: "absence on a never-ready page is 'could not tell'", html: NEVER, step: { step: "expect_visible", args: { role: "button", name: "Add Bid", visible: false, readyMs: 4000 } }, expect: "fail", because: "could not tell" },
  { name: "a role-prefixed string target is parsed (button Add Bid → role+name) and still catches the late element", html: SLOW, step: { step: "expect_count", args: { target: "button Add Bid", count: 0 } }, expect: "fail", because: "IS on screen" },
  { name: "a role-prefixed string target finds the element", html: READY, step: { step: "expect_visible", args: { target: 'button "Invite"' } }, expect: "pass" },
  { name: "genuine absence on a ready page passes", html: READY, step: { step: "expect_count", args: { role: "button", name: "Add Bid", count: 0 } }, expect: "pass" },
  { name: "presence records the strategy", html: READY, step: { step: "expect_visible", args: { role: "button", name: "Invite" } }, expect: "pass" },
  { name: "expect_text absent passes only after ready", html: READY, step: { step: "expect_text", args: { text: "No vendors to show", present: false } }, expect: "pass" },
  { name: "count within a row", html: READY, step: { step: "expect_count", args: { role: "button", name: "Remove Bid", within: "AMD LTD", count: 1 } }, expect: "pass" },
  { name: "fill by label", html: READY, step: { step: "fill", args: { label: "Title", value: "QA_Platform renamed" } }, expect: "pass" },
  { name: "select by label (native)", html: READY, step: { step: "select", args: { label: "Range type", option: "Price" } }, expect: "pass" },
  { name: "toggle a checkbox on", html: READY, step: { step: "toggle", args: { label: "Mark as Recurring Event", on: true } }, expect: "pass" },
  { name: "expect_value reads the field", html: READY, step: { step: "expect_value", args: { label: "Title", value: "QA_Platform draft" } }, expect: "pass" },
  { name: "expect_value catches a wrong value", html: READY, step: { step: "expect_value", args: { label: "Title", value: "Something else" } }, expect: "fail", because: "the case expects" },
  { name: "click on a disabled control fails (not an attempt)", html: READY, step: { step: "click", args: { role: "button", name: "Items" } }, expect: "fail", because: "DISABLED" },
  { name: "attempt on a disabled control with tooltip = blocked", html: READY, step: { step: "attempt", args: { step: "click", args: { role: "button", name: "Items" }, because: "choose a template" } }, expect: "pass" },
  { name: "attempt on a MISSING control = could not tell", html: READY, step: { step: "attempt", args: { step: "click", args: { role: "button", name: "Publish" } } }, expect: "fail", because: "could not tell" },
  { name: "attempt on an enabled no-op control = allowed (fail)", html: READY, step: { step: "attempt", args: { step: "click", args: { role: "button", name: "Save as draft" } } }, expect: "fail", because: "allowed" },
  { name: "a text label beside its control resolves to the control", html: READY, step: { step: "click", args: { text: "Schedule" } }, expect: "pass" },
  { name: "tooltip message on hover", html: READY, step: { step: "expect_message", args: { kind: "tooltip", on: "Items", text: "add a product" } }, expect: "pass" },
  { name: "a missing text is a failure, not a pass", html: READY, step: { step: "expect_text", args: { text: "Please add participants to proceed!", timeoutMs: 2000 } }, expect: "fail", because: "not on screen" },
];

async function run(page: Page, c: Case) {
  // A fresh document per case (setContent keeps the old global scope, so a
  // re-declared const in a page script would silently not run).
  await page.goto("about:blank");
  await page.setContent(c.html);
  const ctx: GenericCtx = { page, events: new EventsPage(page), title: "QA_Platform_selftest", memory: {}, prevMark: 0 };
  const started = Date.now();
  try {
    const out = await runGenericStep(ctx, c.step, async (inner) => {
      const r = await runGenericStep(ctx, inner, async () => undefined);
      return r?.detail;
    });
    return { ok: true, text: `${out?.detail}${out?.strategy ? `  [strategy: ${out.strategy}]` : ""}`, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, text: (e as Error).message.split("\n")[0], ms: Date.now() - started };
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let bad = 0;
for (const c of CASES) {
  const r = await run(page, c);
  const good = c.expect === "pass" ? r.ok : !r.ok && (!c.because || r.text.includes(c.because));
  if (!good) bad++;
  console.log(`${good ? "OK  " : "BAD "} ${c.name}\n      ${r.ok ? "passed" : "failed"} in ${r.ms}ms: ${r.text}`);
}
await browser.close();
console.log(`\n${CASES.length - bad}/${CASES.length} guard checks behave as intended`);
process.exit(bad ? 1 : 0);
