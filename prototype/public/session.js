/**
 * THE RUN AS A SESSION (#/run once something has run).
 *
 * Left: what was asked, then the run narrating itself — each step a line with
 * a status dot (grey to do, amber running, green worked, red failed), notes
 * from the run as INFO boxes, and how it ended as a DONE (green) / FAILED
 * (red) / NOT TESTED (grey) box. Under it, a composer: a message sent there
 * continues the same session — "retry", "now with a wrong OTP", "write the
 * test case for this run" — answered in place or run as the next turn
 * (POST /api/session/reply decides which; src/routes/session.ts).
 *
 * Right: what the run is driving — the live browser (the frames /api/plan-run
 * and /api/ui-run already stream) or, for API runs, each request as it goes.
 * The divider between the two columns drags.
 *
 * It owns no run logic. app.js's runners call the hooks on
 * window.spineSession as their streams arrive, and the step lists app.js
 * already draws (#ui-steps, the API journey, the check rows) sit inside the
 * turn, restyled by session.css. Every verdict word is the runner's; this
 * file only lays it out and colours it.
 */
(function () {
  "use strict";

  const q$ = (sel, root = document) => root.querySelector(sel);
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (name, cls = "") => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const read = (fn, fallback) => {
    try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; }
  };
  const MODES = ["api", "ui", "both"];
  const MODE_WORD = { api: "API", ui: "UI", both: "API + UI" };

  const S = {
    id: null,           // its address, #/session/{id}: made here for a new session, the run's own id for a saved one
    yourTurn: false,    // a run in this tab ended while nobody was looking at it (Home and the sidebar say so)
    on: false,          // a session exists: the Run screen shows it instead of the ask box
    open: false,        // a run is in flight in the current turn
    continuing: false,  // the next begin() is a follow-up in this session, not a new one
    pendingAsk: null,   // what was typed in the composer, when it differs from what runs
    mode: "both",
    turn: null,
    chat: [],           // the conversation, for the reply endpoint's context
    tab: "browser",
    tabPicked: false,   // the reader chose a tab; the run stops switching it for them
    frames: 0,
    reqs: 0,
    clock: null,
    asking: null,       // an open question from the run: { runId, n, card, options }
    onEnd: null,        // told how this turn ended (a case run from the test cases table, runCases.js)
    shot: false,        // the Browser panel shows the run's last screenshot (a saved run has no live frames)
  };

  // ── elements ─────────────────────────────────────────────────────────────
  const el = {
    get scroll() { return q$("#ss-scroll"); },
    get thread() { return q$("#ss-thread"); },
    get history() { return q$("#ss-history"); },
    get turn() { return q$("#ss-turn"); },
    get ask() { return q$("#ss-ask"); },
    get narr() { return q$("#ss-narr"); },
    get end() { return q$("#ss-end"); },
    get after() { return q$("#ss-after"); },
  };
  const node = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  // ── showing / hiding the session ─────────────────────────────────────────
  function setOn(on) {
    S.on = on;
    if (on) document.documentElement.dataset.session = "on";
    else delete document.documentElement.dataset.session;
  }
  /** The session is what the reader is looking at (so the end-of-run modal is not needed). */
  const showing = () => S.on && document.documentElement.dataset.view === "run";

  // ── the top bar ──────────────────────────────────────────────────────────
  /** The client and environment a turn runs against, as they were when it started. */
  function target() {
    const base = read(() => customBase, "");
    let env = "UAT";
    if (q$("#env")?.value === "custom" && base) { try { env = new URL(base).host; } catch { env = base; } }
    return { companyId: read(() => currentClient, null), company: read(() => currentClientName, ""), env };
  }
  function targetText() {
    const name = read(() => currentClientName, "") || "Client";
    const base = read(() => customBase, "");
    let env = "UAT";
    if (base) { try { env = new URL(base).host; } catch { env = base; } }
    return `${name} · ${env}`;
  }
  function paintTop() {
    const t = q$("#ss-target");
    if (t) t.textContent = targetText();
    const title = q$("#ss-title");
    if (title) {
      const text = String(S.turn?.text ?? "").replace(/\s+/g, " ").trim();
      title.textContent = text;
      title.title = text;
    }
    const status = q$("#ss-status");
    if (status) {
      // Done is closed, as Canary says it; a message from the composer opens the next turn.
      status.dataset.state = S.open ? "running" : "closed";
      q$("#ss-status-text").textContent = S.open ? "Running" : "Session closed";
    }
    const stop = q$("#ss-stop");
    paintStop();
    const comp = q$("#ss-composer");
    if (comp) comp.classList.toggle("busy", S.open);
    const msg = q$("#ss-msg");
    if (msg) msg.placeholder = S.asking ? "Answer the question above, or pick an option" : S.open ? (S.turn?.runId ? "Running… tell the test something — “use the Open tab”, “skip”, “stop”" : "Running… you can type your next message") : "Send a message to continue";
    syncSend();
    paintLive();
  }

  // ── turns ────────────────────────────────────────────────────────────────
  /**
   * A new turn. From the composer it continues this session (the last turn is
   * kept above, frozen as it ended); from anywhere else it starts a new one.
   */
  function begin({ text = "", mode = S.mode, kind = "typed", replay = false, id = null, flowKeys = null, bidders = 0 } = {}) {
    const ask = S.pendingAsk;
    S.pendingAsk = null;
    const continuing = S.continuing && S.on && S.turn;
    if (continuing) freezeTurn();
    else resetSession();
    // A follow-up keeps its session's address; anything else gets a new one.
    // The servers name a run only once it has finished, so a live one is named here.
    if (!continuing) S.id = id || (replay ? null : `s-${Date.now().toString(36)}`);
    S.yourTurn = false;
    S.continuing = false;
    setOn(true);
    S.open = !replay;
    S.mode = MODES.includes(mode) ? mode : "both";
    const shown = ask?.display || text;
    // flowKeys: the browser journeys this turn ran, so "Run again" runs exactly those.
    const keys = Array.isArray(flowKeys) && flowKeys.length ? flowKeys.map(String) : null;
    S.turn = { text: shown, runText: text, mode: S.mode, kind, replay, flowKeys: keys, bidders, target: target(), startedAt: Date.now(), plan: [], log: [], ended: {} };
    S.chat.push({ role: "user", text: shown });

    // The live turn is reused: the last run's id must not carry over to this one.
    if (el.turn) delete el.turn.dataset.runId;
    // …nor its look: a discarded run's fade greyed out the next one.
    el.turn?.classList.remove("rk-gone");
    const turn = el.turn;
    if (turn) turn.dataset.kind = kind;
    el.narr.innerHTML = "";
    el.end.innerHTML = "";
    // No "UI · PROCOL DEMO · UAT" under the request: the top bar already
    // says which client and environment, and the steps say what kind of run.
    el.ask.innerHTML =
      `<div class="ss-user">${h(shown)}</div>` +
      (replay ? `<div class="ss-meta">Saved run</div>` : "") +
      (ask?.compiled ? `<div class="ss-compiled"><span>Running as</span><div class="ss-clamp" title="Click to read it all">${h(ask.compiled)}</div></div>` : "") +
      (ask?.note ? `<div class="ss-meta left">${h(ask.note)}</div>` : "");
    syncModeSeg();
    // The last turn's report links must not end up on this turn's DONE box.
    for (const id of ["#open-api-report", "#open-bug-sheet"]) q$(id)?.removeAttribute("href");
    // Nor may its steps, raw output, API journey or last browser frame: a run
    // that never draws them (an API-only case) would otherwise show the old ones.
    read(() => resetUiSteps(), null);
    read(() => resetJourney(), null);
    // The check rows are app.js's; a run that has rows sets its own, and one
    // that has none (a browser journey) must not show the last run's.
    read(() => {
      checkRows = [];
      rowNodes.clear();
      runEmptyNote = "";
      renderAutomation();
    }, null);
    const skips = q$("#skips");
    if (skips) skips.hidden = true;
    const agents = q$("#agent-reasoning-section");
    if (agents) agents.hidden = true;
    const timeline = q$("#timeline");
    if (timeline) timeline.innerHTML = "";
    const con = q$("#ui-console");
    if (con) con.innerHTML = "";
    const fp = q$("#live-frame-panel");
    if (fp) fp.hidden = true;
    q$("#live-frame")?.removeAttribute("src");
    sideReset();
    spotsReset();

    S.frames = 0;
    S.shot = false;
    S.reqs = 0;
    S.tabPicked = false;
    const list = q$("#ss-req-list");
    if (list) list.innerHTML = "";
    paintReqCount();
    S.con = new Map();
    paintConsole();
    // A saved browser journey opens as a "features" turn too, but in UI mode:
    // it keeps the Browser panel (its "Run again" lives there).
    const apiOnly = S.mode === "api" || (kind === "features" && S.mode !== "ui");
    setTab(apiOnly ? "requests" : "browser");
    // A run with no browser has nothing to watch on the right; its requests
    // are one click away (the top bar's button) instead of a wall of paths.
    setRight(!apiOnly);
    paintCases();
    paintTop();
    startClock();
    pin(true);
  }

  /**
   * One plain line while an API run tries its cases: how far, and how many
   * failed so far. The rows themselves are the report's.
   */
  function paintCases() {
    let line = q$("#ss-cases");
    if (!line) {
      line = node(`<p class="ss-cases" id="ss-cases" hidden></p>`);
      el.turn?.querySelector(".run-split")?.after(line);
    }
    const rows = S.open && S.turn?.kind === "features" ? read(() => checkRows, []) || [] : [];
    line.hidden = !rows.length;
    if (!rows.length) return;
    const planned = Math.max(read(() => runPlanned, 0) || 0, rows.length);
    const failed = rows.filter((c) => !c.pass && !c.inconclusive).length;
    line.textContent =
      `Checking the cases: ${rows.length} of ${planned} done` +
      (failed ? ` · ${failed} failed so far` : " · none failed so far");
  }

  /** A run that started without asking first (a catalogue run, the PO flow) still gets a turn. */
  function ensure({ text = "", mode = "api", kind = "features" } = {}) {
    if (S.open) return;
    begin({ text, mode, kind });
  }

  function resetSession() {
    if (el.history) el.history.innerHTML = "";
    if (el.after) el.after.innerHTML = "";
    S.chat = [];
  }

  /**
   * Keep the finished turn above as it looked when it ended.
   *
   * A copy, because the live elements (#automation, #ui-steps, the journey)
   * are reused by the next run. Ids come off so the page never has two, and
   * whatever was not visible — or only makes sense live (a ticking clock, a
   * Re-run button wired to the old rows) — is left out.
   */
  function freezeTurn() {
    const live = el.turn;
    if (!live || !el.history) return;
    const copy = live.cloneNode(true);
    const a = [...live.querySelectorAll("*")];
    const b = [...copy.querySelectorAll("*")];
    const drop = [];
    a.forEach((n, i) => {
      if (n.hidden || getComputedStyle(n).display === "none") drop.push(b[i]);
    });
    for (const n of drop) n.remove();
    copy.querySelectorAll(".starting, .ss-working, .chk-rerun, .retry-btn, .ss-jumpto").forEach((n) => n.remove());
    copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    copy.removeAttribute("id");
    copy.className = "ss-past";
    el.history.appendChild(copy);
    while (el.after.firstChild) el.history.appendChild(el.after.firstChild);
  }

  // ── the working line: a clock while nothing else says the run is alive ───
  function working(text) {
    if (!S.on || !S.open) return;
    let w = q$(".ss-working", el.narr);
    if (!w) {
      w = node(`<div class="ss-working"><span class="ss-dot"></span><span class="ss-working-t"></span><span class="ss-clock"></span></div>`);
      el.narr.appendChild(w);
    } else if (w !== el.narr.lastElementChild) {
      el.narr.appendChild(w);
    }
    q$(".ss-working-t", w).textContent = String(text ?? "").trim();
    tick();
  }
  function stopWorking() {
    q$(".ss-working", el.narr)?.remove();
  }
  function since(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  }
  function tick() {
    const c = q$(".ss-working .ss-clock", el.narr);
    if (c && S.turn) c.textContent = since(Date.now() - S.turn.startedAt);
  }
  /**
   * Stop, whenever a run of this page is in flight — also while it only waits
   * for the browser. The header repainted on steps alone, and a journey queued
   * behind another run sends none, so there was no way to stop it (21 Oct).
   */
  function paintStop() {
    const stop = q$("#ss-stop");
    if (stop) stop.hidden = !(S.open && (read(() => uiRunning, null) || read(() => apiRunning, null) || read(() => catRunning, null)));
  }
  function startClock() {
    clearInterval(S.clock);
    S.clock = setInterval(() => {
      if (!S.open) return;
      tick();
      paintCases();
      paintStop();
    }, 1000);
  }

  // ── narration ────────────────────────────────────────────────────────────
  // Long words are folded to two lines (session.css .ss-clamp and friends); a click opens or closes them.
  document.addEventListener("click", (e) => {
    const t = e.target.closest?.(".ss-clamp, .ss-b.head > .ss-b-body > .ss-b-d:not(.ss-step-detail), .ss-b-a");
    if (t && !e.target.closest("a, button, summary")) t.classList.toggle("ss-unclamp");
  });
  function addNarr(n) {
    const w = q$(".ss-working", el.narr);
    if (w) el.narr.insertBefore(n, w);
    else el.narr.appendChild(n);
    return n;
  }
  const remember = (line) => {
    if (S.turn) S.turn.log.push(String(line).slice(0, 400));
  };

  /** A heading line: what is being checked, in words, with an optional grey line under it. */
  function head(title, desc = "", state = "") {
    if (!S.on) return null;
    remember(`${title}${desc ? ` — ${desc}` : ""}`);
    return addNarr(node(
      `<div class="ss-b head ${h(state)}"><span class="ss-dot"></span><div class="ss-b-body">` +
      `<div class="ss-b-t">${h(title)}</div>${desc ? `<div class="ss-b-d">${h(desc)}</div>` : ""}</div></div>`,
    ));
  }

  /** An action line: the verb in bold, its argument after it. */
  function act(verb, arg = "", state = "", extra = "") {
    if (!S.on) return null;
    return addNarr(node(
      `<div class="ss-b act ${h(state)}"><span class="ss-dot"></span><div class="ss-b-body">` +
      `<div class="ss-b-a"><b>${h(verb)}</b>${arg ? ` <span class="ss-arg">${h(arg)}</span>` : ""}${extra}</div></div></div>`,
    ));
  }

  /** An INFO box: something the run noticed that the reader should know. */
  function note(text, tone = "info", badge = "") {
    if (!S.on || !String(text ?? "").trim()) return;
    const word = badge || { info: "Info", warn: "Warning", bad: "Defect", ok: "Note" }[tone] || "Info";
    remember(`${word.toUpperCase()}: ${text}`);
    addNarr(node(
      `<div class="ss-note ${h(tone)}"><span class="ss-note-ico">${icon(tone === "bad" || tone === "warn" ? "triangle-alert" : "info")}</span>` +
      `<span class="ss-badge">${h(word)}</span><div class="ss-note-t">${h(text)}</div></div>`,
    ));
  }

  // ── a compiled browser plan (Run UI) ─────────────────────────────────────
  const ASSERTS = /^(expect|assert|verify|check|see|confirm)/;
  function argWords(args) {
    if (!args || typeof args !== "object") return "";
    return Object.values(args)
      .filter((v) => v !== undefined && v !== null && v !== "")
      .map((v) => (Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)))
      .join(" · ");
  }
  // Steps whose name does not read as a sentence on its own.
  const STEP_LABELS = { do_on_screen: "Do on screen", ask_tester: "Ask you" };
  const STAGE_WORDS = { rfp: "Technical", rfi: "Technical", technical: "Technical", rfq: "RFQ", auction: "Auction" };
  /**
   * A step as its row reads — the PR start's steps (session 6c, 27 Oct) carry their args in the words:
   * "Open the Open tab", "Tick PR PR-1238", "Choose the event: Technical + RFQ".
   */
  function stepLabel(s) {
    const a = s?.args || {};
    switch (s?.step) {
      case "open_purchase_requisitions": return { verb: "Open Purchase Requisitions", arg: "" };
      case "pr_tab": return { verb: `Open the ${a.tab || "Open"} tab`, arg: "" };
      case "select_pr": return { verb: a.pr ? `Tick PR ${a.pr}` : "Tick a PR", arg: "" };
      case "purchase_items": return { verb: "Purchase Items → Start New Project (Purchase Cart)", arg: "" };
      case "choose_stages": {
        const st = Array.isArray(a.stages) ? a.stages : [];
        return { verb: st.length ? `Tick ${st.map((x) => STAGE_WORDS[String(x).toLowerCase()] || x).join(" + ")} under Create Project → Create Project` : "Tick the stages under Create Project (I'll ask you which) → Create Project", arg: "" };
      }
      case "expect_pr_items": return { verb: "The create screen lists the PR's items", arg: "" };
      default: return { verb: stepVerb(s?.step), arg: argWords(a) };
    }
  }
  function stepVerb(name) {
    if (STEP_LABELS[name]) return STEP_LABELS[name];
    const w = String(name ?? "").replace(/_/g, " ").trim();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }

  /** The compiler's gaps as one list, without the full stops each one ends in. */
  const gapWords = (gaps) => (gaps || []).map((g) => String(g).trim().replace(/[\s.;,]+$/, "")).filter(Boolean).join("; ");

  // A step's name as a person says it, for the planner's notes.
  const STEP_WORDS = {
    place_surrogate_bid: "place a surrogate bid", place_bid: "place a bid", publish: "publish", expect_published: "check it published",
    convert_to_auction: "convert it to an auction", close_event: "close the event", open_event: "open an event",
    open_prepared: "open the event the API builds", open_create: "open the create screen", set_title: "set the title",
    set_schedule: "set the schedule", invite_vendor: "invite a vendor", ask_tester: "ask you", do_on_screen: "work it out on screen", select_template: "choose a template",
    add_line_items: "add line items", fill_sheet: "fill the price sheet", assign_evaluator: "assign an evaluator",
    open_master_qcs: "open Master QCS", open_participants: "open Participants", award_event: "award the event",
    place_counter_offer: "send a counter offer", open_events_list: "open the events list", filter_events: "switch the events list tab",
    open_purchase_requisitions: "open Purchase Requisitions", pr_tab: "open the PR tab", select_pr: "tick a PR",
    purchase_items: "use Purchase Items → Start New Project", choose_stages: "choose the event's stages", expect_pr_items: "check the create screen lists the PR's items",
  };
  const stepWords = (name) => STEP_WORDS[name] || String(name).replace(/_/g, " ");
  /** Step ids inside a reason ("close_event's job") said as words. */
  const plainIds = (t) => String(t).replace(/\b([a-z]+(?:_[a-z]+)+)('s)?\b/g, (_, id, poss) => `the “${stepWords(id)}” step${poss ? "'s" : ""}`);
  /** One planner note in plain words; null for pure ordering notes, kept under "the planner's own notes". */
  function planNoteWords(w) {
    const t = String(w).trim();
    let m;
    if (/^moved \w+ to the front\b/i.test(t)) return null;
    if ((m = t.match(/^added (\w+)(?:\{[^}]*\}|\([^)]*\))? — (.+)$/i))) return `I added a step to ${stepWords(m[1])}: ${plainIds(m[2])}.`;
    if ((m = t.match(/^dropped (\w+) — (.+)$/i))) return `I left out “${stepWords(m[1])}”: ${plainIds(m[2])}.`;
    if ((m = t.match(/^(\w+) → (\w+)(?:\{[^}]*\}|\([^)]*\))? — (.+)$/))) return `Instead of “${stepWords(m[1])}”, I'll ${stepWords(m[2])}: ${plainIds(m[3])}.`;
    return plainIds(t.replace(/^note:\s*/i, "Note: "));
  }

  /**
   * What the planner changed or could not cover, said ONCE and plainly before the run, in one
   * card — not one INFO box per raw note (Aanya, 26 Oct: "why this abrupt warning", over three
   * boxes reading "note: publish cannot run on a published event — left as written" and the like).
   */
  function beforeStart(p) {
    if (!S.on) return;
    const lines = [];
    const asks = (p.steps || []).some((s) => s.step === "ask_tester");
    if (p.coverage === "partial") {
      lines.push(asks
        ? `There is no step for part of this case, so I'll ask you to do it in the browser when we get there: ${gapWords(p.gaps)}.`
        : `This part can't be tested yet — there is no step for it: ${gapWords(p.gaps)}.`);
    }
    const kept = [];
    for (const w of p.warnings || []) {
      if (/^cannot test|^can only test/i.test(w)) continue;
      const plain = planNoteWords(w);
      if (plain) lines.push(plain);
      else kept.push(w);
    }
    if (!lines.length && !kept.length) return;
    remember(`PLAN PREPARED: ${lines.join(" ")}`);
    // The summary says what kind of notes they are, so nobody has to open it to know nothing went wrong.
    const changed = lines.length - (p.coverage === "partial" ? 1 : 0);
    const parts = [
      changed ? `I adjusted ${changed === 1 ? "1 thing" : `${changed} things`}` : "",
      p.coverage === "partial" ? (asks ? "1 part needs you — I'll ask when we get there" : "1 part has no step yet") : "",
    ].filter(Boolean);
    addNarr(node(
      `<details class="ss-prep"><summary><span class="ss-prep-ico">${icon("list-checks")}</span><span>Plan prepared${parts.length ? ` — ${h(parts.join(" · "))}` : ""}</span></summary>` +
      `<ul>${lines.map((l) => `<li>${h(l)}</li>`).join("")}</ul>` +
      (kept.length ? `<details class="ss-before-more"><summary>The planner's own notes (${kept.length})</summary><ul>${kept.map((k) => `<li>${h(k)}</li>`).join("")}</ul></details>` : "") +
      `</details>`,
    ));
  }

  /**
   * A DRAFT of the plan while the case compiles (planner.quickOutline: no model, under a second —
   * Aanya, 27 Oct: "too slow", "boring for the user watching"). The steps it will most likely run,
   * marked "Draft plan", replaced by the compiled plan the moment it arrives.
   */
  function outline(p) {
    if (!S.on || !S.turn || S.turn.plan?.length) return;
    draftGone();
    const steps = p?.steps || [];
    if (!steps.length) return;
    S.turn.draft = addNarr(node(
      `<div class="ss-draft"><div class="ss-draft-h"><span class="ss-draft-tag">Draft plan</span><span>${h(p.title || "")} — refining it into exact steps</span></div>` +
      `<ol class="ss-draft-steps">${steps.map((s) => {
        const { verb, arg } = stepLabel(s);
        return `<li class="ss-b act wait"><span class="ss-dot"></span><div class="ss-b-body"><div class="ss-b-a"><b>${h(verb)}</b>${arg ? ` <span class="ss-arg">${h(arg)}</span>` : ""}</div></div></li>`;
      }).join("")}</ol></div>`,
    ));
  }
  /** The draft goes once the real plan (or the explorer, or a refusal) takes its place. */
  function draftGone() {
    S.turn?.draft?.remove();
    if (S.turn) S.turn.draft = null;
  }

  function plan(p) {
    if (!S.on) return;
    draftGone();
    stopWorking();
    // A plan that cannot run is not a green line: its dot stays grey.
    const runnable = p.coverage !== "none" && (p.steps || []).length > 0;
    head(p.title || "The plan", p.reasoning || "", runnable ? "ok" : "skip");
    // What the planner prepared goes with the plan, above its steps — not after them, where results appear.
    beforeStart(p);
    const list = node(`<ol class="ss-steps"></ol>`);
    S.turn.plan = (p.steps || []).map((s, i) => {
      const { verb, arg } = stepLabel(s);
      const assertion = ASSERTS.test(String(s.step ?? ""));
      const li = node(
        `<li class="ss-b ${assertion ? "head" : "act"} wait" data-i="${i}"><span class="ss-dot"></span><div class="ss-b-body">` +
        (assertion
          ? `<div class="ss-b-t">${h(verb)}${arg ? ` <span class="ss-arg">${h(arg)}</span>` : ""}</div>`
          : `<div class="ss-b-a"><b>${h(verb)}</b>${arg ? ` <span class="ss-arg">${h(arg)}</span>` : ""}</div>`) +
        `<div class="ss-b-d ss-step-detail" hidden></div></div></li>`,
      );
      list.appendChild(li);
      return { verb, arg, name: s.step, state: "wait", detail: "" };
    });
    // planStep() ticks THIS list: a Both ask can show an API journey's list above it.
    S.turn.planList = list;
    if (S.turn.plan.length) addNarr(list);
    // An API journey's steps come here too (via "api"), so the chat reads the same either way.
    S.turn.planVia = p.via === "api" ? "api" : "browser";
    if (S.turn.planVia === "browser") browserPart();
    if (runnable) working(`Running ${S.turn.plan.length} step${S.turn.plan.length === 1 ? "" : "s"} ${p.via === "api" ? "against the API" : "in the browser"}`);
  }

  /** How many step rows the running plan has. */
  const planLength = () => S.turn?.plan?.length ?? 0;
  /**
   * Steps added mid-run (choose_stages asks which event and then inserts that event's stage steps):
   * rows for them at `at`, the later rows moved down. They start unnamed; planName names each as it runs.
   */
  function planGrow(at, count) {
    const list = S.turn?.planList;
    if (!S.on || !list || !(count > 0)) return;
    const rows = Array.from(list.querySelectorAll(":scope > li[data-i]"));
    const before = rows[at] ?? null;
    for (let k = 0; k < count; k++) {
      list.insertBefore(
        node(`<li class="ss-b act wait" data-i=""><span class="ss-dot"></span><div class="ss-b-body"><div class="ss-b-a"><b>Next step</b></div><div class="ss-b-d ss-step-detail" hidden></div></div></li>`),
        before,
      );
      S.turn.plan.splice(at + k, 0, { verb: "Next step", arg: "", name: "", state: "wait", detail: "" });
    }
    Array.from(list.querySelectorAll(":scope > li")).forEach((li, i) => (li.dataset.i = String(i)));
  }
  /** Name a row by the step the run says is there (a row added mid-run, or one whose step changed). */
  function planName(i, name) {
    const s = S.turn?.plan?.[i];
    if (!S.on || !s || !name || s.name === name) return;
    const li = S.turn.planList?.querySelector(`:scope > [data-i="${i}"]`);
    const { verb } = stepLabel({ step: name });
    s.name = name;
    s.verb = verb;
    const b = li && (q$(".ss-b-a b", li) || q$(".ss-b-t", li));
    if (b) b.textContent = verb;
  }

  /** state: "run" | "ok" | "bad" | "skip" */
  /** A locator as Playwright describes it, as a person says it: getByRole('button', { name: 'Publish' }) → button “Publish”. */
  function controlWords(t) {
    const x = String(t || "");
    // a regex name read as words: /^rfq\b/i → rfq
    const plain = (lit, re) => (lit ?? String(re ?? "").replace(/\\[bBsSdDwW]|[\^$]|\(\?:|[()?+*]/g, "").replace(/\\(.)/g, "$1").replace(/\|/g, " or ")).trim();
    let m;
    if ((m = x.match(/getByRole\('([\w-]+)'(?:,\s*\{\s*name:\s*(?:'([^']*)'|\/([^/]*)\/\w*))?/))) return `${m[1]}${m[2] || m[3] ? ` “${plain(m[2], m[3])}”` : ""}`;
    if ((m = x.match(/getBy(Text|Label|Placeholder|Title|TestId)\((?:'([^']*)'|\/([^/]*)\/\w*)/))) return `${{ Text: "", Label: "field ", Placeholder: "field ", Title: "", TestId: "" }[m[1]]}“${plain(m[2], m[3])}”`;
    return x.length > 70 ? `${x.slice(0, 69)}…` : x;
  }

  /**
   * What the step left on screen, in words — the record kept instead of a picture per step (Aanya,
   * 26 Oct): what the step did, the page, its headings, tabs, buttons (and which were off), fields and
   * their values, messages, dialogs, console errors and warnings, failed requests. Closed by default.
   */
  function screenRecordHtml(rec) {
    const sc = rec?.screen;
    const acts = Array.isArray(rec?.actions) ? rec.actions : [];
    if (!sc && !acts.length) return "";
    const row = (label, html) => (html ? `<div class="ss-scr-row"><span class="ss-scr-k">${h(label)}</span><span class="ss-scr-v">${html}</span></div>` : "");
    const list = (xs) => xs.filter(Boolean).join(" · ");
    const parts = [
      row("Did", list(acts.map((a) => `${h(a.verb)} ${h(controlWords(a.target))}${a.value ? ` <i>${h(a.value)}</i>` : ""}`))),
      sc ? row("Page", `${h(sc.title || "")}${sc.url ? ` <code>${h(sc.url)}</code>` : ""}`) : "",
      sc?.headings?.length ? row("Headings", h(list(sc.headings))) : "",
      sc?.tabs?.length ? row("Tabs", list(sc.tabs.map((t) => (t.selected ? `<b>${h(t.name)}</b>` : h(t.name))))) : "",
      sc?.buttons?.length ? row("Buttons", list(sc.buttons.map((b) => (b.disabled ? `<span class="ss-scr-off">${h(b.name)} (off)</span>` : h(b.name))))) : "",
      sc?.fields?.length ? row("Fields", list(sc.fields.map((f) => `${h(f.label)}${f.required ? "*" : ""}: ${f.value ? h(f.value) : "<i>empty</i>"}${f.error ? ` <span class="ss-scr-bad">${h(f.error)}</span>` : ""}`))) : "",
      sc?.messages?.length ? row("Messages", h(list(sc.messages))) : "",
      sc?.dialogs?.length ? row("Open", h(list(sc.dialogs))) : "",
      sc?.console?.length ? row("Console", list(sc.console.map((c) => `<span class="${c.type === "error" ? "ss-scr-bad" : ""}">${h(c.type)}: ${h(c.text)}</span>`))) : "",
      sc?.failedRequests?.length ? row("Failed calls", list(sc.failedRequests.map((r) => `<span class="ss-scr-bad">${h(r.method)} ${h(r.path)} → ${h(r.status)}</span>`))) : "",
    ].join("");
    const flags = [sc?.failedRequests?.length ? `${sc.failedRequests.length} failed call${sc.failedRequests.length === 1 ? "" : "s"}` : "", sc?.console?.some((c) => c.type === "error") ? "console errors" : ""].filter(Boolean);
    return `<details class="ss-scr"><summary>What was on screen${flags.length ? ` <span class="ss-scr-bad">· ${h(flags.join(" · "))}</span>` : ""}</summary>${parts}</details>`;
  }

  function planStep(i, state, detail, spotlights, record) {
    if (!S.on || !S.turn?.plan?.[i]) return;
    if (record?.screen) consoleLines({ step: i + 1, stepName: S.turn.plan[i].step || "", url: record.screen.url || "", console: record.screen.console || [], failedRequests: record.screen.failedRequests || [] });
    const li = S.turn.planList?.querySelector(`:scope > [data-i="${i}"]`) ?? q$(`.ss-steps > [data-i="${i}"]`, el.narr);
    if (!li) return;
    li.classList.remove("wait", "run", "ok", "bad", "skip");
    li.classList.add(state);
    const s = S.turn.plan[i];
    s.state = state;
    spotsOutcome(i + 1, state);
    if (detail !== undefined) {
      s.detail = String(detail || "");
      const d = q$(".ss-step-detail", li);
      if (d) {
        // The notes above it already list what was passed over; the detail
        // keeps that list for a saved run, which has no notes.
        d.textContent = s.notes?.length ? s.detail.replace(/\s*Passed over(?: first)? — [\s\S]*$/, "") : s.detail;
        d.hidden = !d.textContent;
      }
    }
    // The step's screen in words, under its detail.
    if (record && (record.screen || record.actions?.length)) {
      q$(".ss-scr", li)?.remove();
      const html = screenRecordHtml(record);
      if (html) (q$(".ss-step-detail", li)?.parentElement || li).insertAdjacentHTML("beforeend", html);
    }
    // The step's own pictures: each action framed, each assertion verified (spotlight.ts).
    if (Array.isArray(spotlights) && spotlights.length) {
      let strip = q$(".ss-step-spots", li);
      if (!strip) {
        strip = document.createElement("div");
        strip.className = "ss-step-spots";
        (q$(".ss-step-detail", li)?.parentElement || li).appendChild(strip);
      }
      strip.innerHTML = "";
      for (const sp of spotlights) {
        const t = document.createElement("img");
        t.className = "ss-step-spot";
        t.dataset.action = sp.action;
        t.dataset.tone = state;
        t.loading = "lazy";
        t.src = spotUrl(sp);
        t.alt = spotCaption(sp);
        t.title = spotCaption(sp);
        t.addEventListener("click", () => spotOpen(sp));
        strip.appendChild(t);
      }
    }
    if (state === "run") working(`Step ${i + 1} of ${S.turn.plan.length}: ${s.verb}`);
  }

  /**
   * A line under a step while it runs — which event the run looked at and why
   * it was used or passed over ("[pick] …" from the run). kind: "ok" | "no" | "info".
   */
  function planNote(i, text, kind) {
    if (!S.on || !S.turn?.plan?.[i] || !text) return;
    const li = S.turn.planList?.querySelector(`:scope > [data-i="${i}"]`) ?? q$(`.ss-steps > [data-i="${i}"]`, el.narr);
    if (!li) return;
    const s = S.turn.plan[i];
    (s.notes ??= []).push({ text: String(text), kind });
    let ul = q$(".ss-step-notes", li);
    if (!ul) {
      ul = node(`<ul class="ss-step-notes"></ul>`);
      q$(".ss-step-detail", li)?.before(ul);
    }
    const mark = kind === "ok" ? "✓" : kind === "no" ? "✕" : "·";
    ul.appendChild(node(`<li class="${kind}"><span class="ss-note-m" aria-hidden="true">${mark}</span><span>${h(String(text))}</span></li>`));
    if (li.classList.contains("run") || li.classList.contains("wait")) working(`Step ${i + 1} of ${S.turn.plan.length}: ${String(text).slice(0, 90)}`);
  }

  // ── a journey worked out on screen (no ready-made steps) ─────────────────
  /**
   * The explorer (procol-ui-tests/src/explore/) chooses each step as it goes,
   * so this list grows instead of being drawn up front. A line is what was
   * actually done ("Clicked “Purchase Orders”"), the reason in grey under it,
   * and the screenshot taken after it. Its questions are cards (ask, below).
   */
  function explore(x) {
    if (!S.on || !S.turn || !x) return;
    stopWorking();
    head(
      "No ready-made steps for this, so I'll work it out in the browser",
      "I pick each step from what's on the screen and screenshot it. I'll ask you here when I can't choose, when I'm stuck, and before anything that sends, approves or deletes.",
      "ok",
    );
    const list = node(`<ol class="ss-steps ss-explore"></ol>`);
    S.turn.explore = { runId: String(x.runId || ""), list, rows: new Map() };
    addNarr(list);
    browserPart();
    working("Signing in and opening the app");
  }

  const ASK_ECHO = /^(Asked you|You answered):/;
  function exploreStep(st) {
    const x = S.turn?.explore;
    if (!S.on || !x || !st) return;
    const text = String(st.text || "");
    if (!st.n) {
      remember(text);
      // The question and its answer are on the card already.
      if (ASK_ECHO.test(text)) return;
      x.list.appendChild(node(
        `<li class="ss-b act ss-x-note${st.status === "retry" ? " retry" : ""}"><span class="ss-dot"></span>` +
        `<div class="ss-b-body"><div class="ss-b-d">${h(text)}</div></div></li>`,
      ));
      return;
    }
    const state = st.status === "run" ? "run" : st.status === "ok" ? "ok" : st.status === "failed" ? "bad" : "skip";
    spotsOutcome(st.n, state);
    let li = x.rows.get(st.n);
    if (!li) {
      li = node(`<li class="ss-b act" data-n="${Number(st.n)}"></li>`);
      x.list.appendChild(li);
      x.rows.set(st.n, li);
    }
    const shot = st.shot
      ? `<a class="ss-shot" href="/api/plan-shot?run=${encodeURIComponent(x.runId)}&f=${encodeURIComponent(st.shot)}" target="_blank" rel="noopener">${icon("app-window")}Screenshot</a>`
      : "";
    li.className = `ss-b act ${state}`;
    li.innerHTML =
      `<span class="ss-dot"></span><div class="ss-b-body">` +
      `<div class="ss-b-a"><b>${h(text)}</b>${st.replayed ? ` <span class="ss-arg">from the saved route</span>` : ""}</div>` +
      (st.why ? `<div class="ss-b-d">${h(st.why)}</div>` : "") +
      shot + `</div>`;
    if (state === "run") working(`Step ${st.n}: ${text}`);
    else remember(`${st.n}. ${text}${state === "bad" ? " (failed)" : ""}`);
  }

  /**
   * A question from the run, the way a chat assistant asks: the options it
   * offers, and a box for anything else. The composer answers it too while it
   * is open. The answer goes to the waiting run (POST /api/explore/answer).
   */
  /**
   * A question in a line or two (Aanya, 27 Oct: "why is it giving so many big paras, no one will read
   * so"). A run that tried and stopped says why in its own words — "(I tried on screen and stopped: The
   * RFQ shows no submitted response from AMD LTD, …)" — and that reason IS the question; otherwise the
   * first sentence. The full text stays under "More".
   */
  function shortQuestion(text) {
    const t = String(text ?? "").replace(/\s+/g, " ").trim();
    const tried = t.match(/\(I tried on screen and stopped: ([^)]+)\)/i);
    if (tried) return `${tried[1].trim().replace(/[.\s]+$/, "")}. How should I go on?`;
    if (t.length <= 180) return t;
    const first = t.match(/^(.{40,180}?[.?!])(\s|$)/);
    return first ? first[1] : `${t.slice(0, 170).replace(/\s+\S*$/, "")}…`;
  }

  /** Questions already shown here, by run and number — the slot poll below never shows one twice. */
  const shownAsks = new Set();
  function ask(q) {
    if (!S.on || !S.turn || !q) return;
    shownAsks.add(`${q.runId || S.turn.explore?.runId || ""}#${q.n}`);
    closeAsk("");
    stopWorking();
    // "I'll do it myself" needs the live view's Take control (liveControl.js); without it the option is left out.
    const opts = (Array.isArray(q.options) ? q.options : []).filter((o) => o.id !== "self" || !!window.spineLiveControl);
    const runId = String(q.runId || S.turn.explore?.runId || "");
    const shot = q.shot && runId
      ? `<a class="ss-shot" href="/api/plan-shot?run=${encodeURIComponent(runId)}&f=${encodeURIComponent(q.shot)}" target="_blank" rel="noopener">${icon("app-window")}See the screen now</a>`
      : "";
    const card = node(
      `<div class="ss-askcard" role="group" aria-label="A question from the run">` +
      `<div class="ss-askcard-h">${icon("bot")}<span>${q.kind === "confirm" ? "Before I go on" : q.kind === "stuck" ? "I'm stuck" : "Question"}</span></div>` +
      `<div class="ss-askcard-q">${h(shortQuestion(q.question))}</div>` +
      (q.detail || shortQuestion(q.question) !== String(q.question ?? "").trim()
        ? `<details class="ss-askcard-more"><summary>More</summary>${shortQuestion(q.question) !== String(q.question ?? "").trim() ? `<div class="ss-askcard-d">${h(q.question)}</div>` : ""}${q.detail ? `<div class="ss-askcard-d">${h(q.detail)}</div>` : ""}</details>`
        : "") +
      shot +
      `<div class="ss-askcard-opts">${opts
        .map((o, i) => `<button type="button" class="ss-opt${o.id === "stop" ? " stop" : ""}" data-opt="${h(o.id)}"><span class="ss-opt-k">${i + 1}</span><span class="ss-opt-l">${h(o.label)}</span></button>`)
        .join("")}</div>` +
      `<form class="ss-askcard-other"><textarea rows="1" maxlength="2000" placeholder="Something else? Type it here"></textarea>` +
      `<button type="submit" class="ss-opt-send" disabled>Send</button></form>` +
      `<div class="ss-askcard-said" hidden></div></div>`,
    );
    addNarr(card);
    S.asking = { runId, n: Number(q.n), card, options: opts };
    card.querySelectorAll(".ss-opt").forEach((b) =>
      b.addEventListener("click", async () => {
        const o = opts.find((x) => x.id === b.dataset.opt);
        if (b.dataset.opt === "self") {
          // The browser comes forward and is theirs before the run is told.
          setTab("browser", true);
          setRight(true);
          try {
            await window.spineLiveControl?.take?.();
          } catch {
            /* the run says so if the hold never landed */
          }
        }
        answerAsk({ option: b.dataset.opt, text: o?.label || "" }, b);
      }),
    );
    const form = q$(".ss-askcard-other", card);
    const box = q$("textarea", form);
    const go = q$(".ss-opt-send", form);
    box.addEventListener("input", () => { autosize(box); go.disabled = !box.value.trim(); });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = box.value.trim();
      if (text) answerAsk({ option: null, text });
    });
    S.chat.push({ role: "assistant", text: q.question });
    remember(`QUESTION: ${q.question}`);
    if (!showing() && S.turn && !S.turn.replay) S.yourTurn = true;
    paintTop();
    pin(true);
  }

  async function answerAsk(a, button = null) {
    const open = S.asking;
    if (!open || open.sending) return;
    open.sending = true;
    const card = open.card;
    card.querySelectorAll("button, textarea").forEach((x) => (x.disabled = true));
    let ok = false;
    try {
      const r = await fetch("/api/explore/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: open.runId, n: open.n, option: a.option, text: a.text }),
      });
      ok = r.ok && (await r.json().catch(() => ({}))).ok === true;
    } catch {
      ok = false;
    }
    if (!ok) {
      open.sending = false;
      closeAsk("The run is no longer waiting for this answer.");
      return;
    }
    if (button) button.classList.add("picked");
    const said = q$(".ss-askcard-said", card);
    said.textContent = a.text;
    said.hidden = false;
    card.classList.add("answered");
    q$(".ss-askcard-other", card).hidden = true;
    S.chat.push({ role: "user", text: a.text });
    remember(`ANSWER: ${a.text}`);
    S.asking = null;
    S.yourTurn = false;
    paintTop();
    working(
      a.option === "stop"
        ? "Stopping and writing up where it got to"
        : a.option === "self"
          ? "Your turn in the browser — press Hand back when you're done"
          : "Carrying on",
    );
  }

  /** A question nobody can answer any more (the run ended, or a new one came). */
  function closeAsk(why) {
    const open = S.asking;
    if (!open) return;
    S.asking = null;
    open.card.querySelectorAll("button, textarea").forEach((x) => (x.disabled = true));
    open.card.classList.add("closed");
    if (why) {
      const said = q$(".ss-askcard-said", open.card);
      said.textContent = why;
      said.hidden = false;
    }
    paintTop();
  }

  // ── the right-hand side ──────────────────────────────────────────────────
  /**
   * An API run never opens a browser, so it is not offered one: no Browser
   * tab, and Requests is what the panel shows — live, and when a saved API
   * run is opened again. UI and Both runs keep both tabs.
   */
  const browserless = () => S.turn?.mode === "api";
  /**
   * The tabs a run has (Aanya, 28 Oct): a Browser run — Browser and Console, no Requests; an API run — Requests,
   * no Browser or Console; Both — all of them. Test cases always. Before any run, Browser and Requests as before.
   */
  function tabsFor() {
    const t = S.turn;
    if (!t) return { browser: true, requests: true, console: false, cases: true };
    const api = t.mode === "api" || (t.kind === "features" && t.mode !== "ui");
    const ui = t.mode === "ui" || (t.kind === "features" && t.mode === "ui");
    return { browser: !api, requests: !ui, console: !api, cases: true };
  }
  function setTab(tab, picked = false) {
    const has = tabsFor();
    const want = ["cases", "requests", "console", "browser"].includes(tab) ? tab : "browser";
    S.tab = has[want] ? want : has.browser ? "browser" : "requests";
    if (picked) S.tabPicked = true;
    for (const b of document.querySelectorAll(".ss-tab")) {
      b.hidden = !has[b.dataset.tab];
      b.setAttribute("aria-selected", String(b.dataset.tab === S.tab));
      b.tabIndex = b.dataset.tab === S.tab ? 0 : -1;
    }
    for (const p of document.querySelectorAll(".ss-pane")) p.hidden = p.dataset.pane !== S.tab;
  }
  /**
   * The browser part of a run is starting (Both: after the API part, whose
   * requests had brought the Requests tab forward). Show the Browser tab, as
   * the first frame would, unless the reader picked a tab themselves.
   */
  function browserPart() {
    if (!S.on || browserless()) return;
    if (!S.tabPicked) setTab("browser");
    setRight(true);
  }
  /**
   * The vendor portal BESIDE the buyer's page (Aanya, 27 Oct: "buyer's tab stay open and in the side vendor's
   * portal can be opened"): the run streams it as side frames with a caption ("Vendor portal · <email>").
   * When the vendor is done its last frame stays, dimmed, while the buyer's page goes on to show the response.
   */
  function sideFrame(d) {
    if (!S.on || browserless()) return;
    const box = q$("#live-side");
    const panel = q$("#live-frame-panel");
    if (!box || !panel) return;
    if (d.frame) q$("#live-frame-side").src = `data:image/jpeg;base64,${d.frame}`;
    if (d.label) q$("#live-side-cap").textContent = d.state === "done" ? `${d.label} · done` : d.label;
    if (d.state) box.dataset.state = d.state;
    if (!d.frame && !q$("#live-frame-side").getAttribute("src")) return;
    box.hidden = false;
    panel.classList.add("split");
    panel.hidden = false;
    frame();
  }
  function sideReset() {
    const box = q$("#live-side");
    if (box) {
      box.hidden = true;
      delete box.dataset.state;
    }
    q$("#live-frame-side")?.removeAttribute("src");
    const cap = q$("#live-side-cap");
    if (cap) cap.textContent = "Vendor portal";
    q$("#live-frame-panel")?.classList.remove("split");
  }
  function frame() {
    if (!S.on || browserless()) return;
    S.frames++;
    if (S.frames === 1) {
      if (!S.tabPicked) setTab("browser");
      setRight(true);
    }
    paintLive();
  }
  /** Show or hide the right-hand panel; the top bar's button brings it back. */
  function setRight(on) {
    q$("#ss-session")?.classList.toggle("right-off", !on);
    const btn = q$("#ss-show-right");
    if (!btn) return;
    btn.hidden = on;
    const word = S.tab === "requests" ? "Requests" : S.tab === "cases" ? "Test cases" : S.tab === "console" ? "Console" : "Browser";
    if (btn.lastChild?.nodeType === Node.TEXT_NODE) btn.lastChild.textContent = word;
    btn.title = `Show the ${word.toLowerCase()} panel`;
  }
  function paintLive() {
    const live = q$("#ss-live");
    if (!live) return;
    if (!S.open) lastShot();
    const shown = S.frames || S.shot;
    live.hidden = !shown;
    live.dataset.state = S.open ? "live" : "ended";
    live.lastChild.textContent = S.open ? "LIVE" : S.frames ? "LAST FRAME" : "LAST SCREEN";
    const empty = q$("#ss-browser-empty");
    if (empty) {
      empty.hidden = !!shown;
      empty.textContent = S.open
        ? S.turn?.mode === "api" ? "This run talks to the API directly — open Requests to watch it." : "The browser appears here as soon as the run opens it."
        : S.turn?.replay && S.turn?.mode !== "api"
          ? "A saved run doesn't keep the browser. Run it again to watch it live."
          : "No browser was used in this run.";
    }
    paintRerun();
  }

  /**
   * A finished browser run with no live frame here (a saved run opened again,
   * or one that ended before its first frame reached this tab): the last
   * screenshot the run took, in place of "a saved run doesn't keep the
   * browser". Asked for once per turn; a run that kept none keeps the words.
   */
  function lastShot() {
    const t = S.turn;
    if (!t || S.frames || t.shotAsked || t.mode === "api") return;
    const id = t.replay ? S.id : t.runId;
    if (!id) return;
    t.shotAsked = true;
    const img = q$("#live-frame");
    const panel = q$("#live-frame-panel");
    if (!img || !panel) return;
    const loaded = () => {
      img.removeEventListener("load", loaded);
      if (S.turn !== t || S.frames) return;
      S.shot = true;
      panel.hidden = false;
      paintLive();
    };
    img.addEventListener("load", loaded);
    img.addEventListener("error", () => img.removeEventListener("load", loaded), { once: true });
    img.src = `/api/run-last-shot?run=${encodeURIComponent(id)}`;
  }

  /**
   * "Run again", on the Browser tab once a UI run has finished: the same run,
   * started the way typing "retry" starts it (rerun below) — the same typed
   * case, or the same browser journeys, for the same client.
   */
  function canRerun() {
    const t = S.turn;
    if (!S.on || S.open || !t || t.mode === "api") return false;
    if (t.flowKeys?.length) return !missingJourneys(t).length;
    return t.kind === "typed" || t.kind === "journeys";
  }
  /**
   * Journeys this turn ran that the client does not have (a saved run may be
   * another client's). Unknown while the client's journeys are still loading,
   * so nothing is missing then; the click checks again.
   */
  function missingJourneys(t) {
    const flows = read(() => uiFlows, []) || [];
    if (!flows.length) return [];
    return (t.flowKeys ?? []).filter((k) => !flows.some((f) => f.key === k));
  }
  function paintRerun() {
    const screen = q$(".ss-screen");
    if (!screen) return;
    let btn = q$("#ss-rerun");
    if (!btn) {
      btn = node(`<button type="button" class="ss-rerun" id="ss-rerun" hidden>${icon("rotate-cw")}<span>Run again</span></button>`);
      btn.addEventListener("click", () => {
        const missing = S.turn ? missingJourneys(S.turn) : [];
        if (missing.length) {
          bubble("Run it again");
          aiSay(`${missing.join(", ")} ${missing.length === 1 ? "isn't a journey" : "aren't journeys"} ${read(() => currentClientName, "") || "this client"} has, so this run can't be started again here.`);
          return paintRerun();
        }
        if (!canRerun()) return;
        S.pendingAsk = { display: "Run it again", note: "Running the same thing again." };
        pin(true);
        rerun(S.turn.mode);
      });
      screen.appendChild(btn);
    }
    const on = canRerun();
    btn.hidden = !on;
    if (on) btn.title = S.turn.flowKeys?.length ? `Run ${S.turn.flowKeys.join(", ")} again in the browser` : "Run this again in the browser";
  }
  // ── the Console tab: what the browser complained about, step by step ─────
  /** The message with its numbers and ids blurred — the same as src/report/consoleBugs.ts consoleFingerprint. */
  function conPrint(kind, text) {
    const t = String(text || "")
      .toLowerCase()
      .replace(/https?:\/\/[^\s"')]+/g, (u) => u.replace(/\?.*$/, "").replace(/\/[A-Za-z0-9_-]{6,}(?=\/|$)/g, "/:id"))
      .replace(/\b\d+(\.\d+)?\b/g, "#")
      .replace(/"[^"]{0,80}"|'[^']{0,80}'/g, '"…"')
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
    return `console:${kind}:${t}`;
  }
  /** What the bugs list already holds from the Console tab (read once, kept fresh by our own reports). */
  let conReported = null;
  function loadReported() {
    if (conReported) return;
    conReported = new Set();
    fetch("/api/console-bugs", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        for (const x of d.reported || []) conReported.add(x.fingerprint);
        paintConsole();
      })
      .catch(() => {});
  }
  /** One step's console lines and failed calls ("[console] {…}" while running; the step records at the end). */
  function consoleLines(x) {
    if (!S.on || !x) return;
    if (!S.con) S.con = new Map();
    loadReported();
    const add = (kind, text) => {
      if (!text) return;
      const fp = conPrint(kind, text);
      const e = S.con.get(fp) ?? { fp, kind, text: String(text), steps: new Map() };
      e.steps.set(Number(x.step) || 0, { step: Number(x.step) || 0, stepName: String(x.stepName || ""), url: String(x.url || "") });
      S.con.set(fp, e);
    };
    for (const c of x.console || []) add(c.type === "warning" ? "warning" : "error", c.text);
    for (const r of x.failedRequests || []) add("network", `${String(r.method || "").toUpperCase()} ${r.path} → ${r.status}`);
    paintConsole();
  }
  const CON_WORD = { error: "Error", network: "Failed call", warning: "Warning" };
  const CON_ORDER = { error: 0, network: 1, warning: 2 };
  function paintConsole() {
    const list = q$("#ss-con-list");
    if (!list) return;
    const all = [...(S.con?.values() ?? [])].sort((a, b) => CON_ORDER[a.kind] - CON_ORDER[b.kind] || Math.min(...a.steps.keys()) - Math.min(...b.steps.keys()));
    const n = (k) => all.filter((e) => e.kind === k).length;
    // A possible bug: an error or a failed call. Warnings are listed and can be reported, not counted.
    const bugs = all.filter((e) => e.kind !== "warning");
    const open = bugs.filter((e) => !conReported?.has(e.fp));
    const badge = q$("#ss-con-n");
    if (badge) badge.textContent = bugs.length ? String(bugs.length) : "";
    const empty = q$("#ss-con-empty");
    if (empty) empty.hidden = all.length > 0;
    const head = q$("#ss-con-head");
    if (head) {
      head.hidden = !all.length;
      const parts = [n("error") && `${n("error")} error${n("error") === 1 ? "" : "s"}`, n("network") && `${n("network")} failed call${n("network") === 1 ? "" : "s"}`, n("warning") && `${n("warning")} warning${n("warning") === 1 ? "" : "s"}`].filter(Boolean);
      head.innerHTML =
        `<div class="ss-con-sum"><b>${bugs.length} possible bug${bugs.length === 1 ? "" : "s"}</b><span>${h(parts.join(" · "))}</span></div>` +
        `<div class="ss-con-acts">${open.length ? `<button type="button" class="ss-con-all">Report all ${open.length}</button>` : ""}<a class="ss-con-open" href="#/bugs">Open Bugs</a></div>`;
      q$(".ss-con-all", head)?.addEventListener("click", () => open.forEach((e) => reportConsole(e)));
    }
    list.innerHTML = all
      .map((e) => {
        const steps = [...e.steps.values()].sort((a, b) => a.step - b.step);
        const where = steps.slice(0, 4).map((s) => `step ${s.step}${s.stepName ? ` ${h(s.stepName.replace(/_/g, " "))}` : ""}`).join(", ") + (steps.length > 4 ? ` +${steps.length - 4}` : "");
        const done = conReported?.has(e.fp);
        return (
          `<li class="ss-con-row" data-kind="${e.kind}" data-fp="${h(e.fp)}">` +
          `<div class="ss-con-top"><span class="ss-con-k">${CON_WORD[e.kind]}</span><span class="ss-con-w">${where}${steps[0]?.url ? ` · <code>${h(steps[0].url)}</code>` : ""}</span>` +
          (done ? `<a class="ss-con-done" href="#/bugs">Reported ✓</a>` : `<button type="button" class="ss-con-rep">Report as bug</button>`) +
          `</div><pre class="ss-con-t">${h(e.text)}</pre></li>`
        );
      })
      .join("");
    for (const b of list.querySelectorAll(".ss-con-rep")) {
      b.addEventListener("click", () => {
        const e = S.con?.get(b.closest(".ss-con-row").dataset.fp);
        if (e) reportConsole(e, b);
      });
    }
  }
  /** Put one console line on the Bugs page (/api/console-bugs → src/report/consoleBugs.ts). */
  function reportConsole(e, btn) {
    const first = [...e.steps.values()].sort((a, b) => a.step - b.step)[0] ?? {};
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Reporting…";
    }
    fetch("/api/console-bugs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: e.kind, text: e.text, runId: S.turn?.runId || S.id || "", step: first.step, stepName: first.stepName, url: first.url, caseText: S.turn?.text || "" }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.fingerprint) conReported?.add(d.fingerprint);
        conReported?.add(e.fp);
        paintConsole();
      })
      .catch(() => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Report as bug — try again";
        }
      });
  }

  function paintReqCount() {
    const n = q$("#ss-req-n");
    if (n) n.textContent = S.reqs ? String(S.reqs) : "";
    const empty = q$("#ss-req-empty");
    if (empty) empty.hidden = S.reqs > 0;
  }
  const pretty = (v, n = 4000) => {
    if (v === undefined || v === null || v === "") return "";
    const s = typeof v === "string" ? v : JSON.stringify(v, null, 2);
    return s.length > n ? s.slice(0, n) + "\n…" : s;
  };

  /**
   * One API request, as it was sent: method, path, status, time — and, opened,
   * the body sent and what the app said. Keyed, so a re-run check updates its
   * line instead of adding a second one.
   */
  function request(r) {
    if (!S.on || !r || !r.method) return;
    const list = q$("#ss-req-list");
    if (!list) return;
    const key = String(r.key ?? `${r.method} ${r.path} ${S.reqs}`);
    let li = [...list.children].find((x) => x.dataset.key === key);
    const fresh = !li;
    const state = r.pass === true ? "ok" : r.pass === false || (r.status || 0) >= 500 ? "bad" : "";
    const ms = r.ms == null ? "" : r.ms < 1000 ? `${Math.round(r.ms)}ms` : `${(r.ms / 1000).toFixed(1)}s`;
    const body = pretty(r.body);
    const reply = pretty(r.reply);
    const html =
      `<button type="button" class="ss-req-row" aria-expanded="false">` +
      `<span class="ss-req-m">${h(String(r.method).toUpperCase())}</span>` +
      `<span class="ss-req-p" title="${h(r.path)}">${h(r.path || "")}</span>` +
      `<span class="ss-req-s">${h(r.status ?? "—")}</span><span class="ss-req-ms">${h(ms)}</span></button>` +
      (r.title ? `<div class="ss-req-t">${h(r.title)}</div>` : "") +
      `<div class="ss-req-x" hidden>` +
      (r.message ? `<div class="ss-req-k">The app said</div><div class="ss-req-v">${h(r.message)}</div>` : "") +
      (body ? `<div class="ss-req-k">Body sent</div><pre>${h(body)}</pre>` : "") +
      (reply ? `<div class="ss-req-k">Reply</div><pre>${h(reply)}</pre>` : "") +
      (!r.message && !body && !reply ? `<div class="ss-req-v">Nothing more was recorded for this request.</div>` : "") +
      `</div>`;
    const near = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    if (fresh) {
      li = document.createElement("li");
      li.dataset.key = key;
      list.appendChild(li);
      S.reqs++;
      while (list.children.length > 400) list.firstElementChild.remove();
    }
    li.className = `ss-req ${state}`;
    const wasOpen = li.classList.contains("open");
    li.innerHTML = html;
    if (wasOpen) {
      li.classList.add("open");
      q$(".ss-req-x", li).hidden = false;
      q$(".ss-req-row", li).setAttribute("aria-expanded", "true");
    }
    paintReqCount();
    if (fresh && near) list.scrollTop = list.scrollHeight;
    if (fresh && S.reqs === 1 && !S.tabPicked && !S.frames) setTab("requests");
  }

  // ── how a run ended ──────────────────────────────────────────────────────
  const TAG = { ok: "Done", bad: "Failed", skip: "Not tested", stop: "Stopped" };
  const TAG_ICON = { ok: "circle-check", bad: "circle-x", skip: "circle-minus", stop: "circle-minus" };

  /**
   * The box a run ends on. `key` names the part of the turn it closes ("API",
   * "UI", a journey) so a part that reports twice replaces its own box.
   */
  function end({ tone = "ok", key = "", title = "", lines = [], links = [], tag = "", html = "" } = {}) {
    if (!S.on || !el.end) return;
    stopWorking();
    const k = key || "run";
    const was = S.turn?.ended?.[k];
    // A part that already said "not tested" with its reason keeps it: the
    // stream's own `done` after a refusal only knows that nothing started.
    if (was && was.tone === "skip" && tone === "skip") return;
    const box = node(
      `<div class="ss-call ${h(tone)}" data-key="${h(k)}">` +
      `<div class="ss-call-h">${icon(TAG_ICON[tone] || "info")}<span class="ss-call-tag">${h(tag || TAG[tone] || tone)}</span>` +
      (key ? `<span class="ss-call-k">${h(key)}</span>` : "") + `</div>` +
      (title ? `<div class="ss-call-t">${h(title)}</div>` : "") +
      lines.filter(Boolean).map((l) => `<p>${h(l)}</p>`).join("") +
      (html || "") +
      (links.length
        ? `<div class="ss-call-links">${links
            .map((a) =>
              a.exportRun
                ? `<button type="button" data-bugs-export="${h(a.exportRun)}" aria-haspopup="dialog">${icon(a.icon || "download")}${h(a.label)}</button>`
                : // The Bugs page (#/bugs) opens here; a report opens in its own tab.
                  `<a href="${h(a.href)}"${String(a.href).startsWith("#") ? "" : ' target="_blank" rel="noopener"'}>${icon(a.icon || "file-text")}${h(a.label)}</a>`)
            .join("")}</div>`
        : "") +
      `</div>`,
    );
    // A typed case ends part by part (API, then UI), so each box goes where its
    // part finished; every other run ends once, under its steps and rows.
    const old = el.turn?.querySelector(`.ss-call[data-key="${CSS.escape(k)}"]`);
    if (old) old.replaceWith(box);
    else if (S.turn?.kind === "typed") addNarr(box);
    else el.end.appendChild(box);
    if (S.turn) S.turn.ended[k] = { tone, title, lines };
    S.chat.push({ role: "assistant", text: `${TAG[tone] || tone}${key ? ` (${key})` : ""}: ${[title, ...lines].filter(Boolean).join(" ")}` });
  }

  /** The run is over (or was stopped): the reader's turn. */
  function idle() {
    if (!S.on) return;
    // Ended out of sight: it waits on Home and in the sidebar until it is opened.
    if (S.open && S.turn && !S.turn.replay && !showing()) S.yourTurn = true;
    closeAsk("No longer waiting — the run ended.");
    const told = S.open && S.onEnd;
    S.open = false;
    spotsSettle();
    if (told) {
      const cb = S.onEnd;
      S.onEnd = null;
      // Read once the run has written its closing box: an API features run
      // goes idle (runFinished) a moment before showRunComplete writes DONE,
      // and the table said "The run ended without a result" under a run that
      // ended DONE (15 Oct).
      setTimeout(() => { try { cb(outcome()); } catch { /* the table's problem, not the run's */ } }, 0);
    }
    stopWorking();
    paintCases();
    paintTop();
    paintLive();
  }

  function stopped() {
    if (!S.on || !S.open) return;
    end({ tone: "stop", title: "You stopped the run.", lines: ["Whatever had already finished is above; nothing after this point ran."] });
  }

  // ── the typed API case (/api/run-case-api) ───────────────────────────────
  function apiCheck(row) {
    if (!S.on || !row) return;
    const verdict = row.pass ? "ok" : row.inconclusive ? "skip" : "bad";
    const req = row.request;
    // Nothing was sent: one line that says so — the closing box carries the reason.
    if (!req?.method && !row.inputSummary && row.inconclusive) {
      head(row.id === "API-NOMATCH" ? "No API case matched — nothing was sent to the API" : row.scenario || "Not run", "", "skip");
      return;
    }
    // "accept" / "reject" alone is the runner's shorthand, not an expected result.
    const expected = row.expectedResult || (/\s/.test(String(row.expected ?? "")) ? row.expected : "");
    head(row.scenario || row.id || "The matched case", expected, verdict);
    const status = row.httpStatus ? ` → ${row.httpStatus}` : "";
    if (req?.method) act(String(req.method).toUpperCase(), `${req.path || ""}${status}`, verdict);
    else if (row.inputSummary) act("Sent", `${row.inputSummary}${status}`, verdict);
    if (row.message || row.verdict) {
      const d = node(`<div class="ss-b-d ss-indent">${h(row.message || row.verdict)}</div>`);
      addNarr(d);
    }
    if (req?.method) {
      request({ key: `api:${row.id}`, method: req.method, path: req.path, status: row.httpStatus, ms: row.durationMs, title: row.scenario, pass: row.inconclusive ? null : !!row.pass, body: req.body, message: row.message });
    }
  }

  function apiEnd(rows, error) {
    if (!S.on) return;
    // The stream itself failed (sign-in, environment): nothing was judged, so
    // it is "not tested", the way the oracle treats it — never a product failure.
    if (error) return end({ tone: "skip", key: "API", title: "The API part could not run, so nothing was tested.", lines: [error] });
    if (!rows.length) return end({ tone: "skip", key: "API", title: "No API case ran for this.", lines: ["Nothing in the case library matched, and no API test could be written from it."] });
    const bad = rows.filter((r) => !r.pass && !r.inconclusive);
    const unknown = rows.filter((r) => r.inconclusive);
    if (bad.length) {
      return end({ tone: "bad", key: "API", title: `${bad.length} of ${rows.length} API check${rows.length === 1 ? "" : "s"} failed.`, lines: bad.slice(0, 3).map((r) => `${r.scenario || r.id}: ${r.message || r.verdict || ""}`) });
    }
    if (unknown.length === rows.length) {
      return end({ tone: "skip", key: "API", title: "The API part could not be judged.", lines: unknown.slice(0, 2).map((r) => r.message || r.verdict || "") });
    }
    // Some worked, some could not be checked: never "all worked" — what was
    // not checked is the part the reader still has to find out about.
    if (unknown.length) {
      const worked = rows.length - unknown.length;
      return end({
        tone: "skip",
        key: "API",
        title: `Only part of it was tested: ${worked} of ${rows.length} API check${rows.length === 1 ? "" : "s"} worked, ${unknown.length} could not be checked.`,
        lines: unknown.slice(0, 3).map((r) => `${r.scenario || r.id}: ${r.message || r.verdict || ""}`),
      });
    }
    // What the API test could not cover (the planner's gaps, said as an INFO
    // note before the checks): every check passing is then only part of the
    // case — "publish an RFQ and check every vendor gets the email" closed green
    // with the email part never tested (15 Oct).
    const gaps = (S.turn?.log ?? []).map((l) => String(l).match(/Not covered by this API test:\s*(.+?)\.?$/i)?.[1]).find(Boolean);
    if (gaps) {
      return end({
        tone: "skip",
        tag: "Partly tested",
        key: "API",
        title: `Partly tested — not covered: ${gaps}.`,
        lines: [rows.length === 1 ? "The part it could test worked as expected." : `The parts it could test worked: all ${rows.length} API checks passed.`, ...rows.slice(0, 2).map((r) => r.message || r.verdict || "")],
      });
    }
    end({ tone: "ok", key: "API", title: rows.length === 1 ? "It worked as expected." : `All ${rows.length} API checks worked as expected.`, lines: rows.slice(0, 2).map((r) => r.message || r.verdict || "") });
  }

  // ── the typed UI case: the answer renderUiInstructResult already words ───
  // `html`: the evidence block app.js builds for a screen run (the failing step's screenshot,
  // the app's own words, the rule in its code, any step the run recovered) — every value in
  // it is escaped there.
  function uiResult({ cls, title, lines = [], runId = "", html = "" }) {
    if (!S.on) return;
    // "part": steps the tester did by hand in the browser — grey, "Partly tested", never a green pass.
    const tone = cls === "ok" ? "ok" : cls === "skip" || cls === "part" ? "skip" : "bad";
    // A run the explorer worked out has its run id: its bugs can be opened from here.
    end({ tone, key: "UI", title: lines[0] || title || "", lines: lines.slice(1), links: runId && tone === "bad" ? bugLinks(runId) : [], tag: cls === "part" ? "Partly tested" : "", html });
  }

  /**
   * A run's bugs: on the Bugs page in this tab (where they are edited), and
   * as an Excel sheet or PDF dev report (bugs.js opens the export menu).
   */
  const bugLinks = (runId) => [
    { label: "Bugs from this run", href: `#/bugs?run=${encodeURIComponent(runId)}`, icon: "bug" },
    { label: "Export bugs from this run", exportRun: runId, icon: "download" },
  ];

  // ── a browser journey (/api/ui-run) ──────────────────────────────────────
  function journeyEnd({ label, code, runId, error, took, byHand = 0, notTested = "" }) {
    if (!S.on) return;
    const ok = code === 0 && !error;
    // The suite ran but did not test its case (no login for the user it names, writes not allowed…).
    if (ok && notTested) {
      end({ tone: "skip", key: label || "Journey", title: `Not tested — ${notTested}`, lines: [took ? `Took ${took}.` : ""], links: runId ? [{ label: "UI run report", href: `/api/ui-report?run=${encodeURIComponent(runId)}`, icon: "chart-column" }] : [] });
      return;
    }
    // Steps the tester did in the browser (take control): the run did not test them.
    if (ok && byHand > 0) {
      end({
        tone: "skip",
        tag: "Partly tested",
        key: label || "Journey",
        title: `Partly tested: ${byHand === 1 ? "one step was" : `${byHand} steps were`} done by you in the browser, so the run did not test ${byHand === 1 ? "it" : "them"}.`,
        lines: [took ? `Took ${took}.` : ""],
        links: runId ? [{ label: "UI run report", href: `/api/ui-report?run=${encodeURIComponent(runId)}`, icon: "chart-column" }, ...bugLinks(runId)] : [],
      });
      return;
    }
    const links = runId
      ? [
          { label: "UI run report", href: `/api/ui-report?run=${encodeURIComponent(runId)}`, icon: "chart-column" },
          ...bugLinks(runId),
        ]
      : [];
    end({
      tone: ok ? "ok" : "bad",
      key: label || "Journey",
      title: ok ? "The journey worked from start to finish." : error ? `The run broke: ${error}` : "The journey broke — the report shows exactly where it stopped.",
      lines: [took ? `Took ${took}.` : ""],
      links,
    });
  }

  /** The end of an API features / RFP / PO run: the same facts the old modal showed. */
  function runEnd({ total = 0, passed = 0, failed = 0, skipped = 0, error = null, journey = null, subtitle = null, kind = "checks" }) {
    if (!S.on) return;
    // journeyEnd() already closed each browser journey with its own box.
    if (kind === "journey" || S.turn?.kind === "journeys") return;
    const links = [];
    const t = q$("#open-api-report");
    const b = q$("#open-bug-sheet");
    if (t?.getAttribute("href")) links.push({ label: "Full report", href: t.getAttribute("href"), icon: "chart-column" });
    const bugsHref = b?.getAttribute("href");
    const bugsRun = bugsHref?.match(/[?&]run=([^&#]+)/)?.[1];
    if (bugsRun) links.push(...bugLinks(decodeURIComponent(bugsRun)));
    else if (bugsHref) links.push({ label: "Bugs", href: bugsHref, icon: "bug" });
    // Which checks failed, by name: "6 of 62 failed" alone, under a journey whose
    // every step worked, read as "all worked, still failed" (15 Oct).
    const failures = (read(() => checkRows, []) || [])
      .filter((c) => !c.pass && !c.inconclusive)
      .map((c) => ({ name: c.scenario || c.id, why: c.message || c.verdict || "" }));
    end(summary({ total, passed, failed, skipped, error, journey, note: subtitle, links, failures, rows: read(() => checkRows, []) || [] }));
  }

  /**
   * How an API run ended, in words anyone can read: did it work, how far the
   * journey got, how the checks came out — and where the detail lives. The
   * counts are the run's own; nothing is recomputed.
   */
  function summary({ total = 0, passed = 0, failed = 0, skipped = 0, error = null, journey = null, note = null, links = [], when = "", failures = [], rows = [] }) {
    const story = !error && planStory(rows, journey);
    if (story) return { ...story, lines: [...story.lines, ...(when ? [when] : []), ...(links.length ? ["What was sent and what came back for each step is in the full report."] : [])], links };
    const stopped = !!journey?.stoppedAt;
    const unknown = Math.max(0, total - passed - failed);
    const ran = total || journey?.steps;
    const ok = !error && failed === 0 && !stopped;
    const lines = [];
    if (journey?.steps) {
      lines.push(
        journey.worked === journey.steps
          ? `The journey: all ${journey.steps} steps worked.`
          : `The journey: ${journey.worked} of ${journey.steps} steps worked${stopped ? `; it stopped at step ${journey.stoppedAt}` : ""}.`,
      );
    }
    if (total) {
      lines.push(
        `The checks: ${passed} of ${total} passed` +
          (failed ? `, ${failed} failed` : "") +
          (unknown ? `, ${unknown} couldn't be checked` : "") +
          ".",
      );
    }
    // The failed checks themselves, a line each (the first five; the rest are in the full report).
    const named = failures.filter((f) => f && f.name).slice(0, 5);
    if (failed && named.length) {
      lines.push("The checks that failed:");
      for (const f of named) {
        // The library's names ("QA_Platform_publish_with_null_audience_raises_500")
        // in words ("Publish with null audience raises"), as the check list shows them.
        const raw = String(f.name).replace(/\s+/g, " ").trim();
        const name = read(() => plainCaseTitle(raw), raw) || raw;
        let why = String(f.why || "").replace(/\s+/g, " ").trim();
        if (/^internal server error$/i.test(why)) why = "the server crashed (500 Internal Server Error)";
        lines.push(`✗ ${name.slice(0, 120)}${why ? ` — ${why.slice(0, 140)}` : ""}`);
      }
      if (failed > named.length) lines.push(`…and ${failed - named.length} more in the full report.`);
    }
    if (skipped) lines.push(`${skipped} check${skipped === 1 ? " was" : "s were"} not run — the full report says why.`);
    if (note && !error) lines.push(note);
    if (when) lines.push(when);
    if (ran && links.length) lines.push("Every check, with what was sent and what came back, is in the full report.");
    // The journey worked and only checks around it failed: say both, in that order.
    const journeyOk = !!journey?.steps && journey.worked === journey.steps && !stopped;
    return {
      tone: error ? "bad" : ok ? (ran ? "ok" : "skip") : "bad",
      tag: !error && failed && journeyOk ? "Checks failed" : "",
      title: error
        ? `The run stopped: ${error}`
        : ok
          ? ran ? "Everything worked." : "Nothing was tested."
          : failed
            ? journeyOk
              ? `The journey worked end to end, but ${failed} of the ${total} checks around it failed.`
              : `${failed} of ${total} check${total === 1 ? "" : "s"} failed.`
            : `The journey stopped at step ${journey.stoppedAt}.`,
      lines,
      links,
    };
  }

  /**
   * A typed API case (an "api plan": rows <case>, <case>·act1…, <case>·verify1…), told as what it is —
   * one case, its steps in order — not as "the journey worked, but 3 of 4 checks around it failed"
   * (Aanya, 28 Oct, "????" on "Withdrawing an RFQ with blank remarks is refused": the set-up was
   * called the journey and the case's own steps "checks around it"). A read-back that fails only
   * because an earlier step did what it should not is said to follow from that step.
   */
  function planStory(rows, journey) {
    const main = (rows || []).find((r) => r && r.apiPlan && !String(r.id).includes("·"));
    if (!main) return null;
    const subs = rows.filter((r) => r && String(r.id).startsWith(`${main.id}·`));
    if (!subs.length) return null;
    const words = (t) => String(t || "").replace(/\s+/g, " ").trim().replace(/\.$/, "");
    const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1);
    const wantRefusal = main.expected === "reject";
    const decisive = subs.find((r) => r.id.includes("·act") && wantRefusal && r.accepted && !r.pass) || null;
    const firstBad = subs.find((r) => !r.pass && !r.inconclusive);
    const came = (r) => {
      const v = words(r.verdict).replace(/^api plan (failed|passed)\s*—\s*/i, "");
      if (r.id.includes("·verify")) {
        const m = v.match(/^(.+?) is “(.+?)”: NO \("?(.+?)"?\)$/);
        return m ? `${m[1]} is “${m[3]}”, not “${m[2]}”` : v;
      }
      if (r.httpStatus >= 500) return `the server crashed (${r.httpStatus})`;
      return r.accepted ? `accepted (HTTP ${r.httpStatus})` : `refused (HTTP ${r.httpStatus}${r.message ? `: ${words(r.message).slice(0, 100)}` : ""})`;
    };
    const lines = [];
    if (journey?.steps) lines.push(journey.worked === journey.steps ? `Set-up: all ${journey.steps} steps worked.` : `Set-up: ${journey.worked} of ${journey.steps} steps worked.`);
    lines.push("Then the case:");
    subs.forEach((r, i) => {
      const n = i + 1;
      const knockOn = r.id.includes("·verify") && !r.pass && decisive && subs.indexOf(decisive) < i;
      const mark = r.inconclusive ? "–" : r.pass ? "✓" : "✗";
      lines.push(`${mark} ${n}. ${words(r.scenario)} — ${came(r)}${knockOn ? `; this follows from step ${subs.indexOf(decisive) + 1}` : ""}.`);
    });
    const title = main.pass
      ? `Passed: ${lower(words(main.scenario))}.`
      : decisive
        ? `Failed: Procol accepted step ${subs.indexOf(decisive) + 1} (${lower(words(decisive.scenario))}). The case says it must be refused.`
        : firstBad
          ? `Failed at step ${subs.indexOf(firstBad) + 1}: ${lower(words(firstBad.scenario))} — ${came(firstBad)}.`
          : `Failed: ${words(main.verdict).replace(/^api plan failed\s*—\s*/i, "")}.`;
    return { tone: main.pass ? "ok" : "bad", tag: main.pass ? "" : "Case failed", title, lines };
  }

  /**
   * A saved run (Runs, or a recent run on Home), opened into the session: its
   * requests on the right and the box it ended on, from the record alone.
   */
  function replayed(rec) {
    if (!S.on || !rec) return;
    for (const st of rec.journey?.steps ?? []) {
      if (!st?.call) continue;
      request({
        key: `journey:${st.n}`, method: st.call.method, path: st.call.path, status: st.status, ms: st.ms,
        title: `${st.n}. ${st.title}`, pass: st.verdict === "worked" ? true : st.verdict === "broken" ? false : null,
        body: st.call.body, reply: st.response, message: st.message,
      });
    }
    const rows = rec.checkResults ?? [];
    for (const c of rows) {
      if (!c.request?.method) continue;
      request({
        key: `check:${c.id}`, method: c.request.method, path: c.request.path, status: c.httpStatus, ms: c.durationMs,
        title: `${c.id} · ${c.scenario || ""}`, pass: c.inconclusive ? null : !!c.pass, body: c.request.body, message: c.message,
      });
    }
    const steps = (rec.journey?.steps ?? []).filter(Boolean);
    const id = encodeURIComponent(rec.id || "");
    const journey = rec.journey
      ? { outcome: rec.journey.outcome, stoppedAt: rec.journey.stoppedAt, worked: steps.filter((s) => s.verdict === "worked").length, steps: steps.length }
      : null;
    const at = rec.ts ? new Date(rec.ts) : null;
    end(summary({
      total: rows.length,
      passed: rows.filter((c) => c.pass).length,
      failed: rows.filter((c) => !c.pass && !c.inconclusive).length,
      failures: rows.filter((c) => !c.pass && !c.inconclusive).map((c) => ({ name: c.scenario || c.title || c.id, why: c.message || c.actual || "" })),
      journey,
      rows,
      when: at && !Number.isNaN(at.getTime())
        ? `Ran on ${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`
        : "",
      links: id
        ? [
            { label: "Full report", href: `/api/test-report?run=${id}`, icon: "chart-column" },
            ...bugLinks(rec.id),
          ]
        : [],
    }));
    idle();
    // A finished run is read from the top; "Jump to latest" takes the reader to its end.
    requestAnimationFrame(() => {
      pinned = false;
      if (el.scroll) el.scroll.scrollTop = 0;
      const jump = q$("#ss-jump");
      if (jump) jump.hidden = el.scroll ? el.scroll.scrollHeight <= el.scroll.clientHeight + 80 : true;
    });
  }

  // ── what the reply endpoint is told about the run ────────────────────────
  function context() {
    const t = S.turn;
    if (!t) return "";
    const out = [`Asked: ${t.runText || t.text}`, `Channel: ${MODE_WORD[t.mode] || t.mode}`];
    // An API journey's steps are listed below as the API journey, with their calls.
    if (t.plan.length && t.planVia !== "api") {
      out.push("Browser steps:");
      t.plan.forEach((s, i) => {
        out.push(`  ${i + 1}. [${s.state}] ${s.verb}${s.arg ? ` ${s.arg}` : ""}${s.detail ? ` — ${s.detail}` : ""}`);
        for (const n of s.notes ?? []) out.push(`     ${n.kind === "ok" ? "used" : n.kind === "no" ? "passed over" : "·"}: ${n.text}`);
      });
    }
    const steps = read(() => uiSteps, []) || [];
    if (steps.length) {
      out.push("Browser journey:");
      for (const s of steps.slice(-80)) out.push(`  [${s.kind}] ${s.text}`);
    }
    const journey = (read(() => journeyStepsLive, []) || []).filter(Boolean);
    if (journey.length) {
      out.push("API journey:");
      for (const s of journey) out.push(`  ${s.n}. ${s.title} — ${s.verdict}${s.call ? ` (${s.call.method} ${s.call.path} → ${s.status ?? "no reply"})` : ""}${s.actual ? `: ${s.actual}` : ""}`);
    }
    const rows = t.kind === "features" ? read(() => checkRows, []) || [] : [];
    if (rows.length) {
      const failed = rows.filter((r) => !r.pass && !r.inconclusive);
      out.push(`Checks: ${rows.length} ran, ${rows.filter((r) => r.pass).length} passed, ${failed.length} failed.`);
      for (const r of failed.slice(0, 25)) out.push(`  FAILED ${r.id}: ${r.scenario} — ${r.message || r.verdict || ""}${r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}`);
    }
    if (t.log.length) out.push("Narration:", ...t.log.slice(-40).map((l) => `  ${l}`));
    const ends = Object.entries(t.ended);
    if (ends.length) out.push("Outcome:", ...ends.map(([k, e]) => `  ${k}: ${TAG[e.tone] || e.tone} — ${[e.title, ...e.lines].filter(Boolean).join(" ")}`));
    return out.join("\n").slice(0, 12000);
  }

  // ── a case from the "Test cases from this run" table, run as the next turn ─
  /**
   * runCases.js runs a suggested case: it becomes the next turn of this
   * session — narrated here, shown in the browser panel, kept as its own
   * session — and the table is told how it ended (onEnd), so the case's
   * status becomes the run's answer. False when a run is already going.
   */
  function runCase({ display = "", text = "", mode = "ui", onEnd = null } = {}) {
    if (!S.on || S.open || !S.turn || !String(text).trim()) return false;
    S.pendingAsk = {
      display: display || text,
      compiled: display && display !== text ? text : "",
      note: "A suggested case from the test cases table above, run as written.",
    };
    S.onEnd = typeof onEnd === "function" ? onEnd : null;
    pin(true);
    startTyped(text, MODES.includes(mode) ? mode : "ui");
    return true;
  }
  /**
   * A first message that is a question ("what is master QCS in Procol?") is
   * answered, not run. It used to go straight to the test writer, which built
   * a test for it — and sent a write request — for a question. The chat's own
   * answer-or-run decision (/api/session/reply) is asked first; when it says
   * run, the message runs as the next turn, the way a follow-up does.
   */
  async function answerQuestion(text, mode) {
    begin({ text, mode, kind: "chat" });
    working("Thinking");
    let res = null;
    try {
      const r = await fetch("/api/session/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, mode, kind: "chat", client: targetText(), context: "", history: [] }),
      });
      if (r.ok) res = await r.json();
    } catch {
      res = null;
    }
    stopWorking();
    if (res?.action === "answer") {
      S.chat.push({ role: "assistant", text: res.reply });
      aiSay(res.reply);
      idle();
      return;
    }
    S.pendingAsk = { display: text, compiled: res?.testCase && res.testCase !== text ? res.testCase : "", note: res?.note || "" };
    startTyped(res?.testCase || text, MODES.includes(res?.mode) ? res.mode : mode);
  }

  /** The run this turn is (its saved session's id), once the server has named it. */
  function setRunId(id) {
    if (S.turn && id) S.turn.runId = String(id);
    // From now on a message typed here goes to this run: Send on, and the box says so.
    syncSend();
    paintTop();
    // On the turn itself too, so a turn kept above (a copy) still says which run it was (runCases.js).
    if (S.turn && id && el.turn) el.turn.dataset.runId = String(id);
  }
  /** How this turn ended, the worst part first: failed, stopped, not tested, done. */
  function outcome() {
    const rank = { bad: 4, stop: 3, skip: 2, ok: 1 };
    const parts = Object.values(S.turn?.ended ?? {}).sort((a, b) => (rank[b.tone] || 0) - (rank[a.tone] || 0));
    // The saved run, from the run itself or from a report link on its closing box.
    let runId = S.turn?.runId || null;
    if (!runId) {
      for (const a of el.turn?.querySelectorAll("a[href*='run='], [data-bugs-export]") ?? []) {
        runId = a.getAttribute("data-bugs-export") || decodeURIComponent((a.getAttribute("href") || "").match(/[?&]run=([^&#]+)/)?.[1] || "") || null;
        if (runId) break;
      }
    }
    const worst = parts[0];
    return worst
      ? { tone: worst.tone, title: worst.title || "", lines: worst.lines || [], runId }
      : { tone: "skip", title: "The run ended without a result.", lines: [], runId };
  }

  // ── the composer: continuing the conversation ────────────────────────────
  const RETRY = /^\s*(retry|re-?run|run (it |this )?again|try (it |this )?again|again|once more)\s*[.!]*\s*$/i;

  function syncSend() {
    const msg = q$("#ss-msg");
    const send = q$("#ss-send");
    // While a browser run goes, a message is for that run (POST /api/live/say), so Send stays on.
    if (send) send.disabled = (S.open && !S.asking && !S.turn?.runId) || !msg?.value.trim();
  }
  function syncModeSeg() {
    const r = document.querySelector(`input[name="ss-mode"][value="${S.mode}"]`);
    if (r) r.checked = true;
  }
  const pickedMode = () => document.querySelector('input[name="ss-mode"]:checked')?.value || S.mode;

  function bubble(text) {
    return el.after.appendChild(node(`<div class="ss-ask ss-ask-after"><div class="ss-user">${h(text)}</div></div>`));
  }
  function aiSay(markdown) {
    return el.after.appendChild(node(`<div class="ss-ai">${md(markdown)}</div>`));
  }

  async function send(text) {
    text = String(text ?? "").trim();
    if (text && S.asking) {
      const box = q$("#ss-msg");
      if (box) { box.value = ""; autosize(box); }
      return answerAsk({ option: null, text });
    }
    // A message while a browser run goes is for that run (Aanya, 26 Oct: "when the browser keeps
    // running, the user cannot send any command in between"): the on-screen steps follow it at their
    // next move; "stop" ends the run after the step it is on, "skip" skips the next step.
    if (text && S.open && S.turn?.runId) {
      const box0 = q$("#ss-msg");
      if (box0) { box0.value = ""; autosize(box0); }
      syncSend();
      const mine = bubble(text);
      mine.classList.add("ss-ask-live");
      let ok = false;
      try {
        const r = await fetch("/api/live/say", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: S.turn.runId, text }) });
        ok = r.ok && (await r.json().catch(() => ({}))).ok === true;
      } catch {
        ok = false;
      }
      S.chat.push({ role: "user", text });
      remember(`TO THE RUN: ${text}`);
      note(
        ok
          ? /^\s*(stop|abort|cancel|end it)/i.test(text)
            ? "Sent — the run stops after the step it is on; the steps after it are marked not run."
            : /^\s*skip/i.test(text)
              ? "Sent — the run skips its next step."
              : "Sent to the running test — an on-screen step follows it at its next move; otherwise it is kept for the next one."
          : "The running test could not take your message — it may have just finished.",
        ok ? "info" : "warn",
      );
      pin(true);
      return;
    }
    if (!text || S.open || !S.turn) return;
    const box = q$("#ss-msg");
    if (box) { box.value = ""; autosize(box); }
    syncSend();
    const mode = pickedMode();
    pin(true);

    if (RETRY.test(text)) {
      S.pendingAsk = { display: text, note: "Running the same thing again." };
      return rerun(mode);
    }

    const mine = bubble(text);
    const thinking = el.after.appendChild(node(`<div class="ss-ai ss-thinking" aria-live="polite"><span></span><span></span><span></span><em>Thinking</em></div>`));
    let res = null;
    try {
      const r = await fetch("/api/session/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          mode,
          kind: S.turn.kind,
          client: targetText(),
          context: context(),
          history: S.chat.slice(-8),
        }),
      });
      if (r.ok) res = await r.json();
    } catch {
      res = null;
    }
    thinking.remove();

    if (res?.action === "answer") {
      S.chat.push({ role: "user", text });
      aiSay(res.reply);
      S.chat.push({ role: "assistant", text: res.reply });
      return;
    }
    // A run: it becomes the next turn, and the bubble moves into it.
    mine.remove();
    const testCase = res?.testCase || text;
    const runMode = MODES.includes(res?.mode) ? res.mode : mode;
    S.pendingAsk = {
      display: text,
      compiled: testCase !== text ? testCase : "",
      note: res ? res.note || "" : "The chat could not be reached, so your message runs as a test case exactly as written.",
    };
    startTyped(testCase, runMode);
  }

  /** Run typed text the way the Run box runs it (runInstruction in app.js). */
  function startTyped(text, mode) {
    const box = q$("#request");
    if (!box || typeof runInstruction !== "function") return;
    box.value = text;
    S.continuing = true;
    runInstruction(mode);
  }

  function rerun(mode) {
    const t = S.turn;
    S.continuing = true;
    if (t.kind === "typed") return startTyped(t.runText, mode || t.mode);
    // The journeys this turn ran — a saved journey opened again included —
    // not whatever happens to be ticked now.
    if (t.flowKeys?.length && typeof runSelectedUiJourneys === "function") return runSelectedUiJourneys(t.flowKeys, { bidders: t.bidders });
    if (t.kind === "features" && typeof runSelectedFeatures === "function") return runSelectedFeatures();
    if (t.kind === "journeys" && typeof runSelectedUiJourneys === "function") return runSelectedUiJourneys();
    S.continuing = false;
    S.pendingAsk = null;
    bubble("retry");
    aiSay("This kind of run can't be started again from here — start it again from where you started it.");
  }

  // ── a little markdown, for replies (escaped first; nothing raw gets through) ─
  function inline(s) {
    return h(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>");
  }
  function md(src) {
    const lines = String(src ?? "").replace(/\r/g, "").split("\n");
    const out = [];
    let list = null;
    let para = [];
    let code = null;
    const flushPara = () => {
      if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    };
    const flushList = () => {
      if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
      list = null;
    };
    for (const raw of lines) {
      if (code) {
        if (/^\s*```/.test(raw)) {
          out.push(`<pre>${h(code.join("\n"))}</pre>`);
          code = null;
        } else code.push(raw);
        continue;
      }
      if (/^\s*```/.test(raw)) { flushPara(); flushList(); code = []; continue; }
      const line = raw.trimEnd();
      if (!line.trim()) { flushPara(); flushList(); continue; }
      const hd = line.match(/^\s*#{1,4}\s+(.*)$/);
      if (hd) { flushPara(); flushList(); out.push(`<h4>${inline(hd[1])}</h4>`); continue; }
      const ul = line.match(/^\s*[-*•]\s+(.*)$/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        flushPara();
        const tag = ul ? "ul" : "ol";
        if (list && list.tag !== tag) flushList();
        if (!list) list = { tag, items: [] };
        list.items.push((ul || ol)[1]);
        continue;
      }
      if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += " " + line.trim(); continue; }
      flushList();
      para.push(line.trim());
    }
    if (code) out.push(`<pre>${h(code.join("\n"))}</pre>`);
    flushPara();
    flushList();
    return out.join("");
  }

  // ── scrolling: follow the run while the reader is at the bottom ──────────
  let pinned = true;
  function pin(force) {
    const sc = el.scroll;
    if (!sc) return;
    if (force) pinned = true;
    if (pinned) sc.scrollTop = sc.scrollHeight;
    const jump = q$("#ss-jump");
    if (jump) jump.hidden = pinned;
  }
  function initScroll() {
    const sc = el.scroll;
    const thread = el.thread;
    if (!sc || !thread) return;
    sc.addEventListener("scroll", () => {
      pinned = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80;
      const jump = q$("#ss-jump");
      if (jump) jump.hidden = pinned;
    }, { passive: true });
    new MutationObserver(() => {
      if (pinned) sc.scrollTop = sc.scrollHeight;
      else {
        const jump = q$("#ss-jump");
        if (jump && S.on) jump.hidden = false;
      }
    }).observe(thread, { childList: true, subtree: true, characterData: true });
    q$("#ss-jump")?.addEventListener("click", () => {
      sc.scrollTo({ top: sc.scrollHeight, behavior: "smooth" });
      pinned = true;
      q$("#ss-jump").hidden = true;
    });
    // A frozen turn's check rows still open and close.
    el.history?.addEventListener("click", (e) => {
      if (e.target.closest("a, button, summary, details .cv-body")) return;
      e.target.closest(".chk")?.classList.toggle("open");
    });
  }

  // ── the divider ──────────────────────────────────────────────────────────
  const SPLIT_KEY = "spine.session.split";
  const SPLIT_DEFAULT = 44;
  let split = SPLIT_DEFAULT;
  function applySplit(pct) {
    const root = q$("#ss-session");
    if (!root) return;
    const w = root.clientWidth || 1200;
    const min = Math.min(48, (340 / w) * 100);
    const max = Math.max(52, 100 - (320 / w) * 100);
    split = Math.min(max, Math.max(min, Number(pct) || SPLIT_DEFAULT));
    root.style.setProperty("--ss-left", `${split}%`);
    const gut = q$("#ss-gutter");
    if (gut) gut.setAttribute("aria-valuenow", String(Math.round(split)));
  }
  function saveSplit() {
    try { localStorage.setItem(SPLIT_KEY, String(Math.round(split * 10) / 10)); } catch { /* private window: not remembered */ }
  }
  function initSplit() {
    const root = q$("#ss-session");
    const gut = q$("#ss-gutter");
    if (!root || !gut) return;
    let saved = null;
    try { saved = Number(localStorage.getItem(SPLIT_KEY)) || null; } catch { saved = null; }
    applySplit(saved || SPLIT_DEFAULT);
    gut.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      gut.setPointerCapture(e.pointerId);
      root.classList.add("dragging");
      const rect = root.getBoundingClientRect();
      const move = (ev) => applySplit(((ev.clientX - rect.left) / rect.width) * 100);
      const up = () => {
        root.classList.remove("dragging");
        gut.removeEventListener("pointermove", move);
        saveSplit();
      };
      gut.addEventListener("pointermove", move);
      gut.addEventListener("pointerup", up, { once: true });
      gut.addEventListener("pointercancel", up, { once: true });
    });
    gut.addEventListener("dblclick", () => { applySplit(SPLIT_DEFAULT); saveSplit(); });
    gut.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 10 : 2;
      if (e.key === "ArrowLeft") applySplit(split - step);
      else if (e.key === "ArrowRight") applySplit(split + step);
      else if (e.key === "Home") applySplit(0);
      else if (e.key === "End") applySplit(100);
      else return;
      e.preventDefault();
      saveSplit();
    });
    window.addEventListener("resize", () => applySplit(split));

    q$("#ss-collapse")?.addEventListener("click", () => setRight(false));
    q$("#ss-show-right")?.addEventListener("click", () => setRight(true));
  }

  // ── wiring ───────────────────────────────────────────────────────────────
  function autosize(t) {
    t.style.height = "auto";
    t.style.height = `${Math.min(220, t.scrollHeight)}px`;
  }
  function initComposer() {
    const form = q$("#ss-composer");
    const box = q$("#ss-msg");
    if (!form || !box) return;
    box.addEventListener("input", () => { autosize(box); syncSend(); });
    // Enter sends, as in any chat; Shift+Enter is a new line for a pasted case.
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send(box.value);
      }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      send(box.value);
    });
  }
  function init() {
    initScroll();
    initSplit();
    initComposer();
    for (const b of document.querySelectorAll(".ss-tab")) b.addEventListener("click", () => setTab(b.dataset.tab, true));
    q$("#ss-stop")?.addEventListener("click", () => q$("#run-stop-btn")?.click());
    q$("#ss-req-list")?.addEventListener("click", (e) => {
      const row = e.target.closest(".ss-req-row");
      if (!row) return;
      const li = row.closest(".ss-req");
      const open = !li.classList.contains("open");
      li.classList.toggle("open", open);
      row.setAttribute("aria-expanded", String(open));
      q$(".ss-req-x", li).hidden = !open;
    });
    // The client picker can change under a finished session; the chip follows it.
    q$("#client")?.addEventListener("change", () => S.on && paintTop());
    paintTop();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // Opening the session is reading it: it is no longer waiting on anyone.
  const seen = () => setTimeout(() => {
    if (S.yourTurn && showing() && document.visibilityState === "visible") S.yourTurn = false;
  }, 0);
  window.addEventListener("hashchange", seen);
  document.addEventListener("visibilitychange", seen);

  // ── the spotlight strip: thumbnails of every framed action, newest last ──
  // Each picture takes its step's outcome: purple while the step runs, green once it passed,
  // red when it failed (grey when skipped). Once the run is over only the red ones stay in the
  // strip — the screens where something went wrong — with "Show all" for the rest.
  const spots = [];
  /** step number, 1-based as the pictures carry it → "ok" | "bad" | "skip" */
  const stepOutcome = new Map();
  const spotTone = (stepNo) => stepOutcome.get(Number(stepNo)) || "run";
  function spotsOutcome(stepNo, state) {
    if (!Number(stepNo) || !["ok", "bad", "skip"].includes(state)) return;
    stepOutcome.set(Number(stepNo), state);
    q$("#ss-spots-strip")?.querySelectorAll(`.ss-spot[data-step="${Number(stepNo)}"]`).forEach((x) => (x.dataset.tone = state));
  }
  /** The run is over: show only the failed steps' pictures, and say how many are hidden. */
  function spotsSettle() {
    const box = q$("#ss-spots");
    const strip = q$("#ss-spots-strip");
    if (!box || !strip || !spots.length) return;
    const total = strip.querySelectorAll(".ss-spot").length;
    const bad = strip.querySelectorAll('.ss-spot[data-tone="bad"]').length;
    box.classList.add("settled");
    box.classList.remove("all");
    const say = q$("#ss-spots-say");
    if (say) say.textContent = bad
      ? `Showing the ${bad === 1 ? "screenshot" : `${bad} screenshots`} of the failed step — the other ${total - bad} ${total - bad === 1 ? "is" : "are"} hidden.`
      : `No step failed, so the ${total === 1 ? "screenshot is" : `${total} screenshots are`} hidden.`;
    const all = q$("#ss-spots-all");
    if (all) all.textContent = `Show all ${total}`;
    const note = q$("#ss-spots-note");
    if (note) note.hidden = false;
    const n = q$("#ss-spots-n");
    if (n) n.textContent = String(bad);
    const open = q$("#ss-spots-open");
    if (open) open.hidden = !bad;
  }
  function spotsReset() {
    spots.length = 0;
    stepOutcome.clear();
    const box = q$("#ss-spots");
    if (box) {
      box.hidden = true;
      box.classList.remove("settled", "all");
    }
    const strip = q$("#ss-spots-strip");
    if (strip) strip.innerHTML = "";
    const n = q$("#ss-spots-n");
    if (n) n.textContent = "0";
    const note = q$("#ss-spots-note");
    if (note) note.hidden = true;
    const open = q$("#ss-spots-open");
    if (open) open.hidden = false;
  }
  q$("#ss-spots-all")?.addEventListener("click", () => {
    const box = q$("#ss-spots");
    if (!box) return;
    const showing = box.classList.toggle("all");
    const total = spots.length;
    q$("#ss-spots-all").textContent = showing ? "Only the failed step" : `Show all ${total}`;
    const say = q$("#ss-spots-say");
    if (say) say.hidden = showing;
    const n = q$("#ss-spots-n");
    if (n) n.textContent = String(showing ? total : q$("#ss-spots-strip").querySelectorAll('.ss-spot[data-tone="bad"]').length);
  });
  function spotUrl(sp) {
    return `/api/ui-evidence?path=${encodeURIComponent(sp.file)}`;
  }
  function spotCaption(sp) {
    return `${sp.step ? `Step ${sp.step} · ` : ""}${sp.action}${sp.target ? ` · ${sp.target}` : ""}`;
  }
  function spotOpen(sp) {
    const big = document.createElement("figure");
    big.className = "ss-spot-big";
    const img = document.createElement("img");
    img.src = spotUrl(sp);
    img.alt = spotCaption(sp);
    const cap = document.createElement("figcaption");
    cap.textContent = spotCaption(sp);
    big.append(img, cap);
    big.addEventListener("click", () => big.remove());
    document.body.appendChild(big);
  }
  /** A spotlight picture arrived from the run (the "spot" SSE event). */
  function spot(sp) {
    if (!sp || !sp.file) return;
    spots.push(sp);
    const box = q$("#ss-spots");
    const strip = q$("#ss-spots-strip");
    if (!box || !strip) return;
    box.hidden = false;
    const el = document.createElement("div");
    el.className = "ss-spot";
    el.dataset.action = sp.action;
    el.dataset.step = String(Number(sp.step) || 0);
    el.dataset.tone = spotTone(sp.step);
    el.title = spotCaption(sp);
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = spotUrl(sp);
    img.alt = spotCaption(sp);
    const cap = document.createElement("div");
    cap.className = "ss-spot-cap";
    cap.textContent = spotCaption(sp);
    el.append(img, cap);
    el.addEventListener("click", () => spotOpen(sp));
    strip.appendChild(el);
    strip.scrollLeft = strip.scrollWidth;
    const n = q$("#ss-spots-n");
    if (n) n.textContent = String(spots.length);
    if (S.frames === 0) {
      // the picture itself is a frame of the screen — show it where the browser goes
      const fi = q$("#live-frame");
      const fp = q$("#live-frame-panel");
      if (fi && fp) { fi.src = spotUrl(sp); fp.hidden = false; }
      frame();
    }
  }
  // Once the run is over and only failed steps show, "Open" opens the last of those.
  q$("#ss-spots-open")?.addEventListener("click", () => {
    if (!spots.length) return;
    const settled = q$("#ss-spots")?.classList.contains("settled") && !q$("#ss-spots")?.classList.contains("all");
    const pick = settled ? [...spots].reverse().find((sp) => spotTone(sp.step) === "bad") : spots[spots.length - 1];
    if (pick) spotOpen(pick);
  });

  // A QUESTION THE LIVE STREAM DID NOT BRING (29 Oct, plan-mvt753ce): after a hand-back the run asked about step 23
  // twice and neither question reached this screen — it kept "Your turn in the browser" and the run waited ten
  // minutes for an answer nobody could give. The server keeps a run's open question on its browser slot
  // (/api/run-state → running.ask, what Sessions' "Waiting for you" card reads); show it here when none is open.
  setInterval(async () => {
    if (!S.on || !S.turn || S.turn.replay || S.asking || document.hidden) return;
    let st = null;
    try {
      st = await (await fetch("/api/run-state")).json();
    } catch {
      return;
    }
    const q = st?.running?.ask;
    const mine = S.turn?.runId || S.turn?.explore?.runId || "";
    if (!q || !q.runId || (mine && q.runId !== mine) || shownAsks.has(`${q.runId}#${q.n}`) || S.asking) return;
    ask(q);
  }, 4000);

  window.spineSession = {
    begin, ensure, idle, stopped, showing,
    spot,
    working, head, act, note, browserPart,
    plan, outline, draftGone, planStep, planNote, planGrow, planName, planLength,
    explore, exploreStep, ask,
    runCase, setRunId, answerQuestion,
    frame, sideFrame, request, consoleLines,
    end, apiCheck, apiEnd, uiResult, journeyEnd, runEnd, replayed,
    /**
     * They handed the browser back (liveControl.js). A question that offered "I'll do it myself" and is
     * still open is answered by that: what they did is the answer (Aanya, 28 Oct: "my platform doesnt
     * ignore it").
     */
    handedBack() {
      const open = S.asking;
      if (!open || open.sending || !open.options?.some((o) => o.id === "self")) return;
      const b = open.card.querySelector('.ss-opt[data-opt="self"]');
      answerAsk({ option: "self", text: "I did it myself in the browser" }, b);
    },
    get on() { return S.on; },
    get open() { return S.open; },
    /** The run is waiting on the tester's answer to a question. */
    get waiting() { return !!S.asking; },
    get id() { return S.id; },
    get yourTurn() { return S.yourTurn; },
    /** What was asked, when it started, where it ran, and whether it is a saved run opened again. */
    get turn() {
      const t = S.turn;
      return t ? { text: t.text, mode: t.mode, kind: t.kind, replay: !!t.replay, startedAt: t.startedAt, target: t.target, runId: t.runId || (t.replay ? S.id : null) } : null;
    },
    /** A browser plan's progress: steps finished, of how many. Null until a plan has arrived. */
    get progress() {
      const plan = S.turn?.plan ?? [];
      if (!plan.length) return null;
      return { done: plan.filter((p) => p.state === "ok" || p.state === "bad" || p.state === "skip").length, total: plan.length };
    },
    /** A browser plan's steps, each as it stands: wait | run | ok | bad | skip. Empty until a plan has arrived. */
    get steps() {
      return (S.turn?.plan ?? []).map((p) => p.state);
    },
  };
})();
