/**
 * THE GUIDED TESTING SESSION — the frontend (Track B).
 *
 *   #/s          the sessions list: resume, rename, delete, start a new one
 *   #/s/<id>     one session: a stepper (Environment → Requirement → Sanity → Cases → Review → Run),
 *                each step a card; earlier steps reopen. ?mock=1 loads session-mock.js, which answers
 *                every route with realistic data and timed SSE lines. The flag sticks for the tab.
 *
 * Day 2 (13 Nov 2026): built against the contract in docs/Prompt_for_Aanya_Day2_2026-11-13.md §3
 * (route names, event names, payload shapes are Animesh's, used as given) and §4, the on-screen
 * questions: one question card used by every step and by the Questions drawer in the shell. The
 * backend decides when and what to ask; the card shows the words as written and posts the answer.
 * Every step stream carries ask / answered; GET …/questions/stream keeps the drawer live between steps.
 *
 * House style: the paper tokens (home.css), h() on every string, plain English on every label, no
 * internal ids on screen, every long wait says what it waits for. Loaded after app.js.
 */
(function () {
  "use strict";
  const q$ = (sel, root = document) => root.querySelector(sel);
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (name, cls = "") => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const when = (s) => (s ? new Date(s).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  const read = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
  const root = () => q$("#gs-root");
  const sid = () => encodeURIComponent(S.cur.id);

  const STEPS = [
    ["environment", "Environment", "Where the tests run, and that spine.ai can sign in there"],
    ["requirement", "Requirement", "What is being tested: the PRD, the frames, your own sheet"],
    ["sanity", "Sanity", "The happy flows, run live, before any case is written"],
    ["cases", "Cases", "The test cases, kind by kind, each with the rule it comes from"],
    ["review", "Review", "Edit, drop, approve; merge your own sheet; freeze a version"],
    ["run", "Run", "Run what you chose, watch it, read the tally and the bugs"],
  ];
  const ORDER = STEPS.map((s) => s[0]);
  const stepLabel = (k) => STEPS.find((x) => x[0] === k)?.[1] || k;

  // ── state ─────────────────────────────────────────────────────────────────
  const S = {
    mock: false,
    sessions: [],
    cur: null,          // the session object
    view: null,         // the step shown (may be an earlier one than cur.step)
    live: null,         // { step, items, lines, ... } — the SSE in progress
    clients: [],
    profiles: [],
    kinds: [],          // from GET /api/session/kinds
    describe: null,     // what the environment address points at
    questions: [],      // every Q of the session, in the order asked
    drawer: false,
    form: {},           // what is typed on the current step, kept across repaints
    sel: new Set(),     // ticks (flows, sections)
    err: null,
    qstream: null,      // the questions stream's stop()
  };

  // ── the API, real or mock ─────────────────────────────────────────────────
  const mockOn = () => S.mock && !!window.spineGuidedMock;
  async function json(method, path, body) {
    if (mockOn()) return structuredClone(await window.spineGuidedMock.call(method, path, body)); // a copy, as the wire would give
    const r = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || d.why || `The server answered ${r.status}`);
    return d;
  }
  /** A streaming route: every {type, ...} line goes to on(line); resolves when the stream ends. stop() ends it early. */
  function stream(method, path, body, on) {
    let stopped = false; let ctrl = null;
    const done = (async () => {
      if (mockOn()) {
        const gen = await window.spineGuidedMock.call(method, path, body);
        for await (const line of gen) { if (stopped) return; on(structuredClone(line)); if (line.type === "error") break; }
        return;
      }
      ctrl = new AbortController();
      const r = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
      if (!r.ok || !r.body) throw new Error(`The server answered ${r.status}`);
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end || stopped) break;
        buf += dec.decode(value, { stream: true });
        let at;
        while ((at = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, at); buf = buf.slice(at + 2);
          let ev = ""; let data = "";
          for (const l of chunk.split("\n")) { if (l.startsWith("event:")) ev = l.slice(6).trim(); else if (l.startsWith("data:")) data += l.slice(5).trim(); }
          if (!data) continue;
          try { const j = JSON.parse(data); on({ type: j.type || ev || "line", ...j }); } catch { on({ type: ev || "line", line: data }); }
        }
      }
    })();
    return { done, stop() { stopped = true; try { ctrl?.abort(); } catch {} } };
  }
  /** Every step stream passes its lines through here first: the questions ride along. */
  function hearQuestions(l) {
    if (l.type === "ask" && l.question) { upsertQ(l.question); return true; }
    if (l.type === "answered" && l.question) { upsertQ(l.question); return true; }
    if (l.type === "closed" && l.qid) { const Q = S.questions.find((x) => x.qid === l.qid); if (Q) Q.closed = l.how; return true; }
    if (l.type === "ping") return true;
    return false;
  }
  function upsertQ(Q) {
    const i = S.questions.findIndex((x) => x.qid === Q.qid);
    if (i >= 0) S.questions[i] = { ...S.questions[i], ...Q }; else S.questions.push(Q);
    if (!Q.answeredAt && !S.drawer && !onScreen(Q)) S.drawer = true; // a question nobody can see opens the drawer
  }
  const onScreen = (Q) => S.cur && (S.view || S.cur.step) === Q.step;

  // ── loading ───────────────────────────────────────────────────────────────
  async function loadList() {
    try { S.sessions = (await json("GET", "/api/session/list")).sessions || []; S.err = null; } catch (e) { S.sessions = []; S.err = e.message; }
  }
  async function loadClients() {
    if (S.clients.length) return;
    try { const d = await fetch("/api/clients", { cache: "no-store" }).then((x) => x.json()); S.clients = (d.clients || []).map((c) => ({ id: c.id ?? c.companyId, name: c.name })); } catch { S.clients = [{ id: 198678, name: "PROCOL DEMO" }]; }
  }
  async function loadProfiles() { try { S.profiles = (await json("GET", "/api/session/env/profiles")).profiles || []; } catch { S.profiles = []; } }
  async function loadKinds() { if (S.kinds.length) return; try { S.kinds = (await json("GET", "/api/session/kinds")).kinds || []; } catch { S.kinds = []; } }
  async function loadQuestions() { try { S.questions = (await json("GET", `/api/session/${sid()}/questions`)).questions || []; } catch { S.questions = S.cur?.questions || []; } }
  async function open(id) {
    stopQuestionStream();
    try { S.cur = await json("GET", `/api/session/${encodeURIComponent(id)}`); S.view = S.cur.step; S.err = null; } catch (e) { S.cur = null; S.err = e.message; }
    S.live = null; S.form = {}; S.sel.clear(); S.describe = null; S.questions = [];
    if (S.cur) { await loadQuestions(); startQuestionStream(); }
  }
  async function reload() { if (S.cur) { const v = S.view; const id = S.cur.id; try { S.cur = await json("GET", `/api/session/${encodeURIComponent(id)}`); } catch (e) { S.err = e.message; } S.view = v; } }
  function startQuestionStream() {
    if (!S.cur) return;
    const st = stream("GET", `/api/session/${sid()}/questions/stream`, undefined, (l) => { if (hearQuestions(l)) paint(); });
    st.done.catch(() => {});
    S.qstream = st.stop;
  }
  function stopQuestionStream() { try { S.qstream?.(); } catch {} S.qstream = null; }

  // ── routing ───────────────────────────────────────────────────────────────
  function parseHash() {
    const m = location.hash.match(/^#\/s(?:\/([^?/]+))?(?:\?(.*))?$/);
    if (!m) return null;
    const qs = new URLSearchParams(m[2] || "");
    if (qs.get("mock") === "1") try { sessionStorage.setItem("spine.guided.mock", "1"); } catch {}
    if (qs.get("mock") === "0") try { sessionStorage.removeItem("spine.guided.mock"); } catch {}
    return { id: m[1] ? decodeURIComponent(m[1]) : null };
  }
  let mockLoading = null;
  function ensureMock() {
    S.mock = read(() => sessionStorage.getItem("spine.guided.mock") === "1", false);
    if (!S.mock || window.spineGuidedMock || mockLoading) return mockLoading || Promise.resolve();
    mockLoading = new Promise((res) => { const s = document.createElement("script"); s.src = "/session-mock.js"; s.onload = res; s.onerror = res; document.head.appendChild(s); });
    return mockLoading;
  }
  async function route() {
    const r = parseHash();
    if (!r) { stopQuestionStream(); return; }
    await ensureMock();
    if (r.id) { if (!S.cur || S.cur.id !== r.id) await open(r.id); await loadClients(); await loadProfiles(); await loadKinds(); }
    else { stopQuestionStream(); S.cur = null; await loadList(); }
    paint();
  }
  const go = (id) => { location.hash = id ? `#/s/${encodeURIComponent(id)}` : "#/s"; };

  // ── painting ──────────────────────────────────────────────────────────────
  function paint() {
    const el = root(); if (!el) return;
    el.innerHTML = `<div class="gs-col">${S.cur ? sessionPage() : listPage()}</div>${S.cur ? drawer() : ""}`;
    wire(el);
  }
  const mockChip = () => (S.mock ? `<span class="gs-mock" title="Answered by the mock, not the server (drop ?mock=1 to use the real routes)">mock</span>` : "");

  function listPage() {
    return (
      `<header class="gs-head"><h1>Testing sessions</h1>${mockChip()}<span class="home-spacer"></span><button type="button" class="gs-btn primary" data-act="new">${icon("plus")}Start a testing session</button></header>` +
      `<p class="gs-lead">A session walks the tester's order and remembers every answer: where to test, what to test, the happy flows first, then the cases, your review, and the run. Whenever spine.ai is unsure it asks you on screen and goes on when you answer.</p>` +
      (S.err ? `<p class="gs-msg bad">${h(S.err)}</p>` : "") +
      (S.sessions.length
        ? `<div class="gs-rows">${S.sessions.map((s) => `<div class="gs-row"><button type="button" class="gs-row-main" data-open="${h(s.id)}"><span class="gs-row-title">${h(s.name)}</span><span class="gs-row-meta">${h([s.feature, s.env].filter(Boolean).join(" · ") || "Nothing set yet")} · ${h(when(s.updatedAt))}${s.stale?.length ? ` · ${plural(s.stale.length, "step")} to redo` : ""}</span></button><span class="tag-v ${s.step === "run" ? "tag-ok" : "tag-grey"}">${h(stepLabel(s.step))}</span><button type="button" class="gs-link" data-rename="${h(s.id)}">Rename</button><button type="button" class="gs-link danger" data-delete="${h(s.id)}">Delete</button></div>`).join("")}</div>`
        : `<div class="gs-empty"><b>No sessions yet</b><span>Start one and spine.ai asks where to test first.</span></div>`)
    );
  }

  function sessionPage() {
    const s = S.cur; const at = ORDER.indexOf(s.step); const shown = S.view || s.step; const stale = new Set(s.stale || []);
    const openN = S.questions.filter((q) => !q.answeredAt).length;
    return (
      `<header class="gs-head"><a class="gs-link" href="#/s">${icon("arrow-left")}All sessions</a><h1 contenteditable="true" spellcheck="false" id="gs-name" aria-label="Session name">${h(s.name)}</h1>${mockChip()}<span class="home-spacer"></span><span class="gs-meta">${h(s.env ? `${s.env.companyName} · ${s.env.url.replace(/^https?:\/\//, "")}` : "No environment yet")}</span><button type="button" class="gs-btn${openN ? " gs-ask-btn" : ""}" data-act="drawer" aria-label="Questions">${icon("info")}Questions${openN ? `<span class="gs-badge">${openN}</span>` : ""}</button></header>` +
      `<ol class="gs-stepper">${STEPS.map(([key, label], i) => { const state = i < at ? "done" : i === at ? "now" : "todo"; const can = i <= at; return `<li class="${state}${key === shown ? " shown" : ""}${stale.has(key) ? " stale" : ""}"><button type="button" data-step="${key}"${can ? "" : " disabled"}><span class="gs-n">${state === "done" && !stale.has(key) ? icon("check") : i + 1}</span><span class="gs-step-l">${h(label)}${stale.has(key) ? `<small>to redo</small>` : ""}</span></button></li>`; }).join("")}</ol>` +
      (S.err ? `<p class="gs-msg bad">${h(S.err)}</p>` : "") +
      `<section class="gs-card" data-card="${shown}"><div class="gs-card-head"><h2>${h(stepLabel(shown))}</h2><p>${h(STEPS.find((x) => x[0] === shown)[2])}</p></div>${questionsFor(shown)}${stepBody(shown)}</section>`
    );
  }

  function stepBody(step) {
    return { environment: envBody, requirement: reqBody, sanity: sanityBody, cases: casesBody, review: reviewBody, run: runBody }[step]?.() || "";
  }

  // ── the question card (§4) — one component, every step and the drawer ─────
  function questionsFor(step) {
    const qs = S.questions.filter((q) => q.step === step);
    if (!qs.length) return "";
    const open = qs.filter((q) => !q.answeredAt); const done = qs.filter((q) => q.answeredAt);
    return `<div class="gs-qs">${open.slice(0, 1).map(questionCard).join("")}${open.length > 1 ? `<p class="gs-hint">${plural(open.length - 1, "more question")} after this one.</p>` : ""}${done.map(answeredCard).join("")}</div>`;
  }
  function questionCard(Q) {
    const sug = String(Q.suggested ?? "").split(",").filter(Boolean);
    const many = Q.kind === "many";
    const opts = Q.options || [];
    const textOnly = Q.kind === "text" || !opts.length;
    return (
      `<div class="gs-qcard${Q.blocking ? " blocking" : ""}" data-qid="${h(Q.qid)}">` +
      `<p class="gs-qtext">${h(Q.text)}</p>${Q.why ? `<p class="gs-qwhy">${h(Q.why)}</p>` : ""}` +
      (opts.length ? `<div class="gs-qopts">${opts.map((o) => `<button type="button" class="gs-qopt${sug.includes(String(o.value)) ? " suggested" : ""}${many && S.form[`q:${Q.qid}`]?.includes(String(o.value)) ? " on" : ""}" data-qopt="${h(o.value)}"${many ? ` aria-pressed="${S.form[`q:${Q.qid}`]?.includes(String(o.value)) ? "true" : "false"}"` : ""}><b>${h(o.label)}</b>${o.means ? `<small>${h(o.means)}</small>` : ""}</button>`).join("")}</div>` : "") +
      (many ? `<div class="gs-qacts"><button type="button" class="gs-btn primary small" data-qmany="1">Use the ticked ones</button></div>` : "") +
      `<form class="gs-qother"><input type="text" name="other" placeholder="${textOnly ? "Your answer" : "Other…"}" aria-label="${textOnly ? "Your answer" : "Another answer"}"><button type="submit" class="gs-btn small">${textOnly ? "Answer" : "Use this"}</button><button type="button" class="gs-link" data-qskip="1">Skip for now</button></form>` +
      (Q.blocking && Q.deadlineAt ? `<p class="gs-qdeadline" data-deadline="${h(Q.deadlineAt)}">${h(countdown(Q.deadlineAt))}${Q.ifNoAnswer ? ` · ${h(Q.ifNoAnswer)}` : ""}</p>` : "") +
      `</div>`
    );
  }
  function answeredCard(Q) {
    const said = Q.skipped ? "Skipped" : Q.closed === "deadline" ? `No answer by the deadline (went with: ${labelFor(Q, Q.answer)})` : `You said: ${labelFor(Q, Q.answer)}`;
    return `<details class="gs-qdone"><summary><span class="gs-qdone-t">${h(Q.text)}</span><span class="gs-qdone-a">${h(said)}${Q.outcome ? ` → ${h(Q.outcome)}` : ""}</span></summary>${Q.why ? `<p class="gs-qwhy">${h(Q.why)}</p>` : ""}</details>`;
  }
  const labelFor = (Q, v) => String(v ?? "").split(",").filter(Boolean).map((x) => (Q.options || []).find((o) => String(o.value) === x)?.label || x).join(", ") || "—";
  function countdown(iso) { const s = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000)); return s >= 60 ? `Waits ${Math.floor(s / 60)} min ${s % 60} s for your answer` : s > 0 ? `Waits ${s} s for your answer` : "Deadline passed"; }
  setInterval(() => { for (const p of document.querySelectorAll(".gs-qdeadline[data-deadline]")) { const Q = S.questions.find((q) => q.deadlineAt === p.dataset.deadline); p.firstChild.nodeValue = countdown(p.dataset.deadline) + (Q?.ifNoAnswer ? ` · ${Q.ifNoAnswer}` : ""); } }, 1000);
  async function answerQ(qid, answer, skip) {
    const Q = S.questions.find((x) => x.qid === qid); if (!Q) return;
    try {
      const d = await json("POST", `/api/session/${sid()}/questions/answer`, skip ? { qid, skip: true } : { qid, answer });
      if (d.question) upsertQ(d.question); else if (d.ok === false) S.err = d.why || "That answer was not taken.";
      else { Q.answeredAt = new Date().toISOString(); if (skip) Q.skipped = true; else Q.answer = answer; }
    } catch (e) { S.err = e.message; }
    delete S.form[`q:${qid}`];
    paint();
  }
  function drawer() {
    const open = S.questions.filter((q) => !q.answeredAt); const done = S.questions.filter((q) => q.answeredAt).slice().reverse();
    return (
      `<aside class="gs-drawer${S.drawer ? " open" : ""}" aria-label="Questions" aria-hidden="${S.drawer ? "false" : "true"}"><div class="gs-drawer-head"><b>Questions</b><span class="gs-count">${open.length ? `${open.length} open` : "none open"}</span><span class="home-spacer"></span><button type="button" class="gs-link" data-act="drawer-close">${icon("x")}Close</button></div>` +
      (open.length ? open.map((Q) => `<div class="gs-drawer-step">${h(stepLabel(Q.step))}</div>${questionCard(Q)}`).join("") : `<p class="gs-hint">Nothing to answer right now. spine.ai asks here whenever it is unsure, at any step.</p>`) +
      (done.length ? `<div class="gs-drawer-step">Answered</div>${done.map(answeredCard).join("")}` : "") +
      `</aside>`
    );
  }

  /** The live checklist a streaming step paints: one line per event, ticked as it lands. */
  function liveList(expect) {
    const L = S.live; if (!L) return "";
    return `<ol class="gs-live">${expect.map(([type, label]) => { const got = L.items[type]; const cls = got ? (got.ok === false ? "bad" : "ok") : L.done || L.error ? "skip" : L.waiting === type ? "now" : "todo"; return `<li class="${cls}"><span class="gs-n">${cls === "ok" ? icon("check") : cls === "bad" ? icon("x") : cls === "now" ? `<i class="gs-spin"></i>` : ""}</span><span><b>${h(label)}</b>${got?.line ? `<small>${h(got.line)}</small>` : got?.why ? `<small>${h(got.why)}</small>` : cls === "now" ? `<small>${h(L.lines?.at(-1) || "Waiting for the server…")}</small>` : ""}</span></li>`; }).join("")}</ol>` + (L.error ? `<p class="gs-msg bad">${h(L.error)}</p>` : "");
  }
  /** A line handler for every step stream: questions first, then the step's own events. */
  const stepLine = (own) => (l) => { if (!hearQuestions(l)) own(l); paint(); };

  // ── Environment ───────────────────────────────────────────────────────────
  function envBody() {
    const s = S.cur; const f = S.form; const env = s.env;
    if (S.live?.step === "environment" || (env && !f.editing)) {
      const p = env || {};
      const done = !S.live || S.live.done;
      return (
        liveList([["reach", "Reach the environment"], ["signin", "Sign in"], ["settings", "Read the company settings"], ["gates", "Find what decides the tests"], ["vendors", "Find the QA test vendors"]]) +
        (done && env
          ? `<div class="gs-profile"><div class="gs-profile-head">${icon("globe")}<b>${h(p.companyName)}</b><span>${h(p.url)}</span><span class="tag-v tag-ok">Saved as a profile</span></div>` +
            `<dl><dt>Signed in</dt><dd>${h(p.signIn === "otp" ? "as the buyer, by one-time code" : p.signIn === "token" ? "with a saved token" : "through the console, as Procol Support")}</dd>` +
            `<dt>Settings</dt><dd>${p.settings ? `${p.settings.count} read${p.settings.hidden ? `, ${p.settings.hidden} hidden and left as they are` : ""}` : "—"}</dd>` +
            `<dt>Decides the tests</dt><dd>${(p.gates || []).map((g) => typeof g === "string" ? `<code>${h(g)}</code>` : `<span class="gs-gate"><code>${h(g.key)} = ${h(g.now)}</code>${g.why ? `<small>${h(g.why)}</small>` : ""}</span>`).join("") || "—"}</dd>` +
            `<dt>QA vendors</dt><dd>${p.vendors ? `${plural(p.vendors, "QA test vendor")} ready to bid${p.vendorNames?.length ? `<small>${p.vendorNames.map(h).join(", ")}</small>` : ""}` : `<span class="gs-warn">None on this company — bids cannot be placed here</span>`}</dd></dl>` +
            `<div class="gs-acts"><button type="button" class="gs-btn primary" data-act="next">Continue to Requirement ${icon("arrow-right")}</button><button type="button" class="gs-btn" data-act="env-edit">Change the environment</button></div></div>`
          : "")
      );
    }
    const prof = S.profiles; const D = S.describe;
    const url = f.url ?? env?.url ?? "https://uat.procol.app";
    const companyId = f.companyId ?? env?.companyId ?? read(() => currentClient, 198678) ?? 198678;
    const signIn = f.signIn ?? env?.signIn ?? "console";
    const needs = new Set(D?.needs || ["companyId", "signIn"]);
    const companies = D?.companies?.length ? D.companies : S.clients;
    return (
      (prof.length ? `<div class="gs-field"><label>Use a saved profile</label><div class="gs-chips">${prof.slice(0, 6).map((p) => `<button type="button" class="gs-chip" data-profile="${h(p.id)}" title="${h(p.url)}">${h(p.label)}<small>${h(when(p.snapshotAt))}${p.vendors ? ` · ${plural(p.vendors, "QA vendor")}` : ""}</small></button>`).join("")}</div></div>` : "") +
      `<form id="gs-env" class="gs-form">` +
      `<div class="gs-field"><label for="gs-url">Environment address</label><input id="gs-url" name="url" type="url" value="${h(url)}" placeholder="https://uat.procol.app" required>${D ? `<small class="gs-describe${D.ok === false ? " bad" : ""}">${h(D.ok === false ? D.why : D.what)}</small>` : `<small class="gs-describe">spine.ai says what this address is once you leave the field.</small>`}</div>` +
      `<div class="gs-grid2">${needs.has("companyId") || !D ? `<div class="gs-field"><label for="gs-company">Company</label><select id="gs-company" name="companyId">${companies.map((c) => `<option value="${h(c.id)}"${String(c.id) === String(companyId) ? " selected" : ""}>${h(c.name)}</option>`).join("") || `<option value="198678">PROCOL DEMO</option>`}</select></div>` : ""}` +
      `<div class="gs-field"><label>Sign in</label><div class="gs-radios">${[["console", "Through the console", "as Procol Support"], ["otp", "By one-time code", "the buyer's phone"], ["token", "With a saved token", "named below"]].filter(([v]) => !D?.signIns || D.signIns.includes(v)).map(([v, l, sub]) => `<label class="gs-radio${signIn === v ? " on" : ""}"><input type="radio" name="signIn" value="${v}"${signIn === v ? " checked" : ""}><span><b>${h(l)}</b><small>${h(sub)}</small></span></label>`).join("")}</div></div></div>` +
      (signIn === "token" || needs.has("tokenVar") ? `<div class="gs-grid2"><div class="gs-field"><label for="gs-token">Token name (as kept in api-suite/.env, never the token itself)</label><input id="gs-token" name="tokenVar" type="text" value="${h(f.tokenVar ?? "")}" placeholder="PROCOL_DEMO_TOKEN"></div>${needs.has("headerName") ? `<div class="gs-field"><label for="gs-header">Header the token goes in</label><input id="gs-header" name="headerName" type="text" value="${h(f.headerName ?? "Authorization")}"></div>` : ""}</div>` : "") +
      (needs.has("apiBaseUrl") ? `<div class="gs-field"><label for="gs-api">API address</label><input id="gs-api" name="apiBaseUrl" type="url" value="${h(f.apiBaseUrl ?? "")}" placeholder="https://sec-api.example.com"></div>` : "") +
      `<div class="gs-acts"><button type="submit" class="gs-btn primary">${icon("play")}Check and save</button><span class="gs-hint">Reaches the address, signs in, reads the company settings and finds the QA vendors. Nothing is changed.</span></div>` +
      `</form>`
    );
  }
  async function describe(url) {
    if (!url) { S.describe = null; return; }
    try { S.describe = await json("GET", `/api/session/env/describe?url=${encodeURIComponent(url)}`); } catch (e) { S.describe = { ok: false, why: e.message }; }
  }
  async function envSubmit(form) {
    const body = { url: form.url.value.trim(), companyId: form.companyId ? Number(form.companyId.value) || undefined : undefined, signIn: form.signIn?.value || undefined, tokenVar: form.tokenVar?.value?.trim() || undefined, headerName: form.headerName?.value?.trim() || undefined, apiBaseUrl: form.apiBaseUrl?.value?.trim() || undefined };
    S.form = { ...S.form, ...body, editing: false };
    S.live = { step: "environment", items: {}, lines: [], waiting: "reach", done: false, error: null };
    paint();
    try {
      await stream("POST", `/api/session/${sid()}/env`, body, stepLine((l) => {
        if (l.type === "done") { S.live.done = true; S.live.waiting = null; }
        else if (l.type === "error") { S.live.error = l.why || "It stopped."; S.live.waiting = null; }
        else if (l.type === "line") S.live.lines.push(l.line);
        else { S.live.items[l.type] = l; S.live.waiting = { reach: "signin", signin: "settings", settings: "gates", gates: "vendors", vendors: null }[l.type] ?? S.live.waiting; }
      })).done;
      if (!S.live.error) { await reload(); S.view = "environment"; await loadProfiles(); }
    } catch (e) { S.live.error = e.message; }
    paint();
  }
  async function useProfile(profileId) {
    try { S.cur = await json("POST", `/api/session/${sid()}/env/use`, { profileId }); S.view = "environment"; S.form.editing = false; } catch (e) { S.err = e.message; }
    paint();
  }

  // ── Requirement ───────────────────────────────────────────────────────────
  function reqBody() {
    const s = S.cur; const u = s.understanding; const f = S.form; const L = S.live?.step === "requirement" ? S.live : null;
    if (L) {
      const parsed = L.parsed || [];
      return `<ol class="gs-live">${parsed.map((p) => `<li class="${p.ok === false ? "bad" : "ok"}"><span class="gs-n">${p.ok === false ? icon("x") : icon("check")}</span><span><b>${h(p.what ? `Read ${p.what}` : "Read")}</b><small>${h(p.line || "")}</small></span></li>`).join("")}${!L.done && !L.error ? `<li class="now"><span class="gs-n"><i class="gs-spin"></i></span><span><b>${h(L.items.understanding ? "Listing what it leaves open" : parsed.length ? "Working out what it says" : "Reading the document")}</b><small>${h(L.lines.at(-1) || "")}</small></span></li>` : ""}${L.items.understanding ? `<li class="ok"><span class="gs-n">${icon("check")}</span><span><b>Worked out what it says</b><small>${h(cardLine(L.items.understanding.card))}</small></span></li>` : ""}${L.items.questions ? `<li class="ok"><span class="gs-n">${icon("check")}</span><span><b>Listed what it leaves open</b><small>${h(plural((L.items.questions.questions || []).length, "open question"))}</small></span></li>` : ""}</ol>${L.error ? `<p class="gs-msg bad">${h(L.error)}</p>` : ""}`;
    }
    if (u && !f.editing) {
      const open = (u.questions || []).filter((x) => !x.answer && !x.skipped);
      const toApply = (u.questions || []).filter((x) => x.answer && !x.applied);
      return (
        `<div class="gs-under">` +
        `<div class="gs-under-head"><b>${h(u.title || s.intake?.prd?.name || "The requirement")}</b><span>${h(s.intake?.prd?.what || "text")} · ${h(String(s.intake?.prd?.chars || 0))} characters${s.intake?.figma?.frames ? ` · ${plural(s.intake.figma.frames, "Figma frame")}` : ""}${s.intake?.frames ? ` · ${plural(s.intake.frames, "frame")}` : ""}${s.intake?.sheet ? ` · your sheet, ${plural(s.intake.sheet.count, "case")}` : ""}${u.version > 1 ? ` · version ${u.version}` : ""}</span><button type="button" class="gs-link" data-act="req-edit">Change</button></div>` +
        (u.summary ? `<p class="gs-summary">${h(u.summary)}</p>` : "") +
        `<div class="gs-under-grid">` +
        `<div class="gs-block"><h4>Features</h4><ul>${(u.features || []).map((x) => `<li>${h(x.name || x)}${x.what ? `<small>${h(x.what)}${x.existing ? " · already in Procol" : ""}${x.off ? " · switched off here" : ""}</small>` : ""}</li>`).join("")}</ul></div>` +
        `<div class="gs-block"><h4>Roles</h4><ul>${(u.roles || []).map((x) => `<li>${h(x.name || x)}${x.canDo?.length ? `<small>can ${x.canDo.map(h).join(", ")}</small>` : ""}</li>`).join("")}</ul></div>` +
        `<div class="gs-block"><h4>Flows</h4><ol>${(u.flows || []).map((fl) => `<li><b>${h(fl.name)}</b><small>${(fl.steps || []).map(h).join(" → ")}${fl.endState ? ` · ends: ${h(fl.endState)}` : ""} · ${h(fl.layer || "")}</small></li>`).join("")}</ol></div>` +
        `<div class="gs-block"><h4>Rules</h4><ul>${(u.rules || []).map((r) => `<li><span class="tag-v tag-grey">${h(r.kind)}</span> ${h(r.text)} <small>${h(r.source)}${r.settingKey ? ` · ${h(r.settingKey)} is ${h(r.settingNow)} here` : ""}</small></li>`).join("")}</ul></div>` +
        block("States", u.states) + block("Data it needs", u.data) + block("Out of scope", u.outOfScope) + block("Assumptions", u.assumptions) +
        (u.grounding ? `<div class="gs-block"><h4>Grounded in this company</h4><ul>${(u.grounding.settings || []).map((x) => `<li>${h(x.name)} <small>${h(x.key)} = ${h(x.now)}</small></li>`).join("")}${(u.grounding.defects || []).map((d) => `<li>Earlier ticket: ${h(d.title)}</li>`).join("")}${u.grounding.existing ? `<li>${plural(u.grounding.existing, "case")} already in the catalog</li>` : ""}</ul></div>` : "") +
        `</div>` +
        `<div class="gs-questions"><h4>${open.length ? `${plural(open.length, "question")} the document leaves open` : "Every open question is answered"}</h4>` +
        (u.questions || []).map((qq) => `<div class="gs-q${qq.answer || qq.skipped ? " done" : ""}"><p>${h(qq.text)}</p>${qq.why ? `<small>${h(qq.why)}${qq.from ? ` · ${h(qq.from)}` : ""}</small>` : ""}${qq.answer ? `<span class="gs-answer">${h(qq.answer)}${qq.applied ? " · applied" : ""}</span>` : qq.skipped ? `<span class="gs-answer muted">Skipped</span>` : `<form class="gs-q-form" data-q="${h(qq.id)}"><input type="text" name="answer" placeholder="Your answer"><button type="submit" class="gs-btn small">Answer</button><button type="button" class="gs-link" data-skip="${h(qq.id)}">Skip</button></form>`}</div>`).join("") +
        (toApply.length ? `<div class="gs-acts"><button type="button" class="gs-btn" data-act="apply">${icon("rotate-cw")}Apply ${plural(toApply.length, "answer")}</button><span class="gs-hint">Answered questions stay on the card; new rules say which answer they came from.</span></div>` : "") +
        `</div>` +
        (u.notes?.length ? `<p class="gs-hint">${u.notes.map(h).join(" ")}</p>` : "") +
        `<div class="gs-acts"><button type="button" class="gs-btn primary" data-act="next">Continue to Sanity ${icon("arrow-right")}</button></div></div>`
      );
    }
    return (
      `<form id="gs-req" class="gs-form">` +
      `<label class="gs-drop" id="gs-drop"><input type="file" name="file" accept=".pdf,.docx,.md,.txt" hidden>${icon("upload")}<b>${f.fileName ? h(f.fileName) : "Drop the PRD here"}</b><span>${f.fileName ? "click to pick another" : "or click to choose · PDF, Word, Markdown or text"}</span></label>` +
      `<div class="gs-field"><label for="gs-paste">…or paste its text</label><textarea id="gs-paste" name="text" rows="6" placeholder="The requirement, headings and all">${h(f.text || "")}</textarea></div>` +
      `<div class="gs-grid2"><div class="gs-field"><label for="gs-notion">Notion page (optional)</label><input id="gs-notion" name="notion" type="url" placeholder="https://notion.so/…" value="${h(f.notion || "")}"></div><div class="gs-field"><label for="gs-figma">Figma file (optional)</label><input id="gs-figma" name="figma" type="url" placeholder="https://figma.com/file/…" value="${h(f.figma || "")}"></div></div>` +
      (f.figma ? `<div class="gs-field"><label for="gs-figma-token">Figma token (optional, kept for this session only)</label><input id="gs-figma-token" name="figmaToken" type="text" value="${h(f.figmaToken || "")}" placeholder="figd_…"></div>` : "") +
      `<div class="gs-grid2"><div class="gs-field"><label>Figma frames (optional)</label><label class="gs-btn gs-file">${icon("upload")}Choose frames<input type="file" name="frames" accept=".png,.jpg" multiple hidden></label></div><div class="gs-field"><label>Your own test-case sheet (optional)</label><label class="gs-btn gs-file">${icon("upload")}Choose a sheet<input type="file" name="sheet" accept=".xlsx,.csv" hidden></label></div></div>` +
      `<div class="gs-acts"><button type="submit" class="gs-btn primary">${icon("file-text")}Read it</button><span class="gs-hint">spine.ai reads it into features, roles, flows, rules, states and data, and lists what it leaves open.</span></div></form>`
    );
  }
  const block = (title, items) => `<div class="gs-block"><h4>${h(title)}</h4>${items?.length ? `<ul>${items.map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : `<p class="gs-hint">None named.</p>`}</div>`;
  const cardLine = (c) => c ? `${plural((c.features || []).length, "feature")}, ${plural((c.flows || []).length, "flow")}, ${plural((c.rules || []).length, "rule")}` : "";
  const toB64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(file); });
  async function reqSubmit(form) {
    const file = form.file?.files?.[0]; const text = form.text.value.trim();
    if (!file && text.length < 200) { S.err = "Drop a document or paste at least a few paragraphs."; return paint(); }
    S.err = null; S.form = { ...S.form, editing: false, text };
    S.live = { step: "requirement", items: {}, lines: [], parsed: [], done: false, error: null };
    paint();
    const body = { prd: file ? { name: file.name, data: await toB64(file) } : { text } };
    if (form.notion.value.trim()) body.notion = { url: form.notion.value.trim() };
    if (form.figma.value.trim()) body.figma = { url: form.figma.value.trim(), token: form.figmaToken?.value?.trim() || undefined };
    if (form.frames?.files?.length) body.frames = await Promise.all([...form.frames.files].map(async (fr) => ({ name: fr.name, data: await toB64(fr) })));
    if (form.sheet?.files?.length) body.sheet = { name: form.sheet.files[0].name, data: await toB64(form.sheet.files[0]) };
    try {
      await stream("POST", `/api/session/${sid()}/intake`, body, stepLine((l) => {
        if (l.type === "done") S.live.done = true;
        else if (l.type === "error") S.live.error = l.why;
        else if (l.type === "parsed") S.live.parsed.push(l);
        else if (l.type === "line") S.live.lines.push(l.line);
        else S.live.items[l.type] = l;
      })).done;
      if (!S.live.error) { await reload(); S.view = "requirement"; S.live = null; }
    } catch (e) { S.live.error = e.message; }
    paint();
  }
  async function answer(qid, text, skip) {
    try { const d = await json("POST", `/api/session/${sid()}/answer`, skip ? { questionId: qid, skip: true } : { questionId: qid, answer: text }); if (d.card) S.cur.understanding = d.card; } catch (e) { S.err = e.message; }
    paint();
  }
  async function apply() {
    S.err = null;
    try { await stream("POST", `/api/session/${sid()}/apply`, {}, stepLine((l) => { if (l.type === "understanding" && l.card) S.cur.understanding = l.card; else if (l.type === "error") S.err = l.why; })).done; await reload(); S.view = "requirement"; } catch (e) { S.err = e.message; }
    paint();
  }

  // ── Sanity ────────────────────────────────────────────────────────────────
  function sanityBody() {
    const s = S.cur; const flows = s.understanding?.flows || []; const L = S.live?.step === "sanity" ? S.live : null; const res = Object.fromEntries((s.sanity?.flows || []).map((f) => [f.id, f]));
    if (!flows.length) return `<p class="gs-hint">No flows yet — the Requirement step works them out from the document.</p>`;
    const V = { works: "tag-ok", broken: "tag-bad", "couldn't reach": "tag-warn" };
    const flowsQ = S.questions.find((q) => q.source === "flows" && q.answeredAt && q.answer);
    const picked = flowsQ ? new Set(String(flowsQ.answer).split(",")) : null;
    const ticked = (f) => S.sel.size ? S.sel.has(f.id) : picked ? picked.has(f.id) : !s.sanity;
    return (
      `<div class="gs-flows">${flows.map((f) => { const r = L?.items[f.id] || res[f.id]; const running = L && L.current === f.id; return `<div class="gs-flow${running ? " now" : ""}"><label><input type="checkbox" data-flow="${h(f.id)}"${ticked(f) ? " checked" : ""}${L ? " disabled" : ""}> <b>${h(f.name)}</b></label>${r?.verdict ? `<span class="tag-v ${V[r.verdict] || "tag-grey"}">${h(r.verdict)}</span>` : running ? `<span class="tag-v tag-live">running</span>` : ""}<small>${(f.steps || []).map(h).join(" → ")}</small>${running && L.lines.length ? `<ul class="gs-lines">${L.lines.slice(-4).map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : ""}${running && L.frame ? `<img class="gs-frame" alt="The browser, live" src="data:image/jpeg;base64,${L.frame}">` : ""}${r?.why ? `<p class="gs-why">${h(r.why)}</p>` : ""}${r?.blockers?.length ? `<p class="gs-warn">${r.blockers.map(h).join(" · ")}</p>` : ""}${r?.shots?.length ? `<div class="gs-shots">${r.shots.map((x) => `<span>${h(x)}</span>`).join("")}</div>` : ""}</div>`; }).join("")}</div>` +
      (s.sanity?.tally && !L ? `<div class="gs-tally"><span class="tag-v tag-ok">${s.sanity.tally.works} works</span><span class="tag-v tag-bad">${s.sanity.tally.broken} broken</span><span class="tag-v tag-warn">${s.sanity.tally.unreached} couldn't reach</span>${s.sanity.accepted ? `<span class="gs-count">accepted</span>` : ""}</div>` : "") +
      `<div class="gs-acts">${L ? `<span class="gs-hint"><i class="gs-spin"></i> Running the flows live…</span>` : `<button type="button" class="gs-btn primary" data-act="sanity-run">${icon("play")}Run the ticked flows</button>${s.sanity ? `<button type="button" class="gs-btn" data-act="sanity-accept">${icon("check")}Accept and continue to Cases ${icon("arrow-right")}</button>` : ""}`}</div>`
    );
  }
  async function sanityRun() {
    const ids = [...root().querySelectorAll("[data-flow]:checked")].map((x) => x.dataset.flow);
    if (!ids.length) { S.err = "Tick at least one flow."; return paint(); }
    S.err = null; S.live = { step: "sanity", items: {}, lines: [], frame: null, current: null, done: false, error: null }; paint();
    try {
      await stream("POST", `/api/session/${sid()}/sanity`, { flowIds: ids }, stepLine((l) => {
        if (l.type === "flow-start") { S.live.current = l.id; S.live.lines = []; S.live.frame = null; }
        else if (l.type === "line") S.live.lines.push(l.line);
        else if (l.type === "frame") S.live.frame = l.frame || null;
        else if (l.type === "flow-done") { const fl = l.flow || l; S.live.items[fl.id] = fl; S.live.current = null; }
        else if (l.type === "done") S.live.done = true;
        else if (l.type === "error") S.live.error = l.why;
      })).done;
      await reload(); S.view = "sanity"; S.live = null;
    } catch (e) { S.live.error = e.message; }
    paint();
  }
  async function sanityAccept() { try { S.cur = await json("POST", `/api/session/${sid()}/sanity/accept`, {}); S.view = "cases"; S.sel.clear(); } catch (e) { S.err = e.message; } paint(); }

  // ── Cases ─────────────────────────────────────────────────────────────────
  const KIND_LABEL = { happy: "Happy flows", negative: "Negative", edge: "Edge", permission: "Permission", state: "State", settings: "Settings", data: "Data", timing: "Timing", visibility: "Visibility", api: "API", design: "Design", regression: "Regression" };
  const kindLabel = (k) => KIND_LABEL[k] || (k ? k[0].toUpperCase() + k.slice(1) : "");
  function casesBody() {
    const s = S.cur; const L = S.live?.step === "cases" ? S.live : null; const g = s.generation;
    if (L || g) {
      const sections = L ? L.sections : (g.sections || []).map((x) => ({ ...x, rows: (g.rows || []).filter((r) => (x.caseIds || []).includes(r.id)) }));
      return (
        `<div class="gs-sections">${sections.map((sec) => `<div class="gs-section${sec.live ? " now" : ""}"><div class="gs-section-head"><b>${h(kindLabel(sec.kind))}</b><span class="gs-basis">${h(sec.basis)}</span><span class="gs-count">${sec.live ? `${sec.rows.length} of ${sec.planned}` : plural(sec.count ?? sec.rows.length, "case")}${sec.existing ? ` · ${sec.existing} already in the catalog` : ""}</span></div><ol class="gs-caselist">${(sec.rows || []).map((r) => `<li><code>${h(r.id)}</code><span>${h(r.title)}${r.source === "to confirm" ? ` <span class="tag-v tag-warn">to confirm</span>` : ""}</span>${r.existing ? `<span class="tag-v tag-grey">already have it</span>` : ""}<span class="tag-v tag-grey">${h(r.priority)}</span></li>`).join("")}${sec.live ? `<li class="gs-waiting"><i class="gs-spin"></i> Writing the next case…</li>` : ""}</ol>${sec.note ? `<p class="gs-hint gs-section-note">${h(sec.note)}</p>` : ""}</div>`).join("")}</div>` +
        (L && !L.done ? `<p class="gs-hint"><i class="gs-spin"></i> ${h(L.lines.at(-1) || (L.sections.length ? "Writing section by section — each shows its basis first, then its rows." : "Waiting for the model to plan the sections…"))}</p>${L.error ? `<p class="gs-msg bad">${h(L.error)}</p>` : ""}` : `<div class="gs-acts"><button type="button" class="gs-btn primary" data-act="next">Review ${plural(g?.total || 0, "case")} ${icon("arrow-right")}</button><button type="button" class="gs-btn" data-act="cases-again">Generate again</button></div>`)
      );
    }
    const depth = S.form.depth || "standard";
    const kinds = S.kinds.length ? S.kinds : Object.keys(KIND_LABEL).map((k) => ({ kind: k, basis: "" }));
    const def = ["happy", "negative", "edge"];
    const on = (k) => S.sel.has(k) || (!S.sel.size && def.includes(k));
    return (
      `<div class="gs-kinds">${kinds.map(({ kind, basis }) => `<label class="gs-kind${on(kind) ? " on" : ""}"><input type="checkbox" data-kind="${h(kind)}"${on(kind) ? " checked" : ""}><b>${h(kindLabel(kind))}</b><small>${h(basis)}</small></label>`).join("")}</div>` +
      `<div class="gs-field"><label>Depth</label><div class="gs-seg">${[["quick", "Quick", "2 a kind"], ["standard", "Standard", "3 a kind"], ["deep", "Deep", "5 a kind"]].map(([v, l, sub]) => `<button type="button" class="${depth === v ? "on" : ""}" data-depth="${v}">${h(l)}<small>${h(sub)}</small></button>`).join("")}</div></div>` +
      `<div class="gs-acts"><button type="button" class="gs-btn primary" data-act="generate">${icon("file-text")}Generate</button><span class="gs-hint">Each section shows the rule and the technique it used, then its rows.</span></div>`
    );
  }
  async function generate() {
    const kinds = [...root().querySelectorAll("[data-kind]:checked")].map((x) => x.dataset.kind);
    if (!kinds.length) { S.err = "Pick at least one kind."; return paint(); }
    S.err = null; S.live = { step: "cases", sections: [], lines: [], done: false, error: null }; paint();
    try {
      await stream("POST", `/api/session/${sid()}/generate`, { kinds, depth: S.form.depth || "standard" }, stepLine((l) => {
        if (l.type === "section-start") S.live.sections.push({ kind: l.kind, basis: l.basis, planned: l.planned, rows: [], live: true });
        else if (l.type === "case") S.live.sections.at(-1)?.rows.push(l.row);
        else if (l.type === "section-done") { const sec = S.live.sections.find((x) => x.kind === l.kind && x.live); if (sec) Object.assign(sec, { live: false, count: l.count, existing: l.existing, note: l.note }); }
        else if (l.type === "line") S.live.lines.push(l.line);
        else if (l.type === "done") S.live.done = true;
        else if (l.type === "error") S.live.error = l.why;
      })).done;
      await reload(); S.view = "cases"; S.live = null;
    } catch (e) { S.live.error = e.message; }
    paint();
  }

  // ── Review ────────────────────────────────────────────────────────────────
  function reviewBody() {
    const s = S.cur; const R = S.form.review; const g = s.generation;
    if (!R) { loadReview(); return `<p class="gs-hint"><i class="gs-spin"></i> Loading the cases…</p>`; }
    const rows = R.cases || []; const sections = R.sections || g?.sections || [];
    if (!rows.length) return `<p class="gs-hint">No cases yet — generate them on the Cases step.</p>`;
    const bySec = sections.map((sec) => ({ sec, rows: rows.filter((r) => (sec.caseIds || []).includes(r.id)) }));
    const loose = rows.filter((r) => !sections.some((sec) => (sec.caseIds || []).includes(r.id)));
    if (loose.length) bySec.push({ sec: { kind: "merged", basis: "From your sheet" }, rows: loose });
    const table = (rs) => `<table class="gs-table"><thead><tr><th>ID</th><th>Test case</th><th>Expected result</th><th>Priority</th><th></th></tr></thead><tbody>${rs.map((r) => `<tr data-row="${h(r.id)}"><td><code>${h(r.id)}</code></td><td contenteditable="${R.frozen ? "false" : "true"}" data-f="title">${h(r.title)}</td><td contenteditable="${R.frozen ? "false" : "true"}" data-f="expected">${h(r.expected)}</td><td contenteditable="${R.frozen ? "false" : "true"}" data-f="priority">${h(r.priority)}</td><td>${R.frozen ? "" : `<button type="button" class="gs-link danger" data-drop="${h(r.id)}">Drop</button>`}</td></tr>`).join("")}</tbody></table>`;
    return (
      `<div class="gs-review-tools"><span class="gs-count">${plural(rows.length, "case")}${R.sheet ? ` · sheet ${h(R.sheet.name)} v${R.sheet.version}${R.frozen ? " · frozen" : ""}` : ""}</span><span class="home-spacer"></span>${R.frozen ? "" : `<label class="gs-btn gs-file">${icon("upload")}Upload a test-case sheet<input type="file" id="gs-merge" accept=".xlsx,.csv" hidden></label><button type="button" class="gs-btn primary" data-act="approve">${icon("check")}Approve all and freeze</button>`}</div>` +
      (S.form.merge ? `<p class="gs-msg">Merged ${plural(S.form.merge.added, "case")} from your sheet.${S.form.merge.duplicates?.length ? ` ${plural(S.form.merge.duplicates.length, "duplicate")} kept out: ${S.form.merge.duplicates.map((d) => `${h(d.title || d.id)} = ${(d.matches || []).map(h).join(", ")}`).join("; ")}` : ""}</p>` : "") +
      bySec.map(({ sec, rows: rs }) => rs.length ? `<div class="gs-rev-sec"><div class="gs-section-head"><b>${h(kindLabel(sec.kind))}</b><span class="gs-basis">${h(sec.basis || "")}</span></div>${table(rs)}</div>` : "").join("") +
      (R.frozen ? `<div class="gs-acts"><button type="button" class="gs-btn primary" data-act="next">Continue to Run ${icon("arrow-right")}</button></div>` : "")
    );
  }
  async function loadReview() { try { S.form.review = await json("GET", `/api/session/${sid()}/review`); } catch (e) { S.form.review = { cases: [], sections: [], error: e.message }; S.err = e.message; } paint(); }
  async function approve() {
    const edits = []; const drops = S.form.drops || [];
    for (const tr of root().querySelectorAll("tr[data-row]")) { const patch = {}; for (const td of tr.querySelectorAll("[data-f]")) patch[td.dataset.f] = td.textContent.trim(); edits.push({ id: tr.dataset.row, patch }); }
    try { await json("POST", `/api/session/${sid()}/review`, { edits, drops, approve: true }); await reload(); S.view = "review"; S.form.drops = []; S.form.review = null; } catch (e) { S.err = e.message; }
    paint();
  }

  // ── Run ───────────────────────────────────────────────────────────────────
  const PILL = { Pass: "tag-ok", Fail: "tag-bad", "Couldn't tell": "tag-warn", "Not run": "tag-grey", "Partly checked": "tag-warn" };
  function runBody() {
    const s = S.cur; const L = S.live?.step === "run" ? S.live : null; const R = S.form.report; const scope = S.form.scope || "p0p1";
    if (!L && !R && s.execution) { loadReport(); return `<p class="gs-hint"><i class="gs-spin"></i> Loading the report…</p>`; }
    const results = L ? L.results : Object.values(R?.latest || {});
    const tally = L ? null : R?.tally;
    return (
      (!L ? `<div class="gs-field"><label>What to run</label><div class="gs-seg">${[["all", "All cases"], ["p0p1", "P0 and P1 only"], ["sections", "Some sections"]].map(([v, l]) => `<button type="button" class="${scope === v ? "on" : ""}" data-scope="${v}">${h(l)}</button>`).join("")}</div>${scope === "sections" ? `<div class="gs-chips">${(s.generation?.sections || []).map((sec) => `<label class="gs-chip${S.sel.has(sec.kind) ? " on" : ""}"><input type="checkbox" data-sec="${h(sec.kind)}"${S.sel.has(sec.kind) ? " checked" : ""} hidden>${h(kindLabel(sec.kind))}</label>`).join("")}</div>` : ""}<label class="gs-check"><input type="checkbox" id="gs-rest"${S.form.rest ? " checked" : ""}> Rest between cases overnight (slower, kinder to UAT)</label></div><div class="gs-acts"><button type="button" class="gs-btn primary" data-act="run">${icon("play")}Run</button><span class="gs-hint">One browser at a time. Each case builds its own start state.</span></div>` : `<p class="gs-hint"><i class="gs-spin"></i> ${L.queued ? h(L.queued.line || "Waiting behind another run…") : L.current ? `Running ${h(L.current.index ? `${L.current.index} of ${L.current.total}` : "")} — ${h(L.current.title)}` : "Starting the runner…"}</p>${L.lines.length ? `<ul class="gs-lines">${L.lines.slice(-5).map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : ""}${L.frame ? `<img class="gs-frame" alt="The browser, live" src="data:image/jpeg;base64,${L.frame}">` : ""}${L.error ? `<p class="gs-msg bad">${h(L.error)}</p>` : ""}`) +
      (results.length ? `<div class="gs-tally">${["Pass", "Fail", "Couldn't tell", "Not run"].map((k) => { const n = results.filter((r) => r.status === k).length; return n ? `<span class="tag-v ${PILL[k]}">${n} ${h(k)}</span>` : ""; }).join("")}<span class="gs-count">${results.length} of ${L ? L.total || results.length : tally?.total || results.length}</span></div><ol class="gs-caselist">${results.map((r) => `<li><span class="tag-v ${PILL[r.status] || "tag-grey"}">${h(r.status)}</span><code>${h(r.id)}</code><span>${h(r.why)}</span>${r.bugId ? `<span class="tag-v tag-bad">Bug</span>` : ""}${!L ? `<button type="button" class="gs-link" data-rerun="${h(r.id)}">Run again on a fresh event</button>` : ""}</li>`).join("")}</ol>` : "") +
      (!L && R ? `<div class="gs-acts">${R.bugs?.length ? `<a class="gs-btn" href="#/bugs">${icon("bug")}Bugs (${R.bugs.length})</a>` : ""}${R.runs?.at(-1)?.workbook ? `<a class="gs-btn" href="${h(R.runs.at(-1).workbook)}">${icon("download")}Workbook</a>` : ""}${R.runs?.at(-1)?.report ? `<a class="gs-btn" href="${h(R.runs.at(-1).report)}">${icon("file-text")}Report</a>` : ""}${R.runs?.length > 1 ? `<span class="gs-count">${plural(R.runs.length, "run")} so far</span>` : ""}<button type="button" class="gs-btn" data-act="run-again">Run again</button></div>` : "")
    );
  }
  async function loadReport() { try { S.form.report = await json("GET", `/api/session/${sid()}/report`); } catch (e) { S.form.report = { runs: [], latest: {}, bugs: [], error: e.message }; S.err = e.message; } paint(); }
  const runLine = (l) => {
    const L = S.live;
    if (l.type === "case-start") { L.current = l; L.lines = []; L.frame = null; L.total = l.total || L.total; L.queued = null; }
    else if (l.type === "line") L.lines.push(l.line);
    else if (l.type === "frame") L.frame = l.frame || null;
    else if (l.type === "case-done") { L.results.push(l.result || l); L.current = null; }
    else if (l.type === "queued") L.queued = l;
    else if (l.type === "done") L.done = true;
    else if (l.type === "error") L.error = l.why;
  };
  async function run(scope, sections) {
    S.live = { step: "run", results: [], lines: [], frame: null, current: null, queued: null, total: 0, done: false, error: null }; S.form.report = null; paint();
    try { await stream("POST", `/api/session/${sid()}/run`, { scope, sections, overnightRest: !!S.form.rest }, stepLine(runLine)).done; await reload(); S.view = "run"; S.live = null; } catch (e) { S.live.error = e.message; }
    paint();
  }
  async function rerun(caseId) {
    S.live = { step: "run", results: [], lines: [], frame: null, current: null, queued: null, total: 1, done: false, error: null }; S.form.report = null; paint();
    try { await stream("POST", `/api/session/${sid()}/rerun`, { caseId }, stepLine(runLine)).done; await reload(); S.view = "run"; S.live = null; } catch (e) { S.live.error = e.message; }
    paint();
  }

  // ── wiring ────────────────────────────────────────────────────────────────
  function wire(el) {
    el.querySelector('[data-act="new"]')?.addEventListener("click", async () => { try { const d = await json("POST", "/api/session/start", { name: "Untitled session" }); go(d.id); } catch (e) { S.err = e.message; paint(); } });
    el.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => go(b.dataset.open)));
    el.querySelectorAll("[data-rename]").forEach((b) => b.addEventListener("click", async () => { const s = S.sessions.find((x) => x.id === b.dataset.rename); const name = prompt("Name this session", s?.name || ""); if (name?.trim()) { await json("POST", `/api/session/${encodeURIComponent(b.dataset.rename)}/rename`, { name: name.trim() }).catch(() => {}); await loadList(); paint(); } }));
    el.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", async () => { const s = S.sessions.find((x) => x.id === b.dataset.delete); if (!confirm(`Delete “${s?.name}”? Its answers and cases go with it.`)) return; await json("DELETE", `/api/session/${encodeURIComponent(b.dataset.delete)}`).catch(() => {}); await loadList(); paint(); }));
    if (!S.cur) return;
    const name = el.querySelector("#gs-name");
    name?.addEventListener("blur", async () => { const v = name.textContent.trim(); if (v && v !== S.cur.name) { S.cur.name = v; await json("POST", `/api/session/${sid()}/rename`, { name: v }).catch(() => {}); } });
    name?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); name.blur(); } });
    el.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => { S.view = b.dataset.step; S.err = null; S.form.editing = false; S.form.review = null; S.form.report = null; paint(); }));
    el.querySelectorAll('[data-act="next"]').forEach((b) => b.addEventListener("click", () => { const i = ORDER.indexOf(S.view); S.view = ORDER[Math.min(i + 1, ORDER.length - 1)]; if (ORDER.indexOf(S.cur.step) < ORDER.indexOf(S.view)) S.cur.step = S.view; S.form.editing = false; S.form.review = null; S.form.report = null; S.sel.clear(); paint(); }));
    // questions: on the step card and in the drawer
    el.querySelector('[data-act="drawer"]')?.addEventListener("click", () => { S.drawer = !S.drawer; paint(); });
    el.querySelector('[data-act="drawer-close"]')?.addEventListener("click", () => { S.drawer = false; paint(); });
    el.querySelectorAll(".gs-qcard").forEach((card) => {
      const qid = card.dataset.qid; const Q = S.questions.find((x) => x.qid === qid); if (!Q) return;
      card.querySelectorAll("[data-qopt]").forEach((b) => b.addEventListener("click", () => {
        if (Q.kind === "many") { const set = new Set(S.form[`q:${qid}`] || []); set.has(b.dataset.qopt) ? set.delete(b.dataset.qopt) : set.add(b.dataset.qopt); S.form[`q:${qid}`] = [...set]; paint(); }
        else answerQ(qid, b.dataset.qopt, false);
      }));
      card.querySelector("[data-qmany]")?.addEventListener("click", () => { const picked = S.form[`q:${qid}`] || String(Q.suggested || "").split(",").filter(Boolean); answerQ(qid, picked.join(","), false); });
      card.querySelector(".gs-qother")?.addEventListener("submit", (e) => { e.preventDefault(); const v = e.target.other.value.trim(); if (v) answerQ(qid, v, false); });
      card.querySelector("[data-qskip]")?.addEventListener("click", () => answerQ(qid, "", true));
    });
    // environment
    el.querySelectorAll("[data-profile]").forEach((b) => b.addEventListener("click", () => useProfile(b.dataset.profile)));
    el.querySelector("#gs-url")?.addEventListener("change", async (e) => { S.form = { ...S.form, url: e.target.value.trim(), companyId: el.querySelector("#gs-company")?.value, signIn: el.querySelector('#gs-env input[name="signIn"]:checked')?.value }; await describe(S.form.url); paint(); });
    el.querySelectorAll('#gs-env input[name="signIn"]').forEach((r) => r.addEventListener("change", () => { S.form = { ...S.form, url: el.querySelector("#gs-url").value, companyId: el.querySelector("#gs-company")?.value, signIn: r.value }; paint(); }));
    el.querySelector("#gs-env")?.addEventListener("submit", (e) => { e.preventDefault(); envSubmit(e.target); });
    el.querySelector('[data-act="env-edit"]')?.addEventListener("click", async () => { S.form.editing = true; S.live = null; if (S.cur.env) await json("POST", `/api/session/${sid()}/reopen`, { step: "environment" }).then((s) => { if (s?.id) S.cur = s; }).catch(() => {}); paint(); el.querySelector("#gs-url")?.focus(); });
    // requirement
    const drop = el.querySelector("#gs-drop"); const file = drop?.querySelector("input[type=file]");
    file?.addEventListener("change", () => { S.form.fileName = file.files?.[0]?.name; const t = el.querySelector("#gs-paste")?.value; paint(); const ta = root().querySelector("#gs-paste"); if (ta) ta.value = t || ""; const nf = root().querySelector("#gs-drop input[type=file]"); if (nf && file.files) try { nf.files = file.files; } catch {} });
    drop?.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop?.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop?.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); if (file && e.dataTransfer?.files?.length) { try { file.files = e.dataTransfer.files; } catch {} S.form.fileName = e.dataTransfer.files[0].name; paint(); } });
    el.querySelector("#gs-figma")?.addEventListener("change", (e) => { S.form.figma = e.target.value.trim(); S.form.text = el.querySelector("#gs-paste")?.value || S.form.text; S.form.notion = el.querySelector("#gs-notion")?.value || ""; paint(); });
    el.querySelector("#gs-req")?.addEventListener("submit", (e) => { e.preventDefault(); reqSubmit(e.target); });
    el.querySelector('[data-act="req-edit"]')?.addEventListener("click", async () => { S.form.editing = true; await json("POST", `/api/session/${sid()}/reopen`, { step: "requirement" }).then((s) => { if (s?.id) S.cur = s; }).catch(() => {}); paint(); });
    el.querySelectorAll(".gs-q-form").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); const v = f.answer.value.trim(); if (v) answer(f.dataset.q, v, false); }));
    el.querySelectorAll("[data-skip]").forEach((b) => b.addEventListener("click", () => answer(b.dataset.skip, "", true)));
    el.querySelector('[data-act="apply"]')?.addEventListener("click", apply);
    // sanity
    el.querySelectorAll("[data-flow]").forEach((cb) => cb.addEventListener("change", () => { if (!S.sel.size) root().querySelectorAll("[data-flow]:checked").forEach((x) => S.sel.add(x.dataset.flow)); cb.checked ? S.sel.add(cb.dataset.flow) : S.sel.delete(cb.dataset.flow); }));
    el.querySelector('[data-act="sanity-run"]')?.addEventListener("click", sanityRun);
    el.querySelector('[data-act="sanity-accept"]')?.addEventListener("click", sanityAccept);
    // cases
    el.querySelectorAll("[data-kind]").forEach((cb) => cb.addEventListener("change", () => { if (!S.sel.size) ["happy", "negative", "edge"].forEach((k) => S.sel.add(k)); cb.checked ? S.sel.add(cb.dataset.kind) : S.sel.delete(cb.dataset.kind); paint(); }));
    el.querySelectorAll("[data-depth]").forEach((b) => b.addEventListener("click", () => { S.form.depth = b.dataset.depth; paint(); }));
    el.querySelector('[data-act="generate"]')?.addEventListener("click", generate);
    el.querySelector('[data-act="cases-again"]')?.addEventListener("click", () => { S.cur.generation = null; S.sel.clear(); paint(); });
    // review
    el.querySelectorAll("[data-drop]").forEach((b) => b.addEventListener("click", () => { S.form.drops = [...(S.form.drops || []), b.dataset.drop]; if (S.form.review) S.form.review.cases = S.form.review.cases.filter((r) => r.id !== b.dataset.drop); paint(); }));
    el.querySelector('[data-act="approve"]')?.addEventListener("click", approve);
    el.querySelector("#gs-merge")?.addEventListener("change", async (e) => { const f = e.target.files?.[0]; if (!f) return; try { S.form.merge = await json("POST", `/api/session/${sid()}/merge`, { name: f.name, data: await toB64(f) }); S.form.review = null; await reload(); S.view = "review"; } catch (err) { S.err = err.message; } paint(); });
    // run
    el.querySelectorAll("[data-scope]").forEach((b) => b.addEventListener("click", () => { S.form.scope = b.dataset.scope; paint(); }));
    el.querySelectorAll("[data-sec]").forEach((cb) => cb.addEventListener("change", () => { cb.checked ? S.sel.add(cb.dataset.sec) : S.sel.delete(cb.dataset.sec); paint(); }));
    el.querySelector("#gs-rest")?.addEventListener("change", (e) => (S.form.rest = e.target.checked));
    el.querySelector('[data-act="run"]')?.addEventListener("click", () => run(S.form.scope || "p0p1", [...S.sel]));
    el.querySelector('[data-act="run-again"]')?.addEventListener("click", () => { S.form.report = { runs: S.form.report?.runs || [], latest: {}, bugs: [], tally: null }; S.cur.execution = null; paint(); });
    el.querySelectorAll("[data-rerun]").forEach((b) => b.addEventListener("click", () => rerun(b.dataset.rerun)));
  }

  // Enter on a single-line field advances the form it is in.
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target?.matches?.("#gs-root input[type=url], #gs-root input[type=text]") && !e.target.closest(".gs-q-form, .gs-qother")) { e.preventDefault(); e.target.form?.requestSubmit?.(); } });
  window.addEventListener("hashchange", route);
  if (document.readyState !== "loading") route(); else document.addEventListener("DOMContentLoaded", route);
  window.spineGuided = { state: S, paint, route };
})();
