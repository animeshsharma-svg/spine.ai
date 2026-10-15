/**
 * "Take control" on the session's live browser.
 *
 * While a browser run is going, a button sits on the live picture. Taking
 * control pauses the run before its next step (procol-ui-tests
 * support/liveControl.ts); the tester then clicks, types, presses keys and
 * scrolls on the picture, and each is done in the run's real browser at the
 * same spot (/api/live/input, in the page's own pixels). "Hand back" lets the
 * run carry on from the page as they left it. Every input shows in the run's
 * steps as "You clicked …", so a run that needed a person says so.
 *
 * Kept out of session.js: it finds the live picture by id and adds itself.
 */
(function () {
  const $ = (s) => document.querySelector(s);
  const state = { running: null, held: false };
  let typed = "";
  let typeTimer = null;
  const SPECIAL = new Set(["Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);

  const post = (path, body) =>
    fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json().catch(() => ({})).then((d) => ({ ok: r.ok, ...d })))
      .catch((e) => ({ ok: false, error: e.message }));

  // ── the controls on the picture ──────────────────────────────────────────
  function ensureUi() {
    const panel = $("#live-frame-panel");
    if (!panel || panel.querySelector(".lc-bar")) return panel;
    panel.classList.add("lc-host");
    panel.tabIndex = -1;
    const bar = document.createElement("div");
    bar.className = "lc-bar";
    bar.innerHTML =
      `<span class="lc-note" hidden>You have the browser — click and type on the picture. The run waits.</span>` +
      `<button type="button" class="lc-btn lc-take">Take control</button>` +
      `<button type="button" class="lc-btn lc-back" hidden>Hand back</button>`;
    panel.appendChild(bar);
    bar.querySelector(".lc-take").addEventListener("click", take);
    bar.querySelector(".lc-back").addEventListener("click", handBack);
    const img = $("#live-frame");
    img?.addEventListener("click", onClick);
    img?.addEventListener("wheel", onWheel, { passive: false });
    panel.addEventListener("keydown", onKey);
    return panel;
  }

  function paint() {
    const panel = ensureUi();
    if (!panel) return;
    const take = panel.querySelector(".lc-take");
    const back = panel.querySelector(".lc-back");
    const note = panel.querySelector(".lc-note");
    panel.classList.toggle("lc-held", state.held);
    take.hidden = state.held || !state.running;
    back.hidden = !state.held;
    note.hidden = !state.held;
  }

  async function sync() {
    try {
      const d = await fetch("/api/live/control").then((r) => r.json());
      state.running = d.running;
      state.held = !!d.held;
    } catch {
      state.running = null;
    }
    paint();
  }
  setInterval(() => {
    if (document.visibilityState === "visible" && location.hash.startsWith("#/session")) sync();
  }, 2000);

  async function take() {
    const d = await post("/api/live/control", { held: true });
    if (!d.ok) {
      alertLine(d.error || "Couldn't take control");
      return;
    }
    state.held = true;
    paint();
    $("#live-frame-panel")?.focus();
  }
  async function handBack() {
    flushTyping();
    await post("/api/live/control", { held: false });
    state.held = false;
    paint();
  }
  function alertLine(text) {
    const note = $("#live-frame-panel .lc-note");
    if (!note) return;
    note.hidden = false;
    note.textContent = text;
    setTimeout(() => {
      note.textContent = "You have the browser — click and type on the picture. The run waits.";
      paint();
    }, 3000);
  }

  // ── from the picture to the page's pixels (the picture is letterboxed) ────
  function toPage(img, clientX, clientY) {
    const r = img.getBoundingClientRect();
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return null;
    const scale = Math.min(r.width / nw, r.height / nh);
    const ox = (r.width - nw * scale) / 2, oy = (r.height - nh * scale) / 2;
    const x = (clientX - r.left - ox) / scale, y = (clientY - r.top - oy) / scale;
    return x >= 0 && y >= 0 && x <= nw && y <= nh ? { x: Math.round(x), y: Math.round(y), scale } : null;
  }

  function send(events) {
    return post("/api/live/input", { events });
  }

  function onClick(e) {
    if (!state.held) return;
    const p = toPage(e.currentTarget, e.clientX, e.clientY);
    if (!p) return;
    flushTyping();
    ripple(e.currentTarget.parentElement, e.clientX, e.clientY);
    send([{ type: "click", x: p.x, y: p.y }]);
    $("#live-frame-panel")?.focus();
  }

  let wheelDy = 0;
  let wheelTimer = null;
  function onWheel(e) {
    if (!state.held) return;
    e.preventDefault();
    const p = toPage(e.currentTarget, e.clientX, e.clientY);
    wheelDy += e.deltaY / (p?.scale || 1);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      send([{ type: "wheel", dy: Math.round(wheelDy) }]);
      wheelDy = 0;
    }, 120);
  }

  function onKey(e) {
    if (!state.held || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.length === 1) {
      e.preventDefault();
      typed += e.key;
      clearTimeout(typeTimer);
      typeTimer = setTimeout(flushTyping, 250);
    } else if (SPECIAL.has(e.key)) {
      e.preventDefault();
      flushTyping();
      send([{ type: "key", key: e.key === "Tab" && e.shiftKey ? "Shift+Tab" : e.key }]);
    }
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
