/**
 * "Write test cases from this run" — a button under a finished run's DONE box.
 *
 * It sends what the run's turn shows (the ask, every narrated step and how it
 * ended, as the reader sees it) and the run ids on the box to /api/run-cases
 * (src/routes/runCases.ts), which writes cases grounded in that run: the main
 * flow with this run's result, variations reused from the case library where
 * one fits, and a regression case per failure. They come back as a table to
 * review — tick, edit the scenario or expected result, remove — and only the
 * ticked rows are exported, as Excel (the bug sheet's writer, bugsExport.js)
 * or CSV. The set is kept with the run on the server, with every result, edit
 * and tick: asking again shows it as it was left, and "Write again" makes a
 * fresh set in which each case already run keeps its result.
 *
 * Kept out of session.js on purpose: it watches the thread for DONE boxes, so
 * the session screen needs no change to carry it.
 */
(function () {
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  /** The export's columns: [header, value, width]. */
  const COLUMNS = [
    ["ID", (c) => c.id, 9],
    ["Module", (c) => c.module, 16],
    ["Feature", (c) => c.feature, 18],
    ["Scenario", (c) => c.scenario, 48],
    ["Preconditions", (c) => c.preconditions, 34],
    ["Steps", (c) => c.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"), 60],
    ["Test data", (c) => c.testData, 26],
    ["Expected result", (c) => c.expected, 48],
    ["Priority", (c) => c.priority, 9],
    ["Type", (c) => c.type, 12],
    ["Layer", (c) => c.layer, 8],
    ["Source step", (c) => c.sourceStep, 28],
    ["Automated in spine", (c) => c.automated, 20],
    ["Status", (c) => c.status, 14],
    ["Result", (c) => c.why || "", 40],
    ["Tested", (c) => (c.testedAt ? new Date(c.testedAt).toLocaleString() : ""), 18],
    ["Reviewed", (c) => reviewWords(c), 30],
    ["Run", (c) => (c.runId ? `${location.origin}/#/session/${c.runId}` : ""), 30],
    ["Library case", (c) => c.libraryId || (c.similarTo ? `similar to ${c.similarTo}` : ""), 18],
  ];

  // ── the button, on every finished turn's last DONE box ─────────────────────
  function decorate() {
    // A turn kept above as it ended is a copy, and a copy's button has no
    // listener: give it one, so "Write test cases" works on earlier turns too.
    for (const btn of document.querySelectorAll("#view-run .rc-open")) {
      if (btn._rc) continue;
      const box = btn.closest(".ss-call");
      const turn = btn.closest(".ss-turn, .ss-past");
      if (!box || !turn) continue;
      btn._rc = true;
      btn.addEventListener("click", () => write(turn, box, btn));
    }
    for (const turn of document.querySelectorAll("#view-run .ss-turn")) {
      const boxes = turn.querySelectorAll(".ss-call");
      const box = boxes[boxes.length - 1];
      if (!box || box.classList.contains("stop") || box.querySelector(".rc-open")) continue;
      let row = box.querySelector(".ss-call-links");
      if (!row) {
        row = document.createElement("div");
        row.className = "ss-call-links";
        box.appendChild(row);
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rc-open";
      btn.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-file-text"/></svg>Write test cases from this run`;
      btn._rc = true;
      btn.addEventListener("click", () => write(turn, box, btn));
      row.appendChild(btn);
    }
    // Only once the run is over: a Both run's API box arrives while the browser part still runs.
    const live = !!window.spineSession?.open;
    const current = document.getElementById("ss-turn");
    for (const b of document.querySelectorAll("#view-run .rc-open")) b.hidden = live && !!current?.contains(b);
  }
  new MutationObserver(() => decorate()).observe(document.body, { childList: true, subtree: true });
  setInterval(decorate, 1500);

  // ── what the run showed ───────────────────────────────────────────────────
  function gather(turn) {
    const clone = turn.cloneNode(true);
    clone.querySelectorAll(".rc-panel, .ss-call-links, details:not([open]), script, style").forEach((n) => n.remove());
    const transcript = (turn.innerText || clone.textContent || "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^(write test cases from this run|full report|bugs from this run|export bugs from this run|ui run report|raw output)/i.test(l))
      .join("\n");
    const runIds = new Set();
    for (const a of turn.querySelectorAll("a[href], [data-bugs-export]")) {
      const id = a.getAttribute("data-bugs-export") || (a.getAttribute("href") || "").match(/[?&]run=([^&#]+)/)?.[1];
      if (id) runIds.add(decodeURIComponent(id));
    }
    const t = turn.id === "ss-turn" ? window.spineSession?.turn : null;
    // Which run this is — the cases are kept under it (data/run-cases/<key>.json).
    const key = turn.dataset.runId || t?.runId || [...runIds][0] || "";
    return {
      key,
      transcript: transcript.slice(0, 16000),
      ask: turn.querySelector(".ss-user")?.textContent?.trim() || "",
      mode: t?.mode || turn.dataset.mode || "",
      kind: t?.kind || turn.dataset.kind || "",
      company: t?.target?.company || "",
      runIds: [...runIds].slice(0, 4),
    };
  }

  // ── asking for them, and the table to review them in ─────────────────────
  async function write(turn, box, btn, fresh = false) {
    let panel = box.nextElementSibling?.classList.contains("rc-panel") ? box.nextElementSibling : null;
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "rc-panel";
      panel.setAttribute("aria-label", "Test cases from this run");
      box.after(panel);
    }
    btn.disabled = true;
    panel.innerHTML = fresh
      ? `<p class="rc-wait" role="status"><span class="rc-dot"></span>Writing a fresh set of test cases from this run. Cases you have already run keep their result. This usually takes under a minute.</p>`
      : `<p class="rc-wait" role="status"><span class="rc-dot"></span>Getting the test cases for this run — written now if this run has none yet, which usually takes under a minute.</p>`;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    try {
      // A result or edit still waiting to be saved goes first, so what comes back has it.
      await flushSaves();
      const body = JSON.stringify({ ...gather(turn), fresh });
      const ask = () => fetch("/api/run-cases", { method: "POST", headers: { "content-type": "application/json" }, body });
      let res;
      try {
        res = await ask();
      } catch (e) {
        // "Failed to fetch": the connection dropped before an answer came (seen
        // on 14 Oct after a passing run; the same request answered fine moments
        // later). Say so and send it once more, rather than ending on an error.
        if (!(e instanceof TypeError)) throw e;
        const wait = panel.querySelector(".rc-wait");
        if (wait) wait.innerHTML = `<span class="rc-dot"></span>The connection dropped before the cases came back — retrying once. This can take up to a minute.`;
        res = await ask();
      }
      const d = await res.json();
      if (!res.ok || !Array.isArray(d.cases) || !d.cases.length) throw new Error(d.error || "no test cases came back");
      render(panel, d, turn);
    } catch (e) {
      const why = e instanceof TypeError ? "the connection to spine.ai dropped twice (is the dashboard server running?)" : e.message;
      panel.innerHTML = `<p class="rc-error" role="alert">Couldn't write test cases: ${h(why)}. <button type="button" class="rc-link">Try again</button></p>`;
      panel.querySelector(".rc-link").addEventListener("click", () => write(turn, box, btn, fresh));
    } finally {
      btn.disabled = false;
    }
  }

  const TYPE_TONE = { Positive: "pos", Negative: "neg", Edge: "edge", Regression: "reg" };
  /** The writer's **bold** as bold, everything else escaped. */
  const rich = (s) => h(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  /** Pass green, Fail red, not reached amber, suggested neutral. */
  const statusTone = (st) => (/^pass/i.test(st) ? "ok" : /^fail/i.test(st) ? "bad" : /not reached|not run/i.test(st) ? "warn" : "");

  /**
   * THE CASES, KEPT — so they can be run.
   *
   * A suggested case is an idea the run did not try. Each one can now be run
   * from here: it becomes the next turn of this session (the chat narrates it,
   * the browser panel shows it, Sessions keeps it), and its Status becomes what
   * that run found — Pass, Fail, Not tested — with a link to the run. Run one,
   * every suggested case, or the ticked ones; they go one at a time, since the
   * browser is one. The table is drawn from this state, so it can be drawn
   * again wherever it sits once the turn it belongs to is kept above.
   */
  const SETS = new Map();
  let setNo = 0;

  function render(panel, d, turn) {
    const set = {
      id: `rc${++setNo}`,
      key: d.key || "",
      savedAt: d.savedAt || (d.key ? new Date().toISOString() : ""),
      cases: d.cases.map((c) => ({ ...c, keep: c.keep !== false, unconfirmed: /\(to confirm\)/i.test(c.expected || "") })),
      note: d.note || "",
      ask: turn.querySelector(".ss-user")?.textContent?.trim() || "run",
    };
    SETS.set(set.id, set);
    panel.dataset.set = set.id;
    paint(panel, set);
  }

  // ── kept with the run ─────────────────────────────────────────────────────
  const pending = new Map(); // set id → { t, go }
  /** Save the table as it stands; typing waits a moment, a result is saved at once. */
  function save(set, now = false) {
    if (!set.key) return Promise.resolve();
    clearTimeout(pending.get(set.id)?.t);
    const go = () => {
      pending.delete(set.id);
      set.savedAt = new Date().toISOString();
      const cases = set.cases.map(({ run, unconfirmed, ...c }) => c);
      return fetch("/api/run-cases", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: set.key, cases }) }).catch(() => {});
    };
    if (now) return go();
    pending.set(set.id, { t: setTimeout(go, 700), go });
    return Promise.resolve();
  }
  function flushSaves() {
    return Promise.all([...pending.values()].map((p) => (clearTimeout(p.t), p.go())));
  }
  const clock = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  /** Every place this set's table is on the page (the turn it came from may now be kept above). */
  function repaint(set) {
    for (const panel of document.querySelectorAll(`.rc-panel[data-set="${set.id}"]`)) paint(panel, set);
  }

  const isSuggested = (c) => /^suggested$/i.test(c.status || "");
  const ico = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const RESULT_TONE = { Pass: "ok", Fail: "bad", "Not tested": "warn", Stopped: "warn" };

  // ── a person signs off every verdict ──────────────────────────────────────
  /**
   * HUMAN IN THE LOOP. A Pass or Fail that spine.ai gave — the run's own main
   * flow, or a case run from here — is its verdict, not the answer: it waits
   * for a person to approve it or change it, and the table, the tally and the
   * export say who did and when. Running a case again sends it back for review.
   */
  const verdictNeedsReview = (c) => /^(pass|fail)/i.test(c.status || "");
  const reviewer = () => {
    try {
      const u = window.spineAuth?.user?.();
      return (u?.name || u?.email || "").trim() || "a tester";
    } catch {
      return "a tester";
    }
  };
  function reviewWords(c) {
    if (!verdictNeedsReview(c)) return "";
    const r = c.review;
    if (!r?.state || r.state === "pending") return "Waiting for review";
    const when = r.at ? new Date(r.at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    return r.state === "approved" ? `Approved by ${r.by}${when ? ` · ${when}` : ""}` : `Changed from ${r.from} to ${c.status} by ${r.by}${when ? ` · ${when}` : ""}`;
  }
  function reviewCell(c, i) {
    if (!verdictNeedsReview(c) || c.run) return "";
    const r = c.review;
    if (r?.state === "approved" || r?.state === "changed") return `<div class="rc-rev done">${ico("check")}${h(reviewWords(c))}</div>`;
    const other = /^pass/i.test(c.status) ? "Fail" : "Pass";
    return (
      `<div class="rc-rev wait"><span class="rc-rev-t">Waiting for your review</span>` +
      `<span class="rc-rev-b"><button type="button" class="rc-btn rc-ok" data-i="${i}">Approve</button>` +
      `<button type="button" class="rc-btn ghost rc-flip" data-i="${i}" data-to="${other}">Change to ${other}</button></span></div>`
    );
  }

  function resultCell(c, i) {
    const r = c.run?.state;
    if (r === "running") return `<span class="rc-st run">Running…</span><div class="rc-src">watch it below</div>`;
    if (r === "queued") return `<span class="rc-st">Queued</span><button type="button" class="rc-link rc-unq" data-i="${i}">Don't run</button>`;
    const tone = RESULT_TONE[c.status] ?? statusTone(c.status);
    return (
      `<span class="rc-st ${tone}">${h(c.status)}</span>` +
      (c.why ? `<div class="rc-why">${h(c.why)}</div>` : "") +
      (c.runId ? `<a class="rc-src rc-go" href="#/session/${encodeURIComponent(c.runId)}">See the run</a>` : c.sourceStep ? `<div class="rc-src">from ${h(c.sourceStep)}</div>` : "") +
      reviewCell(c, i) +
      `<button type="button" class="rc-run" data-i="${i}">${ico(c.testedAt || !isSuggested(c) ? "rotate-cw" : "play")}${c.testedAt || !isSuggested(c) ? "Run again" : "Run"}</button>`
    );
  }

  function paint(panel, set) {
    const cases = set.cases;
    const kinds = ["Positive", "Negative", "Edge", "Regression"].map((k) => [k, cases.filter((c) => c.type === k).length]).filter(([, n]) => n);
    const tested = cases.filter((c) => c.testedAt);
    const passed = tested.filter((c) => c.status === "Pass").length;
    panel.innerHTML =
      `<div class="rc-head"><h3>Test cases from this run</h3>` +
      `<p class="rc-sum">${cases.length} cases · ${kinds.map(([k, n]) => `${n} ${k.toLowerCase()}`).join(" · ")}. ` +
      `“Suggested” cases have not been run yet — run them here to turn each into a Pass or Fail. Scenario and expected result are editable before a run or export.</p>` +
      (tested.length ? `<p class="rc-tally">${tested.length} run from here: ${passed} passed, ${tested.length - passed} did not.</p>` : "") +
      (() => {
        const verdicts = cases.filter(verdictNeedsReview);
        const waiting = verdicts.filter((c) => !c.review?.state || c.review.state === "pending").length;
        return verdicts.length ? `<p class="rc-tally ${waiting ? "rc-wait-n" : ""}">${waiting ? `${waiting} of ${verdicts.length} verdicts waiting for your review` : `All ${verdicts.length} verdicts reviewed`}</p>` : "";
      })() +
      (set.key ? `<p class="rc-sum rc-kept">Saved with this run${set.savedAt ? ` · updated ${h(clock(set.savedAt))}` : ""}. “Write again” makes a fresh set; cases you have run keep their result.</p>` : "") +
      (set.note ? `<p class="rc-note">${h(set.note)}</p>` : "") +
      `</div>` +
      `<div class="rc-scroll"><table class="rc-table"><colgroup><col class="w-c"><col class="w-case"><col class="w-exp"><col class="w-res"></colgroup><thead><tr>` +
      `<th class="rc-c"><input type="checkbox" class="rc-all" aria-label="Select all"></th>` +
      `<th>Test case</th><th>Expected result</th><th>Result</th>` +
      `</tr></thead><tbody>` +
      cases
        .map(
          (c, i) =>
            `<tr data-i="${i}" class="${c.keep ? "" : "off"}${c.run?.state === "running" ? " running" : ""}">` +
            `<td class="rc-c"><input type="checkbox" class="rc-keep"${c.keep ? " checked" : ""} aria-label="Select ${h(c.id)}"></td>` +
            `<td class="rc-case">` +
            `<div class="rc-line"><span class="rc-id">${h(c.id)}</span><span class="rc-tag ${TYPE_TONE[c.type] || ""}">${h(c.type)}</span><span class="rc-pri">${h(c.priority)}</span></div>` +
            `<div class="rc-edit rc-scen" contenteditable="true" data-f="scenario" spellcheck="true" aria-label="Scenario">${rich(c.scenario)}</div>` +
            `<button type="button" class="rc-more" aria-expanded="false">Steps & details</button>` +
            `<div class="rc-detail" hidden>` +
            (c.preconditions ? `<p><b>Before:</b> ${h(c.preconditions)}</p>` : "") +
            `<ol>${(c.steps || []).map((st) => `<li>${rich(st)}</li>`).join("")}</ol>` +
            (c.testData ? `<p><b>Test data:</b> ${h(c.testData)}</p>` : "") +
            `<p class="rc-meta">${h([c.module, c.feature, c.layer, c.automated].filter(Boolean).join(" · "))}${c.libraryId ? ` · library ${h(c.libraryId)}` : c.similarTo ? ` · similar to ${h(c.similarTo)}` : ""}</p>` +
            `</div></td>` +
            `<td class="rc-exp"><span class="rc-lbl">Expected result</span><div class="rc-edit" contenteditable="true" data-f="expected" spellcheck="true" aria-label="Expected result">${rich(c.expected)}</div></td>` +
            `<td class="rc-res"><span class="rc-lbl">Result</span>${resultCell(c, i)}</td>` +
            `</tr>`,
        )
        .join("") +
      `</tbody></table></div>` +
      `<div class="rc-bar">` +
      `<div class="rc-runs">` +
      `<button type="button" class="rc-btn primary rc-runall">${ico("play")}Run all suggested<span class="rc-n"></span></button>` +
      `<button type="button" class="rc-btn rc-runsel">${ico("play")}Run ticked<span class="rc-n"></span></button>` +
      `</div>` +
      `<div class="rc-tools"><span class="rc-count" aria-live="polite"></span>` +
      `<button type="button" class="rc-btn ghost" data-x="xlsx" title="Export the ticked cases as an Excel sheet">${ico("download")}Excel</button>` +
      `<button type="button" class="rc-btn ghost" data-x="csv" title="Export the ticked cases as CSV">${ico("download")}CSV</button>` +
      `<button type="button" class="rc-btn ghost rc-again" title="Write the cases again from this run">${ico("rotate-cw")}Write again</button>` +
      `</div></div>` +
      `<p class="rc-hint">Cases run one at a time in the browser on ${h(window.spineSession?.turn?.target?.company || "this client")}, each as the next message in this session. ` +
      `A case that publishes creates a real event in UAT, and publishing emails the vendors it invites.</p>`;

    const count = () => {
      const n = cases.filter((c) => c.keep).length;
      const sug = cases.filter((c) => isSuggested(c) && !c.run).length;
      const ticked = cases.filter((c) => c.keep && !c.run).length;
      panel.querySelector(".rc-count").textContent = `${n} of ${cases.length} ticked`;
      panel.querySelectorAll(".rc-btn[data-x]").forEach((b) => (b.disabled = !n));
      const all = panel.querySelector(".rc-all");
      all.checked = n === cases.length;
      all.indeterminate = n > 0 && n < cases.length;
      const ra = panel.querySelector(".rc-runall");
      ra.querySelector(".rc-n").textContent = String(sug);
      ra.disabled = !sug;
      const rs = panel.querySelector(".rc-runsel");
      rs.querySelector(".rc-n").textContent = String(ticked);
      rs.disabled = !ticked;
    };
    panel.querySelectorAll("tbody tr").forEach((tr) => {
      const i = Number(tr.dataset.i);
      const c = cases[i];
      tr.querySelector(".rc-keep").addEventListener("change", (e) => {
        c.keep = e.target.checked;
        tr.classList.toggle("off", !c.keep);
        count();
        save(set);
      });
      tr.querySelectorAll(".rc-edit").forEach((ed) =>
        ed.addEventListener("input", () => {
          c[ed.dataset.f] = ed.textContent.trim();
          save(set);
        }),
      );
      const more = tr.querySelector(".rc-more");
      more.addEventListener("click", () => {
        const det = tr.querySelector(".rc-detail");
        det.hidden = !det.hidden;
        more.setAttribute("aria-expanded", String(!det.hidden));
      });
      tr.querySelector(".rc-run")?.addEventListener("click", () => enqueue(set, [i]));
      tr.querySelector(".rc-ok")?.addEventListener("click", () => {
        c.review = { state: "approved", by: reviewer(), at: new Date().toISOString() };
        save(set, true);
        repaint(set);
      });
      tr.querySelector(".rc-flip")?.addEventListener("click", (e) => {
        const to = e.currentTarget.dataset.to;
        c.review = { state: "changed", by: reviewer(), at: new Date().toISOString(), from: c.status };
        c.status = to;
        save(set, true);
        repaint(set);
      });
      tr.querySelector(".rc-unq")?.addEventListener("click", () => unqueue(set, i));
    });
    panel.querySelector(".rc-all").addEventListener("change", (e) => {
      for (const c of cases) c.keep = e.target.checked;
      panel.querySelectorAll(".rc-keep").forEach((b) => (b.checked = e.target.checked));
      panel.querySelectorAll("tbody tr").forEach((tr) => tr.classList.toggle("off", !e.target.checked));
      count();
      save(set);
    });
    panel.querySelector(".rc-runall").addEventListener("click", () => enqueue(set, cases.map((c, i) => (isSuggested(c) && !c.run ? i : -1)).filter((i) => i >= 0)));
    panel.querySelector(".rc-runsel").addEventListener("click", () => enqueue(set, cases.map((c, i) => (c.keep && !c.run ? i : -1)).filter((i) => i >= 0)));
    const name = () => {
      const ask = set.ask.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      return `spine-test-cases-${ask || "run"}-${new Date().toISOString().slice(0, 10)}`;
    };
    panel.querySelectorAll(".rc-btn[data-x]").forEach((b) =>
      b.addEventListener("click", () => {
        const rows = cases.filter((c) => c.keep);
        if (b.dataset.x === "xlsx" && window.spineBugExport?.xlsx) window.spineBugExport.xlsx(rows, { name: name(), sheet: "Test cases", columns: COLUMNS });
        else csv(rows, name());
      }),
    );
    panel.querySelector(".rc-again").addEventListener("click", () => {
      const box = panel.previousElementSibling;
      const btn = box?.querySelector(".rc-open");
      const turn = panel.closest(".ss-turn, .ss-past");
      if (box && btn && turn) write(turn, box, btn, true);
    });
    count();
  }

  // ── running cases, one at a time ──────────────────────────────────────────
  const queue = [];
  let current = null;

  /** One case as the instruction the browser run compiles: what to do, and what should happen. */
  function caseText(c) {
    const out = [`${String(c.scenario || "").replace(/[.\s]+$/, "")}.`];
    if (c.preconditions) out.push(`Preconditions: ${c.preconditions}`);
    if (c.steps?.length) out.push(`Steps: ${c.steps.map((st, i) => `${i + 1}. ${st}`).join(" ")}`);
    if (c.testData) out.push(`Test data: ${c.testData}`);
    if (c.expected) out.push(`Expected result: ${String(c.expected).replace(/\s*\(to confirm\)\s*$/i, "")}`);
    return out.join("\n");
  }

  function enqueue(set, idx) {
    for (const i of idx) {
      const c = set.cases[i];
      if (!c || c.run) continue;
      c.run = { state: "queued" };
      queue.push({ set, i });
    }
    repaint(set);
    pump();
  }
  function unqueue(set, i) {
    const at = queue.findIndex((q) => q.set === set && q.i === i);
    if (at >= 0) queue.splice(at, 1);
    set.cases[i].run = null;
    repaint(set);
  }
  function cancelQueue() {
    const touched = new Set();
    for (const q of queue.splice(0)) {
      q.set.cases[q.i].run = null;
      touched.add(q.set);
    }
    for (const set of touched) repaint(set);
    if (current) repaint(current.set);
  }

  /** Start the next case once nothing else is running in this session. */
  function pump() {
    if (current || !queue.length) return;
    const ss = window.spineSession;
    if (!ss?.runCase || ss.open) {
      setTimeout(pump, 1500);
      return;
    }
    const job = queue.shift();
    const c = job.set.cases[job.i];
    c.run = { state: "running" };
    current = job;
    repaint(job.set);
    const started = ss.runCase({
      display: `Run ${c.id}: ${c.scenario}`,
      text: caseText(c),
      mode: /^api$/i.test(c.layer || "") ? "api" : "ui",
      onEnd: (o) => done(job, o),
    });
    if (!started) {
      c.run = { state: "queued" };
      queue.unshift(job);
      current = null;
      repaint(job.set);
      setTimeout(pump, 1500);
    }
  }

  /** The case's run ended: its status is the run's answer. */
  function done(job, o) {
    const c = job.set.cases[job.i];
    c.status = o.tone === "ok" ? "Pass" : o.tone === "bad" ? "Fail" : o.tone === "stop" ? "Stopped" : "Not tested";
    c.why =
      (o.title || "").trim() +
      (c.status === "Fail" && c.unconfirmed ? " Its expected result was marked “to confirm” — check whether the app is wrong or the expectation was." : "");
    c.runId = o.runId || null;
    c.testedAt = new Date().toISOString();
    c.automated = "Yes — run from spine";
    c.review = verdictNeedsReview(c) ? { state: "pending" } : undefined;
    c.run = null;
    current = null;
    // A stopped run stops the list: the rest waits for the reader.
    if (o.tone === "stop") cancelQueue();
    // Kept with the run, so asking for this run's cases again shows this result.
    save(job.set, true);
    repaint(job.set);
    setTimeout(pump, 800);
  }

  function csv(rows, name) {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const text = [COLUMNS.map(([k]) => cell(k)).join(","), ...rows.map((r) => COLUMNS.map(([, get]) => cell(get(r))).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${name}.csv` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
})();
