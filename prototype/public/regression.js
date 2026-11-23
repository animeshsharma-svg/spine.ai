/**
 * REGRESSION SUITE (#/regression) — every test case the platform holds, module by module in the order a buyer
 * walks the product, each in plain words, each connected to the event it starts from.
 *
 *   The left card is the suite: modules → features → cases (UI and API side by side), with a search and filters.
 *   The right card is your run: what is ticked, where on the flow (Draft → Publish → Bid → Evaluate → Award → PO)
 *   it sits, the set-up events it rests on, what cannot run yet, a time estimate, and the Run button. A run goes
 *   through the sheet runner (one browser; each case builds its own start state), and ends with the tally, the
 *   report and the Bugs page for that run, with every bug in plain words.
 *
 *   TICKING FOLLOWS THE FLOW. A case rests on a start state (a live RFQ, two bids, a closed event…); the set-up
 *   nodes for those states form a chain. Ticking a case ticks its chain and nothing else — a case that does not
 *   depend on it is never pulled in. Unticking a set-up node unticks everything resting on it. A set-up node left
 *   with nothing resting on it drops out by itself.
 *
 * Data: GET /api/regression (the suite), GET /api/regression/case?key=, POST /api/regression/run (SSE),
 *       POST /api/regression/rebuild, GET /api/findings (the run's bugs, plain). Loaded after app.js.
 */
(function () {
  "use strict";
  const q = (s, el = document) => el.querySelector(s);
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const root = () => q("#rg-root");
  const plural = (n, w) => `${fmt(n)} ${w}${n === 1 ? "" : "s"}`;

  const PRI_WORD = { P0: "Critical", P1: "High", P2: "Medium", P3: "Low" };
  const RUN = {
    now: ["Runs now", "ok", "The automation has every step; it runs as written."],
    partly: ["Runs, part checked", "warn", "It runs; one part of the case has no step yet, so it comes back “Partly checked”."],
    compile: ["Compiles at run time", "", "No stored plan yet: the run turns the steps into browser actions first (20–60 s)."],
    "needs-step": ["Needs a step", "warn", "A step of this case has no automation yet; it comes back “Not run”."],
    later: ["Automate later", "", "Written to be automated later; it comes back “Not run”."],
    manual: ["Manual", "", "Written for a person to do; it comes back “Not run”."],
    spec: ["Not in the product yet", "", "A specification for a roadmap feature; nothing to run against."],
  };
  const CANT = new Set(["needs-step", "later", "manual", "spec"]);
  const MIN = { ui: 4, api: 0.5 };

  const S = {
    suite: null, cases: [], byKey: new Map(), byModule: new Map(), byFeature: new Map(), setup: new Map(),
    picked: new Set(), pinned: new Set(), open: new Set(), openF: new Set(),
    q: "", f: { layer: "", pri: "", run: "", stage: "" }, depth: "all",
    run: null, drawer: null, err: null, loading: false, rebuilding: false,
  };

  const clientId = () => { const n = Number(q("#client")?.value); return n > 0 ? n : 198678; };

  // ── load ─────────────────────────────────────────────────────────────────
  async function load(force) {
    if (!root()) return;
    if (S.suite && !force) { render(); return; }
    S.loading = true; S.err = null; render();
    try {
      const r = await fetch("/api/regression", { cache: "no-store" });
      if (!r.ok) throw new Error(`the suite did not load (${r.status})`);
      const j = await r.json();
      const cols = j.columns;
      S.cases = j.rows.map((row) => { const o = {}; cols.forEach((k, i) => { o[k] = row[i]; }); return o; });
      S.byKey = new Map(S.cases.map((c) => [c.key, c]));
      S.byModule = new Map(); S.byFeature = new Map();
      for (const c of S.cases) {
        if (!S.byModule.has(c.module)) S.byModule.set(c.module, []);
        S.byModule.get(c.module).push(c);
        const fk = `${c.module}|${c.feature}`;
        if (!S.byFeature.has(fk)) S.byFeature.set(fk, []);
        S.byFeature.get(fk).push(c);
      }
      S.setup = new Map(j.setup.map((n) => [n.id, n]));
      S.suite = j;
      // keep yesterday's ticks on this computer
      try { const kept = JSON.parse(localStorage.getItem("rg.picked") || "[]"); for (const k of kept) if (S.byKey.has(k) || S.setup.has(k)) S.picked.add(k); } catch {}
      sweep();
    } catch (e) { S.err = e.message; }
    S.loading = false;
    render();
  }

  // ── the chain ────────────────────────────────────────────────────────────
  const chain = (needs) => { const out = []; let n = needs; while (n && S.setup.has(n) && !out.includes(n)) { out.push(n); n = S.setup.get(n).needs; } return out; };
  function tick(key) {
    let c = S.byKey.get(key);
    while (c) { S.picked.add(c.key); for (const n of chain(c.needs)) S.picked.add(n); c = c.prev ? S.byKey.get(c.prev) : null; }
  }
  function untick(key) {
    S.picked.delete(key);
    // the parts that continue from it cannot stand without it
    for (let grew = true; grew;) { grew = false; for (const k of [...S.picked]) { const c = S.byKey.get(k); if (c?.prev && !S.picked.has(c.prev)) { S.picked.delete(k); grew = true; } } }
    sweep();
  }
  function tickSetup(id) { S.pinned.add(id); S.picked.add(id); for (const n of chain(S.setup.get(id)?.needs)) S.picked.add(n); }
  function untickSetup(id) {
    // the node and every node built from it; then every case resting on any of them
    const under = new Set([id]);
    let grew = true;
    while (grew) { grew = false; for (const n of S.setup.values()) if (n.needs && under.has(n.needs) && !under.has(n.id)) { under.add(n.id); grew = true; } }
    for (const k of [...S.picked]) {
      if (under.has(k)) { S.picked.delete(k); S.pinned.delete(k); continue; }
      const c = S.byKey.get(k);
      if (c && chain(c.needs).some((n) => under.has(n))) S.picked.delete(k);
    }
    sweep();
  }
  /** a set-up node stays while something ticked rests on it, or it was ticked itself */
  function sweep() {
    const need = new Set();
    for (const p of S.pinned) { need.add(p); for (const n of chain(S.setup.get(p)?.needs)) need.add(n); }
    for (const k of S.picked) { const c = S.byKey.get(k); if (c) for (const n of chain(c.needs)) need.add(n); }
    for (const k of [...S.picked]) if (k.startsWith("SETUP:") && !need.has(k)) S.picked.delete(k);
    try { localStorage.setItem("rg.picked", JSON.stringify([...S.picked])); } catch {}
  }
  const pickedCases = () => [...S.picked].filter((k) => !k.startsWith("SETUP:")).map((k) => S.byKey.get(k)).filter(Boolean);
  const pickedSetup = () => [...S.picked].filter((k) => k.startsWith("SETUP:")).map((k) => S.setup.get(k)).filter(Boolean);
  /** the set-up events a run builds through the screens: the ones ticked by hand and the ones a ticked case rests on
   *  DIRECTLY (the rest of the chain is the flow, shown, not run: the runner builds each case's own start state by API) */
  const runSetup = () => { const direct = new Set(S.pinned); for (const c of pickedCases()) if (c.needs) direct.add(c.needs); return [...direct].map((k) => S.setup.get(k)).filter((n) => n && n.caseId); };

  // ── filters ──────────────────────────────────────────────────────────────
  function matches(c) {
    const f = S.f;
    if (f.layer && c.layer !== f.layer) return false;
    if (f.pri && c.priority !== f.pri) return false;
    if (f.run && (f.run === "cant" ? !CANT.has(c.runnable) : c.runnable !== f.run)) return false;
    if (f.stage !== "" && String(c.stage) !== f.stage) return false;
    if (S.q) { const t = S.q.toLowerCase(); if (!(c.title.toLowerCase().includes(t) || c.id.toLowerCase().includes(t) || (c.state || "").includes(t))) return false; }
    return true;
  }
  const depthOk = (c) => S.depth === "all" || (S.depth === "p0p1" ? /^P[01]$/.test(c.priority) : c.priority === "P0");
  const stageWord = (i) => (i < 0 ? "no event" : S.suite.stages[i]);

  // ── render ───────────────────────────────────────────────────────────────
  function render() {
    const el = root();
    if (!el) return;
    if (S.loading && !S.suite) { el.innerHTML = `<div class="pl-card pl-list"><p class="pl-msg">Reading the suite…</p></div>`; return; }
    if (S.err && !S.suite) { el.innerHTML = `<div class="pl-card pl-list"><p class="pl-msg">${h(S.err)} · <button type="button" data-act="retry">Retry</button></p></div>`; wire(el); return; }
    const picked = pickedCases();
    el.innerHTML = `${listHtml()}${panelHtml(picked)}${S.drawer ? drawerHtml() : ""}`;
    const ctx = q("#rg-ctx");
    if (ctx) ctx.innerHTML = `<span class="rg-ctx">The regression suite: ${fmt(S.suite.counts.total)} cases · ${fmt(S.suite.counts.ui)} UI · ${fmt(S.suite.counts.api)} API${S.suite.counts.split ? ` · ${fmt(S.suite.counts.split)} long flows cut into one case per stage` : ""} · <button type="button" class="pl-link" data-act="rebuild"${S.rebuilding ? " disabled" : ""}>${S.rebuilding ? "Reading the stores…" : "Read the stores again"}</button></span>`;
    wire(el);
  }

  function listHtml() {
    const s = S.suite;
    const searching = !!S.q;
    const parts = [];
    // the set-up chain, first: what the other cases start from
    const nodes = [...S.setup.values()].filter((n) => n.count > 0 || n.caseId);
    const onSet = nodes.filter((n) => S.picked.has(n.id)).length;
    const openSet = S.open.has("SETUP");
    parts.push(
      `<div class="pl-group rg-setup${openSet ? " open" : ""}" data-group="SETUP">` +
        `<div class="pl-ghead" data-toggle="SETUP"><span class="pl-gnum">00</span><span class="pl-gname">Set-up events the other cases start from <span class="rg-muted">— the chain Draft → Live → Bid → Closed → Awarded</span></span>` +
        `<span class="pl-gcount${onSet ? " some" : ""}">${onSet}/${nodes.length}</span><button type="button" class="pl-gtoggle" data-toggle="SETUP" aria-expanded="${openSet}">${icon("chevron-down")}</button></div>` +
        (openSet ? `<div class="pl-frows">${nodes.map((n) => `<div class="pl-frow rg-node"><label class="pl-flabel"><input type="checkbox" class="pl-cb" data-setup="${h(n.id)}"${S.picked.has(n.id) ? " checked" : ""} /><span class="pl-fname">${h(n.label)}</span></label><span class="rg-needs">${n.needs ? `← needs: ${h(S.setup.get(n.needs)?.label || n.needs)}` : "starts from nothing"}</span><span class="pl-tag">${h(stageWord(n.stage))}</span>${n.caseId ? `<span class="pl-tag cov" title="Built through the screens by this case">${h(n.caseId)}</span>` : `<span class="pl-tag" title="Built by API before each case that rests on it">built by API</span>`}<span class="pl-fn">${fmt(n.count)} rest on it</span></div>`).join("")}</div>` : "") +
      `</div>`,
    );
    for (const m of s.modules) {
      const all = S.byModule.get(m.id) || [];
      const vis = all.filter(matches);
      if (searching && !vis.length) continue;
      const on = vis.filter((c) => S.picked.has(c.key)).length;
      const open = searching ? true : S.open.has(m.id);
      const rows = open ? m.features.map((f) => {
        const fall = S.byFeature.get(`${m.id}|${f.id}`) || [];
        const fvis = fall.filter(matches);
        if (searching && !fvis.length) return "";
        const fon = fvis.filter((c) => S.picked.has(c.key)).length;
        const fopen = searching ? true : S.openF.has(`${m.id}|${f.id}`);
        const cases = fopen ? fvis.slice(0, 400).map(caseHtml).join("") + (fvis.length > 400 ? `<p class="pl-msg">${fmt(fvis.length - 400)} more — narrow the search to see them.</p>` : "") : "";
        return `<div class="rg-feat${fopen ? " open" : ""}"><div class="pl-frow${fvis.length ? "" : " is-off"}"><label class="pl-flabel"><input type="checkbox" class="pl-cb" data-feat="${h(m.id)}|${h(f.id)}"${fon && fon === fvis.filter(depthOk).length ? " checked" : ""}${fvis.length ? "" : " disabled"} /></label>` +
          `<button type="button" class="rg-fname" data-ftoggle="${h(m.id)}|${h(f.id)}" title="${h(f.what || f.label)}">${h(f.label)}${icon("chevron-down")}</button>` +
          `<span class="pl-gcount${fon ? " some" : ""}">${fon}/${fvis.length}</span></div>${cases ? `<div class="rg-cases">${cases}</div>` : ""}</div>`;
      }).join("") : "";
      parts.push(
        `<div class="pl-group${open ? " open" : ""}" data-group="${h(m.id)}">` +
          `<div class="pl-ghead" data-toggle="${h(m.id)}"><input type="checkbox" class="pl-cb pl-gcb" data-mod="${h(m.id)}"${on && on === vis.filter(depthOk).length ? " checked" : ""}${vis.length ? "" : " disabled"} aria-label="Select every case in ${h(m.label)}" />` +
          `<span class="pl-gnum">${m.step ? String(m.step).padStart(2, "0") : "–"}</span><span class="pl-gname">${h(m.label)}</span>` +
          `<span class="pl-gcount${on ? " some" : ""}">${on}/${fmt(vis.length)}</span><button type="button" class="pl-gtoggle" data-toggle="${h(m.id)}" aria-expanded="${open}">${icon("chevron-down")}</button></div>` +
          (open ? `<div class="pl-frows">${rows}</div>` : "") +
        `</div>`,
      );
    }
    const f = S.f;
    const seg = (name, opts) => `<span class="pl-seg rg-seg">${opts.map(([v, l]) => `<label><input type="radio" name="rg-${name}" value="${h(v)}"${f[name] === v ? " checked" : ""} /><span>${h(l)}</span></label>`).join("")}</span>`;
    return (
      `<div class="pl-card pl-list rg-list">` +
        `<div class="pl-search">${icon("search")}<label class="sr-only" for="rg-q">Search cases</label><input type="search" id="rg-q" placeholder="Search ${fmt(s.counts.total)} cases by words or id" autocomplete="off" spellcheck="false" value="${h(S.q)}" /></div>` +
        `<div class="rg-filters">${seg("layer", [["", "UI + API"], ["ui", "UI"], ["api", "API"]])}${seg("pri", [["", "Any priority"], ["P0", "Critical"], ["P1", "High"], ["P2", "Medium"], ["P3", "Low"]])}${seg("run", [["", "Any"], ["now", "Runs now"], ["partly", "Part checked"], ["compile", "Compiles"], ["cant", "Can't run yet"]])}</div>` +
        `<div class="pl-groups">${parts.join("")}</div>` +
      `</div>`
    );
  }

  function caseHtml(c) {
    const [label, cls, why] = RUN[c.runnable] || RUN.compile;
    const from = c.prev ? `continues from part ${c.part.n - 1} (${h(S.byKey.get(c.prev)?.part?.what || "")})` : c.needs && S.setup.get(c.needs) ? S.setup.get(c.needs).label : "";
    return (
      `<div class="rg-case${S.picked.has(c.key) ? " is-on" : ""}${c.part ? ` rg-part${c.part.n === 1 ? " rg-part-first" : ""}${c.part.n === c.part.of ? " rg-part-last" : ""}` : ""}">` +
        `<input type="checkbox" class="pl-cb" data-key="${h(c.key)}"${S.picked.has(c.key) ? " checked" : ""} aria-label="Tick ${h(c.id)}" />` +
        `<code class="rg-id">${h(c.id)}</code>${c.part ? `<span class="rg-partn" title="One stage of a longer flow: the parts run in order, each continuing from the one before">${c.part.n} of ${c.part.of}</span>` : ""}` +
        `<button type="button" class="rg-title" data-open="${h(c.key)}">${h(c.title)}</button>` +
        `<span class="rg-pills"><span class="rg-pill ${c.layer}">${c.layer.toUpperCase()}</span><span class="rg-pill p${c.priority.slice(1)}" title="${h(PRI_WORD[c.priority])}">${h(c.priority)}</span>${c.kind !== "Positive" ? `<span class="rg-pill kind">${h(c.kind)}</span>` : ""}<span class="rg-pill stage">${h(stageWord(c.stage))}</span><span class="pl-tag ${cls}" title="${h(why)}">${h(label)}</span></span>` +
        (from ? `<span class="rg-from" title="${c.prev ? "Ticking this part ticks the parts before it" : "The event this case starts from; ticking the case ticks it too"}">${c.prev ? from : `starts from: ${h(from)}`}</span>` : "") +
      `</div>`
    );
  }

  function panelHtml(picked) {
    const s = S.suite;
    const mods = new Set(picked.map((c) => c.module));
    const byStage = s.stages.map((_, i) => picked.filter((c) => c.stage === i).length);
    const noEvent = picked.filter((c) => c.stage < 0).length;
    const ui = picked.filter((c) => c.layer === "ui").length, api = picked.length - ui;
    const cant = picked.filter((c) => CANT.has(c.runnable));
    const setups = pickedSetup();
    const setupCases = runSetup().length;
    const mins = ui * MIN.ui + api * MIN.api + setupCases * MIN.ui;
    const est = mins < 60 ? `about ${Math.max(1, Math.round(mins))} min` : `about ${Math.floor(mins / 60)} h ${Math.round(mins % 60)} min`;
    const R = S.run;
    const far = byStage.reduce((m, n, i) => (n ? i : m), -1);
    return (
      `<aside class="pl-card pl-panel rg-panel" aria-labelledby="rg-run-title">` +
        `<section class="pl-sec pl-summary"><div class="pl-panel-head"><h2 class="pl-k" id="rg-run-title">Your run</h2><span class="pl-head-acts">${picked.length ? `<button type="button" class="pl-link" data-act="clear">Clear</button>` : ""}</span></div>` +
          `<div class="pl-big"><span class="pl-big-n">${fmt(picked.length)}</span><span class="pl-big-c">cases from ${plural(mods.size, "module")}${setups.length ? ` · ${plural(setups.length, "set-up event")} pulled in` : ""}</span></div>` +
          `<ol class="pl-track">${s.stages.map((st, i) => `<li class="${byStage[i] ? "is-done" : ""}${i === far ? " is-far" : ""}"><span class="pl-dot"></span><span class="pl-stop">${h(st)}</span><span class="rg-stopn">${byStage[i] ? fmt(byStage[i]) : ""}</span></li>`).join("")}</ol>` +
          (noEvent ? `<p class="pl-aside rg-aside">${fmt(noEvent)} of them need no event (set-up and admin work).</p>` : "") +
        `</section>` +
        `<section class="pl-sec"><p class="pl-t">What is in it</p><div class="rg-kv"><span>UI cases</span><b>${fmt(ui)}</b><span>API cases</span><b>${fmt(api)}</b><span>Time to run</span><b>${picked.length ? est : "—"}</b></div>` +
          (setups.length ? `<p class="pl-t rg-t2">Set-up events it rests on</p><ul class="rg-setups">${setups.map((n) => `<li><span>${h(n.label)}</span>${n.caseId ? `<code>${h(n.caseId)}</code>` : `<span class="rg-muted">built by API</span>`}<button type="button" class="pl-link" data-unsetup="${h(n.id)}" title="Untick it and everything resting on it">untick</button></li>`).join("")}</ul>` : "") +
          (cant.length ? `<p class="pl-aside rg-aside">${fmt(cant.length)} of the ticked cases cannot run yet (${Object.entries(cant.reduce((o, c) => ((o[c.runnable] = (o[c.runnable] || 0) + 1), o), {})).map(([k, n]) => `${n} ${RUN[k][0].toLowerCase()}`).join(", ")}); they come back “Not run” with the reason.</p>` : "") +
        `</section>` +
        `<section class="pl-sec"><p class="pl-t">Tick helpers use</p><span class="pl-seg">${[["all", "Every case"], ["p0p1", "Critical + High"], ["p0", "Critical only"]].map(([v, l]) => `<label><input type="radio" name="rg-depth" value="${v}"${S.depth === v ? " checked" : ""} /><span>${h(l)}</span></label>`).join("")}</span><p class="pl-aside rg-aside">Ticking a module or a feature ticks its cases of this depth; a ticked case always brings the set-up events it rests on, and never a case it does not depend on.</p></section>` +
        (R ? runHtml(R) : "") +
        `<div class="pl-foot"><button type="button" class="pl-run" data-act="run"${!picked.length || (R && !R.done) ? " disabled" : ""}>${R && !R.done ? "Running…" : `Run ${fmt(picked.length)} case${picked.length === 1 ? "" : "s"}${setupCases ? ` + ${setupCases} set-up` : ""}`}</button></div>` +
      `</aside>`
    );
  }

  function runHtml(R) {
    const tally = R.tally || {};
    const pills = ["Pass", "Fail", "Partly checked", "Couldn't tell", "Not run"].filter((k) => tally[k]).map((k) => `<span class="rg-pill t-${k.replace(/[^a-z]/gi, "").toLowerCase()}">${tally[k]} ${h(k)}</span>`).join("");
    return (
      `<section class="pl-sec rg-run"><p class="pl-t">${R.done ? "Last run" : "Running"}${R.total ? ` · ${R.doneCount}/${R.total}` : ""}</p>` +
        (R.error ? `<p class="pl-msg rg-bad">${h(R.error)}</p>` : "") +
        (R.current ? `<p class="rg-cur">${icon("loader")} ${h(R.current)}</p>` : "") +
        (R.lines.length ? `<ul class="rg-lines">${R.lines.slice(-4).map((l) => `<li>${h(l)}</li>`).join("")}</ul>` : "") +
        (pills ? `<div class="rg-tally">${pills}</div>` : "") +
        (R.results.length ? `<ol class="rg-results">${R.results.slice(-12).map((r) => `<li><span class="rg-pill t-${r.status.replace(/[^a-z]/gi, "").toLowerCase()}">${h(r.status)}</span><code>${h(r.id)}</code><span>${h(r.why)}</span></li>`).join("")}</ol>` : "") +
        (R.done && R.run ? `<div class="rg-acts"><a class="pl-link" href="${h(R.bugsLink)}">${icon("bug")} Bugs (${R.bugs.length})</a><a class="pl-link" href="${h(R.report)}" target="_blank" rel="noopener">${icon("file-text")} Report</a><a class="pl-link" href="${h(R.workbook)}">${icon("download")} Workbook</a></div>` : "") +
        (R.plainBugs && R.plainBugs.length ? `<p class="pl-t rg-t2">Bugs, in plain words</p><ul class="rg-bugs">${R.plainBugs.map((b) => `<li><b>${h(b.title)}</b><span>${h(b.summary)}</span></li>`).join("")}</ul>` : "") +
      `</section>`
    );
  }

  function drawerHtml() {
    const d = S.drawer;
    if (d.loading) return `<div class="rg-drawer"><div class="rg-dhead"><b>${h(d.key)}</b><button type="button" class="pl-link" data-act="close">Close</button></div><p class="pl-msg">Reading…</p></div>`;
    const c = d.case;
    const [label, cls, why] = RUN[c.runnable] || RUN.compile;
    const mod = S.suite.modules.find((m) => m.id === c.module);
    const feat = mod?.features.find((f) => f.id === c.feature);
    return (
      `<div class="rg-drawer" role="dialog" aria-label="Test case ${h(c.id)}"><div class="rg-dhead"><code class="rg-id">${h(c.id)}</code><span class="rg-pills"><span class="rg-pill ${c.layer}">${c.layer.toUpperCase()}</span><span class="rg-pill p${c.priority.slice(1)}">${h(PRI_WORD[c.priority])}</span><span class="rg-pill kind">${h(c.kind)}</span><span class="pl-tag ${cls}" title="${h(why)}">${h(label)}</span></span><button type="button" class="pl-link" data-act="close">Close</button></div>` +
        `<h3 class="rg-dtitle">${h(c.title)}</h3>` +
        `<p class="rg-muted">${h(mod?.label || c.module)} › ${h(feat?.label || c.feature)} · ${h(stageWord(c.stage))} · ${h(c.role)}${c.source === "sheet" ? ` · from sheet “${h(c.from)}”` : c.source === "api" ? " · API case library" : ` · catalog ${h(c.from)}`}</p>` +
        `<dl class="rg-dl"><dt>Starts from</dt><dd>${h(d.startsFrom)}</dd><dt>Pre-conditions</dt><dd>${h(c.preconditions)}</dd>${c.configs && c.configs !== "None" ? `<dt>Settings needed</dt><dd>${h(c.configs)}</dd>` : ""}${c.testData && c.testData !== "-" ? `<dt>Test data</dt><dd>${h(c.testData)}</dd>` : ""}</dl>` +
        `<p class="pl-t">Steps</p><ol class="rg-steps">${c.steps.map((s) => `<li>${h(s)}</li>`).join("")}</ol>` +
        `<p class="pl-t">Expected result</p><p class="rg-exp">${h(c.expected)}</p>` +
        (c.why ? `<p class="pl-t">Why this case</p><p class="rg-muted">${h(c.why)}</p>` : "") +
        `<div class="rg-acts"><button type="button" class="pl-run rg-small" data-tick="${h(c.key)}">${S.picked.has(c.key) ? "Untick this case" : "Tick this case"}</button></div>` +
      `</div>`
    );
  }

  // ── the run ──────────────────────────────────────────────────────────────
  async function startRun() {
    const keys = [...pickedCases().map((c) => c.key), ...runSetup().map((n) => n.id)];
    if (!keys.length) return;
    S.run = { lines: [], results: [], tally: {}, current: "", total: 0, doneCount: 0, done: false, error: null, bugs: [], plainBugs: [] };
    render();
    try {
      const r = await fetch("/api/regression/run", { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ keys, companyId: clientId() }) });
      if (!r.ok) throw new Error(`the run did not start (${r.status})`);
      const dec = new TextDecoder(); let buf = "";
      const reader = r.body.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const type = block.match(/^event:\s*(.+)$/m)?.[1] || "message";
          let d = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
          try { d = JSON.parse(d); } catch {}
          onRunEvent(type, d);
        }
      }
    } catch (e) { S.run.error = e.message; }
    S.run.done = true; S.run.current = "";
    render();
  }
  function onRunEvent(type, d) {
    const R = S.run;
    if (type === "order") { R.total = d.total; R.lines.push(d.note); }
    else if (type === "case-start") { R.current = `${d.index ? `${d.index} of ${d.total} — ` : ""}${d.title || d.id || ""}`; R.total = d.total || R.total; }
    else if (type === "line") { if (d.line) R.lines.push(d.line); }
    else if (type === "case-done") { const c = d.result || d; R.results.push({ id: c.id, status: c.status, why: String(c.why || "").slice(0, 160) }); R.tally[c.status] = (R.tally[c.status] || 0) + 1; R.doneCount++; R.current = ""; }
    else if (type === "finished") { Object.assign(R, { run: d.run, tally: d.tally, bugs: d.bugs, bugsLink: d.bugsLink, report: d.report, workbook: d.workbook }); R.done = true; loadPlainBugs(d.run); }
    else if (type === "error") R.error = d.why;
    if (R.results.length % 1 === 0) render();
  }
  async function loadPlainBugs(runId) {
    try {
      const j = await fetch("/api/findings", { cache: "no-store" }).then((r) => r.json());
      S.run.plainBugs = (j.groups || []).filter((g) => (g.runs || []).includes(runId)).map((g) => ({ title: g.plain?.title || g.title, summary: g.plain?.summary || g.rationale }));
      render();
    } catch {}
  }

  async function openCase(key) {
    S.drawer = { key, loading: true }; render();
    try {
      const j = await fetch(`/api/regression/case?key=${encodeURIComponent(key)}`, { cache: "no-store" }).then((r) => r.json());
      if (!j.case) throw new Error(j.why || "not found");
      S.drawer = { key, case: j.case, startsFrom: j.startsFrom };
    } catch (e) { S.drawer = null; S.err = e.message; }
    render();
  }

  // ── wiring ───────────────────────────────────────────────────────────────
  function wire(el) {
    el.querySelector("[data-act=retry]")?.addEventListener("click", () => load(true));
    document.querySelector("#rg-ctx [data-act=rebuild]")?.addEventListener("click", async () => { S.rebuilding = true; render(); await fetch("/api/regression/rebuild", { method: "POST" }).catch(() => {}); S.rebuilding = false; await load(true); });
    const qel = el.querySelector("#rg-q");
    if (qel) { let t; qel.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { S.q = qel.value.trim(); render(); const n = root().querySelector("#rg-q"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 200); }); }
    for (const name of ["layer", "pri", "run"]) el.querySelectorAll(`input[name="rg-${name}"]`).forEach((r) => r.addEventListener("change", () => { S.f[name] = r.value; render(); }));
    el.querySelectorAll('input[name="rg-depth"]').forEach((r) => r.addEventListener("change", () => { S.depth = r.value; render(); }));
    el.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", (e) => { if (e.target.closest("input")) return; const id = b.dataset.toggle; if (S.open.has(id)) S.open.delete(id); else S.open.add(id); render(); }));
    el.querySelectorAll("[data-ftoggle]").forEach((b) => b.addEventListener("click", () => { const id = b.dataset.ftoggle; if (S.openF.has(id)) S.openF.delete(id); else S.openF.add(id); render(); }));
    el.querySelectorAll("input[data-key]").forEach((cb) => cb.addEventListener("change", () => { if (cb.checked) tick(cb.dataset.key); else untick(cb.dataset.key); render(); }));
    el.querySelectorAll("input[data-setup]").forEach((cb) => cb.addEventListener("change", () => { if (cb.checked) tickSetup(cb.dataset.setup); else untickSetup(cb.dataset.setup); render(); }));
    el.querySelectorAll("[data-unsetup]").forEach((b) => b.addEventListener("click", () => { untickSetup(b.dataset.unsetup); render(); }));
    el.querySelectorAll("input[data-mod]").forEach((cb) => cb.addEventListener("change", (e) => { e.stopPropagation(); const rows = (S.byModule.get(cb.dataset.mod) || []).filter(matches).filter(depthOk); for (const c of rows) cb.checked ? tick(c.key) : untick(c.key); sweep(); render(); }));
    el.querySelectorAll("input[data-feat]").forEach((cb) => cb.addEventListener("change", () => { const rows = (S.byFeature.get(cb.dataset.feat) || []).filter(matches).filter(depthOk); for (const c of rows) cb.checked ? tick(c.key) : untick(c.key); sweep(); render(); }));
    el.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openCase(b.dataset.open)));
    el.querySelector("[data-act=close]")?.addEventListener("click", () => { S.drawer = null; render(); });
    el.querySelectorAll("[data-tick]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.tick; if (S.picked.has(k)) untick(k); else tick(k); render(); }));
    el.querySelector("[data-act=clear]")?.addEventListener("click", () => { S.picked.clear(); S.pinned.clear(); sweep(); render(); });
    el.querySelector("[data-act=run]")?.addEventListener("click", startRun);
  }

  function route() { if (/^#\/(regression|run-tests)\b/.test(location.hash)) load(false); }
  window.addEventListener("hashchange", route);
  route();
})();
