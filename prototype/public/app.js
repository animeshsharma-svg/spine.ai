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
/** The selected company's display name, for the run-complete dialog. */
let currentClientName = "";
let execData = null; // flow results captured from the Executor
let designedCases = null; // test cases captured from the Test-designer
let checkRows = []; // live automation check results
let checkFilter = "all"; // "all" | "fail"
let currentMap = null; // the loaded capability map (for the control panel)

/**
 * THE ROUTER — one view at a time, addressable.
 *
 * The platform used to show every panel at once in three columns, so a reader
 * arrived at a wall of unrelated work. Each view is now a place: Run, API
 * automation, UI automation, Purchase-to-bill, Reports, Bugs. The hash holds
 * the current one, which means a view can be linked, bookmarked, and reached
 * with the browser's own back button — the things that make an app feel like
 * an app rather than a page.
 *
 * Views are not unmounted. A run streams into the Run view while you read the
 * bug sheet, and switching back shows it mid-flight rather than restarting it.
 */
// Purchase-to-bill is off the nav for now: its runner and endpoints stay,
// so restoring it is a nav entry and a view block, nothing more.
const VIEWS = ["run", "api", "ui", "cases", "reports", "bugs"];
const DEFAULT_VIEW = "run";

function currentView() {
  const want = (location.hash.replace(/^#\/?/, "") || DEFAULT_VIEW).split("/")[0];
  return VIEWS.includes(want) ? want : DEFAULT_VIEW;
}

function showView(name) {
  for (const section of document.querySelectorAll(".view")) {
    section.classList.toggle("active", section.dataset.view === name);
  }
  for (const link of document.querySelectorAll(".nav-item")) {
    const on = link.dataset.view === name;
    link.classList.toggle("active", on);
    if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  // A view change is a navigation: start at the top of the new one.
  document.querySelector(".views")?.scrollTo({ top: 0, behavior: "instant" });
  document.title = name === DEFAULT_VIEW ? "Procol QA" : `Procol QA · ${name}`;
}

/**
 * A drawer that is the whole page does not need collapsing.
 *
 * The drawers earned their folds when three of them shared one column. Now
 * each has a view to itself, so they open on arrival — and the fold still
 * works if someone wants it shut.
 */
function openDrawersInViews() {
  for (const drawer of document.querySelectorAll(".view .drawer")) {
    drawer.classList.add("open");
    drawer.querySelector(".drawer-head")?.setAttribute("aria-expanded", "true");
  }
}

/**
 * What the platform actually has, on the nav where it is always in view.
 *
 * The counts are published by the loaders that already fetch them instead of
 * being re-fetched here. Reading a company's browser journeys is an
 * eight-second round trip; asking for it a second time would make the whole
 * footer wait on the slowest answer, so each number appears as it lands.
 */
const navCounts = { api: null, ui: null, chain: null };

function setNavCount(key, value) {
  navCounts[key] = value;
  const foot = $("#nav-foot");
  if (!foot) return;
  const line = (n, one, many) => (n == null ? "" : `${n} ${n === 1 ? one : many}`);
  foot.innerHTML = [
    line(navCounts.api, "API case", "API cases"),
    line(navCounts.ui, "browser journey", "browser journeys"),
    line(navCounts.chain, "purchase-to-bill step", "purchase-to-bill steps"),
  ]
    .filter(Boolean)
    .join("<br>");
}

/**
 * Take the reader to the run they just started.
 *
 * Every run streams into "Automation run" on the Run view, so pressing run
 * from a drawer used to start something the reader could not see. Pressing run
 * is unambiguous about intent: show them the run.
 */
/**
 * What is starting, before it has produced anything.
 *
 * A run takes a moment to get going — the server reads the company's
 * configuration and builds the plan first — and during that the panel said
 * "nothing has run yet", which reads as a dead button. Held here so the panel
 * can show the wait instead.
 */
let runPending = null;

/**
 * How many checks this run said it would do.
 *
 * The panel counted the rows that had arrived, so the total grew as the run
 * went — "10 of 19", then "10 of 24" — and there was no way to tell how far
 * along it was, or whether it had stalled. The server says up front how many
 * it will run; that is the denominator.
 */
let runPlanned = 0;

/**
 * Why this panel has no rows even though something ran.
 *
 * A browser journey reports in the log, not as test cases; a run whose cases
 * were all skipped produces none either. Both used to end on "nothing has run
 * yet", which is a flat contradiction of what the reader just watched.
 */
let runEmptyNote = "";

/**
 * The safety net under every run.
 *
 * The spinner comes down on a `done` or `fatal` event, which assumes the
 * stream ends politely. If the connection dies — server restarted, laptop
 * asleep, network gone — neither arrives, and EventSource does something worse
 * than nothing: it reconnects. These endpoints are one-shot, so a reconnect
 * re-runs the whole thing, firing a second set of real requests at UAT while
 * the panel still says "running…". Closing it ourselves ends the run once.
 */
function watchStreamEnd(es, onEnd) {
  es.addEventListener("error", () => {
    // The `done` handler closes the stream itself, so reaching here means the
    // connection dropped rather than the run finishing.
    if (es.readyState === EventSource.CLOSED) {
      runFinished();
      onEnd?.();
      return;
    }
    es.close();
    runEmptyNote =
      runEmptyNote ||
      "The connection to the run was lost before it finished. Nothing was restarted — " +
        "run it again when you are ready.";
    runFinished();
    onEnd?.();
  });
  return es;
}

function goToRun(label, hint) {
  if (currentView() !== "run") location.hash = "#/run";
  const link = document.querySelector('.nav-item[data-view="run"]');
  link?.classList.add("live");
  if (label) {
    runPending = label;
    runPendingHint = hint || "";
    runPlanned = 0;
    runEmptyNote = "";
    runStartedAt = Date.now();
    runCurrentStep = "";
    renderAutomation();
    setRunBar(0, 0);
  }
}

/** What the wait is for, when "building the plan" is not what is happening. */
let runPendingHint = "";

/**
 * When THIS run (or this journey, inside a sequence) started, and the last
 * step it reported — the two things a ticking clock needs.
 *
 * A run that produces no check rows (every browser journey) shows the waiting
 * card for its ENTIRE duration, not just its opening moment — `total` in
 * `renderAutomation` never leaves 0. That card used to say one static
 * sentence for the whole 2-3 minutes; a reader watching it has no way to
 * tell "still working" from "stuck". These make it a live clock instead.
 */
let runStartedAt = 0;
let runCurrentStep = "";

/**
 * Re-label the waiting card mid-run.
 *
 * A three-journey run prints "journey passed" after the first one while the
 * second is still driving a browser — so a card that still said "Running 3
 * browser journeys" read as stuck. It says which one it is on instead, and
 * restarts the clock: elapsed time means THIS journey's time, not the whole
 * sequence's.
 */
function setRunPending(label, hint) {
  if (!runPending) return;
  runPending = label;
  if (hint !== undefined) runPendingHint = hint;
  runStartedAt = Date.now();
  runCurrentStep = "";
  renderAutomation();
}

/** The run has stopped: take the pulse off the nav and the spinner off the panel. */
function runFinished() {
  document.querySelector('.nav-item[data-view="run"]')?.classList.remove("live");
  if (runPending) {
    runPending = null;
    renderAutomation();
  }
  /**
   * And the progress bar, which nothing else was switching off.
   *
   * A browser journey produces no check rows, so `renderAutomation` never
   * reaches its `if (total) setRunBar(...)` line — the bar kept the
   * indeterminate stripe it was given at the start and slid back and forth
   * forever. The run was finished, the modal had said so, and the page still
   * looked like it was working. `runPending` is already null here, so this
   * resolves to "hidden".
   */
  setRunBar(0, 0);
}

/** "3m 14s", not "194s" — a duration a reader can read at a glance. */
function elapsedInWords(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/**
 * Updates the waiting card's live parts directly, without rebuilding it.
 *
 * The card is rebuilt (via `renderAutomation`) only when what it is FOR
 * changes — a new run, a new journey. Ticking the clock through the same
 * rebuild would restart its sweep animation every second, which is worse than
 * the problem it is solving. Direct writes leave the card alone and just
 * update the two numbers on it.
 */
function tickRunCard() {
  if (!runPending) return;
  const stepLine = $("#run-current-step");
  if (stepLine) {
    stepLine.textContent = runCurrentStep ? `Currently: ${runCurrentStep}` : "";
    stepLine.hidden = !runCurrentStep;
  }
  const clock = $("#run-elapsed");
  if (clock) clock.textContent = runStartedAt ? elapsedInWords(Date.now() - runStartedAt) : "";
}
setInterval(tickRunCard, 1000);

function initRouter() {
  window.addEventListener("hashchange", () => showView(currentView()));
  if (!location.hash) location.replace(`#/${DEFAULT_VIEW}`);
  showView(currentView());
}

/**
 * Live counts on the nav, so a section says how much is in it before you open
 * it — the selection you have made, and whether anything is running.
 */
function syncNav() {
  const badge = (view, text) => {
    const link = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (!link) return;
    let el = link.querySelector(".nav-badge");
    if (!text) { el?.remove(); return; }
    if (!el) {
      el = document.createElement("span");
      el.className = "nav-badge";
      link.appendChild(el);
    }
    el.textContent = text;
  };
  const apiCases = featureGroups.reduce(
    (n, g) => n + g.children.reduce((m, c) => m + (selected.has(c.id) ? c.cases || 0 : 0), 0),
    0,
  );
  badge("api", apiCases ? String(apiCases) : "");
  badge("ui", uiSelected.size ? String(uiSelected.size) : "");
  badge("run", checkRows.length ? String(checkRows.length) : "");
}

// ── boot ──
init();
async function init() {
  loadFindings();
  loadStuck();
  // The chat box has one button, and it drives the run whose output appears
  // directly beneath it. Letting the AI pick a browser journey is a different
  // thing that prints to a different console, so it lives in UI automation.
  $("#ai-btn")?.addEventListener("click", run);
  $("#plan-btn")?.addEventListener("click", () => runTestCase(false));
  $("#plan-dry")?.addEventListener("click", () => runTestCase(true));
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
  currentClientName = clients.find((c) => String(c.id) === String(defaultClient))?.name ?? "";
  sel.addEventListener("change", () => {
    currentClient = Number(sel.value);
    currentClientName = clients.find((c) => String(c.id) === String(currentClient))?.name ?? "";

    /**
     * Anything account-specific goes away the moment the account changes.
     *
     * Reading the new company's configuration takes a second or two (PROCOL
     * DEMO longest of all), and until it lands the panel still shows the last
     * account's state — which is how "Run PO automation" appeared under a
     * client that has no PO module. Clear first, then reload.
     */
    resetAccountControls();
    // Switching company re-reads that company's configuration and rebuilds the
    // tree — the same way the real Procol console reconfigures itself.
    loadFeatures();
    loadUiFlows();
    loadPoInput();
    loadCatalogue();
  });
  $("#ui-ai")?.addEventListener("click", runAiInstruction);
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
      document.querySelectorAll(".submodule.running").forEach((r) => r.classList.remove("running"));
    }
  });
  $("#po-run")?.addEventListener("click", runPoAutomation);
  $("#chain-run")?.addEventListener("click", runChainFlow);
  loadChain();

  initRouter();
  renderAutomation();
  openDrawersInViews();
  initDrawers();
  initModal();
  initExamples();
  loadFeatures();
  loadUiFlows();
  loadPoInput();
  loadHistory();
  loadCatalogue();
  for (const id of ["#cat-search", "#cat-module", "#cat-kind"]) {
    $(id)?.addEventListener("input", renderCatalogue);
  }
}

/**
 * One-click prompts. The ask box starts with text in it, which hides that it
 * accepts anything — a few concrete examples show the range without a manual.
 */
function initExamples() {
  const box = $("#rc-examples");
  if (!box) return;
  const examples = [
    "Create a technical RFP + RFQ event, place a bid and award it",
    "Create an RFQ-only event with 3 line items",
    "Convert an approved PR into an event",
    "Run a rank-based auction and award the winner",
    "Create a product category, a product and a location",
  ];
  for (const text of examples) {
    const chip = el("button", "rc-ex", text.length > 46 ? text.slice(0, 44) + "…" : text);
    chip.type = "button";
    chip.title = text;
    chip.addEventListener("click", () => {
      $("#request").value = text;
      $("#request").focus();
    });
    box.appendChild(chip);
  }
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

// ── feature tree: what to test ────────────────────────────────────────────
let featureGroups = [];
let selected = new Set();

async function loadFeatures() {
  const box = $("#tree");
  box.innerHTML = "";
  // Say what the wait is for. The first read of a company's configuration is a
  // live round trip and can take half a minute; a bare spinner reads as broken.
  box.appendChild(
    el(
      "div",
      "loading",
      `Reading ${esc(currentClientName || "this company")}'s configuration — the first read takes a moment…`,
    ),
  );
  try {
    // Pass the client so the tree reflects THAT company's switched-on features —
    // the same source of truth the real Procol console uses.
    const { groups, defaults, totalCases, company, scope } = await (
      await fetch("/api/features?c=" + currentClient)
    ).json();
    featureGroups = groups;
    setNavCount("api", totalCases);
    /**
     * Start with nothing selected.
     *
     * The tree used to open with eleven features already ticked, so the first
     * "Run selected" ran something nobody chose — and the count in the button
     * described a selection the reader had not made. An empty tree asks the
     * question instead of answering it for you.
     */
    void defaults;
    selected = new Set();

    // Some accounts only cover part of the product. Say so above the tree,
    // otherwise a short list reads as something failing to load.
    const scopeBox = $("#tree-scope");
    if (scopeBox) {
      if (scope?.note) {
        scopeBox.innerHTML = `<b>${esc(scope.name)}</b> ${esc(scope.note)}`;
        scopeBox.hidden = false;
      } else {
        scopeBox.hidden = true;
      }
    }
    const featureCount = groups.reduce((n, g) => n + g.children.length, 0);
    const off = groups.reduce((n, g) => n + g.children.filter((c) => c.config?.state === "off").length, 0);
    /**
     * A caption, guarded.
     *
     * This used to be written unguarded, so when the rewrite moved the element
     * the assignment threw — and the catch below reported "could not load the
     * feature list" over a list that had loaded perfectly, taking the UI tree
     * with it. Cosmetic writes do not get to fail the render.
     */
    const countLine = $("#tree-count");
    if (countLine) {
      countLine.textContent = company?.loaded
        ? `${featureCount} features · ${totalCases} cases · ${company.flagCount} settings read${off ? ` · ${off} off here` : ""}`
        : `${featureCount} features · ${totalCases} cases · config not read`;
      countLine.title = company?.loaded
        ? `${company.name}: ${company.flagCount} configuration settings, ${company.permissionCount} permissions, ` +
          `acting as ${company.actorRole}${company.actorEmail ? ` (${company.actorEmail})` : ""}`
        : "";
    }
    renderTree();
    renderUiTree();
  } catch {
    box.innerHTML = "";
    box.appendChild(el("div", "empty", "Could not load the feature list."));
  }
}

/**
 * Which modules are expanded. Kept outside the render so redrawing after a
 * tick does not collapse what the reader had open.
 */
const openModules = new Set();

/** Wires a drawer header to its body. */
function initDrawers() {
  for (const drawer of document.querySelectorAll(".drawer")) {
    const head = drawer.querySelector(".drawer-head");
    head.addEventListener("click", () => {
      const open = drawer.classList.toggle("open");
      head.setAttribute("aria-expanded", String(open));
    });
  }
}

/**
 * The API-automation tree: module (a feature group) → sub-module (a feature).
 *
 * Ticking a module ticks every sub-module under it; a partly-ticked module
 * shows an indeterminate box, so "some of this is selected" is visible without
 * opening it.
 */
function renderTree() {
  const box = $("#tree");
  box.innerHTML = "";
  let pickedCases = 0;
  let pickedFeatures = 0;

  for (const g of featureGroups) {
    // Only features that actually have test cases can be run. The rest are
    // listed — the tree doubles as a coverage map — but not selectable, so
    // "Run selected" can never mean "run nothing".
    const kidIds = g.children.filter((c) => c.cases > 0).map((c) => c.id);
    const onCount = kidIds.filter((id) => selected.has(id)).length;
    pickedFeatures += onCount;
    pickedCases += g.children.reduce((n, c) => n + (selected.has(c.id) ? c.cases || 0 : 0), 0);

    const mod = el("div", "module" + (openModules.has(g.id ?? g.label) ? " open" : ""));
    const key = g.id ?? g.label;

    const head = el("button", "module-head");
    head.type = "button";
    head.setAttribute("aria-expanded", String(openModules.has(key)));
    head.appendChild(el("span", "module-caret"));

    // The master checkbox sits inside the header but must not open the module.
    const master = el("input");
    master.type = "checkbox";
    master.disabled = kidIds.length === 0;
    master.checked = onCount > 0;
    master.indeterminate = onCount > 0 && onCount < kidIds.length;
    master.title = kidIds.length
      ? onCount
        ? "Untick everything here"
        : "Tick everything here that has tests"
      : "no test cases written for this module yet";
    master.addEventListener("click", (e) => e.stopPropagation());
    master.addEventListener("change", () => {
      if (master.checked) kidIds.forEach((id) => selected.add(id));
      else kidIds.forEach((id) => selected.delete(id));
      renderTree();
    });
    head.appendChild(master);

    head.appendChild(el("span", "module-ico", g.icon));
    head.appendChild(el("span", "module-name", esc(g.label)));
    const groupCases = g.children.reduce((n, c) => n + (c.cases || 0), 0);
    // "1/7 · 29 cases" read as a fraction of nothing. Say what is picked and
    // how many tests that module has, in words.
    const n = el("span", "module-n" + (onCount ? " some" : ""),
      `${onCount ? `${onCount} of ${kidIds.length} picked` : `${kidIds.length} parts`} · ${groupCases} test${groupCases === 1 ? "" : "s"}`);
    head.appendChild(n);
    head.addEventListener("click", () => {
      if (openModules.has(key)) openModules.delete(key);
      else openModules.add(key);
      renderTree();
    });
    mod.appendChild(head);

    const body = el("div", "module-body");
    if (g.what) body.appendChild(el("div", "module-what", esc(g.what)));

    for (const f of g.children) {
      const runnable = f.cases > 0;
      const row = el("div", "submodule" + (runnable ? "" : " none") + (selected.has(f.id) ? " picked" : ""));
      const cb = el("input");
      cb.type = "checkbox";
      cb.disabled = !runnable;
      cb.checked = runnable && selected.has(f.id);
      cb.title = runnable ? "" : "no test cases written for this yet";
      cb.addEventListener("click", (e) => e.stopPropagation());
      cb.addEventListener("change", () => {
        cb.checked ? selected.add(f.id) : selected.delete(f.id);
        renderTree();
      });
      row.appendChild(cb);

      // Per-company configuration badge: a feature that is simply OFF here
      // would otherwise look like a product bug when its tests are skipped.
      let tags = "";
      if (f.flowId) tags += ' <span class="sub-tag e2e" title="has a real end-to-end journey">e2e</span>';
      const st = f.config?.state;
      if (st === "on") tags += ` <span class="sub-tag on" title="${esc(f.requiresConfig || "")} is ON for this company">on</span>`;
      else if (st === "off") tags += ` <span class="sub-tag off" title="${esc(f.requiresConfig || "")} is OFF here — its tests are skipped, not failed">off</span>`;
      else if (st === "unknown" && f.requiresConfig) tags += ` <span class="sub-tag unk" title="could not read ${esc(f.requiresConfig)}">config?</span>`;

      if (!runnable) {
        tags += ' <span class="sub-tag notbuilt" title="no test cases written for this feature yet">no tests yet</span>';
      }

      const name = el("span", "sub-name");
      name.innerHTML = `${esc(f.label)}${tags}<span class="sub-what">${esc(f.what)}</span>`;
      row.appendChild(name);
      row.appendChild(el("span", "sub-n", f.cases ? String(f.cases) : "—"));
      if (runnable) {
        row.addEventListener("click", () => {
          const now = !selected.has(f.id);
          now ? selected.add(f.id) : selected.delete(f.id);
          renderTree();
        });
      }
      body.appendChild(row);
    }
    mod.appendChild(body);
    box.appendChild(mod);
  }

  syncRunButton();
  syncNav();
  const meta = $("#api-meta");
  if (meta)
    meta.textContent = pickedFeatures
      ? `${pickedFeatures} picked · ${pickedCases} test${pickedCases === 1 ? "" : "s"} will run`
      : "nothing picked yet";
}

/** Run the test cases for every ticked feature. */
let planSkipped = 0;

/** Progress bar above the live case list. */
function setRunBar(done, total) {
  let bar = document.querySelector("#runbar");
  if (!bar) {
    bar = el("div", "runbar");
    bar.id = "runbar";
    bar.appendChild(el("i"));
    $("#automation").before(bar);
  }
  // Before the plan comes back there is no denominator — show movement, not 0%.
  const waiting = total === 0 && !!runPending;
  bar.classList.toggle("waiting", waiting);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  bar.firstChild.style.width = waiting ? "" : pct + "%";
  bar.hidden = total === 0 && !waiting;
}

/**
 * The run-complete dialog.
 *
 * Reports what the run actually did, then offers the evidence. The report link
 * is only enabled when a report file really exists — a dead link on a success
 * dialog is worse than no link, so its presence is checked rather than assumed.
 */
async function showRunComplete({
  total,
  passed,
  failed,
  skipped = 0,
  error = null,
  /** Replaces "N checks ran against <client>" when that is not what happened. */
  subtitle = null,
  /** Replaces the line about what the report covers. */
  reportNote = null,
  /**
   * "checks" (default) shows the usual tiles: checks / passed / failed /
   * skipped — right for a run built out of many API test cases. A single
   * browser journey isn't that shape: it is one pass/fail, not a count, so
   * "journey" swaps the tiles for what a journey actually has — how long it
   * took and how many steps it narrated — instead of a confusing "1 checks".
   */
  kind = "checks",
  /** For kind:"journey" — how long it ran and how many steps it narrated. */
  took = null,
  steps = null,
  /** Text and href for the single action button — defaults to the report. */
  actionLabel = null,
  actionHref = null,
}) {
  const modal = $("#modal");
  const ok = !error && failed === 0;
  modal.classList.toggle("bad", !ok);
  $("#modal-ico").textContent = ok ? "✓" : error ? "!" : "✕";
  $("#modal-title").textContent = error
    ? "Run stopped"
    : ok
      ? kind === "journey"
        ? "The journey worked"
        : "Run successful"
      : kind === "journey"
        ? "The journey broke"
        : `Run complete — ${failed} failed`;
  $("#modal-sub").textContent =
    error ??
    subtitle ??
    `${total} check${total === 1 ? "" : "s"} ran against ${currentClientName || "this client"}.`;

  const stats = $("#modal-stats");
  stats.innerHTML = "";
  const stat = (n, label, cls = "") => {
    const d = el("div", "mstat " + cls);
    d.appendChild(el("b", "", String(n)));
    d.appendChild(el("span", "", label));
    return d;
  };
  if (kind === "journey") {
    if (took != null) stats.appendChild(stat(took, "took"));
    if (steps != null) stats.appendChild(stat(steps, "steps"));
    stats.appendChild(stat(ok ? "✓" : "✗", ok ? "worked" : "broke", ok ? "good" : "bad"));
  } else {
    stats.appendChild(stat(total, "checks"));
    stats.appendChild(stat(passed, "passed", "good"));
    stats.appendChild(stat(failed, "failed", failed ? "bad" : ""));
    if (skipped) stats.appendChild(stat(skipped, "skipped"));
  }

  // What the report will cover, said before the click rather than after.
  // It is always there to open: the case library exists whether or not this
  // run reached every case, and a case that did not run says so in the report.
  const link = $("#modal-report");
  const note = $("#modal-note");
  link.classList.remove("disabled");
  if (actionLabel != null) link.textContent = actionLabel;
  if (actionHref != null) link.href = actionHref;
  const ticked = [...selected].length;
  note.textContent = reportNote ?? (ticked
    ? `The test report covers the ${ticked} ticked feature${ticked === 1 ? "" : "s"} — every case those modules define, each with its verdict and a curl.`
    : "The test report covers every module in the case library — tick features on the left to narrow it.");

  modal.hidden = false;
}

function initModal() {
  // The run-complete dialog opens the platform's own test report, scoped to the
  // ticked features; the sheet is the platform's findings for those modules.
  // The side-panel links are about everything the platform knows; the centre
  // bar and the popup are about the run that just finished, and are set by
  // showReportsFor() when one does.
  wireReportLink("#report-sheet", "/api/bug-report", "module");
  wireReportLink("#report-tests", "/api/test-report", "features");
  const modal = $("#modal");
  const close = () => (modal.hidden = true);
  $("#modal-close").addEventListener("click", close);
  // Click the backdrop, not the card, to dismiss.
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) close(); });
}

/**
 * The module the current tick-boxes mean, in the words the reports use, or ""
 * when the selection spans several modules.
 *
 * Derived from the feature tree the sidebar is already rendering, so the UI,
 * the test report and the bug sheet all name a module the same way and there
 * is no second mapping to keep in step.
 */
function selectedModuleLabel() {
  const labels = new Set();
  for (const id of selected) {
    const group = featureGroups.find((g) => g.children.some((c) => c.id === id));
    if (group) labels.add(group.label);
  }
  return labels.size === 1 ? [...labels][0] : "";
}

/**
 * Opens a report about exactly what is ticked in the tree.
 *
 * The module is chosen here, in the UI — the test report takes the feature ids
 * as a query so its case list is those modules' cases, and the bug sheet takes
 * the module name in the hash so it opens filtered. Nothing is typed on a
 * command line, and nothing is scoped twice.
 */
function wireReportLink(id, href, mode) {
  const link = $(id);
  if (!link) return;
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const ids = [...selected];
    let url = href;
    if (mode === "features" && ids.length) {
      url += "?features=" + encodeURIComponent(ids.join(","));
    } else if (mode === "module") {
      const module = selectedModuleLabel();
      if (module) url += "#module=" + encodeURIComponent(module);
    }
    window.open(url, "_blank", "noopener");
  });
}

/** Keeps the run button honest about how much work it is about to do. */
function syncRunButton() {
  const btn = $("#t-run");
  if (!btn) return;
  const cases = featureGroups.reduce(
    (n, g) => n + g.children.reduce((m, c) => m + (selected.has(c.id) ? c.cases || 0 : 0), 0),
    0,
  );
  btn.textContent = cases ? `▶ Run ${cases} selected test${cases === 1 ? "" : "s"}` : "▶ Run selected tests";
  btn.disabled = false;
}

/**
 * Points the run's reports at the run that just happened.
 *
 * Before this, the links in the centre were always visible and always meant
 * "everything the platform has ever run" — so after finishing one journey you
 * could open a report about someone else's. Now they appear when a run ends,
 * and carry that run: its id for the test report, its module for the sheet.
 */
function showReportsFor({ label, testHref, bugHref, testLabel = "📊 Test report" }) {
  const bar = $("#report-bar");
  if (!bar) return;
  $("#report-bar-label").textContent = label;
  const test = $("#open-api-report");
  const bugs = $("#open-bug-sheet");
  test.textContent = testLabel;
  test.href = testHref;
  bugs.href = bugHref;
  bar.hidden = false;

  // The popup offers the same two, so a reader lands in the same place
  // whichever they click.
  const modalReport = $("#modal-report");
  const modalBugs = $("#modal-bugs");
  if (modalReport) { modalReport.href = testHref; modalReport.textContent = testLabel; }
  if (modalBugs) modalBugs.href = bugHref;
}

/** The bug sheet, narrowed to the module a run covered. */
function bugHrefForSelection() {
  const module = selectedModuleLabel();
  return "/api/bug-report" + (module ? "#module=" + encodeURIComponent(module) : "");
}

function runSelectedFeatures() {
  const ids = [...selected];
  if (!ids.length) {
    // Said where the reader is standing — navigating first would hide it.
    const meta = $("#api-meta");
    if (meta) meta.textContent = "tick at least one feature first";
    $("#auto-summary").textContent = "tick at least one feature first";
    return;
  }
  goToRun(`${ids.length} feature${ids.length === 1 ? "" : "s"} · API tests`);
  checkRows = [];
  renderAutomation();

  const qs = new URLSearchParams({ c: String(currentClient), features: ids.join(",") });
  $("#auto-summary").textContent = `starting ${ids.length} feature(s)…`;
  const es = new EventSource(`/api/features-run?${qs}`);
  watchStreamEnd(es);
  es.addEventListener("blocked", (ev) => {
    /**
     * The compiler could not use your words, so nothing was run.
     *
     * Said loudly and in full: which is better than running an unrelated
     * journey and leaving someone to work out why the screens looked wrong.
     */
    const b = JSON.parse(ev.data);
    write(`✗ Not run — ${b.reason}`, "bad");
    if (b.covers) write(`   ${b.covers}`, "note");
    if (b.hint) write(`   ${b.hint}`, "note");
    if (b.suggestion?.length) write(`   the default plan it would have run: ${b.suggestion.join(" → ")}`, "note");
  });

  es.addEventListener("plan", (ev) => {
    const p = JSON.parse(ev.data);
    planSkipped = p.skipped?.length ?? 0;
    runPlanned = p.runnable || 0;
    $("#auto-summary").textContent =
      `${p.runnable} checks from ${p.cases} cases` + (planSkipped ? ` · ${planSkipped} skipped` : "");
    setRunBar(0, p.runnable || 1);

    /**
     * Why each case was skipped.
     *
     * The server sends a reason with every skip and the UI used to count them
     * and drop the rest, so "12 skipped" was a dead end — you could not tell
     * whether a feature is switched off for this company, a case needs a
     * different role, or a placeholder could not be resolved. Those are three
     * completely different problems, and only one of them is yours to fix.
     */
    const box = $("#skips");
    if (!box) return;
    if (!p.skipped?.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = "";
    const sum = el("summary", "", `${p.skipped.length} of ${p.cases} cases did not run — why`);
    box.appendChild(sum);
    const list = el("ul", "skip-list");
    for (const s of p.skipped) {
      list.appendChild(
        el("li", "", `<b>${esc(s.title || s.id)}</b><span>${esc(s.reason || "no reason given")}</span>`),
      );
    }
    box.appendChild(list);
  });
  es.addEventListener("check", (ev) => {
    checkRows.push(JSON.parse(ev.data).check);
    renderAutomation();
  });
  es.addEventListener("progress", (ev) => {
    const p = JSON.parse(ev.data);
    // The server owns the denominator; renderAutomation writes the line, so the
    // summary cannot disagree with itself depending on which event landed last.
    if (p.total) runPlanned = p.total;
    setRunBar(p.done, p.total || 1);
    renderAutomation();
  });
  es.addEventListener("done", (ev) => {
    es.close();
    const failed = checkRows.filter((c) => !c.pass && !c.inconclusive).length;
    // Whatever the plan said, what ran is what ran.
    runPlanned = checkRows.length;
    if (!checkRows.length) {
      runEmptyNote = planSkipped
        ? `That run checked nothing: all ${planSkipped} case${planSkipped === 1 ? "" : "s"} were skipped. ` +
          "The reasons are under <b>why cases were skipped</b> above."
        : "That run finished without running a single check — nothing matched what was ticked.";
    }
    runFinished();
    renderAutomation();
    setRunBar(1, 1);

    // The reports for THIS run: its own id for the test report, its module for
    // the sheet. Until a run finishes there is nothing to point at, which is
    // why the bar is hidden before this.
    let runId = "";
    try {
      runId = JSON.parse(ev.data).runId || "";
    } catch {}
    showReportsFor({
      label: "This run:",
      testHref: "/api/test-report" + (runId ? `?run=${encodeURIComponent(runId)}` : ""),
      // Scoped to the run, not the module: the sheet opened after a run should
      // list what THAT run found, not every bug the platform has ever seen.
      bugHref: runId ? `/api/bug-report?run=${encodeURIComponent(runId)}` : bugHrefForSelection(),
    });

    const refused = authRefusal(checkRows);
    showRunComplete({
      total: checkRows.length,
      // Counted, not inferred: an inconclusive check is not a pass, and
      // "total − failed" quietly promoted every one of them to green.
      passed: checkRows.filter((c) => c.pass).length,
      failed,
      skipped: planSkipped,
      // "Run complete — 0 failed" is true and useless when every request was
      // turned away at the door.
      error: refused,
    });
  });
  es.addEventListener("fatal", (ev) => {
    es.close();
    runFinished();
    setRunBar(0, 0);
    const message = JSON.parse(ev.data).message || "run failed";
    $("#auto-summary").textContent = `error: ${message}`;
    showRunComplete({ total: checkRows.length, passed: 0, failed: checkRows.length, error: message });
  });
  document.querySelector("#automation")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ── UI coverage: the same 92 features, but which have a browser journey ───
let uiSelected = new Set();
/** Whether this client has BOQ events at all — the BOQ input is pointless without. */
let uiBoqAllowed = null;

/**
 * The UI-automation tree, same module → sub-module shape as the API one.
 *
 * A feature with no journey built is shown but not selectable — hiding it would
 * make UI coverage look complete when it is 20 of 92.
 */
const openUiModules = new Set();

/**
 * The line-item inputs matter for some journeys and not others.
 *
 * They were always on screen, so a client whose journeys never build line
 * items still got "line items" and "BOQ items" to fill in — two numbers with
 * nothing to apply to. Shown only when a ticked journey actually uses them,
 * and the BOQ field only when this client has BOQ switched on.
 */
function syncUiInputs() {
  const wrap = $("#ui-inputs");
  if (!wrap) return;
  const picked = (uiFlows ?? []).filter((f) => uiSelected.has(f.key));
  const usesLineItems = picked.some((f) => f.usesLineItems && !f.boq);
  const usesBoq = picked.some((f) => f.boq) && uiBoqAllowed !== false;

  const normal = $("#li-normal-field");
  const boq = $("#li-boq-field");
  if (normal) normal.hidden = !usesLineItems;
  if (boq) boq.hidden = !usesBoq;
  // The whole row goes when neither field applies, so the drawer does not
  // carry an empty strip of controls.
  wrap.hidden = !usesLineItems && !usesBoq;
}

function renderUiTree() {
  const box = $("#ui-tree");
  if (!box) return;
  box.innerHTML = "";
  let have = 0, total = 0;

  for (const g of featureGroups) {
    const key = "ui:" + (g.id ?? g.label);
    const built = g.children.filter((f) => f.uiFlow);
    const picked = built.filter((f) => uiSelected.has(f.uiFlow)).length;
    const mod = el("div", "module" + (openUiModules.has(key) ? " open" : ""));

    const head = el("button", "module-head");
    head.type = "button";
    head.setAttribute("aria-expanded", String(openUiModules.has(key)));
    head.appendChild(el("span", "module-caret"));

    const master = el("input");
    master.type = "checkbox";
    master.disabled = built.length === 0;
    master.checked = picked > 0;
    master.indeterminate = picked > 0 && picked < built.length;
    master.title = built.length ? "Tick every built journey in this module" : "no journeys built here yet";
    master.addEventListener("click", (e) => e.stopPropagation());
    master.addEventListener("change", () => {
      if (master.checked) built.forEach((f) => uiSelected.add(f.uiFlow));
      else built.forEach((f) => uiSelected.delete(f.uiFlow));
      renderUiTree();
    });
    head.appendChild(master);

    head.appendChild(el("span", "module-ico", g.icon));
    head.appendChild(el("span", "module-name", esc(g.label)));
    head.appendChild(el("span", "module-n" + (picked ? " some" : ""),
      built.length
        ? `${picked ? `${picked} of ${built.length} picked` : `${built.length} journey${built.length === 1 ? "" : "s"}`}`
        : "none built"));
    head.addEventListener("click", () => {
      if (openUiModules.has(key)) openUiModules.delete(key);
      else openUiModules.add(key);
      renderUiTree();
    });
    mod.appendChild(head);

    const body = el("div", "module-body");
    for (const f of g.children) {
      total++;
      const available = !!f.uiFlow;
      if (available) have++;
      const row = el("div", "submodule" + (available ? "" : " none") +
        (available && uiSelected.has(f.uiFlow) ? " picked" : ""));
      if (available) row.dataset.flow = f.uiFlow;
      const cb = el("input");
      cb.type = "checkbox";
      cb.disabled = !available;
      cb.checked = available && uiSelected.has(f.uiFlow);
      cb.addEventListener("click", (e) => e.stopPropagation());
      cb.addEventListener("change", () => {
        cb.checked ? uiSelected.add(f.uiFlow) : uiSelected.delete(f.uiFlow);
        renderUiTree();
      });
      row.appendChild(cb);

      const name = el("span", "sub-name");
      name.innerHTML = esc(f.label) + (available
        ? ` <span class="sub-tag e2e" title="browser journey: ${esc(f.uiFlow)}">${esc(f.uiFlow)}</span>`
        : ' <span class="sub-tag notbuilt" title="no browser journey built for this feature yet">not built</span>');
      row.appendChild(name);
      if (available) {
        row.addEventListener("click", () => {
          const now = !uiSelected.has(f.uiFlow);
          now ? uiSelected.add(f.uiFlow) : uiSelected.delete(f.uiFlow);
          renderUiTree();
        });
      }
      body.appendChild(row);
    }
    mod.appendChild(body);
    box.appendChild(mod);
  }

  const meta = $("#ui-meta");
  // "20/92 have a journey" read as "20 picked". Lead with the selection, which
  // is the number a reader is actually looking for, and say the rest plainly.
  if (meta)
    meta.textContent = uiSelected.size
      ? `${uiSelected.size} picked · ${have} journeys built`
      : `nothing picked · ${have} of ${total} have a journey`;
  syncUiInputs();
  syncNav();
}

async function runSelectedUiJourneys() {
  const keys = [...uiSelected];
  if (!keys.length) {
    const m = $("#ui-meta");
    if (m) m.textContent = "tick at least one feature that has a journey";
    return;
  }
  goToRun(
    `${keys.length} browser journey${keys.length === 1 ? "" : "s"}`,
    "A real browser is driving Procol. Watch it in the run log below — a journey reports there, " +
      "not as test-case rows.",
  );
  const con = $("#ui-console");
  showRunLog();
  con.innerHTML = "";
  let passed = 0;
  let failed = 0;
  for (let i = 0; i < keys.length; i++) {
    const flow = uiFlows.find((f) => f.key === keys[i]) ?? { key: keys[i], usesLineItems: true };
    const label = flow.label || keys[i];
    setRunPending(
      keys.length === 1 ? label : `journey ${i + 1} of ${keys.length} · ${label}`,
      `A real browser is driving Procol${
        keys.length > 1 ? ` — ${passed} passed, ${failed} failed so far` : ""
      }. The steps appear below as it goes.`,
    );
    con.appendChild(el("div", "cmd", `── ${i + 1}/${keys.length} · ${esc(keys[i])} ──`));
    // The sequence owns the finish: each journey closing its own stream must
    // not take the spinner down while later journeys are still to run.
    // Only the last journey's report opens itself — one journey ticked (the
    // common case) opens immediately; several ticked would otherwise pop a
    // tab per journey, which is not "immediately", it is a flood.
    const code = await new Promise((done) =>
      runUiJourney(flow, done, { partOfSequence: true, autoOpen: i === keys.length - 1 }),
    );
    if (code === 0) passed++;
    else failed++;
  }
  runEmptyNote =
    `<b>${passed} passed${failed ? `, ${failed} failed` : ""}</b> of ${keys.length} browser journey` +
    `${keys.length === 1 ? "" : "s"}. The steps are above and the raw output is below; a browser journey ` +
    "does not produce test-case rows — its result is the steps, the screenshots and the UI automation report.";
  runFinished();
}

// ── a browser journey, read as a journey ──────────────────────────────────
/**
 * The UI tests narrate themselves to stdout, and that narration used to land
 * in the panel verbatim: `[create-event] stages round 2: on screen [rfp], want
 * [rfq]`. It is the right information in the wrong register — a terminal dump
 * where a run should be. These turn each line into a step with a phase, a
 * verdict and plain words, and keep the raw line for when something breaks.
 */
const UI_PHASES = {
  login: { label: "Signing in", icon: "🔑" },
  erfx: { label: "Preparing the line items", icon: "📋" },
  "create-event": { label: "Creating the event", icon: "🧾" },
  "event-detail": { label: "On the event", icon: "🔎" },
  award: { label: "Awarding", icon: "🏆" },
  plan: { label: "Running the plan", icon: "🗺" },
  healer: { label: "Healing a broken step", icon: "🤖" },
  learned: { label: "Learned a locator", icon: "🧠" },
  stuck: { label: "Stuck", icon: "🚧" },
  oracle: { label: "Verdict", icon: "⚖️" },
  playwright: { label: "Playwright", icon: "▶" },
  "po-to-bill": { label: "Purchase order to bill", icon: "🧾" },
  queue: { label: "Waiting for the browser", icon: "⏳" },
};

/** Wording that reads as a sentence rather than a log line. */
function humaniseUiLine(tag, rest) {
  const m = (re, fn) => {
    const hit = rest.match(re);
    return hit ? fn(hit) : null;
  };
  return (
    m(/^stages round \d+: on screen \[([^\]]*)\], want \[([^\]]*)\]$/i, (h) =>
      `Setting up the event type — Procol's create screen doesn't start on the right one, so it adds ` +
      `and removes tabs until it matches. Wanted: ${h[2] || "none"} · showing: ${h[1] || "none"}`) ||
    m(/^stages composed: \[([^\]]*)\]$/i, (h) => `The event is now set up as: ${h[1]}`) ||
    m(/^template applied: (.+?)(?: \(of (\d+) offered\))?$/i, (h) =>
      `Picked the pricing template "${h[1]}" — this decides what columns the pricing sheet has next` +
      `${h[2] ? ` (chosen from ${h[2]} available)` : ""}`) ||
    m(/^template "(.+?)" not offered \(have: (.+?)\).*$/i, (h) =>
      `The template "${h[1]}" wasn't on offer, so the automation took the first one instead: ${h[2]}`) ||
    m(/^sheet filled for (\d+) line item\(s\)$/i, (h) => `Filled in the pricing sheet for ${h[1]} item(s)`) ||
    m(/^sheet shows (\d+) line-item row\(s\), asked for (\d+).*$/i, (h) =>
      `The sheet only had room for ${h[1]} row(s) though ${h[2]} were asked for — filling all ${h[1]}`) ||
    m(/^building (\d+) line item\(s\).*$/i, (h) => `Preparing ${h[1]} product line item(s) to add`) ||
    m(/^schedule saved$/i, () => "Set the bidding window and saved it — Procol needs this before the event can go live") ||
    m(/^schedule duration set to (\d+) min$/i, (h) => `Set the bidding window to ${h[1]} minutes`) ||
    m(/^(\d+) participant\(s\) already on the event$/i, (h) => `${h[1]} vendor(s) were already invited`) ||
    m(/^(\d+) participant\(s\) invited in [\d.]+s$/i, (h) => `Invited ${h[1]} vendor${h[1] === "1" ? "" : "s"} to bid`) ||
    m(/^invited by name: (.+)$/i, (h) => `Invited by name: ${h[1]}`) ||
    m(/^no vendor matched "(.+?)"$/i, (h) => `Couldn't find a vendor named "${h[1]}" to invite`) ||
    m(/^could not click a line-item option for "(.+?)".*$/i, (h) =>
      `Tried to add "${h[1]}" to the line items three times and the screen never responded — this one may need adding by hand`) ||
    m(/^could not confirm the pick for "(.+?)".*$/i, (h) =>
      `Added "${h[1]}" to the line items — the screen didn't clearly confirm it right away, but that's normal ` +
      `here; it gets double-checked once the pricing sheet is saved`) ||
    m(/^allocated (\d+)\/(\d+) line item\(s\) to (\d+)\/(\d+) vendor\(s\)$/i, (h) =>
      `Split the line items across vendors: ${h[1]} of ${h[2]} items covered, ${h[3]} of ${h[4]} vendors used`) ||
    m(/^AI completed: "(.+?)"$/i, (h) => `The AI stepped in and did it: ${h[1]}`) ||
    m(/^AI could not do it: (.+)$/i, (h) => `The AI tried to step in but couldn't — ${h[1]}`) ||
    m(/^deterministic step failed . asking AI: "(.+?)"$/i, (h) =>
      `The usual way of doing this didn't work, so the AI is being asked to try: ${h[1]}`) ||
    m(/^(\d+)\/(\d+) (.+?) ([✓✗])\s*(.*)$/, (h) =>
      `Step ${h[1]} of ${h[2]}: ${h[3]}${h[5] ? ` — ${h[5]}` : ""}`) ||
    rest.charAt(0).toUpperCase() + rest.slice(1)
  );
}

/** Warnings read as warnings; a step that failed reads as failed. */
function uiLineKind(tag, rest) {
  if (tag === "plan") return /✗/.test(rest) ? "bad" : /✓/.test(rest) ? "ok" : "info";
  if (tag === "stuck") return "bad";
  if (tag === "healer") {
    if (/could not/i.test(rest)) return "bad";
    // Asking for help means a step broke — green would hide that.
    if (/asking AI/i.test(rest)) return "warn";
    return "ok";
  }
  if (tag === "learned") return "ok";
  if (/(failed|could not|never appeared|not offered|no vendor matched|is disabled|not in the|would not open|no selectable)/i.test(rest))
    return "warn";
  if (/(composed|applied|filled|saved|submitted|invited|allocated|completed)/i.test(rest)) return "ok";
  return "info";
}

/**
 * One log line → one step, or nothing.
 *
 * Lines with no phase tag are Playwright's own; only its start and its verdict
 * are worth a row, and everything else stays in the raw output.
 */
function parseUiLine(line) {
  // Strip ANSI colour codes — Playwright writes them even when piped.
  const clean = String(line).replace(/\u001b\[[0-9;]*m/g, "").trimEnd();
  if (!clean.trim()) return null;

  const tagged = clean.match(/^\s*\[([a-z-]+)\]\s*(.+)$/i);
  if (tagged) {
    const tag = tagged[1].toLowerCase();
    const rest = tagged[2];
    if (!UI_PHASES[tag]) return null;
    return {
      phase: tag,
      kind: uiLineKind(tag, rest),
      text: humaniseUiLine(tag, rest),
      raw: clean,
      // Stage composition retries noisily; one row that counts the rounds says
      // the same thing without scrolling the real steps off the screen.
      collapseKey: /^stages round/i.test(rest) ? "stages-round" : null,
    };
  }

  const header = clean.match(/^UI run . client "(.+?)" \(COMPANY_ID=(\d+)\)\s*.\s*(.+)$/);
  if (header)
    return { phase: "playwright", kind: "info", text: `Client ${header[1]} (${header[2]}) · ${header[3]}`, raw: clean };

  const running = clean.match(/^Running (\d+) tests? using (\d+) worker/i);
  if (running) return { phase: "playwright", kind: "info", text: `Playwright starting — ${running[1]} test(s)`, raw: clean };

  const verdict = clean.match(/^\s*(\d+ (?:passed|failed|skipped)[^)]*\))\s*$/i);
  if (verdict) return { phase: "playwright", kind: /failed/i.test(verdict[1]) ? "bad" : "ok", text: verdict[1], raw: clean };

  const test = clean.match(/^\s*([✓✘✗-])\s+\d+\s+(.+?)\s*(\(\d+(?:\.\d+)?m?s\))?\s*$/);
  if (test) {
    // "tests/ui-master.spec.ts:88:5 › events.rfq_only" — the name is the last
    // chevron segment; the path in front of it is for the terminal, not here.
    const title = test[2].split("›").pop().trim();
    return {
      phase: "playwright",
      kind: test[1] === "✓" ? "ok" : test[1] === "-" ? "info" : "bad",
      text: `${title}${test[3] ? ` ${test[3]}` : ""}`,
      raw: clean,
    };
  }
  return null;
}

let uiSteps = [];

/**
 * Reveal the run log.
 *
 * It lives inside a collapsible now, so simply un-hiding the <div> would leave
 * every non-journey run — the PO flow, the chain, the AI instruction — writing
 * into a box nobody can see. Those open it; a browser journey leaves it shut
 * because its steps are rendered above.
 */
/**
 * The browser is a single seat, and someone else is in it.
 *
 * Upstream put every browser run behind one slot, so a second run waits its
 * turn — and the server says so with a `queued` event. Nothing listened for
 * it, so the panel sat on the spinner saying "running" while the run had not
 * started: the exact shape of "it keeps loading and doesn't run".
 */
function onQueued(es, write) {
  es.addEventListener("queued", (ev) => {
    let line = "waiting for the browser";
    try {
      line = JSON.parse(ev.data).line || line;
    } catch {}
    write?.("⏳ " + line, "note");
    setRunPending(runPending, `${line}. It starts by itself as soon as the browser is free.`);
    pushUiLine("[queue] " + line);
  });
}

function showRunLog({ collapsed = false } = {}) {
  const con = $("#ui-console");
  if (con) con.hidden = false;
  const wrap = $("#ui-raw");
  if (wrap) {
    wrap.hidden = false;
    wrap.open = !collapsed;
  }
  return con;
}

function resetUiSteps() {
  uiSteps = [];
  const box = $("#ui-steps");
  if (box) {
    box.innerHTML = "";
    box.hidden = true;
  }
  const raw = $("#ui-raw");
  if (raw) {
    raw.hidden = true;
    raw.open = false;
  }
}

/**
 * Feed one step the SERVER already parsed.
 *
 * `/api/ui-run` parses its own output once and sends the result as a "step"
 * event — the same object the report is built from. Using it here instead of
 * re-parsing the raw line client-side means the live view and the report can
 * never disagree about what happened or where a run stopped.
 */
function pushJourneyStep(step) {
  if (!step) return;
  const merged = { ...step, rounds: step.repeats ?? step.rounds };
  const last = uiSteps[uiSteps.length - 1];
  if (merged.collapseKey && last?.collapseKey === merged.collapseKey) {
    uiSteps[uiSteps.length - 1] = merged;
  } else {
    uiSteps.push(merged);
  }
  renderUiSteps();
  // The waiting card's "Currently:" line, updated the instant a step lands
  // rather than waiting up to a second for the next clock tick.
  runCurrentStep = step.text;
  tickRunCard();
}

/** Feed one raw line into the step list. Returns true if it became a step. */
function pushUiLine(line) {
  const step = parseUiLine(line);
  if (!step) return false;
  const last = uiSteps[uiSteps.length - 1];
  if (step.collapseKey && last?.collapseKey === step.collapseKey) {
    last.rounds = (last.rounds ?? 1) + 1;
    last.text = step.text;
    last.raw = step.raw;
  } else {
    uiSteps.push(step);
  }
  renderUiSteps();
  runCurrentStep = step.text;
  tickRunCard();
  return true;
}

function renderUiSteps() {
  const box = $("#ui-steps");
  if (!box) return;
  box.hidden = uiSteps.length === 0;
  box.innerHTML = "";
  let phase = null;
  for (const s of uiSteps) {
    if (s.phase !== phase) {
      phase = s.phase;
      const meta = UI_PHASES[phase] ?? { label: phase, icon: "·" };
      const head = el("div", "ui-phase");
      head.innerHTML = `<span class="ui-phase-ico">${meta.icon}</span><span>${esc(meta.label)}</span>`;
      box.appendChild(head);
    }
    const row = el("div", "ui-step " + s.kind);
    const mark = { ok: "✓", bad: "✗", warn: "!", info: "·" }[s.kind] ?? "·";
    row.innerHTML =
      `<span class="ui-step-mark">${mark}</span><span class="ui-step-text">${esc(s.text)}` +
      (s.rounds ? ` <span class="ui-step-n">${s.rounds} attempts</span>` : "") +
      `</span>`;
    row.title = s.raw;
    box.appendChild(row);
  }
}

// ── browser journeys: run the real Playwright UI flows from a button ──────
let uiFlows = [];
let uiLimits = null;
let uiRunning = null; // EventSource of the active run

/**
 * What the next PO run will create, read from the suite's own input file.
 *
 * The values live in config/po-input.json — one header plus one line item per
 * entry — and are not copied here: this only reports what that file currently
 * says, so editing the file is what changes the run.
 */
/** Hides every control that belongs to one account, immediately. */
function resetAccountControls() {
  const bar = $("#po-bar");
  if (bar) bar.hidden = true;
  const btn = $("#po-run");
  if (btn) btn.disabled = true;
  for (const id of ["#tree-scope", "#ui-note", "#skips"]) {
    const el = $(id);
    if (el) el.hidden = true;
  }
}

/**
 * ONE RUN BUTTON ON AN ACCOUNT WITH ONE THING TO RUN.
 *
 * The sandbox demo showed two: "Run selected" over the case library, and "Run
 * PO automation" over the API suite's flow. They are not two ways of doing the
 * same thing, which is what two buttons side by side promises — and on this
 * tenant only one of them can work at all. The case library reads the stored
 * token and stops dead on it ("its API token has expired"); the PO flow logs
 * in for itself. The tree stays as the list of what the tenant has, without
 * tick boxes that lead nowhere.
 */
function setSingleRunner(on) {
  const bar = $("#api-run-bar");
  if (bar) bar.hidden = !!on;
  const tree = $("#tree");
  if (tree) tree.classList.toggle("readonly", !!on);
  // The meta line is shared with "tick at least one feature first", which is
  // nonsense once there is nothing to tick — and equally nonsense to leave
  // behind on the next account.
  const meta = $("#api-meta");
  if (meta) meta.textContent = on ? "what this account has" : "";
}

async function loadPoInput() {
  const bar = $("#po-bar");
  const what = $("#po-what");
  if (!bar || !what) return;
  try {
    const info = await (await fetch("/api/po-input?c=" + currentClient)).json();
    if (!info.account) {
      bar.hidden = true;
      setSingleRunner(false);
      return;
    }
    bar.hidden = false;
    const btn = $("#po-run");
    const plan = info.exists
      ? `Creates a real PO on ${info.account} from config/po-input.json` +
        (info.lineItems ? ` — 1 header + ${info.lineItems} line item${info.lineItems === 1 ? "" : "s"}` : "") +
        (info.headerFields?.length ? `, fields set by hand: ${info.headerFields.join(", ")}` : ", every field generated") +
        ". Anything left out of that file is generated."
      : "config/po-input.json is missing — the suite generates every field.";

    /**
     * A dead credential stops the run before it starts.
     *
     * The token is a console session and expires, and when it does the flow
     * gets all the way to the create and dies on a 401 — three minutes spent
     * to learn something we could have checked in one call. So it is checked
     * on load, the button is disabled, and the fix is named.
     */
    if (info.token && !info.token.ok) {
      /**
       * The server already knows exactly what is wrong and what fixes it —
       * repeating it here in different words produced a paragraph that said
       * "put a fresh token in .env" twice and then contradicted itself about
       * whether a login had even been attempted. One sentence, theirs.
       */
      what.innerHTML =
        `<b class="po-dead">This account cannot run right now</b> — ${esc(
          info.token.message || "its credentials are not working",
        )} <span class="po-plan">${esc(plan)}</span>`;
      btn.disabled = true;
      btn.title = "This account's credentials are not working";

    } else {
      // "minted" means the stored token had aged out and the platform logged
      // in and replaced it for this run. Worth saying once — it explains why
      // nothing had to be pasted — without making it sound like a problem.
      what.innerHTML =
        `${esc(plan)}${
          info.token?.source === "minted"
            ? ` <b class="po-live">signed in automatically</b> — the stored token had expired, so the platform logged in and minted a fresh one for this run. Nothing to paste.`
            : info.token?.ok
              ? ` <b class="po-live">token OK</b>`
              : ""
        }`;
      btn.disabled = false;
      btn.title = "Creates a purchase order by calling the API — no browser opens";
    }
    /**
     * Why there are two run buttons on this account.
     *
     * This one calls the API and creates a purchase order. The journey under
     * UI automation opens a browser and clicks the whole PO → invoice → GRN →
     * bill flow through the screen. Same business flow, opposite ends — which
     * was not said anywhere, so the two buttons looked like a duplicate.
     */
    const sibling = $("#po-sibling");
    if (sibling) {
      sibling.innerHTML =
        "Want to <b>watch</b> it instead? <b>UI automation</b> has the same flow end to end — " +
        "<b>PO → Bill (3-way match)</b> — clicked through a real browser. This button is the API one: " +
        "faster, headless, and it only creates the purchase order.";
      sibling.hidden = false;
    }
    setSingleRunner(true);
  } catch {
    bar.hidden = true;
    setSingleRunner(false);
  }
}

/**
 * The PO -> Bill chain: is it here, and what will it do?
 *
 * Shown always, not per client: it points at its own tenant through its own
 * .env, so the account picked in this UI has nothing to do with it. Saying so
 * on the button is the only way that is not confusing.
 */
async function loadChain() {
  const bar = $("#drawer-chain");
  const what = $("#chain-what");
  const btn = $("#chain-run");
  if (!bar || !what || !btn) return;
  try {
    const info = await (await fetch("/api/po-to-bill")).json();
    setNavCount("chain", info.ready ? info.steps : 0);
    bar.hidden = false;
    const meta = $("#chain-meta");
    if (meta) meta.textContent = info.ready ? `${info.steps} API steps` : "not ready";
    if (!info.ready) {
      what.innerHTML = `<b class="po-dead">Not ready</b> — ${esc(info.reason || "the chain is unavailable")}.`;
      btn.disabled = true;
      return;
    }
    btn.disabled = false;
    const p = info.plan || {};
    what.innerHTML =
      `${info.steps} steps: purchase order → GRN → invoice → bill, each asserting status, response time, ` +
      `schema and data. <b>Creates real records</b> on ${esc(p.BASE_URL || "its own tenant")}` +
      (p.PO_QTY ? ` — PO qty ${esc(p.PO_QTY)} × ${esc(p.PO_UNIT_PRICE || "?")}, GRN received ${esc(p.GRN_RECEIVED_QTY || "?")}, invoice qty ${esc(p.INVOICE_QTY || "?")}` : "") +
      `. Change those in <code>po-to-bill/.env</code>.`;
  } catch {
    bar.hidden = true;
  }
}

/** Run the chain, streaming its steps as rows like every other run. */
/**
 * Why the chain stopped, rather than how many steps went red.
 *
 * Each step consumes the record the one before it created, so a refusal at
 * step one skips the other twenty. "1 failed · 20 skipped" reads as twenty-one
 * separate problems; it is one, and the fix is at the step that broke.
 */
function chainVerdict(summary) {
  if (!summary) return "PO → Bill finished.";
  if (!summary.failed && !summary.skipped)
    return `All ${summary.total} purchase-to-bill steps passed.`;

  const at = checkRows.findIndex((r) => !r.pass);
  if (at < 0) return `${summary.passed} of ${summary.total} purchase-to-bill steps passed.`;

  const step = checkRows[at];
  const after = summary.total - at - 1;
  const auth = /\b40[13]\b|unauthori[sz]ed|forbidden/i.test(step.verdict ?? "");
  return (
    `Stopped at step ${at + 1} of ${summary.total} — ${step.scenario}: ${step.verdict}.` +
    (after > 0
      ? ` The remaining ${after} step${after === 1 ? "" : "s"} need the record it would have created, so ${after === 1 ? "it" : "they"} never ran.`
      : "") +
    (auth ? " The chain's own token was refused — refresh ACCESS_TOKEN_RAW in po-to-bill/.env." : "")
  );
}

function runChainFlow() {
  goToRun("the purchase-to-bill chain");
  const btn = $("#chain-run");
  const con = $("#ui-console");
  showRunLog();
  con.innerHTML = "";
  const write = (text, cls) => {
    con.appendChild(el("div", cls || "", esc(text)));
    con.scrollTop = con.scrollHeight;
  };

  checkRows = [];
  renderAutomation();
  btn.disabled = true;
  btn.textContent = "▶ Running…";
  $("#auto-summary").textContent = "running the purchase-to-bill chain…";

  const es = new EventSource("/api/po-to-bill/run");
  watchStreamEnd(es);
  const seen = new Map();
  const rowFor = (step) => ({
    id: `PB-${String(seen.size + 1).padStart(2, "0")}`,
    category: "PO → Bill",
    type: "functional",
    module: "3-way match",
    scenario: step.title,
    pass: step.status === "passed",
    rightLabel: `${step.ms}ms`,
    verdict:
      step.status === "passed"
        ? `passed in ${step.ms}ms`
        : `${step.status} — ${step.error || "see the log"}`,
    noRerun: true,
  });

  es.addEventListener("start", (ev) => write(JSON.parse(ev.data).line, "cmd"));
  es.addEventListener("log", (ev) => write(JSON.parse(ev.data).line));
  es.addEventListener("run-error", (ev) => write("✗ " + (JSON.parse(ev.data).line || "run error"), "bad"));
  es.addEventListener("step", (ev) => {
    const { step } = JSON.parse(ev.data);
    // The list reporter and the JSON report both describe the same step; keep
    // one row per title so the final, exact result replaces the streamed one.
    const row = rowFor(step);
    if (seen.has(step.title)) {
      const at = seen.get(step.title);
      checkRows[at] = { ...checkRows[at], ...row, id: checkRows[at].id };
    } else {
      seen.set(step.title, checkRows.length);
      checkRows.push(row);
    }
    renderAutomation();
    setRunBar(checkRows.length, Math.max(checkRows.length, 21));
  });
  es.addEventListener("done", (ev) => {
    const { exitCode, summary } = JSON.parse(ev.data);
    const verdict = summary
      ? chainVerdict(summary)
      : exitCode === 0
        ? "PO → Bill finished."
        : `PO → Bill stopped (exit ${exitCode}).`;
    $("#auto-summary").textContent = verdict;
    write(exitCode === 0 ? "— finished —" : `— exit ${exitCode} —`, exitCode === 0 ? "ok" : "bad");
    if (exitCode !== 0) write(verdict, "bad");
    es.close();
    runFinished();
    btn.disabled = false;
    btn.textContent = "▶ Run PO → Bill";
    showReportsFor({
      label: "This PO → Bill run:",
      testLabel: "📊 Chain report",
      testHref: "/api/po-to-bill/report",
      bugHref: "/api/bug-report",
    });
    if (summary) {
      showRunComplete({
        total: summary.total,
        passed: summary.passed,
        failed: summary.failed,
        skipped: summary.skipped,
        // The chain runs on its own tenant, so the selected client's name has
        // nothing to do with it, and the verdict says what actually happened.
        subtitle: verdict,
        reportNote:
          "The chain report lists all 21 steps with the request, the reply and the time each took.",
      });
    }
  });
}

/** Run the API suite's PO flow, streaming its output into the console box. */
function runPoAutomation() {
  goToRun("PO automation");
  const btn = $("#po-run");
  const con = $("#ui-console");
  showRunLog();
  con.innerHTML = "";
  const write = (text, cls) => {
    con.appendChild(el("div", cls || "", esc(text)));
    con.scrollTop = con.scrollHeight;
  };

  btn.disabled = true;
  btn.textContent = "▶ Running…";
  $("#auto-summary").textContent = "creating a purchase order…";

  // Always submitted for approval: a purchase order that stops after its line
  // items is not a purchase order anyone raised, and the toggle only offered a
  // way to run half the flow by accident.
  const qs = new URLSearchParams({ c: String(currentClient) });
  const es = new EventSource(`/api/po-run?${qs}`);
  watchStreamEnd(es);

  // The server mints an id for the run and stamps it on every event, so the
  // reports offered at the end can be this run's rather than the last one's.
  let poRunId = null;
  es.addEventListener("start", (ev) => write(JSON.parse(ev.data).line, "cmd"));
  // Rows in the run panel, the same as every other run in the platform. Live
  // ones come from the "✓ / ✗" lines the suite prints as it goes; when it
  // finishes, the report's own step list replaces them with exact figures.
  checkRows = [];
  renderAutomation();
  let step = 0;

  /**
   * Close off the phase that was running when the next one started.
   *
   * Most phases say nothing about themselves — they make their calls and move
   * on — so a row left spinning would spin for the rest of the run. It ran;
   * whether it was right is the report's answer, and "≈" says exactly that
   * rather than guessing a tick.
   */
  const resolvePhase = () => {
    const open = checkRows[checkRows.length - 1];
    if (!open || !open._running) return;
    open._running = false;
    open.inconclusive = true;
    open.verdict = "ran — the report below says what its calls did";
  };

  let sawAuthFailure = false;
  es.addEventListener("log", (ev) => {
    const data = JSON.parse(ev.data);
    const line = data.line;
    if (data.runId) poRunId = data.runId;
    write(line);

    /**
     * A phase starting is a row appearing, spinning, straight away.
     *
     * The suite announces each phase with "▸ <name>" as it begins. Before it
     * did, the only rows the log could produce were its ✓/✗ lines — a run
     * could spend a minute resolving relations and creating records with an
     * empty panel in front of it, then fill in all at once at the end. A row
     * that is on screen while its phase runs is the difference between
     * watching a run and being shown a result.
     */
    const phase = line.match(/^\s*▸\s+(.+)$/);
    if (phase) {
      resolvePhase();
      step += 1;
      checkRows.push({
        id: `PO-${String(step).padStart(2, "0")}`,
        category: "PO flow",
        type: "functional",
        module: "PO automation",
        scenario: phase[1].trim(),
        pass: false,
        _running: true,
        verdict: "running…",
        rightLabel: "",
        noRerun: true,
      });
      renderAutomation();
      setRunBar(step, Math.max(step, 12));
      return;
    }

    const mark = line.match(/^\s*(✓|✗)\s*(.+)$/);
    if (mark) {
      // A verdict belongs to the phase that is running, when there is one.
      const open = checkRows[checkRows.length - 1];
      if (open && open._running) {
        open._running = false;
        open._verdictSeen = true;
        open.pass = mark[1] === "✓";
        open.verdict = mark[2].trim();
        renderAutomation();
        return;
      }
      step += 1;
      checkRows.push({
        id: `PO-${String(step).padStart(2, "0")}`,
        category: "PO flow",
        type: "functional",
        module: "PO automation",
        scenario: mark[2].trim(),
        pass: mark[1] === "✓",
        verdict: mark[1] === "✓" ? "done" : "this step failed — see the log",
        rightLabel: "",
        noRerun: true,
      });
      renderAutomation();
      setRunBar(step, Math.max(step, 12));
    }
    /**
     * Two different refusals, told apart.
     *
     * A 401 is a dead token. A "not authorized" — which this API returns as a
     * 422 with code 455, not a 403 — is a live login that may not do this.
     * They need opposite fixes, and reading either as "the PO API is broken"
     * sends someone to the wrong repository: in both cases nothing was tested
     * at all.
     */
    if (!sawAuthFailure && /401|api_error_auth_failed|authentication failed/i.test(line)) {
      sawAuthFailure = true;
      const banner = el(
        "div",
        "bad",
        "⚠ The account's token has expired — every call is being refused (401). Refresh it in the API suite's .env and run again.",
      );
      con.insertBefore(banner, con.firstChild);
    } else if (!sawAuthFailure && /not authorized|code.{0,3}455/i.test(line)) {
      sawAuthFailure = true;
      const banner = el(
        "div",
        "bad",
        "⚠ The login works, but this account is not allowed to read the data this flow needs " +
          "(“you are not authorized to perform this action”). Nothing below was tested — the calls " +
          "were refused before the purchase order was judged. Give this login access to the " +
          "purchase-order datasources, or put a token for one that has it in the API suite's .env.",
      );
      con.insertBefore(banner, con.firstChild);
    }
  });
  // The authoritative step list arrives at the end, with call counts and
  // timings the log does not carry. Collect it, then swap the live rows for it.
  const finalRows = [];
  es.addEventListener("step", (ev) => {
    const { step: s } = JSON.parse(ev.data);
    finalRows.push({
      id: `PO-${String(finalRows.length + 1).padStart(2, "0")}`,
      category: "PO flow",
      type: "functional",
      module: "PO automation",
      scenario: s.title,
      pass: s.status === "passed",
      rightLabel: `${s.calls} call${s.calls === 1 ? "" : "s"}`,
      verdict:
        `${s.status === "passed" ? "passed" : "failed"} · ${s.calls} API call${s.calls === 1 ? "" : "s"}` +
        `${s.failed ? `, ${s.failed} of them refused` : ""} · ${s.ms}ms`,
      noRerun: true,
    });
  });
  es.addEventListener("done", (ev) => {
    const { exitCode, summary, runId } = JSON.parse(ev.data);
    if (runId) poRunId = runId;
    // Nothing is left spinning once the run is over.
    resolvePhase();
    renderAutomation();
    /**
     * The report's rows replace the live ones ONLY when the run wrote a
     * report. A run that stopped early writes none, and the live ✓/✗ rows the
     * log produced are then the only honest account of how far it got —
     * they used to be swapped for the previous run's steps, which is how a
     * run that ended "stopped, exit 1" showed twelve green ticks.
     */
    if (finalRows.length) {
      checkRows = finalRows;
      renderAutomation();
      setRunBar(finalRows.length, finalRows.length);
    }
    if (summary) {
      $("#auto-summary").textContent =
        `PO run: ${summary.steps} step(s), ${summary.calls} API call(s)` +
        (summary.failedCalls ? ` · ${summary.failedCalls} failed` : "");
    } else {
      $("#auto-summary").textContent = exitCode === 0 ? "PO run finished" : `PO run stopped (exit ${exitCode})`;
    }
    write(exitCode === 0 ? "— finished —" : `— stopped, exit ${exitCode} —`, exitCode === 0 ? "ok" : "bad");
    es.close();
    runFinished();
    btn.disabled = false;
    btn.textContent = "▶ Run PO automation";

    // A PO run has its own report — every phase, every call, and the curl for
    // it — so point at that rather than at the API case report.
    const scope = poRunId ? `?run=${encodeURIComponent(poRunId)}` : "";
    showReportsFor({
      label: "This PO run:",
      testLabel: "📊 PO run report",
      testHref: `/api/po-report${scope}`,
      // This run's refusals, not the platform's standing sheet.
      bugHref: poRunId ? `/api/bug-report${scope}` : bugHrefForSelection(),
    });
    // Count what is actually on screen: the report's rows when there are any,
    // the log's rows when the run stopped before writing one.
    const rows = finalRows.length ? finalRows : checkRows;
    const failedSteps = rows.filter((r) => !r.pass).length;
    showRunComplete({
      total: rows.length,
      passed: rows.length - failedSteps,
      failed: failedSteps || (exitCode === 0 ? 0 : 1),
    });
  });
  es.onerror = () => {
    // A closed stream after "done" is normal; before it, the run died.
    if (btn.disabled) {
      write("the run stopped unexpectedly — see the platform's terminal for details", "bad");
      es.close();
    runFinished();
      btn.disabled = false;
      btn.textContent = "▶ Run PO automation";
    }
  };
}

async function loadUiFlows() {
  const box = $("#ui-tree");
  try {
    const { flows, limits, erfxMode, boqAllowed, note } = await (
      await fetch("/api/ui-flows?c=" + currentClient)
    ).json();
    uiFlows = flows;
    setNavCount("ui", flows.length);
    uiLimits = limits;
    uiBoqAllowed = boqAllowed ?? null;

    // No journeys for this account: say why, once, where the list would be.
    const uiNote = $("#ui-note");
    if (uiNote) {
      if (note) {
        uiNote.textContent = note;
        uiNote.hidden = false;
      } else {
        uiNote.hidden = true;
      }
    }

    // Show this client's own line-item ceilings and pre-fill sensible values.
    const nonBoq = limits?.non_boq, boq = limits?.boq;
    $("#li-normal-max").textContent = nonBoq ? `max ${nonBoq}` : "";
    $("#li-boq-max").textContent = boq ? `max ${boq}` : "";
    if (nonBoq) $("#li-normal").max = nonBoq;
    if (boq) {
      $("#li-boq").max = boq;
      $("#li-boq").value = Math.min(10, boq);
    }
    // The company's mode decides which journeys are meaningful at all, so it
    // belongs next to the journey list rather than being dropped.
    const mode = $("#ui-mode");
    if (mode) {
      mode.textContent =
        (erfxMode === true ? "eRFX mode" : erfxMode === false ? "non-eRFX mode" : "mode unknown") +
        (boqAllowed === true ? " · BOQ on" : boqAllowed === false ? " · BOQ off" : "") +
        ` · ${flows.length} journey${flows.length === 1 ? "" : "s"} built`;
    }
  } catch {
    box.innerHTML = "";
    box.appendChild(el("div", "empty", "Could not load browser journeys."));
  }
}

/**
 * The tree row for a journey — where its run reports progress.
 *
 * The journeys used to appear twice: once as this tree, and once as a flat grid
 * of buttons where a single click — indistinguishable from ticking something —
 * launched a real headed browser run. One list, and running is deliberate.
 */
function uiRowFor(key) {
  return document.querySelector(`.submodule[data-flow="${CSS.escape(key)}"]`);
}

/** Trigger one journey and stream Playwright's output into the console box. */
/**
 * Opens THIS run's own report — pass or fail, the moment it ends.
 *
 * Always updates the report-bar link (so the run stays reachable by click
 * even when a popup blocker eats the automatic tab, or the reader wants to
 * come back to it later); only opens a tab when asked to.
 */
function openJourneyReport(runId, { auto = true } = {}) {
  const url = `/api/ui-report?run=${encodeURIComponent(runId)}`;
  showReportsFor({
    label: "This journey:",
    testLabel: "📊 UI run report",
    testHref: url,
    // This journey's own findings, not the all-time sheet.
    //
    // It used to ask `bugHrefForSelection()`, which reads the API tree's
    // tick-boxes — empty during a browser journey — so the button fell through
    // to the unscoped sheet and opened the hand-raised PO list right after a PR
    // journey. The server resolves this id against the journey's findings.
    bugHref: `/api/bug-report?run=${encodeURIComponent(runId)}`,
  });
  if (auto) window.open(url, "_blank", "noopener");
}

function runUiJourney(flow, onDone, opts = {}) {
  if (uiRunning) {
    uiRunning.close();
    uiRunning = null;
  }
  document
    .querySelectorAll(".submodule.running, .submodule.ok, .submodule.bad")
    .forEach((r) => r.classList.remove("running", "ok", "bad"));
  const btn = uiRowFor(flow.key) ?? el("div");

  const con = $("#ui-console");
  showRunLog();
  con.innerHTML = "";
  resetUiSteps();
  showRunLog({ collapsed: true });
  let rawLines = 0;
  const write = (text, cls) => {
    const line = el("div", cls || "", esc(text));
    con.appendChild(line);
    con.scrollTop = con.scrollHeight;
    rawLines++;
    const n = $("#ui-raw-n");
    if (n) n.textContent = `${rawLines} line${rawLines === 1 ? "" : "s"}`;
  };

  const qs = new URLSearchParams({ c: String(currentClient), flow: flow.key });
  // Only send the count the journey actually uses.
  if (flow.usesLineItems) {
    if (flow.boq) qs.set("boqItems", $("#li-boq").value || "1");
    else qs.set("lineItems", $("#li-normal").value || "1");
  }
  if (!$("#ui-headed").checked) qs.set("headed", "0");

  const es = new EventSource(`/api/ui-run?${qs}`);
  // A stream that dies mid-journey resolves the sequence too, or the run after
  // it would never start and the panel would wait on a journey that is gone.
  watchStreamEnd(es, () => {
    btn.classList.remove("running");
    uiRunning = null;
    onDone?.(1);
  });
  uiRunning = es;
  es.addEventListener("start", (ev) => write(JSON.parse(ev.data).line, "cmd"));
  onQueued(es, write);
  es.addEventListener("note", (ev) => write("⚠ " + JSON.parse(ev.data).line, "note"));
  es.addEventListener("log", (ev) => {
    const { line } = JSON.parse(ev.data);
    // The raw log keeps everything a reader can fall back to.
    write(line);
  });
  // The server parses its own output once (src/ui/journeySteps.ts) and sends
  // the result here — reusing that instead of re-parsing the raw line means
  // the live view and the report opened below can never disagree about what
  // happened or where the run stopped.
  es.addEventListener("step", (ev) => pushJourneyStep(JSON.parse(ev.data)));
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
  es.addEventListener("run-error", (ev) => {
    // A plain connection error has no data payload; a real spawn failure does,
    // and carries the run id so its report — empty, but honest about why — can
    // still be opened rather than leaving the reader with nothing to click.
    let msg = "run error";
    let runId = null;
    try {
      const data = JSON.parse(ev.data);
      msg = data.line || msg;
      runId = data.runId || null;
    } catch {}
    write("✗ " + msg, "bad");
    btn.classList.remove("running");
    btn.classList.add("bad");
    es.close();
    if (!opts.partOfSequence) runFinished();
    uiRunning = null;
    const showsThisOne = opts.autoOpen !== false;
    if (runId) openJourneyReport(runId, { auto: showsThisOne });
    // Told, not left to notice the tab stopped spinning on its own.
    if (showsThisOne) showRunComplete({ total: 1, passed: 0, failed: 1, error: msg });
    onDone?.(1);
  });
  es.addEventListener("done", (ev) => {
    const { exitCode: code, runId } = JSON.parse(ev.data);
    write(code === 0 ? "✓ journey passed" : `✗ journey failed (exit ${code})`, code === 0 ? "ok" : "bad");
    btn.classList.remove("running");
    btn.classList.add(code === 0 ? "ok" : "bad");
    es.close();
    if (!opts.partOfSequence) runFinished();
    uiRunning = null;
    loadFindings();
    // The report the moment Chromium stops — pass or fail, this run's own
    // page: what it did, and (on a failure) exactly where it stopped.
    const showsThisOne = opts.autoOpen !== false;
    if (runId) openJourneyReport(runId, { auto: showsThisOne });
    // A tab opening quietly in the background is easy to miss — the browser
    // window that was just watched is still the thing on screen. This is the
    // unmistakable "it's done" signal, on the page the reader is looking at.
    if (showsThisOne) {
      showRunComplete({
        total: 1,
        passed: code === 0 ? 1 : 0,
        failed: code === 0 ? 0 : 1,
        kind: "journey",
        // #modal-sub is set via textContent below, not innerHTML — plain text,
        // not escaped markup, or an "&" in a journey's own label would come
        // out as the literal characters "&amp;".
        subtitle: `${flow.label || flow.key} — ${elapsedInWords(Date.now() - runStartedAt)}.`,
        took: elapsedInWords(Date.now() - runStartedAt),
        steps: uiSteps.length,
        reportNote: "The report above has every step this journey took, in order — and, on a break, exactly where it stopped.",
      });
    }
    onDone?.(code);
  });
}

// ── validation suites panel ───────────────────────────────────────────────
let allSuites = [];

// ── run (SSE) ──
function run() {
  goToRun("your instruction");
  const q = $("#request").value.trim();
  const c = currentClient;
  execData = null;
  designedCases = null;
  checkRows = [];
  const runBtn = $("#ai-btn");
  if (runBtn) runBtn.disabled = true;
  $("#status").textContent = "running…";
  $("#timeline").innerHTML = "";
  agentCards.clear();
  $("#automation").innerHTML = `<div class="empty">Building the automation suite…</div>`;
  $("#auto-summary").textContent = "";
  if ($("#report")) $("#report").innerHTML = "";

  const es = new EventSource(`/api/run?c=${c}&q=${encodeURIComponent(q)}`);
  watchStreamEnd(es);
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
    if (e.status === "start") current = openAgentCard(e);
    else if (e.status === "reasoning") {
      const card = cardFor(e.agent) ?? current;
      if (card) card.querySelector(".agent-title").textContent = e.title;
    }
    else if (e.status === "done") finishAgentCard(cardFor(e.agent) ?? current, e);
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
    closeOpenAgentCards();
    runFinished();
    if (runBtn) runBtn.disabled = false;
    $("#status").textContent = "done ✓ · saved to history";
    loadHistory();
  });
  es.addEventListener("fatal", (ev) => {
    const { message } = JSON.parse(ev.data);
    es.close();
    closeOpenAgentCards();
    runFinished();
    if (runBtn) runBtn.disabled = false;
    $("#status").textContent = "error";
    if ($("#report")) $("#report").innerHTML = `<div class="finding high"><div class="finding-title">Run failed</div><div class="agent-reason">${esc(message)}</div></div>`;
  });
}


/**
 * EVERY AGENT'S CARD CLOSES — its own, not whichever started last.
 *
 * The timeline tracked one "current" card, so a `done` closed whatever had
 * most recently started. That is fine while agents run strictly one at a time
 * and wrong the moment they nest, which the System agent always does: it opens
 * first, says which provider is serving, and closes LAST with "Run complete".
 * By then `current` pointed at the Reporter, so the Reporter's card was
 * finished twice and System's spun forever — a finished run with a spinner
 * still going in it, which reads as a run that never ended.
 *
 * Keyed by agent, a card is closed by the agent it belongs to.
 */
const agentCards = new Map();

function openAgentCard(e) {
  const card = addAgentCard(e);
  agentCards.set(e.agent, card);
  return card;
}

function cardFor(agent) {
  return agentCards.get(agent) ?? null;
}

/**
 * Nothing is left spinning when a run is over.
 *
 * A card can be orphaned by a stream that drops, or by an agent that starts
 * and never reports back. The run has ended either way, and a spinner that
 * outlives it is a lie about what is happening.
 */
function closeOpenAgentCards() {
  for (const card of document.querySelectorAll("#timeline .agent.running")) {
    card.classList.remove("running");
    card.classList.add("done");
  }
  agentCards.clear();
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
      /**
       * A run's request can be eleven feature ids long, which turned this
       * panel into a wall of identifiers. Name the first, count the rest.
       */
      const features = r.request?.match(/^\s*features:\s*(.+)$/i)?.[1];
      const list = features ? features.split(",").map((f) => f.trim()).filter(Boolean) : null;
      const title = list
        ? list.length === 1
          ? list[0]
          : `${list[0]} + ${list.length - 1} more`
        : r.request;
      /**
       * "clean" has to mean something ran and nothing broke.
       *
       * Every feature run used to read "clean · 0✓ 0✗", because the counts came
       * from an agent report these runs never write. A run that recorded
       * nothing is not clean — it is empty, and says so.
       */
      const ran = r.checks ?? r.passed + r.failed;
      const tag = r.findings
        ? `<span class="tag find">${r.findings} finding${r.findings > 1 ? "s" : ""}</span>`
        : !ran
          ? `<span class="tag none">nothing ran</span>`
          : r.failed
            ? `<span class="tag find">${r.failed} failed</span>`
            : `<span class="tag clean">clean</span>`;
      const counts = ran
        ? `<span>${r.passed}✓ ${r.failed}✗${r.inconclusive ? ` ${r.inconclusive}≈` : ""}</span>`
        : "";
      item.innerHTML = `
        <div class="run-req" title="${esc(r.request)}">${
          list ? `<span class="run-kind">tests</span>` : `<span class="run-kind ai">AI</span>`
        }${esc(title)}</div>
        <div class="run-meta">${esc(r.companyName ?? r.id)} · ${esc(when)} ${tag}
          ${counts}</div>
        <button class="run-del" title="Remove this run from the history and from every report built on it">✕</button>`;
      item.addEventListener("click", () => openRun(r.id, item));
      /**
       * Deleting is confirmed, because a run is a record of something that
       * really happened and there is no undo. The click is stopped from
       * reaching the row so asking to remove a run never also opens it.
       */
      item.querySelector(".run-del").addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (!confirm(`Remove this run?\n\n${title}\n${when}\n\nIts reports and its rows in the bug sheet go with it. This cannot be undone.`)) return;
        try {
          await fetch(`/api/run-delete?run=${encodeURIComponent(r.id)}`, { method: "POST" });
        } catch {
          /* reported by the reload below: the row will still be there */
        }
        loadHistory();
      });
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
    if ($("#report")) $("#report").innerHTML = "";
  }
}

// Rebuild the agent timeline instantly from a saved event trace.
function replayTrace(events) {
  const tl = $("#timeline");
  tl.innerHTML = "";
  let current = null;
  for (const e of events || []) {
    if (e.agent === "Check") continue; // checks live in the automation panel
    if (e.status === "start") current = openAgentCard(e);
    else if (e.status === "reasoning") {
      const card = cardFor(e.agent) ?? current;
      if (card) card.querySelector(".agent-title").textContent = e.title;
    }
    else if (e.status === "done") finishAgentCard(cardFor(e.agent) ?? current, e);
    if (e.agent === "Test-designer" && e.status === "done" && e.data?.cases) designedCases = e.data.cases;
  }
}

// ── automation panel (live check results) ──
/**
 * The live list, drawn once and then kept up to date.
 *
 * It used to rebuild every row on every check event: with a few hundred checks
 * streaming in that is a full teardown per event — the list flickered, the
 * scroll jumped, and any row the reader had opened snapped shut under them.
 * Now each check owns its row: new ones animate in, changed ones update in
 * place, and everything else is left alone.
 */
const rowNodes = new Map();
const TYPE_CLASS = { functional: "fn", "data-validation": "dv", edge: "ed", "non-functional": "nf" };

/** Everything a row displays, so an unchanged check costs nothing to re-render. */
function rowSignature(c) {
  return [
    c._rerunning ? "run" : c.inconclusive ? "inc" : c.pass ? "ok" : "bad",
    c.rightLabel ?? c.httpStatus ?? "err",
    c.scenario, c.category, c.module, c.field, c.expected, c.inputSummary, c.verdict,
  ].join("\u0001");
}

function paintRow(node, c) {
  const is5xx = (c.httpStatus || 0) >= 500;
  const running = c._rerunning || c._running;
  const state = running ? "run" : c.inconclusive ? "inc" : c.pass ? "ok" : "bad";
  const was = node.dataset.state;
  // Only the state class changes. Rewriting className wholesale also wiped the
  // transient ones — `enter` vanished before its animation could start, and a
  // row the reader had opened would have closed itself.
  node.classList.remove("ok", "bad", "inc", "run");
  node.classList.add(state);
  node.dataset.state = state;

  node.querySelector(".chk-mark").textContent = running ? "⟳" : c.inconclusive ? "≈" : c.pass ? "✓" : "✗";
  node.querySelector(".chk-id").textContent = c.id;
  const type = node.querySelector(".chk-type");
  type.className = "chk-type " + (TYPE_CLASS[c.type] ?? "");
  type.textContent = c.category;
  node.querySelector(".chk-scn").innerHTML =
    (c.module === "AI-generated"
      ? '<span class="ai-tag" title="written by the AI for your request">AI</span>'
      : "") + esc(c.scenario);
  const http = node.querySelector(".chk-http");
  http.className = "chk-http" + (is5xx ? " err5" : "");
  http.textContent = running ? "…" : (c.rightLabel ?? c.httpStatus ?? "err");

  const detail = node.querySelector(".chk-detail");
  detail.innerHTML = `<b>${esc(c.module)}${c.field ? " · " + esc(c.field) : ""}</b>${
    c.expected ? ` — expected to <b>${esc(c.expected)}</b>` : ""
  }${c.inputSummary ? `<br>input: <span class="mono">${esc(c.inputSummary)}</span>` : ""}<br>${esc(c.verdict)}<br>`;
  // A PO step is one phase of one document — there is nothing to re-run on its
  // own, so the button only appears for library checks.
  if (c.flowId && !c.noRerun) {
    const rerun = el("button", "chk-rerun", "↻ Re-run this check live");
    rerun.addEventListener("click", (ev) => { ev.stopPropagation(); rerunCheck(c.flowId, c.id); });
    detail.appendChild(rerun);
  }

  // A verdict arriving is the one moment worth animating: it is the answer.
  if (was && was !== state) {
    node.classList.remove("settled");
    void node.offsetWidth;            // restart the animation rather than skip it
    node.classList.add("settled");
  }
}

function buildRow(c) {
  const node = el("div", "chk enter");
  node.innerHTML =
    '<span class="chk-mark"></span><span class="chk-id"></span>' +
    '<span class="chk-type"></span><span class="chk-scn"></span><span class="chk-http"></span>';
  node.appendChild(el("div", "chk-detail"));
  node.addEventListener("click", () => node.classList.toggle("open"));
  paintRow(node, c);
  // Cleared on animationend, and on a timer as well: a row whose entrance is
  // suppressed (reduced motion) never fires the event, and a stuck `enter`
  // class would leave it half-faded.
  node.addEventListener("animationend", () => node.classList.remove("enter"), { once: true });
  setTimeout(() => node.classList.remove("enter"), 400);
  return node;
}


/**
 * Group the failures by what the APP did, which is the cause a reader needs.
 *
 * Deliberately coarse: the point is to turn "nine things are broken" into
 * "one endpoint does not validate, and one input crashes it". Finer grouping
 * belongs in the bug sheet, which has the evidence to do it properly.
 */
function groupFailureCauses(rows) {
  const buckets = new Map();
  const add = (key, label) => {
    const hit = buckets.get(key);
    if (hit) hit.count += 1;
    else buckets.set(key, { label, count: 1 });
  };
  for (const c of rows) {
    if (c.pass || c.inconclusive) continue;
    const v = String(c.verdict ?? "");
    if ((c.httpStatus || 0) >= 500) add("5xx", "the app returned a server error");
    else if (/^ACCEPTED input/i.test(v)) add("accepted", "the app accepted input it should have refused");
    else if (/^REJECTED a valid/i.test(v)) add("rejected", "the app refused input it should have accepted");
    else add("other", "something else went wrong");
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count);
}

/**
 * A run the API refused outright.
 *
 * When the account's token has expired every check comes back 401, and the
 * platform honestly refuses to call any of them pass or fail — which leaves a
 * report reading "0 worked, 0 broken" and looks like the page is empty. It is
 * not empty; nothing was tested, and that needs saying in one line.
 */
function authRefusal(rows) {
  const refused = rows.filter((c) => c.httpStatus === 401 || c.httpStatus === 403);
  if (!rows.length || refused.length !== rows.length) return null;
  return (
    `Every one of these ${rows.length} check${rows.length === 1 ? "" : "s"} was refused before it reached ` +
    `Procol (HTTP ${refused[0].httpStatus} — “${refused[0].message || "not authorized"}”). ` +
    `Nothing was tested: the access token for ${currentClientName || "this account"} has expired or been revoked. ` +
    `Refresh it and run again.`
  );
}

function renderAutomation() {
  const box = $("#automation");
  const total = checkRows.length;
  const passed = checkRows.filter((c) => c.pass).length;
  // Inconclusive checks are neither passes nor bugs — count them separately so
  // the failure number always means "something is actually wrong".
  const inconc = checkRows.filter((c) => c.inconclusive).length;
  const failed = total - passed - inconc;
  const serverErr = checkRows.filter((c) => !c.pass && (c.httpStatus || 0) >= 500).length;
  // How far through, first — it is the question being asked while it runs.
  const planned = Math.max(runPlanned, total);
  const finished = total >= planned;
  /**
   * A plan run is made of STEPS, and a step that has not run yet is waiting,
   * not inconclusive. Calling both "checks" and "couldn't tell" described a
   * compiled test case in the vocabulary of a different kind of run.
   */
  const isPlan = total > 0 && checkRows.every((c) => c.category === "plan step");
  const noun = isPlan ? "step" : "check";
  const doneWord = isPlan ? "done" : "passed";
  const unknownWord = isPlan ? "waiting" : "couldn't tell";
  $("#auto-summary").innerHTML = total
    ? `<b>${total}</b> of ${planned} ${noun}${planned === 1 ? "" : "s"}${finished ? "" : " so far"} · ` +
      `<b>${passed}</b> ${doneWord} · <b class="fx">${failed}</b> failed${
        serverErr ? ` · <b class="fx">${serverErr}</b> server-error` : ""
      }${inconc ? ` · <b class="inconc">${inconc}</b> ${unknownWord}` : ""}`
    : "";
  if (total) setRunBar(total, planned);

  // Nothing has run: no filters, and say what would appear here and how.
  const controls = $("#auto-controls");
  if (controls) controls.hidden = total === 0;
  const counts = $("#auto-counts");
  if (counts) counts.textContent = total ? "real requests against UAT — each check is live" : "nothing has run yet";

  if (!total) {
    rowNodes.clear();
    box.innerHTML = runPending
      ? '<div class="starting"><span class="spinner" aria-hidden="true"></span>' +
        `<div><div class="starting-head"><b>Running ${esc(runPending)}…</b>` +
        `<span id="run-elapsed" class="run-elapsed">${elapsedInWords(Date.now() - runStartedAt)}</span></div>` +
        `<span>${
          runPendingHint
            ? esc(runPendingHint)
            : "Reading this company's configuration and building the plan. " +
              "The first case appears here the moment it runs."
        }</span>` +
        // A browser journey narrates itself as it goes; this is that
        // narration's LATEST line, so "no new step for a while" is visible as
        // the clock above still ticking, not as silence that could be a hang.
        `<span id="run-current-step" class="run-current-step"${runCurrentStep ? "" : " hidden"}>${
          runCurrentStep ? `Currently: ${esc(runCurrentStep)}` : ""
        }</span></div></div>`
      : runEmptyNote
        ? `<div class="empty done">${runEmptyNote}</div>`
        : '<div class="empty">This is where a run happens. Tick what you want tested under ' +
          "<b>API automation</b> or <b>UI automation</b> and press its run button, or ask for something " +
          "in the box above — every case then appears here as it runs, with its verdict and the request behind it.</div>";
    if (controls) controls.hidden = true;
    if (counts)
      counts.textContent = runPending
        ? "running…"
        : runEmptyNote
          ? "that run produced no test cases"
          : "nothing has run yet";
    return;
  }
  // The first result has landed: the wait is over.
  runPending = null;

  // Following the run only while the reader is already at the bottom: yanking
  // the scroll while they are reading an earlier failure is worse than lagging.
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
  // Both the idle placeholder and the "starting…" card go once results exist.
  for (const gone of box.querySelectorAll(":scope > .empty, :scope > .starting")) gone.remove();

  const refusal = authRefusal(checkRows);
  let banner = box.querySelector(":scope > .refused");
  if (refusal) {
    if (!banner) {
      banner = el("div", "refused");
      box.prepend(banner);
    }
    banner.innerHTML = `<b>Nothing was tested.</b> ${esc(refusal)}`;
  } else if (banner) {
    banner.remove();
  }

  /**
   * WHY THEY ARE FAILING, ABOVE THE FAILURES.
   *
   * A wall of red rows invites exactly one question, and the panel never
   * answered it: nine reds on this endpoint are not nine problems, they are
   * one endpoint with no validation plus one crash. The bug sheet groups them
   * correctly, but that is a click away and after the fact — by which time
   * someone has already read nine separate failures and drawn the wrong
   * conclusion about how broken things are.
   *
   * Grouped by the app's own behaviour, which is what a cause IS here: it
   * accepted what it should have refused, it refused what it should have
   * taken, or it fell over.
   */
  const causes = groupFailureCauses(checkRows);
  let why = box.querySelector(":scope > .why-failing");
  if (causes.length && failed > 1) {
    if (!why) {
      why = el("div", "why-failing");
      box.prepend(why);
    }
    why.innerHTML =
      `<b>${failed} failing for ${causes.length} reason${causes.length === 1 ? "" : "s"}</b> — ` +
      causes
        .map((c) => `<span class="why-one"><b>${c.count}×</b> ${esc(c.label)}</span>`)
        .join(" · ") +
      `<div class="why-note">One fix per reason, not one per row. The bug sheet groups them the same way.</div>`;
  } else if (why) {
    why.remove();
  }

  const live = new Set(checkRows.map((c) => c.id));
  for (const [id, entry] of rowNodes) {
    if (!live.has(id)) {
      entry.node.remove();
      rowNodes.delete(id);
    }
  }

  let appended = 0;
  for (const c of checkRows) {
    const sig = rowSignature(c);
    let entry = rowNodes.get(c.id);
    if (!entry) {
      const node = buildRow(c);
      box.appendChild(node);
      entry = { node, sig };
      rowNodes.set(c.id, entry);
      appended++;
    } else if (entry.sig !== sig) {
      paintRow(entry.node, c);
      entry.sig = sig;
    }
    // "Failed only" hides rows rather than rebuilding the list.
    entry.node.hidden = checkFilter === "fail" && (c.pass || c.inconclusive);
  }

  const shown = checkRows.filter((c) => !(checkFilter === "fail" && (c.pass || c.inconclusive))).length;
  let note = box.querySelector(".chk-none");
  if (shown === 0) {
    if (!note) {
      note = el("div", "empty chk-none", "No failing checks — nice.");
      box.appendChild(note);
    }
  } else if (note) {
    note.remove();
  }

  if (appended && atBottom) box.scrollTop = box.scrollHeight;
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

// ── report ──
function renderReport(report) {
  const box = $("#report");
  // The panel was removed from the UI; the agent pipeline still runs behind
  // /api/run, so this becomes a no-op rather than an exception.
  if (!box) return;
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
      // "gap / harness / env" meant nothing to anyone who had not read the
      // code. Say what each is, and only mention the ones that exist.
      hint.textContent = [
        `${totals.defects} product bug${totals.defects === 1 ? "" : "s"}`,
        totals.gaps ? `${totals.gaps} test gap${totals.gaps === 1 ? "" : "s"}` : "",
        totals.harness ? `${totals.harness} tool problem${totals.harness === 1 ? "" : "s"}` : "",
        totals.environment ? `${totals.environment} environment issue${totals.environment === 1 ? "" : "s"}` : "",
      ].filter(Boolean).join(" · ");
    box.innerHTML = "";
    if (!groups.length) {
      box.appendChild(el("div", "empty", "No bugs found yet — run some tests and anything that breaks lands here."));
      return;
    }
    /**
     * A side panel is a summary, not the list.
     *
     * Every defect as a full card turned this column into a scroll nobody
     * reads, while the same rows sit in the bug sheet with filters and
     * editable columns. Show the worst few and point at the sheet.
     */
    const SHOWN = 8;
    for (const g of groups.slice(0, SHOWN)) {
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
    if (groups.length > SHOWN) {
      box.appendChild(
        el(
          "div",
          "more-bugs",
          `+ ${groups.length - SHOWN} more · <a href="/api/bug-report" target="_blank" rel="noopener">open the bug sheet</a>`,
        ),
      );
    }
  } catch (e) {
    box.innerHTML = "";
    box.appendChild(el("div", "empty", `Could not load findings: ${esc(e.message)}`));
  }
}

// ── AI: instruction → real browser run ────────────────────────────────────
// The whole point of the platform in one button: you say what you want tested,
// it decides which journey and which parameters, recalls what it already knows
// about that area, drives the real console, and returns a verdict rather than
// an exit code.
function runAiInstruction() {
  // It reads the ask box on the Run view, which is not on screen from here —
  // so an empty box has to say so rather than look like a dead button.
  const q = $("#request").value.trim();
  if (!q) {
    const m = $("#ui-meta");
    if (m) m.textContent = "type what you want tested in the Run box first";
    return;
  }
  goToRun("the journey the AI picks");
  const btn = $("#ui-ai");
  if (btn) btn.disabled = true;
  $("#status").textContent = "thinking…";

  const con = $("#ui-console");
  showRunLog();
  con.innerHTML = "";
  const write = (text, cls) => {
    con.appendChild(el("div", cls || "", esc(text)));
    con.scrollTop = con.scrollHeight;
  };

  const qs = new URLSearchParams({ c: String(currentClient), q });
  if (!$("#ui-headed").checked) qs.set("headed", "0");
  const es = new EventSource(`/api/ai-run?${qs}`);
  watchStreamEnd(es);
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
  onQueued(es, write);
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
    if (btn) btn.disabled = false;
    $("#status").textContent = "";
    es.close();
    runFinished();
    uiRunning = null;
    loadFindings();
  };
  es.addEventListener("done", (ev) => {
    const code = JSON.parse(ev.data).exitCode;
    finish(code === 0 ? "✓ journey passed" : `✗ journey failed (exit ${code})`, code === 0 ? "ok" : "bad");
  });
  es.addEventListener("run-error", (ev) => {
    let msg = "run error";
    try {
      msg = JSON.parse(ev.data).line || msg;
    } catch {}
    finish("✗ " + msg, "bad");
  });
}


/**
 * A plan step as a sentence rather than a function name.
 *
 * The compiler speaks in verbs — `open_create`, `add_line_items {"count":1}` —
 * which is right for a plan and wrong for a row someone is reading to find out
 * what happened. The arguments carry the specifics, so they stay.
 */
function planStepInWords(step) {
  const name = String(step.step ?? "").replace(/_/g, " ");
  const args = step.args && Object.keys(step.args).length
    ? " " + Object.entries(step.args).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ")
    : "";
  return (name.charAt(0).toUpperCase() + name.slice(1) + args).trim();
}

// ── Compile a written test case, then run exactly those steps ─────────────
// The difference from the instruction button: that one picks a pre-built
// journey, this one builds a journey out of your words. The plan is shown
// before it runs, because a plan you cannot inspect is a plan you cannot trust.
function runTestCase(dryRun) {
  goToRun(dryRun ? "your test case (plan only)" : "your test case");
  const q = $("#request").value.trim();
  if (!q) return;
  const btn = dryRun ? $("#plan-dry") : $("#plan-btn");
  btn.disabled = true;
  $("#status").textContent = dryRun ? "compiling…" : "compiling & running…";

  const con = $("#ui-console");
  showRunLog();
  con.innerHTML = "";
  const write = (text, cls) => {
    con.appendChild(el("div", cls || "", esc(text)));
    con.scrollTop = con.scrollHeight;
  };

  const qs = new URLSearchParams({ c: String(currentClient), q });
  if (dryRun) qs.set("dry", "1");
  if (!$("#ui-headed").checked) qs.set("headed", "0");
  else if ($("#plan-demo")?.checked) {
    qs.set("login", "1");
    qs.set("slowmo", "250");
  }
  const es = new EventSource(`/api/plan-run?${qs}`);
  watchStreamEnd(es);
  uiRunning = es;

  es.addEventListener("stage", (ev) => write("› " + JSON.parse(ev.data).line, "cmd"));
  onQueued(es, write);
  es.addEventListener("plan", (ev) => {
    const p = JSON.parse(ev.data);
    /**
     * THE PLAN BECOMES ROWS, the same as every other run.
     *
     * This path had the richest data in the platform — a named plan, its
     * steps, live progress through them, a status for each one at the end —
     * and showed all of it as terminal text, so the one run you can read
     * step-by-step was the one that looked least like the rest of the
     * platform. The raw output is still underneath for anyone who wants it.
     */
    checkRows = p.steps.map((step, i) => ({
      id: `STEP-${String(i + 1).padStart(2, "0")}`,
      category: "plan step",
      type: "functional",
      module: p.title,
      scenario: planStepInWords(step),
      pass: false,
      inconclusive: true,
      verdict: "not run yet",
      rightLabel: "",
      noRerun: true,
    }));
    renderAutomation();
    setRunBar(0, p.steps.length);
    // These are plan steps, not checks — the generic summary calls everything
    // a check, which is the wrong noun for the one run made of steps.
    $("#auto-summary").textContent = dryRun
      ? `${p.steps.length} step${p.steps.length === 1 ? "" : "s"} compiled — not run`
      : `${p.steps.length} step${p.steps.length === 1 ? "" : "s"} to run`;
    write(`🧪 ${p.title}  (${p.source} · ${p.steps.length} steps)`, "ok");
    if (p.reasoning) write(`   ${p.reasoning}`, "note");
    write(`   grounded in ${p.context.expectations} rule(s) and ${p.context.experience} past finding(s)`, "note");
    p.steps.forEach((s, i) =>
      write(`   ${String(i + 1).padStart(2)}. ${s.step}${s.args && Object.keys(s.args).length ? " " + JSON.stringify(s.args) : ""}`),
    );
    // Repairs are shown, never hidden: a plan the linter had to fix says the
    // compiler needs improving, and that is worth seeing.
    if (p.coverage === "none") write(`   ⛔ cannot test this case yet — no step for: ${(p.gaps || []).join("; ") || "what it checks"}. Not running something else in its place.`, "bad");
    else if (p.coverage === "partial") write(`   ◐ only part of this case can be tested — no step for: ${(p.gaps || []).join("; ")}`, "note");
    for (const w of p.warnings ?? []) if (!/^cannot test|^can only test/.test(w)) write(`   ⚠ ${w}`, "note");
  });
  es.addEventListener("log", (ev) => {
    const l = JSON.parse(ev.data).line;
    // "[plan] 3/22 set_title ✓" — the runner's own progress, which is what
    // moves a row from waiting to running to done while you watch.
    const m = l.match(/\[plan\] (\d+)\/(\d+) (\S+)( ✓| ✗)?/);
    if (m) {
      const at = Number(m[1]) - 1;
      const row = checkRows[at];
      if (row) {
        const mark = (m[4] ?? "").trim();
        row._running = !mark;
        row.inconclusive = !mark;
        row.pass = mark === "✓";
        row.verdict = mark ? (mark === "✓" ? "did what it should" : "this step failed") : "running…";
        renderAutomation();
      }
      setRunBar(Number(m[1]), Number(m[2]));
    }
    if (/^\[plan\]|create-event|erfx/.test(l)) write(l);
  });
  es.addEventListener("plan-result", (ev) => {
    const r = JSON.parse(ev.data);
    // The authoritative account, with a status and a reason per step.
    r.steps.forEach((s, i) => {
      const row = checkRows[i];
      if (!row) return;
      row._running = false;
      row.pass = s.status === "ok";
      row.inconclusive = s.status !== "ok" && s.status !== "failed";
      row.verdict =
        (s.status === "ok" ? "did what it should" : s.status === "failed" ? "this step failed" : "never ran") +
        (s.detail ? ` — ${s.detail}` : "");
    });
    renderAutomation();
    setRunBar(r.steps.length, r.steps.length);
    const okCount = r.steps.filter((s) => s.status === "ok").length;
    $("#auto-summary").textContent =
      `${okCount} of ${r.steps.length} step${r.steps.length === 1 ? "" : "s"} passed`;
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
    runFinished();
    uiRunning = null;
    loadFindings();
  };
  es.addEventListener("done", (ev) => {
    const code = JSON.parse(ev.data).exitCode;
    finish(dryRun ? "✓ compiled (not run)" : code === 0 ? "✓ test case passed" : `✗ test case failed (exit ${code})`, code === 0 ? "ok" : "bad");
  });
  es.addEventListener("run-error", (ev) => {
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
  showRunLog();
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
  onQueued(es, write);
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
    runFinished();
    uiRunning = null;
    loadStuck();
  };
  es.addEventListener("done", (ev) => {
    const code = JSON.parse(ev.data).exitCode;
    finish(code === 0 ? "✓ taught — future runs will use it directly" : "✗ could not teach it from that screen", code === 0 ? "ok" : "bad");
  });
  es.addEventListener("run-error", () => finish("✗ teaching failed", "bad"));
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

/**
 * THE PAGE NOTICES WHEN IT HAS GONE STALE.
 *
 * The server sends its files `no-store`, which keeps a browser from caching
 * them — and does nothing for a tab that has been open since before the last
 * change. That tab goes on running the JavaScript it loaded with, so a fix
 * that is on disk and being served correctly still is not on screen, and the
 * only way to know is to reload on a hunch.
 *
 * So the page asks. When the answer changes it reloads itself — unless a run
 * is in flight, in which case it waits and says so rather than throwing away
 * a run someone is watching.
 */
let loadedBuild = null;

function runInFlight() {
  return !!document.querySelector('.nav-item[data-view="run"].live');
}

function staleBanner() {
  let bar = $("#stale");
  if (bar) return bar;
  bar = el("div", "stale-bar");
  bar.id = "stale";
  bar.innerHTML =
    '<span>The platform has been updated since this page was opened.</span>' +
    '<button type="button">Reload</button>';
  bar.querySelector("button").addEventListener("click", () => location.reload());
  document.body.appendChild(bar);
  return bar;
}

async function checkBuild() {
  try {
    const { version } = await (await fetch("/api/build", { cache: "no-store" })).json();
    if (!version) return;
    if (loadedBuild === null) {
      loadedBuild = version;
      return;
    }
    if (version === loadedBuild) return;
    /**
     * Reload only when nobody is looking.
     *
     * Pulling the page out from under someone mid-sentence is its own kind of
     * broken, and a run in flight would lose the panel it is streaming into.
     * Away from the tab — reading the terminal, most likely — is exactly when
     * a reload costs nothing, and it is also when the page most often goes
     * stale. Otherwise the notice waits to be clicked.
     */
    const away = document.visibilityState === "hidden" || !document.hasFocus();
    if (!runInFlight() && away) {
      location.reload();
      return;
    }
    staleBanner();
  } catch {
    // The server being briefly unreachable is not news; the next tick asks again.
  }
}

checkBuild();
setInterval(checkBuild, 5000);


// ── the test catalogue ────────────────────────────────────────────────────
/**
 * WHAT THERE IS TO RUN, AS OPPOSED TO WHAT A RUN DID.
 *
 * Every other view in the platform is about a run. The feature tree counts
 * cases and stops there, so the library could be counted but not read — and
 * "is this already covered?" had no answer short of opening the source file.
 * This lists the cases themselves, grouped the way the tree groups them, with
 * the steps and the expected result each one documents.
 */
let catalogueData = null;

async function loadCatalogue() {
  const box = $("#catalogue");
  if (!box) return;
  box.innerHTML = `<div class="loading">Reading the catalogue…</div>`;
  try {
    catalogueData = await (await fetch("/api/catalogue?c=" + currentClient)).json();
  } catch {
    box.innerHTML = `<div class="empty">Could not read the catalogue.</div>`;
    return;
  }
  const note = $("#cat-note");
  if (note) {
    note.textContent = catalogueData.scopeNote ?? "";
    note.hidden = !catalogueData.scopeNote;
  }
  const pick = $("#cat-module");
  if (pick) {
    pick.innerHTML =
      '<option value="">Every module</option>' +
      catalogueData.groups.map((g) => `<option value="${esc(g.id)}">${esc(g.label)}</option>`).join("");
  }
  renderCatalogue();
}

function renderCatalogue() {
  const box = $("#catalogue");
  if (!box || !catalogueData) return;
  const q = ($("#cat-search")?.value ?? "").trim().toLowerCase();
  const module = $("#cat-module")?.value ?? "";
  const kind = $("#cat-kind")?.value ?? "";

  let shown = 0;
  box.innerHTML = "";
  for (const group of catalogueData.groups) {
    if (module && group.id !== module) continue;
    const features = [];
    for (const feature of group.features) {
      const cases = feature.cases.filter((t) => {
        if (kind && t.expected !== kind) return false;
        if (!q) return true;
        return `${t.id} ${t.title} ${t.method} ${t.path} ${t.feature} ${t.expectedResult}`.toLowerCase().includes(q);
      });
      if (cases.length) features.push({ ...feature, cases });
    }
    if (!features.length) continue;

    const total = features.reduce((n, f) => n + f.cases.length, 0);
    shown += total;
    const section = el("div", "cat-group");
    section.innerHTML =
      `<div class="cat-group-head"><h2>${esc(group.icon)} ${esc(group.label)}</h2>` +
      `<span class="hint">${total} case${total === 1 ? "" : "s"}</span></div>` +
      `<p class="cat-what">${esc(group.what ?? "")}</p>`;

    /**
     * THE SHEET, NOT A LIST.
     *
     * Read as a QA sheet reads: one row per case, with the columns a test case
     * is written in — scenario, description, the data it runs with, what the
     * app should do, priority and severity. The earlier card list carried the
     * same facts and made them impossible to scan side by side, which is the
     * whole reason a sheet is a sheet.
     */
    const table = el("div", "cat-table-wrap");
    table.innerHTML = `
      <table class="cat-table">
        <thead>
          <tr>
            <th>Scenario ID</th>
            <th>Test Scenario</th>
            <th>Test Case Description</th>
            <th>Test Data</th>
            <th>Expected Result</th>
            <th>Priority</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          ${features
            .flatMap((feature) => feature.cases.map((t) => caseRow(t, feature)))
            .join("")}
        </tbody>
      </table>`;
    section.appendChild(table);
    box.appendChild(section);
  }

  if (!shown) box.innerHTML = `<div class="empty">No case matches that.</div>`;
  const count = $("#cat-count");
  if (count) {
    count.textContent =
      shown === catalogueData.total ? `${catalogueData.total} cases` : `${shown} of ${catalogueData.total} cases`;
  }
}


/**
 * A CASE TITLE AS A SENTENCE, NOT AN IDENTIFIER.
 *
 * The library stores titles the way code stores them —
 * `QA_Platform_intake_create_rejects_missing_title` — which is fine for a test
 * runner and unreadable in a sheet a person is scanning. The prefix is noise
 * on every row, and the underscores are the only thing standing between that
 * string and an English clause.
 *
 * Nothing is invented: the words are the author's, just spaced and cased.
 */
function caseTitleInWords(title) {
  let t = String(title ?? "").replace(/^QA[_ ]?Platform[_ ]?/i, "").trim();
  if (!t) return String(title ?? "");
  // Only identifiers get unpacked; a title already written as prose is left be.
  if (!/\s/.test(t) && /_/.test(t)) t = t.replace(/_+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * The outcome first, the reasoning after.
 *
 * An expected result on these cases opens with the status and then explains
 * itself through the controller guard that produces it. Both matter, and in a
 * scannable column the verdict has to come first — so the leading clause is
 * lifted out and shown in bold, with the rest following as written.
 */
function expectedInWords(text) {
  const t = String(text ?? "").trim();
  if (!t) return "";
  // The separator must be a real sentence break — a period FOLLOWED BY SPACE,
  // a semicolon, or a connective. Splitting on any period cut "error.code 2"
  // in half and put the halves in different styles.
  const m = t.match(/^(HTTP\s+\d{3}[^;]{0,70}?)(?:\s*;\s*|\.\s+|\s+(?=from\b|because\b))([\s\S]*)$/i);
  if (!m) return `<span class="exp-rest">${esc(t)}</span>`;
  return `<b class="exp-lead">${esc(m[1].trim())}</b><span class="exp-rest">${esc(m[2].trim())}</span>`;
}

/** The data a case runs with: its request, and the values in its payload. */
function testDataOf(t) {
  const lines = [`${t.method} ${t.path}`];
  if (t.body && typeof t.body === "object") {
    for (const [k, v] of Object.entries(t.body)) {
      const shown = v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v);
      // Kept short: this column is for recognising the data, not reading it
      // in full. The whole payload is one click away under "steps".
      lines.push(`${k.replace(/_/g, " ")} = ${shown.length > 34 ? shown.slice(0, 31) + "…" : shown}`);
    }
  }
  return lines;
}

/** One row of the sheet. */
function caseRow(t, feature) {
  const data = testDataOf(t)
    .map((line, i) => `<div class="${i === 0 ? "cat-endpoint mono" : "cat-datum"}">${esc(line)}</div>`)
    .join("");
  const why = [
    t.preconditions ? `<div class="cat-pre"><b>Before it runs:</b> ${esc(t.preconditions)}</div>` : "",
    t.steps?.length ? `<ol class="cat-steps">${t.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : "",
  ].join("");
  return `
    <tr class="cat-row e-${esc(t.expected)}">
      <td class="cat-id mono">${esc(t.id)}</td>
      <td class="cat-scn">${esc(feature.label)}</td>
      <td class="cat-desc">${esc(caseTitleInWords(t.title))}${why ? `<details class="cat-more"><summary>steps</summary>${why}</details>` : ""}</td>
      <td class="cat-data">${data}</td>
      <td class="cat-exp">${expectedInWords(t.expectedResult)}</td>
      <td><span class="cat-tag p-${esc((t.priority || "").toLowerCase())}">${esc(t.priority)}</span></td>
      <td><span class="cat-tag s-${esc((t.severity || "").toLowerCase())}">${esc(t.severity)}</span></td>
    </tr>`;
}