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

/** Any web site, not Procol: covered controls, named controls, invisible characters, frames, named regions, dialogs, long lists. */
const WEB = `<html><body>
<div class="row">
  <div><button style="pointer-events:none;opacity:.5">Delete</button></div>
  <div style="position:relative;width:110px;height:44px;overflow:hidden"><button style="position:absolute;left:12px;top:4px;z-index:1">Delete</button><div style="position:absolute;inset:0;z-index:2;background:#eee;opacity:.92"></div></div>
  <button onclick="document.getElementById('r').textContent='Deleted the third'">Delete</button>
</div>
<div role="dialog" aria-label="Choose stay dates"><button aria-label="12 December 2026" onclick="document.getElementById('r').textContent='Picked 12 December 2026'">12</button></div>
<p>Confir&shy;mation sent to your in&#8288;box</p>
<form><button type="button" onclick="document.getElementById('r').textContent='Logged in'">Log in</button></form>
<fieldset><legend>Ship from</legend><button type="button" onclick="document.getElementById('r').textContent='from'">Select a country ▾</button></fieldset>
<fieldset><legend>Ship to</legend><button type="button" onclick="document.getElementById('r').textContent='to'">Select a country ▾</button></fieldset>
<select aria-label="Search in department"><option>All Departments</option></select>
<input aria-label="Search Vastora" placeholder="Search Vastora"/>
<button type="button" onclick="document.getElementById('r').textContent=confirm('Cancel your booking?')?'Booking cancelled':'Kept'">Cancel booking</button>
<div id="list" style="height:120px;overflow:auto"><div style="height:2000px">tall</div><button onclick="document.getElementById('r').textContent='Opened item 37'">Open item 37</button></div>
<iframe srcdoc="<button onclick=&quot;parent.document.getElementById('r').textContent='Subscribed in frame'&quot;>Subscribe</button>"></iframe>
<label for="dd">Delivery date</label><input id="dd" placeholder="DD/MM/YY"/>
<p id="r" role="status"></p>
</body></html>`;

/** Pickers, hidden inputs, covers and expansion rows — the shapes real sites use. */
const FORMS = `<html><body>
<label for="ci">Check-in</label><input id="ci" readonly placeholder="Add date" aria-haspopup="dialog" onclick="document.getElementById('cal').hidden=false"/>
<div id="cal" role="dialog" aria-label="Choose dates" hidden>
  <button type="button" aria-label="Previous month" onclick="turn(-1)">‹</button><button type="button" aria-label="Next month" onclick="turn(1)">›</button>
  <div role="group" id="mon"></div>
</div>
<script>
  var m0 = 10, y0 = 2026, names=["January","February","March","April","May","June","July","August","September","October","November","December"];
  function draw(){ var g=document.getElementById('mon'); g.setAttribute('aria-label', names[m0]+' '+y0); g.innerHTML=''; var cap=document.createElement('div'); cap.textContent=names[m0]+' '+y0; g.appendChild(cap);
    for(var d=1; d<=28; d++){ var b=document.createElement('button'); b.type='button'; b.setAttribute('aria-label', d+' '+names[m0]+' '+y0); b.textContent=d; b.onclick=function(){ document.getElementById('r').textContent='Picked '+this.getAttribute('aria-label'); }; g.appendChild(b); } }
  function turn(n){ m0+=n; if(m0>11){m0=0;y0++} if(m0<0){m0=11;y0--} draw(); }
  draw();
</script>
<label for="hr">hour</label><input id="hr" role="spinbutton" readonly value="12" aria-valuenow="12" onkeydown="if(event.key==='ArrowUp'){this.value=+this.value%12+1;this.setAttribute('aria-valuenow',this.value)} if(event.key==='ArrowDown'){this.value=(+this.value+10)%12+1;this.setAttribute('aria-valuenow',this.value)}"/>
<fieldset><legend>Finish</legend>
  <label><input type="radio" name="fin" value="black" style="position:absolute;opacity:0;width:0;height:0" onchange="document.getElementById('r').textContent='Finish: Black'"/><span>Black</span></label>
  <label><input type="radio" name="fin" value="white" style="position:absolute;opacity:0;width:0;height:0"/><span>White</span></label>
</fieldset>
<div><label for="qty">Quantity</label> <select id="qty"><option>1</option><option>2</option></select></div>
<div><span>Colour</span> <div role="radiogroup" aria-label="Colour"><button type="button" role="radio" aria-checked="false" onclick="document.getElementById('r').textContent='Colour: Midnight'">Midnight</button><button type="button" role="radio" aria-checked="false">Sand</button></div></div>
<form role="search"><input placeholder="Search Vastora" aria-label="Search Vastora"/></form>
<div style="position:relative;height:60px"><button type="button" onclick="document.getElementById('r').textContent='Searched shelters'">Search shelters</button>
  <div role="dialog" aria-label="Adoption alerts" style="position:absolute;inset:0;background:#fff"><p>Get adoption alerts</p><button type="button" onclick="this.parentElement.remove()">No thanks</button></div></div>
<ul class="results">
  <li class="card"><span class="spons">Sponsored</span> <a href="#a" onclick="document.getElementById('r').textContent='Opened sponsored'">Aero</a> <b>$39.00</b></li>
  <li class="card"><a href="#b" onclick="document.getElementById('r').textContent='Opened Trail'">Trail</a> <b>$59.00</b></li>
  <li class="card"><a href="#c" onclick="document.getElementById('r').textContent='Opened Road'">Road</a> <b>$44.50</b></li>
</ul>
<div class="packs"><div class="pack">Alkaline AAA 20-count <b>$0.30/count</b> <button type="button">Add to cart</button></div><div class="pack">Alkaline AA 8-count <b>$0.52/count</b> <button type="button" onclick="document.getElementById('r').textContent='Added 8'">Add to cart</button></div><div class="pack">20-count <b>$0.41/count</b> <button type="button" onclick="document.getElementById('r').textContent='Added 20'">Add to cart</button></div></div>
<table><tr><td>Harbor Books</td><td><button onclick="document.getElementById('x').hidden=false">Show details</button></td></tr><tr id="x"><td colspan="2">Tracking code: TRK-1</td></tr></table>
<p id="r" role="status"></p>
</body></html>`;

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
  // Any web site, not only Procol.
  { name: "a covered or inert match is skipped for the next one", html: WEB, step: { step: "click", args: { role: "button", name: "Delete" } }, expect: "pass", because: "match 3" },
  { name: "words with no role find a control by its accessible name", html: WEB, step: { step: "click", args: { text: "12 December 2026" } }, expect: "pass" },
  { name: "text with soft hyphens and word joiners is still found", html: WEB, step: { step: "expect_text", args: { text: "Confirmation sent to your inbox" } }, expect: "pass" },
  { name: "\"Login\" finds \"Log in\"", html: WEB, step: { step: "click", args: { role: "button", name: "Login" } }, expect: "pass" },
  { name: "within a named group (fieldset legend)", html: WEB, step: { step: "click", args: { role: "button", name: "Select a country", within: "Ship to" } }, expect: "pass", because: "Ship to" },
  { name: "fill skips a select whose label shares the words and types into the input", html: WEB, step: { step: "fill", args: { label: "Search", value: "lamps" } }, expect: "pass", because: "lamps" },
  { name: "a control inside an iframe is found", html: WEB, step: { step: "click", args: { role: "button", name: "Subscribe" } }, expect: "pass", because: "frame" },
  { name: "scroll_to reaches a control far down a scrollable list", html: WEB, step: { step: "scroll_to", args: { role: "button", name: "Open item 37", timeoutMs: 10000 } }, expect: "pass" },
  { name: "an armed dialog is accepted and reported", html: WEB, step: { step: "dialog", args: { action: "accept" } }, expect: "pass" },
  { name: "a date in words is written in the field's stated format", html: WEB, step: { step: "fill", args: { label: "Delivery date", value: "March 5, 2027" } }, expect: "pass", because: "05/03/27" },
  { name: "pick_date opens the picker and turns the months to the day", html: FORMS, step: { step: "pick_date", args: { label: "Check-in", date: "14 February 2027" } }, expect: "pass", because: "turning 3 month" },
  { name: "a read-only spinner is stepped to the value", html: FORMS, step: { step: "fill", args: { label: "hour", value: "2" } }, expect: "pass", because: "set to 2" },
  { name: "select picks a hidden radio in a group through its label", html: FORMS, step: { step: "select", args: { label: "Finish", option: "Black" } }, expect: "pass", because: "in its group" },
  { name: "select picks a swatch (role radio button) under the words", html: FORMS, step: { step: "select", args: { label: "Colour", option: "Midnight" } }, expect: "pass", because: "in its group" },
  { name: "the words of a label do not reach a sibling field", html: FORMS, step: { step: "fill", args: { label: "Quantity", value: "2" } }, expect: "pass", because: 'set to "2"' },
  { name: "\"the search box\" finds the page's search field", html: FORMS, step: { step: "fill", args: { label: "search box", value: "lamps" } }, expect: "pass", because: "lamps" },
  { name: "a covered control is clicked after closing the pop-up over it", html: FORMS, step: { step: "click", args: { role: "button", name: "Search shelters" } }, expect: "pass", because: "No thanks" },
  { name: "within a row includes the details row it expands into", html: FORMS, step: { step: "expect_text", args: { text: "Tracking code", within: "Harbor Books", timeoutMs: 3000 } }, expect: "pass" },
  { name: "choose_by_number: the cheapest result that is not Sponsored", html: FORMS, step: { step: "choose_by_number", args: { by: "lowest", measure: "price", exclude: "Sponsored", role: "link" } }, expect: "pass", because: "44.5" },
  { name: "choose_by_number: the cheapest unit price by a regex measure, among the AA packs only", html: FORMS, step: { step: "choose_by_number", args: { by: "lowest", measure: "\\$([\\d.]+)/count", only: "Alkaline AA", role: "button", name: "Add to cart" } }, expect: "pass", because: "0.41" },
];

async function run(page: Page, c: Case) {
  // A fresh document per case (setContent keeps the old global scope, so a
  // re-declared const in a page script would silently not run).
  await page.goto("about:blank");
  await page.setContent(c.html);
  const ctx: GenericCtx = { page, events: new EventsPage(page), title: "QA_Platform_selftest", memory: {}, prevMark: 0, downloads: [] };
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
