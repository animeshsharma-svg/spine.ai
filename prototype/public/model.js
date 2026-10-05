/**
 * PRODUCT KNOWLEDGE (Phase 1) + the TEMPLATE CHOOSER and FIELD VIEWER.
 *
 *   #/product                         this client: findings, units, vendors, settings, what changed
 *   #/product/templates[/<type>]      pick a stage type → the templates this client is offered
 *   #/product/template/<type>/<uuid>  one template's fields and rules
 *   #/product/anatomy                 how a sourcing event works (sections, allowed combinations)
 *   #/product/ask                     ask a question about the product
 *
 * Everything here reads spine.ai's product model (/api/product-model/*) and
 * calls nothing on Procol — except "Check this template", which runs the
 * Phase 2 template check (/api/template-check/*) and creates test records on UAT. Loaded after app.js; uses CaseView for closed Details.
 */
(function () {
  const CV = window.CaseView;
  const esc = CV.esc;
  const q = (s) => document.querySelector(s);
  const root = () => q("#pm-root");

  const TABS = [
    ["client", "This client"],
    ["templates", "Templates"],
    ["anatomy", "How events work"],
    ["ask", "Ask about the product"],
  ];
  const STAGE_TYPES = [
    ["rfq", "RFQ"],
    ["rfp", "Technical (RFP)"],
    ["auction", "Auction"],
    ["boq", "BOQ"],
  ];
  const STAGE_WORD = { rfq: "price quote (RFQ)", rfp: "technical (RFP)", auction: "auction", rfq_then_auction: "RFQ turned into an auction", boq: "BOQ" };

  function clientId() {
    const n = Number(q("#client")?.value);
    if (n > 0) return n;
    try {
      return typeof currentClient === "number" && currentClient ? currentClient : 198678;
    } catch {
      return 198678;
    }
  }

  const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
  const words = (k) => String(k).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");

  async function getJson(url) {
    const r = await fetch(url);
    let j = {};
    try {
      j = await r.json();
    } catch {
      /* not JSON */
    }
    if (!r.ok || j.error) {
      const e = new Error(j.error || `HTTP ${r.status}`);
      e.hint = j.hint;
      throw e;
    }
    return j;
  }

  function errorHtml(e, what) {
    return `<div class="sx-banner bad"><b>Could not load ${esc(what)}:</b> ${esc(e.message)}${e.hint ? `<div class="sx-sub">To build it: <code class="cv-code">${esc(e.hint)}</code></div>` : ""}</div>`;
  }

  function parse() {
    const m = location.hash.match(/^#\/product(?:\/(.*))?$/);
    if (!m) return null;
    const parts = (m[1] || "").split("/").filter(Boolean).map(decodeURIComponent);
    return parts;
  }

  function route() {
    const parts = parse();
    if (!parts) return;
    const box = root();
    if (!box) return;
    const tab = parts[0] === "template" ? "templates" : parts[0] || "client";
    box.innerHTML =
      `<div class="sx-tabs">${TABS.map(([id, label]) => `<a class="chip${id === tab ? " active" : ""}" href="#/product${id === "client" ? "" : `/${id}`}">${esc(label)}</a>`).join("")}</div>` +
      `<div id="pm-body"><div class="loading">Loading…</div></div>`;
    const body = q("#pm-body");
    if (parts[0] === "template") showTemplate(body, parts[1] || "rfq", parts[2] || "");
    else if (tab === "templates") showTemplates(body, parts[1] || "rfq");
    else if (tab === "anatomy") showAnatomy(body);
    else if (tab === "ask") showAsk(body);
    else showClient(body);
  }

  // ── this client ───────────────────────────────────────────────────────
  async function showClient(body) {
    const c = clientId();
    try {
      const m = await getJson(`/api/product-model/client?c=${c}`);
      const s = m.summary || {};
      const stat = (n, label) => (n == null ? "" : `<div class="sx-stat"><b>${esc(Number(n).toLocaleString())}</b><span>${esc(label)}</span></div>`);
      const findings = (m.findings || [])
        .map(
          (f) =>
            `<div class="sx-banner ${f.severity === "defect" ? "bad" : "warn"}"><b>${f.severity === "defect" ? "Defect" : "Risk"}:</b> ${esc(f.plain)}` +
            CV.detailsHtml([{ label: "Details", value: JSON.stringify(f.details || {}, null, 2), kind: "block" }]) +
            `</div>`,
        )
        .join("");
      const u = m.units || {};
      const v = m.vendors || {};
      const statusWords = (st) => words(st).replace("in active", "inactive");
      const unusable = (u.unusableProductUnits || [])
        .map((x) => `<li>${esc(x.unitName || x.symbol)} — ${esc(x.products)} product(s) linked to it, e.g. ${esc((x.sample || []).join(", "))}</li>`)
        .join("");
      body.innerHTML =
        `<div class="sx-card"><div class="sx-row"><h3 class="sx-h3 sx-grow">${esc(m.client?.name || "")} <span class="sx-muted">company ${esc(m.client?.id)}</span></h3>` +
        `<span class="sx-sub">data as of ${esc(when(m.fetchedAt))}</span></div>` +
        `<div class="sx-stats">${stat(s.templatesThatOpen, `templates that open (of ${s.templates ?? "?"})`)}${stat(s.units, "units it can use")}${stat(s.invitableVendors, "vendors it can invite")}${stat(s.products, "active products")}${stat(s.locations, "delivery locations")}${stat(s.fields, "template fields")}${stat(s.rules, "field rules")}</div></div>` +
        (findings ? `<div class="col-head" style="margin-top:14px"><h2>What looks wrong</h2><span class="hint">found while reading this client's setup</span></div>${findings}` : `<div class="sx-banner info">Nothing wrong was found in this client's setup.</div>`) +
        `<div class="col-head" style="margin-top:14px"><h2>Units</h2></div><div class="sx-card">` +
        `<p class="sx-p">${esc(u.rule || "")}</p>` +
        (u.defaultUnit ? `<p class="sx-sub">New line items start with quantity unit “${esc(u.defaultUnit.quantity_unit || "")}” and price unit “${esc(u.defaultUnit.price_unit || "")}”.</p>` : "") +
        (unusable ? `<span class="sx-k">Products linked to a unit this client cannot use</span><ul class="sx-list">${unusable}</ul>` : "") +
        `</div>` +
        `<div class="col-head" style="margin-top:14px"><h2>Vendors</h2></div><div class="sx-card">` +
        `<p class="sx-p"><b>${esc(v.invitable ?? "?")}</b> vendors can be invited to an event — those that are ${esc((v.allowedStatuses || []).map(statusWords).join(", "))}${v.allowedStatusesFrom ? ` (${esc(v.allowedStatusesFrom)})` : ""}.</p>` +
        `<div class="sx-chips">${Object.entries(v.byStatus || {}).map(([k, n]) => `<span class="sx-chip">${esc(n)} ${esc(statusWords(k))}</span>`).join("")}</div>` +
        ((v.qaSafe || []).length ? `<p class="sx-sub">${v.qaSafe.length} test vendor(s) are safe to invite in automated runs.</p>` : "") +
        CV.detailsHtml([{ label: "Test vendors", value: (v.qaSafe || []).map((x) => `${x.name} (${x.status})`).join("\n"), kind: "block" }]) +
        `</div>` +
        `<div class="col-head" style="margin-top:14px"><h2>Settings that change how events behave</h2></div><div class="sx-card"><ul class="sx-list">` +
        (m.settings || []).map((st) => `<li>${esc(st.plain)}${CV.detailsHtml([{ label: "Setting", value: st.key, kind: "code" }, { label: "Value", value: JSON.stringify(st.value), kind: "code" }])}</li>`).join("") +
        `</ul></div>` +
        `<div class="col-head" style="margin-top:14px"><h2>What changed</h2><span class="hint">each time the model was rebuilt</span></div><div id="pm-history"><div class="loading">Loading…</div></div>` +
        `<div class="sx-card">${CV.detailsHtml([
          { label: "Read from", value: m.details?.from || "" },
          { label: "Snapshot", value: m.details?.snapshotId != null ? String(m.details.snapshotId) : "" },
          { label: "Hash", value: m.details?.hash || "", kind: "code" },
          { label: "Sections that could not be read", value: (m.errors || []).map((e) => `${e.section}: ${e.message}`).join("\n"), kind: "block" },
          { label: "Feature gates", value: m.details?.gates ? JSON.stringify(m.details.gates, null, 2) : "", kind: "block" },
        ])}</div>`;
      loadHistory(c);
    } catch (e) {
      body.innerHTML = errorHtml(e, `the product model for company ${c}`);
    }
  }

  async function loadHistory(c) {
    const box = q("#pm-history");
    if (!box) return;
    try {
      const h = await getJson(`/api/product-model/history?c=${c}`);
      const vs = h.versions || [];
      if (!vs.length) {
        box.innerHTML = `<div class="empty">No history kept yet (it is kept in spine.ai's database).</div>`;
        return;
      }
      box.innerHTML =
        `<div class="sx-card">` +
        vs
          .map(
            (v) =>
              `<div class="sx-field"><div class="sx-row"><b class="sx-grow">${esc(when(v.fetchedAt))}</b>${v.changed ? `<span class="sx-badge accent">changed</span>` : `<span class="sx-badge">no change</span>`}</div>` +
              ((v.changes || []).length ? `<ul class="sx-list">${v.changes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "") +
              CV.detailsHtml([
                { label: "Version", value: String(v.id) },
                { label: "Hash", value: v.hash || "", kind: "code" },
                { label: "Counts", value: v.summary ? Object.entries(v.summary).filter(([, x]) => typeof x === "number").map(([k, x]) => `${words(k)} ${x}`).join(" · ") : "" },
              ]) +
              `</div>`,
          )
          .join("") +
        `</div>`;
    } catch (e) {
      box.innerHTML = errorHtml(e, "the history");
    }
  }

  // ── templates: chooser ────────────────────────────────────────────────
  async function showTemplates(body, type) {
    const c = clientId();
    body.innerHTML =
      `<div class="sx-card accent"><h3 class="sx-h3">Which kind of stage?</h3>` +
      `<div class="sx-chips">${STAGE_TYPES.map(([id, label]) => `<a class="chip${id === type ? " active" : ""}" href="#/product/templates/${id}">${esc(label)}</a>`).join("")}</div>` +
      `<div id="pm-tpl-head"><div class="loading">Loading the templates…</div></div></div><div id="pm-tpl-list"></div>`;
    try {
      const t = await getJson(`/api/product-model/templates?c=${c}&type=${encodeURIComponent(type)}`);
      const list = t.templates || [];
      // the suggested one first, then the usable ones, then the rest
      const ordered = [...list].sort((a, b) => (b.uuid === t.suggested) - (a.uuid === t.suggested) || b.usable - a.usable);
      q("#pm-tpl-head").innerHTML =
        `<p class="sx-p"><b>${esc(t.answer || "")}</b></p>` +
        `<p class="sx-sub">${esc(t.client?.name || "")} · data as of ${esc(when(t.fetchedAt))}</p>` +
        CV.detailsHtml([
          { label: "Template list", value: t.details?.templateList || "", kind: "code" },
          { label: "Read from", value: t.details?.from || "" },
          { label: "Code it follows", value: (t.details?.cites || []).join("\n"), kind: "block" },
        ]);
      q("#pm-tpl-list").innerHTML = ordered.length
        ? ordered
            .map((r) => {
              const sug = r.uuid === t.suggested;
              const warns = r.warnings || [];
              const wn = !r.usable ? (warns[0] ? `<div class="wn">${esc(warns[0])}</div>` : "") : warns.map((w) => `<div class="wn">${esc(w)}</div>`).join("");
              return (
                `<button type="button" class="sx-tpl${sug ? " suggested" : ""}${r.usable ? "" : " unusable"}" ${r.usable ? `data-uuid="${esc(r.uuid)}"` : 'aria-disabled="true"'}>` +
                `<span class="nm">${esc(r.name)}${sug ? ` <span class="sx-badge accent">Suggested</span>` : ""}</span>` +
                `<span><span class="sx-badge ${r.isDefault ? "good" : "accent"}">${esc(r.isDefault ? "Procol default" : "Client's own")}</span>${r.usable ? "" : ` <span class="sx-badge bad">cannot be used</span>`}</span>` +
                `<span class="sm">${esc(r.summary || "")}${r.usable && r.requiredCount ? ` · ${r.requiredCount} required${r.quantityUnit ? ` · quantity in ${esc(r.quantityUnit)}` : ""}` : ""}</span>` +
                wn +
                `</button>`
              );
            })
            .join("")
        : `<div class="empty">This client is offered no templates for this kind of stage.</div>`;
      for (const b of q("#pm-tpl-list").querySelectorAll("button[data-uuid]"))
        b.addEventListener("click", () => (location.hash = `#/product/template/${type}/${encodeURIComponent(b.dataset.uuid)}`));
    } catch (e) {
      q("#pm-tpl-head").innerHTML = errorHtml(e, "the templates");
    }
  }

  // ── templates: one template's fields ──────────────────────────────────
  const AMBER = new Set(["screen only", "not confirmed", "nobody (template only)"]);

  function optionsText(o) {
    if (!o) return "";
    if (Array.isArray(o)) return o.map((x) => (typeof x === "object" ? x.label ?? x.name ?? x.value ?? JSON.stringify(x) : x)).join(", ");
    if (typeof o === "object") return Object.values(o).join(", ");
    return String(o);
  }

  function fieldHtml(f) {
    const meta = [f.filledBy ? `filled by the ${f.filledBy}` : "", f.kind || "", f.unit ? `unit: ${f.unit}` : ""].filter(Boolean).join(" · ");
    const opts = optionsText(f.options);
    const rules = (f.rules || [])
      .map((r) => {
        const amber = AMBER.has(r.checkedBy);
        const d = r.details || {};
        return (
          `<div class="sx-rule${amber ? " amber" : ""}">• ${esc(r.plain)} — <i>checked by ${esc(r.checkedBy)}</i>` +
          CV.detailsHtml([
            { label: "Rule kind", value: d.kind || "" },
            { label: "Value", value: d.value !== undefined ? JSON.stringify(d.value) : "", kind: "code" },
            { label: "Error code", value: d.code != null ? String(d.code) : "", kind: "code" },
            { label: "The app says", value: d.message || "" },
            { label: "Code it follows", value: (d.cites || []).join("\n"), kind: "block" },
          ]) +
          `</div>`
        );
      })
      .join("");
    return (
      `<div class="sx-field"><div><span class="nm">${esc(f.name)}</span>${f.required ? `<span class="sx-pill">Required</span>` : ""}</div>` +
      (meta ? `<div class="sx-sub">${esc(meta)}</div>` : "") +
      `<div class="sx-p">${esc(f.plain || "")}</div>` +
      (opts ? `<div class="sx-sub">Options: ${esc(opts)}</div>` : "") +
      rules +
      (f.details ? CV.detailsHtml([{ label: "Field details", value: JSON.stringify(f.details, null, 2), kind: "block" }]) : "") +
      `</div>`
    );
  }

  async function showTemplate(body, type, uuid) {
    const c = clientId();
    body.innerHTML = `<button type="button" class="sx-back" id="pm-back">← All ${esc((STAGE_TYPES.find(([id]) => id === type) || [, type])[1])} templates</button><div class="loading">Loading the template…</div>`;
    const back = () => q("#pm-back")?.addEventListener("click", () => (location.hash = `#/product/templates/${type}`));
    back();
    try {
      const v = await getJson(`/api/product-model/template?c=${c}&uuid=${encodeURIComponent(uuid)}`);
      const t = v.template || {};
      const fill = v.whatYouCanFill || {};
      const chipGroup = (who, label) =>
        (fill[who] || []).length ? `<span class="sx-k">${esc(label)}</span><div class="sx-chips">${fill[who].map((n) => `<span class="sx-chip ${who}">${esc(n)}</span>`).join("")}</div>` : "";
      const problems = (v.problems || [])
        .map((p) => `<div class="sx-banner ${p.severity === "defect" || p.severity === "error" ? "bad" : "warn"}">${esc(p.plain)}${CV.detailsHtml([{ label: "Details", value: JSON.stringify(p.details || {}, null, 2), kind: "block" }])}</div>`)
        .join("");
      const sections = (v.sections || [])
        .map((s, i) => {
          const req = (s.fields || []).filter((f) => f.required).length;
          return (
            `<details class="sx-group" ${i === 0 ? "open" : ""}><summary>${esc(s.title)} <span class="hint">${(s.fields || []).length} field(s)${req ? ` · ${req} required` : ""}</span></summary>` +
            `<div class="sx-group-body">${(s.fields || []).map(fieldHtml).join("")}</div></details>`
          );
        })
        .join("");
      body.innerHTML =
        `<button type="button" class="sx-back" id="pm-back">← All ${esc((STAGE_TYPES.find(([id]) => id === type) || [, type])[1])} templates</button>` +
        `<div class="sx-card ${t.usable ? "accent" : "bad"}"><div class="sx-row"><h3 class="sx-h3 sx-grow">${esc(t.name || "Template")}</h3>` +
        `<span class="sx-badge ${t.isDefault ? "good" : "accent"}">${esc(t.isDefault ? "Procol default" : "Client's own")}</span>${t.usable ? "" : ` <span class="sx-badge bad">cannot be used</span>`}</div>` +
        `<p class="sx-p">${esc(t.summary || "")}</p><p class="sx-sub">${esc(v.client?.name || "")} · data as of ${esc(when(v.fetchedAt))}</p>` +
        chipGroup("buyer", "The buyer fills") +
        chipGroup("vendor", "The vendor fills") +
        chipGroup("calculated", "Calculated") +
        chipGroup("hidden", "Hidden") +
        (t.usable ? templateCheckControls() : "") +
        CV.detailsHtml([
          { label: "Template id", value: t.uuid || uuid, kind: "code" },
          { label: "Template type", value: t.details?.templateType || "" },
          { label: "Order type", value: t.details?.orderType || "" },
          { label: "Listed under", value: (t.details?.listedUnder || []).join(", ") },
          { label: "Used for", value: (t.details?.useFor || []).join(", ") },
          { label: "Units", value: v.units?.rule || "" },
          { label: "Read from", value: v.details?.from || "" },
        ]) +
        `</div>` +
        `<div id="pm-tc"></div>` +
        problems +
        (sections || `<div class="empty">No fields could be read for this template.</div>`);
      back();
      if (t.usable) wireTemplateCheck(type, t.uuid || uuid);
    } catch (e) {
      body.innerHTML += errorHtml(e, "the template");
    }
  }

  // ── template check (Phase 2): the field cases for one template, and running them ──
  const TC_TARGET = {
    template: "Template",
    stage: "Buyer saves the round",
    bid: "Vendor fills the line",
    "form-stage": "Technical round",
    "form-answer": "Vendor answers",
  };
  const TC_EXPECTED = { accept: "should be saved", reject: "should be refused", "no-5xx": "must not crash" };
  const TC_VERDICT = { pass: "Passed", fail: "Failed", inconclusive: "Couldn't tell", "not-run": "Not run" };
  let tcRunning = null; // AbortController of the run in flight

  function templateCheckControls() {
    return (
      `<div class="sx-btnrow" id="pm-tc-controls">` +
      `<button type="button" class="run-btn small ghost" id="pm-tc-cases">${ico("clipboard-list")} Show cases</button>` +
      `<span class="sx-chips" style="margin:0" role="radiogroup" aria-label="How many cases">` +
      `<label class="tgl-flow"><input type="radio" name="pm-tc-mode" value="sample" checked /> Sample (quick)</label>` +
      `<label class="tgl-flow"><input type="radio" name="pm-tc-mode" value="full" /> Full</label></span>` +
      `<button type="button" class="run-btn small primary" id="pm-tc-run">${ico("flask-conical")} Check this template</button>` +
      `<span class="hint" id="pm-tc-busy"></span></div>`
    );
  }

  const tcMode = () => q('input[name="pm-tc-mode"]:checked')?.value || "sample";

  async function tcBusy() {
    try {
      return !!(await getJson("/api/template-check/status")).busy;
    } catch {
      return false;
    }
  }

  async function tcRefreshBusy() {
    const btn = q("#pm-tc-run");
    if (!btn || tcRunning) return;
    const busy = await tcBusy();
    btn.disabled = busy;
    const h = q("#pm-tc-busy");
    if (h) h.textContent = busy ? "A template check is already running — wait for it to finish." : "";
  }

  function wireTemplateCheck(type, uuid) {
    q("#pm-tc-cases")?.addEventListener("click", () => showCheckCases(type, uuid));
    q("#pm-tc-run")?.addEventListener("click", () => runCheck(type, uuid));
    tcRefreshBusy();
  }

  function tcCaseHtml(c) {
    return (
      `<div class="sx-field"><div class="sx-row"><span class="nm sx-grow">${esc(c.title)}</span>` +
      `<span class="sx-badge ${c.expected === "reject" ? "warn" : c.expected === "accept" ? "good" : "idle"}">${esc(TC_EXPECTED[c.expected] || c.expected)}</span>` +
      (c.screenOnly ? ` <span class="sx-badge warn">screen only</span>` : "") +
      `</div>` +
      CV.detailsHtml([
        { label: "Why it matters", value: c.why || "" },
        { label: "Before you start", value: c.preconditions || "" },
        { label: "Steps", value: (c.steps || []).map((x, i) => `${i + 1}. ${x}`).join("\n"), kind: "block" },
        { label: "Expected", value: c.expectedResult || "" },
        { label: "Priority", value: c.priority || "" },
        { label: "Checked by", value: c.enforcedBy || "" },
        { label: "Case id", value: c.id || "", kind: "code" },
        { label: "More", value: c.details ? JSON.stringify(c.details, null, 2) : "", kind: "block" },
      ]) +
      `</div>`
    );
  }

  async function showCheckCases(type, uuid) {
    const box = q("#pm-tc");
    if (!box) return;
    box.innerHTML = `<div class="loading">Writing the cases for this template…</div>`;
    try {
      const j = await getJson(`/api/template-check/cases?c=${clientId()}&type=${encodeURIComponent(type)}&uuid=${encodeURIComponent(uuid)}&mode=all`);
      const cases = j.cases || [];
      const n = j.counts || {};
      const groups = {};
      for (const c of cases) (groups[c.target] = groups[c.target] || []).push(c);
      const order = ["template", "stage", "bid", "form-stage", "form-answer", ...Object.keys(groups)];
      const seen = new Set();
      box.innerHTML =
        `<div class="sx-card accent"><div class="sx-row"><h3 class="sx-h3 sx-grow">The cases for this template</h3><button type="button" class="chip" id="pm-tc-hide">hide</button></div>` +
        `<p class="sx-p"><b>${esc(n.total ?? cases.length)}</b> case(s)${n.screenOnly ? ` · <b>${esc(n.screenOnly)}</b> only the screen checks (the server may accept them)` : ""}. ` +
        `“Sample” runs a quick selection; “Full” runs every case.</p>` +
        order
          .filter((g) => groups[g] && !seen.has(g) && seen.add(g))
          .map(
            (g) =>
              `<details class="sx-group"><summary>${esc(TC_TARGET[g] || words(g))} <span class="hint">${groups[g].length}</span></summary><div class="sx-group-body">${groups[g].map(tcCaseHtml).join("")}</div></details>`,
          )
          .join("") +
        `</div>`;
      q("#pm-tc-hide")?.addEventListener("click", () => (box.innerHTML = ""));
    } catch (e) {
      box.innerHTML = errorHtml(e, "the cases");
    }
  }

  function tcResultHtml(r) {
    const badges = [
      r.gapConfirmed ? `<span class="sx-badge bad">Gap: the API accepts what only the screen stops</span>` : "",
      r.serverAlsoEnforces ? `<span class="sx-badge accent">The server checks this too — our rule library was out of date</span>` : "",
      r.httpStatus >= 500 ? `<span class="sx-badge bad">Server error</span>` : "",
      r.screenOnly ? `<span class="sx-badge warn">screen only</span>` : "",
    ].filter(Boolean);
    return (
      `<div class="sx-result">${CV.verdictPill(TC_VERDICT[r.verdict] || r.verdict)}<div>` +
      `<div><b>${esc(r.title)}</b></div>` +
      `<div class="sx-muted">${esc(CV.scrub(r.actual || ""))}</div>` +
      (r.verdict !== "pass" && r.reason ? `<div class="sx-sub">${esc(CV.scrub(r.reason))}</div>` : "") +
      (badges.length ? `<div class="sx-chips">${badges.join("")}</div>` : "") +
      `</div>` +
      CV.detailsHtml([
        { label: "Expected", value: TC_EXPECTED[r.expected] || r.expected || "" },
        { label: "Request", value: r.request ? `${r.request.method} ${r.request.path}` : "", kind: "code" },
        { label: "HTTP status", value: r.httpStatus != null ? String(r.httpStatus) : "", kind: "code" },
        { label: "The app said", value: r.message || "" },
        { label: "Took", value: r.durationMs ? `${r.durationMs} ms` : "" },
        { label: "Case id", value: r.id || "", kind: "code" },
        { label: "Request body", value: r.request?.body !== undefined ? JSON.stringify(r.request.body, null, 2) : "", kind: "block" },
      ]) +
      `</div>`
    );
  }

  function tcRunHeader(run, runId) {
    const s = run.summary || {};
    return (
      `<div class="sx-card ${s.fail || s.serverErrors || s.gaps ? "bad" : "good"}"><div class="sx-row"><h3 class="sx-h3 sx-grow">Template check finished</h3>` +
      (runId ? `<a class="run-btn small" href="/api/test-report?run=${encodeURIComponent(runId)}" target="_blank" rel="noopener">${ico("chart-column")} Open report</a>` : "") +
      `</div>` +
      `<div class="sx-chips"><span class="sx-chip">${esc(s.pass ?? 0)} passed</span><span class="sx-chip">${esc(s.fail ?? 0)} failed</span>` +
      `<span class="sx-chip">${esc(s.inconclusive ?? 0)} couldn't tell</span><span class="sx-chip">${esc(s.notRun ?? 0)} not run</span>` +
      (s.gaps ? `<span class="sx-badge bad">${esc(s.gaps)} gap(s)</span>` : "") +
      (s.serverErrors ? `<span class="sx-badge bad">${esc(s.serverErrors)} server error(s)</span>` : "") +
      (s.serverAlsoEnforces ? `<span class="sx-badge accent">${esc(s.serverAlsoEnforces)} also checked by the server</span>` : "") +
      `</div>` +
      (run.event?.title ? `<p class="sx-sub">Ran on a test event created for this check (${esc(run.event.title)}).</p>` : "") +
      (run.problems || []).map((p) => `<div class="sx-banner warn">${esc(CV.scrub(p))}</div>`).join("") +
      CV.detailsHtml([
        { label: "Run id", value: runId || "", kind: "code" },
        { label: "Mode", value: run.mode || "" },
        { label: "Cases run", value: run.selected != null ? String(run.selected) : "" },
        { label: "Took", value: run.durationMs ? `${Math.round(run.durationMs / 1000)} s` : "" },
        { label: "Set-up calls", value: (run.setup || []).map((x) => `${x.n}. ${x.did} — ${x.method} ${x.path} → ${x.status} (${x.ms} ms)`).join("\n"), kind: "block" },
      ]) +
      `</div>`
    );
  }

  async function runCheck(type, uuid) {
    const mode = tcMode();
    if (mode === "full" && !confirm("A full check runs every case for this template — up to 150 cases, about 40 minutes — and creates test records on UAT. Run it?")) return;
    const btn = q("#pm-tc-run");
    const box = q("#pm-tc");
    if (!box || tcRunning) return;
    if (await tcBusy()) {
      tcRefreshBusy();
      return;
    }
    const ctl = new AbortController();
    tcRunning = ctl;
    if (btn) btn.disabled = true;
    const results = [];
    const lines = [];
    let total = 0;
    let header = "";
    let error = "";
    const paint = () => {
      const log = lines.length ? `<div class="sx-log" id="pm-tc-log">${esc(lines.slice(-150).join("\n"))}</div>` : "";
      box.innerHTML =
        (header ||
          `<div class="sx-card accent"><div class="sx-row"><h3 class="sx-h3 sx-grow"><span class="spin">⟳</span> Checking this template (${esc(mode === "full" ? "full" : "sample")})</h3>` +
            `<button type="button" class="chip" id="pm-tc-stop">${ico("square")} stop watching</button></div>` +
            `<p class="sx-sub">${results.length}${total ? ` of ${total}` : ""} case(s) done</p>${log}</div>`) +
        (error ? `<div class="sx-banner bad">${error}</div>` : "") +
        (results.length ? `<div class="sx-card">${results.map(tcResultHtml).join("")}</div>` : "");
      q("#pm-tc-stop")?.addEventListener("click", () => ctl.abort());
      const l = q("#pm-tc-log");
      if (l) l.scrollTop = l.scrollHeight;
    };
    paint();
    try {
      const r = await fetch(`/api/template-check/run?c=${clientId()}&type=${encodeURIComponent(type)}&uuid=${encodeURIComponent(uuid)}&mode=${mode}`, { signal: ctl.signal });
      if (r.status === 409) {
        error = "<b>Already running:</b> another template check is in progress. Wait for it to finish, then try again.";
      } else if (!r.ok || !r.body) {
        let msg = `HTTP ${r.status}`;
        try {
          msg = (await r.json()).error || msg;
        } catch {
          /* not JSON */
        }
        error = `<b>Could not start:</b> ${esc(msg)}`;
      } else {
        // server-sent events, read by hand so nothing ever reconnects and re-runs
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let cut;
          while ((cut = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, cut);
            buf = buf.slice(cut + 2);
            const ev = /^event: ?(.*)$/m.exec(chunk)?.[1]?.trim() || "message";
            const data = chunk
              .split("\n")
              .filter((x) => x.startsWith("data:"))
              .map((x) => x.replace(/^data: ?/, ""))
              .join("\n");
            let d = {};
            try {
              d = JSON.parse(data || "{}");
            } catch {
              continue;
            }
            if (ev === "line" && d.line) lines.push(String(d.line));
            else if (ev === "case" && d.result) {
              results.push(d.result);
              total = d.total || total;
            } else if (ev === "done" && d.run) {
              const runId = d.runId || d.run.runId;
              header = tcRunHeader(d.run, runId);
              if (d.run.results?.length) results.splice(0, results.length, ...d.run.results);
            } else if (ev === "run-error") error = `<b>The check stopped:</b> ${esc(d.message || "unknown error")}`;
            paint();
          }
        }
        if (!header && !error) error = "The connection ended before the check reported its result. Nothing was restarted.";
      }
    } catch (e) {
      error = e.name === "AbortError" ? "Stopped watching. The check may still be finishing on the server; nothing was restarted." : `<b>Lost the connection:</b> ${esc(e.message)}`;
    }
    tcRunning = null;
    paint();
    tcRefreshBusy();
  }

  // ── how events work ───────────────────────────────────────────────────
  let anatomyCache = null;
  async function showAnatomy(body) {
    try {
      const a = anatomyCache || (anatomyCache = await getJson("/api/product-model/anatomy"));
      const comp = a.compositions || {};
      const stages = (ids) => (ids || []).map((s) => STAGE_WORD[s] || words(s)).join(" → ");
      const allowed = (comp.allowed || [])
        .map((x) => `<tr><td data-k="Stages"><b>${esc(stages(x.stages))}</b></td><td data-k="What it means">${esc(x.plain)}${CV.detailsHtml([{ label: "Id", value: x.id, kind: "code" }, { label: "Code it follows", value: (x.cites || []).join("\n"), kind: "block" }])}</td></tr>`)
        .join("");
      const refused = (comp.refused || [])
        .map((x) => `<li>${esc(x.plain)}${CV.detailsHtml([{ label: "Id", value: x.id, kind: "code" }, { label: "Code it follows", value: (x.cites || []).join("\n"), kind: "block" }])}</li>`)
        .join("");
      const sections = (a.sections || [])
        .map(
          (s) =>
            `<details class="sx-group"><summary>${esc(s.title)} <span class="hint">${(s.items || []).length}</span></summary><div class="sx-group-body">` +
            (s.items || [])
              .map((it) => {
                const same = (it.title || "").replace(/\W/g, "").toLowerCase() === (it.plain || "").replace(/\W/g, "").toLowerCase();
                const sameStart = !same && (it.plain || "").startsWith((it.title || "").slice(0, 40));
                const d = it.details || {};
                return (
                  `<div class="sx-field">${same || sameStart ? "" : `<div class="nm">${esc(it.title)}</div>`}<div class="sx-p">${esc(it.plain || it.title)}</div>` +
                  CV.detailsHtml([
                    { label: "Error code", value: d.code != null ? String(d.code) : "", kind: "code" },
                    { label: "Code it follows", value: (d.cites || []).join("\n"), kind: "block" },
                    { label: "More", value: JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => k !== "cites" && k !== "code")), null, 2).replace(/^\{\}$/, ""), kind: "block" },
                  ]) +
                  `</div>`
                );
              })
              .join("") +
            `</div></details>`,
        )
        .join("");
      body.innerHTML =
        `<div class="sx-card"><h3 class="sx-h3">${esc(a.title || "How a sourcing event works")}</h3>` +
        `<p class="sx-sub">${esc(a.counts?.facts ?? "")} facts in ${esc(a.counts?.sections ?? "")} sections, each read from the product's own code.</p>` +
        CV.detailsHtml([
          { label: "Backend", value: a.details?.backendRef || "", kind: "code" },
          { label: "Dashboard", value: a.details?.dashboardRef || "", kind: "code" },
          { label: "Built", value: when(a.details?.builtAt) },
          { label: "Note", value: a.details?.note || "" },
        ]) +
        `</div>` +
        `<div class="col-head" style="margin-top:14px"><h2>Stages an event can combine</h2></div>` +
        `<table class="sx-table"><thead><tr><th>Stages</th><th>What it means</th></tr></thead><tbody>${allowed}</tbody></table>` +
        (refused ? `<div class="sx-card warn" style="margin-top:10px"><h3 class="sx-h3">Combinations that are refused</h3><ul class="sx-list">${refused}</ul></div>` : "") +
        `<div class="col-head" style="margin-top:14px"><h2>Everything else, by topic</h2><span class="hint">open a topic to read it</span></div>` +
        sections;
    } catch (e) {
      body.innerHTML = errorHtml(e, "how events work");
    }
  }

  // ── ask ───────────────────────────────────────────────────────────────
  const EXAMPLES = [
    "Which units can I use?",
    "Can the RFP end after the RFQ?",
    "Which vendors can be invited?",
    "Who can award an event?",
  ];
  let lastAsk = "";
  function showAsk(body) {
    body.innerHTML =
      `<div class="sx-card accent"><h3 class="sx-h3">Ask about the product</h3>` +
      `<p class="sx-sub">Answered from what spine.ai has read about Procol and this client — no AI guessing for the facts.</p>` +
      `<div class="sx-btnrow"><input id="pm-q" class="sx-input" placeholder="e.g. which units can I use?" value="${esc(lastAsk)}" /><button type="button" id="pm-ask" class="run-btn primary small">Ask</button></div>` +
      `<div class="sx-chips">${EXAMPLES.map((x) => `<button type="button" class="chip" data-ex="${esc(x)}">${esc(x)}</button>`).join("")}</div></div>` +
      `<div id="pm-answer"></div>`;
    const go = async () => {
      const text = (q("#pm-q")?.value || "").trim();
      if (!text) return q("#pm-q")?.focus();
      lastAsk = text;
      const out = q("#pm-answer");
      out.innerHTML = `<div class="loading">Looking it up…</div>`;
      try {
        const a = await getJson(`/api/product-model/ask?c=${clientId()}&q=${encodeURIComponent(text)}`);
        out.innerHTML =
          `<div class="sx-card good"><div class="sx-row"><b class="sx-grow">${esc(a.question || text)}</b><span class="sx-badge accent">${esc(a.method || "")}</span></div>` +
          `<p class="sx-ans">${esc(a.answer || "No answer.")}</p>` +
          CV.detailsHtml([
            { label: "Matches", value: (a.matches || []).map((m) => `${m.title}${m.plain ? ` — ${m.plain}` : ""}`).join("\n"), kind: "block" },
            { label: "More", value: a.details ? JSON.stringify(a.details, null, 2) : "", kind: "block" },
          ]) +
          `</div>`;
      } catch (e) {
        out.innerHTML = errorHtml(e, "an answer");
      }
    };
    q("#pm-ask")?.addEventListener("click", go);
    q("#pm-q")?.addEventListener("keydown", (e) => e.key === "Enter" && go());
    for (const b of body.querySelectorAll("[data-ex]"))
      b.addEventListener("click", () => {
        q("#pm-q").value = b.dataset.ex;
        go();
      });
  }

  window.addEventListener("hashchange", route);
  // The client picker: whatever is on screen belongs to the old client — reload it.
  q("#client")?.addEventListener("change", () => {
    if (q("#client")?.value === "__add__") return;
    if (parse()) route();
  });
  route();
})();
