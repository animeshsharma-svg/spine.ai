/**
 * HOME (#/home), AND THE SHELL AROUND IT.
 *
 * Home asks "what should spine.ai test today?" and shows only that: the
 * request card and the last few sessions. It starts nothing
 * of its own — Start hands the typed case to the Run screen's existing
 * typed-case runner (runInstruction in app.js: /api/run-case-api for API,
 * /api/plan-run for the browser, API then browser for both) and opens the
 * session it began, #/session/{id}. A run started here is the same run in
 * every way.
 *
 * It also drives the parts of the shell every view shares:
 *   - the client bar (client + environment, top right of the content);
 *   - the sidebar's Theme toggle, collapse button, run pill, profile menu
 *     and its counts (amber on Sessions, red on Bugs);
 *   - opening a session by its address, #/session/{id}.
 *
 * It reads app.js's state rather than duplicating it — currentClient,
 * currentClientName, customBase, runLive, apiRunning, uiRunning, runPending
 * and the live journey are top-level bindings of that script, so readable
 * here — and session.js's window.spineSession. Every status word is a
 * display mapping of what the server or the runner said; Home never decides
 * or softens a verdict.
 */
(function () {
  "use strict";

  const q$ = (sel, root = document) => root.querySelector(sel);
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (name, cls = "") => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
  const enc = encodeURIComponent;

  // app.js's bindings, read defensively: a missing one must not break Home.
  const read = (fn, fallback) => {
    try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; }
  };
  const clientId = () => read(() => currentClient, null);
  const clientName = () => read(() => currentClientName, "");
  const base = () => read(() => customBase, "");
  const session = () => window.spineSession ?? null;
  const onHome = () => document.documentElement.dataset.view === "home";

  async function getJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} },
  };

  /**
   * Rewrites a node only when its markup changes. The shell redraws every
   * second; a rewrite with nothing new would knock keyboard focus off a link.
   */
  function setHtml(node, html) {
    if (node && node.dataset.html !== html) {
      node.dataset.html = html;
      node.innerHTML = html;
    }
  }

  const initials = (name) => {
    const words = String(name).replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "··";
    return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
  };

  // ── theme ────────────────────────────────────────────────────────────────
  // The theme is data-theme on <html>, kept in localStorage ("spine.theme")
  // and set before first paint by the inline script in index.html's <head>,
  // so a reload never flashes the other one. Changing it here changes only
  // that attribute: nothing is re-rendered or re-fetched.
  const THEME_KEY = "spine.theme";
  const themeNow = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  function syncThemeButton() {
    const btn = q$("#sb-theme");
    if (!btn) return;
    const dark = themeNow() === "dark";
    const words = dark ? "Switch to light theme" : "Switch to dark theme";
    btn.setAttribute("aria-checked", String(dark));
    btn.setAttribute("aria-label", words);
    btn.title = words;
  }
  /** The switch itself, synchronously — what the view transition snapshots around. */
  function applyTheme(t, remember) {
    const root = document.documentElement;
    // The page's own 250ms colour fades would play inside the circle as a
    // second, page-wide fade; they are off for the length of the switch
    // (home.css, html.theme-switching).
    root.classList.add("theme-switching");
    root.setAttribute("data-theme", t);
    if (remember) store.set(THEME_KEY, t);
    syncThemeButton();
  }
  const switchingDone = () => document.documentElement.classList.remove("theme-switching");

  let themeBusy = false;
  /**
   * Light ↔ dark, with the new theme growing out of the click as a circle
   * until it covers the screen — the same circle both ways. From the
   * keyboard (Enter/Space give a click with detail 0) it grows from the
   * centre of the Theme button. Without View Transitions, or with reduced
   * motion, the theme changes at once. Clicks during a switch are ignored.
   */
  function setTheme(next, event) {
    if (themeBusy) return;
    const btn = q$("#sb-theme");
    let x;
    let y;
    if (event && event.detail > 0 && Number.isFinite(event.clientX)) {
      x = event.clientX;
      y = event.clientY;
    } else {
      const r = btn?.getBoundingClientRect();
      x = r ? r.left + r.width / 2 : innerWidth / 2;
      y = r ? r.top + r.height / 2 : innerHeight / 2;
    }
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const reduce = read(() => matchMedia("(prefers-reduced-motion: reduce)").matches, false);
    if (!document.startViewTransition || reduce) {
      applyTheme(next, true);
      requestAnimationFrame(() => requestAnimationFrame(switchingDone));
      return;
    }
    themeBusy = true;
    const t = document.startViewTransition(() => applyTheme(next, true));
    t.ready
      .then(() =>
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 650, easing: "cubic-bezier(.4,0,.2,1)", pseudoElement: "::view-transition-new(root)" },
        ),
      )
      .catch(() => {});
    t.finished.catch(() => {}).finally(() => {
      themeBusy = false;
      switchingDone();
    });
  }
  window.spineTheme = { set: setTheme, now: themeNow };

  function initTheme() {
    q$("#sb-theme")?.addEventListener("click", (e) => setTheme(themeNow() === "dark" ? "light" : "dark", e));
    // Until someone picks a theme by hand, follow the system's setting live, at once.
    try {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", (e) => {
        const picked = store.get(THEME_KEY);
        if (picked !== "light" && picked !== "dark") {
          applyTheme(e.matches ? "dark" : "light", false);
          requestAnimationFrame(() => requestAnimationFrame(switchingDone));
        }
      });
    } catch {}
    syncThemeButton();
  }

  // ── sidebar collapse: app.js owns the state; this is its visible button ──
  function syncCollapseButton() {
    const btn = q$("#sb-collapse");
    if (!btn) return;
    const collapsed = document.documentElement.classList.contains("nav-collapsed");
    const words = collapsed ? "Expand sidebar" : "Collapse sidebar";
    btn.setAttribute("aria-label", words);
    btn.setAttribute("aria-expanded", String(!collapsed));
    btn.title = words;
  }
  function initCollapse() {
    q$("#sb-collapse")?.addEventListener("click", () => {
      q$("#nav-toggle")?.click();
      syncCollapseButton();
    });
    syncCollapseButton();
  }

  // ── who is signed in, and the menu under their name ──────────────────────
  /**
   * There are no accounts on the server yet: this is the name and email typed
   * at #/login, kept in this browser by window.spineAuth (index.html). The
   * route guard sends anyone without one to sign in, so the placeholder below
   * only shows if that record goes missing mid-visit.
   */
  function syncProfile() {
    const u = read(() => window.spineAuth.user(), null);
    const name = u ? String(u.name || u.email.split("@")[0]) : "Not signed in";
    const mail = u ? String(u.email) : "No account on this browser";
    const ini = u ? initials(name) : "··";
    for (const [sel, text] of [["#sb-me-initials", ini], ["#sb-menu-initials", ini], ["#sb-me-name", name], ["#sb-menu-name", name], ["#sb-menu-mail", mail]]) {
      const n = q$(sel);
      if (n && n.textContent !== text) n.textContent = text;
    }
    const mailEl = q$("#sb-menu-mail");
    if (mailEl) mailEl.title = mail;
    q$("#sb-me")?.setAttribute("aria-label", `${name}, QA · Procol. Account menu`);
  }

  function meItems() {
    return [...(q$("#sb-me-menu")?.querySelectorAll('[role="menuitem"]') ?? [])];
  }
  function openMe() {
    const btn = q$("#sb-me");
    const menu = q$("#sb-me-menu");
    if (!btn || !menu) return;
    closeMenu(false);
    syncProfile();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    meItems()[0]?.focus();
  }
  function closeMe(returnFocus) {
    const btn = q$("#sb-me");
    const menu = q$("#sb-me-menu");
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    btn?.setAttribute("aria-expanded", "false");
    if (returnFocus) btn?.focus();
  }
  function initProfile() {
    const btn = q$("#sb-me");
    const menu = q$("#sb-me-menu");
    if (!btn || !menu) return;
    btn.addEventListener("click", () => (menu.hidden ? openMe() : closeMe(true)));
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        openMe();
      }
    });
    menu.addEventListener("keydown", (e) => {
      const items = meItems();
      const i = items.indexOf(document.activeElement);
      const go = (n) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
      if (e.key === "ArrowDown") go(i + 1);
      else if (e.key === "ArrowUp") go(i - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(items.length - 1);
      else if (e.key === "Escape") {
        e.preventDefault();
        closeMe(true);
      } else if (e.key === "Tab") closeMe(false);
    });
    // welcome.js signs out on this same click and goes to #/welcome.
    q$("#sb-signout")?.addEventListener("click", () => closeMe(false));
    document.addEventListener("pointerdown", (e) => {
      if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) closeMe(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.hidden) closeMe(true);
    });
    window.addEventListener("hashchange", () => { closeMe(false); syncProfile(); });
    window.addEventListener("storage", (e) => { if (e.key === window.spineAuth?.KEY) syncProfile(); });
    syncProfile();
  }

  // ── client bar: client + environment ────────────────────────────────────
  function syncContext() {
    let name = clientName();
    const id = clientId();
    if (!name) {
      const opt = q$("#client")?.selectedOptions?.[0];
      if (opt && opt.value !== "__add__") name = opt.textContent.replace(/\s*\(\d+\).*$/, "");
    }
    if (id != null) {
      const nameEl = q$("#ctx-client-name");
      if (nameEl) nameEl.textContent = name || `Company ${id}`;
      const idEl = q$("#ctx-client-id");
      if (idEl) {
        idEl.textContent = String(id);
        idEl.title = `Company id ${id}`;
      }
      const btn = q$("#ctx-client-btn");
      if (btn) btn.title = `${name || "Client"} · company id ${id}`;
      const ini = q$("#ctx-initials");
      if (ini) ini.textContent = initials(name || String(id));
    }
    const envEl = q$("#ctx-env-name");
    if (envEl) envEl.textContent = envLabel();
  }
  /** "UAT", or the custom base URL's host. */
  function envLabel() {
    if (q$("#env")?.value !== "custom") return "UAT";
    return customHost() || "Custom URL";
  }
  function customHost() {
    const b = base();
    if (!b) return "";
    try { return new URL(b).host; } catch { return b; }
  }
  /** A client's name from the picker's own list ("PROCOL DEMO (198678)"). */
  function clientNameById(id) {
    const opt = [...(q$("#client")?.options ?? [])].find((o) => o.value === String(id));
    return opt ? opt.textContent.replace(/\s*\(\d+\).*$/, "").trim() : "";
  }

  // ── the client bar's menus ───────────────────────────────────────────────
  /**
   * Each button opens a listbox drawn here from its hidden <select>'s options
   * (read fresh every time, so an added client is there). Choosing an item
   * sets that <select> and fires `change`, which is all app.js listens to —
   * "+ Add a client…" and "Custom URL…" then open their fields exactly as
   * before. The browser's own menu is never shown: it ignored the theme.
   */
  let menuOpen = null; // { btn, menu, select }

  function clientOption(o, selected) {
    if (o.value === "__add__") {
      return (
        `<div class="ctx-opt ctx-opt-action" role="option" tabindex="-1" aria-selected="false" data-value="__add__">` +
        `<span class="ctx-opt-ico">${icon("plus")}</span><span class="ctx-opt-name">Add a client…</span></div>`
      );
    }
    const m = o.text.match(/^(.*?)\s*\((\d+)\)\s*(·\s*added)?\s*$/);
    const name = m ? m[1] : o.text;
    const id = m ? m[2] : o.value;
    return (
      `<div class="ctx-opt" role="option" tabindex="-1" aria-selected="${selected}" data-value="${h(o.value)}">` +
      `<span class="ctx-avatar" aria-hidden="true">${h(initials(name))}</span>` +
      `<span class="ctx-opt-name">${h(name)}</span>` +
      (m && m[3] ? `<span class="ctx-opt-tag">added</span>` : "") +
      `<span class="ctx-opt-id"><span class="sr-only">, company id </span>${h(id)}</span>${icon("check", "ctx-opt-check")}</div>`
    );
  }
  /** Column labels for the client list, so the number reads as the company id. */
  const CLIENT_MENU_HEAD = `<div class="ctx-menu-head" aria-hidden="true"><span>Client</span><span>Company ID</span></div>`;
  function envOption(o, selected) {
    const custom = o.value === "custom";
    const host = custom ? customHost() : "";
    return (
      `<div class="ctx-opt" role="option" tabindex="-1" aria-selected="${selected}" data-value="${h(o.value)}">` +
      `<span class="ctx-opt-ico">${custom ? icon("globe") : `<span class="ctx-envdot" aria-hidden="true"></span>`}</span>` +
      `<span class="ctx-opt-name">${custom ? "Custom URL…" : "UAT"}</span>` +
      (host ? `<span class="ctx-opt-id">${h(host)}</span>` : "") +
      `${icon("check", "ctx-opt-check")}</div>`
    );
  }

  /**
   * On Home the menu stops above the request card instead of covering it:
   * its list scrolls, between the column labels and "Add a client…" (both
   * pinned in home.css). Only while Home is the view — elsewhere the card is
   * hidden and measures as zero — and only with room for a few rows; on a
   * short screen it floats over the card as any menu would.
   */
  function fitAboveCard(menu) {
    menu.style.maxHeight = "";
    const card = onHome() ? q$("#home-ask") : null;
    if (!card) return;
    const room = Math.floor(card.getBoundingClientRect().top - menu.getBoundingClientRect().top - 12);
    if (room >= 140) menu.style.maxHeight = `${room}px`;
  }

  function openMenu(btn, menu, select, draw, head = "") {
    closeMenu(false);
    closeMe(false);
    const now = select.value;
    menu.innerHTML = head + [...select.options].map((o) => draw({ value: o.value, text: o.textContent }, o.value === now)).join("");
    menu.hidden = false;
    fitAboveCard(menu);
    btn.setAttribute("aria-expanded", "true");
    menuOpen = { btn, menu, select };
    (menu.querySelector('[aria-selected="true"]') || menu.querySelector(".ctx-opt"))?.focus();
  }
  function closeMenu(returnFocus) {
    if (!menuOpen) return;
    const { btn, menu } = menuOpen;
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    menuOpen = null;
    if (returnFocus) btn.focus();
  }
  function choose(value) {
    if (!menuOpen) return;
    const { select } = menuOpen;
    closeMenu(true);
    if (select.value === value && value !== "__add__") return;
    select.value = value;
    // app.js's own handler does the rest (reloads, or opens the add/URL field).
    select.dispatchEvent(new Event("change", { bubbles: true }));
    syncContext();
  }

  function initMenus() {
    const pairs = [
      [q$("#ctx-client-btn"), q$("#ctx-menu-client"), q$("#client"), clientOption, CLIENT_MENU_HEAD],
      [q$("#ctx-env-btn"), q$("#ctx-menu-env"), q$("#env"), envOption, ""],
    ];
    for (const [btn, menu, select, draw, head] of pairs) {
      if (!btn || !menu || !select) continue;
      const open = () => openMenu(btn, menu, select, draw, head);
      btn.addEventListener("click", () => (menuOpen?.menu === menu ? closeMenu(true) : open()));
      btn.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          open();
        }
      });
      menu.addEventListener("click", (e) => {
        const opt = e.target.closest(".ctx-opt");
        if (opt) choose(opt.dataset.value);
      });
      menu.addEventListener("keydown", (e) => {
        const items = [...menu.querySelectorAll(".ctx-opt")];
        const i = items.indexOf(document.activeElement);
        const go = (n) => { e.preventDefault(); items[Math.max(0, Math.min(items.length - 1, n))]?.focus(); };
        if (e.key === "ArrowDown") go(i + 1);
        else if (e.key === "ArrowUp") go(i - 1);
        else if (e.key === "Home") go(0);
        else if (e.key === "End") go(items.length - 1);
        else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (i >= 0) choose(items[i].dataset.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeMenu(true);
        } else if (e.key === "Tab") closeMenu(false);
      });
    }
    // A click anywhere else, or leaving the view, closes an open menu.
    document.addEventListener("pointerdown", (e) => {
      if (menuOpen && !menuOpen.menu.contains(e.target) && !menuOpen.btn.contains(e.target)) closeMenu(false);
    });
    window.addEventListener("hashchange", () => closeMenu(false));
  }

  // ── the one shared browser: /api/run-state ───────────────────────────────
  let browserState = null; // { running: {label, since, progress, headed} | null, waiting: [] }
  async function pollBrowser() {
    try {
      browserState = await getJson("/api/run-state");
    } catch {
      /* server restarting; the next tick asks again */
    }
    renderRunNow();
  }

  // ── what is running right now ────────────────────────────────────────────
  const sessionHref = (id) => `#/session/${enc(id)}`;
  const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /**
   * The run in flight: this tab's session (and app.js's live flags behind
   * it), or a browser run someone else started, from /api/run-state. Only a
   * run in this tab has a session to open; one held elsewhere opens the list.
   */
  function liveRun() {
    const ss = session();
    const pageLive = !!read(() => runLive, false);
    const apiLive = !!read(() => apiRunning, null);
    const uiLive = !!read(() => uiRunning, null);
    const mine = !!(ss?.open || pageLive || apiLive || uiLive);
    const browser = browserState?.running ?? null;
    const queued = browserState?.waiting?.length || 0;
    if (!(mine || browser)) return { live: false, queued };

    const turn = mine ? ss?.turn : null;
    const asked = turn && !turn.replay ? turn.text : "";
    const title = capFirst(oneLine(asked || read(() => runPending, null) || browser?.label || "a run"));

    // "step n of total" once the run has said how many steps it has; the
    // runner's own progress words until then.
    const jl = read(() => journeyLive, null);
    const jSteps = read(() => journeyStepsLive, []) || [];
    const jPlanned = read(() => journeyPlanned, 0) || 0;
    const planned = read(() => runPlanned, 0) || 0;
    const rows = read(() => checkRows, []) || [];
    const current = oneLine(read(() => runCurrentStep, ""));
    const plan = mine ? ss?.progress : null;
    let progress;
    if (plan?.total) {
      progress = `step ${Math.min(plan.done + 1, plan.total)} of ${plan.total}`;
    } else if (mine && jl?.steps?.length) {
      const total = jPlanned || jl.steps.length;
      const done = jSteps.filter(Boolean).length;
      progress = done < total
        ? `step ${done + 1} of ${total}`
        : planned
          ? `case ${Math.min(rows.length + 1, planned)} of ${planned}`
          : `step ${total} of ${total}`;
    } else if (mine && planned) {
      progress = `case ${Math.min(rows.length + 1, planned)} of ${planned}`;
    } else if (!mine && browser?.progress) {
      progress = String(browser.progress);
    } else if (current) {
      progress = current.length > 60 ? `${current.slice(0, 57)}…` : current;
    } else {
      progress = "starting";
    }
    const href = mine && ss?.id ? sessionHref(ss.id) : "#/sessions";
    return { live: true, mine, title, progress, queued, href };
  }

  /** The sidebar's run pill: a link to the live session while one runs; nothing otherwise. */
  function renderRunNow() {
    const r = liveRun();
    const pill = q$("#sb-run");
    if (!pill) return;
    pill.hidden = !r.live;
    const words = r.live ? `Running: ${r.title}. ${r.progress}, ${r.queued} queued` : "";
    setHtml(pill, r.live
      ? `<a class="sb-run is-live" href="${h(r.href)}" title="${h(words)}" aria-label="${h(words)}. ${r.mine ? "Open the session" : "Open sessions"}">` +
        `<span class="sb-run-dot" aria-hidden="true"></span>` +
        `<span class="sb-run-text"><span class="sb-run-title">Running · ${h(r.title)}</span>` +
        `<span class="sb-run-line">${h(r.progress)} · ${num(r.queued)} queued</span></span>` +
        icon("chevron-right", "sb-run-chev") +
        `</a>`
      : "");
  }

  // ── the sidebar's counts ─────────────────────────────────────────────────
  function setBadge(link, n, cls, label) {
    if (!link) return;
    let badge = link.querySelector(".nav-badge");
    if (!n) {
      badge?.remove();
      link.removeAttribute("aria-label");
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      link.appendChild(badge);
    }
    badge.className = `nav-badge ${cls}`;
    badge.textContent = String(n);
    badge.title = label;
    link.setAttribute("aria-label", label);
  }

  /** "No longer open": the Bugs page's Open list hides FIXED, NOT A BUG and Duplicate Issue (bugs.js). */
  const CLOSED = /fixed|closed|won.t fix|not a bug|duplicate/i;
  const isProduct = (g) => g.kind === "product_defect" || g.kind === "contradiction";
  let defects = null;

  async function loadDefects() {
    try {
      const [findings, triage] = await Promise.all([
        getJson("/api/findings"),
        getJson("/api/bug-triage").catch(() => ({ triage: {} })),
      ]);
      const t = triage?.triage ?? {};
      // The PO suite's written-up findings count only on their own account (bugs.js).
      const forHere = (g) => !g.curated || (window.spineBugs?.curatedForClient?.(g.curated.client) ?? true);
      const open = (findings.groups ?? []).filter(
        (g) => isProduct(g) && forHere(g) && !CLOSED.test(String(t[g.defectFingerprint]?.status ?? "")),
      );
      defects = {
        critical: open.filter((g) => g.severity === "critical").length,
        high: open.filter((g) => g.severity === "high").length,
      };
    } catch {
      /* the badge keeps its last count; the next refresh asks again */
    }
    const n = defects ? defects.critical + defects.high : 0;
    setBadge(q$("#sb-defects"), n, "bad", `Bugs, ${n} open critical and high`);
  }

  function renderBadges() {
    const turn = session()?.yourTurn ? 1 : 0;
    setBadge(q$("#sb-sessions"), turn, "warn", `Sessions, ${turn} waiting on your turn`);
    // app.js draws the Run tests count; this only says what the number is.
    const plan = q$('.nav-item[data-view="plan"]');
    const n = plan?.querySelector(".nav-badge")?.textContent;
    if (n) plan.setAttribute("aria-label", `Run tests, ${n} feature${n === "1" ? "" : "s"} ticked`);
    else plan?.removeAttribute("aria-label");
  }

  // ── recent sessions ──────────────────────────────────────────────────────
  let runs = null;
  let runsErr = false;

  async function loadRuns() {
    try {
      const body = await getJson("/api/runs");
      runs = Array.isArray(body.runs) ? body.runs : [];
      runsErr = false;
    } catch {
      runsErr = true;
    }
    renderRecent();
  }

  const norm = (s) => String(s ?? "").trim().toLowerCase();
  /**
   * The runs for the selected client. /api/runs carries the company's NAME
   * (browser journeys carry its id instead) and no environment, so a run
   * belongs here when either matches this client. The environment cannot be
   * filtered on, or printed, until runs record it.
   */
  function savedForClient() {
    return savedFor(runs);
  }
  /** The same, for any list of saved runs (Sessions passes its own). */
  function savedFor(list) {
    const name = norm(clientName());
    const id = clientId() != null ? String(clientId()) : "";
    return (list ?? [])
      .filter((r) => {
        const n = norm(r.companyName);
        return n && (n === name || n === id);
      })
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  }
  function companyOf(r) {
    const n = String(r.companyName ?? "").trim();
    return /^\d+$/.test(n) ? clientNameById(n) || n : n;
  }

  const shortLabel = (id) => String(read(() => featureLabel(id), id) || id).split(" › ").pop();
  /** What was asked, in words, or the run's own title. */
  function titleOf(r) {
    const q = String(r.request ?? "").trim();
    const feats = q.match(/^features:\s*(.+)$/i)?.[1];
    if (feats) {
      const list = feats.split(",").map((s) => s.trim()).filter(Boolean);
      if (!list.length) return "Selected features";
      return list.length > 1 ? `${shortLabel(list[0])} + ${list.length - 1} more` : shortLabel(list[0]);
    }
    const journey = q.match(/^browser journey:\s*(.+)$/i)?.[1];
    if (journey) return `${shortLabel(journey.trim())} (browser)`;
    return q.replace(/^(api plan|api|ui)\s*:\s*/i, "") || "Untitled run";
  }

  /**
   * The status word for a saved run, read off the counts the server recorded:
   * anything broken first, then a run that stopped, then anything not checked,
   * so a tag never reads better than the run was.
   */
  function statusOf(r) {
    const failed = Number(r.failed) || 0;
    const inc = Number(r.inconclusive) || 0;
    const passed = Number(r.passed) || 0;
    if (failed) return { word: `${num(failed)} broken`, cls: "bad" };
    const fieldFailed = Number(r.journey?.fieldChecks?.failed) || 0;
    if (fieldFailed) return { word: `${num(fieldFailed)} broken`, cls: "bad", why: `${fieldFailed} field checks failed` };
    if (r.journey?.stoppedAt) return { word: "Stopped early", cls: "grey", why: r.journey.outcome };
    if ((r.kind === "journey" || r.kind === "po" || r.kind === "plan") && inc) {
      return { word: "Stopped early", cls: "grey", why: r.headline && r.headline !== "—" ? r.headline : "The run did not finish." };
    }
    if (inc) return { word: "Not checked", cls: "warn", why: `${inc} result${inc === 1 ? "" : "s"} couldn't be checked — open the session for each reason.` };
    const ran = r.checks ?? passed + failed + inc;
    if (!ran && !passed && !r.journey?.steps) return { word: "Not checked", cls: "warn", why: "Nothing ran in this run." };
    return { word: "Worked", cls: "ok" };
  }
  const RUNNING = { word: "Running", cls: "live" };
  const YOUR_TURN = { word: "Your turn", cls: "turn", why: "It finished while you were away — open it to read it and reply." };

  function tagHtml(v) {
    const why = v.why ? ` title="${h(v.why)}"` : "";
    const sr = v.why ? `<span class="sr-only"> — ${h(v.why)}</span>` : "";
    return `<span class="tag-v tag-${v.cls}"${why}>${h(v.word)}${sr}</span>`;
  }

  /** "just now", "12m ago", "3h ago", "yesterday", "4d ago", then the date. */
  function ago(ts) {
    const t = typeof ts === "number" ? ts : Date.parse(ts);
    if (!Number.isFinite(t)) return "";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((day(new Date()) - day(new Date(t))) / 864e5);
    if (days < 1) return `${Math.floor(s / 3600)}h ago`;
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  const fullTime = (ts) => {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  };

  /**
   * This tab's session, while it is running or waiting on "Your turn". The
   * server lists a run only once it has finished (and not every kind), so
   * this row is what shows it meanwhile — for the client and environment it
   * was started on.
   */
  function localRow() {
    const ss = session();
    const t = ss?.turn;
    if (!ss?.on || !ss.id || !t || t.replay) return null;
    const live = !!ss.open;
    if (!live && !ss.yourTurn) return null;
    const tg = t.target ?? {};
    if (tg.companyId != null && String(tg.companyId) !== String(clientId())) return null;
    if (tg.env && tg.env !== envLabel()) return null;
    return {
      id: ss.id,
      startedAt: t.startedAt,
      title: oneLine(t.text) || "Untitled run",
      meta: [tg.company || clientName(), tg.env, live ? "running now" : ago(t.startedAt)].filter(Boolean).join(" · "),
      when: fullTime(t.startedAt),
      dot: live ? "is-live" : "is-turn",
      status: live ? RUNNING : YOUR_TURN,
    };
  }

  function rowHtml(x) {
    return (
      `<a class="hr-row" href="${h(sessionHref(x.id))}">` +
      `<span class="hr-dot${x.dot ? ` ${x.dot}` : ""}" aria-hidden="true"></span>` +
      `<span class="hr-main"><span class="hr-title" title="${h(x.title)}">${h(x.title)}</span>` +
      `<span class="hr-meta">${icon("globe")}<span${x.when ? ` title="${h(x.when)}"` : ""}>${h(x.meta)}</span></span></span>` +
      tagHtml(x.status) +
      `</a>`
    );
  }
  const SKELETON = Array.from({ length: 4 }, () =>
    `<div class="hr-skel" aria-hidden="true"><span class="hr-dot"></span><span class="hr-main"><span class="skel skel-t"></span><span class="skel skel-m"></span></span><span class="skel skel-tag"></span></div>`,
  ).join("");

  let rowsShown = false;
  function renderRecent() {
    const box = q$("#home-recent");
    if (!box) return;
    const local = localRow();
    if (!runs && !runsErr && !local) return; // the skeleton rows stay until the first answer
    box.setAttribute("aria-busy", "false");

    // A saved run that started after this tab's session did is that session
    // (or its follow-up): it is already the first row.
    const saved = savedForClient().filter((r) => !local || !(Date.parse(r.ts) >= local.startedAt - 5000));
    const rows = [
      ...(local ? [local] : []),
      ...saved.map((r) => ({
        id: r.id,
        title: titleOf(r),
        meta: [companyOf(r), ago(r.ts)].filter(Boolean).join(" · "),
        when: fullTime(r.ts),
        dot: "",
        status: statusOf(r),
      })),
    ].slice(0, 4);

    let html = rows.map(rowHtml).join("");
    if (runsErr && !runs) html += `<p class="home-note">Couldn't load sessions · <button type="button" data-retry="runs">Retry</button></p>`;
    else if (!rows.length) html = `<p class="home-note">No sessions yet — describe a case above to start.</p>`;
    setHtml(box, html);
    // The first rows to land come in one after another; later redraws don't.
    if (!rowsShown && rows.length) {
      rowsShown = true;
      box.classList.add("is-fresh");
      setTimeout(() => box.classList.remove("is-fresh"), 1200);
    }
  }

  // ── the request card ─────────────────────────────────────────────────────
  /** API · Browser: one on = that run type, both on = API then browser. */
  const VIA_KEY = "spine.home.via";
  const HINT = { api: "Requests only · fastest", ui: "Real Chrome, watch it live", both: "API first, then a real browser" };
  let via = { api: false, ui: true };
  const modeOf = () => (via.api && via.ui ? "both" : via.api ? "api" : "ui");
  /** A run already streaming in this tab: its session is where to type next. */
  const busy = () => !!(session()?.open || read(() => runLive, false));

  function loadVia() {
    const saved = store.get(VIA_KEY);
    if (saved === "api") via = { api: true, ui: false };
    else if (saved === "both") via = { api: true, ui: true };
    else via = { api: false, ui: true };
  }
  function syncAsk() {
    const box = q$("#home-q");
    const start = q$("#home-start");
    const hint = q$("#home-hint");
    const mode = modeOf();
    for (const b of document.querySelectorAll("#home-ask .via")) {
      const on = !!via[b.dataset.via];
      b.setAttribute("aria-pressed", String(on));
      // Turning off the only one on switches to the other; say so.
      const only = on && mode !== "both";
      if (only) b.title = `Turn off to run through ${b.dataset.via === "api" ? "the browser" : "the API"} instead`;
      else b.removeAttribute("title");
    }
    const text = busy() ? "A run is in progress · open it from the sidebar" : HINT[mode];
    if (hint && hint.textContent !== text) hint.textContent = text;
    if (start) {
      const off = !box?.value.trim() || busy();
      // It wakes with a small pop the moment there is something to run.
      if (start.disabled && !off) {
        start.classList.remove("is-ready");
        void start.offsetWidth; // restart the animation
        start.classList.add("is-ready");
      }
      start.disabled = off;
    }
  }

  /**
   * The empty box types out real cases, one after another, so a first-time
   * reader sees what can be asked without a row of example buttons. It types
   * only while the box is empty and Home is on screen; clicking in freezes it
   * on a whole example (half a sentence is no help while writing). Under
   * reduced motion it is one still example.
   */
  const EXAMPLES = [
    "Sign in as a vendor with OTP, bid below the minimum decrement, and check it's refused.",
    "Publish an RFQ to 3 vendors and check each one is invited.",
    "Try a bid with quantity 0 and check it's rejected.",
    "Create an RFQ-only event with 3 line items and publish it.",
    "Split the award across 2 vendors and check both are awarded.",
  ];
  function initTypewriter() {
    const box = q$("#home-q");
    if (!box) return;
    const whole = (i) => `e.g. ${EXAMPLES[i]}`;
    const still = read(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, false);
    let i = 0;
    box.placeholder = whole(0);
    if (still) return;
    const PREFIX = 5; // "e.g. " stays while a sentence is unwritten
    let n = whole(0).length;
    let dir = -1;
    let hold = 50; // the first example is shown whole for a moment
    let frozen = false;
    box.addEventListener("focus", () => { frozen = true; box.placeholder = whole(i); });
    box.addEventListener("blur", () => { frozen = false; n = whole(i).length; dir = -1; hold = 30; });
    setInterval(() => {
      if (frozen || box.value || !onHome() || document.hidden) return;
      if (hold > 0) { hold--; return; }
      const full = whole(i);
      if (dir > 0) {
        n += 1;
        if (n >= full.length) { n = full.length; dir = -1; hold = 50; } // about 2.5s to read it
      } else {
        n -= 3;
        if (n <= PREFIX) { n = PREFIX; dir = 1; i = (i + 1) % EXAMPLES.length; hold = 6; }
      }
      const shown = whole(i).slice(0, n);
      box.placeholder = dir > 0 && n < whole(i).length ? `${shown}▍` : shown;
    }, 50);
  }

  function initAsk() {
    const form = q$("#home-ask");
    const box = q$("#home-q");
    if (!form || !box) return;
    loadVia();
    box.addEventListener("input", syncAsk);
    for (const b of form.querySelectorAll(".via")) {
      b.addEventListener("click", () => {
        const k = b.dataset.via;
        let next = { ...via, [k]: !via[k] };
        // Never none: turning off the only one on switches to the other, so
        // the click always does something (an ignored click read as broken).
        if (!next.api && !next.ui) next = { api: k !== "api", ui: k !== "ui" };
        via = next;
        store.set(VIA_KEY, modeOf());
        syncAsk();
      });
    }
    const go = () => {
      const text = box.value.trim();
      const runBox = q$("#request");
      if (!text || busy() || !runBox || typeof runInstruction !== "function") return;
      // The Run screen's own typed-case runner does the work: same streams
      // (/api/run-case-api, /api/plan-run), same session, same reports.
      runBox.value = text;
      runInstruction(modeOf());
      const id = session()?.id;
      location.hash = id ? sessionHref(id) : "#/run";
      box.value = "";
      syncAsk();
      renderRunNow();
    };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      go();
    });
    // Enter alone is a newline (a pasted case is several lines); the modifier runs it.
    box.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        go();
      }
    });
    syncAsk();
  }

  // ── opening a session by its address: #/session/{id} ─────────────────────
  /**
   * The Run screen with that run in it (app.js shows the view; this fills
   * it). A live run in this tab is already there. A saved API run replays
   * through app.js's openRun, as the Runs list always did; a browser journey
   * or a PO run has no checks to replay, so its session is how it ended and
   * a link to its report — the record it keeps.
   */
  const sessionInHash = () => {
    const m = location.hash.match(/^#\/session\/([^/?#]+)/);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  };
  let opening = null;
  let goneFor = null; // a session id in the address that this tab could not open

  /**
   * The Run view only ever shows a session. Bare #/run with none goes Home,
   * where a case is started. A #/session/{id} this tab cannot show — one made
   * by a tab that has since reloaded, or a run that no longer exists — says so
   * (#ss-gone) instead of falling back to the old ask screen.
   */
  function syncRunView() {
    const html = document.documentElement;
    const onRun = html.dataset.view === "run";
    const ss = session();
    const id = sessionInHash();
    if (onRun && !id && !ss?.on) {
      location.replace("#/home");
      return;
    }
    const showing = !!(ss?.on && id && ss.id === id);
    const state = !onRun || !id || showing ? "" : opening === id ? "loading" : goneFor === id ? "gone" : "";
    const panel = q$("#ss-gone");
    if (panel) {
      panel.hidden = !state;
      if (state) panel.dataset.state = state;
      const title = q$("#ss-gone-title");
      const words = state === "loading" ? "Opening the session…" : "This session isn't here any more";
      if (title && title.textContent !== words) title.textContent = words;
    }
    if (state) html.dataset.sessionGone = "1";
    else delete html.dataset.sessionGone;
  }

  async function openSession() {
    const id = sessionInHash();
    const ss = session();
    if (!id || !ss || ss.id === id || opening === id) return;
    if (ss.open && ss.id) {
      // A run is streaming into the session view; replaying another there
      // would cut it off. It stays on the live one until that finishes.
      location.replace(sessionHref(ss.id));
      return;
    }
    opening = id;
    syncRunView();
    try {
      let r = (runs ?? []).find((x) => x.id === id);
      if (!r) {
        try {
          const body = await getJson("/api/runs");
          runs = Array.isArray(body.runs) ? body.runs : runs;
          r = (runs ?? []).find((x) => x.id === id);
        } catch {
          /* fall through: openRun asks for the one run itself */
        }
      }
      if (sessionInHash() !== id) return; // moved on while this was loading
      if (!r || r.kind === "api" || !r.kind) {
        // An id this tab made ("s-…") is a session from before a reload: nothing to replay.
        if (!(!r && /^s-/.test(id)) && typeof openRun === "function") await openRun(id);
        // Nothing to replay, or the run would not load: say so rather than show an empty screen.
        if (session()?.id !== id) goneFor = id;
        return;
      }
      // A test case typed and run in the browser: its steps, as they ended.
      if (r.kind === "plan") {
        await replayTyped(r, id);
        if (session()?.id !== id && sessionInHash() === id) goneFor = id;
        return;
      }
      const st = statusOf(r);
      // A journey keeps its key, so the Browser tab's "Run again" can run it again.
      const flowKey = r.kind === "journey" ? String(r.request ?? "").match(/browser journey:\s*(\S+)/i)?.[1] : null;
      ss.begin({ text: titleOf(r), mode: r.kind === "journey" ? "ui" : "api", kind: "features", replay: true, id, flowKeys: flowKey ? [flowKey] : null });
      ss.end({
        tone: { ok: "ok", bad: "bad", grey: "stop" }[st.cls] || "skip",
        title: st.why || (r.headline && r.headline !== "—" ? r.headline : st.word),
        lines: [
          r.kind === "journey" && r.steps ? `${plural(r.steps, "step", "steps")} in the browser.` : "",
          r.ts ? `Ran ${fullTime(r.ts)}.` : "",
        ],
        // The report labels carry an emoji; the words are enough here.
        links: (r.reports ?? []).map((l) => ({
          label: String(l.label).replace(/^[^A-Za-z0-9]+/, ""),
          href: l.href,
          icon: /bug/i.test(l.label) ? "bug" : "file-text",
        })),
      });
      ss.idle();
    } finally {
      if (opening === id) opening = null;
      syncRunView();
    }
  }

  /**
   * A typed browser run opened again: the turn as it was — what was asked, each
   * step with its result (and, for one the explorer worked out, its screenshot),
   * and the same closing box the live run ended on (app.js's
   * renderUiInstructResult). "Run again" runs what was typed.
   */
  async function replayTyped(r, id) {
    const ss = session();
    let rec = null;
    try {
      rec = await getJson(`/api/plan-runs/${encodeURIComponent(id)}`);
    } catch {
      rec = null;
    }
    if (sessionInHash() !== id || !ss) return;
    ss.begin({ text: rec?.ask || r.request || titleOf(r), mode: "ui", kind: "typed", replay: true, id });
    const steps = Array.isArray(rec?.steps) ? rec.steps : [];
    if (rec?.explored) {
      ss.explore({ runId: id, goal: rec.ask });
      steps.forEach((s, i) =>
        ss.exploreStep({
          n: i + 1,
          text: s.step,
          why: s.detail || "",
          status: s.status === "ok" ? "ok" : s.status === "failed" ? "failed" : "skipped",
          shot: s.shot,
          replayed: s.replayed,
        }),
      );
    } else if (steps.length) {
      ss.plan({ title: rec.title, steps: steps.map((s) => ({ step: s.step, args: s.args })), coverage: "full", via: "browser" });
      steps.forEach((s, i) => ss.planStep(i, s.status === "ok" ? "ok" : s.status === "failed" ? "bad" : "skip", s.detail || ""));
    }
    if (!rec) {
      ss.end({ tone: "skip", key: "UI", title: "This run's steps could not be loaded.", lines: r.ts ? [`Ran ${fullTime(r.ts)}.`] : [] });
    } else if (typeof renderUiInstructResult === "function") {
      renderUiInstructResult(
        steps.length ? "result" : "notrun",
        rec.explored
          ? { title: rec.title, steps, passed: rec.passed, explored: true, proof: rec.proof, reason: rec.reason, saved: rec.routeSaved }
          : { title: rec.title, steps, passed: rec.passed, reason: steps.length ? undefined : "The run stopped before its first step." },
      );
    }
    ss.idle();
  }

  // ── clicks inside Home: retry a failed load ──────────────────────────────
  function initClicks() {
    q$("#view-home")?.addEventListener("click", (e) => {
      const retry = e.target.closest("[data-retry]");
      if (!retry) return;
      e.preventDefault();
      runsErr = false;
      const box = q$("#home-recent");
      if (box) {
        box.setAttribute("aria-busy", "true");
        setHtml(box, SKELETON);
      }
      loadRuns();
    });
  }

  // ── refresh policy ───────────────────────────────────────────────────────
  let lastLoad = 0;
  function refresh() {
    lastLoad = Date.now();
    loadRuns();
    loadDefects();
  }

  let wasLive = false;
  let treeSize = 0;
  function tick() {
    syncContext();
    syncCollapseButton();
    renderRunNow();
    renderBadges();
    syncRunView(); // a session that starts or ends on the Run view takes the panel's place
    syncAsk();
    const live = liveRun().live;
    // A run just ended: its result is in the history now.
    if (wasLive && !live) setTimeout(refresh, 1500);
    wasLive = live;
    // Run titles name features the way the tree does; the tree loads after
    // Home (reading a company's setup is slow), so redraw when it lands.
    const size = read(() => featureGroups.length, 0) || 0;
    if (size !== treeSize) treeSize = size;
    // Cheap when nothing changed (setHtml), and keeps "Running" / "Your
    // turn" and the relative times current.
    renderRecent();
  }

  // ── boot: wait for app.js to know the client, then load ──────────────────
  function whenClientKnown(fn, tries = 0) {
    if (clientId() != null || tries > 100) return fn();
    setTimeout(() => whenClientKnown(fn, tries + 1), 100);
  }

  /**
   * What Sessions (public/sessions.js) reads from here, so the two pages
   * never disagree: the same status words, titles, client filter, session
   * address and environment name. Read-only.
   */
  window.spineRuns = {
    statusOf, titleOf, companyOf, envLabel, sessionHref, whenClientKnown,
    forClient: savedFor,
    RUNNING, YOUR_TURN,
  };

  function boot() {
    initTheme();
    initCollapse();
    initProfile();
    initMenus();
    initAsk();
    initTypewriter();
    initClicks();
    pollBrowser();
    setInterval(pollBrowser, 2500);
    setInterval(tick, 1000);

    // Client or environment changed: everything company-scoped is re-read.
    // Deferred a tick so app.js's own change handler has updated its state.
    const rescope = () => setTimeout(() => { syncContext(); refresh(); }, 0);
    q$("#client")?.addEventListener("change", () => {
      if (q$("#client")?.value !== "__add__") rescope();
    });
    q$("#env")?.addEventListener("change", rescope);
    q$("#env-custom")?.addEventListener("change", rescope);
    q$("#client-add-go")?.addEventListener("click", () => setTimeout(syncContext, 0));
    // An edit on the Bugs page (marking one FIXED, say) changes the red count.
    window.addEventListener("spine:bugs-changed", () => loadDefects());

    // Deferred a tick: app.js's router (registered later, after /api/clients
    // answers) is what marks the new view, and it has to run first.
    window.addEventListener("hashchange", () =>
      setTimeout(() => {
        openSession();
        syncRunView();
        if (onHome() && Date.now() - lastLoad > 4000) refresh();
      }, 0),
    );

    whenClientKnown(() => {
      syncContext();
      refresh();
      openSession();
      syncRunView();
    });
    // While Home is open, keep it current without hammering the server.
    setInterval(() => {
      if (onHome() && document.visibilityState === "visible") refresh();
    }, 60000);
  }

  boot();
})();
