// ── tiny helpers ──────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const ico = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const GROUP_ICON = {
  intake: "notebook-pen", pr: "receipt", events: "clipboard-list", erfx: "map", eventfeatures: "puzzle",
  auction: "gavel", bids: "coins", evaluation: "chart-column", negotiation: "handshake", award: "trophy",
  po: "file-text", p2p: "truck", finance: "landmark", masterdata: "folder-open", users: "users",
  vendors: "factory", vendorbulk: "upload", platform: "settings",
};
const groupIco = (g) => ico(GROUP_ICON[g.id] ?? "circle-dashed");
const AGENT_ICON = {
  System: "settings", Analyst: "search", Planner: "map", "Test-designer": "pen-line",
  Data: "flask-conical", Critic: "scale", Executor: "rocket", Reporter: "file-text",
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
// Catalog panel state. Declared here, not beside its own functions: `init()`
// is invoked at the top of this file and `let` does not hoist, so declaring
// these lower down threw before the first panel had loaded.
let catState = { layer: "", section: "", priority: "", verdict: "", q: "" };
let catCases = []; // the currently filtered page of the catalog
const catPicked = new Set(); // case ids the user has ticked
let catRunning = null; // the open EventSource while cases are running

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
// crosscheck = UI vs API (public/crosscheck.js), product = Product knowledge (public/model.js), matrix = Bidding scenarios (public/matrix.js)
// success = Success (public/success.js), home = Home (public/home.js),
// welcome = the landing page, login = sign in (both public/welcome.js — no app shell)
// plan = Plan a run (public/plan.js), which replaced API automation and UI automation
// sessions = every run kept, as sessions (public/sessions.js), which replaced Reports
const VIEWS = ["home", "welcome", "login", "plan", "run", "api", "ui", "journeys", "cases", "reports", "sessions", "bugs", "crosscheck", "product", "matrix", "success", "history"];

/**
 * Old addresses that now live elsewhere: the hash is rewritten, so a bookmark
 * to API automation or UI automation lands on Plan a run. (The two views stay
 * in the page, hidden: their inputs and run functions are what Plan drives.)
 * Reports is Sessions now; its view stays in the page, unreached, because
 * loadHistory() still writes into it.
 */
const REDIRECTS = { api: "plan", ui: "plan", reports: "sessions" };
const DEFAULT_VIEW = "home";

/**
 * Views kept but not shown. An old link or bookmark lands on the page that
 * holds the same cases instead. Remove a name here (and `hidden` on its nav
 * link in index.html) to bring the view back exactly as it was.
 */
const HIDDEN_VIEWS = { journeys: "cases" };

/**
 * Addresses that show an existing view under their own name, so the address
 * bar says what the reader is looking at. A session (#/session/{id}) is the
 * Run screen with that run in it (public/home.js opens it); the list of them
 * is its own view, #/sessions.
 */
const VIEW_ALIASES = { session: "run" };

function currentView() {
  // "#/login?next=…" names the view "login": a query after the name is not part of it.
  const want = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0] || DEFAULT_VIEW;
  if (HIDDEN_VIEWS[want]) return HIDDEN_VIEWS[want];
  if (VIEW_ALIASES[want]) return VIEW_ALIASES[want];
  return VIEWS.includes(want) ? want : DEFAULT_VIEW;
}

/** Where the run in this tab lives: its session's address, or the Run screen. */
function sessionHash() {
  const id = window.spineSession?.id;
  return id ? `#/session/${encodeURIComponent(id)}` : "#/run";
}

function showView(name) {
  for (const section of document.querySelectorAll(".view")) {
    section.classList.toggle("active", section.dataset.view === name);
  }
  for (const link of document.querySelectorAll(".nav-item")) {
    // `data-also` lets one nav entry stand for several views: "Plan a run"
    // is API automation and UI automation, two screens behind one entry.
    const on = link.dataset.view === name || (link.dataset.also ?? "").split(" ").includes(name);
    link.classList.toggle("active", on);
    if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  // The shell reads this to size the content column (Home is narrower).
  document.documentElement.dataset.view = name;
  // A view change is a navigation: start at the top of the new one. The page
  // itself scrolls now, not a pane inside it.
  window.scrollTo({ top: 0, behavior: "instant" });
  document.title = name === DEFAULT_VIEW ? "spine.ai" : `spine.ai · ${name}`;
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
const navCounts = { api: null, ui: null };

/** One figure on the Run view's glance strip, blank until its loader lands. */
function setGlance(id, value, title) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = value;
  if (title) node.title = title;
}

/**
 * What this run is about to touch, said once.
 *
 * The header has two pickers and neither confirms anything: "UAT" and a
 * company name sit in chrome you stop reading after a minute. On the view
 * where the run is started, it is worth a tile.
 */
function setTargetGlance() {
  const custom = $("#env")?.value === "custom";
  setGlance(
    "glance-client",
    currentClientName || "—",
    currentClient ? `${currentClientName} · company ${currentClient}` : "",
  );
  setGlance(
    "glance-env",
    custom ? "custom URL" : "UAT environment",
    custom ? $("#env-custom")?.value?.trim() || "custom base URL" : "",
  );
}

function setNavCount(key, value) {
  navCounts[key] = value;
  if (key === "api" || key === "ui") setGlance(`glance-${key}`, value == null ? "—" : String(value));
  const foot = $("#nav-foot");
  if (!foot) return;
  const line = (n, one, many) => (n == null ? "" : `${n} ${n === 1 ? one : many}`);
  foot.innerHTML = [
    line(navCounts.api, "API case", "API cases"),
    line(navCounts.ui, "browser journey", "browser journeys"),
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
 * A run that stopped mid-way WITH rows already on screen — the gap
 * `runEmptyNote` doesn't cover, since that only ever renders in the empty
 * state. Set by `watchStreamEnd` on an unexpected disconnect; cleared the
 * moment a new run starts (`goToRun`). `retry` re-runs the same instruction
 * from scratch — there is no "resume from step 17", only a clean re-run.
 */
let runStoppedNote = null; // { message, retry } | null

/**
 * The safety net under every run.
 *
 * The spinner comes down on a `done` or `fatal` event, which assumes the
 * stream ends politely. If the connection dies — server restarted, laptop
 * asleep, network gone — neither arrives, and EventSource does something worse
 * than nothing: it reconnects. These endpoints are one-shot, so a reconnect
 * re-runs the whole thing, firing a second set of real requests at UAT while
 * the panel still says "running…". Closing it ourselves ends the run once.
 *
 * `retry`, when given, is what a "stopped early" banner's re-run button calls.
 */
function watchStreamEnd(es, onEnd, retry) {
  // Only `finish()`-style handlers null these out on a clean end; an
  // unexpected disconnect (this whole listener) bypasses that, which left
  // Stop visible forever after a dropped connection.
  const clearRunningRef = () => {
    if (uiRunning === es) uiRunning = null;
    if (apiRunning === es) apiRunning = null;
    syncStopBtn();
  };
  es.addEventListener("error", () => {
    // The `done` handler closes the stream itself, so reaching here means the
    // connection dropped rather than the run finishing.
    if (es.readyState === EventSource.CLOSED) {
      clearRunningRef();
      runFinished();
      onEnd?.();
      return;
    }
    es.close();
    const message =
      "The connection to the run was lost before it finished — most likely the server " +
      "restarted or the network dropped mid-run, not a test failure. Nothing was restarted " +
      "automatically; the steps below marked ≈ simply never got a turn.";
    runEmptyNote = runEmptyNote || message;
    if (retry) runStoppedNote = { message, retry };
    renderAutomation();
    clearRunningRef();
    runFinished();
    onEnd?.();
  });
  return es;
}

/** Shown while either the API match/run or the UI plan is in flight. */
function syncStopBtn() {
  const b = $("#run-stop-btn");
  if (b) b.hidden = !(uiRunning || apiRunning);
}

/**
 * Whether a run started from this page is still in flight.
 *
 * This used to live only as the `.live` class on the Run nav link; the
 * sidebar no longer has that link (the running pill at its foot replaces
 * it), so the state is kept here. The stale-build reload and Home both read it.
 */
let runLive = false;

function goToRun(label, hint) {
  // A run nobody asked for in words (the PO flow, a catalogue pick) still opens a session turn.
  // Opened first, so the address below can name the session.
  if (label) window.spineSession?.ensure({ text: `Run ${label}` });
  if (currentView() !== "run") location.hash = sessionHash();
  runLive = true;
  document.querySelector('.nav-item[data-view="run"]')?.classList.add("live");
  if (label) {
    runPending = label;
    runPendingHint = hint || "";
    runPlanned = 0;
    runEmptyNote = "";
    runStoppedNote = null;
    runStartedAt = Date.now();
    runCurrentStep = "";
    resetJourney();
    // A new run starts with no browser picture; the run that has one sends it.
    const framePanel = $("#live-frame-panel");
    if (framePanel) framePanel.hidden = true;
    renderAutomation();
    setRunBar(0, 0);
    // A label means a run is starting right now — show Stop unconditionally
    // rather than through syncStopBtn, whose uiRunning/apiRunning checks run
    // before this run's own EventSource exists yet.
    const stopBtn = $("#run-stop-btn");
    if (stopBtn) stopBtn.hidden = false;
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
  runLive = false;
  document.querySelector('.nav-item[data-view="run"]')?.classList.remove("live");
  syncStopBtn();
  window.spineSession?.idle();
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
  // Signed out, a route lands on the landing page or sign-in; signed in, never
  // on sign-in (the rules are in index.html's head script, window.spineAuth).
  const route = () => {
    const go = window.spineAuth?.resolve(location.hash);
    if (go) {
      location.replace(go); // fires hashchange again, which shows it
      return;
    }
    const moved = REDIRECTS[location.hash.replace(/^#\/?/, "").split(/[/?]/)[0]];
    if (moved) {
      location.replace(`#/${moved}`);
      return;
    }
    showView(currentView());
  };
  window.addEventListener("hashchange", route);
  if (!location.hash) location.replace(window.spineAuth?.resolve("") ?? `#/${DEFAULT_VIEW}`);
  route();
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
  // "Plan a run": the features picked for the next run (not the "always runs"
  // steps, which follow a pick rather than being one).
  const picked = pickedFeatureCount();
  badge("plan", picked ? String(picked) : "");
  badge("run", checkRows.length ? String(checkRows.length) : "");
}

// ── boot ──
init();
async function init() {
  loadFindings();
  loadStuck();
  loadGaps();
  initCatalog();
  pollRunState();
  setInterval(pollRunState, 2500);
  loadJourneys();

  // Journeys: one delegated handler, because every row is rendered up front.
  $("#journeys")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".jy-row");
    if (btn) openJourneyCase(btn);
  });
  $("#jy-q")?.addEventListener("input", filterJourneys);
  for (const id of ["#jy-journey", "#jy-priority", "#jy-verdict"]) {
    $(id)?.addEventListener("change", filterJourneys);
  }
  for (const b of document.querySelectorAll(".jy-segb")) {
    b.addEventListener("click", () => {
      for (const o of document.querySelectorAll(".jy-segb")) {
        o.setAttribute("aria-pressed", String(o === b));
      }
      filterJourneys();
    });
  }
  // Collapsed state is set on <html> before paint (inline script in <head>),
  // so this only ever needs to flip the class and persist it — never apply
  // it on load, or a reload would flash expanded first.
  $("#nav-toggle")?.addEventListener("click", () => {
    const collapsed = document.documentElement.classList.toggle("nav-collapsed");
    try {
      localStorage.setItem("navCollapsed", collapsed ? "1" : "0");
    } catch {}
    $("#nav-toggle").textContent = collapsed ? "›" : "‹";
    $("#nav-toggle").title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  });
  if (document.documentElement.classList.contains("nav-collapsed") && $("#nav-toggle")) {
    $("#nav-toggle").textContent = "›";
    $("#nav-toggle").title = "Expand sidebar";
  }

  // The chat box has three buttons for the one test case in it: run it
  // against the API, the UI, or both — each prints where it belongs (the API
  // card right here, the UI run in the Automation-run panel below). Letting
  // the AI pick a browser journey is a different thing that prints to a
  // different console, so it lives in UI automation.
  $("#run-api-btn")?.addEventListener("click", () => runInstruction("api"));
  $("#run-ui-btn")?.addEventListener("click", () => runInstruction("ui"));
  $("#run-both-btn")?.addEventListener("click", () => runInstruction("both"));
  $("#run-stop-btn")?.addEventListener("click", () => {
    // Closing the EventSource ends the HTTP request; the server's own
    // `req.on("close", () => stop())` is what actually kills the spawned
    // browser — the same mechanism the UI automation drawer's stop uses.
    if (apiRunning) {
      apiRunning.close();
      apiRunning = null;
    }
    if (uiRunning) {
      uiRunning.close();
      uiRunning = null;
    }
    runStoppedNote = null;
    window.spineSession?.stopped();
    runFinished();
    $("#status").textContent = "stopped";
  });
  // Enter alone must stay a newline — a test case pasted in here is several
  // lines long — so the run is on the modifier, as every other composer does it.
  $("#request")?.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !$("#run-both-btn")?.disabled) {
      e.preventDefault();
      runInstruction("both");
    }
  });
  const { clients, defaultClient, provider } = await (await fetch("/api/clients")).json();
  setProvider(provider);
  const sel = $("#client");
  /**
   * CLIENTS ADDED HERE SURVIVE A RELOAD.
   *
   * The list comes from config, which is right for the accounts the team keeps
   * — and no help at all when someone wants to point the platform at a company
   * id they have just been given. Anything typed in is kept per browser, which
   * is the honest home for it: it is one person trying one account, not a
   * change to what the team ships.
   */
  const added = readAddedClients();
  const allClients = [...clients, ...added.filter((a) => !clients.some((c) => String(c.id) === String(a.id)))];
  const fillClientList = () => {
    sel.innerHTML = "";
    for (const c of allClients) {
      const o = el("option");
      o.value = c.id;
      o.textContent = `${c.name} (${c.id})${c.added ? " · added" : ""}`;
      sel.appendChild(o);
    }
    // Last, and visually apart: it is an action, not an account.
    const add = el("option");
    add.value = "__add__";
    add.textContent = "＋ Add a client…";
    sel.appendChild(add);
  };
  fillClientList();
  /**
   * THE ACCOUNT YOU WERE ON SURVIVES A RELOAD.
   *
   * Every refresh used to land back on the server's default (PROCOL DEMO), so
   * someone working on another account had to re-pick it each time. The last
   * choice is kept per browser; one that no longer exists falls back to the
   * default rather than to an empty picker.
   */
  let startClient = String(defaultClient);
  try {
    const kept = localStorage.getItem("qa.client");
    if (kept && allClients.some((c) => String(c.id) === kept)) startClient = kept;
  } catch {}
  sel.value = startClient;
  currentClient = Number(startClient);
  currentClientName = allClients.find((c) => String(c.id) === startClient)?.name ?? "";
  setTargetGlance();

  let lastClient = startClient;
  const addField = $("#client-add-field");
  const showAdd = (on) => {
    if (addField) addField.hidden = !on;
    if (on) $("#client-add-id")?.focus();
  };
  $("#client-add-cancel")?.addEventListener("click", () => {
    showAdd(false);
    sel.value = lastClient;
  });
  $("#client-add-go")?.addEventListener("click", () => {
    const id = Number(($("#client-add-id")?.value ?? "").trim());
    if (!Number.isFinite(id) || id <= 0) {
      $("#client-add-id")?.focus();
      return;
    }
    const name = ($("#client-add-name")?.value ?? "").trim() || `Company ${id}`;
    if (!allClients.some((c) => String(c.id) === String(id))) {
      allClients.push({ id, name, added: true });
      saveAddedClients(allClients.filter((c) => c.added));
    }
    fillClientList();
    sel.value = String(id);
    showAdd(false);
    const idBox = $("#client-add-id"); if (idBox) idBox.value = "";
    const nameBox = $("#client-add-name"); if (nameBox) nameBox.value = "";
    sel.dispatchEvent(new Event("change"));
  });

  sel.addEventListener("change", () => {
    // The last entry is an action, not an account: show the box and put the
    // selection back where it was, so cancelling changes nothing.
    if (sel.value === "__add__") {
      showAdd(true);
      return;
    }
    showAdd(false);
    lastClient = sel.value;
    currentClient = Number(sel.value);
    try { localStorage.setItem("qa.client", sel.value); } catch {}
    currentClientName = allClients.find((c) => String(c.id) === String(currentClient))?.name ?? "";

    /**
     * Anything account-specific goes away the moment the account changes.
     *
     * Reading the new company's configuration takes a second or two (PROCOL
     * DEMO longest of all), and until it lands the panel still shows the last
     * account's state — which is how "Run PO automation" appeared under a
     * client that has no PO module. Clear first, then reload.
     */
    setTargetGlance();
    resetAccountControls();
    // Switching company re-reads that company's configuration and rebuilds the
    // tree — the same way the real Procol console reconfigures itself.
    loadFeatures();
    loadUiFlows();
    loadPoInput();
    loadCatalogue();
  });
  $("#f-all").addEventListener("click", () => setFilter("all"));
  $("#f-fail").addEventListener("click", () => setFilter("fail"));
  $("#t-run").addEventListener("click", () => {
    if (!validateApiInputs().length) runSelectedFeatures();
  });
  $("#t-none").addEventListener("click", () => {
    selected.clear();
    renderTree();
  });
  // The note under the field restates the count in words, so it has to move
  // with the field rather than only on the next tree render.
  $("#api-line-items")?.addEventListener("input", syncApiInputs);
  $("#api-qty")?.addEventListener("input", syncApiInputs);
  $("#api-vendors")?.addEventListener("input", syncApiInputs);
  $("#api-sb")?.addEventListener("input", syncApiInputs);
  $("#api-vb")?.addEventListener("input", syncApiInputs);
  $("#api-qty-same")?.addEventListener("change", syncApiInputs);
  document.querySelectorAll("#api-qty-mode .qty-mode-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const same = $("#api-qty-same");
      if (!same) return;
      same.checked = b.dataset.same === "1";
      same.dispatchEvent(new Event("change"));
    }),
  );
  $("#ui-run-sel").addEventListener("click", () => {
    if (!validateUiInputs().length) runSelectedUiJourneys();
  });
  ["#li-boq", "#ui-vendors"].forEach((id) => $(id)?.addEventListener("input", validateUiInputs));
  // The quantity boxes follow the line-item count, as on the API row.
  $("#li-normal")?.addEventListener("input", () => {
    renderUiQtyBoxes();
    validateUiInputs();
  });
  $("#ui-qty-same")?.addEventListener("change", () => {
    renderUiQtyBoxes();
    validateUiInputs();
  });
  document.querySelectorAll("#ui-qty-mode .qty-mode-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const same = $("#ui-qty-same");
      if (!same) return;
      same.checked = b.dataset.same === "1";
      same.dispatchEvent(new Event("change"));
    }),
  );
  renderUiQtyBoxes();
  $("#ui-none").addEventListener("click", () => {
    uiSelected.clear();
    renderUiTree();
  });
  $("#ui-stop").addEventListener("click", () => {
    if (uiRunning) {
      uiRunning.close();
      uiRunning = null;
      const c = $("#ui-console");
      if (c) c.appendChild(el("div", "note", "Stopped by you"));
      document.querySelectorAll(".submodule.running").forEach((r) => r.classList.remove("running"));
    }
  });
  $("#po-run")?.addEventListener("click", runPoAutomation);

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
  initCaseBook();
  initBugControls();
  initEnvControl();
  setTargetGlance();
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
    /**
     * No character count. Cut at 46, every one of these lost its verb —
     * "Create a technical RFP + RFQ event, place a …" — and a suggestion you
     * cannot read is not a suggestion. The row is 800px wide and the longest
     * example is sixty characters; whether that fits is a question about the
     * window, not about the string, so CSS trims it and only when it must.
     */
    const chip = el("button", "rc-ex", text);
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
  /**
   * A badge, not a heading.
   *
   * Slingring's label names both models it is pointed at — two shouty
   * identifiers that were the widest thing in the header and told a reader
   * nothing they could act on. The name is the status; the models are detail,
   * and detail belongs in the tooltip.
   */
  n.textContent = "AI · " + p.split(" (")[0].split(" · ")[0];
  n.title = p;
  // Green means an LLM is actually answering. The old test named two
  // providers by hand and so went grey the day a third one was added.
  n.classList.toggle("live", !/deterministic|no API key/i.test(p));
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
/** "loading" | "ready" | "error" — Plan a run draws its list from this. */
let featuresState = "loading";

/** Features picked for the next run: the selection minus the "always runs" steps. */
function pickedFeatureCount() {
  let n = 0;
  for (const g of featureGroups) for (const f of g.children) if (selected.has(f.id) && !f.prerequisite) n++;
  return n;
}

/** Tells Plan a run (public/plan.js) that features, journeys or the account changed. */
function planChanged() {
  window.spinePlan?.render();
}
/**
 * Set when this account's tests are a suite of their own (the RFP suite):
 * its tree comes from the suite, and "Run" hands the ticked parts to it.
 */
let featureSuite = null;

async function loadFeatures() {
  const box = $("#tree");
  box.innerHTML = "";
  featuresState = "loading";
  planChanged();
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
    const { groups, defaults, totalCases, company, scope, suite } = await (
      await fetch("/api/features?c=" + currentClient + baseParam())
    ).json();
    featureGroups = groups;
    const wasSuite = featureSuite?.id;
    featureSuite = suite || null;
    // A suite account runs from the tree itself — never the read-only mode a
    // PO-only account puts it in, whatever the previous account left behind.
    if (featureSuite) setSingleRunner(false);
    // Arriving on a suite account, start from its own defaults rather than
    // whatever the previous account left in the boxes.
    if (featureSuite && wasSuite !== featureSuite.id) {
      // What you last typed for this suite, else its defaults.
      const d = featureSuite.defaults || {};
      let kept = {};
      try { kept = JSON.parse(localStorage.getItem(`qa.suiteInputs.${featureSuite.id}`) || "{}"); } catch {}
      if ($("#api-line-items")) $("#api-line-items").value = String(kept.lineItems ?? d.lineItems ?? 2);
      if ($("#api-qty")) $("#api-qty").value = String(kept.quantities ?? d.quantities ?? "5");
      if ($("#api-vendors")) $("#api-vendors").value = String(kept.vendors ?? d.vendors ?? 3);
      if ($("#api-sb")) $("#api-sb").value = String(kept.surrogateBids ?? d.surrogateBids ?? 1);
      if ($("#api-vb")) $("#api-vb").value = String(kept.vendorBids ?? d.vendorBids ?? 1);
      if ($("#api-qty-same")) $("#api-qty-same").checked = kept.qtySame !== false && !String(kept.quantities ?? "").includes(",");
    }
    // Leaving a suite account: the journey's own defaults, not the suite's numbers.
    if (!featureSuite && wasSuite) {
      if ($("#api-qty")) $("#api-qty").value = "5";
      if ($("#api-vendors")) $("#api-vendors").value = "1";
    }
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
    /**
     * A client change keeps the picks that still apply here — the same
     * feature, with tests, switched on for this company — and drops the rest.
     * (The first load starts empty because nothing has been picked yet.)
     */
    const stillHere = new Set();
    for (const g of groups) {
      for (const f of g.children) {
        if (f.cases > 0 && f.config?.state !== "off" && !f.prerequisite) stillHere.add(f.id);
      }
    }
    selected = new Set([...selected].filter((id) => stillHere.has(id)));
    featuresState = "ready";

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
    // History titles name features by their tree labels, which have just arrived.
    if ($("#history")?.querySelector(".run-item")) loadHistory();
  } catch {
    box.innerHTML = "";
    box.appendChild(el("div", "empty", "Could not load the feature list."));
    featuresState = "error";
    planChanged();
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
/**
 * Keep the prerequisites honest.
 *
 * Line items and event configuration are not things you choose instead of an
 * event type — no event exists without them. So the moment anything else in
 * their group is picked they join the run, and when nothing is picked they
 * leave it, rather than sitting there as a selection of their own that would
 * run line-item validation against no event.
 *
 * Done as one invariant over `selected` rather than at the run button, so every
 * reader of the set — the counts, the button, the run payload — agrees.
 */
function syncPrerequisites() {
  for (const g of featureGroups) {
    const pre = g.children.filter((c) => c.prerequisite && c.cases > 0);
    if (!pre.length) continue;
    const anyChosen = g.children.some((c) => !c.prerequisite && selected.has(c.id));
    for (const p of pre) {
      if (anyChosen) selected.add(p.id);
      else selected.delete(p.id);
    }
  }
}

/**
 * Keep a one-of choice a choice.
 *
 * The four event types are one decision — an event is an RFQ or an auction,
 * never both — so a selection must never hold two of them. Anything that adds
 * to a set (the master "tick everything", a restored selection) goes through
 * here, and the earliest in tree order wins, because that is the one the
 * reader can see is ticked.
 *
 * Written over (set, key) rather than over `selected`, because the same rule
 * governs both trees: the API tree selects features by id, the UI tree selects
 * journeys by `uiFlow`, and "one event type per run" is a fact about the
 * product, not about which of the two lists you are looking at.
 */
function syncExclusive(selection, keyOf) {
  const taken = new Set();
  for (const g of featureGroups) {
    for (const f of g.children) {
      const key = keyOf(f);
      if (!f.oneOf || !key || !selection.has(key)) continue;
      if (taken.has(f.oneOf)) selection.delete(key);
      else taken.add(f.oneOf);
    }
  }
}

/** The node already holding `f`'s one-of choice, if it is not `f` itself. */
function exclusiveHolder(f, selection, keyOf) {
  if (!f.oneOf) return null;
  for (const g of featureGroups) {
    for (const other of g.children) {
      const key = keyOf(other);
      if (other.oneOf === f.oneOf && other.id !== f.id && key && selection.has(key)) return other;
    }
  }
  return null;
}

const byFeatureId = (f) => f.id;
const byUiFlow = (f) => f.uiFlow;

function renderTree() {
  syncExclusive(selected, byFeatureId);
  syncPrerequisites();
  const box = $("#tree");
  box.innerHTML = "";
  let pickedCases = 0;
  let pickedFeatures = 0;

  for (const g of featureGroups) {
    // Only features that actually have test cases can be run. The rest are
    // listed — the tree doubles as a coverage map — but not selectable, so
    // "Run selected" can never mean "run nothing".
    // Prerequisites are not choices, so they are not part of "tick everything
    // here" and do not count towards "3 of 7 picked" — they follow whatever is.
    const kidIds = g.children.filter((c) => c.cases > 0 && !c.prerequisite).map((c) => c.id);
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
      // "Tick everything here" cannot tick two event types, so it takes the
      // first of each one-of choice and leaves the rest — `syncExclusive`
      // would drop them anyway, and doing it here keeps the box honest.
      if (master.checked) kidIds.forEach((id) => selected.add(id));
      else kidIds.forEach((id) => selected.delete(id));
      renderTree();
    });
    head.appendChild(master);

    // Journey position. The tree is ordered the way a buyer walks the product,
    // but order alone is invisible once a reader scrolls — the number says it.
    // Supporting groups (master data, users, vendors, config) carry no step and
    // get a dot, because they are not a stage anybody passes through.
    const stepBadge = el("span", "module-step" + (g.step ? "" : " nostep"), g.step ? String(g.step) : "·");
    stepBadge.title = g.step ? `Step ${g.step} of the procure-to-pay journey` : "Set up underneath the journey, not a stage of it";
    head.appendChild(stepBadge);

    head.appendChild(el("span", "module-ico", groupIco(g)));
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
    // When in the journey this happens — the sentence the step number is short for.
    if (g.when) body.appendChild(el("div", "module-when", esc(g.when)));

    for (const [fi, f] of g.children.entries()) {
      // Not on for this client (licence, setting or predicate the backend
      // checks — config/featureGates.json): shown, greyed, never tickable.
      const offHere = f.config?.state === "off";
      if (offHere) selected.delete(f.id);
      const runnable = f.cases > 0 && !offHere;
      const isPre = !!f.prerequisite && runnable;
      // Another event type is already picked. This one is not unavailable in
      // the product — it is simply not this run, and it comes back the moment
      // the other is unticked.
      const heldBy = exclusiveHolder(f, selected, byFeatureId);
      const row = el(
        "div",
        "submodule" + (runnable ? "" : " none") + (offHere ? " off-here" : "") + (isPre ? " prereq" : "") +
          (heldBy ? " blocked" : "") + (selected.has(f.id) ? " picked" : ""),
      );
      const cb = el("input");
      cb.type = "checkbox";
      // A prerequisite is shown ticked and locked: it is not a decision, and a
      // box you can untick would promise you could create an event without
      // line items.
      cb.disabled = !runnable || isPre || !!heldBy;
      cb.checked = isPre ? true : runnable && selected.has(f.id);
      const offWhy = (f.config?.reasons && f.config.reasons[0]) || (f.config?.flag ? `${f.config.flag} is OFF for this company` : "switched off for this company");
      cb.title = offHere
        ? `Not on for this client — ${offWhy}`
        : heldBy
        ? `One event type per run — untick “${heldBy.label}” to pick this instead`
        : isPre
          ? "Always runs — every event type goes through this step"
          : runnable
            ? ""
            : "no test cases written for this yet";
      cb.addEventListener("click", (e) => e.stopPropagation());
      if (!isPre && !heldBy) {
        cb.addEventListener("change", () => {
          cb.checked ? selected.add(f.id) : selected.delete(f.id);
          renderTree();
        });
      }
      row.appendChild(cb);

      // Order within the stage, e.g. 3.6 = the sixth thing you do while
      // building a sourcing event. Without it the list reads as unsorted.
      const ord = el("span", "sub-step", g.step ? `${g.step}.${fi + 1}` : `${fi + 1}`);
      ord.title = "Order within this stage";
      row.appendChild(ord);

      // Per-company configuration badge: a feature that is simply OFF here
      // would otherwise look like a product bug when its tests are skipped.
      let tags = "";
      if (f.flowId) tags += ' <span class="sub-tag e2e" title="has a real end-to-end journey">e2e</span>';
      const st = f.config?.state;
      if (st === "on") tags += ` <span class="sub-tag on" title="${esc(f.requiresConfig || "")} is ON for this company">on</span>`;
      else if (st === "off")
        tags += ` <span class="sub-tag off" title="${esc(`${offWhy}. Its tests are skipped here, not failed.${f.config?.source ? ` (from ${f.config.source})` : ""}`)}">not on for this client</span>`;
      // No "config?" badge. It fired whenever a per-company flag could not be
      // read, which is a fact about OUR read, not about the feature — and it
      // sat on the four event types permanently, shouting a question nobody
      // could answer. "off" still shows, because that one changes what runs.

      if (!runnable && !offHere) {
        tags += ' <span class="sub-tag notbuilt" title="no test cases written for this feature yet">no tests yet</span>';
      }
      if (isPre) {
        tags += ' <span class="sub-tag req" title="every event type goes through this — it runs whenever you pick one">always runs</span>';
      }
      if (heldBy) {
        tags += ` <span class="sub-tag held" title="${esc(
          `An event has one type. “${heldBy.label}” is picked for this run; untick it to choose this one.`,
        )}">one type per run</span>`;
      }

      const name = el("span", "sub-name");
      name.innerHTML = `${esc(f.label)}${tags}<span class="sub-what">${esc(f.what)}</span>` +
        (offHere ? `<span class="sub-off-why">${esc(offWhy)}</span>` : "");
      row.appendChild(name);
      row.appendChild(el("span", "sub-n", f.cases ? String(f.cases) : "—"));
      if (runnable && !isPre && !heldBy) {
        row.addEventListener("click", () => {
          const now = !selected.has(f.id);
          now ? selected.add(f.id) : selected.delete(f.id);
          renderTree();
        });
      }
      body.appendChild(row);
      // The feature's own test cases, as test cases — read on demand.
      if (f.cases > 0) body.appendChild(featureCaseList(f));
    }
    mod.appendChild(body);
    box.appendChild(mod);
  }

  syncApiInputs();
  syncRunButton();
  syncNav();
  const meta = $("#api-meta");
  if (meta)
    meta.textContent = pickedFeatures
      ? `${pickedFeatures} picked · ${pickedCases} test${pickedCases === 1 ? "" : "s"} will run`
      : "nothing picked yet";
  planChanged();
}

/**
 * "Show its 12 test cases" under a feature row: each case as a tester would
 * write it (title, steps, expected) with its track record, and the request
 * and body behind a closed "Details". Kept open across re-renders.
 */
const openCaseLists = new Set();
const CASE_PAGE = 25;
function featureCaseList(f) {
  const wrap = el("div", "cv-list");
  const btn = el("button", "cv-sub-cases");
  btn.type = "button";
  const label = () => (openCaseLists.has(f.id) ? "Hide its test cases" : `Show its ${f.cases} test case${f.cases === 1 ? "" : "s"}`);
  btn.textContent = label();
  const box = el("div", "cv-list-box");
  wrap.append(btn, box);
  const fill = async (limit) => {
    box.innerHTML = '<div class="loading">Reading the cases…</div>';
    try {
      const list = await CaseView.forFeature(f.id);
      box.innerHTML = list.slice(0, limit).map((d) => CaseView.card(d, { compact: true, hideArea: true })).join("");
      if (list.length > limit) {
        const more = el("button", "cv-list-more", `Show all ${list.length}`);
        more.type = "button";
        more.addEventListener("click", (e) => {
          e.stopPropagation();
          fill(list.length);
        });
        box.appendChild(more);
      }
      if (!list.length) box.innerHTML = '<div class="empty">No runnable cases for this feature.</div>';
      CaseView.fillTrack(box, currentClient);
    } catch {
      box.innerHTML = '<div class="empty">Could not read the cases.</div>';
    }
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (openCaseLists.has(f.id)) {
      openCaseLists.delete(f.id);
      box.innerHTML = "";
    } else {
      openCaseLists.add(f.id);
      fill(CASE_PAGE);
    }
    btn.textContent = label();
  });
  if (openCaseLists.has(f.id)) fill(CASE_PAGE);
  return wrap;
}

/**
 * The line-item count, shown only when this selection actually builds events.
 *
 * A number field sitting over a selection it cannot affect is worse than no
 * field: it invites someone to set 10, watch a run of purchase-order cases go
 * past, and conclude the setting is broken. So the strip appears exactly when
 * the ticked cases include some that actually send line items — counted from
 * the case data itself, so it stays right as cases are added.
 */
function apiLineItemCases() {
  let n = 0;
  for (const g of featureGroups) {
    for (const f of g.children) {
      if (selected.has(f.id)) n += f.lineItemCases || 0;
    }
  }
  return n;
}

/** Every change to the API row: redraw it, then check its settings. */
function syncApiInputs() {
  drawApiInputs();
  validateApiInputs();
}

function drawApiInputs() {
  const wrap = $("#api-inputs");
  if (!wrap) return;
  if (featureSuite) {
    try {
      localStorage.setItem(
        `qa.suiteInputs.${featureSuite.id}`,
        JSON.stringify({
          lineItems: $("#api-line-items")?.value,
          quantities: $("#api-qty")?.value,
          vendors: $("#api-vendors")?.value,
          surrogateBids: $("#api-sb")?.value,
          vendorBids: $("#api-vb")?.value,
          qtySame: $("#api-qty-same")?.checked,
        }),
      );
    } catch {}
  }
  const cases = apiLineItemCases();
  wrap.hidden = cases === 0;
  const note = $("#api-li-note");
  const qtyField = $("#api-qty-field");
  const vendorsField = $("#api-vendors-field");
  // Every account: one quantity for all, or (untick "same for all") a box per line item.
  if (qtyField) qtyField.hidden = false;
  renderQtyBoxes();
  if (vendorsField) vendorsField.hidden = false;
  // Only when the surrogate bid is ticked: otherwise the run stops at the publish.
  const sbField = $("#api-sb-field");
  const surrogateOn = !!featureSuite && selected.has("bids.surrogate");
  if (sbField) sbField.hidden = !surrogateOn;
  const vbField = $("#api-vb-field");
  const vendorOn = !!featureSuite && selected.has("bids.place");
  if (vbField) vbField.hidden = !vendorOn;
  if (featureSuite) {
    if (!note) return;
    const n = Math.max(1, Number($("#api-line-items")?.value) || 1);
    const qty = String($("#api-qty")?.value ?? "").trim();
    const v = Math.max(1, Number($("#api-vendors")?.value) || 1);
    const sbN = Math.max(1, Number($("#api-sb")?.value) || 1);
    const vbN = Math.max(1, Number($("#api-vb")?.value) || 1);
    const bidsAsked = (surrogateOn ? sbN : 0) + (vendorOn ? vbN : 0);
    const problem =
      rfpInputProblem(n, qty, v) ||
      (bidsAsked > v ? `${bidsAsked} bids in all but only ${v} vendor${v === 1 ? "" : "s"} invited — each vendor bids once, so invite at least as many vendors as bids.` : null);
    note.classList.toggle("bad", !!problem);
    note.textContent = problem
      ? problem
      : `Publishes a real RFP event: ${n} line item${n === 1 ? "" : "s"}, ` +
        (qty.includes(",") ? `quantities ${qty.split(",").map((x) => x.trim()).join(", ")}` : `quantity ${qty || "5"} each`) +
        `, sent to ${v} vendor${v === 1 ? "" : "s"}` +
        (surrogateOn || vendorOn
          ? `, then ${[surrogateOn && `places a surrogate bid for ${sbN} of them`, vendorOn && `${vbN} vendor${vbN === 1 ? " logs" : "s log"} in to the portal and ${vbN === 1 ? "bids" : "bid"}`].filter(Boolean).join(", and ")}`
          : ". Stops at the publish — tick Surrogate bid or Vendor bid to bid on it too") +
        ". Products, template, evaluators and vendors are picked live on the account.";
    return;
  }
  if (!note) return;
  if (!cases) {
    note.textContent = "";
    return;
  }
  const liEl = $("#api-line-items");
  const n = Math.max(1, Number(liEl?.value) || 1);
  // An out-of-range count is the validator's to explain; don't restate it as a plan.
  if (Number(liEl?.max) && n > Number(liEl.max)) {
    note.textContent = "";
    return;
  }
  note.textContent =
    `${cases} of the ticked case${cases === 1 ? "" : "s"} build an event — each will send ` +
    `${n} line item${n === 1 ? "" : "s"}. Cases written around a count of their own keep it, ` +
    `and the run says which.`;
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
  /**
   * For an API run that walked the collection first: its one-line outcome,
   * where it stopped (if it did) and the step tally. A journey that stopped
   * is not a successful run, however many checks passed afterwards.
   */
  journey = null,
}) {
  // On the Run screen the run already ends in its session, so the result goes
  // there as its DONE / FAILED box instead of a modal over it.
  if (window.spineSession?.showing()) {
    window.spineSession.runEnd({ total, passed, failed, skipped, error, journey, subtitle, kind });
    return;
  }
  const modal = $("#modal");
  const journeyStopped = !!(journey && journey.stoppedAt);
  const ok = !error && failed === 0 && !journeyStopped;
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
        : journeyStopped && failed === 0
          ? `Run complete — the journey stopped at step ${journey.stoppedAt}`
          : `Run complete — ${failed} failed`;
  // A run that walked the journey and had no cases after it is measured in
  // steps. "0 checks · 0 passed · 0 failed" under fifteen green steps read as
  // nothing having happened.
  const journeyOnly = !!(journey && journey.steps && total === 0);
  $("#modal-sub").textContent =
    error ??
    subtitle ??
    (journeyOnly
      ? `${journey.outcome} ${journey.steps} step${journey.steps === 1 ? "" : "s"}, from signing in to the award, against ${currentClientName || "this client"}.`
      : (journey ? `Journey: ${journey.outcome} ` : "") +
        `${total} check${total === 1 ? "" : "s"} ran against ${currentClientName || "this client"}.`);

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
  } else if (journeyOnly) {
    const broken = journeyStopped ? 1 : 0;
    const notRun = Math.max(0, journey.steps - journey.worked - broken);
    stats.appendChild(stat(journey.steps, "steps"));
    stats.appendChild(stat(journey.worked, "worked", "good"));
    stats.appendChild(stat(broken, "broken", broken ? "bad" : ""));
    if (notRun) stats.appendChild(stat(notRun, "not run"));
  } else {
    if (journey && journey.steps) {
      stats.appendChild(stat(`${journey.worked}/${journey.steps}`, "journey steps", journeyStopped ? "bad" : "good"));
    }
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
  note.textContent = reportNote ?? (journeyOnly
    ? "The test report walks the same steps in order — what was expected, what the app replied, and the request behind each."
    : ticked
    ? `The test report covers the ${ticked} ticked feature${ticked === 1 ? "" : "s"} — every case those modules define, each with its verdict and a curl.`
    : "The test report covers every module in the case library — tick features on the left to narrow it.");

  modal.hidden = false;
}

function initModal() {
  /**
   * Two audiences, two kinds of link.
   *
   * A run's reports hang off its own card in the history and off the bar the
   * run leaves behind — set by showReportsFor(). What remains here is the
   * standing sheet on the Bugs view, which is about everything the platform
   * knows rather than about any one run. #report-tests is gone from the
   * markup; wireReportLink no-ops on a missing element, and the call is kept
   * so the behaviour comes back with the element if it ever returns.
   */
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

/**
 * RUN SETTINGS ARE CHECKED, NOT TESTED.
 *
 * Line items, quantity and vendors say how to build a VALID event so the run
 * can test everything else. A bad value here would make every case fail for
 * the wrong reason, so it is refused as it is typed: the box turns red, the
 * reason is said under the row, and Run waits until it is fixed. Bad values
 * as test DATA are the test cases' job (66 lines, -5, "abc" all have cases).
 */
function inputProblems(fields) {
  const problems = [];
  for (const f of fields) {
    const input = f.el;
    if (!input) continue;
    const msg = f.check(String(input.value ?? "").trim());
    input.classList.toggle("invalid", !!msg);
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    if (msg) problems.push(msg);
  }
  return problems;
}

function wholeIn(label, lo, hi) {
  return (v) => {
    const n = Number(v);
    if (v === "" || !Number.isInteger(n)) return `${label}: enter a whole number${hi ? ` from ${lo} to ${hi}` : ` of ${lo} or more`}.`;
    if (n < lo || (hi && n > hi)) return `${label}: ${n} is out of range — ${hi ? `${lo} to ${hi}` : `${lo} or more`}${f_maxNote(label, hi)}.`;
    return null;
  };
}
const f_maxNote = (label, hi) => (hi && /line items|BOQ/i.test(label) ? " for this company" : "");

function positiveQty(label) {
  return (v) => {
    if (v === "") return `${label}: enter a quantity above 0.`;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return `${label}: “${v}” is not a quantity above 0 (decimals like 2.5 are fine).`;
    return null;
  };
}

function showInputErrors(box, problems) {
  if (!box) return;
  box.hidden = !problems.length;
  box.innerHTML = problems.length
    ? `<b>Fix ${problems.length === 1 ? "this" : "these"} to run:</b><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
    : "";
}

/** The API row: line items, each quantity box, vendors. Disables Run while wrong. */
function validateApiInputs() {
  const wrap = $("#api-inputs");
  let problems = [];
  if (wrap && !wrap.hidden) {
    const li = $("#api-line-items");
    const max = Number(li?.max) || 0;
    const fields = [
      { el: li, check: wholeIn("Line items", 1, max || undefined) },
      { el: $("#api-vendors"), check: wholeIn("Vendors invited", 1, 50) },
    ];
    const boxes = [...document.querySelectorAll("#api-qty-boxes input")];
    boxes.forEach((b, i) =>
      fields.push({ el: b, check: positiveQty(boxes.length > 1 ? `Quantity, item ${i + 1}` : "Quantity") }),
    );
    problems = inputProblems(fields);
  }
  showInputErrors($("#api-input-errors"), problems);
  const btn = $("#t-run");
  if (btn) {
    btn.disabled = problems.length > 0;
    btn.title = problems.length ? "Fix the settings in red first" : "Runs the ready-made test cases for everything ticked below";
  }
  return problems;
}

/** The UI row: line items (and BOQ items when shown), quantity list, vendors. */
function validateUiInputs() {
  // Nothing ticked that builds an event: no settings to check.
  if ($("#ui-inputs")?.hidden) {
    showInputErrors($("#ui-input-errors"), []);
    const btn = $("#ui-run-sel");
    if (btn) btn.disabled = false;
    return [];
  }
  const visible = (id) => {
    const f = $(id);
    return f && !f.hidden && f.offsetParent !== null;
  };
  const liEl = $("#li-normal");
  const fields = [];
  if (visible("#li-normal-field")) fields.push({ el: liEl, check: wholeIn("Line items", 1, Number(liEl?.max) || undefined) });
  if (visible("#li-boq-field")) fields.push({ el: $("#li-boq"), check: wholeIn("BOQ items", 1, Number($("#li-boq")?.max) || undefined) });
  fields.push({ el: $("#ui-vendors"), check: wholeIn("Vendors invited", 1, 50) });
  const qtyBoxes = [...document.querySelectorAll("#ui-qty-boxes input")];
  qtyBoxes.forEach((b, i) =>
    fields.push({ el: b, check: positiveQty(qtyBoxes.length > 1 ? `Quantity, item ${i + 1}` : "Quantity") }),
  );
  const problems = inputProblems(fields);
  showInputErrors($("#ui-input-errors"), problems);
  const btn = $("#ui-run-sel");
  if (btn) {
    btn.disabled = problems.length > 0;
    btn.title = problems.length ? "Fix the settings in red first" : "Runs the browser journeys for everything ticked below";
  }
  return problems;
}

/** Keeps the run button honest about how much work it is about to do. */
function syncRunButton() {
  const btn = $("#t-run");
  if (!btn) return;
  const cases = featureGroups.reduce(
    (n, g) => n + g.children.reduce((m, c) => m + (selected.has(c.id) ? c.cases || 0 : 0), 0),
    0,
  );
  btn.innerHTML = ico("play") + (cases ? ` Run ${cases} selected test${cases === 1 ? "" : "s"}` : " Run selected tests");
  validateApiInputs();
}

/**
 * Points the run's reports at the run that just happened.
 *
 * Before this, the links in the centre were always visible and always meant
 * "everything the platform has ever run" — so after finishing one journey you
 * could open a report about someone else's. Now they appear when a run ends,
 * and carry that run: its id for the test report, its module for the sheet.
 */
function showReportsFor({ label, testHref, bugHref, testLabel = "Test report" }) {
  const bar = $("#report-bar");
  if (!bar) return;
  $("#report-bar-label").textContent = label;
  const test = $("#open-api-report");
  const bugs = $("#open-bug-sheet");
  test.innerHTML = ico("chart-column") + " " + esc(testLabel);
  test.href = testHref;
  bugs.href = bugHref;
  bar.hidden = false;

  // The popup offers the same two, so a reader lands in the same place
  // whichever they click.
  const modalReport = $("#modal-report");
  const modalBugs = $("#modal-bugs");
  if (modalReport) { modalReport.href = testHref; modalReport.innerHTML = ico("chart-column") + " " + esc(testLabel); }
  if (modalBugs) modalBugs.href = bugHref;
}

/** The bug sheet, narrowed to the module a run covered. */
function bugHrefForSelection() {
  const module = selectedModuleLabel();
  return "/api/bug-report" + (module ? "#module=" + encodeURIComponent(module) : "");
}

/**
 * QUANTITY, ONE BOX PER LINE ITEM.
 *
 * A single "5 or 5,10" text box left people unsure whether one number meant
 * every line item or just the first. Now there is a box per line item, or one
 * box when "same for all" is ticked; #api-qty holds what the run sends —
 * "5" for all, or "5,10" one per item.
 */
function renderQtyBoxesFor(prefix, countSel, onChange) {
  const wrap = $(`#${prefix}-qty-boxes`);
  const hidden = $(`#${prefix}-qty`);
  if (!wrap || !hidden) return;
  // Never more boxes than the company allows: an out-of-range count is
  // reported by the validator, not drawn as 90 boxes the run would refuse.
  const ceiling = Number($(countSel)?.max) || 100;
  const typed = Number($(countSel)?.value);
  const n = Number.isInteger(typed) && typed >= 1 ? Math.min(typed, ceiling) : 1;
  // With one line item there is nothing to choose between.
  const mode = $(`#${prefix}-qty-mode`);
  if (mode) mode.hidden = n === 1;
  const same = n === 1 || $(`#${prefix}-qty-same`)?.checked !== false;
  mode?.querySelectorAll(".qty-mode-btn").forEach((b) => {
    const on = (b.dataset.same === "1") === same;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", String(on));
  });
  const current = String(hidden.value || (prefix === "ui" ? "10" : "5")).split(",").map((x) => x.trim()).filter(Boolean);
  const want = same ? 1 : n;
  // Keep what was typed; a new box starts from the first quantity.
  const values = Array.from({ length: want }, (_, i) => current[i] ?? current[0] ?? (prefix === "ui" ? "10" : "5"));
  if (wrap.children.length !== want || wrap.dataset.same !== String(same)) {
    wrap.innerHTML = "";
    wrap.dataset.same = String(same);
    values.forEach((v, i) => {
      const box = el("label", "qty-box");
      if (!same) box.textContent = `Item ${i + 1}`;
      const input = el("input");
      input.type = "number";
      input.min = "0";
      input.step = "any";
      input.value = v;
      input.setAttribute("aria-label", same ? "Quantity for every line item" : `Quantity for line item ${i + 1}`);
      input.addEventListener("input", () => {
        hidden.value = [...wrap.querySelectorAll("input")].map((x) => x.value.trim()).join(",");
        onChange();
      });
      box.appendChild(input);
      wrap.appendChild(box);
    });
  }
  hidden.value = [...wrap.querySelectorAll("input")].map((x) => x.value.trim()).join(",");
}

function renderQtyBoxes() {
  renderQtyBoxesFor("api", "#api-line-items", syncApiInputs);
}

function renderUiQtyBoxes() {
  renderQtyBoxesFor("ui", "#li-normal", validateUiInputs);
}

/** The RFP suite's own rules for its inputs, said before a run is started. Null when fine. */
function rfpInputProblem(n, qty, vendors) {
  if (!(Number.isInteger(n) && n >= 1 && n <= 50)) return "Line items must be a whole number from 1 to 50.";
  if (!(Number.isInteger(vendors) && vendors >= 1 && vendors <= 50)) return "Vendors must be a whole number from 1 to 50.";
  if (qty) {
    const list = qty.split(",").map((x) => x.trim());
    if (list.some((x) => !(Number(x) > 0))) return `Every quantity must be a number above 0 — “${qty}” is not.`;
    if (list.length > 1 && list.length !== n) {
      return `${list.length} quantities for ${n} line item${n === 1 ? "" : "s"} — give one quantity for all, or exactly ${n}.`;
    }
  }
  return null;
}

function runSelectedFeatures() {
  const ids = [...selected];
  if (featureSuite && ids.length) return runRfpSuite(ids);
  if (!ids.length) {
    // Said where the reader is standing — navigating first would hide it.
    const meta = $("#api-meta");
    if (meta) meta.textContent = "tick at least one feature first";
    $("#auto-summary").textContent = "tick at least one feature first";
    return;
  }
  const names = ids.map(featureLabel);
  window.spineSession?.begin({
    kind: "features",
    mode: "api",
    text: `Run the API tests for ${names.length > 4 ? `${names.slice(0, 4).join(", ")} and ${names.length - 4} more` : names.join(", ")}`,
  });
  goToRun(`${ids.length} feature${ids.length === 1 ? "" : "s"} · API tests`);
  checkRows = [];
  renderAutomation();

  const qs = new URLSearchParams({ c: String(currentClient), features: ids.join(",") });
  if (customBase) qs.set("base", customBase);
  // Only when the selection actually builds events — otherwise the parameter
  // would travel with runs it cannot affect and read as if it had.
  if (apiLineItemCases()) {
    qs.set("lineItems", String(Math.max(1, Number($("#api-line-items")?.value) || 1)));
    if ($("#api-edges") && !$("#api-edges").checked) qs.set("edges", "0");
    const qty = String($("#api-qty")?.value ?? "").trim();
    if (qty) qs.set("qty", qty);
    qs.set("vendors", String(Math.max(1, Number($("#api-vendors")?.value) || 1)));
  }
  $("#auto-summary").textContent = `starting ${ids.length} feature(s)…`;
  // One-line notes about the run (line-item caps, skips, wait progress) go
  // under the journey list, which is the run's own narration.
  const write = (text, cls) => noteJourney(text, cls);
  const es = new EventSource(`/api/features-run?${qs}`);
  wireRunStream(es, write);
  document.querySelector("#automation")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * Run the RFP suite for the ticked parts.
 *
 * The suite publishes a real event, then (if ticked) reads it back and throws
 * the negative cases at it. Each case arrives as it finishes and becomes a row;
 * the end of the run links this run's own report and bug sheet.
 */
function runRfpSuite(ids) {
  const n = Math.max(1, Number($("#api-line-items")?.value) || 1);
  const qty = String($("#api-qty")?.value ?? "").trim();
  const vendors = Math.max(1, Number($("#api-vendors")?.value) || 1);
  const problem = rfpInputProblem(n, qty, vendors);
  if (problem) {
    const meta = $("#api-meta");
    if (meta) meta.textContent = problem;
    $("#auto-summary").textContent = problem;
    return;
  }
  const parts = featureGroups.flatMap((g) => g.children).filter((f) => selected.has(f.id));
  const planned = parts.reduce((sum, f) => sum + (f.cases || 0), 0) +
    // The publish flow (Technical / RFP only) runs whether or not it was ticked.
    (parts.some((f) => f.id === "events.rfp_only") ? 0 : featureGroups.flatMap((g) => g.children).find((f) => f.id === "events.rfp_only")?.cases || 0);
  window.spineSession?.begin({
    kind: "features",
    mode: "api",
    text: `Publish a real RFP event and run the cases for ${parts.map((f) => f.label).join(" + ")} — ${n} line item${n === 1 ? "" : "s"}, ${vendors} vendor${vendors === 1 ? "" : "s"}`,
  });
  goToRun(`RFP event publish · ${parts.map((f) => f.label).join(" + ")}`, "publishing a real RFP event on the account, then running each case in turn");
  checkRows = [];
  runPlanned = planned;
  renderAutomation();
  showRunLog();
  const con = $("#ui-console");
  if (con) con.innerHTML = "";
  const write = (text, cls) => {
    if (!con) return;
    con.appendChild(el("div", cls || "", esc(text)));
    con.scrollTop = con.scrollHeight;
  };

  // The journey panel: the publish flow's steps (and the read-backs when
  // "Publish event" is ticked) listed up front as "to do", each filled in with
  // what the app did as the suite reports it. Negative cases stay as rows below.
  const rfxMode = ids.includes("events.rfq_only") ? "rfq" : "rfp";
  const journeySteps = (featureSuite?.journey ?? []).filter(
    (st) => (!st.feature || ids.includes(st.feature)) && (!st.mode || st.mode === rfxMode),
  );
  const journeyIndex = new Map(journeySteps.map((st, i) => [st.id, i]));
  if (journeySteps.length) {
    journeyLive = {
      label: rfxMode === "rfq" ? "RFQ only" : "Technical / RFP only",
      steps: journeySteps.map((st, i) => ({ n: i + 1, kind: st.id, title: st.title, actor: st.actor })),
    };
    journeyStepsLive = [];
    journeyPlanned = journeySteps.length;
    journeyRecord = null;
    journeyProgress = "";
    runPendingHint = `Walking the RFP journey — ${journeySteps.length} steps, from signing in to ${ids.includes("bids.place") ? "a vendor bidding from the portal" : ids.includes("bids.surrogate") ? "placing a surrogate bid" : ids.includes("events.publish") ? "reading the published event back" : "publishing"}.`;
    renderJourney();
  }
  const runStarted = Date.now();

  const qs = new URLSearchParams({ c: String(currentClient), features: ids.join(","), lineItems: String(n), vendors: String(vendors) });
  if (qty) qs.set("qty", qty);
  if (ids.includes("bids.surrogate")) qs.set("sbBids", String(Math.max(1, Number($("#api-sb")?.value) || 1)));
  if (ids.includes("bids.place")) qs.set("vbBids", String(Math.max(1, Number($("#api-vb")?.value) || 1)));
  $("#auto-summary").textContent = `publishing an RFP event with ${n} line item${n === 1 ? "" : "s"}…`;
  const es = new EventSource(`/api/rfp-run?${qs}`);
  watchStreamEnd(es);
  let runId = null;
  let stopped = null;

  es.addEventListener("start", (ev) => {
    const d = JSON.parse(ev.data);
    runId = d.runId || runId;
    write(d.line, "cmd");
  });
  es.addEventListener("log", (ev) => write(JSON.parse(ev.data).line));
  es.addEventListener("run-error", (ev) => {
    const line = JSON.parse(ev.data).line || "run error";
    write("✗ " + line, "bad");
    runEmptyNote = line;
  });
  es.addEventListener("case", (ev) => {
    const { case: c } = JSON.parse(ev.data);
    if (c.part === "publish" && c.verdict === "fail" && !stopped) stopped = c;
    if (journeyIndex.has(c.id)) {
      const i = journeyIndex.get(c.id);
      const plan = journeyLive.steps[i];
      journeyStepsLive[i] = {
        n: i + 1,
        kind: c.id,
        actor: plan.actor,
        title: plan.title,
        // A step that answered 2xx but failed a check did its job — it found a
        // problem. "Broken" is kept for a step that failed or stopped the flow.
        verdict:
          c.verdict === "pass"
            ? "worked"
            : c.verdict === "not-run"
              ? "not-run"
              : c.status >= 200 && c.status < 300
                ? "issue"
                : c.status >= 400 && c.status < 500
                  ? "refused"
                  : "broken",
        actual: c.verdict === "fail" && c.failed?.length ? `${c.actual} Failed: ${c.failed.join("; ")}.` : c.actual,
        reason: c.reason,
        call: c.method ? { method: c.method, path: c.path } : undefined,
        status: c.status ?? 0,
        ms: c.ms,
      };
      const next = journeyLive.steps[i + 1];
      runCurrentStep = next ? `${next.n}. ${next.title}` : "";
      renderJourney();
      // A journey step is shown there, not again as a row.
      write(`${c.verdict === "pass" ? "✓" : c.verdict === "fail" ? "✗" : "–"} ${c.id} ${c.title}`, c.verdict === "fail" ? "bad" : c.verdict === "pass" ? "ok" : "");
      return;
    }
    const partLabel = { publish: "RFP publish", verify: "RFP verify", negative: "RFP negative" }[c.part] || "RFP";
    checkRows.push({
      id: c.id,
      category: c.kind === "step" ? partLabel : c.kind,
      type: c.kind === "step" ? "functional" : c.kind === "security" ? "non-functional" : "edge",
      module: `RFP event · step ${c.anchor}`,
      scenario: c.plain,
      expected: c.expected.replace(/\.$/, ""),
      pass: c.verdict === "pass",
      inconclusive: c.verdict === "not-run",
      httpStatus: c.status ?? null,
      rightLabel: c.verdict === "not-run" ? "not run" : c.status ? `${c.status} · ${c.ms}ms` : "—",
      verdict:
        c.verdict === "fail" && c.failed?.length
          ? `${c.actual} Failed: ${c.failed.join("; ")}.`
          : c.actual,
      noRerun: true,
    });
    renderAutomation();
    setRunBar(checkRows.length, Math.max(checkRows.length, runPlanned));
    const mark = c.verdict === "pass" ? "✓" : c.verdict === "fail" ? "✗" : "–";
    write(`${mark} ${c.id} ${c.title}`, c.verdict === "fail" ? "bad" : c.verdict === "pass" ? "ok" : "");
  });
  es.addEventListener("done", (ev) => {
    const d = JSON.parse(ev.data);
    runId = d.runId || runId;
    es.close();
    runFinished();
    const s = d.summary;
    const e = d.event || {};
    const verdict = !s
      ? `RFP run stopped (exit ${d.exitCode ?? "?"}).`
      : e.published
        ? `Published “${e.title}” (${e.eventGroupUuid}) — ${s.passed} of ${s.total} cases passed` +
          (s.failed ? `, ${s.failed} failed` : "") + (s.notRun ? `, ${s.notRun} not run` : "") + "."
        : stopped
          ? `The event was not published — the flow stopped at ${stopped.id} (${stopped.title}). Everything after it was not run.`
          : `The event was not published — ${s.failed} case(s) failed.`;
    $("#auto-summary").textContent = verdict;
    if (journeyLive) {
      journeyRecord = {
        outcome: e.published ? `Published “${e.title}” (${e.eventGroupUuid})` : stopped ? `Stopped at step ${stopped.id} — ${stopped.title}` : "The event was not published",
        stoppedAt: e.published ? undefined : stopped ? journeyIndex.get(stopped.id) + 1 : 1,
        durationMs: Date.now() - runStarted,
      };
      renderJourney();
    }
    write(d.exitCode === 0 ? "— finished —" : `— finished, exit ${d.exitCode} —`, d.exitCode === 0 ? "ok" : "bad");
    if (runId && s) {
      const scope = `?run=${encodeURIComponent(runId)}`;
      showReportsFor({
        label: "This RFP run:",
        testLabel: "RFP test report",
        testHref: `/api/rfp-report${scope}`,
        bugHref: `/api/bug-report${scope}`,
      });
      showRunComplete({
        total: s.total,
        passed: s.passed,
        failed: s.failed,
        skipped: s.notRun,
        subtitle: verdict,
        reportNote: "The report walks the collection step by step, with every negative case under the step it attacks, and a curl for each call.",
      });
    }
  });
  document.querySelector("#automation")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * ONE TEST CASE, RUN AGAINST THE API, THE UI, OR BOTH.
 *
 * Typed or pasted into the same box as everything else. "API" matches it
 * against a real registered contract case and runs that case for real — no
 * guessing, and an honest "nothing matched" row when it cannot place it.
 * "UI" compiles it into a browser step plan and runs that live (the same
 * pipeline `runTestCase` already drives, via the Automation-run panel).
 *
 * The API result gets its own small card rather than joining `checkRows` —
 * that shared list is the UI compiler's own step-by-step table, and the two
 * would otherwise interleave into one unreadable table the moment both ran.
 * "Both" runs API first, then UI, so the API card stays on screen as its own
 * answer while the UI run fills the panel below it — one glance tells you
 * whether a failure is the API, the UI, or both.
 */
function renderApiInstructResult(state, row) {
  const box = $("#api-instruct-result");
  if (!box) return;
  box.hidden = false;
  if (state === "running") {
    box.className = "api-result running";
    box.innerHTML = `Matching &amp; running…`;
    return;
  }
  const badge = row.pass ? "✓ Passed" : row.inconclusive ? "– Not run" : "✗ Failed";
  box.className = `api-result ${row.pass ? "ok" : row.inconclusive ? "skip" : "bad"}`;
  box.innerHTML =
    `<div class="api-result-head"><span class="api-result-badge">${esc(badge)}</span>${row.scenario ? ` ${esc(row.scenario)}` : ""}</div>` +
    (row.inputSummary ? `<div class="api-result-meta">${esc(row.inputSummary)}${row.httpStatus ? ` → HTTP ${row.httpStatus}` : ""}</div>` : "") +
    `<div class="api-result-verdict">${esc(row.message || row.verdict || "")}</div>`;
}

function runApiInstruction(text, onEnd) {
  renderApiInstructResult("running");
  window.spineSession?.working("Matching it to the case library");
  const qs = new URLSearchParams({ c: String(currentClient), text });
  const es = new EventSource(`/api/run-case-api?${qs}`);
  watchStreamEnd(es);
  apiRunning = es;
  const stopBtn = $("#run-stop-btn");
  if (stopBtn) stopBtn.hidden = false;
  // Every check this stream sent, for the session's closing box.
  const rows = [];
  const end = (error) => {
    apiRunning = null;
    syncStopBtn();
    window.spineSession?.apiEnd(rows, error);
    // Run (Both) goes on to the browser part; Run (API) is over here.
    if (onEnd) onEnd();
    else window.spineSession?.idle();
  };
  let lastRow = null;
  es.addEventListener("line", (ev) => {
    const line = String(JSON.parse(ev.data).line ?? "").trim();
    if (!line) return;
    // What the run could not cover is worth keeping; progress only replaces the clock's words.
    if (/^(not covered|this company allows)/i.test(line)) window.spineSession?.note(line, "info");
    else window.spineSession?.working(line);
  });
  es.addEventListener("check", (ev) => {
    lastRow = JSON.parse(ev.data).check;
    renderApiInstructResult("result", lastRow);
    const at = rows.findIndex((r) => r.id === lastRow.id);
    if (at >= 0) rows[at] = lastRow;
    else rows.push(lastRow);
    window.spineSession?.apiCheck(lastRow);
  });
  es.addEventListener("done", () => {
    es.close();
    end();
  });
  es.addEventListener("fatal", (ev) => {
    es.close();
    const message = JSON.parse(ev.data).message || "run error";
    renderApiInstructResult("result", { pass: false, scenario: text, message, verdict: "error" });
    end(message);
  });
}

function runInstruction(mode) {
  const text = $("#request").value.trim();
  if (!text) return;
  // The ask opens a turn on the Run screen's session (public/session.js) —
  // a new session, or the next turn of this one when it came from its composer.
  window.spineSession?.begin({ text, mode, kind: "typed" });
  if (mode === "ui") return runTestCase();
  if (mode === "api") return runApiInstruction(text);
  // both: API first (its own card), then the UI compiler fills the panel below.
  runApiInstruction(text, () => runTestCase());
}

/**
 * Why a case did not run, sorted by what the reader can do about it. The
 * runner's reasons are precise but written for whoever wrote the runner
 * ("a request nobody perturbed", "app_auth_config.yml"); these are the same
 * reasons for a tester.
 */
const SKIP_GROUPS = {
  incomplete: { order: 0, tone: "bad", label: "The test case needs fixing",
    what: "The case says what to change, but its request is just a normal valid one — the bad value it describes was never put in. Running it would prove nothing. Edit the case so the request carries the change, and it will run." },
  setup: { order: 1, tone: "warn", label: "Needs a setup the run can't build yet",
    what: "The case needs the event to be in a particular state first (an existing bid, a rejected vendor, another company's data…). The run doesn't create that state, so it waits until it can." },
  setting: { order: 2, tone: "mute", label: "Doesn't apply to this company",
    what: "The rule only exists when a company setting is switched a certain way, and this company has it the other way. Run it on a company with that setting." },
  login: { order: 3, tone: "mute", label: "Can't be tried from this login",
    what: "The app turns this kind of login away before it ever reaches the rule being tested — and doing so would sign the test out and stop every case after it. So it is held back." },
  other: { order: 4, tone: "mute", label: "Other reasons", what: "" },
};

function skipGroup(reason) {
  const r = reason.toLowerCase();
  let key = "other";
  if (r.includes("nobody perturbed") || r.includes("give the case its own body")) key = "incomplete";
  else if (r.includes("app gate") || r.includes("not authorized to use this api") || r.includes("signs the session out") || r.includes("marks that session logged out")) key = "login";
  else if (r.includes("only holds when") || /company setting|is (on|off) (for|here)/.test(r)) key = "setting";
  else if (/^needs |does not build|cannot build|has no access|cannot be put there/.test(r)) key = "setup";
  return { key, ...SKIP_GROUPS[key] };
}

/**
 * The compiler's gaps as one list. Each gap is often a whole sentence ending
 * in a full stop, so joined as they came they read "login.; The missing…"
 * and end "assertion.." — the stops come off before the join.
 */
function gapWords(gaps) {
  return (gaps || []).map((g) => String(g).trim().replace(/[\s.;,]+$/, "")).filter(Boolean).join("; ");
}

/** "QA_Platform_live_add_to_closed_stage_95" → "Live add to closed stage". */
function plainCaseTitle(t) {
  const s = String(t).replace(/^QA_Platform_/, "").replace(/^(stg|dboq)_/, "").replace(/_\d+$/, "").replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The one line under each case: the specific thing it is waiting on. */
function skipPlainReason(reason, key) {
  const words = (k) => k.replace(/_/g, " ");
  if (key === "incomplete") {
    const m = reason.match(/the change it describes \((.+?)\) is not in the payload/);
    return m ? `Meant to send: ${m[1]} — but the request doesn't include it.` : "Its request doesn't include the change it describes.";
  }
  if (key === "setting") {
    const m = reason.match(/"([a-z0-9_]+)" is (ON|OFF)/i) || reason.match(/needs ([a-z0-9_ ]+) (ON|OFF)/i);
    const have = /it is (ON|OFF)/i.exec(reason);
    return m ? `Needs "${words(m[1])}" switched ${m[2].toLowerCase()}; here it is ${have ? have[1].toLowerCase() : "the other way"}.` : "A company setting is the other way here.";
  }
  if (key === "setup") {
    const m = reason.match(/^needs (.+?)(?:, which| — |$)/);
    return m ? `Needs ${m[1]}.` : "Needs a starting state the run doesn't build.";
  }
  if (key === "login") {
    return /supplier app may not|vendor's session may not/i.test(reason)
      ? "A vendor's login isn't allowed to make this call at all."
      : "The buyer's web login isn't allowed to make this call; it needs a different app's login (e.g. the vendor or mobile app).";
  }
  return reason;
}

function wireRunStream(es, write, onEnd) {
  watchStreamEnd(es);

  /**
   * THE JOURNEY, AS IT HAPPENS.
   *
   * The server walks the Postman collection first — sign in, create the
   * draft, add the rounds, publish, respond as the vendor, wait, evaluate,
   * award — and narrates each step. The plan arrives before any call is made,
   * so the whole list is on screen at once with every step still to come;
   * each then fills in with what the app actually did, and the one in flight
   * says so. The wait step reports its progress as plain lines.
   */
  es.addEventListener("journey-plan", (ev) => {
    const p = JSON.parse(ev.data);
    const kinds = p.plan?.steps ?? [];
    journeyLive = {
      label: p.plan?.label ?? "",
      steps: p.steps ?? kinds.map((kind, i) => ({ n: i + 1, kind, title: kind.replace(/_/g, " "), actor: "" })),
    };
    journeyStepsLive = [];
    journeyRecord = null;
    journeyProgress = "";
    renderJourney();
    // Re-word the waiting card for what is actually happening. Written
    // directly rather than through setRunPending, which would also restart
    // the elapsed clock — this is the same run, a second in.
    runPendingHint =
      `Walking the ${journeyLive.label} journey — ${journeyLive.steps.length} steps, from signing in to ${
        { publish: "publishing", bid: "the vendor's bid", evaluate: "evaluation" }[p.plan?.reach] ?? "awarding"
      }.`;
    renderAutomation();
  });
  es.addEventListener("journey-step", (ev) => {
    const { step, planned } = JSON.parse(ev.data);
    if (!step) return;
    journeyStepsLive[step.n - 1] = step;
    if (step.call) {
      window.spineSession?.request({
        key: `journey:${step.n}`,
        method: step.call.method,
        path: step.call.path,
        status: step.status,
        ms: step.ms,
        title: `${step.n}. ${step.title}`,
        pass: step.verdict === "worked" ? true : step.verdict === "broken" ? false : null,
        body: step.call.body,
        reply: step.response,
        message: step.message,
      });
    }
    if (planned) journeyPlanned = planned;
    journeyProgress = "";
    // The card's "Currently:" line names what is in flight NOW — the next
    // planned step — not the one that just finished.
    const next = journeyLive?.steps?.[step.n];
    runCurrentStep = next ? `${next.n}. ${next.title}` : "";
    tickRunCard();
    renderJourney();
  });
  es.addEventListener("line", (ev) => {
    const line = String(JSON.parse(ev.data).line ?? "").trim();
    if (!line) return;
    journeyProgress = line;
    runCurrentStep = line;
    tickRunCard();
    renderJourney();
  });
  es.addEventListener("journey", (ev) => {
    journeyRecord = JSON.parse(ev.data).journey ?? null;
    journeyProgress = "";
    runCurrentStep = "the journey is finished — now running the ticked cases as variations";
    tickRunCard();
    renderJourney();
  });

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
    // A journey run carries no library cases; saying "0 checks from 0 cases"
    // would read as nothing happening while fifteen steps are on screen.
    $("#auto-summary").textContent = p.pasted
      ? `${p.cases} test cases, run in the order you wrote them`
      : p.cases
      ? `${p.runnable} checks from ${p.cases} cases` + (planSkipped ? ` · ${planSkipped} skipped` : "")
      : journeyLive
        ? `the ${journeyLive.label} journey, step by step`
        : "nothing to run for this selection";
    setRunBar(0, p.runnable || 1);

    /**
     * What the line-item count actually reached.
     *
     * Written into the run output, not just onto the control, because the two
     * numbers that matter — how many cases took the count and how many kept
     * their own — are only known once the server has been through the set. A
     * knob that silently applies to two thirds of a run is how a report ends up
     * claiming to have tested a size it never tested.
     */
    const li = p.lineItems;
    if (li && li.requested) {
      if (li.capped) {
        write(
          `${li.asked} line items was more than this company allows (max ${li.limit}) — ran with ${li.requested}`,
          "note",
        );
      }
      const kept = li.held?.length ?? 0;
      write(
        `Line items per event: ${li.requested} — used by ${li.expanded} of ${li.eligible} event-creating cases` +
          (kept ? `; the other ${kept} keep their own count because they test a specific number or a broken line item` : ""),
        "note",
      );
    }

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
    // Grouped by what a reader can do about it, in plain words; the runner's
    // own wording stays one click away for whoever is fixing the case.
    const groups = new Map();
    for (const s of p.skipped) {
      const g = skipGroup(s.reason || "");
      if (!groups.has(g.key)) groups.set(g.key, { ...g, items: [] });
      groups.get(g.key).items.push(s);
    }
    for (const g of [...groups.values()].sort((a, b) => a.order - b.order)) {
      box.appendChild(
        el("p", `skip-group skip-${g.tone}`,
          `<b>${esc(g.label)} · ${g.items.length}</b><span>${esc(g.what)}</span>`),
      );
      const list = el("ul", "skip-list");
      for (const s of g.items) {
        list.appendChild(
          el("li", "",
            `<b>${esc(plainCaseTitle(s.title || s.id))}</b>` +
            `<span>${esc(skipPlainReason(s.reason || "", g.key))}</span>` +
            `<details><summary>technical reason</summary>${esc(s.reason || "no reason given")}</details>`),
        );
      }
      box.appendChild(list);
    }
  });
  es.addEventListener("check", (ev) => {
    const check = JSON.parse(ev.data).check;
    const i = checkRows.findIndex((c) => c.id === check.id);
    if (i >= 0) checkRows[i] = check;
    else checkRows.push(check);
    renderAutomation();
    if (check.request?.method) {
      window.spineSession?.request({
        key: `check:${check.id}`,
        method: check.request.method,
        path: check.request.path,
        status: check.httpStatus,
        ms: check.durationMs,
        title: `${check.id} · ${check.scenario || ""}`,
        pass: check.inconclusive ? null : !!check.pass,
        body: check.request.body,
        message: check.message,
      });
    }
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
    loadCaseBook();
    let d = {};
    try {
      d = JSON.parse(ev.data) || {};
    } catch {}
    const failed = checkRows.filter((c) => !c.pass && !c.inconclusive).length;
    // Whatever the plan said, what ran is what ran.
    runPlanned = checkRows.length;
    const walked = journeyStepsLive.filter(Boolean).length;
    if (!checkRows.length) {
      // A run that walked the journey and had no cases to try afterwards is
      // not an empty run — the journey above is its result.
      runEmptyNote = walked
        ? `The journey above is this run's result: ${walked} step${walked === 1 ? "" : "s"} were walked. ` +
          (planSkipped
            ? `The ${planSkipped} ticked case${planSkipped === 1 ? "" : "s"} did not run — the reasons are under <b>why cases were skipped</b> above.`
            : "No library cases were ticked to run after it.")
        : planSkipped
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
    const runId = d.runId || "";
    showReportsFor({
      label: "This run:",
      testHref: "/api/test-report" + (runId ? `?run=${encodeURIComponent(runId)}` : ""),
      // Scoped to the run, not the module: the sheet opened after a run should
      // list what THAT run found, not every bug the platform has ever seen.
      bugHref: runId ? `/api/bug-report?run=${encodeURIComponent(runId)}` : bugHrefForSelection(),
    });

    const refused = authRefusal(checkRows);
    // The journey's own verdict travels with the run's: "0 failed" says
    // nothing when the vendor could not sign in at step 7.
    const journey = d.journey
      ? {
          outcome: d.journey.outcome,
          stoppedAt: d.journey.stoppedAt,
          worked: journeyStepsLive.filter((st) => st && st.verdict === "worked").length,
          steps: walked,
        }
      : null;
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
      journey,
    });
    onEnd?.();
  });
  es.addEventListener("fatal", (ev) => {
    es.close();
    runFinished();
    setRunBar(0, 0);
    const message = JSON.parse(ev.data).message || "run failed";
    $("#auto-summary").textContent = `error: ${message}`;
    showRunComplete({ total: checkRows.length, passed: 0, failed: checkRows.length, error: message });
    onEnd?.();
  });
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
  validateUiInputs();
}

function renderUiTree() {
  const box = $("#ui-tree");
  if (!box) return;
  // Same rule as the API tree: an event has one type, so one journey of the
  // four can be picked for a run.
  syncExclusive(uiSelected, byUiFlow);
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

    // Journey position. The tree is ordered the way a buyer walks the product,
    // but order alone is invisible once a reader scrolls — the number says it.
    // Supporting groups (master data, users, vendors, config) carry no step and
    // get a dot, because they are not a stage anybody passes through.
    const stepBadge = el("span", "module-step" + (g.step ? "" : " nostep"), g.step ? String(g.step) : "·");
    stepBadge.title = g.step ? `Step ${g.step} of the procure-to-pay journey` : "Set up underneath the journey, not a stage of it";
    head.appendChild(stepBadge);

    head.appendChild(el("span", "module-ico", groupIco(g)));
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
      const heldBy = available ? exclusiveHolder(f, uiSelected, byUiFlow) : null;
      const row = el("div", "submodule" + (available ? "" : " none") +
        (heldBy ? " blocked" : "") +
        (available && uiSelected.has(f.uiFlow) ? " picked" : ""));
      if (available) row.dataset.flow = f.uiFlow;
      const cb = el("input");
      cb.type = "checkbox";
      cb.disabled = !available || !!heldBy;
      cb.checked = available && uiSelected.has(f.uiFlow);
      cb.title = heldBy
        ? `One event type per run — untick “${heldBy.label}” to pick this instead`
        : "";
      cb.addEventListener("click", (e) => e.stopPropagation());
      if (!heldBy) {
        cb.addEventListener("change", () => {
          cb.checked ? uiSelected.add(f.uiFlow) : uiSelected.delete(f.uiFlow);
          renderUiTree();
        });
      }
      row.appendChild(cb);

      const name = el("span", "sub-name");
      name.innerHTML = esc(f.label) + (available
        ? ` <span class="sub-tag e2e" title="browser journey: ${esc(f.uiFlow)}">${esc(f.uiFlow)}</span>`
        : f.uiCoveredBy
          ? ` <span class="sub-tag covered" title="no journey of its own — it is done as part of ${esc(f.uiCoveredBy)}">covered by ${esc(f.uiCoveredBy)}</span>`
          : ' <span class="sub-tag notbuilt" title="no browser journey built for this feature yet">not built</span>') +
        (heldBy
          ? ` <span class="sub-tag held" title="${esc(
              `An event has one type. “${heldBy.label}” is picked for this run; untick it to choose this one.`,
            )}">one type per run</span>`
          : "");
      row.appendChild(name);
      if (available && !heldBy) {
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
  const journeyNames = keys.map((k) => uiFlows.find((f) => f.key === k)?.label || k);
  window.spineSession?.begin({
    kind: "journeys",
    mode: "ui",
    text: `Run in the browser: ${journeyNames.join(", ")}`,
  });
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
  login: { label: "Signing in", icon: "key-round" },
  erfx: { label: "Preparing the line items", icon: "clipboard-list" },
  "create-event": { label: "Creating the event", icon: "receipt" },
  "event-detail": { label: "On the event", icon: "search" },
  award: { label: "Awarding", icon: "trophy" },
  plan: { label: "Running the plan", icon: "map" },
  healer: { label: "Healing a broken step", icon: "bot" },
  learned: { label: "Learned a locator", icon: "brain" },
  stuck: { label: "Stuck", icon: "construction" },
  oracle: { label: "Verdict", icon: "scale" },
  playwright: { label: "The browser run", icon: "play" },
  "po-to-bill": { label: "Purchase order to bill", icon: "receipt" },
  queue: { label: "Waiting for the browser", icon: "hourglass" },
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
    // A feature id ("events.rfq_only") is named the way the tree names it.
    const last = test[2].split("›").pop().trim();
    const title = /^[a-z_]+(\.[a-z_]+)+$/.test(last) ? featureLabel(last) : last;
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
    write?.(line, "note");
    window.spineSession?.working(`${line} — it starts by itself as soon as the browser is free`);
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
      const meta = UI_PHASES[phase] ?? { label: phase, icon: "circle-dashed" };
      const head = el("div", "ui-phase");
      head.innerHTML = `<span class="ui-phase-ico">${ico(meta.icon)}</span><span>${esc(meta.label)}</span>`;
      box.appendChild(head);
    }
    const row = el("div", "ui-step " + s.kind);
    const mark = { ok: "✓", bad: "✗", warn: "!", info: "·" }[s.kind] ?? "·";
    row.innerHTML =
      `<span class="ui-step-mark">${mark}</span><span class="ui-step-text">${esc(CaseView.scrub(s.text))}` +
      (s.rounds ? ` <span class="ui-step-n">${s.rounds} attempts</span>` : "") +
      `</span>`;
    row.title = s.raw;
    box.appendChild(row);
  }
}

// ── browser journeys: run the real Playwright UI flows from a button ──────
let uiFlows = [];
/** Whether this account's browser journeys have been read yet (Plan a run waits for it). */
let uiFlowsLoaded = false;
let uiLimits = null;
let uiRunning = null; // EventSource of the active run
let apiRunning = null; // EventSource of the active Run (API) instruction match

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
    const info = await (await fetch("/api/po-input?c=" + currentClient + baseParam())).json();
    if (!info.account) {
      bar.hidden = true;
      setSingleRunner(false);
      planChanged();
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
    planChanged();
  } catch {
    bar.hidden = true;
    setSingleRunner(false);
    planChanged();
  }
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
  btn.innerHTML = ico("play") + " Running…";
  $("#auto-summary").textContent = "creating a purchase order…";

  // Always submitted for approval: a purchase order that stops after its line
  // items is not a purchase order anyone raised, and the toggle only offered a
  // way to run half the flow by accident.
  const qs = new URLSearchParams({ c: String(currentClient) });
  if (customBase) qs.set("base", customBase);
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
        "The account's token has expired — every call is being refused (401). Refresh it in the API suite's .env and run again.",
      );
      con.insertBefore(banner, con.firstChild);
    } else if (!sawAuthFailure && /not authorized|code.{0,3}455/i.test(line)) {
      sawAuthFailure = true;
      const banner = el(
        "div",
        "bad",
        "The login works, but this account is not allowed to read the data this flow needs " +
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
    btn.innerHTML = ico("play") + " Run PO automation";

    // A PO run has its own report — every phase, every call, and the curl for
    // it — so point at that rather than at the API case report.
    const scope = poRunId ? `?run=${encodeURIComponent(poRunId)}` : "";
    showReportsFor({
      label: "This PO run:",
      testLabel: "PO run report",
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
      btn.innerHTML = ico("play") + " Run PO automation";
    }
  };
}

async function loadUiFlows() {
  const box = $("#ui-tree");
  uiFlowsLoaded = false;
  try {
    const { flows, limits, erfxMode, boqAllowed, note } = await (
      await fetch("/api/ui-flows?c=" + currentClient + baseParam())
    ).json();
    uiFlows = flows;
    uiFlowsLoaded = true;
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
    renderUiQtyBoxes();
    // The API side reads the same ceiling. The server clamps to it regardless,
    // but showing it here means nobody types 50 and waits for a run to explain.
    const apiMax = $("#api-li-max");
    if (apiMax) apiMax.textContent = nonBoq ? `max ${nonBoq}` : "";
    const apiLi = $("#api-line-items");
    if (apiLi && nonBoq) {
      apiLi.max = nonBoq;
      if (Number(apiLi.value) > nonBoq) apiLi.value = String(nonBoq);
    }
    syncApiInputs();
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
    planChanged();
  } catch {
    box.innerHTML = "";
    box.appendChild(el("div", "empty", "Could not load browser journeys."));
    uiFlowsLoaded = true;
    planChanged();
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
    testLabel: "UI run report",
    testHref: url,
    // This journey's own findings, not the all-time sheet.
    //
    // It used to ask `bugHrefForSelection()`, which reads the API tree's
    // tick-boxes — empty during a browser journey — so the button fell through
    // to the unscoped sheet and opened the hand-raised PO list right after a PR
    // journey. The server resolves this id against the journey's findings.
    bugHref: `/api/bug-report?run=${encodeURIComponent(runId)}`,
  });
  // Watching the run in its session, the report is a link on the journey's
  // DONE / FAILED box rather than a tab that takes the screen away.
  if (auto && !window.spineSession?.showing()) window.open(url, "_blank", "noopener");
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
  if (customBase) qs.set("base", customBase);
  // Only send the count the journey actually uses.
  if (flow.usesLineItems) {
    if (flow.boq) qs.set("boqItems", $("#li-boq").value || "1");
    else qs.set("lineItems", $("#li-normal").value || "1");
    const qty = String($("#ui-qty")?.value ?? "").trim();
    if (qty) qs.set("qty", qty);
  }
  qs.set("vendors", String(Math.max(1, Number($("#ui-vendors")?.value) || 1)));
  // Watched in the live panel beside the steps, like Run (UI): always headless,
  // because a real window and the screenshot feed fight each other (stutter).
  // "show the browser" now means that panel.
  qs.set("headed", "0");
  const showFrames = $("#ui-headed")?.checked !== false;
  // Sign in through the login screen, so the watcher sees it and the login page is tested.
  if ($("#ui-login")?.checked) qs.set("login", "1");

  const es = new EventSource(`/api/ui-run?${qs}`);
  const framePanel = $("#live-frame-panel");
  const frameImg = $("#live-frame");
  if (framePanel) framePanel.hidden = true;
  if (frameImg) frameImg.removeAttribute("src");
  es.addEventListener("frame", (ev) => {
    if (!showFrames || !frameImg) return;
    const { frame } = JSON.parse(ev.data);
    if (!frame) return;
    frameImg.src = `data:image/jpeg;base64,${frame}`;
    if (framePanel) framePanel.hidden = false;
    window.spineSession?.frame();
  });
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
  es.addEventListener("note", (ev) => write(JSON.parse(ev.data).line, "note"));
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
      write(`${meta.label.toUpperCase()} · ${v.severity} — ${v.title}`, v.actionable ? "bad" : "note");
      write(`   ${v.rationale}`, "note");
      for (const e of v.evidence ?? []) write(`   • ${e}`, "note");
      window.spineSession?.note(`${v.title} — ${v.rationale}`, v.actionable ? "bad" : "info", meta.label);
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
    window.spineSession?.journeyEnd({ label: flow.label || flow.key, code: 1, runId, error: msg });
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
    write(code === 0 ? "✓ The journey passed" : "✗ The journey failed — the report shows where it stopped", code === 0 ? "ok" : "bad");
    btn.classList.remove("running");
    btn.classList.add(code === 0 ? "ok" : "bad");
    es.close();
    window.spineSession?.journeyEnd({ label: flow.label || flow.key, code, runId, took: elapsedInWords(Date.now() - runStartedAt) });
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
      <span class="agent-icon">${ico(AGENT_ICON[e.agent] ?? "bot")}</span>
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
    <span class="agent-icon">${ico(AGENT_ICON[e.agent] ?? "bot")}</span>
    <span class="agent-name">${esc(e.agent)}${badge}</span>
    <span class="agent-title">${esc(e.title)}</span>`;
  if (e.reasoning) card.appendChild(el("div", "agent-reason", esc(e.reasoning)));
  $("#timeline").scrollTop = $("#timeline").scrollHeight;
}

// ── run history (the platform's own memory) ──
/** "events.publish" → "Sourcing events (RFx) › Publish event", from the loaded tree; worded when the tree is not loaded yet. */
function featureLabel(id) {
  for (const g of featureGroups) {
    if (g.id === id) return g.label;
    const c = g.children.find((x) => x.id === id);
    if (c) return `${g.label} › ${c.label}`;
  }
  const w = String(id).replace(/[._]+/g, " ").trim();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

async function loadHistory() {
  const box = $("#history");
  try {
    const { runs } = await (await fetch("/api/runs")).json();
    setGlance("glance-runs", String(runs.length));
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
      // Feature ids ("events.publish") are named the way the tree names them.
      const title = list
        ? list.length === 1
          ? featureLabel(list[0])
          : `${featureLabel(list[0])} + ${list.length - 1} more`
        : r.request;
      /**
       * "clean" has to mean something ran and nothing broke.
       *
       * Every feature run used to read "clean · 0✓ 0✗", because the counts came
       * from an agent report these runs never write. A run that recorded
       * nothing is not clean — it is empty, and says so.
       */
      // A journey has steps, not checks; a PO run has phases. The tag below
      // speaks in whichever the run actually produced.
      const ran = r.kind === "journey" || r.kind === "po" ? 1 : (r.checks ?? r.passed + r.failed);
      const tag =
        r.kind === "journey" || r.kind === "po"
          // One run, one verdict — "1 failed" reads oddly about a single journey.
          ? r.inconclusive
            ? `<span class="tag none">${esc(r.headline ?? "did not finish")}</span>`
            : r.failed
              ? `<span class="tag find">broke</span>`
              : `<span class="tag clean">passed</span>`
          : r.findings
            ? `<span class="tag find">${r.findings} finding${r.findings > 1 ? "s" : ""}</span>`
            : !ran && r.journey?.steps
              // A run that only walked the journey ran plenty — say what it did.
              ? r.journey.stoppedAt
                ? `<span class="tag find">stopped at step ${r.journey.stoppedAt}</span>`
                : `<span class="tag clean">journey passed</span>`
            : !ran
              ? `<span class="tag none">nothing ran</span>`
              : r.failed
                ? `<span class="tag find">${r.failed} failed</span>`
                : `<span class="tag clean">clean</span>`;
      const counts =
        r.kind === "journey"
          ? `<span>${r.steps ?? 0} step${(r.steps ?? 0) === 1 ? "" : "s"}</span>`
          : r.kind === "po"
            ? ""
            : ran
              ? `<span>${r.passed}✓ ${r.failed}✗${r.inconclusive ? ` ${r.inconclusive}≈` : ""}</span>`
              : "";
      const fcs = r.journey?.fieldChecks;
      const fieldChecks = fcs
        ? `<span class="${fcs.failed ? "fc-bad" : "fc-ok"}" title="Postman-style field checks on every request">field checks ${fcs.passed}/${fcs.total}${fcs.failed ? ` · ${fcs.failed} failed` : ""}</span>`
        : "";
      /**
       * Every card carries its OWN reports.
       *
       * The three buttons at the top of this view open the all-time reports,
       * which is right for them and no help at all here: to read what one run
       * found you had to click the row, then find the link that had changed
       * underneath. A run's reports belong on the run.
       *
       * Which reports exist depends on the kind — a journey has screenshots and
       * no API test report, an API run the reverse — so the server says which,
       * and a link is never offered for a report that would open empty.
       */
      const kindTag =
        r.kind === "journey"
          ? `<span class="run-kind ui">journey</span>`
          : r.kind === "po"
            ? `<span class="run-kind po">PO</span>`
            : list
              ? `<span class="run-kind">tests</span>`
              : `<span class="run-kind ai">AI</span>`;
      const links = (r.reports ?? [])
        .map((l) => `<a class="run-link" href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`)
        .join("");
      // A feature run that walked the collection says how the journey went,
      // in the one sentence the server wrote for it — that is the run's
      // verdict far more than its check counts are.
      const journeyLine = r.journey
        ? `<span class="run-journey ${r.journey.stoppedAt ? "bad" : "ok"}" title="${esc(r.journey.outcome)}">` +
          `${esc(r.journey.outcome)}</span>`
        : "";
      item.innerHTML = `
        <div class="run-req" title="${esc(list ? list.map(featureLabel).join(" · ") : r.request)}">${kindTag}${esc(title)}</div>
        <div class="run-meta">${esc(r.companyName ?? r.id)} · ${esc(when)} ${tag}
          ${counts}${fieldChecks}${journeyLine}</div>
        ${links ? `<div class="run-links">${links}</div>` : ""}
        <button class="run-del" title="Remove this run from the history and from every report built on it">${ico("x")}</button>`;
      // A report link opens the report; it must not also replay the run
      // underneath it.
      for (const a of item.querySelectorAll(".run-link")) {
        a.addEventListener("click", (ev) => ev.stopPropagation());
      }
      item.addEventListener("click", () => {
        // Only an API run has checks to replay into the panel. Opening a
        // journey or a PO run that way showed an empty panel and looked broken;
        // their report IS their result, so go straight to it.
        // It opens at its own address (#/session/{id}), which replays it there.
        if (r.kind === "api" || !r.kind) {
          location.hash = `#/session/${encodeURIComponent(r.id)}`;
          return;
        }
        const first = (r.reports ?? [])[0];
        if (first) window.open(first.href, "_blank", "noopener");
      });
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

/**
 * What a saved run was asked to do, in words a reader knows: feature names
 * instead of "features: events.type_rules, …", no "api plan:" prefix.
 */
function askedInWords(request) {
  const q = String(request ?? "").trim();
  const feats = q.match(/^features:\s*(.+)$/i)?.[1];
  if (feats) {
    const names = feats.split(",").map((s) => featureLabel(s.trim()).split(" › ").pop()).filter(Boolean);
    const shown = names.length > 5 ? `${names.slice(0, 5).join(", ")} and ${names.length - 5} more` : names.join(", ");
    return `Run the API tests for ${shown}`;
  }
  const journey = q.match(/^browser journey:\s*(.+)$/i)?.[1];
  if (journey) return `Run in the browser: ${featureLabel(journey.trim()).split(" › ").pop()}`;
  return q.replace(/^(api plan|api|ui)\s*:\s*/i, "") || "Saved run";
}

async function openRun(id, item) {
  document.querySelectorAll(".run-item.active").forEach((n) => n.classList.remove("active"));
  item?.classList.add("active");
  $("#status").textContent = "viewing saved run";
  try {
    const rec = await (await fetch("/api/runs/" + encodeURIComponent(id))).json();
    execData = { flowResults: rec.flowResults };
    designedCases = null;
    // A saved run opens as a finished session turn: what was asked, then what it did.
    window.spineSession?.begin({ kind: "features", mode: "api", text: askedInWords(rec.request), replay: true, id });
    checkRows = rec.checkResults || [];
    journeyFromRecord(rec.journey);
    renderAutomation();
    replayTrace(rec.events);
    renderReport(rec.report);
    window.spineSession?.replayed(rec);
  } catch {
    if ($("#report")) $("#report").innerHTML = "";
  }
}

// Rebuild the agent timeline instantly from a saved event trace.
function replayTrace(events) {
  const tl = $("#timeline");
  tl.innerHTML = "";
  // Most saved runs (anything from Run (API)/(UI)/(Both)) have no agent
  // trace at all — only the old orchestrator's runs do. Keep the whole
  // section out of sight rather than show an always-empty "Agent reasoning".
  const section = $("#agent-reasoning-section");
  const hasTrace = (events || []).some((e) => e.agent !== "Check");
  if (section) section.hidden = !hasTrace;
  if (!hasTrace) return;
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

/**
 * Plain-English displays for check rows, fetched in batches as rows stream in
 * and cached by everything the row shows — so a row that has not changed is
 * never re-asked, and a re-run (new verdict) gets fresh words.
 */
const rowDisplays = new Map();
const rowDisplayWanted = new Map();
let rowDisplayTimer = null;
function rowDisplay(c) {
  const key = rowSignature(c) + "\u0002" + c.id;
  if (rowDisplays.has(key)) return rowDisplays.get(key);
  rowDisplayWanted.set(key, c);
  if (!rowDisplayTimer) rowDisplayTimer = setTimeout(flushRowDisplays, 350);
  return null;
}
async function flushRowDisplays() {
  rowDisplayTimer = null;
  const batch = [...rowDisplayWanted.entries()].slice(0, 400);
  for (const [k] of batch) rowDisplayWanted.delete(k);
  if (!batch.length) return;
  const items = await CaseView.forRows(batch.map(([, c]) => c));
  batch.forEach(([k, c], i) => {
    rowDisplays.set(k, items[i] || { title: scenarioInWords(c.scenario || c.id), details: [], steps: [] });
    const entry = rowNodes.get(c.id);
    const now = checkRows.find((x) => x.id === c.id);
    if (entry && now && rowSignature(now) === rowSignature(c)) paintRow(entry.node, now);
  });
  if (rowDisplayWanted.size) rowDisplayTimer = setTimeout(flushRowDisplays, 50);
  const box = $("#automation");
  if (box) CaseView.fillTrack(box, currentClient);
}
/** "QA_Platform_publish_title_as_number_raises_500" → "Publish title as number raises 500", until the real words land. */
function scenarioInWords(s) {
  const t = String(s ?? "").replace(/^QA[_ ]?Platform[_ ]?/i, "");
  if (/\s/.test(t) || !/_/.test(t)) return t;
  const w = t.replace(/_+/g, " ").trim();
  return w.charAt(0).toUpperCase() + w.slice(1);
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
  // The row reads as a test case: its plain-English title, type and verdict.
  // The display comes from the server (/api/case-display), batched; until it
  // lands the row shows a cleaned-up name, never the raw identifier.
  const d = running ? null : rowDisplay(c);
  node.querySelector(".chk-id").textContent = c.id;
  const type = node.querySelector(".chk-type");
  type.className = "chk-type " + (TYPE_CLASS[c.type] ?? "");
  type.textContent = d?.type || c.category || "";
  node.querySelector(".chk-scn").innerHTML =
    (c.module === "AI-generated"
      ? '<span class="ai-tag" title="written by the AI for your request">AI</span>'
      : "") + esc(d?.title || scenarioInWords(c.scenario || c.id));
  const http = node.querySelector(".chk-http");
  http.className = "chk-http" + (is5xx ? " err5" : "");
  http.textContent = running ? "running…" : d?.verdict || (c.inconclusive ? "Couldn't tell" : c.pass ? "Passed" : "Failed");
  http.title = c.httpStatus ? `The app answered with status ${c.httpStatus}` : "";

  const detail = node.querySelector(".chk-detail");
  detail.innerHTML =
    (d
      ? CaseView.card(d, { noHead: true })
      : `<div class="cv-reason">${running ? "Running now." : "Putting this result into words…"}</div>`) +
    (c.knownBug
      ? `<span class="known-bug ${/fixed|closed/i.test(c.knownBug.status) ? "fixed" : "open"}">${
          /fixed|closed/i.test(c.knownBug.status) ? "Known bug, confirmed fixed" : "Known bug"
        } · ${esc(c.knownBug.id)} in the ${esc(String(c.knownBug.sheet).replace(/^Internal RFX_Bugs - /, ""))} sheet${
          c.knownBug.qa ? ` by ${esc(c.knownBug.qa)}` : ""
        } · ${esc(c.knownBug.status)}${c.knownBug.blocker ? " · blocker" : ""}</span>`
      : !c.pass && !c.inconclusive && !c._running
        ? `<span class="known-bug new">New — not on any bug sheet yet</span>`
        : "");
  detail.querySelector(".cv-details")?.addEventListener("click", (ev) => ev.stopPropagation());
  detail.querySelectorAll(".cv-details, .cv-body").forEach((x) => x.addEventListener("click", (ev) => ev.stopPropagation()));
  // A PO step is one phase of one document — there is nothing to re-run on its
  // own, so the button only appears for library checks.
  if (c.flowId && !c.noRerun) {
    const rerun = el("button", "chk-rerun", ico("rotate-cw") + " Re-run this check live");
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

// ── the API journey, narrated live ────────────────────────────────────────
/**
 * WHAT THE RUN IS DOING, IN THE ORDER A BUYER WOULD DO IT.
 *
 * An API run used to open with one line — "Building a real RFQ event…" — and
 * then a wall of verdicts about a single endpoint. Watching it, you could not
 * tell what had been done or where it was up to. The server now walks the
 * Postman collection as a journey and narrates each step; this list is that
 * narration. The planned steps appear the moment the plan is known, each one
 * fills in with what the app actually did as its call comes back, and the one
 * in flight says so — with the wait step's progress lines under it.
 *
 * Module state rather than DOM state, because renderAutomation rebuilds the
 * panel's contents whenever a check lands and the journey has to survive
 * that, sitting above the case rows once they start. The node itself is kept
 * and re-mounted; its contents are redrawn from these arrays.
 */
let journeyLive = null;      // { label, steps: [{ n, kind, title, actor }] } — the plan
let journeyStepsLive = [];   // the step records, by position, as they arrive
let journeyPlanned = 0;      // how many steps the plan has
let journeyRecord = null;    // the finished journey, once the server sends it
let journeyProgress = "";    // the latest progress line for the step in flight
let journeyNotes = [];       // { text, cls } — one-line notes about the run
let journeyNode = null;

// "issue": the call worked and the flow went on, but a check found something wrong.
const JOURNEY_VERDICT_WORD = { worked: "Worked", issue: "Issue found", refused: "Refused", broken: "Broken", "not-run": "Not run" };
const JOURNEY_ACTOR_WORD = { buyer: "Buyer", vendor: "Vendor", evaluator: "Evaluator", platform: "Platform" };

/** id value → "the event", "the pricing round"…, from what the journey made — so a sentence never shows an id. */
const JOURNEY_MADE_WORD = {
  eventGroupUuid: "the event", lineItemUuid: "the line item", technicalTradeUuid: "the technical round",
  pricingTradeUuid: "the pricing round", auctionTradeUuid: "the auction round", bidUuid: "the vendor's bid",
  proposalUuid: "the award proposal", vendorCompanyUuid: "the vendor's company", templateResponseUuid: "the technical response",
  evalFormUuid: "the evaluation form", techFormUuid: "the technical form", counterOfferUuid: "the counter offer",
};
function journeyKnownIds() {
  const out = {};
  const made = { ...(journeyRecord?.made || {}) };
  for (const st of journeyStepsLive) Object.assign(made, st?.produced || {});
  for (const [k, v] of Object.entries(made)) if (typeof v === "string" && v) out[v] = JOURNEY_MADE_WORD[k] || "the record";
  return out;
}

/** The technical part of one journey step — request, status, the app's words, ids — for its closed "Details". */
function journeyStepDetails(rec) {
  const rows = [];
  if (rec.call) rows.push({ label: "Request", value: `${rec.call.method} ${rec.call.path ?? ""}`, kind: "code" });
  if (rec.call?.body !== undefined) rows.push({ label: "Body", value: JSON.stringify(rec.call.body, null, 2), kind: "block" });
  if (rec.status != null) rows.push({ label: "HTTP status", value: String(rec.status), kind: "code" });
  else if (rec.call) rows.push({ label: "HTTP status", value: "no reply", kind: "code" });
  if (rec.ms != null) rows.push({ label: "Took", value: journeyMs(rec.ms) });
  if (rec.message) rows.push({ label: "The app said", value: rec.message });
  if (rec.errorCode) rows.push({ label: "Error code", value: String(rec.errorCode), kind: "code" });
  const ids = Object.entries(rec.produced || {}).map(([k, v]) => `${k}: ${v}`).join(" · ");
  if (ids) rows.push({ label: "Ids produced", value: ids, kind: "code" });
  if (rec.reason && rec.verdict !== "not-run") rows.push({ label: "Runner's note", value: rec.reason });
  const testName = `${rec.expected ?? ""} ${rec.actual ?? ""}`.match(/["“]((?:API_Journey|QA_Platform|API_Test)[^"”]*)["”]/)?.[1];
  if (testName) rows.push({ label: "Test record name", value: testName, kind: "code" });
  return CaseView.detailsHtml(rows);
}


function resetJourney() {
  journeyLive = null;
  journeyStepsLive = [];
  journeyPlanned = 0;
  journeyRecord = null;
  journeyProgress = "";
  journeyNotes = [];
  renderJourney();
}

/** A saved run replays its journey the way a live one shows it. */
function journeyFromRecord(journey) {
  resetJourney();
  if (!journey) return;
  journeyLive = {
    label: journey.label ?? "",
    steps: (journey.steps ?? []).map((st) => ({ n: st.n, kind: st.kind, title: st.title, actor: st.actor })),
  };
  journeyStepsLive = (journey.steps ?? []).slice();
  journeyPlanned = journeyStepsLive.length;
  journeyRecord = journey;
  renderJourney();
}

function noteJourney(text, cls) {
  journeyNotes.push({ text: String(text ?? ""), cls: cls || "" });
  renderJourney();
}

function ensureJourneyNode() {
  if (!journeyNode) {
    journeyNode = el("div", "journey");
    journeyNode.id = "journey-live";
    journeyNode.hidden = true;
  }
  return journeyNode;
}

/** Put the journey list into the panel, first or last, without moving it if it is already there. */
function mountJourney(box, where) {
  const node = ensureJourneyNode();
  if (node.parentNode === box) return;
  if (where === "first") box.prepend(node);
  else box.appendChild(node);
}

/** "420ms", "1.2s", "1m 42s" — a call's time as a reader says it. */
function journeyMs(ms) {
  if (ms == null) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1).replace(/\.0$/, "")}s`;
  return elapsedInWords(ms);
}

/**
 * Field checks are still run and kept in every report, but not shown on the
 * journey for now (Aanya, 2026-10-08: "remove for now", she will say when to
 * bring them back). true puts the tally and each step's checks back.
 */
const SHOW_FIELD_CHECKS = false;

/**
 * Postman-style "Tests" for one journey step: the field-level assertions the
 * runner evaluated against the live reply. Failed first, then the rest.
 */
function journeyChecksHtml(a, known = {}) {
  if (!a || !a.total) return "";
  const icon = (p) => (p === true ? "✓" : p === false ? "✗" : "–");
  const cls = (p) => (p === true ? "ok" : p === false ? "bad" : "skip");
  const rows = [...(a.results || [])].sort((x, y) => (x.pass === false ? -1 : 0) - (y.pass === false ? -1 : 0));
  const head =
    `${a.failed ? "✗" : "✓"} ${a.passed}/${a.total} field checks passed` +
    (a.failed ? ` · ${a.failed} failed` : "") +
    (a.skipped ? ` · ${a.skipped} not checked` : "");
  const word = (p) => (p === true ? "Passed" : p === false ? "Failed" : "Not checked");
  return (
    `<details class="jchecks ${a.failed ? "has-fail" : ""}"><summary>${esc(head)}</summary><table class="jchecks-t">` +
    `<tr class="jc-head"><th>Test case</th><th>Expected result</th><th>Actual result</th><th>Result</th></tr>` +
    rows
      .map(
        (r) =>
          `<tr class="${cls(r.pass)}"><td class="jc-t">${esc(CaseView.scrub(r.humanTitle || r.title, known))}<span class="jc-id">${esc(r.id)}</span></td>` +
          `<td class="jc-e">${esc(CaseView.scrub(r.humanExpected || r.expected || "", known))}</td>` +
          `<td class="jc-a" title="${esc(`Field: ${r.path || "the whole reply"} · seen: ${r.actual ?? ""}`)}">${esc(CaseView.scrub(r.humanActual || r.actual || "", known))}</td>` +
          `<td class="jc-i">${icon(r.pass)} ${word(r.pass)}</td></tr>`,
      )
      .join("") +
    `</table></details>`
  );
}

/**
 * What the journey got past, after it finished: every failed try is a failed
 * case (marked "got past it" when a later try of the step worked), and every
 * time the runner went back with different data, in one line each.
 */
const RES_CHOICE_WORD = { unit: "unit", product: "product", location: "delivery location", pricingTemplate: "pricing template", technicalTemplate: "technical template", vendor: "vendor", timing: "bidding window", limit: "account limit" };
function journeyForcedBanner(res) {
  const forced = res?.forced;
  if (!forced || !Object.keys(forced).length) return "";
  const what = Object.entries(forced).map(([k, v]) => `${RES_CHOICE_WORD[k] ?? k} “${v}”`).join(", ");
  return `<div class="sx-banner warn"><b>Test mode:</b> this run was told to start with ${esc(what)} on purpose, to prove the journey can recover. The failure that follows was provoked, not found.</div>`;
}
function journeyResilienceHtml(res) {
  if (!res) return "";
  const findings = res.findings ?? [];
  const backs = res.backtracks ?? [];
  if (!findings.length && !backs.length && !res.budgetExhausted && !res.watchdogTrips) return "";
  let h = '<div class="sx-resil">';
  if (findings.length) {
    h += `<h4>Failed along the way (${findings.length})</h4>`;
    h += findings
      .map((f) =>
        CaseView.card(
          {
            title: `Step ${f.n}: ${f.title} — try ${f.attempt}`,
            ref: f.id,
            verdict: "Failed",
            reason: f.resolved ? "Failed, then got past it — a later try of this step worked." : "Failed, and no later try of this step worked.",
            actual: CaseView.scrub(f.reason ?? ""),
            details: [
              { label: "HTTP status", value: f.status != null ? String(f.status) : "", kind: "code" },
              { label: "Error code", value: f.errorCode ?? "", kind: "code" },
              { label: "The app said", value: f.message ?? "" },
              { label: "Kind of failure", value: f.failureClass ?? "" },
              { label: "Data it blamed", value: f.choice ? `${RES_CHOICE_WORD[f.choice] ?? f.choice}${f.choiceValue ? ` “${f.choiceValue}”` : ""}` : "" },
            ],
          },
          { compact: true, noTrack: true, extraTop: f.resolved ? '<span class="sx-badge good" style="float:right">got past it</span>' : "" },
        ),
      )
      .join("");
  }
  if (backs.length) {
    h += `<h4>Went back and tried different data (${backs.length})</h4><ul class="sx-list">`;
    h += backs
      .map(
        (b) =>
          `<li>${b.fromStep === b.toStep ? `Step ${esc(b.fromStep)}, tried again` : `Step ${esc(b.fromStep)} → step ${esc(b.toStep)}`}: ` +
          `${esc(RES_CHOICE_WORD[b.choice] ?? b.choice)} “${esc(b.from)}” → “${esc(b.to)}”` +
          (b.why ? ` <span class="hint">— ${esc(CaseView.scrub(b.why))}</span>` : "") +
          (b.abandonedEvent ? CaseView.detailsHtml([{ label: "Draft event left behind", value: b.abandonedEvent, kind: "code" }]) : "") +
          `</li>`,
      )
      .join("");
    h += "</ul>";
  }
  const notes = [];
  if (res.sameRequestRetries) notes.push(`${res.sameRequestRetries} request(s) were sent again after the environment failed to answer.`);
  if (res.watchdogTrips) notes.push(`${res.watchdogTrips} step(s) took too long and were stopped.`);
  if (res.budgetExhausted) notes.push("The journey ran out of its time budget; the steps after that were not run.");
  if (notes.length) h += `<p class="hint">${esc(notes.join(" "))}</p>`;
  h += CaseView.detailsHtml([
    { label: "Limits", value: res.bounds ? JSON.stringify(res.bounds) : "", kind: "code" },
    { label: "Alternatives available", value: res.alternatives ? JSON.stringify(res.alternatives, null, 2) : "", kind: "block" },
    { label: "Could not read", value: (res.alternativeProblems ?? []).join("\n"), kind: "block" },
  ]);
  return h + "</div>";
}

function renderJourney() {
  const node = ensureJourneyNode();
  const planned = journeyLive?.steps ?? [];
  const hasContent = planned.length > 0 || journeyStepsLive.some(Boolean) || journeyNotes.length > 0;
  node.hidden = !hasContent;
  if (!hasContent) {
    node.innerHTML = "";
    return;
  }

  const records = journeyStepsLive.filter(Boolean);
  const worked = records.filter((st) => st.verdict === "worked").length;
  const refused = records.filter((st) => st.verdict === "refused").length;
  const issues = records.filter((st) => st.verdict === "issue").length;
  const broken = records.filter((st) => st.verdict === "broken").length;
  const notRun = records.filter((st) => st.verdict === "not-run").length;
  const total = Math.max(journeyPlanned, planned.length, records.length);
  // The step in flight is the first planned one with no record yet — but only
  // while the journey is still going; once it is over nothing is in flight.
  let current = -1;
  if (!journeyRecord) {
    for (let i = 0; i < planned.length; i++) {
      if (!journeyStepsLive[i]) {
        current = i;
        break;
      }
    }
  }

  let html = journeyForcedBanner(journeyRecord?.resilience);
  if (planned.length || records.length) {
    const checks = records.reduce(
      (t, st) => (st.assertions ? { n: t.n + st.assertions.total, ok: t.ok + st.assertions.passed, bad: t.bad + st.assertions.failed } : t),
      { n: 0, ok: 0, bad: 0 },
    );
    const tally = records.length
      ? `${records.length} of ${total} step${total === 1 ? "" : "s"} · ${worked} worked` +
        (issues ? ` · ${issues} with an issue` : "") +
        (refused ? ` · ${refused} refused` : "") +
        (broken ? ` · ${broken} broken` : "") +
        (notRun ? ` · ${notRun} not run` : "") +
        (SHOW_FIELD_CHECKS && checks.n ? ` · field checks ${checks.ok}/${checks.n}${checks.bad ? ` (${checks.bad} failed)` : ""}` : "")
      : `${total} step${total === 1 ? "" : "s"} planned`;
    html +=
      `<div class="journey-head"><b>The journey this run walks${journeyLive?.label ? ` — ${esc(journeyLive.label)}` : ""}</b>` +
      `<span class="journey-tally">${esc(tally)}</span></div>`;
    html += '<ol class="journey-steps">';
    const count = Math.max(planned.length, journeyStepsLive.length);
    for (let i = 0; i < count; i++) {
      const rec = journeyStepsLive[i];
      const plan = planned[i] ?? {};
      const n = rec?.n ?? plan.n ?? i + 1;
      const title = rec?.title ?? plan.title ?? "";
      const actor = rec?.actor ?? plan.actor ?? "";
      const actorChip = actor
        ? `<span class="jstep-actor ${esc(actor)}">${esc(JOURNEY_ACTOR_WORD[actor] ?? actor)}</span>`
        : "";
      if (rec) {
        // The main line is the test case — what should happen, what did; the
        // request, status and ids sit in the step's closed "Details".
        const known = journeyKnownIds();
        const took = rec.kind === "wait_close" && rec.ms != null ? `Waited ${journeyMs(rec.ms)}.` : rec.ms != null ? `Answered in ${journeyMs(rec.ms)}.` : "";
        const reason =
          rec.verdict === "not-run" && rec.reason && !String(rec.actual ?? "").includes(rec.reason)
            ? `<div class="jstep-progress">${esc(CaseView.scrub(rec.reason, known))}</div>`
            : "";
        // Retry history: the step was tried more than once — say so, and keep every failed try readable.
        const tries = rec.attempts?.length ? (rec.attempt ?? rec.attempts.length + 1) : 0;
        const triesChip = tries ? `<span class="sx-tries">after ${tries} tries</span>` : "";
        const triesList = tries
          ? `<details class="sx-attempts"><summary>${rec.attempts.length} failed tr${rec.attempts.length === 1 ? "y" : "ies"} before this</summary><ol>` +
            rec.attempts.map((a) => `<li><b>Try ${esc(a.attempt)}:</b> ${esc(CaseView.scrub(a.reason || a.actual || "", known))}</li>`).join("") +
            `</ol></details>`
          : "";
        html +=
          `<li class="jstep ${esc(rec.verdict)}"><span class="jstep-n">${n}</span><div class="jstep-body">` +
          `<div class="jstep-title">${esc(title)}${actorChip}${triesChip}</div>` +
          triesList +
          (rec.expected ? `<div class="jstep-expected"><span class="cv-k">Expected</span>${esc(CaseView.scrub(rec.expected, known))}</div>` : "") +
          (rec.actual ? `<div class="jstep-actual"><span class="cv-k">What happened</span>${esc(CaseView.scrub(rec.actual, known))}</div>` : "") +
          reason +
          (took ? `<div class="jstep-call">${esc(took)}</div>` : "") +
          (SHOW_FIELD_CHECKS && rec.assertions ? journeyChecksHtml(rec.assertions, known) : "") +
          journeyStepDetails(rec) +
          `</div><span class="jstep-verdict">${esc(JOURNEY_VERDICT_WORD[rec.verdict] ?? rec.verdict)}</span></li>`;
      } else if (i === current) {
        html +=
          `<li class="jstep working"><span class="jstep-n">${n}</span><div class="jstep-body">` +
          `<div class="jstep-title">${esc(title)}${actorChip}</div>` +
          (journeyProgress ? `<div class="jstep-progress">${esc(journeyProgress)}</div>` : "") +
          `</div><span class="jstep-verdict"><span class="spin">⟳</span> working…</span></li>`;
      } else {
        html +=
          `<li class="jstep pending"><span class="jstep-n">${n}</span><div class="jstep-body">` +
          `<div class="jstep-title">${esc(title)}${actorChip}</div></div><span class="jstep-verdict">to do</span></li>`;
      }
    }
    html += "</ol>";
  }

  if (journeyRecord) {
    const stopped = !!journeyRecord.stoppedAt;
    const took = journeyRecord.durationMs != null ? elapsedInWords(journeyRecord.durationMs) : "";
    const waited = journeyRecord.waitedMs ? elapsedInWords(journeyRecord.waitedMs) : "";
    html +=
      `<div class="journey-outcome ${stopped ? "bad" : "ok"}"><b>${stopped ? "✗" : "✓"} ${esc(journeyRecord.outcome ?? "")}</b>` +
      (took ? `<span class="journey-took">Took ${esc(took)}${waited ? `, ${esc(waited)} of it waiting for the bidding window` : ""}.</span>` : "") +
      "</div>";
    html += journeyResilienceHtml(journeyRecord.resilience);
    const ve = journeyRecord.variationsEvent;
    if (ve) {
      html +=
        `<div class="journey-variations">${esc(ve.note ?? "")} ` +
        `The second event is “${esc(ve.title ?? "")}”${ve.status ? `, ${esc(ve.status)}` : ""}` +
        `${ve.stageCount ? ` with ${ve.stageCount} round${ve.stageCount === 1 ? "" : "s"}` : ""}.</div>`;
    }
  }

  if (journeyNotes.length) {
    html +=
      '<div class="journey-notes">' +
      journeyNotes.map((nt) => `<div class="journey-note ${esc(nt.cls)}">${esc(nt.text)}</div>`).join("") +
      "</div>";
  }
  // Redrawn on every progress line, so folds the reader opened are put back.
  const foldKeys = (root) =>
    [...root.querySelectorAll(".journey-steps > li")].flatMap((li, i) =>
      [...li.querySelectorAll("details")].map((d, j) => [`${i}:${j}`, d]),
    );
  const open = new Set(foldKeys(node).filter(([, d]) => d.open).map(([k]) => k));
  node.innerHTML = html;
  if (open.size) for (const [k, d] of foldKeys(node)) if (open.has(k)) d.open = true;
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
  const running = checkRows.filter((c) => c._running).length;
  const failed = total - passed - inconc - running;
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
        : '<div class="empty"><b>Nothing has run yet</b>Ask for something in the box above, or tick what ' +
          "you want tested under <b>API automation</b> or <b>UI automation</b> and press its run button. " +
          "Every case appears here as it runs, with its verdict and the request behind it.</div>";
    // The journey list lives inside the waiting state: under the card while
    // the run is in flight (the card carries the clock and the "Currently:"
    // line, the list carries what has been done), above the closing note once
    // it is over. Rebuilding the card wiped it, so it is put back here.
    mountJourney(box, runPending ? "last" : "first");
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
  // The journey stays, above the case rows: the cases are variations tried
  // at its steps, and read that way only under it.
  mountJourney(box, "first");

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

  // A run that stopped mid-way with rows already on screen: say so plainly —
  // the ≈ rows below are not "not applicable", they never got a turn — and
  // offer the one real recovery, a clean re-run.
  let stopped = box.querySelector(":scope > .stopped-early");
  if (runStoppedNote) {
    if (!stopped) {
      stopped = el("div", "stopped-early");
      box.prepend(stopped);
    }
    stopped.innerHTML = `<b>Stopped early.</b> ${esc(runStoppedNote.message)} <button class="run-btn small retry-btn">${ico("rotate-cw")} Re-run this test case</button>`;
    // Captured before the click, not read off runStoppedNote inside the
    // handler — the handler clears that first, which would otherwise make
    // Re-run silently do nothing.
    const retry = runStoppedNote.retry;
    stopped.querySelector(".retry-btn").onclick = () => {
      runStoppedNote = null;
      stopped.remove();
      retry?.();
    };
  } else if (stopped) {
    stopped.remove();
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
      // The causes are about the case rows, so they sit just above those rows
      // and just under the journey — prepending them pushed the journey, the
      // run's own story, below a banner about its footnotes.
      const journey = box.querySelector(":scope > #journey-live");
      if (journey) journey.after(why);
      else box.prepend(why);
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

/**
 * Clients someone added by hand, kept per browser.
 *
 * localStorage, deliberately: this is one person pointing the platform at one
 * company id, not a change to the accounts the team ships in config. It can
 * come back empty — a private window, cleared data — and the list is simply
 * the configured one again, which is the correct fallback.
 */
function readAddedClients() {
  try {
    const raw = localStorage.getItem("qa.addedClients");
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((c) => c && c.id).map((c) => ({ ...c, added: true })) : [];
  } catch {
    return [];
  }
}

function saveAddedClients(list) {
  try {
    localStorage.setItem("qa.addedClients", JSON.stringify(list.map(({ id, name }) => ({ id, name }))));
  } catch {
    /* a browser that will not store it still works for this session */
  }
}


/**
 * THE ENVIRONMENT THE READER PICKED, ON EVERY REQUEST.
 *
 * "Custom URL" is only worth offering if it changes where the calls go, so the
 * chosen host rides along as `base=` and the server hands it to the client it
 * opens. Kept per browser like an added client: it is one person pointing the
 * platform somewhere for an afternoon, not a change to what the team ships.
 */
let customBase = "";

function baseParam() {
  return customBase ? `&base=${encodeURIComponent(customBase)}` : "";
}

function initEnvControl() {
  const env = $("#env");
  const field = $("#env-custom-field");
  const box = $("#env-custom");
  if (!env || !field || !box) return;

  try {
    customBase = localStorage.getItem("qa.customBase") ?? "";
  } catch {
    customBase = "";
  }
  if (customBase) {
    env.value = "custom";
    box.value = customBase;
    field.hidden = false;
  }

  env.addEventListener("change", () => {
    const on = env.value === "custom";
    field.hidden = !on;
    setTargetGlance();
    if (on) {
      box.focus();
    } else {
      customBase = "";
      try { localStorage.removeItem("qa.customBase"); } catch {}
      reloadForAccount();
    }
  });

  const apply = () => {
    const v = box.value.trim().replace(/\/$/, "");
    // Only a real http(s) URL: anything else would be sent to the server and
    // quietly ignored, which is worse than refusing it here.
    if (v && !/^https?:\/\//i.test(v)) {
      box.setAttribute("aria-invalid", "true");
      return;
    }
    box.removeAttribute("aria-invalid");
    if (v === customBase) return;
    customBase = v;
    try {
      if (v) localStorage.setItem("qa.customBase", v);
      else localStorage.removeItem("qa.customBase");
    } catch {}
    reloadForAccount();
  };
  box.addEventListener("change", apply);
  box.addEventListener("blur", apply);
}

/** Everything account-specific, read again. */
function reloadForAccount() {
  setTargetGlance();
  resetAccountControls();
  loadFeatures();
  loadUiFlows();
  loadPoInput();
  loadCatalogue();
}

const VERDICT_META = {
  product_defect: { icon: "bug", label: "Product defect", cls: "v-bug" },
  contradiction: { icon: "circle-dashed", label: "Silent failure", cls: "v-bug" },
  product_rejected_input: { icon: "construction", label: "Test gap", cls: "v-gap" },
  automation_defect: { icon: "wrench", label: "Harness", cls: "v-harness" },
  environment: { icon: "cloud", label: "Environment", cls: "v-env" },
};

/**
 * THE BUG QUEUE, AS A QUEUE.
 *
 * This showed the worst eight findings as flat cards and pointed at the sheet
 * for the rest — so a platform holding ninety-one findings, fifteen of them
 * blockers, looked like it had found eight things. The severity that decides
 * what anyone does first was a word on a chip; the split between "the app is
 * broken" and "our automation is broken" — the distinction the whole report
 * rests on — was invisible until you opened a card.
 *
 * Now: the shape of the queue first (what blocks, what is theirs, what is
 * ours), then every finding, worst first, grouped under severity headers that
 * stay put while you scroll. Tiles are filters, so "show me the blockers" is
 * one click rather than a scroll.
 */
let bugGroups = [];
let bugFilter = { sev: "", kind: "", q: "" };

const SEV_ORDER = ["critical", "high", "medium", "low"];
const SEV_LABEL = {
  critical: "Blockers",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Is this finding the product's problem, or ours? */
const isProductBug = (g) => g.kind === "product_defect" || g.kind === "contradiction";

async function loadFindings() {
  const box = $("#findings");
  if (!box) return;
  try {
    const { groups } = await (await fetch("/api/findings")).json();
    bugGroups = groups ?? [];
  } catch {
    box.innerHTML = '<div class="empty">Could not load the findings.</div>';
    return;
  }
  renderBugs();
}

function renderBugs() {
  const box = $("#findings");
  if (!box) return;
  const board = $("#bug-board");
  const controls = $("#bug-controls");
  if (board) board.hidden = bugGroups.length === 0;
  if (controls) controls.hidden = bugGroups.length === 0;

  if (!bugGroups.length) {
    box.innerHTML =
      '<div class="empty">No bugs found yet — run some tests and anything that breaks lands here.</div>';
    return;
  }

  // ── the board: counts, and a bar that shows the mix without being read ──
  const by = (f) => bugGroups.filter(f).length;
  const crit = by((g) => g.severity === "critical");
  const high = by((g) => g.severity === "high");
  const rest = by((g) => g.severity === "medium" || g.severity === "low");
  const prod = by(isProductBug);
  const ours = bugGroups.length - prod;
  const set = (id, n) => { const e = $(id); if (e) e.textContent = String(n); };
  set("#bt-crit", crit); set("#bt-high", high); set("#bt-med", rest);
  set("#bt-prod", prod); set("#bt-ours", ours);

  const bar = $("#bug-bar");
  if (bar) {
    const total = bugGroups.length || 1;
    bar.innerHTML = SEV_ORDER.map((sev) => {
      const n = by((g) => g.severity === sev);
      return n
        ? `<span class="seg s-${sev}" style="width:${(n / total) * 100}%" title="${n} ${SEV_LABEL[sev].toLowerCase()}"></span>`
        : "";
    }).join("");
  }
  const legend = $("#bug-legend");
  if (legend) {
    legend.innerHTML =
      `<b>${bugGroups.length}</b> distinct defect${bugGroups.length === 1 ? "" : "s"}, ` +
      `grouped so one broken endpoint hit by four tests is one row — ` +
      `<b>${prod}</b> for engineering, <b>${ours}</b> ours to fix.`;
  }

  // Tiles act as filters, and show which one is on.
  for (const tile of document.querySelectorAll(".bug-tile")) {
    const on =
      (tile.dataset.sev && bugFilter.sev === tile.dataset.sev) ||
      (tile.dataset.kind && bugFilter.kind === tile.dataset.kind);
    tile.classList.toggle("on", !!on);
  }

  // ── the queue ──
  const q = bugFilter.q.toLowerCase();
  const shown = bugGroups.filter((g) => {
    if (bugFilter.sev === "critical" && g.severity !== "critical") return false;
    if (bugFilter.sev === "high" && g.severity !== "high") return false;
    if (bugFilter.sev === "medium" && !["medium", "low"].includes(g.severity)) return false;
    if (bugFilter.kind === "product" && !isProductBug(g)) return false;
    if (bugFilter.kind === "notproduct" && isProductBug(g)) return false;
    if (!q) return true;
    return `${g.title} ${g.rationale} ${(g.flows ?? []).join(" ")} ${(g.evidence ?? []).join(" ")}`
      .toLowerCase()
      .includes(q);
  });

  const count = $("#bug-count");
  if (count) {
    count.textContent =
      shown.length === bugGroups.length
        ? `${bugGroups.length} bugs`
        : `${shown.length} of ${bugGroups.length} bugs`;
  }
  const clear = $("#bug-clear");
  if (clear) clear.hidden = !bugFilter.sev && !bugFilter.kind && !bugFilter.q;

  box.innerHTML = "";
  if (!shown.length) {
    box.appendChild(el("div", "empty", "No bug matches that."));
    return;
  }

  for (const sev of SEV_ORDER) {
    const inSev = shown.filter((g) => g.severity === sev);
    if (!inSev.length) continue;
    const head = el("div", `bug-sev-head s-${sev}`);
    head.innerHTML = `<span class="bug-sev-dot"></span><b>${SEV_LABEL[sev]}</b><span class="hint">${inSev.length}</span>`;
    box.appendChild(head);
    for (const g of inSev) box.appendChild(bugCard(g));
  }
}

/** One defect: what it is at a glance, the whole story when opened. */
function bugCard(g) {
  const meta = VERDICT_META[g.kind] ?? VERDICT_META.automation_defect;
  const card = el("details", `bug s-${g.severity} ${meta.cls}`);
  const seen =
    g.occurrences > 1 || (g.runs ?? []).length > 1
      ? `seen ${g.occurrences}× across ${(g.runs ?? []).length || 1} run${(g.runs ?? []).length === 1 ? "" : "s"}`
      : "seen once";
  const where = (g.flows ?? []).slice(0, 3).map((f) => `<span class="bug-flow">${esc(f)}</span>`).join("");
  const more = (g.flows ?? []).length > 3 ? `<span class="bug-flow">+${g.flows.length - 3}</span>` : "";

  card.innerHTML = `
    <summary>
      <span class="bug-kind ${meta.cls}" title="${esc(meta.label)}">${ico(meta.icon)}</span>
      <span class="bug-title">${esc(g.title)}</span>
      <span class="bug-where">${where}${more}</span>
      <span class="bug-seen">${esc(seen)}</span>
    </summary>
    <div class="bug-body">
      <p class="bug-why"><b>${esc(meta.label)}</b> — ${esc(g.rationale ?? "")}</p>
      ${
        (g.evidence ?? []).length
          ? `<div class="bug-sub">What we saw</div><ul class="bug-ev">${g.evidence
              .slice(0, 4)
              .map((e) => `<li class="mono">${esc(e)}</li>`)
              .join("")}</ul>`
          : ""
      }
      ${
        (g.reproduction ?? []).length
          ? `<div class="bug-sub">How to reproduce</div><ol class="bug-steps">${g.reproduction
              .map((r) => {
                // A vendor bulk upload bug carries links: the exact sheet, the full evidence.
                const m = String(r).match(/^(.*?: )(\/api\/\S+)$/);
                return m
                  ? `<li>${esc(m[1])}<a href="${esc(m[2])}" target="_blank" rel="noopener">${m[2].startsWith("/api/vbu/sheet") ? "download the file sent" : "open the evidence"}</a></li>`
                  : `<li>${esc(r)}</li>`;
              })
              .join("")}</ol>`
          : ""
      }
      <a class="bug-open" href="/api/bug-report" target="_blank" rel="noopener">Open in the editable sheet →</a>
    </div>`;
  return card;
}

function initBugControls() {
  for (const tile of document.querySelectorAll(".bug-tile")) {
    tile.addEventListener("click", () => {
      // Clicking the tile that is already on turns it off — a filter you
      // cannot undo by pressing the same thing again is a trap.
      if (tile.dataset.sev) bugFilter.sev = bugFilter.sev === tile.dataset.sev ? "" : tile.dataset.sev;
      if (tile.dataset.kind) bugFilter.kind = bugFilter.kind === tile.dataset.kind ? "" : tile.dataset.kind;
      const pick = $("#bug-kind");
      if (pick) pick.value = bugFilter.kind;
      renderBugs();
    });
  }
  $("#bug-search")?.addEventListener("input", (e) => {
    bugFilter.q = e.target.value;
    renderBugs();
  });
  $("#bug-kind")?.addEventListener("change", (e) => {
    bugFilter.kind = e.target.value;
    renderBugs();
  });
  $("#bug-clear")?.addEventListener("click", () => {
    bugFilter = { sev: "", kind: "", q: "" };
    const sb = $("#bug-search"); if (sb) sb.value = "";
    const pk = $("#bug-kind"); if (pk) pk.value = "";
    renderBugs();
  });
}

// ── AI: instruction → real browser run ────────────────────────────────────
// The whole point of the platform in one button: you say what you want tested,
// it decides which journey and which parameters, recalls what it already knows
// about that area, drives the real console, and returns a verdict rather than
// an exit code.
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
/**
 * The answer to a Run (UI), under the box it was typed in — the same place the
 * API card answers. The step table further down is the evidence; this is the
 * reply: did it work, what did the app say, and where it stopped if not.
 */
function renderUiInstructResult(state, d = {}) {
  const box = $("#ui-instruct-result");
  if (!box) return;
  box.hidden = false;
  const title = d.title ? ` ${esc(d.title)}` : "";
  if (state === "running") {
    box.className = "api-result running";
    box.innerHTML = `<div class="api-result-head"><span class="api-result-badge">UI</span>${title || " Compiling it into browser steps…"}</div>` +
      `<div class="api-result-verdict">Running it in the browser…</div>`;
    return;
  }
  const steps = d.steps ?? [];
  const n = steps.length;
  const okCount = steps.filter((s) => s.status === "ok").length;
  const said = (s) => String(s?.detail ?? "").replace(/^app said(?: \([^)]*\))?:\s*/i, "");
  let cls, badge, lines;
  if (state === "notrun") {
    cls = "skip";
    badge = "– Not tested (UI)";
    lines = [d.reason || "The run could not start."];
  } else if (d.passed) {
    cls = "ok";
    badge = "✓ Passed (UI)";
    const expectStep = [...steps].reverse().find((s) => /^expect/.test(s.step));
    const made = steps.find((s) => s.step === "set_title" && s.detail);
    lines = [`It worked as expected — all ${n} step${n === 1 ? "" : "s"} passed.`];
    if (expectStep?.detail) lines.push(/error|blocked|refus/.test(expectStep.step) ? `The app refused it, as it should: “${said(expectStep)}”.` : `Checked: ${said(expectStep)}.`);
    if (made) lines.push(`Test event: ${made.detail}.`);
  } else {
    cls = "bad";
    badge = "✗ Failed (UI)";
    const at = steps.findIndex((s) => s.status === "failed");
    lines = at >= 0
      ? [`It stopped at step ${at + 1} of ${n} — ${planStepInWords(steps[at])}.`, steps[at].detail ? `What happened: ${steps[at].detail}.` : ""]
      : [d.reason || `${okCount} of ${n} steps passed.`];
  }
  box.className = `api-result ${cls}`;
  box.innerHTML =
    `<div class="api-result-head"><span class="api-result-badge">${esc(badge)}</span>${title}</div>` +
    lines.filter(Boolean).map((l) => `<div class="api-result-verdict">${esc(l)}</div>`).join("") +
    (n
      ? `<details class="api-result-steps"><summary>${okCount} of ${n} steps passed — show them</summary><ol>${steps
          .map((s) => `<li>${s.status === "ok" ? "✓" : s.status === "failed" ? "✗" : "–"} ${esc(planStepInWords(s))}${s.detail ? ` <span>— ${esc(s.detail)}</span>` : ""}</li>`)
          .join("")}</ol></details>`
      : "");
  // The same answer closes the session's turn: green DONE, red FAILED, grey NOT TESTED.
  window.spineSession?.uiResult({ cls, title: d.title || "", lines: lines.filter(Boolean) });
}

function runTestCase(textOverride) {
  goToRun("your test case (UI)", "Compiling it into a browser step plan, then running that plan live.");
  // A re-run re-sends the exact instruction that stopped early, regardless of
  // whatever is in the box now — "Re-run this test case" should not silently
  // run something you've since edited the box to say instead.
  const q = textOverride ?? $("#request").value.trim();
  if (!q) return;
  const btn = $("#run-ui-btn");
  btn.disabled = true;
  $("#status").textContent = "compiling & running…";
  renderUiInstructResult("running");
  window.spineSession?.working("Compiling your test case into browser steps");

  const con = $("#ui-console");
  resetUiSteps();
  // Folded: the session narrates the plan step by step; the raw lines stay one click away.
  showRunLog({ collapsed: true });
  con.innerHTML = "";
  const write = (text, cls) => {
    con.appendChild(el("div", cls || "", esc(text)));
    con.scrollTop = con.scrollHeight;
  };

  const qs = new URLSearchParams({ c: String(currentClient), q });
  if (customBase) qs.set("base", customBase);
  // Run (UI) always runs headless now: the live-frame panel below is the
  // viewer. A real visible window AND the screenshot poll that feeds this
  // panel fight each other — every capture pauses the real window's
  // rendering, which shows up as stutter. Headless has nothing on screen to
  // glitch, so this is strictly better once the panel exists.
  qs.set("headed", "0");
  const es = new EventSource(`/api/plan-run?${qs}`);
  watchStreamEnd(es, null, () => runTestCase(q));
  uiRunning = es;

  // Steps on the left (checkRows/renderAutomation, below), the actual browser
  // on the right — a ~1fps JPEG the plan spec prints, not a recording.
  const framePanel = $("#live-frame-panel");
  const frameImg = $("#live-frame");
  if (framePanel) framePanel.hidden = true;
  es.addEventListener("frame", (ev) => {
    const { frame } = JSON.parse(ev.data);
    if (!frame || !frameImg) return;
    frameImg.src = `data:image/jpeg;base64,${frame}`;
    if (framePanel) framePanel.hidden = false;
    window.spineSession?.frame();
  });

  es.addEventListener("stage", (ev) => {
    const st = JSON.parse(ev.data);
    write("› " + st.line, "cmd");
    if (st.name === "execute") window.spineSession?.working(st.line);
  });
  onQueued(es, write);
  /**
   * The compiler could not turn the text into steps, so the server stopped
   * rather than run a default journey in its place. Nothing listened for this,
   * so the run simply ended in silence. Say it plainly, where the run shows.
   */
  es.addEventListener("blocked", (ev) => {
    let b = {};
    try {
      b = JSON.parse(ev.data);
    } catch {}
    const reason = String(b.reason || "the compiler could not turn that text into steps");
    const steps = (b.suggestion || []).map((st) => planStepInWords({ step: st }));
    runEmptyNote =
      `<div class="cv-blocked"><b>This test case was not run.</b> ${esc(reason.charAt(0).toUpperCase() + reason.slice(1))}.` +
      (b.covers ? `<p>${esc(b.covers)}</p>` : "") +
      (b.hint ? `<p>${esc(b.hint)}</p>` : "") +
      (steps.length
        ? `<details class="cv-details"><summary>The default journey it would otherwise have run (${steps.length} steps)</summary><ol class="cv-steps">${steps
            .map((x) => `<li>${esc(x)}</li>`)
            .join("")}</ol></details>`
        : "") +
      "</div>";
    checkRows = [];
    runPending = null;
    renderAutomation();
    write(`Not run: ${reason}`, "bad");
    if (b.hint) write(`   ${b.hint}`, "note");
    window.spineSession?.note([b.covers, b.hint].filter(Boolean).join(" "), "warn");
    renderUiInstructResult("notrun", { reason: reason.charAt(0).toUpperCase() + reason.slice(1) + "." });
  });
  es.addEventListener("plan", (ev) => {
    const p = JSON.parse(ev.data);
    planTitle = p.title || "";
    planGaps = p.coverage === "none" ? p.gaps || [] : [];
    renderUiInstructResult("running", { title: planTitle });
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
    $("#auto-summary").textContent = `${p.steps.length} step${p.steps.length === 1 ? "" : "s"} to run`;
    write(`${p.title}  (${p.source} · ${p.steps.length} steps)`, "ok");
    if (p.reasoning) write(`   ${p.reasoning}`, "note");
    write(`   grounded in ${p.context.expectations} rule(s) and ${p.context.experience} past finding(s)`, "note");
    p.steps.forEach((s, i) =>
      write(`   ${String(i + 1).padStart(2)}. ${s.step}${s.args && Object.keys(s.args).length ? " " + JSON.stringify(s.args) : ""}`),
    );
    // Repairs are shown, never hidden: a plan the linter had to fix says the
    // compiler needs improving, and that is worth seeing.
    if (p.coverage === "none") write(`   Cannot test this case yet — no step for: ${gapWords(p.gaps) || "what it checks"}. Not running something else in its place.`, "bad");
    else if (p.coverage === "partial") write(`   Only part of this case can be tested — no step for: ${gapWords(p.gaps)}`, "note");
    for (const w of p.warnings ?? []) if (!/^cannot test|^can only test/.test(w)) write(`   ${w}`, "note");
    // The session narrates the plan as it runs: one line per step, a dot per verdict.
    window.spineSession?.plan(p);
  });
  // Whether any step reported back, and the last error line seen — so a run
  // that dies before step 1 (sign-in, setup) says so instead of "no defects".
  let planStarted = false;
  let planError = "";
  let planTitle = "";
  let planGaps = []; // what a plan that cannot run has no step for
  let planResult = null;
  es.addEventListener("log", (ev) => {
    const l = JSON.parse(ev.data).line;
    const err = l.match(/^\s*(?:Error|TimeoutError):\s*(.+)/);
    if (err && !planError) planError = err[1].trim();
    // "[plan] 3/22 set_title ✓" — the runner's own progress, which is what
    // moves a row from waiting to running to done while you watch.
    const m = l.match(/\[plan\] (\d+)\/(\d+) (\S+)( ✓| ✗)?/);
    if (m) {
      planStarted = true;
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
      window.spineSession?.planStep(at, m[4] ? (m[4].trim() === "✓" ? "ok" : "bad") : "run");
      setRunBar(Number(m[1]), Number(m[2]));
    }
    if (/^\[plan\]|create-event|erfx/.test(l)) write(l);
  });
  es.addEventListener("plan-result", (ev) => {
    const r = JSON.parse(ev.data);
    planStarted = true;
    planResult = r;
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
    r.steps.forEach((s, i) =>
      window.spineSession?.planStep(i, s.status === "ok" ? "ok" : s.status === "failed" ? "bad" : "skip", s.detail || ""),
    );
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
    if (!verdicts.length) {
      if (planStarted) write("No defects — every step held", "ok");
      else write(`The run stopped before step 1, so nothing was tested${planError ? ` — ${planError}` : ""}`, "bad");
    }
    for (const v of verdicts) {
      const meta = VERDICT_META[v.kind] ?? VERDICT_META.automation_defect;
      write(`${meta.label.toUpperCase()} · ${v.severity} — ${v.title}`, v.actionable ? "bad" : "note");
      write(`   ${v.rationale}`, "note");
      window.spineSession?.note(`${v.title} — ${v.rationale}`, v.actionable ? "bad" : "info", meta.label);
    }
    loadFindings();
  });
  const finish = (msg, cls) => {
    if (msg) write(msg, cls);
    btn.disabled = false;
    $("#status").textContent = "";
    es.close();
    uiRunning = null;
    runFinished();
    loadFindings();
  };
  es.addEventListener("done", (ev) => {
    const d = JSON.parse(ev.data);
    // Not tested says why in one place: the step that is missing, when the compiler named it.
    if (d.notRun) renderUiInstructResult("notrun", { title: planTitle, reason: planGaps.length ? `There is no step yet for: ${gapWords(planGaps)}. Nothing was run in its place.` : "No step exists yet in the automation for what this case checks, so nothing was run in its place." });
    else if (!planStarted) renderUiInstructResult("notrun", { title: planTitle, reason: `The run could not start${planError ? `: ${planError}` : "."}` });
    else renderUiInstructResult("result", { title: planTitle, steps: planResult?.steps ?? [], passed: d.exitCode === 0 && planResult?.passed !== false });
    // The compiler itself can refuse to run: no step exists yet for the thing
    // the case checks, so it ran nothing rather than a substitute. Exit 0 in
    // that case means "nothing broke while doing nothing" — the opposite of
    // passed — and showing it as a green pass would hide a coverage gap as a
    // clean result.
    finish(
      d.notRun
        ? "Not tested — no step exists yet for what this case checks"
        : d.exitCode === 0
          ? "✓ test case passed"
          : !planStarted
            ? `✗ Not tested — the run could not start${planError ? `: ${planError}` : ""}`
            : `✗ test case failed (exit ${d.exitCode})`,
      d.notRun ? "bad" : d.exitCode === 0 ? "ok" : "bad",
    );
  });
  es.addEventListener("run-error", (ev) => {
    let msg = "run error";
    try { msg = JSON.parse(ev.data).line || msg; } catch {}
    renderUiInstructResult("result", { title: planTitle, steps: planResult?.steps ?? [], passed: false, reason: `The run broke: ${msg}` });
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
          `<span class="finding-icon">${ico("compass")}</span><span class="finding-title">${esc(s.label)}</span>` +
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
      const btn = el("button", "run-btn small", ico("wrench") + " Teach this locator");
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
    btn.innerHTML = ico("wrench") + " Teach this locator";
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
  "ui-crosscheck": ["journey", "UI↔API cross-check"],
  "api-library": ["exact", "API case library"],
  "api-field": ["area", "field check on every journey"],
  "api-template": ["exact", "template field check"],
  "api-matrix": ["exact", "bidding scenario"],
  "api-plan": ["", "API test compiler"],
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
  return runLive;
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

/**
 * THE JOURNEY CATALOGUE — the same cases the Test cases view lists, ordered
 * into the 17 journeys a buyer actually walks.
 *
 * Read-only on purpose: `data/journeys.json` is authored, and its `cases`
 * arrays are already in the order each journey exercises them. So nothing here
 * sorts, samples or paginates — every case is rendered where its journey puts
 * it, and the filters only hide.
 */
let journeysData = null;

/**
 * Searchable text per case id, held in JS rather than in a `data-` attribute.
 *
 * It started as `data-hay` and lost 7 of the 68 matches for "auction": this
 * file's `esc()` escapes `& < >` but not `"`, so a case whose `why` contains
 * a quoted phrase ("start from RFQ", `{"status":500}`) closed the attribute
 * early and the rest of its text was never searched. Free text in an
 * attribute is a trap; a Map has no quoting rules to get wrong.
 */
const jyHay = new Map();

/**
 * The spine step names in plain English.
 *
 * The file carries them as `open_events_list` / `add_line_items` — fine as
 * keys, useless as a description of what a buyer does. A journey's spine is
 * the one place the page can say "first this, then this", so it is written
 * out rather than printed raw.
 */
const JY_STEP = {
  open_events_list: "Open the events list",
  filter_events: "Filter the events list",
  expect_events_list: "See the events list",
  expect_create_options: "See the create options",
  open_create: "Open the create screen",
  set_title: "Set the title",
  configure_single_stage: "Configure a single-stage event",
  compose_stages: "Compose the stages",
  switch_stage: "Switch stage",
  add_line_items: "Add line items",
  expect_line_items: "Check the line items",
  select_template: "Select a template",
  expect_sheet_columns: "Check the sheet columns",
  fill_sheet: "Fill the pricing sheet",
  fill_questionnaires: "Fill the questionnaires",
  assign_evaluator: "Assign an evaluator",
  set_schedule: "Set the bid window",
  open_participants: "Open the participants list",
  invite_vendor: "Invite a vendor",
  save_draft: "Save as a draft",
  publish: "Publish the event",
  expect_published: "Confirm it is live",
  expect_publish_blocked: "Confirm publishing is blocked",
  expect_event_status: "Check the event status",
  place_bid: "Place a bid",
  place_surrogate_bid: "Bid on the vendor's behalf",
  expect_bid_submitted: "Confirm the bid is submitted",
  place_counter_offer: "Send a counter-offer",
  expect_counter_offer_sent: "Confirm the counter-offer went out",
  accept_counter_offer: "Accept the counter-offer",
  open_master_qcs: "Open the comparison sheet",
  convert_to_auction: "Convert the stage to an auction",
  award_event: "Award the event",
  expect_awarded: "Confirm it is awarded",
  close_event: "Close the event",
  expect_error: "Confirm it is refused",
  expect_no_error: "Confirm nothing broke",
  expect_disabled: "Confirm the control is disabled",
};

const jyStep = (key) =>
  JY_STEP[key] ?? String(key).replace(/_/g, " ").replace(/^./, (ch) => ch.toUpperCase());

/**
 * A journey's cases, cut into the stages it walks.
 *
 * The file's `cases` array interleaves its sections — journey 2 runs
 * §2, §4, §3, §2, §4, §3 — because the UI and API catalogues number their own
 * sections independently and were merged case by case. Read straight down,
 * that looks like a random pile. Grouping by stage in order of FIRST
 * appearance gives back the sequence a person expects (compose the project,
 * then line items, then templates) without moving any case relative to
 * another in its own stage.
 */
function jyStages(journey) {
  const stages = [];
  const byName = new Map();
  for (const c of journey.cases) {
    const name = c.section || "Other";
    let stage = byName.get(name);
    if (!stage) {
      stage = { name, no: c.sectionNo, cases: [] };
      byName.set(name, stage);
      stages.push(stage);
    }
    stage.cases.push(c);
  }
  return stages;
}

/** The case text is authored with `code` and **bold**; render those two only. */
function jyRich(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

async function loadJourneys() {
  const box = $("#journeys");
  if (!box) return;
  box.innerHTML = `<div class="loading">Reading the journeys…</div>`;
  try {
    journeysData = await (await fetch("/api/journeys")).json();
  } catch {
    box.innerHTML = `<div class="empty">Could not read the journeys.</div>`;
    return;
  }
  if (journeysData.missing) {
    box.innerHTML = `<div class="empty">No <code>data/journeys.json</code> in this checkout yet.</div>`;
    return;
  }
  if (journeysData.error || !journeysData.journeys?.length) {
    box.innerHTML = `<div class="empty">The journeys file could not be read${
      journeysData.error ? ` — ${esc(journeysData.error)}` : ""
    }.</div>`;
    return;
  }

  const list = [...journeysData.journeys].sort((a, b) => a.order - b.order);
  journeysData.journeys = list;

  const pick = $("#jy-journey");
  if (pick) {
    pick.innerHTML =
      '<option value="">All journeys</option>' +
      list
        .map((j) => `<option value="${esc(j.id)}">${j.order}. ${esc(j.title)} (${j.cases.length})</option>`)
        .join("");
  }

  const all = list.flatMap((j) => j.cases);
  const tot = $("#jy-totals");
  if (tot) {
    const n = (fn) => all.filter(fn).length;
    tot.innerHTML = [
      [all.length, "test cases"],
      [list.length, "journeys"],
      [n((c) => c.layer === "ui"), "browser"],
      [n((c) => c.layer === "api"), "api"],
      [n((c) => c.verdict === "automate"), "to automate"],
      [n((c) => c.runnable), "runnable now"],
    ]
      .map(([v, k]) => `<div><b>${v}</b><span>${esc(k)}</span></div>`)
      .join("");
  }

  renderJourneys();
}

function renderJourneys() {
  const box = $("#journeys");
  if (!box || !journeysData?.journeys?.length) return;

  jyHay.clear();
  box.innerHTML = journeysData.journeys
    .map((j) => {
      const stats = [
        ["total", j.counts.total],
        ["ui", j.counts.ui],
        ["api", j.counts.api],
        ["runnable", j.counts.runnable],
        ["automate", j.counts.automate],
      ]
        .map(([k, v]) => `<span>${k} <b>${v}</b></span>`)
        .join("");

      // What a buyer does in this journey, in order and in words.
      const flow = (j.spine || [])
        .map((x, i) => `<li><span class="jy-fn">${i + 1}</span>${esc(jyStep(x))}</li>`)
        .join("");

      // Continuous numbering across the whole journey, so the sequence is
      // visible on the page rather than implied by position.
      let n = 0;
      const stages = jyStages(j)
        .map((stage) => {
          const rows = stage.cases
            .map((c) => {
              n += 1;
              const idx = j.cases.indexOf(c);
              jyHay.set(c.id, [c.id, c.title, c.why, c.steps, c.expected].join(" \u241f ").toLowerCase());
              return `<div class="jy-case" data-id="${esc(c.id)}" data-layer="${esc(c.layer)}"
                           data-pri="${esc(c.priority)}" data-verdict="${esc(c.verdict)}">
                <button class="jy-row" type="button" aria-expanded="false" data-j="${esc(j.id)}" data-i="${idx}">
                  <span class="jy-n">${n}</span>
                  <span class="jy-id">${esc(c.id)}</span>
                  <span class="jy-title">${esc(c.title)}</span>
                  <span class="jy-chips">
                    <span class="jy-chip pri pri-${esc(c.priority)}">${esc(c.priority)}</span>
                    <span class="jy-chip v-${esc(c.verdict)}">${esc(c.verdict)}</span>
                    ${c.layer === "api" ? '<span class="jy-chip api">API</span>' : ""}
                  </span>
                </button>
                <div class="jy-detail"></div>
              </div>`;
            })
            .join("");

          return `<div class="jy-stage" data-stage="${esc(stage.name)}">
            <div class="jy-stage-head">
              <span class="jy-stage-name">${esc(stage.name)}</span>
              <span class="jy-stage-n">${stage.cases.length} case${stage.cases.length === 1 ? "" : "s"}</span>
            </div>
            ${rows}
          </div>`;
        })
        .join("");

      return `<section class="jy" data-jid="${esc(j.id)}">
        <div class="jy-head">
          <span class="jy-num">${j.order}</span>
          <div>
            <h2 class="jy-h">${esc(j.title)}</h2>
            <p class="jy-persona">${esc(j.persona)}</p>
            <p class="jy-goal">${esc(j.goal)}</p>
            ${flow ? `<ol class="jy-flow">${flow}</ol>` : ""}
            <p class="jy-stats">${stats}</p>
          </div>
        </div>
        <div class="jy-cases">${stages}<p class="jy-empty" hidden>Every case here is filtered out.</p></div>
      </section>`;
    })
    .join("");

  filterJourneys();
}

/** Expand one case. Built on first open, from the fields exactly as authored. */
function openJourneyCase(btn) {
  const wasOpen = btn.getAttribute("aria-expanded") === "true";
  btn.setAttribute("aria-expanded", wasOpen ? "false" : "true");
  const pane = btn.nextElementSibling;
  if (wasOpen || pane.dataset.built) return;

  const journey = journeysData.journeys.find((j) => j.id === btn.dataset.j);
  const c = journey?.cases[Number(btn.dataset.i)];
  if (!c) return;

  const rows = [
    ["Why", c.why],
    ["Setup", c.setup && String(c.setup).trim() ? c.setup : null],
    ["Steps", c.steps],
    ["Expected", c.expected],
    ["How to tell", c.oracle],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<dt>${k}</dt><dd>${jyRich(v)}</dd>`)
    .join("");

  pane.innerHTML = `<dl>${rows}
    <div class="jy-prov">
      <span>${esc(c.group)}</span>
      <span>\u00a7${esc(c.sectionNo)} ${esc(c.section)}</span>
      <span>${esc(c.routeKind)}</span>
      <span>${c.runnable ? "runnable" : "not runnable"}</span>
    </div></dl>`;
  pane.dataset.built = "1";
}

function filterJourneys() {
  const box = $("#journeys");
  if (!box || !journeysData?.journeys?.length) return;
  const text = ($("#jy-q")?.value ?? "").trim().toLowerCase();
  const wantJ = $("#jy-journey")?.value ?? "";
  const wantP = $("#jy-priority")?.value ?? "";
  const wantV = $("#jy-verdict")?.value ?? "";
  const layer = document.querySelector(".jy-segb[aria-pressed='true']")?.dataset.layer ?? "";
  const total = journeysData.journeys.reduce((n, j) => n + j.cases.length, 0);
  let shown = 0;

  for (const sec of box.querySelectorAll(".jy")) {
    const jOk = !wantJ || sec.dataset.jid === wantJ;
    let here = 0;
    for (const el of sec.querySelectorAll(".jy-case")) {
      const ok =
        jOk &&
        (!layer || el.dataset.layer === layer) &&
        (!wantP || el.dataset.pri === wantP) &&
        (!wantV || el.dataset.verdict === wantV) &&
        (!text || (jyHay.get(el.dataset.id) ?? "").includes(text));
      el.hidden = !ok;
      if (ok) here++;
    }
    // A stage heading with nothing left under it is noise.
    for (const stage of sec.querySelectorAll(".jy-stage")) {
      stage.hidden = ![...stage.querySelectorAll(".jy-case")].some((el) => !el.hidden);
    }
    sec.hidden = !jOk || here === 0;
    const empty = sec.querySelector(".jy-empty");
    if (empty) empty.hidden = here !== 0;
    shown += here;
  }

  const count = $("#jy-count");
  if (count) count.textContent = shown === total ? `${total} cases` : `${shown} of ${total} cases`;
}

async function loadCatalogue() {
  const box = $("#catalogue");
  if (!box) return;
  box.innerHTML = `<div class="loading">Reading the catalogue…</div>`;
  try {
    catalogueData = await (await fetch("/api/catalogue?c=" + currentClient + baseParam())).json();
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
    /**
     * ONE MODULE, FOLDED UNTIL WANTED.
     *
     * Fourteen tables stacked end to end is 283 rows of scrolling before you
     * know what is in here. Folded, the page opens as a contents page — every
     * module, what it covers, how many cases and how they split — and a module
     * opens when someone actually wants it. Searching or filtering opens the
     * matches automatically, because then the reader has already said what
     * they are looking for.
     */
    const refused = features.reduce((n, f) => n + f.cases.filter((c) => c.expected === "reject").length, 0);
    const p0 = features.reduce((n, f) => n + f.cases.filter((c) => /^p0$/i.test(c.priority ?? "")).length, 0);
    const section = el("details", "cat-group");
    if (q || module || kind) section.open = true;
    section.innerHTML =
      `<summary class="cat-group-head">` +
      `<h2>${groupIco(group)} ${esc(group.label)}</h2>` +
      `<span class="cat-group-nums">` +
      `<b>${total}</b> case${total === 1 ? "" : "s"}` +
      `<span class="cat-split">${refused} should be refused · ${total - refused} accepted</span>` +
      (p0 ? `<span class="cat-p0">${p0} P0</span>` : "") +
      `</span></summary>` +
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

  if (shown) {
    // What is in front of you, before the modules: the shape of the catalogue
    // rather than the first row of it.
    const all = catalogueData.groups.flatMap((g) => g.features.flatMap((f) => f.cases));
    const inView = q || module || kind;
    const strip = el("div", "cat-summary");
    strip.innerHTML =
      `<span><b>${shown}</b> case${shown === 1 ? "" : "s"}${inView ? " matching" : ""}</span>` +
      `<span><b>${all.filter((c) => c.expected === "reject").length}</b> should be refused</span>` +
      `<span><b>${all.filter((c) => c.expected === "accept").length}</b> should be accepted</span>` +
      // The third kind, or the numbers do not add up to the total beside them.
      `<span><b>${all.filter((c) => c.expected === "no-5xx").length}</b> must not break</span>` +
      `<span><b>${all.filter((c) => /^p0$/i.test(c.priority ?? "")).length}</b> P0</span>` +
      `<span class="cat-expand"><button type="button" data-all="open">expand all</button>` +
      `<button type="button" data-all="close">collapse all</button></span>`;
    strip.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        const open = b.dataset.all === "open";
        box.querySelectorAll(".cat-group").forEach((d) => { d.open = open; });
      }),
    );
    box.prepend(strip);
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
  /**
   * Whether we were TOLD this endpoint or worked it out.
   *
   * Cases imported from the written catalog describe behaviour; only some name
   * the call. The rest inherit one from their section. That distinction has to
   * survive to the reader, because a red result on an inferred endpoint may be
   * our inference being wrong rather than the product being broken — and a red
   * result here becomes a bug report.
   */
  const origin =
    t.pathSource && t.pathSource !== "stated"
      ? `<div class="cat-origin" title="${esc(
          t.pathSource === "carried"
            ? `Endpoint carried from the previous case in ${t.writtenRef || "this section"} — the written case did not name one.`
            : `Endpoint is this section's default; ${t.writtenRef || "the written case"} did not name one.`,
        )}">inferred endpoint</div>`
      : "";
  const why = [
    t.preconditions ? `<div class="cat-pre"><b>Before it runs:</b> ${esc(t.preconditions)}</div>` : "",
    t.steps?.length ? `<ol class="cat-steps">${t.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : "",
  ].join("");
  return `
    <tr class="cat-row e-${esc(t.expected)}">
      <td class="cat-id mono">${esc(t.id)}</td>
      <td class="cat-scn">${esc(feature.label)}</td>
      <td class="cat-desc">${esc(caseTitleInWords(t.title))}${why ? `<details class="cat-more"><summary>steps</summary>${why}</details>` : ""}</td>
      <td class="cat-data">${data}${origin}</td>
      <td class="cat-exp">${expectedInWords(t.expectedResult)}</td>
      <td><span class="cat-tag p-${esc((t.priority || "").toLowerCase())}">${esc(t.priority)}</span></td>
      <td><span class="cat-tag s-${esc((t.severity || "").toLowerCase())}">${esc(t.severity)}</span></td>
    </tr>`;
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
    $("#cat-run").innerHTML = ico("play") + " Run selected cases";
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
    const [tagCls0, tagText] = ROUTE_TAG[c.route.kind] || ["", c.route.kind];
    // A library copy that cannot run this case as written is not "exact".
    const tagCls = tagCls0 === "exact" && c.route.strength && !["exact", "same-request"].includes(c.route.strength) ? "area" : tagCls0;
    // The headline is the case in plain words (from /api/case-display); the id
    // is a muted reference. Until the words land, the author's title stands in.
    body.appendChild(
      el("div", "", `<span class="cat-title">${esc(caseTitleInWords(c.title))}</span><span class="cat-id">${esc(c.id)}</span>`),
    );
    const meta = el("div", "cat-meta");
    meta.appendChild(el("span", `cat-tag ${c.priority === "P0" ? "p0" : ""}`, esc(c.priority)));
    meta.appendChild(el("span", "cat-tag", esc(c.verdict)));
    const rt = el("span", `cat-tag ${tagCls}`, esc(tagText));
    rt.title = c.route.because;
    meta.appendChild(rt);
    if (c.gate) meta.appendChild(el("span", "cat-tag", `needs: ${esc(String(c.gate).replace(/[._]+/g, " "))}`));
    if (c.recordsCurrentBehaviour) {
      const t = el("span", "cat-tag area", "records today's behaviour");
      t.title = "This case documents what the product does now, not what it should do.";
      meta.appendChild(t);
    }
    body.appendChild(meta);
    body.appendChild(el("div", "cat-why", '<div class="cv-reason">Reading the case…</div>'));
    body.appendChild(el("div", "cv-track", "")).dataset.trackFor = c.id;
    body.lastChild.hidden = true;
    body.querySelector(".cat-title").addEventListener("click", () => row.classList.toggle("open"));
    row.appendChild(cb);
    row.appendChild(body);
    row.appendChild(el("span", "cat-res", ""));
    box.appendChild(row);
  }
  updateCatCount();
  paintCatalogWords(catCases);
}

/** Put the plain-English case into every catalog row, and its track record next to it. */
async function paintCatalogWords(cases) {
  const box = $("#cat-list");
  const displays = await CaseView.many(cases.map((c) => c.id));
  if (cases !== catCases) return; // the filters changed while we waited
  for (const c of cases) {
    const d = displays[c.id];
    const row = document.getElementById(`cat-${c.id}`);
    if (!row || !d) continue;
    row.querySelector(".cat-title").textContent = d.title;
    const extra = [{ label: "How it runs", value: c.route.because }];
    if (c.route.runner?.how) extra.push({ label: "Where it runs", value: c.route.runner.how });
    row.querySelector(".cat-why").innerHTML = CaseView.card(d, { noHead: true, noTrack: true, extraDetails: extra });
  }
  CaseView.fillTrack(box, currentClient);
}

function updateCatCount() {
  $("#cat-picked").textContent = catPicked.size ? `${catPicked.size} selected` : "nothing selected";
}

function runPickedCases() {
  if (!catPicked.size) {
    $("#cat-picked").textContent = "tick at least one case first";
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
  else if ($("#cat-demo")?.checked) {
    qs.set("login", "1");
    qs.set("slowmo", "250");
  }
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
  es.addEventListener("queued", (ev) => write(`${JSON.parse(ev.data).line}`, "queued"));
  es.addEventListener("compiled", (ev) => {
    const d = JSON.parse(ev.data);
    write(
      `Read the test case and decided on ${d.steps.length} steps: ${d.steps.map((s) => stepWords(s.step)).join(" → ")}.`,
      "sub",
    );
    for (const w of d.warnings || []) if (!/^resolved |^cannot test|^can only test/.test(w)) write(`Adjusted: ${w}`, "sub");
    if (d.coverage === "none") {
      write(`Cannot test this case yet — no step can observe: ${gapWords(d.gaps) || "what it checks"}. Refusing rather than running something else and calling it a pass.`, "gap");
    } else if (d.coverage === "partial") {
      write(`Only part of this case can be tested — no step yet for: ${gapWords(d.gaps)}.`, "gap");
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
    btn.innerHTML = ico("play") + " Run selected cases";
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
  "api-library": (r) => r.because,
  "api-template": (r) => r.because,
  "api-matrix": (r) => r.because,
  "api-plan": (r) => r.because,
};

// The step vocabulary, in the words a person would use.
const STEP_WORDS = {
  open_events_list: () => "open the events list",
  expect_events_list: () => "check the events list rendered",
  place_counter_offer: (a) => `send a counter offer${a?.price ? ` of ${a.price}` : ""}${a?.vendor ? ` to ${a.vendor}` : ""} from Master QCS`,
  expect_counter_offer_sent: (a) => `check the grid marks ${a?.vendor ? `${a.vendor}'s` : "the"} bid with a counter offer`,
  close_event: () => "close the event (force-end where offered, otherwise wait for the bidding window to lapse)",
  open_event: (a) => `open the event ${a?.id ? a.id : a?.title ? `"${a.title}"` : "this plan created"}`,
  accept_counter_offer: (a) => `as the vendor${a?.vendor ? ` ${a.vendor}` : ""}, accept the buyer's counter offer in the supplier portal`,
  expect_counter_offer_accepted: (a) => `check the buyer's grid marks ${a?.vendor ? `${a.vendor}'s` : "the"} counter offer as accepted`,
  capture_screen: (a) => `capture the screen as "${a?.label ?? "capture"}" (screenshot + accessibility tree)`,
  open_participants: () => "open the published event's participants list",
  open_master_qcs: (a) => `open Master QCS and check the comparison grid${Array.isArray(a?.vendors) && a.vendors.length ? ` lists ${a.vendors.join(", ")}` : ""}`,
  configure_single_stage: (a) => `configure the single-stage event as ${a?.eventType ?? "rfq"}${a?.auctionSubtype ? ` · ${String(a.auctionSubtype).replace("_", " ")} auction` : ""}${a?.awarding ? ` · award ${String(a.awarding).replace("_", " ")}` : ""}`,
  convert_to_auction: () => "convert the published RFQ to an auction (opens in a new tab)",
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
    // The strip is only there while a run holds the browser.
    $("#run-strip").hidden = !st.running;
    if (st.running) {
      const secs = Math.round((Date.now() - st.running.since) / 1000);
      const mode = st.running.headed === false ? "headless" : st.running.headed ? "in the visible window" : "";
      const prog = st.running.progress ? ` — ${st.running.progress}` : "";
      $("#rs-text").textContent = `Running ${st.running.label}${mode ? ` (${mode})` : ""}${prog} · ${secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`}`;
      dot.className = "rs-dot busy";
    } else {
      $("#rs-text").textContent = "";
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

// ── THE TEST CASE BOOK ──────────────────────────────────────────────────────
//
// Every written test case, by user journey, read as a QA sheet reads: case,
// steps, expected result, actual result, result. The actual result is copied
// from the latest real run of that case (/api/case-book); a case that has not
// run says so rather than showing a guess.

let caseBook = null;
const CB_RESULT = {
  passed: ["✓", "Passed", "ok"],
  failed: ["✗", "Failed", "bad"],
  "not-checked": ["–", "Not checked", "skip"],
  "not-run": ["·", "Not run yet", "none"],
};
const cbAttr = (s) => esc(s).replace(/"/g, "&quot;");
const cbPlain = (s) => String(s ?? "").replace(/`/g, "");
const cbResultOf = (c) => (c.last ? c.last.result : "not-run");
function cbWhen(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso ?? "";
  }
}
function cbSteps(s) {
  // "1. Do this. 2. Then that." → one line per numbered step
  return cbPlain(s)
    .split(/\s(?=\d+\.\s)/)
    .map((p) => esc(p))
    .join("<br>");
}

function initCaseBook() {
  document.querySelectorAll(".cb-tab").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".cb-tab").forEach((x) => x.classList.toggle("on", x === b));
      const pane = b.dataset.cbtab;
      const run = $("#cb-pane-run");
      const book = $("#cb-pane-book");
      const lib = $("#cb-pane-library");
      if (run) run.hidden = pane !== "run";
      if (book) book.hidden = pane !== "book";
      if (lib) lib.hidden = pane !== "library";
    }),
  );
  let t;
  for (const id of ["#cb-search", "#cb-journey", "#cb-layer", "#cb-priority", "#cb-result"]) {
    $(id)?.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(renderCaseBook, 150);
    });
  }
  loadCaseBook();
}

async function loadCaseBook() {
  const box = $("#casebook");
  if (!box) return;
  try {
    caseBook = await (await fetch("/api/case-book")).json();
  } catch {
    box.innerHTML = `<div class="empty">Could not read the test case book.</div>`;
    return;
  }
  const pick = $("#cb-journey");
  if (pick)
    pick.innerHTML =
      '<option value="">Every journey</option>' +
      caseBook.journeys.map((j) => `<option value="${cbAttr(j.id)}">${j.order}. ${esc(j.title)} (${j.cases.length})</option>`).join("");
  const n = $("#cb-tab-n");
  if (n) n.textContent = `(${caseBook.tally.cases})`;
  renderCaseBook();
}

function renderCaseBook() {
  const box = $("#casebook");
  if (!box || !caseBook) return;
  const q = ($("#cb-search")?.value ?? "").trim().toLowerCase();
  const jf = $("#cb-journey")?.value ?? "";
  const lf = $("#cb-layer")?.value ?? "";
  const pf = $("#cb-priority")?.value ?? "";
  const rf = $("#cb-result")?.value ?? "";
  const filtering = !!(q || jf || lf || pf || rf);
  const match = (c) => {
    if (lf === "field" ? !/^API-F/.test(c.id) : lf && c.layer !== lf) return false;
    if (pf && c.priority !== pf) return false;
    if (rf && cbResultOf(c) !== rf) return false;
    if (!q) return true;
    return `${c.id} ${c.title} ${c.expected} ${c.steps} ${c.section} ${c.last?.actual ?? ""}`.toLowerCase().includes(q);
  };

  box.innerHTML = "";
  const t = { passed: 0, failed: 0, "not-checked": 0, "not-run": 0 };
  let shown = 0;
  for (const j of caseBook.journeys) {
    if (jf && j.id !== jf) continue;
    const cases = j.cases.filter(match);
    if (!cases.length) continue;
    const r = { passed: 0, failed: 0, "not-checked": 0, "not-run": 0 };
    for (const c of cases) r[cbResultOf(c)]++;
    for (const k of Object.keys(t)) t[k] += r[k];
    shown += cases.length;
    const d = el("details", "cb-journey");
    d.innerHTML =
      `<summary class="cb-jhead"><span class="cb-jn">${j.order}</span>` +
      `<div class="cb-jt"><h2>${esc(j.title)}</h2><p>${esc(j.persona)} — ${esc(j.goal)}</p></div>` +
      `<span class="cb-jnums"><b>${cases.length}</b> case${cases.length === 1 ? "" : "s"}` +
      `<span class="ok">✓ ${r.passed} passed</span>` +
      (r.failed ? `<span class="bad">✗ ${r.failed} failed</span>` : "") +
      `<span class="mute">${r["not-run"]} not run yet</span></span></summary>`;
    const build = () => {
      if (d.dataset.built) return;
      d.dataset.built = "1";
      d.appendChild(cbTable(cases));
    };
    // Filtering opens what matched (the reader already said what they want);
    // otherwise the book opens as a contents page, one line per journey.
    if (filtering && (jf || cases.length <= 150)) {
      d.open = true;
      build();
    } else d.addEventListener("toggle", () => d.open && build());
    box.appendChild(d);
  }
  const sum = $("#cb-summary");
  if (sum)
    sum.innerHTML =
      `<span><b>${shown}</b> test case${shown === 1 ? "" : "s"}${filtering ? " matching" : ""}</span>` +
      `<span class="ok"><b>${t.passed}</b> passed</span>` +
      `<span class="bad"><b>${t.failed}</b> failed</span>` +
      `<span><b>${t["not-checked"]}</b> not checked</span>` +
      `<span class="mute"><b>${t["not-run"]}</b> not run yet</span>` +
      `<span class="cb-expand"><button type="button" data-cb="open">expand all</button><button type="button" data-cb="close">collapse all</button></span>`;
  sum?.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      box.querySelectorAll(".cb-journey").forEach((d) => {
        d.open = b.dataset.cb === "open";
      });
    }),
  );
  if (!shown) box.innerHTML = `<div class="empty">No test case matches that.</div>`;
}

function cbTable(cases) {
  const wrap = el("div", "cb-table-wrap");
  let html =
    `<table class="cb-table"><thead><tr><th>Case ID</th><th>Test case &amp; steps</th>` +
    `<th>Expected result</th><th>Actual result</th><th>Last result</th><th>Priority</th></tr></thead><tbody>`;
  let sec = null;
  for (const c of cases) {
    if (c.section !== sec) {
      sec = c.section;
      html += `<tr class="cb-sec"><td colspan="6">${esc(cbPlain(sec))}</td></tr>`;
    }
    const [ic, word, cls] = CB_RESULT[cbResultOf(c)];
    const actual = c.last
      ? `${esc(c.last.actual)}<div class="cb-where">${esc(c.last.where)} · ${esc(cbWhen(c.last.at))}` +
        (c.last.runId ? ` · <a href="/api/test-report?run=${encodeURIComponent(c.last.runId)}" target="_blank" rel="noopener">open report</a>` : "") +
        `</div>`
      : `<span class="mute">Not run yet</span>`;
    html +=
      `<tr class="cb-row r-${cls}" data-id="${cbAttr(c.id)}"><td class="cb-id">${esc(c.id)}</td>` +
      `<td class="cb-title"><span class="cb-tt">${esc(cbPlain(c.title))}</span><div class="cb-steps">${cbSteps(c.steps)}</div>` +
      `<div class="cv-track" data-track-for="${cbAttr(c.id)}" hidden></div></td>` +
      `<td class="cb-exp">${esc(cbPlain(c.expected))}</td>` +
      `<td class="cb-act">${actual}</td><td class="cb-res ${cls}">${ic} ${word}` +
      (c.last ? `<div class="cb-when">${esc(cbWhen(c.last.at))}</div>` : "") +
      `</td>` +
      `<td><span class="cb-pri p-${cbAttr(String(c.priority).toLowerCase())}">${esc(c.priority)}</span></td></tr>` +
      `<tr class="cb-more" hidden><td colspan="6"><b>Why it matters.</b> ${esc(cbPlain(c.why))}` +
      (c.setup ? `<br><b>Setup.</b> ${esc(cbPlain(c.setup))}` : "") +
      `<br><b>How it is checked.</b> ${esc(cbPlain(c.oracle))}</td></tr>`;
  }
  wrap.innerHTML = html + `</tbody></table>`;
  // The plain-English case (title, numbered steps, expected; the technical part
  // behind "Details") replaces the author's words as soon as it arrives.
  CaseView.many(cases.map((c) => c.id)).then((displays) => {
    for (const row of wrap.querySelectorAll("tr.cb-row")) {
      const d = displays[row.dataset.id];
      if (!d) continue;
      row.querySelector(".cb-tt").textContent = d.title;
      const steps = (d.steps || []).filter(Boolean);
      row.querySelector(".cb-steps").innerHTML = steps.length ? `<ol class="cv-steps">${steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : "";
      if (d.expected) row.querySelector(".cb-exp").textContent = d.expected;
      const more = row.nextElementSibling;
      if (more?.classList.contains("cb-more")) more.firstElementChild.innerHTML = CaseView.card({ ...d, steps: [], expected: "" }, { noHead: true, noTrack: true });
    }
    CaseView.fillTrack(wrap, currentClient);
  });
  wrap.addEventListener("click", (e) => {
    const row = e.target.closest("tr.cb-row");
    if (!row || e.target.closest("a") || e.target.closest(".cv-details")) return;
    const more = row.nextElementSibling;
    if (more?.classList.contains("cb-more")) more.hidden = !more.hidden;
    row.classList.toggle("open");
  });
  return wrap;
}
