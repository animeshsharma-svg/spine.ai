/**
 * Single-case mode, shared by Home (home.js) and Test sheets (sheets.js): typed words run as ONE TEST CASE.
 *
 *   window.spineSingle.start({ text, client, headed, dry, layer, onState })  streams /api/sheets/single and
 *       calls onState(state) on every change; state = { text, live, lines, case, source, note, und, sugg,
 *       end, error, run: { current, lines, frame, done } }
 *   window.spineSingle.render(state)        the whole output block as HTML (case card, understanding, the
 *       live run with the browser picture, the verdict, the suggested cases)
 *   window.spineSingle.wire(el, state, opts) binds the "Add to Typed test cases" buttons inside `el`
 */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const PILL = { Pass: "ok", Fail: "bad", "Partly checked": "warn", "Couldn't tell": "idle", "Not run": "idle" };
  const pri = (p) => (p === "Critical" ? "bad" : p === "High" ? "warn" : "idle");

  function caseCard(c, source, note) {
    const f = (k, v) => `<div class="sht-f"><b>${esc(k)}</b><span>${esc(v)}</span></div>`;
    return `<div class="sht-cc"><div class="sht-cchead"><span class="sht-id">${esc(c.id)}</span><b>${esc(c.title)}</b><span class="pill ${pri(c.priority)}">${esc(c.priority)}</span><span class="pill idle">${esc(c.testType)}</span><span class="pill idle">${esc(c.layer === "api" ? "API" : c.portal)}</span>${source === "sheet" ? `<span class="pill ok">from the sheet</span>` : source === "ai" ? `<span class="pill ok">rewritten in house format</span>` : `<span class="pill warn">read as typed</span>`}</div>
      ${note ? `<p class="sht-hint">${esc(note)}</p>` : ""}
      <div class="sht-grid">${f("Module", c.module)}${f("Scenario", c.scenario)}${f("User role", c.role)}${f("Portal", c.portal)}${f("Pre-conditions", c.preconditions)}${f("Configs needed", c.configs || "None")}${f("Test data", c.testData)}</div>
      <div class="sht-cols"><div><b>Test steps</b><ol>${c.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div><div><b>Expected result</b><p class="sht-exp">${esc(c.expected)}</p></div></div></div>`;
  }
  function undCard(u) {
    return `<div class="sht-uc"><div class="sht-cchead"><b>What the platform understood</b>${u.canRunHere ? `<span class="pill ok">can run here</span>` : `<span class="pill bad">cannot run here</span>`}${u.coverage ? `<span class="pill ${u.coverage === "full" ? "ok" : u.coverage === "partial" ? "warn" : "bad"}">steps cover: ${esc(u.coverage)}</span>` : ""}</div>
      <div class="sht-grid"><div class="sht-f"><b>Goal</b><span>${esc(u.goal)}</span></div><div class="sht-f"><b>Who acts</b><span>${esc(u.actor)}</span></div><div class="sht-f"><b>Where</b><span>${esc(u.where.join(" · "))}</span></div><div class="sht-f"><b>Starts from</b><span>${esc(u.startState)}</span></div>
      <div class="sht-f"><b>Company settings</b><span>${u.configs.length ? esc(u.configs.map((x) => `${x.key} = ${JSON.stringify(x.value)}${x.why ? ` — ${x.why}` : ""}`).join("; ")) : u.configPhrase ? esc(`looked up from the pre-condition: "${u.configPhrase}"`) : "none"}</span></div><div class="sht-f"><b>Kind</b><span>${esc(u.kind.join(", "))}</span></div></div>
      <div class="sht-cols"><div><b>Checks it will make</b><ol class="sht-checks">${u.checks.map((k) => `<li><span class="pill idle">${esc(k.how)}</span> ${esc(k.what)}</li>`).join("")}</ol></div>
      <div>${u.plannedSteps?.length ? `<b>How it will run (${u.plannedSteps.length} steps)</b><ol class="sht-steps">${u.plannedSteps.map((x) => `<li><code>${esc(x)}</code></li>`).join("")}</ol>` : ""}${u.gaps?.length ? `<p class="sht-hint"><b>Not covered by any step:</b> ${esc(u.gaps.join("; "))}</p>` : ""}${u.whyNot ? `<p class="sht-msg bad">${esc(u.whyNot)}</p>` : ""}</div></div></div>`;
  }
  function runCard(r) {
    if (!r) return "";
    const d = r.done;
    return `<div class="sht-uc"><div class="sht-cchead"><b>${d ? "The run" : "Running it now"}</b>${d ? `<span class="pill ${PILL[d.status] || "idle"}">${esc(d.status)}</span>` : `<span class="pill warn">live</span>`}</div>
      <div class="sht-runbody"><div class="sht-live">${r.frame ? `<img class="sht-frame" src="data:image/jpeg;base64,${r.frame}" alt="The browser the run is driving">` : `<p class="sht-hint">The browser picture appears here while a browser case runs; an API case shows its requests below.</p>`}
        ${r.lines.length && !d ? `<ul class="sht-lines">${r.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}</div>
      <div>${d ? `<p class="why"><b>${esc(d.why)}</b></p>${d.steps?.length ? `<ol class="sht-did">${d.steps.map((s) => `<li class="${esc(s.outcome)}">${esc(s.words)}${s.outcome === "failed" && s.detail ? `<em>${esc(s.detail)}</em>` : ""}</li>`).join("")}</ol>` : ""}${d.bug ? `<div class="sht-bug"><b>Bug row</b> · ${esc(d.bug.severity)}<div>${esc(d.bug.title)}</div><small>${esc(d.bug.whatHappened)}</small>${d.bug.appSaid ? `<small>The app said: “${esc(d.bug.appSaid)}”</small>` : ""}</div>` : ""}` : `<p class="sht-hint">${esc(r.current?.title || "")}</p>`}</div></div></div>`;
  }
  function endCard(e) {
    if (!e || e.dry) return "";
    if (e.notRun) return `<div class="sht-uc"><div class="sht-cchead"><span class="pill idle">Not run</span><b>${esc(e.notRun)}</b></div></div>`;
    return `<div class="sht-filters">${e.report ? `<a class="btn primary" href="${esc(e.report)}" target="_blank" rel="noopener">Open the report (screenshots, the bug row)</a><a class="btn" href="${esc(e.export)}">Download the results sheet</a>` : ""}<a class="btn" href="#/sheets">All typed cases</a></div>`;
  }
  function suggCard(list) {
    return `<div class="sht-uc"><div class="sht-cchead"><b>Cases worth adding beside it</b><span class="sht-hint" style="flex-basis:auto">Not saved until you add them.</span></div>
      <ol class="sht-sugg">${list.map((c, i) => `<li><div><span class="pill idle">${esc(c.testType)}</span> <b>${esc(c.title)}</b><small>${esc(c.preconditions)}</small><ol>${c.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol><p class="sht-exp">${esc(c.expected)}</p></div><div><button type="button" class="btn sht-sugg-add" data-i="${i}">Add to Typed test cases</button></div></li>`).join("")}</ol></div>`;
  }
  function render(g) {
    if (!g) return "";
    return `<div class="sht-singleout">${g.lines?.length && g.live && !g.run ? `<ul class="sht-lines">${g.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}${g.case ? caseCard(g.case, g.source, g.note) : ""}${g.und ? undCard(g.und) : ""}${runCard(g.run)}${endCard(g.end)}${g.sugg?.length ? suggCard(g.sugg) : g.end && !g.end.dry && !g.end.notRun ? `<p class="sht-hint">No extra cases were suggested.</p>` : ""}${g.error ? `<p class="sht-msg bad">${esc(g.error)}</p>` : ""}</div>`;
  }
  function wire(el, g, opts = {}) {
    el.querySelectorAll(".sht-sugg-add").forEach((b) =>
      b.addEventListener("click", async () => {
        const c = g.sugg?.[Number(b.dataset.i)];
        if (!c) return;
        const r = await fetch("/api/sheets/add", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cases: [c] }) }).then((x) => x.json()).catch(() => ({ why: "The server did not answer." }));
        if (r.why) { b.textContent = r.why; return; }
        b.textContent = `Added as ${r.added[0].id}`;
        b.disabled = true;
        opts.onAdded?.(r);
      }),
    );
  }
  /** Stream one typed case. Returns { stop }. */
  function start({ text, client, headed, dry, layer, onState }) {
    const g = { text, live: true, lines: [], case: null, source: null, note: null, und: null, sugg: null, end: null, error: null, run: null };
    const tell = () => onState(g);
    tell();
    const qs = `text=${encodeURIComponent(text)}&c=${client || 198678}&headed=${headed ? "1" : "0"}&dry=${dry ? "1" : "0"}${layer ? `&layer=${layer}` : ""}`;
    const es = new EventSource(`/api/sheets/single?${qs}`);
    es.addEventListener("line", (ev) => { const d = JSON.parse(ev.data); if (d.id === "typed") { g.lines.push(d.line); g.lines = g.lines.slice(-4); } else if (g.run) { g.run.lines.push(d.line); g.run.lines = g.run.lines.slice(-6); } tell(); });
    es.addEventListener("case", (ev) => { const d = JSON.parse(ev.data); g.case = d.case; g.source = d.source; g.note = d.note; tell(); });
    es.addEventListener("understanding", (ev) => { g.und = JSON.parse(ev.data); tell(); });
    es.addEventListener("case-start", (ev) => { g.run = { current: JSON.parse(ev.data), lines: [], frame: null, done: null }; tell(); });
    es.addEventListener("frame", (ev) => { const d = JSON.parse(ev.data); if (!g.run) g.run = { current: null, lines: [], frame: null, done: null }; g.run.frame = d.frame; const img = document.querySelector(".sht-frame"); if (img) img.src = `data:image/jpeg;base64,${d.frame}`; else tell(); });
    es.addEventListener("case-done", (ev) => { const d = JSON.parse(ev.data); if (!g.run) g.run = { current: null, lines: [], frame: null, done: null }; g.run.done = d.result; tell(); });
    es.addEventListener("suggestions", (ev) => { g.sugg = JSON.parse(ev.data).cases || []; tell(); });
    es.addEventListener("done", (ev) => { g.end = JSON.parse(ev.data); g.live = false; es.close(); tell(); });
    es.addEventListener("run-error", (ev) => { g.error = JSON.parse(ev.data).line; g.live = false; es.close(); tell(); });
    es.onerror = () => { if (g.live) { g.live = false; g.error = g.error || "The live connection dropped. If a run had started it goes on on the server; its report is under Test sheets → Earlier runs."; es.close(); tell(); } };
    return { stop: () => es.close() };
  }
  /**
   * Typed words that read as a TEST CASE rather than a flow to walk: a pasted case (Steps / Expected /
   * Pre-conditions headings, numbered steps) or a sentence with something to check at the end (check,
   * verify, expect, should, must, is shown, is refused).
   */
  const HEADINGS = /\b(expected( result)?|pre-?conditions?|test steps|steps|test data|actual result)\s*[:\-]/i;
  const NUMBERED = /(^|\n)\s*\d+[.)]\s+\S/;
  const CHECK = /\b(check|verify|expect(ed|s)?|should|must|assert|make sure|confirm|is (shown|visible|listed|refused|rejected|accepted|not (shown|offered|allowed)))\b/i;
  const looksLikeCase = (text) => {
    const t = String(text || "");
    return HEADINGS.test(t) || (NUMBERED.test(t) && CHECK.test(t)) || CHECK.test(t);
  };
  /** Words that read as a FEATURE / PRD / FLOW to derive the permutations from, not one case and not a journey. */
  const looksLikeDerivation = (text) => {
    const t = String(text || "").trim();
    if (/\b(prd|acceptance criteria|user stor(y|ies)|requirements?|feature:|scope:|overview:)\b/i.test(t)) return true;
    if (t.length > 900 || t.split(/\n\s*\n/).length >= 3) return true;
    const w = t.split(/\s+/);
    return w.length <= 14 && /^(test|cover|derive|cases? for|feature|what (can|could) break|all (the )?cases)\b/i.test(t) && !/\b(and|then)\b/i.test(t);
  };
  const DIM_WORDS = { positive: "Main path", permission: "Permissions", state: "Event states", setting: "Company settings", "data-edge": "Awkward values", negative: "Refusals", timing: "Timing", channel: "API / other channels", calculation: "Numbers", visibility: "Who sees what" };
  function deriveCard(g) {
    const d = g.derivation;
    const cases = g.cases || [];
    const byDim = {};
    cases.forEach((c) => (byDim[c.dimension] = (byDim[c.dimension] || 0) + 1));
    const fresh = cases.filter((c) => !c.already).length;
    return `<div class="sht-uc"><div class="sht-cchead"><b>${g.live ? "Deriving the test cases" : `${cases.length} test cases derived`}</b>${g.und ? `<span class="pill idle">${esc(g.und.kind)}</span><span class="pill idle">${esc(g.und.module)}</span>` : ""}${!g.live && d ? `<span class="pill ok">${fresh} new</span><span class="pill idle">${cases.length - fresh} already in the catalog</span><span class="pill ${g.questions?.length ? "warn" : "idle"}">${(g.questions || []).length} questions</span>` : ""}</div>
      ${g.und ? `<div class="sht-grid"><div class="sht-f"><b>Under test</b><span>${esc(g.und.subject)}</span></div><div class="sht-f"><b>Who</b><span>${esc((g.und.actors || []).join(" · "))}</span></div><div class="sht-f"><b>Actions</b><span>${esc((g.und.actions || []).join(" · "))}</span></div><div class="sht-f"><b>States</b><span>${esc((g.und.states || []).join(" · "))}</span></div></div>` : ""}
      ${g.grounding ? `<p class="sht-hint">Grounded in ${g.grounding.rules} code rules, ${g.grounding.settings} company settings, ${g.grounding.defects} past defects (RCA), ${g.grounding.product} product-sheet features, ${g.grounding.facts} memory facts; ${g.grounding.existing} cases already written were read first.</p>` : ""}
      ${g.lines?.length && g.live ? `<ul class="sht-lines">${g.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
      ${cases.length ? `<div class="sht-dims">${Object.entries(byDim).map(([k, v]) => `<span class="pill idle">${esc(DIM_WORDS[k] || k)}: ${v}</span>`).join(" ")}</div>
      <ol class="sht-sugg">${cases.map((c) => `<li><div><span class="pill ${c.already ? "idle" : c.testType === "Negative" ? "warn" : "ok"}">${esc(DIM_WORDS[c.dimension] || c.dimension)}</span> <span class="sht-id">${esc(c.already ? c.already.id : c.id)}</span> <b>${esc(c.title)}</b>${c.already ? `<small>Already in the catalog as ${esc(c.already.id)}: ${esc(c.already.title)}</small>` : ""}<small>${esc(c.role)} · ${esc(c.portal)} · ${esc(c.runnable === "manual" ? `for a person — ${c.whyManual}` : c.runnable === "api" ? "runs through the API" : "runs in the browser")}${c.permission ? ` · hinges on: ${esc(c.permission)}` : ""}</small><small>Starts from: ${esc(c.preconditions)}${c.configs && c.configs !== "None" ? ` · Settings: ${esc(c.configs)}` : ""}</small><ol>${c.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol><p class="sht-exp">${esc(c.expected)}</p><small>Grounded in: ${esc((c.grounded || []).join(", "))}</small></div></li>`).join("")}</ol>` : ""}
      ${g.questions?.length ? `<div class="sht-cchead"><b>Questions this raised (not guessed)</b></div><ol class="sht-checks">${g.questions.map((q) => `<li><b>${esc(q.question)}</b><br><small>${esc(q.why)} Until answered: ${esc(q.assume)}</small></li>`).join("")}</ol>` : ""}
      ${!g.live && d ? `<div class="sht-filters"><a class="btn primary" href="#/sheets" id="sht-derive-open" data-sheet="${esc(d.sheet)}">Open the sheet "${esc(d.sheet)}" — understand, then run</a><a class="btn" href="/api/sheets/questions?format=xlsx">Download all product questions</a></div>` : ""}
      ${g.error ? `<p class="sht-msg bad">${esc(g.error)}</p>` : ""}</div>`;
  }
  function startDerive({ text, client, max, onState }) {
    const g = { text, live: true, lines: [], und: null, grounding: null, cases: [], questions: [], derivation: null, error: null };
    const tell = () => onState(g);
    tell();
    const es = new EventSource(`/api/sheets/derive?text=${encodeURIComponent(text)}&c=${client || 198678}&max=${max || 40}`);
    es.addEventListener("line", (ev) => { g.lines.push(JSON.parse(ev.data).line); g.lines = g.lines.slice(-4); tell(); });
    es.addEventListener("understanding", (ev) => { g.und = JSON.parse(ev.data); tell(); });
    es.addEventListener("grounding", (ev) => { g.grounding = JSON.parse(ev.data).counts; tell(); });
    es.addEventListener("cases", (ev) => { g.cases = JSON.parse(ev.data).cases || []; tell(); });
    es.addEventListener("questions", (ev) => { g.questions = JSON.parse(ev.data).questions || []; tell(); });
    es.addEventListener("done", (ev) => { g.derivation = JSON.parse(ev.data).derivation; g.live = false; es.close(); tell(); });
    es.addEventListener("run-error", (ev) => { g.error = JSON.parse(ev.data).line; g.live = false; es.close(); tell(); });
    es.onerror = () => { if (g.live) { g.live = false; g.error = g.error || "The live connection dropped. The derivation goes on on the server; its sheet appears under Test sheets."; es.close(); tell(); } };
    return { stop: () => es.close() };
  }
  window.spineSingle = { caseCard, undCard, runCard, endCard, suggCard, render, wire, start, looksLikeCase, looksLikeDerivation, deriveCard, startDerive };
})();
