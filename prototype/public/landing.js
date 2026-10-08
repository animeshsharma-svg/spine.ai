/**
 * THE LANDING PAGE'S LIVE PARTS (#/welcome).
 *
 * The page shows the product working rather than describing it:
 *   1. The numbers are read from the platform when the page opens
 *      (/api/test-cases, /api/metrics, /api/runs). What index.html says is
 *      the last reading, and stays if a request fails. A number is never
 *      rounded up or invented; each says what it counts.
 *   2. The bug deck is real bugs from the bug sheet (/api/findings), worst
 *      and most-seen first. Only the method, path and body of a repro are
 *      shown: the recorded curl carries the session's headers.
 *   3. The example run in the hero replays: the question types itself, each
 *      step runs and lands on its verdict, the tally counts, and the bug is
 *      filed. It is labelled "Example run", never shown as live.
 *   4. Sections reveal as they scroll in, numbers count up to their real
 *      value, bars grow to their real share.
 *
 * Motion (html.lp-motion) is switched on here only when the system has no
 * reduced-motion preference; without it every part shows in its final state.
 * Sign-in links are welcome.js's; this file never touches them.
 */
(function () {
  "use strict";

  const root = document.getElementById("view-welcome");
  if (!root) return;
  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => [...root.querySelectorAll(sel)];
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const shown = () => document.documentElement.dataset.view === "welcome";

  let still = false;
  try { still = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch {}
  const motion = !still && "IntersectionObserver" in window;
  if (motion) document.documentElement.classList.add("lp-motion");

  async function getJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  // ── the header gains a hairline once the page has scrolled ─────────────
  function initHead() {
    const head = $("#lp-head");
    if (!head) return;
    const sync = () => head.classList.toggle("is-stuck", shown() && window.scrollY > 8);
    window.addEventListener("scroll", sync, { passive: true });
    sync();
  }

  // ── sections reveal as they arrive; their numbers count up ─────────────
  function countUp(node) {
    const from = String(node.dataset.final || node.textContent).trim();
    const m = from.match(/^([^\d]*)([\d,]+)(.*)$/);
    if (!m) return;
    const end = Number(m[2].replace(/,/g, ""));
    const t0 = performance.now();
    const dur = 1200;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      // Live data may land mid-count: always finish on the latest reading.
      if (k < 1) {
        node.textContent = `${m[1]}${num(Math.round(end * eased))}${m[3]}`;
        requestAnimationFrame(step);
      } else {
        node.textContent = node.dataset.final || from;
      }
    };
    requestAnimationFrame(step);
  }
  function initReveal() {
    if (!motion) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
          for (const n of e.target.querySelectorAll("[data-count]")) countUp(n);
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -6% 0px" },
    );
    for (const n of $$("[data-reveal]")) io.observe(n);
  }

  // ── the example run, replayed ──────────────────────────────────────────
  /**
   * The markup holds the run as it ends (that is what shows without
   * motion). Replaying: everything goes back to waiting, the question types
   * itself, then each step runs for a moment and lands on its verdict, the
   * tally counting as it goes; the bug is filed; a pause; again. It plays
   * only while the run is on screen and the tab is in front.
   */
  const STEP_MS = [800, 1000, 1500, 900, 1200, 1000];
  function initRun() {
    const run = $("#lp-run");
    if (!run || !motion) return;
    const list = $("#lp-run-steps");
    const steps = [...list.children];
    const finals = steps.map((li) => (li.classList.contains("is-bad") ? "is-bad" : li.classList.contains("is-skip") ? "is-skip" : "is-ok"));
    const q = $("#lp-run-q");
    const question = q.textContent.trim();
    const clock = $("#lp-run-clock");
    const filed = $("#lp-run-filed");
    const tally = { "is-ok": $("#lp-t-ok"), "is-bad": $("#lp-t-bad"), "is-skip": $("#lp-t-skip") };

    // A screen reader gets the run as a sentence; the moving parts are hidden from it.
    const said = document.createElement("p");
    said.className = "sr-only";
    said.textContent =
      `Example run: "${question}" Six steps; five worked and one broke — sending the line items as plain text ` +
      `made the server crash with HTTP 500 where a refusal was expected. The bug was added to the bug sheet.`;
    run.appendChild(said);
    for (const n of [q, list, run.querySelector(".lp-run-foot")]) n?.setAttribute("aria-hidden", "true");

    let visible = false;
    let playing = false;
    let startedAt = 0;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const reset = () => {
      for (const li of steps) li.className = "is-wait";
      for (const t of Object.values(tally)) if (t) t.textContent = "0";
      filed?.classList.remove("is-on");
      q.textContent = "";
    };

    async function play() {
      if (playing) return;
      playing = true;
      reset();
      startedAt = Date.now();
      run.classList.add("is-typing");
      const mascot = window.spineMascot;
      for (let i = 1; i <= question.length; i += 1) {
        q.textContent = question.slice(0, i);
        // The logo in the header wakes and watches the question being written.
        if (i % 6 === 1) mascot?.typing();
        await wait(question[i - 1] === " " ? 34 : 20);
      }
      run.classList.remove("is-typing");
      await wait(450);
      mascot?.busy(true, "landing"); // it scans while the steps run
      for (let i = 0; i < steps.length; i += 1) {
        steps[i].className = "is-run";
        await wait(STEP_MS[i] || 1000);
        steps[i].className = finals[i];
        const t = tally[finals[i]];
        if (t) t.textContent = String(Number(t.textContent) + 1);
        await wait(200);
      }
      filed?.classList.add("is-on");
      mascot?.busy(false, "landing"); // and hops when the run is done
      await wait(4600);
      playing = false;
      if (visible && shown() && !document.hidden) play();
    }

    // Before the first frame: start from waiting, not from the end.
    reset();
    setInterval(() => {
      if (!playing || !clock) return;
      const s = Math.floor((Date.now() - startedAt) / 1000);
      clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }, 250);
    new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible && shown()) play();
    }, { threshold: 0.35 }).observe(run);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && visible && shown()) play();
    });
    window.addEventListener("hashchange", () => setTimeout(() => { if (visible && shown()) play(); }, 0));
  }

  // ── the numbers ────────────────────────────────────────────────────────
  function setLive(key, text) {
    for (const n of $$(`[data-live="${key}"]`)) {
      if (n.hasAttribute("data-count")) n.dataset.final = text;
      // A number already counted up (or never counting) shows the reading now.
      if (!n.hasAttribute("data-count") || !motion || n.closest("[data-reveal]")?.classList.contains("is-in")) n.textContent = text;
    }
  }
  function setShare(key, part, whole) {
    if (!whole) return;
    for (const n of $$(`[data-live-w="${key}"]`)) n.style.setProperty("--w", `${((part / whole) * 100).toFixed(1)}%`);
  }
  const metric = (m, key) => {
    for (const p of m?.pillars ?? []) for (const x of p.metrics ?? []) if (x.key === key) return x;
    return null;
  };
  const dayMonth = (ts) => {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  async function loadNumbers() {
    const [tc, m, runs] = await Promise.allSettled([getJson("/api/test-cases"), getJson("/api/metrics"), getJson("/api/runs")]);

    if (tc.status === "fulfilled" && tc.value?.stats) {
      const s = tc.value.stats;
      setLive("cases", num(s.total));
      setLive("casesApi", num(s.api));
      setLive("casesUi", num(s.ui));
      setLive("casesP0", num(s.p0));
      setShare("casesApiPct", s.api, s.api + s.ui);
      setShare("casesUiPct", s.ui, s.api + s.ui);
    }

    if (m.status === "fulfilled") {
      const bugs = metric(m.value, "bugs_verified");
      if (bugs?.value != null) {
        setLive("bugs", num(bugs.value));
        const waiting = String(bugs.says ?? "").match(/(\d+) more waiting/);
        setLive("bugsSays", waiting ? `on fresh records · ${waiting[1]} more with the product team` : "on fresh test records");
      }
      const match = metric(m.value, "matcher_top1");
      if (match?.value != null) {
        setLive("matcher", `${Math.round(match.value * 100)}%`);
        const n = String(match.says ?? "").match(/over (\d+) labelled/);
        if (n) setLive("matcherN", n[1]);
      }
      const at = new Date(m.value?.generatedAt);
      const note = $("#lp-nums-note");
      if (note && !Number.isNaN(at.getTime())) {
        note.textContent = `Read from spine.ai at ${at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} on ${dayMonth(at)}. Each number says what it counts.`;
      }
    }

    if (runs.status === "fulfilled") {
      // The latest run big enough to be a regression pass, not a one-case check.
      const r = (runs.value?.runs ?? []).find((x) => (x.kind === "api" || !x.kind) && Number(x.checks) >= 50);
      if (r) {
        const ok = Number(r.passed) || 0, bad = Number(r.failed) || 0, skip = Number(r.inconclusive) || 0;
        const all = ok + bad + skip;
        setLive("runChecks", num(r.checks ?? all));
        setLive("runOk", num(ok));
        setLive("runBad", num(bad));
        setLive("runSkip", num(skip));
        setLive("runDate", dayMonth(r.ts));
        setShare("runOkPct", ok, all);
        setShare("runBadPct", bad, all);
        setShare("runSkipPct", skip, all);
      }
    }
  }

  // ── the bug deck: real bugs, one at a time ─────────────────────────────
  /** "ID · METHOD /path · body → HTTP 500: message", as the bug sheet records each hit. */
  const HIT = /^(\S+) · (GET|POST|PATCH|PUT|DELETE) (\S+) · (.*) → HTTP (\d+)(?::\s*(.*))?$/;
  /** An id in a path ("WGRRY05R", "a1pja1hE", "Z2dnWmdaUWtnZw==") reads as {id} in a title. */
  const idless = (title) =>
    String(title).replace(/\/([A-Za-z0-9=]{6,})(?=[/\s?]|$)/g, (all, seg) => (/\d|=/.test(seg) ? "/{id}" : all));
  /** "QA_Platform_dboq_line_items_sent_as_plain_text_…" → "Line items sent as plain text …". */
  function caseWords(name) {
    const s = String(name).replace(/^QA_Platform_/, "").replace(/^(stg|dboq|edge|live)_/, "").replace(/_\d+$/, "").replace(/_/g, " ").trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  function bugCard(g) {
    const hits = (g.evidence ?? []).map((e) => String(e).match(HIT)).filter(Boolean);
    if (!hits.length) return null;
    // The shortest body makes the clearest repro.
    const [, , method, path, body, status, said] = hits.reduce((a, b) => (a[4].length <= b[4].length ? a : b));
    const wanted = String(g.rationale ?? "").match(/The case "([^"]+)" expected the API to ([^.]+?)\./);
    const verb = wanted?.[2] ?? "";
    const expected = /5xx/.test(verb) || Number(status) >= 500
      ? "A refusal with a reason (4xx), never a server crash"
      : /reject/.test(verb)
        ? "Refused, with a reason (4xx)"
        : "What the case describes";
    const sendsBody = method !== "GET" && body && body !== "-" && body !== "{}";
    const repro = `$ curl -X ${method} …/api${path}${sendsBody ? ` \\\n    -d '${cut(body, 90)}'` : ""}`;
    const seen = g.occurrences
      ? `Seen ${num(g.occurrences)} time${g.occurrences === 1 ? "" : "s"}${g.runs?.length ? ` across ${num(g.runs.length)} run${g.runs.length === 1 ? "" : "s"}` : ""}`
      : "";
    const sev = String(g.severity || "").replace(/^./, (c) => c.toUpperCase());
    return (
      `<header class="lp-case-head"><span class="lp-case-tag">Broken</span>` +
      (sev ? `<span class="lp-case-sev">${h(sev)}</span>` : "") +
      `<h3 class="lp-case-title">${h(idless(g.title))}</h3></header>` +
      `<div class="lp-case-grid">` +
      `<div class="lp-case-cell"><p class="lp-m">Expected</p><p class="lp-case-text">${h(expected)}</p>` +
      (wanted ? `<p class="lp-case-why">Case: ${h(cut(caseWords(wanted[1]), 110))}</p>` : "") + `</div>` +
      `<div class="lp-case-cell is-got"><p class="lp-m">What happened</p><p class="lp-case-text">HTTP ${h(status)}${said ? ` · ${h(cut(said, 60))}` : ""}</p></div>` +
      `</div>` +
      `<div class="lp-case-repro"><p class="lp-m">Reproduce</p><pre class="lp-pre"><code>${h(repro)}</code></pre></div>` +
      `<footer class="lp-case-foot"><span class="lp-case-ok">${icon("check")}In the bug sheet</span>${seen ? `<span>${h(seen)}</span>` : ""}</footer>`
    );
  }

  let deckAt = 0;
  let deckTimer = null;
  let deckPaused = false;
  function showCard(i, byHand) {
    const cards = $$(".lp-case");
    if (!cards.length) return;
    deckAt = (i + cards.length) % cards.length;
    cards.forEach((c, k) => {
      const on = k === deckAt;
      c.hidden = !on;
      c.classList.toggle("is-on", on);
    });
    $$(".lp-deck-dot").forEach((d, k) => d.setAttribute("aria-current", String(k === deckAt)));
    // Announce a card the reader asked for; never one that turned by itself.
    $("#lp-deck")?.setAttribute("aria-live", byHand ? "polite" : "off");
  }
  function startDeck() {
    clearInterval(deckTimer);
    if (!motion) return;
    deckTimer = setInterval(() => {
      if (!deckPaused && shown() && !document.hidden) showCard(deckAt + 1, false);
    }, 7000);
  }

  async function loadDeck() {
    const f = await getJson("/api/findings");
    const RANK = { critical: 0, high: 1, medium: 2, low: 3 };
    const cards = (f.groups ?? [])
      .filter((g) => g.kind === "product_defect" || g.kind === "contradiction")
      .sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9) || (b.occurrences || 0) - (a.occurrences || 0))
      .map(bugCard)
      .filter(Boolean)
      .slice(0, 3);
    const deck = $("#lp-deck");
    if (!deck || !cards.length) return;
    deck.innerHTML = cards
      .map((html, i) => `<article class="lp-case" role="group" aria-roledescription="slide" aria-label="Bug ${i + 1} of ${cards.length}"${i ? " hidden" : ""}>${html}</article>`)
      .join("");
    const dots = $("#lp-deck-dots");
    if (dots) {
      dots.innerHTML = cards.map((_, i) => `<button type="button" class="lp-deck-dot" data-deck="${i}" aria-label="Bug ${i + 1} of ${cards.length}"></button>`).join("");
    }
    const ctl = $("#lp-deck-ctl");
    if (ctl) ctl.hidden = cards.length < 2;
    showCard(0, false);
    startDeck();
  }

  function initDeck() {
    $("#lp-deck-ctl")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-deck]");
      if (!b) return;
      const v = b.dataset.deck;
      showCard(v === "prev" ? deckAt - 1 : v === "next" ? deckAt + 1 : Number(v), true);
      startDeck(); // a click restarts the wait before the next turn
    });
    const proof = $(".lp-proof-in");
    proof?.addEventListener("pointerenter", () => { deckPaused = true; });
    proof?.addEventListener("pointerleave", () => { deckPaused = false; });
    proof?.addEventListener("focusin", () => { deckPaused = true; });
    proof?.addEventListener("focusout", () => { deckPaused = false; });
  }

  // ── boot ───────────────────────────────────────────────────────────────
  let loaded = false;
  function load() {
    if (loaded || !shown()) return;
    loaded = true;
    loadNumbers().catch(() => {});
    loadDeck().catch(() => {});
  }

  initHead();
  initReveal();
  initRun();
  initDeck();
  load();
  window.addEventListener("hashchange", () => setTimeout(load, 0));
})();
