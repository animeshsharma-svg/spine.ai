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
    if (stop) stop.hidden = !(S.open && (read(() => uiRunning, null) || read(() => apiRunning, null)));
    const comp = q$("#ss-composer");
    if (comp) comp.classList.toggle("busy", S.open);
    const msg = q$("#ss-msg");
    if (msg) msg.placeholder = S.open ? "Running… you can type your next message" : "Send a message to continue";
    syncSend();
    paintLive();
  }

  // ── turns ────────────────────────────────────────────────────────────────
  /**
   * A new turn. From the composer it continues this session (the last turn is
   * kept above, frozen as it ended); from anywhere else it starts a new one.
   */
  function begin({ text = "", mode = S.mode, kind = "typed", replay = false, id = null } = {}) {
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
    S.turn = { text: shown, runText: text, mode: S.mode, kind, replay, target: target(), startedAt: Date.now(), plan: [], log: [], ended: {} };
    S.chat.push({ role: "user", text: shown });

    const turn = el.turn;
    if (turn) turn.dataset.kind = kind;
    el.narr.innerHTML = "";
    el.end.innerHTML = "";
    const meta = [MODE_WORD[S.mode], targetText()].filter(Boolean).join(" · ");
    el.ask.innerHTML =
      `<div class="ss-user">${h(shown)}</div>` +
      `<div class="ss-meta">${h(replay ? `Saved run · ${meta}` : meta)}</div>` +
      (ask?.compiled ? `<div class="ss-compiled"><span>Running as</span>${h(ask.compiled)}</div>` : "") +
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
    spotsReset();

    S.frames = 0;
    S.reqs = 0;
    S.tabPicked = false;
    const list = q$("#ss-req-list");
    if (list) list.innerHTML = "";
    paintReqCount();
    const apiOnly = S.mode === "api" || kind === "features";
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
  function startClock() {
    clearInterval(S.clock);
    S.clock = setInterval(() => {
      if (!S.open) return;
      tick();
      paintCases();
    }, 1000);
  }

  // ── narration ────────────────────────────────────────────────────────────
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
  function stepVerb(name) {
    const w = String(name ?? "").replace(/_/g, " ").trim();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }

  /** The compiler's gaps as one list, without the full stops each one ends in. */
  const gapWords = (gaps) => (gaps || []).map((g) => String(g).trim().replace(/[\s.;,]+$/, "")).filter(Boolean).join("; ");

  function plan(p) {
    if (!S.on) return;
    stopWorking();
    // A plan that cannot run is not a green line: its dot stays grey.
    const runnable = p.coverage !== "none" && (p.steps || []).length > 0;
    head(p.title || "The plan", p.reasoning || "", runnable ? "ok" : "skip");
    const list = node(`<ol class="ss-steps"></ol>`);
    S.turn.plan = (p.steps || []).map((s, i) => {
      const verb = stepVerb(s.step);
      const arg = argWords(s.args);
      const assertion = ASSERTS.test(String(s.step ?? ""));
      const li = node(
        `<li class="ss-b ${assertion ? "head" : "act"} wait" data-i="${i}"><span class="ss-dot"></span><div class="ss-b-body">` +
        (assertion
          ? `<div class="ss-b-t">${h(verb)}${arg ? ` <span class="ss-arg">${h(arg)}</span>` : ""}</div>`
          : `<div class="ss-b-a"><b>${h(verb)}</b>${arg ? ` <span class="ss-arg">${h(arg)}</span>` : ""}</div>`) +
        `<div class="ss-b-d ss-step-detail" hidden></div></div></li>`,
      );
      list.appendChild(li);
      return { verb, arg, state: "wait", detail: "" };
    });
    if (S.turn.plan.length) addNarr(list);
    // Nothing runs when coverage is "none": the Not tested box this turn ends
    // on says which step is missing, so it is not said twice.
    if (p.coverage === "partial") note(`Only part of this case can be tested — there is no step for: ${gapWords(p.gaps)}.`, "info");
    for (const w of p.warnings || []) if (!/^cannot test|^can only test/i.test(w)) note(w, "info");
    if (runnable) working(`Running ${S.turn.plan.length} step${S.turn.plan.length === 1 ? "" : "s"} in the browser`);
  }

  /** state: "run" | "ok" | "bad" | "skip" */
  function planStep(i, state, detail, spotlights) {
    if (!S.on || !S.turn?.plan?.[i]) return;
    const li = q$(`.ss-steps > [data-i="${i}"]`, el.narr);
    if (!li) return;
    li.classList.remove("wait", "run", "ok", "bad", "skip");
    li.classList.add(state);
    const s = S.turn.plan[i];
    s.state = state;
    if (detail !== undefined) {
      s.detail = String(detail || "");
      const d = q$(".ss-step-detail", li);
      if (d) {
        d.textContent = s.detail;
        d.hidden = !s.detail;
      }
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

  // ── the right-hand side ──────────────────────────────────────────────────
  function setTab(tab, picked = false) {
    S.tab = tab === "requests" ? "requests" : "browser";
    if (picked) S.tabPicked = true;
    for (const b of document.querySelectorAll(".ss-tab")) b.setAttribute("aria-selected", String(b.dataset.tab === S.tab));
    for (const p of document.querySelectorAll(".ss-pane")) p.hidden = p.dataset.pane !== S.tab;
  }
  function frame() {
    if (!S.on) return;
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
    const word = S.tab === "requests" ? "Requests" : "Browser";
    if (btn.lastChild?.nodeType === Node.TEXT_NODE) btn.lastChild.textContent = word;
    btn.title = `Show the ${word.toLowerCase()} panel`;
  }
  function paintLive() {
    const live = q$("#ss-live");
    if (!live) return;
    live.hidden = !S.frames;
    live.dataset.state = S.open ? "live" : "ended";
    live.lastChild.textContent = S.open ? "LIVE" : "LAST FRAME";
    const empty = q$("#ss-browser-empty");
    if (empty) {
      empty.hidden = !!S.frames;
      empty.textContent = S.open
        ? S.turn?.mode === "api" ? "This run talks to the API directly — open Requests to watch it." : "The browser appears here as soon as the run opens it."
        : "No browser was used in this run.";
    }
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
  function end({ tone = "ok", key = "", title = "", lines = [], links = [], html = "" } = {}) {
    if (!S.on || !el.end) return;
    stopWorking();
    const k = key || "run";
    const was = S.turn?.ended?.[k];
    // A part that already said "not tested" with its reason keeps it: the
    // stream's own `done` after a refusal only knows that nothing started.
    if (was && was.tone === "skip" && tone === "skip") return;
    const box = node(
      `<div class="ss-call ${h(tone)}" data-key="${h(k)}">` +
      `<div class="ss-call-h">${icon(TAG_ICON[tone] || "info")}<span class="ss-call-tag">${h(TAG[tone] || tone)}</span>` +
      (key ? `<span class="ss-call-k">${h(key)}</span>` : "") + `</div>` +
      (title ? `<div class="ss-call-t">${h(title)}</div>` : "") +
      lines.filter(Boolean).map((l) => `<p>${h(l)}</p>`).join("") +
      (html || "") +
      (links.length
        ? `<div class="ss-call-links">${links
            .map((a) => `<a href="${h(a.href)}" target="_blank" rel="noopener">${icon(a.icon || "file-text")}${h(a.label)}</a>`)
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
    S.open = false;
    stopWorking();
    paintCases();
    paintTop();
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
    end({ tone: "ok", key: "API", title: rows.length === 1 ? "It worked as expected." : `All ${rows.length} API checks worked as expected.`, lines: rows.slice(0, 2).map((r) => r.message || r.verdict || "") });
  }

  // ── the typed UI case: the answer renderUiInstructResult already words ───
  // `html`: the evidence block app.js builds for a screen run (the failing step's screenshot,
  // the app's own words, the rule in its code, any step the run recovered) — every value in
  // it is escaped there.
  function uiResult({ cls, title, lines = [], html = "" }) {
    if (!S.on) return;
    const tone = cls === "ok" ? "ok" : cls === "skip" ? "skip" : "bad";
    end({ tone, key: "UI", title: lines[0] || title || "", lines: lines.slice(1), html });
  }

  // ── a browser journey (/api/ui-run) ──────────────────────────────────────
  function journeyEnd({ label, code, runId, error, took }) {
    if (!S.on) return;
    const ok = code === 0 && !error;
    const links = runId
      ? [
          { label: "UI run report", href: `/api/ui-report?run=${encodeURIComponent(runId)}`, icon: "chart-column" },
          { label: "Bug sheet", href: `/api/bug-report?run=${encodeURIComponent(runId)}`, icon: "bug" },
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
    if (b?.getAttribute("href")) links.push({ label: "Bug sheet", href: b.getAttribute("href"), icon: "bug" });
    end(summary({ total, passed, failed, skipped, error, journey, note: subtitle, links }));
  }

  /**
   * How an API run ended, in words anyone can read: did it work, how far the
   * journey got, how the checks came out — and where the detail lives. The
   * counts are the run's own; nothing is recomputed.
   */
  function summary({ total = 0, passed = 0, failed = 0, skipped = 0, error = null, journey = null, note = null, links = [], when = "" }) {
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
    if (skipped) lines.push(`${skipped} check${skipped === 1 ? " was" : "s were"} not run — the full report says why.`);
    if (note && !error) lines.push(note);
    if (when) lines.push(when);
    if (ran && links.length) lines.push("Every check, with what was sent and what came back, is in the full report.");
    return {
      tone: error ? "bad" : ok ? (ran ? "ok" : "skip") : "bad",
      title: error
        ? `The run stopped: ${error}`
        : ok
          ? ran ? "Everything worked." : "Nothing was tested."
          : failed
            ? `${failed} of ${total} check${total === 1 ? "" : "s"} failed.`
            : `The journey stopped at step ${journey.stoppedAt}.`,
      lines,
      links,
    };
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
      journey,
      when: at && !Number.isNaN(at.getTime())
        ? `Ran on ${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`
        : "",
      links: id
        ? [
            { label: "Full report", href: `/api/test-report?run=${id}`, icon: "chart-column" },
            { label: "Bug sheet", href: `/api/bug-report?run=${id}`, icon: "bug" },
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
    if (t.plan.length) {
      out.push("Browser steps:");
      t.plan.forEach((s, i) => out.push(`  ${i + 1}. [${s.state}] ${s.verb}${s.arg ? ` ${s.arg}` : ""}${s.detail ? ` — ${s.detail}` : ""}`));
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

  // ── the composer: continuing the conversation ────────────────────────────
  const RETRY = /^\s*(retry|re-?run|run (it |this )?again|try (it |this )?again|again|once more)\s*[.!]*\s*$/i;

  function syncSend() {
    const msg = q$("#ss-msg");
    const send = q$("#ss-send");
    if (send) send.disabled = S.open || !msg?.value.trim();
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
  const spots = [];
  function spotsReset() {
    spots.length = 0;
    const box = q$("#ss-spots");
    if (box) box.hidden = true;
    const strip = q$("#ss-spots-strip");
    if (strip) strip.innerHTML = "";
    const n = q$("#ss-spots-n");
    if (n) n.textContent = "0";
  }
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
  q$("#ss-spots-open")?.addEventListener("click", () => spots.length && spotOpen(spots[spots.length - 1]));

  window.spineSession = {
    begin, ensure, idle, stopped, showing,
    spot,
    working, head, act, note,
    plan, planStep,
    frame, request,
    end, apiCheck, apiEnd, uiResult, journeyEnd, runEnd, replayed,
    get on() { return S.on; },
    get open() { return S.open; },
    get id() { return S.id; },
    get yourTurn() { return S.yourTurn; },
    /** What was asked, when it started, where it ran, and whether it is a saved run opened again. */
    get turn() {
      const t = S.turn;
      return t ? { text: t.text, mode: t.mode, kind: t.kind, replay: !!t.replay, startedAt: t.startedAt, target: t.target } : null;
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
