/**
 * THE GUIDED TESTING SESSION — the frontend (Track B, section 10.3).
 *
 *   #/s          the sessions list: resume, rename, delete, start a new one
 *   #/s/<id>     one session: a stepper (Environment → Requirement → Sanity → Cases → Review → Run),
 *                each step a card; earlier steps reopen. ?mock=1 loads session-mock.js, which answers
 *                every route with realistic data and timed SSE lines, so the flow runs before the
 *                backend exists. The flag sticks for the tab (sessionStorage).
 *
 * Built against the API contract in section 10.2, all routes under /api/session/. Long work streams
 * Server-Sent Events as {type, ...} lines: the real routes are read from a fetch body (POST streams
 * cannot use EventSource); the mock yields the same lines from an async generator. Same code either way.
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

  const STEPS = [
    ["environment", "Environment", "Where the tests run, and that spine.ai can sign in there"],
    ["requirement", "Requirement", "What is being tested: the PRD, the frames, your own sheet"],
    ["sanity", "Sanity", "The happy flows, run live, before any case is written"],
    ["cases", "Cases", "The test cases, kind by kind, each with the rule it comes from"],
    ["review", "Review", "Edit, drop, approve; merge your own sheet; freeze a version"],
    ["run", "Run", "Run what you chose, watch it, read the tally and the bugs"],
  ];
  const ORDER = STEPS.map((s) => s[0]);

  // ── state ─────────────────────────────────────────────────────────────────
  const S = {
    mock: false,
    sessions: [],
    cur: null,          // the session object
    view: null,         // the step shown (may be an earlier one than cur.step)
    live: null,         // { step, lines: [...], items: {...}, error, done }  — the SSE in progress
    clients: [],
    profiles: [],
    form: {},           // what is typed on the current step, kept across repaints
    sel: new Set(),     // ticks (flows, sections)
    err: null,
  };

  // ── the API, real or mock ─────────────────────────────────────────────────
  const mockOn = () => S.mock && !!window.spineGuidedMock;
  async function json(method, path, body) {
    if (mockOn()) return window.spineGuidedMock.call(method, path, body);
    const r = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || d.why || `The server answered ${r.status}`);
    return d;
  }
  /** A streaming route: every {type, ...} line goes to on(line); resolves when the stream ends. */
  async function stream(path, body, on) {
    if (mockOn()) {
      const gen = await window.spineGuidedMock.call("POST", path, body);
      for await (const line of gen) { on(line); if (line.type === "error") break; }
      return;
    }
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok || !r.body) throw new Error(`The server answered ${r.status}`);
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
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
  }

  // ── loading ───────────────────────────────────────────────────────────────
  async function loadList() {
    try { S.sessions = (await json("GET", "/api/session/list")).sessions || []; S.err = null; } catch (e) { S.sessions = []; S.err = e.message; }
  }
  async function loadClients() {
    if (S.clients.length) return;
    try { const d = await fetch("/api/clients", { cache: "no-store" }).then((x) => x.json()); S.clients = (d.clients || []).map((c) => ({ id: c.id ?? c.companyId, name: c.name })); } catch { S.clients = [{ id: 198678, name: "PROCOL DEMO" }]; }
  }
  async function loadProfiles() { try { S.profiles = (await json("GET", "/api/session/env/profiles")).profiles || []; } catch { S.profiles = []; } }
  async function open(id) {
    try { S.cur = await json("GET", `/api/session/${encodeURIComponent(id)}`); S.view = S.cur.step; S.err = null; } catch (e) { S.cur = null; S.err = e.message; }
    S.live = null; S.form = {}; S.sel.clear();
  }
  async function reload() { if (S.cur) { const v = S.view; await open(S.cur.id); S.view = v; } }

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
    if (!r) return;
    await ensureMock();
    if (r.id) { if (!S.cur || S.cur.id !== r.id) await open(r.id); await loadClients(); await loadProfiles(); }
    else { S.cur = null; await loadList(); }
    paint();
  }
  const go = (id) => { location.hash = id ? `#/s/${encodeURIComponent(id)}` : "#/s"; };

  // ── painting ──────────────────────────────────────────────────────────────
  function paint() {
    const el = root(); if (!el) return;
    el.innerHTML = `<div class="gs-col">${S.cur ? sessionPage() : listPage()}</div>`;
    wire(el);
  }
  const mockChip = () => (S.mock ? `<span class="gs-mock" title="Answered by the mock, not the server (drop ?mock=1 to use the real routes)">mock</span>` : "");

  function listPage() {
    return (
      `<header class="gs-head"><h1>Testing sessions</h1>${mockChip()}<span class="home-spacer"></span><button type="button" class="gs-btn primary" data-act="new">${icon("plus")}Start a testing session</button></header>` +
      `<p class="gs-lead">A session walks the tester's order and remembers every answer: where to test, what to test, the happy flows first, then the cases, your review, and the run.</p>` +
      (S.err ? `<p class="gs-msg bad">${h(S.err)}</p>` : "") +
      (S.sessions.length
        ? `<div class="gs-rows">${S.sessions.map((s) => `<div class="gs-row"><button type="button" class="gs-row-main" data-open="${h(s.id)}"><span class="gs-row-title">${h(s.name)}</span><span class="gs-row-meta">${h([s.feature, s.env].filter(Boolean).join(" · ") || "Nothing set yet")} · ${h(when(s.updatedAt))}</span></button><span class="tag-v ${s.step === "run" ? "tag-ok" : "tag-grey"}">${h(STEPS.find((x) => x[0] === s.step)?.[1] || s.step)}</span><button type="button" class="gs-link" data-rename="${h(s.id)}">Rename</button><button type="button" class="gs-link danger" data-delete="${h(s.id)}">Delete</button></div>`).join("")}</div>`
        : `<div class="gs-empty"><b>No sessions yet</b><span>Start one and spine.ai asks where to test first.</span></div>`)
    );
  }

  function sessionPage() {
    const s = S.cur; const at = ORDER.indexOf(s.step); const shown = S.view || s.step;
    return (
      `<header class="gs-head"><a class="gs-link" href="#/s">${icon("arrow-left")}All sessions</a><h1 contenteditable="true" spellcheck="false" id="gs-name" aria-label="Session name">${h(s.name)}</h1>${mockChip()}<span class="home-spacer"></span><span class="gs-meta">${h(s.env ? `${s.env.companyName} · ${s.env.url.replace(/^https?:\/\//, "")}` : "No environment yet")}</span></header>` +
      `<ol class="gs-stepper">${STEPS.map(([key, label], i) => { const state = i < at ? "done" : i === at ? "now" : "todo"; const can = i <= at; return `<li class="${state}${key === shown ? " shown" : ""}"><button type="button" data-step="${key}"${can ? "" : " disabled"}><span class="gs-n">${state === "done" ? icon("check") : i + 1}</span><span class="gs-step-l">${h(label)}</span></button></li>`; }).join("")}</ol>` +
      (S.err ? `<p class="gs-msg bad">${h(S.err)}</p>` : "") +
      `<section class="gs-card" data-card="${shown}"><div class="gs-card-head"><h2>${h(STEPS.find((x) => x[0] === shown)[1])}</h2><p>${h(STEPS.find((x) => x[0] === shown)[2])}</p></div>${stepBody(shown)}</section>`
    );
  }

  function stepBody(step) {
    return { environment: envBody, requirement: reqBody, sanity: sanityBody, cases: casesBody, review: reviewBody, run: runBody }[step]?.() || "";
  }

  /** The live checklist a streaming step paints: one line per event, ticked as it lands. */
  function liveList(expect) {
    const L = S.live; if (!L) return "";
    return `<ol class="gs-live">${expect.map(([type, label]) => { const got = L.items[type]; const cls = got ? (got.ok === false ? "bad" : "ok") : L.done || L.error ? "skip" : L.waiting === type ? "now" : "todo"; return `<li class="${cls}"><span class="gs-n">${cls === "ok" ? icon("check") : cls === "bad" ? icon("x") : cls === "now" ? `<i class="gs-spin"></i>` : ""}</span><span><b>${h(label)}</b>${got?.line ? `<small>${h(got.line)}</small>` : got?.why ? `<small>${h(got.why)}</small>` : cls === "now" ? `<small>Waiting for the server…</small>` : ""}</span></li>`; }).join("")}</ol>` + (L.error ? `<p class="gs-msg bad">${h(L.error)}</p>` : "");
  }

  // ── B1.2 Environment ──────────────────────────────────────────────────────
  function envBody() {
    const s = S.cur; const f = S.form; const env = s.env;
    if (S.live?.step === "environment" || (env && !f.editing)) {
      const p = env || {};
      const done = !S.live || S.live.done;
      return (
        liveList([["reach", "Reach the environment"], ["signin", "Sign in"], ["settings", "Read the company settings"], ["vendors", "Find the QA test vendors"]]) +
        (done && env
          ? `<div class="gs-profile"><div class="gs-profile-head">${icon("globe")}<b>${h(p.companyName)}</b><span>${h(p.url)}</span><span class="tag-v tag-ok">Saved as a profile</span></div>` +
            `<dl><dt>Signed in</dt><dd>${h(p.signIn === "otp" ? "as the buyer, by one-time code" : p.signIn === "token" ? "with a saved token" : "through the console, as Procol Support")}</dd>` +
            `<dt>Settings</dt><dd>${(p.snapshot?.gates || []).map((g) => `<code>${h(g)}</code>`).join(" ") || "—"}${p.snapshot?.hidden?.length ? `<small>${plural(p.snapshot.hidden.length, "setting is hidden and stays as it is", "settings are hidden and stay as they are")}: ${p.snapshot.hidden.map(h).join(", ")}</small>` : ""}</dd>` +
            `<dt>QA vendors</dt><dd>${p.snapshot?.vendors ? `${plural(p.snapshot.vendors, "QA test vendor")} ready to bid` : `<span class="gs-warn">None on this company — bids cannot be placed here</span>`}</dd></dl>` +
            `<div class="gs-acts"><button type="button" class="gs-btn primary" data-act="next">Continue to Requirement ${icon("arrow-right")}</button><button type="button" class="gs-btn" data-act="env-edit">Change the environment</button></div></div>`
          : "")
      );
    }
    const prof = S.profiles;
    const url = f.url ?? env?.url ?? "https://uat.procol.app";
    const companyId = f.companyId ?? env?.companyId ?? read(() => currentClient, 198678) ?? 198678;
    const signIn = f.signIn ?? env?.signIn ?? "console";
    return (
      (prof.length ? `<div class="gs-field"><label>Use a saved profile</label><div class="gs-chips">${prof.slice(0, 6).map((p) => `<button type="button" class="gs-chip" data-profile="${h(p.id)}" title="${h(p.url)}">${h(p.label)}<small>${h(when(p.snapshotAt))}</small></button>`).join("")}</div></div>` : "") +
      `<form id="gs-env" class="gs-form">` +
      `<div class="gs-field"><label for="gs-url">Environment address</label><input id="gs-url" name="url" type="url" value="${h(url)}" placeholder="https://uat.procol.app" required></div>` +
      `<div class="gs-grid2"><div class="gs-field"><label for="gs-company">Company</label><select id="gs-company" name="companyId">${S.clients.map((c) => `<option value="${h(c.id)}"${String(c.id) === String(companyId) ? " selected" : ""}>${h(c.name)}</option>`).join("") || `<option value="198678">PROCOL DEMO</option>`}</select></div>` +
      `<div class="gs-field"><label>Sign in</label><div class="gs-radios">${[["console", "Through the console", "as Procol Support"], ["otp", "By one-time code", "the buyer's phone"], ["token", "With a saved token", "named below"]].map(([v, l, sub]) => `<label class="gs-radio${signIn === v ? " on" : ""}"><input type="radio" name="signIn" value="${v}"${signIn === v ? " checked" : ""}><span><b>${h(l)}</b><small>${h(sub)}</small></span></label>`).join("")}</div></div></div>` +
      (signIn === "token" ? `<div class="gs-field"><label for="gs-token">Token name (as kept in the platform's files, never the token itself)</label><input id="gs-token" name="tokenName" type="text" value="${h(f.tokenName ?? "")}" placeholder="PROCOL_DEMO_TOKEN"></div>` : "") +
      `<div class="gs-acts"><button type="submit" class="gs-btn primary">${icon("play")}Check and save</button><span class="gs-hint">Reaches the address, signs in, reads the company settings and finds the QA vendors. Nothing is changed.</span></div>` +
      `</form>`
    );
  }
  async function envSubmit(form) {
    const body = { url: form.url.value.trim(), companyId: Number(form.companyId.value) || undefined, signIn: form.signIn.value, tokenName: form.tokenName?.value?.trim() || undefined };
    S.form = { ...S.form, ...body, editing: false };
    S.live = { step: "environment", items: {}, waiting: "reach", done: false, error: null };
    paint();
    try {
      await stream(`/api/session/${encodeURIComponent(S.cur.id)}/env`, body, (l) => {
        if (l.type === "done") { S.live.done = true; S.live.waiting = null; }
        else if (l.type === "error") { S.live.error = l.why || "It stopped."; S.live.waiting = null; }
        else { S.live.items[l.type] = l; S.live.waiting = { reach: "signin", signin: "settings", settings: "vendors", vendors: null }[l.type] ?? null; }
        paint();
      });
      if (!S.live.error) { await reload(); S.view = "environment"; await loadProfiles(); }
    } catch (e) { S.live.error = e.message; }
    paint();
  }

  // ── B1.3 Requirement (shell; deepened on day 2) ───────────────────────────
  function reqBody() {
    const s = S.cur; const u = s.understanding; const f = S.form;
    if (S.live?.step === "requirement") return liveList([["parsed", "Read the document"], ["understanding", "Work out what it says"], ["questions", "List what it leaves open"]]);
    if (u && !f.editing) {
      const open = (u.questions || []).filter((x) => !x.answer);
      return (
        `<div class="gs-under">` +
        `<div class="gs-under-head"><b>${h(s.intake?.prd?.title || "The requirement")}</b><span>${h(s.intake?.prd?.kind || "text")} · ${h(String(s.intake?.prd?.chars || 0))} characters${s.intake?.figma ? ` · ${plural(s.intake.figma.frames, "Figma frame")}` : ""}${s.intake?.sheet ? ` · your sheet, ${plural(s.intake.sheet.count, "case")}` : ""}</span><button type="button" class="gs-link" data-act="req-edit">Change</button></div>` +
        `<div class="gs-under-grid">` +
        block("Features", u.features) + block("Roles", u.roles) +
        `<div class="gs-block"><h4>Flows</h4><ol>${(u.flows || []).map((fl) => `<li><b>${h(fl.name)}</b><small>${fl.steps.map(h).join(" → ")} · ${h(fl.layer)}</small></li>`).join("")}</ol></div>` +
        `<div class="gs-block"><h4>Rules</h4><ul>${(u.rules || []).map((r) => `<li><span class="tag-v tag-grey">${h(r.kind)}</span> ${h(r.text)} <small>${h(r.source)}</small></li>`).join("")}</ul></div>` +
        block("States", u.states) + block("Data it needs", u.data) + block("Out of scope", u.outOfScope) +
        `</div>` +
        `<div class="gs-questions"><h4>${open.length ? `${plural(open.length, "question")} the document leaves open` : "Every open question is answered"}</h4>` +
        (u.questions || []).map((qq) => `<div class="gs-q${qq.answer ? " done" : ""}"><p>${h(qq.text)}</p>${qq.answer ? `<span class="gs-answer">${h(qq.answer)}</span>` : `<form class="gs-q-form" data-q="${h(qq.id)}"><input type="text" name="answer" placeholder="Your answer"><button type="submit" class="gs-btn small">Answer</button><button type="button" class="gs-link" data-skip="${h(qq.id)}">Skip</button></form>`}</div>`).join("") +
        `</div>` +
        `<div class="gs-acts"><button type="button" class="gs-btn primary" data-act="next">Continue to Sanity ${icon("arrow-right")}</button></div></div>`
      );
    }
    return (
      `<form id="gs-req" class="gs-form">` +
      `<label class="gs-drop" id="gs-drop"><input type="file" name="file" accept=".pdf,.docx,.md,.txt" hidden>${icon("upload")}<b>${f.fileName ? h(f.fileName) : "Drop the PRD here"}</b><span>${f.fileName ? "click to pick another" : "or click to choose · PDF, Word, Markdown or text"}</span></label>` +
      `<div class="gs-field"><label for="gs-paste">…or paste its text</label><textarea id="gs-paste" name="text" rows="6" placeholder="The requirement, headings and all">${h(f.text || "")}</textarea></div>` +
      `<div class="gs-grid2"><div class="gs-field"><label for="gs-notion">Notion page (optional)</label><input id="gs-notion" name="notion" type="url" placeholder="https://notion.so/…" value="${h(f.notion || "")}"></div><div class="gs-field"><label for="gs-figma">Figma file (optional)</label><input id="gs-figma" name="figma" type="url" placeholder="https://figma.com/file/…" value="${h(f.figma || "")}"></div></div>` +
      `<div class="gs-grid2"><div class="gs-field"><label>Figma frames (optional)</label><label class="gs-btn gs-file">${icon("upload")}Choose frames<input type="file" name="frames" accept=".png,.jpg" multiple hidden></label></div><div class="gs-field"><label>Your own test-case sheet (optional)</label><label class="gs-btn gs-file">${icon("upload")}Choose a sheet<input type="file" name="sheet" accept=".xlsx,.csv" hidden></label></div></div>` +
      `<div class="gs-acts"><button type="submit" class="gs-btn primary">${icon("file-text")}Read it</button><span class="gs-hint">spine.ai reads it into features, roles, flows, rules, states and data, and lists what it leaves open.</span></div></form>`
    );
  }
  const block = (title, items) => `<div class="gs-block"><h4>${h(title)}</h4>${items?.length ? `<ul>${items.map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : `<p class="gs-hint">None named.</p>`}</div>`;
  async function reqSubmit(form) {
    const file = form.file?.files?.[0]; const text = form.text.value.trim();
    if (!file && text.length < 200) { S.err = "Drop a document or paste at least a few paragraphs."; return paint(); }
    S.err = null; S.form = { ...S.form, editing: false, text };
    S.live = { step: "requirement", items: {}, waiting: "parsed", done: false, error: null };
    paint();
    const body = { kind: file ? (file.name.split(".").pop() || "file").toLowerCase() : "text", title: file ? file.name : undefined, chars: file ? Math.round(file.size * 0.6) : text.length, text: file ? undefined : text, figma: form.figma.value.trim() || undefined, notion: form.notion.value.trim() || undefined, sheet: !!form.sheet?.files?.length, file: file?.name };
    try {
      await stream(`/api/session/${encodeURIComponent(S.cur.id)}/intake`, body, (l) => {
        if (l.type === "done") { S.live.done = true; S.live.waiting = null; }
        else if (l.type === "error") { S.live.error = l.why; S.live.waiting = null; }
        else { S.live.items[l.type] = { ...l, line: l.type === "parsed" ? `${l.kind}${l.pages ? ` · ${plural(l.pages, "page")}` : ""} · ${l.chars} characters${l.frames ? ` · ${plural(l.frames, "frame")}` : ""}` : l.type === "understanding" ? `${plural(l.card?.features?.length || 0, "feature")}, ${plural(l.card?.flows?.length || 0, "flow")}, ${plural(l.card?.rules?.length || 0, "rule")}` : `${plural((l.questions || []).length, "open question")}` }; S.live.waiting = { parsed: "understanding", understanding: "questions", questions: null }[l.type] ?? null; }
        paint();
      });
      if (!S.live.error) { await reload(); S.view = "requirement"; S.live = null; }
    } catch (e) { S.live.error = e.message; }
    paint();
  }
  async function answer(qid, text, skip) {
    try { const d = await json("POST", `/api/session/${encodeURIComponent(S.cur.id)}/answer`, { questionId: qid, answer: skip ? undefined : text, skip: !!skip }); if (d.card) S.cur.understanding = d.card; } catch (e) { S.err = e.message; }
    paint();
  }

  // ── B1.4 Sanity (shell) ───────────────────────────────────────────────────
  function sanityBody() {
    const s = S.cur; const flows = s.understanding?.flows || []; const L = S.live?.step === "sanity" ? S.live : null; const res = Object.fromEntries((s.sanity?.flows || []).map((f) => [f.id, f]));
    if (!flows.length) return `<p class="gs-hint">No flows yet — the Requirement step works them out from the document.</p>`;
    const V = { works: "tag-ok", broken: "tag-bad", "couldn't reach": "tag-warn" };
    return (
      `<div class="gs-flows">${flows.map((f) => { const r = L?.items[f.id] || res[f.id]; const running = L && L.current === f.id; return `<div class="gs-flow${running ? " now" : ""}"><label><input type="checkbox" data-flow="${h(f.id)}"${S.sel.has(f.id) || (!L && !s.sanity) ? " checked" : ""}${L ? " disabled" : ""}> <b>${h(f.name)}</b></label>${r?.verdict ? `<span class="tag-v ${V[r.verdict] || "tag-grey"}">${h(r.verdict)}</span>` : running ? `<span class="tag-v tag-live">running</span>` : ""}<small>${h(f.steps.join(" → "))}</small>${running && L.lines.length ? `<ul class="gs-lines">${L.lines.slice(-4).map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : ""}${r?.why ? `<p class="gs-why">${h(r.why)}</p>` : ""}${r?.blockers?.length ? `<p class="gs-warn">${r.blockers.map(h).join(" · ")}</p>` : ""}${r?.shots?.length ? `<div class="gs-shots">${r.shots.map((x) => `<span>${h(x)}</span>`).join("")}</div>` : ""}</div>`; }).join("")}</div>` +
      `<div class="gs-acts">${L ? `<span class="gs-hint"><i class="gs-spin"></i> Running the flows live…</span>` : `<button type="button" class="gs-btn primary" data-act="sanity-run">${icon("play")}Run the ticked flows</button>${s.sanity ? `<button type="button" class="gs-btn" data-act="next">Continue to Cases ${icon("arrow-right")}</button>` : ""}`}</div>`
    );
  }
  async function sanityRun() {
    const ids = [...root().querySelectorAll("[data-flow]:checked")].map((x) => x.dataset.flow);
    if (!ids.length) { S.err = "Tick at least one flow."; return paint(); }
    S.err = null; S.live = { step: "sanity", items: {}, lines: [], current: null, done: false, error: null }; paint();
    try {
      await stream(`/api/session/${encodeURIComponent(S.cur.id)}/sanity`, { flowIds: ids }, (l) => {
        if (l.type === "flow-start") { S.live.current = l.id; S.live.lines = []; }
        else if (l.type === "line") S.live.lines.push(l.line);
        else if (l.type === "flow-done") { S.live.items[l.id] = l; S.live.current = null; }
        else if (l.type === "done") S.live.done = true;
        else if (l.type === "error") S.live.error = l.why;
        paint();
      });
      await reload(); S.view = "sanity"; S.live = null;
    } catch (e) { S.live.error = e.message; }
    paint();
  }

  // ── B1.5 Cases (shell) ────────────────────────────────────────────────────
  const KINDS = [["happy", "Happy flows", "one case per flow"], ["negative", "Negative", "each rule turned around"], ["edge", "Edge", "the limits the PRD names"], ["permission", "Permission", "each role tries what it must not"], ["state", "State", "every state, what it allows"], ["settings", "Settings", "the toggles on and off"], ["data", "Data", "sources renamed, deactivated, deleted"], ["timing", "Timing", "the windows the PRD names"], ["visibility", "Visibility", "what each role sees"], ["api", "API", "the same rules through the API"], ["design", "Design", "every Figma frame"]];
  function casesBody() {
    const s = S.cur; const L = S.live?.step === "cases" ? S.live : null; const g = s.generation;
    if (L || g) {
      const sections = L ? L.sections : g.sections.map((x) => ({ ...x, rows: g.rows.filter((r) => x.caseIds.includes(r.id)) }));
      return (
        `<div class="gs-sections">${sections.map((sec) => `<div class="gs-section${sec.live ? " now" : ""}"><div class="gs-section-head"><b>${h(KINDS.find((k) => k[0] === sec.kind)?.[1] || sec.kind)}</b><span class="gs-basis">${h(sec.basis)}</span><span class="gs-count">${sec.live ? `${sec.rows.length} of ${sec.planned}` : plural(sec.count ?? sec.rows.length, "case")}${sec.existing ? ` · ${sec.existing} already in the catalog` : ""}</span></div><ol class="gs-caselist">${(sec.rows || []).map((r) => `<li><code>${h(r.id)}</code><span>${h(r.title)}</span>${r.existing ? `<span class="tag-v tag-grey">already have it</span>` : ""}<span class="tag-v tag-grey">${h(r.priority)}</span></li>`).join("")}${sec.live ? `<li class="gs-waiting"><i class="gs-spin"></i> Writing the next case…</li>` : ""}</ol></div>`).join("")}</div>` +
        (L && !L.done ? `<p class="gs-hint"><i class="gs-spin"></i> ${L.sections.length ? "Writing section by section — each shows its basis first, then its rows." : "Waiting for the model to plan the sections…"}</p>` : `<div class="gs-acts"><button type="button" class="gs-btn primary" data-act="next">Review ${plural(g?.total || 0, "case")} ${icon("arrow-right")}</button><button type="button" class="gs-btn" data-act="cases-again">Generate again</button></div>`)
      );
    }
    const depth = S.form.depth || "standard";
    return (
      `<div class="gs-kinds">${KINDS.map(([k, l, basis]) => `<label class="gs-kind${S.sel.has(k) || (!S.sel.size && ["happy", "negative", "edge"].includes(k)) ? " on" : ""}"><input type="checkbox" data-kind="${k}"${S.sel.has(k) || (!S.sel.size && ["happy", "negative", "edge"].includes(k)) ? " checked" : ""}><b>${h(l)}</b><small>${h(basis)}</small></label>`).join("")}</div>` +
      `<div class="gs-field"><label>Depth</label><div class="gs-seg">${[["quick", "Quick", "2 a kind"], ["standard", "Standard", "3 a kind"], ["deep", "Deep", "5 a kind"]].map(([v, l, sub]) => `<button type="button" class="${depth === v ? "on" : ""}" data-depth="${v}">${h(l)}<small>${h(sub)}</small></button>`).join("")}</div></div>` +
      `<div class="gs-acts"><button type="button" class="gs-btn primary" data-act="generate">${icon("file-text")}Generate</button><span class="gs-hint">Each section shows the rule and the technique it used, then its rows.</span></div>`
    );
  }
  async function generate() {
    const kinds = [...root().querySelectorAll("[data-kind]:checked")].map((x) => x.dataset.kind);
    if (!kinds.length) { S.err = "Pick at least one kind."; return paint(); }
    S.err = null; S.live = { step: "cases", sections: [], done: false, error: null }; paint();
    try {
      await stream(`/api/session/${encodeURIComponent(S.cur.id)}/generate`, { kinds, depth: S.form.depth || "standard" }, (l) => {
        if (l.type === "section-start") S.live.sections.push({ kind: l.kind, basis: l.basis, planned: l.planned, rows: [], live: true });
        else if (l.type === "case") S.live.sections.at(-1)?.rows.push(l.row);
        else if (l.type === "section-done") { const sec = S.live.sections.find((x) => x.kind === l.kind && x.live); if (sec) Object.assign(sec, { live: false, count: l.count, existing: l.existing }); }
        else if (l.type === "done") S.live.done = true;
        else if (l.type === "error") S.live.error = l.why;
        paint();
      });
      await reload(); S.view = "cases"; S.live = null;
    } catch (e) { S.live.error = e.message; }
    paint();
  }

  // ── B1.6 Review (shell) ───────────────────────────────────────────────────
  function reviewBody() {
    const s = S.cur; const g = s.generation; const rows = g?.rows || [];
    if (!rows.length) return `<p class="gs-hint">No cases yet — generate them on the Cases step.</p>`;
    const bySec = g.sections.map((sec) => ({ sec, rows: rows.filter((r) => sec.caseIds.includes(r.id)) }));
    return (
      `<div class="gs-review-tools"><span class="gs-count">${plural(rows.length, "case")}${s.review ? ` · sheet v${s.review.version}${s.review.approved ? " approved" : ""}` : ""}</span><span class="home-spacer"></span><label class="gs-btn gs-file">${icon("upload")}Upload a test-case sheet<input type="file" id="gs-merge" accept=".xlsx,.csv" hidden></label><button type="button" class="gs-btn primary" data-act="approve">${icon("check")}Approve all and freeze</button></div>` +
      (S.form.merge ? `<p class="gs-msg">Merged ${plural(S.form.merge.added, "case")} from your sheet.${S.form.merge.duplicates?.length ? ` ${plural(S.form.merge.duplicates.length, "duplicate")} kept out: ${S.form.merge.duplicates.map((d) => `${h(d.id)} = ${d.matches.map(h).join(", ")}`).join("; ")}` : ""}</p>` : "") +
      bySec.map(({ sec, rows: rs }) => `<div class="gs-rev-sec"><div class="gs-section-head"><b>${h(KINDS.find((k) => k[0] === sec.kind)?.[1] || sec.kind)}</b><span class="gs-basis">${h(sec.basis)}</span></div><table class="gs-table"><thead><tr><th>ID</th><th>Test case</th><th>Expected result</th><th>Priority</th><th></th></tr></thead><tbody>${rs.map((r) => `<tr data-row="${h(r.id)}"><td><code>${h(r.id)}</code></td><td contenteditable="true" data-f="title">${h(r.title)}</td><td contenteditable="true" data-f="expected">${h(r.expected)}</td><td contenteditable="true" data-f="priority">${h(r.priority)}</td><td><button type="button" class="gs-link danger" data-drop="${h(r.id)}">Drop</button></td></tr>`).join("")}</tbody></table></div>`).join("") +
      (s.review?.approved ? `<div class="gs-acts"><button type="button" class="gs-btn primary" data-act="next">Continue to Run ${icon("arrow-right")}</button></div>` : "")
    );
  }
  async function approve() {
    const edits = []; const drops = S.form.drops || [];
    for (const tr of root().querySelectorAll("tr[data-row]")) { const patch = {}; for (const td of tr.querySelectorAll("[data-f]")) patch[td.dataset.f] = td.textContent.trim(); edits.push({ id: tr.dataset.row, patch }); }
    try { await json("POST", `/api/session/${encodeURIComponent(S.cur.id)}/review`, { edits, drops, approve: true }); await reload(); S.view = "review"; S.form.drops = []; } catch (e) { S.err = e.message; }
    paint();
  }

  // ── B1.7 Run (shell) ──────────────────────────────────────────────────────
  function runBody() {
    const s = S.cur; const L = S.live?.step === "run" ? S.live : null; const e = s.execution; const scope = S.form.scope || "p0p1";
    const PILL = { Pass: "tag-ok", Fail: "tag-bad", "Couldn't tell": "tag-warn" };
    const results = L ? L.results : e?.results || [];
    return (
      (!L ? `<div class="gs-field"><label>What to run</label><div class="gs-seg">${[["all", "All cases"], ["p0p1", "P0 and P1 only"], ["sections", "Some sections"]].map(([v, l]) => `<button type="button" class="${scope === v ? "on" : ""}" data-scope="${v}">${h(l)}</button>`).join("")}</div>${scope === "sections" ? `<div class="gs-chips">${(s.generation?.sections || []).map((sec) => `<label class="gs-chip${S.sel.has(sec.kind) ? " on" : ""}"><input type="checkbox" data-sec="${h(sec.kind)}"${S.sel.has(sec.kind) ? " checked" : ""} hidden>${h(KINDS.find((k) => k[0] === sec.kind)?.[1] || sec.kind)}</label>`).join("")}</div>` : ""}<label class="gs-check"><input type="checkbox" id="gs-rest"${S.form.rest ? " checked" : ""}> Rest between cases overnight (slower, kinder to UAT)</label></div><div class="gs-acts"><button type="button" class="gs-btn primary" data-act="run">${icon("play")}Run</button><span class="gs-hint">One browser at a time. Each case builds its own start state.</span></div>` : `<p class="gs-hint"><i class="gs-spin"></i> ${L.current ? `Running ${h(L.current.id)} — ${h(L.current.title)}` : "Starting the runner…"}</p>${L.lines.length ? `<ul class="gs-lines">${L.lines.slice(-5).map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : ""}`) +
      (results.length ? `<div class="gs-tally">${["Pass", "Fail", "Couldn't tell"].map((k) => { const n = results.filter((r) => r.status === k).length; return n ? `<span class="tag-v ${PILL[k]}">${n} ${h(k)}</span>` : ""; }).join("")}<span class="gs-count">${results.length} of ${L ? L.total : results.length}</span></div><ol class="gs-caselist">${results.map((r) => `<li><span class="tag-v ${PILL[r.status] || "tag-grey"}">${h(r.status)}</span><code>${h(r.id)}</code><span>${h(r.why)}</span>${r.bugId ? `<span class="tag-v tag-bad">Bug</span>` : ""}${!L ? `<button type="button" class="gs-link" data-rerun="${h(r.id)}">Run again on a fresh event</button>` : ""}</li>`).join("")}</ol>` : "") +
      (!L && e ? `<div class="gs-acts"><a class="gs-btn" href="#/bugs">${icon("bug")}Bugs (${e.bugIds?.length || 0})</a><a class="gs-btn" href="${h(e.workbook || "#")}">${icon("download")}Workbook</a><button type="button" class="gs-btn" data-act="run-again">Run again</button></div>` : "")
    );
  }
  async function run(scope, sections) {
    S.live = { step: "run", results: [], lines: [], current: null, total: 0, done: false, error: null }; paint();
    try {
      await stream(`/api/session/${encodeURIComponent(S.cur.id)}/run`, { scope, sections, overnightRest: !!S.form.rest }, (l) => {
        if (l.type === "case-start") { S.live.current = l; S.live.lines = []; S.live.total++; }
        else if (l.type === "line") S.live.lines.push(l.line);
        else if (l.type === "case-done") { S.live.results.push(l); S.live.current = null; }
        else if (l.type === "done") S.live.done = true;
        else if (l.type === "error") S.live.error = l.why;
        paint();
      });
      await reload(); S.view = "run"; S.live = null;
    } catch (e) { S.live.error = e.message; }
    paint();
  }

  // ── wiring ────────────────────────────────────────────────────────────────
  function wire(el) {
    el.querySelector('[data-act="new"]')?.addEventListener("click", async () => { try { const d = await json("POST", "/api/session/start", { name: "Untitled session" }); go(d.id); } catch (e) { S.err = e.message; paint(); } });
    el.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => go(b.dataset.open)));
    el.querySelectorAll("[data-rename]").forEach((b) => b.addEventListener("click", async () => { const s = S.sessions.find((x) => x.id === b.dataset.rename); const name = prompt("Name this session", s?.name || ""); if (name?.trim()) { await json("PATCH", `/api/session/${encodeURIComponent(b.dataset.rename)}`, { name: name.trim() }).catch(() => {}); await loadList(); paint(); } }));
    el.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", async () => { const s = S.sessions.find((x) => x.id === b.dataset.delete); if (!confirm(`Delete “${s?.name}”? Its answers and cases go with it.`)) return; await json("DELETE", `/api/session/${encodeURIComponent(b.dataset.delete)}`).catch(() => {}); await loadList(); paint(); }));
    if (!S.cur) return;
    const name = el.querySelector("#gs-name");
    name?.addEventListener("blur", async () => { const v = name.textContent.trim(); if (v && v !== S.cur.name) { S.cur.name = v; await json("PATCH", `/api/session/${encodeURIComponent(S.cur.id)}`, { name: v }).catch(() => {}); } });
    name?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); name.blur(); } });
    el.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => { S.view = b.dataset.step; S.err = null; S.form.editing = false; paint(); }));
    el.querySelectorAll('[data-act="next"]').forEach((b) => b.addEventListener("click", () => { const i = ORDER.indexOf(S.view); S.view = ORDER[Math.min(i + 1, ORDER.length - 1)]; if (ORDER.indexOf(S.cur.step) < ORDER.indexOf(S.view)) S.cur.step = S.view; S.form.editing = false; S.sel.clear(); paint(); }));
    // environment
    el.querySelectorAll("[data-profile]").forEach((b) => b.addEventListener("click", () => { const p = S.profiles.find((x) => x.id === b.dataset.profile); if (p) { S.form = { ...S.form, url: p.url, companyId: p.companyId, signIn: p.signIn }; paint(); } }));
    el.querySelectorAll('#gs-env input[name="signIn"]').forEach((r) => r.addEventListener("change", () => { S.form = { ...S.form, url: el.querySelector("#gs-url").value, companyId: el.querySelector("#gs-company").value, signIn: r.value }; paint(); }));
    el.querySelector("#gs-env")?.addEventListener("submit", (e) => { e.preventDefault(); envSubmit(e.target); });
    el.querySelector('[data-act="env-edit"]')?.addEventListener("click", () => { S.form.editing = true; S.live = null; paint(); el.querySelector("#gs-url")?.focus(); });
    // requirement
    const drop = el.querySelector("#gs-drop"); const file = drop?.querySelector("input[type=file]");
    file?.addEventListener("change", () => { S.form.fileName = file.files?.[0]?.name; const t = el.querySelector("#gs-paste")?.value; paint(); const ta = root().querySelector("#gs-paste"); if (ta) ta.value = t || ""; const nf = root().querySelector("#gs-drop input[type=file]"); if (nf && file.files) try { nf.files = file.files; } catch {} });
    drop?.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop?.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop?.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); if (file && e.dataTransfer?.files?.length) { try { file.files = e.dataTransfer.files; } catch {} S.form.fileName = e.dataTransfer.files[0].name; paint(); } });
    el.querySelector("#gs-req")?.addEventListener("submit", (e) => { e.preventDefault(); reqSubmit(e.target); });
    el.querySelector('[data-act="req-edit"]')?.addEventListener("click", () => { S.form.editing = true; paint(); });
    el.querySelectorAll(".gs-q-form").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); const v = f.answer.value.trim(); if (v) answer(f.dataset.q, v, false); }));
    el.querySelectorAll("[data-skip]").forEach((b) => b.addEventListener("click", () => answer(b.dataset.skip, "", true)));
    // sanity
    el.querySelectorAll("[data-flow]").forEach((cb) => cb.addEventListener("change", () => { cb.checked ? S.sel.add(cb.dataset.flow) : S.sel.delete(cb.dataset.flow); }));
    el.querySelector('[data-act="sanity-run"]')?.addEventListener("click", sanityRun);
    // cases
    el.querySelectorAll("[data-kind]").forEach((cb) => cb.addEventListener("change", () => { if (!S.sel.size) ["happy", "negative", "edge"].forEach((k) => S.sel.add(k)); cb.checked ? S.sel.add(cb.dataset.kind) : S.sel.delete(cb.dataset.kind); paint(); }));
    el.querySelectorAll("[data-depth]").forEach((b) => b.addEventListener("click", () => { S.form.depth = b.dataset.depth; paint(); }));
    el.querySelector('[data-act="generate"]')?.addEventListener("click", generate);
    el.querySelector('[data-act="cases-again"]')?.addEventListener("click", () => { S.cur.generation = null; S.sel.clear(); paint(); });
    // review
    el.querySelectorAll("[data-drop]").forEach((b) => b.addEventListener("click", () => { S.form.drops = [...(S.form.drops || []), b.dataset.drop]; if (S.cur.generation) S.cur.generation.rows = S.cur.generation.rows.filter((r) => r.id !== b.dataset.drop); paint(); }));
    el.querySelector('[data-act="approve"]')?.addEventListener("click", approve);
    el.querySelector("#gs-merge")?.addEventListener("change", async (e) => { if (!e.target.files?.length) return; try { S.form.merge = await json("POST", `/api/session/${encodeURIComponent(S.cur.id)}/merge`, { sheet: e.target.files[0].name }); await reload(); S.view = "review"; } catch (err) { S.err = err.message; } paint(); });
    // run
    el.querySelectorAll("[data-scope]").forEach((b) => b.addEventListener("click", () => { S.form.scope = b.dataset.scope; paint(); }));
    el.querySelectorAll("[data-sec]").forEach((cb) => cb.addEventListener("change", () => { cb.checked ? S.sel.add(cb.dataset.sec) : S.sel.delete(cb.dataset.sec); paint(); }));
    el.querySelector("#gs-rest")?.addEventListener("change", (e) => (S.form.rest = e.target.checked));
    el.querySelector('[data-act="run"]')?.addEventListener("click", () => run(S.form.scope || "p0p1", [...S.sel]));
    el.querySelector('[data-act="run-again"]')?.addEventListener("click", () => { S.cur.execution = null; paint(); });
    el.querySelectorAll("[data-rerun]").forEach((b) => b.addEventListener("click", () => run("sections", []).catch(() => {})));
  }

  // Enter on a single-line field advances the form it is in (B1.8 is day 5; this much is free).
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target?.matches?.("#gs-root input[type=url], #gs-root input[type=text]") && !e.target.closest(".gs-q-form")) { e.preventDefault(); e.target.form?.requestSubmit?.(); } });
  window.addEventListener("hashchange", route);
  if (document.readyState !== "loading") route(); else document.addEventListener("DOMContentLoaded", route);
  window.spineGuided = { state: S, paint, route };
})();
