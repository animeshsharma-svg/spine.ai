/**
 * Screens — the screen library of the events flow.
 *
 * spine.ai walks the product in the browser, photographs every section, numbers every control,
 * learns what each control does to the product, and writes test cases from what it saw. This
 * page shows that library and lets a person:
 *   • watch a walk live (the browser, the spotlight pictures as they are taken);
 *   • hover a screenshot and see each control's box and what clicking it does;
 *   • turn "what this control does" into a test case, and run any screen case with the
 *     spotlight on — the framed pictures stream into the page as the run goes.
 *
 *   #/screens                the library + the walk panel
 *   #/screens/<id>           one screen
 *   #/screens/walk/<walkId>  a walk, live or saved
 *
 * Data: /api/screens, /api/screens/one, /api/screens/img, /api/screens/walk (+ /events, /stop),
 * /api/screens/case, /api/screens/run (SSE). Loaded after app.js; uses CaseView.esc.
 */
(function () {
  const CV = window.CaseView;
  const esc = CV.esc;
  const q = (s) => document.querySelector(s);
  const root = () => q("#scr-root");

  const KIND_COLOUR = { field: "#0ea5e9", select: "#0ea5e9", checkbox: "#0ea5e9", switch: "#0ea5e9", tab: "#f59e0b", link: "#f59e0b", column: "#64748b", menuitem: "#d946ef", button: "#d946ef" };
  const CONF = { code: ["From the code", "good"], known: ["Known", "good"], guess: ["Model's reading", "warn"], unknown: ["Not known yet", "idle"] };

  let state = { view: "list", id: null, walkId: null, data: null, screen: null, hover: null, picked: null, kind: "plain" };

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
  const img = (id, kind) => `/api/screens/img?id=${encodeURIComponent(id)}&kind=${kind}`;
  const evidence = (file) => `/api/ui-evidence?path=${encodeURIComponent(file)}`;

  function parse() {
    const h = location.hash;
    if (!/^#\/screens(\/|$)/.test(h)) return false;
    const m = h.match(/^#\/screens\/walk\/([^/?]+)/);
    if (m) state = { ...state, view: "walk", walkId: decodeURIComponent(m[1]) };
    else {
      const s = h.match(/^#\/screens\/([^/?]+)/);
      state = { ...state, view: s ? "screen" : "list", id: s ? decodeURIComponent(s[1]) : null };
    }
    return true;
  }

  // ── a live panel: the browser frame, the spotlight strip, the log ─────────────────────────
  function livePanel(el, title) {
    el.innerHTML = `<div class="scr-live">
      <div class="scr-live-head"><span class="scr-live-dot" aria-hidden="true"></span><b>${esc(title)}</b><span class="scr-live-line" data-line>starting the browser…</span><button type="button" class="chip" data-stop>Stop</button></div>
      <div class="scr-live-body">
        <div class="scr-live-screen"><img alt="The browser the run is driving" data-frame hidden /><p class="scr-live-empty" data-empty>The browser appears here as soon as the run opens it.</p></div>
        <div class="scr-live-log" data-log></div>
      </div>
      <div class="scr-spots" data-spots hidden><div class="scr-spots-head">Screenshots <b data-n>0</b></div><div class="scr-spots-strip" data-strip></div></div>
    </div>`;
    const frameEl = el.querySelector("[data-frame]");
    const emptyEl = el.querySelector("[data-empty]");
    const logEl = el.querySelector("[data-log]");
    const lineEl = el.querySelector("[data-line]");
    const strip = el.querySelector("[data-strip]");
    const spotsBox = el.querySelector("[data-spots]");
    const nEl = el.querySelector("[data-n]");
    let n = 0;
    return {
      stopButton: el.querySelector("[data-stop]"),
      frame(b64) {
        if (!b64) return;
        frameEl.src = `data:image/jpeg;base64,${b64}`;
        frameEl.hidden = false;
        emptyEl.hidden = true;
      },
      spot(sp) {
        if (!sp?.file) return;
        n++;
        spotsBox.hidden = false;
        nEl.textContent = String(n);
        const cap = `${sp.step ? `Step ${sp.step} · ` : ""}${sp.action}${sp.target ? ` · ${sp.target}` : ""}`;
        const d = document.createElement("div");
        d.className = "scr-spot";
        d.dataset.action = sp.action;
        d.title = cap;
        d.innerHTML = `<img loading="lazy" src="${evidence(sp.file)}" alt="${esc(cap)}" /><div class="scr-spot-cap">${esc(cap)}</div>`;
        d.addEventListener("click", () => lightbox(evidence(sp.file), cap));
        strip.appendChild(d);
        strip.scrollLeft = strip.scrollWidth;
        if (frameEl.hidden) this.frameUrl(evidence(sp.file));
      },
      frameUrl(url) {
        frameEl.src = url;
        frameEl.hidden = false;
        emptyEl.hidden = true;
      },
      line(text) {
        lineEl.textContent = text;
      },
      log(text, cls) {
        const p = document.createElement("div");
        p.className = `scr-log-line${cls ? ` ${cls}` : ""}`;
        p.textContent = text;
        logEl.appendChild(p);
        logEl.scrollTop = logEl.scrollHeight;
      },
      done(text, ok) {
        el.querySelector(".scr-live-dot")?.classList.add("off");
        lineEl.textContent = text;
        lineEl.classList.toggle("good", !!ok);
        lineEl.classList.toggle("bad", ok === false);
        const b = el.querySelector("[data-stop]");
        if (b) b.hidden = true;
      },
    };
  }

  function lightbox(url, cap) {
    const big = document.createElement("figure");
    big.className = "ss-spot-big";
    big.innerHTML = `<img src="${url}" alt="${esc(cap)}" /><figcaption>${esc(cap)}</figcaption>`;
    big.addEventListener("click", () => big.remove());
    document.body.appendChild(big);
  }

  // ── the library ───────────────────────────────────────────────────────────────────────────
  async function loadList() {
    const [r, combos] = await Promise.all([fetch("/api/screens").then((x) => x.json()), fetch("/api/screens/combos").then((x) => x.json()).catch(() => ({ run: null }))]);
    state.data = r;
    state.combos = combos.run;
    paintList();
  }

  function combosHtml() {
    const run = state.combos;
    if (!run?.results?.length) return "";
    const passed = run.results.filter((r) => r.passed).length;
    const rows = run.results
      .map(
        (r) => `<tr class="${r.passed ? "scr-row-ok" : r.passed === false ? "scr-row-bad" : ""}"><td><code>${esc(r.id)}</code></td><td>${esc(r.title)}</td><td>${r.ok}/${r.steps}</td><td>${r.pictures}</td><td>${r.passed ? `<span class="pill good">Passed</span>` : r.passed === false ? `<span class="pill bad">Failed</span>` : `<span class="pill idle">Not run</span>`}</td><td class="scr-combo-why">${r.failedAt ? esc(r.failedAt) : ""}${r.evidence ? ` <a href="${evidence(r.evidence)}" target="_blank" rel="noopener">picture</a>` : ""}</td></tr>`,
      )
      .join("");
    return `<section>
      <div class="scr-sec-head"><h2>Event combinations</h2><span>${passed}/${run.results.length} passed${run.done ? "" : " · still running"} · started ${esc(when(run.startedAt))} · every action photographed with the spotlight (${run.results.reduce((n, r) => n + r.pictures, 0)} pictures)</span></div>
      <div class="scr-table-wrap"><table class="scr-table"><thead><tr><th>#</th><th>Combination</th><th>Steps</th><th>Pictures</th><th>Result</th><th>Where it stopped</th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>`;
  }

  function paintList() {
    const d = state.data;
    if (!d) return;
    const walksHtml = d.walks
      .map(
        (w) => `<label class="scr-walk"><input type="checkbox" name="walk" value="${esc(w.id)}" ${["list", "create-erfx", "single-stage"].includes(w.id) ? "checked" : ""} /><span><b>${esc(w.title)}</b><small>${esc(w.covers)} · ${w.screens} screens · about ${w.minutes} min${w.state !== "none" ? ` · starts from a "${esc(w.state)}" event the API builds` : ""}</small></span></label>`,
      )
      .join("");
    const running = d.running ? `<div class="sx-banner info">A walk is going (<a href="#/screens/walk/${esc(d.running.id)}">watch it</a>) — ${esc(d.running.current?.walk || "starting")}.</div>` : "";
    const recent = d.recent?.length
      ? `<div class="scr-recent"><span>Earlier walks:</span> ${d.recent.map((w) => `<a href="#/screens/walk/${esc(w.id)}" class="chip">${esc(when(w.startedAt))} · ${esc(w.status)}${w.summary ? ` · ${esc(w.summary)}` : ""}</a>`).join(" ")}</div>`
      : "";
    const cards = d.screens.length
      ? d.screens
          .map(
            (s) => `<a class="scr-card" href="#/screens/${esc(s.id)}">
            <div class="scr-thumb"><img loading="lazy" src="${img(s.id, "plain")}" alt="${esc(s.label)}" /></div>
            <div class="scr-card-body">
              <b>${esc(s.label)}</b>
              <div class="scr-card-sub"><code>${esc(s.path)}</code>${s.state && s.state !== "none" ? ` <span class="pill idle">${esc(s.state)} event</span>` : ""}</div>
              <div class="scr-card-stats"><span>${s.controls} controls</span><span>${s.known} described</span><span>${s.cases} test case${s.cases === 1 ? "" : "s"}</span>${s.rulesUntested ? `<span class="warn">${s.rulesUntested} untested rules</span>` : ""}</div>
              <small>captured ${esc(when(s.takenAt))}${s.captures > 1 ? ` · ${s.captures} captures` : ""}</small>
            </div></a>`,
          )
          .join("")
      : `<p class="scr-empty">No screens yet. Start a walk: spine.ai opens the product, photographs each section and writes the cases.</p>`;
    root().innerHTML = `
      ${running}
      <section class="scr-walkbox">
        <div class="scr-walkbox-head"><div><h2>Walk the events flow</h2><p>spine.ai opens Procol in its browser, goes through the flow like a buyer, and photographs every section it reaches — each control framed as it acts, each assertion verified on screen. Every screen it meets becomes knowledge (what each control does) and test cases.</p></div>
          <button type="button" class="run-btn primary" id="scr-start" ${d.running ? "disabled" : ""}>Start walking</button></div>
        <div class="scr-walks">${walksHtml}</div>
        <label class="scr-opt"><input type="checkbox" id="scr-cases" checked /> write test cases from each screen (slower: the model drafts, code checks them)</label>
        ${recent}
      </section>
      ${combosHtml()}
      <section>
        <div class="scr-sec-head"><h2>The library</h2><span>${d.screens.length} screen${d.screens.length === 1 ? "" : "s"} · ${d.screens.reduce((n, s) => n + s.cases, 0)} cases written from them</span></div>
        <div class="scr-grid">${cards}</div>
      </section>`;
    q("#scr-start")?.addEventListener("click", startWalk);
  }

  async function startWalk() {
    const walks = [...document.querySelectorAll('input[name="walk"]:checked')].map((x) => x.value);
    if (!walks.length) return alert("Pick at least one walk.");
    const btn = q("#scr-start");
    btn.disabled = true;
    const r = await fetch("/api/screens/walk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId: clientId(), walks, cases: q("#scr-cases")?.checked !== false }) }).then((x) => x.json());
    if (!r.id) {
      btn.disabled = false;
      return alert(r.why || "could not start");
    }
    location.hash = `#/screens/walk/${r.id}`;
  }

  // ── a walk, live ──────────────────────────────────────────────────────────────────────────
  let walkEs = null;
  async function paintWalk() {
    walkEs?.close();
    const id = state.walkId;
    root().innerHTML = `<a class="scr-back" href="#/screens">← Screens</a><div id="scr-walk-live"></div><section><div class="scr-sec-head"><h2>Screens from this walk</h2><span id="scr-walk-n"></span></div><div class="scr-grid" id="scr-walk-screens"></div></section>`;
    const panel = livePanel(q("#scr-walk-live"), "Walking the events flow");
    panel.stopButton?.addEventListener("click", () => fetch("/api/screens/walk/stop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }));
    const grid = q("#scr-walk-screens");
    const seen = new Set();
    const addScreen = (s) => {
      if (seen.has(s.id)) {
        const old = grid.querySelector(`[data-id="${CSS.escape(s.id)}"]`);
        old?.remove();
      }
      seen.add(s.id);
      const a = document.createElement("a");
      a.className = "scr-card";
      a.href = `#/screens/${s.id}`;
      a.dataset.id = s.id;
      a.innerHTML = `<div class="scr-thumb"><img loading="lazy" src="${img(s.id, "plain")}&t=${Date.now()}" alt="${esc(s.label)}" /></div><div class="scr-card-body"><b>${esc(s.label)}</b><div class="scr-card-sub"><code>${esc(s.path)}</code></div><div class="scr-card-stats"><span>${s.controls} controls</span><span>${s.known} described</span><span>${s.cases} cases</span></div></div>`;
      grid.appendChild(a);
      q("#scr-walk-n").textContent = `${seen.size} screen${seen.size === 1 ? "" : "s"}`;
    };
    const es = new EventSource(`/api/screens/walk/events?id=${encodeURIComponent(id)}`);
    walkEs = es;
    es.addEventListener("session", (ev) => {
      const s = JSON.parse(ev.data);
      for (const l of s.log || []) panel.log(l.text);
      for (const sc of s.screens || []) addScreen(sc);
      if (s.status !== "running") panel.done(s.summary || s.status, s.status === "done");
    });
    es.addEventListener("walk", (ev) => {
      const w = JSON.parse(ev.data);
      panel.line(`walking: ${w.title}`);
      panel.log(`▶ ${w.title}`, "head");
    });
    es.addEventListener("progress", (ev) => {
      const p = JSON.parse(ev.data);
      panel.line(p.line);
      panel.log(p.line, /✗/.test(p.line) ? "bad" : "");
    });
    es.addEventListener("log", (ev) => panel.log(JSON.parse(ev.data).text));
    es.addEventListener("frame", (ev) => panel.frame(JSON.parse(ev.data).frame));
    es.addEventListener("spot", (ev) => panel.spot(JSON.parse(ev.data)));
    es.addEventListener("screen", (ev) => {
      const s = JSON.parse(ev.data);
      addScreen(s);
      panel.log(`📷 "${s.label}": ${s.controls} controls, ${s.known} described, ${s.cases} cases`, "good");
    });
    es.addEventListener("done", (ev) => {
      const d = JSON.parse(ev.data);
      panel.done(d.summary || d.status, d.status === "done");
      for (const sc of d.screens || []) addScreen(sc);
      es.close();
    });
    es.onerror = () => {
      /* the stream ends with the walk */
    };
  }

  // ── one screen ────────────────────────────────────────────────────────────────────────────
  async function loadScreen() {
    const r = await fetch(`/api/screens/one?id=${encodeURIComponent(state.id)}`).then((x) => x.json());
    if (!r.screen) {
      root().innerHTML = `<a class="scr-back" href="#/screens">← Screens</a><p class="scr-empty">${esc(r.why || "no such screen")}</p>`;
      return;
    }
    state.screen = r.screen;
    state.picked = null;
    state.hover = null;
    paintScreen();
  }

  const effectOf = (n) => state.screen.effects.find((e) => e.n === n);
  const controlOf = (n) => state.screen.controls.find((c) => c.n === n);

  function paintScreen() {
    const s = state.screen;
    const onScreen = s.controls.filter((c) => c.box && !c.offscreen);
    const reach = s.reachedBy?.length ? s.reachedBy.map((st) => `<code>${esc(st.step)}${st.args && Object.keys(st.args).length ? " " + esc(JSON.stringify(st.args)) : ""}</code>`).join(" → ") : "<i>not recorded</i>";
    root().innerHTML = `
      <a class="scr-back" href="#/screens">← Screens</a>
      <header class="scr-head">
        <div><h2>${esc(s.label)}</h2><div class="scr-card-sub"><code>${esc(s.path)}</code>${s.state && s.state !== "none" ? ` <span class="pill idle">${esc(s.state)} event</span>` : ""} · captured ${esc(when(s.takenAt))}${s.captures > 1 ? ` · ${s.captures} captures` : ""} · company ${esc(s.companyId ?? "")}</div></div>
        <div class="scr-head-stats"><span><b>${s.controls.length}</b> controls</span><span><b>${s.effects.filter((e) => e.confidence !== "unknown").length}</b> described</span><span><b>${s.cases.length}</b> test cases</span><span><b>${s.rules.filter((r) => r.verdict === "not covered").length}</b> untested rules</span></div>
      </header>
      <p class="scr-reach"><b>How spine.ai gets here:</b> ${reach}</p>
      <div class="scr-two">
        <section class="scr-pic">
          <div class="scr-pic-tools"><span>Hover a control, or a box on the picture, to see what it does.</span>
            <span class="scr-seg"><button type="button" class="chip ${state.kind === "plain" ? "on" : ""}" data-kind="plain">Plain</button><button type="button" class="chip ${state.kind === "map" ? "on" : ""}" data-kind="map">Numbered map</button></span>
            <a class="chip" href="${img(s.id, state.kind)}" target="_blank" rel="noopener">Open full size</a></div>
          <div class="scr-stage" id="scr-stage"><img id="scr-img" src="${img(s.id, state.kind)}" alt="${esc(s.label)}" /><div class="scr-boxes" id="scr-boxes"></div><div class="scr-tip" id="scr-tip" hidden></div></div>
        </section>
        <aside class="scr-side">
          <div class="scr-sec-head"><h3>Controls on this screen</h3><span>${onScreen.length} on the picture${s.controls.length > onScreen.length ? `, ${s.controls.length - onScreen.length} below the fold` : ""}</span></div>
          <ol class="scr-controls" id="scr-controls">${s.controls.map((c) => controlRow(c)).join("")}</ol>
        </aside>
      </div>
      <section class="scr-effect" id="scr-effect"></section>
      <section class="scr-new">
        <div class="scr-sec-head"><h2>Test something new on this screen</h2><span>spine.ai goes to this screen the way the walk did, then tests what you typed — every action photographed</span></div>
        <div class="scr-new-row"><textarea id="scr-new-text" rows="2" placeholder="e.g. Publishing without a title shows an error and stays on the create screen"></textarea><button type="button" class="run-btn primary" id="scr-new-go">Write, then run with spotlight</button></div>
        <p class="scr-new-note" id="scr-new-note" hidden></p>
      </section>
      <section>
        <div class="scr-sec-head"><h2>Test cases written from this screen</h2><span>${s.cases.length}</span></div>
        <div id="scr-cases">${s.cases.length ? s.cases.map(caseCard).join("") : `<p class="scr-empty">None yet. Pick a control above and press “Write a test case”, or walk this screen with cases on.</p>`}</div>
      </section>
      <section>
        <details class="cv-details"><summary>Rules Procol's code enforces on this screen (${s.rules.length}, ${s.rules.filter((r) => r.verdict === "not covered").length} untested)</summary>
          <ul class="scr-rules">${s.rules.map((r) => `<li><code>${esc(r.id)}</code> <span class="pill ${r.verdict === "covered" ? "good" : r.verdict === "partly" ? "warn" : "bad"}">${esc(r.verdict)}</span> ${esc(r.statement)} <small>${esc(r.cite)}</small></li>`).join("")}</ul></details>
      </section>`;
    const im = q("#scr-img");
    const layBoxes = () => layoutBoxes();
    if (im.complete) layBoxes();
    im.addEventListener("load", layBoxes);
    window.addEventListener("resize", layBoxes);
    for (const b of document.querySelectorAll("[data-kind]")) b.addEventListener("click", () => { state.kind = b.dataset.kind; paintScreen(); });
    const list = q("#scr-controls");
    list.addEventListener("mouseover", (e) => { const li = e.target.closest("[data-n]"); if (li) hover(Number(li.dataset.n)); });
    list.addEventListener("mouseleave", () => hover(null));
    list.addEventListener("click", (e) => { const li = e.target.closest("[data-n]"); if (li) pick(Number(li.dataset.n)); });
    document.querySelector("#scr-cases")?.addEventListener("click", onCaseClick);
    q("#scr-new-go")?.addEventListener("click", newCase);
    q("#scr-new-text")?.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) newCase(); });
    paintEffect();
  }

  async function newCase() {
    const text = (q("#scr-new-text")?.value || "").trim();
    const btn = q("#scr-new-go");
    const note = q("#scr-new-note");
    if (text.length < 8) { note.hidden = false; note.textContent = "Say what to test, in a sentence or two."; return; }
    btn.disabled = true;
    btn.textContent = "Compiling the case…";
    note.hidden = false;
    note.textContent = "Reading the memory and the screen, writing the steps…";
    const r = await fetch("/api/screens/newcase", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: state.screen.id, text, companyId: clientId() }) }).then((x) => x.json()).catch((e) => ({ why: String(e) }));
    btn.disabled = false;
    btn.textContent = "Write, then run with spotlight";
    if (r.why) { note.textContent = r.why; return; }
    note.textContent = `${r.case.id} written — plan ${r.coverage}${r.gaps?.length ? ` (${r.gaps[0]})` : ""}${r.reasoning ? ` · ${r.reasoning.slice(0, 160)}` : ""}`;
    state.screen.cases.unshift(r.case);
    const list = q("#scr-cases");
    if (list.querySelector(".scr-empty")) list.innerHTML = "";
    list.insertAdjacentHTML("afterbegin", caseCard(r.case));
    const card = list.querySelector(".scr-case");
    card?.scrollIntoView({ block: "start", behavior: "smooth" });
    if (r.coverage !== "none") card?.querySelector("[data-run]")?.click();
  }

  function controlRow(c) {
    const e = effectOf(c.n);
    const conf = CONF[e?.confidence || "unknown"];
    return `<li data-n="${c.n}" class="${state.picked === c.n ? "picked" : ""}"><span class="scr-num" style="background:${KIND_COLOUR[c.kind] || "#d946ef"}">${c.n}</span><span class="scr-cname"><b>${esc(c.name)}</b><small>${esc(c.kind)}${c.disabled ? " · disabled" : ""}${c.required ? " · required" : ""}${c.danger ? " · destructive" : ""}${c.offscreen ? " · below the fold" : ""}</small></span><span class="pill ${conf[1]}">${conf[0]}</span></li>`;
  }

  function layoutBoxes() {
    const s = state.screen;
    const im = q("#scr-img");
    const layer = q("#scr-boxes");
    if (!im || !layer || !s.viewport) return;
    const k = im.clientWidth / s.viewport.w;
    layer.style.width = `${im.clientWidth}px`;
    layer.style.height = `${im.clientHeight}px`;
    layer.innerHTML = s.controls
      .filter((c) => c.box && !c.offscreen)
      .map((c) => `<div class="scr-box" data-n="${c.n}" style="left:${c.box.x * k}px;top:${c.box.y * k}px;width:${c.box.w * k}px;height:${c.box.h * k}px;--c:${KIND_COLOUR[c.kind] || "#d946ef"}"></div>`)
      .join("");
    layer.onmouseover = (e) => { const b = e.target.closest("[data-n]"); if (b) hover(Number(b.dataset.n), b); };
    layer.onmouseleave = () => hover(null);
    layer.onclick = (e) => { const b = e.target.closest("[data-n]"); if (b) pick(Number(b.dataset.n)); };
  }

  function hover(n, boxEl) {
    state.hover = n;
    for (const b of document.querySelectorAll(".scr-box")) b.classList.toggle("hover", Number(b.dataset.n) === n);
    for (const li of document.querySelectorAll("#scr-controls li")) li.classList.toggle("hover", Number(li.dataset.n) === n);
    const tip = q("#scr-tip");
    if (!tip) return;
    if (n == null) return void (tip.hidden = true);
    const c = controlOf(n);
    const e = effectOf(n);
    const box = boxEl || document.querySelector(`.scr-box[data-n="${n}"]`);
    tip.innerHTML = `<b>${n} · ${esc(c?.name || "")}</b><span>${esc(e && e.does !== "unknown" ? e.does : "What this does is not known yet.")}</span>${e?.leadsTo && !/unknown/i.test(e.leadsTo) ? `<small>→ ${esc(e.leadsTo)}</small>` : ""}`;
    tip.hidden = false;
    if (box) {
      const stage = q("#scr-stage");
      const top = box.offsetTop + box.offsetHeight + 6;
      tip.style.left = `${Math.min(box.offsetLeft, Math.max(0, stage.clientWidth - 340))}px`;
      tip.style.top = `${top + 160 > stage.clientHeight ? Math.max(0, box.offsetTop - tip.offsetHeight - 6) : top}px`;
    }
    if (!boxEl && box) box.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  function pick(n) {
    state.picked = n;
    for (const li of document.querySelectorAll("#scr-controls li")) li.classList.toggle("picked", Number(li.dataset.n) === n);
    for (const b of document.querySelectorAll(".scr-box")) b.classList.toggle("picked", Number(b.dataset.n) === n);
    document.querySelector(`#scr-controls li[data-n="${n}"]`)?.scrollIntoView({ block: "nearest" });
    paintEffect();
  }

  function paintEffect() {
    const el = q("#scr-effect");
    if (!el) return;
    const n = state.picked;
    if (n == null) {
      el.innerHTML = `<div class="scr-effect-empty">Pick a control to see what it does to the product — and write a test case from it.</div>`;
      return;
    }
    const c = controlOf(n);
    const e = effectOf(n) || { does: "unknown", affects: "unknown", leadsTo: "unknown", check: "", confidence: "unknown" };
    const conf = CONF[e.confidence] || CONF.unknown;
    const cases = state.screen.cases.filter((x) => (x.controls || []).includes(n));
    el.innerHTML = `<div class="scr-effect-card">
      <div class="scr-effect-head"><span class="scr-num big" style="background:${KIND_COLOUR[c.kind] || "#d946ef"}">${n}</span><div><h3>${esc(c.name)}</h3><small>${esc(c.kind)}${c.disabled ? " · disabled now" : ""}${c.required ? " · required" : ""}${c.hint ? ` · hint: ${esc(c.hint)}` : ""}${c.placeholder ? ` · placeholder “${esc(c.placeholder)}”` : ""}</small></div><span class="pill ${conf[1]}">${conf[0]}</span></div>
      <dl class="scr-dl">
        <dt>What it does</dt><dd>${esc(e.does)}</dd>
        <dt>What it affects</dt><dd>${esc(e.affects)}</dd>
        <dt>Leads to</dt><dd>${esc(e.leadsTo)}</dd>
        ${e.check ? `<dt>How to check</dt><dd>${esc(e.check)}</dd>` : ""}
        ${e.rule ? `<dt>Code rule</dt><dd><code>${esc(e.rule)}</code> ${esc(state.screen.rules.find((r) => r.id === e.rule)?.statement || "")}</dd>` : ""}
      </dl>
      <div class="scr-effect-actions"><button type="button" class="run-btn primary" id="scr-write" ${e.confidence === "unknown" ? "disabled title='nothing known about this control yet'" : ""}>Write a test case from this</button>${cases.length ? `<span>${cases.length} case${cases.length === 1 ? "" : "s"} already: ${cases.map((x) => `<code>${esc(x.id)}</code>`).join(" ")}</span>` : ""}</div>
    </div>`;
    q("#scr-write")?.addEventListener("click", async () => {
      const b = q("#scr-write");
      b.disabled = true;
      b.textContent = "Writing and compiling…";
      const r = await fetch("/api/screens/case", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: state.screen.id, n, companyId: clientId() }) }).then((x) => x.json());
      if (r.why) {
        alert(r.why);
        b.disabled = false;
        b.textContent = "Write a test case from this";
        return;
      }
      state.screen.cases.push(r.case);
      const list = q("#scr-cases");
      if (list.querySelector(".scr-empty")) list.innerHTML = "";
      list.insertAdjacentHTML("afterbegin", caseCard(r.case));
      paintEffect();
      list.querySelector(".scr-case")?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function caseCard(c) {
    const cov = c.coverage === "full" ? ["Runs on screen", "good"] : c.coverage === "partial" ? ["Runs partly", "warn"] : ["No browser plan yet", "idle"];
    return `<article class="scr-case" data-case="${esc(c.id)}">
      <div class="scr-case-head"><code>${esc(c.id)}</code><b>${esc(c.title)}</b><span class="pill ${cov[1]}">${cov[0]}</span>${c.grounded && c.grounded !== "screen" ? `<code class="scr-rule">${esc(c.grounded)}</code>` : ""}
        <button type="button" class="run-btn primary small" data-run="${esc(c.id)}" ${c.coverage === "none" ? "disabled" : ""}>Run with spotlight</button></div>
      ${c.setup ? `<p class="scr-case-setup"><b>Setup:</b> ${esc(c.setup)}</p>` : ""}
      <ol class="scr-steps">${(c.steps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      <p class="scr-expected"><b>Expected:</b> ${esc(c.expected)}</p>
      ${c.gaps?.length ? `<p class="scr-gaps"><b>Not yet expressible:</b> ${esc(c.gaps.join("; "))}</p>` : ""}
      <div class="scr-case-live" data-live hidden></div>
    </article>`;
  }

  let runEs = null;
  function onCaseClick(e) {
    const b = e.target.closest("[data-run]");
    if (!b) return;
    const id = b.dataset.run;
    const art = b.closest(".scr-case");
    const box = art.querySelector("[data-live]");
    box.hidden = false;
    runEs?.close();
    const panel = livePanel(box, `Running ${id}`);
    b.disabled = true;
    const es = new EventSource(`/api/screens/run?draft=${encodeURIComponent(id)}&c=${clientId()}`);
    runEs = es;
    panel.stopButton?.addEventListener("click", () => { es.close(); panel.done("stopped", false); b.disabled = false; });
    es.addEventListener("stage", (ev) => panel.log(JSON.parse(ev.data).line, "head"));
    es.addEventListener("queued", (ev) => panel.line(JSON.parse(ev.data).line));
    es.addEventListener("log", (ev) => {
      const line = String(JSON.parse(ev.data).line || "");
      const m = line.match(/\[plan\] (\d+\/\d+ .*)$/);
      if (m) { panel.line(m[1].slice(0, 200)); panel.log(m[1], /✗/.test(m[1]) ? "bad" : ""); }
      else if (/\[create-event\]|\[observe\]|\[inventory\]/.test(line)) panel.log(line.replace(/^.*?\] /, ""));
    });
    es.addEventListener("frame", (ev) => panel.frame(JSON.parse(ev.data).frame));
    es.addEventListener("spot", (ev) => panel.spot(JSON.parse(ev.data).spot));
    es.addEventListener("plan-result", (ev) => {
      const r = JSON.parse(ev.data);
      const ok = r.steps.filter((s) => s.status === "ok").length;
      panel.done(`${r.passed ? "Passed" : "Failed"} — ${ok}/${r.steps.length} steps${r.passed ? "" : `; stopped at ${r.steps.find((s) => s.status === "failed")?.step || "?"}`}`, r.passed);
    });
    es.addEventListener("run-error", (ev) => { panel.done(JSON.parse(ev.data).line || "could not run", false); });
    es.addEventListener("done", () => { es.close(); b.disabled = false; });
    es.onerror = () => { b.disabled = false; };
  }

  // ── routing ───────────────────────────────────────────────────────────────────────────────
  function route() {
    if (!root()) return;
    if (state.view === "walk") paintWalk();
    else if (state.view === "screen") loadScreen();
    else {
      walkEs?.close();
      loadList();
    }
  }
  window.addEventListener("hashchange", () => {
    if (parse()) route();
  });
  if (parse()) route();
})();
