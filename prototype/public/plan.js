/**
 * PLAN A RUN (#/plan).
 *
 * One screen for what API automation and UI automation did. It owns no run
 * logic and no selection of its own: it ticks features in app.js's `selected`
 * set (so the one-event-type rule and the "always runs" steps keep holding),
 * writes its inputs into the two old views' (hidden) inputs, and calls their
 * run functions — so a run from here sends exactly the requests those
 * screens sent:
 *
 *   API  → runSelectedFeatures()      → /api/features-run (or the RFP suite)
 *   UI   → runSelectedUiJourneys()    → /api/ui-run, one journey at a time
 *   Both → the API run, then the UI run once it has finished
 *
 * app.js calls window.spinePlan.render() whenever the features, the browser
 * journeys or the account change (planChanged()).
 */
(function () {
  "use strict";

  const q$ = (sel, root = document) => root.querySelector(sel);
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (name, cls = "") => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  const read = (fn, fallback) => {
    try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; }
  };

  // ── app.js state, read defensively ───────────────────────────────────────
  const groups = () => read(() => featureGroups, []) || [];
  const sel = () => read(() => selected, null);
  const flows = () => read(() => uiFlows, []) || [];
  const state = () => read(() => featuresState, "loading");
  const isOff = (f) => f.config?.state === "off";
  const runnable = (f) => f.cases > 0 && !isOff(f);
  const isPre = (f) => !!f.prerequisite && runnable(f);
  const heldBy = (f) => read(() => exclusiveHolder(f, selected, byFeatureId), null);
  const hasJourney = (f) => !!f.uiFlow && flows().some((fl) => fl.key === f.uiFlow);
  /** The browser journeys load after the features (seconds, for some accounts). */
  const flowsKnown = () => !!read(() => uiFlowsLoaded, true);
  /** Accounts whose API side is the PO flow: the case library cannot run there. */
  const poMode = () => { const bar = q$("#po-bar"); return !!bar && !bar.hidden; };
  const canTick = (f) => runnable(f) && !isPre(f) && !heldBy(f) && !poMode();

  /** The features picked for the run (not the "always runs" steps), in tree order. */
  function picked() {
    const s = sel();
    const out = [];
    if (!s) return out;
    for (const g of groups()) for (const f of g.children) if (s.has(f.id) && !f.prerequisite) out.push(f);
    return out;
  }

  function setPicked(id, on) {
    const s = sel();
    if (!s) return;
    on ? s.add(id) : s.delete(id);
    // app.js's own redraw re-applies the product's rules (one event type,
    // the "always runs" steps), updates the badge, and calls render() here.
    read(() => renderTree(), null);
  }

  // ── what stays between renders ───────────────────────────────────────────
  const openGroups = new Set();
  let openedFirst = false;
  let query = "";
  const inputs = { li: 1, mode: "same", qty: ["5"], v: 1, edges: true };
  let inputsFrom = null; // which account the inputs were last read for

  /** The company's ceiling on line items (from its configuration). */
  const liMax = () => Number(read(() => uiLimits?.non_boq, 0)) || Number(q$("#api-line-items")?.max) || 50;

  /** Start from the inputs the old screens hold for this account (a suite account sets its own). */
  function seedInputs() {
    const who = `${read(() => currentClient, "")}|${read(() => featureSuite?.id, "")}`;
    if (inputsFrom === who) return;
    inputsFrom = who;
    const n = Math.max(1, Number(q$("#api-line-items")?.value) || 1);
    const q = String(q$("#api-qty")?.value || "5").split(",").map((x) => x.trim()).filter(Boolean);
    inputs.li = Math.min(n, liMax());
    inputs.qty = q.length ? q.slice(0, 6) : ["5"];
    inputs.mode = q.length > 1 && inputs.li > 1 ? "per" : "same";
    inputs.v = Math.min(10, Math.max(1, Number(q$("#api-vendors")?.value) || 1));
    inputs.edges = q$("#api-edges")?.checked !== false;
  }

  // ── focus survives a redraw ──────────────────────────────────────────────
  function rememberFocus() {
    return document.activeElement?.closest?.("#view-plan [data-fk]")?.dataset.fk ?? null;
  }
  function restoreFocus(key) {
    if (!key) return;
    q$(`#view-plan [data-fk="${CSS.escape(key)}"]`)?.focus();
  }

  // ── the feature list ─────────────────────────────────────────────────────
  function tagFor(f) {
    if (isOff(f)) {
      const why = (f.config?.reasons && f.config.reasons[0]) || (f.config?.flag ? `${f.config.flag} is off for this company` : "switched off for this company");
      return `<span class="pl-tag warn" title="${h(why)}">Off for client</span>`;
    }
    if (!(f.cases > 0)) return `<span class="pl-tag" title="No test cases written for this yet">No tests yet</span>`;
    if (isPre(f)) return `<span class="pl-tag" title="Every event goes through this step; it runs with whatever you pick">Always runs</span>`;
    const holder = heldBy(f);
    if (holder) return `<span class="pl-tag" title="An event has one type. Untick “${h(holder.label)}” to pick this instead.">One type per run</span>`;
    if (flowsKnown() && !hasJourney(f)) return `<span class="pl-tag" title="No browser journey for this yet: it runs through the API">API only</span>`;
    return "";
  }

  function renderList() {
    const box = q$("#pl-groups");
    if (!box) return;
    const st = state();
    if (st === "error") {
      box.innerHTML = `<div class="pl-msg">Couldn't load features · <button type="button" data-retry>Retry</button></div>`;
      return;
    }
    const gs = groups();
    if (st === "loading" || !gs.length) {
      box.innerHTML = Array.from({ length: 6 }, () => `<div class="pl-skel"><span class="skel"></span></div>`).join("");
      return;
    }
    const s = sel();
    const total = gs.reduce((n, g) => n + g.children.length, 0);
    const search = q$("#pl-q");
    if (search) search.placeholder = `Filter ${num(total)} features`;

    // Open the first group holding a pick, once, so a returning reader sees it.
    if (!openedFirst) {
      const first = gs.find((g) => g.children.some((f) => s?.has(f.id) && !f.prerequisite));
      if (first) {
        openGroups.add(first.id ?? first.label);
        openedFirst = true;
      }
    }

    const q = query.trim().toLowerCase();
    const parts = [];
    for (const g of gs) {
      const key = g.id ?? g.label;
      const shown = q ? g.children.filter((f) => f.label.toLowerCase().includes(q)) : g.children;
      if (q && !shown.length) continue;
      const choosable = g.children.filter((f) => runnable(f) && !isPre(f));
      const on = choosable.filter((f) => s?.has(f.id)).length;
      const open = q ? true : openGroups.has(key);
      const rows = open
        ? `<div class="pl-frows">${shown
            .map((f) => {
              const ok = canTick(f);
              const checked = s?.has(f.id) || isPre(f);
              return (
                `<div class="pl-frow${ok ? "" : " is-off"}">` +
                `<label class="pl-flabel"><input type="checkbox" class="pl-cb" data-id="${h(f.id)}" data-fk="f:${h(f.id)}"${checked ? " checked" : ""}${ok ? "" : " disabled"} />` +
                `<span class="pl-fname">${h(f.label)}</span></label>` +
                tagFor(f) +
                `<span class="pl-fn">${f.cases ? num(f.cases) : "—"}</span></div>`
              );
            })
            .join("")}</div>`
        : "";
      parts.push(
        `<div class="pl-group${open ? " open" : ""}" data-group="${h(key)}">` +
          `<div class="pl-ghead" data-toggle="${h(key)}">` +
          `<input type="checkbox" class="pl-cb pl-gcb" data-gkey="${h(key)}" data-fk="g:${h(key)}" aria-label="Select all in ${h(g.label)}"` +
          `${on ? " checked" : ""}${choosable.length && !poMode() ? "" : " disabled"} />` +
          `<span class="pl-gnum">${g.step ? g.step : "·"}</span>` +
          `<span class="pl-gname">${h(g.label)}</span>` +
          `<span class="pl-gcount${on ? " some" : ""}">${on}/${choosable.length}</span>` +
          `<button type="button" class="pl-gtoggle" data-toggle="${h(key)}" data-fk="t:${h(key)}" aria-expanded="${open}" aria-label="${open ? "Collapse" : "Expand"} ${h(g.label)}">${icon("chevron-down")}</button>` +
          `</div>${rows}</div>`,
      );
    }
    box.innerHTML = parts.length ? parts.join("") : `<div class="pl-msg">No feature matches “${h(query)}”.</div>`;
    // Indeterminate is a property, not an attribute.
    for (const cb of box.querySelectorAll(".pl-gcb")) {
      const g = gs.find((x) => (x.id ?? x.label) === cb.dataset.gkey);
      const choosable = g ? g.children.filter((f) => runnable(f) && !isPre(f)) : [];
      const on = choosable.filter((f) => s?.has(f.id)).length;
      cb.indeterminate = on > 0 && on < choosable.length;
    }
  }

  // ── the panel ────────────────────────────────────────────────────────────
  /** The furthest stage the ticked features take an event to (as journeyModel.reachFor). */
  function reachOf(ids) {
    const has = (...p) => ids.some((id) => p.some((x) => id.startsWith(x)));
    if (has("award.") || ids.includes("events.awarding_rule")) return "award";
    if (has("evaluation.")) return "evaluate";
    if (has("bids.", "negotiation.", "auction.")) return "bid";
    return "publish";
  }

  function quantities() {
    const n = inputs.li;
    if (inputs.mode === "same" || n === 1) return [inputs.qty[0] ?? "5"];
    return Array.from({ length: n }, (_, i) => inputs.qty[Math.min(i, 5)] ?? inputs.qty[0] ?? "5");
  }

  function problems() {
    const out = [];
    const max = liMax();
    if (!(Number.isInteger(inputs.li) && inputs.li >= 1 && inputs.li <= max)) out.push(`Line items: a whole number from 1 to ${max}.`);
    if (!(Number.isInteger(inputs.v) && inputs.v >= 1 && inputs.v <= 10)) out.push("Vendors invited: a whole number from 1 to 10.");
    const shown = inputs.mode === "same" || inputs.li === 1 ? 1 : Math.min(inputs.li, 6);
    for (let i = 0; i < shown; i++) {
      const v = String(inputs.qty[i] ?? "").trim();
      if (!(Number(v) > 0)) out.push(`${shown > 1 ? `Quantity, line ${i + 1}` : "Quantity"}: a number above 0 (2.5 is fine).`);
    }
    return out;
  }

  let qtySig = "";
  function renderQty() {
    const per = q$("#pl-qty-per");
    const one = inputs.li === 1;
    if (per) {
      per.disabled = one;
      per.closest("label").title = one ? "Only one line item" : "";
    }
    if (one) inputs.mode = "same";
    for (const r of document.querySelectorAll('input[name="pl-qty-mode"]')) r.checked = r.value === inputs.mode;
    const sig = `${inputs.mode}|${inputs.mode === "same" ? 1 : Math.min(inputs.li, 6)}|${inputs.li > 6 ? inputs.li : ""}`;
    const box = q$("#pl-qty-boxes");
    if (!box || sig === qtySig) return;
    qtySig = sig;
    if (inputs.mode === "same") {
      box.innerHTML =
        `<div class="pl-qty-same"><input class="pl-qinput" data-q="0" data-fk="q:0" inputmode="decimal" value="${h(inputs.qty[0] ?? "5")}" aria-label="Quantity on each line" />` +
        `<span class="pl-suffix">each line</span></div>`;
      return;
    }
    const n = Math.min(inputs.li, 6);
    box.innerHTML =
      `<div class="pl-qty-grid">${Array.from({ length: n }, (_, i) =>
        `<label class="pl-qty-cell"><span>L${i + 1}</span><input class="pl-qinput" data-q="${i}" data-fk="q:${i}" inputmode="decimal" value="${h(inputs.qty[i] ?? inputs.qty[0] ?? "5")}" aria-label="Quantity on line ${i + 1}" /></label>`,
      ).join("")}</div>` +
      (inputs.li > 6 ? `<p class="pl-qty-note">Lines 7–${inputs.li} copy line 6.</p>` : "");
  }

  function renderSteppers() {
    const max = liMax();
    const li = q$("#pl-li");
    const v = q$("#pl-v");
    if (li && document.activeElement !== li) li.value = String(inputs.li);
    if (v && document.activeElement !== v) v.value = String(inputs.v);
    for (const b of document.querySelectorAll('#view-plan [data-step="li"]')) {
      const down = b.dataset.dir === "-1";
      b.disabled = down ? inputs.li <= 1 : inputs.li >= max;
      b.title = down ? "Fewer line items (min 1)" : `More line items (max ${max} for this company)`;
    }
    for (const b of document.querySelectorAll('#view-plan [data-step="v"]')) {
      b.disabled = b.dataset.dir === "-1" ? inputs.v <= 1 : inputs.v >= 10;
    }
    const sw = q$("#pl-edges");
    if (sw) sw.setAttribute("aria-checked", String(inputs.edges));
  }

  let menuOpen = false;
  function renderPanel() {
    const list = picked();
    const N = list.length;
    const M = list.filter(hasJourney).length;
    const s = sel();

    const chips = q$("#pl-chips");
    if (chips) {
      chips.innerHTML = N
        ? list
            .map(
              (f) =>
                `<span class="pl-chip"><span class="pl-chip-name">${h(f.label)}</span>` +
                `<button type="button" class="pl-chip-x" data-remove="${h(f.id)}" data-fk="x:${h(f.id)}" aria-label="Remove ${h(f.label)}">${icon("x")}</button></span>`,
            )
            .join("")
        : `<p class="pl-empty">Tick features on the left.</p>`;
    }

    renderSteppers();
    renderQty();

    const errs = problems();
    const errBox = q$("#pl-errors");
    if (errBox) {
      errBox.hidden = !errs.length;
      errBox.textContent = errs.join(" ");
    }

    const po = q$("#pl-po");
    if (po) {
      po.hidden = !poMode();
      if (poMode()) {
        q$("#pl-po-text").textContent =
          `This account runs the purchase-order flow through the API, not the case library. ${q$("#po-what")?.textContent ?? ""}`.trim();
        const btn = q$("#pl-po-run");
        const real = q$("#po-run");
        if (btn && real) {
          btn.disabled = !!real.disabled;
          btn.title = real.title || "";
        }
      }
    }

    // "{cases} cases · stops at {stage}"
    let cases = 0;
    for (const g of groups()) for (const f of g.children) if (s?.has(f.id)) cases += f.cases || 0;
    const sum = q$("#pl-sum");
    if (sum) sum.textContent = N ? `${num(cases)} case${cases === 1 ? "" : "s"} · stops at ${reachOf(list.map((f) => f.id))}` : "Nothing selected yet";

    const run = q$("#pl-run");
    if (run) {
      run.disabled = !N || errs.length > 0;
      run.title = !N ? "Tick at least one feature" : errs.length ? "Fix the settings in red first" : "";
      run.setAttribute("aria-expanded", String(menuOpen));
      q$("#pl-run-text").textContent = menuOpen ? "Choose how to run" : `Run ${N} selected`;
      q$("#pl-run-ico")?.setAttribute("href", menuOpen ? "#i-chevron-down" : "#i-chevron-up");
    }
    if (run?.disabled && menuOpen) closeMenu(false);

    const menu = q$("#pl-menu");
    if (menu && menuOpen) {
      const apiOff = poMode() ? "This account runs PO automation instead (above)" : "";
      const known = flowsKnown();
      const uiOff = !known ? "Still checking which features have a browser journey" : M ? "" : "None of the ticked features has a browser journey";
      const item = (mode, label, count, why) =>
        `<button type="button" class="pl-mi" role="menuitem" data-mode="${mode}" tabindex="-1"${why ? ` disabled title="${h(why)}"` : ""}>` +
        `<span class="pl-mi-label">${label}</span><span class="pl-mi-n">${count}</span>${icon("chevron-right")}</button>`;
      menu.innerHTML =
        item("api", "API", `${N} feature${N === 1 ? "" : "s"}`, apiOff) +
        item("ui", "UI", known ? `${M} feature${M === 1 ? "" : "s"}` : "checking…", uiOff) +
        item("both", "Both", known ? `${N} + ${M}` : "checking…", apiOff || uiOff);
    }

    renderRepeat();
  }

  // ── the run menu ─────────────────────────────────────────────────────────
  function openMenu() {
    menuOpen = true;
    q$("#pl-menu").hidden = false;
    renderPanel();
    q$("#pl-menu .pl-mi:not(:disabled)")?.focus();
  }
  function closeMenu(focusButton) {
    if (!menuOpen) return;
    menuOpen = false;
    const menu = q$("#pl-menu");
    if (menu) menu.hidden = true;
    renderPanel();
    if (focusButton) q$("#pl-run")?.focus();
  }

  /** Copies this screen's inputs into the old views' inputs, which the run functions read. */
  function applyInputs() {
    const n = inputs.li;
    const qty = quantities().join(",");
    const same = inputs.mode === "same" || n === 1;
    const set = (sel, v) => { const e = q$(sel); if (e) e.value = String(v); };
    set("#api-line-items", n);
    const sameBox = q$("#api-qty-same");
    if (sameBox) sameBox.checked = same;
    set("#api-qty", qty);
    set("#api-vendors", inputs.v);
    const edges = q$("#api-edges");
    if (edges) edges.checked = inputs.edges;
    read(() => syncApiInputs(), null); // redraws the hidden quantity boxes from #api-qty
    set("#li-normal", n);
    set("#ui-qty", qty);
    set("#ui-vendors", inputs.v);
    const login = q$("#ui-login");
    if (login) login.checked = true; // sign in on screen, always, from here
  }

  function startApi() {
    applyInputs();
    const errs = read(() => validateApiInputs(), []) || [];
    if (errs.length) {
      const box = q$("#pl-errors");
      if (box) { box.hidden = false; box.textContent = errs.join(" "); }
      return false;
    }
    read(() => runSelectedFeatures(), null);
    return true;
  }

  function startUi() {
    applyInputs();
    const keys = [...new Set(picked().filter(hasJourney).map((f) => f.uiFlow))];
    if (!keys.length) return false;
    const ui = read(() => uiSelected, null);
    if (!ui) return false;
    ui.clear();
    keys.forEach((k) => ui.add(k));
    read(() => runSelectedUiJourneys(), null);
    return true;
  }

  /** API first; the browser run starts once the API run has finished. */
  function startBoth() {
    if (!startApi()) return;
    const began = Date.now();
    const wait = setInterval(() => {
      if (Date.now() - began < 1500) return;
      if (read(() => runLive, false)) return;
      clearInterval(wait);
      startUi();
    }, 1000);
  }

  function choose(mode) {
    closeMenu(false);
    if (mode === "api") startApi();
    else if (mode === "ui") startUi();
    else if (mode === "both") startBoth();
  }

  // ── Repeat last run ──────────────────────────────────────────────────────
  let lastRun = { client: null, ids: null, at: 0, loading: false };
  async function loadLastRun() {
    const client = read(() => currentClient, null);
    if (client == null || lastRun.loading) return;
    if (lastRun.client === client && Date.now() - lastRun.at < 30000) return;
    lastRun.loading = true;
    try {
      const { runs } = await (await fetch("/api/runs", { cache: "no-store" })).json();
      const name = String(read(() => currentClientName, "") || "").trim().toLowerCase();
      const mine = (runs ?? [])
        .filter((r) => (r.kind === "api" || !r.kind) && /^\s*features\s*:/i.test(r.request || ""))
        .filter((r) => { const n = String(r.companyName ?? "").trim().toLowerCase(); return n === name || n === String(client); })
        .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
      const ids = mine[0] ? mine[0].request.replace(/^\s*features\s*:\s*/i, "").split(",").map((x) => x.trim()).filter(Boolean) : null;
      lastRun = { client, ids, at: Date.now(), loading: false };
    } catch {
      lastRun = { client, ids: null, at: Date.now(), loading: false };
    }
    renderRepeat();
  }
  function renderRepeat() {
    const btn = q$("#pl-repeat");
    if (!btn) return;
    const usable = (lastRun.ids || []).filter((id) => groups().some((g) => g.children.some((f) => f.id === id && canTick(f))));
    btn.disabled = !usable.length;
    btn.title = usable.length
      ? `Tick the ${usable.length} feature${usable.length === 1 ? "" : "s"} from the last run on this client`
      : "No earlier feature run on this client to repeat";
  }
  function repeatLast() {
    const s = sel();
    if (!s || !lastRun.ids) return;
    const byId = new Map();
    for (const g of groups()) for (const f of g.children) byId.set(f.id, { f, g });
    s.clear();
    for (const id of lastRun.ids) {
      const hit = byId.get(id);
      if (hit && canTick(hit.f)) {
        s.add(id);
        openGroups.add(hit.g.id ?? hit.g.label);
      }
    }
    read(() => renderTree(), null);
  }

  // ── render ───────────────────────────────────────────────────────────────
  function render() {
    if (state() === "ready") seedInputs();
    const focus = rememberFocus();
    renderList();
    renderPanel();
    restoreFocus(focus);
    if (document.documentElement.dataset.view === "plan") loadLastRun();
  }

  // ── events ───────────────────────────────────────────────────────────────
  function init() {
    const view = q$("#view-plan");
    if (!view) return;

    q$("#pl-q")?.addEventListener("input", (e) => {
      query = e.target.value;
      renderList();
    });

    const list = q$("#pl-groups");
    list?.addEventListener("change", (e) => {
      const cb = e.target.closest(".pl-cb");
      if (!cb) return;
      if (cb.classList.contains("pl-gcb")) {
        const g = groups().find((x) => (x.id ?? x.label) === cb.dataset.gkey);
        if (!g) return;
        const s = sel();
        const kids = g.children.filter((f) => runnable(f) && !isPre(f));
        for (const f of kids) cb.checked ? s.add(f.id) : s.delete(f.id);
        if (cb.checked) openGroups.add(cb.dataset.gkey);
        read(() => renderTree(), null);
        return;
      }
      setPicked(cb.dataset.id, cb.checked);
    });
    list?.addEventListener("click", (e) => {
      if (e.target.closest("[data-retry]")) {
        read(() => loadFeatures(), null);
        return;
      }
      if (e.target.closest(".pl-cb, .pl-frows")) return;
      const t = e.target.closest("[data-toggle]");
      if (!t) return;
      const key = t.dataset.toggle;
      openGroups.has(key) ? openGroups.delete(key) : openGroups.add(key);
      const focus = rememberFocus();
      renderList();
      restoreFocus(focus);
    });

    q$("#pl-chips")?.addEventListener("click", (e) => {
      const x = e.target.closest("[data-remove]");
      if (x) setPicked(x.dataset.remove, false);
    });

    // Steppers and their number boxes.
    view.addEventListener("click", (e) => {
      const b = e.target.closest(".pl-step");
      if (!b || b.disabled) return;
      const d = Number(b.dataset.dir);
      if (b.dataset.step === "li") inputs.li = Math.min(liMax(), Math.max(1, (inputs.li || 1) + d));
      else inputs.v = Math.min(10, Math.max(1, (inputs.v || 1) + d));
      renderPanel();
    });
    const numberBox = (id, key, lo, hiFn) => {
      const box = q$(id);
      box?.addEventListener("input", () => {
        const n = Number(box.value.trim());
        inputs[key] = Number.isInteger(n) ? n : NaN;
        box.setAttribute("aria-invalid", String(!(Number.isInteger(n) && n >= lo && n <= hiFn())));
        renderPanel();
      });
      box?.addEventListener("blur", () => {
        const n = Number(box.value.trim());
        inputs[key] = Math.min(hiFn(), Math.max(lo, Number.isInteger(n) ? n : lo));
        box.value = String(inputs[key]);
        box.removeAttribute("aria-invalid");
        renderPanel();
      });
    };
    numberBox("#pl-li", "li", 1, liMax);
    numberBox("#pl-v", "v", 1, () => 10);

    // Quantity: mode and boxes.
    for (const r of document.querySelectorAll('input[name="pl-qty-mode"]')) {
      r.addEventListener("change", () => {
        inputs.mode = r.value;
        renderPanel();
      });
    }
    q$("#pl-qty-boxes")?.addEventListener("input", (e) => {
      const box = e.target.closest(".pl-qinput");
      if (!box) return;
      inputs.qty[Number(box.dataset.q)] = box.value.trim();
      box.setAttribute("aria-invalid", String(!(Number(box.value) > 0)));
      renderPanel();
    });

    q$("#pl-edges")?.addEventListener("click", () => {
      inputs.edges = !inputs.edges;
      renderPanel();
    });

    q$("#pl-repeat")?.addEventListener("click", repeatLast);
    q$("#pl-po-run")?.addEventListener("click", () => q$("#po-run")?.click());

    // The run button and its menu.
    q$("#pl-run")?.addEventListener("click", () => (menuOpen ? closeMenu(true) : openMenu()));
    q$("#pl-menu")?.addEventListener("click", (e) => {
      const item = e.target.closest(".pl-mi");
      if (item && !item.disabled) choose(item.dataset.mode);
    });
    q$("#pl-menu")?.addEventListener("keydown", (e) => {
      const items = [...q$("#pl-menu").querySelectorAll(".pl-mi:not(:disabled)")];
      const i = items.indexOf(document.activeElement);
      const go = (n) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
      if (e.key === "ArrowDown") go(i + 1);
      else if (e.key === "ArrowUp") go(i - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(items.length - 1);
      else if (e.key === "Escape") { e.preventDefault(); closeMenu(true); }
      else if (e.key === "Tab") closeMenu(false);
    });
    document.addEventListener("pointerdown", (e) => {
      if (menuOpen && !e.target.closest("#pl-menu, #pl-run")) closeMenu(false);
    });
    window.addEventListener("hashchange", () =>
      setTimeout(() => {
        if (menuOpen) closeMenu(false);
        if (document.documentElement.dataset.view === "plan") {
          // Arriving with nothing open: open the first group that holds a pick.
          if (!openGroups.size) openedFirst = false;
          render();
        }
      }, 0),
    );

    render();
  }

  window.spinePlan = { render };
  init();
})();
