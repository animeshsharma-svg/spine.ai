/**
 * "Take control" on the session's live browser.
 *
 * While a browser run is going, a button sits on the live picture. Taking
 * control pauses the run before its next step (procol-ui-tests
 * support/liveControl.ts), and the picture becomes the tester's browser
 * (Aanya, 28 Oct: "i want it to act like a real browser where user can do
 * whatever he wants"):
 *  - the mouse as it really moves: press, move, release — so double-clicks
 *    open a grid cell, hover opens a menu, drags and text selection work,
 *    right-click too; the wheel scrolls both ways (a wide grid sideways);
 *  - the keyboard with Ctrl / Cmd / Alt / Shift, and paste from their own
 *    clipboard;
 *  - a browser bar: the run's tabs (a link that opens a tab shows it), back,
 *    forward, reload and an address to open, and a new tab.
 * Everything goes to /api/live/input in the page's own pixels, in order, and
 * the run does it in its real browser. "Hand back" lets the run carry on from
 * the page as they left it; what they did is kept, so the next run that stops
 * at the same point does it itself. Handing back while the run's question
 * offering "I'll do it myself" is open answers it.
 *
 * Kept out of session.js: it finds the live picture by id and adds itself.
 */
(function () {
  const $ = (s) => document.querySelector(s);
  const state = { running: null, held: false, tabs: null };
  let typed = "";
  let typeTimer = null;
  const SPECIAL = new Set(["Enter", "Tab", "Escape", "Backspace", "Delete", "Insert", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
    "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"]);
  const NOTE = "You have the browser — use it as your own. The run waits until you hand it back.";
  const icon = (n) => `<svg class="ico" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const post = (path, body) =>
    fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json().catch(() => ({})).then((d) => ({ ok: r.ok, ...d })))
      .catch((e) => ({ ok: false, error: e.message }));

  // ── what they do goes out in order, one request at a time; moves are merged ──
  const queue = [];
  let sending = false;
  function send(events) {
    for (const e of events) {
      const last = queue[queue.length - 1];
      if (e.type === "move" && last?.type === "move" && last.pane === e.pane) queue[queue.length - 1] = e;
      else queue.push(e);
    }
    void pump();
  }
  async function pump() {
    if (sending || !queue.length) return;
    sending = true;
    const batch = queue.splice(0, 100);
    const d = await post("/api/live/input", { events: batch });
    sending = false;
    if (!d.ok && d.error) alertLine(d.error === "take control first" ? "The run isn't holding for you any more." : d.error);
    if (queue.length) void pump();
  }

  // ── the controls on the picture ──────────────────────────────────────────
  function ensureUi() {
    const panel = $("#live-frame-panel");
    if (!panel || panel.querySelector(".lc-bar")) return panel;
    panel.classList.add("lc-host");
    panel.tabIndex = -1;
    const bar = document.createElement("div");
    bar.className = "lc-bar";
    bar.innerHTML =
      `<span class="lc-note" hidden>${NOTE}</span>` +
      `<button type="button" class="lc-btn lc-take">Take control</button>`;
    panel.appendChild(bar);
    const chrome = document.createElement("div");
    chrome.className = "lc-chrome";
    chrome.hidden = true;
    chrome.innerHTML =
      `<div class="lc-tabs" role="tablist" aria-label="Tabs in the run's browser"></div>` +
      `<div class="lc-nav">` +
      `<button type="button" class="lc-ic" data-nav="back" aria-label="Back" title="Back">${icon("arrow-left")}</button>` +
      `<button type="button" class="lc-ic" data-nav="forward" aria-label="Forward" title="Forward">${icon("arrow-right")}</button>` +
      `<button type="button" class="lc-ic" data-nav="reload" aria-label="Reload" title="Reload">${icon("rotate-cw")}</button>` +
      `<form class="lc-addr">${icon("globe")}<input type="text" inputmode="url" spellcheck="false" autocomplete="off" aria-label="Address — type one and press Enter to open it" placeholder="Type an address and press Enter" /></form>` +
      `<button type="button" class="lc-btn lc-back">Hand back</button>` +
      `</div>`;
    panel.prepend(chrome);
    bar.querySelector(".lc-take").addEventListener("click", take);
    chrome.querySelector(".lc-back").addEventListener("click", handBack);
    chrome.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => send([{ type: "nav", to: b.dataset.nav }])));
    const addr = chrome.querySelector(".lc-addr");
    addr.addEventListener("submit", (e) => {
      e.preventDefault();
      const url = addr.querySelector("input").value.trim();
      if (!url) return;
      send([{ type: "nav", to: "url", url }]);
      addr.querySelector("input").blur();
      panel.focus({ preventScroll: true });
    });
    chrome.querySelector(".lc-tabs").addEventListener("click", (e) => {
      const close = e.target.closest("[data-close]");
      if (close) return send([{ type: "tab", op: "close", id: Number(close.dataset.close) }]);
      const tab = e.target.closest("[data-tab]");
      if (tab) return send([{ type: "tab", op: "show", id: Number(tab.dataset.tab) }]);
      if (e.target.closest(".lc-newtab")) send([{ type: "tab", op: "new" }]);
    });
    for (const img of [$("#live-frame"), $("#live-frame-side")]) {
      if (!img) continue;
      img.draggable = false;
      img.addEventListener("mousedown", onDown);
      img.addEventListener("mousemove", onMove);
      img.addEventListener("wheel", onWheel, { passive: false });
      img.addEventListener("contextmenu", (e) => state.held && e.preventDefault());
      img.addEventListener("dragstart", (e) => e.preventDefault());
    }
    panel.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    return panel;
  }

  function paint() {
    const panel = ensureUi();
    if (!panel) return;
    const take = panel.querySelector(".lc-take");
    const note = panel.querySelector(".lc-note");
    const chrome = panel.querySelector(".lc-chrome");
    panel.classList.toggle("lc-held", state.held);
    take.hidden = state.held || !state.running;
    note.hidden = !state.held || !note.dataset.alert;
    chrome.hidden = !state.held;
    if (state.held) paintTabs(chrome);
  }

  function paintTabs(chrome) {
    const tabs = Array.isArray(state.tabs) ? state.tabs : [];
    const box = chrome.querySelector(".lc-tabs");
    const html =
      tabs
        .map((t, i) =>
          `<span class="lc-tab${t.active ? " on" : ""}" role="tab" aria-selected="${!!t.active}">` +
          `<button type="button" class="lc-tab-b" data-tab="${t.id}" title="${h(t.url)}">${h(t.title || hostOf(t.url) || "New tab")}</button>` +
          (i ? `<button type="button" class="lc-tab-x" data-close="${t.id}" aria-label="Close this tab">${icon("x")}</button>` : "") +
          `</span>`,
        )
        .join("") + `<button type="button" class="lc-newtab" aria-label="New tab" title="New tab">${icon("plus")}</button>`;
    if (box.innerHTML !== html) box.innerHTML = html;
    const input = chrome.querySelector(".lc-addr input");
    const on = tabs.find((t) => t.active);
    if (on && document.activeElement !== input && input.value !== on.url) input.value = on.url;
  }
  const hostOf = (u) => {
    try {
      return new URL(u).host;
    } catch {
      return "";
    }
  };

  async function sync() {
    try {
      const d = await fetch("/api/live/control").then((r) => r.json());
      state.running = d.running;
      state.held = !!d.held;
      state.tabs = d.tabs ?? null;
    } catch {
      state.running = null;
    }
    paint();
  }
  // Every 2 s to know whether a run is going; faster while they hold it, so new tabs and addresses show.
  let lastSync = 0;
  setInterval(() => {
    if (document.visibilityState !== "visible" || !location.hash.startsWith("#/session")) return;
    if (Date.now() - lastSync < (state.held ? 700 : 2000)) return;
    lastSync = Date.now();
    void sync();
  }, 350);

  async function take() {
    const d = await post("/api/live/control", { held: true });
    if (!d.ok) {
      alertLine(d.error || "Couldn't take control");
      return;
    }
    state.held = true;
    paint();
    alertLine(NOTE);
    $("#live-frame-panel")?.focus({ preventScroll: true });
  }
  async function handBack() {
    flushTyping();
    while (queue.length || sending) await new Promise((r) => setTimeout(r, 50));
    await post("/api/live/control", { held: false });
    state.held = false;
    paint();
    // A question offering "I'll do it myself" that is still open: handing back answers it.
    window.spineSession?.handedBack?.();
  }
  function alertLine(text) {
    const note = $("#live-frame-panel .lc-note");
    if (!note) return;
    note.textContent = text;
    note.dataset.alert = "1";
    note.hidden = false;
    clearTimeout(alertLine.t);
    alertLine.t = setTimeout(() => {
      delete note.dataset.alert;
      paint();
    }, 3500);
  }

  // ── from the picture to the page's pixels (the picture is letterboxed) ────
  function toPage(img, clientX, clientY, clamp = false) {
    const r = img.getBoundingClientRect();
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return null;
    const scale = Math.min(r.width / nw, r.height / nh);
    const ox = (r.width - nw * scale) / 2, oy = (r.height - nh * scale) / 2;
    let x = (clientX - r.left - ox) / scale, y = (clientY - r.top - oy) / scale;
    if (clamp) {
      x = Math.max(0, Math.min(nw - 1, x));
      y = Math.max(0, Math.min(nh - 1, y));
    }
    return x >= 0 && y >= 0 && x <= nw && y <= nh ? { x: Math.round(x), y: Math.round(y), scale } : null;
  }
  const paneOf = (img) => (img.id === "live-frame-side" ? { pane: "side" } : {});
  const BUTTON = ["left", "middle", "right"];

  // ── the mouse: down, every move (hover too), up — with the real click count ──
  let press = null;
  let lastMove = 0;
  function onDown(e) {
    if (!state.held) return;
    const img = e.currentTarget;
    const p = toPage(img, e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault(); // no picture drag, no selecting the dashboard
    flushTyping();
    $("#live-frame-panel")?.focus({ preventScroll: true });
    if (document.activeElement?.closest?.(".lc-addr")) document.activeElement.blur();
    press = { img, button: BUTTON[e.button] || "left", count: Math.max(1, Math.min(3, e.detail || 1)) };
    ripple($("#live-frame-panel"), e.clientX, e.clientY);
    send([{ type: "move", x: p.x, y: p.y, ...paneOf(img) }, { type: "down", x: p.x, y: p.y, button: press.button, clickCount: press.count, ...paneOf(img) }]);
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onUp, { once: true });
  }
  function onDragMove(e) {
    if (!press || Date.now() - lastMove < 30) return;
    lastMove = Date.now();
    const p = toPage(press.img, e.clientX, e.clientY, true);
    if (p) send([{ type: "move", x: p.x, y: p.y, ...paneOf(press.img) }]);
  }
  function onUp(e) {
    window.removeEventListener("mousemove", onDragMove);
    if (!press) return;
    const p = toPage(press.img, e.clientX, e.clientY, true);
    if (p) send([{ type: "up", x: p.x, y: p.y, button: press.button, clickCount: press.count, ...paneOf(press.img) }]);
    press = null;
  }
  // Pointing without pressing: hover menus and tooltips open as they would.
  function onMove(e) {
    if (!state.held || press || Date.now() - lastMove < 60) return;
    lastMove = Date.now();
    const p = toPage(e.currentTarget, e.clientX, e.clientY);
    if (p) send([{ type: "move", x: p.x, y: p.y, ...paneOf(e.currentTarget) }]);
  }

  let wheel = null;
  let wheelTimer = null;
  function onWheel(e) {
    if (!state.held) return;
    e.preventDefault();
    const p = toPage(e.currentTarget, e.clientX, e.clientY);
    if (!p) return;
    // Shift + wheel scrolls sideways, as in a browser.
    const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) / p.scale;
    const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY / p.scale;
    if (!wheel) wheel = { x: p.x, y: p.y, dx: 0, dy: 0, ...paneOf(e.currentTarget) };
    wheel.dx += dx;
    wheel.dy += dy;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      send([{ type: "wheel", ...wheel, dx: Math.round(wheel.dx), dy: Math.round(wheel.dy) }]);
      wheel = null;
    }, 90);
  }

  // ── the keyboard ─────────────────────────────────────────────────────────
  function onKey(e) {
    if (!state.held || e.isComposing) return;
    if (e.target.closest?.(".lc-chrome")) return; // the address bar and its buttons are the dashboard's own
    const mods = [e.ctrlKey && "Control", e.metaKey && "Meta", e.altKey && "Alt"].filter(Boolean);
    if (mods.length) {
      // Paste comes as their clipboard's text (the paste event below); everything else is pressed as is.
      if (!e.altKey && (e.key === "v" || e.key === "V")) return;
      if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return;
      e.preventDefault();
      flushTyping();
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key === " " ? "Space" : e.key;
      send([{ type: "key", key: [...mods, e.shiftKey && "Shift", key].filter(Boolean).join("+") }]);
      return;
    }
    if (e.key.length === 1) {
      e.preventDefault();
      typed += e.key;
      clearTimeout(typeTimer);
      typeTimer = setTimeout(flushTyping, 200);
    } else if (SPECIAL.has(e.key)) {
      e.preventDefault();
      flushTyping();
      send([{ type: "key", key: e.shiftKey && e.key === "Tab" ? "Shift+Tab" : e.shiftKey && e.key.startsWith("Arrow") ? `Shift+${e.key}` : e.key }]);
    }
  }
  function onPaste(e) {
    const panel = $("#live-frame-panel");
    if (!state.held || !panel || !panel.contains(document.activeElement) || document.activeElement?.closest?.(".lc-chrome")) return;
    const text = e.clipboardData?.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    flushTyping();
    send([{ type: "type", text: text.slice(0, 2000) }]);
  }
  function flushTyping() {
    clearTimeout(typeTimer);
    if (!typed) return;
    const text = typed;
    typed = "";
    send([{ type: "type", text }]);
  }

  function ripple(host, x, y) {
    if (!host) return;
    const r = host.getBoundingClientRect();
    const dot = document.createElement("span");
    dot.className = "lc-ripple";
    dot.style.left = `${x - r.left}px`;
    dot.style.top = `${y - r.top}px`;
    host.appendChild(dot);
    setTimeout(() => dot.remove(), 600);
  }

  window.spineLiveControl = { take, handBack, get held() { return state.held; }, get running() { return state.running; } };
})();
