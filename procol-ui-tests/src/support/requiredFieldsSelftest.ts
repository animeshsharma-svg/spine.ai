/**
 * SELF-TEST for the mandatory-field sweep (requiredFields.ts) — no network, no Procol, one headless browser on local
 * HTML shaped like antd forms the way a client's create screen draws them: required labels, "*" labels, a red
 * has-error item, a select whose menu opens on click, a date picker, radios, a checkbox; plus fields the sweep must
 * leave alone (optional ones, Participants, the title, a disabled one) and a Payment Terms drawer named by a refusal.
 *
 *   npx tsx src/support/requiredFieldsSelftest.ts
 */
import { chromium } from "@playwright/test";
import { fillRequiredFields, fillWhatTheAppNamed } from "./requiredFields.js";

const item = (label: string, control: string, required = true, cls = "") =>
  `<div class="ant-form-item ${cls}"><div class="ant-form-item-label"><label class="${required ? "ant-form-item-required" : ""}">${label}</label></div><div class="ant-form-item-control">${control}</div></div>`;
const select = (id: string) =>
  `<div class="ant-select" id="${id}"><div class="ant-select-selection" onclick="openMenu('${id}')"><span class="ph">Select</span></div></div>`;

const PAGE = `<html><body>
<script>
  function openMenu(id) {
    const d = document.getElementById('menu');
    d.className = 'ant-select-dropdown'; d.dataset.for = id;
  }
  function pick(text) {
    const d = document.getElementById('menu'); const s = document.getElementById(d.dataset.for);
    s.querySelector('.ant-select-selection').innerHTML = '<div class="ant-select-selection-selected-value">' + text + '</div>';
    d.className = 'ant-select-dropdown ant-select-dropdown-hidden';
  }
  function openCal(el) { document.getElementById('cal').style.display = 'block'; window._cal = el; }
  function day(n) { window._cal.value = '2026-10-' + n; document.getElementById('cal').style.display = 'none'; }
  function openPay() { document.getElementById('pay').style.display = 'block'; }
</script>
<form>
${item("Cost Centre", `<input type="text" id="cost">`)}
${item("Budget (INR) *", `<input class="ant-input-number-input" id="budget">`, false)}
${item("Department", select("dept"))}
${item("Delivery date", `<span class="ant-calendar-picker"><input class="ant-calendar-picker-input" id="date" onclick="openCal(this)" readonly></span>`)}
${item("Mode", `<div class="ant-radio-group"><label class="ant-radio-wrapper" onclick="this.classList.add('ant-radio-wrapper-checked')">Lot</label><label class="ant-radio-wrapper">Line</label></div>`)}
${item("Accept T&C", `<label class="ant-checkbox-wrapper" onclick="this.classList.add('ant-checkbox-wrapper-checked')"><span class="ant-checkbox"></span>I agree</label>`)}
${item("Remarks", `<textarea id="rem"></textarea>`, false, "has-error")}
${item("Optional note", `<input type="text" id="opt">`, false)}
${item("Participants", `<input type="text" id="parts">`)}
${item("Event title", `<input type="text" id="title">`)}
${item("Already set", `<input type="text" id="set" value="kept">`)}
${item("Locked", `<input type="text" id="locked" disabled>`)}
<div><span>Plant code *</span><div><input type="text" id="plant"></div></div>
</form>
<div id="menu" class="ant-select-dropdown ant-select-dropdown-hidden">
  <li role="option" class="ant-select-dropdown-menu-item" onclick="pick('Purchase')">Purchase</li>
  <li role="option" class="ant-select-dropdown-menu-item" onclick="pick('Stores')">Stores</li>
</div>
<div id="cal" class="ant-calendar-picker-container" style="display:none"><table><tr>
  <td class="ant-calendar-cell ant-calendar-disabled-cell"><div class="ant-calendar-date">28</div></td>
  <td class="ant-calendar-cell ant-calendar-today ant-calendar-disabled-cell"><div class="ant-calendar-date">29</div></td>
  <td class="ant-calendar-cell"><div class="ant-calendar-date" onclick="day(30)">30</div></td>
</tr></table></div>
<button type="button" onclick="openPay()">Payment Terms</button>
<div id="pay" class="ant-drawer-open" style="display:none"><div class="ant-drawer-content">
  <div><input type="text" id="payDays" placeholder="Credit days"></div>
  <button type="button" onclick="document.getElementById('pay').dataset.saved='1'">Save</button>
</div></div>
</body></html>`;

let failed = 0;
const check = (name: string, ok: boolean, got: unknown) => {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}`}`);
  if (!ok) failed++;
};

const b = await chromium.launch();
const page = await b.newPage();
await page.setContent(PAGE);
const r = await fillRequiredFields(page);
const val = (id: string) => page.locator(`#${id}`).inputValue();
check("required text box filled", (await val("cost")) === "QA automation", await val("cost"));
check("a “*” label's number box gets a number", (await val("budget")) === "10", await val("budget"));
check("required dropdown gets its first option", (await page.locator("#dept").innerText()).includes("Purchase"), await page.locator("#dept").innerText());
check("date picks the first day the picker allows (today is disabled)", (await val("date")) === "2026-10-30", await val("date"));
check("required radio group gets a choice", (await page.locator(".ant-radio-wrapper-checked").count()) === 1, null);
check("required checkbox ticked", (await page.locator(".ant-checkbox-wrapper-checked").count()) === 1, null);
check("a red has-error item is filled", (await val("rem")) === "QA automation", await val("rem"));
check("Procol's own “Plant code *” label is found", (await val("plant")) === "QA automation", await val("plant"));
check("an optional field is left alone", (await val("opt")) === "", await val("opt"));
check("Participants is never filled by the sweep", (await val("parts")) === "", await val("parts"));
check("the title is never filled by the sweep", (await val("title")) === "", await val("title"));
check("a field already set is kept", (await val("set")) === "kept", await val("set"));
check("a disabled field is left", (await val("locked")) === "", await val("locked"));
check("nothing reported as left", r.left.length === 0, r.left);
check("eight fields reported filled", r.filled.length === 8, r.filled.map((f) => f.field));
const again = await fillRequiredFields(page);
check("a second sweep finds nothing to do", again.filled.length === 0 && again.left.length === 0, again);

const named = await fillWhatTheAppNamed(page, "Payment Terms and Conditions are mandatory");
check("the refusal's “Payment Terms” opens its drawer", named?.opened === "Payment Terms", named);
check("the drawer's empty “Credit days” box gets a number", (await val("payDays")) === "10", await val("payDays"));
check("the drawer is saved", (await page.locator("#pay").getAttribute("data-saved")) === "1", null);
check("a refusal naming nothing on screen opens nothing", (await fillWhatTheAppNamed(page, "Please select closing on mode for the event")) === null, null);

await b.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
