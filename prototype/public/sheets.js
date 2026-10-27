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
  const S = { sheets: [], sheet: "", cases: [], picked: new Set(), qtext: "", mod: "", open: new Set(), es: null, run: null, runs: [] };
  const PILL = { Pass: "ok", Fail: "bad", "Partly checked": "warn", "Couldn't tell": "idle", "Not run": "idle" };

  function clientId() {
    const n = Number(q("#client")?.value);
    return n > 0 ? n : 198678;
  }

  async function load() {
    if (!root()) return;
    const r = await fetch("/api/sheets", { cache: "no-store" }).then((x) => x.json()).catch(() => ({ sheets: [] }));
    S.sheets = r.sheets || [];
    if (!S.sheet || !S.sheets.some((s) => s.id === S.sheet)) S.sheet = S.sheets[0]?.id || "";
    const runs = await fetch("/api/sheets/runs", { cache: "no-store" }).then((x) => x.json()).catch(() => ({ runs: [] }));
    S.runs = runs.runs || [];
    if (S.sheet) {
      const c = await fetch(`/api/sheets/cases?sheet=${encodeURIComponent(S.sheet)}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ cases: [] }));
      S.cases = c.cases || [];
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
      <div class="sht-run" id="sht-run" ${S.run ? "" : "hidden"}></div>
      <div class="sht-filters">
        <input type="search" id="sht-q" placeholder="Search IDs, titles, steps, expected results" value="${esc(S.qtext)}">
        <select id="sht-mod"><option value="">All modules</option>${mods.map((m) => `<option ${m === S.mod ? "selected" : ""}>${esc(m)}</option>`).join("")}</select>
        <button class="btn" id="sht-all">Tick all shown (${list.length})</button>
        <button class="btn" id="sht-none">Untick all</button>
        <label class="sht-check"><input type="checkbox" id="sht-headed"> Watch the browser</label>
        <button class="btn primary" id="sht-go" ${S.picked.size && !S.run?.live ? "" : "disabled"}>Run ${S.picked.size || ""} ticked case${S.picked.size === 1 ? "" : "s"} one by one</button>
      </div>
      <ol class="sht-list">${list.slice(0, 400).map(row).join("")}</ol>
      ${list.length > 400 ? `<p class="sht-hint">Showing the first 400 of ${list.length}. Narrow the search or pick a module to see the rest.</p>` : ""}
      ${S.runs.length ? `<section class="sht-past"><h3>Earlier runs</h3><ul>${S.runs.map((r) => `<li><a href="/api/sheets/report?run=${r.id}" target="_blank" rel="noopener">${esc(new Date(r.startedAt).toLocaleString())} · ${esc(r.sheet)} · ${r.total} case${r.total === 1 ? "" : "s"}</a> <span>${Object.entries(r.counts).map(([k, v]) => `${v} ${esc(k.toLowerCase())}`).join(" · ")}</span> <a href="/api/sheets/export?run=${r.id}&format=xlsx">results sheet</a></li>`).join("")}</ul></section>` : ""}`;
    wire();
    if (S.run) paintRun();
  }

  function row(c) {
    const on = S.picked.has(c.id);
    const open = S.open.has(c.id);
    return `<li class="sht-case ${open ? "open" : ""}" data-id="${esc(c.id)}">
      <div class="sht-row"><input type="checkbox" class="sht-pick" ${on ? "checked" : ""} aria-label="Tick ${esc(c.id)}">
        <button class="sht-title"><span class="sht-id">${esc(c.id)}</span><span>${esc(c.title)}<small>${esc(c.module)} · ${esc(c.layer === "api" ? "API" : c.portal)} · ${esc(c.startsFrom)}</small></span></button>
        <span class="pill ${c.priority === "Critical" ? "bad" : c.priority === "High" ? "warn" : "idle"}">${esc(c.priority)}</span>
        <button class="btn sht-one" ${S.run?.live ? "disabled" : ""}>Run this case</button></div>
      ${open ? `<div class="sht-body"><p><b>Before you start:</b> ${esc(c.preconditions)}</p>${c.testData && c.testData !== "-" ? `<p><b>Test data:</b> ${esc(c.testData)}</p>` : ""}<ol>${c.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><p class="sht-exp"><b>What you should see:</b> ${esc(c.expected)}</p></div>` : ""}
    </li>`;
  }

  function wire() {
    q("#sht-sheet")?.addEventListener("change", (e) => { S.sheet = e.target.value; S.picked.clear(); S.mod = ""; load(); });
    q("#sht-q")?.addEventListener("input", (e) => { S.qtext = e.target.value; clearTimeout(wire.t); wire.t = setTimeout(paint, 200); });
    q("#sht-mod")?.addEventListener("change", (e) => { S.mod = e.target.value; paint(); });
    q("#sht-all")?.addEventListener("click", () => { shown().forEach((c) => S.picked.add(c.id)); paint(); });
    q("#sht-none")?.addEventListener("click", () => { S.picked.clear(); paint(); });
    q("#sht-go")?.addEventListener("click", () => start([...S.picked]));
    q("#sht-file")?.addEventListener("change", upload);
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
  window.addEventListener("hashchange", route);
  route();
})();
