/**
 * SAVE OR DISCARD A RUN — two small buttons at the end of every finished run (Aanya, 27 Oct: "for
 * each run, give the option to save the run and discard if it is not useful, minimal buttons").
 *
 *   Save     keeps the run on purpose: a star in Sessions and its "Saved" filter (POST /api/run-save).
 *            Pressed again it is unsaved.
 *   Discard  removes the run from Sessions, its reports and the bug counts (/api/run-delete, the same
 *            delete as Sessions' bin), after one inline "Discard? Yes · No" — no dialog.
 *
 * They sit beside "Write test cases from this run" on the turn's last result box, once the run is
 * over, and find the run the way runCases.js does: the turn's run id, the session's, or a report link.
 */
(function () {
  let saved = null; // { runId: { at } } — read once, kept in step with each press
  const loadSaved = async () => {
    if (saved) return saved;
    saved = await fetch("/api/run-save", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((b) => b?.saved ?? {})
      .catch(() => ({}));
    return saved;
  };

  function runIdOf(turn) {
    const live = turn.id === "ss-turn" ? window.spineSession?.turn : null;
    if (turn.dataset.runId) return turn.dataset.runId;
    if (live?.runId) return live.runId;
    for (const a of turn.querySelectorAll("a[href], [data-bugs-export]")) {
      const id = a.getAttribute("data-bugs-export") || (a.getAttribute("href") || "").match(/[?&]run=([^&#]+)/)?.[1];
      if (id) return decodeURIComponent(id);
    }
    // A saved session opened from Sessions: its id is in the address.
    const m = location.hash.match(/^#\/session\/([^/?#]+)/);
    return m && !/^s-/.test(m[1]) ? decodeURIComponent(m[1]) : "";
  }

  const ico = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  function paint(wrap, id) {
    const on = !!saved?.[id];
    wrap.innerHTML =
      `<button type="button" class="rk-btn rk-save${on ? " on" : ""}" aria-pressed="${on}" title="${on ? "Saved — press to unsave" : "Keep this run: a star in Sessions, and its Saved filter"}">${on ? "★ Saved" : "☆ Save"}</button>` +
      `<button type="button" class="rk-btn rk-discard" title="Remove this run from Sessions, its reports and the bug counts">${ico("trash")}Discard</button>`;
  }

  async function onClick(e) {
    const btn = e.target.closest(".rk-btn, .rk-yes, .rk-no");
    if (!btn) return;
    const wrap = btn.closest(".rk");
    const id = wrap?.dataset.run;
    if (!id) return;
    if (btn.classList.contains("rk-save")) {
      const want = !saved?.[id];
      btn.disabled = true;
      const ok = await fetch("/api/run-save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ run: id, saved: want }) })
        .then((r) => r.ok)
        .catch(() => false);
      if (ok) {
        if (want) saved[id] = { at: new Date().toISOString() };
        else delete saved[id];
      }
      paint(wrap, id);
      return;
    }
    if (btn.classList.contains("rk-discard")) {
      wrap.innerHTML = `<span class="rk-q">Discard this run?</span><button type="button" class="rk-yes">Yes</button><button type="button" class="rk-no">No</button>`;
      wrap.querySelector(".rk-no")?.focus();
      return;
    }
    if (btn.classList.contains("rk-no")) return paint(wrap, id);
    if (btn.classList.contains("rk-yes")) {
      btn.disabled = true;
      const ok = await fetch(`/api/run-delete?run=${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => !!b?.deleted)
        .catch(() => false);
      if (saved) delete saved[id];
      // Only a past turn is faded: #ss-turn is one element every new run reuses, so a fade there
      // greyed out the next run too (27 Oct, "why has it become so light shaded").
      const turn = wrap.closest(".ss-past");
      if (ok) {
        turn?.classList.add("rk-gone");
        wrap.innerHTML = `<span class="rk-q">Discarded — removed from Sessions and its reports.</span>`;
      } else {
        wrap.innerHTML = `<span class="rk-q">This run could not be discarded — it may not be saved yet.</span>`;
        setTimeout(() => paint(wrap, id), 4000);
      }
    }
  }

  async function decorate() {
    const live = !!window.spineSession?.open;
    const current = document.getElementById("ss-turn");
    const boxes = [];
    for (const turn of document.querySelectorAll("#view-run .ss-turn, #view-run .ss-past")) {
      const calls = turn.querySelectorAll(".ss-call");
      const box = calls[calls.length - 1];
      if (!box || box.querySelector(".rk")) continue;
      // Only once the run is over.
      if (live && current?.contains(box)) continue;
      const id = runIdOf(turn);
      if (!id) continue;
      boxes.push([box, id]);
    }
    if (!boxes.length) return;
    await loadSaved();
    for (const [box, id] of boxes) {
      if (box.querySelector(".rk")) continue;
      let row = box.querySelector(".ss-call-links");
      if (!row) {
        row = document.createElement("div");
        row.className = "ss-call-links";
        box.appendChild(row);
      }
      const wrap = document.createElement("span");
      wrap.className = "rk";
      wrap.dataset.run = id;
      paint(wrap, id);
      row.appendChild(wrap);
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest?.(".rk")) void onClick(e);
  });
  // At most every 400 ms (the live view changes the page several times a second).
  let timer = 0;
  new MutationObserver(() => {
    if (!timer) timer = setTimeout(() => ((timer = 0), void decorate()), 400);
  }).observe(document.body, { childList: true, subtree: true });
  setInterval(() => void decorate(), 1500);
})();
