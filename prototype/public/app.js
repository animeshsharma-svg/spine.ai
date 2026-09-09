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

// ── boot ──
init();
async function init() {
  loadFindings();
  loadKnowledge();
  $("#ai-btn")?.addEventListener("click", runAiInstruction);
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
      $("#kb-hint").textContent = "what should happen · what has happened";
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
