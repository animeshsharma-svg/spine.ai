/**
 * Test sheets — run the team's manual test-case sheets (13 columns) one case at a time or many in a row.
 *
 *   #/sheets   pick a sheet (the sourcing sheet is there already) or upload one, tick cases, run them one by
 *              one with the browser live, then open the report (bugs with screenshots) or download the
 *              sheet back with Status filled in.
 *
 * Data: /api/sheets, /api/sheets/cases, /api/sheets/upload, /api/sheets/run (SSE), /api/sheets/stop,
 * /api/sheets/runs, /api/sheets/report, /api/sheets/export. Loaded after app.js.
 */
(function () {
  const q = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const root = () => q("#sht-root");
  const S = { sheets: [], sheet: "", cases: [], picked: new Set(), qtext: "", mod: "", open: new Set(), es: null, run: null, runs: [], camp: null, from: "3", single: null, und: null };
  const PILL = { Pass: "ok", Fail: "bad", "Partly checked": "warn", "Couldn't tell": "idle", "Not run": "idle" };

  function clientId() {
    const n = Number(q("#client")?.value);
    return n > 0 ? n : 198678;
  }

  async function load() {
    if (!root()) return;
    const r = await fetch("/api/sheets", { cache: "no-store" }).then((x) => x.json()).catch(() => ({ sheets: [] }));
    S.sheets = r.sheets || [];
    // a sheet Home just imported opens here with every row ticked
    let opened = null;
    try { opened = JSON.parse(sessionStorage.getItem("sht-open") || "null"); sessionStorage.removeItem("sht-open"); } catch { opened = null; }
    if (opened?.sheet && S.sheets.some((s) => s.id === opened.sheet)) { S.sheet = opened.sheet; S.picked.clear(); S.tickAll = !!opened.tickAll; S.tickIds = Array.isArray(opened.ids) ? opened.ids : null; }
    if (!S.sheet || !S.sheets.some((s) => s.id === S.sheet)) S.sheet = S.sheets[0]?.id || "";
    S.camp = await fetch("/api/sheets/campaign", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    const runs = await fetch("/api/sheets/runs", { cache: "no-store" }).then((x) => x.json()).catch(() => ({ runs: [] }));
    S.runs = runs.runs || [];
    if (S.sheet) {
      const c = await fetch(`/api/sheets/cases?sheet=${encodeURIComponent(S.sheet)}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ cases: [] }));
      S.cases = c.cases || [];
      if (S.tickAll) { S.cases.forEach((x) => S.picked.add(x.id)); S.tickAll = false; }
      // Home's "Run the ticked cases": exactly those rows ticked here, ready for Understand / Run
      if (S.tickIds) { const want = new Set(S.tickIds.map((x) => String(x).toUpperCase())); S.cases.forEach((x) => { if (want.has(x.id.toUpperCase())) S.picked.add(x.id); }); S.tickIds = null; }
    } else S.cases = [];
    paint();
  }

  function shown() {
    const words = S.qtext.toLowerCase().split(/\s+/).filter(Boolean);
    return S.cases.filter((c) => {
      if (S.mod && c.module !== S.mod) return false;
      if (!words.length) return true;
      const hay = `${c.id} ${c.title} ${c.scenario} ${c.steps.join(" ")} ${c.expected}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  function paint() {
    const el = root();
    if (!el) return;
    const mods = [...new Set(S.cases.map((c) => c.module))];
    const list = shown();
    el.innerHTML = `
      <div class="sht-top">
        <label class="sht-field"><span>Sheet</span><select id="sht-sheet">${S.sheets.map((s) => `<option value="${esc(s.id)}" ${s.id === S.sheet ? "selected" : ""}>${esc(s.name)} — ${s.count} cases</option>`).join("") || "<option value=\"\">No sheet yet</option>"}</select></label>
        <label class="sht-upload">Upload a sheet (.xlsx or .csv)<input type="file" id="sht-file" accept=".xlsx,.xls,.csv"></label>
        <span class="sht-hint">Columns: Test Case ID, Module, Scenario, Test Case Title, User Role, Portal, Pre-conditions, Test Data, Test Steps, Expected Result, Priority, Test Type, Status. A sheet with the same name replaces the old one.</span>
      </div>
      <section class="sht-single" id="sht-single">${singleHtml()}</section>
      <section class="sht-camp" id="sht-camp">${campHtml(mods)}</section>
      <div class="sht-und" id="sht-und" ${S.und ? "" : "hidden"}>${undHtml()}</div>
      <div class="sht-run" id="sht-run" ${S.run ? "" : "hidden"}></div>
      <div class="sht-filters">
        <input type="search" id="sht-q" placeholder="Search IDs, titles, steps, expected results" value="${esc(S.qtext)}">
        <select id="sht-mod"><option value="">All modules</option>${mods.map((m) => `<option ${m === S.mod ? "selected" : ""}>${esc(m)}</option>`).join("")}</select>
        <button class="btn" id="sht-all">Tick all shown (${list.length})</button>
        <button class="btn" id="sht-none">Untick all</button>
        <button class="btn" id="sht-understand" ${S.picked.size ? "" : "disabled"} title="What the platform understood of each ticked case: where it starts, what it will check, whether it can run here">Understand ticked first</button>
        <label class="sht-check"><input type="checkbox" id="sht-headed"> Watch the browser</label>
        <button class="btn primary" id="sht-go" ${S.picked.size && !S.run?.live ? "" : "disabled"}>Run ${S.picked.size || ""} ticked case${S.picked.size === 1 ? "" : "s"} one by one</button>
      </div>
      <ol class="sht-list">${list.slice(0, 400).map(row).join("")}</ol>
      ${list.length > 400 ? `<p class="sht-hint">Showing the first 400 of ${list.length}. Narrow the search or pick a module to see the rest.</p>` : ""}
      ${S.runs.length ? `<section class="sht-past"><h3>Earlier runs</h3><ul>${S.runs.map((r) => `<li><a href="/api/sheets/report?run=${r.id}" target="_blank" rel="noopener">${esc(new Date(r.startedAt).toLocaleString())} · ${esc(r.sheet)} · ${r.total} case${r.total === 1 ? "" : "s"}</a> <span>${Object.entries(r.counts).map(([k, v]) => `${v} ${esc(k.toLowerCase())}`).join(" · ")}</span> <a href="/api/sheets/export?run=${r.id}&format=xlsx">results sheet</a></li>`).join("")}</ul></section>` : ""}`;
    wire();
    if (S.run) paintRun();
  }

  function singleHtml() {
    const g = S.single;
    const busy = g?.live;
    return `<div class="sht-camphead"><b>Type one test case</b><span class="sht-hint" style="flex-basis:auto">Plain English. It is read as a TEST CASE, not a journey: rewritten into the house columns, understood (where it starts, what it checks, whether it can run here), run, and answered in the same words — with a bug row when it fails and the edge cases worth adding.</span></div>
      <textarea id="sht-text" rows="3" placeholder='e.g. On a live RFQ with a vendor bid, extend the submission time by 30 minutes and check the end time moved by exactly 30 minutes and Order Activity lists the extension' ${busy ? "disabled" : ""}>${esc(g?.text || "")}</textarea>
      <div class="sht-filters"><button class="btn" id="sht-single-dry" ${busy ? "disabled" : ""}>Show the understanding only</button><button class="btn primary" id="sht-single-go" ${busy ? "disabled" : ""}>Understand and run it</button><label class="sht-check"><input type="checkbox" id="sht-single-headed"> Watch the browser</label>${g?.case ? `<span class="sht-hint" style="flex-basis:auto">Saved as <b>${esc(g.case.id)}</b> in the sheet "Typed test cases" — it can be run again from the list.</span>` : ""}</div>
      ${g ? window.spineSingle.render(g) : ""}`;
  }
  function undHtml() {
    if (!S.und) return "";
    if (S.und.loading) return `<p class="sht-hint">Reading ${S.und.n} ticked case${S.und.n === 1 ? "" : "s"}: where each starts, what it checks, and whether it can run here…</p>`;
    const list = S.und.list || [];
    const no = list.filter((u) => !u.canRunHere).length;
    return `<div class="sht-cchead"><b>Understood ${list.length} case${list.length === 1 ? "" : "s"} before running</b><span class="pill ${no ? "warn" : "ok"}">${list.length - no} can run here</span>${no ? `<span class="pill bad">${no} cannot — see why</span>` : ""}<button class="btn" id="sht-und-close">Close</button></div>
      <table class="sht-table"><thead><tr><th>Case</th><th>Starts from</th><th>Checks</th><th>Steps cover</th><th>Can run here</th></tr></thead><tbody>${list.map((u) => `<tr><td><b>${esc(u.id)}</b><br><small>${esc(u.goal)}</small></td><td>${esc(u.startState)}${u.configs.length ? `<br><small>settings: ${esc(u.configs.map((x) => `${x.key} = ${JSON.stringify(x.value)}`).join(", "))}</small>` : ""}</td><td>${u.checks.map((k) => `<div><span class="pill idle">${esc(k.how)}</span> ${esc(k.what)}</div>`).join("")}</td><td>${u.layer === "api" ? "API test" : u.coverage ? `<span class="pill ${u.coverage === "full" ? "ok" : u.coverage === "partial" ? "warn" : "bad"}">${esc(u.coverage)}</span>${u.gaps?.length ? `<br><small>${esc(u.gaps.join("; "))}</small>` : ""}` : "-"}</td><td>${u.canRunHere ? `<span class="pill ok">yes</span>` : `<span class="pill bad">no</span><br><small>${esc(u.whyNot || "")}</small>`}</td></tr>`).join("")}</tbody></table>`;
  }

  function campHtml(mods) {
    const c = S.camp?.campaign;
    const keyOf = (m) => (m.match(/^(\d+[A-Z]?)/) || [])[1] || m;
    const pick = `<select id="sht-from">${mods.map((m) => `<option value="${esc(keyOf(m))}" ${keyOf(m) === S.from ? "selected" : ""}>Start from ${esc(m)}</option>`).join("")}</select>`;
    if (c && S.camp.running) {
      const done = c.modules.reduce((n, m) => n + m.done.length, 0), total = c.modules.reduce((n, m) => n + m.ids.length, 0);
      const k = S.camp.counts || {};
      return `<div class="sht-camphead"><b>The whole sheet is running on its own — ${done} of ${total} cases done</b>
        <span class="pill ok">${k.Pass || 0} pass</span><span class="pill bad">${k.Fail || 0} fail</span><span class="pill warn">${k["Partly checked"] || 0} partly</span><span class="pill idle">${(k["Couldn't tell"] || 0) + (k["Not run"] || 0)} not checked</span>
        <span class="sht-hint" style="flex-basis:auto">${S.camp.repaired} repaired by the agent · ${S.camp.backlog} on the automation backlog</span>
        <a class="btn primary" href="${esc(S.camp.report)}" target="_blank" rel="noopener">Campaign report</a><button class="btn" id="sht-camp-stop">Stop</button></div>
        <div class="sht-runbody"><div class="sht-live"><img id="sht-camp-frame" src="/api/sheets/campaign/frame?t=${Date.now()}" alt="The browser the run is driving" onerror="this.style.display='none'"></div>
        <div>${c.current ? `<p><b>Now:</b> ${esc(c.current.caseId)} — ${esc(c.current.title)}<br><span class="sht-hint">${esc(c.current.module)} · case ${c.current.index} of ${c.current.total}</span></p>` : ""}
        <ol class="sht-done">${c.modules.map((m) => `<li><b>${esc(m.name.replace(/ — .*/, ""))}</b> — ${m.done.length}/${m.ids.length}${m.status === "done" ? " ✓" : m.status === "running" ? " (running)" : ""}</li>`).join("")}</ol></div></div>`;
    }
    return `<div class="sht-camphead"><b>Run the whole sheet on its own</b><span class="sht-hint" style="flex-basis:auto">Module by module in flow order, one case at a time; the agent repairs its own automation where it can, carries on after a restart, and lists what it could not build.</span></div>
      <div class="sht-filters">${pick}<button class="btn primary" id="sht-camp-go" ${S.sheet ? "" : "disabled"}>Start the whole sheet</button>${c ? `<a class="btn" href="${esc(S.camp.report)}" target="_blank" rel="noopener">Last campaign report (${esc(c.status)})</a>` : ""}</div>`;
  }

  function row(c) {
    const on = S.picked.has(c.id);
    const open = S.open.has(c.id);
    return `<li class="sht-case ${open ? "open" : ""}" data-id="${esc(c.id)}">
      <div class="sht-row"><input type="checkbox" class="sht-pick" ${on ? "checked" : ""} aria-label="Tick ${esc(c.id)}">
        <button class="sht-title"><span class="sht-id">${esc(c.id)}</span><span>${esc(c.title)}<small>${esc(c.module)} · ${esc(c.layer === "api" ? "API" : c.portal)} · ${esc(c.startsFrom)}</small></span></button>
        <span class="pill ${c.priority === "Critical" ? "bad" : c.priority === "High" ? "warn" : "idle"}">${esc(c.priority)}</span>
        <button class="btn sht-one" ${S.run?.live ? "disabled" : ""}>Run this case</button></div>
      ${open ? `<div class="sht-body"><p><b>Before you start:</b> ${esc(c.preconditions)}</p>${c.configs && c.configs !== "None" ? `<p><b>Configs needed:</b> ${esc(c.configs)}</p>` : ""}${c.testData && c.testData !== "-" ? `<p><b>Test data:</b> ${esc(c.testData)}</p>` : ""}<ol>${c.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><p class="sht-exp"><b>What you should see:</b> ${esc(c.expected)}</p>${c.reference ? `<p class="sht-hint" style="flex-basis:auto"><b>Reference:</b> ${esc(c.reference)}</p>` : ""}</div>` : ""}
    </li>`;
  }

  function wire() {
    q("#sht-sheet")?.addEventListener("change", (e) => { S.sheet = e.target.value; S.picked.clear(); S.mod = ""; load(); });
    q("#sht-q")?.addEventListener("input", (e) => { S.qtext = e.target.value; clearTimeout(wire.t); wire.t = setTimeout(paint, 200); });
    q("#sht-mod")?.addEventListener("change", (e) => { S.mod = e.target.value; paint(); });
    q("#sht-all")?.addEventListener("click", () => { shown().forEach((c) => S.picked.add(c.id)); paint(); });
    q("#sht-none")?.addEventListener("click", () => { S.picked.clear(); paint(); });
    q("#sht-go")?.addEventListener("click", () => start([...S.picked]));
    q("#sht-single-go")?.addEventListener("click", () => startSingle(false));
    q("#sht-single-dry")?.addEventListener("click", () => startSingle(true));
    q("#sht-text")?.addEventListener("input", (e) => { S.single = S.single || {}; S.single.text = e.target.value; });
    q("#sht-understand")?.addEventListener("click", understandPicked);
    q("#sht-und-close")?.addEventListener("click", () => { S.und = null; paint(); });
    if (S.single) window.spineSingle.wire(root(), S.single, { onAdded: (r) => { S.sheet = r.sheet; load(); } });
    q("#sht-file")?.addEventListener("change", upload);
    q("#sht-from")?.addEventListener("change", (e) => (S.from = e.target.value));
    q("#sht-camp-go")?.addEventListener("click", async () => {
      const r = await fetch("/api/sheets/campaign/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sheet: S.sheet, from: S.from, companyId: clientId() }) }).then((x) => x.json()).catch(() => ({ why: "The server did not answer." }));
      if (r.why) alertBox(r.why);
      load();
    });
    q("#sht-camp-stop")?.addEventListener("click", async () => { await fetch("/api/sheets/campaign/stop", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); load(); });
    root().querySelectorAll(".sht-case").forEach((li) => {
      const id = li.dataset.id;
      q(".sht-pick", li).addEventListener("change", (e) => { e.target.checked ? S.picked.add(id) : S.picked.delete(id); const b = q("#sht-go"); if (b) { b.disabled = !S.picked.size || !!S.run?.live; b.textContent = `Run ${S.picked.size || ""} ticked case${S.picked.size === 1 ? "" : "s"} one by one`; } });
      q(".sht-title", li).addEventListener("click", () => { S.open.has(id) ? S.open.delete(id) : S.open.add(id); paint(); });
      q(".sht-one", li).addEventListener("click", () => start([id]));
    });
  }

  async function upload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const buf = await f.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const r = await fetch("/api/sheets/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.name, data: btoa(bin) }) }).then((x) => x.json()).catch(() => ({ why: "The upload did not reach the server." }));
    if (r.why) { alertBox(r.why); return; }
    S.sheet = r.sheet.id;
    S.picked.clear();
    alertBox(`Imported "${r.sheet.name}": ${r.sheet.count} test cases${r.sheet.skipped ? ` (${r.sheet.skipped} rows skipped — no title or no steps)` : ""}.`, "ok");
    load();
  }
  function alertBox(text, tone = "bad") {
    const el = document.createElement("p");
    el.className = `sht-msg ${tone}`;
    el.textContent = text;
    root().prepend(el);
    setTimeout(() => el.remove(), 9000);
  }

  async function understandPicked() {
    const ids = [...S.picked];
    if (!ids.length) return;
    S.und = { loading: true, n: ids.length };
    paint();
    const r = await fetch(`/api/sheets/understand?sheet=${encodeURIComponent(S.sheet)}&ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ understood: [] }));
    S.und = { list: r.understood || [] };
    paint();
    q("#sht-und")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function startSingle(dry) {
    const text = (q("#sht-text")?.value || "").trim();
    if (!text || S.single?.live || S.run?.live) return;
    const headed = !!q("#sht-single-headed")?.checked;
    const repaint = () => { const el = q("#sht-single"); if (el) { el.innerHTML = singleHtml(); wire(); } };
    S.singleRun?.stop?.();
    S.singleRun = window.spineSingle.start({ text, client: clientId(), headed, dry, onState: (g) => { S.single = g; repaint(); if (!g.live) load(); } });
  }

  function start(ids) {
    if (!ids.length || S.run?.live) return;
    const headed = q("#sht-headed")?.checked ? "1" : "0";
    S.run = { live: true, total: ids.length, done: [], current: null, lines: [], frame: null, runId: null, end: null };
    paint();
    const es = new EventSource(`/api/sheets/run?sheet=${encodeURIComponent(S.sheet)}&ids=${encodeURIComponent(ids.join(","))}&headed=${headed}&c=${clientId()}`);
    S.es = es;
    es.addEventListener("case-start", (ev) => { const d = JSON.parse(ev.data); S.run.current = d; S.run.lines = []; paintRun(); });
    es.addEventListener("line", (ev) => { const d = JSON.parse(ev.data); S.run.lines.push(d.line); S.run.lines = S.run.lines.slice(-6); paintRun(); });
    es.addEventListener("frame", (ev) => { const d = JSON.parse(ev.data); S.run.frame = d.frame; const img = q("#sht-frame"); if (img) img.src = `data:image/jpeg;base64,${d.frame}`; });
    es.addEventListener("case-done", (ev) => { const d = JSON.parse(ev.data); S.run.done.push(d.result); S.run.current = null; paintRun(); });
    es.addEventListener("done", (ev) => { S.run.end = JSON.parse(ev.data); S.run.live = false; es.close(); paint(); load(); });
    es.addEventListener("run-error", (ev) => { S.run.end = { error: JSON.parse(ev.data).line }; S.run.live = false; es.close(); paint(); });
    es.onerror = () => { if (S.run?.live) { S.run.live = false; S.run.end = S.run.end || { error: "The live connection dropped. The run goes on on the server; its report will appear under Earlier runs." }; es.close(); paint(); } };
  }

  function paintRun() {
    const el = q("#sht-run");
    if (!el || !S.run) return;
    el.hidden = false;
    const r = S.run;
    const counts = {};
    r.done.forEach((c) => (counts[c.status] = (counts[c.status] || 0) + 1));
    el.innerHTML = `
      <div class="sht-runhead"><b>${r.live ? `Running ${r.done.length + (r.current ? 1 : 0)} of ${r.total}` : r.end?.error ? "The run stopped" : `Done — ${r.total} case${r.total === 1 ? "" : "s"} run one by one`}</b>
        <span>${Object.entries(counts).map(([k, v]) => `<span class="pill ${PILL[k]}">${v} ${esc(k)}</span>`).join(" ")}</span>
        ${r.live ? `<button class="btn" id="sht-stop">Stop after this case</button>` : ""}
        ${r.end?.report ? `<a class="btn primary" href="${esc(r.end.report)}" target="_blank" rel="noopener">Open the report</a><a class="btn" href="${esc(r.end.export)}">Download the results sheet</a>` : ""}</div>
      ${r.end?.error ? `<p class="sht-msg bad">${esc(r.end.error)}</p>` : ""}
      <div class="sht-runbody">
        <div class="sht-live">${r.frame ? `<img id="sht-frame" src="data:image/jpeg;base64,${r.frame}" alt="The browser the run is driving">` : `<p class="sht-hint">The browser picture appears here while a browser case runs.</p>`}
          ${r.current ? `<p><b>${esc(r.current.id)}</b> — ${esc(r.current.title)}</p><ul class="sht-lines">${r.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}</div>
        <ol class="sht-done">${r.done.map((c) => `<li><span class="pill ${PILL[c.status]}">${esc(c.status)}</span> <b>${esc(c.id)}</b> ${esc(c.title)}<small>${esc(c.why)}</small></li>`).join("")}</ol>
      </div>`;
    q("#sht-stop")?.addEventListener("click", async () => { await fetch("/api/sheets/stop", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); q("#sht-stop").textContent = "Stopping after this case…"; });
  }

  function route() {
    if (location.hash.startsWith("#/sheets")) load();
  }
  // while a campaign runs, refresh its panel (counts, current case, the live picture) every 8 s
  setInterval(async () => {
    if (!location.hash.startsWith("#/sheets") || !S.camp?.running) return;
    S.camp = await fetch("/api/sheets/campaign", { cache: "no-store" }).then((x) => x.json()).catch(() => S.camp);
    const el = q("#sht-camp");
    if (el) {
      el.innerHTML = campHtml([...new Set(S.cases.map((c) => c.module))]);
      q("#sht-camp-stop")?.addEventListener("click", async () => { await fetch("/api/sheets/campaign/stop", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); load(); });
    }
  }, 8000);
  window.addEventListener("hashchange", route);
  route();
})();
