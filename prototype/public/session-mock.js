/**
 * THE MOCK OF THE GUIDED-SESSION API (Track B). Loaded only with ?mock=1 — it answers every /api/session/
 * route with realistic data and timed SSE lines, so every screen can be built and demoed before Animesh's
 * backend is reachable. Nothing here touches the server. Sessions live in localStorage (spine.guided.mock)
 * so Resume works across reloads.
 *
 * Day 2 (13 Nov 2026): the route names, event names and payload shapes are EXACTLY those of Animesh's
 * brief (docs/Prompt_for_Aanya_Day2_2026-11-13.md §3 and §4) and his 12 Nov stand-up entries, so that
 * flipping a step from mock to real is one flag and no renaming. Events: line, reach, signin, settings,
 * gates, vendors, parsed, understanding, questions, flow-start, frame, flow-done, section-start, case,
 * section-done, case-start, case-done, queued, ask, answered, closed, ping, done, error.
 *
 * The questions engine (§4) is mocked here too: every step asks one or two questions mid-stream (ask),
 * waits for the answer (blocking ones until their deadline, then go with the suggestion), and streams
 * answered{question}. GET …/questions, POST …/questions/answer and GET …/questions/stream work across
 * reloads. The words on the cards are written here as the backend would write them; the card never
 * rewrites them.
 */
(function () {
  "use strict";
  const KEY = "spine.guided.mock";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const now = () => new Date().toISOString();
  const id = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
  const SLOW = /\bslow=1\b/.test(location.hash) ? 1 : 0.5; // ?slow=1 keeps the real pacing

  // ── storage ─────────────────────────────────────────────────────────────
  function load() {
    try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d && d.v === 2) return d; } catch {}
    return seed();
  }
  function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} }
  function seed() {
    const db = { v: 2, sessions: {}, profiles: [
      profile({ id: "prof-uat-demo", label: "PROCOL DEMO · UAT", url: "https://uat.procol.app", companyId: 198678, companyName: "PROCOL DEMO", signIn: "console", snapshotAt: "2026-11-12T06:40:00.000Z", vendors: 4, hiddenCount: 351, settingsCount: 497 }),
      profile({ id: "prof-uat-moon", label: "Moon Beverages · cpanel.ag-ri.in", url: "https://cpanel.ag-ri.in", companyId: 57675, companyName: "Moon Beverages", signIn: "otp", snapshotAt: "2026-11-12T09:05:00.000Z", vendors: 0, hiddenCount: 340, settingsCount: 480 }),
    ] };
    const s1 = blank("Counter offer on a live RFQ"); s1.step = "cases"; s1.updatedAt = "2026-11-12T09:12:00.000Z";
    s1.env = envFor(db.profiles[0]); s1.intake = { prd: { name: "Counter offer v2.docx", chars: 18400, what: "a Word document" }, notion: null, figma: null, frames: 0, sheet: null };
    s1.understanding = cardFor("Counter offer"); s1.questions = [];
    const s2 = blank("Awarding with Master QCS"); s2.step = "environment"; s2.updatedAt = "2026-11-11T16:30:00.000Z";
    db.sessions[s1.id] = s1; db.sessions[s2.id] = s2;
    return db;
  }
  function profile(p) {
    return { ...p, gates: [{ key: "lock_vendors_addition_in_event_creation", now: "Off", why: "Vendors can be added while an event is created" }, { key: "boq_enabled", now: "Off", why: "BOQ events are switched off: BOQ flows are left out" }, { key: "allowed_maximum_line_items", now: "50", why: "An event takes at most 50 lines" }, { key: "erfx_enabled", now: "On", why: "eRFX projects are on" }], hidden: ["approval_workflow_v2", "quick_fill"] };
  }
  function blank(name) {
    return { id: id("gs"), name: name || "Untitled session", step: "environment", createdAt: now(), updatedAt: now(), env: null, intake: null, understanding: null, sanity: null, generation: null, review: null, execution: null, questions: [], stale: [] };
  }
  function envFor(p) {
    return { profileId: p.id, label: p.label, url: p.url, companyId: p.companyId, companyName: p.companyName, signIn: p.signIn, snapshotAt: p.snapshotAt, settings: { count: p.settingsCount, hidden: p.hiddenCount }, gates: p.gates, vendors: p.vendors, vendorNames: p.vendors ? ["QA_Platform Vendor 1", "QA_Platform Vendor 2", "QA_Platform Vendor 3", "QA_Platform Vendor 4"].slice(0, p.vendors) : [] };
  }

  // ── the understanding card (Animesh's shape, 12 Nov evening entry) ──────
  function cardFor(feature) {
    return {
      version: 1, at: now(), title: feature, summary: `A buyer can send a lower price to a vendor's bid on a live RFQ; the vendor accepts or rejects it on the portal and the buyer sees the outcome.`, module: "Events · RFQ",
      features: [
        { id: "F1", name: feature, what: "The buyer proposes a lower price on a bid; the vendor answers.", existing: true },
        { id: "F2", name: `${feature} — vendor side`, what: "The vendor sees, accepts or rejects the offer on the portal.", existing: true },
        { id: "F3", name: "Notifications", what: "The vendor gets an e-mail and a portal notice.", existing: true, off: false },
      ],
      roles: [{ name: "Buyer (event owner)", canDo: ["send a counter offer", "revoke it"] }, { name: "Vendor", canDo: ["accept", "reject with a reason"] }, { name: "Approver", canDo: ["see the outcome"] }],
      flows: [
        { id: "FL1", name: "Buyer sends a counter offer on a live RFQ bid", feature: "F1", role: "Buyer", layer: "UI", preconditions: ["A live RFQ with a bid from a QA vendor"], steps: ["Open the live RFQ", "Open Responses", "Pick the vendor's bid", "Send a counter offer with a lower price", "Vendor accepts on the portal"], endState: "The bid shows Counter offer accepted · the counter price" },
        { id: "FL2", name: "Vendor rejects the counter offer", feature: "F2", role: "Vendor", layer: "UI", preconditions: ["A counter offer sent"], steps: ["Vendor opens the offer", "Rejects it with a reason", "Buyer sees Rejected"], endState: "The buyer sees Rejected with the reason" },
        { id: "FL3", name: "Counter offer after the event closes is refused", feature: "F1", role: "Buyer", layer: "API", preconditions: ["A closed RFQ with a bid"], steps: ["Close the RFQ", "Try to send a counter offer"], endState: "The app refuses" },
      ],
      rules: [
        { id: "R1", text: "A counter offer can only be sent on a bid of a live RFQ.", kind: "rule", source: "PRD §2.1", feature: "F1" },
        { id: "R2", text: "The counter price must be lower than the vendor's bid price.", kind: "limit", source: "PRD §2.3", feature: "F1" },
        { id: "R3", text: "Only the event owner and users with the Counter offer permission can send one.", kind: "role", source: "PRD §3", feature: "F1" },
        { id: "R4", text: "The vendor sees the offer on the portal within a minute and gets an e-mail.", kind: "timing", source: "PRD §4", feature: "F3" },
        { id: "R5", text: "Counter offers are on for this company.", kind: "setting", source: "company settings", feature: "F1", settingKey: "counter_offer_enabled", settingNow: "On" },
      ],
      states: ["Sent", "Accepted", "Rejected", "Expired"],
      data: ["<LIVE_RFQ> with a bid from a QA vendor", "<COUNTER_PRICE> lower than the bid"],
      outOfScope: ["Auctions", "RFP technical rounds"],
      assumptions: ["The vendor portal shows the offer on the bid's page, not in a separate inbox."],
      questions: [
        { id: "Q1", text: "Can a counter offer be sent twice on the same bid after the first is rejected?", why: "It decides whether a second-offer case is written.", kind: "yes-no", from: "PRD §2.1 is silent" },
        { id: "Q2", text: "Does the offer expire with the event's close time, or does it have its own?", why: "It decides the timing cases.", kind: "one", from: "PRD §4 names no expiry" },
        { id: "Q3", text: "Is the counter price per line item or for the whole bid?", why: "It decides what the case types into the price box.", kind: "one", from: "PRD §2.3" },
      ],
      grounding: { settings: [{ key: "counter_offer_enabled", name: "Counter offers", now: "On" }], off: [], defects: [{ ticket: "331668324073", title: "Vendor not able to see Counter Offer" }, { ticket: "321402759885", title: "During counter offer can't edit rate" }], existing: 3, figmaLabels: [] },
      notes: ["Two earlier tickets touch this feature; their cases are marked 'already have it'."],
    };
  }

  // ── the questions engine (§4) ───────────────────────────────────────────
  const db = load();
  const session = (sid) => { const s = db.sessions[sid]; if (!s) throw new Error("No such session"); return s; };
  const touch = (s, step) => { if (step) { s.step = step; s.stale = (s.stale || []).filter((x) => x !== step); } s.updatedAt = now(); save(db); return s; };
  const listeners = new Map(); // sid → Set<fn>; the questions stream and the running step both hear ask/answered
  const notify = (sid, ev) => { for (const fn of listeners.get(sid) || []) try { fn(ev); } catch {} };

  function ask(s, q) {
    const Q = { qid: id("q"), step: s.step, source: "prd", kind: "one", why: "", options: [], suggested: "", blocking: false, askedAt: now(), ...q };
    if (Q.blocking && !Q.deadlineAt) Q.deadlineAt = new Date(Date.now() + 90 * 1000).toISOString();
    if (Q.blocking && !Q.ifNoAnswer) Q.ifNoAnswer = "I'll go with the suggestion.";
    s.questions = s.questions || []; s.questions.push(Q); save(db);
    notify(s.id, { type: "ask", question: Q });
    return Q;
  }
  function answerQ(s, qid, answer, skip) {
    const Q = (s.questions || []).find((x) => x.qid === qid);
    if (!Q) return { ok: false, why: "That question is not on this session." };
    if (Q.answeredAt) return { ok: false, question: Q, why: "Already answered." };
    Q.answeredAt = now();
    if (skip) { Q.skipped = true; Q.answer = undefined; Q.outcome = Q.ifNoAnswer ? `${Q.ifNoAnswer.replace(/^I'll /, "I went ")}` : "Left as the platform suggested."; }
    else { Q.answer = String(answer ?? ""); Q.outcome = outcomeFor(Q); }
    save(db);
    notify(s.id, { type: "answered", question: Q });
    return { ok: true, question: Q };
  }
  function outcomeFor(Q) {
    const a = Q.answer;
    if (Q.source === "flows") { const n = String(a).split(",").filter(Boolean).length; const total = Q.options.length; return n === total ? "Every flow runs." : `${total - n} ${total - n === 1 ? "flow" : "flows"} left out.`; }
    if (Q.source === "company") return `Testing ${Q.options.find((o) => o.value === a)?.label || a}.`;
    if (Q.source === "setting") return a === "switch" ? "Switched on for the runs, back after." : a === "leave" ? "Its flows are left out." : "Nothing changed.";
    if (Q.source === "sanity") return a === "skip" ? "The flow is skipped." : "The flow is tried again.";
    if (Q.source === "run") return a === "run" ? "They run; expect Couldn't tell." : a === "leave" ? "7 cases left out this time." : "The run stops here.";
    if (Q.kind === "yes-no") return a === "yes" ? "A rule was added." : "No rule added.";
    return "Written into the card.";
  }
  /** Wait for an answer to a blocking question, until its deadline; then go with the suggestion. */
  async function waitFor(s, Q, yieldLine) {
    const until = new Date(Q.deadlineAt).getTime();
    while (!Q.answeredAt && Date.now() < until) {
      await sleep(400);
      if (yieldLine && Math.random() < 0.02) yieldLine({ type: "line", line: `Waiting for your answer: ${Q.text}` });
    }
    if (!Q.answeredAt) { Q.closed = "deadline"; Q.answer = Q.suggested; Q.answeredAt = now(); Q.outcome = `No answer by the deadline — went with the suggestion.`; save(db); notify(s.id, { type: "closed", qid: Q.qid, how: "deadline" }); notify(s.id, { type: "answered", question: Q }); }
    return Q;
  }

  /** SSE as an async generator of {type, ...} lines; `asks` are questions raised mid-stream. */
  async function* sse(sid, parts) {
    const s = session(sid);
    const pending = []; const hear = (ev) => pending.push(ev);
    if (!listeners.has(sid)) listeners.set(sid, new Set()); listeners.get(sid).add(hear);
    try {
      for (const part of parts) {
        if (typeof part === "function") { // an ask: { ...Q } → yields ask, then (if blocking) waits, then answered
          const Q = ask(s, part());
          while (pending.length) yield pending.shift();
          if (Q.blocking) { await waitFor(s, Q); }
          while (pending.length) yield pending.shift();
          continue;
        }
        const [ms, line] = part; await sleep(ms * SLOW);
        while (pending.length) yield pending.shift();
        yield line;
      }
      while (pending.length) yield pending.shift();
    } finally { listeners.get(sid)?.delete(hear); }
  }
  /** The questions stream: ask / answered / closed as they happen, ping every 20 s. Ends when the page stops reading it. */
  async function* questionsStream(sid) {
    const pending = []; const hear = (ev) => pending.push(ev);
    if (!listeners.has(sid)) listeners.set(sid, new Set()); listeners.get(sid).add(hear);
    try {
      let t = Date.now();
      for (;;) {
        while (pending.length) yield pending.shift();
        if (Date.now() - t > 20000) { t = Date.now(); yield { type: "ping" }; }
        await sleep(300);
      }
    } finally { listeners.get(sid)?.delete(hear); }
  }

  const KINDS = [
    { kind: "happy", basis: "One case per flow in the understanding, in the order a buyer does it." },
    { kind: "negative", basis: "Each rule turned around: the wrong state, the wrong value, the wrong user." },
    { kind: "edge", basis: "The limits the PRD names: equal price, zero, the close time itself." },
    { kind: "permission", basis: "Each role tries what it must not be able to do." },
    { kind: "state", basis: "Every state the feature can be in, and what each one allows." },
    { kind: "settings", basis: "The company settings the feature depends on, on and off." },
    { kind: "data", basis: "The records the feature relies on renamed, deactivated and deleted." },
    { kind: "timing", basis: "The windows the PRD names: a minute to the portal, the event's close." },
    { kind: "visibility", basis: "What each role sees on each screen, and what it must not." },
    { kind: "api", basis: "The same rules through the API, with the refusal codes." },
    { kind: "design", basis: "Every frame in the Figma file, control by control." },
    { kind: "regression", basis: "Earlier tickets on this feature, each rebuilt and proved fixed." },
  ];

  const routes = {
    "POST /api/session/start": async ({ name }) => { const s = blank(name); db.sessions[s.id] = s; save(db); return { id: s.id, step: "environment" }; },
    "GET /api/session/list": async () => ({ sessions: Object.values(db.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((s) => ({ id: s.id, name: s.name, step: s.step, env: s.env ? `${s.env.companyName} · ${s.env.url.replace(/^https?:\/\//, "")}` : undefined, feature: s.understanding?.title || s.intake?.prd?.name, updatedAt: s.updatedAt, stale: s.stale || [] })) }),
    "GET /api/session/kinds": async () => ({ kinds: KINDS }),
    "GET /api/session/env/profiles": async () => ({ profiles: db.profiles.map((p) => ({ id: p.id, label: p.label, url: p.url, companyId: p.companyId, companyName: p.companyName, signIn: p.signIn, snapshotAt: p.snapshotAt, vendors: p.vendors })) }),
    "GET /api/session/env/describe": async (_, __, qs) => {
      const url = qs.get("url") || "";
      if (!/^https?:\/\//i.test(url)) return { ok: false, why: "That is not a web address. It should start with https://", needs: ["url"] };
      if (/cpanel\.ag-ri/i.test(url)) return { ok: true, what: "Procol's own deployment for the Decathlon group (cpanel.ag-ri.in)", host: "cpanel.ag-ri.in", companies: [{ id: 57675, name: "Moon Beverages" }, { id: 57676, name: "Decathlon Sports India" }], signIns: ["otp", "token"], needs: ["companyId", "signIn", "tokenVar"] };
      if (/uat\.procol/i.test(url)) return { ok: true, what: "Procol UAT (shared, many companies)", host: "uat.procol.app", companies: [{ id: 198678, name: "PROCOL DEMO" }, { id: 38158, name: "Laxmi Organics" }, { id: 57675, name: "Moon Beverages" }], signIns: ["console", "otp", "token"], needs: ["companyId", "signIn"] };
      return { ok: true, what: "A host spine.ai has not seen before", host: url.replace(/^https?:\/\//, "").split("/")[0], companies: [], signIns: ["token"], needs: ["apiBaseUrl", "tokenVar", "headerName"] };
    },
    "GET /api/session/:id": async (_, sid) => session(sid),
    "DELETE /api/session/:id": async (_, sid) => { delete db.sessions[sid]; save(db); return { deleted: sid }; },
    "POST /api/session/:id/rename": async (body, sid) => { const s = session(sid); if (body.name) s.name = String(body.name).slice(0, 120); return touch(s); },
    "POST /api/session/:id/reopen": async (body, sid) => {
      const s = session(sid); const ORDER = ["environment", "requirement", "sanity", "cases", "review", "run"];
      const i = ORDER.indexOf(body.step); if (i < 0) throw new Error("No such step");
      s.stale = [...new Set([...(s.stale || []), ...ORDER.slice(i + 1).filter((st) => ({ requirement: s.understanding, sanity: s.sanity, cases: s.generation, review: s.review, run: s.execution }[st]))])];
      s.step = body.step; return touch(s);
    },
    "POST /api/session/:id/env/use": async (body, sid) => { const s = session(sid); const p = db.profiles.find((x) => x.id === body.profileId); if (!p) throw new Error("No such profile"); s.env = envFor(p); return touch(s, "requirement"); },
    "POST /api/session/:id/env": (body, sid) => {
      const s = session(sid);
      const url = String(body.url || "");
      if (!/^https?:\/\//i.test(url)) return sse(sid, [[300, { type: "reach", ok: false, why: "That is not a web address. It should start with https://" }], [50, { type: "error", why: "The environment could not be reached, so nothing was checked. Fix the address and try again." }]]);
      if (/down\.|refused/i.test(url)) return sse(sid, [[900, { type: "reach", ok: false, ms: 900, why: "No answer from that address in 900 ms." }], [50, { type: "error", why: `Nothing answered at ${url}. Check the address, or the VPN if it is an internal environment.` }]]);
      if (body.signIn === "token" && !body.tokenVar) return sse(sid, [[400, { type: "reach", ok: true, ms: 380, line: `Reached ${url} in 380 ms` }], [300, { type: "signin", ok: false, why: "No token name was given." }], [50, { type: "error", why: "A token sign-in needs the token's name as kept in api-suite/.env (never the token itself)." }]]);
      const multi = /uat\.procol/i.test(url) && !body.companyId;
      const host = url.replace(/^https?:\/\//, "").split("/")[0];
      const parts = [
        [400, { type: "line", line: `Reaching ${url}…` }],
        [400, { type: "reach", ok: true, ms: 412, line: `Reached ${url} in 412 ms` }],
      ];
      if (multi) parts.push(() => ({ step: "environment", source: "company", kind: "one", text: "This address hosts several companies. Which one should I test?", why: "Settings, vendors and events are read from that company only.", options: [{ value: "198678", label: "PROCOL DEMO", means: "the QA company, 4 QA vendors" }, { value: "38158", label: "Laxmi Organics", means: "a client company, no QA vendors" }, { value: "57675", label: "Moon Beverages", means: "a client company, no QA vendors" }], suggested: "198678", blocking: true, ifNoAnswer: "I'll test PROCOL DEMO." }));
      parts.push([200, { type: "signin", ok: true, as: body.signIn === "otp" ? "the buyer, by one-time code" : body.signIn === "token" ? `the saved token ${body.tokenVar}` : "Procol Support (console session)", line: `Signed in as ${body.signIn === "otp" ? "the buyer, by one-time code" : body.signIn === "token" ? `the saved token ${body.tokenVar}` : "Procol Support, through the console"}` }]);
      parts.push([1200, { type: "settings", count: 497, hidden: 351, line: "Read 497 company settings · 351 are hidden and stay as they are" }]);
      parts.push([500, { type: "gates", gates: profile({}).gates, line: "4 settings decide what can be tested here" }]);
      parts.push(() => ({ step: "environment", source: "setting", kind: "one", text: "BOQ events are switched off on this company. Switch them on for the runs and back after, or leave BOQ flows out?", why: "Switching happens only on PROCOL DEMO, through the platform, and is restored after the run.", options: [{ value: "switch", label: "Switch it on for the runs", means: "boq_enabled = On during runs, Off after" }, { value: "leave", label: "Leave BOQ out", means: "no BOQ flows, no BOQ cases" }], suggested: "leave", blocking: false }));
      parts.push([900, { type: "vendors", count: 4, names: ["QA_Platform Vendor 1", "QA_Platform Vendor 2", "QA_Platform Vendor 3", "QA_Platform Vendor 4"], line: "4 QA test vendors are ready to bid" }]);
      parts.push([300, (() => { const p = profile({ id: id("prof"), label: body.label || `${body.companyId ? ({ 198678: "PROCOL DEMO", 38158: "Laxmi Organics", 57675: "Moon Beverages" }[body.companyId] || `Company ${body.companyId}`) : "PROCOL DEMO"} · ${host}`, url, companyId: Number(body.companyId) || 198678, companyName: body.companyId ? ({ 198678: "PROCOL DEMO", 38158: "Laxmi Organics", 57675: "Moon Beverages" }[body.companyId] || `Company ${body.companyId}`) : "PROCOL DEMO", signIn: body.signIn || "console", snapshotAt: now(), vendors: 4, hiddenCount: 351, settingsCount: 497 }); db.profiles.unshift(p); s.env = envFor(p); touch(s, "requirement"); return { type: "done", profile: s.env }; })()]);
      return sse(sid, parts);
    },
    "POST /api/session/:id/intake": (body, sid) => {
      const s = session(sid);
      const prd = body.prd || {}; const text = prd.text || ""; const name = prd.name || "Pasted requirement";
      const chars = prd.data ? Math.round(prd.data.length * 0.5) : text.length;
      if (!prd.data && chars < 200) return sse(sid, [[400, { type: "parsed", what: "pasted text", ok: false, line: `${chars} characters came out of it` }], [300, { type: "error", why: "That is too short to be a requirement — under 200 characters came out of it. Paste the whole document." }]]);
      const what = prd.data ? (/\.pdf$/i.test(name) ? "a PDF" : /\.docx?$/i.test(name) ? "a Word document" : "a text file") : "pasted text";
      const title = name.replace(/\.[a-z0-9]+$/i, "").replace(/ v\d.*$/i, "");
      const card = cardFor(title === "Pasted requirement" ? "Counter offer" : title);
      s.intake = { prd: { name, chars, what }, notion: body.notion?.url ? { url: body.notion.url, ok: false, why: "No Notion credential on this server; the page was not read." } : null, figma: body.figma?.url ? { url: body.figma.url, ok: !!body.figma.token, frames: body.figma.token ? 6 : 0 } : null, frames: (body.frames || []).length, sheet: body.sheet ? { name: body.sheet.name, count: 14 } : null };
      const parts = [
        [500, { type: "parsed", what, ok: true, line: `Read ${what}: ${chars} characters${prd.data && /\.pdf$/i.test(name) ? ", 7 pages" : ""}` }],
      ];
      if (body.notion?.url) parts.push([300, { type: "parsed", what: "a Notion page", ok: false, line: "No Notion credential on this server; the page was not read.", detail: body.notion.url }]);
      if (body.figma?.url) parts.push([400, { type: "parsed", what: "a Figma file", ok: !!body.figma.token, line: body.figma.token ? "Read 6 frames and their labels" : "Figma needs a token; give one once and it is kept for the session." }]);
      if ((body.frames || []).length) parts.push([300, { type: "parsed", what: "frames", ok: true, line: `Read ${body.frames.length} frame${body.frames.length === 1 ? "" : "s"}` }]);
      if (body.sheet) parts.push([300, { type: "parsed", what: "your sheet", ok: true, line: `Read 14 cases from ${body.sheet.name}` }]);
      parts.push([300, { type: "line", line: "Working out features, roles, flows and rules…" }]);
      parts.push([2200, { type: "understanding", card }]);
      parts.push(() => ({ step: "requirement", source: "flows", kind: "many", text: `I found ${card.flows.length} flows in the document. Which ones should I test?`, why: "A flow you don't tick gets no sanity run and no cases.", options: card.flows.map((f) => ({ value: f.id, label: f.name, means: `${f.steps.length} steps, ends with: ${f.endState}` })), suggested: card.flows.map((f) => f.id).join(","), blocking: false }));
      parts.push([400, { type: "questions", questions: card.questions }]);
      parts.push(() => ({ step: "requirement", source: "prd", kind: "yes-no", text: "The document doesn't say whether a second counter offer may follow a rejected one. Should I assume it may?", why: "Yes adds a second-offer flow and its cases; No adds a refusal case.", options: [{ value: "yes", label: "Yes, assume it may", means: "a second-offer flow is added" }, { value: "no", label: "No, one offer per bid", means: "a refusal case is added" }, { value: "unknown", label: "I don't know", means: "left as an open question" }], suggested: "yes", blocking: false }));
      parts.push([200, { type: "done", session: { id: s.id, step: "requirement" } }]);
      s.understanding = card; touch(s, "requirement");
      return sse(sid, parts);
    },
    "GET /api/session/:id/understanding": async (_, sid) => ({ card: session(sid).understanding }),
    "POST /api/session/:id/answer": async (body, sid) => {
      const s = session(sid); const q = (s.understanding?.questions || []).find((x) => x.id === body.questionId);
      if (q) { if (body.skip) q.skipped = true; else q.answer = String(body.answer ?? ""); }
      touch(s); return { card: s.understanding };
    },
    "POST /api/session/:id/apply": (_, sid) => {
      const s = session(sid); const u = s.understanding; const answered = (u?.questions || []).filter((q) => q.answer && !q.applied);
      const parts = [[400, { type: "line", line: `Applying ${answered.length} answer${answered.length === 1 ? "" : "s"}…` }]];
      for (const q of answered) { q.applied = true; const n = u.rules.length + 1; if (q.id === "Q1") u.rules.push({ id: `R${n}`, text: /yes|can|allowed/i.test(q.answer) ? "After a rejection, a second counter offer can be sent on the same bid." : "After a rejection, no second counter offer can be sent on the same bid.", kind: "rule", source: `answer to ${q.id}`, feature: "F1" }); else if (q.id === "Q2") u.rules.push({ id: `R${n}`, text: /own|its own|separate/i.test(q.answer) ? "A counter offer has its own expiry, set when it is sent." : "A counter offer expires with the event's close time.", kind: "timing", source: `answer to ${q.id}`, feature: "F1" }); else u.rules.push({ id: `R${n}`, text: `${q.answer}`, kind: "rule", source: `answer to ${q.id}`, feature: "F1" }); }
      u.version = (u.version || 1) + 1; u.at = now(); touch(s);
      parts.push([900, { type: "understanding", card: u }]); parts.push([100, { type: "done" }]);
      return sse(sid, parts);
    },
    "GET /api/session/:id/questions": async (_, sid) => { const qs = session(sid).questions || []; return { questions: qs, open: qs.filter((q) => !q.answeredAt).length }; },
    "POST /api/session/:id/questions/answer": async (body, sid) => answerQ(session(sid), body.qid, body.answer, !!body.skip),
    "GET /api/session/:id/questions/stream": (_, sid) => questionsStream(sid),
    "POST /api/session/:id/sanity": (body, sid) => {
      const s = session(sid); const wanted = body.flowIds?.length ? body.flowIds : (s.understanding?.flows || []).map((f) => f.id);
      const flows = (s.understanding?.flows || []).filter((f) => wanted.includes(f.id));
      const parts = []; const results = [];
      for (const f of flows) {
        parts.push([300, { type: "flow-start", id: f.id, name: f.name, steps: f.steps.length }]);
        f.steps.forEach((st, i) => { parts.push([700 + i * 150, { type: "line", id: f.id, line: `${i + 1}/${f.steps.length} ${st}` }]); parts.push([200, { type: "frame", id: f.id, frame: "" }]); });
        if (f.id === "FL3") parts.push(() => ({ step: "sanity", source: "sanity", kind: "one", text: "I couldn't close the RFQ early because this company has no force-end setting. Skip this flow, or try again after you change it?", why: "The step after the close cannot be reached until the RFQ is closed.", options: [{ value: "skip", label: "Skip it", means: "the flow reads Couldn't reach" }, { value: "retry", label: "Try again", means: "the flow runs once more" }], suggested: "skip", blocking: true, ifNoAnswer: "I'll skip it." }));
        const verdict = f.id === "FL2" ? "broken" : f.id === "FL3" ? "couldn't reach" : "works";
        const flow = { id: f.id, name: f.name, verdict, why: verdict === "works" ? "Every step did what the flow says; the vendor saw Accepted." : verdict === "broken" ? "The buyer's screen kept showing Sent after the vendor rejected; Rejected never appeared." : "The RFQ could not be closed early on this company (no force-end), so the step after it was not reached.", blockers: verdict === "couldn't reach" ? ["Closing an RFQ early needs the force-end setting, which is hidden on this company"] : [], shots: [`sanity-${f.id}-1.jpg`, `sanity-${f.id}-2.jpg`], steps: f.steps.map((st, i) => ({ n: i + 1, words: st, outcome: verdict === "couldn't reach" && i === 0 ? "failed" : verdict === "broken" && i === f.steps.length - 1 ? "failed" : "done" })) };
        results.push(flow); parts.push([600, { type: "flow-done", flow }]);
      }
      const result = { flows: results, tally: { works: results.filter((r) => r.verdict === "works").length, broken: results.filter((r) => r.verdict === "broken").length, unreached: results.filter((r) => r.verdict === "couldn't reach").length }, runId: id("run"), at: now() };
      parts.push([200, { type: "done", result }]);
      s.sanity = result; touch(s, "sanity");
      return sse(sid, parts);
    },
    "GET /api/session/:id/sanity": async (_, sid) => ({ result: session(sid).sanity }),
    "POST /api/session/:id/sanity/accept": async (_, sid) => { const s = session(sid); if (s.sanity) s.sanity.accepted = true; return touch(s, "cases"); },
    "POST /api/session/:id/generate": (body, sid) => {
      const s = session(sid); const kinds = body.kinds?.length ? body.kinds : ["happy"]; const per = body.depth === "deep" ? 5 : body.depth === "quick" ? 2 : 3;
      const parts = []; const sections = []; const rows = []; let total = 0;
      parts.push([400, { type: "line", line: `Planning ${kinds.length} section${kinds.length === 1 ? "" : "s"} at ${body.depth || "standard"} depth…` }]);
      kinds.forEach((k, ki) => {
        const basis = KINDS.find((x) => x.kind === k)?.basis || `Cases of kind ${k}.`;
        parts.push([500, { type: "section-start", kind: k, basis, planned: per }]);
        const ids = [];
        for (let i = 0; i < per; i++) {
          const cid = `TC-${String(ki + 1).padStart(2, "0")}.${String(i + 1).padStart(2, "0")}`; ids.push(cid);
          const toConfirm = k === "edge" && i === 1;
          const row = { id: cid, module: "Counter offer", scenario: `${k[0].toUpperCase()}${k.slice(1)} · ${["send", "accept", "reject", "expire", "permission"][i % 5]}`, title: k === "happy" ? "Send a counter offer and the vendor accepts it; the bid shows the counter price" : k === "negative" ? 'Send a counter price higher than the bid; the app refuses with "Counter price must be lower"' : k === "edge" ? (toConfirm ? "Send a counter price equal to the bid; record what the app does" : "Send a counter offer at the event's close time; record what the app does") : k === "regression" ? "Vendor sees the counter offer on the portal after the buyer sends it (ticket 331668324073)" : "Try the counter offer as a viewer; the button is not shown", role: "Buyer", portal: "Buyer portal", pre: "A live RFQ with one bid from QA_Platform Vendor 1", configs: "counter_offer_enabled = On — counter offers", data: "Bid 1,000 · counter 900", steps: ["Log in to Procol (buyer side) with the buyer user", "Open the live RFQ and its Responses", "On QA_Platform Vendor 1's bid click \"Counter offer\", type 900, send"], expected: "The bid row shows Counter offer sent · 900, and the vendor portal shows the offer", priority: i === 0 ? "P0" : "P1", type: k, basis, source: toConfirm ? "to confirm" : "PRD §2.1", existing: i === 1 && k === "happy", settings: ["counter_offer_enabled"] };
          rows.push(row); parts.push([600, { type: "case", row }]);
          if (toConfirm) parts.push(() => ({ step: "cases", source: "cases", kind: "text", text: `For case ${cid} the document doesn't say what should happen when the counter price equals the bid. What should happen?`, why: "The case's expected result is written from your answer.", options: [], suggested: "", blocking: false }));
        }
        parts.push([200, { type: "section-done", kind: k, count: per, existing: k === "happy" ? 1 : 0, note: k === "happy" ? "1 case already in the catalog is marked, not written twice." : undefined }]);
        sections.push({ kind: k, basis, count: per, existing: k === "happy" ? 1 : 0, caseIds: ids }); total += per;
      });
      const generation = { kinds, depth: body.depth || "standard", sections, total, rows, at: now() };
      parts.push([200, { type: "done", generation }]);
      s.generation = generation; touch(s, "cases");
      return sse(sid, parts);
    },
    "GET /api/session/:id/generation": async (_, sid) => ({ generation: session(sid).generation }),
    "GET /api/session/:id/review": async (_, sid) => { const s = session(sid); const g = s.generation; return { sheet: s.review?.sheet || null, cases: g?.rows || [], sections: g?.sections || [], frozen: !!s.review?.sheet }; },
    "POST /api/session/:id/review": async (body, sid) => {
      const s = session(sid); const g = s.generation; const drops = new Set(body.drops || []); let edited = 0;
      for (const e of body.edits || []) { const r = g?.rows.find((x) => x.id === e.id); if (r) { Object.assign(r, e.patch); edited++; } }
      if (g) g.rows = g.rows.filter((r) => !drops.has(r.id));
      const out = { edited, dropped: drops.size };
      if (body.approve) { const v = (s.review?.sheet?.version || 0) + 1; const name = `${(s.understanding?.title || "cases").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-v${v}`; s.review = { sheet: { id: id("sheet"), name, version: v, count: g?.rows.length || 0 }, approvedAt: now(), merged: s.review?.merged || 0 }; out.sheet = s.review.sheet; touch(s, "review"); } else touch(s);
      return out;
    },
    "POST /api/session/:id/merge": async (body, sid) => { const s = session(sid); const added = 9; s.review = { ...(s.review || {}), merged: (s.review?.merged || 0) + added }; touch(s); return { added, duplicates: [{ id: "SRC-014", title: "Send a counter offer on a live bid", matches: ["TC-01.01"] }, { id: "SRC-022", title: "Counter price above the bid is refused", matches: ["TC-02.02", "TC-02.03"] }] }; },
    "POST /api/session/:id/run": (body, sid) => {
      const s = session(sid); let rows = s.generation?.rows || [];
      if (body.scope === "p0p1") rows = rows.filter((r) => /P[01]/.test(r.priority)); if (body.scope === "sections") rows = rows.filter((r) => (body.sections || []).includes(r.type));
      const parts = []; const results = []; const runId = id("run");
      parts.push(() => ({ step: "run", source: "run", kind: "one", text: `${rows.length > 7 ? 7 : rows.length} cases need a company setting I can only switch on PROCOL DEMO. Run them anyway, leave them out this time, or stop?`, why: "On another company they would come back Couldn't tell.", options: [{ value: "run", label: "Run them anyway", means: "they likely read Couldn't tell" }, { value: "leave", label: "Leave them out this time", means: "the rest run now" }, { value: "stop", label: "Stop", means: "nothing runs" }], suggested: "run", blocking: true, ifNoAnswer: "I'll run them anyway." }));
      parts.push([300, { type: "queued", position: 0, line: "No other browser run is going; starting now." }]);
      rows.forEach((r, i) => {
        parts.push([300, { type: "case-start", id: r.id, title: r.title, index: i + 1, total: rows.length }]);
        r.steps.forEach((st, k) => { parts.push([600, { type: "line", id: r.id, line: `${k + 1}/${r.steps.length} ${st}` }]); parts.push([150, { type: "frame", id: r.id, frame: "" }]); });
        const status = i % 4 === 2 ? "Fail" : i % 5 === 4 ? "Couldn't tell" : "Pass";
        const result = { id: r.id, title: r.title, status, why: status === "Pass" ? "The screen showed what the case expects." : status === "Fail" ? "At step 3 the bid row still showed the vendor's price after the counter offer was sent." : "The vendor portal did not load within the wait, so the last check was not made.", shots: [`case-${r.id}.jpg`], bugId: status === "Fail" ? `BUG-${String(i + 1).padStart(2, "0")}` : null, ms: 42000 + i * 1300 };
        results.push(result); parts.push([500, { type: "case-done", result }]);
      });
      const tally = { pass: results.filter((r) => r.status === "Pass").length, fail: results.filter((r) => r.status === "Fail").length, unsure: results.filter((r) => r.status === "Couldn't tell").length, notRun: 0, total: results.length };
      parts.push([300, { type: "done", runId, tally, report: `#/mock/report/${runId}`, workbook: `#/mock/workbook/${runId}` }]);
      s.execution = { runs: [...(s.execution?.runs || []), { id: runId, at: now(), tally, results, report: `#/mock/report/${runId}`, workbook: `#/mock/workbook/${runId}` }], latest: runId }; touch(s, "run");
      return sse(sid, parts);
    },
    "POST /api/session/:id/rerun": (body, sid) => {
      const s = session(sid); const r = (s.generation?.rows || []).find((x) => x.id === body.caseId); if (!r) throw new Error("No such case");
      const parts = [[300, { type: "case-start", id: r.id, title: r.title, index: 1, total: 1 }], [900, { type: "line", id: r.id, line: "Built a fresh live RFQ with one bid by API" }]];
      r.steps.forEach((st, k) => parts.push([600, { type: "line", id: r.id, line: `${k + 1}/${r.steps.length} ${st}` }]));
      const result = { id: r.id, title: r.title, status: "Pass", why: "On a fresh event the screen showed what the case expects.", shots: [`case-${r.id}-again.jpg`], bugId: null, ms: 38000 };
      const runId = id("run");
      parts.push([500, { type: "case-done", result }]); parts.push([200, { type: "done", runId }]);
      const last = s.execution?.runs?.at(-1); if (last) { const i = last.results.findIndex((x) => x.id === r.id); if (i >= 0) last.results[i] = result; }
      touch(s);
      return sse(sid, parts);
    },
    "GET /api/session/:id/report": async (_, sid) => {
      const s = session(sid); const runs = s.execution?.runs || []; const last = runs.at(-1);
      return { sheet: s.review?.sheet || null, runs: runs.map((r) => ({ id: r.id, at: r.at, tally: r.tally, report: r.report, workbook: r.workbook })), tally: last?.tally || { pass: 0, fail: 0, unsure: 0, notRun: 0, total: 0 }, latest: last ? Object.fromEntries(last.results.map((r) => [r.id, r])) : {}, bugs: last ? last.results.filter((r) => r.bugId).map((r) => ({ id: r.bugId, caseId: r.id, line: r.why, priority: "P2", module: "Counter offer", standing: true })) : [], queued: null };
    },
  };

  /** Match "METHOD /api/session/<id>/thing[?qs]" to a route with :id. */
  function call(method, path, body) {
    const [clean, q] = path.split("?"); const qs = new URLSearchParams(q || "");
    for (const key of Object.keys(routes)) {
      const [m, pat] = key.split(" ");
      if (m !== method) continue;
      const re = new RegExp("^" + pat.replace(/:id/g, "([^/]+)") + "$");
      const mm = clean.match(re);
      if (mm) return routes[key](body || {}, mm[1], qs);
    }
    throw new Error(`The mock has no route for ${method} ${path}`);
  }
  window.spineGuidedMock = { call, reset() { localStorage.removeItem(KEY); location.reload(); }, db };
})();
