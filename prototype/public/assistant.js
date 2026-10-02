/**
 * THE CHAT ASSISTANT on the Run page (Phase 6).
 *
 * Someone types a test case into "Ask spine.ai" and presses
 * "Find & run this test case". The server (GET /api/assistant, server-sent
 * events) reads it, looks for written cases that already check it, runs the
 * ones it can, and — when nothing covers it — writes a draft case and the
 * automation for it. This file shows that conversation as it happens:
 *
 *   progress (Understand → Match → Resolve → Run → Build → Store)
 *   → what matched → each case's result → (or) the new draft → the reply.
 *
 * Loaded after app.js. Uses CaseView (caseView.js) for verdict pills and the
 * closed "Details" that hold anything technical.
 */
(function () {
  const CV = window.CaseView;
  const esc = CV.esc;
  const q = (s) => document.querySelector(s);

  const STEP_ORDER = ["understand", "match", "resolve", "run", "build", "store"];
  const STEP_WORD = { understand: "Understand", match: "Match", resolve: "Resolve", run: "Run", build: "Build", store: "Store" };
  const STEP_TODO = {
    understand: "Read what you typed",
    match: "Look for written test cases that already check it",
    resolve: "Work out where each matching case can run",
    run: "Run them against the product",
    build: "If nothing covers it, write the test case and its automation",
    store: "Save the new case as a draft for review",
  };
  const VERDICT_WORD = { passed: "Passed", failed: "Failed", "couldn't tell": "Couldn't tell", "not run": "Not run", partial: "Partly passed" };

  function clientId() {
    const v = q("#client")?.value;
    const n = Number(v);
    if (n > 0) return n;
    try {
      return typeof currentClient === "number" && currentClient ? currentClient : 198678;
    } catch {
      return 198678;
    }
  }

  function pill(v) {
    const word = VERDICT_WORD[v] || v || "";
    if (word === "Partly passed") return `<span class="cv-verdict unknown">Partly passed</span>`;
    return CV.verdictPill(word);
  }

  /** "Passed — the app refused it" → "the app refused it" (the chip already says Passed). */
  function stripVerdict(line) {
    return String(line || "").replace(/^(Passed|Failed|Couldn't tell|Not run here|Not run|Cannot run yet)\s+—\s+/, "");
  }
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  /** camelCase / snake_case key → "Camel case". */
  const words = (k) => cap(String(k).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase());

  /** Any object → Details rows: plain values inline, structures as a block. */
  function detailRows(obj, prefix = "") {
    if (obj == null) return [];
    if (typeof obj !== "object") return [{ label: prefix || "Value", value: String(obj) }];
    return Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length))
      .map(([k, v]) =>
        typeof v === "object"
          ? { label: words(k), value: JSON.stringify(v, null, 2), kind: "block" }
          : { label: words(k), value: String(v), kind: /request|path|route|id$/i.test(k) ? "code" : undefined },
      );
  }

  // ── state of one turn ─────────────────────────────────────────────────
  let es = null;
  let turn = null;

  function freshTurn(typed, mode) {
    return {
      typed,
      mode, // "run" | "match"
      steps: {}, // name → {status, line}
      match: null,
      plan: null,
      results: [],
      log: [],
      built: null,
      draft: null,
      draftResult: null,
      suggest: null,
      answer: null,
      fatal: "",
      finished: false,
    };
  }

  function titleOf(id) {
    const m = turn?.match;
    const all = [...(m?.same || []), ...(m?.partial || []), ...(m?.others || [])];
    return all.find((c) => c.id === id)?.title || turn?.plan?.find((t) => t.caseId === id)?.title || "";
  }

  // ── rendering ─────────────────────────────────────────────────────────
  function stepsHtml(t) {
    const decision = t.match?.decision;
    const skip = new Set();
    if (t.finished || t.answer) {
      if (decision === "existing") skip.add("build").add("store");
      else if (decision) skip.add("resolve");
    }
    if (t.mode === "match") ["resolve", "run", "build", "store"].forEach((s) => skip.add(s));
    const li = STEP_ORDER.map((name) => {
      let s = t.steps[name];
      // Drafts written earlier run their stored request without announcing a run step.
      if (!s && name === "run" && t.results.length)
        s = { status: t.finished ? "done" : "start", line: `Ran ${t.results.length} case${t.results.length === 1 ? "" : "s"}.` };
      if (!s && t.finished && !t.fatal) skip.add(name);
      if (skip.has(name) && !s) return `<li class="todo"><span class="ico">–</span><div><span class="nm">${STEP_WORD[name]}</span><span class="ln">not needed this time</span></div></li>`;
      if (!s) return `<li class="todo"><span class="ico">○</span><div><span class="nm">${STEP_WORD[name]}</span><span class="ln">${esc(STEP_TODO[name])}</span></div></li>`;
      const done = s.status === "done" || t.finished;
      const ico = done ? "✓" : `<span class="spin">⟳</span>`;
      return `<li class="${done ? "done" : "start"}"><span class="ico">${ico}</span><div><span class="nm">${STEP_WORD[name]}</span><span class="ln">${esc(CV.scrub(s.line || ""))}</span></div></li>`;
    }).join("");
    return `<ol class="sx-asteps">${li}</ol>`;
  }

  function candidateRow(c, { showMissing = false } = {}) {
    const missing = showMissing && c.missing?.length ? `<div class="w">Does not cover: ${esc(c.missing.join(", "))}</div>` : "";
    const draft = c.origin === "draft" ? ` <span class="sx-badge warn">assistant draft</span>` : "";
    return (
      `<div class="sx-match-row"><div class="t">${esc(c.title)}${draft} <span class="cv-ref">${esc(c.id)}</span></div>` +
      `<div class="w">${esc(c.why || "")}</div>${missing}</div>`
    );
  }

  function matchHtml(m) {
    if (!m) return "";
    const decisionWord = { existing: "Already covered", partial: "Partly covered", new: "Not covered yet" }[m.decision] || "";
    const decisionCls = { existing: "good", partial: "warn", new: "accent" }[m.decision] || "idle";
    const same = (m.same || []).map((c) => candidateRow(c)).join("");
    const partial = m.partial || [];
    const scoreRows = [...(m.same || []), ...partial, ...(m.others || [])].map((c) => ({
      label: `${c.id} (${c.relation || ""})`,
      value: c.scores ? Object.entries(c.scores).map(([k, v]) => `${k} ${typeof v === "number" ? v.toFixed(3) : v}`).join(" · ") : "",
      kind: "code",
    }));
    const plan = (turn?.plan || []).map((t) => ({ label: `Where ${t.caseId} runs`, value: `${t.how}${t.where ? ` — ${t.where}` : ""}${t.call ? ` · ${t.call}` : ""}`, kind: "code" }));
    const extra = [
      { label: "How it searched", value: m.memory || "" },
      { label: "AI model used", value: m.llm ? (m.llm.used ? `${m.llm.model || "yes"}${m.llm.note ? ` — ${m.llm.note}` : ""}` : `no${m.llm.reason ? ` — ${m.llm.reason}` : ""}`) : "" },
      ...(m.understood ? [{ label: "Read as", value: m.understood.normalized }] : []),
      ...(m.ms != null ? [{ label: "Took", value: `${m.ms} ms` }] : []),
      ...plan,
      ...scoreRows,
    ];
    return (
      `<div class="sx-card ${decisionCls === "good" ? "good" : decisionCls === "warn" ? "warn" : "accent"}">` +
      `<div class="sx-row"><h3 class="sx-h3 sx-grow">What already checks this</h3><span class="sx-badge ${decisionCls}">${esc(decisionWord)}</span></div>` +
      `<p class="sx-p">${esc(m.headline || "")}</p>` +
      (same ? `<span class="sx-k">The same test</span>${same}` : "") +
      (partial.length
        ? `<details class="sx-attempts" style="color:inherit"><summary style="color:var(--accent)">Covers part of it (${partial.length})</summary>${partial.map((c) => candidateRow(c, { showMissing: true })).join("")}</details>`
        : "") +
      CV.detailsHtml(extra) +
      `</div>`
    );
  }

  function resultsHtml(t) {
    if (!t.results.length && !t.log.length) return "";
    const rows = t.results
      .map((r) => {
        const title = titleOf(r.caseId);
        return (
          `<div class="sx-result">${pill(r.verdict)}<div><div><b>${esc(title || r.caseId)}</b> <span class="cv-ref">${esc(title ? r.caseId : "")}</span></div>` +
          `<div class="sx-muted">${esc(cap(stripVerdict(CV.scrub(r.line))))}</div></div>` +
          CV.detailsHtml(detailRows(r.details)) +
          `</div>`
        );
      })
      .join("");
    const running = !t.finished && t.steps.run && t.steps.run.status !== "done";
    const log = t.log.length
      ? `<details class="sx-attempts" ${running ? "open" : ""} style="color:inherit"><summary style="color:var(--accent)">Live log (${t.log.length} line${t.log.length === 1 ? "" : "s"})</summary><div class="sx-log" id="as-log">${esc(t.log.slice(-200).join("\n"))}</div></details>`
      : "";
    return `<div class="sx-card"><h3 class="sx-h3">Results</h3>${rows || `<div class="empty">Running… results appear here one case at a time.</div>`}${log}</div>`;
  }

  function builtHtml(t) {
    const b = t.built;
    if (!b) return "";
    const cov = { full: ["covers all of it", "good"], partial: ["covers part of it", "warn"], none: ["cannot cover it yet", "bad"] }[b.coverage] || [b.coverage, "idle"];
    const d = b.draft || {};
    const caseCard = CV.card(
      {
        title: d.title || "New test case",
        ref: b.id,
        type: b.layer && b.layer !== "none" ? `${b.layer.toUpperCase()} test` : "",
        priority: d.priority || "",
        preconditions: d.setup || "",
        steps: d.steps || [],
        expected: d.expected || "",
        why: d.why || "",
      },
      { noTrack: true },
    );
    const gaps = (b.gaps || []).length ? `<span class="sx-k">Not covered yet</span><ul class="sx-list">${b.gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : "";
    const api = b.api
      ? [
          { label: "API request", value: b.api.request, kind: "code" },
          { label: "Based on library case", value: b.api.basedOn || "" },
          { label: "Written by", value: b.api.generatedBy || "" },
          { label: "Expected outcome", value: typeof b.api.expected === "object" ? JSON.stringify(b.api.expected) : b.api.expected || "" },
          { label: "API covers", value: b.api.covers || "" },
          { label: "Safe to run", value: b.api.gate ? (b.api.gate.ok ? "yes" : `no — ${b.api.gate.reason || ""}`) : "" },
          { label: "Request body", value: b.api.body ? JSON.stringify(b.api.body, null, 2) : "", kind: "block" },
        ]
      : [{ label: "API part", value: b.apiSkipped ? `none — ${b.apiSkipped}` : "none" }];
    const ui = b.ui?.steps
      ? [
          { label: "UI plan", value: b.ui.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"), kind: "block" },
          { label: "UI plan coverage", value: b.ui.coverage || "" },
          { label: "UI plan gaps", value: (b.ui.gaps || []).map((g) => (typeof g === "string" ? g : g.text || JSON.stringify(g))).join("; ") },
          { label: "UI plan written by", value: b.ui.source || "" },
          { label: "How to run the UI plan", value: b.ui.executeCall || "", kind: "code" },
        ]
      : [{ label: "UI part", value: b.ui?.skipped ? `none — ${b.ui.skipped}` : "none" }];
    const file = t.draft ? [{ label: "Draft file", value: t.draft.mdFile || "", kind: "code" }, { label: "Stored in", value: t.draft.stored || "" }] : [];
    const dr = t.draftResult;
    const runLine = dr
      ? `<div class="sx-result">${pill(dr.verdict)}<div><b>The new case's API part</b><div class="sx-muted">${esc(cap(stripVerdict(CV.scrub(dr.line))))}</div></div>${CV.detailsHtml(detailRows(dr.details))}</div>`
      : "";
    return (
      `<div class="sx-card accent">` +
      `<div class="sx-row"><h3 class="sx-h3 sx-grow">This is new — here is the automation I built</h3>` +
      `<span class="sx-badge warn">Draft, needs review</span> <span class="sx-badge ${cov[1]}">Automation ${esc(cov[0])}</span></div>` +
      caseCard +
      gaps +
      (runLine ? `<span class="sx-k">Result</span>${runLine}` : "") +
      CV.detailsHtml([...api, ...ui, ...file], { label: "Details — the automation" }) +
      (t.draft ? `<p class="sx-sub">Saved as a draft (${esc(b.id)}). It joins the catalog only after someone reviews it.</p>` : "") +
      `</div>`
    );
  }

  function answerHtml(t) {
    if (t.fatal) return `<div class="sx-banner bad"><b>The assistant stopped:</b> ${esc(t.fatal)}</div>`;
    if (!t.answer) return "";
    const a = t.answer;
    const u = a.usage || {};
    const extra = [
      { label: "Took", value: a.ms != null ? `${(a.ms / 1000).toFixed(1)} s` : "" },
      { label: "AI calls", value: u.calls != null ? String(u.calls) : "" },
      { label: "Tokens", value: u.promptTokens != null ? `${u.promptTokens} in · ${u.completionTokens} out` : "" },
      { label: "Cost", value: u.usd != null ? `$${Number(u.usd).toFixed(4)}` : "" },
      { label: "Turn id", value: a.turnId || "", kind: "code" },
    ];
    return (
      `<div class="sx-card good sx-answer"><h3 class="sx-h3">spine.ai</h3>` +
      (a.paragraphs || []).map((p) => `<p>${esc(CV.scrub(p))}</p>`).join("") +
      CV.detailsHtml(extra) +
      `</div>`
    );
  }

  function render() {
    const box = q("#as-out");
    if (!box || !turn) return;
    box.hidden = false;
    const openLog = q("#as-log");
    const stuck = openLog ? openLog.scrollTop + openLog.clientHeight >= openLog.scrollHeight - 8 : true;
    const suggest = turn.suggest
      ? `<div class="sx-banner info">The closest case that can run here is <b>${esc(turn.suggest.target?.title || turn.suggest.target?.caseId || "")}</b> — ${esc(turn.suggest.why || "")}.</div>`
      : "";
    box.innerHTML =
      `<div class="sx-card"><div class="sx-row"><h3 class="sx-h3 sx-grow">${turn.mode === "match" ? "Looking for matching test cases" : "Finding and running your test case"}</h3>` +
      (turn.finished ? "" : `<button type="button" class="chip" id="as-stop">■ stop</button>`) +
      `</div><p class="sx-sub">“${esc(turn.typed)}”</p>${stepsHtml(turn)}</div>` +
      matchHtml(turn.match) +
      suggest +
      resultsHtml(turn) +
      builtHtml(turn) +
      answerHtml(turn);
    q("#as-stop")?.addEventListener("click", stop);
    const log = q("#as-log");
    if (log && stuck) log.scrollTop = log.scrollHeight;
  }

  function setBusy(on) {
    const b = q("#as-btn");
    if (b) {
      b.disabled = on;
      b.textContent = on ? "⟳ Working…" : "🔎 Find & run this test case";
    }
    const m = q("#as-match");
    if (m) m.disabled = on;
  }

  function finish() {
    if (es) {
      es.close();
      es = null;
    }
    if (turn) turn.finished = true;
    setBusy(false);
    render();
    loadDrafts();
  }

  function stop() {
    if (turn && !turn.answer && !turn.fatal) turn.fatal = "Stopped. Anything already started on the server may still finish there; nothing was restarted.";
    finish();
  }

  function typedText() {
    return (q("#request")?.value || "").trim();
  }

  // ── the full turn (server-sent events) ────────────────────────────────
  function start() {
    const typed = typedText();
    if (!typed) {
      q("#request")?.focus();
      return;
    }
    if (es) es.close();
    turn = freshTurn(typed, "run");
    setBusy(true);
    render();
    q("#as-out")?.scrollIntoView({ behavior: "smooth", block: "start" });
    es = new EventSource(`/api/assistant?q=${encodeURIComponent(typed)}&c=${clientId()}`);
    const on = (name, fn) =>
      es.addEventListener(name, (ev) => {
        let d = {};
        try {
          d = JSON.parse(ev.data);
        } catch {
          /* a malformed event is skipped */
        }
        fn(d);
        render();
      });
    on("step", (d) => {
      if (!d.name) return;
      // A step can report several times (the run step does, once per phase): the latest line wins.
      turn.steps[d.name] = { status: d.status, line: d.line };
      // Everything before this step is done by now.
      const i = STEP_ORDER.indexOf(d.name);
      for (const n of STEP_ORDER.slice(0, Math.max(0, i))) if (turn.steps[n]) turn.steps[n].status = "done";
    });
    on("match", (d) => (turn.match = d));
    on("plan", (d) => (turn.plan = d.targets || []));
    on("line", (d) => d.line && turn.log.push(String(d.line)));
    on("result", (d) => turn.results.push(d));
    on("suggest", (d) => (turn.suggest = d));
    on("built", (d) => {
      turn.built = d;
      turn.steps.build = { status: "done", line: `Wrote it up as ${d.id} and built an automation for it (${{ full: "covers all of it", partial: "covers part of it", none: "cannot cover it yet" }[d.coverage] || d.coverage}).` };
    });
    on("draft-result", (d) => (turn.draftResult = d));
    on("draft", (d) => (turn.draft = d));
    on("answer", (d) => (turn.answer = d));
    on("fatal", (d) => {
      turn.fatal = d.message || "unknown error";
      finish();
    });
    es.addEventListener("done", () => finish());
    // The endpoint is one-shot: never let EventSource reconnect and run it again.
    es.addEventListener("error", () => {
      if (!turn.finished) {
        if (!turn.answer && !turn.fatal) turn.fatal = "The connection to the assistant was lost before it finished. Nothing was restarted.";
        finish();
      }
    });
  }

  // ── match only (JSON, nothing runs) ───────────────────────────────────
  async function matchOnly() {
    const typed = typedText();
    if (!typed) {
      q("#request")?.focus();
      return;
    }
    if (es) es.close();
    turn = freshTurn(typed, "match");
    turn.steps.understand = { status: "start", line: "Reading what you typed…" };
    setBusy(true);
    render();
    try {
      const r = await fetch(`/api/assistant/match?q=${encodeURIComponent(typed)}&llm=0`);
      const m = await r.json();
      if (!r.ok || m.error) throw new Error(m.error || `HTTP ${r.status}`);
      const u = m.understood || {};
      turn.steps.understand = { status: "done", line: `I read it as: “${u.normalized || typed}”. It is about ${(u.concepts || []).map((c) => c.said).join(", ") || "nothing I recognise"}.` };
      turn.steps.match = { status: "done", line: m.headline || "" };
      turn.match = m;
      turn.answer = {
        paragraphs: [
          m.headline,
          m.decision === "existing"
            ? "Nothing was run — press “Find & run this test case” to run the matching cases."
            : "Nothing was run — press “Find & run this test case” to have the automation for it written as a draft.",
        ],
        ms: m.ms,
      };
    } catch (e) {
      turn.fatal = `Could not look for matches: ${e.message}`;
    }
    turn.finished = true;
    setBusy(false);
    render();
  }

  // ── the drafts the assistant has written ──────────────────────────────
  async function loadDrafts() {
    const list = q("#as-drafts-list");
    if (!list) return;
    try {
      const j = await (await fetch("/api/assistant/drafts?limit=30")).json();
      const drafts = j.drafts || [];
      const n = q("#as-drafts-n");
      if (n) n.textContent = drafts.length ? `${drafts.length} waiting for review` : "none yet";
      if (!drafts.length) {
        list.innerHTML = `<div class="empty">None yet. When you type a test case nothing covers, the assistant writes it up here as a draft.</div>`;
        return;
      }
      list.innerHTML = drafts
        .map((d) => {
          const cov = { full: ["covers all of it", "good"], partial: ["covers part of it", "warn"], none: ["no automation yet", "bad"] }[d.coverage] || [d.coverage || "", "idle"];
          const lr = d.lastRun;
          const lastRun = lr
            ? `<div class="sx-row" style="margin-top:3px">${pill(lr.verdict || (lr.ran ? "passed" : "not run"))}<span class="sx-muted">${esc(cap(stripVerdict(CV.scrub(lr.line || ""))))}</span></div>`
            : "";
          return (
            `<div class="sx-draft"><div class="sx-row"><b class="sx-grow">${esc(d.title)}</b><span class="sx-badge warn">Draft</span><span class="sx-badge ${cov[1]}">${esc(cov[0])}</span></div>` +
            `<div class="sx-sub">You typed: “${esc(d.typed || "")}” · ${esc(new Date(d.createdAt).toLocaleString())}</div>` +
            ((d.gaps || []).length ? `<div class="sx-sub">Not covered yet: ${esc(d.gaps.join("; "))}</div>` : "") +
            lastRun +
            CV.detailsHtml([
              { label: "Draft id", value: d.id, kind: "code" },
              { label: "Kind", value: d.layer || "" },
              { label: "Status", value: d.status || "" },
              { label: "File", value: d.mdFile || "", kind: "code" },
              ...(lr?.details ? detailRows(lr.details) : []),
            ]) +
            `</div>`
          );
        })
        .join("");
    } catch {
      list.innerHTML = `<div class="sx-error">Could not load the drafts.</div>`;
    }
  }

  q("#as-btn")?.addEventListener("click", start);
  q("#as-match")?.addEventListener("click", matchOnly);
  loadDrafts();
})();
