// ── tiny helpers ──────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const AGENT_ICON = {
  System: "⚙️", Analyst: "🔍", Planner: "🗺️", "Test-designer": "✍️",
  Data: "🧪", Critic: "🧑‍⚖️", Executor: "🚀", Reporter: "📝",
};

// ── state ──
let currentClient = null;
let execData = null; // flow results captured from the Executor
let designedCases = null; // test cases captured from the Test-designer
let checkRows = []; // live automation check results
let checkFilter = "all"; // "all" | "fail"
let currentMap = null; // the loaded capability map (for the control panel)
// Catalog panel state. Declared here, not beside its own functions: `init()`
// is invoked at the top of this file and `let` does not hoist, so declaring
// these lower down threw before the first panel had loaded.
let catState = { layer: "", section: "", priority: "", verdict: "", q: "" };
let catCases = []; // the currently filtered page of the catalog
const catPicked = new Set(); // case ids the user has ticked
let catRunning = null; // the open EventSource while cases are running

// ── boot ──
init();
async function init() {
  loadFindings();
  loadKnowledge();
  loadStuck();
  loadGaps();
  initCatalog();
  pollRunState();
  setInterval(pollRunState, 2500);
  $("#ai-btn")?.addEventListener("click", runAiInstruction);
  $("#plan-btn")?.addEventListener("click", () => runTestCase(false));
  $("#plan-dry")?.addEventListener("click", () => runTestCase(true));
  $("#kb-go")?.addEventListener("click", () => loadKnowledge($("#kb-q").value.trim() || undefined));
  $("#kb-q")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadKnowledge($("#kb-q").value.trim() || undefined);
  });
  const { clients, defaultClient, provider } = await (await fetch("/api/clients")).json();
  setProvider(provider);
  const sel = $("#client");
  for (const c of clients) {
    const o = el("option");
    o.value = c.id;
    o.textContent = `${c.name} (${c.id})`;
    sel.appendChild(o);
  }
  sel.value = String(defaultClient);
  currentClient = defaultClient;
  sel.addEventListener("change", () => {
    currentClient = Number(sel.value);
    // Switching company re-reads that company's configuration and rebuilds the
    // tree — the same way the real Procol console reconfigures itself.
    loadFeatures();
    loadUiFlows();
  });
  $("#run").addEventListener("click", run);
  $("#ui-btn").addEventListener("click", runUi);
  $("#f-all").addEventListener("click", () => setFilter("all"));
  $("#f-fail").addEventListener("click", () => setFilter("fail"));
  $("#t-run").addEventListener("click", runSelectedFeatures);
  $("#t-none").addEventListener("click", () => {
    selected.clear();
    renderTree();
  });
  $("#ui-run-sel").addEventListener("click", runSelectedUiJourneys);
  $("#ui-none").addEventListener("click", () => {
    uiSelected.clear();
    renderUiTree();
  });
  $("#ui-stop").addEventListener("click", () => {
    if (uiRunning) {
      uiRunning.close();
      uiRunning = null;
      const c = $("#ui-console");
      if (c) c.appendChild(el("div", "note", "■ stopped by user"));
      document.querySelectorAll(".uibtn.running").forEach((b) => b.classList.remove("running"));
    }
  });
  loadFeatures();
  loadUiFlows();
  loadHistory();
}

function setFilter(f) {
  checkFilter = f;
  $("#f-all").classList.toggle("active", f === "all");
  $("#f-fail").classList.toggle("active", f === "fail");
  renderAutomation();
}

function setProvider(p) {
  const n = $("#provider");
  n.textContent = "AI: " + p.split(" (")[0];
  n.title = p;
  n.classList.toggle("live", /groq|claude/i.test(p));
}

// ── capability map ──
async function loadCapability(companyId) {
  const box = $("#capability");
  box.innerHTML = `<div class="loading">Loading ${companyId}'s configuration… <span class="spinner"></span></div>`;
  try {
    const map = await (await fetch("/api/capability?c=" + companyId)).json();
    if (map.error) throw new Error(map.error);
    renderCapability(box, map);
  } catch (e) {
    box.innerHTML = `<div class="loading">Could not load capability (${esc(e.message)}). This client may need a fresh console session.</div>`;
  }
}
// Which flows have a field-validation check suite (mirrors src/checks/suites.ts suiteKey).
function hasSuite(id) {
  return (
    id === "events.boq" ||
    id.startsWith("events.") ||
    ["masterdata.user_permissions", "masterdata.category", "masterdata.product", "masterdata.location", "masterdata.team"].includes(id)
  );
}

function renderCapability(box, map) {
  currentMap = map;
  box.innerHTML = "";
  const onCount = map.flows.filter((f) => f.enabled).length;

  const bar = el("div", "cap-bar");
  bar.appendChild(el("span", "cap-count", `${esc(map.companyName ?? "")} · ${onCount}/${map.flows.length} enabled`));
  const runAll = el("button", "cap-runall", "▶ Run all");
  runAll.title = "Run every enabled flow directly (functional, DB-verified)";
  runAll.addEventListener("click", runAllFlows);
  bar.appendChild(runAll);
  box.appendChild(bar);

  const groups = {};
  for (const f of map.flows) (groups[f.category] ??= []).push(f);
  for (const [cat, items] of Object.entries(groups)) {
    box.appendChild(el("div", "cap-group-title", esc(cat)));
    for (const f of items) {
      const item = el("div", "cap-item" + (f.enabled ? "" : " is-off"));
      item.appendChild(el("span", "cap-dot " + (f.enabled ? "on" : "off")));
      item.appendChild(el("span", "cap-name", esc(f.title)));
      if (f.enabled) {
        const res = el("span", "cap-res");
        res.dataset.flow = f.id;
        item.appendChild(res);
        const runBtn = el("button", "cap-btn", "▶");
        runBtn.title = "Run this flow directly (functional)";
        runBtn.addEventListener("click", (e) => { e.stopPropagation(); runFlowDirect(f.id, res); });
        item.appendChild(runBtn);
        if (hasSuite(f.id)) {
          const chkBtn = el("button", "cap-btn chk", "🧪");
          chkBtn.title = "Run this flow's validation checks";
          chkBtn.addEventListener("click", (e) => { e.stopPropagation(); runFlowChecks(f.id, f.title); });
          item.appendChild(chkBtn);
        }
      } else if (f.reason) {
        const r = el("span", "cap-reason", "skip");
        r.title = f.reason;
        item.appendChild(r);
      }
      box.appendChild(item);
    }
  }
}

// ── control panel: run a flow directly (like the Procol platform's buttons) ──
async function runFlowDirect(flowId, badge) {
  badge.textContent = "⟳";
  badge.className = "cap-res run";
  badge.title = "running…";
  try {
    const { result } = await (await fetch(`/api/flow-run?c=${currentClient}&flow=${encodeURIComponent(flowId)}`)).json();
    if (result.status === "passed") {
      badge.textContent = `✓ ${result.durationMs}ms`;
      badge.className = "cap-res ok";
      badge.title = result.verifiesDatabase ? "passed · DB-verified" : "passed";
    } else if (result.status === "skipped") {
      badge.textContent = "skip";
      badge.className = "cap-res skip";
      badge.title = result.gate?.reason || "skipped";
    } else {
      badge.textContent = "✗";
      badge.className = "cap-res bad";
      badge.title = result.error || "failed";
    }
  } catch {
    badge.textContent = "err";
    badge.className = "cap-res bad";
  }
}

async function runAllFlows() {
  if (!currentMap) return;
  for (const f of currentMap.flows) {
    if (!f.enabled) continue;
    const badge = document.querySelector(`.cap-res[data-flow="${f.id}"]`);
    if (badge) await runFlowDirect(f.id, badge);
  }
}

// ── feature tree: what to test ────────────────────────────────────────────
let featureGroups = [];
let selected = new Set();

async function loadFeatures() {
  const box = $("#tree");
  box.innerHTML = "";
  box.appendChild(el("div", "loading", "Reading this company's configuration… "));
  try {
    // Pass the client so the tree reflects THAT company's switched-on features —
    // the same source of truth the real Procol console uses.
    const { groups, defaults, totalCases, company } = await (
      await fetch("/api/features?c=" + currentClient)
    ).json();
    featureGroups = groups;
    selected = new Set(defaults);
    const featureCount = groups.reduce((n, g) => n + g.children.length, 0);
    const off = groups.reduce((n, g) => n + g.children.filter((c) => c.config?.state === "off").length, 0);
    $("#tree-count").textContent = company?.loaded
      ? `${featureCount} features · ${totalCases} cases · ${company.flagCount} settings read${off ? ` · ${off} off here` : ""}`
      : `${featureCount} features · ${totalCases} cases · config not read`;
    if (company?.loaded) {
      $("#tree-count").title =
        `${company.name}: ${company.flagCount} configuration settings, ${company.permissionCount} permissions, ` +
        `acting as ${company.actorRole}${company.actorEmail ? ` (${company.actorEmail})` : ""}`;
    }
    renderTree();
    renderUiTree();
  } catch {
    box.innerHTML = "";
    box.appendChild(el("div", "empty", "Could not load the feature list."));
  }
}

function renderTree() {
  const box = $("#tree");
  box.innerHTML = "";
  for (const g of featureGroups) {
    const wrap = el("div", "tgroup");
    const kidIds = g.children.map((c) => c.id);
    const onCount = kidIds.filter((id) => selected.has(id)).length;

    const head = el("div", "tgroup-head");
    const master = el("input");
    master.type = "checkbox";
    master.checked = onCount > 0;
    master.indeterminate = onCount > 0 && onCount < kidIds.length;
    master.title = onCount ? "Untick the whole group" : "Tick the whole group";
    master.addEventListener("change", () => {
      if (master.checked) kidIds.forEach((id) => selected.add(id));
      else kidIds.forEach((id) => selected.delete(id));
      renderTree();
    });
    head.appendChild(master);
    head.appendChild(el("span", "tgroup-ico", g.icon));
    head.appendChild(el("span", "tgroup-name", esc(g.label)));
    const groupCases = g.children.reduce((n, c) => n + (c.cases || 0), 0);
    head.appendChild(el("span", "tgroup-n", `${onCount}/${kidIds.length} · ${groupCases} cases`));
    wrap.appendChild(head);
    wrap.appendChild(el("div", "tgroup-what", esc(g.what)));

    const kids = el("div", "tkids");
    for (const f of g.children) {
      const row = el("div", "tkid" + (f.cases ? "" : " none"));
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = selected.has(f.id);
      cb.addEventListener("change", () => {
        cb.checked ? selected.add(f.id) : selected.delete(f.id);
        renderTree();
      });
      row.appendChild(cb);
      const name = el("span", "tkid-name");
      // Per-company configuration badge: on / off / unknown for THIS client.
      let cfgBadge = "";
      const st = f.config?.state;
      if (st === "on") cfgBadge = ` <span class="cfg on" title="${esc(f.requiresConfig || "")} is ON for this company">on</span>`;
      else if (st === "off")
        cfgBadge = ` <span class="cfg off" title="${esc(f.requiresConfig || "")} is OFF for this company — its tests will be skipped, not failed">off</span>`;
      else if (st === "unknown" && f.requiresConfig)
        cfgBadge = ` <span class="cfg unk" title="could not read ${esc(f.requiresConfig)} for this company">config?</span>`;
      name.innerHTML =
        `${esc(f.label)}${f.flowId ? ' <span class="tkid-flow" title="has a real end-to-end journey">e2e</span>' : ""}${cfgBadge}` +
        `<span class="tkid-what">${esc(f.what)}</span>`;
      name.addEventListener("click", () => {
        cb.checked = !cb.checked;
        cb.checked ? selected.add(f.id) : selected.delete(f.id);
        renderTree();
      });
      row.appendChild(name);
      const n = el("span", "tkid-n", f.cases ? `${f.cases}` : "—");
      n.title = f.cases ? `${f.cases} test cases` : "no test cases yet";
      row.appendChild(n);
      kids.appendChild(row);
    }
    wrap.appendChild(kids);
    box.appendChild(wrap);
  }
}

/** Run the test cases for every ticked feature. */
function runSelectedFeatures() {
  const ids = [...selected];
  if (!ids.length) {
    $("#auto-summary").textContent = "tick at least one feature first";
    return;
  }
  checkRows = [];
  renderAutomation();
  const flows = $("#t-flows").checked ? "1" : "0";
  const qs = new URLSearchParams({ c: String(currentClient), features: ids.join(","), flows });
  $("#auto-summary").textContent = `starting ${ids.length} feature(s)…`;
  const es = new EventSource(`/api/features-run?${qs}`);
  es.addEventListener("plan", (ev) => {
    const p = JSON.parse(ev.data);
    $("#auto-summary").textContent =
      `${p.runnable} checks from ${p.cases} cases` + (p.skipped?.length ? ` · ${p.skipped.length} skipped` : "");
  });
  es.addEventListener("flow", (ev) => {
    const f = JSON.parse(ev.data);
    if (f.status === "running") $("#auto-summary").textContent = `end-to-end: ${f.flowId}…`;
  });
  es.addEventListener("check", (ev) => {
    checkRows.push(JSON.parse(ev.data).check);
    renderAutomation();
  });
  es.addEventListener("progress", (ev) => {
    const p = JSON.parse(ev.data);
    const failed = checkRows.filter((c) => !c.pass).length;
    $("#auto-summary").textContent = `${p.done}/${p.total} · ${p.done - failed} passed · ${failed} failed`;
  });
  es.addEventListener("done", () => {
    es.close();
    const failed = checkRows.filter((c) => !c.pass).length;
    $("#auto-summary").textContent = `${checkRows.length} checks · ${checkRows.length - failed} passed · ${failed} failed`;
  });
  es.addEventListener("fatal", (ev) => {
    es.close();
    $("#auto-summary").textContent = `error: ${JSON.parse(ev.data).message || "run failed"}`;
  });
  document.querySelector("#automation")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ── UI coverage: the same 92 features, but which have a browser journey ───
let uiSelected = new Set();

function renderUiTree() {
  const box = $("#ui-tree");
  if (!box) return;
  box.innerHTML = "";
  let have = 0,
    total = 0;
  for (const g of featureGroups) {
    // Only show groups that contain at least one feature (all of them do).
    const wrap = el("div", "tgroup");
    const head = el("div", "tgroup-head");
    const kids = g.children.filter((f) => f.uiFlow);
    head.appendChild(el("span", "tgroup-ico", g.icon));
    head.appendChild(el("span", "tgroup-name", esc(g.label)));
    head.appendChild(el("span", "tgroup-n", `${kids.length}/${g.children.length} in UI`));
    wrap.appendChild(head);

    const list = el("div", "tkids");
    for (const f of g.children) {
      total++;
      const available = !!f.uiFlow;
      if (available) have++;
      const row = el("div", "tkid" + (available ? "" : " ui-na"));
      const cb = el("input");
      cb.type = "checkbox";
      cb.disabled = !available; // no journey built → cannot be picked
      cb.checked = available && uiSelected.has(f.uiFlow);
      cb.addEventListener("change", () => {
        cb.checked ? uiSelected.add(f.uiFlow) : uiSelected.delete(f.uiFlow);
        renderUiTree();
      });
      row.appendChild(cb);
      const name = el("span", "tkid-name");
      name.innerHTML =
        `${esc(f.label)}` +
        (available
          ? ` <span class="tkid-flow" title="browser journey: ${esc(f.uiFlow)}">${esc(f.uiFlow)}</span>`
          : ' <span class="ui-na-tag" title="no browser journey built for this feature yet">not built</span>');
      if (available)
        name.addEventListener("click", () => {
          cb.checked = !cb.checked;
          cb.checked ? uiSelected.add(f.uiFlow) : uiSelected.delete(f.uiFlow);
          renderUiTree();
        });
      row.appendChild(name);
      list.appendChild(row);
    }
    wrap.appendChild(list);
    box.appendChild(wrap);
  }
  $("#ui-cov-hint").textContent =
    `${have} of ${total} features have a browser journey · ${uiSelected.size} picked`;
}

/** Run every ticked UI journey, one after another, in one window each. */
async function runSelectedUiJourneys() {
  const keys = [...uiSelected];
  if (!keys.length) {
    $("#ui-cov-hint").textContent = "tick at least one feature that has a journey";
    return;
  }
  const con = $("#ui-console");
  con.hidden = false;
  con.innerHTML = "";
  for (let i = 0; i < keys.length; i++) {
    const flow = uiFlows.find((f) => f.key === keys[i]) ?? { key: keys[i], usesLineItems: true };
    const btn = document.querySelector(`.uibtn[data-flow="${keys[i]}"]`);
    con.appendChild(el("div", "cmd", `── ${i + 1}/${keys.length} · ${esc(keys[i])} ──`));
    await new Promise((done) => runUiJourney(flow, btn ?? el("button"), done));
  }
}

// ── browser journeys: run the real Playwright UI flows from a button ──────
let uiFlows = [];
let uiLimits = null;
let uiRunning = null; // EventSource of the active run

async function loadUiFlows() {
  const box = $("#ui-flows");
  try {
    const { flows, limits, erfxMode, boqAllowed } = await (
      await fetch("/api/ui-flows?c=" + currentClient)
    ).json();
    uiFlows = flows;
    uiLimits = limits;

    // Show this client's own line-item ceilings and pre-fill sensible values.
    const nonBoq = limits?.non_boq, boq = limits?.boq;
    $("#li-normal-max").textContent = nonBoq ? `max ${nonBoq}` : "";
    $("#li-boq-max").textContent = boq ? `max ${boq}` : "";
    if (nonBoq) $("#li-normal").max = nonBoq;
    if (boq) {
      $("#li-boq").max = boq;
      $("#li-boq").value = Math.min(10, boq);
    }
    $("#ui-flows-hint").textContent =
      (erfxMode === true ? "ERFX mode" : erfxMode === false ? "non-ERFX mode" : "mode unknown") +
      (boqAllowed === true ? " · BOQ on" : boqAllowed === false ? " · BOQ off" : "") +
      " — pick a journey";
    renderUiFlows();
  } catch {
    box.innerHTML = "";
    box.appendChild(el("div", "empty", "Could not load browser journeys."));
  }
}

function renderUiFlows() {
  const box = $("#ui-flows");
  box.innerHTML = "";
  const groups = {};
  for (const f of uiFlows) (groups[f.group] ??= []).push(f);
  for (const [group, items] of Object.entries(groups)) {
    box.appendChild(el("div", "uigroup-title", esc(group)));
    const grid = el("div", "uigrid");
    for (const f of items) {
      const b = el("button", "uibtn");
      b.dataset.flow = f.key;
      b.innerHTML = `${esc(f.label)}${f.usesLineItems ? '<span class="li">#</span>' : ""}`;
      b.title = `Runs: npx playwright test tests/ui-master.spec.ts -g "${f.key}" --headed`;
      b.addEventListener("click", () => runUiJourney(f, b));
      grid.appendChild(b);
    }
    box.appendChild(grid);
  }
}

/** Trigger one journey and stream Playwright's output into the console box. */
function runUiJourney(flow, btn, onDone) {
  if (uiRunning) {
    uiRunning.close();
    uiRunning = null;
  }
  document.querySelectorAll(".uibtn").forEach((b) => b.classList.remove("running", "ok", "bad"));
  btn.classList.add("running");

  const con = $("#ui-console");
  con.hidden = false;
  con.innerHTML = "";
  const write = (text, cls) => {
    const line = el("div", cls || "", esc(text));
    con.appendChild(line);
    con.scrollTop = con.scrollHeight;
  };

  const qs = new URLSearchParams({ c: String(currentClient), flow: flow.key });
  // Only send the count the journey actually uses.
  if (flow.usesLineItems) {
    if (flow.boq) qs.set("boqItems", $("#li-boq").value || "1");
    else qs.set("lineItems", $("#li-normal").value || "1");
  }
  if (!$("#ui-headed").checked) qs.set("headed", "0");

  const es = new EventSource(`/api/ui-run?${qs}`);
  uiRunning = es;
  es.addEventListener("start", (ev) => write(JSON.parse(ev.data).line, "cmd"));
  es.addEventListener("queued", (ev) => write("⏳ " + JSON.parse(ev.data).line, "warn"));
  es.addEventListener("note", (ev) => write("⚠ " + JSON.parse(ev.data).line, "note"));
  es.addEventListener("log", (ev) => write(JSON.parse(ev.data).line));
  // The Oracle's verdict is the point of the run: a journey that failed because
  // the API returned 500 means something entirely different from one that failed
  // because a selector moved, and the console alone cannot say which.
  es.addEventListener("verdicts", (ev) => {
    const { verdicts } = JSON.parse(ev.data);
    for (const v of verdicts) {
      const meta = VERDICT_META[v.kind] ?? VERDICT_META.automation_defect;
      write(`${meta.icon} ${meta.label.toUpperCase()} · ${v.severity} — ${v.title}`, v.actionable ? "bad" : "note");
      write(`   ${v.rationale}`, "note");
      for (const e of v.evidence ?? []) write(`   • ${e}`, "note");
    }
    loadFindings();
  });
  es.addEventListener("error", (ev) => {
    // A plain connection error has no data payload.
    let msg = "run error";
    try {
      msg = JSON.parse(ev.data).line || msg;
    } catch {}
    write("✗ " + msg, "bad");
    btn.classList.remove("running");
    btn.classList.add("bad");
    es.close();
    uiRunning = null;
    onDone?.();
  });
  es.addEventListener("done", (ev) => {
    const code = JSON.parse(ev.data).exitCode;
    write(code === 0 ? "✓ journey passed" : `✗ journey failed (exit ${code})`, code === 0 ? "ok" : "bad");
    btn.classList.remove("running");
    btn.classList.add(code === 0 ? "ok" : "bad");
    es.close();
    uiRunning = null;
    loadFindings();
    onDone?.();
  });
}

// ── validation suites panel ───────────────────────────────────────────────
let allSuites = [];

async function loadSuites() {
  const box = $("#suites");
  try {
    const { suites } = await (await fetch("/api/suites")).json();
    allSuites = suites;
    const writes = suites.filter((s) => s.kind === "write").length;
    const reads = suites.length - writes;
    $("#suite-count").textContent = `${suites.length} suites · ${writes} form · ${reads} read-only`;
    renderSuites();
  } catch (e) {
    box.innerHTML = "";
    box.appendChild(el("div", "empty", "Could not load suites."));
  }
}

function renderSuites() {
  const box = $("#suites");
  box.innerHTML = "";
  for (const s of allSuites) {
    const row = el("div", "cap-item on");
    const main = el("div", "cap-main");
    main.appendChild(el("div", "cap-name", esc(s.label)));
    main.appendChild(
      el("div", "cap-sub", `${esc(s.module)} · ${s.kind === "read" ? "read-only (creates nothing)" : "submits a form"}`),
    );
    row.appendChild(main);
    const res = el("span", "cap-res");
    res.dataset.suite = s.id;
    const btn = el("button", "cap-btn", "🧪");
    btn.title = `Run the ${s.label} suite live`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      runSuites({ ids: [s.id], badge: res });
    });
    row.appendChild(btn);
    row.appendChild(res);
    box.appendChild(row);
  }
}

/**
 * Run one, many, or all suites — every check streams into the same Automation
 * panel used by the AI orchestrator, so results always look the same.
 */
function runSuites({ ids = null, kind = "all", badge = null } = {}) {
  checkRows = [];
  renderAutomation();
  const qs = new URLSearchParams({ c: String(currentClient) });
  if (ids) qs.set("ids", ids.join(","));
  else qs.set("kind", kind);
  const label = ids ? ids.join(", ") : kind === "read" ? "all read-only suites" : "all suites";
  $("#auto-summary").textContent = `running ${label}…`;
  if (badge) badge.textContent = "⟳";
  let suiteCount = 0;
  const es = new EventSource(`/api/suites-run?${qs}`);
  es.addEventListener("plan", (ev) => {
    suiteCount = (JSON.parse(ev.data).suites || []).length;
    $("#auto-summary").textContent = `running ${suiteCount} suite(s)…`;
  });
  es.addEventListener("suite", (ev) => {
    const s = JSON.parse(ev.data);
    const b = document.querySelector(`.cap-res[data-suite="${s.id}"]`);
    if (!b) return;
    if (s.status === "running") b.textContent = "⟳";
    else if (s.status === "done") {
      const mine = checkRows.filter((c) => c.flowId === s.id);
      const failed = mine.filter((c) => !c.pass).length;
      b.textContent = failed ? `✗ ${failed}/${mine.length}` : `✓ ${mine.length}`;
      b.title = failed ? `${failed} of ${mine.length} checks failed` : `all ${mine.length} checks passed`;
    } else if (s.status === "error") {
      b.textContent = "⚠";
      b.title = s.message || "suite setup failed";
    }
  });
  es.addEventListener("check", (ev) => {
    checkRows.push(JSON.parse(ev.data).check);
    renderAutomation();
  });
  es.addEventListener("done", () => {
    es.close();
    const failed = checkRows.filter((c) => !c.pass).length;
    $("#auto-summary").textContent = `${checkRows.length} checks · ${checkRows.length - failed} passed · ${failed} failed`;
  });
  es.addEventListener("fatal", (ev) => {
    es.close();
    $("#auto-summary").textContent = `error: ${JSON.parse(ev.data).message || "run failed"}`;
    if (badge) badge.textContent = "⚠";
  });
  document.querySelector("#automation")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// run a flow's whole validation suite directly (streams into the automation panel)
function runFlowChecks(flowId, title) {
  checkRows = [];
  renderAutomation();
  $("#auto-summary").textContent = `running ${title} checks…`;
  const es = new EventSource(`/api/flow-checks?c=${currentClient}&flow=${encodeURIComponent(flowId)}`);
  es.addEventListener("check", (ev) => { checkRows.push(JSON.parse(ev.data).check); renderAutomation(); });
  es.addEventListener("done", () => es.close());
  es.addEventListener("fatal", () => es.close());
  document.querySelector("#automation")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ── run (SSE) ──
function run() {
  const q = $("#request").value.trim();
  const c = currentClient;
  execData = null;
  designedCases = null;
  checkRows = [];
  $("#run").disabled = true;
  $("#status").textContent = "running…";
  $("#timeline").innerHTML = "";
  $("#automation").innerHTML = `<div class="empty">Building the automation suite…</div>`;
  $("#auto-summary").textContent = "";
  $("#report").innerHTML = `<div class="empty">Agents are working — the report appears when they finish.</div>`;

  const es = new EventSource(`/api/run?c=${c}&q=${encodeURIComponent(q)}`);
  let current = null;

  es.addEventListener("agent", (ev) => {
    const e = JSON.parse(ev.data);
    // Check events stream into the automation panel, not the reasoning timeline.
    if (e.agent === "Check") {
      if (e.data?.check) {
        checkRows.push(e.data.check);
        renderAutomation();
      }
      return;
    }
    if (e.status === "start") current = addAgentCard(e);
    else if (e.status === "reasoning" && current) current.querySelector(".agent-title").textContent = e.title;
    else if (e.status === "done") finishAgentCard(current, e);
    if (e.agent === "Executor" && e.status === "done") execData = e.data;
    if (e.agent === "Test-designer" && e.status === "done" && e.data?.cases) designedCases = e.data.cases;
  });

  es.addEventListener("report", (ev) => {
    const { report, provider } = JSON.parse(ev.data);
    setProvider(provider);
    renderReport(report);
  });
  es.addEventListener("end", (ev) => {
    es.close();
    $("#run").disabled = false;
    $("#status").textContent = "done ✓ · saved to history";
    loadHistory();
  });
  es.addEventListener("fatal", (ev) => {
    const { message } = JSON.parse(ev.data);
    es.close();
    $("#run").disabled = false;
    $("#status").textContent = "error";
    $("#report").innerHTML = `<div class="finding high"><div class="finding-title">Run failed</div><div class="agent-reason">${esc(message)}</div></div>`;
  });
}

function addAgentCard(e) {
  const tl = $("#timeline");
  const card = el("div", "agent running");
  card.innerHTML = `
    <div class="agent-head">
      <span class="agent-icon">${AGENT_ICON[e.agent] ?? "•"}</span>
      <span class="agent-name">${esc(e.agent)}</span>
      <span class="agent-title">${esc(e.title)} <span class="spinner"></span></span>
    </div>`;
  tl.appendChild(card);
  tl.scrollTop = tl.scrollHeight;
  return card;
}
function finishAgentCard(card, e) {
  if (!card) return;
  const looped = e.agent === "Critic" && e.data && e.data.complete === false;
  card.className = "agent " + (looped ? "loop" : "done");
  const badge = looped
    ? `<span class="badge loop">loop back</span>`
    : e.agent === "Critic"
      ? `<span class="badge ok">approved</span>`
      : "";
  card.querySelector(".agent-head").innerHTML = `
    <span class="agent-icon">${AGENT_ICON[e.agent] ?? "•"}</span>
    <span class="agent-name">${esc(e.agent)}${badge}</span>
    <span class="agent-title">${esc(e.title)}</span>`;
  if (e.reasoning) card.appendChild(el("div", "agent-reason", esc(e.reasoning)));
  $("#timeline").scrollTop = $("#timeline").scrollHeight;
}

// ── run history (the platform's own memory) ──
async function loadHistory() {
  const box = $("#history");
  try {
    const { runs } = await (await fetch("/api/runs")).json();
    if (!runs.length) {
      box.innerHTML = `<div class="empty">No runs saved yet.</div>`;
      return;
    }
    box.innerHTML = "";
    for (const r of runs) {
      const item = el("div", "run-item");
      item.dataset.id = r.id;
      const when = new Date(r.ts).toLocaleString();
      const tag = r.findings
        ? `<span class="tag find">${r.findings} finding${r.findings > 1 ? "s" : ""}</span>`
        : `<span class="tag clean">clean</span>`;
      item.innerHTML = `
        <div class="run-req">${esc(r.request)}</div>
        <div class="run-meta">${esc(r.companyName ?? r.id)} · ${esc(when)} ${tag}
          <span>${r.passed}✓ ${r.failed}✗</span></div>`;
      item.addEventListener("click", () => openRun(r.id, item));
      box.appendChild(item);
    }
  } catch {
    box.innerHTML = `<div class="empty">Could not load history.</div>`;
  }
}

async function openRun(id, item) {
  document.querySelectorAll(".run-item.active").forEach((n) => n.classList.remove("active"));
  item?.classList.add("active");
  $("#status").textContent = "viewing saved run";
  try {
    const rec = await (await fetch("/api/runs/" + encodeURIComponent(id))).json();
    execData = { flowResults: rec.flowResults };
    designedCases = null;
    checkRows = rec.checkResults || [];
    renderAutomation();
    replayTrace(rec.events);
    renderReport(rec.report);
  } catch {
    $("#report").innerHTML = `<div class="empty">Could not open that run.</div>`;
  }
}

// Rebuild the agent timeline instantly from a saved event trace.
function replayTrace(events) {
  const tl = $("#timeline");
  tl.innerHTML = "";
  let current = null;
  for (const e of events || []) {
    if (e.agent === "Check") continue; // checks live in the automation panel
    if (e.status === "start") current = addAgentCard(e);
    else if (e.status === "reasoning" && current) current.querySelector(".agent-title").textContent = e.title;
    else if (e.status === "done") finishAgentCard(current, e);
    if (e.agent === "Test-designer" && e.status === "done" && e.data?.cases) designedCases = e.data.cases;
  }
}

// ── automation panel (live check results) ──
function renderAutomation() {
  const box = $("#automation");
  const total = checkRows.length;
  const passed = checkRows.filter((c) => c.pass).length;
  // Inconclusive checks are neither passes nor bugs — count them separately so
  // the failure number always means "something is actually wrong".
  const inconc = checkRows.filter((c) => c.inconclusive).length;
  const failed = total - passed - inconc;
  const serverErr = checkRows.filter((c) => !c.pass && (c.httpStatus || 0) >= 500).length;
  $("#auto-summary").innerHTML = total
    ? `<b>${passed}</b> passed · <b class="fx">${failed}</b> failed${
        serverErr ? ` · <b class="fx">${serverErr}</b> server-error` : ""
      }${inconc ? ` · <b class="inconc">${inconc}</b> inconclusive` : ""} of ${total}`
    : "";

  const rows = checkFilter === "fail" ? checkRows.filter((c) => !c.pass && !c.inconclusive) : checkRows;
  if (!rows.length) {
    box.innerHTML = `<div class="empty">${total ? "No failing checks — nice." : "Each test case runs here as a real request — pass/fail streams live."}</div>`;
    return;
  }
  box.innerHTML = "";
  const typeClass = { functional: "fn", "data-validation": "dv", edge: "ed", "non-functional": "nf" };
  for (const c of rows) {
    const is5xx = (c.httpStatus || 0) >= 500;
    const running = c._rerunning;
    const row = el("div", "chk " + (running ? "run" : c.inconclusive ? "inc" : c.pass ? "ok" : "bad"));
    row.innerHTML = `
      <span class="chk-mark">${running ? "⟳" : c.inconclusive ? "≈" : c.pass ? "✓" : "✗"}</span>
      <span class="chk-id">${esc(c.id)}</span>
      <span class="chk-type ${typeClass[c.type] ?? ""}">${esc(c.category)}</span>
      <span class="chk-scn">${c.module === "AI-generated" ? '<span class="ai-tag" title="written by the AI for your request">AI</span>' : ""}${esc(c.scenario)}</span>
      <span class="chk-http ${is5xx ? "err5" : ""}">${running ? "…" : (c.httpStatus ?? "err")}</span>`;
    const detail = el("div", "chk-detail");
    detail.innerHTML = `<b>${esc(c.module)}${c.field ? " · " + esc(c.field) : ""}</b> — expected to <b>${esc(c.expected)}</b><br>input: <span class="mono">${esc(c.inputSummary)}</span><br>${esc(c.verdict)}<br>`;
    const rerun = el("button", "chk-rerun", "↻ Re-run this check live");
    rerun.addEventListener("click", (ev) => { ev.stopPropagation(); rerunCheck(c.flowId, c.id); });
    detail.appendChild(rerun);
    row.appendChild(detail);
    row.addEventListener("click", () => row.classList.toggle("open"));
    box.appendChild(row);
  }
}

// Re-run a single check on demand (Part B).
async function rerunCheck(flowId, id) {
  const idx = checkRows.findIndex((x) => x.id === id && x.flowId === flowId);
  if (idx < 0) return;
  checkRows[idx] = { ...checkRows[idx], _rerunning: true };
  renderAutomation();
  try {
    const r = await (await fetch(`/api/rerun-check?c=${currentClient}&flow=${encodeURIComponent(flowId)}&id=${encodeURIComponent(id)}`)).json();
    checkRows[idx] = r.check ? r.check : { ...checkRows[idx], _rerunning: false };
  } catch {
    checkRows[idx] = { ...checkRows[idx], _rerunning: false };
  }
  renderAutomation();
}

// ── headed UI automation (watch Chromium) ──
function runUi() {
  const c = currentClient;
  const box = $("#ui-run");
  box.innerHTML =
    `<div class="ui-note">🖥 A <b>Chromium window is opening on your screen</b> — watch it log in and test the real Procol console. Steps mirror here.</div>` +
    `<img id="ui-shot" class="ui-shot" alt="live screenshot" />` +
    `<div id="ui-log" class="ui-log"></div>`;
  $("#ui-btn").disabled = true;
  $("#ui-btn").textContent = "🖥 Chromium running…";

  const es = new EventSource(`/api/ui-run?c=${c}`);
  const logLine = (cls, html) => $("#ui-log").insertAdjacentHTML("afterbegin", `<div class="ui-line ${cls}">${html}</div>`);
  es.addEventListener("ui", (ev) => {
    const e = JSON.parse(ev.data);
    if (e.status === "shot" && e.data?.screenshot) {
      const img = $("#ui-shot");
      img.src = e.data.screenshot;
      img.classList.add("show");
      logLine("shot", `📸 ${esc(e.title)}`);
    } else if (e.status === "check" && e.data?.check) {
      const c2 = e.data.check;
      logLine(c2.pass ? "ok" : "bad", `${c2.pass ? "✓" : "✗"} <b>${esc(c2.id)}</b> ${esc(c2.scenario)} — <span class="mono">${esc(c2.observed)}</span>`);
    } else if (e.status === "error") {
      logLine("bad", `⚠ ${esc(e.title)}`);
    } else {
      logLine("step", `• ${esc(e.title)}`);
    }
  });
  const finish = () => {
    es.close();
    $("#ui-btn").disabled = false;
    $("#ui-btn").textContent = "🖥 Watch UI test (Chromium)";
  };
  es.addEventListener("ui-done", finish);
  es.addEventListener("fatal", (ev) => {
    logLine("bad", `error: ${esc(JSON.parse(ev.data).message)}`);
    finish();
  });
}

// ── report ──
function renderReport(report) {
  const box = $("#report");
  box.innerHTML = "";
  if (!report) return;

  box.appendChild(el("div", "headline", esc(report.headline)));
  box.appendChild(el("div", "report-summary",
    `<b>${report.passed}</b> checks passed · <b>${report.failed}</b> failed — real requests, DB-verified`));

  // test cases the AI designed for THIS request (original + detailed per prompt)
  if (designedCases?.length) {
    box.appendChild(el("div", "section-label", `Test cases designed (${designedCases.length}) — click to expand`));
    const list = el("div", "case-list");
    const typeClass = { functional: "fn", "data-validation": "dv", edge: "ed", "non-functional": "nf" };
    for (const c of designedCases) {
      const card = el("div", "case-card");
      const steps = (c.steps || []).map((s) => `<li>${esc(String(s).replace(/^\s*\d+[\.\)]\s*/, ""))}</li>`).join("");
      card.innerHTML = `
        <div class="case-head">
          <span class="case-id">${esc(c.id || "")}</span>
          <span class="case-type ${typeClass[c.type] ?? ""}">${esc(c.category || c.type)}</span>
          <span class="case-scn">${esc(c.scenario)}</span>
          <span class="case-badges">
            <span class="pri ${esc(c.priority || "")}">${esc(c.priority || "")}</span>
            <span class="sevc ${esc((c.severity || "").toLowerCase())}">${esc(c.severity || "")}</span>
          </span>
          <span class="case-caret">▾</span>
        </div>
        <div class="case-body">
          <div class="case-meta">${esc(c.module || "")}${c.component ? " › " + esc(c.component) : ""} · role: ${esc(c.role || "")}</div>
          <div class="cgrid">
            <div class="ck">Preconditions</div><div class="cv">${esc(c.preconditions || "—")}</div>
            <div class="ck">Steps</div><ol class="cv csteps">${steps || "<li>—</li>"}</ol>
            <div class="ck">Test data</div><div class="cv">${esc(c.testData || "—")}</div>
            <div class="ck">Expected</div><div class="cv">${esc(c.expectedResult || "—")}</div>
          </div>
        </div>`;
      card.querySelector(".case-head").addEventListener("click", () => card.classList.toggle("open"));
      list.appendChild(card);
    }
    box.appendChild(list);
  }

  // end-to-end flow result
  if (execData?.flowResults?.length) {
    box.appendChild(el("div", "section-label", "End-to-end flow (live on UAT)"));
    const t = el("table", "result-table");
    t.innerHTML = `<tr><th>Flow</th><th>Status</th><th>Time</th><th>DB</th></tr>`;
    for (const r of execData.flowResults) {
      t.appendChild(el("tr", null,
        `<td>${esc(r.name)}</td>
         <td><span class="pill ${r.status === "passed" ? "pass" : "fail"}">${esc(r.status)}</span></td>
         <td class="mono">${r.durationMs}ms</td>
         <td>${r.verifiesDatabase ? "✓" : "—"}</td>`));
    }
    box.appendChild(t);
  }

  // findings (bugs from failed checks)
  if (report.findings?.length) {
    box.appendChild(el("div", "section-label", `Bugs found (${report.findings.length})`));
    for (const f of report.findings) {
      const card = el("div", "finding " + (f.severity === "high" ? "high" : ""));
      card.innerHTML = `
        <div class="finding-title"><span class="sev ${f.severity === "high" ? "high" : ""}">${esc(f.severity)}</span>${esc(f.title)}</div>
        <dl>
          <dt>What</dt><dd>${esc(f.whatHappened)}</dd>
          <dt>Where</dt><dd class="mono">${esc(f.where)}</dd>
          <dt>Cause</dt><dd>${esc(f.likelyCause)}</dd>
          <dt>Evidence</dt><dd>${f.evidence.map((x) => esc(x)).join("<br>")}</dd>
        </dl>`;
      box.appendChild(card);
    }
  }

  box.appendChild(el("div", "reco", `<b>Recommendation:</b> ${esc(report.recommendation)}`));
}

// ── Defects found ─────────────────────────────────────────────────────────
// Grouped by DEFECT rather than by journey: seven event flows failing on the
// same 500 is one release blocker with a blast radius of seven, and listing it
// seven times is how a triage queue stops being read.
const VERDICT_META = {
  product_defect: { icon: "🐞", label: "Product defect", cls: "v-bug" },
  contradiction: { icon: "🕳", label: "Silent failure", cls: "v-bug" },
  product_rejected_input: { icon: "🚧", label: "Test gap", cls: "v-gap" },
  automation_defect: { icon: "🔧", label: "Harness", cls: "v-harness" },
  environment: { icon: "☁️", label: "Environment", cls: "v-env" },
};

async function loadFindings() {
  const box = $("#findings");
  if (!box) return;
  try {
    const { groups, totals } = await (await fetch("/api/findings")).json();
    const hint = $("#findings-hint");
    if (hint)
      hint.textContent = `${totals.defects} product · ${totals.gaps} gap · ${totals.harness} harness · ${totals.environment} env`;
    box.innerHTML = "";
    if (!groups.length) {
      box.appendChild(el("div", "empty", "No defects recorded yet."));
      return;
    }
    for (const g of groups) {
      const meta = VERDICT_META[g.kind] ?? VERDICT_META.automation_defect;
      const card = el("div", `finding ${meta.cls}`);
      card.appendChild(
        el(
          "div",
          "finding-head",
          `<span class="finding-icon">${meta.icon}</span>` +
            `<span class="finding-title">${esc(g.title)}</span>` +
            `<span class="finding-sev sev-${esc(g.severity)}">${esc(g.severity)}</span>`,
        ),
      );
      card.appendChild(
        el(
          "div",
          "finding-meta",
          `${meta.label} · affects <b>${g.flows.length}</b> journey${g.flows.length === 1 ? "" : "s"}` +
            ` · seen ${g.occurrences}×`,
        ),
      );
      card.appendChild(el("div", "finding-why", esc(g.rationale)));
      if (g.evidence?.length)
        card.appendChild(
          el("div", "finding-ev", g.evidence.map((e) => `<code>${esc(e)}</code>`).join("<br />")),
        );
      if (g.flows.length)
        card.appendChild(el("div", "finding-flows", g.flows.map((f) => `<span class="pill">${esc(f)}</span>`).join(" ")));
      if (g.reproduction?.length)
        card.appendChild(
          el(
            "details",
            "finding-repro",
            `<summary>reproduction (${g.reproduction.length} steps)</summary>` +
              g.reproduction.map((r) => `<div>${esc(r)}</div>`).join(""),
          ),
        );
      box.appendChild(card);
    }
  } catch (e) {
    box.innerHTML = "";
    box.appendChild(el("div", "empty", `Could not load findings: ${esc(e.message)}`));
  }
}

// ── QA memory ─────────────────────────────────────────────────────────────
async function loadKnowledge(query) {
  const box = $("#knowledge");
  if (!box) return;
  const url = query ? `/api/knowledge?q=${encodeURIComponent(query)}` : "/api/knowledge";
  try {
    const data = await (await fetch(url)).json();
    box.innerHTML = "";
    if (!data.built) {
      box.appendChild(el("div", "empty", esc(data.note ?? "Memory not built yet.")));
      return;
    }
    if (!query) {
      const k = data.byKind ?? {};
      const cases = (k["test-case"] ?? 0) + (k["api-contract"] ?? 0);
      box.appendChild(
        el(
          "div",
          "kb-stats",
          `<b>${data.total}</b> indexed · <b>${cases}</b> expectation cases · ` +
            `<b>${k.experience ?? 0}</b> from experience · <b>${k.doc ?? 0}</b> docs`,
        ),
      );
      const mods = Object.entries(data.byModule ?? {}).sort((a, b) => b[1] - a[1]);
      if (mods.length)
        box.appendChild(
          el("div", "kb-mods", mods.map(([m, n]) => `<span class="pill">${esc(m)} ${n}</span>`).join(" ")),
        );
      $("#kb-hint").textContent = data.stale
        ? `memory built with ${data.embedder} but a different embedder is active — run npm run rag:build`
        : `what should happen · what has happened · ${data.total ?? ""} chunks`;
      return;
    }
    // Two tiers, shown separately on purpose — mixing "the rules" with "what
    // broke last time" is how an agent ends up testing an old bug report.
    const section = (title, rows, cls) => {
      box.appendChild(el("div", "kb-head", esc(title)));
      if (!rows.length) {
        box.appendChild(el("div", "empty", "nothing relevant"));
        return;
      }
      for (const r of rows) {
        box.appendChild(
          el(
            "div",
            `kb-row ${cls}`,
            `<span class="kb-score">${r.score.toFixed(2)}</span>` +
              `<span class="kb-src">${esc(r.source)}</span>` +
              `<div class="kb-text">${esc(r.text.slice(0, 320))}</div>`,
          ),
        );
      }
    };
    section("Expected behaviour", data.expectations ?? [], "kb-exp");
    section("Prior experience", data.experience ?? [], "kb-past");
  } catch (e) {
    box.innerHTML = "";
    box.appendChild(el("div", "empty", `Could not load memory: ${esc(e.message)}`));
  }
}

// ── AI: instruction → real browser run ────────────────────────────────────
// The whole point of the platform in one button: you say what you want tested,
// it decides which journey and which parameters, recalls what it already knows
// about that area, drives the real console, and returns a verdict rather than
// an exit code.
function runAiInstruction() {
  const q = $("#request").value.trim();
  if (!q) return;
  const btn = $("#ai-btn");
  btn.disabled = true;
  $("#status").textContent = "thinking…";

  const con = $("#ui-console");
  con.hidden = false;
  con.innerHTML = "";
  const write = (text, cls) => {
    con.appendChild(el("div", cls || "", esc(text)));
    con.scrollTop = con.scrollHeight;
  };

  const qs = new URLSearchParams({ c: String(currentClient), q });
  if (!$("#ui-headed").checked) qs.set("headed", "0");
  const es = new EventSource(`/api/ai-run?${qs}`);
  uiRunning = es;

  es.addEventListener("stage", (ev) => write("› " + JSON.parse(ev.data).line, "cmd"));
  es.addEventListener("intent", (ev) => {
    const i = JSON.parse(ev.data);
    write(`🤖 chose ${i.flowKey} — ${i.flowLabel} (${i.source} routing)`, "ok");
    write(`   ${i.reasoning}`, "note");
    const params = [
      i.lineItems ? `${i.lineItems} line items` : null,
      i.template ? `template "${i.template}"` : null,
      i.scheduleMinutes ? `${i.scheduleMinutes} min` : null,
    ].filter(Boolean);
    if (params.length) write(`   parameters: ${params.join(" · ")}`, "note");
    // An honest run says what it did NOT test.
    if (i.caveat) write(`⚠ ${i.caveat}`, "bad");
    $("#status").textContent = i.flowLabel;
  });
  es.addEventListener("recall", (ev) => {
    const { expectations = [], experience = [] } = JSON.parse(ev.data);
    if (expectations.length) {
      write("📚 what should happen here:", "cmd");
      for (const r of expectations.slice(0, 3)) write(`   • ${r.text.slice(0, 180)}`, "note");
    }
    if (experience.length) {
      write("🧠 what has broken here before:", "cmd");
      for (const r of experience.slice(0, 3)) write(`   • ${r.text.slice(0, 180)}`, "note");
    }
  });
  es.addEventListener("start", (ev) => write(JSON.parse(ev.data).line, "cmd"));
  es.addEventListener("queued", (ev) => write("⏳ " + JSON.parse(ev.data).line, "warn"));
  es.addEventListener("note", (ev) => write("⚠ " + JSON.parse(ev.data).line, "note"));
  es.addEventListener("log", (ev) => write(JSON.parse(ev.data).line));
  es.addEventListener("verdicts", (ev) => {
    const { verdicts } = JSON.parse(ev.data);
    if (!verdicts.length) write("⚖ no defects — the journey completed and every assertion held", "ok");
    for (const v of verdicts) {
      const meta = VERDICT_META[v.kind] ?? VERDICT_META.automation_defect;
      write(`${meta.icon} ${meta.label.toUpperCase()} · ${v.severity} — ${v.title}`, v.actionable ? "bad" : "note");
      write(`   ${v.rationale}`, "note");
      for (const e of v.evidence ?? []) write(`   • ${e}`, "note");
    }
    loadFindings();
  });
  const finish = (msg, cls) => {
    write(msg, cls);
    btn.disabled = false;
    $("#status").textContent = "";
    es.close();
    uiRunning = null;
    loadFindings();
  };
  es.addEventListener("done", (ev) => {
    const code = JSON.parse(ev.data).exitCode;
    finish(code === 0 ? "✓ journey passed" : `✗ journey failed (exit ${code})`, code === 0 ? "ok" : "bad");
  });
  es.addEventListener("error", (ev) => {
    let msg = "run error";
    try {
      msg = JSON.parse(ev.data).line || msg;
    } catch {}
    finish("✗ " + msg, "bad");
  });
}

// ── Compile a written test case, then run exactly those steps ─────────────
// The difference from the instruction button: that one picks a pre-built
// journey, this one builds a journey out of your words. The plan is shown
// before it runs, because a plan you cannot inspect is a plan you cannot trust.
function runTestCase(dryRun) {
  const q = $("#request").value.trim();
  if (!q) return;
  const btn = dryRun ? $("#plan-dry") : $("#plan-btn");
  btn.disabled = true;
  $("#status").textContent = dryRun ? "compiling…" : "compiling & running…";

  const con = $("#ui-console");
  con.hidden = false;
  con.innerHTML = "";
  const write = (text, cls) => {
    con.appendChild(el("div", cls || "", esc(text)));
    con.scrollTop = con.scrollHeight;
  };

  const qs = new URLSearchParams({ c: String(currentClient), q });
  if (dryRun) qs.set("dry", "1");
  if (!$("#ui-headed").checked) qs.set("headed", "0");
  const es = new EventSource(`/api/plan-run?${qs}`);
  uiRunning = es;

  es.addEventListener("stage", (ev) => write("› " + JSON.parse(ev.data).line, "cmd"));
  es.addEventListener("plan", (ev) => {
    const p = JSON.parse(ev.data);
    write(`🧪 ${p.title}  (${p.source} · ${p.steps.length} steps)`, "ok");
    if (p.reasoning) write(`   ${p.reasoning}`, "note");
    write(`   grounded in ${p.context.expectations} rule(s) and ${p.context.experience} past finding(s)`, "note");
    p.steps.forEach((s, i) =>
      write(`   ${String(i + 1).padStart(2)}. ${s.step}${s.args && Object.keys(s.args).length ? " " + JSON.stringify(s.args) : ""}`),
    );
    // Repairs are shown, never hidden: a plan the linter had to fix says the
    // compiler needs improving, and that is worth seeing.
    for (const w of p.warnings ?? []) write(`   ⚠ ${w}`, "note");
  });
  es.addEventListener("log", (ev) => {
    const l = JSON.parse(ev.data).line;
    if (/^\[plan\]|create-event|erfx/.test(l)) write(l);
  });
  es.addEventListener("plan-result", (ev) => {
    const r = JSON.parse(ev.data);
    write(`— ${r.steps.filter((s) => s.status === "ok").length}/${r.steps.length} steps passed —`, r.passed ? "ok" : "bad");
    for (const s of r.steps) {
      const mark = s.status === "ok" ? "✓" : s.status === "failed" ? "✗" : "–";
      write(`   ${mark} ${s.step}${s.detail ? " — " + s.detail : ""}`, s.status === "failed" ? "bad" : "");
    }
  });
  es.addEventListener("verdicts", (ev) => {
    const { verdicts } = JSON.parse(ev.data);
    if (!verdicts.length) write("⚖ no defects — every step held", "ok");
    for (const v of verdicts) {
      const meta = VERDICT_META[v.kind] ?? VERDICT_META.automation_defect;
      write(`${meta.icon} ${meta.label.toUpperCase()} · ${v.severity} — ${v.title}`, v.actionable ? "bad" : "note");
      write(`   ${v.rationale}`, "note");
    }
    loadFindings();
  });
  const finish = (msg, cls) => {
    if (msg) write(msg, cls);
    btn.disabled = false;
    $("#status").textContent = "";
    es.close();
    uiRunning = null;
    loadFindings();
  };
  es.addEventListener("done", (ev) => {
    const code = JSON.parse(ev.data).exitCode;
    finish(dryRun ? "✓ compiled (not run)" : code === 0 ? "✓ test case passed" : `✗ test case failed (exit ${code})`, code === 0 ? "ok" : "bad");
  });
  es.addEventListener("error", (ev) => {
    let msg = "run error";
    try { msg = JSON.parse(ev.data).line || msg; } catch {}
    finish("✗ " + msg, "bad");
  });
}

// ── Stuck points, and teaching the automation out of them ─────────────────
// The end state we are aiming at: a locator that failed once is taught once
// and never asked about again. Each card shows where it stopped and what the
// screen was offering; the button reopens that screen, has the AI find the
// control, and writes the answer into the learned-locator store.
async function loadStuck() {
  const box = $("#stuck");
  if (!box) return;
  try {
    const { stuck, learned } = await (await fetch("/api/stuck")).json();
    const learnedCount = Object.keys(learned ?? {}).length;
    const recipes = Object.values(learned ?? {}).reduce((n, list) => n + (list?.length ?? 0), 0);
    const hint = $("#stuck-hint");
    if (hint) {
      hint.textContent = stuck.length
        ? `${stuck.length} stuck · ${learnedCount} step(s) taught (${recipes} recipe(s))`
        : `nothing stuck · ${learnedCount} step(s) taught (${recipes} recipe(s))`;
    }
    box.innerHTML = "";
    if (!stuck.length) {
      box.appendChild(
        el("div", "empty", learnedCount
          ? `Nothing stuck. ${learnedCount} step(s) already taught — those locators are deterministic now.`
          : "Nothing stuck. When a locator fails, it appears here with the screen it failed on."),
      );
      return;
    }
    for (const s of stuck) {
      const taught = (learned?.[s.label] ?? []).length;
      const card = el("div", "finding v-harness");
      card.appendChild(
        el("div", "finding-head",
          `<span class="finding-icon">🧭</span><span class="finding-title">${esc(s.label)}</span>` +
          `<span class="finding-sev">${taught ? `taught ${taught}×` : "not taught"}</span>`),
      );
      card.appendChild(el("div", "finding-meta", `${esc(s.flowKey ?? "run")} · ${esc(String(s.url).replace(/^https?:\/\/[^/]+/, ""))}`));
      card.appendChild(el("div", "finding-why", esc(String(s.message).split("\n")[0].slice(0, 220))));
      if (s.triedCandidates?.length) {
        card.appendChild(el("details", "finding-repro",
          `<summary>tried ${s.triedCandidates.length} locator(s)</summary>` +
          s.triedCandidates.map((c) => `<div>${esc(c)}</div>`).join("")));
      }
      if (s.accessibilityTree) {
        card.appendChild(el("details", "finding-repro",
          `<summary>what the screen was offering</summary><div style="white-space:pre-wrap">${esc(String(s.accessibilityTree).slice(0, 1800))}</div>`));
      }
      const bar = el("div", "uibar");
      const btn = el("button", "run-btn small", "🔧 Teach this locator");
      btn.addEventListener("click", () => teachStuck(s.id, btn));
      bar.appendChild(btn);
      card.appendChild(bar);
      box.appendChild(card);
    }
  } catch (e) {
    box.innerHTML = "";
    box.appendChild(el("div", "empty", `Could not load stuck points: ${esc(e.message)}`));
  }
}

function teachStuck(id, btn) {
  btn.disabled = true;
  btn.textContent = "teaching…";
  const con = $("#ui-console");
  con.hidden = false;
  con.innerHTML = "";
  const write = (text, cls) => {
    con.appendChild(el("div", cls || "", esc(text)));
    con.scrollTop = con.scrollHeight;
  };
  const qs = new URLSearchParams({ id });
  if (!$("#ui-headed").checked) qs.set("headed", "0");
  const es = new EventSource(`/api/stuck/fix?${qs}`);
  uiRunning = es;
  es.addEventListener("start", (ev) => write(JSON.parse(ev.data).line, "cmd"));
  es.addEventListener("queued", (ev) => write("⏳ " + JSON.parse(ev.data).line, "warn"));
  es.addEventListener("log", (ev) => {
    const l = JSON.parse(ev.data).line;
    if (/\[teach\]|\[healer\]|\[learned\]/.test(l)) write(l, /LEARNED/.test(l) ? "ok" : /FAILED/.test(l) ? "bad" : "");
  });
  es.addEventListener("learned", () => loadStuck());
  const finish = (msg, cls) => {
    write(msg, cls);
    btn.disabled = false;
    btn.textContent = "🔧 Teach this locator";
    es.close();
    uiRunning = null;
    loadStuck();
  };
  es.addEventListener("done", (ev) => {
    const code = JSON.parse(ev.data).exitCode;
    finish(code === 0 ? "✓ taught — future runs will use it directly" : "✗ could not teach it from that screen", code === 0 ? "ok" : "bad");
  });
  es.addEventListener("error", () => finish("✗ teaching failed", "bad"));
}

// ── the written test catalog ───────────────────────────────────────────────
//
// 648 cases live as prose in `test-cases/*.md`. They are the thing a person
// reads and edits; this panel is only a way to pick some and press run. Each
// case shows the route it will actually take, because "Run" meaning four
// different things — a healed journey, a compiled plan, an exact API case, a
// whole API area — is the sort of ambiguity that makes a green tick worthless.
function initCatalog() {
  $("#cat-run")?.addEventListener("click", runPickedCases);
  $("#cat-stop")?.addEventListener("click", () => {
    catRunning?.close();
    catRunning = null;
    $("#cat-run").disabled = false;
    $("#cat-run").textContent = "▶ Run selected cases";
  });
  $("#cat-none")?.addEventListener("click", () => {
    catPicked.clear();
    renderCatalog();
  });
  for (const b of document.querySelectorAll(".cat-tabs .chip")) {
    b.addEventListener("click", () => {
      for (const o of document.querySelectorAll(".cat-tabs .chip")) o.classList.remove("active");
      b.classList.add("active");
      catState.layer = b.dataset.layer;
      catState.section = "";
      loadCatalog();
    });
  }
  for (const [sel, key] of [["#cat-section", "section"], ["#cat-priority", "priority"], ["#cat-verdict", "verdict"]]) {
    $(sel)?.addEventListener("change", (e) => {
      catState[key] = e.target.value;
      loadCatalog();
    });
  }
  let t;
  $("#cat-q")?.addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      catState.q = e.target.value.trim();
      loadCatalog();
    }, 250);
  });
  loadCatalog();
}

async function loadCatalog() {
  const qs = new URLSearchParams();
  if (catState.layer) qs.set("layer", catState.layer);
  if (catState.section) qs.set("group", catState.section);
  if (catState.priority) qs.set("priority", catState.priority);
  if (catState.verdict) qs.set("verdict", catState.verdict);
  if (catState.q) qs.set("q", catState.q);
  try {
    const data = await (await fetch(`/api/test-cases?${qs}`)).json();
    catCases = data.cases || [];
    const sel = $("#cat-section");
    // Rebuild the section list only when the layer changes it, so a chosen
    // section is not reset by every keystroke in the search box.
    const want = (data.sections || []).map((x) => x.group).join(",");
    if (sel && sel.dataset.built !== want) {
      sel.dataset.built = want;
      sel.innerHTML = '<option value="">every section</option>';
      for (const s of data.sections || []) {
        const o = el("option");
        o.value = s.group;
        o.textContent = `${s.layer.toUpperCase()} ${s.sectionNo}. ${s.section} (${s.total})`;
        sel.appendChild(o);
      }
      sel.value = catState.section;
    }
    const c = data.coverage || {};
    $("#cat-hint").textContent =
      `${data.stats.total} written cases · ${c.runnable}/${c.total} reach a real runner · showing ${catCases.length}`;
    renderCatalog();
  } catch (err) {
    $("#cat-list").innerHTML = `<div class="empty">could not load the catalog: ${esc(err.message)}</div>`;
  }
}

const ROUTE_TAG = {
  "ui-journey": ["journey", "built journey"],
  "api-case": ["exact", "exact API case"],
  "api-section": ["area", "API area only"],
  "api-suite": ["area", "validation suite"],
  "ui-compile": ["", "compiled plan"],
  manual: ["manual", "for a person"],
  none: ["none", "no runner yet"],
};

function renderCatalog() {
  const box = $("#cat-list");
  box.innerHTML = "";
  if (!catCases.length) {
    box.innerHTML = '<div class="empty">Nothing matches those filters.</div>';
    updateCatCount();
    return;
  }
  let lastSection = null;
  for (const c of catCases) {
    if (c.group !== lastSection) {
      lastSection = c.group;
      box.appendChild(el("div", "cat-sec", `${esc(c.layer.toUpperCase())} ${c.sectionNo}. ${esc(c.section)}`));
    }
    const row = el("div", "cat-case");
    row.id = `cat-${c.id}`;
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = catPicked.has(c.id);
    cb.disabled = !c.route.runnable;
    cb.title = c.route.runnable ? c.route.because : `cannot run: ${c.route.because}`;
    cb.addEventListener("change", () => {
      cb.checked ? catPicked.add(c.id) : catPicked.delete(c.id);
      updateCatCount();
    });
    const body = el("div", "cat-body");
    const [tagCls, tagText] = ROUTE_TAG[c.route.kind] || ["", c.route.kind];
    body.appendChild(
      el("div", "", `<span class="cat-id">${esc(c.id)}</span><span class="cat-title">${esc(c.title)}</span>`),
    );
    const meta = el("div", "cat-meta");
    meta.appendChild(el("span", `cat-tag ${c.priority === "P0" ? "p0" : ""}`, esc(c.priority)));
    meta.appendChild(el("span", "cat-tag", esc(c.verdict)));
    const rt = el("span", `cat-tag ${tagCls}`, esc(tagText));
    rt.title = c.route.because;
    meta.appendChild(rt);
    if (c.gate) meta.appendChild(el("span", "cat-tag", `gate: ${esc(c.gate)}`));
    if (c.recordsCurrentBehaviour) {
      const t = el("span", "cat-tag area", "records today's behaviour");
      t.title = "This case documents what the product does now, not what it should do.";
      meta.appendChild(t);
    }
    body.appendChild(meta);
    body.appendChild(
      el(
        "div",
        "cat-why",
        `<b>Why.</b> ${esc(c.why)}<br><b>Steps.</b> ${esc(c.steps)}<br><b>Expected.</b> ${esc(c.expected)}` +
          (c.oracle ? `<br><b>Oracle.</b> ${esc(c.oracle)}` : ""),
      ),
    );
    body.querySelector(".cat-title").addEventListener("click", () => row.classList.toggle("open"));
    row.appendChild(cb);
    row.appendChild(body);
    row.appendChild(el("span", "cat-res", ""));
    box.appendChild(row);
  }
  updateCatCount();
}

function updateCatCount() {
  $("#cat-count").textContent = catPicked.size ? `${catPicked.size} selected` : "nothing selected";
}

function runPickedCases() {
  if (!catPicked.size) {
    $("#cat-count").textContent = "tick at least one case first";
    return;
  }
  const out = $("#cat-run-out");
  out.hidden = false;
  out.innerHTML = "";
  const write = (text, cls) => {
    const n = el("div", `l ${cls || ""}`, esc(text));
    out.appendChild(n);
    out.scrollTop = out.scrollHeight;
    return n;
  };
  const badge = (id, text, cls) => {
    const b = document.querySelector(`#cat-${id} .cat-res`);
    if (b) {
      b.textContent = text;
      b.className = `cat-res ${cls || ""}`;
    }
  };
  const showRaw = () => $("#cat-raw")?.checked;

  const btn = $("#cat-run");
  btn.disabled = true;
  btn.textContent = "running…";
  const qs = new URLSearchParams({ ids: [...catPicked].join(","), c: currentClient ?? "" });
  if (!$("#cat-headed").checked) qs.set("headed", "0");
  const es = new EventSource(`/api/case-run?${qs}`);
  catRunning = es;

  // One line per step, updated in place as it goes from "…" to ✓/✗.
  let stepLines = new Map();

  es.addEventListener("plan", (ev) => {
    const { cases } = JSON.parse(ev.data);
    write(`${cases.length} case${cases.length === 1 ? "" : "s"} to test — one at a time, in one browser window.`, "hd");
  });
  es.addEventListener("case", (ev) => {
    const d = JSON.parse(ev.data);
    if (d.status === "running") {
      stepLines = new Map();
      write(`Testing ${d.index} of ${d.total}: ${d.id} — ${d.title}`, "case");
      write(ROUTE_SENTENCE[d.route.kind]?.(d.route) ?? d.route.because, "route");
      badge(d.id, "···", "run");
      return;
    }
    if (d.status === "not-run") {
      write(`Not run — ${d.reason}.`, "verdict part");
      badge(d.id, "GAP", "part");
      loadGaps();
      return;
    }
    if (d.status === "partial") {
      write(`Ran, but this is not the case passing — ${d.summary}.`, "verdict part");
      badge(d.id, "PARTIAL", "part");
      loadGaps();
      return;
    }
    const ok = d.status === "passed";
    const cls = ok ? "ok" : d.status === "failed" ? "bad" : "";
    write(
      ok
        ? `Passed — ${d.summary}.`
        : d.status === "failed"
          ? `Failed — ${d.summary}.`
          : `Skipped${d.summary ? ` — ${d.summary}` : ""}${d.reason ? ` — ${d.reason}` : ""}.`,
      `verdict ${cls}`,
    );
    badge(d.id, ok ? "PASS" : d.status === "failed" ? "FAIL" : "—", cls);
  });
  es.addEventListener("queued", (ev) => write(`⏳ ${JSON.parse(ev.data).line}`, "queued"));
  es.addEventListener("compiled", (ev) => {
    const d = JSON.parse(ev.data);
    write(
      `Read the test case and decided on ${d.steps.length} steps: ${d.steps.map((s) => stepWords(s.step)).join(" → ")}.`,
      "sub",
    );
    for (const w of d.warnings || []) if (!/^resolved |^cannot test|^can only test/.test(w)) write(`Adjusted: ${w}`, "sub");
    if (d.coverage === "none") {
      write(`Cannot test this case yet — no step can observe: ${(d.gaps || []).join("; ") || "what it checks"}. Refusing rather than running something else and calling it a pass.`, "gap");
    } else if (d.coverage === "partial") {
      write(`Only part of this case can be tested — no step yet for: ${(d.gaps || []).join("; ")}.`, "gap");
    }
    // Pre-list every step so the person sees the whole plan, then watch it fill in.
    d.steps.forEach((s, i) => {
      stepLines.set(i + 1, write(`Step ${i + 1} of ${d.steps.length} — ${stepWords(s.step, s.args)}`, "step"));
    });
  });
  es.addEventListener("note", (ev) => {
    const line = JSON.parse(ev.data).line;
    const step = line.match(/^\[plan\] (\d+)\/(\d+) (\S+) (✓|✗) ?(.*)$/);
    if (step) {
      const [, i, n, name, mark, detail] = step;
      const cls = mark === "✓" ? "ok" : "bad";
      const text = `Step ${i} of ${n} — ${stepWords(name)}${detail ? `: ${detail}` : ""}`;
      const existing = stepLines.get(Number(i));
      if (existing) {
        existing.textContent = text;
        existing.className = `l step ${cls}`;
      } else write(text, `step ${cls}`);
      return;
    }
    if (/^\[plan\] .* — \d+ step/.test(line)) return; // the header, already narrated
    const sub = line.match(/^\[(create-event|bid|surrogate|award|oracle|healer|learned|teach)\] (.*)$/);
    if (sub) {
      write(sub[2], "sub");
      return;
    }
    if (/^(logging in|building the shared|running \d+ API case)/.test(line)) {
      write(line[0].toUpperCase() + line.slice(1), "sub");
      return;
    }
    // Everything else is Playwright talking to itself.
    if (showRaw()) write(line, "raw");
  });
  es.addEventListener("api-case", (ev) => {
    const r = JSON.parse(ev.data).result;
    if (r.status === "skipped") {
      write(`${r.id} skipped — ${r.reason}`, "step");
      return;
    }
    const cls = r.status === "passed" ? "ok" : "bad";
    const got = `${r.method} ${r.path} → HTTP ${r.httpStatus}`;
    const want = r.expectedStatus ? `the contract says ${r.expectedStatus}` : "";
    write(`${r.id} — ${r.title}. ${got}${want ? `; ${want}` : ""}.`, `step ${cls}`);
    if (r.message) write(r.message, "sub");
  });
  es.addEventListener("check", (ev) => {
    const k = JSON.parse(ev.data).check;
    write(`${k.scenario} → HTTP ${k.httpStatus ?? "?"}`, `step ${k.pass ? "ok" : "bad"}`);
  });
  const finish = (msg, cls) => {
    write(msg, cls);
    btn.disabled = false;
    btn.textContent = "▶ Run selected cases";
    es.close();
    catRunning = null;
    loadFindings();
    pollRunState();
  };
  es.addEventListener("done", () => finish("All done.", "hd"));
  es.addEventListener("error", (ev) => {
    let line = "";
    try {
      line = JSON.parse(ev.data).line;
    } catch {
      /* stream ended */
    }
    if (line) finish(`✗ ${line}`, "bad");
    else if (catRunning) finish("— connection closed", "");
  });
}

// How each route reads to a person, before the run starts.
const ROUTE_SENTENCE = {
  "ui-journey": (r) => `A built, self-healing journey covers this exactly ("${r.target}") — running it in the browser.`,
  "api-case": (r) => `The API framework implements this as ${r.target} — sending the real request.`,
  "api-section": (r) =>
    `No exact runner for this case. Running the API framework's ${r.target.split(",").length} cases for the same area instead — real traffic against the right endpoints, but not this case word for word.`,
  "api-suite": (r) => `Running the "${r.target}" validation suite, which covers this section.`,
  "ui-compile": () => `No built journey covers this — reading the written case and compiling it into steps the browser can perform.`,
  manual: () => `The catalog says a person should do this one.`,
  none: () => `Nothing can run this yet.`,
};

// The step vocabulary, in the words a person would use.
const STEP_WORDS = {
  open_events_list: () => "open the events list",
  expect_events_list: () => "check the events list rendered",
  open_stage_menu: (a) => `open the ${a?.stage ?? "stage"} tab's ⋮ menu`,
  expect_disabled: (a) => `check "${a?.control ?? "the control"}" is disabled`,
  expect_enabled: (a) => `check "${a?.control ?? "the control"}" is enabled`,
  filter_events: (a) => `switch the events list to the ${a?.tab ?? "Live"} tab`,
  expect_event_in_list: (a) => (a?.title ? `check "${a.title}" appears in the events list` : "check the event appears in the events list"),
  expect_event_status: (a) => `check the event's row shows "${a?.status ?? "the expected status"}"`,
  expect_template_selected: (a) => (a?.name ? `check the "${a.name}" template is applied` : "check a template is applied to the stage"),
  expect_sheet_columns: (a) => (Array.isArray(a?.columns) && a.columns.length ? `check the sheet has columns ${a.columns.join(", ")}` : "check the pricing sheet rendered from the template"),
  open_create: (a) => `open the ${a?.path === "single-stage" ? "single-stage" : a?.path === "boq" ? "BOQ" : "eRFX"} create screen`,
  compose_stages: (a) => `set the stages to ${Array.isArray(a?.stages) ? a.stages.join(" + ") : "what the case asks"}`,
  set_title: () => "give the event a title",
  switch_stage: (a) => `switch to the ${a?.stage ?? ""} stage tab`,
  select_template: (a) => (a?.name ? `pick the "${a.name}" template` : "pick a pricing template"),
  add_line_items: (a) => `add ${a?.count ?? "the"} line item${a?.count === 1 ? "" : "s"}`,
  fill_sheet: () => "fill the pricing sheet",
  fill_questionnaires: () => "fill the vendor assessment questionnaires",
  assign_evaluator: () => "assign an evaluator",
  set_schedule: () => "save the schedule",
  invite_vendor: (a) => (a?.names?.length ? `invite ${a.names.join(", ")}` : "invite vendors"),
  publish: () => "publish the event",
  save_draft: () => "save as draft",
  expect_line_items: (a) => `check the toolbar shows ${a?.count ?? "the"} line items`,
  expect_published: () => "check the event is live on a project page",
  expect_no_error: () => "check the app showed no error",
  expect_error: (a) => `check the app refused${a?.message ? ` with "${a.message}"` : ""}`,
  place_bid: (a) => `place a bid from the vendor portal${a?.vendor ? ` as ${a.vendor}` : ""}`,
  place_surrogate_bid: (a) => `enter a surrogate bid${a?.vendor ? ` for ${a.vendor}` : ""}`,
  award_event: () => "award the event",
  expect_awarded: () => "check the award went through",
  expect_bid_submitted: () => "check the bid was accepted",
  expect_publish_blocked: () => "check publish is refused",
  expect_stages: (a) => `check the stage tabs are ${Array.isArray(a?.stages) ? a.stages.join(" + ") : "as expected"}`,
};
function stepWords(name, args) {
  const f = STEP_WORDS[name];
  return f ? f(args || {}) : name.replace(/_/g, " ");
}

// ── the single browser: who has it, who is waiting ──────────────────────────
async function pollRunState() {
  try {
    const [st, ai] = await Promise.all([
      (await fetch("/api/run-state")).json(),
      (await fetch("/api/ai-usage")).json(),
    ]);
    const dot = $("#rs-dot");
    if (st.running) {
      const secs = Math.round((Date.now() - st.running.since) / 1000);
      $("#rs-text").textContent = `Browser busy: ${st.running.label} · ${secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`}`;
      dot.className = "rs-dot busy";
    } else {
      $("#rs-text").textContent = "Browser idle — runs go one at a time, in one window";
      dot.className = "rs-dot idle";
    }
    $("#rs-queue").textContent = st.waiting?.length ? `· ${st.waiting.length} waiting: ${st.waiting.join(", ")}` : "";
    const spend = ai.totalUsd ? ` · $${ai.totalUsd.toFixed(3)} spent` : "";
    const calls = Object.values(ai.byModel || {}).reduce((n, m) => n + m.calls, 0);
    $("#rs-ai").textContent = `${ai.provider}${calls ? ` · ${calls} call${calls === 1 ? "" : "s"}` : ""}${spend}`;
  } catch {
    /* server restarting */
  }
}


// ── steps the automation still needs ─────────────────────────────────────────
async function loadGaps() {
  try {
    const { gaps } = await (await fetch("/api/vocabulary-gaps")).json();
    const box = $("#gaps");
    if (!gaps.length) return;
    box.innerHTML = "";
    $("#gaps-hint").textContent = `${gaps.length} missing capabilit${gaps.length === 1 ? "y" : "ies"} · most-asked-for first`;
    for (const g of gaps.slice(0, 12)) {
      const row = el("div", "gap");
      row.appendChild(el("span", "gap-n", String(g.askedBy.length)));
      const need = el("span", "gap-need", esc(g.need));
      need.appendChild(el("span", "gap-by", esc(g.askedBy.slice(0, 6).join(" · ") + (g.askedBy.length > 6 ? ` +${g.askedBy.length - 6}` : ""))));
      row.appendChild(need);
      box.appendChild(row);
    }
  } catch {
    /* server restarting */
  }
}
