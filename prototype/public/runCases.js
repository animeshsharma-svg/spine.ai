/**
 * TEST CASES FROM A RUN — the "Test cases" tab beside Browser and Requests.
 *
 * Aanya, 27 Oct: "the test cases should be visible in the tab right to the
 * requests, make testcases and give testcases there, good and colorful, less
 * content". So they no longer open as a big table in the conversation.
 *
 * When a run ends here, what its turn shows (the ask, every narrated step and
 * how it ended, as the reader sees it) and the run ids on its DONE box go to
 * /api/run-cases (src/routes/runCases.ts), which writes cases grounded in that
 * run: the main flow with this run's result, variations reused from the case
 * library where one fits, and a regression case per failure. They show in the
 * tab as small cards, coloured by type and by result; a card opens to its
 * steps, where the test case and its expected result can be edited. Each card
 * runs as the next turn of this session, and its Pass or Fail waits for a
 * person to approve or change it. Export (Excel, CSV) takes the kept cases.
 * The set is kept with the run on the server, with every result and edit:
 * asking again shows it as it was left, and "Write again" makes a fresh set in
 * which each case already run keeps its result.
 *
 * The DONE box keeps one button, "Test cases", which opens the tab on that
 * turn's set. A turn started from the tab (a case being run) gets no set of
 * its own: the tab stays on the set the case came from.
 *
 * Kept out of session.js on purpose: it watches the thread for DONE boxes and
 * the run's end, so the session screen only needed the tab itself.
 */
(function () {
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  /** The export's columns: [header, value, width]. */
  const COLUMNS = [
    ["Scenario ID", (c) => c.scenarioId || "", 11],
    ["Test scenario", (c) => c.scenarioTitle || "", 44],
    ["Scenario covers", (c) => c.scenarioCovers || "", 40],
    ["Test case ID", (c) => c.id, 12],
    ["Module", (c) => c.module, 16],
    ["Feature", (c) => c.feature, 18],
    ["Test case", (c) => c.scenario, 48],
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

  const ico = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const $ = (id) => document.getElementById(id);

  // ── what the tab shows ────────────────────────────────────────────────────
  /** The set on show, the one being written, and how the reader left the tab. */
  const TAB = { set: null, writing: null, error: null, sid: undefined, filter: "all", openCards: new Set() };
  /** Every set written or opened on this page, by run key. */
  const BY_KEY = new Map();
  /** The instructions of cases run from the tab: their turns get no set of their own. */
  const CASE_TEXTS = new Set();

  function showTab() {
    const show = $("ss-show-right");
    if (show && !show.hidden) show.click();
    document.querySelector('.ss-tab[data-tab="cases"]')?.click();
  }
  /** A turn that ran and finished: the last DONE box, unless nothing was tested. */
  function doneBox(turn) {
    const boxes = turn.querySelectorAll(".ss-call");
    const box = boxes[boxes.length - 1];
    if (!box || box.classList.contains("stop")) return null;
    // Nothing ran ("Not tested": the step-writing AI did not answer, a pasted
    // list was not run…): there is nothing to write test cases from (21 Oct).
    if (box.classList.contains("skip") && /^\s*not tested\s*$/i.test(box.querySelector(".ss-call-tag")?.textContent || "")) return null;
    return box;
  }
  // The live turn is told by its instruction (its element is used again for the next turn); a turn kept above, by its mark.
  const caseTurn = (turn) => (turn.id === "ss-turn" ? CASE_TEXTS.has(window.spineSession?.turn?.text || "") : turn.dataset.fromCases === "1");

  // ── the button on every finished turn, and the run's end ──────────────────
  let wasOpen = false;
  /** The turn whose run just ended here, until its DONE box shows (it can land a moment after the run ends). */
  let ended = null;
  function decorate() {
    const ss = window.spineSession;
    // Another session opened (or Back to the start): the tab starts empty again.
    if (ss?.id !== TAB.sid) {
      TAB.sid = ss?.id;
      Object.assign(TAB, { set: null, writing: null, error: null, filter: "all" });
      TAB.openCards.clear();
      paintTab();
    }
    for (const turn of document.querySelectorAll("#view-run .ss-turn, #view-run .ss-past")) {
      const box = doneBox(turn);
      if (!box) continue;
      let btn = box.querySelector(".rc-open");
      if (btn && btn._rc) continue;
      // A turn kept above as it ended is a copy, and a copy's button has no listener: give it one.
      if (!btn) {
        if (!turn.classList.contains("ss-turn")) continue;
        let row = box.querySelector(".ss-call-links");
        if (!row) {
          row = document.createElement("div");
          row.className = "ss-call-links";
          box.appendChild(row);
        }
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "rc-open";
        btn.innerHTML = `${ico("file-text")}Test cases`;
        row.appendChild(btn);
      }
      btn._rc = true;
      btn.addEventListener("click", () => {
        showTab();
        open(turn);
      });
    }
    // Only once the run is over: a Both run's API box arrives while the browser part still runs.
    const live = !!ss?.open;
    const current = $("ss-turn");
    for (const b of document.querySelectorAll("#view-run .rc-open")) b.hidden = live && !!current?.contains(b);
    if (current) {
      if (caseTurn(current)) current.dataset.fromCases = "1";
      else delete current.dataset.fromCases;
    }
    // A run that just ended here: its cases are written now, so they are ready in the tab.
    if (wasOpen && !live && current && !caseTurn(current)) ended = { turn: current, at: Date.now() };
    if (live || (ended && Date.now() - ended.at > 15_000)) ended = null;
    if (ended && doneBox(ended.turn)) {
      const turn = ended.turn;
      ended = null;
      open(turn, { quiet: true });
    }
    wasOpen = live;
    paintCount();
  }
  // At most every 400 ms: the live view changes the page several times a second, and re-reading every
  // result box on each change slowed the whole page down (27 Oct, "too slow the whole platform").
  let rcTimer = 0;
  new MutationObserver(() => {
    if (!rcTimer) rcTimer = setTimeout(() => ((rcTimer = 0), decorate()), 400);
  }).observe(document.body, { childList: true, subtree: true });
  setInterval(decorate, 1500);
  // The tab opened with nothing in it: the latest finished turn's cases.
  document.addEventListener("click", (e) => {
    if (!e.target.closest?.('.ss-tab[data-tab="cases"]') || TAB.set || TAB.writing) return;
    if (window.spineSession?.open) return paintTab();
    const turns = [...document.querySelectorAll("#view-run .ss-turn, #view-run .ss-past")].filter((t) => doneBox(t) && !caseTurn(t));
    if (turns.length) open(turns[turns.length - 1]);
    else paintTab();
  });

  // ── what the run showed ───────────────────────────────────────────────────
  function gather(turn) {
    const clone = turn.cloneNode(true);
    clone.querySelectorAll(".rc-panel, .ss-call-links, details:not([open]), script, style").forEach((n) => n.remove());
    const transcript = (turn.innerText || clone.textContent || "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^(test cases|write test cases from this run|full report|bugs from this run|export bugs from this run|ui run report|raw output)/i.test(l))
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

  // ── asking for them ───────────────────────────────────────────────────────
  /** Show a turn's cases in the tab: the set already on this page, else the one kept with the run, else a new one. */
  function open(turn, how = {}) {
    const source = gather(turn);
    const had = source.key && BY_KEY.get(source.key);
    if (had) {
      if (how.quiet && TAB.set === had) return;
      TAB.set = had;
      TAB.error = null;
      return paintTab();
    }
    if (TAB.writing?.source.key && TAB.writing.source.key === source.key) return;
    write(source);
  }

  async function write(source, fresh = false) {
    const job = { source, fresh };
    TAB.writing = job;
    TAB.error = null;
    paintTab();
    try {
      // A result or edit still waiting to be saved goes first, so what comes back has it.
      await flushSaves();
      const body = JSON.stringify({ ...source, fresh });
      const ask = () => fetch("/api/run-cases", { method: "POST", headers: { "content-type": "application/json" }, body });
      let res;
      try {
        res = await ask();
      } catch (e) {
        // "Failed to fetch": the connection dropped before an answer came (seen
        // on 14 Oct after a passing run; the same request answered fine moments
        // later). Send it once more, rather than ending on an error.
        if (!(e instanceof TypeError)) throw e;
        res = await ask();
      }
      const d = await res.json();
      if (!res.ok || !Array.isArray(d.cases) || !d.cases.length) throw new Error(d.error || "no test cases came back");
      if (TAB.writing !== job) return; // another session or turn took the tab meanwhile
      const set = {
        key: d.key || source.key || "",
        savedAt: d.savedAt || (d.key ? new Date().toISOString() : ""),
        cases: d.cases.map((c) => ({ ...c, keep: c.keep !== false, unconfirmed: /\(to confirm\)/i.test(c.expected || "") })),
        note: d.note || "",
        ask: source.ask || "run",
        source,
      };
      if (set.key) BY_KEY.set(set.key, set);
      TAB.set = set;
      TAB.writing = null;
      TAB.openCards.clear();
      paintTab();
    } catch (e) {
      if (TAB.writing !== job) return;
      TAB.writing = null;
      TAB.error = { why: e instanceof TypeError ? "the connection to spine.ai dropped twice (is the dashboard server running?)" : e.message, source, fresh };
      paintTab();
    }
  }

  // ── kept with the run ─────────────────────────────────────────────────────
  const pending = new Map(); // set → { t, go }
  /** Save the set as it stands; typing waits a moment, a result is saved at once. */
  function save(set, now = false) {
    if (!set.key) return Promise.resolve();
    clearTimeout(pending.get(set)?.t);
    const go = () => {
      pending.delete(set);
      set.savedAt = new Date().toISOString();
      const cases = set.cases.map(({ run, unconfirmed, ...c }) => c);
      return fetch("/api/run-cases", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: set.key, cases }) }).catch(() => {});
    };
    if (now) return go();
    pending.set(set, { t: setTimeout(go, 700), go });
    return Promise.resolve();
  }
  function flushSaves() {
    return Promise.all([...pending.values()].map((p) => (clearTimeout(p.t), p.go())));
  }

  // ── a person signs off every verdict ──────────────────────────────────────
  /**
   * HUMAN IN THE LOOP. A Pass or Fail that spine.ai gave — the run's own main
   * flow, or a case run from here — is its verdict, not the answer: it waits
   * for a person to approve it or change it, and the card, the tally and the
   * export say who did and when. Running a case again sends it back for review.
   */
  const verdictNeedsReview = (c) => /^(pass|fail)/i.test(c.status || "");
  const waitsForReview = (c) => verdictNeedsReview(c) && !c.run && (!c.review?.state || c.review.state === "pending");
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

  // ── the tab ───────────────────────────────────────────────────────────────
  const TYPES = ["Positive", "Negative", "Boundary", "Edge", "Regression"];
  const TYPE_TONE = { Positive: "pos", Negative: "neg", Edge: "edge", Boundary: "bnd", Regression: "reg" };
  /** The writer's **bold** as bold, everything else escaped. */
  const rich = (s) => h(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  const isSuggested = (c) => /^suggested$/i.test(c.status || "");
  /** pass · fail · warn (not tested, stopped) · run · queue · todo (suggested) */
  function state(c) {
    if (c.run?.state === "running") return "run";
    if (c.run?.state === "queued") return "queue";
    if (/^pass/i.test(c.status || "")) return "pass";
    if (/^fail/i.test(c.status || "")) return "fail";
    if (/not tested|not reached|not run|stopped/i.test(c.status || "")) return "warn";
    return "todo";
  }
  const STATE_WORD = { run: "Running…", queue: "Queued", todo: "Suggested" };

  function paintCount() {
    const n = $("ss-tc-n");
    if (!n) return;
    const text = TAB.writing ? "…" : TAB.set ? String(TAB.set.cases.length) : "";
    if (n.textContent !== text) n.textContent = text;
  }

  function paintTab() {
    paintCount();
    const root = $("ss-tc");
    if (!root) return;
    const scroller = root.querySelector(".tc-list");
    const top = scroller?.scrollTop ?? 0;
    if (TAB.writing) {
      root.innerHTML =
        `<div class="tc-wait" role="status"><span class="tc-spark">${ico("file-text")}</span>` +
        `<b>${TAB.writing.fresh ? "Writing a fresh set" : "Writing test cases"} from this run</b><span>Usually under a minute.</span></div>` +
        `<div class="tc-list tc-ghosts" aria-hidden="true">${"<i></i>".repeat(5)}</div>`;
      return;
    }
    if (TAB.error) {
      root.innerHTML = `<div class="tc-wait tc-err" role="alert"><b>Couldn't write test cases</b><span>${h(TAB.error.why)}</span><button type="button" class="tc-btn" data-act="retry">${ico("rotate-cw")}Try again</button></div>`;
      root.querySelector('[data-act="retry"]').addEventListener("click", () => write(TAB.error.source, TAB.error.fresh));
      return;
    }
    const set = TAB.set;
    if (!set) {
      root.innerHTML = `<div class="tc-wait tc-empty"><span class="tc-spark">${ico("file-text")}</span><b>No test cases yet</b><span>${window.spineSession?.open ? "They are written as soon as this run ends." : "They are written from a run when it ends."}</span></div>`;
      return;
    }
    const cases = set.cases;
    const tally = { pass: 0, fail: 0, warn: 0, todo: 0, run: 0, queue: 0 };
    for (const c of cases) tally[state(c)]++;
    const kinds = TYPES.map((k) => [k, cases.filter((c) => c.type === k).length]).filter(([, n]) => n);
    if (TAB.filter !== "all" && !kinds.some(([k]) => k === TAB.filter)) TAB.filter = "all";
    const review = cases.filter(waitsForReview).length;
    const sug = cases.filter((c) => isSuggested(c) && !c.run).length;
    const seg = (k, label) => (tally[k] ? `<i class="s-${k}" style="flex:${tally[k]}" title="${tally[k]} ${label}"></i>` : "");
    const key = (k, label) => (tally[k] ? `<span class="tc-key s-${k}"><i></i>${tally[k]} ${label}</span>` : "");

    // Scenarios, each with its cases, in the order each first appears; a set written before scenarios existed is one unnamed group.
    const groups = [];
    cases.forEach((c, i) => {
      if (TAB.filter !== "all" && c.type !== TAB.filter) return;
      const id = c.scenarioId || "";
      let g = groups.find((x) => x.id === id);
      if (!g) groups.push((g = { id, title: c.scenarioTitle || "", idx: [] }));
      g.idx.push(i);
    });

    root.innerHTML =
      `<div class="tc-top">` +
      `<div class="tc-title"><h3>Test cases</h3><span class="tc-ask" title="${h(set.ask)}">${h(set.ask)}</span></div>` +
      `<div class="tc-meter" aria-label="${tally.pass} passed, ${tally.fail} failed, ${tally.todo} not run yet">${seg("pass", "passed")}${seg("fail", "failed")}${seg("warn", "not tested")}${seg("run", "running")}${seg("queue", "queued")}${seg("todo", "not run yet")}</div>` +
      `<div class="tc-keys">${key("pass", "passed")}${key("fail", "failed")}${key("warn", "not tested")}${key("run", "running")}${key("queue", "queued")}${key("todo", "suggested")}` +
      (review ? `<span class="tc-key s-review">${ico("hourglass")}${review} to review</span>` : "") +
      `</div>` +
      `<div class="tc-filters" role="group" aria-label="Show">` +
      `<button type="button" class="tc-chip${TAB.filter === "all" ? " on" : ""}" data-f="all">All <b>${cases.length}</b></button>` +
      kinds.map(([k, n]) => `<button type="button" class="tc-chip t-${TYPE_TONE[k]}${TAB.filter === k ? " on" : ""}" data-f="${k}">${k} <b>${n}</b></button>`).join("") +
      `</div>` +
      (set.note ? `<p class="tc-note">${h(set.note)}</p>` : "") +
      `</div>` +
      `<div class="tc-list">` +
      groups
        .map(
          (g) =>
            (g.id && groups.length > 1 ? `<div class="tc-group"><span>${h(g.id)}</span>${h(g.title)}</div>` : "") +
            g.idx.map((i) => card(cases[i], i)).join(""),
        )
        .join("") +
      `</div>` +
      `<div class="tc-foot">` +
      `<button type="button" class="tc-btn primary" data-act="runall"${sug ? "" : " disabled"}>${ico("play")}Run all suggested<span class="tc-n">${sug}</span></button>` +
      `<span class="tc-tools">` +
      `<button type="button" class="tc-icon" data-x="xlsx" title="Export as Excel" aria-label="Export as Excel">${ico("download")}<span>Excel</span></button>` +
      `<button type="button" class="tc-icon" data-x="csv" title="Export as CSV" aria-label="Export as CSV">${ico("download")}<span>CSV</span></button>` +
      `<button type="button" class="tc-icon" data-act="again" title="Write the cases again from this run (cases you have run keep their result)" aria-label="Write again">${ico("rotate-cw")}<span>Write again</span></button>` +
      `</span></div>`;

    const list = root.querySelector(".tc-list");
    list.scrollTop = top;
    root.querySelectorAll(".tc-chip").forEach((b) =>
      b.addEventListener("click", () => {
        TAB.filter = b.dataset.f;
        paintTab();
      }),
    );
    root.querySelectorAll(".tc-card").forEach((el) => wire(set, el));
    root.querySelector('[data-act="runall"]').addEventListener("click", () => enqueue(set, cases.map((c, i) => (isSuggested(c) && !c.run ? i : -1)).filter((i) => i >= 0)));
    const name = () => {
      const ask = set.ask.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      return `spine-test-cases-${ask || "run"}-${new Date().toISOString().slice(0, 10)}`;
    };
    root.querySelectorAll("[data-x]").forEach((b) =>
      b.addEventListener("click", () => {
        const rows = cases.filter((c) => c.keep);
        if (b.dataset.x === "xlsx" && window.spineBugExport?.xlsx) window.spineBugExport.xlsx(rows, { name: name(), sheet: "Test cases", columns: COLUMNS });
        else csv(rows, name());
      }),
    );
    root.querySelector('[data-act="again"]').addEventListener("click", () => set.source && write(set.source, true));
  }

  /** One case: type, id and priority; what it tests; what should happen; its result and one action. */
  function card(c, i) {
    const st = state(c);
    const opened = TAB.openCards.has(i);
    const word = STATE_WORD[st] || c.status || "Suggested";
    const action =
      st === "run"
        ? `<button type="button" class="tc-link" data-act="watch">Watch in Browser</button>`
        : st === "queue"
          ? `<button type="button" class="tc-link" data-act="unqueue">Don't run</button>`
          : `<button type="button" class="tc-run" data-act="run" title="${c.testedAt || !isSuggested(c) ? "Run again" : "Run"}">${ico(c.testedAt || !isSuggested(c) ? "rotate-cw" : "play")}${c.testedAt || !isSuggested(c) ? "Again" : "Run"}</button>`;
    const r = c.review;
    const reviewed = verdictNeedsReview(c) && !c.run && (r?.state === "approved" || r?.state === "changed");
    return (
      `<article class="tc-card t-${TYPE_TONE[c.type] || "none"} s-${st}${opened ? " open" : ""}${c.keep ? "" : " off"}" data-i="${i}">` +
      `<div class="tc-row"><span class="tc-type">${h(c.type || "Case")}</span><span class="tc-id">${h(c.id)}</span>${c.priority ? `<span class="tc-pri">${h(c.priority)}</span>` : ""}` +
      `<span class="tc-st s-${st}">${h(word)}</span></div>` +
      `<p class="tc-name"${opened ? ` contenteditable="true" spellcheck="true" data-f="scenario" aria-label="Test case"` : ""}>${rich(c.scenario)}</p>` +
      `<p class="tc-exp"><span aria-hidden="true">→</span><span${opened ? ` contenteditable="true" spellcheck="true" data-f="expected" aria-label="Expected result"` : ""}>${rich(c.expected)}</span></p>` +
      (c.why && st !== "todo" ? `<p class="tc-why">${h(c.why)}</p>` : "") +
      (waitsForReview(c)
        ? `<div class="tc-review"><span>Is this ${h(c.status)} right?</span><button type="button" class="tc-btn ok" data-act="approve">${ico("check")}Approve</button><button type="button" class="tc-btn ghost" data-act="flip">Change to ${/^pass/i.test(c.status) ? "Fail" : "Pass"}</button></div>`
        : reviewed
          ? `<p class="tc-reviewed">${ico("check")}${h(reviewWords(c))}</p>`
          : "") +
      `<div class="tc-acts">${action}<button type="button" class="tc-link" data-act="more" aria-expanded="${opened}">${opened ? "Less" : "Steps"}</button>` +
      (c.runId ? `<a class="tc-link" href="#/session/${encodeURIComponent(c.runId)}">See the run</a>` : "") +
      `</div>` +
      (opened
        ? `<div class="tc-detail">` +
          (c.preconditions ? `<p><b>Before</b> ${h(c.preconditions)}</p>` : "") +
          (c.steps?.length ? `<ol>${c.steps.map((s) => `<li>${rich(s)}</li>`).join("")}</ol>` : "") +
          (c.testData ? `<p><b>Data</b> ${h(c.testData)}</p>` : "") +
          `<label class="tc-keep"><input type="checkbox"${c.keep ? " checked" : ""}> In the export</label>` +
          `</div>`
        : "") +
      `</article>`
    );
  }

  function wire(set, el) {
    const i = Number(el.dataset.i);
    const c = set.cases[i];
    const on = (act, fn) => el.querySelector(`[data-act="${act}"]`)?.addEventListener("click", fn);
    on("run", () => enqueue(set, [i]));
    on("unqueue", () => unqueue(set, i));
    on("watch", () => document.querySelector('.ss-tab[data-tab="browser"]')?.click());
    on("more", () => {
      if (TAB.openCards.has(i)) TAB.openCards.delete(i);
      else TAB.openCards.add(i);
      paintTab();
    });
    on("approve", () => {
      c.review = { state: "approved", by: reviewer(), at: new Date().toISOString() };
      save(set, true);
      repaint(set);
    });
    on("flip", () => {
      const to = /^pass/i.test(c.status) ? "Fail" : "Pass";
      c.review = { state: "changed", by: reviewer(), at: new Date().toISOString(), from: c.status };
      c.status = to;
      save(set, true);
      repaint(set);
    });
    el.querySelectorAll("[contenteditable][data-f]").forEach((ed) =>
      ed.addEventListener("input", () => {
        c[ed.dataset.f] = ed.textContent.trim();
        save(set);
      }),
    );
    el.querySelector(".tc-keep input")?.addEventListener("change", (e) => {
      c.keep = e.target.checked;
      el.classList.toggle("off", !c.keep);
      save(set);
    });
  }

  function repaint(set) {
    if (TAB.set === set) paintTab();
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
    const text = caseText(c);
    CASE_TEXTS.add(text);
    repaint(job.set);
    const started = ss.runCase({
      display: `Run ${c.id}: ${c.scenario}`,
      text,
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
