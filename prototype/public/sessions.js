/**
 * SESSIONS (#/sessions): every run kept for the selected client, newest first.
 *
 * One row per session, grouped by day (Today, Yesterday, This week, then by
 * month), with a search over what was asked and status filters with counts.
 * The chosen filter lives in the address (#/sessions?status=broken), so it
 * survives a reload and the back button. A row is one link to
 * #/session/{id}; home.js opens it (an API run replays through openRun, a
 * browser journey or PO run as a turn with its reports).
 *
 * It decides nothing. Every status word is home.js's statusOf() (read through
 * window.spineRuns), so Home and Sessions never disagree, and the step strip
 * only draws the verdicts a run recorded.
 *
 * Where the rows come from:
 *   - /api/runs: the newest runs of every kind (API, browser journey, PO, and
 *     a test case typed and run in the browser).
 *     It is capped at 40, not paged, and not filtered by company or
 *     environment, so this page filters by client the way Home does.
 *   - /api/runs/:id: the step strip of an API run (its journey steps, then
 *     its checks), fetched only for rows on screen, a couple at a time.
 *     Journeys and PO runs have no per-step record there, so no strip.
 *   - window.spineSession: this tab's own session while it is running or
 *     waiting on "Your turn". The server lists a run only once it is done.
 */
(function () {
  "use strict";

  const q$ = (sel, root = document) => root.querySelector(sel);
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const read = (fn, fallback) => {
    try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; }
  };
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const R = () => window.spineRuns ?? null;
  const onPage = () => document.documentElement.dataset.view === "sessions";

  const PAGE = 30;
  const MAX_BARS = 16;
  const FILTERS = [
    ["all", "All"],
    ["running", "Running"],
    ["turn", "Your turn"],
    ["broken", "Broken"],
    ["worked", "Worked"],
  ];
  const FILTER_KEYS = new Set(FILTERS.map(([k]) => k));

  const st = {
    runs: null,          // /api/runs, as it last answered
    err: false,
    query: "",
    status: "all",
    shown: PAGE,
    details: new Map(),  // run id → { items, durationMs } from /api/runs/:id
    byId: new Map(),     // run id → the row as last drawn
    localSig: "",
    wasOpen: false,
    stale: false,
    focusHome: false,
  };

  // ── loading ──────────────────────────────────────────────────────────────
  let loadSeq = 0;
  async function load() {
    const seq = ++loadSeq;
    // The same parameters the rest of the page sends; the server does not
    // filter on them yet (see the backend gaps in the file header).
    const qs = new URLSearchParams();
    const c = read(() => currentClient, null);
    if (c != null) qs.set("c", String(c));
    const base = read(() => customBase, "");
    if (base) qs.set("base", base);
    try {
      const res = await fetch(`/api/runs?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      if (seq !== loadSeq) return;
      st.runs = Array.isArray(body.runs) ? body.runs : [];
      st.err = false;
    } catch {
      if (seq !== loadSeq) return;
      st.err = true;
    }
    st.stale = false;
    render();
  }

  // ── rows ─────────────────────────────────────────────────────────────────
  const TYPE_OF_MODE = { api: "API", ui: "BROWSER", both: "BOTH" };
  /** API / BROWSER / PO / RFP / SCENARIO, from the run's own kind and request. */
  function typeOf(r) {
    if (r.kind === "po") return "PO";
    if (r.kind === "journey" || r.kind === "plan") return "BROWSER";
    const q = String(r.request ?? "");
    if (/^\s*rfp\b|rfp (suite|event publish)/i.test(q)) return "RFP";
    if (/\b(scenario|matrix)\b/i.test(q)) return "SCENARIO";
    return "API";
  }

  /** This tab's session, while it runs or waits on "Your turn" — for this client and environment. */
  function localRow() {
    const api = R();
    const ss = window.spineSession;
    const t = ss?.turn;
    if (!api || !ss?.on || !ss.id || !t || t.replay) return null;
    const live = !!ss.open;
    if (!live && !ss.yourTurn) return null;
    const tg = t.target ?? {};
    if (tg.companyId != null && String(tg.companyId) !== String(read(() => currentClient, ""))) return null;
    if (tg.env && tg.env !== api.envLabel()) return null;
    const title = oneLine(t.text) || "Untitled run";
    return {
      id: ss.id,
      local: true,
      startedAt: t.startedAt,
      title,
      company: tg.company || read(() => currentClientName, ""),
      env: tg.env || "",
      durationMs: null,
      type: TYPE_OF_MODE[t.mode] || "API",
      status: live ? api.RUNNING : api.YOUR_TURN,
      running: live,
      turn: !live,
      search: title.toLowerCase(),
    };
  }

  function savedRow(r) {
    const api = R();
    const title = api.titleOf(r);
    return {
      id: r.id,
      run: r,
      startedAt: Date.parse(r.ts),
      title,
      company: api.companyOf(r),
      env: "",
      durationMs: Number.isFinite(r.durationMs) ? r.durationMs : null,
      type: typeOf(r),
      status: api.statusOf(r),
      running: false,
      turn: false,
      search: `${title} ${r.request ?? ""}`.toLowerCase(),
    };
  }

  function allRows() {
    const api = R();
    if (!api) return [];
    const local = localRow();
    // A saved run that started after this tab's session did is that session
    // (or its follow-up): the live row already stands for it.
    const saved = api
      .forClient(st.runs ?? [])
      .filter((r) => !local || !(Date.parse(r.ts) >= local.startedAt - 5000))
      .map(savedRow);
    return local ? [local, ...saved] : saved;
  }

  const inFilter = (key) => (r) =>
    key === "all" ? true
    : key === "running" ? r.running
    : key === "turn" ? r.turn
    : key === "broken" ? r.status.cls === "bad"
    : key === "worked" ? r.status.cls === "ok"
    : true;

  // ── the step strip ───────────────────────────────────────────────────────
  // ok = worked · bad = broken · nc = not checked · issue = refused or an issue
  // found (the Run screen draws both amber) · run = running · todo = not yet run
  const JOURNEY = { worked: "ok", broken: "bad", issue: "issue", refused: "issue", "not-run": "todo" };
  const PLAN = { wait: "todo", run: "run", ok: "ok", bad: "bad", skip: "nc" };
  const RANK = { bad: 5, issue: 4, nc: 3, run: 2, todo: 1, ok: 0 };

  /** A saved API run, in run order: its journey's steps, then its checks. */
  function itemsOf(rec) {
    const out = [];
    for (const s of rec?.journey?.steps ?? []) out.push(JOURNEY[s?.verdict] ?? "nc");
    for (const c of rec?.checkResults ?? []) out.push(c.pass ? "ok" : c.inconclusive ? "nc" : "bad");
    return out;
  }

  /** This tab's session as it runs, from what app.js and session.js already hold. */
  function liveItems() {
    const ss = window.spineSession;
    const plan = ss?.steps ?? [];
    if (plan.length) return plan.map((s) => PLAN[s] ?? "todo");
    const out = [];
    const planned = read(() => journeyLive, null)?.steps?.length || 0;
    const done = read(() => journeyStepsLive, []) || [];
    const total = Math.max(planned, read(() => journeyPlanned, 0) || 0, done.length);
    let current = !!ss?.open;
    for (let i = 0; i < total; i++) {
      const rec = done[i];
      if (rec) out.push(JOURNEY[rec.verdict] ?? "nc");
      else if (current) { out.push("run"); current = false; }
      else out.push("todo");
    }
    const rows = read(() => checkRows, []) || [];
    for (const c of rows) out.push(c._running || c._rerunning ? "run" : c.pass ? "ok" : c.inconclusive ? "nc" : "bad");
    const cases = read(() => runPlanned, 0) || 0;
    for (let i = rows.length; i < cases; i++) out.push("todo");
    if (out.length) return out;
    // A browser journey narrates lines, not steps: its verdict lines are the strip.
    for (const s of read(() => uiSteps, []) || []) {
      if (s.kind === "ok") out.push("ok");
      else if (s.kind === "bad") out.push("bad");
      else if (s.kind === "warn") out.push("issue");
    }
    if (out.length && ss?.open) out.push("run");
    return out;
  }

  function itemsFor(row) {
    if (row.local) return liveItems();
    // A typed browser run brings its own strip in the list (one entry per step).
    return st.details.get(row.id)?.items ?? (Array.isArray(row.run?.items) ? row.run.items : null);
  }

  function stripHtml(items) {
    if (!items?.length) return `<span class="sn-strip" aria-hidden="true"></span>`;
    const n = items.length;
    const c = { ok: 0, bad: 0, nc: 0, issue: 0, run: 0, todo: 0 };
    for (const v of items) c[v] = (c[v] ?? 0) + 1;
    const label =
      `${num(n)} step${n === 1 ? "" : "s"}: ${num(c.ok)} worked, ${num(c.bad)} broken, ${num(c.nc)} not checked` +
      (c.issue ? `, ${num(c.issue)} with an issue` : "") +
      (c.run ? `, ${num(c.run)} running` : "") +
      (c.todo ? `, ${num(c.todo)} not run yet` : "");
    // Up to 16 bars, one per step. Beyond that each bar stands for an equal
    // slice of the run and takes the worst result in it, so a failure late in
    // a long run is never drawn away; "+N" says how many steps share bars.
    let bars = items;
    if (n > MAX_BARS) {
      bars = [];
      for (let k = 0; k < MAX_BARS; k++) {
        let worst = "ok";
        for (let j = Math.floor((k * n) / MAX_BARS); j < Math.floor(((k + 1) * n) / MAX_BARS); j++) {
          if (RANK[items[j]] > RANK[worst]) worst = items[j];
        }
        bars.push(worst);
      }
    }
    return (
      `<span class="sn-strip" role="img" aria-label="${h(label)}" title="${h(label)}">` +
      bars.map((v) => `<i class="b-${v}"></i>`).join("") +
      (n > MAX_BARS ? `<span class="sn-plus">+${num(n - MAX_BARS)}</span>` : "") +
      `</span>`
    );
  }

  // ── times ────────────────────────────────────────────────────────────────
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  /** Today, Yesterday, This week, then one group per month — in the reader's own timezone. */
  function groupOf(t) {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return { key: "undated", label: "Undated" };
    const days = Math.round((dayStart(new Date()) - dayStart(d)) / 864e5);
    if (days <= 0) return { key: "today", label: "Today" };
    if (days === 1) return { key: "yesterday", label: "Yesterday" };
    if (days < 7) return { key: "week", label: "This week" };
    return { key: `m${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  }
  /** "10:42" today or yesterday, "Mon 15:20" this week, "12 Sep" before that. */
  function whenOf(t, group) {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return "";
    const hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    if (group === "today" || group === "yesterday") return hm;
    if (group === "week") return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${hm}`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  /** How long a run took; nothing when it was not recorded (some saved runs say 0). */
  function took(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "";
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }
  const fullTime = (t) => {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  };

  function metaOf(row, group) {
    const duration = row.running ? "running" : took(row.durationMs ?? st.details.get(row.id)?.durationMs);
    return [row.company, row.env, whenOf(row.startedAt, group), duration].filter(Boolean).join(" · ");
  }

  // ── drawing ──────────────────────────────────────────────────────────────
  function rowHtml(row, group) {
    const v = row.status;
    const dot = row.running ? " is-live" : row.turn ? " is-turn" : "";
    const detail = !row.local && row.run?.kind === "api" && !st.details.has(row.id);
    return (
      `<a class="sn-row" href="${h(R().sessionHref(row.id))}" data-id="${h(row.id)}" data-group="${h(group)}"${detail ? ' data-detail="1"' : ""}>` +
      `<span class="sn-dot${dot}" aria-hidden="true"></span>` +
      `<span class="sn-text"><span class="sn-title" title="${h(row.title)}">${h(row.title)}</span>` +
      `<span class="sn-meta" title="${h(fullTime(row.startedAt))}">${h(metaOf(row, group))}</span></span>` +
      stripHtml(itemsFor(row)) +
      `<span class="sn-type">${h(row.type)}</span>` +
      `<span class="sn-tag tag-${h(v.cls)}"${v.why ? ` title="${h(v.why)}"` : ""}>${h(v.word)}` +
      (v.why ? `<span class="sr-only"> — ${h(v.why)}</span>` : "") +
      `</span></a>`
    );
  }

  /**
   * A row and, beside it (a button cannot live inside the row's link), its
   * Delete. This tab's own session while it runs or waits has none: it is
   * not saved yet, and stopping it is the run's own button.
   */
  function itemHtml(row, group) {
    const del = row.local
      ? ""
      : `<button type="button" class="sn-del" data-act="delete" data-id="${h(row.id)}" aria-label="${h(`Delete session: ${row.title}`)}" title="Delete session">` +
        `<svg class="ico" aria-hidden="true"><use href="#i-trash"/></svg></button>`;
    return `<div class="sn-item" data-id="${h(row.id)}">${rowHtml(row, group)}${del}</div>`;
  }

  function groupsHtml(rows) {
    const out = [];
    let cur = null;
    for (const row of rows) {
      const g = groupOf(row.startedAt);
      if (!cur || cur.key !== g.key) {
        cur = { ...g, rows: [] };
        out.push(cur);
      }
      cur.rows.push(row);
    }
    return out
      .map(
        (g) =>
          `<section class="sn-group" aria-labelledby="sn-g-${h(g.key)}">` +
          `<h2 class="sn-label" id="sn-g-${h(g.key)}">${h(g.label)}</h2>` +
          `<div class="sn-card">${g.rows.map((r) => itemHtml(r, g.key)).join("")}</div></section>`,
      )
      .join("");
  }

  const SKELETON =
    `<div class="sn-card" aria-hidden="true">` +
    Array.from({ length: 6 }, () =>
      `<div class="sn-skel"><span class="sn-dot"></span><span class="sn-text"><span class="sk sk-t"></span><span class="sk sk-m"></span></span>` +
      `<span class="sk sk-strip"></span><span class="sk sk-type"></span><span class="sk sk-tag"></span></div>`,
    ).join("") +
    `</div>`;

  function paintFilters(counts) {
    const box = q$("#sn-filters");
    if (!box) return;
    const had = document.activeElement?.closest?.(".sn-pill")?.dataset.status;
    box.innerHTML = FILTERS.map(
      ([key, label]) =>
        `<button type="button" class="sn-pill" data-status="${key}" aria-pressed="${st.status === key}">` +
        `${h(label)}<span class="sn-n">${num(counts[key])}</span></button>`,
    ).join("");
    if (had) box.querySelector(`[data-status="${had}"]`)?.focus();
  }

  let announceTimer = null;
  function announce(text) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      const said = q$("#sn-said");
      if (said && said.textContent !== text) said.textContent = text;
    }, 400);
  }

  function render() {
    const body = q$("#sn-body");
    if (!body) return;
    const all = allRows();
    const query = st.query.trim().toLowerCase();
    const searched = query ? all.filter((r) => r.search.includes(query)) : all;
    const counts = Object.fromEntries(FILTERS.map(([k]) => [k, searched.filter(inFilter(k)).length]));
    paintFilters(counts);
    const filtered = searched.filter(inFilter(st.status));
    const shown = filtered.slice(0, st.shown);
    st.byId = new Map(shown.map((r) => [r.id, r]));

    const loading = !st.runs && !st.err;
    const retry = `<p class="sn-note" role="alert">Couldn't load sessions · <button type="button" class="sn-link" data-act="retry">Retry</button></p>`;
    let html;
    if (!R()) html = retry;
    else if (loading && !all.length) html = SKELETON;
    else if (!all.length) {
      html = st.err
        ? retry
        : `<div class="sn-card sn-empty"><p class="sn-empty-t">No sessions yet</p><a class="sn-link" href="#/home">Start one on Home</a></div>`;
    } else if (!filtered.length) {
      const name = FILTERS.find(([k]) => k === st.status)?.[1] ?? "";
      const what = query ? `‘${st.query.trim()}’` : `the “${name}” filter`;
      html =
        (st.err ? retry : "") +
        `<div class="sn-card sn-empty"><p class="sn-empty-t">Nothing matches ${h(what)}</p>` +
        `<button type="button" class="sn-link" data-act="clear">Clear filters</button></div>`;
    } else {
      html = (st.err ? retry : "") + groupsHtml(shown);
    }

    // Redrawn on every change, so the row the reader was on keeps the focus.
    const focusId = document.activeElement?.closest?.(".sn-row")?.dataset.id;
    body.innerHTML = html;
    body.setAttribute("aria-busy", String(loading));
    if (focusId) body.querySelector(`.sn-row[data-id="${CSS.escape(focusId)}"]`)?.focus();
    const more = q$("#sn-more");
    if (more) more.hidden = loading || filtered.length <= st.shown;
    watchRows();
    if (!loading) announce(filtered.length === 1 ? "1 session" : `${num(filtered.length)} sessions`);
  }

  /** One row in place: its strip, meta and tag, with the focus kept on it. */
  function paintRow(id) {
    const node = q$(`#sn-body .sn-row[data-id="${CSS.escape(id)}"]`);
    if (!node) return;
    const row = id === localRow()?.id ? localRow() : st.byId.get(id);
    if (!row) return;
    const t = document.createElement("template");
    t.innerHTML = rowHtml(row, node.dataset.group);
    const fresh = t.content.firstElementChild;
    const focused = document.activeElement === node;
    node.replaceWith(fresh);
    if (focused) fresh.focus();
  }

  // ── the strip for API runs, fetched for the rows on screen ───────────────
  const wanted = [];
  let active = 0;
  function want(id) {
    if (st.details.has(id) || wanted.includes(id)) return;
    wanted.push(id);
    pump();
  }
  function pump() {
    while (active < 2 && wanted.length) {
      const id = wanted.shift();
      if (st.details.has(id)) continue;
      active++;
      fetch(`/api/runs/${encodeURIComponent(id)}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((rec) => {
          // Only what the row draws is kept; a record can be a megabyte.
          st.details.set(id, { items: rec ? itemsOf(rec) : null, durationMs: Number.isFinite(rec?.durationMs) ? rec.durationMs : null });
        })
        .catch(() => st.details.set(id, { items: null, durationMs: null }))
        .finally(() => {
          active--;
          paintRow(id);
          pump();
        });
    }
  }
  const seen = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          seen.unobserve(e.target);
          want(e.target.dataset.id);
        }
      }, { rootMargin: "200px 0px" })
    : null;
  function watchRows() {
    for (const node of document.querySelectorAll('#sn-body .sn-row[data-detail="1"]')) {
      if (seen) seen.observe(node);
      else want(node.dataset.id);
    }
  }

  // ── deleting a session ───────────────────────────────────────────────────
  /**
   * Gone for good: the server's /api/run-delete removes the run from every
   * store it could be in (API runs, PO runs, browser journey trails), and so
   * from its reports and the bug counts built from it. Asked first.
   */
  function confirmDelete(row) {
    return new Promise((resolve) => {
      let dlg = q$("#sn-dialog");
      if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "sn-dialog";
        dlg.className = "sn-dialog";
        dlg.setAttribute("aria-labelledby", "sn-dialog-t");
        dlg.setAttribute("aria-describedby", "sn-dialog-d");
        dlg.innerHTML =
          `<form method="dialog">` +
          `<h2 class="sn-dialog-t" id="sn-dialog-t">Delete this session?</h2>` +
          `<p class="sn-dialog-d" id="sn-dialog-d"></p>` +
          `<div class="sn-dialog-a"><button type="submit" value="cancel" class="sn-btn" autofocus>Cancel</button>` +
          `<button type="submit" value="delete" class="sn-btn danger">Delete</button></div></form>`;
        document.body.appendChild(dlg);
      }
      q$("#sn-dialog-d", dlg).textContent =
        `“${row.title}” and its reports are removed from spine.ai for good. Bugs that only this run found may leave the Bugs page. This can't be undone.`;
      const done = () => {
        dlg.removeEventListener("close", done);
        resolve(dlg.returnValue === "delete");
      };
      dlg.returnValue = "";
      dlg.addEventListener("close", done);
      dlg.showModal();
    });
  }

  function toast(text) {
    let box = q$("#sn-toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "sn-toasts";
      box.className = "sn-toasts";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      document.body.appendChild(box);
    }
    const t = document.createElement("div");
    t.className = "sn-toast";
    t.textContent = text;
    box.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  async function deleteSession(id, trigger) {
    const row = st.byId.get(id);
    if (!row || row.local) return;
    if (!(await confirmDelete(row))) return trigger?.focus();
    // Where the focus goes after: the next row, else the one before, else search.
    const item = trigger?.closest(".sn-item");
    const next = item?.nextElementSibling?.dataset.id ?? item?.previousElementSibling?.dataset.id ?? null;
    let ok = false;
    try {
      const res = await fetch(`/api/run-delete?run=${encodeURIComponent(id)}`, { cache: "no-store" });
      ok = res.ok && !!(await res.json())?.deleted;
    } catch {
      ok = false;
    }
    if (!ok) {
      toast("Couldn't delete that session — it may already be gone");
      return load();
    }
    st.runs = (st.runs ?? []).filter((r) => r.id !== id);
    st.details.delete(id);
    render();
    toast("Session deleted");
    // The Bugs badge and page count runs; one fewer may change them.
    window.dispatchEvent(new CustomEvent("spine:bugs-changed"));
    const to = next && q$(`#sn-body .sn-row[data-id="${CSS.escape(next)}"]`);
    (to || q$("#sn-q"))?.focus();
  }

  // ── the address: #/sessions?status=broken ────────────────────────────────
  function statusFromHash() {
    const m = location.hash.match(/[?&]status=([a-z]+)/);
    return m && FILTER_KEYS.has(m[1]) ? m[1] : "all";
  }
  function setStatus(key) {
    if (!FILTER_KEYS.has(key) || key === st.status) return;
    st.status = key;
    st.shown = PAGE;
    // A history entry, not a hashchange: the router would scroll to the top.
    // Back fires hashchange, which reads the filter from the address again.
    history.pushState(null, "", key === "all" ? "#/sessions" : `#/sessions?status=${key}`);
    render();
  }

  // ── the client bar sits in this page's header while it is open ───────────
  function placeClientBar() {
    const bar = q$(".ctx-bar");
    const slot = q$("#sn-ctx");
    if (!bar || !slot) return;
    if (onPage()) {
      if (bar.parentNode !== slot) slot.appendChild(bar);
    } else if (bar.parentNode === slot) {
      const views = q$("main.views");
      const extra = q$(".ctx-extra");
      if (extra?.parentNode === views) views.insertBefore(bar, extra);
      else views?.prepend(bar);
    }
  }

  // ── keeping it current ───────────────────────────────────────────────────
  function enter() {
    placeClientBar();
    st.status = statusFromHash();
    const box = q$("#sn-q");
    if (box && box.value !== st.query) box.value = st.query;
    render();
    load();
  }

  /** Once a second: this tab's running session moves, and a finished one is fetched as saved. */
  function tick() {
    const ss = window.spineSession;
    const open = !!ss?.open;
    if (st.wasOpen && !open) {
      // The server lists the run a moment after it ends.
      setTimeout(() => (onPage() ? load() : (st.stale = true)), 1500);
    }
    st.wasOpen = open;
    if (!onPage() || document.visibilityState !== "visible") return;
    const local = localRow();
    const sig = local ? `${local.id}|${local.running}|${local.turn}` : "";
    if (sig !== st.localSig) {
      st.localSig = sig;
      render();
    } else if (local?.running) {
      paintRow(local.id);
    }
  }

  function init() {
    const box = q$("#sn-q");
    let typing = null;
    box?.addEventListener("input", () => {
      clearTimeout(typing);
      typing = setTimeout(() => {
        st.query = box.value;
        st.shown = PAGE;
        render();
      }, 150);
    });
    q$("#sn-filters")?.addEventListener("click", (e) => {
      const pill = e.target.closest(".sn-pill");
      if (pill) setStatus(pill.dataset.status);
    });
    q$("#sn-body")?.addEventListener("click", (e) => {
      const del = e.target.closest('[data-act="delete"]');
      if (del) {
        e.preventDefault();
        return void deleteSession(del.dataset.id, del);
      }
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "retry") {
        st.err = false;
        render();
        load();
      } else if (act === "clear") {
        st.query = "";
        if (box) box.value = "";
        st.shown = PAGE;
        if (st.status !== "all") setStatus("all");
        else render();
        box?.focus();
      }
    });
    q$("#sn-more")?.addEventListener("click", () => {
      st.shown += PAGE;
      render();
    });
    // "/" anywhere on the page goes to the search, unless the reader is typing.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "/" || !onPage() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      box?.focus();
    });
    // "+ New session" goes to Home and puts the cursor in its request box.
    q$("#sn-new")?.addEventListener("click", () => (st.focusHome = true));

    // Deferred a tick, like home.js: app.js's router marks the view first.
    window.addEventListener("hashchange", () =>
      setTimeout(() => {
        placeClientBar();
        if (onPage()) enter();
        else if (st.focusHome && document.documentElement.dataset.view === "home") {
          st.focusHome = false;
          q$("#home-q")?.focus();
        }
      }, 0),
    );
    // A different client or environment is a different list.
    const rescope = () => setTimeout(() => {
      if (!onPage()) return void (st.stale = true);
      st.runs = null;
      st.shown = PAGE;
      render();
      load();
    }, 0);
    q$("#client")?.addEventListener("change", () => {
      if (q$("#client")?.value !== "__add__") rescope();
    });
    q$("#env")?.addEventListener("change", rescope);
    q$("#env-custom")?.addEventListener("change", rescope);

    setInterval(tick, 1000);
    const start = () => {
      if (onPage()) enter();
    };
    if (R()?.whenClientKnown) R().whenClientKnown(start);
    else start();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
