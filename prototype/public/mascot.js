/**
 * THE MASCOT: spine.ai's mark, waking into a face.
 *
 * At rest it is the logo, three vertebrae. When something is being written
 * (Home's request box, the session's message box, the landing page's
 * example run), the top bar splits into two eyes, the middle one folds away
 * and the bottom one turns into a smile. It glances at what is being
 * written, blinks, scans while a run is working, hops when a run ends, and
 * settles back into the mark a few seconds after everything goes quiet.
 * Hovering it wakes it for a moment too.
 *
 * Every [data-mascot] element gets one; the attribute's value says where its
 * text is, so it knows where to look ("right" in the sidebar, "down" above
 * Home's request box). The shapes are in home.css. Decoration only:
 * aria-hidden throughout. Under reduced motion it changes face without
 * moving (home.css).
 *
 *   window.spineMascot.typing()  — something was just written
 *   window.spineMascot.busy(on, source)  — something is working; it scans until
 *                                every source has said it stopped (this tab's
 *                                run is polled from spineSession as "session")
 *   window.spineMascot.cheer()   — something finished
 */
(function () {
  "use strict";

  const SVG =
    `<svg class="mascot" viewBox="0 0 28 28" aria-hidden="true" focusable="false">` +
    `<g class="m-look">` +
    `<g class="m-eye"><rect class="m-bar m-top-l" x="8" y="7.5" width="7.5" height="3" rx="1.5"/></g>` +
    `<g class="m-eye"><rect class="m-bar m-top-r" x="12.5" y="7.5" width="7.5" height="3" rx="1.5"/></g>` +
    `</g>` +
    `<rect class="m-bar m-mid" x="10" y="12.5" width="8" height="3" rx="1.5"/>` +
    `<rect class="m-bar m-low" x="8" y="17.5" width="12" height="3" rx="1.5"/>` +
    `<path class="m-smile" d="M10.5 17.4 Q14 20.8 17.5 17.4" pathLength="1"/>` +
    `</svg>`;

  /** Where each one looks while text is being written, in the face's own units. */
  const GLANCE = { right: [1.3, 0.2], down: [0, 1.2], left: [-1.3, 0.2] };

  const all = () => [...document.querySelectorAll("[data-mascot]")];
  function upgrade(el) {
    if (el.dataset.mascotReady) return;
    el.dataset.mascotReady = "1";
    el.innerHTML = SVG;
    el.addEventListener("pointerenter", () => {
      wake();
      later("nap", 1800, nap);
    });
  }

  // ── state ────────────────────────────────────────────────────────────────
  let awake = false;
  let isBusy = false;
  const busyFrom = new Set(); // who says something is working
  const timers = {};
  const later = (name, ms, fn) => {
    clearTimeout(timers[name]);
    timers[name] = setTimeout(fn, ms);
  };

  function hop() {
    for (const el of all()) {
      el.classList.remove("is-hop");
      void el.offsetWidth; // restart the animation
      el.classList.add("is-hop");
    }
  }
  function look(dir) {
    for (const el of all()) {
      const [x, y] = dir ? GLANCE[el.dataset.mascot] ?? GLANCE.right : [0, 0];
      el.style.setProperty("--lx", `${x}px`);
      el.style.setProperty("--ly", `${y}px`);
    }
  }
  function wake() {
    if (!awake) {
      awake = true;
      for (const el of all()) el.classList.add("is-awake");
      hop();
    }
  }
  /** Back to the mark, unless there is still something to watch. */
  function nap() {
    if (isBusy || hasText()) return;
    awake = false;
    look(false);
    for (const el of all()) el.classList.remove("is-awake");
  }
  const hasText = () => ["#home-q", "#ss-msg"].some((sel) => document.querySelector(sel)?.value.trim());

  // ── what wakes it ────────────────────────────────────────────────────────
  function typing() {
    wake();
    look(true);
    later("glance", 1100, () => look(false)); // a pause in the typing: back to the middle
    later("nap", 5000, nap);
  }
  function busy(on, source = "page") {
    if (on) busyFrom.add(source);
    else busyFrom.delete(source);
    const now = busyFrom.size > 0;
    if (now === isBusy) return;
    isBusy = now;
    on = now;
    for (const el of all()) el.classList.toggle("is-busy", on);
    if (on) wake();
    else {
      cheer();
      later("nap", 4000, nap);
    }
  }
  function cheer() {
    wake();
    look(false);
    hop();
    later("nap", 3500, nap);
  }

  function boot() {
    for (const el of all()) upgrade(el);
    document.addEventListener("input", (e) => {
      if (e.target?.matches?.("#home-q, #ss-msg")) typing();
    });
    // A run in this tab keeps it awake and scanning; the end makes it hop.
    setInterval(() => {
      let open = false;
      try { open = !!window.spineSession?.open; } catch {}
      if (open !== busyFrom.has("session")) busy(open, "session");
    }, 800);
  }

  window.spineMascot = { typing, busy, cheer };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
