/**
 * THE MOCK OF THE GUIDED-SESSION API (Track B, section 10.2). Loaded only with ?mock=1 — it answers every
 * /api/session/ route with realistic data and timed SSE lines, so every screen can be built and demoed before
 * Animesh's backend exists. Nothing here touches the server. Sessions live in localStorage (spine.guided.mock)
 * so Resume works across reloads. Same shapes as the contract; a field added here is a field to add there.
 */
(function () {
  "use strict";
  const KEY = "spine.guided.mock";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const now = () => new Date().toISOString();
  const id = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null") || seed(); } catch { return seed(); }
  }
  function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} }
  function seed() {
    const db = { sessions: {}, profiles: [
      { id: "prof-uat-demo", label: "PROCOL DEMO · UAT", url: "https://uat.procol.app", companyId: 198678, companyName: "PROCOL DEMO", signIn: "console", snapshotAt: "2026-11-11T06:40:00.000Z", gates: ["lock_vendors_addition_in_event_creation = Off", "boq_enabled = Off", "allowed_maximum_line_items = 50"], vendors: 4, hidden: ["approval_workflow_v2"] },
      { id: "prof-uat-laxmi", label: "Laxmi Organics · UAT", url: "https://uat.procol.app", companyId: 38158, companyName: "Laxmi Organics", signIn: "otp", snapshotAt: "2026-11-10T13:05:00.000Z", gates: ["lock_vendors_addition_in_event_creation = On", "boq_enabled = On"], vendors: 0, hidden: [] },
    ] };
    const s1 = blank("Counter offer on a live RFQ"); s1.step = "cases"; s1.updatedAt = "2026-11-11T09:12:00.000Z";
    s1.env = profileEnv(db.profiles[0]); s1.intake = { prd: { kind: "pdf", title: "Counter offer v2", chars: 18400 }, figma: null, sheet: null };
    s1.understanding = understandingFor("Counter offer");
    const s2 = blank("Awarding with Master QCS"); s2.step = "environment"; s2.updatedAt = "2026-11-10T16:30:00.000Z";
    db.sessions[s1.id] = s1; db.sessions[s2.id] = s2;
    return db;
  }
  function blank(name) {
    return { id: id("gs"), name: name || "Untitled session", step: "environment", createdAt: now(), updatedAt: now(), env: null, intake: null, understanding: null, sanity: null, generation: null, review: null, execution: null };
  }
  function profileEnv(p) {
    return { profileId: p.id, url: p.url, companyId: p.companyId, companyName: p.companyName, signIn: p.signIn, snapshot: { settings: Object.fromEntries(p.gates.map((g) => g.split(" = "))), hidden: p.hidden, gates: p.gates, vendors: p.vendors } };
  }
  function understandingFor(feature) {
    return {
      features: [feature, `${feature} — vendor side`, "Notifications"],
      roles: ["Buyer (event owner)", "Vendor", "Approver"],
      flows: [
        { id: "f1", name: "Buyer sends a counter offer on a live RFQ bid", steps: ["Open the live RFQ", "Open Bids", "Pick the vendor's bid", "Send a counter offer with a lower price", "Vendor accepts on the portal"], layer: "UI" },
        { id: "f2", name: "Vendor rejects the counter offer", steps: ["Vendor opens the offer", "Rejects it", "Buyer sees Rejected"], layer: "UI" },
        { id: "f3", name: "Counter offer after the event closes is refused", steps: ["Close the RFQ", "Try to send a counter offer"], layer: "API" },
      ],
      rules: [
        { id: "R1", text: "A counter offer can only be sent on a bid of a live RFQ.", kind: "rule", source: "PRD §2.1" },
        { id: "R2", text: "The counter price must be lower than the vendor's bid price.", kind: "limit", source: "PRD §2.3" },
        { id: "R3", text: "Only the event owner and users with the Counter offer permission can send one.", kind: "role", source: "PRD §3" },
        { id: "R4", text: "The vendor sees the offer on the portal within a minute and gets an e-mail.", kind: "timing", source: "PRD §4" },
        { id: "R5", text: "A rejected offer shows Rejected to the buyer with the vendor's reason.", kind: "message", source: "PRD §4.2" },
      ],
      states: ["Sent", "Accepted", "Rejected", "Expired"],
      data: ["<LIVE_RFQ> with a bid from a QA vendor", "<COUNTER_PRICE> lower than the bid"],
      outOfScope: ["Auctions", "RFP technical rounds"],
      questions: [
        { id: "q1", text: "Can a counter offer be sent twice on the same bid after the first is rejected?" },
        { id: "q2", text: "Does the offer expire with the event's close time, or does it have its own?" },
        { id: "q3", text: "Is the counter price per line item or for the whole bid?" },
      ],
    };
  }

  const db = load();
  const session = (sid) => { const s = db.sessions[sid]; if (!s) throw new Error("No such session"); return s; };
  const touch = (s, step) => { if (step) s.step = step; s.updatedAt = now(); save(db); return s; };

  /** SSE as an async generator of {type, ...} lines, paced like the real thing. */
  async function* sse(lines) {
    for (const [ms, line] of lines) { await sleep(ms); yield line; }
  }

  const routes = {
    "POST /api/session/start": async ({ name }) => { const s = blank(name); db.sessions[s.id] = s; save(db); return { id: s.id, step: "environment" }; },
    "GET /api/session/list": async () => ({ sessions: Object.values(db.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((s) => ({ id: s.id, name: s.name, step: s.step, env: s.env ? `${s.env.companyName} · ${s.env.url.replace(/^https?:\/\//, "")}` : undefined, feature: s.intake?.prd?.title, updatedAt: s.updatedAt })) }),
    "GET /api/session/:id": async (_, sid) => session(sid),
    "PATCH /api/session/:id": async (body, sid) => { const s = session(sid); if (body.name) s.name = String(body.name).slice(0, 120); return touch(s); },
    "DELETE /api/session/:id": async (_, sid) => { delete db.sessions[sid]; save(db); return { ok: true }; },
    "GET /api/session/env/profiles": async () => ({ profiles: db.profiles }),
    "POST /api/session/:id/env": (body, sid) => {
      const s = session(sid);
      const bad = !/^https?:\/\//i.test(body.url || "");
      const known = db.profiles.find((p) => String(p.companyId) === String(body.companyId));
      const companyName = known?.companyName || (body.companyId ? `Company ${body.companyId}` : "PROCOL DEMO");
      if (bad) return sse([[300, { type: "reach", ok: false, why: "That is not a web address. It should start with https://" }], [50, { type: "error", why: "The environment could not be reached, so nothing was checked. Fix the address and try again." }]]);
      if (/down\.|refused/i.test(body.url)) return sse([[900, { type: "reach", ok: false, ms: 900, why: "No answer from that address in 900 ms." }], [50, { type: "error", why: `Nothing answered at ${body.url}. Check the address, or the VPN if it is an internal environment.` }]]);
      const profile = { id: id("prof"), label: `${companyName} · ${body.url.replace(/^https?:\/\//, "").split("/")[0]}`, url: body.url, companyId: Number(body.companyId) || 198678, companyName, signIn: body.signIn || "console", snapshotAt: now(), gates: ["lock_vendors_addition_in_event_creation = Off", "boq_enabled = Off", "allowed_maximum_line_items = 50", "erfx_enabled = On"], vendors: body.companyId && String(body.companyId) !== "198678" ? 0 : 4, hidden: ["approval_workflow_v2", "quick_fill"] };
      const lines = [
        [400, { type: "reach", ok: true, ms: 412, line: `Reached ${body.url} in 412 ms` }],
        [1200, { type: "signin", ok: true, as: body.signIn === "otp" ? "the buyer's phone (OTP)" : body.signIn === "token" ? `the saved token ${body.tokenName || "PROCOL_TOKEN"}` : "Procol Support (console session)", line: `Signed in as ${body.signIn === "otp" ? "the buyer, by one-time code" : body.signIn === "token" ? "the saved token" : "Procol Support, through the console"}` }],
        [1500, { type: "settings", count: 23, hidden: profile.hidden, gates: profile.gates, line: `Read 23 company settings · 2 are hidden and stay as they are` }],
        [900, { type: "vendors", count: profile.vendors, names: profile.vendors ? ["QA Vendor A", "QA Vendor B", "QA Vendor C", "QA Vendor D"] : [], line: profile.vendors ? `${profile.vendors} QA test vendors are ready to bid` : "No QA test vendors on this company — bids cannot be placed here" }],
        [300, { type: "done", profile }],
      ];
      db.profiles.unshift(profile); s.env = profileEnv(profile); touch(s, "requirement");
      return sse(lines);
    },
    "POST /api/session/:id/intake": (body, sid) => {
      const s = session(sid);
      const title = body.title || (body.file ? body.file.replace(/\.[a-z0-9]+$/i, "") : "Pasted requirement");
      const chars = body.chars || 9200;
      if (chars < 200) return sse([[400, { type: "parsed", kind: "text", chars }], [300, { type: "error", why: "That is too short to be a requirement — under 200 characters came out of it. Paste the whole document." }]]);
      const u = understandingFor(title.replace(/ v\d.*$/i, ""));
      s.intake = { prd: { kind: body.kind || "text", title, chars }, figma: body.figma ? { file: "Counter offer flows", frames: 6, labels: ["Bids list", "Counter offer drawer", "Vendor portal · Offer"] } : null, sheet: body.sheet ? { id: id("sheet"), count: 14 } : null };
      s.understanding = u; touch(s, "requirement");
      return sse([[600, { type: "parsed", kind: s.intake.prd.kind, chars, pages: body.kind === "pdf" ? 7 : undefined, frames: body.figma ? 6 : undefined }], [2200, { type: "understanding", card: u }], [400, { type: "questions", questions: u.questions }], [100, { type: "done" }]]);
    },
    "POST /api/session/:id/answer": async (body, sid) => {
      const s = session(sid); const q = s.understanding?.questions.find((x) => x.id === body.questionId);
      if (q) { q.answer = body.skip ? "(skipped)" : body.answer; if (!body.skip && q.id === "q1") s.understanding.rules.push({ id: `R${s.understanding.rules.length + 1}`, text: `After a rejection, ${/yes|can|allowed/i.test(body.answer) ? "a second counter offer can be sent on the same bid" : "no second counter offer can be sent on the same bid"}.`, kind: "rule", source: "Your answer" }); }
      touch(s); return { card: s.understanding };
    },
    "POST /api/session/:id/sanity": (body, sid) => {
      const s = session(sid); const flows = (s.understanding?.flows || []).filter((f) => body.flowIds.includes(f.id));
      const lines = []; const results = [];
      for (const f of flows) {
        lines.push([300, { type: "flow-start", id: f.id, name: f.name }]);
        f.steps.forEach((st, i) => lines.push([900 + i * 200, { type: "line", id: f.id, line: `${i + 1}. ${st}` }]));
        const verdict = f.id === "f2" ? "broken" : f.id === "f3" ? "couldn't reach" : "works";
        const r = { id: f.id, verdict, why: verdict === "works" ? "Every step did what the flow says; the vendor saw Accepted." : verdict === "broken" ? "The buyer's screen kept showing Sent after the vendor rejected; Rejected never appeared." : "The RFQ could not be closed early on this company (no force-end), so the step after it was not reached.", shots: ["sanity-f-1.jpg", "sanity-f-2.jpg"], blockers: verdict === "couldn't reach" ? ["Closing an RFQ early needs the force-end setting, which is hidden on this company"] : [], runId: id("run") };
        results.push(r); lines.push([700, { type: "flow-done", ...r }]);
      }
      lines.push([200, { type: "done" }]);
      s.sanity = { flows: results }; touch(s, "cases");
      return sse(lines);
    },
    "POST /api/session/:id/generate": (body, sid) => {
      const s = session(sid); const kinds = body.kinds || ["happy"]; const per = body.depth === "deep" ? 5 : body.depth === "quick" ? 2 : 3;
      const basis = { happy: "One case per flow in the understanding, in the order a buyer does it (PRD §2).", negative: "Each rule turned around: the wrong state, the wrong value, the wrong user (PRD §2.3, §3).", edge: "The limits the PRD names: equal price, zero, the close time itself (PRD §2.3, §4).", permission: "Each role tries what it must not be able to do (PRD §3).", state: "Every state the offer can be in, and what each one allows (PRD §4).", settings: "The company settings the feature depends on, on and off.", data: "The records the feature relies on renamed, deactivated and deleted.", timing: "The windows the PRD names: a minute to the portal, the event's close.", visibility: "What each role sees on each screen, and what it must not.", api: "The same rules through the API, with the refusal codes.", design: "Every frame in the Figma file, control by control." };
      const lines = []; const sections = []; let n = 0; let total = 0; const rows = [];
      kinds.forEach((k, ki) => {
        lines.push([500, { type: "section-start", kind: k, basis: basis[k] || `Cases of kind ${k}.`, planned: per }]);
        const ids = [];
        for (let i = 0; i < per; i++) {
          n++; const cid = `TC-${String(ki + 1).padStart(2, "0")}.${String(i + 1).padStart(2, "0")}`; ids.push(cid);
          const row = { id: cid, module: "Counter offer", scenario: `${k[0].toUpperCase()}${k.slice(1)} · ${["send", "accept", "reject", "expire", "permission"][i % 5]}`, title: k === "happy" ? `Send a counter offer and the vendor accepts it — the bid shows the counter price` : k === "negative" ? `Send a counter price higher than the bid — the app refuses with "Counter price must be lower"` : k === "edge" ? `Send a counter price equal to the bid — the app refuses it` : `Try the counter offer as a viewer — the button is not shown`, role: "Buyer", portal: "Console", pre: "A live RFQ with one bid from QA Vendor A", configs: "lock_vendors_addition_in_event_creation = Off", data: "Bid ₹1,000 · counter ₹900", steps: ["Open the live RFQ", "Open Bids and pick QA Vendor A's bid", "Press Counter offer, type 900, send"], expected: "The bid row shows Counter offer sent · ₹900, and the vendor portal shows the offer", priority: i === 0 ? "P0" : "P1", type: k, why: basis[k], source: "PRD §2.1", existing: i === 1 && k === "happy" };
          rows.push(row); lines.push([650, { type: "case", row }]);
        }
        lines.push([200, { type: "section-done", kind: k, count: per, existing: k === "happy" ? 1 : 0 }]);
        sections.push({ kind: k, basis: basis[k], count: per, existing: k === "happy" ? 1 : 0, caseIds: ids }); total += per;
      });
      lines.push([200, { type: "done", total }]);
      s.generation = { kinds, depth: body.depth || "standard", sections, total, rows }; touch(s, "review");
      return sse(lines);
    },
    "POST /api/session/:id/review": async (body, sid) => { const s = session(sid); const dropped = new Set(body.drops || []); for (const e of body.edits || []) { const r = s.generation?.rows.find((x) => x.id === e.id); if (r) Object.assign(r, e.patch); } s.review = { sheetId: id("sheet"), version: (s.review?.version || 0) + 1, approved: !!body.approve, dropped: [...dropped], merged: s.review?.merged || 0 }; if (s.generation) s.generation.rows = s.generation.rows.filter((r) => !dropped.has(r.id)); touch(s, body.approve ? "run" : "review"); return { sheet: { id: s.review.sheetId, version: s.review.version, count: s.generation?.rows.length || 0 } }; },
    "POST /api/session/:id/merge": async (body, sid) => { const s = session(sid); const added = 9; s.review = { ...(s.review || { sheetId: id("sheet"), version: 1, approved: false, dropped: [] }), merged: added }; touch(s); return { added, duplicates: [{ id: "SRC-014", matches: ["TC-01.01"] }, { id: "SRC-022", matches: ["TC-02.02", "TC-02.03"] }] }; },
    "POST /api/session/:id/run": (body, sid) => {
      const s = session(sid); let rows = s.generation?.rows || []; if (body.scope === "p0p1") rows = rows.filter((r) => /P[01]/.test(r.priority)); if (body.scope === "sections") rows = rows.filter((r) => (body.sections || []).includes(r.type));
      const lines = []; const results = [];
      rows.forEach((r, i) => {
        lines.push([300, { type: "case-start", id: r.id, title: r.title }]);
        r.steps.forEach((st, k) => lines.push([700, { type: "line", id: r.id, line: `${k + 1}. ${st}` }]));
        lines.push([400, { type: "frame", id: r.id, frame: "" }]);
        const status = i % 4 === 2 ? "Fail" : i % 5 === 4 ? "Couldn't tell" : "Pass";
        const res = { id: r.id, status, why: status === "Pass" ? "The screen showed what the case expects." : status === "Fail" ? "The bid row still shows the vendor's price after the counter offer was sent." : "The vendor portal did not load within the wait, so the last check was not made.", shots: [`case-${r.id}.jpg`], bugId: status === "Fail" ? `BUG-${String(i + 1).padStart(2, "0")}` : null };
        results.push(res); lines.push([500, { type: "case-done", ...res }]);
      });
      const runId = id("run"); lines.push([300, { type: "done", runId }]);
      s.execution = { runIds: [...(s.execution?.runIds || []), runId], tally: { pass: results.filter((r) => r.status === "Pass").length, fail: results.filter((r) => r.status === "Fail").length, unsure: results.filter((r) => r.status === "Couldn't tell").length, total: results.length }, bugIds: results.filter((r) => r.bugId).map((r) => r.bugId), results }; touch(s, "run");
      return sse(lines);
    },
    "GET /api/session/:id/report": async (_, sid) => { const s = session(sid); const e = s.execution || { runIds: [], tally: { pass: 0, fail: 0, unsure: 0, total: 0 }, bugIds: [], results: [] }; return { runs: e.runIds, tally: e.tally, bugs: e.results.filter((r) => r.bugId).map((r) => ({ id: r.bugId, line: r.why, caseId: r.id, priority: "P2", module: "Counter offer" })), results: e.results, workbook: `#/mock/workbook/${e.runIds.at(-1) || "none"}` }; },
  };

  /** Match "METHOD /api/session/<id>/thing" to a route with :id. */
  function call(method, path, body) {
    const clean = path.split("?")[0];
    for (const key of Object.keys(routes)) {
      const [m, pat] = key.split(" ");
      if (m !== method) continue;
      const re = new RegExp("^" + pat.replace(/:id/g, "([^/]+)") + "$");
      const mm = clean.match(re);
      if (mm) return routes[key](body || {}, mm[1]);
    }
    throw new Error(`The mock has no route for ${method} ${path}`);
  }
  window.spineGuidedMock = { call, reset() { localStorage.removeItem(KEY); location.reload(); } };
})();
